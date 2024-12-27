<?php

namespace OCA\DuplicateFinder\Service;

use Psr\Log\LoggerInterface;
use OCP\Files\Node;
use OCP\Files\NotFoundException;

use OCA\DuplicateFinder\Db\FileInfo;
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

    public function __construct(
        LoggerInterface $logger,
        ConfigService $config,
        ExcludedFolderService $excludedFolderService
    ) {
        $this->logger = $logger;
        $this->config = $config;
        $this->excludedFolderService = $excludedFolderService;
    }

    public function isIgnored(FileInfo $fileInfo, Node $node): bool
    {
        $this->logger->debug('Checking if file should be ignored: {path}', [
            'path' => $fileInfo->getPath(),
            'owner' => $fileInfo->getOwner(),
            'node_type' => $node->getType(),
            'is_mounted' => $node->isMounted()
        ]);

        // Ignore mounted files
        if ($node->isMounted() && $this->config->areMountedFilesIgnored()) {
            $this->logger->debug('File is mounted and mounted files are ignored: {path}', [
                'path' => $fileInfo->getPath()
            ]);
            throw new ForcedToIgnoreFileException($fileInfo, 'app:ignore_mounted_files');
        }
    
        // Check if path is in user-excluded folder
        $isExcluded = $this->excludedFolderService->isPathExcluded($fileInfo->getPath());
        if ($isExcluded) {
            $this->logger->debug('File is in an excluded folder: {path}', [
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
}