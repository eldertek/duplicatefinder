<?php

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Service\OriginFolderService;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

class DuplicateApiController extends AbstractAPIController
{
    /** @var FileDuplicateService */
    private $fileDuplicateService;
    /** @var FileDuplicateMapper */
    private $fileDuplicateMapper;
    /** @var FileInfoService */
    private $fileInfoService;
    /** @var IUserManager */
    private $userManager;
    /** @var LoggerInterface */
    protected $logger;
    /** @var OriginFolderService */
    private $originFolderService;

    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        FileDuplicateService $fileDuplicateService,
        FileInfoService $fileInfoService,
        FileDuplicateMapper $fileDuplidateMapper,
        IUserManager $userManager,
        LoggerInterface $logger,
        OriginFolderService $originFolderService
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->userManager = $userManager;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->logger = $logger;
        $this->fileDuplicateMapper = $fileDuplidateMapper;
        $this->originFolderService = $originFolderService;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function list(
        int $page = 1,
        int $limit = 30,
        string $type = 'unacknowledged',
        bool $onlyNonProtected = false,
        string $sortBy = 'default',
        int $minSize = 0
    ): DataResponse {
        try {
            $safePage = max(1, $page);
            $safeLimit = max(1, $limit);
            $safeMinSize = max(0, $minSize);

            $isCustomOrder = $sortBy === 'size-desc' || $sortBy === 'size-asc';
            $orderBy = [['hash'], ['type']];
            if ($sortBy === 'size-desc') {
                $orderBy = [['size', 'DESC']];
            } elseif ($sortBy === 'size-asc') {
                $orderBy = [['size', 'ASC']];
            }

            if ($safeMinSize > 0) {
                $duplicates = $this->fileDuplicateService->findAll(
                    $type,
                    $this->getUserId(),
                    $safePage,
                    $safeLimit,
                    true,
                    $orderBy,
                    $safeMinSize
                );
                $totalItems = $this->fileDuplicateService->getTotalCount($type, $this->getUserId(), $safeMinSize);
            } elseif ($isCustomOrder) {
                $duplicates = $this->fileDuplicateService->findAll(
                    $type,
                    $this->getUserId(),
                    $safePage,
                    $safeLimit,
                    true,
                    $orderBy
                );
                $totalItems = $this->fileDuplicateService->getTotalCount($type, $this->getUserId());
            } else {
                $duplicates = $this->fileDuplicateService->findAll(
                    $type,
                    $this->getUserId(),
                    $safePage,
                    $safeLimit,
                    true
                );
                $totalItems = $this->fileDuplicateService->getTotalCount($type, $this->getUserId());
            }
            $totalPages = ceil($totalItems / $safeLimit);

            if ($onlyNonProtected) {
                // For each duplicate group, keep only non-protected files
                foreach ($duplicates['entities'] as $key => $duplicate) {
                    $allFiles = $duplicate->getFiles();
                    $nonProtectedFiles = array_filter($allFiles, function ($file) {
                        return !$file->getIsInOriginFolder();
                    });
                    $protectedCount = count($allFiles) - count($nonProtectedFiles);

                    // If no non-protected files but has protected files, keep the group
                    // but mark it as having only protected files
                    if (empty($nonProtectedFiles) && $protectedCount > 0) {
                        $duplicate->setFiles([]);
                        // Add metadata about protected files
                        $duplicate->setProtectedFileCount($protectedCount);
                        $duplicate->setHasOnlyProtectedFiles(true);

                        continue;
                    }

                    // If no files at all, remove the group
                    if (empty($nonProtectedFiles) && $protectedCount === 0) {
                        unset($duplicates['entities'][$key]);

                        continue;
                    }

                    // Update the duplicate group with only non-protected files
                    $duplicate->setFiles(array_values($nonProtectedFiles));
                    $duplicate->setProtectedFileCount($protectedCount);
                    $duplicate->setHasOnlyProtectedFiles(false);
                }
            }

            $data = [
                'status' => 'success',
                'entities' => array_values($duplicates['entities']),
                'pagination' => [
                    'currentPage' => $safePage,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'limit' => $safeLimit,
                ],
            ];

            return new DataResponse($data);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occurred', ['app' => Application::ID, 'exception' => $e]);

            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }


    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function acknowledge(string $hash): DataResponse
    {
        $this->fileDuplicateMapper->markAsAcknowledged($hash);

        return new DataResponse(['status' => 'success']);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function unacknowledge(string $hash): DataResponse
    {
        $this->fileDuplicateMapper->unmarkAcknowledged($hash);

        return new DataResponse(['status' => 'success']);
    }

    /**
     * @NoCSRFRequired
     */
    public function clear(): DataResponse
    {
        try {
            $this->fileDuplicateService->clear();
            $this->fileInfoService->clear();

            return new DataResponse(['status' => 'success']);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);

            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

    /**
     * @NoCSRFRequired
     */
    public function find(): DataResponse
    {
        try {
            $this->userManager->callForAllUsers(function (IUser $user): void {
                $this->fileInfoService->scanFiles($user->getUID());
            });

            return new DataResponse(['status' => 'success']);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occurred', ['app' => Application::ID, 'exception' => $e]);

            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }
}
