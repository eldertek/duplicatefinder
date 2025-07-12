<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\File;
use OCP\Share\IManager as IShareManager;
use OCP\Share\IShare;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileServiceMergeTest extends TestCase
{
    /** @var FileService */
    private $service;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var FileDuplicateService|MockObject */
    private $fileDuplicateService;

    /** @var FolderService|MockObject */
    private $folderService;

    /** @var IShareManager|MockObject */
    private $shareManager;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->shareManager = $this->createMock(IShareManager::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new FileService(
            $this->fileInfoService,
            $this->fileDuplicateService,
            $this->folderService,
            $this->shareManager,
            $this->logger
        );
    }

    /**
     * Test merging duplicates by keeping one file
     */
    public function testMergeDuplicatesKeepOne(): void
    {
        $hash = 'abc123';
        $keepFileId = 1;

        // Create file infos
        $keepFile = new FileInfo();
        $keepFile->setId($keepFileId);
        $keepFile->setPath('/user/files/keep.txt');
        $keepFile->setFileHash($hash);

        $deleteFile1 = new FileInfo();
        $deleteFile1->setId(2);
        $deleteFile1->setPath('/user/files/delete1.txt');
        $deleteFile1->setFileHash($hash);

        $deleteFile2 = new FileInfo();
        $deleteFile2->setId(3);
        $deleteFile2->setPath('/user/files/delete2.txt');
        $deleteFile2->setFileHash($hash);

        // Create duplicate entry
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setFiles([$keepFile, $deleteFile1, $deleteFile2]);

        $this->fileDuplicateService->expects($this->once())
            ->method('find')
            ->with($hash)
            ->willReturn($duplicate);

        // Mock file nodes
        $keepNode = $this->createMock(File::class);
        $deleteNode1 = $this->createMock(File::class);
        $deleteNode2 = $this->createMock(File::class);

        $this->folderService->expects($this->exactly(3))
            ->method('getNodeByFileInfo')
            ->willReturnMap([
                [$keepFile, null, $keepNode],
                [$deleteFile1, null, $deleteNode1],
                [$deleteFile2, null, $deleteNode2],
            ]);

        // Expect files to be deleted
        $deleteNode1->expects($this->once())->method('delete');
        $deleteNode2->expects($this->once())->method('delete');

        // Expect file infos to be deleted
        $this->fileInfoService->expects($this->exactly(2))
            ->method('delete')
            ->withConsecutive([$deleteFile1], [$deleteFile2]);

        $result = $this->service->mergeDuplicates($hash, [$keepFileId]);

        $this->assertTrue($result);
    }

    /**
     * Test merging with shared files
     */
    public function testMergeDuplicatesWithSharedFiles(): void
    {
        $hash = 'abc123';
        $keepFileId = 1;

        $keepFile = new FileInfo();
        $keepFile->setId($keepFileId);
        $keepFile->setPath('/user/files/keep.txt');

        $sharedFile = new FileInfo();
        $sharedFile->setId(2);
        $sharedFile->setPath('/user/files/shared.txt');

        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);
        $duplicate->setFiles([$keepFile, $sharedFile]);

        $this->fileDuplicateService->method('find')->willReturn($duplicate);

        $keepNode = $this->createMock(File::class);
        $sharedNode = $this->createMock(File::class);
        $sharedNode->method('getId')->willReturn(100);

        $this->folderService->method('getNodeByFileInfo')
            ->willReturnMap([
                [$keepFile, null, $keepNode],
                [$sharedFile, null, $sharedNode],
            ]);

        // Check if file is shared
        $share = $this->createMock(IShare::class);
        $this->shareManager->expects($this->once())
            ->method('getSharesByNode')
            ->with($sharedNode)
            ->willReturn([$share]);

        // Should log warning about shared file
        $this->logger->expects($this->once())
            ->method('warning')
            ->with($this->stringContains('File is shared'));

        // Shared file should still be deleted if user confirms
        $sharedNode->expects($this->once())->method('delete');
        $this->fileInfoService->expects($this->once())->method('delete')->with($sharedFile);

        $result = $this->service->mergeDuplicates($hash, [$keepFileId]);

        $this->assertTrue($result);
    }

    /**
     * Test merging with inaccessible files
     */
    public function testMergeDuplicatesWithInaccessibleFiles(): void
    {
        $hash = 'abc123';
        $keepFileId = 1;

        $keepFile = new FileInfo();
        $keepFile->setId($keepFileId);

        $inaccessibleFile = new FileInfo();
        $inaccessibleFile->setId(2);
        $inaccessibleFile->setPath('/user/files/inaccessible.txt');

        $duplicate = new FileDuplicate();
        $duplicate->setFiles([$keepFile, $inaccessibleFile]);

        $this->fileDuplicateService->method('find')->willReturn($duplicate);

        $keepNode = $this->createMock(File::class);

        // Inaccessible file returns null
        $this->folderService->method('getNodeByFileInfo')
            ->willReturnMap([
                [$keepFile, null, $keepNode],
                [$inaccessibleFile, null, null],
            ]);

        // Should log error about inaccessible file
        $this->logger->expects($this->once())
            ->method('error')
            ->with($this->stringContains('Could not access file'));

        // Should still delete the database entry
        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($inaccessibleFile);

        $result = $this->service->mergeDuplicates($hash, [$keepFileId]);

        $this->assertTrue($result);
    }

    /**
     * Test merging with no files to keep
     */
    public function testMergeDuplicatesWithNoFilesToKeep(): void
    {
        $hash = 'abc123';

        $this->expectException(\InvalidArgumentException::class);
        $this->expectExceptionMessage('No files selected to keep');

        $this->service->mergeDuplicates($hash, []);
    }

    /**
     * Test merging when duplicate not found
     */
    public function testMergeDuplicatesNotFound(): void
    {
        $hash = 'nonexistent';

        $this->fileDuplicateService->expects($this->once())
            ->method('find')
            ->with($hash)
            ->willThrowException(new \Exception('Not found'));

        $this->expectException(\Exception::class);

        $this->service->mergeDuplicates($hash, [1]);
    }

    /**
     * Test merge with file deletion failure
     */
    public function testMergeDuplicatesWithDeletionFailure(): void
    {
        $hash = 'abc123';
        $keepFileId = 1;

        $keepFile = new FileInfo();
        $keepFile->setId($keepFileId);

        $deleteFile = new FileInfo();
        $deleteFile->setId(2);

        $duplicate = new FileDuplicate();
        $duplicate->setFiles([$keepFile, $deleteFile]);

        $this->fileDuplicateService->method('find')->willReturn($duplicate);

        $keepNode = $this->createMock(File::class);
        $deleteNode = $this->createMock(File::class);

        $this->folderService->method('getNodeByFileInfo')
            ->willReturnMap([
                [$keepFile, null, $keepNode],
                [$deleteFile, null, $deleteNode],
            ]);

        // Deletion fails
        $deleteNode->expects($this->once())
            ->method('delete')
            ->willThrowException(new \Exception('Permission denied'));

        // Should log error
        $this->logger->expects($this->once())
            ->method('error')
            ->with($this->stringContains('Failed to delete file'));

        // Database entry should still be deleted
        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($deleteFile);

        $result = $this->service->mergeDuplicates($hash, [$keepFileId]);

        // Should still return true as database was cleaned
        $this->assertTrue($result);
    }

    /**
     * Test merging updates duplicate count
     */
    public function testMergeDuplicatesUpdatesDuplicateCount(): void
    {
        $hash = 'abc123';
        $keepFileId = 1;

        $keepFile = new FileInfo();
        $keepFile->setId($keepFileId);

        $deleteFile = new FileInfo();
        $deleteFile->setId(2);

        $duplicate = new FileDuplicate();
        $duplicate->setFiles([$keepFile, $deleteFile]);

        $this->fileDuplicateService->method('find')->willReturn($duplicate);

        $keepNode = $this->createMock(File::class);
        $deleteNode = $this->createMock(File::class);

        $this->folderService->method('getNodeByFileInfo')
            ->willReturnMap([
                [$keepFile, null, $keepNode],
                [$deleteFile, null, $deleteNode],
            ]);

        $deleteNode->method('delete');
        $this->fileInfoService->method('delete');

        // Should refresh duplicate status after merge
        $this->fileDuplicateService->expects($this->once())
            ->method('refreshDuplicateStatus')
            ->with($hash);

        $this->service->mergeDuplicates($hash, [$keepFileId]);
    }
}
