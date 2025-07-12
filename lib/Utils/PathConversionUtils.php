<?php

namespace OCA\DuplicateFinder\Utils;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\UnknownOwnerException;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Share\IShare;

class PathConversionUtils
{
    public static function convertRelativePathToUserFolder(FileInfo $fileInfo, Folder $userFolder): string
    {
        if ($fileInfo->getOwner()) {
            return substr($fileInfo->getPath(), strlen($userFolder->getPath()));
        } else {
            throw new UnknownOwnerException($fileInfo->getPath());
        }
    }

    public static function convertSharedPath(
        Folder $srcUserFolder,
        Folder $targetUserFolder,
        Node $srcNode,
        IShare $share,
        int $strippedFolders
    ): string {
        if ($share->getNodeType() === 'file') {
            return $targetUserFolder->getPath().$share->getTarget();
        }
        $srcPath = substr($srcNode->getPath(), strlen($srcUserFolder->getPath()));
        $srcPathParts = explode('/', $srcPath);
        $srcPathParts = array_slice($srcPathParts, -$strippedFolders);
        $srcPath = implode('/', $srcPathParts);

        return $targetUserFolder->getPath().$share->getTarget().'/'.$srcPath;
    }
}
