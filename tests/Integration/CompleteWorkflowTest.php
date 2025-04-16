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
    private $testUserId = 'test-user-a';

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

        try {
            // Initialiser les services depuis le conteneur Nextcloud
            $this->rootFolder = \OC::$server->get(IRootFolder::class);
            $this->fileInfoService = \OC::$server->get(FileInfoService::class);
            $this->fileDuplicateService = \OC::$server->get(FileDuplicateService::class);
            $this->fileInfoMapper = \OC::$server->get(FileInfoMapper::class);
            $this->fileDuplicateMapper = \OC::$server->get(FileDuplicateMapper::class);
            $this->folderService = \OC::$server->get(FolderService::class);

            // Préparer le dossier utilisateur pour les tests
            $this->prepareUserFolder();

            // Créer les fichiers de test
            $this->createTestFiles();
        } catch (\Exception $e) {
            $this->markTestSkipped('Erreur lors de l\'initialisation du test: ' . $e->getMessage());
        }
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
        if (!$testFolder->nodeExists('file1.txt')) {
            $file1 = $testFolder->newFile('file1.txt');
            $file1->putContent($content1);
            $this->testFiles[] = $file1;
        } else {
            $file1 = $testFolder->get('file1.txt');
            $file1->putContent($content1);
            $this->testFiles[] = $file1;
        }

        if (!$testFolder->nodeExists('file2.txt')) {
            $file2 = $testFolder->newFile('file2.txt');
            $file2->putContent($content2);
            $this->testFiles[] = $file2;
        } else {
            $file2 = $testFolder->get('file2.txt');
            $file2->putContent($content2);
            $this->testFiles[] = $file2;
        }

        if (!$testFolder->nodeExists('file3.txt')) {
            $file3 = $testFolder->newFile('file3.txt');
            $file3->putContent($content3);
            $this->testFiles[] = $file3;
        } else {
            $file3 = $testFolder->get('file3.txt');
            $file3->putContent($content3);
            $this->testFiles[] = $file3;
        }

        // Créer des doublons
        if (!$testFolder->nodeExists('duplicate1.txt')) {
            $duplicate1 = $testFolder->newFile('duplicate1.txt');
            $duplicate1->putContent($content1); // Même contenu que file1.txt
            $this->testFiles[] = $duplicate1;
        } else {
            $duplicate1 = $testFolder->get('duplicate1.txt');
            $duplicate1->putContent($content1);
            $this->testFiles[] = $duplicate1;
        }

        if (!$testFolder->nodeExists('duplicate2.txt')) {
            $duplicate2 = $testFolder->newFile('duplicate2.txt');
            $duplicate2->putContent($content2); // Même contenu que file2.txt
            $this->testFiles[] = $duplicate2;
        } else {
            $duplicate2 = $testFolder->get('duplicate2.txt');
            $duplicate2->putContent($content2);
            $this->testFiles[] = $duplicate2;
        }
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

        // Supprimer les entrées de la base de données pour l'utilisateur de test
        try {
            $fileInfos = $this->fileInfoMapper->findAll($this->testUserId);
            foreach ($fileInfos as $fileInfo) {
                $this->fileInfoMapper->delete($fileInfo);
            }

            $duplicates = $this->fileDuplicateService->findAll('all', $this->testUserId);
            foreach ($duplicates['entities'] as $duplicate) {
                $this->fileDuplicateMapper->delete($duplicate);
            }
        } catch (\Exception $e) {
            // Ignorer les erreurs lors du nettoyage
        }
    }

    /**
     * Teste le flux de travail complet de détection de doublons
     */
    public function testCompleteWorkflow()
    {
        // 1. Scanner les fichiers pour détecter les doublons
        $this->fileInfoService->scanFiles($this->testUserId);

        // Attendre un peu pour s'assurer que le scan est terminé
        sleep(1);

        // 2. Vérifier que les fichiers sont indexés
        $fileInfos = $this->fileInfoMapper->findAll($this->testUserId);
        $this->assertGreaterThanOrEqual(5, count($fileInfos), "Les fichiers de test devraient être indexés");

        // 3. Vérifier que les doublons sont détectés
        $duplicates = $this->fileDuplicateService->findAll('all', $this->testUserId);
        $this->assertArrayHasKey('entities', $duplicates, "Le résultat devrait contenir une clé 'entities'");
        $this->assertGreaterThanOrEqual(1, count($duplicates['entities']), "Au moins 1 groupe de doublons devrait être détecté");

        // Afficher des informations de débogage sur les doublons trouvés
        echo "\nNombre de groupes de doublons trouvés: " . count($duplicates['entities']) . "\n";

        // 4. Vérifier que les doublons contiennent les bons fichiers
        $foundDuplicate1 = false;
        $foundDuplicate2 = false;

        foreach ($duplicates['entities'] as $duplicate) {
            $files = $duplicate->getFiles();
            if (count($files) >= 2) {
                $paths = array_map(function ($file) {
                    return $file->getPath();
                }, $files);

                // Afficher les chemins pour le débogage
                echo "Groupe de doublons avec " . count($files) . " fichiers:\n";
                foreach ($paths as $path) {
                    echo "  - $path\n";
                }

                // Vérifier si ce groupe contient file1.txt et duplicate1.txt
                $hasFile1 = false;
                $hasDuplicate1 = false;
                $hasFile2 = false;
                $hasDuplicate2 = false;

                foreach ($paths as $path) {
                    if (strpos($path, 'file1.txt') !== false) $hasFile1 = true;
                    if (strpos($path, 'duplicate1.txt') !== false) $hasDuplicate1 = true;
                    if (strpos($path, 'file2.txt') !== false) $hasFile2 = true;
                    if (strpos($path, 'duplicate2.txt') !== false) $hasDuplicate2 = true;
                }

                if ($hasFile1 && $hasDuplicate1) {
                    $foundDuplicate1 = true;
                }

                if ($hasFile2 && $hasDuplicate2) {
                    $foundDuplicate2 = true;
                }
            }
        }

        // Vérifier qu'au moins un des groupes de doublons attendus a été trouvé
        $this->assertTrue($foundDuplicate1 || $foundDuplicate2, "Au moins un des groupes de doublons attendus devrait être trouvé");
    }
}
