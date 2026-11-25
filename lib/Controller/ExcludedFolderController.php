<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class ExcludedFolderController extends Controller
{
    private ExcludedFolderService $service;
    private LoggerInterface $logger;
    private ?FileInfoService $fileInfoService;
    private ?FileDuplicateService $fileDuplicateService;
    private ?IUserSession $userSession;

    public function __construct(
        string $appName,
        IRequest $request,
        ExcludedFolderService $service,
        LoggerInterface $logger,
        ?FileInfoService $fileInfoService = null,
        ?FileDuplicateService $fileDuplicateService = null,
        ?IUserSession $userSession = null
    ) {
        parent::__construct($appName, $request);
        $this->service = $service;
        $this->logger = $logger;
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->userSession = $userSession;
    }

    private function requireAuthenticatedUser(): ?JSONResponse
    {
        if ($this->userSession === null) {
            return null;
        }

        $user = $this->userSession->getUser();
        if ($user === null || $user->getUID() === '') {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }

        $this->service->setUserId($user->getUID());

        return null;
    }

    private function isUnauthenticatedRuntimeException(\RuntimeException $e): bool
    {
        return str_contains($e->getMessage(), 'User context required');
    }

    /**
     * @NoAdminRequired
     * @return JSONResponse
     */
    public function index(): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

        try {
            return new JSONResponse($this->service->findAll());
        } catch (\RuntimeException $e) {
            if ($this->isUnauthenticatedRuntimeException($e)) {
                return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
            }
            $this->logger->error('Failed to get excluded folders', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to get excluded folders'], Http::STATUS_INTERNAL_SERVER_ERROR);
        } catch (\Exception $e) {
            $this->logger->error('Failed to get excluded folders', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to get excluded folders'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @NoAdminRequired
     * @param string $path
     * @return JSONResponse
     */
    public function create(string $path): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

        if (trim($path) === '') {
            return new JSONResponse(['error' => 'Folder path is required'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $excludedFolder = $this->service->create($path);
            if ($this->fileInfoService !== null && $excludedFolder->getUserId() !== '') {
                $affectedHashes = $this->fileInfoService->ignoreFilesInFolder(
                    $excludedFolder->getUserId(),
                    $excludedFolder->getFolderPath()
                );
                if ($this->fileDuplicateService !== null) {
                    foreach ($affectedHashes as $hash) {
                        $this->fileDuplicateService->removeIfOrphaned($hash);
                    }
                }
            }

            return new JSONResponse($excludedFolder);
        } catch (\RuntimeException $e) {
            if ($this->isUnauthenticatedRuntimeException($e)) {
                return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
            }
            if ($e->getMessage() === 'Folder is already excluded') {
                return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_CONFLICT);
            }

            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        } catch (\Exception $e) {
            $this->logger->error('Failed to create excluded folder', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to create excluded folder'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * @NoAdminRequired
     * @param int $id
     * @return JSONResponse
     */
    public function destroy(int $id): JSONResponse
    {
        if (($authError = $this->requireAuthenticatedUser()) !== null) {
            return $authError;
        }

        if ($id <= 0) {
            return new JSONResponse(['error' => 'Invalid excluded folder ID'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $this->service->delete($id);

            return new JSONResponse(null, Http::STATUS_NO_CONTENT);
        } catch (\RuntimeException $e) {
            if ($this->isUnauthenticatedRuntimeException($e)) {
                return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
            }
            if ($e->getMessage() === 'Excluded folder not found') {
                return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_NOT_FOUND);
            }
            $this->logger->error('Failed to delete excluded folder', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to delete excluded folder'], Http::STATUS_INTERNAL_SERVER_ERROR);
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete excluded folder', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to delete excluded folder'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
}
