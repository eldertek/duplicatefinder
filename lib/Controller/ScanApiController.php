<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\ScanStatusService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class ScanApiController extends AbstractAPIController
{
    private FileInfoService $fileInfoService;
    private ScanStatusService $scanStatusService;
    private ?ISession $session;

    public function __construct(
        string $appName,
        IRequest $request,
        ?IUserSession $userSession,
        LoggerInterface $logger,
        FileInfoService $fileInfoService,
        ScanStatusService $scanStatusService,
        ?ISession $session = null
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->scanStatusService = $scanStatusService;
        $this->session = $session;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function status(): DataResponse
    {
        try {
            $userId = $this->getUserId();

            return new DataResponse([
                'status' => 'success',
                'scan' => $this->scanStatusService->getStatus($userId),
            ]);
        } catch (\Exception $e) {
            return $this->handleException($e);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function start(): DataResponse
    {
        try {
            $userId = $this->getUserId();
            if ($this->session !== null) {
                $this->session->close();
            }
            if (function_exists('set_time_limit')) {
                @set_time_limit(0);
            }

            $this->fileInfoService->scanFiles($userId);

            return new DataResponse([
                'status' => 'success',
                'scan' => $this->scanStatusService->getStatus($userId),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Error running user duplicate scan', [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return $this->handleException($e);
        }
    }
}
