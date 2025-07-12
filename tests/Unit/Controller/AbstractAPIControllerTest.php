<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\AbstractAPIController;
use OCP\AppFramework\Http\JSONResponse;
use OCP\IRequest;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;

class AbstractAPIControllerTest extends TestCase
{
    /** @var AbstractAPIController */
    private $controller;

    /** @var IRequest|MockObject */
    private $request;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);

        // Create concrete implementation of abstract controller
        $this->controller = new class ('duplicatefinder', $this->request) extends AbstractAPIController {
            public function testEndpoint(): JSONResponse
            {
                return $this->success(['message' => 'test']);
            }

            public function testError(): JSONResponse
            {
                return $this->error('Error occurred', 400);
            }

            public function testPagination(): JSONResponse
            {
                $data = ['item1', 'item2', 'item3'];

                return $this->successWithPagination($data, 3, 1, 10);
            }
        };
    }

    /**
     * Test success response
     */
    public function testSuccessResponse(): void
    {
        $response = $this->controller->testEndpoint();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(200, $response->getStatus());

        $data = $response->getData();
        $this->assertArrayHasKey('status', $data);
        $this->assertArrayHasKey('data', $data);
        $this->assertEquals('success', $data['status']);
        $this->assertEquals(['message' => 'test'], $data['data']);
    }

    /**
     * Test error response
     */
    public function testErrorResponse(): void
    {
        $response = $this->controller->testError();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(400, $response->getStatus());

        $data = $response->getData();
        $this->assertArrayHasKey('status', $data);
        $this->assertArrayHasKey('message', $data);
        $this->assertEquals('error', $data['status']);
        $this->assertEquals('Error occurred', $data['message']);
    }

    /**
     * Test pagination response
     */
    public function testPaginationResponse(): void
    {
        $response = $this->controller->testPagination();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(200, $response->getStatus());

        $data = $response->getData();
        $this->assertArrayHasKey('status', $data);
        $this->assertArrayHasKey('data', $data);
        $this->assertArrayHasKey('pagination', $data);

        $pagination = $data['pagination'];
        $this->assertEquals(3, $pagination['total']);
        $this->assertEquals(1, $pagination['page']);
        $this->assertEquals(10, $pagination['perPage']);
        $this->assertEquals(1, $pagination['totalPages']);
    }

    /**
     * Test CORS headers
     */
    public function testCorsHeaders(): void
    {
        $response = $this->controller->testEndpoint();

        $headers = $response->getHeaders();
        $this->assertArrayHasKey('Access-Control-Allow-Origin', $headers);
        $this->assertEquals('*', $headers['Access-Control-Allow-Origin']);
    }

    /**
     * Test empty data response
     */
    public function testEmptyDataResponse(): void
    {
        $controller = new class ('duplicatefinder', $this->request) extends AbstractAPIController {
            public function emptyResponse(): JSONResponse
            {
                return $this->success([]);
            }
        };

        $response = $controller->emptyResponse();
        $data = $response->getData();

        $this->assertEquals('success', $data['status']);
        $this->assertEquals([], $data['data']);
    }

    /**
     * Test pagination with multiple pages
     */
    public function testPaginationMultiplePages(): void
    {
        $controller = new class ('duplicatefinder', $this->request) extends AbstractAPIController {
            public function paginatedResponse(): JSONResponse
            {
                $items = range(1, 25);

                return $this->successWithPagination($items, 100, 2, 10);
            }
        };

        $response = $controller->paginatedResponse();
        $data = $response->getData();
        $pagination = $data['pagination'];

        $this->assertEquals(100, $pagination['total']);
        $this->assertEquals(2, $pagination['page']);
        $this->assertEquals(10, $pagination['perPage']);
        $this->assertEquals(10, $pagination['totalPages']); // 100 items / 10 per page
    }

    /**
     * Test different HTTP status codes
     */
    public function testDifferentStatusCodes(): void
    {
        $controller = new class ('duplicatefinder', $this->request) extends AbstractAPIController {
            public function notFound(): JSONResponse
            {
                return $this->error('Not found', 404);
            }

            public function serverError(): JSONResponse
            {
                return $this->error('Internal server error', 500);
            }

            public function unauthorized(): JSONResponse
            {
                return $this->error('Unauthorized', 401);
            }
        };

        $this->assertEquals(404, $controller->notFound()->getStatus());
        $this->assertEquals(500, $controller->serverError()->getStatus());
        $this->assertEquals(401, $controller->unauthorized()->getStatus());
    }
}
