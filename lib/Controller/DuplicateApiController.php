<?php
namespace OCA\DuplicateFinder\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserManager;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;
use OCA\DuplicateFinder\Db\FileDuplicateMapper;
use OCA\DuplicateFinder\Service\OriginFolderService;

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
    public function list(int $page = 1, int $limit = 30, string $type = 'unacknowledged'): DataResponse
    {
        try {
            $duplicates = $this->fileDuplicateService->findAll($type, $this->getUserId(), $page, $limit, true);
            $totalItems = $this->fileDuplicateService->getTotalCount($type); 
            $totalPages = ceil($totalItems / $limit);

            $data = [
                'status' => 'success',
                'entities' => $duplicates['entities'],
                'pagination' => [
                    'currentPage' => $page,
                    'totalPages' => $totalPages,
                    'totalItems' => $totalItems,
                    'limit' => $limit
                ]
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
            $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
            return new DataResponse(['status' => 'error', 'message' => $e->getMessage()]);
        }
    }

}