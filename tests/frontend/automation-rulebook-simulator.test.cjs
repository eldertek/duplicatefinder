const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadRulebookModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const automationRulebookSimulator = loadModule('src/tools/automationRulebookSimulator.js', {
		'./duplicateStats': duplicateStats,
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		automationRulebookSimulator,
	}
}

function loadAutomationWorkbench(apiMock = {}) {
	const {
		duplicateStats,
		automationRulebookSimulator,
	} = loadRulebookModules()

	return loadComponent('src/components/AutomationRulebookWorkbench.vue', {
		'../tools/api': {
			deleteFiles: apiMock.deleteFiles || (async () => ({ deleted: [], failed: [] })),
		},
		'../tools/duplicateStats': duplicateStats,
		'../tools/automationRulebookSimulator': automationRulebookSimulator,
	})
}

function makeSampleDuplicates(nowMs = Date.UTC(2026, 10, 24, 0, 0, 0)) {
	const day = 86400000
	return [
		{
			id: 901,
			hash: 'hash-iso-01',
			size: 52428800,
			files: [
				{
					id: 11,
					path: '/alice/files/Origin/ubuntu-24.04.iso',
					size: 52428800,
					mtime: nowMs - 90 * day,
					isInOriginFolder: true,
				},
				{
					id: 12,
					path: '/alice/files/Downloads/ubuntu-24.04.iso',
					size: 52428800,
					mtime: nowMs - 45 * day,
					isInOriginFolder: false,
				},
				{
					id: 13,
					path: '/alice/files/Incoming/ubuntu-24.04.iso',
					size: 52428800,
					mtime: nowMs - 20 * day,
					isInOriginFolder: false,
				},
			],
		},
		{
			id: 902,
			hash: 'hash-cache-02',
			size: 2048000,
			files: [
				{
					id: 21,
					path: '/alice/files/Projects/app/bundle.js',
					size: 2048000,
					mtime: nowMs - 60 * day,
					isInOriginFolder: false,
				},
				{
					id: 22,
					path: '/alice/files/tmp/bundle.tmp',
					size: 2048000,
					mtime: nowMs - 25 * day,
					isInOriginFolder: false,
				},
				{
					id: 23,
					path: '/alice/files/Shared/Team/bundle.tmp',
					size: 2048000,
					mtime: nowMs - 40 * day,
					isInOriginFolder: false,
					isShared: true,
				},
			],
		},
		{
			id: 903,
			hash: 'hash-formula-03',
			size: 1024000,
			files: [
				{
					id: 31,
					path: '/alice/files/Archive/report.pdf',
					size: 1024000,
					mtime: nowMs - 5 * day,
					isInOriginFolder: false,
				},
				{
					id: 32,
					path: "/alice/files/Downloads/=CMD('calc')-report.tmp",
					size: 1024000,
					mtime: nowMs - 2 * day,
					isInOriginFolder: false,
				},
			],
		},
	]
}

