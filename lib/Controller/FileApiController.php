<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use Exception;
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

        if (empty($path) && empty($paths)) {
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
                        $this->service->deleteFile($this->userId, $singlePath);
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
                $this->service->deleteFile($this->userId, $path);
                $this->logger->info('Successfully deleted file: {path}', ['path' => $path]);

                return new JSONResponse(['status' => 'success']);
            }
        } catch (Exception $e) {
            $this->logDeletionFailure($e, $path, true);

            return new JSONResponse(
                $this->getDeletionError($e, $path),
                $this->getDeletionErrorStatus($e)
            );
        }
    }

    private function getDeletionErrorStatus(Exception $e): int
    {
        return match (true) {
            $e instanceof \OCA\DuplicateFinder\Exception\OriginFolderProtectionException => Http::STATUS_FORBIDDEN,
            $e instanceof \OCP\Files\NotFoundException => Http::STATUS_NOT_FOUND,
            $e instanceof \OCP\Files\NotPermittedException => Http::STATUS_FORBIDDEN,
            $e instanceof LockedException => Http::STATUS_LOCKED,
            default => Http::STATUS_INTERNAL_SERVER_ERROR,
        };
    }

    private function getDeletionError(Exception $e, string $path): array
    {
        return match (true) {
            $e instanceof \OCA\DuplicateFinder\Exception\OriginFolderProtectionException => [
                'error' => 'ORIGIN_FOLDER_PROTECTED',
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

        if ($includeTrace) {
            $context['trace'] = $e->getTraceAsString();
        }

        $this->logger->error('Error deleting file: {error}', $context);
    }
}
