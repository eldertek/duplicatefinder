<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Event\NewFileInfoEvent;
use OCA\DuplicateFinder\Event\UpdatedFileInfoEvent;
use OCA\DuplicateFinder\Exception\UnableToCalculateHash;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;

class FileInfoService
{
    /** @var IEventDispatcher */
    private $eventDispatcher;
    /** @var FileInfoMapper */
    private $mapper;
    /** @var LoggerInterface */
    private $logger;
    /** @var ShareService */
    private $shareService;
    /** @var FolderService */
    private $folderService;
    /** @var ScannerUtil */
    private $scannerUtil;
    /** @var FilterService */
    private $filterService;
    /** @var ExcludedFolderService */
    private $excludedFolderService;
    /** @var ILockingProvider */
    private $lockingProvider;
    /** @var IRootFolder Used for file operations */
    private $rootFolder;
    /** @var IDBConnection */
    private $connection;

    public function __construct(
        FileInfoMapper $mapper,
        IEventDispatcher $eventDispatcher,
        LoggerInterface $logger,
        ShareService $shareService,
        FilterService $filterService,
        FolderService $folderService,
        ScannerUtil $scannerUtil,
        ILockingProvider $lockingProvider,
        IRootFolder $rootFolder,
        IDBConnection $connection,
        ExcludedFolderService $excludedFolderService
    ) {
        $this->mapper = $mapper;
        $this->eventDispatcher = $eventDispatcher;
        $this->logger = $logger;
        $this->shareService = $shareService;
        $this->filterService = $filterService;
        $this->folderService = $folderService;
        $this->scannerUtil = $scannerUtil;
        $this->lockingProvider = $lockingProvider;
        $this->rootFolder = $rootFolder;
        $this->connection = $connection;
        $this->excludedFolderService = $excludedFolderService;
    }

    /**
     * @return FileInfo
     */
    public function enrich(FileInfo $fileInfo): FileInfo
    {
        $this->logger->debug('Starting file info enrichment', [
            'path' => $fileInfo->getPath(),
            'id' => $fileInfo->getId(),
            'currentHash' => $fileInfo->getFileHash(),
        ]);

        try {
            $node = $this->folderService->getNodeByFileInfo($fileInfo);
            if ($node) {
                $this->logger->debug('Found node for file info', [
                    'path' => $fileInfo->getPath(),
                    'nodeId' => $node->getId(),
                    'nodeType' => get_class($node),
                    'size' => $node->getSize(),
                    'mimetype' => $node->getMimetype(),
                ]);

                $fileInfo->setNodeId($node->getId());
                $fileInfo->setMimetype($node->getMimetype());
                $fileInfo->setSize($node->getSize());
            } else {
                $this->logger->warning('Node not found for file info - file may be temporarily inaccessible', [
                    'path' => $fileInfo->getPath(),
                    'id' => $fileInfo->getId(),
                    'hash' => $fileInfo->getFileHash(),
                ]);

                // Mark as stale but DO NOT delete automatically
                // Files can be temporarily inaccessible due to:
                // - Network mount issues
                // - Permission changes
                // - Shared folder sync delays
                // - File locks
                // Only delete with explicit user action
                $fileInfo->setNodeId(null);
            }
        } catch (NotFoundException $e) {
            $this->logger->warning('File not found during enrichment - file may be temporarily inaccessible', [
                'path' => $fileInfo->getPath(),
                'id' => $fileInfo->getId(),
                'error' => $e->getMessage(),
            ]);

            // Mark as stale but DO NOT delete automatically
            // NotFoundException can occur due to:
            // - Temporary permission issues
            // - Network timeouts
            // - Unmounted external drives
            // - Shared folder access issues
            // Only delete with explicit user action
            $fileInfo->setNodeId(null);
        } catch (\Exception $e) {
            $this->logger->error('Error enriching FileInfo', [
                'path' => $fileInfo->getPath(),
                'id' => $fileInfo->getId(),
                'error' => $e->getMessage(),
                'errorClass' => get_class($e),
                'trace' => $e->getTraceAsString(),
            ]);
        }

        return $fileInfo;
    }

