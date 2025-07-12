<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OC\User\NoUserException;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FolderServiceTeamFoldersTest extends TestCase
{
    private $folderService;
    private $rootFolder;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->folderService = new FolderService(
            $this->rootFolder,
            $this->logger
        );
    }

    /**
     * Test handling of Team Folders with non-existent system users
     * This tests the fix for issue #149
     */
    public function testGetNodeByFileInfoHandlesNoUserException()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/admin/files/TeamFolder/document.pdf');
        $fileInfo->setOwner('admin'); // System user that doesn't exist

        $mockNode = $this->createMock(Node::class);

        // First call to getUserFolder throws NoUserException
        $this->rootFolder->expects($this->at(0))
            ->method('getUserFolder')
            ->with('admin')
            ->willThrowException(new NoUserException('Backends provided no user object'));

        // Should fall back to root folder access
        $this->rootFolder->expects($this->at(1))
            ->method('get')
            ->with('/admin/files/TeamFolder/document.pdf')
            ->willReturn($mockNode);

        // Logger should log this as Team Folder detection
        $this->logger->expects($this->once())
            ->method('debug')
            ->with(
                $this->stringContains('Owner user does not exist, likely a Team/Group folder'),
                $this->containsEqual([
                    'owner' => 'admin',
                    'path' => '/admin/files/TeamFolder/document.pdf',
                    'fallbackUID' => null,
                ])
            );

        $result = $this->folderService->getNodeByFileInfo($fileInfo);

        $this->assertSame($mockNode, $result);
    }

    /**
     * Test fallback UID when primary owner doesn't exist
     */
    public function testGetNodeByFileInfoWithFallbackUID()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/admin/files/TeamFolder/file.txt');
        $fileInfo->setOwner('admin');

        $userFolder = $this->createMock(Folder::class);
        $mockNode = $this->createMock(Node::class);

        // First getUserFolder call fails
        $this->rootFolder->expects($this->at(0))
            ->method('getUserFolder')
            ->with('admin')
            ->willThrowException(new NoUserException());

        // Second call with fallback UID succeeds
        $this->rootFolder->expects($this->at(1))
            ->method('getUserFolder')
            ->with('realuser')
            ->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->willReturn($mockNode);

        $result = $this->folderService->getNodeByFileInfo($fileInfo, 'realuser');

        $this->assertSame($mockNode, $result);
        $this->assertEquals('realuser', $fileInfo->getOwner());
    }

    /**
     * Test when both owner and fallback UID don't exist
     */
    public function testGetNodeByFileInfoBothUsersDontExist()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/system/files/shared/file.txt');
        $fileInfo->setOwner('system');

        $mockNode = $this->createMock(Node::class);

        // Both getUserFolder calls fail
        $this->rootFolder->expects($this->exactly(2))
            ->method('getUserFolder')
            ->willThrowException(new NoUserException());

        // Should fall back to root folder
        $this->rootFolder->expects($this->once())
            ->method('get')
            ->with('/system/files/shared/file.txt')
            ->willReturn($mockNode);

        $result = $this->folderService->getNodeByFileInfo($fileInfo, 'anotheruser');

        $this->assertSame($mockNode, $result);
    }

    /**
     * Test normal user folder access (no Team Folders)
     */
    public function testGetNodeByFileInfoNormalUser()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/normaluser/files/Documents/file.txt');
        $fileInfo->setOwner('normaluser');

        $userFolder = $this->createMock(Folder::class);
        $mockNode = $this->createMock(Node::class);

        $this->rootFolder->expects($this->once())
            ->method('getUserFolder')
            ->with('normaluser')
            ->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->with('Documents/file.txt')
            ->willReturn($mockNode);

        // No debug logging should occur for normal users
        $this->logger->expects($this->never())
            ->method('debug');

        $result = $this->folderService->getNodeByFileInfo($fileInfo);

        $this->assertSame($mockNode, $result);
    }
}
