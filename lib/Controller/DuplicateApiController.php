<?php
namespace OCA\DuplicateFinder\Controller;

use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;
use OCP\AppFramework\Http\JSONResponse;
use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Service\FileDuplicateService;
use OCA\DuplicateFinder\Service\FileInfoService;

class DuplicateApiController extends AbstractAPIController
{
    /** @var FileDuplicateService */
    private $fileDuplicateService;
    /** @var FileInfoService */
    private $fileInfoService;

    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        FileDuplicateService $fileDuplicateService,
        FileInfoService $fileInfoService,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request, $userSession, $logger);
        $this->fileInfoService = $fileInfoService;
        $this->fileDuplicateService = $fileDuplicateService;
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function list(int $offset = 0, int $limit = 30): JSONResponse
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
    public function acknowledge(string $hash)
    {
        // Logic to mark the duplicate with the specified hash as acknowledged.
        // This will involve calling the appropriate method from FileDuplicateMapper or a related service.
        
        // Placeholder response. In a real implementation, this would return a success or error message.
        return new JSONResponse(['status' => 'success', 'message' => 'Duplicate acknowledged.']);
    }


    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function getAcknowledged(int $offset = 0, int $limit = 30): JSONResponse
    {
        // Logic to retrieve the list of acknowledged duplicates.
        // This will involve calling the appropriate method from FileDuplicateMapper or a related service.
        
        // Placeholder response. In a real implementation, this would return a list of acknowledged duplicates.
        return new JSONResponse(['status' => 'success', 'duplicates' => []]);
    }

    /**
     * @NoAdminRequired
     * @NoCSRFRequired
     */
    public function unacknowledge(string $hash)
    {
        // Logic to unmark the duplicate with the specified hash as acknowledged.
        // This will involve calling the appropriate method from FileDuplicateMapper or a related service.
        
        // Placeholder response. In a real implementation, this would return a success or error message.
        return new JSONResponse(['status' => 'success', 'message' => 'Acknowledgement removed.']);
    }

}