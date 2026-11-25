const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window } = require('./helpers.cjs')

function loadLegalDocOcrModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/legalDocumentOcrAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

function loadLegalDocOcrWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const legalDocOcrAuditor = loadLegalDocOcrModule()
	return loadComponent('src/components/LegalDocumentOcrWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/legalDocumentOcrAuditor': legalDocOcrAuditor,
	})
}

function buildSampleLegalDocDuplicates() {
	const kib = 1024
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9201,
			hash: 'sha256-msa-acme-signed',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 92011,
					path: '/__groupfolders/31/Executed/MSA_Acme_executed.pdf',
					size: 6 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 92012,
					path: '/legal/Signed/CertificateOfCompletion_MSA_Acme_signed.pdf',
					size: 6 * mib,
					mtime: refSec - 39 * 86400,
				},
				{
					id: 92013,
					path: '/alice/files/Downloads/MSA_Acme_export.pdf',
					size: 6 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
		{
			id: 9202,
			hash: 'sha256-deed-ocr-dual-scan',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 92021,
					path: '/legal/OCR-Archive/Deed_2026_ocr.pdf',
					size: 14 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 92022,
					path: '/legal/Scans/Deed_2026_scan.tiff',
					size: 14 * mib,
					mtime: refSec - 28 * 86400,
				},
				{
					id: 92023,
					path: '/alice/files/Scans/Deed_2026_raw.pdf',
					size: 14 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 9203,
			hash: 'sha256-nda-redline-fork',
			size: 3 * mib,
			acknowledged: false,
			files: [
				{
					id: 92031,
					path: '/Contracts/Negotiation/NDA_Orion_clean.docx',
					size: 3 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 92032,
					path: '/Contracts/Negotiation/NDA_Orion_redline.docx',
					size: 3 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 92033,
					path: '/alice/files/Downloads/Compare_NDA_Orion_v1.docx',
					size: 3 * mib,
					mtime: refSec - 35 * 86400,
				},
			],
		},
		{
			id: 9204,
			hash: 'sha256-contract-office-pdf-export',
			size: 5 * mib,
			acknowledged: false,
			files: [
				{
					id: 92041,
					path: '/Contracts/Service_Agreement.docx',
					size: 5 * mib,
					mtime: refSec - 8 * 86400,
				},
				{
					id: 92042,
					path: '/Exports/Service_Agreement.pdf',
					size: 5 * mib,
					mtime: refSec - 25 * 86400,
				},
			],
		},
		{
			id: 9205,
			hash: 'sha256-unverified-raw-scan-only',
			size: 9 * mib,
			acknowledged: false,
			files: [
				{
					id: 92051,
					path: '/legal/Scans/Orphan_Ledger_raw.pdf',
					size: 9 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 92052,
					path: '/bob/files/Scanner-Inbox/Orphan_Ledger.djvu',
					size: 9 * mib,
					mtime: refSec - 19 * 86400,
				},
			],
		},
		{
			id: 9206,
			hash: 'sha256-unrelated-photo-and-code',
			size: 256 * kib,
			acknowledged: false,
			files: [
				{ id: 92061, path: '/alice/files/Photos/summit.jpg', size: 256 * kib, mtime: refSec - 3 * 86400 },
				{ id: 92062, path: '/src/helpers/dateFormat.js', size: 256 * kib, mtime: refSec - 4 * 86400 },
			],
		},
	]
}

