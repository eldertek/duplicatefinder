<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;
use Throwable;

class EmptyFolderCleanupService
{
    private const MAX_SCAN_DEPTH = 32;

    private FolderService $folderService;
    private OriginFolderService $originFolderService;
    private ExcludedFolderService $excludedFolderService;
    private LoggerInterface $logger;

    public function __construct(
        FolderService $folderService,
        OriginFolderService $originFolderService,
        ExcludedFolderService $excludedFolderService,
        LoggerInterface $logger
    ) {
        $this->folderService = $folderService;
        $this->originFolderService = $originFolderService;
        $this->excludedFolderService = $excludedFolderService;
        $this->logger = $logger;
    }

    /**
     * Detect folders that are completely empty (no files anywhere in their subtree)
     * and safe for the user to delete.
     *
     * Never returns the user root, origin (protected) folders, excluded folders,
     * mounted external/shared roots, non-deletable folders, or ancestors of any of those.
     *
     * @param string $userId
     * @param string[] $candidatePaths Optional folder or deleted-file paths to scope post-cleanup detection
     * @return array<int, array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}>
     */
    public function findEmptyFolders(string $userId, array $candidatePaths = []): array
    {
        $this->originFolderService->setUserId($userId);
        $this->excludedFolderService->setUserId($userId);

        $originPaths = $this->loadNormalizedOriginPaths();
        $userFolder = $this->folderService->getUserFolder($userId);

        /** @var array<string, array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}> $detected */
        $detected = [];
        /** @var array<string, bool> $subtreeEmptyMemo */
        $subtreeEmptyMemo = [];

        $normalizedCandidates = [];
        foreach ($candidatePaths as $rawPath) {
            if (!is_string($rawPath)) {
                continue;
            }
            $normalized = $this->normalizeUserRelativePath($userId, $rawPath);
            if ($normalized !== null && $normalized !== '/') {
                $normalizedCandidates[$normalized] = true;
            }
        }

        if ($normalizedCandidates === []) {
            $this->scanSubtree(
                $userFolder,
                '/',
                $originPaths,
                $detected,
                $subtreeEmptyMemo,
                0
            );
        } else {
            foreach (array_keys($normalizedCandidates) as $candidatePath) {
                $this->scanCandidateAndAncestors(
                    $userFolder,
                    $candidatePath,
                    $originPaths,
                    $detected,
                    $subtreeEmptyMemo
                );
            }
        }

        $result = array_values($detected);
        usort($result, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));

