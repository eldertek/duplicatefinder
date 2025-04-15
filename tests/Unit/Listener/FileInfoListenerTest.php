<?php

namespace OCA\DuplicateFinder\Tests\Unit\Listener;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\NewFileInfoEvent;
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

    public function testHandleNewFileInfoEventWithNoOtherFilesOfSameSize()
    {
        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setSize(1024);

        // Créer un événement NewFileInfoEvent
        $event = new NewFileInfoEvent($fileInfo, 'testuser');

        // Configurer le logger
        $this->logger->expects($this->exactly(2))
            ->method('debug')
            ->withConsecutive(
                [$this->equalTo('Handling file info event'), $this->anything()],
                [$this->equalTo('No other files with same size, skipping hash calculation'), $this->anything()]
            );

        // Configurer le service FileInfoService pour indiquer qu'il n'y a pas d'autres fichiers de même taille
        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->with(1024)
            ->willReturn(1);

        // Le service ne devrait pas chercher les fichiers par taille
        $this->fileInfoService->expects($this->never())
            ->method('findBySize');

        // Mais il devrait quand même calculer le hash pour ce fichier
        $this->fileInfoService->expects($this->once())
            ->method('calculateHashes')
            ->with($fileInfo, 'testuser', false);

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleNewFileInfoEventWithMultipleFilesOfSameSize()
    {
        // Créer un FileInfo de test
        $fileInfo1 = new FileInfo();
        $fileInfo1->setId(1);
        $fileInfo1->setPath('/testuser/files/test1.jpg');
        $fileInfo1->setOwner('testuser');
        $fileInfo1->setSize(1024);

        $fileInfo2 = new FileInfo();
        $fileInfo2->setId(2);
        $fileInfo2->setPath('/testuser/files/test2.jpg');
        $fileInfo2->setOwner('testuser');
        $fileInfo2->setSize(1024);

        // Créer un événement NewFileInfoEvent
        $event = new NewFileInfoEvent($fileInfo1, 'testuser');

        // Configurer le logger
        $this->logger->expects($this->exactly(3))
            ->method('debug')
            ->withConsecutive(
                [$this->equalTo('Handling file info event'), $this->anything()],
                [$this->equalTo('Found files with same size'), $this->anything()],
                [$this->equalTo('Multiple files with same size found, calculating hashes'), $this->anything()]
            );

        // Configurer le service FileInfoService pour indiquer qu'il y a plusieurs fichiers de même taille
        $this->fileInfoService->expects($this->once())
            ->method('countBySize')
            ->with(1024)
            ->willReturn(2);

        // Le service devrait chercher les fichiers par taille
        $this->fileInfoService->expects($this->once())
            ->method('findBySize')
            ->with(1024)
            ->willReturn([$fileInfo1, $fileInfo2]);

        // Il devrait calculer les hashes pour tous les fichiers de même taille
        $this->fileInfoService->expects($this->exactly(2))
            ->method('calculateHashes')
            ->withConsecutive(
                [$fileInfo1, 'testuser'],
                [$fileInfo2, 'testuser']
            );

        // Appeler la méthode handle
        $this->listener->handle($event);
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

        // Configurer le logger
        $this->logger->expects($this->once())
            ->method('debug')
            ->with('Handling file info event', $this->anything());

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
}
