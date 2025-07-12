<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ScannerUtilTest extends TestCase
{
    /** @var ScannerUtil */
    private $scanner;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var FilterService|MockObject */
    private $filterService;

    /** @var ExcludedFolderService|MockObject */
    private $excludedFolderService;

    /** @var LoggerInterface|MockObject */
    private $logger;

    /** @var OutputInterface|MockObject */
    private $output;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->output = $this->createMock(OutputInterface::class);

        $this->scanner = new ScannerUtil(
            $this->fileInfoService,
            $this->filterService,
            $this->excludedFolderService,
            $this->logger
        );
    }

    /**
     * Test scanning a folder with files
     */
    public function testScanFolderWithFiles(): void
    {
        $file1 = $this->createMock(File::class);
        $file1->method('getPath')->willReturn('/user/files/test1.txt');
        $file1->method('getMTime')->willReturn(1234567890);
        $file1->method('getMimetype')->willReturn('text/plain');

        $file2 = $this->createMock(File::class);
        $file2->method('getPath')->willReturn('/user/files/test2.txt');
        $file2->method('getMTime')->willReturn(1234567891);
        $file2->method('getMimetype')->willReturn('text/plain');

        $folder = $this->createMock(Folder::class);
        $folder->method('getDirectoryListing')->willReturn([$file1, $file2]);
        $folder->method('getPath')->willReturn('/user/files');

        // Filter should not ignore these files
        $this->filterService->expects($this->exactly(2))
            ->method('isIgnored')
            ->willReturn(false);

        // Excluded folder service should not exclude
        $this->excludedFolderService->expects($this->exactly(2))
            ->method('isPathExcluded')
            ->willReturn(false);

        // File info service should update
        $this->fileInfoService->expects($this->exactly(2))
            ->method('updateFileMeta');

        $result = $this->scanner->scanFolder($folder, 'user', $this->output);

        $this->assertEquals(2, $result);
    }

    /**
     * Test scanning with excluded folders
     */
    public function testScanWithExcludedFolder(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn('/user/files/excluded/test.txt');

        $folder = $this->createMock(Folder::class);
        $folder->method('getDirectoryListing')->willReturn([$file]);
        $folder->method('getPath')->willReturn('/user/files/excluded');

        // File is in excluded folder
        $this->excludedFolderService->expects($this->once())
            ->method('isPathExcluded')
            ->with('/user/files/excluded/test.txt')
            ->willReturn(true);

        // Should not update file meta
        $this->fileInfoService->expects($this->never())
            ->method('updateFileMeta');

        $result = $this->scanner->scanFolder($folder, 'user', $this->output);

        $this->assertEquals(0, $result);
    }

    /**
     * Test scanning with ignored file types
     */
    public function testScanWithIgnoredFileTypes(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn('/user/files/test.tmp');
        $file->method('getMimetype')->willReturn('application/x-trash');

        $folder = $this->createMock(Folder::class);
        $folder->method('getDirectoryListing')->willReturn([$file]);

        // Filter should ignore this file
        $this->filterService->expects($this->once())
            ->method('isIgnored')
            ->with($file)
            ->willReturn(true);

        // Should not check excluded folders
        $this->excludedFolderService->expects($this->never())
            ->method('isPathExcluded');

        // Should not update file meta
        $this->fileInfoService->expects($this->never())
            ->method('updateFileMeta');

        $result = $this->scanner->scanFolder($folder, 'user', $this->output);

        $this->assertEquals(0, $result);
    }

    /**
     * Test handling of nested folders
     */
    public function testScanNestedFolders(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn('/user/files/subfolder/test.txt');

        $subfolder = $this->createMock(Folder::class);
        $subfolder->method('getDirectoryListing')->willReturn([$file]);
        $subfolder->method('getPath')->willReturn('/user/files/subfolder');

        $rootFolder = $this->createMock(Folder::class);
        $rootFolder->method('getDirectoryListing')->willReturn([$subfolder]);
        $rootFolder->method('getPath')->willReturn('/user/files');

        $this->filterService->method('isIgnored')->willReturn(false);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        // Should update the file in subfolder
        $this->fileInfoService->expects($this->once())
            ->method('updateFileMeta')
            ->with($file, 'user', null);

        $result = $this->scanner->scanFolder($rootFolder, 'user', $this->output);

        $this->assertEquals(1, $result);
    }

    /**
     * Test handling of file access errors
     */
    public function testScanWithFileAccessError(): void
    {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn('/user/files/error.txt');
        $file->method('getMTime')->willThrowException(new NotFoundException('Access denied'));

        $folder = $this->createMock(Folder::class);
        $folder->method('getDirectoryListing')->willReturn([$file]);

        $this->filterService->method('isIgnored')->willReturn(false);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        // Should log error
        $this->logger->expects($this->once())
            ->method('error')
            ->with($this->stringContains('Error scanning file'));

        // Should not update file meta
        $this->fileInfoService->expects($this->never())
            ->method('updateFileMeta');

        $result = $this->scanner->scanFolder($folder, 'user', $this->output);

        $this->assertEquals(0, $result);
    }
}
