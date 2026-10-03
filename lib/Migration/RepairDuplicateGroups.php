<?php

namespace OCA\DuplicateFinder\Migration;

use OCA\DuplicateFinder\AppInfo\Application;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Before 1.8.3 a second row was inserted for a hash each time the group of that hash could not be
 * read back, so the rows of a group kept multiplying and every scan logged an exception (issue 178).
 * The rows of a group hold nothing but the hash, the type and the acknowledged flag: keep the oldest.
 */
class RepairDuplicateGroups implements IRepairStep
{
    /** @var IDBConnection */
    private $connection;
    /** @var LoggerInterface */
    private $logger;

    public function __construct(IDBConnection $connection, LoggerInterface $logger)
    {
        $this->connection = $connection;
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
        $qb = $this->connection->getQueryBuilder();
        $qb->select('hash', 'type')
            ->selectAlias($qb->func()->min('id'), 'keep_id')
            ->from('duplicatefinder_dups')
            ->groupBy('hash', 'type')
            ->having($qb->expr()->gt($qb->func()->count('*'), $qb->createNamedParameter(1, IQueryBuilder::PARAM_INT)));
        $result = $qb->executeQuery();
        $collisions = $result->fetchAll();
        $result->closeCursor();

        $removed = 0;
        foreach ($collisions as $row) {
            if ($row['type'] === null) {
                continue;
            }
            $delete = $this->connection->getQueryBuilder();
            $delete->delete('duplicatefinder_dups')
                ->where($delete->expr()->eq('hash', $delete->createNamedParameter($row['hash'])))
                ->andWhere($delete->expr()->eq('type', $delete->createNamedParameter($row['type'])))
                ->andWhere($delete->expr()->neq('id', $delete->createNamedParameter((int)$row['keep_id'], IQueryBuilder::PARAM_INT)));
            $removed += $delete->executeStatement();
        }

        if ($removed > 0) {
            $output->info(sprintf('Removed %d surplus duplicate group rows', $removed));
            $this->logger->info('Removed {count} surplus duplicate group rows', [
                'app' => Application::ID,
                'count' => $removed,
            ]);
        }
    }
}
