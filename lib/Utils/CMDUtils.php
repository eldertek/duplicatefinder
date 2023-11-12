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
        ?string $user = null
    ): void {
        $output->writeln($user === null ? 'Duplicates are: ' : 'Duplicates for user "'.$user.'" are: ');
        $duplicates = array("pageKey" => 0, "isLastFetched" => true);
        do {
            $duplicates = $fileDuplicateService->findAll('all', $user, 20, $duplicates["pageKey"], true);
            self::processDuplicates($output, $duplicates);
            $abortIfInterrupted();
        } while (!$duplicates["isLastFetched"]);
    }

    private static function processDuplicates(OutputInterface $output, array $duplicates): void {
        foreach ($duplicates["entities"] as $duplicate) {
            if (!$duplicate->getFiles()) {
                continue;
            }
            $output->writeln($duplicate->getHash().'('.$duplicate->getType().')');
            self::showFiles($output, $duplicate->getFiles());
        }
    }

    /**
     * @param array<\OCA\DuplicateFinder\Db\FileInfo> $files
     */
    private static function showFiles(OutputInterface $output, array $files) : void
    {
        $shownPaths = [];
        $hiddenPaths = 0;
        $indent = '     ';
        foreach ($files as $file) {
            if ($file instanceof \OCA\DuplicateFinder\Db\FileInfo) {
                if (!isset($shownPaths[$file->getPath()])) {
                    $output->writeln($indent.$file->getPath());
                    $shownPaths[$file->getPath()] = 1;
                } else {
                    $hiddenPaths += 1;
                }
            }
        }
        if ($hiddenPaths > 0) {
            $message = $hiddenPaths.' path'.($hiddenPaths > 1 ? 's are' : ' is').' hidden because '.($hiddenPaths > 1 ? 'they reference' : 'it references').' to a similiar file.';
            $output->writeln($indent.'<info>'.$message.'</info>');
        }
    }

    public static function showIfOutputIsPresent(
        string $message,
        ?OutputInterface $output = null,
        int $verbosity = OutputInterface::VERBOSITY_NORMAL
    ) : void {
        if (!is_null($output)) {
            $output->writeln($message, $verbosity);
        }
    }
}
