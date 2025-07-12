<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

/**
 * Test for Issue #152: Bulk delete with origin folders
 */
class BulkDeleteProtectedFilesTest extends TestCase
{
    /** @var DuplicateApiController */
    private $controller;

    /** @var IRequest|MockObject */
    private $request;

    /** @var FileDuplicateService|MockObject */
    private $duplicateService;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var OriginFolderService|MockObject */
    private $originFolderService;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->duplicateService = $this->createMock(FileDuplicateService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);

        $this->controller = new DuplicateApiController(
            'duplicatefinder',
            $this->request,
            $this->duplicateService,
            $this->fileInfoService,
            $this->originFolderService
        );
    }

    /**
     * Test that protected file count is included in bulk delete response
     */
    public function testGetDuplicatesForBulkIncludesProtectedFileCount(): void
    {
        // Create test files
        $file1 = new FileInfo();
        $file1->setPath('/user/files/protected/file.txt');
        $file1->setIsInOriginFolder(true); // Protected

        $file2 = new FileInfo();
        $file2->setPath('/user/files/unprotected/file.txt');
        $file2->setIsInOriginFolder(false); // Not protected

        $file3 = new FileInfo();
        $file3->setPath('/user/files/protected2/file.txt');
        $file3->setIsInOriginFolder(true); // Protected

        // Create duplicate group
        $duplicate = new FileDuplicate();
        $duplicate->setHash('test-hash');
        $duplicate->setFiles([$file1, $file2, $file3]);

        $this->duplicateService->expects($this->once())
            ->method('findAll')
            ->with(100, 0)
            ->willReturn([
                'entities' => [$duplicate],
                'pagination' => ['page' => 1, 'totalPages' => 1],
            ]);

        $response = $this->controller->getDuplicatesForBulk(1, 100, true);

        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();

        // Check that protected file count is included
        $this->assertArrayHasKey('duplicateGroups', $data);
        $duplicateGroups = $data['duplicateGroups'];

        $firstGroup = reset($duplicateGroups);
        $this->assertEquals(2, $firstGroup->getProtectedFileCount());
        $this->assertFalse($firstGroup->getHasOnlyProtectedFiles());

        // Check that only non-protected files are in the list
        $files = $firstGroup->getFiles();
        $this->assertCount(1, $files);
        $this->assertEquals('/user/files/unprotected/file.txt', $files[0]->getPath());
    }

    /**
     * Test handling of groups with only protected files
     */
    public function testGetDuplicatesForBulkHandlesOnlyProtectedFiles(): void
    {
        // Create only protected files
        $file1 = new FileInfo();
        $file1->setPath('/user/files/protected/file1.txt');
        $file1->setIsInOriginFolder(true);

        $file2 = new FileInfo();
        $file2->setPath('/user/files/protected/file2.txt');
        $file2->setIsInOriginFolder(true);

        $duplicate = new FileDuplicate();
        $duplicate->setHash('test-hash');
        $duplicate->setFiles([$file1, $file2]);

        $this->duplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [$duplicate],
                'pagination' => ['page' => 1, 'totalPages' => 1],
            ]);

        $response = $this->controller->getDuplicatesForBulk(1, 100, true);
        $data = $response->getData();

        $duplicateGroups = $data['duplicateGroups'];
        $firstGroup = reset($duplicateGroups);

        // Group should be included but marked as having only protected files
        $this->assertEquals(2, $firstGroup->getProtectedFileCount());
        $this->assertTrue($firstGroup->getHasOnlyProtectedFiles());
        $this->assertCount(0, $firstGroup->getFiles());
    }

    /**
     * Test that groups without any files are removed
     */
    public function testGetDuplicatesForBulkRemovesEmptyGroups(): void
    {
        // Create duplicate with no files
        $duplicate = new FileDuplicate();
        $duplicate->setHash('test-hash');
        $duplicate->setFiles([]);

        $this->duplicateService->expects($this->once())
            ->method('findAll')
            ->willReturn([
                'entities' => [$duplicate],
                'pagination' => ['page' => 1, 'totalPages' => 1],
            ]);

        $response = $this->controller->getDuplicatesForBulk(1, 100, true);
        $data = $response->getData();

        // Empty group should be removed
        $this->assertArrayHasKey('duplicateGroups', $data);
        $this->assertCount(0, $data['duplicateGroups']);
    }
}
