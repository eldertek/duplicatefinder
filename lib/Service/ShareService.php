<?php

namespace OCA\DuplicateFinder\Service;

use OCA\DuplicateFinder\Utils\PathConversionUtils;
use OCP\Files\IRootFolder;
use OCP\Files\Node;
use OCP\IUserManager;
use OCP\Share\IManager;
use OCP\Share\IShare;
use Psr\Log\LoggerInterface;

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
        $shares = [];
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

                // Skip room shares
                if ($shareType === IShare::TYPE_ROOM) {
                    continue;
                }

                $shares = array_merge($shares, $newShares);
            } catch (\Throwable $e) {
                $this->logger->error('Failed to get shares', ['exception' => $e]);
            }

            if ($limit > 0 && count($shares) >= $limit) {
                break;
            }
        }
        unset($shareType);

        return $shares;
    }

    public function hasAccessRight(Node $sharedNode, string $user): ?string
    {
        try {
            $accessList = $this->shareManager->getAccessList($sharedNode, true, true);

            if (isset($accessList['users']) && isset($accessList['users'][$user])) {
                $node = $sharedNode;
                $stripedFolders = 0;
                while ($node) {
                    $shares = $this->getShares($user, $node, 1);
                    if (!empty($shares)) {
                        $sharedWith = $shares[0]->getSharedWith();

                        // Skip Talk room shares (TYPE_ROOM) or if the user doesn't exist
                        if ($shares[0]->getShareType() === IShare::TYPE_ROOM || !$this->userManager->userExists($sharedWith)) {
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
                                'shared_with' => $sharedWith,
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
                        break;
                    }
                }
            }
        } catch (\Throwable $e) {
            $this->logger->error('Failed to check access rights', ['exception' => $e]);
        }

        return null;
    }
}
