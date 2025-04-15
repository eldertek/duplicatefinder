<?php

namespace OCA\DuplicateFinder\Tests\Integration;

use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FolderService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use PHPUnit\Framework\TestCase;

/**
 * Test d'intégration pour vérifier le flux de travail complet de détection de doublons
 */
class CompleteWorkflowTest extends TestCase
{
    /** @var string */
    private $testUserId = 'testuser';

    /** @var IRootFolder */
    private $rootFolder;

    /** @var Folder */
    private $userFolder;

    /** @var FileInfoService */
    private $fileInfoService;

    /** @var FileDuplicateService */
    private $fileDuplicateService;

    /** @var FileInfoMapper */
    private $fileInfoMapper;

    /** @var FileDuplicateMapper */
    private $fileDuplicateMapper;

    /** @var FolderService */
    private $folderService;

    /** @var array */
    private $testFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        // Initialiser les services et mappers
        $this->rootFolder = \OC::$server->get(IRootFolder::class);
        $this->fileInfoService = \OC::$server->get(FileInfoService::class);
        $this->fileDuplicateService = \OC::$server->get(FileDuplicateService::class);
        $this->fileInfoMapper = \OC::$server->get(FileInfoMapper::class);
        $this->fileDuplicateMapper = \OC::$server->get(FileDuplicateMapper::class);
        $this->folderService = \OC::$server->get(FolderService::class);

        // Configurer le contexte utilisateur pour le service de duplications
        $this->fileDuplicateService->setCurrentUserId($this->testUserId);

        // Préparer le dossier utilisateur et les fichiers de test
        $this->prepareUserFolder();
        $this->createTestFiles();
    }

    protected function tearDown(): void
    {
        // Nettoyer les fichiers de test
        $this->cleanupTestFiles();

        parent::tearDown();
    }

    /**
     * Prépare le dossier utilisateur pour les tests
     */
    private function prepareUserFolder()
    {
        try {
            $this->userFolder = $this->rootFolder->get('/' . $this->testUserId . '/files');
        } catch (NotFoundException $e) {
            // Créer le dossier utilisateur s'il n'existe pas
            $this->rootFolder->newFolder('/' . $this->testUserId . '/files');
            $this->userFolder = $this->rootFolder->get('/' . $this->testUserId . '/files');
        }

        // Créer un dossier de test
        try {
            $this->userFolder->get('/test_duplicates');
        } catch (NotFoundException $e) {
            $this->userFolder->newFolder('test_duplicates');
        }
    }

    /**
     * Crée des fichiers de test, dont certains sont des doublons
     */
    private function createTestFiles()
    {
        $testFolder = $this->userFolder->get('/test_duplicates');

        // Contenu des fichiers de test
        $content1 = 'This is test file content 1';
        $content2 = 'This is test file content 2';
        $content3 = 'This is test file content 3';

        // Créer des fichiers avec des contenus différents
        $file1 = $testFolder->newFile('file1.txt');
        $file1->putContent($content1);
        $this->testFiles[] = $file1;

        $file2 = $testFolder->newFile('file2.txt');
        $file2->putContent($content2);
        $this->testFiles[] = $file2;

        $file3 = $testFolder->newFile('file3.txt');
        $file3->putContent($content3);
        $this->testFiles[] = $file3;

        // Créer des doublons
        $duplicate1 = $testFolder->newFile('duplicate1.txt');
        $duplicate1->putContent($content1); // Même contenu que file1.txt
        $this->testFiles[] = $duplicate1;

        $duplicate2 = $testFolder->newFile('duplicate2.txt');
        $duplicate2->putContent($content2); // Même contenu que file2.txt
        $this->testFiles[] = $duplicate2;
    }

    /**
     * Nettoie les fichiers de test
     */
    private function cleanupTestFiles()
    {
        foreach ($this->testFiles as $file) {
            try {
                $file->delete();
            } catch (\Exception $e) {
                // Ignorer les erreurs lors du nettoyage
            }
        }

        // Supprimer les entrées de la base de données
        $this->fileInfoMapper->deleteAll();
        $this->fileDuplicateMapper->deleteAll();
    }

    /**
     * Teste le flux de travail complet de détection de doublons
     */
    // Ce test est désactivé car il nécessite un environnement Nextcloud complet
    // et ne peut pas être exécuté dans un environnement de test isolé
    public function testCompleteWorkflow()
    {
        $this->markTestSkipped('Ce test nécessite un environnement Nextcloud complet.');
    }
}
