<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Service\ShareService;
use OCP\Files\File;
use OCP\IUser;
use OCP\Share\IManager as IShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ShareServiceTest extends TestCase
{
    /** @var ShareService */
    private $service;

    /** @var IShareManager|MockObject */
    private $shareManager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->shareManager = $this->createMock(IShareManager::class);

        $this->service = new ShareService(
            $this->shareManager
        );
    }

    /**
     * Test checking if file is shared
     */
    public function testIsFileShared(): void
    {
        $node = $this->createMock(File::class);
        $share = $this->createMock(IShare::class);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$share]);

        $result = $this->service->isFileShared($node);

        $this->assertTrue($result);
    }

    /**
     * Test file not shared
     */
    public function testFileNotShared(): void
    {
        $node = $this->createMock(File::class);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([]);

        $result = $this->service->isFileShared($node);

        $this->assertFalse($result);
    }

    /**
     * Test getting share recipients
     */
    public function testGetShareRecipients(): void
    {
        $node = $this->createMock(File::class);

        $user1 = $this->createMock(IUser::class);
        $user1->method('getUID')->willReturn('user1');
        $user1->method('getDisplayName')->willReturn('User One');

        $user2 = $this->createMock(IUser::class);
        $user2->method('getUID')->willReturn('user2');
        $user2->method('getDisplayName')->willReturn('User Two');

        $share1 = $this->createMock(IShare::class);
        $share1->method('getShareType')->willReturn(IShare::TYPE_USER);
        $share1->method('getSharedWith')->willReturn('user1');

        $share2 = $this->createMock(IShare::class);
        $share2->method('getShareType')->willReturn(IShare::TYPE_USER);
        $share2->method('getSharedWith')->willReturn('user2');

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$share1, $share2]);

        $recipients = $this->service->getShareRecipients($node);

        $this->assertCount(2, $recipients);
        $this->assertContains('user1', $recipients);
        $this->assertContains('user2', $recipients);
    }

    /**
     * Test share types
     */
    public function testShareTypes(): void
    {
        $node = $this->createMock(File::class);

        $userShare = $this->createMock(IShare::class);
        $userShare->method('getShareType')->willReturn(IShare::TYPE_USER);

        $groupShare = $this->createMock(IShare::class);
        $groupShare->method('getShareType')->willReturn(IShare::TYPE_GROUP);

        $linkShare = $this->createMock(IShare::class);
        $linkShare->method('getShareType')->willReturn(IShare::TYPE_LINK);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$userShare, $groupShare, $linkShare]);

        $shareTypes = $this->service->getShareTypes($node);

        $this->assertContains(IShare::TYPE_USER, $shareTypes);
        $this->assertContains(IShare::TYPE_GROUP, $shareTypes);
        $this->assertContains(IShare::TYPE_LINK, $shareTypes);
    }

    /**
     * Test checking for public link shares
     */
    public function testHasPublicLink(): void
    {
        $node = $this->createMock(File::class);

        $linkShare = $this->createMock(IShare::class);
        $linkShare->method('getShareType')->willReturn(IShare::TYPE_LINK);
        $linkShare->method('getPassword')->willReturn(null);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$linkShare]);

        $result = $this->service->hasPublicLink($node);

        $this->assertTrue($result);
    }

    /**
     * Test counting shares
     */
    public function testCountShares(): void
    {
        $node = $this->createMock(File::class);

        $shares = [
            $this->createMock(IShare::class),
            $this->createMock(IShare::class),
            $this->createMock(IShare::class),
        ];

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn($shares);

        $count = $this->service->countShares($node);

        $this->assertEquals(3, $count);
    }

    /**
     * Test getting share permissions
     */
    public function testGetSharePermissions(): void
    {
        $node = $this->createMock(File::class);

        $share = $this->createMock(IShare::class);
        $share->method('getPermissions')->willReturn(
            \OCP\Constants::PERMISSION_READ |
            \OCP\Constants::PERMISSION_UPDATE
        );

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$share]);

        $permissions = $this->service->getSharePermissions($node);

        $this->assertTrue(($permissions[0] & \OCP\Constants::PERMISSION_READ) !== 0);
        $this->assertTrue(($permissions[0] & \OCP\Constants::PERMISSION_UPDATE) !== 0);
        $this->assertFalse(($permissions[0] & \OCP\Constants::PERMISSION_DELETE) !== 0);
    }

    /**
     * Test shared with specific user
     */
    public function testIsSharedWithUser(): void
    {
        $node = $this->createMock(File::class);
        $userId = 'targetuser';

        $share = $this->createMock(IShare::class);
        $share->method('getShareType')->willReturn(IShare::TYPE_USER);
        $share->method('getSharedWith')->willReturn($userId);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$share]);

        $result = $this->service->isSharedWithUser($node, $userId);

        $this->assertTrue($result);

        // Test with different user
        $result = $this->service->isSharedWithUser($node, 'otheruser');
        $this->assertFalse($result);
    }

    /**
     * Test share expiration
     */
    public function testShareExpiration(): void
    {
        $node = $this->createMock(File::class);

        $expiredShare = $this->createMock(IShare::class);
        $expiredShare->method('getExpirationDate')
            ->willReturn(new \DateTime('-1 day'));

        $validShare = $this->createMock(IShare::class);
        $validShare->method('getExpirationDate')
            ->willReturn(new \DateTime('+1 day'));

        $noExpirationShare = $this->createMock(IShare::class);
        $noExpirationShare->method('getExpirationDate')
            ->willReturn(null);

        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($node)
            ->willReturn([$expiredShare, $validShare, $noExpirationShare]);

        $activeShares = $this->service->getActiveShares($node);

        // Should only return non-expired shares
        $this->assertCount(2, $activeShares);
    }

    /**
     * Test bulk share checking
     */
    public function testBulkShareCheck(): void
    {
        $file1 = $this->createMock(File::class);
        $file2 = $this->createMock(File::class);
        $file3 = $this->createMock(File::class);

        $this->shareManager->expects($this->exactly(3))
            ->method('getSharesByNode')
            ->willReturnMap([
                [$file1, [$this->createMock(IShare::class)]],
                [$file2, []],
                [$file3, [$this->createMock(IShare::class), $this->createMock(IShare::class)]],
            ]);

        $files = [$file1, $file2, $file3];
        $sharedFiles = [];

        foreach ($files as $file) {
            if ($this->service->isFileShared($file)) {
                $sharedFiles[] = $file;
            }
        }

        $this->assertCount(2, $sharedFiles);
        $this->assertContains($file1, $sharedFiles);
        $this->assertContains($file3, $sharedFiles);
    }
}
