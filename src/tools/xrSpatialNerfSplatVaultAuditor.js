/**
 * Pure XR Spatial Computing, Photorealistic NeRF/Gaussian Splatting & Volumetric Video Vault Auditor.
 * Classifies and audits duplicate clusters across 4 XR Spatial, NeRF/3DGS & Volumetric Video Vault families:
 * - OpenXR, VisionOS/USDZ Calibration & Spatial Safety Holds (.oxr, .openxr, .usdz, .reality, .vrm, .xrsafety, .ipdcal, .guardian, .chaperone, .spatialanchor, .xrhold, .stereocal, plus JSON/XML/YAML/SQLite/CSV/PDF in calibration/safety baseline context)
 * - NeRF, 3D Gaussian Splatting & Volumetric Video Masters (.splat, .ksplat, .spz, .nerf, .ngp, .nsconfig, .colmap, .vpcc, .drc, .depthkit, .mkv3d, .r3dvol, .holocap, .4dviews, .volcap, plus .ply/.las/.laz/.e57/.abc/.usd/.usda/.usdc/.ckpt/.safetensors/.pt/.pth/.bin/.h5/.hdf5/.npz in XR/NeRF/3DGS/Volumetric context)
 * - Derived Turntable Renders, WebXR LOD Previews & Splat Viewer Exports (.mp4, .webm, .mov, .gif, .glb, .gltf, .png, .jpg, .jpeg, .webp, .pdf, .csv, .tsv, .json, .jsonl in XR/NeRF/3DGS/Volumetric export context)
 * - HMD Runtime Telemetry, Splat Training Cache & Volumetric Spool Scratch (nerfstudio_cache/, gsplat_raster_tmp/, colmap_feature_cache/, openxr_runtime_logs/, steamvr_frame_dumps/, volcap_rgbd_spool/, usdz_compile_tmp/, webxr_shader_cache/, reality_composer_tmp/, gaussian_mcmc_buf/, depthkit_mux_tmp/, xr_hmd_telemetry_tmp/, .splat.tmp, .nerf.tmp, .ngp.bak, .colmap.idx, .vpcc.part, .usdz.tmp, .oxr.lck, .volcap.tmp, .gsplat.tmp, .lck)
 *
 * Enforces strict OpenXR / Spatial Safety Hold & NeRF/3DGS/Volumetric Master defaults:
 * - Strictly conserves spatial boundary, SAR/optics safety, IPD/lens calibration, and regulatory XR compliance holds
 * - Strictly conserves canonical OpenXR manifests, USDZ/Reality anchors, and spatial calibration baselines
 * - Strictly conserves verified NeRF radiance checkpoints, 3D Gaussian Splatting (.splat/.ksplat/.spz/.ply) masters, COLMAP SfM reconstructions, and volumetric video masters
 * - Detects redundant turntable MP4s, WebXR decimated GLB LODs, depth/alpha inspection PNGs, and PSNR/SSIM metric CSVs when a verified XR/NeRF/3DGS master anchor exists
 * - Blocks pruning of derived XR/NeRF preview exports lacking a verified master anchor when guard is active
 * - Blocks hardlinks on mutable JSON/XML/CSV/GLB/MP4/USDZ files and runtime/training scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const XR_SPATIAL_NERF_SPLAT_VAULT_SCHEMA = 'duplicatefinder.xr-spatial-nerf-splat-vault-auditor.v1'

export const XR_SPATIAL_NERF_SPLAT_FAMILIES = Object.freeze([
	'all',
	'xr-spatial-calibration-holds',
	'xr-nerf-splat-volumetric-masters',
	'redundant-xr-preview-exports',
	'xr-runtime-training-scratch',
])

export const XR_SPATIAL_NERF_SPLAT_FAMILY_META = Object.freeze({
	'xr-spatial-calibration-holds': {
		id: 'xr-spatial-calibration-holds',
		label: 'OpenXR / Calibration & Safety Holds',
		shortLabel: 'Spatial Calibration, OpenXR, USDZ Anchors & Safety Holds (.oxr, .openxr, .usdz, .reality, .xrsafety, .ipdcal, .xrhold)',
	},
	'xr-nerf-splat-volumetric-masters': {
		id: 'xr-nerf-splat-volumetric-masters',
		label: 'NeRF / 3DGS / Volumetric Masters',
		shortLabel: 'Verified Masters (.splat, .ksplat, .spz, .nerf, .ngp, .colmap, .vpcc, .depthkit, .holocap, .4dviews)',
	},
	'redundant-xr-preview-exports': {
		id: 'redundant-xr-preview-exports',
		label: 'Derived Turntables & WebXR LODs',
		shortLabel: 'Derived Turntable MP4s, WebXR GLB LODs, Depth/Alpha PNGs & PSNR CSVs (.mp4, .webm, .glb, .gltf, .png, .csv)',
	},
	'xr-runtime-training-scratch': {
		id: 'xr-runtime-training-scratch',
		label: 'Runtime & Training Scratch',
		shortLabel: 'Cache & Spool (nerfstudio_cache/, gsplat_raster_tmp/, colmap_feature_cache/, openxr_runtime_logs/, .splat.tmp)',
	},
})

export const XR_SPATIAL_NERF_SPLAT_STRATEGIES = Object.freeze([
	'prune-previews-and-xr-scratch',
	'hardlink-immutable-xr-masters',
	'quarantine-previews-and-xr-scratch',
])

export const XR_SPATIAL_NERF_SPLAT_SURVIVOR_RULES = Object.freeze([
	'xr-calibration-nerf-master-first',
	'oldest-capture-run-first',
	'newest-training-ckpt-first',
	'shortest-path',
])

export const XR_SPATIAL_NERF_SPLAT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'xr-spatial-calibration-protected',
	'xr-nerf-splat-master-protected',
	'xr-safety-hold-protected',
	'xr-preview-redundant',
	'xr-runtime-scratch',
	'shielded',
])

export const XR_SPATIAL_NERF_SPLAT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const XR_SPATIAL_NERF_SPLAT_PRESETS = Object.freeze([
	{
		id: 'all-xr-spatial-nerf-splat-audit',
		name: 'All XR, NeRF & 3DGS',
		description: 'Audit OpenXR/USDZ calibration and safety holds, NeRF/3DGS/Volumetric masters, derived WebXR LOD/turntable previews, and training scratch.',
		familyFilter: 'all',
		strategy: 'prune-previews-and-xr-scratch',
		survivorRule: 'xr-calibration-nerf-master-first',
		protectSpatialCalibrationAndSafetyHolds: true,
		protectNerfSplatVolumetricMasters: true,
		protectSafetyComplianceHolds: true,
		requireXrMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'xr-runtime-scratch-cleanup',
		name: 'Training & Runtime Scratch',
		description: 'Reclaim nerfstudio_cache/, gsplat_raster_tmp/, colmap_feature_cache/, openxr_runtime_logs/, and .splat.tmp/.colmap.idx scratch older than the active window.',
		familyFilter: 'all',
		strategy: 'prune-previews-and-xr-scratch',
		survivorRule: 'xr-calibration-nerf-master-first',
		protectSpatialCalibrationAndSafetyHolds: true,
		protectNerfSplatVolumetricMasters: true,
		protectSafetyComplianceHolds: true,
		requireXrMasterAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-xr-previews-vs-masters',
		name: 'Derived Previews vs Masters',
		description: 'Detect derived turntable flythroughs, WebXR decimated GLB LODs, depth inspection PNGs, and PSNR/SSIM CSVs backed by a verified NeRF/3DGS/Volumetric anchor.',
		familyFilter: 'redundant-xr-preview-exports',
		strategy: 'quarantine-previews-and-xr-scratch',
		survivorRule: 'xr-calibration-nerf-master-first',
		protectSpatialCalibrationAndSafetyHolds: true,
		protectNerfSplatVolumetricMasters: true,
		protectSafetyComplianceHolds: true,
		requireXrMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'xr-spatial-calibration-shield',
		name: 'OpenXR / Calibration Shield',
		description: 'Inspect spatial safety holds, IPD/lens distortion profiles, OpenXR runtime manifests, guardian boundaries, and canonical USDZ/Reality anchors under strict shield.',
		familyFilter: 'xr-spatial-calibration-holds',
		strategy: 'hardlink-immutable-xr-masters',
		survivorRule: 'xr-calibration-nerf-master-first',
		protectSpatialCalibrationAndSafetyHolds: true,
		protectNerfSplatVolumetricMasters: true,
		protectSafetyComplianceHolds: true,
		requireXrMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'xr-nerf-splat-volumetric-masters',
		name: 'NeRF / 3DGS / Volumetric Masters',
		description: 'Audit verified 3D Gaussian Splatting (.splat/.ksplat/.spz), Instant-NGP/Nerfstudio radiance weights, COLMAP SfM, and MPEG V-PCC/Depthkit volumetric masters.',
		familyFilter: 'xr-nerf-splat-volumetric-masters',
		strategy: 'hardlink-immutable-xr-masters',
		survivorRule: 'xr-calibration-nerf-master-first',
		protectSpatialCalibrationAndSafetyHolds: true,
		protectNerfSplatVolumetricMasters: true,
		protectSafetyComplianceHolds: true,
		requireXrMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-xr-spatial-nerf-splat-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-previews-and-xr-scratch',
	survivorRule: 'xr-calibration-nerf-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectSpatialCalibrationAndSafetyHolds: true,
	protectNerfSplatVolumetricMasters: true,
	protectSafetyComplianceHolds: true,
	requireXrMasterAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_XR_CALIBRATION_EXT_RE = /\.(?:oxr|openxr|usdz|reality|vrm|xrsafety|ipdcal|guardian|chaperone|spatialanchor|xrhold|stereocal)$/i
const CONTEXT_XR_CALIBRATION_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_XR_MASTER_EXT_RE = /\.(?:splat|ksplat|spz|nerf|ngp|nsconfig|colmap|vpcc|drc|depthkit|mkv3d|r3dvol|holocap|4dviews|volcap)$/i
const CONTEXT_XR_MASTER_EXT_RE = /\.(?:ply|las|laz|e57|abc|usd|usda|usdc|ckpt|safetensors|pt|pth|bin|h5|hdf5|npz)$/i
const CONTEXT_XR_EXPORT_EXT_RE = /\.(?:mp4|webm|mov|gif|glb|gltf|png|jpg|jpeg|webp|pdf|csv|tsv|json|jsonl)$/i
const STRICT_XR_SCRATCH_EXT_RE = /\.(?:splat\.tmp|nerf\.tmp|ngp\.bak|colmap\.idx|vpcc\.part|usdz\.tmp|oxr\.lck|volcap\.tmp|gsplat\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_XR_EXCLUSION_RE = /(?:winery_?vault|enology|haccp|ttb_?manifest|oiv|fsma|brewhouse|veterinary|vet_?pacs|vetdcm|vpacs|equine|livestock|epanet|swmm|watergems|sdwis|phmsa|iec61850|comtrade|synchrophasor|v2x|scms|ntcip|etcs|ertms|cbtc|railml|quantum|qubit|qasm|geant4|cmssw|orbital|ccsds|human_?bids|hipaa|hl7|fhir|dicom|nifti|clinvar|gnomad|grch38|hg38|gdsii|oasis|openfoam|ansys|fluent|kicad|gerber|lidar_?vault|photogrammetry_?vault|game3d_?vault|vfx_?vault)/i
const XR_CONTEXT_HINT_RE = /(?:xr_?vault|spatial_?computing|openxr|webxr|visionos|realitykit|arkit|arcore|steamvr|monado|nerfstudio|instant_?ngp|3dgs|gsplat|gaussian_?splat|splatfacto|nerfacto|colmap|volcap|volumetric_?video|depthkit|holocap|4dviews|vpcc|draco_?mesh|hmd_?calib|ipd_?cal|chaperone|guardian_?mesh|spatial_?anchor|turntable_?render|webxr_?lod)/i
const XR_SAFETY_HOLD_PATH_RE = /(?:xr_?hold|safety_?hold|optics_?hold|sar_?hold|ergonomic_?hold|fda_?xr_?hold|calibration_?hold|guardian_?hold|chaperone_?hold|quarantine_?capture|regulatory_?hold|litigation_?hold)/i
const XR_BASELINE_PATH_RE = /(?:00_openxr|00_calibration|00_ipd|00_anchors|00_usdz|00_safety|calibration_baselines|openxr_manifests|spatial_anchors|guardian_profiles|lens_distortion|safety_compliance)/i
const XR_SCRATCH_PATH_RE = /(?:nerfstudio_cache|gsplat_raster_tmp|colmap_feature_cache|openxr_runtime_logs|steamvr_frame_dumps|volcap_rgbd_spool|usdz_compile_tmp|webxr_shader_cache|reality_composer_tmp|gaussian_mcmc_buf|depthkit_mux_tmp|xr_hmd_telemetry_tmp)/i
const XR_INTERMEDIATE_PREFIX_RE = /^(?:tmp_xr_|tmp_nerf_|tmp_splat_|tmp_gsplat_|tmp_colmap_|tmp_volcap_|tmp_openxr_|tmp_usdz_|cache_splat_|spool_volcap_)/i
const XR_INTERMEDIATE_SUFFIX_RE = /(?:_splat_tmp|_nerf_cache|_gsplat_buf|_colmap_spool|_volcap_tmp|_openxr_log|_usdz_tmp)$/i
const XR_EXPORT_PATH_RE = /(?:turntable_renders|webxr_lods|splat_previews|nerf_flythroughs|volcap_previews|depth_inspection|psnr_reports|lod_exports|_turntable|_webxr_lod|_splat_preview|_nerf_flythrough|_psnr_csv|_depth_preview)/i
const CANONICAL_XR_VAULT_PATH_RE = /(?:00_raw|00_splat|00_nerf|00_gsplat|00_colmap|00_volcap|00_masters|canonical|xr_archive|nerf_archive|volcap_archive)/i

/**
 * Normalize configuration values for XR Spatial Computing, NeRF/Gaussian Splatting & Volumetric Video Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeXrSpatialNerfSplatConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = XR_SPATIAL_NERF_SPLAT_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.familyFilter
	const verdictFilter = XR_SPATIAL_NERF_SPLAT_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.verdictFilter
	const strategy = XR_SPATIAL_NERF_SPLAT_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.strategy
	const survivorRule = XR_SPATIAL_NERF_SPLAT_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.survivorRule
	const sortMode = XR_SPATIAL_NERF_SPLAT_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectSpatialCalibrationAndSafetyHolds: cfg.protectSpatialCalibrationAndSafetyHolds !== undefined ? Boolean(cfg.protectSpatialCalibrationAndSafetyHolds) : true,
		protectNerfSplatVolumetricMasters: cfg.protectNerfSplatVolumetricMasters !== undefined ? Boolean(cfg.protectNerfSplatVolumetricMasters) : true,
		protectSafetyComplianceHolds: cfg.protectSafetyComplianceHolds !== undefined ? Boolean(cfg.protectSafetyComplianceHolds) : true,
		requireXrMasterAnchorForPrune: cfg.requireXrMasterAnchorForPrune !== undefined ? Boolean(cfg.requireXrMasterAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized XR scene, NeRF/3DGS capture, or volumetric take stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized XR/NeRF/3DGS stem.
 */
export function extractXrSpatialNerfSplatStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:splat\.tmp|nerf\.tmp|ngp\.bak|colmap\.idx|vpcc\.part|usdz\.tmp|oxr\.lck|volcap\.tmp|gsplat\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,12}$/i, '')
	stem = stem.replace(XR_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(XR_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:turntable|webxr_lod|splat_preview|nerf_flythrough|psnr_csv|depth_preview|summary|export|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'xr-scene'
}

/**
 * Extract canonical anchor key linking derived turntable/WebXR LOD exports to verified NeRF, 3DGS, Volumetric, or OpenXR anchors.
 *
 * @param {string} xrStem Extracted XR/NeRF/3DGS stem.
 * @return {string} Canonical anchor key.
 */
export function extractXrSpatialNerfSplatAnchorKey(xrStem) {
	return String(xrStem || 'xr-scene')
		.toLowerCase()
		.replace(/(?:[-_](?:oxr|openxr|usdz|reality|vrm|xrsafety|ipdcal|xrhold|splat|ksplat|spz|nerf|ngp|colmap|vpcc|depthkit|holocap|4dviews|volcap|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'xr-scene'
}

/**
 * Detect XR Spatial Computing, NeRF/3DGS & Volumetric Video toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ xrToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractXrToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let xrToolchain = ''
	if (/\.(?:splat|ksplat|spz)\b|3dgs|gsplat|splatfacto|gaussian_?splat/.test(text)) {
		xrToolchain = '3D Gaussian Splatting (3DGS / Splatfacto)'
	} else if (/\.(?:nerf|ngp|nsconfig)\b|nerfstudio|instant_?ngp|nerfacto/.test(text)) {
		xrToolchain = 'Nerfstudio / Instant-NGP Radiance Field'
	} else if (/\.(?:colmap)\b|colmap/.test(text)) {
		xrToolchain = 'COLMAP Sparse/Dense SfM Reconstruction'
	} else if (/\.(?:vpcc|drc|depthkit|mkv3d|r3dvol|holocap|4dviews|volcap)\b|volcap|volumetric_?video|depthkit|holocap|4dviews|vpcc/.test(text)) {
		xrToolchain = 'Volumetric RGB-D & MPEG V-PCC Capture'
	} else if (/\.(?:usdz|reality|vrm)\b|visionos|realitykit|arkit|reality_?composer/.test(text)) {
		xrToolchain = 'Apple VisionOS / RealityKit / USDZ Spatial'
	} else if (/\.(?:oxr|openxr|xrsafety|ipdcal|guardian|chaperone|spatialanchor|xrhold|stereocal)\b|openxr|webxr|steamvr|monado|hmd_?calib|ipd_?cal/.test(text)) {
		xrToolchain = 'OpenXR / WebXR Runtime & HMD Calibration'
	} else if (XR_SAFETY_HOLD_PATH_RE.test(text)) {
		xrToolchain = 'XR Optics, SAR & Boundary Safety Hold'
	}

	let workflowStage = ''
	if (XR_SAFETY_HOLD_PATH_RE.test(text)) {
		workflowStage = 'XR Spatial Safety, Optics or SAR Quarantine Hold'
	} else if (STRICT_XR_CALIBRATION_EXT_RE.test(basename) || XR_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'OpenXR / USDZ Calibration & Anchor Baseline'
	} else if (XR_SCRATCH_PATH_RE.test(text) || STRICT_XR_SCRATCH_EXT_RE.test(basename) || XR_INTERMEDIATE_PREFIX_RE.test(basename) || XR_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Splat Training, COLMAP & HMD Runtime Scratch'
	} else if (XR_EXPORT_PATH_RE.test(text) || (CONTEXT_XR_EXPORT_EXT_RE.test(basename) && XR_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Turntable Render, WebXR LOD or PSNR Export'
	} else if (STRICT_XR_MASTER_EXT_RE.test(basename) || (CONTEXT_XR_MASTER_EXT_RE.test(basename) && (XR_CONTEXT_HINT_RE.test(text) || CANONICAL_XR_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified NeRF, 3DGS or Volumetric Capture Master'
	}

	return { xrToolchain, workflowStage }
}

/**
 * Extract concise XR Spatial, NeRF/3DGS & Volumetric domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractXrDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (XR_SAFETY_HOLD_PATH_RE.test(text)) {
		return 'XR SAFETY HOLD'
	}
	if (/\.(?:oxr|openxr|xrsafety|ipdcal|guardian|chaperone|spatialanchor|xrhold|stereocal)\b/.test(lowerBase)) {
		return 'OPENXR / CALIB'
	}
	if (/\.(?:usdz|reality|vrm)\b/.test(lowerBase)) {
		return 'USDZ / VISIONOS'
	}
	if (/\.(?:splat|ksplat|spz)\b/.test(lowerBase)) {
		return '3DGS SPLAT MASTER'
	}
	if (/\.(?:nerf|ngp|nsconfig|colmap)\b/.test(lowerBase)) {
		return 'NERF / COLMAP'
	}
	if (/\.(?:vpcc|drc|depthkit|mkv3d|r3dvol|holocap|4dviews|volcap)\b/.test(lowerBase)) {
		return 'VOLUMETRIC CAP'
	}
	if (STRICT_XR_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'XR / SPLAT SCRATCH'
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
 * Classify a single file within the XR Spatial Computing, NeRF/Gaussian Splatting & Volumetric Video domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyXrSpatialNerfSplatFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_XR_EXCLUSION_RE.test(lower)
	const hasXrContext = !hasExcludedContext && XR_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && XR_BASELINE_PATH_RE.test(lower)
	const isSafetyHoldPath = !hasExcludedContext && XR_SAFETY_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_XR_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && XR_SCRATCH_PATH_RE.test(lower)
	const isXrExportPath = !hasExcludedContext && XR_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_XR_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (XR_INTERMEDIATE_PREFIX_RE.test(lowerBase) || XR_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictCalibrationOrSafety = !hasExcludedContext && STRICT_XR_CALIBRATION_EXT_RE.test(lowerBase)
	const isCalibrationOrSafety = !hasExcludedContext && (
		isStrictCalibrationOrSafety
		|| (CONTEXT_XR_CALIBRATION_EXT_RE.test(lowerBase) && !isXrExportPath && (isBaselinePath || isSafetyHoldPath))
	)

	const isContextXrMaster = CONTEXT_XR_MASTER_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasXrContext || isCanonicalVaultPath)
	const isStrictXrMaster = !hasExcludedContext && (
		STRICT_XR_MASTER_EXT_RE.test(lowerBase)
		|| isContextXrMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictXrMaster
		&& !isCalibrationOrSafety
		&& CONTEXT_XR_EXPORT_EXT_RE.test(lowerBase)
		&& (hasXrContext || isXrExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside XR Spatial, NeRF/3DGS & Volumetric Vault'
	let isProtectedSpatialCalibration = false
	let isProtectedNerfSplatMaster = false
	let isProtectedSafetyHold = false
	let isXrMasterAnchor = false
	let isRedundantXrExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictXrMaster || isCalibrationOrSafety))
		|| (isIntermediateSubfile && (isStrictXrMaster || isContextExport || hasXrContext))
		|| (isGenericScratchExt && hasXrContext && !isBaselinePath && !isSafetyHoldPath)
	) {
		family = 'xr-runtime-training-scratch'
		artifactKind = isStrictScratchExt
			? 'NeRF / 3DGS / OpenXR Scratch Artifact'
			: (isIntermediateSubfile ? 'Splat Raster / COLMAP Buffer Cache' : 'HMD Runtime Log & Training Scratch')
		vaultRole = 'Splat Training Cache, COLMAP Feature Spool, or OpenXR Runtime Scratch'
		isMutableFile = true
	} else if (isSafetyHoldPath && (isCalibrationOrSafety || isStrictXrMaster || isContextExport || hasXrContext)) {
		family = 'xr-spatial-calibration-holds'
		artifactKind = 'XR Optics / SAR / Spatial Boundary Hold'
		vaultRole = 'Protected XR Human-Factors, SAR/Optics, or Spatial Safety Quarantine Hold'
		isProtectedSafetyHold = true
		isProtectedSpatialCalibration = true
		isXrMasterAnchor = isStrictXrMaster || isCalibrationOrSafety
		isMutableFile = true
	} else if (isCalibrationOrSafety) {
		family = 'xr-spatial-calibration-holds'
		if (/\.(?:usdz|reality|vrm)$/i.test(lowerBase) || /visionos|realitykit|usdz/.test(lower)) {
			artifactKind = 'VisionOS USDZ / Reality Anchor Baseline'
			vaultRole = 'Canonical USDZ / RealityKit Spatial Anchor & Rig Package'
		} else {
			artifactKind = 'OpenXR / IPD / Guardian Calibration Baseline'
			vaultRole = 'Canonical OpenXR Manifest, Lens Distortion, or Boundary Baseline'
		}
		isProtectedSpatialCalibration = true
		isXrMasterAnchor = true
		isMutableFile = true
	} else if (isStrictXrMaster) {
		family = 'xr-nerf-splat-volumetric-masters'
		if (/\.(?:splat|ksplat|spz|ply)$/i.test(lowerBase)) {
			artifactKind = '3D Gaussian Splatting (3DGS) Point Master'
			vaultRole = 'Immutable Trained 3D Gaussian Splatting Radiance Cloud'
			isMutableFile = false
		} else if (/\.(?:nerf|ngp|nsconfig|ckpt|safetensors|pt|pth)$/i.test(lowerBase)) {
			artifactKind = 'NeRF / Instant-NGP Radiance Checkpoint Master'
			vaultRole = 'Immutable Trained NeRF Radiance Field & Config Master'
			isMutableFile = /\.(?:nsconfig)$/i.test(lowerBase)
		} else if (/\.(?:colmap|las|laz|e57)$/i.test(lowerBase)) {
			artifactKind = 'COLMAP SfM / Dense Point Reconstruction Master'
			vaultRole = 'Canonical Camera Pose, Sparse/Dense SfM & Depth Reconstruction'
			isMutableFile = false
		} else {
			artifactKind = 'Volumetric Video (V-PCC / Depthkit / 4DViews) Master'
			vaultRole = 'Immutable Volumetric RGB-D Stream or MPEG V-PCC Sequence Master'
			isMutableFile = /\.(?:usd|usda)$/i.test(lowerBase)
		}
		isProtectedNerfSplatMaster = true
		isXrMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-xr-preview-exports'
		if (/\.(?:mp4|webm|mov|gif)$/i.test(lowerBase)) {
			artifactKind = 'Derived NeRF / 3DGS Turntable Flythrough Video'
		} else if (/\.(?:glb|gltf)$/i.test(lowerBase)) {
			artifactKind = 'Derived Decimated WebXR GLB/GLTF LOD Export'
		} else if (/\.(?:png|jpg|jpeg|webp|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Derived Depth / Alpha / Novel-View Inspection Render'
		} else {
			artifactKind = 'Derived PSNR / SSIM / LPIPS Training Metrics CSV'
		}
		vaultRole = 'Derived Turntable Video, WebXR LOD Preview, or Metric Export'
		isRedundantXrExport = true
		isMutableFile = true
	}

	const { xrToolchain, workflowStage } = extractXrToolchainAndStage(normalized, basename)
	const xrStem = extractXrSpatialNerfSplatStem(basename, normalized)
	const xrAnchorKey = extractXrSpatialNerfSplatAnchorKey(xrStem)
	const xrTag = extractXrDomainTag(lowerBase, lower)

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
		xrToolchain,
		workflowStage,
		xrStem,
		xrAnchorKey,
		xrTag,
		isProtectedSpatialCalibration,
		isProtectedNerfSplatMaster,
		isProtectedSafetyHold,
		isXrMasterAnchor,
		isRedundantXrExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'xr-runtime-training-scratch') || (isGenericScratchExt && hasXrContext && family === 'xr-runtime-training-scratch'),
		isBaselinePath,
		isSafetyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the XR Spatial Computing, NeRF/3DGS & Volumetric Video domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isXrSpatialNerfSplatGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyXrSpatialNerfSplatFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified NeRF, 3DGS, Volumetric, and OpenXR calibration anchors
 * to derived turntable renders, WebXR GLB LODs, and PSNR/SSIM metric exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildXrSpatialNerfSplatCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyXrSpatialNerfSplatFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isXrMasterAnchor) {
				anchorStems.add(meta.xrStem)
				anchorKeys.add(meta.xrAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous XR Spatial, NeRF/3DGS & Volumetric cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'xr-spatial-calibration-holds')) {
		return 'xr-spatial-calibration-holds'
	}
	if (members.some(m => m.family === 'xr-nerf-splat-volumetric-masters')) {
		return 'xr-nerf-splat-volumetric-masters'
	}
	if (members.some(m => m.family === 'redundant-xr-preview-exports')) {
		return 'redundant-xr-preview-exports'
	}
	return 'xr-runtime-training-scratch'
}

/**
 * Compute deterministic survivor priority score for an XR Spatial, NeRF/3DGS & Volumetric vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-capture-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedSpatialCalibration ? 97000 : 0)
			+ (member.isProtectedNerfSplatMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantXrExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-training-ckpt-first') {
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedSpatialCalibration ? 97000 : 0)
			+ (member.isProtectedNerfSplatMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantXrExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedSafetyHold ? 52000 : 0)
			+ (member.isProtectedSpatialCalibration ? 50000 : 0)
			+ (member.isProtectedNerfSplatMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedSafetyHold ? 100000 : 0)
		+ (member.isProtectedSpatialCalibration ? 97000 : 0)
		+ (member.isProtectedNerfSplatMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantXrExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single XR Spatial Computing, NeRF/Gaussian Splatting & Volumetric Video duplicate cluster.
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
		const meta = classifyXrSpatialNerfSplatFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.xrToolchain)?.xrToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].xrStem || extractXrSpatialNerfSplatStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].xrAnchorKey || extractXrSpatialNerfSplatAnchorKey(primaryStem)

	const hasXrMasterAnchor = Boolean(
		rawMembers.some(m => m.isXrMasterAnchor)
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

		const isRedundantXrExportMember = member.isRedundantXrExport && hasXrMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantXrExport) {
			redundancyReason = isRedundantXrExportMember
				? 'Derived turntable video, WebXR LOD, or PSNR CSV duplicates verified NeRF, 3DGS, or Volumetric master'
				: 'Derived XR preview or LOD export without verified NeRF, 3DGS, or Volumetric master anchor'
		}

		let governanceTier = 'xr-runtime-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedSafetyHold
				? 'xr-safety-hold-protected'
				: (member.isProtectedSpatialCalibration
					? 'xr-spatial-calibration-protected'
					: (member.isProtectedNerfSplatMaster
						? 'xr-nerf-splat-master-protected'
						: (member.isRedundantXrExport
							? 'xr-preview-redundant'
							: 'xr-runtime-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedSafetyHold && config.protectSafetyComplianceHolds) {
			governanceTier = 'xr-safety-hold-protected'
			shielded = true
			protectedReason = 'XR optics, SAR, ergonomic, or spatial boundary safety quarantine hold strictly conserved'
		} else if (member.isProtectedSpatialCalibration && config.protectSpatialCalibrationAndSafetyHolds) {
			governanceTier = 'xr-spatial-calibration-protected'
			shielded = true
			protectedReason = 'OpenXR manifest, USDZ/Reality anchor, IPD profile, or guardian calibration strictly conserved'
		} else if (member.isProtectedNerfSplatMaster && config.protectNerfSplatVolumetricMasters) {
			governanceTier = 'xr-nerf-splat-master-protected'
			shielded = true
			protectedReason = 'Verified 3DGS splat, NeRF checkpoint, COLMAP SfM, or Volumetric video master strictly conserved'
		} else if (isSurvivor && !isRedundantXrExportMember) {
			governanceTier = member.isProtectedSafetyHold
				? 'xr-safety-hold-protected'
				: (member.isProtectedSpatialCalibration
					? 'xr-spatial-calibration-protected'
					: (member.isProtectedNerfSplatMaster
						? 'xr-nerf-splat-master-protected'
						: (member.isRedundantXrExport
							? 'xr-preview-redundant'
							: 'xr-runtime-scratch')))
			shielded = true
			protectedReason = 'Canonical XR Spatial, NeRF/3DGS & Volumetric vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantXrExport
				? 'xr-preview-redundant'
				: (member.isProtectedSpatialCalibration
					? 'xr-spatial-calibration-protected'
					: 'xr-runtime-scratch')
			action = config.strategy === 'hardlink-immutable-xr-masters' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentRunDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentRunDays
		) {
			governanceTier = 'xr-runtime-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active splat training, COLMAP, or HMD runtime grace window`
		} else if (member.isRedundantXrExport) {
			governanceTier = 'xr-preview-redundant'
			if (config.requireXrMasterAnchorForPrune && !hasXrMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified NeRF, 3DGS, Volumetric, or OpenXR master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'xr-runtime-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'NeRF/3DGS training cache, COLMAP feature spool, or OpenXR runtime scratch eligible for cleanup'
		} else if (member.isProtectedNerfSplatMaster || member.isProtectedSpatialCalibration) {
			governanceTier = member.isProtectedSpatialCalibration ? 'xr-spatial-calibration-protected' : 'xr-nerf-splat-master-protected'
			action = config.strategy === 'hardlink-immutable-xr-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-xr-masters' && !member.isMutableFile) {
			governanceTier = 'xr-nerf-splat-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'xr-runtime-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantXrExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantXrExport = members.some(m => m.isRedundantXrExportMember || m.isRedundantXrExport)
	const hasProtectedSafetyHold = members.some(m => m.governanceTier === 'xr-safety-hold-protected' && m.shielded)
	const hasProtectedSpatialCalibration = members.some(m => m.governanceTier === 'xr-spatial-calibration-protected' && m.shielded)
	const hasProtectedNerfSplatMaster = members.some(m => m.governanceTier === 'xr-nerf-splat-master-protected' && m.shielded)
	const hasXrRuntimeScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantXrExportMember && !m.shielded)) {
			clusterVerdict = 'xr-preview-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'xr-runtime-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedSafetyHold) {
		clusterVerdict = 'xr-safety-hold-protected'
	} else if (hasProtectedSpatialCalibration) {
		clusterVerdict = 'xr-spatial-calibration-protected'
	} else if (hasProtectedNerfSplatMaster) {
		clusterVerdict = 'xr-nerf-splat-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantXrExport ? 95 : 85
	} else if (hasProtectedSafetyHold) {
		priorityScore = 60
	} else if (hasProtectedSpatialCalibration) {
		priorityScore = 50
	}

	const xrTags = [...new Set(members.map(m => m.xrTag).filter(Boolean))]
	const familyMeta = XR_SPATIAL_NERF_SPLAT_FAMILY_META[family] || XR_SPATIAL_NERF_SPLAT_FAMILY_META['xr-runtime-training-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		xrToolchain: primaryToolchain,
		workflowStage: primaryStage,
		xrStem: primaryStem,
		xrAnchorKey: primaryAnchorKey,
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
		hasProtectedSpatialCalibration,
		hasProtectedNerfSplatMaster,
		hasProtectedSafetyHold,
		hasRedundantXrExport,
		hasXrRuntimeScratch,
		hasXrMasterAnchor,
		xrTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as an XR Spatial Computing, NeRF/Gaussian Splatting & Volumetric Video Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive XR Spatial, NeRF/3DGS & Volumetric vault audit report.
 */
export function auditXrSpatialNerfSplatVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeXrSpatialNerfSplatConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isXrSpatialNerfSplatGroup)
	const correlationIndex = buildXrSpatialNerfSplatCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'xr-spatial-calibration-holds': 0,
		'xr-nerf-splat-volumetric-masters': 0,
		'redundant-xr-preview-exports': 0,
		'xr-runtime-training-scratch': 0,
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
				cluster.xrToolchain,
				cluster.workflowStage,
				cluster.xrStem,
				cluster.xrAnchorKey,
				cluster.familyLabel,
				...cluster.xrTags,
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
	let totalNerfSplatMasterClusters = 0
	let totalSafetyHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedSpatialCalibration) {
			totalCalibrationClusters += 1
		}
		if (cluster.hasProtectedNerfSplatMaster) {
			totalNerfSplatMasterClusters += 1
		}
		if (cluster.hasProtectedSafetyHold) {
			totalSafetyHoldClusters += 1
		}
		if (cluster.hasRedundantXrExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasXrRuntimeScratch) {
			totalScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = XR_SPATIAL_NERF_SPLAT_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: XR_SPATIAL_NERF_SPLAT_FAMILY_META[id].label,
			shortLabel: XR_SPATIAL_NERF_SPLAT_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: XR_SPATIAL_NERF_SPLAT_VAULT_SCHEMA,
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
			totalNerfSplatMasterClusters,
			totalSafetyHoldClusters,
			totalRedundantExportClusters,
			totalScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for XR Spatial, NeRF/3DGS & Volumetric Video Vaults.
 * Strictly blocks deletion or hardlinking of shielded XR Safety Holds, OpenXR/USDZ calibration baselines,
 * and verified NeRF/3DGS/Volumetric masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditXrSpatialNerfSplatVault.
 * @return {string} POSIX bash script.
 */
export function buildXrSpatialNerfSplatRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# XR Spatial Computing, NeRF/Gaussian Splatting & Volumetric Video Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./xr-spatial-nerf-splat-vault-reclaim.sh only after verifying OpenXR, NeRF/3DGS, and Volumetric anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.xr-spatial-nerf-splat-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-previews-and-xr-scratch'
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
			} else if (strategy === 'quarantine-previews-and-xr-scratch' && (target.isRedundantXrExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable XR previews or splat/runtime scratch under active OpenXR, NeRF/3DGS & Safety shields.\\n"')
	} else {
		lines.push(`printf "Completed XR Spatial, NeRF/3DGS & Volumetric Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditXrSpatialNerfSplatVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildXrSpatialNerfSplatCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'xr_toolchain',
		'workflow_stage',
		'xr_stem',
		'xr_anchor_key',
		'family',
		'cluster_verdict',
		'has_xr_master_anchor',
		'is_redundant_xr_export',
		'is_xr_runtime_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'xr_tag',
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
				cluster.xrToolchain || '',
				cluster.workflowStage || '',
				cluster.xrStem,
				cluster.xrAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasXrMasterAnchor ? 'true' : 'false',
				member.isRedundantXrExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.xrTag || '',
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
 * @param {object} auditResult Result from auditXrSpatialNerfSplatVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildXrSpatialNerfSplatJsonManifest(auditResult) {
	const payload = {
		schema: XR_SPATIAL_NERF_SPLAT_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || XR_SPATIAL_NERF_SPLAT_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			xrToolchain: cluster.xrToolchain,
			workflowStage: cluster.workflowStage,
			xrStem: cluster.xrStem,
			xrAnchorKey: cluster.xrAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedSpatialCalibration: cluster.hasProtectedSpatialCalibration,
			hasProtectedNerfSplatMaster: cluster.hasProtectedNerfSplatMaster,
			hasProtectedSafetyHold: cluster.hasProtectedSafetyHold,
			hasRedundantXrExport: cluster.hasRedundantXrExport,
			hasXrRuntimeScratch: cluster.hasXrRuntimeScratch,
			hasXrMasterAnchor: cluster.hasXrMasterAnchor,
			xrTags: cluster.xrTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				xrTag: member.xrTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantXrExportMember: member.isRedundantXrExportMember,
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
 * cloud sync of NeRF/3DGS training caches, COLMAP feature spools, and OpenXR runtime logs.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildXrSpatialNerfSplatSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for XR Spatial Computing, NeRF/3DGS & Volumetric Video Vaults',
		'nerfstudio_cache/',
		'gsplat_raster_tmp/',
		'colmap_feature_cache/',
		'openxr_runtime_logs/',
		'steamvr_frame_dumps/',
		'volcap_rgbd_spool/',
		'usdz_compile_tmp/',
		'webxr_shader_cache/',
		'reality_composer_tmp/',
		'gaussian_mcmc_buf/',
		'depthkit_mux_tmp/',
		'xr_hmd_telemetry_tmp/',
		'tmp_xr_*',
		'tmp_nerf_*',
		'tmp_splat_*',
		'tmp_gsplat_*',
		'tmp_colmap_*',
		'tmp_volcap_*',
		'tmp_openxr_*',
		'tmp_usdz_*',
		'cache_splat_*',
		'spool_volcap_*',
		'*.splat.tmp',
		'*.nerf.tmp',
		'*.ngp.bak',
		'*.colmap.idx',
		'*.vpcc.part',
		'*.usdz.tmp',
		'*.oxr.lck',
		'*.volcap.tmp',
		'*.gsplat.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
