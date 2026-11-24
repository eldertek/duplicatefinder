/**
 * Pure Energy, Seismic SEG-Y, Well-Log & Reservoir Simulation Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Energy & Subsurface Vault families:
 * - OSDU, PPDM & Well-Log Masters (.las, .dlis, .lis, .witsml, .prodml, .resqml, .epc, .ukooa, .p7, BSEE / CCUS compliance)
 * - Seismic & Reservoir Anchors (.segy, .sgy, .zgy, .vds, .sep, .su, .rsf, .bri, .data, .grdecl, .egrid, .init, .unrst, .smspec, .unsmry, .pet, .ptd)
 * - Redundant ASCII / CSV / Excel Exports (.csv, .tsv, .txt, .xlsx, .asc, .xyz, .rsm in seismic/well/reservoir context)
 * - Simulator & Processing Scratch (petrel_tmp/, eclipse_scratch/, tnav_cache/, cmg_tmp/, proMAX_scratch/, segy_staging/, kingdom_cache/, landmark_tmp/, opm_tmp/, .sgy.tmp, .lck)
 *
 * Enforces strict OSDU / WITSML / Well-Log, Seismic SEG-Y/OpenZGY, and Reservoir Restart anchor defaults:
 * - Strictly conserves regulatory BSEE/NSTA well-integrity, CCUS injection, and mudlog/drilling compliance records
 * - Strictly conserves OSDU/PPDM manifests, Energistics WITSML/RESQML packages, and well-log .las/.dlis/.lis masters
 * - Strictly conserves verified SEG-Y, OpenZGY, VDS seismic volumes and ECLIPSE/tNavigator/CMG/OPM reservoir simulation masters
 * - Detects redundant CSV/XYZ/RSM/ASCII trace and summary exports when a verified SEG-Y/ZGY/DLIS/ECLIPSE anchor exists
 * - Blocks pruning of raw ASCII/CSV/XYZ exports lacking a verified seismic/well-log/reservoir anchor when guard is active
 * - Blocks hardlinks on mutable LAS/DATA/GRDECL/CSV/script files and simulator scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ENERGY_SEISMIC_VAULT_SCHEMA = 'duplicatefinder.energy-seismic-vault-auditor.v1'

export const ENERGY_SEISMIC_FAMILIES = Object.freeze([
	'all',
	'osdu-well-log-compliance',
	'seismic-reservoir-anchors',
	'redundant-seismic-ascii-exports',
	'subsurface-sim-scratch',
])

export const ENERGY_SEISMIC_FAMILY_META = Object.freeze({
	'osdu-well-log-compliance': {
		id: 'osdu-well-log-compliance',
		label: 'Well-Log, WITSML & OSDU',
		shortLabel: 'Well-Log & Regulatory Masters (.las, .dlis, .lis, .witsml, .resqml, .epc, .ukooa, BSEE/CCUS)',
	},
	'seismic-reservoir-anchors': {
		id: 'seismic-reservoir-anchors',
		label: 'Seismic & Reservoir Anchors',
		shortLabel: 'Verified Masters (.segy, .sgy, .zgy, .vds, .data, .grdecl, .egrid, .unrst, .unsmry, .pet)',
	},
	'redundant-seismic-ascii-exports': {
		id: 'redundant-seismic-ascii-exports',
		label: 'Redundant ASCII / CSV Exports',
		shortLabel: 'Derived Exports (.csv, .tsv, .txt, .xlsx, .asc, .xyz, .rsm)',
	},
	'subsurface-sim-scratch': {
		id: 'subsurface-sim-scratch',
		label: 'Simulator & Processing Scratch',
		shortLabel: 'Subsurface Scratch (petrel_tmp/, eclipse_scratch/, tnav_cache/, cmg_tmp/, segy_staging/, .lck)',
	},
})

export const ENERGY_SEISMIC_STRATEGIES = Object.freeze([
	'prune-exports-and-sim-scratch',
	'hardlink-immutable-seismic-and-unrst',
	'quarantine-exports-and-sim-scratch',
])

export const ENERGY_SEISMIC_SURVIVOR_RULES = Object.freeze([
	'osdu-segy-first',
	'oldest-survey-first',
	'newest-deck-revision-first',
	'shortest-path',
])

export const ENERGY_SEISMIC_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'osdu-welllog-protected',
	'seismic-reservoir-protected',
	'regulatory-ccus-protected',
	'ascii-export-redundant',
	'sim-scratch-intermediate',
	'shielded',
])

export const ENERGY_SEISMIC_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ENERGY_SEISMIC_PRESETS = Object.freeze([
	{
		id: 'all-energy-seismic-audit',
		name: 'All Energy & Subsurface Vaults',
		description: 'Audit OSDU/WITSML/RESQML well-log masters (.las/.dlis), SEG-Y/OpenZGY/VDS seismic volumes, ECLIPSE/tNavigator/CMG reservoir decks, CSV/XYZ/RSM exports, and processing scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-sim-scratch',
		survivorRule: 'osdu-segy-first',
		protectWellLogAndOsdu: true,
		protectSeismicReservoirAnchors: true,
		protectRegulatoryWellEvidence: true,
		requireSeismicAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'subsurface-scratch-cleanup',
		name: 'Simulator & Processing Scratch',
		description: 'Reclaim petrel_tmp/, eclipse_scratch/, tnav_cache/, cmg_tmp/, proMAX_scratch/, segy_staging/, and .sgy.tmp/.lck scratch older than the active processing grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-sim-scratch',
		survivorRule: 'osdu-segy-first',
		protectWellLogAndOsdu: true,
		protectSeismicReservoirAnchors: true,
		protectRegulatoryWellEvidence: true,
		requireSeismicAnchorForPrune: true,
		keepRecentSurveyDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-ascii-vs-segy-eclipse',
		name: 'Redundant .csv/.xyz/.rsm vs SEG-Y/ECLIPSE',
		description: 'Detect uncompressed ASCII horizon (.xyz), trace dump (.csv/.asc), and ECLIPSE summary (.rsm) exports backed by a verified SEG-Y, OpenZGY, DLIS, or ECLIPSE master anchor.',
		familyFilter: 'redundant-seismic-ascii-exports',
		strategy: 'quarantine-exports-and-sim-scratch',
		survivorRule: 'osdu-segy-first',
		protectWellLogAndOsdu: true,
		protectSeismicReservoirAnchors: true,
		protectRegulatoryWellEvidence: true,
		requireSeismicAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'well-log-osdu-compliance-shield',
		name: 'Well-Log (.las/.dlis) & OSDU Shield',
		description: 'Inspect wireline .las/.dlis/.lis logs, Energistics WITSML/RESQML packages, UKOOA/P1/90 navigation, and BSEE/CCUS regulatory compliance records under strict shield.',
		familyFilter: 'osdu-well-log-compliance',
		strategy: 'hardlink-immutable-seismic-and-unrst',
		survivorRule: 'osdu-segy-first',
		protectWellLogAndOsdu: true,
		protectSeismicReservoirAnchors: true,
		protectRegulatoryWellEvidence: true,
		requireSeismicAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'seismic-zgy-reservoir-anchors',
		name: 'SEG-Y, OpenZGY & Reservoir Masters',
		description: 'Audit 2D/3D/4D SEG-Y, OpenZGY, and VDS seismic volumes alongside ECLIPSE/tNavigator/CMG/OPM reservoir simulation grids (.egrid, .unrst, .unsmry, .pet).',
		familyFilter: 'seismic-reservoir-anchors',
		strategy: 'hardlink-immutable-seismic-and-unrst',
		survivorRule: 'osdu-segy-first',
		protectWellLogAndOsdu: true,
		protectSeismicReservoirAnchors: true,
		protectRegulatoryWellEvidence: true,
		requireSeismicAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
])

export const ENERGY_SEISMIC_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-energy-seismic-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-sim-scratch',
	survivorRule: 'osdu-segy-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectWellLogAndOsdu: true,
	protectSeismicReservoirAnchors: true,
	protectRegulatoryWellEvidence: true,
	requireSeismicAnchorForPrune: true,
	keepRecentSurveyDays: 0,
	minSizeKb: 0,
})

const STRICT_WELLLOG_OSDU_EXT_RE = /\.(?:las|dlis|lis|witsml|prodml|resqml|epc|ukooa|p190|p7|sgy_hdr|segy_hdr|mudlog)$/i
const CONTEXT_OSDU_DOC_EXT_RE = /\.(?:xml|json|pdf|sig|p7s)$/i
const STRICT_SEISMIC_VOLUME_EXT_RE = /\.(?:segy|sgy|zgy|vds|sep|su|rsf|bri|vol)$/i
const COMPRESSED_SEISMIC_EXT_RE = /\.(?:segy\.zst|sgy\.zst|zgy\.zst|dlis\.zst|segy\.tar\.gz|sgy\.gz)$/i
const RESERVOIR_SIM_MASTER_EXT_RE = /\.(?:egrid|grid|init|unrst|xrst|smspec|unsmry|pet|ptd|sr3|irf|mrf|grdecl)$/i
const RESERVOIR_DECK_EXT_RE = /\.(?:data|inc|sch|pvt|scal|sim|dat)$/i
const CONTEXT_SEISMIC_HDF5_EXT_RE = /\.(?:h5|hdf5|parquet|nc)$/i
const CONTEXT_ASCII_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|asc|xyz|rsm)$/i
const STRICT_SUBSURFACE_SCRATCH_EXT_RE = /\.(?:sgy\.tmp|segy\.tmp|las\.bak|sim\.tmp|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp)$/i

const ENERGY_CONTEXT_HINT_RE = /(?:seismic|segy|openzgy|zgy|well_?log|wireline|reservoir|petrel|eclipse|tnavigator|tnav|cmg_stars|opm_flow|pro_?max|geovation|kingdom|landmark|osdu|ppdm|witsml|resqml|prodml|ukooa|subsurface|geophysics|petrophysics|geothermal|ccus|co2_storage|microseismic|4d_survey|horizon|fault_model|bsee|nsta|energy_vault)/i
const OSDU_WELL_PATH_RE = /(?:osdu|ppdm|witsml|resqml|prodml|well_?log|wireline|petrophysics|mudlog|00_osdu|well_master|directional_survey|casing_program)/i
const REGULATORY_WELL_EVIDENCE_PATH_RE = /(?:bsee|nsta|ccus_permit|co2_injection|well_integrity|plug_abandon|p_and_a|regulatory_filing|microseismic_hold|induced_seismicity|blowout_audit|compliance_hold)/i
const SUBSURFACE_SCRATCH_PATH_RE = /(?:petrel_tmp|eclipse_scratch|eclipse_tmp|tnav_cache|tnav_tmp|cmg_tmp|cmg_scratch|promax_scratch|segy_staging|kingdom_cache|landmark_tmp|opm_tmp|geovation_cache|seismic_cache|reservoir_staging|solver_scratch|well_tmp)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_osdu|00_segy|canonical|seismic_vault|reservoir_archive|well_repo|production_models)/i

/**
 * Normalize configuration values for Energy, Seismic & Reservoir Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeEnergySeismicConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = ENERGY_SEISMIC_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: ENERGY_SEISMIC_DEFAULT_CONFIG.familyFilter
	const verdictFilter = ENERGY_SEISMIC_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: ENERGY_SEISMIC_DEFAULT_CONFIG.verdictFilter
	const strategy = ENERGY_SEISMIC_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: ENERGY_SEISMIC_DEFAULT_CONFIG.strategy
	const survivorRule = ENERGY_SEISMIC_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: ENERGY_SEISMIC_DEFAULT_CONFIG.survivorRule
	const sortMode = ENERGY_SEISMIC_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: ENERGY_SEISMIC_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentSurveyDays)
	const keepRecentSurveyDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: ENERGY_SEISMIC_DEFAULT_CONFIG.keepRecentSurveyDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : ENERGY_SEISMIC_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectWellLogAndOsdu: cfg.protectWellLogAndOsdu !== undefined ? Boolean(cfg.protectWellLogAndOsdu) : true,
		protectSeismicReservoirAnchors: cfg.protectSeismicReservoirAnchors !== undefined ? Boolean(cfg.protectSeismicReservoirAnchors) : true,
		protectRegulatoryWellEvidence: cfg.protectRegulatoryWellEvidence !== undefined ? Boolean(cfg.protectRegulatoryWellEvidence) : true,
		requireSeismicAnchorForPrune: cfg.requireSeismicAnchorForPrune !== undefined ? Boolean(cfg.requireSeismicAnchorForPrune) : true,
		keepRecentSurveyDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized seismic survey / well / reservoir run stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} normalized Full normalized path.
 * @return {string} Normalized subsurface survey or case stem.
 */
