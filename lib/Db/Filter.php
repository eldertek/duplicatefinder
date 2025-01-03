<?php

namespace OCA\DuplicateFinder\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

class Filter extends Entity implements JsonSerializable {
    protected $type;
    protected $value;
    protected $userId;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('type', 'string');
        $this->addType('value', 'string');
        $this->addType('userId', 'string');
        $this->addType('createdAt', 'integer');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'value' => $this->value,
            'userId' => $this->userId,
            'createdAt' => $this->createdAt,
        ];
    }
} 