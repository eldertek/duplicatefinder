<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\AppInfo\Application;
use OCA\DuplicateFinder\Controller\AbstractAPIController;
use OCA\DuplicateFinder\Exception\NotAuthenticatedException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use OCP\IUser;
use OCP\IUserSession;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class AbstractAPIControllerTest extends TestCase
{
    /** @var IRequest|MockObject */
    private $request;

    /** @var IUserSession|MockObject */
    private $userSession;

    /** @var LoggerInterface|MockObject */
    private $logger;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->userSession = $this->createMock(IUserSession::class);
        $this->logger = $this->createMock(LoggerInterface::class);
    }

    private function makeController(?IUserSession $session): AbstractAPIController
    {
        return new class ('duplicatefinder', $this->request, $session, $this->logger) extends AbstractAPIController {
            public function exposeUserId(): string
            {
                return $this->getUserId();
            }

            public function exposeHandleException(\Exception $e): DataResponse
            {
                return $this->handleException($e);
            }
        };
    }

    public function testGetUserIdReturnsAuthenticatedUid(): void
    {
        $user = $this->createMock(IUser::class);
        $user->method('getUID')->willReturn('alice');
        $this->userSession->method('getUser')->willReturn($user);

        $controller = $this->makeController($this->userSession);

        $this->assertSame('alice', $controller->exposeUserId());
    }

    public function testGetUserIdThrowsWhenSessionIsNull(): void
    {
        $controller = $this->makeController(null);

        $this->expectException(NotAuthenticatedException::class);
        $controller->exposeUserId();
    }

    public function testGetUserIdThrowsWhenSessionHasNoUser(): void
    {
        $this->userSession->method('getUser')->willReturn(null);
        $controller = $this->makeController($this->userSession);

        $this->expectException(NotAuthenticatedException::class);
        $controller->exposeUserId();
    }

    public function testHandleExceptionReturnsUnauthorizedForNotAuthenticated(): void
    {
        $this->logger->expects($this->never())->method('error');
        $controller = $this->makeController($this->userSession);

        $response = $controller->exposeHandleException(new NotAuthenticatedException());

        $this->assertSame(Http::STATUS_UNAUTHORIZED, $response->getStatus());
        $this->assertSame(['status' => 'error', 'message' => 'Not authenticated'], $response->getData());
    }

    public function testHandleExceptionLogsAndReturnsInternalServerError(): void
    {
        $exception = new \RuntimeException('Unexpected failure');
        $this->logger->expects($this->once())
            ->method('error')
            ->with(
                'An unknown exception occurred',
                $this->callback(function (array $context) use ($exception): bool {
                    return ($context['app'] ?? null) === Application::ID
                        && ($context['exception'] ?? null) === $exception;
                })
            );

        $controller = $this->makeController($this->userSession);
        $response = $controller->exposeHandleException($exception);

        $this->assertSame(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertSame(['status' => 'error', 'message' => 'An unknown exception occurred'], $response->getData());
    }
}
