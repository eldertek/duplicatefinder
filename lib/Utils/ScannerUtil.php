<?php

namespace OCA\DuplicateFinder\Utils;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\Lock\LockedException;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;

class ScannerUtil
{
    /** @var LoggerInterface */
    private $logger;
    /** @var OutputInterface|null */
    private $output;
    /** @var \Closure|null */
    private $abortIfInterrupted;
    /** @var FileInfoService */
    private $fileInfoService;
    /** @var ShareService */
    private $shareService;
    /** @var FilterService */
    private $filterService;
    /** @var FolderService */
    private $folderService;

    public function __construct(
        LoggerInterface $logger,
        ShareService $shareService,
        FilterService $filterService,
        FolderService $folderService
    ) {
        $this->logger = $logger;
        $this->shareService = $shareService;
        $this->filterService = $filterService;
        $this->folderService = $folderService;
    }

    public function setHandles(
        FileInfoService $fileInfoService,
        ?OutputInterface $output,
        ?\Closure $abortIfInterrupted
    ): void {
        $this->fileInfoService = $fileInfoService;
        $this->output = $output;
        $this->abortIfInterrupted = $abortIfInterrupted;
    }

    /**
     * Walks the already indexed file tree (oc_filecache) instead of using
     * OC\Files\Utils\Scanner. The storage rescan done by the old approach
     * rewrote mtime/etag for every row of oc_filecache which caused massive
     * write load and deadlocks on large instances (#160, #164).
     */
    public function scan(string $user, string $path, bool $isShared = false): void
    {
        if (!$isShared) {
            $this->showOutput('Start searching files for '.$user.' in path '.$path);
        }

        try {
            if (!$isShared) {
                // Make sure the scanned user's mounts are set up: the previous
                // OC\Files\Utils\Scanner did this internally, and background jobs
                // scan several users in the same process
                \OC_Util::tearDownFS();
                \OC_Util::setupFS($user);
            }
            $userFolder = $this->folderService->getUserFolder($user);
            $relativePath = trim(str_replace($userFolder->getPath(), '', $path), '/');

            try {
                $node = ($relativePath === '') ? $userFolder : $userFolder->get($relativePath);
            } catch (NotFoundException $e) {
                $this->logger->warning('Path not found, skipping scan: {path}', [
                    'path' => $path,
                    'error' => $e->getMessage(),
                ]);
                $this->showOutput('<e>Skipped '.$path.' because it doesn\'t exist.</e>');

                return;
            }

            $this->walkNode($node, $user, $isShared);

            if (!$isShared) {
                $this->scanSharedFiles($user, $path);
                $this->showOutput('Finished searching files');
            }
        } catch (LockedException $e) {
            $this->showOutput('<e>File locked, attempting to release: ' . $e->getPath() . '</e>');

            throw $e; // Rethrow to be handled in FileInfoService
        } catch (\Exception $e) {
            $errorMessage = 'An error occurred during scanning: ' . $e->getMessage();
            $this->logger->error($errorMessage, ['app' => Application::ID, 'exception' => $e]);
            $this->showOutput('<e>' . $errorMessage . '</e>');
        }
    }

    private function walkNode(Node $node, string $user, bool $isShared = false): void
    {
        if ($node instanceof Folder) {
            if ($this->filterService->shouldSkipDirectory($node)) {
                $this->showOutput('Skipping directory due to .nodupefinder file: ' . $node->getPath());

                return;
            }
            foreach ($node->getDirectoryListing() as $child) {
                $this->walkNode($child, $user, $isShared);
            }
        } elseif ($node instanceof File) {
            $this->showOutput('Scanning '.($isShared ? 'Shared Node ' : '').$node->getPath(), true);
            $this->saveScannedFile($node->getPath(), $user);
        }
    }

    private function saveScannedFile(
        string $path,
        string $user
    ): void {
        try {
            $this->fileInfoService->save($path, $user);
        } catch (NotFoundException $e) {
            $this->logger->warning('The given path doesn\'t exists ('.$path.').', [
                'app' => Application::ID,
                'exception' => $e,
            ]);
            $this->showOutput('<e>The given path doesn\'t exists ('.$path.').</e>');
        } catch (ForcedToIgnoreFileException $e) {
            $this->logger->info($e->getMessage(), ['exception' => $e]);
            $this->showOutput('Skipped '.$path, true);
        }
        if ($this->abortIfInterrupted) {
            $abort = $this->abortIfInterrupted;
            if ($abort()) {
                throw new \Exception('Scan aborted by user');
            }
        }
    }

    private function scanSharedFiles(
        string $user,
        ?string $path
    ): void {
        $shares = $this->shareService->getShares($user);

        foreach ($shares as $share) {
            $node = $share->getNode();
            if (is_null($path) || strpos($node->getPath(), $path) == 0) {
                if ($node->getType() === \OCP\Files\FileInfo::TYPE_FILE) {
                    $this->saveScannedFile($node->getPath(), $user);
                } else {
                    $this->walkNode($node, $user, true);
                }
            }
        }
        unset($share);
    }

    private function showOutput(string $message, bool $isVerbose = false): void
    {
        CMDUtils::showIfOutputIsPresent(
            $message,
            $this->output,
            $isVerbose ? OutputInterface::VERBOSITY_VERBOSE : OutputInterface::VERBOSITY_NORMAL
        );
    }

}
