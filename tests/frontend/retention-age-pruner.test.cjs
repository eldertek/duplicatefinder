const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadModule, loadComponent, settle } = require('./helpers.cjs')

function loadRetentionEngine() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	return loadModule('src/tools/retentionAgePruner.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
	})
}

function createWorkbenchComponent(deleteImpl = async files => ({ success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) })) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const retentionAgePruner = loadModule('src/tools/retentionAgePruner.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
	})

	return loadComponent('src/components/RetentionAgeWorkbench.vue', {
		'../tools/api': { deleteFiles: deleteImpl },
		'../tools/duplicateStats': duplicateStats,
		'../tools/retentionAgePruner': retentionAgePruner,
	})
}

const FIXED_NOW_MS = Date.UTC(2026, 10, 23, 12, 0, 0)
const DAY_MS = 86400000

function daysAgoSec(days) {
	return Math.floor((FIXED_NOW_MS - days * DAY_MS) / 1000)
}

function buildSampleDuplicates() {
	return [
		{
			id: 101,
			hash: 'hash_installer_dmg',
			files: [
				{
					id: 1,
					nodeId: 1001,
					path: '/alice/files/Downloads/OfficeSuite-Installer.dmg',
					name: 'OfficeSuite-Installer.dmg',
					size: 420 * 1024 * 1024,
					mtime: daysAgoSec(620),
					isInOriginFolder: false,
				},
				{
					id: 2,
					nodeId: 1002,
					path: '/alice/files/Software/Archive/OfficeSuite-Installer.dmg',
					name: 'OfficeSuite-Installer.dmg',
					size: 420 * 1024 * 1024,
					mtime: daysAgoSec(45),
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 102,
			hash: 'hash_cache_bundle',
			files: [
				{
					id: 3,
					nodeId: 1003,
					path: '/alice/files/Projects/webapp/node_modules/vendor-bundle.js',
					name: 'vendor-bundle.js',
					size: 18 * 1024 * 1024,
					mtime: daysAgoSec(410),
					isInOriginFolder: false,
				},
				{
					id: 4,
					nodeId: 1004,
					path: '/alice/files/Projects/golden/vendor-bundle.js',
					name: 'vendor-bundle.js',
					size: 18 * 1024 * 1024,
					mtime: daysAgoSec(12),
					isInOriginFolder: true,
				},
			],
		},
		{
			id: 103,
			hash: 'hash_ancient_backup',
			files: [
				{
					id: 5,
					nodeId: 1005,
					path: '/alice/files/Backups/ledger_2022_export.sql',
					name: 'ledger_2022_export.sql',
					size: 64 * 1024 * 1024,
					mtime: daysAgoSec(1250),
					isInOriginFolder: false,
				},
				{
					id: 6,
					nodeId: 1006,
					path: '/alice/files/Backups/Current/ledger_2022_export.sql',
					name: 'ledger_2022_export.sql',
					size: 64 * 1024 * 1024,
					mtime: daysAgoSec(3),
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 104,
			hash: 'hash_missing_mtime',
			files: [
				{
					id: 7,
					nodeId: 1007,
					path: '/alice/files/Misc/=cmd|calc.txt',
					name: '=cmd|calc.txt',
					size: 2048,
					mtime: 0,
					isInOriginFolder: false,
				},
				{
					id: 8,
					nodeId: 1008,
					path: '/alice/files/Misc/locked.txt',
					name: 'locked.txt',
					size: 2048,
					locked: true,
					isInOriginFolder: false,
				},
			],
		},
	]
}

describe('Cycle 138: Retention Age, Cold-Storage & Stale Artifact Pruner Workbench', () => {
	test('normalizes Unix seconds, ms, and ISO timestamps, classifies age tiers and stale artifacts safely', () => {
		const engine = loadRetentionEngine()

		assert.equal(engine.normalizeTimestampToMs(1700000000), 1700000000000)
		assert.equal(engine.normalizeTimestampToMs(1700000000000), 1700000000000)
		assert.equal(engine.normalizeTimestampToMs('2024-05-01T00:00:00Z'), Date.UTC(2024, 4, 1, 0, 0, 0))
		assert.equal(engine.normalizeTimestampToMs(0), null)
		assert.equal(engine.normalizeTimestampToMs(null), null)

		assert.equal(engine.classifyAgeTier(2).id, 'fresh')
		assert.equal(engine.classifyAgeTier(15).id, 'recent')
		assert.equal(engine.classifyAgeTier(60).id, 'quarter')
		assert.equal(engine.classifyAgeTier(200).id, 'aging')
		assert.equal(engine.classifyAgeTier(500).id, 'cold')
		assert.equal(engine.classifyAgeTier(1400).id, 'ancient')
		assert.equal(engine.classifyAgeTier(null).id, 'unknown')

		assert.equal(engine.classifyStaleArtifact('/alice/files/Downloads/App.dmg', 'App.dmg').kind, 'installer-image')
		assert.equal(engine.classifyStaleArtifact('/alice/files/Repo/node_modules/pkg.js', 'pkg.js').kind, 'build-cache')
		assert.equal(engine.classifyStaleArtifact('/alice/files/Backups/db.sql', 'db.sql').kind, 'backup-snapshot')
		assert.equal(engine.classifyStaleArtifact('/alice/files/Docs/notes.md', 'notes.md').kind, 'standard')
	})

	test('builds catalog with age distribution, folder hotspots, survivor safety, and CWE-1236-safe CSV/JSON exports', () => {
		const engine = loadRetentionEngine()
		const sample = buildSampleDuplicates()

		const catalog = engine.buildRetentionCatalog(sample, {
			referenceTimeMs: FIXED_NOW_MS,
			retentionDays: 180,
			policyMode: 'stale-artifacts',
		})

		assert.equal(catalog.summary.totalFiles, 8)
		assert.equal(catalog.summary.staleCandidateCount, 3)
		assert.equal(catalog.summary.installerCount, 2)
		assert.equal(catalog.summary.cacheCount, 1)
		assert.equal(catalog.summary.backupCount, 2)
		assert.equal(catalog.summary.unknownAgeCount, 2)
		assert.equal(catalog.summary.coldFileCount, 3)

		// Origin protected and locked files are never recommended for pruning
		const originItem = catalog.allItems.find(item => item.file.id === 4)
		assert.equal(originItem.verdict, 'protected-origin')
		assert.equal(originItem.deletable, false)
		assert.equal(originItem.pruneRecommended, false)

		const lockedItem = catalog.allItems.find(item => item.file.id === 8)
		assert.equal(lockedItem.verdict, 'protected-locked')
		assert.equal(lockedItem.deletable, false)

		// Newest copy in installer group is preserved as golden survivor
		const newerInstaller = catalog.allItems.find(item => item.file.id === 2)
		assert.equal(newerInstaller.verdict, 'keep-newest')
		assert.equal(newerInstaller.pruneRecommended, false)

		const oldInstaller = catalog.allItems.find(item => item.file.id === 1)
		assert.equal(oldInstaller.verdict, 'prune-recommended')
		assert.equal(oldInstaller.pruneRecommended, true)

		// Age distribution & folder leaderboard
		const ancientTier = catalog.ageDistribution.find(t => t.id === 'ancient')
		assert.equal(ancientTier.count, 1)
		assert.ok(catalog.folderLeaderboard.length >= 3)
		assert.equal(catalog.folderLeaderboard[0].folder, '/Downloads')

		// Policy selection returns only safe prune-recommended keys
		const selectedKeys = engine.selectPolicyPruneKeys(catalog)
		assert.deepEqual(selectedKeys.sort(), ['1', '3', '5'])

		// CWE-1236 formula neutralization in CSV export
		const csv = engine.exportRetentionCsv(catalog)
		assert.ok(csv.includes('group_id,group_hash,file_name'))
		assert.ok(csv.includes('"\'=cmd|calc.txt"'), 'Leading = must be neutralized in CSV export')

		const json = JSON.parse(engine.exportRetentionManifestJson(catalog))
		assert.equal(json.schema, engine.RETENTION_REPORT_SCHEMA)
		assert.equal(json.items.length, 8)
	})

	test('RetentionAgeWorkbench.vue renders empty, populated, non-clamping custom days, interactive filters, prune dialog, and XSS defense', async () => {
		const deletedCalls = []
		const Workbench = createWorkbenchComponent(async (files, opts) => {
			deletedCalls.push({ files, opts })
			return { success: files, deletedNodeIds: files.map(f => f.nodeId || f.id) }
		})

		// Empty state
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

		// Populated state + XSS test fixture
		const sample = buildSampleDuplicates()
		sample[0].files[0].path = '/alice/files/Downloads/<img src=x onerror=alert(1)>.dmg'
		sample[0].files[0].name = '<img src=x onerror=alert(1)>.dmg'

		const emitted = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 101,
					},
					on: {
						'retention-delete-completed': payload => emitted.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'XSS payload must not inject DOM elements')
		assert.ok(vm.$el.textContent.includes('<img src=x onerror=alert(1)>.dmg'))

		// Non-clamping numeric custom days input mid-keystroke
		const daysInput = vm.$el.querySelector('input.retention-wb__days-input')
		assert.ok(daysInput)
		daysInput.value = ''
		daysInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(comp.retentionDaysDraft, '', 'Empty numeric draft must not be clamped mid-keystroke')

		daysInput.value = '0'
		daysInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(comp.retentionDaysDraft, '0', 'Zero draft must not be clamped mid-keystroke')

		daysInput.dispatchEvent(new window.Event('blur'))
		await settle()
		assert.equal(comp.retentionDays, 180)
		assert.equal(comp.retentionDaysDraft, '180')

		// Click age tier bar to filter
		const ancientBtn = Array.from(vm.$el.querySelectorAll('.retention-wb__tier-btn'))
			.find(el => el.textContent.includes('Ancient'))
		assert.ok(ancientBtn)
		ancientBtn.click()
		await settle()
		assert.equal(comp.ageTierFilter, 'ancient')
		assert.equal(comp.catalog.items.length, 1)

		// Reset filters
		comp.resetFilters()
		await settle()
		assert.equal(comp.catalog.items.length, 8)

		// Select policy candidates and prune via dialog
		comp.selectPolicyCandidates()
		await settle()
		assert.ok(comp.selectedDeleteItems.length >= 2)
		comp.openDeleteDialog()
		await settle()
		await comp.confirmBatchDelete()
		await settle()

		assert.equal(deletedCalls.length, 1)
		assert.equal(emitted.length, 1)
		vm.$destroy()
	})

	test('App.vue + keyboardShortcuts wire 9 shortcut, topbar Retention button, and help dialog', async () => {
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '9' }), 'toggle-retention-pruner')
		assert.equal(keyboardShortcuts.resolveShortcutAction({ key: '9', target: { tagName: 'INPUT' } }), null)
		assert.ok(keyboardShortcuts.SHORTCUT_DEFINITIONS.some(item => item.id === 'toggle-retention-pruner' && item.keys.includes('9')))

		const stub = name => ({
			name,
			render(h) {
				return h('div', { class: `stub-${name}` })
			},
		})
		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})

		const duplicatePreferences = loadModule('src/tools/duplicatePreferences.js')
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
			'./duplicatePreferences': duplicatePreferences,
		})
		const duplicateStats = loadModule('src/tools/duplicateStats.js')
		const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': duplicateStats,
			'./duplicateFilters': duplicateFilters,
		})

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('main'),
				NcContent: slotBox('div'),
				NcLoadingIcon: stub('nc-loading'),
				NcButton: slotBox('button'),
				NcModal: slotBox('div'),
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
			'./components/FiberTelecomRfVaultWorkbench.vue': { __esModule: true, default: stub('fiber-telecom-rf-vault-auditor') },
			'./components/GeotechShmCivilVaultWorkbench.vue': { __esModule: true, default: stub('geotech-shm-civil-vault-auditor') },
			'./components/HydrographyMarineVaultWorkbench.vue': { __esModule: true, default: stub('hydrography-marine-vault-auditor') },
			'./components/AstronomyFitsInterferometryVaultWorkbench.vue': { __esModule: true, default: stub('astronomy-fits-interferometry-vault-auditor') },
			'./components/MeteorologyClimateVaultWorkbench.vue': { __esModule: true, default: stub('meteorology-climate-vault-auditor') },
			'./components/MaterialsMicroscopyVaultWorkbench.vue': { __esModule: true, default: stub('materials-microscopy-vault-auditor') },
			'./components/LidarPhotogrammetryVaultWorkbench.vue': { __esModule: true, default: stub('lidar-photogrammetry-vault-auditor') },
			'./components/MocapBiomechanicsVaultWorkbench.vue': { __esModule: true, default: stub('mocap-biomechanics-vault-auditor') },
			'./components/NeuroscienceElectrophysVaultWorkbench.vue': { __esModule: true, default: stub('neuroscience-electrophys-vault-auditor') },
			'./components/OrbitalSpacecraftVaultWorkbench.vue': { __esModule: true, default: stub('orbital-spacecraft-vault-auditor') },
			'./components/ParticlePhysicsHepVaultWorkbench.vue': { __esModule: true, default: stub('particle-physics-hep-vault-auditor') },
			'./components/QuantumQubitPulseVaultWorkbench.vue': { __esModule: true, default: stub('quantum-qubit-pulse-vault-auditor') },
			'./components/RailwaySignalingTelemetryVaultWorkbench.vue': { __esModule: true, default: stub('railway-signaling-telemetry-vault-auditor') },
			'./components/SpeechAsrBioacousticsVaultWorkbench.vue': { __esModule: true, default: stub('speech-asr-bioacoustics-vault-auditor') },
			'./components/TrafficItsV2xVaultWorkbench.vue': { __esModule: true, default: stub('traffic-its-v2x-vault-auditor') },
			'./components/UrbanWaterUtilityPipelineVaultWorkbench.vue': { __esModule: true, default: stub('urban-water-utility-pipeline-vault-auditor') },
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
		const btn = vm.$el.querySelector('button.topbar-retention-pruner-button')
		assert.ok(btn, 'Topbar Retention button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), '9')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.retentionPrunerOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-retention-pruner'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '9', bubbles: true }))
		await settle()
		assert.equal(appComp.retentionPrunerOpen, false)

		vm.$destroy()
	})

	test('Cycle 138 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/retentionAgePruner.js',
			'src/components/RetentionAgeWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/RetentionAgeWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
