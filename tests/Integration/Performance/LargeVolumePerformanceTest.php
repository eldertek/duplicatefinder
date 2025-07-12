<?php

namespace OCA\DuplicateFinder\Tests\Integration\Performance;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\HashService;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Performance tests with large data volumes
 * @group DB
 * @group Performance
 */
class LargeVolumePerformanceTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var array */
    private $performanceMetrics = [];

    /** @var string */
    private $testUserId = 'test-perf-user';

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

        // Output performance metrics
        if (!empty($this->performanceMetrics)) {
            echo "\n\nPerformance Metrics:\n";
            echo "====================\n";
            foreach ($this->performanceMetrics as $metric => $value) {
                echo sprintf("%-30s: %s\n", $metric, $value);
            }
        }

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
            ->where($query->expr()->like('hash', $query->createNamedParameter('perf-test-%')));
        $query->executeStatement();
    }

    /**
     * Test performance with 10,000 files
     */
    public function testLargeFileSetPerformance(): void
    {
        $fileCount = 10000;
        $duplicateRatio = 0.2; // 20% duplicates
        $batchSize = 100;

        $startTime = microtime(true);
        $insertedFiles = 0;

        // Insert files in batches
        for ($batch = 0; $batch < $fileCount / $batchSize; $batch++) {
            $this->db->beginTransaction();
            
            try {
                for ($i = 0; $i < $batchSize; $i++) {
                    $fileNum = $batch * $batchSize + $i;
                    
                    // Create some duplicates based on ratio
                    $isDuplicate = (mt_rand(1, 100) / 100) <= $duplicateRatio;
                    $hash = $isDuplicate 
                        ? 'perf-test-dup-' . mt_rand(1, 100)
                        : 'perf-test-unique-' . $fileNum;

                    $fileInfo = new FileInfo();
                    $fileInfo->setPath("/test/perf/file_{$fileNum}.dat");
                    $fileInfo->setOwner($this->testUserId);
                    $fileInfo->setSize(mt_rand(1024, 10485760)); // 1KB to 10MB
                    $fileInfo->setMTime(time() - mt_rand(0, 86400 * 365)); // Up to 1 year old
                    $fileInfo->setFileHash($hash);
                    $fileInfo->setNodeId(30000 + $fileNum);

                    $this->fileInfoMapper->insert($fileInfo);
                    $insertedFiles++;
                }
                
                $this->db->commit();
            } catch (\Exception $e) {
                $this->db->rollBack();
                throw $e;
            }
        }

        $insertTime = microtime(true) - $startTime;
        $this->performanceMetrics['Insert Time (10k files)'] = sprintf('%.2f seconds', $insertTime);
        $this->performanceMetrics['Insert Rate'] = sprintf('%.0f files/second', $fileCount / $insertTime);

        // Test query performance
        $this->measureQueryPerformance();

        // Test duplicate detection performance
        $this->measureDuplicateDetectionPerformance();

        // Verify data integrity
        $totalFiles = count($this->fileInfoMapper->findAll($this->testUserId, $fileCount, 0));
        $this->assertEquals($insertedFiles, $totalFiles);
    }

    /**
     * Test performance with very large files
     */
    public function testLargeFileHashingPerformance(): void
    {
        $hashService = new HashService();
        $fileSizes = [
            '1MB' => 1048576,
            '10MB' => 10485760,
            '100MB' => 104857600,
            '500MB' => 524288000,
        ];

        foreach ($fileSizes as $label => $size) {
            // Create mock file with specific size
            $mockFile = new class($size) implements \OCP\Files\File {
                private $size;
                private $content;

                public function __construct($size)
                {
                    $this->size = $size;
                    // Generate predictable content without storing it all in memory
                }

                public function getContent()
                {
                    // Generate content in chunks to avoid memory issues
                    $chunkSize = 1048576; // 1MB chunks
                    $content = '';
                    
                    for ($i = 0; $i < $this->size; $i += $chunkSize) {
                        $remainingSize = min($chunkSize, $this->size - $i);
                        $content .= str_repeat(chr(65 + ($i % 26)), $remainingSize);
                    }
                    
                    return $content;
                }

                public function fopen(string $mode)
                {
                    $stream = fopen('php://temp', 'r+');
                    
                    // Write content in chunks
                    $chunkSize = 1048576; // 1MB chunks
                    for ($i = 0; $i < $this->size; $i += $chunkSize) {
                        $remainingSize = min($chunkSize, $this->size - $i);
                        fwrite($stream, str_repeat(chr(65 + ($i % 26)), $remainingSize));
                    }
                    
                    rewind($stream);
                    return $stream;
                }

                public function getId(): int { return 1; }
                public function getPath(): string { return '/test/large.dat'; }
                public function getName(): string { return 'large.dat'; }
                public function getMTime(): int { return time(); }
                public function getSize(): int { return $this->size; }
                public function getMimetype(): string { return 'application/octet-stream'; }
                public function delete(): void {}
                public function putContent($data): void {}
                public function getChecksum(): string { return ''; }
                public function getExtension(): string { return 'dat'; }
                public function getCreationTime(): int { return time(); }
                public function getUploadTime(): int { return time(); }
            };

            $startTime = microtime(true);
            $hash = $hashService->calculateHash($mockFile);
            $hashTime = microtime(true) - $startTime;

            $this->assertNotEmpty($hash);
            $this->performanceMetrics["Hash Time ($label)"] = sprintf('%.2f seconds', $hashTime);
            $this->performanceMetrics["Hash Speed ($label)"] = sprintf('%.0f MB/s', ($size / 1048576) / $hashTime);
        }
    }

    /**
     * Test performance of finding duplicates in large dataset
     */
    public function testDuplicateFindingPerformance(): void
    {
        // Create a dataset with known duplicate patterns
        $this->createLargeDuplicateDataset();

        $startTime = microtime(true);

        // Find all duplicates
        $duplicateService = new FileDuplicateService(
            $this->duplicateMapper,
            $this->createMock(FileInfoService::class),
            $this->createMock(\OCA\DuplicateFinder\Service\OriginFolderService::class),
            $this->createMock(\Psr\Log\LoggerInterface::class)
        );

        $result = $duplicateService->findAll(1000, 0);
        $findTime = microtime(true) - $startTime;

        $this->performanceMetrics['Find Duplicates Time'] = sprintf('%.2f seconds', $findTime);
        $this->performanceMetrics['Duplicate Groups Found'] = count($result['entities']);

        // Test pagination performance
        $this->measurePaginationPerformance($duplicateService);
    }

    /**
     * Test bulk operations performance
     */
    public function testBulkOperationPerformance(): void
    {
        $operationSizes = [100, 500, 1000, 5000];

        foreach ($operationSizes as $size) {
            // Create files for bulk operation
            $files = [];
            for ($i = 0; $i < $size; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/bulk/op_{$size}_file_{$i}.txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(mt_rand(1024, 10240));
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash('perf-bulk-' . $size . '-' . $i);
                $fileInfo->setNodeId(40000 + $size * 1000 + $i);

                $files[] = $this->fileInfoMapper->insert($fileInfo);
            }

            // Measure bulk update
            $startTime = microtime(true);
            $this->db->beginTransaction();
            
            foreach ($files as $file) {
                $file->setSize($file->getSize() * 2);
                $this->fileInfoMapper->update($file);
            }
            
            $this->db->commit();
            $updateTime = microtime(true) - $startTime;

            $this->performanceMetrics["Bulk Update ($size files)"] = sprintf('%.2f seconds', $updateTime);
            $this->performanceMetrics["Update Rate ($size)"] = sprintf('%.0f ops/second', $size / $updateTime);

            // Measure bulk delete
            $startTime = microtime(true);
            $this->db->beginTransaction();
            
            foreach ($files as $file) {
                $this->fileInfoMapper->delete($file);
            }
            
            $this->db->commit();
            $deleteTime = microtime(true) - $startTime;

            $this->performanceMetrics["Bulk Delete ($size files)"] = sprintf('%.2f seconds', $deleteTime);
            $this->performanceMetrics["Delete Rate ($size)"] = sprintf('%.0f ops/second', $size / $deleteTime);
        }
    }

    /**
     * Test memory usage with large result sets
     */
    public function testMemoryUsageWithLargeResults(): void
    {
        $initialMemory = memory_get_usage(true);

        // Create large dataset
        $this->createLargeDuplicateDataset();

        // Load large result set
        $results = $this->fileInfoMapper->findAll($this->testUserId, 5000, 0);
        $peakMemory = memory_get_peak_usage(true);
        
        $memoryUsed = ($peakMemory - $initialMemory) / 1048576; // Convert to MB
        $this->performanceMetrics['Memory Usage (5k records)'] = sprintf('%.2f MB', $memoryUsed);

        // Test memory efficiency
        $this->assertLessThan(100, $memoryUsed, 'Memory usage should be under 100MB for 5000 records');

        // Clean up to free memory
        unset($results);
        gc_collect_cycles();
    }

    /**
     * Test concurrent access performance
     */
    public function testConcurrentAccessPerformance(): void
    {
        $concurrentUsers = 10;
        $operationsPerUser = 100;
        
        $startTime = microtime(true);

        // Simulate concurrent operations
        for ($user = 0; $user < $concurrentUsers; $user++) {
            $userId = $this->testUserId . '-' . $user;
            
            // Each user performs operations
            for ($op = 0; $op < $operationsPerUser; $op++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/concurrent/user{$user}/file{$op}.txt");
                $fileInfo->setOwner($userId);
                $fileInfo->setSize(mt_rand(1024, 10240));
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash('perf-concurrent-' . $user . '-' . $op);
                $fileInfo->setNodeId(50000 + $user * 1000 + $op);

                try {
                    $this->fileInfoMapper->insert($fileInfo);
                } catch (\Exception $e) {
                    // Handle potential conflicts
                }
            }
        }

        $totalTime = microtime(true) - $startTime;
        $totalOperations = $concurrentUsers * $operationsPerUser;

        $this->performanceMetrics['Concurrent Ops Time'] = sprintf('%.2f seconds', $totalTime);
        $this->performanceMetrics['Concurrent Throughput'] = sprintf('%.0f ops/second', $totalOperations / $totalTime);
    }

    private function measureQueryPerformance(): void
    {
        // Test various query patterns
        $queries = [
            'Find by hash' => function() {
                $this->fileInfoMapper->findByHash('perf-test-dup-50');
            },
            'Find by user (limit 100)' => function() {
                $this->fileInfoMapper->findAll($this->testUserId, 100, 0);
            },
            'Find by user (limit 1000)' => function() {
                $this->fileInfoMapper->findAll($this->testUserId, 1000, 0);
            },
            'Count by user' => function() {
                $query = $this->db->getQueryBuilder();
                $query->select($query->func()->count('*'))
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
                $query->execute()->fetchOne();
            },
        ];

        foreach ($queries as $label => $query) {
            $startTime = microtime(true);
            
            for ($i = 0; $i < 10; $i++) {
                $query();
            }
            
            $avgTime = (microtime(true) - $startTime) / 10;
            $this->performanceMetrics["Query: $label"] = sprintf('%.3f ms', $avgTime * 1000);
        }
    }

    private function measureDuplicateDetectionPerformance(): void
    {
        $startTime = microtime(true);

        // Find all duplicate hashes
        $query = $this->db->getQueryBuilder();
        $query->select('file_hash')
            ->selectAlias($query->func()->count('*'), 'count')
            ->from('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)))
            ->groupBy('file_hash')
            ->having($query->expr()->gt('count', $query->createNamedParameter(1, \PDO::PARAM_INT)));
        
        $result = $query->execute();
        $duplicates = $result->fetchAll();
        $result->closeCursor();

        $detectTime = microtime(true) - $startTime;
        $this->performanceMetrics['Duplicate Detection Time'] = sprintf('%.2f seconds', $detectTime);
        $this->performanceMetrics['Duplicate Groups'] = count($duplicates);
    }

    private function measurePaginationPerformance(FileDuplicateService $service): void
    {
        $pageSizes = [10, 50, 100, 500];

        foreach ($pageSizes as $pageSize) {
            $startTime = microtime(true);
            
            // Fetch first page
            $result = $service->findAll($pageSize, 0);
            
            $fetchTime = microtime(true) - $startTime;
            $this->performanceMetrics["Pagination ($pageSize items)"] = sprintf('%.3f ms', $fetchTime * 1000);
        }
    }

    private function createLargeDuplicateDataset(): void
    {
        $duplicateGroups = 100;
        $filesPerGroup = 5;
        $uniqueFiles = 500;

        // Create duplicate groups
        for ($group = 0; $group < $duplicateGroups; $group++) {
            $hash = 'perf-test-group-' . $group;
            
            for ($file = 0; $file < $filesPerGroup; $file++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/duplicates/group{$group}/copy{$file}.dat");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(mt_rand(10240, 1048576));
                $fileInfo->setMTime(time() - mt_rand(0, 86400));
                $fileInfo->setFileHash($hash);
                $fileInfo->setNodeId(60000 + $group * 10 + $file);

                $this->fileInfoMapper->insert($fileInfo);
            }
        }

        // Create unique files
        for ($i = 0; $i < $uniqueFiles; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/unique/file{$i}.dat");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(mt_rand(1024, 102400));
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('perf-test-unique-dataset-' . $i);
            $fileInfo->setNodeId(70000 + $i);

            $this->fileInfoMapper->insert($fileInfo);
        }
    }
}