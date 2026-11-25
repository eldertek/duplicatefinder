<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Db\OriginFolderMapper;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
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

    /** @var array<string, OriginFolder[]> */
    private array $originFoldersCache = [];

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
        $normalizedPath = $this->normalizePath($folderPath, true);
        if ($normalizedPath === null || $normalizedPath === '/') {
            throw new \InvalidArgumentException('Invalid origin folder path: ' . $folderPath);
        }

        $this->logger->debug('Creating origin folder: {path}', ['path' => $normalizedPath]);

        // Verify that the folder exists
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        if (!$userFolder->nodeExists($normalizedPath)) {
            $this->logger->warning('Folder not found: {path}', ['path' => $normalizedPath]);

            throw new NotFoundException('Folder does not exist: ' . $normalizedPath);
        }

        // Check if it's already an origin folder
        if ($this->mapper->exists($this->userId, $normalizedPath)) {
            $this->logger->warning('Folder already exists as origin: {path}', ['path' => $normalizedPath]);

            throw new Exception('Folder is already an origin folder: ' . $normalizedPath);
        }

        $originFolder = new OriginFolder();
        $originFolder->setUserId($this->userId);
        $originFolder->setFolderPath($normalizedPath);
        $originFolder->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));

        $result = $this->mapper->insert($originFolder);
        unset($this->originFoldersCache[$this->userId]);
        $this->logger->info('Successfully created origin folder: {path}', ['path' => $normalizedPath]);

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

            $deleted = $this->mapper->delete($originFolder);
            unset($this->originFoldersCache[$this->userId]);

            return $deleted;
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
        if (trim($path) === '') {
            return [
                'isProtected' => false,
                'protectingFolder' => null,
            ];
        }

        $normalizedTarget = $this->normalizePath($path, false);
        if ($normalizedTarget === null) {
            // Fail closed on null-byte or root-escaping traversal paths
            return [
                'isProtected' => true,
                'protectingFolder' => '/',
            ];
        }

        if (!isset($this->originFoldersCache[$this->userId])) {
            $this->originFoldersCache[$this->userId] = $this->findAll();
        }
        $originFolders = $this->originFoldersCache[$this->userId];

        foreach ($originFolders as $folder) {
            $normalizedOrigin = $this->normalizePath((string)$folder->getFolderPath(), false);
            if ($normalizedOrigin === null) {
                continue;
            }
            if ($normalizedOrigin === '/'
                || $normalizedTarget === $normalizedOrigin
                || str_starts_with($normalizedTarget, $normalizedOrigin . '/')) {
                return [
                    'isProtected' => true,
                    'protectingFolder' => $normalizedOrigin,
                ];
            }
        }

        return [
            'isProtected' => false,
            'protectingFolder' => null,
        ];
    }

    public function resetCache(): void
    {
        $this->originFoldersCache = [];
    }

    private function normalizePath(string $path, bool $rejectTraversal): ?string
    {
        if (str_contains($path, "\0")) {
            return null;
        }

        $normalized = str_replace('\\', '/', trim($path));
        if ($normalized === '') {
            return null;
        }

        if ($this->userId !== '') {
            $prefixPattern = '#^/' . preg_quote($this->userId, '#') . '/files(?=/|$)#';
            $normalized = (string)preg_replace($prefixPattern, '', $normalized);
        }

        $segments = [];
        foreach (explode('/', $normalized) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                if ($rejectTraversal || $segments === []) {
                    return null;
                }
                array_pop($segments);
                continue;
            }
            $segments[] = $segment;
        }

        return $segments === [] ? '/' : '/' . implode('/', $segments);
    }

    /**
     * Apply the same origin-folder protection to every component a deletion affects.
     *
     * @param string $path A path relative to the current user's files folder
     * @throws OriginFolderProtectionException When an origin folder protects the path
     */
    public function assertNotProtected(string $path): void
    {
        $protection = $this->isPathProtected($path);
        if ($protection['isProtected']) {
            $this->logger->debug('File deletion blocked - protected by origin folder: {folder}', [
                'folder' => $protection['protectingFolder'],
            ]);

            throw new OriginFolderProtectionException(
                sprintf(
                    'Cannot delete file "%s" as it is protected by origin folder "%s"',
                    $path,
                    $protection['protectingFolder']
                )
            );
        }
    }

    public function setUserId(?string $userId): void
    {
        $this->userId = $userId ?? '';
    }
}
