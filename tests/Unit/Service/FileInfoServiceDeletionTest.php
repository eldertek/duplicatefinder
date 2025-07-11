<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCP\Files\Node;
use OCP\Files\File;
use OCP\Files\NotFoundException;
use OCP\Lock\ILockingProvider;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\EventDispatcher\IEventDispatcher;
use PHPUnit\Framework\TestCase;
use PHPUnit\Framework\MockObject\MockObject;
use Psr\Log\LoggerInterface;

class FileInfoServiceDeletionTest extends TestCase {
    /** @var FileInfoService */
    private $service;
    
    /** @var MockObject */
    private $mapper;
    
    /** @var MockObject */
    private $folderService;
    
    /** @var MockObject */
    private $logger;
    
    /** @var MockObject */
    private $eventDispatcher;
    
    /** @var MockObject */
    private $filterService;
    
    /** @var MockObject */
    private $scannerUtil;
    
    /** @var MockObject */
    private $lockingProvider;
    
    /** @var MockObject */
    private $rootFolder;
    
    /** @var MockObject */
    private $connection;
    
    /** @var MockObject */
    private $excludedFolderService;

    protected function setUp(): void {
        parent::setUp();
        
        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->eventDispatcher = $this->createMock(IEventDispatcher::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->scannerUtil = $this->createMock(\OCA\DuplicateFinder\AppInfo\IScannerUtil::class);
        $this->lockingProvider = $this->createMock(ILockingProvider::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->connection = $this->createMock(IDBConnection::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);
        
        $this->service = new FileInfoService(
            $this->mapper,
            $this->folderService,
            $this->logger,
            $this->eventDispatcher,
            $this->filterService,
            $this->scannerUtil,
            $this->lockingProvider,
            $this->rootFolder,
            $this->connection,
            $this->excludedFolderService
        );
    }

    /**
     * Test that enrich() deletes file info when node is not found
     * This is the dangerous behavior that causes data loss
     */
    public function testEnrichDeletesFileInfoWhenNodeNotFound() {
        $fileInfo = new FileInfo('/path/to/file.txt');
        $fileInfo->setId(123);
        $fileInfo->setFileHash('abc123');
        
        // Simulate node not being found (could be temporary network issue)
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn(null);
        
        // The dangerous part: it calls delete!
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo);
        
        // The logger shows this is intentional behavior
        $this->logger->expects($this->at(1))
            ->method('warning')
            ->with($this->stringContains('Node not found for file info - file may have been deleted'));
        
        $this->logger->expects($this->at(2))
            ->method('info')
            ->with($this->stringContains('Deleted file info for non-existent file'));
        
        $result = $this->service->enrich($fileInfo);
        $this->assertSame($fileInfo, $result);
    }

    /**
     * Test that enrich() also deletes when NotFoundException is thrown
     */
    public function testEnrichDeletesOnNotFoundException() {
        $fileInfo = new FileInfo('/shared/folder/file.txt');
        $fileInfo->setId(456);
        
        // Simulate NotFoundException (e.g., permission issue on shared folder)
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException());
        
        // It will try to delete the file info
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo);
        
        $result = $this->service->enrich($fileInfo);
        $this->assertSame($fileInfo, $result);
    }

    /**
     * Test that findByHash() can trigger mass deletions through enrich()
     */
    public function testFindByHashCanTriggerMassDeletions() {
        $hash = 'duplicate-hash-123';
        
        // Create multiple file infos with same hash
        $fileInfo1 = new FileInfo('/user1/file.txt');
        $fileInfo1->setId(1);
        $fileInfo1->setNodeId(null);
        
        $fileInfo2 = new FileInfo('/user2/shared/file.txt');
        $fileInfo2->setId(2);
        $fileInfo2->setNodeId(null);
        
        $fileInfo3 = new FileInfo('/user3/external/file.txt');
        $fileInfo3->setId(3);
        $fileInfo3->setNodeId(null);
        
        $this->mapper->expects($this->once())
            ->method('findByHash')
            ->with($hash)
            ->willReturn([$fileInfo1, $fileInfo2, $fileInfo3]);
        
        // All files will be "not found" (simulating permission/mount issues)
        $this->folderService->expects($this->exactly(3))
            ->method('getNodeByFileInfo')
            ->willReturn(null);
        
        // ALL THREE will be deleted!
        $this->mapper->expects($this->exactly(3))
            ->method('delete');
        
        $result = $this->service->findByHash($hash);
        
        // No files returned because all were deleted
        $this->assertCount(0, $result);
    }

    /**
     * Test the dangerous delete() method that deletes BOTH database entry AND physical file
     */
    public function testDeleteMethodDeletesPhysicalFile() {
        $fileInfo = new FileInfo('/important/document.pdf');
        $fileInfo->setId(789);
        $fileInfo->setOwner('user1');
        
        $mockNode = $this->createMock(File::class);
        
        // It finds the node
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn($mockNode);
        
        // AND DELETES THE PHYSICAL FILE!
        $mockNode->expects($this->once())
            ->method('delete');
        
        // Then deletes from database
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo);
        
        $this->service->delete($fileInfo);
    }
    
    /**
     * Test race condition: file temporarily unavailable during enrich
     */
    public function testRaceConditionDuringEnrich() {
        $fileInfo = new FileInfo('/network/mount/file.doc');
        $fileInfo->setId(999);
        
        // First call: network temporarily down
        $this->folderService->expects($this->at(0))
            ->method('getNodeByFileInfo')
            ->willThrowException(new NotFoundException('Network timeout'));
        
        // File gets deleted due to "not found"
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo);
        
        $this->service->enrich($fileInfo);
        
        // Later: network is back, but file is gone forever!
    }
}