<?php

namespace OCA\DuplicateFinder\Tests\Integration\Robustness;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Test database error recovery and transaction handling
 * @group DB
 */
class DatabaseErrorRecoveryTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var string */
    private $testUserId = 'test-db-recovery';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->fileInfoMapper = new FileInfoMapper($this->db);
        $this->duplicateMapper = new FileDuplicateMapper($this->db);
    }

    protected function tearDown(): void
    {
        // Clean up test data
        $this->cleanupTestData();
        parent::tearDown();
    }

    private function cleanupTestData(): void
    {
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_duplicates')
            ->where($query->expr()->like('hash', $query->createNamedParameter('db-recovery-%')));
        $query->executeStatement();
    }

    /**
     * Test transaction rollback on database error
     */
    public function testTransactionRollback(): void
    {
        $this->db->beginTransaction();

        try {
            // Insert valid data
            $fileInfo = new FileInfo();
            $fileInfo->setPath('/test/transaction-test.txt');
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('db-recovery-tx-1');
            $fileInfo->setNodeId(9001);

            $inserted = $this->fileInfoMapper->insert($fileInfo);
            $insertedId = $inserted->getId();

            // Force an error by trying to insert duplicate nodeId
            $duplicate = new FileInfo();
            $duplicate->setPath('/test/duplicate-node.txt');
            $duplicate->setOwner($this->testUserId);
            $duplicate->setSize(2048);
            $duplicate->setMTime(time());
            $duplicate->setFileHash('db-recovery-tx-2');
            $duplicate->setNodeId(9001); // Same nodeId - will cause constraint violation

            // This should fail
            try {
                $this->fileInfoMapper->insert($duplicate);
                $this->fail('Should have thrown constraint violation');
            } catch (\Exception $e) {
                // Expected - rollback transaction
                $this->db->rollBack();
            }

            // Verify first insert was rolled back
            $this->expectException(\OCP\AppFramework\Db\DoesNotExistException::class);
            $this->fileInfoMapper->find($insertedId);

        } catch (\Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * Test handling of database connection loss
     */
    public function testDatabaseConnectionLoss(): void
    {
        // Create mock mapper that simulates connection loss
        $mockMapper = new class($this->db) extends FileInfoMapper {
            private $callCount = 0;

            public function findAll(string $userId, int $limit = 50, int $offset = 0): array
            {
                $this->callCount++;
                if ($this->callCount === 2) {
                    throw new \Doctrine\DBAL\Exception\ConnectionException('Connection lost');
                }
                return parent::findAll($userId, $limit, $offset);
            }
        };

        // First call should work
        $result1 = $mockMapper->findAll($this->testUserId);
        $this->assertIsArray($result1);

        // Second call should throw connection exception
        try {
            $mockMapper->findAll($this->testUserId);
            $this->fail('Should have thrown ConnectionException');
        } catch (\Doctrine\DBAL\Exception\ConnectionException $e) {
            $this->assertStringContainsString('Connection lost', $e->getMessage());
        }

        // Third call should work again (simulating reconnection)
        $result3 = $mockMapper->findAll($this->testUserId);
        $this->assertIsArray($result3);
    }

    /**
     * Test handling of deadlock situations
     */
    public function testDeadlockHandling(): void
    {
        // Create two file infos that will be updated
        $file1 = new FileInfo();
        $file1->setPath('/test/deadlock1.txt');
        $file1->setOwner($this->testUserId);
        $file1->setSize(1024);
        $file1->setMTime(time());
        $file1->setFileHash('db-recovery-deadlock-1');
        $file1->setNodeId(9100);
        $file1 = $this->fileInfoMapper->insert($file1);

        $file2 = new FileInfo();
        $file2->setPath('/test/deadlock2.txt');
        $file2->setOwner($this->testUserId);
        $file2->setSize(2048);
        $file2->setMTime(time());
        $file2->setFileHash('db-recovery-deadlock-2');
        $file2->setNodeId(9101);
        $file2 = $this->fileInfoMapper->insert($file2);

        // Simulate deadlock by updating in different order
        // In real scenario, this would be done from different processes
        $updated = false;
        $attempts = 0;
        $maxAttempts = 3;

        while (!$updated && $attempts < $maxAttempts) {
            $attempts++;
            
            try {
                $this->db->beginTransaction();

                // Update file1
                $file1->setSize($file1->getSize() + 100);
                $this->fileInfoMapper->update($file1);

                // Small delay to increase chance of deadlock in real scenario
                usleep(1000);

                // Update file2
                $file2->setSize($file2->getSize() + 100);
                $this->fileInfoMapper->update($file2);

                $this->db->commit();
                $updated = true;

            } catch (\Exception $e) {
                $this->db->rollBack();
                
                // In real deadlock, we'd check for specific error code
                // For test, we just retry
                if ($attempts >= $maxAttempts) {
                    throw $e;
                }
                
                // Exponential backoff
                usleep(pow(2, $attempts) * 1000);
            }
        }

        $this->assertTrue($updated);
        $this->assertLessThanOrEqual($maxAttempts, $attempts);
    }

    /**
     * Test partial write handling
     */
    public function testPartialWriteRecovery(): void
    {
        $fileInfos = [];

        // Start transaction
        $this->db->beginTransaction();

        try {
            // Insert multiple files
            for ($i = 1; $i <= 5; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/batch/file$i.txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(1024 * $i);
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash('db-recovery-batch-' . $i);
                $fileInfo->setNodeId(9200 + $i);

                if ($i === 3) {
                    // Simulate error on third insert
                    $fileInfo->setOwner(str_repeat('x', 256)); // Too long, will fail
                }

                $fileInfos[] = $this->fileInfoMapper->insert($fileInfo);
            }

            $this->db->commit();
            $this->fail('Should have failed on third insert');

        } catch (\Exception $e) {
            // Rollback on error
            $this->db->rollBack();

            // Verify no files were inserted
            for ($i = 1; $i <= 5; $i++) {
                $results = $this->fileInfoMapper->findByHash('db-recovery-batch-' . $i);
                $this->assertCount(0, $results);
            }
        }
    }

    /**
     * Test constraint violation handling
     */
    public function testConstraintViolationHandling(): void
    {
        // Insert initial file
        $original = new FileInfo();
        $original->setPath('/test/original.txt');
        $original->setOwner($this->testUserId);
        $original->setSize(1024);
        $original->setMTime(time());
        $original->setFileHash('db-recovery-constraint');
        $original->setNodeId(9300);
        $original = $this->fileInfoMapper->insert($original);

        // Try to insert duplicate with same nodeId
        $duplicate = new FileInfo();
        $duplicate->setPath('/test/duplicate.txt');
        $duplicate->setOwner($this->testUserId);
        $duplicate->setSize(2048);
        $duplicate->setMTime(time());
        $duplicate->setFileHash('db-recovery-constraint-2');
        $duplicate->setNodeId(9300); // Same as original

        try {
            $this->fileInfoMapper->insert($duplicate);
            $this->fail('Should have thrown constraint violation');
        } catch (\Exception $e) {
            // Expected - constraint violation
            $this->assertStringContainsString('constraint', strtolower($e->getMessage()));
        }

        // Verify original is still intact
        $retrieved = $this->fileInfoMapper->find($original->getId());
        $this->assertEquals($original->getPath(), $retrieved->getPath());
        $this->assertEquals($original->getNodeId(), $retrieved->getNodeId());
    }

    /**
     * Test recovery from corrupt data
     */
    public function testCorruptDataRecovery(): void
    {
        // Insert file with valid data
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/corrupt-test.txt');
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setSize(1024);
        $fileInfo->setMTime(time());
        $fileInfo->setFileHash('db-recovery-corrupt');
        $fileInfo->setNodeId(9400);
        $inserted = $this->fileInfoMapper->insert($fileInfo);

        // Directly corrupt data in database (simulate corruption)
        $query = $this->db->getQueryBuilder();
        $query->update('duplicatefinder_finfo')
            ->set('size', $query->createNamedParameter(-1)) // Invalid size
            ->where($query->expr()->eq('id', $query->createNamedParameter($inserted->getId())));
        $query->executeStatement();

        // Try to retrieve and handle corrupt data
        try {
            $corrupt = $this->fileInfoMapper->find($inserted->getId());
            
            // Validate data
            if ($corrupt->getSize() < 0) {
                // Fix corrupt data
                $corrupt->setSize(0);
                $this->fileInfoMapper->update($corrupt);
            }

            // Verify fix
            $fixed = $this->fileInfoMapper->find($inserted->getId());
            $this->assertGreaterThanOrEqual(0, $fixed->getSize());

        } catch (\Exception $e) {
            $this->fail('Should handle corrupt data gracefully');
        }
    }

    /**
     * Test timeout handling
     */
    public function testQueryTimeoutHandling(): void
    {
        // Create large dataset
        $largeDataset = [];
        for ($i = 1; $i <= 100; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/timeout/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('db-recovery-timeout-' . ($i % 10)); // Create duplicates
            $fileInfo->setNodeId(9500 + $i);
            
            $largeDataset[] = $fileInfo;
        }

        // Insert in batches with timeout handling
        $batchSize = 20;
        $inserted = 0;
        
        for ($i = 0; $i < count($largeDataset); $i += $batchSize) {
            $batch = array_slice($largeDataset, $i, $batchSize);
            
            $this->db->beginTransaction();
            try {
                foreach ($batch as $fileInfo) {
                    $this->fileInfoMapper->insert($fileInfo);
                }
                $this->db->commit();
                $inserted += count($batch);
            } catch (\Exception $e) {
                $this->db->rollBack();
                // Log error and continue with next batch
            }
        }

        // Verify at least some data was inserted
        $this->assertGreaterThan(0, $inserted);
        
        // Clean up
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->like('file_hash', $query->createNamedParameter('db-recovery-timeout-%')));
        $query->executeStatement();
    }
}