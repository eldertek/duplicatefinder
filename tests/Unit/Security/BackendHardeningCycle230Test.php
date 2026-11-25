<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\Controller\SettingsApiController;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Listener\FilesystemListener;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IParameter;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeRenamedEvent;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IConfig;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\BufferedOutput;

class BackendHardeningCycle230Test extends TestCase
{
    public function testScanFilesSkipsLockedFileWithoutReleasingLocksOrTouchingLockTable(): void
    {
        $mapper = $this->createMock(FileInfoMapper::class);
        $eventDispatcher = $this->createMock(IEventDispatcher::class);
        $logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $filterService = $this->createMock(FilterService::class);
        $folderService = $this->createMock(FolderService::class);
        $scannerUtil = $this->createMock(ScannerUtil::class);
        $lockingProvider = $this->createMock(ILockingProvider::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $connection = $this->createMock(IDBConnection::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $excludedFolderService->method('findAll')->willReturn([]);
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/alice/files');
        $folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);

        $scannerUtil->expects($this->once())
            ->method('scan')
            ->with('alice', '/alice/files')
            ->willThrowException(new LockedException('/alice/files/upload.bin'));

        // Critical security invariant: scan never releases other processes' locks or wipes oc_file_locks
        $lockingProvider->expects($this->never())->method('releaseAll');
        $lockingProvider->expects($this->never())->method('isLocked');
        $connection->expects($this->never())->method('prepare');
        $logger->expects($this->atLeastOnce())->method('warning');

        $service = new FileInfoService(
            $mapper,
            $eventDispatcher,
            $logger,
            $shareService,
            $filterService,
            $folderService,
            $scannerUtil,
            $lockingProvider,
            $rootFolder,
            $connection,
            $excludedFolderService
        );

        $output = new BufferedOutput();
        $service->scanFiles('alice', null, null, $output);

        $this->assertStringContainsString('Skipped locked file: /alice/files/upload.bin', $output->fetch());
    }

    /**
     * @dataProvider invalidScanPathsProvider
     */
    public function testScanFilesRejectsTraversalAndNullBytePaths(string $badPath): void
    {
        $folderService = $this->createMock(FolderService::class);
        $scannerUtil = $this->createMock(ScannerUtil::class);
        $logger = $this->createMock(LoggerInterface::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $excludedFolderService->method('findAll')->willReturn([]);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/alice/files');
        $userFolder->expects($this->never())->method('nodeExists');
        $folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);

        $scannerUtil->expects($this->never())->method('scan');
        $logger->expects($this->atLeastOnce())->method('warning');

        $service = new FileInfoService(
            $this->createMock(FileInfoMapper::class),
            $this->createMock(IEventDispatcher::class),
            $logger,
            $this->createMock(ShareService::class),
            $this->createMock(FilterService::class),
            $folderService,
            $scannerUtil,
            $this->createMock(ILockingProvider::class),
            $this->createMock(IRootFolder::class),
            $this->createMock(IDBConnection::class),
            $excludedFolderService
        );

        $output = new BufferedOutput();
        $service->scanFiles('alice', $badPath, null, $output);

        $this->assertStringContainsString('Invalid scan path.', $output->fetch());
    }

    public static function invalidScanPathsProvider(): array
    {
        return [
            'parent traversal' => ['../../etc'],
            'nested traversal' => ['Photos/../../bob/files'],
            'windows traversal' => ['Photos\\..\\..\\secret'],
            'null byte' => ["Photos/shot\0.jpg"],
        ];
    }

    /**
     * @dataProvider invalidIntervalsProvider
     */
    public function testSettingsApiControllerRejectsInvalidJobIntervals(string $key, mixed $badValue): void
    {
        $configService = $this->createMock(ConfigService::class);
        $configService->expects($this->never())->method('setFindJobInterval');
        $configService->expects($this->never())->method('setCleanupJobInterval');

        $controller = new SettingsApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(IUserSession::class),
            $configService,
            $this->createMock(LoggerInterface::class)
        );

        $response = $controller->save($key, $badValue);
        $this->assertSame(Http::STATUS_BAD_REQUEST, $response->getStatus());
        $data = $response->getData();
        $this->assertSame('error', $data['status']);
    }

    public static function invalidIntervalsProvider(): array
    {
        return [
            'find zero' => ['backgroundjob_interval_find', 0],
            'find negative' => ['backgroundjob_interval_find', -300],
            'find below min' => ['backgroundjob_interval_find', '59'],
            'find non numeric' => ['backgroundjob_interval_find', 'abc'],
            'find float' => ['backgroundjob_interval_find', '120.5'],
            'find bool true' => ['backgroundjob_interval_find', true],
            'cleanup zero' => ['backgroundjob_interval_cleanup', '0'],
            'cleanup negative' => ['backgroundjob_interval_cleanup', '-1'],
            'cleanup bool false' => ['backgroundjob_interval_cleanup', false],
        ];
    }

