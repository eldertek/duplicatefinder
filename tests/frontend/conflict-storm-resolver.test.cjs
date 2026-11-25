const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadConflictStormModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/conflictStormResolver.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadConflictStormWorkbench(clipboardImpl) {
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const conflictStormResolver = loadConflictStormModule()
	return loadComponent('src/components/ConflictStormWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/duplicateStats': duplicateStats,
		'../tools/conflictStormResolver': conflictStormResolver,
	})
}

function buildSampleConflictDuplicates() {
	const baseSec = 1795000000
	return [
		{
			id: 901,
			hash: 'sha256-q4-budget-exact',
			size: 2048000,
			acknowledged: false,
			files: [
				{
					id: 9011,
					path: '/alice/files/Finance/Q4 Budget.xlsx',
					size: 2048000,
					mtime: baseSec,
					origin: false,
				},
				{
					id: 9012,
					path: '/alice/files/Finance/Q4 Budget (conflicted copy 2026-11-20 140312).xlsx',
					size: 2048000,
					mtime: baseSec + 120,
					origin: false,
				},
				{
					id: 9013,
					path: '/alice/files/Finance/Q4 Budget.sync-conflict-20261120-140500-NODE01.xlsx',
					size: 2048000,
					mtime: baseSec + 200,
					origin: false,
				},
				{
					id: 9014,
					path: '/alice/files/Imports/OneDrive/Q4 Budget (1).xlsx',
					size: 2048000,
					mtime: baseSec - 3600,
					origin: false,
				},
			],
		},
		{
			id: 902,
			hash: 'sha256-q4-budget-divergent-newer',
			size: 2150000,
			acknowledged: false,
			files: [
				{
					id: 9021,
					path: '/alice/files/Finance/Q4 Budget-DESKTOP-7X9K2.xlsx',
					size: 2150000,
					mtime: baseSec + 900,
					origin: false,
				},
			],
		},
		{
			id: 903,
			hash: 'sha256-q4-budget-stale-older',
			size: 1800000,
			acknowledged: false,
			files: [
				{
					id: 9031,
					path: '/alice/files/Finance/Q4 Budget - Copy.xlsx',
					size: 1800000,
					mtime: baseSec - 7200,
					origin: false,
				},
			],
		},
		{
			id: 904,
			hash: 'sha256-orphan-deck',
			size: 512000,
			acknowledged: false,
			files: [
				{
					id: 9041,
					path: '/bob/files/Legal/NDA (Alice\'s conflicted copy 2026-11-18).pdf',
					size: 512000,
					mtime: baseSec,
					origin: false,
				},
				{
					id: 9042,
					path: '/bob/files/Legal/NDA (SFConflict bob@acme.org 2026-11-19-09-12-00).pdf',
					size: 512000,
					mtime: baseSec - 500,
					origin: true,
				},
				{
					id: 9043,
					path: '/bob/files/Legal/NDA (1).pdf',
					size: 512000,
					mtime: baseSec - 900,
					locked: true,
				},
			],
		},
		{
			id: 905,
			hash: 'sha256-clean-only',
			size: 100000,
			acknowledged: false,
			files: [
				{
					id: 9051,
					path: '/alice/files/Notes/Roadmap (2025).md',
					size: 100000,
					mtime: baseSec,
				},
				{
					id: 9052,
					path: '/alice/files/Archive/Roadmap (2025).md',
					size: 100000,
					mtime: baseSec,
				},
			],
		},
	]
}

