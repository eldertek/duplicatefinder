const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadAuditorEngine() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/shareMountOverlapAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const auditorEngine = loadAuditorEngine()

	return loadComponent('src/components/ShareMountAuditorWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateStats': duplicateStats,
		'../tools/shareMountOverlapAuditor': auditorEngine,
	})
}

function buildShareMountFixtureDuplicates() {
	return [
		{
			id: 701,
			hash: 'hash_cross_share_shadow_ro',
			files: [
				{
					id: 1,
					nodeId: 7001,
					path: '/alice/files/Finance/Q4-Budget.xlsx',
					name: 'Q4-Budget.xlsx',
					size: 12 * 1024 * 1024,
					mtime: 1700000000,
					permissions: 31,
					isInOriginFolder: false,
				},
				{
					id: 2,
					nodeId: 7002,
					path: '/bob/files/Shared/Finance/Q4-Budget.xlsx',
					name: 'Q4-Budget.xlsx',
					size: 12 * 1024 * 1024,
					mtime: 1700001000,
					shareId: 'sh-101',
					shareType: 'user',
					shareOwner: 'alice',
					sharedWith: 'bob',
					permissions: 1,
					readOnly: true,
				},
				{
					id: 3,
					nodeId: 7003,
					path: '/carol/files/Shared/Finance-Copy/Q4-Budget.xlsx',
					name: 'Q4-Budget.xlsx',
					size: 12 * 1024 * 1024,
					mtime: 1700002000,
					shareId: 'sh-102',
					shareType: 'user',
					shareOwner: 'alice',
					sharedWith: 'carol',
					permissions: 31,
				},
			],
		},
		{
			id: 702,
			hash: 'hash_orphaned_smb_mount',
			files: [
				{
					id: 4,
					nodeId: 7004,
					path: '/__external_orphaned/ext_smb_legacy/Invoices/inv-2025.pdf',
					name: 'inv-2025.pdf',
					size: 8 * 1024 * 1024,
					mtime: 1690000000,
					mountType: 'external',
					mountId: 'ext_smb_legacy',
					storageBackend: 'smb',
					mountStatus: 'offline',
					orphanedMount: true,
				},
				{
					id: 5,
					nodeId: 7005,
					path: '/__groupfolders/14/Accounting/inv-2025.pdf',
					name: 'inv-2025.pdf',
					size: 8 * 1024 * 1024,
					mtime: 1710000000,
					mountType: 'groupfolder',
					groupFolder: 'Accounting',
					permissions: 31,
				},
				{
					id: 6,
					nodeId: 7006,
					path: '/dave/files/Uploads/inv-2025.pdf',
					name: 'inv-2025.pdf',
					size: 8 * 1024 * 1024,
					mtime: 1715000000,
					permissions: 31,
				},
			],
		},
		{
			id: 703,
			hash: 'hash_external_s3_and_federated',
			files: [
				{
					id: 7,
					nodeId: 7007,
					path: '/External/s3-media-archive/promo-4k.mp4',
					name: 'promo-4k.mp4',
					size: 50 * 1024 * 1024,
					mtime: 1720000000,
					mountId: 's3-media-archive',
					storageBackend: 's3',
					mountStatus: 'online',
					permissions: 31,
				},
				{
					id: 8,
					nodeId: 7008,
					path: '/alice/files/Shared (Federated)/partner@cloud.example.org/promo-4k.mp4',
					name: 'promo-4k.mp4',
					size: 50 * 1024 * 1024,
					mtime: 1720005000,
					shareType: 'federated',
					remote: 'partner@cloud.example.org',
					permissions: 17,
				},
				{
					id: 9,
					nodeId: 7009,
					path: '/External/webdav-mirror/promo-4k.mp4',
					name: 'promo-4k.mp4',
					size: 50 * 1024 * 1024,
					mtime: 1720008000,
					mountId: 'webdav-mirror',
					storageBackend: 'webdav',
					mountStatus: 'online',
					permissions: 31,
				},
			],
		},
		{
			id: 704,
			hash: 'hash_xss_and_shell_injection',
			files: [
				{
					id: 10,
					nodeId: 7010,
					path: '/alice/files/Docs/=cmd|xss!A0.txt',
					name: '=cmd|xss!A0.txt',
					size: 2 * 1024 * 1024,
					mtime: 1725000000,
					isInOriginFolder: true,
				},
				{
					id: 11,
					nodeId: 7011,
					path: "/bob/files/Shared/Team/<img src=x onerror=alert(1)>$(whoami)'file.txt",
					name: "<img src=x onerror=alert(1)>$(whoami)'file.txt",
					size: 2 * 1024 * 1024,
					mtime: 1725000500,
					shareId: 'sh-xss',
					shareType: 'user',
					permissions: 31,
				},
			],
		},
		{
			id: 705,
			hash: 'hash_single_user_home_only',
			files: [
				{
					id: 12,
					nodeId: 7012,
					path: '/alice/files/Documents/note.md',
					name: 'note.md',
					size: 1024,
					mtime: 1726000000,
					permissions: 31,
				},
				{
					id: 13,
					nodeId: 7013,
					path: '/alice/files/Archive/note.md',
					name: 'note.md',
					size: 1024,
					mtime: 1726000500,
					permissions: 31,
				},
			],
		},
	]
}

