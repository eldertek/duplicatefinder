<?php

namespace OCA\DuplicateFinder\Tests\Unit\Migration;

use OCA\DuplicateFinder\Migration\RepairFileInfos;
use OCA\DuplicateFinder\Service\ConfigService;
use OCA\DuplicateFinder\Service\FileInfoRepairer;
use OCP\Migration\IOutput;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

/**
 * Issue 182: up to 1.8.4 this step loaded every row of the file info table in memory (about 2.5 KB per row), so on a
 * server that had scanned a million files or more `occ app:enable duplicatefinder` and `occ upgrade` were killed. The
 * work now goes through FileInfoRepairer, a window of ids at a time, within a time budget.
 */
class RepairFileInfosTest extends TestCase
{
    private $repair;
    private $config;
    private $repairer;
    private $logger;
    private $output;

    protected function setUp(): void
    {
        parent::setUp();

        $this->config = $this->createMock(ConfigService::class);
        $this->repairer = $this->createMock(FileInfoRepairer::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->output = $this->createMock(IOutput::class);

        $this->repair = new RepairFileInfos($this->config, $this->repairer, $this->logger);
    }

    public function testShouldRunReturnsFalseForOldVersion()
    {
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.0.8');

        $this->assertFalse($this->invokePrivateMethod($this->repair, 'shouldRun'));
    }

    public function testShouldRunReturnsTrueForNewerVersion()
    {
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.1.0');

        $this->assertTrue($this->invokePrivateMethod($this->repair, 'shouldRun'));
    }

    public function testShouldRunReturnsTrueFromTheVersionsOfTheCurrentBranch()
    {
        // what a real installation is updated from: the step must not be skipped
        $this->config->method('getInstalledVersion')->willReturn('1.8.1');

        $this->assertTrue($this->invokePrivateMethod($this->repair, 'shouldRun'));
    }

    public function testRunDoesNothingIfShouldRunReturnsFalse()
    {
        $this->config->expects($this->once())
            ->method('getInstalledVersion')
            ->willReturn('0.0.8');
        $this->repairer->expects($this->never())->method('run');
        $this->output->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }

    public function testRunWithinATimeBudgetAndSaysNothingWhenThereIsNothingToRepair()
    {
        $this->config->method('getInstalledVersion')->willReturn('1.8.1');
        $this->repairer->expects($this->once())
            ->method('run')
            ->with($this->callback(function ($budget) {
                // a repair step must not hold the upgrade of the server for long
                return is_float($budget) && $budget > 0 && $budget <= 30;
            }))
            ->willReturn(['pathHashes' => 0, 'removed' => 0, 'done' => true]);
        $this->output->expects($this->never())->method('info');
        $this->logger->expects($this->never())->method('info');

        $this->repair->run($this->output);
    }

    public function testRunReportsWhatItRepaired()
    {
        $this->config->method('getInstalledVersion')->willReturn('1.8.1');
        $this->repairer->method('run')->willReturn(['pathHashes' => 12, 'removed' => 34000, 'done' => true]);
        $messages = [];
        $this->output->method('info')->willReturnCallback(function ($message) use (&$messages) {
            $messages[] = $message;
        });

        $this->repair->run($this->output);

        $this->assertCount(2, $messages);
        $this->assertStringContainsString('Recalculated 12 path hashes', $messages[0]);
        $this->assertStringContainsString('Removed 34000 surplus file info rows', $messages[1]);
    }

    public function testRunLeavesWhatIsLeftToTheBackgroundJob()
    {
        $this->config->method('getInstalledVersion')->willReturn('1.8.1');
        $this->repairer->method('run')->willReturn(['pathHashes' => 0, 'removed' => 9000, 'done' => false]);
        $messages = [];
        $this->output->method('info')->willReturnCallback(function ($message) use (&$messages) {
            $messages[] = $message;
        });

        $this->repair->run($this->output);

        $this->assertCount(2, $messages);
        $this->assertStringContainsString('Removed 9000', $messages[0]);
        $this->assertStringContainsString('background job', $messages[1]);
    }

    public function testRunHasANameTheUpgradeCanShow()
    {
        $this->assertStringContainsString('duplicatefinder', $this->repair->getName());
    }

    /**
     * Méthode utilitaire pour invoquer une méthode privée
     */
    private function invokePrivateMethod($object, $methodName, array $parameters = [])
    {
        $reflection = new \ReflectionClass(get_class($object));
        $method = $reflection->getMethod($methodName);
        $method->setAccessible(true);

        return $method->invokeArgs($object, $parameters);
    }
}
