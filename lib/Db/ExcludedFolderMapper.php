<?php

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

class ExcludedFolderMapper extends QBMapper
{
    private LoggerInterface $logger;

    public function __construct(
        IDBConnection $db,
        LoggerInterface $logger
    ) {
        parent::__construct($db, 'df_excluded_folders', ExcludedFolder::class);
        $this->logger = $logger;
    }

    /**
     * @param string $userId
     * @return ExcludedFolder[]
     */
    public function findAllForUser(string $userId): array
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        try {
            return $this->findEntities($qb);
        } catch (\Exception $e) {
            $this->logger->error('Failed to find excluded folders', [
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * Find a specific excluded folder by ID and user ID
     * @param int $id
     * @param string $userId
     * @return ExcludedFolder
     * @throws DoesNotExistException if the folder was not found
     */
    public function findByIdAndUser(int $id, string $userId): ExcludedFolder
    {
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('id', $qb->createNamedParameter($id)),
                $qb->expr()->eq('user_id', $qb->createNamedParameter($userId))
            );

        try {
            return $this->findEntity($qb);
        } catch (\Exception $e) {
            $this->logger->error('Failed to find excluded folder', [
                'id' => $id,
                'userId' => $userId,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    /**
     * @param string $userId
     * @param string $path
     * @return bool
     */
    public function isFolderExcluded(string $userId, string $path): bool
    {
        $qb = $this->db->getQueryBuilder();

        $qb->select('id')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->andWhere($qb->expr()->eq('folder_path', $qb->createNamedParameter($path)));

        $result = $qb->executeQuery();
        $exists = $result->fetchAssociative();
        $result->closeCursor();

        return $exists !== false;
    }

    /**
     * @param string $userId
     * @param string $path
     * @return bool
     */
    public function isPathInExcludedFolder(string $userId, string $path): bool
    {
        $normalizedPath = '/' . trim($path, '/');

        $excludedFolders = $this->findAllForUser($userId);

        foreach ($excludedFolders as $folder) {
            $excludedPath = '/' . trim($folder->getFolderPath(), '/');

            if (str_starts_with($normalizedPath, $excludedPath)) {
                return true;
            }
        }

        return false;
    }
}
