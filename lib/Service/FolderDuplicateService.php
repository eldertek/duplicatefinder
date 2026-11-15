<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;

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
        $folderTrees = $this->buildTreesFromFileDuplicates($duplicates);

        if ($folderFileCounts !== null) {
            foreach ($folderTrees as $folderPath => $files) {
                if (isset($folderFileCounts[$folderPath]) && $folderFileCounts[$folderPath] !== count($files)) {
                    unset($folderTrees[$folderPath]);
                }
            }
        }

        return $this->groupDuplicateFolders($folderTrees, $minFiles, $minSize);
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
