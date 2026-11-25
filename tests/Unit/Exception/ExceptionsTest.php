<?php

namespace OCA\DuplicateFinder\Tests\Unit\Exception;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Exception\ForcedToIgnoreFileException;
use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\NotAuthenticatedException;
use OCA\DuplicateFinder\Exception\OriginFolderProtectionException;
use OCA\DuplicateFinder\Exception\UnableToCalculateHash;
use OCA\DuplicateFinder\Exception\UnableToParseException;
use OCA\DuplicateFinder\Exception\UnknownOwnerException;
use PHPUnit\Framework\TestCase;

class ExceptionsTest extends TestCase
{
    public function testNotAuthenticatedException(): void
    {
        $custom = new NotAuthenticatedException('Session expired');
        $this->assertInstanceOf(\Exception::class, $custom);
        $this->assertSame('Session expired', $custom->getMessage());

        $default = new NotAuthenticatedException();
        $this->assertSame('User is not authenticated', $default->getMessage());
    }

    public function testUnableToParseException(): void
    {
        $previous = new \RuntimeException('Original error');
        $exception = new UnableToParseException('Invalid JSON format', $previous);

        $this->assertInstanceOf(\Exception::class, $exception);
        $this->assertSame('Unable to parse Invalid JSON format', $exception->getMessage());
        $this->assertSame(1, $exception->getCode());
        $this->assertSame($previous, $exception->getPrevious());
    }

    public function testUnknownOwnerException(): void
    {
        $exception = new UnknownOwnerException('/admin/files/test.txt');

        $this->assertInstanceOf(\Exception::class, $exception);
        $this->assertSame('The owner of /admin/files/test.txt is not set', $exception->getMessage());
        $this->assertSame(0, $exception->getCode());
    }

    public function testUnableToCalculateHashException(): void
    {
        $exception = new UnableToCalculateHash('/user/files/locked.bin');

        $this->assertSame('Unable to calculate hash for /user/files/locked.bin', $exception->getMessage());
        $this->assertSame(0, $exception->getCode());
    }

    public function testForcedToIgnoreFileException(): void
    {
        $fileInfo = new FileInfo('/user/files/ext/a.txt', 'user');
        $exception = new ForcedToIgnoreFileException($fileInfo, 'app:ignore_mounted_files');

        $this->assertSame(
            'Ignored File Info for /user/files/ext/a.txt because of setting app:ignore_mounted_files',
            $exception->getMessage()
        );
        $this->assertSame(1, $exception->getCode());
    }

    public function testProtectionExceptionsPreserveMessage(): void
    {
        $origin = new OriginFolderProtectionException('Protected by origin');
        $lastCopy = new LastCopyProtectionException('Last remaining copy');

        $this->assertSame('Protected by origin', $origin->getMessage());
        $this->assertSame('Last remaining copy', $lastCopy->getMessage());
    }
}
