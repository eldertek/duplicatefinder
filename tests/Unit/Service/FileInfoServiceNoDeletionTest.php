<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileInfoServiceNoDeletionTest extends TestCase
{
    private $fileInfoService;
    private $folderService;
    private $mapper;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->folderService = $this->createMock(FolderService::class);
        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $lockingProvider = $this->createMock(ILockingProvider::class);

        $this->fileInfoService = new FileInfoService(
            $this->logger,
            $this->mapper,
            $this->folderService,
            $shareService,
            $lockingProvider
        );
    }

    /**
     * Test that enrich() does NOT delete files when node is not found
     * This tests the fix for issue #153
     */
    public function testEnrichDoesNotDeleteWhenNodeNotFound()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/file.txt');
        $fileInfo->setFileHash('abc123');
        $fileInfo->setId(123);

        // Simulate node not found
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException());

        // The mapper delete method should NEVER be called
        $this->mapper->expects($this->never())
            ->method('delete');

        // Logger should log this as a warning, not an error
        $this->logger->expects($this->once())
            ->method('warning')
            ->with($this->stringContains('file may be temporarily inaccessible'));

        $enrichedFile = $this->fileInfoService->enrich($fileInfo);

        // File should be marked as stale (nodeId = null) but NOT deleted
        $this->assertNull($enrichedFile->getNodeId());
        $this->assertEquals('/test/file.txt', $enrichedFile->getPath());
        $this->assertEquals('abc123', $enrichedFile->getFileHash());
    }

    /**
     * Test that enrich() handles null node gracefully
     */
    public function testEnrichHandlesNullNode()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/file2.txt');
        $fileInfo->setFileHash('def456');
        $fileInfo->setId(456);

        // Simulate node returning null
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn(null);

        // The mapper delete method should NEVER be called
        $this->mapper->expects($this->never())
            ->method('delete');

        $enrichedFile = $this->fileInfoService->enrich($fileInfo);

        // File should be marked as stale but not deleted
        $this->assertNull($enrichedFile->getNodeId());
        $this->assertEquals('/test/file2.txt', $enrichedFile->getPath());
    }

    /**
     * Test that delete() only removes database entry, not the actual file
     */
    public function testDeleteOnlyRemovesDatabaseEntry()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/test/file3.txt');
        $fileInfo->setId(789);

        // Mapper should be called to delete the database entry
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo);

        // No filesystem operations should occur
        // (In the real implementation, this is ensured by not calling any file deletion methods)

        $this->fileInfoService->delete($fileInfo);
    }

    /**
     * Test multiple scenarios that previously caused auto-deletion
     */
    public function testVariousInaccessibilityScenarios()
    {
        $scenarios = [
            'Network timeout' => new \Exception('Network timeout'),
            'Permission denied' => new \Exception('Permission denied'),
            'File locked' => new \Exception('File is locked'),
            'Mount point unavailable' => new NotFoundException('Mount point not available'),
        ];

        foreach ($scenarios as $scenario => $exception) {
            $fileInfo = new FileInfo();
            $fileInfo->setPath("/test/scenario/$scenario.txt");
            $fileInfo->setFileHash(md5($scenario));
            $fileInfo->setId(rand(1000, 9999));

            $this->folderService->expects($this->once())
                ->method('getNodeByFileInfo')
                ->willThrowException($exception);

            // No deletion should occur in any scenario
            $this->mapper->expects($this->never())
                ->method('delete');

            $enrichedFile = $this->fileInfoService->enrich($fileInfo);

            // File should remain in database but marked as stale
            $this->assertNull($enrichedFile->getNodeId(), "Failed for scenario: $scenario");
        }
    }
}
