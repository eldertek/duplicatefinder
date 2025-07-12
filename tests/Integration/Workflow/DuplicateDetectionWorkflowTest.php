<?php

namespace OCA\DuplicateFinder\Tests\Integration\Workflow;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;
use Test\TestCase;

/**
 * End-to-end test for complete duplicate detection workflow
 * @group DB
 */
class DuplicateDetectionWorkflowTest extends TestCase
{
    /** @var IDBConnection */
    private $db;

    /** @var FileInfoService */
    private $fileInfoService;

    /** @var FileDuplicateService */
    private $fileDuplicateService;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $duplicateMapper;

    /** @var string */
    private $testUserId = 'test-workflow-user';

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->fileInfoMapper = new FileInfoMapper($this->db);
        $this->duplicateMapper = new FileDuplicateMapper($this->db);

        // Set up services with minimal mocking
        $rootFolder = $this->createMock(IRootFolder::class);
        $folderService = $this->createMock(FolderService::class);
        $eventDispatcher = $this->createMock(IEventDispatcher::class);
        $filterService = $this->createMock(FilterService::class);
        $originFolderService = $this->createMock(OriginFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);

        // Create file info service
        $this->fileInfoService = new FileInfoService(
            $this->fileInfoMapper,
            $rootFolder,
            $folderService,
            $this->createMock(FileDuplicateService::class),
            $eventDispatcher,
            $filterService
        );

        // Create file duplicate service
        $this->fileDuplicateService = new FileDuplicateService(
            $this->duplicateMapper,
            $this->fileInfoService,
            $originFolderService,
            $logger
        );

