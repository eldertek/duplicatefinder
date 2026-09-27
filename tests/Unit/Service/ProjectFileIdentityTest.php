<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Db\ProjectMapper;
use OCA\DuplicateFinder\Service\ProjectService;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class ProjectFileIdentityTest extends TestCase
{
    public function testProjectResultsPreservePersistedFileIdentities(): void
    {
        $projectMapper = $this->createMock(ProjectMapper::class);
        $duplicateMapper = $this->createMock(FileDuplicateMapper::class);
        $group = new FileDuplicate(str_repeat('a', 64));
        $group->setId(7);
        $projectMapper->expects($this->once())->method('getDuplicateIds')
            ->with(4)->willReturn([7]);
        $duplicateMapper->expects($this->once())->method('countByIds')
            ->with([7], 'all')->willReturn(1);
        $duplicateMapper->expects($this->once())->method('findByIds')
            ->with([7], 'all', 10, 0)->willReturn([$group]);
        $paths = ['/test-user/files/project/keep.bin', '/test-user/files/project/b.bin', '/test-user/files/project/c.bin'];
        $duplicateMapper->expects($this->once())->method('findFilesByHash')
            ->with($group->getHash(), 'test-user')->willReturn([
                ['id' => 101, 'path' => $paths[0], 'size' => 10, 'updated_at' => 1],
                ['id' => '102', 'path' => $paths[1], 'size' => 10, 'updated_at' => 1],
                ['id' => 103, 'path' => $paths[2], 'size' => 10, 'updated_at' => 1],
            ]);
        // Exercise the real method without loading core-only filesystem hooks.
        // This result-mapping path never uses filesystem or scan dependencies.
        $reflection = new \ReflectionClass(ProjectService::class);
        $service = $reflection->newInstanceWithoutConstructor();
        foreach ([
            'mapper' => $projectMapper,
            'duplicateMapper' => $duplicateMapper,
            'userId' => 'test-user',
            'logger' => $this->createMock(LoggerInterface::class),
        ] as $name => $value) {
            $property = $reflection->getProperty($name);
            $property->setAccessible(true);
            $property->setValue($service, $value);
        }
        $result = $service->getDuplicates(4, 'all', 1, 10);
        $this->assertCount(1, $result['entities']);
        $files = $result['entities'][0]->getFiles();
        $this->assertCount(3, $files);
        $wireFiles = array_map(static fn ($file) => $file->jsonSerialize(), $files);
        $this->assertSame([101, 102, 103], array_column($wireFiles, 'id'));
        $this->assertSame($paths, array_column($wireFiles, 'path'));
    }
}
