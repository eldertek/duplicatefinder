<?php

namespace OCA\DuplicateFinder\Tests\Integration\Performance;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Test memory efficiency with large datasets
 * @group DB
 * @group Performance
 */
class MemoryEfficiencyTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var array */
    private $memoryMetrics = [];

    /** @var string */
    private $testUserId = 'test-memory-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->mapper = new FileInfoMapper($this->db);
    }

    protected function tearDown(): void
    {
        // Clean up
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        // Output memory metrics
        if (!empty($this->memoryMetrics)) {
            echo "\n\nMemory Efficiency Metrics:\n";
            echo "==========================\n";
            foreach ($this->memoryMetrics as $metric => $value) {
                echo sprintf("%-35s: %s\n", $metric, $value);
            }
        }

        parent::tearDown();
    }

    /**
     * Test memory usage during batch processing
     */
    public function testBatchProcessingMemory(): void
    {
        $totalFiles = 50000;
        $batchSizes = [100, 500, 1000, 5000];

        foreach ($batchSizes as $batchSize) {
            $this->measureBatchMemoryUsage($totalFiles, $batchSize);
        }

        // Find optimal batch size
        $optimalBatch = $this->findOptimalBatchSize();
        $this->memoryMetrics['Optimal Batch Size'] = $optimalBatch . ' files';
    }

    /**
     * Test streaming vs loading all data
     */
    public function testStreamingVsLoadingMemory(): void
    {
        // Create test dataset
        $this->createTestDataset(10000);

        // Test loading all data at once
        $startMemory = memory_get_usage(true);
        $allData = $this->mapper->findAll($this->testUserId, 10000, 0);
        $loadAllMemory = memory_get_usage(true) - $startMemory;
        
        $this->memoryMetrics['Load All (10k records)'] = $this->formatBytes($loadAllMemory);
        unset($allData);
        gc_collect_cycles();

        // Test streaming approach
        $startMemory = memory_get_usage(true);
        $peakStreamMemory = 0;
        $processed = 0;

        $offset = 0;
        $limit = 100;
        
        while (true) {
            $batch = $this->mapper->findAll($this->testUserId, $limit, $offset);
            
            if (empty($batch)) {
                break;
            }

            // Process batch
            foreach ($batch as $file) {
                $processed++;
            }

            $currentMemory = memory_get_usage(true) - $startMemory;
            $peakStreamMemory = max($peakStreamMemory, $currentMemory);

            // Clear batch from memory
            unset($batch);
            
            $offset += $limit;
        }

        $this->memoryMetrics['Stream Processing (10k)'] = $this->formatBytes($peakStreamMemory);
        $this->memoryMetrics['Memory Saved'] = sprintf('%.1f%%', 
            (1 - $peakStreamMemory / $loadAllMemory) * 100
        );
    }

    /**
     * Test memory usage with different data structures
     */
    public function testDataStructureMemoryUsage(): void
    {
        $recordCount = 5000;

        // Test array of objects
        $startMemory = memory_get_usage(true);
        $objectArray = [];
        
        for ($i = 0; $i < $recordCount; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/memory/file{$i}.txt");
            $fileInfo->setSize(mt_rand(1024, 1048576));
            $fileInfo->setFileHash('memory-test-' . $i);
            $objectArray[] = $fileInfo;
        }
        
        $objectMemory = memory_get_usage(true) - $startMemory;
        $this->memoryMetrics['Object Array (5k)'] = $this->formatBytes($objectMemory);
        unset($objectArray);
        gc_collect_cycles();

        // Test array of arrays
        $startMemory = memory_get_usage(true);
        $arrayArray = [];
        
        for ($i = 0; $i < $recordCount; $i++) {
            $arrayArray[] = [
                'path' => "/test/memory/file{$i}.txt",
                'size' => mt_rand(1024, 1048576),
                'hash' => 'memory-test-' . $i,
            ];
        }
        
        $arrayMemory = memory_get_usage(true) - $startMemory;
        $this->memoryMetrics['Array of Arrays (5k)'] = $this->formatBytes($arrayMemory);
        $this->memoryMetrics['Array vs Object Ratio'] = sprintf('%.1fx', 
            $objectMemory / $arrayMemory
        );
    }

    /**
     * Test memory leaks in long-running operations
     */
    public function testMemoryLeaksInLongOperations(): void
    {
        $iterations = 100;
        $memorySnapshots = [];

        for ($i = 0; $i < $iterations; $i++) {
            // Perform operation that might leak memory
            $this->performDatabaseOperation($i);

            // Take memory snapshot every 10 iterations
            if ($i % 10 === 0) {
                gc_collect_cycles();
                $memorySnapshots[] = memory_get_usage(true);
            }
        }

        // Analyze memory growth
        $initialMemory = $memorySnapshots[0];
        $finalMemory = end($memorySnapshots);
        $growth = $finalMemory - $initialMemory;

        $this->memoryMetrics['Memory Growth (100 ops)'] = $this->formatBytes($growth);
        $this->memoryMetrics['Average Growth per Op'] = $this->formatBytes($growth / $iterations);

        // Check for linear growth (potential leak)
        $isLinear = $this->checkLinearGrowth($memorySnapshots);
        $this->memoryMetrics['Memory Leak Detected'] = $isLinear ? 'Yes' : 'No';
    }

    /**
     * Test garbage collection effectiveness
     */
    public function testGarbageCollectionEffectiveness(): void
    {
        $objects = [];
        
        // Create many objects
        $startMemory = memory_get_usage(true);
        
        for ($i = 0; $i < 10000; $i++) {
            $objects[] = new FileInfo();
        }
        
        $beforeGC = memory_get_usage(true);
        $this->memoryMetrics['Before GC (10k objects)'] = $this->formatBytes($beforeGC - $startMemory);

        // Clear references
        $objects = null;
        
        // Force garbage collection
        gc_collect_cycles();
        
        $afterGC = memory_get_usage(true);
        $this->memoryMetrics['After GC'] = $this->formatBytes($afterGC - $startMemory);
        $this->memoryMetrics['GC Freed'] = $this->formatBytes($beforeGC - $afterGC);
        $this->memoryMetrics['GC Effectiveness'] = sprintf('%.1f%%', 
            (($beforeGC - $afterGC) / ($beforeGC - $startMemory)) * 100
        );
    }

    /**
     * Test memory usage in recursive operations
     */
    public function testRecursiveOperationMemory(): void
    {
        $maxDepth = 10;
        $filesPerLevel = 10;

        $startMemory = memory_get_usage(true);
        $peakMemory = $startMemory;

        $this->createRecursiveStructure('/', 0, $maxDepth, $filesPerLevel, $peakMemory);

        $totalMemory = $peakMemory - $startMemory;
        $this->memoryMetrics['Recursive Operation'] = $this->formatBytes($totalMemory);
        $this->memoryMetrics['Memory per Level'] = $this->formatBytes($totalMemory / $maxDepth);
    }

    /**
     * Test memory usage with large strings (file paths)
     */
    public function testLargeStringMemoryUsage(): void
    {
        $pathLengths = [50, 100, 255, 500, 1000];
        $fileCount = 1000;

        foreach ($pathLengths as $length) {
            $startMemory = memory_get_usage(true);
            $files = [];

            for ($i = 0; $i < $fileCount; $i++) {
                $path = $this->generatePath($length);
                $fileInfo = new FileInfo();
                $fileInfo->setPath($path);
                $files[] = $fileInfo;
            }

            $usedMemory = memory_get_usage(true) - $startMemory;
            $this->memoryMetrics["Path Length {$length} chars"] = $this->formatBytes($usedMemory);
            
            unset($files);
            gc_collect_cycles();
        }
    }

    private function measureBatchMemoryUsage(int $totalFiles, int $batchSize): void
    {
        $startMemory = memory_get_usage(true);
        $peakMemory = $startMemory;
        $processed = 0;

        while ($processed < $totalFiles) {
            $batch = [];
            $batchCount = min($batchSize, $totalFiles - $processed);

            // Create batch
            for ($i = 0; $i < $batchCount; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/batch/file_{$processed}.txt");
                $fileInfo->setSize(mt_rand(1024, 10240));
                $batch[] = $fileInfo;
                $processed++;
            }

            // Process batch (simulate work)
            foreach ($batch as $file) {
                $hash = md5($file->getPath());
            }

            $currentMemory = memory_get_usage(true);
            $peakMemory = max($peakMemory, $currentMemory);

            // Clear batch
            unset($batch);
        }

        $totalMemory = $peakMemory - $startMemory;
        $this->memoryMetrics["Batch Size {$batchSize}"] = $this->formatBytes($totalMemory);
    }

    private function findOptimalBatchSize(): int
    {
        // Simple heuristic based on available memory
        $availableMemory = $this->getAvailableMemory();
        $recordSize = 1024; // Estimated bytes per record
        
        // Use 10% of available memory for batch
        $optimalSize = (int)($availableMemory * 0.1 / $recordSize);
        
        // Round to nearest hundred
        return round($optimalSize / 100) * 100;
    }

    private function createTestDataset(int $count): void
    {
        $batchSize = 100;
        
        for ($i = 0; $i < $count; $i += $batchSize) {
            $this->db->beginTransaction();
            
            for ($j = 0; $j < $batchSize && ($i + $j) < $count; $j++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/dataset/file_" . ($i + $j) . ".txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(mt_rand(1024, 10240));
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash('memory-dataset-' . ($i + $j));
                $fileInfo->setNodeId(80000 + $i + $j);

                $this->mapper->insert($fileInfo);
            }
            
            $this->db->commit();
        }
    }

    private function performDatabaseOperation(int $iteration): void
    {
        // Create and immediately delete to test for leaks
        $fileInfo = new FileInfo();
        $fileInfo->setPath("/test/leak/file_{$iteration}.txt");
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setSize(1024);
        $fileInfo->setMTime(time());
        $fileInfo->setFileHash('memory-leak-test-' . $iteration);
        $fileInfo->setNodeId(90000 + $iteration);

        $inserted = $this->mapper->insert($fileInfo);
        $this->mapper->delete($inserted);
    }

    private function checkLinearGrowth(array $snapshots): bool
    {
        if (count($snapshots) < 3) {
            return false;
        }

        // Calculate growth rate between snapshots
        $growthRates = [];
        for ($i = 1; $i < count($snapshots); $i++) {
            $growthRates[] = $snapshots[$i] - $snapshots[$i - 1];
        }

        // Check if growth is roughly constant (linear)
        $avgGrowth = array_sum($growthRates) / count($growthRates);
        $variance = 0;
        
        foreach ($growthRates as $rate) {
            $variance += pow($rate - $avgGrowth, 2);
        }
        
        $variance /= count($growthRates);
        $stdDev = sqrt($variance);
        
        // If standard deviation is less than 20% of average, consider it linear
        return ($stdDev / $avgGrowth) < 0.2;
    }

    private function createRecursiveStructure(string $path, int $depth, int $maxDepth, int $filesPerLevel, &$peakMemory): void
    {
        if ($depth >= $maxDepth) {
            return;
        }

        for ($i = 0; $i < $filesPerLevel; $i++) {
            $filePath = $path . "level{$depth}/file{$i}.txt";
            
            $fileInfo = new FileInfo();
            $fileInfo->setPath($filePath);
            $fileInfo->setSize(1024);
            
            // Update peak memory
            $currentMemory = memory_get_usage(true);
            $peakMemory = max($peakMemory, $currentMemory);
            
            // Recurse
            if ($i === 0) {
                $this->createRecursiveStructure($path . "level{$depth}/", $depth + 1, $maxDepth, $filesPerLevel, $peakMemory);
            }
        }
    }

    private function generatePath(int $length): string
    {
        $segments = [];
        $segmentLength = 10;
        $remainingLength = $length;

        while ($remainingLength > 0) {
            $currentLength = min($segmentLength, $remainingLength);
            $segments[] = substr(md5(uniqid()), 0, $currentLength);
            $remainingLength -= $currentLength + 1; // +1 for slash
        }

        return '/' . implode('/', $segments);
    }

    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $factor = floor((strlen($bytes) - 1) / 3);
        
        return sprintf('%.2f %s', $bytes / pow(1024, $factor), $units[$factor]);
    }

    private function getAvailableMemory(): int
    {
        $limit = ini_get('memory_limit');
        
        if ($limit === '-1') {
            return 2147483648; // 2GB default if unlimited
        }

        // Convert to bytes
        $lastChar = strtolower(substr($limit, -1));
        $value = (int)$limit;

        switch ($lastChar) {
            case 'g':
                $value *= 1024;
            case 'm':
                $value *= 1024;
            case 'k':
                $value *= 1024;
        }

        return $value - memory_get_usage(true);
    }
}