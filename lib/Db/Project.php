<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Db;

use JsonSerializable;
use OCP\AppFramework\Db\Entity;

/**
 * @method string getUserId()
 * @method void setUserId(string $userId)
 * @method string getName()
 * @method void setName(string $name)
 * @method string getCreatedAt()
 * @method void setCreatedAt(string $createdAt)
 * @method string|null getLastScan()
 * @method void setLastScan(string $lastScan)
 */
class Project extends Entity implements JsonSerializable
{
    protected string $userId = '';
    protected string $name = '';
    protected string $createdAt = '';
    protected ?string $lastScan = null;
    protected array $folders = [];

    public function __construct()
    {
        $this->addType('userId', 'string');
        $this->addType('name', 'string');
        $this->addType('createdAt', 'string');
        $this->addType('lastScan', 'string');
    }

    /**
     * Set the folders associated with this project
     *
     * @param array $folders Array of folder paths
     */
    public function setFolders(array $folders): void
    {
        $this->folders = $folders;
    }

    /**
     * Get the folders associated with this project
     *
     * @return array Array of folder paths
     */
    public function getFolders(): array
    {
        return $this->folders;
    }

    public function jsonSerialize(): array
    {
        return [
            'id' => $this->id,
            'userId' => $this->userId,
            'name' => $this->name,
            'createdAt' => $this->createdAt,
            'lastScan' => $this->lastScan,
            'folders' => $this->folders,
        ];
    }
}
