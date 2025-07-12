<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ClearCommand;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

class ClearCommandTest extends TestCase
{
    /** @var ClearCommand */
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

        $this->command = new ClearCommand(
            $this->userManager,
            $this->fileInfoService,
            $this->fileDuplicateService
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    /**
     * Test clearing data for specific user with confirmation
     */
    public function testClearForUserWithConfirmation(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->expects($this->once())
            ->method('get')
            ->with('testuser')
            ->willReturn($user);

        $this->fileInfoService->expects($this->once())
            ->method('deleteByUser')
            ->with('testuser')
            ->willReturn(10); // 10 records deleted

        $this->fileDuplicateService->expects($this->once())
            ->method('deleteByUser')
            ->with('testuser')
            ->willReturn(5); // 5 duplicate groups deleted

        // Simulate user confirming
        $this->commandTester->setInputs(['yes']);

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('This will delete all duplicate finder data for user: testuser', $output);
        $this->assertStringContainsString('Deleted 10 file info records', $output);
        $this->assertStringContainsString('Deleted 5 duplicate records', $output);
        $this->assertStringContainsString('Successfully cleared data for user: testuser', $output);
        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test clearing data with force option (no confirmation)
     */
    public function testClearWithForceOption(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileInfoService->expects($this->once())
            ->method('deleteByUser')
            ->willReturn(0); // No records to delete

        $this->fileDuplicateService->expects($this->once())
            ->method('deleteByUser')
            ->willReturn(0);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--force' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        // Should not ask for confirmation
        $this->assertStringNotContainsString('Are you sure', $output);
        $this->assertStringContainsString('No data to clear', $output);
    }

    /**
     * Test clearing all data
     */
    public function testClearAllData(): void
    {
        $this->fileInfoService->expects($this->once())
            ->method('deleteAll')
            ->willReturn(100); // 100 records deleted

        $this->fileDuplicateService->expects($this->once())
            ->method('deleteAll')
            ->willReturn(50); // 50 duplicate groups deleted

        $this->commandTester->setInputs(['yes']);

        $this->commandTester->execute([
            '--all' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('This will delete ALL duplicate finder data for ALL users', $output);
        $this->assertStringContainsString('Deleted 100 file info records', $output);
        $this->assertStringContainsString('Deleted 50 duplicate records', $output);
        $this->assertStringContainsString('Successfully cleared all data', $output);
    }

    /**
     * Test user canceling confirmation
     */
    public function testClearCanceledByUser(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        // User should not be called if cancelled
        $this->fileInfoService->expects($this->never())
            ->method('deleteByUser');

        $this->fileDuplicateService->expects($this->never())
            ->method('deleteByUser');

        // Simulate user canceling
        $this->commandTester->setInputs(['no']);

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('Operation cancelled', $output);
        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test clearing with non-existent user
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
     * Test clearing with both user and all options
     */
    public function testClearWithConflictingOptions(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('Cannot specify both user_id and --all');

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--all' => true,
        ]);
    }

    /**
     * Test clearing orphaned duplicates only
     */
    public function testClearOrphanedDuplicates(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileInfoService->expects($this->never())
            ->method('deleteByUser');

        $this->fileDuplicateService->expects($this->once())
            ->method('deleteOrphanedByUser')
            ->with('testuser')
            ->willReturn(3); // 3 orphaned duplicates deleted

        $this->commandTester->setInputs(['yes']);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--orphaned' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('Deleted 3 orphaned duplicate records', $output);
    }

    /**
     * Test dry run mode
     */
    public function testClearDryRun(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileInfoService->expects($this->once())
            ->method('countByUser')
            ->with('testuser')
            ->willReturn(25);

        $this->fileDuplicateService->expects($this->once())
            ->method('countByUser')
            ->with('testuser')
            ->willReturn(10);

        // Should not actually delete in dry run
        $this->fileInfoService->expects($this->never())
            ->method('deleteByUser');

        $this->fileDuplicateService->expects($this->never())
            ->method('deleteByUser');

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--dry-run' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('DRY RUN MODE', $output);
        $this->assertStringContainsString('Would delete 25 file info records', $output);
        $this->assertStringContainsString('Would delete 10 duplicate records', $output);
    }

    /**
     * Test exception handling
     */
    public function testClearWithException(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileInfoService->expects($this->once())
            ->method('deleteByUser')
            ->willThrowException(new \Exception('Database error'));

        $this->commandTester->setInputs(['yes']);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--force' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('Error clearing data', $output);
        $this->assertStringContainsString('Database error', $output);
        $this->assertEquals(1, $this->commandTester->getStatusCode());
    }
}
