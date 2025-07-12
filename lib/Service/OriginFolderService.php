<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Db\OriginFolderMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\MultipleObjectsReturnedException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class OriginFolderService
{
    private OriginFolderMapper $mapper;
    private IRootFolder $rootFolder;
    private string $userId;
    private LoggerInterface $logger;

    public function __construct(
        OriginFolderMapper $mapper,
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
     * @return array
     */
    public function findAll(): array
    {
        $this->validateUserContext();

        return $this->mapper->findAll($this->userId);
    }

    /**
     * @param string $folderPath
     * @return OriginFolder
     * @throws NotFoundException if the folder doesn't exist
     * @throws Exception if the folder is already an origin folder
     */
    public function create(string $folderPath): OriginFolder
    {
        $this->validateUserContext();
        $this->logger->debug('Creating origin folder: {path}', ['path' => $folderPath]);

        // Verify that the folder exists
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        if (!$userFolder->nodeExists($folderPath)) {
            $this->logger->warning('Folder not found: {path}', ['path' => $folderPath]);

            throw new NotFoundException('Folder does not exist: ' . $folderPath);
        }

        // Check if it's already an origin folder
        if ($this->mapper->exists($this->userId, $folderPath)) {
            $this->logger->warning('Folder already exists as origin: {path}', ['path' => $folderPath]);

            throw new Exception('Folder is already an origin folder: ' . $folderPath);
        }

        $originFolder = new OriginFolder();
        $originFolder->setUserId($this->userId);
        $originFolder->setFolderPath($folderPath);
        $originFolder->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));

        $result = $this->mapper->insert($originFolder);
        $this->logger->info('Successfully created origin folder: {path}', ['path' => $folderPath]);

        return $result;
    }

    /**
     * @param int $id
     * @return OriginFolder
     * @throws DoesNotExistException
     * @throws MultipleObjectsReturnedException
     */
    public function delete(int $id): OriginFolder
    {
        $this->validateUserContext();

        try {
            $originFolder = $this->mapper->find($id);
            if ($originFolder->getUserId() !== $this->userId) {
                throw new DoesNotExistException('Not found');
            }

            return $this->mapper->delete($originFolder);
        } catch (Exception $e) {
            throw new DoesNotExistException($e->getMessage());
        }
    }

    /**
     * Check if a path is protected by any origin folder
     *
     * @param string $path The path to check (in Nextcloud format)
     * @return array{isProtected: bool, protectingFolder: string|null}
     */
    public function isPathProtected(string $path): array
    {
        $this->validateUserContext();
        $originFolders = $this->findAll();
        foreach ($originFolders as $folder) {
            $folderPath = $folder->getFolderPath();
            // Check if path is exactly the protected folder or is a direct child of it
            if ($path === $folderPath ||
                (str_starts_with($path, $folderPath . '/') && strlen($path) > strlen($folderPath) + 1)) {
                return [
                    'isProtected' => true,
                    'protectingFolder' => $folderPath,
                ];
            }
        }

        return [
            'isProtected' => false,
            'protectingFolder' => null,
        ];
    }

    public function setUserId(?string $userId): void
    {
        $this->userId = $userId ?? '';
    }
}