        // Update file info service with real duplicate service
        $this->fileInfoService = new FileInfoService(
            $this->fileInfoMapper,
            $rootFolder,
            $folderService,
            $this->fileDuplicateService,
            $eventDispatcher,
            $filterService
        );
    }

    protected function tearDown(): void
    {
        // Clean up all test data
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
            ->where($query->expr()->like('hash', $query->createNamedParameter('workflow-test-%')));
        $query->executeStatement();
    }

    /**
     * Test complete workflow: scan -> detect -> list -> acknowledge -> delete
     */
    public function testCompleteWorkflow(): void
    {
        // Step 1: Create file infos simulating a scan
        $this->simulateScan();

        // Step 2: Verify duplicates were detected
        $duplicates = $this->fileDuplicateService->findAll(10, 0);
        $this->assertArrayHasKey('entities', $duplicates);
        $this->assertCount(2, $duplicates['entities']); // 2 duplicate groups

        // Step 3: Get specific duplicate group
        $duplicate = $this->fileDuplicateService->find('workflow-test-hash-1');
        $this->assertNotNull($duplicate);
        $this->assertCount(3, $duplicate->getFiles()); // 3 files with same hash

        // Step 4: Acknowledge duplicate
        $acknowledged = $this->fileDuplicateService->acknowledge('workflow-test-hash-1');
        $this->assertTrue($acknowledged->getAcknowledged());

        // Step 5: Delete one file from duplicate group
        $files = $duplicate->getFiles();
        $fileToDelete = $files[0];
        $this->fileInfoService->delete($fileToDelete);

        // Step 6: Verify duplicate group still exists with 2 files
        $updatedDuplicate = $this->fileDuplicateService->find('workflow-test-hash-1');
        $this->assertCount(2, $updatedDuplicate->getFiles());

        // Step 7: Delete another file (leaving only 1)
        $remainingFiles = $updatedDuplicate->getFiles();
        $this->fileInfoService->delete($remainingFiles[0]);

        // Step 8: Verify duplicate group is automatically removed
        $this->expectException(\OCP\AppFramework\Db\DoesNotExistException::class);
        $this->fileDuplicateService->find('workflow-test-hash-1');
    }

    /**
     * Test workflow with file updates
     */
    public function testWorkflowWithFileUpdates(): void
    {
        // Create initial files
        $this->simulateScan();

        // Get a file
        $fileInfo = $this->fileInfoMapper->findByHash('workflow-test-hash-1')[0];
        
        // Simulate file update (size change)
        $fileInfo->setSize(9999);
        $fileInfo->setMTime(time() + 1000);
        $fileInfo->setFileHash('workflow-test-hash-updated');
        
        $updated = $this->fileInfoMapper->update($fileInfo);

        // Verify old duplicate group has one less file
        $oldDuplicate = $this->fileDuplicateService->find('workflow-test-hash-1');
        $this->assertCount(2, $oldDuplicate->getFiles());

        // Create another file with the new hash to form a new duplicate
        $newFile = new FileInfo();
        $newFile->setPath('/test/updated-duplicate.txt');
        $newFile->setOwner($this->testUserId);
        $newFile->setSize(9999);
        $newFile->setMTime(time());
        $newFile->setFileHash('workflow-test-hash-updated');
        $newFile->setNodeId(7999);

        $this->fileInfoMapper->insert($newFile);

        // Trigger duplicate detection
        $this->fileDuplicateService->updateDuplicatesForFileInfo($updated);

        // Verify new duplicate group exists
        $newDuplicate = $this->fileDuplicateService->find('workflow-test-hash-updated');
        $this->assertCount(2, $newDuplicate->getFiles());
    }

    /**
     * Test workflow with bulk operations
     */
    public function testBulkOperationWorkflow(): void
    {
        // Create many duplicates
        $this->simulateLargeScan();

        // Get all unacknowledged duplicates
        $result = $this->fileDuplicateService->findAll(100, 0, false);
        $unacknowledged = array_filter($result['entities'], function ($dup) {
            return !$dup->getAcknowledged();
        });

        $this->assertGreaterThan(5, count($unacknowledged));

        // Bulk acknowledge
        foreach ($unacknowledged as $duplicate) {
            $this->fileDuplicateService->acknowledge($duplicate->getHash());
        }

        // Verify all are acknowledged
        $result = $this->fileDuplicateService->findAll(100, 0, false);
        $stillUnacknowledged = array_filter($result['entities'], function ($dup) {
            return !$dup->getAcknowledged();
        });

        $this->assertCount(0, $stillUnacknowledged);

        // Bulk delete all files for a specific hash
        $hashToDelete = 'workflow-test-bulk-1';
        $files = $this->fileInfoService->findByHash($hashToDelete);
        
        foreach ($files as $file) {
            $this->fileInfoService->delete($file);
        }

        // Verify duplicate group is gone
        $this->expectException(\OCP\AppFramework\Db\DoesNotExistException::class);
        $this->fileDuplicateService->find($hashToDelete);
    }

    /**
     * Test orphaned duplicate cleanup
     */
    public function testOrphanedDuplicateCleanup(): void
    {
        // Create duplicate entry without files
        $orphan = new \OCA\DuplicateFinder\Db\FileDuplicate();
        $orphan->setHash('workflow-test-orphan');
        $orphan->setAcknowledged(false);
        $this->duplicateMapper->insert($orphan);

        // Try to find it - should be cleaned up
        try {
            $this->fileDuplicateService->find('workflow-test-orphan');
            $this->fail('Orphaned duplicate should have been cleaned up');
        } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
            // Expected - orphan was cleaned up
            $this->assertTrue(true);
        }
    }

    private function simulateScan(): void
    {
        // Create duplicate group 1 (3 files)
        for ($i = 1; $i <= 3; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/duplicate1/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('workflow-test-hash-1');
            $fileInfo->setNodeId(7000 + $i);

            $this->fileInfoMapper->insert($fileInfo);
        }

        // Create duplicate group 2 (2 files)
        for ($i = 1; $i <= 2; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/duplicate2/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(2048);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('workflow-test-hash-2');
            $fileInfo->setNodeId(7100 + $i);

            $this->fileInfoMapper->insert($fileInfo);
        }

        // Create non-duplicate file
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/unique.txt');
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setSize(512);
        $fileInfo->setMTime(time());
        $fileInfo->setFileHash('workflow-test-unique');
        $fileInfo->setNodeId(7200);

        $this->fileInfoMapper->insert($fileInfo);

        // Trigger duplicate detection
        $this->fileDuplicateService->updateDuplicatesForUser($this->testUserId);
    }

    private function simulateLargeScan(): void
    {
        // Create 10 duplicate groups with varying file counts
        for ($group = 1; $group <= 10; $group++) {
            $fileCount = rand(2, 5);
            $hash = 'workflow-test-bulk-' . $group;

            for ($i = 1; $i <= $fileCount; $i++) {
                $fileInfo = new FileInfo();
                $fileInfo->setPath("/test/bulk/group$group/file$i.txt");
                $fileInfo->setOwner($this->testUserId);
                $fileInfo->setSize(1024 * $group);
                $fileInfo->setMTime(time());
                $fileInfo->setFileHash($hash);
                $fileInfo->setNodeId(8000 + ($group * 10) + $i);

                $this->fileInfoMapper->insert($fileInfo);
            }
        }

        // Trigger duplicate detection
        $this->fileDuplicateService->updateDuplicatesForUser($this->testUserId);
    }
}