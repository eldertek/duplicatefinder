/**
 * Pure Geotechnical, Structural Health Monitoring (SHM), Tunneling TBM & Civil Sensor Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Geotech & Civil Instrumentation Vault families:
 * - AGS4 / Eurocode 7 & Dam/Tunnel Compliance (.ags, .gef, .diggs, .p2dx, .p3d, .slmd, .slw, .fez, .rs2, .rs3, .gsz, .it3d, .sav, FERC Part 12D / ITA-AITES compliance records)
 * - SHM Strain, TBM Ring & InSAR Masters (.tob3, .tob2, .toa5, .cr1x, .cr6, .cat, .tdms, .fbg, .das, .dts, .vw, .inc, .rst, .gkn, .gsi, .rxl, .job, .jxl, .rnx, .24o, .24n, .tbm, .ring, .mtbm, .slc, .ifg, .unw)
 * - Redundant Civil CSV / Excel / ASCII Exports (.csv, .tsv, .txt, .xlsx, .asc, .prn, .mat in geotech/SHM/TBM/bridge/dam context)
 * - Plaxis, Logger & TBM Staging Scratch (plaxis_tmp/, rocscience_cache/, catman_tmp/, campbell_staging/, tbm_ringbuf/, total_station_tmp/, insar_scratch/, fem_geo_tmp/, shm_cache/, logger_staging/, .p2dx.tmp, .rs2.bak, .tob3.part, .tdms_index, .tbm.tmp, .lck)
 *
 * Enforces strict Eurocode 7 / AGS4, FERC Part 12D / Dam & Tunnel Safety, and SHM/TBM master anchor defaults:
 * - Strictly conserves AGS4/GEF/DIGGS borehole logs, PLAXIS/Rocscience/GeoStudio models, and Eurocode 7 / FERC Part 12D / ITA-AITES regulatory compliance records
 * - Strictly conserves verified Campbell TOB3, HBM Catman, NI TDMS, FBG/DAS strain, Geokon VW, Total Station/GNSS, TBM PLC, and InSAR masters
 * - Detects redundant CSV/XLSX/TXT/PRN/MAT exports when a verified AGS/TOB3/TDMS/TBM/RXL/InSAR master anchor exists
 * - Blocks pruning of raw CSV/XLSX/TXT exports lacking a verified geotech/SHM/TBM master anchor when guard is active
 * - Blocks hardlinks on mutable AGS/GEF/DIGGS/TOA5/CSV/JSON/script files and logger/solver scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const GEOTECH_SHM_CIVIL_VAULT_SCHEMA = 'duplicatefinder.geotech-shm-civil-vault-auditor.v1'

export const GEOTECH_SHM_CIVIL_FAMILIES = Object.freeze([
	'all',
	'geotech-compliance-standards',
	'shm-tbm-sensor-masters',
	'redundant-geotech-csv-exports',
	'geotech-solver-and-logger-scratch',
])

export const GEOTECH_SHM_CIVIL_FAMILY_META = Object.freeze({
	'geotech-compliance-standards': {
		id: 'geotech-compliance-standards',
		label: 'AGS4, Eurocode 7 & Dam Safety',
		shortLabel: 'Borehole & Geo-Model Standards (.ags, .gef, .diggs, .p2dx, .p3d, .rs2, .gsz, FERC 12D / EC7)',
	},
	'shm-tbm-sensor-masters': {
		id: 'shm-tbm-sensor-masters',
		label: 'SHM, TBM & InSAR Masters',
		shortLabel: 'Verified Masters (.tob3, .cat, .tdms, .fbg, .vw, .gsi, .rxl, .rnx, .tbm, .slc, .ifg)',
	},
	'redundant-geotech-csv-exports': {
		id: 'redundant-geotech-csv-exports',
		label: 'Redundant CSV / XLSX Exports',
		shortLabel: 'Derived Exports (.csv, .tsv, .txt, .xlsx, .asc, .prn, .mat)',
	},
	'geotech-solver-and-logger-scratch': {
		id: 'geotech-solver-and-logger-scratch',
		label: 'Plaxis, Logger & TBM Scratch',
		shortLabel: 'Lab & Field Scratch (plaxis_tmp/, catman_tmp/, campbell_staging/, tbm_ringbuf/, .tdms_index, .lck)',
	},
})

export const GEOTECH_SHM_CIVIL_STRATEGIES = Object.freeze([
	'prune-exports-and-geo-scratch',
	'hardlink-immutable-shm-and-ags',
	'quarantine-exports-and-geo-scratch',
])

export const GEOTECH_SHM_CIVIL_SURVIVOR_RULES = Object.freeze([
	'ags-shm-tbm-first',
	'oldest-monitoring-first',
	'newest-model-revision-first',
	'shortest-path',
])

export const GEOTECH_SHM_CIVIL_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'geotech-std-protected',
	'shm-tbm-master-protected',
	'regulatory-dam-protected',
	'geotech-export-redundant',
	'geotech-scratch-intermediate',
	'shielded',
])

export const GEOTECH_SHM_CIVIL_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const GEOTECH_SHM_CIVIL_PRESETS = Object.freeze([
	{
		id: 'all-geotech-shm-civil-audit',
		name: 'All Geotech, SHM & TBM Vaults',
		description: 'Audit AGS4/GEF boreholes, PLAXIS/Rocscience models, FERC/Eurocode 7 safety filings, SHM strain/TBM/InSAR telemetry masters, CSV/XLSX exports, and logger scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-geo-scratch',
		survivorRule: 'ags-shm-tbm-first',
		protectGeotechStandardsAndCompliance: true,
		protectShmTbmMasterAnchors: true,
		protectRegulatoryDamTunnelEvidence: true,
		requireGeotechAnchorForPrune: true,
		keepRecentMonitoringDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'geotech-solver-scratch-cleanup',
		name: 'Plaxis, Logger & TBM Scratch',
		description: 'Reclaim plaxis_tmp/, rocscience_cache/, catman_tmp/, campbell_staging/, tbm_ringbuf/, insar_scratch/, and .tdms_index/.p2dx.tmp scratch older than the active monitoring grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-geo-scratch',
		survivorRule: 'ags-shm-tbm-first',
		protectGeotechStandardsAndCompliance: true,
		protectShmTbmMasterAnchors: true,
		protectRegulatoryDamTunnelEvidence: true,
		requireGeotechAnchorForPrune: true,
		keepRecentMonitoringDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-csv-vs-ags-tdms-tbm',
		name: 'Redundant .csv/.xlsx vs AGS/SHM/TBM',
		description: 'Detect uncompressed ASCII sensor table (.csv/.txt/.prn) and Excel (.xlsx) exports backed by a verified AGS4, Campbell TOB3, HBM Catman, NI TDMS, TBM, or InSAR master anchor.',
		familyFilter: 'redundant-geotech-csv-exports',
		strategy: 'quarantine-exports-and-geo-scratch',
		survivorRule: 'ags-shm-tbm-first',
		protectGeotechStandardsAndCompliance: true,
		protectShmTbmMasterAnchors: true,
		protectRegulatoryDamTunnelEvidence: true,
		requireGeotechAnchorForPrune: true,
		keepRecentMonitoringDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'eurocode7-ferc-dam-safety-shield',
		name: 'AGS4, Eurocode 7 & FERC 12D Shield',
		description: 'Inspect AGS4/GEF/DIGGS borehole logs, PLAXIS/Rocscience geotechnical models, Eurocode 7 / ISO 18674 records, and FERC Part 12D dam and tunnel safety holds under strict shield.',
		familyFilter: 'geotech-compliance-standards',
		strategy: 'hardlink-immutable-shm-and-ags',
		survivorRule: 'ags-shm-tbm-first',
		protectGeotechStandardsAndCompliance: true,
		protectShmTbmMasterAnchors: true,
		protectRegulatoryDamTunnelEvidence: true,
		requireGeotechAnchorForPrune: true,
		keepRecentMonitoringDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'shm-tbm-insar-masters',
		name: 'SHM Strain, TBM Ring & InSAR Masters',
		description: 'Audit Campbell TOB3, HBM Catman, NI TDMS structural strain, fiber-optic FBG/DAS, Geokon piezometer/inclinometer, Leica/Trimble total station, TBM PLC, and InSAR deformation masters.',
		familyFilter: 'shm-tbm-sensor-masters',
		strategy: 'hardlink-immutable-shm-and-ags',
		survivorRule: 'ags-shm-tbm-first',
		protectGeotechStandardsAndCompliance: true,
		protectShmTbmMasterAnchors: true,
		protectRegulatoryDamTunnelEvidence: true,
		requireGeotechAnchorForPrune: true,
		keepRecentMonitoringDays: 0,
		minSizeKb: 0,
	},
])

export const GEOTECH_SHM_CIVIL_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-geotech-shm-civil-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-geo-scratch',
	survivorRule: 'ags-shm-tbm-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectGeotechStandardsAndCompliance: true,
	protectShmTbmMasterAnchors: true,
	protectRegulatoryDamTunnelEvidence: true,
	requireGeotechAnchorForPrune: true,
	keepRecentMonitoringDays: 0,
	minSizeKb: 0,
})

const STRICT_GEOTECH_STD_EXT_RE = /\.(?:ags|gef|diggs|p2dx|p3d|slmd|slw|fez|rs2|rs3|gsz|it3d|sav)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|json|pdf|sig|p7s)$/i
const STRICT_LOGGER_SHM_EXT_RE = /\.(?:tob3|tob2|toa5|cr1x|cr6|cat|tdms|fbg|das|dts|vw|inc|rst|gkn)$/i
const STRICT_SURVEY_TBM_INSAR_EXT_RE = /\.(?:gsi|rxl|job|jxl|rnx|24o|24n|obs|nav|tbm|ring|mtbm|slc|ifg|unw)$/i
const CONTEXT_SHM_BIN_EXT_RE = /\.(?:bin|dat|raw|h5|hdf5)$/i
const CONTEXT_GEOTECH_CSV_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|asc|prn|mat)$/i
const STRICT_GEOTECH_SCRATCH_EXT_RE = /\.(?:p2dx\.tmp|rs2\.bak|rs3\.bak|tob3\.part|tdms_index|tbm\.tmp|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part)$/i

const GEOTECH_SHM_CONTEXT_HINT_RE = /(?:geotech|borehole|piezometer|inclinometer|extensometer|strain_?gauge|load_?cell|shm_?vault|structural_?health|bridge_?shm|viaduct|dam_?safety|tunnel_?tbm|tbm_?ring|natm|plaxis|rocscience|geostudio|flac3d|campbell|catman|geokon|soil_?mechanics|cpt_?sounding|spt_?log|insar|total_?station|leica_?ts|trimble_?rxl|eurocode7|ags4|diggs|ferc_?part12|settlement_?plate)/i
const GEOTECH_STD_PATH_RE = /(?:borehole|ags4|gef_log|diggs|eurocode7|iso18674|iso22476|geotech_std|00_ags|plaxis_model|rocscience_model|geostudio_model|foundation_design)/i
const REGULATORY_DAM_TUNNEL_PATH_RE = /(?:ferc_?part12d|ferc_?12d|dam_?safety|ita_?aites|tunnel_?hold|tailings_?audit|gistm|icold|bridge_?inspection|nbis_?hold|regulatory_?civil|safety_?commission)/i
const GEOTECH_SCRATCH_PATH_RE = /(?:plaxis_tmp|rocscience_cache|catman_tmp|campbell_staging|tbm_ringbuf|total_station_tmp|insar_scratch|fem_geo_tmp|shm_cache|logger_staging|borehole_tmp|piezo_ringbuf|solver_scratch|geo_tmp)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_ags|00_shm|00_tbm|canonical|geotech_vault|shm_vault|tbm_archive|dam_repo|bridge_archive)/i

/**
 * Normalize configuration values for Geotechnical, SHM & TBM Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeGeotechShmCivilConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = GEOTECH_SHM_CIVIL_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.familyFilter
	const verdictFilter = GEOTECH_SHM_CIVIL_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.verdictFilter
	const strategy = GEOTECH_SHM_CIVIL_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.strategy
	const survivorRule = GEOTECH_SHM_CIVIL_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.survivorRule
	const sortMode = GEOTECH_SHM_CIVIL_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentMonitoringDays)
	const keepRecentMonitoringDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.keepRecentMonitoringDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : GEOTECH_SHM_CIVIL_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectGeotechStandardsAndCompliance: cfg.protectGeotechStandardsAndCompliance !== undefined ? Boolean(cfg.protectGeotechStandardsAndCompliance) : true,
		protectShmTbmMasterAnchors: cfg.protectShmTbmMasterAnchors !== undefined ? Boolean(cfg.protectShmTbmMasterAnchors) : true,
		protectRegulatoryDamTunnelEvidence: cfg.protectRegulatoryDamTunnelEvidence !== undefined ? Boolean(cfg.protectRegulatoryDamTunnelEvidence) : true,
		requireGeotechAnchorForPrune: cfg.requireGeotechAnchorForPrune !== undefined ? Boolean(cfg.requireGeotechAnchorForPrune) : true,
		keepRecentMonitoringDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized geotech/SHM/TBM monitoring stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized borehole, sensor, or ring stem.
 */
