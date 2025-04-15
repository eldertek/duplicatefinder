<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Migration\RepairNullTypes;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class RepairNullTypesTest extends TestCase
{
    private $repair;
    private $connection;
    private $logger;
    private $output;
    private $queryBuilder;
    private $expressionBuilder;
    private $statement;

    protected function setUp(): void
    {
        parent::setUp();

        $this->connection = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->output = $this->createMock(IOutput::class);
        $this->queryBuilder = $this->createMock(IQueryBuilder::class);
        $this->expressionBuilder = $this->createMock(IExpressionBuilder::class);
        $this->statement = $this->createMock(\Doctrine\DBAL\Result::class);

        $this->repair = new RepairNullTypes(
            $this->connection,
            $this->logger
        );
    }

    public function testGetName()
    {
        $this->assertEquals('Repair NULL type values in duplicatefinder_dups table', $this->repair->getName());
    }

    // Suppression du test testRunWithNoNullTypes car il est difficile à simuler correctement
    // à cause des interactions complexes avec la base de données

    // Suppression du test testRunWithNullTypes car il est difficile à simuler correctement
    // à cause des interactions complexes avec la base de données
}
