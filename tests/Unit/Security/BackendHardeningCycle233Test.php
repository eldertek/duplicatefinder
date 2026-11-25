<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\BackgroundJob\CleanUpDB;
use OCA\DuplicateFinder\Command\FindDuplicates;
use OCA\DuplicateFinder\Controller\ExcludedFolderController;
use OCA\DuplicateFinder\Controller\ScanApiController;
use OCA\DuplicateFinder\Db\EEntity;
use OCA\DuplicateFinder\Db\EQBMapper;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCA\DuplicateFinder\Service\ScanStatusService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IFunctionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\QueryBuilder\IQueryFunction;
use OCP\Encryption\IManager as IEncryptionManager;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\ISession;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class BackendHardeningCycle233Test extends TestCase
{
    public function testExcludedFolderControllerRejectsUnauthenticatedRequestsWith401(): void
    {
        $request = $this->createMock(IRequest::class);
        $service = $this->createMock(ExcludedFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $userSession = $this->createMock(IUserSession::class);
        $userSession->method('getUser')->willReturn(null);

        $service->expects($this->never())->method('findAll');
        $service->expects($this->never())->method('create');
        $service->expects($this->never())->method('delete');

        $controller = new ExcludedFolderController(
            Application::ID,
            $request,
            $service,
            $logger,
            null,
            null,
            $userSession
        );

        $indexResponse = $controller->index();
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $indexResponse->getStatus());
        $this->assertSame(['error' => 'Authentication required'], $indexResponse->getData());

        $createResponse = $controller->create('/Photos');
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $createResponse->getStatus());

        $destroyResponse = $controller->destroy(10);
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $destroyResponse->getStatus());

        // Fallback when userSession is not provided and service rejects empty user context
        $legacyService = $this->createMock(ExcludedFolderService::class);
        $legacyService->method('findAll')->willThrowException(new \RuntimeException('User context required for this operation'));
        $legacyService->method('create')->willThrowException(new \RuntimeException('User context required for this operation'));
        $legacyService->method('delete')->willThrowException(new \RuntimeException('User context required for this operation'));

        $legacyController = new ExcludedFolderController(Application::ID, $request, $legacyService, $logger);
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $legacyController->index()->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $legacyController->create('/Photos')->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $legacyController->destroy(10)->getStatus());
    }

    public function testExcludedFolderControllerBindsUserContextAndMapsStatuses(): void
    {
        $request = $this->createMock(IRequest::class);
        $service = $this->createMock(ExcludedFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $userSession = $this->createMock(IUserSession::class);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('qa-bot');
        $userSession->method('getUser')->willReturn($user);

        $service->expects($this->atLeastOnce())->method('setUserId')->with('qa-bot');
        $service->method('create')
            ->with('/Photos')
            ->willThrowException(new \RuntimeException('Folder is already excluded'));
        $service->method('delete')
            ->willReturnCallback(static function (int $id): void {
                if ($id === 99) {
                    throw new \RuntimeException('Excluded folder not found');
                }
                throw new \RuntimeException('Failed to delete excluded folder');
            });

        $controller = new ExcludedFolderController(
            Application::ID,
            $request,
            $service,
            $logger,
            null,
            null,
            $userSession
        );

        $emptyCreate = $controller->create('   ');
        $this->assertSame(Http::STATUS_BAD_REQUEST, $emptyCreate->getStatus());

        $dupCreate = $controller->create('/Photos');
        $this->assertSame(Http::STATUS_CONFLICT, $dupCreate->getStatus());

        $badIdDestroy = $controller->destroy(0);
        $this->assertSame(Http::STATUS_BAD_REQUEST, $badIdDestroy->getStatus());

        $missingDestroy = $controller->destroy(99);
        $this->assertSame(Http::STATUS_NOT_FOUND, $missingDestroy->getStatus());

        $failedDestroy = $controller->destroy(12);
        $this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $failedDestroy->getStatus());
    }

    public function testExcludedFolderServiceRejectsNonFolderDuplicateAndBoundsCache(): void
    {
        $mapper = $this->createMock(ExcludedFolderMapper::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $logger = $this->createMock(LoggerInterface::class);
        $userFolder = $this->createMock(Folder::class);

        $fileNode = $this->createMock(File::class);
        $folderNode = $this->createMock(Folder::class);
        $folderNode->method('getId')->willReturn(42);

        $userFolder->method('get')
            ->willReturnMap([
                ['/secret.txt', $fileNode],
                ['/AlreadyExcluded', $folderNode],
            ]);
        $rootFolder->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $mapper->method('isFolderExcluded')
            ->willReturnCallback(static function (string $uid, string $path): bool {
                return $uid === 'qa-bot' && $path === '/AlreadyExcluded';
            });
        $mapper->expects($this->never())->method('insert');

        $service = new ExcludedFolderService($mapper, $rootFolder, 'qa-bot', $logger);

        try {
            $service->create('/secret.txt');
            $this->fail('Expected non-folder path to be rejected');
        } catch (\RuntimeException $e) {
            $this->assertSame('Target path is not a folder', $e->getMessage());
        }

        try {
            $service->create('/AlreadyExcluded');
            $this->fail('Expected duplicate excluded folder to be rejected');
        } catch (\RuntimeException $e) {
            $this->assertSame('Folder is already excluded', $e->getMessage());
        }

        // Verify per-user cache is bounded even when a long-lived worker iterates >256 users
        $cacheMapper = $this->createMock(ExcludedFolderMapper::class);
        $cacheMapper->method('findAllForUser')->willReturnCallback(static function (string $uid): array {
            $ef = new ExcludedFolder();
            $ef->setUserId($uid);
            $ef->setFolderPath('/Private');

            return [$ef];
        });

        $boundedService = new ExcludedFolderService($cacheMapper, $rootFolder, null, $logger);
        for ($i = 0; $i < 270; $i++) {
            $uid = 'probe-' . $i;
            $boundedService->setUserId($uid);
            $this->assertTrue($boundedService->isPathExcluded('/' . $uid . '/files/Private/a.txt'));
        }

        $refProp = new \ReflectionProperty(ExcludedFolderService::class, 'excludedFoldersCache');
        $refProp->setAccessible(true);
        $cached = $refProp->getValue($boundedService);
        $this->assertIsArray($cached);
        $this->assertLessThanOrEqual(256, count($cached));
    }

    public function testScanApiControllerEnforcesCsrfAndBlocksConcurrentScans(): void
    {
        $startRef = new \ReflectionMethod(ScanApiController::class, 'start');
        $docComment = (string)$startRef->getDocComment();
        $this->assertStringNotContainsString('@NoCSRFRequired', $docComment);
        $this->assertStringContainsString('@NoAdminRequired', $docComment);

        $request = $this->createMock(IRequest::class);
        $userSession = $this->createMock(IUserSession::class);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('qa-bot');
        $userSession->method('getUser')->willReturn($user);
        $logger = $this->createMock(LoggerInterface::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $scanStatusService = $this->createMock(ScanStatusService::class);
        $session = $this->createMock(ISession::class);
        $lockingProvider = $this->createMock(ILockingProvider::class);

        // Case 1: ScanStatusService already reports running=true -> 409 Conflict
        $scanStatusService->method('getStatus')->with('qa-bot')->willReturn([
            'running' => true,
            'scannedFiles' => 10,
            'totalFiles' => 100,
        ]);
        $fileInfoService->expects($this->never())->method('scanFiles');
        $session->expects($this->once())->method('close');

        $controllerRunning = new ScanApiController(
            Application::ID,
            $request,
            $userSession,
            $logger,
            $fileInfoService,
            $scanStatusService,
            $session,
            $lockingProvider
        );

        $conflictResp = $controllerRunning->start();
        $this->assertSame(Http::STATUS_CONFLICT, $conflictResp->getStatus());
        $this->assertSame('error', $conflictResp->getData()['status']);

        // Case 2: Exclusive lock held by another worker -> 409 Conflict
        $scanStatusIdle = $this->createMock(ScanStatusService::class);
        $scanStatusIdle->method('getStatus')->with('qa-bot')->willReturn(['running' => false]);
        $fileInfoService2 = $this->createMock(FileInfoService::class);
        $fileInfoService2->expects($this->never())->method('scanFiles');

        $expectedLockKey = 'df-scan/' . substr(hash('sha256', 'qa-bot'), 0, 48);
        $busyLock = $this->createMock(ILockingProvider::class);
        $busyLock->expects($this->once())
            ->method('acquireLock')
            ->with($expectedLockKey, ILockingProvider::LOCK_EXCLUSIVE)
            ->willThrowException(new LockedException($expectedLockKey));
        $busyLock->expects($this->never())->method('releaseLock');

        $controllerLocked = new ScanApiController(
            Application::ID,
            $request,
            $userSession,
            $logger,
            $fileInfoService2,
            $scanStatusIdle,
            null,
            $busyLock
        );

        $lockedResp = $controllerLocked->start();
        $this->assertSame(Http::STATUS_CONFLICT, $lockedResp->getStatus());

        // Case 3: Lock acquired and always released even when scanFiles throws
        $fileInfoService3 = $this->createMock(FileInfoService::class);
        $fileInfoService3->expects($this->once())
            ->method('scanFiles')
            ->with('qa-bot')
            ->willThrowException(new \RuntimeException('storage error'));

        $releasingLock = $this->createMock(ILockingProvider::class);
        $releasingLock->expects($this->once())
            ->method('acquireLock')
            ->with($expectedLockKey, ILockingProvider::LOCK_EXCLUSIVE);
        $releasingLock->expects($this->once())
            ->method('releaseLock')
            ->with($expectedLockKey, ILockingProvider::LOCK_EXCLUSIVE);

        $controllerError = new ScanApiController(
            Application::ID,
            $request,
            $userSession,
            $logger,
            $fileInfoService3,
            $scanStatusIdle,
            null,
            $releasingLock
        );

        $errResp = $controllerError->start();
        $this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $errResp->getStatus());
    }

    /**
     * @dataProvider unsafeRelativePathProvider
     */
    public function testScanStatusServiceCountUserFilesRejectsTraversalAndNullBytes(string $badRelativePath): void
    {
        $connection = $this->createMock(IDBConnection::class);
        $connection->expects($this->never())->method('getQueryBuilder');

        $service = new ScanStatusService(
            $connection,
            $this->createMock(IConfig::class),
            $this->createMock(LoggerInterface::class)
        );

        $this->assertSame(0, $service->countUserFiles('qa-bot', $badRelativePath));
    }

    public function unsafeRelativePathProvider(): array
    {
        return [
            'dotdot prefix' => ['../etc/passwd'],
            'nested dotdot' => ['Photos/../../secret'],
            'backslash dotdot' => ['Photos\\..\\secret'],
            'null byte' => ["Photos\0hidden"],
        ];
    }

    public function testCleanUpDBResetsExcludedCacheDeduplicatesOrphanChecksAndSurvivesThrowable(): void
    {
        $fileInfoService = $this->createMock(FileInfoService::class);
        $folderService = $this->createMock(FolderService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $config = $this->createMock(ConfigService::class);
        $timeFactory = $this->createMock(ITimeFactory::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $f1 = new FileInfo('/qa-bot/files/a.jpg', 'qa-bot');
        $f1->setId(1);
        $f1->setFileHash('shared-hash-1');

        $f2 = new FileInfo('/qa-bot/files/b.jpg', 'qa-bot');
        $f2->setId(2);
        $f2->setFileHash('shared-hash-1');

        $f3 = new FileInfo('/qa-bot/files/c.jpg', 'qa-bot');
        $f3->setId(3);
        $f3->setFileHash('other-hash-2');

        $fileInfoService->expects($this->once())
            ->method('findBatch')
            ->willReturn([$f1, $f2, $f3]);

        // f1 throws \TypeError (\Throwable, not \Exception), f2 and f3 are gone
        $folderService->method('getNodeByFileInfo')
            ->willReturnCallback(static function (FileInfo $fi) {
                if ($fi->getId() === 1) {
                    throw new \TypeError('broken storage node');
                }

                return null;
            });
        $folderService->method('isNodeGone')->willReturn(true);

        $excludedFolderService->expects($this->exactly(2))->method('resetCache');
        $fileInfoService->expects($this->exactly(2))->method('delete');

        // f2 and f3 share 'shared-hash-1' vs 'other-hash-2'; also test same hash deduplication:
        // let's make f1 gone, f2 gone (both 'shared-hash-1'), f3 throw \TypeError!
        $job = new CleanUpDB(
            $fileInfoService,
            $folderService,
            $logger,
            $config,
            $timeFactory,
            $excludedFolderService,
            $fileDuplicateService
        );

        $fileDuplicateService->expects($this->exactly(2))
            ->method('removeIfOrphaned')
            ->withConsecutive(['shared-hash-1'], ['other-hash-2']);
        $logger->expects($this->once())->method('error');

        $runMethod = new \ReflectionMethod(CleanUpDB::class, 'run');
        $runMethod->setAccessible(true);
        $runMethod->invoke($job, null);

        // Verify exact deduplication when two stale rows share the same hash
        $fileInfoServiceDedup = $this->createMock(FileInfoService::class);
        $folderServiceDedup = $this->createMock(FolderService::class);
        $excludedDedup = $this->createMock(ExcludedFolderService::class);
        $dupDedup = $this->createMock(FileDuplicateService::class);

        $fileInfoServiceDedup->method('findBatch')->willReturn([$f1, $f2]);
        $folderServiceDedup->method('getNodeByFileInfo')->willReturn(null);
        $folderServiceDedup->method('isNodeGone')->willReturn(true);
        $fileInfoServiceDedup->expects($this->exactly(2))->method('delete');
        $dupDedup->expects($this->once())->method('removeIfOrphaned')->with('shared-hash-1');

        $jobDedup = new CleanUpDB(
            $fileInfoServiceDedup,
            $folderServiceDedup,
            $logger,
            $config,
            $timeFactory,
            $excludedDedup,
            $dupDedup
        );
        $runMethod->invoke($jobDedup, null);
    }

    public function testFolderDuplicateServiceRejectsUnsafePathsAndCapsRecursionDepth(): void
    {
        $service = new FolderDuplicateService();

        $this->assertSame('', $service->normalizeUserFilesPath('/qa-bot/files/../etc/passwd'));
        $this->assertSame('', $service->normalizeUserFilesPath("/qa-bot/files/sub\0/file.txt"));
        $this->assertSame('/Photos/2026', $service->normalizeUserFilesPath('/qa-bot/files/Photos\\2026'));

        $userFolder = $this->createMock(Folder::class);
        $userFolder->expects($this->never())->method('get');

        $counts = $service->countLiveFolderFiles($userFolder, [
            '/../escape' => ['a.txt' => ['hash' => 'h1', 'size' => 10]],
            "/bad\0dir" => ['b.txt' => ['hash' => 'h2', 'size' => 10]],
            '/' => ['c.txt' => ['hash' => 'h3', 'size' => 10]],
        ]);
        $this->assertSame([], $counts);

        // Build a cyclic folder mock to prove countFilesUpToLimit stops at MAX_SCAN_DEPTH instead of infinite recursion
        $deepFolder = $this->createMock(Folder::class);
        $deepFolder->method('getDirectoryListing')->willReturn([$deepFolder]);

        $rootUserFolder = $this->createMock(Folder::class);
        $rootUserFolder->method('get')->with('/Cyclic')->willReturn($deepFolder);

        $deepCounts = $service->countLiveFolderFiles($rootUserFolder, [
            '/Cyclic' => ['item.txt' => ['hash' => 'h4', 'size' => 10]],
        ]);
        $this->assertSame(['/Cyclic' => 0], $deepCounts);
    }

    /**
     * @dataProvider invalidProjectIdProvider
     */
    public function testFindDuplicatesCommandRejectsInvalidProjectOption(string $badProjectId): void
    {
        $userManager = $this->createMock(IUserManager::class);
        $userManager->expects($this->never())->method('userExists');
        $encryptionManager = $this->createMock(IEncryptionManager::class);
        $encryptionManager->method('isEnabled')->willReturn(false);
        $projectService = $this->createMock(ProjectService::class);
        $projectService->expects($this->never())->method('find');
        $projectService->expects($this->never())->method('scan');

        $command = new FindDuplicates(
            $userManager,
            $encryptionManager,
            $this->createMock(IDBConnection::class),
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(ExcludedFolderService::class),
            $this->createMock(OriginFolderService::class),
            $projectService,
            $this->createMock(LoggerInterface::class)
        );

        $input = new ArrayInput([
            '--user' => ['qa-bot'],
            '--project' => $badProjectId,
        ]);
        $output = new BufferedOutput();

        $exitCode = $command->run($input, $output);
        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Invalid --project ID', $output->fetch());
    }

    public function invalidProjectIdProvider(): array
    {
        return [
            'non-numeric' => ['abc'],
            'zero' => ['0'],
            'negative' => ['-3'],
            'sql-like' => ['1 OR 1=1'],
        ];
    }

    public function testEqbMapperCountByUsesSqlCountAndRejectsUnsafeIdentifiers(): void
    {
        $db = $this->createMock(IDBConnection::class);
        $qb = $this->createMock(IQueryBuilder::class);
        $expr = $this->createMock(IExpressionBuilder::class);
        $func = $this->createMock(IFunctionBuilder::class);
        $countFunc = $this->createMock(IQueryFunction::class);
        $result = $this->createMock(IResult::class);

        $func->expects($this->once())->method('count')->with('id')->willReturn($countFunc);
        $expr->expects($this->once())->method('eq')->with('owner', 'qa-bot')->willReturn('eq_expr');
        $qb->method('func')->willReturn($func);
        $qb->method('expr')->willReturn($expr);
        $qb->method('createNamedParameter')->willReturnArgument(0);
        $qb->expects($this->once())->method('select')->with($countFunc)->willReturnSelf();
        $qb->expects($this->once())->method('from')->with('df_test')->willReturnSelf();
        $qb->expects($this->once())->method('where')->with('eq_expr')->willReturnSelf();
        $qb->expects($this->once())->method('executeQuery')->willReturn($result);

        $result->expects($this->once())->method('fetchOne')->willReturn('42');
        $result->expects($this->never())->method('fetchAll');
        $result->expects($this->once())->method('closeCursor');

        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new class($db) extends EQBMapper {
            public function __construct(IDBConnection $db)
            {
                parent::__construct($db, 'df_test', EEntity::class);
            }

            public function exposeCountBy(string $field, string $value): int
            {
                return $this->countBy($field, $value);
            }
        };

        $this->assertSame(42, $mapper->exposeCountBy('owner', 'qa-bot'));

        try {
            $mapper->exposeCountBy('owner; DROP TABLE df_test', 'qa-bot');
            $this->fail('Expected unsafe SQL column identifier to be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Invalid SQL column identifier', $e->getMessage());
        }

        try {
            $mapper->clear('df_test; --');
            $this->fail('Expected unsafe SQL table identifier to be rejected');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Invalid SQL table identifier', $e->getMessage());
        }
    }
}
