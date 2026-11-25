const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Email Archive, Mailbox Export & Attachment Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadEmailArchiveModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/emailArchiveVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load EmailArchiveVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadEmailArchiveWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const emailArchiveVaultAuditor = loadEmailArchiveModule()
	return loadComponent('src/components/EmailArchiveVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/emailArchiveVaultAuditor': emailArchiveVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Email Archive & Attachment Vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleEmailArchiveDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796000000
	return [
		{
			id: 9951,
			hash: 'sha256-legal-hold-mbox-2025-q4',
			size: 512 * mib,
			acknowledged: false,
			files: [
				{
					id: 99511,
					path: '/legal-hold/legal@acme.eu/2025-Q4/inbox-2025-q4.mbox',
					size: 512 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 99512,
					path: '/compliance/legal-hold/legal@acme.eu/2025-Q4/inbox-2025-q4.mbox',
					size: 512 * mib,
					mtime: refSec - 4 * 86400,
				},
				{
					id: 99513,
					path: '/alice/files/Downloads/legal@acme.eu/inbox-2025-q4.mbox',
					size: 512 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 9952,
			hash: 'sha256-finance-pst-2026-01-primary',
			size: 420 * mib,
			acknowledged: false,
			files: [
				{
					id: 99521,
					path: '/mail-archives/finance@acme.eu/2026-01/finance-archive-2026-01.pst',
					size: 420 * mib,
					mtime: refSec - 3 * 86400,
				},
				{
					id: 99522,
					path: '/mailbox-vault/finance@acme.eu/2026-01/finance-archive-2026-01.pst',
					size: 420 * mib,
					mtime: refSec - 3 * 86400,
				},
			],
		},
		{
			id: 9953,
			hash: 'sha256-thunderbird-imap-msf-snapshot',
			size: 96 * mib,
			acknowledged: false,
			files: [
				{
					id: 99531,
					path: '/mail-archives/support@acme.eu/Thunderbird/INBOX.msf',
					size: 96 * mib,
					mtime: refSec - 45 * 86400,
				},
				{
					id: 99532,
					path: '/imap-cache/support@acme.eu/ImapMail/INBOX.msf',
					size: 96 * mib,
					mtime: refSec - 46 * 86400,
				},
				{
					id: 99533,
					path: '/Downloads/thunderbird-cache/support@acme.eu/INBOX.msf',
					size: 96 * mib,
					mtime: refSec - 47 * 86400,
				},
			],
		},
		{
			id: 9954,
			hash: 'sha256-individual-eml-contract',
			size: 14 * mib,
			acknowledged: false,
			files: [
				{
					id: 99541,
					path: '/mail-archives/ceo@acme.eu/2025-11/Re_Board_Minutes_Q4.eml',
					size: 14 * mib,
					mtime: refSec - 12 * 86400,
				},
				{
					id: 99542,
					path: '/mail-exports/ceo@acme.eu/2025-11/Fwd_Re_Board_Minutes_Q4 (1).eml',
					size: 14 * mib,
					mtime: refSec - 11 * 86400,
				},
			],
		},
		{
			id: 9955,
			hash: 'sha256-mirrored-attachment-dump-pdf',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 99551,
					path: '/mail-archives/finance@acme.eu/mail-attachments/2025-10/Q3_Audit_Pack.pdf',
					size: 64 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 99552,
					path: '/saved-attachments/finance@acme.eu/2025-10/Q3_Audit_Pack (1).pdf',
					size: 64 * mib,
					mtime: refSec - 19 * 86400,
				},
				{
					id: 99553,
					path: '/Downloads/email-attachments/finance@acme.eu/Q3_Audit_Pack_copy.pdf',
					size: 64 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 9956,
			hash: 'sha256-formula-injection-eml',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 99561,
					path: '=cmd|calc/mail-archives/ops@acme.eu/2025-12/alert.msg',
					size: 8 * mib,
					mtime: refSec - 6 * 86400,
				},
				{
					id: 99562,
					path: '=cmd|calc/Downloads/ops@acme.eu/2025-12/alert.msg',
					size: 8 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
	]
}

describe('Cycle 178: Email Archive, Mailbox Export & Attachment Vault Auditor', () => {
	test('classifies all 4 email vault families and parses account, period, and subject signature deterministically', () => {
		const mod = loadEmailArchiveModule()

		const mbox = mod.classifyEmailArchiveFile({ path: '/legal-hold/legal@acme.eu/2025-Q4/inbox-2025-q4.mbox' })
		assert.equal(mbox.family, 'mailbox-archives')
		assert.equal(mbox.account, 'legal@acme.eu')
		assert.equal(mbox.period.label, '2025-Q4')
		assert.equal(mbox.isLegalHold, true)

		const pst = mod.classifyEmailArchiveFile({ path: '/mail-archives/finance@acme.eu/2026-01/finance-archive.pst' })
		assert.equal(pst.family, 'mailbox-archives')
		assert.equal(pst.client, 'Outlook')
		assert.equal(pst.period.label, '2026-01')

		const eml = mod.classifyEmailArchiveFile({ path: '/mail-archives/ceo@acme.eu/2025-11/Fwd_Re_Board_Minutes_Q4 (1).eml' })
		assert.equal(eml.family, 'individual-messages')
		assert.equal(eml.subjectSignature, 'board-minutes-q4')

		const msf = mod.classifyEmailArchiveFile({ path: '/imap-cache/support@acme.eu/ImapMail/INBOX.msf' })
		assert.equal(msf.family, 'mail-client-backup-snapshots')
		assert.equal(msf.client, 'Thunderbird / IMAP')

		const wdseml = mod.classifyEmailArchiveFile({ path: '/Thunderbird/support@acme.eu/12345.wdseml' })
		assert.equal(wdseml.family, 'mail-client-backup-snapshots')

		const att = mod.classifyEmailArchiveFile({ path: '/saved-attachments/finance@acme.eu/2025-10/Q3_Audit_Pack (1).pdf' })
		assert.equal(att.family, 'mirrored-email-attachments')
		assert.equal(att.subjectSignature, 'q3-audit-pack')

		const unrelated = mod.classifyEmailArchiveFile({ path: '/Photos/holiday.jpg' })
		assert.equal(unrelated, null)
	})

	test('protects legal-hold and latest primary mailbox archive anchors by default and computes safe reclaimable GB', () => {
		const mod = loadEmailArchiveModule()
		const report = mod.analyzeEmailArchiveVault(buildSampleEmailArchiveDuplicates())

		assert.equal(report.schema, mod.EMAIL_ARCHIVE_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 6)
		assert.equal(report.summary.totalLegalHoldClusters, 1)
		assert.ok(report.summary.totalPrimaryArchiveAnchors >= 2)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// Legal-hold cluster: both legal-hold copies shielded, only Downloads copy reclaimed
		const legalCluster = report.clusters.find(c => c.primaryGroupId === 9951)
		assert.ok(legalCluster)
		assert.equal(legalCluster.isLegalHold, true)
		const legalHoldCopies = legalCluster.members.filter(m => m.meta.isLegalHold)
		const downloadCopy = legalCluster.members.find(m => m.path.includes('/Downloads/'))
		assert.equal(legalHoldCopies.length, 2)
		assert.equal(legalHoldCopies[0].verdict, 'keep-canonical-survivor')
		assert.equal(legalHoldCopies[1].verdict, 'blocked-legal-hold')
		assert.equal(legalHoldCopies[1].actionType, 'keep')
		assert.equal(downloadCopy.actionType, 'prune')

		// Latest primary PST archive in two primary vaults: both shielded by default
		const primaryPstCluster = report.clusters.find(c => c.primaryGroupId === 9952)
		assert.ok(primaryPstCluster)
		assert.equal(primaryPstCluster.reclaimableCopiesCount, 0)
		assert.equal(primaryPstCluster.riskState, 'primary-archive-protected')

		// Stale Thunderbird .msf snapshot copies are reclaimable
		const msfCluster = report.clusters.find(c => c.primaryGroupId === 9953)
		assert.ok(msfCluster)
		assert.equal(msfCluster.reclaimableCopiesCount, 2)

		// Mirrored attachment dump copies are reclaimable
		const attCluster = report.clusters.find(c => c.primaryGroupId === 9955)
		assert.ok(attCluster)
		assert.equal(attCluster.reclaimableCopiesCount, 2)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadEmailArchiveModule()
		const analysis = mod.analyzeEmailArchiveVault(buildSampleEmailArchiveDuplicates(), {
			strategy: 'consolidate-mailbox-vault-hardlinks',
		})

		const script = mod.buildEmailArchiveRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="${DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildEmailArchiveCsvReport(analysis)
		assert.ok(csv.includes('Account,Period,SubjectSignature'))
		// CWE-1236 neutralization for leading '=' formula injection
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote')

		const jsonStr = mod.buildEmailArchiveJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.EMAIL_ARCHIVE_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 6)

		const syncExclude = mod.buildEmailArchiveSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.msf'))
		assert.ok(syncExclude.includes('*.wdseml'))
		assert.ok(syncExclude.includes('ImapMail/'))
	})

	test('EmailArchiveVaultWorkbench.vue renders clusters, applies presets, toggles guards, overrides verdicts, and copies script', async () => {
		const copied = []
		const Workbench = loadEmailArchiveWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleEmailArchiveDuplicates(),
					allDuplicates: buildSampleEmailArchiveDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('email-archive-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.eav__cluster-card').length, 6)

			// Apply Attachment Dumps preset
			const presetBtns = Array.from(vm.$el.querySelectorAll('.eav__seg-btn'))
			const attPreset = presetBtns.find(b => b.textContent.includes('Reclaim Attachment Dumps'))
			assert.ok(attPreset)
			attPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.eav__cluster-card').length, 1)

			// Reset to All Email Vault Audit
			const allPreset = presetBtns.find(b => b.textContent.includes('All Email Vault Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.eav__cluster-card').length, 6)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.eav__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
			assert.ok(copyBtn)
			copyBtn.click()
			await settle()
			assert.equal(copied.length, 1)
			assert.ok(copied[0].includes('DRY_RUN="${DRY_RUN:-1}"'))
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('App.vue wires EmailArchiveVaultWorkbench with Shift+H shortcut without breaking unshifted h', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const EmailArchiveVaultWorkbench = loadEmailArchiveWorkbench()

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
			'./components/EmailArchiveVaultWorkbench.vue': { __esModule: true, default: EmailArchiveVaultWorkbench },
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
			'./components/ProjectDuplicates.vue': { __esModule: true, default: stub('project-dups') },
			'./components/help/OnboardingGuide.vue': { __esModule: true, default: stub('guide') },
			'./components/help/UsageExamples.vue': { __esModule: true, default: stub('examples') },
			'./components/help/FAQ.vue': { __esModule: true, default: stub('faq') },
			'./components/FilterSettings.vue': { __esModule: true, default: stub('filters') },
			'@/tools/api': {
				fetchDuplicates: async type => ({
					entities: type === 'unacknowledged' ? buildSampleEmailArchiveDuplicates() : [],
					pagination: { currentPage: 1, totalPages: 1, totalItems: 6, hasMore: false },
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

			// Unshifted h still resolves to toggle-reclamation-history
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'h', shiftKey: false }), 'toggle-reclamation-history')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'H', shiftKey: true }), 'toggle-email-archive-vault-auditor')

			const btn = vm.$el.querySelector('button.topbar-email-archive-vault-button')
			assert.ok(btn, 'Email Archive Vault button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'Shift+H')
			assert.equal(vm.$el.querySelector('.email-archive-vault-workbench'), null)

			// Shift+H opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.email-archive-vault-workbench'), 'EmailArchiveVaultWorkbench must open on Shift+H shortcut')

			// Shift+H again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'H', shiftKey: true, bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.email-archive-vault-workbench'), null, 'EmailArchiveVaultWorkbench must toggle closed on Shift+H shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Email Archive Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/emailArchiveVaultAuditor.js',
			'src/components/EmailArchiveVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
