<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ExcludedFolderServiceTest extends TestCase
{
    /** @var ExcludedFolderService */
    private $service;

    /** @var ExcludedFolderMapper|MockObject */
    private $mapper;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    private $userId = 'testuser';

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(ExcludedFolderMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);

        $this->service = new ExcludedFolderService(
            $this->mapper,
            $this->rootFolder,
            $this->userId
        );
    }

    /**
     * Test adding an excluded folder
     */
    public function testAddExcludedFolder(): void
    {
        $path = '/Photos/Private';

        $userFolder = $this->createMock(Folder::class);
        $targetFolder = $this->createMock(Folder::class);

        $this->rootFolder->expects($this->once())
            ->method('getUserFolder')
            ->with($this->userId)
            ->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->with($path)
            ->willReturn($targetFolder);

        $this->mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function ($folder) use ($path) {
                $this->assertEquals($this->userId, $folder->getOwner());
                $this->assertEquals($path, $folder->getPath());
                $folder->setId(1);

                return $folder;
            });

        $result = $this->service->add($path);

        $this->assertInstanceOf(ExcludedFolder::class, $result);
        $this->assertEquals($path, $result->getPath());
    }

    /**
     * Test adding non-existent folder throws exception
     */
    public function testAddNonExistentFolderThrowsException(): void
    {
        $path = '/NonExistent';

        $userFolder = $this->createMock(Folder::class);

        $this->rootFolder->expects($this->once())
            ->method('getUserFolder')
            ->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->with($path)
            ->willThrowException(new NotFoundException());

        $this->expectException(NotFoundException::class);

        $this->service->add($path);
    }

    /**
     * Test checking if path is excluded
     */
    public function testIsPathExcluded(): void
    {
        $excludedFolder1 = new ExcludedFolder();
        $excludedFolder1->setPath('/Photos/Private');
        $excludedFolder1->setOwner($this->userId);

        $excludedFolder2 = new ExcludedFolder();
        $excludedFolder2->setPath('/Documents/Secret');
        $excludedFolder2->setOwner($this->userId);

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with($this->userId)
            ->willReturn([$excludedFolder1, $excludedFolder2]);

        // Test excluded paths
        $this->assertTrue($this->service->isPathExcluded('/Photos/Private/vacation.jpg'));
        $this->assertTrue($this->service->isPathExcluded('/Photos/Private/subfolder/photo.jpg'));
        $this->assertTrue($this->service->isPathExcluded('/Documents/Secret/file.doc'));

        // Test non-excluded paths
        $this->assertFalse($this->service->isPathExcluded('/Photos/Public/photo.jpg'));
        $this->assertFalse($this->service->isPathExcluded('/Documents/Public/file.doc'));
        $this->assertFalse($this->service->isPathExcluded('/Music/song.mp3'));
    }

    /**
     * Test getting all excluded folders
     */
    public function testFindAll(): void
    {
        $folder1 = new ExcludedFolder();
        $folder1->setPath('/Path1');

        $folder2 = new ExcludedFolder();
        $folder2->setPath('/Path2');

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with($this->userId)
            ->willReturn([$folder1, $folder2]);

        $result = $this->service->findAll();

        $this->assertCount(2, $result);
        $this->assertEquals('/Path1', $result[0]->getPath());
        $this->assertEquals('/Path2', $result[1]->getPath());
    }

    /**
     * Test deleting excluded folder
     */
    public function testDelete(): void
    {
        $folder = new ExcludedFolder();
        $folder->setId(123);
        $folder->setOwner($this->userId);

        $this->mapper->expects($this->once())
            ->method('find')
            ->with(123, $this->userId)
            ->willReturn($folder);

        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($folder)
            ->willReturn($folder);

        $result = $this->service->delete(123);

        $this->assertSame($folder, $result);
    }

    /**
     * Test caching of excluded folders
     */
    public function testCachingOfExcludedFolders(): void
    {
        $folder = new ExcludedFolder();
        $folder->setPath('/Cached');

        // Mapper should only be called once due to caching
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->willReturn([$folder]);

        // Call multiple times
        $this->service->isPathExcluded('/Cached/file1.txt');
        $this->service->isPathExcluded('/Cached/file2.txt');
        $this->service->isPathExcluded('/Other/file.txt');

        // Cache should be used for subsequent calls
    }

    /**
     * Test cache invalidation on add
     */
    public function testCacheInvalidationOnAdd(): void
    {
        $folder = new ExcludedFolder();
        $folder->setPath('/OldPath');

        // First call loads cache
        $this->mapper->expects($this->exactly(2))
            ->method('findAll')
            ->willReturnOnConsecutiveCalls(
                [$folder], // First call
                [$folder, new ExcludedFolder()] // After add
            );

        $this->service->isPathExcluded('/Test');

        // Add new folder should invalidate cache
        $userFolder = $this->createMock(Folder::class);
        $this->rootFolder->method('getUserFolder')->willReturn($userFolder);
        $userFolder->method('get')->willReturn($this->createMock(Folder::class));
        $this->mapper->method('insert')->willReturn(new ExcludedFolder());

        $this->service->add('/NewPath');

        // Next call should reload from database
        $this->service->isPathExcluded('/Test');
    }
}
