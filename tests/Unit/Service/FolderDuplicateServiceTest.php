<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FolderDuplicateService;
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
}
