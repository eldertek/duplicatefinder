<?php

namespace OCA\DuplicateFinder\Tests\Integration\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\File;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use Test\TestCase;

/**
 * Integration test for FileInfoService with real database
 * @group DB
 */
class FileInfoServiceIntegrationTest extends TestCase
{
    /** @var FileInfoService */
    private $service;

    /** @var IDBConnection */
    private $db;

    /** @var FileInfoMapper */
    private $mapper;

    /** @var string */
    private $testUserId = 'test-user-' . time();

    protected function setUp(): void
    {
        parent::setUp();

        $this->db = \OC::$server->getDatabaseConnection();
        $this->mapper = new FileInfoMapper($this->db);

        // Create mock dependencies
        $rootFolder = $this->createMock(IRootFolder::class);
        $folderService = $this->createMock(FolderService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $eventDispatcher = $this->createMock(IEventDispatcher::class);
        $filterService = $this->createMock(FilterService::class);

        $this->service = new FileInfoService(
            $this->mapper,
            $rootFolder,
            $folderService,
            $fileDuplicateService,
            $eventDispatcher,
            $filterService
        );
    }

    protected function tearDown(): void
    {
        // Clean up test data
        $query = $this->db->getQueryBuilder();
        $query->delete('duplicatefinder_finfo')
            ->where($query->expr()->eq('owner', $query->createNamedParameter($this->testUserId)));
        $query->executeStatement();

        parent::tearDown();
    }

    /**
     * Test creating and retrieving file info from database
     */
    public function testCreateAndRetrieveFileInfo(): void
    {
        // Create file info
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/file.txt');
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setSize(1024);
        $fileInfo->setMTime(time());
        $fileInfo->setFileHash('testhash123');
        $fileInfo->setNodeId(999);

        // Save to database
        $saved = $this->mapper->insert($fileInfo);
        $this->assertNotNull($saved->getId());

        // Retrieve from database
        $retrieved = $this->mapper->find($saved->getId());
        $this->assertEquals($fileInfo->getPath(), $retrieved->getPath());
        $this->assertEquals($fileInfo->getOwner(), $retrieved->getOwner());
        $this->assertEquals($fileInfo->getSize(), $retrieved->getSize());
        $this->assertEquals($fileInfo->getFileHash(), $retrieved->getFileHash());
    }

    /**
     * Test finding duplicates by hash
     */
    public function testFindByHash(): void
    {
        $hash = 'duplicatehash456';

        // Create multiple files with same hash
        for ($i = 1; $i <= 3; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(2048);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash($hash);
            $fileInfo->setNodeId(1000 + $i);

            $this->mapper->insert($fileInfo);
        }

        // Find all files with this hash
        $duplicates = $this->service->findByHash($hash);
        $this->assertCount(3, $duplicates);

        // Verify all have the same hash
        foreach ($duplicates as $duplicate) {
            $this->assertEquals($hash, $duplicate->getFileHash());
            $this->assertEquals($this->testUserId, $duplicate->getOwner());
        }
    }

    /**
     * Test marking file as stale (nodeId = null)
     */
    public function testMarkFileAsStale(): void
    {
        // Create file info
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/stale.txt');
        $fileInfo->setOwner($this->testUserId);
        $fileInfo->setSize(512);
        $fileInfo->setMTime(time());
        $fileInfo->setFileHash('stalehash789');
        $fileInfo->setNodeId(2000);

        $saved = $this->mapper->insert($fileInfo);
        $this->assertNotNull($saved->getNodeId());

        // Mark as stale
        $saved->setNodeId(null);
        $updated = $this->mapper->update($saved);

        // Verify it's marked as stale
        $retrieved = $this->mapper->find($updated->getId());
        $this->assertNull($retrieved->getNodeId());
        $this->assertEquals('stalehash789', $retrieved->getFileHash());
    }

    /**
     * Test batch operations
     */
    public function testBatchOperations(): void
    {
        $fileInfos = [];

        // Create batch of files
        for ($i = 1; $i <= 10; $i++) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/batch/file$i.txt");
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(100 * $i);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('batchhash' . $i);
            $fileInfo->setNodeId(3000 + $i);

            $fileInfos[] = $this->mapper->insert($fileInfo);
        }

        // Find all for user
        $userFiles = $this->mapper->findAll($this->testUserId);
        $this->assertGreaterThanOrEqual(10, count($userFiles));

        // Delete by user
        $deleted = $this->mapper->deleteByUser($this->testUserId);
        $this->assertGreaterThanOrEqual(10, $deleted);

        // Verify deletion
        $remaining = $this->mapper->findAll($this->testUserId);
        $this->assertCount(0, $remaining);
    }

    /**
     * Test transaction handling
     */
    public function testTransactionHandling(): void
    {
        $this->db->beginTransaction();

        try {
            // Create file in transaction
            $fileInfo = new FileInfo();
            $fileInfo->setPath('/test/transaction.txt');
            $fileInfo->setOwner($this->testUserId);
            $fileInfo->setSize(1024);
            $fileInfo->setMTime(time());
            $fileInfo->setFileHash('transactionhash');
            $fileInfo->setNodeId(4000);

            $saved = $this->mapper->insert($fileInfo);

            // Rollback transaction
            $this->db->rollBack();

            // File should not exist
            $this->expectException(\OCP\AppFramework\Db\DoesNotExistException::class);
            $this->mapper->find($saved->getId());

        } catch (\Exception $e) {
            $this->db->rollBack();

            throw $e;
        }
    }
}
