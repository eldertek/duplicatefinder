<?php

namespace OCA\DuplicateFinder\Migration;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoRepairer;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Gives a path hash to the file infos that have none and removes the surplus file infos (several rows for one path and
 * one owner, only the oldest stays). Nextcloud runs the post-migration steps of an app each time it is updated and each
 * time it is enabled while a version of it is recorded as installed.
 *
 * Up to 1.8.4 this step loaded every row of the table in memory (FileInfoService::findAll() builds an object per row,
 * about 2.5 KB each): on a server that had scanned a million files or more, `occ app:enable duplicatefinder` and
 * `occ upgrade` were killed for lack of memory and left the server in maintenance mode (issue 182). The work is now
 * done by FileInfoRepairer, a window of ids at a time, within a time budget, and the clean-up background job finishes
 * what the budget left. A table that is already clean costs a fraction of a second, once.
 */
class RepairFileInfos implements IRepairStep
{
    /** Seconds the upgrade may spend here: a repair step must not hold the upgrade of the server. */
    private const TIME_BUDGET = 20.0;

    /** @var ConfigService */
    private $config;
    /** @var FileInfoRepairer */
    private $repairer;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(
        ConfigService $config,
        FileInfoRepairer $repairer,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->repairer = $repairer;
        $this->logger = $logger;
    }

    /**
     * Returns the step's name
     *
     * @return string
     * @since 9.1.0
     */
    public function getName()
    {
        return Application::ID.': Repair FileInfo objects';
    }

    /**
     * @param IOutput $output
     * @return mixed
     */
    public function run(IOutput $output)
    {
        if (!$this->shouldRun()) {
            return;
        }

        $result = $this->repairer->run(self::TIME_BUDGET);

        if ($result['pathHashes'] > 0) {
            $output->info(sprintf('Recalculated %d path hashes', $result['pathHashes']));
        }
        if ($result['removed'] > 0) {
            $output->info(sprintf('Removed %d surplus file info rows', $result['removed']));
        }
        if ($result['pathHashes'] > 0 || $result['removed'] > 0) {
            $this->logger->info('Repaired the file infos: {hashes} path hashes recalculated, {removed} surplus rows removed', [
                'app' => Application::ID,
                'hashes' => $result['pathHashes'],
                'removed' => $result['removed'],
            ]);
        }
        if (!$result['done']) {
            $output->info('File info rows are left to look at, the clean-up background job goes on with them');
            $this->logger->info('File info rows are left to repair after the time budget of the repair step, the clean-up job goes on with them', [
                'app' => Application::ID,
            ]);
        }
    }

    /**
     * The installed version is the version the server is updating FROM (Nextcloud records the new one once the
     * repair steps are done), and a repair step only runs for an app that has a recorded version. So this is false
     * only for an app recorded as 0.0.x up to 0.0.9: the condition comes unchanged from the first version of this app
     * (PaulLereverend/NextcloudDuplicateFinder) and nothing says why that threshold was chosen. For every real
     * installation it is true and the done flag of FileInfoRepairer decides whether there is anything left to do.
     */
    protected function shouldRun(): bool
    {
        return version_compare($this->config->getInstalledVersion(), '0.0.9', '>');
    }
}
