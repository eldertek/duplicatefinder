<?php

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class DeleteFileLockedTest extends TestCase
{
    public function testDeleteFileShowsSpecificLockedFileNotification()
    {
        $apiPath = __DIR__ . '/../../src/tools/api.js';
        $apiContent = file_get_contents($apiPath);

        $this->assertStringContainsString(
            "case 'FILE_LOCKED':",
            $apiContent,
            'deleteFile should handle the backend FILE_LOCKED error code explicitly'
        );

        $this->assertStringContainsString(
            'File is currently locked. Please try again later.',
            $apiContent,
            'Locked files should not fall back to the generic delete error notification'
        );
    }

    public function testCompiledMainAssetIncludesLockedFileNotification()
    {
        $assetPath = __DIR__ . '/../../js/duplicatefinder-main.js';
        $assetContent = file_get_contents($assetPath);

        $this->assertStringContainsString(
            'FILE_LOCKED',
            $assetContent,
            'Compiled app bundle should include the FILE_LOCKED delete error case'
        );

        $this->assertStringContainsString(
            'File is currently locked. Please try again later.',
            $assetContent,
            'Compiled app bundle should include the locked-file notification'
        );
    }
}
