<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: André Théo LAURET <andrelauret@eclipse-technology.eu>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\DuplicateFindx\Db;

use JsonSerializable;

use OCP\AppFramework\Db\Entity;

/**
 * @method getId(): int
 * @method getTitle(): string
 * @method setTitle(string $title): void
 * @method getContent(): string
 * @method setContent(string $content): void
 * @method getUserId(): string
 * @method setUserId(string $userId): void
 */
class Note extends Entity implements JsonSerializable {
	protected string $title = '';
	protected string $content = '';
	protected string $userId = '';

	public function jsonSerialize(): array {
		return [
			'id' => $this->id,
			'title' => $this->title,
			'content' => $this->content
		];
	}
}
