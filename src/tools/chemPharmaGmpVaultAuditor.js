/**
 * Pure Chemical Process, Chromatography (LC-MS/NMR), Spectroscopy & Pharma GMP Compliance Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Chemical & Pharma GMP Vault families:
 * - GMP Batch Records, COA & 21 CFR Part 11 (.part11, .alcoa, .elnb, .meth, .lcm, .lpd, .chem, .ebr, .qams, .cdxml, .rxn, .mol, .sdf, 21 CFR 11 / COA / Stability)
 * - Compressed mzML, JCAMP-DX & NMR Masters (.mzml, .mzml.gz, .mzml.zst, .mzxml, .imzml, .jdx, .dx, .nmredata, .xrdml, .brml, .cif, .spc, .wiff2, .baf, .tdf, .lcd, .qgd)
 * - Raw Vendor Dumps & CSV/MGF Peak Exports (.mgf, .ms2, .dta, .apl, .pkl, .csv, .tsv, .txt, .xlsx, .asc, .xy, .dat in LC-MS/HPLC/NMR/FTIR/XRD/pharma context)
 * - Instrument Acquisition & msconvert Scratch (empower_tmp/, chemstation_tmp/, xcalibur_tmp/, masshunter_tmp/, topspin_tmp/, msconvert_tmp/, proteowizard_tmp/, acq_scratch/, .mzml.tmp, .lck, .tmp)
 *
 * Enforces strict 21 CFR Part 11, GMP COA, OOS/stability, and open compressed spectral anchor defaults:
 * - Strictly conserves 21 CFR Part 11 audit trails, signed COAs, validated analytical methods, and chemical structures
 * - Strictly conserves open/compressed mzML/mzXML/JCAMP-DX/NMReDATA/XRDML/CIF/WIFF2 spectral masters
 * - Detects redundant MGF/MS2/CSV/XY peak exports when a verified .mzml/.jdx/.nmredata/.xrdml anchor exists
 * - Blocks deletion of raw peak/spectrum exports lacking a verified compressed/open master anchor when guard is active
 * - Blocks hardlinks on mutable GMP/method/CSV/MGF files and instrument acquisition scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const CHEM_PHARMA_GMP_VAULT_SCHEMA = 'duplicatefinder.chem-pharma-gmp-vault-auditor.v1'

export const CHEM_PHARMA_GMP_FAMILIES = Object.freeze([
	'all',
	'gmp-batch-records-sop',
	'compressed-spectroscopy-ms',
	'raw-vendor-peak-exports',
	'instrument-acquisition-scratch',
])

export const CHEM_PHARMA_GMP_FAMILY_META = Object.freeze({
	'gmp-batch-records-sop': {
		id: 'gmp-batch-records-sop',
		label: 'GMP & 21 CFR Part 11',
		shortLabel: 'GMP, Methods & 21 CFR Part 11 (.part11, .alcoa, .elnb, .meth, .cdxml, COA)',
	},
	'compressed-spectroscopy-ms': {
		id: 'compressed-spectroscopy-ms',
		label: 'mzML, JCAMP & NMR',
		shortLabel: 'Compressed Masters (.mzml, .mzml.zst, .jdx, .nmredata, .xrdml, .cif, .wiff2)',
	},
	'raw-vendor-peak-exports': {
		id: 'raw-vendor-peak-exports',
		label: 'Raw Peak / CSV / MGF',
		shortLabel: 'Raw Exports (.mgf, .ms2, .csv, .xy, .asc, .txt, .xlsx)',
	},
	'instrument-acquisition-scratch': {
		id: 'instrument-acquisition-scratch',
		label: 'Instrument & msconvert',
		shortLabel: 'Lab Scratch (empower_tmp/, chemstation_tmp/, topspin_tmp/, msconvert_tmp/, .lck)',
	},
})

export const CHEM_PHARMA_GMP_STRATEGIES = Object.freeze([
	'prune-peak-exports-and-instrument-scratch',
	'hardlink-immutable-mzml-and-jdx',
	'quarantine-peak-exports-and-scratch',
])

export const CHEM_PHARMA_GMP_SURVIVOR_RULES = Object.freeze([
	'gmp-mzml-first',
	'oldest-injection-first',
	'newest-method-revision-first',
	'shortest-path',
])

export const CHEM_PHARMA_GMP_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'gmp-part11-protected',
	'spectra-archive-protected',
	'oos-stability-protected',
	'peak-export-redundant',
	'instrument-scratch-intermediate',
	'shielded',
])

export const CHEM_PHARMA_GMP_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const CHEM_PHARMA_GMP_PRESETS = Object.freeze([
	{
		id: 'all-chem-pharma-audit',
		name: 'All Chem & Pharma GMP Vaults',
		description: 'Audit 21 CFR Part 11 / GMP batch COAs, validated methods (.meth/.elnb/.cdxml), compressed mzML/JCAMP-DX/NMReDATA/XRDML masters, raw MGF/CSV peak exports, and Empower/ChemStation scratch.',
		familyFilter: 'all',
		strategy: 'prune-peak-exports-and-instrument-scratch',
		survivorRule: 'gmp-mzml-first',
		protectGmpAndPart11: true,
		protectCompressedSpectraAnchors: true,
		protectOosStabilityEvidence: true,
		requireSpectraAnchorForPrune: true,
		keepRecentAcqRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'instrument-scratch-cleanup',
		name: 'Instrument & msconvert Scratch',
		description: 'Reclaim empower_tmp/, chemstation_tmp/, xcalibur_tmp/, topspin_tmp/, proteowizard_tmp/, msconvert_tmp/, and .mzml.tmp/.lck scratch older than the active run grace window.',
		familyFilter: 'all',
		strategy: 'prune-peak-exports-and-instrument-scratch',
		survivorRule: 'gmp-mzml-first',
		protectGmpAndPart11: true,
		protectCompressedSpectraAnchors: true,
		protectOosStabilityEvidence: true,
		requireSpectraAnchorForPrune: true,
		keepRecentAcqRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'peak-csv-mgf-vs-mzml-audit',
		name: 'Redundant .mgf/.csv vs .mzml',
		description: 'Detect uncompressed mass-spec peak lists (.mgf/.ms2) and chromatography CSV/XY exports backed by a verified .mzml, .mzml.zst, .mzxml, .jdx, or .nmredata anchor.',
		familyFilter: 'raw-vendor-peak-exports',
		strategy: 'quarantine-peak-exports-and-scratch',
		survivorRule: 'gmp-mzml-first',
		protectGmpAndPart11: true,
		protectCompressedSpectraAnchors: true,
		protectOosStabilityEvidence: true,
		requireSpectraAnchorForPrune: true,
		keepRecentAcqRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'spectroscopy-nmr-xrd-audit',
		name: 'NMR/FTIR/XRD .xy vs .jdx/.xrdml',
		description: 'Audit redundant ASCII .xy/.asc/.csv spectral exports paired with canonical JCAMP-DX (.jdx/.dx), NMReDATA (.nmredata), XRDML (.xrdml), or Galactic SPC masters.',
		familyFilter: 'all',
		strategy: 'quarantine-peak-exports-and-scratch',
		survivorRule: 'gmp-mzml-first',
		protectGmpAndPart11: true,
		protectCompressedSpectraAnchors: true,
		protectOosStabilityEvidence: true,
		requireSpectraAnchorForPrune: true,
		keepRecentAcqRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'gmp-21cfr11-coa-shield',
		name: '21 CFR Part 11 & GMP COA Shield',
		description: 'Inspect signed COAs, 21 CFR Part 11 audit trails, OOS/ICH stability evidence, validated LIMS methods, and chemical synthesis structures under strict regulatory preservation.',
		familyFilter: 'gmp-batch-records-sop',
		strategy: 'hardlink-immutable-mzml-and-jdx',
		survivorRule: 'gmp-mzml-first',
		protectGmpAndPart11: true,
		protectCompressedSpectraAnchors: true,
		protectOosStabilityEvidence: true,
		requireSpectraAnchorForPrune: true,
		keepRecentAcqRunDays: 0,
		minSizeKb: 0,
	},
])

export const CHEM_PHARMA_GMP_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-chem-pharma-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-peak-exports-and-instrument-scratch',
	survivorRule: 'gmp-mzml-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectGmpAndPart11: true,
	protectCompressedSpectraAnchors: true,
	protectOosStabilityEvidence: true,
	requireSpectraAnchorForPrune: true,
	keepRecentAcqRunDays: 0,
	minSizeKb: 0,
})

const STRICT_GMP_PART11_EXT_RE = /\.(?:part11|alcoa|elnb|meth|lcm|lpd|chem|ebr|qams)$/i
const CONTEXT_GMP_PART11_EXT_RE = /\.(?:cdxml|rxn|mol|sdf|xml|json)$/i
const GMP_DOC_EXT_RE = /\.(?:pdf|docx|xlsx|json|xml)$/i

const COMPRESSED_SPECTRA_EXT_RE = /\.(?:mzml\.gz|mzml\.zst|mzxml\.gz|mzxml\.zst|nmr\.tar\.zst|nmr\.tar\.gz|imzml\.gz|mzml|mzxml|mzid|imzml|ibd|jdx|dx|jcamp|nmredata|xrdml|brml|spc|wiff2|baf|tdf|lcd|qgd)$/i
const CONTEXT_SPECTRA_EXT_RE = /\.(?:cif|cdf|andims|wiff|h5|hdf5|parquet)$/i

const STRICT_RAW_PEAK_EXPORT_EXT_RE = /\.(?:mgf|ms2)$/i
const CONTEXT_RAW_PEAK_EXPORT_EXT_RE = /\.(?:dta|apl|pkl|csv|tsv|txt|xlsx|asc|xy|dat)$/i

const STRICT_INSTRUMENT_SCRATCH_EXT_RE = /\.(?:mzml\.tmp|wiff\.scan\.tmp|fid\.tmp|ser\.tmp|autosave|lck|lock)$/i
const CONTEXT_INSTRUMENT_SCRATCH_EXT_RE = /\.(?:bak|tmp|log)$/i

const MUTABLE_CHEM_EXT_RE = /\.(?:part11|alcoa|elnb|meth|lcm|lpd|chem|ebr|qams|xml|json|pdf|docx|xlsx|cdxml|rxn|mol|sdf|mgf|ms2|dta|apl|pkl|csv|tsv|txt|asc|xy|dat|bak|tmp|log|lck|lock|autosave)$/i

const CHEM_PHARMA_CONTEXT_RE = /(?:chem|pharma|gmp|cgmp|21[_-]?cfr[_-]?11|annex[_-]?11|alcoa|coa|batch[_-]?release|stability|ich[_-]?q1|oos|capa|lims|eln|hplc|uhplc|lcms|lc-ms|gcms|gc-ms|msms|mass[_-]?spec|orbitrap|qtof|timstof|nmr|1h[_-]?nmr|13c[_-]?nmr|ftir|raman|xrd|xrf|icpms|chromatogra|spectroscop|empower|chemstation|xcalibur|masshunter|chromeleon|topspin|mestrenova|proteowizard|msconvert|mzml|jcamp|assay|dissolution|impurity|api[_-]?lot)/i

const INSTRUMENT_SCRATCH_PATH_RE = /(?:^|\/)(?:empower_tmp|chemstation_tmp|xcalibur_tmp|masshunter_tmp|chromeleon_tmp|topspin_tmp|mestrenova_tmp|openchrom_cache|proteowizard_tmp|msconvert_tmp|acq_scratch|peak_cache|chromatogram_tmp|nmr_scratch|scratch|tmp|temp|cache)(?:\/|$)/i
const GMP_PATH_RE = /(?:^|\/)(?:21[_-]?cfr[_-]?11|annex[_-]?11|gmp|cgmp|alcoa|coa|batch[_-]?release|iq[_-]?oq[_-]?pq|method[_-]?validation|stability|ich[_-]?q1|oos[_-]?investigation|capa|regulatory|qa[_-]?signoff)(?:\/|$)/i
const OOS_STABILITY_PATH_RE = /(?:^|\/)(?:oos[_-]?investigation|stability|ich[_-]?q1|batch[_-]?release|coa|21[_-]?cfr[_-]?11|annex[_-]?11|capa|deviations)(?:\/|$)/i
const CANONICAL_VAULT_PATH_RE = /(?:^|\/)(?:00_gmp|gmp[_-]?vault|pharma[_-]?vault|mzml[_-]?vault|spectra[_-]?archive|nmr[_-]?masters|lims[_-]?archive|archive|vault|canonical|golden[_-]?method|validated[_-]?methods)(?:\/|$)/i

const ANY_CHEM_PHARMA_EXT_RE = /\.(?:mzml\.gz|mzml\.zst|mzxml\.gz|mzxml\.zst|nmr\.tar\.zst|nmr\.tar\.gz|imzml\.gz|mzml\.tmp|wiff\.scan\.tmp|fid\.tmp|ser\.tmp|part11|alcoa|elnb|meth|lcm|lpd|chem|ebr|qams|cdxml|rxn|mol|sdf|mzml|mzxml|mzid|imzml|ibd|jdx|dx|jcamp|nmredata|xrdml|brml|spc|wiff2|wiff|baf|tdf|lcd|qgd|cif|cdf|andims|h5|hdf5|parquet|mgf|ms2|dta|apl|pkl|csv|tsv|txt|xlsx|asc|xy|dat|autosave|lck|lock|bak|tmp|log)$/i

const GENERIC_CHEM_STEMS = new Set([
	'spectrum',
	'spectra',
	'chromatogram',
	'peaklist',
	'peaks',
	'injection',
	'sample',
	'blank',
	'std',
	'standard',
	'qc',
	'assay',
	'batch',
	'lot',
	'coa',
	'method',
	'data',
	'export',
	'run',
	'test',
])

const NOISE_PARENT_DIRS = new Set([
	'empower_tmp',
	'chemstation_tmp',
	'xcalibur_tmp',
	'masshunter_tmp',
	'chromeleon_tmp',
	'topspin_tmp',
	'mestrenova_tmp',
	'openchrom_cache',
	'proteowizard_tmp',
	'msconvert_tmp',
	'acq_scratch',
	'peak_cache',
	'chromatogram_tmp',
	'nmr_scratch',
	'scratch',
	'tmp',
	'temp',
	'cache',
	'exports',
	'csv_export',
	'mgf_export',
])

/**
 * Normalize a non-negative integer value safely within bounds.
 *
 * @param {*} value Candidate numeric input.
 * @param {number} fallback Default fallback.
 * @param {number} [max] Upper bound.
 * @return {number} Clamped non-negative integer.
 */
