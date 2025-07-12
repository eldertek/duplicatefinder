<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ScanCommand;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\Files\Folder;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

class ScanCommandTest extends TestCase
{
    /** @var ScanCommand */
    private $command;

    /** @var IUserManager|MockObject */
    private $userManager;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var FileDuplicateService|MockObject */
    private $fileDuplicateService;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var ScannerUtil|MockObject */
    private $scannerUtil;

    /** @var ExcludedFolderService|MockObject */
    private $excludedFolderService;

    /** @var CommandTester */
    private $commandTester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userManager = $this->createMock(IUserManager::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->scannerUtil = $this->createMock(ScannerUtil::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $this->command = new ScanCommand(
            $this->userManager,
            $this->fileInfoService,
            $this->fileDuplicateService,
            $this->folderService,
            $this->scannerUtil,
            $this->excludedFolderService
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    /**
     * Test scanning for specific user
     */
    public function testScanForSpecificUser(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->expects($this->once())
            ->method('get')
            ->with('testuser')
            ->willReturn($user);

        $userFolder = $this->createMock(Folder::class);

        $this->folderService->expects($this->once())
            ->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);

        $this->scannerUtil->expects($this->once())
            ->method('scanFolder')
            ->with($userFolder, 'testuser')
            ->willReturn(10); // 10 files scanned

        $this->fileInfoService->expects($this->once())
            ->method('scanFilesByUser')
            ->with('testuser');

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Scanning files for user: testuser', $output);
        $this->assertStringContainsString('10 files found', $output);
        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test scanning for all users
     */
    public function testScanForAllUsers(): void
    {
        $user1 = $this->createMock(IUser::class);
        $user1->method('getUID')->willReturn('user1');

        $user2 = $this->createMock(IUser::class);
        $user2->method('getUID')->willReturn('user2');

        $this->userManager->expects($this->once())
            ->method('callForSeenUsers')
            ->willReturnCallback(function ($callback) use ($user1, $user2) {
                $callback($user1);
                $callback($user2);
            });

        $this->scannerUtil->expects($this->exactly(2))
            ->method('scanFolder')
            ->willReturn(5); // 5 files per user

        $this->fileInfoService->expects($this->exactly(2))
            ->method('scanFilesByUser');

        $this->commandTester->execute([]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Scanning files for all users', $output);
        $this->assertStringContainsString('Total files found: 10', $output);
    }

    /**
     * Test scanning with specific path
     */
    public function testScanWithSpecificPath(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $userFolder = $this->createMock(Folder::class);
        $targetFolder = $this->createMock(Folder::class);

        $this->folderService->method('getUserFolder')->willReturn($userFolder);

        $userFolder->expects($this->once())
            ->method('get')
            ->with('/Documents')
            ->willReturn($targetFolder);

        $this->scannerUtil->expects($this->once())
            ->method('scanFolder')
            ->with($targetFolder, 'testuser')
            ->willReturn(3);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--path' => '/Documents',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Scanning path: /Documents', $output);
        $this->assertStringContainsString('3 files found', $output);
    }

    /**
     * Test scanning with non-existent user
     */
    public function testScanWithNonExistentUser(): void
    {
        $this->userManager->expects($this->once())
            ->method('get')
            ->with('nonexistent')
            ->willReturn(null);

        $this->commandTester->execute([
            'user_id' => 'nonexistent',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('User not found: nonexistent', $output);
        $this->assertEquals(1, $this->commandTester->getStatusCode());
    }

    /**
     * Test scanning with exception
     */
    public function testScanWithException(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->folderService->method('getUserFolder')
            ->willThrowException(new \Exception('Access denied'));

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Error scanning user testuser', $output);
        $this->assertStringContainsString('Access denied', $output);
        $this->assertEquals(1, $this->commandTester->getStatusCode());
    }
}
