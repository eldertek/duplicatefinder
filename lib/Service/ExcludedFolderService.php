<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\MultipleObjectsReturnedException;
use Psr\Log\LoggerInterface;

class ExcludedFolderService {
    private ExcludedFolderMapper $mapper;
    private IRootFolder $rootFolder;
    private string $userId;
    private LoggerInterface $logger;

    public function __construct(
        ExcludedFolderMapper $mapper,
        IRootFolder $rootFolder,
        ?string $userId,
        LoggerInterface $logger
    ) {
        $this->mapper = $mapper;
        $this->rootFolder = $rootFolder;
        $this->userId = $userId ?? '';
        $this->logger = $logger;
    }

    private function validateUserContext(): void {
        if (empty($this->userId)) {
            $this->logger->debug('No user context available');
            throw new \RuntimeException('User context required for this operation');
        }
        $this->logger->debug('User context validated: {userId}', ['userId' => $this->userId]);
    }

    /**
     * @return ExcludedFolder[]
     */
    public function findAll(): array {
        $this->validateUserContext();
        $folders = $this->mapper->findAllForUser($this->userId);
        $this->logger->debug('Found {count} excluded folders for user {userId}', [
            'count' => count($folders),
            'userId' => $this->userId,
            'folders' => array_map(fn($f) => $f->getFolderPath(), $folders)
        ]);
        return $folders;
    }

    public function create(string $folderPath): ExcludedFolder {
        $this->validateUserContext();
        
        // Normalize path
        $folderPath = '/' . trim($folderPath, '/');
        $this->logger->debug('Creating excluded folder: {path}', [
            'path' => $folderPath,
            'userId' => $this->userId
        ]);
        
        // Verify folder exists
        try {
            $userFolder = $this->rootFolder->getUserFolder($this->userId);
            $userFolder->get($folderPath);
            $this->logger->debug('Folder exists and is accessible: {path}', ['path' => $folderPath]);
        } catch (NotFoundException $e) {
            $this->logger->debug('Folder does not exist: {path}', [
                'path' => $folderPath,
                'error' => $e->getMessage()
            ]);
            throw new \RuntimeException('Folder does not exist: ' . $folderPath);
        }

        // Create new excluded folder
        $excludedFolder = new ExcludedFolder();
        $excludedFolder->setUserId($this->userId);
        $excludedFolder->setFolderPath($folderPath);
        $excludedFolder->setCreatedAt(new DateTime());

        $result = $this->mapper->insert($excludedFolder);
        $this->logger->debug('Created excluded folder: {path}', [
            'path' => $folderPath,
            'id' => $result->getId()
        ]);
        return $result;
    }

    public function delete(int $id): void {
        $this->validateUserContext();
        
        try {
            $this->logger->debug('Attempting to delete excluded folder: {id}', [
                'id' => $id,
                'userId' => $this->userId
            ]);
            $excludedFolder = $this->mapper->findByIdAndUser($id, $this->userId);
            $this->mapper->delete($excludedFolder);
            $this->logger->debug('Successfully deleted excluded folder: {path}', [
                'path' => $excludedFolder->getFolderPath(),
                'id' => $id
            ]);
        } catch (DoesNotExistException $e) {
            $this->logger->warning('Failed to delete excluded folder: not found', ['id' => $id]);
            throw new \RuntimeException('Excluded folder not found');
        } catch (Exception $e) {
            $this->logger->warning('Failed to delete excluded folder', ['exception' => $e]);
            throw new \RuntimeException('Failed to delete excluded folder');
        }
    }

    public function isPathExcluded(string $path): bool {
        $this->validateUserContext();
        $this->logger->debug('Checking if path is excluded: {path}', [
            'path' => $path,
            'userId' => $this->userId
        ]);

        $isExcluded = $this->mapper->isPathInExcludedFolder($this->userId, $path);
        $this->logger->debug('Path exclusion check result: {result}', [
            'path' => $path,
            'userId' => $this->userId,
            'isExcluded' => $isExcluded ? 'true' : 'false'
        ]);
        return $isExcluded;
    }

    /**
     * Set the user ID for the service.
     *
     * @param string|null $userId The user ID to set
     */
    public function setUserId(?string $userId): void {
        $this->userId = $userId ?? '';
        $this->logger->debug('Set user ID: {userId}', ['userId' => $this->userId]);
    }
} 