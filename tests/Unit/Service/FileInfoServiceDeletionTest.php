<?php

declare(strict_types=1);

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
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileInfoServiceDeletionTest extends TestCase
{
    /** @var FileInfoService */
    private $service;

    /** @var FileInfoMapper|MockObject */
    private $mapper;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var ILockingProvider|MockObject */
    private $lockingProvider;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->lockingProvider = $this->createMock(ILockingProvider::class);

        $this->service = new FileInfoService(
            $this->mapper,
            $this->createMock(IEventDispatcher::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(ShareService::class),
            $this->createMock(FilterService::class),
            $this->folderService,
            $this->createMock(ScannerUtil::class),
            $this->lockingProvider,
            $this->createMock(IRootFolder::class),
            $this->createMock(IDBConnection::class),
            $this->createMock(ExcludedFolderService::class)
        );
    }

    public function testEnrichKeepsFileInfoWhenNodeIsMissing(): void
    {
        $fileInfo = new FileInfo('/path/to/file.txt');
        $fileInfo->setId(123);
        $fileInfo->setFileHash('abc123');

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn(null);

        $this->mapper->expects($this->never())
            ->method('delete');

        $result = $this->service->enrich($fileInfo);

        $this->assertSame($fileInfo, $result);
        $this->assertSame('/path/to/file.txt', $result->getPath());
        $this->assertSame('abc123', $result->getFileHash());
    }

    public function testEnrichKeepsFileInfoOnNotFoundException(): void
    {
        $fileInfo = new FileInfo('/shared/folder/file.txt');
        $fileInfo->setId(456);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException('Temporary mount issue'));

        $this->mapper->expects($this->never())
            ->method('delete');

        $result = $this->service->enrich($fileInfo);

        $this->assertSame($fileInfo, $result);
    }

    public function testFindByHashKeepsTemporarilyInaccessibleFiles(): void
    {
        $hash = 'duplicate-hash-123';
        $files = [
            new FileInfo('/user1/file.txt'),
            new FileInfo('/user2/shared/file.txt'),
            new FileInfo('/user3/external/file.txt'),
        ];

        $this->mapper->expects($this->once())
            ->method('findByHash')
            ->with($hash, 'file_hash')
            ->willReturn($files);

        $this->folderService->expects($this->exactly(3))
            ->method('getNodeByFileInfo')
            ->willReturn(null);

        $this->mapper->expects($this->never())
            ->method('delete');

        $result = $this->service->findByHash($hash);

        $this->assertCount(3, $result);
    }

    public function testDeleteOnlyRemovesDatabaseRecord(): void
    {
        $fileInfo = new FileInfo('/important/document.pdf');
        $fileInfo->setId(789);
        $fileInfo->setOwner('user1');

        $this->folderService->expects($this->never())
            ->method('getNodeByFileInfo');

        $this->lockingProvider->expects($this->once())
            ->method('releaseAll')
            ->with('/important/document.pdf', ILockingProvider::LOCK_SHARED);

        $this->mapper->expects($this->once())
            ->method('findById')
            ->with(789)
            ->willReturn($fileInfo);

        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo)
            ->willReturn($fileInfo);

        $this->assertSame($fileInfo, $this->service->delete($fileInfo));
    }

    public function testRaceConditionDuringEnrichLeavesRecordInDatabase(): void
    {
        $fileInfo = new FileInfo('/network/mount/file.doc');
        $fileInfo->setId(999);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->willThrowException(new NotFoundException('Network timeout'));

        $this->mapper->expects($this->never())
            ->method('delete');

        $this->service->enrich($fileInfo);
    }
}
