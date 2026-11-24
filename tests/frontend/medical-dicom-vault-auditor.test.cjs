const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { Vue, loadComponent, loadModule, settle, window, document } = require('./helpers.cjs')

const root = resolve(__dirname, '../..')

/**
 * Load the pure Medical, DICOM & Health Imaging Vault auditor module for tests.
 *
 * @return {object} Loaded module exports.
 */
function loadMedicalDicomModule() {
	const duplicatePathDiff = loadModule('src/tools/duplicatePathDiff.js')
	const duplicateSelectionAndExport = loadModule('src/tools/duplicateSelectionAndExport.js')
	const duplicateStats = loadModule('src/tools/duplicateStats.js')
	return loadModule('src/tools/medicalDicomVaultAuditor.js', {
		'./duplicatePathDiff': duplicatePathDiff,
		'./duplicateSelectionAndExport': duplicateSelectionAndExport,
		'./duplicateStats': duplicateStats,
	})
}

/**
 * Load MedicalDicomVaultWorkbench.vue with optional clipboard stub.
 *
 * @param {object} [clipboardImpl] Optional clipboard implementation.
 * @return {object} Vue component definition.
 */
function loadMedicalDicomWorkbench(clipboardImpl) {
	const clipboardHelper = loadModule('src/tools/clipboardHelper.js')
	const medicalDicomVaultAuditor = loadMedicalDicomModule()
	return loadComponent('src/components/MedicalDicomVaultWorkbench.vue', {
		'../tools/clipboardHelper': clipboardImpl === undefined
			? clipboardHelper
			: { copyTextSafely: text => clipboardHelper.copyTextSafely(text, clipboardImpl) },
		'../tools/medicalDicomVaultAuditor': medicalDicomVaultAuditor,
	})
}

/**
 * Build synthetic duplicate clusters covering all 4 Medical, DICOM & Health Imaging Vault families.
 *
 * @return {Array<object>} Sample duplicate groups.
 */
