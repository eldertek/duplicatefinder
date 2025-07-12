<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\FilterController;
use OCA\DuplicateFinder\Service\FilterService;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

class FilterControllerTest extends TestCase
{
    private $controller;
    private $service;
    private $request;
    private $userSession;
    private $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->service = $this->createMock(FilterService::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->user = $this->createMock(IUser::class);

        // Configurer le mock de l'utilisateur
        $this->user->method('getUID')->willReturn('testuser');
        $this->userSession->method('getUser')->willReturn($this->user);

        $this->controller = new FilterController(
            'duplicatefinder',
            $this->request,
            $this->service,
            $this->userSession
        );
    }

    public function testIndex()
    {
        // Configurer le mock du service pour retourner des filtres de test
        $filters = [
            ['id' => 1, 'name' => 'Filter 1', 'pattern' => '*.jpg'],
            ['id' => 2, 'name' => 'Filter 2', 'pattern' => '*.png'],
        ];

        $this->service->expects($this->once())
            ->method('getFilters')
            ->with('testuser')
            ->willReturn($filters);

        // Appeler la méthode index
        $response = $this->controller->index();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals($filters, $response->getData());
    }

    public function testCreate()
    {
        $type = 'extension';
        $value = 'pdf';

        // Créer un filtre de test
        $filter = new \OCA\DuplicateFinder\Db\Filter();
        $filter->setId(3);
        $filter->setType($type);
        $filter->setValue($value);
        $filter->setUserId('testuser');

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->once())
            ->method('createFilter')
            ->with($type, $value, 'testuser')
            ->willReturn($filter);

        // Appeler la méthode create
        $response = $this->controller->create($type, $value);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals($filter, $response->getData());
    }

    public function testDestroy()
    {
        $filterId = 1;

        // Configurer le mock du service pour ne pas lancer d'exception
        $this->service->expects($this->once())
            ->method('deleteFilter')
            ->with($filterId, 'testuser');

        // Appeler la méthode destroy
        $response = $this->controller->destroy($filterId);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    // Suppression du test testUpdate car la méthode update n'existe pas dans le contrôleur
}
