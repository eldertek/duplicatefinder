<?php

namespace OCA\DuplicateFinder\Db;

/**
 * @method void setOwner(string $s)
 * @method void setPath(string $s)
 * @method void setPathHash(string $s)
 * @method void setFileHash(?string $s)
 * @method void setImageHash(string $s)
 * @method void setUpdatedAt(int|\DateTime $d)
 * @method void setNodeId(int $i)
 * @method void setMimetype(string $s)
 * @method void setSize(int $i)
 * @method void setIgnored(bool $b)
 * @method void setIsInOriginFolder(bool $b)
 * @method string getOwner()
 * @method string getPath()
 * @method string getPathHash()
 * @method ?string getFileHash()
 * @method string getImageHash()
 * @method \DateTime getUpdatedAt()
 * @method int getNodeId()
 * @method string getMimetype()
 * @method int getSize()
 * @method bool isIgnored()
 * @method bool isInOriginFolder()
 */
class FileInfo extends EEntity
{
    /** @var string */
    protected $owner;
    /** @var string */
    protected $path;
    /** @var string */
    protected $pathHash;
    /** @var string */
    protected $fileHash;
    /** @var string */
    protected $imageHash;
    /** @var int */
    protected $updatedAt;
    /** @var int */
    protected $nodeId;
    /** @var string */
    protected $mimetype;
    /** @var int */
    protected $size;
    /** @var bool */
    protected $ignored;
    /** @var bool */
    protected $isInOriginFolder;

    public function __construct(?string $path = null, ?string $owner = null)
    {
        $this->addInternalType('updatedAt', 'date');
        $this->addInternalProperty('nodeId');
        $this->addType('size', 'integer');
        $this->addType('ignored', 'boolean');
        $this->addType('isInOriginFolder', 'boolean');
        $this->isInOriginFolder = false;

        if (!is_null($path)) {
            $this->setPath($path);
        }
        if (!is_null($owner)) {
            $this->setOwner($owner);
        }
    }

    public function setPath(string $path): void
    {
        // SHA1 because we need a function to short the path and not be cryptographically secure
        $this->setPathHash(sha1($path));
        parent::setPath($path);
    }
}
