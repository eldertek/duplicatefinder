<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCP\Files\Node;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * FileInfoService::hasOtherLiveCopy() decides whether a file may be deleted without losing its content.
 */
class FileInfoServiceLastCopyTest extends TestCase
{
    private $mapper;
    private $folderService;
    private $shareService;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->shareService = $this->createMock(ShareService::class);

        // The constructor wants the whole Nextcloud file system: only what the method uses is set
        $reflection = new \ReflectionClass(FileInfoService::class);
        $this->service = $reflection->newInstanceWithoutConstructor();
        foreach ([
            'mapper' => $this->mapper,
            'folderService' => $this->folderService,
            'shareService' => $this->shareService,
            'logger' => $this->createMock(LoggerInterface::class),
        ] as $name => $value) {
            $property = $reflection->getProperty($name);
            $property->setAccessible(true);
            $property->setValue($this->service, $value);
        }
    }

    private function row(int $id, string $path, string $owner): FileInfo
    {
        $fileInfo = new FileInfo($path, $owner);
        $fileInfo->setId($id);
        $fileInfo->setFileHash('hash-a');

        return $fileInfo;
    }

    private function node(?int $id): Node
    {
        $node = $this->createMock(Node::class);
        $node->method('getId')->willReturn($id);
        $node->method('getMimetype')->willReturn('image/jpeg');
        $node->method('getSize')->willReturn(100);

        return $node;
    }

    /**
     * @param array<string, Node|null> $nodesByPath what Nextcloud finds for each row
     */
    private function givenRows(array $rows, array $nodesByPath): void
    {
        $this->mapper->method('findByHash')->with('hash-a', 'file_hash')->willReturn($rows);
        $this->folderService->method('getNodeByFileInfo')->willReturnCallback(
            function (FileInfo $fileInfo) use ($nodesByPath): ?Node {
                return $nodesByPath[$fileInfo->getPath()] ?? null;
            }
        );
    }

    public function testAnotherExistingCopyOfTheUserCounts(): void
    {
        $this->givenRows(
            [$this->row(1, '/alice/files/a.jpg', 'alice'), $this->row(2, '/alice/files/b.jpg', 'alice')],
            ['/alice/files/a.jpg' => $this->node(10), '/alice/files/b.jpg' => $this->node(11)]
        );

        $this->assertTrue($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }

    /**
     * Issue 180: an entry of a file that is gone is not a copy to fall back on.
     */
    public function testEntryOfADeletedFileDoesNotCount(): void
    {
        $this->givenRows(
            [$this->row(1, '/alice/files/a.jpg', 'alice'), $this->row(2, '/alice/files/deleted.jpg', 'alice')],
            ['/alice/files/a.jpg' => $this->node(10)]
        );

        $this->assertFalse($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }

    public function testEntryPointingToTheSameNodeDoesNotCount(): void
    {
        $this->givenRows(
            [$this->row(1, '/alice/files/a.jpg', 'alice'), $this->row(2, '/alice/files/via-mount/a.jpg', 'alice')],
            ['/alice/files/a.jpg' => $this->node(10), '/alice/files/via-mount/a.jpg' => $this->node(10)]
        );

        $this->assertFalse($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }

    public function testCopyOfAnotherUserCountsOnlyWhenSharedWithTheUser(): void
    {
        $this->givenRows(
            [$this->row(1, '/alice/files/a.jpg', 'alice'), $this->row(2, '/bob/files/a.jpg', 'bob')],
            ['/alice/files/a.jpg' => $this->node(10), '/bob/files/a.jpg' => $this->node(20)]
        );
        $this->shareService->method('hasAccessRight')->willReturn('/alice/files/Shared');

        $this->assertTrue($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }

    public function testCopyOfAnotherUserThatIsNotSharedDoesNotCount(): void
    {
        $this->givenRows(
            [$this->row(1, '/alice/files/a.jpg', 'alice'), $this->row(2, '/bob/files/a.jpg', 'bob')],
            ['/alice/files/a.jpg' => $this->node(10), '/bob/files/a.jpg' => $this->node(20)]
        );
        $this->shareService->method('hasAccessRight')->willReturn(null);

        $this->assertFalse($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }

    public function testNoCopyAtAll(): void
    {
        $this->givenRows([], []);

        $this->assertFalse($this->service->hasOtherLiveCopy('hash-a', 10, 'alice'));
    }
}