test('Cycle 144: Zero-Touch Scheduled Retention Automation Rulebook & Policy Simulator', async t => {
	await t.test('5-field cron parser validates syntax and predicts deterministic UTC schedules', () => {
		const { automationRulebookSimulator } = loadRulebookModules()
		const refNow = Date.UTC(2026, 10, 24, 1, 30, 0)

		const valid = automationRulebookSimulator.computeNextCronRuns('0 2 * * *', 3, refNow)
		assert.equal(valid.valid, true)
		assert.equal(valid.runs.length, 3)
		assert.equal(valid.runs[0].iso, '2026-11-24T02:00:00.000Z')
		assert.equal(valid.runs[1].iso, '2026-11-25T02:00:00.000Z')
		assert.equal(valid.runs[2].iso, '2026-11-26T02:00:00.000Z')

		const weeklyInterval = automationRulebookSimulator.estimateCronIntervalDays('0 3 * * 0', refNow)
		assert.equal(weeklyInterval, 7)

		const invalid = automationRulebookSimulator.parseCronExpression('99 * * *')
		assert.equal(invalid.valid, false)
		assert.ok(invalid.error.length > 0)
	})

	await t.test('compileSafeRuleRegex blocks empty, oversized, and nested-quantifier ReDoS patterns', () => {
		const { automationRulebookSimulator } = loadRulebookModules()

		assert.equal(automationRulebookSimulator.compileSafeRuleRegex('').ok, false)
		assert.equal(automationRulebookSimulator.compileSafeRuleRegex('a'.repeat(250)).ok, false)
		assert.equal(automationRulebookSimulator.compileSafeRuleRegex('(a+)+$').ok, false)

		const valid = automationRulebookSimulator.compileSafeRuleRegex('\\.(iso|dmg)$')
		assert.equal(valid.ok, true)
		assert.equal(valid.regex.test('/files/ubuntu.ISO'), true)
	})

	await t.test('simulateRulebookPolicy enforces origin, share, grace-period, last-copy, and blast-radius safeguards across cycles', () => {
		const { automationRulebookSimulator } = loadRulebookModules()
		const nowMs = Date.UTC(2026, 10, 24, 0, 0, 0)
		const duplicates = makeSampleDuplicates(nowMs)

		const rulebook = automationRulebookSimulator.createRulebookFromPreset('conservative-ops')
		rulebook.cronExpression = '0 3 * * 0'
		rulebook.horizonCycles = 6
		rulebook.safeguards.blastRadiusCap = 2

		const report = automationRulebookSimulator.simulateRulebookPolicy(duplicates, rulebook, { nowMs })

		assert.equal(report.cronValidation.valid, true)
		assert.equal(report.cycles.length, 6)
		assert.ok(report.summary.cycle1ActedCount <= 2, 'Cycle 1 respects blast-radius cap')

		// Shared file (/Shared/Team/bundle.tmp) and Origin file (/Origin/ubuntu-24.04.iso) must be blocked
		const sharedItem = report.items.find(item => item.path === '/Shared/Team/bundle.tmp')
		assert.ok(sharedItem)
		assert.equal(sharedItem.status, 'blocked')
		assert.equal(sharedItem.blockedReason, 'share_mount_protected')

		const originItem = report.items.find(item => item.path === '/Origin/ubuntu-24.04.iso')
		assert.ok(originItem)
		assert.equal(originItem.status, 'blocked')
		assert.equal(originItem.blockedReason, 'origin_protected')

		// Formula-like file is 2 days old at Cycle 1 (grace=14d), so with weekly 7d cycles it matures in Cycle 3 (2 + 14 = 16d)!
		const futureItem = report.items.find(item => item.fileName.includes('report.tmp'))
		assert.ok(futureItem)
		assert.equal(futureItem.status, 'future-cycle')
		assert.equal(futureItem.scheduledCycle, 3)

		// Verify last-copy protection: at least 1 copy per group remains unacted
		const actedKeys = new Set(report.items.filter(i => i.status !== 'blocked').map(i => i.selectionKey))
		for (const group of duplicates) {
			const survivors = group.files.filter(f => !actedKeys.has(f.id))
			assert.ok(survivors.length >= 1, `Group ${group.id} keeps at least 1 survivor`)
		}
	})

	await t.test('OCC runbook, rollback quarantine script, JSON import/export, and CSV formula sanitization work safely', () => {
		const { automationRulebookSimulator } = loadRulebookModules()
		const nowMs = Date.UTC(2026, 10, 24, 0, 0, 0)
		const duplicates = makeSampleDuplicates(nowMs)
		const rulebook = automationRulebookSimulator.createRulebookFromPreset('conservative-ops')
		const report = automationRulebookSimulator.simulateRulebookPolicy(duplicates, rulebook, { nowMs })

		const occScript = automationRulebookSimulator.generateNextcloudOccRunbook(report, rulebook)
		assert.ok(occScript.includes('#!/usr/bin/env bash'))
		assert.ok(occScript.includes('occ duplicatefinder:find'))
		assert.ok(occScript.includes('DRY_RUN='))

		const rollbackScript = automationRulebookSimulator.generateRollbackQuarantineScript(report, rulebook)
		assert.ok(rollbackScript.includes('set -euo pipefail'))
		assert.ok(rollbackScript.includes('restore-rollback.sh'))
		assert.ok(rollbackScript.includes('DRY_RUN='))

		const quoted = automationRulebookSimulator.quotePosixShellArg("/a/b'c;rm -rf /")
		assert.equal(quoted, "'/a/b'\"'\"'c;rm -rf /'")

		const jsonStr = automationRulebookSimulator.exportRulebookJson(report, rulebook)
		const reimported = automationRulebookSimulator.parseRulebookConfigJson(jsonStr)
		assert.equal(reimported.ok, true)
		assert.equal(reimported.rulebook.rules.length, rulebook.rules.length)

		const badJson = automationRulebookSimulator.parseRulebookConfigJson('{"rules":[]}')
		assert.equal(badJson.ok, false)

		const csv = automationRulebookSimulator.exportSimulationCsv(report)
		assert.ok(csv.includes('Status,Scheduled Cycle'))
		assert.ok(csv.includes("'=CMD"), 'CWE-1236 formula payload must be escaped with leading apostrophe')
	})

	await t.test('AutomationRulebookWorkbench.vue renders empty & populated views, adds custom rules, and executes Cycle 1 cleanup', async () => {
		window.localStorage.clear()
		const deletedBatches = []
		const Workbench = loadAutomationWorkbench({
			deleteFiles: async files => {
				deletedBatches.push(files)
				return {
					deleted: files.map(f => f.id),
					failed: [],
				}
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
		assert.ok(emptyVm.$el.querySelector('.arw__empty'))
		emptyVm.$destroy()

		const nowMs = Date.UTC(2026, 10, 24, 0, 0, 0)
		const duplicates = makeSampleDuplicates(nowMs)
		const emittedEvents = []

		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates,
						allDuplicates: duplicates,
					},
					on: {
						'automation-delete-completed': payload => emittedEvents.push(payload),
					},
				})
			},
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.ok(vm.$el.querySelectorAll('.arw__kpi-card').length === 4)
		assert.ok(vm.$el.querySelectorAll('.arw__cycle-row').length === 6)
		assert.ok(comp.executableCycle1Items.length >= 1)

		// Add custom rule via form
		comp.addRuleOpen = true
		comp.draftRule.name = 'Custom Test Rule'
		comp.draftRule.pathRegex = '\\.bak$'
		comp.submitNewRule()
		await settle()
		assert.equal(comp.rulebook.rules.length, 4)

		// Controlled numeric input preserves user mid-keystroke text without clamping
		comp.onBlastRadiusInput('')
		assert.equal(comp.blastRadiusInput, '')
		comp.onBlastRadiusInput('25')
		assert.equal(comp.rulebook.safeguards.blastRadiusCap, 25)

		// Execute Cycle 1 Cleanup
		await comp.confirmCycle1Execution()
		await settle()
		assert.equal(deletedBatches.length, 1)
		assert.equal(emittedEvents.length, 1)
		assert.ok(emittedEvents[0].reclaimedBytes > 0)

		vm.$destroy()
	})

	await t.test('App.vue wires topbar Rulebook button and ; keyboard shortcut', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
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

		const slotBox = tag => ({ render(h) { return h(tag, this.$slots.default) } })
		const stub = name => ({ render(h) { return h('div', { class: `stub-${name}` }) } })

		const App = loadComponent('src/App.vue', {
			'@nextcloud/vue': {
				NcAppContent: slotBox('div'),
				NcContent: slotBox('div'),
				NcLoadingIcon: stub('loading'),
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
			'./components/VeterinaryEquineGenomicsVaultWorkbench.vue': { __esModule: true, default: stub('veterinary-equine-genomics-vault-auditor') },
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
		const btn = vm.$el.querySelector('button.topbar-automation-rulebook-button')
		assert.ok(btn, 'Topbar Rulebook button must be rendered')
		assert.equal(btn.getAttribute('aria-keyshortcuts'), ';')
		assert.equal(btn.getAttribute('aria-pressed'), 'false')

		btn.click()
		await settle()
		assert.equal(appComp.automationRulebookOpen, true)
		assert.equal(btn.getAttribute('aria-pressed'), 'true')
		assert.ok(vm.$el.querySelector('.stub-automation-rulebook'))

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: ';', bubbles: true }))
		await settle()
		assert.equal(appComp.automationRulebookOpen, false)

		vm.$destroy()
	})

	await t.test('Cycle 144 touched files preserve zero U+2013/U+2014 dashes, zero XSS sinks, logical CSS, and >= 44px mobile targets', () => {
		const files = [
			'src/tools/automationRulebookSimulator.js',
			'src/components/AutomationRulebookWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.ok(!/[\u2013\u2014]/.test(content), `No U+2013/U+2014 allowed in ${relPath}`)
			assert.ok(!/v-html|innerHTML|outerHTML|document\.write/.test(content), `No XSS sink allowed in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/AutomationRulebookWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes(':focus-visible'))
		assert.ok(vueContent.includes('44px'))
		assert.ok(vueContent.includes('padding-inline'))
		assert.ok(vueContent.includes('minmax(0, 1fr)'))
	})
})
