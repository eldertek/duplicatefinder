<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCA\DuplicateFinder\Service\FileInfoRepairer;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;

/**
 * Issue 182: the repair of the file info table must not hold the upgrade of the server nor load the table in
 * memory. The repairer walks the table by windows of ids, gives the work a time budget, remembers where a pass
 * stopped and, once a pass has reached the end of the table, never looks at the table again.
 */
class FileInfoRepairerTest extends TestCase
{
    private $mapper;
    private $config;
    private $values;
    private $repairer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->values = [];
        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->config = $this->createMock(IConfig::class);
        $this->config->method('getAppValue')->willReturnCallback(function ($app, $key, $default = '') {
            return $this->values[$key] ?? $default;
        });
        $this->config->method('setAppValue')->willReturnCallback(function ($app, $key, $value) {
            $this->values[$key] = $value;
        });
        $this->config->method('deleteAppValue')->willReturnCallback(function ($app, $key) {
            unset($this->values[$key]);
        });
        $this->repairer = new FileInfoRepairer($this->mapper, $this->config);
    }

    public function testAPassThatReachesTheEndOfTheTableIsDoneAndRemembered(): void
    {
        $this->mapper->expects($this->once())->method('getMaxId')->willReturn(12000);
        $this->mapper->expects($this->exactly(3))
            ->method('repairPathHashes')
            ->withConsecutive([0, 5000], [5000, 10000], [10000, 12000])
            ->willReturnOnConsecutiveCalls(2, 0, 1);
        $this->mapper->expects($this->exactly(3))
            ->method('removeSurplusRows')
            ->withConsecutive([0, 5000], [5000, 10000], [10000, 12000])
            ->willReturnOnConsecutiveCalls(10, 0, 4);

        $this->assertSame(['pathHashes' => 3, 'removed' => 14, 'done' => true], $this->repairer->run(60.0, 5000));
        $this->assertSame('1', $this->values['repair_file_infos_done']);
        $this->assertArrayNotHasKey('repair_file_infos_cursor', $this->values);

        // from then on the table is not looked at again: getMaxId() and the repairs were expected once above
        $this->assertSame(['pathHashes' => 0, 'removed' => 0, 'done' => true], $this->repairer->run(60.0, 5000));
    }

    public function testTheSurplusRowsOfAWindowAreRemovedAfterItsPathHashesAreFixed(): void
    {
        // a row without a path hash that is a copy of an older row only turns up as a surplus row once it has its hash
        $calls = [];
        $this->mapper->method('getMaxId')->willReturn(9000);
        $this->mapper->method('repairPathHashes')->willReturnCallback(function (int $after, int $until) use (&$calls) {
            $calls[] = "hashes $after-$until";

            return 0;
        });
        $this->mapper->method('removeSurplusRows')->willReturnCallback(function (int $after, int $until) use (&$calls) {
            $calls[] = "surplus $after-$until";

            return 0;
        });

        $this->repairer->run(60.0, 5000);

        $this->assertSame(['hashes 0-5000', 'surplus 0-5000', 'hashes 5000-9000', 'surplus 5000-9000'], $calls);
    }

    public function testAPassCutByTheTimeBudgetKeepsItsPlaceForTheNextCall(): void
    {
        $this->mapper->method('getMaxId')->willReturn(12000);
        // a budget of zero lets the first window through: the time is checked once a window is done
        $this->mapper->expects($this->exactly(3))
            ->method('repairPathHashes')
            ->withConsecutive([0, 5000], [5000, 10000], [10000, 12000])
            ->willReturn(0);
        $this->mapper->expects($this->exactly(3))
            ->method('removeSurplusRows')
            ->withConsecutive([0, 5000], [5000, 10000], [10000, 12000])
            ->willReturnOnConsecutiveCalls(7, 5, 3);

        $this->assertSame(['pathHashes' => 0, 'removed' => 7, 'done' => false], $this->repairer->run(0.0, 5000));
        $this->assertSame('5000', $this->values['repair_file_infos_cursor']);
        $this->assertArrayNotHasKey('repair_file_infos_done', $this->values);

        // the next call goes on from where the first one stopped, not from the start of the table
        $this->assertSame(['pathHashes' => 0, 'removed' => 5, 'done' => false], $this->repairer->run(0.0, 5000));
        $this->assertSame('10000', $this->values['repair_file_infos_cursor']);

        $this->assertSame(['pathHashes' => 0, 'removed' => 3, 'done' => true], $this->repairer->run(0.0, 5000));
        $this->assertSame('1', $this->values['repair_file_infos_done']);
        $this->assertArrayNotHasKey('repair_file_infos_cursor', $this->values);
    }

    public function testAnEmptyTableIsDoneWithoutLookingAtAnyRow(): void
    {
        $this->mapper->method('getMaxId')->willReturn(0);
        $this->mapper->expects($this->never())->method('repairPathHashes');
        $this->mapper->expects($this->never())->method('removeSurplusRows');

        $this->assertSame(['pathHashes' => 0, 'removed' => 0, 'done' => true], $this->repairer->run());
        $this->assertSame('1', $this->values['repair_file_infos_done']);
    }

    public function testACleanTableCostsOnePassOnlyOnce(): void
    {
        $this->mapper->expects($this->once())->method('getMaxId')->willReturn(800);
        $this->mapper->expects($this->once())->method('repairPathHashes')->with(0, 800)->willReturn(0);
        $this->mapper->expects($this->once())->method('removeSurplusRows')->with(0, 800)->willReturn(0);

        $this->repairer->run();
        $this->repairer->run();
        $this->repairer->run();
    }

    public function testAFailureKeepsWhatWasDoneAndLetsTheErrorThrough(): void
    {
        $this->mapper->method('getMaxId')->willReturn(12000);
        $this->mapper->method('repairPathHashes')->willReturnCallback(function (int $after) {
            if ($after === 5000) {
                throw new \RuntimeException('deadlock');
            }

            return 0;
        });
        $this->mapper->method('removeSurplusRows')->willReturn(0);

        try {
            $this->repairer->run(60.0, 5000);
            $this->fail('the failure of a window is not hidden from the caller');
        } catch (\RuntimeException $e) {
            $this->assertSame('deadlock', $e->getMessage());
        }

        // the first window is done: the next call starts after it, and the pass is not declared done
        $this->assertSame('5000', $this->values['repair_file_infos_cursor']);
        $this->assertArrayNotHasKey('repair_file_infos_done', $this->values);
    }

    public function testAPassWhoseCursorIsBeyondTheLastIdIsOver(): void
    {
        // the table has shrunk since the pass started: nothing is left to look at
        $this->values['repair_file_infos_cursor'] = '20000';
        $this->mapper->method('getMaxId')->willReturn(15000);
        $this->mapper->expects($this->never())->method('repairPathHashes');

        $this->assertSame(['pathHashes' => 0, 'removed' => 0, 'done' => true], $this->repairer->run());
        $this->assertSame('1', $this->values['repair_file_infos_done']);
    }
}
