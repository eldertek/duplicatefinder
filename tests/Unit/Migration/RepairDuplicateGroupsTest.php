<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Migration\RepairDuplicateGroups;
use OCA\DuplicateFinder\Service\SurplusRowsMerger;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Issue 182: the first version of this step loaded every group in memory and deleted the surplus rows one group
 * at a time, so the upgrade of a server with hundreds of thousands of groups ran for many minutes or was killed.
 * The work now goes through SurplusRowsMerger within a time budget.
 */
class RepairDuplicateGroupsTest extends TestCase
{
    private $merger;
    private $logger;
    private $output;
    private $repair;

    protected function setUp(): void
    {
        parent::setUp();

        $this->merger = $this->createMock(SurplusRowsMerger::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->output = $this->createMock(IOutput::class);
        $this->repair = new RepairDuplicateGroups($this->merger, $this->logger);
    }

    public function testRunWithinATimeBudgetAndSaysNothingWhenThereIsNothingToMerge(): void
    {
        $this->merger->expects($this->once())
            ->method('run')
            ->with($this->callback(function ($budget) {
                // a repair step must not hold the upgrade of the server for long
                return is_float($budget) && $budget > 0 && $budget <= 30;
            }))
            ->willReturn(['removed' => 0, 'done' => true]);
        $this->output->expects($this->never())->method('info');
        $this->logger->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }

    public function testRunReportsTheRowsItRemoved(): void
    {
        $this->merger->method('run')->willReturn(['removed' => 400000, 'done' => true]);
        $this->output->expects($this->once())
            ->method('info')
            ->with($this->stringContains('Removed 400000 surplus duplicate group rows'));

        $this->repair->run($this->output);
    }

    public function testRunLeavesWhatIsLeftToTheBackgroundJob(): void
    {
        $this->merger->method('run')->willReturn(['removed' => 350000, 'done' => false]);
        $messages = [];
        $this->output->method('info')->willReturnCallback(function ($message) use (&$messages) {
            $messages[] = $message;
        });

        $this->repair->run($this->output);

        $this->assertCount(2, $messages);
        $this->assertStringContainsString('Removed 350000', $messages[0]);
        $this->assertStringContainsString('background job', $messages[1]);
    }

    public function testRunHasANameTheUpgradeCanShow(): void
    {
        $this->assertStringContainsString('duplicatefinder', $this->repair->getName());
    }
}
