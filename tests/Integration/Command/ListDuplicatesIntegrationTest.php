<?php

namespace OCA\DuplicateFinder\Tests\Integration\Command;

use OCA\DuplicateFinder\Command\ListDuplicates;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\IDBConnection;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;
use Test\TestCase;

/**
 * Integration test for ListDuplicates command
 * @group DB
 */
class ListDuplicatesIntegrationTest extends TestCase
{
    /** @var ListDuplicates */
    private $command;

    /** @var CommandTester */
    private $commandTester;

    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var FileDuplicateService */
    private $duplicateService;

    /** @var string */
    private $testUserId = 'test-list-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->fileInfoMapper = new FileInfoMapper($this->db);
        $this->duplicateMapper = new FileDuplicateMapper($this->db);

        $fileInfoService = $this->createMock(FileInfoService::class);
        
        // Mock to return our test files
        $fileInfoService->method('findByHash')->willReturnCallback(function ($hash) {
            return $this->fileInfoMapper->findByHash($hash);
        });

        $this->duplicateService = new FileDuplicateService(
            $this->duplicateMapper,
            $fileInfoService,
            $this->createMock(\OCA\DuplicateFinder\Service\OriginFolderService::class),
            $this->createMock(\Psr\Log\LoggerInterface::class)
        );

        $this->command = new ListDuplicates(
            $this->db,
            $this->duplicateService
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
            ->where($query->expr()->like('hash', $query->createNamedParameter('test-list-%')));
        $query->executeStatement();

        parent::tearDown();
    }

    private function createTestData(): void
    {
        // Create duplicate groups with different file counts
        $duplicateGroups = [
            ['hash' => 'test-list-hash-1', 'files' => 2, 'acknowledged' => false],
            ['hash' => 'test-list-hash-2', 'files' => 3, 'acknowledged' => true],
            ['hash' => 'test-list-hash-3', 'files' => 4, 'acknowledged' => false],
        ];

        foreach ($duplicateGroups as $group) {
            // Create file infos
            for ($i = 1; $i <= $group['files']; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/{$group['hash']}/file$i.txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(1024 * $i);
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash($group['hash']);
                $fileInfo->setNodeId(6000 + $i);

                $this->fileInfoMapper->insert($fileInfo);
            }

            // Create duplicate entry
            $duplicate = new FileDuplicate();
            $duplicate->setHash($group['hash']);
            $duplicate->setAcknowledged($group['acknowledged']);

            $this->duplicateMapper->insert($duplicate);
        }
    }

    /**
     * Test listing all duplicates
     */
    public function testListAllDuplicates(): void
    {
        $exitCode = $this->commandTester->execute([]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();

        // Should show all 3 duplicate groups
        $this->assertStringContainsString('test-list-hash-1', $output);
        $this->assertStringContainsString('test-list-hash-2', $output);
        $this->assertStringContainsString('test-list-hash-3', $output);
        
        // Should show file counts
        $this->assertStringContainsString('2 files', $output);
        $this->assertStringContainsString('3 files', $output);
        $this->assertStringContainsString('4 files', $output);
    }

    /**
     * Test listing with limit
     */
    public function testListWithLimit(): void
    {
        $exitCode = $this->commandTester->execute([
            '--limit' => 2
        ]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();

        // Count occurrences of "Hash:"
        $hashCount = substr_count($output, 'Hash:');
        $this->assertEquals(2, $hashCount);
    }

    /**
     * Test listing acknowledged only
     */
    public function testListAcknowledgedOnly(): void
    {
        $exitCode = $this->commandTester->execute([
            '--acknowledged' => true
        ]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();

        // Should only show acknowledged duplicate
        $this->assertStringNotContainsString('test-list-hash-1', $output);
        $this->assertStringContainsString('test-list-hash-2', $output);
        $this->assertStringNotContainsString('test-list-hash-3', $output);
    }

    /**
     * Test listing unacknowledged only
     */
    public function testListUnacknowledgedOnly(): void
    {
        $exitCode = $this->commandTester->execute([
            '--unacknowledged' => true
        ]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();

        // Should only show unacknowledged duplicates
        $this->assertStringContainsString('test-list-hash-1', $output);
        $this->assertStringNotContainsString('test-list-hash-2', $output);
        $this->assertStringContainsString('test-list-hash-3', $output);
    }

    /**
     * Test CSV export
     */
    public function testCSVExport(): void
    {
        $csvFile = sys_get_temp_dir() . '/test-duplicates.csv';
        
        $exitCode = $this->commandTester->execute([
            '--csv' => $csvFile
        ]);

        $this->assertEquals(0, $exitCode);
        $this->assertFileExists($csvFile);

        // Verify CSV content
        $csvContent = file_get_contents($csvFile);
        $this->assertStringContainsString('Hash,Path,Size,Owner', $csvContent);
        $this->assertStringContainsString('test-list-hash-1', $csvContent);
        $this->assertStringContainsString('test-list-hash-2', $csvContent);
        $this->assertStringContainsString('test-list-hash-3', $csvContent);

        // Clean up
        unlink($csvFile);
    }

    /**
     * Test JSON export
     */
    public function testJSONExport(): void
    {
        $jsonFile = sys_get_temp_dir() . '/test-duplicates.json';
        
        $exitCode = $this->commandTester->execute([
            '--json' => $jsonFile
        ]);

        $this->assertEquals(0, $exitCode);
        $this->assertFileExists($jsonFile);

        // Verify JSON content
        $jsonContent = file_get_contents($jsonFile);
        $data = json_decode($jsonContent, true);
        
        $this->assertIsArray($data);
        $this->assertArrayHasKey('duplicates', $data);
        $this->assertCount(3, $data['duplicates']);
        
        // Verify structure
        foreach ($data['duplicates'] as $duplicate) {
            $this->assertArrayHasKey('hash', $duplicate);
            $this->assertArrayHasKey('files', $duplicate);
            $this->assertArrayHasKey('acknowledged', $duplicate);
            $this->assertIsArray($duplicate['files']);
        }

        // Clean up
        unlink($jsonFile);
    }

    /**
     * Test with no duplicates
     */
    public function testNoDuplicates(): void
    {
        // Clear all test duplicates
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_duplicates')
            ->where($query->expr()->like('hash', $query->createNamedParameter('test-list-%')));
        $query->executeStatement();

        $exitCode = $this->commandTester->execute([]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();
        $this->assertStringContainsString('No duplicates found', $output);
    }

    /**
     * Test summary statistics
     */
    public function testSummaryStatistics(): void
    {
        $exitCode = $this->commandTester->execute([
            '--summary' => true
        ]);

        $this->assertEquals(0, $exitCode);
        $output = $this->commandTester->getDisplay();

        // Should show summary
        $this->assertStringContainsString('Total duplicate groups: 3', $output);
        $this->assertStringContainsString('Total duplicate files: 9', $output); // 2+3+4
        $this->assertStringContainsString('Acknowledged groups: 1', $output);
        $this->assertStringContainsString('Unacknowledged groups: 2', $output);
    }
}