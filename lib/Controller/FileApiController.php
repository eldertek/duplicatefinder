<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use Exception;
use OCA\DuplicateFinder\Service\FileService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

/**
 * @package OCA\DuplicateFinder\Controller
 */
class FileApiController extends Controller {
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
     * Delete a file
     * 
     * @NoAdminRequired
     * @NoCSRFRequired
     * @return JSONResponse
     */
    public function delete(): JSONResponse {
        $path = $this->request->getParam('path');
        if (empty($path)) {
            return new JSONResponse(
                ['error' => 'Path parameter is required'],
                Http::STATUS_BAD_REQUEST
            );
        }

        try {
            $this->logger->debug('Attempting to delete file: {path}', ['path' => $path]);
            $this->service->deleteFile($this->userId, $path);
            $this->logger->info('Successfully deleted file: {path}', ['path' => $path]);

            return new JSONResponse(['status' => 'success']);
        } catch (Exception $e) {
            $this->logger->error('Error deleting file: {error}', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            $status = match (true) {
                $e instanceof \OCA\DuplicateFinder\Exception\OriginFolderProtectionException => Http::STATUS_FORBIDDEN,
                $e instanceof \OCP\Files\NotFoundException => Http::STATUS_NOT_FOUND,
                $e instanceof \OCP\Files\NotPermittedException => Http::STATUS_FORBIDDEN,
                default => Http::STATUS_INTERNAL_SERVER_ERROR,
            };

            $message = match (true) {
                $e instanceof \OCA\DuplicateFinder\Exception\OriginFolderProtectionException => [
                    'error' => 'ORIGIN_FOLDER_PROTECTED',
                    'message' => $e->getMessage()
                ],
                $e instanceof \OCP\Files\NotFoundException => [
                    'error' => 'FILE_NOT_FOUND',
                    'message' => 'File not found: ' . $path
                ],
                $e instanceof \OCP\Files\NotPermittedException => [
                    'error' => 'PERMISSION_DENIED',
                    'message' => 'Permission denied to delete file: ' . $path
                ],
                default => [
                    'error' => 'INTERNAL_ERROR',
                    'message' => 'An unexpected error occurred'
                ],
            };

            return new JSONResponse($message, $status);
        }
    }
} 