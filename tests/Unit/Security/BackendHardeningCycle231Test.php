<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\Controller\FilterController;
use OCA\DuplicateFinder\Controller\OriginFolderApiController;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\Filter;
use OCA\DuplicateFinder\Db\FilterMapper;
use OCA\DuplicateFinder\Db\OriginFolder;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use OCA\DuplicateFinder\Listener\NewHashListener;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\EmptyFolderCleanupService;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Share\IManager;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class BackendHardeningCycle231Test extends TestCase
{
    public function testOriginFolderApiControllerRejectsUnauthenticatedRequestsWith401(): void
    {
        $request = $this->createMock(IRequest::class);
        $service = $this->createMock(OriginFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $service->expects($this->never())->method('findAll');
        $service->expects($this->never())->method('create');
        $service->expects($this->never())->method('delete');

        foreach ([null, ''] as $unauthenticatedUserId) {
            $controller = new OriginFolderApiController(
                'duplicatefinder',
                $request,
                $service,
                $unauthenticatedUserId,
                $logger
            );

            $indexResp = $controller->index();
            $this->assertSame(Http::STATUS_UNAUTHORIZED, $indexResp->getStatus());

            $createResp = $controller->create(['/Photos']);
            $this->assertSame(Http::STATUS_UNAUTHORIZED, $createResp->getStatus());

            $destroyResp = $controller->destroy(1);
            $this->assertSame(Http::STATUS_UNAUTHORIZED, $destroyResp->getStatus());
        }
    }

    public function testOriginFolderApiControllerBindsUserContextAndValidatesInputs(): void
    {
        $request = $this->createMock(IRequest::class);
        $service = $this->createMock(OriginFolderService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $service->expects($this->exactly(3))
            ->method('setUserId')
            ->with('qa-bot');

        $origin = new OriginFolder();
        $origin->setId(7);
        $origin->setUserId('qa-bot');
        $origin->setFolderPath('/Photos');

        $service->expects($this->once())
            ->method('create')
            ->with('/Photos')
            ->willReturn($origin);
        $service->expects($this->never())->method('delete');

        $controller = new OriginFolderApiController(
            'duplicatefinder',
            $request,
            $service,
            'qa-bot',
            $logger
        );

        $emptyResp = $controller->create([]);
        $this->assertSame(Http::STATUS_BAD_REQUEST, $emptyResp->getStatus());

        $mixedResp = $controller->create(['/Photos', 123, '', "/evil\0path"]);
        $this->assertSame(Http::STATUS_MULTI_STATUS, $mixedResp->getStatus());
        $data = $mixedResp->getData();
        $this->assertSame(['/Photos'], $data['created']);
        $this->assertCount(3, $data['errors']);

        $badDestroyResp = $controller->destroy(0);
        $this->assertSame(Http::STATUS_BAD_REQUEST, $badDestroyResp->getStatus());
    }

    public function testConvertSharedPathHandlesDirectFolderShareWithoutDuplicatingPath(): void
    {
        $srcUserFolder = $this->createMock(Folder::class);
        $srcUserFolder->method('getPath')->willReturn('/alice/files');

        $targetUserFolder = $this->createMock(Folder::class);
        $targetUserFolder->method('getPath')->willReturn('/alexander/files');

        $srcNode = $this->createMock(Folder::class);
        $srcNode->method('getPath')->willReturn('/alice/files/ProjectVault');

        $share = $this->createMock(IShare::class);
        $share->method('getNodeType')->willReturn('folder');
        $share->method('getTarget')->willReturn('/SharedVault');

        $resolved = PathConversionUtils::convertSharedPath(
            $srcUserFolder,
            $targetUserFolder,
            $srcNode,
            $share,
            0
        );

        $this->assertSame('/alexander/files/SharedVault', $resolved);
    }

    public function testConvertSharedPathHandlesNestedFolderShareAcrossDifferentUsernameLengths(): void
    {
        $srcUserFolder = $this->createMock(Folder::class);
        $srcUserFolder->method('getPath')->willReturn('/alice/files');

        $targetUserFolder = $this->createMock(Folder::class);
        $targetUserFolder->method('getPath')->willReturn('/alexander_long_uid/files');

        $srcNode = $this->createMock(File::class);
        $srcNode->method('getPath')->willReturn('/alice/files/ProjectVault/2026/budget.xlsx');

        $share = $this->createMock(IShare::class);
        $share->method('getNodeType')->willReturn('folder');
        $share->method('getTarget')->willReturn('/SharedVault');

        $resolved = PathConversionUtils::convertSharedPath(
            $srcUserFolder,
            $targetUserFolder,
            $srcNode,
            $share,
            2
        );

        $this->assertSame('/alexander_long_uid/files/SharedVault/2026/budget.xlsx', $resolved);
    }

    /**
     * @dataProvider invalidSharedPathProvider
     */
    public function testConvertSharedPathRejectsTraversalAndOutOfBoundsPaths(
        string $target,
        string $nodePath,
        int $strippedFolders
    ): void {
        $srcUserFolder = $this->createMock(Folder::class);
        $srcUserFolder->method('getPath')->willReturn('/alice/files');

        $targetUserFolder = $this->createMock(Folder::class);
        $targetUserFolder->method('getPath')->willReturn('/bob/files');

        $srcNode = $this->createMock(Node::class);
        $srcNode->method('getPath')->willReturn($nodePath);

        $share = $this->createMock(IShare::class);
        $share->method('getNodeType')->willReturn('folder');
        $share->method('getTarget')->willReturn($target);

        $this->expectException(\InvalidArgumentException::class);
        PathConversionUtils::convertSharedPath(
            $srcUserFolder,
            $targetUserFolder,
            $srcNode,
            $share,
            $strippedFolders
        );
    }

    public static function invalidSharedPathProvider(): array
    {
        return [
            'traversal in target' => ['/../etc/passwd', '/alice/files/Shared/a.txt', 1],
            'null byte in target' => ["/Shared\0evil", '/alice/files/Shared/a.txt', 1],
            'traversal in source node' => ['/Shared', '/alice/files/../secret/a.txt', 1],
            'source outside owner folder' => ['/Shared', '/other/files/Shared/a.txt', 1],
            'stripped depth exceeds segments' => ['/Shared', '/alice/files/a.txt', 3],
        ];
    }

    public function testConvertRelativePathToUserFolderValidatesBoundaryAndTrailingSlash(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files/');

        $inside = new FileInfo('/qa-bot/files/Docs/spec.pdf', 'qa-bot');
        $this->assertSame('/Docs/spec.pdf', PathConversionUtils::convertRelativePathToUserFolder($inside, $userFolder));

        $outside = new FileInfo('/other/files/Docs/spec.pdf', 'qa-bot');
        $this->expectException(\InvalidArgumentException::class);
        PathConversionUtils::convertRelativePathToUserFolder($outside, $userFolder);
    }

    public function testShareServiceHasAccessRightUsesOwnerFolderAndStopsOnSelfParentCycle(): void
    {
        $rootFolder = $this->createMock(IRootFolder::class);
        $shareManager = $this->createMock(IManager::class);
        $logger = $this->createMock(LoggerInterface::class);
        $userManager = $this->createMock(IUserManager::class);

        $aliceUser = $this->createMock(IUser::class);
        $aliceUser->method('getUID')->willReturn('alice');

        $aliceFolder = $this->createMock(Folder::class);
        $aliceFolder->method('getPath')->willReturn('/alice/files');

        $recipientFolder = $this->createMock(Folder::class);
        $recipientFolder->method('getPath')->willReturn('/alexander_recipient/files');

        $rootFolder->method('getUserFolder')->willReturnMap([
            ['alice', $aliceFolder],
            ['alexander_recipient', $recipientFolder],
        ]);

        $userManager->method('userExists')->willReturnCallback(
            static fn (string $uid): bool => in_array($uid, ['alice', 'alexander_recipient'], true)
        );

        $parentFolder = $this->createMock(Folder::class);
        $parentFolder->method('getPath')->willReturn('/alice/files/Projects');

        $subFolder = $this->createMock(Folder::class);
        $subFolder->method('getPath')->willReturn('/alice/files/Projects/sub');
        $subFolder->method('getParent')->willReturn($parentFolder);

        $sharedFile = $this->createMock(File::class);
        $sharedFile->method('getPath')->willReturn('/alice/files/Projects/sub/doc.pdf');
        $sharedFile->method('getOwner')->willReturn($aliceUser);
        $sharedFile->method('getParent')->willReturn($subFolder);

        $share = $this->createMock(IShare::class);
        $share->method('getSharedWith')->willReturn('alexander_recipient');
        $share->method('getShareType')->willReturn(IShare::TYPE_USER);
        $share->method('getNodeType')->willReturn('folder');
        $share->method('getTarget')->willReturn('/SharedProjects');

        $shareManager->method('getAccessList')->willReturn(['users' => ['alexander_recipient' => true]]);
        $shareManager->method('getSharedWith')->willReturnCallback(
            static function (string $user, int $type, ?Node $node) use ($parentFolder, $share): array {
                if ($type === IShare::TYPE_USER && $node === $parentFolder) {
                    return [$share];
                }

                return [];
            }
        );

        $service = new ShareService($rootFolder, $shareManager, $logger, $userManager);
        $resolved = $service->hasAccessRight($sharedFile, 'alexander_recipient');

        $this->assertSame('/alexander_recipient/files/SharedProjects/sub/doc.pdf', $resolved);

        // Self-parent cycle must terminate cleanly and return null instead of looping forever
        $cyclicNode = $this->createMock(Node::class);
        $cyclicNode->method('getParent')->willReturn($cyclicNode);
        $shareManager2 = $this->createMock(IManager::class);
        $shareManager2->method('getAccessList')->willReturn(['users' => ['alexander_recipient' => true]]);
        $shareManager2->method('getSharedWith')->willReturn([]);
        $service2 = new ShareService($rootFolder, $shareManager2, $logger, $userManager);

        $this->assertNull($service2->hasAccessRight($cyclicNode, 'alexander_recipient'));
        $this->assertNull($service2->hasAccessRight($cyclicNode, ''));
    }

    public function testFilterServiceWildcardMatchingResistsRedosAndMatchesLiteralMetacharacters(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $config = $this->createMock(ConfigService::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $excludedFolderService->method('isPathExcluded')->willReturn(false);
        $filterMapper = $this->createMock(FilterMapper::class);

        $adversarial = new Filter();
        $adversarial->setType('name');
        $adversarial->setValue(str_repeat('*a', 24) . 'z');

        $literalMeta = new Filter();
        $literalMeta->setType('name');
        $literalMeta->setValue('report+v1[final].txt');

        $filterMapper->method('findByType')->willReturnCallback(
            static fn (string $type): array => $type === 'name' ? [$adversarial, $literalMeta] : []
        );

        $service = new FilterService($logger, $config, $excludedFolderService, $filterMapper);

        $node = $this->createMock(Node::class);
        $node->method('isMounted')->willReturn(false);
        $node->method('getParent')->willReturn(null);

        $nonMatching = new FileInfo('/qa-bot/files/' . str_repeat('a', 40) . '.txt', 'qa-bot');
        $start = hrtime(true);
        $this->assertFalse($service->isIgnored($nonMatching, $node));
        $elapsedMs = (hrtime(true) - $start) / 1e6;
        $this->assertLessThan(50.0, $elapsedMs);

        $matchingLiteral = new FileInfo('/qa-bot/files/report+v1[final].txt', 'qa-bot');
        $this->assertTrue($service->isIgnored($matchingLiteral, $node));
    }

    public function testFilterServiceAndControllerValidateInputsAndMapNotFoundTo404(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $config = $this->createMock(ConfigService::class);
        $excludedFolderService = $this->createMock(ExcludedFolderService::class);
        $filterMapper = $this->createMock(FilterMapper::class);

        $service = new FilterService($logger, $config, $excludedFolderService, $filterMapper);

        try {
            $service->createFilter('regex', '.*tmp', 'qa-bot');
            $this->fail('Expected InvalidArgumentException for unsupported filter type');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Unsupported filter type', $e->getMessage());
        }

        try {
            $service->createFilter('name', "bad\0.tmp", 'qa-bot');
            $this->fail('Expected InvalidArgumentException for null-byte filter value');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Invalid filter value', $e->getMessage());
        }

        try {
            $service->deleteFilter(0, 'qa-bot');
            $this->fail('Expected InvalidArgumentException for non-positive filter ID');
        } catch (\InvalidArgumentException $e) {
            $this->assertStringContainsString('Invalid filter ID', $e->getMessage());
        }

        $filterMapper->method('find')->with(999, 'qa-bot')->willThrowException(new DoesNotExistException('Not found'));

        $request = $this->createMock(IRequest::class);
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('qa-bot');
        $userSession = $this->createMock(IUserSession::class);
        $userSession->method('getUser')->willReturn($user);

        $controller = new FilterController('duplicatefinder', $request, $service, $userSession);

        $badCreate = $controller->create('invalid_type', '*.tmp');
        $this->assertSame(Http::STATUS_BAD_REQUEST, $badCreate->getStatus());

        $badDestroy = $controller->destroy(-1);
        $this->assertSame(Http::STATUS_BAD_REQUEST, $badDestroy->getStatus());

        $notFoundDestroy = $controller->destroy(999);
        $this->assertSame(Http::STATUS_NOT_FOUND, $notFoundDestroy->getStatus());
    }

    public function testEmptyFolderCleanupRejectsNullBytePaths(): void
    {
        $folderService = $this->createMock(FolderService::class);
        $userFolder = $this->createMock(Folder::class);
        $userFolder->expects($this->never())->method('get');
        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $originFolderService = $this->createMock(OriginFolderService::class);
        $originFolderService->method('findAll')->willReturn([]);

        $excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $service = new EmptyFolderCleanupService(
            $folderService,
            $originFolderService,
            $excludedFolderService,
            $this->createMock(LoggerInterface::class)
        );

        $result = $service->deleteEmptyFolders('qa-bot', ["/Temp\0Hidden"]);
        $this->assertSame([], $result['deleted']);
        $this->assertCount(1, $result['errors']);
        $this->assertSame('INVALID_PATH', $result['errors'][0]['error']);
    }

    public function testNewHashListenerIgnoresEmptyStringHash(): void
    {
        $fileInfoService = $this->createMock(FileInfoService::class);
        $fileDuplicateService = $this->createMock(FileDuplicateService::class);
        $logger = $this->createMock(LoggerInterface::class);

        $fileInfoService->expects($this->never())->method('countByHash');
        $fileDuplicateService->expects($this->never())->method('getOrCreate');
        $fileDuplicateService->expects($this->never())->method('delete');

        $fileInfo = new FileInfo('/qa-bot/files/doc.txt', 'qa-bot');
        $fileInfo->setFileHash('');
        $event = new CalculatedHashEvent($fileInfo, '');

        $listener = new NewHashListener($fileInfoService, $fileDuplicateService, $logger);
        $listener->handle($event);
    }
}
