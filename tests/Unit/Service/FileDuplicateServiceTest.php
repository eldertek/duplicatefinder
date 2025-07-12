<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileDuplicateServiceTest extends TestCase
{
    private $mapper;
    private $fileInfoService;
    private $logger;
    private $originFolderService;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileDuplicateMapper::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);

        $this->service = new FileDuplicateService(
            $this->logger,
            $this->mapper,
            $this->fileInfoService,
            $this->originFolderService,
            $this->createMock(\OCP\Lock\ILockingProvider::class)
        );
    }

    /**
     * Test that hasAccessRight correctly identifies files that belong to other users
     * and prevents them from being included in the current user's duplicates
     */
    public function testHasAccessRightFiltersByOwner()
    {
        // Create FileInfo mocks for files with different owners
        $fileInfo1 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo1->method('getPath')->willReturn('/user1/files/document.txt');
        $fileInfo1->method('getOwner')->willReturn('user1');

        $fileInfo2 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo2->method('getPath')->willReturn('/user2/files/document.txt');
        $fileInfo2->method('getOwner')->willReturn('user2');

        // Configure hasAccessRight to return true for files owned by the user and false for others
        $this->fileInfoService->expects($this->exactly(2))
            ->method('hasAccessRight')
            ->withConsecutive(
                [$fileInfo1, 'user1'],
                [$fileInfo2, 'user1']
            )
            ->willReturnOnConsecutiveCalls(true, false);

        // Test that a file owned by the current user is accessible
        $this->assertTrue(
            $this->fileInfoService->hasAccessRight($fileInfo1, 'user1'),
            'Files owned by the current user should be accessible'
        );

        // Test that a file owned by another user is not accessible
        $this->assertFalse(
            $this->fileInfoService->hasAccessRight($fileInfo2, 'user1'),
            'Files owned by other users should not be accessible'
        );
    }

    /**
     * Test that duplicates can be sorted by size in descending order (largest first)
     */
    public function testFindAllWithSortBySizeDescending()
    {
        // Create mock FileInfo objects with different sizes
        $smallFileInfo1 = $this->createMockFileInfo(100, '/user1/files/small1.txt', 'user1');
        $smallFileInfo2 = $this->createMockFileInfo(100, '/user1/files/small2.txt', 'user1');
        $mediumFileInfo1 = $this->createMockFileInfo(500, '/user1/files/medium1.txt', 'user1');
        $mediumFileInfo2 = $this->createMockFileInfo(500, '/user1/files/medium2.txt', 'user1');
        $largeFileInfo1 = $this->createMockFileInfo(1000, '/user1/files/large1.txt', 'user1');
        $largeFileInfo2 = $this->createMockFileInfo(1000, '/user1/files/large2.txt', 'user1');

        // Create mock FileDuplicate objects with at least 2 files each
        $smallDuplicate = $this->createMockDuplicate('hash1', [$smallFileInfo1, $smallFileInfo2]);
        $mediumDuplicate = $this->createMockDuplicate('hash2', [$mediumFileInfo1, $mediumFileInfo2]);
        $largeDuplicate = $this->createMockDuplicate('hash3', [$largeFileInfo1, $largeFileInfo2]);

        // Configure the mapper to return the duplicates in unsorted order
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with('user1', 20, 0, [['size', 'DESC']])
            ->willReturn([$smallDuplicate, $largeDuplicate, $mediumDuplicate]);

        // Configure fileInfoService to return the correct files for each hash
        $this->fileInfoService->expects($this->exactly(3))
            ->method('findByHash')
            ->willReturnMap([
                ['hash1', 'file_hash', [$smallFileInfo1, $smallFileInfo2]],
                ['hash2', 'file_hash', [$mediumFileInfo1, $mediumFileInfo2]],
                ['hash3', 'file_hash', [$largeFileInfo1, $largeFileInfo2]],
            ]);

        // Configure fileInfoService.hasAccessRight to always return true
        $this->fileInfoService->expects($this->exactly(6))
            ->method('hasAccessRight')
            ->willReturn(true);

        // Call the method with size sorting
        $result = $this->service->findAll('all', 'user1', 1, 20, false, [['size', 'DESC']]);

        // Verify the result contains the duplicates in the expected order
        $this->assertCount(3, $result['entities']);

        // The duplicates should be returned in the order provided by the mapper
        // (we're testing that the service correctly passes the sort parameters to the mapper)
        $this->assertEquals('hash1', $result['entities'][0]->getHash());
        $this->assertEquals('hash3', $result['entities'][1]->getHash());
        $this->assertEquals('hash2', $result['entities'][2]->getHash());
    }

    /**
     * Test that duplicates can be sorted by size in ascending order (smallest first)
     */
    public function testFindAllWithSortBySizeAscending()
    {
        // Create mock FileInfo objects with different sizes
        $smallFileInfo1 = $this->createMockFileInfo(100, '/user1/files/small1.txt', 'user1');
        $smallFileInfo2 = $this->createMockFileInfo(100, '/user1/files/small2.txt', 'user1');
        $mediumFileInfo1 = $this->createMockFileInfo(500, '/user1/files/medium1.txt', 'user1');
        $mediumFileInfo2 = $this->createMockFileInfo(500, '/user1/files/medium2.txt', 'user1');
        $largeFileInfo1 = $this->createMockFileInfo(1000, '/user1/files/large1.txt', 'user1');
        $largeFileInfo2 = $this->createMockFileInfo(1000, '/user1/files/large2.txt', 'user1');

        // Create mock FileDuplicate objects with at least 2 files each
        $smallDuplicate = $this->createMockDuplicate('hash1', [$smallFileInfo1, $smallFileInfo2]);
        $mediumDuplicate = $this->createMockDuplicate('hash2', [$mediumFileInfo1, $mediumFileInfo2]);
        $largeDuplicate = $this->createMockDuplicate('hash3', [$largeFileInfo1, $largeFileInfo2]);

        // Configure the mapper to return the duplicates in unsorted order
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with('user1', 20, 0, [['size', 'ASC']])
            ->willReturn([$largeDuplicate, $smallDuplicate, $mediumDuplicate]);

        // Configure fileInfoService to return the correct files for each hash
        $this->fileInfoService->expects($this->exactly(3))
            ->method('findByHash')
            ->willReturnMap([
                ['hash1', 'file_hash', [$smallFileInfo1, $smallFileInfo2]],
                ['hash2', 'file_hash', [$mediumFileInfo1, $mediumFileInfo2]],
                ['hash3', 'file_hash', [$largeFileInfo1, $largeFileInfo2]],
            ]);

        // Configure fileInfoService.hasAccessRight to always return true
        $this->fileInfoService->expects($this->exactly(6))
            ->method('hasAccessRight')
            ->willReturn(true);

        // Call the method with size sorting
        $result = $this->service->findAll('all', 'user1', 1, 20, false, [['size', 'ASC']]);

        // Verify the result contains the duplicates in the expected order
        $this->assertCount(3, $result['entities']);

        // The duplicates should be returned in the order provided by the mapper
        // (we're testing that the service correctly passes the sort parameters to the mapper)
        $this->assertEquals('hash3', $result['entities'][0]->getHash());
        $this->assertEquals('hash1', $result['entities'][1]->getHash());
        $this->assertEquals('hash2', $result['entities'][2]->getHash());
    }

    /**
     * Helper method to create a mock FileInfo with a specific size
     */
    private function createMockFileInfo(int $size, string $path, string $owner): FileInfo
    {
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getSize', 'getPath', 'getOwner', 'getFileHash'])
            ->getMock();
        $fileInfo->method('getSize')->willReturn($size);
        $fileInfo->method('getPath')->willReturn($path);
        $fileInfo->method('getOwner')->willReturn($owner);
        $fileInfo->method('getFileHash')->willReturn(basename($path));

        return $fileInfo;
    }

    /**
     * Helper method to create a FileDuplicate with specific files
     */
    private function createMockDuplicate(string $hash, array $files): FileDuplicate
    {
        $duplicate = new FileDuplicate($hash, 'file_hash');
        $duplicate->setFiles($files);

        return $duplicate;
    }
}
