<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\PageController;
use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;

class PageControllerTest extends TestCase
{
    private $controller;
    private $request;
    private $eventDispatcher;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->eventDispatcher = $this->createMock(IEventDispatcher::class);

        $this->controller = new PageController(
            'duplicatefinder',
            $this->request,
            $this->eventDispatcher
        );
    }

    public function testIndex()
    {
        // Configurer le mock du dispatcher d'événements
        $this->eventDispatcher->expects($this->once())
            ->method('dispatch')
            ->with(
                $this->equalTo(LoadViewer::class),
                $this->isInstanceOf(LoadViewer::class)
            );

        // Appeler la méthode index
        $response = $this->controller->index();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(TemplateResponse::class, $response);
        $this->assertEquals('App', $response->getTemplateName());
    }
}
