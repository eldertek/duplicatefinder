<?php
namespace OCA\DuplicateFindx\Utils;

class JSONDateTime extends \DateTime implements \JsonSerializable
{
    public function jsonSerialize()
    {
        return $this->format(static::ISO8601);
    }
}
