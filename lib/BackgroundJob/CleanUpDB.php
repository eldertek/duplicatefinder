<?php
namespace OCA\DuplicateFindx\BackgroundJob;

use Psr\Log\LoggerInterface;
use OCP\Files\NotFoundException;
use OCA\DuplicateFindx\Service\FileInfoService;
use OCA\DuplicateFindx\Service\ConfigService;
use OCA\DuplicateFindx\Service\FolderService;

class CleanUpDB extends \OC\BackgroundJob\TimedJob
{
    /** @var FileInfoService*/
    private $fileInfoService;
    /** @var FolderService*/
    private $folderService;
    /** @var LoggerInterface */
    private $logger;

    /**
     * @param FileInfoService $fileInfoService
     * @param LoggerInterface $logger
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
     * @param  mixed $argument
     * @throws \Exception
     */
    protected function run($argument): void
    {
        /**
         * If for some reason a delete or rename Event wasn't handled properly we cleanup this up here
         */
        $fileInfos = $this->fileInfoService->findAll();
        foreach ($fileInfos as $fileInfo) {
            try {
                $this->folderService->getNodeByFileInfo($fileInfo);
            } catch (NotFoundException $e) {
                $this->logger->info('FileInfo '.$fileInfo->getPath(). ' will be deleted');
                $this->fileInfoService->delete($fileInfo);
            }
        }
        unset($fileInfo);
    }
}
