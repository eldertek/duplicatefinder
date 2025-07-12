<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;

class OriginFolderMapper extends QBMapper
{
    public function __construct(IDBConnection $db)
    {
        parent::__construct($db, 'duplicatefinder_of', OriginFolder::class);
    }

    /**
     * @param int $id
     * @return OriginFolder
     * @throws DoesNotExistException if not found
     */
    public function find(int $id): OriginFolder
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
     * @param string $userId
     * @return array
     */
    public function findAll(string $userId): array
    {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from($this->getTableName())
           ->where(
               $qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR))
           )
           ->orderBy('created_at', 'DESC');

        return $this->findEntities($qb);
    }

    /**
     * @param string $userId
     * @param string $folderPath
     * @return OriginFolder
     * @throws DoesNotExistException
     */
    public function findByPath(string $userId, string $folderPath): OriginFolder
    {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from($this->getTableName())
           ->where(
               $qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR))
           )
           ->andWhere(
               $qb->expr()->eq('folder_path', $qb->createNamedParameter($folderPath, IQueryBuilder::PARAM_STR))
           );

        return $this->findEntity($qb);
    }

    /**
     * @param string $userId
     * @param string $folderPath
     * @return bool
     */
    public function exists(string $userId, string $folderPath): bool
    {
        try {
            $this->findByPath($userId, $folderPath);

            return true;
        } catch (DoesNotExistException $e) {
            return false;
        }
    }
}
