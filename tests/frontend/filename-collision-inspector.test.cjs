const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadCollisionEngine() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	return loadModule('src/tools/filenameCollisionInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicatePathDiff': duplicatePathDiff,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const filenameCollisionInspector = loadModule('src/tools/filenameCollisionInspector.js', {
		'./duplicateStats': duplicateStats,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicatePathDiff': duplicatePathDiff,
	})

	return loadComponent('src/components/FilenameCollisionWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateStats': duplicateStats,
		'../tools/filenameCollisionInspector': filenameCollisionInspector,
	})
}

function buildSampleDuplicates() {
	return [
		{
			id: 201,
			hash: 'hash_unicode_cafe',
			files: [
				{
					id: 11,
					nodeId: 2001,
					path: '/alice/files/Shared/Caf\u00e9.pdf',
					name: 'Caf\u00e9.pdf',
					size: 2 * 1024 * 1024,
					mtime: 1730000000,
					isInOriginFolder: false,
				},
				{
					id: 12,
					nodeId: 2002,
					path: '/alice/files/Shared/Cafe\u0301.pdf',
					name: 'Cafe\u0301.pdf',
					size: 2 * 1024 * 1024,
					mtime: 1730000500,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 202,
			hash: 'hash_case_clash',
			files: [
				{
					id: 13,
					nodeId: 2003,
					path: '/alice/files/Finance/Quarterly_Report.xlsx',
					name: 'Quarterly_Report.xlsx',
					size: 512 * 1024,
					mtime: 1730100000,
					isInOriginFolder: true,
				},
				{
					id: 14,
					nodeId: 2004,
					path: '/alice/files/Finance/quarterly_report.xlsx',
					name: 'quarterly_report.xlsx',
					size: 512 * 1024,
					mtime: 1730100100,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 203,
			hash: 'hash_invisible_bidi',
			files: [
				{
					id: 15,
					nodeId: 2005,
					path: '/alice/files/Inbox/invoice\u200B_2026.pdf',
					name: 'invoice\u200B_2026.pdf',
					size: 320 * 1024,
					mtime: 1730200000,
					isInOriginFolder: false,
				},
				{
					id: 16,
					nodeId: 2006,
					path: '/alice/files/Archive/invoice_2026.pdf',
					name: 'invoice_2026.pdf',
					size: 320 * 1024,
					mtime: 1730200000,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 204,
			hash: 'hash_win_hazard_and_copy',
			files: [
				{
					id: 17,
					nodeId: 2007,
					path: '/alice/files/Exports/=cmd|CON:draft.txt',
					name: '=cmd|CON:draft.txt',
					size: 4096,
					mtime: 1730300000,
					isInOriginFolder: false,
				},
				{
					id: 18,
					nodeId: 2008,
					path: '/alice/files/Exports/budget (1).csv',
					name: 'budget (1).csv',
					size: 4096,
					mtime: 1730300100,
					isInOriginFolder: false,
				},
				{
					id: 19,
					nodeId: 2009,
					path: '/alice/files/Exports/budget.csv',
					name: 'budget.csv',
					size: 4096,
					mtime: 1730290000,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 205,
			hash: 'hash_clean_group',
			files: [
				{
					id: 20,
					nodeId: 2010,
					path: '/alice/files/CleanA/readme.md',
					name: 'readme.md',
					size: 1024,
					mtime: 1730300000,
					isInOriginFolder: false,
				},
				{
					id: 21,
					nodeId: 2011,
					path: '/alice/files/CleanB/readme.md',
					name: 'readme.md',
					size: 1024,
					mtime: 1730300000,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 139: Filename Normalization & Locale/Unicode Collision Inspector', () => {
	test('detects Unicode NFC/NFD/NFKC forms, invisible/BiDi codepoints, cross-OS hazards, and copy suffixes accurately', () => {
		const engine = loadCollisionEngine()

		assert.equal(engine.detectUnicodeForm('plain-ascii.txt'), 'ascii')
		assert.equal(engine.detectUnicodeForm('Caf\u00e9.pdf'), 'nfc')
		assert.equal(engine.detectUnicodeForm('Cafe\u0301.pdf'), 'nfd')
		assert.equal(engine.detectUnicodeForm('\uFB01le.pdf'), 'nfkc-diff')

		const invisible = engine.inspectInvisibleAndBidiChars('a\u200Bb\u202Ec\u00A0d.txt')
		assert.equal(invisible.length, 3)
		assert.equal(invisible[0].codePointHex, 'U+200B')
		assert.equal(invisible[1].codePointHex, 'U+202E')
		assert.equal(invisible[2].codePointHex, 'U+00A0')

		const hazardsReserved = engine.inspectCrossOsHazards('CON.txt')
		assert.equal(hazardsReserved.hasHazard, true)
		assert.equal(hazardsReserved.maxSeverity, 'critical')
		assert.ok(hazardsReserved.hazards.some(h => h.id === 'windows-reserved-name'))

		const hazardsIllegal = engine.inspectCrossOsHazards('bad:file?.txt ')
		assert.equal(hazardsIllegal.hasHazard, true)
		assert.ok(hazardsIllegal.hazards.some(h => h.id === 'windows-illegal-chars'))
		assert.ok(hazardsIllegal.hazards.some(h => h.id === 'edge-whitespace'))

		const copy1 = engine.detectCopySuffix('budget (1).csv')
		assert.equal(copy1.hasCopySuffix, true)
		assert.equal(copy1.cleanedFilename, 'budget.csv')

		const copyFr = engine.detectCopySuffix('Rapport - Copie.docx')
		assert.equal(copyFr.hasCopySuffix, true)
		assert.equal(copyFr.cleanedFilename, 'Rapport.docx')

		assert.equal(engine.computeCanonicalKey('Cafe\u0301.pdf', 'strict'), engine.computeCanonicalKey('Caf\u00e9.pdf', 'strict'))
		assert.equal(engine.computeCanonicalKey('my_file - Copy (1).pdf', 'aggressive'), 'my file.pdf')

		const suggestion = engine.suggestCanonicalFilename('Cafe\u0301\u200B:draft .pdf ')
		assert.equal(suggestion.changed, true)
		assert.equal(suggestion.suggestedName, 'Caf\u00e9_draft.pdf')
		assert.ok(suggestion.reasons.length >= 3)

		const reservedSuggestion = engine.suggestCanonicalFilename('nul.log')
		assert.equal(reservedSuggestion.suggestedName, '_nul.log')
	})

	test('builds collision catalog with same-folder clashes, canonical keeper election, and CWE-1236-safe exports', () => {
		const engine = loadCollisionEngine()
		const catalog = engine.buildFilenameCollisionCatalog(buildSampleDuplicates(), {
			mode: 'strict',
		})

		assert.equal(catalog.summary.totalFiles, 11)
		assert.ok(catalog.summary.sameFolderCollisionCount >= 4)
		assert.ok(catalog.summary.unicodeDivergenceCount >= 1)
		assert.ok(catalog.summary.invisibleCharCount >= 1)
		assert.ok(catalog.summary.caseClashCount >= 2)
		assert.ok(catalog.summary.crossOsHazardCount >= 1)
		assert.ok(catalog.summary.copySuffixCount >= 1)
		assert.ok(catalog.summary.pruneCandidateCount >= 3)

		// Origin folder file must never be recommended for deletion
		const originItem = catalog.allItems.find(item => item.fileId === 13)
		assert.ok(originItem)
		assert.equal(originItem.deletable, false)
		assert.equal(originItem.pruneRecommended, false)
		assert.equal(originItem.verdict, 'protected-keep')

		// Case-clash non-origin duplicate should be safe to prune
		const caseDuplicate = catalog.allItems.find(item => item.fileId === 14)
		assert.ok(caseDuplicate)
		assert.equal(caseDuplicate.pruneRecommended, true)
		assert.equal(caseDuplicate.deletable, true)
		assert.equal(caseDuplicate.verdict, 'prune-non-canonical')

		// Invisible char file should have clean keeper in sibling archive folder
		const invisibleItem = catalog.allItems.find(item => item.fileId === 15)
		assert.ok(invisibleItem)
		assert.equal(invisibleItem.pruneRecommended, true)
		assert.equal(invisibleItem.suggestedName, 'invoice_2026.pdf')

		// Safe non-canonical selector excludes protected/keeper items
		const safeKeys = engine.selectSafeNonCanonicalKeys(catalog)
		assert.ok(safeKeys.length >= 3)
		assert.ok(!safeKeys.includes(originItem.key))

		// CWE-1236 formula injection neutralization in CSV
		const csv = engine.exportFilenameCollisionCsv(catalog)
		assert.ok(csv.includes('file_name,suggested_canonical_name'))
		assert.ok(csv.includes('"\'=cmd|CON:draft.txt"') || csv.includes("'=cmd|CON:draft.txt"))

		const manifest = JSON.parse(engine.exportFilenameCollisionManifestJson(catalog))
		assert.equal(manifest.schema, engine.COLLISION_REPORT_SCHEMA)
		assert.equal(manifest.items.length, catalog.items.length)

		// Preferences persistence (with in-memory localStorage mock when Node has no backing file)
		const prevLocalStorage = global.localStorage
		const store = new Map()
		global.localStorage = {
			getItem: k => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => { store.set(k, String(v)) },
			removeItem: k => { store.delete(k) },
		}
		try {
			engine.saveFilenameCollisionPreferences({ mode: 'aggressive' })
			assert.equal(engine.loadFilenameCollisionPreferences().mode, 'aggressive')
			engine.saveFilenameCollisionPreferences({ mode: 'strict' })
			assert.equal(engine.loadFilenameCollisionPreferences().mode, 'strict')
		} finally {
			global.localStorage = prevLocalStorage
		}
	})

	test('FilenameCollisionWorkbench.vue renders empty, populated, filters, canonical diff, prune modal, and XSS defense', async () => {
		const deletedCalls = []
		const Workbench = createWorkbenchComponent(async files => {
			deletedCalls.push(files)
			return {
				success: files,
				deletedNodeIds: files.map(f => f.nodeId),
			}
		})

		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: [],
						allDuplicates: [],
					},
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.collision-wb__empty'))
		emptyVm.$destroy()

		const xssDuplicates = [
			...buildSampleDuplicates(),
			{
				id: 206,
				hash: 'hash_xss',
				files: [
					{
						id: 30,
						nodeId: 2030,
						path: '/alice/files/XSS/<img src=x onerror=alert(1)>:test.txt',
						name: '<img src=x onerror=alert(1)>:test.txt',
						size: 2048,
						mtime: 1730300000,
						isInOriginFolder: false,
					},
					{
						id: 31,
						nodeId: 2031,
						path: '/alice/files/XSS/clean.txt',
						name: 'clean.txt',
						size: 2048,
						mtime: 1730300000,
						isInOriginFolder: false,
					},
				],
			},
		]

		const emittedDelete = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: xssDuplicates,
						allDuplicates: xssDuplicates,
					},
					on: {
						'collision-delete-completed': payload => emittedDelete.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const listItems = vm.$el.querySelectorAll('.collision-wb__item')
		assert.ok(listItems.length >= 6)
		// Zero XSS DOM nodes
		assert.equal(vm.$el.querySelectorAll('img').length, 0)

		// Toggle aggressive normalization mode
		const aggBtn = Array.from(vm.$el.querySelectorAll('.collision-wb__seg-btn')).find(b => b.textContent.includes('Aggressive'))
		assert.ok(aggBtn)
		aggBtn.click()
		await settle()
		assert.equal(aggBtn.getAttribute('aria-pressed'), 'true')

		// Filter by invisible-chars category
		const invBtn = Array.from(vm.$el.querySelectorAll('.collision-wb__cat-btn')).find(b => b.textContent.includes('Invisible'))
		assert.ok(invBtn)
		invBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.collision-wb__item').length, 1)
		assert.ok(vm.$el.querySelector('.collision-wb__token-grid').textContent.includes('U+200B'))

		// Reset filters
		const resetBtn = Array.from(vm.$el.querySelectorAll('.collision-wb__mini-btn')).find(b => b.textContent.includes('Reset filters'))
		assert.ok(resetBtn)
		resetBtn.click()
		await settle()

		// Select safe non-canonical copies & prune via confirmation dialog
		const selectSafeBtn = Array.from(vm.$el.querySelectorAll('.collision-wb__bulk-actions button')).find(b => b.textContent.includes('Select safe'))
		assert.ok(selectSafeBtn)
		selectSafeBtn.click()
		await settle()

		const pruneBtn = vm.$el.querySelector('.collision-wb__bulk-actions .collision-wb__danger-btn')
		assert.ok(pruneBtn && !pruneBtn.disabled)
		pruneBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.collision-confirm-dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.collision-wb__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.ok(deletedCalls[0].length >= 3)
		assert.equal(emittedDelete.length, 1)

		vm.$destroy()
	})

	test('App.vue wires Collisions topbar button and = keyboard shortcut cleanly', async () => {
		const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
			'./duplicatePreferences': duplicatePreferences,
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': duplicateStats,
			'./duplicateFilters': duplicateFilters,
		})
		const stub = name => ({
			name: `stub-${name}`,
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '=' }), 'toggle-filename-collisions')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '=', ctrlKey: true }), null)

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: stub('nc-loading'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
				NcLoadingSpinner: stub('spinner'),
				NcAppSettingsDialog: slotBox('div'),
				NcAppSettingsSection: slotBox('section'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('dup-nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('dup-details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('dup-treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('reclamation-timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene-inspector') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-pair-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint-analyzer') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-bursts') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery-safety') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive-inspector') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio-workbench') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video-workbench') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar-sweep') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rule-profiles') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('document-lineage') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo-perceptual') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken-quarantine') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention-pruner') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('filename-collisions') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota-attribution') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview-cache') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share-mount') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup-drift') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('automation-rulebook') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('metadata-consolidation') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic-verifier') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode-verifier') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow-reclaim') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk-pair') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('media-fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc-chunking') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops-schedule') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal-hold') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('ransomware-canary') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('proj-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter'),
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({ isRunning: false, scannedFiles: 0, totalFiles: 0, percentage: 0 }),
				startUserScan: async () => ({}),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
				fetchEmptyFolders: async () => [],
				deleteEmptyFolders: async () => ({ deleted: [] }),
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
		})

		const vm = new Vue({
			render(h) {
				return h(App)
			},
		}).$mount()
		await settle()

		const appComp = vm.$children[0]
		const btn = vm.$el.querySelector('button.topbar-filename-collisions-button')
		assert.ok(btn, 'Topbar Collisions button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '=')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.filenameCollisionsOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-filename-collisions'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '=', bubbles: true }))
		await settle()
		assert.equal(appComp.filenameCollisionsOpen, false)

		vm.$destroy()
	})

	test('Cycle 139 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/filenameCollisionInspector.js',
			'src/components/FilenameCollisionWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/FilenameCollisionWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
