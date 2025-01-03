<?php

namespace OCA\DuplicateFinder\Controller;

use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;

use OCA\DuplicateFinder\Service\FilterService;

class FilterController extends Controller {
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

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): JSONResponse {
        $userId = $this->userSession->getUser()->getUID();
        return new JSONResponse($this->service->getFilters($userId));
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function create(string $type, string $value): JSONResponse {
        $userId = $this->userSession->getUser()->getUID();
        return new JSONResponse($this->service->createFilter($type, $value, $userId));
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function destroy(int $id): JSONResponse {
        $userId = $this->userSession->getUser()->getUID();
        $this->service->deleteFilter($id, $userId);
        return new JSONResponse(['status' => 'success']);
    }
} 