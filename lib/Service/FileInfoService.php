<?php

namespace OCA\DuplicateFinder\Service;

use Psr\Log\LoggerInterface;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use Symfony\Component\Console\Output\OutputInterface;
use OCP\Lock\ILockingProvider;
use OCP\Files\Storage\IStorage;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Event\UpdatedFileInfoEvent;
use OCA\DuplicateFinder\Event\NewFileInfoEvent;
use OCA\DuplicateFinder\Exception\UnableToCalculateHash;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCA\DuplicateFinder\Utils\ScannerUtil;

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
    private $lockingProvider;
    private $rootFolder;
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
        IDBConnection $connection
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
    }

    /**
     * @return FileInfo
     */
    public function enrich(FileInfo $fileInfo): FileInfo
    {
        try {
            $node = $this->folderService->getNodeByFileInfo($fileInfo);
            if ($node) {
                $fileInfo->setNodeId($node->getId());
                $fileInfo->setMimetype($node->getMimetype());
                $fileInfo->setSize($node->getSize());
            } else {
                // Handle the case where no node is found
                $this->logger->error("No node found for file info ID: " . $fileInfo->getId());
            }
        } catch (\Exception $e) {
            // Log exception details
            $this->logger->error("Error enriching FileInfo: " . $e->getMessage());
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
        return $this->mapper->findByHash($hash, $type);
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
        try {
            $fileInfo = $this->mapper->find($path, $fallbackUID);
            $fileInfo = $this->update($fileInfo, $fallbackUID);
            $this->eventDispatcher->dispatchTyped(new UpdatedFileInfoEvent($fileInfo, $fallbackUID));
        } catch (\Exception $e) {
            $fileInfo = new FileInfo($path);
            $fileInfo = $this->updateFileMeta($fileInfo, $fallbackUID);
            $fileInfo->setKeepAsPrimary(true);
            $fileInfo = $this->mapper->insert($fileInfo);
            $fileInfo->setKeepAsPrimary(false);
            $this->eventDispatcher->dispatchTyped(new NewFileInfoEvent($fileInfo, $fallbackUID));
        }
        return $fileInfo;
    }

    public function delete(FileInfo $fileInfo): FileInfo
    {
        $this->mapper->delete($fileInfo);
        return $fileInfo;
    }

    public function clear(): void
    {
        $this->mapper->clear();
    }

    public function updateFileMeta(FileInfo $fileInfo, ?string $fallbackUID = null): FileInfo
    {
        $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);
        $fileInfo->setSize($file->getSize());
        $fileInfo->setMimetype($file->getMimetype());
        try {
            $fileInfo->setOwner($file->getOwner()->getUID());
        } catch (\Throwable $e) {
            if (!is_null($fallbackUID)) {
                $fileInfo->setOwner($fallbackUID);
            } elseif (!$fileInfo->getOwner()) {
                throw $e;
            }
        }
        $fileInfo->setIgnored($this->filterService->isIgnored($fileInfo, $file));
        $fileInfo->setSuppressed($file->isDeleted());
        return $fileInfo;
    }

    /**
     * @return false|string
     */
    public function isRecalculationRequired(FileInfo $fileInfo, ?string $fallbackUID = null, ?Node $file = null)
    {
        if ($fileInfo->isIgnored() || $fileInfo->isSuppressed()) {
            return false;
        }
        if (is_null($file)) {
            $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);
        }
        if (
            $file->getType() === \OCP\Files\FileInfo::TYPE_FILE
            && (empty($fileInfo->getFileHash())
                || $file->getMtime() > $fileInfo->getUpdatedAt()->getTimestamp()
                || $file->getUploadTime() > $fileInfo->getUpdatedAt()->getTimestamp())
            || $file->isMounted()
        ) {
            return $file->getInternalPath();
        }
        return false;
    }

    public function calculateHashes(FileInfo $fileInfo, ?string $fallbackUID = null, bool $requiresHash = true): FileInfo
    {
        $oldHash = $fileInfo->getFileHash();
        $file = $this->folderService->getNodeByFileInfo($fileInfo, $fallbackUID);
        if ($file === null) {
            $this->logger->warning('File not found for FileInfo ID: ' . $fileInfo->getId());
            return $fileInfo;
        }
        $path = $this->isRecalculationRequired($fileInfo, $fallbackUID, $file);
        if ($path !== false) {
            if ($requiresHash) {
                if ($file instanceof \OCP\Files\File) {
                    $hash = $file->getStorage()->hash('sha256', $path);
                    if (!is_bool($hash)) {
                        $fileInfo->setFileHash($hash);
                        $fileInfo->setUpdatedAt(new \DateTime());
                    } else {
                        throw new UnableToCalculateHash($file->getInternalPath());
                    }
                } else {
                    $fileInfo->setFileHash(null);
                }
            } else {
                $fileInfo->setFileHash(null);
            }
            $this->update($fileInfo, $fallbackUID);
            $this->eventDispatcher->dispatchTyped(new CalculatedHashEvent($fileInfo, $oldHash));
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
            // Get the file node
            $node = $this->rootFolder->get($path);
            $storage = $node->getStorage();

            if ($storage instanceof IStorage) {
                // Try to release the lock at the storage level
                $storage->unlockFile($path, ILockingProvider::LOCK_SHARED);
                CMDUtils::showIfOutputIsPresent(
                    "Released storage-level lock for file: $path",
                    $output
                );
            }

            // Try to release the lock at the application level
            $this->lockingProvider->releaseAll($path, ILockingProvider::LOCK_SHARED);
            CMDUtils::showIfOutputIsPresent(
                "Released application-level lock for file: $path",
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
                "<error>Failed to release lock for file: $path - " . $e->getMessage() . "</error>",
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
                "<info>All locks have been disabled by emptying the oc_file_locks table.</info>",
                $output
            );
        } catch (\Exception $e) {
            CMDUtils::showIfOutputIsPresent(
                "<error>Failed to disable all locks: " . $e->getMessage() . "</error>",
                $output
            );
            $this->logger->error("Failed to disable all locks", ['exception' => $e]);
        }
    }

    public function hasAccessRight(FileInfo $fileInfo, string $user): bool
    {
        if ($fileInfo->getOwner() === $user) {
            return true;
        }

        try {
            $path = $this->shareService->hasAccessRight(
                $this->folderService->getNodeByFileInfo($fileInfo, $user),
                $user
            );
            return !is_null($path);
        } catch (NotFoundException $e) {
            return false;
        }
    }
}
