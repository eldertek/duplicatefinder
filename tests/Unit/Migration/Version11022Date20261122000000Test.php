<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Platforms\SqlitePlatform;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\DBAL\Schema\Table;
use OCA\DuplicateFinder\Migration\Version11022Date20261122000000;
use OCP\DB\IResult;
use OCP\DB\ISchemaWrapper;
use OCP\DB\QueryBuilder\ICompositeExpression;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IParameter;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\QueryBuilder\IQueryFunction;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;

class Version11022Date20261122000000Test extends TestCase
{
    public function testDropsNonUniqueIndexAndAddsUniquePathHashIndex(): void
    {
        $migration = new Version11022Date20261122000000($this->createMock(IDBConnection::class));
        $schema = $this->createSchemaWrapper();
        $table = $schema->createTable('duplicatefinder_finfo');
        $table->addColumn('id', 'integer', ['notnull' => true]);
        $table->addColumn('path_hash', 'string', ['notnull' => false, 'length' => 40]);
        $table->addIndex(['path_hash'], 'duplicatefinder_ph_idx');

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $result);
        $updated = $schema->getTable('duplicatefinder_finfo');
        $this->assertFalse($updated->hasIndex('duplicatefinder_ph_idx'));
        $this->assertTrue($updated->hasIndex('duplicatefinder_ph_uniq_idx'));
        $index = $updated->getIndex('duplicatefinder_ph_uniq_idx');
        $this->assertTrue($index->isUnique());
        $this->assertSame(['path_hash'], $index->getColumns());
    }

    public function testKeepsExistingUniquePathHashIndex(): void
    {
        $migration = new Version11022Date20261122000000($this->createMock(IDBConnection::class));
        $schema = $this->createSchemaWrapper();
        $table = $schema->createTable('duplicatefinder_finfo');
        $table->addColumn('id', 'integer', ['notnull' => true]);
        $table->addColumn('path_hash', 'string', ['notnull' => false, 'length' => 40]);
        $table->addUniqueIndex(['path_hash'], 'duplicatefinder_ph_uniq_idx');

        $result = $migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schema,
            []
        );

        $this->assertSame($schema, $result);
        $this->assertCount(1, $schema->getTable('duplicatefinder_finfo')->getIndexes());
    }

    public function testSkipsWhenTableOrColumnMissing(): void
    {
        $migration = new Version11022Date20261122000000($this->createMock(IDBConnection::class));
        $emptySchema = $this->createSchemaWrapper();

        $this->assertNull($migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $emptySchema,
            []
        ));

        $schemaNoCol = $this->createSchemaWrapper();
        $table = $schemaNoCol->createTable('duplicatefinder_finfo');
        $table->addColumn('id', 'integer', ['notnull' => true]);

        $this->assertNull($migration->changeSchema(
            $this->createMock(IOutput::class),
            static fn () => $schemaNoCol,
            []
        ));
    }

    public function testPreSchemaChangeBackfillsEmptyHashesAndDeduplicatesKeepingHashedRow(): void
    {
        $schema = $this->createSchemaWrapper();
        $table = $schema->createTable('duplicatefinder_finfo');
        $table->addColumn('id', 'integer', ['notnull' => true]);
        $table->addColumn('path', 'string', ['notnull' => true, 'length' => 700]);
        $table->addColumn('path_hash', 'string', ['notnull' => false, 'length' => 40]);

        $hashA = sha1('/alice/files/movie.mkv');
        $hashB = sha1('/bob/files/archive.tar');

        // Sequence of fetchAll() calls in preSchemaChange:
        // 1. backfillEmptyPathHashes -> 1 row with empty path_hash
        // 2. removeDuplicatePathHashRows GROUP BY -> [$hashA, $hashB]
        // 3. removeDuplicatePathHashRows detail rows -> 4 rows (2 for hashA, 2 for hashB)
        // 4. removeDuplicatePathHashRows GROUP BY -> [] (done)
        $fetchAllQueue = [
            [['id' => 5, 'path' => '/alice/files/missing.bin']],
            [$hashA, $hashB],
            [
                ['id' => 10, 'path_hash' => $hashA, 'file_hash' => null],
                ['id' => 11, 'path_hash' => $hashA, 'file_hash' => 'sha256_a'],
                ['id' => 20, 'path_hash' => $hashB, 'file_hash' => 'sha256_b'],
                ['id' => 21, 'path_hash' => $hashB, 'file_hash' => 'sha256_b'],
            ],
            [],
        ];
        $updates = [];
        $deletedIds = [];

        $db = $this->createMock(IDBConnection::class);
        $db->expects($this->once())->method('beginTransaction');
        $db->expects($this->once())->method('commit');
        $db->method('getQueryBuilder')->willReturnCallback(
            function () use (&$fetchAllQueue, &$updates, &$deletedIds): IQueryBuilder {
                return $this->createQueryBuilder($fetchAllQueue, $updates, $deletedIds);
            }
        );

        $output = $this->createMock(IOutput::class);
        $output->expects($this->exactly(2))->method('info');

        $migration = new Version11022Date20261122000000($db);
        $migration->preSchemaChange($output, static fn () => $schema, []);

        // Row 5 received sha1('/alice/files/missing.bin')
        $this->assertSame([[sha1('/alice/files/missing.bin'), 5]], $updates);
        // For $hashA, id=11 had file_hash so id=10 is deleted; for $hashB, id=20 already had file_hash so id=21 is deleted
        $this->assertSame([[10, 21]], $deletedIds);
    }

    /**
     * @param array<int, array<mixed>> $fetchAllQueue
     * @param array<int, array{0: string, 1: int}> $updates
     * @param array<int, array<int>> $deletedIds
     */
    private function createQueryBuilder(array &$fetchAllQueue, array &$updates, array &$deletedIds): IQueryBuilder
    {
        $qb = $this->createMock(IQueryBuilder::class);
        $state = [
            'mode' => '',
            'sets' => [],
            'params' => [],
        ];

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(fn ($x, $y): string => (string)$x . ' = ' . (string)$y);
        $expr->method('neq')->willReturnCallback(fn ($x, $y): string => (string)$x . ' <> ' . (string)$y);
        $expr->method('in')->willReturnCallback(fn ($x, $y): string => (string)$x . ' IN (' . (string)$y . ')');
        $expr->method('isNull')->willReturnCallback(fn ($x): string => (string)$x . ' IS NULL');
        $expr->method('isNotNull')->willReturnCallback(fn ($x): string => (string)$x . ' IS NOT NULL');
        $expr->method('orX')->willReturnCallback(function (...$parts): ICompositeExpression {
            $comp = $this->getMockBuilder(ICompositeExpression::class)
                ->onlyMethods(get_class_methods(ICompositeExpression::class))
                ->addMethods(['__toString'])
                ->getMock();
            $comp->method('__toString')->willReturn('(' . implode(' OR ', array_map('strval', $parts)) . ')');

            return $comp;
        });

        $qb->method('expr')->willReturn($expr);
        $qb->method('createFunction')->willReturnCallback(function (string $call): IQueryFunction {
            $qf = $this->createMock(IQueryFunction::class);
            $qf->method('__toString')->willReturn($call);

            return $qf;
        });
        $qb->method('createNamedParameter')->willReturnCallback(function ($value) use (&$state): IParameter {
            $name = ':p_' . count($state['params']);
            $state['params'][$name] = $value;
            $param = $this->createMock(IParameter::class);
            $param->method('__toString')->willReturn($name);

            return $param;
        });
        $qb->method('select')->willReturnCallback(function () use ($qb, &$state): IQueryBuilder {
            $state['mode'] = 'select';

            return $qb;
        });
        $qb->method('update')->willReturnCallback(function () use ($qb, &$state): IQueryBuilder {
            $state['mode'] = 'update';

            return $qb;
        });
        $qb->method('delete')->willReturnCallback(function () use ($qb, &$state): IQueryBuilder {
            $state['mode'] = 'delete';

            return $qb;
        });
        $qb->method('set')->willReturnCallback(function ($col, $param) use ($qb, &$state): IQueryBuilder {
            $state['sets'][$col] = $state['params'][(string)$param] ?? null;

            return $qb;
        });
        $qb->method('from')->willReturn($qb);
        $qb->method('where')->willReturnCallback(function (...$predicates) use ($qb, &$state): IQueryBuilder {
            foreach ($predicates as $p) {
                $state['wheres'][] = (string)$p;
            }

            return $qb;
        });
        $qb->method('andWhere')->willReturn($qb);
        $qb->method('groupBy')->willReturn($qb);
        $qb->method('having')->willReturn($qb);
        $qb->method('orderBy')->willReturn($qb);
        $qb->method('setMaxResults')->willReturn($qb);

        $result = $this->createMock(IResult::class);
        $result->method('fetchAll')->willReturnCallback(function () use (&$fetchAllQueue): array {
            return array_shift($fetchAllQueue) ?? [];
        });
        $qb->method('executeQuery')->willReturn($result);
        $qb->method('executeStatement')->willReturnCallback(function () use (&$state, &$updates, &$deletedIds): int {
            if ($state['mode'] === 'update') {
                $id = null;
                foreach ($state['params'] as $value) {
                    if (is_int($value)) {
                        $id = $value;
                    }
                }
                $updates[] = [(string)($state['sets']['path_hash'] ?? ''), (int)$id];

                return 1;
            }
            if ($state['mode'] === 'delete') {
                foreach ($state['params'] as $value) {
                    if (is_array($value)) {
                        $deletedIds[] = $value;

                        return count($value);
                    }
                }
            }

            return 0;
        });

        return $qb;
    }

    private function createSchemaWrapper(): ISchemaWrapper
    {
        return new class () implements ISchemaWrapper {
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
