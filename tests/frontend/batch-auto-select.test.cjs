const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, this.$slots.default)
	},
})

function loadBatchModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	return {
		duplicatePathDiff,
		duplicateStats,
		duplicateSelectionAndExport,
		batchAutoSelect: loadModule('src/tools/batchAutoSelect.js', {
			'./duplicateSelectionAndExport': duplicateSelectionAndExport,
			'./duplicatePathDiff': duplicatePathDiff,
			'./duplicateStats': duplicateStats,
		}),
	}
}

function loadWorkbenchComponent(deps = loadBatchModule(), apiOverrides = {}) {
	return loadComponent('src/components/BatchAutoSelectWorkbench.vue', {
		'../tools/api': {
			deleteFiles: async files => ({ success: files, errors: [], deletedNodeIds: [] }),
			acknowledgeDuplicate: async () => {},
			...apiOverrides,
		},
		'../tools/batchAutoSelect': deps.batchAutoSelect,
		'../tools/duplicatePathDiff': deps.duplicatePathDiff,
		'../tools/duplicateSelectionAndExport': deps.duplicateSelectionAndExport,
		'../tools/duplicateStats': deps.duplicateStats,
	})
}

function createSampleGroups() {
	return [
		{
			id: 1,
			hash: 'hash-1',
			acknowledged: false,
			files: [
				{
					id: 101,
					nodeId: 101,
					path: '/alice/files/Origin/sunset.jpg',
					size: 5000000,
					mtime: 1700000200,
					isInOriginFolder: true,
				},
				{
					id: 102,
					nodeId: 102,
					path: '/alice/files/Downloads/sunset (1).jpg',
					size: 5000000,
					mtime: 1700000100,
					isInOriginFolder: false,
				},
				{
					id: 103,
					nodeId: 103,
					path: '/alice/files/Photos/2025/sunset.jpg',
					size: 5000000,
					mtime: 1700000300,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 2,
			hash: 'hash-2',
			acknowledged: false,
			files: [
				{
					id: 201,
					nodeId: 201,
					path: '/alice/files/Photos/report.pdf',
					size: 2000000,
					mtime: 1700000050,
					isInOriginFolder: false,
				},
				{
					id: 202,
					nodeId: 202,
					path: '/alice/files/PhotosBackup/report_copy.pdf',
					size: 2000000,
					mtime: 1700000500,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 3,
			hash: 'hash-3',
			acknowledged: false,
			files: [
				{
					id: 301,
					nodeId: 301,
					path: '/alice/files/Origin/locked-a.png',
					size: 3000000,
					mtime: 1700000010,
					isInOriginFolder: true,
				},
				{
					id: 302,
					nodeId: 302,
					path: '/alice/files/Origin/locked-b.png',
					size: 3000000,
					mtime: 1700000020,
					isInOriginFolder: true,
				},
			],
		},
		{
			id: 4,
			hash: 'hash-4',
			acknowledged: true,
			files: [
				{
					id: 401,
					nodeId: 401,
					path: '/alice/files/Archives/pack.zip',
					size: 8000000,
					mtime: 1700000010,
					isInOriginFolder: false,
				},
				{
					id: 402,
					nodeId: 402,
					path: '/alice/files/Temp/pack (1).zip',
					size: 8000000,
					mtime: 1700000900,
					isInOriginFolder: false,
				},
			],
		},
	]
}

function createAppWithBatchWorkbench({ unacknowledged = [], acknowledged = [], apiOverrides = {} } = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
	const deps = loadBatchModule()
	const BatchAutoSelectWorkbench = loadWorkbenchComponent(deps, apiOverrides)
	const icon = slotBox('span')

	const SearchBar = loadComponent('src/components/SearchBar.vue', {
		'vue-material-design-icons/ChevronDown': icon,
	})
	const NcAppNavigationItemStub = {
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h('div', { class: ['nc-nav-item', { 'is-open': Boolean(this.open) }] }, [
				h('button', {
					attrs: { type: 'button' },
					on: { click: event => this.$emit('click', event) },
				}, this.name),
				this.$slots.default,
			])
		},
	}
	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/duplicateStats': deps.duplicateStats,
		'@/tools/utils': utils,
	})
	const DuplicateNavigation = loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: NcAppNavigationItemStub,
			NcButton: slotBox('button'),
		},
		'@/tools/api': {
			fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
			findDuplicates: async () => {},
		},
		'@/tools/utils': utils,
		'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
		'@/tools/duplicateSelectionAndExport': deps.duplicateSelectionAndExport,
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js', {
			'./duplicateStats': deps.duplicateStats,
		}),
		'@/tools/duplicateStats': deps.duplicateStats,
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'./SearchBar.vue': { __esModule: true, default: SearchBar },
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'vue-material-design-icons/CloseCircle': icon,
		'vue-material-design-icons/CheckCircle': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/FolderCog': icon,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/Cog': icon,
		'vue-material-design-icons/HelpCircle': icon,
		'vue-material-design-icons/School': icon,
		'vue-material-design-icons/PlayCircle': icon,
		'vue-material-design-icons/FrequentlyAskedQuestions': icon,
	})

	const stub = name => ({
		name,
		render(h) {
			return h('div', { attrs: { 'data-stub': name } })
		},
	})
	const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
		'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		'./duplicateStats': deps.duplicateStats,
	})

	const App = loadComponent('src/App.vue', {
		'@nextcloud/vue': {
			NcAppContent: slotBox('main'),
			NcContent: slotBox('div'),
			NcLoadingIcon: slotBox('span'),
			NcButton: slotBox('button'),
			NcModal: slotBox('div'),
			NcAppSettingsDialog: slotBox('section'),
			NcAppSettingsSection: slotBox('div'),
		},
		'./components/DuplicateNavigation.vue': { __esModule: true, default: DuplicateNavigation },
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
		'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
		'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
		'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
		'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: BatchAutoSelectWorkbench },
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
			fetchDuplicates: async type => ({
				entities: type === 'acknowledged' ? acknowledged : unacknowledged,
				pagination: { currentPage: 1, totalPages: 1, totalItems: (type === 'acknowledged' ? acknowledged : unacknowledged).length, hasMore: false },
			}),
			fetchProjects: async () => [],
			fetchScanStatus: async () => ({ running: false, completedSeq: 1 }),
			startUserScan: async () => ({ running: false }),
			notifyScanStarted: () => {},
			notifyScanCompleted: () => {},
			notifyScanFailed: () => {},
			...apiOverrides,
		},
		'@/tools/utils': utils,
		'@/tools/keyboardShortcuts': keyboardShortcuts,
		'@/tools/reclamationHistory': reclamationHistory,
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, keyboardShortcuts }
}

