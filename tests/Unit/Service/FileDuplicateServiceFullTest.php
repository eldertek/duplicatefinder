<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileDuplicateServiceFullTest extends TestCase
{
    /** @var FileDuplicateService */
    private $service;

    /** @var FileDuplicateMapper|MockObject */
    private $mapper;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var OriginFolderService|MockObject */
    private $originFolderService;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileDuplicateMapper::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new FileDuplicateService(
            $this->mapper,
            $this->fileInfoService,
            $this->originFolderService,
            $this->logger
        );
    }

    /**
     * Test finding duplicates with multiple files
     */
    public function testFindDuplicatesWithMultipleFiles(): void
    {
        $hash = 'abc123';

        // Create test files with same hash
        $file1 = new FileInfo();
        $file1->setId(1);
        $file1->setPath('/user/files/doc1.txt');
        $file1->setFileHash($hash);
        $file1->setSize(1024);

        $file2 = new FileInfo();
        $file2->setId(2);
        $file2->setPath('/user/files/backup/doc1.txt');
        $file2->setFileHash($hash);
        $file2->setSize(1024);

        $file3 = new FileInfo();
        $file3->setId(3);
        $file3->setPath('/user/files/archive/doc1.txt');
        $file3->setFileHash($hash);
        $file3->setSize(1024);

        // Mock file info service to return these files
        $this->fileInfoService->expects($this->once())
            ->method('findByHash')
            ->with($hash)
            ->willReturn([$file1, $file2, $file3]);

        // Mock mapper to return empty (no existing duplicate entry)
        $this->mapper->expects($this->once())
            ->method('find')
            ->with($hash)
            ->willThrowException(new \OCP\AppFramework\Db\DoesNotExistException(''));

        // Should create new duplicate entry
        $this->mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function ($duplicate) {
                $duplicate->setId(1);

                return $duplicate;
            });

        $duplicate = $this->service->find($hash);

        $this->assertInstanceOf(FileDuplicate::class, $duplicate);
        $this->assertEquals($hash, $duplicate->getHash());
        $this->assertCount(3, $duplicate->getFiles());
    }

    /**
     * Test finding all duplicates with pagination
     */
    public function testFindAllWithPagination(): void
    {
        $duplicate1 = new FileDuplicate();
        $duplicate1->setHash('hash1');
        $duplicate1->setId(1);

        $duplicate2 = new FileDuplicate();
        $duplicate2->setHash('hash2');
        $duplicate2->setId(2);

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with(10, 0)
            ->willReturn([$duplicate1, $duplicate2]);

        $this->mapper->expects($this->once())
            ->method('count')
            ->willReturn(25); // Total duplicates

        // Mock file enrichment
        $this->fileInfoService->expects($this->exactly(2))
            ->method('findByHash')
            ->willReturnOnConsecutiveCalls(
                [new FileInfo(), new FileInfo()], // 2 files for hash1
                [new FileInfo(), new FileInfo(), new FileInfo()] // 3 files for hash2
            );

        $result = $this->service->findAll(10, 0);

        $this->assertArrayHasKey('entities', $result);
        $this->assertArrayHasKey('pagination', $result);
        $this->assertCount(2, $result['entities']);
        $this->assertEquals(3, $result['pagination']['totalPages']); // 25 items / 10 per page
    }

    /**
     * Test sorting duplicates by size
     */
    public function testSortDuplicatesBySize(): void
    {
        // Create duplicates with different total sizes
        $duplicate1 = new FileDuplicate();
        $duplicate1->setHash('hash1');

        $file1a = new FileInfo();
        $file1a->setSize(1000);
        $file1b = new FileInfo();
        $file1b->setSize(1000);
        $duplicate1->setFiles([$file1a, $file1b]); // Total: 2000

        $duplicate2 = new FileDuplicate();
        $duplicate2->setHash('hash2');

        $file2a = new FileInfo();
        $file2a->setSize(5000);
        $file2b = new FileInfo();
        $file2b->setSize(5000);
        $duplicate2->setFiles([$file2a, $file2b]); // Total: 10000

        $duplicates = [$duplicate1, $duplicate2];

        // Sort by size descending
        usort($duplicates, function ($a, $b) {
            $sizeA = array_sum(array_map(fn ($f) => $f->getSize(), $a->getFiles()));
            $sizeB = array_sum(array_map(fn ($f) => $f->getSize(), $b->getFiles()));

            return $sizeB - $sizeA;
        });

        // Larger duplicate should be first
        $this->assertEquals('hash2', $duplicates[0]->getHash());
        $this->assertEquals('hash1', $duplicates[1]->getHash());
    }

    /**
     * Test acknowledging duplicates
     */
    public function testAcknowledgeDuplicate(): void
    {
        $duplicate = new FileDuplicate();
        $duplicate->setId(1);
        $duplicate->setHash('test-hash');
        $duplicate->setAcknowledged(false);

        $this->mapper->expects($this->once())
            ->method('find')
            ->with('test-hash')
            ->willReturn($duplicate);

        $this->mapper->expects($this->once())
            ->method('update')
            ->willReturnCallback(function ($dup) {
                $this->assertTrue($dup->getAcknowledged());

                return $dup;
            });

        $result = $this->service->acknowledge('test-hash');

        $this->assertInstanceOf(FileDuplicate::class, $result);
        $this->assertTrue($result->getAcknowledged());
    }

    /**
     * Test filtering duplicates by owner
     */
    public function testFilterDuplicatesByOwner(): void
    {
        $duplicate = new FileDuplicate();

        $file1 = new FileInfo();
        $file1->setOwner('user1');
        $file1->setPath('/user1/files/doc.txt');

        $file2 = new FileInfo();
        $file2->setOwner('user2');
        $file2->setPath('/user2/files/doc.txt');

        $file3 = new FileInfo();
        $file3->setOwner('user1');
        $file3->setPath('/user1/files/backup/doc.txt');

        $duplicate->setFiles([$file1, $file2, $file3]);

        // Filter for user1 - should have 2 files
        $user1Files = array_filter($duplicate->getFiles(), function ($file) {
            return $file->getOwner() === 'user1';
        });

        $this->assertCount(2, $user1Files);

        // Filter for user2 - should have 1 file
        $user2Files = array_filter($duplicate->getFiles(), function ($file) {
            return $file->getOwner() === 'user2';
        });

        $this->assertCount(1, $user2Files);
    }

    /**
     * Test handling origin folders in duplicates
     */
    public function testOriginFolderHandling(): void
    {
        $duplicate = new FileDuplicate();

        $file1 = new FileInfo();
        $file1->setPath('/user/files/originals/doc.txt');
        $file1->setIsInOriginFolder(true);

        $file2 = new FileInfo();
        $file2->setPath('/user/files/copies/doc.txt');
        $file2->setIsInOriginFolder(false);

        $duplicate->setFiles([$file1, $file2]);

        // Count protected files
        $protectedCount = count(array_filter($duplicate->getFiles(), function ($file) {
            return $file->getIsInOriginFolder();
        }));

        $this->assertEquals(1, $protectedCount);

        // Get only non-protected files for deletion
        $deletableFiles = array_filter($duplicate->getFiles(), function ($file) {
            return !$file->getIsInOriginFolder();
        });

        $this->assertCount(1, $deletableFiles);
        $this->assertEquals('/user/files/copies/doc.txt', array_values($deletableFiles)[0]->getPath());
    }
}
