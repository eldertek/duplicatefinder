<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\SurplusRowsMerger;
use OCP\IConfig;
use PHPUnit\Framework\TestCase;

/**
 * Issue 182: removing the surplus rows of the duplicate groups must not hold the upgrade of the server. The merger
 * gives the work a time budget, remembers where a pass stopped and, once a pass has reached the end of the table,
 * never looks at the table again.
 */
class SurplusRowsMergerTest extends TestCase
{
    private $mapper;
    private $config;
    private $values;
    private $merger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->values = [];
        $this->mapper = $this->createMock(FileDuplicateMapper::class);
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
        $this->merger = new SurplusRowsMerger($this->mapper, $this->config);
    }

    public function testAPassThatReachesTheEndOfTheTableIsDoneAndRemembered(): void
    {
        $this->mapper->expects($this->once())
            ->method('mergeSurplusRows')
            ->with(20.0, 0)
            ->willReturn(['removed' => 400000, 'lastId' => 600000, 'finished' => true]);

        $this->assertSame(['removed' => 400000, 'done' => true], $this->merger->run(20.0));
        $this->assertSame('1', $this->values['merge_surplus_done']);
        $this->assertArrayNotHasKey('merge_surplus_cursor', $this->values);

        // from then on the table is not looked at again
        $this->assertSame(['removed' => 0, 'done' => true], $this->merger->run(20.0));
    }

    public function testAPassCutByTheTimeBudgetKeepsItsPlaceForTheNextCall(): void
    {
        $this->mapper->expects($this->exactly(2))
            ->method('mergeSurplusRows')
            ->withConsecutive([20.0, 0], [20.0, 250000])
            ->willReturnOnConsecutiveCalls(
                ['removed' => 150000, 'lastId' => 250000, 'finished' => false],
                ['removed' => 250000, 'lastId' => 600000, 'finished' => true]
            );

        $this->assertSame(['removed' => 150000, 'done' => false], $this->merger->run(20.0));
        $this->assertSame('250000', $this->values['merge_surplus_cursor']);
        $this->assertArrayNotHasKey('merge_surplus_done', $this->values);

        // the next call goes on from where the first one stopped, not from the start of the table
        $this->assertSame(['removed' => 250000, 'done' => true], $this->merger->run(20.0));
        $this->assertSame('1', $this->values['merge_surplus_done']);
        $this->assertArrayNotHasKey('merge_surplus_cursor', $this->values);
    }

    public function testACleanTableCostsOnePassOnlyOnce(): void
    {
        $this->mapper->expects($this->once())
            ->method('mergeSurplusRows')
            ->willReturn(['removed' => 0, 'lastId' => 0, 'finished' => true]);

        $this->merger->run();
        $this->merger->run();
        $this->merger->run();
    }
}
