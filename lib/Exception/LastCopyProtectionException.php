<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Exception;

use Exception;

/**
 * Thrown when a deletion would remove the last remaining copy of a duplicate group.
 */
class LastCopyProtectionException extends Exception
{
}