function normalizeNonNegativeInt(value, fallback, max = 1000000) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) {
		return fallback
	}
	return Math.min(max, Math.floor(num))
}

/**
 * Normalize audit configuration against presets and safe bounds.
 *
 * @param {object} [raw] Raw configuration object.
 * @return {object} Normalized configuration.
 */
export function normalizeChemPharmaGmpConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = CHEM_PHARMA_GMP_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...CHEM_PHARMA_GMP_DEFAULT_CONFIG, ...preset }
		: { ...CHEM_PHARMA_GMP_DEFAULT_CONFIG }

	const familyFilter = CHEM_PHARMA_GMP_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = CHEM_PHARMA_GMP_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = CHEM_PHARMA_GMP_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = CHEM_PHARMA_GMP_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = CHEM_PHARMA_GMP_SORT_MODES.includes(input.sortMode)
		? input.sortMode
		: base.sortMode

	const memberOverrides = input.memberOverrides && typeof input.memberOverrides === 'object'
		? { ...input.memberOverrides }
		: {}

	return {
		presetId: preset ? preset.id : base.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery.trim() : '',
		protectGmpAndPart11: typeof input.protectGmpAndPart11 === 'boolean'
			? input.protectGmpAndPart11
			: base.protectGmpAndPart11,
		protectCompressedSpectraAnchors: typeof input.protectCompressedSpectraAnchors === 'boolean'
			? input.protectCompressedSpectraAnchors
			: base.protectCompressedSpectraAnchors,
		protectOosStabilityEvidence: typeof input.protectOosStabilityEvidence === 'boolean'
			? input.protectOosStabilityEvidence
			: base.protectOosStabilityEvidence,
		requireSpectraAnchorForPrune: typeof input.requireSpectraAnchorForPrune === 'boolean'
			? input.requireSpectraAnchorForPrune
			: base.requireSpectraAnchorForPrune,
		keepRecentAcqRunDays: normalizeNonNegativeInt(input.keepRecentAcqRunDays, base.keepRecentAcqRunDays, 3650),
		minSizeKb: normalizeNonNegativeInt(input.minSizeKb, base.minSizeKb, 10000000),
		memberOverrides,
	}
}

