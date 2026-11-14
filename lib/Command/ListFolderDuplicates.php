<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCP\Encryption\IManager;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class ListFolderDuplicates extends Command
{
    /** @var IUserManager */
    private $userManager;

    /** @var IManager */
    private $encryptionManager;

    /** @var FileDuplicateService */
    private $fileDuplicateService;

    /** @var FolderDuplicateService */
    private $folderDuplicateService;

    public function __construct(
        IUserManager $userManager,
        IManager $encryptionManager,
        FileDuplicateService $fileDuplicateService,
        FolderDuplicateService $folderDuplicateService
    ) {
        parent::__construct('duplicates:folders');

        $this->userManager = $userManager;
        $this->encryptionManager = $encryptionManager;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->folderDuplicateService = $folderDuplicateService;
    }

    protected function configure(): void
    {
        $this
            ->setDescription('List folders sharing identical duplicate file trees and hashes')
            ->addOption('user', 'u', InputOption::VALUE_REQUIRED | InputOption::VALUE_IS_ARRAY, 'List duplicate folders for the specified user')
            ->addOption('min-files', null, InputOption::VALUE_REQUIRED, 'Minimum number of duplicate files per folder', '1')
            ->addOption('min-size', 'm', InputOption::VALUE_REQUIRED, 'Minimum total folder size (bytes or unit like 500K, 10M)', '0')
            ->addOption('json', null, InputOption::VALUE_NONE, 'Output folder duplicate report as JSON');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if ($this->encryptionManager->isEnabled()) {
            $output->writeln('Encryption is enabled. Aborted.');

            return 1;
        }

        $minFilesRaw = $input->hasOption('min-files') ? (string)$input->getOption('min-files') : '1';
        if (!ctype_digit($minFilesRaw) || (int)$minFilesRaw < 1) {
            $output->writeln('<error>Invalid --min-files "' . $minFilesRaw . '", expected an integer >= 1.</error>');

            return 1;
        }
        $minFiles = (int)$minFilesRaw;

        $minSizeRaw = $input->hasOption('min-size') ? (string)$input->getOption('min-size') : '0';
        $minSize = CMDUtils::parseSize($minSizeRaw);
        if ($minSize === null) {
            $output->writeln('<error>Invalid --min-size "' . $minSizeRaw . '", use a number of bytes or a unit such as 500K, 10M or 1G.</error>');

            return 1;
        }

        $asJson = $input->hasOption('json') && (bool)$input->getOption('json');
        $users = (array)$input->getOption('user');

        if (empty($users)) {
            $users = [];
            foreach ($this->userManager->search('') as $user) {
                $users[] = $user->getUID();
            }
        } else {
            foreach ($users as $userId) {
                if (!$this->userManager->userExists($userId)) {
                    $output->writeln('<error>User ' . $userId . ' is unknown.</error>');

                    return 1;
                }
            }
        }

        $reportByUser = [];
        foreach ($users as $userId) {
            $allDuplicates = $this->collectAllDuplicatesForUser((string)$userId);
            $groups = $this->folderDuplicateService->findFromFileDuplicates($allDuplicates, $minFiles, $minSize);
            $summary = $this->folderDuplicateService->summarizeReport($groups);
            $reportByUser[(string)$userId] = [
                'summary' => $summary,
                'groups' => $groups,
            ];
        }

        if ($asJson) {
            $encoded = json_encode($reportByUser, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            $output->writeln($encoded !== false ? $encoded : '{}');

            return 0;
        }

        foreach ($reportByUser as $userId => $entry) {
            $summary = $entry['summary'];
            $groups = $entry['groups'];
            $output->writeln(sprintf(
                '<info>Duplicate folders for user %s: %d group(s), %d folder(s), reclaimable %s</info>',
                $userId,
                $summary['groupCount'],
                $summary['duplicateFolderCount'],
                CMDUtils::formatSize((int)$summary['reclaimableSize'])
            ));

            foreach ($groups as $index => $group) {
                $output->writeln('');
                $output->writeln(sprintf(
                    '<info>Folder group #%d (%d files, %s per folder, %s reclaimable)</info>',
                    $index + 1,
                    (int)$group['fileCount'],
                    CMDUtils::formatSize((int)$group['totalSize']),
                    CMDUtils::formatSize((int)$group['reclaimableSize'])
                ));
                foreach ($group['folders'] as $folder) {
                    $output->writeln('  - ' . $folder);
                }
            }
        }

        return 0;
    }

    /**
     * @return \OCA\DuplicateFinder\Db\FileDuplicate[]
     */
    private function collectAllDuplicatesForUser(string $userId): array
    {
        $all = [];
        $page = 1;
        $pageSize = 100;

        do {
            $batch = $this->fileDuplicateService->findAll('all', $userId, $page, $pageSize, true);
            foreach ($batch['entities'] ?? [] as $entity) {
                $all[] = $entity;
            }
            $isLastFetched = !empty($batch['isLastFetched']);
            $page++;
        } while (!$isLastFetched);

        return $all;
    }
}
