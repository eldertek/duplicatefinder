<?php

namespace OCA\DuplicateFinder\BackgroundJob;

use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\ScanStatusService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\BackgroundJob\TimedJob;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
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

    /** @var ?ScanStatusService */
    private $scanStatusService;

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
     * @param ?ScanStatusService $scanStatusService Optional scan status tracker.
     */
    public function __construct(
        IUserManager $userManager,
        IEventDispatcher $dispatcher,
        LoggerInterface $logger,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        ConfigService $config,
        ITimeFactory $timeFactory,
        ?ScanStatusService $scanStatusService = null
    ) {
        $this->timeFactory = $timeFactory;

        parent::__construct($timeFactory);

        $this->setInterval($config->getFindJobInterval());

        $this->userManager = $userManager;
        $this->dispatcher = $dispatcher;
        $this->logger = $logger;
        $this->connection = $connection;
        $this->fileInfoService = $fileInfoService;
        $this->scanStatusService = $scanStatusService;
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
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }
        if ($this->scanStatusService !== null) {
            $this->scanStatusService->setBackgroundMode(true);
            $this->scanStatusService->finishGlobalScan();
        }
        try {
            // Call the scanFiles method for all users using the userManager.
            $this->userManager->callForAllUsers(function (IUser $user): void {
                try {
                    $this->fileInfoService->scanFiles($user->getUID());
                } catch (\Throwable $e) {
                    $this->logger->error('Error scanning files in background job for user ' . $user->getUID(), [
                        'exception' => $e,
                    ]);
                }
            });
        } finally {
            if ($this->scanStatusService !== null) {
                $this->scanStatusService->setBackgroundMode(false);
                $this->scanStatusService->finishGlobalScan();
            }
        }
    }
}
