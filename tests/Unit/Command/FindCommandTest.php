<?php

namespace OCA\DuplicateFinder\Tests\Unit\Command;

use OCA\DuplicateFinder\Command\FindCommand;
use OCA\DuplicateFinder\Db\FileDuplicate;
use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCP\IUser;
use OCP\IUserManager;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

class FindCommandTest extends TestCase
{
    /** @var FindCommand */
    private $command;

    /** @var IUserManager|MockObject */
    private $userManager;

    /** @var FileDuplicateService|MockObject */
    private $fileDuplicateService;

    /** @var CommandTester */
    private $commandTester;

    protected function setUp(): void
    {
        parent::setUp();

        $this->userManager = $this->createMock(IUserManager::class);
        $this->fileDuplicateService = $this->createMock(FileDuplicateService::class);

        $this->command = new FindCommand(
            $this->userManager,
            $this->fileDuplicateService
        );

        $application = new Application();
        $application->add($this->command);

        $this->commandTester = new CommandTester($this->command);
    }

    /**
     * Test finding duplicates for specific user
     */
    public function testFindDuplicatesForUser(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->expects($this->once())
            ->method('get')
            ->with('testuser')
            ->willReturn($user);

        // Create test duplicates
        $duplicate1 = $this->createDuplicate('hash1', [
            ['path' => '/user/files/doc1.txt', 'size' => 1024],
            ['path' => '/user/files/backup/doc1.txt', 'size' => 1024],
        ]);

        $duplicate2 = $this->createDuplicate('hash2', [
            ['path' => '/user/files/image.jpg', 'size' => 2048],
            ['path' => '/user/files/photos/image.jpg', 'size' => 2048],
            ['path' => '/user/files/archive/image.jpg', 'size' => 2048],
        ]);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAllForUser')
            ->with('testuser')
            ->willReturn([
                'entities' => [$duplicate1, $duplicate2],
                'pagination' => ['total' => 2],
            ]);

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();

        // Check output contains duplicate information
        $this->assertStringContainsString('Finding duplicates for user: testuser', $output);
        $this->assertStringContainsString('Found 2 duplicate groups', $output);
        $this->assertStringContainsString('hash1', $output);
        $this->assertStringContainsString('hash2', $output);
        $this->assertStringContainsString('doc1.txt', $output);
        $this->assertStringContainsString('image.jpg', $output);
        $this->assertStringContainsString('2 files', $output);
        $this->assertStringContainsString('3 files', $output);
        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test finding duplicates for all users
     */
    public function testFindDuplicatesForAllUsers(): void
    {
        $this->fileDuplicateService->expects($this->once())
            ->method('findAll')
            ->with(1000, 0)
            ->willReturn([
                'entities' => [
                    $this->createDuplicate('hash1', [
                        ['path' => '/user1/files/doc.txt', 'size' => 1024],
                        ['path' => '/user2/files/doc.txt', 'size' => 1024],
                    ]),
                ],
                'pagination' => ['total' => 1],
            ]);

        $this->commandTester->execute([]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('Finding duplicates for all users', $output);
        $this->assertStringContainsString('Found 1 duplicate groups', $output);
    }

    /**
     * Test with limit option
     */
    public function testFindWithLimit(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileDuplicateService->expects($this->once())
            ->method('findAllForUser')
            ->with('testuser', 5, 0) // Should use limit of 5
            ->willReturn([
                'entities' => [],
                'pagination' => ['total' => 0],
            ]);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--limit' => 5,
        ]);

        $this->assertEquals(0, $this->commandTester->getStatusCode());
    }

    /**
     * Test with output format JSON
     */
    public function testFindWithJsonOutput(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $duplicate = $this->createDuplicate('hash1', [
            ['path' => '/user/files/doc.txt', 'size' => 1024],
        ]);

        $this->fileDuplicateService->method('findAllForUser')
            ->willReturn([
                'entities' => [$duplicate],
                'pagination' => ['total' => 1],
            ]);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--output' => 'json',
        ]);

        $output = $this->commandTester->getDisplay();

        // Should be valid JSON
        $json = json_decode($output, true);
        $this->assertNotNull($json);
        $this->assertArrayHasKey('duplicates', $json);
        $this->assertCount(1, $json['duplicates']);
    }

    /**
     * Test with non-existent user
     */
    public function testFindWithNonExistentUser(): void
    {
        $this->userManager->expects($this->once())
            ->method('get')
            ->with('nonexistent')
            ->willReturn(null);

        $this->commandTester->execute([
            'user_id' => 'nonexistent',
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('User not found: nonexistent', $output);
        $this->assertEquals(1, $this->commandTester->getStatusCode());
    }

    /**
     * Test with no duplicates found
     */
    public function testFindNoDuplicates(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $this->fileDuplicateService->method('findAllForUser')
            ->willReturn([
                'entities' => [],
                'pagination' => ['total' => 0],
            ]);

        $this->commandTester->execute([
            'user_id' => 'testuser',
        ]);

        $output = $this->commandTester->getDisplay();

        $this->assertStringContainsString('No duplicates found', $output);
    }

    /**
     * Test verbose output
     */
    public function testFindWithVerboseOutput(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('testuser');

        $this->userManager->method('get')->willReturn($user);

        $duplicate = $this->createDuplicate('hash1', [
            ['path' => '/user/files/doc.txt', 'size' => 1024, 'mtime' => 1234567890],
        ]);

        $this->fileDuplicateService->method('findAllForUser')
            ->willReturn([
                'entities' => [$duplicate],
                'pagination' => ['total' => 1],
            ]);

        $this->commandTester->execute([
            'user_id' => 'testuser',
            '--verbose' => true,
        ]);

        $output = $this->commandTester->getDisplay();

        // Verbose output should include more details
        $this->assertStringContainsString('Modified:', $output);
        $this->assertStringContainsString('Size:', $output);
    }

    /**
     * Helper method to create a duplicate with files
     */
    private function createDuplicate(string $hash, array $filesData): FileDuplicate
    {
        $duplicate = new FileDuplicate();
        $duplicate->setHash($hash);

        $files = [];
        foreach ($filesData as $data) {
            $file = new FileInfo();
            $file->setPath($data['path']);
            $file->setSize($data['size']);
            $file->setMTime($data['mtime'] ?? time());
            $files[] = $file;
        }

        $duplicate->setFiles($files);

        return $duplicate;
    }
}
