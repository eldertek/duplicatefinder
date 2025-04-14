<?php

namespace OCA\DuplicateFinder\Tests\Integration;

use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;

/**
 * Integration test for user isolation in duplicate detection
 */
class UserIsolationTest extends TestCase
{
    /** @var IRootFolder */
    private $rootFolder;

    /** @var IUserManager */
    private $userManager;

    /** @var FileInfoService */
    private $fileInfoService;

    /** @var FileDuplicateService */
    private $fileDuplicateService;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $fileDuplicateMapper;

    /** @var string */
    private $testUserA = 'test-user-a';

    /** @var string */
    private $testUserB = 'test-user-b';

    /** @var Folder */
    private $userFolderA;

    /** @var Folder */
    private $userFolderB;

    /** @var array */
    private $testFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        // Get services from the container
        $this->rootFolder = \OC::$server->get(IRootFolder::class);
        $this->userManager = \OC::$server->get(IUserManager::class);
        $this->fileInfoService = \OC::$server->get(FileInfoService::class);
        $this->fileDuplicateService = \OC::$server->get(FileDuplicateService::class);
        $this->fileInfoMapper = \OC::$server->get(FileInfoMapper::class);
        $this->fileDuplicateMapper = \OC::$server->get(FileDuplicateMapper::class);

        // Create test users if they don't exist
        if (!$this->userManager->userExists($this->testUserA)) {
            $this->userManager->createUser($this->testUserA, 'SecurePassword123!A');
        }

        if (!$this->userManager->userExists($this->testUserB)) {
            $this->userManager->createUser($this->testUserB, 'SecurePassword123!B');
        }

        // Get the users' folders
        $this->userFolderA = $this->rootFolder->getUserFolder($this->testUserA);
        $this->userFolderB = $this->rootFolder->getUserFolder($this->testUserB);

        // Clean up any existing test files
        $this->cleanupTestFiles();

