<?php

namespace OCA\DuplicateFinder\Tests\Unit\Components;

use PHPUnit\Framework\TestCase;

class BulkDeleteSortTest extends TestCase
{
    /**
     * Test that sort functionality is properly implemented
     * This tests the fix for issue #151
     */
    public function testSortBySize()
    {
        $componentPath = __DIR__ . '/../../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        // Check that sort dropdown exists
        $this->assertStringContainsString(
            'NcActions',
            $componentContent,
            'NcActions component should be used for sort dropdown'
        );

        // Check sort options
        $sortOptions = [
            'Default order',
            'Size (largest first)',
            'Size (smallest first)',
        ];

        foreach ($sortOptions as $option) {
            $this->assertStringContainsString(
                $option,
                $componentContent,
                "Sort option '$option' should exist"
            );
        }

        // Check sort state management
        $this->assertStringContainsString(
            'sortOption:',
            $componentContent,
            'sortOption data property should exist'
        );

        // Check setSortOption method
        $this->assertStringContainsString(
            'setSortOption',
            $componentContent,
            'setSortOption method should exist'
        );

        // Check sortedDuplicateGroups computed property
        $this->assertStringContainsString(
            'sortedDuplicateGroups',
            $componentContent,
            'sortedDuplicateGroups computed property should exist'
        );

        // Check that getTotalSizeOfDuplicate is imported
        $this->assertStringContainsString(
            'getTotalSizeOfDuplicate',
            $componentContent,
            'getTotalSizeOfDuplicate utility should be imported'
        );
    }

    /**
     * Test sort implementation logic
     */
    public function testSortImplementation()
    {
        $componentPath = __DIR__ . '/../../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentPath);

        // Extract the sortedDuplicateGroups computed property
        preg_match('/sortedDuplicateGroups\(\)\s*{([^}]+(?:{[^}]+}[^}]+)*)}/', $componentContent, $matches);
        $sortLogic = $matches[0] ?? '';

        // Check sort logic for size-desc
        $this->assertStringContainsString(
            "sortOption === 'size-desc'",
            $sortLogic,
            'Should have logic for sorting by size descending'
        );

        // Check sort logic for size-asc
        $this->assertStringContainsString(
            "sortOption === 'size-asc'",
            $sortLogic,
            'Should have logic for sorting by size ascending'
        );

        // Check that it uses getTotalSizeOfDuplicate for sorting
        $this->assertStringContainsString(
            'getTotalSizeOfDuplicate',
            $sortLogic,
            'Should use getTotalSizeOfDuplicate for size calculation'
        );

        // Check sort comparison logic
        $this->assertStringContainsString(
            'sizeB - sizeA',
            $sortLogic,
            'Should sort descending (largest first)'
        );

        $this->assertStringContainsString(
            'sizeA - sizeB',
            $sortLogic,
            'Should sort ascending (smallest first)'
        );
    }

    /**
     * Test UI elements for sorting
     */
    public function testSortUIElements()
    {
        $componentPath = __DIR__ . '/../../../src/components/BulkDeletionSettings.vue';
        $componentContent = file_get_contents($componentContent);

        // Check ChevronDown icon is imported
        $this->assertStringContainsString(
            'import ChevronDown',
            $componentContent,
            'ChevronDown icon should be imported for dropdown'
        );

        // Check sort button label
        $this->assertStringContainsString(
            'sortButtonLabel',
            $componentContent,
            'sortButtonLabel computed property should exist'
        );

        // Check that sort is applied to the preview list
        $this->assertStringContainsString(
            'v-for="(group, hash) in sortedDuplicateGroups"',
            $componentContent,
            'Preview list should iterate over sortedDuplicateGroups'
        );
    }
}
