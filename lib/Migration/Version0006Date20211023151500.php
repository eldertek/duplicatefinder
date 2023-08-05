<?php
namespace OCA\DuplicateFindx\Migration;

use Closure;
use OCP\DB\ISchemaWrapper;
use OCP\Migration\SimpleMigrationStep;
use OCP\Migration\IOutput;

class Version0006Date20211023151500 extends SimpleMigrationStep
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
        if ($schema->hasTable('duplicatefindx_finfo')) {
            $table = $schema->getTable('duplicatefindx_finfo');
            if (!$table->hasColumn('ignored')) {
                $table->addColumn('ignored', 'boolean', [
                'notnull' => false,
                'default' => false
                ]);
            }
            if (!$table->hasIndex('duplicatefindx_i_idx')) {
                $table->addIndex(['ignored'], 'duplicatefindx_i_idx');
            }
            return $schema;
        }
        return null;
    }
}
