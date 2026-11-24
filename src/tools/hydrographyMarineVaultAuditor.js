/**
 * Pure Marine Hydrography, Multibeam Sonar & Subsea ROV Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Marine Hydrography & Subsea Vault families:
 * - IHO S-57 / S-100, BAG & Offshore Compliance (.s57, .s100, .s102, .s104, .s111, .bag, .csar, .hips, .hdcs, .qpd, .svp, .asvp, .tid, .p190, .p294, NOAA OCS / UKHO / SHOM / IMCA / BOEM records)
 * - Multibeam Sonar, Sidescan, Sub-Bottom & ROV Sensor Masters (.kmall, .kmwcd, .all, .wcd, .s7k, .xtf, .jsf, .gsf, .hsx, .xse, .fbt, .mb58, .sbet, .smrmsg, .pd0, .rov, .dvl, .usbl, .ek80 .raw, ROV HD inspection video masters)
 * - Redundant Bathymetry XYZ, ASCII & Gridded Exports (.xyz, .xyzi, .pts, .asc, .csv, .tsv, .txt, .xlsx, .grd, .tif, .shp, .geojson, .kml, overlay proxy videos in hydro/sonar/ROV context)
 * - Qimera, CARIS, Hypack & ROV Processing Scratch (qimera_tmp/, caris_cache/, hips_temp/, hypack_tmp/, mbsystem_tmp/, pospac_scratch/, sonar_staging/, rov_cache/, mosaic_tiles/, swath_tmp/, .qpd.tmp, .csar.tmp, .kmall.part, .s7k.tmp, .xtf.idx, .lck)
 *
 * Enforces strict IHO S-44 / S-57 / S-100, offshore regulatory seabed clearance, and raw sonar/ROV master defaults:
 * - Strictly conserves IHO S-57/S-100 ENC deliverables, BAG/CSAR/QPD grids, SVP/tide records, and BOEM/BSEE/UKHO/IMCA compliance packages
 * - Strictly conserves verified Kongsberg KMALL/ALL, Reson S7K, EdgeTech JSF, XTF sidescan, Applanix SBET, ADCP PD0, and ROV HD inspection masters
 * - Detects redundant XYZ/CSV/ASC/GRD/GeoTIFF exports when a verified MBES/BAG/CSAR/S57/ROV master anchor exists
 * - Blocks pruning of XYZ/CSV/GRD exports lacking a verified hydrographic or ROV master anchor when guard is active
 * - Blocks hardlinks on mutable XYZ/CSV/TXT/S57/XML/JSON files and processing scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const HYDROGRAPHY_MARINE_VAULT_SCHEMA = 'duplicatefinder.hydrography-marine-vault-auditor.v1'

export const HYDROGRAPHY_MARINE_FAMILIES = Object.freeze([
	'all',
	'hydro-standards-compliance',
	'sonar-rov-sensor-masters',
	'redundant-hydro-xyz-exports',
	'hydro-processing-scratch',
])

export const HYDROGRAPHY_MARINE_FAMILY_META = Object.freeze({
	'hydro-standards-compliance': {
		id: 'hydro-standards-compliance',
		label: 'IHO S-57 / S-100 & BAG',
		shortLabel: 'Charting & Bathymetry Standards (.s57, .s100, .s102, .bag, .csar, .qpd, .svp, .p190, UKHO / NOAA / IMCA)',
	},
	'sonar-rov-sensor-masters': {
		id: 'sonar-rov-sensor-masters',
		label: 'Multibeam Sonar & ROV Masters',
		shortLabel: 'Verified Raw Masters (.kmall, .all, .s7k, .xtf, .jsf, .gsf, .sbet, .pd0, .usbl, ROV HD cam)',
	},
	'redundant-hydro-xyz-exports': {
		id: 'redundant-hydro-xyz-exports',
		label: 'Redundant XYZ / CSV / Grid Exports',
		shortLabel: 'Derived Exports (.xyz, .asc, .csv, .xlsx, .grd, .tif, .shp, .kml, proxy video)',
	},
	'hydro-processing-scratch': {
		id: 'hydro-processing-scratch',
		label: 'Qimera, CARIS & ROV Scratch',
		shortLabel: 'Processing Scratch (qimera_tmp/, caris_cache/, hips_temp/, hypack_tmp/, sonar_staging/, .kmall.part, .xtf.idx)',
	},
})

export const HYDROGRAPHY_MARINE_STRATEGIES = Object.freeze([
	'prune-exports-and-hydro-scratch',
	'hardlink-immutable-sonar-and-bag',
	'quarantine-exports-and-hydro-scratch',
])

export const HYDROGRAPHY_MARINE_SURVIVOR_RULES = Object.freeze([
	'iho-bag-sonar-first',
	'oldest-survey-line-first',
	'newest-processing-first',
	'shortest-path',
])

export const HYDROGRAPHY_MARINE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'hydro-std-protected',
	'sonar-rov-master-protected',
	'offshore-regulatory-protected',
	'hydro-export-redundant',
	'hydro-scratch-intermediate',
	'shielded',
])

export const HYDROGRAPHY_MARINE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const HYDROGRAPHY_MARINE_PRESETS = Object.freeze([
	{
		id: 'all-hydrography-marine-audit',
		name: 'All Hydrography & ROV Vaults',
		description: 'Audit IHO S-57/S-100 charts, BAG/CSAR/QPD grids, offshore compliance holds, Kongsberg/Reson/EdgeTech sonar masters, SBET/ROV logs, XYZ/CSV exports, and Qimera/CARIS scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-hydro-scratch',
		survivorRule: 'iho-bag-sonar-first',
		protectHydroStandardsAndCharts: true,
		protectSonarRovMasterAnchors: true,
		protectOffshoreRegulatoryEvidence: true,
		requireHydroAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hydro-processing-scratch-cleanup',
		name: 'Qimera, CARIS & ROV Scratch',
		description: 'Reclaim qimera_tmp/, caris_cache/, hips_temp/, hypack_tmp/, pospac_scratch/, mosaic_tiles/, and .qpd.tmp/.kmall.part scratch older than the active vessel cruise grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-hydro-scratch',
		survivorRule: 'iho-bag-sonar-first',
		protectHydroStandardsAndCharts: true,
		protectSonarRovMasterAnchors: true,
		protectOffshoreRegulatoryEvidence: true,
		requireHydroAnchorForPrune: true,
		keepRecentSurveyDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-xyz-vs-mbes-bag',
		name: 'Redundant .xyz/.csv/.grd vs MBES/BAG',
		description: 'Detect uncompressed ASCII soundings (.xyz/.asc/.csv/.xlsx) and quicklook grids (.grd/.tif) backed by a verified KMALL, ALL, S7K, XTF, JSF, BAG, or CSAR master anchor.',
		familyFilter: 'redundant-hydro-xyz-exports',
		strategy: 'quarantine-exports-and-hydro-scratch',
		survivorRule: 'iho-bag-sonar-first',
		protectHydroStandardsAndCharts: true,
		protectSonarRovMasterAnchors: true,
		protectOffshoreRegulatoryEvidence: true,
		requireHydroAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'iho-s57-s100-offshore-shield',
		name: 'IHO S-57/S-100 & Offshore Shield',
		description: 'Inspect IHO S-57/S-100/S-102 ENCs, BAG/CSAR bathymetric grids, SVP/tide deliverables, and NOAA/UKHO/SHOM/IMCA/BOEM UXO and pipeline regulatory holds under strict shield.',
		familyFilter: 'hydro-standards-compliance',
		strategy: 'hardlink-immutable-sonar-and-bag',
		survivorRule: 'iho-bag-sonar-first',
		protectHydroStandardsAndCharts: true,
		protectSonarRovMasterAnchors: true,
		protectOffshoreRegulatoryEvidence: true,
		requireHydroAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'sonar-sbet-rov-masters',
		name: 'Multibeam, SBET & ROV Masters',
		description: 'Audit Kongsberg KMALL/ALL/WCD, Reson S7K, EdgeTech JSF, XTF sidescan, Applanix POS MV SBET, ADCP PD0, USBL/DVL, and subsea ROV HD inspection video masters.',
		familyFilter: 'sonar-rov-sensor-masters',
		strategy: 'hardlink-immutable-sonar-and-bag',
		survivorRule: 'iho-bag-sonar-first',
		protectHydroStandardsAndCharts: true,
		protectSonarRovMasterAnchors: true,
		protectOffshoreRegulatoryEvidence: true,
		requireHydroAnchorForPrune: true,
		keepRecentSurveyDays: 0,
		minSizeKb: 0,
	},
])

export const HYDROGRAPHY_MARINE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-hydrography-marine-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-hydro-scratch',
	survivorRule: 'iho-bag-sonar-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectHydroStandardsAndCharts: true,
	protectSonarRovMasterAnchors: true,
	protectOffshoreRegulatoryEvidence: true,
	requireHydroAnchorForPrune: true,
	keepRecentSurveyDays: 0,
	minSizeKb: 0,
})

const STRICT_HYDRO_STD_EXT_RE = /\.(?:s57|s100|s102|s104|s111|bag|csar|hips|hdcs|qpd|svp|asvp|vel|tid|tide|p190|p294|p111)$/i
const CONTEXT_ENC_CHART_EXT_RE = /\.(?:000|001)$/i
const CONTEXT_COMPLIANCE_DOC_EXT_RE = /\.(?:xml|gml|json|pdf|sig|p7s)$/i
const STRICT_SONAR_RAW_EXT_RE = /\.(?:kmall|kmwcd|all|wcd|s7k|xtf|jsf|gsf|hsx|xse|fbt|mb58|mb59|mb88|keb|cod)$/i
const STRICT_NAV_ROV_EXT_RE = /\.(?:sbet|smrmsg|pd0|adcp|dvl|usbl|lbl|rov|rph)$/i
const CONTEXT_SONAR_RAW_EXT_RE = /\.(?:raw|segy|sgy|pos|imu|nav|ins|bin|dat|las|laz|e57)$/i
const CONTEXT_ROV_VIDEO_EXT_RE = /\.(?:mov|mp4|mxf|mkv)$/i
const CONTEXT_HYDRO_XYZ_EXPORT_EXT_RE = /\.(?:xyz|xyzi|pts|asc|csv|tsv|txt|xlsx|grd|tif|tiff|shp|geojson|kml|kmz|avi|wmv)$/i
const STRICT_HYDRO_SCRATCH_EXT_RE = /\.(?:qpd\.tmp|csar\.tmp|kmall\.part|all\.part|s7k\.tmp|xtf\.idx|jsf\.idx|hips\.bak|fbt\.tmp|autosave|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf)$/i

const HYDRO_CONTEXT_HINT_RE = /(?:hydrograph|bathymetr|multibeam|mbes|sidescan|sub_?bottom|chirp_?sbp|sonar|kongsberg|em2040|em304|em710|reson|seabat|edgetech|qimera|qinsy|caris|hips|hypack|mbsystem|applanix|posmv|pospac|sbet|usbl|sonardyne|ixblue|rov_?survey|auv_?mission|subsea|seabed|offshore|ukho|noaa_?ocs|shom|iho_?s(?:44|57|100|102)|ek80|ek60|adcp|dvl_?log|sound_?velocity|svp_?cast|swath_?line|kp_?route|uxo_?survey)/i
const HYDRO_STD_PATH_RE = /(?:iho_?s(?:44|57|100|102)|enc_?chart|s57_?deliverable|s100_?package|bag_?grid|csar_?archive|qimera_?project|caris_?hips|ukooa|p190|svp_?archive|tidal_?model|00_iho|00_bag|00_charts)/i
const OFFSHORE_REGULATORY_PATH_RE = /(?:noaa_?ocs|ukho_?submission|shom_?archive|chs_?hydro|boem_?hold|bsee_?compliance|imca_?s014|imca_?d046|uxo_?clearance|pipeline_?asbuilt|regulatory_?seabed|dnv_?subsea|lloyds_?subsea|iho_?order_?1a|special_?order)/i
const HYDRO_SCRATCH_PATH_RE = /(?:qimera_tmp|qpd_cache|caris_cache|hips_temp|hypack_tmp|mbsystem_tmp|pospac_scratch|sonar_staging|rov_cache|mosaic_tiles|swath_tmp|tide_cache|svp_scratch|bathymetry_tmp|mbes_tmp)/i
const ROV_VIDEO_MASTER_PATH_RE = /(?:rov_?video|inspection_?master|subsea_?cam|ch[1-4]_?cam|hd_?camera|4k_?rov|00_rov_?master)/i
const HYDRO_PROXY_PATH_RE = /(?:overlay_?export|proxy_?video|_proxy|_overlay|_quicklook|_web_?preview)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_iho|00_bag|00_sonar|00_rov|canonical|hydro_vault|sonar_vault|rov_archive|bathymetry_repo)/i

/**
 * Normalize configuration values for Marine Hydrography, Multibeam Sonar & Subsea ROV Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeHydrographyMarineConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = HYDROGRAPHY_MARINE_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.familyFilter
	const verdictFilter = HYDROGRAPHY_MARINE_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.verdictFilter
	const strategy = HYDROGRAPHY_MARINE_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.strategy
	const survivorRule = HYDROGRAPHY_MARINE_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.survivorRule
	const sortMode = HYDROGRAPHY_MARINE_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentSurveyDays)
	const keepRecentSurveyDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: HYDROGRAPHY_MARINE_DEFAULT_CONFIG.keepRecentSurveyDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : HYDROGRAPHY_MARINE_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectHydroStandardsAndCharts: cfg.protectHydroStandardsAndCharts !== undefined ? Boolean(cfg.protectHydroStandardsAndCharts) : true,
		protectSonarRovMasterAnchors: cfg.protectSonarRovMasterAnchors !== undefined ? Boolean(cfg.protectSonarRovMasterAnchors) : true,
		protectOffshoreRegulatoryEvidence: cfg.protectOffshoreRegulatoryEvidence !== undefined ? Boolean(cfg.protectOffshoreRegulatoryEvidence) : true,
		requireHydroAnchorForPrune: cfg.requireHydroAnchorForPrune !== undefined ? Boolean(cfg.requireHydroAnchorForPrune) : true,
		keepRecentSurveyDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized hydrographic survey line or ROV dive stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized survey line or dive stem.
 */
