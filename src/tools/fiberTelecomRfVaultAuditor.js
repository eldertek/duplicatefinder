/**
 * Pure Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter & 5G Baseband IQ Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Fiber & RF Engineering Vault families:
 * - Calibration, NIST/ISO-17025 & Anechoic Compliance (.cal, .ckit, .calset, .sta, .csa, FCC/ETSI/3GPP/SAR/EMC compliance records)
 * - OTDR Traces, Touchstone S-Parameters & Baseband IQ Masters (.sor, .trc, .otdr, .flw, .msor, .s1p-.s8p, .snp, .cti, .sigmf-data, .sigmf-meta, .iq, .cfile, .sc16, .fc32, .wv, .iqw, .tdms, .ffs, .cst, .aedt, .hfss, .nmf, .trp, .dlf, .isf)
 * - Redundant CSV / Touchstone-Table / MATLAB Exports (.csv, .tsv, .txt, .xlsx, .asc, .prn, .mat in Fiber/RF/VNA/5G context)
 * - VNA, SDR & EM Solver Scratch (vna_tmp/, keysight_cache/, rohde_scratch/, anritsu_tmp/, sdr_staging/, gnuradio_tmp/, hfss_scratch/, cst_cache/, otdr_staging/, iq_ringbuf/, drive_test_tmp/, em_solver_tmp/, .sor.tmp, .iq.tmp, .s2p.bak, .lck)
 *
 * Enforces strict Calibration / ISO-17025, FCC/ETSI/3GPP compliance, and OTDR/Touchstone/IQ anchor defaults:
 * - Strictly conserves VNA calibration kits, SOLT/TRL/ECal baselines, and ISO-17025 / FCC / ETSI / SAR / EMC regulatory compliance records
 * - Strictly conserves verified OTDR (.sor/.trc), VNA Touchstone (.s1p-.s8p/.snp/.cti), SigMF/IQ baseband captures, and HFSS/CST EM simulation masters
 * - Detects redundant CSV/TXT/ASC/PRN/MAT trace and S-parameter exports when a verified .sor/.s2p/.sigmf-data/.iq/.tdms/.aedt anchor exists
 * - Blocks pruning of raw CSV/TXT/MAT exports lacking a verified OTDR/Touchstone/IQ master anchor when guard is active
 * - Blocks hardlinks on mutable CSV/TXT/ASC/JSON/script files and solver/SDR scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const FIBER_TELECOM_RF_VAULT_SCHEMA = 'duplicatefinder.fiber-telecom-rf-vault-auditor.v1'

export const FIBER_TELECOM_RF_FAMILIES = Object.freeze([
	'all',
	'fiber-rf-calibration-compliance',
	'fiber-rf-master-anchors',
	'redundant-rf-csv-exports',
	'rf-solver-and-capture-scratch',
])

export const FIBER_TELECOM_RF_FAMILY_META = Object.freeze({
	'fiber-rf-calibration-compliance': {
		id: 'fiber-rf-calibration-compliance',
		label: 'Calibration & ISO-17025',
		shortLabel: 'VNA Cal Kits & RF Compliance (.cal, .ckit, .calset, .sta, .csa, FCC/ETSI/3GPP/SAR)',
	},
	'fiber-rf-master-anchors': {
		id: 'fiber-rf-master-anchors',
		label: 'OTDR, Touchstone & IQ Masters',
		shortLabel: 'Verified Masters (.sor, .trc, .s1p-.s8p, .snp, .sigmf-data, .iq, .wv, .tdms, .aedt, .cst)',
	},
	'redundant-rf-csv-exports': {
		id: 'redundant-rf-csv-exports',
		label: 'Redundant CSV / MAT Exports',
		shortLabel: 'Derived Exports (.csv, .tsv, .txt, .xlsx, .asc, .prn, .mat)',
	},
	'rf-solver-and-capture-scratch': {
		id: 'rf-solver-and-capture-scratch',
		label: 'VNA, SDR & EM Solver Scratch',
		shortLabel: 'Lab Scratch (vna_tmp/, keysight_cache/, sdr_staging/, hfss_scratch/, otdr_staging/, .lck)',
	},
})

export const FIBER_TELECOM_RF_STRATEGIES = Object.freeze([
	'prune-exports-and-rf-scratch',
	'hardlink-immutable-iq-and-sor',
	'quarantine-exports-and-rf-scratch',
])

export const FIBER_TELECOM_RF_SURVIVOR_RULES = Object.freeze([
	'cal-sor-iq-first',
	'oldest-capture-first',
	'newest-sweep-revision-first',
	'shortest-path',
])

export const FIBER_TELECOM_RF_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'calibration-std-protected',
	'fiber-rf-master-protected',
	'regulatory-rf-protected',
	'rf-export-redundant',
	'rf-scratch-intermediate',
	'shielded',
])

export const FIBER_TELECOM_RF_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const FIBER_TELECOM_RF_PRESETS = Object.freeze([
	{
		id: 'all-fiber-telecom-rf-audit',
		name: 'All Fiber, RF & IQ Vaults',
		description: 'Audit VNA calibration kits (.cal/.ckit/.csa), OTDR traces (.sor), Touchstone S-parameters (.s2p/.s4p), SigMF/baseband IQ captures, CSV/MAT exports, and RF solver scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-rf-scratch',
		survivorRule: 'cal-sor-iq-first',
		protectCalibrationAndCompliance: true,
		protectFiberRfMasterAnchors: true,
		protectRegulatoryRfEvidence: true,
		requireFiberRfAnchorForPrune: true,
		keepRecentCaptureDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'rf-solver-scratch-cleanup',
		name: 'VNA, SDR & EM Solver Scratch',
		description: 'Reclaim vna_tmp/, keysight_cache/, rohde_scratch/, sdr_staging/, gnuradio_tmp/, hfss_scratch/, cst_cache/, and .sor.tmp/.iq.tmp scratch older than the active capture grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-rf-scratch',
		survivorRule: 'cal-sor-iq-first',
		protectCalibrationAndCompliance: true,
		protectFiberRfMasterAnchors: true,
		protectRegulatoryRfEvidence: true,
		requireFiberRfAnchorForPrune: true,
		keepRecentCaptureDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-csv-vs-sor-touchstone-iq',
		name: 'Redundant .csv/.mat/.txt vs .sor/IQ',
		description: 'Detect uncompressed ASCII S-parameter table (.csv/.txt/.prn) and MATLAB (.mat) exports backed by a verified OTDR (.sor), Touchstone (.s2p/.snp), SigMF/IQ, or EM master anchor.',
		familyFilter: 'redundant-rf-csv-exports',
		strategy: 'quarantine-exports-and-rf-scratch',
		survivorRule: 'cal-sor-iq-first',
		protectCalibrationAndCompliance: true,
		protectFiberRfMasterAnchors: true,
		protectRegulatoryRfEvidence: true,
		requireFiberRfAnchorForPrune: true,
		keepRecentCaptureDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'calibration-iso17025-rf-shield',
		name: 'VNA Cal Kits & ISO-17025 Shield',
		description: 'Inspect VNA SOLT/TRL/ECal calibration sets (.cal, .ckit, .calset, .csa), anechoic chamber path-loss baselines, and FCC/ETSI/3GPP/SAR compliance filings under strict shield.',
		familyFilter: 'fiber-rf-calibration-compliance',
		strategy: 'hardlink-immutable-iq-and-sor',
		survivorRule: 'cal-sor-iq-first',
		protectCalibrationAndCompliance: true,
		protectFiberRfMasterAnchors: true,
		protectRegulatoryRfEvidence: true,
		requireFiberRfAnchorForPrune: true,
		keepRecentCaptureDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'otdr-touchstone-iq-masters',
		name: 'OTDR (.sor), Touchstone & IQ Masters',
		description: 'Audit Telcordia .sor OTDR traces, Touchstone .s1p-.s8p/.snp S-parameters, SigMF/5G baseband IQ captures, and Ansys HFSS / CST Studio EM masters.',
		familyFilter: 'fiber-rf-master-anchors',
		strategy: 'hardlink-immutable-iq-and-sor',
		survivorRule: 'cal-sor-iq-first',
		protectCalibrationAndCompliance: true,
		protectFiberRfMasterAnchors: true,
		protectRegulatoryRfEvidence: true,
		requireFiberRfAnchorForPrune: true,
		keepRecentCaptureDays: 0,
		minSizeKb: 0,
	},
])

export const FIBER_TELECOM_RF_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-fiber-telecom-rf-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-rf-scratch',
	survivorRule: 'cal-sor-iq-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCalibrationAndCompliance: true,
	protectFiberRfMasterAnchors: true,
	protectRegulatoryRfEvidence: true,
	requireFiberRfAnchorForPrune: true,
	keepRecentCaptureDays: 0,
	minSizeKb: 0,
})

const STRICT_CAL_STD_EXT_RE = /\.(?:cal|ckit|calset|sta|csa|calx|calkit)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|json|pdf|sig|p7s)$/i
const STRICT_OTDR_EXT_RE = /\.(?:sor|trc|otdr|flw|msor)$/i
const STRICT_TOUCHSTONE_EXT_RE = /\.(?:s\d+p|snp|cti|ts2)$/i
const STRICT_IQ_BASEBAND_EXT_RE = /\.(?:sigmf-data|sigmf-meta|iq|cfile|sc16|fc32|wv|iqw|tdms|arb|iqbin)$/i
const CONTEXT_IQ_BIN_EXT_RE = /\.(?:bin|raw|h5|hdf5|npy)$/i
const STRICT_RF_EM_RAN_EXT_RE = /\.(?:ffs|cst|aedt|hfss|nmf|trp|dlf|isf|msi|pln|ant)$/i
const CONTEXT_RF_CSV_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|asc|prn|mat)$/i
const STRICT_RF_SCRATCH_EXT_RE = /\.(?:sor\.tmp|iq\.tmp|s2p\.bak|s4p\.bak|aedt\.tmp|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp)$/i

const FIBER_RF_CONTEXT_HINT_RE = /(?:fiber|otdr|ftth|dwdm|cwdm|sfp|qsfp|pon|vna|touchstone|s_?param|sparam|s2p|s4p|sigmf|baseband|iq_capture|5g_nr|lte_ran|3gpp|etsi|fcc_part|anechoic|ofdm|qam|mimo|beamform|keysight|rohde|anritsu|viavi|exfo|gnuradio|usrp|rf_spectrum|mmwave|sub6|antenna|hfss|cst_studio|drive_test|sar_test|emc_lab|fiber_vault|rf_vault)/i
const CAL_COMPLIANCE_PATH_RE = /(?:cal_?kit|vna_?cal|solt|trl_cal|ecal|iso17025|nist_traceable|anechoic_cal|path_loss_cal|golden_cal|00_cal|calibration_std|cert_cal)/i
const REGULATORY_RF_EVIDENCE_PATH_RE = /(?:fcc_part15|fcc_id|etsi_en|3gpp_ts|sar_compliance|emc_hold|icnirp|itu_r|ofcom_audit|anfr_hold|spectrum_compliance|regulatory_rf|type_approval)/i
const RF_SCRATCH_PATH_RE = /(?:vna_tmp|keysight_cache|rohde_scratch|anritsu_tmp|sdr_staging|gnuradio_tmp|hfss_scratch|cst_cache|otdr_staging|iq_ringbuf|drive_test_tmp|em_solver_tmp|rf_cache|spectrum_tmp|solver_scratch|capture_tmp)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_cal|00_otdr|canonical|rf_vault|fiber_vault|iq_archive|calibration_repo|production_rf)/i

/**
 * Normalize configuration values for Fiber-Optic, Telecom RF & Baseband IQ Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeFiberTelecomRfConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = FIBER_TELECOM_RF_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.familyFilter
	const verdictFilter = FIBER_TELECOM_RF_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.verdictFilter
	const strategy = FIBER_TELECOM_RF_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.strategy
	const survivorRule = FIBER_TELECOM_RF_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.survivorRule
	const sortMode = FIBER_TELECOM_RF_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentCaptureDays)
	const keepRecentCaptureDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: FIBER_TELECOM_RF_DEFAULT_CONFIG.keepRecentCaptureDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : FIBER_TELECOM_RF_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCalibrationAndCompliance: cfg.protectCalibrationAndCompliance !== undefined ? Boolean(cfg.protectCalibrationAndCompliance) : true,
		protectFiberRfMasterAnchors: cfg.protectFiberRfMasterAnchors !== undefined ? Boolean(cfg.protectFiberRfMasterAnchors) : true,
		protectRegulatoryRfEvidence: cfg.protectRegulatoryRfEvidence !== undefined ? Boolean(cfg.protectRegulatoryRfEvidence) : true,
		requireFiberRfAnchorForPrune: cfg.requireFiberRfAnchorForPrune !== undefined ? Boolean(cfg.requireFiberRfAnchorForPrune) : true,
		keepRecentCaptureDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized RF/fiber measurement stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized measurement or sweep stem.
 */
