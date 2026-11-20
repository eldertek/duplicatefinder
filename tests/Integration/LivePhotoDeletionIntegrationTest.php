<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Integration;

use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\FileService;
use OCA\DuplicateFinder\Service\LivePhotoResolver;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\Files\File;
use OCP\Files\Folder;
use OCP\Files\IRootFolder;
use OCP\FilesMetadata\IFilesMetadataManager;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use PHPUnit\Framework\TestCase;

class LivePhotoDeletionIntegrationTest extends TestCase
{
    private IUser $user;
    private Folder $folder;
    private FileService $service;
    private FileInfoService $fileInfoService;
    private IFilesMetadataManager $metadata;
    private array $fileIds = [];

    protected function setUp(): void
    {
        if (!class_exists(\OC::class, false)) {
            $this->markTestSkipped('Run with NEXTCLOUD_PATH pointing to an isolated Nextcloud installation');
        }

        $this->user = \OC::$server->get(IUserManager::class)->createUser('livephoto-test-' . bin2hex(random_bytes(4)), 'local-test-password');
        \OC::$server->get(IUserSession::class)->setUser($this->user);
        \OC_Util::tearDownFS();
        \OC_Util::setupFS($this->user->getUID());
        $this->folder = \OC::$server->get(IRootFolder::class)->getUserFolder($this->user->getUID());
        $this->metadata = \OC::$server->get(IFilesMetadataManager::class);
        $this->fileInfoService = \OC::$server->get(FileInfoService::class);
        \OC::$server->get(OriginFolderService::class)->setUserId($this->user->getUID());
        $this->service = \OC::$server->get(FileService::class);
    }

    protected function tearDown(): void
    {
        if (isset($this->user)) {
            foreach ($this->fileIds as $id) {
                $this->metadata->deleteMetadata($id);
            }
            $this->user->delete();
            \OC::$server->get(IUserSession::class)->setUser(null);
            \OC_Util::tearDownFS();
        }
    }

    /**
     * Create synthetic components and the same public metadata links core uses.
     *
     * @return File[] The still image and motion component
     */
    private function pair(string $directory, string $videoContent = 'motion-a'): array
    {
        $folder = $this->folder->newFolder($directory);
        $image = imagecreatetruecolor(8, 8);
        ob_start();
        imagejpeg($image, null, 80);
        $jpeg = ob_get_clean();
        $still = $folder->newFile('photo.jpg', $jpeg);
        $video = $folder->newFile('photo.mov', pack('N', 20) . 'ftypqt  ' . pack('N', 0) . 'qt  ' . $videoContent);
        $this->assertSame('video/quicktime', $video->getMimetype());
        foreach ([[$still, $video], [$video, $still]] as [$file, $peer]) {
            $this->fileIds[] = $file->getId();
            $metadata = $this->metadata->getMetadata($file->getId(), true);
            $metadata->setString('files-live-photo', (string)$peer->getId());
            $this->metadata->saveMetadata($metadata);
            $info = $this->fileInfoService->save($file->getPath(), $this->user->getUID());
            $this->fileInfoService->calculateHashes($info, $this->user->getUID());
        }

        return [$still, $video];
    }

    /**
     * @dataProvider selectedComponents
     */
    public function testDeletingEitherComponentKeepsAnotherCompletePair(int $selected): void
    {
        $source = $this->pair('redundant');
        $survivor = $this->pair('keep');
        $imageContent = $source[0]->getContent();

        $this->service->deleteFile($this->user->getUID(), '/redundant/' . $source[$selected]->getName(), $source[$selected]->getId(), null, false, true);

        $this->assertFalse($this->folder->nodeExists('redundant/photo.jpg'));
        $this->assertFalse($this->folder->nodeExists('redundant/photo.mov'));
        $remaining = \OC::$server->get(LivePhotoResolver::class)->resolve($survivor[0]);
        $this->assertSame($survivor[1]->getId(), $remaining->video->getId());
        $this->assertSame($imageContent, $survivor[0]->getContent());
    }

    public function selectedComponents(): array
    {
        return ['selected still' => [0], 'selected MOV' => [1]];
    }

