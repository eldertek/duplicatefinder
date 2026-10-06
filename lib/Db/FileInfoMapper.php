<?php

namespace OCA\DuplicateFinder\Db;

use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

/**
 * @extends EQBMapper<FileInfo>
 */
class FileInfoMapper extends EQBMapper
{
    private $logger;

    public function __construct(IDBConnection $db, LoggerInterface $logger)
    {
        parent::__construct($db, 'duplicatefinder_finfo', FileInfo::class);
        $this->logger = $logger;
    }

    /**
     * @throws \OCP\AppFramework\Db\DoesNotExistException
     */
    public function find(string $path, ?string $userID = null): FileInfo
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq('path_hash', $qb->createNamedParameter(sha1($path)))
        );
        if (!is_null($userID)) {
            $qb->andWhere($qb->expr()->eq('owner', $qb->createNamedParameter($userID)));
        }
        $entities = $this->findEntities($qb);

        if ($entities) {
            if (is_null($userID)) {
                return $entities[0];
            }
            foreach ($entities as $entity) {
                if ($entity->getOwner() === $userID) {
                    return $entity;
                }
            }
            unset($entity);
        }

        throw new \OCP\AppFramework\Db\DoesNotExistException('FileInfo not found');
    }

    /**
     * @return array<FileInfo>
     */
    public function findByHash(string $hash, string $type = 'file_hash'): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq($type, $qb->createNamedParameter($hash)),
            $qb->expr()->eq('ignored', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL))
        );

        $entities = $this->findEntities($qb);

        return $this->entitiesToIdArray($entities);
    }

    public function countByHash(string $hash, string $type = 'file_hash'): int
    {
        return $this->countBy($type, $hash);
    }

    public function countBySize(int $size): int
    {
        return $this->countBy('size', $size, IQueryBuilder::PARAM_INT);
    }

    /**
     * @return array<FileInfo>
     */
    public function findBySize(int $size, bool $onlyEmptyHash = true): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq('size', $qb->createNamedParameter($size, IQueryBuilder::PARAM_INT))
        );
        if ($onlyEmptyHash) {
            $qb->andWhere($qb->expr()->isNull('file_hash'));
        }

        return $this->entitiesToIdArray($this->findEntities($qb));
    }

    public function findById(int $id): FileInfo
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT))
        );

        return $this->findEntity($qb);
    }

    /**
     * @return array<FileInfo>
     */
    public function findAll(): array
    {
        $this->logger->debug('Finding all files');

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
           ->from($this->getTableName());

        $entities = $this->findEntities($qb);

        $this->logger->debug('Found all files', [
            'count' => count($entities),
            'ignoredCount' => count(array_filter($entities, function ($e) { return $e->isIgnored(); })),
        ]);

        return $entities;
    }

    /**
     * Highest id of the table, 0 when it is empty.
     */
    public function getMaxId(): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->max('id'))
            ->from($this->getTableName());
        $result = $qb->executeQuery();
        $maxId = (int)$result->fetchOne();
        $result->closeCursor();

        return $maxId;
    }

    /**
     * Give a path hash to the rows of an id window that have none (NULL or empty), computed the way
     * FileInfo::setPath() does it. Only the rows of the window are read, never the whole table (issue 182).
     *
     * @param int $afterId Only the rows with a greater id are looked at
     * @param int $untilId Only the rows up to this id (included) are looked at
     * @return int How many rows were given a path hash
     */
    public function repairPathHashes(int $afterId, int $untilId): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('id', 'path')
            ->from($this->getTableName())
            ->where($qb->expr()->gt('id', $qb->createNamedParameter($afterId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->lte('id', $qb->createNamedParameter($untilId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->orX(
                $qb->expr()->isNull('path_hash'),
                $qb->expr()->eq('path_hash', $qb->createNamedParameter(''))
            ));
        $result = $qb->executeQuery();
        $rows = $result->fetchAll();
        $result->closeCursor();
        if ($rows === []) {
            return 0;
        }

        $this->db->beginTransaction();

        try {
            foreach ($rows as $row) {
                $update = $this->db->getQueryBuilder();
                $update->update($this->getTableName())
                    ->set('path_hash', $update->createNamedParameter(sha1((string)$row['path'])))
                    ->where($update->expr()->eq('id', $update->createNamedParameter((int)$row['id'], IQueryBuilder::PARAM_INT)));
                $update->executeStatement();
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();

            throw $e;
        }

        return count($rows);
    }

    /**
     * Delete the surplus rows of an id window: the rows whose path hash and owner are already held by a row with a
     * lower id, so that the oldest row of each file stays (nothing prevents several rows from sharing a path and an
     * owner, and concurrent events used to insert the same file twice). A missing owner counts as an empty one, and
     * rows without a path hash are left alone.
     *
     * The window bounds the work of the query (the rows of the window and, for each of them, one look at the index of
     * path hashes), so that the table is never loaded in memory and no statement runs for long (issue 182).
     *
     * Deleting the row is all that FileInfoService::delete() does for it: the entity has no relational field and the
     * table of the old links between a group and its files (duplicatefinder_dups_f) is no longer written by this app,
     * so the service is not called for each row.
     *
     * @param int $afterId Only the rows with a greater id are looked at
     * @param int $untilId Only the rows up to this id (included) are looked at
     * @param int $batchSize Rows deleted by one statement
     * @return int How many rows were deleted
     */
    public function removeSurplusRows(int $afterId, int $untilId, int $batchSize = 1000): int
    {
        $older = $this->db->getQueryBuilder();
        $older->select('k.id')
            ->from($this->getTableName(), 'k')
            ->where($older->expr()->eq('k.path_hash', 'd.path_hash'))
            ->andWhere($older->expr()->eq(
                $older->createFunction('COALESCE(' . $older->getColumnName('owner', 'k') . ", '')"),
                $older->createFunction('COALESCE(' . $older->getColumnName('owner', 'd') . ", '')")
            ))
            ->andWhere($older->expr()->lt('k.id', 'd.id'));

        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id')
            ->from($this->getTableName(), 'd')
            ->where($qb->expr()->gt('d.id', $qb->createNamedParameter($afterId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->lte('d.id', $qb->createNamedParameter($untilId, IQueryBuilder::PARAM_INT)))
            ->andWhere($qb->expr()->neq('d.path_hash', $qb->createNamedParameter('')))
            ->andWhere($qb->createFunction('EXISTS (' . $older->getSQL() . ')'))
            ->orderBy('d.id', 'ASC');
        $result = $qb->executeQuery();
        $ids = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        $removed = 0;
        foreach (array_chunk($ids, max(1, $batchSize)) as $chunk) {
            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('id', $delete->createNamedParameter($chunk, IQueryBuilder::PARAM_INT_ARRAY)));
            $removed += $delete->executeStatement();
        }

        return $removed;
    }

    /**
     * @param array<FileInfo> $entities
     * @return array<FileInfo>
     */
    private function entitiesToIdArray(array $entities): array
    {
        $result = [];
        foreach ($entities as $entity) {
            $result[$entity->getId()] = $entity;
        }
        unset($entity);

        return $result;
    }
}
