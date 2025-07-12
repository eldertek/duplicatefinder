<?php

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class BulkDeleteCheckboxTest extends TestCase
{
    /**
     * Test that checkbox names are unique to prevent array error
     * This tests the fix for issue #145
     */
    public function testCheckboxNamesAreUnique()
    {
        // Read the Vue component
        $componentPath = __DIR__ . '/../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        // Check that group checkboxes have unique names with hash
        $this->assertMatchesRegularExpression(
            '/:name="`group-select-\${hash}`"/',
            $componentContent,
            'Group checkboxes should have unique names including the hash'
        );

        // Check that file checkboxes have unique names with hash and index
        $this->assertMatchesRegularExpression(
            '/:name="`file-select-\${hash}-\${index}`"/',
            $componentContent,
            'File checkboxes should have unique names including hash and index'
        );

        // Ensure no static name="group-select" exists
        $this->assertDoesNotMatchRegularExpression(
            '/name="group-select"/',
            $componentContent,
            'Static checkbox names should not exist'
        );

        // Ensure no static name="file-select" exists
        $this->assertDoesNotMatchRegularExpression(
            '/name="file-select"/',
            $componentContent,
            'Static checkbox names should not exist'
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
