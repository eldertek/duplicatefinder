<?php
namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;
use OCP\Files\Node;
use OCP\Files\IRootFolder;
use OCP\Share\IManager;

class ShareService
{
    /** @var IRootFolder */
    private $rootFolder;
    /** @var LoggerInterface */
    private $logger;
    /** @var IManager */
    private $shareManager;

    public function __construct(
        IRootFolder $rootFolder,
        IManager $shareManager,
        LoggerInterface $logger
    ) {
        $this->rootFolder = $rootFolder;
        $this->shareManager = $shareManager;
        $this->logger = $logger;
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
                        $this->logger->debug('Target Path: @'.$shares[0]->getTarget().'@ '.$shares[0]->getNodeType());
                        return PathConversionUtils::convertSharedPath(
                            $this->rootFolder->getUserFolder($user),
                            $this->rootFolder->getUserFolder($shares[0]->getSharedWith()),
                            $sharedNode,
                            $shares[0],
                            $stripedFolders
                        );
                    }
                    $node = $node->getParent();
                    $stripedFolders++;
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to check access rights', ['exception'=> $e]);
        }
        return null;
    }
}
