<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\LivePhotoStatusService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\SurplusRowsMerger;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\MultipleObjectsReturnedException;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileDuplicateServiceFullTest extends TestCase
{
    /** @var FileDuplicateService */
    private $service;

    /** @var FileDuplicateMapper|MockObject */
    private $mapper;

    /** @var FileInfoService|MockObject */
    private $fileInfoService;

    /** @var OriginFolderService|MockObject */
    private $originFolderService;

    /** @var ILockingProvider|MockObject */
    private $lockingProvider;

    /** @var LivePhotoStatusService|MockObject */
    private $livePhotoStatusService;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileDuplicateMapper::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->lockingProvider = $this->createMock(ILockingProvider::class);
        $this->livePhotoStatusService = $this->createMock(LivePhotoStatusService::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new FileDuplicateService(
            $this->logger,
            $this->mapper,
            $this->fileInfoService,
            $this->originFolderService,
            $this->lockingProvider,
            $this->livePhotoStatusService
        );
    }

    private function makeDuplicate(string $hash, bool $acknowledged, array $paths): FileDuplicate
    {
        $duplicate = new FileDuplicate($hash, 'file_hash');
        $duplicate->setAcknowledged($acknowledged);
        $files = [];
        foreach ($paths as $index => $path) {
            $fi = new FileInfo($path, 'alice');
            $fi->setId($index + 1);
            $fi->setFileHash($hash);
            $fi->setNodeId(100 + $index);
            $fi->setSize(2048);
            $files[] = $fi;
        }
        $duplicate->setFiles($files);

        return $duplicate;
    }

    public function testFindAllWithNullTypeReturnsAllAccessibleDuplicates(): void
    {
        $unack = $this->makeDuplicate('hash_u', false, ['/alice/files/a.txt', '/alice/files/b.txt']);
        $ack = $this->makeDuplicate('hash_a', true, ['/alice/files/c.txt', '/alice/files/d.txt']);

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with(null, 20, 0, [['hash'], ['type']], null)
            ->willReturn([$unack, $ack]);

        $result = $this->service->findAll();

        $this->assertCount(2, $result['entities']);
        $this->assertTrue($result['isLastFetched']);
        $this->assertSame(2, $result['nextOffset']);
    }

    public function testFindAllFiltersAcknowledgedAndUnacknowledgedAndSkipsSingletons(): void
    {
        $unack = $this->makeDuplicate('hash_u', false, ['/alice/files/a.txt', '/alice/files/b.txt']);
        $ack = $this->makeDuplicate('hash_a', true, ['/alice/files/c.txt', '/alice/files/d.txt']);

        $this->mapper->expects($this->once())
            ->method('findAll')
            ->with('alice', 10, 0, [['hash'], ['type']], 'acknowledged')
            ->willReturn([$unack, $ack]);

        $this->fileInfoService->method('findByHash')
            ->with('hash_a', 'file_hash')
            ->willReturn($ack->getFiles());
        $this->fileInfoService->method('hasAccessRight')->willReturn(true);

        $result = $this->service->findAll('acknowledged', 'alice', 1, 10, false);

        $this->assertCount(1, $result['entities']);
        $this->assertSame('hash_a', $result['entities'][0]->getHash());
    }

    public function testGetOrCreateInsertsWhenMissingAndReusesFirstOnCollision(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('find')
            ->withConsecutive(['missing_hash', 'file_hash'], ['dup_hash', 'file_hash'])
            ->willReturnOnConsecutiveCalls(
                $this->throwException(new DoesNotExistException('not found')),
                $this->throwException(new MultipleObjectsReturnedException('multiple'))
            );

        $this->mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function (FileDuplicate $entity): FileDuplicate {
                $entity->setId(10);

                return $entity;
            });

        $existing = new FileDuplicate('dup_hash', 'file_hash');
        $existing->setId(1);
        $this->mapper->expects($this->once())
            ->method('findFirst')
            ->with('dup_hash', 'file_hash')
            ->willReturn($existing);

        $created = $this->service->getOrCreate('missing_hash');
        $this->assertSame(10, $created->getId());
        $this->assertFalse($created->keepAsPrimary());

        $reused = $this->service->getOrCreate('dup_hash');
        $this->assertSame(1, $reused->getId());
    }

    public function testRemoveIfOrphanedDeletesOnlyWhenFewerThanTwoFilesRemain(): void
    {
        $this->service->removeIfOrphaned(null);
        $this->service->removeIfOrphaned('');

        $this->fileInfoService->expects($this->once())
            ->method('countByHash')
            ->with('orphan_hash', 'file_hash')
            ->willReturn(1);

        $dup = $this->makeDuplicate('orphan_hash', false, ['/alice/files/only.txt']);
        $this->mapper->expects($this->once())
            ->method('find')
            ->with('orphan_hash', 'file_hash')
            ->willReturn($dup);
        $this->lockingProvider->expects($this->once())
            ->method('releaseAll')
            ->with('/alice/files/only.txt', ILockingProvider::LOCK_SHARED);
        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($dup->getFiles()[0]);
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($dup);

        $this->service->removeIfOrphaned('orphan_hash');
    }

    public function testDeleteHandlesMultipleObjectsReturnedByDroppingAllByHash(): void
    {
        $this->mapper->expects($this->once())
            ->method('find')
            ->with('multi_hash', 'file_hash')
            ->willThrowException(new MultipleObjectsReturnedException('collision'));
        $this->mapper->expects($this->once())
            ->method('deleteByHash')
            ->with('multi_hash', 'file_hash');

        $this->assertNull($this->service->delete('multi_hash'));
    }

    public function testMergeSurplusRowsReturnsRemovedCountAndCatchesExceptions(): void
    {
        $this->assertSame(0, $this->service->mergeSurplusRows());

        $merger = $this->createMock(SurplusRowsMerger::class);
        $merger->expects($this->exactly(2))
            ->method('run')
            ->with(5.0)
            ->willReturnOnConsecutiveCalls(
                ['removed' => 4, 'lastId' => 40, 'finished' => true],
                $this->throwException(new \RuntimeException('DB timeout'))
            );

        $serviceWithMerger = new FileDuplicateService(
            $this->logger,
            $this->mapper,
            $this->fileInfoService,
            $this->originFolderService,
            $this->lockingProvider,
            $this->livePhotoStatusService,
            $merger
        );

        $this->assertSame(4, $serviceWithMerger->mergeSurplusRows(5.0));
        $this->assertSame(0, $serviceWithMerger->mergeSurplusRows(5.0));
    }

    public function testGetTotalCountForwardsMinSizeOnlyWhenPositive(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('getTotalCount')
            ->withConsecutive(
                ['unacknowledged', 'alice'],
                ['acknowledged', 'alice', 4096]
            )
            ->willReturnOnConsecutiveCalls(5, 2);

        $this->assertSame(5, $this->service->getTotalCount('unacknowledged', 'alice', 0));
        $this->assertSame(2, $this->service->getTotalCount('acknowledged', 'alice', 4096));
    }
}
