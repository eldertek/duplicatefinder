<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoRepairer;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class CleanUpDB extends TimedJob
{
    /**
     * Seconds the repair of the file info table may take in one run of the job. The repair step of the upgrade only
     * gives it a few seconds, the job is where the rest is done, so it can take longer here.
     */
    private const REPAIR_TIME_BUDGET = 120.0;

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

    /** @var FileDuplicateService */
    private $fileDuplicateService;

    /** @var ?FileInfoRepairer */
    private $fileInfoRepairer;

    /**
     * Constructs a new instance of the CleanUpDB class.
     *
     * @param FileInfoService $fileInfoService The file info service.
     * @param FolderService $folderService The folder service.
     * @param LoggerInterface $logger The logger.
     * @param ConfigService $config The config service.
     * @param ITimeFactory $timeFactory The time factory instance.
     * @param ExcludedFolderService $excludedFolderService The excluded folder service.
     * @param FileDuplicateService $fileDuplicateService The duplicate group service.
     * @param FileInfoRepairer|null $fileInfoRepairer Finishes the repair of the file info table that the upgrade started.
     */
    public function __construct(
        FileInfoService $fileInfoService,
        FolderService $folderService,
        LoggerInterface $logger,
        ConfigService $config,
        ITimeFactory $timeFactory,
        ExcludedFolderService $excludedFolderService,
        FileDuplicateService $fileDuplicateService,
        ?FileInfoRepairer $fileInfoRepairer = null
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->folderService = $folderService;
        $this->logger = $logger;
        $this->timeFactory = $timeFactory;
        $this->excludedFolderService = $excludedFolderService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->fileInfoRepairer = $fileInfoRepairer;

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
        // Finish what the repair step of the upgrade had no time to do (issue 182): bounded, and first so that
        // the rest of the job cannot keep it from running.
        $merged = $this->fileDuplicateService->mergeSurplusRows();
        if ($merged > 0) {
            $this->logger->info('CleanUpDB: removed {count} surplus duplicate group rows', ['count' => $merged]);
        }
        $this->repairFileInfos();

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
                // getNodeByFileInfo() does not throw for a deleted file, it returns null (issue 183):
                // null alone is not proof, group folders of a missing user give null as well
                $node = $this->folderService->getNodeByFileInfo($fileInfo);
                if ($node === null && $this->folderService->isNodeGone($fileInfo)) {
                    $this->removeStaleFileInfo($fileInfo, 'file is gone');
                }
            } catch (NotFoundException $e) {
                $this->removeStaleFileInfo($fileInfo, $e->getMessage());
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

    /**
     * Go on with the repair of the file info table (path hashes, surplus rows) that the repair step of the upgrade
     * started within its time budget. It never throws: the rest of the job has its own work to do.
     */
    private function repairFileInfos(): void
    {
        if ($this->fileInfoRepairer === null) {
            return;
        }

        try {
            $result = $this->fileInfoRepairer->run(self::REPAIR_TIME_BUDGET);
            if ($result['pathHashes'] > 0 || $result['removed'] > 0) {
                $this->logger->info('CleanUpDB: recalculated {hashes} path hashes and removed {removed} surplus file info rows', [
                    'hashes' => $result['pathHashes'],
                    'removed' => $result['removed'],
                ]);
            }
        } catch (\Throwable $e) {
            $this->logger->warning('CleanUpDB: Could not repair the file info rows: {message}', [
                'message' => $e->getMessage(),
                'exception' => $e,
            ]);
        }
    }

    /**
     * Forget a file that does not exist any more, and its duplicate group if nothing is left to compare with.
     */
    private function removeStaleFileInfo(FileInfo $fileInfo, string $reason): void
    {
        $this->logger->info('CleanUpDB: FileInfo {path} will be deleted (not found)', [
            'path' => $fileInfo->getPath(),
            'error' => $reason,
        ]);
        $this->fileInfoService->delete($fileInfo);

        try {
            $this->fileDuplicateService->removeIfOrphaned($fileInfo->getFileHash());
        } catch (\Exception $e) {
            $this->logger->warning('CleanUpDB: Could not refresh the duplicate group of {path}', [
                'path' => $fileInfo->getPath(),
                'error' => $e->getMessage(),
            ]);
        }
    }
}