export function extractFiberTelecomRfStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:sigmf-data|sigmf-meta|sor\.tmp|iq\.tmp|s2p\.bak|s4p\.bak|aedt\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(/(?:_export|_ascii|_sparam_table|_iq_dump|_trace_csv|_matlab|_csv|_mat|_prn|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'rf-measurement'
}

/**
 * Extract canonical anchor key linking derived CSV/TXT/PRN/MAT exports to OTDR/Touchstone/IQ masters.
 *
 * @param {string} runStem Extracted measurement stem.
 * @return {string} Canonical anchor key.
 */
export function extractFiberTelecomRfAnchorKey(runStem) {
	return String(runStem || 'rf-measurement')
		.toLowerCase()
		.replace(/(?:_summary|_traces|_sparam|_sweep|_spectrum|_fft|_waterfall|_table|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'rf-measurement'
}

/**
 * Detect Fiber/RF instrumentation toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ rfToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractRfToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let rfToolchain = ''
	if (/keysight|pna|fieldfox|\.(?:csa|sta|cti)\b/.test(text)) {
		rfToolchain = 'Keysight PNA / FieldFox'
	} else if (/rohde|zva|znb|fsw|smw|\.(?:wv|iqw)\b/.test(text)) {
		rfToolchain = 'Rohde & Schwarz VNA / Signal'
	} else if (/anritsu|site_master/.test(text)) {
		rfToolchain = 'Anritsu Site Master / VNA'
	} else if (/viavi|exfo|\.(?:sor|otdr|msor|trc)\b/.test(text)) {
		rfToolchain = 'EXFO / VIAVI OTDR'
	} else if (/hfss|\.(?:aedt|hfss)\b/.test(text)) {
		rfToolchain = 'Ansys HFSS'
	} else if (/cst_|\.(?:cst|ffs)\b/.test(text)) {
		rfToolchain = 'Dassault CST Studio'
	} else if (/gnuradio|usrp|ettus|\.(?:sigmf-data|sigmf-meta|cfile|fc32|sc16)\b/.test(text)) {
		rfToolchain = 'SigMF / GNU Radio USRP'
	} else if (/\.(?:s\d+p|snp)\b/.test(text)) {
		rfToolchain = 'Touchstone VNA Network'
	} else if (/\.(?:nmf|trp|dlf|isf)\b|drive_test/.test(text)) {
		rfToolchain = '5G/LTE RAN Drive-Test'
	} else if (/\.(?:tdms|iq)\b/.test(text)) {
		rfToolchain = 'NI RFmx / Baseband IQ'
	}

	let workflowStage = ''
	if (/fcc_part|fcc_id|etsi_en|3gpp_ts|sar_compliance|emc_hold|type_approval/.test(text)) {
		workflowStage = 'FCC / ETSI / 3GPP Compliance'
	} else if (/cal_?kit|vna_?cal|solt|trl_cal|ecal|iso17025|nist_traceable|\.(?:cal|ckit|calset|sta|csa)\b/.test(text)) {
		workflowStage = 'VNA Calibration & ISO-17025'
	} else if (/\.(?:sor|trc|otdr|flw|msor)\b/.test(text)) {
		workflowStage = 'Fiber OTDR Trace Master'
	} else if (/\.(?:s\d+p|snp|cti)\b/.test(text)) {
		workflowStage = 'VNA S-Parameter Touchstone'
	} else if (/\.(?:sigmf-data|sigmf-meta|iq|cfile|sc16|fc32|wv|iqw|tdms)\b/.test(text)) {
		workflowStage = 'Baseband IQ / Spectrum Master'
	} else if (/\.(?:ffs|cst|aedt|hfss|nmf|trp|dlf|isf)\b/.test(text)) {
		workflowStage = 'EM Simulation / RAN Log'
	} else if (RF_SCRATCH_PATH_RE.test(text) || STRICT_RF_SCRATCH_EXT_RE.test(text)) {
		workflowStage = 'VNA / SDR / EM Solver Scratch'
	} else if (CONTEXT_RF_CSV_EXPORT_EXT_RE.test(basename)) {
		workflowStage = 'CSV / MATLAB / ASCII Export'
	}

	return { rfToolchain, workflowStage }
}

/**
 * Extract concise Fiber/RF domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractRfDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (/fcc_part|fcc_id|etsi_en/.test(text)) {
		return 'FCC / ETSI'
	}
	if (/sar_compliance|emc_hold/.test(text)) {
		return 'SAR / EMC'
	}
	if (/iso17025|nist_traceable/.test(text)) {
		return 'ISO-17025'
	}
	if (/\.(?:cal|ckit|calset|csa|sta)\b|solt|ecal/.test(text)) {
		return 'VNA-CAL'
	}
	if (/\.(?:sor|otdr|msor)\b/.test(text)) {
		return 'OTDR-SOR'
	}
	if (/\.(?:s\d+p|snp)\b/.test(text)) {
		return 'TOUCHSTONE'
	}
	if (/\.(?:sigmf-data|sigmf-meta)\b/.test(text)) {
		return 'SigMF'
	}
	if (/\.(?:iq|cfile|sc16|fc32|wv|iqw)\b/.test(text)) {
		return 'BASEBAND-IQ'
	}
	if (/5g_nr|3gpp|mmwave/.test(text)) {
		return '5G-NR'
	}
	if (/\.(?:aedt|hfss|cst|ffs)\b/.test(text)) {
		return 'EM-3D'
	}
	return ''
}

/**
 * Parse file mtime into epoch milliseconds and age in days.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} referenceNowMs Reference current time in ms.
 * @return {{ mtimeMs: number|null, ageDays: number|null, formattedMtime: string }} Parsed timestamps.
 */
function parseFileTime(file, referenceNowMs) {
	const raw = file?.mtime ?? file?.modified ?? file?.lastModified ?? null
	if (raw === null || raw === undefined || raw === '') {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	let mtimeMs = null
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		mtimeMs = raw < 1e12 ? raw * 1000 : raw
	} else if (typeof raw === 'string') {
		const num = Number(raw)
		if (Number.isFinite(num) && raw.trim() !== '') {
			mtimeMs = num < 1e12 ? num * 1000 : num
		} else {
			const parsed = Date.parse(raw)
			if (Number.isFinite(parsed)) {
				mtimeMs = parsed
			}
		}
	}
	if (mtimeMs === null || !Number.isFinite(mtimeMs)) {
		return { mtimeMs: null, ageDays: null, formattedMtime: '' }
	}
	const ageDays = Math.max(0, Math.floor((referenceNowMs - mtimeMs) / (24 * 60 * 60 * 1000)))
	const formattedMtime = formatFileModifiedTime(Math.floor(mtimeMs / 1000)) || ''
	return { mtimeMs, ageDays, formattedMtime }
}

/**
 * Classify a single file within the Fiber-Optic, Telecom RF & Baseband IQ domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyFiberTelecomRfFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasFiberRfContext = FIBER_RF_CONTEXT_HINT_RE.test(lower)
	const isScratchPath = RF_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_RF_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isCalibrationPath = CAL_COMPLIANCE_PATH_RE.test(lower)
	const isRegulatoryRfPath = REGULATORY_RF_EVIDENCE_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)

	const isStrictCalStdExt = STRICT_CAL_STD_EXT_RE.test(lowerBase)
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isCalibrationPath || isRegulatoryRfPath || hasFiberRfContext)
	const isStrictOtdrExt = STRICT_OTDR_EXT_RE.test(lowerBase)
	const isStrictTouchstoneExt = STRICT_TOUCHSTONE_EXT_RE.test(lowerBase)
	const isStrictIqExt = STRICT_IQ_BASEBAND_EXT_RE.test(lowerBase)
	const isContextIqBin = CONTEXT_IQ_BIN_EXT_RE.test(lowerBase) && hasFiberRfContext
	const isStrictEmRanExt = STRICT_RF_EM_RAN_EXT_RE.test(lowerBase)
	const isContextRfCsvExport = CONTEXT_RF_CSV_EXPORT_EXT_RE.test(lowerBase) && hasFiberRfContext

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Fiber & RF Vault'
	let isProtectedCalStd = false
	let isProtectedFiberRfMaster = false
	let isProtectedRegulatoryRf = false
	let isFiberRfMasterAnchor = false
	let isRedundantRfExport = false
	let isMutableFile = false

	if (isStrictScratchExt || (isScratchPath && (isGenericScratchExt || isContextRfCsvExport || isContextIqBin || isStrictTouchstoneExt || isStrictOtdrExt || isStrictIqExt)) || (isGenericScratchExt && hasFiberRfContext)) {
		family = 'rf-solver-and-capture-scratch'
		artifactKind = isStrictScratchExt ? 'VNA / OTDR / IQ Scratch Temp or Lock' : 'RF Lab / EM Solver Scratch'
		vaultRole = 'Keysight / R&S / SDR / HFSS / OTDR Scratch'
		isMutableFile = true
	} else if (isRegulatoryRfPath && (isStrictCalStdExt || isStrictOtdrExt || isStrictTouchstoneExt || isStrictIqExt || isStrictEmRanExt || isContextComplianceDoc)) {
		family = 'fiber-rf-calibration-compliance'
		artifactKind = 'FCC / ETSI / 3GPP / SAR Compliance Record'
		vaultRole = 'Regulatory Type-Approval & EMC Hold Evidence'
		isProtectedRegulatoryRf = true
		isProtectedCalStd = true
		isFiberRfMasterAnchor = isStrictCalStdExt || isStrictOtdrExt || isStrictTouchstoneExt || isStrictIqExt || isStrictEmRanExt
	} else if (isStrictCalStdExt || (isCalibrationPath && (isStrictTouchstoneExt || isStrictOtdrExt || isContextComplianceDoc))) {
		family = 'fiber-rf-calibration-compliance'
		artifactKind = isStrictCalStdExt ? 'VNA Calibration Kit / SOLT / ECal Set' : 'ISO-17025 / Anechoic Calibration Baseline'
		vaultRole = 'Traceable VNA & Chamber Calibration Standard'
		isProtectedCalStd = true
		isFiberRfMasterAnchor = isStrictCalStdExt || isStrictTouchstoneExt || isStrictOtdrExt
		isMutableFile = /\.(?:xml|json)$/i.test(lowerBase)
	} else if (isStrictOtdrExt || isStrictTouchstoneExt || isStrictIqExt || isStrictEmRanExt || isContextIqBin) {
		family = 'fiber-rf-master-anchors'
		if (isStrictOtdrExt) {
			artifactKind = 'Telcordia OTDR Fiber Trace (.sor/.trc)'
			vaultRole = 'Fiber-Optic Span Reflectometry Master'
		} else if (isStrictTouchstoneExt) {
			artifactKind = 'VNA Touchstone S-Parameter (.s1p-.s8p)'
			vaultRole = 'Multi-Port RF Network Scattering Master'
			isMutableFile = /\.(?:cti)$/i.test(lowerBase)
		} else if (isStrictEmRanExt) {
			artifactKind = 'EM 3D Antenna / RAN Drive-Test Master'
			vaultRole = 'HFSS / CST / 5G NR Drive-Test Master'
			isMutableFile = /\.(?:msi|pln|ant)$/i.test(lowerBase)
		} else {
			artifactKind = /\.sigmf/i.test(lowerBase) ? 'SigMF Baseband IQ Master' : 'Baseband IQ / RF Spectrum Capture'
			vaultRole = '5G / SDR / RFmx Raw IQ Master'
			isMutableFile = /\.sigmf-meta$/i.test(lowerBase)
		}
		isProtectedFiberRfMaster = true
		isFiberRfMasterAnchor = true
	} else if (isContextComplianceDoc) {
		family = 'fiber-rf-calibration-compliance'
		artifactKind = 'RF Test / SigMF Compliance Manifest'
		vaultRole = 'Lab Verification & Compliance Package'
		isProtectedCalStd = true
		isMutableFile = /\.(?:xml|json)$/i.test(lowerBase)
	} else if (isContextRfCsvExport) {
		family = 'redundant-rf-csv-exports'
		artifactKind = /\.mat$/i.test(lowerBase) ? 'MATLAB RF / IQ Export (.mat)' : 'ASCII / CSV / PRN Trace Export'
		vaultRole = 'Derived S-Parameter Table / OTDR CSV / IQ Export'
		isRedundantRfExport = true
		isMutableFile = true
	}

	const { rfToolchain, workflowStage } = extractRfToolchainAndStage(normalized, basename)
	const runStem = extractFiberTelecomRfStem(basename, normalized)
	const rfAnchorKey = extractFiberTelecomRfAnchorKey(runStem)
	const rfTag = extractRfDomainTag(lowerBase, lower)

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
		rfToolchain,
		workflowStage,
		runStem,
		rfAnchorKey,
		rfTag,
		isProtectedCalStd,
		isProtectedFiberRfMaster,
		isProtectedRegulatoryRf,
		isFiberRfMasterAnchor,
		isRedundantRfExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isGenericScratchExt && hasFiberRfContext),
		isCalibrationPath,
		isRegulatoryRfPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Fiber-Optic, Telecom RF & Baseband IQ domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isFiberTelecomRfGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyFiberTelecomRfFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified .sor/.s2p/.sigmf-data/.iq/.tdms/.aedt masters
 * to derived CSV, TXT, PRN, ASC, and MAT exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildFiberTelecomRfCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyFiberTelecomRfFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isFiberRfMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.rfAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Fiber & RF cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'fiber-rf-calibration-compliance')) {
		return 'fiber-rf-calibration-compliance'
	}
	if (members.some(m => m.family === 'fiber-rf-master-anchors')) {
		return 'fiber-rf-master-anchors'
	}
	if (members.some(m => m.family === 'redundant-rf-csv-exports')) {
		return 'redundant-rf-csv-exports'
	}
	return 'rf-solver-and-capture-scratch'
}

/**
 * Compute deterministic survivor priority score for a Fiber & RF vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-capture-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRegulatoryRf ? 100000 : 0)
			+ (member.isProtectedCalStd ? 97000 : 0)
			+ (member.isProtectedFiberRfMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantRfExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-sweep-revision-first') {
		return (member.isProtectedRegulatoryRf ? 100000 : 0)
			+ (member.isProtectedCalStd ? 97000 : 0)
			+ (member.isProtectedFiberRfMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantRfExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRegulatoryRf ? 52000 : 0)
			+ (member.isProtectedCalStd ? 50000 : 0)
			+ (member.isProtectedFiberRfMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRegulatoryRf ? 100000 : 0)
		+ (member.isProtectedCalStd ? 97000 : 0)
		+ (member.isProtectedFiberRfMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantRfExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Fiber-Optic, Telecom RF & Baseband IQ duplicate cluster.
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
		const meta = classifyFiberTelecomRfFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.rfToolchain)?.rfToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractFiberTelecomRfStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].rfAnchorKey || extractFiberTelecomRfAnchorKey(primaryStem)

	const hasFiberRfMasterAnchor = Boolean(
		rawMembers.some(m => m.isFiberRfMasterAnchor)
		|| correlationIndex.anchorStems.has(primaryStem)
		|| correlationIndex.anchorKeys.has(primaryAnchorKey)
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

		const isRedundantRfExportMember = member.isRedundantRfExport && hasFiberRfMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantRfExport) {
			redundancyReason = isRedundantRfExportMember
				? 'Derived .csv/.mat/.txt/.prn export duplicates verified OTDR (.sor), Touchstone (.s2p), or IQ master'
				: 'ASCII/CSV/MAT RF export without verified OTDR, Touchstone, SigMF, or IQ master anchor'
		}

		let governanceTier = 'rf-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedRegulatoryRf
				? 'regulatory-rf-protected'
				: (member.isProtectedCalStd
					? 'calibration-std-protected'
					: (member.isProtectedFiberRfMaster
						? 'fiber-rf-master-protected'
						: (member.isRedundantRfExport
							? 'rf-export-redundant'
							: 'rf-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRegulatoryRf && config.protectRegulatoryRfEvidence) {
			governanceTier = 'regulatory-rf-protected'
			shielded = true
			protectedReason = 'FCC / ETSI / 3GPP / SAR / EMC regulatory evidence strictly conserved'
		} else if (member.isProtectedCalStd && config.protectCalibrationAndCompliance) {
			governanceTier = 'calibration-std-protected'
			shielded = true
			protectedReason = 'VNA calibration kit, ISO-17025 baseline, or anechoic reference strictly conserved'
		} else if (member.isProtectedFiberRfMaster && config.protectFiberRfMasterAnchors) {
			governanceTier = 'fiber-rf-master-protected'
			shielded = true
			protectedReason = 'Verified OTDR (.sor), Touchstone (.s1p-.s8p), IQ, or EM master strictly conserved'
		} else if (isSurvivor && !isRedundantRfExportMember) {
			governanceTier = member.isProtectedRegulatoryRf
				? 'regulatory-rf-protected'
				: (member.isProtectedCalStd
					? 'calibration-std-protected'
					: (member.isProtectedFiberRfMaster
						? 'fiber-rf-master-protected'
						: (member.isRedundantRfExport
							? 'rf-export-redundant'
							: 'rf-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Fiber & RF vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantRfExport
				? 'rf-export-redundant'
				: (member.isProtectedCalStd
					? 'calibration-std-protected'
					: 'rf-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-iq-and-sor' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentCaptureDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentCaptureDays
		) {
			governanceTier = 'rf-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentCaptureDays}-day active VNA/SDR/EM lab capture grace window`
		} else if (member.isRedundantRfExport) {
			governanceTier = 'rf-export-redundant'
			if (config.requireFiberRfAnchorForPrune && !hasFiberRfMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified OTDR (.sor), Touchstone (.s2p), or IQ master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'rf-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Keysight/R&S/SDR/HFSS/CST/OTDR scratch or lock file eligible for cleanup'
		} else if (member.isProtectedFiberRfMaster || member.isProtectedCalStd) {
			governanceTier = member.isProtectedCalStd ? 'calibration-std-protected' : 'fiber-rf-master-protected'
			action = config.strategy === 'hardlink-immutable-iq-and-sor' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-iq-and-sor' && !member.isMutableFile) {
			governanceTier = 'fiber-rf-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'rf-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantRfExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantRfExport = members.some(m => m.isRedundantRfExportMember || m.isRedundantRfExport)
	const hasProtectedRegulatoryRf = members.some(m => m.governanceTier === 'regulatory-rf-protected' && m.shielded)
	const hasProtectedCalStd = members.some(m => m.governanceTier === 'calibration-std-protected' && m.shielded)
	const hasProtectedFiberRfMaster = members.some(m => m.governanceTier === 'fiber-rf-master-protected' && m.shielded)
	const hasRfScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantRfExportMember && !m.shielded)) {
			clusterVerdict = 'rf-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'rf-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedRegulatoryRf) {
		clusterVerdict = 'regulatory-rf-protected'
	} else if (hasProtectedCalStd) {
		clusterVerdict = 'calibration-std-protected'
	} else if (hasProtectedFiberRfMaster) {
		clusterVerdict = 'fiber-rf-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantRfExport ? 95 : 85
	} else if (hasProtectedRegulatoryRf) {
		priorityScore = 60
	} else if (hasProtectedCalStd) {
		priorityScore = 50
	}

	const rfTags = [...new Set(members.map(m => m.rfTag).filter(Boolean))]
	const familyMeta = FIBER_TELECOM_RF_FAMILY_META[family] || FIBER_TELECOM_RF_FAMILY_META['rf-solver-and-capture-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		rfToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		rfAnchorKey: primaryAnchorKey,
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
		hasProtectedCalStd,
		hasProtectedFiberRfMaster,
		hasProtectedRegulatoryRf,
		hasRedundantRfExport,
		hasRfScratchIntermediate,
		hasFiberRfMasterAnchor,
		rfTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Fiber-Optic, Telecom RF & Baseband IQ Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Fiber & RF vault audit report.
 */
export function auditFiberTelecomRfVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeFiberTelecomRfConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isFiberTelecomRfGroup)
	const correlationIndex = buildFiberTelecomRfCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'fiber-rf-calibration-compliance': 0,
		'fiber-rf-master-anchors': 0,
		'redundant-rf-csv-exports': 0,
		'rf-solver-and-capture-scratch': 0,
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
				cluster.rfToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.rfAnchorKey,
				cluster.familyLabel,
				...cluster.rfTags,
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
	let totalCalibrationClusters = 0
	let totalFiberRfMasterClusters = 0
	let totalRegulatoryRfClusters = 0
	let totalRedundantExportClusters = 0
	let totalRfScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCalStd) {
			totalCalibrationClusters += 1
		}
		if (cluster.hasProtectedFiberRfMaster) {
			totalFiberRfMasterClusters += 1
		}
		if (cluster.hasProtectedRegulatoryRf) {
			totalRegulatoryRfClusters += 1
		}
		if (cluster.hasRedundantRfExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasRfScratchIntermediate) {
			totalRfScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = FIBER_TELECOM_RF_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: FIBER_TELECOM_RF_FAMILY_META[id].label,
			shortLabel: FIBER_TELECOM_RF_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: FIBER_TELECOM_RF_VAULT_SCHEMA,
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
			totalCalibrationClusters,
			totalFiberRfMasterClusters,
			totalRegulatoryRfClusters,
			totalRedundantExportClusters,
			totalRfScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Fiber, RF & Baseband IQ Vaults.
 * Strictly blocks deletion or hardlinking of shielded VNA cal kits, FCC/ETSI/3GPP evidence,
 * and verified OTDR/Touchstone/IQ masters, and never hardlinks mutable files or lab scratch.
 *
 * @param {object} auditResult Result from auditFiberTelecomRfVault.
 * @return {string} POSIX bash script.
 */
export function buildFiberTelecomRfRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter & 5G Baseband IQ Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./fiber-telecom-rf-vault-reclaim.sh only after verifying OTDR/Touchstone/IQ and calibration anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.fiber-rf-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-rf-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-exports-and-rf-scratch' && (target.isRedundantRfExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable CSV/MAT exports or RF lab scratch under active Fiber & RF vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Fiber & RF Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditFiberTelecomRfVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildFiberTelecomRfCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'rf_toolchain',
		'workflow_stage',
		'run_stem',
		'rf_anchor_key',
		'family',
		'cluster_verdict',
		'has_fiber_rf_master_anchor',
		'is_redundant_rf_export',
		'is_rf_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'rf_tag',
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
				cluster.rfToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.rfAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasFiberRfMasterAnchor ? 'true' : 'false',
				member.isRedundantRfExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.rfTag || '',
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
 * @param {object} auditResult Result from auditFiberTelecomRfVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildFiberTelecomRfJsonManifest(auditResult) {
	const payload = {
		schema: FIBER_TELECOM_RF_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || FIBER_TELECOM_RF_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			rfToolchain: cluster.rfToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			rfAnchorKey: cluster.rfAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCalStd: cluster.hasProtectedCalStd,
			hasProtectedFiberRfMaster: cluster.hasProtectedFiberRfMaster,
			hasProtectedRegulatoryRf: cluster.hasProtectedRegulatoryRf,
			hasRedundantRfExport: cluster.hasRedundantRfExport,
			hasRfScratchIntermediate: cluster.hasRfScratchIntermediate,
			hasFiberRfMasterAnchor: cluster.hasFiberRfMasterAnchor,
			rfTags: cluster.rfTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				rfTag: member.rfTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantRfExportMember: member.isRedundantRfExportMember,
				isScratchPath: member.isScratchPath,
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
 * cloud sync of Keysight, Rohde & Schwarz, Anritsu, GNU Radio SDR, HFSS, CST, and OTDR staging directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildFiberTelecomRfSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Fiber-Optic, Telecom RF & Baseband IQ Vaults',
		'vna_tmp/',
		'keysight_cache/',
		'rohde_scratch/',
		'anritsu_tmp/',
		'sdr_staging/',
		'gnuradio_tmp/',
		'hfss_scratch/',
		'cst_cache/',
		'otdr_staging/',
		'iq_ringbuf/',
		'drive_test_tmp/',
		'em_solver_tmp/',
		'rf_cache/',
		'spectrum_tmp/',
		'solver_scratch/',
		'capture_tmp/',
		'*.sor.tmp',
		'*.iq.tmp',
		'*.s2p.bak',
		'*.s4p.bak',
		'*.aedt.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
