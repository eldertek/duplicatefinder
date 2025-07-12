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
        $this->logger->debug('Finding all excluded folders for user', [
            'userId' => $userId,
        ]);

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)));

        try {
            $results = $this->findEntities($qb);
            $this->logger->debug('Found excluded folders', [
                'userId' => $userId,
                'count' => count($results),
                'query' => $qb->getSQL(),
                'params' => json_encode($qb->getParameters()),
            ]);

            return $results;
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
        $this->logger->debug('Finding excluded folder by ID and user', [
            'id' => $id,
            'userId' => $userId,
        ]);

        $qb = $this->db->getQueryBuilder();
        $qb->select('*')
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq('id', $qb->createNamedParameter($id)),
                $qb->expr()->eq('user_id', $qb->createNamedParameter($userId))
            );

        try {
            $result = $this->findEntity($qb);
            $this->logger->debug('Found excluded folder', [
                'id' => $result->getId(),
                'path' => $result->getFolderPath(),
                'userId' => $result->getUserId(),
            ]);

            return $result;
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
        $this->logger->debug('Checking if folder is directly excluded', [
            'path' => $path,
            'userId' => $userId,
        ]);

        $qb = $this->db->getQueryBuilder();

        $qb->select('id')
           ->from($this->getTableName())
           ->where($qb->expr()->eq('user_id', $qb->createNamedParameter($userId)))
           ->andWhere($qb->expr()->eq('folder_path', $qb->createNamedParameter($path)));

        $result = $qb->executeQuery();
        $exists = $result->fetch();
        $result->closeCursor();

        $this->logger->debug('Folder exclusion check result', [
            'path' => $path,
            'isExcluded' => $exists !== false ? 'true' : 'false',
        ]);

        return $exists !== false;
    }

    /**
     * @param string $userId
     * @param string $path
     * @return bool
     */
    public function isPathInExcludedFolder(string $userId, string $path): bool
    {
        $this->logger->debug('Checking if path is in excluded folder', [
            'userId' => $userId,
            'path' => $path,
        ]);

        $normalizedPath = '/' . trim($path, '/');
        $this->logger->debug('Normalized path for comparison', [
            'original' => $path,
            'normalized' => $normalizedPath,
        ]);

        $excludedFolders = $this->findAllForUser($userId);
        $this->logger->debug('Found excluded folders to check against', [
            'count' => count($excludedFolders),
            'folders' => array_map(fn ($f) => $f->getFolderPath(), $excludedFolders),
        ]);

        foreach ($excludedFolders as $folder) {
            $excludedPath = '/' . trim($folder->getFolderPath(), '/');
            $this->logger->debug('Comparing paths', [
                'filePath' => $normalizedPath,
                'excludedPath' => $excludedPath,
                'isSubPath' => str_starts_with($normalizedPath, $excludedPath),
            ]);

            if (str_starts_with($normalizedPath, $excludedPath)) {
                $this->logger->debug('Path is in excluded folder', [
                    'path' => $path,
                    'excludedFolder' => $excludedPath,
                ]);

                return true;
            }
        }

        $this->logger->debug('Path is not in any excluded folder', [
            'path' => $path,
            'checkedFolders' => count($excludedFolders),
        ]);

        return false;
    }
}
