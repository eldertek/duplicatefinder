const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadBackupTakeoutModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/backupTakeoutAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadBackupTakeoutWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const backupTakeoutAuditor = loadBackupTakeoutModule()
	return loadComponent('src/components/BackupTakeoutWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/backupTakeoutAuditor': backupTakeoutAuditor,
	})
}

function buildSampleBackupTakeoutDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9301,
			hash: 'sha256-takeout-bundle',
			size: 120 * mib,
			acknowledged: false,
			files: [
				{
					id: 93011,
					path: '/__groupfolders/42/Cold-Archive/Takeout-20261110T080000Z-001.zip',
					size: 120 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 93012,
					path: '/alice/files/Immutable/Vault/OneDrive_1_2026-11-10.zip',
					size: 120 * mib,
					mtime: refSec - 14 * 86400,
				},
				{
					id: 93013,
					path: '/alice/files/Downloads/Takeout-20261110T080000Z-001.zip',
					size: 120 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 9302,
			hash: 'sha256-dated-db-snapshot',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 93021,
					path: '/ops/Vault/pgdump-crm-20261120.dump',
					size: 48 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 93022,
					path: '/ops/tmp/backup-2026-10-01.sql.gz',
					size: 48 * mib,
					mtime: refSec - 52 * 86400,
				},
			],
		},
		{
			id: 9303,
			hash: 'sha256-archive-unpacked-twin',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 93031,
					path: '/Exports/export_clients_2026.zip',
					size: 64 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 93032,
					path: '/Exports/export_clients_2026/export_clients_2026.csv',
					size: 64 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9304,
			hash: 'sha256-gfs-daily-rotation',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 93041,
					path: '/Backups/daily/daily-2026-11-22-nas.tar.gz',
					size: 32 * mib,
					mtime: refSec - 1 * 86400,
				},
				{
					id: 93042,
					path: '/Backups/daily/daily-2026-10-05-nas.tar.gz',
					size: 32 * mib,
					mtime: refSec - 48 * 86400,
				},
				{
					id: 93043,
					path: '/Backups/daily/daily-2026-09-10-nas.tar.gz',
					size: 32 * mib,
					mtime: refSec - 74 * 86400,
				},
			],
		},
		{
			id: 9305,
			hash: 'sha256-unverified-zip-only',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 93051,
					path: '/Exports/legacy_archive_bundle.zip',
					size: 16 * mib,
					mtime: refSec - 40 * 86400,
				},
				{
					id: 93052,
					path: '/Downloads/legacy_archive_bundle (1).zip',
					size: 16 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 9306,
			hash: 'sha256-unrelated-media',
			size: 2 * mib,
			acknowledged: false,
			files: [
				{ id: 93061, path: '/alice/files/Photos/alpine.jpg', size: 2 * mib, mtime: refSec - 3 * 86400 },
				{ id: 93062, path: '/src/utils/numberFormat.js', size: 2 * mib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('Backup Archive, Cloud Takeout Bundle, Dated Snapshot & Extracted-Folder Twin Auditor', () => {
	test('classifies all 4 backup and takeout families while ignoring unrelated files', () => {
		const mod = loadBackupTakeoutModule()

		for (const p of [
			'/Downloads/Takeout-20261110T080000Z-001.zip',
			'/Backups/OneDrive_1_2026-11-10.zip',
			'/Backups/Dropbox-2026-11.zip',
			'/Backups/iCloud-Photos-2026.zip',
			'/Cloud-Exports/workspace-export.tar.zst',
			'/Cloud-Exports/workspace-export.7z',
			'/Cloud-Exports/workspace-export.tgz',
		]) {
			assert.equal(mod.classifyBackupTakeoutArtifact(p).family, 'cloud-takeout-zips', `Expected cloud-takeout-zips for ${p}`)
		}

		for (const p of [
			'/ops/backup-2026-10-01.sql.gz',
			'/ops/pgdump-crm-20261120.dump',
			'/ops/mysql-erp-2026-10-12.sql.xz',
			'/sites/wordpress-prod-backup.wpress',
			'/etc-backups/config-snapshot-edge-20261101.tar.enc',
		]) {
			assert.equal(mod.classifyBackupTakeoutArtifact(p).family, 'dated-db-sys-snapshots', `Expected dated-db-sys-snapshots for ${p}`)
		}

		for (const p of [
			'/Backups/daily-2026-11-22.tar.gz',
			'/Backups/weekly-2026-W46.tar.zst',
			'/Backups/monthly-2026-10.sql.gz',
			'/Backups/snap-0042.tar.gz',
		]) {
			assert.equal(mod.classifyBackupTakeoutArtifact(p).family, 'incremental-rotation-pools', `Expected incremental-rotation-pools for ${p}`)
		}

		const hints = {
			archiveStems: new Set(['export_clients_2026', 'takeout']),
			extractedFolderStems: new Map([
				['export_clients_2026', ['/Exports/export_clients_2026/clients.csv']],
				['takeout', ['/Takeout/Mail/inbox.mbox']],
			]),
		}
		assert.equal(mod.classifyBackupTakeoutArtifact('/Exports/export_clients_2026.zip', hints).family, 'archive-unpacked-twins')
		assert.equal(mod.classifyBackupTakeoutArtifact('/Exports/export_clients_2026/clients.csv', hints).family, 'archive-unpacked-twins')

		assert.equal(mod.classifyBackupTakeoutArtifact('/alice/files/Photos/alpine.jpg'), null)
		assert.equal(mod.classifyBackupTakeoutArtifact('/src/utils/numberFormat.js'), null)

		const parsedTakeout = mod.parseBackupTakeoutArtifactInfo('Takeout-20261110T080000Z-001.zip', '/Cold-Archive/Takeout-20261110T080000Z-001.zip')
		assert.equal(parsedTakeout.lineageStem, 'Takeout')
		assert.ok(parsedTakeout.artifactTags.includes('takeout'))
		assert.ok(parsedTakeout.artifactTags.includes('immutable-vault'))
	})

	test('strictly shields Immutable Vaults and GFS Latest Anchors, and refuses unverified zip or GFS anchor deletion', () => {
		const mod = loadBackupTakeoutModule()
		const analysis = mod.analyzeBackupTakeoutDuplicates(buildSampleBackupTakeoutDuplicates(), {
			referenceTimeSec: 1796000000,
			keepRecentCount: 1,
			staleBackupDays: 30,
		})

		assert.equal(analysis.schema, 'duplicatefinder.backup-takeout-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 5)
		assert.equal(analysis.summary.familyCounts['cloud-takeout-zips'], 2)
		assert.equal(analysis.summary.familyCounts['dated-db-sys-snapshots'], 1)
		assert.equal(analysis.summary.familyCounts['archive-unpacked-twins'], 1)
		assert.equal(analysis.summary.familyCounts['incremental-rotation-pools'], 1)

		const takeoutCluster = analysis.clusters.find(c => c.primaryGroupId === 9301)
		assert.ok(takeoutCluster)
		assert.equal(takeoutCluster.survivor.tier, 'immutable-offsite-vault')
		assert.equal(takeoutCluster.members.find(m => m.fileId === 93012).verdict, 'blocked-immutable-vault')
		assert.equal(takeoutCluster.members.find(m => m.fileId === 93013).verdict, 'reclaim-redundant-backup')

		const gfsCluster = analysis.clusters.find(c => c.primaryGroupId === 9304)
		assert.ok(gfsCluster)
		assert.equal(gfsCluster.survivor.fileId, 93041)
		assert.equal(gfsCluster.survivor.context.isGfsLatestAnchor, true)
		assert.equal(gfsCluster.members.find(m => m.fileId === 93042).verdict, 'reclaim-expired-rotation')
		assert.equal(gfsCluster.members.find(m => m.fileId === 93043).verdict, 'reclaim-expired-rotation')

		const pruneUnpackedAnalysis = mod.analyzeBackupTakeoutDuplicates(buildSampleBackupTakeoutDuplicates(), {
			strategy: 'prune-redundant-zips-when-unpacked-verified',
			survivorRule: 'unpacked-mirror-first',
			referenceTimeSec: 1796000000,
		})
		const verifiedTwinCluster = pruneUnpackedAnalysis.clusters.find(c => c.primaryGroupId === 9303)
		assert.ok(verifiedTwinCluster)
		assert.equal(verifiedTwinCluster.survivor.fileId, 93032)
		assert.equal(verifiedTwinCluster.members.find(m => m.fileId === 93031).verdict, 'reclaim-redundant-zip')

		const unverifiedZipCluster = pruneUnpackedAnalysis.clusters.find(c => c.primaryGroupId === 9305)
		assert.ok(unverifiedZipCluster)
		assert.equal(unverifiedZipCluster.members.find(m => m.fileId === 93052).verdict, 'blocked-unverified-unpacked')

		const unverifiedGfs = mod.analyzeBackupTakeoutDuplicates([
			{
				id: 9390,
				hash: 'sha256-no-timestamp-gfs',
				size: 1024 * 1024,
				files: [
					{ id: 93901, path: '/Backups/daily/daily-unknown-a.tar.gz', size: 1024 * 1024 },
					{ id: 93902, path: '/Backups/daily/daily-unknown-b.tar.gz', size: 1024 * 1024 },
				],
			},
		], {
			strategy: 'retain-gfs-anchor-prune-expired',
			referenceTimeSec: 1796000000,
		})
		assert.equal(unverifiedGfs.clusters[0].members.find(m => m.fileId === 93902).verdict, 'blocked-unverified-gfs-anchor')
	})

	test('supports Cold-Archive Vault consolidation, overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadBackupTakeoutModule()
		const duplicates = [
			...buildSampleBackupTakeoutDuplicates(),
			{
				id: 9399,
				hash: 'sha256-formula-backup',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 93991, path: '/Cold-Archive/=CMD("calc")_Takeout.zip', size: 4096000, mtime: 1795000000 },
					{ id: 93992, path: '/Downloads/stray_Takeout.zip', size: 4096000, mtime: 1790000000 },
				],
			},
			{
				id: 9398,
				hash: 'sha256-formula-plus-backup',
				size: 4096000,
				acknowledged: false,
				files: [
					{ id: 93981, path: '/Cold-Archive/+malicious_Takeout.zip', size: 4096000, mtime: 1795000000 },
					{ id: 93982, path: '/Downloads/stray_plus_Takeout.zip', size: 4096000, mtime: 1790000000 },
				],
			},
		]

		const consolidateAnalysis = mod.analyzeBackupTakeoutDuplicates(duplicates, {
			strategy: 'consolidate-cold-archive-vault',
			survivorRule: 'vault-and-anchor-first',
			referenceTimeSec: 1796000000,
		})
		const takeoutCluster = consolidateAnalysis.clusters.find(c => c.primaryGroupId === 9301)
		assert.equal(takeoutCluster.members.find(m => m.fileId === 93013).verdict, 'consolidate-to-vault')
		assert.equal(takeoutCluster.members.find(m => m.fileId === 93013).actionKind, 'consolidate')

		const script = mod.buildBackupTakeoutScript(consolidateAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('consolidate_vault_backup_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeBackupTakeoutDuplicates(buildSampleBackupTakeoutDuplicates(), {
			keepRecentCount: 1,
			memberOverrides: {
				93042: 'force-keep',
				93043: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const gfsOverridden = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9304)
		assert.equal(gfsOverridden.members.find(m => m.fileId === 93042).verdict, 'blocked-manual-shield')
		assert.equal(gfsOverridden.members.find(m => m.fileId === 93043).verdict, 'excluded')

		const syncExclude = mod.buildBackupTakeoutSyncExcludeSnippet(consolidateAnalysis)
		for (const pattern of ['*.zip.part', '*.crdownload', 'Takeout-*.zip', '*.sql.gz.tmp']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const csv = mod.buildBackupTakeoutCsvReport(consolidateAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"")_Takeout.zip"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious_Takeout.zip"))

		const json = JSON.parse(mod.buildBackupTakeoutJsonReport(consolidateAnalysis, '2026-11-24T06:20:00Z'))
		assert.equal(json.schema, 'duplicatefinder.backup-takeout-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:20:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders BackupTakeoutWorkbench empty, filter-empty, populated, and interactive states without clamping numeric inputs', async () => {
		let copied = ''
		const Workbench = loadBackupTakeoutWorkbench({
			writeText: async text => {
				copied = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.btow__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleBackupTakeoutDuplicates(),
					allDuplicates: buildSampleBackupTakeoutDuplicates(),
					currentDuplicateId: 9304,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.btow__cluster-item').length, 5)
		assert.ok(vm.$el.textContent.includes('daily-2026-11-22-nas.tar.gz'))

		const numInputs = vm.$el.querySelectorAll('.btow__num-input')
		assert.equal(numInputs.length, 3)
		for (const input of numInputs) {
			input.value = ''
			input.dispatchEvent(new window.Event('input'))
			await settle()
			assert.equal(input.value, '', 'Numeric input must not clamp or reset mid-keystroke')
		}

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.btow__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-backup-archive-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.btow__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.btow__cluster-item').length, 5)

		vm.$destroy()
	})

	test('integrates Backups & Takeout button and ) keyboard shortcut in App.vue', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': duplicateFilters,
			'./duplicateStats': duplicateStats,
		})
		const BackupWorkbench = loadBackupTakeoutWorkbench({ writeText: async () => {} })

		const slotBox = tag => ({
			render(h) {
				return h(tag, { on: this.$listeners }, this.$slots.default)
			},
		})
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'duplicates', 'allDuplicates', 'currentDuplicateId'],
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/dialogs': { showError: () => {}, showSuccess: () => {} },
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: slotBox('span'),
				NcAppSettingsDialog: slotBox('section'),
				NcAppSettingsSection: slotBox('div'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
			},
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('nav') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('storage-footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('photo-burst') },
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
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: BackupWorkbench },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw-audio-stem-auditor') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx-render-cache-auditor') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('elearning-scorm-auditor') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photo-raw-catalog-auditor') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vm-container-image-auditor') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('ml-dataset-artifact-auditor') },
			'./components/OriginFoldersSettings.vue': { __esModule: true, default: stub('origin') },
			'./components/ExcludedFoldersSettings.vue': { __esModule: true, default: stub('excluded') },
			'./components/BulkDeletionSettings.vue': { __esModule: true, default: stub('bulk') },
			'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-duplicates') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('onboarding') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('usage') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filter-settings') },
			'@/tools/api': {
				fetchDuplicates: async status => ({
					entities: status === 'acknowledged' ? [] : buildSampleBackupTakeoutDuplicates(),
					pagination: { currentPage: 1, totalPages: 1 },
				}),
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
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-backup-takeout-button')
		assert.ok(topbarBtn, 'Topbar Backups & Takeout button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: ')', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-backup-takeout-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.backup-takeout-workbench'), 'BackupTakeoutWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ')', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.backup-takeout-workbench'), null, 'BackupTakeoutWorkbench must toggle closed on ) shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/backupTakeoutAuditor.js',
			'src/components/BackupTakeoutWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/BackupTakeoutWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
