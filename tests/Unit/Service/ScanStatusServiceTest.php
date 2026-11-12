<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Controller\ScanApiController;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ScanStatusService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ScanStatusServiceTest extends TestCase
{
    /** @var array<string, string> */
    private array $userStore = [];

    /** @var array<string, string> */
    private array $appStore = [];

    private function createService(): ScanStatusService
    {
        $connection = $this->createMock(IDBConnection::class);
        $connection->method('getQueryBuilder')
            ->willThrowException(new \RuntimeException('No DB in unit test'));

        $config = $this->createMock(IConfig::class);
        $config->method('getUserValue')
            ->willReturnCallback(function (string $user, string $app, string $key, string $default = '') {
                return $this->userStore[$user . ':' . $app . ':' . $key] ?? $default;
            });
        $config->method('setUserValue')
            ->willReturnCallback(function (string $user, string $app, string $key, string $value): void {
                $this->userStore[$user . ':' . $app . ':' . $key] = $value;
            });
        $config->method('getAppValue')
            ->willReturnCallback(function (string $app, string $key, string $default = '') {
                return $this->appStore[$app . ':' . $key] ?? $default;
            });
        $config->method('setAppValue')
            ->willReturnCallback(function (string $app, string $key, string $value): void {
                $this->appStore[$app . ':' . $key] = $value;
            });

        $logger = $this->createMock(LoggerInterface::class);

        return new ScanStatusService($connection, $config, $logger);
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->userStore = [];
        $this->appStore = [];
    }

    public function testStartUpdateAndFinishTrackPercentageEtaAndMonotonicSequence(): void
    {
        $service = $this->createService();

        $started = $service->startScan('qa-user', 200);
        $this->assertTrue($started['running']);
        $this->assertFalse($started['indeterminate']);
        $this->assertSame(0, $started['scannedFiles']);
        $this->assertSame(200, $started['totalFiles']);
        $this->assertSame(0, $started['percentage']);

        $pastStart = time() - 10;
        $updated = $service->updateProgress('qa-user', 50, 200, $pastStart, 0, null);
        $this->assertTrue($updated['running']);
        $this->assertSame(50, $updated['scannedFiles']);
        $this->assertSame(200, $updated['totalFiles']);
        $this->assertSame(25, $updated['percentage']);
        $this->assertSame(30, $updated['etaSeconds']);

        $finishedFirst = $service->finishScan('qa-user', 200, 200, $pastStart, 0);
        $this->assertFalse($finishedFirst['running']);
        $this->assertSame(100, $finishedFirst['percentage']);
        $this->assertGreaterThan(0, $finishedFirst['completedSeq']);

        $finishedSecond = $service->finishScan('qa-user', 205, 200, $pastStart, $finishedFirst['completedSeq']);
        $this->assertSame(205, $finishedSecond['totalFiles']);
        $this->assertGreaterThan($finishedFirst['completedSeq'], $finishedSecond['completedSeq']);
    }

    public function testStaleRunningStatusExpiresAutomatically(): void
    {
        $service = $this->createService();
        $staleTime = time() - 600;
        $this->userStore['qa-user:' . Application::ID . ':scan_status_v1'] = json_encode([
            'running' => true,
            'indeterminate' => false,
            'scannedFiles' => 10,
            'totalFiles' => 100,
            'percentage' => 10,
            'startedAt' => $staleTime,
            'updatedAt' => $staleTime,
            'completedAt' => null,
            'completedSeq' => 5,
            'etaSeconds' => 90,
        ]);

        $status = $service->getStatus('qa-user');
        $this->assertFalse($status['running']);
        $this->assertNull($status['etaSeconds']);
        $this->assertSame(5, $status['completedSeq']);

        // Verify stale state was persisted as running=false in user config
        $persisted = json_decode($this->userStore['qa-user:' . Application::ID . ':scan_status_v1'], true);
        $this->assertIsArray($persisted);
        $this->assertFalse($persisted['running']);
    }

    public function testBackgroundModeDoesNotMarkInteractiveScanRunning(): void
    {
        $service = $this->createService();
        $service->setBackgroundMode(true);

        $started = $service->startScan('qa-user', 500);
        $this->assertFalse($started['running']);

        $updated = $service->updateProgress('qa-user', 250, 500, time() - 5, 0, null);
        $this->assertFalse($updated['running']);

        $service->setBackgroundMode(false);
    }

    public function testScannerUtilRecordsStartAndCompletionInScanStatusService(): void
    {
        $service = $this->createService();
        $logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $shareService->method('getShares')->willReturn([]);
        $filterService = $this->createMock(FilterService::class);
        $filterService->method('shouldSkipDirectory')->willReturn(false);
        $folderService = $this->createMock(FolderService::class);
        $fileInfoService = $this->createMock(FileInfoService::class);

        $fileA = $this->createMock(File::class);
        $fileA->method('getPath')->willReturn('/qa-user/files/a.bin');
        $fileB = $this->createMock(File::class);
        $fileB->method('getPath')->willReturn('/qa-user/files/b.bin');

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-user/files');
        $userFolder->method('getDirectoryListing')->willReturn([$fileA, $fileB]);
        $folderService->method('getUserFolder')->with('qa-user')->willReturn($userFolder);

        $scanner = new ScannerUtil($logger, $shareService, $filterService, $folderService, $service);
        $scanner->setHandles($fileInfoService, null, null);
        $scanner->scan('qa-user', '/qa-user/files');

        $finalStatus = $service->getStatus('qa-user');
        $this->assertFalse($finalStatus['running']);
        $this->assertSame(2, $finalStatus['scannedFiles']);
        $this->assertSame(2, $finalStatus['totalFiles']);
        $this->assertSame(100, $finalStatus['percentage']);
        $this->assertGreaterThan(0, $finalStatus['completedSeq']);
    }

    public function testScanApiControllerClosesSessionBeforeScanningCurrentUser(): void
    {
        $service = $this->createService();
        $request = $this->createMock(IRequest::class);
        $userSession = $this->createMock(IUserSession::class);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('qa-user');
        $userSession->method('getUser')->willReturn($user);
        $logger = $this->createMock(LoggerInterface::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $session = $this->createMock(ISession::class);

        $events = [];
        $session->expects($this->once())
            ->method('close')
            ->willReturnCallback(function () use (&$events): void {
                $events[] = 'session.close';
            });
        $fileInfoService->expects($this->once())
            ->method('scanFiles')
            ->with('qa-user')
            ->willReturnCallback(function () use (&$events, $service): void {
                $events[] = 'scanFiles';
                $service->finishScan('qa-user', 4, 4, time(), 0);
            });

        $controller = new ScanApiController(
            Application::ID,
            $request,
            $userSession,
            $logger,
            $fileInfoService,
            $service,
            $session
        );

        $response = $controller->start();
        $data = $response->getData();

        $this->assertSame(['session.close', 'scanFiles'], $events);
        $this->assertSame('success', $data['status']);
        $this->assertFalse($data['scan']['running']);
        $this->assertSame(4, $data['scan']['scannedFiles']);
    }
}
