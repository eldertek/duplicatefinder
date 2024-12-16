<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCP\Encryption\IManager;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
use OCP\Lock\ILockingProvider;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class FindDuplicates extends Command
{
    /**
     * @var IUserManager The user manager instance.
     */
    private $userManager;

    /**
     * @var IManager The encryption manager instance.
     */
    private $encryptionManager;

    /**
     * @var IDBConnection The database connection instance.
     */
    private $connection;

    /**
     * @var FileInfoService The file info service instance.
     */
    private $fileInfoService;

    /**
     * @var FileDuplicateService The file duplicate service instance.
     */
    private $fileDuplicateService;

    /**
     * @var LoggerInterface The logger instance.
     */
    private $logger;

    /**
     * @var OutputInterface The output interface.
     */
    private $output;

    /**
     * FindDuplicates constructor.
     *
     * @param IUserManager $userManager The user manager instance.
     * @param IManager $encryptionManager The encryption manager instance.
     * @param IDBConnection $connection The database connection instance.
     * @param FileInfoService $fileInfoService The file info service instance.
     * @param FileDuplicateService $fileDuplicateService The file duplicate service instance.
     * @param LoggerInterface $logger The logger instance.
     */
    public function __construct(
        IUserManager $userManager,
        IManager $encryptionManager,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        FileDuplicateService $fileDuplicateService,
        LoggerInterface $logger
    ) {
        parent::__construct('duplicates:find-all');
        $this->userManager = $userManager;
        $this->encryptionManager = $encryptionManager;
        $this->connection = $connection;
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->logger = $logger;
    }

    /**
     * Configure the command.
     */
    protected function configure(): void
    {
        $this
            ->setDescription('Find all duplicate files')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'Scan files of the specified user')
            ->addOption('path', 'p', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'Limit scan to this path, e.g., --path="./Photos"');
    }

    /**
     * Execute the command.
     *
     * @param InputInterface $input The input interface.
     * @param OutputInterface $output The output interface.
     * @return int The command exit code.
     */
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $this->output = $output;

        if ($this->encryptionManager->isEnabled()) {
            $output->writeln('Encryption is enabled. Aborted.');
            return 1;
        }

        $users = (array)$input->getOption('user');
        $paths = (array)$input->getOption('path');

        // Set up signal handler for SIGINT (Ctrl+C)
        pcntl_signal(SIGINT, function () {
            $this->output->writeln("\n<comment>Scan aborted by user.</comment>");
            exit(1);
        });

        return (!empty($users)) ? $this->findDuplicatesForUsers($users, $paths) : $this->findAllDuplicates($paths);
    }

    /**
     * Find duplicates for the specified users.
     *
     * @param array $users The array of user names.
     * @param array $paths The array of paths to limit the scan.
     * @return int The command exit code.
     */
    private function findDuplicatesForUsers(array $users, array $paths): int
    {
        foreach ($users as $user) {
            if (!$this->userManager->userExists($user)) {
                $this->output->writeln('User ' . $user . ' is unknown.');
                return 1;
            }

            try {
                $this->findDuplicates($user, $paths);
            } catch (NotFoundException $e) {
                $this->logger->error('A given path doesn\'t exist', ['app' => Application::ID, 'exception' => $e]);
                $this->output->writeln('<error>The given path doesn\'t exist (' . $e->getMessage() . ').</error>');
            }
        }

        return 0;
    }

    /**
     * Find all duplicates for all users.
     *
     * @param array $paths The array of paths to limit the scan.
     * @return int The command exit code.
     */
    private function findAllDuplicates(array $paths): int
    {
        $this->userManager->callForAllUsers(function (IUser $user) use ($paths): void {
            $this->findDuplicates($user->getUID(), $paths);
        });

        return 0;
    }

    /**
     * Find duplicates for the specified user and paths.
     *
     * @param string $user The user name.
     * @param array $paths The array of paths to limit the scan.
     */
    private function findDuplicates(string $user, array $paths): void
    {
        $callback = function () {
            pcntl_signal_dispatch();
            return false; // Continue scanning
        };

        if (empty($paths)) {
            $this->fileInfoService->scanFiles($user, null, $callback, $this->output);
        } else {
            foreach ($paths as $path) {
                $this->fileInfoService->scanFiles($user, $path, $callback, $this->output);
            }
        }

        CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, $callback, $user);
    }
}