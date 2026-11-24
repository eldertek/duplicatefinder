const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadBackupDriftModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const backupSnapshotSynchronizer = loadModule('src/tools/backupSnapshotSynchronizer.js', {
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		backupSnapshotSynchronizer,
	}
}

function loadBackupDriftWorkbench(apiMock = {}) {
	const {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		backupSnapshotSynchronizer,
	} = loadBackupDriftModules()

	return loadComponent('src/components/BackupDriftWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/backupSnapshotSynchronizer': backupSnapshotSynchronizer,
		'../tools/duplicatePathDiff': duplicatePathDiff,
		'../tools/duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
}

function makeSampleDriftDuplicates() {
	return [
		{
			id: 501,
			hash: 'hash-budget-2026',
			size: 4096000,
			files: [
				{
					id: 1,
					path: '/alice/files/Documents/Finance/Q4-Budget.xlsx',
					size: 4096000,
					mtime: '2026-11-10T10:00:00Z',
					isOriginFolder: true,
				},
				{
					id: 2,
					path: '/alice/files/Backups/2026-11-01/Documents/Finance/Q4-Budget.xlsx',
					size: 4096000,
					mtime: '2026-11-01T08:00:00Z',
				},
				{
					id: 3,
					path: '/alice/files/Backups/2026-11-18/Documents/Finance/Q4-Budget.xlsx',
					size: 4096000,
					mtime: '2026-11-18T12:00:00Z',
				},
			],
		},
		{
			id: 502,
			hash: 'hash-iso-mirror',
			size: 104857600,
			files: [
				{
					id: 4,
					path: '/alice/files/Projects/Nextcloud/release.tar.gz',
					size: 104857600,
					mtime: '2026-11-15T09:00:00Z',
				},
				{
					id: 5,
					path: '/alice/files/NAS-Mirror/Projects/Nextcloud/release.tar.gz',
					size: 104857600,
					mtime: '2026-11-14T09:00:00Z',
				},
				{
					id: 6,
					path: '/alice/files/Archive/Projects/Nextcloud/release.tar.gz',
					size: 104857600,
					mtime: '2026-11-12T09:00:00Z',
				},
			],
		},
		{
			id: 503,
			hash: 'hash-readonly-snap',
			size: 2048000,
			files: [
				{
					id: 7,
					path: '/bob/files/Photos/2026/trip.jpg',
					size: 2048000,
					mtime: '2026-11-12T10:00:00Z',
				},
				{
					id: 8,
					path: '/bob/files/.snapshots/@GMT-2026.11.05/Photos/2026/trip.jpg',
					size: 2048000,
					mtime: '2026-11-05T10:00:00Z',
					readonly: true,
				},
			],
		},
		{
			id: 504,
			hash: 'hash-live-only',
			size: 1024000,
			files: [
				{
					id: 9,
					path: '/alice/files/Documents/notes.md',
					size: 1024000,
					mtime: '2026-11-10T10:00:00Z',
				},
				{
					id: 10,
					path: '/alice/files/Work/notes-copy.md',
					size: 1024000,
					mtime: '2026-11-09T10:00:00Z',
				},
			],
		},
	]
}

test('Cycle 143: Backup Snapshot & Mirror-Tree Drift Synchronizer', async (t) => {
	await t.test('extractSnapshotDateToken and classifySnapshotRoot detect snapshot generations, mirrors, exports, and write guards', () => {
		const { backupSnapshotSynchronizer } = loadBackupDriftModules()
		const { extractSnapshotDateToken, classifySnapshotRoot } = backupSnapshotSynchronizer

		const isoTok = extractSnapshotDateToken('/Backups/2026-11-18/Documents/')
		assert.equal(isoTok.snapshotDate, '2026-11-18')

		const gmtTok = extractSnapshotDateToken('/.snapshots/@GMT-2026.11.05/Photos/')
		assert.equal(gmtTok.snapshotDate, '2026-11-05')

		const datedRoot = classifySnapshotRoot('/alice/files/Backups/2026-11-18/Documents/file.pdf', {})
		assert.equal(datedRoot.rootKind, 'snapshot_dated')
		assert.equal(datedRoot.rootLabel, '/Backups/2026-11-18')
		assert.equal(datedRoot.snapshotDate, '2026-11-18')
		assert.equal(datedRoot.ownerUser, 'alice')
		assert.equal(datedRoot.isBackupTree, true)

		const mirrorRoot = classifySnapshotRoot('/alice/files/NAS-Mirror/Projects/release.tar.gz', {})
		assert.equal(mirrorRoot.rootKind, 'mirror_replica')
		assert.equal(mirrorRoot.isBackupTree, true)

		const exportRoot = classifySnapshotRoot('/alice/files/Google-Takeout/Photos/img.jpg', {})
		assert.equal(exportRoot.rootKind, 'client_export')
		assert.equal(exportRoot.isBackupTree, true)

		const liveOrigin = classifySnapshotRoot('/alice/files/Backups/2026-11-01/protected.pdf', { isOriginFolder: true })
		assert.equal(liveOrigin.rootKind, 'canonical_live')
		assert.equal(liveOrigin.isProtectedOrigin, true)
		assert.equal(liveOrigin.isWritable, false)
	})

	await t.test('buildBackupDriftReport, filterBackupDriftGroups, and buildBackupPrunePlan protect newer-in-snapshot drift and surviving copies', () => {
		const { backupSnapshotSynchronizer } = loadBackupDriftModules()
		const {
			buildBackupDriftReport,
			filterBackupDriftGroups,
			buildBackupPrunePlan,
		} = backupSnapshotSynchronizer

		const report = buildBackupDriftReport(makeSampleDriftDuplicates())
		assert.equal(report.summary.totalScannedGroupsCount, 4)
		// Group 504 is live-only and excluded from backup drift groups
		assert.equal(report.summary.auditedGroupsCount, 3)
		assert.equal(report.summary.newerInSnapshotCount, 1)
		// Safe prune candidates: id 2 (4096000) + id 5 (104857600) + id 6 (104857600)
		assert.equal(report.summary.safePruneCount, 3)
		assert.equal(report.summary.safePruneBytes, 4096000 + 104857600 * 2)
		assert.equal(report.summary.protectedCount, 1)

		const newerOnly = filterBackupDriftGroups(report.groups, { findingFilter: 'newer_in_snapshot' })
		assert.equal(newerOnly.length, 1)
		assert.equal(newerOnly[0].id, 501)

		const plan = buildBackupPrunePlan(report.groups)
		assert.equal(plan.safeCount, 3)
		assert.equal(plan.reconcileCount, 1)
		assert.equal(plan.reconcileItems[0].selectionKey, 3)
		assert.ok(!plan.pruneSelectionKeys.includes(1), 'Protected canonical master must never be pruned')
		assert.ok(!plan.pruneSelectionKeys.includes(3), 'Newer-in-snapshot drift file must never be pruned')
		assert.ok(!plan.pruneSelectionKeys.includes(8), 'Read-only snapshot file must never be pruned')
	})

	await t.test('exporters sanitize shell injections, CWE-1236 CSV formulas, and emit valid JSON manifest', () => {
		const { backupSnapshotSynchronizer } = loadBackupDriftModules()
		const {
			buildBackupDriftReport,
			buildBackupPrunePlan,
			generateBackupConsolidateScript,
			generateOccMaintenanceChecklist,
			exportBackupDriftCsv,
			exportBackupDriftJson,
		} = backupSnapshotSynchronizer

		const maliciousGroups = [
			{
				id: 99,
				hash: 'evil-hash',
				size: 1024,
				files: [
					{
						id: 11,
						path: '/alice/files/Documents/=cmd|calc!A0.txt',
						size: 1024,
						mtime: '2026-11-10T10:00:00Z',
						isOriginFolder: true,
					},
					{
						id: 12,
						path: '/alice/files/Backups/2026-11-01/$(rm -rf /)/`whoami`.txt',
						size: 1024,
						mtime: '2026-11-01T10:00:00Z',
					},
				],
			},
		]

		const report = buildBackupDriftReport(maliciousGroups)
		const plan = buildBackupPrunePlan(report.groups)
		const script = generateBackupConsolidateScript(report, plan)
		assert.ok(script.includes('#!/usr/bin/env bash'))
		assert.ok(script.includes('MODE="dry-run"'))
		assert.ok(script.includes('--rollback'))
		assert.ok(script.includes("'/alice/files/Backups/2026-11-01/$(rm -rf /)/`whoami`.txt'"), 'Single-quoted POSIX arg neutralizes command substitution')

		const checklist = generateOccMaintenanceChecklist(report, plan)
		assert.ok(checklist.includes('occ files:scan'))
		assert.ok(checklist.includes("'alice'"))

		const csv = exportBackupDriftCsv(report)
		assert.ok(csv.includes("'=cmd|"), 'CWE-1236 formula must be single-quote prefixed')

		const parsedJson = JSON.parse(exportBackupDriftJson(report, plan))
		assert.equal(parsedJson.schema, 'duplicatefinder.backup-drift.v1')
		assert.equal(parsedJson.pruneManifest.length, 1)
	})

	await t.test('BackupDriftWorkbench.vue renders empty, populated drift analytics, XSS defense, and safe prune dialog', async () => {
		const deletedCalls = []
		const Workbench = loadBackupDriftWorkbench({
			deleteFiles: async (files) => {
				deletedCalls.push(files.map(f => f.id))
				return { deleted: files.map(f => f.id), failed: [] }
			},
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
		assert.ok(emptyVm.$el.textContent.includes('No duplicate groups loaded yet'))
		emptyVm.$destroy()

		const sample = makeSampleDriftDuplicates()
		sample[0].files[1].path = '/alice/files/Backups/2026-11-01/<img src=x onerror=alert(1)>.xlsx'

		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 501,
					},
				})
			},
		}).$mount()
		await settle()

		assert.ok(vm.$el.classList.contains('backup-drift-workbench'))
		assert.equal(vm.$el.querySelector('img'), null, 'XSS payload must render as text, never HTML')
		assert.ok(vm.$el.textContent.includes('Newer-in-Snapshot Reconcile Queue'))

		const pruneBtn = vm.$el.querySelector('button.bdw__danger-btn')
		assert.ok(pruneBtn && !pruneBtn.disabled)
		pruneBtn.click()
		await settle()

		const dialog = vm.$el.querySelector('dialog.bdw-confirm-dialog')
		assert.ok(dialog && dialog.hasAttribute('open'))

		const confirmBtn = dialog.querySelector('button.bdw__danger-btn')
		confirmBtn.click()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.deepEqual(deletedCalls[0], [5, 6, 2])
		vm.$destroy()
	})

	await t.test('App.vue wires Backup Drift topbar button and backslash (\\) keyboard shortcut cleanly', async () => {
		const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
			'./duplicatePreferences': duplicatePreferences,
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js', {
			'./duplicateStats': duplicateStats,
		})
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

		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '\\' }), 'toggle-backup-drift')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '\\', ctrlKey: true }), null)

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
		const btn = vm.$el.querySelector('button.topbar-backup-drift-button')
		assert.ok(btn, 'Topbar Backup Drift button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '\\')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.backupDriftOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-backup-drift'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '\\', bubbles: true }))
		await settle()
		assert.equal(appComp.backupDriftOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 143 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/backupSnapshotSynchronizer.js',
			'src/components/BackupDriftWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/BackupDriftWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
