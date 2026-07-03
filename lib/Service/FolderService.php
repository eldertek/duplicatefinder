<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

class FolderService
{
    /** @var IRootFolder */
    private $rootFolder;
    /** @var IUserManager */
    private $userManager;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        IRootFolder $rootFolder,
        IUserManager $userManager,
        LoggerInterface $logger
    ) {
        $this->rootFolder = $rootFolder;
        $this->userManager = $userManager;
        $this->logger = $logger;
    }

    public function getUserFolder(string $user): Folder
    {
        return $this->rootFolder->getUserFolder($user);
    }

    /**
     * getUserFolder without triggering the core "Backends provided no user object"
     * error log when the uid does not exist (group folders, deleted accounts, #158)
     */
    private function getUserFolderIfUserExists(string $uid): ?Folder
    {
        if (!$this->userManager->userExists($uid)) {
            return null;
        }

        try {
            return $this->rootFolder->getUserFolder($uid);
        } catch (\OC\User\NoUserException $e) {
            return null;
        }
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
            // Owner may not exist as a regular user (Team/group folders, deleted accounts):
            // fall back without touching the core error log (#158)
            $userFolder = $this->getUserFolderIfUserExists($fileInfo->getOwner());
        }
        if (is_null($userFolder) && !is_null($fallbackUID)) {
            $userFolder = $this->getUserFolderIfUserExists($fallbackUID);
        }
        if (!is_null($userFolder)) {
            try {
                if ($this->isPathInsideFolder($fileInfo->getPath(), $userFolder->getPath())) {
                    if (!is_null($fallbackUID) && $fileInfo->getOwner() !== $fallbackUID) {
                        $fileInfo->setOwner($fallbackUID);
                    }

                    $relativePath = PathConversionUtils::convertRelativePathToUserFolder($fileInfo, $userFolder);
                    $node = $userFolder->get($relativePath);

                    return $node;
                }
            } catch (NotFoundException $e) {
                //If the file is not known in the user root (cached) it's fine to use the root
            }
        }

        // Last resort: try with root folder
        try {
            return $this->rootFolder->get($fileInfo->getPath());
        } catch (NotFoundException $e) {
            $this->logger->debug('File not found even with root folder access', [
                'path' => $fileInfo->getPath(),
                'error' => $e->getMessage(),
            ]);

            return null;
        } catch (\OC\User\NoUserException $e) {
            // Group folders / Team folders paths whose "user" segment is not a real user (#158)
            $this->logger->debug('No user object for path, skipping', [
                'path' => $fileInfo->getPath(),
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    private function isPathInsideFolder(string $path, string $folderPath): bool
    {
        $folderPath = rtrim($folderPath, '/');

        return $path === $folderPath || str_starts_with($path, $folderPath . '/');
    }
}
