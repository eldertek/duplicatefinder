<?php

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\Entity;
use OCP\DB\QueryBuilder\ICompositeExpression;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

/**
 * @extends EQBMapper<FileDuplicate>
 */
class FileDuplicateMapper extends EQBMapper
{
    /** @var LoggerInterface */
    private $logger;

    public function __construct(IDBConnection $db, LoggerInterface $logger)
    {
        parent::__construct($db, 'duplicatefinder_dups', FileDuplicate::class);
        $this->logger = $logger;
    }

    public function find(string $hash, string $type = 'file_hash'): FileDuplicate
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('hash', $qb->createNamedParameter($hash)),
                $qb->expr()->eq('type', $qb->createNamedParameter($type))
            );

        return $this->findEntity($qb);
    }

    /**
     * Like find(), but tolerant of pre-existing hash/type collisions:
     * caps the query at one row db-side so it never throws
     * MultipleObjectsReturnedException.
     */
    public function findFirst(string $hash, string $type = 'file_hash'): FileDuplicate
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('hash', $qb->createNamedParameter($hash)),
                $qb->expr()->eq('type', $qb->createNamedParameter($type))
            )
            ->orderBy('id', 'ASC')
            ->setMaxResults(1);

        return $this->findEntity($qb);
    }

    /**
     * Delete every row of a hash/type pair, whatever their number.
     *
     * @return int The number of rows deleted
     */
    public function deleteByHash(string $hash, string $type = 'file_hash'): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->delete($this->getTableName())
            ->where($qb->expr()->eq('hash', $qb->createNamedParameter($hash)))
            ->andWhere($qb->expr()->eq('type', $qb->createNamedParameter($type)));

        return $qb->executeStatement();
    }

    /**
     * Delete the surplus rows of every hash/type pair that has several rows, keeping the oldest row of each pair
     * (issue 178 left several rows for one hash). The rows are walked in id order from $afterId, by small batches:
     * the table is never loaded in memory, there is neither one statement per pair nor one transaction for the
     * whole table, and every row is looked at once. It stops once the time budget is spent and says where it
     * stopped, so that the next call goes on from there. Rows without a type are left alone.
     *
     * @param float $timeBudget Seconds after which no further batch is started
     * @param int $afterId Only the rows with a greater id are looked at
     * @param int $batchSize Rows deleted by one statement
     * @return array{removed: int, lastId: int, finished: bool} How many rows were deleted, the last id deleted
     *         (the place to go on from) and whether the end of the table was reached
     */
    public function mergeSurplusRows(float $timeBudget = 20.0, int $afterId = 0, int $batchSize = 1000): array
    {
        $deadline = microtime(true) + $timeBudget;
        $removed = 0;
        $lastId = $afterId;

        while (true) {
            $older = $this->db->getQueryBuilder();
            $older->select('k.id')
                ->from($this->getTableName(), 'k')
                ->where($older->expr()->eq('k.hash', 'd.hash'))
                ->andWhere($older->expr()->eq('k.type', 'd.type'))
                ->andWhere($older->expr()->lt('k.id', 'd.id'));

            $qb = $this->db->getQueryBuilder();
            $qb->select('d.id')
                ->from($this->getTableName(), 'd')
                ->where($qb->expr()->gt('d.id', $qb->createNamedParameter($lastId, IQueryBuilder::PARAM_INT)))
                ->andWhere($qb->createFunction('EXISTS (' . $older->getSQL() . ')'))
                ->orderBy('d.id', 'ASC')
                ->setMaxResults($batchSize);
            $result = $qb->executeQuery();
            $ids = array_map('intval', $result->fetchAll(\PDO::FETCH_COLUMN));
            $result->closeCursor();
            if ($ids === []) {
                return ['removed' => $removed, 'lastId' => $lastId, 'finished' => true];
            }

            $delete = $this->db->getQueryBuilder();
            $delete->delete($this->getTableName())
                ->where($delete->expr()->in('id', $delete->createNamedParameter($ids, IQueryBuilder::PARAM_INT_ARRAY)));
            $removed += $delete->executeStatement();
            $lastId = max($ids);

            if (microtime(true) >= $deadline) {
                return ['removed' => $removed, 'lastId' => $lastId, 'finished' => false];
            }
        }
    }

    /**
     * @param string|null $user
     * @param int|null $limit
     * @param int|null $offset
     * @param array<array<string>> $orderBy
     * @param string|null $type
     * @param int $minSize Minimum file size in bytes (0 disables filtering)
     * @return array<FileDuplicate>
     */
    public function findAll(
        ?string $user = null,
        ?int $limit = null,
        ?int $offset = null,
        ?array $orderBy = [['hash'], ['type']],
        ?string $type = null,
        int $minSize = 0
    ): array {
        $sortsBySize = false;
        if ($orderBy !== null) {
            foreach ($orderBy as $order) {
                if (($order[0] ?? '') === 'size') {
                    $sortsBySize = true;

                    break;
                }
            }
            unset($order);
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id as id', 'd.type', 'd.hash', 'd.acknowledged')
            ->from($this->getTableName(), 'd');

        if ($sortsBySize) {
            $qb->innerJoin(
                'd',
                'duplicatefinder_finfo',
                'f',
                $qb->expr()->eq('f.file_hash', 'd.hash')
            );
            $this->applyTypeFilter($qb, $type);
            $qb->andWhere($qb->expr()->eq('f.ignored', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
            if ($minSize > 0) {
                $qb->andWhere($qb->expr()->gte('f.size', $qb->createNamedParameter($minSize, IQueryBuilder::PARAM_INT)));
            }
            if ($user !== null && $user !== '') {
                $qb->andWhere($this->buildUserFileAccessPredicate($qb, $qb, $user));
            }
            $qb->groupBy('d.id', 'd.type', 'd.hash', 'd.acknowledged')
                ->having($qb->createFunction('COUNT(*) > 1'));
        } else {
            $this->applyFilters($qb, $type, $user, $minSize);
        }

        if ($limit !== null) {
            $qb->setMaxResults($limit);
        }
        if ($offset !== null) {
            $qb->setFirstResult($offset);
        }

        if ($orderBy !== null) {
            foreach ($orderBy as $order) {
                $column = $order[0];
                $direction = isset($order[1]) ? $order[1] : null;
                if ($column === 'size') {
                    $normalizedDir = $direction !== null && strtoupper($direction) === 'ASC' ? 'ASC' : 'DESC';
                    $qb->addOrderBy($qb->func()->sum('f.size'), $normalizedDir);
                } else {
                    $qualifiedColumn = $sortsBySize && strpos($column, '.') === false ? 'd.' . $column : $column;
                    $qb->addOrderBy($qualifiedColumn, $direction);
                }
            }
            unset($order);
            if ($sortsBySize) {
                $qb->addOrderBy('d.id', 'ASC');
            }
        }

        return $this->findEntities($qb);
    }

    public function clear(?string $table = null): void
    {
        parent::clear($this->getTableName() . '_f');
        parent::clear();
    }
    /**
     * Marks the specified duplicate as acknowledged.
     *
     * @param string $hash The hash of the duplicate to acknowledge.
     * @return bool True if successful, false otherwise.
     */
    public function markAsAcknowledged(string $hash): bool
    {
        $qb = $this->db->getQueryBuilder();

        try {
            $qb->update($this->getTableName())
                ->set('acknowledged', $qb->createNamedParameter(true, IQueryBuilder::PARAM_BOOL))
                ->where($qb->expr()->eq('hash', $qb->createNamedParameter($hash)))
                ->executeStatement();

            return true;
        } catch (\Exception $e) {
            $this->logger->error($e->getMessage());

            return false;
        }
    }


    /**
     * Removes the acknowledged status from the specified duplicate.
     *
     * @param string $hash The hash of the duplicate to unacknowledge.
     * @return bool True if successful, false otherwise.
     */
    public function unmarkAcknowledged(string $hash): bool
    {
        $qb = $this->db->getQueryBuilder();

        try {
            $qb->update($this->getTableName())
                ->set('acknowledged', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL))
                ->where($qb->expr()->eq('hash', $qb->createNamedParameter($hash)))
                ->executeStatement();

            return true;
        } catch (\Exception $e) {
            $this->logger->error($e->getMessage());

            return false;
        }
    }

    /**
     * Gets the total count of duplicates based on the type.
     *
     * @param string $type The type of duplicates to count.
     * @param string|null $user Optional user ID to filter duplicates by.
     * @param int $minSize Minimum file size in bytes (0 disables filtering).
     * @return int The total count of duplicates.
     */
    public function getTotalCount(string $type = 'unacknowledged', ?string $user = null, int $minSize = 0): int
    {
        $qb = $this->db->getQueryBuilder();

        // Start with a basic SELECT COUNT query
        $qb->select($qb->func()->count('*', 'total_count'))
            ->from($this->getTableName(), 'd');

        $this->applyFilters($qb, $type, $user, $minSize);

        // Execute the query and fetch the result
        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        // Return the count result as an integer
        return (int) ($row ? $row['total_count'] : 0);
    }

    private function applyTypeFilter(IQueryBuilder $qb, ?string $type): void
    {
        if ($type === 'acknowledged') {
            $qb->andWhere($qb->expr()->eq('d.acknowledged', $qb->createNamedParameter(true, IQueryBuilder::PARAM_BOOL)));
        } elseif ($type === 'unacknowledged') {
            $qb->andWhere($qb->expr()->eq('d.acknowledged', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL)));
        }
    }

    private function buildUserFileAccessPredicate(
        IQueryBuilder $exprOwner,
        IQueryBuilder $paramOwner,
        string $user
    ): ICompositeExpression {
        $escapedUser = $this->db->escapeLikeParameter($user);
        if ($escapedUser === '') {
            $escapedUser = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $user);
        }

        return $exprOwner->expr()->orX(
            $exprOwner->expr()->like(
                'f.path',
                $paramOwner->createNamedParameter('/' . $escapedUser . '/%')
            ),
            $exprOwner->expr()->andX(
                $exprOwner->expr()->eq('f.owner', $paramOwner->createNamedParameter($user)),
                $exprOwner->expr()->notLike(
                    'f.path',
                    $paramOwner->createNamedParameter('/%/files/%')
                )
            )
        );
    }

    private function applyFilters(IQueryBuilder $qb, ?string $type, ?string $user, int $minSize = 0): void
    {
        $this->applyTypeFilter($qb, $type);

        $hasUserFilter = $user !== null && $user !== '';
        if ($hasUserFilter || $minSize > 0) {
            $subQuery = $this->db->getQueryBuilder();
            $subQuery->select($subQuery->createFunction('1'))
                ->from('duplicatefinder_finfo', 'f')
                ->where($subQuery->expr()->eq('f.file_hash', 'd.hash'))
                ->andWhere($subQuery->expr()->eq('f.ignored', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
            if ($minSize > 0) {
                $subQuery->andWhere($subQuery->expr()->gte('f.size', $qb->createNamedParameter($minSize, IQueryBuilder::PARAM_INT)));
            }
            if ($hasUserFilter) {
                $subQuery->andWhere($this->buildUserFileAccessPredicate($subQuery, $qb, (string)$user));
            }
            $subQuery->groupBy('f.file_hash')
                ->having($subQuery->createFunction('COUNT(*) > 1'));

            $qb->andWhere($qb->createFunction('EXISTS (' . $subQuery->getSQL() . ')'));
        }
    }

    public function insert(Entity $entity): Entity
    {
        // Ensure type is set before inserting
        if ($entity instanceof FileDuplicate && ($entity->getType() === null || $entity->getType() === '')) {
            $entity->setType('file_hash');
            $this->logger->warning('Setting default type for duplicate before insert', [
                'hash' => $entity->getHash(),
            ]);
        }

        try {
            return parent::insert($entity);
        } catch (\Exception $e) {
            $this->logger->error('Failed to insert duplicate', [
                'hash' => $entity->getHash(),
                'type' => $entity->getType(),
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function update(Entity $entity): Entity
    {
        // Ensure type is set before updating
        if ($entity instanceof FileDuplicate && ($entity->getType() === null || $entity->getType() === '')) {
            $entity->setType('file_hash');
            $this->logger->warning('Setting default type for duplicate before update', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
            ]);
        }

        try {
            return parent::update($entity);
        } catch (\Exception $e) {
            $this->logger->error('Failed to update duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
                'type' => $entity->getType(),
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public function delete(Entity $entity): Entity
    {
        try {
            return parent::delete($entity);
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Execute a custom query to find duplicates with files in specific folders
     *
     * @param string $userId The user ID
     * @return array Array of duplicate data (id, hash, type)
     */
    public function findDuplicatesWithFiles(string $userId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id', 'd.hash', 'd.type')
           ->from($this->getTableName(), 'd')
           ->innerJoin(
               'd',
               'duplicatefinder_finfo',
               'f',
               $qb->expr()->andX(
                   $qb->expr()->eq('f.file_hash', 'd.hash'),
                   $qb->expr()->eq('f.owner', $qb->createNamedParameter($userId, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
               )
           );

        $result = $qb->executeQuery();
        $duplicates = [];

        while ($row = $result->fetch()) {
            $duplicates[] = $row;
        }
        $result->closeCursor();

        return $duplicates;
    }

    /**
     * Find files with a specific hash
     *
     * @param string $hash The file hash
     * @param string $userId The user ID
     * @return array Array of file paths and sizes
     */
    public function findFilesByHash(string $hash, string $userId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('f.id', 'f.path', 'f.size', 'f.updated_at')
           ->from('duplicatefinder_finfo', 'f')
           ->where(
               $qb->expr()->eq('f.file_hash', $qb->createNamedParameter($hash, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
           )
           ->andWhere(
               $qb->expr()->eq('f.owner', $qb->createNamedParameter($userId, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
           );

        $result = $qb->executeQuery();
        $files = [];

        while ($row = $result->fetch()) {
            $files[] = [
                'id' => (int)$row['id'],
                'path' => $row['path'],
                'size' => $row['size'] ?? 0,
                'updated_at' => $row['updated_at'] ?? time(),
            ];
        }
        $result->closeCursor();

        return $files;
    }

    /**
     * Find duplicates by IDs
     *
     * @param array $ids Array of duplicate IDs
     * @param string $type The type of duplicates to get ('all', 'acknowledged', 'unacknowledged')
     * @param int $limit The maximum number of duplicates to return
     * @param int $offset The offset for pagination
     * @return array Array of FileDuplicate objects
     */
    public function findByIds(array $ids, string $type = 'all', int $limit = 50, int $offset = 0): array
    {
        if (empty($ids)) {
            return [];
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
           ->from($this->getTableName())
           ->where(
               $qb->expr()->in('id', $qb->createNamedParameter($ids, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT_ARRAY))
           );

        // Filter by acknowledgement status
        if ($type === 'acknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(1, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        } elseif ($type === 'unacknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        }

        // Add pagination
        $qb->setFirstResult($offset)
           ->setMaxResults($limit);

        return $this->findEntities($qb);
    }

    /**
     * Count duplicates by IDs
     *
     * @param array $ids Array of duplicate IDs
     * @param string $type The type of duplicates to count ('all', 'acknowledged', 'unacknowledged')
     * @return int The count of duplicates
     */
    public function countByIds(array $ids, string $type = 'all'): int
    {
        if (empty($ids)) {
            return 0;
        }

        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->createFunction('COUNT(*)'))
           ->from($this->getTableName())
           ->where(
               $qb->expr()->in('id', $qb->createNamedParameter($ids, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT_ARRAY))
           );

        // Filter by acknowledgement status
        if ($type === 'acknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(1, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        } elseif ($type === 'unacknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        }

        $result = $qb->executeQuery();
        $count = (int)$result->fetchOne();
        $result->closeCursor();

        return $count;
    }
}
