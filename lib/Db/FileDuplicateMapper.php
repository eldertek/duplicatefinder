<?php

namespace OCA\DuplicateFinder\Db;

use OCP\IDBConnection;
use OCP\DB\QueryBuilder\IQueryBuilder;
use Psr\Log\LoggerInterface;
use OCP\AppFramework\Db\Entity;

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
        $this->logger->debug('Finding duplicate by hash', [
            'hash' => $hash,
            'type' => $type
        ]);

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('hash', $qb->createNamedParameter($hash)),
                $qb->expr()->eq('type', $qb->createNamedParameter($type))
            );

        try {
            $duplicate = $this->findEntity($qb);
            $this->logger->debug('Found duplicate', [
                'hash' => $hash,
                'id' => $duplicate->getId(),
                'fileCount' => count($duplicate->getFiles())
            ]);
            return $duplicate;
        } catch (\Exception $e) {
            $this->logger->debug('No duplicate found', [
                'hash' => $hash,
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    /**
     * @param string|null $user
     * @param int|null $limit
     * @param int|null $offset
     * @param array<array<string>> $orderBy
     * @return array<FileDuplicate>
     */
    public function findAll(
        ?string $user = null,
        ?int $limit = null,
        ?int $offset = null,
        ?array $orderBy = [['hash'], ['type']]
    ): array {
        $this->logger->debug('Starting findAll duplicates query', [
            'user' => $user,
            'limit' => $limit,
            'offset' => $offset,
            'orderBy' => json_encode($orderBy)
        ]);

        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id as id', 'd.type', 'd.hash', 'd.acknowledged')
            ->from($this->getTableName(), 'd');

        if ($limit !== null) {
            $qb->setMaxResults($limit);
        }
        if ($offset !== null) {
            $qb->setFirstResult($offset);
        }

        if ($orderBy !== null) {
            foreach ($orderBy as $order) {
                $qb->addOrderBy($order[0], isset($order[1]) ? $order[1] : null);
            }
            unset($order);
        }

        $duplicates = $this->findEntities($qb);

        $this->logger->debug('Found duplicates in database', [
            'totalCount' => count($duplicates),
            'acknowledgedCount' => count(array_filter($duplicates, function($d) { return $d->getAcknowledged(); })),
            'query' => $qb->getSQL(),
            'params' => json_encode($qb->getParameters())
        ]);

        return $duplicates;
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
     * @return int The total count of duplicates.
     */
    public function getTotalCount(string $type = 'unacknowledged'): int
    {
        $qb = $this->db->getQueryBuilder();

        // Start with a basic SELECT COUNT query
        $qb->select($qb->func()->count('*', 'total_count'))
            ->from($this->getTableName());

        // Add conditions based on the type
        if ($type === 'acknowledged') {
            $qb->where($qb->expr()->eq('acknowledged', $qb->createNamedParameter(true, IQueryBuilder::PARAM_BOOL)));
        } elseif ($type === 'unacknowledged') {
            $qb->where($qb->expr()->eq('acknowledged', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL)));
        } // No condition needed for 'all', as we want to count all rows

        // Execute the query and fetch the result
        $result = $qb->executeQuery();
        $row = $result->fetch();
        $result->closeCursor();

        // Return the count result as an integer
        return (int) ($row ? $row['total_count'] : 0);
    }

    public function insert(Entity $entity): Entity
    {
        // Ensure type is set before inserting
        if ($entity instanceof FileDuplicate && ($entity->getType() === null || $entity->getType() === '')) {
            $entity->setType('file_hash');
            $this->logger->warning('Setting default type for duplicate before insert', [
                'hash' => $entity->getHash()
            ]);
        }

        $this->logger->debug('Inserting new duplicate', [
            'hash' => $entity->getHash(),
            'type' => $entity->getType(),
            'fileCount' => count($entity->getFiles())
        ]);

        try {
            $result = parent::insert($entity);
            $this->logger->debug('Successfully inserted duplicate', [
                'id' => $result->getId(),
                'hash' => $result->getHash(),
                'type' => $result->getType()
            ]);
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to insert duplicate', [
                'hash' => $entity->getHash(),
                'type' => $entity->getType(),
                'error' => $e->getMessage()
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
                'hash' => $entity->getHash()
            ]);
        }

        $this->logger->debug('Updating duplicate', [
            'id' => $entity->getId(),
            'hash' => $entity->getHash(),
            'type' => $entity->getType(),
            'fileCount' => count($entity->getFiles())
        ]);

        try {
            $result = parent::update($entity);
            $this->logger->debug('Successfully updated duplicate', [
                'id' => $result->getId(),
                'hash' => $result->getHash(),
                'type' => $result->getType()
            ]);
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to update duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
                'type' => $entity->getType(),
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    public function delete(Entity $entity): Entity
    {
        $this->logger->debug('Deleting duplicate', [
            'id' => $entity->getId(),
            'hash' => $entity->getHash()
        ]);

        try {
            $result = parent::delete($entity);
            $this->logger->debug('Successfully deleted duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash()
            ]);
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to delete duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
                'error' => $e->getMessage()
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
    public function findDuplicatesWithFiles(string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id', 'd.hash', 'd.type')
           ->from($this->getTableName(), 'd')
           ->innerJoin('d', 'duplicatefinder_finfo', 'f',
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
     * @return array Array of file paths
     */
    public function findFilesByHash(string $hash, string $userId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('f.path')
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
            $files[] = $row['path'];
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
    public function findByIds(array $ids, string $type = 'all', int $limit = 50, int $offset = 0): array {
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
    public function countByIds(array $ids, string $type = 'all'): int {
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
