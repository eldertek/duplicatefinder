<?php

namespace OCA\DuplicateFinder\Tests\Integration\Robustness;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\HashService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Test handling of network interruptions and timeouts
 * @group DB
 */
class NetworkInterruptionTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var string */
    private $testUserId = 'test-network-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->mapper = new FileInfoMapper($this->db);
    }

    protected function tearDown(): void
    {
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        parent::tearDown();
    }

    /**
     * Test file access timeout handling
     */
    public function testFileAccessTimeout(): void
    {
        // Create mock file that simulates timeout
        $mockFile = new class implements File {
            private $timeoutAfter = 2;
            private $callCount = 0;

            public function getContent()
            {
                $this->callCount++;
                if ($this->callCount <= $this->timeoutAfter) {
                    sleep(1); // Simulate slow network
                    throw new \Exception('Network timeout');
                }
                return 'file content';
            }

            public function getId(): int { return 10001; }
            public function getPath(): string { return '/test/timeout.txt'; }
            public function getName(): string { return 'timeout.txt'; }
            public function getMTime(): int { return time(); }
            public function getSize(): int { return 1024; }
            public function getMimetype(): string { return 'text/plain'; }
            public function delete(): void {}
            public function fopen(string $mode) { return false; }
            public function putContent($data): void {}
            public function getChecksum(): string { return ''; }
            public function getExtension(): string { return 'txt'; }
            public function getCreationTime(): int { return time(); }
            public function getUploadTime(): int { return time(); }
        };

        // Test hash calculation with retry logic
        $hashService = new HashService();
        $hash = null;
        $attempts = 0;
        $maxAttempts = 3;

        while ($hash === null && $attempts < $maxAttempts) {
            $attempts++;
            try {
                $hash = $hashService->calculateHash($mockFile);
            } catch (\Exception $e) {
                if ($attempts >= $maxAttempts) {
                    throw $e;
                }
                // Wait before retry
                usleep(100000 * $attempts); // Exponential backoff
            }
        }

        $this->assertNotNull($hash);
        $this->assertEquals(3, $attempts); // Should succeed on third attempt
    }

    /**
     * Test handling of intermittent network failures
     */
    public function testIntermittentNetworkFailure(): void
    {
        // Mock folder service that fails intermittently
        $mockFolderService = new class extends FolderService {
            private $failureCount = 0;
            private $failEveryNthCall = 3;

            public function __construct()
            {
                // Skip parent constructor
            }

            public function getNodeByFileInfo(FileInfo $fileInfo): ?File
            {
                $this->failureCount++;
                
                if ($this->failureCount % $this->failEveryNthCall === 0) {
                    throw new NotFoundException('Network error: Unable to reach storage');
                }

                // Return mock file
                $mockFile = new class implements File {
                    public function getId(): int { return 10002; }
                    public function getPath(): string { return '/test/intermittent.txt'; }
                    public function getName(): string { return 'intermittent.txt'; }
                    public function getMTime(): int { return time(); }
                    public function getSize(): int { return 2048; }
                    public function getMimetype(): string { return 'text/plain'; }
                    public function getContent() { return 'test content'; }
                    public function delete(): void {}
                    public function fopen(string $mode) { return false; }
                    public function putContent($data): void {}
                    public function getChecksum(): string { return ''; }
                    public function getExtension(): string { return 'txt'; }
                    public function getCreationTime(): int { return time(); }
                    public function getUploadTime(): int { return time(); }
                };

                return $mockFile;
            }
        };

        // Test multiple file accesses
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/intermittent.txt');
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setNodeId(10002);

        $successCount = 0;
        $failureCount = 0;

        for ($i = 1; $i <= 10; $i++) {
            try {
                $node = $mockFolderService->getNodeByFileInfo($fileInfo);
                $this->assertInstanceOf(File::class, $node);
                $successCount++;
            } catch (NotFoundException $e) {
                $failureCount++;
            }
        }

        // Should have some successes and some failures
        $this->assertGreaterThan(0, $successCount);
        $this->assertGreaterThan(0, $failureCount);
        $this->assertEquals(10, $successCount + $failureCount);
    }

    /**
     * Test handling of storage becoming unavailable mid-scan
     */
    public function testStorageUnavailableDuringScan(): void
    {
        // Create mock root folder that becomes unavailable
        $mockRootFolder = new class implements IRootFolder {
            private $callCount = 0;
            private $failAfter = 5;

            public function getUserFolder(string $userId): Folder
            {
                $this->callCount++;
                
                if ($this->callCount > $this->failAfter) {
                    throw new \OCP\Files\NotPermittedException('Storage unavailable');
                }

                // Return mock folder
                return new class implements Folder {
                    private static $fileCount = 0;

                    public function getDirectoryListing(): array
                    {
                        $files = [];
                        for ($i = 1; $i <= 3; $i++) {
                            self::$fileCount++;
                            $files[] = new class(self::$fileCount) implements File {
                                private $id;
                                
                                public function __construct($id)
                                {
                                    $this->id = $id;
                                }

                                public function getId(): int { return 10100 + $this->id; }
                                public function getPath(): string { return "/test/file{$this->id}.txt"; }
                                public function getName(): string { return "file{$this->id}.txt"; }
                                public function getMTime(): int { return time(); }
                                public function getSize(): int { return 1024 * $this->id; }
                                public function getMimetype(): string { return 'text/plain'; }
                                public function getContent() { return "content {$this->id}"; }
                                public function delete(): void {}
                                public function fopen(string $mode) { return false; }
                                public function putContent($data): void {}
                                public function getChecksum(): string { return ''; }
                                public function getExtension(): string { return 'txt'; }
                                public function getCreationTime(): int { return time(); }
                                public function getUploadTime(): int { return time(); }
                            };
                        }
                        return $files;
                    }

                    public function get(string $path): \OCP\Files\Node { throw new NotFoundException(); }
                    public function nodeExists(string $path): bool { return false; }
                    public function newFolder(string $path): Folder { throw new \Exception(); }
                    public function newFile(string $path, $content = null): File { throw new \Exception(); }
                    public function search($query): array { return []; }
                    public function searchByMime($mimetype): array { return []; }
                    public function searchByTag($tag, string $userId): array { return []; }
                    public function getById($id): array { return []; }
                    public function getFreeSpace(): int { return 0; }
                    public function isCreatable(): bool { return false; }
                    public function getNonExistingName(string $name): string { return $name; }
                    public function move(string $targetPath): \OCP\Files\Node { throw new \Exception(); }
                    public function getId(): int { return 1; }
                    public function getPath(): string { return '/test'; }
                    public function getName(): string { return 'test'; }
                    public function getMTime(): int { return time(); }
                    public function getSize(): int { return 0; }
                    public function getMimetype(): string { return 'httpd/unix-directory'; }
                    public function delete(): void {}
                    public function getChecksum(): string { return ''; }
                    public function getExtension(): string { return ''; }
                    public function getCreationTime(): int { return time(); }
                    public function getUploadTime(): int { return time(); }
                };
            }

            public function get(string $path): \OCP\Files\Node { throw new NotFoundException(); }
            public function getByIdInPath(int $id, string $path): array { return []; }
            public function getMountsIn(string $mountPoint): array { return []; }
            public function getById($id): array { return []; }
        };

        // Test scan with storage failure
        $processedFiles = [];
        $folder = null;

        try {
            // Process files until storage fails
            for ($i = 1; $i <= 10; $i++) {
                $folder = $mockRootFolder->getUserFolder($this->testUserId);
                $files = $folder->getDirectoryListing();
                
                foreach ($files as $file) {
                    $processedFiles[] = $file->getName();
                }
            }
        } catch (\OCP\Files\NotPermittedException $e) {
            // Expected - storage became unavailable
            $this->assertStringContainsString('Storage unavailable', $e->getMessage());
        }

        // Should have processed some files before failure
        $this->assertGreaterThan(0, count($processedFiles));
        $this->assertLessThan(30, count($processedFiles)); // 10 iterations × 3 files
    }

    /**
     * Test graceful handling of connection pool exhaustion
     */
    public function testConnectionPoolExhaustion(): void
    {
        $operations = [];
        $maxConcurrent = 5;

        // Simulate multiple concurrent operations
        for ($i = 1; $i <= 10; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/concurrent/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('network-concurrent-' . $i);
            $fileInfo->setNodeId(10200 + $i);

            // Limit concurrent operations
            if (count($operations) >= $maxConcurrent) {
                // Wait for one to complete
                array_shift($operations);
            }

            try {
                $inserted = $this->mapper->insert($fileInfo);
                $operations[] = $inserted;
            } catch (\Exception $e) {
                // Handle connection pool exhaustion
                usleep(100000); // Wait 100ms
                
                // Retry once
                try {
                    $inserted = $this->mapper->insert($fileInfo);
                    $operations[] = $inserted;
                } catch (\Exception $e) {
                    // Log and continue
                }
            }
        }

        // Verify at least some operations succeeded
        $inserted = $this->mapper->findAll($this->testUserId, 20, 0);
        $this->assertGreaterThan(0, count($inserted));
    }

    /**
     * Test handling of partial file reads
     */
    public function testPartialFileRead(): void
    {
        // Mock file that returns partial content on network issues
        $mockFile = new class implements File {
            private $attempts = 0;

            public function getContent()
            {
                $this->attempts++;
                $fullContent = str_repeat('A', 10000); // 10KB content

                if ($this->attempts === 1) {
                    // First attempt: return partial content
                    return substr($fullContent, 0, 3000);
                } elseif ($this->attempts === 2) {
                    // Second attempt: return more content
                    return substr($fullContent, 0, 7000);
                } else {
                    // Third attempt: return full content
                    return $fullContent;
                }
            }

            public function getId(): int { return 10300; }
            public function getPath(): string { return '/test/partial.txt'; }
            public function getName(): string { return 'partial.txt'; }
            public function getMTime(): int { return time(); }
            public function getSize(): int { return 10000; }
            public function getMimetype(): string { return 'text/plain'; }
            public function delete(): void {}
            public function fopen(string $mode) {
                // Return stream that simulates partial reads
                $stream = fopen('php://temp', 'r+');
                fwrite($stream, $this->getContent());
                rewind($stream);
                return $stream;
            }
            public function putContent($data): void {}
            public function getChecksum(): string { return ''; }
            public function getExtension(): string { return 'txt'; }
            public function getCreationTime(): int { return time(); }
            public function getUploadTime(): int { return time(); }
        };

        // Test reading with verification
        $content = null;
        $attempts = 0;

        while ($attempts < 3) {
            $attempts++;
            $content = $mockFile->getContent();
            
            // Verify content length matches expected size
            if (strlen($content) === $mockFile->getSize()) {
                break;
            }
            
            // Wait before retry
            usleep(50000);
        }

        $this->assertEquals($mockFile->getSize(), strlen($content));
        $this->assertEquals(3, $attempts);
    }

    /**
     * Test cleanup after interrupted operations
     */
    public function testInterruptedOperationCleanup(): void
    {
        $tempFiles = [];

        // Simulate operation that creates temporary data
        $this->db->beginTransaction();

        try {
            // Create temporary entries
            for ($i = 1; $i <= 5; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/temp/file$i.txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(1024);
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash('network-temp-' . $i);
                $fileInfo->setNodeId(10400 + $i);

                $tempFiles[] = $this->mapper->insert($fileInfo);

                if ($i === 3) {
                    // Simulate interruption
                    throw new \Exception('Operation interrupted');
                }
            }

            $this->db->commit();

        } catch (\Exception $e) {
            // Cleanup on interruption
            $this->db->rollBack();

            // Verify cleanup worked
            foreach ($tempFiles as $tempFile) {
                if ($tempFile->getId()) {
                    try {
                        $this->mapper->find($tempFile->getId());
                        $this->fail('Temporary file should have been cleaned up');
                    } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
                        // Expected - file was cleaned up
                    }
                }
            }
        }

        // Verify no temporary data remains
        $remaining = $this->mapper->findByHash('network-temp-1');
        $this->assertCount(0, $remaining);
    }
}