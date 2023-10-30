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

    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        FileDuplicateService $fileDuplicateService,
        FileInfoService $fileInfoService,
        FileDuplicateMapper $fileDuplidateMapper,
        IUserManager $userManager,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->userManager = $userManager;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->logger = $logger;
        $this->fileDuplicateMapper = $fileDuplidateMapper;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    
    public function list(int $offset = 0, int $limit = 30, string $type = 'unacknowledged'): DataResponse
    {
        try {
            $duplicates = [];
            switch($type) {
                case 'all':
                    $duplicates = $this->fileDuplicateService->findAll($this->getUserId(), $limit, $offset, true);
                    break;
                case 'acknowledged':
                    $duplicates = $this->fileDuplicateService->findAcknowledged($this->getUserId(), $limit, $offset, true);
                    break;
                case 'unacknowledged':
                    $duplicates = $this->fileDuplicateService->findUnacknowledged($this->getUserId(), $limit, $offset, true);
                    break;
            }
            return new DataResponse(['status' => 'error', 'message' => 'Invalid type']);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
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
        $this->fileDuplicateService->clear();
        $this->fileInfoService->clear();
        return new DataResponse(['status'=> 'success']);
    }

    /**
     * @NoCSRFRequired
     */
    public function find(): DataResponse
    {
        $this->userManager->callForAllUsers(function (IUser $user): void {
            $this->fileInfoService->scanFiles($user->getUID());
        });
        return new DataResponse(['status'=> 'success']);
    }

}