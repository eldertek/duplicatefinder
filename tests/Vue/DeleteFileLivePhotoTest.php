<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Vue;

use PHPUnit\Framework\TestCase;

class DeleteFileLivePhotoTest extends TestCase
{
    public function testDeleteFileShowsSpecificLivePhotoNotification(): void
    {
        $apiPath = __DIR__ . '/../../src/tools/api.js';
        $apiContent = (string) file_get_contents($apiPath);

        $this->assertStringContainsString(
            "case 'LIVE_PHOTO_VIDEO_PROTECTED':",
            $apiContent,
            'deleteFile should handle the backend LIVE_PHOTO_VIDEO_PROTECTED error code explicitly'
        );

        $this->assertStringContainsString(
            'Cannot delete the video part of a Live Photo directly. Delete the paired photo instead only if both files are redundant.',
            $apiContent,
            'Live Photo video deletions should explain Nextcloud Live Photo protection clearly'
        );

        $this->assertStringContainsString(
            "case 'DELETE_ABORTED':",
            $apiContent,
            'deleteFile should handle generic Nextcloud DELETE_ABORTED responses explicitly'
        );
    }

    public function testCompiledMainAssetIncludesLivePhotoNotification(): void
    {
        $assetPath = __DIR__ . '/../../js/duplicatefinder-main.js';
        $assetContent = (string) file_get_contents($assetPath);

        $this->assertStringContainsString(
            'LIVE_PHOTO_VIDEO_PROTECTED',
            $assetContent,
            'Compiled app bundle should include the LIVE_PHOTO_VIDEO_PROTECTED delete error case'
        );

        $this->assertStringContainsString(
            'Cannot delete the video part of a Live Photo directly. Delete the paired photo instead only if both files are redundant.',
            $assetContent,
            'Compiled app bundle should include the Live Photo explanation'
        );
    }
}
