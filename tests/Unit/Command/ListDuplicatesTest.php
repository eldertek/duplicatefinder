<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ListDuplicates;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\Encryption\IManager;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\BufferedOutput;
use Symfony\Component\Console\Output\OutputInterface;

class ListDuplicatesTest extends TestCase
{
    private $userManager;
    private $encryptionManager;
    private $connection;
    private $fileInfoService;
    private $fileDuplicateService;
    private $command;
    private $input;
    private $output;
    private $user;

    protected function setUp(): void
    {
        parent::setUp();

        // Create mocks for all dependencies
        $this->userManager = $this->createMock(IUserManager::class);
        $this->encryptionManager = $this->createMock(IManager::class);
        $this->connection = $this->createMock(IDBConnection::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->input = $this->createMock(InputInterface::class);
        $this->output = $this->createMock(OutputInterface::class);
        $this->user = $this->createMock(IUser::class);

        // Create the command with mocked dependencies
        $this->command = new ListDuplicates(
            $this->userManager,
            $this->encryptionManager,
            $this->connection,
            $this->fileInfoService,
            $this->fileDuplicateService
        );
    }

    public function testExecuteWithEncryptionEnabled()
    {
        // Test that the command aborts when encryption is enabled
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(true);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with('Encryption is enabled. Aborted.');

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithSpecificUser()
    {
        // Test listing duplicates for a specific user
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn(['testuser']);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('testuser')
            ->willReturn(true);

        // Expect showDuplicates to be called with the user
        // We can't directly test the CMDUtils::showDuplicates call, but we can verify
        // that the fileDuplicateService is used correctly
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('all', 'testuser', 1, 20, true)
            ->willReturn(['entities' => [], 'isLastFetched' => true]);

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(0, $result);
    }

    public function testExecuteWithNonExistentUser()
    {
        // Test that the command aborts when a non-existent user is specified
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn(['nonexistentuser']);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('nonexistentuser')
            ->willReturn(false);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with('<e>User nonexistentuser is unknown.</e>');

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteForAllUsers()
    {
        // Test listing duplicates for all users
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn([]);

        // Mock the search method to return a test user
        $this->userManager->expects($this->once())
            ->method('search')
            ->with('')
            ->willReturn([$this->user]);

        $this->user->expects($this->once())
            ->method('getUID')
            ->willReturn('testuser');

        // Expect showDuplicates to be called for each user
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('all', 'testuser', 1, 20, true)
            ->willReturn(['entities' => [], 'isLastFetched' => true]);

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(0, $result);
    }

    public function testExecuteWithSortSizeDescAndMinSize(): void
    {
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('qa-bot')
            ->willReturn(true);

        $fileA = new FileInfo('/qa-bot/files/backups/archive.tar.gz', 'qa-bot');
        $fileA->setSize(20 * 1024 * 1024);
        $fileB = new FileInfo('/qa-bot/files/incoming/archive.tar.gz', 'qa-bot');
        $fileB->setSize(20 * 1024 * 1024);

        $dup = new FileDuplicate('abc123', 'file_hash');
        $dup->setFiles([$fileA, $fileB]);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('all', 'qa-bot', 1, 20, true, [['size', 'DESC']], 10 * 1024 * 1024)
            ->willReturn(['entities' => [$dup], 'isLastFetched' => true]);

        $input = new ArrayInput([
            '--user' => ['qa-bot'],
            '--sort' => 'size-desc',
            '--min-size' => '10M',
        ]);
        $output = new BufferedOutput();

        $exitCode = $this->command->run($input, $output);

        $this->assertSame(0, $exitCode);
        $rendered = $output->fetch();
        $this->assertStringContainsString('Size: 20.0 MB', $rendered);
        $this->assertStringContainsString('archive.tar.gz', $rendered);
    }

    public function testExecuteWithSortSizeAscAndNoMinSize(): void
    {
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('qa-bot')
            ->willReturn(true);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('all', 'qa-bot', 1, 20, true, [['size', 'ASC']])
            ->willReturn(['entities' => [], 'isLastFetched' => true]);

        $input = new ArrayInput([
            '--user' => ['qa-bot'],
            '--sort' => 'size-asc',
        ]);
        $output = new BufferedOutput();

        $exitCode = $this->command->run($input, $output);

        $this->assertSame(0, $exitCode);
    }

    public function testExecuteRejectsInvalidSortOption(): void
    {
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $input = new ArrayInput(['--sort' => 'newest']);
        $output = new BufferedOutput();

        $exitCode = $this->command->run($input, $output);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Unknown sort order "newest"', $output->fetch());
    }

    public function testExecuteRejectsInvalidMinSizeOption(): void
    {
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $input = new ArrayInput(['--min-size' => 'huge']);
        $output = new BufferedOutput();

        $exitCode = $this->command->run($input, $output);

        $this->assertSame(1, $exitCode);
        $this->assertStringContainsString('Invalid --min-size "huge"', $output->fetch());
    }

    /**
     * Helper method to invoke private or protected methods
     */
    private function invokeMethod($object, string $methodName, array $parameters = [])
    {
        $reflection = new \ReflectionClass(get_class($object));
        $method = $reflection->getMethod($methodName);
        $method->setAccessible(true);

        return $method->invokeArgs($object, $parameters);
    }
}
