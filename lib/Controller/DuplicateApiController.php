<?php
namespace OCA\DuplicateFinder\Controller;

use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use OCP\AppFramework\Http\JSONResponse;
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

    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        FileDuplicateService $fileDuplicateService,
        FileInfoService $fileInfoService,
        FileDuplicateMapper $fileDuplidateMapper,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
        $this->fileDuplicateMapper = $fileDuplidateMapper;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    
    public function list(int $offset = 0, int $limit = 30, string $type = 'unacknowledged'): JSONResponse
    {
        try {
            $duplicates = [];
            switch($type) {
                case 'all':
                    $duplicates = $this->fileDuplicateService->findAll($this->getUserId(), $limit, $offset, true);
                    break;
                case 'acknowledged':
                    $duplicates = $this->fileDuplicateService->findAcknowledged($this->getUserId(), $limit, $offset);
                    break;
                case 'unacknowledged':
                default:
                    $duplicates = $this->fileDuplicateService->findUnacknowledged($this->getUserId(), $limit, $offset);
                    break;
            }
            return $this->success($duplicates);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
            return $this->handleException($e);
        }
    }

    {
        try {
            $duplicates = $this->fileDuplicateService->findAll($this->getUserId(), $limit, $offset, true);
            return $this->success($duplicates);
        } catch (\Exception $e) {
            $this->logger->error('A unknown exception occured', ['app' => Application::ID, 'exception' => $e]);
            return $this->handleException($e);
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
    public function listAcknowledged(): DataResponse {
        $acknowledgedDuplicates = $this->fileDuplicateMapper->getAcknowledgedDuplicates();
        return new DataResponse($acknowledgedDuplicates);
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

}