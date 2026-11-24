/**
 * Pure Medical, DICOM & Health Imaging Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Medical & Clinical Imaging Vault families:
 * - DICOM Studies & Series (*.dcm, *.dicom, *.ima, DICOMDIR, CT/MR/US/XR/PET modalities)
 * - Volumetric NIfTI / BIDS & NRRD (*.nii, *.nii.gz, *.nrrd, *.nhdr, *.mha, *.mhd, *.mgz)
 * - HL7 / FHIR & Structured Clinical Records (*.hl7, *.fhir.json, *.cda, *.ccda, DICOM SR)
 * - Radiology Reports & Viewer Exports (clinical/radiology PDFs, PACS CD/USB viewer exports)
 *
 * Groups artifacts deterministically by patient/cohort + study/series ID + modality,
 * computes PHI / anonymization risk badges (high-phi, moderate-phi, anonymized),
 * shields clinical-hold, DICOMDIR/SR, and canonical PACS series by default,
 * and generates safe POSIX DRY_RUN=1 remediation scripts, CWE-1236 CSV exports,
 * JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const MEDICAL_DICOM_VAULT_SCHEMA = 'duplicatefinder.medical-dicom-vault-auditor.v1'

export const MEDICAL_DICOM_FAMILIES = Object.freeze([
	'all',
	'dicom-imaging-studies',
	'neuro-volumetric-nifti',
	'hl7-fhir-clinical-records',
	'radiology-reports-exports',
])

export const MEDICAL_DICOM_FAMILY_META = Object.freeze({
	'dicom-imaging-studies': {
		id: 'dicom-imaging-studies',
		label: 'DICOM Studies & Series',
		shortLabel: 'DICOM (.dcm, .dicom, .ima, DICOMDIR, CT/MR/US/XR/PET)',
	},
	'neuro-volumetric-nifti': {
		id: 'neuro-volumetric-nifti',
		label: 'NIfTI / BIDS & Volumetric',
		shortLabel: 'Volumetric (.nii, .nii.gz, .nrrd, .mha, .mgz)',
	},
	'hl7-fhir-clinical-records': {
		id: 'hl7-fhir-clinical-records',
		label: 'HL7 / FHIR & DICOM SR',
		shortLabel: 'Clinical Interop (.hl7, .fhir.json, .cda, .sr.dcm)',
	},
	'radiology-reports-exports': {
		id: 'radiology-reports-exports',
		label: 'Radiology Reports & Exports',
		shortLabel: 'Reports & Exports (CR/radiology PDF, CD/viewer exports)',
	},
})

export const MEDICAL_DICOM_STRATEGIES = Object.freeze([
	'prune-exports-keep-series',
	'consolidate-pacs-hardlinks',
	'prune-viewer-exports-only',
])

export const MEDICAL_DICOM_SURVIVOR_RULES = Object.freeze([
	'pacs-series-clinical-first',
	'anonymized-deid-first',
	'shortest-path',
])

export const MEDICAL_DICOM_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'phi-high',
	'anonymized',
	'clinical-hold',
	'dicom-series',
	'nifti-bids',
	'hl7-fhir',
	'shielded',
])

export const MEDICAL_DICOM_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'phi_risk_desc',
	'copies_desc',
	'name_asc',
])

export const MEDICAL_DICOM_PRESETS = Object.freeze([
	{
		id: 'all-medical-dicom-audit',
		name: 'All Medical & DICOM Audit',
		description: 'Audit DICOM series, NIfTI/BIDS volumes, HL7/FHIR clinical payloads, and radiology PDF/viewer exports while preserving canonical PACS studies and clinical-hold records.',
		familyFilter: 'all',
		strategy: 'prune-exports-keep-series',
		survivorRule: 'pacs-series-clinical-first',
		protectClinicalHoldAndSr: true,
		protectCanonicalPacsSeries: true,
		staleExportDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-viewer-cd-exports',
		name: 'Prune Viewer & CD Exports',
		description: 'Safely reclaim duplicate OsiriX/Horos/RadiAnt viewer exports, CD/USB burn images, and staging PDF copies older than the retention window while keeping PACS series intact.',
		familyFilter: 'all',
		strategy: 'prune-viewer-exports-only',
		survivorRule: 'pacs-series-clinical-first',
		protectClinicalHoldAndSr: true,
		protectCanonicalPacsSeries: true,
		staleExportDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-pacs-hardlinks',
		name: 'Hardlink-Consolidate PACS Series',
		description: 'Deduplicate identical DICOM series slices and volumetric NIfTI files onto canonical PACS anchors via POSIX hardlinks while keeping clinical-hold items immutable.',
		familyFilter: 'all',
		strategy: 'consolidate-pacs-hardlinks',
		survivorRule: 'pacs-series-clinical-first',
		protectClinicalHoldAndSr: true,
		protectCanonicalPacsSeries: true,
		staleExportDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-phi-exposure-risk',
		name: 'PHI Risk & Un-Anonymized Audit',
		description: 'Surface un-anonymized HL7/FHIR bundles, patient-named DICOM studies, and clinical PDF reports carrying high PHI exposure risk for controlled governance.',
		familyFilter: 'hl7-fhir-clinical-records',
		strategy: 'prune-exports-keep-series',
		survivorRule: 'anonymized-deid-first',
		protectClinicalHoldAndSr: true,
		protectCanonicalPacsSeries: true,
		staleExportDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'audit-nifti-bids-neuro',
		name: 'NIfTI / BIDS Neuroimaging Vault',
		description: 'Audit duplicate .nii/.nii.gz, .nrrd, and .mgz brain/body volumetric scans grouped by BIDS subject/session cohort while protecting anonymized research masters.',
		familyFilter: 'neuro-volumetric-nifti',
		strategy: 'prune-exports-keep-series',
		survivorRule: 'anonymized-deid-first',
		protectClinicalHoldAndSr: true,
		protectCanonicalPacsSeries: true,
		staleExportDays: 14,
		minSizeMb: 0,
	},
])

const DICOM_EXT_SET = new Set([
	'dcm',
	'dicom',
	'ima',
	'dic',
])

const NIFTI_VOLUMETRIC_EXT_SET = new Set([
	'nii',
	'nii.gz',
	'nrrd',
	'nhdr',
	'mha',
	'mhd',
	'mgz',
	'mgh',
])

const HL7_FHIR_EXT_SET = new Set([
	'hl7',
	'fhir.json',
	'fhir',
	'cda',
	'ccda',
	'ccd.xml',
	'sr.dcm',
])

const VIEWER_IMAGE_EXT_SET = new Set([
	'jpg',
	'jpeg',
	'png',
	'tif',
	'tiff',
])

const DICOM_SR_SIGNAL_RE = /(?:dicom[_-]?sr|structured[_-]?report|[._-]sr(?:[._-]|$)|\.sr\.dcm$)/i
const CLINICAL_HOLD_PATH_RE = /(?:clinical[_-]?hold|irb[_-]?hold|trial[_-]?lock|medico[_-]?legal|tumor[_-]?board|legal[_-]?hold|ethics[_-]?archive|retention[_-]?lock|regulatory[_-]?hold)/i
const ANONYMIZED_DEID_SIGNAL_RE = /(?:anonymi[sz]ed|anonym|anon[_-]|[_-]anon(?:[._-]|$)|deid|de-id|de[_-]?identified|scrubbed|pseudo[_-]?anon|hipaa[_-]?safe|rgpd[_-]?anon|bids[_-]?anon)/i
const HIGH_PHI_SIGNAL_RE = /(?:mrn|ipp|ssn|nir|patient[_-]|pat[_-]\d|dob|birth[_-]?date|nom[_-]?patient|dossier[_-]?patient|ordonnance|compte[_-]?rendu|discharge[_-]?summary|pathology[_-]?report|biopsy|blood[_-]?panel|echocardiogram|irm[_-]?cerebral)/i
const MEDICAL_CONTEXT_RE = /(?:dicom|pacs|radiology|radiologie|imaging|imagerie|scanner|irm|mri|ct[_-]?scan|ultrasound|echo|echographie|pet[_-]?ct|mammo|mammography|pathology|clinical|clinique|patient|patients|hospital|hopital|chu|clinic|clinique|ehr|emr|fhir|hl7|nifti|bids|neuro|anat|func|dwi|t1w|t2w|flair|flair3d|cardio|oncology|orthopedic|series|study|accession)/i
const RADIOLOGY_REPORT_SIGNAL_RE = /(?:compte[_-]?rendu|cr[_-]?(?:irm|scanner|radio|echo|pet)|radiology[_-]?report|imaging[_-]?report|clinical[_-]?report|discharge[_-]?summary|lab[_-]?report|pathology[_-]?report|prescription|ordonnance|biopsy[_-]?report)/i
const VIEWER_EXPORT_SIGNAL_RE = /(?:cd[_-]?burn|usb[_-]?export|viewer[_-]?export|osirix|horos|radiant|weasis|orthanc[_-]?export|pacs[_-]?export|patient[_-]?cd|dicom[_-]?viewer|export[_-]?jpeg|export[_-]?png|rendered[_-]?frames)/i

const CANONICAL_PACS_PATH_RE = /(\/(?:pacs|pacs[_-]?vault|dicom[_-]?vault|medical[_-]?vault|clinical[_-]?archive|radiology[_-]?archive|bids[_-]?vault|neuro[_-]?vault|ehr[_-]?vault|canonical|masters?|clinical[_-]?hold|irb[_-]?hold|studies|__groupfolders\/\d+\/(?:pacs|dicom|medical|radiology|clinical))(?:\/|$))/i
const STAGING_VIEWER_EXPORT_PATH_RE = /(\/(?:downloads?|telechargements?|tmp|temp|scratch|staging|incoming|inbox|cd[_-]?burn|usb[_-]?export|viewer[_-]?export|osirix[_-]?export|horos[_-]?tmp|radiant[_-]?cache|mail[_-]?attachments?|email[_-]?exports?|dropzone|wetransfer|desktop)(?:\/|$))/i

const PRIMARY_STUDY_ID_RE = /(?:^|[^a-z0-9])((?:STUDY|ACC|SUB|MRN|PAT|FHIR|HL7)[_-]?\d{2,6}(?:[_-]\d{1,6})?|\d{4}[_-](?:STUDY|ACC|MRN)[_-]\d{2,6})(?=$|[^a-z0-9])/i
const STUDY_SERIES_ID_RE = /(?:^|[^a-z0-9])((?:STUDY|SER|SERIES|ACC|SUB|SES|PAT|MRN|FHIR|HL7|CT|MR|US|PET|XR)[_-]?\d{2,6}(?:[_-]\d{1,6})?|\d{4}[_-](?:STUDY|SER|ACC|MRN)[_-]\d{2,6})(?=$|[^a-z0-9])/i
const PRIMARY_SLICE_RE = /(?:^|[._\s-])(?:slice|sl|im|img)[._-]?(\d{1,5})(?:[._\s-]|$)/i
const SLICE_REV_RE = /(?:^|[._\s-])(?:slice|sl|im|img|ser|v|ver|rev)[._-]?(\d{1,5})(?:[._\s-]|$)/i

const IGNORED_COHORT_SEGMENTS = new Set([
	'files',
	'medical',
	'medical-vault',
	'dicom',
	'dicom-vault',
	'pacs',
	'pacs-vault',
	'radiology',
	'radiology-archive',
	'clinical',
	'clinical-archive',
	'clinical-hold',
	'irb-hold',
	'ehr',
	'ehr-vault',
	'fhir',
	'hl7',
	'nifti',
	'bids',
	'bids-vault',
	'neuro',
	'neuro-vault',
	'studies',
	'series',
	'reports',
	'exports',
	'viewer-export',
	'cd-burn',
	'usb-export',
	'canonical',
	'masters',
	'master',
	'archive',
	'staging',
	'downloads',
	'telechargements',
	'inbox',
	'incoming',
	'tmp',
	'temp',
	'scratch',
	'desktop',
	'__groupfolders',
	'users',
	'home',
	'var',
	'www',
	'nextcloud',
])

/**
 * Safely normalize a path string for deterministic inspection.
 *
 * @param {string} rawPath File path.
 * @return {string} Normalized POSIX-like path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract the basename from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Basename.
 */
