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

function createRealDuplicateDetails(utils, clipboardImpl, apiOverrides = {}) {
	const selectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const metadataBadges = loadModule('src/tools/duplicateMetadataBadges.js')
	const deleteSafetyGuard = loadModule('src/tools/deleteSafetyGuard.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const clipboardDependency = clipboardImpl === undefined
		? clipboardHelper
		: {
			copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl),
		}

	const Display = loadComponent('src/components/DuplicateFileDisplay.vue', {
		'@/tools/api': { deleteFile: async () => true },
		'@/tools/clipboardHelper': clipboardDependency,
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/utils': utils,
		'@nextcloud/router': { generateUrl: url => url },
	})

	const pathDiffModule = loadModule('src/tools/duplicatePathDiff.js')
	const statsModule = loadModule('src/tools/duplicateStats.js')
	const compareModule = loadModule('src/tools/duplicateCompare.js', {
		'./duplicatePathDiff': pathDiffModule,
	})
	const visualMediaInspectorModule = loadModule('src/tools/visualMediaInspector.js')
	const mediaContentInspectorModule = loadModule('src/tools/mediaContentInspector.js', {
		'./visualMediaInspector': visualMediaInspectorModule,
	})
	const CompareView = loadComponent('src/components/DuplicateCompareView.vue', {
		'@nextcloud/router': { generateUrl: url => url },
		'../tools/clipboardHelper': clipboardDependency,
		'../tools/duplicateCompare': compareModule,
		'../tools/duplicateStats': statsModule,
		'../tools/utils': utils,
		'../tools/visualMediaInspector': visualMediaInspectorModule,
		'../tools/mediaContentInspector': mediaContentInspectorModule,
	})

	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	return loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': {
			acknowledgeDuplicate: async () => {},
			unacknowledgeDuplicate: async () => {},
			deleteFiles: async () => ({ success: [], errors: [] }),
			findDuplicates: async () => {},
			...apiOverrides,
		},
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': selectionAndExport,
		'@/tools/duplicateStats': statsModule,
		'@/tools/duplicateMetadataBadges': metadataBadges,
		'@/tools/duplicatePathDiff': pathDiffModule,
		'@/tools/deleteSafetyGuard': deleteSafetyGuard,
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/visualMediaInspector': loadModule('src/tools/visualMediaInspector.js'),
		'@/tools/clipboardHelper': clipboardDependency,
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': { __esModule: true, default: CompareView },
		'./DuplicateFileDisplay.vue': { __esModule: true, default: Display },
	})
}

function createAppHarness({ acknowledged = [], unacknowledged = [], useRealDetails = false, clipboardImpl, apiOverrides } = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
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
		'@/tools/duplicateStats': loadModule('src/tools/duplicateStats.js'),
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
		'./DuplicateListItem.vue': { __esModule: true, default: DuplicateListItem },
		'./SearchBar.vue': { __esModule: true, default: SearchBar },
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

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})

	const detailsComponent = useRealDetails
		? createRealDuplicateDetails(utils, clipboardImpl, apiOverrides)
		: stub('duplicate-details')

	const statsModule = loadModule('src/tools/duplicateStats.js')
	const treemapModule = loadModule('src/tools/duplicateTreemap.js', {
		'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		'./duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'./duplicateStats': statsModule,
	})
	const DuplicateTreemap = loadComponent('src/components/DuplicateTreemap.vue', {
		'../tools/duplicateStats': statsModule,
		'../tools/duplicateTreemap': treemapModule,
	})

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
		'./components/DuplicateDetails.vue': { __esModule: true, default: detailsComponent },
		'./components/DuplicateTreemap.vue': { __esModule: true, default: DuplicateTreemap },
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
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox-archive-auditor') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad-vault-auditor') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('web-build-media-auditor') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legal-document-ocr-auditor') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('backup-takeout-auditor') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('elearning-scorm-auditor') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d-asset-vault-auditor') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('database-dump-log-auditor') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('design-publishing-vault-auditor') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: stub('medical-dicom-vault-auditor') },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
			'./components/PhotoGradingVaultWorkbench.vue': { __esModule: true, default: stub('photo-grading-vault-auditor') },
			'./components/MlCheckpointVaultWorkbench.vue': { __esModule: true, default: stub('ml-checkpoint-vault-auditor') },
			'./components/VmBackupVaultWorkbench.vue': { __esModule: true, default: stub('vm-backup-vault-auditor') },
			'./components/DbSqlLogVaultWorkbench.vue': { __esModule: true, default: stub('db-sql-log-vault-auditor') },
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
				pagination: {
					currentPage: 1,
					totalPages: 1,
					totalItems: type === 'acknowledged' ? acknowledged.length : unacknowledged.length,
					hasMore: false,
				},
			}),
			fetchProjects: async () => [],
		},
		'@/tools/utils': utils,
		'@/tools/keyboardShortcuts': keyboardShortcuts,
		'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': statsModule,
		}),
		'vue-material-design-icons/Folder': icon,
		'vue-material-design-icons/FolderRemove': icon,
		'vue-material-design-icons/FolderMultiple': icon,
		'vue-material-design-icons/Delete': icon,
		'vue-material-design-icons/FilterOutline': icon,
	})

	return { App, keyboardShortcuts }
}

function makeDuplicate(id, name) {
	return {
		id,
		hash: `hash-${id}`,
		acknowledged: false,
		files: [
			{ id: id * 10 + 1, nodeId: id * 10 + 1, path: `/alice/files/A/${name}`, size: 1024, mimetype: 'text/plain' },
			{ id: id * 10 + 2, nodeId: id * 10 + 2, path: `/alice/files/B/${name}`, size: 1024, mimetype: 'text/plain' },
		],
	}
}

describe('Cycle 36: pro keyboard shortcuts for fast duplicate triage', () => {
	test('pure shortcut resolver maps j/k/ArrowDown/ArrowUp///?/Escape and ignores modifier or editable targets', () => {
		const {
			isEditableTarget,
			resolveShortcutAction,
			buildNavigableDuplicates,
			stepDuplicateSelection,
		} = loadModule('src/tools/keyboardShortcuts.js')

		assert.equal(resolveShortcutAction({ key: 'j' }), 'next-duplicate')
		assert.equal(resolveShortcutAction({ key: 'ArrowDown' }), 'next-duplicate')
		assert.equal(resolveShortcutAction({ key: 'k' }), 'previous-duplicate')
		assert.equal(resolveShortcutAction({ key: 'ArrowUp' }), 'previous-duplicate')
		assert.equal(resolveShortcutAction({ key: '/' }), 'focus-search')
		assert.equal(resolveShortcutAction({ key: '?', shiftKey: true }), 'toggle-help')
		assert.equal(resolveShortcutAction({ key: 'Escape' }, { isHelpOpen: false }), null)
		assert.equal(resolveShortcutAction({ key: 'Escape' }, { isHelpOpen: true }), 'close-help')
		assert.equal(resolveShortcutAction({ key: 'j' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: '?' }, { isHelpOpen: true }), 'toggle-help')
		assert.equal(resolveShortcutAction({ key: 'j' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: '/', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'k', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'ArrowDown', altKey: true }), null)

		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const editableChild = document.createElement('span')
		editableDiv.appendChild(editableChild)
		const nonEditableDiv = document.createElement('div')
		nonEditableDiv.setAttribute('contenteditable', 'false')

		assert.equal(isEditableTarget(input), true)
		assert.equal(isEditableTarget(textarea), true)
		assert.equal(isEditableTarget(select), true)
		assert.equal(isEditableTarget(editableDiv), true)
		assert.equal(isEditableTarget(editableChild), true)
		assert.equal(isEditableTarget(nonEditableDiv), false)

		for (const target of [input, textarea, select, editableDiv, editableChild]) {
			assert.equal(resolveShortcutAction({ key: 'j', target }), null)
			assert.equal(resolveShortcutAction({ key: 'k', target }), null)
			assert.equal(resolveShortcutAction({ key: '/', target }), null)
			assert.equal(resolveShortcutAction({ key: '?', target }), null)
		}

		// Empty list and min/max clamping
		assert.equal(stepDuplicateSelection([], null, 'next'), null)
		assert.equal(stepDuplicateSelection([], 1, 'previous'), null)

		const items = [{ id: 10 }, { id: 20 }, { id: 30 }]
		assert.equal(stepDuplicateSelection(items, null, 'next').id, 10)
		assert.equal(stepDuplicateSelection(items, 10, 'previous').id, 10)
		assert.equal(stepDuplicateSelection(items, 10, 'next').id, 20)
		assert.equal(stepDuplicateSelection(items, 20, 'next').id, 30)
		assert.equal(stepDuplicateSelection(items, 30, 'next').id, 30)
		assert.equal(stepDuplicateSelection(items, 30, 'previous').id, 20)

		const merged = buildNavigableDuplicates([{ id: 1 }], [{ id: 2 }, { id: 3 }])
		assert.deepEqual(merged.map(item => item.id), [1, 2, 3])
		assert.deepEqual(
			buildNavigableDuplicates([{ id: 1 }], [{ id: 2 }], { acknowledgedOpen: false }).map(item => item.id),
			[2],
		)
	})

	test('App.vue navigates duplicates with j/k/ArrowDown/ArrowUp and clamps cleanly at bounds and on empty list', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(1, 'one.txt')
		const d2 = makeDuplicate(2, 'two.txt')
		const d3 = makeDuplicate(3, 'three.txt')

		const { App } = createAppHarness({
			acknowledged: [{ ...d1, acknowledged: true }],
			unacknowledged: [d2, d3],
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			// Initial selection starts on first unacknowledged (d2)
			assert.equal(vm.currentDuplicate.id, 2)

			// j advances to d3 (max bound)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 3)

			// ArrowDown at max bound clamps at d3
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 3)

			// k moves back to d2, then ArrowUp moves to d1 (acknowledged section above)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 2)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// k at min bound clamps at d1
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}

		// Empty list stays safe without throwing
		const { App: EmptyApp } = createAppHarness({ acknowledged: [], unacknowledged: [] })
		const emptyVm = new Vue(EmptyApp).$mount()
		try {
			await settle()
			assert.equal(emptyVm.currentDuplicate, null)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(emptyVm.currentDuplicate, null)
		} finally {
			emptyVm.$destroy()
		}
	})

	test('App.vue focuses SearchBar on /, ignores shortcuts inside form fields, and toggles native <dialog> on ? / Escape', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(1, 'alpha.txt')
		const d2 = makeDuplicate(2, 'beta.txt')

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [d1, d2],
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)

		try {
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// "/" focuses SearchBar input and prevents default
			const slashEvent = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })
			window.dispatchEvent(slashEvent)
			await settle()
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput, 'SearchBar input is rendered')
			assert.equal(document.activeElement, searchInput)
			assert.equal(slashEvent.defaultPrevented, true)

			// Typing j, k, ? inside SearchBar input or textarea/select/contenteditable must be ignored
			for (const field of [searchInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(vm.currentDuplicate.id, 1, 'j inside editable targets must not change selection')
			assert.equal(vm.shortcutsDialogOpen, false, '? inside editable targets must not open dialog')

			// Pressing Escape inside SearchBar blurs it so shortcuts resume
			searchInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.notEqual(document.activeElement, searchInput)

			// "?" opens native <dialog>
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const dialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.ok(dialog, 'native <dialog> element exists')
			assert.equal(vm.shortcutsDialogOpen, true)
			assert.equal(dialog.open, true)
			assert.ok(dialog.querySelectorAll('kbd.shortcuts-dialog__kbd').length >= 5)

			// While dialog is open, j must not navigate duplicates
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 1)

			// Escape closes the native <dialog>
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.shortcutsDialogOpen, false)
			assert.equal(dialog.open, false)

			// "?" toggles open and "?" again toggles closed
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(dialog.open, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(dialog.open, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
		}
	})

	test('keyboardShortcuts module has zero typographic dashes and zero XSS sinks', () => {
		const source = readFileSync(resolve(root, 'src/tools/keyboardShortcuts.js'), 'utf8')
		assert.equal(/[\u2013\u2014]/.test(source), false)
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false)
	})
})

