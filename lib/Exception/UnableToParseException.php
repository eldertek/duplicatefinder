<?php

namespace OCA\DuplicateFinder\Exception;

class UnableToParseException extends \Exception
{
    public function __construct(?string $subject = null, ?\Throwable $previous = null)
    {
        parent::__construct('Unable to parse '.$subject, 1, $previous);
    }
}
