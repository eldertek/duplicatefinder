<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\FileApiController;
use OCA\DuplicateFinder\Service\FileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileApiControllerTest extends TestCase
{
    private $controller;
    private $service;
    private $request;
    private $logger;
    private $userId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->service = $this->createMock(FileService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->userId = 'testuser';

        $this->controller = new FileApiController(
            'duplicatefinder',
            $this->request,
            $this->service,
            $this->userId,
            $this->logger
        );
    }

    public function testDelete()
    {
        $filePath = '/path/to/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath);

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    public function testDeleteWithNotFoundException()
    {
        $filePath = '/path/to/nonexistent/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new NotFoundException('File not found'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Error deleting file: {error}', $this->anything());

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_NOT_FOUND, $response->getStatus());
        $this->assertEquals(['error' => 'FILE_NOT_FOUND', 'message' => 'File not found: ' . $filePath], $response->getData());
    }

    public function testDeleteWithGenericException()
    {
        $filePath = '/path/to/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new \Exception('Generic error'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Error deleting file: {error}', $this->anything());

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'INTERNAL_ERROR', 'message' => 'An unexpected error occurred'], $response->getData());
    }

    // Suppression des tests testInfo, testInfoWithNotFoundException et testInfoWithGenericException
    // car la méthode info n'existe pas dans le contrôleur
}
