<?php

namespace OCA\DuplicateFinder\Db;

use OCP\DB\QueryBuilder\ICompositeExpression;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\FileInfo as NodeInfo;
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
     * Rows for several paths at once, e.g. the files of one folder. Like find(), the row of the given user is preferred,
     * but any row of the path is returned when that user has none: the owner stored in a row is the owner of the file,
     * which is not the scanning user for a file reached through a share (#198).
     *
     * @param array<string> $paths
     * @return array<string, FileInfo> indexed by path
     */
    public function findByPaths(array $paths, string $userID): array
    {
        $result = [];
        foreach (array_chunk(array_values(array_unique($paths)), 500) as $chunk) {
            $qb = $this->db->getQueryBuilder();
            $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->in('path_hash', $qb->createNamedParameter(array_map('sha1', $chunk), IQueryBuilder::PARAM_STR_ARRAY))
            );
            foreach ($this->findEntities($qb) as $entity) {
                $path = $entity->getPath();
                // Same pick as find(): the row of the user first, then the first row of the path
                if (!isset($result[$path]) || ($entity->getOwner() === $userID && $result[$path]->getOwner() !== $userID)) {
                    $result[$path] = $entity;
                }
            }
        }

        return $result;
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

    /**
     * Number of files of the given size. Folder rows stored by earlier versions are left out.
     */
    public function countBySize(int $size): int
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('id'))
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq('size', $qb->createNamedParameter($size, IQueryBuilder::PARAM_INT)),
            $this->isNotFolder($qb)
        );
        $result = $qb->executeQuery();
        $count = (int)$result->fetchOne();
        $result->closeCursor();

        return $count;
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
            $qb->expr()->eq('size', $qb->createNamedParameter($size, IQueryBuilder::PARAM_INT)),
            $this->isNotFolder($qb)
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
     * Folders cannot be duplicates and are never hashed: keep them out of the size lookups
     */
    private function isNotFolder(IQueryBuilder $qb): ICompositeExpression
    {
        return $qb->expr()->orX(
            $qb->expr()->isNull('mimetype'),
            $qb->expr()->neq('mimetype', $qb->createNamedParameter(NodeInfo::MIMETYPE_FOLDER))
        );
    }

    /**
     * The next rows of the table in id order, after a given id: lets a caller walk the whole table without ever
     * holding it in memory (issue 182).
     *
     * @return array<FileInfo>
     */
    public function findBatch(int $afterId, int $limit): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->gt('id', $qb->createNamedParameter($afterId, IQueryBuilder::PARAM_INT)))
            ->orderBy('id', 'ASC')
            ->setMaxResults(max(1, $limit));

        return $this->findEntities($qb);
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
     * A file seen through a share has a row whose path is in the recipient's tree (/bob/files/...) while its owner
     * is the user who shared it (alice). That view does not use extra disk space, so list-all leaves it out unless
     * asked to include it (issue 197). Rows without an owner (group folders, legacy rows) are kept.
     */
    private function isNotSharedView(IQueryBuilder $qb): ICompositeExpression
    {
        return $qb->expr()->orX(
            $qb->expr()->isNull('owner'),
            $qb->expr()->eq('owner', $qb->createNamedParameter('')),
            $qb->expr()->like(
                'path',
                $qb->func()->concat(
                    $qb->createNamedParameter('/'),
                    'owner',
                    $qb->createNamedParameter('/%')
                )
            )
        );
    }

    /**
     * Groups of files that share a content hash, whoever owns them, biggest waste first (read only). Only the
     * indexed rows are used: nothing is scanned or hashed here. Ignored files and files without a hash are left
     * out, and so are empty files (they all share one hash and waste no space).
     *
     * @param int $minSize Only the files of at least this size (bytes) are grouped
     * @param int $limit How many groups at most, 0 for no limit
     * @param bool $includeShared Whether to include shared views of files in other users' trees (issue 197)
     * @return \Generator<array{hash: string, size: int, copies: int, wasted: int}>
     */
    public function findDuplicateGroupsAcrossUsers(int $minSize = 0, int $limit = 0, bool $includeShared = false): \Generator
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('file_hash')
            ->selectAlias($qb->createFunction('MAX(size)'), 'group_size')
            ->selectAlias($qb->createFunction('COUNT(*)'), 'copies')
            ->selectAlias($qb->createFunction('(COUNT(*) - 1) * MAX(size)'), 'wasted')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('ignored', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL)))
            ->andWhere($qb->expr()->isNotNull('file_hash'))
            ->andWhere($qb->expr()->neq('file_hash', $qb->createNamedParameter('')))
            ->andWhere($qb->expr()->gte('size', $qb->createNamedParameter(max(1, $minSize), IQueryBuilder::PARAM_INT)));
        if (!$includeShared) {
            $qb->andWhere($this->isNotSharedView($qb));
        }
        $qb->groupBy('file_hash')
            ->having($qb->createFunction('COUNT(*) > 1'))
            ->orderBy('wasted', 'DESC')
            ->addOrderBy('file_hash', 'ASC');
        if ($limit > 0) {
            $qb->setMaxResults($limit);
        }

        // one query read row by row: paging with an offset would run the whole grouping again for every page
        $result = $qb->executeQuery();

        try {
            while ($row = $result->fetch()) {
                yield [
                    'hash' => (string)$row['file_hash'],
                    'size' => (int)$row['group_size'],
                    'copies' => (int)$row['copies'],
                    'wasted' => (int)$row['wasted'],
                ];
            }
        } finally {
            $result->closeCursor();
        }
    }

    /**
     * Owner and path of every indexed copy of the given hashes (read only), grouped by hash.
     *
     * @param array<string> $hashes
     * @param bool $includeShared Whether to include shared views of files in other users' trees (issue 197)
     * @return array<string, array<array{owner: string, path: string}>>
     */
    public function findCopiesOfHashes(array $hashes, bool $includeShared = false): array
    {
        $copies = [];
        foreach (array_chunk(array_values(array_unique($hashes)), 500) as $chunk) {
            $qb = $this->db->getQueryBuilder();
            $qb->select('file_hash', 'owner', 'path')
                ->from($this->getTableName())
                ->where($qb->expr()->in('file_hash', $qb->createNamedParameter($chunk, IQueryBuilder::PARAM_STR_ARRAY)))
                ->andWhere($qb->expr()->eq('ignored', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL)));
            if (!$includeShared) {
                $qb->andWhere($this->isNotSharedView($qb));
            }
            $qb->orderBy('file_hash', 'ASC')
                ->addOrderBy('owner', 'ASC')
                ->addOrderBy('path', 'ASC');
            $result = $qb->executeQuery();
            while ($row = $result->fetch()) {
                $copies[(string)$row['file_hash']][] = [
                    'owner' => (string)($row['owner'] ?? ''),
                    'path' => (string)$row['path'],
                ];
            }
            $result->closeCursor();
        }

        return $copies;
    }

    /**
     * The users that own at least one indexed file (read only).
     *
     * @return array<string>
     */
    public function findOwners(): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->selectDistinct('owner')
            ->from($this->getTableName())
            ->where($qb->expr()->isNotNull('owner'));
        $result = $qb->executeQuery();
        $owners = array_map('strval', $result->fetchAll(\PDO::FETCH_COLUMN));
        $result->closeCursor();

        return $owners;
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
