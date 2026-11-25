<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class RailwaySignalingTelemetryVaultWorkbenchTest extends TestCase
{
    public function testRailwaySignalingTelemetryVaultAuditorAndWorkbenchHaveNoTypographicDashesOrXssSinks(): void
    {
        $files = [
            __DIR__ . '/../../src/tools/railwaySignalingTelemetryVaultAuditor.js',
            __DIR__ . '/../../src/components/RailwaySignalingTelemetryVaultWorkbench.vue',
            __DIR__ . '/../../src/tools/keyboardShortcuts.js',
            __DIR__ . '/../../src/App.vue',
        ];

        foreach ($files as $filePath) {
            $content = file_get_contents($filePath);
            $this->assertNotFalse($content, "Must read {$filePath}");
            $this->assertStringNotContainsString("\u{2013}", $content, "No U+2013 in {$filePath}");
            $this->assertStringNotContainsString("\u{2014}", $content, "No U+2014 in {$filePath}");
            $this->assertDoesNotMatchRegularExpression('/v-html|innerHTML|outerHTML|document\.write/', $content);
        }
    }

    public function testRailwaySignalingTelemetryVaultWorkbenchIsWiredInAppAndCompiledBundle(): void
    {
        $appContent = file_get_contents(__DIR__ . '/../../src/App.vue');
        $shortcutsContent = file_get_contents(__DIR__ . '/../../src/tools/keyboardShortcuts.js');
        $workbenchContent = file_get_contents(__DIR__ . '/../../src/components/RailwaySignalingTelemetryVaultWorkbench.vue');
        $bundleContent = file_get_contents(__DIR__ . '/../../js/duplicatefinder-main.js');

        $this->assertNotFalse($appContent);
        $this->assertNotFalse($shortcutsContent);
        $this->assertNotFalse($workbenchContent);
        $this->assertNotFalse($bundleContent);

        $this->assertStringContainsString('toggle-railway-signaling-telemetry-vault-auditor', $shortcutsContent);
        $this->assertStringContainsString('Alt+Shift+R', $shortcutsContent);
        $this->assertStringContainsString('topbar-railway-signaling-telemetry-vault-button', $appContent);
        $this->assertStringContainsString('RailwaySignalingTelemetryVaultWorkbench', $appContent);
        $this->assertStringContainsString('railway-signaling-telemetry-vault-workbench', $workbenchContent);
        $this->assertStringContainsString('min-block-size: 44px', $workbenchContent);
        $this->assertStringContainsString(':focus-visible', $workbenchContent);
        $this->assertStringContainsString('railway-signaling-telemetry-vault-workbench', $bundleContent);
    }
}
