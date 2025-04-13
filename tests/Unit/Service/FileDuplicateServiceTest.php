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
        $this->assertTrue($this->fileInfoService->hasAccessRight($fileInfo1, 'user1'),
            'Files owned by the current user should be accessible');

        // Test that a file owned by another user is not accessible
        $this->assertFalse($this->fileInfoService->hasAccessRight($fileInfo2, 'user1'),
            'Files owned by other users should not be accessible');
    }
}