        return $result;
    }

    /**
     * Delete selected empty folders deepest-first.
     *
     * A folder is only deleted if its live directory listing is strictly empty at deletion time,
     * guaranteeing that neither newly created files nor unselected subfolders can ever be removed.
     *
     * @param string $userId
     * @param string[] $paths
     * @return array{deleted: string[], errors: array<int, array{path: string, error: string, message: string}>}
     */
    public function deleteEmptyFolders(string $userId, array $paths): array
    {
        $this->originFolderService->setUserId($userId);
        $this->excludedFolderService->setUserId($userId);

        $originPaths = $this->loadNormalizedOriginPaths();
        $userFolder = $this->folderService->getUserFolder($userId);

        $uniquePaths = [];
        $errors = [];

        foreach ($paths as $rawPath) {
            if (!is_string($rawPath)) {
                continue;
            }
            $normalized = $this->normalizeUserRelativePath($userId, $rawPath);
            if ($normalized === null || $normalized === '/') {
                $errors[] = [
                    'path' => (string)$rawPath,
                    'error' => 'INVALID_PATH',
                    'message' => 'Invalid or root folder path cannot be deleted',
                ];
                continue;
            }
            $uniquePaths[$normalized] = true;
        }

        $orderedPaths = array_keys($uniquePaths);
        usort($orderedPaths, static function (string $a, string $b): int {
            $depthDiff = substr_count($b, '/') <=> substr_count($a, '/');
            if ($depthDiff !== 0) {
                return $depthDiff;
            }
            $lenDiff = strlen($b) <=> strlen($a);
            if ($lenDiff !== 0) {
                return $lenDiff;
            }

            return strcmp($a, $b);
        });

        $deleted = [];

        foreach ($orderedPaths as $folderPath) {
            if ($this->isInsideOriginFolder($folderPath, $originPaths)) {
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'ORIGIN_FOLDER_PROTECTED',
                    'message' => 'Cannot delete a protected origin folder',
                ];
                continue;
            }

            if ($this->excludedFolderService->isPathExcluded($folderPath)) {
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'EXCLUDED_FOLDER',
                    'message' => 'Cannot delete an excluded folder',
                ];
                continue;
            }

            try {
                $node = $userFolder->get($folderPath);
                if (!($node instanceof Folder)) {
                    $errors[] = [
                        'path' => $folderPath,
                        'error' => 'NOT_A_FOLDER',
                        'message' => 'Target path is not a folder',
                    ];
                    continue;
                }

                $resolvedRelative = $this->normalizeResolvedRelativePath($userFolder->getRelativePath($node->getPath()));
                if ($resolvedRelative !== null && $resolvedRelative !== $folderPath) {
                    if ($resolvedRelative === '/') {
                        $errors[] = [
                            'path' => $folderPath,
                            'error' => 'INVALID_PATH',
                            'message' => 'Root folder cannot be deleted',
                        ];
                        continue;
                    }
                    if ($this->isInsideOriginFolder($resolvedRelative, $originPaths)) {
                        $errors[] = [
                            'path' => $folderPath,
                            'error' => 'ORIGIN_FOLDER_PROTECTED',
                            'message' => 'Cannot delete a protected origin folder',
                        ];
                        continue;
                    }
                    if ($this->excludedFolderService->isPathExcluded($resolvedRelative)) {
                        $errors[] = [
                            'path' => $folderPath,
                            'error' => 'EXCLUDED_FOLDER',
                            'message' => 'Cannot delete an excluded folder',
                        ];
                        continue;
                    }
                }

                if ($node->isMounted()) {
                    $errors[] = [
                        'path' => $folderPath,
                        'error' => 'MOUNTED_FOLDER',
                        'message' => 'Cannot delete a mounted storage or share root',
                    ];
                    continue;
                }

                if (!$node->isDeletable()) {
                    $errors[] = [
                        'path' => $folderPath,
                        'error' => 'PERMISSION_DENIED',
                        'message' => 'Permission denied to delete folder',
                    ];
                    continue;
                }

                if ($node->getDirectoryListing() !== []) {
                    $errors[] = [
                        'path' => $folderPath,
                        'error' => 'FOLDER_NOT_EMPTY',
                        'message' => 'Folder is not empty',
                    ];
                    continue;
                }

                $node->delete();
                $deleted[] = $folderPath;
                $this->logger->info('Deleted empty folder: {path}', ['path' => $folderPath]);
            } catch (NotFoundException $e) {
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'FOLDER_NOT_FOUND',
                    'message' => 'Folder not found',
                ];
            } catch (LockedException $e) {
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'FOLDER_LOCKED',
                    'message' => 'Folder is locked',
                ];
            } catch (NotPermittedException $e) {
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'PERMISSION_DENIED',
                    'message' => 'Permission denied to delete folder',
                ];
            } catch (Throwable $e) {
                $this->logger->error('Unexpected error deleting empty folder: {path}', [
                    'path' => $folderPath,
                    'error' => $e->getMessage(),
                ]);
                $errors[] = [
                    'path' => $folderPath,
                    'error' => 'INTERNAL_ERROR',
                    'message' => 'Unexpected error while deleting folder',
                ];
            }
        }

        return [
            'deleted' => $deleted,
            'errors' => $errors,
        ];
    }

    /**
     * Full recursive traversal under $folder. Returns true iff $folder itself is eligible
     * and its entire subtree contains zero files and zero ineligible folders.
     *
     * @param Folder $folder
     * @param string $relativePath
     * @param string[] $originPaths
     * @param array<string, array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}> $detected
     * @param array<string, bool> $memo
     * @param int $depth
     * @return bool
     */
    private function scanSubtree(
        Folder $folder,
        string $relativePath,
        array $originPaths,
        array &$detected,
        array &$memo,
        int $depth
    ): bool {
        if (array_key_exists($relativePath, $memo)) {
            return $memo[$relativePath];
        }

        if ($depth > self::MAX_SCAN_DEPTH) {
            $memo[$relativePath] = false;

            return false;
        }

        $isRoot = $relativePath === '/';
        if (!$isRoot && !$this->isFolderEligible($folder, $relativePath, $originPaths)) {
            $memo[$relativePath] = false;

            return false;
        }

        try {
            $children = $folder->getDirectoryListing();
        } catch (Throwable $e) {
            $this->logger->debug('Skipping unreadable folder during empty folder scan: {path}', [
                'path' => $relativePath,
                'error' => $e->getMessage(),
            ]);
            $memo[$relativePath] = false;

            return false;
        }

        $hasDirectFiles = false;
        $allSubfoldersEmpty = true;
        $emptySubfolderCount = 0;

        foreach ($children as $child) {
            if (!($child instanceof Folder)) {
                $hasDirectFiles = true;
                continue;
            }

            $childPath = ($isRoot ? '' : $relativePath) . '/' . $child->getName();
            if ($this->isInsideOriginFolder($childPath, $originPaths)
                || $this->excludedFolderService->isPathExcluded($childPath)
                || $child->isMounted()
            ) {
                $allSubfoldersEmpty = false;
                continue;
            }

            $childIsEmpty = $this->scanSubtree(
                $child,
                $childPath,
                $originPaths,
                $detected,
                $memo,
                $depth + 1
            );

            if ($childIsEmpty) {
                $emptySubfolderCount++;
            } else {
                $allSubfoldersEmpty = false;
            }
        }

        if ($isRoot) {
            $memo[$relativePath] = false;

            return false;
        }

        $isSubtreeEmpty = !$hasDirectFiles && $allSubfoldersEmpty;
        $memo[$relativePath] = $isSubtreeEmpty;

        if ($isSubtreeEmpty) {
            $detected[$relativePath] = $this->buildFolderDescriptor($folder, $relativePath, $emptySubfolderCount > 0);
        }

        return $isSubtreeEmpty;
    }

    /**
     * Scoped post-cleanup scan starting from a candidate path and climbing ancestors
     * only while each level becomes completely empty.
     *
     * @param Folder $userFolder
     * @param string $candidatePath
     * @param string[] $originPaths
     * @param array<string, array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}> $detected
     * @param array<string, bool> $memo
     */
    private function scanCandidateAndAncestors(
        Folder $userFolder,
        string $candidatePath,
        array $originPaths,
        array &$detected,
        array &$memo
    ): void {
        $current = $candidatePath;
        $isFirstTarget = true;

        while ($current !== '' && $current !== '/') {
            if ($this->isInsideOriginFolder($current, $originPaths)
                || $this->excludedFolderService->isPathExcluded($current)
            ) {
                break;
            }

            $node = null;
            try {
                if ($userFolder->nodeExists($current)) {
                    $node = $userFolder->get($current);
                }
            } catch (NotFoundException $e) {
                $node = null;
            }

            if ($node === null || !($node instanceof Folder)) {
                $current = $this->parentRelativePath($current);
                continue;
            }

            if ($isFirstTarget) {
                $isFirstTarget = false;
                $becameEmpty = $this->scanSubtree(
                    $node,
                    $current,
                    $originPaths,
                    $detected,
                    $memo,
                    substr_count($current, '/')
                );
            } else {
                $becameEmpty = $this->checkAncestorCompletelyEmpty(
                    $node,
                    $current,
                    $originPaths,
                    $detected,
                    $memo
                );
            }

            if (!$becameEmpty) {
                break;
            }

            $current = $this->parentRelativePath($current);
        }
    }

    /**
     * Fast-fail check for an ancestor folder: returns false immediately if any direct file
     * or non-empty sibling folder exists, avoiding unnecessary deep scans of unrelated siblings.
     *
     * @param Folder $folder
     * @param string $relativePath
     * @param string[] $originPaths
     * @param array<string, array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}> $detected
     * @param array<string, bool> $memo
     * @return bool
     */
    private function checkAncestorCompletelyEmpty(
        Folder $folder,
        string $relativePath,
        array $originPaths,
        array &$detected,
        array &$memo
    ): bool {
        if (array_key_exists($relativePath, $memo)) {
            return $memo[$relativePath];
        }

        $depth = substr_count($relativePath, '/');
        if ($depth > self::MAX_SCAN_DEPTH || !$this->isFolderEligible($folder, $relativePath, $originPaths)) {
            $memo[$relativePath] = false;

            return false;
        }

        try {
            $children = $folder->getDirectoryListing();
        } catch (Throwable $e) {
            $memo[$relativePath] = false;

            return false;
        }

        $childFolders = [];
        foreach ($children as $child) {
            if (!($child instanceof Folder)) {
                $memo[$relativePath] = false;

                return false;
            }

            $childPath = $relativePath . '/' . $child->getName();
            if (!$this->isFolderEligible($child, $childPath, $originPaths)) {
                $memo[$relativePath] = false;

                return false;
            }

            $childFolders[] = [$child, $childPath];
        }

        $stagedDetected = [];
        foreach ($childFolders as [$childNode, $childPath]) {
            $isChildEmpty = $this->checkAncestorCompletelyEmpty(
                $childNode,
                $childPath,
                $originPaths,
                $stagedDetected,
                $memo
            );
            if (!$isChildEmpty) {
                $memo[$relativePath] = false;

                return false;
            }
        }

        foreach ($stagedDetected as $stagedPath => $descriptor) {
            $detected[$stagedPath] = $descriptor;
        }

        $memo[$relativePath] = true;
        $detected[$relativePath] = $this->buildFolderDescriptor($folder, $relativePath, $childFolders !== []);

        return true;
    }

    /**
     * @param Folder $folder
     * @param string $relativePath
     * @param string[] $originPaths
     * @return bool
     */
    private function isFolderEligible(Folder $folder, string $relativePath, array $originPaths): bool
    {
        if ($relativePath === '' || $relativePath === '/') {
            return false;
        }
        if ($this->isInsideOriginFolder($relativePath, $originPaths)) {
            return false;
        }
        if ($this->excludedFolderService->isPathExcluded($relativePath)) {
            return false;
        }
        if ($folder->isMounted() || !$folder->isDeletable()) {
            return false;
        }

        return true;
    }

    /**
     * @param Folder $folder
     * @param string $relativePath
     * @param bool $hasEmptySubfolders
     * @return array{path: string, name: string, depth: int, hasEmptySubfolders: bool, mtime: int}
     */
    private function buildFolderDescriptor(Folder $folder, string $relativePath, bool $hasEmptySubfolders): array
    {
        $mtime = 0;
        try {
            $mtime = (int)$folder->getMTime();
        } catch (Throwable $e) {
            $mtime = 0;
        }

        return [
            'path' => $relativePath,
            'name' => $folder->getName(),
            'depth' => substr_count($relativePath, '/'),
            'hasEmptySubfolders' => $hasEmptySubfolders,
            'mtime' => $mtime,
        ];
    }

    /**
     * @return string[]
     */
    private function loadNormalizedOriginPaths(): array
    {
        $paths = [];
        foreach ($this->originFolderService->findAll() as $originFolder) {
            $raw = trim((string)$originFolder->getFolderPath());
            if ($raw === '' || $raw === '/') {
                continue;
            }
            $paths[] = '/' . trim($raw, '/');
        }

        return array_values(array_unique($paths));
    }

    /**
     * @param string $folderPath
     * @param string[] $originPaths
     * @return bool
     */
    private function isInsideOriginFolder(string $folderPath, array $originPaths): bool
    {
        $protection = $this->originFolderService->isPathProtected($folderPath);
        if (!empty($protection['isProtected'])) {
            return true;
        }

        foreach ($originPaths as $originPath) {
            if ($folderPath === $originPath || str_starts_with($folderPath, $originPath . '/')) {
                return true;
            }
        }

        return false;
    }

    private function normalizeUserRelativePath(string $userId, string $rawPath): ?string
    {
        $trimmed = trim(str_replace('\\', '/', $rawPath));
        if ($trimmed === '') {
            return null;
        }

        if ($userId !== '') {
            $prefixPattern = '#^/' . preg_quote($userId, '#') . '/files(?=/|$)#';
            $trimmed = (string)preg_replace($prefixPattern, '', $trimmed);
        }

        if (str_starts_with($trimmed, '/__groupfolders/')) {
            return null;
        }

        $segments = array_values(array_filter(
            explode('/', $trimmed),
            static fn (string $seg): bool => $seg !== '' && $seg !== '.'
        ));

        foreach ($segments as $segment) {
            if ($segment === '..') {
                return null;
            }
        }

        if ($segments === []) {
            return '/';
        }

        return '/' . implode('/', $segments);
    }

    private function normalizeResolvedRelativePath(?string $resolvedPath): ?string
    {
        if ($resolvedPath === null) {
            return null;
        }
        $trimmed = trim($resolvedPath, '/');

        return $trimmed === '' ? '/' : '/' . $trimmed;
    }

    private function parentRelativePath(string $relativePath): string
    {
        $pos = strrpos($relativePath, '/');
        if ($pos === false || $pos === 0) {
            return '/';
        }

        return substr($relativePath, 0, $pos);
    }
}
