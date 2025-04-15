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
     * @param ProjectService $projectService The project service instance.
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
        ProjectService $projectService,
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
        $this->projectService = $projectService;
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
            // Set the user context for the project service
            $this->projectService->setUserId($user);

            // Get the project to verify it exists and belongs to the user
            try {
                $project = $this->projectService->find($projectId);
                $this->output->writeln('<info>Found project: ' . $project->getName() . '</info>');

                // Afficher les dossiers du projet
                $folders = $project->getFolders();
                $this->output->writeln('<info>Project folders:</info>');
                foreach ($folders as $folder) {
                    $this->output->writeln('  - ' . $folder);
                }
            } catch (\OCP\AppFramework\Db\DoesNotExistException $e) {
                $this->output->writeln('<e>Project with ID ' . $projectId . ' not found for user ' . $user . '.</e>');
                return 1;
            }

            // Scan the project
            $this->output->writeln('<info>Scanning project folders...</info>');
            $this->projectService->scan($projectId);

            $this->output->writeln('<info>Scan completed successfully for project: ' . $project->getName() . '</info>');

            // Get duplicates for the project
            $this->output->writeln('<info>Listing duplicates found in the project:</info>');
            $result = $this->projectService->getDuplicates($projectId, 'all', 1, 1000);
            $duplicates = $result['entities'];
            $pagination = $result['pagination'];

            if (empty($duplicates)) {
                $this->output->writeln('<info>No duplicates found for this project.</info>');
            } else {
                $this->output->writeln('<info>Found ' . $pagination['totalItems'] . ' duplicates</info>');

                // Display duplicates
                foreach ($duplicates as $index => $duplicate) {
                    $this->output->writeln('');
                    $this->output->writeln('<info>Duplicate #' . ($index + 1) . '</info>');
                    $this->output->writeln('<comment>Hash:</comment> ' . $duplicate->getHash());
                    $this->output->writeln('<comment>Status:</comment> ' . ($duplicate->isAcknowledged() ? 'Acknowledged' : 'Unacknowledged'));

                    $files = $duplicate->getFiles();
                    $this->output->writeln('<comment>Files (' . count($files) . '):</comment>');

                    foreach ($files as $fileIndex => $file) {
                        $path = $file->getPath();
                        $filename = basename($path);
                        $directory = dirname($path);

                        $this->output->writeln('  ' . ($fileIndex + 1) . '. <info>' . $filename . '</info>');
                        $this->output->writeln('     Path: ' . $directory);
                    }
                }
            }

            return 0;
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