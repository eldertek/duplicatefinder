<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Controller\ExcludedFolderController;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\ICompositeExpression;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IParameter;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Issue #208: Excluding a folder (and running a scan) must mark previously indexed
 * entries in that folder as ignored, clear their file hashes, and drop orphaned
 * acknowledged or unacknowledged duplicate groups.
 */
class ExcludedFolderPruningTest extends TestCase
{
    private function createFileInfoService(
        FileInfoMapper $mapper,
        IEventDispatcher $eventDispatcher,
        ExcludedFolderService $excludedFolderService,
        ?FolderService $folderService = null,
        ?ScannerUtil $scannerUtil = null
    ): FileInfoService {
        $reflection = new \ReflectionClass(FileInfoService::class);
        /** @var FileInfoService $service */
        $service = $reflection->newInstanceWithoutConstructor();
        foreach ([
            'mapper' => $mapper,
            'eventDispatcher' => $eventDispatcher,
            'logger' => $this->createMock(LoggerInterface::class),
            'shareService' => $this->createMock(ShareService::class),
            'filterService' => $this->createMock(FilterService::class),
            'folderService' => $folderService ?? $this->createMock(FolderService::class),
            'scannerUtil' => $scannerUtil ?? $this->createMock(ScannerUtil::class),
            'lockingProvider' => $this->createMock(ILockingProvider::class),
            'connection' => $this->createMock(IDBConnection::class),
            'excludedFolderService' => $excludedFolderService,
        ] as $name => $value) {
            $property = $reflection->getProperty($name);
            $property->setAccessible(true);
            $property->setValue($service, $value);
        }

        return $service;
    }

