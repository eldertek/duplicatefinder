const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadPreviewCacheEngine() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/previewCacheReclaim.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const previewCacheReclaim = loadPreviewCacheEngine()

	return loadComponent('src/components/PreviewCacheWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateStats': duplicateStats,
		'../tools/previewCacheReclaim': previewCacheReclaim,
	})
}

function buildPreviewCacheDuplicates() {
	return [
		{
			id: 501,
			hash: 'hash_orphaned_hidpi_preview',
			files: [
				{
					id: 1,
					nodeId: 5001,
					path: '/appdata_oc9x2a1b/preview/a/f/999001/2048-2048.jpg',
					name: '2048-2048.jpg',
					size: 18 * 1024 * 1024,
					mtime: 1700000000,
					isInOriginFolder: false,
				},
				{
					id: 2,
					nodeId: 5002,
					path: '/backup/appdata_oc9x2a1b/preview/a/f/999001/2048-2048.jpg',
					name: '2048-2048.jpg',
					size: 18 * 1024 * 1024,
					mtime: 1700001000,
					isInOriginFolder: false,
				},
				{
					id: 3,
					nodeId: 5003,
					path: '/appdata_oc9x2a1b/preview/a/f/999001/256-256.jpg',
					name: '256-256.jpg',
					size: 256 * 1024,
					mtime: 1700001000,
					isInOriginFolder: true,
				},
			],
		},
		{
			id: 502,
			hash: 'hash_os_thumbnail_dup',
			files: [
				{
					id: 4,
					nodeId: 5004,
					path: '/alice/files/Photos/.thumbnails/Thumbs.db',
					name: 'Thumbs.db',
					size: 4 * 1024 * 1024,
					mtime: 1720000000,
					isInOriginFolder: false,
				},
				{
					id: 5,
					nodeId: 5005,
					path: '/bob/files/Archive/@eaDir/Thumbs.db',
					name: 'Thumbs.db',
					size: 4 * 1024 * 1024,
					mtime: 1720001000,
					isInOriginFolder: false,
					locked: true,
				},
			],
		},
		{
			id: 503,
			hash: 'hash_live_preview_with_source',
			files: [
				{
					id: 6,
					nodeId: 8801,
					fileId: 8801,
					path: '/alice/files/Camera/sunset.jpg',
					name: 'sunset.jpg',
					size: 6 * 1024 * 1024,
					mtime: 1730000000,
					isInOriginFolder: false,
				},
				{
					id: 7,
					nodeId: 5007,
					path: '/appdata_oc9x2a1b/preview/1/2/8801/1024-1024.jpg',
					name: '1024-1024.jpg',
					size: 6 * 1024 * 1024,
					mtime: 1730000100,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 504,
			hash: 'hash_xss_sync_cache',
			files: [
				{
					id: 8,
					nodeId: 5008,
					path: "=cmd|xss'quote<img src=x onerror=alert(1)>.tmp",
					name: "=cmd|xss'quote<img src=x onerror=alert(1)>.tmp",
					size: 2 * 1024 * 1024,
					mtime: 1725000000,
					isInOriginFolder: false,
				},
				{
					id: 9,
					nodeId: 5009,
					path: "/bob/files/.cache/=cmd|xss'quote<img src=x onerror=alert(1)>.tmp",
					name: "=cmd|xss'quote<img src=x onerror=alert(1)>.tmp",
					size: 2 * 1024 * 1024,
					mtime: 1725000500,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 141: Orphaned Nextcloud Preview/Thumbnail & Cache Reclaim Analyzer', () => {
	test('parsePreviewMetadata and classifyCacheArtifact accurately classify previews, orphans, thumbnails, and sync temp artifacts', () => {
		const engine = loadPreviewCacheEngine()

		const meta = engine.parsePreviewMetadata('/appdata_oc9x2a1b/preview/a/f/999001/2048-2048.jpg', '2048-2048.jpg')
		assert.equal(meta.isNextcloudPreview, true)
		assert.equal(meta.instanceId, 'oc9x2a1b')
		assert.equal(meta.previewFileId, '999001')
		assert.equal(meta.width, 2048)
		assert.equal(meta.height, 2048)
		assert.equal(meta.tier, 'hidpi')

		const orphanCls = engine.classifyCacheArtifact(
			{ path: '/appdata_oc9x2a1b/preview/a/f/999001/2048-2048.jpg', mtime: 1700000000 },
			{ knownSourceFileIds: new Set(['8801']), referenceNowMs: 1731000000 * 1000, staleDays: 30 },
		)
		assert.equal(orphanCls.category, 'nextcloud_preview')
		assert.equal(orphanCls.isOrphaned, true)
		assert.equal(orphanCls.orphanStatus, 'orphaned_preview')
		assert.equal(orphanCls.isStale, true)

		const matchedCls = engine.classifyCacheArtifact(
			{ path: '/appdata_oc9x2a1b/preview/1/2/8801/1024-1024.jpg', mtime: 1730900000 },
			{ knownSourceFileIds: new Set(['8801']), referenceNowMs: 1731000000 * 1000, staleDays: 30 },
		)
		assert.equal(matchedCls.category, 'nextcloud_preview')
		assert.equal(matchedCls.isOrphaned, false)
		assert.equal(matchedCls.orphanStatus, 'regenerable_cache')

		const thumbCls = engine.classifyCacheArtifact({ path: '/alice/files/Photos/.thumbnails/Thumbs.db' })
		assert.equal(thumbCls.category, 'os_thumbnail')
		assert.equal(thumbCls.regenerable, true)

		const trashCls = engine.classifyCacheArtifact({ path: '/alice/files_trashbin/files/report.pdf.d1700000' })
		assert.equal(trashCls.category, 'nextcloud_versions_trash')
		assert.equal(trashCls.regenerable, false)
	})

	test('buildPreviewCacheReport, filterPreviewCacheGroups, buildPreviewCacheReclaimPlan, and exports enforce safety and CWE-1236 rules', () => {
		const engine = loadPreviewCacheEngine()
		const dups = buildPreviewCacheDuplicates()

		const report = engine.buildPreviewCacheReport(dups, {
			referenceNowMs: 1732000000 * 1000,
			staleDays: 30,
		})

		assert.equal(report.schema, engine.PREVIEW_CACHE_SCHEMA)
		assert.equal(report.summary.matchedGroupsCount, 4)
		assert.equal(report.summary.orphanedPreviewCount, 3)
		assert.equal(report.summary.hidpiPreviewCount, 2)
		assert.ok(report.instanceBuckets.some(b => b.instanceId === 'oc9x2a1b'))

		const orphanOnly = engine.filterPreviewCacheGroups(report.groups, { orphanOnly: true })
		assert.equal(orphanOnly.length, 1)
		assert.equal(orphanOnly[0].id, 501)

		const hidpiOnly = engine.filterPreviewCacheGroups(report.groups, { minPreviewDimension: 2048 })
		assert.equal(hidpiOnly.length, 1)

		const plan = engine.buildPreviewCacheReclaimPlan(report.groups)
		// Group 501: 3 copies, 1 is protected origin -> 2 safe copies queued
		// Group 502: 2 copies, 1 is locked -> 1 safe copy queued
		// Group 503: 1 active source + 1 preview -> 1 preview queued (source preserved)
		// Group 504: 2 cache copies -> 1 safe copy queued, 1 survivor kept
		assert.equal(plan.safeCount, 5)
		assert.equal(plan.skippedProtectedCount, 1)
		assert.equal(plan.skippedLockedCount, 1)
		assert.equal(plan.skippedSourceCount, 1)
		assert.ok(plan.safeFiles.every(f => f.isCacheArtifact && !f.isProtected && !f.isLocked))

		const script = engine.generatePreviewCleanupScript(plan, report)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('php occ preview:cleanup'))
		// Single quote in malicious filename properly escaped for POSIX shell
		assert.ok(script.includes("'\\''"))

		const csv = engine.exportPreviewCacheCsv(report)
		assert.ok(csv.includes('Group ID'))
		assert.ok(csv.includes("\"'=cmd|xss"))

		const json = JSON.parse(engine.exportPreviewCacheJson(report))
		assert.equal(json.schema, engine.PREVIEW_CACHE_SCHEMA)
		assert.equal(json.groups.length, 4)
	})

	test('PreviewCacheWorkbench.vue renders empty, populated analytics, category filter, XSS defense, and safe reclaim dialog', async () => {
		const deletedCalls = []
		const Comp = createWorkbenchComponent(async files => {
			deletedCalls.push(files)
			return { success: files, deletedNodeIds: files.map(f => f.nodeId) }
		})

		const emptyVm = new Vue({
			...Comp,
			propsData: { duplicates: [], allDuplicates: [] },
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.pcw__empty'))
		emptyVm.$destroy()

		const dups = buildPreviewCacheDuplicates()
		const emittedDelete = []
		const vm = new Vue({
			...Comp,
			propsData: {
				duplicates: dups,
				allDuplicates: dups,
				currentDuplicateId: 501,
			},
		})
		vm.$on('preview-cache-delete-completed', payload => emittedDelete.push(payload))
		vm.$mount()
		await settle()

		assert.ok(vm.$el.querySelector('.pcw__kpis'))
		assert.equal(vm.$el.querySelectorAll('img').length, 0)

		const catButtons = vm.$el.querySelectorAll('.pcw__cat-btn')
		assert.equal(catButtons.length, 4)
		catButtons[0].click()
		await settle()
		assert.equal(catButtons[0].getAttribute('aria-pressed'), 'true')

		const resetBtn = Array.from(vm.$el.querySelectorAll('.pcw__mini-btn')).find(b => b.textContent.includes('Reset filters'))
		assert.ok(resetBtn)
		resetBtn.click()
		await settle()

		const reclaimBtn = vm.$el.querySelector('.pcw__bulk-actions .pcw__danger-btn')
		assert.ok(reclaimBtn && !reclaimBtn.disabled)
		reclaimBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.pcw-confirm-dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.pcw__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(deletedCalls[0].length, 5)
		assert.equal(emittedDelete.length, 1)

		vm.$destroy()
	})

	test('App.vue wires Preview Cache topbar button and [ keyboard shortcut cleanly', async () => {
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

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '[' }), 'toggle-preview-cache')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '[', ctrlKey: true }), null)

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
		const btn = vm.$el.querySelector('button.topbar-preview-cache-button')
		assert.ok(btn, 'Topbar Preview Cache button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '[')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.previewCacheOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-preview-cache'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '[', bubbles: true }))
		await settle()
		assert.equal(appComp.previewCacheOpen, false)

		vm.$destroy()
	})

	test('Cycle 141 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/previewCacheReclaim.js',
			'src/components/PreviewCacheWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/PreviewCacheWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
