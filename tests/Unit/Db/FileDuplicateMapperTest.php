<?php

namespace OCA\DuplicateFinder\Tests\Unit\Db;

use OCA\DuplicateFinder\Db\FileDuplicateMapper;
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
 * Issue #202: FileDuplicateMapper::findAll and getTotalCount must filter by $user and $type in SQL
 * instead of scanning the entire global duplicatefinder_dups table in PHP.
 */
class FileDuplicateMapperTest extends TestCase
{
    private $db;
    private $logger;
    private $mapper;
    private $queries;
    private $params;
    private $fetchQueue;

    protected function setUp(): void
    {
        parent::setUp();

        $this->queries = [];
        $this->params = [];
        $this->fetchQueue = [false];
        $this->db = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->db->method('escapeLikeParameter')->willReturnCallback(function (string $param): string {
            return str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $param);
        });

        $this->db->method('getQueryBuilder')->willReturnCallback(function (): IQueryBuilder {
            return $this->createRecordingQueryBuilder();
        });

        $this->mapper = new FileDuplicateMapper($this->db, $this->logger);
    }

    public function testFindAllAppliesUserAndTypeFiltersInSql(): void
    {
        $result = $this->mapper->findAll('alice', 50, 0, [['hash'], ['type']], 'unacknowledged');

        $this->assertSame([], $result);
        $this->assertNotEmpty($this->queries);

        $mainQuery = $this->queries[0];
        $this->assertContains('d.acknowledged = :param_0', $mainQuery['wheres']);
        $this->assertSame(false, $this->params[':param_0']);

        $existsFound = false;
        foreach ($mainQuery['wheres'] as $where) {
            if (strpos($where, 'EXISTS (SELECT 1 FROM duplicatefinder_finfo f') !== false) {
                $existsFound = true;
                $this->assertStringContainsString('f.file_hash = d.hash', $where);
                $this->assertStringContainsString('f.ignored = :param_1', $where);
                $this->assertStringContainsString('f.path LIKE :param_2', $where);
                $this->assertStringContainsString('f.owner = :param_3', $where);
                $this->assertStringContainsString('f.path NOT LIKE :param_4', $where);
                $this->assertStringContainsString('GROUP BY f.file_hash HAVING COUNT(*) > 1', $where);
            }
        }
        $this->assertTrue($existsFound, 'Expected EXISTS subquery on duplicatefinder_finfo');
        $this->assertSame(0, $this->params[':param_1']);
        $this->assertSame('/alice/%', $this->params[':param_2']);
        $this->assertSame('alice', $this->params[':param_3']);
        $this->assertSame('/%/files/%', $this->params[':param_4']);
    }

    public function testFindAllWithoutUserOmitsExistsSubquery(): void
    {
        $this->mapper->findAll(null, 20, 0, [['hash'], ['type']], 'acknowledged');

        $mainQuery = $this->queries[0];
        $this->assertContains('d.acknowledged = :param_0', $mainQuery['wheres']);
        $this->assertSame(true, $this->params[':param_0']);
        foreach ($mainQuery['wheres'] as $where) {
            $this->assertStringNotContainsString('EXISTS', $where);
        }
    }

    public function testGetTotalCountAppliesUserAndTypeFiltersInSql(): void
    {
        $this->fetchQueue = [['total_count' => 7], false];
        $count = $this->mapper->getTotalCount('unacknowledged', 'bob_user');

        $this->assertSame(7, $count);
        $mainQuery = $this->queries[0];
        $this->assertContains('d.acknowledged = :param_0', $mainQuery['wheres']);
        $this->assertSame('/bob\\_user/%', $this->params[':param_2']);
        $this->assertSame('bob_user', $this->params[':param_3']);
    }

    private function createRecordingQueryBuilder(): IQueryBuilder
    {
        $qb = $this->createMock(IQueryBuilder::class);
        $index = count($this->queries);
        $this->queries[$index] = [
            'select' => [],
            'from' => '',
            'wheres' => [],
            'groupBy' => [],
            'having' => '',
        ];
        $queriesRef = &$this->queries;
        $paramsRef = &$this->params;
        $fetchQueueRef = &$this->fetchQueue;

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(function ($x, $y): string {
            return (string)$x . ' = ' . (string)$y;
        });
        $expr->method('like')->willReturnCallback(function ($x, $y): string {
            return (string)$x . ' LIKE ' . (string)$y;
        });
        $expr->method('notLike')->willReturnCallback(function ($x, $y): string {
            return (string)$x . ' NOT LIKE ' . (string)$y;
        });
        $expr->method('andX')->willReturnCallback(function (...$parts): ICompositeExpression {
            $comp = $this->getMockBuilder(ICompositeExpression::class)
                ->onlyMethods(get_class_methods(ICompositeExpression::class))
                ->addMethods(['__toString'])
                ->getMock();
            $comp->method('__toString')->willReturn('(' . implode(' AND ', array_map('strval', $parts)) . ')');

            return $comp;
        });
        $expr->method('orX')->willReturnCallback(function (...$parts): ICompositeExpression {
            $comp = $this->getMockBuilder(ICompositeExpression::class)
                ->onlyMethods(get_class_methods(ICompositeExpression::class))
                ->addMethods(['__toString'])
                ->getMock();
            $comp->method('__toString')->willReturn('(' . implode(' OR ', array_map('strval', $parts)) . ')');

            return $comp;
        });

        $func = $this->createMock(IFunctionBuilder::class);
        $func->method('count')->willReturnCallback(function ($col, $alias = ''): IQueryFunction {
            $qf = $this->createMock(IQueryFunction::class);
            $qf->method('__toString')->willReturn('COUNT(' . $col . ')');

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
        $qb->method('from')->willReturnCallback(function ($table, $alias = null) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['from'] = $table . ($alias ? ' ' . $alias : '');

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
        $qb->method('setMaxResults')->willReturn($qb);
        $qb->method('setFirstResult')->willReturn($qb);
        $qb->method('orderBy')->willReturn($qb);
        $qb->method('addOrderBy')->willReturn($qb);
        $qb->method('groupBy')->willReturnCallback(function (...$groups) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['groupBy'] = array_map('strval', $groups);

            return $qb;
        });
        $qb->method('having')->willReturnCallback(function ($having) use ($qb, $index, &$queriesRef): IQueryBuilder {
            $queriesRef[$index]['having'] = (string)$having;

            return $qb;
        });
        $qb->method('getSQL')->willReturnCallback(function () use ($index, &$queriesRef): string {
            $q = $queriesRef[$index];
            $sql = 'SELECT ' . implode(', ', $q['select']) . ' FROM ' . $q['from'];
            if (!empty($q['wheres'])) {
                $sql .= ' WHERE ' . implode(' AND ', $q['wheres']);
            }
            if (!empty($q['groupBy'])) {
                $sql .= ' GROUP BY ' . implode(', ', $q['groupBy']);
            }
            if ($q['having'] !== '') {
                $sql .= ' HAVING ' . $q['having'];
            }

            return $sql;
        });

        $result = $this->createMock(IResult::class);
        $result->method('fetch')->willReturnCallback(function () use (&$fetchQueueRef) {
            return array_shift($fetchQueueRef) ?? false;
        });
        $qb->method('executeQuery')->willReturn($result);

        return $qb;
    }
}
