const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadLogTelemetryModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/logTelemetryAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadLogTelemetryWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const logTelemetryAuditor = loadLogTelemetryModule()
	return loadComponent('src/components/LogTelemetryWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/logTelemetryAuditor': logTelemetryAuditor,
	})
}

function buildSampleLogTelemetryDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 4101,
			hash: 'sha256-live-nextcloud-log',
			size: 16 * mib,
			acknowledged: false,
			files: [
				{
					id: 41011,
					path: '/var/log/nextcloud/nextcloud.log',
					size: 16 * mib,
					mtime: refSec - 1800,
				},
				{
					id: 41012,
					path: '/logs/node-b/nextcloud.log',
					size: 16 * mib,
					mtime: refSec - 3600,
				},
				{
					id: 41013,
					path: '/Backups/SRE \'2026\'/nextcloud.log.2.gz',
					size: 16 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
		{
			id: 4102,
			hash: 'sha256-rotated-audit-log',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 41021,
					path: '/central-logs/audit/audit.log.3',
					size: 8 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 41022,
					path: '/tmp/export/audit.log.3',
					size: 8 * mib,
					mtime: refSec - 12 * 86400,
				},
			],
		},
		{
			id: 4103,
			hash: 'sha256-jvm-heap-dump',
			size: 128 * mib,
			acknowledged: false,
			files: [
				{
					id: 41031,
					path: '/forensics/incident-42/java_pid8812.hprof',
					size: 128 * mib,
					mtime: refSec - 7200,
				},
				{
					id: 41032,
					path: '/crashes/node-1/java_pid8812.hprof',
					size: 128 * mib,
					mtime: refSec - 7200,
				},
				{
					id: 41033,
					path: '/Downloads/triage-copy/java_pid8812.hprof',
					size: 128 * mib,
					mtime: refSec - 3600,
				},
			],
		},
		{
			id: 4104,
			hash: 'sha256-browser-cache-shard',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 41041,
					path: '/home/alice/Browser/Default/Cache_Data/data_1',
					size: 4 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 41042,
					path: '/Backups/Workstation/Cache_Data/data_1',
					size: 4 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 4105,
			hash: 'sha256-telemetry-jsonl-gz',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 41051,
					path: '/observability/otel/spans-2026-11-01.jsonl.gz',
					size: 12 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 41052,
					path: '/tmp/ingest-staging/spans-2026-11-01.jsonl.gz',
					size: 12 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 4106,
			hash: 'sha256-regular-photo-ignored',
			size: 5 * mib,
			acknowledged: false,
			files: [
				{ id: 41061, path: '/Photos/2026/beach.jpg', size: 5 * mib, mtime: refSec - 86400 },
				{ id: 41062, path: '/Backup/beach.jpg', size: 5 * mib, mtime: refSec - 86400 },
			],
		},
	]
}

