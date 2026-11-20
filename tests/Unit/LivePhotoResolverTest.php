<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit;

use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Service\LivePhotoResolver;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\FilesMetadata\IFilesMetadataManager;
use OCP\FilesMetadata\Model\IFilesMetadata;
use PHPUnit\Framework\TestCase;

class LivePhotoResolverTest extends TestCase
{
    private array $links;
    private array $files;
    private LivePhotoResolver $resolver;
    private $folder;
    private array $existingFiles;
    private Folder $userFolder;

    protected function setUp(): void
    {
        $this->links = [10 => '11', 11 => '10'];
        $this->folder = $this->createMock(Folder::class);
        $this->files = [];
        foreach ([10 => 'image/jpeg', 11 => 'video/quicktime'] as $id => $type) {
            $file = $this->createMock(File::class);
            $file->method('getId')->willReturn($id);
            $file->method('getMimetype')->willReturn($type);
            $file->method('getParent')->willReturn($this->folder);
            $this->files[$id] = $file;
        }
        $this->folder->method('getDirectoryListing')->willReturnCallback(fn (): array => array_values($this->files));
        $this->existingFiles = $this->files;
        $this->userFolder = $this->createMock(Folder::class);
        $this->userFolder->method('getById')->willReturnCallback(fn (int $id): array => isset($this->existingFiles[$id]) ? [$this->existingFiles[$id]] : []);
        $manager = $this->createMock(IFilesMetadataManager::class);
        $manager->method('getMetadataForFiles')->willReturnCallback(function (array $ids): array {
            $id = $ids[0];
            if (!array_key_exists($id, $this->links)) {
                return [];
            }
            $metadata = $this->createMock(IFilesMetadata::class);
            $metadata->method('hasKey')->with('files-live-photo')->willReturn(true);
            $metadata->method('getString')->with('files-live-photo')->willReturn($this->links[$id]);

            return [$id => $metadata];
        });
        $this->resolver = new LivePhotoResolver($manager);
    }

    public function testStillAndVideoResolveToTheSamePair(): void
    {
        foreach ($this->files as $file) {
            $pair = $this->resolver->resolve($file, $this->userFolder);
            $this->assertSame($this->files[10], $pair->image);
            $this->assertSame($this->files[11], $pair->video);
        }
    }

    public function testOrdinaryFilesHaveNoPair(): void
    {
        $this->links = [];
        $this->assertNull($this->resolver->resolve($this->files[10], $this->userFolder));
    }

    /**
     * @dataProvider invalidLinks
     */
    public function testInvalidOrOneWayLinksAreNotOrdinaryFiles(array $links): void
    {
        $this->links = $links;
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->resolver->resolve($this->files[10], $this->userFolder);
    }

    public function invalidLinks(): array
    {
        return [
            'one-way' => [[10 => '11']],
            'self' => [[10 => '10']],
            'cycle' => [[10 => '11', 11 => '12']],
            'negative' => [[10 => '-11']],
            'not-an-id' => [[10 => 'another-file']],
            'overflow' => [[10 => '999999999999999999999999999999']],
        ];
    }

    public function testPeerInAnotherDirectoryIsRefused(): void
    {
        $image = $this->files[10];
        unset($this->files[11]);
        $this->expectException(LivePhotoPairProtectionException::class);
        $this->resolver->resolve($image, $this->userFolder);
    }

    public function testLinkToDeletedPeerIsAnOrdinaryFile(): void
    {
        unset($this->files[11], $this->existingFiles[11]);
        $this->assertNull($this->resolver->resolve($this->files[10], $this->userFolder));
    }
}
