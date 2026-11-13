<?php

namespace OCA\DuplicateFinder\Command;

use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\ShareService;
use OCP\IUser;
use OCP\IUserManager;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Helper\Table;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Admin report of the duplicates of the whole server, whoever owns the files (issue 195).
 *
 * It only reads the table of the indexed files: nothing is deleted, written, scanned or hashed. Running occ needs
 * access to the server, so the report is reserved to the administrator by nature, and the web interface keeps
 * showing every user only the files he can access (issue 155).
 */
class ListAllDuplicates extends Command
{
    /** Groups whose copies are looked up together, so that a long report never sits in memory */
    private const BATCH_SIZE = 200;
    private const DEFAULT_LIMIT = 100;

    /** @var FileInfoMapper */
    private $fileInfoMapper;
    /** @var IUserManager */
    private $userManager;
    /** @var ?ShareService */
    private $shareService;
    /** @var array<string, array<string>> */
    private $receivedSharePrefixesByUser = [];

    public function __construct(
        FileInfoMapper $fileInfoMapper,
        IUserManager $userManager,
        ?ShareService $shareService = null
    ) {
        parent::__construct('duplicates:list-all');

        $this->fileInfoMapper = $fileInfoMapper;
        $this->userManager = $userManager;
        $this->shareService = $shareService;
    }

    protected function configure(): void
    {
        $this
            ->setDescription('Read only report of the duplicates of all users: for each content hash, the size, the number of copies, and the owner and path of each copy')
            ->addOption('min-size', null, InputOption::VALUE_REQUIRED, 'Only files of at least this size, in bytes or with a unit (500K, 10M, 1G)', '1')
            ->addOption('limit', 'l', InputOption::VALUE_REQUIRED, 'Number of groups to show, the biggest waste first (0 for all of them)', (string)self::DEFAULT_LIMIT)
            ->addOption('output', null, InputOption::VALUE_REQUIRED, 'Output format: table or json', 'table')
            ->addOption('include-shared', null, InputOption::VALUE_NONE, 'Include shared views of files in other users\' trees (excluded by default)')
            ->addOption('ignore-shared', null, InputOption::VALUE_NONE, 'Exclude files located on received shares (default behaviour unless --include-shared is passed)');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $format = strtolower((string)$input->getOption('output'));
        if (!in_array($format, ['table', 'json'], true)) {
            $output->writeln('<error>Unknown output format "' . $input->getOption('output') . '", use table or json.</error>');

            return Command::FAILURE;
        }

        $minSize = self::parseSize((string)$input->getOption('min-size'));
        if ($minSize === null) {
            $output->writeln('<error>Invalid --min-size "' . $input->getOption('min-size') . '", use a number of bytes or a unit such as 500K, 10M or 1G.</error>');

            return Command::FAILURE;
        }
        $limitOption = (string)$input->getOption('limit');
        if (!ctype_digit($limitOption)) {
            $output->writeln('<error>Invalid --limit "' . $limitOption . '", use a whole number (0 for all the groups).</error>');

            return Command::FAILURE;
        }
        $limit = (int)$limitOption;
        $includeShared = (bool)$input->getOption('include-shared');

        $unindexed = $this->usersWithoutIndex();

        return $format === 'json'
            ? $this->writeJson($output, $minSize, $limit, $includeShared, $unindexed)
            : $this->writeTable($output, $minSize, $limit, $includeShared, $unindexed);
    }

    /**
     * @param array<string> $unindexed
     */
    private function writeTable(OutputInterface $output, int $minSize, int $limit, bool $includeShared, array $unindexed): int
    {
        $shown = 0;
        $copies = 0;
        $wasted = 0;
        $truncated = false;

        foreach ($this->groups($minSize, $limit, $includeShared, $truncated) as $group) {
            $shown++;
            $copies += $group['copies'];
            $wasted += $group['wasted'];

            $output->writeln('');
            $output->writeln(sprintf(
                '<info>%d.</info> <comment>Hash:</comment> %s  <comment>Size:</comment> %s  <comment>Copies:</comment> %d  <comment>Wasted:</comment> %s',
                $shown,
                $group['hash'],
                self::formatSize($group['size']),
                $group['copies'],
                self::formatSize($group['wasted'])
            ));
            $table = new Table($output);
            $table->setHeaders(['Owner', 'Path']);
            foreach ($group['files'] as $file) {
                $table->addRow([$file['owner'], $file['path']]);
            }
            $table->render();
        }

        $output->writeln('');
        if ($shown === 0) {
            $output->writeln('<info>No duplicate found in the indexed files.</info>');
        } else {
            $output->writeln(sprintf(
                '<info>%d group(s) shown, %d copies, %s wasted by the extra copies.</info>',
                $shown,
                $copies,
                self::formatSize($wasted)
            ));
        }
        if ($truncated) {
            $output->writeln('<comment>More groups exist. Raise --limit, or use --limit=0 to list all of them.</comment>');
        }
        if ($unindexed !== []) {
            $output->writeln('<comment>Not scanned yet (no indexed file): ' . implode(', ', $unindexed) . '. Their files are missing from this report. Nothing is scanned here, run "occ duplicates:find-all --user=NAME" to index a user.</comment>');
        }

        return Command::SUCCESS;
    }

