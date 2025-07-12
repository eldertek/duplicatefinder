<?php

namespace OCA\DuplicateFinder\Tests;

use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotFoundException;
use OCP\IDBConnection;
use OCP\IUserManager;
use Psr\Log\LoggerInterface;

/**
 * Classe d'aide pour les tests
 */
class TestHelper
{
    /** @var IUserManager */
    private $userManager;

    /** @var IRootFolder */
    private $rootFolder;

    /** @var IDBConnection */
    private $connection;

    /** @var LoggerInterface */
    private $logger;

    /**
     * @param IUserManager $userManager
     * @param IRootFolder $rootFolder
     * @param IDBConnection $connection
     * @param LoggerInterface $logger
     */
    public function __construct(
        IUserManager $userManager,
        IRootFolder $rootFolder,
        IDBConnection $connection,
        LoggerInterface $logger
    ) {
        $this->userManager = $userManager;
        $this->rootFolder = $rootFolder;
        $this->connection = $connection;
        $this->logger = $logger;
    }

    /**
     * Crée un utilisateur de test s'il n'existe pas
     *
     * @param string $userId
     * @param string $password
     * @return bool
     */
    public function createTestUser(string $userId, string $password = 'password'): bool
    {
        if (!$this->userManager->userExists($userId)) {
            return $this->userManager->createUser($userId, $password) !== false;
        }

        return true;
    }

    /**
     * Supprime un utilisateur de test
     *
     * @param string $userId
     * @return bool
     */
    public function deleteTestUser(string $userId): bool
    {
        if ($this->userManager->userExists($userId)) {
            $user = $this->userManager->get($userId);
            if ($user) {
                return $user->delete();
            }
        }

        return true;
    }

    /**
     * Crée un dossier pour un utilisateur
     *
     * @param string $userId
     * @param string $path
     * @return Folder
     * @throws NotFoundException
     */
    public function createFolder(string $userId, string $path): Folder
    {
        $userFolder = $this->rootFolder->getUserFolder($userId);

        // Créer le chemin complet
        $parts = explode('/', trim($path, '/'));
        $current = $userFolder;

        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }

            if ($current->nodeExists($part)) {
                $node = $current->get($part);
                if ($node instanceof Folder) {
                    $current = $node;
                } else {
                    throw new \Exception("Le chemin $part existe déjà mais n'est pas un dossier");
                }
            } else {
                $current = $current->newFolder($part);
            }
        }

        return $current;
    }

    /**
     * Crée un fichier pour un utilisateur
     *
     * @param string $userId
     * @param string $path
     * @param string $content
     * @return File
     * @throws NotFoundException
     */
    public function createFile(string $userId, string $path, string $content): File
    {
        $userFolder = $this->rootFolder->getUserFolder($userId);
        $dirname = dirname($path);
        $filename = basename($path);

        // Créer le dossier parent si nécessaire
        if ($dirname !== '.') {
            $this->createFolder($userId, $dirname);
        }

        // Créer ou mettre à jour le fichier
        if ($userFolder->nodeExists($path)) {
            $file = $userFolder->get($path);
            if ($file instanceof File) {
                $file->putContent($content);

                return $file;
            } else {
                throw new \Exception("Le chemin $path existe déjà mais n'est pas un fichier");
            }
        } else {
            if ($dirname === '.') {
                $file = $userFolder->newFile($filename);
            } else {
                $folder = $userFolder->get($dirname);
                $file = $folder->newFile($filename);
            }
            $file->putContent($content);

            return $file;
        }
    }

    /**
     * Nettoie la base de données pour les tests
     *
     * @param array $tables
     * @return void
     */
    public function cleanupDatabase(array $tables): void
    {
        foreach ($tables as $table) {
            try {
                $this->connection->getQueryBuilder()
                    ->delete($table)
                    ->execute();
            } catch (\Exception $e) {
                $this->logger->error('Erreur lors du nettoyage de la table ' . $table . ': ' . $e->getMessage());
            }
        }
    }
}
