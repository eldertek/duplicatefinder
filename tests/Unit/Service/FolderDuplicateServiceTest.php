<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
use OCP\Files\File;
use OCP\Files\Folder;
use PHPUnit\Framework\TestCase;

class FolderDuplicateServiceTest extends TestCase
{
    /** @var FolderDuplicateService */
    private $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new FolderDuplicateService();
    }

    public function testGroupsIdenticalRecursiveFolderTreesAndPrunesCoveredSubfolders(): void
    {
        $dupA = $this->makeDuplicate('hash-a', [
            ['/alice/files/Archive/2025/sub/report.pdf', 1200],
            ['/alice/files/Backup/2025/sub/report.pdf', 1200],
        ]);
        $dupB = $this->makeDuplicate('hash-b', [
            ['/alice/files/Archive/2025/notes.txt', 300],
            ['/alice/files/Backup/2025/notes.txt', 300],
        ]);

        // /Archive contains 3 files total (1 unique outside /2025), so /Archive/2025 and /Backup/2025 match
        $groups = $this->service->findFromFileDuplicates([$dupA, $dupB], 2, 0, [
            '/Archive' => 3,
        ]);

        $this->assertCount(1, $groups);
        $this->assertSame(['/Archive/2025', '/Backup/2025'], $groups[0]['folders']);
        $this->assertSame(2, $groups[0]['fileCount']);
        $this->assertSame(1500, $groups[0]['totalSize']);
        $this->assertSame(1500, $groups[0]['reclaimableSize']);

        $summary = $this->service->summarizeReport($groups);
        $this->assertSame([
            'groupCount' => 1,
            'duplicateFolderCount' => 2,
            'reclaimableSize' => 1500,
        ], $summary);
    }

    public function testKeepsIndependentSubfolderDuplicateGroupOutsideParentPair(): void
    {
        $dup = $this->makeDuplicate('hash-x', [
            ['/alice/files/Archive/2025/sub/doc.pdf', 500],
            ['/alice/files/Backup/2025/sub/doc.pdf', 500],
            ['/alice/files/SharedCopy/mirror/doc.pdf', 500],
        ]);
        $dupExtra = $this->makeDuplicate('hash-y', [
            ['/alice/files/Archive/2025/notes.txt', 200],
            ['/alice/files/Backup/2025/notes.txt', 200],
        ]);

        $groups = $this->service->findFromFileDuplicates([$dup, $dupExtra], 1, 0, [
            '/Archive' => 3,
            '/Backup' => 3,
            '/SharedCopy' => 2,
        ]);

        $pathsPerGroup = array_map(function ($g) {
            return $g['folders'];
        }, $groups);

        $this->assertContains(['/Archive/2025', '/Backup/2025'], $pathsPerGroup);
        $this->assertContains(['/Archive/2025/sub', '/Backup/2025/sub', '/SharedCopy/mirror'], $pathsPerGroup);
    }

    public function testExcludesFoldersContainingExtraUniqueFilesWhenCountsProvided(): void
    {
        $dup = $this->makeDuplicate('hash-c', [
            ['/alice/files/FolderA/same.txt', 400],
            ['/alice/files/FolderB/same.txt', 400],
        ]);

        // FolderA actually contains 2 files total (1 unique file not in duplicate set), so it is not an exact duplicate
        $groups = $this->service->findFromFileDuplicates([$dup], 1, 0, [
            '/FolderA' => 2,
            '/FolderB' => 1,
        ]);

        $this->assertSame([], $groups);
    }

    public function testAppliesMinFilesAndMinSizeFilters(): void
    {
        $dup1 = $this->makeDuplicate('h1', [
            ['/bob/files/Dir1/a.bin', 100],
            ['/bob/files/Dir2/a.bin', 100],
        ]);
        $dup2 = $this->makeDuplicate('h2', [
            ['/bob/files/Big1/x.bin', 1000],
            ['/bob/files/Big2/x.bin', 1000],
        ]);
        $dup3 = $this->makeDuplicate('h3', [
            ['/bob/files/Big1/y.bin', 2000],
            ['/bob/files/Big2/y.bin', 2000],
        ]);

        $groups = $this->service->findFromFileDuplicates([$dup1, $dup2, $dup3], 2, 2500);

        $this->assertCount(1, $groups);
        $this->assertSame(['/Big1', '/Big2'], $groups[0]['folders']);
        $this->assertSame(3000, $groups[0]['reclaimableSize']);
    }

    /**
     * @param array<int, array{0: string, 1: int}> $entries
     */
    private function makeDuplicate(string $hash, array $entries): FileDuplicate
    {
        $duplicate = new FileDuplicate($hash);

        $files = [];
        foreach ($entries as [$path, $size]) {
            $file = new FileInfo();
            $file->setPath($path);
            $file->setSize($size);
            $files[] = $file;
        }

        $duplicate->setFiles($files);

        return $duplicate;
    }

    public function testFindFolderDuplicatesReportExcludesExtraLiveFilesAndMarksOriginFolders(): void
    {
        $dupA = $this->makeDuplicate('hash-photo', [
            ['/alice/files/Archive/2025/IMG_1.HEIC', 2000],
            ['/alice/files/Backup/2025/IMG_1.HEIC', 2000],
            ['/alice/files/Extra/2025/IMG_1.HEIC', 2000],
        ]);
        foreach ($dupA->getFiles() as $index => $file) {
            $file->setNodeId(100 + $index);
            $file->setMimetype('image/heic');
        }

        $makeFolderMock = function (int $fileCount): Folder {
            $folder = $this->createMock(Folder::class);
            $nodes = [];
            for ($i = 0; $i < $fileCount; $i++) {
                $nodes[] = $this->createMock(File::class);
            }
            $folder->method('getDirectoryListing')->willReturn($nodes);

            return $folder;
        };

        $userFolder = $this->createMock(Folder::class);
        $userFolder->method('get')->willReturnCallback(function (string $path) use ($makeFolderMock) {
            // /Extra/2025 has 2 live files (1 non-duplicate extra file), so it is not 100% identical
            if ($path === '/Extra/2025') {
                return $makeFolderMock(2);
            }
            if ($path === '/Archive/2025' || $path === '/Backup/2025') {
                return $makeFolderMock(1);
            }

            return $makeFolderMock(5);
        });

        $report = $this->service->findFolderDuplicatesReport(
            [$dupA],
            1,
            0,
            $userFolder,
            static function (string $path): bool {
                return $path === '/Archive' || strpos($path, '/Archive/') === 0;
            }
        );

        $this->assertCount(1, $report['groups']);
        $group = $report['groups'][0];
        $this->assertSame(['/Archive/2025', '/Backup/2025'], $group['folders']);
        $this->assertTrue($group['hasProtectedFolder']);
        $this->assertCount(2, $group['folderDetails']);

        $archiveDetail = $group['folderDetails'][0];
        $backupDetail = $group['folderDetails'][1];
        $this->assertSame('/Archive/2025', $archiveDetail['path']);
        $this->assertTrue($archiveDetail['isProtected']);
        $this->assertSame(1, $archiveDetail['protectedFileCount']);
        $this->assertSame(0, $archiveDetail['deletableFileCount']);

        $this->assertSame('/Backup/2025', $backupDetail['path']);
        $this->assertFalse($backupDetail['isProtected']);
        $this->assertSame(0, $backupDetail['protectedFileCount']);
        $this->assertSame(1, $backupDetail['deletableFileCount']);
        $this->assertSame('/alice/files/Backup/2025/IMG_1.HEIC', $backupDetail['files'][0]['path']);
        $this->assertSame(101, $backupDetail['files'][0]['nodeId']);
        $this->assertSame('hash-photo', $backupDetail['files'][0]['fileHash']);
    }

    public function testFindFolderDuplicatesReportCapsReclaimableSizeWhenFoldersAreProtected(): void
    {
        $dupAllProtected = $this->makeDuplicate('hash-prot', [
            ['/alice/files/OriginA/doc.pdf', 1500],
            ['/alice/files/OriginB/doc.pdf', 1500],
        ]);
        $dupTriple = $this->makeDuplicate('hash-triple', [
            ['/alice/files/OriginA/sub/img.jpg', 2000],
            ['/alice/files/OriginB/sub/img.jpg', 2000],
            ['/alice/files/Scratch/sub/img.jpg', 2000],
        ]);

        $report = $this->service->findFolderDuplicatesReport(
            [$dupAllProtected, $dupTriple],
            1,
            0,
            null,
            static function (string $path): bool {
                return strpos($path, '/Origin') === 0;
            }
        );

        $byFolders = [];
        foreach ($report['groups'] as $group) {
            $byFolders[implode('|', $group['folders'])] = $group;
        }

        $this->assertSame(0, $byFolders['/OriginA|/OriginB']['reclaimableSize']);
        $this->assertSame(2000, $byFolders['/OriginA/sub|/OriginB/sub|/Scratch/sub']['reclaimableSize']);
        $this->assertSame(2000, $report['summary']['reclaimableSize']);
    }
}
