<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use Throwable;

class FolderDuplicateService
{
    /**
     * Compute duplicate folder groups from enriched FileDuplicate entities.
     *
     * @param FileDuplicate[] $duplicates
     * @param int $minFiles Minimum number of files inside a folder to qualify
     * @param int $minSize Minimum total bytes of a folder to qualify
     * @param array<string, int>|null $folderFileCounts Optional map of normalized folder path => actual file count
     * @return array<int, array<string, mixed>>
     */
    public function findFromFileDuplicates(
        array $duplicates,
        int $minFiles = 1,
        int $minSize = 0,
        ?array $folderFileCounts = null
    ): array {
        $folderTrees = $this->filterTreesByFileCounts(
            $this->buildTreesFromFileDuplicates($duplicates),
            $folderFileCounts
        );

        return $this->groupDuplicateFolders($folderTrees, $minFiles, $minSize);
    }

    /**
     * Compute detailed duplicate folder groups and summary for the UI/API.
     *
     * When a user root folder is provided without precomputed counts, live file counts
     * exclude folders that contain additional non-duplicate files in storage.
     *
     * @param FileDuplicate[] $duplicates
     * @param int $minFiles
     * @param int $minSize
     * @param Folder|null $userFolder
     * @param callable(string):bool|null $isProtectedFn
     * @param array<string, int>|null $folderFileCounts
     * @return array{groups: array<int, array<string, mixed>>, summary: array{groupCount: int, duplicateFolderCount: int, reclaimableSize: int}}
     */
    public function findFolderDuplicatesReport(
        array $duplicates,
        int $minFiles = 1,
        int $minSize = 0,
        ?Folder $userFolder = null,
        ?callable $isProtectedFn = null,
        ?array $folderFileCounts = null
    ): array {
        $folderTrees = $this->buildTreesFromFileDuplicates($duplicates);
        if ($folderFileCounts === null && $userFolder !== null && $folderTrees !== []) {
            $folderFileCounts = $this->countLiveFolderFiles($userFolder, $folderTrees);
        }

        $groups = $this->groupDuplicateFolders(
            $this->filterTreesByFileCounts($folderTrees, $folderFileCounts),
            $minFiles,
            $minSize
        );
        $fileIndex = $this->indexDuplicateFiles($duplicates);

        $enrichedGroups = [];
        foreach ($groups as $group) {
            $folderDetails = [];
            $hasProtectedFolder = false;

            foreach ($group['folders'] as $folderPath) {
                $folderProtected = $isProtectedFn !== null ? (bool)$isProtectedFn($folderPath) : false;
                $folderFiles = [];
                $protectedFileCount = 0;
                $deletableFileCount = 0;
                $deletableSize = 0;

                foreach ($group['files'] as $fileSummary) {
                    $relativePath = (string)$fileSummary['relativePath'];
                    $normalizedChildPath = $folderPath . '/' . $relativePath;
                    $indexed = $fileIndex[$normalizedChildPath] ?? null;

                    $isFileProtected = ($indexed['isInOriginFolder'] ?? false)
                        || $folderProtected
                        || ($isProtectedFn !== null && (bool)$isProtectedFn($normalizedChildPath));

                    $fileSize = (int)($indexed['size'] ?? $fileSummary['size']);
                    if ($isFileProtected) {
                        $protectedFileCount++;
                    } else {
                        $deletableFileCount++;
                        $deletableSize += $fileSize;
                    }

                    $folderFiles[] = [
                        'path' => $indexed['path'] ?? $normalizedChildPath,
                        'relativePath' => $relativePath,
                        'nodeId' => $indexed['nodeId'] ?? null,
                        'size' => $fileSize,
                        'mimetype' => $indexed['mimetype'] ?? '',
                        'fileHash' => $indexed['fileHash'] ?? (string)$fileSummary['hash'],
                        'isInOriginFolder' => $isFileProtected,
                    ];
                }

                $isAnyProtected = $folderProtected || $protectedFileCount > 0;
                if ($isAnyProtected) {
                    $hasProtectedFolder = true;
                }

                $folderDetails[] = [
                    'path' => $folderPath,
                    'isProtected' => $isAnyProtected,
                    'protectedFileCount' => $protectedFileCount,
                    'deletableFileCount' => $deletableFileCount,
                    'deletableSize' => $deletableSize,
                    'files' => $folderFiles,
                ];
            }

            $totalDeletableAcrossFolders = 0;
            foreach ($folderDetails as $detail) {
                $totalDeletableAcrossFolders += $detail['deletableSize'];
            }
            $maxReclaimable = 0;
            foreach ($folderDetails as $keptCandidate) {
                $reclaimableIfKept = $totalDeletableAcrossFolders - $keptCandidate['deletableSize'];
                if ($reclaimableIfKept > $maxReclaimable) {
                    $maxReclaimable = $reclaimableIfKept;
                }
            }

            $group['reclaimableSize'] = $maxReclaimable;
            $group['hasProtectedFolder'] = $hasProtectedFolder;
            $group['folderDetails'] = $folderDetails;
            $enrichedGroups[] = $group;
        }

        return [
            'groups' => $enrichedGroups,
            'summary' => $this->summarizeReport($enrichedGroups),
        ];
    }

