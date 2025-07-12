<?php

namespace OCA\DuplicateFinder\Tests\Integration\Performance;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Test database index performance and query optimization
 * @group DB
 * @group Performance
 */
class IndexOptimizationTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var array */
    private $queryMetrics = [];

    /** @var string */
    private $testUserId = 'test-index-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->mapper = new FileInfoMapper($this->db);

        // Create substantial dataset for meaningful measurements
        $this->createTestDataset();
    }

    protected function tearDown(): void
    {
        // Clean up
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->like('owner', $query->createNamedParameter('test-index-%')));
        $query->executeStatement();

        // Output query metrics
        if (!empty($this->queryMetrics)) {
            echo "\n\nQuery Performance Metrics:\n";
            echo "=========================\n";
            foreach ($this->queryMetrics as $metric => $value) {
                echo sprintf("%-40s: %s\n", $metric, $value);
            }

            // Analyze and suggest optimizations
            $this->suggestOptimizations();
        }

        parent::tearDown();
    }

    /**
     * Test performance of hash-based queries
     */
    public function testHashIndexPerformance(): void
    {
        $testHashes = [
            'index-test-common-1',    // Many duplicates
            'index-test-rare-999',    // Few duplicates
            'index-test-unique-5000', // Unique
        ];

        foreach ($testHashes as $hash) {
            $this->measureQueryPerformance(
                "Hash lookup: $hash",
                function() use ($hash) {
                    return $this->mapper->findByHash($hash);
                }
            );
        }

        // Test hash prefix search (if supported)
        $this->measureQueryPerformance(
            'Hash prefix search',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('*')
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->like('file_hash', 
                        $query->createNamedParameter('index-test-common-%')));
                return $query->execute()->fetchAll();
            }
        );
    }

    /**
     * Test performance of user-based queries
     */
    public function testUserIndexPerformance(): void
    {
        $users = [
            'test-index-user-1',  // 10k files
            'test-index-user-2',  // 5k files
            'test-index-user-3',  // 1k files
        ];

        foreach ($users as $user) {
            // Test different limit values
            foreach ([10, 100, 1000] as $limit) {
                $this->measureQueryPerformance(
                    "User files (limit $limit): $user",
                    function() use ($user, $limit) {
                        return $this->mapper->findAll($user, $limit, 0);
                    }
                );
            }
        }
    }

    /**
     * Test composite index effectiveness
     */
    public function testCompositeIndexPerformance(): void
    {
        // Query using both owner and hash
        $this->measureQueryPerformance(
            'Composite: owner + hash',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('*')
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->andX(
                        $query->expr()->eq('owner', 
                            $query->createNamedParameter('test-index-user-1')),
                        $query->expr()->eq('file_hash', 
                            $query->createNamedParameter('index-test-common-1'))
                    ));
                return $query->execute()->fetchAll();
            }
        );

        // Query using owner and size range
        $this->measureQueryPerformance(
            'Composite: owner + size range',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('*')
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->andX(
                        $query->expr()->eq('owner', 
                            $query->createNamedParameter('test-index-user-1')),
                        $query->expr()->gte('size', 
                            $query->createNamedParameter(1048576, \PDO::PARAM_INT)),
                        $query->expr()->lte('size', 
                            $query->createNamedParameter(10485760, \PDO::PARAM_INT))
                    ));
                return $query->execute()->fetchAll();
            }
        );
    }

    /**
     * Test sorting performance
     */
    public function testSortingPerformance(): void
    {
        $sortColumns = [
            'size' => 'File size',
            'mtime' => 'Modification time',
            'path' => 'File path',
            'file_hash' => 'File hash',
        ];

        foreach ($sortColumns as $column => $label) {
            $this->measureQueryPerformance(
                "Sort by $label (ASC)",
                function() use ($column) {
                    $query = $this->db->getQueryBuilder();
                    $query->select('*')
                        ->from('duplicatefinder_finfo')
                        ->where($query->expr()->eq('owner', 
                            $query->createNamedParameter('test-index-user-1')))
                        ->orderBy($column, 'ASC')
                        ->setMaxResults(100);
                    return $query->execute()->fetchAll();
                }
            );

            $this->measureQueryPerformance(
                "Sort by $label (DESC)",
                function() use ($column) {
                    $query = $this->db->getQueryBuilder();
                    $query->select('*')
                        ->from('duplicatefinder_finfo')
                        ->where($query->expr()->eq('owner', 
                            $query->createNamedParameter('test-index-user-1')))
                        ->orderBy($column, 'DESC')
                        ->setMaxResults(100);
                    return $query->execute()->fetchAll();
                }
            );
        }
    }

    /**
     * Test aggregation query performance
     */
    public function testAggregationPerformance(): void
    {
        // Count duplicates per hash
        $this->measureQueryPerformance(
            'Count duplicates per hash',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('file_hash')
                    ->selectAlias($query->func()->count('*'), 'count')
                    ->from('duplicatefinder_finfo')
                    ->groupBy('file_hash')
                    ->having($query->expr()->gt('count', 
                        $query->createNamedParameter(1, \PDO::PARAM_INT)))
                    ->orderBy('count', 'DESC')
                    ->setMaxResults(100);
                return $query->execute()->fetchAll();
            }
        );

        // Sum of file sizes per user
        $this->measureQueryPerformance(
            'Sum file sizes per user',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('owner')
                    ->selectAlias($query->func()->sum('size'), 'total_size')
                    ->selectAlias($query->func()->count('*'), 'file_count')
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->like('owner', 
                        $query->createNamedParameter('test-index-%')))
                    ->groupBy('owner');
                return $query->execute()->fetchAll();
            }
        );
    }

    /**
     * Test JOIN performance
     */
    public function testJoinPerformance(): void
    {
        // Self-join to find duplicates
        $this->measureQueryPerformance(
            'Self-join for duplicates',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('f1.*')
                    ->from('duplicatefinder_finfo', 'f1')
                    ->innerJoin('f1', 'duplicatefinder_finfo', 'f2',
                        $query->expr()->andX(
                            $query->expr()->eq('f1.file_hash', 'f2.file_hash'),
                            $query->expr()->neq('f1.id', 'f2.id')
                        )
                    )
                    ->where($query->expr()->eq('f1.owner', 
                        $query->createNamedParameter('test-index-user-1')))
                    ->setMaxResults(100);
                return $query->execute()->fetchAll();
            }
        );

        // Join with duplicates table
        $this->measureQueryPerformance(
            'Join with duplicates table',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('f.*', 'd.acknowledged')
                    ->from('duplicatefinder_finfo', 'f')
                    ->innerJoin('f', 'duplicatefinder_duplicates', 'd',
                        $query->expr()->eq('f.file_hash', 'd.hash')
                    )
                    ->where($query->expr()->eq('f.owner', 
                        $query->createNamedParameter('test-index-user-1')))
                    ->setMaxResults(100);
                return $query->execute()->fetchAll();
            }
        );
    }

    /**
     * Test full table scan scenarios
     */
    public function testFullTableScanScenarios(): void
    {
        // Query without proper index usage
        $this->measureQueryPerformance(
            'Full scan: LIKE on path',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('*')
                    ->from('duplicatefinder_finfo')
                    ->where($query->expr()->like('path', 
                        $query->createNamedParameter('%/documents/%')))
                    ->setMaxResults(100);
                return $query->execute()->fetchAll();
            }
        );

        // Function on indexed column
        $this->measureQueryPerformance(
            'Full scan: Function on indexed column',
            function() {
                $query = $this->db->getQueryBuilder();
                $query->select('*')
                    ->from('duplicatefinder_finfo')
                    ->where('LOWER(owner) = ' . 
                        $query->createNamedParameter('test-index-user-1'))
                    ->setMaxResults(100);
                return $query->execute()->fetchAll();
            }
        );
    }

    /**
     * Test pagination performance
     */
    public function testPaginationPerformance(): void
    {
        $pageSize = 100;
        $pages = [1, 10, 50, 100];

        foreach ($pages as $page) {
            $offset = ($page - 1) * $pageSize;
            
            $this->measureQueryPerformance(
                "Pagination: Page $page",
                function() use ($pageSize, $offset) {
                    return $this->mapper->findAll('test-index-user-1', $pageSize, $offset);
                }
            );
        }

        // Test deep pagination problem
        $this->measureQueryPerformance(
            'Deep pagination (offset 10000)',
            function() {
                return $this->mapper->findAll('test-index-user-1', 100, 10000);
            }
        );
    }

    private function createTestDataset(): void
    {
        // Create users with different file counts
        $users = [
            'test-index-user-1' => 10000,
            'test-index-user-2' => 5000,
            'test-index-user-3' => 1000,
        ];

        foreach ($users as $userId => $fileCount) {
            $this->createUserFiles($userId, $fileCount);
        }

        // Create duplicate groups
        $this->createDuplicateGroups();
    }

    private function createUserFiles(string $userId, int $count): void
    {
        $batchSize = 500;
        
        for ($i = 0; $i < $count; $i += $batchSize) {
            $this->db->beginTransaction();
            
            for ($j = 0; $j < $batchSize && ($i + $j) < $count; $j++) {
                $fileNum = $i + $j;
                
                // Create varied data for realistic testing
                $fileInfo = new FileInfo();
                $fileInfo->setPath($this->generateRealisticPath($fileNum));
                $fileInfo->setOwner($userId);
                $fileInfo->setSize($this->generateFileSize($fileNum));
                $fileInfo->setMTime(time() - mt_rand(0, 31536000)); // Last year
                $fileInfo->setFileHash($this->generateHash($fileNum));
                $fileInfo->setNodeId(100000 + hash('crc32', $userId) + $fileNum);

                $this->mapper->insert($fileInfo);
            }
            
            $this->db->commit();
        }
    }

    private function createDuplicateGroups(): void
    {
        // Create common duplicates
        for ($i = 1; $i <= 10; $i++) {
            $hash = 'index-test-common-' . $i;
            $this->createDuplicateGroup($hash, mt_rand(10, 50));
        }

        // Create rare duplicates
        for ($i = 1; $i <= 20; $i++) {
            $hash = 'index-test-rare-' . $i;
            $this->createDuplicateGroup($hash, mt_rand(2, 5));
        }
    }

    private function createDuplicateGroup(string $hash, int $count): void
    {
        for ($i = 0; $i < $count; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/duplicates/{$hash}/copy_{$i}.dat");
            $fileInfo->setOwner('test-index-user-' . mt_rand(1, 3));
            $fileInfo->setSize(mt_rand(102400, 10485760));
            $fileInfo->setMTime(time() - mt_rand(0, 86400));
            $fileInfo->setFileHash($hash);
            $fileInfo->setNodeId(200000 + crc32($hash) + $i);

            $this->mapper->insert($fileInfo);
        }
    }

    private function generateRealisticPath(int $num): string
    {
        $directories = ['Documents', 'Pictures', 'Downloads', 'Projects', 'Archive'];
        $subdirs = ['2023', '2024', 'Personal', 'Work', 'Backup'];
        $extensions = ['txt', 'pdf', 'jpg', 'png', 'doc', 'xlsx', 'zip'];

        $dir = $directories[$num % count($directories)];
        $subdir = $subdirs[($num / 10) % count($subdirs)];
        $ext = $extensions[$num % count($extensions)];

        return "/{$dir}/{$subdir}/file_{$num}.{$ext}";
    }

    private function generateFileSize(int $num): int
    {
        // Create realistic file size distribution
        $rand = mt_rand(1, 100);
        
        if ($rand <= 60) {
            // 60% small files (1KB - 100KB)
            return mt_rand(1024, 102400);
        } elseif ($rand <= 85) {
            // 25% medium files (100KB - 10MB)
            return mt_rand(102400, 10485760);
        } elseif ($rand <= 95) {
            // 10% large files (10MB - 100MB)
            return mt_rand(10485760, 104857600);
        } else {
            // 5% very large files (100MB - 1GB)
            return mt_rand(104857600, 1073741824);
        }
    }

    private function generateHash(int $num): string
    {
        // Most files are unique
        if ($num % 100 < 95) {
            return 'index-test-unique-' . $num;
        }
        
        // Some are duplicates
        return 'index-test-common-' . ($num % 10 + 1);
    }

    private function measureQueryPerformance(string $label, callable $query): void
    {
        $times = [];
        $iterations = 5;

        // Warm up
        $query();

        // Measure
        for ($i = 0; $i < $iterations; $i++) {
            $start = microtime(true);
            $result = $query();
            $times[] = microtime(true) - $start;
        }

        // Calculate statistics
        $avg = array_sum($times) / count($times);
        $min = min($times);
        $max = max($times);

        $this->queryMetrics[$label] = sprintf(
            'avg: %.3fms, min: %.3fms, max: %.3fms',
            $avg * 1000,
            $min * 1000,
            $max * 1000
        );
    }

    private function suggestOptimizations(): void
    {
        echo "\n\nOptimization Suggestions:\n";
        echo "========================\n";

        // Analyze slow queries
        $slowQueries = [];
        foreach ($this->queryMetrics as $label => $metric) {
            preg_match('/avg: ([\d.]+)ms/', $metric, $matches);
            $avgTime = floatval($matches[1]);
            
            if ($avgTime > 100) {
                $slowQueries[$label] = $avgTime;
            }
        }

        if (!empty($slowQueries)) {
            echo "\nSlow queries (>100ms):\n";
            arsort($slowQueries);
            foreach ($slowQueries as $label => $time) {
                echo "  - $label: {$time}ms\n";
                
                // Suggest specific optimizations
                if (strpos($label, 'Full scan') !== false) {
                    echo "    → Consider adding index on the filtered column\n";
                } elseif (strpos($label, 'Deep pagination') !== false) {
                    echo "    → Use cursor-based pagination instead of offset\n";
                } elseif (strpos($label, 'Sort by') !== false) {
                    echo "    → Consider composite index including sort column\n";
                }
            }
        } else {
            echo "All queries performed well (<100ms average)\n";
        }
    }
}