<?php

namespace OCA\DuplicateFinder\Tests\Unit\Event;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\CalculatedHashEvent;
use PHPUnit\Framework\TestCase;

class CalculatedHashEventTest extends TestCase
{
    private $fileInfo;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfo = new FileInfo();
        $this->fileInfo->setId(1);
        $this->fileInfo->setPath('/testuser/files/test.jpg');
        $this->fileInfo->setOwner('testuser');
        $this->fileInfo->setFileHash('newhash');
    }

    public function testGetFileInfo()
    {
        $event = new CalculatedHashEvent($this->fileInfo, 'oldhash');
        $this->assertSame($this->fileInfo, $event->getFileInfo());
    }

    public function testIsNewWithEmptyOldHash()
    {
        $event = new CalculatedHashEvent($this->fileInfo, null);
        $this->assertTrue($event->isNew());

        $event = new CalculatedHashEvent($this->fileInfo, '');
        $this->assertTrue($event->isNew());
    }

    public function testIsNewWithNonEmptyOldHash()
    {
        $event = new CalculatedHashEvent($this->fileInfo, 'oldhash');
        $this->assertFalse($event->isNew());
    }

    public function testIsChangedWithDifferentHash()
    {
        $event = new CalculatedHashEvent($this->fileInfo, 'oldhash');
        $this->assertTrue($event->isChanged());
    }

    public function testIsChangedWithSameHash()
    {
        $this->fileInfo->setFileHash('samehash');
        $event = new CalculatedHashEvent($this->fileInfo, 'samehash');
        $this->assertFalse($event->isChanged());
    }

    public function testGetOldHash()
    {
        $event = new CalculatedHashEvent($this->fileInfo, 'oldhash');
        $this->assertEquals('oldhash', $event->getOldHash());
    }
}
