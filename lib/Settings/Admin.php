<?php
namespace OCA\DuplicateFinder\Settings;

use OCP\AppFramework\Http\TemplateResponse;
use OCP\Settings\ISubAdminSettings;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Controller\SettingsApiController;
use OCA\DuplicateFinder\Service\ConfigService;

class Admin implements ISubAdminSettings
{
    private $appName;
    private $request;
    private $userSession;
    private $configService;
    private $logger;

    public function __construct(
        string $appName,
        IRequest $request,
        IUserSession $userSession,
        ConfigService $configService,
        LoggerInterface $logger
    ) {
        $this->appName = $appName;
        $this->request = $request;
        $this->userSession = $userSession;
        $this->configService = $configService;
        $this->logger = $logger;
    }

    /**
     * @return TemplateResponse
     */
    public function getForm(): TemplateResponse
    {
        $settingsApiController = new SettingsApiController(
            $this->appName,
            $this->request,
            $this->userSession,
            $this->configService,
            $this->logger
        );

        $settings = $settingsApiController->list()->getData();

        return new TemplateResponse(Application::ID, 'Settings', ['settings' => $settings], '');
    }

    public function getSection(): string
    {
        return Application::ID;
    }

    public function getPriority(): int
    {
        return 0;
    }
}