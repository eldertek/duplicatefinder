<?php
namespace OCA\DuplicateFinder\Controller;

use OCP\IRequest;
use OCP\AppFramework\Http\TemplateResponse;
use OCP\AppFramework\Controller;
use OCA\DuplicateFinder\AppInfo\Application;

class PageController extends Controller
{

    /**
     *
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function index(): TemplateResponse
    {
        return new TemplateResponse(Application::ID, 'App');
    }
}
