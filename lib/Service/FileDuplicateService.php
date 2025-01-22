<?php

namespace OCA\DuplicateFinder\Service;

use OCP\IUser;
use Psr\Log\LoggerInterface;
use OCP\AppFramework\Db\Entity;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\NotFoundException;
use OCP\Lock\ILockingProvider;

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
    /** @var ?string */
    private $currentUserId = null;
    /** @var ILockingProvider */
    private $lockingProvider;

    public function __construct(
        LoggerInterface $logger,
        FileDuplicateMapper $mapper,
        FileInfoService $fileInfoService,
        OriginFolderService $originFolderService,
        ILockingProvider $lockingProvider
    ) {
        $this->mapper = $mapper;
        $this->logger = $logger;
        $this->fileInfoService = $fileInfoService;
        $this->originFolderService = $originFolderService;
        $this->lockingProvider = $lockingProvider;
    }

    public function setCurrentUserId(?string $userId): void {
        $this->currentUserId = $userId;
        if ($this->originFolderService !== null) {
            $this->originFolderService->setUserId($userId);
        }
    }

    /**
     * @return FileDuplicate
     */
    public function enrich(FileDuplicate $duplicate): FileDuplicate
    {
        $files = $duplicate->getFiles();
        $this->logger->debug('Starting duplicate enrichment', [
            'hash' => $duplicate->getHash(),
            'fileCount' => count($files),
            'type' => $duplicate->getType(),
            'acknowledged' => $duplicate->getAcknowledged() ? 'true' : 'false'
        ]);
        
        // Track unique node IDs to prevent showing the same file multiple times
        $seenNodeIds = [];
        $uniqueFiles = [];
        
        // Iterate through each FileInfo object to enrich it
        foreach ($files as $key => $fileInfo) {
            $this->logger->debug('Processing file in duplicate group', [
                'path' => $fileInfo->getPath(),
                'hash' => $fileInfo->getFileHash(),
                'size' => $fileInfo->getSize(),
                'ignored' => $fileInfo->isIgnored() ? 'true' : 'false'
            ]);

            // Enrich the FileInfo object
            $files[$key] = $this->fileInfoService->enrich($fileInfo);
            
            // Skip if we've already seen this node ID (same physical file)
            if ($files[$key]->getNodeId() && isset($seenNodeIds[$files[$key]->getNodeId()])) {
                $this->logger->debug('Skipping duplicate node ID', [
                    'nodeId' => $files[$key]->getNodeId(),
                    'path' => $fileInfo->getPath(),
                    'hash' => $fileInfo->getFileHash()
                ]);
                continue;
            }
            
            if ($files[$key]->getNodeId()) {
                $seenNodeIds[$files[$key]->getNodeId()] = true;
            }
            
            // Store normalized path for logging
            $normalizedPath = preg_replace('#^/[^/]+/files/#', '/', $fileInfo->getPath());
            $this->logger->debug('Processing file path', [
                'original' => $fileInfo->getPath(),
                'normalized' => $normalizedPath,
                'nodeId' => $files[$key]->getNodeId()
            ]);
            
            // Check if file is in an origin folder
            $protectionInfo = $this->originFolderService->isPathProtected($normalizedPath);
            $files[$key]->setIsInOriginFolder($protectionInfo['isProtected']);
            
            $uniqueFiles[] = $files[$key];
        }

        $this->logger->debug('Completed duplicate enrichment', [
            'hash' => $duplicate->getHash(),
            'originalCount' => count($files),
            'uniqueCount' => count($uniqueFiles),
            'skippedCount' => count($files) - count($uniqueFiles)
        ]);

        // Sort the enriched FileInfo objects
        uasort($uniqueFiles, function (FileInfo $a, FileInfo $b) {
            return strnatcmp($a->getPath(), $b->getPath());
        });

        // Set the sorted and enriched FileInfo objects back to the duplicate
        $duplicate->setFiles(array_values($uniqueFiles));
        $this->logger->debug('Finished enriching duplicate with hash: {hash}, found {count} unique files', [
            'hash' => $duplicate->getHash(),
            'count' => count($uniqueFiles)
        ]);

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
        if ($user !== null) {
            $this->setCurrentUserId($user);
        }
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
        $this->logger->debug('FileDuplicateService::stripFilesWithoutAccessRights - Starting', [
            'user' => $user,
            'hash' => $duplicate->getHash(),
            'type' => $duplicate->getType()
        ]);
        
        $files = $this->fileInfoService->findByHash($duplicate->getHash(), $duplicate->getType());
        $this->logger->debug('FileDuplicateService::stripFilesWithoutAccessRights - Found files', [
            'total_files' => count($files)
        ]);

        $accessibleFiles = [];
        foreach ($files as $fileInfo) {
            $this->logger->debug('FileDuplicateService::stripFilesWithoutAccessRights - Checking file', [
                'path' => $fileInfo->getPath(),
                'owner' => $fileInfo->getOwner()
            ]);

            if ($this->fileInfoService->hasAccessRight($fileInfo, $user)) {
                $accessibleFiles[] = $fileInfo;
            }
        }

        $this->logger->debug('FileDuplicateService::stripFilesWithoutAccessRights - Results', [
            'accessible_count' => count($accessibleFiles),
            'total_count' => count($files)
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
        $this->logger->debug('Starting deletion of duplicate', [
            'hash' => $hash,
            'type' => $type
        ]);

        try {
            // Try to find the duplicate first
            $fileDuplicate = $this->mapper->find($hash, $type);
            
            $this->logger->debug('Found duplicate to delete', [
                'hash' => $hash,
                'type' => $type,
                'fileCount' => count($fileDuplicate->getFiles())
            ]);

            // Try to delete associated files first
            $files = $fileDuplicate->getFiles();
            $failedFiles = [];
            
            foreach ($files as $fileInfo) {
                try {
                    $this->logger->debug('Attempting to delete file info', [
                        'path' => $fileInfo->getPath(),
                        'hash' => $fileInfo->getFileHash()
                    ]);
                    
                    // Try to release any locks first
                    try {
                        $this->lockingProvider->releaseAll($fileInfo->getPath(), ILockingProvider::LOCK_SHARED);
                        $this->logger->debug('Released locks for file', [
                            'path' => $fileInfo->getPath()
                        ]);
                    } catch (\Exception $e) {
                        $this->logger->warning('Failed to release locks, continuing anyway', [
                            'path' => $fileInfo->getPath(),
                            'error' => $e->getMessage()
                        ]);
                    }

                    $this->fileInfoService->delete($fileInfo);
                } catch (\Exception $e) {
                    $this->logger->warning('Failed to delete file info, continuing with others', [
                        'path' => $fileInfo->getPath(),
                        'error' => $e->getMessage()
                    ]);
                    $failedFiles[] = $fileInfo->getPath();
                }
            }

            if (!empty($failedFiles)) {
                $this->logger->warning('Some files failed to delete', [
                    'hash' => $hash,
                    'failedFiles' => $failedFiles
                ]);
            }

            // Now delete the duplicate entry
            $this->logger->debug('Deleting duplicate entry', [
                'hash' => $hash,
                'type' => $type
            ]);
            
            $this->mapper->delete($fileDuplicate);
            
            $this->logger->debug('Successfully deleted duplicate', [
                'hash' => $hash,
                'type' => $type,
                'failedFiles' => count($failedFiles)
            ]);

            return $fileDuplicate;

        } catch (DoesNotExistException $e) {
            $this->logger->debug('Duplicate not found for deletion', [
                'hash' => $hash,
                'type' => $type,
                'error' => $e->getMessage()
            ]);
            return null;
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete duplicate', [
                'hash' => $hash,
                'type' => $type,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            throw new \RuntimeException('Failed to delete duplicate: ' . $e->getMessage(), 0, $e);
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