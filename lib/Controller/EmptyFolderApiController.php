<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use Exception;
use OCA\DuplicateFinder\Service\EmptyFolderCleanupService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class EmptyFolderApiController extends Controller
{
    private EmptyFolderCleanupService $service;
    private string $userId;
    private LoggerInterface $logger;

    public function __construct(
        string $AppName,
        IRequest $request,
        EmptyFolderCleanupService $service,
        ?string $userId,
        LoggerInterface $logger
    ) {
        parent::__construct($AppName, $request);
        $this->service = $service;
        $this->userId = $userId ?? '';
        $this->logger = $logger;
    }

    /**
     * Scan for empty folders (either across user storage or scoped to candidate paths).
     *
     * @NoAdminRequired
     * @return JSONResponse
     */
    public function scan(): JSONResponse
    {
        if ($this->userId === '') {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }

        $candidatePathsParam = $this->request->getParam('candidatePaths', []);
        $candidatePaths = is_array($candidatePathsParam) ? $candidatePathsParam : [];

        try {
            $folders = $this->service->findEmptyFolders($this->userId, $candidatePaths);

            return new JSONResponse([
                'folders' => $folders,
                'count' => count($folders),
            ]);
        } catch (Exception $e) {
            $this->logger->error('Failed to scan empty folders: {error}', ['error' => $e->getMessage()]);

            return new JSONResponse(
                ['error' => 'Failed to scan empty folders'],
                Http::STATUS_INTERNAL_SERVER_ERROR
            );
        }
    }

    /**
     * Delete selected empty folders.
     *
     * @NoAdminRequired
     * @return JSONResponse
     */
    public function delete(): JSONResponse
    {
        if ($this->userId === '') {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }

        $pathsParam = $this->request->getParam('paths', []);
        if (!is_array($pathsParam) || $pathsParam === []) {
            return new JSONResponse(
                ['error' => 'A non-empty paths array is required'],
                Http::STATUS_BAD_REQUEST
            );
        }

        try {
            $result = $this->service->deleteEmptyFolders($this->userId, $pathsParam);

            return new JSONResponse($result);
        } catch (Exception $e) {
            $this->logger->error('Failed to delete empty folders: {error}', ['error' => $e->getMessage()]);

            return new JSONResponse(
                ['error' => 'Failed to delete empty folders'],
                Http::STATUS_INTERNAL_SERVER_ERROR
            );
        }
    }
}