    public function testTheLastCompletePairIsProtectedEvenWithLastCopyOptIn(): void
    {
        $source = $this->pair('only-pair');

        try {
            $this->service->deleteFile($this->user->getUID(), '/only-pair/photo.mov', $source[1]->getId(), null, true, true);
            $this->fail('The last complete pair must remain');
        } catch (LivePhotoPairProtectionException $e) {
            $this->assertTrue($this->folder->nodeExists('only-pair/photo.jpg'));
            $this->assertTrue($this->folder->nodeExists('only-pair/photo.mov'));
        }
    }

    public function testDuplicateStillWithDifferentMotionCannotReplaceThePair(): void
    {
        $source = $this->pair('first', 'motion-a');
        $this->pair('different-motion', 'motion-b');

        try {
            $this->service->deleteFile($this->user->getUID(), '/first/photo.jpg', $source[0]->getId());
            $this->fail('A different video is not an identical Live Photo');
        } catch (LivePhotoPairProtectionException $e) {
            $this->assertTrue($this->folder->nodeExists('first/photo.jpg'));
            $this->assertTrue($this->folder->nodeExists('first/photo.mov'));
        }
    }

    public function testTwoLooseComponentsAreNotASurvivingLivePhoto(): void
    {
        $source = $this->pair('first');
        $loose = $this->pair('loose');
        $this->metadata->deleteMetadata($loose[0]->getId());
        $this->metadata->deleteMetadata($loose[1]->getId());

        try {
            $this->service->deleteFile($this->user->getUID(), '/first/photo.mov', $source[1]->getId());
            $this->fail('Unlinked components are not a complete replacement');
        } catch (LivePhotoPairProtectionException $e) {
            $this->assertTrue($this->folder->nodeExists('first/photo.jpg'));
            $this->assertTrue($this->folder->nodeExists('first/photo.mov'));
        }
    }

    public function testProtectedPairCannotBeDeletedButCanPreserveAnotherPair(): void
    {
        $source = $this->pair('delete');
        $this->pair('originals');
        \OC::$server->get(OriginFolderService::class)->create('/originals');

        $this->service->deleteFile($this->user->getUID(), '/delete/photo.mov', $source[1]->getId(), null, false, true);
        $this->assertTrue($this->folder->nodeExists('originals/photo.jpg'));
        $this->assertTrue($this->folder->nodeExists('originals/photo.mov'));

        $this->expectException(OriginFolderProtectionException::class);
        $this->service->deleteFile($this->user->getUID(), '/originals/photo.jpg');
    }

    public function testConcurrentDeletionRequestsPreserveOneCompletePair(): void
    {
        $first = $this->pair('first');
        $second = $this->pair('second');
        $multi = curl_multi_init();
        $handles = [];
        foreach ([$first[1], $second[1]] as $file) {
            $handle = curl_init('http://127.0.0.1/index.php/apps/duplicatefinder/api/files/delete');
            curl_setopt_array($handle, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(['nodeId' => $file->getId(), 'allowLivePhotoPair' => true]),
                CURLOPT_USERPWD => $this->user->getUID() . ':local-test-password',
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'OCS-APIRequest: true'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 30,
            ]);
            curl_multi_add_handle($multi, $handle);
            $handles[] = $handle;
        }
        do {
            curl_multi_exec($multi, $running);
            if ($running) {
                curl_multi_select($multi, 1);
            }
        } while ($running);

        $statuses = [];
        foreach ($handles as $handle) {
            $statuses[] = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
            $this->assertSame('', curl_error($handle));
            curl_multi_remove_handle($multi, $handle);
        }
        curl_multi_close($multi);
        sort($statuses);
        $this->assertSame(200, $statuses[0]);
        $this->assertContains($statuses[1], [409, 423]);

        $complete = 0;
        foreach (['first', 'second'] as $directory) {
            $still = $this->folder->nodeExists($directory . '/photo.jpg');
            $video = $this->folder->nodeExists($directory . '/photo.mov');
            $this->assertSame($still, $video, 'A surviving Live Photo must retain both components');
            $complete += (int)$still;
        }
        $this->assertSame(1, $complete);
    }

    public function testOrdinaryFileDeletionStillWorks(): void
    {
        $file = $this->folder->newFile('ordinary.txt', 'ordinary duplicate content');
        $id = $file->getId();
        $this->fileIds[] = $id;

        $this->assertSame([$id], $this->service->deleteFile($this->user->getUID(), '/ordinary.txt', $id));
        $this->assertFalse($this->folder->nodeExists('ordinary.txt'));
    }
}
