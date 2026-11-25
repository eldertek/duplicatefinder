<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Service\ShareService;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IUserManager;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ShareServiceTest extends TestCase
{
    /** @var ShareService */
    private $service;

    /** @var IRootFolder|MockObject */
    private $rootFolder;

    /** @var IManager|MockObject */
    private $shareManager;

    /** @var LoggerInterface|MockObject */
    private $logger;

    /** @var IUserManager|MockObject */
    private $userManager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->shareManager = $this->createMock(IManager::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->userManager = $this->createMock(IUserManager::class);

        $this->service = new ShareService(
            $this->rootFolder,
            $this->shareManager,
            $this->logger,
            $this->userManager
        );
    }

    public function testGetSharesSkipsRoomSharesAndHonorsLimit(): void
    {
        $userShare = $this->createMock(IShare::class);
        $roomShare = $this->createMock(IShare::class);

        $this->shareManager->method('getSharedWith')
            ->willReturnCallback(function (string $user, int $type) use ($userShare, $roomShare): array {
                if ($type === IShare::TYPE_USER) {
                    return [$userShare];
                }
                if ($type === IShare::TYPE_ROOM) {
                    return [$roomShare];
                }

                return [];
            });

        $shares = $this->service->getShares('bob', null, 1);

        $this->assertSame([$userShare], $shares);
    }

    public function testGetSharesLogsThrowableAndContinues(): void
    {
        $groupShare = $this->createMock(IShare::class);

        $this->shareManager->method('getSharedWith')
            ->willReturnCallback(function (string $user, int $type) use ($groupShare): array {
                if ($type === IShare::TYPE_USER) {
                    throw new \RuntimeException('Share backend error');
                }
                if ($type === IShare::TYPE_GROUP) {
                    return [$groupShare];
                }

                return [];
            });

        $this->logger->expects($this->once())->method('error');

        $shares = $this->service->getShares('bob');
        $this->assertSame([$groupShare], $shares);
    }

    public function testHasAccessRightConvertsFileSharePathForValidRecipient(): void
    {
        $sharedNode = $this->createMock(Node::class);
        $share = $this->createMock(IShare::class);
        $share->method('getSharedWith')->willReturn('bob');
        $share->method('getShareType')->willReturn(IShare::TYPE_USER);
        $share->method('getNodeType')->willReturn('file');
        $share->method('getTarget')->willReturn('/Shared/budget.xlsx');

        $this->shareManager->method('getAccessList')
            ->with($sharedNode, true, true)
            ->willReturn(['users' => ['bob' => true]]);
        $this->shareManager->method('getSharedWith')
            ->willReturnCallback(function (string $user, int $type) use ($share): array {
                return $type === IShare::TYPE_USER ? [$share] : [];
            });

        $this->userManager->method('userExists')->with('bob')->willReturn(true);

        $ownerFolder = $this->createMock(Folder::class);
        $bobFolder = $this->createMock(Folder::class);
        $bobFolder->method('getPath')->willReturn('/bob/files');
        $this->rootFolder->method('getUserFolder')
            ->willReturnMap([
                ['bob', $ownerFolder],
            ]);
        // Second call in PathConversionUtils::convertSharedPath gets recipient folder
        $rootFolder = $this->createMock(IRootFolder::class);
        $rootFolder->method('getUserFolder')->willReturn($bobFolder);

        $service = new ShareService($rootFolder, $this->shareManager, $this->logger, $this->userManager);
        $resolved = $service->hasAccessRight($sharedNode, 'bob');

        $this->assertSame('/bob/files/Shared/budget.xlsx', $resolved);
    }

    public function testHasAccessRightReturnsNullWhenUserNotInAccessList(): void
    {
        $sharedNode = $this->createMock(Node::class);
        $this->shareManager->method('getAccessList')->willReturn(['users' => []]);

        $this->assertNull($this->service->hasAccessRight($sharedNode, 'bob'));
    }
}
