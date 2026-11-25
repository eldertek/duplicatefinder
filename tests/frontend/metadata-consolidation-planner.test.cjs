const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadPlannerModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const metadataConsolidationPlanner = loadModule('src/tools/metadataConsolidationPlanner.js', {
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		metadataConsolidationPlanner,
	}
}

function loadConsolidationWorkbench(apiMock = {}) {
	const {
		duplicateStats,
		metadataConsolidationPlanner,
	} = loadPlannerModules()

	return loadComponent('src/components/MetadataConsolidationWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/metadataConsolidationPlanner': metadataConsolidationPlanner,
	})
}

function makeSampleDuplicates() {
	const now = Date.UTC(2026, 10, 24, 0, 0, 0)
	const day = 86400000
	return [
		{
			id: 101,
			hash: 'hash-share-01',
			size: 4096000,
			files: [
				{
					id: 1001,
					fileId: 1001,
					path: '/alice/files/Projects/Q4-Report.pdf',
					size: 4096000,
					mtime: now - 5 * day,
					isFavorite: true,
					tags: ['Finance', 'Q4'],
					commentsCount: 2,
					versionsCount: 3,
				},
				{
					id: 1002,
					fileId: 1002,
					path: '/alice/files/Shared/Q4-Report.pdf',
					size: 4096000,
					mtime: now - 15 * day,
					tags: ['Board-Ready'],
					shares: [{ id: 's1', type: 'public_link', token: 'abc123' }],
				},
				{
					id: 1003,
					fileId: 1003,
					path: '/alice/files/Downloads/Q4-Report.pdf',
					size: 4096000,
					mtime: now - 20 * day,
				},
			],
		},
		{
			id: 102,
			hash: 'hash-fav-tag-02',
			size: 2048000,
			files: [
				{
					id: 2001,
					fileId: 2001,
					path: '/bob/files/Origin/contract.docx',
					size: 2048000,
					mtime: now - 40 * day,
					isInOriginFolder: true,
					tags: ['Legal'],
				},
				{
					id: 2002,
					fileId: 2002,
					path: '/bob/files/Inbox/contract.docx',
					size: 2048000,
					mtime: now - 10 * day,
					isFavorite: true,
					commentsCount: 1,
					tags: ['Legal', 'Signed', 'Urgent'],
				},
			],
		},
		{
			id: 103,
			hash: 'hash-clean-03',
			size: 1024000,
			files: [
				{
					id: 3001,
					fileId: 3001,
					path: '/carol/files/Media/banner.png',
					size: 1024000,
					mtime: now - 30 * day,
					isFavorite: true,
					tags: ['Brand'],
				},
				{
					id: 3002,
					fileId: 3002,
					path: "=CMD('calc')-banner.png",
					size: 1024000,
					mtime: now - 2 * day,
				},
			],
		},
	]
}

