<?php

declare(strict_types=1);

namespace OCA\DuplicateFinder\Model;

use OCP\Files\File;

class LivePhotoPair
{
    public function __construct(
        public readonly File $image,
        public readonly File $video
    ) {
    }

    /**
     * Order the components consistently before acquiring their locks.
     *
     * @return File[] The image and video, ordered by node id
     */
    public function getFiles(): array
    {
        $files = [$this->image, $this->video];
        usort($files, static fn (File $a, File $b): int => $a->getId() <=> $b->getId());

        return $files;
    }
}
