<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use Psr\Log\LoggerInterface;

class FileService {
    private IRootFolder $rootFolder;
    private OriginFolderService $originFolderService;
    private LoggerInterface $logger;

    public function __construct(
        IRootFolder $rootFolder,
        OriginFolderService $originFolderService,
        LoggerInterface $logger
    ) {
        $this->rootFolder = $rootFolder;
        $this->originFolderService = $originFolderService;
        $this->logger = $logger;
    }

    /**
     * Delete a file by its path
     *
     * @param string $userId The user ID
     * @param string $filePath The file path relative to user's root
     * @throws NotFoundException If the file doesn't exist
     * @throws NotPermittedException If the user doesn't have permission to delete
     * @throws OriginFolderProtectionException If the file is in an origin folder
     */
    public function deleteFile(string $userId, string $filePath): void {
        $this->logger->debug('Attempting to delete file: {path} for user: {userId}', [
            'path' => $filePath,
            'userId' => $userId
        ]);

        // Check if file is in an origin folder
        $protection = $this->originFolderService->isPathProtected($filePath);
        if ($protection['isProtected']) {
            $this->logger->debug('File deletion blocked - protected by origin folder: {folder}', [
                'folder' => $protection['protectingFolder']
            ]);
            throw new OriginFolderProtectionException(
                sprintf(
                    'Cannot delete file "%s" as it is protected by origin folder "%s"',
                    $filePath,
                    $protection['protectingFolder']
                )
            );
        }

        $userFolder = $this->rootFolder->getUserFolder($userId);
        $node = $userFolder->get($filePath);
        $node->delete();
        $this->logger->info('Successfully deleted file: {path}', ['path' => $filePath]);
    }
} 