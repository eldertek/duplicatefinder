const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Legal, Compliance & Signed Contract Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadLegalContractModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/legalContractVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load LegalContractVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadLegalContractWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const legalContractVaultAuditor = loadLegalContractModule()
	return loadComponent('src/components/LegalContractVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/legalContractVaultAuditor': legalContractVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Legal, Compliance & Signed Contract Vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleLegalDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796700000
	return [
		{
			id: 9991,
			hash: 'sha256-countersigned-docusign-msa',
			size: 24 * mib,
			acknowledged: false,
			files: [
				{
					id: 99911,
					path: '/legal-vault/Contracts/AcmeCorp/MSA-2026-042_countersigned_docusign.pdf',
					size: 24 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99912,
					path: '/canonical/Contracts/AcmeCorp/MSA-2026-042_countersigned_docusign.pdf',
					size: 24 * mib,
					mtime: refSec - 2 * 86400,
				},
				{
					id: 99913,
					path: '/alice/files/Downloads/AcmeCorp/MSA-2026-042_countersigned_docusign.pdf',
					size: 24 * mib,
					mtime: refSec - 1 * 86400,
				},
			],
		},
		{
			id: 9992,
			hash: 'sha256-pades-detached-signature',
			size: 6 * mib,
			acknowledged: false,
			files: [
				{
					id: 99921,
					path: '/legal-vault/Contracts/HeliosBank/DPA-2026-118_yousign.pdf.p7s',
					size: 6 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 99922,
					path: '/masters/Contracts/HeliosBank/DPA-2026-118_yousign.pdf.p7s',
					size: 6 * mib,
					mtime: refSec - 4 * 86400,
				},
			],
		},
		{
			id: 9993,
			hash: 'sha256-legal-hold-preservation-pdf',
			size: 48 * mib,
			acknowledged: false,
			files: [
				{
					id: 99931,
					path: '/legal-hold/Matters/NordicLogistics/CTR-2025-901_signed_executed.pdf',
					size: 48 * mib,
					mtime: refSec - 10 * 86400,
				},
				{
					id: 99932,
					path: '/litigation-hold/Matters/NordicLogistics/CTR-2025-901_signed_executed.pdf',
					size: 48 * mib,
					mtime: refSec - 10 * 86400,
				},
			],
		},
		{
			id: 9994,
			hash: 'sha256-redline-docx-draft-revision',
			size: 32 * mib,
			acknowledged: false,
			files: [
				{
					id: 99941,
					path: '/legal-vault/Contracts/AcmeCorp/MSA-2026-042_v3_redline_trackchanges.docx',
					size: 32 * mib,
					mtime: refSec - 28 * 86400,
				},
				{
					id: 99942,
					path: '/legal-vault/Drafts/AcmeCorp/MSA-2026-042_v3_redline_trackchanges.docx',
					size: 32 * mib,
					mtime: refSec - 29 * 86400,
				},
				{
					id: 99943,
					path: '/Downloads/AcmeCorp/MSA-2026-042_v3_redline_trackchanges.docx',
					size: 32 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 9995,
			hash: 'sha256-compliance-kyc-audit-pack',
			size: 180 * mib,
			acknowledged: false,
			files: [
				{
					id: 99951,
					path: '/compliance-vault/Matters/VortexCloud/NDA-2026-019_kyc_kbis_audit_pack.zip',
					size: 180 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99952,
					path: '/Downloads/VortexCloud/NDA-2026-019_kyc_kbis_audit_pack.zip',
					size: 180 * mib,
					mtime: refSec - 21 * 86400,
				},
			],
		},
		{
			id: 9996,
			hash: 'sha256-duplicate-scanned-exhibit',
			size: 56 * mib,
			acknowledged: false,
			files: [
				{
					id: 99961,
					path: '/legal-vault/Contracts/AcmeCorp/Exhibits/scan_exhibit_B_MSA-2026-042.pdf',
					size: 56 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 99962,
					path: '/Downloads/AcmeCorp/Exhibits/scan_exhibit_B_MSA-2026-042.pdf',
					size: 56 * mib,
					mtime: refSec - 19 * 86400,
				},
			],
		},
		{
			id: 9997,
			hash: 'sha256-formula-injection-kyc-scan',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 99971,
					path: '=cmd|calc/compliance-vault/Matters/OrionSA/kbis_rib_attestation.pdf',
					size: 14 * mib,
					mtime: refSec - 15 * 86400,
				},
				{
					id: 99972,
					path: '=cmd|calc/Downloads/OrionSA/kbis_rib_attestation.pdf',
					size: 14 * mib,
					mtime: refSec - 16 * 86400,
				},
			],
		},
	]
}

