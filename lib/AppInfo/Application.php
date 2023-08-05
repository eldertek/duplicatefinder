<?php
namespace OCA\DuplicateFindx\AppInfo;

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
use OCA\DuplicateFindx\Event\CalculatedHashEvent;
use OCA\DuplicateFindx\Event\NewFileInfoEvent;
use OCA\DuplicateFindx\Event\UpdatedFileInfoEvent;
use OCA\DuplicateFindx\Listener\FilesytemListener;
use OCA\DuplicateFindx\Listener\NewHashListener;
use OCA\DuplicateFindx\Listener\FileInfoListener;

class Application extends App implements IBootstrap
{
    public const ID = 'duplicatefindx';

    public function __construct()
    {
        parent::__construct(self::ID);
    }

    public function register(IRegistrationContext $context): void
    {
        $context->registerEventListener(NodeDeletedEvent::class, FilesytemListener::class);
        $context->registerEventListener(NodeRenamedEvent::class, FilesytemListener::class);
        $context->registerEventListener(NodeCopiedEvent::class, FilesytemListener::class);
        $context->registerEventListener(NodeCreatedEvent::class, FilesytemListener::class);
        $context->registerEventListener(NodeWrittenEvent::class, FilesytemListener::class);
        $context->registerEventListener(NodeTouchedEvent::class, FilesytemListener::class);
        $context->registerEventListener(NewFileInfoEvent::class, FileInfoListener::class);
        $context->registerEventListener(UpdatedFileInfoEvent::class, FileInfoListener::class);
        $context->registerEventListener(CalculatedHashEvent::class, NewHashListener::class);
    }

    public function boot(IBootContext $context): void
    {
        //Dummy Required by IBootstrap
    }
}
