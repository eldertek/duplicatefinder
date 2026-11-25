const { readFileSync, readdirSync } = require('node:fs')
const { resolve, basename } = require('node:path')
const vm = require('node:vm')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

describe('Issue 193: keep folder across multiple duplicate groups in BulkDeletionSettings', () => {
	test('availableKeepFolders ranks multi-folder catalogs and keepFolderAcrossGroups selects only copies in other folders', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		assert.equal(utils.getParentFolderPath('/alice/files/CatalogA/img1.jpg'), '/CatalogA')
		assert.equal(utils.getParentFolderPath('/alice/files/root.txt'), '/')
		assert.equal(utils.getParentFolderPath('/__groupfolders/2/Shared/doc.pdf'), '/__groupfolders/2/Shared')

		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: slotBox('button'),
				NcCheckboxRadioSwitch: slotBox('label'),
				NcEmptyContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcActions: slotBox('div'),
				NcActionButton: slotBox('button'),
			},
			'@/tools/api': {
				fetchDuplicatesForBulk: async () => ({
					entities: [
						{
							hash: 'g1',
							files: [
								{ path: '/alice/files/CatalogA/f1.jpg', size: 1000, nodeId: 1 },
								{ path: '/alice/files/CatalogB/f1.jpg', size: 1000, nodeId: 2 },
							],
						},
						{
							hash: 'g2',
							files: [
								{ path: '/alice/files/CatalogA/f2.jpg', size: 2000, nodeId: 3 },
								{ path: '/alice/files/CatalogB/f2.jpg', size: 2000, nodeId: 4 },
								{ path: '/alice/files/CatalogC/f2.jpg', size: 2000, nodeId: 5 },
							],
						},
						{
							hash: 'g3-unrelated',
							files: [
								{ path: '/alice/files/Other1/doc.pdf', size: 500, nodeId: 6 },
								{ path: '/alice/files/Other2/doc.pdf', size: 500, nodeId: 7 },
							],
						},
						{
							hash: 'g4-same-folder',
							files: [
								{ path: '/alice/files/SameDir/a.txt', size: 100, nodeId: 8 },
								{ path: '/alice/files/SameDir/b.txt', size: 100, nodeId: 9 },
							],
						},
					],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 4, limit: 100 },
				}),
				deleteFiles: async () => ({ success: [], errors: [] }),
			},
			'@/tools/utils': utils,
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const vm = new Vue(BulkDeletionSettings).$mount()
		await vm.performDryRun()

		assert.deepEqual(vm.availableKeepFolders, [
			{ folder: '/CatalogA', groupCount: 2 },
			{ folder: '/CatalogB', groupCount: 2 },
			{ folder: '/CatalogC', groupCount: 1 },
			{ folder: '/Other1', groupCount: 1 },
			{ folder: '/Other2', groupCount: 1 },
		])

		// Pre-select unrelated group to ensure keepFolderAcrossGroups clears unrelated groups safely
		vm.toggleGroup('g3-unrelated')
		assert.deepEqual(Array.from(vm.selectedFiles['g3-unrelated']), [0, 1])

		vm.keepFolderAcrossGroups('/CatalogA')

		// In g1: index 0 (/CatalogA) preserved, index 1 (/CatalogB) selected
		assert.deepEqual(Array.from(vm.selectedFiles.g1), [1])
		// In g2: index 0 (/CatalogA) preserved, indexes 1 (/CatalogB) and 2 (/CatalogC) selected
		assert.deepEqual(Array.from(vm.selectedFiles.g2), [1, 2])
		// Unrelated groups without a copy in /CatalogA stay unselected
		assert.deepEqual(Array.from(vm.selectedFiles['g3-unrelated']), [])
		assert.deepEqual(Array.from(vm.selectedFiles['g4-same-folder']), [])
		assert.equal(vm.totalFilesToDelete, 3)

		vm.$destroy()
	})
})

