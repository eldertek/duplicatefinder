<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ListFolderDuplicates;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
use OCP\Encryption\IManager;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class ListFolderDuplicatesTest extends TestCase
{
    private $userManager;
    private $encryptionManager;
    private $fileDuplicateService;
    private $command;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userManager = $this->createMock(IUserManager::class);
        $this->encryptionManager = $this->createMock(IManager::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $this->command = new ListFolderDuplicates(
            $this->userManager,
            $this->encryptionManager,
            $this->fileDuplicateService,
            new FolderDuplicateService()
        );
    }

    public function testAbortsWhenEncryptionIsEnabled(): void
    {
        $this->encryptionManager->method('isEnabled')->willReturn(true);

        $output = new BufferedOutput();
        $exitCode = $this->command->run(new ArrayInput([]), $output);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Encryption is enabled', $output->fetch());
    }

    public function testOutputsJsonReportForUserWithDuplicateFolders(): void
    {
        $this->encryptionManager->method('isEnabled')->willReturn(false);
        $this->userManager->method('userExists')->with('alice')->willReturn(true);

        $dup = new FileDuplicate('abc123');
        $f1 = new FileInfo();
        $f1->setPath('/alice/files/Photos/2025/a.jpg');
        $f1->setSize(2048);
        $f2 = new FileInfo();
        $f2->setPath('/alice/files/Backup/Photos/2025/a.jpg');
        $f2->setSize(2048);
        $dup->setFiles([$f1, $f2]);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('all', 'alice', 1, 100, true)
            ->willReturn([
                'entities' => [$dup],
                'isLastFetched' => true,
            ]);

        $output = new BufferedOutput();
        $exitCode = $this->command->run(
            new ArrayInput(['--user' => ['alice'], '--json' => true]),
            $output
        );

        $this->assertSame(0, $exitCode);
        $decoded = json_decode($output->fetch(), true);
        $this->assertIsArray($decoded);
        $this->assertSame(1, $decoded['alice']['summary']['groupCount']);
        $this->assertSame(2048, $decoded['alice']['summary']['reclaimableSize']);
        $this->assertSame(
            ['/Backup/Photos', '/Photos'],
            $decoded['alice']['groups'][0]['folders']
        );
    }

    public function testReturnsErrorOnUnknownUserOrInvalidOptions(): void
    {
        $this->encryptionManager->method('isEnabled')->willReturn(false);

        $badOutput = new BufferedOutput();
        $this->assertSame(1, $this->command->run(new ArrayInput(['--min-files' => '0']), $badOutput));

        $this->userManager->method('userExists')->with('ghost')->willReturn(false);
        $unknownUserOutput = new BufferedOutput();
        $this->assertSame(1, $this->command->run(new ArrayInput(['--user' => ['ghost']]), $unknownUserOutput));
    }

    public function testOutputsHumanSummaryForAllUsers(): void
    {
        $this->encryptionManager->method('isEnabled')->willReturn(false);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('bob');
        $this->userManager->method('search')->with('')->willReturn([$user]);

        $this->fileDuplicateService->method('findAll')->willReturn([
            'entities' => [],
            'isLastFetched' => true,
        ]);

        $output = new BufferedOutput();
        $exitCode = $this->command->run(new ArrayInput([]), $output);

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('Duplicate folders for user bob: 0 group(s)', $output->fetch());
    }
}
