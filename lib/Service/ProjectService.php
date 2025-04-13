<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class ProjectService {
    private ProjectMapper $mapper;
    private FileDuplicateMapper $duplicateMapper;
    private IRootFolder $rootFolder;
    private string $userId;
    private LoggerInterface $logger;
    private FileInfoService $fileInfoService;

    public function __construct(
        ProjectMapper $mapper,
        FileDuplicateMapper $duplicateMapper,
        IRootFolder $rootFolder,
        FileInfoService $fileInfoService,
        ?string $userId,
        LoggerInterface $logger
    ) {
        $this->mapper = $mapper;
        $this->duplicateMapper = $duplicateMapper;
        $this->rootFolder = $rootFolder;
        $this->fileInfoService = $fileInfoService;
        $this->userId = $userId ?? '';
        $this->logger = $logger;
    }

    /**
     * Set the user ID for the service
     * 
     * @param string $userId The user ID
     */
    public function setUserId(string $userId): void {
        $this->userId = $userId;
    }

    /**
     * Validate that a user context is available
     * 
     * @throws \RuntimeException if no user context is available
     */
    private function validateUserContext(): void {
        if (empty($this->userId)) {
            throw new \RuntimeException('User context required for this operation');
        }
    }

    /**
     * Find all projects for the current user
     * 
     * @return array Array of Project objects with folders loaded
     */
    public function findAll(): array {
        $this->validateUserContext();
        $projects = $this->mapper->findAll($this->userId);
        
        // Load folders for each project
        foreach ($projects as $project) {
            $folders = $this->mapper->getFolders($project->getId());
            $project->setFolders($folders);
        }
        
        return $projects;
    }

    /**
     * Find a project by ID
     * 
     * @param int $id The project ID
     * @return Project The project with folders loaded
     * @throws DoesNotExistException if not found
     */
    public function find(int $id): Project {
        $this->validateUserContext();
        $project = $this->mapper->find($id, $this->userId);
        
        // Load folders
        $folders = $this->mapper->getFolders($project->getId());
        $project->setFolders($folders);
        
        return $project;
    }

    /**
     * Create a new project
     * 
     * @param string $name The project name
     * @param array $folderPaths Array of folder paths
     * @return Project The created project
     * @throws NotFoundException if a folder doesn't exist
     */
    public function create(string $name, array $folderPaths): Project {
        $this->validateUserContext();
        $this->logger->debug('Creating project: {name} with folders: {folders}', [
            'name' => $name,
            'folders' => implode(', ', $folderPaths)
        ]);
        
        // Verify that all folders exist
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        foreach ($folderPaths as $folderPath) {
            if (!$userFolder->nodeExists($folderPath)) {
                $this->logger->warning('Folder not found: {path}', ['path' => $folderPath]);
                throw new NotFoundException('Folder does not exist: ' . $folderPath);
            }
        }
        
        // Create the project
        $project = new Project();
        $project->setUserId($this->userId);
        $project->setName($name);
        $project->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));
        
        // Insert the project
        $project = $this->mapper->insert($project);
        
        // Add folders
        $this->mapper->addFolders($project->getId(), $folderPaths);
        $project->setFolders($folderPaths);
        
        $this->logger->info('Successfully created project: {name} with ID {id}', [
            'name' => $name,
            'id' => $project->getId()
        ]);
        
        return $project;
    }

    /**
     * Update a project
     * 
     * @param int $id The project ID
     * @param string $name The new project name
     * @param array $folderPaths Array of new folder paths
     * @return Project The updated project
     * @throws DoesNotExistException if the project doesn't exist
     * @throws NotFoundException if a folder doesn't exist
     */
    public function update(int $id, string $name, array $folderPaths): Project {
        $this->validateUserContext();
        
        // Get the project
        $project = $this->mapper->find($id, $this->userId);
        
        // Update the name
        $project->setName($name);
        $project = $this->mapper->update($project);
        
        // Verify that all folders exist
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        foreach ($folderPaths as $folderPath) {
            if (!$userFolder->nodeExists($folderPath)) {
                $this->logger->warning('Folder not found: {path}', ['path' => $folderPath]);
                throw new NotFoundException('Folder does not exist: ' . $folderPath);
            }
        }
        
        // Update folders
        $this->mapper->removeFolders($id);
        $this->mapper->addFolders($id, $folderPaths);
        $project->setFolders($folderPaths);
        
        return $project;
    }

    /**
     * Delete a project
     * 
     * @param int $id The project ID
     * @throws DoesNotExistException if the project doesn't exist
     */
    public function delete(int $id): void {
        $this->validateUserContext();
        
        // Get the project to verify it exists and belongs to the user
        $project = $this->mapper->find($id, $this->userId);
        
        // Delete the project (folders and duplicates will be deleted by foreign key constraints)
        $this->mapper->delete($project);
    }

    /**
     * Run a scan for a project
     * 
     * @param int $id The project ID
     * @throws DoesNotExistException if the project doesn't exist
     */
    public function scan(int $id): void {
        $this->validateUserContext();
        
        // Get the project
        $project = $this->find($id);
        $folders = $project->getFolders();
        
        $this->logger->info('Starting scan for project: {name} (ID: {id})', [
            'name' => $project->getName(),
            'id' => $id
        ]);
        
        // Clear existing duplicates for this project
        $this->mapper->removeDuplicates($id);
        
        // Scan each folder
        foreach ($folders as $folderPath) {
            $this->logger->debug('Scanning folder: {path} for project {id}', [
                'path' => $folderPath,
                'id' => $id
            ]);
            
            try {
                // Scan the folder
                $this->fileInfoService->scanFiles($this->userId, $folderPath);
            } catch (Exception $e) {
                $this->logger->error('Error scanning folder {path}: {error}', [
                    'path' => $folderPath,
                    'error' => $e->getMessage(),
                    'exception' => $e
                ]);
            }
        }
        
        // Find duplicates that are in the scanned folders
        $this->findProjectDuplicates($id, $folders);
        
        // Update the last scan time
        $this->mapper->updateLastScan($id, (new DateTime())->format('Y-m-d H:i:s'));
        
        $this->logger->info('Completed scan for project: {name} (ID: {id})', [
            'name' => $project->getName(),
            'id' => $id
        ]);
    }

    /**
     * Find duplicates for a project based on the scanned folders
     * 
     * @param int $projectId The project ID
     * @param array $folderPaths The folder paths to check
     */
    private function findProjectDuplicates(int $projectId, array $folderPaths): void {
        $this->logger->debug('Finding duplicates for project {id} in folders: {folders}', [
            'id' => $projectId,
            'folders' => implode(', ', $folderPaths)
        ]);
        
        // Get all duplicates
        $qb = $this->duplicateMapper->getQueryBuilder();
        $qb->select('d.id', 'd.hash', 'd.type')
           ->from('duplicatefinder_dups', 'd')
           ->innerJoin('d', 'duplicatefinder_files', 'f', 
                $qb->expr()->andX(
                    $qb->expr()->eq('f.file_hash', 'd.hash'),
                    $qb->expr()->eq('f.user_id', $qb->createNamedParameter($this->userId, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
                )
           );
        
        $result = $qb->execute();
        $duplicateIds = [];
        
        while ($row = $result->fetch()) {
            $duplicateId = (int)$row['id'];
            $hash = $row['hash'];
            
            // Get all files with this hash
            $filesQb = $this->duplicateMapper->getQueryBuilder();
            $filesQb->select('f.path')
                   ->from('duplicatefinder_files', 'f')
                   ->where(
                       $filesQb->expr()->eq('f.file_hash', $filesQb->createNamedParameter($hash, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
                   )
                   ->andWhere(
                       $filesQb->expr()->eq('f.user_id', $filesQb->createNamedParameter($this->userId, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_STR))
                   );
            
            $filesResult = $filesQb->execute();
            $filesInProject = false;
            $filesCount = 0;
            $filesInProjectCount = 0;
            
            while ($fileRow = $filesResult->fetch()) {
                $filesCount++;
                $filePath = $fileRow['path'];
                
                // Check if this file is in one of the project folders
                foreach ($folderPaths as $folderPath) {
                    if (strpos($filePath, $folderPath) === 0) {
                        $filesInProject = true;
                        $filesInProjectCount++;
                        break;
                    }
                }
            }
            $filesResult->closeCursor();
            
            // Only add duplicates that have at least 2 files in the project folders
            if ($filesInProject && $filesInProjectCount >= 2) {
                $duplicateIds[] = $duplicateId;
            }
        }
        $result->closeCursor();
        
        // Add the duplicates to the project
        foreach ($duplicateIds as $duplicateId) {
            $this->mapper->addDuplicate($projectId, $duplicateId);
        }
        
        $this->logger->debug('Found {count} duplicates for project {id}', [
            'count' => count($duplicateIds),
            'id' => $projectId
        ]);
    }

    /**
     * Get duplicates for a project
     * 
     * @param int $projectId The project ID
     * @param string $type The type of duplicates to get ('all', 'acknowledged', 'unacknowledged')
     * @param int $page The page number
     * @param int $limit The number of duplicates per page
     * @return array The duplicates and pagination info
     */
    public function getDuplicates(int $projectId, string $type = 'all', int $page = 1, int $limit = 50): array {
        $this->validateUserContext();
        
        // Get the duplicate IDs for this project
        $duplicateIds = $this->mapper->getDuplicateIds($projectId);
        
        if (empty($duplicateIds)) {
            return [
                'entities' => [],
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => 0,
                    'totalItems' => 0
                ]
            ];
        }
        
        // Get the duplicates
        $qb = $this->duplicateMapper->getQueryBuilder();
        $qb->select('*')
           ->from('duplicatefinder_dups')
           ->where(
               $qb->expr()->in('id', $qb->createNamedParameter($duplicateIds, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT_ARRAY))
           );
        
        // Filter by acknowledgement status
        if ($type === 'acknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(1, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        } elseif ($type === 'unacknowledged') {
            $qb->andWhere($qb->expr()->eq('acknowledged', $qb->createNamedParameter(0, \OCP\DB\QueryBuilder\IQueryBuilder::PARAM_INT)));
        }
        
        // Count total items for pagination
        $countQb = clone $qb;
        $countQb->select($countQb->createFunction('COUNT(*)'));
        $totalItems = (int)$countQb->execute()->fetchColumn();
        $totalPages = ceil($totalItems / $limit);
        
        // Add pagination
        $qb->setFirstResult(($page - 1) * $limit)
           ->setMaxResults($limit);
        
        // Execute the query
        $result = $qb->execute();
        $duplicates = [];
        
        while ($row = $result->fetch()) {
            $duplicates[] = $this->duplicateMapper->mapRowToEntity($row);
        }
        $result->closeCursor();
        
        return [
            'entities' => $duplicates,
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems
            ]
        ];
    }
}
