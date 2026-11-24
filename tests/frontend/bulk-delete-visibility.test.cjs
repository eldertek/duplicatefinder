const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { Vue, loadComponent, loadModule, settle } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

const slotBox = tag => ({
	render(h) {
		return h(tag, { on: this.$listeners }, this.$slots.default)
	},
})

function createNavigationComponent() {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const NcAppNavigationItemStub = {
		name: 'NcAppNavigationItemStub',
		props: ['name', 'title', 'allowCollapse', 'open', 'active'],
		render(h) {
			return h('li', { attrs: { 'data-nav-name': this.name } }, this.$slots.default)
		},
	}
	const DuplicateListItem = loadComponent('src/components/DuplicateListItem.vue', {
		'@nextcloud/vue': { NcAppNavigationItem: NcAppNavigationItemStub },
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
		'@/tools/utils': utils,
	})
	const icon = slotBox('span')
	return loadComponent('src/components/DuplicateNavigation.vue', {
		'@nextcloud/vue': {
			NcAppNavigation: {
				render(h) {
					return h('nav', this.$scopedSlots.list ? this.$scopedSlots.list() : this.$slots.default)
				},
			},
			NcAppNavigationItem: NcAppNavigationItemStub,
			NcButton: slotBox('button'),
		},
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': {
			render(h) {
				return h('input', { attrs: { type: 'search' } })
			},
		},
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
			fetchDuplicates: async () => ({ entities: [], pagination: { currentPage: 1, totalPages: 1 } }),
		},
		'@/tools/utils': utils,
		'@/tools/duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		'@/tools/duplicatePreferences': loadModule('src/tools/duplicatePreferences.js'),
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
	})
}

function createAppComponent({ acknowledgedResponse, unacknowledgedResponse }) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const icon = slotBox('span')
	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})
	return loadComponent('src/App.vue', {
		'@nextcloud/vue': {
			NcAppContent: slotBox('main'),
			NcContent: slotBox('div'),
			NcLoadingIcon: slotBox('span'),
			NcAppSettingsDialog: slotBox('section'),
			NcAppSettingsSection: slotBox('div'),
			NcButton: slotBox('button'),
			NcModal: slotBox('div'),
		},
		'./components/DuplicateNavigation.vue': {
			__esModule: true,
			default: createNavigationComponent(),
		},
		'./components/DuplicateDetails.vue': { __esModule: true, default: stub('duplicate-details') },
		'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
		'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('space-reclamation-timeline') },
		'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity-inspector') },
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
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('dev-tree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict-storm') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vm-cow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('scientific-bundle') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand-kit-auditor') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log-telemetry-auditor') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer-repo-auditor') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook-drift-auditor') },
		'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin-folders') },
		'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded-folders') },
		'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk-deletion') },
		'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects-settings') },
		'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
		'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
		'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
		'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
		'./components/SearchBar.vue': { __esModule: true, default: stub('search-bar') },
		'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
		'@/tools/api': {
			fetchDuplicates: async type => (type === 'acknowledged' ? acknowledgedResponse : unacknowledgedResponse),
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'@/tools/keyboardShortcuts': loadModule('src/tools/keyboardShortcuts.js'),
		'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
		}),
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})
}

