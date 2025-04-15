<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ListProjectDuplicates;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Encryption\IManager;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ListProjectDuplicatesTest extends TestCase
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
        $this->command = new ListProjectDuplicates(
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

        $this->input->method('getOption')
            ->willReturnMap([
                ['user', null],
                ['type', 'all'],
                ['page', 1],
                ['limit', 50]
            ]);

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

        $this->input->method('getOption')
            ->willReturnMap([
                ['user', 'nonexistentuser'],
                ['type', 'all'],
                ['page', 1],
                ['limit', 50]
            ]);

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

    public function testExecuteWithInvalidType()
    {
        // Test that the command validates the type parameter
        $this->encryptionManager->expects($this->once())
            ->method('isEnabled')
            ->willReturn(false);

        $this->input->expects($this->once())
            ->method('getArgument')
            ->with('project-id')
            ->willReturn('1');

        $this->input->method('getOption')
            ->willReturnMap([
                ['user', 'testuser'],
                ['type', 'invalid'],
                ['page', 1],
                ['limit', 50]
            ]);

        $this->userManager->expects($this->once())
            ->method('userExists')
            ->with('testuser')
            ->willReturn(true);

        $this->output->expects($this->once())
            ->method('writeln')
            ->with($this->stringContains('Invalid type'));

        $result = $this->invokeMethod($this->command, 'execute', [$this->input, $this->output]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithNonExistentProject()
    {
        // Test that the command aborts when a non-existent project is specified
        $this->projectService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->projectService->expects($this->once())
            ->method('find')
            ->with(999)
            ->willThrowException(new DoesNotExistException('Project not found'));

        $result = $this->invokeMethod($this->command, 'listProjectDuplicates', [999, 'testuser', 'all', 1, 50]);
        $this->assertEquals(1, $result);
    }

    public function testExecuteWithValidProjectNoDuplicates()
    {
        // Test listing duplicates for a valid project with no duplicates
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
            ->method('getDuplicates')
            ->with(1, 'all', 1, 50)
            ->willReturn([
                'entities' => [],
                'pagination' => [
                    'currentPage' => 1,
                    'totalPages' => 0,
                    'totalItems' => 0
                ]
            ]);

        $this->output->expects($this->at(1))
            ->method('writeln')
            ->with($this->stringContains('No duplicates found'));

        $result = $this->invokeMethod($this->command, 'listProjectDuplicates', [1, 'testuser', 'all', 1, 50]);
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
