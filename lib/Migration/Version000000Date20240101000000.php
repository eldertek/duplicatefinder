<?php

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version000000Date20240101000000 extends SimpleMigrationStep
{
    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns \OCP\DB\ISchemaWrapper
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('duplicatefinder_filters')) {
            $table = $schema->createTable('duplicatefinder_filters');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('type', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('value', 'string', [
                'notnull' => true,
                'length' => 4000,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('created_at', 'integer', [
                'notnull' => true,
            ]);

            $table->setPrimaryKey(['id'], 'df_flt_pk');
            $table->addIndex(['user_id'], 'df_flt_uid');
            $table->addIndex(['type'], 'df_flt_type');
        }

        return $schema;
    }
}
