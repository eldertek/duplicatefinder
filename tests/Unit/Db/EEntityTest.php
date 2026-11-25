<?php

namespace OCA\DuplicateFinder\Tests\Unit\Db;

use OCA\DuplicateFinder\Db\EEntity;
use OCA\DuplicateFinder\Utils\JSONDateTime;
use PHPUnit\Framework\TestCase;

class EEntityTest extends TestCase
{
    private function createTestEntity(): EEntity
    {
        return new class () extends EEntity {
            protected $title = '';
            protected $active = false;
            protected $createdAt = null;
            protected $payload = null;
            protected $hiddenProp = 'secret';
            protected $files = [];

            public function __construct()
            {
                $this->addType('title', 'string');
                $this->addType('active', 'boolean');
                $this->addInternalType('createdAt', 'date');
                $this->addInternalType('payload', 'json');
                $this->addInternalProperty('hiddenProp', true, true);
                $this->addRelationalField('files');
            }

            public function addRelatedFile(int $id, string $name): void
            {
                $this->markRelationalFieldUpdated('files', $id, $name);
            }
        };
    }

    public function testJsonInternalTypeRoundTripAndKeepAsPrimary(): void
    {
        $entity = $this->createTestEntity();
        $data = ['users' => ['alice', 'bob'], 'count' => 2];

        $entity->setPayload($data);
        $decoded = $entity->getPayload();
        $this->assertInstanceOf(\stdClass::class, $decoded);
        $this->assertSame(['alice', 'bob'], $decoded->users);
        $this->assertSame(2, $decoded->count);

        $entity->setKeepAsPrimary(true);
        $this->assertSame(json_encode($data), $entity->getPayload());
    }

    public function testDateInternalTypeConvertsDateTimeToTimestampAndJSONDateTime(): void
    {
        $entity = $this->createTestEntity();
        $dt = new \DateTime('2026-01-15 12:30:00', new \DateTimeZone('UTC'));

        $entity->setCreatedAt($dt);
        $updated = $entity->getUpdatedFields();
        $this->assertArrayHasKey('createdAt', $updated);
        $this->assertTrue($updated['createdAt']);

        $resolved = $entity->getCreatedAt();
        $this->assertInstanceOf(JSONDateTime::class, $resolved);
        $this->assertSame($dt->getTimestamp(), $resolved->getTimestamp());
    }

    public function testInternalPropertyAndRelationalFieldAreExcludedFromUpdatedDbFields(): void
    {
        $entity = $this->createTestEntity();
        $entity->setHiddenProp('changed');
        $entity->setFiles(['a', 'b']);
        $entity->setTitle('Updated');

        $updated = $entity->getUpdatedFields();
        $this->assertArrayHasKey('title', $updated);
        $this->assertArrayNotHasKey('hiddenProp', $updated);
        $this->assertArrayNotHasKey('files', $updated);
    }

    public function testRelationalFieldTrackingAndReset(): void
    {
        $entity = $this->createTestEntity();
        $entity->addRelatedFile(10, 'doc.pdf');

        $this->assertSame([10 => 'doc.pdf'], $entity->getUpdatedRelationalFields('files'));

        $entity->resetUpdatedRelationalFields();
        $this->assertSame([], $entity->getUpdatedRelationalFields('files'));
    }

    public function testJsonSerializeRespectsInternalPropertyExclusionAndBoolGetter(): void
    {
        $entity = $this->createTestEntity();
        $entity->setTitle('Report');
        $entity->setActive(true);

        $serialized = $entity->jsonSerialize();

        $this->assertSame('Report', $serialized['title']);
        $this->assertTrue($serialized['active']);
        $this->assertArrayNotHasKey('hiddenProp', $serialized);
        $this->assertArrayNotHasKey('keepAsPrimary', $serialized);
    }
}
