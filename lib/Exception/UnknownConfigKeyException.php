<?php

namespace OCA\DuplicateFindx\Exception;

use Throwable;

class UnknownConfigKeyException extends \Exception
{
    public function __construct(?string $key = null)
    {
        parent::__construct('The config key '.$key.' is unknown', 1, null);
    }
}
