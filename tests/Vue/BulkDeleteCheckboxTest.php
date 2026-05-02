<?php

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class BulkDeleteCheckboxTest extends TestCase
{
    /**
     * Test that bulk delete checkboxes do not opt into checkbox-group mode.
     * This tests the fix for issue #145.
     */
    public function testBulkDeleteCheckboxesDoNotUseNamesWithBooleanCheckedBindings()
    {
        $componentPath = __DIR__ . '/../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        $this->assertStringNotContainsString(
            ':name="`group-select-${hash}`"',
            $componentContent,
            'Named boolean group checkboxes trigger NcCheckboxRadioSwitch checkbox-group mode'
        );

        $this->assertStringNotContainsString(
            ':name="`file-select-${hash}-${index}`"',
            $componentContent,
            'Named boolean file checkboxes trigger NcCheckboxRadioSwitch checkbox-group mode'
        );

        $this->assertDoesNotMatchRegularExpression(
            '/<NcCheckboxRadioSwitch\b[^>]*\bname=/s',
            $componentContent,
            'Bulk delete NcCheckboxRadioSwitch instances should not pass a name prop'
        );
    }

    /**
     * Test that the served compiled asset matches the Vue source fix.
     */
    public function testCompiledBulkDeleteAssetDoesNotUseCheckboxNames()
    {
        $assetPath = __DIR__ . '/../../js/duplicatefinder-main.js';
        $assetContent = file_get_contents($assetPath);

        $this->assertStringNotContainsString(
            'group-select',
            $assetContent,
            'Compiled asset should not include group checkbox names'
        );

        $this->assertStringNotContainsString(
            'file-select',
            $assetContent,
            'Compiled asset should not include file checkbox names'
        );
    }

    /**
     * Test that checkboxes use NcCheckboxRadioSwitch component correctly
     */
    public function testCheckboxComponentUsage()
    {
        $componentPath = __DIR__ . '/../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        // Check that NcCheckboxRadioSwitch is imported
        $this->assertStringContainsString(
            'NcCheckboxRadioSwitch',
            $componentContent,
            'NcCheckboxRadioSwitch should be imported'
        );

        // Check that checkboxes use :checked binding (not v-model)
        $this->assertStringContainsString(
            ':checked="isGroupSelected(hash)"',
            $componentContent,
            'Group checkboxes should use :checked binding'
        );

        $this->assertStringContainsString(
            ':checked="isFileSelected(hash, index)"',
            $componentContent,
            'File checkboxes should use :checked binding'
        );

        // Check that checkboxes use @update:checked event
        $this->assertStringContainsString(
            '@update:checked="toggleGroup(hash)"',
            $componentContent,
            'Group checkboxes should use @update:checked event'
        );

        $this->assertStringContainsString(
            '@update:checked="toggleFile(hash, index)"',
            $componentContent,
            'File checkboxes should use @update:checked event'
        );
    }

    /**
     * Test the methods that handle checkbox state
     */
    public function testCheckboxStateMethods()
    {
        $componentPath = __DIR__ . '/../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        // Check isGroupSelected method exists
        $this->assertStringContainsString(
            'isGroupSelected(hash)',
            $componentContent,
            'isGroupSelected method should exist'
        );

        // Check isFileSelected method exists
        $this->assertStringContainsString(
            'isFileSelected(hash, index)',
            $componentContent,
            'isFileSelected method should exist'
        );

        // Check toggleGroup method exists
        $this->assertStringContainsString(
            'toggleGroup(hash)',
            $componentContent,
            'toggleGroup method should exist'
        );

        // Check toggleFile method exists
        $this->assertStringContainsString(
            'toggleFile(hash, index)',
            $componentContent,
            'toggleFile method should exist'
        );

        // Verify selectedFiles is managed as an object with arrays
        $this->assertStringContainsString(
            'this.selectedFiles[hash]',
            $componentContent,
            'selectedFiles should be accessed as object with hash keys'
        );
    }
}
