<?php
namespace OCA\DuplicateFinder\Service;

use OCP\Files\Node;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCA\DuplicateFinder\Db\FileInfo;

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

    public function getUserFolder(string $user) : Folder
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
    public function getNodeByFileInfo(FileInfo $fileInfo, ?string $fallbackUID = null): Node
    {
        $userFolder = null;
        if ($fileInfo->getOwner()) {
            try {
                $userFolder = $this->rootFolder->getUserFolder($fileInfo->getOwner());
            } catch (\OC\User\NoUserException $e) {
                // Handle Team Folders or system files where owner doesn't exist as regular user
                $this->logger->debug('Owner user does not exist, likely a Team/Group folder', [
                    'owner' => $fileInfo->getOwner(),
                    'path' => $fileInfo->getPath(),
                    'fallbackUID' => $fallbackUID
                ]);
                // Try with fallback UID or use root folder directly
                if (!is_null($fallbackUID)) {
                    try {
                        $userFolder = $this->rootFolder->getUserFolder($fallbackUID);
                        $fileInfo->setOwner($fallbackUID);
                    } catch (\OC\User\NoUserException $e2) {
                        // Fallback UID also doesn't exist, will use root folder
                    }
                }
            }
        } elseif (!is_null($fallbackUID)) {
            try {
                $userFolder = $this->rootFolder->getUserFolder($fallbackUID);
                $fileInfo->setOwner($fallbackUID);
            } catch (\OC\User\NoUserException $e) {
                // Fallback UID doesn't exist, will use root folder
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
        return $this->rootFolder->get($fileInfo->getPath());
    }
}
