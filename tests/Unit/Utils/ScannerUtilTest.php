<?php

namespace OCA\DuplicateFinder\Tests\Unit\Utils;

use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\Files\File;
use OCP\Files\Folder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ScannerUtilTest extends TestCase
{
    private $logger;
    private $shareService;
    private $filterService;
    private $folderService;
    private $fileInfoService;
    private $output;
    private $scannerUtil;

    protected function setUp(): void
    {
        parent::setUp();

        $this->logger = $this->createMock(LoggerInterface::class);
        $this->shareService = $this->createMock(ShareService::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->output = $this->createMock(OutputInterface::class);

        $this->scannerUtil = new ScannerUtil(
            $this->logger,
            $this->shareService,
            $this->filterService,
            $this->folderService
        );

        $this->scannerUtil->setHandles($this->fileInfoService, $this->output, null);
    }

    public function testScanSkipsDirectoryWithNoDupeFinderFile()
    {
        $folder = $this->createMock(Folder::class);
        $userFolder = $this->createMock(Folder::class);

        $this->folderService->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);
        $userFolder->method('getPath')->willReturn('/testuser/files');
        $userFolder->method('get')
            ->with('test/path')
            ->willReturn($folder);

        $this->filterService->expects($this->once())
            ->method('shouldSkipDirectory')
            ->with($folder)
            ->willReturn(true);

        // Nothing gets saved when the directory is skipped
        $this->fileInfoService->expects($this->never())
            ->method('save');
        $folder->expects($this->never())
            ->method('getDirectoryListing');

        $this->scannerUtil->scan('testuser', '/testuser/files/test/path');
    }

    public function testScanWithNoDupeFinderInRootFolder()
    {
        $userFolder = $this->createMock(Folder::class);

        $this->folderService->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);
        $userFolder->method('getPath')->willReturn('/testuser/files');

        $this->filterService->expects($this->once())
            ->method('shouldSkipDirectory')
            ->with($userFolder)
            ->willReturn(true);

        $this->fileInfoService->expects($this->never())
            ->method('save');

        $this->scannerUtil->scan('testuser', '/testuser/files');
    }

    public function testScanWalksIndexedTreeAndSavesFiles()
    {
        $file1 = $this->createMock(File::class);
        $file1->method('getPath')->willReturn('/testuser/files/a.txt');
        $file2 = $this->createMock(File::class);
        $file2->method('getPath')->willReturn('/testuser/files/sub/b.txt');

        $subFolder = $this->createMock(Folder::class);
        $subFolder->method('getPath')->willReturn('/testuser/files/sub');
        $subFolder->method('getDirectoryListing')->willReturn([$file2]);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/testuser/files');
        $userFolder->method('getDirectoryListing')->willReturn([$file1, $subFolder]);

        $this->folderService->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);
        $this->filterService->method('shouldSkipDirectory')->willReturn(false);
        $this->shareService->method('getShares')->willReturn([]);

        $savedPaths = [];
        $this->fileInfoService->expects($this->exactly(2))
            ->method('save')
            ->willReturnCallback(function ($path, $user) use (&$savedPaths) {
                $savedPaths[] = $path;

                return new \OCA\DuplicateFinder\Db\FileInfo($path);
            });

        $this->scannerUtil->scan('testuser', '/testuser/files');

        $this->assertEquals(['/testuser/files/a.txt', '/testuser/files/sub/b.txt'], $savedPaths);
    }

    public function testScanSkipsNestedFolderWithNoDupeFinderFile()
    {
        $file1 = $this->createMock(File::class);
        $file1->method('getPath')->willReturn('/testuser/files/a.txt');

        $skippedFolder = $this->createMock(Folder::class);
        $skippedFolder->method('getPath')->willReturn('/testuser/files/skipped');
        $skippedFolder->expects($this->never())->method('getDirectoryListing');

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/testuser/files');
        $userFolder->method('getDirectoryListing')->willReturn([$skippedFolder, $file1]);

        $this->folderService->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);
        $this->filterService->method('shouldSkipDirectory')
            ->willReturnCallback(function ($folder) use ($skippedFolder) {
                return $folder === $skippedFolder;
            });
        $this->shareService->method('getShares')->willReturn([]);

        $this->fileInfoService->expects($this->once())
            ->method('save')
            ->with('/testuser/files/a.txt', 'testuser');

        $this->scannerUtil->scan('testuser', '/testuser/files');
    }
}
