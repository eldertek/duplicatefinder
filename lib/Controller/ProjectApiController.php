<?php

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class ProjectApiController extends Controller
{
    private ProjectService $projectService;
    private FileDuplicateService $fileDuplicateService;
    private IUserSession $userSession;
    private LoggerInterface $logger;

    public function __construct(
        IRequest $request,
        ProjectService $projectService,
        FileDuplicateService $fileDuplicateService,
        IUserSession $userSession,
        LoggerInterface $logger
    ) {
        parent::__construct(Application::ID, $request);
        $this->projectService = $projectService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->userSession = $userSession;
        $this->logger = $logger;
    }

    /**
     * Get the current user ID
     *
     * @return string|null The user ID or null if not logged in
     */
    private function getUserId(): ?string
    {
        $user = $this->userSession->getUser();

        return $user ? $user->getUID() : null;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): DataResponse
    {
        try {
            $projects = $this->projectService->findAll();

            return new DataResponse($projects);
        } catch (\Exception $e) {
            $this->logger->error('Error fetching projects: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return new DataResponse(['error' => $e->getMessage()], 500);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function show(int $id): DataResponse
    {
        try {
            $project = $this->projectService->find($id);

            return new DataResponse($project);
        } catch (\Exception $e) {
            $this->logger->error('Error fetching project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return new DataResponse(['error' => $e->getMessage()], 404);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function create(string $name, array $folders): DataResponse
    {
        try {
            $project = $this->projectService->create($name, $folders);

            return new DataResponse($project);
        } catch (\Exception $e) {
            $this->logger->error('Error creating project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return new DataResponse(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function update(int $id, string $name, array $folders): DataResponse
    {
        try {
            $project = $this->projectService->update($id, $name, $folders);

            return new DataResponse($project);
        } catch (\Exception $e) {
            $this->logger->error('Error updating project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return new DataResponse(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function destroy(int $id): DataResponse
    {
        try {
            $this->projectService->delete($id);

            return new DataResponse(['status' => 'success']);
        } catch (\Exception $e) {
            $this->logger->error('Error deleting project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
            ]);

            return new DataResponse(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function scan(int $id): DataResponse
    {
        try {
            $this->logger->debug('Starting scan for project ID: ' . $id, [
                'app' => Application::ID,
                'userId' => $this->getUserId(),
            ]);

            $this->projectService->scan($id);

            $this->logger->debug('Scan completed successfully for project ID: ' . $id, [
                'app' => Application::ID,
            ]);

            return new DataResponse(['status' => 'success']);
        } catch (\Exception $e) {
            $this->logger->error('Error scanning project: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
                'trace' => $e->getTraceAsString(),
            ]);

            return new DataResponse(['error' => $e->getMessage()], 400);
        }
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function duplicates(int $id, string $type = 'all', int $page = 1, int $limit = 50): DataResponse
    {
        try {
            $this->logger->debug('Fetching duplicates for project ID: ' . $id, [
                'app' => Application::ID,
                'userId' => $this->getUserId(),
                'type' => $type,
                'page' => $page,
                'limit' => $limit,
            ]);

            $result = $this->projectService->getDuplicates($id, $type, $page, $limit);

            $this->logger->debug('Got duplicates result from service', [
                'app' => Application::ID,
                'entityCount' => count($result['entities']),
                'pagination' => $result['pagination'],
            ]);

            // Enrich the duplicates with file information
            $duplicates = $result['entities'];
            $enrichedDuplicates = [];

            $this->logger->debug('Starting enrichment of ' . count($duplicates) . ' duplicates', [
                'app' => Application::ID,
            ]);

            foreach ($duplicates as $duplicate) {
                $this->logger->debug('Enriching duplicate', [
                    'app' => Application::ID,
                    'duplicateId' => $duplicate->getId(),
                    'hash' => $duplicate->getHash(),
                ]);

                $enrichedDuplicate = $this->fileDuplicateService->enrich($duplicate);
                $fileCount = count($enrichedDuplicate->getFiles());

                $this->logger->debug('Duplicate enriched', [
                    'app' => Application::ID,
                    'duplicateId' => $enrichedDuplicate->getId(),
                    'fileCount' => $fileCount,
                ]);

                if ($fileCount > 1) {
                    $enrichedDuplicates[] = $enrichedDuplicate;
                } else {
                    $this->logger->debug('Skipping duplicate with less than 2 files', [
                        'app' => Application::ID,
                        'duplicateId' => $enrichedDuplicate->getId(),
                        'fileCount' => $fileCount,
                    ]);
                }
            }

            $this->logger->debug('Returning ' . count($enrichedDuplicates) . ' enriched duplicates', [
                'app' => Application::ID,
            ]);

            return new DataResponse([
                'entities' => $enrichedDuplicates,
                'pagination' => $result['pagination'],
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Error fetching project duplicates: ' . $e->getMessage(), [
                'app' => Application::ID,
                'exception' => $e,
                'trace' => $e->getTraceAsString(),
            ]);

            return new DataResponse(['error' => $e->getMessage()], 400);
        }
    }
}
