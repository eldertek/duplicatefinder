<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ExcludedFolderServiceTest extends TestCase
{
    /** @var ExcludedFolderService */
    private $service;

    /** @var ExcludedFolderMapper|MockObject */
    private $mapper;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    /** @var LoggerInterface|MockObject */
    private $logger;

    private string $userId = 'testuser';

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(ExcludedFolderMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new ExcludedFolderService(
            $this->mapper,
            $this->rootFolder,
            $this->userId,
            $this->logger
        );
    }

    public function testCreateExcludedFolder(): void
    {
        $path = '/Photos/Private';
        $userFolder = $this->createMock(Folder::class);
        $targetFolder = $this->createMock(Folder::class);
        $targetFolder->method('getId')->willReturn(77);

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
            ->willReturnCallback(function (ExcludedFolder $folder) use ($path): ExcludedFolder {
                $this->assertSame($this->userId, $folder->getUserId());
                $this->assertSame($path, $folder->getFolderPath());
                $folder->setId(1);

                return $folder;
            });

        $result = $this->service->create('Photos/Private/');

        $this->assertInstanceOf(ExcludedFolder::class, $result);
        $this->assertSame($path, $result->getFolderPath());
    }

    public function testCreateNonExistentFolderThrowsRuntimeException(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $this->rootFolder->expects($this->once())->method('getUserFolder')->willReturn($userFolder);
        $userFolder->expects($this->once())
            ->method('get')
            ->with('/NonExistent')
            ->willThrowException(new NotFoundException());

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Folder does not exist: /NonExistent');
        $this->service->create('/NonExistent');
    }

    public function testIsPathExcludedMatchesSubtreesOnlyAndNormalizesUserPrefix(): void
    {
        $excludedFolder1 = new ExcludedFolder();
        $excludedFolder1->setFolderPath('/Photos/Private');
        $excludedFolder1->setUserId($this->userId);

        $excludedFolder2 = new ExcludedFolder();
        $excludedFolder2->setFolderPath('/Documents/Secret');
        $excludedFolder2->setUserId($this->userId);

        $this->mapper->expects($this->once())
            ->method('findAllForUser')
            ->with($this->userId)
            ->willReturn([$excludedFolder1, $excludedFolder2]);

        $this->assertTrue($this->service->isPathExcluded('/testuser/files/Photos/Private/vacation.jpg'));
        $this->assertTrue($this->service->isPathExcluded('/Documents/Secret/file.doc'));
        $this->assertFalse($this->service->isPathExcluded('/Photos/PrivateCopy/photo.jpg'));
        $this->assertFalse($this->service->isPathExcluded('/Documents/Public/file.doc'));
    }

    public function testFindAll(): void
    {
        $folder1 = new ExcludedFolder();
        $folder1->setFolderPath('/Path1');
        $folder2 = new ExcludedFolder();
        $folder2->setFolderPath('/Path2');

        $this->mapper->expects($this->once())
            ->method('findAllForUser')
            ->with($this->userId)
            ->willReturn([$folder1, $folder2]);

        $result = $this->service->findAll();

        $this->assertCount(2, $result);
        $this->assertSame('/Path1', $result[0]->getFolderPath());
        $this->assertSame('/Path2', $result[1]->getFolderPath());
    }

    public function testDeleteCallsMapperAndThrowsWhenMissing(): void
    {
        $folder = new ExcludedFolder();
        $folder->setId(123);
        $folder->setFolderPath('/Photos/Private');
        $folder->setUserId($this->userId);

        $this->mapper->expects($this->exactly(2))
            ->method('findByIdAndUser')
            ->withConsecutive([123, $this->userId], [999, $this->userId])
            ->willReturnOnConsecutiveCalls(
                $folder,
                $this->throwException(new DoesNotExistException('missing'))
            );

        $this->mapper->expects($this->once())->method('delete')->with($folder);

        $this->service->delete(123);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Excluded folder not found');
        $this->service->delete(999);
    }

    public function testCachingAndInvalidationOnCreate(): void
    {
        $oldFolder = new ExcludedFolder();
        $oldFolder->setFolderPath('/OldPath');

        $newFolder = new ExcludedFolder();
        $newFolder->setFolderPath('/NewPath');
        $newFolder->setCreatedAt(new \DateTime());

        $this->mapper->expects($this->exactly(2))
            ->method('findAllForUser')
            ->with($this->userId)
            ->willReturnOnConsecutiveCalls(
                [$oldFolder],
                [$oldFolder, $newFolder]
            );

        $this->assertTrue($this->service->isPathExcluded('/OldPath/file1.txt'));
        $this->assertFalse($this->service->isPathExcluded('/NewPath/file2.txt'));

        $userFolder = $this->createMock(Folder::class);
        $targetFolder = $this->createMock(Folder::class);
        $targetFolder->method('getId')->willReturn(55);
        $this->rootFolder->method('getUserFolder')->willReturn($userFolder);
        $userFolder->method('get')->willReturn($targetFolder);
        $this->mapper->method('insert')->willReturn($newFolder);

        $this->service->create('/NewPath');

        $this->assertTrue($this->service->isPathExcluded('/NewPath/file2.txt'));
    }
}
