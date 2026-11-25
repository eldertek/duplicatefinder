<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Db\OriginFolderMapper;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class OriginFolderServiceTest extends TestCase
{
    /** @var OriginFolderService */
    private $service;

    /** @var OriginFolderMapper|MockObject */
    private $mapper;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    /** @var LoggerInterface|MockObject */
    private $logger;

    private string $userId = 'testuser';

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(OriginFolderMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new OriginFolderService(
            $this->mapper,
            $this->rootFolder,
            $this->userId,
            $this->logger
        );
    }

    public function testCreateOriginFolderWhenFolderExistsAndNotYetProtected(): void
    {
        $path = '/Photos/Originals';
        $userFolder = $this->createMock(Folder::class);
        $userFolder->expects($this->once())->method('nodeExists')->with($path)->willReturn(true);
        $this->rootFolder->expects($this->once())->method('getUserFolder')->with($this->userId)->willReturn($userFolder);
        $this->mapper->expects($this->once())->method('exists')->with($this->userId, $path)->willReturn(false);

        $this->mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function (OriginFolder $folder) use ($path): OriginFolder {
                $this->assertSame($this->userId, $folder->getUserId());
                $this->assertSame($path, $folder->getFolderPath());
                $folder->setId(1);

                return $folder;
            });

        $result = $this->service->create($path);

        $this->assertSame(1, $result->getId());
        $this->assertSame($path, $result->getFolderPath());
    }

    public function testCreateThrowsNotFoundWhenFolderDoesNotExist(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('nodeExists')->with('/Missing')->willReturn(false);
        $this->rootFolder->method('getUserFolder')->with($this->userId)->willReturn($userFolder);

        $this->expectException(NotFoundException::class);
        $this->service->create('/Missing');
    }

    public function testCreateThrowsWhenOriginFolderAlreadyExists(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('nodeExists')->with('/Photos')->willReturn(true);
        $this->rootFolder->method('getUserFolder')->with($this->userId)->willReturn($userFolder);
        $this->mapper->method('exists')->with($this->userId, '/Photos')->willReturn(true);

        $this->expectException(\Exception::class);
        $this->expectExceptionMessage('Folder is already an origin folder: /Photos');
        $this->service->create('/Photos');
    }

    public function testIsPathProtectedAndAssertNotProtected(): void
    {
        $origin1 = new OriginFolder();
        $origin1->setFolderPath('/Photos/Originals');
        $origin1->setUserId($this->userId);

        $origin2 = new OriginFolder();
        $origin2->setFolderPath('/Documents/Masters');
        $origin2->setUserId($this->userId);

        $this->mapper->method('findAll')->with($this->userId)->willReturn([$origin1, $origin2]);

        $exact = $this->service->isPathProtected('/Photos/Originals');
        $this->assertTrue($exact['isProtected']);
        $this->assertSame('/Photos/Originals', $exact['protectingFolder']);

        $child = $this->service->isPathProtected('/Documents/Masters/2026/contract.pdf');
        $this->assertTrue($child['isProtected']);
        $this->assertSame('/Documents/Masters', $child['protectingFolder']);

        $unprotected = $this->service->isPathProtected('/Photos/OriginalsCopy/img.jpg');
        $this->assertFalse($unprotected['isProtected']);
        $this->assertNull($unprotected['protectingFolder']);

        $this->expectException(OriginFolderProtectionException::class);
        $this->service->assertNotProtected('/Photos/Originals/img.jpg');
    }

    public function testDeleteRejectsOtherUsersOriginFolder(): void
    {
        $other = new OriginFolder();
        $other->setId(5);
        $other->setUserId('otheruser');
        $this->mapper->method('find')->with(5)->willReturn($other);

        $this->expectException(DoesNotExistException::class);
        $this->service->delete(5);
    }

    public function testMissingUserContextThrowsRuntimeException(): void
    {
        $this->service->setUserId(null);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('User context required for this operation');
        $this->service->findAll();
    }
}