export function extractHydrographyMarineStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:qpd\.tmp|csar\.tmp|kmall\.part|all\.part|s7k\.tmp|xtf\.idx|jsf\.idx|hips\.bak|fbt\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(/(?:_soundings|_xyz_export|_bathy_grid|_backscatter|_mosaic|_quicklook|_overlay|_proxy|_ascii|_export|_csv|_xlsx|_grd|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'hydro-survey-line'
}

/**
 * Extract canonical anchor key linking derived XYZ/CSV/GRD/GeoTIFF exports to MBES/BAG/CSAR/S57/ROV masters.
 *
 * @param {string} runStem Extracted line or dive stem.
 * @return {string} Canonical anchor key.
 */
export function extractHydrographyMarineAnchorKey(runStem) {
	return String(runStem || 'hydro-survey-line')
		.toLowerCase()
		.replace(/(?:_sounding_table|_grid|_contour|_trackline|_kp_list|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'hydro-survey-line'
}

/**
 * Detect Marine Hydrography / Sonar / ROV toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ hydroToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractHydroToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let hydroToolchain = ''
	if (/kongsberg|em2040|em304|em710|ek80|ek60|\.(?:kmall|kmwcd|all|wcd)\b/.test(text)) {
		hydroToolchain = 'Kongsberg MBES / Simrad'
	} else if (/reson|seabat|\.(?:s7k)\b/.test(text)) {
		hydroToolchain = 'Teledyne Reson SeaBat 7k'
	} else if (/edgetech|\.(?:jsf)\b/.test(text)) {
		hydroToolchain = 'EdgeTech Sidescan / SBP'
	} else if (/\.(?:xtf|gsf)\b/.test(text)) {
		hydroToolchain = 'XTF / GSF Sonar Exchange'
	} else if (/qimera|qinsy|\.(?:qpd)\b/.test(text)) {
		hydroToolchain = 'QPS Qimera / QINSy'
	} else if (/caris|hips|\.(?:csar|hips|hdcs)\b/.test(text)) {
		hydroToolchain = 'Teledyne CARIS HIPS/SIPS'
	} else if (/hypack|\.(?:hsx)\b/.test(text)) {
		hydroToolchain = 'HYPACK Hydrographic'
	} else if (/mbsystem|\.(?:mb58|mb59|mb88|fbt|xse)\b/.test(text)) {
		hydroToolchain = 'MB-System / L3 Elac'
	} else if (/applanix|posmv|pospac|\.(?:sbet|smrmsg|pos|imu)\b/.test(text)) {
		hydroToolchain = 'Applanix POS MV / POSPac'
	} else if (/adcp|sonardyne|usbl|dvl|rov|\.(?:pd0|adcp|dvl|usbl|lbl|rov)\b/.test(text)) {
		hydroToolchain = 'Subsea ROV / USBL / ADCP'
	} else if (/\.(?:s57|s100|s102|s104|s111|bag|p190|p294|svp|asvp)\b/.test(text)) {
		hydroToolchain = 'IHO S-57 / S-100 / BAG'
	}

	let workflowStage = ''
	if (OFFSHORE_REGULATORY_PATH_RE.test(text)) {
		workflowStage = 'Offshore Regulatory / Charting Hold'
	} else if (/\.(?:s57|s100|s102|s104|s111|bag|csar|hips|hdcs|qpd|svp|asvp|vel|tid|tide|p190|p294|p111)\b/.test(text) || HYDRO_STD_PATH_RE.test(text)) {
		workflowStage = 'IHO S-57 / BAG / Chart Standard'
	} else if (/\.(?:kmall|kmwcd|all|wcd|s7k|xtf|jsf|gsf|hsx|xse|fbt|mb58|mb59|mb88)\b/.test(text)) {
		workflowStage = 'Raw Multibeam / Sidescan Master'
	} else if (/\.(?:sbet|smrmsg|pd0|adcp|dvl|usbl|lbl|rov|rph)\b/.test(text) || ROV_VIDEO_MASTER_PATH_RE.test(text)) {
		workflowStage = 'SBET Trajectory / ROV Master'
	} else if (HYDRO_SCRATCH_PATH_RE.test(text) || STRICT_HYDRO_SCRATCH_EXT_RE.test(text)) {
		workflowStage = 'Qimera / CARIS / ROV Scratch'
	} else if (CONTEXT_HYDRO_XYZ_EXPORT_EXT_RE.test(basename) || HYDRO_PROXY_PATH_RE.test(text)) {
		workflowStage = 'XYZ / CSV / Grid Export'
	}

	return { hydroToolchain, workflowStage }
}

/**
 * Extract concise Marine Hydrography domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractHydroDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (OFFSHORE_REGULATORY_PATH_RE.test(text)) {
		return 'IHO / OFFSHORE HOLD'
	}
	if (/\.(?:s57|s100|s102|s104|s111|000|001)\b/.test(text)) {
		return 'IHO S-57 / S-100'
	}
	if (/\.(?:bag|csar|hips|hdcs|qpd)\b/.test(text)) {
		return 'BAG / CSAR / QPD'
	}
	if (/\.(?:svp|asvp|vel|tid|tide|p190|p294|p111)\b/.test(text)) {
		return 'SVP / TIDE / P190'
	}
	if (/\.(?:kmall|kmwcd|all|wcd)\b/.test(text)) {
		return 'MBES-KMALL/ALL'
	}
	if (/\.(?:s7k|xtf|jsf|gsf|hsx|mb58|mb59|mb88)\b/.test(text)) {
		return 'SONAR-RAW'
	}
	if (/\.(?:sbet|smrmsg|pos|imu)\b/.test(text)) {
		return 'POSMV-SBET'
	}
	if (/\.(?:pd0|adcp|dvl|usbl|lbl|rov)\b/.test(text) || ROV_VIDEO_MASTER_PATH_RE.test(text)) {
		return 'ROV / USBL / ADCP'
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
 * Classify a single file within the Marine Hydrography, Multibeam Sonar & Subsea ROV domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyHydrographyMarineFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasHydroContext = HYDRO_CONTEXT_HINT_RE.test(lower)
	const isScratchPath = HYDRO_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_HYDRO_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isHydroStdPath = HYDRO_STD_PATH_RE.test(lower)
	const isOffshoreRegulatoryPath = OFFSHORE_REGULATORY_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isRovVideoMasterPath = ROV_VIDEO_MASTER_PATH_RE.test(lower)
	const isHydroProxyPath = HYDRO_PROXY_PATH_RE.test(lower)

	const isStrictHydroStdExt = STRICT_HYDRO_STD_EXT_RE.test(lowerBase)
	const isContextEncChartExt = CONTEXT_ENC_CHART_EXT_RE.test(lowerBase) && (hasHydroContext || isHydroStdPath || isOffshoreRegulatoryPath)
	const isContextComplianceDoc = CONTEXT_COMPLIANCE_DOC_EXT_RE.test(lowerBase) && (isHydroStdPath || isOffshoreRegulatoryPath || hasHydroContext)
	const isStrictSonarRawExt = STRICT_SONAR_RAW_EXT_RE.test(lowerBase)
	const isStrictNavRovExt = STRICT_NAV_ROV_EXT_RE.test(lowerBase)
	const isContextSonarRawExt = CONTEXT_SONAR_RAW_EXT_RE.test(lowerBase) && hasHydroContext
	const isRovVideoMaster = CONTEXT_ROV_VIDEO_EXT_RE.test(lowerBase) && (isRovVideoMasterPath || (hasHydroContext && !isHydroProxyPath))
	const isRovProxyVideo = CONTEXT_ROV_VIDEO_EXT_RE.test(lowerBase) && hasHydroContext && isHydroProxyPath
	const isContextHydroXyzExport = (CONTEXT_HYDRO_XYZ_EXPORT_EXT_RE.test(lowerBase) && hasHydroContext) || isRovProxyVideo

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Hydrography & ROV Vault'
	let isProtectedHydroStandard = false
	let isProtectedSonarRovMaster = false
	let isProtectedOffshoreRegulatory = false
	let isHydroMasterAnchor = false
	let isRedundantHydroExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextHydroXyzExport || isContextSonarRawExt || isStrictSonarRawExt || isStrictNavRovExt || isStrictHydroStdExt))
		|| (isGenericScratchExt && hasHydroContext)
	) {
		family = 'hydro-processing-scratch'
		artifactKind = isStrictScratchExt ? 'Qimera / CARIS / MBES Index Scratch' : 'Hydrographic Solver or ROV Staging Scratch'
		vaultRole = 'Qimera / CARIS / Hypack / ROV Scratch'
		isMutableFile = true
	} else if (isOffshoreRegulatoryPath && (isStrictHydroStdExt || isContextEncChartExt || isStrictSonarRawExt || isStrictNavRovExt || isContextComplianceDoc)) {
		family = 'hydro-standards-compliance'
		artifactKind = 'NOAA / UKHO / IMCA / BOEM Offshore Hold'
		vaultRole = 'Regulatory Seabed & Charting Evidence'
		isProtectedOffshoreRegulatory = true
		isProtectedHydroStandard = true
		isHydroMasterAnchor = isStrictHydroStdExt || isContextEncChartExt || isStrictSonarRawExt || isStrictNavRovExt
	} else if (isStrictHydroStdExt || isContextEncChartExt || (isHydroStdPath && (isContextComplianceDoc || isStrictSonarRawExt || isStrictNavRovExt))) {
		family = 'hydro-standards-compliance'
		if (/\.(?:s57|s100|s102|s104|s111|000|001)$/i.test(lowerBase)) {
			artifactKind = 'IHO S-57 / S-100 ENC Deliverable'
			vaultRole = 'Official Hydrographic Chart & Bathymetry Grid'
		} else if (/\.(?:bag|csar|hips|hdcs|qpd)$/i.test(lowerBase)) {
			artifactKind = 'BAG / CARIS CSAR / Qimera Surface'
			vaultRole = 'Verified Bathymetric Attributed Grid Master'
		} else {
			artifactKind = 'SVP / Tidal / UKOOA P190 Control'
			vaultRole = 'Sound Velocity, Tide & Subsea Metrology Standard'
		}
		isProtectedHydroStandard = true
		isHydroMasterAnchor = isStrictHydroStdExt || isContextEncChartExt || isStrictSonarRawExt || isStrictNavRovExt
		isMutableFile = /\.(?:s57|000|001|svp|asvp|vel|tid|tide|p190|p294|p111|xml|gml|json)$/i.test(lowerBase)
	} else if (isStrictSonarRawExt || isStrictNavRovExt || isContextSonarRawExt || isRovVideoMaster) {
		family = 'sonar-rov-sensor-masters'
		if (/\.(?:kmall|kmwcd|all|wcd|s7k|gsf|hsx|xse|fbt|mb58|mb59|mb88)$/i.test(lowerBase)) {
			artifactKind = 'Multibeam Echosounder (MBES) Raw Master'
			vaultRole = 'Raw Swath Bathymetry & Water-Column Master'
		} else if (/\.(?:xtf|jsf|keb|cod|segy|sgy)$/i.test(lowerBase)) {
			artifactKind = 'Sidescan / Sub-Bottom Sonar Master'
			vaultRole = 'Acoustic Imagery & Chirp Sub-Bottom Master'
		} else if (isRovVideoMaster) {
			artifactKind = 'Subsea ROV HD Inspection Video Master'
			vaultRole = 'Timestamped ROV Camera / Overlay Master'
		} else {
			artifactKind = 'POS MV SBET / USBL / ADCP / ROV Master'
			vaultRole = 'Subsea Navigation, Attitude & Current Master'
			isMutableFile = /\.(?:nav|pos|imu)$/i.test(lowerBase)
		}
		isProtectedSonarRovMaster = true
		isHydroMasterAnchor = true
	} else if (isContextComplianceDoc) {
		family = 'hydro-standards-compliance'
		artifactKind = 'IHO S-100 / Offshore Survey Manifest'
		vaultRole = 'Hydrographic Metadata & Acceptance Package'
		isProtectedHydroStandard = true
		isMutableFile = /\.(?:xml|gml|json)$/i.test(lowerBase)
	} else if (isContextHydroXyzExport) {
		family = 'redundant-hydro-xyz-exports'
		if (isRovProxyVideo) {
			artifactKind = 'ROV Overlay / Proxy Video Export'
		} else if (/\.(?:grd|tif|tiff|shp|geojson|kml|kmz)$/i.test(lowerBase)) {
			artifactKind = 'Derived Bathymetry Grid / GIS Export'
		} else {
			artifactKind = 'ASCII Sounding / XYZ / CSV Export'
		}
		vaultRole = 'Derived XYZ Soundings, Grid or Proxy Export'
		isRedundantHydroExport = true
		isMutableFile = true
	}

	const { hydroToolchain, workflowStage } = extractHydroToolchainAndStage(normalized, basename)
	const runStem = extractHydrographyMarineStem(basename, normalized)
	const hydroAnchorKey = extractHydrographyMarineAnchorKey(runStem)
	const hydroTag = extractHydroDomainTag(lowerBase, lower)

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
		hydroToolchain,
		workflowStage,
		runStem,
		hydroAnchorKey,
		hydroTag,
		isProtectedHydroStandard,
		isProtectedSonarRovMaster,
		isProtectedOffshoreRegulatory,
		isHydroMasterAnchor,
		isRedundantHydroExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isGenericScratchExt && hasHydroContext),
		isHydroStdPath,
		isOffshoreRegulatoryPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Marine Hydrography, Multibeam Sonar & Subsea ROV domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isHydrographyMarineGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyHydrographyMarineFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified IHO BAG/CSAR/S57, MBES, SBET, and ROV masters
 * to derived XYZ, CSV, ASC, GRD, GeoTIFF, and proxy video exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildHydrographyMarineCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyHydrographyMarineFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isHydroMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.hydroAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Hydrography & ROV cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'hydro-standards-compliance')) {
		return 'hydro-standards-compliance'
	}
	if (members.some(m => m.family === 'sonar-rov-sensor-masters')) {
		return 'sonar-rov-sensor-masters'
	}
	if (members.some(m => m.family === 'redundant-hydro-xyz-exports')) {
		return 'redundant-hydro-xyz-exports'
	}
	return 'hydro-processing-scratch'
}

/**
 * Compute deterministic survivor priority score for a Marine Hydrography & ROV vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-survey-line-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedOffshoreRegulatory ? 100000 : 0)
			+ (member.isProtectedHydroStandard ? 97000 : 0)
			+ (member.isProtectedSonarRovMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantHydroExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-processing-first') {
		return (member.isProtectedOffshoreRegulatory ? 100000 : 0)
			+ (member.isProtectedHydroStandard ? 97000 : 0)
			+ (member.isProtectedSonarRovMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantHydroExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedOffshoreRegulatory ? 52000 : 0)
			+ (member.isProtectedHydroStandard ? 50000 : 0)
			+ (member.isProtectedSonarRovMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedOffshoreRegulatory ? 100000 : 0)
		+ (member.isProtectedHydroStandard ? 97000 : 0)
		+ (member.isProtectedSonarRovMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantHydroExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Marine Hydrography, Multibeam Sonar & Subsea ROV duplicate cluster.
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
		const meta = classifyHydrographyMarineFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.hydroToolchain)?.hydroToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractHydrographyMarineStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].hydroAnchorKey || extractHydrographyMarineAnchorKey(primaryStem)

	const hasHydroMasterAnchor = Boolean(
		rawMembers.some(m => m.isHydroMasterAnchor)
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

		const isRedundantHydroExportMember = member.isRedundantHydroExport && hasHydroMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantHydroExport) {
			redundancyReason = isRedundantHydroExportMember
				? 'Derived .xyz/.csv/.grd export duplicates verified MBES, BAG, CSAR, S-57, or ROV master'
				: 'XYZ/CSV/Grid bathymetry export without verified sonar, BAG/CSAR, or ROV master anchor'
		}

		let governanceTier = 'hydro-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedOffshoreRegulatory
				? 'offshore-regulatory-protected'
				: (member.isProtectedHydroStandard
					? 'hydro-std-protected'
					: (member.isProtectedSonarRovMaster
						? 'sonar-rov-master-protected'
						: (member.isRedundantHydroExport
							? 'hydro-export-redundant'
							: 'hydro-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedOffshoreRegulatory && config.protectOffshoreRegulatoryEvidence) {
			governanceTier = 'offshore-regulatory-protected'
			shielded = true
			protectedReason = 'NOAA / UKHO / IMCA / BOEM offshore regulatory seabed evidence strictly conserved'
		} else if (member.isProtectedHydroStandard && config.protectHydroStandardsAndCharts) {
			governanceTier = 'hydro-std-protected'
			shielded = true
			protectedReason = 'IHO S-57/S-100 ENC, BAG/CSAR/QPD surface, or SVP/tide standard strictly conserved'
		} else if (member.isProtectedSonarRovMaster && config.protectSonarRovMasterAnchors) {
			governanceTier = 'sonar-rov-master-protected'
			shielded = true
			protectedReason = 'Verified MBES, sidescan, SBET trajectory, or subsea ROV master strictly conserved'
		} else if (isSurvivor && !isRedundantHydroExportMember) {
			governanceTier = member.isProtectedOffshoreRegulatory
				? 'offshore-regulatory-protected'
				: (member.isProtectedHydroStandard
					? 'hydro-std-protected'
					: (member.isProtectedSonarRovMaster
						? 'sonar-rov-master-protected'
						: (member.isRedundantHydroExport
							? 'hydro-export-redundant'
							: 'hydro-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Marine Hydrography & ROV vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantHydroExport
				? 'hydro-export-redundant'
				: (member.isProtectedHydroStandard
					? 'hydro-std-protected'
					: 'hydro-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-sonar-and-bag' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'hydro-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentSurveyDays}-day active vessel cruise grace window`
		} else if (member.isRedundantHydroExport) {
			governanceTier = 'hydro-export-redundant'
			if (config.requireHydroAnchorForPrune && !hasHydroMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified KMALL, S7K, XTF, BAG, CSAR, or ROV master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'hydro-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Qimera / CARIS / Hypack / ROV processing scratch or index file eligible for cleanup'
		} else if (member.isProtectedSonarRovMaster || member.isProtectedHydroStandard) {
			governanceTier = member.isProtectedHydroStandard ? 'hydro-std-protected' : 'sonar-rov-master-protected'
			action = config.strategy === 'hardlink-immutable-sonar-and-bag' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-sonar-and-bag' && !member.isMutableFile) {
			governanceTier = 'sonar-rov-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'hydro-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantHydroExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantHydroExport = members.some(m => m.isRedundantHydroExportMember || m.isRedundantHydroExport)
	const hasProtectedOffshoreRegulatory = members.some(m => m.governanceTier === 'offshore-regulatory-protected' && m.shielded)
	const hasProtectedHydroStandard = members.some(m => m.governanceTier === 'hydro-std-protected' && m.shielded)
	const hasProtectedSonarRovMaster = members.some(m => m.governanceTier === 'sonar-rov-master-protected' && m.shielded)
	const hasHydroScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantHydroExportMember && !m.shielded)) {
			clusterVerdict = 'hydro-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'hydro-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedOffshoreRegulatory) {
		clusterVerdict = 'offshore-regulatory-protected'
	} else if (hasProtectedHydroStandard) {
		clusterVerdict = 'hydro-std-protected'
	} else if (hasProtectedSonarRovMaster) {
		clusterVerdict = 'sonar-rov-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantHydroExport ? 95 : 85
	} else if (hasProtectedOffshoreRegulatory) {
		priorityScore = 60
	} else if (hasProtectedHydroStandard) {
		priorityScore = 50
	}

	const hydroTags = [...new Set(members.map(m => m.hydroTag).filter(Boolean))]
	const familyMeta = HYDROGRAPHY_MARINE_FAMILY_META[family] || HYDROGRAPHY_MARINE_FAMILY_META['hydro-processing-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		hydroToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		hydroAnchorKey: primaryAnchorKey,
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
		hasProtectedHydroStandard,
		hasProtectedSonarRovMaster,
		hasProtectedOffshoreRegulatory,
		hasRedundantHydroExport,
		hasHydroScratchIntermediate,
		hasHydroMasterAnchor,
		hydroTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Marine Hydrography, Multibeam Sonar & Subsea ROV Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Marine Hydrography & ROV vault audit report.
 */
export function auditHydrographyMarineVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeHydrographyMarineConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isHydrographyMarineGroup)
	const correlationIndex = buildHydrographyMarineCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'hydro-standards-compliance': 0,
		'sonar-rov-sensor-masters': 0,
		'redundant-hydro-xyz-exports': 0,
		'hydro-processing-scratch': 0,
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
				cluster.hydroToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.hydroAnchorKey,
				cluster.familyLabel,
				...cluster.hydroTags,
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
	let totalHydroStdClusters = 0
	let totalSonarRovMasterClusters = 0
	let totalOffshoreRegulatoryClusters = 0
	let totalRedundantExportClusters = 0
	let totalHydroScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedHydroStandard) {
			totalHydroStdClusters += 1
		}
		if (cluster.hasProtectedSonarRovMaster) {
			totalSonarRovMasterClusters += 1
		}
		if (cluster.hasProtectedOffshoreRegulatory) {
			totalOffshoreRegulatoryClusters += 1
		}
		if (cluster.hasRedundantHydroExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasHydroScratchIntermediate) {
			totalHydroScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = HYDROGRAPHY_MARINE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: HYDROGRAPHY_MARINE_FAMILY_META[id].label,
			shortLabel: HYDROGRAPHY_MARINE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: HYDROGRAPHY_MARINE_VAULT_SCHEMA,
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
			totalHydroStdClusters,
			totalSonarRovMasterClusters,
			totalOffshoreRegulatoryClusters,
			totalRedundantExportClusters,
			totalHydroScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Marine Hydrography & ROV Vaults.
 * Strictly blocks deletion or hardlinking of shielded IHO S-57/S-100/BAG baselines, offshore regulatory evidence,
 * and verified sonar/SBET/ROV masters, and never hardlinks mutable files or processing scratch.
 *
 * @param {object} auditResult Result from auditHydrographyMarineVault.
 * @return {string} POSIX bash script.
 */
export function buildHydrographyMarineRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Marine Hydrography, Multibeam Sonar & Subsea ROV Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./hydrography-marine-vault-reclaim.sh only after verifying MBES/BAG/ROV anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.hydrography-marine-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-hydro-scratch'
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
			} else if (strategy === 'quarantine-exports-and-hydro-scratch' && (target.isRedundantHydroExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable XYZ/CSV exports or Qimera/CARIS scratch under active Hydrography & ROV shields.\\n"')
	} else {
		lines.push(`printf "Completed Hydrography & ROV Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditHydrographyMarineVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildHydrographyMarineCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'hydro_toolchain',
		'workflow_stage',
		'run_stem',
		'hydro_anchor_key',
		'family',
		'cluster_verdict',
		'has_hydro_master_anchor',
		'is_redundant_hydro_export',
		'is_hydro_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'hydro_tag',
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
				cluster.hydroToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.hydroAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasHydroMasterAnchor ? 'true' : 'false',
				member.isRedundantHydroExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.hydroTag || '',
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
 * @param {object} auditResult Result from auditHydrographyMarineVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildHydrographyMarineJsonManifest(auditResult) {
	const payload = {
		schema: HYDROGRAPHY_MARINE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || HYDROGRAPHY_MARINE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			hydroToolchain: cluster.hydroToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			hydroAnchorKey: cluster.hydroAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedHydroStandard: cluster.hasProtectedHydroStandard,
			hasProtectedSonarRovMaster: cluster.hasProtectedSonarRovMaster,
			hasProtectedOffshoreRegulatory: cluster.hasProtectedOffshoreRegulatory,
			hasRedundantHydroExport: cluster.hasRedundantHydroExport,
			hasHydroScratchIntermediate: cluster.hasHydroScratchIntermediate,
			hasHydroMasterAnchor: cluster.hasHydroMasterAnchor,
			hydroTags: cluster.hydroTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				hydroTag: member.hydroTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantHydroExportMember: member.isRedundantHydroExportMember,
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
 * cloud sync of Qimera, CARIS HIPS, HYPACK, MB-System, POSPac, and ROV staging directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildHydrographyMarineSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Marine Hydrography, Multibeam Sonar & Subsea ROV Vaults',
		'qimera_tmp/',
		'qpd_cache/',
		'caris_cache/',
		'hips_temp/',
		'hypack_tmp/',
		'mbsystem_tmp/',
		'pospac_scratch/',
		'sonar_staging/',
		'rov_cache/',
		'mosaic_tiles/',
		'swath_tmp/',
		'tide_cache/',
		'svp_scratch/',
		'bathymetry_tmp/',
		'*.qpd.tmp',
		'*.csar.tmp',
		'*.kmall.part',
		'*.all.part',
		'*.s7k.tmp',
		'*.xtf.idx',
		'*.jsf.idx',
		'*.hips.bak',
		'*.fbt.tmp',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
