<?php

namespace OCA\DuplicateFinder\Service;

use OCP\IUser;
use Psr\Log\LoggerInterface;
use OCP\AppFramework\Db\Entity;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\NotFoundException;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileInfoService;

class FileDuplicateService
{

    /** @var FileDuplicateMapper */
    private $mapper;
    /** @var LoggerInterface */
    private $logger;
    /** @var FileInfoService */
    private $fileInfoService;

    public function __construct(
        LoggerInterface $logger,
        FileDuplicateMapper $mapper,
        FileInfoService $fileInfoService
    ) {
        $this->mapper = $mapper;
        $this->logger = $logger;
        $this->fileInfoService = $fileInfoService;
    }

    /**
     * @return FileDuplicate
     */
    public function enrich(FileDuplicate $duplicate): FileDuplicate
    {
        $files = $duplicate->getFiles();
        // Iterate through each FileInfo object to enrich it
        foreach ($files as $key => $fileInfo) {
            // Enrich the FileInfo object
            $files[$key] = $this->fileInfoService->enrich($fileInfo);
        }

        // Sort the enriched FileInfo objects
        uasort($files, function (FileInfo $a, FileInfo $b) {
            return strnatcmp($a->getPath(), $b->getPath());
        });

        // Set the sorted and enriched FileInfo objects back to the duplicate
        $duplicate->setFiles(array_values($files));

        return $duplicate;
    }

    /**
     * @param string|null $user
     * @param int|null $limit
     * @param int|null $offset
     * @param bool $enrich
     * @param array<array<string>> $orderBy
     * @return array<string, FileDuplicate|int|mixed>
     */
    public function findAll(
        ?string $type = null,
        ?string $user = null,
        int $page = 1,
        int $pageSize = 20,
        bool $enrich = false,
        ?array $orderBy = [['hash'], ['type']]
    ): array {
        $result = [];
        $isLastFetched = false;
        $entities = [];

        while (empty($entities) && !$isLastFetched) {
            $offset = ($page - 1) * $pageSize; // Calculate the offset based on the current page
            $entities = $this->mapper->findAll($user, $pageSize, $offset, $orderBy);

            foreach ($entities as $entity) {
                $entity = $this->stripFilesWithoutAccessRights($entity, $user);
                if ($enrich) {
                    $entity = $this->enrich($entity);
                }
                if (count($entity->getFiles()) > 1) {
                    if ($type === 'acknowledged' && $entity->isAcknowledged()) {
                        $result[] = $entity;
                    } else if ($type === 'unacknowledged' && !$entity->isAcknowledged()) {
                        $result[] = $entity;
                    } else if ($type === 'all') {
                        $result[] = $entity;
                    }
                }
            }

            $isLastFetched = count($entities) < $pageSize; // Determine if this is the last page
            if (empty($entities) && !$isLastFetched) {
                $page++; // Move to the next page if no entities found and not the last page
            }
        }

        return [
            "entities" => $result,
            "pageKey" => $offset,
            "isLastFetched" => $isLastFetched
        ];
    }

    private function stripFilesWithoutAccessRights(
        FileDuplicate $duplicate,
        ?string $user
    ): FileDuplicate {
        $files = $this->fileInfoService->findByHash($duplicate->getHash(), $duplicate->getType());
        $duplicate->setFiles($files);
        if (is_null($user)) {
            return $duplicate;
        }
        foreach ($duplicate->getFiles() as $fileId => $fileInfo) {
            if (is_string($fileInfo)) {
                continue;
            }
            if (!$this->fileInfoService->hasAccessRight($fileInfo, $user)) {
                $duplicate->removeDuplicate($fileId);
            }
        }
        unset($fileInfo);
        return $duplicate;
    }

    public function find(string $hash, string $type = 'file_hash'): FileDuplicate
    {
        return $this->mapper->find($hash, $type);
    }

    public function update(FileDuplicate $fileDuplicate): Entity
    {
        $fileDuplicate->setKeepAsPrimary(true);
        $fileDuplicate = $this->mapper->update($fileDuplicate);
        $fileDuplicate->setKeepAsPrimary(false);
        return $fileDuplicate;
    }

    public function getOrCreate(string $hash, string $type = 'file_hash'): FileDuplicate
    {
        try {
            $fileDuplicate = $this->mapper->find($hash, $type);
        } catch (\Exception $e) {
            if (!($e instanceof DoesNotExistException)) {
                $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
            }
            $fileDuplicate = new FileDuplicate($hash, $type);
            $fileDuplicate->setKeepAsPrimary(true);
            $fileDuplicate = $this->mapper->insert($fileDuplicate);
            $fileDuplicate->setKeepAsPrimary(false);
        }
        return $fileDuplicate;
    }

    public function delete(string $hash, string $type = 'file_hash'): ?FileDuplicate
    {
        try {
            $fileDuplicate = $this->mapper->find($hash, $type);
            $this->mapper->delete($fileDuplicate);
            return $fileDuplicate;
        } catch (DoesNotExistException $e) {
            return null;
        }
    }

    public function clear(): void
    {
        $this->mapper->clear();
    }

    public function getTotalCount(string $type = 'unacknowledged'): int
    {
        return $this->mapper->getTotalCount($type);
    }
}
