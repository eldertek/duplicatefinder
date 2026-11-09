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
 * Issue #197: FileInfoMapper::findDuplicateGroupsAcrossUsers and findCopiesOfHashes exclude shared views
 * (where path does not start with /<owner>/) by default, and include them when $includeShared is true.
 */
class FileInfoMapperSharedViewTest extends TestCase
{
    private $db;
    private $logger;
    private $mapper;
    private $wheres;
    private $params;

    protected function setUp(): void
    {
        parent::setUp();

        $this->wheres = [];
        $this->params = [];
        $this->db = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        $this->db->method('getQueryBuilder')->willReturnCallback(function (): IQueryBuilder {
            return $this->createRecordingQueryBuilder();
        });

        $this->mapper = new FileInfoMapper($this->db, $this->logger);
    }

    public function testFindDuplicateGroupsAcrossUsersExcludesSharedViewsByDefault(): void
    {
        iterator_to_array($this->mapper->findDuplicateGroupsAcrossUsers(1, 10));

        $joined = implode(' AND ', $this->wheres);
        $this->assertStringContainsString('(owner IS NULL OR owner = :param_3 OR path LIKE CONCAT(:param_4, owner, :param_5))', $joined);
        $this->assertSame('', $this->params[':param_3']);
        $this->assertSame('/', $this->params[':param_4']);
        $this->assertSame('/%', $this->params[':param_5']);
    }

    public function testFindDuplicateGroupsAcrossUsersIncludesSharedViewsWhenRequested(): void
    {
        iterator_to_array($this->mapper->findDuplicateGroupsAcrossUsers(1, 10, true));

        $joined = implode(' AND ', $this->wheres);
        $this->assertStringNotContainsString('owner IS NULL', $joined);
        $this->assertStringNotContainsString('path LIKE', $joined);
    }

    public function testFindCopiesOfHashesExcludesSharedViewsByDefault(): void
    {
        $this->mapper->findCopiesOfHashes(['abc']);

        $joined = implode(' AND ', $this->wheres);
        $this->assertStringContainsString('(owner IS NULL OR owner = :param_2 OR path LIKE CONCAT(:param_3, owner, :param_4))', $joined);
    }

    public function testFindCopiesOfHashesIncludesSharedViewsWhenRequested(): void
    {
        $this->mapper->findCopiesOfHashes(['abc'], true);

        $joined = implode(' AND ', $this->wheres);
        $this->assertStringNotContainsString('owner IS NULL', $joined);
        $this->assertStringNotContainsString('path LIKE', $joined);
    }

    private function createRecordingQueryBuilder(): IQueryBuilder
    {
        $qb = $this->createMock(IQueryBuilder::class);
        $wheresRef = &$this->wheres;
        $paramsRef = &$this->params;

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(fn ($x, $y) => (string)$x . ' = ' . (string)$y);
        $expr->method('neq')->willReturnCallback(fn ($x, $y) => (string)$x . ' <> ' . (string)$y);
        $expr->method('gte')->willReturnCallback(fn ($x, $y) => (string)$x . ' >= ' . (string)$y);
        $expr->method('in')->willReturnCallback(fn ($x, $y) => (string)$x . ' IN (' . (string)$y . ')');
        $expr->method('isNull')->willReturnCallback(fn ($x) => (string)$x . ' IS NULL');
        $expr->method('isNotNull')->willReturnCallback(fn ($x) => (string)$x . ' IS NOT NULL');
        $expr->method('like')->willReturnCallback(fn ($x, $y) => (string)$x . ' LIKE ' . (string)$y);
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
        $qb->method('select')->willReturn($qb);
        $qb->method('selectAlias')->willReturn($qb);
        $qb->method('from')->willReturn($qb);
        $qb->method('where')->willReturnCallback(function (...$predicates) use ($qb, &$wheresRef): IQueryBuilder {
            foreach ($predicates as $p) {
                $wheresRef[] = (string)$p;
            }

            return $qb;
        });
        $qb->method('andWhere')->willReturnCallback(function (...$predicates) use ($qb, &$wheresRef): IQueryBuilder {
            foreach ($predicates as $p) {
                $wheresRef[] = (string)$p;
            }

            return $qb;
        });
        $qb->method('groupBy')->willReturn($qb);
        $qb->method('having')->willReturn($qb);
        $qb->method('orderBy')->willReturn($qb);
        $qb->method('addOrderBy')->willReturn($qb);
        $qb->method('setMaxResults')->willReturn($qb);

        $result = $this->createMock(IResult::class);
        $result->method('fetch')->willReturn(false);
        $qb->method('executeQuery')->willReturn($result);

        return $qb;
    }
}
