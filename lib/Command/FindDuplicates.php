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
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class FindDuplicates extends Command
{
    private $userManager;
    private $encryptionManager;
    private $connection;
    private $fileInfoService;
    private $fileDuplicateService;
    private $logger;
    private $output;

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

    protected function configure(): void
    {
        $this
            ->setDescription('Find all duplicates files')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'Scan files of the specified user')
            ->addOption('path', 'p', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'Limit scan to this path, e.g., --path="./Photos"');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $this->output = $output;

        if ($this->encryptionManager->isEnabled()) {
            $output->writeln('Encryption is enabled. Aborted.');
            return 1;
        }

        $users = (array)$input->getOption('user');
        $paths = (array)$input->getOption('path');

        return (!empty($users)) ? $this->findDuplicatesForUsers($users, $paths) : $this->findAllDuplicates($paths);
    }

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

    private function findAllDuplicates(array $paths): int
    {
        $this->userManager->callForAllUsers(function (IUser $user) use ($paths): void {
            $this->findDuplicates($user->getUID(), $paths);
        });

        return 0;
    }

    private function findDuplicates(string $user, array $paths): void
    {
        $callback = function () {
            // Handle interruption if needed
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