describe('Issue 206: Single top-right Bulk Delete button and initial selection', () => {
	test('sidebar does not render a redundant second Bulk Delete button', async () => {
		const navSource = readFileSync(resolve(root, 'src/components/DuplicateNavigation.vue'), 'utf8')
		assert.ok(!navSource.includes('footer-actions'), 'Bulk Delete must not be in bottom footer-actions')
		assert.ok(!navSource.includes('sidebar-bulk-action'), 'redundant sidebar Bulk Delete button must be removed')

		const DuplicateNavigation = createNavigationComponent()
		const sampleDup = {
			id: 101,
			hash: 'hash-101',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 10, mimetype: 'image/jpeg', size: 2048, path: '/alice/files/Photos/img1.jpg' },
				{ id: 2, nodeId: 11, mimetype: 'image/jpeg', size: 2048, path: '/alice/files/Backup/img1.jpg' },
			],
		}

		const wrapper = new Vue({
			render(h) {
				return h(DuplicateNavigation, {
					props: {
						acknowledgedDuplicates: [],
						unacknowledgedDuplicates: [sampleDup],
						currentDuplicateId: null,
						activeView: 'details',
						hasDuplicates: true,
					},
				})
			},
		}).$mount()

		await settle()

		assert.equal(wrapper.$el.querySelector('.sidebar-bulk-action'), null, 'no Bulk Delete button in sidebar')
		assert.equal(wrapper.$el.querySelector('.bulk-delete-button'), null, 'no redundant Bulk Delete button in sidebar')

		wrapper.$destroy()
	})

	test('App topbar renders top-right Bulk Delete button with total duplicate count, auto-selects first duplicate on load, and supports Back to duplicates', async () => {
		const dupOne = {
			id: 42,
			hash: 'hash-42',
			acknowledged: false,
			files: [
				{ id: 1, nodeId: 100, mimetype: 'text/plain', size: 512, path: '/alice/files/a.txt' },
				{ id: 2, nodeId: 101, mimetype: 'text/plain', size: 512, path: '/alice/files/b.txt' },
			],
		}
		const App = createAppComponent({
			acknowledgedResponse: {
				entities: [],
				pagination: { currentPage: 1, totalPages: 1, totalItems: 3 },
			},
			unacknowledgedResponse: {
				entities: [dupOne],
				pagination: { currentPage: 1, totalPages: 2, totalItems: 65 },
			},
		})

		const vm = new Vue(App).$mount()
		await settle()

		// Auto-selected first unacknowledged duplicate on load
		assert.equal(vm.currentDuplicate.id, 42)

		// Topbar shows total count (65 + 3 = 68) and top-right Bulk Delete button
		const title = vm.$el.querySelector('.topbar-title')
		assert.ok(title)
		assert.equal(title.textContent.trim(), 'Duplicates (68)')
		assert.equal(title.getAttribute('title'), null, 'native title attribute is omitted to prevent browser tooltip overlap')
		assert.match(title.getAttribute('data-tooltip') || '', /68 total, 65 unacknowledged, 3 acknowledged/)
		assert.match(title.getAttribute('data-tooltip') || '', /Excluded folders and ignored files are not counted/)

		const helpBtn = vm.$el.querySelector('.topbar-count-help')
		assert.ok(helpBtn)
		assert.equal(helpBtn.getAttribute('title'), null, 'native title attribute is omitted on help icon to prevent double tooltip')
		assert.match(helpBtn.getAttribute('aria-label') || '', /68 total, 65 unacknowledged, 3 acknowledged/)

		const tooltipEl = vm.$el.querySelector('.topbar-count-tooltip')
		assert.ok(tooltipEl, 'renders accessible duplicate count breakdown tooltip')
		assert.match(tooltipEl.textContent, /Active duplicate groups in current scan \(68\)/)
		assert.match(tooltipEl.textContent, /Unacknowledged groups \(65\)/)
		assert.match(tooltipEl.textContent, /Acknowledged groups \(3\)/)
		assert.match(tooltipEl.textContent, /Excluded folders and ignored files are not counted\./)
		assert.match(tooltipEl.textContent, /Reflects active scan results matching your current size filter\./)

		const topBulkBtn = vm.$el.querySelector('.topbar-bulk-delete-button')
		assert.ok(topBulkBtn, 'top-right Bulk Delete button is visible immediately on load')

		// Even if currentDuplicate is cleared to null, top-right Bulk Delete stays accessible
		vm.currentDuplicate = null
		await settle()
		assert.ok(vm.$el.querySelector('.topbar-bulk-delete-button'))

		// Clicking top-right Bulk Delete switches to bulk-delete view and displays Back to duplicates button
		vm.$el.querySelector('.topbar-bulk-delete-button').click()
		await settle()
		assert.equal(vm.activeView, 'bulk-delete')
		assert.equal(vm.$el.querySelector('.topbar-title').textContent.trim(), 'Bulk Delete')
		assert.equal(vm.$el.querySelector('.topbar-count-tooltip'), null, 'tooltip is hidden on Bulk Delete heading')
		assert.ok(vm.$el.querySelector('.stub-bulk-deletion'))

		const backBtn = vm.$el.querySelector('.topbar-back-button')
		assert.ok(backBtn, 'Back to duplicates button appears in topbar during bulk-delete view')
		backBtn.click()
		await settle()
		assert.equal(vm.activeView, 'details')
		assert.equal(vm.currentDuplicate.id, 42, 'returning from Bulk Delete restores first duplicate selection')

		// Issue 234: when a section has reached its end (hasMore === false), count reflects actual loaded live groups
		vm.unacknowledgedDuplicates = []
		vm.unacknowledgedPagination = { currentPage: 1, totalPages: 1, totalItems: 3000, hasMore: false }
		vm.acknowledgedDuplicates = [{ ...dupOne, id: 50, acknowledged: true }]
		vm.acknowledgedPagination = { currentPage: 1, totalPages: 1, totalItems: 1, hasMore: false }
		await settle()
		assert.equal(vm.totalDuplicateCount, 1)
		assert.equal(vm.$el.querySelector('.topbar-title').textContent.trim(), 'Duplicates (1)')
		assert.match(vm.$el.querySelector('.topbar-count-tooltip').textContent, /Unacknowledged groups \(0\)/)
		assert.match(vm.$el.querySelector('.topbar-count-tooltip').textContent, /Acknowledged groups \(1\)/)

		// Issue 220: initial loading spinner is wrapped in a full-viewport centered container
		vm.isLoading = true
		await settle()
		const loadingContainer = vm.$el.querySelector('.app-loading-container')
		assert.ok(loadingContainer, 'initial loading spinner is wrapped in .app-loading-container for center alignment')

		vm.$destroy()
	})
})
