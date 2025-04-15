<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\ProjectService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Encryption\IManager;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class ListProjectDuplicates extends Command
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
     * @var LoggerInterface The logger instance.
     */
    private $logger;

    /**
     * @var OutputInterface The output interface.
     */
    private $output;

    /**
     * ListProjectDuplicates constructor.
     *
     * @param IUserManager $userManager The user manager instance.
     * @param IManager $encryptionManager The encryption manager instance.
     * @param ProjectService $projectService The project service instance.
     * @param LoggerInterface $logger The logger instance.
     */
    public function __construct(
        IUserManager $userManager,
        IManager $encryptionManager,
        ProjectService $projectService,
        LoggerInterface $logger
    ) {
        parent::__construct('duplicates:list-project');
        $this->userManager = $userManager;
        $this->encryptionManager = $encryptionManager;
        $this->projectService = $projectService;
        $this->logger = $logger;
    }

    /**
     * Configure the command.
     */
    protected function configure(): void
    {
        $this
            ->setDescription('List duplicates for a specific project')
            ->addArgument('project-id', InputArgument::REQUIRED, 'The ID of the project')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED, 'The user who owns the project')
            ->addOption('type', 't', InputOption::VALUE_REQUIRED, 'Type of duplicates to list (all, acknowledged, unacknowledged)', 'all')
            ->addOption('page', null, InputOption::VALUE_REQUIRED, 'Page number', 1)
            ->addOption('limit', null, InputOption::VALUE_REQUIRED, 'Number of duplicates per page', 50);
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
            return Command::FAILURE;
        }

        $projectId = (int)$input->getArgument('project-id');
        $user = $input->getOption('user');
        $type = $input->getOption('type');
        $page = (int)$input->getOption('page');
        $limit = (int)$input->getOption('limit');

        if (empty($user)) {
            $output->writeln('<error>User is required. Please specify a user with --user option.</error>');
            return Command::FAILURE;
        }

        if (!$this->userManager->userExists($user)) {
            $output->writeln('<error>User ' . $user . ' is unknown.</error>');
            return Command::FAILURE;
        }

        if (!in_array($type, ['all', 'acknowledged', 'unacknowledged'])) {
            $output->writeln('<error>Invalid type. Allowed values: all, acknowledged, unacknowledged.</error>');
            return Command::FAILURE;
        }

        return $this->listProjectDuplicates($projectId, $user, $type, $page, $limit);
    }

    /**
     * List duplicates for a specific project.
     *
     * @param int $projectId The ID of the project.
     * @param string $user The user who owns the project.
     * @param string $type The type of duplicates to list.
     * @param int $page The page number.
     * @param int $limit The number of duplicates per page.
     * @return int The command exit code.
     */
    private function listProjectDuplicates(int $projectId, string $user, string $type, int $page, int $limit): int
    {
        try {
            // Set the user context for the project service
            $this->projectService->setUserId($user);
            
            // Get the project to verify it exists and belongs to the user
            try {
                $project = $this->projectService->find($projectId);
                $this->output->writeln('<info>Listing duplicates for project: ' . $project->getName() . ' (ID: ' . $projectId . ')</info>');
            } catch (DoesNotExistException $e) {
                $this->output->writeln('<error>Project with ID ' . $projectId . ' not found for user ' . $user . '.</error>');
                return Command::FAILURE;
            }
            
            // Get duplicates for the project
            $result = $this->projectService->getDuplicates($projectId, $type, $page, $limit);
            $duplicates = $result['entities'];
            $pagination = $result['pagination'];
            
            if (empty($duplicates)) {
                $this->output->writeln('<info>No duplicates found for this project.</info>');
                return Command::SUCCESS;
            }
            
            $this->output->writeln('<info>Found ' . $pagination['totalItems'] . ' duplicates (showing page ' . $pagination['currentPage'] . ' of ' . $pagination['totalPages'] . ')</info>');
            
            // Display duplicates
            foreach ($duplicates as $duplicate) {
                $this->output->writeln('');
                $this->output->writeln('<info>Duplicate ID: ' . $duplicate->getId() . '</info>');
                $this->output->writeln('<info>Hash: ' . $duplicate->getHash() . '</info>');
                $this->output->writeln('<info>Type: ' . $duplicate->getType() . '</info>');
                $this->output->writeln('<info>Status: ' . ($duplicate->isAcknowledged() ? 'Acknowledged' : 'Unacknowledged') . '</info>');
                
                $files = $duplicate->getFiles();
                $this->output->writeln('<info>Files (' . count($files) . '):</info>');
                
                foreach ($files as $index => $file) {
                    $this->output->writeln('  ' . ($index + 1) . '. ' . $file->getPath());
                }
            }
            
            return Command::SUCCESS;
        } catch (\Exception $e) {
            $this->logger->error('Error listing project duplicates: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e
            ]);
            $this->output->writeln('<error>Error listing project duplicates: ' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }
    }
}
