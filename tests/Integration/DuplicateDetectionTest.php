<?php

namespace OCA\DuplicateFinder\Tests\Integration;

use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;

/**
 * Integration test for duplicate detection
 */
class DuplicateDetectionTest extends TestCase
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
    private $testUserId = 'test-duplicate-user';

    /** @var Folder */
    private $userFolder;

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

        // Create a test user if it doesn't exist
        if (!$this->userManager->userExists($this->testUserId)) {
            // Create the test user with a secure password
            $this->userManager->createUser($this->testUserId, 'DuplicateFinder2024!@#');
        }

        // Get the user's folder
        $this->userFolder = $this->rootFolder->getUserFolder($this->testUserId);

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
     * Test that duplicate files are correctly detected
     */
    public function testDuplicateDetection()
    {
        // Scan files to detect duplicates
        $this->fileInfoService->scanFiles($this->testUserId);

        // Verify that file info entries were created
        $fileInfos = $this->fileInfoMapper->findAll();
        $this->assertGreaterThanOrEqual(count($this->testFiles), count($fileInfos));

        // Get the duplicate entries
        $duplicates = $this->fileDuplicateService->findAll('all', $this->testUserId);

        // We should have at least one duplicate group (for the identical files)
        $this->assertGreaterThanOrEqual(1, count($duplicates['entities']));

        // Verify that the duplicate group contains the expected files
        $found = false;
        foreach ($duplicates['entities'] as $duplicate) {
            $files = $duplicate->getFiles();
            if (count($files) >= 2) {
                // This is a duplicate group with at least 2 files
                $found = true;

                // Verify that the files have the same hash
                $hash = $files[0]->getFileHash();
                foreach ($files as $file) {
                    $this->assertEquals($hash, $file->getFileHash());
                }

                // Verify that the paths match our test files
                $paths = array_map(function ($file) {
                    return $file->getPath();
                }, $files);

                // At least two of our test duplicate files should be in this group
                $matchCount = 0;
                foreach ($this->testFiles['duplicates'] as $testFile) {
                    if (in_array($testFile['path'], $paths)) {
                        $matchCount++;
                    }
                }

                $this->assertGreaterThanOrEqual(2, $matchCount, 'At least two test duplicate files should be detected');
            }
        }

        $this->assertTrue($found, 'At least one duplicate group should be found');
    }

    /**
     * Create test files for duplicate detection
     */
    private function createTestFiles()
    {
        // Create test folders
        $folder1 = $this->createFolder('TestFolder1');
        $folder2 = $this->createFolder('TestFolder2');

        // Create a unique file
        $uniqueFile = $this->createFile($folder1, 'unique.txt', 'This is a unique file content');

        // Create duplicate files with identical content
        $duplicate1 = $this->createFile($folder1, 'duplicate1.txt', 'This is duplicate content');
        $duplicate2 = $this->createFile($folder2, 'duplicate2.txt', 'This is duplicate content');
        $duplicate3 = $this->createFile($folder2, 'duplicate3.txt', 'This is duplicate content');

        // Store test file information
        $this->testFiles = [
            'unique' => [
                [
                    'path' => $uniqueFile->getPath(),
                    'node' => $uniqueFile,
                ],
            ],
            'duplicates' => [
                [
                    'path' => $duplicate1->getPath(),
                    'node' => $duplicate1,
                ],
                [
                    'path' => $duplicate2->getPath(),
                    'node' => $duplicate2,
                ],
                [
                    'path' => $duplicate3->getPath(),
                    'node' => $duplicate3,
                ],
            ],
            'folders' => [$folder1, $folder2],
        ];
    }

    /**
     * Create a folder in the user's directory
     */
    private function createFolder(string $name): Folder
    {
        if ($this->userFolder->nodeExists($name)) {
            return $this->userFolder->get($name);
        }

        return $this->userFolder->newFolder($name);
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
        // Clean up test folders if they exist
        $testFolders = ['TestFolder1', 'TestFolder2'];
        foreach ($testFolders as $folderName) {
            if ($this->userFolder->nodeExists($folderName)) {
                $folder = $this->userFolder->get($folderName);
                $folder->delete();
            }
        }
    }

    /**
     * Clean up database entries
     */
    private function cleanupDatabase()
    {
        // Clean up file info entries for test files
        if (!empty($this->testFiles)) {
            foreach (array_merge($this->testFiles['unique'] ?? [], $this->testFiles['duplicates'] ?? []) as $fileInfo) {
                try {
                    $path = $fileInfo['path'];
                    $fileInfoEntity = $this->fileInfoMapper->find($path, $this->testUserId);
                    $this->fileInfoMapper->delete($fileInfoEntity);
                } catch (\Exception $e) {
                    // Ignore if the entry doesn't exist
                }
            }
        }
    }
}
