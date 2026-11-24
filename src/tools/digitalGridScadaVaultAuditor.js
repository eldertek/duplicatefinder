/**
 * Pure Digital Grid, Substation SCADA, Protection Relay & Synchrophasor Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Digital Grid & SCADA Vault families:
 * - NERC CIP, PRC-002 & IEC 61850 SCL (.scd, .cid, .icd, .ssd, .rdb, .par, .urs, .rio, .xrio, NERC CIP / PRC-002)
 * - COMTRADE, PMU & Grid Model Masters (.cff, .pqd, .pqdif, .pmu, .pdat, .c37, .cev, .eve, .osc, .cfg/.dat, .raw, .dyr, .pfd, .pscx, .dss)
 * - Redundant SCADA, Waveform & Solver Exports (.csv, .tsv, .txt, .xlsx, .mat, .pl4, .out, .lis, .plt in grid/SCADA context)
 * - Solver & Historian Scratch (pscad_tmp/, psse_scratch/, powerfactory_tmp/, emtp_cache/, omicron_tmp/, sel_tmp/, .tmp, .lck)
 *
 * Enforces strict NERC CIP / PRC-002, IEC 61850 SCL, and COMTRADE/PMU anchor defaults:
 * - Strictly conserves NERC CIP, PRC-002 fault disturbance evidence, and golden IEC 61850 SCL configs
 * - Strictly conserves verified IEEE C37.111 COMTRADE, IEEE 1159.3 PQDIF, IEEE C37.118 PMU, and PSS/E/PowerFactory/PSCAD masters
 * - Detects redundant CSV/MAT/PL4/OUT waveform and solver exports when a verified COMTRADE/PMU/grid master anchor exists
 * - Blocks deletion of raw SCADA/waveform exports lacking a verified COMTRADE/PMU/grid anchor when guard is active
 * - Blocks hardlinks on mutable SCL/CSV/script files and solver/historian scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const DIGITAL_GRID_SCADA_VAULT_SCHEMA = 'duplicatefinder.digital-grid-scada-vault-auditor.v1'

export const DIGITAL_GRID_SCADA_FAMILIES = Object.freeze([
	'all',
	'nerc-cip-substation-scl',
	'comtrade-pmu-grid-anchors',
	'redundant-scada-csv-exports',
	'grid-solver-scada-scratch',
])

export const DIGITAL_GRID_SCADA_FAMILY_META = Object.freeze({
	'nerc-cip-substation-scl': {
		id: 'nerc-cip-substation-scl',
		label: 'NERC CIP & IEC 61850 SCL',
		shortLabel: 'IEC 61850 SCL, Relay Settings & NERC CIP (.scd, .cid, .icd, .ssd, .rdb, .rio, PRC-002)',
	},
	'comtrade-pmu-grid-anchors': {
		id: 'comtrade-pmu-grid-anchors',
		label: 'COMTRADE, PMU & Grid Models',
		shortLabel: 'Verified Masters (.cff, .cfg/.dat, .pqdif, .pmu, .c37, .cev, .raw, .pfd, .pscx, .dss)',
	},
	'redundant-scada-csv-exports': {
		id: 'redundant-scada-csv-exports',
		label: 'Redundant SCADA / CSV Exports',
		shortLabel: 'Uncompressed Exports (.csv, .mat, .pl4, .out, .lis, .plt, .xlsx)',
	},
	'grid-solver-scada-scratch': {
		id: 'grid-solver-scada-scratch',
		label: 'Solver & Historian Scratch',
		shortLabel: 'Grid Scratch (pscad_tmp/, psse_scratch/, powerfactory_tmp/, emtp_cache/, sel_tmp/, .lck)',
	},
})

export const DIGITAL_GRID_SCADA_STRATEGIES = Object.freeze([
	'prune-exports-and-grid-scratch',
	'hardlink-immutable-comtrade-and-pmu',
	'quarantine-exports-and-grid-scratch',
])

export const DIGITAL_GRID_SCADA_SURVIVOR_RULES = Object.freeze([
	'scl-comtrade-first',
	'oldest-disturbance-first',
	'newest-relay-revision-first',
	'shortest-path',
])

export const DIGITAL_GRID_SCADA_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'nerc-cip-scl-protected',
	'comtrade-pmu-protected',
	'fault-evidence-protected',
	'scada-export-redundant',
	'grid-scratch-intermediate',
	'shielded',
])

export const DIGITAL_GRID_SCADA_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const DIGITAL_GRID_SCADA_PRESETS = Object.freeze([
	{
		id: 'all-digital-grid-audit',
		name: 'All Digital Grid & SCADA Vaults',
		description: 'Audit NERC CIP / PRC-002 disturbance packages, IEC 61850 SCL (.scd/.cid/.icd), COMTRADE & PMU synchrophasor masters, PSS/E/PowerFactory/PSCAD cases, CSV/PL4 exports, and solver scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-grid-scratch',
		survivorRule: 'scl-comtrade-first',
		protectNercCipAndScl: true,
		protectComtradePmuAnchors: true,
		protectFaultEvidence: true,
		requireComtradeAnchorForPrune: true,
		keepRecentGridEventDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'grid-solver-scratch-cleanup',
		name: 'Solver & Historian Scratch',
		description: 'Reclaim pscad_tmp/, psse_scratch/, powerfactory_tmp/, emtp_cache/, omicron_tmp/, sel_tmp/, and .tmp/.lck scratch older than the active switching/event grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-grid-scratch',
		survivorRule: 'scl-comtrade-first',
		protectNercCipAndScl: true,
		protectComtradePmuAnchors: true,
		protectFaultEvidence: true,
		requireComtradeAnchorForPrune: true,
		keepRecentGridEventDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-scada-csv-vs-comtrade',
		name: 'Redundant .csv/.pl4 vs COMTRADE',
		description: 'Detect uncompressed historian CSV dumps and EMTP/PSCAD .pl4/.out/.lis plot exports backed by a verified COMTRADE (.cff/.cfg/.dat), PQDIF, PMU, or grid simulation anchor.',
		familyFilter: 'redundant-scada-csv-exports',
		strategy: 'quarantine-exports-and-grid-scratch',
		survivorRule: 'scl-comtrade-first',
		protectNercCipAndScl: true,
		protectComtradePmuAnchors: true,
		protectFaultEvidence: true,
		requireComtradeAnchorForPrune: true,
		keepRecentGridEventDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'iec61850-scl-nerc-cip-shield',
		name: 'IEC 61850 SCL & NERC CIP Shield',
		description: 'Inspect substation .scd/.cid/.icd/.ssd engineering configs, relay settings (.rdb/.rio/.par), and NERC CIP / PRC-002 compliance records under strict retention protection.',
		familyFilter: 'nerc-cip-substation-scl',
		strategy: 'hardlink-immutable-comtrade-and-pmu',
		survivorRule: 'scl-comtrade-first',
		protectNercCipAndScl: true,
		protectComtradePmuAnchors: true,
		protectFaultEvidence: true,
		requireComtradeAnchorForPrune: true,
		keepRecentGridEventDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'pmu-synchrophasor-relay-audit',
		name: 'PMU Synchrophasor & Relay Events',
		description: 'Audit IEEE C37.118 PMU synchrophasor archives, IEEE C37.111 COMTRADE waveforms, PQDIF power quality captures, and PSS/E / PowerFactory / PSCAD masters.',
		familyFilter: 'comtrade-pmu-grid-anchors',
		strategy: 'hardlink-immutable-comtrade-and-pmu',
		survivorRule: 'scl-comtrade-first',
		protectNercCipAndScl: true,
		protectComtradePmuAnchors: true,
		protectFaultEvidence: true,
		requireComtradeAnchorForPrune: true,
		keepRecentGridEventDays: 0,
		minSizeKb: 0,
	},
])

export const DIGITAL_GRID_SCADA_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-digital-grid-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-grid-scratch',
	survivorRule: 'scl-comtrade-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectNercCipAndScl: true,
	protectComtradePmuAnchors: true,
	protectFaultEvidence: true,
	requireComtradeAnchorForPrune: true,
	keepRecentGridEventDays: 0,
	minSizeKb: 0,
})

const STRICT_SCL_RELAY_EXT_RE = /\.(?:scd|cid|icd|iid|ssd|sed|rdb|par|urs|rio|xrio|occ|nrm)$/i
const CONTEXT_NERC_DOC_EXT_RE = /\.(?:xml|json|pdf|evtx|sig|p7s)$/i
const STRICT_COMTRADE_PMU_EXT_RE = /\.(?:cff|pqd|pqdif|pmu|pdat|c37|phzr|cev|eve|osc|hdr)$/i
const COMTRADE_PAIR_EXT_RE = /\.(?:cfg|dat)$/i
const COMPRESSED_GRID_ARCHIVE_EXT_RE = /\.(?:cfg\.zst|dat\.zst|cff\.zst|pqd\.zst|pmu\.zst|comtrade\.zip|comtrade\.7z)$/i
const GRID_SIM_MODEL_EXT_RE = /\.(?:raw|dyr|sav|pfd|dz|dss|pscx|psx|emtp|atp|oti|epj)$/i
const CONTEXT_GRID_HDF5_EXT_RE = /\.(?:h5|hdf5|parquet|tdms)$/i
const CONTEXT_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|mat|pl4|out|lis|plt|asc)$/i
const STRICT_GRID_SCRATCH_EXT_RE = /\.(?:cfg\.tmp|dat\.tmp|scd\.bak|pscad\.tmp|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp)$/i

const GRID_CONTEXT_HINT_RE = /(?:substation|iec61850|iec_61850|comtrade|synchrophasor|phasor|pmu|scada|nerc|cip|prc-002|prc_002|prc-024|relay|oscillography|disturbance|breaker_trip|fault_record|psse|pscad|powerfactory|digsilent|opendss|emtp|etap|omicron|sel_|enervista|pcm600|digsi|dnp3|iec104|goose|feeder|transformer|busbar|grid_vault)/i
const NERC_CIP_PATH_RE = /(?:nerc|cip|iec61850|iec_61850|scl_master|golden_scd|substation_config|relay_settings|protection_scheme|baseline_config|firmware_audit|substation_audit|switching_order)/i
const FAULT_EVIDENCE_PATH_RE = /(?:prc-002|prc_002|prc-024|prc-026|fault_evidence|fault_record|breaker_trip|relay_trip|disturbance_record|blackout_event|recloser_trip|misoperation|oscillography_hold)/i
const GRID_SCRATCH_PATH_RE = /(?:pscad_tmp|psse_scratch|psse_tmp|powerfactory_tmp|digsilent_cache|etap_tmp|opendss_tmp|emtp_cache|omicron_tmp|sel_tmp|comtrade_tmp|scada_cache|historian_staging|pmu_buffer|solver_scratch|waveform_cache)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_nerc_cip|canonical|substation_master|comtrade_vault|pmu_archive|scl_repo|production_cases)/i

/**
 * Normalize configuration values for Digital Grid & SCADA Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeDigitalGridScadaConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = DIGITAL_GRID_SCADA_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.familyFilter
	const verdictFilter = DIGITAL_GRID_SCADA_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.verdictFilter
	const strategy = DIGITAL_GRID_SCADA_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.strategy
	const survivorRule = DIGITAL_GRID_SCADA_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.survivorRule
	const sortMode = DIGITAL_GRID_SCADA_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentGridEventDays)
	const keepRecentGridEventDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: DIGITAL_GRID_SCADA_DEFAULT_CONFIG.keepRecentGridEventDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : DIGITAL_GRID_SCADA_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectNercCipAndScl: cfg.protectNercCipAndScl !== undefined ? Boolean(cfg.protectNercCipAndScl) : true,
		protectComtradePmuAnchors: cfg.protectComtradePmuAnchors !== undefined ? Boolean(cfg.protectComtradePmuAnchors) : true,
		protectFaultEvidence: cfg.protectFaultEvidence !== undefined ? Boolean(cfg.protectFaultEvidence) : true,
		requireComtradeAnchorForPrune: cfg.requireComtradeAnchorForPrune !== undefined ? Boolean(cfg.requireComtradeAnchorForPrune) : true,
		keepRecentGridEventDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized grid case / disturbance stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} normalized Full normalized path.
 * @return {string} Normalized grid event or case stem.
 */