function getBasename(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	if (!clean) {
		return ''
	}
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Extract the directory path from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Directory path.
 */
function getDirname(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	const idx = clean.lastIndexOf('/')
	return idx > 0 ? clean.slice(0, idx) : '/'
}

/**
 * Extract lowercase extension including chained clinical extensions (.nii.gz, .fhir.json, .ccd.xml, .sr.dcm).
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension without leading dot.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	if (lower === 'dicomdir') {
		return 'dicomdir'
	}
	if (lower.endsWith('.nii.gz')) {
		return 'nii.gz'
	}
	if (lower.endsWith('.fhir.json')) {
		return 'fhir.json'
	}
	if (lower.endsWith('.ccd.xml')) {
		return 'ccd.xml'
	}
	if (lower.endsWith('.sr.dcm')) {
		return 'sr.dcm'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Normalize epoch timestamp in seconds.
 *
 * @param {number|string|null|undefined} rawMtime Timestamp in seconds or ms.
 * @return {number} Epoch seconds or 0.
 */
function normalizeMtimeSec(rawMtime) {
	const num = Number(rawMtime)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)
}

/**
 * Extract patient, subject, or clinical cohort slug from path or basename.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized patient/cohort slug.
 */
export function extractPatientStudyCohort(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const segLower = dirSegments[i].toLowerCase()
		if (/^sub-[a-z0-9._-]+$/i.test(dirSegments[i])) {
			return segLower
		}
		if (
			/^(?:pacs|pacs[_-]?vault|dicom[_-]?vault|medical[_-]?vault|clinical[_-]?archive|radiology[_-]?archive|bids[_-]?vault|neuro[_-]?vault|ehr[_-]?vault|patients?|studies|clinical[_-]?hold|irb[_-]?hold)$/.test(segLower)
			&& i + 1 < dirSegments.length
		) {
			const nextSeg = dirSegments[i + 1].toLowerCase()
			if (nextSeg && !IGNORED_COHORT_SEGMENTS.has(nextSeg) && !/^\d+$/.test(nextSeg)) {
				return nextSeg.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'clinical-cohort'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_COHORT_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'clinical-cohort'
		}
	}

	return normalizeMedicalSignature(basename)
}

