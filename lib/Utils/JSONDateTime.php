<?php

namespace OCA\DuplicateFinder\Utils;

class JSONDateTime extends \DateTime implements \JsonSerializable
{
    #[\ReturnTypeWillChange]
    public function jsonSerialize(): string
    {
        return $this->format(\DateTimeInterface::ATOM);
    }
}