        // Create test files
        $this->createTestFiles();
    }

    protected function tearDown(): void
    {
        // Clean up test files
        $this->cleanupTestFiles();

        // Clean up database entries
        $this->cleanupDatabase();

        parent::tearDown();
    }

    /**
     * Test that users can only see their own duplicates
     */
    public function testUserIsolation()
    {
        // Scan files for both users
        $this->fileInfoService->scanFiles($this->testUserA);
        $this->fileInfoService->scanFiles($this->testUserB);

        // Get duplicates for user A
        $duplicatesA = $this->fileDuplicateService->findAll('all', $this->testUserA);

        // Get duplicates for user B
        $duplicatesB = $this->fileDuplicateService->findAll('all', $this->testUserB);

        // Verify that user A can see their duplicates
        $this->assertGreaterThanOrEqual(1, count($duplicatesA['entities']), 'User A should have at least one duplicate group');

        // Verify that user B can see their duplicates
        $this->assertGreaterThanOrEqual(1, count($duplicatesB['entities']), 'User B should have at least one duplicate group');

        // Verify that user A cannot see user B's files
        foreach ($duplicatesA['entities'] as $duplicate) {
            $files = $duplicate->getFiles();
            foreach ($files as $file) {
                $path = $file->getPath();
                $this->assertStringContainsString($this->testUserA, $path, 'User A should only see their own files');
                $this->assertStringNotContainsString($this->testUserB, $path, 'User A should not see User B files');
            }
        }

        // Verify that user B cannot see user A's files
        foreach ($duplicatesB['entities'] as $duplicate) {
            $files = $duplicate->getFiles();
            foreach ($files as $file) {
                $path = $file->getPath();
                $this->assertStringContainsString($this->testUserB, $path, 'User B should only see their own files');
                $this->assertStringNotContainsString($this->testUserA, $path, 'User B should not see User A files');
            }
        }
    }

    /**
     * Create test files for both users
     */
    private function createTestFiles()
    {
        // Create test folders for user A
        $folderA1 = $this->createFolder($this->userFolderA, 'TestFolderA1');
        $folderA2 = $this->createFolder($this->userFolderA, 'TestFolderA2');

        // Create test folders for user B
        $folderB1 = $this->createFolder($this->userFolderB, 'TestFolderB1');
        $folderB2 = $this->createFolder($this->userFolderB, 'TestFolderB2');

        // Create duplicate files for user A
        $duplicateA1 = $this->createFile($folderA1, 'duplicateA1.txt', 'This is user A duplicate content');
        $duplicateA2 = $this->createFile($folderA2, 'duplicateA2.txt', 'This is user A duplicate content');

        // Create duplicate files for user B
        $duplicateB1 = $this->createFile($folderB1, 'duplicateB1.txt', 'This is user B duplicate content');
        $duplicateB2 = $this->createFile($folderB2, 'duplicateB2.txt', 'This is user B duplicate content');

        // Create a file with the same content for both users (but they should not see each other's files)
        $sharedContentA = $this->createFile($folderA1, 'shared_content.txt', 'This content is in both user accounts');
        $sharedContentB = $this->createFile($folderB1, 'shared_content.txt', 'This content is in both user accounts');

        // Store test file information
        $this->testFiles = [
            'userA' => [
                [
                    'path' => $duplicateA1->getPath(),
                    'node' => $duplicateA1
                ],
                [
                    'path' => $duplicateA2->getPath(),
                    'node' => $duplicateA2
                ],
                [
                    'path' => $sharedContentA->getPath(),
                    'node' => $sharedContentA
                ]
            ],
            'userB' => [
                [
                    'path' => $duplicateB1->getPath(),
                    'node' => $duplicateB1
                ],
                [
                    'path' => $duplicateB2->getPath(),
                    'node' => $duplicateB2
                ],
                [
                    'path' => $sharedContentB->getPath(),
                    'node' => $sharedContentB
                ]
            ],
            'foldersA' => [$folderA1, $folderA2],
            'foldersB' => [$folderB1, $folderB2]
        ];
    }

    /**
     * Create a folder in the specified directory
     */
    private function createFolder(Folder $parentFolder, string $name): Folder
    {
        if ($parentFolder->nodeExists($name)) {
            return $parentFolder->get($name);
        }
        return $parentFolder->newFolder($name);
    }

    /**
     * Create a file with the given content
     */
    private function createFile(Folder $folder, string $name, string $content): File
    {
        if ($folder->nodeExists($name)) {
            $file = $folder->get($name);
            $file->putContent($content);
            return $file;
        }
        $file = $folder->newFile($name);
        $file->putContent($content);
        return $file;
    }

    /**
     * Clean up test files
     */
    private function cleanupTestFiles()
    {
        // Clean up test folders for user A
        $testFoldersA = ['TestFolderA1', 'TestFolderA2'];
        foreach ($testFoldersA as $folderName) {
            if ($this->userFolderA->nodeExists($folderName)) {
                $folder = $this->userFolderA->get($folderName);
                $folder->delete();
            }
        }

        // Clean up test folders for user B
        $testFoldersB = ['TestFolderB1', 'TestFolderB2'];
        foreach ($testFoldersB as $folderName) {
            if ($this->userFolderB->nodeExists($folderName)) {
                $folder = $this->userFolderB->get($folderName);
                $folder->delete();
            }
        }
    }

    /**
     * Clean up database entries
     */
    private function cleanupDatabase()
    {
        // Clean up file info entries for user A
        if (!empty($this->testFiles['userA'])) {
            foreach ($this->testFiles['userA'] as $fileInfo) {
                try {
                    $path = $fileInfo['path'];
                    $fileInfoEntity = $this->fileInfoMapper->find($path, $this->testUserA);
                    $this->fileInfoMapper->delete($fileInfoEntity);
                } catch (\Exception $e) {
                    // Ignore if the entry doesn't exist
                }
            }
        }

        // Clean up file info entries for user B
        if (!empty($this->testFiles['userB'])) {
            foreach ($this->testFiles['userB'] as $fileInfo) {
                try {
                    $path = $fileInfo['path'];
                    $fileInfoEntity = $this->fileInfoMapper->find($path, $this->testUserB);
                    $this->fileInfoMapper->delete($fileInfoEntity);
                } catch (\Exception $e) {
                    // Ignore if the entry doesn't exist
                }
            }
        }
    }
}