    public function testSettingsApiControllerValidatesBooleansAndMasksInternalErrors(): void
    {
        $configService = $this->createMock(ConfigService::class);
        $configService->expects($this->never())->method('setMountedFilesIgnored');

        $logger = $this->createMock(LoggerInterface::class);
        $controller = new SettingsApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(IUserSession::class),
            $configService,
            $logger
        );

        $badBool = $controller->save('ignore_mounted_files', 'maybe');
        $this->assertSame(Http::STATUS_BAD_REQUEST, $badBool->getStatus());
        $this->assertSame('error', $badBool->getData()['status']);

        $unknown = $controller->save('unknown_setting', '1');
        $this->assertSame(Http::STATUS_BAD_REQUEST, $unknown->getStatus());
        $this->assertSame('Unknown config key', $unknown->getData()['message']);

        $configService2 = $this->createMock(ConfigService::class);
        $configService2->expects($this->once())
            ->method('setFindJobInterval')
            ->with(3600)
            ->willThrowException(new \RuntimeException('SQLSTATE[HY000]: internal details'));
        $logger->expects($this->once())->method('error');

        $controller2 = new SettingsApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(IUserSession::class),
            $configService2,
            $logger
        );

        $serverError = $controller2->save('backgroundjob_interval_find', '3600');
        $this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $serverError->getStatus());
        $this->assertSame('Failed to save configuration', $serverError->getData()['message']);
    }

    public function testConfigServiceEnforcesMinimumJobIntervalBounds(): void
    {
        $config = $this->createMock(IConfig::class);
        $config->method('getAppValue')->willReturnMap([
            ['duplicatefinder', 'backgroundjob_interval_find', '432000', '0'],
            ['duplicatefinder', 'backgroundjob_interval_cleanup', '172800', '-10'],
        ]);

        $service = new ConfigService($config, $this->createMock(LoggerInterface::class));

        $this->assertSame(432000, $service->getFindJobInterval());
        $this->assertSame(172800, $service->getCleanupJobInterval());

        $this->expectException(\InvalidArgumentException::class);
        $service->setFindJobInterval(30);
    }

    public function testConfigServiceRejectsCleanupIntervalBelowMinimum(): void
    {
        $service = new ConfigService(
            $this->createMock(IConfig::class),
            $this->createMock(LoggerInterface::class)
        );

        $this->expectException(\InvalidArgumentException::class);
        $service->setCleanupJobInterval(0);
    }

    public function testFileDuplicateMapperRejectsUnsafeOrderByColumnsAndClampsPagination(): void
    {
        $captured = ['limit' => null, 'offset' => null, 'orderBy' => []];
        $qb = $this->createQueryBuilderSpy($captured);
        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new FileDuplicateMapper($db, $this->createMock(LoggerInterface::class));
        $mapper->findAll(null, -5, -20, [['hash', 'asc'], ['type', 'invalid']], 'all');

        $this->assertSame(1, $captured['limit']);
        $this->assertSame(0, $captured['offset']);
        $this->assertSame([['hash', 'ASC'], ['type', 'DESC']], $captured['orderBy']);

        $this->expectException(\InvalidArgumentException::class);
        $mapper->findAll(null, 10, 0, [['hash; DROP TABLE oc_users --', 'ASC']], 'all');
    }

    public function testFileInfoMapperRejectsUnsupportedHashColumns(): void
    {
        $db = $this->createMock(IDBConnection::class);
        $db->expects($this->never())->method('getQueryBuilder');

        $mapper = new FileInfoMapper($db, $this->createMock(LoggerInterface::class));

        $this->expectException(\InvalidArgumentException::class);
        $mapper->findByHash('abc123', 'owner = 1 OR 1=1');
    }

    public function testFileInfoMapperCountByHashRejectsUnsupportedColumnsAndAllowsPathHash(): void
    {
        $captured = ['limit' => null, 'offset' => null, 'orderBy' => [], 'eqCols' => []];
        $qb = $this->createQueryBuilderSpy($captured);
        $db = $this->createMock(IDBConnection::class);
        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new FileInfoMapper($db, $this->createMock(LoggerInterface::class));
        $this->assertSame(0, $mapper->countByHash('deadbeef', 'path_hash'));
        $this->assertContains('path_hash', $captured['eqCols']);

        $this->expectException(\InvalidArgumentException::class);
        $mapper->countByHash('deadbeef', 'invalid_col');
    }

    public function testFilesystemListenerDoesNotCrashOnUnindexedRenameWithNullOwner(): void
    {
        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $config = $this->createMock(ConfigService::class);
        $config->method('areFilesytemEventsDisabled')->willReturn(false);

        $source = $this->createMock(File::class);
        $source->method('getPath')->willReturn('/__groupfolders/1/old.pdf');
        $source->method('getOwner')->willReturn(null);

        $target = $this->createMock(File::class);
        $target->method('getPath')->willReturn('/__groupfolders/1/new.pdf');
        $target->method('getOwner')->willReturn(null);

        $fileInfoService->expects($this->once())
            ->method('find')
            ->with('/__groupfolders/1/old.pdf', null)
            ->willThrowException(new DoesNotExistException('Not indexed'));
        $fileInfoService->expects($this->never())->method('update');

        $listener = new FilesystemListener($fileInfoService, $fileDuplicateService, $logger, $config);
        $listener->handle(new NodeRenamedEvent($source, $target));
        $this->addToAssertionCount(1);
    }

    public function testFilesystemListenerDoesNotCrashOnNullOwnerCreateOrDeleteErrors(): void
    {
        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $config = $this->createMock(ConfigService::class);
        $config->method('areFilesytemEventsDisabled')->willReturn(false);

        $created = $this->createMock(File::class);
        $created->method('getPath')->willReturn('/__groupfolders/1/vanished.pdf');
        $created->method('getOwner')->willReturn(null);
        $fileInfoService->expects($this->once())
            ->method('save')
            ->with('/__groupfolders/1/vanished.pdf', null)
            ->willThrowException(new NotFoundException('Gone'));

        $deleted = $this->createMock(File::class);
        $deleted->method('getPath')->willReturn('/__groupfolders/1/broken.pdf');
        $deleted->method('getOwner')->willReturn(null);
        $existing = new FileInfo('/__groupfolders/1/broken.pdf');
        $fileInfoService->expects($this->once())
            ->method('find')
            ->with('/__groupfolders/1/broken.pdf', null)
            ->willReturn($existing);
        $fileInfoService->expects($this->once())
            ->method('delete')
            ->with($existing)
            ->willThrowException(new \RuntimeException('DB lock'));

        $logger->expects($this->exactly(2))->method('warning');

        $listener = new FilesystemListener($fileInfoService, $fileDuplicateService, $logger, $config);
        $listener->handle(new NodeCreatedEvent($created));
        $listener->handle(new NodeDeletedEvent($deleted));
    }

    /**
     * @param array<string, mixed> $captured
     */
    private function createQueryBuilderSpy(array &$captured): IQueryBuilder
    {
        $qb = $this->createMock(IQueryBuilder::class);
        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(function ($col, $param) use (&$captured): string {
            $captured['eqCols'][] = (string)$col;

            return (string)$col . ' = ' . (string)$param;
        });

        $func = $this->createMock(\OCP\DB\QueryBuilder\IFunctionBuilder::class);
        $func->method('count')->willReturn($this->createMock(\OCP\DB\QueryBuilder\IQueryFunction::class));
        $func->method('sum')->willReturn($this->createMock(\OCP\DB\QueryBuilder\IQueryFunction::class));

        $qb->method('expr')->willReturn($expr);
        $qb->method('func')->willReturn($func);
        $qb->method('select')->willReturn($qb);
        $qb->method('from')->willReturn($qb);
        $qb->method('where')->willReturn($qb);
        $qb->method('andWhere')->willReturn($qb);
        $qb->method('createNamedParameter')->willReturn($this->createMock(IParameter::class));
        $qb->method('setMaxResults')->willReturnCallback(function ($limit) use ($qb, &$captured): IQueryBuilder {
            $captured['limit'] = $limit;

            return $qb;
        });
        $qb->method('setFirstResult')->willReturnCallback(function ($offset) use ($qb, &$captured): IQueryBuilder {
            $captured['offset'] = $offset;

            return $qb;
        });
        $qb->method('addOrderBy')->willReturnCallback(function ($sort, $dir = null) use ($qb, &$captured): IQueryBuilder {
            $captured['orderBy'][] = [(string)$sort, $dir];

            return $qb;
        });

        $result = $this->createMock(IResult::class);
        $result->method('fetch')->willReturn(false);
        $result->method('fetchOne')->willReturn(0);
        $qb->method('executeQuery')->willReturn($result);

        return $qb;
    }
}