    /**
     * @return array<FileInfo>
     */
    public function findAll(bool $enrich = false): array
    {
        $entities = $this->mapper->findAll();
        if ($enrich) {
            foreach ($entities as $entity) {
                $entity = $this->enrich($entity);
            }
            unset($entity);
        }

        return $entities;
    }

    public function find(string $path, ?string $fallbackUID = null, bool $enrich = false): FileInfo
    {
        $entity = $this->mapper->find($path, $fallbackUID);
        if ($enrich) {
            $entity = $this->enrich($entity);
        }

        return $entity;
    }

    public function findById(int $id, bool $enrich = false): FileInfo
    {
        $entity = $this->mapper->findById($id);
        if ($enrich) {
            $entity = $this->enrich($entity);
        }

        return $entity;
    }

    /**
     * @return array<FileInfo>
     */
    public function findByHash(string $hash, string $type = 'file_hash'): array
    {
        $this->logger->debug('Finding files by hash', [
            'hash' => $hash,
            'type' => $type,
        ]);

        $files = $this->mapper->findByHash($hash, $type);
        $existingFiles = [];

        foreach ($files as $fileInfo) {
            try {
                // Enrich to get latest metadata
                $enrichedFile = $this->enrich($fileInfo);
                // Include all files, even if temporarily inaccessible
                // Let the UI handle display of stale entries
                $existingFiles[] = $enrichedFile;
            } catch (\Exception $e) {
                $this->logger->warning('Error processing file during hash search', [
                    'path' => $fileInfo->getPath(),
                    'hash' => $hash,
                    'error' => $e->getMessage(),
                ]);
                // Continue processing other files
            }
        }

        $this->logger->debug('Found files by hash', [
            'hash' => $hash,
            'count' => count($existingFiles),
            'ignored' => 'false',
        ]);

        return $existingFiles;
    }

    /**
     * @return array<FileInfo>
     */
    public function findBySize(int $size, bool $onlyEmptyHash = true): array
    {
        return $this->mapper->findBySize($size, $onlyEmptyHash);
    }

    public function countByHash(string $hash, string $type = 'file_hash'): int
    {
        return $this->mapper->countByHash($hash, $type);
    }

    public function countBySize(int $size): int
    {
        return $this->mapper->countBySize($size);
    }

    public function update(FileInfo $fileInfo, ?string $fallbackUID = null): FileInfo
    {
        $fileInfo = $this->updateFileMeta($fileInfo, $fallbackUID);
        $fileInfo->setKeepAsPrimary(true);
        $fileInfo = $this->mapper->update($fileInfo);
        $fileInfo->setKeepAsPrimary(false);

        return $fileInfo;
    }

    public function save(string $path, ?string $fallbackUID = null): FileInfo
    {
        $this->logger->debug('Starting save operation for path: {path}', [
            'path' => $path,
            'fallbackUID' => $fallbackUID,
        ]);

        try {
            $fileInfo = $this->mapper->find($path, $fallbackUID);
            $this->logger->debug('Found existing FileInfo for path: {path}', [
                'path' => $path,
                'fileInfoId' => $fileInfo->getId(),
                'currentHash' => $fileInfo->getFileHash(),
            ]);

            $fileInfo = $this->update($fileInfo, $fallbackUID);
            $this->eventDispatcher->dispatchTyped(new UpdatedFileInfoEvent($fileInfo, $fallbackUID));

            $this->logger->debug('Updated existing FileInfo: {path}', [
                'path' => $path,
                'fileInfoId' => $fileInfo->getId(),
                'newHash' => $fileInfo->getFileHash(),
            ]);
        } catch (\Exception $e) {
            $this->logger->debug('Creating new FileInfo for path: {path}', [
                'path' => $path,
                'error' => $e->getMessage(),
            ]);

            $fileInfo = new FileInfo($path);
            $fileInfo = $this->updateFileMeta($fileInfo, $fallbackUID);
            $fileInfo->setKeepAsPrimary(true);
            $fileInfo = $this->mapper->insert($fileInfo);
            $fileInfo->setKeepAsPrimary(false);

            $this->logger->debug('Created new FileInfo: {path}', [
                'path' => $path,
                'fileInfoId' => $fileInfo->getId(),
                'hash' => $fileInfo->getFileHash(),
            ]);

            $this->eventDispatcher->dispatchTyped(new NewFileInfoEvent($fileInfo, $fallbackUID));
        }

        return $fileInfo;
    }

