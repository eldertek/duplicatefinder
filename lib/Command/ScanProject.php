<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Encryption\IManager;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class ScanProject extends Command
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
     * @var InputInterface The input interface.
     */
    private $input;

    /**
     * ScanProject constructor.
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
        parent::__construct('duplicates:scan-project');
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
            ->setDescription('Scan a specific project for duplicates')
            ->addArgument('project-id', InputArgument::REQUIRED, 'The ID of the project to scan')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED, 'The user who owns the project')
            ->addOption('show-duplicates', null, InputOption::VALUE_NONE, 'Show duplicates after scanning')
            ->addOption('verbose', 'v', InputOption::VALUE_NONE, 'Show more detailed output');
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
        $this->input = $input;

        if ($this->encryptionManager->isEnabled()) {
            $output->writeln('Encryption is enabled. Aborted.');
            return Command::FAILURE;
        }

        $projectId = (int)$input->getArgument('project-id');
        $user = $input->getOption('user');

        if (empty($user)) {
            $output->writeln('<error>User is required. Please specify a user with --user option.</error>');
            return Command::FAILURE;
        }

        if (!$this->userManager->userExists($user)) {
            $output->writeln('<error>User ' . $user . ' is unknown.</error>');
            return Command::FAILURE;
        }

        return $this->scanProject($projectId, $user);
    }

    /**
     * Scan a specific project for duplicates.
     *
     * @param int $projectId The ID of the project to scan.
     * @param string $user The user who owns the project.
     * @return int The command exit code.
     */
    private function scanProject(int $projectId, string $user): int
    {
        try {
            $this->output->writeln('<info>Starting scan for project ID ' . $projectId . ' owned by user ' . $user . '...</info>');

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
            } catch (DoesNotExistException $e) {
                $this->output->writeln('<error>Project with ID ' . $projectId . ' not found for user ' . $user . '.</error>');
                return Command::FAILURE;
            }

            // Scan the project
            $this->output->writeln('<info>Scanning project folders...</info>');

            // Si mode verbose, afficher plus de détails
            $isVerbose = $this->input->getOption('verbose');

            if ($isVerbose) {
                $this->output->writeln('<info>Running in verbose mode</info>');
                $this->output->writeln('<info>Detailed project information:</info>');
                $this->output->writeln('  - User ID: ' . $user);
                $this->output->writeln('  - Project ID: ' . $projectId);
                $this->output->writeln('  - Project Name: ' . $project->getName());
                $this->output->writeln('  - Folder Count: ' . count($folders));

                // Activer le mode debug pour voir plus de détails
                $this->logger->debug('Scanning project folders with debug logs enabled', [
                    'app' => Application::ID,
                    'projectId' => $projectId,
                    'folders' => $folders
                ]);
            }

            $this->projectService->scan($projectId);

            $this->output->writeln('<info>Scan completed successfully for project: ' . $project->getName() . '</info>');

            // Affichage des doublons toujours après le scan
            $this->output->writeln('<info>Listing duplicates found in the project:</info>');

            // Get duplicates for the project
            $result = $this->projectService->getDuplicates($projectId, 'all', 1, 1000);
            $duplicates = $result['entities'];
            $pagination = $result['pagination'];

            if (empty($duplicates)) {
                $this->output->writeln('<info>No duplicates found for this project.</info>');

                // Si mode verbose, afficher plus de détails sur pourquoi aucun doublon n'a été trouvé
                if ($isVerbose) {
                    $this->output->writeln('<info>Checking why no duplicates were found:</info>');

                    // Récupérer tous les doublons de l'utilisateur
                    $allDuplicates = $this->duplicateMapper->findDuplicatesWithFiles($user);
                    $this->output->writeln('  - Total duplicates for user: ' . count($allDuplicates));

                    if (!empty($allDuplicates)) {
                        $this->output->writeln('<info>Checking first few duplicates:</info>');
                        $count = 0;
                        foreach ($allDuplicates as $dup) {
                            if ($count >= 5) break; // Limiter à 5 doublons pour ne pas surcharger la sortie

                            $hash = $dup['hash'];
                            $this->output->writeln('  - Duplicate Hash: ' . $hash);

                            // Récupérer les fichiers pour ce hash
                            $filePaths = $this->duplicateMapper->findFilesByHash($hash, $user);
                            $this->output->writeln('    Files (' . count($filePaths) . '):');

                            foreach ($filePaths as $path) {
                                $this->output->writeln('      ' . $path);

                                // Vérifier si ce fichier est dans un des dossiers du projet
                                $inProject = false;
                                foreach ($folders as $folder) {
                                    if (strpos($path, $folder) === 0) {
                                        $inProject = true;
                                        break;
                                    }
                                }

                                $this->output->writeln('        In project: ' . ($inProject ? 'Yes' : 'No'));
                            }

                            $count++;
                        }
                    }
                }
            } else {
                $this->output->writeln('<info>Found ' . $pagination['totalItems'] . ' duplicates</info>');

                // Display duplicates
                foreach ($duplicates as $duplicate) {
                    $this->output->writeln('');
                    $this->output->writeln($duplicate->getHash() . '(' . $duplicate->getType() . ')');

                    $files = $duplicate->getFiles();
                    foreach ($files as $file) {
                        $this->output->writeln('     ' . $file->getPath());
                    }
                }
            }

            return Command::SUCCESS;
        } catch (\Exception $e) {
            $this->logger->error('Error scanning project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e
            ]);
            $this->output->writeln('<error>Error scanning project: ' . $e->getMessage() . '</error>');
            return Command::FAILURE;
        }
    }
}
