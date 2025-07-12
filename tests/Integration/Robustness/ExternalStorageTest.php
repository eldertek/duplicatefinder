<?php

namespace OCA\DuplicateFinder\Tests\Integration\Robustness;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\Files\NotPermittedException;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Test handling of external storage mount/unmount scenarios
 * @group DB
 */
class ExternalStorageTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var string */
    private $testUserId = 'test-storage-user';

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
     * Test handling of unmounted external storage
     */
    public function testUnmountedExternalStorage(): void
    {
        // Create file info for external storage file
        $externalFile = new FileInfo();
        $externalFile->setPath('/external/mounted/document.pdf');
        $externalFile->setOwner($this->testUserId);
        $externalFile->setSize(2048576); // 2MB
        $externalFile->setMTime(time());
        $externalFile->setFileHash('external-storage-hash-1');
        $externalFile->setNodeId(20001);
        
        $inserted = $this->mapper->insert($externalFile);

        // Create mock folder service that simulates unmounted storage
        $mockFolderService = new class extends FolderService {
            private $storageAvailable = true;

            public function __construct()
            {
                // Skip parent constructor
            }

            public function setStorageAvailable(bool $available): void
            {
                $this->storageAvailable = $available;
            }

            public function getNodeByFileInfo(FileInfo $fileInfo): ?File
            {
                if (!$this->storageAvailable && strpos($fileInfo->getPath(), '/external/') === 0) {
                    throw new NotFoundException('External storage not mounted');
                }

                // Return mock file for available storage
                return new class($fileInfo) implements File {
                    private $fileInfo;

                    public function __construct($fileInfo)
                    {
                        $this->fileInfo = $fileInfo;
                    }

                    public function getId(): int { return $this->fileInfo->getNodeId(); }
                    public function getPath(): string { return $this->fileInfo->getPath(); }
                    public function getName(): string { return basename($this->fileInfo->getPath()); }
                    public function getMTime(): int { return $this->fileInfo->getMTime(); }
                    public function getSize(): int { return $this->fileInfo->getSize(); }
                    public function getMimetype(): string { return 'application/pdf'; }
                    public function getContent() { return 'PDF content'; }
                    public function delete(): void {}
                    public function fopen(string $mode) { return false; }
                    public function putContent($data): void {}
                    public function getChecksum(): string { return ''; }
                    public function getExtension(): string { return 'pdf'; }
                    public function getCreationTime(): int { return time(); }
                    public function getUploadTime(): int { return time(); }
                };
            }
        };

        // Test access when storage is mounted
        $mockFolderService->setStorageAvailable(true);
        $file = $mockFolderService->getNodeByFileInfo($inserted);
        $this->assertNotNull($file);
        $this->assertEquals($inserted->getPath(), $file->getPath());

        // Test access when storage is unmounted
        $mockFolderService->setStorageAvailable(false);
        try {
            $mockFolderService->getNodeByFileInfo($inserted);
            $this->fail('Should throw NotFoundException for unmounted storage');
        } catch (NotFoundException $e) {
            $this->assertStringContainsString('not mounted', $e->getMessage());
        }

        // Test that file info remains in database when storage is unmounted
        $retrieved = $this->mapper->find($inserted->getId());
        $this->assertEquals($inserted->getPath(), $retrieved->getPath());
        $this->assertNotNull($retrieved->getNodeId()); // Should not be nullified
    }

    /**
     * Test handling of remounted storage with changed files
     */
    public function testRemountedStorageWithChanges(): void
    {
        // Create initial file infos
        $files = [];
        for ($i = 1; $i <= 3; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/external/usb/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024 * $i);
            $fileInfo->setMTime(time() - 3600); // 1 hour ago
            $fileInfo->setFileHash('external-usb-hash-' . $i);
            $fileInfo->setNodeId(20100 + $i);
            
            $files[] = $this->mapper->insert($fileInfo);
        }

        // Simulate remount with one file changed
        $changedFile = $files[1];
        $changedFile->setSize(5000); // Different size
        $changedFile->setMTime(time()); // Updated time
        $changedFile->setFileHash('external-usb-hash-changed'); // Different hash
        
        // Update in database
        $updated = $this->mapper->update($changedFile);

        // Verify changes were tracked
        $this->assertEquals(5000, $updated->getSize());
        $this->assertEquals('external-usb-hash-changed', $updated->getFileHash());

        // Verify other files remain unchanged
        $unchanged1 = $this->mapper->find($files[0]->getId());
        $this->assertEquals($files[0]->getFileHash(), $unchanged1->getFileHash());

        $unchanged2 = $this->mapper->find($files[2]->getId());
        $this->assertEquals($files[2]->getFileHash(), $unchanged2->getFileHash());
    }

    /**
     * Test handling of read-only external storage
     */
    public function testReadOnlyExternalStorage(): void
    {
        // Create file info for read-only storage
        $readOnlyFile = new FileInfo();
        $readOnlyFile->setPath('/external/readonly/archive.zip');
        $readOnlyFile->setOwner($this->testUserId);
        $readOnlyFile->setSize(10485760); // 10MB
        $readOnlyFile->setMTime(time());
        $readOnlyFile->setFileHash('external-readonly-hash');
        $readOnlyFile->setNodeId(20200);
        
        $inserted = $this->mapper->insert($readOnlyFile);

        // Create mock file that throws on write operations
        $mockFile = new class($inserted) implements File {
            private $fileInfo;

            public function __construct($fileInfo)
            {
                $this->fileInfo = $fileInfo;
            }

            public function getId(): int { return $this->fileInfo->getNodeId(); }
            public function getPath(): string { return $this->fileInfo->getPath(); }
            public function getName(): string { return basename($this->fileInfo->getPath()); }
            public function getMTime(): int { return $this->fileInfo->getMTime(); }
            public function getSize(): int { return $this->fileInfo->getSize(); }
            public function getMimetype(): string { return 'application/zip'; }
            public function getContent() { return 'ZIP content'; }
            
            public function delete(): void 
            {
                throw new NotPermittedException('Read-only storage');
            }
            
            public function fopen(string $mode) 
            {
                if (strpos($mode, 'w') !== false || strpos($mode, 'a') !== false) {
                    throw new NotPermittedException('Read-only storage');
                }
                return false;
            }
            
            public function putContent($data): void 
            {
                throw new NotPermittedException('Read-only storage');
            }

            public function getChecksum(): string { return ''; }
            public function getExtension(): string { return 'zip'; }
            public function getCreationTime(): int { return time(); }
            public function getUploadTime(): int { return time(); }
        };

        // Test read operations work
        $content = $mockFile->getContent();
        $this->assertNotEmpty($content);

        // Test write operations fail gracefully
        try {
            $mockFile->delete();
            $this->fail('Should not allow delete on read-only storage');
        } catch (NotPermittedException $e) {
            $this->assertStringContainsString('Read-only', $e->getMessage());
        }

        try {
            $mockFile->putContent('new content');
            $this->fail('Should not allow write on read-only storage');
        } catch (NotPermittedException $e) {
            $this->assertStringContainsString('Read-only', $e->getMessage());
        }
    }

    /**
     * Test handling of slow external storage
     */
    public function testSlowExternalStorage(): void
    {
        // Create mock file that simulates slow storage
        $mockSlowFile = new class implements File {
            private $accessDelay = 2; // 2 seconds delay

            public function getContent()
            {
                sleep($this->accessDelay);
                return 'slow content';
            }

            public function getId(): int { return 20300; }
            public function getPath(): string { return '/external/network/large.dat'; }
            public function getName(): string { return 'large.dat'; }
            public function getMTime(): int { return time(); }
            public function getSize(): int { return 104857600; } // 100MB
            public function getMimetype(): string { return 'application/octet-stream'; }
            public function delete(): void { sleep($this->accessDelay); }
            
            public function fopen(string $mode) 
            {
                sleep($this->accessDelay);
                $stream = fopen('php://temp', 'r+');
                fwrite($stream, $this->getContent());
                rewind($stream);
                return $stream;
            }
            
            public function putContent($data): void { sleep($this->accessDelay); }
            public function getChecksum(): string { return ''; }
            public function getExtension(): string { return 'dat'; }
            public function getCreationTime(): int { return time(); }
            public function getUploadTime(): int { return time(); }
        };

        // Test with timeout handling
        $startTime = time();
        $timeout = 5; // 5 second timeout
        $content = null;

        try {
            // Set up signal handler for timeout
            $handler = function () use (&$content) {
                if ($content === null) {
                    throw new \Exception('Operation timed out');
                }
            };

            // Try to read content
            $content = $mockSlowFile->getContent();
            $elapsed = time() - $startTime;

            $this->assertNotNull($content);
            $this->assertGreaterThanOrEqual(2, $elapsed); // Should take at least 2 seconds
            $this->assertLessThan($timeout, $elapsed); // Should not timeout

        } catch (\Exception $e) {
            // Handle timeout gracefully
            $this->assertStringContainsString('timed out', $e->getMessage());
        }
    }

    /**
     * Test handling of storage quota exceeded
     */
    public function testStorageQuotaExceeded(): void
    {
        // Create mock folder that simulates quota exceeded
        $mockFolder = new class implements Folder {
            private $usedSpace = 9500000000; // 9.5GB used
            private $quota = 10000000000; // 10GB quota

            public function getFreeSpace(): int
            {
                return max(0, $this->quota - $this->usedSpace);
            }

            public function newFile(string $path, $content = null): File
            {
                $contentSize = is_string($content) ? strlen($content) : 0;
                
                if ($this->getFreeSpace() < $contentSize) {
                    throw new \OCP\Files\NotEnoughSpaceException('Quota exceeded');
                }

                $this->usedSpace += $contentSize;
                
                // Return mock file
                return new class($path) implements File {
                    private $path;
                    
                    public function __construct($path)
                    {
                        $this->path = $path;
                    }
                    
                    public function getId(): int { return 20400; }
                    public function getPath(): string { return $this->path; }
                    public function getName(): string { return basename($this->path); }
                    public function getMTime(): int { return time(); }
                    public function getSize(): int { return 0; }
                    public function getMimetype(): string { return 'text/plain'; }
                    public function getContent() { return ''; }
                    public function delete(): void {}
                    public function fopen(string $mode) { return false; }
                    public function putContent($data): void {}
                    public function getChecksum(): string { return ''; }
                    public function getExtension(): string { return 'txt'; }
                    public function getCreationTime(): int { return time(); }
                    public function getUploadTime(): int { return time(); }
                };
            }

            // Other required methods with minimal implementation
            public function getDirectoryListing(): array { return []; }
            public function get(string $path): \OCP\Files\Node { throw new NotFoundException(); }
            public function nodeExists(string $path): bool { return false; }
            public function newFolder(string $path): Folder { throw new \Exception(); }
            public function search($query): array { return []; }
            public function searchByMime($mimetype): array { return []; }
            public function searchByTag($tag, string $userId): array { return []; }
            public function getById($id): array { return []; }
            public function isCreatable(): bool { return true; }
            public function getNonExistingName(string $name): string { return $name; }
            public function move(string $targetPath): \OCP\Files\Node { throw new \Exception(); }
            public function getId(): int { return 1; }
            public function getPath(): string { return '/external/limited'; }
            public function getName(): string { return 'limited'; }
            public function getMTime(): int { return time(); }
            public function getSize(): int { return $this->usedSpace; }
            public function getMimetype(): string { return 'httpd/unix-directory'; }
            public function delete(): void {}
            public function getChecksum(): string { return ''; }
            public function getExtension(): string { return ''; }
            public function getCreationTime(): int { return time(); }
            public function getUploadTime(): int { return time(); }
        };

        // Test creating small file (should succeed)
        $smallContent = str_repeat('A', 1000); // 1KB
        try {
            $smallFile = $mockFolder->newFile('/external/limited/small.txt', $smallContent);
            $this->assertNotNull($smallFile);
        } catch (\OCP\Files\NotEnoughSpaceException $e) {
            $this->fail('Should allow small file creation');
        }

        // Test creating large file (should fail)
        $largeContent = str_repeat('B', 1000000000); // 1GB
        try {
            $mockFolder->newFile('/external/limited/large.txt', $largeContent);
            $this->fail('Should not allow large file exceeding quota');
        } catch (\OCP\Files\NotEnoughSpaceException $e) {
            $this->assertStringContainsString('Quota exceeded', $e->getMessage());
        }

        // Verify free space calculation
        $freeSpace = $mockFolder->getFreeSpace();
        $this->assertLessThan(500000000, $freeSpace); // Less than 500MB free
    }

    /**
     * Test detection of stale file entries after storage removal
     */
    public function testStaleEntriesAfterStorageRemoval(): void
    {
        // Create file entries for removed storage
        $staleFiles = [];
        for ($i = 1; $i <= 5; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/external/removed/file$i.doc");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(2048 * $i);
            $fileInfo->setMTime(time() - 86400 * 30); // 30 days old
            $fileInfo->setFileHash('external-removed-' . $i);
            $fileInfo->setNodeId(20500 + $i);
            
            $staleFiles[] = $this->mapper->insert($fileInfo);
        }

        // Mock folder service that marks removed storage
        $mockFolderService = new class extends FolderService {
            public function __construct()
            {
                // Skip parent constructor
            }

            public function getNodeByFileInfo(FileInfo $fileInfo): ?File
            {
                if (strpos($fileInfo->getPath(), '/external/removed/') === 0) {
                    // Storage was removed - mark as stale
                    return null;
                }

                throw new NotFoundException('File not found');
            }
        };

        // Check each file and mark stale entries
        foreach ($staleFiles as $fileInfo) {
            $node = $mockFolderService->getNodeByFileInfo($fileInfo);
            
            if ($node === null) {
                // Mark as stale by setting nodeId to null
                $fileInfo->setNodeId(null);
                $this->mapper->update($fileInfo);
            }
        }

        // Verify all entries are marked as stale
        foreach ($staleFiles as $fileInfo) {
            $retrieved = $this->mapper->find($fileInfo->getId());
            $this->assertNull($retrieved->getNodeId());
            $this->assertEquals($fileInfo->getPath(), $retrieved->getPath()); // Path preserved
            $this->assertEquals($fileInfo->getFileHash(), $retrieved->getFileHash()); // Hash preserved
        }
    }
}