describe('Issue 193 (Level 2): Duplicate folders view and one-click Keep this folder with Origin & Live Photo safeguards', () => {
	test('api.fetchDuplicateFolders queries /duplicates/folders with optional minFiles and minSize filters', async () => {
		const getCalls = []
		const api = loadModule('src/tools/api.js', {
			axios: {
				defaults: { headers: { common: {} } },
				get: async (url, config) => {
					getCalls.push({ url, config })
					return {
						data: {
							status: 'success',
							groups: [{ signature: 'sig-1', folders: ['/Archive', '/Backup'] }],
							summary: { groupCount: 1, duplicateFolderCount: 2, reclaimableSize: 4096 },
						},
					}
				},
			},
			'@nextcloud/router': { generateUrl: path => path },
			'@/tools/notifications': {
				showSuccessNotification: () => {},
				showErrorNotification: () => {},
			},
			'@/tools/utils': { normalizeItemPath: p => p },
		})

		const result = await api.fetchDuplicateFolders({ minFiles: 2, minSize: 1024 })
		assert.equal(result.groups.length, 1)
		assert.equal(getCalls.length, 1)
		assert.equal(getCalls[0].url, '/apps/duplicatefinder/api/duplicates/folders')
		assert.deepEqual(getCalls[0].config, { params: { minFiles: 2, minSize: 1024 } })
	})

	test('BulkDeletionSettings scans duplicate folders, protects origin folders, deletes photo before Live Photo video, and scans empty folders', async () => {
		const deletedBatches = []
		const emptyScans = []
		let scanCount = 0
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})

		const NcButtonStub = {
			name: 'NcButtonStub',
			props: ['type', 'disabled'],
			render(h) {
				return h(
					'button',
					{
						attrs: { type: 'button', disabled: Boolean(this.disabled) },
						on: this.$listeners,
					},
					this.$slots.default
				)
			},
		}

		const folderGroupFixture = {
			signature: 'folder-sig-1',
			fileCount: 2,
			totalSize: 3000,
			reclaimableSize: 3000,
			hasProtectedFolder: true,
			folders: ['/Archive/2025', '/Backup/2025'],
			folderDetails: [
				{
					path: '/Archive/2025',
					isProtected: true,
					protectedFileCount: 2,
					deletableFileCount: 0,
					deletableSize: 0,
					files: [
						{ path: '/qa-bot/files/Archive/2025/IMG_1.HEIC', relativePath: 'IMG_1.HEIC', nodeId: 10, size: 1000, fileHash: 'h-heic', isInOriginFolder: true },
						{ path: '/qa-bot/files/Archive/2025/IMG_1.MOV', relativePath: 'IMG_1.MOV', nodeId: 11, size: 2000, fileHash: 'h-mov', isInOriginFolder: true },
					],
				},
				{
					path: '/Backup/2025',
					isProtected: false,
					protectedFileCount: 0,
					deletableFileCount: 2,
					deletableSize: 3000,
					files: [
						// Deliberately ordered .MOV first in API fixture to verify non-video-first sorting
						{ path: '/qa-bot/files/Backup/2025/IMG_1.MOV', relativePath: 'IMG_1.MOV', nodeId: 21, size: 2000, fileHash: 'h-mov', isInOriginFolder: false },
						{ path: '/qa-bot/files/Backup/2025/IMG_1.HEIC', relativePath: 'IMG_1.HEIC', nodeId: 20, size: 1000, fileHash: 'h-heic', isInOriginFolder: false },
					],
				},
			],
		}

		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: NcButtonStub,
				NcCheckboxRadioSwitch: slotBox('label'),
				NcEmptyContent: {
					render(h) {
						return h('div', [
							this.$slots.default,
							this.$scopedSlots.action ? this.$scopedSlots.action() : null,
						])
					},
				},
				NcLoadingIcon: slotBox('span'),
				NcActions: slotBox('div'),
				NcActionButton: slotBox('button'),
			},
			'@/tools/api': {
				fetchDuplicatesForBulk: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
				fetchDuplicateFolders: async () => {
					scanCount++
					return {
						status: 'success',
						groups: scanCount === 1 ? [folderGroupFixture] : [],
						summary: scanCount === 1
							? { groupCount: 1, duplicateFolderCount: 2, reclaimableSize: 3000 }
							: { groupCount: 0, duplicateFolderCount: 0, reclaimableSize: 0 },
					}
				},
				deleteFiles: async files => {
					deletedBatches.push(files)
					return { success: files, errors: [] }
				},
				scanEmptyFolders: async paths => {
					emptyScans.push(paths)
					return { folders: [{ path: '/Backup/2025', name: '2025', depth: 2, hasEmptySubfolders: false, mtime: 1 }], count: 1 }
				},
			},
			'@/tools/utils': utils,
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const touchedEvents = []
		let deletedEvents = 0
		const vm = new Vue(BulkDeletionSettings)
		vm.$on('folders-touched', paths => touchedEvents.push(paths))
		vm.$on('duplicates-deleted', () => deletedEvents++)
		vm.$mount()
		await settle()

		const scanBtn = vm.$el.querySelector('.scan-duplicate-folders-button')
		assert.ok(scanBtn, 'renders Scan duplicate folders button')
		scanBtn.click()
		await settle()

		const rows = vm.$el.querySelectorAll('.duplicate-folder-row')
		assert.equal(rows.length, 2, 'renders both identical folders in the group')
		assert.ok(rows[0].querySelector('.origin-badge'), 'marks protected origin folder with badge')

		const keepBtns = vm.$el.querySelectorAll('.keep-duplicate-folder-button')
		assert.equal(keepBtns.length, 2)
		assert.equal(keepBtns[0].disabled, false, 'keeping /Archive/2025 can delete /Backup/2025 copies')
		assert.equal(keepBtns[1].disabled, true, 'keeping /Backup/2025 is disabled because /Archive/2025 is origin-protected')

		vm.detectEmptyFoldersAfterDelete = true
		const keepPromise = vm.keepDuplicateFolder(folderGroupFixture, '/Archive/2025')
		await settle()

		const confirmBtn = vm.$el.querySelector('.nc-confirm-dialog__button--danger')
		assert.ok(confirmBtn, 'opens confirmation dialog before deleting folder duplicates')
		confirmBtn.click()
		await keepPromise
		await settle()

		assert.equal(deletedBatches.length, 1)
		assert.deepEqual(
			deletedBatches[0].map(f => f.path),
			['/qa-bot/files/Backup/2025/IMG_1.HEIC', '/qa-bot/files/Backup/2025/IMG_1.MOV'],
			'deletes non-protected copies from other folder with Live Photo image before .MOV video'
		)
		assert.equal(deletedEvents, 1)
		assert.deepEqual(touchedEvents, [['/qa-bot/files/Backup/2025/IMG_1.HEIC', '/qa-bot/files/Backup/2025/IMG_1.MOV']])
		assert.deepEqual(emptyScans, [['/qa-bot/files/Backup/2025/IMG_1.HEIC', '/qa-bot/files/Backup/2025/IMG_1.MOV']])
		assert.equal(vm.duplicateFolderGroups.length, 0, 'rescan clears resolved duplicate folder group')

		vm.$destroy()
	})

	test('collectFilesOutsideKeptFolder refuses non-member paths and skips shared nodeIds present in kept folder', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const BulkDeletionSettings = loadComponent('src/components/BulkDeletionSettings.vue', {
			'@nextcloud/vue': {
				NcButton: slotBox('button'),
				NcCheckboxRadioSwitch: slotBox('label'),
				NcEmptyContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcActions: slotBox('div'),
				NcActionButton: slotBox('button'),
			},
			'@/tools/api': {
				fetchDuplicatesForBulk: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
			},
			'@/tools/utils': utils,
			'vue-material-design-icons/ChevronDown.vue': slotBox('span'),
			'@nextcloud/l10n': { translate: global.t },
		})

		const vm = new Vue(BulkDeletionSettings)
		const group = {
			signature: 'sig-shared',
			folderDetails: [
				{
					path: '/Archive/A',
					files: [
						{ path: '/qa-bot/files/Archive/A/shared.jpg', nodeId: 777, size: 1000, isInOriginFolder: false },
						{ path: '/qa-bot/files/Archive/A/unique.jpg', nodeId: 101, size: 1000, isInOriginFolder: false },
					],
				},
				{
					path: '/Archive/B',
					files: [
						{ path: '/qa-bot/files/Archive/B/shared.jpg', nodeId: 777, size: 1000, isInOriginFolder: false },
						{ path: '/qa-bot/files/Archive/B/unique.jpg', nodeId: 202, size: 1000, isInOriginFolder: false },
					],
				},
			],
		}

		assert.deepEqual(
			vm.collectFilesOutsideKeptFolder(group, '/NotAMember'),
			[],
			'returns empty when keptFolderPath does not match any folder in the group'
		)
		const deletable = vm.collectFilesOutsideKeptFolder(group, '/Archive/A')
		assert.deepEqual(
			deletable.map(f => f.nodeId),
			[202],
			'skips shared nodeId 777 already present in kept folder /Archive/A'
		)

		vm.$destroy()
	})

	test('Issue 193 l10n-fallback/*.json and merged runtime l10n/*.json / l10n/*.js contain all duplicate folder strings with zero U+2013/U+2014', () => {
		const { copyFileSync, mkdtempSync, rmSync } = require('node:fs')
		const { tmpdir } = require('node:os')
		const { join } = require('node:path')
		const { execFileSync } = require('node:child_process')

		const root = resolve(__dirname, '../..')
		const issue193Keys = [
			'Failed to scan duplicate folders.',
			'Scan duplicate folders',
			'Duplicate folders ({count})',
			'Folders with 100% identical file trees. Keep one folder to delete matching copies from the others. Protected origin folders and Live Photos remain protected.',
			'No identical duplicate folders were found.',
			'Identical folder group',
			'{files} files, {size} per folder, {reclaimable} reclaimable',
			'Protected',
			'Keep this folder',
			'Keep this folder and delete duplicate copies?',
			'Keep "{folder}" and delete {count} duplicate files ({size}) from the other identical folders? Protected origin folders and Live Photo safeguards remain enforced.',
			'Delete duplicate copies',
		]

		const frFallback = JSON.parse(readFileSync(resolve(root, 'l10n-fallback/fr.json'), 'utf8')).translations
		assert.equal(frFallback['Scan duplicate folders'], 'Analyser les dossiers en doublon')
		assert.equal(frFallback['Keep this folder'], 'Conserver ce dossier')
		assert.equal(frFallback['Duplicate folders ({count})'], 'Dossiers en doublon ({count})')
		assert.equal(frFallback['Identical folder group'], 'Groupe de dossiers identiques')
		assert.equal(frFallback.Protected, 'Protégé')

		const trackedL10nDir = resolve(root, 'l10n')
		const trackedFiles = readdirSync(trackedL10nDir).filter(name => name.endsWith('.json'))
		for (const fileName of trackedFiles) {
			const locale = basename(fileName, '.json')
			const rawJson = readFileSync(resolve(trackedL10nDir, `${locale}.json`), 'utf8')
			const rawJs = readFileSync(resolve(trackedL10nDir, `${locale}.js`), 'utf8')
			const parsedJson = JSON.parse(rawJson).translations
			let parsedJs = null
			vm.runInNewContext(rawJs, {
				OC: {
					L10N: {
						register(appId, translations) {
							assert.equal(appId, 'duplicatefinder')
							parsedJs = translations
						},
					},
				},
			})
			assert.deepEqual({ ...parsedJs }, { ...parsedJson }, `l10n/${locale}.js must match l10n/${locale}.json`)
		}

		let pythonBin = null
		for (const candidate of ['python3', 'python']) {
			try {
				execFileSync(candidate, ['--version'], { stdio: 'ignore' })
				pythonBin = candidate
				break
			} catch (_) {
				// try next python binary
			}
		}
		assert.ok(pythonBin, 'Python interpreter is required to merge l10n-fallback into runtime l10n')

		const tempL10nDir = mkdtempSync(join(tmpdir(), 'dupfinder-issue193-l10n-'))
		try {
			for (const fileName of readdirSync(trackedL10nDir)) {
				if (fileName.endsWith('.json') || fileName.endsWith('.js')) {
					copyFileSync(resolve(trackedL10nDir, fileName), join(tempL10nDir, fileName))
				}
			}
			execFileSync(pythonBin, [
				resolve(root, 'scripts/merge_l10n_fallback.py'),
				'--target-dir',
				tempL10nDir,
				'--fallback-dir',
				resolve(root, 'l10n-fallback'),
			])

			const fallbackFiles = readdirSync(resolve(root, 'l10n-fallback')).filter(name => name.endsWith('.json'))
			assert.ok(fallbackFiles.length > 0, 'l10n-fallback must contain locale files')
			for (const fileName of fallbackFiles) {
				const locale = basename(fileName, '.json')
				const rawJson = readFileSync(join(tempL10nDir, `${locale}.json`), 'utf8')
				const rawJs = readFileSync(join(tempL10nDir, `${locale}.js`), 'utf8')

				const parsedJson = JSON.parse(rawJson).translations
				let parsedJs = null
				vm.runInNewContext(rawJs, {
					OC: {
						L10N: {
							register(appId, translations) {
								assert.equal(appId, 'duplicatefinder')
								parsedJs = translations
							},
						},
					},
				})
				assert.ok(parsedJs, `merged l10n/${locale}.js must register translations`)

				for (const key of issue193Keys) {
					assert.ok(
						typeof parsedJson[key] === 'string' && parsedJson[key].trim().length > 0,
						`merged l10n/${locale}.json missing Issue 193 key "${key}"`
					)
					assert.equal(
						/[\u2013\u2014]/.test(parsedJson[key]),
						false,
						`merged l10n/${locale}.json Issue 193 key "${key}" must not contain U+2013/U+2014`
					)
					assert.equal(
						parsedJs[key],
						parsedJson[key],
						`merged l10n/${locale}.js missing/mismatched Issue 193 key "${key}"`
					)
				}
			}
		} finally {
			rmSync(tempL10nDir, { recursive: true, force: true })
		}
	})

	test('origin-badge enforces WCAG AA readable contrast on light/dark Nextcloud themes and focus-visible outlines', () => {
		const root = resolve(__dirname, '../..')
		const vueSource = readFileSync(resolve(root, 'src/components/BulkDeletionSettings.vue'), 'utf8')

		assert.equal(/[\u2013\u2014]/.test(vueSource), false, 'BulkDeletionSettings.vue must not contain U+2013/U+2014')
		const badgeMatch = /\.origin-badge\s*\{([\s\S]*?)\}/.exec(vueSource)
		assert.ok(badgeMatch, 'BulkDeletionSettings.vue must define .origin-badge style')
		const badgeCss = badgeMatch[1]

		assert.match(badgeCss, /background-color:\s*var\(--color-primary-element-light/)
		assert.match(badgeCss, /color:\s*var\(--color-primary-element-light-text,\s*var\(--color-main-text/)
		assert.equal(
			badgeCss.includes('--color-primary-element-text-dark'),
			false,
			'.origin-badge must never pair --color-primary-element-text-dark with --color-primary-element-light'
		)
		assert.match(vueSource, /\.keep-duplicate-folder-button:focus-visible/)
	})
})
