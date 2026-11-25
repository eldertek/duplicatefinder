<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Exception\AbortedDeletionException;
use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\LivePhotoDeletionService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\Exceptions\AbortedEventException;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileServiceMergeTest extends TestCase
{
    /** @var FileService */
    private $service;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var OriginFolderService|MockObject */
    private $originFolderService;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var LoggerInterface|MockObject */
    private $logger;

    /** @var LivePhotoDeletionService|MockObject */
    private $livePhotoDeletionService;

    protected function setUp(): void
    {
        parent::setUp();

        $this->folderService = $this->createMock(FolderService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->livePhotoDeletionService = $this->createMock(LivePhotoDeletionService::class);

        $this->service = new FileService(
            $this->folderService,
            $this->originFolderService,
            $this->fileInfoService,
            $this->logger,
            $this->livePhotoDeletionService
        );
    }

    public function testDeleteFileResolvesByNodeIdAndChecksResolvedOriginProtection(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(File::class);
        $node->method('getId')->willReturn(55);
        $node->method('getPath')->willReturn('/alice/files/Origin/kept.txt');
        $node->method('getMimetype')->willReturn('text/plain');

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('getById')->with(55)->willReturn([$node]);
        $userFolder->method('getRelativePath')->with('/alice/files/Origin/kept.txt')->willReturn('/Origin/kept.txt');

        $this->originFolderService->expects($this->exactly(2))
            ->method('assertNotProtected')
            ->withConsecutive(['/Copies/alias.txt'], ['/Origin/kept.txt'])
            ->willReturnOnConsecutiveCalls(
                null,
                $this->throwException(new OriginFolderProtectionException('Protected by /Origin'))
            );

        $this->expectException(OriginFolderProtectionException::class);
        $this->service->deleteFile('alice', '/Copies/alias.txt', 55);
    }

    public function testDeleteFileThrowsNotFoundWhenNodeIdMissing(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('getById')->with(999)->willReturn([]);

        $this->expectException(NotFoundException::class);
        $this->service->deleteFile('alice', '/missing.txt', 999);
    }

    public function testDeleteFileBlocksLastCopyUnlessAllowLastCopyIsTrue(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(File::class);
        $node->method('getId')->willReturn(42);
        $node->method('getPath')->willReturn('/alice/files/copy.txt');
        $node->method('getMimetype')->willReturn('text/plain');

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('get')->with('/copy.txt')->willReturn($node);
        $userFolder->method('getRelativePath')->willReturn('/copy.txt');
        $this->livePhotoDeletionService->method('deleteIfPaired')->willReturn(null);
        $this->fileInfoService->method('hasOtherLiveCopy')->with('abc', 42, 'alice')->willReturn(false);

        $this->expectException(LastCopyProtectionException::class);
        $this->service->deleteFile('alice', '/copy.txt', null, 'abc', false);
    }

    public function testDeleteFileAllowsLastCopyWhenConfirmed(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(File::class);
        $node->method('getId')->willReturn(42);
        $node->method('getPath')->willReturn('/alice/files/copy.txt');
        $node->method('getMimetype')->willReturn('text/plain');
        $node->expects($this->once())->method('delete');

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('get')->with('/copy.txt')->willReturn($node);
        $userFolder->method('getRelativePath')->willReturn('/copy.txt');
        $userFolder->method('nodeExists')->with('/copy.txt')->willReturn(false);
        $this->livePhotoDeletionService->method('deleteIfPaired')->willReturn(null);

        $deleted = $this->service->deleteFile('alice', '/copy.txt', null, 'abc', true);
        $this->assertSame([42], $deleted);
    }

    public function testDeleteFileMapsAbortedEventExceptionToLivePhotoOrAbortedException(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(File::class);
        $node->method('getId')->willReturn(77);
        $node->method('getPath')->willReturn('/alice/files/clip.mov');
        $node->method('getMimetype')->willReturn('video/mp4');
        $node->method('delete')->willThrowException(new AbortedEventException('Live photo protected'));

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('get')->with('/clip.mov')->willReturn($node);
        $userFolder->method('getRelativePath')->willReturn('/clip.mov');
        $this->livePhotoDeletionService->method('deleteIfPaired')->willReturn(null);

        $this->expectException(LivePhotoProtectionException::class);
        $this->service->deleteFile('alice', '/clip.mov');
    }

    public function testDeleteFileThrowsAbortedDeletionWhenNodeStillExistsAfterDelete(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(File::class);
        $node->method('getId')->willReturn(88);
        $node->method('getPath')->willReturn('/alice/files/stubborn.txt');
        $node->method('getMimetype')->willReturn('text/plain');
        $node->expects($this->once())->method('delete');

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->method('get')->with('/stubborn.txt')->willReturn($node);
        $userFolder->method('getRelativePath')->willReturn('/stubborn.txt');
        $userFolder->method('nodeExists')->with('/stubborn.txt')->willReturn(true);
        $this->livePhotoDeletionService->method('deleteIfPaired')->willReturn(null);

        $this->expectException(AbortedDeletionException::class);
        $this->service->deleteFile('alice', '/stubborn.txt');
    }
}