    /**
     * @param array<string> $unindexed
     */
    private function writeJson(OutputInterface $output, int $minSize, int $limit, bool $includeShared, array $unindexed): int
    {
        $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE;
        $shown = 0;
        $copies = 0;
        $wasted = 0;
        $truncated = false;

        $output->write('{"groups":[', false, OutputInterface::OUTPUT_RAW);
        foreach ($this->groups($minSize, $limit, $includeShared, $truncated) as $group) {
            $output->write(($shown > 0 ? ',' : '') . json_encode($group, $flags), false, OutputInterface::OUTPUT_RAW);
            $shown++;
            $copies += $group['copies'];
            $wasted += $group['wasted'];
        }
        $output->write('],"totals":' . json_encode([
            'groups' => $shown,
            'copies' => $copies,
            'wasted' => $wasted,
        ]) . ',"truncated":' . ($truncated ? 'true' : 'false')
            . ',"users_without_index":' . json_encode($unindexed, $flags) . '}', true, OutputInterface::OUTPUT_RAW);

        return Command::SUCCESS;
    }

    /**
     * The groups, biggest waste first, with their copies, looked up by batches.
     *
     * @param bool $truncated Set to true when more groups exist than the limit allows
     * @return \Generator<array{hash: string, size: int, copies: int, wasted: int, files: array<array{owner: string, path: string}>}>
     */
    private function groups(int $minSize, int $limit, bool $includeShared, bool &$truncated): \Generator
    {
        $served = 0;
        $batch = [];

        // one more than the limit tells whether the list was cut
        foreach ($this->fileInfoMapper->findDuplicateGroupsAcrossUsers($minSize, $limit > 0 ? $limit + 1 : 0, $includeShared) as $group) {
            if ($limit > 0 && $served + count($batch) >= $limit) {
                $truncated = true;

                break;
            }
            $batch[] = $group;
            if (count($batch) >= self::BATCH_SIZE) {
                yield from $this->withCopies($batch, $includeShared);
                $served += count($batch);
                $batch = [];
            }
        }
        yield from $this->withCopies($batch, $includeShared);
    }

    /**
     * @param array<array{hash: string, size: int, copies: int, wasted: int}> $batch
     * @return \Generator<array{hash: string, size: int, copies: int, wasted: int, files: array<array{owner: string, path: string}>}>
     */
    private function withCopies(array $batch, bool $includeShared): \Generator
    {
        if ($batch === []) {
            return;
        }
        $copies = $this->fileInfoMapper->findCopiesOfHashes(array_column($batch, 'hash'), $includeShared);
        foreach ($batch as $group) {
            $rawFiles = $copies[$group['hash']] ?? [];
            if (!$includeShared && $this->shareService !== null && $rawFiles !== []) {
                $filteredFiles = array_values(array_filter(
                    $rawFiles,
                    function (array $file): bool {
                        return !$this->isPathInReceivedShare((string)($file['path'] ?? ''), (string)($file['owner'] ?? ''));
                    }
                ));
                if (count($filteredFiles) < count($rawFiles)) {
                    if (count($filteredFiles) <= 1) {
                        continue;
                    }
                    $group['files'] = $filteredFiles;
                    $group['copies'] = count($filteredFiles);
                    $group['wasted'] = ($group['copies'] - 1) * (int)$group['size'];
                    yield $group;

                    continue;
                }
            }
            $group['files'] = $rawFiles;
            yield $group;
        }
    }

    /**
     * Whether a file path sits inside a share received by that user (issue 197).
     */
    private function isPathInReceivedShare(string $path, string $owner): bool
    {
        if ($this->shareService === null || $path === '') {
            return false;
        }
        $pathUser = $owner;
        if (preg_match('#^/([^/]+)/files/.+$#', $path, $m)) {
            $pathUser = $m[1];
        }
        if ($pathUser === '') {
            return false;
        }

        foreach ($this->getReceivedSharePrefixes($pathUser) as $prefix) {
            if ($path === $prefix || strpos($path, $prefix . '/') === 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<string>
     */
    private function getReceivedSharePrefixes(string $user): array
    {
        if (isset($this->receivedSharePrefixesByUser[$user])) {
            return $this->receivedSharePrefixesByUser[$user];
        }
        $prefixes = [];
        if ($this->shareService !== null) {
            foreach ($this->shareService->getShares($user) as $share) {
                $target = trim((string)$share->getTarget(), '/');
                if ($target !== '') {
                    $prefixes[] = '/' . $user . '/files/' . $target;
                }
            }
        }
        $this->receivedSharePrefixesByUser[$user] = array_values(array_unique($prefixes));

        return $this->receivedSharePrefixesByUser[$user];
    }

    /**
     * Users that own no indexed file: the report cannot know about their files until they are scanned.
     *
     * @return array<string>
     */
    private function usersWithoutIndex(): array
    {
        $owners = array_flip($this->fileInfoMapper->findOwners());
        $missing = [];
        $this->userManager->callForAllUsers(function (IUser $user) use ($owners, &$missing): void {
            if (!isset($owners[$user->getUID()])) {
                $missing[] = $user->getUID();
            }
        });
        sort($missing);

        return $missing;
    }

    /**
     * "1048576", "500K", "10M", "1.5G" (binary units) to bytes, null when it is not a size.
     */
    public static function parseSize(string $value): ?int
    {
        if (!preg_match('/^\s*(\d+(?:\.\d+)?)\s*([kmgt]?)b?\s*$/i', $value, $m)) {
            return null;
        }
        $power = ['' => 0, 'k' => 1, 'm' => 2, 'g' => 3, 't' => 4][strtolower($m[2])];

        return (int)round((float)$m[1] * (1024 ** $power));
    }

    public static function formatSize(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $value = (float)$bytes;
        $unit = 0;
        while ($value >= 1024 && $unit < count($units) - 1) {
            $value /= 1024;
            $unit++;
        }

        return ($unit === 0 ? (string)$bytes : number_format($value, 1, '.', '')) . ' ' . $units[$unit];
    }
}
