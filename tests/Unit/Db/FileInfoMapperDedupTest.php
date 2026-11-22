<?php

namespace OCA\DuplicateFinder\Tests\Unit\Db;

use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\ICompositeExpression;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IFunctionBuilder;
use OCP\DB\QueryBuilder\IParameter;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\QueryBuilder\IQueryFunction;
use OCP\IDBConnection;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Issue #248: FileInfoMapper deduplication in removeSurplusRows, deleteOtherByPathHash,
 * findDuplicateGroupsAcrossUsers, and findCopiesOfHashes.
 */
class FileInfoMapperDedupTest extends TestCase
{
    private $db;
    private $logger;
    private $mapper;
    private $queries;
    private $params;
    private $fetchQueue;
    private $fetchAllQueue;
    private $deletedBatches;

    protected function setUp(): void
    {
        parent::setUp();

        $this->queries = [];
        $this->params = [];
        $this->fetchQueue = [];
        $this->fetchAllQueue = [];
        $this->deletedBatches = [];
        $this->db = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->db->method('getQueryBuilder')->willReturnCallback(function (): IQueryBuilder {
            return $this->createRecordingQueryBuilder();
        });

        $this->mapper = new FileInfoMapper($this->db, $this->logger);
    }

    public function testFindDuplicateGroupsAcrossUsersCountsDistinctPaths(): void
    {
        iterator_to_array($this->mapper->findDuplicateGroupsAcrossUsers(1, 10));

        $q = $this->queries[0];
        $this->assertContains('COUNT(DISTINCT path) AS copies', $q['selectAliases']);
        $this->assertContains('(COUNT(DISTINCT path) - 1) * MAX(size) AS wasted', $q['selectAliases']);
        $this->assertSame('COUNT(DISTINCT path) > 1', $q['having']);
    }

    public function testFindCopiesOfHashesDeduplicatesDuplicatePathsAndPrefersNonEmptyOwner(): void
    {
        $this->fetchQueue = [
            ['file_hash' => 'hash1', 'owner' => '', 'path' => '/alice/files/movie.mkv'],
            ['file_hash' => 'hash1', 'owner' => 'alice', 'path' => '/alice/files/movie.mkv'],
            ['file_hash' => 'hash1', 'owner' => 'bob', 'path' => '/bob/files/movie.mkv'],
            false,
        ];

        $copies = $this->mapper->findCopiesOfHashes(['hash1'], true);

        $this->assertSame([
            'hash1' => [
                ['owner' => 'alice', 'path' => '/alice/files/movie.mkv'],
                ['owner' => 'bob', 'path' => '/bob/files/movie.mkv'],
            ],
        ], $copies);
    }

    public function testRemoveSurplusRowsDeduplicatesByPathHashRegardlessOfOwner(): void
    {
        $this->fetchAllQueue = [
            [15, 29],
        ];

        $removed = $this->mapper->removeSurplusRows(0, 100, 500);

        $this->assertSame(2, $removed);
        $subQuerySql = '';
        foreach ($this->queries[1]['wheres'] as $where) {
            if (str_contains($where, 'EXISTS (')) {
                $subQuerySql = $where;
            }
        }
        $this->assertNotSame('', $subQuerySql);
        $this->assertStringContainsString('k.path_hash = d.path_hash', $subQuerySql);
        $this->assertStringContainsString('k.id < d.id', $subQuerySql);
        $this->assertStringNotContainsString('owner', $subQuerySql);
        $this->assertSame([[15, 29]], $this->deletedBatches);
    }

    public function testDeleteOtherByPathHashSkipsEmptyHashAndDeletesOtherRows(): void
    {
        $this->assertSame(0, $this->mapper->deleteOtherByPathHash('', 10));
        $this->assertEmpty($this->queries);

        $deleted = $this->mapper->deleteOtherByPathHash('abc123', 10);

        $this->assertSame(1, $deleted);
        $this->assertContains('path_hash = :param_0', $this->queries[0]['wheres']);
        $this->assertContains('id <> :param_1', $this->queries[0]['wheres']);
        $this->assertSame('abc123', $this->params[':param_0']);
        $this->assertSame(10, $this->params[':param_1']);
    }

