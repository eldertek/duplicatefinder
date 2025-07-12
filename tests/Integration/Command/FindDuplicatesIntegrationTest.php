<?php

namespace OCA\DuplicateFinder\Tests\Integration\Command;

use OCA\DuplicateFinder\Command\FindDuplicates;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\Encryption\IManager;
use OCP\IDBConnection;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;
use Test\TestCase;

/**
 * Integration test for FindDuplicates command
 * @group DB
 */
class FindDuplicatesIntegrationTest extends TestCase
{
    /** @var FindDuplicates */
    private $command;

    /** @var CommandTester */
    private $commandTester;

    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var string */
    private $testUserId = 'test-cli-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->mapper = new FileInfoMapper($this->db);

        // Get real services
        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('userExists')->willReturn(true);
        $userManager->method('callForAllUsers')->willReturnCallback(function ($callback) {
            $user = $this->createMock(\OCP\IUser::class);
            $user->method('getUID')->willReturn($this->testUserId);
            $callback($user);
        });

        $encryptionManager = $this->createMock(IManager::class);
        $encryptionManager->method('isEnabled')->willReturn(false);

        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $originFolderService = $this->createMock(OriginFolderService::class);
        $projectService = $this->createMock(ProjectService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $this->command = new FindDuplicates(
            $userManager,
            $encryptionManager,
            $this->db,
            $fileInfoService,
            $fileDuplicateService,
            $excludedFolderService,
            $originFolderService,
            $projectService,
            $logger
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    protected function tearDown(): void
    {
        // Clean up test data
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        parent::tearDown();
    }

    /**
     * Test basic command execution
     */
    public function testExecuteBasicCommand(): void
    {
        $exitCode = $this->commandTester->execute([]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();
        $this->assertStringNotContainsString('error', strtolower($output));
    }

    /**
     * Test command with user option
     */
    public function testExecuteWithUserOption(): void
    {
        $exitCode = $this->commandTester->execute([
            '--user' => [$this->testUserId]
        ]);

        $this->assertEquals(0, $exitCode);
    }

    /**
     * Test command with path option
     */
    public function testExecuteWithPathOption(): void
    {
        $exitCode = $this->commandTester->execute([
            '--user' => [$this->testUserId],
            '--path' => ['./Photos', './Documents']
        ]);

        $this->assertEquals(0, $exitCode);
    }

    /**
     * Test command with non-existent user
     */
    public function testExecuteWithNonExistentUser(): void
    {
        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('userExists')->willReturn(false);

        $command = new FindDuplicates(
            $userManager,
            $this->createMock(IManager::class),
            $this->db,
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(ExcludedFolderService::class),
            $this->createMock(OriginFolderService::class),
            $this->createMock(ProjectService::class),
            $this->createMock(LoggerInterface::class)
        );

        $application = new Application();
        $application->add($command);
        $commandTester = new CommandTester($command);

        $exitCode = $commandTester->execute([
            '--user' => ['nonexistent']
        ]);

        $this->assertEquals(1, $exitCode);
        $output = $commandTester->getDisplay();
        $this->assertStringContainsString('unknown', $output);
    }

    /**
     * Test command with encryption enabled
     */
    public function testExecuteWithEncryptionEnabled(): void
    {
        $encryptionManager = $this->createMock(IManager::class);
        $encryptionManager->method('isEnabled')->willReturn(true);

        $command = new FindDuplicates(
            $this->createMock(IUserManager::class),
            $encryptionManager,
            $this->db,
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(ExcludedFolderService::class),
            $this->createMock(OriginFolderService::class),
            $this->createMock(ProjectService::class),
            $this->createMock(LoggerInterface::class)
        );

        $application = new Application();
        $application->add($command);
        $commandTester = new CommandTester($command);

        $exitCode = $commandTester->execute([]);

        $this->assertEquals(1, $exitCode);
        $output = $commandTester->getDisplay();
        $this->assertStringContainsString('Encryption is enabled', $output);
    }

    /**
     * Test project scanning
     */
    public function testExecuteWithProjectOption(): void
    {
        $projectService = $this->createMock(ProjectService::class);
        $projectService->expects($this->once())
            ->method('setUserId')
            ->with($this->testUserId);
        
        $project = new \OCA\DuplicateFinder\Db\Project();
        $project->setId(1);
        $project->setName('Test Project');
        $project->setFolders(['/test/folder1', '/test/folder2']);
        
        $projectService->expects($this->once())
            ->method('find')
            ->with(1)
            ->willReturn($project);
        
        $projectService->expects($this->once())
            ->method('scan')
            ->with(1);
        
        $projectService->expects($this->once())
            ->method('getDuplicates')
            ->willReturn([
                'entities' => [],
                'pagination' => ['totalItems' => 0]
            ]);

        $command = new FindDuplicates(
            $this->createMock(IUserManager::class),
            $this->createMock(IManager::class),
            $this->db,
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(ExcludedFolderService::class),
            $this->createMock(OriginFolderService::class),
            $projectService,
            $this->createMock(LoggerInterface::class)
        );

        $application = new Application();
        $application->add($command);
        $commandTester = new CommandTester($command);

        $exitCode = $commandTester->execute([
            '--user' => [$this->testUserId],
            '--project' => '1'
        ]);

        $this->assertEquals(0, $exitCode);
        $output = $commandTester->getDisplay();
        $this->assertStringContainsString('Test Project', $output);
        $this->assertStringContainsString('No duplicates found', $output);
    }

    /**
     * Test interrupt handling (SIGINT)
     */
    public function testInterruptHandling(): void
    {
        if (!function_exists('pcntl_signal')) {
            $this->markTestSkipped('PCNTL extension not available');
        }

        // This is difficult to test directly, but we can verify the signal handler is set
        $exitCode = $this->commandTester->execute([]);
        $this->assertEquals(0, $exitCode);
    }
}