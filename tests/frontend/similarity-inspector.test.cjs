const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadSimilarityModule() {
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/similarityInspector.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateStats': duplicateStats,
	})
}

function loadSimilarityComponent(simModule = loadSimilarityModule()) {
	return loadComponent('src/components/SimilarityInspector.vue', {
		'../tools/similarityInspector': simModule,
	})
}

describe('Cycle 121: Interactive Similarity Threshold & Fuzzy Match Mode Inspector', () => {
	test('similarityInspector computes Levenshtein, token Jaccard, copy-suffix normalization, and threshold clamping safely', () => {
		const sim = loadSimilarityModule()

		assert.equal(sim.stripCopySuffixes('Vacation_Beach_2025 (1)'), 'Vacation_Beach_2025')
		assert.equal(sim.stripCopySuffixes('Q4_Budget_final_copy'), 'Q4_Budget')
		assert.equal(sim.stripCopySuffixes('track_v2'), 'track')

		assert.equal(sim.clampSimilarityThreshold(120), 100)
		assert.equal(sim.clampSimilarityThreshold(10), 50)
		assert.equal(sim.clampSimilarityThreshold('bad'), sim.DEFAULT_SIMILARITY_THRESHOLD)

		assert.equal(sim.levenshteinDistance('kitten', 'sitting'), 3)
		assert.equal(sim.computeLevenshteinSimilarity('report', 'report'), 100)
		assert.ok(sim.computeLevenshteinSimilarity('vacation beach', 'vacation beach 2') >= 85)

		const tokensA = sim.tokenizeForSimilarity('2025_Beach_Sunset')
		const tokensB = sim.tokenizeForSimilarity('Sunset_Beach_2025')
		assert.equal(sim.computeTokenSimilarity(tokensA, tokensB), 100)

		assert.equal(sim.computeSizeProximity(1000, 900), 90)
		assert.equal(sim.computeFolderProximity('/Photos/2025/Summer', '/Backup/Photos/2025/Summer'), 82.5)
	})

	test('pickAnchorMasterFile prioritizes protected origin > oldest mtime > largest size > shortest path', () => {
		const sim = loadSimilarityModule()

		const files = [
			{ id: 1, path: '/user/files/Archive/Deep/photo_copy.jpg', size: 5000, mtime: 200, isInOriginFolder: false },
			{ id: 2, path: '/user/files/Origin/photo.jpg', size: 3000, mtime: 300, isInOriginFolder: true },
			{ id: 3, path: '/user/files/photo_old.jpg', size: 4000, mtime: 100, isInOriginFolder: false },
		]
		const pickedProtected = sim.pickAnchorMasterFile(files)
		assert.equal(pickedProtected.file.id, 2)
		assert.equal(pickedProtected.reason, 'protected')

		const nonProtected = [
			{ id: 10, path: '/user/files/a/b/newer.jpg', size: 5000, mtime: 500, isInOriginFolder: false },
			{ id: 11, path: '/user/files/c/oldest.jpg', size: 2000, mtime: 100, isInOriginFolder: false },
		]
		const pickedOldest = sim.pickAnchorMasterFile(nonProtected)
		assert.equal(pickedOldest.file.id, 11)
		assert.equal(pickedOldest.reason, 'oldest')
	})

	test('analyzeSimilarityClusters links near-duplicate groups by mode/threshold and computes live merge impact', () => {
		const sim = loadSimilarityModule()

		const duplicates = [
			{
				id: 1,
				hash: 'hash-a',
				acknowledged: false,
				files: [
					{ id: 101, path: '/alice/files/Photos/Vacation_Beach_2025.jpg', size: 4000000, mimetype: 'image/jpeg', mtime: 1000, isInOriginFolder: true },
					{ id: 102, path: '/alice/files/Backup/Vacation_Beach_2025 (1).jpg', size: 4000000, mimetype: 'image/jpeg', mtime: 1100, isInOriginFolder: false },
				],
			},
			{
				id: 2,
				hash: 'hash-b',
				acknowledged: false,
				files: [
					{ id: 201, path: '/alice/files/Photos/Vacation_Beach_2025_edited.jpg', size: 3600000, mimetype: 'image/jpeg', mtime: 1200, isInOriginFolder: false },
					{ id: 202, path: '/alice/files/Exports/Vacation_Beach_2025_edited.jpg', size: 3600000, mimetype: 'image/jpeg', mtime: 1300, isInOriginFolder: false },
				],
			},
			{
				id: 3,
				hash: 'hash-c',
				acknowledged: false,
				files: [
					{ id: 301, path: '/alice/files/Docs/2025_Beach_Vacation.jpg', size: 3500000, mimetype: 'image/jpeg', mtime: 1400, isInOriginFolder: false },
					{ id: 302, path: '/alice/files/Docs/2025_Beach_Vacation_copy.jpg', size: 3500000, mimetype: 'image/jpeg', mtime: 1500, isInOriginFolder: false },
				],
			},
			{
				id: 4,
				hash: 'hash-d',
				acknowledged: false,
				files: [
					{ id: 401, path: '/alice/files/Music/Symphony_No5.flac', size: 25000000, mimetype: 'audio/flac', mtime: 1600, isInOriginFolder: false },
					{ id: 402, path: '/alice/files/Music/Copy_Symphony_No5.flac', size: 25000000, mimetype: 'audio/flac', mtime: 1700, isInOriginFolder: false },
				],
			},
		]

		// In hybrid mode at 85%, group 1 and group 2 merge via stripped copy suffix + high size/ext match
		const highReport = sim.analyzeSimilarityClusters(duplicates, {
			mode: 'hybrid',
			threshold: 85,
			ignoreCopySuffixes: true,
		})
		assert.equal(highReport.impact.clusterCount, 1)
		assert.equal(highReport.impact.linkedGroupCount, 2)
		assert.equal(highReport.clusters[0].groupCount, 2)
		assert.equal(highReport.clusters[0].anchorFile.isProtected, true)
		assert.ok(highReport.impact.additionalMergeGainBytes > 0, 'merging two distinct hash groups uncovers extra merge savings')

		// Switching to token mode at 75% also pulls in group 3 (reordered tokens: 2025_Beach_Vacation)
		const tokenReport = sim.analyzeSimilarityClusters(duplicates, {
			mode: 'token',
			threshold: 75,
			ignoreCopySuffixes: true,
		})
		assert.equal(tokenReport.impact.clusterCount, 1)
		assert.equal(tokenReport.clusters[0].groupCount, 3)
		assert.equal(tokenReport.impact.reducedEffectiveCount, 2)

		// Category filter isolates audio only
		const audioOnly = sim.analyzeSimilarityClusters(duplicates, {
			categoryFilter: 'audio',
			threshold: 70,
		})
		assert.equal(audioOnly.impact.evaluatedGroupCount, 1)
		assert.equal(audioOnly.impact.clusterCount, 0)

		// Intra-group similarity spots renamed copies
		const intra = sim.computeIntraGroupSimilarity(duplicates[3])
		assert.equal(intra.hasRenamedCopies, true)
		assert.ok(intra.avgNameSimilarity < 100)
	})

	test('SimilarityInspector.vue handles empty, populated, threshold interaction, no-matches, and XSS-safe rendering', async () => {
		const SimilarityInspector = loadSimilarityComponent()

		// 1. Empty state
		let scanCalls = 0
		const emptyVm = new Vue({
			render(h) {
				return h(SimilarityInspector, {
					props: { duplicates: [], currentDuplicate: null },
					on: { 'start-scan': () => { scanCalls += 1 } },
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.similarity-empty-state'))
		emptyVm.$el.querySelector('.similarity-primary-button').click()
		assert.equal(scanCalls, 1)

		// 2. Populated state + XSS payload in path
		const duplicates = [
			{
				id: 11,
				hash: 'h11',
				files: [
					{ id: 1, path: '/alice/files/Projects/<img src=x onerror=alert(1)>_Report.pdf', size: 204800, mimetype: 'application/pdf', mtime: 100, isInOriginFolder: true },
					{ id: 2, path: '/alice/files/Backup/<img src=x onerror=alert(1)>_Report_copy.pdf', size: 204800, mimetype: 'application/pdf', mtime: 200, isInOriginFolder: false },
				],
			},
			{
				id: 12,
				hash: 'h12',
				files: [
					{ id: 3, path: '/alice/files/Archive/<img src=x onerror=alert(1)>_Report_final.pdf', size: 198000, mimetype: 'application/pdf', mtime: 300, isInOriginFolder: false },
					{ id: 4, path: '/alice/files/Drafts/<img src=x onerror=alert(1)>_Report_final.pdf', size: 198000, mimetype: 'application/pdf', mtime: 400, isInOriginFolder: false },
				],
			},
		]

		const selected = []
		const compared = []
		const vm = new Vue({
			render(h) {
				return h(SimilarityInspector, {
					props: {
						duplicates,
						currentDuplicate: duplicates[0],
					},
					on: {
						'select-duplicate': g => selected.push(g.id),
						'compare-duplicate': g => compared.push(g.id),
					},
				})
			},
		}).$mount()
		await settle()

		// XSS check: zero <img> injected from malicious path
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>'))

		// Populated cluster card and signal bars
		assert.equal(vm.$el.querySelectorAll('.similarity-cluster-card').length, 1)
		assert.equal(vm.$el.querySelectorAll('.similarity-signal-meter').length, 4)

		// Inspect & Compare actions emit cleanly
		vm.$el.querySelector('.similarity-member-button').click()
		vm.$el.querySelector('.similarity-member-button.is-compare').click()
		assert.deepEqual(selected, [11])
		assert.deepEqual(compared, [11])

		// Numeric input does not clobber mid-keystroke when empty
		const numberInput = vm.$el.querySelector('#similarity-threshold-number')
		numberInput.value = ''
		numberInput.dispatchEvent(new document.defaultView.Event('input'))
		await settle()
		assert.equal(numberInput.value, '')
		numberInput.dispatchEvent(new document.defaultView.Event('blur'))
		await settle()
		assert.equal(numberInput.value, '75')

		// Raise threshold to 100 in levenshtein mode with copy suffixes kept -> no-matches state
		const modeButtons = Array.from(vm.$el.querySelectorAll('.similarity-mode-button'))
		modeButtons[1].click() // Name Levenshtein
		const copySuffixBtn = vm.$el.querySelector('.similarity-toggle-chip')
		copySuffixBtn.click()
		numberInput.value = '100'
		numberInput.dispatchEvent(new document.defaultView.Event('input'))
		numberInput.dispatchEvent(new document.defaultView.Event('blur'))
		await settle()

		assert.ok(vm.$el.querySelector('.similarity-no-matches'))
		const lowerBtn = vm.$el.querySelector('.similarity-no-matches .similarity-secondary-button')
		assert.ok(lowerBtn)
		lowerBtn.click()
		await settle()
		assert.equal(vm.$el.querySelector('#similarity-threshold-number').value, '60')
	})

	test('App.vue + keyboardShortcuts wire f shortcut and topbar Similarity button to inspect and compare groups', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const simDef = keyboardShortcuts.SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-similarity-inspector')
		assert.ok(simDef)
		assert.deepEqual(simDef.keys, ['f'])

		const fakeEvent = (key, extra = {}) => ({
			key,
			ctrlKey: false,
			metaKey: false,
			altKey: false,
			shiftKey: false,
			target: document.createElement('div'),
			...extra,
		})
		assert.equal(keyboardShortcuts.resolveShortcutAction(fakeEvent('f')), 'toggle-similarity-inspector')
		assert.equal(keyboardShortcuts.resolveShortcutAction(fakeEvent('f', { ctrlKey: true })), null)

		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateSortHelper = loadModule('src/tools/duplicateSortHelper.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const duplicateMetadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
		const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
		const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
		const duplicateGroupSummary = loadModule('src/tools/duplicateGroupSummary.js')
		const duplicateHashHelper = loadModule('src/tools/duplicateHashHelper.js')
		const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')
		const ignoreRulesHelper = loadModule('src/tools/ignoreRulesHelper.js')
		const duplicateCompare = loadModule('src/tools/duplicateCompare.js', {
			'./duplicatePathDiff': duplicatePathDiff,
		})
		const visualMediaInspector = loadModule('src/tools/visualMediaInspector.js')
		const mediaContentInspector = loadModule('src/tools/mediaContentInspector.js', {
			'./visualMediaInspector': visualMediaInspector,
		})
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
		const SimilarityInspector = loadSimilarityComponent()

		const DuplicateCompareView = loadComponent('src/components/DuplicateCompareView.vue', {
			'@nextcloud/router': { generateUrl: url => url },
			'../tools/clipboardHelper': clipboardHelper,
			'../tools/duplicateCompare': duplicateCompare,
			'../tools/duplicateMetadataBadges': duplicateMetadataBadges,
			'../tools/duplicatePathDiff': duplicatePathDiff,
			'../tools/duplicateStats': duplicateStats,
			'../tools/utils': utils,
			'../tools/visualMediaInspector': visualMediaInspector,
			'../tools/mediaContentInspector': mediaContentInspector,
		})

		const DuplicateDetails = loadComponent('src/components/DuplicateDetails.vue', {
			'@/tools/api': {
				acknowledgeDuplicate: async () => {},
				unacknowledgeDuplicate: async () => {},
				deleteFiles: async () => ({ success: [], errors: [] }),
				findDuplicates: async () => {},
			},
			'@/tools/utils': utils,
			'@/tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
			'@/tools/duplicateGroupSummary': duplicateGroupSummary,
			'@/tools/duplicateHashHelper': duplicateHashHelper,
			'@/tools/duplicatePathDiff': duplicatePathDiff,
			'@/tools/duplicateSortHelper': duplicateSortHelper,
			'@/tools/duplicateStats': duplicateStats,
			'@/tools/clipboardHelper': clipboardHelper,
			'@/tools/deleteSafetyGuard': deleteSafetyGuard,
			'@/tools/duplicateMetadataBadges': duplicateMetadataBadges,
			'@/tools/ignoreRulesHelper': ignoreRulesHelper,
			'@/tools/visualMediaInspector': visualMediaInspector,
			'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
			'./DuplicateFileDisplay.vue': slotBox('div'),
			'./DuplicateCompareView.vue': { __esModule: true, default: DuplicateCompareView },
		})

		const icon = slotBox('span')
		const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
			'@nextcloud/vue': {
				NcAppNavigation: {
					render(h) {
						return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
					},
				},
				NcAppNavigationItem: {
					props: ['name', 'allowCollapse', 'open', 'active'],
					render(h) {
						return h('section', [h('h4', this.name), this.$slots.default])
					},
				},
				NcButton: slotBox('button'),
			},
			'./DuplicateListItem.vue': slotBox('div'),
			'./SearchBar.vue': slotBox('div'),
			'vue-material-design-icons/CloseCircle': icon,
			'vue-material-design-icons/CheckCircle': icon,
			'vue-material-design-icons/Cog': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/HelpCircle': icon,
			'vue-material-design-icons/School': icon,
			'vue-material-design-icons/PlayCircle': icon,
			'vue-material-design-icons/FrequentlyAskedQuestions': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/FolderCog': icon,
			'vue-material-design-icons/Folder': icon,
			'@/tools/api': {
				fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1, totalItems: 0, hasMore: false } }),
			},
			'@/tools/utils': utils,
			'@/tools/duplicateFilters': duplicateFilters,
			'@/tools/duplicatePreferences': duplicatePreferences,
			'@/tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
			'@/tools/duplicateSortHelper': duplicateSortHelper,
			'@/tools/duplicateStats': duplicateStats,
			'@/tools/duplicateMetadataBadges': duplicateMetadataBadges,
		})

		const duplicates = [
			{
				id: 1,
				hash: 'h1',
				acknowledged: false,
				files: [
					{ id: 101, path: '/alice/files/Budget_2025.xlsx', size: 50000, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mtime: 100 },
					{ id: 102, path: '/alice/files/Backup/Budget_2025.xlsx', size: 50000, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mtime: 200 },
				],
			},
			{
				id: 2,
				hash: 'h2',
				acknowledged: false,
				files: [
					{ id: 201, path: '/alice/files/Budget_2025_final.xlsx', size: 49500, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mtime: 300 },
					{ id: 202, path: '/alice/files/Drafts/Budget_2025_final.xlsx', size: 49500, mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mtime: 400 },
				],
			},
		]

		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		Vue.component('NcLoadingSpinner', { render: h => h('span') })

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
			'./components/DuplicateDetails.vue': { __esModule: true, default: DuplicateDetails },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: SimilarityInspector },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch-auto-select') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('file-hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-simulator') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
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
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => {
					const entities = type === 'unacknowledged' ? duplicates : []
					return {
						entities,
						pagination: { currentPage: 1, totalPages: 1, totalItems: entities.length, hasMore: false },
					}
				},
				fetchProjects: async () => [],
				fetchScanStatus: async () => ({
					running: false,
					indeterminate: false,
					scannedFiles: 10,
					totalFiles: 10,
					percentage: 100,
					completedSeq: 1,
					etaSeconds: null,
				}),
				startUserScan: async () => ({ running: true }),
				fetchEmptyFolders: async () => [],
				deleteEmptyFolders: async () => ({ deleted: [], errors: [] }),
				notifyScanStarted: () => {},
				notifyScanCompleted: () => {},
				notifyScanFailed: () => {},
			},
			'@/tools/notifications': { showErrorNotification: () => {}, showSuccessNotification: () => {} },
			'@/tools/utils': utils,
			'@/tools/duplicatePreferences': duplicatePreferences,
			'@/tools/duplicateStats': duplicateStats,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': reclamationHistory,
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const container = document.createElement('div')
		document.body.appendChild(container)

		const vm = new Vue({ render: h => h(App) }).$mount(container)
		await settle()
		await settle()

		const topBtn = vm.$el.querySelector('.topbar-similarity-button')
		assert.ok(topBtn, 'topbar Similarity button is rendered')
		assert.equal(topBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(topBtn.getAttribute('aria-keyshortcuts'), 'f')

		// Press 'f' shortcut to open
		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'f', bubbles: true }))
		await settle()
		assert.equal(topBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.similarity-workspace'))

		// Click Compare on second member group -> switches active group and opens Compare view
		const compareBtns = vm.$el.querySelectorAll('.similarity-member-button.is-compare')
		assert.ok(compareBtns.length >= 2)
		compareBtns[1].click()
		await settle()
		assert.ok(vm.$el.querySelector('.compare-workspace'), 'Compare action opens Beyond Compare workspace')

		// Press 'f' again to close SimilarityInspector
		document.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key: 'f', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.similarity-workspace'), null)

		vm.$destroy()
		container.remove()
	})

	test('Cycle 121 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile touch targets', () => {
		const files = [
			'src/tools/similarityInspector.js',
			'src/components/SimilarityInspector.vue',
			'src/tools/keyboardShortcuts.js',
			'src/components/DuplicateDetails.vue',
			'src/App.vue',
		]

		for (const relPath of files) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `${relPath} must not contain U+2013`)
			assert.equal(content.includes('\u2014'), false, `${relPath} must not contain U+2014`)
			assert.equal(content.includes('v-html'), false, `${relPath} must not use v-html`)
			assert.equal(content.includes('innerHTML'), false, `${relPath} must not use innerHTML`)
			assert.equal(content.includes('outerHTML'), false, `${relPath} must not use outerHTML`)
			assert.equal(content.includes('insertAdjacentHTML'), false, `${relPath} must not use insertAdjacentHTML`)
			assert.equal(content.includes('document.write'), false, `${relPath} must not use document.write`)
		}

		const inspectorSource = readFileSync(resolve(root, 'src/components/SimilarityInspector.vue'), 'utf8')
		assert.ok(inspectorSource.includes('min-height: 44px'), 'mobile touch targets >= 44px')
		assert.ok(inspectorSource.includes(':focus-visible'), 'focus-visible styles included')
		assert.ok(inspectorSource.includes('border-inline-start'), 'logical CSS properties used')
	})
})
