<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\NotFoundException;
use OCP\BackgroundJob\TimedJob;
use Psr\Log\LoggerInterface;

class CleanUpDB extends TimedJob
{
    /** @var FileInfoService */
    private $fileInfoService;

    /** @var FolderService */
    private $folderService;

    /** @var LoggerInterface */
    private $logger;

    /**
     * CleanUpDB constructor.
     *
     * @param FileInfoService $fileInfoService
     * @param LoggerInterface $logger
     * @param ConfigService $config
     * @param FolderService $folderService
     */
    public function __construct(
        FileInfoService $fileInfoService,
        LoggerInterface $logger,
        ConfigService $config,
        FolderService $folderService
    ) {
        $this->setInterval($config->getCleanupJobInterval());
        $this->fileInfoService = $fileInfoService;
        $this->folderService = $folderService;
        $this->logger = $logger;
    }

    /**
     * Execute the cleanup job.
     *
     * @param mixed $argument
     * @throws \Exception
     */
    protected function run($argument): void
    {
        // Clean up any unhandled delete or rename events
        $fileInfos = $this->fileInfoService->findAll();

        foreach ($fileInfos as $fileInfo) {
            try {
                $this->folderService->getNodeByFileInfo($fileInfo);
            } catch (NotFoundException $e) {
                $this->logger->info('FileInfo ' . $fileInfo->getPath() . ' will be deleted');
                $this->fileInfoService->delete($fileInfo);
            }
        }

        unset($fileInfo);
    }
}
