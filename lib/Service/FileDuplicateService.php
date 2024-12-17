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
use OCA\DuplicateFinder\Service\OriginFolderService;

class FileDuplicateService
{

    /** @var FileDuplicateMapper */
    private $mapper;
    /** @var LoggerInterface */
    private $logger;
    /** @var FileInfoService */
    private $fileInfoService;
    /** @var OriginFolderService */
    private $originFolderService;

    public function __construct(
        LoggerInterface $logger,
        FileDuplicateMapper $mapper,
        FileInfoService $fileInfoService,
        OriginFolderService $originFolderService
    ) {
        $this->mapper = $mapper;
        $this->logger = $logger;
        $this->fileInfoService = $fileInfoService;
        $this->originFolderService = $originFolderService;
    }

    /**
     * @return FileDuplicate
     */
    public function enrich(FileDuplicate $duplicate): FileDuplicate
    {
        $files = $duplicate->getFiles();
        $this->logger->debug('Enriching duplicate with hash: {hash}', ['hash' => $duplicate->getHash()]);
        
        // Iterate through each FileInfo object to enrich it
        foreach ($files as $key => $fileInfo) {
            // Enrich the FileInfo object
            $files[$key] = $this->fileInfoService->enrich($fileInfo);
            
            // Normalize path by removing /admin/files/ prefix
            $normalizedPath = preg_replace('#^/[^/]+/files/#', '/', $fileInfo->getPath());
            $this->logger->debug('Normalized path for file: {original} -> {normalized}', [
                'original' => $fileInfo->getPath(),
                'normalized' => $normalizedPath
            ]);
            
            // Check if file is in an origin folder
            $protectionInfo = $this->originFolderService->isPathProtected($normalizedPath);
            $files[$key]->setIsInOriginFolder($protectionInfo['isProtected']);
            $this->logger->debug('Protection status for file {path}: {status}', [
                'path' => $normalizedPath,
                'status' => $protectionInfo['isProtected'] ? 'protected' : 'not protected'
            ]);
        }

        // Sort the enriched FileInfo objects
        uasort($files, function (FileInfo $a, FileInfo $b) {
            return strnatcmp($a->getPath(), $b->getPath());
        });

        // Set the sorted and enriched FileInfo objects back to the duplicate
        $duplicate->setFiles(array_values($files));
        $this->logger->debug('Finished enriching duplicate with hash: {hash}', ['hash' => $duplicate->getHash()]);

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
        $this->logger->debug('Finding duplicates with parameters: type={type}, user={user}, page={page}, pageSize={pageSize}, enrich={enrich}', [
            'type' => $type ?? 'all',
            'user' => $user ?? 'none',
            'page' => $page,
            'pageSize' => $pageSize,
            'enrich' => $enrich ? 'true' : 'false'
        ]);

        $result = [];
        $isLastFetched = false;
        $entities = [];

        while (count($result) < $pageSize && !$isLastFetched) {
            $offset = ($page - 1) * $pageSize;
            $this->logger->debug('Fetching duplicates with offset={offset}, limit={limit}', [
                'offset' => $offset,
                'limit' => $pageSize
            ]);
            
            $entities = $this->mapper->findAll($user, $pageSize, $offset, $orderBy);

            foreach ($entities as $entity) {
                if ($user !== null) {
                    $entity = $this->stripFilesWithoutAccessRights($entity, $user);
                }
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

            $isLastFetched = count($entities) < $pageSize;
            if (count($result) < $pageSize && !$isLastFetched) {
                $page++;
                $this->logger->debug('Moving to next page: {page}', ['page' => $page]);
            }
        }

        $this->logger->debug('Found {count} duplicates', ['count' => count($result)]);
        return [
            "entities" => $result,
            "pageKey" => $offset,
            "isLastFetched" => $isLastFetched
        ];
    }

    private function stripFilesWithoutAccessRights(
        FileDuplicate $duplicate,
        string $user
    ): FileDuplicate {
        $this->logger->debug('Stripping files without access rights for user: {user}', ['user' => $user]);
        
        $files = $this->fileInfoService->findByHash($duplicate->getHash(), $duplicate->getType());
        $accessibleFiles = [];

        foreach ($files as $fileInfo) {
            if ($this->fileInfoService->hasAccessRight($fileInfo, $user)) {
                $accessibleFiles[] = $fileInfo;
            }
        }

        $this->logger->debug('Found {count} accessible files out of {total}', [
            'count' => count($accessibleFiles),
            'total' => count($files)
        ]);

        $duplicate->setFiles($accessibleFiles);
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