describe('Cycle 182: Legal, Compliance & Signed Contract Vault Auditor', () => {
	test('classifies all 4 legal/compliance families and extracts counterparty/matter + contract ID + execution state', () => {
		const mod = loadLegalContractModule()

		const signedPdf = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/AcmeCorp/MSA-2026-042_countersigned_docusign.pdf',
		})
		assert.equal(signedPdf.family, 'executed-signed-contracts')
		assert.equal(signedPdf.counterpartyMatter, 'acmecorp')
		assert.equal(signedPdf.contractId, 'MSA-2026-042')
		assert.equal(signedPdf.executionState, 'countersigned')
		assert.equal(signedPdf.isCountersignedOriginal, true)
		assert.equal(signedPdf.legalTool, 'DocuSign eSignature')

		const p7s = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/HeliosBank/DPA-2026-118_yousign.pdf.p7s',
		})
		assert.equal(p7s.family, 'executed-signed-contracts')
		assert.equal(p7s.contractId, 'DPA-2026-118')
		assert.equal(p7s.executionState, 'countersigned-pades')
		assert.equal(p7s.isPadesVerified, true)

		const legalHold = mod.classifyLegalContractFile({
			path: '/legal-hold/Matters/NordicLogistics/CTR-2025-901_signed_executed.pdf',
		})
		assert.equal(legalHold.family, 'executed-signed-contracts')
		assert.equal(legalHold.executionState, 'legal-hold')
		assert.equal(legalHold.isLegalHold, true)

		const redlineDocx = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/AcmeCorp/MSA-2026-042_v3_redline_trackchanges.docx',
		})
		assert.equal(redlineDocx.family, 'redline-draft-revisions')
		assert.equal(redlineDocx.executionState, 'redline-draft')
		assert.equal(redlineDocx.revisionNumber, 3)

		const cleanOdt = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/AcmeCorp/SLA-2026-007_clean.odt',
		})
		assert.equal(cleanOdt.family, 'redline-draft-revisions')
		assert.equal(cleanOdt.executionState, 'clean-draft')

		const auditZip = mod.classifyLegalContractFile({
			path: '/compliance-vault/Matters/VortexCloud/NDA-2026-019_kyc_kbis_audit_pack.zip',
		})
		assert.equal(auditZip.family, 'compliance-evidence-bundles')
		assert.equal(auditZip.executionState, 'evidence-pack')

		const kycScan = mod.classifyLegalContractFile({
			path: '/compliance-vault/Matters/OrionSA/kbis_rib_attestation.pdf',
		})
		assert.equal(kycScan.family, 'compliance-evidence-bundles')

		const scanExhibit = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/AcmeCorp/Exhibits/scan_exhibit_B_MSA-2026-042.pdf',
		})
		assert.equal(scanExhibit.family, 'scanned-exhibit-attachments')
		assert.equal(scanExhibit.executionState, 'scanned-exhibit')

		const imgScan = mod.classifyLegalContractFile({
			path: '/legal-vault/Contracts/AcmeCorp/Exhibits/IMG_0421_annexe.jpg',
		})
		assert.equal(imgScan.family, 'scanned-exhibit-attachments')

		const unrelated = mod.classifyLegalContractFile({ path: '/Photos/holiday_beach_2026.jpg' })
		assert.equal(unrelated, null)
	})

	test('shields countersigned, legal-hold, and PAdES-verified originals by default while reclaiming staging and stale drafts', () => {
		const mod = loadLegalContractModule()
		const report = mod.analyzeLegalContractVault(buildSampleLegalDuplicates())

		assert.equal(report.schema, mod.LEGAL_CONTRACT_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 7)
		assert.equal(report.summary.totalCountersignedClusters, 3)
		assert.equal(report.summary.totalLegalHoldPadesClusters, 2)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// Countersigned DocuSign MSA: both vault copies shielded, only Downloads copy reclaimed
		const msaCluster = report.clusters.find(c => c.primaryGroupId === 9991)
		assert.ok(msaCluster)
		const vaultMsa = msaCluster.members.filter(m => m.meta.isCountersignedOriginal)
		const dlMsa = msaCluster.members.find(m => m.path.includes('/Downloads/'))
		assert.equal(vaultMsa.length, 2)
		assert.equal(vaultMsa[0].verdict, 'keep-canonical-survivor')
		assert.equal(vaultMsa[1].verdict, 'blocked-countersigned-original')
		assert.equal(vaultMsa[1].actionType, 'keep')
		assert.equal(dlMsa.actionType, 'prune')

		// PAdES .p7s detached signature: both vault copies shielded by default
		const p7sCluster = report.clusters.find(c => c.primaryGroupId === 9992)
		assert.ok(p7sCluster)
		assert.equal(p7sCluster.reclaimableCopiesCount, 0)
		assert.equal(p7sCluster.riskState, 'pades-protected')
		assert.equal(p7sCluster.members[1].verdict, 'blocked-pades-verified')

		// Legal Hold cluster: locked and immutable
		const holdCluster = report.clusters.find(c => c.primaryGroupId === 9993)
		assert.ok(holdCluster)
		assert.equal(holdCluster.hasLegalHold, true)
		assert.equal(holdCluster.reclaimableCopiesCount, 0)
		assert.equal(holdCluster.riskState, 'legal-hold-locked')
		assert.equal(holdCluster.members[1].verdict, 'blocked-legal-hold')

		// Stale redline .docx drafts are reclaimable
		const redlineCluster = report.clusters.find(c => c.primaryGroupId === 9994)
		assert.ok(redlineCluster)
		assert.equal(redlineCluster.reclaimableCopiesCount, 2)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadLegalContractModule()
		const analysis = mod.analyzeLegalContractVault(buildSampleLegalDuplicates(), {
			strategy: 'consolidate-contract-vault-hardlinks',
		})

		// Legal Hold stays strictly shielded even under hardlink consolidation
		const holdCluster = analysis.clusters.find(c => c.primaryGroupId === 9993)
		assert.equal(holdCluster.reclaimableCopiesCount, 0)

		const script = mod.buildLegalContractRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildLegalContractCsvReport(analysis)
		assert.ok(csv.includes('CounterpartyMatter,ContractId,ExecutionState,LegalTool'))
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote (CWE-1236)')

		const jsonStr = mod.buildLegalContractJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.LEGAL_CONTRACT_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 7)

		const syncExclude = mod.buildLegalContractSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('~$*.docx'))
		assert.ok(syncExclude.includes('.~lock.*.odt#'))
		assert.ok(syncExclude.includes('*_redline_tmp.*'))
	})

	test('LegalContractVaultWorkbench.vue renders clusters, applies presets, toggles guards, and copies script', async () => {
		const copied = []
		const Workbench = loadLegalContractWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleLegalDuplicates(),
					allDuplicates: buildSampleLegalDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('legal-contract-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.lcv__cluster-card').length, 7)

			// Apply Redlines & Scanned Exhibits preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.lcv__seg-btn'))
			const redlinePreset = presetBtns.find(b => b.textContent.includes('Prune Redlines & Scanned Exhibits'))
			assert.ok(redlinePreset)
			redlinePreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.lcv__cluster-card').length, 1)

			// Reset to All Legal & Contract Audit
			const allPreset = presetBtns.find(b => b.textContent.includes('All Legal & Contract Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.lcv__cluster-card').length, 7)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.lcv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires LegalContractVaultWorkbench with F9 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const LegalContractVaultWorkbench = loadLegalContractWorkbench()

		const slotBox = tag => ({
			render(h) {
				return h(tag, this.$slots.default)
			},
		})
		const icon = slotBox('span')
		const stub = name => ({
			name,
			props: ['duplicate', 'projectId', 'show', 'isScanning'],
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
			'./components/LinkDeduplicationSimulator.vue': { __esModule: true, default: stub('link') },
			'./components/FolderPairMatrix.vue': { __esModule: true, default: stub('matrix') },
			'./components/StorageFootprintAnalyzer.vue': { __esModule: true, default: stub('footprint') },
			'./components/PhotoBurstTimeline.vue': { __esModule: true, default: stub('burst') },
			'./components/RecoverySafetyWorkbench.vue': { __esModule: true, default: stub('recovery') },
			'./components/ArchivePayloadInspector.vue': { __esModule: true, default: stub('archive') },
			'./components/AudioTagWorkbench.vue': { __esModule: true, default: stub('audio') },
			'./components/VideoSceneWorkbench.vue': { __esModule: true, default: stub('video') },
			'./components/SidecarSweepWorkbench.vue': { __esModule: true, default: stub('sidecar') },
			'./components/RuleProfilesWorkbench.vue': { __esModule: true, default: stub('rules') },
			'./components/DocumentLineageWorkbench.vue': { __esModule: true, default: stub('doc') },
			'./components/PhotoPerceptualWorkbench.vue': { __esModule: true, default: stub('photo') },
			'./components/BrokenMediaQuarantineWorkbench.vue': { __esModule: true, default: stub('broken') },
			'./components/RetentionAgeWorkbench.vue': { __esModule: true, default: stub('retention') },
			'./components/FilenameCollisionWorkbench.vue': { __esModule: true, default: stub('collision') },
			'./components/QuotaAttributionWorkbench.vue': { __esModule: true, default: stub('quota') },
			'./components/PreviewCacheWorkbench.vue': { __esModule: true, default: stub('preview') },
			'./components/ShareMountAuditorWorkbench.vue': { __esModule: true, default: stub('share') },
			'./components/BackupDriftWorkbench.vue': { __esModule: true, default: stub('backup') },
			'./components/AutomationRulebookWorkbench.vue': { __esModule: true, default: stub('auto') },
			'./components/MetadataConsolidationWorkbench.vue': { __esModule: true, default: stub('meta') },
			'./components/ForensicVerifierWorkbench.vue': { __esModule: true, default: stub('forensic') },
			'./components/InodeSafetyWorkbench.vue': { __esModule: true, default: stub('inode') },
			'./components/ShadowReclaimWorkbench.vue': { __esModule: true, default: stub('shadow') },
			'./components/JunkPairInspectorWorkbench.vue': { __esModule: true, default: stub('junk') },
			'./components/MediaFidelityWorkbench.vue': { __esModule: true, default: stub('fidelity') },
			'./components/CdcChunkingWorkbench.vue': { __esModule: true, default: stub('cdc') },
			'./components/OpsScheduleWorkbench.vue': { __esModule: true, default: stub('ops') },
			'./components/LegalHoldWorkbench.vue': { __esModule: true, default: stub('legal') },
			'./components/RansomwareCanaryWorkbench.vue': { __esModule: true, default: stub('canary') },
			'./components/DevTreeReclaimerWorkbench.vue': { __esModule: true, default: stub('devtree') },
			'./components/ConflictStormWorkbench.vue': { __esModule: true, default: stub('conflict') },
			'./components/VmCowReflinkWorkbench.vue': { __esModule: true, default: stub('vmcow') },
			'./components/ScientificBundleWorkbench.vue': { __esModule: true, default: stub('sci') },
			'./components/BrandKitAuditorWorkbench.vue': { __esModule: true, default: stub('brand') },
			'./components/LogTelemetryWorkbench.vue': { __esModule: true, default: stub('log') },
			'./components/InstallerRepoWorkbench.vue': { __esModule: true, default: stub('installer') },
			'./components/WorkbookDriftWorkbench.vue': { __esModule: true, default: stub('workbook') },
			'./components/MailboxArchiveWorkbench.vue': { __esModule: true, default: stub('mailbox') },
			'./components/CadVaultWorkbench.vue': { __esModule: true, default: stub('cad') },
			'./components/WebBuildMediaWorkbench.vue': { __esModule: true, default: stub('webbuild') },
			'./components/LegalDocumentOcrWorkbench.vue': { __esModule: true, default: stub('legalocr') },
			'./components/BackupTakeoutWorkbench.vue': { __esModule: true, default: stub('takeout') },
			'./components/DawAudioStemWorkbench.vue': { __esModule: true, default: stub('daw') },
			'./components/VfxRenderCacheWorkbench.vue': { __esModule: true, default: stub('vfx') },
			'./components/ElearningScormWorkbench.vue': { __esModule: true, default: stub('scorm') },
			'./components/PhotoRawCatalogWorkbench.vue': { __esModule: true, default: stub('photoraw') },
			'./components/VmContainerImageWorkbench.vue': { __esModule: true, default: stub('vmcontainer') },
			'./components/MlDatasetArtifactWorkbench.vue': { __esModule: true, default: stub('mldataset') },
			'./components/Game3dAssetVaultWorkbench.vue': { __esModule: true, default: stub('game3d') },
			'./components/DatabaseDumpLogWorkbench.vue': { __esModule: true, default: stub('dblog') },
			'./components/DesignPublishingVaultWorkbench.vue': { __esModule: true, default: stub('designpub') },
			'./components/ReleaseBinaryArtifactWorkbench.vue': { __esModule: true, default: stub('release-binary-artifact-auditor') },
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: stub('email-archive-vault-auditor') },
			'./components/AudioDawVaultWorkbench.vue': { __esModule: true, default: stub('audio-daw-vault-auditor') },
			'./components/GisMapArchiveWorkbench.vue': { __esModule: true, default: stub('gis-map-archive-auditor') },
			'./components/ScientificResearchVaultWorkbench.vue': { __esModule: true, default: stub('scientific-research-vault-auditor') },
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: LegalContractVaultWorkbench },
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
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleLegalDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 7, hasMore: false },
				}),
				fetchProjects: async () => [],
			},
			'@/tools/utils': utils,
			'@/tools/keyboardShortcuts': keyboardShortcuts,
			'@/tools/reclamationHistory': loadModule('src/tools/reclamationHistory.js', {
				'./duplicateFilters': loadModule('src/tools/duplicateFilters.js'),
				'./duplicateStats': statsModule,
			}),
			'vue-material-design-icons/Folder': icon,
			'vue-material-design-icons/FolderRemove': icon,
			'vue-material-design-icons/FolderMultiple': icon,
			'vue-material-design-icons/Delete': icon,
			'vue-material-design-icons/FilterOutline': icon,
		})

		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue(App).$mount(mountNode)
		try {
			await settle()

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F9', shiftKey: false }), 'toggle-legal-contract-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F9', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F9', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-legal-contract-vault-button')
			assert.ok(btn, 'Legal & Contracts button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F9')
			assert.equal(vm.$el.querySelector('.legal-contract-vault-workbench'), null)

			// F9 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.legal-contract-vault-workbench'), 'LegalContractVaultWorkbench must open on F9 shortcut')

			// F9 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.legal-contract-vault-workbench'), null, 'LegalContractVaultWorkbench must toggle closed on F9 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Legal Contract Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/legalContractVaultAuditor.js',
			'src/components/LegalContractVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
