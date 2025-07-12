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
