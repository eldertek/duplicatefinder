<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use Psr\Log\LoggerInterface;

class FileService
{
    private FolderService $folderService;
    private OriginFolderService $originFolderService;
    private FileInfoService $fileInfoService;
    private LoggerInterface $logger;

    public function __construct(
        FolderService $folderService,
        OriginFolderService $originFolderService,
        FileInfoService $fileInfoService,
        LoggerInterface $logger
    ) {
        $this->folderService = $folderService;
        $this->originFolderService = $originFolderService;
        $this->fileInfoService = $fileInfoService;
        $this->logger = $logger;
    }

    /**
     * Delete a file
     *
     * The file is identified by its node id when the caller knows it: the path shown for a file
     * that belongs to another user (a share) is the path in the owner's tree, which is not a
     * path of the current user (issue 177). The path is only used as a fallback.
     *
     * @param string $userId The user ID
     * @param string $filePath The file path relative to user's root
     * @param int|null $nodeId The id of the file node, when known
     * @param string|null $hash The content hash of the duplicate group the file is deleted from.
     *                          When given, the last remaining copy of that group is never deleted.
     * @param bool $allowLastCopy Delete the file even if it is the last copy of its group
     * @throws NotFoundException If the file doesn't exist
     * @throws NotPermittedException If the user doesn't have permission to delete
     * @throws OriginFolderProtectionException If the file is in an origin folder
     * @throws LastCopyProtectionException If the file is the last copy of its duplicate group
     */
    public function deleteFile(
        string $userId,
        string $filePath,
        ?int $nodeId = null,
        ?string $hash = null,
        bool $allowLastCopy = false
    ): void {
        $this->logger->debug('Attempting to delete file: {path} for user: {userId}', [
            'path' => $filePath,
            'userId' => $userId,
        ]);

        // Check if file is in an origin folder
        $this->assertNotProtected($filePath);

        $userFolder = $this->folderService->getUserFolder($userId);
        $node = $this->resolveNode($userFolder, $filePath, $nodeId);

        // The node found may sit elsewhere than the path we were given: protect that place too
        $resolvedPath = $userFolder->getRelativePath($node->getPath());
        if ($resolvedPath !== null && $resolvedPath !== $filePath) {
            $this->assertNotProtected($resolvedPath);
        }

        if ($hash !== null && $hash !== '' && !$allowLastCopy
            && !$this->fileInfoService->hasOtherLiveCopy($hash, $node->getId(), $userId)) {
            $this->logger->warning('File deletion blocked, last remaining copy: {path}', ['path' => $filePath]);

            throw new LastCopyProtectionException(
                sprintf('Cannot delete file "%s" as it is the last remaining copy of its content', $filePath)
            );
        }

        $node->delete();
        $this->logger->info('Successfully deleted file: {path}', ['path' => $filePath]);
    }

    /**
     * @throws OriginFolderProtectionException
     */
    private function assertNotProtected(string $path): void
    {
        $protection = $this->originFolderService->isPathProtected($path);
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

    /**
     * @throws NotFoundException
     */
    private function resolveNode(Folder $userFolder, string $filePath, ?int $nodeId): Node
    {
        if ($nodeId === null) {
            return $userFolder->get($filePath);
        }

        $nodes = $userFolder->getById($nodeId);
        if ($nodes === []) {
            throw new NotFoundException('Node not found: ' . $nodeId);
        }
        // The same node can be reachable through several paths: prefer the one we were given
        foreach ($nodes as $candidate) {
            if ($userFolder->getRelativePath($candidate->getPath()) === $filePath) {
                return $candidate;
            }
        }

        return $nodes[0];
    }
}
