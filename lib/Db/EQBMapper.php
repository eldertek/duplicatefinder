<?php

namespace OCA\DuplicateFinder\Db;

use OCP\AppFramework\Db\Entity;
use OCP\AppFramework\Db\QBMapper;
use OCP\DB\QueryBuilder\IQueryBuilder;

/**
 * @template T of EEntity
 * @template-extends QBMapper<T>
 */
abstract class EQBMapper extends QBMapper
{
    public function delete(Entity $entity): Entity
    {
        $entity = parent::delete($entity);
        $this->clearRelationalFields($entity);

        return $entity;
    }

    public function insert(Entity $entity): Entity
    {
        $entity = parent::insert($entity);
        $this->saveRelationalFields($entity);

        return $entity;
    }

    public function update(Entity $entity): Entity
    {
        $entity = parent::update($entity);
        $this->saveRelationalFields($entity);

        return $entity;
    }

    /**
     * @param array<mixed> $row
     * @return T
     */
    protected function mapRowToEntity(array $row): Entity
    {
        $entity = parent::mapRowToEntity($row);

        return $this->loadRelationalFields($entity);
    }

    /**
     * @param T $entity
     * @return T
     */
    protected function loadRelationalFields($entity)
    {
        $idType = $this->getParameterTypeForProperty($entity, 'id');
        foreach ($entity->getRelationalFields() as $field => $v) {
            $qb = $this->db->getQueryBuilder();
            $qb->select('*')
                ->from($this->getTableName().'_'.substr($field, 0, 1))
            ->where(
                $qb->expr()->eq('id', $qb->createNamedParameter($entity->getId(), $idType))
            );
            $qb = $qb->executeQuery();

            $values = [];
            if (!is_int($qb)) {
                foreach ($qb->fetchAll() as $row) {
                    $values[$row['rid']] = $row['value'];
                }
                unset($row);
                $setter = 'set' . ucfirst($field);
                $entity->$setter($values);
            }
            if (!is_int($qb)) {
                $qb->closeCursor();
            }
        }
        unset($v);
        $entity->resetUpdatedRelationalFields();

        return $entity;
    }


    /**
     * @param T $entity
     * @return void
     */
    protected function clearRelationalFields($entity): void
    {
        if (!($entity instanceof EEntity)) {
            return;
        }
        $idType = $this->getParameterTypeForProperty($entity, 'id');
        foreach ($entity->getRelationalFields() as $field => $v) {
            $qb = $this->db->getQueryBuilder();
            $qb->delete($this->getTableName().'_'.substr($field, 0, 1))
            ->where(
                $qb->expr()->eq('id', $qb->createNamedParameter($entity->getId(), $idType))
            );
            $qb = $qb->executeStatement();
            if (!is_int($qb)) {
                $qb->closeCursor();
            }
        }
        unset($v);
    }

    /**
     * @param T $entity
     * @return void
     */
    protected function saveRelationalFields(Entity $entity): void
    {
        if (!($entity instanceof EEntity)) {
            return;
        }
        $idType = $this->getParameterTypeForProperty($entity, 'id');
        $updatedRelations = $entity->getUpdatedRelationalFields();
        foreach ($entity->getRelationalFields() as $field => $v) {
            foreach ($updatedRelations[$field] as $key => $value) {
                $qb = $this->db->getQueryBuilder();
                if ($value !== null) {
                    $qb->insert($this->getTableName().'_'.substr($field, 0, 1))
                    ->setValue('id', $qb->createNamedParameter($entity->getId(), $idType))
                    ->setValue('rid', $qb->createNamedParameter($key, IQueryBuilder::PARAM_INT))
                    ->setValue('value', $qb->createNamedParameter($value, IQueryBuilder::PARAM_STR));
                } else {
                    $qb->delete($this->getTableName().'_'.substr($field, 0, 1))
                    ->where(
                        $qb->expr()->eq('id', $qb->createNamedParameter($entity->getId(), $idType)),
                        $qb->expr()->eq('rid', $qb->createNamedParameter($key, IQueryBuilder::PARAM_INT))
                    );
                }
                $qb = $qb->executeStatement();
                if (!is_int($qb)) {
                    $qb->closeCursor();
                }
            }
            unset($value);
        }
        unset($v);
    }

    private function validateIdentifier(string $identifier, string $kind): string
    {
        if (preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $identifier) !== 1) {
            throw new \InvalidArgumentException('Invalid SQL ' . $kind . ' identifier: ' . $identifier);
        }

        return $identifier;
    }

    /**
     * @param string $field
     * @param mixed $value
     * @param int $type
     * @return int
     */
    protected function countBy(string $field, $value, int $type = IQueryBuilder::PARAM_STR): int
    {
        $safeField = $this->validateIdentifier($field, 'column');
        $qb = $this->db->getQueryBuilder();
        $qb->select($qb->func()->count('id'))
            ->from($this->getTableName())
            ->where(
                $qb->expr()->eq($safeField, $qb->createNamedParameter($value, $type))
            );
        $result = $qb->executeQuery();
        if (!is_int($result)) {
            $count = (int)$result->fetchOne();
            $result->closeCursor();

            return $count;
        }

        return 0;
    }

    public function clear(?string $table = null): void
    {
        $targetTable = $table === null
            ? $this->getTableName()
            : $this->validateIdentifier($table, 'table');
        $qb = $this->db->getQueryBuilder();
        $result = $qb->delete($targetTable)->executeStatement();
        if (!is_int($result)) {
            $result->closeCursor();
        }
    }
}