/**
 * Extract basename from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const parts = String(normalizedPath || '').split('/')
	return parts[parts.length - 1] || ''
}

/**
 * Extract directory portion from normalized filesystem path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Directory path.
 */
function extractDirname(normalizedPath) {
	const idx = String(normalizedPath || '').lastIndexOf('/')
	return idx > 0 ? String(normalizedPath).slice(0, idx) : ''
}

/**
 * Parse file mtime into epoch milliseconds when available.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch ms or null.
 */
function extractMtimeMs(file) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return null
	}
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 1e12 ? raw : raw * 1000
	}
	const parsed = Date.parse(String(raw))
	return Number.isFinite(parsed) ? parsed : null
}

/**
 * Extract meaningful batch, assay, or analytical campaign folder from path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulCampaignFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (!NOISE_PARENT_DIRS.has(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect Chromatography, Spectroscopy, or Pharma GMP toolchain and workflow stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ labToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
export function extractLabToolchainAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()
	const combined = `${lowerPath}/${lowerBase}`

	let labToolchain = 'Chem & Pharma GMP Vault'
	if (/empower|waters|masslynx|\.(?:lpd|meth)$/i.test(combined)) {
		labToolchain = 'Waters Empower / MassLynx'
	} else if (/chemstation|masshunter|agilent|\.(?:chem)$/i.test(combined)) {
		labToolchain = 'Agilent ChemStation / MassHunter'
	} else if (/xcalibur|chromeleon|thermo|orbitrap/i.test(combined)) {
		labToolchain = 'Thermo Xcalibur / Chromeleon'
	} else if (/topspin|mestrenova|bruker|timstof|\.(?:nmredata|baf|tdf|brml)$/i.test(combined)) {
		labToolchain = 'Bruker TopSpin / timsTOF / XRD'
	} else if (/sciex|analyst|\.(?:wiff2|wiff)$/i.test(combined)) {
		labToolchain = 'SCIEX Analyst / OS'
	} else if (/shimadzu|labsolutions|\.(?:lcd|qgd|lcm)$/i.test(combined)) {
		labToolchain = 'Shimadzu LabSolutions'
	} else if (/proteowizard|msconvert|openchrom|\.(?:mzml(?:\.(?:gz|zst))?|mzxml(?:\.(?:gz|zst))?|mgf|jdx|dx)$/i.test(combined)) {
		labToolchain = 'ProteoWizard mzML / JCAMP-DX'
	} else if (/21[_-]?cfr[_-]?11|annex[_-]?11|gmp|cgmp|alcoa|coa|stability|oos/i.test(combined)) {
		labToolchain = '21 CFR Part 11 / GMP QA'
	}

	let workflowStage = ''
	if (OOS_STABILITY_PATH_RE.test(lowerPath)) {
		workflowStage = 'OOS / Stability & Batch Release Evidence'
	} else if (STRICT_GMP_PART11_EXT_RE.test(lowerBase) || (GMP_PATH_RE.test(lowerPath) && GMP_DOC_EXT_RE.test(lowerBase)) || (CONTEXT_GMP_PART11_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		workflowStage = 'Validated Method & 21 CFR Part 11 Baseline'
	} else if (COMPRESSED_SPECTRA_EXT_RE.test(lowerBase) || (CONTEXT_SPECTRA_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		workflowStage = 'Compressed mzML / JCAMP-DX / NMR Master'
	} else if (STRICT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase) || (CONTEXT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		workflowStage = 'Raw Peak List / CSV / MGF Export'
	} else if (INSTRUMENT_SCRATCH_PATH_RE.test(lowerPath) || STRICT_INSTRUMENT_SCRATCH_EXT_RE.test(lowerBase)) {
		workflowStage = 'Instrument / msconvert Scratch & Lock'
	}

	return { labToolchain, workflowStage }
}

/**
 * Extract normalized analytical run stem to correlate .mgf/.ms2/.csv/.xy exports
 * against verified .mzml/.mzml.zst/.mzxml/.jdx/.nmredata/.xrdml anchors.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for batch/assay folder context.
 * @return {string} Normalized analytical run stem.
 */
