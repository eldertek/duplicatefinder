/**
 * Pure LiDAR, UAV Photogrammetry & Terrestrial Laser Scanning (TLS) Vault Auditor.
 * Classifies and audits duplicate clusters across 4 LiDAR & Photogrammetry Vault families:
 * - GCPs, Boresight & Survey Holds (.gcp, .jxl, .cam, .cal, .calib, PPK/RTK RINEX .obs/.nav/.mrk/.t02/.t04/.sbet, ALTA/NSPS/USGS 3DEP/cadastral survey holds)
 * - Raw TLS, LiDAR & Photogrammetry (.e57, .copc.laz, .laz, .fls, .fws, .rxp, .rdbx, .zfs, .lgs, .blk, .sdb, .ptx, .pts, .psx, .p4d, .rcproj, .ccm, .vce, survey .iiq/.dng)
 * - Redundant Meshes, Orthos & Reports (uncompressed .las/.xyz/.asc dumps, decimated .obj/.ply/.fbx/.glb/.stl meshes, .kmz/.png/.jpg ortho quicklooks, flythrough .mp4/.mov, cut/fill .csv/.xlsx exports when verified Raw LiDAR/TLS/Photogrammetry anchor exists)
 * - Potree, Entwine & Tiling Scratch (metashape_tmp/, agisoft_cache/, pix4d_cache/, rc_cache/, potree_cache/, entwine_tmp/, ept-data/, ept-hierarchy/, pdal_scratch/, las_tmp/, terrasolid_tmp/, cloudcompare_tmp/, .e57.tmp, .laz.tmp, .psx.tmp, .lck)
 *
 * Enforces strict Survey Archive Hold, GCP/Boresight Calibration, and Raw TLS/LiDAR/Photogrammetry conservation defaults:
 * - Strictly conserves ALTA/NSPS, cadastral, USGS 3DEP, and UAS Part 107 / EASA survey archival holds
 * - Strictly conserves GCP control coordinate files, camera interior/exterior orientation, LiDAR boresight/lever-arm calibrations, and PPK/RTK RINEX/MRK logs
 * - Strictly conserves verified raw E57, COPC-LAZ, LAZ, Faro FLS, Riegl RXP, Leica LGS/BLK, Metashape PSX, Pix4D P4D, and RealityCapture RCPROJ masters
 * - Detects redundant uncompressed LAS dumps, decimated preview meshes, ortho quicklooks, flythrough renders, and cut/fill CSV exports when a verified master anchor exists
 * - Blocks pruning of mesh/ortho exports lacking a verified LiDAR/TLS/Photogrammetry anchor when guard is active
 * - Blocks hardlinks on mutable GCP/calibration/JSON/CSV/project/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const LIDAR_PHOTOGRAMMETRY_VAULT_SCHEMA = 'duplicatefinder.lidar-photogrammetry-vault-auditor.v1'

export const LIDAR_PHOTOGRAMMETRY_FAMILIES = Object.freeze([
	'all',
	'gcp-calibrations-survey-holds',
	'raw-lidar-photogrammetry-masters',
	'redundant-mesh-ortho-exports',
	'photogrammetry-tiling-scratch',
])

export const LIDAR_PHOTOGRAMMETRY_FAMILY_META = Object.freeze({
	'gcp-calibrations-survey-holds': {
		id: 'gcp-calibrations-survey-holds',
		label: 'GCPs, Boresight & Holds',
		shortLabel: 'GCP Targets, Boresight/Camera Calibrations, PPK RINEX & Survey Holds (.gcp, .jxl, .cam, .obs, .mrk, ALTA/3DEP)',
	},
	'raw-lidar-photogrammetry-masters': {
		id: 'raw-lidar-photogrammetry-masters',
		label: 'Raw TLS, LiDAR & PSX',
		shortLabel: 'Verified Point-Cloud & Photogrammetry Masters (.e57, .copc.laz, .laz, .fls, .rxp, .lgs, .psx, .p4d, .rcproj)',
	},
	'redundant-mesh-ortho-exports': {
		id: 'redundant-mesh-ortho-exports',
		label: 'Redundant Meshes & Orthos',
		shortLabel: 'Uncompressed .las/.xyz, Decimated .obj/.ply/.glb, Ortho Quicklooks, Flythroughs & Cut/Fill CSVs (when Master Anchor Exists)',
	},
	'photogrammetry-tiling-scratch': {
		id: 'photogrammetry-tiling-scratch',
		label: 'Potree & Tiling Scratch',
		shortLabel: 'Dense-Cloud & Octree Scratch (metashape_tmp/, pix4d_cache/, potree_cache/, entwine_tmp/, ept-data/, pdal_scratch/, .e57.tmp)',
	},
})

export const LIDAR_PHOTOGRAMMETRY_STRATEGIES = Object.freeze([
	'prune-exports-and-tiling-scratch',
	'hardlink-immutable-e57-laz-and-tls',
	'quarantine-exports-and-tiling-scratch',
])

export const LIDAR_PHOTOGRAMMETRY_SURVIVOR_RULES = Object.freeze([
	'gcp-raw-lidar-master-first',
	'oldest-flight-first',
	'newest-processing-first',
	'shortest-path',
])

export const LIDAR_PHOTOGRAMMETRY_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'gcp-cal-std-protected',
	'raw-lidar-master-protected',
	'survey-hold-protected',
	'lidar-export-redundant',
	'tiling-scratch-intermediate',
	'shielded',
])

export const LIDAR_PHOTOGRAMMETRY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const LIDAR_PHOTOGRAMMETRY_PRESETS = Object.freeze([
	{
		id: 'all-lidar-photogrammetry-audit',
		name: 'All LiDAR & Photogrammetry Vaults',
		description: 'Audit GCP/boresight/PPK baselines, ALTA/3DEP survey holds, raw E57/COPC-LAZ/TLS/PSX masters, redundant mesh/ortho exports, and Metashape/Potree scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-tiling-scratch',
		survivorRule: 'gcp-raw-lidar-master-first',
		protectGcpAndCalibrationBaselines: true,
		protectRawLidarPhotogrammetryMasters: true,
		protectSurveyArchiveHolds: true,
		requireLidarAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'photogrammetry-tiling-scratch-cleanup',
		name: 'Potree, Metashape & Pix4D Scratch',
		description: 'Reclaim metashape_tmp/, pix4d_cache/, potree_cache/, entwine_tmp/, ept-data/, pdal_scratch/, and .e57.tmp/.laz.tmp scratch older than the active processing grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-tiling-scratch',
		survivorRule: 'gcp-raw-lidar-master-first',
		protectGcpAndCalibrationBaselines: true,
		protectRawLidarPhotogrammetryMasters: true,
		protectSurveyArchiveHolds: true,
		requireLidarAnchorForPrune: true,
		keepRecentJobDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-mesh-ortho-vs-raw-lidar',
		name: 'Redundant Meshes & Orthos vs Masters',
		description: 'Detect uncompressed LAS/XYZ dumps, decimated OBJ/PLY/GLB meshes, ortho quicklooks, flythrough MP4s, and cut/fill CSVs backed by a verified LiDAR or Photogrammetry master anchor.',
		familyFilter: 'redundant-mesh-ortho-exports',
		strategy: 'quarantine-exports-and-tiling-scratch',
		survivorRule: 'gcp-raw-lidar-master-first',
		protectGcpAndCalibrationBaselines: true,
		protectRawLidarPhotogrammetryMasters: true,
		protectSurveyArchiveHolds: true,
		requireLidarAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'gcp-calibration-survey-shield',
		name: 'GCPs, Boresight & Survey Hold Shield',
		description: 'Inspect GCP target files, camera IO/EO and boresight calibrations, PPK/RTK RINEX/MRK logs, and ALTA/USGS 3DEP survey holds under strict shield.',
		familyFilter: 'gcp-calibrations-survey-holds',
		strategy: 'hardlink-immutable-e57-laz-and-tls',
		survivorRule: 'gcp-raw-lidar-master-first',
		protectGcpAndCalibrationBaselines: true,
		protectRawLidarPhotogrammetryMasters: true,
		protectSurveyArchiveHolds: true,
		requireLidarAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-tls-lidar-photogrammetry-masters',
		name: 'Raw E57, COPC-LAZ, TLS & PSX Masters',
		description: 'Audit verified ASTM E57, COPC-LAZ, Faro FLS, Riegl RXP, Leica LGS/BLK, Z+F ZFS, Metashape PSX, Pix4D P4D, and RealityCapture RCPROJ masters.',
		familyFilter: 'raw-lidar-photogrammetry-masters',
		strategy: 'hardlink-immutable-e57-laz-and-tls',
		survivorRule: 'gcp-raw-lidar-master-first',
		protectGcpAndCalibrationBaselines: true,
		protectRawLidarPhotogrammetryMasters: true,
		protectSurveyArchiveHolds: true,
		requireLidarAnchorForPrune: true,
		keepRecentJobDays: 0,
		minSizeKb: 0,
	},
])

export const LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-lidar-photogrammetry-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-tiling-scratch',
	survivorRule: 'gcp-raw-lidar-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectGcpAndCalibrationBaselines: true,
	protectRawLidarPhotogrammetryMasters: true,
	protectSurveyArchiveHolds: true,
	requireLidarAnchorForPrune: true,
	keepRecentJobDays: 0,
	minSizeKb: 0,
})

const STRICT_GCP_CAL_EXT_RE = /\.(?:gcp|jxl|cam|cal|calib|iop|eop|mrk|ubx|t02|t04|rnx|obs|nav|24o|24n|25o|25n|26o|26n)$/i
const STRICT_GCP_CAL_BASENAME_RE = /^(?:gcp_targets|control_points|ground_control_points|checkpoints|boresight|leverarm|camera_calibration|lens_distortion|ppk_rinex|rtk_base)\.(?:csv|txt|xml|json|yaml|yml|cfg)$/i
const STRICT_LIDAR_MASTER_EXT_RE = /\.(?:e57|copc\.laz|laz|fls|fws|rxp|rdbx|zfs|lgs|blk|sdb|ptx|pts|psx|p4d|rcproj|ccm|vce)$/i
const CONTEXT_LIDAR_MASTER_EXT_RE = /\.(?:iiq|dng|tif|tiff|las)$/i
const CONTEXT_SURVEY_DOC_EXT_RE = /\.(?:xml|json|yaml|yml|pdf|txt|csv|log|prj)$/i
const CONTEXT_LIDAR_EXPORT_EXT_RE = /\.(?:las|xyz|asc|obj|ply|fbx|glb|gltf|stl|3ds|kmz|png|jpg|jpeg|webp|pdf|mp4|mov|avi|csv|tsv|xlsx)$/i
const STRICT_LIDAR_SCRATCH_EXT_RE = /\.(?:e57\.tmp|copc\.laz\.tmp|laz\.tmp|las\.tmp|fls\.tmp|rxp\.tmp|psx\.tmp|p4d\.tmp|rcproj\.tmp|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf)$/i

const LIDAR_CONTEXT_HINT_RE = /(?:lidar|photogrammetr|uav_?survey|drone_?survey|tls_?scan|terrestrial_?laser|point_?cloud|metashape|agisoft|pix4d|realitycapture|terrasolid|potree|entwine|pdal|lastools|cloudcompare|leica_?rtc|blk360|faro_?focus|riegl|z_?and_?f|velodyne|ouster|hesai|livox|dji_?terra|matrice|wingtra|ebee|trimble|topcon|ortho_?mosaic|dense_?cloud|mesh_?recon|ppk_?gnss|boresight|gcp_?survey|usgs_?3dep|aerial_?lidar|mobile_?mapping)/i
const LIDAR_CALIBRATION_NAME_RE = /(?:^|[/_-])(?:gcp_?targets?|control_?points?|check_?points?|boresight|lever_?arm|camera_?cal(?:ib)?|interior_?orientation|exterior_?orientation|lens_?distort(?:ion)?|strip_?align|traj(?:ectory)?_?cal|ppk_?base|rtk_?base)(?:[/_.-]|$)/i
const LIDAR_CAL_PATH_RE = /(?:00_gcp|00_calibrations|00_boresight|00_control_points|gcp_control|camera_calib|ppk_gnss|rinex_base|survey_control)/i
const SURVEY_ARCHIVE_HOLD_PATH_RE = /(?:survey_?hold|alta_?hold|cadastral_?hold|usgs_?3dep_?hold|3dep_?archive|uas_?compliance_?hold|part107_?hold|easa_?hold|ngs_?hold|monument_?hold|legal_?boundary_?hold|archive_?hold)/i
const LIDAR_SCRATCH_PATH_RE = /(?:metashape_tmp|agisoft_cache|pix4d_cache|pix4d_tmp|rc_cache|realitycapture_tmp|potree_cache|potree_tmp|entwine_tmp|ept-data|ept-hierarchy|pdal_scratch|las_tmp|terrasolid_tmp|cloudcompare_tmp|dense_cloud_tmp|mesh_cache|tiling_scratch|ortho_staging|dji_terra_cache)/i
const LIDAR_INTERMEDIATE_PREFIX_RE = /^(?:tmp_metashape_|tmp_pix4d_|tmp_potree_|tmp_pdal_|tmp_entwine_|ept_chunk_|tile_staging_|spill_)/i
const LIDAR_INTERMEDIATE_SUFFIX_RE = /(?:_dense_tmp|_mesh_tmp|_ortho_tmp|_tile_tmp|_ept_tmp|_staging)$/i
const LIDAR_EXPORT_PATH_RE = /(?:_decimated|_lowpoly|_preview_mesh|_quicklook|_ortho_preview|_hillshade_preview|_flythrough|_turntable|_volume_report|_cut_fill|_web_?preview|_preview|_thumb|exports_mesh|ortho_previews|deliverable_previews|flythroughs)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_raw|00_lidar|00_tls|00_photogrammetry|00_pointcloud|00_survey|canonical|lidar_vault|photogrammetry_vault|tls_archive|survey_vault)/i

/**
 * Normalize configuration values for LiDAR, UAV Photogrammetry & TLS Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeLidarPhotogrammetryConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = LIDAR_PHOTOGRAMMETRY_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.familyFilter
	const verdictFilter = LIDAR_PHOTOGRAMMETRY_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.verdictFilter
	const strategy = LIDAR_PHOTOGRAMMETRY_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.strategy
	const survivorRule = LIDAR_PHOTOGRAMMETRY_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.survivorRule
	const sortMode = LIDAR_PHOTOGRAMMETRY_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentJobDays)
	const keepRecentJobDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.keepRecentJobDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectGcpAndCalibrationBaselines: cfg.protectGcpAndCalibrationBaselines !== undefined ? Boolean(cfg.protectGcpAndCalibrationBaselines) : true,
		protectRawLidarPhotogrammetryMasters: cfg.protectRawLidarPhotogrammetryMasters !== undefined ? Boolean(cfg.protectRawLidarPhotogrammetryMasters) : true,
		protectSurveyArchiveHolds: cfg.protectSurveyArchiveHolds !== undefined ? Boolean(cfg.protectSurveyArchiveHolds) : true,
		requireLidarAnchorForPrune: cfg.requireLidarAnchorForPrune !== undefined ? Boolean(cfg.requireLidarAnchorForPrune) : true,
		keepRecentJobDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized survey site, flight, or scan stem by stripping extensions and suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized flight/scan stem.
 */
export function extractLidarPhotogrammetryStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:e57\.tmp|copc\.laz\.tmp|laz\.tmp|las\.tmp|fls\.tmp|rxp\.tmp|psx\.tmp|p4d\.tmp|rcproj\.tmp|copc\.laz)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(LIDAR_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(LIDAR_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:_decimated|_lowpoly|_preview_mesh|_quicklook|_ortho_preview|_hillshade_preview|_flythrough|_turntable|_volume_report|_cut_fill|_web_preview|_preview|_thumbnail|_export|_csv|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'survey-scan'
}

/**
 * Extract canonical anchor key linking derived meshes/orthos/reports to raw LiDAR, TLS, or Photogrammetry masters.
 *
 * @param {string} flightStem Extracted flight/scan stem.
 * @return {string} Canonical anchor key.
 */
export function extractLidarPhotogrammetryAnchorKey(flightStem) {
	return String(flightStem || 'survey-scan')
		.toLowerCase()
		.replace(/(?:_classified|_ground|_dsm|_dtm|_chm|_ortho|_mesh|_tin|_obj|_ply|_glb|_fbx|_las|_laz|_e57|_flythrough|_report|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'survey-scan'
}

/**
 * Detect LiDAR, UAV Photogrammetry & TLS toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ lidarToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractLidarToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let lidarToolchain = ''
	if (/\.psx\b|metashape|agisoft/.test(text)) {
		lidarToolchain = 'Agisoft Metashape'
	} else if (/\.p4d\b|pix4d/.test(text)) {
		lidarToolchain = 'Pix4Dmapper / Pix4Dmatic'
	} else if (/\.rcproj\b|realitycapture/.test(text)) {
		lidarToolchain = 'CapturingReality RealityCapture'
	} else if (/\.fls\b|\.fws\b|faro_?focus|faro_?scene/.test(text)) {
		lidarToolchain = 'FARO Scene TLS'
	} else if (/\.rxp\b|\.rdbx\b|riegl/.test(text)) {
		lidarToolchain = 'RIEGL RiSCAN PRO'
	} else if (/\.lgs\b|\.blk\b|\.sdb\b|leica_?rtc|blk360|cyclone/.test(text)) {
		lidarToolchain = 'Leica Cyclone / BLK360'
	} else if (/\.zfs\b|z_?and_?f/.test(text)) {
		lidarToolchain = 'Z+F LaserControl'
	} else if (/\.copc\.laz\b|potree|entwine|ept-data|ept-hierarchy|pdal/.test(text)) {
		lidarToolchain = 'COPC / PDAL / Potree'
	} else if (/\.jxl\b|\.t02\b|\.t04\b|\.vce\b|trimble/.test(text)) {
		lidarToolchain = 'Trimble Business Center / GNSS'
	} else if (/\.e57\b|\.laz\b|\.las\b|\.ptx\b|\.pts\b|terrasolid|lastools|cloudcompare/.test(text)) {
		lidarToolchain = 'ASTM E57 / LAStools / TerraSolid'
	} else if (/dji_?terra|matrice|wingtra|ebee|ppk_?gnss|rinex/.test(text)) {
		lidarToolchain = 'UAV Photogrammetry / PPK GNSS'
	}

	let workflowStage = ''
	if (SURVEY_ARCHIVE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Survey / Compliance Hold'
	} else if (LIDAR_CALIBRATION_NAME_RE.test(text) || STRICT_GCP_CAL_EXT_RE.test(basename) || STRICT_GCP_CAL_BASENAME_RE.test(basename) || LIDAR_CAL_PATH_RE.test(text)) {
		workflowStage = 'GCP / Boresight / PPK Baseline'
	} else if (STRICT_LIDAR_MASTER_EXT_RE.test(basename) || (CONTEXT_LIDAR_MASTER_EXT_RE.test(basename) && LIDAR_CONTEXT_HINT_RE.test(text) && !/\.las$/i.test(basename))) {
		workflowStage = 'Raw TLS / LiDAR / PSX Master'
	} else if (LIDAR_SCRATCH_PATH_RE.test(text) || STRICT_LIDAR_SCRATCH_EXT_RE.test(basename) || LIDAR_INTERMEDIATE_PREFIX_RE.test(basename) || LIDAR_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Potree / Dense-Cloud Scratch'
	} else if (CONTEXT_LIDAR_EXPORT_EXT_RE.test(basename) || LIDAR_EXPORT_PATH_RE.test(text)) {
		workflowStage = 'Derived Mesh / Ortho / Report'
	}

	return { lidarToolchain, workflowStage }
}

/**
 * Extract concise LiDAR & Photogrammetry domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractLidarDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (SURVEY_ARCHIVE_HOLD_PATH_RE.test(text)) {
		return 'SURVEY HOLD'
	}
	if (LIDAR_CALIBRATION_NAME_RE.test(text)) {
		return 'GCP / BORESIGHT'
	}
	if (/\.(?:obs|nav|mrk|ubx|t02|t04|rnx|24o|24n|25o|25n|26o|26n)\b/.test(text)) {
		return 'PPK / RINEX'
	}
	if (/\.(?:copc\.laz)\b/.test(text)) {
		return 'COPC-LAZ'
	}
	if (/\.(?:e57)\b/.test(text)) {
		return 'ASTM E57'
	}
	if (/\.(?:fls|fws|rxp|rdbx|zfs|lgs|blk|sdb|ptx|pts)\b/.test(text)) {
		return 'TLS RAW SCAN'
	}
	if (/\.(?:psx|p4d|rcproj|ccm|vce)\b/.test(text)) {
		return 'PHOTOGRAMMETRY DB'
	}
	if (/\.(?:laz)\b/.test(text)) {
		return 'LAZ ARCHIVE'
	}
	if (/\.las\b/.test(text)) {
		return 'UNCOMPRESSED LAS'
	}
	if (/\.(?:obj|ply|fbx|glb|gltf|stl|3ds)\b/.test(text)) {
		return 'MESH EXPORT'
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
 * Classify a single file within the LiDAR, UAV Photogrammetry & TLS domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyLidarPhotogrammetryFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasLidarContext = LIDAR_CONTEXT_HINT_RE.test(lower)
	const isCalibrationName = LIDAR_CALIBRATION_NAME_RE.test(lower)
	const isScratchPath = LIDAR_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_LIDAR_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = LIDAR_INTERMEDIATE_PREFIX_RE.test(lowerBase) || LIDAR_INTERMEDIATE_SUFFIX_RE.test(lowerBase)
	const isLidarCalPath = LIDAR_CAL_PATH_RE.test(lower)
	const isSurveyHoldPath = SURVEY_ARCHIVE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isLidarExportPath = LIDAR_EXPORT_PATH_RE.test(lower)

	const isStrictGcpCalExt = STRICT_GCP_CAL_EXT_RE.test(lowerBase) && (hasLidarContext || isLidarCalPath || isSurveyHoldPath || isCalibrationName || /\.(?:gcp|jxl|mrk)$/i.test(lowerBase))
	const isStrictGcpCalBasename = STRICT_GCP_CAL_BASENAME_RE.test(lowerBase) && (hasLidarContext || isLidarCalPath || isSurveyHoldPath || /^(?:gcp_targets|boresight|leverarm)\./i.test(lowerBase))
	const isStrictLidarMasterExt = STRICT_LIDAR_MASTER_EXT_RE.test(lowerBase)
	const isContextSurveyImg = /\.(?:iiq|dng|tif|tiff)$/i.test(lowerBase) && hasLidarContext && !isLidarExportPath
	const isUncompressedLasDump = /\.las$/i.test(lowerBase) && (hasLidarContext || isCanonicalVaultPath || isLidarExportPath || isScratchPath)
	const isContextSurveyDoc = CONTEXT_SURVEY_DOC_EXT_RE.test(lowerBase) && (isLidarCalPath || isSurveyHoldPath)
	const isContextLidarExport = CONTEXT_LIDAR_EXPORT_EXT_RE.test(lowerBase) && !isStrictLidarMasterExt && (hasLidarContext || isLidarExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside LiDAR & Photogrammetry Vault'
	let isProtectedGcpCalibrationBaseline = false
	let isProtectedRawLidarMaster = false
	let isProtectedSurveyArchiveHold = false
	let isLidarMasterAnchor = false
	let isRedundantLidarExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextLidarExport || isStrictLidarMasterExt || isContextSurveyImg || isStrictGcpCalExt))
		|| (isIntermediateSubfile && (isStrictLidarMasterExt || isContextLidarExport || hasLidarContext))
		|| (isGenericScratchExt && hasLidarContext)
	) {
		family = 'photogrammetry-tiling-scratch'
		artifactKind = isStrictScratchExt
			? 'LiDAR / Photogrammetry Scratch File'
			: (isIntermediateSubfile ? 'Dense-Cloud / EPT Tile Intermediate' : 'Potree / Metashape / Pix4D Scratch')
		vaultRole = 'Metashape / Pix4D / Potree / PDAL Scratch'
		isMutableFile = true
	} else if (isSurveyHoldPath && (isStrictGcpCalExt || isStrictGcpCalBasename || isStrictLidarMasterExt || isContextSurveyImg || isContextSurveyDoc)) {
		family = 'gcp-calibrations-survey-holds'
		artifactKind = 'ALTA / USGS 3DEP / Cadastral Survey Hold'
		vaultRole = 'Protected Legal & Mapping Survey Hold'
		isProtectedSurveyArchiveHold = true
		isProtectedGcpCalibrationBaseline = true
		isLidarMasterAnchor = isStrictGcpCalExt || isStrictLidarMasterExt || isContextSurveyImg
		isMutableFile = /\.(?:xml|json|yaml|yml|txt|csv|log|gcp|jxl|cam|cal|calib)$/i.test(lowerBase) || isStrictGcpCalBasename
	} else if (
		isStrictGcpCalExt
		|| isStrictGcpCalBasename
		|| (isCalibrationName && (isStrictLidarMasterExt || isContextSurveyImg || isContextSurveyDoc || hasLidarContext))
		|| (isLidarCalPath && (isContextSurveyDoc || isStrictLidarMasterExt || isContextSurveyImg))
	) {
		family = 'gcp-calibrations-survey-holds'
		if (/\.(?:obs|nav|mrk|ubx|t02|t04|rnx|24o|24n|25o|25n|26o|26n)$/i.test(lowerBase)) {
			artifactKind = 'PPK / RTK GNSS RINEX & Trigger Log'
			vaultRole = 'Geodetic Trajectory & Shutter Timestamp Baseline'
		} else if (/\.(?:cam|cal|calib|iop|eop)$/i.test(lowerBase) || /boresight|lever_?arm|camera_?cal|lens_?distort|strip_?align/.test(lower)) {
			artifactKind = 'Boresight & Camera IO/EO Calibration'
			vaultRole = 'Sensor Lever-Arm & Interior Orientation Baseline'
		} else {
			artifactKind = 'GCP Control Targets & Checkpoint Coordinates'
			vaultRole = 'Ground Control & Geodetic Tie-Point Baseline'
		}
		isProtectedGcpCalibrationBaseline = true
		isLidarMasterAnchor = isStrictGcpCalExt || isStrictLidarMasterExt || isContextSurveyImg
		isMutableFile = /\.(?:gcp|jxl|cam|cal|calib|iop|eop|mrk|xml|json|yaml|yml|txt|csv|log|cfg)$/i.test(lowerBase) || isStrictGcpCalBasename
	} else if (isStrictLidarMasterExt || isContextSurveyImg) {
		family = 'raw-lidar-photogrammetry-masters'
		if (/\.(?:copc\.laz)$/i.test(lowerBase)) {
			artifactKind = 'Cloud-Optimized Point Cloud (COPC-LAZ)'
			vaultRole = 'Indexed Spatial Point-Cloud Master'
		} else if (/\.(?:e57)$/i.test(lowerBase)) {
			artifactKind = 'ASTM E57 Registered Scan Master'
			vaultRole = 'Vendor-Neutral Terrestrial / Mobile LiDAR Master'
		} else if (/\.(?:fls|fws|rxp|rdbx|zfs|lgs|blk|sdb|ptx|pts)$/i.test(lowerBase)) {
			artifactKind = 'Terrestrial / Mobile Laser Scanner Raw Master'
			vaultRole = 'Calibrated TLS Station Scan Master'
		} else if (/\.(?:psx|p4d|rcproj|ccm|vce)$/i.test(lowerBase)) {
			artifactKind = 'Photogrammetry Project Database Master'
			vaultRole = 'Bundle Adjustment & Tie-Point Project Master'
		} else if (/\.(?:iiq|dng|tif|tiff)$/i.test(lowerBase)) {
			artifactKind = 'Survey Frame / Raw GeoTIFF Master'
			vaultRole = 'Photogrammetric Frame or Ortho Master'
		} else {
			artifactKind = 'Compressed LAZ Point-Cloud Master'
			vaultRole = 'Lossless Compressed LiDAR Point-Cloud Master'
		}
		isProtectedRawLidarMaster = true
		isLidarMasterAnchor = true
		isMutableFile = /\.(?:psx|p4d|rcproj|ccm|vce)$/i.test(lowerBase)
	} else if (isContextSurveyDoc) {
		family = 'gcp-calibrations-survey-holds'
		artifactKind = 'Survey Flight & Datum Provenance Manifest'
		vaultRole = 'CRS / Datum & Flight Mission Log'
		isProtectedGcpCalibrationBaseline = true
		isMutableFile = true
	} else if (isUncompressedLasDump || isContextLidarExport) {
		family = 'redundant-mesh-ortho-exports'
		if (/\.las$/i.test(lowerBase)) {
			artifactKind = 'Uncompressed LAS Point-Cloud Export'
		} else if (/\.(?:xyz|asc)$/i.test(lowerBase)) {
			artifactKind = 'ASCII XYZ / ASC Point-Cloud Dump'
		} else if (/\.(?:obj|ply|fbx|glb|gltf|stl|3ds)$/i.test(lowerBase)) {
			artifactKind = 'Decimated 3D Mesh / Preview Export'
		} else if (/\.(?:mp4|mov|avi)$/i.test(lowerBase)) {
			artifactKind = 'Point-Cloud Flythrough Animation'
		} else if (/\.(?:csv|tsv|xlsx|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Cut/Fill Volume or Quality Report Export'
		} else {
			artifactKind = 'Ortho-Mosaic Quicklook / KMZ Preview'
		}
		vaultRole = 'Derived Mesh, Ortho Quicklook, or Report Export'
		isRedundantLidarExport = true
		isMutableFile = true
	}

	const { lidarToolchain, workflowStage } = extractLidarToolchainAndStage(normalized, basename)
	const flightStem = extractLidarPhotogrammetryStem(basename, normalized)
	const lidarAnchorKey = extractLidarPhotogrammetryAnchorKey(flightStem)
	const lidarTag = extractLidarDomainTag(lowerBase, lower)

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
		lidarToolchain,
		workflowStage,
		flightStem,
		lidarAnchorKey,
		lidarTag,
		isProtectedGcpCalibrationBaseline,
		isProtectedRawLidarMaster,
		isProtectedSurveyArchiveHold,
		isLidarMasterAnchor,
		isRedundantLidarExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'photogrammetry-tiling-scratch') || (isGenericScratchExt && hasLidarContext),
		isLidarCalPath,
		isSurveyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the LiDAR, UAV Photogrammetry & TLS domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isLidarPhotogrammetryGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyLidarPhotogrammetryFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Raw LiDAR/TLS/Photogrammetry/GCP anchors
 * to derived uncompressed LAS dumps, decimated meshes, ortho quicklooks, and cut/fill CSV exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildLidarPhotogrammetryCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyLidarPhotogrammetryFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isLidarMasterAnchor) {
				anchorStems.add(meta.flightStem)
				anchorKeys.add(meta.lidarAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous LiDAR & Photogrammetry cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'gcp-calibrations-survey-holds')) {
		return 'gcp-calibrations-survey-holds'
	}
	if (members.some(m => m.family === 'raw-lidar-photogrammetry-masters')) {
		return 'raw-lidar-photogrammetry-masters'
	}
	if (members.some(m => m.family === 'redundant-mesh-ortho-exports')) {
		return 'redundant-mesh-ortho-exports'
	}
	return 'photogrammetry-tiling-scratch'
}

/**
 * Compute deterministic survivor priority score for a LiDAR & Photogrammetry vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-flight-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedSurveyArchiveHold ? 100000 : 0)
			+ (member.isProtectedGcpCalibrationBaseline ? 97000 : 0)
			+ (member.isProtectedRawLidarMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantLidarExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-processing-first') {
		return (member.isProtectedSurveyArchiveHold ? 100000 : 0)
			+ (member.isProtectedGcpCalibrationBaseline ? 97000 : 0)
			+ (member.isProtectedRawLidarMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantLidarExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedSurveyArchiveHold ? 52000 : 0)
			+ (member.isProtectedGcpCalibrationBaseline ? 50000 : 0)
			+ (member.isProtectedRawLidarMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedSurveyArchiveHold ? 100000 : 0)
		+ (member.isProtectedGcpCalibrationBaseline ? 97000 : 0)
		+ (member.isProtectedRawLidarMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantLidarExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single LiDAR, UAV Photogrammetry & TLS duplicate cluster.
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
		const meta = classifyLidarPhotogrammetryFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.lidarToolchain)?.lidarToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].flightStem || extractLidarPhotogrammetryStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].lidarAnchorKey || extractLidarPhotogrammetryAnchorKey(primaryStem)

	const hasLidarMasterAnchor = Boolean(
		rawMembers.some(m => m.isLidarMasterAnchor)
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

		const isRedundantLidarExportMember = member.isRedundantLidarExport && hasLidarMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantLidarExport) {
			redundancyReason = isRedundantLidarExportMember
				? 'Derived LAS dump, decimated mesh, or ortho preview duplicates verified Raw LiDAR, TLS, or Photogrammetry master'
				: 'Mesh, LAS dump, or ortho export without verified Raw LiDAR, TLS, or Photogrammetry master anchor'
		}

		let governanceTier = 'tiling-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedSurveyArchiveHold
				? 'survey-hold-protected'
				: (member.isProtectedGcpCalibrationBaseline
					? 'gcp-cal-std-protected'
					: (member.isProtectedRawLidarMaster
						? 'raw-lidar-master-protected'
						: (member.isRedundantLidarExport
							? 'lidar-export-redundant'
							: 'tiling-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedSurveyArchiveHold && config.protectSurveyArchiveHolds) {
			governanceTier = 'survey-hold-protected'
			shielded = true
			protectedReason = 'ALTA / USGS 3DEP / Cadastral survey archival hold strictly conserved'
		} else if (member.isProtectedGcpCalibrationBaseline && config.protectGcpAndCalibrationBaselines) {
			governanceTier = 'gcp-cal-std-protected'
			shielded = true
			protectedReason = 'GCP coordinates, boresight/camera calibration, or PPK RINEX baseline strictly conserved'
		} else if (member.isProtectedRawLidarMaster && config.protectRawLidarPhotogrammetryMasters) {
			governanceTier = 'raw-lidar-master-protected'
			shielded = true
			protectedReason = 'Verified raw E57, COPC-LAZ, TLS scan, or Photogrammetry project master strictly conserved'
		} else if (isSurvivor && !isRedundantLidarExportMember) {
			governanceTier = member.isProtectedSurveyArchiveHold
				? 'survey-hold-protected'
				: (member.isProtectedGcpCalibrationBaseline
					? 'gcp-cal-std-protected'
					: (member.isProtectedRawLidarMaster
						? 'raw-lidar-master-protected'
						: (member.isRedundantLidarExport
							? 'lidar-export-redundant'
							: 'tiling-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical LiDAR & Photogrammetry vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantLidarExport
				? 'lidar-export-redundant'
				: (member.isProtectedGcpCalibrationBaseline
					? 'gcp-cal-std-protected'
					: 'tiling-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-e57-laz-and-tls' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentJobDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentJobDays
		) {
			governanceTier = 'tiling-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentJobDays}-day active Metashape, Pix4D, or Potree processing grace window`
		} else if (member.isRedundantLidarExport) {
			governanceTier = 'lidar-export-redundant'
			if (config.requireLidarAnchorForPrune && !hasLidarMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Raw E57, COPC-LAZ, TLS, or Photogrammetry master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'tiling-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Metashape, Pix4D, Potree, Entwine, or PDAL tiling scratch eligible for cleanup'
		} else if (member.isProtectedRawLidarMaster || member.isProtectedGcpCalibrationBaseline) {
			governanceTier = member.isProtectedGcpCalibrationBaseline ? 'gcp-cal-std-protected' : 'raw-lidar-master-protected'
			action = config.strategy === 'hardlink-immutable-e57-laz-and-tls' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-e57-laz-and-tls' && !member.isMutableFile) {
			governanceTier = 'raw-lidar-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'tiling-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantLidarExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantLidarExport = members.some(m => m.isRedundantLidarExportMember || m.isRedundantLidarExport)
	const hasProtectedSurveyHold = members.some(m => m.governanceTier === 'survey-hold-protected' && m.shielded)
	const hasProtectedGcpCalBaseline = members.some(m => m.governanceTier === 'gcp-cal-std-protected' && m.shielded)
	const hasProtectedRawLidarMaster = members.some(m => m.governanceTier === 'raw-lidar-master-protected' && m.shielded)
	const hasTilingScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantLidarExportMember && !m.shielded)) {
			clusterVerdict = 'lidar-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'tiling-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedSurveyHold) {
		clusterVerdict = 'survey-hold-protected'
	} else if (hasProtectedGcpCalBaseline) {
		clusterVerdict = 'gcp-cal-std-protected'
	} else if (hasProtectedRawLidarMaster) {
		clusterVerdict = 'raw-lidar-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantLidarExport ? 95 : 85
	} else if (hasProtectedSurveyHold) {
		priorityScore = 60
	} else if (hasProtectedGcpCalBaseline) {
		priorityScore = 50
	}

	const lidarTags = [...new Set(members.map(m => m.lidarTag).filter(Boolean))]
	const familyMeta = LIDAR_PHOTOGRAMMETRY_FAMILY_META[family] || LIDAR_PHOTOGRAMMETRY_FAMILY_META['photogrammetry-tiling-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		lidarToolchain: primaryToolchain,
		workflowStage: primaryStage,
		flightStem: primaryStem,
		lidarAnchorKey: primaryAnchorKey,
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
		hasProtectedGcpCalBaseline,
		hasProtectedRawLidarMaster,
		hasProtectedSurveyHold,
		hasRedundantLidarExport,
		hasTilingScratchIntermediate,
		hasLidarMasterAnchor,
		lidarTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a LiDAR, UAV Photogrammetry & Terrestrial Laser Scanning Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive LiDAR & Photogrammetry vault audit report.
 */
export function auditLidarPhotogrammetryVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeLidarPhotogrammetryConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isLidarPhotogrammetryGroup)
	const correlationIndex = buildLidarPhotogrammetryCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'gcp-calibrations-survey-holds': 0,
		'raw-lidar-photogrammetry-masters': 0,
		'redundant-mesh-ortho-exports': 0,
		'photogrammetry-tiling-scratch': 0,
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
				cluster.lidarToolchain,
				cluster.workflowStage,
				cluster.flightStem,
				cluster.lidarAnchorKey,
				cluster.familyLabel,
				...cluster.lidarTags,
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
	let totalGcpCalStdClusters = 0
	let totalRawLidarMasterClusters = 0
	let totalSurveyHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalTilingScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedGcpCalBaseline) {
			totalGcpCalStdClusters += 1
		}
		if (cluster.hasProtectedRawLidarMaster) {
			totalRawLidarMasterClusters += 1
		}
		if (cluster.hasProtectedSurveyHold) {
			totalSurveyHoldClusters += 1
		}
		if (cluster.hasRedundantLidarExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasTilingScratchIntermediate) {
			totalTilingScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = LIDAR_PHOTOGRAMMETRY_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: LIDAR_PHOTOGRAMMETRY_FAMILY_META[id].label,
			shortLabel: LIDAR_PHOTOGRAMMETRY_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: LIDAR_PHOTOGRAMMETRY_VAULT_SCHEMA,
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
			totalGcpCalStdClusters,
			totalRawLidarMasterClusters,
			totalSurveyHoldClusters,
			totalRedundantExportClusters,
			totalTilingScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for LiDAR & Photogrammetry Vaults.
 * Strictly blocks deletion or hardlinking of shielded GCP/calibration baselines, Survey Holds,
 * and verified Raw LiDAR/TLS/Photogrammetry masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditLidarPhotogrammetryVault.
 * @return {string} POSIX bash script.
 */
export function buildLidarPhotogrammetryRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# LiDAR, UAV Photogrammetry & Terrestrial Laser Scanning Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./lidar-photogrammetry-vault-reclaim.sh only after verifying Raw E57/COPC-LAZ/TLS/PSX anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.lidar-photogrammetry-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-tiling-scratch'
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
			} else if (strategy === 'quarantine-exports-and-tiling-scratch' && (target.isRedundantLidarExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable mesh/ortho exports or Potree/Metashape scratch under active LiDAR & Photogrammetry shields.\\n"')
	} else {
		lines.push(`printf "Completed LiDAR & Photogrammetry Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditLidarPhotogrammetryVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildLidarPhotogrammetryCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'lidar_toolchain',
		'workflow_stage',
		'flight_stem',
		'lidar_anchor_key',
		'family',
		'cluster_verdict',
		'has_lidar_master_anchor',
		'is_redundant_lidar_export',
		'is_tiling_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'lidar_tag',
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
				cluster.lidarToolchain || '',
				cluster.workflowStage || '',
				cluster.flightStem,
				cluster.lidarAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasLidarMasterAnchor ? 'true' : 'false',
				member.isRedundantLidarExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.lidarTag || '',
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
 * @param {object} auditResult Result from auditLidarPhotogrammetryVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildLidarPhotogrammetryJsonManifest(auditResult) {
	const payload = {
		schema: LIDAR_PHOTOGRAMMETRY_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || LIDAR_PHOTOGRAMMETRY_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			lidarToolchain: cluster.lidarToolchain,
			workflowStage: cluster.workflowStage,
			flightStem: cluster.flightStem,
			lidarAnchorKey: cluster.lidarAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedGcpCalBaseline: cluster.hasProtectedGcpCalBaseline,
			hasProtectedRawLidarMaster: cluster.hasProtectedRawLidarMaster,
			hasProtectedSurveyHold: cluster.hasProtectedSurveyHold,
			hasRedundantLidarExport: cluster.hasRedundantLidarExport,
			hasTilingScratchIntermediate: cluster.hasTilingScratchIntermediate,
			hasLidarMasterAnchor: cluster.hasLidarMasterAnchor,
			lidarTags: cluster.lidarTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				lidarTag: member.lidarTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantLidarExportMember: member.isRedundantLidarExportMember,
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
 * cloud sync of Metashape, Pix4D, RealityCapture, Potree, Entwine, and PDAL scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildLidarPhotogrammetrySyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for LiDAR, UAV Photogrammetry & TLS Vaults',
		'metashape_tmp/',
		'agisoft_cache/',
		'pix4d_cache/',
		'pix4d_tmp/',
		'rc_cache/',
		'realitycapture_tmp/',
		'potree_cache/',
		'potree_tmp/',
		'entwine_tmp/',
		'ept-data/',
		'ept-hierarchy/',
		'pdal_scratch/',
		'las_tmp/',
		'terrasolid_tmp/',
		'cloudcompare_tmp/',
		'dense_cloud_tmp/',
		'mesh_cache/',
		'tiling_scratch/',
		'ortho_staging/',
		'dji_terra_cache/',
		'tmp_metashape_*',
		'tmp_pix4d_*',
		'tmp_potree_*',
		'tmp_pdal_*',
		'tmp_entwine_*',
		'*.e57.tmp',
		'*.copc.laz.tmp',
		'*.laz.tmp',
		'*.las.tmp',
		'*.fls.tmp',
		'*.rxp.tmp',
		'*.psx.tmp',
		'*.p4d.tmp',
		'*.rcproj.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
