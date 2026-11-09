<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\ListAllDuplicates;
use OCA\DuplicateFinder\Db\FileInfoMapper;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Tester\CommandTester;

/**
 * Issue 195: an admin report of the duplicates of all users, read only, from the indexed rows.
 */
class ListAllDuplicatesTest extends TestCase
{
    private $mapper;
    private $userManager;
    private $tester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapper = $this->createMock(FileInfoMapper::class);
        $this->userManager = $this->createMock(IUserManager::class);
        $this->tester = new CommandTester(new ListAllDuplicates($this->mapper, $this->userManager));
    }

    private function user(string $uid): IUser
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn($uid);

        return $user;
    }

    private function usersAre(array $uids): void
    {
        $this->userManager->method('callForAllUsers')->willReturnCallback(function (\Closure $callback) use ($uids) {
            foreach ($uids as $uid) {
                $callback($this->user($uid));
            }
        });
    }

    private static function rows(array $groups): \Generator
    {
        yield from $groups;
    }

    private function group(string $hash, int $size, int $copies): array
    {
        return ['hash' => $hash, 'size' => $size, 'copies' => $copies, 'wasted' => $size * ($copies - 1)];
    }

    public function testTheCommandIsNamedLikeTheOthersOfTheApp(): void
    {
        $this->assertSame('duplicates:list-all', (new ListAllDuplicates($this->mapper, $this->userManager))->getName());
    }

    public function testItNeverWrites(): void
    {
        // the mapper is a mock: any call to a method that is not a read would be an unexpected call here
        $reads = ['findDuplicateGroupsAcrossUsers', 'findCopiesOfHashes', 'findOwners'];
        $mapper = $this->getMockBuilder(FileInfoMapper::class)->disableOriginalConstructor()
            ->onlyMethods(array_merge($reads, ['insert', 'update', 'delete', 'insertOrUpdate', 'repairPathHashes', 'removeSurplusRows']))
            ->getMock();
        $mapper->method('findDuplicateGroupsAcrossUsers')->willReturnCallback(fn () => self::rows([]));
        $mapper->method('findCopiesOfHashes')->willReturn([]);
        $mapper->method('findOwners')->willReturn([]);
        foreach (['insert', 'update', 'delete', 'insertOrUpdate', 'repairPathHashes', 'removeSurplusRows'] as $write) {
            $mapper->expects($this->never())->method($write);
        }
        $this->usersAre([]);

        $tester = new CommandTester(new ListAllDuplicates($mapper, $this->userManager));
        $this->assertSame(0, $tester->execute([]));
    }

    public function testTableShowsHashSizeCopiesOwnerAndPathOfEachCopy(): void
    {
        $this->usersAre(['alice', 'bob']);
        $this->mapper->method('findOwners')->willReturn(['alice', 'bob']);
        $this->mapper->method('findDuplicateGroupsAcrossUsers')->willReturn(self::rows([$this->group('abc123', 3 * 1024 * 1024, 2)]));
        $this->mapper->method('findCopiesOfHashes')->with(['abc123'])->willReturn(['abc123' => [
            ['owner' => 'alice', 'path' => '/alice/files/ISO/debian.iso'],
            ['owner' => 'bob', 'path' => '/bob/files/Downloads/debian.iso'],
        ]]);

        $this->assertSame(0, $this->tester->execute([]));
        $display = $this->tester->getDisplay();

        $this->assertStringContainsString('abc123', $display);
        $this->assertStringContainsString('3.0 MB', $display);
        $this->assertStringContainsString('Copies: 2', $display);
        $this->assertStringContainsString('alice', $display);
        $this->assertStringContainsString('/alice/files/ISO/debian.iso', $display);
        $this->assertStringContainsString('bob', $display);
        $this->assertStringContainsString('/bob/files/Downloads/debian.iso', $display);
        $this->assertStringNotContainsString('Not scanned yet', $display);
    }

    public function testJsonIsValidAndComplete(): void
    {
        $this->usersAre(['alice', 'bob', 'carol']);
        $this->mapper->method('findOwners')->willReturn(['alice', 'bob']);
        $this->mapper->method('findDuplicateGroupsAcrossUsers')->willReturn(self::rows([
            $this->group('big', 1000, 3),
            $this->group('small', 10, 2),
        ]));
        $this->mapper->method('findCopiesOfHashes')->willReturn([
            'big' => [['owner' => 'alice', 'path' => '/alice/files/a'], ['owner' => 'bob', 'path' => '/bob/files/é b'], ['owner' => 'bob', 'path' => '/bob/files/c']],
            'small' => [['owner' => 'alice', 'path' => '/alice/files/d'], ['owner' => 'alice', 'path' => '/alice/files/e']],
        ]);

        $this->assertSame(0, $this->tester->execute(['--output' => 'json']));
        $data = json_decode($this->tester->getDisplay(), true);

        $this->assertIsArray($data, 'the output must be one JSON document, nothing else');
        $this->assertSame(['big', 'small'], array_column($data['groups'], 'hash'));
        $this->assertSame(1000, $data['groups'][0]['size']);
        $this->assertSame(3, $data['groups'][0]['copies']);
        $this->assertSame(2000, $data['groups'][0]['wasted']);
        $this->assertSame('/bob/files/é b', $data['groups'][0]['files'][1]['path']);
        $this->assertSame('bob', $data['groups'][0]['files'][1]['owner']);
        $this->assertSame(['groups' => 2, 'copies' => 5, 'wasted' => 2010], $data['totals']);
        $this->assertFalse($data['truncated']);
        $this->assertSame(['carol'], $data['users_without_index']);
    }

    public function testJsonWithoutAnyGroupIsStillValid(): void
    {
        $this->usersAre([]);
        $this->mapper->method('findOwners')->willReturn([]);
        $this->mapper->method('findDuplicateGroupsAcrossUsers')->willReturnCallback(fn () => self::rows([]));

        $this->assertSame(0, $this->tester->execute(['--output' => 'json']));
        $data = json_decode($this->tester->getDisplay(), true);

        $this->assertSame([], $data['groups']);
        $this->assertSame(['groups' => 0, 'copies' => 0, 'wasted' => 0], $data['totals']);
    }

    public function testUsersThatWereNeverScannedAreNamedAndNothingIsScanned(): void
    {
        $this->usersAre(['alice', 'zoe', 'bob']);
        $this->mapper->method('findOwners')->willReturn(['alice']);
        $this->mapper->method('findDuplicateGroupsAcrossUsers')->willReturnCallback(fn () => self::rows([]));

        $this->assertSame(0, $this->tester->execute([]));
        $display = $this->tester->getDisplay();

        $this->assertStringContainsString('No duplicate found', $display);
        $this->assertStringContainsString('Not scanned yet (no indexed file): bob, zoe', $display);
    }

    public function testLimitCutsTheListAndSaysSo(): void
    {
        $this->usersAre([]);
        $this->mapper->method('findOwners')->willReturn([]);
        // limit 2 asks for 3 groups: the third only tells that the list was cut
        $this->mapper->expects($this->once())
            ->method('findDuplicateGroupsAcrossUsers')
            ->with(1, 3)
            ->willReturn(self::rows([$this->group('g1', 300, 2), $this->group('g2', 200, 2), $this->group('g3', 100, 2)]));
        $this->mapper->method('findCopiesOfHashes')->willReturn([]);

        $this->assertSame(0, $this->tester->execute(['--limit' => '2', '--output' => 'json']));
        $data = json_decode($this->tester->getDisplay(), true);

        $this->assertSame(['g1', 'g2'], array_column($data['groups'], 'hash'));
        $this->assertTrue($data['truncated']);
    }

    public function testLimitZeroReadsEveryGroupInOneQueryAndLooksUpTheCopiesByBatches(): void
    {
        $this->usersAre([]);
        $this->mapper->method('findOwners')->willReturn([]);
        $groups = [];
        for ($i = 0; $i < 450; $i++) {
            $groups[] = $this->group('h' . $i, 100, 2);
        }
        // a single grouping query (an offset would run it again for every page), three batches of copies
        $this->mapper->expects($this->once())
            ->method('findDuplicateGroupsAcrossUsers')
            ->with(1, 0)
            ->willReturn(self::rows($groups));
        $this->mapper->expects($this->exactly(3))->method('findCopiesOfHashes')->willReturn([]);

        $this->assertSame(0, $this->tester->execute(['--limit' => '0', '--output' => 'json']));
        $data = json_decode($this->tester->getDisplay(), true);

        $this->assertSame(450, $data['totals']['groups']);
        $this->assertSame('h449', $data['groups'][449]['hash']);
        $this->assertFalse($data['truncated']);
    }

    public function testMinSizeAcceptsUnitsAndReachesTheQuery(): void
    {
        $this->usersAre([]);
        $this->mapper->method('findOwners')->willReturn([]);
        $this->mapper->expects($this->once())
            ->method('findDuplicateGroupsAcrossUsers')
            ->with(10 * 1024 * 1024, 101)
            ->willReturn(self::rows([]));

        $this->assertSame(0, $this->tester->execute(['--min-size' => '10M']));
    }

    public function testBadOptionsAreRefusedBeforeTouchingTheDatabase(): void
    {
        $this->mapper->expects($this->never())->method('findDuplicateGroupsAcrossUsers');
        $this->mapper->expects($this->never())->method('findOwners');

        $this->assertSame(1, $this->tester->execute(['--output' => 'xml']));
        $this->assertStringContainsString('Unknown output format', $this->tester->getDisplay());
        $this->assertSame(1, $this->tester->execute(['--min-size' => 'big']));
        $this->assertStringContainsString('Invalid --min-size', $this->tester->getDisplay());
        $this->assertSame(1, $this->tester->execute(['--limit' => '-3']));
        $this->assertStringContainsString('Invalid --limit', $this->tester->getDisplay());
    }

    /**
     * @dataProvider sizes
     */
    public function testParseSize(string $value, ?int $expected): void
    {
        $this->assertSame($expected, ListAllDuplicates::parseSize($value));
    }

    public static function sizes(): array
    {
        return [
            ['0', 0],
            ['1048576', 1048576],
            ['500K', 512000],
            ['10m', 10485760],
            ['1G', 1073741824],
            ['1.5G', 1610612736],
            ['2 MB', 2097152],
            ['', null],
            ['-1', null],
            ['ten', null],
            ['10X', null],
        ];
    }

    public function testFormatSize(): void
    {
        $this->assertSame('0 B', ListAllDuplicates::formatSize(0));
        $this->assertSame('1023 B', ListAllDuplicates::formatSize(1023));
        $this->assertSame('1.0 KB', ListAllDuplicates::formatSize(1024));
        $this->assertSame('4.5 GB', ListAllDuplicates::formatSize((int)(4.5 * 1024 ** 3)));
    }
}
