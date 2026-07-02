<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class ExcludedFolderService
{
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

    private function validateUserContext(): void
    {
        if (empty($this->userId)) {
            throw new \RuntimeException('User context required for this operation');
        }
    }

    /**
     * @return ExcludedFolder[]
     */
    public function findAll(): array
    {
        $this->validateUserContext();

        return $this->mapper->findAllForUser($this->userId);
    }

    public function create(string $folderPath): ExcludedFolder
    {
        $this->validateUserContext();

        // Normalize path
        $folderPath = '/' . trim($folderPath, '/');
        $this->logger->debug('Creating excluded folder', [
            'path' => $folderPath,
            'userId' => $this->userId,
            'originalPath' => $folderPath,
        ]);

        // Verify folder exists
        try {
            $userFolder = $this->rootFolder->getUserFolder($this->userId);
            $node = $userFolder->get($folderPath);
            $this->logger->debug('Folder verification', [
                'path' => $folderPath,
                'exists' => true,
                'nodeType' => get_class($node),
                'nodeId' => $node->getId(),
            ]);
        } catch (NotFoundException $e) {
            $this->logger->error('Folder not found', [
                'path' => $folderPath,
                'error' => $e->getMessage(),
            ]);

            throw new \RuntimeException('Folder does not exist: ' . $folderPath);
        }

        // Create new excluded folder
        $excludedFolder = new ExcludedFolder();
        $excludedFolder->setUserId($this->userId);
        $excludedFolder->setFolderPath($folderPath);
        $excludedFolder->setCreatedAt(new DateTime());

        try {
            $result = $this->mapper->insert($excludedFolder);
            $this->logger->debug('Successfully created excluded folder', [
                'id' => $result->getId(),
                'path' => $result->getFolderPath(),
                'userId' => $result->getUserId(),
                'createdAt' => $result->getCreatedAt()->format('Y-m-d H:i:s'),
            ]);

            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to create excluded folder', [
                'path' => $folderPath,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function delete(int $id): void
    {
        $this->validateUserContext();

        try {
            $this->logger->debug('Attempting to delete excluded folder: {id}', [
                'id' => $id,
                'userId' => $this->userId,
            ]);
            $excludedFolder = $this->mapper->findByIdAndUser($id, $this->userId);
            $this->mapper->delete($excludedFolder);
            $this->logger->debug('Successfully deleted excluded folder: {path}', [
                'path' => $excludedFolder->getFolderPath(),
                'id' => $id,
            ]);
        } catch (DoesNotExistException $e) {
            $this->logger->warning('Failed to delete excluded folder: not found', ['id' => $id]);

            throw new \RuntimeException('Excluded folder not found');
        } catch (Exception $e) {
            $this->logger->warning('Failed to delete excluded folder', ['exception' => $e]);

            throw new \RuntimeException('Failed to delete excluded folder');
        }
    }

    public function isPathExcluded(string $path): bool
    {
        $this->validateUserContext();

        // Normalize path for comparison - remove /admin/files/ prefix
        $normalizedPath = preg_replace('#^/[^/]+/files/#', '/', $path);
        $normalizedPath = '/' . trim($normalizedPath, '/');

        // Get all excluded folders
        $excludedFolders = $this->findAll();

        foreach ($excludedFolders as $folder) {
            $excludedPath = '/' . trim($folder->getFolderPath(), '/');

            // Check if the path is either exactly the excluded path or starts with it followed by a slash
            if ($normalizedPath === $excludedPath || str_starts_with($normalizedPath, $excludedPath . '/')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Set the user ID for the service.
     *
     * @param string|null $userId The user ID to set
     */
    public function setUserId(?string $userId): void
    {
        $this->userId = $userId ?? '';
    }
}
