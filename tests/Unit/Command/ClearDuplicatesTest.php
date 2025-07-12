<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ClearDuplicates;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

class ClearDuplicatesTest extends TestCase
{
    /** @var ClearDuplicates */
    private $command;

    /** @var IUserManager|MockObject */
    private $userManager;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var FileDuplicateService|MockObject */
    private $fileDuplicateService;

    /** @var CommandTester */
    private $commandTester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userManager = $this->createMock(IUserManager::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $this->command = new ClearDuplicates(
            $this->userManager,
            $this->fileInfoService,
            $this->fileDuplicateService
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    /**
     * Test clearing duplicates for specific user
     */
    public function testClearDuplicatesForUser(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->expects($this->once())
            ->method('get')
            ->with('testuser')
            ->willReturn($user);

        // Mock finding duplicates to clear
        $this->fileInfoService->expects($this->once())
            ->method('clearStaleDuplicates')
            ->with('testuser')
            ->willReturn(5); // 5 stale duplicates cleared

        $this->fileDuplicateService->expects($this->once())
            ->method('clearEmptyDuplicates')
            ->with('testuser')
            ->willReturn(3); // 3 empty duplicate groups cleared

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Clearing duplicates for user: testuser', $output);
        $this->assertStringContainsString('Cleared 5 stale duplicates', $output);
        $this->assertStringContainsString('Cleared 3 empty duplicate groups', $output);
        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test clearing duplicates for all users
     */
    public function testClearDuplicatesForAllUsers(): void
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

        // Expect clearing for each user
        $this->fileInfoService->expects($this->exactly(2))
            ->method('clearStaleDuplicates')
            ->willReturn(2);

        $this->fileDuplicateService->expects($this->exactly(2))
            ->method('clearEmptyDuplicates')
            ->willReturn(1);

        $this->commandTester->execute([]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Clearing duplicates for all users', $output);
        $this->assertStringContainsString('Total cleared: 4 stale duplicates, 2 empty groups', $output);
    }

    /**
     * Test with non-existent user
     */
    public function testClearWithNonExistentUser(): void
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
     * Test with dry-run option
     */
    public function testClearWithDryRun(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        // In dry-run mode, should count but not clear
        $this->fileInfoService->expects($this->once())
            ->method('countStaleDuplicates')
            ->with('testuser')
            ->willReturn(10);

        $this->fileDuplicateService->expects($this->once())
            ->method('countEmptyDuplicates')
            ->with('testuser')
            ->willReturn(5);

        // Should NOT call clear methods
        $this->fileInfoService->expects($this->never())
            ->method('clearStaleDuplicates');

        $this->fileDuplicateService->expects($this->never())
            ->method('clearEmptyDuplicates');

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--dry-run' => true,
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('DRY RUN MODE', $output);
        $this->assertStringContainsString('Would clear 10 stale duplicates', $output);
        $this->assertStringContainsString('Would clear 5 empty duplicate groups', $output);
    }

    /**
     * Test error handling
     */
    public function testClearWithException(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileInfoService->expects($this->once())
            ->method('clearStaleDuplicates')
            ->willThrowException(new \Exception('Database error'));

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Error clearing duplicates', $output);
        $this->assertStringContainsString('Database error', $output);
        $this->assertEquals(1, $this->commandTester->getStatusCode());
    }
}
