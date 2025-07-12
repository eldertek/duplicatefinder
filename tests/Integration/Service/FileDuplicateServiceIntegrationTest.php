<?php

namespace OCA\DuplicateFinder\Tests\Integration\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;
use Test\TestCase;

/**
 * Integration test for FileDuplicateService with real database
 * @group DB
 */
class FileDuplicateServiceIntegrationTest extends TestCase
{
    /** @var FileDuplicateService */
    private $service;

    /** @var IDBConnection */
    private $db;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileInfoService */
    private $fileInfoService;

    private $testUserId = 'test-duplicate-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->duplicateMapper = new FileDuplicateMapper($this->db);
        $this->fileInfoMapper = new FileInfoMapper($this->db);

        // Mock dependencies
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $originFolderService = $this->createMock(OriginFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $this->service = new FileDuplicateService(
            $this->duplicateMapper,
            $this->fileInfoService,
            $originFolderService,
            $logger
        );
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
            ->where($query->expr()->like('hash', $query->createNamedParameter('test-%')));
        $query->executeStatement();

        parent::tearDown();
    }

    /**
     * Test creating and managing duplicate groups
     */
    public function testCreateDuplicateGroup(): void
    {
        $hash = 'test-hash-' . time();

        // Create file infos
        $files = [];
        for ($i = 1; $i <= 3; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/dup$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setFileHash($hash);
            $fileInfo->setNodeId(1000 + $i);

            $files[] = $this->fileInfoMapper->insert($fileInfo);
        }

        // Mock fileInfoService to return our files
        $this->fileInfoService->method('findByHash')
            ->with($hash)
            ->willReturn($files);

        // Create duplicate group
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setAcknowledged(false);

        $saved = $this->duplicateMapper->insert($duplicate);
        $this->assertNotNull($saved->getId());

        // Find duplicate by hash
        $found = $this->service->find($hash);
        $this->assertEquals($hash, $found->getHash());
        $this->assertCount(3, $found->getFiles());
    }

    /**
     * Test acknowledging duplicates
     */
    public function testAcknowledgeDuplicate(): void
    {
        $hash = 'test-ack-hash-' . time();

        // Create duplicate
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setAcknowledged(false);

        $saved = $this->duplicateMapper->insert($duplicate);
        $this->assertFalse($saved->getAcknowledged());

        // Mock empty files for simplicity
        $this->fileInfoService->method('findByHash')->willReturn([]);

        // Acknowledge
        $acknowledged = $this->service->acknowledge($hash);
        $this->assertTrue($acknowledged->getAcknowledged());

        // Verify in database
        $retrieved = $this->duplicateMapper->find($hash);
        $this->assertTrue($retrieved->getAcknowledged());
    }

    /**
     * Test pagination
     */
    public function testPagination(): void
    {
        // Create multiple duplicate groups
        for ($i = 1; $i <= 15; $i++) {
            $duplicate = new FileDuplicate();
            $duplicate->setHash('test-page-hash-' . $i);
            $duplicate->setAcknowledged(false);

            $this->duplicateMapper->insert($duplicate);
        }

        // Mock fileInfoService to return empty arrays
        $this->fileInfoService->method('findByHash')->willReturn([]);

        // Test first page
        $result = $this->service->findAll(10, 0);
        $this->assertArrayHasKey('entities', $result);
        $this->assertArrayHasKey('pagination', $result);
        $this->assertLessThanOrEqual(10, count($result['entities']));

        // Test second page
        $result2 = $this->service->findAll(10, 10);
        $this->assertLessThanOrEqual(5, count($result2['entities']));
    }

    /**
     * Test cleaning orphaned duplicates
     */
    public function testCleanOrphanedDuplicates(): void
    {
        $hash = 'test-orphan-hash-' . time();

        // Create duplicate without any files
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setAcknowledged(false);

        $saved = $this->duplicateMapper->insert($duplicate);

        // Mock no files found
        $this->fileInfoService->method('findByHash')
            ->with($hash)
            ->willReturn([]);

        // Try to find - should clean up orphaned duplicate
        try {
            $this->service->find($hash);
            $this->fail('Should have thrown exception for orphaned duplicate');
        } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
            // Expected - duplicate should be deleted
        }

        // Verify it's deleted from database
        $this->expectException(\OCP\AppFramework\Db\DoesNotExistException::class);
        $this->duplicateMapper->find($hash);
    }

    /**
     * Test concurrent access handling
     */
    public function testConcurrentAccess(): void
    {
        $hash = 'test-concurrent-' . time();

        // Create duplicate
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setAcknowledged(false);

        $saved1 = $this->duplicateMapper->insert($duplicate);

        // Try to insert same hash again (simulate concurrent access)
        try {
            $duplicate2 = new FileDuplicate();
            $duplicate2->setHash($hash);
            $duplicate2->setAcknowledged(false);

            $this->duplicateMapper->insert($duplicate2);
            $this->fail('Should not allow duplicate hash insertion');
        } catch (\Exception $e) {
            // Expected - unique constraint should prevent this
        }

        // Verify only one exists
        $found = $this->duplicateMapper->find($hash);
        $this->assertEquals($saved1->getId(), $found->getId());
    }
}
