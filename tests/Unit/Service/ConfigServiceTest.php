<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\ConfigService;
use OCP\IConfig;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ConfigServiceTest extends TestCase
{
    /** @var ConfigService */
    private $service;

    /** @var IConfig|MockObject */
    private $config;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->config = $this->createMock(IConfig::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->service = new ConfigService(
            $this->config,
            $this->logger
        );
    }

    public function testGetAndSetFindJobInterval(): void
    {
        $this->config->expects($this->once())
            ->method('getAppValue')
            ->with(Application::ID, 'backgroundjob_interval_find', '432000')
            ->willReturn('86400');

        $this->assertSame(86400, $this->service->getFindJobInterval());

        $this->config->expects($this->once())
            ->method('setAppValue')
            ->with(Application::ID, 'backgroundjob_interval_find', '3600');

        $this->service->setFindJobInterval(3600);
    }

    public function testGetAndSetCleanupJobInterval(): void
    {
        $this->config->expects($this->once())
            ->method('getAppValue')
            ->with(Application::ID, 'backgroundjob_interval_cleanup', '172800')
            ->willReturn('172800');

        $this->assertSame(172800, $this->service->getCleanupJobInterval());

        $this->config->expects($this->once())
            ->method('setAppValue')
            ->with(Application::ID, 'backgroundjob_interval_cleanup', '7200');

        $this->service->setCleanupJobInterval(7200);
    }

    public function testGetAndSetFilesystemEventsDisabled(): void
    {
        $this->config->expects($this->once())
            ->method('getAppValue')
            ->with(Application::ID, 'disable_filesystem_events', 'false')
            ->willReturn('true');

        $this->assertTrue($this->service->areFilesytemEventsDisabled());

        $this->config->expects($this->once())
            ->method('setAppValue')
            ->with(Application::ID, 'disable_filesystem_events', 'false');

        $this->service->setFilesytemEventsDisabled(false);
    }

    public function testGetAndSetMountedFilesIgnored(): void
    {
        $this->config->expects($this->once())
            ->method('getAppValue')
            ->with(Application::ID, 'ignore_mounted_files', 'false')
            ->willReturn('false');

        $this->assertFalse($this->service->areMountedFilesIgnored());

        $this->config->expects($this->once())
            ->method('setAppValue')
            ->with(Application::ID, 'ignore_mounted_files', 'true');

        $this->service->setMountedFilesIgnored(true);
    }

    public function testGetInstalledVersion(): void
    {
        $this->config->expects($this->once())
            ->method('getAppValue')
            ->with(Application::ID, 'installed_version', '0.0.0')
            ->willReturn('1.10.44');

        $this->assertSame('1.10.44', $this->service->getInstalledVersion());
    }

    public function testGetAndSetUserValue(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with('alice', Application::ID, 'ui_prefs', '{}')
            ->willReturn('{"sort":"size-desc"}');

        $this->assertSame('{"sort":"size-desc"}', $this->service->getUserValue('alice', 'ui_prefs', '{}'));

        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with('alice', Application::ID, 'ui_prefs', '{"sort":"none"}');

        $this->service->setUserValue('alice', 'ui_prefs', '{"sort":"none"}');
    }
}
