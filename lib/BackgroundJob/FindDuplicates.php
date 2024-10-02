<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\IUser;
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

    /** @var ITimeFactory */
    private $timeFactory;

    /**
     * FindDuplicates constructor.
     *
     * @param IUserManager $userManager The user manager instance.
     * @param IEventDispatcher $dispatcher The event dispatcher instance.
     * @param LoggerInterface $logger The logger instance.
     * @param IDBConnection $connection The database connection instance.
     * @param FileInfoService $fileInfoService The file info service instance.
     * @param ConfigService $config The config service instance.
     * @param ITimeFactory $timeFactory The time factory instance.
     */
    public function __construct(
        IUserManager $userManager,
        IEventDispatcher $dispatcher,
        LoggerInterface $logger,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        ConfigService $config,
        ITimeFactory $timeFactory
    ) {
        $this->timeFactory = $timeFactory;

        parent::__construct($timeFactory);

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
     * @param mixed $argument The argument passed to the job.
     * @return void
     * @throws \Exception
     */
    protected function run($argument): void
    {
        // Fetch all users in a single query
        $users = $this->userManager->search('');

        // Process users in batches
        $batchSize = 100;
        $batches = array_chunk($users, $batchSize);

        foreach ($batches as $batch) {
            foreach ($batch as $user) {
                $this->fileInfoService->scanFiles($user->getUID());
            }
        }
    }
}
