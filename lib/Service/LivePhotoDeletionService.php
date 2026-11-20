<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Exception\LivePhotoConfirmationRequiredException;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Model\LivePhotoPair;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Lock\ILockingProvider;

class LivePhotoDeletionService
{
    public function __construct(
        private LivePhotoResolver $resolver,
        private FileInfoService $fileInfoService,
        private OriginFolderService $originFolderService,
        private ILockingProvider $lockingProvider
    ) {
    }

    /**
     * Delete a redundant Live Photo through its still image, as Nextcloud expects.
     *
     * A complete, accessible pair with identical contents must survive, even when
     * the caller permits deleting the last copy of the selected component alone.
     *
     * @param Folder $userFolder The requesting user's visible filesystem
     * @param Node $node The selected photo or MOV
     * @param bool $allowPairDeletion Whether the caller confirmed deleting both components
     * @return int[]|null Deleted component ids, or null for an ordinary file
     * @throws LivePhotoPairProtectionException When a complete replacement is unavailable
     */
    public function deleteIfPaired(Folder $userFolder, Node $node, bool $allowPairDeletion = false): ?array
    {
        $pair = $this->resolver->resolve($node, $userFolder);
        if ($pair === null) {
            return null;
        }

        foreach ($pair->getFiles() as $component) {
            $relativePath = $userFolder->getRelativePath($component->getPath());
            if ($relativePath === null || !$component->isDeletable()) {
                throw new NotPermittedException('Both Live Photo components must be deletable');
            }
            $this->originFolderService->assertNotProtected($relativePath);
        }

        $imageHash = $this->fileInfoService->getContentHash($pair->image);
        $videoHash = $this->fileInfoService->getContentHash($pair->video);
        $lock = 'df-lp/' . substr(hash('sha256', $imageHash . ':' . $videoHash), 0, 48);

        // Serialize deletions of identical pairs, including requests through shared paths.
        $this->lockingProvider->acquireLock($lock, ILockingProvider::LOCK_EXCLUSIVE);

        try {
            foreach ($this->fileInfoService->findByHash($imageHash) as $candidateInfo) {
                $candidateId = $candidateInfo->getNodeId();
                if (!$candidateId || $candidateId === $pair->image->getId() || $candidateId === $pair->video->getId()) {
                    continue;
                }

                foreach ($userFolder->getById($candidateId) as $candidate) {
                    $deleted = $this->deleteWithSurvivor($userFolder, $pair, $candidate, $imageHash, $videoHash, $allowPairDeletion);
                    if ($deleted !== null) {
                        return $deleted;
                    }
                }
            }

            throw new LivePhotoPairProtectionException('No other complete, identical Live Photo could be verified');
        } finally {
            $this->lockingProvider->releaseLock($lock, ILockingProvider::LOCK_EXCLUSIVE);
        }
    }

    /**
     * Keep both surviving components locked while Nextcloud deletes the redundant pair.
     *
     * @return int[]|null Deleted component ids, or null for an unsuitable candidate
     */
    private function deleteWithSurvivor(
        Folder $userFolder,
        LivePhotoPair $source,
        Node $candidate,
        string $imageHash,
        string $videoHash,
        bool $allowPairDeletion
    ): ?array {
        try {
            $survivor = $this->resolver->resolve($candidate, $userFolder);
        } catch (LivePhotoPairProtectionException | NotFoundException $e) {
            return null;
        }
        if ($survivor === null || $survivor->image->getId() !== $candidate->getId()
            || $survivor->image->getId() === $source->image->getId()
            || $survivor->video->getId() === $source->video->getId()
            || !$survivor->image->isReadable() || !$survivor->video->isReadable()
            || $userFolder->getRelativePath($survivor->video->getPath()) === null
        ) {
            return null;
        }

        $locked = [];

        try {
            foreach ($survivor->getFiles() as $component) {
                $component->lock(ILockingProvider::LOCK_SHARED);
                $locked[] = $component;
            }

            // Recheck links and contents after locking; an indexed hash alone may be stale.
            $current = $this->resolver->resolve($survivor->image, $userFolder);
            if ($current === null || $current->video->getId() !== $survivor->video->getId()
                || $this->fileInfoService->getContentHash($survivor->image) !== $imageHash
                || $this->fileInfoService->getContentHash($survivor->video) !== $videoHash
            ) {
                return null;
            }

            $currentSource = $this->resolver->resolve($source->image, $userFolder);
            if ($currentSource === null || $currentSource->video->getId() !== $source->video->getId()
                || $this->fileInfoService->getContentHash($source->image) !== $imageHash
                || $this->fileInfoService->getContentHash($source->video) !== $videoHash
            ) {
                throw new LivePhotoPairProtectionException('The Live Photo changed while preparing deletion');
            }

            // Do not lock the source nodes: core acquires its own locks for the nested MOV deletion.
            if (!$allowPairDeletion) {
                throw new LivePhotoConfirmationRequiredException('Deleting this Live Photo removes both its photo and video');
            }
            $imageId = $source->image->getId();
            $videoId = $source->video->getId();
            $source->image->delete();
            if ($userFolder->getById($imageId) !== []
                || $userFolder->getById($videoId) !== []
            ) {
                throw new NotPermittedException('Nextcloud did not delete both Live Photo components');
            }

            return [$imageId, $videoId];
        } finally {
            foreach (array_reverse($locked) as $component) {
                $component->unlock(ILockingProvider::LOCK_SHARED);
            }
        }
    }
}
