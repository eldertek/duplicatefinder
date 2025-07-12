<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class ExcludedFolderController extends Controller
{
    private ExcludedFolderService $service;
    private LoggerInterface $logger;

    public function __construct(
        string $appName,
        IRequest $request,
        ExcludedFolderService $service,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request);
        $this->service = $service;
        $this->logger = $logger;
    }

    /**
     * @NoAdminRequired
     * @return JSONResponse
     */
    public function index(): JSONResponse
    {
        try {
            return new JSONResponse($this->service->findAll());
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
        try {
            $excludedFolder = $this->service->create($path);

            return new JSONResponse($excludedFolder);
        } catch (\RuntimeException $e) {
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
        try {
            $this->service->delete($id);

            return new JSONResponse(null, Http::STATUS_NO_CONTENT);
        } catch (\RuntimeException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_NOT_FOUND);
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete excluded folder', ['exception' => $e]);

            return new JSONResponse(['error' => 'Failed to delete excluded folder'], Http::STATUS_INTERNAL_SERVER_ERROR);
        }
    }
}
