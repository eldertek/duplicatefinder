<?php

namespace OCA\DuplicateFinder\Service;

use Psr\Log\LoggerInterface;
use OCP\Files\Node;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\ConfigService;

class FilterService
{
    /** @var LoggerInterface */
    private $logger;
    /** @var ConfigService */
    private $config;

    public function __construct(
        LoggerInterface $logger,
        ConfigService $config
    ) {
        $this->logger = $logger;
        $this->config = $config;
    }

    public function isIgnored(FileInfo $fileInfo, Node $node): bool
    {
        // Ignore mounted files
        if ($node->isMounted() && $this->config->areMountedFilesIgnored()) {
            throw new ForcedToIgnoreFileException($fileInfo, 'app:ignore_mounted_files');
        }

        // Ignore files when any ancestor folder contains a .nodupefinder file
        try {
            while ($node !== null && $node->getParent() !== null) { // loop until root or null node
                $parent = $node->getParent();
                if ($parent !== null && $parent->nodeExists('.nodupefinder')) {
                    return true;
                }
                $node = $parent; // move up to the parent and check again
            }
        } catch (\Exception $e) {
                $this->logger->error(sprintf(
                    "Error while checking for .nodupefinder in node '%s'. Exception: %s (%s). Trace: %s",
                    $node->getPath(),
                    get_class($e),
                    $e->getMessage(),
                    $e->getTraceAsString()
                ));
            }            

        return false;
    }
}
