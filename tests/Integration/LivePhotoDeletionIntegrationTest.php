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
use OCP\IConfig;
use OCP\IDBConnection;
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
        $this->user->updateLastLoginTimestamp();
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
        $remaining = \OC::$server->get(LivePhotoResolver::class)->resolve($survivor[0], $this->folder);
        $this->assertSame($survivor[1]->getId(), $remaining->video->getId());
        $this->assertSame($imageContent, $survivor[0]->getContent());
    }

    public function selectedComponents(): array
    {
        return ['selected still' => [0], 'selected MOV' => [1]];
    }

    public function testStalePeerLinkDoesNotBlockDeletingADuplicateStill(): void
    {
        $source = $this->pair('orphan');
        $survivor = $this->pair('keep');
        $this->removeMotionComponent($source);
        $hash = $this->fileInfoService->getContentHash($source[0]);

        $status = \OC::$server->get(\OCA\DuplicateFinder\Service\LivePhotoStatusService::class);
        $sourceInfo = $this->fileInfoService->find($source[0]->getPath(), $this->user->getUID(), true);
        $survivorInfo = $this->fileInfoService->find($survivor[0]->getPath(), $this->user->getUID(), true);
        $status->markMissingVideos([$sourceInfo, $survivorInfo], $this->user->getUID());
        $this->assertTrue($sourceInfo->getIsLivePhotoVideoMissing());
        $this->assertFalse($survivorInfo->getIsLivePhotoVideoMissing());

        $group = new \OCA\DuplicateFinder\Db\FileDuplicate($hash);
        $group->setFiles([$this->fileInfoService->find($source[0]->getPath(), $this->user->getUID(), true)]);
        $groups = \OC::$server->get(\OCA\DuplicateFinder\Service\FileDuplicateService::class);
        $groups->setCurrentUserId($this->user->getUID());
        $enriched = $groups->enrich($group)->getFiles()[0];
        $this->assertTrue($enriched->jsonSerialize()['isLivePhotoVideoMissing']);

        $deleted = $this->service->deleteFile($this->user->getUID(), '/orphan/photo.jpg', $source[0]->getId(), $hash);

        $this->assertCount(1, $deleted);
        $this->assertFalse($this->folder->nodeExists('orphan/photo.jpg'));
        $remaining = \OC::$server->get(LivePhotoResolver::class)->resolve($survivor[0], $this->folder);
        $this->assertSame($survivor[1]->getId(), $remaining->video->getId());
    }

    public function testStalePeerLinkRetainsLastCopyProtection(): void
    {
        $source = $this->pair('orphan');
        $this->removeMotionComponent($source);
        $hash = $this->fileInfoService->getContentHash($source[0]);

        $this->expectException(\OCA\DuplicateFinder\Exception\LastCopyProtectionException::class);
        $this->service->deleteFile($this->user->getUID(), '/orphan/photo.jpg', $source[0]->getId(), $hash);
    }

    /**
     * Reproduce an old Live Photo link after its motion component disappeared.
     *
     * @param File[] $pair Synthetic components owned by this test user
     */
    private function removeMotionComponent(array $pair): void
    {
        $peerId = $pair[1]->getId();
        foreach ($pair as $file) {
            $this->metadata->deleteMetadata($file->getId());
        }
        $pair[1]->delete();
        $metadata = $this->metadata->getMetadata($pair[0]->getId(), true);
        $metadata->setString('files-live-photo', (string)$peerId);
        $this->metadata->saveMetadata($metadata);
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

    /**
     * @dataProvider selectedComponents
     */
    public function testConfirmationRetryReleasesTheDatabasePairMutex(int $selected): void
    {
        // PHPUnit uses an in-memory locking provider; the HTTP requests use this config.
        if (\OC::$server->get(IConfig::class)->getSystemValueString('memcache.locking', '') !== '') {
            $this->markTestSkipped('Run without memcache.locking to exercise the database locking provider');
        }

        $motion = 'db-lock-' . $this->user->getUID();
        $source = $this->pair('redundant', $motion);
        $survivor = $this->pair('keep', $motion);
        $sourceIds = [$source[0]->getId(), $source[1]->getId()];
        $key = 'df-lp/' . substr(hash('sha256', $this->fileInfoService->getContentHash($source[0]) . ':' . $this->fileInfoService->getContentHash($source[1])), 0, 48);

        [$status, $body] = $this->requestDeletion($sourceIds[$selected], false);
        $this->assertSame(409, $status);
        $this->assertSame('LIVE_PHOTO_CONFIRMATION_REQUIRED', $body['error']);
        $this->assertTrue($this->folder->nodeExists('redundant/photo.jpg'));
        $this->assertTrue($this->folder->nodeExists('redundant/photo.mov'));

        $firstLock = $this->readPairMutex($key);
        $this->assertSame($key, $firstLock['key']);
        $this->assertLessThanOrEqual(64, strlen($firstLock['key']));
        $this->assertSame(0, (int)$firstLock['lock']);

        // Let the database TTL advance so both HTTP requests prove they acquired this mutex.
        usleep(1100000);
        [$status, $body] = $this->requestDeletion($sourceIds[$selected], true);
        $this->assertSame(200, $status);
        $this->assertSame($sourceIds, $body['deletedNodeIds']);
        $this->assertFalse($this->folder->nodeExists('redundant/photo.jpg'));
        $this->assertFalse($this->folder->nodeExists('redundant/photo.mov'));
        $remaining = \OC::$server->get(LivePhotoResolver::class)->resolve($survivor[0], $this->folder);
        $this->assertSame($survivor[1]->getId(), $remaining->video->getId());

        $confirmedLock = $this->readPairMutex($key);
        $this->assertSame(0, (int)$confirmedLock['lock']);
        $this->assertGreaterThan((int)$firstLock['ttl'], (int)$confirmedLock['ttl']);
    }

    /**
     * Make each confirmation step a separate authenticated HTTP request.
     *
     * @return array{int, array} The response status and decoded JSON body
     */
    private function requestDeletion(int $nodeId, bool $confirmed): array
    {
        $handle = curl_init('http://127.0.0.1/index.php/apps/duplicatefinder/api/files/delete');
        curl_setopt_array($handle, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode(['nodeId' => $nodeId, 'allowLivePhotoPair' => $confirmed]),
            CURLOPT_USERPWD => $this->user->getUID() . ':local-test-password',
            CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'OCS-APIRequest: true'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
        ]);
        $response = curl_exec($handle);
        $this->assertSame('', curl_error($handle));

        return [curl_getinfo($handle, CURLINFO_RESPONSE_CODE), json_decode($response, true, 512, JSON_THROW_ON_ERROR)];
    }

    /**
     * Inspect only the unique test pair's mutex row, without changing live lock state.
     *
     * @return array The persisted key, lock count and expiry after an HTTP request
     */
    private function readPairMutex(string $key): array
    {
        $query = \OC::$server->get(IDBConnection::class)->getQueryBuilder();
        $query->select('key', 'lock', 'ttl')->from('file_locks')
            ->where($query->expr()->eq('key', $query->createNamedParameter($key)));
        $result = $query->executeQuery();
        $row = $result->fetchAssociative();
        $result->closeCursor();
        $this->assertIsArray($row, 'The HTTP request must use DBLockingProvider and persist its mutex');

        return $row;
    }
}
