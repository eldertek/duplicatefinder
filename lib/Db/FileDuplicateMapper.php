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
        $this->logger->debug('Inserting new duplicate', [
            'hash' => $entity->getHash(),
            'type' => $entity->getType(),
            'fileCount' => count($entity->getFiles())
        ]);

        try {
            $result = parent::insert($entity);
            $this->logger->debug('Successfully inserted duplicate', [
                'id' => $result->getId(),
                'hash' => $result->getHash()
            ]);
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to insert duplicate', [
                'hash' => $entity->getHash(),
                'error' => $e->getMessage()
            ]);
            throw $e;
        }
    }

    public function update(Entity $entity): Entity
    {
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
                'hash' => $result->getHash()
            ]);
            return $result;
        } catch (\Exception $e) {
            $this->logger->error('Failed to update duplicate', [
                'id' => $entity->getId(),
                'hash' => $entity->getHash(),
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
}
