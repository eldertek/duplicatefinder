<?php

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\Service\FilterService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

class FilterController extends Controller
{
    /** @var FilterService */
    private $service;

    /** @var IUserSession */
    private $userSession;

    public function __construct(
        string $appName,
        IRequest $request,
        FilterService $service,
        IUserSession $userSession
    ) {
        parent::__construct($appName, $request);
        $this->service = $service;
        $this->userSession = $userSession;
    }

    private function resolveAuthenticatedUserId(): ?string
    {
        $user = $this->userSession->getUser();
        if ($user === null) {
            return null;
        }
        $uid = $user->getUID();

        return $uid !== '' ? $uid : null;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): JSONResponse
    {
        $userId = $this->resolveAuthenticatedUserId();
        if ($userId === null) {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }

        return new JSONResponse($this->service->getFilters($userId));
    }

    /**
     * @NoAdminRequired
     */
    public function create(string $type, string $value): JSONResponse
    {
        $userId = $this->resolveAuthenticatedUserId();
        if ($userId === null) {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }
        if (trim($type) === '' || trim($value) === '') {
            return new JSONResponse(['error' => 'Filter type and value are required'], Http::STATUS_BAD_REQUEST);
        }

        try {
            return new JSONResponse($this->service->createFilter($type, $value, $userId));
        } catch (\InvalidArgumentException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }
    }

    /**
     * @NoAdminRequired
     */
    public function destroy(int $id): JSONResponse
    {
        $userId = $this->resolveAuthenticatedUserId();
        if ($userId === null) {
            return new JSONResponse(['error' => 'Authentication required'], Http::STATUS_UNAUTHORIZED);
        }
        if ($id <= 0) {
            return new JSONResponse(['error' => 'Invalid filter ID'], Http::STATUS_BAD_REQUEST);
        }

        try {
            $this->service->deleteFilter($id, $userId);

            return new JSONResponse(['status' => 'success']);
        } catch (DoesNotExistException $e) {
            return new JSONResponse(['error' => 'Filter not found'], Http::STATUS_NOT_FOUND);
        } catch (\InvalidArgumentException $e) {
            return new JSONResponse(['error' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        }
    }
}
