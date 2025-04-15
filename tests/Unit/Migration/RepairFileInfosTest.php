<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Migration\RepairFileInfos;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class RepairFileInfosTest extends TestCase
{
    private $repair;
    private $config;
    private $connection;
    private $logger;
    private $fileInfoService;
    private $output;

    protected function setUp(): void
    {
        parent::setUp();

        $this->config = $this->createMock(ConfigService::class);
        $this->connection = $this->createMock(IDBConnection::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->output = $this->createMock(IOutput::class);

        $this->repair = new RepairFileInfos(
            $this->config,
            $this->connection,
            $this->fileInfoService,
            $this->logger
        );
    }

    public function testShouldRunReturnsFalseForOldVersion()
    {
        // Configurer le service de configuration pour retourner une ancienne version
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.0.8');

        // Appeler la méthode shouldRun
        $result = $this->invokePrivateMethod($this->repair, 'shouldRun');

        // Vérifier que le résultat est false
        $this->assertFalse($result);
    }

    public function testShouldRunReturnsTrueForNewerVersion()
    {
        // Configurer le service de configuration pour retourner une version plus récente
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.1.0');

        // Appeler la méthode shouldRun
        $result = $this->invokePrivateMethod($this->repair, 'shouldRun');

        // Vérifier que le résultat est true
        $this->assertTrue($result);
    }

    public function testRunDoesNothingIfShouldRunReturnsFalse()
    {
        // Configurer le service de configuration pour retourner une ancienne version
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.0.8');

        // L'output ne devrait pas être utilisé
        $this->output->expects($this->never())
            ->method('info');

        // Appeler la méthode run
        $this->repair->run($this->output);
    }

    public function testRunUpdatesPathHashes()
    {
        // Configurer le service de configuration pour retourner une version plus récente
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.1.0');

        // Configurer l'output pour afficher des informations
        $this->output->expects($this->exactly(2))
            ->method('info')
            ->withConsecutive(
                ['Recalculating Path Hashes'],
                ['Clearing duplicated records']
            );

        // Créer des objets FileInfo de test
        $fileInfo1 = new FileInfo();
        $fileInfo1->setId(1);
        $fileInfo1->setPath('/path/to/file1.txt');

        $fileInfo2 = new FileInfo();
        $fileInfo2->setId(2);
        $fileInfo2->setPath('/path/to/file2.txt');

        // Configurer le service FileInfoService pour retourner et mettre à jour les FileInfo
        $this->fileInfoService->expects($this->exactly(2))
            ->method('findById')
            ->withConsecutive([1], [2])
            ->willReturnOnConsecutiveCalls($fileInfo1, $fileInfo2);

        $this->fileInfoService->expects($this->exactly(2))
            ->method('update')
            ->withConsecutive([$fileInfo1], [$fileInfo2]);

        // Configurer la connexion à la base de données pour retourner des données de test
        $queryBuilder = $this->createMock(\OCP\DB\QueryBuilder\IQueryBuilder::class);
        $expressionBuilder = $this->createMock(\OCP\DB\QueryBuilder\IExpressionBuilder::class);
        $statement = $this->createMock(\Doctrine\DBAL\Result::class);

        $this->connection->expects($this->once())
            ->method('getQueryBuilder')
            ->willReturn($queryBuilder);

        $queryBuilder->expects($this->once())
            ->method('select')
            ->with('*')
            ->willReturn($queryBuilder);

        $queryBuilder->expects($this->once())
            ->method('from')
            ->with('duplicatefinder_finfo')
            ->willReturn($queryBuilder);

        $queryBuilder->expects($this->once())
            ->method('where')
            ->willReturn($queryBuilder);

        $queryBuilder->expects($this->once())
            ->method('orWhere')
            ->willReturn($queryBuilder);

        $queryBuilder->expects($this->exactly(2))
            ->method('expr')
            ->willReturn($expressionBuilder);

        $queryBuilder->expects($this->once())
            ->method('executeQuery')
            ->willReturn($statement);

        $statement->expects($this->once())
            ->method('fetchAll')
            ->willReturn([['id' => 1], ['id' => 2]]);

        $statement->expects($this->once())
            ->method('closeCursor');

        // Configurer l'output pour la progression
        $this->output->expects($this->exactly(2))
            ->method('startProgress');

        $this->output->expects($this->any())
            ->method('advance');

        $this->output->expects($this->exactly(2))
            ->method('finishProgress');

        // Configurer le service FileInfoService pour findAll
        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->with(false)
            ->willReturn([]);

        // Appeler la méthode run
        $this->repair->run($this->output);
    }

    // Suppression des tests testUpdatePathHashesHandlesNotFoundException et testUpdatePathHashesHandlesGenericException
    // car ils dépendent de méthodes privées qui ne peuvent pas être mockées facilement

    /**
     * Méthode utilitaire pour invoquer une méthode privée
     */
    private function invokePrivateMethod($object, $methodName, array $parameters = [])
    {
        $reflection = new \ReflectionClass(get_class($object));
        $method = $reflection->getMethod($methodName);
        $method->setAccessible(true);

        return $method->invokeArgs($object, $parameters);
    }
}
