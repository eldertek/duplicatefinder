<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use DateTime;
use Exception;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use Psr\Log\LoggerInterface;

class ProjectService
{
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
    public function setUserId(string $userId): void
    {
        $this->userId = $userId;
    }

    /**
     * Validate that a user context is available
     *
     * @throws \RuntimeException if no user context is available
     */
    private function validateUserContext(): void
    {
        if (empty($this->userId)) {
            throw new \RuntimeException('User context required for this operation');
        }
    }

    /**
     * Find all projects for the current user
     *
     * @return array Array of Project objects with folders loaded
     */
    public function findAll(): array
    {
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
    public function find(int $id): Project
    {
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
    public function create(string $name, array $folderPaths): Project
    {
        $this->validateUserContext();
        $normalizedFolders = $this->validateAndNormalizeFolderPaths($folderPaths);

        $this->logger->debug('Creating project: {name} with folders: {folders}', [
            'name' => $name,
            'folders' => implode(', ', $normalizedFolders),
        ]);

        // Verify that all folders exist
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        foreach ($normalizedFolders as $folderPath) {
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
        $this->mapper->addFolders($project->getId(), $normalizedFolders);
        $project->setFolders($normalizedFolders);

        $this->logger->info('Successfully created project: {name} with ID {id}', [
            'name' => $name,
            'id' => $project->getId(),
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
    public function update(int $id, string $name, array $folderPaths): Project
    {
        $this->validateUserContext();

        // Get the project
        $project = $this->mapper->find($id, $this->userId);

        // Validate and verify all folders exist before mutating the project
        $normalizedFolders = $this->validateAndNormalizeFolderPaths($folderPaths);
        $userFolder = $this->rootFolder->getUserFolder($this->userId);
        foreach ($normalizedFolders as $folderPath) {
            if (!$userFolder->nodeExists($folderPath)) {
                $this->logger->warning('Folder not found: {path}', ['path' => $folderPath]);

                throw new NotFoundException('Folder does not exist: ' . $folderPath);
            }
        }

        // Update the name
        $project->setName($name);
        $project = $this->mapper->update($project);

        // Update folders
        $this->mapper->removeFolders($id);
        $this->mapper->addFolders($id, $normalizedFolders);
        $project->setFolders($normalizedFolders);

        return $project;
    }

    /**
     * Delete a project
     *
     * @param int $id The project ID
     * @throws DoesNotExistException if the project doesn't exist
     */
    public function delete(int $id): void
    {
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
    public function scan(int $id): void
    {
        $this->validateUserContext();

        // Get the project
        $project = $this->find($id);
        $folders = $project->getFolders();

        $this->logger->info('Starting scan for project: {name} (ID: {id})', [
            'name' => $project->getName(),
            'id' => $id,
        ]);

        // Clear existing duplicates for this project
        $this->mapper->removeDuplicates($id);

        // Scan each folder
        foreach ($folders as $folderPath) {
            $this->logger->debug('Scanning folder: {path} for project {id}', [
                'path' => $folderPath,
                'id' => $id,
            ]);

            try {
                // Scan the folder
                $this->fileInfoService->scanFiles($this->userId, $folderPath);
            } catch (Exception $e) {
                $this->logger->error('Error scanning folder {path}: {error}', [
                    'path' => $folderPath,
                    'error' => $e->getMessage(),
                    'exception' => $e,
                ]);
            }
        }

        // Find duplicates that are in the scanned folders
        $this->findProjectDuplicates($id, $folders);

        // Update the last scan time
        $this->mapper->updateLastScan($id, (new DateTime())->format('Y-m-d H:i:s'));

        $this->logger->info('Completed scan for project: {name} (ID: {id})', [
            'name' => $project->getName(),
            'id' => $id,
        ]);
    }

    /**
     * Find duplicates for a project based on the scanned folders
     *
     * @param int $projectId The project ID
     * @param array $folderPaths The folder paths to check
     */
    private function findProjectDuplicates(int $projectId, array $folderPaths): void
    {
        $this->logger->debug('Finding duplicates for project {id} in folders: {folders}', [
            'id' => $projectId,
            'folders' => implode(', ', $folderPaths),
        ]);

        // Get all duplicates
        $this->logger->debug('Finding duplicates with files for user', [
            'app' => 'duplicatefinder',
            'userId' => $this->userId,
        ]);

        $duplicates = $this->duplicateMapper->findDuplicatesWithFiles($this->userId);
        $this->logger->debug('Found duplicates with files', [
            'app' => 'duplicatefinder',
            'count' => count($duplicates),
        ]);

        $duplicateIds = [];

        foreach ($duplicates as $duplicate) {
            $duplicateId = (int)$duplicate['id'];
            $hash = $duplicate['hash'];

            $this->logger->debug('Processing duplicate', [
                'app' => 'duplicatefinder',
                'duplicateId' => $duplicateId,
                'hash' => $hash,
                'type' => $duplicate['type'],
            ]);

            // Get all files with this hash
            $filePaths = $this->duplicateMapper->findFilesByHash($hash, $this->userId);
            $this->logger->debug('Found files with hash', [
                'app' => 'duplicatefinder',
                'hash' => $hash,
                'fileCount' => count($filePaths),
                'files' => $filePaths,
            ]);

            $filesInProject = false;
            $filesInProjectCount = 0;
            $matchedFiles = [];

            $normalizedFolderPaths = [];
            foreach ($folderPaths as $folderPath) {
                if (!is_string($folderPath)) {
                    continue;
                }
                $norm = $this->normalizeFolderPath($folderPath);
                if ($norm !== null) {
                    $normalizedFolderPaths[] = $norm;
                }
            }

            foreach ($filePaths as $fileData) {
                // Get the file path from the data array
                $filePath = (string)$fileData['path'];
                $normalizedFilePath = $this->normalizeUserRelativeFilePath($filePath);

                // Check if this file is in one of the project folders with strict segment boundaries
                foreach ($normalizedFolderPaths as $normalizedFolderPath) {
                    if ($normalizedFolderPath === '/'
                        || $normalizedFilePath === $normalizedFolderPath
                        || str_starts_with($normalizedFilePath, $normalizedFolderPath . '/')) {
                        $filesInProject = true;
                        $filesInProjectCount++;
                        $matchedFiles[] = $filePath;

                        $this->logger->debug('File matched folder', [
                            'app' => 'duplicatefinder',
                            'filePath' => $filePath,
                            'folderPath' => $normalizedFolderPath,
                        ]);

                        break;
                    }
                }
            }

            $this->logger->debug('Files in project folders', [
                'app' => 'duplicatefinder',
                'hash' => $hash,
                'filesInProject' => $filesInProject ? 'true' : 'false',
                'filesInProjectCount' => $filesInProjectCount,
                'matchedFiles' => $matchedFiles,
            ]);

            // Only add duplicates that have at least 2 files in the project folders
            if ($filesInProject && $filesInProjectCount >= 2) {
                $duplicateIds[] = $duplicateId;
                $this->logger->debug('Added duplicate to results', [
                    'app' => 'duplicatefinder',
                    'duplicateId' => $duplicateId,
                    'hash' => $hash,
                    'filesInProjectCount' => $filesInProjectCount,
                ]);
            } else {
                $this->logger->debug('Skipped duplicate (not enough files in project)', [
                    'app' => 'duplicatefinder',
                    'duplicateId' => $duplicateId,
                    'hash' => $hash,
                    'filesInProjectCount' => $filesInProjectCount,
                ]);
            }
        }

        // Add the duplicates to the project
        foreach ($duplicateIds as $duplicateId) {
            $this->mapper->addDuplicate($projectId, $duplicateId);
        }

        $this->logger->debug('Found {count} duplicates for project {id}', [
            'count' => count($duplicateIds),
            'id' => $projectId,
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
    public function getDuplicates(int $projectId, string $type = 'all', int $page = 1, int $limit = 50): array
    {
        $this->validateUserContext();

        // Enforce project ownership before exposing project duplicates or pagination metadata
        $this->mapper->find($projectId, $this->userId);

        $safePage = max(1, $page);
        $safeLimit = max(1, $limit);

        $this->logger->debug('Getting duplicates for project', [
            'app' => 'duplicatefinder',
            'projectId' => $projectId,
            'type' => $type,
            'page' => $safePage,
            'limit' => $safeLimit,
            'userId' => $this->userId,
        ]);

        // Get the duplicate IDs for this project
        $duplicateIds = $this->mapper->getDuplicateIds($projectId);

        $this->logger->debug('Got duplicate IDs for project', [
            'app' => 'duplicatefinder',
            'projectId' => $projectId,
            'duplicateCount' => count($duplicateIds),
            'duplicateIds' => $duplicateIds,
        ]);

        if (empty($duplicateIds)) {
            return [
                'entities' => [],
                'pagination' => [
                    'currentPage' => $safePage,
                    'totalPages' => 0,
                    'totalItems' => 0,
                ],
            ];
        }

        // Get the duplicates with pagination
        $this->logger->debug('Counting duplicates by IDs', [
            'app' => 'duplicatefinder',
            'duplicateIdsCount' => count($duplicateIds),
            'type' => $type,
        ]);

        $totalItems = $this->duplicateMapper->countByIds($duplicateIds, $type);
        $totalPages = ceil($totalItems / $safeLimit);

        $this->logger->debug('Pagination info', [
            'app' => 'duplicatefinder',
            'totalItems' => $totalItems,
            'totalPages' => $totalPages,
            'currentPage' => $safePage,
            'limit' => $safeLimit,
        ]);

        // Get the duplicates for the current page
        $duplicates = $this->duplicateMapper->findByIds($duplicateIds, $type, $safeLimit, ($safePage - 1) * $safeLimit);

        // Load files for each duplicate
        foreach ($duplicates as $duplicate) {
            // Get files for this duplicate
            $fileData = $this->duplicateMapper->findFilesByHash($duplicate->getHash(), $this->userId);

            // Log file data for debugging
            $this->logger->debug('File data for duplicate', [
                'app' => 'duplicatefinder',
                'hash' => $duplicate->getHash(),
                'fileData' => $fileData,
            ]);

            // Create FileInfo objects for each file path
            $files = [];
            foreach ($fileData as $data) {
                $fileInfo = new FileInfo();
                $fileInfo->setId((int)$data['id']);
                $fileInfo->setPath($data['path']);
                $fileInfo->setFileHash($duplicate->getHash());
                $fileInfo->setOwner($this->userId);

                // Set additional properties from the database
                $size = (int)$data['size'];
                if ($size <= 0) {
                    // Try to get the real file size from the filesystem
                    try {
                        $userFolder = $this->rootFolder->getUserFolder($this->userId);
                        $relativePath = $this->normalizeUserRelativeFilePath((string)$data['path']);
                        if ($userFolder->nodeExists($relativePath)) {
                            $node = $userFolder->get($relativePath);
                            $size = $node->getSize();
                            $this->logger->debug('Got file size from filesystem', [
                                'app' => 'duplicatefinder',
                                'path' => $data['path'],
                                'relativePath' => $relativePath,
                                'size' => $size,
                            ]);
                        }
                    } catch (\Exception $e) {
                        $this->logger->debug('Error getting file size from filesystem', [
                            'app' => 'duplicatefinder',
                            'path' => $data['path'],
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
                $fileInfo->setSize($size);
                $fileInfo->setUpdatedAt((int)$data['updated_at']);
                $files[] = $fileInfo;
            }

            // Set the files to the duplicate
            $duplicate->setFiles($files);

            $this->logger->debug('Loaded files for duplicate', [
                'app' => 'duplicatefinder',
                'hash' => $duplicate->getHash(),
                'fileCount' => count($files),
            ]);
        }

        $this->logger->debug('Found duplicates for page', [
            'app' => 'duplicatefinder',
            'count' => count($duplicates),
            'page' => $safePage,
            'limit' => $safeLimit,
        ]);

        // Log details about each duplicate
        foreach ($duplicates as $index => $duplicate) {
            $this->logger->debug('Duplicate details', [
                'app' => 'duplicatefinder',
                'index' => $index,
                'id' => $duplicate->getId(),
                'hash' => $duplicate->getHash(),
                'type' => $duplicate->getType(),
                'acknowledged' => $duplicate->getAcknowledged() ? 'true' : 'false',
            ]);
        }

        return [
            'entities' => $duplicates,
            'pagination' => [
                'currentPage' => $safePage,
                'totalPages' => $totalPages,
                'totalItems' => $totalItems,
            ],
        ];
    }

    /**
     * @param array<mixed> $folderPaths
     * @return string[]
     */
    private function validateAndNormalizeFolderPaths(array $folderPaths): array
    {
        $normalized = [];
        foreach ($folderPaths as $folderPath) {
            if (!is_string($folderPath)) {
                throw new \InvalidArgumentException('Invalid project folder path');
            }
            $clean = $this->normalizeFolderPath($folderPath);
            if ($clean === null) {
                throw new \InvalidArgumentException('Invalid project folder path: ' . $folderPath);
            }
            $normalized[] = $clean;
        }

        return array_values(array_unique($normalized));
    }

    private function normalizeFolderPath(string $folderPath): ?string
    {
        if (str_contains($folderPath, "\0")) {
            return null;
        }
        $trimmed = str_replace('\\', '/', trim($folderPath));
        if ($trimmed === '') {
            return null;
        }
        if ($this->userId !== '') {
            $prefixPattern = '#^/' . preg_quote($this->userId, '#') . '/files(?=/|$)#';
            $trimmed = (string)preg_replace($prefixPattern, '', $trimmed);
        }

        $segments = [];
        foreach (explode('/', $trimmed) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                return null;
            }
            $segments[] = $segment;
        }

        return $segments === [] ? '/' : '/' . implode('/', $segments);
    }

    private function normalizeUserRelativeFilePath(string $filePath): string
    {
        $clean = str_replace('\\', '/', trim($filePath));
        $relative = preg_replace('#^/[^/]+/files(?=/|$)#', '', $clean);

        return '/' . trim((string)$relative, '/');
    }
}
