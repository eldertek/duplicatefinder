<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCP\Encryption\IManager;
use OCP\IDBConnection;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class ListDuplicates extends Command
{
    private $userManager;
    private $encryptionManager;
    private $connection;
    private $fileInfoService;
    private $fileDuplicateService;
    private $output;

    public function __construct(
        IUserManager $userManager,
        IManager $encryptionManager,
        IDBConnection $connection,
        FileInfoService $fileInfoService,
        FileDuplicateService $fileDuplicateService
    ) {
        parent::__construct('duplicates:list');

        $this->userManager = $userManager;
        $this->encryptionManager = $encryptionManager;
        $this->connection = $connection;
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
    }

    protected function configure(): void
    {
        $this
            ->setDescription('List all duplicates files')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'List files of the specified user');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $this->output = $output;

        if ($this->encryptionManager->isEnabled()) {
            $output->writeln('Encryption is enabled. Aborted.');
            return 1;
        }

        $users = (array)$input->getOption('user');
        
        return (!empty($users)) ? $this->listDuplicatesForUsers($users) : $this->listAllDuplicates();
    }

    private function listDuplicatesForUsers(array $users): int
    {
        foreach ($users as $user) {
            if (!$this->userManager->userExists($user)) {
                $this->output->writeln('User ' . $user . ' is unknown.');
                return 1;
            }

            CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function() {});
        }

        return 0;
    }

    private function listAllDuplicates(): int
    {
        CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function() {});
        return 0;
    }
}
