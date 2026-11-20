<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use Exception;
use OCA\DuplicateFinder\Exception\AbortedDeletionException;
use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoConfirmationRequiredException;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\FileService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;

/**
 * @package OCA\DuplicateFinder\Controller
 */
class FileApiController extends Controller
{
    private FileService $service;
    private string $userId;
    private LoggerInterface $logger;

    public function __construct(
        string $AppName,
        IRequest $request,
        FileService $service,
        string $userId,
        LoggerInterface $logger
    ) {
        parent::__construct($AppName, $request);
        $this->service = $service;
        $this->userId = $userId;
        $this->logger = $logger;
    }

    /**
     * Delete one or multiple files
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     * @return JSONResponse
     */
    public function delete(): JSONResponse
    {
        $path = $this->request->getParam('path');
        $paths = $this->request->getParam('paths');
        // Optional, sent by the web interface: which node it is and which duplicate group it belongs to
        $extra = $this->request->getParams();
        $nodeId = isset($extra['nodeId']) && is_numeric($extra['nodeId']) ? (int)$extra['nodeId'] : null;
        $hash = isset($extra['hash']) && is_string($extra['hash']) && $extra['hash'] !== '' ? $extra['hash'] : null;
        $allowLastCopy = filter_var($extra['allowLastCopy'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $allowLivePhotoPair = filter_var($extra['allowLivePhotoPair'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (empty($path) && empty($paths) && $nodeId === null) {
            return new JSONResponse(
                ['error' => 'Path or paths parameter is required'],
                Http::STATUS_BAD_REQUEST
            );
        }

        $results = ['success' => [], 'errors' => []];

        try {
            if (!empty($paths) && is_array($paths)) {
                foreach ($paths as $singlePath) {
                    try {
                        $this->logger->debug('Attempting to delete file: {path}', ['path' => $singlePath]);
                        if ($allowLivePhotoPair) {
                            $this->service->deleteFile($this->userId, $singlePath, null, null, false, true);
                        } else {
                            $this->service->deleteFile($this->userId, $singlePath);
                        }
                        $this->logger->info('Successfully deleted file: {path}', ['path' => $singlePath]);
                        $results['success'][] = $singlePath;
                    } catch (Exception $e) {
                        $this->logDeletionFailure($e, $singlePath);
                        $error = $this->getDeletionError($e, $singlePath);
                        $results['errors'][] = [
                            'path' => $singlePath,
                            'error' => $error['error'],
                            'message' => $error['message'],
                        ];
                    }
                }

                return new JSONResponse($results);
            } else {
                $this->logger->debug('Attempting to delete single file: {path}', ['path' => $path]);
                if ($allowLivePhotoPair) {
                    $deletedNodeIds = $this->service->deleteFile(
                        $this->userId,
                        (string)$path,
                        $nodeId,
                        $hash,
                        $allowLastCopy,
                        true
                    );
                } elseif ($nodeId === null && $hash === null && !$allowLastCopy) {
                    $deletedNodeIds = $this->service->deleteFile($this->userId, (string)$path);
                } else {
                    $deletedNodeIds = $this->service->deleteFile(
                        $this->userId,
                        (string)$path,
                        $nodeId,
                        $hash,
                        $allowLastCopy
                    );
                }
                $this->logger->info('Successfully deleted file: {path}', ['path' => $path]);

                $result = ['status' => 'success'];
                if (count($deletedNodeIds) > 1) {
                    $result['deletedNodeIds'] = $deletedNodeIds;
                }

                return new JSONResponse($result);
            }
        } catch (Exception $e) {
            $this->logDeletionFailure($e, (string)$path, true);

            return new JSONResponse(
                $this->getDeletionError($e, (string)$path),
                $this->getDeletionErrorStatus($e)
            );
        }
    }

    private function getDeletionErrorStatus(Exception $e): int
    {
        return match (true) {
            $e instanceof OriginFolderProtectionException => Http::STATUS_FORBIDDEN,
            $e instanceof LastCopyProtectionException => Http::STATUS_CONFLICT,
            $e instanceof LivePhotoProtectionException => Http::STATUS_CONFLICT,
            $e instanceof AbortedDeletionException => Http::STATUS_CONFLICT,
            $e instanceof LivePhotoPairProtectionException => Http::STATUS_CONFLICT,
            $e instanceof \OCP\Files\NotFoundException => Http::STATUS_NOT_FOUND,
            $e instanceof \OCP\Files\NotPermittedException => Http::STATUS_FORBIDDEN,
            $e instanceof LockedException => Http::STATUS_LOCKED,
            default => Http::STATUS_INTERNAL_SERVER_ERROR,
        };
    }

    private function getDeletionError(Exception $e, string $path): array
    {
        return match (true) {
            $e instanceof OriginFolderProtectionException => [
                'error' => 'ORIGIN_FOLDER_PROTECTED',
                'message' => $e->getMessage(),
            ],
            $e instanceof LastCopyProtectionException => [
                'error' => 'LAST_COPY_PROTECTED',
                'message' => $e->getMessage(),
            ],
            $e instanceof LivePhotoProtectionException => [
                'error' => 'LIVE_PHOTO_VIDEO_PROTECTED',
                'message' => $e->getMessage(),
            ],
            $e instanceof AbortedDeletionException => [
                'error' => 'DELETE_ABORTED',
                'message' => $e->getMessage(),
            ],
            $e instanceof LivePhotoConfirmationRequiredException => [
                'error' => 'LIVE_PHOTO_CONFIRMATION_REQUIRED',
                'message' => $e->getMessage(),
            ],
            $e instanceof LivePhotoPairProtectionException => [
                'error' => 'LIVE_PHOTO_PAIR_PROTECTED',
                'message' => $e->getMessage(),
            ],
            $e instanceof \OCP\Files\NotFoundException => [
                'error' => 'FILE_NOT_FOUND',
                'message' => 'File not found: ' . $path,
            ],
            $e instanceof \OCP\Files\NotPermittedException => [
                'error' => 'PERMISSION_DENIED',
                'message' => 'Permission denied to delete file: ' . $path,
            ],
            $e instanceof LockedException => [
                'error' => 'FILE_LOCKED',
                'message' => 'File is locked: ' . $path,
            ],
            default => [
                'error' => 'INTERNAL_ERROR',
                'message' => 'An unexpected error occurred',
            ],
        };
    }

    private function logDeletionFailure(Exception $e, string $path, bool $includeTrace = false): void
    {
        $context = [
            'error' => $e->getMessage(),
            'path' => $path,
        ];

        if ($e instanceof LockedException) {
            $this->logger->warning('File deletion blocked by lock: {error}', $context);

            return;
        }

        if ($e instanceof LivePhotoProtectionException) {
            $this->logger->warning('File deletion blocked by Nextcloud Live Photo protection: {error}', $context);

            return;
        }

        if ($e instanceof AbortedDeletionException) {
            $this->logger->warning('File deletion aborted by Nextcloud: {error}', $context);

            return;
        }

        if ($e instanceof LivePhotoPairProtectionException) {
            $this->logger->warning('File deletion blocked by Live Photo protection: {error}', $context);

            return;
        }

        if ($includeTrace) {
            $context['trace'] = $e->getTraceAsString();
        }

        $this->logger->error('Error deleting file: {error}', $context);
    }
}