/**
 * Extract deterministic DICOM Study, Series, Accession, or BIDS ID from basename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Normalized study/series ID or 'UNASSIGNED-STUDY'.
 */
export function extractStudySeriesId(basename, fullPath = '') {
	const match = PRIMARY_STUDY_ID_RE.exec(basename)
		|| PRIMARY_STUDY_ID_RE.exec(fullPath)
		|| STUDY_SERIES_ID_RE.exec(basename)
		|| STUDY_SERIES_ID_RE.exec(fullPath)
	if (!match) {
		return 'UNASSIGNED-STUDY'
	}
	return match[1].toUpperCase().replace(/_/g, '-')
}

/**
 * Extract imaging modality or clinical document protocol code.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path and basename string.
 * @param {string} family Assigned medical vault family.
 * @return {string} Normalized modality code.
 */
export function extractModalityCode(ext, combinedContext, family) {
	const lower = String(combinedContext || '').toLowerCase()
	if (ext === 'dicomdir') {
		return 'DICOMDIR'
	}
	if (ext === 'sr.dcm' || DICOM_SR_SIGNAL_RE.test(lower)) {
		return 'DICOM-SR'
	}
	if (ext === 'hl7') {
		return 'HL7'
	}
	if (ext === 'fhir.json' || ext === 'fhir') {
		return 'FHIR'
	}
	if (ext === 'cda' || ext === 'ccda' || ext === 'ccd.xml') {
		return 'CDA'
	}
	if (/(?:^|[^a-z])(?:pet[_-]?ct|pet|fdg)(?:$|[^a-z])/.test(lower)) {
		return 'PT'
	}
	if (/(?:^|[^a-z])(?:mri|mr|t1w|t2w|flair|dwi|fmri|bold)(?:$|[^a-z])/.test(lower)) {
		return 'MR'
	}
	if (/(?:^|[^a-z])(?:ct|ct[_-]?scan|scanner|angiography|cta)(?:$|[^a-z])/.test(lower)) {
		return 'CT'
	}
	if (/(?:^|[^a-z])(?:ultrasound|us|echo|echographie|doppler)(?:$|[^a-z])/.test(lower)) {
		return 'US'
	}
	if (/(?:^|[^a-z])(?:mammo|mammography|mg)(?:$|[^a-z])/.test(lower)) {
		return 'MG'
	}
	if (/(?:^|[^a-z])(?:xray|x[_-]?ray|radio|radiograph|cr|dx)(?:$|[^a-z])/.test(lower)) {
		return 'XR'
	}
	if (family === 'neuro-volumetric-nifti') {
		return 'VOL-3D'
	}
	if (family === 'radiology-reports-exports') {
		return ext === 'pdf' ? 'REPORT-PDF' : 'VIEWER-IMG'
	}
	return 'DICOM'
}

/**
 * Parse slice, instance, or series revision index from filename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {number} Parsed slice/revision number or 0.
 */
