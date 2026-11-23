const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

function createFilterSettingsComponent(apiOverrides = {}, clipboardOverride = null) {
	const ignoreRulesHelper = loadModule('src/tools/ignoreRulesHelper.js')
	const duplicateHashHelper = loadModule('src/tools/duplicateHashHelper.js')
	const clipboardHelper = clipboardOverride || loadModule('src/tools/clipboardHelper.js')

	const stubIcon = name => ({
		name,
		props: ['size'],
		render(h) {
			return h('span', { class: `icon-${name}` })
		},
	})

	const api = {
		loadFilters: async () => [],
		saveFilter: async filter => ({ id: Date.now(), ...filter, createdAt: 1700000000 }),
		deleteFilter: async () => ({ status: 'success' }),
		...apiOverrides,
	}

	return loadComponent('src/components/FilterSettings.vue', {
		'@nextcloud/vue': {
			NcLoadingIcon: {
				props: ['size'],
				render(h) {
					return h('span', { class: 'nc-loading-icon' })
				},
			},
		},
		'vue-material-design-icons/Check': stubIcon('Check'),
		'vue-material-design-icons/ContentCopy': stubIcon('ContentCopy'),
		'vue-material-design-icons/Delete': stubIcon('Delete'),
		'vue-material-design-icons/FileOutline': stubIcon('FileOutline'),
		'vue-material-design-icons/FilterOutline': stubIcon('FilterOutline'),
		'vue-material-design-icons/Fingerprint': stubIcon('Fingerprint'),
		'vue-material-design-icons/Plus': stubIcon('Plus'),
		'@/tools/api': api,
		'@/tools/clipboardHelper': clipboardHelper,
		'@/tools/duplicateHashHelper': duplicateHashHelper,
		'@/tools/ignoreRulesHelper': ignoreRulesHelper,
	})
}

function createDetailsComponent(apiOverrides = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')

	const api = {
		acknowledgeDuplicate: async () => {},
		unacknowledgeDuplicate: async () => {},
		deleteFiles: async files => ({ success: [...files], errors: [] }),
		deleteFile: async () => true,
		findDuplicates: async () => {},
		saveFilter: async filter => ({ id: 99, ...filter }),
		saveExcludedFolder: async path => ({ id: 77, folderPath: path }),
		...apiOverrides,
	}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': api,
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': api,
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: { render: h => h('div') } },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

