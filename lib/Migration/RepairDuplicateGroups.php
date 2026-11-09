<?php

namespace OCA\DuplicateFinder\Migration;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\SurplusRowsMerger;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Before 1.8.3 a second row was inserted for a hash each time the group of that hash could not be
 * read back, so the rows of a group kept multiplying and every scan logged an exception (issue 178).
 * The rows of a group hold nothing but the hash, the type and the acknowledged flag: keep the oldest.
 *
 * 1.8.3 deleted the surplus rows one group at a time and loaded every group in memory: on a table with
 * hundreds of thousands of groups the upgrade ran for many minutes or was killed (issue 182). The surplus
 * rows are now deleted by batches of ids within a time budget, and the clean-up background job finishes
 * what the budget left.
 */
class RepairDuplicateGroups implements IRepairStep
{
    /** Seconds the upgrade may spend here: a repair step must not hold the upgrade of the server. */
    private const TIME_BUDGET = 20.0;

    /** @var SurplusRowsMerger */
    private $merger;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(SurplusRowsMerger $merger, LoggerInterface $logger)
    {
        $this->merger = $merger;
        $this->logger = $logger;
    }

    /**
     * Returns the step's name
     *
     * @return string
     */
    public function getName()
    {
        return Application::ID . ': Merge duplicate group rows that share a hash';
    }

    /**
     * @param IOutput $output
     * @return void
     */
    public function run(IOutput $output)
    {
        $result = $this->merger->run(self::TIME_BUDGET);

        if ($result['removed'] > 0) {
            $output->info(sprintf('Removed %d surplus duplicate group rows', $result['removed']));
            $this->logger->info('Removed {count} surplus duplicate group rows', [
                'app' => Application::ID,
                'count' => $result['removed'],
            ]);
        }
        if (!$result['done']) {
            $output->info('Surplus duplicate group rows are left, the clean-up background job removes them');
            $this->logger->info('Surplus duplicate group rows are left after the time budget of the repair step, the clean-up job removes them', [
                'app' => Application::ID,
            ]);
        }
    }
}
