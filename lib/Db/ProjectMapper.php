<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

class ProjectMapper extends QBMapper {
    private LoggerInterface $logger;
    
    public function __construct(IDBConnection $db, LoggerInterface $logger) {
        parent::__construct($db, 'df_projects', Project::class);
        $this->logger = $logger;
    }

    /**
     * Find a project by ID
     * 
     * @param int $id The project ID
     * @param string $userId The user ID
     * @return Project
     * @throws DoesNotExistException if not found
     */
    public function find(int $id, string $userId): Project {
        $qb = $this->db->getQueryBuilder();

        $qb->select('*')
           ->from($this->getTableName())
           ->where(
               $qb->expr()->eq('id', $qb->createNamedParameter($id, IQueryBuilder::PARAM_INT))
           )
           ->andWhere(
               $qb->expr()->eq('user_id', $qb->createNamedParameter($userId, IQueryBuilder::PARAM_STR))
           );

        return $this->findEntity($qb);
    }

    /**
     * Find all projects for a user
     * 
     * @param string $userId The user ID
     * @return array Array of Project objects
     */
    public function findAll(string $userId): array {
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
     * Add folders to a project
     * 
     * @param int $projectId The project ID
     * @param array $folderPaths Array of folder paths
     */
    public function addFolders(int $projectId, array $folderPaths): void {
        foreach ($folderPaths as $folderPath) {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('df_folders')
               ->values([
                   'project_id' => $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT),
                   'folder_path' => $qb->createNamedParameter($folderPath, IQueryBuilder::PARAM_STR),
               ])
               ->execute();
        }
    }

    /**
     * Get folders for a project
     * 
     * @param int $projectId The project ID
     * @return array Array of folder paths
     */
    public function getFolders(int $projectId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('folder_path')
           ->from('df_folders')
           ->where(
               $qb->expr()->eq('project_id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           );

        $result = $qb->execute();
        $folders = [];
        while ($row = $result->fetch()) {
            $folders[] = $row['folder_path'];
        }
        $result->closeCursor();

        return $folders;
    }

    /**
     * Remove all folders for a project
     * 
     * @param int $projectId The project ID
     */
    public function removeFolders(int $projectId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete('df_folders')
           ->where(
               $qb->expr()->eq('project_id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           )
           ->execute();
    }

    /**
     * Add a duplicate to a project
     * 
     * @param int $projectId The project ID
     * @param int $duplicateId The duplicate ID
     */
    public function addDuplicate(int $projectId, int $duplicateId): void {
        // Check if the duplicate is already associated with the project
        $qb = $this->db->getQueryBuilder();
        $qb->select('id')
           ->from('df_duplicates')
           ->where(
               $qb->expr()->eq('project_id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           )
           ->andWhere(
               $qb->expr()->eq('duplicate_id', $qb->createNamedParameter($duplicateId, IQueryBuilder::PARAM_INT))
           );
        
        $result = $qb->execute();
        $exists = $result->fetch();
        $result->closeCursor();
        
        if (!$exists) {
            $qb = $this->db->getQueryBuilder();
            $qb->insert('df_duplicates')
               ->values([
                   'project_id' => $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT),
                   'duplicate_id' => $qb->createNamedParameter($duplicateId, IQueryBuilder::PARAM_INT),
               ])
               ->execute();
        }
    }

    /**
     * Get duplicate IDs for a project
     * 
     * @param int $projectId The project ID
     * @return array Array of duplicate IDs
     */
    public function getDuplicateIds(int $projectId): array {
        $qb = $this->db->getQueryBuilder();
        $qb->select('duplicate_id')
           ->from('df_duplicates')
           ->where(
               $qb->expr()->eq('project_id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           );

        $result = $qb->execute();
        $duplicateIds = [];
        while ($row = $result->fetch()) {
            $duplicateIds[] = (int)$row['duplicate_id'];
        }
        $result->closeCursor();

        return $duplicateIds;
    }

    /**
     * Remove all duplicates for a project
     * 
     * @param int $projectId The project ID
     */
    public function removeDuplicates(int $projectId): void {
        $qb = $this->db->getQueryBuilder();
        $qb->delete('df_duplicates')
           ->where(
               $qb->expr()->eq('project_id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           )
           ->execute();
    }

    /**
     * Update the last scan time for a project
     * 
     * @param int $projectId The project ID
     * @param string $lastScan The last scan time in ISO format
     */
    public function updateLastScan(int $projectId, string $lastScan): void {
        $qb = $this->db->getQueryBuilder();
        $qb->update($this->getTableName())
           ->set('last_scan', $qb->createNamedParameter($lastScan, IQueryBuilder::PARAM_STR))
           ->where(
               $qb->expr()->eq('id', $qb->createNamedParameter($projectId, IQueryBuilder::PARAM_INT))
           )
           ->execute();
    }
}
