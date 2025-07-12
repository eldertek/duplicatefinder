<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Service\ConfigService;
use OCP\IConfig;
use OCP\IUser;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class ConfigServiceTest extends TestCase
{
    /** @var ConfigService */
    private $service;

    /** @var IConfig|MockObject */
    private $config;

    /** @var IUser|MockObject */
    private $user;

    private $userId = 'testuser';
    private $appName = 'duplicatefinder';

    protected function setUp(): void
    {
        parent::setUp();

        $this->config = $this->createMock(IConfig::class);
        $this->user = $this->createMock(IUser::class);
        $this->user->method('getUID')->willReturn($this->userId);

        $this->service = new ConfigService(
            $this->config,
            $this->user,
            $this->appName
        );
    }

    /**
     * Test getting minimum file size
     */
    public function testGetMinimumFileSize(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'minimum_file_size', '1024')
            ->willReturn('2048');

        $result = $this->service->getMinimumFileSize();

        $this->assertEquals(2048, $result);
    }

    /**
     * Test setting minimum file size
     */
    public function testSetMinimumFileSize(): void
    {
        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with($this->userId, $this->appName, 'minimum_file_size', '4096');

        $this->service->setMinimumFileSize(4096);
    }

    /**
     * Test getting ignored mime types
     */
    public function testGetIgnoredMimeTypes(): void
    {
        $mimeTypes = 'application/x-trash,text/x-log,application/x-temporary';

        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'ignored_mime_types', '')
            ->willReturn($mimeTypes);

        $result = $this->service->getIgnoredMimeTypes();

        $this->assertIsArray($result);
        $this->assertCount(3, $result);
        $this->assertContains('application/x-trash', $result);
        $this->assertContains('text/x-log', $result);
        $this->assertContains('application/x-temporary', $result);
    }

    /**
     * Test setting ignored mime types
     */
    public function testSetIgnoredMimeTypes(): void
    {
        $mimeTypes = ['text/plain', 'application/pdf'];

        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with($this->userId, $this->appName, 'ignored_mime_types', 'text/plain,application/pdf');

        $this->service->setIgnoredMimeTypes($mimeTypes);
    }

    /**
     * Test getting ignored file extensions
     */
    public function testGetIgnoredFileExtensions(): void
    {
        $extensions = '.tmp,.cache,.~lock,.bak';

        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'ignored_extensions', '')
            ->willReturn($extensions);

        $result = $this->service->getIgnoredFileExtensions();

        $this->assertIsArray($result);
        $this->assertCount(4, $result);
        $this->assertContains('.tmp', $result);
        $this->assertContains('.cache', $result);
        $this->assertContains('.~lock', $result);
        $this->assertContains('.bak', $result);
    }

    /**
     * Test getting ignored path patterns
     */
    public function testGetIgnoredPathPatterns(): void
    {
        $patterns = '/node_modules/,/.git/,/cache/';

        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'ignored_path_patterns', '')
            ->willReturn($patterns);

        $result = $this->service->getIgnoredPathPatterns();

        $this->assertIsArray($result);
        $this->assertCount(3, $result);
        $this->assertContains('/node_modules/', $result);
        $this->assertContains('/.git/', $result);
        $this->assertContains('/cache/', $result);
    }

    /**
     * Test enable/disable background scan
     */
    public function testBackgroundScanEnabled(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'background_scan_enabled', 'true')
            ->willReturn('false');

        $result = $this->service->isBackgroundScanEnabled();

        $this->assertFalse($result);
    }

    /**
     * Test setting background scan
     */
    public function testSetBackgroundScanEnabled(): void
    {
        $this->config->expects($this->once())
            ->method('setUserValue')
            ->with($this->userId, $this->appName, 'background_scan_enabled', 'true');

        $this->service->setBackgroundScanEnabled(true);
    }

    /**
     * Test getting scan interval
     */
    public function testGetScanInterval(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'scan_interval', '86400')
            ->willReturn('43200'); // 12 hours

        $result = $this->service->getScanInterval();

        $this->assertEquals(43200, $result);
    }

    /**
     * Test getting all settings
     */
    public function testGetAllSettings(): void
    {
        $this->config->expects($this->exactly(7))
            ->method('getUserValue')
            ->willReturnMap([
                [$this->userId, $this->appName, 'minimum_file_size', '1024', '2048'],
                [$this->userId, $this->appName, 'ignored_mime_types', '', 'text/x-log'],
                [$this->userId, $this->appName, 'ignored_extensions', '', '.tmp,.bak'],
                [$this->userId, $this->appName, 'ignored_path_patterns', '', '/.git/'],
                [$this->userId, $this->appName, 'background_scan_enabled', 'true', 'false'],
                [$this->userId, $this->appName, 'scan_interval', '86400', '43200'],
                [$this->userId, $this->appName, 'acknowledge_duplicates', 'false', 'true'],
            ]);

        $result = $this->service->getAllSettings();

        $this->assertIsArray($result);
        $this->assertEquals(2048, $result['minimum_file_size']);
        $this->assertContains('text/x-log', $result['ignored_mime_types']);
        $this->assertContains('.tmp', $result['ignored_extensions']);
        $this->assertContains('/.git/', $result['ignored_path_patterns']);
        $this->assertFalse($result['background_scan_enabled']);
        $this->assertEquals(43200, $result['scan_interval']);
        $this->assertTrue($result['acknowledge_duplicates']);
    }

    /**
     * Test resetting to defaults
     */
    public function testResetToDefaults(): void
    {
        $this->config->expects($this->exactly(7))
            ->method('deleteUserValue')
            ->withConsecutive(
                [$this->userId, $this->appName, 'minimum_file_size'],
                [$this->userId, $this->appName, 'ignored_mime_types'],
                [$this->userId, $this->appName, 'ignored_extensions'],
                [$this->userId, $this->appName, 'ignored_path_patterns'],
                [$this->userId, $this->appName, 'background_scan_enabled'],
                [$this->userId, $this->appName, 'scan_interval'],
                [$this->userId, $this->appName, 'acknowledge_duplicates']
            );

        $this->service->resetToDefaults();
    }

    /**
     * Test empty config values
     */
    public function testEmptyConfigValues(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'ignored_mime_types', '')
            ->willReturn('');

        $result = $this->service->getIgnoredMimeTypes();

        $this->assertIsArray($result);
        $this->assertEmpty($result);
    }

    /**
     * Test invalid numeric values
     */
    public function testInvalidNumericValues(): void
    {
        $this->config->expects($this->once())
            ->method('getUserValue')
            ->with($this->userId, $this->appName, 'minimum_file_size', '1024')
            ->willReturn('invalid');

        $result = $this->service->getMinimumFileSize();

        // Should return default value on invalid input
        $this->assertEquals(0, $result);
    }
}
