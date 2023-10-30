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
 
     /**
      * Constructs a new instance of the Application class.
      */
     public function __construct()
     {
         parent::__construct(self::ID);
     }
 
     /**
      * Registers event listeners for file system events.
      *
      * @param IRegistrationContext $context The registration context.
      */
     public function register(IRegistrationContext $context): void
     {
         $eventListenerPairs = [
             NodeDeletedEvent::class => FilesystemListener::class,
             NodeRenamedEvent::class => FilesystemListener::class,
             NodeCopiedEvent::class => FilesystemListener::class,
             NodeCreatedEvent::class => FilesystemListener::class,
             NodeWrittenEvent::class => FilesystemListener::class,
             NodeTouchedEvent::class => FilesystemListener::class,
             NewFileInfoEvent::class => FileInfoListener::class,
             UpdatedFileInfoEvent::class => FileInfoListener::class,
             CalculatedHashEvent::class => NewHashListener::class,
         ];
 
         foreach ($eventListenerPairs as $event => $listener) {
             $context->registerEventListener($event, $listener);
         }
     }
 
     /**
      * Boots the application.
      *
      * @param IBootContext $context The boot context.
      */
     public function boot(IBootContext $context): void
     {
         // Dummy method required by IBootstrap
     }
 }
 