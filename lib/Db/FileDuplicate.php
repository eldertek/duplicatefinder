<?php
namespace OCA\DuplicateFinder\Db;

/**
 * @method void setType(string $s)
 * @method void setHash(string $s)
 * @method void setFiles(array<string|FileInfo> $a)
 * @method string getType()
 * @method string getHash()
 * @method array<string|FileInfo> getFiles()
 */
class FileDuplicate extends EEntity
{
    /** @var string */
    protected $type;
    /** @var string|null */
    protected $hash;
    /** @var array<string|FileInfo> */
    protected $files = [];
    /** @var bool */
    protected $acknowledged = false;
    /** @var int|null */
    protected $userId;

    public function __construct(?string $hash = null, string $type = 'file_hash')
    {
        $this->addInternalProperty('files');

        if (!is_null($hash)) {
            $this->setHash($hash);
        }
        // Ensure type is always set and never null
        $this->setType($type ?: 'file_hash');
    }

    /**
     * Override setType to ensure it's never set to null
     *
     * @param string|null $type
     */
    public function setType(?string $type): void
    {
        parent::setType($type ?: 'file_hash');
    }

    /**
     * @param int $id
     * @param string|FileInfo $value
     */
    public function addDuplicate(int $id, $value): void
    {
        $this->files[$id] = $value;
    }

    public function removeDuplicate(int $id): void
    {
        unset($this->files[$id]);
    }

    public function clear(): void
    {
        $this->files = [];
    }

    /**
     * @return array<string|FileInfo>
     */
    public function getFiles(): array
    {
        return $this->files;
    }

    public function getCount(): int
    {
        return count($this->getFiles());
    }

    public function getCountForUser(string $user): int
    {
        $result = 0;
        foreach ($this->getFiles() as $u) {
            if ($u === $user) {
                $result += 1;
            }
        }
        unset($u);
        return $result;
    }

    /**
     * Get the value of the acknowledged property.
     *
     * @return bool
     */
    public function isAcknowledged(): bool
    {
        return $this->acknowledged;
    }

    /**
     * Set the value of the acknowledged property.
     *
     * @param bool $acknowledged
     */
    public function setAcknowledged(bool $acknowledged): void
    {
        $this->acknowledged = $acknowledged;
    }

    /**
     * Get the value of the userId property.
     *
     * @return int|null
     */
    public function getUserId(): ?int
    {
        return $this->userId;
    }

    /**
     * Set the value of the userId property.
     *
     * @param int|null $userId
     */
    public function setUserId(?int $userId): void
    {
        $this->userId = $userId;
    }
}