<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class FolderService
{
    /** @var IRootFolder */
    private $rootFolder;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        IRootFolder $rootFolder,
        LoggerInterface $logger
    ) {
        $this->rootFolder = $rootFolder;
        $this->logger = $logger;
    }

    public function getUserFolder(string $user): Folder
    {
        return $this->rootFolder->getUserFolder($user);
    }


    /*
     *  The Node specified by the FileInfo isn't always in the cache.
     *  if so, a get on the root folder will raise an |OCP\Files\NotFoundException
     *  To avoid this, it is first tried to get the Node by the user folder. Because
     *  the user folder supports lazy loading, it works even if the file isn't in the cache
     *  If the owner is unknown, it is at least tried to get the Node from the root folder
     */
    public function getNodeByFileInfo(FileInfo $fileInfo, ?string $fallbackUID = null): ?Node
    {
        $userFolder = null;
        if ($fileInfo->getOwner()) {
            try {
                $userFolder = $this->rootFolder->getUserFolder($fileInfo->getOwner());
            } catch (\OC\User\NoUserException $e) {
                // Handle Team Folders or system files where owner doesn't exist as regular user
                // Log silently and continue - not a blocking error (following Nextcloud core approach)
                // Try with fallback UID or use root folder directly
                if (!is_null($fallbackUID)) {
                    try {
                        $userFolder = $this->rootFolder->getUserFolder($fallbackUID);
                        $fileInfo->setOwner($fallbackUID);
                    } catch (\OC\User\NoUserException $e2) {
                        // Fallback UID also doesn't exist, will use root folder - this is expected for Team Folders
                    }
                }
            }
        } elseif (!is_null($fallbackUID)) {
            try {
                $userFolder = $this->rootFolder->getUserFolder($fallbackUID);
                $fileInfo->setOwner($fallbackUID);
            } catch (\OC\User\NoUserException $e) {
                // Fallback UID doesn't exist, will use root folder - this is expected for Team Folders
            }
        }
        if (!is_null($userFolder)) {
            try {
                $relativePath = PathConversionUtils::convertRelativePathToUserFolder($fileInfo, $userFolder);

                return $userFolder->get($relativePath);
            } catch (NotFoundException $e) {
                //If the file is not known in the user root (cached) it's fine to use the root
            }
        }

        // Last resort: try with root folder
        try {
            return $this->rootFolder->get($fileInfo->getPath());
        } catch (NotFoundException $e) {
            $this->logger->warning('File not found even with root folder access', [
                'path' => $fileInfo->getPath(),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }
}
