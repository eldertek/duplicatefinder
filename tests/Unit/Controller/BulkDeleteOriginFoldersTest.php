<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\IRequest;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class BulkDeleteOriginFoldersTest extends TestCase
{
    private $controller;
    private $fileDuplicateService;
    private $fileInfoService;
    private $originFolderService;

    protected function setUp(): void
    {
        parent::setUp();

        $request = $this->createMock(IRequest::class);
        $userSession = $this->createMock(IUserSession::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $userManager = $this->createMock(IUserManager::class);
        $logger = $this->createMock(LoggerInterface::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);

        $this->controller = new DuplicateApiController(
            'duplicatefinder',
            $request,
            $userSession,
            $this->fileDuplicateService,
            $this->fileInfoService,
            $fileDuplicateMapper,
            $userManager,
            $logger,
            $this->originFolderService
        );
    }

    /**
     * Test that bulk delete properly filters and counts protected files
     * This tests the fix for issue #152
     */
    public function testBulkDeleteWithProtectedFiles()
    {
        // Create test data with mixed protected and non-protected files
        $duplicate1 = new FileDuplicate('hash1', 'file_hash');
        $file1a = new FileInfo();
        $file1a->setPath('/user/files/Documents/file1.txt');
        $file1a->setIsInOriginFolder(true); // Protected

        $file1b = new FileInfo();
        $file1b->setPath('/user/files/Downloads/file1.txt');
        $file1b->setIsInOriginFolder(false); // Not protected

        $duplicate1->setFiles([$file1a, $file1b]);

        // Create a group with only protected files
        $duplicate2 = new FileDuplicate('hash2', 'file_hash');
        $file2a = new FileInfo();
        $file2a->setPath('/user/files/Documents/file2.txt');
        $file2a->setIsInOriginFolder(true); // Protected

        $file2b = new FileInfo();
        $file2b->setPath('/user/files/Documents/backup/file2.txt');
        $file2b->setIsInOriginFolder(true); // Also protected

        $duplicate2->setFiles([$file2a, $file2b]);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [$duplicate1, $duplicate2],
                'pageKey' => 0,
                'isLastFetched' => true,
            ]);

        $this->fileDuplicateService->expects($this->once())
            ->method('getTotalCount')
            ->willReturn(2);

        $response = $this->controller->list(1, 30, 'unacknowledged', true);
        $data = $response->getData();

        // Check first duplicate group (mixed files)
        $this->assertEquals(1, count($data['entities'][0]->getFiles()));
        $this->assertEquals(1, $data['entities'][0]->getProtectedFileCount());
        $this->assertFalse($data['entities'][0]->getHasOnlyProtectedFiles());

        // Check second duplicate group (only protected files)
        $this->assertEquals(0, count($data['entities'][1]->getFiles()));
        $this->assertEquals(2, $data['entities'][1]->getProtectedFileCount());
        $this->assertTrue($data['entities'][1]->getHasOnlyProtectedFiles());
    }

    /**
     * Test that single non-protected file can be deleted when protected copies exist
     */
    public function testAllowDeletionWhenProtectedCopiesExist()
    {
        $duplicate = new FileDuplicate('hash3', 'file_hash');

        // One non-protected file
        $file1 = new FileInfo();
        $file1->setPath('/user/files/temp/file.txt');
        $file1->setIsInOriginFolder(false);

        // Two protected files
        $file2 = new FileInfo();
        $file2->setPath('/user/files/Documents/file.txt');
        $file2->setIsInOriginFolder(true);

        $file3 = new FileInfo();
        $file3->setPath('/user/files/Archive/file.txt');
        $file3->setIsInOriginFolder(true);

        $duplicate->setFiles([$file1, $file2, $file3]);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [$duplicate],
                'pageKey' => 0,
                'isLastFetched' => true,
            ]);

        $response = $this->controller->list(1, 30, 'unacknowledged', true);
        $data = $response->getData();

        // Should have one deletable file
        $this->assertEquals(1, count($data['entities'][0]->getFiles()));
        $this->assertEquals('/user/files/temp/file.txt', $data['entities'][0]->getFiles()[0]->getPath());
        $this->assertEquals(2, $data['entities'][0]->getProtectedFileCount());

        // The single non-protected file should be deletable since protected copies exist
        $this->assertFalse($data['entities'][0]->getHasOnlyProtectedFiles());
    }
}
