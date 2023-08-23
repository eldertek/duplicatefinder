<?php
namespace OCA\DuplicateFinder\AppInfo;

use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\Files\Events\Node\NodeDeletedEvent;
use OCP\Files\Events\Node\NodeRenamedEvent;
use OCP\Files\Events\Node\NodeCopiedEvent;
use OCP\Files\Events\Node\NodeCreatedEvent;
use OCP\Files\Events\Node\NodeWrittenEvent;
use OCP\Files\Events\Node\NodeTouchedEvent;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Event\NewFileInfoEvent;
use OCA\DuplicateFinder\Event\UpdatedFileInfoEvent;
use OCA\DuplicateFinder\Listener\FilesystemListener;
use OCA\DuplicateFinder\Listener\NewHashListener;
use OCA\DuplicateFinder\Listener\FileInfoListener;

class Application extends App implements IBootstrap
{
    public const ID = 'duplicatefinder';

    public function __construct()
    {
        parent::__construct(self::ID);
    }

    public function register(IRegistrationContext $context): void
    {
        $context->registerEventListener(NodeDeletedEvent::class, FilesystemListener::class);
        $context->registerEventListener(NodeRenamedEvent::class, FilesystemListener::class);
        $context->registerEventListener(NodeCopiedEvent::class, FilesystemListener::class);
        $context->registerEventListener(NodeCreatedEvent::class, FilesystemListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FilesystemListener::class);
        $context->registerEventListener(NodeTouchedEvent::class, FilesystemListener::class);
        $context->registerEventListener(NewFileInfoEvent::class, FileInfoListener::class);
        $context->registerEventListener(UpdatedFileInfoEvent::class, FileInfoListener::class);
        $context->registerEventListener(CalculatedHashEvent::class, NewHashListener::class);
    }

    public function boot(IBootContext $context): void
    {
        //Dummy Required by IBootstrap
    }
}