describe('Cycle 122: Cross-Group Batch Auto-Select Rules & Reference Anchor Workbench', () => {
	test('batchAutoSelect enforces protected origin priority, keep rules, boundary-safe preferred folder, and pattern safety', () => {
		const { batchAutoSelect } = loadBatchModule()
		const groups = createSampleGroups()

		// Default keep_oldest (skipping acknowledged group 4, protecting group 3)
		const oldestPlan = batchAutoSelect.buildBatchAutoSelectPlan(groups, { rule: 'keep_oldest' })
		assert.equal(oldestPlan.summary.totalGroupsEvaluated, 4)
		assert.equal(oldestPlan.summary.matchedGroupCount, 2)
		assert.equal(oldestPlan.summary.protectedOnlyGroupCount, 1)
		assert.equal(oldestPlan.summary.skippedAcknowledgedCount, 1)
		assert.equal(oldestPlan.summary.markedFileCount, 3)
		assert.equal(oldestPlan.summary.reclaimableBytes, 12000000)

		// Group 1 must keep protected origin file 101 even though 102 is older
		const g1 = oldestPlan.groups.find(g => g.groupId === 1)
		assert.equal(g1.anchorFile.id, 101)
		assert.equal(g1.anchorReason, 'protected')
		assert.deepEqual(g1.markedFiles.map(f => f.id), [102, 103])

		// Group 2 keeps oldest file 201
		const g2 = oldestPlan.groups.find(g => g.groupId === 2)
		assert.equal(g2.anchorFile.id, 201)
		assert.equal(g2.anchorReason, 'oldest')
		assert.deepEqual(g2.markedFiles.map(f => f.id), [202])

		// keep_newest on group 2 keeps 202 and marks 201
		const newestPlan = batchAutoSelect.buildBatchAutoSelectPlan(groups, { rule: 'keep_newest' })
		assert.equal(newestPlan.groups.find(g => g.groupId === 2).anchorFile.id, 202)
		assert.deepEqual(newestPlan.groups.find(g => g.groupId === 2).markedFiles.map(f => f.id), [201])

		// keep_preferred_folder '/Photos' must match '/Photos/report.pdf' and NOT '/PhotosBackup/report_copy.pdf'
		const folderPlan = batchAutoSelect.buildBatchAutoSelectPlan(groups, {
			rule: 'keep_preferred_folder',
			preferredFolder: '/Photos',
			requireFolderMatch: true,
		})
		const fg1 = folderPlan.groups.find(g => g.groupId === 1)
		const fg2 = folderPlan.groups.find(g => g.groupId === 2)
		assert.deepEqual(fg1.markedFiles.map(f => f.id), [102])
		assert.equal(fg2.anchorFile.id, 201)
		assert.deepEqual(fg2.markedFiles.map(f => f.id), [202])

		// Pattern mode with invalid regex returns structured error without throwing
		const badRegexPlan = batchAutoSelect.buildBatchAutoSelectPlan(groups, {
			rule: 'mark_pattern_matches',
			pattern: '/[unclosed/',
		})
		assert.equal(badRegexPlan.patternValidation.valid, false)
		assert.ok(badRegexPlan.patternValidation.error.length > 0)
		assert.equal(badRegexPlan.summary.markedFileCount, 0)

		// Pattern mode matching ALL files in group 2 still preserves at least 1 anchor
		const allMatchPlan = batchAutoSelect.buildBatchAutoSelectPlan([groups[1]], {
			rule: 'mark_pattern_matches',
			pattern: '*.pdf',
		})
		assert.equal(allMatchPlan.groups[0].keptFiles.length, 1)
		assert.equal(allMatchPlan.groups[0].markedFiles.length, 1)
	})

	test('manual reference promotion, file unchecking, JSON export, and CWE-1236-safe CSV export work deterministically', () => {
		const { batchAutoSelect } = loadBatchModule()
		const groups = [
			{
				id: 9,
				hash: 'hash-formula',
				acknowledged: false,
				files: [
					{ id: 901, path: '/alice/files/Docs/=CMD|calc.txt', size: 1000, mtime: 100, isInOriginFolder: false },
					{ id: 902, path: '/alice/files/Backup/+SUM(1,2).txt', size: 1000, mtime: 200, isInOriginFolder: false },
				],
			},
		]

		// Promote 902 as manual reference anchor and exclude 901
		const promoted = batchAutoSelect.buildBatchAutoSelectPlan(groups, {
			rule: 'keep_oldest',
			manualAnchorsByGroup: { '9': '902' },
		})
		assert.equal(promoted.groups[0].anchorFile.id, 902)
		assert.equal(promoted.groups[0].anchorReason, 'manual')
		assert.deepEqual(promoted.groups[0].markedFiles.map(f => f.id), [901])

		const unchecked = batchAutoSelect.buildBatchAutoSelectPlan(groups, {
			rule: 'keep_oldest',
			manualAnchorsByGroup: { '9': '902' },
			excludedFileKeysByGroup: { '9': ['901'] },
		})
		assert.equal(unchecked.groups[0].markedFiles.length, 0)
		assert.equal(unchecked.groups[0].keptFiles.length, 2)

		const json = JSON.parse(batchAutoSelect.buildBatchPlanJson(promoted, {
			scope: 'filtered',
			exportedAt: '2026-11-23T12:00:00.000Z',
		}))
		assert.equal(json.schema, 'duplicatefinder.batch-plan.v1')
		assert.equal(json.groups.length, 1)
		assert.equal(json.groups[0].markedForDeletion.length, 1)

		const csv = batchAutoSelect.buildBatchPlanCsv(promoted)
		assert.ok(csv.includes("'=CMD|calc.txt") || csv.includes("'/Docs/=CMD|calc.txt") || csv.includes('/Docs/=CMD|calc.txt'))
		// Ensure leading formula characters are neutralized if a path starts with =, +, -, @
		const formulaPlan = batchAutoSelect.buildBatchAutoSelectPlan([
			{
				id: 10,
				hash: 'h10',
				acknowledged: false,
				files: [
					{ id: 1001, path: '=1+1', size: 500, mtime: 100, isInOriginFolder: false },
					{ id: 1002, path: '+2+2', size: 500, mtime: 200, isInOriginFolder: false },
				],
			},
		])
		const formulaCsv = batchAutoSelect.buildBatchPlanCsv(formulaPlan)
		assert.ok(formulaCsv.includes("'=1+1"))
		assert.ok(formulaCsv.includes("'+2+2"))
	})

	test('BatchAutoSelectWorkbench.vue renders empty, populated, validation error, promote reference, and XSS-safe paths', async () => {
		const deps = loadBatchModule()
		const deletedCalls = []
		const ackCalls = []
		const Workbench = loadWorkbenchComponent(deps, {
			deleteFiles: async files => {
				deletedCalls.push(files)
				return { success: files, errors: [], deletedNodeIds: files.map(f => f.nodeId).filter(Boolean) }
			},
			acknowledgeDuplicate: async hash => {
				ackCalls.push(hash)
			},
		})

		const mountEl = document.createElement('div')
		document.body.appendChild(mountEl)

		// Empty state
		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { filteredDuplicates: [], allDuplicates: [] },
			}),
		}).$mount(mountEl)
		await settle()
		assert.ok(emptyVm.$el.querySelector('.batch-workbench__empty'))
		emptyVm.$destroy()
		emptyVm.$el.remove()

		// Populated state with XSS payload filename
		const groups = createSampleGroups()
		groups[1].files[1].path = '/alice/files/PhotosBackup/<img src=x onerror=alert(1)>.pdf'

		const host = document.createElement('div')
		document.body.appendChild(host)
		const events = []
		const vm = new Vue({
			data: {
				filtered: groups,
				all: groups,
			},
			render(h) {
				return h(Workbench, {
					props: {
						filteredDuplicates: this.filtered,
						allDuplicates: this.all,
						currentDuplicateId: 1,
					},
					on: {
						'batch-delete-completed': payload => events.push({ type: 'delete', payload }),
						'batch-acknowledge-completed': payload => events.push({ type: 'ack', payload }),
					},
				})
			},
		}).$mount(host)
		await settle()

		// Verify XSS payload is rendered safely as plain text
		assert.equal(vm.$el.querySelectorAll('img').length, 0)
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>.pdf'))

		// Click "Make Reference" on group 2's second file to promote it
		const promoteBtns = Array.from(vm.$el.querySelectorAll('.batch-file-row__promote-btn'))
		assert.ok(promoteBtns.length >= 1)
		promoteBtns[promoteBtns.length - 1].click()
		await settle()
		assert.ok(vm.$el.textContent.includes('Manual reference'))

		// Reset rules restores default state
		const resetBtn = vm.$el.querySelector('.batch-workbench__tool-btn')
		resetBtn.click()
		await settle()

		// Switch to pattern mode and verify invalid regex feedback
		const ruleButtons = Array.from(vm.$el.querySelectorAll('.batch-workbench__rule-pills .batch-workbench__pill-btn'))
		const patternBtn = ruleButtons.find(btn => btn.textContent.includes('Mark by path/name pattern'))
		patternBtn.click()
		await settle()
		const patternInput = vm.$el.querySelector('#batch-pattern-input')
		patternInput.value = '/[broken/'
		patternInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.batch-workbench__validation-error'))

		// Switch back to Keep oldest and run batch delete via confirm dialog
		ruleButtons[0].click()
		await settle()
		const deleteBtn = vm.$el.querySelector('.batch-workbench__danger-btn')
		assert.equal(deleteBtn.disabled, false)
		deleteBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('.batch-confirm-dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.batch-confirm-dialog__btn.is-danger')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(deletedCalls[0].length, 3)
		assert.equal(events.some(e => e.type === 'delete' && e.payload.deletedFiles.length === 3), true)

		// Trigger batch acknowledge
		const ackBtn = Array.from(vm.$el.querySelectorAll('.batch-workbench__secondary-btn'))
			.find(btn => btn.textContent.includes('Acknowledge matched'))
		ackBtn.click()
		await settle()
		assert.deepEqual(ackCalls, ['hash-1', 'hash-2'])
		assert.equal(events.some(e => e.type === 'ack' && e.payload.groups.length === 2), true)

		vm.$destroy()
		vm.$el.remove()
	})

	test('App.vue + keyboardShortcuts wire w shortcut, topbar Batch Rules button, help dialog, and batch state updates', async () => {
		const groups = createSampleGroups()
		const unack = groups.filter(g => !g.acknowledged)
		const ack = groups.filter(g => g.acknowledged)

		const { App, keyboardShortcuts } = createAppWithBatchWorkbench({
			unacknowledged: unack,
			acknowledged: ack,
		})

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'w' }), 'toggle-batch-auto-select')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'W', ctrlKey: true }), null)
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'w', target: { tagName: 'INPUT' } }), null)

		const mountEl = document.createElement('div')
		document.body.appendChild(mountEl)
		const vm = new Vue(App).$mount(mountEl)
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-batch-rules-button')
		assert.ok(topbarBtn)
		assert.equal(topbarBtn.getAttribute('aria-keyshortcuts'), 'w')
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'false')
		assert.equal(vm.$el.querySelector('.batch-workbench'), null)

		// Press 'w' to open Batch Auto-Select Workbench
		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true }))
		await settle()
		assert.equal(topbarBtn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.batch-workbench'))

		// Open shortcuts help dialog and confirm w is documented
		vm.openShortcutsDialog()
		await settle()
		assert.ok(vm.$el.querySelector('.shortcuts-dialog').textContent.includes('Toggle cross-group batch auto-select rules'))
		vm.closeShortcutsDialog()
		await settle()

		// Pressing 'w' again hides it
		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'w', bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.batch-workbench'), null)

		// Verify App.vue batch-delete-completed and batch-acknowledge-completed handlers update lists + pagination + reclamation history
		vm.onBatchDeleteCompleted({
			deletedFiles: [unack[0].files[1], unack[0].files[2]],
			deletedNodeIds: [102, 103],
			bytesReclaimed: 10000000,
			groupsResolved: 1,
			sampleLabel: 'sunset.jpg',
		})
		await settle()
		assert.equal(vm.unacknowledgedDuplicates.some(d => d.id === 1), false)
		assert.equal(vm.reclamationHistory.entries.some(e => e.source === 'bulk' && e.bytesReclaimed === 10000000), true)

		vm.onBatchAcknowledgeCompleted({ groups: [unack[1]] })
		await settle()
		assert.equal(vm.unacknowledgedDuplicates.some(d => d.id === 2), false)
		assert.equal(vm.acknowledgedDuplicates.some(d => d.id === 2 && d.acknowledged === true), true)

		vm.$destroy()
		vm.$el.remove()
	})

	test('Cycle 122 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/batchAutoSelect.js',
			'src/components/BatchAutoSelectWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `${rel} must not contain U+2013 or U+2014 dashes`)
			assert.equal(/v-html\s*=/.test(content), false, `${rel} must not use v-html`)
		}
		const workbenchSource = readFileSync(resolve(root, 'src/components/BatchAutoSelectWorkbench.vue'), 'utf8')
		assert.ok(workbenchSource.includes('min-block-size: 44px'))
		assert.ok(workbenchSource.includes('border-inline-start'))
		assert.ok(workbenchSource.includes(':focus-visible'))
	})
})
