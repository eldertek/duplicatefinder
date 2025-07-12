<?php

/**
 * Psalm stubs for Nextcloud classes
 */

namespace OC {
    class Util
    {
        public static function getVersion(): array
        {
        }
    }
}

namespace OCP {
    interface ILogger
    {
        public function debug(string $message, array $context = []): void;
        public function info(string $message, array $context = []): void;
        public function warning(string $message, array $context = []): void;
        public function error(string $message, array $context = []): void;
    }

    interface IConfig
    {
        public function getAppValue(string $app, string $key, string $default = ''): string;
        public function setAppValue(string $app, string $key, string $value): void;
        public function getUserValue(string $userId, string $app, string $key, string $default = ''): string;
        public function setUserValue(string $userId, string $app, string $key, string $value): void;
    }

    interface IUserManager
    {
        public function get(string $uid): ?IUser;
        public function userExists(string $uid): bool;
        public function callForSeenUsers(callable $callback): void;
        public function callForAllUsers(callable $callback): void;
    }

    interface IUser
    {
        public function getUID(): string;
        public function getDisplayName(): string;
        public function getHome(): string;
    }

    interface IDBConnection extends \Doctrine\DBAL\Connection
    {
        public function getQueryBuilder(): \OCP\DB\QueryBuilder\IQueryBuilder;
    }
}

namespace OCP\Encryption {
    interface IManager
    {
        public function isEnabled(): bool;
    }
}

namespace OCP\Files {
    interface Node
    {
        public function getId(): int;
        public function getPath(): string;
        public function getName(): string;
        public function getMTime(): int;
        public function getSize(): int;
        public function getMimetype(): string;
        public function getContent(): string;
        public function delete(): void;
    }

    interface File extends Node
    {
        public function fopen(string $mode);
    }

    interface Folder extends Node
    {
        /** @return Node[] */
        public function getDirectoryListing(): array;
        public function get(string $path): Node;
    }

    interface IRootFolder
    {
        public function getUserFolder(string $userId): Folder;
    }
}

namespace OCP\AppFramework\Db {
    abstract class Entity
    {
        public function getId(): ?int
        {
        }
        public function setId(int $id): void
        {
        }
    }

    abstract class QBMapper
    {
        public function insert(Entity $entity): Entity
        {
        }
        public function update(Entity $entity): Entity
        {
        }
        public function delete(Entity $entity): Entity
        {
        }
        public function find($id): Entity
        {
        }
    }

    class DoesNotExistException extends \Exception
    {
    }
    class MultipleObjectsReturnedException extends \Exception
    {
    }
}

namespace OCP\DB\QueryBuilder {
    interface IQueryBuilder
    {
        public function select($select = null): self;
        public function from(string $from, ?string $alias = null): self;
        public function where($where): self;
        public function setParameter($key, $value, $type = null): self;
        public function execute();
        public function executeQuery();
        public function executeStatement(): int;
    }
}

namespace OCP {
    interface IRequest
    {
        public function getParam(string $key, $default = null);
    }
}

namespace OCP\AppFramework {
    use OCP\IRequest;

    class App
    {
        public function __construct(string $appName, array $urlParams = [])
        {
        }
        public function getContainer()
        {
        }
    }

    abstract class Controller
    {
        public function __construct(string $appName, IRequest $request)
        {
        }
    }

    abstract class ApiController extends Controller
    {
        public function __construct(string $appName, IRequest $request)
        {
        }
    }
}

namespace OCP\AppFramework\Bootstrap {
    interface IBootstrap
    {
        public function register(\OCP\AppFramework\Bootstrap\IRegistrationContext $context): void;
        public function boot(\OCP\AppFramework\Bootstrap\IBootContext $context): void;
    }

    interface IRegistrationContext
    {
    }
    interface IBootContext
    {
    }
}