describe('Cycle 160: Log Rotation, Telemetry Dump & Stale Cache Explosion Auditor', () => {
	test('classifyLogTelemetryFile categorizes logs, dumps, cache shards, and telemetry archives accurately', () => {
		const mod = loadLogTelemetryModule()

		const liveLog = mod.classifyLogTelemetryFile({ path: '/var/log/nextcloud/nextcloud.log' })
		assert.equal(liveLog.family, 'rotated-logs')
		assert.equal(liveLog.isRotatedVariant, false)

		const rotGz = mod.classifyLogTelemetryFile({ path: '/var/log/nginx-access.log.2026-11-23.zst' })
		assert.equal(rotGz.family, 'rotated-logs')
		assert.equal(rotGz.compression, 'zst')
		assert.equal(rotGz.dateStamp, '2026-11-23')
		assert.equal(rotGz.isRotatedVariant, true)

		const heap = mod.classifyLogTelemetryFile({ path: '/forensics/java_pid8812.hprof' })
		assert.equal(heap.family, 'telemetry-dumps')
		assert.equal(heap.tier, 'heap-core-dump')

		const coreDump = mod.classifyLogTelemetryFile({ path: '/var/crash/core.4412' })
		assert.equal(coreDump.family, 'telemetry-dumps')

		const cacheShard = mod.classifyLogTelemetryFile({ path: '/User/Profile/Cache_Data/data_0' })
		assert.equal(cacheShard.family, 'stale-cache-shards')

		const eslintCache = mod.classifyLogTelemetryFile({ path: '/Repo/.eslintcache' })
		assert.equal(eslintCache.family, 'stale-cache-shards')

		const pcap = mod.classifyLogTelemetryFile({ path: '/net/trace.pcapng' })
		assert.equal(pcap.family, 'diagnostic-archives')

		assert.equal(mod.classifyLogTelemetryFile({ path: '/Documents/contract.pdf' }), null)
	})

	test('analyzeLogTelemetryDuplicates shields live logs and forensic dumps while reclaiming stale copies', () => {
		const mod = loadLogTelemetryModule()
		const sample = buildSampleLogTelemetryDuplicates()
		const analysis = mod.analyzeLogTelemetryDuplicates(sample, {
			referenceTimeSec: 1796000000,
			liveGuardHours: 24,
			staleAfterDays: 7,
		})

		assert.equal(analysis.schema, mod.LOG_TELEMETRY_SCHEMA)
		assert.equal(analysis.summary.totalClustersCount, 5)
		assert.equal(analysis.summary.familyCounts['rotated-logs'], 2)
		assert.equal(analysis.summary.familyCounts['telemetry-dumps'], 1)
		assert.equal(analysis.summary.familyCounts['stale-cache-shards'], 1)
		assert.equal(analysis.summary.familyCounts['diagnostic-archives'], 1)

		const liveCluster = analysis.clusters.find(c => c.primaryGroupId === 4101)
		assert.ok(liveCluster)
		assert.equal(liveCluster.survivor.normalizedPath, '/var/log/nextcloud/nextcloud.log')
		const nodeB = liveCluster.members.find(m => m.normalizedPath === '/logs/node-b/nextcloud.log')
		assert.equal(nodeB.verdict, 'blocked-active-live-log')
		const backupLog = liveCluster.members.find(m => m.normalizedPath.includes('Backups'))
		assert.equal(backupLog.actionKind, 'reclaim')

		const dumpCluster = analysis.clusters.find(c => c.primaryGroupId === 4103)
		assert.ok(dumpCluster)
		assert.equal(dumpCluster.survivor.normalizedPath, '/forensics/incident-42/java_pid8812.hprof')
		const crashCopy = dumpCluster.members.find(m => m.normalizedPath === '/crashes/node-1/java_pid8812.hprof')
		assert.equal(crashCopy.verdict, 'blocked-forensic-dump')
		const downloadsCopy = dumpCluster.members.find(m => m.normalizedPath === '/Downloads/triage-copy/java_pid8812.hprof')
		assert.equal(downloadsCopy.actionKind, 'reclaim')

		const auditCluster = analysis.clusters.find(c => c.primaryGroupId === 4102)
		assert.ok(auditCluster.uncompressedRotatedCount >= 1)
	})

	test('hardlink-preserve strategy, overrides, CWE-1236 CSV, JSON manifest, and POSIX DRY_RUN=1 script work safely', () => {
		const mod = loadLogTelemetryModule()
		const sample = buildSampleLogTelemetryDuplicates()
		sample[1].files[1].path = '/tmp/=CMD("calc").log'
		sample[1].files[0].path = '/central-logs/=CMD("calc").log'

		const analysis = mod.analyzeLogTelemetryDuplicates(sample, {
			referenceTimeSec: 1796000000,
			strategy: 'hardlink-preserve',
			forceKeepKeys: ['4104:41042'],
			excludeKeys: ['4105:41052'],
		})

		const cacheCluster = analysis.clusters.find(c => c.primaryGroupId === 4104)
		const shieldedCache = cacheCluster.members.find(m => m.selectionKey === '4104:41042')
		assert.equal(shieldedCache.verdict, 'blocked-manual-shield')

		const otelCluster = analysis.clusters.find(c => c.primaryGroupId === 4105)
		const excludedOtel = otelCluster.members.find(m => m.selectionKey === '4105:41052')
		assert.equal(excludedOtel.verdict, 'excluded')

		const script = mod.buildLogTelemetryScript(analysis, { dataRoot: '/srv/nc data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes("DATA_ROOT='/srv/nc data'"))
		assert.ok(script.includes('hardlink_copy'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes("'/Backups/SRE '\"'\"'2026'\"'\"'/nextcloud.log.2.gz'"))
		assert.ok(script.includes('php occ files:scan'))

		const csv = mod.buildLogTelemetryCsvReport(analysis)
		assert.ok(csv.includes('Cluster Key,Artifact Name'))
		assert.ok(csv.includes("'=CMD"))

		const jsonStr = mod.buildLogTelemetryJsonReport(analysis, '2026-11-24T05:00:00Z')
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.LOG_TELEMETRY_SCHEMA)
		assert.equal(parsed.generatedAt, '2026-11-24T05:00:00Z')
		assert.equal(parsed.clusters.length, 5)
	})

	test('LogTelemetryWorkbench.vue handles empty state, presets, unclamped numeric inputs, and overrides', async () => {
		let copiedText = ''
		const Workbench = loadLogTelemetryWorkbench({
			writeText: async text => {
				copiedText = text
			},
		})

		const emptyVm = new Vue({
			render: h => h(Workbench, { props: { duplicates: [], allDuplicates: [] } }),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('No duplicate scan dataset loaded yet'))
		emptyVm.$destroy()

		const sample = buildSampleLogTelemetryDuplicates()
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: sample,
					allDuplicates: sample,
					currentDuplicateId: 4103,
				},
			}),
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.equal(comp.selectedCluster.primaryGroupId, 4103)

		// Unclamped numeric inputs must accept empty string or custom text without resetting mid-keystroke
		const numInputs = vm.$el.querySelectorAll('.ltw__num-input')
		assert.equal(numInputs.length, 3)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(comp.liveGuardHoursInput, '')

		comp.applyPreset('rotated-logs-surge')
		await settle()
		assert.equal(comp.familyFilter, 'rotated-logs')
		assert.equal(comp.analysis.summary.totalClustersCount, 2)

		await comp.copyConsolidationScript()
		await settle()
		assert.ok(copiedText.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.ltw__notice.is-success'))

		vm.$destroy()
	})

	test('App.vue wires topbar Logs & Caches button and | shortcut cleanly', async () => {
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
		const LogWorkbench = loadLogTelemetryWorkbench()
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
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link-sim') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('folder-matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
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
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: LogWorkbench },
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
			'./components/MobileBuildVaultWorkbench.vue': { __esModule: true, default: stub('mobile-build-vault-auditor') },
			'./components/K8sTerraformVaultWorkbench.vue': { __esModule: true, default: stub('k8s-terraform-vault-auditor') },
			'./components/PublishingPrepressVaultWorkbench.vue': { __esModule: true, default: stub('publishing-prepress-vault-auditor') },
			'./components/GenomicsBioinformaticsVaultWorkbench.vue': { __esModule: true, default: stub('genomics-bioinformatics-vault-auditor') },
			'./components/DfirSecurityVaultWorkbench.vue': { __esModule: true, default: stub('dfir-security-vault-auditor') },
			'./components/RoboticsRosVaultWorkbench.vue': { __esModule: true, default: stub('robotics-ros-vault-auditor') },
			'./components/SemiconductorEdaVaultWorkbench.vue': { __esModule: true, default: stub('semiconductor-eda-vault-auditor') },
			'./components/AerospaceCfdVaultWorkbench.vue': { __esModule: true, default: stub('aerospace-cfd-vault-auditor') },
			'./components/BatteryBmsVaultWorkbench.vue': { __esModule: true, default: stub('battery-bms-vault-auditor') },
			'./components/ChemPharmaGmpVaultWorkbench.vue': { __esModule: true, default: stub('chem-pharma-gmp-vault-auditor') },
			'./components/DigitalGridScadaVaultWorkbench.vue': { __esModule: true, default: stub('digital-grid-scada-vault-auditor') },
			'./components/EnergySeismicVaultWorkbench.vue': { __esModule: true, default: stub('energy-seismic-vault-auditor') },
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
					entities: status === 'acknowledged' ? [] : buildSampleLogTelemetryDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-log-telemetry-button')
		assert.ok(topbarBtn, 'Topbar Logs & Caches button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '|', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-log-telemetry-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.log-telemetry-workbench'), 'LogTelemetryWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '|', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.log-telemetry-workbench'), null, 'LogTelemetryWorkbench must toggle closed on | shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/logTelemetryAuditor.js',
			'src/components/LogTelemetryWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/LogTelemetryWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
