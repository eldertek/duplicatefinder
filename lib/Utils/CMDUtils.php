<?php

namespace OCA\DuplicateFinder\Utils;

use OCA\DuplicateFinder\Service\FileDuplicateService;
use Symfony\Component\Console\Output\OutputInterface;

class CMDUtils
{
    /**
     * @param ?array<array<string>> $orderBy
     */
    public static function showDuplicates(
        FileDuplicateService $fileDuplicateService,
        OutputInterface $output,
        \Closure $abortIfInterrupted,
        ?string $user = null,
        int $pageSize = 20, // Add a page size parameter
        ?array $orderBy = [['hash'], ['type']],
        int $minSize = 0
    ): void {
        $output->writeln($user === null ? 'Duplicates are: ' : 'Duplicates for user "' . $user . '" are: ');

        $currentPage = 1; // Start from the first page
        $isLastFetched = false;
        $hasCustomOrder = $orderBy !== [['hash'], ['type']];

        do {
            // Pass the current page and page size to the findAll method
            if ($minSize > 0) {
                $duplicates = $fileDuplicateService->findAll('all', $user, $currentPage, $pageSize, true, $orderBy, $minSize);
            } elseif ($hasCustomOrder) {
                $duplicates = $fileDuplicateService->findAll('all', $user, $currentPage, $pageSize, true, $orderBy);
            } else {
                $duplicates = $fileDuplicateService->findAll('all', $user, $currentPage, $pageSize, true);
            }

            self::processDuplicates($output, $duplicates);
            $abortIfInterrupted();

            $isLastFetched = $duplicates['isLastFetched'];
            if (isset($duplicates['pageKey']) && $pageSize > 0) {
                $currentPage = max($currentPage + 1, ((int)floor($duplicates['pageKey'] / $pageSize)) + 2);
            } else {
                $currentPage++; // Increment to fetch the next page in the next iteration
            }
        } while (!$isLastFetched); // Continue until the last page is fetched
    }


    private static function processDuplicates(OutputInterface $output, array $duplicates): void
    {
        $output->writeln('<info>Found ' . count($duplicates['entities']) . ' duplicates</info>');

        foreach ($duplicates['entities'] as $index => $duplicate) {
            if (!$duplicate->getFiles()) {
                continue;
            }

            $files = $duplicate->getFiles();
            $firstFile = reset($files);
            $groupSize = $firstFile instanceof \OCA\DuplicateFinder\Db\FileInfo ? (int)$firstFile->getSize() : 0;

            $output->writeln('');
            $output->writeln('<info>Duplicate #' . ($index + 1) . '</info>');
            $output->writeln('<comment>Hash:</comment> ' . $duplicate->getHash());
            $output->writeln('<comment>Status:</comment> ' . ($duplicate->isAcknowledged() ? 'Acknowledged' : 'Unacknowledged'));
            if ($groupSize > 0) {
                $output->writeln('<comment>Size:</comment> ' . self::formatSize($groupSize));
            }

            $output->writeln('<comment>Files (' . count($files) . '):</comment>');

            foreach ($files as $fileIndex => $file) {
                if ($file instanceof \OCA\DuplicateFinder\Db\FileInfo) {
                    $path = $file->getPath();
                    $filename = basename($path);
                    $directory = dirname($path);

                    $output->writeln('  ' . ($fileIndex + 1) . '. <info>' . $filename . '</info>');
                    $output->writeln('     Path: ' . $directory);
                }
            }
        }
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



    public static function showIfOutputIsPresent(
        string $message,
        ?OutputInterface $output = null,
        int $verbosity = OutputInterface::VERBOSITY_NORMAL
    ): void {
        if (!is_null($output)) {
            $output->writeln($message, $verbosity);
        }
    }
}
