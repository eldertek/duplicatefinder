<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Model\LivePhotoPair;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\FilesMetadata\Exceptions\FilesMetadataNotFoundException;
use OCP\FilesMetadata\Exceptions\FilesMetadataTypeException;
use OCP\FilesMetadata\IFilesMetadataManager;
use OCP\FilesMetadata\Model\IFilesMetadata;

class LivePhotoResolver
{
    public function __construct(private IFilesMetadataManager $metadataManager)
    {
    }

    /**
     * Resolve a Live Photo without guessing its peer from a filename.
     *
     * Older Nextcloud versions follow one-way links and peers outside the folder.
     * Refuse those links instead of allowing deletion to affect an unchecked file.
     *
     * @param Node $node Either component, for example Photos/IMG_1234.MOV
     * @param Folder $userFolder The requesting user's visible filesystem, as used by core
     * @return LivePhotoPair|null Null when no link exists or its peer is no longer in the user's files
     * @throws LivePhotoPairProtectionException When the recorded pair cannot be verified
     */
    public function resolve(Node $node, Folder $userFolder): ?LivePhotoPair
    {
        if (!($node instanceof File)) {
            return null;
        }

        $peerId = $this->getPeerId($node);
        if ($peerId === null) {
            return null;
        }

        foreach ($node->getParent()->getDirectoryListing() as $peer) {
            if (!($peer instanceof File) || $peer->getId() !== $peerId || $peerId === $node->getId()) {
                continue;
            }

            if ($this->getPeerId($peer) !== $node->getId()) {
                throw new LivePhotoPairProtectionException('Cannot verify both components of this Live Photo');
            }

            if (str_starts_with($node->getMimetype(), 'image/') && $peer->getMimetype() === 'video/quicktime') {
                return new LivePhotoPair($node, $peer);
            }
            if ($node->getMimetype() === 'video/quicktime' && str_starts_with($peer->getMimetype(), 'image/')) {
                return new LivePhotoPair($peer, $node);
            }

            throw new LivePhotoPairProtectionException('Cannot verify both components of this Live Photo');
        }

        // Core cannot delete a peer absent from the user's files, including a peer in trash.
        if ($peerId !== $node->getId() && $userFolder->getById($peerId) === []) {
            return null;
        }

        throw new LivePhotoPairProtectionException('Cannot verify both components of this Live Photo');
    }

    /**
     * Read a recorded peer from metadata already fetched individually or in a batch.
     *
     * @param IFilesMetadata|null $metadata Metadata for a file, when available
     * @return int|null The recorded peer id, or null for an ordinary file
     * @throws LivePhotoPairProtectionException When a recorded link is invalid
     */
    public function getPeerIdFromMetadata(?IFilesMetadata $metadata): ?int
    {
        if ($metadata === null || !$metadata->hasKey('files-live-photo')) {
            return null;
        }

        try {
            $value = $metadata->getString('files-live-photo');
        } catch (FilesMetadataNotFoundException | FilesMetadataTypeException $e) {
            throw new LivePhotoPairProtectionException('Invalid Live Photo component link', 0, $e);
        }
        if (!ctype_digit($value) || (int)$value <= 0 || (string)(int)$value !== $value) {
            throw new LivePhotoPairProtectionException('Invalid Live Photo component link');
        }

        return (int)$value;
    }

    /**
     * Read the public metadata API shared by Nextcloud 28 and later.
     *
     * @return int|null The peer node id, or null for an ordinary file
     * @throws LivePhotoPairProtectionException When a recorded link is invalid
     */
    private function getPeerId(File $file): ?int
    {
        $metadata = $this->metadataManager->getMetadataForFiles([$file->getId()])[$file->getId()] ?? null;

        return $this->getPeerIdFromMetadata($metadata);
    }
}
