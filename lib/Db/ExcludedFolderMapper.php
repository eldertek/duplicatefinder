<?php

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\QBMapper;
use OCP\IDBConnection;
use OCP\AppFramework\Db\DoesNotExistException;
use Psr\Log\LoggerInterface;

class ExcludedFolderMapper extends QBMapper {
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
    public function findAllForUser(string $userId): array {
        $this->logger->debug('Finding all excluded folders for user: {userId}', ['userId' => $userId]);
        
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->orderBy('folder_path', 'ASC');

        $entities = $this->findEntities($qb);
        $this->logger->debug('Found {count} excluded folders', [
            'count' => count($entities),
            'userId' => $userId,
            'paths' => array_map(fn($e) => $e->getFolderPath(), $entities)
        ]);
        return $entities;
    }

    /**
     * Find a specific excluded folder by ID and user ID
     * @param int $id
     * @param string $userId
     * @return ExcludedFolder
     * @throws DoesNotExistException if the folder was not found
     */
    public function findByIdAndUser(int $id, string $userId): ExcludedFolder {
        $this->logger->debug('Finding excluded folder by ID and user', [
            'id' => $id,
            'userId' => $userId
        ]);
        
        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('id', $qb->createNamedParameter($id)))
           ->andWhere($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        try {
            $entity = $this->findEntity($qb);
            $this->logger->debug('Found excluded folder', [
                'id' => $id,
                'path' => $entity->getFolderPath()
            ]);
            return $entity;
        } catch (DoesNotExistException $e) {
            $this->logger->debug('Excluded folder not found', [
                'id' => $id,
                'userId' => $userId
            ]);
            throw $e;
        }
    }

    /**
     * @param string $userId
     * @param string $path
     * @return bool
     */
    public function isFolderExcluded(string $userId, string $path): bool {
        $qb = $this->db->getQueryBuilder();
        
        $qb->select('id')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->andWhere($qb->expr()->eq('folder_path', $qb->createNamedParameter($path)));

        $result = $qb->executeQuery();
        $exists = $result->fetch();
        $result->closeCursor();

        return $exists !== false;
    }

    /**
     * @param string $userId
     * @param string $path
     * @return bool
     */
    public function isPathInExcludedFolder(string $userId, string $path): bool {
        $this->logger->debug('Checking if path is in excluded folder', [
            'path' => $path,
            'userId' => $userId
        ]);
        
        // Remove /userId/files prefix from path for comparison
        $normalizedPath = preg_replace('#^/' . preg_quote($userId) . '/files#', '', $path);
        $normalizedPath = '/' . trim($normalizedPath, '/') . '/';
        
        $this->logger->debug('Normalized path for comparison', [
            'original' => $path,
            'normalized' => $normalizedPath
        ]);
        
        $qb = $this->db->getQueryBuilder();
        $qb->select('folder_path')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        $result = $qb->executeQuery();
        $excludedFolders = $result->fetchAll();
        $result->closeCursor();

        $this->logger->debug('Found {count} excluded folders to check against', [
            'count' => count($excludedFolders),
            'folders' => array_column($excludedFolders, 'folder_path')
        ]);

        foreach ($excludedFolders as $folder) {
            $excludedPath = '/' . trim($folder['folder_path'], '/') . '/';
            $this->logger->debug('Comparing paths', [
                'normalizedPath' => $normalizedPath,
                'excludedPath' => $excludedPath,
                'isMatch' => str_starts_with($normalizedPath, $excludedPath) ? 'true' : 'false'
            ]);
            if (str_starts_with($normalizedPath, $excludedPath)) {
                $this->logger->debug('Path is in excluded folder', [
                    'path' => $path,
                    'excludedFolder' => $folder['folder_path']
                ]);
                return true;
            }
        }

        $this->logger->debug('Path is not in any excluded folder', ['path' => $path]);
        return false;
    }
} 