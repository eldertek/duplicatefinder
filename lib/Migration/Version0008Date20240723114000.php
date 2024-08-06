<?php
namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

/**
 * Migration step for adding "user_id" column.
 */
class Version0008Date20240723114000 extends SimpleMigrationStep {

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
            
            if (!$table->hasColumn('user_id')) {
                $table->addColumn('user_id', 'integer', [
                    'notnull' => false,
                    'default' => null
                ]);
            }
        }

        return $schema;
    }
}
