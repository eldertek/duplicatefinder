<?php

namespace OCA\DuplicateFinder\Listener;

use OCA\DuplicateFinder\Event\AbstractFileInfoEvent;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

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
                $count = $this->fileInfoService->countBySize($fileInfo->getSize());

                if ($count > 1) {
                    $files = $this->fileInfoService->findBySize($fileInfo->getSize());
                    foreach ($files as $finfo) {
                        $this->fileInfoService->calculateHashes($finfo, $event->getUserID());
                    }
                    unset($finfo);
                } else {
                    $this->fileInfoService->calculateHashes($fileInfo, $event->getUserID(), false);
                }
            }
        } catch (\Throwable $e) {
            $context = [
                'path' => isset($fileInfo) ? $fileInfo->getPath() : 'unknown',
                'error' => $e->getMessage(),
            ];
            if ($e instanceof NotFoundException || $e instanceof \OC\User\NoUserException) {
                // Expected for deleted files, group folders or vanished users: not an error (#154, #158)
                $this->logger->debug('Skipping file info event, node not available', $context);
            } else {
                $context['trace'] = $e->getTraceAsString();
                $this->logger->error('Failed to handle file info event', $context);
            }
        }
    }
}
