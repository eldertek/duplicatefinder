<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit;

use PHPUnit\Framework\TestCase;

class L10nFallbackMergeTest extends TestCase
{
    private function resolvePythonBinary(): string
    {
        foreach (['python3', 'python'] as $candidate) {
            $output = [];
            $code = 1;
            @exec($candidate . ' --version 2>&1', $output, $code);
            if ($code === 0) {
                return $candidate;
            }
        }
        $this->markTestSkipped('Python 3 binary not available in test environment');
    }

    public function testMakefileAndL10nIgnoreProtectTransifexWorkflow(): void
    {
        $repoRoot = dirname(__DIR__, 2);
        $makefile = file_get_contents($repoRoot . '/Makefile');
        $l10nIgnore = file_get_contents($repoRoot . '/.l10nignore');

        $this->assertNotFalse($makefile);
        $this->assertNotFalse($l10nIgnore);
        $this->assertStringContainsString('merge_l10n_fallback.py', $makefile);
        $this->assertStringContainsString('l10n-fallback/', $l10nIgnore);
    }

    public function testMergeScriptRefusesInPlaceMutationOfTrackedL10nByDefault(): void
    {
        $python = $this->resolvePythonBinary();
        $repoRoot = dirname(__DIR__, 2);
        $script = $repoRoot . '/scripts/merge_l10n_fallback.py';
        $trackedL10n = $repoRoot . '/l10n';

        $cmd = sprintf(
            '%s %s --target-dir %s 2>&1',
            escapeshellarg($python),
            escapeshellarg($script),
            escapeshellarg($trackedL10n)
        );
        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        $this->assertSame(2, $exitCode, 'Script must refuse to overwrite tracked l10n without --allow-source-l10n');
    }

    public function testMergeScriptPopulatesMissingKeysAndNeverOverwritesTransifexTranslations(): void
    {
        $python = $this->resolvePythonBinary();
        $repoRoot = dirname(__DIR__, 2);
        $script = $repoRoot . '/scripts/merge_l10n_fallback.py';
        $fallbackDir = $repoRoot . '/l10n-fallback';
        $sourceL10nDir = $repoRoot . '/l10n';

        $tempDir = sys_get_temp_dir() . '/dupfinder_l10n_' . bin2hex(random_bytes(6));
        mkdir($tempDir, 0777, true);

        try {
            $locales = ['it', 'nl', 'ja', 'ko', 'zh_CN', 'pl', 'ar', 'es', 'pt_PT'];
            $beforeSnapshots = [];

            foreach ($locales as $locale) {
                copy($sourceL10nDir . '/' . $locale . '.json', $tempDir . '/' . $locale . '.json');
                copy($sourceL10nDir . '/' . $locale . '.js', $tempDir . '/' . $locale . '.js');
                $decoded = json_decode((string) file_get_contents($tempDir . '/' . $locale . '.json'), true);
                $this->assertIsArray($decoded);
                $beforeSnapshots[$locale] = $decoded;
            }

            // Simulate a fresh Transifex human translation on a key that also exists in l10n-fallback/it.json
            $itModified = $beforeSnapshots['it'];
            $itModified['translations']['Bulk Delete'] = 'Eliminazione di massa (Transifex)';
            file_put_contents(
                $tempDir . '/it.json',
                json_encode($itModified, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
            );
            $beforeSnapshots['it'] = $itModified;

            $cmd = sprintf(
                '%s %s --target-dir %s --fallback-dir %s 2>&1',
                escapeshellarg($python),
                escapeshellarg($script),
                escapeshellarg($tempDir),
                escapeshellarg($fallbackDir)
            );
            $output = [];
            $exitCode = 1;
            exec($cmd, $output, $exitCode);
            $this->assertSame(0, $exitCode, implode("\n", $output));

            foreach ($locales as $locale) {
                $afterDecoded = json_decode((string) file_get_contents($tempDir . '/' . $locale . '.json'), true);
                $this->assertIsArray($afterDecoded);
                $this->assertSame(
                    $beforeSnapshots[$locale]['pluralForm'],
                    $afterDecoded['pluralForm'],
                    "pluralForm for {$locale} must be preserved"
                );

                foreach ($beforeSnapshots[$locale]['translations'] as $key => $transifexVal) {
                    if (is_string($transifexVal) && trim($transifexVal) !== '') {
                        $this->assertSame(
                            $transifexVal,
                            $afterDecoded['translations'][$key] ?? null,
                            "Existing Transifex key '{$key}' in {$locale} must NEVER be overwritten"
                        );
                    }
                }

                $this->assertGreaterThan(
                    count($beforeSnapshots[$locale]['translations']),
                    count($afterDecoded['translations']),
                    "Fallback merge must increase translated key count for {$locale}"
                );

                $jsContent = (string) file_get_contents($tempDir . '/' . $locale . '.js');
                $this->assertStringStartsWith('OC.L10N.register(', $jsContent);
            }

            $itAfter = json_decode((string) file_get_contents($tempDir . '/it.json'), true);
            $this->assertSame(
                'Eliminazione di massa (Transifex)',
                $itAfter['translations']['Bulk Delete']
            );
        } finally {
            foreach (glob($tempDir . '/*') ?: [] as $file) {
                @unlink($file);
            }
            @rmdir($tempDir);
        }
    }
}
