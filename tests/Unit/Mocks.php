<?php

namespace OCA\DuplicateFinder\Tests\Unit;

// Mocks pour les interfaces Nextcloud
interface IRootFolder {}
interface IEventDispatcher {}
interface ILockingProvider {}
interface IDBConnection {}
interface IUser {
    public function getUID();
}
interface Node {
    public function getType();
    public function isMounted();
    public function getSize();
    public function getMimetype();
    public function getMtime();
    public function getUploadTime();
    public function getOwner();
    public function getParent();
    public function getId();
    public function getPath();
    public function delete();
    public function nodeExists($path);
    public function get($path);
    public function getInternalPath();
    public function getStorage();
}

// Namespace OCP\Files
namespace OCP\Files;

use OCA\DuplicateFinder\Tests\Unit\IRootFolder as BaseIRootFolder;
use OCA\DuplicateFinder\Tests\Unit\Node as BaseNode;

interface IRootFolder extends BaseIRootFolder {
    public function getUserFolder($userId);
    public function get($path);
}

interface Node extends BaseNode {}

class NotFoundException extends \Exception {}

class FileInfo {
    const TYPE_FILE = 'file';
    const TYPE_FOLDER = 'folder';
}

// Namespace OCP\Lock
namespace OCP\Lock;

interface ILockingProvider {
    const LOCK_SHARED = 1;
    const LOCK_EXCLUSIVE = 2;
    
    public function releaseAll($path, $type);
    public function isLocked($path, $type);
}

class LockedException extends \Exception {
    public function getPath();
}

// Namespace OCP\EventDispatcher
namespace OCP\EventDispatcher;

use OCA\DuplicateFinder\Tests\Unit\IEventDispatcher as BaseIEventDispatcher;

interface IEventDispatcher extends BaseIEventDispatcher {
    public function dispatchTyped($event);
}

// Namespace OCP\Files\Storage
namespace OCP\Files\Storage;

interface IStorage {
    public function hash($type, $path);
}

// Namespace OCP
namespace OCP;

use OCA\DuplicateFinder\Tests\Unit\IDBConnection as BaseIDBConnection;
use OCA\DuplicateFinder\Tests\Unit\IUser as BaseIUser;

interface IDBConnection extends BaseIDBConnection {}
interface IUser extends BaseIUser {}
