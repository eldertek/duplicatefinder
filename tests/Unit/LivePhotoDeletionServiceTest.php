<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\LivePhotoConfirmationRequiredException;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Model\LivePhotoPair;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\LivePhotoDeletionService;
use OCA\DuplicateFinder\Service\LivePhotoResolver;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;

class LivePhotoDeletionServiceTest extends TestCase
{
    private $resolver;
    private $fileInfoService;
    private $originFolderService;
    private $locks;
    private $userFolder;
    private LivePhotoDeletionService $service;
    private LivePhotoPair $source;
    private LivePhotoPair $survivor;
    private array $hashes;
    private bool $deleted;
    private bool $candidateAccessible;

    protected function setUp(): void
    {
        $this->resolver = $this->createMock(LivePhotoResolver::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->locks = $this->createMock(ILockingProvider::class);
        $this->userFolder = $this->createMock(Folder::class);
        $this->source = new LivePhotoPair($this->file(10, 'a.jpg'), $this->file(11, 'a.mov'));
        $this->survivor = new LivePhotoPair($this->file(20, 'b.jpg'), $this->file(21, 'b.mov'));
        $this->hashes = [10 => 'image-hash', 11 => 'video-hash', 20 => 'image-hash', 21 => 'video-hash'];
        $this->deleted = false;
        $this->candidateAccessible = true;
        $this->userFolder->method('getRelativePath')->willReturnCallback(
            static fn (string $path): string => substr($path, strlen('/alice/files'))
        );
        $this->userFolder->method('getById')->willReturnCallback(function (int $id): array {
            if ($id === 20) {
                return $this->candidateAccessible ? [$this->survivor->image] : [];
            }
            if ($this->deleted) {
                return [];
            }

            return [$id === 10 ? $this->source->image : $this->source->video];
        });
        $this->fileInfoService->method('getContentHash')->willReturnCallback(fn (File $file): string => $this->hashes[$file->getId()]);
        $this->service = new LivePhotoDeletionService(
            $this->resolver,
            $this->fileInfoService,
            $this->originFolderService,
            $this->locks
        );
    }

    private function file(int $id, string $name): File
    {
        $file = $this->createMock(File::class);
        $file->method('getId')->willReturn($id);
        $file->method('getPath')->willReturn('/alice/files/Photos/' . $name);
        $file->method('isReadable')->willReturn(true);
        $file->method('isDeletable')->willReturn(true);

        return $file;
    }

    private function givenPairs(?LivePhotoPair $survivor): void
    {
        $this->resolver->method('resolve')->willReturnCallback(function (File $file) use ($survivor): ?LivePhotoPair {
            return $file->getId() < 20 ? $this->source : $survivor;
        });
        $row = new FileInfo('/alice/files/Photos/b.jpg', 'alice');
        $row->setNodeId(20);
        $this->fileInfoService->method('findByHash')->with('image-hash')->willReturn([$row]);
    }

    public function testEitherSelectionDeletesThroughTheStillAndKeepsBothSurvivorFiles(): void
    {
        $this->givenPairs($this->survivor);
        $this->source->image->expects($this->once())->method('delete')->willReturnCallback(function (): void {
            $this->deleted = true;
        });
        $this->source->video->expects($this->never())->method('delete');
        foreach ($this->survivor->getFiles() as $file) {
            $file->expects($this->once())->method('lock')->with(ILockingProvider::LOCK_SHARED);
            $file->expects($this->once())->method('unlock')->with(ILockingProvider::LOCK_SHARED);
            $file->expects($this->never())->method('delete');
        }
        $this->locks->expects($this->once())->method('acquireLock');
        $this->locks->expects($this->once())->method('releaseLock');

        $this->assertSame([10, 11], $this->service->deleteIfPaired($this->userFolder, $this->source->video, true));
    }

    public function testSeparateImageAndVideoCopiesDoNotPreserveALivePhoto(): void
    {
        $this->givenPairs(null);
        $this->source->image->expects($this->never())->method('delete');
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->image);
    }

    public function testDifferentVideoContentsAreNotAReplacement(): void
    {
        $this->givenPairs($this->survivor);
        $this->hashes[21] = 'another-video';
        $this->source->image->expects($this->never())->method('delete');
        foreach ($this->survivor->getFiles() as $file) {
            $file->expects($this->once())->method('unlock');
        }
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->video);
    }

    public function testAStaleImageHashDoesNotCountAsAnotherCopy(): void
    {
        $this->givenPairs($this->survivor);
        $this->hashes[20] = 'changed-image';
        $this->source->image->expects($this->never())->method('delete');
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->image);
    }

    public function testAnInaccessiblePairDoesNotCount(): void
    {
        $this->givenPairs($this->survivor);
        $this->candidateAccessible = false;
        $this->source->image->expects($this->never())->method('delete');
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->image);
    }

    public function testProtectedVideoPreventsDeletingTheImageToo(): void
    {
        $this->givenPairs($this->survivor);
        $this->originFolderService->method('assertNotProtected')->willReturnCallback(static function (string $path): void {
            if (str_ends_with($path, '.mov')) {
                throw new OriginFolderProtectionException('Protected component');
            }
        });
        $this->source->image->expects($this->never())->method('delete');
        $this->expectException(OriginFolderProtectionException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->image);
    }

    public function testLockFailureDoesNotDeleteAndReleasesTheMutex(): void
    {
        $this->givenPairs($this->survivor);
        $this->survivor->image->method('lock')->willThrowException(new LockedException('busy'));
        $this->source->image->expects($this->never())->method('delete');
        $this->locks->expects($this->once())->method('releaseLock');
        $this->expectException(LockedException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->image);
    }

    public function testBothComponentsRequireExplicitConfirmation(): void
    {
        $this->givenPairs($this->survivor);
        $this->source->image->expects($this->never())->method('delete');
        $this->source->video->expects($this->never())->method('delete');
        foreach ($this->survivor->getFiles() as $file) {
            $file->expects($this->once())->method('unlock');
        }
        $this->locks->expects($this->once())->method('releaseLock');
        $this->expectException(LivePhotoConfirmationRequiredException::class);
        $this->service->deleteIfPaired($this->userFolder, $this->source->video);
    }
}
