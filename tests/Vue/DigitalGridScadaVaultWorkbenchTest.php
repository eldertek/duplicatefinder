<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class DigitalGridScadaVaultWorkbenchTest extends TestCase
{
    public function testDigitalGridScadaVaultAuditorAndWorkbenchHaveNoTypographicDashesOrXssSinks(): void
    {
        $files = [
            __DIR__ . '/../../src/tools/digitalGridScadaVaultAuditor.js',
            __DIR__ . '/../../src/components/DigitalGridScadaVaultWorkbench.vue',
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

    public function testDigitalGridScadaVaultWorkbenchIsWiredInAppAndCompiledBundle(): void
    {
        $appContent = file_get_contents(__DIR__ . '/../../src/App.vue');
        $shortcutsContent = file_get_contents(__DIR__ . '/../../src/tools/keyboardShortcuts.js');
        $workbenchContent = file_get_contents(__DIR__ . '/../../src/components/DigitalGridScadaVaultWorkbench.vue');
        $bundleContent = file_get_contents(__DIR__ . '/../../js/duplicatefinder-main.js');

        $this->assertNotFalse($appContent);
        $this->assertNotFalse($shortcutsContent);
        $this->assertNotFalse($workbenchContent);
        $this->assertNotFalse($bundleContent);

        $this->assertStringContainsString('toggle-digital-grid-scada-vault-auditor', $shortcutsContent);
        $this->assertStringContainsString('Alt+Shift+D', $shortcutsContent);
        $this->assertStringContainsString('topbar-digital-grid-scada-vault-button', $appContent);
        $this->assertStringContainsString('DigitalGridScadaVaultWorkbench', $appContent);
        $this->assertStringContainsString('digital-grid-scada-vault-workbench', $workbenchContent);
        $this->assertStringContainsString('min-block-size: 44px', $workbenchContent);
        $this->assertStringContainsString(':focus-visible', $workbenchContent);
        $this->assertStringContainsString('digital-grid-scada-vault-workbench', $bundleContent);
    }
}
