<?php

namespace OCA\DuplicateFinder\Exception;

class UnableToCalculateHash extends \Exception
{
    public function __construct(?string $path = null)
    {
        parent::__construct('Unable to calculate hash for '.$path, 0, null);
    }
}
