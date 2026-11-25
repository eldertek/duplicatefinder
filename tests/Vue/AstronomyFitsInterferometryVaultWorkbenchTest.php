<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class AstronomyFitsInterferometryVaultWorkbenchTest extends TestCase
{
    public function testAstronomyFitsInterferometryVaultAuditorAndWorkbenchHaveNoTypographicDashesOrXssSinks(): void
    {
        $files = [
            __DIR__ . '/../../src/tools/astronomyFitsInterferometryVaultAuditor.js',
            __DIR__ . '/../../src/components/AstronomyFitsInterferometryVaultWorkbench.vue',
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

    public function testAstronomyFitsInterferometryVaultWorkbenchIsWiredInAppAndCompiledBundle(): void
    {
        $appContent = file_get_contents(__DIR__ . '/../../src/App.vue');
        $shortcutsContent = file_get_contents(__DIR__ . '/../../src/tools/keyboardShortcuts.js');
        $workbenchContent = file_get_contents(__DIR__ . '/../../src/components/AstronomyFitsInterferometryVaultWorkbench.vue');
        $bundleContent = file_get_contents(__DIR__ . '/../../js/duplicatefinder-main.js');

        $this->assertNotFalse($appContent);
        $this->assertNotFalse($shortcutsContent);
        $this->assertNotFalse($workbenchContent);
        $this->assertNotFalse($bundleContent);

        $this->assertStringContainsString('toggle-astronomy-fits-interferometry-vault-auditor', $shortcutsContent);
        $this->assertStringContainsString('Alt+Shift+I', $shortcutsContent);
        $this->assertStringContainsString('topbar-astronomy-fits-interferometry-vault-button', $appContent);
        $this->assertStringContainsString('AstronomyFitsInterferometryVaultWorkbench', $appContent);
        $this->assertStringContainsString('astronomy-fits-interferometry-vault-workbench', $workbenchContent);
        $this->assertStringContainsString('min-block-size: 44px', $workbenchContent);
        $this->assertStringContainsString(':focus-visible', $workbenchContent);
        $this->assertStringContainsString('astronomy-fits-interferometry-vault-workbench', $bundleContent);
    }
}
