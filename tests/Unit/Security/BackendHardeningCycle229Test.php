<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\Controller\DuplicateApiController;
use OCA\DuplicateFinder\Controller\FileApiController;
use OCA\DuplicateFinder\Controller\FilterController;
use OCA\DuplicateFinder\Controller\ProjectApiController;
use OCA\DuplicateFinder\Db\ExcludedFolder;
use OCA\DuplicateFinder\Db\ExcludedFolderMapper;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Db\OriginFolderMapper;
use OCA\DuplicateFinder\Db\Project;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\LivePhotoDeletionService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ProjectService;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\DB\IResult;
use OCP\DB\QueryBuilder\IExpressionBuilder;
use OCP\DB\QueryBuilder\IParameter;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\NotPermittedException;
use OCP\IDBConnection;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class BackendHardeningCycle229Test extends TestCase
{
    public function testOriginFolderServiceNormalizesCreateAndProtectsAgainstTraversalAndCaches(): void
    {
        $mapper = $this->createMock(OriginFolderMapper::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $logger = $this->createMock(LoggerInterface::class);
        $userFolder = $this->createMock(Folder::class);

        $rootFolder->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->expects($this->once())->method('nodeExists')->with('/Photos/Originals')->willReturn(true);
        $mapper->expects($this->once())->method('exists')->with('alice', '/Photos/Originals')->willReturn(false);

        $stored = new OriginFolder();
        $stored->setId(1);
        $stored->setUserId('alice');
        $stored->setFolderPath('/Photos/Originals');

        $mapper->expects($this->once())
            ->method('insert')
            ->willReturnCallback(function (OriginFolder $folder) use ($stored): OriginFolder {
                $this->assertSame('/Photos/Originals', $folder->getFolderPath());

                return $stored;
            });

        $mapper->expects($this->once())
            ->method('findAll')
            ->with('alice')
            ->willReturn([$stored]);

        $service = new OriginFolderService($mapper, $rootFolder, 'alice', $logger);
        $created = $service->create('Photos/Originals/');
        $this->assertSame('/Photos/Originals', $created->getFolderPath());

        // Multiple lookups reuse per-user cache (findAll called only once above)
        $this->assertTrue($service->isPathProtected('Photos/Originals/shot.jpg')['isProtected']);
        $this->assertTrue($service->isPathProtected('/alice/files/Photos/Originals/shot.jpg')['isProtected']);
        $this->assertTrue($service->isPathProtected('/Other/../Photos/Originals/shot.jpg')['isProtected']);
        $this->assertFalse($service->isPathProtected('/Photos/OriginalsCopy/shot.jpg')['isProtected']);

        // Root-escaping traversal and null-byte fail closed
        $this->assertTrue($service->isPathProtected('/../../etc/passwd')['isProtected']);
        $this->assertTrue($service->isPathProtected("/Photos/a\0.jpg")['isProtected']);
    }

    /**
     * @dataProvider invalidFolderPathsProvider
     */
    public function testOriginFolderServiceRejectsInvalidPathsOnCreate(string $badPath): void
    {
        $service = new OriginFolderService(
            $this->createMock(OriginFolderMapper::class),
            $this->createMock(IRootFolder::class),
            'alice',
            $this->createMock(LoggerInterface::class)
        );

        $this->expectException(\InvalidArgumentException::class);
        $service->create($badPath);
    }

    public static function invalidFolderPathsProvider(): array
    {
        return [
            'empty' => [''],
            'root slash' => ['/'],
            'dot only' => ['.'],
            'parent traversal' => ['/Photos/../Secret'],
            'null byte' => ["/Photos\0/Originals"],
        ];
    }

    public function testOriginFolderServiceInvalidatesCacheOnDelete(): void
    {
        $mapper = $this->createMock(OriginFolderMapper::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $logger = $this->createMock(LoggerInterface::class);

        $origin = new OriginFolder();
        $origin->setId(9);
        $origin->setUserId('alice');
        $origin->setFolderPath('/Originals');

        $mapper->expects($this->exactly(2))
            ->method('findAll')
            ->with('alice')
            ->willReturnOnConsecutiveCalls([$origin], []);
        $mapper->expects($this->once())->method('find')->with(9)->willReturn($origin);
        $mapper->expects($this->once())->method('delete')->with($origin)->willReturn($origin);

        $service = new OriginFolderService($mapper, $rootFolder, 'alice', $logger);

        $this->assertTrue($service->isPathProtected('/Originals/keep.jpg')['isProtected']);
        $service->delete(9);
        $this->assertFalse($service->isPathProtected('/Originals/keep.jpg')['isProtected']);
    }

    public function testExcludedFolderMapperEnforcesSegmentBoundaries(): void
    {
        $db = $this->createMock(IDBConnection::class);
        $qb = $this->createMock(IQueryBuilder::class);
        $expr = $this->createMock(IExpressionBuilder::class);
        $param = $this->createMock(IParameter::class);

        $expr->method('eq')->willReturn('user_id = :user');
        $qb->method('expr')->willReturn($expr);
        $qb->method('createNamedParameter')->willReturn($param);
        $qb->method('select')->willReturnSelf();
        $qb->method('from')->willReturnSelf();
        $qb->method('where')->willReturnSelf();
        $qb->method('executeQuery')->willReturnCallback(function (): IResult {
            $rows = [
                ['id' => 1, 'user_id' => 'alice', 'folder_path' => '/Photos', 'created_at' => '2026-01-01 00:00:00'],
                false,
            ];
            $idx = 0;
            $r = $this->createMock(IResult::class);
            $r->method('fetch')->willReturnCallback(function () use (&$rows, &$idx) {
                return $rows[$idx++] ?? false;
            });

            return $r;
        });

        $db->method('getQueryBuilder')->willReturn($qb);

        $mapper = new ExcludedFolderMapper($db, $this->createMock(LoggerInterface::class));

        $this->assertTrue($mapper->isPathInExcludedFolder('alice', '/Photos/shot.jpg'));
        $this->assertTrue($mapper->isPathInExcludedFolder('alice', '/Photos'));
        $this->assertFalse($mapper->isPathInExcludedFolder('alice', '/Photos_Backup/shot.jpg'));
        $this->assertFalse($mapper->isPathInExcludedFolder('alice', "/Photos\0/shot.jpg"));
    }

    public function testExcludedFolderServiceRejectsTraversalAndRootOnCreate(): void
    {
        $service = new ExcludedFolderService(
            $this->createMock(ExcludedFolderMapper::class),
            $this->createMock(IRootFolder::class),
            'alice',
            $this->createMock(LoggerInterface::class)
        );

        foreach (['/', '/Photos/../Private', "/Photos\0"] as $badPath) {
            try {
                $service->create($badPath);
                $this->fail('Expected RuntimeException for invalid excluded folder path: ' . $badPath);
            } catch (\RuntimeException $e) {
                $this->assertNotEmpty($e->getMessage());
            }
        }

        $excluded = new ExcludedFolder();
        $excluded->setUserId('alice');
        $excluded->setFolderPath('/Private');

        $mapper = $this->createMock(ExcludedFolderMapper::class);
        $mapper->method('findAllForUser')->with('alice')->willReturn([$excluded]);
        $service2 = new ExcludedFolderService(
            $mapper,
            $this->createMock(IRootFolder::class),
            'alice',
            $this->createMock(LoggerInterface::class)
        );

        $this->assertTrue($service2->isPathExcluded('/alice/files/Temp/../Private/doc.pdf'));
        $this->assertFalse($service2->isPathExcluded('/alice/files/PrivateCopy/doc.pdf'));
    }

    public function testProjectServiceEnforcesOwnershipPaginationBoundsAndNonAdminSizeLookup(): void
    {
        $projectMapper = $this->createMock(ProjectMapper::class);
        $duplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $service = new ProjectService(
            $projectMapper,
            $duplicateMapper,
            $rootFolder,
            $fileInfoService,
            'alice',
            $logger
        );

        // 1. Cross-user access denied via DoesNotExistException
        $projectMapper->expects($this->exactly(2))
            ->method('find')
            ->willReturnCallback(function (int $id, string $uid): Project {
                if ($id === 99) {
                    throw new DoesNotExistException('Not found for user');
                }
                $p = new Project();
                $p->setId($id);
                $p->setUserId($uid);

                return $p;
            });

        try {
            $service->getDuplicates(99, 'all', 1, 20);
            $this->fail('Expected DoesNotExistException for unowned project');
        } catch (DoesNotExistException $e) {
            $this->assertSame('Not found for user', $e->getMessage());
        }

        // 2. Non-admin filesystem size fallback + clamped page/limit (0 / negative)
        $group = new FileDuplicate('hash-nonadmin', 'file_hash');
        $group->setId(5);
        $projectMapper->method('getDuplicateIds')->with(1)->willReturn([5]);
        $duplicateMapper->method('countByIds')->with([5], 'all')->willReturn(1);
        $duplicateMapper->expects($this->once())
            ->method('findByIds')
            ->with([5], 'all', 1, 0)
            ->willReturn([$group]);
        $duplicateMapper->method('findFilesByHash')
            ->with('hash-nonadmin', 'alice')
            ->willReturn([
                ['id' => 11, 'path' => '/alice/files/Docs/a.bin', 'size' => 0, 'updated_at' => 100],
            ]);

        $userFolder = $this->createMock(Folder::class);
        $fileNode = $this->createMock(File::class);
        $fileNode->method('getSize')->willReturn(4096);
        $rootFolder->method('getUserFolder')->with('alice')->willReturn($userFolder);
        $userFolder->expects($this->once())->method('nodeExists')->with('/Docs/a.bin')->willReturn(true);
        $userFolder->expects($this->once())->method('get')->with('/Docs/a.bin')->willReturn($fileNode);

        $result = $service->getDuplicates(1, 'all', 0, 0);
        $this->assertSame(1, $result['pagination']['currentPage']);
        $this->assertSame(1.0, (float)$result['pagination']['totalPages']);
        $this->assertSame(4096, $result['entities'][0]->getFiles()[0]->getSize());
    }

    public function testProjectServiceScanUsesSegmentBoundaryMatchingAndUpdateValidatesBeforeMutation(): void
    {
        $projectMapper = $this->createMock(ProjectMapper::class);
        $duplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $rootFolder = $this->createMock(IRootFolder::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $project = new Project();
        $project->setId(3);
        $project->setName('PhotoAudit');
        $project->setUserId('alice');

        $projectMapper->method('find')->with(3, 'alice')->willReturn($project);
        $projectMapper->method('getFolders')->with(3)->willReturn(['Photos']);

        // Update with invalid traversal folder must NOT call update() on mapper
        $projectMapper->expects($this->never())->method('update');
        $userFolder = $this->createMock(Folder::class);
        $rootFolder->method('getUserFolder')->with('alice')->willReturn($userFolder);

        $service = new ProjectService(
            $projectMapper,
            $duplicateMapper,
            $rootFolder,
            $fileInfoService,
            'alice',
            $logger
        );

        try {
            $service->update(3, 'NewName', ['/Photos/../Escape']);
            $this->fail('Expected InvalidArgumentException');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Invalid project folder path', $e->getMessage());
        }

        // Scan boundary test: /alice/files/Photos_Archive/a.jpg and /alice/files/Other/files/Photos/a.jpg
        // must NOT match project folder 'Photos'; /alice/files/Photos/a.jpg and b.jpg MUST match.
        $duplicateMapper->method('findDuplicatesWithFiles')->with('alice')->willReturn([
            ['id' => 10, 'hash' => 'false-positive-hash', 'type' => 'file_hash'],
            ['id' => 20, 'hash' => 'true-project-hash', 'type' => 'file_hash'],
        ]);
        $duplicateMapper->method('findFilesByHash')->willReturnMap([
            ['false-positive-hash', 'alice', [
                ['id' => 1, 'path' => '/alice/files/Photos_Archive/a.jpg', 'size' => 10, 'updated_at' => 1],
                ['id' => 2, 'path' => '/alice/files/Other/files/Photos/a.jpg', 'size' => 10, 'updated_at' => 1],
            ]],
            ['true-project-hash', 'alice', [
                ['id' => 3, 'path' => '/alice/files/Photos/one.jpg', 'size' => 10, 'updated_at' => 1],
                ['id' => 4, 'path' => '/alice/files/Photos/sub/two.jpg', 'size' => 10, 'updated_at' => 1],
            ]],
        ]);

        $projectMapper->expects($this->once())
            ->method('addDuplicate')
            ->with(3, 20);

        $service->scan(3);
    }

    public function testProjectApiControllerRejectsUnauthenticatedRequests(): void
    {
        $anonSession = $this->createMock(IUserSession::class);
        $anonSession->method('getUser')->willReturn(null);

        $controller = new ProjectApiController(
            $this->createMock(IRequest::class),
            $this->createMock(ProjectService::class),
            $this->createMock(FileDuplicateService::class),
            $anonSession,
            $this->createMock(LoggerInterface::class)
        );

        foreach ([
            $controller->index(),
            $controller->show(1),
            $controller->create('Name', ['/Photos']),
            $controller->update(1, 'Name', ['/Photos']),
            $controller->destroy(1),
            $controller->scan(1),
            $controller->duplicates(1),
        ] as $response) {
            $this->assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
        }
    }

    public function testFilterControllerRejectsUnauthenticatedAndInvalidInput(): void
    {
        $anonSession = $this->createMock(IUserSession::class);
        $anonSession->method('getUser')->willReturn(null);

        $anonController = new FilterController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(FilterService::class),
            $anonSession
        );

        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->index()->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->create('name', '*.tmp')->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->destroy(1)->getStatus());

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $authSession = $this->createMock(IUserSession::class);
        $authSession->method('getUser')->willReturn($user);

        $authController = new FilterController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(FilterService::class),
            $authSession
        );

        $this->assertSame(Http::STATUS_BAD_REQUEST, $authController->create('', '*.tmp')->getStatus());
        $this->assertSame(Http::STATUS_BAD_REQUEST, $authController->create('name', '   ')->getStatus());
    }

    public function testFileApiControllerAndFileServiceHardening(): void
    {
        // Unauthenticated FileApiController returns 401
        $anonController = new FileApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $this->createMock(FileService::class),
            '',
            $this->createMock(LoggerInterface::class)
        );
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->delete()->getStatus());

        // Batch paths with non-string / empty entries do not throw TypeError
        $request = $this->createMock(IRequest::class);
        $request->method('getParam')->willReturnMap([
            ['path', null, null],
            ['paths', null, [['nested'], '', '/Photos/ok.jpg']],
        ]);
        $request->method('getParams')->willReturn([]);

        $fileService = $this->createMock(FileService::class);
        $fileService->expects($this->once())
            ->method('deleteFile')
            ->with('alice', '/Photos/ok.jpg')
            ->willReturn([42]);

        $controller = new FileApiController(
            'duplicatefinder',
            $request,
            $fileService,
            'alice',
            $this->createMock(LoggerInterface::class)
        );

        $res = $controller->delete();
        $data = $res->getData();
        $this->assertSame(['/Photos/ok.jpg'], $data['success']);
        $this->assertCount(2, $data['errors']);
        $this->assertSame('INVALID_PATH', $data['errors'][0]['error']);
        $this->assertSame('INVALID_PATH', $data['errors'][1]['error']);

        // FileService rejects empty user, null byte, and '..' traversal
        $realFileService = new FileService(
            $this->createMock(FolderService::class),
            $this->createMock(OriginFolderService::class),
            $this->createMock(FileInfoService::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(LivePhotoDeletionService::class)
        );

        try {
            $realFileService->deleteFile('', '/Photos/a.jpg');
            $this->fail('Expected NotPermittedException');
        } catch (NotPermittedException $e) {
            $this->assertSame('Authentication required', $e->getMessage());
        }

        foreach (['/Photos/../Originals/a.jpg', "/Photos/a\0.jpg"] as $badPath) {
            try {
                $realFileService->deleteFile('alice', $badPath);
                $this->fail('Expected InvalidArgumentException for ' . $badPath);
            } catch (\InvalidArgumentException $e) {
                $this->assertSame('Invalid file path', $e->getMessage());
            }
        }
    }

    public function testDuplicateApiControllerAuthAndInputValidation(): void
    {
        $anonSession = $this->createMock(IUserSession::class);
        $anonSession->method('getUser')->willReturn(null);

        $anonController = new DuplicateApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $anonSession,
            $this->createMock(FileDuplicateService::class),
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateMapper::class),
            $this->createMock(IUserManager::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(OriginFolderService::class)
        );

        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->list()->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->acknowledge('abc')->getStatus());
        $this->assertSame(Http::STATUS_UNAUTHORIZED, $anonController->unacknowledge('abc')->getStatus());

        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $authSession = $this->createMock(IUserSession::class);
        $authSession->method('getUser')->willReturn($user);

        $authController = new DuplicateApiController(
            'duplicatefinder',
            $this->createMock(IRequest::class),
            $authSession,
            $this->createMock(FileDuplicateService::class),
            $this->createMock(FileInfoService::class),
            $this->createMock(FileDuplicateMapper::class),
            $this->createMock(IUserManager::class),
            $this->createMock(LoggerInterface::class),
            $this->createMock(OriginFolderService::class)
        );

        $this->assertSame(Http::STATUS_BAD_REQUEST, $authController->acknowledge('   ')->getStatus());
        $this->assertSame(Http::STATUS_BAD_REQUEST, $authController->unacknowledge('')->getStatus());
    }
}
