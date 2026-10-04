<?php

namespace OCA\DuplicateFinder\Migration;

use OCA\DuplicateFinder\AppInfo\Application;
use OCP\Files\FileInfo;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\IRepairStep;
use Psr\Log\LoggerInterface;

/**
 * Up to 1.8.3 the filesystem listener also saved folders. Their rows are never hashed and showed up
 * in every lookup of files with the same size (mostly zero-byte files), which slowed down each scan.
 */
class RemoveFolderFileInfos implements IRepairStep
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
     * @return string
     */
    public function getName()
    {
        return Application::ID . ': Remove folders from the file index';
    }

    /**
     * @param IOutput $output
     * @return void
     */
    public function run(IOutput $output)
    {
        $qb = $this->connection->getQueryBuilder();
        $qb->delete('duplicatefinder_finfo')
            ->where($qb->expr()->eq('mimetype', $qb->createNamedParameter(FileInfo::MIMETYPE_FOLDER)));
        $removed = $qb->executeStatement();

        if ($removed > 0) {
            $output->info('Removed ' . $removed . ' folder rows from the file index');
            $this->logger->info('Removed {count} folder rows from duplicatefinder_finfo', ['count' => $removed]);
        }
    }
}
