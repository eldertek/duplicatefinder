<?php

namespace OCA\DuplicateFinder\Tests\Unit\Event;

use OCA\DuplicateFinder\Db\FileInfo;
use OCA\DuplicateFinder\Event\AbstractFileInfoEvent;
use OCA\DuplicateFinder\Event\NewFileInfoEvent;
use OCA\DuplicateFinder\Event\UpdatedFileInfoEvent;
use PHPUnit\Framework\TestCase;

class AbstractFileInfoEventTest extends TestCase
{
    private $fileInfo;

    protected function setUp(): void
    {
        parent::setUp();

        $this->fileInfo = new FileInfo();
        $this->fileInfo->setId(1);
        $this->fileInfo->setPath('/testuser/files/test.jpg');
        $this->fileInfo->setOwner('testuser');
    }

    public function testGetFileInfo()
    {
        $event = $this->getMockForAbstractClass(AbstractFileInfoEvent::class, [$this->fileInfo, 'testuser']);
        $this->assertSame($this->fileInfo, $event->getFileInfo());
    }

    public function testGetUserID()
    {
        $event = $this->getMockForAbstractClass(AbstractFileInfoEvent::class, [$this->fileInfo, 'testuser']);
        $this->assertEquals('testuser', $event->getUserID());
    }

    public function testGetUserIDWithNullUser()
    {
        $event = $this->getMockForAbstractClass(AbstractFileInfoEvent::class, [$this->fileInfo, null]);
        $this->assertNull($event->getUserID());
    }

    public function testNewFileInfoEvent()
    {
        $event = new NewFileInfoEvent($this->fileInfo, 'testuser');
        $this->assertSame($this->fileInfo, $event->getFileInfo());
        $this->assertEquals('testuser', $event->getUserID());
    }

    public function testUpdatedFileInfoEvent()
    {
        $event = new UpdatedFileInfoEvent($this->fileInfo, 'testuser');
        $this->assertSame($this->fileInfo, $event->getFileInfo());
        $this->assertEquals('testuser', $event->getUserID());
    }
}
