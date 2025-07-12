<?php

namespace OCA\DuplicateFinder\Migration;

use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

class RepairNullTypes implements IRepairStep
{
    /** @var IDBConnection */
    private $connection;

    /** @var LoggerInterface */
    private $logger;

    /**
     * @param IDBConnection $connection
     * @param LoggerInterface $logger
     */
    public function __construct(IDBConnection $connection, LoggerInterface $logger)
    {
        $this->connection = $connection;
        $this->logger = $logger;
    }

    /**
     * Returns the step's name
     */
    public function getName(): string
    {
        return 'Repair NULL type values in duplicatefinder_dups table';
    }

    /**
     * Run the repair step
     */
    public function run(IOutput $output): void
    {
        $output->info('Checking for NULL type values in duplicatefinder_dups table...');

        // First, check if there are any records with NULL type
        $qb = $this->connection->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
           ->from('duplicatefinder_dups')
           ->where($qb->expr()->isNull('type'));

        $result = $qb->execute();
        $count = (int)$result->fetchOne();
        $result->closeCursor();

        if ($count > 0) {
            $output->info("Found {$count} records with NULL type values. Fixing...");

            // Update all records with NULL type to the default 'file_hash'
            $updateQb = $this->connection->getQueryBuilder();
            $updateQb->update('duplicatefinder_dups')
                    ->set('type', $updateQb->createNamedParameter('file_hash'))
                    ->where($updateQb->expr()->isNull('type'));

            $updated = $updateQb->execute();

            $output->info("Fixed {$updated} records with NULL type values.");
            $this->logger->info("Fixed {$updated} records with NULL type values in duplicatefinder_dups table.");
        } else {
            $output->info('No NULL type values found in duplicatefinder_dups table.');
        }
    }
}