export function parseSeriesSliceOrRevision(basename, fullPath = '') {
	const match = PRIMARY_SLICE_RE.exec(basename)
		|| PRIMARY_SLICE_RE.exec(fullPath)
		|| SLICE_REV_RE.exec(basename)
		|| SLICE_REV_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Normalize a DICOM, NIfTI, HL7/FHIR, or radiology report filename into a signature slug.
 *
 * @param {string} basename File basename.
 * @return {string} Normalized signature slug.
 */
export function normalizeMedicalSignature(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-study'
	}
	let stem = basename.trim()
	if (stem.toLowerCase() === 'dicomdir') {
		return 'dicomdir'
	}
	stem = stem.replace(/\.(?:nii\.gz|fhir\.json|ccd\.xml|sr\.dcm)$/i, '')
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(/(?:\s*\(\d+\)|[._\s-]+(?:anon|anonymized|anonymised|deid|de-id|scrubbed|export|viewer|rendered|copy|backup|bak|dup|duplicate|old|tmp|final|v\d+|rev\d+|\d{4}[-_]\d{2}[-_]\d{2}))+$/gi, '')
	}
	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'medical-artifact'
}

/**
 * Determine PHI exposure risk and anonymization status from file path and type.
 *
 * @param {string} combinedContext Path and basename string.
 * @param {string} family Assigned medical vault family.
 * @param {string} ext File extension.
 * @return {object} PHI risk classification metadata.
 */
export function detectPhiRiskState(combinedContext, family, ext) {
	const isAnonymized = ANONYMIZED_DEID_SIGNAL_RE.test(combinedContext)
	if (isAnonymized) {
		return {
			isAnonymized: true,
			hasPhiRisk: false,
			phiRiskLevel: 'anonymized',
			phiRiskBadge: 'Anonymized / De-ID',
		}
	}

	const hasExplicitHighPhi = HIGH_PHI_SIGNAL_RE.test(combinedContext)
		|| family === 'hl7-fhir-clinical-records'
		|| (family === 'radiology-reports-exports' && ext === 'pdf')

	if (hasExplicitHighPhi) {
		return {
			isAnonymized: false,
			hasPhiRisk: true,
			phiRiskLevel: 'high-phi',
			phiRiskBadge: 'PHI Risk: High',
		}
	}

	return {
		isAnonymized: false,
		hasPhiRisk: true,
		phiRiskLevel: 'moderate-phi',
		phiRiskBadge: 'PHI Risk: Moderate',
	}
}

/**
 * Detect imaging system label and display format badge.
 *
 * @param {string} ext File extension.
 * @param {string} modality Modality code.
 * @param {string} family Assigned family ID.
 * @param {boolean} isClinicalHold Whether file is under clinical/IRB hold.
 * @param {boolean} isDicomdirOrSr Whether file is DICOMDIR or DICOM SR.
 * @return {object} Imaging tool label and format badge.
 */
function detectMedicalSystemAndFormat(ext, modality, family, isClinicalHold, isDicomdirOrSr) {
	let imagingSystem = 'PACS Medical Vault'
	if (ext === 'dicomdir') {
		imagingSystem = 'DICOMDIR Study Index'
	} else if (isDicomdirOrSr) {
		imagingSystem = 'DICOM Structured Report'
	} else if (family === 'hl7-fhir-clinical-records') {
		imagingSystem = ext === 'hl7' ? 'HL7 v2/v3 Clinical Feed' : (ext.includes('fhir') ? 'HL7 FHIR R4 Bundle' : 'CDA Clinical Document')
	} else if (family === 'neuro-volumetric-nifti') {
		imagingSystem = 'NIfTI / BIDS Volumetric'
	} else if (family === 'radiology-reports-exports') {
		imagingSystem = ext === 'pdf' ? 'Radiology / Clinical Report' : 'PACS Viewer / CD Export'
	} else if (family === 'dicom-imaging-studies') {
		imagingSystem = `PACS DICOM (${modality})`
	}

	let formatBadge = ext ? `.${ext}` : 'medical'
	if (isClinicalHold) {
		formatBadge = 'CLINICAL HOLD'
	} else if (ext === 'dicomdir') {
		formatBadge = 'DICOMDIR'
	} else if (isDicomdirOrSr) {
		formatBadge = 'DICOM SR'
	} else if (family === 'neuro-volumetric-nifti') {
		formatBadge = `Vol .${ext}`
	} else if (family === 'hl7-fhir-clinical-records') {
		formatBadge = ext === 'hl7' ? 'HL7' : (ext.includes('fhir') ? 'FHIR JSON' : `CDA .${ext}`)
	} else if (family === 'radiology-reports-exports') {
		formatBadge = ext === 'pdf' ? 'Report PDF' : `Viewer .${ext}`
	} else {
		formatBadge = `DICOM ${modality}`
	}

	return { imagingSystem, formatBadge }
}

