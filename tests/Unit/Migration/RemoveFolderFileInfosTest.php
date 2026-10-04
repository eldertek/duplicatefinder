<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Migration\RemoveFolderFileInfos;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
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
        $this->queryBuilder->method('expr')->willReturn($expr);
        $this->queryBuilder->method('createNamedParameter')->willReturnCallback(function ($value) {
            return "'" . $value . "'";
        });
        $this->connection->method('getQueryBuilder')->willReturn($this->queryBuilder);

        $this->repair = new RemoveFolderFileInfos($this->connection, $this->logger);
    }

    public function testDeletesOnlyFolderRows(): void
    {
        $this->queryBuilder->expects($this->once())
            ->method('delete')
            ->with('duplicatefinder_finfo')
            ->willReturnSelf();
        $this->queryBuilder->expects($this->once())
            ->method('where')
            ->with("mimetype = 'httpd/unix-directory'")
            ->willReturnSelf();
        $this->queryBuilder->expects($this->once())
            ->method('executeStatement')
            ->willReturn(988);
        $this->output->expects($this->once())
            ->method('info')
            ->with($this->stringContains('988'));

        $this->repair->run($this->output);
    }

    public function testSilentWhenNothingToRemove(): void
    {
        $this->queryBuilder->method('delete')->willReturnSelf();
        $this->queryBuilder->method('where')->willReturnSelf();
        $this->queryBuilder->method('executeStatement')->willReturn(0);
        $this->output->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }
}