export function extractChemRunStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_CHEM_PHARMA_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|ascii|csv|mgf|peaks|peaklist|centroids|deconvoluted|exported|uncompressed|dump|mirror|copy\d*|tmp|temp|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_CHEM_STEMS.has(stem)) {
		const campaignFolder = extractMeaningfulCampaignFolder(normalizedPath)
		if (campaignFolder) {
			return `${campaignFolder}_${stem || 'chem'}`
		}
	}

	return stem || 'unknown-chem-run'
}

/**
 * Extract broader analytical assay anchor key (stripping injection, replicate, and fraction suffixes).
 *
 * @param {string} runStem Normalized run stem.
 * @return {string} Assay anchor key.
 */
export function extractSpectraAnchorKey(runStem) {
	return String(runStem || '')
		.replace(/(?:[-_.](?:inj\d+|rep\d+|frac\d+|scan\d+|part\d+|run\d+|\d{1,4}))+$/i, '')
		|| 'unknown-chem-run'
}

/**
 * Extract concise Chem/Pharma GMP artifact tag for UI badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Chem/Pharma GMP tag.
 */
function extractChemPharmaTag(lowerBase, lowerPath) {
	if (OOS_STABILITY_PATH_RE.test(lowerPath)) {
		return 'oos-stability-gmp-evidence'
	}
	if (STRICT_GMP_PART11_EXT_RE.test(lowerBase) || (GMP_PATH_RE.test(lowerPath) && GMP_DOC_EXT_RE.test(lowerBase)) || (CONTEXT_GMP_PART11_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		return 'gmp-part11-method-coa'
	}
	if (COMPRESSED_SPECTRA_EXT_RE.test(lowerBase) || (CONTEXT_SPECTRA_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		return 'mzml-jcamp-nmr-master'
	}
	if (STRICT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase) || (CONTEXT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase) && CHEM_PHARMA_CONTEXT_RE.test(lowerPath))) {
		return 'raw-peak-csv-mgf-export'
	}
	if (STRICT_INSTRUMENT_SCRATCH_EXT_RE.test(lowerBase) || INSTRUMENT_SCRATCH_PATH_RE.test(lowerPath)) {
		return 'instrument-acq-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Chemical Process, Chromatography & Pharma GMP Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyChemPharmaGmpFile(file, referenceNowMs = Date.now()) {
	const rawPath = file?.path || file?.name || ''
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const dirname = extractDirname(normalized)
	const size = Math.max(0, Number(file?.size) || 0)
	const mtimeMs = extractMtimeMs(file)
	const formattedMtime = mtimeMs !== null ? formatFileModifiedTime(mtimeMs / 1000) : ''
	const ageDays = mtimeMs !== null ? Math.max(0, (referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)) : null

	const hasChemPharmaContext = CHEM_PHARMA_CONTEXT_RE.test(lower)
	const isInstrumentScratchPath = INSTRUMENT_SCRATCH_PATH_RE.test(lower)
	const isGmpPath = GMP_PATH_RE.test(lower) && !isInstrumentScratchPath
	const isOosStabilityPath = OOS_STABILITY_PATH_RE.test(lower) && !isInstrumentScratchPath
	const isCanonicalVaultPath = (CANONICAL_VAULT_PATH_RE.test(lower) || isGmpPath) && !isInstrumentScratchPath

	const isStrictGmpPart11 = STRICT_GMP_PART11_EXT_RE.test(lowerBase)
	const isContextGmpPart11 = CONTEXT_GMP_PART11_EXT_RE.test(lowerBase) && (hasChemPharmaContext || isGmpPath)
	const isGmpDoc = isGmpPath && GMP_DOC_EXT_RE.test(lowerBase)

	const isStrictCompressedSpectra = COMPRESSED_SPECTRA_EXT_RE.test(lowerBase)
	const isContextCompressedSpectra = CONTEXT_SPECTRA_EXT_RE.test(lowerBase) && hasChemPharmaContext

	const isStrictRawPeak = STRICT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase)
	const isContextRawPeak = !isStrictCompressedSpectra
		&& !isContextCompressedSpectra
		&& !isGmpDoc
		&& !isContextGmpPart11
		&& CONTEXT_RAW_PEAK_EXPORT_EXT_RE.test(lowerBase)
		&& hasChemPharmaContext

	const isStrictScratchExt = STRICT_INSTRUMENT_SCRATCH_EXT_RE.test(lowerBase) && (hasChemPharmaContext || isInstrumentScratchPath)
	const isContextScratch = (isInstrumentScratchPath && (hasChemPharmaContext || ANY_CHEM_PHARMA_EXT_RE.test(lowerBase)))
		|| (CONTEXT_INSTRUMENT_SCRATCH_EXT_RE.test(lowerBase) && hasChemPharmaContext)

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedGmp = false
	let isProtectedCompressedSpectra = false
	let isProtectedOosStability = false
	let isCompressedSpectraAnchor = false
	let isRawPeakExport = false
	const isMutableFile = MUTABLE_CHEM_EXT_RE.test(lowerBase)

	if (isStrictGmpPart11 || isContextGmpPart11 || isGmpDoc) {
		family = 'gmp-batch-records-sop'
		isProtectedGmp = !isInstrumentScratchPath
		isProtectedOosStability = isOosStabilityPath
		if (isGmpDoc || /\.(?:part11|alcoa|ebr|qams)$/i.test(lowerBase)) {
			artifactKind = '21 CFR Part 11 / COA / GMP Batch Record'
			vaultRole = isInstrumentScratchPath ? 'Scratch GMP Copy' : 'Conserved GMP Regulatory Vault'
		} else if (/\.(?:cdxml|rxn|mol|sdf)$/i.test(lowerBase)) {
			artifactKind = 'Chemical Structure & Synthesis Schema (.cdxml/.mol/.sdf)'
			vaultRole = isInstrumentScratchPath ? 'Scratch Synthesis Copy' : 'Canonical Chemistry Structure Vault'
		} else {
			artifactKind = 'Validated Analytical Method & ELN (.meth/.elnb/.lcm/.lpd)'
			vaultRole = isInstrumentScratchPath ? 'Scratch Method Copy' : 'Canonical Validated Method Baseline'
		}
	} else if (isStrictCompressedSpectra || isContextCompressedSpectra) {
		family = 'compressed-spectroscopy-ms'
		isCompressedSpectraAnchor = !isInstrumentScratchPath
		isProtectedCompressedSpectra = !isInstrumentScratchPath
		isProtectedOosStability = isOosStabilityPath
		if (/\.(?:jdx|dx|jcamp|nmredata|nmr\.tar\.(?:gz|zst)|spc)$/i.test(lowerBase)) {
			artifactKind = 'JCAMP-DX / NMReDATA / SPC Spectroscopy Master'
			vaultRole = isInstrumentScratchPath ? 'Scratch Spectroscopy Copy' : 'Canonical NMR / IR Spectroscopy Vault'
		} else if (/\.(?:xrdml|brml|cif)$/i.test(lowerBase)) {
			artifactKind = 'Crystallography & XRD Diffraction Master (.xrdml/.cif)'
			vaultRole = isInstrumentScratchPath ? 'Scratch Diffraction Copy' : 'Canonical XRD / CIF Vault'
		} else {
			artifactKind = 'Open / Compressed MS Chromatography Master (.mzml/.mzxml/.wiff2)'
			vaultRole = isInstrumentScratchPath ? 'Scratch mzML Copy' : 'Canonical mzML / MS Archive Vault'
		}
	} else if (isStrictRawPeak || isContextRawPeak) {
		family = 'raw-vendor-peak-exports'
		isProtectedOosStability = isOosStabilityPath
		isRawPeakExport = true
		if (isStrictRawPeak || /\.(?:dta|apl|pkl)$/i.test(lowerBase)) {
			artifactKind = 'Uncompressed MS Peak List (.mgf/.ms2/.dta/.apl)'
			vaultRole = isInstrumentScratchPath ? 'Scratch Peak List' : 'Redundant Peak List Export Copy'
		} else {
			artifactKind = 'Re-Exported Spectral / Assay Table (.csv/.xy/.asc/.xlsx)'
			vaultRole = isInstrumentScratchPath ? 'Scratch Spectral CSV/XY' : 'Uncompressed Spectral/Assay Export Copy'
		}
	} else if (isStrictScratchExt || isContextScratch) {
		family = 'instrument-acquisition-scratch'
		artifactKind = isStrictScratchExt
			? 'Instrument Lock / Partial Acquisition (.mzml.tmp/.fid.tmp/.lck)'
			: 'Workstation Acquisition Cache (empower_tmp/, chemstation_tmp/, msconvert_tmp/)'
		vaultRole = 'Empower / ChemStation / TopSpin / msconvert Scratch'
	}

	const { labToolchain, workflowStage } = extractLabToolchainAndStage(normalized, basename)
	const runStem = extractChemRunStem(basename, normalized)
	const spectraAnchorKey = extractSpectraAnchorKey(runStem)
	const campaignFolder = extractMeaningfulCampaignFolder(normalized)
	const chemTag = extractChemPharmaTag(lowerBase, lower)

	return {
		normalized,
		lower,
		basename,
		dirname,
		size,
		mtimeMs,
		formattedMtime,
		ageDays,
		family,
		artifactKind,
		vaultRole,
		labToolchain,
		workflowStage,
		runStem,
		spectraAnchorKey,
		campaignFolder,
		chemTag,
		isProtectedGmp,
		isProtectedCompressedSpectra,
		isProtectedOosStability,
		isCompressedSpectraAnchor,
		isRawPeakExport,
		isMutableFile,
		isInstrumentScratchPath: isInstrumentScratchPath || isStrictScratchExt,
		isGmpPath,
		isOosStabilityPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Chemical Process & Pharma GMP Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isChemPharmaGmpGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyChemPharmaGmpFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified mzML/mzXML/JCAMP-DX/NMReDATA/XRDML masters
 * to uncompressed MGF/MS2/CSV/XY peak and spectrum exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildChemPharmaGmpCorrelationIndex(groups) {
	const compressedStems = new Set()
	const compressedAnchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyChemPharmaGmpFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedSpectraAnchor) {
				compressedStems.add(meta.runStem)
				compressedAnchorKeys.add(meta.spectraAnchorKey)
			}
		}
	}

	return {
		compressedStems,
		compressedAnchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Chem/Pharma GMP cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'gmp-batch-records-sop')) {
		return 'gmp-batch-records-sop'
	}
	if (members.some(m => m.family === 'compressed-spectroscopy-ms')) {
		return 'compressed-spectroscopy-ms'
	}
	if (members.some(m => m.family === 'raw-vendor-peak-exports')) {
		return 'raw-vendor-peak-exports'
	}
	return 'instrument-acquisition-scratch'
}

