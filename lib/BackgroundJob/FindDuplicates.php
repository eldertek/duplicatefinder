<?php

namespace OCA\DuplicateFinder\BackgroundJob;

 use OCA\DuplicateFinder\Service\ConfigService;
 use OCA\DuplicateFinder\Service\FileInfoService;
 use OCP\EventDispatcher\IEventDispatcher;
 use OCP\IDBConnection;
 use OCP\IUser;
 use OCP\IUserManager;
 use OC\BackgroundJob\TimedJob;
 use Psr\Log\LoggerInterface;
 
 class FindDuplicates extends TimedJob
 {
    /** @var IUserManager */
    private $userManager;

    /** @var IEventDispatcher */
    private $dispatcher;

    /** @var LoggerInterface */
    private $logger;

    /** @var IDBConnection */
    protected $connection;

    /** @var FileInfoService */
    private $fileInfoService;

     /**
      * FindDuplicates constructor.
      *
      * @param IUserManager $userManager The user manager instance.
      * @param IEventDispatcher $dispatcher The event dispatcher instance.
      * @param LoggerInterface $logger The logger instance.
      * @param IDBConnection $connection The database connection instance.
      * @param FileInfoService $fileInfoService The file info service instance.
      * @param ConfigService $config The config service instance.
      */
     public function __construct(
         IUserManager $userManager,
         IEventDispatcher $dispatcher,
         LoggerInterface $logger,
         IDBConnection $connection,
         FileInfoService $fileInfoService,
         ConfigService $config
     ) {
         // Set the interval for the job based on the config.
         $this->setInterval($config->getFindJobInterval());
 
         // Assign the dependencies to the class properties.
         $this->userManager = $userManager;
         $this->dispatcher = $dispatcher;
         $this->logger = $logger;
         $this->connection = $connection;
         $this->fileInfoService = $fileInfoService;
     }
 
     /**
      * Execute the job to find duplicates.
      *
      * @param mixed $argument The argument passed to the job.
      * @return void
      * @throws \Exception
      */
     protected function run($argument): void
     {
         // Call the scanFiles method for all users using the userManager.
         $this->userManager->callForAllUsers(function (IUser $user): void {
             $this->fileInfoService->scanFiles($user->getUID());
         });
     }
 }
 