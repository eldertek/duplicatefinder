<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\FindDuplicates;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\Encryption\IManager;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class FindDuplicatesTest extends TestCase
{
    private $userManager;
    private $encryptionManager;
    private $connection;
    private $fileInfoService;
    private $fileDuplicateService;
    private $excludedFolderService;
    private $originFolderService;
    private $logger;
    private $projectService;
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
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->projectService = $this->createMock(ProjectService::class);
        $this->input = $this->createMock(InputInterface::class);
        $this->output = $this->createMock(OutputInterface::class);
        $this->user = $this->createMock(IUser::class);

        // Create the command with mocked dependencies
        $this->command = new FindDuplicates(
            $this->userManager,
            $this->encryptionManager,
            $this->connection,
            $this->fileInfoService,
            $this->fileDuplicateService,
            $this->excludedFolderService,
            $this->originFolderService,
            $this->projectService,
            $this->logger
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
        // Test finding duplicates for a specific user
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->exactly(3))
            ->method('getOption')
            ->withConsecutive(['user'], ['path'], ['project'])
            ->willReturnOnConsecutiveCalls(['testuser'], [], null);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('testuser')
            ->willReturn(true);

        // Expect the services to be configured with the user ID
        $this->fileDuplicateService->expects($this->once())
            ->method('setCurrentUserId')
            ->with('testuser');

        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->originFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        // Expect scanFiles to be called
        $this->fileInfoService->expects($this->once())
            ->method('scanFiles')
            ->with('testuser', null, $this->isType('callable'), $this->output);

        // Mock the fileDuplicateService->findAll method to return a valid structure
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [],
                'isLastFetched' => true,
            ]);

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(0, $result);
    }

    public function testExecuteWithNonExistentUser()
    {
        // Test that the command aborts when a non-existent user is specified
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->exactly(3))
            ->method('getOption')
            ->withConsecutive(['user'], ['path'], ['project'])
            ->willReturnOnConsecutiveCalls(['nonexistentuser'], [], null);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('nonexistentuser')
            ->willReturn(false);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with('User nonexistentuser is unknown.');

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithSpecificPath()
    {
        // Test finding duplicates for a specific path
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->exactly(3))
            ->method('getOption')
            ->withConsecutive(['user'], ['path'], ['project'])
            ->willReturnOnConsecutiveCalls(['testuser'], ['./Photos'], null);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('testuser')
            ->willReturn(true);

        // Expect the services to be configured with the user ID
        $this->fileDuplicateService->expects($this->once())
            ->method('setCurrentUserId')
            ->with('testuser');

        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->originFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        // Expect scanFiles to be called with the path
        $this->fileInfoService->expects($this->once())
            ->method('scanFiles')
            ->with('testuser', './Photos', $this->isType('callable'), $this->output);

        // Mock the fileDuplicateService->findAll method to return a valid structure
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [],
                'isLastFetched' => true,
            ]);

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(0, $result);
    }

    public function testExecuteForAllUsers()
    {
        // Test finding duplicates for all users
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->exactly(3))
            ->method('getOption')
            ->withConsecutive(['user'], ['path'], ['project'])
            ->willReturnOnConsecutiveCalls([], [], null);

        // Mock the callForAllUsers method to call the callback with a test user
        $this->userManager->expects($this->once())
            ->method('callForAllUsers')
            ->willReturnCallback(function ($callback) {
                $this->user->expects($this->once())
                    ->method('getUID')
                    ->willReturn('testuser');
                $callback($this->user);
            });

        // Expect the services to be configured with the user ID
        $this->fileDuplicateService->expects($this->once())
            ->method('setCurrentUserId')
            ->with('testuser');

        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->originFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        // Expect scanFiles to be called
        $this->fileInfoService->expects($this->once())
            ->method('scanFiles')
            ->with('testuser', null, $this->isType('callable'), $this->output);

        // Mock the fileDuplicateService->findAll method to return a valid structure
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [],
                'isLastFetched' => true,
            ]);

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(0, $result);
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
