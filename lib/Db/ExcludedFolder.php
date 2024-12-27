<?php

namespace OCA\DuplicateFinder\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getFolderPath()
 * @method void setFolderPath(string $path)
 * @method \DateTime getCreatedAt()
 * @method void setCreatedAt(\DateTime $datetime)
 */
class ExcludedFolder extends Entity implements JsonSerializable {
    protected $userId;
    protected $folderPath;
    protected $createdAt;

    public function __construct() {
        $this->addType('id', 'integer');
        $this->addType('createdAt', 'datetime');
    }

    public function jsonSerialize(): array {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'folderPath' => $this->folderPath,
            'createdAt' => $this->createdAt,
        ];
    }
} 