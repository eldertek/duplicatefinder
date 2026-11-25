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
        ?string $userId,
        LoggerInterface $logger
    ) {
        parent::__construct($AppName, $request);
        $this->service = $service;
        $this->userId = $userId ?? '';
        $this->logger = $logger;
    }

    private function requireAuthenticatedUser(): ?JSONResponse
    {
        if ($this->userId === '') {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }
        $this->service->setUserId($this->userId);

        return null;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

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
     */
    public function create(array $folders): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

        if ($folders === []) {
            return new JSONResponse(['error' => 'A non-empty folders array is required'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $this->logger->debug('Creating origin folders: {folders}', ['folders' => json_encode($folders)]);
            $createdFolders = [];
            $errors = [];

            foreach ($folders as $folderPath) {
                if (!is_string($folderPath) || trim($folderPath) === '' || str_contains($folderPath, "\0")) {
                    $errors[] = [
                        'path' => is_string($folderPath) ? $folderPath : '',
                        'error' => 'Invalid folder path',
                    ];
                    continue;
                }

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
     */
    public function destroy(int $id): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

        if ($id <= 0) {
            return new JSONResponse(['error' => 'Invalid origin folder ID'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $folder = $this->service->delete($id);

            return new JSONResponse($folder);
        } catch (Exception $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        }
    }
}
