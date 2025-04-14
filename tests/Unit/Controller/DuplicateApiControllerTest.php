<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class DuplicateApiControllerTest extends TestCase
{
    private $controller;
    private $request;
    private $userSession;
    private $fileDuplicateService;
    private $fileInfoService;
    private $fileDuplicateMapper;
    private $userManager;
    private $logger;
    private $originFolderService;
    private $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->fileDuplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $this->userManager = $this->createMock(IUserManager::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->user = $this->createMock(IUser::class);

        $this->user->method('getUID')->willReturn('testuser');
        $this->userSession->method('getUser')->willReturn($this->user);

        $this->controller = new DuplicateApiController(
            'duplicatefinder',
            $this->request,
            $this->userSession,
            $this->fileDuplicateService,
            $this->fileInfoService,
            $this->fileDuplicateMapper,
            $this->userManager,
            $this->logger,
            $this->originFolderService
        );
    }

    /**
     * Test that the find method only scans files for each user individually
     * and doesn't include files from other users that the current user doesn't have access to
     */
    public function testFindOnlyScansFilesForEachUserIndividually()
    {
        // Create mock users
        $user1 = $this->createMock(IUser::class);
        $user1->method('getUID')->willReturn('user1');

        $user2 = $this->createMock(IUser::class);
        $user2->method('getUID')->willReturn('user2');

        // Configure userManager to call the callback for each user
        $this->userManager->expects($this->once())
            ->method('callForAllUsers')
            ->willReturnCallback(function ($callback) use ($user1, $user2) {
                $callback($user1);
                $callback($user2);
            });

        // The fileInfoService should be called for each user with their own UID
        $this->fileInfoService->expects($this->exactly(2))
            ->method('scanFiles')
            ->withConsecutive(
                ['user1'],
                ['user2']
            );

        // Call the find method
        $response = $this->controller->find();

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    public function testList()
    {
        // Create a real duplicate instance
        $duplicate = new FileDuplicate('testhash', 'file_hash');
        $duplicate->setAcknowledged(false);

        // Mock the findAll method to return our test duplicate
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with('unacknowledged', 'testuser', 1, 30, true)
            ->willReturn([
                'entities' => [$duplicate],
                'isLastFetched' => true
            ]);

        $this->fileDuplicateService->expects($this->once())
            ->method('getTotalCount')
            ->with('unacknowledged')
            ->willReturn(1);

        // Call the list method
        $response = $this->controller->list();

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('success', $data['status']);
        $this->assertArrayHasKey('entities', $data);
        $this->assertArrayHasKey('pagination', $data);
        $this->assertEquals(1, $data['pagination']['totalItems']);
        $this->assertEquals(1, $data['pagination']['totalPages']);
    }

    public function testAcknowledge()
    {
        // Mock the markAsAcknowledged method
        $this->fileDuplicateMapper->expects($this->once())
            ->method('markAsAcknowledged')
            ->with('testhash');

        // Call the acknowledge method
        $response = $this->controller->acknowledge('testhash');

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('success', $data['status']);
    }

    public function testUnacknowledge()
    {
        // Mock the unmarkAcknowledged method
        $this->fileDuplicateMapper->expects($this->once())
            ->method('unmarkAcknowledged')
            ->with('testhash');

        // Call the unacknowledge method
        $response = $this->controller->unacknowledge('testhash');

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('success', $data['status']);
    }

    public function testFindWithException()
    {
        // Mock the callForAllUsers method to throw an exception
        $this->userManager->expects($this->once())
            ->method('callForAllUsers')
            ->willThrowException(new \Exception('Test exception'));

        // Mock the logger
        $this->logger->expects($this->once())
            ->method('error')
            ->with('A unknown exception occurred', $this->anything());

        // Call the find method
        $response = $this->controller->find();

        // Verify the response
        $this->assertInstanceOf(DataResponse::class, $response);
        $data = $response->getData();
        $this->assertEquals('error', $data['status']);
        $this->assertEquals('Test exception', $data['message']);
    }
}