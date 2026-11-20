<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\IOutput;
use OCP\Migration\SimpleMigrationStep;

class Version11019Date20261119000500 extends SimpleMigrationStep
{
    /**
     * @param IOutput $output
     * @param Closure $schemaClosure The `\Closure` returns a `ISchemaWrapper`
     * @param array $options
     * @return null|ISchemaWrapper
     */
    public function changeSchema(IOutput $output, Closure $schemaClosure, array $options)
    {
        /** @var ISchemaWrapper $schema */
        $schema = $schemaClosure();

        if ($schema->hasTable('duplicatefinder_dups')) {
            $table = $schema->getTable('duplicatefinder_dups');

            // acknowledged leads so the list filter is the index prefix.
            // hash, type follow so ORDER BY hash, type can be read from the index
            // and the database can stop after one page instead of sorting every row.
            if (
                $table->hasColumn('acknowledged')
                && $table->hasColumn('hash')
                && $table->hasColumn('type')
                && !$table->hasIndex('duplicatefinder_dups_ack_hash_type_idx')
            ) {
                $table->addIndex(
                    ['acknowledged', 'hash', 'type'],
                    'duplicatefinder_dups_ack_hash_type_idx'
                );
            }

            return $schema;
        }

        return null;
    }
}