    public function delete(FileInfo $fileInfo): FileInfo
    {
        $this->logger->debug('Starting deletion of file info', [
            'path' => $fileInfo->getPath(),
            'hash' => $fileInfo->getFileHash(),
            'id' => $fileInfo->getId(),
        ]);

        try {
            // Try to release any locks first
            try {
                $this->lockingProvider->releaseAll($fileInfo->getPath(), ILockingProvider::LOCK_SHARED);
                $this->logger->debug('Released locks for file', [
                    'path' => $fileInfo->getPath(),
                ]);
            } catch (\Exception $e) {
                $this->logger->warning('Failed to release locks, continuing anyway', [
                    'path' => $fileInfo->getPath(),
                    'error' => $e->getMessage(),
                ]);
            }

            // Verify if the file info exists before deletion
            if ($fileInfo->getId()) {
                $this->logger->debug('Verifying file info exists', [
                    'id' => $fileInfo->getId(),
                    'path' => $fileInfo->getPath(),
                ]);

                try {
                    $existingFileInfo = $this->mapper->findById($fileInfo->getId());

                    $this->logger->debug('Found existing file info', [
                        'id' => $existingFileInfo->getId(),
                        'path' => $existingFileInfo->getPath(),
                        'hash' => $existingFileInfo->getFileHash(),
                    ]);
                } catch (DoesNotExistException $e) {
                    $this->logger->debug('File info already deleted', [
                        'path' => $fileInfo->getPath(),
                        'id' => $fileInfo->getId(),
                    ]);

                    return $fileInfo;
                }
            }

            // REMOVED: Automatic physical file deletion
            // This method should only clean up database entries
            // Physical file deletion must be done through FileService with proper checks
            $this->logger->debug('Cleaning up database entry only - physical file deletion must be explicit', [
                'path' => $fileInfo->getPath(),
            ]);

            // Now delete the database entry
            $result = $this->mapper->delete($fileInfo);

            $this->logger->debug('Successfully deleted file info from database', [
                'path' => $fileInfo->getPath(),
                'id' => $fileInfo->getId(),
            ]);

            return $result;

        } catch (DoesNotExistException $e) {
            $this->logger->debug('File info not found for deletion', [
                'path' => $fileInfo->getPath(),
                'id' => $fileInfo->getId(),
                'error' => $e->getMessage(),
            ]);

            // Return the original file info since it's already "deleted"
            return $fileInfo;
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete file info', [
                'path' => $fileInfo->getPath(),
                'id' => $fileInfo->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            throw new \RuntimeException('Failed to delete file info: ' . $e->getMessage(), 0, $e);
        }
    }

    public function clear(): void
    {
        $this->mapper->clear();
    }

    public function updateFileMeta(FileInfo $fileInfo, ?string $fallbackUID = null): FileInfo
    {
        $this->logger->debug('Starting metadata update for file: {path}', [
            'path' => $fileInfo->getPath(),
            'fallbackUID' => $fallbackUID,
        ]);

        $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);

