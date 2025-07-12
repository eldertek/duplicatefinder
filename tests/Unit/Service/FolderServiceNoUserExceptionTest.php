<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OC\User\NoUserException;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test for Issue #149: Team Folders compatibility
 */
class FolderServiceNoUserExceptionTest extends TestCase
{
    /** @var FolderService */
    private $service;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new FolderService(
            $this->rootFolder,
            $this->logger
        );
    }

    /**
     * Test that NoUserException is handled gracefully for Team Folders
     */
    public function testGetNodeByFileInfoHandlesNoUserException(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/admin/files/teamfolder/test.txt');
        $fileInfo->setOwner('admin'); // System user that doesn't exist

        // Simulate NoUserException when trying to get user folder
        $this->rootFolder->expects($this->once())
            ->method('getUserFolder')
            ->with('admin')
            ->willThrowException(new NoUserException('Backends provided no user object'));

        // Logger should log the issue
        $this->logger->expects($this->once())
            ->method('debug')
            ->with(
                $this->stringContains('likely a Team/Group folder'),
                $this->arrayHasKey('owner')
            );

        // Should return null without throwing exception
        $result = $this->service->getNodeByFileInfo($fileInfo);
        $this->assertNull($result);
    }

    /**
     * Test fallback to alternative UID when primary owner doesn't exist
     */
    public function testGetNodeByFileInfoFallbackUID(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/admin/files/teamfolder/test.txt');
        $fileInfo->setOwner('admin');

        $fallbackUID = 'realuser';

        // First call throws NoUserException
        $this->rootFolder->expects($this->exactly(2))
            ->method('getUserFolder')
            ->withConsecutive(['admin'], [$fallbackUID])
            ->willReturnOnConsecutiveCalls(
                $this->throwException(new NoUserException('No user object')),
                $this->createMock(Folder::class)
            );

        $result = $this->service->getNodeByFileInfo($fileInfo, $fallbackUID);

        // Should have updated the owner to fallback UID
        $this->assertEquals($fallbackUID, $fileInfo->getOwner());
    }

    /**
     * Test that normal files work as expected
     */
    public function testGetNodeByFileInfoNormalUser(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/user/files/normal/file.txt');
        $fileInfo->setOwner('user');

        $userFolder = $this->createMock(Folder::class);
        $node = $this->createMock(Node::class);

        $this->rootFolder->expects($this->once())
            ->method('getUserFolder')
            ->with('user')
            ->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->with('normal/file.txt')
            ->willReturn($node);

        $result = $this->service->getNodeByFileInfo($fileInfo);

        $this->assertSame($node, $result);
    }

    /**
     * Test both owner and fallback UID don't exist
     */
    public function testGetNodeByFileInfoBothUsersDontExist(): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/admin/files/teamfolder/test.txt');
        $fileInfo->setOwner('admin');

        $fallbackUID = 'alsonotexist';

        // Both calls throw NoUserException
        $this->rootFolder->expects($this->exactly(2))
            ->method('getUserFolder')
            ->withConsecutive(['admin'], [$fallbackUID])
            ->willThrowException(new NoUserException('No user object'));

        // Should log twice
        $this->logger->expects($this->once())
            ->method('debug')
            ->with($this->stringContains('likely a Team/Group folder'));

        $result = $this->service->getNodeByFileInfo($fileInfo, $fallbackUID);

        // Should return null without throwing
        $this->assertNull($result);
    }
}