describe('Cycle 118: Ignore & Whitelist Pattern Rule Builder + False Positive exclusion', () => {
	test('ignoreRulesHelper builds glob patterns, mirrors PHP basename matching, and validates rules', () => {
		const helper = loadModule('src/tools/ignoreRulesHelper.js')

		assert.equal(helper.buildPatternFromBuilder('extension', 'tmp'), '*.tmp')
		assert.equal(helper.buildPatternFromBuilder('extension', '.bak'), '*.bak')
		assert.equal(helper.buildPatternFromBuilder('extension', '*.swp'), '*.swp')
		assert.equal(helper.buildPatternFromBuilder('prefix', 'backup_'), 'backup_*')
		assert.equal(helper.buildPatternFromBuilder('contains', 'cache'), '*cache*')
		assert.equal(helper.buildPatternFromBuilder('exact', 'Thumbs.db'), 'Thumbs.db')
		assert.equal(helper.buildPatternFromBuilder('extension', '   '), '')

		assert.equal(helper.matchesFilenamePattern('*.tmp', '/user/files/Docs/report.tmp'), true)
		assert.equal(helper.matchesFilenamePattern('*.tmp', '/user/files/Docs/reportXtmp'), false)
		assert.equal(helper.matchesFilenamePattern('backup_*', '/user/files/backup_2026.zip'), true)
		assert.equal(helper.matchesFilenamePattern('*.tmp', '/user/files/temp/photo.jpg'), false)

		const pathErr = helper.validateIgnoreRule('name', 'folder/*.tmp', [])
		assert.equal(pathErr.valid, false)
		assert.equal(pathErr.errorCode, 'CONTAINS_PATH_SEPARATOR')

		const dupNameErr = helper.validateIgnoreRule('name', '*.tmp', [{ type: 'name', value: '*.tmp' }])
		assert.equal(dupNameErr.valid, false)
		assert.equal(dupNameErr.errorCode, 'DUPLICATE')

		const badHashErr = helper.validateIgnoreRule('hash', 'not-a-hash!', [])
		assert.equal(badHashErr.valid, false)
		assert.equal(badHashErr.errorCode, 'INVALID_HASH')

		const validHash = helper.validateIgnoreRule('hash', '  ABCDEF1234567890  ', [])
		assert.equal(validHash.valid, true)
		assert.equal(validHash.normalizedValue, 'abcdef1234567890')

		const dupHashErr = helper.validateIgnoreRule(
			'hash',
			'ABCDEF1234567890',
			[{ type: 'hash', value: 'abcdef1234567890' }],
		)
		assert.equal(dupHashErr.valid, false)
		assert.equal(dupHashErr.errorCode, 'DUPLICATE')

		const tester = helper.evaluatePatternTester('*.tmp', [
			'/user/files/draft.tmp',
			'draft.tmp',
			'photo.jpg',
			'cache.tmp',
		])
		assert.equal(tester.valid, true)
		assert.equal(tester.matchCount, 2)
		assert.equal(tester.results.length, 3)

		const duplicates = [
			{
				hash: 'aabbccdd11223344',
				files: [
					{ path: '/alice/files/Temp/draft.tmp' },
					{ path: '/alice/files/Archive/draft.tmp' },
				],
			},
			{
				hash: '1122334455667788',
				files: [
					{ path: '/alice/files/Photos/img.jpg' },
					{ path: '/alice/files/Backup/img.jpg' },
				],
			},
		]
		assert.deepEqual(
			helper.countMatchingDuplicatesForRule({ type: 'name', value: '*.tmp' }, duplicates),
			{ groupCount: 1, fileCount: 2 },
		)
		assert.deepEqual(
			helper.countMatchingDuplicatesForRule({ type: 'hash', value: 'AABBCCDD11223344' }, duplicates),
			{ groupCount: 1, fileCount: 2 },
		)
	})

	test('deriveGroupIgnoreOptions extracts safe extensions, names, and non-origin folders', () => {
		const { deriveGroupIgnoreOptions } = loadModule('src/tools/duplicateHashHelper.js')

		assert.deepEqual(deriveGroupIgnoreOptions(null), {
			hash: '',
			shortHash: '',
			extensionPatterns: [],
			exactFileNames: [],
			folderPaths: [],
		})

		const options = deriveGroupIgnoreOptions({
			hash: 'deadbeef1234567890abcdef',
			files: [
				{ path: '/alice/files/Origin/report.tmp', isInOriginFolder: true },
				{ path: '/alice/files/Temp/report.tmp', isInOriginFolder: false },
				{ path: '/alice/files/root_copy.tmp', isInOriginFolder: false },
			],
		})
		assert.equal(options.hash, 'deadbeef1234567890abcdef')
		assert.equal(options.shortHash, 'deadbeef1234')
		assert.deepEqual(options.extensionPatterns, ['*.tmp'])
		assert.deepEqual(options.exactFileNames, ['report.tmp', 'root_copy.tmp'])
		assert.deepEqual(options.folderPaths, ['/Temp'])
	})

	test('FilterSettings handles loading -> error -> retry -> ready, presets, rule builder, live tester, and delete', async () => {
		let loadCalls = 0
		const savedCalls = []
		const deletedIds = []

		const FilterSettings = createFilterSettingsComponent({
			loadFilters: async () => {
				loadCalls += 1
				if (loadCalls === 1) {
					throw new Error('Network unavailable')
				}
				return [{ id: 10, type: 'hash', value: '0011223344556677', createdAt: 1700000000 }]
			},
			saveFilter: async payload => {
				savedCalls.push(payload)
				return { id: 100 + savedCalls.length, ...payload, createdAt: 1700000100 }
			},
			deleteFilter: async id => {
				deletedIds.push(id)
				return { status: 'success' }
			},
		})

		const vm = new Vue({
			render: h => h(FilterSettings, {
				props: {
					duplicates: [
						{
							hash: 'aabbccdd11223344',
							files: [
								{ path: '/alice/files/Work/draft.tmp' },
								{ path: '/alice/files/Backup/draft.tmp' },
							],
						},
					],
				},
			}),
		}).$mount()
		await settle()

		// Error state + Retry recovery
		assert.ok(vm.$el.querySelector('.rules-state-box.is-error'))
		const retryBtn = vm.$el.querySelector('.rules-state-box.is-error button')
		retryBtn.click()
		await settle()

		const settingsVm = vm.$children[0]
		assert.equal(settingsVm.loadState, 'ready')
		assert.equal(settingsVm.hashFiltersCount, 1)

		// Click *.tmp preset chip
		const tmpPreset = Array.from(vm.$el.querySelectorAll('.preset-chip')).find(
			el => el.textContent.includes('*.tmp'),
		)
		assert.ok(tmpPreset)
		tmpPreset.click()
		await settle()

		assert.deepEqual(savedCalls[0], { type: 'name', value: '*.tmp' })
		assert.equal(tmpPreset.disabled, true)
		assert.ok(tmpPreset.classList.contains('is-added'))

		// Structured builder: Extension mode + invalid path separator guard
		const extModeBtn = Array.from(vm.$el.querySelectorAll('.mode-chip')).find(
			el => el.textContent.includes('Extension'),
		)
		extModeBtn.click()
		await settle()

		settingsVm.newRuleInput = 'foo/bar'
		await settle()
		assert.ok(vm.$el.querySelector('.validation-error'))

		settingsVm.newRuleInput = 'bak'
		await settle()
		assert.equal(settingsVm.draftRuleValue, '*.bak')
		assert.ok(vm.$el.textContent.includes('*.bak'))

		// Live tester shows match for backup_2026.bak
		const matchedPills = vm.$el.querySelectorAll('.tester-sample-pill.is-matched')
		assert.ok(matchedPills.length >= 1)

		await settingsVm.addCustomRule()
		await settle()
		assert.deepEqual(savedCalls[1], { type: 'name', value: '*.bak' })
		assert.equal(settingsVm.nameFiltersCount, 2)

		// Switch to Hash tab and remove existing hash rule
		const hashTabBtn = Array.from(vm.$el.querySelectorAll('.filter-tab-button'))[1]
		hashTabBtn.click()
		await settle()

		const deleteBtn = vm.$el.querySelector('.rule-action-button--delete')
		assert.ok(deleteBtn)
		deleteBtn.click()
		await settle()
		assert.deepEqual(deletedIds, [10])
		assert.equal(settingsVm.hashFiltersCount, 0)

		vm.$destroy()
	})

	test('FilterSettings renders malicious rule patterns safely without HTML injection', async () => {
		const xssPayload = '<img src=x onerror=alert(1)>'
		const FilterSettings = createFilterSettingsComponent({
			loadFilters: async () => [{ id: 1, type: 'name', value: xssPayload }],
		})

		const vm = new Vue({ render: h => h(FilterSettings) }).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.querySelector('.filter-value').textContent.includes(xssPayload))
		vm.$destroy()
	})

	test('DuplicateDetails excludes group as false positive and triggers quick ignore/folder rules', async () => {
		const savedFilters = []
		const savedFolders = []
		const acknowledgedHashes = []
		const emittedUpdates = []

		const Details = createDetailsComponent({
			saveFilter: async payload => {
				savedFilters.push(payload)
				return { id: 50, ...payload }
			},
			saveExcludedFolder: async path => {
				savedFolders.push(path)
				return { id: 60, folderPath: path }
			},
			acknowledgeDuplicate: async hash => {
				acknowledgedHashes.push(hash)
			},
		})

		const duplicate = {
			id: 1,
			hash: 'deadbeef1234567890abcdef',
			acknowledged: false,
			files: [
				{ id: 11, nodeId: 101, path: '/alice/files/Projects/draft.tmp', size: 1024, mtime: 1000, mimetype: 'text/plain', isInOriginFolder: false },
				{ id: 12, nodeId: 102, path: '/alice/files/Backups/draft.tmp', size: 1024, mtime: 2000, mimetype: 'text/plain', isInOriginFolder: false },
			],
		}

		const vm = new Vue({
			render: h => h(Details, {
				props: { duplicate },
				on: {
					duplicateUpdated: updated => emittedUpdates.push(updated),
				},
			}),
		}).$mount()
		await settle()

		// Open dropdown and click quick pattern + exclude folder
		const dropdownToggle = vm.$el.querySelector('button.dropdown-toggle')
		dropdownToggle.click()
		await settle()

		const menuItems = Array.from(vm.$el.querySelectorAll('.dropdown-menu button[role="menuitem"]'))
		const patternBtn = menuItems.find(btn => btn.textContent.includes('*.tmp'))
		assert.ok(patternBtn)
		patternBtn.click()
		await settle()
		assert.deepEqual(savedFilters, [{ type: 'name', value: '*.tmp' }])

		dropdownToggle.click()
		await settle()
		const folderBtn = Array.from(vm.$el.querySelectorAll('.dropdown-menu button[role="menuitem"]')).find(
			btn => btn.textContent.includes('/Projects'),
		)
		assert.ok(folderBtn)
		folderBtn.click()
		await settle()
		assert.deepEqual(savedFolders, ['/Projects'])

		// Click False positive button
		const fpBtn = vm.$el.querySelector('button.false-positive-button')
		assert.ok(fpBtn)
		fpBtn.click()
		await settle()

		assert.deepEqual(savedFilters[1], { type: 'hash', value: 'deadbeef1234567890abcdef' })
		assert.deepEqual(acknowledgedHashes, ['deadbeef1234567890abcdef'])
		assert.equal(emittedUpdates.length, 1)
		assert.equal(emittedUpdates[0].acknowledged, true)
		assert.equal(emittedUpdates[0].ignoredByRule, true)
		assert.ok(vm.$el.querySelector('.ignore-rule-banner'))
		assert.ok(vm.$el.querySelector('.group-status-pill.is-excluded'))

		// Dropdown closes on Escape without throwing
		dropdownToggle.click()
		await settle()
		const dropdownEl = vm.$el.querySelector('.dropdown')
		dropdownEl.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
		await settle()
		assert.equal(vm.$children[0].showDropdown, false)

		vm.$destroy()
	})

	test('Cycle 118 touched files adhere to zero typographic dashes, zero XSS sinks, logical CSS, and >=44px mobile touch targets', () => {
		const files = [
			'src/tools/ignoreRulesHelper.js',
			'src/tools/duplicateHashHelper.js',
			'src/components/FilterSettings.vue',
			'src/components/DuplicateDetails.vue',
			'src/App.vue',
		]

		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `${relPath} must have zero XSS sinks`)
		}

		const filterSettingsSource = readFileSync(resolve(root, 'src/components/FilterSettings.vue'), 'utf8')
		assert.ok(filterSettingsSource.includes('min-block-size: 44px'))
		assert.ok(filterSettingsSource.includes(':focus-visible'))
		assert.ok(filterSettingsSource.includes('padding-inline:'))
	})
})
