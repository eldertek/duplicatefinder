<?php

namespace OCA\DuplicateFinder\Listener;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\AbstractFileInfoEvent;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
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

    /**
     * A file skipped on purpose by an app setting (ignore_mounted_files) is not an error (#199).
     * It is caught per file so that it does not stop the hashing of the other files of the same size.
     * Not logged: this runs for every such file of every scan.
     */
    private function hashIfNotSkipped(FileInfo $fileInfo, ?string $userId): void
    {
        try {
            $this->fileInfoService->calculateHashes($fileInfo, $userId);
        } catch (ForcedToIgnoreFileException $e) {
            // intentionally ignored
        }
    }

    public function handle(Event $event): void
    {
        try {
            if ($event instanceof AbstractFileInfoEvent) {
                $fileInfo = $event->getFileInfo();
                $count = $this->fileInfoService->countBySize($fileInfo->getSize());

                if ($count > 1) {
                    $files = $this->fileInfoService->findBySize($fileInfo->getSize());
                    // The event file may already have a hash and be excluded from the lookup.
                    $this->hashIfNotSkipped($fileInfo, $event->getUserID());
                    foreach ($files as $finfo) {
                        if ($finfo === $fileInfo || ($fileInfo->getId() !== null && $finfo->getId() === $fileInfo->getId())) {
                            continue;
                        }
                        $this->hashIfNotSkipped($finfo, $event->getUserID());
                    }
                    unset($finfo);
                } else {
                    $this->fileInfoService->calculateHashes($fileInfo, $event->getUserID(), false);
                }
            }
        } catch (ForcedToIgnoreFileException $e) {
            // Skipped on purpose by an app setting, see hashIfNotSkipped()
            return;
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
