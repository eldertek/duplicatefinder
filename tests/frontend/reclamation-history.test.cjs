const { describe, test, beforeEach, afterEach } = require('node:test')
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

function loadReclamationDeps() {
	const duplicateFilters = loadModule('src/tools/duplicateFilters.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
		'./duplicateFilters': duplicateFilters,
		'./duplicateStats': duplicateStats,
	})
	const SpaceReclamationTimeline = loadComponent('src/components/SpaceReclamationTimeline.vue', {
		'../tools/duplicateStats': duplicateStats,
		'../tools/reclamationHistory': reclamationHistory,
	})
	return {
		duplicateFilters,
		duplicateStats,
		reclamationHistory,
		SpaceReclamationTimeline,
	}
}

function createFullAppWithTimeline({
	acknowledged = [],
	unacknowledged = [],
	scanStatusResult = null,
	afterScanUnacknowledged = null,
	deleteFilesResult = null,
} = {}) {
	const utils = loadModule('src/tools/utils.js', {
		'./notifications': { showErrorNotification: () => {} },
	})
	const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
	const {
		duplicateFilters,
		duplicateStats,
		reclamationHistory,
		SpaceReclamationTimeline,
	} = loadReclamationDeps()
	const icon = slotBox('span')

	const DuplicateNavigation = {
		name: 'DuplicateNavigation',
		props: [
			'acknowledgedDuplicates',
			'unacknowledgedDuplicates',
			'currentDuplicateId',
			'acknowledgedPagination',
			'unacknowledgedPagination',
			'activeView',
			'activeProject',
			'projects',
			'initialSortOption',
			'initialMinSizeBytes',
			'hasDuplicates',
			'paginationResetToken',
		],
		methods: {
			getNavigableDuplicates() {
				return [...(this.unacknowledgedDuplicates || []), ...(this.acknowledgedDuplicates || [])]
			},
			scrollActiveDuplicateIntoView() {},
			selectNextDuplicateAfterResolution() {},
		},
		render(h) {
			return h('nav', { class: 'stub-duplicate-nav' })
		},
	}

	const DuplicateDetails = loadComponent('src/components/DuplicateDetails.vue', {
		'@/tools/api': {
			acknowledgeDuplicate: async () => {},
			unacknowledgeDuplicate: async () => {},
			deleteFiles: async files => deleteFilesResult || { success: files, errors: [] },
			findDuplicates: async () => {},
			saveFilter: async () => ({ status: 'success' }),
			saveExcludedFolder: async () => ({ status: 'success' }),
		},
		'@/tools/utils': utils,
		'@/tools/duplicateSelectionAndExport': loadModule('src/tools/duplicateSelectionAndExport.js'),
		'@/tools/duplicateSortHelper': loadModule('src/tools/duplicateSortHelper.js'),
		'@/tools/duplicateStats': duplicateStats,
		'@/tools/duplicateMetadataBadges': loadModule('src/tools/duplicateMetadataBadges.js'),
		'@/tools/duplicatePathDiff': loadModule('src/tools/duplicatePathDiff.js'),
		'@/tools/deleteSafetyGuard': loadModule('src/tools/deleteSafetyGuard.js'),
		'@/tools/duplicateGroupSummary': loadModule('src/tools/duplicateGroupSummary.js'),
		'@/tools/duplicateHashHelper': loadModule('src/tools/duplicateHashHelper.js'),
		'@/tools/visualMediaInspector': loadModule('src/tools/visualMediaInspector.js'),
		'@/tools/clipboardHelper': loadModule('src/tools/clipboardHelper.js'),
		'@nextcloud/dialogs': { showSuccess() {}, showError() {} },
		'./DuplicateCompareView.vue': slotBox('div'),
		'./DuplicateFileDisplay.vue': slotBox('div'),
	})
	Vue.component('NcLoadingSpinner', { render: h => h('span') })

	const stub = name => ({
		name,
		props: ['duplicate', 'projectId', 'show', 'isScanning'],
		render(h) {
			return h('div', { class: `stub-${name}` })
		},
	})

	let scanTriggered = false
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
		'./components/DuplicateDetails.vue': { __esModule: true, default: DuplicateDetails },
		'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('duplicate-treemap') },
		'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: SpaceReclamationTimeline },
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
		'./components/ProjectsSettings.vue': { __esModule: true, default: stub('projects') },
		'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
		'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
		'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
		'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
		'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
		'@/tools/api': {
			fetchDuplicates: async type => {
				const list = type === 'acknowledged'
					? acknowledged
					: (scanTriggered && afterScanUnacknowledged ? afterScanUnacknowledged : unacknowledged)
				return {
					entities: list,
					pagination: {
						currentPage: 1,
						totalPages: 1,
						totalItems: list.length,
						hasMore: false,
					},
				}
			},
			fetchProjects: async () => [],
			fetchScanStatus: async () => ({
				running: false,
				indeterminate: false,
				scannedFiles: 120,
				totalFiles: 120,
				percentage: 100,
				completedSeq: 1,
				etaSeconds: null,
			}),
			startUserScan: async () => {
				scanTriggered = true
				return scanStatusResult || {
					running: false,
					indeterminate: false,
					scannedFiles: 150,
					totalFiles: 150,
					percentage: 100,
					completedSeq: 2,
					etaSeconds: null,
				}
			},
			notifyScanStarted: () => {},
			notifyScanCompleted: () => {},
			notifyScanFailed: () => {},
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

	return {
		App,
		duplicateFilters,
		duplicateStats,
		reclamationHistory,
		SpaceReclamationTimeline,
		keyboardShortcuts,
	}
}

describe('Cycle 119: Batch Scan History and Space Reclamation Timeline Analytics Panel', () => {
	beforeEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
		delete window.OC.getCurrentUser
	})

	afterEach(() => {
		window.localStorage.clear()
		delete window.OC.currentUser
		delete window.OC.getCurrentUser
	})

	test('reclamationHistory sanitizes storage, enforces MAX_HISTORY_ENTRIES, and preserves cumulative counters', () => {
		const { reclamationHistory } = loadReclamationDeps()
		const {
			MAX_HISTORY_ENTRIES,
			createEmptyHistoryState,
			getReclamationHistoryStorageKey,
			loadReclamationHistory,
			saveReclamationHistory,
			recordCleanupBatch,
			recordScanSnapshot,
			clearReclamationHistory,
		} = reclamationHistory

		window.OC.currentUser = 'alice'
		assert.equal(getReclamationHistoryStorageKey(), 'duplicatefinder:reclamation-history:alice')

		// Corrupted JSON and throwing storage never throw
		window.localStorage.setItem(getReclamationHistoryStorageKey(), '{corrupted-json')
		assert.deepEqual(loadReclamationHistory(), createEmptyHistoryState())
		assert.deepEqual(
			loadReclamationHistory({ getItem() { throw new Error('blocked') } }),
			createEmptyHistoryState()
		)
		assert.equal(saveReclamationHistory({ setItem() { throw new Error('quota') } }, createEmptyHistoryState()), false)

		let state = createEmptyHistoryState()
		state = recordScanSnapshot(state, {
			groupCount: 4,
			unacknowledgedCount: 3,
			acknowledgedCount: 1,
			reclaimableBytes: 4000,
			redundantCopies: 5,
			scannedFiles: 200,
		}, { trigger: 'baseline', timestamp: 1000 })

		assert.equal(state.entries.length, 1)
		assert.equal(state.entries[0].deltaBytes, null)

		// Identical baseline within 15m window is coalesced
		const coalesced = recordScanSnapshot(state, {
			groupCount: 4,
			unacknowledgedCount: 3,
			acknowledgedCount: 1,
			reclaimableBytes: 4000,
			redundantCopies: 5,
			scannedFiles: 200,
		}, { trigger: 'baseline', timestamp: 2000 })
		assert.equal(coalesced.entries.length, 1)

		// Record 65 cleanups to verify bounded ring buffer + preserved cumulative totals
		for (let i = 1; i <= 65; i++) {
			state = recordCleanupBatch(state, {
				bytesReclaimed: 1000,
				filesDeleted: 1,
				groupsResolved: i % 2 === 0 ? 1 : 0,
				source: 'group',
				sampleLabel: `photo_${i}.jpg\u0007`,
				timestamp: 10000 + i * 1000,
			})
		}

		assert.equal(state.entries.length, MAX_HISTORY_ENTRIES)
		assert.equal(state.totalBytesReclaimed, 65000)
		assert.equal(state.totalFilesDeleted, 65)
		assert.equal(state.totalGroupsResolved, 32)
		assert.equal(state.entries[0].sampleLabel, 'photo_65.jpg')

		assert.equal(saveReclamationHistory(window.localStorage, state), true)
		const reloaded = loadReclamationHistory(window.localStorage)
		assert.equal(reloaded.totalBytesReclaimed, 65000)
		assert.equal(reloaded.entries.length, MAX_HISTORY_ENTRIES)

		const cleared = clearReclamationHistory(window.localStorage)
		assert.deepEqual(cleared, createEmptyHistoryState())
		assert.deepEqual(loadReclamationHistory(window.localStorage), createEmptyHistoryState())
	})

	test('computeDuplicateBacklogSnapshot, scan deltas, summary KPIs, and JSON export compute exact values', () => {
		const { reclamationHistory } = loadReclamationDeps()
		const {
			buildReclamationExportPayload,
			computeDuplicateBacklogSnapshot,
			computeReclamationSummary,
			createEmptyHistoryState,
			filterHistoryEntries,
			formatSignedBytesDelta,
			recordCleanupBatch,
			recordScanSnapshot,
		} = reclamationHistory

		const duplicates = [
			{
				id: 1,
				hash: 'h1',
				acknowledged: false,
				files: [
					{ id: 1, path: '/u/files/Photos/a.jpg', size: 2000000, mimetype: 'image/jpeg' },
					{ id: 2, path: '/u/files/Backup/a.jpg', size: 2000000, mimetype: 'image/jpeg' },
				],
			},
			{
				id: 2,
				hash: 'h2',
				acknowledged: true,
				files: [
					{ id: 3, path: '/u/files/Videos/clip.mp4', size: 3000000, mimetype: 'video/mp4' },
					{ id: 4, path: '/u/files/Videos/copy1.mp4', size: 3000000, mimetype: 'video/mp4' },
					{ id: 5, path: '/u/files/Videos/copy2.mp4', size: 3000000, mimetype: 'video/mp4' },
				],
			},
		]

		const backlog1 = computeDuplicateBacklogSnapshot(duplicates, {
			unacknowledgedCount: 1,
			acknowledgedCount: 1,
		}, { scannedFiles: 300 })

		assert.equal(backlog1.groupCount, 2)
		assert.equal(backlog1.reclaimableBytes, 8000000)
		assert.equal(backlog1.redundantCopies, 3)
		assert.equal(backlog1.categoryBreakdown[0].category, 'videos')
		assert.equal(backlog1.categoryBreakdown[0].reclaimableBytes, 6000000)
		assert.equal(backlog1.categoryBreakdown[1].category, 'images')
		assert.equal(backlog1.categoryBreakdown[1].reclaimableBytes, 2000000)

		let state = createEmptyHistoryState()
		state = recordScanSnapshot(state, backlog1, { trigger: 'manual', timestamp: 1000 })
		state = recordCleanupBatch(state, {
			bytesReclaimed: 2000000,
			filesDeleted: 1,
			groupsResolved: 1,
			source: 'single',
			sampleLabel: 'a.jpg',
			timestamp: 2000,
		})

		const backlog2 = computeDuplicateBacklogSnapshot([duplicates[1]], {
			unacknowledgedCount: 0,
			acknowledgedCount: 1,
		}, { scannedFiles: 305 })
		state = recordScanSnapshot(state, backlog2, { trigger: 'manual', timestamp: 3000 })

		assert.equal(state.entries[0].deltaBytes, -2000000)
		assert.equal(state.entries[0].deltaGroups, -1)
		assert.equal(formatSignedBytesDelta(-2000000), '-1.9 MB')
		assert.equal(formatSignedBytesDelta(0), '0 B')

		const summary = computeReclamationSummary(state, backlog2)
		assert.equal(summary.totalReclaimedBytes, 2000000)
		assert.equal(summary.remainingReclaimableBytes, 6000000)
		assert.equal(summary.reclaimedPercent, 25)
		assert.equal(summary.scanCount, 2)
		assert.equal(summary.cleanupCount, 1)
		assert.equal(summary.lastScanDeltaDirection, 'improved')

		assert.equal(filterHistoryEntries(state.entries, 'all').length, 3)
		assert.equal(filterHistoryEntries(state.entries, 'cleanup').length, 1)
		assert.equal(filterHistoryEntries(state.entries, 'scan').length, 2)

		const exported = buildReclamationExportPayload(state, backlog2)
		assert.equal(exported.schemaVersion, 1)
		assert.equal(exported.summary.totalReclaimedBytes, 2000000)
		assert.equal(exported.entries.length, 3)
	})

	test('SpaceReclamationTimeline renders empty, filtered-empty, populated KPIs, XSS-safe labels, and clear confirmation', async () => {
		const { reclamationHistory, SpaceReclamationTimeline } = loadReclamationDeps()

		const emptyVm = new Vue({
			render(h) {
				return h(SpaceReclamationTimeline, {
					props: {
						historyState: reclamationHistory.createEmptyHistoryState(),
						currentBacklog: reclamationHistory.computeDuplicateBacklogSnapshot([]),
					},
				})
			},
		}).$mount()
		await settle()
		assert.match(emptyVm.$el.querySelector('.reclamation-empty-state__message').textContent, /No scan or cleanup history/)
		emptyVm.$destroy()

		let state = reclamationHistory.createEmptyHistoryState()
		state = reclamationHistory.recordCleanupBatch(state, {
			bytesReclaimed: 1048576,
			filesDeleted: 1,
			groupsResolved: 1,
			source: 'bulk',
			sampleLabel: '<img src=x onerror=alert(1)>evil.jpg',
			timestamp: 50000,
		})
		const backlog = reclamationHistory.computeDuplicateBacklogSnapshot([
			{
				id: 10,
				hash: 'abc',
				files: [
					{ id: 1, path: '/u/files/Photos/1.jpg', size: 1048576, mimetype: 'image/jpeg' },
					{ id: 2, path: '/u/files/Photos/2.jpg', size: 1048576, mimetype: 'image/jpeg' },
				],
			},
		])

		let clearedCount = 0
		const vm = new Vue({
			render(h) {
				return h(SpaceReclamationTimeline, {
					props: {
						historyState: state,
						currentBacklog: backlog,
					},
					on: {
						'clear-history': () => {
							clearedCount += 1
						},
					},
				})
			},
		}).$mount()
		await settle()

		const progress = vm.$el.querySelector('[role="progressbar"]')
		assert.equal(progress.getAttribute('aria-valuenow'), '50')

		// XSS payload rendered strictly as text
		const sampleEl = vm.$el.querySelector('.reclamation-timeline-item__sample')
		assert.equal(sampleEl.textContent.trim(), '<img src=x onerror=alert(1)>evil.jpg')
		assert.equal(sampleEl.querySelector('img'), null)

		// Filter to Scans -> filtered empty state -> Show all events
		const filterBtns = Array.from(vm.$el.querySelectorAll('.reclamation-filter-button'))
		filterBtns[2].click()
		await settle()
		assert.match(vm.$el.querySelector('.reclamation-empty-state__message').textContent, /No timeline events match/)
		vm.$el.querySelector('.reclamation-empty-state__reset').click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.reclamation-timeline-item').length, 1)

		// Inline 2-step clear confirmation (no window.confirm)
		vm.$el.querySelector('.reclamation-clear-button').click()
		await settle()
		vm.$el.querySelector('.reclamation-clear-confirm__yes').click()
		await settle()
		assert.equal(clearedCount, 1)

		vm.$destroy()
	})

	test('App.vue integrates History button, h shortcut, live cleanup recording, and scan snapshot delta', async () => {
		const initialGroup = {
			id: 1,
			hash: 'h-init',
			acknowledged: false,
			files: [
				{ id: 11, nodeId: 101, path: '/alice/files/Photos/keep.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: true },
				{ id: 12, nodeId: 102, path: '/alice/files/Backup/dup1.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
				{ id: 13, nodeId: 103, path: '/alice/files/Backup/dup2.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
			],
		}
		const afterScanGroup = {
			id: 1,
			hash: 'h-init',
			acknowledged: false,
			files: [
				{ id: 11, nodeId: 101, path: '/alice/files/Photos/keep.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: true },
				{ id: 12, nodeId: 102, path: '/alice/files/Backup/dup1.jpg', size: 2048, mimetype: 'image/jpeg', isInOriginFolder: false },
			],
		}

		const { App, keyboardShortcuts } = createFullAppWithTimeline({
			unacknowledged: [initialGroup],
			afterScanUnacknowledged: [afterScanGroup],
		})

		const shortcutDef = keyboardShortcuts.SHORTCUT_DEFINITIONS.find(def => def.id === 'toggle-reclamation-history')
		assert.ok(shortcutDef && shortcutDef.keys.includes('h'))

		const vm = new Vue(App).$mount()
		await settle()

		const historyBtn = vm.$el.querySelector('.topbar-history-button')
		assert.ok(historyBtn, 'History button is present in topbar')
		assert.equal(historyBtn.getAttribute('aria-keyshortcuts'), 'h')
		assert.equal(vm.reclamationHistory.entries.length, 1, 'initial load records baseline scan snapshot')
		assert.equal(vm.reclamationHistory.entries[0].trigger, 'baseline')

		// Toggle open via h keyboard shortcut
		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'h', bubbles: true }))
		await settle()
		assert.equal(vm.historyOpen, true)
		assert.ok(vm.$el.querySelector('.reclamation-workspace'))

		// Ignored while typing inside input
		const fakeInput = document.createElement('input')
		document.body.appendChild(fakeInput)
		fakeInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'h', bubbles: true }))
		await settle()
		assert.equal(vm.historyOpen, true)
		document.body.removeChild(fakeInput)

		// Delete a copy via DuplicateDetails and verify live reclamation recording
		const detailsVm = vm.$refs.duplicateDetails
		detailsVm.selectedFiles = [initialGroup.files[2]]
		await detailsVm.executeSelectedDeletion({ wouldDeleteAllCopies: false })
		await settle()

		assert.equal(vm.reclamationHistory.totalBytesReclaimed, 2048)
		assert.equal(vm.reclamationHistory.totalFilesDeleted, 1)
		assert.equal(vm.reclamationHistory.entries[0].kind, 'cleanup')

		// Trigger manual scan and verify scan delta entry
		await vm.triggerScan()
		await settle()
		assert.equal(vm.reclamationHistory.entries[0].kind, 'scan')
		assert.equal(vm.reclamationHistory.entries[0].trigger, 'manual')
		assert.equal(vm.reclamationHistory.entries[0].deltaBytes, -2048)

		// Shortcuts dialog documents h
		vm.openShortcutsDialog()
		await settle()
		assert.match(vm.$el.querySelector('.shortcuts-dialog').textContent, /Toggle scan history and reclamation timeline/)
		vm.closeShortcutsDialog()
		await settle()

		vm.$destroy()
	})

	test('Cycle 119 touched files enforce zero dashes, zero XSS sinks, logical CSS, focus-visible, and 44px mobile touch targets', () => {
		for (const relPath of [
			'src/tools/reclamationHistory.js',
			'src/components/SpaceReclamationTimeline.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]) {
			const content = readFileSync(resolve(root, relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 dash allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No DOM XSS sink allowed in ${relPath}`)
		}

		const timelineContent = readFileSync(resolve(root, 'src/components/SpaceReclamationTimeline.vue'), 'utf8')
		assert.ok(timelineContent.includes(':focus-visible'))
		assert.ok(timelineContent.includes('44px'))
		assert.ok(timelineContent.includes('border-inline-start'))
		assert.ok(timelineContent.includes('minmax(0, 1fr)'))
	})
})