        $this->logger->debug('Retrieved node info for file: {path}', [
            'path' => $fileInfo->getPath(),
            'size' => $file->getSize(),
            'mimetype' => $file->getMimetype(),
            'mtime' => $file->getMtime(),
        ]);

        $fileInfo->setSize($file->getSize());
        $fileInfo->setMimetype($file->getMimetype());

        try {
            $owner = $file->getOwner()->getUID();
            $fileInfo->setOwner($owner);
            $this->logger->debug('Set owner for file: {path}', [
                'path' => $fileInfo->getPath(),
                'owner' => $owner,
            ]);

            // Set the user context for the excluded folder service
            $this->excludedFolderService->setUserId($owner);
        } catch (\Throwable $e) {
            $this->logger->debug('Error setting owner for file: {path}', [
                'path' => $fileInfo->getPath(),
                'error' => $e->getMessage(),
                'fallbackUID' => $fallbackUID,
            ]);

            if (!is_null($fallbackUID)) {
                $fileInfo->setOwner($fallbackUID);
                // Set the user context for the excluded folder service using fallback
                $this->excludedFolderService->setUserId($fallbackUID);
            } elseif (!$fileInfo->getOwner()) {
                throw $e;
            }
        }

        $isIgnored = $this->filterService->isIgnored($fileInfo, $file);
        $fileInfo->setIgnored($isIgnored);

        $this->logger->debug('Completed metadata update for file: {path}', [
            'path' => $fileInfo->getPath(),
            'size' => $fileInfo->getSize(),
            'mimetype' => $fileInfo->getMimetype(),
            'owner' => $fileInfo->getOwner(),
            'isIgnored' => $isIgnored ? 'true' : 'false',
        ]);

