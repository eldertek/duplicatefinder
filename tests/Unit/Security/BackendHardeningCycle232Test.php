<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Unit\Security;

use OCA\DuplicateFinder\Command\ListFolderDuplicates;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\LivePhotoStatusService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\CMDUtils;
use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\Encryption\IManager as IEncryptionManager;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\IUserManager;
use OCP\Lock\ILockingProvider;
use OCP\Share\IShare;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;

class BackendHardeningCycle232Test extends TestCase
{
    public function testScannerUtilScopedScanIgnoresUnrelatedAndPrefixCollidingShares(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $filterService = $this->createMock(FilterService::class);
        $folderService = $this->createMock(FolderService::class);
        $fileInfoService = $this->createMock(FileInfoService::class);

        $filterService->method('shouldSkipDirectory')->willReturn(false);

        $photosFolder = $this->createMock(Folder::class);
        $photosFolder->method('getPath')->willReturn('/qa-bot/files/Photos');
        $photosFolder->method('getDirectoryListing')->willReturn([]);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files');
        $userFolder->expects($this->once())
            ->method('get')
            ->with('Photos')
            ->willReturn($photosFolder);

        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        // Unrelated share from another user: previously matched because strpos(...) === false and false == 0
        $unrelatedShareFile = $this->createMock(File::class);
        $unrelatedShareFile->method('getPath')->willReturn('/sentinel/files/PrivateShare/doc.pdf');
        $unrelatedShareFile->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);
        $unrelatedShare = $this->createMock(IShare::class);
        $unrelatedShare->method('getNode')->willReturn($unrelatedShareFile);
        $unrelatedShare->method('getTarget')->willReturn('/PrivateShare/doc.pdf');

