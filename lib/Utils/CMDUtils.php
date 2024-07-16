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
        foreach ($duplicates["entities"] as $duplicate) {
            if (!$duplicate->getFiles()) {
                continue;
            }
            $output->writeln($duplicate->getHash() . '(' . $duplicate->getType() . ')');
            self::showFiles($output, $duplicate->getFiles());
        }
    }

    /**
     * @param array<\OCA\DuplicateFinder\Db\FileInfo> $files
     */
    private static function showFiles(OutputInterface $output, array $files): void
    {
        $shownPaths = [];
        $hiddenPaths = 0;
        $indent = '     ';
        foreach ($files as $file) {
            if ($file instanceof \OCA\DuplicateFinder\Db\FileInfo) {
                if (!isset($shownPaths[$file->getPath()])) {
                    $output->writeln($indent . $file->getPath());
                    $shownPaths[$file->getPath()] = 1;
                } else {
                    $hiddenPaths += 1;
                }
            }
        }
        if ($hiddenPaths > 0) {
            $message = $hiddenPaths . ' path' . ($hiddenPaths > 1 ? 's are' : ' is') . ' hidden because ' . ($hiddenPaths > 1 ? 'they reference' : 'it references') . ' to a similiar file.';
            $output->writeln($indent . '<info>' . $message . '</info>');
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
