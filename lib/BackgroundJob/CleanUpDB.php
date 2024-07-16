<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\AppFramework\Utility\ITimeFactory;
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

    /** @var ITimeFactory */
    private $timeFactory;

    /**
     * Constructs a new instance of the CleanUpDB class.
     *
     * @param FileInfoService $fileInfoService The file info service.
     * @param FolderService $folderService The folder service.
     * @param LoggerInterface $logger The logger.
     * @param ConfigService $config The config service.
     * @param ITimeFactory $timeFactory The time factory instance.
     */
    public function __construct(
        FileInfoService $fileInfoService,
        FolderService $folderService,
        LoggerInterface $logger,
        ConfigService $config,
        ITimeFactory $timeFactory
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->folderService = $folderService;
        $this->logger = $logger;
        $this->timeFactory = $timeFactory;

        // Ensure the interval is set using the configuration service
        $this->setInterval($config->getCleanupJobInterval());
        
        parent::__construct($timeFactory);
    }

    /**
     * Executes the cleanup job.
     *
     * @param mixed $argument The job argument.
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
