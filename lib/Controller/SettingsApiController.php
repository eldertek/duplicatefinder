<?php
namespace OCA\DuplicateFinder\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use OCA\DuplicateFinder\Service\ConfigService;

class SettingsApiController extends AbstractAPIController
{
    /** @var ConfigService */
    private $configService;

    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        ConfigService $configService,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->configService = $configService;
    }

    /**
     * @return array<mixed>
     */
    private function getConfigArray(): array
    {
        return [
            'backgroundjob_interval_find' => $this->configService->getFindJobInterval(),
            'backgroundjob_interval_cleanup' => $this->configService->getCleanupJobInterval(),
            'disable_filesystem_events' => $this->configService->areFilesytemEventsDisabled(),
            'ignore_mounted_files' => $this->configService->areMountedFilesIgnored(),
            'installed_version' => $this->configService->getInstalledVersion()
        ];
    }

    public function list(): DataResponse
    {
        return new DataResponse(['status' => 'success', 'data' => $this->getConfigArray()]);
    }

    /**
     * @param string $key
     * @param mixed $value
     */
    public function save(string $key, $value): DataResponse
    {
        $configKeys = [
            'backgroundjob_interval_find' => 'setFindJobInterval',
            'backgroundjob_interval_cleanup' => 'setCleanupJobInterval',
            'disable_filesystem_events' => 'setFilesytemEventsDisabled',
            'ignore_mounted_files' => 'setMountedFilesIgnored'
        ];

        if (!array_key_exists($key, $configKeys)) {
            return new DataResponse(['status' => 'error', 'message' => 'Unknown config key']);
        }

        $method = $configKeys[$key];

        if ($method === 'setMountedFilesIgnored' || $method === 'setFilesytemEventsDisabled') {
            $value = filter_var($value, FILTER_VALIDATE_BOOLEAN);
        }

        try {
            $this->configService->$method($value);
        } catch (\Exception $e) {
            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }

        return new DataResponse(['status' => 'success', 'data' => $this->getConfigArray()]);
    }
}