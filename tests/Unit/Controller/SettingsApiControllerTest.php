<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\SettingsApiController;
use OCA\DuplicateFinder\Service\ConfigService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class SettingsApiControllerTest extends TestCase
{
    private $controller;
    private $configService;
    private $request;
    private $userSession;
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->configService = $this->createMock(ConfigService::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->controller = new SettingsApiController(
            'duplicatefinder',
            $this->request,
            $this->userSession,
            $this->configService,
            $this->logger
        );
    }

    public function testList()
    {
        // Configurer le mock du service de configuration pour retourner des valeurs de test
        $this->configService->expects($this->once())
            ->method('getFindJobInterval')
            ->willReturn(172800); // 2 jours

        $this->configService->expects($this->once())
            ->method('getCleanupJobInterval')
            ->willReturn(432000); // 5 jours

        $this->configService->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        $this->configService->expects($this->once())
            ->method('areMountedFilesIgnored')
            ->willReturn(true);

        $this->configService->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('1.0.0');

        // Appeler la méthode list
        $response = $this->controller->list();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(DataResponse::class, $response);
        $expectedData = [
            'status' => 'success',
            'data' => [
                'backgroundjob_interval_find' => 172800,
                'backgroundjob_interval_cleanup' => 432000,
                'disable_filesystem_events' => false,
                'ignore_mounted_files' => true,
                'installed_version' => '1.0.0',
            ],
        ];
        $this->assertEquals($expectedData, $response->getData());
    }

    public function testSave()
    {
        // Configurer le mock du service de configuration pour la méthode set
        $this->configService->expects($this->once())
            ->method('setFindJobInterval')
            ->with(259200);

        // Configurer les mocks du service de configuration pour les méthodes get (pour la réponse)
        $this->configService->expects($this->once())
            ->method('getFindJobInterval')
            ->willReturn(259200);

        $this->configService->expects($this->once())
            ->method('getCleanupJobInterval')
            ->willReturn(432000);

        $this->configService->expects($this->once())
            ->method('areFilesytemEventsDisabled')
            ->willReturn(false);

        $this->configService->expects($this->once())
            ->method('areMountedFilesIgnored')
            ->willReturn(true);

        $this->configService->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('1.0.0');

        // Appeler la méthode save
        $response = $this->controller->save('backgroundjob_interval_find', 259200);

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(DataResponse::class, $response);
        $expectedData = [
            'status' => 'success',
            'data' => [
                'backgroundjob_interval_find' => 259200,
                'backgroundjob_interval_cleanup' => 432000,
                'disable_filesystem_events' => false,
                'ignore_mounted_files' => true,
                'installed_version' => '1.0.0',
            ],
        ];
        $this->assertEquals($expectedData, $response->getData());
    }

    public function testSaveWithInvalidKey()
    {
        // Appeler la méthode save avec une clé invalide
        $response = $this->controller->save('invalid_key', 'value');

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(DataResponse::class, $response);
        $expectedData = [
            'status' => 'error',
            'message' => 'Unknown config key',
        ];
        $this->assertEquals($expectedData, $response->getData());
    }
}
