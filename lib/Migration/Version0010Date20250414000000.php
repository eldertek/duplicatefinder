<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0010Date20250414000000 extends SimpleMigrationStep {
    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options): ?ISchemaWrapper {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if (!$schema->hasTable('df_projects')) {
            $table = $schema->createTable('df_projects');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('user_id', 'string', [
                'notnull' => true,
                'length' => 64,
            ]);
            $table->addColumn('name', 'string', [
                'notnull' => true,
                'length' => 255,
            ]);
            $table->addColumn('created_at', 'datetime', [
                'notnull' => true,
            ]);
            $table->addColumn('last_scan', 'datetime', [
                'notnull' => false,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['user_id'], 'df_p_uid_idx');
        }

        if (!$schema->hasTable('df_folders')) {
            $table = $schema->createTable('df_folders');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('project_id', 'integer', [
                'notnull' => true,
            ]);
            $table->addColumn('folder_path', 'string', [
                'notnull' => true,
                'length' => 700,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['project_id'], 'df_f_pid_idx');
            $table->addForeignKeyConstraint(
                $schema->getTable('df_projects'),
                ['project_id'],
                ['id'],
                ['onDelete' => 'CASCADE'],
                'df_f_pid_fk'
            );
        }

        if (!$schema->hasTable('df_duplicates')) {
            $table = $schema->createTable('df_duplicates');
            $table->addColumn('id', 'integer', [
                'autoincrement' => true,
                'notnull' => true,
            ]);
            $table->addColumn('project_id', 'integer', [
                'notnull' => true,
            ]);
            $table->addColumn('duplicate_id', 'integer', [
                'notnull' => true,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addUniqueIndex(['project_id', 'duplicate_id'], 'df_d_unq_idx');
            $table->addForeignKeyConstraint(
                $schema->getTable('df_projects'),
                ['project_id'],
                ['id'],
                ['onDelete' => 'CASCADE'],
                'df_d_pid_fk'
            );
            $table->addForeignKeyConstraint(
                $schema->getTable('duplicatefinder_dups'),
                ['duplicate_id'],
                ['id'],
                ['onDelete' => 'CASCADE'],
                'df_d_did_fk'
            );
        }

        return $schema;
    }
}
