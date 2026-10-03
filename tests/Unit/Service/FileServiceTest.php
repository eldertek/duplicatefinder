<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Deleting a file: which file is deleted (issue 177) and when the last copy of a group is kept (issue 180).
 */
class FileServiceTest extends TestCase
{
    private $folderService;
    private $originFolderService;
    private $fileInfoService;
    private $userFolder;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->folderService = $this->createMock(FolderService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->userFolder = $this->createMock(Folder::class);
        $this->folderService->method('getUserFolder')->with('alice')->willReturn($this->userFolder);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);

        $this->service = new FileService(
            $this->folderService,
            $this->originFolderService,
            $this->fileInfoService,
            $this->createMock(LoggerInterface::class)
        );
    }

    /**
     * A node that sits at $path in the folder of the current user.
     */
    private function node(string $path, int $id = 10): Node
    {
        $node = $this->createMock(Node::class);
        $node->method('getId')->willReturn($id);
        $node->method('getPath')->willReturn('/alice/files' . $path);
        $this->userFolder->method('getRelativePath')->willReturnCallback(function (string $full): ?string {
            return str_starts_with($full, '/alice/files') ? substr($full, strlen('/alice/files')) : null;
        });

        return $node;
    }

    public function testDeleteByPath(): void
    {
        $node = $this->node('/Photos/a.jpg');
        $this->userFolder->expects($this->once())->method('get')->with('/Photos/a.jpg')->willReturn($node);
        $node->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/a.jpg');
    }

    /**
     * Issue 177: the path of a file shared with the user is its path in the tree of the owner, the
     * user's own tree does not contain it. The node id finds the file whatever its path is.
     */
    public function testDeleteSharedFileByNodeId(): void
    {
        $node = $this->node('/Shared/b.jpg', 77);
        $this->userFolder->expects($this->never())->method('get');
        $this->userFolder->expects($this->once())->method('getById')->with(77)->willReturn([$node]);
        $node->expects($this->once())->method('delete');

        // '/Photos/b.jpg' is the path in the tree of the owner
        $this->service->deleteFile('alice', '/Photos/b.jpg', 77);
    }

    /**
     * The path of a share can also exist in the tree of the user, as another file: the node id decides.
     */
    public function testNodeIdWinsOverAPathThatMeansAnotherFile(): void
    {
        $shared = $this->node('/Shared/b.jpg', 77);
        $this->userFolder->expects($this->never())->method('get');
        $this->userFolder->method('getById')->with(77)->willReturn([$shared]);
        $shared->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/b.jpg', 77);
    }

    public function testDeleteByNodeIdPrefersTheNodeAtTheGivenPath(): void
    {
        $first = $this->node('/Other/c.jpg', 5);
        $second = $this->createMock(Node::class);
        $second->method('getId')->willReturn(5);
        $second->method('getPath')->willReturn('/alice/files/Photos/c.jpg');
        $this->userFolder->method('getById')->with(5)->willReturn([$first, $second]);
        $first->expects($this->never())->method('delete');
        $second->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/c.jpg', 5);
    }

    public function testUnknownNodeId(): void
    {
        $this->userFolder->method('getById')->with(404)->willReturn([]);

        $this->expectException(NotFoundException::class);

        $this->service->deleteFile('alice', '/Photos/gone.jpg', 404);
    }

    public function testProtectedPathIsNeverDeleted(): void
    {
        $originFolderService = $this->createMock(OriginFolderService::class);
        $originFolderService->method('isPathProtected')
            ->willReturn(['isProtected' => true, 'protectingFolder' => '/Originals']);
        $service = new FileService(
            $this->folderService,
            $originFolderService,
            $this->fileInfoService,
            $this->createMock(LoggerInterface::class)
        );
        $this->userFolder->expects($this->never())->method('get');

        $this->expectException(OriginFolderProtectionException::class);

        $service->deleteFile('alice', '/Originals/a.jpg');
    }

    /**
     * The node id may lead to a place the caller did not name: that place is checked too.
     */
    public function testPlaceFoundByNodeIdIsCheckedForProtection(): void
    {
        $originFolderService = $this->createMock(OriginFolderService::class);
        $originFolderService->method('isPathProtected')->willReturnCallback(function (string $path): array {
            $protected = $path === '/Originals/z.jpg';

            return ['isProtected' => $protected, 'protectingFolder' => $protected ? '/Originals' : null];
        });
        $service = new FileService(
            $this->folderService,
            $originFolderService,
            $this->fileInfoService,
            $this->createMock(LoggerInterface::class)
        );
        $node = $this->node('/Originals/z.jpg', 9);
        $this->userFolder->method('getById')->with(9)->willReturn([$node]);
        $node->expects($this->never())->method('delete');

        $this->expectException(OriginFolderProtectionException::class);

        $service->deleteFile('alice', '/Elsewhere/z.jpg', 9);
    }

    /**
     * Issue 180: the last copy of a group is never deleted behind the back of the user.
     */
    public function testLastCopyOfAGroupIsKept(): void
    {
        $node = $this->node('/Photos/a.jpg', 10);
        $this->userFolder->method('get')->with('/Photos/a.jpg')->willReturn($node);
        $this->fileInfoService->expects($this->once())
            ->method('hasOtherLiveCopy')
            ->with('hash-a', 10, 'alice')
            ->willReturn(false);
        $node->expects($this->never())->method('delete');

        $this->expectException(LastCopyProtectionException::class);

        $this->service->deleteFile('alice', '/Photos/a.jpg', null, 'hash-a');
    }

    public function testACopyIsDeletedWhenAnotherOneRemains(): void
    {
        $node = $this->node('/Photos/a.jpg', 10);
        $this->userFolder->method('get')->with('/Photos/a.jpg')->willReturn($node);
        $this->fileInfoService->expects($this->once())
            ->method('hasOtherLiveCopy')
            ->with('hash-a', 10, 'alice')
            ->willReturn(true);
        $node->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/a.jpg', null, 'hash-a');
    }

    public function testLastCopyCanBeDeletedWhenTheUserSaidSo(): void
    {
        $node = $this->node('/Photos/a.jpg', 10);
        $this->userFolder->method('get')->with('/Photos/a.jpg')->willReturn($node);
        $this->fileInfoService->expects($this->never())->method('hasOtherLiveCopy');
        $node->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/a.jpg', null, 'hash-a', true);
    }

    public function testNothingIsCheckedWhenTheCallerGivesNoHash(): void
    {
        $node = $this->node('/Photos/a.jpg', 10);
        $this->userFolder->method('get')->with('/Photos/a.jpg')->willReturn($node);
        $this->fileInfoService->expects($this->never())->method('hasOtherLiveCopy');
        $node->expects($this->once())->method('delete');

        $this->service->deleteFile('alice', '/Photos/a.jpg');
    }
}
