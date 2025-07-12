<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\Files\NotFoundException;
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

    /** @var ExcludedFolderService */
    private $excludedFolderService;

    /**
     * Constructs a new instance of the CleanUpDB class.
     *
     * @param FileInfoService $fileInfoService The file info service.
     * @param FolderService $folderService The folder service.
     * @param LoggerInterface $logger The logger.
     * @param ConfigService $config The config service.
     * @param ITimeFactory $timeFactory The time factory instance.
     * @param ExcludedFolderService $excludedFolderService The excluded folder service.
     */
    public function __construct(
        FileInfoService $fileInfoService,
        FolderService $folderService,
        LoggerInterface $logger,
        ConfigService $config,
        ITimeFactory $timeFactory,
        ExcludedFolderService $excludedFolderService
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->folderService = $folderService;
        $this->logger = $logger;
        $this->timeFactory = $timeFactory;
        $this->excludedFolderService = $excludedFolderService;

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
        $this->logger->debug('CleanUpDB: Starting cleanup job with {count} file infos', [
            'count' => count($fileInfos),
        ]);

        foreach ($fileInfos as $fileInfo) {
            // Set the user context for the excluded folder service if we have an owner
            if ($fileInfo->getOwner()) {
                $this->logger->debug('CleanUpDB: Setting user context for file: {path}', [
                    'path' => $fileInfo->getPath(),
                    'owner' => $fileInfo->getOwner(),
                ]);
                $this->excludedFolderService->setUserId($fileInfo->getOwner());
            } else {
                $this->logger->debug('CleanUpDB: No owner for file: {path}', [
                    'path' => $fileInfo->getPath(),
                ]);
                // Clear the user context to avoid using a previous user's context
                $this->excludedFolderService->setUserId(null);
            }

            try {
                $this->folderService->getNodeByFileInfo($fileInfo);
            } catch (NotFoundException $e) {
                $this->logger->info('CleanUpDB: FileInfo {path} will be deleted (not found)', [
                    'path' => $fileInfo->getPath(),
                    'error' => $e->getMessage(),
                ]);
                $this->fileInfoService->delete($fileInfo);
            } catch (\Exception $e) {
                $this->logger->error('CleanUpDB: Error checking file: {path}', [
                    'path' => $fileInfo->getPath(),
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);
                // Continue with the next file
            }
        }

        $this->logger->debug('CleanUpDB: Cleanup job completed');
        unset($fileInfo);
    }
}
