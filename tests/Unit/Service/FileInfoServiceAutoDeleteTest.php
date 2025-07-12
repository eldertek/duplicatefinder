<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test for Issue #153: Files should NOT be auto-deleted when inaccessible
 * @group DB
 */
class FileInfoServiceAutoDeleteTest extends TestCase
{
    /** @var FileInfoService */
    private $service;

    /** @var FileInfoMapper|MockObject */
    private $mapper;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var ShareService|MockObject */
    private $shareService;

    /** @var LoggerInterface|MockObject */
    private $logger;

    /** @var IEventDispatcher|MockObject */
    private $eventDispatcher;

    /** @var FilterService|MockObject */
    private $filterService;

    /** @var ScannerUtil|MockObject */
    private $scannerUtil;

    /** @var ExcludedFolderService|MockObject */
    private $excludedFolderService;

    /** @var ILockingProvider|MockObject */
    private $lockingProvider;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    /** @var IDBConnection|MockObject */
    private $connection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->eventDispatcher = $this->createMock(IEventDispatcher::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->shareService = $this->createMock(ShareService::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->scannerUtil = $this->createMock(ScannerUtil::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $this->lockingProvider = $this->createMock(ILockingProvider::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->connection = $this->createMock(IDBConnection::class);

        $this->service = new FileInfoService(
            $this->mapper,
            $this->eventDispatcher,
            $this->logger,
            $this->shareService,
            $this->filterService,
            $this->folderService,
            $this->scannerUtil,
            $this->lockingProvider,
            $this->rootFolder,
            $this->connection,
            $this->excludedFolderService
        );
    }

    /**
     * Test that files are NOT auto-deleted when node is not found
     * This is the critical fix for issue #153
     */
    public function testEnrichDoesNotAutoDeleteWhenNodeNotFound(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setId(123);
        $fileInfo->setPath('/user/files/test.txt');
        $fileInfo->setOwner('user');
        $fileInfo->setFileHash('abc123');
        $fileInfo->setNodeId(456);

        // Simulate node not found - FolderService throws NotFoundException
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException('Node not found'));

        // The critical test: delete() should NOT be called
        $this->mapper->expects($this->never())
            ->method('delete');

        // Logger should log a warning, not deletion
        $this->logger->expects($this->once())
            ->method('warning')
            ->with($this->stringContains('file may be temporarily inaccessible'));

        $enrichedFile = $this->service->enrich($fileInfo);

        // The file should be marked as stale (nodeId = null) but not deleted
        $this->assertNull($enrichedFile->getNodeId());
        $this->assertEquals($fileInfo->getId(), $enrichedFile->getId());
    }

    /**
     * Test that files are NOT auto-deleted when NotFoundException is thrown
     */
    public function testEnrichDoesNotAutoDeleteOnNotFoundException(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setId(123);
        $fileInfo->setPath('/user/files/test.txt');
        $fileInfo->setOwner('user');
        $fileInfo->setFileHash('abc123');

        // Simulate NotFoundException
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->willThrowException(new NotFoundException('File not found'));

        // The critical test: delete() should NOT be called
        $this->mapper->expects($this->never())
            ->method('delete');

        $enrichedFile = $this->service->enrich($fileInfo);

        // The file should be marked as stale but not deleted
        $this->assertNull($enrichedFile->getNodeId());
    }

    /**
     * Test that enrich properly updates file info when node exists
     */
    public function testEnrichUpdatesFileInfoWhenNodeExists(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setId(123);
        $fileInfo->setPath('/user/files/test.txt');
        $fileInfo->setOwner('user');

        $node = $this->createMock(Node::class);
        $node->expects($this->once())->method('getId')->willReturn(789);
        $node->expects($this->once())->method('getMimetype')->willReturn('text/plain');
        $node->expects($this->once())->method('getSize')->willReturn(1024);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->willReturn($node);

        // No deletion should occur
        $this->mapper->expects($this->never())
            ->method('delete');

        // Update method should be called to save enriched data
        $this->mapper->expects($this->once())
            ->method('update')
            ->willReturnArgument(0); // Return the same object

        $enrichedFile = $this->service->enrich($fileInfo);

        // The enriched file is the same object, check it was updated
        $this->assertSame($fileInfo, $enrichedFile);
        $this->assertEquals(789, $fileInfo->getNodeId());
        $this->assertEquals('text/plain', $fileInfo->getMimetype());
        $this->assertEquals(1024, $fileInfo->getSize());
    }

    /**
     * Test that findByHash includes files even if they're temporarily inaccessible
     */
    public function testFindByHashIncludesInaccessibleFiles(): void
    {
        $hash = 'test-hash';

        $fileInfo1 = new FileInfo();
        $fileInfo1->setId(1);
        $fileInfo1->setPath('/user/files/file1.txt');
        $fileInfo1->setNodeId(null); // Stale entry

        $fileInfo2 = new FileInfo();
        $fileInfo2->setId(2);
        $fileInfo2->setPath('/user/files/file2.txt');
        $fileInfo2->setNodeId(456); // Valid entry

        $this->mapper->expects($this->once())
            ->method('findByHash')
            ->with($hash)
            ->willReturn([$fileInfo1, $fileInfo2]);

        // Both files should be included in results
        $results = $this->service->findByHash($hash);

        $this->assertCount(2, $results);
        $this->assertEquals(1, $results[0]->getId());
        $this->assertEquals(2, $results[1]->getId());
    }
}
