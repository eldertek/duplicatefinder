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
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileInfoServiceNoDeletionTest extends TestCase
{
    /** @var FileInfoService */
    private $fileInfoService;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var FileInfoMapper|MockObject */
    private $mapper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->folderService = $this->createMock(FolderService::class);
        $this->mapper = $this->createMock(FileInfoMapper::class);

        $this->fileInfoService = new FileInfoService(
            $this->mapper,
            $this->createMock(IEventDispatcher::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(ShareService::class),
            $this->createMock(FilterService::class),
            $this->folderService,
            $this->createMock(ScannerUtil::class),
            $this->createMock(ILockingProvider::class),
            $this->createMock(IRootFolder::class),
            $this->createMock(IDBConnection::class),
            $this->createMock(ExcludedFolderService::class)
        );
    }

    public function testEnrichDoesNotDeleteWhenNodeNotFound(): void
    {
        $fileInfo = new FileInfo('/test/file.txt');
        $fileInfo->setFileHash('abc123');
        $fileInfo->setId(123);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException());

        $this->mapper->expects($this->never())
            ->method('delete');

        $enrichedFile = $this->fileInfoService->enrich($fileInfo);

        $this->assertSame($fileInfo, $enrichedFile);
        $this->assertEquals('/test/file.txt', $enrichedFile->getPath());
        $this->assertEquals('abc123', $enrichedFile->getFileHash());
    }

    public function testEnrichHandlesNullNodeWithoutDeleting(): void
    {
        $fileInfo = new FileInfo('/test/file2.txt');
        $fileInfo->setFileHash('def456');
        $fileInfo->setId(456);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn(null);

        $this->mapper->expects($this->never())
            ->method('delete');

        $enrichedFile = $this->fileInfoService->enrich($fileInfo);

        $this->assertSame($fileInfo, $enrichedFile);
        $this->assertEquals('/test/file2.txt', $enrichedFile->getPath());
    }

    public function testDeleteOnlyRemovesDatabaseEntry(): void
    {
        $fileInfo = new FileInfo('/test/file3.txt');
        $fileInfo->setId(789);

        $this->folderService->expects($this->never())
            ->method('getNodeByFileInfo');

        $this->mapper->expects($this->once())
            ->method('findById')
            ->with(789)
            ->willReturn($fileInfo);

        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo)
            ->willReturn($fileInfo);

        $this->assertSame($fileInfo, $this->fileInfoService->delete($fileInfo));
    }

    /**
     * @dataProvider inaccessibleNodeProvider
     */
    public function testVariousInaccessibilityScenariosNeverDelete(\Throwable $exception): void
    {
        $fileInfo = new FileInfo('/test/scenario/file.txt');
        $fileInfo->setFileHash('abc123');
        $fileInfo->setId(1000);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->willThrowException($exception);

        $this->mapper->expects($this->never())
            ->method('delete');

        $this->assertSame($fileInfo, $this->fileInfoService->enrich($fileInfo));
    }

    public function inaccessibleNodeProvider(): array
    {
        return [
            'network timeout' => [new \RuntimeException('Network timeout')],
            'permission denied' => [new \RuntimeException('Permission denied')],
            'file locked' => [new \RuntimeException('File is locked')],
            'mount point unavailable' => [new NotFoundException('Mount point not available')],
        ];
    }
}
