<?php

namespace OCA\DuplicateFinder\Utils;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ScanStatusService;
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
    /** @var ?ScanStatusService */
    private $scanStatusService;
    /** @var int */
    private $scannedFiles = 0;
    /** @var int */
    private $discoveredFiles = 0;
    /** @var int */
    private $totalFiles = 0;
    /** @var int */
    private $scanStartedAt = 0;
    /** @var int */
    private $prevCompletedSeq = 0;
    /** @var ?int */
    private $prevCompletedAt = null;
    /** @var int */
    private $lastProgressHrtime = 0;

    public function __construct(
        LoggerInterface $logger,
        ShareService $shareService,
        FilterService $filterService,
        FolderService $folderService,
        ?ScanStatusService $scanStatusService = null
    ) {
        $this->logger = $logger;
        $this->shareService = $shareService;
        $this->filterService = $filterService;
        $this->folderService = $folderService;
        $this->scanStatusService = $scanStatusService;
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

        $trackingActive = false;

        try {
            if (!$isShared) {
                // Start each scan with fresh filters, excluded folders and .nodupefinder lookups
                $this->filterService->resetCache();
                // Make sure the scanned user's mounts are set up: the previous
                // OC\Files\Utils\Scanner did this internally, and background jobs
                // scan several users in the same process
                if (class_exists(\OC_Util::class)) {
                    \OC_Util::tearDownFS();
                    \OC_Util::setupFS($user);
                }
            }
            $userFolder = $this->folderService->getUserFolder($user);
            $relativePath = trim(str_replace($userFolder->getPath(), '', $path), '/');

            if (!$isShared && $this->scanStatusService !== null) {
                $existing = $this->scanStatusService->getStatus($user);
                $this->prevCompletedSeq = (int)($existing['completedSeq'] ?? 0);
                $this->prevCompletedAt = isset($existing['completedAt']) && $existing['completedAt'] !== null
                    ? (int)$existing['completedAt']
                    : null;
                $this->scannedFiles = 0;
                $this->discoveredFiles = 0;
                $this->totalFiles = $this->scanStatusService->countUserFiles($user, $relativePath);
                $this->scanStartedAt = time();
                $this->lastProgressHrtime = hrtime(true);
                $this->scanStatusService->startScan(
                    $user,
                    $this->totalFiles,
                    $this->prevCompletedSeq,
                    $this->prevCompletedAt
                );
                $trackingActive = true;
                register_shutdown_function(function () use (&$trackingActive, $user): void {
                    if ($trackingActive && $this->scanStatusService !== null) {
                        $trackingActive = false;
                        $this->scanStatusService->finishScan(
                            $user,
                            $this->scannedFiles,
                            $this->totalFiles,
                            $this->scanStartedAt,
                            $this->prevCompletedSeq
                        );
                    }
                });
            }

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
        } catch (\Throwable $e) {
            $errorMessage = 'An error occurred during scanning: ' . $e->getMessage();
            $this->logger->error($errorMessage, ['app' => Application::ID, 'exception' => $e]);
            $this->showOutput('<e>' . $errorMessage . '</e>');
        } finally {
            if ($trackingActive && $this->scanStatusService !== null) {
                $trackingActive = false;
                $this->scanStatusService->finishScan(
                    $user,
                    $this->scannedFiles,
                    $this->totalFiles,
                    $this->scanStartedAt,
                    $this->prevCompletedSeq
                );
            }
        }
    }

    private function walkNode(Node $node, string $user, bool $isShared = false): void
    {
        if ($node instanceof Folder) {
            if ($this->filterService->shouldSkipDirectory($node)) {
                $skippedPath = $node->getPath();
                if (!$isShared && $this->fileInfoService !== null && is_string($skippedPath) && $skippedPath !== '') {
                    $this->fileInfoService->ignoreFilesInFolder($user, $skippedPath);
                }
                $this->showOutput('Skipping directory due to .nodupefinder file: ' . $node->getPath());

                return;
            }
            $children = $node->getDirectoryListing();
            foreach ($children as $childNode) {
                if ($childNode instanceof File) {
                    $this->discoveredFiles++;
                }
            }
            if ($this->discoveredFiles > $this->totalFiles) {
                $this->totalFiles = $this->discoveredFiles;
            }
            $known = $isShared ? [] : $this->findKnownFiles($children, $user);
            foreach ($children as $child) {
                $fileInfo = $known[$child->getPath()] ?? null;
                if ($fileInfo !== null && $this->fileInfoService->isUpToDate($fileInfo, $child)) {
                    // Saving it again would not change anything: skip the lookups and events
                    $this->showOutput('Unchanged '.$child->getPath(), true);
                    $this->recordProcessedFile($user);
                    $this->abortIfRequested();

                    continue;
                }
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
        $this->recordProcessedFile($user);
        $this->abortIfRequested();
    }

    private function recordProcessedFile(string $user): void
    {
        $this->scannedFiles++;
        if ($this->scannedFiles > $this->totalFiles) {
            $this->totalFiles = $this->scannedFiles;
        }
        if ($this->scanStatusService === null) {
            return;
        }
        $nowHr = hrtime(true);
        if (($nowHr - $this->lastProgressHrtime) >= 1000000000) {
            $this->lastProgressHrtime = $nowHr;
            $this->scanStatusService->updateProgress(
                $user,
                $this->scannedFiles,
                $this->totalFiles,
                $this->scanStartedAt,
                $this->prevCompletedSeq,
                $this->prevCompletedAt
            );
        }
    }

    private function abortIfRequested(): void
    {
        if ($this->abortIfInterrupted) {
            $abort = $this->abortIfInterrupted;
            if ($abort()) {
                throw new \Exception('Scan aborted by user');
            }
        }
    }

    /**
     * Loads the rows of the files of one folder with a single query
     *
     * @param array<Node> $children
     * @return array<string, \OCA\DuplicateFinder\Db\FileInfo> indexed by path
     */
    private function findKnownFiles(array $children, string $user): array
    {
        $paths = [];
        foreach ($children as $child) {
            if ($child instanceof File) {
                $paths[] = $child->getPath();
            }
        }
        if ($paths === []) {
            return [];
        }

        try {
            return $this->fileInfoService->findByPaths($paths, $user);
        } catch (\Exception $e) {
            // Fall back to saving every file
            $this->logger->warning('Could not load the file infos of a folder: {error}', [
                'app' => Application::ID,
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    private function scanSharedFiles(
        string $user,
        ?string $path
    ): void {
        $shares = $this->shareService->getShares($user);

        foreach ($shares as $share) {
            try {
                $node = $share->getNode();
                if ($node === null) {
                    continue;
                }
                if (is_null($path) || strpos($node->getPath(), $path) == 0) {
                    if ($node->getType() === \OCP\Files\FileInfo::TYPE_FILE) {
                        $this->saveScannedFile($node->getPath(), $user);
                    } else {
                        $this->walkNode($node, $user, true);
                    }
                }
            } catch (\Throwable $e) {
                $this->logger->warning('Could not scan shared node: {error}', [
                    'app' => Application::ID,
                    'user' => $user,
                    'error' => $e->getMessage(),
                ]);
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
