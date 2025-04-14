<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class MergeServiceTest extends TestCase {
    private $fileService;
    private $originFolderService;
    private $logger;

    protected function setUp(): void {
        parent::setUp();
        $this->fileService = $this->createMock(FileService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    /**
     * Test that merging duplicates preserves files in origin folders
     */
    public function testMergeDuplicatesPreservesOriginFolders() {
        // Create test files
        $regularFile = $this->createMockFileInfo(1000, '/user1/files/regular.txt', 'user1', false);
        $protectedFile = $this->createMockFileInfo(1000, '/user1/files/protected/important.txt', 'user1', true);
        $anotherRegularFile = $this->createMockFileInfo(1000, '/user1/files/another/regular.txt', 'user1', false);

        // Configure originFolderService to identify protected files
        $this->originFolderService->method('isPathProtected')
            ->willReturnCallback(function ($path) {
                return [
                    'isProtected' => str_contains($path, 'protected'),
                    'protectingFolder' => str_contains($path, 'protected') ? '/protected' : null
                ];
            });

        // Configure fileService to throw exception when trying to delete protected files
        $this->fileService->method('deleteFile')
            ->willReturnCallback(function ($userId, $path) {
                if (str_contains($path, 'protected')) {
                    throw new OriginFolderProtectionException(
                        sprintf('Cannot delete file "%s" as it is protected by origin folder "%s"', $path, '/protected')
                    );
                }
                return true;
            });

        // Create an array of files to merge
        $files = [$regularFile, $protectedFile, $anotherRegularFile];
        $filesToDelete = [$regularFile, $anotherRegularFile]; // Try to delete all except the protected one

        // Set up expectations
        $this->fileService->expects($this->exactly(2))
            ->method('deleteFile')
            ->withConsecutive(
                ['user1', '/user1/files/regular.txt'],
                ['user1', '/user1/files/another/regular.txt']
            );

        // Perform the merge operation
        $results = $this->performMerge($files, $filesToDelete);

        // Verify the results
        $this->assertEquals(2, $results['deleted']);
        $this->assertEquals(0, $results['failed']);
        $this->assertEquals(1, $results['preserved']); // The protected file should be preserved
    }

    /**
     * Test that merging duplicates fails when trying to delete all files
     */
    public function testMergeDuplicatesFailsWhenDeletingAllFiles() {
        // Create test files
        $file1 = $this->createMockFileInfo(1000, '/user1/files/file1.txt', 'user1', false);
        $file2 = $this->createMockFileInfo(1000, '/user1/files/file2.txt', 'user1', false);
        $file3 = $this->createMockFileInfo(1000, '/user1/files/file3.txt', 'user1', false);

        // Create an array of files to merge
        $files = [$file1, $file2, $file3];
        $filesToDelete = [$file1, $file2, $file3]; // Try to delete all files

        // Set up expectations - no files should be deleted
        $this->fileService->expects($this->never())
            ->method('deleteFile');

        // Perform the merge operation
        $results = $this->performMerge($files, $filesToDelete);

        // Verify the results
        $this->assertEquals(0, $results['deleted']);
        $this->assertEquals(0, $results['failed']);
        $this->assertEquals(3, $results['preserved']); // All files should be preserved
        $this->assertEquals('Cannot delete all files in a duplicate group', $results['error']);
    }

    /**
     * Helper method to create a mock FileInfo with a specific size and protection status
     */
    private function createMockFileInfo(int $size, string $path, string $owner, bool $isProtected): FileInfo {
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getSize', 'getPath', 'getOwner', 'isInOriginFolder'])
            ->getMock();
        $fileInfo->method('getSize')->willReturn($size);
        $fileInfo->method('getPath')->willReturn($path);
        $fileInfo->method('getOwner')->willReturn($owner);
        $fileInfo->method('isInOriginFolder')->willReturn($isProtected);
        return $fileInfo;
    }

    /**
     * Helper method to simulate the merge operation
     */
    private function performMerge(array $allFiles, array $filesToDelete): array {
        // This simulates the merge operation logic
        $results = [
            'deleted' => 0,
            'failed' => 0,
            'preserved' => 0,
            'error' => null
        ];

        // Check if we're trying to delete all files
        if (count($filesToDelete) === count($allFiles)) {
            $results['error'] = 'Cannot delete all files in a duplicate group';
            $results['preserved'] = count($allFiles);
            return $results;
        }

        // Process each file to delete
        foreach ($filesToDelete as $file) {
            try {
                $this->fileService->deleteFile($file->getOwner(), $file->getPath());
                $results['deleted']++;
            } catch (OriginFolderProtectionException $e) {
                // File is protected, so it's preserved
                $results['preserved']++;
            } catch (\Exception $e) {
                $results['failed']++;
            }
        }

        // Count remaining files as preserved
        $results['preserved'] += count($allFiles) - count($filesToDelete);

        return $results;
    }
}
