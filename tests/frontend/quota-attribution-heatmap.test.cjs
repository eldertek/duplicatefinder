const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadQuotaEngine() {
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/quotaAttributionHeatmap.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const quotaAttributionHeatmap = loadQuotaEngine()

	return loadComponent('src/components/QuotaAttributionWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateStats': duplicateStats,
		'../tools/quotaAttributionHeatmap': quotaAttributionHeatmap,
	})
}

function buildMultiRootDuplicates() {
	return [
		{
			id: 401,
			hash: 'hash_cross_user_video',
			files: [
				{
					id: 1,
					nodeId: 4001,
					path: '/alice/files/Projects/launch_cut.mp4',
					name: 'launch_cut.mp4',
					size: 120 * 1024 * 1024,
					mtime: 1730000000,
					isInOriginFolder: true,
				},
				{
					id: 2,
					nodeId: 4002,
					path: '/bob/files/Downloads/launch_cut.mp4',
					name: 'launch_cut.mp4',
					size: 120 * 1024 * 1024,
					mtime: 1730001000,
					isInOriginFolder: false,
				},
				{
					id: 3,
					nodeId: 4003,
					path: '/__groupfolders/12/Marketing/launch_cut.mp4',
					name: 'launch_cut.mp4',
					size: 120 * 1024 * 1024,
					mtime: 1730002000,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 402,
			hash: 'hash_cross_user_archive',
			files: [
				{
					id: 4,
					nodeId: 4004,
					path: '/bob/files/External/NAS-01/backup_2026.zip',
					name: 'backup_2026.zip',
					size: 80 * 1024 * 1024,
					mtime: 1730100000,
					isInOriginFolder: false,
				},
				{
					id: 5,
					nodeId: 4005,
					path: '/carol/files/Shared/backup_2026.zip',
					name: 'backup_2026.zip',
					size: 80 * 1024 * 1024,
					mtime: 1730100500,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 403,
			hash: 'hash_xss_owner_test',
			files: [
				{
					id: 6,
					nodeId: 4006,
					path: '/alice/files/Docs/=cmd|xss.pdf',
					name: '=cmd|xss.pdf',
					owner: 'alice<img src=x onerror=alert(1)>',
					size: 10 * 1024 * 1024,
					mtime: 1730200000,
					isInOriginFolder: false,
				},
				{
					id: 7,
					nodeId: 4007,
					path: '/alice/files/Archive/=cmd|xss.pdf',
					name: '=cmd|xss.pdf',
					owner: 'alice<img src=x onerror=alert(1)>',
					size: 10 * 1024 * 1024,
					mtime: 1730200900,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 140: Multi-Root Cross-User Quota Attribution & Chargeback Heatmap Workbench', () => {
	test('extractOwnerAndRoot parses Nextcloud user homes, group folders, external mounts, shared roots, and top folders', () => {
		const engine = loadQuotaEngine()

		const nc = engine.extractOwnerAndRoot({ path: '/alice/files/Projects/a.pdf' })
		assert.equal(nc.owner, 'alice')
		assert.equal(nc.rootKind, 'user_home')
		assert.equal(nc.rootKey, 'alice:files')

		const gf = engine.extractOwnerAndRoot({ path: '/__groupfolders/12/Marketing/deck.pptx' })
		assert.equal(gf.owner, 'team:12')
		assert.equal(gf.rootKind, 'groupfolder')
		assert.equal(gf.rootKey, 'groupfolder:12')

		const ext = engine.extractOwnerAndRoot({ path: '/bob/files/External/NAS-01/iso/img.iso' })
		assert.equal(ext.owner, 'bob')
		assert.equal(ext.rootKind, 'external')
		assert.equal(ext.rootKey, 'bob:external:NAS-01')

		const top = engine.extractOwnerAndRoot(
			{ path: '/alice/files/Projects/Sub/a.pdf' },
			{ rootGranularity: 'top_folder' },
		)
		assert.equal(top.rootKey, 'alice:files:folder:Projects')

		const fallback = engine.extractOwnerAndRoot(null)
		assert.equal(fallback.owner, 'local-user')
	})

	test('buildQuotaAttributionReport computes policies, exact equal-split sum, heatmap cells, quota alerts, and cross-user pairs', () => {
		const engine = loadQuotaEngine()
		const dups = buildMultiRootDuplicates()

		// surplus_extra: 120*2 + 80*1 + 10*1 = 330 MiB
		const surplus = engine.buildQuotaAttributionReport(dups, {
			policy: 'surplus_extra',
			costPerGbMonth: 0.1,
			currency: 'EUR',
			quotaThresholdMb: 100,
		})
		assert.equal(surplus.summary.groupCount, 3)
		assert.equal(surplus.summary.crossUserGroupCount, 2)
		assert.equal(surplus.summary.totalAttributedBytes, 330 * 1024 * 1024)
		assert.equal(surplus.summary.totalReclaimableBytes, 330 * 1024 * 1024)
		assert.ok(surplus.summary.overQuotaOwnerCount >= 1)
		assert.ok(surplus.heatmap.rows.length >= 4)
		assert.ok(surplus.crossUserPairs.length >= 3)

		// equal_split preserves exact total reclaimable bytes across groups
		const split = engine.buildQuotaAttributionReport(dups, {
			policy: 'equal_split',
			costPerGbMonth: 0.1,
			currency: 'USD',
		})
		assert.equal(split.summary.totalAttributedBytes, split.summary.totalReclaimableBytes)

		// gross_footprint equals sum of all copy sizes: 360 + 160 + 20 = 540 MiB
		const gross = engine.buildQuotaAttributionReport(dups, {
			policy: 'gross_footprint',
		})
		assert.equal(gross.summary.totalAttributedBytes, 540 * 1024 * 1024)
	})

	test('buildQuotaPrunePlan enforces protected-origin and surviving-copy invariants and exports CWE-1236-safe CSV & JSON', () => {
		const engine = loadQuotaEngine()
		const dups = buildMultiRootDuplicates()
		const report = engine.buildQuotaAttributionReport(dups, { policy: 'surplus_extra' })

		// Filtering to alice (who holds protected origin on group 401 and both copies on group 403)
		const aliceGroups = engine.filterQuotaAttributionGroups(report.groups, { ownerFilter: 'alice' })
		assert.equal(aliceGroups.length, 1)
		const alicePlan = engine.buildQuotaPrunePlan(aliceGroups, { ownerFilter: 'alice' })
		// Protected origin on group 401 must be preserved and never queued
		assert.equal(alicePlan.safeCount, 0)
		assert.equal(alicePlan.skippedProtectedCount, 1)

		// Full prune plan keeps 1 survivor per group and skips protected origin
		const fullPlan = engine.buildQuotaPrunePlan(report.groups)
		assert.equal(fullPlan.safeCount, 4)
		assert.ok(fullPlan.safeFiles.every(f => !f.isInOriginFolder))

		const csv = engine.exportQuotaAttributionCsv(report)
		assert.ok(csv.includes('Group ID'))
		// CWE-1236 formula injection neutralized with leading single quote
		assert.ok(csv.includes("'=cmd|xss.pdf"))

		const json = JSON.parse(engine.exportQuotaAttributionJson(report))
		assert.equal(json.schema, engine.QUOTA_ATTRIBUTION_SCHEMA)
		assert.equal(json.groups.length, 3)
	})

	test('QuotaAttributionWorkbench.vue renders empty, populated heatmap, interactive cell filters, XSS defense, and safe prune dialog', async () => {
		const deletedCalls = []
		const Comp = createWorkbenchComponent(async files => {
			deletedCalls.push(files)
			return { success: files, deletedNodeIds: files.map(f => f.nodeId) }
		})

		// Empty state
		const emptyVm = new Vue({
			...Comp,
			propsData: { duplicates: [], allDuplicates: [] },
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.quota-wb__empty'))
		emptyVm.$destroy()

		// Populated state
		const dups = buildMultiRootDuplicates()
		const emittedDelete = []
		const vm = new Vue({
			...Comp,
			propsData: {
				duplicates: dups,
				allDuplicates: dups,
				currentDuplicateId: 401,
			},
		})
		vm.$on('quota-delete-completed', payload => emittedDelete.push(payload))
		vm.$mount()
		await settle()

		assert.ok(vm.$el.querySelector('.quota-wb__matrix'))
		const heatCells = vm.$el.querySelectorAll('.quota-wb__heat-cell')
		assert.ok(heatCells.length >= 4)

		// Zero XSS image nodes rendered from malicious owner/filename payloads
		assert.equal(vm.$el.querySelectorAll('img').length, 0)

		// Click a heatmap cell to isolate owner x root
		const bobCell = Array.from(heatCells).find(btn => (btn.getAttribute('title') || '').startsWith('bob @'))
		assert.ok(bobCell)
		bobCell.click()
		await settle()
		assert.equal(bobCell.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelectorAll('.quota-wb__group-item').length >= 1)

		// Reset filters
		const resetBtn = Array.from(vm.$el.querySelectorAll('.quota-wb__mini-btn')).find(b => b.textContent.includes('Reset filters'))
		assert.ok(resetBtn)
		resetBtn.click()
		await settle()

		// Open safe prune confirmation dialog and confirm
		const pruneBtn = vm.$el.querySelector('.quota-wb__bulk-actions .quota-wb__danger-btn')
		assert.ok(pruneBtn && !pruneBtn.disabled)
		pruneBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.quota-confirm-dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.quota-wb__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(deletedCalls[0].length, 4)
		assert.equal(emittedDelete.length, 1)

		vm.$destroy()
	})

	test('App.vue wires Quota topbar button and - keyboard shortcut cleanly', async () => {
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

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '-' }), 'toggle-quota-attribution')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '-', ctrlKey: true }), null)

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
			'./components/BroadcastNleVaultWorkbench.vue': { __esModule: true, default: stub('broadcast-nle-vault-auditor') },
			'./components/EcommercePimVaultWorkbench.vue': { __esModule: true, default: stub('ecommerce-pim-vault-auditor') },
			'./components/FinanceTaxVaultWorkbench.vue': { __esModule: true, default: stub('finance-tax-vault-auditor') },
			'./components/IotFirmwareVaultWorkbench.vue': { __esModule: true, default: stub('iot-firmware-vault-auditor') },
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
		const btn = vm.$el.querySelector('button.topbar-quota-attribution-button')
		assert.ok(btn, 'Topbar Quota button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '-')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.quotaAttributionOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-quota-attribution'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '-', bubbles: true }))
		await settle()
		assert.equal(appComp.quotaAttributionOpen, false)

		vm.$destroy()
	})

	test('Cycle 140 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/quotaAttributionHeatmap.js',
			'src/components/QuotaAttributionWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/QuotaAttributionWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