    private function createRecordingQueryBuilder(): IQueryBuilder
    {
        $qb = $this->createMock(IQueryBuilder::class);
        $index = count($this->queries);
        $this->queries[$index] = [
            'select' => [],
            'selectAliases' => [],
            'from' => '',
            'delete' => '',
            'wheres' => [],
            'having' => '',
        ];
        $queriesRef = &$this->queries;
        $paramsRef = &$this->params;
        $fetchQueueRef = &$this->fetchQueue;
        $fetchAllQueueRef = &$this->fetchAllQueue;
        $deletedBatchesRef = &$this->deletedBatches;

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(fn ($x, $y): string => (string)$x . ' = ' . (string)$y);
        $expr->method('neq')->willReturnCallback(fn ($x, $y): string => (string)$x . ' <> ' . (string)$y);
        $expr->method('gt')->willReturnCallback(fn ($x, $y): string => (string)$x . ' > ' . (string)$y);
        $expr->method('gte')->willReturnCallback(fn ($x, $y): string => (string)$x . ' >= ' . (string)$y);
        $expr->method('lt')->willReturnCallback(fn ($x, $y): string => (string)$x . ' < ' . (string)$y);
        $expr->method('lte')->willReturnCallback(fn ($x, $y): string => (string)$x . ' <= ' . (string)$y);
        $expr->method('in')->willReturnCallback(fn ($x, $y): string => (string)$x . ' IN (' . (string)$y . ')');
        $expr->method('isNull')->willReturnCallback(fn ($x): string => (string)$x . ' IS NULL');
        $expr->method('isNotNull')->willReturnCallback(fn ($x): string => (string)$x . ' IS NOT NULL');
        $expr->method('like')->willReturnCallback(fn ($x, $y): string => (string)$x . ' LIKE ' . (string)$y);
        $expr->method('orX')->willReturnCallback(function (...$parts): ICompositeExpression {
            $comp = $this->getMockBuilder(ICompositeExpression::class)
                ->onlyMethods(get_class_methods(ICompositeExpression::class))
                ->addMethods(['__toString'])
                ->getMock();
            $comp->method('__toString')->willReturn('(' . implode(' OR ', array_map('strval', $parts)) . ')');

            return $comp;
        });

        $func = $this->createMock(IFunctionBuilder::class);
        $func->method('concat')->willReturnCallback(function (...$args): IQueryFunction {
            $qf = $this->createMock(IQueryFunction::class);
            $qf->method('__toString')->willReturn('CONCAT(' . implode(', ', array_map('strval', $args)) . ')');

            return $qf;
        });

        $qb->method('expr')->willReturn($expr);
        $qb->method('func')->willReturn($func);
        $qb->method('createFunction')->willReturnCallback(function (string $call): IQueryFunction {
            $qf = $this->createMock(IQueryFunction::class);
            $qf->method('__toString')->willReturn($call);

            return $qf;
        });
        $qb->method('createNamedParameter')->willReturnCallback(function ($value) use (&$paramsRef): IParameter {
            $name = ':param_' . count($paramsRef);
            $paramsRef[$name] = $value;
            $param = $this->createMock(IParameter::class);
            $param->method('__toString')->willReturn($name);

            return $param;
        });
        $qb->method('select')->willReturnCallback(function (...$selects) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['select'] = array_map('strval', $selects);

            return $qb;
        });
        $qb->method('selectAlias')->willReturnCallback(function ($select, string $alias) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['selectAliases'][] = (string)$select . ' AS ' . $alias;

            return $qb;
        });
        $qb->method('from')->willReturnCallback(function ($table, $alias = null) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['from'] = $table . ($alias ? ' ' . $alias : '');

            return $qb;
        });
        $qb->method('delete')->willReturnCallback(function ($table) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['delete'] = $table;

            return $qb;
        });
        $qb->method('where')->willReturnCallback(function (...$predicates) use ($qb, $index, &$queriesRef): IQueryBuilder {
            foreach ($predicates as $p) {
                $queriesRef[$index]['wheres'][] = (string)$p;
            }

            return $qb;
        });
        $qb->method('andWhere')->willReturnCallback(function (...$predicates) use ($qb, $index, &$queriesRef): IQueryBuilder {
            foreach ($predicates as $p) {
                $queriesRef[$index]['wheres'][] = (string)$p;
            }

            return $qb;
        });
        $qb->method('groupBy')->willReturn($qb);
        $qb->method('having')->willReturnCallback(function ($having) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['having'] = (string)$having;

            return $qb;
        });
        $qb->method('orderBy')->willReturn($qb);
        $qb->method('addOrderBy')->willReturn($qb);
        $qb->method('setMaxResults')->willReturn($qb);
        $qb->method('getSQL')->willReturnCallback(function () use ($index, &$queriesRef): string {
            $q = $queriesRef[$index];

            return 'SELECT ' . implode(', ', $q['select']) . ' FROM ' . $q['from'] . ' WHERE ' . implode(' AND ', $q['wheres']);
        });

        $result = $this->createMock(IResult::class);
        $result->method('fetch')->willReturnCallback(function () use (&$fetchQueueRef) {
            return array_shift($fetchQueueRef) ?? false;
        });
        $result->method('fetchAll')->willReturnCallback(function () use (&$fetchAllQueueRef): array {
            return array_shift($fetchAllQueueRef) ?? [];
        });
        $qb->method('executeQuery')->willReturn($result);
        $qb->method('executeStatement')->willReturnCallback(function () use ($index, &$queriesRef, &$paramsRef, &$deletedBatchesRef): int {
            $q = $queriesRef[$index];
            if ($q['delete'] !== '') {
                foreach ($q['wheres'] as $where) {
                    if (preg_match('/id IN \((:param_\d+)\)/', $where, $m) && isset($paramsRef[$m[1]]) && is_array($paramsRef[$m[1]])) {
                        $deletedBatchesRef[] = $paramsRef[$m[1]];

                        return count($paramsRef[$m[1]]);
                    }
                }
            }

            return 1;
        });

        return $qb;
    }
}
