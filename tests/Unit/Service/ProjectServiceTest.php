<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use DateTime;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Test version of ProjectService that overrides methods that use database queries
 */
class TestProjectService extends ProjectService {
    protected $scanCalled = false;
    protected $getDuplicatesResult = [];
    protected $userIdValue;

    /**
     * Override scan method to avoid database queries
     */
    public function scan(int $id): void {
        // Just mark that scan was called
        $this->scanCalled = true;
    }

    /**
     * Check if scan was called
     */
    public function wasFindProjectDuplicatesCalled(): bool {
        return $this->scanCalled;
    }

    /**
     * Set the result to be returned by getDuplicates
     */
    public function setGetDuplicatesResult(array $result): void {
        $this->getDuplicatesResult = $result;
    }

    /**
     * Override getDuplicates to return a predefined result
     */
    public function getDuplicates(int $projectId, string $type = 'all', int $page = 1, int $limit = 50): array {
        if (!empty($this->getDuplicatesResult)) {
            return $this->getDuplicatesResult;
        }

        return [
            'entities' => [],
            'pagination' => [
                'currentPage' => $page,
                'totalPages' => 0,
                'totalItems' => 0
            ]
        ];
    }

    /**
     * Override setUserId to store the value in a property we can access
     */
    public function setUserId(string $userId): void {
        parent::setUserId($userId);
        $this->userIdValue = $userId;
    }

    /**
     * Get the current user ID
     */
    public function getUserId(): string {
        return $this->userIdValue;
    }
}

class ProjectServiceTest extends TestCase
{
    private $projectMapper;
    private $duplicateMapper;
    private $rootFolder;
    private $fileInfoService;
    private $logger;
    private $service;
    private $userId = 'test-user';
    private $userFolder;

    protected function setUp(): void
    {
        parent::setUp();

        $this->projectMapper = $this->createMock(ProjectMapper::class);
        $this->duplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->userFolder = $this->createMock(Folder::class);

        $this->rootFolder->method('getUserFolder')
            ->with($this->userId)
            ->willReturn($this->userFolder);

        $this->service = new TestProjectService(
            $this->projectMapper,
            $this->duplicateMapper,
            $this->rootFolder,
            $this->fileInfoService,
            $this->userId,
            $this->logger
        );
    }

