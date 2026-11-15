<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Controller\EmptyFolderApiController;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Service\EmptyFolderCleanupService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Http;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class EmptyFolderCleanupServiceTest extends TestCase
{
    private FolderService $folderService;
    private OriginFolderService $originFolderService;
    private ExcludedFolderService $excludedFolderService;
    private EmptyFolderCleanupService $service;

    /** @var array<string, Folder|File> */
    private array $nodesByPath = [];

    /** @var array<string, array<int, Folder|File>> */
    private array $childrenByPath = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->nodesByPath = [];
        $this->childrenByPath = ['/' => []];

        $this->folderService = $this->createMock(FolderService::class);
        $this->originFolderService = $this->createMock(OriginFolderService::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $userFolder = $this->buildFolder('/', true, false);
        $this->nodesByPath['/'] = $userFolder;

        $this->folderService->method('getUserFolder')->with('alice')->willReturn($userFolder);

        $this->service = new EmptyFolderCleanupService(
            $this->folderService,
            $this->originFolderService,
            $this->excludedFolderService,
            $this->createMock(LoggerInterface::class)
        );
    }

    private function buildFolder(string $relativePath, bool $deletable = true, bool $mounted = false): Folder
    {
        $folder = $this->createMock(Folder::class);
        $name = $relativePath === '/' ? 'files' : basename($relativePath);
        $fullPath = $relativePath === '/' ? '/alice/files' : '/alice/files' . $relativePath;

        $folder->method('getName')->willReturn($name);
        $folder->method('getPath')->willReturn($fullPath);
        $folder->method('getMTime')->willReturn(1700000000);
        $folder->method('isDeletable')->willReturn($deletable);
        $folder->method('isMounted')->willReturn($mounted);

        $folder->method('getDirectoryListing')->willReturnCallback(function () use ($relativePath): array {
            return array_values($this->childrenByPath[$relativePath] ?? []);
        });

        if ($relativePath === '/') {
            $folder->method('nodeExists')->willReturnCallback(function (string $path): bool {
                $norm = '/' . trim($path, '/');

                return isset($this->nodesByPath[$norm]);
            });
            $folder->method('get')->willReturnCallback(function (string $path) {
                $norm = '/' . trim($path, '/');
                if (!isset($this->nodesByPath[$norm])) {
                    throw new NotFoundException('Not found: ' . $norm);
                }

                return $this->nodesByPath[$norm];
            });
            $folder->method('getRelativePath')->willReturnCallback(function (string $full): ?string {
                if ($full === '/alice/files') {
                    return '/';
                }

                return str_starts_with($full, '/alice/files/')
                    ? substr($full, strlen('/alice/files'))
                    : null;
            });
        }

        $folder->method('delete')->willReturnCallback(function () use ($relativePath): void {
            unset($this->nodesByPath[$relativePath], $this->childrenByPath[$relativePath]);
            $parent = $this->parentOf($relativePath);
            if (isset($this->childrenByPath[$parent])) {
                $this->childrenByPath[$parent] = array_values(array_filter(
                    $this->childrenByPath[$parent],
                    static fn ($child): bool => $child->getPath() !== '/alice/files' . $relativePath
                ));
            }
        });

        return $folder;
    }

    private function addFolder(string $relativePath, bool $deletable = true, bool $mounted = false): Folder
    {
        $folder = $this->buildFolder($relativePath, $deletable, $mounted);
        $this->nodesByPath[$relativePath] = $folder;
        $this->childrenByPath[$relativePath] = $this->childrenByPath[$relativePath] ?? [];

        $parent = $this->parentOf($relativePath);
        $this->childrenByPath[$parent][] = $folder;

        return $folder;
    }

    private function addFile(string $relativePath): File
    {
        $file = $this->createMock(File::class);
        $file->method('getName')->willReturn(basename($relativePath));
        $file->method('getPath')->willReturn('/alice/files' . $relativePath);
        $this->nodesByPath[$relativePath] = $file;

        $parent = $this->parentOf($relativePath);
        $this->childrenByPath[$parent][] = $file;

        return $file;
    }

    private function parentOf(string $relativePath): string
    {
        $pos = strrpos($relativePath, '/');

        return ($pos === false || $pos === 0) ? '/' : substr($relativePath, 0, $pos);
    }

    public function testFullScanDetectsEmptyChainsAndRespectsProtections(): void
    {
        $originEntity = new OriginFolder();
        $originEntity->setFolderPath('/Originals');
        $this->originFolderService->method('findAll')->willReturn([$originEntity]);
        $this->originFolderService->method('isPathProtected')->willReturnCallback(static function (string $path): array {
            $protected = $path === '/Originals' || str_starts_with($path, '/Originals/');

            return ['isProtected' => $protected, 'protectingFolder' => $protected ? '/Originals' : null];
        });
        $this->excludedFolderService->method('isPathExcluded')->willReturnCallback(
            static fn (string $path): bool => $path === '/Excluded' || str_starts_with($path, '/Excluded/')
        );

        // Nested empty chain: /Archive -> /Archive/2021, /Archive/2022
        $this->addFolder('/Archive');
        $this->addFolder('/Archive/2021');
        $this->addFolder('/Archive/2022');

        // Folder with file + one empty child: only child is empty
        $this->addFolder('/Photos');
        $this->addFile('/Photos/keep.jpg');
        $this->addFolder('/Photos/EmptyAlbum');

        // Protected origin folder (empty) and subfolder inside it: never detected
        $this->addFolder('/Originals');
        $this->addFolder('/Originals/EmptyProtected');

        // Excluded folder (empty): never detected
        $this->addFolder('/Excluded');

        // Mounted external storage root (empty): never detected
        $this->addFolder('/ExternalDrive', true, true);

        // Read-only non-deletable folder (empty): never detected
        $this->addFolder('/ReadOnlyShare', false, false);

        $detected = $this->service->findEmptyFolders('alice');
        $paths = array_column($detected, 'path');

        $this->assertSame([
            '/Archive',
            '/Archive/2021',
            '/Archive/2022',
            '/Photos/EmptyAlbum',
        ], $paths);

        $byPath = array_column($detected, null, 'path');
        $this->assertTrue($byPath['/Archive']['hasEmptySubfolders']);
        $this->assertFalse($byPath['/Archive/2021']['hasEmptySubfolders']);
        $this->assertFalse($byPath['/Photos/EmptyAlbum']['hasEmptySubfolders']);
    }

    public function testScopedCandidateScanClimbsEmptyAncestorsAndPreservesUserFolderNamedFiles(): void
    {
        $this->originFolderService->method('findAll')->willReturn([]);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        // Deleted file was /alice/files/Export/Batch1/Sub/dup.jpg; Batch1 also had an empty Sibling
        $this->addFolder('/Export');
        $this->addFile('/Export/summary.csv');
        $this->addFolder('/Export/Batch1');
        $this->addFolder('/Export/Batch1/Sub');
        $this->addFolder('/Export/Batch1/SiblingEmpty');

        // User also has a real top-level folder chain /projects/files/Cleaned
        $this->addFolder('/projects');
        $this->addFile('/projects/readme.md');
        $this->addFolder('/projects/files');
        $this->addFile('/projects/files/index.txt');
        $this->addFolder('/projects/files/Cleaned');

        $detected = $this->service->findEmptyFolders('alice', [
            '/alice/files/Export/Batch1/Sub/dup.jpg',
            '/projects/files/Cleaned',
        ]);

        $this->assertSame([
            '/Export/Batch1',
            '/Export/Batch1/SiblingEmpty',
            '/Export/Batch1/Sub',
            '/projects/files/Cleaned',
        ], array_column($detected, 'path'));
    }

    public function testDeleteEmptyFoldersRemovesDeepestFirstAndRefusesNonEmptyParentIfChildKept(): void
    {
        $this->originFolderService->method('findAll')->willReturn([]);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        $this->addFolder('/Chain');
        $this->addFolder('/Chain/Sub');

        // Case 1: user unchecks /Chain/Sub and tries to delete only /Chain -> refused safely!
        $partialResult = $this->service->deleteEmptyFolders('alice', ['/Chain']);
        $this->assertSame([], $partialResult['deleted']);
        $this->assertCount(1, $partialResult['errors']);
        $this->assertSame('FOLDER_NOT_EMPTY', $partialResult['errors'][0]['error']);
        $this->assertArrayHasKey('/Chain/Sub', $this->nodesByPath);

        // Case 2: user selects both /Chain and /Chain/Sub (even passed parent-first) -> deepest-first deletes both!
        $fullResult = $this->service->deleteEmptyFolders('alice', ['/Chain', '/Chain/Sub']);
        $this->assertSame(['/Chain/Sub', '/Chain'], $fullResult['deleted']);
        $this->assertSame([], $fullResult['errors']);
        $this->assertArrayNotHasKey('/Chain', $this->nodesByPath);
        $this->assertArrayNotHasKey('/Chain/Sub', $this->nodesByPath);
    }

    public function testDeleteEmptyFoldersBlocksRootTraversalProtectedExcludedAndMounted(): void
    {
        $originEntity = new OriginFolder();
        $originEntity->setFolderPath('/Originals');
        $this->originFolderService->method('findAll')->willReturn([$originEntity]);
        $this->originFolderService->method('isPathProtected')->willReturnCallback(static function (string $path): array {
            $protected = $path === '/Originals' || str_starts_with($path, '/Originals/');

            return ['isProtected' => $protected, 'protectingFolder' => $protected ? '/Originals' : null];
        });
        $this->excludedFolderService->method('isPathExcluded')->willReturnCallback(
            static fn (string $path): bool => $path === '/Excluded'
        );

        $this->addFolder('/Originals');
        $this->addFolder('/Excluded');
        $this->addFolder('/Mounted', true, true);
        $this->addFile('/not-a-folder.txt');

        $result = $this->service->deleteEmptyFolders('alice', [
            '/',
            '/../etc',
            '/Originals',
            '/Excluded',
            '/Mounted',
            '/not-a-folder.txt',
        ]);

        $this->assertSame([], $result['deleted']);
        $errorCodes = array_column($result['errors'], 'error');
        $this->assertContains('INVALID_PATH', $errorCodes);
        $this->assertContains('ORIGIN_FOLDER_PROTECTED', $errorCodes);
        $this->assertContains('EXCLUDED_FOLDER', $errorCodes);
        $this->assertContains('MOUNTED_FOLDER', $errorCodes);
        $this->assertContains('NOT_A_FOLDER', $errorCodes);
    }

    public function testControllerEndpointsHandleAuthValidationAndSuccess(): void
    {
        $this->originFolderService->method('findAll')->willReturn([]);
        $this->originFolderService->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);
        $this->excludedFolderService->method('isPathExcluded')->willReturn(false);

        $this->addFolder('/CleanMe');

        $unauthRequest = $this->createMock(IRequest::class);
        $unauthController = new EmptyFolderApiController(
            'duplicatefinder',
            $unauthRequest,
            $this->service,
            null,
            $this->createMock(LoggerInterface::class)
        );
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $unauthController->scan()->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $unauthController->delete()->getStatus());

        $scanRequest = $this->createMock(IRequest::class);
        $scanRequest->method('getParam')->with('candidatePaths', [])->willReturn([]);
        $controller = new EmptyFolderApiController(
            'duplicatefinder',
            $scanRequest,
            $this->service,
            'alice',
            $this->createMock(LoggerInterface::class)
        );

        $scanResponse = $controller->scan();
        $this->assertSame(Http::STATUS_OK, $scanResponse->getStatus());
        $this->assertSame(1, $scanResponse->getData()['count']);
        $this->assertSame('/CleanMe', $scanResponse->getData()['folders'][0]['path']);

        $emptyDeleteRequest = $this->createMock(IRequest::class);
        $emptyDeleteRequest->method('getParam')->with('paths', [])->willReturn([]);
        $emptyDeleteController = new EmptyFolderApiController(
            'duplicatefinder',
            $emptyDeleteRequest,
            $this->service,
            'alice',
            $this->createMock(LoggerInterface::class)
        );
        $this->assertSame(Http::STATUS_BAD_REQUEST, $emptyDeleteController->delete()->getStatus());

        $deleteRequest = $this->createMock(IRequest::class);
        $deleteRequest->method('getParam')->with('paths', [])->willReturn(['/CleanMe']);
        $deleteController = new EmptyFolderApiController(
            'duplicatefinder',
            $deleteRequest,
            $this->service,
            'alice',
            $this->createMock(LoggerInterface::class)
        );
        $deleteResponse = $deleteController->delete();
        $this->assertSame(Http::STATUS_OK, $deleteResponse->getStatus());
        $this->assertSame(['/CleanMe'], $deleteResponse->getData()['deleted']);
    }
}
