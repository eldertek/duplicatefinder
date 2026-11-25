<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use Exception;
use OCA\DuplicateFinder\Exception\AbortedDeletionException;
use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoProtectionException;
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
    private LivePhotoDeletionService $livePhotoDeletionService;

    public function __construct(
        FolderService $folderService,
        OriginFolderService $originFolderService,
        FileInfoService $fileInfoService,
        LoggerInterface $logger,
        LivePhotoDeletionService $livePhotoDeletionService
    ) {
        $this->folderService = $folderService;
        $this->originFolderService = $originFolderService;
        $this->fileInfoService = $fileInfoService;
        $this->logger = $logger;
        $this->livePhotoDeletionService = $livePhotoDeletionService;
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
     * @param bool $allowLivePhotoPair Confirm deleting both components of a redundant Live Photo
     * @return int[] The ids actually deleted, including a Live Photo's paired component
     * @throws NotFoundException If the file doesn't exist
     * @throws NotPermittedException If the user doesn't have permission to delete
     * @throws OriginFolderProtectionException If the file is in an origin folder
     * @throws LastCopyProtectionException If the file is the last copy of its duplicate group
     * @throws LivePhotoProtectionException If Nextcloud blocks deleting the video part of a Live Photo
     * @throws AbortedDeletionException If a Nextcloud event listener aborts deletion
     */
    public function deleteFile(
        string $userId,
        string $filePath,
        ?int $nodeId = null,
        ?string $hash = null,
        bool $allowLastCopy = false,
        bool $allowLivePhotoPair = false
    ): array {
        $this->logger->debug('Attempting to delete file: {path} for user: {userId}', [
            'path' => $filePath,
            'userId' => $userId,
        ]);

        if ($userId === '') {
            throw new NotPermittedException('Authentication required');
        }
        if ($filePath !== '' && (str_contains($filePath, "\0") || preg_match('#(?:^|[\\\\/])\.\.(?:$|[\\\\/])#', $filePath) === 1)) {
            throw new \InvalidArgumentException('Invalid file path');
        }
        if ($filePath === '' && $nodeId === null) {
            throw new \InvalidArgumentException('File path or node ID is required');
        }

        // Check if file is in an origin folder
        if ($filePath !== '') {
            $this->originFolderService->assertNotProtected($filePath);
        }

        $userFolder = $this->folderService->getUserFolder($userId);
        $node = $this->resolveNode($userFolder, $filePath, $nodeId);

        // The node found may sit elsewhere than the path we were given: protect that place too
        $resolvedPath = $userFolder->getRelativePath($node->getPath());
        if ($resolvedPath !== null && $resolvedPath !== $filePath) {
            $this->originFolderService->assertNotProtected($resolvedPath);
        }

        try {
            $deletedPair = $this->livePhotoDeletionService->deleteIfPaired($userFolder, $node, $allowLivePhotoPair);
            if ($deletedPair !== null) {
                return $deletedPair;
            }

            if ($this->isProtectedLivePhotoVideo($node)) {
                $this->logger->warning(
                    'File deletion blocked by Nextcloud Live Photo protection: {path}',
                    ['path' => $filePath]
                );

                throw new LivePhotoProtectionException(
                    sprintf(
                        'Cannot delete "%s" directly because Nextcloud protects the video part of a Live Photo. Delete the paired photo instead only if both files are redundant.',
                        $filePath
                    )
                );
            }

            if ($hash !== null && $hash !== '' && !$allowLastCopy
                && !$this->fileInfoService->hasOtherLiveCopy($hash, $node->getId(), $userId)) {
                $this->logger->warning('File deletion blocked, last remaining copy: {path}', ['path' => $filePath]);

                throw new LastCopyProtectionException(
                    sprintf('Cannot delete file "%s" as it is the last remaining copy of its content', $filePath)
                );
            }

            $nodeId = $node->getId();
            $node->delete();
        } catch (Exception $e) {
            if (is_a($e, 'OCP\\Exceptions\\AbortedEventException')) {
                if (stripos($e->getMessage(), 'live photo') !== false) {
                    $this->logger->warning(
                        'File deletion blocked by Nextcloud Live Photo protection: {path} ({reason})',
                        [
                            'path' => $filePath,
                            'reason' => $e->getMessage(),
                        ]
                    );

                    throw new LivePhotoProtectionException(
                        sprintf(
                            'Cannot delete "%s" directly because Nextcloud protects the video part of a Live Photo. Delete the paired photo instead only if both files are redundant.',
                            $filePath
                        ),
                        0,
                        $e
                    );
                }

                $this->logger->warning(
                    'File deletion aborted by a Nextcloud listener: {path} ({reason})',
                    [
                        'path' => $filePath,
                        'reason' => $e->getMessage(),
                    ]
                );

                throw new AbortedDeletionException(
                    sprintf('File deletion was aborted by Nextcloud for "%s"', $filePath),
                    0,
                    $e
                );
            }

            throw $e;
        }

        // Nextcloud's HookConnector catches AbortedEventException and sets $arguments['run'] = false
        // without rethrowing from Node::delete(), leaving the file intact in user storage.
        $effectivePath = ($resolvedPath !== null && $resolvedPath !== '') ? $resolvedPath : $filePath;
        if ($effectivePath !== '' && $userFolder->nodeExists($effectivePath)) {
            $this->logger->warning(
                'File deletion aborted by Nextcloud before unlink (node still exists): {path}',
                ['path' => $filePath]
            );

            throw new AbortedDeletionException(
                sprintf('File deletion was aborted by Nextcloud for "%s"', $filePath)
            );
        }

        $this->logger->info('Successfully deleted file: {path}', ['path' => $filePath]);

        return $nodeId === null ? [] : [$nodeId];
    }

    /**
     * Resolve the paired Live Photo peer node id via Nextcloud's LivePhotosService when available.
     */
    protected function resolveLivePhotoPeerId(Node $node): ?int
    {
        if (!class_exists('OCP\\Server') || !class_exists('OCA\\Files\\Service\\LivePhotosService')) {
            return null;
        }

        try {
            /** @var object $livePhotosService */
            $livePhotosService = \OCP\Server::get('OCA\\Files\\Service\\LivePhotosService');
            if (!method_exists($livePhotosService, 'getLivePhotoPeerId')) {
                return null;
            }

            $ref = new \ReflectionMethod($livePhotosService, 'getLivePhotoPeerId');
            $params = $ref->getParameters();
            $paramType = isset($params[0]) ? (string)$params[0]->getType() : '';
            /** @var mixed $peerId */
            $peerId = ($paramType === 'int' || $paramType === '?int')
                ? $livePhotosService->getLivePhotoPeerId($node->getId())
                : $livePhotosService->getLivePhotoPeerId($node);

            return is_int($peerId) && $peerId > 0 ? $peerId : null;
        } catch (\Throwable $ignore) {
            return null;
        }
    }

    /**
     * Detect whether a QuickTime video node is protected by Nextcloud's SyncLivePhotosListener
     * (paired Live Photo image present in the same folder). Checking before Node::delete() prevents
     * OC\Files\Node\File::delete() from emitting a false postDelete hook when HookConnector aborts unlink.
     */
    private function isProtectedLivePhotoVideo(Node $node): bool
    {
        if ($node->getMimetype() !== 'video/quicktime') {
            return false;
        }

        $peerId = $this->resolveLivePhotoPeerId($node);
        if ($peerId === null) {
            return false;
        }

        try {
            $parent = $node->getParent();
            foreach ($parent->getDirectoryListing() as $sibling) {
                if ($sibling->getId() === $peerId) {
                    return true;
                }
            }
        } catch (\Throwable $ignore) {
            return false;
        }

        return false;
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
