<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\ExcludedFolderController;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ExcludedFolderControllerTest extends TestCase
{
    private $controller;
    private $service;
    private $request;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->service = $this->createMock(ExcludedFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->controller = new ExcludedFolderController(
            'duplicatefinder',
            $this->request,
            $this->service,
            $this->logger
        );
    }

    public function testIndex()
    {
        // Créer des dossiers exclus de test
        $folder1 = new ExcludedFolder();
        $folder1->setId(1);
        $folder1->setUserId('testuser');
        $folder1->setFolderPath('/path/to/folder1');

        $folder2 = new ExcludedFolder();
        $folder2->setId(2);
        $folder2->setUserId('testuser');
        $folder2->setFolderPath('/path/to/folder2');

        // Configurer le mock du service pour retourner les dossiers de test
        $this->service->expects($this->once())
            ->method('findAll')
            ->willReturn([$folder1, $folder2]);

        // Appeler la méthode index
        $response = $this->controller->index();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals([$folder1, $folder2], $response->getData());
    }

    public function testIndexWithException()
    {
        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('findAll')
            ->willThrowException(new \Exception('Test exception'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Failed to get excluded folders', $this->anything());

        // Appeler la méthode index
        $response = $this->controller->index();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'Failed to get excluded folders'], $response->getData());
    }

    public function testCreate()
    {
        // Créer un dossier exclu de test
        $folder = new \OCA\DuplicateFinder\Db\ExcludedFolder();
        $folder->setId(1);
        $folder->setUserId('testuser');
        $folder->setFolderPath('/path/to/folder');

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->once())
            ->method('create')
            ->with('/path/to/folder')
            ->willReturn($folder);

        // Appeler la méthode create
        $response = $this->controller->create('/path/to/folder');

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals($folder, $response->getData());
    }

    public function testCreateWithException()
    {
        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('create')
            ->with('/path/to/folder')
            ->willThrowException(new \Exception('Test exception'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Failed to create excluded folder', $this->anything());

        // Appeler la méthode create
        $response = $this->controller->create('/path/to/folder');

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'Failed to create excluded folder'], $response->getData());
    }

    public function testDestroy()
    {
        // Configurer le mock du service pour ne pas lancer d'exception
        $this->service->expects($this->once())
            ->method('delete')
            ->with(1);

        // Appeler la méthode destroy
        $response = $this->controller->destroy(1);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_NO_CONTENT, $response->getStatus());
        $this->assertNull($response->getData());
    }

    public function testDestroyWithException()
    {
        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('delete')
            ->with(1)
            ->willThrowException(new \Exception('Test exception'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Failed to delete excluded folder', $this->anything());

        // Appeler la méthode destroy
        $response = $this->controller->destroy(1);

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'Failed to delete excluded folder'], $response->getData());
    }
}