describe('Cycle 142: Cross-Share Permission & Orphaned External-Mount Overlap Auditor', () => {
	test('classifyStorageBoundary and analyzeFilePermissions resolve Nextcloud boundaries, backends, and CRUD+S masks', () => {
		const engine = loadAuditorEngine()

		const homeBoundary = engine.classifyStorageBoundary({ path: '/alice/files/Projects/spec.pdf' })
		assert.equal(homeBoundary.boundaryType, 'user_home')
		assert.equal(homeBoundary.rootKey, 'user:alice')

		const shareBoundary = engine.classifyStorageBoundary({
			path: '/bob/files/Shared/Team/spec.pdf',
			shareId: 'sh-9',
			shareType: 'user',
			shareOwner: 'alice',
		})
		assert.equal(shareBoundary.boundaryType, 'internal_share')
		assert.equal(shareBoundary.isShare, true)

		const gfBoundary = engine.classifyStorageBoundary({ path: '/__groupfolders/42/Marketing/deck.pptx' })
		assert.equal(gfBoundary.boundaryType, 'group_folder')
		assert.equal(gfBoundary.isGroupFolder, true)

		const s3Boundary = engine.classifyStorageBoundary({
			path: '/External/s3-assets/video.mp4',
			mountId: 's3-assets',
			storageBackend: 's3',
		})
		assert.equal(s3Boundary.boundaryType, 'external_mount')
		assert.equal(s3Boundary.backend, 's3')
		assert.equal(s3Boundary.isExternalMount, true)

		const fedBoundary = engine.classifyStorageBoundary({
			path: '/alice/files/Shared (Federated)/remote@nc.org/video.mp4',
			shareType: 'federated',
		})
		assert.equal(fedBoundary.boundaryType, 'federated_share')
		assert.equal(fedBoundary.isFederated, true)

		const orphanBoundary = engine.classifyStorageBoundary({
			path: '/External/old-nas/doc.pdf',
			mountStatus: 'unreachable',
			mountId: 'old-nas',
		})
		assert.equal(orphanBoundary.boundaryType, 'orphaned_mount')
		assert.equal(orphanBoundary.isOrphanedMount, true)

		const roPerm = engine.analyzeFilePermissions({ path: '/bob/files/Shared/Team/spec.pdf', permissions: 1 }, shareBoundary)
		assert.equal(roPerm.canDelete, false)
		assert.equal(roPerm.isReadOnly, true)

		const rwNoDel = engine.analyzeFilePermissions({ path: '/bob/files/Shared/Team/spec.pdf', permissions: 'rw' }, shareBoundary)
		assert.equal(rwNoDel.canDelete, false)

		const crudPerm = engine.analyzeFilePermissions({ path: '/alice/files/Projects/spec.pdf', permissions: 31 }, homeBoundary)
		assert.equal(crudPerm.canDelete, true)
		assert.equal(crudPerm.isReadOnly, false)

		const orphanPerm = engine.analyzeFilePermissions({ path: '/External/old-nas/doc.pdf', permissions: 31 }, orphanBoundary)
		assert.equal(orphanPerm.canDelete, false)
		assert.equal(orphanPerm.isOrphanedMount, true)
	})

	test('buildShareMountAuditReport, filterShareMountGroups, and buildShareMountReclaimPlan enforce permission safety', () => {
		const engine = loadAuditorEngine()
		const dups = buildShareMountFixtureDuplicates()
		const report = engine.buildShareMountAuditReport(dups)

		assert.equal(report.schema, engine.SHARE_MOUNT_SCHEMA)
		assert.equal(report.summary.totalScannedGroupsCount, 5)
		assert.equal(report.summary.auditedGroupsCount, 4)
		assert.equal(report.summary.nonBoundaryGroupsCount, 1)
		assert.equal(report.summary.orphanedMountCopyCount, 1)

		const group701 = report.groups.find(g => g.id === 701)
		assert.ok(group701)
		assert.ok(group701.findings.includes('cross_share_shadow'))
		assert.ok(group701.findings.includes('permission_asymmetry'))
		assert.equal(group701.canonicalMasterPath, '/alice/files/Finance/Q4-Budget.xlsx')
		assert.equal(group701.safeReclaimCount, 1)
		assert.equal(group701.blockedCount, 1)

		const group702 = report.groups.find(g => g.id === 702)
		assert.ok(group702)
		assert.equal(group702.severity, 'critical')
		assert.ok(group702.findings.includes('orphaned_external_mount'))
		assert.ok(group702.findings.includes('groupfolder_permission_leak'))

		const group703 = report.groups.find(g => g.id === 703)
		assert.ok(group703)
		assert.ok(group703.findings.includes('external_mount_egress_dup'))
		assert.ok(group703.findings.includes('federated_loop_risk'))

		const filteredOrphan = engine.filterShareMountGroups(report.groups, {
			findingFilter: 'orphaned_external_mount',
		})
		assert.equal(filteredOrphan.length, 1)
		assert.equal(filteredOrphan[0].id, 702)

		const filteredCritical = engine.filterShareMountGroups(report.groups, {
			severityFilter: 'critical',
		})
		assert.equal(filteredCritical.length, 2)

		const sortedByName = engine.filterShareMountGroups(report.groups, {
			sortMode: 'name_asc',
		})
		assert.equal(sortedByName.length, 4)

		const plan = engine.buildShareMountReclaimPlan(report.groups)
		// Group 701: /carol/files/Shared/Finance-Copy/Q4-Budget.xlsx (12 MiB)
		// Group 702: /__groupfolders/14/Accounting/inv-2025.pdf (8 MiB; dave's user_home is canonical master; ext_smb_legacy is orphaned)
		// Group 703: /External/webdav-mirror/promo-4k.mp4 (50 MiB; s3-media-archive is canonical master; federated is read-only mask 17)
		// Group 704: /bob/files/Shared/Team/... (2 MiB; alice is origin protected)
		assert.equal(plan.safeCount, 4)
		assert.equal(plan.orphanedCount, 1)
		assert.equal(plan.readonlyCount, 2)
		assert.equal(plan.blockedCount, 3)
		assert.ok(plan.safeFiles.every(f => f.path !== '/bob/files/Shared/Finance/Q4-Budget.xlsx'))
		assert.ok(plan.safeFiles.every(f => f.path !== '/__external_orphaned/ext_smb_legacy/Invoices/inv-2025.pdf'))
		assert.ok(plan.safeFiles.every(f => !f.path.includes('partner@cloud.example.org')))
	})

	test('generateShareMountRemediationScript, exportShareMountCsv, and exportShareMountJson sanitize untrusted payloads', () => {
		const engine = loadAuditorEngine()
		const dups = buildShareMountFixtureDuplicates()
		const report = engine.buildShareMountAuditReport(dups)
		const plan = engine.buildShareMountReclaimPlan(report.groups)

		const script = engine.generateShareMountRemediationScript(plan, report)
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('files_external:verify'))
		assert.ok(script.includes('sharing:cleanup-remote-storages'))
		assert.ok(script.includes("'\\''file.txt'"))
		assert.ok(!script.includes('\nrm -f'))

		const csv = engine.exportShareMountCsv(report)
		assert.ok(csv.includes('group_id,file_hash,severity'))
		assert.ok(csv.includes("\"'=cmd|xss!A0.txt\""))

		const json = JSON.parse(engine.exportShareMountJson(report))
		assert.equal(json.schema, engine.SHARE_MOUNT_SCHEMA)
		assert.equal(json.groups.length, 4)
	})

	test('ShareMountAuditorWorkbench.vue renders empty, populated analytics, filters, XSS defense, and safe reclaim dialog', async () => {
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
		assert.ok(emptyVm.$el.querySelector('.smw__empty'))
		emptyVm.$destroy()

		const dups = buildShareMountFixtureDuplicates()
		const emittedDelete = []
		const vm = new Vue({
			...Comp,
			propsData: {
				duplicates: dups,
				allDuplicates: dups,
				currentDuplicateId: 701,
			},
		})
		vm.$on('share-mount-delete-completed', payload => emittedDelete.push(payload))
		vm.$mount()
		await settle()

		assert.ok(vm.$el.querySelector('.smw__kpis'))
		assert.equal(vm.$el.querySelectorAll('img').length, 0)

		const boundaryButtons = vm.$el.querySelectorAll('.smw__boundary-btn')
		assert.ok(boundaryButtons.length >= 4)
		boundaryButtons[0].click()
		await settle()
		assert.equal(boundaryButtons[0].getAttribute('aria-pressed'), 'true')

		const resetBtn = Array.from(vm.$el.querySelectorAll('.smw__mini-btn')).find(b => b.textContent.includes('Reset filters'))
		assert.ok(resetBtn)
		resetBtn.click()
		await settle()

		const reclaimBtn = vm.$el.querySelector('.smw__bulk-actions .smw__danger-btn')
		assert.ok(reclaimBtn && !reclaimBtn.disabled)
		reclaimBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.smw-confirm-dialog')
		assert.ok(dialog)
		const confirmBtn = dialog.querySelector('.smw__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(deletedCalls[0].length, 4)
		assert.equal(emittedDelete.length, 1)

		vm.$destroy()
	})

	test('App.vue wires Share & Mount topbar button and ] keyboard shortcut cleanly', async () => {
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

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: ']' }), 'toggle-share-mount-auditor')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: ']', ctrlKey: true }), null)

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
		const btn = vm.$el.querySelector('button.topbar-share-mount-button')
		assert.ok(btn, 'Topbar Shares & Mounts button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), ']')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.shareMountAuditorOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-share-mount'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ']', bubbles: true }))
		await settle()
		assert.equal(appComp.shareMountAuditorOpen, false)

		vm.$destroy()
	})

	test('Cycle 142 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/shareMountOverlapAuditor.js',
			'src/components/ShareMountAuditorWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ShareMountAuditorWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
