<?php
namespace OCA\DuplicateFinder\Utils;

use Symfony\Component\Console\Output\OutputInterface;
use OCA\DuplicateFinder\Service\FileDuplicateService;

class CMDUtils
{

    public static function showDuplicates(
        FileDuplicateService $fileDuplicateService,
        OutputInterface $output,
        \Closure $abortIfInterrupted,
        ?string $user = null,
        int $pageSize = 20 // Add a page size parameter
    ): void {
        $output->writeln($user === null ? 'Duplicates are: ' : 'Duplicates for user "' . $user . '" are: ');

        $currentPage = 1; // Start from the first page
        $isLastFetched = false;

        do {
            // Pass the current page and page size to the findAll method
            $duplicates = $fileDuplicateService->findAll('all', $user, $currentPage, $pageSize, true);

            self::processDuplicates($output, $duplicates);
            $abortIfInterrupted();

            $isLastFetched = $duplicates["isLastFetched"];
            $currentPage++; // Increment to fetch the next page in the next iteration
        } while (!$isLastFetched); // Continue until the last page is fetched
    }


    private static function processDuplicates(OutputInterface $output, array $duplicates): void
    {
        $output->writeln('<info>Found ' . count($duplicates["entities"]) . ' duplicates</info>');

        foreach ($duplicates["entities"] as $index => $duplicate) {
            if (!$duplicate->getFiles()) {
                continue;
            }

            $output->writeln('');
            $output->writeln('<info>Duplicate #' . ($index + 1) . '</info>');
            $output->writeln('<comment>Hash:</comment> ' . $duplicate->getHash());
            $output->writeln('<comment>Status:</comment> ' . ($duplicate->isAcknowledged() ? 'Acknowledged' : 'Unacknowledged'));

            $files = $duplicate->getFiles();
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
