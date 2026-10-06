<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\ExcludedFolderService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FilterService;
use OCA\DuplicateFinder\Service\FolderService;
use OCA\DuplicateFinder\Service\ShareService;
use OCA\DuplicateFinder\Utils\ScannerUtil;
use OCP\EventDispatcher\IEventDispatcher;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IDBConnection;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileInfoServiceTest extends TestCase
{
    private $mapper;
    private $eventDispatcher;
    private $logger;
    private $shareService;
    private $filterService;
    private $folderService;
    private $scannerUtil;
    private $lockingProvider;
    private $rootFolder;
    private $connection;
    private $excludedFolderService;
    private $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->eventDispatcher = $this->createMock(IEventDispatcher::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->shareService = $this->createMock(ShareService::class);
        $this->filterService = $this->createMock(FilterService::class);
        $this->folderService = $this->createMock(FolderService::class);
        $this->scannerUtil = $this->createMock(ScannerUtil::class);
        $this->lockingProvider = $this->createMock(ILockingProvider::class);
        $this->rootFolder = $this->createMock(IRootFolder::class);
        $this->connection = $this->createMock(IDBConnection::class);
        $this->excludedFolderService = $this->createMock(ExcludedFolderService::class);

        $this->service = new FileInfoService(
            $this->mapper,
            $this->eventDispatcher,
            $this->logger,
            $this->shareService,
            $this->filterService,
            $this->folderService,
            $this->scannerUtil,
            $this->lockingProvider,
            $this->rootFolder,
            $this->connection,
            $this->excludedFolderService
        );
    }

    public function testDeleteSetsUserContextWhenOwnerExists()
    {
        // Créer un mock pour FileInfo avec un propriétaire
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner', 'getId', 'getFileHash'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/path/to/file.txt');
        $fileInfo->method('getOwner')->willReturn('testuser');
        $fileInfo->method('getId')->willReturn(1);
        $fileInfo->method('getFileHash')->willReturn('hash123');

        // Configurer le mapper pour qu'il trouve le FileInfo
        $this->mapper->expects($this->once())
            ->method('findById')
            ->with(1)
            ->willReturn($fileInfo);

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        // Configurer le FolderService pour qu'il retourne un Node
        $node = $this->createMock(Node::class);
        $node->method('getId')->willReturn(123);

        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo)
            ->willReturn($node);

        // Le Node ne devrait pas être supprimé dans ce test
        // Note: Nous ne pouvons pas vérifier cela car le mock Node n'a pas de méthode delete

        // Le mapper devrait être appelé pour supprimer le FileInfo
        $this->mapper->expects($this->once())
            ->method('delete')
            ->with($fileInfo)
            ->willReturn($fileInfo);

        // Appeler la méthode delete
        $result = $this->service->delete($fileInfo);

        // Vérifier que le résultat est le FileInfo
        $this->assertSame($fileInfo, $result);
    }

    public function testUpdateFileMetaSetsUserContextFromOwner()
    {
        // Créer un mock pour FileInfo
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner', 'setSize', 'setMimetype', 'setOwner', 'setIgnored'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/path/to/file.txt');

        // Créer un mock pour Node
        $node = $this->createMock(Node::class);
        $node->method('getSize')->willReturn(1024);
        $node->method('getMimetype')->willReturn('text/plain');
        $node->method('getMtime')->willReturn(time());

        // Créer un mock pour Owner
        $owner = $this->createMock(\OCP\IUser::class);
        $owner->method('getUID')->willReturn('testuser');

        // Le Node retourne l'Owner
        $node->method('getOwner')->willReturn($owner);

        // Configurer le FolderService pour qu'il retourne le Node
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo, null)
            ->willReturn($node);

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('testuser');

        // Le FileInfo devrait être mis à jour avec les informations du Node
        $fileInfo->expects($this->once())
            ->method('setSize')
            ->with(1024);

        $fileInfo->expects($this->once())
            ->method('setMimetype')
            ->with('text/plain');

        $fileInfo->expects($this->once())
            ->method('setOwner')
            ->with('testuser');

        // Le FilterService devrait être appelé pour vérifier si le fichier est ignoré
        $this->filterService->expects($this->once())
            ->method('isIgnored')
            ->with($fileInfo, $node)
            ->willReturn(false);

        $fileInfo->expects($this->once())
            ->method('setIgnored')
            ->with(false);

        // Appeler la méthode updateFileMeta
        $result = $this->service->updateFileMeta($fileInfo);

        // Vérifier que le résultat est le FileInfo
        $this->assertSame($fileInfo, $result);
    }

    public function testUpdateFileMetaSetsUserContextFromFallbackUID()
    {
        // Créer un mock pour FileInfo
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner', 'setSize', 'setMimetype', 'setOwner', 'setIgnored'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/path/to/file.txt');

        // Créer un mock pour Node
        $node = $this->createMock(Node::class);
        $node->method('getSize')->willReturn(1024);
        $node->method('getMimetype')->willReturn('text/plain');
        $node->method('getMtime')->willReturn(time());

        // Le Node lance une exception lors de l'appel à getOwner()
        $node->method('getOwner')->willThrowException(new \Exception('No owner'));

        // Configurer le FolderService pour qu'il retourne le Node
        $this->folderService->expects($this->once())
            ->method('getNodeByFileInfo')
            ->with($fileInfo, 'fallbackuser')
            ->willReturn($node);

        // L'ExcludedFolderService devrait être appelé pour définir le contexte utilisateur avec le fallbackUID
        $this->excludedFolderService->expects($this->once())
            ->method('setUserId')
            ->with('fallbackuser');

        // Le FileInfo devrait être mis à jour avec les informations du Node
        $fileInfo->expects($this->once())
            ->method('setSize')
            ->with(1024);

        $fileInfo->expects($this->once())
            ->method('setMimetype')
            ->with('text/plain');

        $fileInfo->expects($this->once())
            ->method('setOwner')
            ->with('fallbackuser');

        // Le FilterService devrait être appelé pour vérifier si le fichier est ignoré
        $this->filterService->expects($this->once())
            ->method('isIgnored')
            ->with($fileInfo, $node)
            ->willReturn(false);

        $fileInfo->expects($this->once())
            ->method('setIgnored')
            ->with(false);

        // Appeler la méthode updateFileMeta avec un fallbackUID
        $result = $this->service->updateFileMeta($fileInfo, 'fallbackuser');

        // Vérifier que le résultat est le FileInfo
        $this->assertSame($fileInfo, $result);
    }

    /**
     * Test that hasAccessRight correctly identifies files that belong to other users
     * and prevents them from being included in the current user's duplicates
     */
    public function testHasAccessRightFiltersByOwner()
    {
        // Create a FileInfo mock for a file owned by another user
        $fileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $fileInfo->method('getPath')->willReturn('/otheruser/files/document.txt');
        $fileInfo->method('getOwner')->willReturn('otheruser');

        // Test that a file owned by another user is not accessible to the current user
        $hasAccess = $this->service->hasAccessRight($fileInfo, 'currentuser');
        $this->assertFalse($hasAccess, 'Files owned by other users should not be accessible');

        // Create a FileInfo mock for a file owned by the current user
        $ownFileInfo = $this->getMockBuilder(FileInfo::class)
            ->disableOriginalConstructor()
            ->addMethods(['getPath', 'getOwner'])
            ->getMock();
        $ownFileInfo->method('getPath')->willReturn('/currentuser/files/document.txt');
        $ownFileInfo->method('getOwner')->willReturn('currentuser');

        // Test that a file owned by the current user is accessible
        $hasAccess = $this->service->hasAccessRight($ownFileInfo, 'currentuser');
        $this->assertTrue($hasAccess, 'Files owned by the current user should be accessible');
    }

    /**
     * Test that scanFiles only includes files that the current user has access to
     */
    public function testScanFilesOnlyIncludesFilesForCurrentUser()
    {
        // Create a mock for the user folder
        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('getPath')->willReturn('/currentuser/files');

        // Configure FolderService to return the user folder
        $this->folderService->expects($this->once())
            ->method('getUserFolder')
            ->with('currentuser')
            ->willReturn($userFolder);

        // Configure ScannerUtil to be called with the correct parameters
        $this->scannerUtil->expects($this->once())
            ->method('setHandles')
            ->with($this->service, null, null);

        $this->scannerUtil->expects($this->once())
            ->method('scan')
            ->with('currentuser', '/currentuser/files');

        // Call scanFiles method
        $this->service->scanFiles('currentuser');

        // We can't directly test that files from other users are excluded,
        // but we can verify that the scan is performed with the correct user context
    }

    public function testCalculateHashesSkipsUniqueSizeFileWithoutHash()
    {
        $fileInfo = new FileInfo('/testuser/files/unique.bin', 'testuser');
        $fileInfo->setId(7);
        $fileInfo->setSize(123456);

        // Nothing to hash and nothing to clear: no node lookup, no write, no event
        $this->folderService->expects($this->never())->method('getNodeByFileInfo');
        $this->mapper->expects($this->never())->method('update');
        $this->eventDispatcher->expects($this->never())->method('dispatchTyped');

        $result = $this->service->calculateHashes($fileInfo, 'testuser', false);

        $this->assertSame($fileInfo, $result);
        $this->assertNull($result->getFileHash());
    }

    public function testCalculateHashesClearsStaleHashOfChangedUniqueSizeFile()
    {
        $fileInfo = new FileInfo('/testuser/files/changed.bin', 'testuser');
        $fileInfo->setId(8);
        $fileInfo->setSize(2048);
        $fileInfo->setFileHash(str_repeat('b', 64));
        $fileInfo->setUpdatedAt(1000);

        $file = $this->createMock(\OCP\Files\File::class);
        $file->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);
        $file->method('getMtime')->willReturn(2000);
        $file->method('getUploadTime')->willReturn(0);
        $file->method('isMounted')->willReturn(false);
        $file->method('getInternalPath')->willReturn('files/changed.bin');
        $file->method('getSize')->willReturn(2048);
        $file->method('getMimetype')->willReturn('application/octet-stream');
        $owner = $this->createMock(\OCP\IUser::class);
        $owner->method('getUID')->willReturn('testuser');
        $file->method('getOwner')->willReturn($owner);

        $this->folderService->method('getNodeByFileInfo')->willReturn($file);
        $this->filterService->method('isIgnored')->willReturn(false);
        $this->mapper->expects($this->once())->method('update')->willReturnArgument(0);
        $this->eventDispatcher->expects($this->once())->method('dispatchTyped');

        $result = $this->service->calculateHashes($fileInfo, 'testuser', false);

        $this->assertNull($result->getFileHash());
        $this->assertGreaterThanOrEqual(2000, $result->getUpdatedAt()->getTimestamp());
    }

    public function testCalculateHashesStillHashesFileWithoutHashWhenRequired()
    {
        $fileInfo = new FileInfo('/testuser/files/pair.bin', 'testuser');
        $fileInfo->setId(9);
        $fileInfo->setSize(4096);

        $storage = $this->createMock(\OCP\Files\Storage\IStorage::class);
        $storage->method('hash')->willReturn(str_repeat('c', 64));
        $file = $this->createMock(\OCP\Files\File::class);
        $file->method('getType')->willReturn(\OCP\Files\FileInfo::TYPE_FILE);
        $file->method('getMtime')->willReturn(1000);
        $file->method('getUploadTime')->willReturn(0);
        $file->method('isMounted')->willReturn(false);
        $file->method('getInternalPath')->willReturn('files/pair.bin');
        $file->method('getStorage')->willReturn($storage);
        $file->method('getSize')->willReturn(4096);
        $file->method('getMimetype')->willReturn('application/octet-stream');
        $owner = $this->createMock(\OCP\IUser::class);
        $owner->method('getUID')->willReturn('testuser');
        $file->method('getOwner')->willReturn($owner);

        $this->folderService->method('getNodeByFileInfo')->willReturn($file);
        $this->filterService->method('isIgnored')->willReturn(false);
        $this->mapper->expects($this->once())->method('update')->willReturnArgument(0);

        $result = $this->service->calculateHashes($fileInfo, 'testuser', true);

        $this->assertSame(str_repeat('c', 64), $result->getFileHash());
    }

    private function indexedFile(array $overrides = []): \OCP\Files\File
    {
        $values = array_merge([
            'mtime' => 1000,
            'uploadTime' => 0,
            'size' => 4096,
            'mimetype' => 'image/jpeg',
            'mounted' => false,
        ], $overrides);
        $file = $this->createMock(\OCP\Files\File::class);
        $file->method('getMtime')->willReturn($values['mtime']);
        $file->method('getUploadTime')->willReturn($values['uploadTime']);
        $file->method('getSize')->willReturn($values['size']);
        $file->method('getMimetype')->willReturn($values['mimetype']);
        $file->method('isMounted')->willReturn($values['mounted']);

        return $file;
    }

    private function hashedRow(): FileInfo
    {
        $fileInfo = new FileInfo('/testuser/files/photo.jpg', 'testuser');
        $fileInfo->setFileHash(str_repeat('d', 64));
        $fileInfo->setSize(4096);
        $fileInfo->setMimetype('image/jpeg');
        $fileInfo->setUpdatedAt(2000);
        $fileInfo->setIgnored(false);

        return $fileInfo;
    }

    public function testIsUpToDateForUnchangedHashedFile()
    {
        $this->filterService->method('isIgnored')->willReturn(false);

        $this->assertTrue($this->service->isUpToDate($this->hashedRow(), $this->indexedFile()));
    }

    /**
     * @dataProvider outdatedFileProvider
     */
    public function testIsUpToDateDetectsChanges(array $fileOverrides, ?string $hash, bool $nowIgnored)
    {
        $this->filterService->method('isIgnored')->willReturn($nowIgnored);
        $fileInfo = $this->hashedRow();
        $fileInfo->setFileHash($hash);

        $this->assertFalse($this->service->isUpToDate($fileInfo, $this->indexedFile($fileOverrides)));
    }

    public static function outdatedFileProvider(): array
    {
        $hash = str_repeat('d', 64);

        return [
            'modified after hashing' => [['mtime' => 3000], $hash, false],
            'uploaded after hashing' => [['uploadTime' => 3000], $hash, false],
            'size changed' => [['size' => 1], $hash, false],
            'type changed' => [['mimetype' => 'image/png'], $hash, false],
            'mount point' => [['mounted' => true], $hash, false],
            'no hash yet' => [[], null, false],
            'ignored since' => [[], $hash, true],
        ];
    }
}