    /**
     * Count live files inside each candidate folder, stopping early once the count
     * exceeds the duplicate-tree entry count.
     *
     * @param Folder $userFolder
     * @param array<string, array<string, array{hash: string, size: int}>> $folderTrees
     * @return array<string, int>
     */
    public function countLiveFolderFiles(Folder $userFolder, array $folderTrees): array
    {
        $counts = [];

        foreach ($folderTrees as $folderPath => $entries) {
            if (!is_array($entries)) {
                continue;
            }
            $limit = count($entries) + 1;
            try {
                $node = $userFolder->get($folderPath);
                if (!($node instanceof Folder)) {
                    $counts[$folderPath] = -1;
                    continue;
                }
                $counts[$folderPath] = $this->countFilesUpToLimit($node, $limit);
            } catch (NotFoundException $e) {
                $counts[$folderPath] = -1;
            } catch (Throwable $e) {
                // Leave count unset if storage cannot be inspected cleanly
            }
        }

        return $counts;
    }

    /**
     * @param array<string, array<string, array{hash: string, size: int}>> $folderTrees
     * @param array<string, int>|null $folderFileCounts
     * @return array<string, array<string, array{hash: string, size: int}>>
     */
    private function filterTreesByFileCounts(array $folderTrees, ?array $folderFileCounts): array
    {
        if ($folderFileCounts !== null) {
            foreach ($folderTrees as $folderPath => $files) {
                if (isset($folderFileCounts[$folderPath]) && $folderFileCounts[$folderPath] !== count($files)) {
                    unset($folderTrees[$folderPath]);
                }
            }
        }

        return $folderTrees;
    }

    private function countFilesUpToLimit(Folder $folder, int $limit): int
    {
        if ($limit <= 0) {
            return 0;
        }

        $count = 0;
        foreach ($folder->getDirectoryListing() as $child) {
            if ($child instanceof Folder) {
                $count += $this->countFilesUpToLimit($child, $limit - $count);
            } elseif ($child instanceof File) {
                $count++;
            }

            if ($count >= $limit) {
                return $count;
            }
        }

        return $count;
    }

    /**
     * @param FileDuplicate[] $duplicates
     * @return array<string, array{path: string, nodeId: int|null, size: int, mimetype: string, fileHash: string, isInOriginFolder: bool}>
     */
    private function indexDuplicateFiles(array $duplicates): array
    {
        $index = [];

        foreach ($duplicates as $duplicate) {
            if (!$duplicate instanceof FileDuplicate) {
                continue;
            }
            $hash = (string)$duplicate->getHash();
            foreach ($duplicate->getFiles() as $file) {
                if (!$file instanceof FileInfo) {
                    continue;
                }
                $normalized = $this->normalizeUserFilesPath($file->getPath());
                if ($normalized === '' || $normalized === '/') {
                    continue;
                }
                $index[$normalized] = [
                    'path' => $file->getPath(),
                    'nodeId' => $file->getNodeId(),
                    'size' => (int)$file->getSize(),
                    'mimetype' => (string)$file->getMimetype(),
                    'fileHash' => $hash,
                    'isInOriginFolder' => (bool)$file->getIsInOriginFolder(),
                ];
            }
        }

        return $index;
    }

