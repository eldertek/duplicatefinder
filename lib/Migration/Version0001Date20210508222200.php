<?php

namespace OCA\DuplicateFinder\Migration;

use Closure;
use Doctrine\DBAL\Types\Type;
use Doctrine\DBAL\Types\Types;
// This is OCP\DB\Types is support on NC 21 but not on NC 20
//use OCP\DB\Types;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0001Date20210508222200 extends SimpleMigrationStep
{
    /**
    * @param IOutput $output
    * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
    * @param array<mixed> $options
    * @return null|ISchemaWrapper
    */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();
        if ($schema->hasTable('duplicatefinder_finfo')) {
            $table = $schema->getTable('duplicatefinder_finfo');
            if ($table->hasColumn('path')) {
                $pathColumn = $table->getColumn('path');
                $pathColumn->setType(Type::getType(Types::STRING));
                $pathColumn->setOptions(['length' => 700]);
            }

            return $schema;
        }

        return null;
    }
}
