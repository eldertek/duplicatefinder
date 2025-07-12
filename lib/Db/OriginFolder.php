<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getFolderPath()
 * @method void setFolderPath(string $folderPath)
 * @method string getCreatedAt()
 * @method void setCreatedAt(string $createdAt)
 */
class OriginFolder extends Entity implements JsonSerializable
{
    protected string $userId = '';
    protected string $folderPath = '';
    protected string $createdAt = '';

    public function __construct()
    {
        $this->addType('userId', 'string');
        $this->addType('folderPath', 'string');
        $this->addType('createdAt', 'string');
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'folderPath' => $this->folderPath,
            'createdAt' => $this->createdAt,
        ];
    }
}
