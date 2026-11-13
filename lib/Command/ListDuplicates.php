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
     * @var OutputInterface The output interface.
     */
    private $output;

    /**
     * ListDuplicates constructor.
     *
     * @param IUserManager $userManager The user manager instance.
     * @param IManager $encryptionManager The encryption manager instance.
     * @param IDBConnection $connection The database connection instance.
     * @param FileInfoService $fileInfoService The file info service instance.
     * @param FileDuplicateService $fileDuplicateService The file duplicate service instance.
     */
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

    /**
     * Configure the command.
     */
    protected function configure(): void
    {
        $this
            ->setDescription('List all duplicate files')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'List files of the specified user')
            ->addOption('sort', 's', InputOption::VALUE_REQUIRED, 'Sort duplicate groups (default, size-desc, size-asc)', 'default')
            ->addOption('min-size', 'm', InputOption::VALUE_REQUIRED, 'Only files of at least this size, in bytes or with a unit (500K, 10M, 1G)', '0');
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

        $sortMap = [
            'default' => [['hash'], ['type']],
            'size-desc' => [['size', 'DESC']],
            'size-asc' => [['size', 'ASC']],
        ];
        $sortBy = $input->hasOption('sort') ? strtolower((string)$input->getOption('sort')) : 'default';
        if (!isset($sortMap[$sortBy])) {
            $output->writeln('<error>Unknown sort order "' . $sortBy . '", use default, size-desc or size-asc.</error>');

            return 1;
        }

        $minSizeRaw = $input->hasOption('min-size') ? (string)$input->getOption('min-size') : '0';
        $minSize = CMDUtils::parseSize($minSizeRaw);
        if ($minSize === null) {
            $output->writeln('<error>Invalid --min-size "' . $minSizeRaw . '", use a number of bytes or a unit such as 500K, 10M or 1G.</error>');

            return 1;
        }

        $users = (array)$input->getOption('user');

        return (!empty($users))
            ? $this->listDuplicatesForUsers($users, $sortMap[$sortBy], $minSize)
            : $this->listAllDuplicates($sortMap[$sortBy], $minSize);
    }

    /**
     * List duplicates for the specified users.
     *
     * @param array $users The array of user names.
     * @param array<array<string>> $orderBy
     * @return int The command exit code.
     */
    private function listDuplicatesForUsers(array $users, array $orderBy = [['hash'], ['type']], int $minSize = 0): int
    {
        foreach ($users as $user) {
            if (!$this->userManager->userExists($user)) {
                $this->output->writeln('<e>User ' . $user . ' is unknown.</e>');

                return 1;
            }

            $this->output->writeln('<info>Listing duplicates for user: ' . $user . '</info>');
            CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function () {}, $user, 20, $orderBy, $minSize);
        }

        return 0;
    }

    /**
     * List all duplicates for all users.
     *
     * @param array<array<string>> $orderBy
     * @return int The command exit code.
     */
    private function listAllDuplicates(array $orderBy = [['hash'], ['type']], int $minSize = 0): int
    {
        // List duplicates for all users
        $users = $this->userManager->search('');
        foreach ($users as $user) {
            $userId = $user->getUID();
            $this->output->writeln('<info>Listing duplicates for user: ' . $userId . '</info>');
            CMDUtils::showDuplicates($this->fileDuplicateService, $this->output, function () {}, $userId, 20, $orderBy, $minSize);
        }

        return 0;
    }
}
