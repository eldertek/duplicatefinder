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
}