    /**
     * Build relative tree maps for every ancestor directory of duplicate files.
     *
     * @param FileDuplicate[] $duplicates
     * @return array<string, array<string, array{hash: string, size: int}>>
     */
    public function buildTreesFromFileDuplicates(array $duplicates): array
    {
        $trees = [];

        foreach ($duplicates as $duplicate) {
            if (!$duplicate instanceof FileDuplicate) {
                continue;
            }

            $hash = (string)$duplicate->getHash();
            foreach ($duplicate->getFiles() as $file) {
                if (!$file instanceof FileInfo) {
                    continue;
                }

                $normalizedPath = $this->normalizeUserFilesPath($file->getPath());
                if ($normalizedPath === '' || $normalizedPath === '/') {
                    continue;
                }

                $size = (int)$file->getSize();
                $segments = array_values(array_filter(explode('/', ltrim($normalizedPath, '/')), function ($part) {
                    return $part !== '';
                }));

                if (count($segments) < 2) {
                    // File is directly at the root (/file.ext), no parent folder to compare
                    continue;
                }

                $maxFolderDepth = count($segments) - 1;
                for ($depth = 1; $depth <= $maxFolderDepth; $depth++) {
                    $folderPath = '/' . implode('/', array_slice($segments, 0, $depth));
                    $relativePath = implode('/', array_slice($segments, $depth));

                    if (!isset($trees[$folderPath])) {
                        $trees[$folderPath] = [];
                    }

                    $trees[$folderPath][$relativePath] = [
                        'hash' => $hash,
                        'size' => $size,
                    ];
                }
            }
        }

        return $trees;
    }

    /**
     * Group folders whose sorted relative tree (relativePath, hash, size) is 100% identical.
     *
     * @param array<string, array<string, array{hash: string, size: int}>> $folderTrees
     * @param int $minFiles
     * @param int $minSize
     * @return array<int, array<string, mixed>>
     */
    public function groupDuplicateFolders(
        array $folderTrees,
        int $minFiles = 1,
        int $minSize = 0
    ): array {
        $minFiles = max(1, $minFiles);
        $minSize = max(0, $minSize);

        $bySignature = [];

        foreach ($folderTrees as $rawFolderPath => $entries) {
            if (!is_array($entries) || count($entries) < $minFiles) {
                continue;
            }

            $folderPath = $this->normalizeFolderPath((string)$rawFolderPath);
            if ($folderPath === '' || $folderPath === '/') {
                continue;
            }

            ksort($entries, SORT_STRING);

            $totalSize = 0;
            $signatureParts = [];
            $fileSummary = [];

            foreach ($entries as $relativePath => $meta) {
                $rel = ltrim((string)$relativePath, '/');
                $hash = (string)($meta['hash'] ?? '');
                $size = (int)($meta['size'] ?? 0);
                if ($rel === '' || $hash === '') {
                    continue;
                }

                $totalSize += $size;
                $signatureParts[] = $rel . '|' . $hash . '|' . $size;
                $fileSummary[] = [
                    'relativePath' => $rel,
                    'hash' => $hash,
                    'size' => $size,
                ];
            }

            if (count($fileSummary) < $minFiles || $totalSize < $minSize) {
                continue;
            }

            $signature = hash('sha256', implode("\n", $signatureParts));
            if (!isset($bySignature[$signature])) {
                $bySignature[$signature] = [
                    'signature' => $signature,
                    'fileCount' => count($fileSummary),
                    'totalSize' => $totalSize,
                    'reclaimableSize' => 0,
                    'folders' => [],
                    'files' => $fileSummary,
                ];
            }

            if (!in_array($folderPath, $bySignature[$signature]['folders'], true)) {
                $bySignature[$signature]['folders'][] = $folderPath;
            }
        }

        $groups = [];
        foreach ($bySignature as $group) {
            if (count($group['folders']) < 2) {
                continue;
            }

            sort($group['folders'], SORT_STRING);
            $group['reclaimableSize'] = $group['totalSize'] * (count($group['folders']) - 1);
            $groups[] = $group;
        }

        $groups = $this->pruneContainedSubfolderGroups($groups);

        usort($groups, function (array $a, array $b) {
            if ($a['reclaimableSize'] !== $b['reclaimableSize']) {
                return $b['reclaimableSize'] <=> $a['reclaimableSize'];
            }
            if ($a['fileCount'] !== $b['fileCount']) {
                return $b['fileCount'] <=> $a['fileCount'];
            }
            return strcmp((string)($a['folders'][0] ?? ''), (string)($b['folders'][0] ?? ''));
        });

        return array_values($groups);
    }

