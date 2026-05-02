<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Platforms\SqlitePlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\DBAL\Schema\Table;
use OCA\DuplicateFinder\Migration\Version0010Date20250414000000;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

class Version0010Date20250414000000Test extends TestCase
{
    public function testCreatesProjectTablesWhenLegacyDuplicateTableIsMissing(): void
    {
        $migration = new Version0010Date20250414000000();
        $schema = $this->createSchemaWrapper();

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $result);
        $this->assertTrue($schema->hasTable('duplicatefinder_dups'));
        $this->assertTrue($schema->hasTable('duplicatefinder_dups_f'));
        $this->assertTrue($schema->hasTable('df_projects'));
        $this->assertTrue($schema->hasTable('df_folders'));
        $this->assertTrue($schema->hasTable('df_duplicates'));
    }

    private function createSchemaWrapper(): ISchemaWrapper
    {
        return new class implements ISchemaWrapper {
            private Schema $schema;

            public function __construct()
            {
                $this->schema = new Schema();
            }

            public function getTable($tableName): Table
            {
                return $this->schema->getTable($tableName);
            }

            public function hasTable($tableName): bool
            {
                return $this->schema->hasTable($tableName);
            }

            public function createTable($tableName): Table
            {
                return $this->schema->createTable($tableName);
            }

            public function dropTable($tableName)
            {
                return $this->schema->dropTable($tableName);
            }

            public function getTables(): array
            {
                return $this->schema->getTables();
            }

            public function getTableNames(): array
            {
                return $this->schema->getTableNames();
            }

            public function getTableNamesWithoutPrefix(): array
            {
                return $this->schema->getTableNames();
            }

            public function getDatabasePlatform(): AbstractPlatform
            {
                return new SqlitePlatform();
            }
        };
    }
}
