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

    public function getNodeByFileInfo(FileInfo $fileInfo, ?string $fallbackUID = null): ?Node
    {
        $userFolder = null;
        if ($fileInfo->getOwner()) {
            $userFolder = $this->rootFolder->getUserFolder($fileInfo->getOwner());
        } elseif (!is_null($fallbackUID)) {
            $userFolder = $this->rootFolder->getUserFolder($fallbackUID);
            $fileInfo->setOwner($fallbackUID);
        }
        if (!is_null($userFolder)) {
            try {
                $relativePath = PathConversionUtils::convertRelativePathToUserFolder($fileInfo, $userFolder);
                return $userFolder->get($relativePath);
            } catch (NotFoundException $e) {
                $this->logger->warning('File not found in user folder: ' . $fileInfo->getPath());
                return null;
            }
        }
        try {
            return $this->rootFolder->get($fileInfo->getPath());
        } catch (NotFoundException $e) {
            $this->logger->warning('File not found in root folder: ' . $fileInfo->getPath());
            return null;
        }
    }
}
