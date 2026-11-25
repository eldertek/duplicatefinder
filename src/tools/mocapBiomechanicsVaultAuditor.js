/**
 * Pure Motion Capture, Biomechanics & Optical Tracking Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Mocap & Biomechanics Vault families:
 * - Calibrations, Rigs & Ethics Holds (.xcp, .mcal, .vsk, .vst, .vss, .mcp, .osim, wand_cal/forceplate_cal/marker_set manifests, IRB/clinical-gait/NDA holds)
 * - Raw Mocap, C3D & Force-Plate (.c3d, .x2d, .x1d, .enf, .vbo, .tak, .qtm, .mvn, .mvnx, .trc, .mot, .sto, .anc, .emg, .delsys, .noraxon)
 * - Redundant Retargets & Previews (.fbx, .bvh, .htr, .asf, .amc, .usd, .usda, .usdz, .gltf, .glb, reference .mp4/.mov/.avi, joint-angle .csv/.xlsx exports when verified Raw Mocap/C3D anchor exists)
 * - Solver & Retake Scratch (vicon_tmp/, nexus_cache/, shogun_tmp/, motive_cache/, motive_tmp/, qtm_tmp/, qualisys_cache/, xsens_cache/, opensim_tmp/, retarget_cache/, solve_scratch/, take_tmp/, c3d_tmp/, .c3d.tmp, .x2d.tmp, .tak.tmp, .qtm.tmp, .mvn.tmp, .fbx.tmp, .lck)
 *
 * Enforces strict IRB/Clinical-Gait Hold, Wand/Rig Calibration, and Raw Mocap/C3D conservation defaults:
 * - Strictly conserves IRB, clinical-gait, Olympic athlete, and NDA studio archival holds
 * - Strictly conserves optical wand/camera calibrations (.xcp, .mcal), Vicon skeleton templates (.vsk/.vst/.vss), OpenSim models (.osim), and force-plate calibration matrices
 * - Strictly conserves verified raw C3D, Vicon X2D/X1D, OptiTrack TAK, Qualisys QTM, Xsens MVN/MVNX, OpenSim TRC/MOT/STO, and EMG/force-plate masters
 * - Detects redundant retargeted FBX/BVH/USD/GLB exports, reference videos, and joint-angle CSV exports when a verified raw master anchor exists
 * - Blocks pruning of retarget/preview exports lacking a verified Raw Mocap/C3D anchor when guard is active
 * - Blocks hardlinks on mutable calibration/JSON/CSV/rig/scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const MOCAP_BIOMECHANICS_VAULT_SCHEMA = 'duplicatefinder.mocap-biomechanics-vault-auditor.v1'

export const MOCAP_BIOMECHANICS_FAMILIES = Object.freeze([
	'all',
	'calibration-rigs-ethics-holds',
	'raw-mocap-telemetry-masters',
	'redundant-retargeted-fbx-previews',
	'mocap-solver-retake-scratch',
])

export const MOCAP_BIOMECHANICS_FAMILY_META = Object.freeze({
	'calibration-rigs-ethics-holds': {
		id: 'calibration-rigs-ethics-holds',
		label: 'Calibrations, Rigs & Holds',
		shortLabel: 'Wand Calibrations, Skeletal Rigs, Force-Plate Matrices & IRB/Gait Holds (.xcp, .mcal, .vsk, .vss, .osim, IRB/NDA)',
	},
	'raw-mocap-telemetry-masters': {
		id: 'raw-mocap-telemetry-masters',
		label: 'Raw Mocap, C3D & EMG',
		shortLabel: 'Verified Optical, Inertial & Biomechanics Masters (.c3d, .x2d, .tak, .qtm, .mvn, .mvnx, .trc, .mot, .anc, .emg)',
	},
	'redundant-retargeted-fbx-previews': {
		id: 'redundant-retargeted-fbx-previews',
		label: 'Redundant Retargets & Previews',
		shortLabel: 'Retargeted .fbx/.bvh/.usd/.glb, Reference .mp4/.mov & Joint-Angle .csv Exports (when Master Anchor Exists)',
	},
	'mocap-solver-retake-scratch': {
		id: 'mocap-solver-retake-scratch',
		label: 'Solver & Retake Scratch',
		shortLabel: 'Solver & Gap-Fill Scratch (vicon_tmp/, nexus_cache/, motive_cache/, qtm_tmp/, xsens_cache/, solve_scratch/, .c3d.tmp)',
	},
})

export const MOCAP_BIOMECHANICS_STRATEGIES = Object.freeze([
	'prune-retargets-and-solver-scratch',
	'hardlink-immutable-c3d-x2d-and-tak',
	'quarantine-retargets-and-solver-scratch',
])

export const MOCAP_BIOMECHANICS_SURVIVOR_RULES = Object.freeze([
	'cal-raw-mocap-master-first',
	'oldest-session-first',
	'newest-solve-first',
	'shortest-path',
])

export const MOCAP_BIOMECHANICS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'cal-rig-std-protected',
	'raw-mocap-master-protected',
	'ethics-hold-protected',
	'mocap-retarget-redundant',
	'solver-scratch-intermediate',
	'shielded',
])

export const MOCAP_BIOMECHANICS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const MOCAP_BIOMECHANICS_PRESETS = Object.freeze([
	{
		id: 'all-mocap-biomechanics-audit',
		name: 'All Mocap & Biomechanics Vaults',
		description: 'Audit wand/rig calibrations, IRB/clinical-gait holds, raw C3D/X2D/TAK/QTM/MVN masters, redundant retargeted FBX/BVH exports, and Vicon/Motive scratch.',
		familyFilter: 'all',
		strategy: 'prune-retargets-and-solver-scratch',
		survivorRule: 'cal-raw-mocap-master-first',
		protectCalibrationsAndRigs: true,
		protectRawMocapMasters: true,
		protectEthicsArchiveHolds: true,
		requireMocapAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'mocap-solver-scratch-cleanup',
		name: 'Vicon, Motive & Solver Scratch',
		description: 'Reclaim vicon_tmp/, nexus_cache/, motive_cache/, qtm_tmp/, xsens_cache/, solve_scratch/, and .c3d.tmp/.x2d.tmp scratch older than the active capture grace window.',
		familyFilter: 'all',
		strategy: 'prune-retargets-and-solver-scratch',
		survivorRule: 'cal-raw-mocap-master-first',
		protectCalibrationsAndRigs: true,
		protectRawMocapMasters: true,
		protectEthicsArchiveHolds: true,
		requireMocapAnchorForPrune: true,
		keepRecentSessionDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-retargets-vs-raw-mocap',
		name: 'Redundant FBX/BVH vs Raw Masters',
		description: 'Detect retargeted FBX, BVH, HTR, USD, GLB skeletons, reference MP4s, and joint-angle CSV exports backed by a verified raw C3D/X2D/TAK/QTM/MVN master anchor.',
		familyFilter: 'redundant-retargeted-fbx-previews',
		strategy: 'quarantine-retargets-and-solver-scratch',
		survivorRule: 'cal-raw-mocap-master-first',
		protectCalibrationsAndRigs: true,
		protectRawMocapMasters: true,
		protectEthicsArchiveHolds: true,
		requireMocapAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'calibration-rigs-ethics-shield',
		name: 'Wand Cal, Rigs & IRB Hold Shield',
		description: 'Inspect wand/volume calibrations (.xcp, .mcal), VSK/VSS/OSIM skeletal rigs, force-plate matrices, and IRB/clinical-gait holds under strict shield.',
		familyFilter: 'calibration-rigs-ethics-holds',
		strategy: 'hardlink-immutable-c3d-x2d-and-tak',
		survivorRule: 'cal-raw-mocap-master-first',
		protectCalibrationsAndRigs: true,
		protectRawMocapMasters: true,
		protectEthicsArchiveHolds: true,
		requireMocapAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-c3d-x2d-tak-mvn-masters',
		name: 'Raw C3D, X2D, TAK, QTM & MVN',
		description: 'Audit verified raw C3D, Vicon X2D/X1D, OptiTrack TAK, Qualisys QTM, Xsens MVN/MVNX, OpenSim TRC/MOT, and EMG/force-plate masters.',
		familyFilter: 'raw-mocap-telemetry-masters',
		strategy: 'hardlink-immutable-c3d-x2d-and-tak',
		survivorRule: 'cal-raw-mocap-master-first',
		protectCalibrationsAndRigs: true,
		protectRawMocapMasters: true,
		protectEthicsArchiveHolds: true,
		requireMocapAnchorForPrune: true,
		keepRecentSessionDays: 0,
		minSizeKb: 0,
	},
])

export const MOCAP_BIOMECHANICS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-mocap-biomechanics-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-retargets-and-solver-scratch',
	survivorRule: 'cal-raw-mocap-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCalibrationsAndRigs: true,
	protectRawMocapMasters: true,
	protectEthicsArchiveHolds: true,
	requireMocapAnchorForPrune: true,
	keepRecentSessionDays: 0,
	minSizeKb: 0,
})

const STRICT_MOCAP_CAL_EXT_RE = /\.(?:xcp|mcal|vsk|vst|vss|mcp|osim|mp|marker)$/i
const STRICT_MOCAP_CAL_BASENAME_RE = /^(?:wand_calibration|volume_calibration|camera_calibration|forceplate_cal|force_plate_matrix|marker_set|markers_template|rig_definition|subject_anthropometry|opensim_setup)\.(?:csv|txt|xml|json|yaml|yml|cfg)$/i
const STRICT_MOCAP_MASTER_EXT_RE = /\.(?:c3d|x2d|x1d|enf|vbo|tak|qtm|mvn|mvnx|trc|mot|sto|anc|emg|delsys|noraxon)$/i
const CONTEXT_MOCAP_DOC_EXT_RE = /\.(?:xml|json|yaml|yml|pdf|txt|csv|log|ini|cfg)$/i
const CONTEXT_MOCAP_RETARGET_EXT_RE = /\.(?:fbx|bvh|htr|asf|amc|usd|usda|usdz|gltf|glb|mp4|mov|avi|png|jpg|jpeg|webp|csv|tsv|xlsx|pdf)$/i
const STRICT_MOCAP_SCRATCH_EXT_RE = /\.(?:c3d\.tmp|x2d\.tmp|x1d\.tmp|tak\.tmp|qtm\.tmp|mvn\.tmp|mvnx\.tmp|fbx\.tmp|bvh\.tmp|trc\.tmp|lck|swp)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|inf)$/i

const MOCAP_CONTEXT_HINT_RE = /(?:mocap|motion_?capture|biomech|vicon|nexus|shogun|optitrack|motive|qualisys|qtm|xsens|mvn|opensim|c3d|force_?plate|emg|delsys|noraxon|bertec|kistler|amti|gait_?lab|kinematics|kinetics|marker_?set|retarget|optical_?track|imu_?suit)/i
const MOCAP_CAL_NAME_RE = /(?:^|[/_-])(?:wand_?cal(?:ib)?|volume_?cal(?:ib)?|force_?plate_?cal|forceplate_?matrix|marker_?set|subject_?rig|skeleton_?template|anthropometr|lens_?cal|sync_?genlock|t_?pose_?cal)(?:[/_.-]|$)/i
const MOCAP_CAL_PATH_RE = /(?:00_calibration|00_rigs|00_markers|00_osim|wand_calibration|camera_cal|forceplate_cal|subject_rigs|skeletal_templates)/i
const ETHICS_ARCHIVE_HOLD_PATH_RE = /(?:irb_?hold|ethics_?hold|clinical_?gait_?hold|gait_?lab_?hold|nda_?hold|mocap_?hold|olympic_?hold|biomech_?hold|hipaa_?hold|gdpr_?subject_?hold|archive_?hold)/i
const MOCAP_SCRATCH_PATH_RE = /(?:vicon_tmp|nexus_cache|nexus_tmp|shogun_tmp|shogun_cache|motive_cache|motive_tmp|qtm_tmp|qualisys_cache|xsens_cache|xsens_tmp|opensim_tmp|retarget_cache|solve_scratch|take_tmp|c3d_tmp|gapfill_tmp|labeling_scratch|ik_scratch)/i
const MOCAP_INTERMEDIATE_PREFIX_RE = /^(?:tmp_vicon_|tmp_motive_|tmp_qtm_|tmp_xsens_|tmp_opensim_|tmp_c3d_|solve_chunk_|take_staging_|spill_)/i
const MOCAP_INTERMEDIATE_SUFFIX_RE = /(?:_solve_tmp|_retarget_tmp|_gapfill_tmp|_ik_tmp|_c3d_tmp|_staging)$/i
const MOCAP_RETARGET_PATH_RE = /(?:_retarget|_fbx_export|_bvh_export|_preview_rig|_quicklook|_stick_figure|_joint_angles|_kinematics_csv|_turntable|_ref_video|_preview|_thumb|retargeted_exports|fbx_exports|bvh_exports|preview_renders|reference_videos)/i
const CANONICAL_VAULT_PATH_RE = /(?:00_golden|00_master|00_raw|00_mocap|00_c3d|00_vicon|00_optitrack|00_biomechanics|canonical|mocap_vault|biomechanics_vault|c3d_archive|capture_vault)/i

/**
 * Normalize configuration values for Motion Capture & Biomechanics Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeMocapBiomechanicsConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = MOCAP_BIOMECHANICS_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.familyFilter
	const verdictFilter = MOCAP_BIOMECHANICS_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.verdictFilter
	const strategy = MOCAP_BIOMECHANICS_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.strategy
	const survivorRule = MOCAP_BIOMECHANICS_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.survivorRule
	const sortMode = MOCAP_BIOMECHANICS_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentSessionDays)
	const keepRecentSessionDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: MOCAP_BIOMECHANICS_DEFAULT_CONFIG.keepRecentSessionDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : MOCAP_BIOMECHANICS_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCalibrationsAndRigs: cfg.protectCalibrationsAndRigs !== undefined ? Boolean(cfg.protectCalibrationsAndRigs) : true,
		protectRawMocapMasters: cfg.protectRawMocapMasters !== undefined ? Boolean(cfg.protectRawMocapMasters) : true,
		protectEthicsArchiveHolds: cfg.protectEthicsArchiveHolds !== undefined ? Boolean(cfg.protectEthicsArchiveHolds) : true,
		requireMocapAnchorForPrune: cfg.requireMocapAnchorForPrune !== undefined ? Boolean(cfg.requireMocapAnchorForPrune) : true,
		keepRecentSessionDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized capture take or subject trial stem by stripping extensions and suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized capture take stem.
 */
export function extractMocapBiomechanicsStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:c3d\.tmp|x2d\.tmp|x1d\.tmp|tak\.tmp|qtm\.tmp|mvn\.tmp|mvnx\.tmp|fbx\.tmp|bvh\.tmp|trc\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(MOCAP_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(MOCAP_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:_retarget(?:ed)?|_fbx_export|_bvh_export|_preview_rig|_quicklook|_stick_figure|_joint_angles|_kinematics|_turntable|_ref_video|_preview|_thumbnail|_export|_csv|_copy|_bak|_draft|_v\d+|_rev\d+)$/i, '')
	return stem || 'mocap-take'
}

/**
 * Extract canonical anchor key linking derived retargets/previews to raw Mocap/C3D masters.
 *
 * @param {string} takeStem Extracted capture take stem.
 * @return {string} Canonical anchor key.
 */
export function extractMocapBiomechanicsAnchorKey(takeStem) {
	return String(takeStem || 'mocap-take')
		.toLowerCase()
		.replace(/(?:_solved|_labeled|_filtered|_ik|_id|_fk|_fbx|_bvh|_htr|_usd|_glb|_c3d|_x2d|_tak|_qtm|_mvn|_trc|_mot|_report|_summary|_export)$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'mocap-take'
}

/**
 * Detect Motion Capture & Biomechanics toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ mocapToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractMocapToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let mocapToolchain = ''
	if (/\.(?:x2d|x1d|xcp|vsk|vst|vss|enf|vbo)\b|vicon|nexus|shogun/.test(text)) {
		mocapToolchain = 'Vicon Nexus / Shogun'
	} else if (/\.(?:tak|mcal)\b|optitrack|motive/.test(text)) {
		mocapToolchain = 'OptiTrack Motive'
	} else if (/\.qtm\b|qualisys/.test(text)) {
		mocapToolchain = 'Qualisys QTM'
	} else if (/\.(?:mvn|mvnx)\b|xsens/.test(text)) {
		mocapToolchain = 'Xsens MVN Inertial'
	} else if (/\.(?:osim|trc|mot|sto)\b|opensim/.test(text)) {
		mocapToolchain = 'OpenSim Biomechanics'
	} else if (/\.(?:anc|emg|delsys|noraxon)\b|force_?plate|bertec|kistler|amti|delsys|noraxon/.test(text)) {
		mocapToolchain = 'Force-Plate & EMG Telemetry'
	} else if (/\.c3d\b/.test(text)) {
		mocapToolchain = 'C3D Biomechanics Standard'
	} else if (/\.(?:fbx|bvh|htr|asf|amc|usd|usda|usdz|gltf|glb)\b|retarget/.test(text)) {
		mocapToolchain = 'Skeletal Retarget Pipeline'
	}

	let workflowStage = ''
	if (ETHICS_ARCHIVE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'IRB / Clinical / NDA Hold'
	} else if (MOCAP_CAL_NAME_RE.test(text) || STRICT_MOCAP_CAL_EXT_RE.test(basename) || STRICT_MOCAP_CAL_BASENAME_RE.test(basename) || MOCAP_CAL_PATH_RE.test(text)) {
		workflowStage = 'Wand Cal / Rig / Force-Plate Matrix'
	} else if (STRICT_MOCAP_MASTER_EXT_RE.test(basename)) {
		workflowStage = 'Raw Capture / C3D / EMG Master'
	} else if (MOCAP_SCRATCH_PATH_RE.test(text) || STRICT_MOCAP_SCRATCH_EXT_RE.test(basename) || MOCAP_INTERMEDIATE_PREFIX_RE.test(basename) || MOCAP_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Solver / Gap-Fill Scratch'
	} else if (CONTEXT_MOCAP_RETARGET_EXT_RE.test(basename) || MOCAP_RETARGET_PATH_RE.test(text)) {
		workflowStage = 'Retargeted Skeleton / Preview'
	}

	return { mocapToolchain, workflowStage }
}

/**
 * Extract concise Motion Capture & Biomechanics domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractMocapDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (ETHICS_ARCHIVE_HOLD_PATH_RE.test(text)) {
		return 'ETHICS / IRB HOLD'
	}
	if (/\.(?:xcp|mcal)\b/.test(text) || /wand_?cal|volume_?cal|force_?plate_?cal/.test(text)) {
		return 'WAND / FORCE CAL'
	}
	if (/\.(?:vsk|vst|vss|mcp|osim)\b/.test(text)) {
		return 'SKELETAL RIG'
	}
	if (/\.c3d\b/.test(text)) {
		return 'C3D MASTER'
	}
	if (/\.(?:x2d|x1d|enf|vbo)\b/.test(text)) {
		return 'VICON RAW'
	}
	if (/\.tak\b/.test(text)) {
		return 'MOTIVE TAK'
	}
	if (/\.qtm\b/.test(text)) {
		return 'QUALISYS QTM'
	}
	if (/\.(?:mvn|mvnx)\b/.test(text)) {
		return 'XSENS MVN'
	}
	if (/\.(?:trc|mot|sto)\b/.test(text)) {
		return 'OPENSIM KINEMATICS'
	}
	if (/\.(?:anc|emg|delsys|noraxon)\b/.test(text)) {
		return 'FORCE-PLATE / EMG'
	}
	if (/\.(?:fbx|bvh|htr|asf|amc)\b/.test(text)) {
		return 'RETARGET EXPORT'
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
 * Classify a single file within the Motion Capture, Biomechanics & Optical Tracking domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyMocapBiomechanicsFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasMocapContext = MOCAP_CONTEXT_HINT_RE.test(lower)
	const isCalibrationName = MOCAP_CAL_NAME_RE.test(lower)
	const isScratchPath = MOCAP_SCRATCH_PATH_RE.test(lower)
	const isStrictScratchExt = STRICT_MOCAP_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = MOCAP_INTERMEDIATE_PREFIX_RE.test(lowerBase) || MOCAP_INTERMEDIATE_SUFFIX_RE.test(lowerBase)
	const isMocapCalPath = MOCAP_CAL_PATH_RE.test(lower)
	const isEthicsHoldPath = ETHICS_ARCHIVE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = CANONICAL_VAULT_PATH_RE.test(lower)
	const isMocapRetargetPath = MOCAP_RETARGET_PATH_RE.test(lower)

	const isStrictCalExt = STRICT_MOCAP_CAL_EXT_RE.test(lowerBase) && (
		hasMocapContext
		|| isMocapCalPath
		|| isEthicsHoldPath
		|| isCalibrationName
		|| /\.(?:xcp|mcal|vsk|vst|vss|osim)$/i.test(lowerBase)
	)
	const isStrictCalBasename = STRICT_MOCAP_CAL_BASENAME_RE.test(lowerBase) && (
		hasMocapContext
		|| isMocapCalPath
		|| isEthicsHoldPath
		|| /^(?:wand_calibration|forceplate_cal|force_plate_matrix|opensim_setup)\./i.test(lowerBase)
	)
	const isStrictMocapMasterExt = STRICT_MOCAP_MASTER_EXT_RE.test(lowerBase)
	const isContextMocapDoc = CONTEXT_MOCAP_DOC_EXT_RE.test(lowerBase) && (isMocapCalPath || isEthicsHoldPath)
	const isContextMocapRetarget = CONTEXT_MOCAP_RETARGET_EXT_RE.test(lowerBase) && !isStrictMocapMasterExt && (hasMocapContext || isMocapRetargetPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Mocap & Biomechanics Vault'
	let isProtectedCalibrationRigBaseline = false
	let isProtectedRawMocapMaster = false
	let isProtectedEthicsArchiveHold = false
	let isMocapMasterAnchor = false
	let isRedundantMocapRetarget = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextMocapRetarget || isStrictMocapMasterExt || isStrictCalExt))
		|| (isIntermediateSubfile && (isStrictMocapMasterExt || isContextMocapRetarget || hasMocapContext))
		|| (isGenericScratchExt && hasMocapContext)
	) {
		family = 'mocap-solver-retake-scratch'
		artifactKind = isStrictScratchExt
			? 'Mocap Solver / Capture Scratch File'
			: (isIntermediateSubfile ? 'Gap-Fill / IK Solver Intermediate' : 'Vicon / Motive / Qualisys Scratch')
		vaultRole = 'Vicon / Motive / QTM / Xsens / OpenSim Scratch'
		isMutableFile = true
	} else if (isEthicsHoldPath && (isStrictCalExt || isStrictCalBasename || isStrictMocapMasterExt || isContextMocapDoc || hasMocapContext)) {
		family = 'calibration-rigs-ethics-holds'
		artifactKind = 'IRB / Clinical-Gait / NDA Capture Hold'
		vaultRole = 'Protected Clinical & Studio Performance Hold'
		isProtectedEthicsArchiveHold = true
		isProtectedCalibrationRigBaseline = true
		isMocapMasterAnchor = isStrictCalExt || isStrictMocapMasterExt
		isMutableFile = /\.(?:xml|json|yaml|yml|txt|csv|log|ini|cfg|xcp|mcal|vsk|vst|vss|osim)$/i.test(lowerBase) || isStrictCalBasename
	} else if (
		isStrictCalExt
		|| isStrictCalBasename
		|| (isCalibrationName && (isStrictMocapMasterExt || isContextMocapDoc || hasMocapContext))
		|| (isMocapCalPath && (isContextMocapDoc || isStrictMocapMasterExt))
	) {
		family = 'calibration-rigs-ethics-holds'
		if (/\.(?:xcp|mcal)$/i.test(lowerBase) || /wand_?cal|volume_?cal|lens_?cal/.test(lower)) {
			artifactKind = 'Optical Camera Wand & Volume Calibration'
			vaultRole = 'Capture Volume Extrinsic/Intrinsic Baseline'
		} else if (/\.(?:vsk|vst|vss|mcp|osim)$/i.test(lowerBase) || /subject_?rig|skeleton_?template|anthropometr/.test(lower)) {
			artifactKind = 'Skeletal Rig / OpenSim Biomechanical Model'
			vaultRole = 'Marker-Set & Kinematics Model Baseline'
		} else {
			artifactKind = 'Force-Plate Matrix & Marker Calibration'
			vaultRole = 'Synchronized Rig & Sensor Alignment Baseline'
		}
		isProtectedCalibrationRigBaseline = true
		isMocapMasterAnchor = isStrictCalExt || isStrictMocapMasterExt
		isMutableFile = /\.(?:xcp|mcal|vsk|vst|vss|mcp|osim|xml|json|yaml|yml|txt|csv|log|ini|cfg)$/i.test(lowerBase) || isStrictCalBasename
	} else if (isStrictMocapMasterExt) {
		family = 'raw-mocap-telemetry-masters'
		if (/\.c3d$/i.test(lowerBase)) {
			artifactKind = 'C3D 3D Marker & Analog Biomechanics Master'
			vaultRole = 'Standard Binary Trajectory & Force Master'
		} else if (/\.(?:x2d|x1d|enf|vbo)$/i.test(lowerBase)) {
			artifactKind = 'Vicon Raw Camera 2D / Trial Master'
			vaultRole = 'Unreconstructed Optical Centroid Master'
		} else if (/\.tak$/i.test(lowerBase)) {
			artifactKind = 'OptiTrack Motive Take Master'
			vaultRole = 'Calibrated Optical Capture Take Master'
		} else if (/\.qtm$/i.test(lowerBase)) {
			artifactKind = 'Qualisys QTM Capture Master'
			vaultRole = 'Multi-Camera & Analog Measurement Master'
		} else if (/\.(?:mvn|mvnx)$/i.test(lowerBase)) {
			artifactKind = 'Xsens MVN Inertial Capture Master'
			vaultRole = 'Full-Body IMU Quaternion Master'
		} else if (/\.(?:trc|mot|sto)$/i.test(lowerBase)) {
			artifactKind = 'OpenSim Trajectory / Inverse Kinematics Master'
			vaultRole = 'Musculoskeletal Simulation Master'
		} else {
			artifactKind = 'Force-Plate & EMG Analog Telemetry Master'
			vaultRole = 'Synchronized Kinetic & Myoelectric Master'
		}
		isProtectedRawMocapMaster = true
		isMocapMasterAnchor = true
		isMutableFile = /\.(?:enf|mvnx|trc|mot|sto|anc)$/i.test(lowerBase)
	} else if (isContextMocapDoc) {
		family = 'calibration-rigs-ethics-holds'
		artifactKind = 'Capture Session & Sensor Provenance Manifest'
		vaultRole = 'Frame-Rate, Genlock & Subject Calibration Log'
		isProtectedCalibrationRigBaseline = true
		isMutableFile = true
	} else if (isContextMocapRetarget) {
		family = 'redundant-retargeted-fbx-previews'
		if (/\.(?:fbx|bvh|htr|asf|amc)$/i.test(lowerBase)) {
			artifactKind = 'Retargeted Skeletal FBX / BVH Export'
		} else if (/\.(?:usd|usda|usdz|gltf|glb)$/i.test(lowerBase)) {
			artifactKind = 'USD / glTF Animation Preview Export'
		} else if (/\.(?:mp4|mov|avi)$/i.test(lowerBase)) {
			artifactKind = 'Reference Witness Camera / Viewport Video'
		} else if (/\.(?:csv|tsv|xlsx|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Joint-Angle CSV / Gait Summary Export'
		} else {
			artifactKind = 'Stick-Figure / Trajectory Quicklook Image'
		}
		vaultRole = 'Derived Retargeted Skeleton or Preview Export'
		isRedundantMocapRetarget = true
		isMutableFile = true
	}

	const { mocapToolchain, workflowStage } = extractMocapToolchainAndStage(normalized, basename)
	const takeStem = extractMocapBiomechanicsStem(basename, normalized)
	const mocapAnchorKey = extractMocapBiomechanicsAnchorKey(takeStem)
	const mocapTag = extractMocapDomainTag(lowerBase, lower)

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
		mocapToolchain,
		workflowStage,
		takeStem,
		mocapAnchorKey,
		mocapTag,
		isProtectedCalibrationRigBaseline,
		isProtectedRawMocapMaster,
		isProtectedEthicsArchiveHold,
		isMocapMasterAnchor,
		isRedundantMocapRetarget,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'mocap-solver-retake-scratch') || (isGenericScratchExt && hasMocapContext),
		isMocapCalPath,
		isEthicsHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Motion Capture & Biomechanics domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isMocapBiomechanicsGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyMocapBiomechanicsFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Raw Mocap/C3D/Calibration anchors
 * to derived retargeted FBX/BVH/USD/GLB exports, reference videos, and joint-angle CSV exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildMocapBiomechanicsCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyMocapBiomechanicsFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isMocapMasterAnchor) {
				anchorStems.add(meta.takeStem)
				anchorKeys.add(meta.mocapAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Mocap & Biomechanics cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'calibration-rigs-ethics-holds')) {
		return 'calibration-rigs-ethics-holds'
	}
	if (members.some(m => m.family === 'raw-mocap-telemetry-masters')) {
		return 'raw-mocap-telemetry-masters'
	}
	if (members.some(m => m.family === 'redundant-retargeted-fbx-previews')) {
		return 'redundant-retargeted-fbx-previews'
	}
	return 'mocap-solver-retake-scratch'
}

/**
 * Compute deterministic survivor priority score for a Mocap & Biomechanics vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-session-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedEthicsArchiveHold ? 100000 : 0)
			+ (member.isProtectedCalibrationRigBaseline ? 97000 : 0)
			+ (member.isProtectedRawMocapMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantMocapRetarget ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-solve-first') {
		return (member.isProtectedEthicsArchiveHold ? 100000 : 0)
			+ (member.isProtectedCalibrationRigBaseline ? 97000 : 0)
			+ (member.isProtectedRawMocapMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantMocapRetarget ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedEthicsArchiveHold ? 52000 : 0)
			+ (member.isProtectedCalibrationRigBaseline ? 50000 : 0)
			+ (member.isProtectedRawMocapMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedEthicsArchiveHold ? 100000 : 0)
		+ (member.isProtectedCalibrationRigBaseline ? 97000 : 0)
		+ (member.isProtectedRawMocapMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRedundantMocapRetarget ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Motion Capture & Biomechanics duplicate cluster.
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
		const meta = classifyMocapBiomechanicsFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.mocapToolchain)?.mocapToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].takeStem || extractMocapBiomechanicsStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].mocapAnchorKey || extractMocapBiomechanicsAnchorKey(primaryStem)

	const hasMocapMasterAnchor = Boolean(
		rawMembers.some(m => m.isMocapMasterAnchor)
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

		const isRedundantMocapRetargetMember = member.isRedundantMocapRetarget && hasMocapMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantMocapRetarget) {
			redundancyReason = isRedundantMocapRetargetMember
				? 'Derived FBX/BVH retarget, reference video, or joint-angle CSV duplicates verified Raw Mocap/C3D master'
				: 'Retargeted FBX/BVH or preview export without verified Raw Mocap/C3D master anchor'
		}

		let governanceTier = 'solver-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedEthicsArchiveHold
				? 'ethics-hold-protected'
				: (member.isProtectedCalibrationRigBaseline
					? 'cal-rig-std-protected'
					: (member.isProtectedRawMocapMaster
						? 'raw-mocap-master-protected'
						: (member.isRedundantMocapRetarget
							? 'mocap-retarget-redundant'
							: 'solver-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedEthicsArchiveHold && config.protectEthicsArchiveHolds) {
			governanceTier = 'ethics-hold-protected'
			shielded = true
			protectedReason = 'IRB, clinical-gait, or NDA studio performance hold strictly conserved'
		} else if (member.isProtectedCalibrationRigBaseline && config.protectCalibrationsAndRigs) {
			governanceTier = 'cal-rig-std-protected'
			shielded = true
			protectedReason = 'Optical wand calibration, skeletal rig (.vsk/.osim), or force-plate baseline strictly conserved'
		} else if (member.isProtectedRawMocapMaster && config.protectRawMocapMasters) {
			governanceTier = 'raw-mocap-master-protected'
			shielded = true
			protectedReason = 'Verified raw C3D, Vicon X2D, OptiTrack TAK, Qualisys QTM, or Xsens MVN master strictly conserved'
		} else if (isSurvivor && !isRedundantMocapRetargetMember) {
			governanceTier = member.isProtectedEthicsArchiveHold
				? 'ethics-hold-protected'
				: (member.isProtectedCalibrationRigBaseline
					? 'cal-rig-std-protected'
					: (member.isProtectedRawMocapMaster
						? 'raw-mocap-master-protected'
						: (member.isRedundantMocapRetarget
							? 'mocap-retarget-redundant'
							: 'solver-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Mocap & Biomechanics vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantMocapRetarget
				? 'mocap-retarget-redundant'
				: (member.isProtectedCalibrationRigBaseline
					? 'cal-rig-std-protected'
					: 'solver-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-c3d-x2d-and-tak' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentSessionDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentSessionDays
		) {
			governanceTier = 'solver-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentSessionDays}-day active Vicon, Motive, or OpenSim solver grace window`
		} else if (member.isRedundantMocapRetarget) {
			governanceTier = 'mocap-retarget-redundant'
			if (config.requireMocapAnchorForPrune && !hasMocapMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Raw C3D, X2D, TAK, QTM, or MVN master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'solver-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Vicon, Motive, QTM, Xsens, or OpenSim solver scratch eligible for cleanup'
		} else if (member.isProtectedRawMocapMaster || member.isProtectedCalibrationRigBaseline) {
			governanceTier = member.isProtectedCalibrationRigBaseline ? 'cal-rig-std-protected' : 'raw-mocap-master-protected'
			action = config.strategy === 'hardlink-immutable-c3d-x2d-and-tak' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-c3d-x2d-and-tak' && !member.isMutableFile) {
			governanceTier = 'raw-mocap-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'solver-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantMocapRetargetMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantMocapRetarget = members.some(m => m.isRedundantMocapRetargetMember || m.isRedundantMocapRetarget)
	const hasProtectedEthicsHold = members.some(m => m.governanceTier === 'ethics-hold-protected' && m.shielded)
	const hasProtectedCalRigBaseline = members.some(m => m.governanceTier === 'cal-rig-std-protected' && m.shielded)
	const hasProtectedRawMocapMaster = members.some(m => m.governanceTier === 'raw-mocap-master-protected' && m.shielded)
	const hasSolverScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantMocapRetargetMember && !m.shielded)) {
			clusterVerdict = 'mocap-retarget-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'solver-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedEthicsHold) {
		clusterVerdict = 'ethics-hold-protected'
	} else if (hasProtectedCalRigBaseline) {
		clusterVerdict = 'cal-rig-std-protected'
	} else if (hasProtectedRawMocapMaster) {
		clusterVerdict = 'raw-mocap-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantMocapRetarget ? 95 : 85
	} else if (hasProtectedEthicsHold) {
		priorityScore = 60
	} else if (hasProtectedCalRigBaseline) {
		priorityScore = 50
	}

	const mocapTags = [...new Set(members.map(m => m.mocapTag).filter(Boolean))]
	const familyMeta = MOCAP_BIOMECHANICS_FAMILY_META[family] || MOCAP_BIOMECHANICS_FAMILY_META['mocap-solver-retake-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		mocapToolchain: primaryToolchain,
		workflowStage: primaryStage,
		takeStem: primaryStem,
		mocapAnchorKey: primaryAnchorKey,
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
		hasProtectedCalRigBaseline,
		hasProtectedRawMocapMaster,
		hasProtectedEthicsHold,
		hasRedundantMocapRetarget,
		hasSolverScratchIntermediate,
		hasMocapMasterAnchor,
		mocapTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Motion Capture, Biomechanics & Optical Tracking Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Mocap & Biomechanics vault audit report.
 */
export function auditMocapBiomechanicsVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeMocapBiomechanicsConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isMocapBiomechanicsGroup)
	const correlationIndex = buildMocapBiomechanicsCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'calibration-rigs-ethics-holds': 0,
		'raw-mocap-telemetry-masters': 0,
		'redundant-retargeted-fbx-previews': 0,
		'mocap-solver-retake-scratch': 0,
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
				cluster.mocapToolchain,
				cluster.workflowStage,
				cluster.takeStem,
				cluster.mocapAnchorKey,
				cluster.familyLabel,
				...cluster.mocapTags,
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
	let totalCalRigStdClusters = 0
	let totalRawMocapMasterClusters = 0
	let totalEthicsHoldClusters = 0
	let totalRedundantRetargetClusters = 0
	let totalSolverScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCalRigBaseline) {
			totalCalRigStdClusters += 1
		}
		if (cluster.hasProtectedRawMocapMaster) {
			totalRawMocapMasterClusters += 1
		}
		if (cluster.hasProtectedEthicsHold) {
			totalEthicsHoldClusters += 1
		}
		if (cluster.hasRedundantMocapRetarget) {
			totalRedundantRetargetClusters += 1
		}
		if (cluster.hasSolverScratchIntermediate) {
			totalSolverScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = MOCAP_BIOMECHANICS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: MOCAP_BIOMECHANICS_FAMILY_META[id].label,
			shortLabel: MOCAP_BIOMECHANICS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: MOCAP_BIOMECHANICS_VAULT_SCHEMA,
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
			totalCalRigStdClusters,
			totalRawMocapMasterClusters,
			totalEthicsHoldClusters,
			totalRedundantRetargetClusters,
			totalSolverScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Mocap & Biomechanics Vaults.
 * Strictly blocks deletion or hardlinking of shielded calibration/rig baselines, Ethics Holds,
 * and verified Raw Mocap/C3D masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditMocapBiomechanicsVault.
 * @return {string} POSIX bash script.
 */
export function buildMocapBiomechanicsRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Motion Capture, Biomechanics & Optical Tracking Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./mocap-biomechanics-vault-reclaim.sh only after verifying Raw C3D/X2D/TAK/QTM/MVN anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.mocap-biomechanics-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-retargets-and-solver-scratch'
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
			} else if (strategy === 'quarantine-retargets-and-solver-scratch' && (target.isRedundantMocapRetarget || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable retarget exports or solver scratch under active Mocap & Biomechanics shields.\\n"')
	} else {
		lines.push(`printf "Completed Mocap & Biomechanics Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditMocapBiomechanicsVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildMocapBiomechanicsCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'mocap_toolchain',
		'workflow_stage',
		'take_stem',
		'mocap_anchor_key',
		'family',
		'cluster_verdict',
		'has_mocap_master_anchor',
		'is_redundant_mocap_retarget',
		'is_solver_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'mocap_tag',
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
				cluster.mocapToolchain || '',
				cluster.workflowStage || '',
				cluster.takeStem,
				cluster.mocapAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasMocapMasterAnchor ? 'true' : 'false',
				member.isRedundantMocapRetargetMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.mocapTag || '',
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
 * @param {object} auditResult Result from auditMocapBiomechanicsVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMocapBiomechanicsJsonManifest(auditResult) {
	const payload = {
		schema: MOCAP_BIOMECHANICS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || MOCAP_BIOMECHANICS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			mocapToolchain: cluster.mocapToolchain,
			workflowStage: cluster.workflowStage,
			takeStem: cluster.takeStem,
			mocapAnchorKey: cluster.mocapAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCalRigBaseline: cluster.hasProtectedCalRigBaseline,
			hasProtectedRawMocapMaster: cluster.hasProtectedRawMocapMaster,
			hasProtectedEthicsHold: cluster.hasProtectedEthicsHold,
			hasRedundantMocapRetarget: cluster.hasRedundantMocapRetarget,
			hasSolverScratchIntermediate: cluster.hasSolverScratchIntermediate,
			hasMocapMasterAnchor: cluster.hasMocapMasterAnchor,
			mocapTags: cluster.mocapTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				mocapTag: member.mocapTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantMocapRetargetMember: member.isRedundantMocapRetargetMember,
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
 * cloud sync of Vicon, OptiTrack Motive, Qualisys QTM, Xsens, and OpenSim scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildMocapBiomechanicsSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Motion Capture & Biomechanics Vaults',
		'vicon_tmp/',
		'nexus_cache/',
		'nexus_tmp/',
		'shogun_tmp/',
		'shogun_cache/',
		'motive_cache/',
		'motive_tmp/',
		'qtm_tmp/',
		'qualisys_cache/',
		'xsens_cache/',
		'xsens_tmp/',
		'opensim_tmp/',
		'retarget_cache/',
		'solve_scratch/',
		'take_tmp/',
		'c3d_tmp/',
		'gapfill_tmp/',
		'labeling_scratch/',
		'ik_scratch/',
		'tmp_vicon_*',
		'tmp_motive_*',
		'tmp_qtm_*',
		'tmp_xsens_*',
		'tmp_opensim_*',
		'tmp_c3d_*',
		'*.c3d.tmp',
		'*.x2d.tmp',
		'*.x1d.tmp',
		'*.tak.tmp',
		'*.qtm.tmp',
		'*.mvn.tmp',
		'*.mvnx.tmp',
		'*.fbx.tmp',
		'*.bvh.tmp',
		'*.trc.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
