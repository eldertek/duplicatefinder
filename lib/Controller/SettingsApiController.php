<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\ConfigService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class SettingsApiController extends AbstractAPIController
{
    /** @var ConfigService */
    private $configService;

    public function __construct(
        string $appName,
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
            'installed_version' => $this->configService->getInstalledVersion(),
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
            'ignore_mounted_files' => 'setMountedFilesIgnored',
        ];

        if (!array_key_exists($key, $configKeys)) {
            return new DataResponse(
                ['status' => 'error', 'message' => 'Unknown config key'],
                Http::STATUS_BAD_REQUEST
            );
        }

        $method = $configKeys[$key];

        if ($method === 'setMountedFilesIgnored' || $method === 'setFilesytemEventsDisabled') {
            $parsedBool = filter_var($value, FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($parsedBool === null) {
                return new DataResponse(
                    ['status' => 'error', 'message' => 'Invalid boolean value'],
                    Http::STATUS_BAD_REQUEST
                );
            }
            $value = $parsedBool;
        } else {
            if (is_bool($value)) {
                return new DataResponse(
                    ['status' => 'error', 'message' => 'Invalid job interval'],
                    Http::STATUS_BAD_REQUEST
                );
            }
            $parsedInt = filter_var(
                $value,
                FILTER_VALIDATE_INT,
                ['options' => ['min_range' => ConfigService::MIN_JOB_INTERVAL_SECONDS]]
            );
            if ($parsedInt === false) {
                return new DataResponse(
                    [
                        'status' => 'error',
                        'message' => sprintf(
                            'Invalid job interval: must be an integer >= %d',
                            ConfigService::MIN_JOB_INTERVAL_SECONDS
                        ),
                    ],
                    Http::STATUS_BAD_REQUEST
                );
            }
            $value = $parsedInt;
        }

        try {
            $this->configService->$method($value);
        } catch (\InvalidArgumentException $e) {
            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
        } catch (\Throwable $e) {
            $this->logger->error('Failed to save setting {key}', [
                'app' => Application::ID,
                'key' => $key,
                'exception' => $e,
            ]);

            return new DataResponse(
                ['status' => 'error', 'message' => 'Failed to save configuration'],
                Http::STATUS_INTERNAL_SERVER_ERROR
            );
        }

        return new DataResponse(['status' => 'success', 'data' => $this->getConfigArray()]);
    }
}
