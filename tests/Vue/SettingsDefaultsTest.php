<?php

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

/**
 * The admin settings page rendered nothing at all because Settings.vue started with
 * "settings: {}": NcTextField requires a defined value (it calls value.toString())
 * and threw "Cannot read properties of undefined (reading 'toString')" on first render.
 */
class SettingsDefaultsTest extends TestCase
{
    private const KEYS = [
        'backgroundjob_interval_find',
        'backgroundjob_interval_cleanup',
        'ignore_mounted_files',
        'disable_filesystem_events',
    ];

    public function testSettingsAreInitialisedWithDefinedValues()
    {
        $source = file_get_contents(__DIR__ . '/../../src/Settings.vue');

        $this->assertDoesNotMatchRegularExpression(
            '/settings:\s*\{\s*\}/',
            $source,
            'Settings.vue must not start with an empty settings object, NcTextField would receive undefined'
        );

        foreach (self::KEYS as $key) {
            $this->assertMatchesRegularExpression(
                '/settings:\s*\{[^}]*\b' . $key . '\s*:/s',
                $source,
                "Settings.vue should initialise $key before the settings are fetched"
            );
        }
    }

    public function testFetchedSettingsAreMergedIntoTheDefaults()
    {
        $source = file_get_contents(__DIR__ . '/../../src/Settings.vue');

        $this->assertStringContainsString(
            '...this.settings',
            $source,
            'Fetched settings should be merged into the defaults so that no key becomes undefined'
        );
    }

    public function testCompiledSettingsAssetIncludesTheDefaults()
    {
        $asset = file_get_contents(__DIR__ . '/../../js/duplicatefinder-settings.js');

        $this->assertStringContainsString(
            'settings:{backgroundjob_interval_find:"",backgroundjob_interval_cleanup:""',
            $asset,
            'Compiled settings bundle should include the defined initial settings'
        );
    }
}
