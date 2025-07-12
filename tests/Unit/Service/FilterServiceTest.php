<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FilterMapper;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FilterService;
use OCP\Files\Node;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FilterServiceTest extends TestCase
{
    private $logger;
    private $config;
    private $excludedFolderService;
    private $filterMapper;
    private $service;
    private $fileInfo;
    private $node;

    protected function setUp(): void
    {
        parent::setUp();

        $this->logger = $this->createMock(LoggerInterface::class);
        $this->config = $this->createMock(ConfigService::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $this->filterMapper = $this->createMock(FilterMapper::class);

        $this->service = new FilterService(
            $this->logger,
            $this->config,
            $this->excludedFolderService,
            $this->filterMapper
        );

        // Créer un mock pour FileInfo
        $this->fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $this->fileInfo->method('getPath')->willReturn('/path/to/file.txt');

        // Créer un mock pour Node
        $this->node = $this->createMock(Node::class);
        $this->node->method('getType')->willReturn('file');
        $this->node->method('isMounted')->willReturn(false);
        $this->node->method('getSize')->willReturn(1024);
        $this->node->method('getMimetype')->willReturn('text/plain');
    }

    public function testIsIgnoredWithNoOwner()
    {
        // Configurer le FileInfo pour qu'il n'ait pas de propriétaire
        $this->fileInfo->method('getOwner')->willReturn(null);

        // Le logger devrait enregistrer plusieurs messages
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        // L'ExcludedFolderService ne devrait pas être appelé
        $this->excludedFolderService->expects($this->never())
            ->method('isPathExcluded');

        // Configurer le FilterMapper pour qu'il ne soit pas appelé quand il n'y a pas d'utilisateur
        $this->filterMapper->expects($this->never())
            ->method('findByType');

        // Configurer le Node pour qu'il n'ait pas de parent (pour éviter les vérifications .nodupefinder)
        $this->node->method('getParent')->willReturn(null);

        // Appeler isIgnored() et vérifier qu'il ne lance pas d'exception
        $result = $this->service->isIgnored($this->fileInfo, $this->node);
        $this->assertFalse($result);
    }

    public function testIsIgnoredWithOwnerSetsUserContext()
    {
        // Configurer le FileInfo pour qu'il ait un propriétaire
        $this->fileInfo->method('getOwner')->willReturn('testuser');

        // L'ExcludedFolderService devrait être appelé avec le bon userId
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->excludedFolderService->expects($this->once())
            ->method('isPathExcluded')
            ->with('/path/to/file.txt')
            ->willReturn(false);

        // Configurer le FilterMapper pour qu'il retourne des filtres vides
        $this->filterMapper->method('findByType')->willReturn([]);

        // Configurer le Node pour qu'il n'ait pas de parent (pour éviter les vérifications .nodupefinder)
        $this->node->method('getParent')->willReturn(null);

        // Appeler isIgnored() et vérifier qu'il ne lance pas d'exception
        $result = $this->service->isIgnored($this->fileInfo, $this->node);
        $this->assertFalse($result);
    }

    public function testIsIgnoredHandlesExcludedFolderServiceException()
    {
        // Configurer le FileInfo pour qu'il ait un propriétaire
        $this->fileInfo->method('getOwner')->willReturn('testuser');

        // L'ExcludedFolderService lance une exception
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        $this->excludedFolderService->expects($this->once())
            ->method('isPathExcluded')
            ->with('/path/to/file.txt')
            ->willThrowException(new \RuntimeException('Test exception'));

        // Le logger devrait enregistrer plusieurs messages
        $this->logger->expects($this->atLeastOnce())
            ->method('debug');

        // Configurer le FilterMapper pour qu'il retourne des filtres vides
        $this->filterMapper->method('findByType')->willReturn([]);

        // Configurer le Node pour qu'il n'ait pas de parent (pour éviter les vérifications .nodupefinder)
        $this->node->method('getParent')->willReturn(null);

        // Appeler isIgnored() et vérifier qu'il ne lance pas d'exception
        $result = $this->service->isIgnored($this->fileInfo, $this->node);
        $this->assertFalse($result);
    }
}
