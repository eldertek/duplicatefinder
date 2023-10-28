<?php
namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Migration step for adding "acknowledged" column.
 */
class Version0007Date20231028094720 extends SimpleMigrationStep {

    /**
     * @param IOutput $output
     * @param Closure(): ISchemaWrapper $schemaClosure
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('duplicatefinder_dups')) {
            $table = $schema->getTable('duplicatefinder_dups');
            
            if (!$table->hasColumn('acknowledged')) {
                $table->addColumn('acknowledged', 'boolean', [
                    'notnull' => false,
                    'default' => false
                ]);
            }
        }

        return $schema;
    }
}
