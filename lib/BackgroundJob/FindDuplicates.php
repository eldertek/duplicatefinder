<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
use OCP\BackgroundJob\TimedJob;
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
     * @param IUserManager $userManager
     * @param IEventDispatcher $dispatcher
     * @param LoggerInterface $logger
     * @param IDBConnection $connection
     * @param FileInfoService $fileInfoService
     * @param ConfigService $config
     */
    public function __construct(
        IUserManager $userManager,
        IEventDispatcher $dispatcher,
        LoggerInterface $logger,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        ConfigService $config
    ) {
        $this->setInterval($config->getFindJobInterval());
        $this->userManager = $userManager;
        $this->dispatcher = $dispatcher;
        $this->logger = $logger;
        $this->connection = $connection;
        $this->fileInfoService = $fileInfoService;
    }

    /**
     * Execute the job to find duplicates.
     *
     * @param mixed $argument
     * @return void
     * @throws \Exception
     */
    protected function run($argument): void
    {
        $this->userManager->callForAllUsers(function (IUser $user): void {
            $this->fileInfoService->scanFiles($user->getUID());
        });
    }
}