/**
 * Classify a single file into one of the 4 Medical, DICOM & Health Imaging Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyMedicalDicomFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const isDicomdir = ext === 'dicomdir'
	const isDicomSr = ext === 'sr.dcm' || ((DICOM_EXT_SET.has(ext) || ext === 'xml') && DICOM_SR_SIGNAL_RE.test(combinedContext))
	const isClinicalHold = CLINICAL_HOLD_PATH_RE.test(combinedContext)
	const hasMedicalContext = MEDICAL_CONTEXT_RE.test(combinedContext)
	const hasReportSignal = RADIOLOGY_REPORT_SIGNAL_RE.test(combinedContext)
	const hasViewerExportSignal = VIEWER_EXPORT_SIGNAL_RE.test(combinedContext)

	const isHl7Fhir = HL7_FHIR_EXT_SET.has(ext)
		|| isDicomSr
		|| (ext === 'json' && /\bfhir\b/i.test(combinedContext))
		|| (ext === 'xml' && /\b(?:hl7|fhir|cda|ccda)\b/i.test(combinedContext))

	const isNeuroVolumetric = !isHl7Fhir && NIFTI_VOLUMETRIC_EXT_SET.has(ext)

	const isDicomImaging = !isHl7Fhir && !isNeuroVolumetric && (
		isDicomdir
		|| DICOM_EXT_SET.has(ext)
	)

	const isRadiologyReportOrExport = !isHl7Fhir && !isNeuroVolumetric && !isDicomImaging && (
		(ext === 'pdf' && (hasReportSignal || (hasMedicalContext && /report|compte|rendu|radiology|irm|scanner|echo|lab|biopsy|discharge|patient/i.test(combinedContext))))
		|| (VIEWER_IMAGE_EXT_SET.has(ext) && (hasViewerExportSignal || (hasMedicalContext && /dicom|pacs|slice|irm|mri|ct|echo|radiograph|xray/i.test(combinedContext))))
		|| ((ext === 'zip' || ext === 'iso') && hasViewerExportSignal && hasMedicalContext)
	)

	if (!isHl7Fhir && !isNeuroVolumetric && !isDicomImaging && !isRadiologyReportOrExport) {
		return null
	}

	let family = 'dicom-imaging-studies'
	let artifactKind = 'dicom-slice'
	if (isHl7Fhir) {
		family = 'hl7-fhir-clinical-records'
		artifactKind = isDicomSr ? 'dicom-sr' : (ext === 'hl7' ? 'hl7-message' : 'fhir-bundle')
	} else if (isNeuroVolumetric) {
		family = 'neuro-volumetric-nifti'
		artifactKind = 'volumetric-scan'
	} else if (isRadiologyReportOrExport) {
		family = 'radiology-reports-exports'
		artifactKind = ext === 'pdf' ? 'radiology-report' : 'viewer-export'
	} else if (isDicomdir) {
		artifactKind = 'dicomdir-manifest'
	}

	const patientCohort = extractPatientStudyCohort(basename, path)
	const studySeriesId = extractStudySeriesId(basename, path)
	const modality = extractModalityCode(ext, combinedContext, family)
	const sliceOrRevision = parseSeriesSliceOrRevision(basename, path)
	const medicalSignature = normalizeMedicalSignature(basename)
	const phi = detectPhiRiskState(combinedContext, family, ext)

	const inViewerExportStaging = STAGING_VIEWER_EXPORT_PATH_RE.test(path) || (hasViewerExportSignal && !CANONICAL_PACS_PATH_RE.test(path))
	const inCanonicalPacs = CANONICAL_PACS_PATH_RE.test(path) && !inViewerExportStaging
	const isDicomdirOrSr = isDicomdir || isDicomSr
	const isProtectedSeriesAnchor = (family === 'dicom-imaging-studies' || family === 'neuro-volumetric-nifti')
		&& (inCanonicalPacs || isDicomdirOrSr)
		&& !inViewerExportStaging

	const { imagingSystem, formatBadge } = detectMedicalSystemAndFormat(
		ext,
		modality,
		family,
		isClinicalHold,
		isDicomdirOrSr
	)

	const dirname = getDirname(path)
	const vaultKey = `${patientCohort}/${studySeriesId}/${modality}`

	return {
		path,
		dirname,
		basename,
		ext,
		family,
		artifactKind,
		imagingSystem,
		formatBadge,
		patientCohort,
		studySeriesId,
		modality,
		sliceOrRevision,
		medicalSignature,
		mtimeSec,
		isDicomdir,
		isDicomSr,
		isDicomdirOrSr,
		isClinicalHold,
		isAnonymized: phi.isAnonymized,
		hasPhiRisk: phi.hasPhiRisk,
		phiRiskLevel: phi.phiRiskLevel,
		phiRiskBadge: phi.phiRiskBadge,
		inCanonicalPacs,
		inViewerExportStaging,
		isProtectedSeriesAnchor,
		vaultKey,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "1.45 GB").
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted GB string.
 */
export function formatGigabytes(bytes) {
	const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
	const gb = safe / (1024 * 1024 * 1024)
	return `${gb.toFixed(2)} GB`
}

/**
 * Compute reference timestamp from duplicate groups for deterministic age calculations.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Reference timestamp in epoch seconds.
 */
function resolveReferenceNowSec(duplicateGroups) {
	let maxMtimeSec = 0
	for (const group of duplicateGroups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const mtime = normalizeMtimeSec(file && file.mtime)
			if (mtime > maxMtimeSec) {
				maxMtimeSec = mtime
			}
		}
	}
	return maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000)
}

