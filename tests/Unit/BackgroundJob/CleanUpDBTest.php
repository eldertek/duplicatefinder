<?php

namespace OCA\DuplicateFinder\Tests\Unit\BackgroundJob;

use OCA\DuplicateFinder\BackgroundJob\CleanUpDB;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\AppFramework\Utility\ITimeFactory;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class CleanUpDBTest extends TestCase
{
    private $fileInfoService;
    private $folderService;
    private $logger;
    private $config;
    private $timeFactory;
    private $excludedFolderService;
    private $job;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfoService = $this->createMock(FileInfoService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->config = $this->createMock(ConfigService::class);
        $this->timeFactory = $this->createMock(ITimeFactory::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $this->job = new CleanUpDB(
            $this->fileInfoService,
            $this->folderService,
            $this->logger,
            $this->config,
            $this->timeFactory,
            $this->excludedFolderService
        );
    }

    public function testRunSetsUserContextForEachFile()
    {
        // Créer des mocks pour les FileInfo
        $fileInfo1 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo1->method('getPath')->willReturn('/path/to/file1.txt');
        $fileInfo1->method('getOwner')->willReturn('user1');

        $fileInfo2 = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo2->method('getPath')->willReturn('/path/to/file2.txt');
        $fileInfo2->method('getOwner')->willReturn(null);

        // Le FileInfoService retourne deux fichiers
        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->willReturn([$fileInfo1, $fileInfo2]);

        // Le logger devrait enregistrer le début et la fin du job
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur pour chaque fichier
        $this->excludedFolderService->expects($this->exactly(2))
            ->method('setUserId')
            ->withConsecutive(
                ['user1'],
                [null]
            );

        // Le FolderService devrait être appelé pour chaque fichier
        $node = $this->createMock(\OCP\Files\Node::class);

        $this->folderService->expects($this->exactly(2))
            ->method('getNodeByFileInfo')
            ->willReturn($node);

        // Appeler la méthode run
        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    public function testRunHandlesNotFoundException()
    {
        // Créer un mock pour FileInfo
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/path/to/file.txt');
        $fileInfo->method('getOwner')->willReturn('user1');

        // Le FileInfoService retourne un fichier
        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->willReturn([$fileInfo]);

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('user1');

        // Le FolderService lance une NotFoundException
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new NotFoundException());

        // Le FileInfoService devrait être appelé pour supprimer le fichier
        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($fileInfo);

        // Appeler la méthode run
        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    public function testRunHandlesGenericException()
    {
        // Créer un mock pour FileInfo
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/path/to/file.txt');
        $fileInfo->method('getOwner')->willReturn('user1');

        // Le FileInfoService retourne un fichier
        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->willReturn([$fileInfo]);

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('user1');

        // Le FolderService lance une exception générique
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willThrowException(new \Exception('Test exception'));

        // Le logger devrait enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error');

        // Le FileInfoService ne devrait pas être appelé pour supprimer le fichier
        $this->fileInfoService->expects($this->never())
            ->method('delete');

        // Appeler la méthode run
        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    /**
     * Appelle une méthode privée d'un objet
     *
     * @param object $object L'objet sur lequel appeler la méthode
     * @param string $methodName Le nom de la méthode à appeler
     * @param array $parameters Les paramètres à passer à la méthode
     * @return mixed Le résultat de l'appel de méthode
     */
    private function invokePrivateMethod($object, $methodName, array $parameters = [])
    {
        $reflection = new \ReflectionClass(get_class($object));
        $method = $reflection->getMethod($methodName);
        $method->setAccessible(true);

        return $method->invokeArgs($object, $parameters);
    }
}
