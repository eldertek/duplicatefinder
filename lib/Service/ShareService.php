<?php
namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;
use OCP\Files\Node;
use OCP\Files\IRootFolder;
use OCP\Share\IManager;
use OCP\IUserManager;

class ShareService
{
    /** @var IRootFolder */
    private $rootFolder;
    /** @var LoggerInterface */
    private $logger;
    /** @var IManager */
    private $shareManager;
    /** @var IUserManager */
    private $userManager;

    public function __construct(
        IRootFolder $rootFolder,
        IManager $shareManager,
        LoggerInterface $logger,
        IUserManager $userManager
    ) {
        $this->rootFolder = $rootFolder;
        $this->shareManager = $shareManager;
        $this->logger = $logger;
        $this->userManager = $userManager;
    }

    /**
     * @return array<IShare>
     */
    public function getShares(
        string $user,
        ?Node $node = null,
        int $limit = -1
    ): array {
        $shares = array();
        $shareTypes = [IShare::TYPE_USER, IShare::TYPE_GROUP, IShare::TYPE_CIRCLE, IShare::TYPE_ROOM];
        //TYPE_DECK is not supported by NC 20
        if (defined('OCP\Share\IShare::TYPE_DECK')) {
            $shareTypes[] = IShare::TYPE_DECK;
        }
        foreach ($shareTypes as $shareType) {
            try {
                $newShares = $this->shareManager->getSharedWith(
                    $user,
                    $shareType,
                    $node,
                    $limit
                );

                // For room shares, log at debug level and skip
                if ($shareType === IShare::TYPE_ROOM) {
                    foreach ($newShares as $share) {
                        $this->logger->debug('Skipping Talk room share', [
                            'share_with' => $share->getSharedWith(),
                            'node_path' => $share->getNode()->getPath()
                        ]);
                    }
                    continue;
                }

                $shares = array_merge($shares, $newShares);
            } catch (\Throwable $e) {
                $this->logger->error('Failed to get shares', ['exception'=> $e]);
            }

            if ($limit > 0 && count($shares) >= $limit) {
                break;
            }
        }
        unset($shareType);
        return $shares;
    }

    public function hasAccessRight(Node $sharedNode, string $user) : ?string
    {
        $this->logger->debug('ShareService::hasAccessRight - Checking access rights', [
            'user' => $user,
            'node_path' => $sharedNode->getPath(),
            'node_owner' => $sharedNode->getOwner() ? $sharedNode->getOwner()->getUID() : 'null'
        ]);

        try {
            $accessList = $this->shareManager->getAccessList($sharedNode, true, true);
            $this->logger->debug('ShareService::hasAccessRight - Access list retrieved', [
                'has_user_access' => isset($accessList['users']) && isset($accessList['users'][$user]),
                'access_list_users' => isset($accessList['users']) ? array_keys($accessList['users']) : []
            ]);

            if (isset($accessList['users']) && isset($accessList['users'][$user])) {
                $node = $sharedNode;
                $stripedFolders = 0;
                while ($node) {
                    $shares = $this->getShares($user, $node, 1);
                    if (!empty($shares)) {
                        $sharedWith = $shares[0]->getSharedWith();
                        $this->logger->debug('ShareService::hasAccessRight - Found share', [
                            'target' => $shares[0]->getTarget(),
                            'node_type' => $shares[0]->getNodeType(),
                            'shared_with' => $sharedWith,
                            'share_type' => $shares[0]->getShareType()
                        ]);

                        // Skip Talk room shares (TYPE_ROOM) or if the user doesn't exist
                        if ($shares[0]->getShareType() === IShare::TYPE_ROOM || !$this->userManager->userExists($sharedWith)) {
                            $this->logger->debug('ShareService::hasAccessRight - Skipping non-user share', [
                                'shared_with' => $sharedWith,
                                'share_type' => $shares[0]->getShareType(),
                                'user_exists' => $this->userManager->userExists($sharedWith) ? 'true' : 'false'
                            ]);
                            // Move to parent node and continue
                            $node = $node->getParent();
                            $stripedFolders++;
                            continue;
                        }

                        try {
                            return PathConversionUtils::convertSharedPath(
                                $this->rootFolder->getUserFolder($user),
                                $this->rootFolder->getUserFolder($sharedWith),
                                $sharedNode,
                                $shares[0],
                                $stripedFolders
                            );
                        } catch (\Throwable $e) {
                            $this->logger->warning('ShareService::hasAccessRight - Failed to convert shared path', [
                                'exception' => $e->getMessage(),
                                'shared_with' => $sharedWith
                            ]);
                            // Move to parent node and continue
                            $node = $node->getParent();
                            $stripedFolders++;
                            continue;
                        }
                    }

                    try {
                        $node = $node->getParent();
                        $stripedFolders++;
                    } catch (\Throwable $e) {
                        $this->logger->debug('ShareService::hasAccessRight - No more parent nodes', [
                            'exception' => $e->getMessage()
                        ]);
                        break;
                    }
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to check access rights', ['exception'=> $e]);
        }
        return null;
    }
}