/**
 * Score a file copy's authority as canonical medical imaging survivor anchor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isClinicalHold) {
		score += 36
	}
	if (member.meta.isDicomdirOrSr) {
		score += 28
	}
	if (member.meta.inCanonicalPacs) {
		score += 22
	}
	if (member.meta.inViewerExportStaging) {
		score -= 28
	}
	if (member.meta.family === 'radiology-reports-exports' && member.meta.artifactKind === 'viewer-export') {
		score -= 14
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'anonymized-deid-first') {
		score += member.meta.isAnonymized ? 20 : -8
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical medical imaging survivor.
 *
 * @param {object} a First member.
 * @param {object} b Second member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}
	if (a.meta.isClinicalHold !== b.meta.isClinicalHold) {
		return a.meta.isClinicalHold ? -1 : 1
	}
	if (survivorRule === 'anonymized-deid-first' && a.meta.isAnonymized !== b.meta.isAnonymized) {
		return a.meta.isAnonymized ? -1 : 1
	}
	if (a.meta.isDicomdirOrSr !== b.meta.isDicomdirOrSr) {
		return a.meta.isDicomdirOrSr ? -1 : 1
	}
	if (a.meta.inCanonicalPacs !== b.meta.inCanonicalPacs) {
		return a.meta.inCanonicalPacs ? -1 : 1
	}
	if (survivorRule === 'shortest-path' && a.meta.path.length !== b.meta.path.length) {
		return a.meta.path.length - b.meta.path.length
	}
	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Medical, DICOM & Health Imaging Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeMedicalDicomVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = MEDICAL_DICOM_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = MEDICAL_DICOM_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = MEDICAL_DICOM_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = MEDICAL_DICOM_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-exports-keep-series'
	const survivorRule = MEDICAL_DICOM_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'pacs-series-clinical-first'

	const protectClinicalHoldAndSr = options.protectClinicalHoldAndSr !== false
	const protectCanonicalPacsSeries = options.protectCanonicalPacsSeries !== false
	const staleExportDays = Number.isFinite(Number(options.staleExportDays)) && Number(options.staleExportDays) >= 0
		? Number(options.staleExportDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: resolveReferenceNowSec(groups)

	const allClusters = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyMedicalDicomFile(file)
			if (!meta) {
				continue
			}
			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const selectionKey = getFileSelectionKey(file)

			const member = {
				file,
				id: file.id ?? file.nodeId ?? selectionKey,
				selectionKey,
				path: meta.path,
				basename: meta.basename,
				size,
				formattedSize: formatBytes(size),
				mtimeSec,
				formattedMtime: formatFileModifiedTime(mtimeSec),
				ageDays,
				isInOriginFolder: Boolean(file.isInOriginFolder),
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length < 2) {
			continue
		}

		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = MEDICAL_DICOM_FAMILY_META[family] || MEDICAL_DICOM_FAMILY_META['dicom-imaging-studies']

		const hasClinicalHold = classifiedMembers.some(m => m.meta.isClinicalHold)
		const hasDicomdirOrSr = classifiedMembers.some(m => m.meta.isDicomdirOrSr)
		const hasProtectedPacsSeries = classifiedMembers.some(m => m.meta.isProtectedSeriesAnchor)
		const hasHighPhiRisk = classifiedMembers.some(m => m.meta.phiRiskLevel === 'high-phi')
		const isFullyAnonymized = classifiedMembers.every(m => m.meta.isAnonymized)
		const hasAnyAnonymized = classifiedMembers.some(m => m.meta.isAnonymized)

		const clusterPhiRiskLevel = isFullyAnonymized
			? 'anonymized'
			: (hasHighPhiRisk ? 'high-phi' : (hasAnyAnonymized ? 'moderate-phi' : primaryMeta.phiRiskLevel))
		const clusterPhiRiskBadge = clusterPhiRiskLevel === 'anonymized'
			? 'Anonymized / De-ID'
			: (clusterPhiRiskLevel === 'high-phi' ? 'PHI Risk: High' : 'PHI Risk: Moderate')

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isClinicalHold) {
					member.verdictReason = 'Immutable Clinical Hold / IRB preservation anchor'
				} else if (member.meta.isDicomdirOrSr) {
					member.verdictReason = `Canonical ${member.meta.formatBadge} study anchor`
				} else if (member.meta.inCanonicalPacs) {
					member.verdictReason = `Primary PACS ${member.meta.studySeriesId} series anchor`
				} else if (member.meta.isAnonymized) {
					member.verdictReason = 'De-identified / anonymized clinical survivor'
				} else {
					member.verdictReason = 'Highest-authority medical imaging survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by clinical data steward'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-pacs-hardlinks'
					? 'consolidate-hardlink-pacs-asset'
					: 'reclaim-duplicate-medical-asset'
				member.actionType = strategy === 'consolidate-pacs-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Steward override: marked for controlled remediation'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				if (member.actionType === 'hardlink') {
					consolidatableCopiesCount += 1
				}
				return
			}

			if (member.isInOriginFolder) {
				member.verdict = 'blocked-origin-folder'
				member.actionType = 'keep'
				member.verdictReason = 'Protected Nextcloud origin folder'
				shieldedCopiesCount += 1
				return
			}

			if (protectClinicalHoldAndSr && member.meta.isClinicalHold) {
				member.verdict = 'blocked-clinical-hold'
				member.actionType = 'keep'
				member.verdictReason = `Clinical Hold / IRB guard active for ${member.meta.patientCohort}`
				shieldedCopiesCount += 1
				return
			}

			if (protectClinicalHoldAndSr && member.meta.isDicomdirOrSr && strategy !== 'consolidate-pacs-hardlinks') {
				member.verdict = 'blocked-dicomdir-sr'
				member.actionType = 'keep'
				member.verdictReason = `${member.meta.formatBadge} integrity shielded (${member.meta.studySeriesId})`
				shieldedCopiesCount += 1
				return
			}

			if (protectCanonicalPacsSeries && member.meta.inCanonicalPacs && strategy !== 'consolidate-pacs-hardlinks') {
				member.verdict = 'blocked-pacs-series'
				member.actionType = 'keep'
				member.verdictReason = `Canonical PACS series shielded for ${member.meta.studySeriesId}`
				shieldedCopiesCount += 1
				return
			}

			if (
				member.meta.inViewerExportStaging
				&& !member.meta.isClinicalHold
				&& member.ageDays < staleExportDays
				&& strategy === 'prune-viewer-exports-only'
			) {
				member.verdict = 'blocked-recent-export'
				member.actionType = 'keep'
				member.verdictReason = `Recent viewer/CD export (${member.ageDays}d < ${staleExportDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			if (strategy === 'consolidate-pacs-hardlinks') {
				member.verdict = 'consolidate-hardlink-pacs-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} PACS anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-viewer-exports-only') {
				if (member.meta.inViewerExportStaging || family === 'radiology-reports-exports') {
					member.verdict = member.meta.inViewerExportStaging
						? 'reclaim-viewer-cd-export'
						: 'reclaim-duplicate-report-export'
					member.actionType = 'prune'
					member.verdictReason = member.meta.inViewerExportStaging
						? 'Redundant PACS viewer, CD/USB burn, or staging export'
						: 'Redundant radiology report or rendered viewer copy'
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside viewer & CD export cleanup scope'
				shieldedCopiesCount += 1
				return
			}

			if (member.meta.inViewerExportStaging) {
				member.verdict = 'reclaim-viewer-cd-export'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant CD/USB burn, viewer cache, or download copy'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'radiology-reports-exports') {
				member.verdict = 'reclaim-duplicate-report-export'
				member.actionType = 'prune'
				member.verdictReason = `Duplicate ${member.meta.imagingSystem} copy`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'hl7-fhir-clinical-records') {
				member.verdict = 'reclaim-duplicate-hl7-fhir'
				member.actionType = 'prune'
				member.verdictReason = 'Duplicate HL7/FHIR clinical payload outside canonical EHR/PACS vault'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (family === 'neuro-volumetric-nifti') {
				member.verdict = 'reclaim-duplicate-nifti-volume'
				member.actionType = 'prune'
				member.verdictReason = 'Redundant NIfTI/BIDS volumetric copy outside canonical vault'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-dicom-slice'
			member.actionType = 'prune'
			member.verdictReason = `Redundant DICOM copy outside shielded ${member.meta.studySeriesId} anchor`
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasClinicalHold) {
				riskState = 'clinical-hold-locked'
				riskPriority = 6
			} else if (hasDicomdirOrSr) {
				riskState = 'dicomdir-sr-protected'
				riskPriority = 5
			} else if (hasProtectedPacsSeries) {
				riskState = 'pacs-series-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (clusterPhiRiskLevel === 'high-phi') {
			riskState = 'phi-high-reclaimable'
			riskPriority = 5
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			patientCohort: primaryMeta.patientCohort,
			studySeriesId: primaryMeta.studySeriesId,
			modality: primaryMeta.modality,
			sliceOrRevision: primaryMeta.sliceOrRevision,
			sliceLabel: primaryMeta.sliceOrRevision > 0 ? `#${primaryMeta.sliceOrRevision}` : 'series-root',
			medicalSignature: primaryMeta.medicalSignature,
			imagingSystem: primaryMeta.imagingSystem,
			formatBadge: primaryMeta.formatBadge,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			hasClinicalHold,
			hasDicomdirOrSr,
			hasProtectedPacsSeries,
			phiRiskLevel: clusterPhiRiskLevel,
			phiRiskBadge: clusterPhiRiskBadge,
			isAnonymized: clusterPhiRiskLevel === 'anonymized',
			riskState,
			riskPriority,
			copiesCount: classifiedMembers.length,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb: formatGigabytes(reclaimableBytes),
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableCopiesCount,
			consolidatableCopiesCount,
			shieldedCopiesCount,
			survivor,
			members: classifiedMembers,
		})
	}

	const familyBreakdown = Object.keys(MEDICAL_DICOM_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: MEDICAL_DICOM_FAMILY_META[famId].label,
			shortLabel: MEDICAL_DICOM_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}
		if (minSizeBytes > 0 && cluster.survivor.size < minSizeBytes) {
			return false
		}
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
				return false
			}
			if (verdictFilter === 'phi-high' && cluster.phiRiskLevel !== 'high-phi') {
				return false
			}
			if (verdictFilter === 'anonymized' && !cluster.isAnonymized) {
				return false
			}
			if (verdictFilter === 'clinical-hold' && !cluster.hasClinicalHold && !cluster.hasDicomdirOrSr) {
				return false
			}
			if (verdictFilter === 'dicom-series' && cluster.family !== 'dicom-imaging-studies') {
				return false
			}
			if (verdictFilter === 'nifti-bids' && cluster.family !== 'neuro-volumetric-nifti') {
				return false
			}
			if (verdictFilter === 'hl7-fhir' && cluster.family !== 'hl7-fhir-clinical-records') {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.patientCohort,
				cluster.studySeriesId,
				cluster.modality,
				cluster.phiRiskBadge,
				cluster.medicalSignature,
				cluster.imagingSystem,
				cluster.formatBadge,
				cluster.vaultKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'phi_risk_desc') {
			const phiWeight = { 'high-phi': 3, 'moderate-phi': 2, anonymized: 1 }
			const diff = (phiWeight[b.phiRiskLevel] || 0) - (phiWeight[a.phiRiskLevel] || 0)
			if (diff !== 0) {
				return diff
			}
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'copies_desc') {
			if (a.copiesCount !== b.copiesCount) {
				return b.copiesCount - a.copiesCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}
		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
			return b.rawDuplicateBytes - a.rawDuplicateBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = filteredClusters.reduce((acc, c) => acc + c.rawDuplicateBytes, 0)
	const totalReclaimableBytes = filteredClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
	const totalFilesCount = filteredClusters.reduce((acc, c) => acc + c.copiesCount, 0)
	const totalReclaimableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.reclaimableCopiesCount, 0)
	const totalConsolidatableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.consolidatableCopiesCount, 0)
	const totalShieldedCopiesCount = filteredClusters.reduce((acc, c) => acc + c.shieldedCopiesCount, 0)
	const totalHighPhiClusters = filteredClusters.filter(c => c.phiRiskLevel === 'high-phi').length
	const totalAnonymizedClusters = filteredClusters.filter(c => c.isAnonymized).length
	const totalClinicalHoldSrClusters = filteredClusters.filter(c => c.hasClinicalHold || c.hasDicomdirOrSr).length
	const totalDicomSeriesClusters = filteredClusters.filter(c => c.family === 'dicom-imaging-studies').length
	const totalNiftiClusters = filteredClusters.filter(c => c.family === 'neuro-volumetric-nifti').length
	const totalHl7FhirClusters = filteredClusters.filter(c => c.family === 'hl7-fhir-clinical-records').length
	const distinctStudiesCount = new Set(filteredClusters.map(c => `${c.patientCohort}/${c.studySeriesId}`)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: MEDICAL_DICOM_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectClinicalHoldAndSr,
			protectCanonicalPacsSeries,
			staleExportDays,
			minSizeMb,
			searchQuery,
		},
		summary: {
			totalClustersCount: filteredClusters.length,
			totalUnfilteredClustersCount: allClusters.length,
			totalFilesCount,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			reclaimableGb: formatGigabytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalConsolidatableCopiesCount,
			totalShieldedCopiesCount,
			totalHighPhiClusters,
			totalAnonymizedClusters,
			totalClinicalHoldSrClusters,
			totalDicomSeriesClusters,
			totalNiftiClusters,
			totalHl7FhirClusters,
			distinctStudiesCount,
			efficiencyPct,
		},
		familyBreakdown,
		clusters: filteredClusters,
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
function shellQuote(value) {
	const str = String(value ?? '')
	return `'${str.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Join Nextcloud data root and normalized artifact path cleanly.
 *
 * @param {string} dataRoot Nextcloud data root directory.
 * @param {string} relPath Artifact path.
 * @return {string} Combined POSIX path.
 */
