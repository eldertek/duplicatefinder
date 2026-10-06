<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ExcludedFolderServiceCacheTest extends TestCase
{
    private $mapper;
    private $rootFolder;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(ExcludedFolderMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->service = new ExcludedFolderService(
            $this->mapper,
            $this->rootFolder,
            null,
            $this->createMock(LoggerInterface::class)
        );
    }

    private function excludedFolder(string $path): ExcludedFolder
    {
        $folder = new ExcludedFolder();
        $folder->setFolderPath($path);

        return $folder;
    }

    public function testExcludedFoldersAreLoadedOncePerUser(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('findAllForUser')
            ->willReturnMap([
                ['alice', [$this->excludedFolder('/Private')]],
                ['bob', []],
            ]);

        $this->service->setUserId('alice');
        $this->assertTrue($this->service->isPathExcluded('/alice/files/Private/a.jpg'));
        $this->assertFalse($this->service->isPathExcluded('/alice/files/Public/b.jpg'));
        $this->service->setUserId('bob');
        $this->assertFalse($this->service->isPathExcluded('/bob/files/Private/c.jpg'));
        $this->service->setUserId('alice');
        $this->assertTrue($this->service->isPathExcluded('/alice/files/Private/d.jpg'));
    }

    public function testCreateInvalidatesTheCache(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('findAllForUser')
            ->willReturnOnConsecutiveCalls([], [$this->excludedFolder('/Private')]);
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('get')->willReturn($this->createMock(Folder::class));
        $this->rootFolder->method('getUserFolder')->willReturn($userFolder);
        $this->mapper->method('insert')->willReturnArgument(0);

        $this->service->setUserId('alice');
        $this->assertFalse($this->service->isPathExcluded('/alice/files/Private/a.jpg'));
        $this->service->create('/Private');
        $this->assertTrue($this->service->isPathExcluded('/alice/files/Private/a.jpg'));
    }

    public function testResetCacheReloads(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('findAllForUser')
            ->willReturn([]);

        $this->service->setUserId('alice');
        $this->service->isPathExcluded('/alice/files/a.jpg');
        $this->service->isPathExcluded('/alice/files/b.jpg');
        $this->service->resetCache();
        $this->service->isPathExcluded('/alice/files/c.jpg');
    }
}