function buildSampleMedicalDuplicates() {
	const mib = 1024 * 1024
	const refSec = 1796800000
	return [
		{
			id: 8801,
			hash: 'sha256-dicom-ct-series-anchor',
			size: 64 * mib,
			acknowledged: false,
			files: [
				{
					id: 88011,
					path: '/pacs/Studies/HopitalNord/STUDY-2026-042/CT_Thorax_SER-004_slice-0012.dcm',
					size: 64 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 88012,
					path: '/dicom-vault/HopitalNord/STUDY-2026-042/CT_Thorax_SER-004_slice-0012.dcm',
					size: 64 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 88013,
					path: '/Downloads/cd-burn/STUDY-2026-042/CT_Thorax_SER-004_slice-0012.dcm',
					size: 64 * mib,
					mtime: refSec - 2 * 86400,
				},
			],
		},
		{
			id: 8802,
			hash: 'sha256-dicomdir-manifest',
			size: 4 * mib,
			acknowledged: false,
			files: [
				{
					id: 88021,
					path: '/pacs/Studies/HopitalNord/STUDY-2026-042/DICOMDIR',
					size: 4 * mib,
					mtime: refSec - 5 * 86400,
				},
				{
					id: 88022,
					path: '/dicom-vault/HopitalNord/STUDY-2026-042/DICOMDIR',
					size: 4 * mib,
					mtime: refSec - 5 * 86400,
				},
			],
		},
		{
			id: 8803,
			hash: 'sha256-clinical-hold-tumor-board',
			size: 42 * mib,
			acknowledged: false,
			files: [
				{
					id: 88031,
					path: '/clinical-hold/Studies/OncologyBoard/MRN-88210/IRM_Brain_STUDY-2025-910.dicom',
					size: 42 * mib,
					mtime: refSec - 30 * 86400,
				},
				{
					id: 88032,
					path: '/irb-hold/Studies/OncologyBoard/MRN-88210/IRM_Brain_STUDY-2025-910.dicom',
					size: 42 * mib,
					mtime: refSec - 30 * 86400,
				},
			],
		},
		{
			id: 8804,
			hash: 'sha256-nifti-bids-anonymized',
			size: 128 * mib,
			acknowledged: false,
			files: [
				{
					id: 88041,
					path: '/bids-vault/sub-042/ses-01/anat/sub-042_ses-01_T1w_anonymized.nii.gz',
					size: 128 * mib,
					mtime: refSec - 20 * 86400,
				},
				{
					id: 88042,
					path: '/scratch/viewer-export/sub-042_ses-01_T1w_anonymized.nii.gz',
					size: 128 * mib,
					mtime: refSec - 18 * 86400,
				},
			],
		},
		{
			id: 8805,
			hash: 'sha256-fhir-hl7-clinical-payload',
			size: 12 * mib,
			acknowledged: false,
			files: [
				{
					id: 88051,
					path: '/ehr-vault/Patients/PAT-4410/patient_dupont_FHIR-2026-119.fhir.json',
					size: 12 * mib,
					mtime: refSec - 16 * 86400,
				},
				{
					id: 88052,
					path: '/inbox/mail-attachments/patient_dupont_FHIR-2026-119.fhir.json',
					size: 12 * mib,
					mtime: refSec - 15 * 86400,
				},
			],
		},
		{
			id: 8806,
			hash: 'sha256-hl7-adt-oru-message',
			size: 8 * mib,
			acknowledged: false,
			files: [
				{
					id: 88061,
					path: '/ehr-vault/Patients/PAT-4410/HL7-2026-009_mrn_4410.hl7',
					size: 8 * mib,
					mtime: refSec - 18 * 86400,
				},
				{
					id: 88062,
					path: '/tmp/osirix-export/HL7-2026-009_mrn_4410.hl7',
					size: 8 * mib,
					mtime: refSec - 17 * 86400,
				},
			],
		},
		{
			id: 8807,
			hash: 'sha256-radiology-report-pdf-injection',
			size: 18 * mib,
			acknowledged: false,
			files: [
				{
					id: 88071,
					path: '=cmd|calc/radiology-archive/Patients/PAT-991/compte_rendu_irm_cerebral.pdf',
					size: 18 * mib,
					mtime: refSec - 22 * 86400,
				},
				{
					id: 88072,
					path: '=cmd|calc/Downloads/PAT-991/compte_rendu_irm_cerebral.pdf',
					size: 18 * mib,
					mtime: refSec - 21 * 86400,
				},
			],
		},
	]
}

