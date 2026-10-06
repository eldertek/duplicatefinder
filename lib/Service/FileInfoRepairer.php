<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCP\IConfig;

/**
 * Repairs the table of the file infos without ever loading it in memory, a little at a time: gives a path hash to the
 * rows that have none and removes the surplus rows (several rows for one path and one owner, only the oldest stays).
 *
 * Before 1.8.5 the repair step of the upgrade did this with FileInfoService::findAll(), which builds an object for every
 * row of the table. On a server that has scanned a few million files that takes several gigabytes, the kernel kills
 * `occ app:enable duplicatefinder` and `occ upgrade` and leaves the server in maintenance mode (issue 182).
 *
 * The table is walked in id order by windows of a few thousand ids. In a window the path hashes are fixed first, then
 * the surplus rows are removed, so that when a row is looked at every row with a lower id already has its path hash.
 * The work stops once the time budget is spent and the next call goes on from there: the repair step of the upgrade
 * gives it a few seconds and the clean-up background job finishes what is left.
 *
 * Two app values keep the state between calls: where the last pass stopped, and whether a pass reached the end of the
 * table (from then on the table is not looked at again).
 */
class FileInfoRepairer
{
    private const CURSOR_KEY = 'repair_file_infos_cursor';
    private const DONE_KEY = 'repair_file_infos_done';

    /** Ids looked at by one query: it bounds the work of a query and how far the time budget can be overrun. */
    private const WINDOW = 5000;

    /** @var FileInfoMapper */
    private $mapper;
    /** @var IConfig */
    private $config;

    public function __construct(FileInfoMapper $mapper, IConfig $config)
    {
        $this->mapper = $mapper;
        $this->config = $config;
    }

    /**
     * @param float $timeBudget Seconds after which no further window is started
     * @param int $window Ids looked at by one query
     * @return array{pathHashes: int, removed: int, done: bool} How many path hashes were given, how many rows were
     *         deleted, and whether every row has been looked at
     */
    public function run(float $timeBudget = 20.0, int $window = self::WINDOW): array
    {
        if ($this->config->getAppValue(Application::ID, self::DONE_KEY, '') === '1') {
            return ['pathHashes' => 0, 'removed' => 0, 'done' => true];
        }

        // hrtime() is monotonic: a change of the clock of the server cannot cut the work short or stretch it
        $deadline = hrtime(true) + (int)($timeBudget * 1e9);
        $window = max(1, $window);
        $cursor = max(0, (int)$this->config->getAppValue(Application::ID, self::CURSOR_KEY, '0'));
        $maxId = $this->mapper->getMaxId();
        $pathHashes = 0;
        $removed = 0;
        $savedAt = hrtime(true);

        try {
            while ($cursor < $maxId) {
                $until = min($cursor + $window, $maxId);
                $pathHashes += $this->mapper->repairPathHashes($cursor, $until);
                $removed += $this->mapper->removeSurplusRows($cursor, $until);
                $cursor = $until;

                $now = hrtime(true);
                if ($now >= $deadline) {
                    break;
                }
                // a pass that is killed halfway goes on from here, not from the start of the table
                if ($now - $savedAt >= 1e9) {
                    $this->config->setAppValue(Application::ID, self::CURSOR_KEY, (string)$cursor);
                    $savedAt = $now;
                }
            }
        } catch (\Throwable $e) {
            // keep what was done: the next call goes on after the last window that was completed
            $this->config->setAppValue(Application::ID, self::CURSOR_KEY, (string)$cursor);

            throw $e;
        }

        $finished = $cursor >= $maxId;
        if ($finished) {
            $this->config->deleteAppValue(Application::ID, self::CURSOR_KEY);
            $this->config->setAppValue(Application::ID, self::DONE_KEY, '1');
        } else {
            $this->config->setAppValue(Application::ID, self::CURSOR_KEY, (string)$cursor);
        }

        return ['pathHashes' => $pathHashes, 'removed' => $removed, 'done' => $finished];
    }
}
