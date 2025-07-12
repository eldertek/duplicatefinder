<?php

namespace OCA\DuplicateFinder\Tests\Unit\Db;

use OCA\DuplicateFinder\Db\EEntity;
use PHPUnit\Framework\TestCase;

/**
 * Test class for EEntity extended functionality
 */
class EEntityTest extends TestCase
{
    private $entity;

    protected function setUp(): void
    {
        parent::setUp();

        // Create anonymous class extending EEntity for testing
        $this->entity = new class () extends EEntity {
            protected $testField = '';
            protected $intField = 0;
            protected $boolField = false;
            protected $nullableField = null;
            protected $jsonField = [];

            public function __construct()
            {
                $this->addType('testField', 'string');
                $this->addType('intField', 'integer');
                $this->addType('boolField', 'boolean');
                $this->addType('jsonField', 'json');
            }
        };
    }

    /**
     * Test getValuesForDb method
     */
    public function testGetValuesForDb(): void
    {
        $this->entity->setTestField('test value');
        $this->entity->setIntField(42);
        $this->entity->setBoolField(true);
        $this->entity->setJsonField(['key' => 'value']);

        $values = $this->entity->getValuesForDb();

        $this->assertArrayHasKey('test_field', $values);
        $this->assertArrayHasKey('int_field', $values);
        $this->assertArrayHasKey('bool_field', $values);
        $this->assertArrayHasKey('json_field', $values);

        $this->assertEquals('test value', $values['test_field']);
        $this->assertEquals(42, $values['int_field']);
        $this->assertEquals(true, $values['bool_field']);
        $this->assertIsString($values['json_field']); // JSON should be serialized
    }

    /**
     * Test snake_case conversion
     */
    public function testSnakeCaseConversion(): void
    {
        $this->entity->setTestField('value');
        $values = $this->entity->getValuesForDb();

        // testField should become test_field
        $this->assertArrayHasKey('test_field', $values);
        $this->assertArrayNotHasKey('testField', $values);
    }

    /**
     * Test JSON field serialization
     */
    public function testJsonFieldSerialization(): void
    {
        $data = [
            'users' => ['alice', 'bob'],
            'settings' => [
                'theme' => 'dark',
                'notifications' => true,
            ],
        ];

        $this->entity->setJsonField($data);
        $values = $this->entity->getValuesForDb();

        $this->assertIsString($values['json_field']);
        $decoded = json_decode($values['json_field'], true);
        $this->assertEquals($data, $decoded);
    }

    /**
     * Test nullable fields
     */
    public function testNullableFields(): void
    {
        $values = $this->entity->getValuesForDb();

        $this->assertArrayHasKey('nullable_field', $values);
        $this->assertNull($values['nullable_field']);
    }

    /**
     * Test field exclusion (id field)
     */
    public function testIdFieldExclusion(): void
    {
        $this->entity->setId(123);
        $values = $this->entity->getValuesForDb();

        // id field should not be included in getValuesForDb
        $this->assertArrayNotHasKey('id', $values);
    }

    /**
     * Test boolean field conversion
     */
    public function testBooleanFieldConversion(): void
    {
        $this->entity->setBoolField(true);
        $valuesTrue = $this->entity->getValuesForDb();
        $this->assertTrue($valuesTrue['bool_field']);

        $this->entity->setBoolField(false);
        $valuesFalse = $this->entity->getValuesForDb();
        $this->assertFalse($valuesFalse['bool_field']);
    }

    /**
     * Test empty JSON array
     */
    public function testEmptyJsonArray(): void
    {
        $this->entity->setJsonField([]);
        $values = $this->entity->getValuesForDb();

        $this->assertEquals('[]', $values['json_field']);
    }

    /**
     * Test complex field names
     */
    public function testComplexFieldNameConversion(): void
    {
        $complexEntity = new class () extends EEntity {
            protected $myComplexFieldName = 'test';
            protected $anotherVeryLongFieldName = 123;

            public function __construct()
            {
                $this->addType('myComplexFieldName', 'string');
                $this->addType('anotherVeryLongFieldName', 'integer');
            }
        };

        $complexEntity->setMyComplexFieldName('value');
        $complexEntity->setAnotherVeryLongFieldName(456);

        $values = $complexEntity->getValuesForDb();

        $this->assertArrayHasKey('my_complex_field_name', $values);
        $this->assertArrayHasKey('another_very_long_field_name', $values);
        $this->assertEquals('value', $values['my_complex_field_name']);
        $this->assertEquals(456, $values['another_very_long_field_name']);
    }
}
