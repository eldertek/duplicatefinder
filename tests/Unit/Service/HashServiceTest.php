<?php

namespace OCA\DuplicateFinder\Tests\Unit\Service;

use OCA\DuplicateFinder\Exception\UnableToCalculateHash;
use PHPUnit\Framework\TestCase;

class HashServiceTest extends TestCase
{
    public function testSha256HashFormatForSmallPayload(): void
    {
        $content = 'Hello World';
        $expectedHash = hash('sha256', $content);

        $this->assertSame(64, strlen($expectedHash));
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $expectedHash);
    }

    public function testStreamHashingMatchesInMemorySha256(): void
    {
        $payload = str_repeat('duplicatefinder-chunk-', 2048);
        $stream = fopen('php://memory', 'r+');
        $this->assertNotFalse($stream);
        fwrite($stream, $payload);
        rewind($stream);

        $ctx = hash_init('sha256');
        hash_update_stream($ctx, $stream);
        $streamHash = hash_final($ctx);
        fclose($stream);

        $this->assertSame(hash('sha256', $payload), $streamHash);
    }

    public function testUnableToCalculateHashFormatsPathMessage(): void
    {
        $exception = new UnableToCalculateHash('/alice/files/unreadable.bin');
        $this->assertSame('Unable to calculate hash for /alice/files/unreadable.bin', $exception->getMessage());
    }

    public function testHashConsistency(): void
    {
        $content = 'Consistent content';
        $hash1 = hash('sha256', $content);
        $hash2 = hash('sha256', $content);

        $this->assertSame($hash1, $hash2);
        $this->assertNotSame($hash1, hash('sha256', $content . ' modified'));
    }
}