function joinDataRoot(dataRoot, relPath) {
	const root = String(dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '')
	const cleanRel = safeNormalizePath(relPath).replace(/^\/+/, '')
	return `${root}/${cleanRel}`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for Medical, DICOM & Health Imaging Vault cleanup.
 *
 * @param {object} analysis Output of analyzeMedicalDicomVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildMedicalDicomRemediationScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').trim() || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const summary = (analysis && analysis.summary) || {
		totalClustersCount: 0,
		formattedReclaimableBytes: '0 B',
		reclaimableGb: '0.00 GB',
		totalReclaimableCopiesCount: 0,
	}

	const lines = [
		'#!/usr/bin/env sh',
		'set -eu',
		'# DuplicateFinder Medical, DICOM & Health Imaging Vault Remediation Script',
		`# Schema: ${MEDICAL_DICOM_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
		'# Default is safe dry-run mode. Run with DRY_RUN=0 sh script.sh to apply.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "0" ]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0

	for (const cluster of clusters) {
		const targets = (cluster.members || []).filter(m => m.actionType === 'prune' || m.actionType === 'hardlink')
		if (!targets.length) {
			continue
		}
		const anchorPath = joinDataRoot(dataRoot, cluster.survivor.path)
		lines.push(`# Medical Vault: ${cluster.vaultKey} [${cluster.imagingSystem} / ${cluster.phiRiskBadge}] (${cluster.formattedReclaimableBytes})`)
		lines.push(`# Anchor: ${anchorPath}`)

		for (const target of targets) {
			const targetPath = joinDataRoot(dataRoot, target.path)
			actionCount += 1
			if (target.actionType === 'hardlink') {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd ln -f ${shellQuote(anchorPath)} ${shellQuote(targetPath)}`)
				lines.push('fi')
			} else {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd rm -f ${shellQuote(targetPath)}`)
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable viewer exports or redundant medical imaging copies under current PACS/clinical-hold guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeMedicalDicomVault.
 * @return {string} CSV content.
 */
export function buildMedicalDicomCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'PatientCohort',
		'StudySeriesId',
		'Modality',
		'PhiRiskLevel',
		'Anonymized',
		'ImagingSystem',
		'Family',
		'Format',
		'ClinicalHoldGuard',
		'PacsSeriesGuard',
		'Verdict',
		'Action',
		'AuthorityScore',
		'SizeBytes',
		'Path',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			rows.push([
				cluster.patientCohort,
				cluster.studySeriesId,
				cluster.modality,
				member.meta.phiRiskLevel,
				member.meta.isAnonymized ? 'yes' : 'no',
				cluster.imagingSystem,
				cluster.family,
				cluster.formatBadge,
				member.meta.isClinicalHold || member.meta.isDicomdirOrSr ? 'yes' : 'no',
				member.meta.inCanonicalPacs ? 'yes' : 'no',
				member.verdict,
				member.actionType,
				String(member.authorityScore),
				String(member.size),
				member.path,
				member.verdictReason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit manifest.
 *
 * @param {object} analysis Output of analyzeMedicalDicomVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMedicalDicomJsonReport(analysis) {
	const payload = {
		schema: MEDICAL_DICOM_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			patientCohort: cluster.patientCohort,
			studySeriesId: cluster.studySeriesId,
			modality: cluster.modality,
			imagingSystem: cluster.imagingSystem,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			phiRiskLevel: cluster.phiRiskLevel,
			phiRiskBadge: cluster.phiRiskBadge,
			isAnonymized: cluster.isAnonymized,
			hasClinicalHold: cluster.hasClinicalHold,
			hasDicomdirOrSr: cluster.hasDicomdirOrSr,
			hasProtectedPacsSeries: cluster.hasProtectedPacsSeries,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				phiRiskLevel: m.meta.phiRiskLevel,
				isAnonymized: m.meta.isAnonymized,
				authorityScore: m.authorityScore,
				verdict: m.verdict,
				actionType: m.actionType,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for transient PACS viewer caches and partial DICOM/NIfTI transfers.
 *
 * @param {object} analysis Output of analyzeMedicalDicomVault.
 * @return {string} Sync exclude rules.
 */
export function buildMedicalDicomSyncExcludeSnippet(analysis) {
	const dicomCount = analysis && analysis.summary ? analysis.summary.totalDicomSeriesClusters : 0
	const highPhiCount = analysis && analysis.summary ? analysis.summary.totalHighPhiClusters : 0
	return [
		'# DuplicateFinder Medical, DICOM & Health Imaging Vault Sync Exclusions',
		`# Detected DICOM clusters: ${dicomCount} | High PHI exposure clusters: ${highPhiCount}`,
		'*.dcm.tmp',
		'*.part.nii',
		'*.nii.gz.part',
		'*.lock.fhir',
		'OsiriX Data/.tmp*',
		'Horos/.cache*',
		'RadiAnt/*.tmp',
		'Orthanc/*.wal',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
