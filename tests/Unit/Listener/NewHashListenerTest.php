<?php

namespace OCA\DuplicateFinder\Tests\Unit\Listener;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Listener\NewHashListener;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\EventDispatcher\Event;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class NewHashListenerTest extends TestCase
{
    private $listener;
    private $fileInfoService;
    private $fileDuplicateService;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->listener = new NewHashListener(
            $this->fileInfoService,
            $this->fileDuplicateService,
            $this->logger
        );
    }

    public function testHandleWithNonCalculatedHashEvent()
    {
        // Créer un événement générique qui n'est pas un CalculatedHashEvent
        $event = $this->createMock(Event::class);

        // Le service FileDuplicateService ne devrait pas être appelé
        $this->fileDuplicateService->expects($this->never())
            ->method('getOrCreate');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleWithUnchangedHash()
    {
        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setFileHash('testhash');

        // Créer un événement CalculatedHashEvent avec le même hash
        $event = new CalculatedHashEvent($fileInfo, 'testhash');

        // Le service FileDuplicateService ne devrait pas être appelé car le hash n'a pas changé
        $this->fileDuplicateService->expects($this->never())
            ->method('getOrCreate');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    /**
     * @dataProvider changedHashProvider
     */
    public function testHandleWithChangedHash(?string $oldHash, ?string $newHash, array $counts, array $retained, array $deleted): void
    {
        $fileInfo = new FileInfo();
        $fileInfo->setFileHash($newHash);
        $event = new CalculatedHashEvent($fileInfo, $oldHash);

        $countedHashes = [];
        $retainedHashes = [];
        $deletedHashes = [];
        $this->fileInfoService->method('countByHash')
            ->willReturnCallback(function (string $hash, string $type) use ($counts, &$countedHashes): int {
                $countedHashes[] = [$hash, $type];
                return $counts[$hash] ?? 0;
            });
        $this->fileDuplicateService->method('getOrCreate')
            ->willReturnCallback(function (string $hash, string $type) use (&$retainedHashes) {
                $retainedHashes[] = [$hash, $type];
                return new \OCA\DuplicateFinder\Db\FileDuplicate();
            });
        $this->fileDuplicateService->method('delete')
            ->willReturnCallback(function (string $hash, string $type = 'file_hash') use (&$deletedHashes) {
                $deletedHashes[] = [$hash, $type];
                return null;
            });
        $this->logger->expects($this->never())->method('error');

        $this->listener->handle($event);

        $expectedCounts = array_map(function (string $hash): array {
            return [$hash, 'file_hash'];
        }, array_keys($counts));
        $this->assertEqualsCanonicalizing($expectedCounts, $countedHashes);
        $this->assertEqualsCanonicalizing($retained, $retainedHashes);
        $this->assertEqualsCanonicalizing($deleted, $deletedHashes);
    }

    public static function changedHashProvider(): array
    {
        return [
            'old group becomes a singleton, new group has duplicates' => [
                'oldhash', 'newhash', ['oldhash' => 1, 'newhash' => 2],
                [['newhash', 'file_hash']], [['oldhash', 'file_hash']],
            ],
            'old group retains duplicates, new group is a singleton' => [
                'oldhash', 'newhash', ['oldhash' => 2, 'newhash' => 1],
                [['oldhash', 'file_hash']], [['newhash', 'file_hash']],
            ],
            'both groups retain duplicates' => [
                'oldhash', 'newhash', ['oldhash' => 3, 'newhash' => 3],
                [['oldhash', 'file_hash'], ['newhash', 'file_hash']], [],
            ],
            'old group becomes empty, new group is a singleton' => [
                'oldhash', 'newhash', ['oldhash' => 0, 'newhash' => 1],
                [], [['oldhash', 'file_hash'], ['newhash', 'file_hash']],
            ],
            'first hash creates a duplicate group' => [
                null, 'newhash', ['newhash' => 2], [['newhash', 'file_hash']], [],
            ],
            'first hash is unique' => [
                null, 'newhash', ['newhash' => 1], [], [['newhash', 'file_hash']],
            ],
            'cleared hash leaves a singleton' => [
                'oldhash', null, ['oldhash' => 1], [], [['oldhash', 'file_hash']],
            ],
            'cleared hash leaves duplicates' => [
                'oldhash', null, ['oldhash' => 2], [['oldhash', 'file_hash']], [],
            ],
            'unchanged hash leaves groups alone' => [
                'samehash', 'samehash', [], [], [],
            ],
            'absent hash leaves groups alone' => [
                null, null, [], [], [],
            ],
        ];
    }
}