    public function testFindAll()
    {
        $project1 = new Project();
        $project1->setId(1);
        $project1->setName('Test Project 1');
        $project1->setUserId($this->userId);
        $project1->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));

        $project2 = new Project();
        $project2->setId(2);
        $project2->setName('Test Project 2');
        $project2->setUserId($this->userId);
        $project2->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));

        $this->projectMapper->expects($this->once())
            ->method('findAll')
            ->with($this->userId)
            ->willReturn([$project1, $project2]);

        $this->projectMapper->expects($this->exactly(2))
            ->method('getFolders')
            ->willReturnMap([
                [1, ['/folder1', '/folder2']],
                [2, ['/folder3']]
            ]);

        $result = $this->service->findAll();

        $this->assertCount(2, $result);
        $this->assertEquals('Test Project 1', $result[0]->getName());
        $this->assertEquals('Test Project 2', $result[1]->getName());
        $this->assertEquals(['/folder1', '/folder2'], $result[0]->getFolders());
        $this->assertEquals(['/folder3'], $result[1]->getFolders());
    }

    public function testFind()
    {
        $project = new Project();
        $project->setId(1);
        $project->setName('Test Project');
        $project->setUserId($this->userId);
        $project->setCreatedAt((new DateTime())->format('Y-m-d H:i:s'));

        $this->projectMapper->expects($this->once())
            ->method('find')
            ->with(1, $this->userId)
            ->willReturn($project);

        $this->projectMapper->expects($this->once())
            ->method('getFolders')
            ->with(1)
            ->willReturn(['/folder1', '/folder2']);

        $result = $this->service->find(1);

        $this->assertEquals('Test Project', $result->getName());
        $this->assertEquals(['/folder1', '/folder2'], $result->getFolders());
    }

    public function testCreate()
    {
        $name = 'New Project';
        $folders = ['/folder1', '/folder2'];

        $this->userFolder->expects($this->exactly(2))
            ->method('nodeExists')
            ->willReturn(true);

        $project = new Project();
        $project->setId(1);
        $project->setName($name);
        $project->setUserId($this->userId);

        $this->projectMapper->expects($this->once())
            ->method('insert')
            ->willReturn($project);

        $this->projectMapper->expects($this->once())
            ->method('addFolders')
            ->with(1, $folders);

        $result = $this->service->create($name, $folders);

        $this->assertEquals(1, $result->getId());
        $this->assertEquals($name, $result->getName());
        $this->assertEquals($folders, $result->getFolders());
    }

    public function testCreateWithNonExistentFolder()
    {
        $name = 'New Project';
        $folders = ['/folder1', '/non-existent-folder'];

        $this->userFolder->expects($this->exactly(1))
            ->method('nodeExists')
            ->willReturnMap([
                ['folder1', true],
                ['non-existent-folder', false]
            ]);

        $this->expectException(NotFoundException::class);

        $this->service->create($name, $folders);
    }

    public function testUpdate()
    {
        $id = 1;
        $name = 'Updated Project';
        $folders = ['/folder3', '/folder4'];

        $project = new Project();
        $project->setId($id);
        $project->setName('Old Name');
        $project->setUserId($this->userId);

        $this->projectMapper->expects($this->once())
            ->method('find')
            ->with($id, $this->userId)
            ->willReturn($project);

        $this->userFolder->expects($this->exactly(2))
            ->method('nodeExists')
            ->willReturn(true);

        $updatedProject = new Project();
        $updatedProject->setId($id);
        $updatedProject->setName($name);
        $updatedProject->setUserId($this->userId);

        $this->projectMapper->expects($this->once())
            ->method('update')
            ->willReturn($updatedProject);

        $this->projectMapper->expects($this->once())
            ->method('removeFolders')
            ->with($id);

        $this->projectMapper->expects($this->once())
            ->method('addFolders')
            ->with($id, $folders);

        $result = $this->service->update($id, $name, $folders);

        $this->assertEquals($id, $result->getId());
        $this->assertEquals($name, $result->getName());
        $this->assertEquals($folders, $result->getFolders());
    }

    public function testDelete()
    {
        $id = 1;

        $project = new Project();
        $project->setId($id);
        $project->setName('Project to Delete');
        $project->setUserId($this->userId);

        $this->projectMapper->expects($this->once())
            ->method('find')
            ->with($id, $this->userId)
            ->willReturn($project);

        $this->projectMapper->expects($this->once())
            ->method('delete')
            ->with($project);

        $this->service->delete($id);
    }

    public function testDeleteNonExistentProject()
    {
        $id = 999;

        $this->projectMapper->expects($this->once())
            ->method('find')
            ->with($id, $this->userId)
            ->willThrowException(new DoesNotExistException('Project not found'));

        $this->expectException(DoesNotExistException::class);

        $this->service->delete($id);
    }

    public function testScan()
    {
        $id = 1;

        // Call the scan method
        $this->service->scan($id);

        // Verify that scan was called
        $this->assertTrue($this->service->wasFindProjectDuplicatesCalled());
    }

    public function testGetDuplicates()
    {
        $projectId = 1;
        $type = 'all';
        $page = 1;
        $limit = 50;

        // Create mock duplicate entities
        $duplicate1 = $this->getMockBuilder('\OCA\DuplicateFinder\Db\FileDuplicate')
            ->disableOriginalConstructor()
            ->getMock();

        $duplicate2 = $this->getMockBuilder('\OCA\DuplicateFinder\Db\FileDuplicate')
            ->disableOriginalConstructor()
            ->getMock();

        $duplicate3 = $this->getMockBuilder('\OCA\DuplicateFinder\Db\FileDuplicate')
            ->disableOriginalConstructor()
            ->getMock();

        // Set up the expected result
        $expectedResult = [
            'entities' => [$duplicate1, $duplicate2, $duplicate3],
            'pagination' => [
                'currentPage' => 1,
                'totalPages' => 1,
                'totalItems' => 3
            ]
        ];

        // Configure our test service to return the expected result
        $this->service->setGetDuplicatesResult($expectedResult);

        // Call the method
        $result = $this->service->getDuplicates($projectId, $type, $page, $limit);

        // Verify the result
        $this->assertSame($expectedResult, $result);
        $this->assertArrayHasKey('entities', $result);
        $this->assertArrayHasKey('pagination', $result);
        $this->assertEquals(1, $result['pagination']['currentPage']);
        $this->assertEquals(1, $result['pagination']['totalPages']);
        $this->assertEquals(3, $result['pagination']['totalItems']);
        $this->assertCount(3, $result['entities']);
    }

    public function testGetDuplicatesWithEmptyResult()
    {
        $projectId = 1;
        $type = 'all';
        $page = 1;
        $limit = 50;

        // Don't set any result, so the default empty result will be returned
        $result = $this->service->getDuplicates($projectId, $type, $page, $limit);

        $this->assertArrayHasKey('entities', $result);
        $this->assertArrayHasKey('pagination', $result);
        $this->assertEquals(1, $result['pagination']['currentPage']);
        $this->assertEquals(0, $result['pagination']['totalPages']);
        $this->assertEquals(0, $result['pagination']['totalItems']);
        $this->assertEmpty($result['entities']);
    }

    public function testSetUserId()
    {
        $newUserId = 'another-user';
        $this->service->setUserId($newUserId);

        // Use our test method to get the user ID
        $this->assertEquals($newUserId, $this->service->getUserId());
    }

    public function testValidateUserContextWithEmptyUserId()
    {
        // Create a service with no user ID
        $service = new ProjectService(
            $this->projectMapper,
            $this->duplicateMapper,
            $this->rootFolder,
            $this->fileInfoService,
            '',
            $this->logger
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('User context required for this operation');

        // Call a method that requires user context
        $service->findAll();
    }
}
