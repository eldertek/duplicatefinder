<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCP\Files\IRootFolder;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ExcludedFolderServiceTest extends TestCase {
    private $mapper;
    private $rootFolder;
    private $logger;
    private $service;

    protected function setUp(): void {
        parent::setUp();

        $this->mapper = $this->createMock(ExcludedFolderMapper::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->logger = $this->createMock(LoggerInterface::class);

        // Créer le service avec un userId null pour simuler un contexte utilisateur manquant
        $this->service = new ExcludedFolderService(
            $this->mapper,
            $this->rootFolder,
            null,
            $this->logger
        );
    }

    public function testValidateUserContextThrowsExceptionWhenUserIdIsEmpty() {
        $this->logger->expects($this->once())
            ->method('debug')
            ->with('No user context available');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('User context required for this operation');

        // Appeler une méthode qui utilise validateUserContext()
        $this->service->findAll();
    }

    public function testIsPathExcludedThrowsExceptionWhenUserIdIsEmpty() {
        $this->logger->expects($this->once())
            ->method('debug')
            ->with('No user context available');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('User context required for this operation');

        $this->service->isPathExcluded('/path/to/file.txt');
    }

    public function testSetUserIdUpdatesUserId() {
        // Définir un userId
        $this->service->setUserId('testuser');

        // Configurer le logger pour accepter plusieurs appels à debug
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        // Maintenant, findAll() devrait fonctionner sans exception
        $this->mapper->expects($this->once())
            ->method('findAllForUser')
            ->with('testuser')
            ->willReturn([]);

        $result = $this->service->findAll();
        $this->assertIsArray($result);
    }

    public function testSetUserIdWithNullClearsUserId() {
        // D'abord définir un userId
        $this->service->setUserId('testuser');

        // Puis le réinitialiser à null
        $this->service->setUserId(null);

        // Configurer le logger pour accepter plusieurs appels à debug
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('User context required for this operation');

        // Appeler une méthode qui utilise validateUserContext()
        $this->service->findAll();
    }
}
