<?php

namespace OCA\DuplicateFinder\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Exception\NotAuthenticatedException;
use OCP\AppFramework\ApiController;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use OCP\IUserSession;
use Psr\Log\LoggerInterface;

abstract class AbstractAPIController extends ApiController
{
    /**
     * @var IUserSession|null The user session instance.
     */
    private $userSession;

    /**
     * @var LoggerInterface The logger instance.
     */
    protected $logger;

    /**
     * AbstractAPIController constructor.
     *
     * @param string $appName The app name.
     * @param IRequest $request The request instance.
     * @param IUserSession|null $userSession The user session instance.
     * @param LoggerInterface $logger The logger instance.
     */
    public function __construct(
        $appName,
        IRequest $request,
        ?IUserSession $userSession,
        LoggerInterface $logger
    ) {
        parent::__construct($appName, $request);
        $this->userSession = $userSession;
        $this->logger = $logger;
    }

    /**
     * Get the user ID.
     *
     * @return string The user ID.
     * @throws NotAuthenticatedException If the user is not authenticated.
     */
    protected function getUserId(): string
    {
        if ($this->userSession === null || ($user = $this->userSession->getUser()) === null) {
            throw new NotAuthenticatedException();
        }

        return $user->getUID();
    }

    /**
     * Handle an exception and return a JSON response.
     *
     * @param \Exception $e The exception to handle.
     * @return JSONResponse The JSON response.
     */
    protected function handleException(\Exception $e): DataResponse
    {
        if ($e instanceof NotAuthenticatedException) {
            return new DataResponse(['status' => 'error', 'message' => 'Not authenticated'], Http::STATUS_UNAUTHORIZED);
        }
        $this->logger->error('An unknown exception occurred', ['app' => Application::ID, 'exception' => $e]);

        return new DataResponse(['status' => 'error', 'message' => 'An unknown exception occurred'], Http::STATUS_INTERNAL_SERVER_ERROR);
    }
}
