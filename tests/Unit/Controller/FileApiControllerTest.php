<?php

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\FileApiController;
use OCA\DuplicateFinder\Exception\AbortedDeletionException;
use OCA\DuplicateFinder\Exception\LastCopyProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoProtectionException;
use OCA\DuplicateFinder\Exception\LivePhotoConfirmationRequiredException;
use OCA\DuplicateFinder\Exception\LivePhotoPairProtectionException;
use OCA\DuplicateFinder\Service\FileService;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\JSONResponse;
use OCP\Files\NotFoundException;
use OCP\IRequest;
use OCP\Lock\LockedException;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;

class FileApiControllerTest extends TestCase
{
    private $controller;
    private $service;
    private $request;
    private $logger;
    private $userId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->request = $this->createMock(IRequest::class);
        $this->service = $this->createMock(FileService::class);
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->userId = 'testuser';

        $this->controller = new FileApiController(
            'duplicatefinder',
            $this->request,
            $this->service,
            $this->userId,
            $this->logger
        );
    }

    public function testDelete()
    {
        $filePath = '/path/to/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour retourner un succès
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath);

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est correcte
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    public function testDeleteWithNotFoundException()
    {
        $filePath = '/path/to/nonexistent/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new NotFoundException('File not found'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Error deleting file: {error}', $this->anything());

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_NOT_FOUND, $response->getStatus());
        $this->assertEquals(['error' => 'FILE_NOT_FOUND', 'message' => 'File not found: ' . $filePath], $response->getData());
    }

    public function testDeleteWithGenericException()
    {
        $filePath = '/path/to/file.jpg';

        // Configurer la requête pour retourner le paramètre path
        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        // Configurer le mock du service pour lancer une exception
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new \Exception('Generic error'));

        // Configurer le logger pour enregistrer l'erreur
        $this->logger->expects($this->once())
            ->method('error')
            ->with('Error deleting file: {error}', $this->anything());

        // Appeler la méthode delete
        $response = $this->controller->delete();

        // Vérifier que la réponse est une erreur
        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_INTERNAL_SERVER_ERROR, $response->getStatus());
        $this->assertEquals(['error' => 'INTERNAL_ERROR', 'message' => 'An unexpected error occurred'], $response->getData());
    }

    public function testDeleteWithLockedException()
    {
        $filePath = '/path/to/locked-file.jpg';

        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls($filePath, null);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new LockedException($filePath));

        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by lock: {error}', $this->anything());

        $response = $this->controller->delete();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_LOCKED, $response->getStatus());
        $this->assertEquals(['error' => 'FILE_LOCKED', 'message' => 'File is locked: ' . $filePath], $response->getData());
    }

    public function testDeleteMultipleIncludesStructuredLockedError()
    {
        $lockedPath = '/path/to/locked-file.jpg';

        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls(null, [$lockedPath]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $lockedPath)
            ->willThrowException(new LockedException($lockedPath));

        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by lock: {error}', $this->anything());

        $response = $this->controller->delete();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals([
            'success' => [],
            'errors' => [[
                'path' => $lockedPath,
                'error' => 'FILE_LOCKED',
                'message' => 'File is locked: ' . $lockedPath,
            ]],
        ], $response->getData());
    }

    /**
     * The web interface names the file by node id and says which group it is deleted from (issues 177, 180).
     */
    public function testDeleteForwardsNodeIdAndGroupHash()
    {
        $this->request->method('getParam')
            ->willReturnMap([['path', null, '/Photos/a.jpg'], ['paths', null, null]]);
        $this->request->method('getParams')
            ->willReturn(['path' => '/Photos/a.jpg', 'nodeId' => '77', 'hash' => 'abc123', 'allowLastCopy' => 'false']);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, '/Photos/a.jpg', 77, 'abc123', false);

        $response = $this->controller->delete();

        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    public function testDeleteForwardsTheOptInToDeleteTheLastCopy()
    {
        $this->request->method('getParam')
            ->willReturnMap([['path', null, '/Photos/a.jpg'], ['paths', null, null]]);
        $this->request->method('getParams')
            ->willReturn(['nodeId' => 5, 'hash' => 'abc123', 'allowLastCopy' => true]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, '/Photos/a.jpg', 5, 'abc123', true);

        $this->controller->delete();
    }

    public function testDeleteAcceptsANodeIdWithoutPath()
    {
        $this->request->method('getParam')->willReturn(null);
        $this->request->method('getParams')->willReturn(['nodeId' => 9]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, '', 9, null, false);

        $response = $this->controller->delete();

        $this->assertEquals(['status' => 'success'], $response->getData());
    }

    public function testDeleteRefusesTheLastCopyWithAConflict()
    {
        $this->request->method('getParam')
            ->willReturnMap([['path', null, '/Photos/a.jpg'], ['paths', null, null]]);
        $this->request->method('getParams')->willReturn(['hash' => 'abc123']);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->willThrowException(new LastCopyProtectionException('last copy of its content'));

        $response = $this->controller->delete();

        $this->assertEquals(Http::STATUS_CONFLICT, $response->getStatus());
        $this->assertEquals('LAST_COPY_PROTECTED', $response->getData()['error']);
    }

    public function testDeleteWithLivePhotoProtectionExceptionReturnsConflictWithClearMessage(): void
    {
        $filePath = '/Photos/IMG_0042.mov';
        $message = 'Cannot delete "/Photos/IMG_0042.mov" directly because Nextcloud protects the video part of a Live Photo. Delete the paired photo instead only if both files are redundant.';

        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->request->method('getParams')
            ->willReturn(['path' => $filePath, 'nodeId' => 42]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath, 42, null, false)
            ->willThrowException(new LivePhotoProtectionException($message));

        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by Nextcloud Live Photo protection: {error}', [
                'error' => $message,
                'path' => $filePath,
            ]);

        $response = $this->controller->delete();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_CONFLICT, $response->getStatus());
        $this->assertEquals([
            'error' => 'LIVE_PHOTO_VIDEO_PROTECTED',
            'message' => $message,
        ], $response->getData());
    }

    public function testDeleteWithGenericAbortedDeletionExceptionReturnsConflictWithoutStackError(): void
    {
        $filePath = '/Docs/report.pdf';
        $message = 'File deletion was aborted by Nextcloud for "/Docs/report.pdf"';

        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->request->method('getParams')
            ->willReturn(['path' => $filePath]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new AbortedDeletionException($message));

        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion aborted by Nextcloud: {error}', [
                'error' => $message,
                'path' => $filePath,
            ]);

        $response = $this->controller->delete();

        $this->assertInstanceOf(JSONResponse::class, $response);
        $this->assertEquals(Http::STATUS_CONFLICT, $response->getStatus());
        $this->assertEquals([
            'error' => 'DELETE_ABORTED',
            'message' => $message,
        ], $response->getData());
    }

    public function testDeleteRefusesLivePhotoWithoutASurvivingPairWithAConflict()
    {
        $filePath = '/Photos/live.heic';
        $message = 'No complete identical Live Photo pair remains.';

        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new LivePhotoPairProtectionException($message));

        $this->logger->expects($this->never())->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by Live Photo protection: {error}', [
                'error' => $message,
                'path' => $filePath,
            ]);

        $response = $this->controller->delete();

        $this->assertSame(Http::STATUS_CONFLICT, $response->getStatus());
        $this->assertSame([
            'error' => 'LIVE_PHOTO_PAIR_PROTECTED',
            'message' => $message,
        ], $response->getData());
    }

    public function testDeleteMultipleIncludesStructuredLivePhotoError(): void
    {
        $movPath = '/Photos/IMG_0042.mov';
        $message = 'Cannot delete "/Photos/IMG_0042.mov" directly because Nextcloud protects the video part of a Live Photo. Delete the paired photo instead only if both files are redundant.';

        $this->request->expects($this->exactly(2))
            ->method('getParam')
            ->withConsecutive(['path'], ['paths'])
            ->willReturnOnConsecutiveCalls(null, [$movPath]);

        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $movPath)
            ->willThrowException(new LivePhotoProtectionException($message));

        $this->logger->expects($this->never())
            ->method('error');
        $this->logger->expects($this->once())
            ->method('warning');

        $response = $this->controller->delete();

        $this->assertEquals([
            'success' => [],
            'errors' => [[
                'path' => $movPath,
                'error' => 'LIVE_PHOTO_VIDEO_PROTECTED',
                'message' => $message,
            ]],
        ], $response->getData());
    }

    public function testDeleteMultipleIncludesStructuredLivePhotoErrorAndContinues()
    {
        $protectedPath = '/Photos/live.heic';
        $ordinaryPath = '/Photos/duplicate.jpg';
        $message = 'No complete identical Live Photo pair remains.';

        $this->request->method('getParam')
            ->willReturnMap([['path', null, null], ['paths', null, [$protectedPath, $ordinaryPath]]]);
        $this->service->expects($this->exactly(2))
            ->method('deleteFile')
            ->withConsecutive([$this->userId, $protectedPath], [$this->userId, $ordinaryPath])
            ->willReturnCallback(function (string $uid, string $path) use ($protectedPath, $message): array {
                if ($path === $protectedPath) {
                    throw new LivePhotoPairProtectionException($message);
                }
                return [];
            });

        $this->logger->expects($this->never())->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by Live Photo protection: {error}', [
                'error' => $message,
                'path' => $protectedPath,
            ]);

        $response = $this->controller->delete();

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
        $this->assertSame([
            'success' => [$ordinaryPath],
            'errors' => [[
                'path' => $protectedPath,
                'error' => 'LIVE_PHOTO_PAIR_PROTECTED',
                'message' => $message,
            ]],
        ], $response->getData());
    }

    public function testDeleteRequiresLivePhotoConfirmationWithAConflict()
    {
        $filePath = '/Photos/live.heic';
        $message = 'Confirm deletion of both Live Photo components.';

        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->request->method('getParams')->willReturn(['allowLivePhotoPair' => 'false']);
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new LivePhotoConfirmationRequiredException($message));

        $this->logger->expects($this->never())->method('error');
        $this->logger->expects($this->once())
            ->method('warning')
            ->with('File deletion blocked by Live Photo protection: {error}', [
                'error' => $message,
                'path' => $filePath,
            ]);

        $response = $this->controller->delete();

        $this->assertSame(Http::STATUS_CONFLICT, $response->getStatus());
        $this->assertSame([
            'error' => 'LIVE_PHOTO_CONFIRMATION_REQUIRED',
            'message' => $message,
        ], $response->getData());
    }

    public function testDeleteForwardsLivePhotoConfirmationAndReturnsDeletedNodeIds()
    {
        $filePath = '/Photos/live.heic';
        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->request->method('getParams')->willReturn([
            'nodeId' => 77,
            'hash' => 'abc123',
            'allowLastCopy' => true,
            'allowLivePhotoPair' => 'true',
        ]);
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath, 77, 'abc123', true, true)
            ->willReturn([77, 78]);

        $response = $this->controller->delete();

        $this->assertSame(Http::STATUS_OK, $response->getStatus());
        $this->assertSame(['status' => 'success', 'deletedNodeIds' => [77, 78]], $response->getData());
    }

    public function testDeleteOrdinaryFileKeepsTheExistingSuccessResponse()
    {
        $filePath = '/Photos/ordinary.jpg';
        $this->request->method('getParam')
            ->willReturnMap([['path', null, $filePath], ['paths', null, null]]);
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willReturn([77]);

        $response = $this->controller->delete();

        $this->assertSame(['status' => 'success'], $response->getData());
    }

    public function testDeleteMultipleIncludesStructuredLivePhotoConfirmationError()
    {
        $filePath = '/Photos/live.mov';
        $message = 'Confirm deletion of both Live Photo components.';
        $this->request->method('getParam')
            ->willReturnMap([['path', null, null], ['paths', null, [$filePath]]]);
        $this->service->expects($this->once())
            ->method('deleteFile')
            ->with($this->userId, $filePath)
            ->willThrowException(new LivePhotoConfirmationRequiredException($message));
        $this->logger->expects($this->never())->method('error');
        $this->logger->expects($this->once())->method('warning');

        $response = $this->controller->delete();

        $this->assertSame([
            'success' => [],
            'errors' => [[
                'path' => $filePath,
                'error' => 'LIVE_PHOTO_CONFIRMATION_REQUIRED',
                'message' => $message,
            ]],
        ], $response->getData());
    }

    // Suppression des tests testInfo, testInfoWithNotFoundException et testInfoWithGenericException
    // car la méthode info n'existe pas dans le contrôleur
}
