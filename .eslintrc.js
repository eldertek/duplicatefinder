// SPDX-FileCopyrightText: André Théo LAURET <andrelauret@eclipse-technology.eu>
// SPDX-License-Identifier: AGPL-3.0-or-later
module.exports = {
	extends: [
		'@nextcloud',
	],
	rules: {
		// Nextcloud webpack config aliases '@' to 'src/' and bundles devDependencies into js/duplicatefinder-*.js
		'import/no-unresolved': ['error', { ignore: ['^@/', '^@nextcloud/dialogs/style\\.css$'] }],
		'node/no-missing-import': 'off',
		'node/no-unpublished-import': 'off',
		'node/no-extraneous-import': 'off',
	},
}
