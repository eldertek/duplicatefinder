<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Migration\RemoveFolderFileInfos;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IFunctionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\DB\QueryBuilder\IQueryFunction;
use OCP\DB\IResult;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class RemoveFolderFileInfosTest extends TestCase
{
    private $connection;
    private $logger;
    private $output;
    private $queryBuilder;
    private $repair;

    protected function setUp(): void
    {
        parent::setUp();

        $this->connection = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->output = $this->createMock(IOutput::class);
        $this->queryBuilder = $this->createMock(IQueryBuilder::class);

        $expr = $this->createMock(IExpressionBuilder::class);
        $expr->method('eq')->willReturnCallback(function ($column, $value) {
            return $column . ' = ' . $value;
        });
        $expr->method('gt')->willReturn('gt');
        $expr->method('lte')->willReturn('lte');
        $this->queryBuilder->method('expr')->willReturn($expr);
        $this->queryBuilder->method('createNamedParameter')->willReturnCallback(function ($value) {
            return "'" . $value . "'";
        });
        $this->connection->method('getQueryBuilder')->willReturn($this->queryBuilder);

        $this->repair = new RemoveFolderFileInfos($this->connection, $this->logger);
    }

    private function mockMaxId(int $maxId): void
    {
        $func = $this->createMock(IFunctionBuilder::class);
        $func->method('max')->willReturn($this->createMock(IQueryFunction::class));
        $this->queryBuilder->method('func')->willReturn($func);
        $this->queryBuilder->method('select')->willReturnSelf();
        $this->queryBuilder->method('from')->willReturnSelf();
        $result = $this->createMock(IResult::class);
        $result->method('fetchOne')->willReturn((string)$maxId);
        $this->queryBuilder->method('executeQuery')->willReturn($result);
    }

    public function testDeletesFolderRowsByWindowsOfIds(): void
    {
        $this->mockMaxId(12000);
        $this->queryBuilder->method('delete')->with('duplicatefinder_finfo')->willReturnSelf();
        $this->queryBuilder->method('where')->willReturnSelf();
        $this->queryBuilder->method('andWhere')->willReturnSelf();
        // 12000 ids with a window of 5000: three DELETE statements
        $this->queryBuilder->expects($this->exactly(3))
            ->method('executeStatement')
            ->willReturnOnConsecutiveCalls(500, 300, 188);
        $this->output->expects($this->once())
            ->method('info')
            ->with($this->stringContains('988'));

        $this->repair->run($this->output);
    }

    public function testSilentWhenNothingToRemove(): void
    {
        $this->mockMaxId(3000);
        $this->queryBuilder->method('delete')->willReturnSelf();
        $this->queryBuilder->method('where')->willReturnSelf();
        $this->queryBuilder->method('andWhere')->willReturnSelf();
        $this->queryBuilder->method('executeStatement')->willReturn(0);
        $this->output->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }

    public function testNoStatementOnEmptyTable(): void
    {
        $this->mockMaxId(0);
        $this->queryBuilder->expects($this->never())->method('executeStatement');
        $this->output->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }
}
