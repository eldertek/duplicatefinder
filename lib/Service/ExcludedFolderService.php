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
            $this->logger->debug('No user context available');

            throw new \RuntimeException('User context required for this operation');
        }
        $this->logger->debug('User context validated: {userId}', ['userId' => $this->userId]);
    }

    /**
     * @return ExcludedFolder[]
     */
    public function findAll(): array
    {
        $this->validateUserContext();

        $this->logger->debug('Finding all excluded folders', [
            'userId' => $this->userId,
        ]);

        $folders = $this->mapper->findAllForUser($this->userId);

        $this->logger->debug('Found excluded folders', [
            'count' => count($folders),
            'userId' => $this->userId,
            'folders' => array_map(fn ($f) => [
                'id' => $f->getId(),
                'path' => $f->getFolderPath(),
                'createdAt' => $f->getCreatedAt()->format('Y-m-d H:i:s'),
            ], $folders),
        ]);

        return $folders;
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

        $this->logger->debug('Checking if path is in excluded folder', [
            'path' => $path,
            'userId' => $this->userId,
        ]);

        // Normalize path for comparison - remove /admin/files/ prefix
        $normalizedPath = preg_replace('#^/[^/]+/files/#', '/', $path);
        $normalizedPath = '/' . trim($normalizedPath, '/');

        $this->logger->debug('Normalized path for exclusion check', [
            'originalPath' => $path,
            'normalizedPath' => $normalizedPath,
            'strippedPrefix' => preg_match('#^/[^/]+/files/#', $path) ? 'true' : 'false',
        ]);

        // Get all excluded folders
        $excludedFolders = $this->findAll();
        $this->logger->debug('Found excluded folders', [
            'count' => count($excludedFolders),
            'paths' => array_map(fn ($f) => $f->getFolderPath(), $excludedFolders),
        ]);

        foreach ($excludedFolders as $folder) {
            $excludedPath = '/' . trim($folder->getFolderPath(), '/');
            $this->logger->debug('Comparing paths for exclusion', [
                'filePath' => $normalizedPath,
                'excludedPath' => $excludedPath,
                'isSubPath' => str_starts_with($normalizedPath, $excludedPath),
                'exactMatch' => $normalizedPath === $excludedPath,
            ]);

            // Check if the path is either exactly the excluded path or starts with it followed by a slash
            if ($normalizedPath === $excludedPath || str_starts_with($normalizedPath, $excludedPath . '/')) {
                $this->logger->debug('Path is in excluded folder', [
                    'path' => $path,
                    'normalizedPath' => $normalizedPath,
                    'excludedFolder' => $excludedPath,
                    'matchType' => $normalizedPath === $excludedPath ? 'exact' : 'subpath',
                ]);

                return true;
            }
        }

        $this->logger->debug('Path is not in any excluded folder', [
            'path' => $path,
            'normalizedPath' => $normalizedPath,
            'checkedFolders' => count($excludedFolders),
        ]);

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
        $this->logger->debug('Set user ID: {userId}', ['userId' => $this->userId]);
    }
}