    /**
     * Compute aggregate report summary statistics across duplicate folder groups.
     *
     * @param array<int, array<string, mixed>> $groups
     * @return array{groupCount: int, duplicateFolderCount: int, reclaimableSize: int}
     */
    public function summarizeReport(array $groups): array
    {
        $duplicateFolderCount = 0;
        $reclaimableSize = 0;

        foreach ($groups as $group) {
            $duplicateFolderCount += count($group['folders'] ?? []);
            $reclaimableSize += (int)($group['reclaimableSize'] ?? 0);
        }

        return [
            'groupCount' => count($groups),
            'duplicateFolderCount' => $duplicateFolderCount,
            'reclaimableSize' => $reclaimableSize,
        ];
    }

    /**
     * Normalize Nextcloud "/<user>/files/..." paths to user-relative "/..." paths.
     */
    public function normalizeUserFilesPath(string $path): string
    {
        $normalized = preg_replace('#^/[^/]+/files/#', '/', $path);
        if (!is_string($normalized) || $normalized === '') {
            return '';
        }

        return '/' . ltrim($normalized, '/');
    }

    private function normalizeFolderPath(string $folderPath): string
    {
        $trimmed = rtrim($folderPath, '/');
        if ($trimmed === '') {
            return '/';
        }

        return '/' . ltrim($trimmed, '/');
    }

    /**
     * Remove child folder groups when every folder in the child group is a strict descendant
     * of a corresponding folder in an already-matched parent group of equal or larger size.
     *
     * @param array<int, array<string, mixed>> $groups
     * @return array<int, array<string, mixed>>
     */
    private function pruneContainedSubfolderGroups(array $groups): array
    {
        $kept = [];

        foreach ($groups as $candidateIndex => $candidate) {
            $isCovered = false;

            foreach ($groups as $otherIndex => $other) {
                if ($candidateIndex === $otherIndex) {
                    continue;
                }
                if (count($other['folders']) < count($candidate['folders'])) {
                    continue;
                }
                if ($other['fileCount'] < $candidate['fileCount']) {
                    continue;
                }

                $allDescendants = true;
                $usedParents = [];
                foreach ($candidate['folders'] as $childFolder) {
                    $matchedParent = null;
                    foreach ($other['folders'] as $parentFolder) {
                        if (
                            !isset($usedParents[$parentFolder]) &&
                            $childFolder !== $parentFolder &&
                            strpos($childFolder, $parentFolder . '/') === 0
                        ) {
                            $matchedParent = $parentFolder;
                            break;
                        }
                    }
                    if ($matchedParent === null) {
                        $allDescendants = false;
                        break;
                    }
                    $usedParents[$matchedParent] = true;
                }

                if ($allDescendants) {
                    $isCovered = true;
                    break;
                }
            }

            if (!$isCovered) {
                $kept[] = $candidate;
            }
        }

        return $kept;
    }
}
