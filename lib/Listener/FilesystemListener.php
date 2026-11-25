<?php

namespace OCA\DuplicateFinder\Listener;

use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Files\Events\Node\AbstractNodeEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeRenamedEvent;
use OCP\Files\Folder;
use OCP\Files\Node;
use Psr\Log\LoggerInterface;

/**
 * @template T of Event
 * @implements IEventListener<T>
 */
class FilesystemListener implements IEventListener
{
    /** @var FileInfoService */
    private $fileInfoService;
    /** @var FileDuplicateService */
    private $fileDuplicateService;
    /** @var LoggerInterface */
    private $logger;
    /** @var ConfigService */
    private $config;

    public function __construct(
        FileInfoService $fileInfoService,
        FileDuplicateService $fileDuplicateService,
        LoggerInterface $logger,
        ConfigService $config
    ) {
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->logger = $logger;
        $this->config = $config;
    }

    public function handle(Event $event): void
    {
        if ($this->config->areFilesytemEventsDisabled()) {
            return;
        }
        if ($event instanceof NodeDeletedEvent) {
            $node = $event->getNode();
            $this->handleDeleteEvent($node);
        } elseif ($event instanceof NodeRenamedEvent) {
            $source = $event->getSource();
            $target = $event->getTarget();
            if ($target instanceof Folder) {
                // Only files are tracked: a folder has no file info to move
                return;
            }

            $this->handleRenameEvent($source, $target);
        } elseif ($event instanceof AbstractNodeEvent) {
            $node = $event->getNode();
            if ($node instanceof Folder) {
                // Only files can be duplicates. Saving folders created rows with the
                // directory mimetype that every same-size lookup had to go through.
                return;
            }

            $this->handleNodeSaveEvent($node);
        }
    }

    private function resolveOwnerUid(Node $node): ?string
    {
        try {
            $owner = $node->getOwner();

            return $owner !== null ? $owner->getUID() : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function handleRenameEvent(Node $source, Node $target): void
    {
        $sourcePath = $source->getPath();
        $sourceOwner = $this->resolveOwnerUid($source);

        try {
            $fileInfo = null;
            if ($sourceOwner !== null) {
                try {
                    $fileInfo = $this->fileInfoService->find($sourcePath, $sourceOwner);
                } catch (\Throwable $e) {
                    $fileInfo = null;
                }
            }
            if ($fileInfo === null) {
                try {
                    $fileInfo = $this->fileInfoService->find($sourcePath, null);
                } catch (DoesNotExistException $e) {
                    return;
                }
            }

            $fileInfo->setPath($target->getPath());
            $targetOwner = $this->resolveOwnerUid($target);
            if ($targetOwner !== null) {
                $fileInfo->setOwner($targetOwner);
            }
            $this->fileInfoService->update($fileInfo, $targetOwner);
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to update file info after rename', [
                'source' => $sourcePath,
                'target' => $target->getPath(),
                'exception' => $e,
            ]);
        }
    }

    private function handleNodeSaveEvent(Node $node): void
    {
        $nodePath = $node->getPath();
        $ownerUid = $this->resolveOwnerUid($node);

        try {
            if ($ownerUid !== null) {
                $this->fileInfoService->save($nodePath, $ownerUid);

                return;
            }
            $this->fileInfoService->save($nodePath, null);
        } catch (ForcedToIgnoreFileException $e) {
            $this->logger->info($e->getMessage(), ['exception' => $e]);
        } catch (\Throwable $e) {
            if ($ownerUid !== null) {
                try {
                    $this->fileInfoService->save($nodePath, null);

                    return;
                } catch (ForcedToIgnoreFileException $ignored) {
                    $this->logger->info($ignored->getMessage(), ['exception' => $ignored]);

                    return;
                } catch (\Throwable $fallbackError) {
                    $e = $fallbackError;
                }
            }
            $this->logger->warning('Failed to index file on filesystem event', [
                'path' => $nodePath,
                'exception' => $e,
            ]);
        }
    }

    private function handleDeleteEvent(Node $node): void
    {
        $nodePath = $node->getPath();
        $ownerUid = $this->resolveOwnerUid($node);

        try {
            $fileInfo = null;
            if ($ownerUid !== null) {
                try {
                    $fileInfo = $this->fileInfoService->find($nodePath, $ownerUid);
                } catch (\Throwable $e) {
                    $fileInfo = null;
                }
            }
            if ($fileInfo === null) {
                try {
                    $fileInfo = $this->fileInfoService->find($nodePath, null);
                } catch (DoesNotExistException $e) {
                    return;
                }
            }

            $this->fileInfoService->delete($fileInfo);
            if (!is_null($fileInfo->getFileHash())) {
                $count = $this->fileInfoService->countByHash($fileInfo->getFileHash());
                if ($count < 2) {
                    $this->fileDuplicateService->delete($fileInfo->getFileHash());
                }
            }
        } catch (\Throwable $e) {
            $this->logger->warning('Failed to clean up file info after delete event', [
                'path' => $nodePath,
                'exception' => $e,
            ]);
        }
    }
}
