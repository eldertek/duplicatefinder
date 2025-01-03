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
            throw new \RuntimeException('User context required for this operation');
        }
    }

    /**
     * @return ExcludedFolder[]
     */
    public function findAll(): array {
        $this->validateUserContext();
        return $this->mapper->findAllForUser($this->userId);
    }

    public function create(string $folderPath): ExcludedFolder {
        $this->validateUserContext();
        
        // Normalize path
        $folderPath = '/' . trim($folderPath, '/');
        
        // Verify folder exists
        try {
            $userFolder = $this->rootFolder->getUserFolder($this->userId);
            $userFolder->get($folderPath);
        } catch (NotFoundException $e) {
            throw new \RuntimeException('Folder does not exist: ' . $folderPath);
        }

        // Create new excluded folder
        $excludedFolder = new ExcludedFolder();
        $excludedFolder->setUserId($this->userId);
        $excludedFolder->setFolderPath($folderPath);
        $excludedFolder->setCreatedAt(new DateTime());

        return $this->mapper->insert($excludedFolder);
    }

    public function delete(int $id): void {
        $this->validateUserContext();
        
        try {
            $excludedFolder = $this->mapper->findByIdAndUser($id, $this->userId);
            $this->mapper->delete($excludedFolder);
        } catch (DoesNotExistException $e) {
            throw new \RuntimeException('Excluded folder not found');
        } catch (Exception $e) {
            throw new \RuntimeException('Failed to delete excluded folder');
        }
    }

    public function isPathExcluded(string $path): bool {
        $this->validateUserContext();
        return $this->mapper->isPathInExcludedFolder($this->userId, $path);
    }

    /**
     * Set the user ID for the service.
     *
     * @param string|null $userId The user ID to set
     */
    public function setUserId(?string $userId): void {
        $this->userId = $userId ?? '';
    }
}