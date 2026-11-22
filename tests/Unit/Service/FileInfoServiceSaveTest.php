<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\DB\Exception as DBException;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * #198: a file reached through a share is stored with the owner of the file, not with the user who scans.
 * save() must find that row again instead of inserting one more row at every scan.
 */
class FileInfoServiceSaveTest extends TestCase
{
    private $mapper;
    private $folderService;
    private $service;

    public static function setUpBeforeClass(): void
    {
        // IRootFolder extends a server interface that the composer-only test bootstrap does not provide
        if (!interface_exists('OC\Hooks\Emitter')) {
            eval('namespace OC\Hooks; interface Emitter { public function listen($scope, $method, callable $callback); public function removeListener($scope = null, $method = null, ?callable $callback = null); }');
        }
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->service = new FileInfoService(
            $this->mapper,
            $this->createMock(IEventDispatcher::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(ShareService::class),
            $this->createMock(FilterService::class),
            $this->folderService,
            $this->createMock(ScannerUtil::class),
            $this->createMock(ILockingProvider::class),
            $this->createMock(IRootFolder::class),
            $this->createMock(IDBConnection::class),
            $this->createMock(ExcludedFolderService::class)
        );
    }

    public function testSharedFileOfAnotherOwnerIsUpdatedNotInsertedAgain()
    {
        $path = '/userB/files/Dokumenty (2)/some_file.zip';
        $existing = new FileInfo($path, 'userA');
        $existing->setId(7);

        $lookups = [];
        $this->mapper->method('find')->willReturnCallback(function (string $p, ?string $uid) use ($existing, &$lookups) {
            $lookups[] = $uid;
            if ($uid === 'userB') {
                throw new DoesNotExistException('FileInfo not found');
            }

            return $existing;
        });
        $this->folderService->method('getNodeByFileInfo')->willReturn(null);

        $this->mapper->expects($this->never())->method('insert');

        try {
            $this->service->save($path, 'userB');
        } catch (\Throwable $e) {
            // the node is not reachable in this test: what matters is the lookup, not the update
        }

        // the row of the owner of the file is looked for by the path alone after the scanning user found nothing
        $this->assertSame(['userB', null], $lookups);
    }

    public function testUnknownPathIsStillInserted()
    {
        $path = '/userA/files/new.txt';
        $this->mapper->method('find')->willThrowException(new DoesNotExistException('FileInfo not found'));
        $node = $this->createMock(Node::class);
        $this->folderService->method('getNodeByFileInfo')->willReturn($node);
        $this->mapper->expects($this->once())->method('insert')->willReturnArgument(0);

        try {
            $this->service->save($path, 'userA');
        } catch (\Throwable $e) {
            // the stubbed node cannot answer everything; the insert is what is checked
        }
    }

    public function testUpdateFailureDoesNotFallBackToInsert(): void
    {
        $path = '/userA/files/existing.bin';
        $existing = new FileInfo($path, 'userA');
        $existing->setId(11);

        $owner = $this->createMock(IUser::class);
        $owner->method('getUID')->willReturn('userA');
        $node = $this->createMock(Node::class);
        $node->method('getSize')->willReturn(123);
        $node->method('getMimetype')->willReturn('application/octet-stream');
        $node->method('getOwner')->willReturn($owner);

        $this->mapper->method('find')->willReturn($existing);
        $this->folderService->method('getNodeByFileInfo')->willReturn($node);
        $this->mapper->method('update')->willThrowException(new \RuntimeException('transient write failure'));
        $this->mapper->expects($this->never())->method('insert');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('transient write failure');

        $this->service->save($path, 'userA');
    }

    public function testConcurrentInsertUniqueConstraintFallsBackToUpdate(): void
    {
        $path = '/userA/files/race.bin';
        $winner = new FileInfo($path, 'userA');
        $winner->setId(42);

        $owner = $this->createMock(IUser::class);
        $owner->method('getUID')->willReturn('userA');
        $node = $this->createMock(Node::class);
        $node->method('getSize')->willReturn(456);
        $node->method('getMimetype')->willReturn('application/octet-stream');
        $node->method('getOwner')->willReturn($owner);

        $findCalls = 0;
        $this->mapper->method('find')->willReturnCallback(function () use (&$findCalls, $winner) {
            $findCalls++;
            if ($findCalls <= 2) {
                throw new DoesNotExistException('FileInfo not found');
            }

            return $winner;
        });
        $this->folderService->method('getNodeByFileInfo')->willReturn($node);

        $uniqueError = new class ('Duplicate entry for path_hash') extends DBException {
            public function getReason(): ?int
            {
                return DBException::REASON_UNIQUE_CONSTRAINT_VIOLATION;
            }
        };
        $this->mapper->expects($this->once())->method('insert')->willThrowException($uniqueError);
        $this->mapper->expects($this->once())->method('update')->willReturnArgument(0);

        $saved = $this->service->save($path, 'userA');
        $this->assertSame(42, $saved->getId());
    }

    public function testUpdateOverwritingExistingPathDeletesStaleRowAndRetries(): void
    {
        $targetPath = '/userA/files/target.bin';
        $moving = new FileInfo($targetPath, 'userA');
        $moving->setId(99);

        $owner = $this->createMock(IUser::class);
        $owner->method('getUID')->willReturn('userA');
        $node = $this->createMock(Node::class);
        $node->method('getSize')->willReturn(789);
        $node->method('getMimetype')->willReturn('application/octet-stream');
        $node->method('getOwner')->willReturn($owner);

        $this->folderService->method('getNodeByFileInfo')->willReturn($node);

        $uniqueError = new class ('Duplicate entry for path_hash') extends DBException {
            public function getReason(): ?int
            {
                return DBException::REASON_UNIQUE_CONSTRAINT_VIOLATION;
            }
        };
        $updateAttempt = 0;
        $this->mapper->expects($this->exactly(2))
            ->method('update')
            ->willReturnCallback(function (FileInfo $entity) use (&$updateAttempt, $uniqueError) {
                $updateAttempt++;
                if ($updateAttempt === 1) {
                    throw $uniqueError;
                }

                return $entity;
            });
        $this->mapper->expects($this->once())
            ->method('deleteOtherByPathHash')
            ->with(sha1($targetPath), 99)
            ->willReturn(1);

        $updated = $this->service->update($moving, 'userA');
        $this->assertSame(99, $updated->getId());
    }
}
