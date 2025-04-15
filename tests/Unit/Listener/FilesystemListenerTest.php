<?php

namespace OCA\DuplicateFinder\Tests\Unit\Listener;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Listener\FilesystemListener;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeRenamedEvent;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\IUser;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FilesystemListenerTest extends TestCase
{
    private $listener;
    private $fileInfoService;
    private $fileDuplicateService;
    private $logger;
    private $config;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->config = $this->createMock(ConfigService::class);

        $this->listener = new FilesystemListener(
            $this->fileInfoService,
            $this->fileDuplicateService,
            $this->logger,
            $this->config
        );
    }

    public function testHandleWithEventsDisabled()
    {
        // Configurer le mock de la configuration pour désactiver les événements
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(true);

        // Créer un événement de test
        $node = $this->createMock(File::class);
        $event = new NodeCreatedEvent($node);

        // Le service FileInfoService ne devrait pas être appelé
        $this->fileInfoService->expects($this->never())
            ->method('save');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleDeleteEvent()
    {
        // Configurer le mock de la configuration
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        // Créer un nœud de fichier et un utilisateur
        $node = $this->createMock(File::class);
        $user = $this->createMock(IUser::class);

        // Configurer le nœud
        $node->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files/test.jpg');
        $node->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);
        $user->expects($this->once())
            ->method('getUID')
            ->willReturn('testuser');

        // Créer un événement de suppression
        $event = new NodeDeletedEvent($node);

        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/test.jpg');
        $fileInfo->setOwner('testuser');
        $fileInfo->setFileHash('testhash');

        // Configurer le service FileInfoService
        $this->fileInfoService->expects($this->once())
            ->method('find')
            ->with('/testuser/files/test.jpg', 'testuser')
            ->willReturn($fileInfo);

        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($fileInfo);

        // Configurer le service FileDuplicateService
        $this->fileInfoService->expects($this->once())
            ->method('countByHash')
            ->with('testhash')
            ->willReturn(1); // Moins de 2 fichiers avec ce hash

        $this->fileDuplicateService->expects($this->once())
            ->method('delete')
            ->with('testhash');

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleRenameEvent()
    {
        // Configurer le mock de la configuration
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        // Créer des nœuds source et cible
        $source = $this->createMock(File::class);
        $target = $this->createMock(File::class);
        $user = $this->createMock(IUser::class);

        // Configurer les nœuds
        $source->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files/old.jpg');
        $source->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);

        $target->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files/new.jpg');
        $target->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);

        $user->expects($this->exactly(2))
            ->method('getUID')
            ->willReturn('testuser');

        // Créer un événement de renommage
        $event = new NodeRenamedEvent($source, $target);

        // Créer un FileInfo de test
        $fileInfo = new FileInfo();
        $fileInfo->setId(1);
        $fileInfo->setPath('/testuser/files/old.jpg');
        $fileInfo->setOwner('testuser');

        // Configurer le service FileInfoService
        $this->fileInfoService->expects($this->once())
            ->method('find')
            ->with('/testuser/files/old.jpg', 'testuser')
            ->willReturn($fileInfo);

        $this->fileInfoService->expects($this->once())
            ->method('update')
            ->with($this->callback(function ($updatedFileInfo) {
                return $updatedFileInfo->getPath() === '/testuser/files/new.jpg' &&
                       $updatedFileInfo->getOwner() === 'testuser';
            }));

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleCreateEvent()
    {
        // Configurer le mock de la configuration
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        // Créer un nœud de fichier et un utilisateur
        $node = $this->createMock(File::class);
        $user = $this->createMock(IUser::class);

        // Configurer le nœud
        $node->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files/new.jpg');
        $node->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);
        $user->expects($this->once())
            ->method('getUID')
            ->willReturn('testuser');

        // Créer un événement de création
        $event = new NodeCreatedEvent($node);

        // Configurer le service FileInfoService
        $this->fileInfoService->expects($this->once())
            ->method('save')
            ->with('/testuser/files/new.jpg', 'testuser')
            ->willReturn(new FileInfo());

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleCreateEventWithIgnoreException()
    {
        // Configurer le mock de la configuration
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        // Créer un nœud de fichier et un utilisateur
        $node = $this->createMock(File::class);
        $user = $this->createMock(IUser::class);

        // Configurer le nœud
        $node->expects($this->once())
            ->method('getPath')
            ->willReturn('/testuser/files/ignored.jpg');
        $node->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);
        $user->expects($this->once())
            ->method('getUID')
            ->willReturn('testuser');

        // Créer un événement de création
        $event = new NodeCreatedEvent($node);

        // Créer un FileInfo pour l'exception
        $fileInfo = new FileInfo();
        $fileInfo->setPath('/testuser/files/ignored.jpg');
        $fileInfo->setOwner('testuser');

        // Configurer le service FileInfoService pour lancer une exception
        $this->fileInfoService->expects($this->once())
            ->method('save')
            ->with('/testuser/files/ignored.jpg', 'testuser')
            ->willThrowException(new ForcedToIgnoreFileException($fileInfo, 'test_setting'));

        // Configurer le logger
        $this->logger->expects($this->once())
            ->method('info')
            ->with($this->stringContains('Ignored File Info'), $this->anything());

        // Appeler la méthode handle
        $this->listener->handle($event);
    }

    public function testHandleCreateEventWithGenericException()
    {
        // Configurer le mock de la configuration
        $this->config->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        // Créer un nœud de fichier et un utilisateur
        $node = $this->createMock(File::class);
        $user = $this->createMock(IUser::class);

        // Configurer le nœud
        $node->expects($this->atLeastOnce())
            ->method('getPath')
            ->willReturn('/testuser/files/error.jpg');
        $node->expects($this->once())
            ->method('getOwner')
            ->willReturn($user);
        $user->expects($this->once())
            ->method('getUID')
            ->willReturn('testuser');

        // Créer un événement de création
        $event = new NodeCreatedEvent($node);

        // Configurer le service FileInfoService pour lancer une exception
        $this->fileInfoService->expects($this->once())
            ->method('save')
            ->with('/testuser/files/error.jpg', 'testuser')
            ->willThrowException(new \Exception('Generic error'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with($this->stringContains('Error saving file info'), $this->anything());

        // Appeler la méthode handle
        $this->listener->handle($event);
    }
}
