<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\ScanStatusService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;

class ScanApiController extends AbstractAPIController
{
    private FileInfoService $fileInfoService;
    private ScanStatusService $scanStatusService;
    private ?ISession $session;
    private ?ILockingProvider $lockingProvider;

    public function __construct(
        string $appName,
        IRequest $request,
        ?IUserSession $userSession,
        LoggerInterface $logger,
        FileInfoService $fileInfoService,
        ScanStatusService $scanStatusService,
        ?ISession $session = null,
        ?ILockingProvider $lockingProvider = null
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->scanStatusService = $scanStatusService;
        $this->session = $session;
        $this->lockingProvider = $lockingProvider;
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
     */
    public function start(): DataResponse
    {
        $lockKey = null;
        $lockAcquired = false;

        try {
            $userId = $this->getUserId();
            if ($this->session !== null) {
                $this->session->close();
            }

            $currentStatus = $this->scanStatusService->getStatus($userId);
            if (!empty($currentStatus['running'])) {
                return new DataResponse([
                    'status' => 'error',
                    'message' => 'A scan is already running',
                    'scan' => $currentStatus,
                ], Http::STATUS_CONFLICT);
            }

            if ($this->lockingProvider !== null) {
                $lockKey = 'df-scan/' . substr(hash('sha256', $userId), 0, 48);
                try {
                    $this->lockingProvider->acquireLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
                    $lockAcquired = true;
                } catch (LockedException $e) {
                    return new DataResponse([
                        'status' => 'error',
                        'message' => 'A scan is already running',
                        'scan' => $this->scanStatusService->getStatus($userId),
                    ], Http::STATUS_CONFLICT);
                }
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
        } catch (\Throwable $e) {
            $this->logger->error('Error running user duplicate scan', [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return $this->handleException(new \RuntimeException($e->getMessage(), (int)$e->getCode(), $e));
        } finally {
            if ($lockAcquired && $this->lockingProvider !== null && $lockKey !== null) {
                try {
                    $this->lockingProvider->releaseLock($lockKey, ILockingProvider::LOCK_EXCLUSIVE);
                } catch (\Throwable $ignore) {
                    // Best-effort lock release
                }
            }
        }
    }
}
