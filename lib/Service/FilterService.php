<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\Filter;
use OCA\DuplicateFinder\Db\FilterMapper;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class FilterService
{
    /** @var LoggerInterface */
    private $logger;
    /** @var ConfigService */
    private $config;
    /** @var ExcludedFolderService */
    private $excludedFolderService;
    /** @var FilterMapper */
    private $filterMapper;
    /**
     * Custom filters per user and type. A scan checks every file against them,
     * which used to cost two queries per file.
     *
     * @var array<string, array<string, Filter[]>>
     */
    private $filterCache = [];
    /**
     * Whether a folder or one of its ancestors holds a .nodupefinder file, by folder path.
     * Without it every file probed each of its ancestors again.
     *
     * @var array<string, bool>
     */
    private $noDupeFinderCache = [];

    public function __construct(
        LoggerInterface $logger,
        ConfigService $config,
        ExcludedFolderService $excludedFolderService,
        FilterMapper $filterMapper
    ) {
        $this->logger = $logger;
        $this->config = $config;
        $this->excludedFolderService = $excludedFolderService;
        $this->filterMapper = $filterMapper;
    }

    public function isIgnored(FileInfo $fileInfo, Node $node): bool
    {
        // Ignore mounted files
        if ($node->isMounted() && $this->config->areMountedFilesIgnored()) {
            throw new ForcedToIgnoreFileException($fileInfo, 'app:ignore_mounted_files');
        }

        // Check if path is in user-excluded folder
        // Only check excluded folders if we have a valid owner
        $isExcluded = false;
        if ($fileInfo->getOwner()) {
            try {
                // Set the user context for the excluded folder service
                $this->excludedFolderService->setUserId($fileInfo->getOwner());
                $isExcluded = $this->excludedFolderService->isPathExcluded($fileInfo->getPath());
            } catch (\Exception $e) {
                // Continue with other checks even if this one fails
            }
        }

        if ($isExcluded) {
            return true;
        }

        // Check custom filters
        if ($this->matchesCustomFilters($fileInfo)) {
            return true;
        }

        // Ignore files when any ancestor folder contains a .nodupefinder file
        try {
            $parent = $node->getParent();
        } catch (NotFoundException $e) {
            return false;
        }

        return $this->isInNoDupeFinderFolder($parent);
    }

    /**
     * Whether the folder or one of its ancestors contains a .nodupefinder file.
     * Each folder is probed once: the answer is cached for every folder on the way up.
     */
    private function isInNoDupeFinderFolder(?Node $folder): bool
    {
        $visited = [];
        $result = false;
        $current = $folder;

        while ($current !== null) {
            try {
                $path = $current->getPath();
                if ($path === '/') {
                    // Virtual root reached: it cannot hold a user .nodupefinder,
                    // stop instead of paying a mount lookup per scanned file
                    break;
                }
                if (isset($this->noDupeFinderCache[$path])) {
                    $result = $this->noDupeFinderCache[$path];

                    break;
                }
                $visited[] = $path;
                if ($current->nodeExists('.nodupefinder')) {
                    $result = true;

                    break;
                }
                $current = $current->getParent();
            } catch (NotFoundException $e) {
                break;
            }
        }

        foreach ($visited as $path) {
            $this->noDupeFinderCache[$path] = $result;
        }

        return $result;
    }

    /**
     * Forget the cached filters, excluded folders and .nodupefinder lookups.
     * Called at the start of each scan so that it sees the current settings.
     */
    public function resetCache(): void
    {
        $this->filterCache = [];
        $this->noDupeFinderCache = [];
        $this->excludedFolderService->resetCache();
    }

    /**
     * @return Filter[]
     */
    private function getFiltersByType(string $type, string $userId): array
    {
        if (!isset($this->filterCache[$userId][$type])) {
            $this->filterCache[$userId][$type] = $this->filterMapper->findByType($type, $userId);
        }

        return $this->filterCache[$userId][$type];
    }

    private function matchesCustomFilters(FileInfo $fileInfo): bool
    {
        try {
            // Skip custom filter checks if no owner
            if (!$fileInfo->getOwner()) {
                return false;
            }

            // Check hash filters
            $hashFilters = $this->getFiltersByType('hash', $fileInfo->getOwner());
            foreach ($hashFilters as $filter) {
                if ($fileInfo->getFileHash() === $filter->getValue()) {
                    return true;
                }
            }

            // Check name pattern filters
            $nameFilters = $this->getFiltersByType('name', $fileInfo->getOwner());
            foreach ($nameFilters as $filter) {
                // Échapper les caractères spéciaux de regex sauf *
                $pattern = preg_quote($filter->getValue(), '/');
                // Remplacer \* par .* pour le wildcard
                $pattern = str_replace('\*', '.*', $pattern);
                $filename = basename($fileInfo->getPath());

                if (preg_match('/^' . $pattern . '$/', $filename)) {
                    return true;
                }
            }
        } catch (\Exception $e) {
            $this->logger->error('Error checking custom filters: {error}', [
                'error' => $e->getMessage(),
                'path' => $fileInfo->getPath(),
                'trace' => $e->getTraceAsString(),
            ]);
        }

        return false;
    }

    public function createFilter(string $type, string $value, string $userId): Filter
    {
        $filter = new Filter();
        $filter->setType($type);
        $filter->setValue($value);
        $filter->setUserId($userId);
        $filter->setCreatedAt(time());
        unset($this->filterCache[$userId]);

        return $this->filterMapper->insert($filter);
    }

    public function deleteFilter(int $id, string $userId): void
    {
        $filter = $this->filterMapper->find($id, $userId);
        $this->filterMapper->delete($filter);
        unset($this->filterCache[$userId]);
    }

    public function getFilters(string $userId): array
    {
        return $this->filterMapper->findAll($userId);
    }

    /**
     * Check if a directory should be skipped due to a .nodupefinder file
     *
     * @param Node $node The directory node to check
     * @return bool True if the directory should be skipped, false otherwise
     */
    public function shouldSkipDirectory(Node $node): bool
    {
        try {
            // Check if the current directory contains a .nodupefinder file
            if ($node->nodeExists('.nodupefinder')) {
                return true;
            }

            return false;
        } catch (\Exception $e) {
            $this->logger->error('Error checking if directory should be skipped: {error}', [
                'path' => $node->getPath(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            // If there's an error, don't skip the directory
            return false;
        }
    }
}
