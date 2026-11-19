<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Platforms\SqlitePlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\DBAL\Schema\Table;
use OCA\DuplicateFinder\Migration\Version11019Date20261119000500;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

class Version11019Date20261119000500Test extends TestCase
{
    public function testAddsAcknowledgedHashTypeIndex(): void
    {
        $migration = new Version11019Date20261119000500();
        $schema = $this->createSchemaWrapper();
        $table = $schema->createTable('duplicatefinder_dups');
        $table->addColumn('id', 'integer', ['notnull' => true]);
        $table->addColumn('type', 'string', ['notnull' => true, 'length' => 200]);
        $table->addColumn('hash', 'string', ['notnull' => true, 'length' => 200]);
        $table->addColumn('acknowledged', 'boolean', ['notnull' => false, 'default' => false]);

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $result);
        $index = $schema->getTable('duplicatefinder_dups')->getIndex('duplicatefinder_dups_ack_hash_type_idx');
        $this->assertSame(['acknowledged', 'hash', 'type'], $index->getColumns());
    }

    public function testKeepsAnExistingAcknowledgedIndex(): void
    {
        $migration = new Version11019Date20261119000500();
        $schema = $this->createSchemaWrapper();
        $table = $schema->createTable('duplicatefinder_dups');
        $table->addColumn('type', 'string', ['notnull' => true, 'length' => 200]);
        $table->addColumn('hash', 'string', ['notnull' => true, 'length' => 200]);
        $table->addColumn('acknowledged', 'boolean', ['notnull' => false]);
        $table->addIndex(['acknowledged', 'hash', 'type'], 'duplicatefinder_dups_ack_hash_type_idx');

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $result);
        $this->assertCount(1, $schema->getTable('duplicatefinder_dups')->getIndexes());
    }

    public function testSkipsWhenDuplicatesTableIsMissing(): void
    {
        $migration = new Version11019Date20261119000500();
        $schema = $this->createSchemaWrapper();

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertNull($result);
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
