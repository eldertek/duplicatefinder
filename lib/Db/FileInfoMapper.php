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
