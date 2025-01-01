<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version1050Date20241228000000 extends SimpleMigrationStep {
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options) {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        // Fix df_excluded_folders table
        if ($schema->hasTable('df_excluded_folders')) {
            $table = $schema->getTable('df_excluded_folders');
            
            // Drop the existing index
            if ($table->hasIndex('df_excl_folders_unique')) {
                $table->dropIndex('df_excl_folders_unique');
            }

            // Modify the folder_path column to use a shorter length
            $folderPathColumn = $table->getColumn('folder_path');
            $folderPathColumn->setLength(700);

            // Recreate the index with the shorter column
            $table->addUniqueIndex(['user_id', 'folder_path'], 'df_excl_folders_unique');
        }

        // Fix duplicatefinder_of table
        if ($schema->hasTable('duplicatefinder_of')) {
            $table = $schema->getTable('duplicatefinder_of');
            
            // Drop the existing index
            if ($table->hasIndex('df_folders_unique_idx')) {
                $table->dropIndex('df_folders_unique_idx');
            }

            // Modify the folder_path column to use a shorter length
            $folderPathColumn = $table->getColumn('folder_path');
            $folderPathColumn->setLength(700);

            // Recreate the index with the shorter column
            $table->addUniqueIndex(['user_id', 'folder_path'], 'df_folders_unique_idx');
        }

        return $schema;
    }
} 