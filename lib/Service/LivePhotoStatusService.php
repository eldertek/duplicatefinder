<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCP\Files\NotFoundException;

class LivePhotoStatusService
{
    public function __construct(
        private FolderService $folderService,
        private LivePhotoResolver $resolver
    ) {
    }

    /**
     * Identify a still image whose recorded motion component left the user's files.
     *
     * @param FileInfo $fileInfo An enriched file visible in the duplicate results
     * @param string $userId The requesting user, including access through shares
     * @return bool Whether the recorded Live Photo video is missing
     */
    public function isVideoMissing(FileInfo $fileInfo, string $userId): bool
    {
        if (!$fileInfo->getNodeId() || !str_starts_with($fileInfo->getMimetype() ?? '', 'image/')) {
            return false;
        }

        try {
            $folder = $this->folderService->getUserFolder($userId);
            foreach ($folder->getById($fileInfo->getNodeId()) as $node) {
                return $this->resolver->hasMissingPeer($node, $folder);
            }
        } catch (NotFoundException | LivePhotoPairProtectionException $e) {
            return false;
        }

        return false;
    }
}