/**
 * Compute deterministic survivor priority score for a Chem/Pharma GMP vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-injection-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedOosStability ? 100000 : 0)
			+ (member.isProtectedGmp ? 97000 : 0)
			+ (member.isProtectedCompressedSpectra ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isInstrumentScratchPath ? -55000 : 0)
			+ (member.isRawPeakExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-method-revision-first') {
		return (member.isProtectedOosStability ? 100000 : 0)
			+ (member.isProtectedGmp ? 97000 : 0)
			+ (member.isProtectedCompressedSpectra ? 94000 : 0)
			+ (member.isInstrumentScratchPath ? -50000 : 0)
			+ (member.isRawPeakExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedOosStability ? 52000 : 0)
			+ (member.isProtectedGmp ? 50000 : 0)
			+ (member.isProtectedCompressedSpectra ? 48000 : 0)
			+ (member.isInstrumentScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedOosStability ? 100000 : 0)
		+ (member.isProtectedGmp ? 97000 : 0)
		+ (member.isProtectedCompressedSpectra ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRawPeakExport ? -45000 : 0)
		+ (member.isInstrumentScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Chemical Process, Chromatography & Pharma GMP duplicate cluster.
 *
 * @param {object} group Duplicate group.
 * @param {object} correlationIndex Cross-group correlation index.
 * @param {object} config Normalized configuration.
 * @param {number} referenceNowMs Reference epoch ms.
 * @return {object|null} Audited cluster entry or null if outside domain.
 */