describe('Cycle 183: Medical, DICOM & Health Imaging Vault Auditor', () => {
	test('classifies all 4 medical/DICOM families, modality codes, and PHI risk badges', () => {
		const mod = loadMedicalDicomModule()

		const dcm = mod.classifyMedicalDicomFile({
			path: '/pacs/Studies/HopitalNord/STUDY-2026-042/CT_Thorax_SER-004_slice-0012.dcm',
		})
		assert.equal(dcm.family, 'dicom-imaging-studies')
		assert.equal(dcm.patientCohort, 'hopitalnord')
		assert.equal(dcm.studySeriesId, 'STUDY-2026-042')
		assert.equal(dcm.modality, 'CT')
		assert.equal(dcm.sliceOrRevision, 12)
		assert.equal(dcm.phiRiskLevel, 'moderate-phi')
		assert.equal(dcm.inCanonicalPacs, true)

		const dicomdir = mod.classifyMedicalDicomFile({
			path: '/pacs/Studies/HopitalNord/STUDY-2026-042/DICOMDIR',
		})
		assert.equal(dicomdir.family, 'dicom-imaging-studies')
		assert.equal(dicomdir.modality, 'DICOMDIR')
		assert.equal(dicomdir.isDicomdirOrSr, true)

		const niftiAnon = mod.classifyMedicalDicomFile({
			path: '/bids-vault/sub-042/ses-01/anat/sub-042_ses-01_T1w_anonymized.nii.gz',
		})
		assert.equal(niftiAnon.family, 'neuro-volumetric-nifti')
		assert.equal(niftiAnon.patientCohort, 'sub-042')
		assert.equal(niftiAnon.modality, 'MR')
		assert.equal(niftiAnon.isAnonymized, true)
		assert.equal(niftiAnon.phiRiskLevel, 'anonymized')
		assert.equal(niftiAnon.phiRiskBadge, 'Anonymized / De-ID')

		const fhir = mod.classifyMedicalDicomFile({
			path: '/ehr-vault/Patients/PAT-4410/patient_dupont_FHIR-2026-119.fhir.json',
		})
		assert.equal(fhir.family, 'hl7-fhir-clinical-records')
		assert.equal(fhir.modality, 'FHIR')
		assert.equal(fhir.phiRiskLevel, 'high-phi')
		assert.equal(fhir.phiRiskBadge, 'PHI Risk: High')

		const hl7 = mod.classifyMedicalDicomFile({
			path: '/ehr-vault/Patients/PAT-4410/HL7-2026-009_mrn_4410.hl7',
		})
		assert.equal(hl7.family, 'hl7-fhir-clinical-records')
		assert.equal(hl7.modality, 'HL7')
		assert.equal(hl7.phiRiskLevel, 'high-phi')

		const dicomSr = mod.classifyMedicalDicomFile({
			path: '/pacs/Studies/HopitalNord/STUDY-2026-042/dose_report.sr.dcm',
		})
		assert.equal(dicomSr.family, 'hl7-fhir-clinical-records')
		assert.equal(dicomSr.isDicomSr, true)
		assert.equal(dicomSr.modality, 'DICOM-SR')

		const reportPdf = mod.classifyMedicalDicomFile({
			path: '/radiology-archive/Patients/PAT-991/compte_rendu_irm_cerebral.pdf',
		})
		assert.equal(reportPdf.family, 'radiology-reports-exports')
		assert.equal(reportPdf.phiRiskLevel, 'high-phi')

		const unrelated = mod.classifyMedicalDicomFile({
			path: '/Photos/vacation_2026/beach.jpg',
		})
		assert.equal(unrelated, null)
	})

	test('shields clinical-hold, DICOMDIR/SR, and canonical PACS series while reclaiming viewer/CD exports', () => {
		const mod = loadMedicalDicomModule()
		const report = mod.analyzeMedicalDicomVault(buildSampleMedicalDuplicates())

		assert.equal(report.schema, mod.MEDICAL_DICOM_VAULT_SCHEMA)
		assert.equal(report.summary.totalClustersCount, 7)
		assert.equal(report.summary.totalHighPhiClusters, 4)
		assert.equal(report.summary.totalAnonymizedClusters, 1)
		assert.equal(report.summary.totalClinicalHoldSrClusters, 2)
		assert.ok(report.summary.totalReclaimableBytes > 0)
		assert.match(report.summary.reclaimableGb, /^\d+\.\d{2} GB$/)

		// DICOM CT study: both PACS copies shielded, only Downloads/cd-burn copy reclaimed
		const dicomCluster = report.clusters.find(c => c.primaryGroupId === 8801)
		assert.ok(dicomCluster)
		assert.equal(dicomCluster.reclaimableCopiesCount, 1)
		const pacsMembers = dicomCluster.members.filter(m => m.meta.inCanonicalPacs)
		const cdMember = dicomCluster.members.find(m => m.path.includes('/cd-burn/'))
		assert.equal(pacsMembers.length, 2)
		assert.equal(pacsMembers[0].verdict, 'keep-canonical-survivor')
		assert.equal(pacsMembers[1].verdict, 'blocked-pacs-series')
		assert.equal(pacsMembers[1].actionType, 'keep')
		assert.equal(cdMember.actionType, 'prune')

		// DICOMDIR manifest: both canonical PACS copies shielded
		const dicomdirCluster = report.clusters.find(c => c.primaryGroupId === 8802)
		assert.ok(dicomdirCluster)
		assert.equal(dicomdirCluster.reclaimableCopiesCount, 0)
		assert.equal(dicomdirCluster.riskState, 'dicomdir-sr-protected')
		assert.equal(dicomdirCluster.members[1].verdict, 'blocked-dicomdir-sr')

		// Clinical Hold cluster: locked and immutable
		const holdCluster = report.clusters.find(c => c.primaryGroupId === 8803)
		assert.ok(holdCluster)
		assert.equal(holdCluster.hasClinicalHold, true)
		assert.equal(holdCluster.reclaimableCopiesCount, 0)
		assert.equal(holdCluster.riskState, 'clinical-hold-locked')
		assert.equal(holdCluster.members[1].verdict, 'blocked-clinical-hold')

		// NIfTI BIDS anonymized: scratch viewer export is reclaimed
		const niftiCluster = report.clusters.find(c => c.primaryGroupId === 8804)
		assert.ok(niftiCluster)
		assert.equal(niftiCluster.isAnonymized, true)
		assert.equal(niftiCluster.reclaimableCopiesCount, 1)
	})

	test('generates safe POSIX DRY_RUN=1 script, CWE-1236 CSV, JSON manifest, and .sync-exclude.lst rules', () => {
		const mod = loadMedicalDicomModule()
		const analysis = mod.analyzeMedicalDicomVault(buildSampleMedicalDuplicates(), {
			strategy: 'consolidate-pacs-hardlinks',
		})

		// Clinical Hold stays strictly shielded even under hardlink consolidation
		const holdCluster = analysis.clusters.find(c => c.primaryGroupId === 8803)
		assert.equal(holdCluster.reclaimableCopiesCount, 0)

		const script = mod.buildMedicalDicomRemediationScript(analysis, { dataRoot: '/srv/nextcloud/data' })
		assert.ok(script.startsWith('#!/usr/bin/env sh'))
		assert.ok(script.includes('set -eu'))
		assert.ok(script.includes('DRY_RUN="$' + '{DRY_RUN:-1}"'))
		assert.ok(script.includes('ln -f '))

		const csv = mod.buildMedicalDicomCsvReport(analysis)
		assert.ok(csv.includes('PatientCohort,StudySeriesId,Modality,PhiRiskLevel,Anonymized'))
		assert.ok(csv.includes("'=cmd|calc/"), 'CSV must neutralize leading = with single quote (CWE-1236)')

		const jsonStr = mod.buildMedicalDicomJsonReport(analysis)
		const parsed = JSON.parse(jsonStr)
		assert.equal(parsed.schema, mod.MEDICAL_DICOM_VAULT_SCHEMA)
		assert.equal(parsed.clusters.length, 7)

		const syncExclude = mod.buildMedicalDicomSyncExcludeSnippet(analysis)
		assert.ok(syncExclude.includes('*.dcm.tmp'))
		assert.ok(syncExclude.includes('*.nii.gz.part'))
		assert.ok(syncExclude.includes('*.lock.fhir'))
	})

	test('MedicalDicomVaultWorkbench.vue renders clusters, applies presets, filters PHI, and copies script', async () => {
		const copied = []
		const Workbench = loadMedicalDicomWorkbench({
			writeText: async text => {
				copied.push(text)
			},
		})
		const mountNode = document.createElement('div')
		document.body.appendChild(mountNode)
		const vm = new Vue({
			render: h => h(Workbench, {
				props: {
					duplicates: buildSampleMedicalDuplicates(),
					allDuplicates: buildSampleMedicalDuplicates(),
				},
			}),
		}).$mount(mountNode)

		try {
			await settle()
			assert.equal(vm.$el.classList.contains('medical-dicom-vault-workbench'), true)
			assert.equal(vm.$el.querySelectorAll('.mdv__cluster-card').length, 7)

			// Apply NIfTI / BIDS Neuroimaging preset
			const segBtns = Array.from(vm.$el.querySelectorAll('.mdv__seg-btn'))
			const niftiPreset = segBtns.find(b => b.textContent.includes('NIfTI / BIDS Neuroimaging Vault'))
			assert.ok(niftiPreset)
			niftiPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.mdv__cluster-card').length, 1)

			// Reset to All Medical & DICOM Audit
			const allPreset = segBtns.find(b => b.textContent.includes('All Medical & DICOM Audit'))
			allPreset.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.mdv__cluster-card').length, 7)

			// Filter by PHI Risk: High verdict pill
			const highPhiBtn = segBtns.find(b => b.textContent.trim() === 'PHI Risk: High')
			assert.ok(highPhiBtn)
			highPhiBtn.click()
			await settle()
			assert.equal(vm.$el.querySelectorAll('.mdv__cluster-card').length, 4)

			// Copy DRY_RUN=1 script
			const copyBtn = Array.from(vm.$el.querySelectorAll('.mdv__tool-btn')).find(b => b.textContent.includes('Copy DRY_RUN=1 Script'))
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

	test('App.vue wires MedicalDicomVaultWorkbench with F10 shortcut cleanly', async () => {
		window.localStorage.clear()
		const utils = loadModule('src/tools/utils.js', {
			'./notifications': { showErrorNotification: () => {} },
		})
		const keyboardShortcuts = loadModule('src/tools/keyboardShortcuts.js')
		const statsModule = loadModule('src/tools/duplicateStats.js')
		const MedicalDicomVaultWorkbench = loadMedicalDicomWorkbench()

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
			'./components/LegalContractVaultWorkbench.vue': { __esModule: true, default: stub('legal-contract-vault-auditor') },
			'./components/MedicalDicomVaultWorkbench.vue': { __esModule: true, default: MedicalDicomVaultWorkbench },
			'./components/AdditiveManufacturingVaultWorkbench.vue': { __esModule: true, default: stub('additive-mfg-vault-auditor') },
			'./components/GameDevPipelineVaultWorkbench.vue': { __esModule: true, default: stub('game-dev-pipeline-vault-auditor') },
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
					entities: type === 'unacknowledged' ? buildSampleMedicalDuplicates() : [],
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

			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F10', shiftKey: false }), 'toggle-medical-dicom-vault-auditor')
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F10', ctrlKey: true }), null)
			assert.equal(keyboardShortcuts.resolveShortcutAction({ key: 'F10', target: { tagName: 'INPUT' } }), null)

			const btn = vm.$el.querySelector('button.topbar-medical-dicom-vault-button')
			assert.ok(btn, 'Medical & DICOM button is rendered in topbar')
			assert.equal(btn.getAttribute('aria-keyshortcuts'), 'F10')
			assert.equal(vm.$el.querySelector('.medical-dicom-vault-workbench'), null)

			// F10 opens workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true }))
			await settle()
			assert.ok(vm.$el.querySelector('.medical-dicom-vault-workbench'), 'MedicalDicomVaultWorkbench must open on F10 shortcut')

			// F10 again closes workbench
			window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', bubbles: true, cancelable: true }))
			await settle()
			assert.equal(vm.$el.querySelector('.medical-dicom-vault-workbench'), null, 'MedicalDicomVaultWorkbench must toggle closed on F10 shortcut')
		} finally {
			vm.$destroy()
			mountNode.remove()
		}
	})

	test('new Medical & DICOM Vault files have zero typographic dashes and zero XSS sinks', () => {
		const files = [
			'src/tools/medicalDicomVaultAuditor.js',
			'src/components/MedicalDicomVaultWorkbench.vue',
			'src/tools/keyboardShortcuts.js',
		]
		for (const rel of files) {
			const content = readFileSync(resolve(root, rel), 'utf8')
			assert.equal(/[\u2013\u2014]/.test(content), false, `No U+2013/U+2014 in ${rel}`)
			assert.equal(/v-html|innerHTML|outerHTML|document\.write/.test(content), false, `No XSS sink in ${rel}`)
		}
	})
})
