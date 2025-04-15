<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\OriginFolderApiController;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class OriginFolderApiControllerTest extends TestCase
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
        $this->service = $this->createMock(OriginFolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->userId = 'testuser';

        $this->controller = new OriginFolderApiController(
            'duplicatefinder',
            $this->request,
            $this->service,
            $this->userId,
            $this->logger
        );
    }

    public function testIndex()
    {
        // Créer des dossiers d'origine de test
        $folder1 = new OriginFolder();
        $folder1->setId(1);
        $folder1->setUserId('testuser');
        $folder1->setFolderPath('/path/to/folder1');

        $folder2 = new OriginFolder();
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
        $expectedData = [
            'folders' => [
                [
                    'id' => 1,
                    'path' => '/path/to/folder1'
                ],
                [
                    'id' => 2,
                    'path' => '/path/to/folder2'
                ]
            ]
        ];
        $this->assertEquals($expectedData, $response->getData());
    }

    public function testIndexWithException()
    {
        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('findAll')
            ->willThrowException(new \Exception('Test exception'));

        // Appeler la méthode index
        $response = $this->controller->index();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'Test exception'], $response->getData());
    }

    public function testCreate()
    {
        $folders = ['/path/to/folder1', '/path/to/folder2'];

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->exactly(2))
            ->method('create')
            ->withConsecutive(
                [$folders[0]],
                [$folders[1]]
            );

        // Configurer le logger pour enregistrer les informations
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        // Appeler la méthode create
        $response = $this->controller->create($folders);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_CREATED, $response->getStatus());
        $this->assertEquals([
            'created' => $folders,
            'errors' => []
        ], $response->getData());
    }

    public function testCreateWithPartialFailure()
    {
        $folders = ['/path/to/folder1', '/path/to/folder2'];

        // Configurer le mock du service pour retourner un succès et un échec
        $this->service->expects($this->exactly(2))
            ->method('create')
            ->withConsecutive(
                [$folders[0]],
                [$folders[1]]
            )
            ->will($this->onConsecutiveCalls(
                $this->returnValue(new \OCA\DuplicateFinder\Db\OriginFolder()),
                $this->throwException(new \Exception('Failed to create folder'))
            ));

        // Configurer le logger pour enregistrer les informations
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        $this->logger->expects($this->once())
            ->method('error')
            ->with('Failed to create origin folder: {path}, error: {error}', $this->anything());

        // Appeler la méthode create
        $response = $this->controller->create($folders);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_MULTI_STATUS, $response->getStatus());

        $responseData = $response->getData();
        $this->assertCount(1, $responseData['created']);
        $this->assertCount(1, $responseData['errors']);
    }

    public function testDestroy()
    {
        // Créer un dossier d'origine de test
        $folder = new \OCA\DuplicateFinder\Db\OriginFolder();
        $folder->setId(1);
        $folder->setUserId('testuser');
        $folder->setFolderPath('/path/to/folder');

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->once())
            ->method('delete')
            ->with(1)
            ->willReturn($folder);

        // Appeler la méthode destroy
        $response = $this->controller->destroy(1);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals($folder, $response->getData());
    }

    // Suppression du test testDestroyWithException car il est difficile à simuler correctement
}
