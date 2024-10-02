<?php
namespace OCA\DuplicateFinder\Service;

use OCP\IConfig;
use Psr\Log\LoggerInterface;
use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Exception\UnableToParseException;

class ConfigService
{
    /** @var IConfig */
    private $config;
    /** @var LoggerInterface */
    private $logger;

    /** @var int|null */
    private $findJobInterval = null;
    /** @var int|null */
    private $cleanupJobInterval = null;
    /** @var bool|null */
    private $filesystemEventsDisabled = null;
    /** @var bool|null */
    private $mountedFilesIgnored = null;
    /** @var string|null */
    private $installedVersion = null;

    public function __construct(
        IConfig $config,
        LoggerInterface $logger
    ) {
        $this->config = $config;
        $this->logger = $logger;
    }

    private function getIntVal(string $key, int $defaultValue) : int
    {
        return intval($this->config->getAppValue(Application::ID, $key, ''.$defaultValue));
    }

    private function getBoolVal(string $key, bool $defaultValue) : bool
    {
        if ($defaultValue) {
            $value = $this->config->getAppValue(Application::ID, $key, 'true');
        } else {
            $value = $this->config->getAppValue(Application::ID, $key, 'false');
        }
        return $value === 'true';
    }

    private function setIntVal(string $key, int $defaultValue) : void
    {
        $this->config->setAppValue(Application::ID, $key, ''.$defaultValue);
    }

    private function setBoolVal(string $key, bool $defaultValue) : void
    {
        if ($defaultValue) {
            $this->config->setAppValue(Application::ID, $key, 'true');
        } else {
            $this->config->setAppValue(Application::ID, $key, 'false');
        }
    }

    public function getUserValue(string $userId, string $key, string $defaultValue) : string
    {
        return $this->config->getUserValue($userId, Application::ID, $key, $defaultValue);
    }

    public function setUserValue(string $userId, string $key, string $value) : void
    {
        $this->config->setUserValue($userId, Application::ID, $key, $value);
    }

    public function getFindJobInterval() : int
    {
        if ($this->findJobInterval === null) {
            $this->findJobInterval = $this->getIntVal('backgroundjob_interval_find', 60*60*24*5);
        }
        return $this->findJobInterval;
    }

    public function getCleanupJobInterval() : int
    {
        if ($this->cleanupJobInterval === null) {
            $this->cleanupJobInterval = $this->getIntVal('backgroundjob_interval_cleanup', 60*60*24*2);
        }
        return $this->cleanupJobInterval;
    }

    public function areFilesytemEventsDisabled():bool
    {
        if ($this->filesystemEventsDisabled === null) {
            $this->filesystemEventsDisabled = $this->getBoolVal('disable_filesystem_events', false);
        }
        return $this->filesystemEventsDisabled;
    }

    public function areMountedFilesIgnored() : bool
    {
        if ($this->mountedFilesIgnored === null) {
            $this->mountedFilesIgnored = $this->getBoolVal('ignore_mounted_files', false);
        }
        return $this->mountedFilesIgnored;
    }

    public function getInstalledVersion() : string
    {
        if ($this->installedVersion === null) {
            $this->installedVersion = $this->config->getAppValue(Application::ID, 'installed_version', '0.0.0');
        }
        return $this->installedVersion;
    }

    public function setFindJobInterval(int $value) : void
    {
        $this->setIntVal('backgroundjob_interval_find', $value);
        $this->findJobInterval = $value;
    }

    public function setCleanupJobInterval(int $value) : void
    {
        $this->setIntVal('backgroundjob_interval_cleanup', $value);
        $this->cleanupJobInterval = $value;
    }

    public function setFilesytemEventsDisabled(bool $value):void
    {
        $this->setBoolVal('disable_filesystem_events', $value);
        $this->filesystemEventsDisabled = $value;
    }

    public function setMountedFilesIgnored(bool $value) : void
    {
        $this->setBoolVal('ignore_mounted_files', $value);
        $this->mountedFilesIgnored = $value;
    }
}