export function extractGeotechShmCivilStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:p2dx\.tmp|rs2\.bak|rs3\.bak|tob3\.part|tdms_index|tbm\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(/(?:_export|_ascii|_sensor_table|_piezo_csv|_strain_dump|_tbm_csv|_excel|_csv|_xlsx|_prn|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'geotech-sensor'
}

/**
 * Extract canonical anchor key linking derived CSV/XLSX/TXT/PRN exports to AGS/TOB3/TDMS/TBM masters.
 *
 * @param {string} runStem Extracted measurement stem.
 * @return {string} Canonical anchor key.
 */
export function extractGeotechShmCivilAnchorKey(runStem) {
	return String(runStem || 'geotech-sensor')
		.toLowerCase()
		.replace(/(?:_summary|_readings|_timeseries|_borehole|_rings|_strain|_settlement|_table|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'geotech-sensor'
}

/**
 * Detect Geotech/SHM/TBM instrumentation toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ geoToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractGeoToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let geoToolchain = ''
	if (/plaxis|\.(?:p2dx|p3d)\b/.test(text)) {
		geoToolchain = 'Bentley PLAXIS 2D/3D'
	} else if (/rocscience|\.(?:rs2|rs3|slmd|slw|fez)\b/.test(text)) {
		geoToolchain = 'Rocscience RS2/RS3/Slide'
	} else if (/geostudio|\.(?:gsz)\b/.test(text)) {
		geoToolchain = 'Geoslope GeoStudio'
	} else if (/flac3d|\.(?:it3d|sav)\b/.test(text)) {
		geoToolchain = 'Itasca FLAC3D'
	} else if (/\.(?:ags|gef|diggs)\b/.test(text)) {
		geoToolchain = 'AGS4 / GEF / DIGGS Borehole'
	} else if (/campbell|\.(?:tob3|tob2|toa5|cr1x|cr6)\b/.test(text)) {
		geoToolchain = 'Campbell Scientific Logger'
	} else if (/catman|\.(?:cat|tdms)\b/.test(text)) {
		geoToolchain = 'HBM Catman / NI TDMS'
	} else if (/geokon|\.(?:fbg|das|dts|vw|inc|rst|gkn)\b/.test(text)) {
		geoToolchain = 'FBG / Geokon VW & Inclinometer'
	} else if (/leica|trimble|\.(?:gsi|rxl|job|jxl|rnx|24o|24n)\b/.test(text)) {
		geoToolchain = 'Leica / Trimble Total Station & GNSS'
	} else if (/tbm|\.(?:tbm|ring|mtbm)\b/.test(text)) {
		geoToolchain = 'TBM PLC / Ring Telemetry'
	} else if (/insar|\.(?:slc|ifg|unw)\b/.test(text)) {
		geoToolchain = 'InSAR Satellite Deformation'
	}

	let workflowStage = ''
	if (/ferc_?part12|dam_?safety|ita_?aites|tunnel_?hold|gistm|icold|nbis_?hold/.test(text)) {
		workflowStage = 'FERC 12D / Dam & Tunnel Safety'
	} else if (/\.(?:ags|gef|diggs|p2dx|p3d|rs2|rs3|gsz|it3d)\b|eurocode7|iso18674/.test(text)) {
		workflowStage = 'AGS4 / Eurocode 7 Geo-Model'
	} else if (/\.(?:tob3|tob2|toa5|cr1x|cr6|cat|tdms|fbg|das|dts|vw|inc|rst|gkn)\b/.test(text)) {
		workflowStage = 'SHM Logger & Fiber Strain Master'
	} else if (/\.(?:tbm|ring|mtbm)\b/.test(text)) {
		workflowStage = 'TBM Ring-by-Ring PLC Master'
	} else if (/\.(?:gsi|rxl|job|jxl|rnx|24o|24n|obs|nav|slc|ifg|unw)\b/.test(text)) {
		workflowStage = 'Total Station / GNSS / InSAR Master'
	} else if (GEOTECH_SCRATCH_PATH_RE.test(text) || STRICT_GEOTECH_SCRATCH_EXT_RE.test(text)) {
		workflowStage = 'Plaxis / Logger / TBM Scratch'
	} else if (CONTEXT_GEOTECH_CSV_EXPORT_EXT_RE.test(basename)) {
		workflowStage = 'CSV / XLSX / ASCII Sensor Export'
	}

	return { geoToolchain, workflowStage }
}

/**
 * Extract concise Geotech/SHM/TBM domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractGeoDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (/ferc_?part12|dam_?safety|icold|gistm/.test(text)) {
		return 'FERC-12D / DAM'
	}
	if (/eurocode7|iso18674|iso22476/.test(text)) {
		return 'EUROCODE-7'
	}
	if (/\.(?:ags|gef|diggs)\b/.test(text)) {
		return 'AGS4 / GEF'
	}
	if (/\.(?:p2dx|p3d|rs2|rs3|slmd|gsz|it3d)\b/.test(text)) {
		return 'PLAXIS / FEM'
	}
	if (/\.(?:tob3|tob2|toa5|cr1x|cr6)\b/.test(text)) {
		return 'CAMPBELL-TOB3'
	}
	if (/\.(?:cat|tdms)\b/.test(text)) {
		return 'SHM-STRAIN'
	}
	if (/\.(?:fbg|das|dts)\b/.test(text)) {
		return 'FBG / DAS'
	}
	if (/\.(?:vw|inc|rst|gkn)\b/.test(text)) {
		return 'PIEZO / INCL'
	}
	if (/\.(?:tbm|ring|mtbm)\b/.test(text)) {
		return 'TBM-PLC'
	}
	if (/\.(?:slc|ifg|unw)\b/.test(text)) {
		return 'InSAR'
	}
	if (/\.(?:gsi|rxl|jxl|rnx|24o|24n)\b/.test(text)) {
		return 'GNSS / RTS'
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
 * Classify a single file within the Geotechnical, SHM & TBM Civil Vault domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyGeotechShmCivilFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasGeotechContext = GEOTECH_SHM_CONTEXT_HINT_RE.test(lower)
	const isScratchPath = GEOTECH_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_GEOTECH_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isGeotechStdPath = GEOTECH_STD_PATH_RE.test(lower)
	const isRegulatoryDamTunnelPath = REGULATORY_DAM_TUNNEL_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)

	const isStrictGeotechStdExt = STRICT_GEOTECH_STD_EXT_RE.test(lowerBase)
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isGeotechStdPath || isRegulatoryDamTunnelPath || hasGeotechContext)
	const isStrictLoggerShmExt = STRICT_LOGGER_SHM_EXT_RE.test(lowerBase)
	const isStrictSurveyTbmInsarExt = STRICT_SURVEY_TBM_INSAR_EXT_RE.test(lowerBase)
	const isContextShmBin = CONTEXT_SHM_BIN_EXT_RE.test(lowerBase) && hasGeotechContext
	const isContextGeotechCsvExport = CONTEXT_GEOTECH_CSV_EXPORT_EXT_RE.test(lowerBase) && hasGeotechContext

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Geotech & SHM Vault'
	let isProtectedGeotechStd = false
	let isProtectedShmTbmMaster = false
	let isProtectedRegulatoryDamTunnel = false
	let isGeotechMasterAnchor = false
	let isRedundantGeotechExport = false
	let isMutableFile = false

	if (isStrictScratchExt || (isScratchPath && (isGenericScratchExt || isContextGeotechCsvExport || isContextShmBin || isStrictLoggerShmExt || isStrictSurveyTbmInsarExt || isStrictGeotechStdExt)) || (isGenericScratchExt && hasGeotechContext)) {
		family = 'geotech-solver-and-logger-scratch'
		artifactKind = isStrictScratchExt ? 'PLAXIS / Logger / TDMS Index Scratch' : 'Geotech Solver or Field Staging Scratch'
		vaultRole = 'PLAXIS / Campbell / Catman / TBM Scratch'
		isMutableFile = true
	} else if (isRegulatoryDamTunnelPath && (isStrictGeotechStdExt || isStrictLoggerShmExt || isStrictSurveyTbmInsarExt || isContextComplianceDoc)) {
		family = 'geotech-compliance-standards'
		artifactKind = 'FERC Part 12D / Dam & Tunnel Safety Hold'
		vaultRole = 'Regulatory Civil Safety & Inspection Evidence'
		isProtectedRegulatoryDamTunnel = true
		isProtectedGeotechStd = true
		isGeotechMasterAnchor = isStrictGeotechStdExt || isStrictLoggerShmExt || isStrictSurveyTbmInsarExt
	} else if (isStrictGeotechStdExt || (isGeotechStdPath && (isContextComplianceDoc || isStrictLoggerShmExt))) {
		family = 'geotech-compliance-standards'
		artifactKind = isStrictGeotechStdExt ? 'AGS4 / GEF Borehole or PLAXIS Geo-Model' : 'Eurocode 7 / ISO 18674 Geotechnical Baseline'
		vaultRole = 'Traceable Borehole & Geotechnical Design Standard'
		isProtectedGeotechStd = true
		isGeotechMasterAnchor = isStrictGeotechStdExt || isStrictLoggerShmExt
		isMutableFile = /\.(?:ags|gef|diggs|xml|json)$/i.test(lowerBase)
	} else if (isStrictLoggerShmExt || isStrictSurveyTbmInsarExt || isContextShmBin) {
		family = 'shm-tbm-sensor-masters'
		if (/\.(?:tbm|ring|mtbm)$/i.test(lowerBase)) {
			artifactKind = 'Tunneling TBM PLC / Ring Telemetry Master'
			vaultRole = 'Shielded TBM Thrust, Grout & Ring Master'
		} else if (/\.(?:slc|ifg|unw)$/i.test(lowerBase)) {
			artifactKind = 'InSAR Satellite Deformation Grid'
			vaultRole = 'Bridge / Dam / Subsidence InSAR Master'
		} else if (/\.(?:gsi|rxl|job|jxl|rnx|24o|24n|obs|nav)$/i.test(lowerBase)) {
			artifactKind = 'Robotic Total Station / GNSS RTK Master'
			vaultRole = 'Geodetic Displacement Survey Master'
			isMutableFile = /\.(?:jxl|gsi|rnx)$/i.test(lowerBase)
		} else if (/\.(?:fbg|das|dts)$/i.test(lowerBase)) {
			artifactKind = 'Fiber-Optic FBG / DAS Strain Master'
			vaultRole = 'Distributed Optical Structural Strain Master'
		} else {
			artifactKind = 'SHM Datalogger / Catman / TDMS Master'
			vaultRole = 'Structural Strain, Piezometer & Vibration Master'
			isMutableFile = /\.(?:toa5|dat)$/i.test(lowerBase)
		}
		isProtectedShmTbmMaster = true
		isGeotechMasterAnchor = true
	} else if (isContextComplianceDoc) {
		family = 'geotech-compliance-standards'
		artifactKind = 'Geotech / SHM Compliance Manifest'
		vaultRole = 'Eurocode 7 / NBIS Verification Package'
		isProtectedGeotechStd = true
		isMutableFile = /\.(?:xml|json)$/i.test(lowerBase)
	} else if (isContextGeotechCsvExport) {
		family = 'redundant-geotech-csv-exports'
		artifactKind = /\.xlsx$/i.test(lowerBase) ? 'Excel Geotech / SHM Table (.xlsx)' : 'ASCII / CSV / PRN Sensor Export'
		vaultRole = 'Derived Borehole, Piezometer or TBM CSV Export'
		isRedundantGeotechExport = true
		isMutableFile = true
	}

	const { geoToolchain, workflowStage } = extractGeoToolchainAndStage(normalized, basename)
	const runStem = extractGeotechShmCivilStem(basename, normalized)
	const geoAnchorKey = extractGeotechShmCivilAnchorKey(runStem)
	const geoTag = extractGeoDomainTag(lowerBase, lower)

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
		geoToolchain,
		workflowStage,
		runStem,
		geoAnchorKey,
		geoTag,
		isProtectedGeotechStd,
		isProtectedShmTbmMaster,
		isProtectedRegulatoryDamTunnel,
		isGeotechMasterAnchor,
		isRedundantGeotechExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isGenericScratchExt && hasGeotechContext),
		isGeotechStdPath,
		isRegulatoryDamTunnelPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Geotechnical, SHM & TBM Civil domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isGeotechShmCivilGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyGeotechShmCivilFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified AGS4/TOB3/TDMS/TBM/RXL/InSAR masters
 * to derived CSV, XLSX, TXT, PRN, ASC, and MAT exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildGeotechShmCivilCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyGeotechShmCivilFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isGeotechMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.geoAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Geotech & SHM cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'geotech-compliance-standards')) {
		return 'geotech-compliance-standards'
	}
	if (members.some(m => m.family === 'shm-tbm-sensor-masters')) {
		return 'shm-tbm-sensor-masters'
	}
	if (members.some(m => m.family === 'redundant-geotech-csv-exports')) {
		return 'redundant-geotech-csv-exports'
	}
	return 'geotech-solver-and-logger-scratch'
}

/**
 * Compute deterministic survivor priority score for a Geotech & SHM vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-monitoring-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRegulatoryDamTunnel ? 100000 : 0)
			+ (member.isProtectedGeotechStd ? 97000 : 0)
			+ (member.isProtectedShmTbmMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantGeotechExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-model-revision-first') {
		return (member.isProtectedRegulatoryDamTunnel ? 100000 : 0)
			+ (member.isProtectedGeotechStd ? 97000 : 0)
			+ (member.isProtectedShmTbmMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantGeotechExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRegulatoryDamTunnel ? 52000 : 0)
			+ (member.isProtectedGeotechStd ? 50000 : 0)
			+ (member.isProtectedShmTbmMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRegulatoryDamTunnel ? 100000 : 0)
		+ (member.isProtectedGeotechStd ? 97000 : 0)
		+ (member.isProtectedShmTbmMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantGeotechExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Geotechnical, SHM & TBM duplicate cluster.
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
		const meta = classifyGeotechShmCivilFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.geoToolchain)?.geoToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractGeotechShmCivilStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].geoAnchorKey || extractGeotechShmCivilAnchorKey(primaryStem)

	const hasGeotechMasterAnchor = Boolean(
		rawMembers.some(m => m.isGeotechMasterAnchor)
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

		const isRedundantGeotechExportMember = member.isRedundantGeotechExport && hasGeotechMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantGeotechExport) {
			redundancyReason = isRedundantGeotechExportMember
				? 'Derived .csv/.xlsx/.txt/.prn export duplicates verified AGS4, TOB3, TDMS, TBM, or InSAR master'
				: 'ASCII/CSV/XLSX geotech export without verified AGS4, SHM logger, TBM, or survey master anchor'
		}

		let governanceTier = 'geotech-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedRegulatoryDamTunnel
				? 'regulatory-dam-protected'
				: (member.isProtectedGeotechStd
					? 'geotech-std-protected'
					: (member.isProtectedShmTbmMaster
						? 'shm-tbm-master-protected'
						: (member.isRedundantGeotechExport
							? 'geotech-export-redundant'
							: 'geotech-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRegulatoryDamTunnel && config.protectRegulatoryDamTunnelEvidence) {
			governanceTier = 'regulatory-dam-protected'
			shielded = true
			protectedReason = 'FERC Part 12D / ITA-AITES dam and tunnel safety evidence strictly conserved'
		} else if (member.isProtectedGeotechStd && config.protectGeotechStandardsAndCompliance) {
			governanceTier = 'geotech-std-protected'
			shielded = true
			protectedReason = 'AGS4 / GEF borehole log, Eurocode 7 baseline, or PLAXIS/Rocscience model strictly conserved'
		} else if (member.isProtectedShmTbmMaster && config.protectShmTbmMasterAnchors) {
			governanceTier = 'shm-tbm-master-protected'
			shielded = true
			protectedReason = 'Verified SHM logger, FBG/TDMS strain, TBM ring, or InSAR master strictly conserved'
		} else if (isSurvivor && !isRedundantGeotechExportMember) {
			governanceTier = member.isProtectedRegulatoryDamTunnel
				? 'regulatory-dam-protected'
				: (member.isProtectedGeotechStd
					? 'geotech-std-protected'
					: (member.isProtectedShmTbmMaster
						? 'shm-tbm-master-protected'
						: (member.isRedundantGeotechExport
							? 'geotech-export-redundant'
							: 'geotech-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Geotech & SHM vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantGeotechExport
				? 'geotech-export-redundant'
				: (member.isProtectedGeotechStd
					? 'geotech-std-protected'
					: 'geotech-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-shm-and-ags' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentMonitoringDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentMonitoringDays
		) {
			governanceTier = 'geotech-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentMonitoringDays}-day active field monitoring grace window`
		} else if (member.isRedundantGeotechExport) {
			governanceTier = 'geotech-export-redundant'
			if (config.requireGeotechAnchorForPrune && !hasGeotechMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified AGS4, TOB3, TDMS, TBM, or InSAR master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'geotech-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'PLAXIS / Rocscience / Campbell / Catman / TBM scratch or index file eligible for cleanup'
		} else if (member.isProtectedShmTbmMaster || member.isProtectedGeotechStd) {
			governanceTier = member.isProtectedGeotechStd ? 'geotech-std-protected' : 'shm-tbm-master-protected'
			action = config.strategy === 'hardlink-immutable-shm-and-ags' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-shm-and-ags' && !member.isMutableFile) {
			governanceTier = 'shm-tbm-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'geotech-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantGeotechExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantGeotechExport = members.some(m => m.isRedundantGeotechExportMember || m.isRedundantGeotechExport)
	const hasProtectedRegulatoryDamTunnel = members.some(m => m.governanceTier === 'regulatory-dam-protected' && m.shielded)
	const hasProtectedGeotechStd = members.some(m => m.governanceTier === 'geotech-std-protected' && m.shielded)
	const hasProtectedShmTbmMaster = members.some(m => m.governanceTier === 'shm-tbm-master-protected' && m.shielded)
	const hasGeotechScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantGeotechExportMember && !m.shielded)) {
			clusterVerdict = 'geotech-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'geotech-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedRegulatoryDamTunnel) {
		clusterVerdict = 'regulatory-dam-protected'
	} else if (hasProtectedGeotechStd) {
		clusterVerdict = 'geotech-std-protected'
	} else if (hasProtectedShmTbmMaster) {
		clusterVerdict = 'shm-tbm-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantGeotechExport ? 95 : 85
	} else if (hasProtectedRegulatoryDamTunnel) {
		priorityScore = 60
	} else if (hasProtectedGeotechStd) {
		priorityScore = 50
	}

	const geoTags = [...new Set(members.map(m => m.geoTag).filter(Boolean))]
	const familyMeta = GEOTECH_SHM_CIVIL_FAMILY_META[family] || GEOTECH_SHM_CIVIL_FAMILY_META['geotech-solver-and-logger-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		geoToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		geoAnchorKey: primaryAnchorKey,
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
		hasProtectedGeotechStd,
		hasProtectedShmTbmMaster,
		hasProtectedRegulatoryDamTunnel,
		hasRedundantGeotechExport,
		hasGeotechScratchIntermediate,
		hasGeotechMasterAnchor,
		geoTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Geotechnical, SHM & TBM Civil Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Geotech, SHM & TBM vault audit report.
 */
export function auditGeotechShmCivilVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeGeotechShmCivilConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isGeotechShmCivilGroup)
	const correlationIndex = buildGeotechShmCivilCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'geotech-compliance-standards': 0,
		'shm-tbm-sensor-masters': 0,
		'redundant-geotech-csv-exports': 0,
		'geotech-solver-and-logger-scratch': 0,
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
				cluster.geoToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.geoAnchorKey,
				cluster.familyLabel,
				...cluster.geoTags,
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
	let totalGeotechStdClusters = 0
	let totalShmTbmMasterClusters = 0
	let totalRegulatoryDamTunnelClusters = 0
	let totalRedundantExportClusters = 0
	let totalGeotechScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedGeotechStd) {
			totalGeotechStdClusters += 1
		}
		if (cluster.hasProtectedShmTbmMaster) {
			totalShmTbmMasterClusters += 1
		}
		if (cluster.hasProtectedRegulatoryDamTunnel) {
			totalRegulatoryDamTunnelClusters += 1
		}
		if (cluster.hasRedundantGeotechExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasGeotechScratchIntermediate) {
			totalGeotechScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = GEOTECH_SHM_CIVIL_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: GEOTECH_SHM_CIVIL_FAMILY_META[id].label,
			shortLabel: GEOTECH_SHM_CIVIL_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: GEOTECH_SHM_CIVIL_VAULT_SCHEMA,
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
			totalGeotechStdClusters,
			totalShmTbmMasterClusters,
			totalRegulatoryDamTunnelClusters,
			totalRedundantExportClusters,
			totalGeotechScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Geotech, SHM & TBM Civil Vaults.
 * Strictly blocks deletion or hardlinking of shielded AGS4/Eurocode 7 baselines, FERC 12D evidence,
 * and verified SHM/TBM/InSAR masters, and never hardlinks mutable files or field scratch.
 *
 * @param {object} auditResult Result from auditGeotechShmCivilVault.
 * @return {string} POSIX bash script.
 */
export function buildGeotechShmCivilRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Geotechnical, Structural Health Monitoring (SHM), Tunneling TBM & Civil Sensor Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./geotech-shm-civil-vault-reclaim.sh only after verifying AGS4/SHM/TBM anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.geotech-shm-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-geo-scratch'
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
			} else if (strategy === 'quarantine-exports-and-geo-scratch' && (target.isRedundantGeotechExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable CSV/XLSX exports or solver/logger scratch under active Geotech & SHM shields.\\n"')
	} else {
		lines.push(`printf "Completed Geotech & SHM Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditGeotechShmCivilVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildGeotechShmCivilCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'geo_toolchain',
		'workflow_stage',
		'run_stem',
		'geo_anchor_key',
		'family',
		'cluster_verdict',
		'has_geotech_master_anchor',
		'is_redundant_geotech_export',
		'is_geotech_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'geo_tag',
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
				cluster.geoToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.geoAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasGeotechMasterAnchor ? 'true' : 'false',
				member.isRedundantGeotechExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.geoTag || '',
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
 * @param {object} auditResult Result from auditGeotechShmCivilVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildGeotechShmCivilJsonManifest(auditResult) {
	const payload = {
		schema: GEOTECH_SHM_CIVIL_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || GEOTECH_SHM_CIVIL_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			geoToolchain: cluster.geoToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			geoAnchorKey: cluster.geoAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedGeotechStd: cluster.hasProtectedGeotechStd,
			hasProtectedShmTbmMaster: cluster.hasProtectedShmTbmMaster,
			hasProtectedRegulatoryDamTunnel: cluster.hasProtectedRegulatoryDamTunnel,
			hasRedundantGeotechExport: cluster.hasRedundantGeotechExport,
			hasGeotechScratchIntermediate: cluster.hasGeotechScratchIntermediate,
			hasGeotechMasterAnchor: cluster.hasGeotechMasterAnchor,
			geoTags: cluster.geoTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				geoTag: member.geoTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantGeotechExportMember: member.isRedundantGeotechExportMember,
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
 * cloud sync of PLAXIS, Rocscience, Campbell Scientific, HBM Catman, TBM, and InSAR staging directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildGeotechShmCivilSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Geotechnical, SHM & TBM Civil Vaults',
		'plaxis_tmp/',
		'rocscience_cache/',
		'catman_tmp/',
		'campbell_staging/',
		'tbm_ringbuf/',
		'total_station_tmp/',
		'insar_scratch/',
		'fem_geo_tmp/',
		'shm_cache/',
		'logger_staging/',
		'borehole_tmp/',
		'piezo_ringbuf/',
		'solver_scratch/',
		'geo_tmp/',
		'*.p2dx.tmp',
		'*.rs2.bak',
		'*.rs3.bak',
		'*.tob3.part',
		'*.tdms_index',
		'*.tbm.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
