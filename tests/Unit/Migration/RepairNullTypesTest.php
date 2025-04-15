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

    public function testRunWithNoNullTypes()
    {
        // Configurer l'output pour afficher des informations
        $this->output->expects($this->exactly(2))
            ->method('info')
            ->withConsecutive(
                ['Checking for NULL type values in duplicatefinder_dups table...'],
                ['No NULL type values found in duplicatefinder_dups table.']
            );

        // Configurer le QueryBuilder pour la requête de comptage
        $this->connection->expects($this->once())
            ->method('getQueryBuilder')
            ->willReturn($this->queryBuilder);

        $this->queryBuilder->expects($this->once())
            ->method('select')
            ->with($this->anything())
            ->willReturn($this->queryBuilder);

        $this->queryBuilder->expects($this->once())
            ->method('from')
            ->with('duplicatefinder_dups')
            ->willReturn($this->queryBuilder);

        $this->queryBuilder->expects($this->once())
            ->method('where')
            ->with($this->anything())
            ->willReturn($this->queryBuilder);

        $this->queryBuilder->expects($this->once())
            ->method('expr')
            ->willReturn($this->expressionBuilder);

        $this->expressionBuilder->expects($this->once())
            ->method('isNull')
            ->with('type')
            ->willReturn('type IS NULL');

        $this->queryBuilder->expects($this->once())
            ->method('execute')
            ->willReturn($this->statement);

        // Configurer le résultat pour indiquer qu'il n'y a pas de valeurs NULL
        $this->statement->expects($this->once())
            ->method('fetchOne')
            ->willReturn('0');

        // Appeler la méthode run
        $this->repair->run($this->output);
    }

    public function testRunWithNullTypes()
    {
        // Configurer l'output pour afficher des informations
        $this->output->expects($this->exactly(3))
            ->method('info')
            ->withConsecutive(
                ['Checking for NULL type values in duplicatefinder_dups table...'],
                ['Found 5 records with NULL type values. Fixing...'],
                ['Fixed 5 records with NULL type values.']
            );

        // Configurer le QueryBuilder pour la requête de comptage
        $countQueryBuilder = $this->createMock(IQueryBuilder::class);
        $updateQueryBuilder = $this->createMock(IQueryBuilder::class);

        $this->connection->expects($this->exactly(2))
            ->method('getQueryBuilder')
            ->willReturnOnConsecutiveCalls($countQueryBuilder, $updateQueryBuilder);

        // Configurer le QueryBuilder pour le comptage
        $countQueryBuilder->expects($this->once())
            ->method('select')
            ->with($this->anything())
            ->willReturn($countQueryBuilder);

        $countQueryBuilder->expects($this->once())
            ->method('from')
            ->with('duplicatefinder_dups')
            ->willReturn($countQueryBuilder);

        $countQueryBuilder->expects($this->once())
            ->method('where')
            ->with($this->anything())
            ->willReturn($countQueryBuilder);

        $countQueryBuilder->expects($this->once())
            ->method('expr')
            ->willReturn($this->expressionBuilder);

        $this->expressionBuilder->expects($this->once())
            ->method('isNull')
            ->with('type')
            ->willReturn('type IS NULL');

        $countQueryBuilder->expects($this->once())
            ->method('execute')
            ->willReturn($this->statement);

        // Configurer le résultat pour indiquer qu'il y a 5 valeurs NULL
        $this->statement->expects($this->once())
            ->method('fetchOne')
            ->willReturn('5');

        // Configurer le QueryBuilder pour la mise à jour
        $updateQueryBuilder->expects($this->once())
            ->method('update')
            ->with('duplicatefinder_dups')
            ->willReturn($updateQueryBuilder);

        $updateQueryBuilder->expects($this->once())
            ->method('set')
            ->with('type', $this->anything())
            ->willReturn($updateQueryBuilder);

        $updateQueryBuilder->expects($this->once())
            ->method('where')
            ->with($this->anything())
            ->willReturn($updateQueryBuilder);

        $updateQueryBuilder->expects($this->once())
            ->method('expr')
            ->willReturn($this->expressionBuilder);

        $this->expressionBuilder->expects($this->once())
            ->method('isNull')
            ->with('type')
            ->willReturn('type IS NULL');

        $updateQueryBuilder->expects($this->once())
            ->method('createNamedParameter')
            ->with('file_hash')
            ->willReturn(':dcValue1');

        $updateQueryBuilder->expects($this->once())
            ->method('execute')
            ->willReturn(5);

        // Configurer le logger pour enregistrer l'information
        $this->logger->expects($this->once())
            ->method('info')
            ->with('Fixed 5 records with NULL type values in duplicatefinder_dups table.');

        // Appeler la méthode run
        $this->repair->run($this->output);
    }
}
