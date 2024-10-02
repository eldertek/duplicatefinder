<?php

namespace OCA\DuplicateFinder\Db;

use OCP\IDBConnection;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\ILogger;
use Doctrine\DBAL\Platforms\PostgreSQL94Platform;
use Doctrine\DBAL\Platforms\PostgreSQL100Platform;

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
        $qb->select('d.id as id', 'd.type', 'd.hash', 'd.acknowledged')
            ->from($this->getTableName(), 'd');

        if ($limit !== null) {
            $qb->setMaxResults($limit); // Set the limit of rows to fetch
        }
        if ($offset !== null) {
            $qb->setFirstResult($offset); // Set the offset to start fetching rows
        }

        if ($orderBy !== null) {
            foreach ($orderBy as $order) {
                $qb->addOrderBy($order[0], isset($order[1]) ? $order[1] : null);
            }
            unset($order);
        }

        // Handle PostgreSQL-specific SQL syntax issues
        if ($this->db->getDatabasePlatform() instanceof PostgreSQL94Platform ||
            $this->db->getDatabasePlatform() instanceof PostgreSQL100Platform) {
            $qb->addSelect('pg_column_size(d.hash) as hash_size');
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
     */
    public function unmarkAcknowledged(string $hash): bool
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
        $result = $qb->execute();
        $row = $result->fetch();
        $result->closeCursor();

        // Return the count result as an integer
        return (int) ($row ? $row['total_count'] : 0);
    }

    /**
     * Handle byte sequences for UTF8 encoding.
     *
     * @param string $input The input string.
     * @return string The sanitized string.
     */
    public function handleUTF8ByteSequences(string $input): string
    {
        return mb_convert_encoding($input, 'UTF-8', 'UTF-8');
    }
}
