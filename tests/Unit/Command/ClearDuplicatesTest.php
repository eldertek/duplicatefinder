<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ClearDuplicates;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Tester\CommandTester;

class ClearDuplicatesTest extends TestCase
{
    /** @var ClearDuplicates */
    private $command;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var FileDuplicateService|MockObject */
    private $fileDuplicateService;

    /** @var CommandTester */
    private $commandTester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $this->command = new ClearDuplicates(
            $this->fileInfoService,
            $this->fileDuplicateService
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    public function testClearWithForceOptionClearsAllDataWithoutPrompt(): void
    {
        $this->fileDuplicateService->expects($this->once())->method('clear');
        $this->fileInfoService->expects($this->once())->method('clear');

        $status = $this->commandTester->execute(['--force' => true]);

        $output = $this->commandTester->getDisplay();
        $this->assertSame(Command::SUCCESS, $status);
        $this->assertStringContainsString('Clearing all duplicates and file information', $output);
        $this->assertStringContainsString('cleared successfully', $output);
    }

    public function testClearWithInteractiveConfirmationClearsData(): void
    {
        $this->fileDuplicateService->expects($this->once())->method('clear');
        $this->fileInfoService->expects($this->once())->method('clear');

        $this->commandTester->setInputs(['yes']);
        $status = $this->commandTester->execute([]);

        $this->assertSame(Command::SUCCESS, $status);
        $this->assertStringContainsString('cleared successfully', $this->commandTester->getDisplay());
    }

    public function testClearDeclinedByUserCancelsOperation(): void
    {
        $this->fileDuplicateService->expects($this->never())->method('clear');
        $this->fileInfoService->expects($this->never())->method('clear');

        $this->commandTester->setInputs(['no']);
        $status = $this->commandTester->execute([]);

        $this->assertSame(Command::FAILURE, $status);
        $this->assertStringContainsString('Operation cancelled.', $this->commandTester->getDisplay());
    }

    public function testClearPropagatesServiceException(): void
    {
        $this->fileDuplicateService->expects($this->once())
            ->method('clear')
            ->willThrowException(new \RuntimeException('Database error'));
        $this->fileInfoService->expects($this->never())->method('clear');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Database error');

        $this->commandTester->execute(['--force' => true]);
    }
}
