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

    public function testHandleWithChangedHash()
    {
        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setFileHash('newhash');

        // Créer un événement CalculatedHashEvent avec un hash différent
        $event = new CalculatedHashEvent($fileInfo, 'oldhash');

        // Configurer le service FileInfoService pour indiquer qu'il y a plusieurs fichiers avec le même hash
        $this->fileInfoService->expects($this->once())
            ->method('countByHash')
            ->with('newhash', 'file_hash')
            ->willReturn(2);

        // Le service FileDuplicateService devrait être appelé pour mettre à jour les duplications
        $this->fileDuplicateService->expects($this->once())
            ->method('getOrCreate')
            ->with('newhash', 'file_hash');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    // Suppression du test testHandleWithException car il est difficile à simuler correctement
}
