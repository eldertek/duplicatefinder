<?php

namespace OCA\DuplicateFinder\Tests\Unit\Exception;

use OCA\DuplicateFinder\Exception\NotAuthenticatedException;
use OCA\DuplicateFinder\Exception\UnableToParseException;
use OCA\DuplicateFinder\Exception\UnknownOwnerException;
use PHPUnit\Framework\TestCase;

class ExceptionsTest extends TestCase
{
    /**
     * Test NotAuthenticatedException
     */
    public function testNotAuthenticatedException(): void
    {
        $exception = new NotAuthenticatedException('User not authenticated');

        $this->assertInstanceOf(\Exception::class, $exception);
        $this->assertEquals('User not authenticated', $exception->getMessage());
    }

    /**
     * Test NotAuthenticatedException with default message
     */
    public function testNotAuthenticatedExceptionDefaultMessage(): void
    {
        $exception = new NotAuthenticatedException();

        $this->assertNotEmpty($exception->getMessage());
    }

    /**
     * Test UnableToParseException
     */
    public function testUnableToParseException(): void
    {
        $exception = new UnableToParseException('Invalid JSON format');

        $this->assertInstanceOf(\Exception::class, $exception);
        $this->assertEquals('Invalid JSON format', $exception->getMessage());
    }

    /**
     * Test UnableToParseException with error details
     */
    public function testUnableToParseExceptionWithDetails(): void
    {
        $parseError = 'Unexpected token at position 42';
        $exception = new UnableToParseException($parseError);

        $this->assertStringContainsString('42', $exception->getMessage());
    }

    /**
     * Test UnknownOwnerException
     */
    public function testUnknownOwnerException(): void
    {
        $exception = new UnknownOwnerException('Owner "admin" does not exist');

        $this->assertInstanceOf(\Exception::class, $exception);
        $this->assertEquals('Owner "admin" does not exist', $exception->getMessage());
    }

    /**
     * Test UnknownOwnerException for system users
     */
    public function testUnknownOwnerExceptionSystemUser(): void
    {
        $exception = new UnknownOwnerException('System user cannot be resolved');

        $this->assertStringContainsString('System', $exception->getMessage());
    }

    /**
     * Test exception codes
     */
    public function testExceptionCodes(): void
    {
        $notAuth = new NotAuthenticatedException('test', 401);
        $this->assertEquals(401, $notAuth->getCode());

        $parse = new UnableToParseException('test', 422);
        $this->assertEquals(422, $parse->getCode());

        $owner = new UnknownOwnerException('test', 404);
        $this->assertEquals(404, $owner->getCode());
    }

    /**
     * Test exception with previous exception
     */
    public function testExceptionChaining(): void
    {
        $previous = new \RuntimeException('Original error');
        $exception = new UnableToParseException('Parse failed', 0, $previous);

        $this->assertSame($previous, $exception->getPrevious());
        $this->assertEquals('Original error', $exception->getPrevious()->getMessage());
    }
}
