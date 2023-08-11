<?php
declare(strict_types=1);
// SPDX-FileCopyrightText: André Théo LAURET <andrelauret@eclipse-technology.eu>
// SPDX-License-Identifier: AGPL-3.0-or-later

namespace OCA\DuplicateFinder\Tests\Unit\Controller;

use OCA\DuplicateFinder\Controller\NoteApiController;

class NoteApiControllerTest extends NoteControllerTest {
	public function setUp(): void {
		parent::setUp();
		$this->controller = new NoteApiController($this->request, $this->service, $this->userId);
	}
}
