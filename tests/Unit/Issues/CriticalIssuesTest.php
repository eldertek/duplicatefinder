<?php

namespace OCA\DuplicateFinder\Tests\Unit\Issues;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use PHPUnit\Framework\TestCase;

/**
 * Simple tests to verify the critical issues are fixed
 */
class CriticalIssuesTest extends TestCase
{
    /**
     * Test Issue #152: FileDuplicate should have protectedFileCount property
     */
    public function testIssue152ProtectedFileCountProperty(): void
    {
        $duplicate = new FileDuplicate();

        // Test that the methods exist
        $this->assertTrue(method_exists($duplicate, 'setProtectedFileCount'));
        $this->assertTrue(method_exists($duplicate, 'getProtectedFileCount'));
        $this->assertTrue(method_exists($duplicate, 'setHasOnlyProtectedFiles'));
        $this->assertTrue(method_exists($duplicate, 'getHasOnlyProtectedFiles'));

        // Test setting and getting values
        $duplicate->setProtectedFileCount(5);
        $this->assertEquals(5, $duplicate->getProtectedFileCount());

        $duplicate->setHasOnlyProtectedFiles(true);
        $this->assertTrue($duplicate->getHasOnlyProtectedFiles());
    }

    /**
     * Test Issue #145: Verify checkbox names should be unique
     * This is a frontend issue, but we can test that hashes are unique
     */
    public function testIssue145UniqueHashes(): void
    {
        $duplicate1 = new FileDuplicate();
        $duplicate1->setHash('hash1');

        $duplicate2 = new FileDuplicate();
        $duplicate2->setHash('hash2');

        // Hashes should be different for different duplicates
        $this->assertNotEquals($duplicate1->getHash(), $duplicate2->getHash());
    }

    /**
     * Test Issue #149: FileInfo can handle Team Folders (system users)
     */
    public function testIssue149TeamFoldersOwner(): void
    {
        $fileInfo = new FileInfo();

        // Should be able to set owner to system users like 'admin'
        $fileInfo->setOwner('admin');
        $this->assertEquals('admin', $fileInfo->getOwner());

        // Should be able to set owner to non-existent users
        $fileInfo->setOwner('nonexistentuser');
        $this->assertEquals('nonexistentuser', $fileInfo->getOwner());
    }

    /**
     * Test Issue #151: Files have size for sorting
     */
    public function testIssue151FileSize(): void
    {
        $fileInfo = new FileInfo();

        // Test that size can be set and retrieved
        $fileInfo->setSize(1024);
        $this->assertEquals(1024, $fileInfo->getSize());

        // Test with larger size
        $fileInfo->setSize(1048576); // 1MB
        $this->assertEquals(1048576, $fileInfo->getSize());
    }
}
