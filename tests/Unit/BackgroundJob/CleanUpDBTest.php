<?php

namespace OCA\DuplicateFinder\Tests\Unit\BackgroundJob;

use OCA\DuplicateFinder\BackgroundJob\CleanUpDB;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
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
    private $fileDuplicateService;
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
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $this->job = new CleanUpDB(
            $this->fileInfoService,
            $this->folderService,
            $this->logger,
            $this->config,
            $this->timeFactory,
            $this->excludedFolderService,
            $this->fileDuplicateService
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

        // Des fichiers qui existent ne sont jamais oubliés
        $this->fileInfoService->expects($this->never())->method('delete');

        // Appeler la méthode run
        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    /**
     * Issue 183: FolderService::getNodeByFileInfo() does not throw for a file that was deleted, it
     * returns null. The job used to wait for an exception that never came, so the entries of deleted
     * files stayed in the database for ever and were still listed as duplicates.
     */
    public function testRunDeletesEntriesOfFilesThatAreGone()
    {
        $fileInfo = $this->createFileInfo('/user1/files/Instant Upload/gone.jpg', 'user1', 'hash-of-gone');

        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->willReturn([$fileInfo]);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn(null);
        $this->folderService->expects($this->once())
            ->method('isNodeGone')
            ->with($fileInfo)
            ->willReturn(true);

        $this->fileInfoService->expects($this->once())
            ->method('delete')
            ->with($fileInfo);
        // Once its last entry is gone, the group has nothing left to compare with
        $this->fileDuplicateService->expects($this->once())
            ->method('removeIfOrphaned')
            ->with('hash-of-gone');

        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    /**
     * A node that cannot be resolved (group folder of a user that does not exist, deleted
     * account) is not a deleted file: its entry must stay.
     */
    public function testRunKeepsEntriesOfNodesThatCannotBeResolved()
    {
        $fileInfo = $this->createFileInfo('/__groupfolders/3/report.pdf', 'user1', 'hash-of-report');

        $this->fileInfoService->expects($this->once())
            ->method('findAll')
            ->willReturn([$fileInfo]);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->willReturn(null);
        $this->folderService->expects($this->once())
            ->method('isNodeGone')
            ->with($fileInfo)
            ->willReturn(false);

        $this->fileInfoService->expects($this->never())->method('delete');
        $this->fileDuplicateService->expects($this->never())->method('removeIfOrphaned');

        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    public function testRunStillHandlesNotFoundException()
    {
        $fileInfo = $this->createFileInfo('/path/to/file.txt', 'user1', null);

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

    public function testRunGoesOnWhenTheDuplicateGroupCannotBeRefreshed()
    {
        $fileInfo1 = $this->createFileInfo('/user1/files/a.jpg', 'user1', 'hash-a');
        $fileInfo2 = $this->createFileInfo('/user1/files/b.jpg', 'user1', 'hash-b');

        $this->fileInfoService->method('findAll')->willReturn([$fileInfo1, $fileInfo2]);
        $this->folderService->method('getNodeByFileInfo')->willReturn(null);
        $this->folderService->method('isNodeGone')->willReturn(true);

        // Both stale entries are removed even if the group of the first one cannot be refreshed
        $this->fileInfoService->expects($this->exactly(2))->method('delete');
        $this->fileDuplicateService->expects($this->exactly(2))
            ->method('removeIfOrphaned')
            ->willReturnCallback(function (?string $hash): void {
                if ($hash === 'hash-a') {
                    throw new \RuntimeException('group is locked');
                }
            });
        $this->logger->expects($this->atLeastOnce())->method('warning');

        $this->invokePrivateMethod($this->job, 'run', [null]);
    }

    public function testRunHandlesGenericException()
    {
        $fileInfo = $this->createFileInfo('/path/to/file.txt', 'user1', null);

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

    private function createFileInfo(string $path, ?string $owner, ?string $hash)
    {
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner', 'getFileHash'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn($path);
        $fileInfo->method('getOwner')->willReturn($owner);
        $fileInfo->method('getFileHash')->willReturn($hash);

        return $fileInfo;
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
