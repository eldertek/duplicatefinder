<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\ProjectApiController;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ProjectApiControllerTest extends TestCase
{
    private $controller;
    private $request;
    private $projectService;
    private $fileDuplicateService;
    private $userSession;
    private $logger;
    private $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->projectService = $this->createMock(ProjectService::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->user = $this->createMock(IUser::class);

        $this->user->method('getUID')->willReturn('testuser');
        $this->userSession->method('getUser')->willReturn($this->user);

        $this->controller = new ProjectApiController(
            $this->request,
            $this->projectService,
            $this->fileDuplicateService,
            $this->userSession,
            $this->logger
        );
    }

    public function testIndex()
    {
        // Create mock projects
        $project1 = new Project();
        $project1->setId(1);
        $project1->setName('Test Project 1');
        $project1->setUserId('testuser');
        $project1->setFolders(['/folder1', '/folder2']);

        $project2 = new Project();
        $project2->setId(2);
        $project2->setName('Test Project 2');
        $project2->setUserId('testuser');
        $project2->setFolders(['/folder3']);

        // Mock the findAll method to return our test projects
        $this->projectService->expects($this->once())
            ->method('findAll')
            ->willReturn([$project1, $project2]);

        // Call the index method
        $response = $this->controller->index();

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertCount(2, $data);
        $this->assertEquals('Test Project 1', $data[0]->getName());
        $this->assertEquals('Test Project 2', $data[1]->getName());
    }

    public function testCreate()
    {
        // Create a mock project
        $project = new Project();
        $project->setId(1);
        $project->setName('New Project');
        $project->setUserId('testuser');
        $project->setFolders(['/folder1', '/folder2']);

        // Mock the create method to return our test project
        $this->projectService->expects($this->once())
            ->method('create')
            ->with('New Project', ['folder1', 'folder2'])
            ->willReturn($project);

        // Call the create method
        $response = $this->controller->create('New Project', ['folder1', 'folder2']);

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('New Project', $data->getName());
        $this->assertEquals(['/folder1', '/folder2'], $data->getFolders());
    }

    public function testDestroy()
    {
        // Mock the delete method
        $this->projectService->expects($this->once())
            ->method('delete')
            ->with(1);

        // Call the destroy method
        $response = $this->controller->destroy(1);

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('success', $data['status']);
    }

    public function testScan()
    {
        // Mock the scan method
        $this->projectService->expects($this->once())
            ->method('scan')
            ->with(1);

        // Call the scan method
        $response = $this->controller->scan(1);

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('success', $data['status']);
    }

    public function testDuplicates()
    {
        // Mock the getDuplicates method
        $this->projectService->expects($this->once())
            ->method('getDuplicates')
            ->with(1, 'all', 1, 50)
            ->willReturn([
                'entities' => [],
                'pagination' => [
                    'totalItems' => 0,
                    'totalPages' => 0,
                    'currentPage' => 1
                ]
            ]);

        // Call the duplicates method
        $response = $this->controller->duplicates(1);

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertArrayHasKey('entities', $data);
        $this->assertArrayHasKey('pagination', $data);
    }
}
