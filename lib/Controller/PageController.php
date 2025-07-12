<?php

namespace OCA\DuplicateFinder\Controller;

use OCA\Viewer\Event\LoadViewer;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\IRequest;

class PageController extends Controller
{
    protected $appName;

    /** @var IEventDispatcher */
    private $eventDispatcher;

    public function __construct(
        $appName,
        IRequest $request,
        IEventDispatcher $eventDispatcher
    ) {
        parent::__construct($appName, $request);

        $this->appName = $appName;
        $this->eventDispatcher = $eventDispatcher;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     * Render default index template
     *
     * @return TemplateResponse
     */
    public function index(): TemplateResponse
    {
        $this->eventDispatcher->dispatch(LoadViewer::class, new LoadViewer());
        $response = new TemplateResponse($this->appName, 'App');

        return $response;
    }
}
