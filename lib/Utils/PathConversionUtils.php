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
        if (!$fileInfo->getOwner()) {
            throw new UnknownOwnerException($fileInfo->getPath());
        }

        $filePath = $fileInfo->getPath();
        if (str_contains($filePath, "\0")) {
            throw new \InvalidArgumentException('Invalid file path');
        }

        $userRoot = rtrim($userFolder->getPath(), '/');
        if ($filePath === $userRoot) {
            return '';
        }
        if ($userRoot !== '' && !str_starts_with($filePath, $userRoot . '/')) {
            throw new \InvalidArgumentException('File path is outside user folder');
        }

        return substr($filePath, strlen($userRoot));
    }

    public static function convertSharedPath(
        Folder $srcUserFolder,
        Folder $targetUserFolder,
        Node $srcNode,
        IShare $share,
        int $strippedFolders
    ): string {
        $targetRoot = rtrim($targetUserFolder->getPath(), '/');
        $rawTarget = str_replace('\\', '/', (string)$share->getTarget());
        if (str_contains($rawTarget, "\0")) {
            throw new \InvalidArgumentException('Invalid share target path');
        }
        $targetSegments = [];
        foreach (explode('/', $rawTarget) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                throw new \InvalidArgumentException('Invalid share target path');
            }
            $targetSegments[] = $segment;
        }
        $baseTarget = $targetRoot . ($targetSegments === [] ? '' : '/' . implode('/', $targetSegments));

        if ($share->getNodeType() === 'file' || $strippedFolders <= 0) {
            return $baseTarget;
        }

        $srcRoot = rtrim($srcUserFolder->getPath(), '/');
        $srcNodePath = str_replace('\\', '/', $srcNode->getPath());
        if (str_contains($srcNodePath, "\0")) {
            throw new \InvalidArgumentException('Invalid shared node path');
        }
        if ($srcRoot !== '' && $srcNodePath !== $srcRoot && !str_starts_with($srcNodePath, $srcRoot . '/')) {
            throw new \InvalidArgumentException('Shared node path is outside source user folder');
        }

        $srcRelative = substr($srcNodePath, strlen($srcRoot));
        $srcParts = [];
        foreach (explode('/', $srcRelative) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                throw new \InvalidArgumentException('Invalid shared node path');
            }
            $srcParts[] = $segment;
        }

        if ($strippedFolders > count($srcParts)) {
            throw new \InvalidArgumentException('Stripped folder depth exceeds shared node path');
        }

        $tailParts = array_slice($srcParts, -$strippedFolders);
        $tailPath = implode('/', $tailParts);

        return $tailPath === '' ? $baseTarget : $baseTarget . '/' . $tailPath;
    }
}
