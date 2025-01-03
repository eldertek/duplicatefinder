<?php
namespace OCA\DuplicateFinder\Listener;

use Psr\Log\LoggerInterface;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCA\DuplicateFinder\Event\AbstractFileInfoEvent;
use OCA\DuplicateFinder\Service\FileInfoService;

/**
 * @template T of Event
 * @implements IEventListener<T>
 */
class FileInfoListener implements IEventListener
{

    /** @var FileInfoService */
    private $fileInfoService;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        FileInfoService $fileInfoService,
        LoggerInterface $logger
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->logger = $logger;
    }

    public function handle(Event $event): void
    {
        try {
            if ($event instanceof AbstractFileInfoEvent) {
                $fileInfo = $event->getFileInfo();
                $this->logger->debug('Handling file info event', [
                    'path' => $fileInfo->getPath(),
                    'size' => $fileInfo->getSize(),
                    'hash' => $fileInfo->getFileHash(),
                    'eventType' => get_class($event)
                ]);

                $count = $this->fileInfoService->countBySize($fileInfo->getSize());
                $this->logger->debug('Found files with same size', [
                    'path' => $fileInfo->getPath(),
                    'size' => $fileInfo->getSize(),
                    'count' => $count
                ]);

                if ($count > 1) {
                    $this->logger->debug('Multiple files with same size found, calculating hashes', [
                        'path' => $fileInfo->getPath(),
                        'size' => $fileInfo->getSize(),
                        'count' => $count
                    ]);

                    $files = $this->fileInfoService->findBySize($fileInfo->getSize());
                    foreach ($files as $finfo) {
                        $this->logger->debug('Processing potential duplicate', [
                            'path' => $finfo->getPath(),
                            'size' => $finfo->getSize(),
                            'currentHash' => $finfo->getFileHash(),
                            'isIgnored' => $finfo->isIgnored() ? 'true' : 'false'
                        ]);

                        $this->fileInfoService->calculateHashes($finfo, $event->getUserID());
                    }
                    unset($finfo);
                } else {
                    $this->logger->debug('No other files with same size, skipping hash calculation', [
                        'path' => $fileInfo->getPath(),
                        'size' => $fileInfo->getSize()
                    ]);

                    $this->fileInfoService->calculateHashes($fileInfo, $event->getUserID(), false);
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to handle file info event', [
                'path' => isset($fileInfo) ? $fileInfo->getPath() : 'unknown',
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
        }
    }
}