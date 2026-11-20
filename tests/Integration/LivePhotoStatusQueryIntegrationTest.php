<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Tests\Integration;

use Doctrine\DBAL\Logging\DebugStack;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\LivePhotoStatusService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\Files\IRootFolder;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\IUserSession;
use OCP\Lock\ILockingProvider;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class LivePhotoStatusQueryIntegrationTest extends TestCase
{
    /**
     * Measure status enrichment against real metadata and file-cache tables.
     *
     * Ordinary images must need one batched metadata read, without per-file lookups.
     */
    public function testFiftyOrdinaryImagesUseOneMetadataRead(): void
    {
        if (!class_exists(\OC::class, false)) {
            $this->markTestSkipped('Run with NEXTCLOUD_PATH pointing to an isolated Nextcloud installation');
        }

        $user = \OC::$server->get(IUserManager::class)->createUser('status-query-' . bin2hex(random_bytes(4)), 'local-test-password');
        $user->updateLastLoginTimestamp();
        \OC::$server->get(IUserSession::class)->setUser($user);
        \OC_Util::tearDownFS();
        \OC_Util::setupFS($user->getUID());
        $connection = \OC::$server->get(IDBConnection::class);
        $configuration = $connection->getInner()->getConfiguration();
        $previousLogger = $configuration->getSQLLogger();

        try {
            $folder = \OC::$server->get(IRootFolder::class)->getUserFolder($user->getUID());
            $files = [];
            $image = imagecreatetruecolor(8, 8);
            ob_start();
            imagejpeg($image, null, 80);
            $jpeg = ob_get_clean();
            for ($index = 0; $index < 50; $index++) {
                $node = $folder->newFile('ordinary-' . $index . '.jpg', $jpeg);
                $info = new FileInfo($node->getPath(), $user->getUID());
                $info->setNodeId($node->getId());
                $info->setMimetype($node->getMimetype());
                $files[] = $info;
            }

            $origin = $this->createMock(OriginFolderService::class);
            $origin->method('isPathProtected')->willReturn(['isProtected' => false, 'protectingFolder' => null]);
            $service = new FileDuplicateService(
                $this->createMock(LoggerInterface::class),
                $this->createMock(FileDuplicateMapper::class),
                \OC::$server->get(FileInfoService::class),
                $origin,
                \OC::$server->get(ILockingProvider::class),
                \OC::$server->get(LivePhotoStatusService::class)
            );
            $service->setCurrentUserId($user->getUID());
            $group = new FileDuplicate('ordinary-images');
            $group->setFiles($files);
            $queries = new DebugStack();
            $configuration->setSQLLogger($queries);
            $result = $service->enrich($group);
            $configuration->setSQLLogger($previousLogger);

            $selects = array_filter($queries->queries, static fn (array $query): bool => preg_match('/^\s*SELECT\b/i', $query['sql']) === 1);
            fwrite(STDERR, 'Live Photo status: 50 images, ' . count($selects) . " SELECT queries\n");
            $this->assertCount(50, $result->getFiles());
            foreach ($result->getFiles() as $file) {
                $this->assertFalse($file->getIsLivePhotoVideoMissing());
            }
            $this->assertCount(1, $selects, 'Ordinary images must not trigger per-image file or metadata reads');
        } finally {
            $configuration->setSQLLogger($previousLogger);
            $user->delete();
            \OC::$server->get(IUserSession::class)->setUser(null);
            \OC_Util::tearDownFS();
        }
    }
}
