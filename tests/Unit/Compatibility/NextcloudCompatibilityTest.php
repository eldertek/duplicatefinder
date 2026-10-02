<?php

namespace OCA\DuplicateFinder\Tests\Unit\Compatibility;

use PHPUnit\Framework\TestCase;

class NextcloudCompatibilityTest extends TestCase
{
    public function testNextcloud33QueryBuilderApiIsUsed(): void
    {
        $paths = [
            'lib/Db/EQBMapper.php',
            'lib/Db/ProjectMapper.php',
            'lib/Migration/RepairNullTypes.php',
        ];

        foreach ($paths as $path) {
            $content = file_get_contents(__DIR__ . '/../../../' . $path);

            $this->assertStringNotContainsString(
                '->execute()',
                $content,
                $path . ' should use executeQuery() or executeStatement() for QueryBuilder calls'
            );
        }
    }

    public function testAppInfoAllowsNextcloud33(): void
    {
        $content = file_get_contents(__DIR__ . '/../../../appinfo/info.xml');

        $this->assertMatchesRegularExpression('/max-version="(\d+)"/', $content, 'Nextcloud max-version should be declared');
        preg_match('/max-version="(\d+)"/', $content, $matches);

        $this->assertGreaterThanOrEqual(33, (int)$matches[1]);
    }

    public function testAppInfoAllowsNextcloud35(): void
    {
        $content = file_get_contents(__DIR__ . '/../../../appinfo/info.xml');

        $this->assertMatchesRegularExpression(
            '/<nextcloud min-version="(\d+)" max-version="(\d+)"\/>/',
            $content,
            'Nextcloud min-version and max-version should be declared'
        );
        preg_match('/<nextcloud min-version="(\d+)" max-version="(\d+)"\/>/', $content, $matches);

        $this->assertGreaterThanOrEqual(
            35,
            (int)$matches[2],
            'Without max-version 35 the App Store refuses the app on Nextcloud 35 (issue 189)'
        );
        $this->assertLessThanOrEqual(
            (int)$matches[2],
            (int)$matches[1],
            'min-version must not exceed max-version'
        );
    }
}