test('Cycle 145: Nextcloud Metadata, Tag, Favorite & Share-Link Consolidation Workbench', async t => {
	await t.test('extractFileCollaborativeMetadata and analyzeMetadataConsolidation score survivors and detect divergence', () => {
		const { metadataConsolidationPlanner } = loadPlannerModules()
		const dups = makeSampleDuplicates()

		const report = metadataConsolidationPlanner.analyzeMetadataConsolidation(dups, {
			strategy: 'metadata_richness',
		})

		assert.equal(report.summary.totalGroups, 3)
		assert.equal(report.summary.categoryCounts['unmigrated-shares'], 1)
		assert.equal(report.summary.categoryCounts['favorite-split'], 3)
		assert.equal(report.summary.categoryCounts['tag-divergence'], 3)
		assert.equal(report.summary.categoryCounts['comment-version-loss'], 0)
		assert.equal(report.summary.categoryCounts['clean-ready'], 2)

		const group101 = report.items.find(g => g.groupId === 101)
		assert.ok(group101)
		assert.equal(group101.riskTier, 'critical')
		assert.equal(group101.survivor.meta.fileId, 1001)
		assert.deepEqual(group101.missingTagsOnSurvivor, ['Board-Ready'])

		const sharedCand = group101.candidates.find(c => c.meta.fileId === 1002)
		assert.equal(sharedCand.copyStatus, 'blocked-active-share')

		const cleanCand = group101.candidates.find(c => c.meta.fileId === 1003)
		assert.equal(cleanCand.copyStatus, 'safe-to-delete')

		const originReport = metadataConsolidationPlanner.analyzeMetadataConsolidation(dups, {
			strategy: 'origin_and_shares',
		})
		assert.equal(originReport.summary.categoryCounts['comment-version-loss'], 2)
		const group102 = originReport.items.find(g => g.groupId === 102)
		assert.equal(group102.survivor.meta.fileId, 2001)
		assert.equal(group102.needsFavoriteSync, true)
		assert.deepEqual(group102.missingTagsOnSurvivor, ['Signed', 'Urgent'])
	})

	await t.test('collectConsolidationDeleteSelection never deletes protected or last copies and unlocks on acknowledgment', () => {
		const { metadataConsolidationPlanner } = loadPlannerModules()
		const dups = makeSampleDuplicates()

		const lockedReport = metadataConsolidationPlanner.analyzeMetadataConsolidation(dups, {
			strategy: 'origin_and_shares',
		})
		const safeBefore = metadataConsolidationPlanner.collectConsolidationDeleteSelection(lockedReport)
		// Group 101 copy 1003 + Group 103 copy 3002 (group 102 copy 2002 is held by favorite/tags)
		assert.deepEqual(safeBefore.files.map(f => f.id).sort((a, b) => a - b), [1003, 3002])

		const ackReport = metadataConsolidationPlanner.analyzeMetadataConsolidation(dups, {
			strategy: 'origin_and_shares',
			acknowledgedGroupKeys: ['id:102'],
		})
		const safeAfter = metadataConsolidationPlanner.collectConsolidationDeleteSelection(ackReport)
		assert.deepEqual(safeAfter.files.map(f => f.id).sort((a, b) => a - b), [1003, 2002, 3002])
	})

	await t.test('buildWebdavMigrationScript, buildConsolidationManifestJson, and CWE-1236 buildConsolidationCsv generate safe exports', () => {
		const { metadataConsolidationPlanner } = loadPlannerModules()
		const originReport = metadataConsolidationPlanner.analyzeMetadataConsolidation(makeSampleDuplicates(), {
			strategy: 'origin_and_shares',
		})

		const originScript = metadataConsolidationPlanner.buildWebdavMigrationScript(originReport, {
			baseUrl: 'https://nc.example.org',
		})
		assert.ok(originScript.includes('APPLY=0'))
		assert.ok(originScript.includes('PROPPATCH'))
		assert.ok(originScript.includes('<oc:favorite>1</oc:favorite>'))
		assert.ok(originScript.includes('/remote.php/dav/systemtags-relations/files/2001/Signed'))

		const richnessReport = metadataConsolidationPlanner.analyzeMetadataConsolidation(makeSampleDuplicates(), {
			strategy: 'metadata_richness',
		})
		const richnessScript = metadataConsolidationPlanner.buildWebdavMigrationScript(richnessReport, {
			baseUrl: 'https://nc.example.org',
		})
		assert.ok(richnessScript.includes('MANUAL ACTION REQUIRED'))

		const json = JSON.parse(metadataConsolidationPlanner.buildConsolidationManifestJson(originReport))
		assert.equal(json.schema, metadataConsolidationPlanner.METADATA_CONSOLIDATION_SCHEMA)
		assert.equal(json.groups.length, 3)

		const csv = metadataConsolidationPlanner.buildConsolidationCsv(originReport)
		assert.ok(csv.includes('Group ID,Risk Tier,Copy Role'))
		assert.ok(csv.includes("\"'=CMD('calc')"))
	})

	await t.test('MetadataConsolidationWorkbench.vue renders empty & populated views, marks migrated, and executes safe delete', async () => {
		const deletedPayloads = []
		const Workbench = loadConsolidationWorkbench({
			deleteFiles: async files => {
				deletedPayloads.push(files)
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

		const dups = makeSampleDuplicates()
		const completedEvents = []
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: dups,
						allDuplicates: dups,
						currentDuplicateId: 101,
					},
					on: {
						'consolidation-delete-completed': payload => completedEvents.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		assert.ok(vm.$el.textContent.includes('Metadata, Tag, Favorite & Share Consolidation'))
		assert.ok(vm.$el.textContent.includes('Q4-Report.pdf'))

		// Mark group 102 migrated via button click
		const markBtns = Array.from(vm.$el.querySelectorAll('button')).filter(b => b.textContent.includes('Mark Migrated'))
		assert.ok(markBtns.length >= 1)
		markBtns[0].click()
		await settle()
		assert.ok(vm.$el.textContent.includes('Migration Verified'))

		// Trigger batch safe deletion
		const batchBtn = vm.$el.querySelector('.mcw__batch-actions button.mcw__primary-btn')
		assert.ok(batchBtn, 'Global Delete Safe Copies button should exist')
		assert.ok(!batchBtn.disabled, 'Global Delete Safe Copies button should be enabled')
		batchBtn.click()
		await settle()

		const confirmBtn = vm.$el.querySelector('dialog button.mcw__primary-btn.is-danger')
		assert.ok(confirmBtn, 'Confirm button inside dialog should exist')
		confirmBtn.click()
		await settle()

		assert.equal(deletedPayloads.length, 1)
		assert.ok(deletedPayloads[0].length >= 2)
		assert.equal(completedEvents.length, 1)

		vm.$destroy()
	})

	await t.test('App.vue wires topbar Consolidate button and , keyboard shortcut', async () => {
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
		})
		const stub = name => ({ render(h) { return h('div', { class: `stub-${name}` }) } })
		const slotStub = tag => ({ render(h) { return h(tag, this.$slots.default) } })

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotStub('div'),
				NcContent: slotStub('div'),
				NcLoadingIcon: stub('loading'),
				NcButton: slotStub('button'),
				NcModal: stub('modal'),
				NcAppSettingsDialog: slotStub('div'),
				NcAppSettingsSection: slotStub('div'),
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
		const btn = vm.$el.querySelector('button.topbar-metadata-consolidation-button')
		assert.ok(btn, 'Topbar Consolidate button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), ',')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.metadataConsolidationOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-metadata-consolidation'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ',', bubbles: true }))
		await settle()
		assert.equal(appComp.metadataConsolidationOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 145 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/metadataConsolidationPlanner.js',
			'src/components/MetadataConsolidationWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/MetadataConsolidationWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax('))
	})
})
