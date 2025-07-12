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
        $this->logger->debug('Finding file by path', [
            'path' => $path,
            'userID' => $userID,
        ]);

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

        $this->logger->debug('Found files by path', [
            'path' => $path,
            'count' => count($entities),
        ]);

        if ($entities) {
            if (is_null($userID)) {
                $this->logger->debug('Returning first file found', [
                    'path' => $path,
                    'id' => $entities[0]->getId(),
                    'hash' => $entities[0]->getFileHash(),
                    'ignored' => $entities[0]->isIgnored() ? 'true' : 'false',
                ]);

                return $entities[0];
            }
            foreach ($entities as $entity) {
                if ($entity->getOwner() === $userID) {
                    $this->logger->debug('Found file for user', [
                        'path' => $path,
                        'userID' => $userID,
                        'id' => $entity->getId(),
                        'hash' => $entity->getFileHash(),
                        'ignored' => $entity->isIgnored() ? 'true' : 'false',
                    ]);

                    return $entity;
                }
            }
            unset($entity);
        }

        $this->logger->debug('File not found', [
            'path' => $path,
            'userID' => $userID,
        ]);

        throw new \OCP\AppFramework\Db\DoesNotExistException('FileInfo not found');
    }

    /**
     * @return array<FileInfo>
     */
    public function findByHash(string $hash, string $type = 'file_hash'): array
    {
        $this->logger->debug('Finding files by hash', [
            'hash' => $hash,
            'type' => $type,
        ]);

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
        ->from($this->getTableName())
        ->where(
            $qb->expr()->eq($type, $qb->createNamedParameter($hash)),
            $qb->expr()->eq('ignored', $qb->createNamedParameter(false, IQueryBuilder::PARAM_BOOL))
        );

        $entities = $this->findEntities($qb);

        $this->logger->debug('Found files by hash', [
            'hash' => $hash,
            'count' => count($entities),
            'ignored' => false,
        ]);

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
