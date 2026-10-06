<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FilterMapper;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FilterService;
use OCP\Files\File;
use OCP\Files\Folder;
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

        // Configurer le FilterMapper pour qu'il retourne des filtres vides
        $this->filterMapper->method('findByType')->willReturn([]);

        // Configurer le Node pour qu'il n'ait pas de parent (pour éviter les vérifications .nodupefinder)
        $this->node->method('getParent')->willReturn(null);

        // Appeler isIgnored() et vérifier qu'il ne lance pas d'exception
        $result = $this->service->isIgnored($this->fileInfo, $this->node);
        $this->assertFalse($result);
    }

    /**
     * Builds /testuser/files/<names...> as folder mocks and returns them by path.
     * nodeExists('.nodupefinder') is answered from $markers and counted in $probes.
     *
     * @return array<string, Folder>
     */
    private function buildFolderTree(array $paths, array $markers, array &$probes): array
    {
        $root = $this->createMock(Folder::class);
        $root->method('getPath')->willReturn('/');
        $folders = ['/' => $root];
        sort($paths);
        foreach ($paths as $path) {
            $parentPath = dirname($path);
            $folder = $this->createMock(Folder::class);
            $folder->method('getPath')->willReturn($path);
            $folder->method('getParent')->willReturn($folders[$parentPath]);
            $folder->method('nodeExists')->willReturnCallback(function ($name) use ($path, $markers, &$probes) {
                $probes[$path] = ($probes[$path] ?? 0) + 1;

                return $name === '.nodupefinder' && in_array($path, $markers, true);
            });
            $folders[$path] = $folder;
        }

        return $folders;
    }

    private function fileIn(Folder $parent, string $name): File
    {
        $file = $this->createMock(File::class);
        $file->method('getPath')->willReturn($parent->getPath() . '/' . $name);
        $file->method('getParent')->willReturn($parent);
        $file->method('isMounted')->willReturn(false);

        return $file;
    }

    private function fileInfoFor(File $file): FileInfo
    {
        return new FileInfo($file->getPath(), 'testuser');
    }

    public function testNoDupeFinderLookupIsDoneOncePerFolder()
    {
        $probes = [];
        $folders = $this->buildFolderTree(
            ['/testuser', '/testuser/files', '/testuser/files/A', '/testuser/files/A/B', '/testuser/files/A/C'],
            [],
            $probes
        );
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);
        $this->filterMapper->method('findByType')->willReturn([]);

        foreach (['/testuser/files/A/B', '/testuser/files/A/C', '/testuser/files/A'] as $folderPath) {
            foreach (['1.jpg', '2.jpg', '3.jpg'] as $name) {
                $file = $this->fileIn($folders[$folderPath], $name);
                $this->assertFalse($this->service->isIgnored($this->fileInfoFor($file), $file));
            }
        }

        // Every folder up to the user root is probed exactly once for nine files
        $this->assertSame([
            '/testuser/files/A/B' => 1,
            '/testuser/files/A' => 1,
            '/testuser/files' => 1,
            '/testuser' => 1,
            '/testuser/files/A/C' => 1,
        ], $probes);
    }

    public function testNoDupeFinderInAncestorIgnoresFilesOfAllSubfolders()
    {
        $probes = [];
        $folders = $this->buildFolderTree(
            ['/testuser', '/testuser/files', '/testuser/files/A', '/testuser/files/A/B', '/testuser/files/A/C', '/testuser/files/D'],
            ['/testuser/files/A'],
            $probes
        );
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);
        $this->filterMapper->method('findByType')->willReturn([]);

        $inB = $this->fileIn($folders['/testuser/files/A/B'], 'x.jpg');
        $inC = $this->fileIn($folders['/testuser/files/A/C'], 'y.jpg');
        $inD = $this->fileIn($folders['/testuser/files/D'], 'z.jpg');

        $this->assertTrue($this->service->isIgnored($this->fileInfoFor($inB), $inB));
        $this->assertTrue($this->service->isIgnored($this->fileInfoFor($inC), $inC));
        $this->assertFalse($this->service->isIgnored($this->fileInfoFor($inD), $inD));
        $this->assertSame(1, $probes['/testuser/files/A']);
    }

    public function testResetCacheProbesAgain()
    {
        $probes = [];
        $folders = $this->buildFolderTree(['/testuser', '/testuser/files'], [], $probes);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);
        $this->filterMapper->method('findByType')->willReturn([]);
        $this->excludedFolderService->expects($this->once())->method('resetCache');

        $file = $this->fileIn($folders['/testuser/files'], 'a.txt');
        $this->service->isIgnored($this->fileInfoFor($file), $file);
        $this->service->resetCache();
        $this->service->isIgnored($this->fileInfoFor($file), $file);

        $this->assertSame(2, $probes['/testuser/files']);
    }

    public function testCustomFiltersAreLoadedOncePerUserAndType()
    {
        $this->fileInfo->method('getOwner')->willReturn('testuser');
        $this->node->method('getParent')->willReturn(null);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        $this->filterMapper->expects($this->exactly(2))
            ->method('findByType')
            ->willReturnCallback(function ($type, $userId) {
                $this->assertSame('testuser', $userId);

                return [];
            });

        for ($i = 0; $i < 5; $i++) {
            $this->assertFalse($this->service->isIgnored($this->fileInfo, $this->node));
        }
    }

    public function testCreatingAFilterIsSeenByTheNextCheck()
    {
        $file = $this->createMock(File::class);
        $file->method('getParent')->willReturn(null);
        $file->method('isMounted')->willReturn(false);
        $fileInfo = new FileInfo('/testuser/files/notes.tmp', 'testuser');
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        $filter = new \OCA\DuplicateFinder\Db\Filter();
        $filter->setType('name');
        $filter->setValue('*.tmp');
        $nameFilters = [];
        $this->filterMapper->method('findByType')->willReturnCallback(function ($type) use (&$nameFilters) {
            return $type === 'name' ? $nameFilters : [];
        });
        $this->filterMapper->method('insert')->willReturnCallback(function ($newFilter) use (&$nameFilters, $filter) {
            $nameFilters = [$filter];

            return $newFilter;
        });

        $this->assertFalse($this->service->isIgnored($fileInfo, $file));
        $this->service->createFilter('name', '*.tmp', 'testuser');
        $this->assertTrue($this->service->isIgnored($fileInfo, $file));
    }
}
