<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCP\IConfig;

/**
 * Removes the surplus rows that issue 178 left in the table of the duplicate groups (several rows for one hash),
 * a little at a time: the upgrade of the server must not wait for it (issue 182), so the repair step gives it a
 * few seconds and the clean-up background job goes on from where it stopped.
 *
 * Two app values keep the state between calls: where the last pass stopped, and whether a pass reached the end of
 * the table (from then on the surplus rows cannot come back, getOrCreate() reuses the oldest row of a hash).
 */
class SurplusRowsMerger
{
    private const CURSOR_KEY = 'merge_surplus_cursor';
    private const DONE_KEY = 'merge_surplus_done';

    /** @var FileDuplicateMapper */
    private $mapper;
    /** @var IConfig */
    private $config;

    public function __construct(FileDuplicateMapper $mapper, IConfig $config)
    {
        $this->mapper = $mapper;
        $this->config = $config;
    }

    /**
     * @param float $timeBudget Seconds after which no further batch is started
     * @return array{removed: int, done: bool} How many rows were deleted, and whether every row has been looked at
     */
    public function run(float $timeBudget = 20.0): array
    {
        if ($this->config->getAppValue(Application::ID, self::DONE_KEY, '') === '1') {
            return ['removed' => 0, 'done' => true];
        }

        $cursor = max(0, (int)$this->config->getAppValue(Application::ID, self::CURSOR_KEY, '0'));
        $step = $this->mapper->mergeSurplusRows($timeBudget, $cursor);

        if ($step['finished']) {
            $this->config->deleteAppValue(Application::ID, self::CURSOR_KEY);
            $this->config->setAppValue(Application::ID, self::DONE_KEY, '1');
        } else {
            $this->config->setAppValue(Application::ID, self::CURSOR_KEY, (string)$step['lastId']);
        }

        return ['removed' => $step['removed'], 'done' => $step['finished']];
    }
}