function auditSingleCluster(group, correlationIndex, config, referenceNowMs) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const rawMembers = group.files.map((file, index) => {
		const meta = classifyChemPharmaGmpFile(file, referenceNowMs)
		if (!meta.family) {
			return null
		}
		return {
			...meta,
			id: file?.id ?? null,
			key: getFileSelectionKey(file) ?? `member-${index}`,
			file,
			index,
		}
	}).filter(Boolean)

	if (rawMembers.length === 0) {
		return null
	}

	const family = resolveClusterFamily(rawMembers)
	const primaryName = rawMembers[0].basename || group.hash || `cluster-${group.id}`
	const primaryToolchain = rawMembers.find(m => m.labToolchain)?.labToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractChemRunStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].spectraAnchorKey || extractSpectraAnchorKey(primaryStem)

	const hasCompressedSpectraAnchor = Boolean(
		rawMembers.some(m => m.isCompressedSpectraAnchor)
		|| correlationIndex.compressedStems.has(primaryStem)
		|| correlationIndex.compressedAnchorKeys.has(primaryAnchorKey)
	)

	const info = computeGroupReclaimableInfo(group)
	const totalBytes = Number(info.totalBytes) || rawMembers.reduce((sum, item) => sum + item.size, 0)
	const unitBytes = Number(info.unitBytes) || (rawMembers[0]?.size || 0)

	const sortedForSurvivor = [...rawMembers].sort((a, b) => {
		const diff = scoreMemberForSurvivor(b, config.survivorRule) - scoreMemberForSurvivor(a, config.survivorRule)
		if (diff !== 0) {
			return diff
		}
		return a.normalized.localeCompare(b.normalized)
	})
	const survivor = sortedForSurvivor[0]
	const survivorKey = survivor.key

	let reclaimableBytes = 0
	let hardlinkSavingsBytes = 0
	let deleteTargetsCount = 0
	let hardlinkTargetsCount = 0
	let shieldedCount = 0

	const members = rawMembers.map((member) => {
		const isSurvivor = member.key === survivorKey
		const override = config.memberOverrides?.[member.key] || 'auto'

		const isRedundantRawPeakMember = member.isRawPeakExport && hasCompressedSpectraAnchor

		let redundancyReason = ''
		if (member.isRawPeakExport) {
			redundancyReason = isRedundantRawPeakMember
				? 'Uncompressed .mgf/.ms2/.csv/.xy duplicates verified .mzml/.jdx/.nmredata/.xrdml master anchor'
				: 'Raw peak/spectral export without verified .mzml/.jdx/.nmredata/.xrdml anchor'
		}

		let governanceTier = 'instrument-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedOosStability
				? 'oos-stability-protected'
				: (member.isProtectedGmp
					? 'gmp-part11-protected'
					: (member.isProtectedCompressedSpectra
						? 'spectra-archive-protected'
						: (member.isRawPeakExport
							? 'peak-export-redundant'
							: 'instrument-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedOosStability && config.protectOosStabilityEvidence) {
			governanceTier = 'oos-stability-protected'
			shielded = true
			protectedReason = 'OOS / ICH stability, batch release, and COA evidence strictly conserved'
		} else if (member.isProtectedGmp && config.protectGmpAndPart11) {
			governanceTier = 'gmp-part11-protected'
			shielded = true
			protectedReason = '21 CFR Part 11 audit trail, validated method, or chemical structure strictly conserved'
		} else if (member.isProtectedCompressedSpectra && config.protectCompressedSpectraAnchors) {
			governanceTier = 'spectra-archive-protected'
			shielded = true
			protectedReason = 'Compressed mzML/mzXML/JCAMP-DX/NMReDATA/XRDML master strictly conserved'
		} else if (isSurvivor && !isRedundantRawPeakMember) {
			governanceTier = member.isProtectedOosStability
				? 'oos-stability-protected'
				: (member.isProtectedGmp
					? 'gmp-part11-protected'
					: (member.isProtectedCompressedSpectra
						? 'spectra-archive-protected'
						: (member.isRawPeakExport
							? 'peak-export-redundant'
							: 'instrument-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Chem & Pharma GMP vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRawPeakExport
				? 'peak-export-redundant'
				: (member.isProtectedGmp
					? 'gmp-part11-protected'
					: 'instrument-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-mzml-and-jdx' && !member.isMutableFile && !member.isInstrumentScratchPath
				? 'hardlink'
				: 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
			protectedReason = 'Marked for remediation via per-copy override'
		} else if (
			config.keepRecentAcqRunDays > 0
			&& member.isInstrumentScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentAcqRunDays
		) {
			governanceTier = 'instrument-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentAcqRunDays}-day active instrument acquisition grace window`
		} else if (member.isRawPeakExport) {
			governanceTier = 'peak-export-redundant'
			if (config.requireSpectraAnchorForPrune && !hasCompressedSpectraAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .mzml/.mzxml/.jdx/.nmredata/.xrdml anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isInstrumentScratchPath) {
			governanceTier = 'instrument-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Empower/ChemStation/TopSpin/msconvert scratch or lock file eligible for cleanup'
		} else if (member.isProtectedCompressedSpectra || member.isProtectedGmp) {
			governanceTier = member.isProtectedGmp ? 'gmp-part11-protected' : 'spectra-archive-protected'
			action = config.strategy === 'hardlink-immutable-mzml-and-jdx' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-mzml-and-jdx' && !member.isMutableFile) {
			governanceTier = 'spectra-archive-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'instrument-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantRawPeakMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantRawPeak = members.some(m => m.isRedundantRawPeakMember || m.isRawPeakExport)
	const hasProtectedOosStability = members.some(m => m.governanceTier === 'oos-stability-protected' && m.shielded)
	const hasProtectedGmp = members.some(m => m.governanceTier === 'gmp-part11-protected' && m.shielded)
	const hasProtectedCompressedSpectra = members.some(m => m.governanceTier === 'spectra-archive-protected' && m.shielded)
	const hasInstrumentScratchIntermediate = members.some(m => m.isInstrumentScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantRawPeakMember && !m.shielded)) {
			clusterVerdict = 'peak-export-redundant'
		} else if (members.some(m => m.isInstrumentScratchPath && !m.shielded)) {
			clusterVerdict = 'instrument-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedOosStability) {
		clusterVerdict = 'oos-stability-protected'
	} else if (hasProtectedGmp) {
		clusterVerdict = 'gmp-part11-protected'
	} else if (hasProtectedCompressedSpectra) {
		clusterVerdict = 'spectra-archive-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantRawPeak ? 95 : 85
	} else if (hasProtectedOosStability) {
		priorityScore = 60
	} else if (hasProtectedGmp) {
		priorityScore = 50
	}

	const chemTags = [...new Set(members.map(m => m.chemTag).filter(Boolean))]
	const familyMeta = CHEM_PHARMA_GMP_FAMILY_META[family] || CHEM_PHARMA_GMP_FAMILY_META['instrument-acquisition-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		labToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		spectraAnchorKey: primaryAnchorKey,
		family,
		familyLabel: familyMeta.label,
		clusterVerdict,
		priorityScore,
		copyCount: members.length,
		unitBytes,
		totalBytes,
		reclaimableBytes,
		hardlinkSavingsBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		formattedTotalBytes: formatBytes(totalBytes),
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		survivorKey,
		survivorPath: survivor.normalized,
		hasProtectedGmp,
		hasProtectedCompressedSpectra,
		hasProtectedOosStability,
		hasRedundantRawPeak,
		hasInstrumentScratchIntermediate,
		hasCompressedSpectraAnchor,
		chemTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Chemical Process, Chromatography & Pharma GMP Compliance Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Chem & Pharma GMP audit report.
 */
export function auditChemPharmaGmpVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeChemPharmaGmpConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isChemPharmaGmpGroup)
	const correlationIndex = buildChemPharmaGmpCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'gmp-batch-records-sop': 0,
		'compressed-spectroscopy-ms': 0,
		'raw-vendor-peak-exports': 0,
		'instrument-acquisition-scratch': 0,
	}
	for (const cluster of sizeFiltered) {
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const query = config.searchQuery.toLowerCase()
	const filteredClusters = sizeFiltered.filter((cluster) => {
		if (config.familyFilter !== 'all' && cluster.family !== config.familyFilter) {
			return false
		}
		if (config.verdictFilter === 'reclaimable' && cluster.reclaimableBytes <= 0) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.reclaimableBytes > 0) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query) {
			const haystacks = [
				cluster.name,
				cluster.labToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.spectraAnchorKey,
				cluster.familyLabel,
				...cluster.chemTags,
				...cluster.members.map(m => `${m.normalized} ${m.artifactKind} ${m.vaultRole}`),
			]
			if (!haystacks.some(val => String(val || '').toLowerCase().includes(query))) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.priorityScore - a.priorityScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.priorityScore - a.priorityScore) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalGmpClusters = 0
	let totalSpectraArchiveClusters = 0
	let totalOosStabilityClusters = 0
	let totalRedundantExportClusters = 0
	let totalInstrumentScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedGmp) {
			totalGmpClusters += 1
		}
		if (cluster.hasProtectedCompressedSpectra) {
			totalSpectraArchiveClusters += 1
		}
		if (cluster.hasProtectedOosStability) {
			totalOosStabilityClusters += 1
		}
		if (cluster.hasRedundantRawPeak) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasInstrumentScratchIntermediate) {
			totalInstrumentScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = CHEM_PHARMA_GMP_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: CHEM_PHARMA_GMP_FAMILY_META[id].label,
			shortLabel: CHEM_PHARMA_GMP_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: CHEM_PHARMA_GMP_VAULT_SCHEMA,
		config,
		familyCounts,
		familyBreakdown,
		clusters: filteredClusters,
		summary: {
			totalDomainGroupsCount: allClusters.length,
			totalUnfilteredClustersCount: sizeFiltered.length,
			totalClustersCount: filteredClusters.length,
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb,
			efficiencyPct,
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalGmpClusters,
			totalSpectraArchiveClusters,
			totalOosStabilityClusters,
			totalRedundantExportClusters,
			totalInstrumentScratchClusters,
		},
	}
}

/**
 * Quote a filesystem path safely for POSIX shell scripts using single-quote escaping.
 *
 * @param {string} rawPath Filesystem path.
 * @return {string} POSIX-quoted string.
 */
function quotePosixPath(rawPath) {
	const safe = String(rawPath || '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for Chem & Pharma GMP Vaults.
 * Strictly blocks deletion or hardlinking of shielded 21 CFR Part 11 / GMP records, OOS/stability evidence,
 * and compressed mzML/JCAMP-DX/NMReDATA masters, and never hardlinks mutable files or instrument scratch.
 *
 * @param {object} auditResult Result from auditChemPharmaGmpVault.
 * @return {string} POSIX bash script.
 */
export function buildChemPharmaGmpRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Chemical Process, Chromatography (LC-MS/NMR), Spectroscopy & Pharma GMP Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./chem-pharma-gmp-vault-reclaim.sh only after verifying mzML/JCAMP-DX and 21 CFR Part 11 anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.chem-pharma-scratch-quarantine}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  else',
		'    "$@"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0
	const strategy = auditResult?.config?.strategy || 'prune-peak-exports-and-instrument-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isInstrumentScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-peak-exports-and-scratch' && (target.isRawPeakExport || target.isInstrumentScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable MGF/CSV peak exports or instrument scratch under active GMP vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Chem & Pharma GMP Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditChemPharmaGmpVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildChemPharmaGmpCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'lab_toolchain',
		'workflow_stage',
		'run_stem',
		'spectra_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_spectra_anchor',
		'is_redundant_raw_peak',
		'is_instrument_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'chem_tag',
		'governance_tier',
		'action',
		'shielded',
		'protected_reason',
		'is_survivor',
		'size_bytes',
		'formatted_size',
		'mtime',
		'survivor_path',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const row = [
				cluster.id,
				cluster.name,
				cluster.labToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.spectraAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedSpectraAnchor ? 'true' : 'false',
				member.isRedundantRawPeakMember ? 'true' : 'false',
				member.isInstrumentScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.chemTag || '',
				member.governanceTier,
				member.action,
				member.shielded ? 'true' : 'false',
				member.protectedReason || '',
				member.isSurvivor ? 'true' : 'false',
				member.size,
				formatBytes(member.size),
				member.formattedMtime || '',
				cluster.survivorPath,
			]
			rows.push(row.map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a deterministic JSON audit manifest.
 *
 * @param {object} auditResult Result from auditChemPharmaGmpVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildChemPharmaGmpJsonManifest(auditResult) {
	const payload = {
		schema: CHEM_PHARMA_GMP_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || CHEM_PHARMA_GMP_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			labToolchain: cluster.labToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			spectraAnchorKey: cluster.spectraAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedGmp: cluster.hasProtectedGmp,
			hasProtectedCompressedSpectra: cluster.hasProtectedCompressedSpectra,
			hasProtectedOosStability: cluster.hasProtectedOosStability,
			hasRedundantRawPeak: cluster.hasRedundantRawPeak,
			hasInstrumentScratchIntermediate: cluster.hasInstrumentScratchIntermediate,
			hasCompressedSpectraAnchor: cluster.hasCompressedSpectraAnchor,
			chemTags: cluster.chemTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				chemTag: member.chemTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantRawPeakMember: member.isRedundantRawPeakMember,
				isInstrumentScratchPath: member.isInstrumentScratchPath,
				isMutableFile: member.isMutableFile,
				isSurvivor: member.isSurvivor,
				size: member.size,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Generate a Nextcloud/rsync .sync-exclude.lst rule set to prevent accidental
 * cloud sync of Empower/ChemStation/Xcalibur/TopSpin/msconvert scratch directories
 * and transient mzML/WIFF/FID acquisition lock files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildChemPharmaGmpSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Chem, Chromatography & Pharma GMP Vaults',
		'empower_tmp/',
		'chemstation_tmp/',
		'xcalibur_tmp/',
		'masshunter_tmp/',
		'chromeleon_tmp/',
		'topspin_tmp/',
		'mestrenova_tmp/',
		'openchrom_cache/',
		'proteowizard_tmp/',
		'msconvert_tmp/',
		'acq_scratch/',
		'peak_cache/',
		'chromatogram_tmp/',
		'nmr_scratch/',
		'*.mzml.tmp',
		'*.wiff.scan.tmp',
		'*.fid.tmp',
		'*.ser.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
