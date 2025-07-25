<?php

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version0000Date20210325183200 extends SimpleMigrationStep
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

        if (!$schema->hasTable('duplicatefinder_finfo')) {
            $table = $schema->createTable('duplicatefinder_finfo');
            $table->addColumn('id', 'integer', [
            'autoincrement' => true,
            'notnull' => true,
            ]);
            $table->addColumn('owner', 'string', [
            'notnull' => true,
            'length' => 200,
            ]);
            $table->addColumn('path', 'text', [
            'notnull' => true,
            ]);
            /**
             * Column to store the hash of file
             * This erases the need to calculate the hash on every time the app is opend
             */
            $table->addColumn('file_hash', 'string', [
            'notnull' => false,
            'length' => 200,
            ]);
            $table->addColumn('size', 'integer', [
              'notnull' => false,
            ]);
            $table->addColumn('mimetype', 'string', [
              'notnull' => false,
              'length' => 200,
            ]);

            /**
             * Column to store the hash of an image (without exif data)
             */
            $table->addColumn('image_hash', 'string', [
            'notnull' => false,
            'length' => 200,
            ]);

            /** Stores the time where the hash is calculated */
            $table->addColumn('updated_at', 'integer', [
            'notnull' => false,
            ]);

            $table->setPrimaryKey(['id']);
            //On some db versions index on a text column leads to an error
            //To avoid this a the next db migration changes the type to a varchar and creates the index
            //$table->addIndex(['path'], 'duplicatefinder_path_idx');
            $table->addIndex(['file_hash'], 'duplicatefinder_hashes_idx');
        }
        $schema = $this->createDuplicatesTable($schema);
        $schema = $this->createDuplicatesRelationTable($schema);

        return $schema;
    }

    private function createDuplicatesTable(ISchemaWrapper $schema): ISchemaWrapper
    {
        if (!$schema->hasTable('duplicatefinder_dups')) {
            $table = $schema->createTable('duplicatefinder_dups');
            $table->addColumn('id', 'integer', [
            'autoincrement' => true,
            'notnull' => true,
            ]);
            $table->addColumn('type', 'string', [
            'notnull' => true,
            'length' => 200,
            ]);
            $table->addColumn('hash', 'string', [
            'notnull' => true,
            'length' => 200,
            ]);
            $table->setPrimaryKey(['id']);
            $table->addIndex(['type','hash'], 'duplicatefinder_dh_idx');
        }

        return $schema;
    }

    private function createDuplicatesRelationTable(ISchemaWrapper $schema): ISchemaWrapper
    {
        if (!$schema->hasTable('duplicatefinder_dups_f')) {
            $table = $schema->createTable('duplicatefinder_dups_f');
            $table->addColumn('id', 'integer', [
            'notnull' => true,
            ]);
            $table->addColumn('rid', 'integer', [
            'notnull' => true,
            ]);
            $table->addColumn('value', 'string', [
            'notnull' => false,
            'length' => 200,
            ]);
            $table->setPrimaryKey(['id', 'rid']);
        }

        return $schema;
    }
}