describe('Cycle 56: quick triage keyboard shortcuts o (Keep oldest) and c (Clear selection)', () => {
	test('resolveShortcutAction maps o/c, documents them in SHORTCUT_DEFINITIONS, and ignores editable targets, modifiers, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const keepOldestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-oldest')
		const clearSelectionDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'clear-selection')
		assert.deepEqual(keepOldestDef, { id: 'keep-oldest', keys: ['o'], action: 'keep-oldest' })
		assert.deepEqual(clearSelectionDef, { id: 'clear-selection', keys: ['c'], action: 'clear-selection' })

		assert.equal(resolveShortcutAction({ key: 'o' }), 'keep-oldest')
		assert.equal(resolveShortcutAction({ key: 'c' }), 'clear-selection')

		// Modifiers must never be hijacked (e.g. Ctrl+c / Cmd+c copy)
		assert.equal(resolveShortcutAction({ key: 'o', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'o', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'O', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'C', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'o' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'o' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'c' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'o', target }), null)
			assert.equal(resolveShortcutAction({ key: 'c', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue applies Keep oldest on o, clears on c, skips protected files, and ignores inside text fields or open <dialog>', async () => {
		window.localStorage.clear()
		const group = {
			id: 42,
			hash: 'hash-42',
			acknowledged: false,
			files: [
				{
					id: 421,
					nodeId: 421,
					path: '/alice/files/Origin/photo.jpg',
					size: 2048,
					mtime: 3000,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 422,
					nodeId: 422,
					path: '/alice/files/Archive/photo.jpg',
					size: 2048,
					mtime: 1000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 423,
					nodeId: 423,
					path: '/alice/files/Inbox/photo.jpg',
					size: 2048,
					mtime: 2000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')
			assert.equal(detailsVm.selectedFiles.length, 0)

			// 1. Pressing o applies Keep oldest (keeps mtime=1000 id=422, skips protected id=421, selects id=423)
			const oEvent = new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
			window.dispatchEvent(oEvent)
			await settle()
			assert.equal(oEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'oldest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// 2. Typing c inside editable fields must NOT clear selection
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput)
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// 3. Pressing c when an open <dialog> (shortcuts dialog) is open must NOT clear selection; o/c appear in dialog
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('o'), 'help dialog documents o shortcut')
			assert.ok(kbdLabels.includes('c'), 'help dialog documents c shortcut')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])

			// Close help dialog
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Pressing c when DuplicateDetails delete confirmation <dialog> is open must NOT clear selection
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			const deleteDialog = detailsVm.$el.querySelector('dialog.nc-confirm-dialog')
			assert.ok(deleteDialog)
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [423])
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. Pressing c in normal state clears selection completely
			const cEvent = new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })
			window.dispatchEvent(cEvent)
			await settle()
			assert.equal(cEvent.defaultPrevented, true)
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// 6. Pressing o inside editable field or while external <dialog open> is open must NOT select anything
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])

			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('o shortcut never selects protected-only groups and is ignored in bulk-delete view', async () => {
		window.localStorage.clear()
		const protectedOnlyGroup = {
			id: 77,
			hash: 'hash-77',
			acknowledged: false,
			files: [
				{
					id: 771,
					nodeId: 771,
					path: '/alice/files/OriginA/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
				{
					id: 772,
					nodeId: 772,
					path: '/alice/files/OriginB/doc.pdf',
					size: 1024,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [protectedOnlyGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// In bulk-delete view, o and c are safely ignored
			vm.openBulkDelete()
			await settle()
			const bulkO = new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true })
			const bulkC = new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkO)
			window.dispatchEvent(bulkC)
			await settle()
			assert.equal(bulkO.defaultPrevented, false)
			assert.equal(bulkC.defaultPrevented, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue supports o and c shortcuts in project-duplicate view as well', async () => {
		window.localStorage.clear()
		const projectGroup = {
			id: 88,
			hash: 'hash-88',
			acknowledged: false,
			files: [
				{
					id: 881,
					nodeId: 881,
					path: '/alice/files/Older/report.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 882,
					nodeId: 882,
					path: '/alice/files/Newer/report.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			vm.viewProjectDuplicate(projectGroup)
			await settle()

			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'o', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'oldest')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [882])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(projectDetailsVm.selectedFiles, [])
			assert.equal(projectDetailsVm.activeKeepRule, null)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})
})

describe('Cycle 80: quick triage triad shortcuts n (Keep newest) and s (Keep shortest path)', () => {
	test('resolveShortcutAction maps n/s, documents them in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const keepNewestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-newest')
		const keepShortestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'keep-shortest-path')
		assert.deepEqual(keepNewestDef, { id: 'keep-newest', keys: ['n'], action: 'keep-newest' })
		assert.deepEqual(keepShortestDef, { id: 'keep-shortest-path', keys: ['s'], action: 'keep-shortest-path' })

		assert.equal(resolveShortcutAction({ key: 'n' }), 'keep-newest')
		assert.equal(resolveShortcutAction({ key: 's' }), 'keep-shortest-path')

		// Modifiers and Shift must never be hijacked (e.g. Ctrl+s / Cmd+s save)
		assert.equal(resolveShortcutAction({ key: 'n', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 's', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 's', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'n', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'N', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'S', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'n' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 's' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'n' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 's' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'n', target }), null)
			assert.equal(resolveShortcutAction({ key: 's', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue applies Keep newest on n, Keep shortest path on s, updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const group = {
			id: 90,
			hash: 'hash-90',
			acknowledged: false,
			files: [
				{
					id: 901,
					nodeId: 901,
					path: '/alice/files/Origin/Very/Long/Folder/photo.jpg',
					size: 2048,
					mtime: 500,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 902,
					nodeId: 902,
					path: '/alice/files/B/photo.jpg',
					size: 2048,
					mtime: 1000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 903,
					nodeId: 903,
					path: '/alice/files/Deep/Folder/photo.jpg',
					size: 2048,
					mtime: 3000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			// 1. Pressing n keeps newest (mtime=3000 id=903), skips protected id=901, selects id=902
			const nEvent = new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })
			window.dispatchEvent(nEvent)
			await settle()
			assert.equal(nEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'newest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [902])

			// 2. Pressing s inside editable targets must NOT switch to shortest_path
			const searchInput = vm.$el.querySelector('input.search-input')
			assert.ok(searchInput)
			for (const field of [searchInput, externalTextarea, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [902])

			// 3. Help <dialog> documents n and s and blocks n/s while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('n'), 'help dialog documents n shortcut')
			assert.ok(kbdLabels.includes('s'), 'help dialog documents s shortcut')
			assert.ok(helpDialog.textContent.includes('Keep newest copy in active group'))
			assert.ok(helpDialog.textContent.includes('Keep shortest path copy in active group'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks s
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'newest')
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. Pressing s in normal state keeps shortest path (id=902), skips protected id=901, selects id=903
			const sEvent = new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
			window.dispatchEvent(sEvent)
			await settle()
			assert.equal(sEvent.defaultPrevented, true)
			assert.equal(detailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [903])

			// 6. External <dialog open> blocks n
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [903])
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('n and s shortcuts never select protected-only groups, ignore bulk-delete view, and work in project-duplicate view', async () => {
		window.localStorage.clear()
		const protectedOnlyGroup = {
			id: 91,
			hash: 'hash-91',
			acknowledged: false,
			files: [
				{
					id: 911,
					nodeId: 911,
					path: '/alice/files/OriginA/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
				{
					id: 912,
					nodeId: 912,
					path: '/alice/files/OriginB/Longer/doc.pdf',
					size: 1024,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
			],
		}
		const projectGroup = {
			id: 92,
			hash: 'hash-92',
			acknowledged: false,
			files: [
				{
					id: 921,
					nodeId: 921,
					path: '/alice/files/A/report.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 922,
					nodeId: 922,
					path: '/alice/files/Newer/Folder/report.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [protectedOnlyGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
			assert.equal(detailsVm.activeKeepRule, null)

			// Bulk-delete view ignores n and s
			vm.openBulkDelete()
			await settle()
			const bulkN = new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true })
			const bulkS = new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkN)
			window.dispatchEvent(bulkS)
			await settle()
			assert.equal(bulkN.defaultPrevented, false)
			assert.equal(bulkS.defaultPrevented, false)

			// Project-duplicate view supports n and s
			vm.viewProjectDuplicate(projectGroup)
			await settle()
			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'newest')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [921])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.activeKeepRule, 'shortest_path')
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [922])
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue and keyboardShortcuts.js preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of ['src/tools/keyboardShortcuts.js', 'src/App.vue']) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 83: keyboard shortcut r (reset-filters) in DuplicateNavigation and App', () => {
	test('resolveShortcutAction maps r to reset-filters, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const resetFiltersDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'reset-filters')
		assert.deepEqual(resetFiltersDef, { id: 'reset-filters', keys: ['r'], action: 'reset-filters' })

		assert.equal(resolveShortcutAction({ key: 'r' }), 'reset-filters')

		// Browser reload and modifiers must never be hijacked (Ctrl+r / Cmd+r / Alt+r / Shift+R)
		assert.equal(resolveShortcutAction({ key: 'r', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'R', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'r' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'r' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'r', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue resets all active filters on r, documents r in ? <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const photoGroup = {
			id: 101,
			hash: 'hash-101',
			acknowledged: false,
			files: [
				{ id: 1011, nodeId: 1011, path: '/alice/files/Photos/pic.jpg', size: 2 * 1024 * 1024, mtime: 1000, mimetype: 'image/jpeg' },
				{ id: 1012, nodeId: 1012, path: '/alice/files/Backup/pic.jpg', size: 2 * 1024 * 1024, mtime: 2000, mimetype: 'image/jpeg' },
				{ id: 1013, nodeId: 1013, path: '/alice/files/Archive/pic.jpg', size: 2 * 1024 * 1024, mtime: 3000, mimetype: 'image/jpeg' },
			],
		}
		const docGroup = {
			id: 102,
			hash: 'hash-102',
			acknowledged: false,
			files: [
				{ id: 1021, nodeId: 1021, path: '/alice/files/Docs/note.txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 1022, nodeId: 1022, path: '/alice/files/Copy/note.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [photoGroup, docGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			// Activate multiple filters + sorting + search
			navVm.setCategoryFilter('images')
			navVm.toggleExtensionFilter('.jpg')
			navVm.folderQuery = '/Photos'
			navVm.setMinCopiesPreset('3plus')
			navVm.setSortOption('size-desc')
			navVm.setMinSizeBytes(1024 * 1024)
			navVm.handleSearch({ query: 'pic', type: 'simple' })
			if (navVm.$refs.searchBar) {
				navVm.$refs.searchBar.searchQuery = 'pic'
			}
			await settle()

			assert.equal(navVm.hasActiveFilters, true)
			const resetBtn = navVm.$el.querySelector('button.reset-filters-button')
			assert.ok(resetBtn, 'Reset filters button renders when filters are active')
			assert.ok(resetBtn.getAttribute('aria-keyshortcuts').split(' ').includes('r'))

			// 1. Pressing r inside editable inputs/select/textarea/contenteditable must NOT reset filters
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			assert.equal(navVm.selectedCategory, 'images')
			assert.equal(navVm.folderQuery, '/Photos')

			// 2. ? help <dialog> documents r and blocks r while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('r'), 'help dialog documents r shortcut')
			assert.ok(helpDialog.textContent.includes('Reset all active filters and sorting'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 3. Delete confirmation <dialog> blocks r
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 4. External <dialog open> blocks r
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			externalDialog.removeAttribute('open')

			// 5. Pressing r in normal details view resets all active filters and sorting in 1 key
			const rEvent = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(rEvent)
			await settle()
			assert.equal(rEvent.defaultPrevented, true)
			assert.equal(navVm.selectedCategory, 'all')
			assert.equal(navVm.selectedExtension, '')
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.selectedMinCopiesPreset, 'any')
			assert.equal(navVm.sortOption, 'none')
			assert.equal(navVm.minSizeBytes, 0)
			assert.equal(navVm.searchPattern, '')
			assert.equal(navVm.hasActiveFilters, false)
			assert.equal(navVm.$el.querySelector('button.reset-filters-button'), null)
			assert.equal(navVm.filteredUnacknowledgedDuplicates.length, 2)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('r shortcut is a safe no-op when no filters are active or when activeView is bulk-delete', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(110, 'alpha.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [d1],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			assert.equal(navVm.hasActiveFilters, false)

			// No active filters -> r does not preventDefault
			const idleR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(idleR)
			await settle()
			assert.equal(idleR.defaultPrevented, false)

			// Active filter in bulk-delete view -> r is ignored
			navVm.folderQuery = '/A'
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			vm.openBulkDelete()
			await settle()
			const bulkR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkR)
			await settle()
			assert.equal(bulkR.defaultPrevented, false)
			assert.equal(navVm.folderQuery, '/A')

			// Returning to details view allows r to reset the filter
			vm.closeBulkDelete()
			await settle()
			const detailsR = new window.KeyboardEvent('keydown', { key: 'r', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsR)
			await settle()
			assert.equal(detailsR.defaultPrevented, true)
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.hasActiveFilters, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 83 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 90: keyboard shortcut y (copy-group-hash) in DuplicateDetails and App', () => {
	test('resolveShortcutAction maps y to copy-group-hash, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const copyHashDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'copy-group-hash')
		assert.deepEqual(copyHashDef, { id: 'copy-group-hash', keys: ['y'], action: 'copy-group-hash' })

		assert.equal(resolveShortcutAction({ key: 'y' }), 'copy-group-hash')

		// Browser redo/modifiers and Shift must never be hijacked (Ctrl+y / Cmd+y / Alt+y / Shift+Y)
		assert.equal(resolveShortcutAction({ key: 'y', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'Y', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'y' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'y' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'y', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue copies group hash on y, sets aria-keyshortcuts="y", documents y in ? <dialog>, and ignores editable fields, modifiers, or open <dialog>', async () => {
		window.localStorage.clear()
		const copiedValues = []
		const group = {
			id: 201,
			hash: '0123456789abcdef0123456789abcdef',
			acknowledged: false,
			files: [
				{ id: 2011, nodeId: 2011, path: '/alice/files/A/archive.zip', size: 4096, mtime: 1000, mimetype: 'application/zip' },
				{ id: 2012, nodeId: 2012, path: '/alice/files/B/archive.zip', size: 4096, mtime: 2000, mimetype: 'application/zip' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
			clipboardImpl: {
				writeText: async value => {
					copiedValues.push(value)
				},
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const copyHashButton = detailsVm.$el.querySelector('button.group-header-summary__copy-hash-button')
			assert.ok(copyHashButton, 'Copy hash button is rendered')
			assert.equal(copyHashButton.getAttribute('aria-keyshortcuts'), 'y')

			// 1. Typing y inside editable inputs/select/textarea/contenteditable must NOT copy
			const searchInput = vm.$el.querySelector('input.search-input')
			const folderInput = vm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(copiedValues, [])
			assert.equal(detailsVm.hashCopyStatus, 'idle')

			// 2. Modifiers (Ctrl+y / Cmd+y / Alt+y / Shift+Y) must NOT copy or preventDefault
			for (const init of [
				{ key: 'y', ctrlKey: true },
				{ key: 'y', metaKey: true },
				{ key: 'y', altKey: true },
				{ key: 'Y', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.deepEqual(copiedValues, [])

			// 3. ? help <dialog> documents y and blocks y while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('y'), 'help dialog documents y shortcut')
			assert.ok(helpDialog.textContent.includes('Copy active group hash'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks y
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks y
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(copiedValues, [])
			externalDialog.removeAttribute('open')

			// 6. Pressing y in normal view copies full group hash and updates live status
			const yEvent = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(yEvent)
			await settle()
			assert.equal(yEvent.defaultPrevented, true)
			assert.deepEqual(copiedValues, ['0123456789abcdef0123456789abcdef'])
			assert.equal(detailsVm.hashCopyStatus, 'copied')
			assert.equal(detailsVm.hashCopyStatusMessage, 'Copied')
			const statusEl = detailsVm.$el.querySelector('.group-header-summary__copy-status')
			assert.ok(statusEl)
			assert.equal(statusEl.textContent.trim(), 'Copied')
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('y shortcut is a safe no-op when hash is missing or in bulk-delete view, works in project-duplicate view, and reports clipboard failures cleanly', async () => {
		window.localStorage.clear()
		const copiedValues = []
		let shouldFailClipboard = false

		const missingHashGroup = {
			id: 202,
			hash: '',
			acknowledged: false,
			files: [
				{ id: 2021, nodeId: 2021, path: '/alice/files/A/doc.txt', size: 512, mtime: 1000, mimetype: 'text/plain' },
				{ id: 2022, nodeId: 2022, path: '/alice/files/B/doc.txt', size: 512, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const projectGroup = {
			id: 203,
			hash: 'fedcba9876543210fedcba9876543210',
			acknowledged: false,
			files: [
				{ id: 2031, nodeId: 2031, path: '/alice/files/P1/spec.pdf', size: 1024, mtime: 1000, mimetype: 'application/pdf' },
				{ id: 2032, nodeId: 2032, path: '/alice/files/P2/spec.pdf', size: 1024, mtime: 2000, mimetype: 'application/pdf' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [missingHashGroup],
			useRealDetails: true,
			clipboardImpl: {
				writeText: async value => {
					if (shouldFailClipboard) {
						throw new Error('Clipboard denied')
					}
					copiedValues.push(value)
				},
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			// Missing hash -> safe no-op
			const noHashEvent = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(noHashEvent)
			await settle()
			assert.equal(noHashEvent.defaultPrevented, false)
			assert.deepEqual(copiedValues, [])

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkY = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkY)
			await settle()
			assert.equal(bulkY.defaultPrevented, false)
			assert.deepEqual(copiedValues, [])

			// Project-duplicate view -> copies group hash
			vm.viewProjectDuplicate(projectGroup)
			await settle()
			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			const projectY = new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true })
			window.dispatchEvent(projectY)
			await settle()
			assert.equal(projectY.defaultPrevented, true)
			assert.deepEqual(copiedValues, ['fedcba9876543210fedcba9876543210'])
			assert.equal(projectDetailsVm.hashCopyStatus, 'copied')

			// Clipboard failure -> Copy failed without uncaught throw
			shouldFailClipboard = true
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'y', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(projectDetailsVm.hashCopyStatus, 'error')
			assert.equal(projectDetailsVm.hashCopyStatusMessage, 'Copy failed')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 90 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateDetails.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 93: keyboard shortcut 0 (reset-all-filters) and aria-live filtered group count', () => {
	test('resolveShortcutAction maps 0 to reset-all-filters, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const resetAllDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'reset-all-filters')
		assert.deepEqual(resetAllDef, { id: 'reset-all-filters', keys: ['0'], action: 'reset-all-filters' })

		assert.equal(resolveShortcutAction({ key: '0' }), 'reset-all-filters')

		// Browser zoom/tab modifiers and Shift must never be hijacked (Ctrl+0 / Cmd+0 / Alt+0 / Shift+0)
		assert.equal(resolveShortcutAction({ key: '0', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: '0', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: '0', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: '0', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: '0' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: '0' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: '0', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue resets all active filters on 0, sets aria-keyshortcuts="r 0", announces filtered group count via aria-live="polite", and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const photoGroup = {
			id: 301,
			hash: 'hash-301',
			acknowledged: false,
			files: [
				{ id: 3011, nodeId: 3011, path: '/alice/files/Photos/pic.jpg', size: 2 * 1024 * 1024, mtime: 1000, mimetype: 'image/jpeg' },
				{ id: 3012, nodeId: 3012, path: '/alice/files/Backup/pic.jpg', size: 2 * 1024 * 1024, mtime: 2000, mimetype: 'image/jpeg' },
				{ id: 3013, nodeId: 3013, path: '/alice/files/Archive/pic.jpg', size: 2 * 1024 * 1024, mtime: 3000, mimetype: 'image/jpeg' },
			],
		}
		const docGroup = {
			id: 302,
			hash: 'hash-302',
			acknowledged: false,
			files: [
				{ id: 3021, nodeId: 3021, path: '/alice/files/Docs/note.txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 3022, nodeId: 3022, path: '/alice/files/Copy/note.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [photoGroup, docGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const liveRegion = navVm.$el.querySelector('.filtered-groups-live-status')
			assert.ok(liveRegion, 'aria-live filtered groups region is rendered')
			assert.equal(liveRegion.getAttribute('aria-live'), 'polite')
			assert.equal(liveRegion.getAttribute('aria-atomic'), 'true')
			assert.ok(liveRegion.classList.contains('sr-only'))
			assert.equal(liveRegion.textContent.trim(), '2 duplicate groups shown')

			// Activate multiple filters + sorting + search -> live region announces filtered count
			navVm.setCategoryFilter('images')
			navVm.toggleExtensionFilter('.jpg')
			navVm.folderQuery = '/Photos'
			navVm.setMinCopiesPreset('3plus')
			navVm.setSortOption('size-desc')
			navVm.setMinSizeBytes(1024 * 1024)
			navVm.handleSearch({ query: 'pic', type: 'simple' })
			if (navVm.$refs.searchBar) {
				navVm.$refs.searchBar.searchQuery = 'pic'
			}
			await settle()

			assert.equal(navVm.hasActiveFilters, true)
			assert.equal(liveRegion.textContent.trim(), '1 of 2 duplicate groups shown')
			const resetBtn = navVm.$el.querySelector('button.reset-filters-button')
			assert.ok(resetBtn, 'Reset filters button renders when filters are active')
			assert.equal(resetBtn.getAttribute('aria-keyshortcuts'), 'r 0')

			// 1. Typing 0 inside editable inputs/select/textarea/contenteditable must NOT reset filters
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			assert.equal(navVm.selectedCategory, 'images')
			assert.equal(navVm.folderQuery, '/Photos')

			// 2. Modifiers (Ctrl+0 / Cmd+0 / Alt+0 / Shift+0) must NOT reset filters or preventDefault
			for (const init of [
				{ key: '0', ctrlKey: true },
				{ key: '0', metaKey: true },
				{ key: '0', altKey: true },
				{ key: '0', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			// 3. ? help <dialog> documents 0 ("Reset all active filters") and blocks 0 while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('0'), 'help dialog documents 0 shortcut')
			assert.ok(helpDialog.textContent.includes('Reset all active filters'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks 0
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks 0
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			externalDialog.removeAttribute('open')

			// 6. Narrowing to 0 matches updates live region to 0 of 2 and sets aria-keyshortcuts on empty-state button
			navVm.folderQuery = '/NonExistentFolder'
			await settle()
			assert.equal(liveRegion.textContent.trim(), '0 of 2 duplicate groups shown')
			const emptyResetBtn = navVm.$el.querySelector('button.empty-state-reset-button')
			assert.ok(emptyResetBtn)
			assert.ok(emptyResetBtn.getAttribute('aria-keyshortcuts').split(' ').includes('0'))

			// 7. Pressing 0 in normal details view resets all active filters and sorting and announces restored count
			const zeroEvent = new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true })
			window.dispatchEvent(zeroEvent)
			await settle()
			assert.equal(zeroEvent.defaultPrevented, true)
			assert.equal(navVm.selectedCategory, 'all')
			assert.equal(navVm.selectedExtension, '')
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.selectedMinCopiesPreset, 'any')
			assert.equal(navVm.sortOption, 'none')
			assert.equal(navVm.minSizeBytes, 0)
			assert.equal(navVm.searchPattern, '')
			assert.equal(navVm.hasActiveFilters, false)
			assert.equal(navVm.$el.querySelector('button.reset-filters-button'), null)
			assert.equal(navVm.filteredUnacknowledgedDuplicates.length, 2)
			assert.equal(liveRegion.textContent.trim(), '2 duplicate groups shown')
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('0 shortcut is a safe no-op when no filters are active or when activeView is bulk-delete', async () => {
		window.localStorage.clear()
		const d1 = makeDuplicate(310, 'alpha.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [d1],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const liveRegion = navVm.$el.querySelector('.filtered-groups-live-status')
			assert.equal(navVm.hasActiveFilters, false)
			assert.equal(liveRegion.textContent.trim(), '1 duplicate group shown')

			// No active filters -> 0 does not preventDefault
			const idleZero = new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true })
			window.dispatchEvent(idleZero)
			await settle()
			assert.equal(idleZero.defaultPrevented, false)

			// Active filter in bulk-delete view -> 0 is ignored
			navVm.folderQuery = '/A'
			await settle()
			assert.equal(navVm.hasActiveFilters, true)
			assert.equal(liveRegion.textContent.trim(), '1 of 1 duplicate group shown')

			vm.openBulkDelete()
			await settle()
			const bulkZero = new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkZero)
			await settle()
			assert.equal(bulkZero.defaultPrevented, false)
			assert.equal(navVm.folderQuery, '/A')

			// Returning to details view allows 0 to reset the filter
			vm.closeBulkDelete()
			await settle()
			const detailsZero = new window.KeyboardEvent('keydown', { key: '0', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsZero)
			await settle()
			assert.equal(detailsZero.defaultPrevented, true)
			assert.equal(navVm.folderQuery, '')
			assert.equal(navVm.hasActiveFilters, false)
			assert.equal(liveRegion.textContent.trim(), '1 duplicate group shown')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 93 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 96: keyboard shortcut g (jump-to-largest-group)', () => {
	test('resolveShortcutAction maps g to jump-to-largest-group, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const jumpLargestDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'jump-to-largest-group')
		assert.deepEqual(jumpLargestDef, {
			id: 'jump-to-largest-group',
			keys: ['g'],
			action: 'jump-to-largest-group',
		})

		assert.equal(resolveShortcutAction({ key: 'g' }), 'jump-to-largest-group')

		// Browser find/navigation modifiers and Shift must never be hijacked (Ctrl+g / Cmd+g / Alt+g / Shift+g)
		assert.equal(resolveShortcutAction({ key: 'g', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'g', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'g', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'G', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'g' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'g' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'g', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue jumps to largest reclaimable group on g, sets aria-keyshortcuts="g", updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const MB = 1024 * 1024
		const smallDocGroup = {
			id: 401,
			hash: 'hash-401',
			acknowledged: false,
			files: [
				{ id: 4011, nodeId: 4011, path: '/alice/files/Docs/small.txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 4012, nodeId: 4012, path: '/alice/files/Copy/small.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const mediumTwoCopyGroup = {
			id: 402,
			hash: 'hash-402',
			acknowledged: false,
			files: [
				{ id: 4021, nodeId: 4021, path: '/alice/files/Media/clipA.mp4', size: 3 * MB, mtime: 1000, mimetype: 'video/mp4' },
				{ id: 4022, nodeId: 4022, path: '/alice/files/Media/clipB.mp4', size: 3 * MB, mtime: 2000, mimetype: 'video/mp4' },
			],
		} // reclaimable: 3 MB
		const largestThreeCopyGroup = {
			id: 403,
			hash: 'hash-403',
			acknowledged: true,
			files: [
				{ id: 4031, nodeId: 4031, path: '/alice/files/Photos/raw1.jpg', size: 2 * MB, mtime: 1000, mimetype: 'image/jpeg' },
				{ id: 4032, nodeId: 4032, path: '/alice/files/Photos/raw2.jpg', size: 2 * MB, mtime: 2000, mimetype: 'image/jpeg' },
				{ id: 4033, nodeId: 4033, path: '/alice/files/Photos/raw3.jpg', size: 2 * MB, mtime: 3000, mimetype: 'image/jpeg' },
			],
		} // reclaimable: 4 MB

		const { App } = createAppHarness({
			acknowledged: [largestThreeCopyGroup],
			unacknowledged: [smallDocGroup, mediumTwoCopyGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')
			assert.equal(vm.currentDuplicate.id, 401)

			const jumpBtn = navVm.$el.querySelector('button.largest-group-jump-button')
			assert.ok(jumpBtn, 'largest group jump button is rendered')
			assert.equal(jumpBtn.getAttribute('aria-keyshortcuts'), 'g')

			// 1. Typing g inside editable fields must NOT jump
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(vm.currentDuplicate.id, 401)

			// 2. Modifiers (Ctrl+g / Cmd+g / Alt+g / Shift+g) must NOT jump or preventDefault
			for (const init of [
				{ key: 'g', ctrlKey: true },
				{ key: 'g', metaKey: true },
				{ key: 'g', altKey: true },
				{ key: 'G', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(vm.currentDuplicate.id, 401)

			// 3. ? help <dialog> documents g ("Jump to largest reclaimable group") and blocks g while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('g'), 'help dialog documents g shortcut')
			assert.ok(helpDialog.textContent.includes('Jump to largest reclaimable group'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 401)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks g
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 401)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks g
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 401)
			externalDialog.removeAttribute('open')

			// 6. Pressing g jumps to the largest reclaimable group (id 403, 4 MB reclaimable)
			const gEvent = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(gEvent)
			await settle()
			assert.equal(gEvent.defaultPrevented, true)
			assert.equal(vm.currentDuplicate.id, 403)
			assert.equal(navVm.activeSection, 'acknowledged')

			// 7. With category filter active ("videos"), g jumps to largest within active filtered set (id 402)
			navVm.setCategoryFilter('videos')
			await settle()
			const filteredGEvent = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(filteredGEvent)
			await settle()
			assert.equal(filteredGEvent.defaultPrevented, true)
			assert.equal(vm.currentDuplicate.id, 402)
			assert.equal(navVm.activeSection, 'unacknowledged')
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('g shortcut is a safe no-op when no groups are available or outside details view', async () => {
		window.localStorage.clear()

		// Empty duplicate lists -> safe no-op without preventDefault
		const { App: EmptyApp } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue(EmptyApp).$mount(emptyMount)
		try {
			await settle()
			assert.equal(emptyVm.currentDuplicate, null)
			const emptyG = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(emptyG)
			await settle()
			assert.equal(emptyG.defaultPrevented, false)
			assert.equal(emptyVm.currentDuplicate, null)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Non-details view (bulk-delete) and zero-match filter -> ignored; works again in details view
		const smallGroup = makeDuplicate(410, 'small.txt')
		const largeGroup = {
			id: 411,
			hash: 'hash-411',
			acknowledged: false,
			files: [
				{ id: 4111, nodeId: 4111, path: '/alice/files/A/big.bin', size: 1024 * 1024, mtime: 1000, mimetype: 'application/octet-stream' },
				{ id: 4112, nodeId: 4112, path: '/alice/files/B/big.bin', size: 1024 * 1024, mtime: 2000, mimetype: 'application/octet-stream' },
			],
		}
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [smallGroup, largeGroup],
			useRealDetails: true,
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			assert.equal(vm.currentDuplicate.id, 410)

			// Filtered to zero matches -> safe no-op
			navVm.folderQuery = '/NoMatch'
			await settle()
			const noMatchG = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(noMatchG)
			await settle()
			assert.equal(noMatchG.defaultPrevented, false)
			assert.equal(vm.currentDuplicate.id, 410)

			navVm.folderQuery = ''
			await settle()

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkG = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkG)
			await settle()
			assert.equal(bulkG.defaultPrevented, false)
			assert.equal(vm.activeView, 'bulk-delete')
			assert.equal(vm.currentDuplicate, null)

			// Return to details view -> g jumps to id 411
			vm.closeBulkDelete()
			await settle()
			const detailsG = new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsG)
			await settle()
			assert.equal(detailsG.defaultPrevented, true)
			assert.equal(vm.currentDuplicate.id, 411)
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 96 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 99: keyboard shortcut e (export-csv-report)', () => {
	test('resolveShortcutAction maps e to export-csv-report, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const exportCsvDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'export-csv-report')
		assert.deepEqual(exportCsvDef, {
			id: 'export-csv-report',
			keys: ['e'],
			action: 'export-csv-report',
		})

		assert.equal(resolveShortcutAction({ key: 'e' }), 'export-csv-report')

		// Browser modifiers and Shift must never be hijacked (Ctrl+e / Cmd+e / Alt+e / Shift+E)
		assert.equal(resolveShortcutAction({ key: 'e', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'e', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'e', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'E', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'e' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'e' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'e', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue triggers CWE-1236 safe CSV export on e, sets aria-keyshortcuts="e", updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const MB = 1024 * 1024
		const formulaDocGroup = {
			id: 501,
			hash: 'hash-501',
			acknowledged: false,
			files: [
				{ id: 5011, nodeId: 5011, path: '=SUM(A1).txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 5012, nodeId: 5012, path: '/alice/files/Copy/safe.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const videoGroup = {
			id: 502,
			hash: 'hash-502',
			acknowledged: true,
			files: [
				{ id: 5021, nodeId: 5021, path: '/alice/files/Media/clipA.mp4', size: 2 * MB, mtime: 1000, mimetype: 'video/mp4' },
				{ id: 5022, nodeId: 5022, path: '/alice/files/Media/clipB.mp4', size: 2 * MB, mtime: 2000, mimetype: 'video/mp4' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [videoGroup],
			unacknowledged: [formulaDocGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		const originalCreateObjectURL = global.URL.createObjectURL
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const clickedLinks = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:https://cloud.example.test/mock-csv-cycle99'
		}
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = function clickSpy() {
			clickedLinks.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const exportCsvBtn = navVm.$el.querySelector('button.export-csv-button')
			assert.ok(exportCsvBtn, 'Export CSV button is rendered')
			assert.equal(exportCsvBtn.getAttribute('aria-keyshortcuts'), 'e')

			// 1. Typing e inside editable fields must NOT export
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(capturedBlobs.length, 0)

			// 2. Modifiers (Ctrl+e / Cmd+e / Alt+e / Shift+E) must NOT export or preventDefault
			for (const init of [
				{ key: 'e', ctrlKey: true },
				{ key: 'e', metaKey: true },
				{ key: 'e', altKey: true },
				{ key: 'E', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(capturedBlobs.length, 0)

			// 3. ? help <dialog> documents e ("Export current duplicate report (CSV)") and blocks e while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('e'), 'help dialog documents e shortcut')
			assert.ok(helpDialog.textContent.includes('Export current duplicate report (CSV)'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks e
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks e
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)
			externalDialog.removeAttribute('open')

			// 6. Pressing e triggers secure CSV export (with CWE-1236 neutralization)
			const eEvent = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(eEvent)
			await settle()
			assert.equal(eEvent.defaultPrevented, true)
			assert.equal(capturedBlobs.length, 1)
			assert.equal(clickedLinks.length, 1)
			assert.equal(clickedLinks[0].download, 'duplicates-export.csv')
			assert.ok(clickedLinks[0].href.startsWith('blob:'))

			const fullCsv = await capturedBlobs[0].text()
			assert.ok(fullCsv.includes('hash-501'))
			assert.ok(fullCsv.includes('hash-502'))
			assert.ok(fullCsv.includes('"\'=SUM(A1).txt"'), 'CWE-1236 formula trigger is neutralized in exported CSV')

			// 7. With category filter active ("videos"), e exports only filtered groups
			navVm.setCategoryFilter('videos')
			await settle()
			const filteredEEvent = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(filteredEEvent)
			await settle()
			assert.equal(filteredEEvent.defaultPrevented, true)
			assert.equal(capturedBlobs.length, 2)
			const filteredCsv = await capturedBlobs[1].text()
			assert.ok(filteredCsv.includes('hash-502'))
			assert.ok(!filteredCsv.includes('hash-501'))
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('e shortcut is a safe no-op when no groups are available or outside details view', async () => {
		window.localStorage.clear()

		const originalCreateObjectURL = global.URL.createObjectURL
		let exportCount = 0
		global.URL.createObjectURL = () => {
			exportCount += 1
			return 'blob:https://cloud.example.test/mock-csv-noop'
		}

		// Empty duplicate lists -> safe no-op without preventDefault
		const { App: EmptyApp } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue(EmptyApp).$mount(emptyMount)
		try {
			await settle()
			const emptyE = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(emptyE)
			await settle()
			assert.equal(emptyE.defaultPrevented, false)
			assert.equal(exportCount, 0)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Non-details view (bulk-delete) and zero-match filter -> ignored; works again in details view
		const group = makeDuplicate(510, 'report.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = () => {}

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation

			// Filtered to zero matches -> safe no-op
			navVm.folderQuery = '/NoMatch'
			await settle()
			const noMatchE = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(noMatchE)
			await settle()
			assert.equal(noMatchE.defaultPrevented, false)
			assert.equal(exportCount, 0)

			navVm.folderQuery = ''
			await settle()

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkE = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkE)
			await settle()
			assert.equal(bulkE.defaultPrevented, false)
			assert.equal(vm.activeView, 'bulk-delete')
			assert.equal(exportCount, 0)

			// Return to details view -> e triggers export
			vm.closeBulkDelete()
			await settle()
			const detailsE = new window.KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsE)
			await settle()
			assert.equal(detailsE.defaultPrevented, true)
			assert.equal(exportCount, 1)
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 99 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 102: keyboard shortcut x (export-json-report)', () => {
	test('resolveShortcutAction maps x to export-json-report, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const exportJsonDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'export-json-report')
		assert.deepEqual(exportJsonDef, {
			id: 'export-json-report',
			keys: ['x'],
			action: 'export-json-report',
		})

		assert.equal(resolveShortcutAction({ key: 'x' }), 'export-json-report')

		// Browser modifiers and Shift must never be hijacked (Ctrl+x / Cmd+x / Alt+x / Shift+X)
		assert.equal(resolveShortcutAction({ key: 'x', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'x', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'x', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'X', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'x' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'x' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'x', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue triggers structured JSON export (duplicatefinder.report.v1) on x, sets aria-keyshortcuts="x", updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const MB = 1024 * 1024
		const docGroup = {
			id: 601,
			hash: 'hash-601',
			acknowledged: false,
			files: [
				{ id: 6011, nodeId: 6011, path: '/alice/files/Docs/noteA.txt', size: 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 6012, nodeId: 6012, path: '/alice/files/Docs/noteB.txt', size: 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const videoGroup = {
			id: 602,
			hash: 'hash-602',
			acknowledged: true,
			files: [
				{ id: 6021, nodeId: 6021, path: '/alice/files/Media/clipA.mp4', size: 2 * MB, mtime: 1000, mimetype: 'video/mp4' },
				{ id: 6022, nodeId: 6022, path: '/alice/files/Media/clipB.mp4', size: 2 * MB, mtime: 2000, mimetype: 'video/mp4' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [videoGroup],
			unacknowledged: [docGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		const originalCreateObjectURL = global.URL.createObjectURL
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		const capturedBlobs = []
		const clickedLinks = []

		global.URL.createObjectURL = blob => {
			capturedBlobs.push(blob)
			return 'blob:https://cloud.example.test/mock-json-cycle102'
		}
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = function clickSpy() {
			clickedLinks.push({
				href: this.href,
				download: this.getAttribute('download'),
			})
		}

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const exportJsonBtn = navVm.$el.querySelector('button.export-json-button')
			assert.ok(exportJsonBtn, 'Export JSON button is rendered')
			assert.equal(exportJsonBtn.getAttribute('aria-keyshortcuts'), 'x')

			// 1. Typing x inside editable fields must NOT export
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(capturedBlobs.length, 0)

			// 2. Modifiers (Ctrl+x / Cmd+x / Alt+x / Shift+X) must NOT export or preventDefault
			for (const init of [
				{ key: 'x', ctrlKey: true },
				{ key: 'x', metaKey: true },
				{ key: 'x', altKey: true },
				{ key: 'X', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(capturedBlobs.length, 0)

			// 3. ? help <dialog> documents x ("Export current duplicate report (JSON)") and blocks x while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('x'), 'help dialog documents x shortcut')
			assert.ok(helpDialog.textContent.includes('Export current duplicate report (JSON)'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Delete confirmation <dialog> blocks x
			detailsVm.applyKeepRule('oldest')
			await settle()
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			// 5. External <dialog open> blocks x
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(capturedBlobs.length, 0)
			externalDialog.removeAttribute('open')

			// 6. Pressing x triggers structured JSON export (duplicatefinder.report.v1)
			const xEvent = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(xEvent)
			await settle()
			assert.equal(xEvent.defaultPrevented, true)
			assert.equal(capturedBlobs.length, 1)
			assert.equal(clickedLinks.length, 1)
			assert.equal(clickedLinks[0].download, 'duplicates-export.json')
			assert.ok(clickedLinks[0].href.startsWith('blob:'))
			assert.ok(String(capturedBlobs[0].type).startsWith('application/json'))

			const fullReport = JSON.parse(await capturedBlobs[0].text())
			assert.equal(fullReport.schema, 'duplicatefinder.report.v1')
			assert.equal(fullReport.groupCount, 2)
			assert.equal(fullReport.totalReclaimableBytes, 1024 + (2 * MB))
			assert.deepEqual(
				fullReport.groups.map(group => group.hash),
				['hash-601', 'hash-602'],
			)

			// 7. With category filter active ("videos"), x exports only filtered groups
			navVm.setCategoryFilter('videos')
			await settle()
			const filteredXEvent = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(filteredXEvent)
			await settle()
			assert.equal(filteredXEvent.defaultPrevented, true)
			assert.equal(capturedBlobs.length, 2)
			const filteredReport = JSON.parse(await capturedBlobs[1].text())
			assert.equal(filteredReport.schema, 'duplicatefinder.report.v1')
			assert.equal(filteredReport.groupCount, 1)
			assert.deepEqual(
				filteredReport.groups.map(group => group.hash),
				['hash-602'],
			)
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('x shortcut is a safe no-op when no groups are available or outside details view', async () => {
		window.localStorage.clear()

		const originalCreateObjectURL = global.URL.createObjectURL
		let exportCount = 0
		global.URL.createObjectURL = () => {
			exportCount += 1
			return 'blob:https://cloud.example.test/mock-json-noop'
		}

		// Empty duplicate lists -> safe no-op without preventDefault
		const { App: EmptyApp } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue(EmptyApp).$mount(emptyMount)
		try {
			await settle()
			const emptyX = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(emptyX)
			await settle()
			assert.equal(emptyX.defaultPrevented, false)
			assert.equal(exportCount, 0)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Non-details view (bulk-delete) and zero-match filter -> ignored; works again in details view
		const group = makeDuplicate(610, 'report.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [group],
			useRealDetails: true,
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		const originalRevokeObjectURL = global.URL.revokeObjectURL
		const originalAnchorClick = document.defaultView.HTMLAnchorElement.prototype.click
		global.URL.revokeObjectURL = () => {}
		document.defaultView.HTMLAnchorElement.prototype.click = () => {}

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation

			// Filtered to zero matches -> safe no-op
			navVm.folderQuery = '/NoMatch'
			await settle()
			const noMatchX = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(noMatchX)
			await settle()
			assert.equal(noMatchX.defaultPrevented, false)
			assert.equal(exportCount, 0)

			navVm.folderQuery = ''
			await settle()

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkX = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkX)
			await settle()
			assert.equal(bulkX.defaultPrevented, false)
			assert.equal(vm.activeView, 'bulk-delete')
			assert.equal(exportCount, 0)

			// Return to details view -> x triggers export
			vm.closeBulkDelete()
			await settle()
			const detailsX = new window.KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })
			window.dispatchEvent(detailsX)
			await settle()
			assert.equal(detailsX.defaultPrevented, true)
			assert.equal(exportCount, 1)
		} finally {
			global.URL.createObjectURL = originalCreateObjectURL
			global.URL.revokeObjectURL = originalRevokeObjectURL
			document.defaultView.HTMLAnchorElement.prototype.click = originalAnchorClick
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 102 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateNavigation.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 105: keyboard shortcut a (select-duplicate-copies)', () => {
	test('resolveShortcutAction maps a to select-duplicate-copies, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const selectCopiesDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'select-duplicate-copies')
		assert.deepEqual(selectCopiesDef, {
			id: 'select-duplicate-copies',
			keys: ['a'],
			action: 'select-duplicate-copies',
		})

		assert.equal(resolveShortcutAction({ key: 'a' }), 'select-duplicate-copies')

		// Browser Select All and modifiers must never be hijacked (Ctrl+a / Cmd+a / Alt+a / Shift+A)
		assert.equal(resolveShortcutAction({ key: 'a', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'a', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'a', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'A', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'a' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'a' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'a', target }), null)
		}
	})

	test('App.vue -> DuplicateDetails.vue toggles safe duplicate copy selection on a, sets aria-keyshortcuts="a", updates help <dialog>, and ignores editable fields or open <dialog>', async () => {
		window.localStorage.clear()
		const mixedGroup = {
			id: 701,
			hash: 'hash-701',
			acknowledged: false,
			files: [
				{
					id: 7011,
					nodeId: 7011,
					path: '/alice/files/Origin/photo.jpg',
					size: 2048,
					mtime: 3000,
					mimetype: 'image/jpeg',
					isInOriginFolder: true,
				},
				{
					id: 7012,
					nodeId: 7012,
					path: '/alice/files/Archive/photo.jpg',
					size: 2048,
					mtime: 1000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
				{
					id: 7013,
					nodeId: 7013,
					path: '/alice/files/Inbox/photo.jpg',
					size: 2048,
					mtime: 2000,
					mimetype: 'image/jpeg',
					isInOriginFolder: false,
				},
			],
		}
		const regularGroup = {
			id: 702,
			hash: 'hash-702',
			acknowledged: false,
			files: [
				{
					id: 7021,
					nodeId: 7021,
					path: '/alice/files/First/doc.pdf',
					size: 4096,
					mtime: 3000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 7022,
					nodeId: 7022,
					path: '/alice/files/Second/doc.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 7023,
					nodeId: 7023,
					path: '/alice/files/Third/doc.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [mixedGroup, regularGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm, 'DuplicateNavigation ref is mounted')
			assert.ok(detailsVm, 'DuplicateDetails ref is mounted')

			const selectAllBtn = detailsVm.$el.querySelector('button.select-all-button')
			assert.ok(selectAllBtn, 'Select All button is rendered')
			assert.equal(selectAllBtn.getAttribute('aria-keyshortcuts'), 'a')
			assert.equal(
				detailsVm.$el.querySelector('button.group-header-summary__copy-hash-button').getAttribute('aria-keyshortcuts'),
				'y',
			)

			// 1. Typing a inside editable fields must NOT select anything
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])

			// 2. Modifiers (Ctrl+a / Cmd+a / Alt+a / Shift+A) must NOT trigger or preventDefault
			for (const init of [
				{ key: 'a', ctrlKey: true },
				{ key: 'a', metaKey: true },
				{ key: 'a', altKey: true },
				{ key: 'A', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])

			// 3. ? help <dialog> documents a ("Select safe duplicate copies (keep oldest)") and blocks a while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('a'), 'help dialog documents a shortcut')
			assert.ok(helpDialog.textContent.includes('Select safe duplicate copies (keep oldest)'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 4. Pressing a selects all non-protected copies (skips Origin id=7011, selects 7012 & 7013, strictly < files.length)
			const aSelectEvent = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(aSelectEvent)
			await settle()
			assert.equal(aSelectEvent.defaultPrevented, true)
			assert.ok(detailsVm.selectedFiles.length < mixedGroup.files.length)
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [7012, 7013])

			// 5. Delete confirmation <dialog> and external <dialog open> block a while selection is active
			detailsVm.$el.querySelector('button.delete-selected-button').click()
			await settle()
			assert.equal(detailsVm.showDeleteConfirmDialog, true)
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [7012, 7013])
			detailsVm.resolveDeleteConfirm(false)
			await settle()

			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [7012, 7013])
			externalDialog.removeAttribute('open')

			// 6. Pressing a again toggles safe selection off
			const aToggleOffEvent = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(aToggleOffEvent)
			await settle()
			assert.equal(aToggleOffEvent.defaultPrevented, true)
			assert.deepEqual(detailsVm.selectedFiles, [])

			// 7. Navigate to regular group without origin-protected files: a keeps 1 master and selects remaining copies
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.currentDuplicate.id, 702)

			const aRegularEvent = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(aRegularEvent)
			await settle()
			assert.equal(aRegularEvent.defaultPrevented, true)
			assert.equal(detailsVm.selectedFiles.length, 2)
			assert.ok(detailsVm.selectedFiles.length < regularGroup.files.length)
			assert.deepEqual(detailsVm.selectedFiles.map(file => file.id), [7022, 7023])

			// Pressing a again toggles off
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
			await settle()
			assert.deepEqual(detailsVm.selectedFiles, [])
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('a shortcut enforces safety guards on empty, single-file, protected-only, bulk-delete, and works in project-duplicate view', async () => {
		window.localStorage.clear()

		// Empty duplicate lists -> safe no-op without preventDefault
		const { App: EmptyApp } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
			useRealDetails: true,
		})
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue(EmptyApp).$mount(emptyMount)
		try {
			await settle()
			const emptyA = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(emptyA)
			await settle()
			assert.equal(emptyA.defaultPrevented, false)
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		const protectedOnlyGroup = {
			id: 711,
			hash: 'hash-711',
			acknowledged: false,
			files: [
				{
					id: 7111,
					nodeId: 7111,
					path: '/alice/files/OriginA/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
				{
					id: 7112,
					nodeId: 7112,
					path: '/alice/files/OriginB/doc.pdf',
					size: 1024,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: true,
				},
			],
		}
		const singleFileGroup = {
			id: 712,
			hash: 'hash-712',
			acknowledged: false,
			files: [
				{
					id: 7121,
					nodeId: 7121,
					path: '/alice/files/Solo/doc.pdf',
					size: 1024,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}
		const projectGroup = {
			id: 713,
			hash: 'hash-713',
			acknowledged: false,
			files: [
				{
					id: 7131,
					nodeId: 7131,
					path: '/alice/files/Alpha/report.pdf',
					size: 4096,
					mtime: 1000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
				{
					id: 7132,
					nodeId: 7132,
					path: '/alice/files/Beta/report.pdf',
					size: 4096,
					mtime: 2000,
					mimetype: 'application/pdf',
					isInOriginFolder: false,
				},
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [protectedOnlyGroup, singleFileGroup],
			useRealDetails: true,
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)

			// Protected-only group: button disabled, a is a safe no-op
			const selectAllBtn = detailsVm.$el.querySelector('button.select-all-button')
			assert.equal(selectAllBtn.disabled, true)
			const protectedA = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(protectedA)
			await settle()
			assert.equal(protectedA.defaultPrevented, false)
			assert.deepEqual(detailsVm.selectedFiles, [])

			// Single-file group (files.length <= 1): a is a safe no-op
			vm.openDuplicate(singleFileGroup)
			await settle()
			const singleA = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(singleA)
			await settle()
			assert.equal(singleA.defaultPrevented, false)
			assert.deepEqual(detailsVm.selectedFiles, [])

			// Bulk-delete view -> ignored
			vm.openBulkDelete()
			await settle()
			const bulkA = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkA)
			await settle()
			assert.equal(bulkA.defaultPrevented, false)
			assert.equal(vm.activeView, 'bulk-delete')

			// Project-duplicate view -> a selects safe copies and toggles off
			vm.viewProjectDuplicate(projectGroup)
			await settle()
			const projectDetailsVm = vm.$refs.projectDuplicateDetails
			assert.ok(projectDetailsVm, 'projectDuplicateDetails ref is mounted')

			const projectA1 = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(projectA1)
			await settle()
			assert.equal(projectA1.defaultPrevented, true)
			assert.ok(projectDetailsVm.selectedFiles.length < projectGroup.files.length)
			assert.deepEqual(projectDetailsVm.selectedFiles.map(file => file.id), [7132])

			const projectA2 = new window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
			window.dispatchEvent(projectA2)
			await settle()
			assert.equal(projectA2.defaultPrevented, true)
			assert.deepEqual(projectDetailsVm.selectedFiles, [])
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 105 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
			'src/components/DuplicateDetails.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 108: keyboard shortcut b (toggle-bulk-delete-view)', () => {
	test('resolveShortcutAction maps b to toggle-bulk-delete-view, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const toggleBulkDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-bulk-delete-view')
		assert.deepEqual(toggleBulkDef, {
			id: 'toggle-bulk-delete-view',
			keys: ['b'],
			action: 'toggle-bulk-delete-view',
		})

		assert.equal(resolveShortcutAction({ key: 'b' }), 'toggle-bulk-delete-view')

		// Modifiers and Shift+B must never trigger toggle-bulk-delete-view
		assert.equal(resolveShortcutAction({ key: 'b', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'b', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'b', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'B', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'b' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'b' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'b', target }), null)
		}
	})

	test('App.vue toggles between details and bulk-delete on b, sets aria-keyshortcuts="b", documents it in ? dialog, and guards against modals/editable/modifiers', async () => {
		window.localStorage.clear()
		const dup1 = makeDuplicate(801, 'alpha.pdf')
		const dup2 = makeDuplicate(802, 'beta.pdf')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [dup1, dup2],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		const externalAlertDialog = document.createElement('div')
		externalAlertDialog.setAttribute('role', 'alertdialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm)
			assert.ok(detailsVm)
			assert.equal(vm.activeView, 'details')
			assert.equal(vm.currentDuplicate.id, 801)

			// 1. Topbar Bulk Delete button exposes aria-keyshortcuts="b"
			const topBulkBtn = vm.$el.querySelector('.topbar-bulk-delete-button')
			assert.ok(topBulkBtn, 'Bulk Delete button is rendered in details view')
			assert.equal(topBulkBtn.getAttribute('aria-keyshortcuts'), 'b')

			// 2. Typing b inside editable fields must NOT toggle view
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			assert.ok(searchInput)
			assert.ok(folderInput)
			for (const field of [searchInput, folderInput, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(vm.activeView, 'details')

			// 3. Modifiers (Ctrl+b / Cmd+b / Alt+b / Shift+B) must NOT trigger or preventDefault
			for (const init of [
				{ key: 'b', ctrlKey: true },
				{ key: 'b', metaKey: true },
				{ key: 'b', altKey: true },
				{ key: 'B', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(vm.activeView, 'details')

			// 4. ? help <dialog> documents b ("Toggle Bulk Delete view") and blocks b while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('b'), 'help dialog documents b shortcut')
			assert.ok(helpDialog.textContent.includes('Toggle Bulk Delete view'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.activeView, 'details')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 5. Blocking modals (external <dialog open>, settingsOpen, delete confirm dialog) block b
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.activeView, 'details')
			externalDialog.removeAttribute('open')

			vm.settingsOpen = true
			await settle()
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.activeView, 'details')
			vm.settingsOpen = false
			await settle()

			detailsVm.showDeleteConfirmDialog = true
			await settle()
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.activeView, 'details')
			detailsVm.showDeleteConfirmDialog = false
			await settle()

			// 6. Pressing b in details view switches cleanly to bulk-delete (without auto-deletion)
			const enterBulkEvent = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(enterBulkEvent)
			await settle()
			assert.equal(enterBulkEvent.defaultPrevented, true)
			assert.equal(vm.activeView, 'bulk-delete')
			assert.equal(vm.currentDuplicate, null)
			assert.ok(vm.$el.querySelector('.stub-bulk'), 'BulkDeletionSettings view is mounted')
			const backBtn = vm.$el.querySelector('.topbar-back-button')
			assert.ok(backBtn, 'Back to duplicates button is rendered')
			assert.equal(backBtn.getAttribute('aria-keyshortcuts'), 'b')

			// 7. An open [role="alertdialog"] inside bulk-delete blocks b
			document.body.appendChild(externalAlertDialog)
			const blockedInBulkEvent = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(blockedInBulkEvent)
			await settle()
			assert.equal(blockedInBulkEvent.defaultPrevented, false)
			assert.equal(vm.activeView, 'bulk-delete')
			externalAlertDialog.remove()

			// 8. Pressing b again in bulk-delete returns cleanly to details view and restores first duplicate
			const exitBulkEvent = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(exitBulkEvent)
			await settle()
			assert.equal(exitBulkEvent.defaultPrevented, true)
			assert.equal(vm.activeView, 'details')
			assert.equal(vm.currentDuplicate.id, 801)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
			externalAlertDialog.remove()
		}
	})

	test('b shortcut enforces empty-list and non-details-view safety guards', async () => {
		window.localStorage.clear()

		// Empty duplicate lists -> safe no-op without preventDefault in details view
		const { App: EmptyApp } = createAppHarness({
			acknowledged: [],
			unacknowledged: [],
		})
		const emptyMount = document.createElement('div')
		document.body.appendChild(emptyMount)
		const emptyVm = new Vue(EmptyApp).$mount(emptyMount)
		try {
			await settle()
			assert.equal(emptyVm.hasDuplicates, false)
			const emptyB = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(emptyB)
			await settle()
			assert.equal(emptyB.defaultPrevented, false)
			assert.equal(emptyVm.activeView, 'details')

			// Even if somehow in bulk-delete with 0 duplicates, b safely exits back to details
			emptyVm.openBulkDelete()
			await settle()
			assert.equal(emptyVm.activeView, 'bulk-delete')
			const exitEmptyB = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(exitEmptyB)
			await settle()
			assert.equal(exitEmptyB.defaultPrevented, true)
			assert.equal(emptyVm.activeView, 'details')
		} finally {
			emptyVm.$destroy()
			emptyMount.remove()
		}

		// Project and project-duplicate views -> safe no-op without preventDefault
		const dup = makeDuplicate(811, 'project-file.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [dup],
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			vm.viewProject(12)
			await settle()
			assert.equal(vm.activeView, 'project')
			const projectB = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(projectB)
			await settle()
			assert.equal(projectB.defaultPrevented, false)
			assert.equal(vm.activeView, 'project')

			vm.viewProjectDuplicate(dup)
			await settle()
			assert.equal(vm.activeView, 'project-duplicate')
			const projectDupB = new window.KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true })
			window.dispatchEvent(projectDupB)
			await settle()
			assert.equal(projectDupB.defaultPrevented, false)
			assert.equal(vm.activeView, 'project-duplicate')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 108 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 111: keyboard shortcut m (cycle-min-size-filter)', () => {
	test('resolveShortcutAction maps m to cycle-min-size-filter, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const cycleMinSizeDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'cycle-min-size-filter')
		assert.deepEqual(cycleMinSizeDef, {
			id: 'cycle-min-size-filter',
			keys: ['m'],
			action: 'cycle-min-size-filter',
		})

		assert.equal(resolveShortcutAction({ key: 'm' }), 'cycle-min-size-filter')

		// Modifiers and Shift+M must never trigger cycle-min-size-filter
		assert.equal(resolveShortcutAction({ key: 'm', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'm', metaKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'm', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'M', shiftKey: true }), null)

		// Ignored when help dialog or blocking modal is open
		assert.equal(resolveShortcutAction({ key: 'm' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'm' }, { hasBlockingModal: true }), null)

		// Ignored in editable targets and inside open <dialog>
		const input = document.createElement('input')
		const textarea = document.createElement('textarea')
		const select = document.createElement('select')
		const editableDiv = document.createElement('div')
		editableDiv.setAttribute('contenteditable', 'true')
		const dialog = document.createElement('dialog')
		dialog.setAttribute('open', '')
		const dialogButton = document.createElement('button')
		dialog.appendChild(dialogButton)

		for (const target of [input, textarea, select, editableDiv, dialog, dialogButton]) {
			assert.equal(resolveShortcutAction({ key: 'm', target }), null)
		}
	})

	test('App.vue -> DuplicateNavigation.vue cycles min-size filter (All -> >= 1 MB -> >= 10 MB -> >= 100 MB -> All) on m, sets aria-keyshortcuts="m", documents it in ? dialog, and guards against modals/editable/modifiers', async () => {
		window.localStorage.clear()
		const smallGroup = {
			id: 901,
			hash: 'hash-901',
			acknowledged: false,
			files: [
				{ id: 9011, nodeId: 9011, path: '/alice/files/small-a.txt', size: 512 * 1024, mtime: 1000, mimetype: 'text/plain' },
				{ id: 9012, nodeId: 9012, path: '/alice/files/small-b.txt', size: 512 * 1024, mtime: 2000, mimetype: 'text/plain' },
			],
		}
		const mediumGroup = {
			id: 902,
			hash: 'hash-902',
			acknowledged: false,
			files: [
				{ id: 9021, nodeId: 9021, path: '/alice/files/medium-a.bin', size: 2 * 1024 * 1024, mtime: 1000, mimetype: 'application/octet-stream' },
				{ id: 9022, nodeId: 9022, path: '/alice/files/medium-b.bin', size: 2 * 1024 * 1024, mtime: 2000, mimetype: 'application/octet-stream' },
			],
		}
		const largeGroup = {
			id: 903,
			hash: 'hash-903',
			acknowledged: false,
			files: [
				{ id: 9031, nodeId: 9031, path: '/alice/files/large-a.iso', size: 20 * 1024 * 1024, mtime: 1000, mimetype: 'application/octet-stream' },
				{ id: 9032, nodeId: 9032, path: '/alice/files/large-b.iso', size: 20 * 1024 * 1024, mtime: 2000, mimetype: 'application/octet-stream' },
			],
		}
		const hugeGroup = {
			id: 904,
			hash: 'hash-904',
			acknowledged: false,
			files: [
				{ id: 9041, nodeId: 9041, path: '/alice/files/huge-a.mkv', size: 150 * 1024 * 1024, mtime: 1000, mimetype: 'video/x-matroska' },
				{ id: 9042, nodeId: 9042, path: '/alice/files/huge-b.mkv', size: 150 * 1024 * 1024, mtime: 2000, mimetype: 'video/x-matroska' },
			],
		}

		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [smallGroup, mediumGroup, largeGroup, hugeGroup],
			useRealDetails: true,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalTextarea = document.createElement('textarea')
		const externalSelect = document.createElement('select')
		const externalContentEditable = document.createElement('div')
		externalContentEditable.setAttribute('contenteditable', 'true')
		const externalDialog = document.createElement('dialog')
		document.body.appendChild(externalTextarea)
		document.body.appendChild(externalSelect)
		document.body.appendChild(externalContentEditable)
		document.body.appendChild(externalDialog)

		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(navVm)
			assert.ok(detailsVm)
			assert.equal(vm.activeView, 'details')
			assert.equal(navVm.selectedMinSizePreset, 'any')
			assert.equal(navVm.minSizeBytes, 0)
			assert.equal(navVm.filteredUnacknowledgedDuplicates.length, 4)

			// 1. Min-size selector exposes aria-keyshortcuts="m"
			const minSizeSelect = navVm.$el.querySelector('select#duplicate-min-size-select')
			assert.ok(minSizeSelect, 'Min-size select control is rendered')
			assert.equal(minSizeSelect.getAttribute('aria-keyshortcuts'), 'm')
			assert.equal(minSizeSelect.value, 'any')

			// 2. Typing m inside editable fields must NOT cycle min-size filter
			const searchInput = navVm.$el.querySelector('input.search-input')
			const folderInput = navVm.$el.querySelector('input.folder-filter-input')
			for (const field of [searchInput, folderInput, minSizeSelect, externalTextarea, externalSelect, externalContentEditable]) {
				field.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }))
			}
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')
			assert.equal(navVm.minSizeBytes, 0)

			// 3. Modifiers (Ctrl+m / Cmd+m / Alt+m / Shift+M) must NOT trigger or preventDefault
			for (const init of [
				{ key: 'm', ctrlKey: true },
				{ key: 'm', metaKey: true },
				{ key: 'm', altKey: true },
				{ key: 'M', shiftKey: true },
			]) {
				const modEvent = new window.KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true })
				window.dispatchEvent(modEvent)
				assert.equal(modEvent.defaultPrevented, false)
			}
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')

			// 4. ? help <dialog> documents m ("Cycle minimum file size filter") and blocks m while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('m'), 'help dialog documents m shortcut')
			assert.ok(helpDialog.textContent.includes('Cycle minimum file size filter'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 5. Blocking modals (external <dialog open>, settingsOpen, delete confirm dialog) block m
			externalDialog.setAttribute('open', '')
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')
			externalDialog.removeAttribute('open')

			vm.settingsOpen = true
			await settle()
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')
			vm.settingsOpen = false
			await settle()

			detailsVm.showDeleteConfirmDialog = true
			await settle()
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'any')
			detailsVm.showDeleteConfirmDialog = false
			await settle()

			// 6. Pressing m cycles All -> >= 1 MB -> >= 10 MB -> >= 100 MB -> All
			const expectedCycle = [
				{ preset: '1mb', bytes: 1024 * 1024, count: 3 },
				{ preset: '10mb', bytes: 10 * 1024 * 1024, count: 2 },
				{ preset: '100mb', bytes: 100 * 1024 * 1024, count: 1 },
				{ preset: 'any', bytes: 0, count: 4 },
			]

			for (const step of expectedCycle) {
				const mEvent = new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })
				window.dispatchEvent(mEvent)
				await settle()
				assert.equal(mEvent.defaultPrevented, true)
				assert.equal(navVm.selectedMinSizePreset, step.preset)
				assert.equal(navVm.minSizeBytes, step.bytes)
				assert.equal(vm.minSizeBytes, step.bytes)
				assert.equal(minSizeSelect.value, step.preset)
				assert.equal(navVm.filteredUnacknowledgedDuplicates.length, step.count)
			}

			// 7. Custom min-size value cleanly cycles back to All ('any') on m
			navVm.setMinSizeBytes(5 * 1024 * 1024)
			await settle()
			assert.equal(navVm.selectedMinSizePreset, 'custom')
			const fromCustomEvent = new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })
			window.dispatchEvent(fromCustomEvent)
			await settle()
			assert.equal(fromCustomEvent.defaultPrevented, true)
			assert.equal(navVm.selectedMinSizePreset, 'any')
			assert.equal(navVm.minSizeBytes, 0)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalTextarea.remove()
			externalSelect.remove()
			externalContentEditable.remove()
			externalDialog.remove()
		}
	})

	test('m shortcut is ignored outside details view (bulk-delete, project, project-duplicate)', async () => {
		window.localStorage.clear()
		const dup = makeDuplicate(911, 'guarded-file.txt')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [dup],
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()
			const navVm = vm.$refs.duplicateNavigation
			assert.equal(navVm.selectedMinSizePreset, 'any')

			vm.openBulkDelete()
			await settle()
			assert.equal(vm.activeView, 'bulk-delete')
			const bulkM = new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkM)
			await settle()
			assert.equal(bulkM.defaultPrevented, false)
			assert.equal(navVm.selectedMinSizePreset, 'any')

			vm.viewProject(5)
			await settle()
			assert.equal(vm.activeView, 'project')
			const projectM = new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })
			window.dispatchEvent(projectM)
			await settle()
			assert.equal(projectM.defaultPrevented, false)
			assert.equal(navVm.selectedMinSizePreset, 'any')

			vm.viewProjectDuplicate(dup)
			await settle()
			assert.equal(vm.activeView, 'project-duplicate')
			const projectDupM = new window.KeyboardEvent('keydown', { key: 'm', bubbles: true, cancelable: true })
			window.dispatchEvent(projectDupM)
			await settle()
			assert.equal(projectDupM.defaultPrevented, false)
			assert.equal(navVm.selectedMinSizePreset, 'any')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('Cycle 111 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/components/DuplicateNavigation.vue',
			'src/App.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 114: keyboard shortcut v (toggle-compare-view)', () => {
	test('resolveShortcutAction maps v to toggle-compare-view, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const compareDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-compare-view')
		assert.ok(compareDef, 'toggle-compare-view is documented in SHORTCUT_DEFINITIONS')
		assert.deepEqual(compareDef.keys, ['v'])
		assert.equal(compareDef.action, 'toggle-compare-view')

		assert.equal(resolveShortcutAction({ key: 'v' }), 'toggle-compare-view')
		assert.equal(resolveShortcutAction({ key: 'V' }), 'toggle-compare-view')

		for (const mod of [
			{ ctrlKey: true },
			{ metaKey: true },
			{ altKey: true },
			{ shiftKey: true },
		]) {
			assert.equal(resolveShortcutAction({ key: 'v', ...mod }), null)
		}

		assert.equal(resolveShortcutAction({ key: 'v', target: { tagName: 'INPUT' } }), null)
		assert.equal(resolveShortcutAction({ key: 'v', target: { tagName: 'TEXTAREA' } }), null)
		assert.equal(resolveShortcutAction({ key: 'v', target: { tagName: 'SELECT' } }), null)
		assert.equal(resolveShortcutAction({ key: 'v', target: { isContentEditable: true } }), null)
		assert.equal(resolveShortcutAction({ key: 'v' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'v' }, { hasBlockingModal: true }), null)
	})

	test('App.vue -> DuplicateDetails.vue toggles side-by-side compare mode on v, updates help <dialog>, and respects editable/modal guards', async () => {
		window.localStorage.clear()
		const dup = makeDuplicate(950, 'compare-me.jpg')
		const { App } = createAppHarness({
			acknowledged: [],
			unacknowledged: [dup],
			useRealDetails: true,
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalInput = document.createElement('input')
		document.body.appendChild(externalInput)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)
			assert.equal(detailsVm.compareMode, false)

			// 1. Editable input ignores v
			const inputEvent = new window.KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
			externalInput.dispatchEvent(inputEvent)
			await settle()
			assert.equal(inputEvent.defaultPrevented, false)
			assert.equal(detailsVm.compareMode, false)

			// 2. ? help <dialog> documents v and blocks v while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('v'), 'help dialog documents v shortcut')
			assert.ok(helpDialog.textContent.includes('Toggle side-by-side visual comparison'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(detailsVm.compareMode, false)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 3. Pressing v enters side-by-side compare mode
			const openEvent = new window.KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
			window.dispatchEvent(openEvent)
			await settle()
			assert.equal(openEvent.defaultPrevented, true)
			assert.equal(detailsVm.compareMode, true)
			assert.ok(detailsVm.$el.querySelector('.compare-workspace'))

			// 4. Pressing v again exits compare mode back to list view
			const closeEvent = new window.KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
			window.dispatchEvent(closeEvent)
			await settle()
			assert.equal(closeEvent.defaultPrevented, true)
			assert.equal(detailsVm.compareMode, false)
			assert.ok(detailsVm.$el.querySelector('.files-card'))

			// 5. v is a safe no-op in bulk-delete view
			vm.openBulkDelete()
			await settle()
			const bulkEvent = new window.KeyboardEvent('keydown', { key: 'v', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkEvent)
			await settle()
			assert.equal(bulkEvent.defaultPrevented, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalInput.remove()
		}
	})
})

describe('Cycle 115: keyboard shortcut u (toggle-acknowledge)', () => {
	test('resolveShortcutAction maps u to toggle-acknowledge, documents it in SHORTCUT_DEFINITIONS, and ignores modifiers, editable targets, and open <dialog>', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const ackDef = SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-acknowledge')
		assert.ok(ackDef, 'toggle-acknowledge is documented in SHORTCUT_DEFINITIONS')
		assert.deepEqual(ackDef.keys, ['u'])
		assert.equal(ackDef.action, 'toggle-acknowledge')

		assert.equal(resolveShortcutAction({ key: 'u' }), 'toggle-acknowledge')
		assert.equal(resolveShortcutAction({ key: 'U' }), 'toggle-acknowledge')

		for (const mod of [
			{ ctrlKey: true },
			{ metaKey: true },
			{ altKey: true },
			{ shiftKey: true },
		]) {
			assert.equal(resolveShortcutAction({ key: 'u', ...mod }), null)
		}

		assert.equal(resolveShortcutAction({ key: 'u', target: { tagName: 'INPUT' } }), null)
		assert.equal(resolveShortcutAction({ key: 'u', target: { tagName: 'TEXTAREA' } }), null)
		assert.equal(resolveShortcutAction({ key: 'u', target: { tagName: 'SELECT' } }), null)
		assert.equal(resolveShortcutAction({ key: 'u', target: { isContentEditable: true } }), null)
		assert.equal(resolveShortcutAction({ key: 'u' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'u' }, { hasBlockingModal: true }), null)
	})

	test('App.vue -> DuplicateDetails.vue toggles acknowledge on u, sets aria-keyshortcuts="u", guards in-flight calls, and updates help <dialog>', async () => {
		window.localStorage.clear()
		const ackCalls = []
		const unackCalls = []
		let resolvePendingAck = null
		const dup1 = makeDuplicate(960, 'ack-one.jpg')
		const dup2 = { ...makeDuplicate(961, 'ack-two.jpg'), acknowledged: true }

		const { App } = createAppHarness({
			acknowledged: [dup2],
			unacknowledged: [dup1],
			useRealDetails: true,
			apiOverrides: {
				acknowledgeDuplicate: hash => {
					ackCalls.push(hash)
					return new Promise(resolve => {
						resolvePendingAck = resolve
					})
				},
				unacknowledgeDuplicate: async hash => {
					unackCalls.push(hash)
				},
			},
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)

		const externalInput = document.createElement('input')
		document.body.appendChild(externalInput)

		try {
			await settle()
			const detailsVm = vm.$refs.duplicateDetails
			assert.ok(detailsVm)
			const ackButton = detailsVm.$el.querySelector('button.acknowledge-link')
			assert.ok(ackButton, 'Acknowledge button renders')
			assert.equal(ackButton.getAttribute('aria-keyshortcuts'), 'u')

			// 1. Editable field ignores u
			const inputEvent = new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true })
			externalInput.dispatchEvent(inputEvent)
			await settle()
			assert.equal(inputEvent.defaultPrevented, false)
			assert.equal(ackCalls.length, 0)

			// 2. ? help <dialog> documents u and blocks u while open
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			const helpDialog = vm.$el.querySelector('dialog.shortcuts-dialog')
			assert.equal(helpDialog.open, true)
			const kbdLabels = Array.from(helpDialog.querySelectorAll('kbd.shortcuts-dialog__kbd')).map(el => el.textContent.trim())
			assert.ok(kbdLabels.includes('u'), 'help dialog documents u shortcut')
			assert.ok(helpDialog.textContent.includes('Acknowledge or unacknowledge active group'))

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(ackCalls.length, 0)

			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(helpDialog.open, false)

			// 3. Pressing u starts acknowledge and guards against duplicate concurrent trigger
			const firstEvent = new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true })
			window.dispatchEvent(firstEvent)
			assert.equal(firstEvent.defaultPrevented, true)
			assert.deepEqual(ackCalls, [dup1.hash])
			assert.equal(detailsVm.isAcknowledging, true)

			const secondEvent = new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true })
			window.dispatchEvent(secondEvent)
			assert.equal(secondEvent.defaultPrevented, false)
			assert.deepEqual(ackCalls, [dup1.hash])

			resolvePendingAck()
			await settle()
			assert.equal(detailsVm.isAcknowledging, false)
			assert.equal(vm.acknowledgedDuplicates.some(d => d.id === dup1.id), true)
			assert.equal(vm.unacknowledgedDuplicates.some(d => d.id === dup1.id), false)

			// 4. Selecting an acknowledged group and pressing u unacknowledges it
			vm.openDuplicate(dup2)
			await settle()
			assert.equal(vm.currentDuplicate.id, dup2.id)
			const unackEvent = new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true })
			window.dispatchEvent(unackEvent)
			await settle()
			assert.equal(unackEvent.defaultPrevented, true)
			assert.deepEqual(unackCalls, [dup2.hash])
			assert.equal(vm.unacknowledgedDuplicates.some(d => d.id === dup2.id), true)

			// 5. u is a safe no-op in bulk-delete view
			vm.openBulkDelete()
			await settle()
			const bulkEvent = new window.KeyboardEvent('keydown', { key: 'u', bubbles: true, cancelable: true })
			window.dispatchEvent(bulkEvent)
			await settle()
			assert.equal(bulkEvent.defaultPrevented, false)
		} finally {
			vm.$destroy()
			mountNode.remove()
			externalInput.remove()
		}
	})

	test('Cycle 115 touched files preserve zero typographic dashes and zero XSS sinks', () => {
		for (const relPath of [
			'src/tools/keyboardShortcuts.js',
			'src/tools/duplicateCompare.js',
			'src/components/DuplicateCompareView.vue',
			'src/components/DuplicateDetails.vue',
			'src/App.vue',
		]) {
			const source = readFileSync(resolve(root, relPath), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(source), false, `${relPath} must have zero U+2013/U+2014 dashes`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(source), false, `${relPath} must have zero XSS sinks`)
		}
	})
})

describe('Cycle 184: F7 shortcut for 3D Printing, CNC & Additive Manufacturing Vault Auditor', () => {
	test('resolveShortcutAction maps F7 cleanly and ignores modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-additive-mfg-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-additive-mfg-vault-auditor',
			keys: ['F7'],
			action: 'toggle-additive-mfg-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F7' }), 'toggle-additive-mfg-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F7', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F7', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F7', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F7' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F7' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F7', target: document.createElement('input') }), null)
	})
})

describe('Cycle 185: F6 shortcut for Game Dev, Unity/Unreal & 3D Asset Pipeline Vault Auditor', () => {
	test('resolveShortcutAction maps F6 cleanly and ignores modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-game-dev-pipeline-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-game-dev-pipeline-vault-auditor',
			keys: ['F6'],
			action: 'toggle-game-dev-pipeline-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F6' }), 'toggle-game-dev-pipeline-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F6', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F6', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F6', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F6' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F6' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F6', target: document.createElement('input') }), null)
	})
})

describe('Cycle 186: F4 shortcut for Photography RAW, Lightroom/Capture One & Color Grading Vault Auditor', () => {
	test('resolveShortcutAction maps F4 cleanly and ignores modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-photo-grading-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-photo-grading-vault-auditor',
			keys: ['F4'],
			action: 'toggle-photo-grading-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F4' }), 'toggle-photo-grading-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F4', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F4', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F4', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F4' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F4' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F4', target: document.createElement('input') }), null)
	})
})

describe('Cycle 187: F2 shortcut for Machine Learning, LLM Weights & Dataset Checkpoint Vault Auditor', () => {
	test('resolveShortcutAction maps F2 cleanly and ignores modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-ml-checkpoint-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-ml-checkpoint-vault-auditor',
			keys: ['F2'],
			action: 'toggle-ml-checkpoint-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F2' }), 'toggle-ml-checkpoint-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F2', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F2', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F2', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F2' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F2' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F2', target: document.createElement('input') }), null)
	})
})

describe('Cycle 188: F3 shortcut for Virtualization, VM Disk Images & Container Backup Vault Auditor', () => {
	test('resolveShortcutAction maps F3 cleanly and ignores modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-vm-backup-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-vm-backup-vault-auditor',
			keys: ['F3'],
			action: 'toggle-vm-backup-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F3' }), 'toggle-vm-backup-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F3', shiftKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F3', ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F3', altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F3' }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F3' }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F3', target: document.createElement('input') }), null)
	})
})

describe('Cycle 189: Shift+F8 shortcut for Database Dump, SQL Backup & Telemetry Log Vault Auditor', () => {
	test('resolveShortcutAction maps Shift+F8 cleanly and ignores ctrl/alt modifiers, editable fields, and open modals', () => {
		const {
			SHORTCUT_DEFINITIONS,
			resolveShortcutAction,
		} = loadModule('src/tools/keyboardShortcuts.js')

		const def = SHORTCUT_DEFINITIONS.find(d => d.id === 'toggle-db-sql-log-vault-auditor')
		assert.deepEqual(def, {
			id: 'toggle-db-sql-log-vault-auditor',
			keys: ['Shift+F8'],
			action: 'toggle-db-sql-log-vault-auditor',
		})
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true }), 'toggle-db-sql-log-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F8' }), 'toggle-scientific-research-vault-auditor')
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true, ctrlKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true, altKey: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true }, { isHelpOpen: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true }, { hasBlockingModal: true }), null)
		assert.equal(resolveShortcutAction({ key: 'F8', shiftKey: true, target: document.createElement('input') }), null)
	})
})
