<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCP\Encryption\IManager;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\IUser;
use OCP\IUserManager;
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
     * @var ProjectService The project service instance.
     */
    private $projectService;

    /**
     * @var FileInfoService The file info service instance.
     */
    private $fileInfoService;

    /**
     * @var FileDuplicateService The file duplicate service instance.
     */
    private $fileDuplicateService;

    /**
     * @var ExcludedFolderService The excluded folder service instance.
     */
    private $excludedFolderService;

    /**
     * @var OriginFolderService The origin folder service instance.
     */
    private $originFolderService;

    /**
     * @var LoggerInterface The logger instance.
     */
    private $logger;

    /**
     * @var OutputInterface The output interface.
     */
    private $output;

    /**
     * @var IDBConnection La connexion à la base de données.
     */
    private $connection;

    /**
     * FindDuplicates constructor.
     *
     * @param IUserManager $userManager The user manager instance.
     * @param IManager $encryptionManager The encryption manager instance.
     * @param IDBConnection $connection The database connection instance.
     * @param FileInfoService $fileInfoService The file info service instance.
     * @param FileDuplicateService $fileDuplicateService The file duplicate service instance.
     * @param ExcludedFolderService $excludedFolderService The excluded folder service instance.
     * @param OriginFolderService $originFolderService The origin folder service instance.
     * @param LoggerInterface $logger The logger instance.
     */
    public function __construct(
        IUserManager $userManager,
        IManager $encryptionManager,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        FileDuplicateService $fileDuplicateService,
        ExcludedFolderService $excludedFolderService,
        OriginFolderService $originFolderService,
        LoggerInterface $logger
    ) {
        parent::__construct('duplicates:find-all');
        $this->userManager = $userManager;
        $this->encryptionManager = $encryptionManager;
        $this->connection = $connection;
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->excludedFolderService = $excludedFolderService;
        $this->originFolderService = $originFolderService;
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
            ->addOption('path', 'p', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'Limit scan to this path, e.g., --path="./Photos"')
            ->addOption('project', null, InputOption::VALUE_REQUIRED, 'Scan files for a specific project ID (requires --user option)');
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
        $projectId = $input->getOption('project');

        // Check if project ID is specified but no user is specified
        if ($projectId !== null && empty($users)) {
            $output->writeln('<error>When using --project option, you must specify a user with --user option.</error>');
            return 1;
        }

        // Set up signal handler for SIGINT (Ctrl+C)
        pcntl_signal(SIGINT, function () {
            $this->output->writeln("\n<comment>Scan aborted by user.</comment>");
            exit(1);
        });

        // If project ID is specified, scan only that project
        if ($projectId !== null) {
            return $this->findDuplicatesForProject((int)$projectId, $users[0]);
        }

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
     * Find duplicates for a specific project.
     *
     * @param int $projectId The ID of the project to scan.
     * @param string $user The user who owns the project.
     * @return int The command exit code.
     */
    private function findDuplicatesForProject(int $projectId, string $user): int
    {
        if (!$this->userManager->userExists($user)) {
            $this->output->writeln('<e>User ' . $user . ' is unknown.</e>');
            return 1;
        }

        try {
            // We can't create a ProjectService directly here because it requires more dependencies
            // than we have access to. Instead, we'll use the ScanProject command directly.
            $scanProjectCommand = new ScanProject(
                $this->userManager,
                $this->encryptionManager,
                $this->projectService,
                $this->logger
            );

            $this->output->writeln('<info>Scanning project ID ' . $projectId . ' for user ' . $user . '...</info>');

            // Execute the scan project command
            $result = $scanProjectCommand->run(
                new \Symfony\Component\Console\Input\ArrayInput([
                    'project-id' => $projectId,
                    '--user' => $user
                ]),
                $this->output
            );

            if ($result === 0) {
                $this->output->writeln('<info>Project scan completed successfully.</info>');

                // Now list the duplicates found in the project
                $listProjectCommand = new ListProjectDuplicates(
                    $this->userManager,
                    $this->encryptionManager,
                    $this->projectService,
                    $this->logger
                );

                $this->output->writeln('<info>Listing duplicates found in the project:</info>');

                $listProjectCommand->run(
                    new \Symfony\Component\Console\Input\ArrayInput([
                        'project-id' => $projectId,
                        '--user' => $user
                    ]),
                    $this->output
                );
            }

            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Error scanning project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e
            ]);
            $this->output->writeln('<e>Error scanning project: ' . $e->getMessage() . '</e>');
            return 1;
        }
    }

    /**
     * Find duplicates for the specified user and paths.
     *
     * @param string $user The user name.
     * @param array $paths The array of paths to limit the scan.
     */
    private function findDuplicates(string $user, array $paths): void
    {
        // Set the user context for required services
        $this->fileDuplicateService->setCurrentUserId($user);
        $this->excludedFolderService->setUserId($user);
        $this->originFolderService->setUserId($user);

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