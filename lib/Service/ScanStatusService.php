<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\AppInfo\Application;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IConfig;
use OCP\IDBConnection;
use Psr\Log\LoggerInterface;

class ScanStatusService
{
    private const USER_STATUS_KEY = 'scan_status_v1';
    private const GLOBAL_STATUS_KEY = 'global_scan_status_v1';
    private const STALE_SECONDS = 300;

    private IDBConnection $connection;
    private IConfig $config;
    private LoggerInterface $logger;

    public function __construct(
        IDBConnection $connection,
        IConfig $config,
        LoggerInterface $logger
    ) {
        $this->connection = $connection;
        $this->config = $config;
        $this->logger = $logger;
    }

    /**
     * Estimate the number of scannable files in the user's home storage using an indexed filecache count.
     * Falls back to 0 when the storage is not initialized yet or in unit-test environments.
     */
    public function countUserFiles(string $user, string $relativePath = ''): int
    {
        try {
            $storageQb = $this->connection->getQueryBuilder();
            $storageQb->select('numeric_id')
                ->from('storages')
                ->where($storageQb->expr()->eq(
                    'id',
                    $storageQb->createNamedParameter('home::' . $user, IQueryBuilder::PARAM_STR)
                ));
            $storageResult = $storageQb->executeQuery();
            $storageRow = $storageResult->fetch();
            $storageResult->closeCursor();

            if (!is_array($storageRow) || !isset($storageRow['numeric_id'])) {
                return 0;
            }
            $storageId = (int)$storageRow['numeric_id'];

            $mimeQb = $this->connection->getQueryBuilder();
            $mimeQb->select('id')
                ->from('mimetypes')
                ->where($mimeQb->expr()->eq(
                    'mimetype',
                    $mimeQb->createNamedParameter('httpd/unix-directory', IQueryBuilder::PARAM_STR)
                ));
            $mimeResult = $mimeQb->executeQuery();
            $mimeRow = $mimeResult->fetch();
            $mimeResult->closeCursor();
            $dirMimeId = (is_array($mimeRow) && isset($mimeRow['id'])) ? (int)$mimeRow['id'] : 2;

            $trimmed = trim($relativePath, '/');
            $basePath = $trimmed === '' ? 'files' : 'files/' . $trimmed;
            $escapedBase = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $basePath);

            $countQb = $this->connection->getQueryBuilder();
            $countQb->selectAlias($countQb->createFunction('COUNT(*)'), 'cnt')
                ->from('filecache')
                ->where($countQb->expr()->eq(
                    'storage',
                    $countQb->createNamedParameter($storageId, IQueryBuilder::PARAM_INT)
                ))
                ->andWhere($countQb->expr()->neq(
                    'mimetype',
                    $countQb->createNamedParameter($dirMimeId, IQueryBuilder::PARAM_INT)
                ))
                ->andWhere($countQb->expr()->orX(
                    $countQb->expr()->eq(
                        'path',
                        $countQb->createNamedParameter($basePath, IQueryBuilder::PARAM_STR)
                    ),
                    $countQb->expr()->like(
                        'path',
                        $countQb->createNamedParameter($escapedBase . '/%', IQueryBuilder::PARAM_STR)
                    )
                ));
            $countResult = $countQb->executeQuery();
            $countRow = $countResult->fetch();
            $countResult->closeCursor();

            return (is_array($countRow) && isset($countRow['cnt'])) ? max(0, (int)$countRow['cnt']) : 0;
        } catch (\Throwable $e) {
            $this->logger->debug('Could not estimate user file count before scan: ' . $e->getMessage(), [
                'app' => Application::ID,
                'user' => $user,
            ]);

            return 0;
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function getStatus(string $user): array
    {
        $now = time();
        $raw = $this->config->getUserValue($user, Application::ID, self::USER_STATUS_KEY, '');
        $decoded = $raw !== '' ? json_decode($raw, true) : null;
        $state = $this->normalizeState(is_array($decoded) ? $decoded : []);

        if ($state['running'] && $state['updatedAt'] !== null && ($now - $state['updatedAt']) > self::STALE_SECONDS) {
            $state['running'] = false;
            $state['indeterminate'] = false;
            $state['etaSeconds'] = null;
        }

        if ($state['running'] && !$state['indeterminate'] && $state['startedAt'] !== null) {
            $state['etaSeconds'] = $this->computeEtaSeconds(
                $state['scannedFiles'],
                $state['totalFiles'],
                $state['startedAt'],
                $now
            );
        }

        if (!$state['running'] && $this->isGlobalScanActive($now)) {
            $global = $this->readGlobalState();
            $globalStartedAt = isset($global['startedAt']) ? (int)$global['startedAt'] : null;
            // Only mark indeterminate running if the user's own scan has not already finished during this global run
            if ($globalStartedAt === null || $state['completedAt'] === null || $state['completedAt'] < $globalStartedAt) {
                $state['running'] = true;
                $state['indeterminate'] = true;
                $state['scannedFiles'] = 0;
                $state['totalFiles'] = 0;
                $state['percentage'] = 0;
                $state['startedAt'] = $globalStartedAt ?? $now;
                $state['etaSeconds'] = null;
            }
        }

        return $state;
    }

    /**
     * @return array<string, mixed>
     */
    public function startScan(
        string $user,
        int $totalFiles,
        ?int $prevCompletedSeq = null,
        ?int $prevCompletedAt = null
    ): array {
        $now = time();
        if ($prevCompletedSeq === null || $prevCompletedAt === null) {
            $existing = $this->getStatus($user);
            if ($prevCompletedSeq === null) {
                $prevCompletedSeq = (int)$existing['completedSeq'];
            }
            if ($prevCompletedAt === null && $existing['completedAt'] !== null) {
                $prevCompletedAt = (int)$existing['completedAt'];
            }
        }

        $safeTotal = max(0, $totalFiles);
        $state = [
            'running' => true,
            'indeterminate' => $safeTotal === 0,
            'scannedFiles' => 0,
            'totalFiles' => $safeTotal,
            'percentage' => 0,
            'startedAt' => $now,
            'updatedAt' => $now,
            'completedAt' => $prevCompletedAt,
            'completedSeq' => max(0, $prevCompletedSeq),
            'etaSeconds' => null,
        ];

        $this->writeUserState($user, $state);
        $this->touchGlobalScanIfActive($now);

        return $state;
    }

    /**
     * @return array<string, mixed>
     */
    public function updateProgress(
        string $user,
        int $scannedFiles,
        int $totalFiles,
        int $startedAt,
        int $prevCompletedSeq = 0,
        ?int $prevCompletedAt = null
    ): array {
        $now = time();
        $safeScanned = max(0, $scannedFiles);
        $effectiveTotal = max(0, $totalFiles, $safeScanned);
        $percentage = $effectiveTotal > 0
            ? min(99, (int)floor(($safeScanned * 100) / $effectiveTotal))
            : 0;

        $state = [
            'running' => true,
            'indeterminate' => $effectiveTotal === 0,
            'scannedFiles' => $safeScanned,
            'totalFiles' => $effectiveTotal,
            'percentage' => $percentage,
            'startedAt' => $startedAt,
            'updatedAt' => $now,
            'completedAt' => $prevCompletedAt,
            'completedSeq' => max(0, $prevCompletedSeq),
            'etaSeconds' => $this->computeEtaSeconds($safeScanned, $effectiveTotal, $startedAt, $now),
        ];

        $this->writeUserState($user, $state);
        $this->touchGlobalScanIfActive($now);

        return $state;
    }

    /**
     * @return array<string, mixed>
     */
    public function finishScan(
        string $user,
        int $scannedFiles,
        int $totalFiles,
        int $startedAt,
        int $prevCompletedSeq = 0
    ): array {
        $now = time();
        $safeScanned = max(0, $scannedFiles);
        $effectiveTotal = max(0, $totalFiles, $safeScanned);
        $nextSeq = max($prevCompletedSeq + 1, (int)round(microtime(true) * 1000));

        $state = [
            'running' => false,
            'indeterminate' => false,
            'scannedFiles' => $safeScanned,
            'totalFiles' => $effectiveTotal,
            'percentage' => 100,
            'startedAt' => $startedAt,
            'updatedAt' => $now,
            'completedAt' => $now,
            'completedSeq' => $nextSeq,
            'etaSeconds' => 0,
        ];

        $this->writeUserState($user, $state);
        $this->touchGlobalScanIfActive($now);

        return $state;
    }

    public function startGlobalScan(): void
    {
        $now = time();
        $payload = json_encode([
            'running' => true,
            'startedAt' => $now,
            'updatedAt' => $now,
        ]);
        if ($payload !== false) {
            $this->config->setAppValue(Application::ID, self::GLOBAL_STATUS_KEY, $payload);
        }
    }

    public function finishGlobalScan(): void
    {
        $now = time();
        $payload = json_encode([
            'running' => false,
            'startedAt' => null,
            'updatedAt' => $now,
            'completedAt' => $now,
        ]);
        if ($payload !== false) {
            $this->config->setAppValue(Application::ID, self::GLOBAL_STATUS_KEY, $payload);
        }
    }

    private function touchGlobalScanIfActive(int $now): void
    {
        $global = $this->readGlobalState();
        if (!empty($global['running'])) {
            $global['updatedAt'] = $now;
            $payload = json_encode($global);
            if ($payload !== false) {
                $this->config->setAppValue(Application::ID, self::GLOBAL_STATUS_KEY, $payload);
            }
        }
    }

    private function isGlobalScanActive(int $now): bool
    {
        $global = $this->readGlobalState();
        if (empty($global['running'])) {
            return false;
        }
        $updatedAt = isset($global['updatedAt']) ? (int)$global['updatedAt'] : 0;

        return $updatedAt > 0 && ($now - $updatedAt) <= self::STALE_SECONDS;
    }

    /**
     * @return array<string, mixed>
     */
    private function readGlobalState(): array
    {
        $raw = $this->config->getAppValue(Application::ID, self::GLOBAL_STATUS_KEY, '');
        if ($raw === '') {
            return [];
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, mixed> $state
     */
    private function writeUserState(string $user, array $state): void
    {
        try {
            $payload = json_encode($state);
            if ($payload !== false) {
                $this->config->setUserValue($user, Application::ID, self::USER_STATUS_KEY, $payload);
            }
        } catch (\Throwable $e) {
            $this->logger->debug('Could not persist scan status: ' . $e->getMessage(), [
                'app' => Application::ID,
                'user' => $user,
            ]);
        }
    }

    /**
     * @param array<string, mixed> $raw
     * @return array<string, mixed>
     */
    private function normalizeState(array $raw): array
    {
        return [
            'running' => !empty($raw['running']),
            'indeterminate' => !empty($raw['indeterminate']),
            'scannedFiles' => isset($raw['scannedFiles']) ? max(0, (int)$raw['scannedFiles']) : 0,
            'totalFiles' => isset($raw['totalFiles']) ? max(0, (int)$raw['totalFiles']) : 0,
            'percentage' => isset($raw['percentage']) ? max(0, min(100, (int)$raw['percentage'])) : 0,
            'startedAt' => isset($raw['startedAt']) && $raw['startedAt'] !== null ? (int)$raw['startedAt'] : null,
            'updatedAt' => isset($raw['updatedAt']) && $raw['updatedAt'] !== null ? (int)$raw['updatedAt'] : null,
            'completedAt' => isset($raw['completedAt']) && $raw['completedAt'] !== null ? (int)$raw['completedAt'] : null,
            'completedSeq' => isset($raw['completedSeq']) ? max(0, (int)$raw['completedSeq']) : 0,
            'etaSeconds' => isset($raw['etaSeconds']) && $raw['etaSeconds'] !== null ? max(0, (int)$raw['etaSeconds']) : null,
        ];
    }

    private function computeEtaSeconds(int $scannedFiles, int $totalFiles, int $startedAt, int $now): ?int
    {
        $elapsed = $now - $startedAt;
        if ($scannedFiles <= 0 || $totalFiles <= $scannedFiles || $elapsed < 2) {
            return null;
        }
        $rate = $scannedFiles / $elapsed;
        if ($rate <= 0.0) {
            return null;
        }

        return max(1, (int)ceil(($totalFiles - $scannedFiles) / $rate));
    }
}
