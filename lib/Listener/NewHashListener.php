<?php
namespace OCA\DuplicateFindx\Listener;

use Psr\Log\LoggerInterface;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCA\DuplicateFindx\AppInfo\Application;
use OCA\DuplicateFindx\Db\FileInfo;
use OCA\DuplicateFindx\Event\CalculatedHashEvent;
use OCA\DuplicateFindx\Service\FileInfoService;
use OCA\DuplicateFindx\Service\FileDuplicateService;

/**
 * @template T of Event
 * @implements IEventListener<T>
 */
class NewHashListener implements IEventListener
{

    /** @var FileInfoService */
    private $fileInfoService;
    /** @var FileDuplicateService */
    private $fileDuplicateService;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        FileInfoService $fileInfoService,
        FileDuplicateService $fileDuplicateService,
        LoggerInterface $logger
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->logger = $logger;
    }

    public function handle(Event $event): void
    {
        try {
            if ($event instanceof CalculatedHashEvent && $event->isChanged()) {
                $fileInfo = $event->getFileInfo();
                $this->updateDuplicates($fileInfo, $event->getOldHash());
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to handle new hash event .', ['exception'=> $e]);
        }
    }

    private function updateDuplicates(FileInfo $fileInfo, ?string $oldHash, string $type = 'file_hash'): void
    {
        $hash = $fileInfo->getFileHash();
        if (is_null($hash)) {
            if (is_null($oldHash)) {
                return;
            }
            $hash = $oldHash;
        }
        $count = $this->fileInfoService->countByHash($hash, $type);
        if ($count > 1) {
            try {
                $this->fileDuplicateService->getOrCreate($hash, $type);
            } catch (\Exception $e) {
                $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
            }
        } else {
            $this->fileDuplicateService->delete($hash);
        }
    }
}