    public function testCalculateHashesClearsHashAndDispatchesEventWhenFileBecomesIgnored(): void
    {
        $mapper = $this->createMock(FileInfoMapper::class);
        $eventDispatcher = $this->createMock(IEventDispatcher::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $service = $this->createFileInfoService($mapper, $eventDispatcher, $excludedFolderService);

        $fileInfo = new FileInfo('/qa-test/files/Excluded/report.pdf', 'qa-test');
        $fileInfo->setId(42);
        $fileInfo->setFileHash('hash-acknowledged-group');
        $fileInfo->setIgnored(true);

        $mapper->expects($this->once())
            ->method('update')
            ->with($this->callback(function (FileInfo $updated): bool {
                return $updated->getFileHash() === null && $updated->isIgnored() === true;
            }))
            ->willReturnArgument(0);

        $dispatchedEvents = [];
        $eventDispatcher->expects($this->once())
            ->method('dispatchTyped')
            ->willReturnCallback(function ($event) use (&$dispatchedEvents): void {
                $dispatchedEvents[] = $event;
            });

        $result = $service->calculateHashes($fileInfo, 'qa-test', true);

        $this->assertNull($result->getFileHash());
        $this->assertCount(1, $dispatchedEvents);
        $this->assertInstanceOf(CalculatedHashEvent::class, $dispatchedEvents[0]);
        $this->assertSame('hash-acknowledged-group', $dispatchedEvents[0]->getOldHash());
        $this->assertTrue($dispatchedEvents[0]->isChanged());
    }

    public function testScanFilesPrunesExcludedFoldersForUserBeforeWalkingTree(): void
    {
        $mapper = $this->createMock(FileInfoMapper::class);
        $eventDispatcher = $this->createMock(IEventDispatcher::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $folderService = $this->createMock(FolderService::class);
        $scannerUtil = $this->createMock(ScannerUtil::class);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-test/files');
        $folderService->method('getUserFolder')->with('qa-test')->willReturn($userFolder);

        $excluded = new ExcludedFolder();
        $excluded->setUserId('qa-test');
        $excluded->setFolderPath('/PC/Downloads');

        $excludedFolderService->expects($this->once())->method('resetCache');
        $excludedFolderService->expects($this->once())->method('setUserId')->with('qa-test');
        $excludedFolderService->expects($this->once())->method('findAll')->willReturn([$excluded]);

        $mapper->expects($this->once())
            ->method('ignoreFilesInFolder')
            ->with('qa-test', '/PC/Downloads')
            ->willReturn(['hash-1', 'hash-2']);

        $dispatchedOldHashes = [];
        $eventDispatcher->expects($this->exactly(2))
            ->method('dispatchTyped')
            ->willReturnCallback(function (CalculatedHashEvent $event) use (&$dispatchedOldHashes): void {
                $dispatchedOldHashes[] = $event->getOldHash();
            });

        $scannerUtil->expects($this->once())->method('scan')->with('qa-test', '/qa-test/files');

        $service = $this->createFileInfoService($mapper, $eventDispatcher, $excludedFolderService, $folderService, $scannerUtil);
        $service->scanFiles('qa-test');

        $this->assertSame(['hash-1', 'hash-2'], $dispatchedOldHashes);
    }

    public function testExcludedFolderControllerPrunesIndexedFilesAndRemovesOrphanedDuplicatesOnCreate(): void
    {
        $request = $this->createMock(IRequest::class);
        $excludedService = $this->createMock(ExcludedFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $created = new ExcludedFolder();
        $created->setId(9);
        $created->setUserId('qa-test');
        $created->setFolderPath('/PC/Downloads');

        $excludedService->expects($this->once())
            ->method('create')
            ->with('/PC/Downloads')
            ->willReturn($created);

        $fileInfoService->expects($this->once())
            ->method('ignoreFilesInFolder')
            ->with('qa-test', '/PC/Downloads')
            ->willReturn(['ack-hash-1']);

        $fileDuplicateService->expects($this->once())
            ->method('removeIfOrphaned')
            ->with('ack-hash-1');

        $controller = new ExcludedFolderController(
            'duplicatefinder',
            $request,
            $excludedService,
            $logger,
            $fileInfoService,
            $fileDuplicateService
        );

        $response = $controller->create('/PC/Downloads');
        $this->assertSame($created, $response->getData());
    }

    public function testMapperIgnoreFilesInFolderEnforcesFolderBoundaryAndReturnsDistinctHashes(): void
    {
        $db = $this->createMock(IDBConnection::class);
        $db->method('escapeLikeParameter')->willReturnCallback(static function (string $value): string {
            return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $value);
        });

        $selectRows = [
            ['id' => 10, 'path' => '/qa-test/files/PC/Down/item-a.bin', 'file_hash' => 'hash-a'],
            ['id' => 11, 'path' => '/qa-test/files/PC/Down/sub/item-b.bin', 'file_hash' => 'hash-a'],
            ['id' => 12, 'path' => '/qa-test/files/PC/Downloads/keep-me.bin', 'file_hash' => 'hash-keep'],
            ['id' => 13, 'path' => '/qa-test/files/PC/Down', 'file_hash' => 'hash-exact'],
        ];

        $updatedIdSets = [];
        $selectDone = false;

        $db->method('getQueryBuilder')->willReturnCallback(function () use (&$selectRows, &$selectDone, &$updatedIdSets): IQueryBuilder {
            $qb = $this->createMock(IQueryBuilder::class);
            $expr = $this->createMock(IExpressionBuilder::class);
            $composite = $this->createMock(ICompositeExpression::class);

            $expr->method('gt')->willReturn('gt');
            $expr->method('eq')->willReturn('eq');
            $expr->method('isNotNull')->willReturn('notnull');
            $expr->method('like')->willReturn('like');
            $expr->method('orX')->willReturn($composite);
            $expr->method('in')->willReturnCallback(static function (string $col, $param) use (&$updatedIdSets): string {
                $updatedIdSets[] = $param;

                return 'in';
            });

            $qb->method('expr')->willReturn($expr);
            $qb->method('createNamedParameter')->willReturnCallback(static function ($val) {
                return $val;
            });
            $qb->method('select')->willReturnSelf();
            $qb->method('from')->willReturnSelf();
            $qb->method('where')->willReturnSelf();
            $qb->method('andWhere')->willReturnSelf();
            $qb->method('orderBy')->willReturnSelf();
            $qb->method('setMaxResults')->willReturnSelf();
            $qb->method('update')->willReturnSelf();
            $qb->method('set')->willReturnSelf();
            $qb->method('executeStatement')->willReturn(3);
            $qb->method('executeQuery')->willReturnCallback(function () use (&$selectRows, &$selectDone): IResult {
                $res = $this->createMock(IResult::class);
                if (!$selectDone) {
                    $selectDone = true;
                    $res->method('fetchAll')->willReturn($selectRows);
                } else {
                    $res->method('fetchAll')->willReturn([]);
                }

                return $res;
            });

            return $qb;
        });

        $mapper = new FileInfoMapper($db, $this->createMock(LoggerInterface::class));
        $hashes = $mapper->ignoreFilesInFolder('qa-test', '/PC/Down');

        $this->assertSame(['hash-a', 'hash-exact'], $hashes);
        $this->assertSame([[10, 11, 13]], $updatedIdSets);
    }
}