        // Prefix-colliding share (/Photos vs /PhotosArchive)
        $collidingShareFile = $this->createMock(File::class);
        $collidingShareFile->method('getPath')->willReturn('/sentinel/files/PhotosArchive/pic.jpg');
        $collidingShareFile->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);
        $collidingShare = $this->createMock(IShare::class);
        $collidingShare->method('getNode')->willReturn($collidingShareFile);
        $collidingShare->method('getTarget')->willReturn('/PhotosArchive/pic.jpg');

        // In-scope share mounted inside /Photos/FromSentinel
        $inScopeShareFile = $this->createMock(File::class);
        $inScopeShareFile->method('getPath')->willReturn('/sentinel/files/Album/shot.jpg');
        $inScopeShareFile->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);
        $inScopeShare = $this->createMock(IShare::class);
        $inScopeShare->method('getNode')->willReturn($inScopeShareFile);
        $inScopeShare->method('getTarget')->willReturn('/Photos/FromSentinel/shot.jpg');

        $shareService->expects($this->once())
            ->method('getShares')
            ->with('qa-bot')
            ->willReturn([$unrelatedShare, $collidingShare, $inScopeShare]);

        $fileInfoService->expects($this->once())
            ->method('save')
            ->with('/sentinel/files/Album/shot.jpg', 'qa-bot');

        $scanner = new ScannerUtil($logger, $shareService, $filterService, $folderService);
        $scanner->setHandles($fileInfoService, null, null);
        $scanner->scan('qa-bot', '/qa-bot/files/Photos');
    }

    public function testScannerUtilFullScanStillIncludesAllReceivedShares(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $filterService = $this->createMock(FilterService::class);
        $folderService = $this->createMock(FolderService::class);
        $fileInfoService = $this->createMock(FileInfoService::class);

        $filterService->method('shouldSkipDirectory')->willReturn(false);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files');
        $userFolder->method('getDirectoryListing')->willReturn([]);
        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $sharedFile = $this->createMock(File::class);
        $sharedFile->method('getPath')->willReturn('/sentinel/files/SharedDoc.txt');
        $sharedFile->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);

        $share = $this->createMock(IShare::class);
        $share->method('getNode')->willReturn($sharedFile);
        $share->method('getTarget')->willReturn('/SharedDoc.txt');

        $shareService->method('getShares')->with('qa-bot')->willReturn([$share]);

        $fileInfoService->expects($this->once())
            ->method('save')
            ->with('/sentinel/files/SharedDoc.txt', 'qa-bot');

        $scanner = new ScannerUtil($logger, $shareService, $filterService, $folderService);
        $scanner->setHandles($fileInfoService, null, null);
        $scanner->scan('qa-bot', '/qa-bot/files');
    }

    public function testScannerUtilStripsOnlyAnchoredUserRootAndRejectsUnsafePaths(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $shareService = $this->createMock(ShareService::class);
        $filterService = $this->createMock(FilterService::class);
        $folderService = $this->createMock(FolderService::class);
        $fileInfoService = $this->createMock(FileInfoService::class);

        $filterService->method('shouldSkipDirectory')->willReturn(false);
        $shareService->method('getShares')->willReturn([]);

        $nestedFolder = $this->createMock(Folder::class);
        $nestedFolder->method('getPath')->willReturn('/qa-bot/files/backup/qa-bot/files/sub');
        $nestedFolder->method('getDirectoryListing')->willReturn([]);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files');
        $userFolder->expects($this->once())
            ->method('get')
            ->with('backup/qa-bot/files/sub')
            ->willReturn($nestedFolder);

        $folderService->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);

        $scanner = new ScannerUtil($logger, $shareService, $filterService, $folderService);
        $scanner->setHandles($fileInfoService, null, null);

        // Unsafe paths must abort before touching $userFolder->get()
        $scanner->scan('qa-bot', '/qa-bot/files/../../sentinel/files');
        $scanner->scan('qa-bot', "/qa-bot/files/Photos\0bad");
        $scanner->scan('qa-bot', '/sentinel/files/secret');

        // Valid path containing repeated "/qa-bot/files" substring must preserve the inner segment
        $scanner->scan('qa-bot', '/qa-bot/files/backup/qa-bot/files/sub');
    }

    public function testFolderServiceRejectsTraversalAndNullBytePaths(): void
    {
        $rootFolder = $this->createMock(IRootFolder::class);
        $userManager = $this->createMock(IUserManager::class);
        $logger = $this->createMock(LoggerInterface::class);

        $userManager->method('userExists')->with('qa-bot')->willReturn(true);

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files');
        $userFolder->expects($this->never())->method('get');

        $rootFolder->method('getUserFolder')->with('qa-bot')->willReturn($userFolder);
        $rootFolder->expects($this->never())->method('get');

        $service = new FolderService($rootFolder, $userManager, $logger);

        $traversalFile = new FileInfo('/qa-bot/files/../../sentinel/files/secret.txt', 'qa-bot');
        $nullByteFile = new FileInfo("/qa-bot/files/photo\0.jpg", 'qa-bot');
        $backslashTraversal = new FileInfo('/qa-bot/files\\..\\..\\sentinel\\secret.txt', 'qa-bot');
        $emptyFile = new FileInfo('', 'qa-bot');

        $this->assertNull($service->getNodeByFileInfo($traversalFile, 'qa-bot'));
        $this->assertSame('qa-bot', $traversalFile->getOwner());
        $this->assertNull($service->getNodeByFileInfo($nullByteFile));
        $this->assertNull($service->getNodeByFileInfo($backslashTraversal));
        $this->assertNull($service->getNodeByFileInfo($emptyFile));

        // isNodeGone must fail safe to false on unsafe paths so stale cleanup never drops DB rows blindly
        $this->assertFalse($service->isNodeGone($traversalFile));
        $this->assertFalse($service->isNodeGone($nullByteFile));
        $this->assertFalse($service->isNodeGone($backslashTraversal));
        $this->assertFalse($service->isNodeGone($emptyFile));
    }

    public function testPathConversionUtilsRejectsTraversalInRelativeConversion(): void
    {
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/qa-bot/files');

        $traversal = new FileInfo('/qa-bot/files/../sentinel/files/secret.txt', 'qa-bot');

        $this->expectException(\InvalidArgumentException::class);
        PathConversionUtils::convertRelativePathToUserFolder($traversal, $userFolder);
    }

    public function testFileDuplicateServiceResetsUserContextAndIsolatesForeignTreeOriginCheck(): void
    {
        $logger = $this->createMock(LoggerInterface::class);
        $mapper = $this->createMock(FileDuplicateMapper::class);
        $fileInfoService = $this->createMock(FileInfoService::class);
        $originFolderService = $this->createMock(OriginFolderService::class);
        $lockingProvider = $this->createMock(ILockingProvider::class);
        $livePhotoStatusService = $this->createMock(LivePhotoStatusService::class);

        $ownFile = new FileInfo('/qa-bot/files/Photos/a.jpg', 'qa-bot');
        $ownFile->setNodeId(101);
        $foreignFile = new FileInfo('/sentinel/files/Photos/b.jpg', 'sentinel');
        $foreignFile->setNodeId(202);

        $dupUser = new FileDuplicate('hash-user', 'file_hash');
        $dupUser->setFiles([$ownFile, $foreignFile]);

        $adminFile1 = new FileInfo('/probe/files/x.jpg', 'probe');
        $adminFile1->setNodeId(301);
        $adminFile2 = new FileInfo('/probe/files/y.jpg', 'probe');
        $adminFile2->setNodeId(302);
        $dupAdmin = new FileDuplicate('hash-admin', 'file_hash');
        $dupAdmin->setFiles([$adminFile1, $adminFile2]);

        $mapper->expects($this->exactly(2))
            ->method('findAll')
            ->willReturnOnConsecutiveCalls([$dupUser], [$dupAdmin]);

        $fileInfoService->method('findByHash')->willReturn([$ownFile, $foreignFile]);
        $fileInfoService->method('hasAccessRight')->willReturn(true);
        $fileInfoService->method('enrich')->willReturnArgument(0);

        // OriginFolderService must receive 'qa-bot' on first call and null on second call,
        // and must only be queried for qa-bot's own path (not sentinel's /Photos)
        $originFolderService->expects($this->exactly(2))
            ->method('setUserId')
            ->withConsecutive(['qa-bot'], [null]);

        $originFolderService->expects($this->once())
            ->method('isPathProtected')
            ->with('/Photos/a.jpg')
            ->willReturn(['isProtected' => true]);

        // LivePhotoStatusService must only be called for qa-bot, never leaked into the user=null call
        $livePhotoStatusService->expects($this->once())
            ->method('markMissingVideos')
            ->with($this->anything(), 'qa-bot');

        $service = new FileDuplicateService(
            $logger,
            $mapper,
            $fileInfoService,
            $originFolderService,
            $lockingProvider,
            $livePhotoStatusService
        );

        $userResult = $service->findAll('all', 'qa-bot', 1, 20, true);
        $this->assertCount(1, $userResult['entities']);
        $this->assertTrue($ownFile->getIsInOriginFolder());
        $this->assertFalse($foreignFile->getIsInOriginFolder());

        $adminResult = $service->findAll('all', null, 1, 0, true);
        $this->assertCount(1, $adminResult['entities']);
        $this->assertFalse($adminFile1->getIsInOriginFolder());
        $this->assertFalse($adminFile2->getIsInOriginFolder());
    }

    public function testListFolderDuplicatesAndCmdUtilsPaginateByNextOffsetWithoutDuplication(): void
    {
        $groupA = new FileDuplicate('hash-a', 'file_hash');
        $a1 = new FileInfo('/qa-bot/files/DirA/doc.bin', 'qa-bot');
        $a1->setNodeId(2);
        $a1->setSize(1024);
        $a2 = new FileInfo('/qa-bot/files/DirB/doc.bin', 'qa-bot');
        $a2->setNodeId(3);
        $a2->setSize(1024);

        $groupB = new FileDuplicate('hash-b', 'file_hash');
        $b1 = new FileInfo('/qa-bot/files/DirA/extra.bin', 'qa-bot');
        $b1->setNodeId(4);
        $b1->setSize(2048);
        $b2 = new FileInfo('/qa-bot/files/DirB/extra.bin', 'qa-bot');
        $b2->setNodeId(5);
        $b2->setSize(2048);

        $fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $groupA->setFiles([$a1, $a2]);
        $groupB->setFiles([$b1, $b2]);

        $fileDuplicateService->expects($this->exactly(2))
            ->method('findAll')
            ->withConsecutive(
                ['all', 'qa-bot', 1, 100, true],
                ['all', 'qa-bot', 1, 100, true, [['hash'], ['type']], 0, 3]
            )
            ->willReturnOnConsecutiveCalls(
                [
                    'entities' => [$groupA],
                    'pageKey' => 0,
                    'nextOffset' => 3,
                    'isLastFetched' => false,
                ],
                [
                    'entities' => [$groupB],
                    'pageKey' => 3,
                    'nextOffset' => 4,
                    'isLastFetched' => true,
                ]
            );

        $userManager = $this->createMock(IUserManager::class);
        $userManager->method('userExists')->with('qa-bot')->willReturn(true);
        $encryptionManager = $this->createMock(IEncryptionManager::class);
        $encryptionManager->method('isEnabled')->willReturn(false);

        $command = new ListFolderDuplicates(
            $userManager,
            $encryptionManager,
            $fileDuplicateService,
            new FolderDuplicateService()
        );

        $output = new BufferedOutput();
        $exit = $command->run(new ArrayInput(['--user' => ['qa-bot'], '--json' => true]), $output);
        $this->assertSame(0, $exit);
        $decoded = json_decode($output->fetch(), true);
        $this->assertSame(1, $decoded['qa-bot']['summary']['groupCount']);
        $this->assertSame(2, $decoded['qa-bot']['groups'][0]['fileCount']);

        // Also verify CMDUtils::showDuplicates advances using nextOffset rather than drifting pages
        $cmdService = $this->createMock(FileDuplicateService::class);
        $cmdService->expects($this->exactly(2))
            ->method('findAll')
            ->withConsecutive(
                ['all', 'qa-bot', 1, 1, true],
                ['all', 'qa-bot', 1, 1, true, [['hash'], ['type']], 0, 3]
            )
            ->willReturnOnConsecutiveCalls(
                [
                    'entities' => [$groupA],
                    'pageKey' => 2,
                    'nextOffset' => 3,
                    'isLastFetched' => false,
                ],
                [
                    'entities' => [$groupB],
                    'pageKey' => 3,
                    'nextOffset' => 4,
                    'isLastFetched' => true,
                ]
            );

        $cmdOutput = new BufferedOutput();
        CMDUtils::showDuplicates($cmdService, $cmdOutput, static function (): void {}, 'qa-bot', 1);
        $text = $cmdOutput->fetch();
        $this->assertStringContainsString('hash-a', $text);
        $this->assertStringContainsString('hash-b', $text);
    }
}
