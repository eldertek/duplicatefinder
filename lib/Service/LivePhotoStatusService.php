<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCP\Files\NotFoundException;
use OCP\FilesMetadata\IFilesMetadataManager;

class LivePhotoStatusService
{
    public function __construct(
        private FolderService $folderService,
        private LivePhotoResolver $resolver,
        private IFilesMetadataManager $metadataManager
    ) {
    }

    /**
     * Mark still images whose recorded motion component left the user's files.
     *
     * Fetch metadata once for the batch; ordinary images need no file lookups.
     *
     * @param FileInfo[] $files Enriched files visible in the duplicate results
     * @param string $userId The requesting user, including access through shares
     * @return void
     */
    public function markMissingVideos(array $files, string $userId): void
    {
        $images = [];
        foreach ($files as $file) {
            $file->setIsLivePhotoVideoMissing(false);
            if ($file->getNodeId() && str_starts_with($file->getMimetype() ?? '', 'image/')) {
                $images[$file->getNodeId()][] = $file;
            }
        }
        if ($images === []) {
            return;
        }

        $metadata = $this->metadataManager->getMetadataForFiles(array_keys($images));
        $folder = null;
        $peerExists = [];
        foreach ($images as $id => $imageFiles) {
            try {
                $peerId = $this->resolver->getPeerIdFromMetadata($metadata[$id] ?? null);
                if ($peerId === null || $peerId === $id) {
                    continue;
                }

                // Only recorded Live Photos need a peer lookup; share it within this batch.
                $folder ??= $this->folderService->getUserFolder($userId);
                if (!array_key_exists($peerId, $peerExists)) {
                    $peerExists[$peerId] = $folder->getById($peerId) !== [];
                }
                foreach ($imageFiles as $file) {
                    $file->setIsLivePhotoVideoMissing(!$peerExists[$peerId]);
                }
            } catch (NotFoundException | LivePhotoPairProtectionException $e) {
                continue;
            }
        }
    }
}