        return $fileInfo;
    }

    /**
     * @return false|string
     */
    public function isRecalculationRequired(FileInfo $fileInfo, ?string $fallbackUID = null, ?Node $file = null)
    {
        $this->logger->debug('Checking if recalculation is required for file: {path}', [
            'path' => $fileInfo->getPath(),
            'currentHash' => $fileInfo->getFileHash(),
            'isIgnored' => $fileInfo->isIgnored() ? 'true' : 'false',
        ]);

        if ($fileInfo->isIgnored()) {
            $this->logger->debug('File is ignored, skipping recalculation: {path}', [
                'path' => $fileInfo->getPath(),
            ]);

            return false;
        }

        if (is_null($file)) {
            $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);
        }

        $this->logger->debug('File node details: {path}', [
            'path' => $fileInfo->getPath(),
            'type' => $file->getType(),
            'mtime' => $file->getMtime(),
            'uploadTime' => $file->getUploadTime(),
            'isMounted' => $file->isMounted() ? 'true' : 'false',
            'lastUpdate' => $fileInfo->getUpdatedAt() ? $fileInfo->getUpdatedAt()->getTimestamp() : 'never',
        ]);

        if (
            $file->getType() === \OCP\Files\FileInfo::TYPE_FILE
            && (empty($fileInfo->getFileHash())
                || $file->getMtime() > $fileInfo->getUpdatedAt()->getTimestamp()
                || $file->getUploadTime() > $fileInfo->getUpdatedAt()->getTimestamp())
            || $file->isMounted()
        ) {
            $this->logger->debug('Recalculation required for file: {path}', [
                'path' => $fileInfo->getPath(),
                'reason' => empty($fileInfo->getFileHash()) ? 'no hash' :
                           ($file->getMtime() > $fileInfo->getUpdatedAt()->getTimestamp() ? 'modified' :
                           ($file->getUploadTime() > $fileInfo->getUpdatedAt()->getTimestamp() ? 'uploaded' : 'mounted')),
            ]);

            return $file->getInternalPath();
        }

        $this->logger->debug('No recalculation needed for file: {path}', [
            'path' => $fileInfo->getPath(),
        ]);

        return false;
    }

    public function calculateHashes(FileInfo $fileInfo, ?string $fallbackUID = null, bool $requiresHash = true): FileInfo
    {
        $this->logger->debug('Starting hash calculation for file: {path}', [
            'path' => $fileInfo->getPath(),
            'fallbackUID' => $fallbackUID,
            'requiresHash' => $requiresHash ? 'true' : 'false',
            'currentHash' => $fileInfo->getFileHash(),
        ]);

        $oldHash = $fileInfo->getFileHash();
        $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);

        $this->logger->debug('Retrieved node for file: {path}', [
            'path' => $fileInfo->getPath(),
            'nodeType' => $file ? get_class($file) : 'null',
            'fileSize' => $file ? $file->getSize() : 'unknown',
        ]);

        $path = $this->isRecalculationRequired($fileInfo, $fallbackUID, $file);

        $this->logger->debug('Recalculation check result for file: {path}', [
            'path' => $fileInfo->getPath(),
            'requiresRecalculation' => $path !== false ? 'true' : 'false',
            'internalPath' => $path !== false ? $path : 'N/A',
        ]);

        if ($path !== false) {
            if ($requiresHash) {
                if ($file instanceof \OCP\Files\File) {
                    $this->logger->debug('Calculating hash for file: {path}', [
                        'path' => $fileInfo->getPath(),
                        'internalPath' => $path,
                    ]);

                    $hash = $file->getStorage()->hash('sha256', $path);

                    $this->logger->debug('Hash calculation result for file: {path}', [
                        'path' => $fileInfo->getPath(),
                        'hashResult' => is_bool($hash) ? 'failed (boolean)' : 'success',
                        'newHash' => !is_bool($hash) ? $hash : 'N/A',
                    ]);

                    if (!is_bool($hash)) {
                        $fileInfo->setFileHash($hash);
                        $fileInfo->setUpdatedAt(new \DateTime());
                    } else {
                        $this->logger->error('Unable to calculate hash for file: {path}', [
                            'path' => $fileInfo->getPath(),
                            'internalPath' => $file->getInternalPath(),
                        ]);

                        throw new UnableToCalculateHash($file->getInternalPath());
                    }
                } else {
                    $this->logger->debug('Node is not a file, setting hash to null: {path}', [
                        'path' => $fileInfo->getPath(),
                    ]);
                    $fileInfo->setFileHash(null);
                }
            } else {
                $this->logger->debug('Hash calculation not required, setting hash to null: {path}', [
                    'path' => $fileInfo->getPath(),
                ]);
                $fileInfo->setFileHash(null);
            }

            $this->update($fileInfo, $fallbackUID);
            $this->eventDispatcher->dispatchTyped(new CalculatedHashEvent($fileInfo, $oldHash));

            $this->logger->debug('Completed hash calculation for file: {path}', [
                'path' => $fileInfo->getPath(),
                'oldHash' => $oldHash,
                'newHash' => $fileInfo->getFileHash(),
            ]);
        }

        return $fileInfo;
    }

    public function scanFiles(
        string $user,
        ?string $path = null,
        ?\Closure $abortIfInterrupted = null,
        ?OutputInterface $output = null,
        ?bool $isShared = false
    ): void {
        $userFolder = $this->folderService->getUserFolder($user);
        $scanPath = $userFolder->getPath();
        if (!is_null($path) && !$isShared) {
            $scanPath .= DIRECTORY_SEPARATOR . ltrim($path, DIRECTORY_SEPARATOR);
            if (!$userFolder->nodeExists(ltrim($path, DIRECTORY_SEPARATOR))) {
                CMDUtils::showIfOutputIsPresent(
                    'Skipped ' . $scanPath . ' because it doesn\'t exists.',
                    $output,
                    OutputInterface::VERBOSITY_VERBOSE
                );

                return;
            }
        } elseif ($isShared) {
            if (is_null($path)) {
                return;
            }
            $scanPath = $path;
        }

        try {
            $this->scannerUtil->setHandles($this, $output, $abortIfInterrupted);
            $this->scannerUtil->scan($user, $scanPath);
        } catch (\OCP\Lock\LockedException $e) {
            $this->handleLockedFile($e->getPath(), $output);
        } catch (NotFoundException $e) {
            $this->logger->error('The given scan path doesn\'t exists.', ['app' => Application::ID, 'exception' => $e]);
            CMDUtils::showIfOutputIsPresent(
                '<error>The given scan path doesn\'t exists.</error>',
                $output
            );
        } catch (\Exception $e) {
            $this->logger->error('An error occurred during scanning.', ['app' => Application::ID, 'exception' => $e]);
            CMDUtils::showIfOutputIsPresent(
                '<error>An error occurred during scanning.</error>',
                $output
            );
        }
    }

    private function handleLockedFile(string $path, ?OutputInterface $output): void
    {
        try {
            // Release the lock using the locking provider
            $this->lockingProvider->releaseAll($path, ILockingProvider::LOCK_SHARED);
            CMDUtils::showIfOutputIsPresent(
                "Released lock for file: $path",
                $output
            );

            // Check if the file is still locked
            if ($this->lockingProvider->isLocked($path, ILockingProvider::LOCK_SHARED)) {
                CMDUtils::showIfOutputIsPresent(
                    "<error>File is still locked after release attempt: $path</error>",
                    $output
                );
                // Call the method to disable all locks
                $this->disableAllLocks($output);
            } else {
                CMDUtils::showIfOutputIsPresent(
                    "<info>Successfully released all locks for file: $path</info>",
                    $output
                );
            }
        } catch (\Exception $e) {
            CMDUtils::showIfOutputIsPresent(
                "<error>Failed to release lock for file: $path - " . $e->getMessage() . '</error>',
                $output
            );
            $this->logger->error("Failed to release lock for file: $path", ['exception' => $e]);
            // Call the method to disable all locks
            $this->disableAllLocks($output);
        }
    }

    private function disableAllLocks(?OutputInterface $output): void
    {
        try {
            $query = $this->connection->prepare('DELETE FROM oc_file_locks WHERE true');
            $query->execute();
            CMDUtils::showIfOutputIsPresent(
                '<info>All locks have been disabled by emptying the oc_file_locks table.</info>',
                $output
            );
        } catch (\Exception $e) {
            CMDUtils::showIfOutputIsPresent(
                '<error>Failed to disable all locks: ' . $e->getMessage() . '</error>',
                $output
            );
            $this->logger->error('Failed to disable all locks', ['exception' => $e]);
        }
    }

    public function hasAccessRight(FileInfo $fileInfo, string $user): bool
    {
        $this->logger->debug('FileInfoService::hasAccessRight - Starting access check', [
            'user' => $user,
            'file_owner' => $fileInfo->getOwner(),
            'file_path' => $fileInfo->getPath(),
        ]);

        if ($fileInfo->getOwner() === $user) {
            $this->logger->debug('FileInfoService::hasAccessRight - User is owner, granting access');

            return true;
        }

        try {
            $node = $this->folderService->getNodeByFileInfo($fileInfo, $user);
            $this->logger->debug('FileInfoService::hasAccessRight - Got node for file', [
                'node_path' => $node->getPath(),
                'node_type' => get_class($node),
            ]);

            $path = $this->shareService->hasAccessRight($node, $user);
            $this->logger->debug('FileInfoService::hasAccessRight - Share service response', [
                'has_access' => !is_null($path),
                'resolved_path' => $path,
            ]);

            return !is_null($path);
        } catch (NotFoundException $e) {
            $this->logger->debug('FileInfoService::hasAccessRight - Node not found', [
                'exception' => $e->getMessage(),
            ]);

            return false;
        } catch (\Throwable $e) {
            $this->logger->error('FileInfoService::hasAccessRight - Unexpected error', [
                'exception' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return false;
        }
    }
}
