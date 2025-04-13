<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
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
}