export function extractGridEventStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:cfg\.zst|dat\.zst|cff\.zst|pqd\.zst|pmu\.zst|comtrade\.zip|comtrade\.7z|cfg\.tmp|dat\.tmp|scd\.bak|pscad\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(/(?:_export|_waveform|_osc|_pmu|_csv|_dump|_plot|_trace|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'grid-case'
}

/**
 * Extract canonical anchor key linking raw CSV/MAT/PL4/OUT exports to COMTRADE/PMU/grid masters.
 *
 * @param {string} runStem Extracted event or case stem.
 * @return {string} Canonical anchor key.
 */
export function extractGridAnchorKey(runStem) {
	return String(runStem || 'grid-case')
		.toLowerCase()
		.replace(/(?:_historian|_scada|_export|_ascii|_channel_\d+|_phase_[abc]|_3ph)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'grid-case'
}

/**
 * Detect substation toolchain and workflow stage from normalized path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ gridToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractGridToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let gridToolchain = ''
	if (/iec61850|iec_61850|\.(?:scd|cid|icd|iid|ssd|sed)\b|goose/.test(text)) {
		gridToolchain = 'IEC 61850 SCL'
	} else if (/sel_|synchrowave|\.(?:cev|eve|rdb)\b/.test(text)) {
		gridToolchain = 'SEL SynchroWAVe / AcSELerator'
	} else if (/omicron|\.(?:rio|xrio|occ)\b/.test(text)) {
		gridToolchain = 'OMICRON Test Universe'
	} else if (/digsi|siemens|siprotec/.test(text)) {
		gridToolchain = 'Siemens DIGSI / SIPROTEC'
	} else if (/pcm600|abb|relion/.test(text)) {
		gridToolchain = 'ABB PCM600 / Relion'
	} else if (/enervista|multilin|\.urs\b/.test(text)) {
		gridToolchain = 'GE UR / EnerVista'
	} else if (/psse|\.(?:raw|dyr|sav)\b/.test(text)) {
		gridToolchain = 'Siemens PSS/E'
	} else if (/powerfactory|digsilent|\.(?:pfd|dz)\b/.test(text)) {
		gridToolchain = 'DIgSILENT PowerFactory'
	} else if (/pscad|\.(?:pscx|psx)\b/.test(text)) {
		gridToolchain = 'PSCAD / EMTDC'
	} else if (/emtp|atp|\.(?:emtp|atp|pl4)\b/.test(text)) {
		gridToolchain = 'EMTP / ATP'
	} else if (/opendss|\.dss\b/.test(text)) {
		gridToolchain = 'EPRI OpenDSS'
	} else if (/etap|\.(?:oti|epj)\b/.test(text)) {
		gridToolchain = 'ETAP Power System'
	} else if (/comtrade|\.(?:cff|cfg|dat|hdr)\b/.test(text)) {
		gridToolchain = 'IEEE C37.111 COMTRADE'
	} else if (/\.(?:pmu|pdat|c37|phzr)\b|synchrophasor|c37_118/.test(text)) {
		gridToolchain = 'IEEE C37.118 PMU'
	} else if (/\.(?:pqd|pqdif)\b/.test(text)) {
		gridToolchain = 'IEEE 1159.3 PQDIF'
	}

	let workflowStage = ''
	if (/prc-002|prc_002|fault_evidence|breaker_trip|disturbance/.test(text)) {
		workflowStage = 'PRC-002 Fault Evidence'
	} else if (/nerc|cip|substation_audit|baseline/.test(text)) {
		workflowStage = 'NERC CIP Compliance'
	} else if (/\.(?:scd|cid|icd|ssd)\b/.test(text)) {
		workflowStage = 'Substation Engineering SCL'
	} else if (/\.(?:cff|cfg|dat|pqdif|pmu|c37|cev)\b/.test(text)) {
		workflowStage = 'Waveform & Synchrophasor'
	} else if (/\.(?:raw|dyr|pfd|pscx|dss|emtp)\b/.test(text)) {
		workflowStage = 'Transient / Loadflow Case'
	} else if (GRID_SCRATCH_PATH_RE.test(text) || STRICT_GRID_SCRATCH_EXT_RE.test(text)) {
		workflowStage = 'Solver / Historian Scratch'
	} else if (CONTEXT_EXPORT_EXT_RE.test(basename)) {
		workflowStage = 'SCADA / Plot Export'
	}

	return { gridToolchain, workflowStage }
}

/**
 * Extract domain tag badge (voltage level, bay, standard, or relay tag) when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractGridStandardTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (/prc-002|prc_002/.test(text)) {
		return 'NERC PRC-002'
	}
	if (/nerc|cip/.test(text)) {
		return 'NERC CIP'
	}
	if (/iec61850|iec_61850|\.(?:scd|cid|icd|ssd)\b/.test(text)) {
		return 'IEC 61850'
	}
	if (/c37\.?118|\.(?:pmu|pdat|c37|phzr)\b/.test(text)) {
		return 'IEEE C37.118'
	}
	if (/comtrade|\.(?:cff|pqd|pqdif)\b/.test(text)) {
		return 'IEEE C37.111'
	}
	const kvMatch = text.match(/\b(\d{2,3}kv)\b/i)
	if (kvMatch) {
		return kvMatch[1].toUpperCase()
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
 * Classify a single file within the Digital Grid, Substation SCADA & Synchrophasor domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyDigitalGridScadaFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasGridContext = GRID_CONTEXT_HINT_RE.test(lower)
	const isGridScratchPath = GRID_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_GRID_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isNercCipPath = NERC_CIP_PATH_RE.test(lower)
	const isFaultEvidencePath = FAULT_EVIDENCE_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)

	const isStrictSclRelayExt = STRICT_SCL_RELAY_EXT_RE.test(lowerBase)
	const isContextNercDoc = CONTEXT_NERC_DOC_EXT_RE.test(lowerBase) && (isNercCipPath || isFaultEvidencePath || hasGridContext)
	const isStrictComtradePmuExt = STRICT_COMTRADE_PMU_EXT_RE.test(lowerBase) || COMPRESSED_GRID_ARCHIVE_EXT_RE.test(lowerBase)
	const isComtradePairExt = COMTRADE_PAIR_EXT_RE.test(lowerBase) && hasGridContext
	const isGridSimModelExt = GRID_SIM_MODEL_EXT_RE.test(lowerBase) && (hasGridContext || /\.(?:pfd|pscx|emtp|dss|dyr)$/i.test(lowerBase))
	const isContextGridHdf5 = CONTEXT_GRID_HDF5_EXT_RE.test(lowerBase) && hasGridContext
	const isContextExportExt = CONTEXT_EXPORT_EXT_RE.test(lowerBase) && hasGridContext

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Digital Grid Vault'
	let isProtectedNercCipScl = false
	let isProtectedComtradePmu = false
	let isProtectedFaultEvidence = false
	let isComtradePmuAnchor = false
	let isRedundantScadaExport = false
	let isMutableFile = false

	if (isStrictScratchExt || (isGridScratchPath && (isGenericScratchExt || isContextExportExt || isComtradePairExt || isStrictComtradePmuExt)) || (isGenericScratchExt && hasGridContext)) {
		family = 'grid-solver-scada-scratch'
		artifactKind = isStrictScratchExt ? 'Relay / Solver Lock or Temp' : 'Solver / Historian Scratch'
		vaultRole = 'PSCAD / PSS/E / PowerFactory / Historian Scratch'
		isMutableFile = true
	} else if (isFaultEvidencePath && (isStrictSclRelayExt || isStrictComtradePmuExt || isComtradePairExt || isContextNercDoc)) {
		family = 'nerc-cip-substation-scl'
		artifactKind = 'PRC-002 / Fault Disturbance Evidence'
		vaultRole = 'Regulatory Disturbance & Relay Trip Evidence'
		isProtectedFaultEvidence = true
		isProtectedNercCipScl = true
		isComtradePmuAnchor = isStrictComtradePmuExt || isComtradePairExt
	} else if (isStrictSclRelayExt || isContextNercDoc) {
		family = 'nerc-cip-substation-scl'
		artifactKind = isStrictSclRelayExt ? 'IEC 61850 SCL / Relay Settings' : 'NERC CIP Compliance Artifact'
		vaultRole = 'Substation Automation & NERC CIP Master'
		isProtectedNercCipScl = true
		isMutableFile = /\.(?:scd|cid|icd|iid|ssd|sed|xml|json)$/i.test(lowerBase)
	} else if (isStrictComtradePmuExt || isComtradePairExt || isGridSimModelExt || isContextGridHdf5) {
		family = 'comtrade-pmu-grid-anchors'
		if (isGridSimModelExt) {
			artifactKind = 'Grid Loadflow / EMT Simulation Case'
			vaultRole = 'PSS/E / PowerFactory / PSCAD / OpenDSS Master'
		} else if (/\.(?:pmu|pdat|c37|phzr)\b/i.test(lowerBase) || isContextGridHdf5) {
			artifactKind = 'PMU Synchrophasor Archive'
			vaultRole = 'IEEE C37.118 Synchrophasor Master'
		} else {
			artifactKind = 'COMTRADE / PQDIF Waveform Master'
			vaultRole = 'IEEE C37.111 / PQDIF Oscillography Master'
		}
		isProtectedComtradePmu = true
		isComtradePmuAnchor = true
	} else if (isContextExportExt) {
		family = 'redundant-scada-csv-exports'
		artifactKind = 'SCADA / Waveform CSV or Plot Export'
		vaultRole = 'Derived Historian CSV / Solver Plot Export'
		isRedundantScadaExport = true
		isMutableFile = true
	}

	const { gridToolchain, workflowStage } = extractGridToolchainAndStage(normalized, basename)
	const runStem = extractGridEventStem(basename, normalized)
	const gridAnchorKey = extractGridAnchorKey(runStem)
	const gridTag = extractGridStandardTag(lowerBase, lower)

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
		gridToolchain,
		workflowStage,
		runStem,
		gridAnchorKey,
		gridTag,
		isProtectedNercCipScl,
		isProtectedComtradePmu,
		isProtectedFaultEvidence,
		isComtradePmuAnchor,
		isRedundantScadaExport,
		isMutableFile,
		isGridScratchPath: isGridScratchPath || isStrictScratchExt || (isGenericScratchExt && hasGridContext),
		isNercCipPath,
		isFaultEvidencePath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Digital Grid & Substation SCADA Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isDigitalGridScadaGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyDigitalGridScadaFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified COMTRADE/PMU/grid-model masters
 * to uncompressed SCADA CSV, MAT, PL4, and OUT exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildDigitalGridScadaCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyDigitalGridScadaFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isComtradePmuAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.gridAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Digital Grid & SCADA cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'nerc-cip-substation-scl')) {
		return 'nerc-cip-substation-scl'
	}
	if (members.some(m => m.family === 'comtrade-pmu-grid-anchors')) {
		return 'comtrade-pmu-grid-anchors'
	}
	if (members.some(m => m.family === 'redundant-scada-csv-exports')) {
		return 'redundant-scada-csv-exports'
	}
	return 'grid-solver-scada-scratch'
}

/**
 * Compute deterministic survivor priority score for a Digital Grid & SCADA vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-disturbance-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedFaultEvidence ? 100000 : 0)
			+ (member.isProtectedNercCipScl ? 97000 : 0)
			+ (member.isProtectedComtradePmu ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isGridScratchPath ? -55000 : 0)
			+ (member.isRedundantScadaExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-relay-revision-first') {
		return (member.isProtectedFaultEvidence ? 100000 : 0)
			+ (member.isProtectedNercCipScl ? 97000 : 0)
			+ (member.isProtectedComtradePmu ? 94000 : 0)
			+ (member.isGridScratchPath ? -50000 : 0)
			+ (member.isRedundantScadaExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedFaultEvidence ? 52000 : 0)
			+ (member.isProtectedNercCipScl ? 50000 : 0)
			+ (member.isProtectedComtradePmu ? 48000 : 0)
			+ (member.isGridScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedFaultEvidence ? 100000 : 0)
		+ (member.isProtectedNercCipScl ? 97000 : 0)
		+ (member.isProtectedComtradePmu ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantScadaExport ? -45000 : 0)
		+ (member.isGridScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Digital Grid, Substation SCADA & Synchrophasor duplicate cluster.
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
		const meta = classifyDigitalGridScadaFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.gridToolchain)?.gridToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractGridEventStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].gridAnchorKey || extractGridAnchorKey(primaryStem)

	const hasComtradePmuAnchor = Boolean(
		rawMembers.some(m => m.isComtradePmuAnchor)
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

		const isRedundantScadaExportMember = member.isRedundantScadaExport && hasComtradePmuAnchor

		let redundancyReason = ''
		if (member.isRedundantScadaExport) {
			redundancyReason = isRedundantScadaExportMember
				? 'Uncompressed .csv/.pl4/.out/.mat duplicates verified COMTRADE/PMU/grid model anchor'
				: 'SCADA/waveform export without verified COMTRADE/PMU/grid model anchor'
		}

		let governanceTier = 'grid-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedFaultEvidence
				? 'fault-evidence-protected'
				: (member.isProtectedNercCipScl
					? 'nerc-cip-scl-protected'
					: (member.isProtectedComtradePmu
						? 'comtrade-pmu-protected'
						: (member.isRedundantScadaExport
							? 'scada-export-redundant'
							: 'grid-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedFaultEvidence && config.protectFaultEvidence) {
			governanceTier = 'fault-evidence-protected'
			shielded = true
			protectedReason = 'NERC PRC-002 fault disturbance and relay trip evidence strictly conserved'
		} else if (member.isProtectedNercCipScl && config.protectNercCipAndScl) {
			governanceTier = 'nerc-cip-scl-protected'
			shielded = true
			protectedReason = 'NERC CIP baseline, IEC 61850 SCL (.scd/.cid/.icd), or relay config strictly conserved'
		} else if (member.isProtectedComtradePmu && config.protectComtradePmuAnchors) {
			governanceTier = 'comtrade-pmu-protected'
			shielded = true
			protectedReason = 'Verified COMTRADE, IEEE C37.118 PMU, or grid model master strictly conserved'
		} else if (isSurvivor && !isRedundantScadaExportMember) {
			governanceTier = member.isProtectedFaultEvidence
				? 'fault-evidence-protected'
				: (member.isProtectedNercCipScl
					? 'nerc-cip-scl-protected'
					: (member.isProtectedComtradePmu
						? 'comtrade-pmu-protected'
						: (member.isRedundantScadaExport
							? 'scada-export-redundant'
							: 'grid-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Digital Grid & SCADA vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantScadaExport
				? 'scada-export-redundant'
				: (member.isProtectedNercCipScl
					? 'nerc-cip-scl-protected'
					: 'grid-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-comtrade-and-pmu' && !member.isMutableFile && !member.isGridScratchPath
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
			config.keepRecentGridEventDays > 0
			&& member.isGridScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentGridEventDays
		) {
			governanceTier = 'grid-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentGridEventDays}-day active switching and event grace window`
		} else if (member.isRedundantScadaExport) {
			governanceTier = 'scada-export-redundant'
			if (config.requireComtradeAnchorForPrune && !hasComtradePmuAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified COMTRADE (.cff/.cfg/.dat), PMU, or grid model anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isGridScratchPath) {
			governanceTier = 'grid-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'PSCAD/PSS/E/PowerFactory/EMTP scratch or lock file eligible for cleanup'
		} else if (member.isProtectedComtradePmu || member.isProtectedNercCipScl) {
			governanceTier = member.isProtectedNercCipScl ? 'nerc-cip-scl-protected' : 'comtrade-pmu-protected'
			action = config.strategy === 'hardlink-immutable-comtrade-and-pmu' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-comtrade-and-pmu' && !member.isMutableFile) {
			governanceTier = 'comtrade-pmu-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'grid-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantScadaExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantScadaExport = members.some(m => m.isRedundantScadaExportMember || m.isRedundantScadaExport)
	const hasProtectedFaultEvidence = members.some(m => m.governanceTier === 'fault-evidence-protected' && m.shielded)
	const hasProtectedNercCipScl = members.some(m => m.governanceTier === 'nerc-cip-scl-protected' && m.shielded)
	const hasProtectedComtradePmu = members.some(m => m.governanceTier === 'comtrade-pmu-protected' && m.shielded)
	const hasGridScratchIntermediate = members.some(m => m.isGridScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantScadaExportMember && !m.shielded)) {
			clusterVerdict = 'scada-export-redundant'
		} else if (members.some(m => m.isGridScratchPath && !m.shielded)) {
			clusterVerdict = 'grid-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedFaultEvidence) {
		clusterVerdict = 'fault-evidence-protected'
	} else if (hasProtectedNercCipScl) {
		clusterVerdict = 'nerc-cip-scl-protected'
	} else if (hasProtectedComtradePmu) {
		clusterVerdict = 'comtrade-pmu-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantScadaExport ? 95 : 85
	} else if (hasProtectedFaultEvidence) {
		priorityScore = 60
	} else if (hasProtectedNercCipScl) {
		priorityScore = 50
	}

	const gridTags = [...new Set(members.map(m => m.gridTag).filter(Boolean))]
	const familyMeta = DIGITAL_GRID_SCADA_FAMILY_META[family] || DIGITAL_GRID_SCADA_FAMILY_META['grid-solver-scada-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		gridToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		gridAnchorKey: primaryAnchorKey,
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
		hasProtectedNercCipScl,
		hasProtectedComtradePmu,
		hasProtectedFaultEvidence,
		hasRedundantScadaExport,
		hasGridScratchIntermediate,
		hasComtradePmuAnchor,
		gridTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Digital Grid, Substation SCADA & Synchrophasor Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Digital Grid & SCADA audit report.
 */
export function auditDigitalGridScadaVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeDigitalGridScadaConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isDigitalGridScadaGroup)
	const correlationIndex = buildDigitalGridScadaCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'nerc-cip-substation-scl': 0,
		'comtrade-pmu-grid-anchors': 0,
		'redundant-scada-csv-exports': 0,
		'grid-solver-scada-scratch': 0,
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
				cluster.gridToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.gridAnchorKey,
				cluster.familyLabel,
				...cluster.gridTags,
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
	let totalNercCipSclClusters = 0
	let totalComtradePmuClusters = 0
	let totalFaultEvidenceClusters = 0
	let totalRedundantExportClusters = 0
	let totalGridScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedNercCipScl) {
			totalNercCipSclClusters += 1
		}
		if (cluster.hasProtectedComtradePmu) {
			totalComtradePmuClusters += 1
		}
		if (cluster.hasProtectedFaultEvidence) {
			totalFaultEvidenceClusters += 1
		}
		if (cluster.hasRedundantScadaExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasGridScratchIntermediate) {
			totalGridScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = DIGITAL_GRID_SCADA_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: DIGITAL_GRID_SCADA_FAMILY_META[id].label,
			shortLabel: DIGITAL_GRID_SCADA_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: DIGITAL_GRID_SCADA_VAULT_SCHEMA,
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
			totalNercCipSclClusters,
			totalComtradePmuClusters,
			totalFaultEvidenceClusters,
			totalRedundantExportClusters,
			totalGridScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Digital Grid & SCADA Vaults.
 * Strictly blocks deletion or hardlinking of shielded NERC CIP/SCL records, PRC-002 fault evidence,
 * and verified COMTRADE/PMU/grid masters, and never hardlinks mutable files or solver scratch.
 *
 * @param {object} auditResult Result from auditDigitalGridScadaVault.
 * @return {string} POSIX bash script.
 */
export function buildDigitalGridScadaRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Digital Grid, Substation SCADA, Protection Relay & Synchrophasor Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./digital-grid-scada-vault-reclaim.sh only after verifying COMTRADE/PMU and NERC CIP anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.digital-grid-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-grid-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isGridScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-exports-and-grid-scratch' && (target.isRedundantScadaExport || target.isGridScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable CSV/PL4 exports or solver scratch under active Digital Grid vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Digital Grid & SCADA Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditDigitalGridScadaVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildDigitalGridScadaCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'grid_toolchain',
		'workflow_stage',
		'run_stem',
		'grid_anchor_key',
		'family',
		'cluster_verdict',
		'has_comtrade_pmu_anchor',
		'is_redundant_scada_export',
		'is_grid_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'grid_tag',
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
				cluster.gridToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.gridAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasComtradePmuAnchor ? 'true' : 'false',
				member.isRedundantScadaExportMember ? 'true' : 'false',
				member.isGridScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.gridTag || '',
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
 * @param {object} auditResult Result from auditDigitalGridScadaVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildDigitalGridScadaJsonManifest(auditResult) {
	const payload = {
		schema: DIGITAL_GRID_SCADA_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || DIGITAL_GRID_SCADA_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			gridToolchain: cluster.gridToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			gridAnchorKey: cluster.gridAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedNercCipScl: cluster.hasProtectedNercCipScl,
			hasProtectedComtradePmu: cluster.hasProtectedComtradePmu,
			hasProtectedFaultEvidence: cluster.hasProtectedFaultEvidence,
			hasRedundantScadaExport: cluster.hasRedundantScadaExport,
			hasGridScratchIntermediate: cluster.hasGridScratchIntermediate,
			hasComtradePmuAnchor: cluster.hasComtradePmuAnchor,
			gridTags: cluster.gridTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				gridTag: member.gridTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantScadaExportMember: member.isRedundantScadaExportMember,
				isGridScratchPath: member.isGridScratchPath,
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
 * cloud sync of PSCAD, PSS/E, PowerFactory, EMTP, OMICRON, and historian scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildDigitalGridScadaSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Digital Grid, Substation SCADA & Synchrophasor Vaults',
		'pscad_tmp/',
		'psse_scratch/',
		'psse_tmp/',
		'powerfactory_tmp/',
		'digsilent_cache/',
		'etap_tmp/',
		'opendss_tmp/',
		'emtp_cache/',
		'omicron_tmp/',
		'sel_tmp/',
		'comtrade_tmp/',
		'scada_cache/',
		'historian_staging/',
		'pmu_buffer/',
		'solver_scratch/',
		'waveform_cache/',
		'*.cfg.tmp',
		'*.dat.tmp',
		'*.scd.bak',
		'*.pscad.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
