<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use Exception;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class OriginFolderApiController extends Controller
{
    private OriginFolderService $service;
    private string $userId;
    private LoggerInterface $logger;

    public function __construct(
        string $AppName,
        IRequest $request,
        OriginFolderService $service,
        string $userId,
        LoggerInterface $logger
    ) {
        parent::__construct($AppName, $request);
        $this->service = $service;
        $this->userId = $userId;
        $this->logger = $logger;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): JSONResponse
    {
        try {
            $folders = $this->service->findAll();

            return new JSONResponse([
                'folders' => array_map(function ($folder) {
                    return [
                        'id' => $folder->getId(),
                        'path' => $folder->getFolderPath(),
                    ];
                }, $folders),
            ]);
        } catch (Exception $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function create(array $folders): JSONResponse
    {
        try {
            $this->logger->debug('Creating origin folders: {folders}', ['folders' => json_encode($folders)]);
            $createdFolders = [];
            $errors = [];

            foreach ($folders as $folderPath) {
                try {
                    $this->logger->debug('Attempting to create origin folder: {path}', ['path' => $folderPath]);
                    $this->service->create($folderPath);
                    $createdFolders[] = $folderPath;
                    $this->logger->debug('Successfully created origin folder: {path}', ['path' => $folderPath]);
                } catch (Exception $e) {
                    $this->logger->error('Failed to create origin folder: {path}, error: {error}', [
                        'path' => $folderPath,
                        'error' => $e->getMessage(),
                    ]);
                    $errors[] = [
                        'path' => $folderPath,
                        'error' => $e->getMessage(),
                    ];
                }
            }

            $this->logger->debug('Creation complete. Created: {created}, Errors: {errors}', [
                'created' => count($createdFolders),
                'errors' => count($errors),
            ]);

            return new JSONResponse([
                'created' => $createdFolders,
                'errors' => $errors,
            ], empty($errors) ? Http::STATUS_CREATED : Http::STATUS_MULTI_STATUS);
        } catch (Exception $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function destroy(int $id): JSONResponse
    {
        try {
            $folder = $this->service->delete($id);

            return new JSONResponse($folder);
        } catch (Exception $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
