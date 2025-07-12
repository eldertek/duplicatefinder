<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Db\OriginFolderMapper;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\IUser;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class OriginFolderServiceTest extends TestCase
{
    /** @var OriginFolderService */
    private $service;

    /** @var OriginFolderMapper|MockObject */
    private $mapper;

    /** @var ConfigService|MockObject */
    private $configService;

    /** @var IUser|MockObject */
    private $user;

    private $userId = 'testuser';

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(OriginFolderMapper::class);
        $this->configService = $this->createMock(ConfigService::class);
        $this->user = $this->createMock(IUser::class);
        $this->user->method('getUID')->willReturn($this->userId);

        $this->service = new OriginFolderService(
            $this->mapper,
            $this->configService,
            $this->user
        );
    }

    /**
     * Test adding an origin folder
     */
    public function testAddOriginFolder(): void
    {
        $path = '/Photos/Originals';

        $this->mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function ($folder) use ($path) {
                $this->assertEquals($this->userId, $folder->getUserId());
                $this->assertEquals($path, $folder->getPath());
                $folder->setId(1);

                return $folder;
            });

        $result = $this->service->add($path);

        $this->assertInstanceOf(OriginFolder::class, $result);
        $this->assertEquals($path, $result->getPath());
        $this->assertEquals($this->userId, $result->getUserId());
    }

    /**
     * Test checking if path is in origin folder
     */
    public function testIsPathInOriginFolder(): void
    {
        $origin1 = new OriginFolder();
        $origin1->setPath('/Photos/Originals');
        $origin1->setUserId($this->userId);

        $origin2 = new OriginFolder();
        $origin2->setPath('/Documents/Masters');
        $origin2->setUserId($this->userId);

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with($this->userId)
            ->willReturn([$origin1, $origin2]);

        // Test paths in origin folders
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals/vacation.jpg'));
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals/subfolder/photo.jpg'));
        $this->assertTrue($this->service->isPathInOriginFolder('/Documents/Masters/document.doc'));

        // Test paths not in origin folders
        $this->assertFalse($this->service->isPathInOriginFolder('/Photos/Copies/photo.jpg'));
        $this->assertFalse($this->service->isPathInOriginFolder('/Downloads/file.pdf'));

        // Test exact match
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals'));
    }

    /**
     * Test finding all origin folders
     */
    public function testFindAll(): void
    {
        $folder1 = new OriginFolder();
        $folder1->setPath('/Path1');
        $folder1->setUserId($this->userId);

        $folder2 = new OriginFolder();
        $folder2->setPath('/Path2');
        $folder2->setUserId($this->userId);

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
     * Test deleting origin folder
     */
    public function testDelete(): void
    {
        $folderId = 123;

        $folder = new OriginFolder();
        $folder->setId($folderId);
        $folder->setUserId($this->userId);

        $this->mapper->expects($this->once())
            ->method('find')
            ->with($folderId, $this->userId)
            ->willReturn($folder);

        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($folder)
            ->willReturn($folder);

        $result = $this->service->delete($folderId);

        $this->assertSame($folder, $result);
    }

    /**
     * Test caching of origin folders
     */
    public function testCachingOfOriginFolders(): void
    {
        $folder = new OriginFolder();
        $folder->setPath('/Cached');
        $folder->setUserId($this->userId);

        // Mapper should only be called once due to caching
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->willReturn([$folder]);

        // Call multiple times
        $this->service->isPathInOriginFolder('/Cached/file1.txt');
        $this->service->isPathInOriginFolder('/Cached/file2.txt');
        $this->service->isPathInOriginFolder('/Other/file.txt');

        // Cache should be used for subsequent calls
    }

    /**
     * Test cache invalidation on add
     */
    public function testCacheInvalidationOnAdd(): void
    {
        $folder = new OriginFolder();
        $folder->setPath('/OldPath');
        $folder->setUserId($this->userId);

        // First call loads cache
        $this->mapper->expects($this->exactly(2))
            ->method('findAll')
            ->willReturnOnConsecutiveCalls(
                [$folder], // First call
                [$folder, new OriginFolder()] // After add
            );

        $this->service->isPathInOriginFolder('/Test');

        // Add new folder should invalidate cache
        $this->mapper->method('insert')->willReturn(new OriginFolder());

        $this->service->add('/NewPath');

        // Next call should reload from database
        $this->service->isPathInOriginFolder('/Test');
    }

    /**
     * Test bulk delete protection
     */
    public function testBulkDeleteProtection(): void
    {
        $origin = new OriginFolder();
        $origin->setPath('/Photos/Originals');
        $origin->setUserId($this->userId);

        $this->mapper->method('findAll')->willReturn([$origin]);

        // Files to check for protection
        $protectedFile = '/Photos/Originals/important.jpg';
        $unprotectedFile = '/Photos/Copies/copy.jpg';

        $filesToDelete = [
            $protectedFile,
            $unprotectedFile,
        ];

        $protectedFiles = array_filter($filesToDelete, function ($path) {
            return $this->service->isPathInOriginFolder($path);
        });

        $this->assertCount(1, $protectedFiles);
        $this->assertContains($protectedFile, $protectedFiles);
        $this->assertNotContains($unprotectedFile, $protectedFiles);
    }

    /**
     * Test origin folder with trailing slash
     */
    public function testOriginFolderWithTrailingSlash(): void
    {
        $origin = new OriginFolder();
        $origin->setPath('/Photos/Originals/');
        $origin->setUserId($this->userId);

        $this->mapper->method('findAll')->willReturn([$origin]);

        // Should match files regardless of trailing slash
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals/photo.jpg'));
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals/subfolder/photo.jpg'));
    }

    /**
     * Test case sensitivity
     */
    public function testCaseSensitivity(): void
    {
        $origin = new OriginFolder();
        $origin->setPath('/Photos/Originals');
        $origin->setUserId($this->userId);

        $this->mapper->method('findAll')->willReturn([$origin]);

        // Path matching should be case-sensitive
        $this->assertTrue($this->service->isPathInOriginFolder('/Photos/Originals/photo.jpg'));
        $this->assertFalse($this->service->isPathInOriginFolder('/photos/originals/photo.jpg'));
        $this->assertFalse($this->service->isPathInOriginFolder('/PHOTOS/ORIGINALS/photo.jpg'));
    }
}
