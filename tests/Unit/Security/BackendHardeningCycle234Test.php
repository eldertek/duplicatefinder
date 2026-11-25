<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Command\ListAllDuplicates;
use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Controller\FileApiController;
use OCA\DuplicateFinder\Controller\FilterController;
use OCA\DuplicateFinder\Controller\OriginFolderApiController;
use OCA\DuplicateFinder\Controller\PageController;
use OCA\DuplicateFinder\Controller\ProjectApiController;
use OCA\DuplicateFinder\Controller\ScanApiController;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCA\DuplicateFinder\Service\EmptyFolderCleanupService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoRepairer;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Service\SurplusRowsMerger;
use OCP\AppFramework\Http;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\QueryBuilder\IQueryFunction;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class BackendHardeningCycle234Test extends TestCase
{
    public function testMutatingControllerEndpointsEnforceCsrfWhileReadEndpointsRemainAccessible(): void
    {
        $mutatingMethods = [
            [DuplicateApiController::class, 'acknowledge'],
            [DuplicateApiController::class, 'unacknowledge'],
            [DuplicateApiController::class, 'clear'],
            [DuplicateApiController::class, 'find'],
            [FileApiController::class, 'delete'],
            [FilterController::class, 'create'],
            [FilterController::class, 'destroy'],
            [OriginFolderApiController::class, 'create'],
            [OriginFolderApiController::class, 'destroy'],
            [ProjectApiController::class, 'create'],
            [ProjectApiController::class, 'update'],
            [ProjectApiController::class, 'destroy'],
            [ProjectApiController::class, 'scan'],
        ];

        foreach ($mutatingMethods as [$class, $method]) {
            $ref = new \ReflectionMethod($class, $method);
            $doc = (string)$ref->getDocComment();
            $this->assertStringNotContainsString(
                '@NoCSRFRequired',
                $doc,
                sprintf('%s::%s must not bypass CSRF checks', $class, $method)
            );
        }

        $readMethods = [
            [DuplicateApiController::class, 'list'],
            [DuplicateApiController::class, 'listFolders'],
            [FilterController::class, 'index'],
            [OriginFolderApiController::class, 'index'],
            [ProjectApiController::class, 'index'],
            [ProjectApiController::class, 'show'],
            [ProjectApiController::class, 'duplicates'],
            [ScanApiController::class, 'status'],
            [PageController::class, 'index'],
        ];

        foreach ($readMethods as [$class, $method]) {
            $ref = new \ReflectionMethod($class, $method);
            $doc = (string)$ref->getDocComment();
            $this->assertStringContainsString(
                '@NoCSRFRequired',
                $doc,
                sprintf('Read endpoint %s::%s should keep @NoCSRFRequired', $class, $method)
            );
        }
    }

    public function testDuplicateApiControllerClearAndFindRequireAuthAndMaskClearErrors(): void
    {
        $anonSession = $this->createMock(IUserSession::class);
        $anonSession->method('getUser')->willReturn(null);

        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $fileDuplicateService->expects($this->never())->method('clear');
        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileInfoService->expects($this->never())->method('clear');
        $userManager = $this->createMock(IUserManager::class);
        $userManager->expects($this->never())->method('callForAllUsers');

        $anonController = new DuplicateApiController(
            Application::ID,
            $this->createMock(IRequest::class),
            $anonSession,
            $fileDuplicateService,
            $fileInfoService,
            $this->createMock(FileDuplicateMapper::class),
            $userManager,
            $this->createMock(LoggerInterface::class),
            $this->createMock(OriginFolderService::class)
        );

        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->clear()->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->find()->getStatus());

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('qa-bot');
        $authSession = $this->createMock(IUserSession::class);
        $authSession->method('getUser')->willReturn($user);

        $failingDuplicateService = $this->createMock(FileDuplicateService::class);
        $failingDuplicateService->method('clear')->willThrowException(new \RuntimeException('SQLSTATE[HY000]: internal details'));

        $authController = new DuplicateApiController(
            Application::ID,
            $this->createMock(IRequest::class),
            $authSession,
            $failingDuplicateService,
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateMapper::class),
            $this->createMock(IUserManager::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(OriginFolderService::class)
        );

        $clearErr = $authController->clear();
        $this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $clearErr->getStatus());
        $this->assertSame(['status' => 'error', 'message' => 'Failed to clear duplicates'], $clearErr->getData());
    }

    public function testEmptyFolderCleanupRejectsOutOfTreeResolvedPathAndNonStringPaths(): void
    {
        $outsideFolder = $this->createMock(Folder::class);
        $outsideFolder->method('getPath')->willReturn('/other-user/files/Secret');
        $outsideFolder->method('isMounted')->willReturn(false);
        $outsideFolder->method('isDeletable')->willReturn(true);
        $outsideFolder->expects($this->never())->method('delete');

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('get')->with('/AliasToOutside')->willReturn($outsideFolder);
        $userFolder->method('getRelativePath')->with('/other-user/files/Secret')->willReturn(null);

        $folderService = $this->createMock(FolderService::class);
        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $originFolderService = $this->createMock(OriginFolderService::class);
        $originFolderService->method('findAll')->willReturn([]);
        $originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);

        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $excludedFolderService->method('isPathExcluded')->willReturn(false);

        $service = new EmptyFolderCleanupService(
            $folderService,
            $originFolderService,
            $excludedFolderService,
            $this->createMock(LoggerInterface::class)
        );

        $result = $service->deleteEmptyFolders('qa-bot', ['/AliasToOutside', 123, ['nested']]);
        $this->assertSame([], $result['deleted']);
        $this->assertCount(3, $result['errors']);
        $this->assertSame('INVALID_PATH', $result['errors'][0]['error']);
        $this->assertSame('INVALID_PATH', $result['errors'][1]['error']);
        $this->assertSame('INVALID_PATH', $result['errors'][2]['error']);
    }

    public function testEmptyFolderCleanupVerifiesSubfolderEligibilityAndSkipsUnsafeChildNames(): void
    {
        $originFolderService = $this->createMock(OriginFolderService::class);
        $originFolderService->method('findAll')->willReturn([]);
        $originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);

        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $excludedFolderService->method('isPathExcluded')->willReturn(false);

        $unsafeChild = $this->createMock(Folder::class);
        $unsafeChild->method('getName')->willReturn('..');
        $unsafeChild->method('isMounted')->willReturn(false);
        $unsafeChild->method('isDeletable')->willReturn(true);

        $parentWithUnsafe = $this->createMock(Folder::class);
        $parentWithUnsafe->method('getName')->willReturn('UnsafeParent');
        $parentWithUnsafe->method('getPath')->willReturn('/qa-bot/files/UnsafeParent');
        $parentWithUnsafe->method('isMounted')->willReturn(false);
        $parentWithUnsafe->method('isDeletable')->willReturn(true);
        $parentWithUnsafe->method('getDirectoryListing')->willReturn([$unsafeChild]);

        // Test subfolder protection during recursive parent deletion:
        // Child passes scanSubtree (getPath is not checked during scanSubtree), then resolves outside user root on delete lookup.
        $subNode = $this->createMock(Folder::class);
        $subNode->method('getName')->willReturn('Sub');
        $subNode->method('getPath')->willReturn('/external/mount/Sub');
        $subNode->method('getMTime')->willReturn(1700000000);
        $subNode->method('isMounted')->willReturn(false);
        $subNode->method('isDeletable')->willReturn(true);
        $subNode->method('getDirectoryListing')->willReturn([]);
        $subNode->expects($this->never())->method('delete');

        $chainNode = $this->createMock(Folder::class);
        $chainNode->method('getName')->willReturn('Chain');
        $chainNode->method('getPath')->willReturn('/qa-bot/files/Chain');
        $chainNode->method('isMounted')->willReturn(false);
        $chainNode->method('isDeletable')->willReturn(true);
        $chainNode->method('getDirectoryListing')->willReturn([$subNode]);
        $chainNode->expects($this->never())->method('delete');

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getDirectoryListing')->willReturn([$parentWithUnsafe]);
        $userFolder->method('get')->willReturnMap([
            ['/Chain', $chainNode],
            ['/Chain/Sub', $subNode],
        ]);
        $userFolder->method('getRelativePath')->willReturnCallback(static function (string $path): ?string {
            return str_starts_with($path, '/qa-bot/files/')
                ? substr($path, strlen('/qa-bot/files'))
                : null;
        });

        $folderService = $this->createMock(FolderService::class);
        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $service = new EmptyFolderCleanupService(
            $folderService,
            $originFolderService,
            $excludedFolderService,
            $this->createMock(LoggerInterface::class)
        );

        // Scan must ignore '..' child and not mark UnsafeParent as empty
        $this->assertSame([], $service->findEmptyFolders('qa-bot'));

        // Parent deletion must refuse because Sub resolved outside user root and remained non-empty
        $deleteResult = $service->deleteEmptyFolders('qa-bot', ['/Chain']);
        $this->assertSame([], $deleteResult['deleted']);
        $this->assertCount(1, $deleteResult['errors']);
        $this->assertSame('FOLDER_NOT_EMPTY', $deleteResult['errors'][0]['error']);
    }

    public function testFileDuplicateMapperMergeSurplusRowsClampsNegativeOffsetAndZeroBatchSize(): void
    {
        $maxResultsCaptured = [];
        $paramValues = [];

        $result = $this->createMock(IResult::class);
        $result->method('fetchAll')->with(\PDO::FETCH_COLUMN)->willReturn([]);

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturn('1=1');
        $expr->method('lt')->willReturn('1=1');
        $expr->method('gt')->willReturn('1=1');

        $qb = $this->createMock(IQueryBuilder::class);
        $qb->method('expr')->willReturn($expr);
        $qb->method('select')->willReturnSelf();
        $qb->method('from')->willReturnSelf();
        $qb->method('where')->willReturnSelf();
        $qb->method('andWhere')->willReturnSelf();
        $qb->method('orderBy')->willReturnSelf();
        $qb->method('getSQL')->willReturn('SELECT k.id FROM duplicatefinder_dups k');
        $qb->method('createFunction')->willReturn($this->createMock(IQueryFunction::class));
        $qb->method('createNamedParameter')->willReturnCallback(static function ($value) use (&$paramValues): string {
            $paramValues[] = $value;

            return ':p';
        });
        $qb->method('setMaxResults')->willReturnCallback(static function (?int $maxResults) use (&$maxResultsCaptured, $qb): IQueryBuilder {
            $maxResultsCaptured[] = $maxResults;

            return $qb;
        });
        $qb->method('executeQuery')->willReturn($result);

        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new FileDuplicateMapper($db, $this->createMock(LoggerInterface::class));
        $step = $mapper->mergeSurplusRows(10.0, -50, 0);

        $this->assertSame(['removed' => 0, 'lastId' => 0, 'finished' => true], $step);
        $this->assertSame([1], $maxResultsCaptured);
        $this->assertContains(0, $paramValues);
        $this->assertNotContains(-50, $paramValues);
    }

    public function testRepairServicesAcquireExclusiveLockAndFailSafeWhenLocked(): void
    {
        $configValues = [];
        $config = $this->createMock(IConfig::class);
        $config->method('getAppValue')->willReturnCallback(static function ($app, $key, $default = '') use (&$configValues) {
            return $configValues[$key] ?? $default;
        });
        $config->method('setAppValue')->willReturnCallback(static function ($app, $key, $val) use (&$configValues): void {
            $configValues[$key] = $val;
        });
        $config->method('deleteAppValue')->willReturnCallback(static function ($app, $key) use (&$configValues): void {
            unset($configValues[$key]);
        });

        // Case 1: Lock already held -> both services return done=false without touching mappers or config
        $busyLock = $this->createMock(ILockingProvider::class);
        $busyLock->method('acquireLock')->willThrowException(new LockedException('locked'));
        $busyLock->expects($this->never())->method('releaseLock');

        $fileInfoMapper = $this->createMock(FileInfoMapper::class);
        $fileInfoMapper->expects($this->never())->method('getMaxId');
        $repairer = new FileInfoRepairer($fileInfoMapper, $config, $busyLock);
        $this->assertSame(['pathHashes' => 0, 'removed' => 0, 'done' => false], $repairer->run());
        $this->assertSame([], $configValues);

        $dupMapper = $this->createMock(FileDuplicateMapper::class);
        $dupMapper->expects($this->never())->method('mergeSurplusRows');
        $merger = new SurplusRowsMerger($dupMapper, $config, $busyLock);
        $this->assertSame(['removed' => 0, 'done' => false], $merger->run());
        $this->assertSame([], $configValues);

        // Case 2: Lock acquired -> released in finally even when mapper throws
        $events = [];
        $activeLock = $this->createMock(ILockingProvider::class);
        $activeLock->expects($this->once())
            ->method('acquireLock')
            ->with('df-repair/file-infos', ILockingProvider::LOCK_EXCLUSIVE)
            ->willReturnCallback(static function () use (&$events): void {
                $events[] = 'acquire';
            });
        $activeLock->expects($this->once())
            ->method('releaseLock')
            ->with('df-repair/file-infos', ILockingProvider::LOCK_EXCLUSIVE)
            ->willReturnCallback(static function () use (&$events): void {
                $events[] = 'release';
            });

        $throwingMapper = $this->createMock(FileInfoMapper::class);
        $throwingMapper->method('getMaxId')->willReturn(100);
        $throwingMapper->method('repairPathHashes')->willThrowException(new \RuntimeException('db error'));

        $throwingRepairer = new FileInfoRepairer($throwingMapper, $config, $activeLock);
        try {
            $throwingRepairer->run();
            $this->fail('Expected exception to propagate');
        } catch (\RuntimeException $e) {
            $this->assertSame('db error', $e->getMessage());
        }
        $this->assertSame(['acquire', 'release'], $events);
    }

    public function testProjectMapperAddFoldersDeduplicatesAndSkipsInvalidEntries(): void
    {
        $insertedFolders = [];

        $qb = $this->createMock(IQueryBuilder::class);
        $qb->method('insert')->with('df_folders')->willReturnSelf();
        $qb->method('createNamedParameter')->willReturnArgument(0);
        $qb->method('values')->willReturnCallback(static function (array $values) use (&$insertedFolders, $qb): IQueryBuilder {
            $insertedFolders[] = $values['folder_path'];

            return $qb;
        });
        $qb->expects($this->exactly(2))->method('executeStatement')->willReturn(1);

        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new ProjectMapper($db, $this->createMock(LoggerInterface::class));
        $mapper->addFolders(7, ['/Photos', ' /Photos ', '', '   ', null, 42, '/Archive']);

        $this->assertSame(['/Photos', '/Archive'], $insertedFolders);
    }

    public function testListAllDuplicatesSurvivesShareLookupFailureForVanishedUser(): void
    {
        $fileInfoMapper = $this->createMock(FileInfoMapper::class);
        $fileInfoMapper->method('findOwners')->willReturn(['qa-bot']);
        $fileInfoMapper->method('findDuplicateGroupsAcrossUsers')->willReturnCallback(static function (): \Generator {
            yield ['hash' => 'hash-vanished-1', 'size' => 1024, 'copies' => 2, 'wasted' => 1024];
        });
        $fileInfoMapper->method('findCopiesOfHashes')->willReturn([
            'hash-vanished-1' => [
                ['owner' => 'vanished-user', 'path' => '/vanished-user/files/a.bin'],
                ['owner' => 'vanished-user', 'path' => '/vanished-user/files/b.bin'],
            ],
        ]);

        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('callForAllUsers')->willReturn(null);

        $shareService = $this->createMock(ShareService::class);
        $shareService->method('getShares')
            ->with('vanished-user')
            ->willThrowException(new NotFoundException('User folder missing'));

        $command = new ListAllDuplicates($fileInfoMapper, $userManager, $shareService);
        $output = new BufferedOutput();
        $exitCode = $command->run(new ArrayInput(['--output' => 'json']), $output);

        $this->assertSame(0, $exitCode);
        $decoded = json_decode($output->fetch(), true);
        $this->assertIsArray($decoded);
        $this->assertSame(1, $decoded['totals']['groups']);
        $this->assertSame('hash-vanished-1', $decoded['groups'][0]['hash']);
    }
}
