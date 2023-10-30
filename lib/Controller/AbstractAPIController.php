<?php
namespace OCA\DuplicateFinder\Controller;

 use OCP\IRequest;
 use OCP\IUserSession;
 use Psr\Log\LoggerInterface;
 use OCP\AppFramework\ApiController;
 use OCP\AppFramework\Http;
 use OCP\AppFramework\Http\JSONResponse;
 use OCA\DuplicateFinder\AppInfo\Application;
 use OCA\DuplicateFinder\Exception\NotAuthenticatedException;
 
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
     protected function handleException(\Exception $e): JSONResponse
     {
         if ($e instanceof NotAuthenticatedException) {
             return $this->error($e, Http::STATUS_FORBIDDEN);
         }
         $this->logger->error('An unknown exception occurred', ['app' => Application::ID, 'exception' => $e]);
         return $this->error($e, Http::STATUS_NOT_IMPLEMENTED);
     }
 }
 