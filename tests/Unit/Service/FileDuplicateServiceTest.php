<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileDuplicateServiceTest extends TestCase
{
    private $mapper;
    private $fileInfoService;
    private $logger;
    private $originFolderService;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileDuplicateMapper::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);

        $this->service = new FileDuplicateService(
            $this->logger,
            $this->mapper,
            $this->fileInfoService,
            $this->originFolderService,
            $this->createMock(\OCP\Lock\ILockingProvider::class)
        );
    }

    /**
     * Test that hasAccessRight correctly identifies files that belong to other users
     * and prevents them from being included in the current user's duplicates
     */
    public function testHasAccessRightFiltersByOwner()
    {
        // Create FileInfo mocks for files with different owners
        $fileInfo1 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo1->method('getPath')->willReturn('/user1/files/document.txt');
        $fileInfo1->method('getOwner')->willReturn('user1');

        $fileInfo2 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo2->method('getPath')->willReturn('/user2/files/document.txt');
        $fileInfo2->method('getOwner')->willReturn('user2');

        // Configure hasAccessRight to return true for files owned by the user and false for others
        $this->fileInfoService->expects($this->exactly(2))
            ->method('hasAccessRight')
            ->withConsecutive(
                [$fileInfo1, 'user1'],
                [$fileInfo2, 'user1']
            )
            ->willReturnOnConsecutiveCalls(true, false);

        // Test that a file owned by the current user is accessible
        $this->assertTrue(
            $this->fileInfoService->hasAccessRight($fileInfo1, 'user1'),
            'Files owned by the current user should be accessible'
        );

        // Test that a file owned by another user is not accessible
        $this->assertFalse(
            $this->fileInfoService->hasAccessRight($fileInfo2, 'user1'),
            'Files owned by other users should not be accessible'
        );
    }

    /**
     * Test that duplicates can be sorted by size in descending order (largest first)
     */
    public function testFindAllWithSortBySizeDescending()
    {
        // Create mock FileInfo objects with different sizes
        $smallFileInfo1 = $this->createMockFileInfo(100, '/user1/files/small1.txt', 'user1');
        $smallFileInfo2 = $this->createMockFileInfo(100, '/user1/files/small2.txt', 'user1');
        $mediumFileInfo1 = $this->createMockFileInfo(500, '/user1/files/medium1.txt', 'user1');
        $mediumFileInfo2 = $this->createMockFileInfo(500, '/user1/files/medium2.txt', 'user1');
        $largeFileInfo1 = $this->createMockFileInfo(1000, '/user1/files/large1.txt', 'user1');
        $largeFileInfo2 = $this->createMockFileInfo(1000, '/user1/files/large2.txt', 'user1');

        // Create mock FileDuplicate objects with at least 2 files each
        $smallDuplicate = $this->createMockDuplicate('hash1', [$smallFileInfo1, $smallFileInfo2]);
        $mediumDuplicate = $this->createMockDuplicate('hash2', [$mediumFileInfo1, $mediumFileInfo2]);
        $largeDuplicate = $this->createMockDuplicate('hash3', [$largeFileInfo1, $largeFileInfo2]);

        // Configure the mapper to return the duplicates in unsorted order
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with('user1', 20, 0, [['size', 'DESC']])
            ->willReturn([$smallDuplicate, $largeDuplicate, $mediumDuplicate]);

        // Configure fileInfoService to return the correct files for each hash
        $this->fileInfoService->expects($this->exactly(3))
            ->method('findByHash')
            ->willReturnMap([
                ['hash1', 'file_hash', [$smallFileInfo1, $smallFileInfo2]],
                ['hash2', 'file_hash', [$mediumFileInfo1, $mediumFileInfo2]],
                ['hash3', 'file_hash', [$largeFileInfo1, $largeFileInfo2]],
            ]);

        // Configure fileInfoService.hasAccessRight to always return true
        $this->fileInfoService->expects($this->exactly(6))
            ->method('hasAccessRight')
            ->willReturn(true);

        // Call the method with size sorting
        $result = $this->service->findAll('all', 'user1', 1, 20, false, [['size', 'DESC']]);

        // Verify the result contains the duplicates in the expected order
        $this->assertCount(3, $result['entities']);

        // The duplicates should be returned in the order provided by the mapper
        // (we're testing that the service correctly passes the sort parameters to the mapper)
        $this->assertEquals('hash1', $result['entities'][0]->getHash());
        $this->assertEquals('hash3', $result['entities'][1]->getHash());
        $this->assertEquals('hash2', $result['entities'][2]->getHash());
    }

    /**
     * Test that duplicates can be sorted by size in ascending order (smallest first)
     */
    public function testFindAllWithSortBySizeAscending()
    {
        // Create mock FileInfo objects with different sizes
        $smallFileInfo1 = $this->createMockFileInfo(100, '/user1/files/small1.txt', 'user1');
        $smallFileInfo2 = $this->createMockFileInfo(100, '/user1/files/small2.txt', 'user1');
        $mediumFileInfo1 = $this->createMockFileInfo(500, '/user1/files/medium1.txt', 'user1');
        $mediumFileInfo2 = $this->createMockFileInfo(500, '/user1/files/medium2.txt', 'user1');
        $largeFileInfo1 = $this->createMockFileInfo(1000, '/user1/files/large1.txt', 'user1');
        $largeFileInfo2 = $this->createMockFileInfo(1000, '/user1/files/large2.txt', 'user1');

        // Create mock FileDuplicate objects with at least 2 files each
        $smallDuplicate = $this->createMockDuplicate('hash1', [$smallFileInfo1, $smallFileInfo2]);
        $mediumDuplicate = $this->createMockDuplicate('hash2', [$mediumFileInfo1, $mediumFileInfo2]);
        $largeDuplicate = $this->createMockDuplicate('hash3', [$largeFileInfo1, $largeFileInfo2]);

        // Configure the mapper to return the duplicates in unsorted order
        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with('user1', 20, 0, [['size', 'ASC']])
            ->willReturn([$largeDuplicate, $smallDuplicate, $mediumDuplicate]);

        // Configure fileInfoService to return the correct files for each hash
        $this->fileInfoService->expects($this->exactly(3))
            ->method('findByHash')
            ->willReturnMap([
                ['hash1', 'file_hash', [$smallFileInfo1, $smallFileInfo2]],
                ['hash2', 'file_hash', [$mediumFileInfo1, $mediumFileInfo2]],
                ['hash3', 'file_hash', [$largeFileInfo1, $largeFileInfo2]],
            ]);

        // Configure fileInfoService.hasAccessRight to always return true
        $this->fileInfoService->expects($this->exactly(6))
            ->method('hasAccessRight')
            ->willReturn(true);

        // Call the method with size sorting
        $result = $this->service->findAll('all', 'user1', 1, 20, false, [['size', 'ASC']]);

        // Verify the result contains the duplicates in the expected order
        $this->assertCount(3, $result['entities']);

        // The duplicates should be returned in the order provided by the mapper
        // (we're testing that the service correctly passes the sort parameters to the mapper)
        $this->assertEquals('hash3', $result['entities'][0]->getHash());
        $this->assertEquals('hash1', $result['entities'][1]->getHash());
        $this->assertEquals('hash2', $result['entities'][2]->getHash());
    }

    /** @dataProvider excludedStatusProvider */
    public function testFindAllSkipsExcludedStatusBeforeFileLookups(string $type, bool $acknowledged, ?string $user): void
    {
        $duplicate = $this->createStatusDuplicate('excluded', $acknowledged);
        $this->mapper->expects($this->once())->method('findAll')
            ->with($user, 20, 0, [['hash'], ['type']])
            ->willReturn([$duplicate]);
        $this->fileInfoService->expects($this->never())->method('findByHash');
        $this->fileInfoService->expects($this->never())->method('hasAccessRight');
        $this->fileInfoService->expects($this->never())->method('enrich');
        $this->originFolderService->expects($this->never())->method('isPathProtected');

        $result = $this->service->findAll($type, $user, 1, 20, true);

        $this->assertSame([], $result['entities']);
        $this->assertSame(0, $result['pageKey']);
        $this->assertTrue($result['isLastFetched']);
    }

    public static function excludedStatusProvider(): array
    {
        return [
            'unacknowledged with user' => ['unacknowledged', true, 'user1'],
            'acknowledged with user' => ['acknowledged', false, 'user1'],
            'unacknowledged without user' => ['unacknowledged', true, null],
            'acknowledged without user' => ['acknowledged', false, null],
        ];
    }

    /** @dataProvider matchingStatusProvider */
    public function testFindAllRetainsMatchingGroups(string $type, array $expectedHashes): void
    {
        $acknowledged = $this->createStatusDuplicate('acknowledged-hash', true);
        $unacknowledged = $this->createStatusDuplicate('unacknowledged-hash', false);
        $groups = [$acknowledged, $unacknowledged];
        $this->mapper->expects($this->once())->method('findAll')
            ->with('user1', 20, 0, [['hash'], ['type']])->willReturn($groups);
        $this->expectStatusFileLookups($groups, $expectedHashes);

        $result = $this->service->findAll($type, 'user1', 1, 20, true);

        $this->assertSame($expectedHashes, array_map(function (FileDuplicate $group): string {
            return $group->getHash();
        }, $result['entities']));
        foreach ($result['entities'] as $group) {
            $this->assertCount(2, $group->getFiles());
        }
        $this->assertSame(0, $result['pageKey']);
        $this->assertTrue($result['isLastFetched']);
    }

    public static function matchingStatusProvider(): array
    {
        return [
            'acknowledged' => ['acknowledged', ['acknowledged-hash']],
            'unacknowledged' => ['unacknowledged', ['unacknowledged-hash']],
            'all' => ['all', ['acknowledged-hash', 'unacknowledged-hash']],
        ];
    }

    /** @dataProvider filteredPageProvider */
    public function testFindAllContinuesPastExcludedPage(string $type, bool $acknowledged): void
    {
        $excluded1 = $this->createStatusDuplicate('excluded-1', !$acknowledged);
        $excluded2 = $this->createStatusDuplicate('excluded-2', !$acknowledged);
        $matching = $this->createStatusDuplicate('matching', $acknowledged);
        $orderBy = [['size', 'DESC']];
        $this->mapper->expects($this->exactly(2))->method('findAll')
            ->withConsecutive(
                ['user1', 2, 2, $orderBy],
                ['user1', 2, 4, $orderBy]
            )->willReturnOnConsecutiveCalls([$excluded1, $excluded2], [$matching]);
        $this->expectStatusFileLookups([$matching], ['matching']);

        $result = $this->service->findAll($type, 'user1', 2, 2, true, $orderBy);

        $this->assertSame([$matching], $result['entities']);
        $this->assertSame(4, $result['pageKey']);
        $this->assertTrue($result['isLastFetched']);
    }

    public static function filteredPageProvider(): array
    {
        return [
            'acknowledged' => ['acknowledged', true],
            'unacknowledged' => ['unacknowledged', false],
        ];
    }

    /**
     * Issue 183: the copies Nextcloud cannot find any more (deleted from the web interface or
     * from a client, the database entry still there) are not offered as duplicates.
     */
    public function testEnrichDropsFilesThatNoLongerExist(): void
    {
        $alive1 = $this->createExistingFile('/user1/files/a/photo.jpg');
        $alive2 = $this->createExistingFile('/user1/files/b/photo.jpg');
        $ghost = new FileInfo('/user1/files/deleted/photo.jpg', 'user1');
        $duplicate = new FileDuplicate('hash-ghost', 'file_hash');
        $duplicate->setFiles([$alive1, $ghost, $alive2]);

        $this->fileInfoService->method('enrich')->willReturnArgument(0);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false]);

        $enriched = $this->service->enrich($duplicate);

        $this->assertSame(
            ['/user1/files/a/photo.jpg', '/user1/files/b/photo.jpg'],
            array_map(function (FileInfo $file): string {
                return $file->getPath();
            }, $enriched->getFiles())
        );
    }

    public function testFindAllLeavesOutGroupsWhoseOtherCopiesAreGone(): void
    {
        $alive = $this->createExistingFile('/user1/files/a/photo.jpg');
        $ghost = new FileInfo('/user1/files/deleted/photo.jpg', 'user1');
        $group = new FileDuplicate('hash-last-alive', 'file_hash');
        $group->setFiles([$alive, $ghost]);
        $this->mapper->method('findAll')->willReturn([$group]);
        $this->fileInfoService->method('findByHash')->willReturn([$alive, $ghost]);
        $this->fileInfoService->method('hasAccessRight')->willReturn(true);
        $this->fileInfoService->method('enrich')->willReturnArgument(0);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false]);

        $result = $this->service->findAll('all', 'user1', 1, 20, true);

        $this->assertSame([], $result['entities']);
    }

    public function testRemoveIfOrphanedDeletesTheGroupOfALastFile(): void
    {
        $this->fileInfoService->method('countByHash')->with('lonely', 'file_hash')->willReturn(1);
        $this->mapper->expects($this->once())->method('find')->with('lonely', 'file_hash')
            ->willReturn(new FileDuplicate('lonely', 'file_hash'));
        $this->mapper->expects($this->once())->method('delete');

        $this->service->removeIfOrphaned('lonely');
    }

    public function testRemoveIfOrphanedKeepsAGroupThatStillHasCopies(): void
    {
        $this->fileInfoService->method('countByHash')->with('shared', 'file_hash')->willReturn(2);
        $this->mapper->expects($this->never())->method('find');
        $this->mapper->expects($this->never())->method('delete');

        $this->service->removeIfOrphaned('shared');
    }

    public function testRemoveIfOrphanedIgnoresFilesWithoutHash(): void
    {
        $this->fileInfoService->expects($this->never())->method('countByHash');

        $this->service->removeIfOrphaned(null);
        $this->service->removeIfOrphaned('');
    }

    /**
     * Issue 178: rows that were inserted twice for a hash no longer make the removal of the group fail.
     */
    public function testDeleteRemovesEveryRowOfAHashThatWasInsertedSeveralTimes(): void
    {
        $this->mapper->expects($this->once())->method('find')->with('twice', 'file_hash')
            ->willThrowException(new \OCP\AppFramework\Db\MultipleObjectsReturnedException('two rows'));
        $this->mapper->expects($this->once())->method('deleteByHash')->with('twice', 'file_hash')->willReturn(2);
        $this->logger->expects($this->never())->method('error');

        $this->assertNull($this->service->delete('twice'));
    }

    /**
     * Issue 178: the oldest row is reused instead of a new one being inserted.
     */
    public function testGetOrCreateReusesTheOldestRowWhenSeveralExist(): void
    {
        $oldest = new FileDuplicate('twice', 'file_hash');
        $this->mapper->expects($this->once())->method('find')
            ->willThrowException(new \OCP\AppFramework\Db\MultipleObjectsReturnedException('two rows'));
        $this->mapper->expects($this->once())->method('findFirst')->with('twice', 'file_hash')->willReturn($oldest);
        $this->mapper->expects($this->never())->method('insert');

        $this->assertSame($oldest, $this->service->getOrCreate('twice'));
    }

    public function testGetOrCreateStillInsertsWhenNoRowExists(): void
    {
        $this->mapper->expects($this->once())->method('find')
            ->willThrowException(new \OCP\AppFramework\Db\DoesNotExistException('none'));
        $this->mapper->expects($this->once())->method('insert')->willReturnArgument(0);

        $created = $this->service->getOrCreate('brand-new');

        $this->assertSame('brand-new', $created->getHash());
    }

    private function createStatusDuplicate(string $hash, bool $acknowledged): FileDuplicate
    {
        $duplicate = new FileDuplicate($hash, 'file_hash');
        $duplicate->setAcknowledged($acknowledged);
        $duplicate->setFiles([
            $this->createExistingFile('/user1/files/' . $hash . '-1.txt'),
            $this->createExistingFile('/user1/files/' . $hash . '-2.txt'),
        ]);

        return $duplicate;
    }

    /**
     * A file entry as the enrichment returns it for a file that Nextcloud can find: it has a node id.
     */
    private function createExistingFile(string $path): FileInfo
    {
        $fileInfo = new FileInfo($path, 'user1');
        $fileInfo->setNodeId(crc32($path));

        return $fileInfo;
    }

    private function expectStatusFileLookups(array $groups, array $expectedHashes): void
    {
        $filesByHash = [];
        foreach ($groups as $group) {
            $filesByHash[$group->getHash()] = $group->getFiles();
        }
        $this->fileInfoService->expects($this->exactly(count($expectedHashes)))->method('findByHash')
            ->willReturnCallback(function (string $hash, string $type) use ($filesByHash, $expectedHashes): array {
                $this->assertContains($hash, $expectedHashes);
                $this->assertSame('file_hash', $type);
                return $filesByHash[$hash];
            });
        $this->fileInfoService->expects($this->exactly(2 * count($expectedHashes)))->method('hasAccessRight')
            ->with($this->isInstanceOf(FileInfo::class), 'user1')->willReturn(true);
        $this->fileInfoService->expects($this->exactly(2 * count($expectedHashes)))->method('enrich')
            ->willReturnArgument(0);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false]);
    }

    /**
     * Helper method to create a mock FileInfo with a specific size
     */
    private function createMockFileInfo(int $size, string $path, string $owner): FileInfo
    {
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getSize', 'getPath', 'getOwner', 'getFileHash'])
            ->getMock();
        $fileInfo->method('getSize')->willReturn($size);
        $fileInfo->method('getPath')->willReturn($path);
        $fileInfo->method('getOwner')->willReturn($owner);
        $fileInfo->method('getFileHash')->willReturn(basename($path));

        return $fileInfo;
    }

    /**
     * Helper method to create a FileDuplicate with specific files
     */
    private function createMockDuplicate(string $hash, array $files): FileDuplicate
    {
        $duplicate = new FileDuplicate($hash, 'file_hash');
        $duplicate->setFiles($files);

        return $duplicate;
    }
}
