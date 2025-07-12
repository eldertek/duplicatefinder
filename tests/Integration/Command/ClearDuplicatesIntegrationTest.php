<?php

namespace OCA\DuplicateFinder\Tests\Integration\Command;

use OCA\DuplicateFinder\Command\ClearDuplicates;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\IDBConnection;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;
use Test\TestCase;

/**
 * Integration test for ClearDuplicates command
 * @group DB
 */
class ClearDuplicatesIntegrationTest extends TestCase
{
    /** @var ClearDuplicates */
    private $command;

    /** @var CommandTester */
    private $commandTester;

    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var string */
    private $testUserId = 'test-clear-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->fileInfoMapper = new FileInfoMapper($this->db);
        $this->duplicateMapper = new FileDuplicateMapper($this->db);

        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('userExists')->willReturn(true);

        $fileInfoService = new FileInfoService(
            $this->fileInfoMapper,
            $this->createMock(\OCP\Files\IRootFolder::class),
            $this->createMock(\OCA\DuplicateFinder\Service\FolderService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(\OCP\EventDispatcher\IEventDispatcher::class),
            $this->createMock(\OCA\DuplicateFinder\Service\FilterService::class)
        );

        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $this->command = new ClearDuplicates(
            $userManager,
            $this->db,
            $fileInfoService,
            $fileDuplicateService,
            $logger
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);

        // Create test data
        $this->createTestData();
    }

    protected function tearDown(): void
    {
        // Clean up test data
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_duplicates')
            ->where($query->expr()->like('hash', $query->createNamedParameter('test-clear-%')));
        $query->executeStatement();

        parent::tearDown();
    }

    private function createTestData(): void
    {
        // Create some file infos
        for ($i = 1; $i <= 5; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024 * $i);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('test-clear-hash-' . $i);
            $fileInfo->setNodeId(5000 + $i);

            $this->fileInfoMapper->insert($fileInfo);
        }

        // Create duplicate entries
        for ($i = 1; $i <= 3; $i++) {
            $duplicate = new FileDuplicate();
            $duplicate->setHash('test-clear-hash-' . $i);
            $duplicate->setAcknowledged($i === 2); // One acknowledged

            $this->duplicateMapper->insert($duplicate);
        }
    }

    /**
     * Test clearing all duplicates
     */
    public function testClearAllDuplicates(): void
    {
        $exitCode = $this->commandTester->execute([
            'confirmation' => 'yes'
        ]);

        $this->assertEquals(0, $exitCode);
        
        // Verify duplicates are cleared
        $remaining = $this->duplicateMapper->findAll(100, 0);
        $testDuplicates = array_filter($remaining, function ($dup) {
            return strpos($dup->getHash(), 'test-clear-') === 0;
        });
        $this->assertCount(0, $testDuplicates);
    }

    /**
     * Test clearing with specific user
     */
    public function testClearWithUser(): void
    {
        $exitCode = $this->commandTester->execute([
            '--user' => $this->testUserId,
            'confirmation' => 'yes'
        ]);

        $this->assertEquals(0, $exitCode);
        
        // Verify file infos are cleared for user
        $remaining = $this->fileInfoMapper->findAll($this->testUserId);
        $this->assertCount(0, $remaining);
    }

    /**
     * Test clearing without confirmation
     */
    public function testClearWithoutConfirmation(): void
    {
        $exitCode = $this->commandTester->execute([
            'confirmation' => 'no'
        ]);

        $this->assertEquals(1, $exitCode);
        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('Clear duplicates aborted', $output);
    }

    /**
     * Test clearing acknowledged only
     */
    public function testClearAcknowledgedOnly(): void
    {
        $exitCode = $this->commandTester->execute([
            '--acknowledged-only' => true,
            'confirmation' => 'yes'
        ]);

        $this->assertEquals(0, $exitCode);
        
        // Verify only acknowledged duplicates are cleared
        $remaining = $this->duplicateMapper->findAll(100, 0);
        $testDuplicates = array_filter($remaining, function ($dup) {
            return strpos($dup->getHash(), 'test-clear-') === 0;
        });
        
        // Should have 2 unacknowledged duplicates remaining
        $this->assertCount(2, $testDuplicates);
        foreach ($testDuplicates as $dup) {
            $this->assertFalse($dup->getAcknowledged());
        }
    }

    /**
     * Test clearing with non-existent user
     */
    public function testClearWithNonExistentUser(): void
    {
        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('userExists')->willReturn(false);

        $command = new ClearDuplicates(
            $userManager,
            $this->db,
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateService::class),
            $this->createMock(LoggerInterface::class)
        );

        $application = new Application();
        $application->add($command);
        $commandTester = new CommandTester($command);

        $exitCode = $commandTester->execute([
            '--user' => 'nonexistent',
            'confirmation' => 'yes'
        ]);

        $this->assertEquals(1, $exitCode);
        $output = $commandTester->getDisplay();
        $this->assertStringContainsString('unknown', $output);
    }

    /**
     * Test database transaction rollback on error
     */
    public function testTransactionRollback(): void
    {
        // Create a mock that throws an exception during clear
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $fileDuplicateService->expects($this->once())
            ->method('deleteAll')
            ->willThrowException(new \Exception('Database error'));

        $command = new ClearDuplicates(
            $this->createMock(IUserManager::class),
            $this->db,
            $this->createMock(FileInfoService::class),
            $fileDuplicateService,
            $this->createMock(LoggerInterface::class)
        );

        $application = new Application();
        $application->add($command);
        $commandTester = new CommandTester($command);

        $exitCode = $commandTester->execute([
            'confirmation' => 'yes'
        ]);

        $this->assertEquals(1, $exitCode);
        $output = $commandTester->getDisplay();
        $this->assertStringContainsString('error', strtolower($output));

        // Verify data is still intact (rollback worked)
        $remaining = $this->duplicateMapper->findAll(100, 0);
        $testDuplicates = array_filter($remaining, function ($dup) {
            return strpos($dup->getHash(), 'test-clear-') === 0;
        });
        $this->assertCount(3, $testDuplicates);
    }
}