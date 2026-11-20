<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\LivePhotoResolver;
use OCA\DuplicateFinder\Service\LivePhotoStatusService;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\FilesMetadata\IFilesMetadataManager;
use OCP\FilesMetadata\Model\IFilesMetadata;
use PHPUnit\Framework\TestCase;

class LivePhotoStatusServiceTest extends TestCase
{
    /**
     * Build an already enriched file without reading its source node again.
     */
    private function image(int $id): FileInfo
    {
        $file = new FileInfo();
        $file->setNodeId($id);
        $file->setMimetype('image/jpeg');

        return $file;
    }

    /**
     * Supply recorded links through the same metadata contract used for deletion.
     */
    private function metadata(string $peer): IFilesMetadata
    {
        $metadata = $this->createMock(IFilesMetadata::class);
        $metadata->method('hasKey')->with('files-live-photo')->willReturn(true);
        $metadata->method('getString')->with('files-live-photo')->willReturn($peer);

        return $metadata;
    }

    public function testOrdinaryImagesReadMetadataOnceWithoutResolvingFiles(): void
    {
        $files = array_map($this->image(...), range(1, 50));
        $manager = $this->createMock(IFilesMetadataManager::class);
        $manager->expects($this->once())->method('getMetadataForFiles')->with(range(1, 50))->willReturn([]);
        $folders = $this->createMock(FolderService::class);
        $folders->expects($this->never())->method('getUserFolder');
        $service = new LivePhotoStatusService($folders, new LivePhotoResolver($manager), $manager);

        $service->markMissingVideos($files, 'alice');

        foreach ($files as $file) {
            $this->assertFalse($file->getIsLivePhotoVideoMissing());
        }
    }

    public function testOnlyValidRecordedPeersAreResolvedOnceWithinTheBatch(): void
    {
        $files = array_map($this->image(...), [1, 2, 3, 4, 5, 1]);
        $manager = $this->createMock(IFilesMetadataManager::class);
        $manager->expects($this->once())->method('getMetadataForFiles')->with([1, 2, 3, 4, 5])->willReturn([
            1 => $this->metadata('100'),
            2 => $this->metadata('200'),
            3 => $this->metadata('100'),
            4 => $this->metadata('invalid'),
            5 => $this->metadata('5'),
        ]);
        $folder = $this->createMock(Folder::class);
        $folder->expects($this->exactly(2))->method('getById')->willReturnCallback(
            fn (int $id): array => $id === 200 ? [$this->createMock(Node::class)] : []
        );
        $folders = $this->createMock(FolderService::class);
        $folders->expects($this->once())->method('getUserFolder')->with('alice')->willReturn($folder);
        $service = new LivePhotoStatusService($folders, new LivePhotoResolver($manager), $manager);

        $service->markMissingVideos($files, 'alice');

        $this->assertSame([true, false, true, false, false, true], array_map(fn (FileInfo $file): bool => $file->getIsLivePhotoVideoMissing(), $files));
    }

    public function testRestoredPeerClearsTheMissingFlagOnTheNextBatch(): void
    {
        $file = $this->image(1);
        $manager = $this->createMock(IFilesMetadataManager::class);
        $manager->expects($this->exactly(2))->method('getMetadataForFiles')->willReturn([1 => $this->metadata('100')]);
        $folder = $this->createMock(Folder::class);
        $folder->expects($this->exactly(2))->method('getById')->with(100)->willReturnOnConsecutiveCalls([], [$this->createMock(Node::class)]);
        $folders = $this->createMock(FolderService::class);
        $folders->method('getUserFolder')->willReturn($folder);
        $service = new LivePhotoStatusService($folders, new LivePhotoResolver($manager), $manager);

        $service->markMissingVideos([$file], 'alice');
        $this->assertTrue($file->getIsLivePhotoVideoMissing());
        $service->markMissingVideos([$file], 'alice');
        $this->assertFalse($file->getIsLivePhotoVideoMissing());
    }
}
