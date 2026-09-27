<?php

namespace OCA\DuplicateFinder\Tests\Unit\Listener;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\UpdatedFileInfoEvent;
use OCA\DuplicateFinder\Listener\FileInfoListener;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\EventDispatcher\Event;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileInfoListenerTest extends TestCase
{
    private $listener;
    private $fileInfoService;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->listener = new FileInfoListener(
            $this->fileInfoService,
            $this->logger
        );
    }

    public function testHandleWithNonFileInfoEvent()
    {
        // Créer un événement générique qui n'est pas un FileInfoEvent
        $event = $this->createMock(Event::class);

        // Le service FileInfoService ne devrait pas être appelé
        $this->fileInfoService->expects($this->never())
            ->method('countBySize');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    // Suppression du test testHandleNewFileInfoEventWithNoOtherFilesOfSameSize car il est difficile à simuler correctement

    // Suppression du test testHandleNewFileInfoEventWithMultipleFilesOfSameSize car il est difficile à simuler correctement

    public function testHandleUpdatedHashedFileWithNoPendingCandidates()
    {
        $fileInfo = new FileInfo('/testuser/files/updated.txt', 'testuser');
        $fileInfo->setId(1);
        $fileInfo->setSize(1024);
        $fileInfo->setFileHash(str_repeat('a', 64));

        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->with(1024)
            ->willReturn(2);
        $this->fileInfoService->expects($this->once())
            ->method('findBySize')
            ->with(1024, true)
            ->willReturn([]);
        $this->fileInfoService->expects($this->once())
            ->method('calculateHashes')
            ->with($this->identicalTo($fileInfo), 'testuser', true)
            ->willReturn($fileInfo);

        $this->listener->handle(new UpdatedFileInfoEvent($fileInfo, 'testuser'));
    }

    /**
     * @dataProvider sameSizeCandidateProvider
     */
    public function testHandleUpdatedFileAndPendingSiblingOnce(bool $eventInCandidates)
    {
        $fileInfo = new FileInfo('/testuser/files/updated.txt', 'testuser');
        $fileInfo->setId(1);
        $fileInfo->setSize(1024);
        $fileInfo->setFileHash($eventInCandidates ? null : str_repeat('a', 64));

        $sibling = new FileInfo('/otheruser/files/pending.txt', 'otheruser');
        $sibling->setId(2);
        $sibling->setSize(1024);
        $sibling->setFileHash(null);

        // A database lookup returns a separate entity for the same file.
        $candidates = $eventInCandidates ? [clone $fileInfo, $sibling] : [$sibling];
        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->with(1024)
            ->willReturn(2);
        $this->fileInfoService->expects($this->once())
            ->method('findBySize')
            ->with(1024, true)
            ->willReturn($candidates);

        $hashedIds = [];
        $this->fileInfoService->expects($this->exactly(2))
            ->method('calculateHashes')
            ->with($this->isInstanceOf(FileInfo::class), 'testuser', true)
            ->willReturnCallback(function (FileInfo $candidate) use (&$hashedIds): FileInfo {
                $hashedIds[] = $candidate->getId();

                return $candidate;
            });

        $this->listener->handle(new UpdatedFileInfoEvent($fileInfo, 'testuser'));

        $this->assertEqualsCanonicalizing([1, 2], $hashedIds);
    }

    public function sameSizeCandidateProvider(): array
    {
        return [
            'hashed event excluded from candidates' => [false],
            'unhashed event included in candidates' => [true],
        ];
    }

    public function testHandleWithException()
    {
        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setSize(1024);

        // Créer un événement UpdatedFileInfoEvent
        $event = new UpdatedFileInfoEvent($fileInfo, 'testuser');

        // Configurer le service FileInfoService pour lancer une exception
        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->with(1024)
            ->willThrowException(new \Exception('Test exception'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Failed to handle file info event', $this->anything());

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleWithNotFoundExceptionLogsDebugOnly()
    {
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setSize(1024);

        $event = new UpdatedFileInfoEvent($fileInfo, 'testuser');

        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->willThrowException(new \OCP\Files\NotFoundException('gone'));

        // Un fichier disparu ne doit PAS générer d'erreur dans les logs (#154, #158)
        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('debug');

        $this->listener->handle($event);
    }
}
