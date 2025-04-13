<?php

namespace OCA\DuplicateFinder\Service;

use Psr\Log\LoggerInterface;
use OCP\Files\Node;
use OCP\Files\NotFoundException;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\Filter;
use OCA\DuplicateFinder\Db\FilterMapper;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;

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
        $this->logger->debug('Starting ignore check for file: {path}', [
            'path' => $fileInfo->getPath(),
            'owner' => $fileInfo->getOwner(),
            'node_type' => $node->getType(),
            'is_mounted' => $node->isMounted(),
            'size' => $node->getSize(),
            'mimetype' => $node->getMimetype()
        ]);

        // Ignore mounted files
        if ($node->isMounted() && $this->config->areMountedFilesIgnored()) {
            $this->logger->debug('File is mounted and mounted files are ignored: {path}', [
                'path' => $fileInfo->getPath()
            ]);
            throw new ForcedToIgnoreFileException($fileInfo, 'app:ignore_mounted_files');
        }

        // Check if path is in user-excluded folder
        $this->logger->debug('Checking if path is in excluded folder');

        // Only check excluded folders if we have a valid owner
        $isExcluded = false;
        if ($fileInfo->getOwner()) {
            try {
                // Set the user context for the excluded folder service
                $this->excludedFolderService->setUserId($fileInfo->getOwner());
                $isExcluded = $this->excludedFolderService->isPathExcluded($fileInfo->getPath());
            } catch (\Exception $e) {
                $this->logger->debug('Error checking excluded folders: {error}', [
                    'path' => $fileInfo->getPath(),
                    'error' => $e->getMessage()
                ]);
                // Continue with other checks even if this one fails
            }
        } else {
            $this->logger->debug('Skipping excluded folder check - no owner for file: {path}', [
                'path' => $fileInfo->getPath()
            ]);
        }

        $this->logger->debug('Exclusion check result: {result}', [
            'path' => $fileInfo->getPath(),
            'isExcluded' => $isExcluded ? 'true' : 'false'
        ]);

        if ($isExcluded) {
            $this->logger->debug('File is in an excluded folder: {path}', [
                'path' => $fileInfo->getPath()
            ]);
            return true;
        }

        // Check custom filters
        $this->logger->debug('Starting custom filter check for file: {path}', [
            'path' => $fileInfo->getPath()
        ]);

        if ($this->matchesCustomFilters($fileInfo)) {
            $this->logger->debug('File matches custom filter rules: {path}', [
                'path' => $fileInfo->getPath()
            ]);
            return true;
        }

        // Ignore files when any ancestor folder contains a .nodupefinder file
        $currentNode = $node;
        $this->logger->debug('Starting .nodupefinder check for: {path}', [
            'path' => $fileInfo->getPath()
        ]);

        while ($currentNode !== null) {
            try {
                $parent = $currentNode->getParent();
                if ($parent !== null) {
                    $this->logger->debug('Checking parent folder for .nodupefinder: {path}', [
                        'parent_path' => $parent->getPath()
                    ]);

                    if ($parent->nodeExists('.nodupefinder')) {
                        $this->logger->debug('Found .nodupefinder in parent folder: {path}', [
                            'parent_path' => $parent->getPath(),
                            'file_path' => $fileInfo->getPath()
                        ]);
                        return true;
                    }
                }
                $currentNode = $parent;
            } catch (NotFoundException $e) {
                $this->logger->debug('Parent folder not found, stopping .nodupefinder check: {path}', [
                    'path' => $fileInfo->getPath(),
                    'error' => $e->getMessage()
                ]);
                break;
            }
        }

        $this->logger->debug('File is not ignored: {path}', [
            'path' => $fileInfo->getPath()
        ]);
        return false;
    }

    private function matchesCustomFilters(FileInfo $fileInfo): bool
    {
        try {
            $this->logger->debug('Starting custom filter check for file: {path}', [
                'path' => $fileInfo->getPath(),
                'hash' => $fileInfo->getFileHash(),
                'owner' => $fileInfo->getOwner()
            ]);

            // Skip custom filter checks if no owner
            if (!$fileInfo->getOwner()) {
                $this->logger->debug('Skipping custom filter check - no owner for file: {path}', [
                    'path' => $fileInfo->getPath()
                ]);
                return false;
            }

            // Check hash filters
            $hashFilters = $this->filterMapper->findByType('hash', $fileInfo->getOwner());
            $this->logger->debug('Found {count} hash filters for user', [
                'count' => count($hashFilters),
                'owner' => $fileInfo->getOwner()
            ]);

            foreach ($hashFilters as $filter) {
                $this->logger->debug('Checking hash filter: {filter_value} against file hash: {file_hash}', [
                    'filter_value' => $filter->getValue(),
                    'file_hash' => $fileInfo->getFileHash(),
                    'filter_id' => $filter->getId()
                ]);

                if ($fileInfo->getFileHash() === $filter->getValue()) {
                    $this->logger->debug('File matches hash filter: {filter_id}', [
                        'filter_id' => $filter->getId(),
                        'path' => $fileInfo->getPath()
                    ]);
                    return true;
                }
            }

            // Check name pattern filters
            $nameFilters = $this->filterMapper->findByType('name', $fileInfo->getOwner());
            $this->logger->debug('Found {count} name pattern filters for user', [
                'count' => count($nameFilters),
                'owner' => $fileInfo->getOwner()
            ]);

            foreach ($nameFilters as $filter) {
                // Échapper les caractères spéciaux de regex sauf *
                $pattern = preg_quote($filter->getValue(), '/');
                // Remplacer \* par .* pour le wildcard
                $pattern = str_replace('\*', '.*', $pattern);
                $filename = basename($fileInfo->getPath());

                $this->logger->debug('Checking name pattern filter: {pattern} against filename: {filename}', [
                    'pattern' => $filter->getValue(),
                    'regex' => '/^' . $pattern . '$/',
                    'filename' => $filename,
                    'filter_id' => $filter->getId()
                ]);

                if (preg_match('/^' . $pattern . '$/', $filename)) {
                    $this->logger->debug('File matches name pattern filter: {filter_id}', [
                        'filter_id' => $filter->getId(),
                        'path' => $fileInfo->getPath(),
                        'pattern' => $filter->getValue()
                    ]);
                    return true;
                }
            }

            $this->logger->debug('File does not match any filters: {path}', [
                'path' => $fileInfo->getPath()
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Error checking custom filters: {error}', [
                'error' => $e->getMessage(),
                'path' => $fileInfo->getPath(),
                'trace' => $e->getTraceAsString()
            ]);
        }
        return false;
    }

    public function createFilter(string $type, string $value, string $userId): Filter {
        $filter = new Filter();
        $filter->setType($type);
        $filter->setValue($value);
        $filter->setUserId($userId);
        $filter->setCreatedAt(time());
        return $this->filterMapper->insert($filter);
    }

    public function deleteFilter(int $id, string $userId): void {
        $filter = $this->filterMapper->find($id, $userId);
        $this->filterMapper->delete($filter);
    }

    public function getFilters(string $userId): array {
        return $this->filterMapper->findAll($userId);
    }
}