export function extractEnergySeismicStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:segy\.zst|sgy\.zst|zgy\.zst|dlis\.zst|segy\.tar\.gz|sgy\.gz|sgy\.tmp|segy\.tmp|las\.bak|sim\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(/(?:_export|_ascii|_trace_dump|_header_dump|_horizon|_csv|_rsm|_xyz|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'subsurface-case'
}

/**
 * Extract canonical anchor key linking derived ASCII/CSV/XYZ/RSM exports to SEG-Y/ZGY/DLIS/ECLIPSE masters.
 *
 * @param {string} runStem Extracted survey or simulation stem.
 * @return {string} Canonical anchor key.
 */
export function extractEnergySeismicAnchorKey(runStem) {
	return String(runStem || 'subsurface-case')
		.toLowerCase()
		.replace(/(?:_summary|_traces|_headers|_horizon|_grid_export|_ascii|_dump|_table|_curve)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'subsurface-case'
}

/**
 * Detect subsurface toolchain and workflow stage from normalized path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ subsurfaceToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractEnergyToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let subsurfaceToolchain = ''
	if (/petrel|\.(?:pet|ptd)\b/.test(text)) {
		subsurfaceToolchain = 'SLB Petrel'
	} else if (/eclipse|\.(?:egrid|unrst|smspec|unsmry|init|grdecl)\b/.test(text)) {
		subsurfaceToolchain = 'SLB ECLIPSE / Intersect'
	} else if (/tnav|tnavigator/.test(text)) {
		subsurfaceToolchain = 'RFD tNavigator'
	} else if (/cmg_|\.(?:sr3|irf|mrf)\b|stars|imex/.test(text)) {
		subsurfaceToolchain = 'CMG STARS / IMEX'
	} else if (/opm_flow|opm_tmp/.test(text)) {
		subsurfaceToolchain = 'OPM Flow'
	} else if (/promax|landmark|seisspace/.test(text)) {
		subsurfaceToolchain = 'Halliburton Landmark / SeisSpace'
	} else if (/kingdom/.test(text)) {
		subsurfaceToolchain = 'IHS Kingdom'
	} else if (/geovation|cgg/.test(text)) {
		subsurfaceToolchain = 'CGG Geovation'
	} else if (/\.(?:zgy|vds)\b|openzgy/.test(text)) {
		subsurfaceToolchain = 'OpenZGY / Bluware VDS'
	} else if (/\.(?:las|dlis|lis|mudlog)\b/.test(text)) {
		subsurfaceToolchain = 'Well-Log LAS / DLIS'
	} else if (/osdu|ppdm|\.(?:witsml|prodml|resqml|epc)\b/.test(text)) {
		subsurfaceToolchain = 'OSDU / Energistics'
	} else if (/\.(?:segy|sgy|su|sep|rsf)\b/.test(text)) {
		subsurfaceToolchain = 'SEG-Y Seismic'
	}

	let workflowStage = ''
	if (/bsee|nsta|ccus_permit|co2_injection|well_integrity|plug_abandon|microseismic_hold/.test(text)) {
		workflowStage = 'Regulatory & CCUS Compliance'
	} else if (/osdu|ppdm|\.(?:witsml|prodml|resqml|epc|ukooa)\b/.test(text)) {
		workflowStage = 'OSDU / Energistics Master'
	} else if (/\.(?:las|dlis|lis)\b/.test(text)) {
		workflowStage = 'Wireline Well-Log Master'
	} else if (/\.(?:segy|sgy|zgy|vds|sep|su)\b/.test(text)) {
		workflowStage = '2D/3D/4D Seismic Volume'
	} else if (/\.(?:egrid|unrst|unsmry|smspec|init|grdecl|data|pet|sr3)\b/.test(text)) {
		workflowStage = 'Reservoir Simulation Deck'
	} else if (SUBSURFACE_SCRATCH_PATH_RE.test(text) || STRICT_SUBSURFACE_SCRATCH_EXT_RE.test(text)) {
		workflowStage = 'Simulator / Processing Scratch'
	} else if (CONTEXT_ASCII_EXPORT_EXT_RE.test(basename)) {
		workflowStage = 'ASCII / Horizon / RSM Export'
	}

	return { subsurfaceToolchain, workflowStage }
}

/**
 * Extract domain tag badge (SEG-Y, OpenZGY, DLIS, OSDU, ECLIPSE, 3D/4D, BSEE/CCUS) when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractEnergyDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (/bsee|nsta/.test(text)) {
		return 'BSEE / NSTA'
	}
	if (/ccus|co2_injection|co2_storage/.test(text)) {
		return 'CCUS Storage'
	}
	if (/osdu|ppdm/.test(text)) {
		return 'OSDU'
	}
	if (/\.(?:witsml|prodml|resqml|epc)\b/.test(text)) {
		return 'Energistics'
	}
	if (/\.(?:zgy|vds)\b|openzgy/.test(text)) {
		return 'OpenZGY / VDS'
	}
	if (/\.(?:segy|sgy)\b/.test(text)) {
		return 'SEG-Y'
	}
	if (/\.(?:dlis|las|lis)\b/.test(text)) {
		return 'LAS / DLIS'
	}
	if (/\.(?:egrid|unrst|unsmry|smspec|grdecl)\b/.test(text)) {
		return 'ECLIPSE'
	}
	if (/4d_survey|4d-survey|time_lapse/.test(text)) {
		return '4D-SEISMIC'
	}
	if (/3d_survey|3d-survey/.test(text)) {
		return '3D-SEISMIC'
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
 * Classify a single file within the Energy, Seismic, Well-Log & Reservoir Simulation domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyEnergySeismicFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasEnergyContext = ENERGY_CONTEXT_HINT_RE.test(lower)
	const isScratchPath = SUBSURFACE_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_SUBSURFACE_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isOsduWellPath = OSDU_WELL_PATH_RE.test(lower)
	const isRegulatoryEvidencePath = REGULATORY_WELL_EVIDENCE_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)

	const isStrictWellLogOsduExt = STRICT_WELLLOG_OSDU_EXT_RE.test(lowerBase)
	const isContextOsduDoc = CONTEXT_OSDU_DOC_EXT_RE.test(lowerBase) && (isOsduWellPath || isRegulatoryEvidencePath || hasEnergyContext)
	const isStrictSeismicVolumeExt = STRICT_SEISMIC_VOLUME_EXT_RE.test(lowerBase) || COMPRESSED_SEISMIC_EXT_RE.test(lowerBase)
	const isReservoirMasterExt = RESERVOIR_SIM_MASTER_EXT_RE.test(lowerBase)
	const isReservoirDeckExt = RESERVOIR_DECK_EXT_RE.test(lowerBase) && hasEnergyContext
	const isContextSeismicHdf5 = CONTEXT_SEISMIC_HDF5_EXT_RE.test(lowerBase) && hasEnergyContext
	const isContextAsciiExport = CONTEXT_ASCII_EXPORT_EXT_RE.test(lowerBase) && hasEnergyContext

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Energy & Seismic Vault'
	let isProtectedWellLogOsdu = false
	let isProtectedSeismicReservoir = false
	let isProtectedRegulatoryWell = false
	let isSeismicReservoirAnchor = false
	let isRedundantAsciiExport = false
	let isMutableFile = false

	if (isStrictScratchExt || (isScratchPath && (isGenericScratchExt || isContextAsciiExport || isReservoirDeckExt || isStrictSeismicVolumeExt)) || (isGenericScratchExt && hasEnergyContext)) {
		family = 'subsurface-sim-scratch'
		artifactKind = isStrictScratchExt ? 'Seismic / Reservoir Scratch Lock or Temp' : 'Processing / Simulator Scratch'
		vaultRole = 'Petrel / ECLIPSE / tNavigator / ProMAX Scratch'
		isMutableFile = true
	} else if (isRegulatoryEvidencePath && (isStrictWellLogOsduExt || isStrictSeismicVolumeExt || isReservoirMasterExt || isContextOsduDoc)) {
		family = 'osdu-well-log-compliance'
		artifactKind = 'Regulatory Well-Integrity / CCUS Evidence'
		vaultRole = 'BSEE / NSTA / CCUS Regulatory Hold Evidence'
		isProtectedRegulatoryWell = true
		isProtectedWellLogOsdu = true
		isSeismicReservoirAnchor = isStrictSeismicVolumeExt || isReservoirMasterExt || isStrictWellLogOsduExt
	} else if (isStrictWellLogOsduExt || isContextOsduDoc) {
		family = 'osdu-well-log-compliance'
		artifactKind = isStrictWellLogOsduExt ? 'Well-Log / WITSML / RESQML Master' : 'OSDU / PPDM Compliance Manifest'
		vaultRole = 'Wireline Well-Log & OSDU Subsurface Master'
		isProtectedWellLogOsdu = true
		isSeismicReservoirAnchor = isStrictWellLogOsduExt
		isMutableFile = /\.(?:las|witsml|prodml|resqml|xml|json)$/i.test(lowerBase)
	} else if (isStrictSeismicVolumeExt || isReservoirMasterExt || isReservoirDeckExt || isContextSeismicHdf5) {
		family = 'seismic-reservoir-anchors'
		if (isReservoirMasterExt || isReservoirDeckExt) {
			artifactKind = 'Reservoir Simulation Deck / Restart Master'
			vaultRole = 'ECLIPSE / tNavigator / CMG / Petrel Master'
			isMutableFile = /\.(?:data|inc|sch|pvt|scal|grdecl|sim|dat)$/i.test(lowerBase)
		} else {
			artifactKind = /\.(?:zgy|vds)\b/i.test(lowerBase) ? 'OpenZGY / VDS Brick Volume' : 'SEG-Y Seismic Volume Master'
			vaultRole = '2D/3D/4D Seismic Reflection Master'
		}
		isProtectedSeismicReservoir = true
		isSeismicReservoirAnchor = true
	} else if (isContextAsciiExport) {
		family = 'redundant-seismic-ascii-exports'
		artifactKind = 'ASCII / CSV / Horizon / RSM Export'
		vaultRole = 'Derived Trace Dump / Horizon XYZ / ECLIPSE RSM'
		isRedundantAsciiExport = true
		isMutableFile = true
	}

	const { subsurfaceToolchain, workflowStage } = extractEnergyToolchainAndStage(normalized, basename)
	const runStem = extractEnergySeismicStem(basename, normalized)
	const seismicAnchorKey = extractEnergySeismicAnchorKey(runStem)
	const energyTag = extractEnergyDomainTag(lowerBase, lower)

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
		subsurfaceToolchain,
		workflowStage,
		runStem,
		seismicAnchorKey,
		energyTag,
		isProtectedWellLogOsdu,
		isProtectedSeismicReservoir,
		isProtectedRegulatoryWell,
		isSeismicReservoirAnchor,
		isRedundantAsciiExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isGenericScratchExt && hasEnergyContext),
		isOsduWellPath,
		isRegulatoryEvidencePath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Energy, Seismic, Well-Log & Reservoir domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isEnergySeismicGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyEnergySeismicFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified SEG-Y/OpenZGY/DLIS/ECLIPSE masters
 * to derived ASCII CSV, XYZ, ASC, and RSM exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildEnergySeismicCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyEnergySeismicFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isSeismicReservoirAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.seismicAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Energy & Subsurface cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'osdu-well-log-compliance')) {
		return 'osdu-well-log-compliance'
	}
	if (members.some(m => m.family === 'seismic-reservoir-anchors')) {
		return 'seismic-reservoir-anchors'
	}
	if (members.some(m => m.family === 'redundant-seismic-ascii-exports')) {
		return 'redundant-seismic-ascii-exports'
	}
	return 'subsurface-sim-scratch'
}

/**
 * Compute deterministic survivor priority score for an Energy & Seismic vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-survey-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRegulatoryWell ? 100000 : 0)
			+ (member.isProtectedWellLogOsdu ? 97000 : 0)
			+ (member.isProtectedSeismicReservoir ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantAsciiExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-deck-revision-first') {
		return (member.isProtectedRegulatoryWell ? 100000 : 0)
			+ (member.isProtectedWellLogOsdu ? 97000 : 0)
			+ (member.isProtectedSeismicReservoir ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantAsciiExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRegulatoryWell ? 52000 : 0)
			+ (member.isProtectedWellLogOsdu ? 50000 : 0)
			+ (member.isProtectedSeismicReservoir ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRegulatoryWell ? 100000 : 0)
		+ (member.isProtectedWellLogOsdu ? 97000 : 0)
		+ (member.isProtectedSeismicReservoir ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantAsciiExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Energy, Seismic, Well-Log & Reservoir Simulation duplicate cluster.
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
		const meta = classifyEnergySeismicFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.subsurfaceToolchain)?.subsurfaceToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractEnergySeismicStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].seismicAnchorKey || extractEnergySeismicAnchorKey(primaryStem)

	const hasSeismicReservoirAnchor = Boolean(
		rawMembers.some(m => m.isSeismicReservoirAnchor)
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

		const isRedundantAsciiExportMember = member.isRedundantAsciiExport && hasSeismicReservoirAnchor

		let redundancyReason = ''
		if (member.isRedundantAsciiExport) {
			redundancyReason = isRedundantAsciiExportMember
				? 'Derived .csv/.xyz/.rsm/.asc export duplicates verified SEG-Y/OpenZGY/DLIS/ECLIPSE anchor'
				: 'ASCII/CSV subsurface export without verified SEG-Y, OpenZGY, DLIS, or ECLIPSE anchor'
		}

		let governanceTier = 'sim-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedRegulatoryWell
				? 'regulatory-ccus-protected'
				: (member.isProtectedWellLogOsdu
					? 'osdu-welllog-protected'
					: (member.isProtectedSeismicReservoir
						? 'seismic-reservoir-protected'
						: (member.isRedundantAsciiExport
							? 'ascii-export-redundant'
							: 'sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRegulatoryWell && config.protectRegulatoryWellEvidence) {
			governanceTier = 'regulatory-ccus-protected'
			shielded = true
			protectedReason = 'BSEE / NSTA well-integrity, P&A, and CCUS permit evidence strictly conserved'
		} else if (member.isProtectedWellLogOsdu && config.protectWellLogAndOsdu) {
			governanceTier = 'osdu-welllog-protected'
			shielded = true
			protectedReason = 'OSDU manifest, WITSML/RESQML package, or wireline .las/.dlis master strictly conserved'
		} else if (member.isProtectedSeismicReservoir && config.protectSeismicReservoirAnchors) {
			governanceTier = 'seismic-reservoir-protected'
			shielded = true
			protectedReason = 'Verified SEG-Y/OpenZGY/VDS seismic volume or ECLIPSE/tNavigator master strictly conserved'
		} else if (isSurvivor && !isRedundantAsciiExportMember) {
			governanceTier = member.isProtectedRegulatoryWell
				? 'regulatory-ccus-protected'
				: (member.isProtectedWellLogOsdu
					? 'osdu-welllog-protected'
					: (member.isProtectedSeismicReservoir
						? 'seismic-reservoir-protected'
						: (member.isRedundantAsciiExport
							? 'ascii-export-redundant'
							: 'sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Energy & Seismic vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantAsciiExport
				? 'ascii-export-redundant'
				: (member.isProtectedWellLogOsdu
					? 'osdu-welllog-protected'
					: 'sim-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-seismic-and-unrst' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentSurveyDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentSurveyDays
		) {
			governanceTier = 'sim-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentSurveyDays}-day active seismic processing and simulation grace window`
		} else if (member.isRedundantAsciiExport) {
			governanceTier = 'ascii-export-redundant'
			if (config.requireSeismicAnchorForPrune && !hasSeismicReservoirAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified SEG-Y, OpenZGY, DLIS, or ECLIPSE master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Petrel/ECLIPSE/tNavigator/CMG/ProMAX scratch or lock file eligible for cleanup'
		} else if (member.isProtectedSeismicReservoir || member.isProtectedWellLogOsdu) {
			governanceTier = member.isProtectedWellLogOsdu ? 'osdu-welllog-protected' : 'seismic-reservoir-protected'
			action = config.strategy === 'hardlink-immutable-seismic-and-unrst' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-seismic-and-unrst' && !member.isMutableFile) {
			governanceTier = 'seismic-reservoir-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantAsciiExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantAsciiExport = members.some(m => m.isRedundantAsciiExportMember || m.isRedundantAsciiExport)
	const hasProtectedRegulatoryWell = members.some(m => m.governanceTier === 'regulatory-ccus-protected' && m.shielded)
	const hasProtectedWellLogOsdu = members.some(m => m.governanceTier === 'osdu-welllog-protected' && m.shielded)
	const hasProtectedSeismicReservoir = members.some(m => m.governanceTier === 'seismic-reservoir-protected' && m.shielded)
	const hasSimScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantAsciiExportMember && !m.shielded)) {
			clusterVerdict = 'ascii-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'sim-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedRegulatoryWell) {
		clusterVerdict = 'regulatory-ccus-protected'
	} else if (hasProtectedWellLogOsdu) {
		clusterVerdict = 'osdu-welllog-protected'
	} else if (hasProtectedSeismicReservoir) {
		clusterVerdict = 'seismic-reservoir-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantAsciiExport ? 95 : 85
	} else if (hasProtectedRegulatoryWell) {
		priorityScore = 60
	} else if (hasProtectedWellLogOsdu) {
		priorityScore = 50
	}

	const energyTags = [...new Set(members.map(m => m.energyTag).filter(Boolean))]
	const familyMeta = ENERGY_SEISMIC_FAMILY_META[family] || ENERGY_SEISMIC_FAMILY_META['subsurface-sim-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		subsurfaceToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		seismicAnchorKey: primaryAnchorKey,
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
		hasProtectedWellLogOsdu,
		hasProtectedSeismicReservoir,
		hasProtectedRegulatoryWell,
		hasRedundantAsciiExport,
		hasSimScratchIntermediate,
		hasSeismicReservoirAnchor,
		energyTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as an Energy, Seismic, Well-Log & Reservoir Simulation Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Energy & Seismic vault audit report.
 */
export function auditEnergySeismicVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeEnergySeismicConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isEnergySeismicGroup)
	const correlationIndex = buildEnergySeismicCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'osdu-well-log-compliance': 0,
		'seismic-reservoir-anchors': 0,
		'redundant-seismic-ascii-exports': 0,
		'subsurface-sim-scratch': 0,
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
				cluster.subsurfaceToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.seismicAnchorKey,
				cluster.familyLabel,
				...cluster.energyTags,
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
	let totalWellLogOsduClusters = 0
	let totalSeismicReservoirClusters = 0
	let totalRegulatoryWellClusters = 0
	let totalRedundantExportClusters = 0
	let totalSimScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedWellLogOsdu) {
			totalWellLogOsduClusters += 1
		}
		if (cluster.hasProtectedSeismicReservoir) {
			totalSeismicReservoirClusters += 1
		}
		if (cluster.hasProtectedRegulatoryWell) {
			totalRegulatoryWellClusters += 1
		}
		if (cluster.hasRedundantAsciiExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasSimScratchIntermediate) {
			totalSimScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = ENERGY_SEISMIC_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ENERGY_SEISMIC_FAMILY_META[id].label,
			shortLabel: ENERGY_SEISMIC_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ENERGY_SEISMIC_VAULT_SCHEMA,
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
			totalWellLogOsduClusters,
			totalSeismicReservoirClusters,
			totalRegulatoryWellClusters,
			totalRedundantExportClusters,
			totalSimScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Energy, Seismic & Reservoir Vaults.
 * Strictly blocks deletion or hardlinking of shielded OSDU/well-log records, BSEE/CCUS evidence,
 * and verified SEG-Y/OpenZGY/reservoir masters, and never hardlinks mutable files or simulator scratch.
 *
 * @param {object} auditResult Result from auditEnergySeismicVault.
 * @return {string} POSIX bash script.
 */
export function buildEnergySeismicRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Energy, Seismic SEG-Y, Well-Log & Reservoir Simulation Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./energy-seismic-vault-reclaim.sh only after verifying SEG-Y/ZGY/ECLIPSE and OSDU anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.energy-seismic-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-sim-scratch'
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
			} else if (strategy === 'quarantine-exports-and-sim-scratch' && (target.isRedundantAsciiExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable ASCII/CSV exports or simulator scratch under active Energy & Seismic vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Energy & Seismic Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditEnergySeismicVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildEnergySeismicCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'subsurface_toolchain',
		'workflow_stage',
		'run_stem',
		'seismic_anchor_key',
		'family',
		'cluster_verdict',
		'has_seismic_reservoir_anchor',
		'is_redundant_ascii_export',
		'is_sim_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'energy_tag',
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
				cluster.subsurfaceToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.seismicAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasSeismicReservoirAnchor ? 'true' : 'false',
				member.isRedundantAsciiExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.energyTag || '',
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
 * @param {object} auditResult Result from auditEnergySeismicVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildEnergySeismicJsonManifest(auditResult) {
	const payload = {
		schema: ENERGY_SEISMIC_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ENERGY_SEISMIC_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			subsurfaceToolchain: cluster.subsurfaceToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			seismicAnchorKey: cluster.seismicAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedWellLogOsdu: cluster.hasProtectedWellLogOsdu,
			hasProtectedSeismicReservoir: cluster.hasProtectedSeismicReservoir,
			hasProtectedRegulatoryWell: cluster.hasProtectedRegulatoryWell,
			hasRedundantAsciiExport: cluster.hasRedundantAsciiExport,
			hasSimScratchIntermediate: cluster.hasSimScratchIntermediate,
			hasSeismicReservoirAnchor: cluster.hasSeismicReservoirAnchor,
			energyTags: cluster.energyTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				energyTag: member.energyTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantAsciiExportMember: member.isRedundantAsciiExportMember,
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
 * cloud sync of Petrel, ECLIPSE, tNavigator, CMG, ProMAX, Landmark, and SEG-Y staging directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildEnergySeismicSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Energy, Seismic SEG-Y, Well-Log & Reservoir Simulation Vaults',
		'petrel_tmp/',
		'eclipse_scratch/',
		'eclipse_tmp/',
		'tnav_cache/',
		'tnav_tmp/',
		'cmg_tmp/',
		'cmg_scratch/',
		'promax_scratch/',
		'segy_staging/',
		'kingdom_cache/',
		'landmark_tmp/',
		'opm_tmp/',
		'geovation_cache/',
		'seismic_cache/',
		'reservoir_staging/',
		'solver_scratch/',
		'well_tmp/',
		'*.sgy.tmp',
		'*.segy.tmp',
		'*.las.bak',
		'*.sim.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
