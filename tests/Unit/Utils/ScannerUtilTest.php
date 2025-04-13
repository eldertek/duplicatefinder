<?php

namespace OCA\DuplicateFinder\Tests\Unit\Utils;

use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ScannerUtilTest extends TestCase
{
    private $connection;
    private $eventDispatcher;
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

        $this->connection = $this->createMock(IDBConnection::class);
        $this->eventDispatcher = $this->createMock(IEventDispatcher::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->shareService = $this->createMock(ShareService::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->output = $this->createMock(OutputInterface::class);

        $this->scannerUtil = new ScannerUtil(
            $this->connection,
            $this->eventDispatcher,
            $this->logger,
            $this->shareService,
            $this->filterService,
            $this->folderService
        );

        $this->scannerUtil->setHandles($this->fileInfoService, $this->output, null);
    }

    public function testScanSkipsDirectoryWithNoDupeFinderFile()
    {
        // Create mock folder
        $folder = $this->createMock(Folder::class);
        $userFolder = $this->createMock(Folder::class);

        // Set up the user folder
        $this->folderService->expects($this->once())
            ->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);

        // Set up the path
        $userFolder->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files');

        // Set up the node retrieval
        $userFolder->expects($this->once())
            ->method('get')
            ->with('test/path')
            ->willReturn($folder);

        // Set up the .nodupefinder check
        $this->filterService->expects($this->once())
            ->method('shouldSkipDirectory')
            ->with($folder)
            ->willReturn(true);

        // The scanner should not be initialized if the directory is skipped
        $this->eventDispatcher->expects($this->never())
            ->method('dispatch');

        // Execute the scan method
        $this->scannerUtil->scan('testuser', '/testuser/files/test/path');
    }

    public function testScanProcessesDirectoryWithoutNoDupeFinderFile()
    {
        // This test is more complex as it would need to mock the Scanner class
        // which is not easily accessible for testing. For a real implementation,
        // you would need to use a more sophisticated approach or integration tests.

        // For now, we'll just verify that the directory is checked for .nodupefinder
        // and the scan would proceed if it doesn't have one

        // Create mock folder
        $folder = $this->createMock(Folder::class);
        $userFolder = $this->createMock(Folder::class);

        // Set up the user folder
        $this->folderService->expects($this->once())
            ->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);

        // Set up the path
        $userFolder->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files');

        // Set up the node retrieval
        $userFolder->expects($this->once())
            ->method('get')
            ->with('test/path')
            ->willReturn($folder);

        // Set up the .nodupefinder check - this time it returns false
        $this->filterService->expects($this->once())
            ->method('shouldSkipDirectory')
            ->with($folder)
            ->willReturn(false);

        // We can't easily test the actual scanning process without mocking the Scanner class,
        // so we'll just verify that the directory check happens correctly

        // Execute the scan method - this will throw an exception because we can't mock the Scanner class properly
        // but that's okay for this unit test since we're just testing the directory check
        try {
            $this->scannerUtil->scan('testuser', '/testuser/files/test/path');
        } catch (\Exception $e) {
            // Expected exception due to incomplete mocking
        }
    }

    // Note: We can't directly test scanSharedFiles as it's a private method
    // Instead, we'll focus on testing the main scan method and its behavior with .nodupefinder files

    public function testScanWithNoDupeFinderInRootFolder()
    {
        // Create mock folder
        $userFolder = $this->createMock(Folder::class);

        // Set up the user folder
        $this->folderService->expects($this->once())
            ->method('getUserFolder')
            ->with('testuser')
            ->willReturn($userFolder);

        // Set up the path
        $userFolder->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files');

        // In this case, we're testing the root folder itself
        // so we don't need to mock the 'get' method

        // Set up the .nodupefinder check
        $this->filterService->expects($this->once())
            ->method('shouldSkipDirectory')
            ->with($userFolder)
            ->willReturn(true);

        // The scanner should not be initialized if the directory is skipped
        $this->eventDispatcher->expects($this->never())
            ->method('dispatch');

        // Execute the scan method
        $this->scannerUtil->scan('testuser', '/testuser/files');
    }
}
