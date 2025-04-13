<?php
namespace OCA\DuplicateFinder\Utils;

use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Output\OutputInterface;
use OC\Files\Utils\Scanner;
use OCP\IDBConnection;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\NotFoundException;
use OCP\Files\Node;
use OCP\Files\Folder;
use OCP\Lock\LockedException;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\CMDUtils;

class ScannerUtil
{


    /** @var IDBConnection */
    private $connection;
    /** @var IEventDispatcher */
    private $eventDispatcher;
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
        IDBConnection $connection,
        IEventDispatcher $eventDispatcher,
        LoggerInterface $logger,
        ShareService $shareService,
        FilterService $filterService,
        FolderService $folderService
    ) {
        $this->connection = $connection;
        $this->eventDispatcher = $eventDispatcher;
        $this->logger = $logger;
        $this->shareService = $shareService;
        $this->filterService = $filterService;
        $this->folderService = $folderService;
    }

    public function setHandles(
        FileInfoService $fileInfoService,
        ?OutputInterface $output,
        ?\Closure $abortIfInterrupted
    ) : void {
        $this->fileInfoService = $fileInfoService;
        $this->output = $output;
        $this->abortIfInterrupted = $abortIfInterrupted;
    }

    public function scan(string $user, string $path, bool $isShared = false) : void
    {
        if (!$isShared) {
            $this->showOutput('Start searching files for '.$user.' in path '.$path);
        }
        try {
            // Check if the path contains a .nodupefinder file
            $userFolder = $this->folderService->getUserFolder($user);
            $relativePath = str_replace($userFolder->getPath() . '/', '', $path);

            // If we're at the root of the user's folder, we need to get the node differently
            if ($relativePath === '' || $relativePath === $path) {
                $node = $userFolder;
            } else {
                try {
                    $node = $userFolder->get($relativePath);
                } catch (NotFoundException $e) {
                    $this->logger->warning('Path not found, cannot check for .nodupefinder: {path}', [
                        'path' => $path,
                        'error' => $e->getMessage()
                    ]);
                    // If we can't find the node, proceed with scanning
                    $node = null;
                }
            }

            // If we have a valid node and it's a folder, check for .nodupefinder
            if ($node instanceof Folder && $this->filterService->shouldSkipDirectory($node)) {
                $this->showOutput('Skipping directory due to .nodupefinder file: ' . $path);
                return;
            }

            $scanner = $this->initializeScanner($user, $isShared);
            $scanner->scan($path, true);
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

    private function initializeScanner(string $user, bool $isShared = false) : Scanner
    {
        $scanner = new Scanner($user, $this->connection, $this->eventDispatcher, $this->logger);
        $scanner->listen(
            '\OC\Files\Utils\Scanner',
            'postScanFile',
            function ($path) use ($user, $isShared) {
                $this->showOutput('Scanning '.($isShared ? 'Shared Node ':'').$path, true);
                $this->saveScannedFile($path, $user);
            }
        );
        return $scanner;
    }

    private function saveScannedFile(
        string $path,
        string $user
    ) : void {
        try {
            $this->fileInfoService->save($path, $user);
        } catch (NotFoundException $e) {
            $this->logger->error('The given path doesn\'t exists ('.$path.').', [
                'app' => Application::ID,
                'exception' => $e
            ]);
            $this->showOutput('<e>The given path doesn\'t exists ('.$path.').</e>');
        } catch (ForcedToIgnoreFileException $e) {
            $this->logger->info($e->getMessage(), ['exception'=> $e]);
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
                    // Check if the shared folder contains a .nodupefinder file
                    if ($node instanceof Folder && $this->filterService->shouldSkipDirectory($node)) {
                        $this->showOutput('Skipping shared directory due to .nodupefinder file: ' . $node->getPath());
                        continue;
                    }
                    $this->scan($share->getSharedBy(), $node->getPath(), true);
                }
            }
        }
        unset($share);
    }

    private function showOutput(string $message, bool $isVerbose = false) : void
    {
        CMDUtils::showIfOutputIsPresent(
            $message,
            $this->output,
            $isVerbose ? OutputInterface::VERBOSITY_VERBOSE : OutputInterface::VERBOSITY_NORMAL
        );
    }

}
