const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadLegalHoldModules() {
	const duplicateStats = loadModule('src/tools/duplicateStats.js', {})
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js', {})
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js', {})
	const legalHoldGuard = loadModule('src/tools/legalHoldGuard.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
	return {
		duplicateStats,
		duplicatePathDiff,
		duplicateSelectionAndExport,
		legalHoldGuard,
	}
}

function loadLegalHoldWorkbench() {
	const { legalHoldGuard } = loadLegalHoldModules()
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js', {})
	return loadComponent('src/components/LegalHoldWorkbench.vue', {
		'../tools/clipboardHelper': clipboardHelper,
		'../tools/legalHoldGuard': legalHoldGuard,
	})
}

function buildSampleLegalDuplicates() {
	return [
		{
			id: 701,
			hash: 'lh-fin-01',
			size: 120 * 1024 * 1024,
			files: [
				{
					id: 7001,
					path: '/alice/files/Finance/Taxes/2025-vat-ledger.xlsx',
					size: 120 * 1024 * 1024,
					mtime: 1732000000000,
				},
				{
					id: 7002,
					path: '/bob/files/Archive/2025-vat-ledger-copy.xlsx',
					size: 120 * 1024 * 1024,
					mtime: 1732050000000,
				},
			],
		},
		{
			id: 702,
			hash: 'lh-contract-02',
			size: 40 * 1024 * 1024,
			files: [
				{
					id: 7003,
					path: '/__groupfolders/9/Legal/Contracts/vendor-msa-signed.pdf',
					size: 40 * 1024 * 1024,
					mtime: 1732100000000,
				},
				{
					id: 7004,
					path: '/alice/files/Drafts/vendor-msa-signed.pdf',
					size: 40 * 1024 * 1024,
					mtime: 1732150000000,
				},
			],
		},
		{
			id: 703,
			hash: 'lh-payroll-03',
			size: 25 * 1024 * 1024,
			files: [
				{
					id: 7005,
					path: '/hr-admin/files/Payroll/2026-02-payslips.csv',
					size: 25 * 1024 * 1024,
					mtime: 1732200000000,
				},
				{
					id: 7006,
					path: '/hr-admin/files/Backup/2026-02-payslips.csv',
					size: 25 * 1024 * 1024,
					mtime: 1732250000000,
				},
			],
		},
		{
			id: 704,
			hash: 'lh-media-04',
			size: 10 * 1024 * 1024,
			files: [
				{
					id: 7007,
					path: '/alice/files/Photos/office-picnic-01.jpg',
					size: 10 * 1024 * 1024,
					mtime: 1732300000000,
				},
				{
					id: 7008,
					path: '/alice/files/Downloads/office-picnic-01.jpg',
					size: 10 * 1024 * 1024,
					mtime: 1732350000000,
				},
			],
		},
	]
}

test('LegalHoldGuard pure engine and LegalHoldWorkbench.vue', async t => {
	await t.test('sanitizes matter IDs, custodian tokens, and compiles safe custom matchers', () => {
		const { legalHoldGuard } = loadLegalHoldModules()
		assert.equal(legalHoldGuard.sanitizeMatterId('  litigation 2026 / #44! '), 'LITIGATION-2026-44')
		assert.equal(legalHoldGuard.sanitizeMatterId(''), 'MATTER-2026-001')
		assert.equal(legalHoldGuard.sanitizeCustodianId(' counsel-01;rm -rf '), 'counsel-01rm-rf')

		const literalFallback = legalHoldGuard.compileCustomMatcher('(a+)+b')
		assert.equal(literalFallback('/alice/files/(a+)+b/test.pdf'), true)
		assert.equal(literalFallback('/alice/files/normal.pdf'), false)

		const invalidRegex = legalHoldGuard.compileCustomMatcher('[unclosed-group')
		assert.equal(invalidRegex('/legal/[unclosed-group/doc.pdf'), true)
		assert.equal(invalidRegex('/legal/other.pdf'), false)
	})

	await t.test('classifies compliance domains, computes deterministic custody fingerprints, and separates held vs releasable bytes', () => {
		const { legalHoldGuard } = loadLegalHoldModules()
		const sample = buildSampleLegalDuplicates()
		const analysis = legalHoldGuard.evaluateLegalHoldGuard(sample, {
			matterId: 'CASE-2026-88',
			presetId: 'litigation-hold',
			keepRule: 'custodian-anchor',
			preferredCustodian: 'groupfolder:9',
		})

		assert.equal(analysis.policy.matterId, 'CASE-2026-88')
		assert.equal(analysis.summary.totalGroups, 4)
		assert.equal(analysis.summary.protectedGroupsCount, 3)
		assert.equal(analysis.summary.policyProtectedCount, 3)
		assert.equal(analysis.summary.releasableGroupsCount, 1)
		assert.equal(analysis.summary.blockedCopiesCount, 3)
		assert.equal(analysis.summary.releasableCopiesCount, 1)
		assert.equal(analysis.summary.protectedBytes, (120 + 40 + 25) * 1024 * 1024)
		assert.equal(analysis.summary.safeReclaimableBytes, 10 * 1024 * 1024)

		const contractGroup = analysis.groups.find(g => g.groupId === 702)
		assert.ok(contractGroup)
		assert.equal(contractGroup.survivorPath, '/__groupfolders/9/Legal/Contracts/vendor-msa-signed.pdf')
		assert.equal(contractGroup.hasSignedArtifact, true)
		assert.ok(contractGroup.matchedDomains.includes('contracts-legal'))
		assert.match(contractGroup.custodyFingerprint, /^custody-[0-9a-f]{16}$/)

		const reversed = {
			...sample[1],
			files: [...sample[1].files].reverse(),
		}
		assert.equal(
			legalHoldGuard.computeCustodyFingerprint(sample[1], sample[1].files),
			legalHoldGuard.computeCustodyFingerprint(reversed, reversed.files),
		)
	})

	await t.test('enforces hard-immutable locks and validates counsel exception overrides', () => {
		const { legalHoldGuard } = loadLegalHoldModules()
		const sample = buildSampleLegalDuplicates()

		const blockedOverride = legalHoldGuard.validateExceptionOverrideInput({
			approverId: 'counsel-01',
			reason: 'Duplicate archive cleared',
			isHardImmutable: true,
		})
		assert.equal(blockedOverride.valid, false)
		assert.match(blockedOverride.errors[0], /unfreeze/i)

		const shortReason = legalHoldGuard.validateExceptionOverrideInput({
			approverId: 'counsel-01',
			reason: 'ok',
			isHardImmutable: false,
		})
		assert.equal(shortReason.valid, false)

		const analysis = legalHoldGuard.evaluateLegalHoldGuard(sample, {
			freezeRegistry: {
				'id:701': {
					matterId: 'CASE-FREEZE',
					custodian: 'alice',
					holdReason: 'Subpoena #12',
					immutable: true,
				},
			},
			overrideLog: [
				{
					id: 'ovr-1',
					groupKey: 'id:702',
					groupId: 702,
					hash: 'lh-contract-02',
					matterId: 'CASE-FREEZE',
					approverId: 'counsel-01',
					reason: 'Draft duplicate cleared by legal counsel',
					timestampIso: '2026-11-24T00:00:00.000Z',
				},
			],
		})

		assert.equal(analysis.summary.hardFrozenCount, 1)
		assert.equal(analysis.summary.overrideLoggedCount, 1)
		assert.equal(analysis.summary.policyProtectedCount, 1)
		assert.equal(analysis.summary.releasableGroupsCount, 1)

		const frozenGroup = analysis.groups.find(g => g.groupId === 701)
		const overriddenGroup = analysis.groups.find(g => g.groupId === 702)
		assert.equal(frozenGroup.status, 'frozen-immutable')
		assert.equal(frozenGroup.isProtected, true)
		assert.equal(overriddenGroup.status, 'override-logged')
		assert.equal(overriddenGroup.isProtected, false)
		assert.equal(overriddenGroup.releasableCopies, 1)
	})

	await t.test('exports valid JSON manifest, CWE-1236-safe CSV, and POSIX occ script', () => {
		const { legalHoldGuard } = loadLegalHoldModules()
		const injectionGroup = [
			{
				id: 901,
				hash: '=SUM(1+1)',
				size: 4096,
				files: [
					{
						id: 9001,
						path: '/=cmd/files/Legal/+invoice-signed.pdf',
						size: 4096,
						mtime: 1732400000000,
					},
					{
						id: 9002,
						path: '/@evil/files/Legal/-copy.pdf',
						size: 4096,
						mtime: 1732450000000,
					},
				],
			},
		]
		const analysis = legalHoldGuard.evaluateLegalHoldGuard(injectionGroup, {
			matterId: 'CASE-CSV-1',
			overrideLog: [
				{
					id: 'ovr-csv-1',
					groupKey: 'id:901',
					groupId: 901,
					hash: '=SUM(1+1)',
					matterId: 'CASE-CSV-1',
					approverId: '@counsel',
					reason: '=cmd|/C calc!A0',
					timestampIso: '2026-11-24T00:00:00.000Z',
				},
			],
		})

		const jsonText = legalHoldGuard.exportLegalHoldManifestJson(analysis, '2026-11-24T01:00:00.000Z')
		const parsed = JSON.parse(jsonText)
		assert.equal(parsed.schema, legalHoldGuard.LEGAL_HOLD_MANIFEST_SCHEMA)
		assert.equal(parsed.heldGroups.length, 1)

		const csv = legalHoldGuard.exportLegalHoldCustodyCsv(analysis)
		assert.match(csv, /^Group ID,Hash,Matter ID/)
		assert.ok(csv.includes('"\'=SUM(1+1)"'))
		assert.ok(csv.includes('"\'@counsel"'))
		assert.ok(csv.includes('"\'=cmd|/C calc!A0"'))

		const occScript = legalHoldGuard.buildLegalHoldOccScript(analysis)
		assert.match(occScript, /^#!\/usr\/bin\/env bash/m)
		assert.ok(occScript.includes('CASE-CSV-1'))
		assert.ok(occScript.includes('$OCC_BIN tag:add'))
	})

	await t.test('LegalHoldWorkbench.vue renders empty & populated states, freeze locks, overrides, and unclamped inputs without XSS sinks', async () => {
		const Workbench = loadLegalHoldWorkbench()
		if (window.localStorage) {
			window.localStorage.clear()
		}

		const emptyEmits = []
		const emptyVm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: [],
						allDuplicates: [],
					},
					on: {
						'start-scan': () => emptyEmits.push('start-scan'),
					},
				})
			},
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.querySelector('.lhw__empty-banner'))
		emptyVm.$el.querySelector('.lhw__empty-banner .lhw__primary-btn').click()
		await settle()
		assert.deepEqual(emptyEmits, ['start-scan'])
		emptyVm.$destroy()

		const sample = buildSampleLegalDuplicates()
		const vm = new Vue({
			render(h) {
				return h(Workbench, {
					props: {
						duplicates: sample,
						allDuplicates: sample,
						currentDuplicateId: 701,
					},
				})
			},
		}).$mount()
		await settle()

		const comp = vm.$children[0]
		assert.equal(comp.analysis.summary.protectedGroupsCount, 3)

		const numInput = vm.$el.querySelector('input.lhw__num-input')
		numInput.value = '12'
		numInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInput.value, '12')

		comp.freezeReasonInput = 'Tax audit lock'
		comp.freezeSelectedGroup()
		await settle()
		assert.equal(comp.analysis.summary.hardFrozenCount, 1)
		assert.match(comp.statusNotice, /Frozen immutable/)

		comp.overrideApproverInput = 'counsel-01'
		comp.overrideReasonInput = 'Trying while frozen'
		comp.submitExceptionOverride()
		await settle()
		assert.equal(comp.statusNoticeType, 'error')

		comp.unfreezeSelectedGroup()
		await settle()
		assert.equal(comp.analysis.summary.hardFrozenCount, 0)

		comp.overrideApproverInput = 'counsel-01'
		comp.overrideReasonInput = 'Verified archive superseded by signed final'
		comp.submitExceptionOverride()
		await settle()
		assert.equal(comp.statusNoticeType, 'success')
		assert.equal(comp.analysis.overrideAuditLog.length, 1)

		vm.$destroy()
	})

	await t.test('App.vue opens LegalHoldWorkbench via topbar button and ! shortcut', async () => {
		const { legalHoldGuard } = loadLegalHoldModules()
		const LegalWorkbench = loadLegalHoldWorkbench()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const reclamationHistory = loadModule('src/tools/reclamationHistory.js', {
			'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
			'./duplicateStats': loadModule('src/tools/duplicateStats.js'),
		})

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
			'./components/DuplicateNavigation.vue': { __esModule: true, default: stub('navigation') },
			'./components/DuplicateDetails.vue': { __esModule: true, default: stub('details') },
			'./components/DuplicateTreemap.vue': { __esModule: true, default: stub('treemap') },
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('history') },
			'./components/SimilarityInspector.vue': { __esModule: true, default: stub('similarity') },
			'./components/BatchAutoSelectWorkbench.vue': { __esModule: true, default: stub('batch') },
			'./components/FileHygieneInspector.vue': { __esModule: true, default: stub('hygiene') },
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('bursts') },
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
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: LegalWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleLegalDuplicates(),
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
			'@/tools/legalHoldGuard': legalHoldGuard,
			'vue-material-design-icons/Folder': stub('icon-folder'),
			'vue-material-design-icons/FolderRemove': stub('icon-folder-remove'),
			'vue-material-design-icons/FolderMultiple': stub('icon-folder-multiple'),
			'vue-material-design-icons/Delete': stub('icon-delete'),
			'vue-material-design-icons/FilterOutline': stub('icon-filter-outline'),
		})

		const vm = new Vue({ render: h => h(App) }).$mount()
		await settle()

		const topbarBtn = vm.$el.querySelector('.topbar-legal-hold-button')
		assert.ok(topbarBtn, 'Topbar Legal Hold button should render')
		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.legal-hold-workbench'), 'LegalHoldWorkbench should open on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '!', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.legal-hold-workbench'), null, 'LegalHoldWorkbench should toggle closed on ! shortcut')

		vm.$destroy()
	})

	await t.test('source files contain zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/legalHoldGuard.js',
			'src/components/LegalHoldWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(__dirname, '../..', rel), 'utf8')
			assert.equal(content.includes('\u2013'), false, `No U+2013 in ${rel}`)
			assert.equal(content.includes('\u2014'), false, `No U+2014 in ${rel}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/LegalHoldWorkbench.vue'), 'utf8')
		assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(vueContent), false)
	})
})
