<?php
namespace OCA\DuplicateFinder\Db;

use OCP\IDBConnection;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\ILogger;

/**
 * @extends EQBMapper<FileDuplicate>
 */
class FileDuplicateMapper extends EQBMapper
{
    /** @var ILogger */
    private $logger;

    public function __construct(IDBConnection $db, ILogger $logger)
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
        $qb = $this->db->getQueryBuilder();
        $qb->select('d.id as id', 'type', 'hash')
            ->from($this->getTableName(), 'd');
        if ($limit !== null) {
            $qb->setMaxResults($limit);
        }
        if ($offset !== null) {
            $qb->where($qb->expr()->gt('id', $qb->createNamedParameter($offset, IQueryBuilder::PARAM_INT)));
        }
        $qb->addOrderBy('id');
        if ($orderBy !== null) {
            foreach ($orderBy as $order) {
                $qb->addOrderBy($order[0], isset($order[1]) ? $order[1] : null);
            }
            unset($order);
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
        // Debug : notice
        $this->logger->notice('markAsAcknowledged() called with hash = ' . $hash);
        $qb = $this->db->getQueryBuilder();

        try {
            $qb->update($this->getTableName())
                ->set('acknowledged', $qb->createNamedParameter(true, IQueryBuilder::PARAM_BOOL))
                ->where($qb->expr()->eq('hash', $qb->createNamedParameter($hash)))
                ->execute();

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
     */public function unmarkAcknowledged(string $hash): bool
    {
        $qb = $this->db->getQueryBuilder();

        try {
            $qb->update($this->getTableName())
                ->set('acknowledged', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL))
                ->where($qb->expr()->eq('hash', $qb->createNamedParameter($hash)))
                ->execute();

            return true;
        } catch (\Exception $e) {
            $this->logger->error($e->getMessage());
            return false;
        }
    }

    /**
     * Retrieves all acknowledged duplicates.
     * 
     * @return array An array of FileDuplicate entities that have been acknowledged.
     */
    public function getAcknowledgedDuplicates(): array
    {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('acknowledged', $qb->createNamedParameter(true, IQueryBuilder::PARAM_BOOL)));

        $result = $qb->execute()->fetchAll();

        // Convert the result into an array of FileDuplicate entities
        $duplicates = [];
        foreach ($result as $row) {
            $duplicates[] = FileDuplicate::fromRow($row);
        }

        return $duplicates;
    }
}