describe('Cycle 156: Sync-Conflict Storm & Cloud Import Fork Resolver', () => {
	test('parseConflictFork detects all major sync-conflict and cloud import fork patterns safely', () => {
		const mod = loadConflictStormModule()

		const nc = mod.parseConflictFork('Report (conflicted copy from laptop 2026-11-20 140312).pdf')
		assert.equal(nc.isConflictFork, true)
		assert.equal(nc.vendorId, 'nextcloud-desktop')
		assert.equal(nc.canonicalFilename, 'Report.pdf')
		assert.equal(nc.conflictDeviceOrActor, 'laptop')

		const st = mod.parseConflictFork('ledger.sync-conflict-20261120-140312-ABCDEF1.tar.gz')
		assert.equal(st.isConflictFork, true)
		assert.equal(st.vendorId, 'syncthing')
		assert.equal(st.canonicalFilename, 'ledger.tar.gz')
		assert.equal(st.conflictDeviceOrActor, 'ABCDEF1')

		const db = mod.parseConflictFork('Policy (Alice\'s conflicted copy 2026-11-20).docx')
		assert.equal(db.isConflictFork, true)
		assert.equal(db.vendorId, 'dropbox-seafile')
		assert.equal(db.canonicalFilename, 'Policy.docx')
		assert.equal(db.conflictDeviceOrActor, 'Alice')

		const sf = mod.parseConflictFork('Specs (SFConflict bob@corp.org 2026-11-20-14-03-12).md')
		assert.equal(sf.isConflictFork, true)
		assert.equal(sf.vendorId, 'dropbox-seafile')
		assert.equal(sf.canonicalFilename, 'Specs.md')

		const od = mod.parseConflictFork('Deck-DESKTOP-9Z4Q1.pptx')
		assert.equal(od.isConflictFork, true)
		assert.equal(od.vendorId, 'onedrive-host')
		assert.equal(od.canonicalFilename, 'Deck.pptx')
		assert.equal(od.conflictDeviceOrActor, 'DESKTOP-9Z4Q1')

		const num = mod.parseConflictFork('Invoice (2).pdf')
		assert.equal(num.isConflictFork, true)
		assert.equal(num.vendorId, 'numbered-import')
		assert.equal(num.canonicalFilename, 'Invoice.pdf')

		const cp = mod.parseConflictFork('Contract - Copie (2).pdf')
		assert.equal(cp.isConflictFork, true)
		assert.equal(cp.vendorId, 'copy-fork')
		assert.equal(cp.canonicalFilename, 'Contract.pdf')

		const stacked = mod.parseConflictFork('Report (1) (conflicted copy 2026-11-20).pdf')
		assert.equal(stacked.isConflictFork, true)
		assert.equal(stacked.canonicalFilename, 'Report.pdf')

		// Guard: years like (2025) and dotfiles must NOT be misclassified as conflict forks
		const yearFile = mod.parseConflictFork('Annual Report (2025).pdf')
		assert.equal(yearFile.isConflictFork, false)
		assert.equal(yearFile.vendorId, 'canonical')

		const dotFile = mod.parseConflictFork('.gitignore')
		assert.equal(dotFile.isConflictFork, false)
		assert.equal(dotFile.canonicalFilename, '.gitignore')
	})

	test('analyzeConflictStorms classifies exact clones, divergent edits, stale forks, protected forks, and orphan storms', () => {
		const mod = loadConflictStormModule()
		const sample = buildSampleConflictDuplicates()

		const sameFolder = mod.analyzeConflictStorms(sample, {
			presetId: 'safe-exact-clones',
		})

		// Roadmap (2025).md has no conflict forks so only Finance/Q4 Budget, Imports/Q4 Budget (1), and Legal/NDA should appear
		assert.equal(sameFolder.summary.totalLineagesCount, 3)

		const financeLineage = sameFolder.allLineages.find(l => l.canonicalDir === '/alice/files/Finance')
		assert.ok(financeLineage)
		assert.equal(financeLineage.survivor.filename, 'Q4 Budget.xlsx')
		assert.equal(financeLineage.exactCloneCount, 2)
		assert.equal(financeLineage.divergentCount, 1)
		assert.equal(financeLineage.staleForkCount, 1)
		assert.equal(financeLineage.reclaimableBytes, 2048000 * 2)

		const divMember = financeLineage.members.find(m => m.classification === 'divergent-active')
		assert.ok(divMember)
		assert.equal(divMember.canAutoReclaim, false)
		assert.equal(divMember.action, 'review-merge')

		const orphanLineage = sameFolder.allLineages.find(l => l.canonicalDir === '/bob/files/Legal')
		assert.ok(orphanLineage)
		assert.equal(orphanLineage.isOrphanStorm, true)
		assert.equal(orphanLineage.survivor.origin, true)
		assert.equal(orphanLineage.protectedCount, 1)

		// Cross-folder mode clusters /alice/files/Imports/OneDrive/Q4 Budget (1).xlsx into the same /alice Q4 Budget.xlsx lineage
		const crossFolder = mod.analyzeConflictStorms(sample, {
			presetId: 'cloud-import-sweep',
		})
		assert.equal(crossFolder.summary.totalLineagesCount, 2)
		const mergedBudget = crossFolder.allLineages.find(l => l.canonicalFilename === 'Q4 Budget.xlsx')
		assert.ok(mergedBudget)
		assert.equal(mergedBudget.exactCloneCount, 3)
		assert.equal(mergedBudget.staleForkCount, 1)
		// cloud-import-sweep sets includeStaleForks=true and quarantine mode
		assert.equal(mergedBudget.reclaimableBytes, (2048000 * 3) + 1800000)

		// Safe reclaim collector never selects survivors, divergent edits, or origin-protected copies
		const safeTargets = mod.collectSafeConflictReclaimTargets(sameFolder)
		assert.ok(safeTargets.length > 0)
		for (const target of safeTargets) {
			assert.equal(target.file.classification, 'exact-clone')
			assert.equal(target.file.origin, false)
		}
	})

	test('POSIX DRY_RUN=1 script, CWE-1236 CSV, and JSON export uphold all security invariants', () => {
		const mod = loadConflictStormModule()
		const sample = buildSampleConflictDuplicates()
		sample.push({
			id: 906,
			hash: 'sha256-formula-test',
			size: 4096,
			acknowledged: false,
			files: [
				{
					id: 9061,
					path: '/alice/files/Finance/=cmd|\'calc\'!A0.xlsx',
					size: 4096,
					mtime: 1795000100,
				},
				{
					id: 9062,
					path: '/alice/files/Finance/=cmd|\'calc\'!A0 (conflicted copy 2026-11-21).xlsx',
					size: 4096,
					mtime: 1795000300,
				},
			],
		})

		const analysis = mod.analyzeConflictStorms(sample, { presetId: 'safe-exact-clones' })
		const script = mod.buildConflictStormScript(analysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('set -euo pipefail'))
		assert.ok(script.includes('quarantine_fork'))
		assert.ok(script.includes('# [SKIP DIVERGENT - MERGE REQUIRED]'))
		assert.ok(script.includes('# [ORPHAN STORM]'))
		assert.ok(script.includes('files:scan --path='))
		assert.ok(script.includes("'/alice/files/Finance/=cmd|'\\''calc'\\''!A0 (conflicted copy 2026-11-21).xlsx'"))

		const csv = mod.buildConflictStormCsvReport(analysis)
		assert.ok(csv.includes('Lineage Canonical Filename'))
		assert.ok(csv.includes('"\'=cmd|'))

		const parsedJson = JSON.parse(mod.buildConflictStormJsonReport(analysis))
		assert.equal(parsedJson.schema, mod.CONFLICT_STORM_SCHEMA)
		assert.ok(Array.isArray(parsedJson.hotspots))
		assert.ok(parsedJson.lineages.length >= 2)
	})

	test('ConflictStormWorkbench.vue renders empty, filtered-empty, populated, unclamped numeric inputs, overrides, and XSS defense', async () => {
		const Workbench = loadConflictStormWorkbench({ writeText: async () => {} })

		const emptyVm = new Vue({
			render: h => h(Workbench, {
				props: { duplicates: [], allDuplicates: [] },
			}),
		}).$mount()
		await settle()
		assert.ok(emptyVm.$el.textContent.includes('Scan storage'))
		emptyVm.$destroy()

		const xssData = buildSampleConflictDuplicates()
		xssData[0].files[1].path = '/alice/files/Finance/<img src=x onerror=alert(1)>Q4 Budget (conflicted copy 2026-11-20).xlsx'

		const events = []
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: xssData,
					allDuplicates: xssData,
					currentDuplicateId: 901,
				},
				on: {
					'select-duplicate': item => events.push(['select', item.id]),
					'compare-duplicate': item => events.push(['compare', item.id]),
					close: () => events.push(['close']),
				},
			}),
		}).$mount()
		await settle()

		const cmp = vm.$children[0]
		assert.equal(vm.$el.querySelectorAll('img').length, 0, 'XSS payload must never create <img> DOM node')
		assert.ok(vm.$el.textContent.includes('DIVERGENT MERGE GUARD:'))

		// Unclamped numeric input mid-keystroke
		cmp.minForkCountInput = ''
		await settle()
		assert.equal(cmp.minForkCountInput, '')
		cmp.minForkCountInput = '2'
		await settle()
		assert.equal(cmp.parsedMinForkCount, 2)

		// Filtered-empty state with Reset filters button
		cmp.searchQueryInput = 'nonexistent-file-xyz'
		await settle()
		assert.ok(vm.$el.textContent.includes('No conflict lineages match your active filters'))
		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset filters'))
		assert.ok(resetBtn)
		resetBtn.click()
		await settle()
		assert.equal(cmp.searchQueryInput, '')

		// Lineage override
		const targetLineageId = cmp.analysis.lineages[0].lineageId
		cmp.setLineageOverride(targetLineageId, 'keep-all')
		await settle()
		const overriddenLineage = cmp.analysis.lineages.find(l => l.lineageId === targetLineageId)
		assert.ok(overriddenLineage)
		assert.equal(overriddenLineage.effectiveLineageMode, 'keep-all')

		// Emit inspect group
		const inspectBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Inspect group'))
		assert.ok(inspectBtn)
		inspectBtn.click()
		await settle()
		assert.equal(events[0][0], 'select')

		vm.$destroy()
	})

	test('App.vue wires & shortcut and ConflictStormWorkbench cleanly', async () => {
		window.localStorage.clear()
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
		const ConflictWorkbench = loadConflictStormWorkbench()

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
			'./components/SpaceReclamationTimeline.vue': { __esModule: true, default: stub('timeline') },
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
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: ConflictWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleConflictDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-conflict-storm-button')
		assert.ok(topbarBtn, 'Topbar Conflicts button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '&', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-conflict-storm-resolver')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.conflict-storm-workbench'), 'ConflictStormWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '&', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.conflict-storm-workbench'), null, 'ConflictStormWorkbench must toggle closed on & shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/conflictStormResolver.js',
			'src/components/ConflictStormWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/ConflictStormWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