describe('Legal Contract, E-Signature, OCR Dual-Scan & Office-PDF Derivative Auditor', () => {
	test('classifies all 4 legal and OCR families while ignoring unrelated photos and source files', () => {
		const mod = loadLegalDocOcrModule()

		for (const p of [
			'/legal/Executed/MSA_Acme.pdf',
			'/legal/Signed/SOW_2026.pdf',
			'/contracts/Vendor_signed.pdf',
			'/contracts/Vendor_executed.pdf',
			'/docusign/CertificateOfCompletion_MSA.pdf',
			'/yousign/Agreement.pdf.p7m',
			'/adobesign/detached.p7s',
		]) {
			assert.equal(mod.classifyLegalDocumentArtifact(p).family, 'signed-executed-masters', `Expected signed-executed-masters for ${p}`)
		}

		for (const p of [
			'/archive/Deed_ocr.pdf',
			'/archive/Deed_searchable.pdf',
			'/Scans/Batch_01_scan.tiff',
			'/Scans/Batch_01_raw.pdf',
			'/Scans/Book_1998.djvu',
			'/Scans/Intake_Page.pdf',
		]) {
			assert.equal(mod.classifyLegalDocumentArtifact(p).family, 'ocr-text-dual-scans', `Expected ocr-text-dual-scans for ${p}`)
		}

		for (const p of [
			'/Contracts/Negotiation/MSA_redline.docx',
			'/Contracts/Negotiation/MSA_tracked.docx',
			'/Contracts/Negotiation/MSA_markup.pdf',
			'/Contracts/Negotiation/MSA_clean.docx',
			'/Contracts/Negotiation/Compare_MSA_v1.docx',
			'/Contracts/Negotiation/MSA_v2.docx',
		]) {
			assert.equal(mod.classifyLegalDocumentArtifact(p).family, 'draft-markup-forks', `Expected draft-markup-forks for ${p}`)
		}

		for (const p of [
			'/Contracts/Master_Contract.docx',
			'/Contracts/Master_Contract.odt',
			'/Contracts/Master_Contract.rtf',
			'/Exports/Master_Contract.pdf',
		]) {
			assert.equal(mod.classifyLegalDocumentArtifact(p).family, 'office-pdf-exports', `Expected office-pdf-exports for ${p}`)
		}

		assert.equal(mod.classifyLegalDocumentArtifact('/alice/files/Photos/summit.jpg'), null)
		assert.equal(mod.classifyLegalDocumentArtifact('/src/helpers/dateFormat.js'), null)

		const parsedSigned = mod.parseLegalDocumentArtifactInfo('MSA_Acme_signed.pdf', '/Executed/MSA_Acme_signed.pdf')
		assert.equal(parsedSigned.documentLineageStem, 'MSA_Acme')
		assert.ok(parsedSigned.artifactTags.includes('signed'))
		assert.ok(parsedSigned.artifactTags.includes('executed-vault'))
		assert.equal(parsedSigned.isSignedProofArtifact, true)

		const parsedRedline = mod.parseLegalDocumentArtifactInfo('Compare_NDA_Orion_v2.docx', '/Contracts/Negotiation/Compare_NDA_Orion_v2.docx')
		assert.equal(parsedRedline.documentLineageStem, 'NDA_Orion')
		assert.ok(parsedRedline.artifactTags.includes('compare'))
		assert.equal(parsedRedline.isDraftMarkupArtifact, true)
	})

	test('strictly shields Executed Legal Vault and Signed Masters while enforcing OCR verification before pruning raw scans', () => {
		const mod = loadLegalDocOcrModule()
		const analysis = mod.analyzeLegalDocumentOcrDuplicates(buildSampleLegalDocDuplicates(), {
			referenceTimeSec: 1796000000,
			staleDraftDays: 30,
		})

		assert.equal(analysis.schema, 'duplicatefinder.legal-document-ocr-auditor.v1')
		assert.equal(analysis.summary.totalClustersCount, 5)
		assert.equal(analysis.summary.familyCounts['signed-executed-masters'], 1)
		assert.equal(analysis.summary.familyCounts['ocr-text-dual-scans'], 2)
		assert.equal(analysis.summary.familyCounts['draft-markup-forks'], 1)
		assert.equal(analysis.summary.familyCounts['office-pdf-exports'], 1)

		const signedCluster = analysis.clusters.find(c => c.primaryGroupId === 9201)
		assert.ok(signedCluster)
		assert.equal(signedCluster.survivor.tier, 'executed-legal-vault')
		assert.equal(signedCluster.members.find(m => m.fileId === 92012).verdict, 'blocked-executed-vault')
		assert.equal(signedCluster.members.find(m => m.fileId === 92013).verdict, 'reclaim-redundant-copy')

		const ocrCluster = analysis.clusters.find(c => c.primaryGroupId === 9202)
		assert.ok(ocrCluster)
		assert.equal(ocrCluster.survivor.fileId, 92021)
		assert.equal(ocrCluster.members.find(m => m.fileId === 92022).verdict, 'reclaim-redundant-copy')

		const pruneOcrAnalysis = mod.analyzeLegalDocumentOcrDuplicates(buildSampleLegalDocDuplicates(), {
			familyFilter: 'ocr-text-dual-scans',
			strategy: 'prune-raw-scan-when-ocr-verified',
			survivorRule: 'ocr-verified-first',
			referenceTimeSec: 1796000000,
		})
		const verifiedOcrCluster = pruneOcrAnalysis.clusters.find(c => c.primaryGroupId === 9202)
		assert.equal(verifiedOcrCluster.members.find(m => m.fileId === 92022).verdict, 'reclaim-raw-scan')
		assert.equal(verifiedOcrCluster.members.find(m => m.fileId === 92023).verdict, 'reclaim-raw-scan')

		const unverifiedScanCluster = pruneOcrAnalysis.clusters.find(c => c.primaryGroupId === 9205)
		assert.ok(unverifiedScanCluster)
		assert.equal(unverifiedScanCluster.clusterRiskState, 'unverified-scan')
		assert.equal(unverifiedScanCluster.members.find(m => m.fileId === 92052).verdict, 'blocked-no-ocr-verification')
	})

	test('supports hardlink strategy, operator overrides, DRY_RUN=1 POSIX script, .sync-exclude.lst, CWE-1236 CSV, and JSON manifest', () => {
		const mod = loadLegalDocOcrModule()
		const duplicates = [
			...buildSampleLegalDocDuplicates(),
			{
				id: 9299,
				hash: 'sha256-formula-contract',
				size: 204800,
				acknowledged: false,
				files: [
					{ id: 92991, path: '/Contracts/=CMD("calc").docx', size: 204800, mtime: 1795000000 },
					{ id: 92992, path: '/Exports/+malicious.pdf', size: 204800, mtime: 1790000000 },
				],
			},
		]

		const hardlinkAnalysis = mod.analyzeLegalDocumentOcrDuplicates(duplicates, {
			familyFilter: 'office-pdf-exports',
			strategy: 'hardlink-office-pdf-derivatives',
			survivorRule: 'editable-office-first',
			referenceTimeSec: 1796000000,
		})
		assert.equal(hardlinkAnalysis.clusters.length, 2)
		const serviceCluster = hardlinkAnalysis.clusters.find(c => c.primaryGroupId === 9204)
		assert.equal(serviceCluster.survivor.fileId, 92041)
		const pdfTarget = serviceCluster.members.find(m => m.fileId === 92042)
		assert.equal(pdfTarget.verdict, 'hardlink-office-derivative')
		assert.equal(pdfTarget.actionKind, 'hardlink')

		const script = mod.buildLegalDocumentOcrScript(hardlinkAnalysis, { dataRoot: '/srv/nc/data' })
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('sha256sum --'))
		assert.ok(script.includes('stat -c %d'))
		assert.ok(script.includes('ln -f --'))
		assert.ok(script.includes('hardlink_legal_doc_copy'))
		assert.ok(script.includes('occ files:scan --path='))

		const overrideAnalysis = mod.analyzeLegalDocumentOcrDuplicates(buildSampleLegalDocDuplicates(), {
			memberOverrides: {
				92032: 'force-keep',
				92033: 'exclude',
			},
			referenceTimeSec: 1796000000,
		})
		const overriddenRedline = overrideAnalysis.clusters.find(c => c.primaryGroupId === 9203)
		assert.equal(overriddenRedline.members.find(m => m.fileId === 92032).verdict, 'blocked-manual-shield')
		assert.equal(overriddenRedline.members.find(m => m.fileId === 92033).verdict, 'excluded')

		const syncExclude = mod.buildLegalDocumentSyncExcludeSnippet(hardlinkAnalysis)
		for (const pattern of ['~$*.docx', '.~lock.*', '*.tmp']) {
			assert.ok(syncExclude.includes(pattern), `Expected .sync-exclude.lst pattern ${pattern}`)
		}

		const fullAnalysis = mod.analyzeLegalDocumentOcrDuplicates(duplicates, { referenceTimeSec: 1796000000 })
		const csv = mod.buildLegalDocumentOcrCsvReport(fullAnalysis)
		assert.ok(csv.includes('"\'=CMD(""calc"").docx"') || csv.includes("'=CMD"))
		assert.ok(csv.includes("'+malicious"))

		const json = JSON.parse(mod.buildLegalDocumentOcrJsonReport(fullAnalysis, '2026-11-24T06:15:00Z'))
		assert.equal(json.schema, 'duplicatefinder.legal-document-ocr-auditor.v1')
		assert.equal(json.generatedAt, '2026-11-24T06:15:00Z')
		assert.ok(Array.isArray(json.clusters))
	})

	test('renders LegalDocumentOcrWorkbench empty, filter-empty, populated, and interactive states', async () => {
		let copied = ''
		const Workbench = loadLegalDocOcrWorkbench({
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
		assert.ok(emptyVm.$el.querySelector('.ldow__empty-banner'))
		emptyVm.$destroy()

		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleLegalDocDuplicates(),
					allDuplicates: buildSampleLegalDocDuplicates(),
					currentDuplicateId: 9204,
				},
			}),
		}).$mount()
		await settle()

		assert.equal(vm.$el.querySelectorAll('.ldow__cluster-item').length, 5)
		assert.ok(vm.$el.textContent.includes('Service_Agreement.docx'))

		const numInputs = vm.$el.querySelectorAll('.ldow__num-input')
		assert.equal(numInputs.length, 2)
		numInputs[0].value = ''
		numInputs[0].dispatchEvent(new window.Event('input'))
		await settle()
		assert.equal(numInputs[0].value, '', 'Numeric input must not clamp or reset mid-keystroke')

		const copyBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
		copyBtn.click()
		await settle()
		assert.ok(copied.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(vm.$el.querySelector('.ldow__notice.is-success'))

		const searchInput = vm.$el.querySelector('input[type="search"]')
		searchInput.value = 'no-such-legal-contract-xyz'
		searchInput.dispatchEvent(new window.Event('input'))
		await settle()
		assert.ok(vm.$el.querySelector('.ldow__empty-banner'))

		const resetBtn = Array.from(vm.$el.querySelectorAll('button')).find(b => b.textContent.includes('Reset Filters'))
		resetBtn.click()
		await settle()
		assert.equal(vm.$el.querySelectorAll('.ldow__cluster-item').length, 5)

		vm.$destroy()
	})

	test('integrates Docs & OCR button and ( keyboard shortcut in App.vue', async () => {
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
		const LegalWorkbench = loadLegalDocOcrWorkbench({ writeText: async () => {} })

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
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: LegalWorkbench },
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
					entities: status === 'acknowledged' ? [] : buildSampleLegalDocDuplicates(),
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

		const topbarBtn = vm.$el.querySelector('.topbar-legal-document-ocr-button')
		assert.ok(topbarBtn, 'Topbar Docs & OCR button must exist')

		const action = keyboardShortcuts.resolveShortcutAction({ key: '(', shiftKey: true, target: vm.$el })
		assert.equal(action, 'toggle-legal-document-ocr-auditor')

		topbarBtn.click()
		await settle()
		assert.ok(vm.$el.querySelector('.legal-doc-ocr-workbench'), 'LegalDocumentOcrWorkbench must mount on click')

		window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '(', shiftKey: true, bubbles: true }))
		await settle()
		assert.equal(vm.$el.querySelector('.legal-doc-ocr-workbench'), null, 'LegalDocumentOcrWorkbench must toggle closed on ( shortcut')

		vm.$destroy()
	})

	test('keeps zero U+2013/U+2014 typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/legalDocumentOcrAuditor.js',
			'src/components/LegalDocumentOcrWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
			'src/App.vue',
		]
		for (const relPath of files) {
			const content = readFileSync(resolve(__dirname, '../..', relPath), 'utf8')
			assert.equal(content.includes('\u2013'), false, `Unexpected U+2013 in ${relPath}`)
			assert.equal(content.includes('\u2014'), false, `Unexpected U+2014 in ${relPath}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `Unexpected XSS sink in ${relPath}`)
		}
		const vueContent = readFileSync(resolve(__dirname, '../..', 'src/components/LegalDocumentOcrWorkbench.vue'), 'utf8')
		assert.ok(vueContent.includes('min-block-size: 44px'))
		assert.ok(vueContent.includes(':focus-visible'))
	})
})
