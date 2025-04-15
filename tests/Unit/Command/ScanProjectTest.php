<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ScanProject;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Encryption\IManager;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ScanProjectTest extends TestCase
{
    private $userManager;
    private $encryptionManager;
    private $projectService;
    private $logger;
    private $command;
    private $input;
    private $output;
    private $project;

    protected function setUp(): void
    {
        parent::setUp();

        // Create mocks for all dependencies
        $this->userManager = $this->createMock(IUserManager::class);
        $this->encryptionManager = $this->createMock(IManager::class);
        $this->projectService = $this->createMock(ProjectService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->input = $this->createMock(InputInterface::class);
        $this->output = $this->createMock(OutputInterface::class);
        
        // Create a mock project
        $this->project = $this->createMock(Project::class);

        // Create the command with mocked dependencies
        $this->command = new ScanProject(
            $this->userManager,
            $this->encryptionManager,
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

    public function testExecuteWithoutUser()
    {
        // Test that the command requires a user
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getArgument')
            ->with('project-id')
            ->willReturn('1');

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn(null);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with($this->stringContains('User is required'));

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithNonExistentUser()
    {
        // Test that the command aborts when a non-existent user is specified
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getArgument')
            ->with('project-id')
            ->willReturn('1');

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn('nonexistentuser');

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('nonexistentuser')
            ->willReturn(false);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with($this->stringContains('User nonexistentuser is unknown'));

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithNonExistentProject()
    {
        // Test that the command aborts when a non-existent project is specified
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getArgument')
            ->with('project-id')
            ->willReturn('999');

        $this->input->expects($this->once())
            ->method('getOption')
            ->with('user')
            ->willReturn('testuser');

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('testuser')
            ->willReturn(true);

        $this->projectService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->projectService->expects($this->once())
            ->method('find')
            ->with(999)
            ->willThrowException(new DoesNotExistException('Project not found'));

        $result = $this->invokeMethod($this->command, 'scanProject', [999, 'testuser']);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithValidProject()
    {
        // Test scanning a valid project
        $this->project->expects($this->once())
            ->method('getName')
            ->willReturn('Test Project');

        $this->projectService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->projectService->expects($this->once())
            ->method('find')
            ->with(1)
            ->willReturn($this->project);

        $this->projectService->expects($this->once())
            ->method('scan')
            ->with(1);

        $result = $this->invokeMethod($this->command, 'scanProject', [1, 'testuser']);
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
