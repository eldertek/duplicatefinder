<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Deduplicate duplicatefinder_finfo rows that share a path_hash and enforce a unique index on path_hash (#248).
 */
class Version11022Date20261122000000 extends SimpleMigrationStep
{
    private const BATCH_SIZE = 500;

    private ?IDBConnection $connection;

    public function __construct(?IDBConnection $connection = null)
    {
        $this->connection = $connection;
    }

    public function preSchemaChange(IOutput $output, Closure $schemaClosure, array $options): void
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        if (!$schema->hasTable('duplicatefinder_finfo')) {
            return;
        }

        $table = $schema->getTable('duplicatefinder_finfo');
        if (!$table->hasColumn('path_hash')) {
            return;
        }

        $db = $this->getConnection();
        $filled = $this->backfillEmptyPathHashes($db);
        $removed = $this->removeDuplicatePathHashRows($db);

        if ($filled > 0) {
            $output->info(sprintf('Populated %d missing path_hash values in duplicatefinder_finfo', $filled));
        }
        if ($removed > 0) {
            $output->info(sprintf('Removed %d duplicate path_hash rows from duplicatefinder_finfo', $removed));
        }
    }

    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array<mixed> $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        if (!$schema->hasTable('duplicatefinder_finfo')) {
            return null;
        }

        $table = $schema->getTable('duplicatefinder_finfo');
        if (!$table->hasColumn('path_hash')) {
            return null;
        }

        if ($table->hasIndex('duplicatefinder_ph_idx')) {
            $table->dropIndex('duplicatefinder_ph_idx');
        }

        if (!$this->hasUniquePathHashIndex($table)) {
            $table->addUniqueIndex(['path_hash'], 'duplicatefinder_ph_uniq_idx');
        }

        return $schema;
    }

    private function getConnection(): IDBConnection
    {
        if ($this->connection !== null) {
            return $this->connection;
        }

        return \OC::$server->get(IDBConnection::class);
    }

    /**
     * @param object $table Doctrine\DBAL\Schema\Table (NC <= 34) or OC\DB\Schema\Table (NC 35+)
     */
    private function hasUniquePathHashIndex(object $table): bool
    {
        if (method_exists($table, 'hasIndex') && $table->hasIndex('duplicatefinder_ph_uniq_idx')) {
            return true;
        }

        if (!method_exists($table, 'getIndexes')) {
            return false;
        }

        foreach ($table->getIndexes() as $index) {
            if (!method_exists($index, 'getColumns') || !method_exists($index, 'isUnique')) {
                continue;
            }
            $columns = array_map('strtolower', $index->getColumns());
            if ($index->isUnique() && $columns === ['path_hash']) {
                return true;
            }
        }

        return false;
    }

    private function backfillEmptyPathHashes(IDBConnection $db): int
    {
        $filled = 0;

        while (true) {
            $qb = $db->getQueryBuilder();
            $qb->select('id', 'path')
                ->from('duplicatefinder_finfo')
                ->where($qb->expr()->orX(
                    $qb->expr()->isNull('path_hash'),
                    $qb->expr()->eq('path_hash', $qb->createNamedParameter(''))
                ))
                ->orderBy('id', 'ASC')
                ->setMaxResults(self::BATCH_SIZE);
            $result = $qb->executeQuery();
            $rows = $result->fetchAll();
            $result->closeCursor();

            if ($rows === []) {
                break;
            }

            $db->beginTransaction();

            try {
                foreach ($rows as $row) {
                    $update = $db->getQueryBuilder();
                    $update->update('duplicatefinder_finfo')
                        ->set('path_hash', $update->createNamedParameter(sha1((string)($row['path'] ?? ''))))
                        ->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], IQueryBuilder::PARAM_INT)))
                        ->executeStatement();
                    $filled++;
                }
                $db->commit();
            } catch (\Throwable $e) {
                $db->rollBack();

                throw $e;
            }

            if (count($rows) < self::BATCH_SIZE) {
                break;
            }
        }

        return $filled;
    }

    private function removeDuplicatePathHashRows(IDBConnection $db): int
    {
        $removed = 0;

        while (true) {
            $qb = $db->getQueryBuilder();
            $qb->select('path_hash')
                ->from('duplicatefinder_finfo')
                ->where($qb->expr()->isNotNull('path_hash'))
                ->andWhere($qb->expr()->neq('path_hash', $qb->createNamedParameter('')))
                ->groupBy('path_hash')
                ->having($qb->createFunction('COUNT(*) > 1'))
                ->setMaxResults(self::BATCH_SIZE);
            $result = $qb->executeQuery();
            $hashes = array_map('strval', $result->fetchAll(\PDO::FETCH_COLUMN));
            $result->closeCursor();

            if ($hashes === []) {
                break;
            }

            $rowsQb = $db->getQueryBuilder();
            $rowsQb->select('id', 'path_hash', 'file_hash')
                ->from('duplicatefinder_finfo')
                ->where($rowsQb->expr()->in('path_hash', $rowsQb->createNamedParameter($hashes, IQueryBuilder::PARAM_STR_ARRAY)))
                ->orderBy('id', 'ASC');
            $rowsResult = $rowsQb->executeQuery();
            $rows = $rowsResult->fetchAll();
            $rowsResult->closeCursor();

            $keepByHash = [];
            $idsByHash = [];
            foreach ($rows as $row) {
                $hash = (string)$row['path_hash'];
                $id = (int)$row['id'];
                $hasFileHash = isset($row['file_hash']) && $row['file_hash'] !== '';
                $idsByHash[$hash][] = $id;
                if (!isset($keepByHash[$hash])) {
                    $keepByHash[$hash] = ['id' => $id, 'hasFileHash' => $hasFileHash];
                } elseif (!$keepByHash[$hash]['hasFileHash'] && $hasFileHash) {
                    $keepByHash[$hash] = ['id' => $id, 'hasFileHash' => true];
                }
            }

            $surplusIds = [];
            foreach ($idsByHash as $hash => $ids) {
                $keepId = $keepByHash[$hash]['id'];
                foreach ($ids as $id) {
                    if ($id !== $keepId) {
                        $surplusIds[] = $id;
                    }
                }
            }

            if ($surplusIds === []) {
                break;
            }

            foreach (array_chunk($surplusIds, self::BATCH_SIZE) as $chunk) {
                $delQb = $db->getQueryBuilder();
                $delQb->delete('duplicatefinder_finfo')
                    ->where($delQb->expr()->in('id', $delQb->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
                $removed += $delQb->executeStatement();
            }
        }

        return $removed;
    }
}
