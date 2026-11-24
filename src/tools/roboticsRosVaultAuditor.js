/**
 * Pure Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Robotics & Autonomous Vault families:
 * - Robot Kinematics & Calibration (.urdf, .xacro, .srdf, .sdf, .mjcf, .launch.py, .launch.xml, .rviz, calibration/extrinsics .yaml)
 * - ROS / ROS2 Bags & MCAP Telemetry (.mcap, .mcap.zst, .mcap.lz4, .bag, .bag.lz4, .bag.zst, .db3, .db3.zst, metadata.yaml)
 * - LiDAR & 3D Point Cloud Captures (.laz, .copc.laz, .las, .pcd, .pcd.zst, .e57, .ply)
 * - Colcon Build & Simulation Scratch (colcon_build/, ros_build/, gazebo_cache/, isaac_cache/, slam_tmp/, rosbag_extract/, .rosbag_idx, .db3-wal, .db3-shm)
 *
 * Enforces strict robotics mission-preservation and calibration governance defaults:
 * - Strictly conserves URDF/XACRO kinematics, SRDF/SDF models, launch graphs, and sensor calibration/extrinsics YAMLs
 * - Strictly conserves compressed telemetry archives (.mcap.zst, .mcap.lz4, .bag.lz4, .bag.zst, .db3.zst)
 * - Strictly conserves compressed LiDAR point clouds (.laz, .copc.laz, .pcd.zst, .e57.zst) and canonical .e57/.pcd captures
 * - Detects redundant uncompressed .bag/.db3/.mcap and .las files when a verified compressed archive anchor exists
 * - Blocks deletion of uncompressed .bag/.db3/.mcap/.las lacking a verified compressed anchor when guard is active
 * - Blocks hardlinks on mutable calibration/URDF/launch files, active .db3/.bag SQLite/ROS files, and simulation scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ROBOTICS_ROS_VAULT_SCHEMA = 'duplicatefinder.robotics-ros-vault-auditor.v1'

export const ROBOTICS_ROS_FAMILIES = Object.freeze([
	'all',
	'robot-kinematics-calibration',
	'rosbag-mcap-telemetry',
	'lidar-point-cloud',
	'colcon-sim-scratch',
])

export const ROBOTICS_ROS_FAMILY_META = Object.freeze({
	'robot-kinematics-calibration': {
		id: 'robot-kinematics-calibration',
		label: 'Kinematics & Calibration',
		shortLabel: 'Kinematics (.urdf, .xacro, .srdf, .sdf, extrinsics .yaml)',
	},
	'rosbag-mcap-telemetry': {
		id: 'rosbag-mcap-telemetry',
		label: 'ROS / ROS2 Bags & MCAP',
		shortLabel: 'Telemetry (.mcap, .mcap.zst, .bag, .bag.lz4, .db3, .db3.zst)',
	},
	'lidar-point-cloud': {
		id: 'lidar-point-cloud',
		label: 'LiDAR & 3D Point Clouds',
		shortLabel: 'Point Clouds (.laz, .copc.laz, .las, .pcd, .e57, .ply)',
	},
	'colcon-sim-scratch': {
		id: 'colcon-sim-scratch',
		label: 'Colcon & Sim Scratch',
		shortLabel: 'Build & Sim (colcon_build/, gazebo_cache/, slam_tmp/, .db3-wal)',
	},
})

export const ROBOTICS_ROS_STRATEGIES = Object.freeze([
	'prune-uncompressed-bags-and-sim-scratch',
	'hardlink-immutable-bags-and-lidar',
	'quarantine-uncompressed-bags-and-scratch',
])

export const ROBOTICS_ROS_SURVIVOR_RULES = Object.freeze([
	'mission-vault-archive-first',
	'oldest-mission-first',
	'newest-calibration-first',
	'shortest-path',
])

export const ROBOTICS_ROS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'kinematics-calibration-protected',
	'compressed-rosbag-protected',
	'lidar-pointcloud-protected',
	'uncompressed-bag-las-redundant',
	'colcon-sim-scratch-intermediate',
	'shielded',
])

export const ROBOTICS_ROS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ROBOTICS_ROS_PRESETS = Object.freeze([
	{
		id: 'all-robotics-ros-audit',
		name: 'All Robotics & ROS2 Vaults',
		description: 'Audit robot URDF/XACRO kinematics and sensor calibration, ROS2 MCAP/DB3/BAG telemetry, LiDAR point clouds (.laz/.las/.pcd/.e57), and Colcon/Gazebo/Isaac simulation scratch while conserving canonical mission vaults.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-bags-and-sim-scratch',
		survivorRule: 'mission-vault-archive-first',
		protectKinematicsAndCalibration: true,
		protectCompressedRosbags: true,
		protectCanonicalLidarCaptures: true,
		requireCompressedAnchorForPrune: true,
		keepRecentMissionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'colcon-sim-scratch-cleanup',
		name: 'Colcon, Gazebo & SLAM Scratch Cleanup',
		description: 'Reclaim redundant colcon_build/, ros2_ws/build/, gazebo_cache/, isaac_cache/, slam_tmp/, and rosbag_extract/ intermediates older than the mission grace window while conserving canonical URDF, MCAP.ZST, and LAZ vaults.',
		familyFilter: 'all',
		strategy: 'prune-uncompressed-bags-and-sim-scratch',
		survivorRule: 'mission-vault-archive-first',
		protectKinematicsAndCalibration: true,
		protectCompressedRosbags: true,
		protectCanonicalLidarCaptures: true,
		requireCompressedAnchorForPrune: true,
		keepRecentMissionDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-uncompressed-rosbag-audit',
		name: 'Redundant .bag/.db3/.mcap vs .zst/.lz4',
		description: 'Detect uncompressed .bag, .db3, and .mcap recordings backed by a verified compressed .mcap.zst, .bag.lz4, or .db3.zst archive anchor and quarantine or prune them safely.',
		familyFilter: 'rosbag-mcap-telemetry',
		strategy: 'quarantine-uncompressed-bags-and-scratch',
		survivorRule: 'mission-vault-archive-first',
		protectKinematicsAndCalibration: true,
		protectCompressedRosbags: true,
		protectCanonicalLidarCaptures: true,
		requireCompressedAnchorForPrune: true,
		keepRecentMissionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'lidar-las-vs-laz-audit',
		name: 'LiDAR Point Cloud (.las vs .laz/.copc.laz)',
		description: 'Identify uncompressed .las point cloud exports backed by a verified .laz or .copc.laz compressed anchor while conserving .e57, .pcd, and canonical LiDAR vault captures.',
		familyFilter: 'lidar-point-cloud',
		strategy: 'quarantine-uncompressed-bags-and-scratch',
		survivorRule: 'mission-vault-archive-first',
		protectKinematicsAndCalibration: true,
		protectCompressedRosbags: true,
		protectCanonicalLidarCaptures: true,
		requireCompressedAnchorForPrune: true,
		keepRecentMissionDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'kinematics-calibration-shield',
		name: 'Conserved URDF/XACRO & Calibration Shield',
		description: 'Inspect robot kinematics descriptions (.urdf, .xacro, .srdf, .sdf), launch files, and sensor extrinsics/intrinsics calibration YAMLs under strict preservation shields.',
		familyFilter: 'robot-kinematics-calibration',
		strategy: 'hardlink-immutable-bags-and-lidar',
		survivorRule: 'mission-vault-archive-first',
		protectKinematicsAndCalibration: true,
		protectCompressedRosbags: true,
		protectCanonicalLidarCaptures: true,
		requireCompressedAnchorForPrune: true,
		keepRecentMissionDays: 0,
		minSizeKb: 0,
	},
])

export const ROBOTICS_ROS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-robotics-ros-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-uncompressed-bags-and-sim-scratch',
	survivorRule: 'mission-vault-archive-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectKinematicsAndCalibration: true,
	protectCompressedRosbags: true,
	protectCanonicalLidarCaptures: true,
	requireCompressedAnchorForPrune: true,
	keepRecentMissionDays: 0,
	minSizeKb: 0,
})

const STRICT_KINEMATICS_EXT_RE = /\.(?:urdf|xacro|srdf|mjcf|rviz|launch\.py|launch\.xml)$/i
const CONTEXT_KINEMATICS_EXT_RE = /\.(?:sdf|calib\.ya?ml|extrinsics\.ya?ml|intrinsics\.ya?ml|tf\.ya?ml|ya?ml)$/i

const COMPRESSED_ROSBAG_EXT_RE = /\.(?:mcap|bag|db3)\.(?:zst|lz4|gz|bz2|xz)$/i
const UNCOMPRESSED_ROSBAG_EXT_RE = /\.(?:mcap|bag|db3)$/i
const ROS_METADATA_SIDECAR_RE = /^(?:metadata\.ya?ml)$/i

const COMPRESSED_LIDAR_EXT_RE = /\.(?:copc\.laz|laz|pcd\.zst|pcd\.gz|e57\.zst|las\.zst)$/i
const UNCOMPRESSED_LAS_EXT_RE = /\.las$/i
const RAW_LIDAR_CAPTURE_EXT_RE = /\.(?:e57|pcd|ply)$/i

const SCRATCH_SIM_EXT_RE = /\.(?:rosbag_idx|db3-wal|db3-shm|simcache|colcon_cache|gazebo_log)$/i

const MUTABLE_ROBOTICS_EXT_RE = /\.(?:urdf|xacro|srdf|sdf|mjcf|rviz|launch\.py|launch\.xml|ya?ml|mcap|bag|db3|las|pcd|ply|db3-wal|db3-shm|rosbag_idx|tmp)$/i

const ROBOTICS_CONTEXT_RE = /(?:ros2?|rosbag|mcap|colcon|catkin|gazebo|ignition|isaac|autoware|nav2|moveit|urdf|xacro|lidar|velodyne|ouster|hesai|pointcloud|slam|extrinsics|intrinsics|calibration|robotics|autonomous|fleet[-_]?mission|ego[-_]?vehicle)/i

const SIM_SCRATCH_PATH_RE = /(?:^|\/)(?:colcon_build|ros_build|ros2_ws\/(?:build|install|log)|catkin_ws\/(?:build|devel)|gazebo_cache|\.gazebo|isaac_cache|slam_tmp|rosbag_extract|extracted_frames|pointcloud_tmp|nav2_costmap_tmp|\.ccache|build_cache|sim_scratch|scratch|tmp|temp|cache)(?:\/|$)/i
const CANONICAL_MISSION_PATH_RE = /(?:^|\/)(?:00_missions?|mission[_-]?vault|fleet[_-]?archive|rosbag[_-]?vault|mcap[_-]?archive|lidar[_-]?vault|calibration[_-]?vault|robot[_-]?description|urdf[_-]?models|canonical|archive|vault|golden[_-]?calib)(?:\/|$)/i

const ANY_ROBOTICS_EXT_RE = /\.(?:mcap\.zst|mcap\.lz4|mcap\.gz|bag\.lz4|bag\.zst|bag\.gz|db3\.zst|db3\.lz4|db3\.gz|copc\.laz|pcd\.zst|pcd\.gz|e57\.zst|las\.zst|launch\.py|launch\.xml|calib\.yaml|calib\.yml|extrinsics\.yaml|extrinsics\.yml|intrinsics\.yaml|intrinsics\.yml|tf\.yaml|tf\.yml|urdf|xacro|srdf|mjcf|rviz|sdf|yaml|yml|mcap|bag|db3|laz|las|e57|pcd|ply|rosbag_idx|db3-wal|db3-shm|simcache|colcon_cache|gazebo_log)$/i

const GENERIC_ROBOTICS_STEMS = new Set([
	'metadata',
	'rosbag',
	'recording',
	'telemetry',
	'lidar',
	'pointcloud',
	'scan',
	'calibration',
	'extrinsics',
	'intrinsics',
	'robot',
	'model',
	'map',
	'slam',
	'cache',
	'frames',
])

const NOISE_PARENT_DIRS = new Set([
	'colcon_build',
	'ros_build',
	'build',
	'install',
	'log',
	'devel',
	'gazebo_cache',
	'.gazebo',
	'isaac_cache',
	'slam_tmp',
	'rosbag_extract',
	'extracted_frames',
	'pointcloud_tmp',
	'nav2_costmap_tmp',
	'.ccache',
	'build_cache',
	'sim_scratch',
	'scratch',
	'tmp',
	'temp',
	'cache',
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
export function normalizeRoboticsRosConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = ROBOTICS_ROS_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...ROBOTICS_ROS_DEFAULT_CONFIG, ...preset }
		: { ...ROBOTICS_ROS_DEFAULT_CONFIG }

	const familyFilter = ROBOTICS_ROS_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = ROBOTICS_ROS_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = ROBOTICS_ROS_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = ROBOTICS_ROS_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = ROBOTICS_ROS_SORT_MODES.includes(input.sortMode)
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
		protectKinematicsAndCalibration: typeof input.protectKinematicsAndCalibration === 'boolean'
			? input.protectKinematicsAndCalibration
			: base.protectKinematicsAndCalibration,
		protectCompressedRosbags: typeof input.protectCompressedRosbags === 'boolean'
			? input.protectCompressedRosbags
			: base.protectCompressedRosbags,
		protectCanonicalLidarCaptures: typeof input.protectCanonicalLidarCaptures === 'boolean'
			? input.protectCanonicalLidarCaptures
			: base.protectCanonicalLidarCaptures,
		requireCompressedAnchorForPrune: typeof input.requireCompressedAnchorForPrune === 'boolean'
			? input.requireCompressedAnchorForPrune
			: base.requireCompressedAnchorForPrune,
		keepRecentMissionDays: normalizeNonNegativeInt(input.keepRecentMissionDays, base.keepRecentMissionDays, 3650),
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
 * Extract meaningful mission or robot folder from a path, skipping generic scratch subdirs.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulMissionFolder(normalizedPath) {
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
 * Detect robotics middleware/sensor platform and pipeline stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ roboticsPlatform: string, pipelineStage: string }} Detected platform and stage.
 */
export function extractRoboticsPlatformAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()

	let roboticsPlatform = 'ROS2 / Autonomous Vault'
	if (/isaac/i.test(lowerPath)) {
		roboticsPlatform = 'NVIDIA Isaac Sim'
	} else if (/gazebo|ignition/i.test(lowerPath) || /\.sdf$/i.test(lowerBase)) {
		roboticsPlatform = 'Gazebo / Ignition Sim'
	} else if (/autoware|nav2/i.test(lowerPath)) {
		roboticsPlatform = 'Autoware / Nav2'
	} else if (/moveit/i.test(lowerPath) || STRICT_KINEMATICS_EXT_RE.test(lowerBase)) {
		roboticsPlatform = 'MoveIt2 / URDF Kinematics'
	} else if (/velodyne|ouster|hesai|lidar|pointcloud/i.test(lowerPath) || COMPRESSED_LIDAR_EXT_RE.test(lowerBase) || UNCOMPRESSED_LAS_EXT_RE.test(lowerBase) || RAW_LIDAR_CAPTURE_EXT_RE.test(lowerBase)) {
		roboticsPlatform = 'Ouster / Velodyne LiDAR'
	} else if (/mcap|foxglove/i.test(lowerPath) || /\.mcap(?:\.(?:zst|lz4|gz|bz2|xz))?$/i.test(lowerBase)) {
		roboticsPlatform = 'Foxglove / ROS2 MCAP'
	} else if (/ros2|colcon|\.db3/i.test(lowerPath) || /\.db3(?:\.(?:zst|lz4|gz|bz2|xz))?$/i.test(lowerBase)) {
		roboticsPlatform = 'ROS2 Humble / Jazzy'
	} else if (/ros1|catkin|\.bag/i.test(lowerPath) || /\.bag(?:\.(?:zst|lz4|gz|bz2|xz))?$/i.test(lowerBase)) {
		roboticsPlatform = 'ROS1 Noetic Bag'
	}

	let pipelineStage = ''
	if (STRICT_KINEMATICS_EXT_RE.test(lowerBase) || (CONTEXT_KINEMATICS_EXT_RE.test(lowerBase) && /calib|extrinsics|intrinsics|tf|urdf|moveit/i.test(lowerPath + '/' + lowerBase))) {
		pipelineStage = /calib|extrinsics|intrinsics/i.test(lowerPath + '/' + lowerBase)
			? 'Sensor Extrinsics & Calibration'
			: 'Robot Kinematics & Launch Graph'
	} else if (COMPRESSED_ROSBAG_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Compressed Telemetry Archive (.mcap.zst/.bag.lz4/.db3.zst)'
	} else if (UNCOMPRESSED_ROSBAG_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Uncompressed ROS Bag / MCAP Recording'
	} else if (COMPRESSED_LIDAR_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Compressed LiDAR Archive (.laz/.copc.laz)'
	} else if (UNCOMPRESSED_LAS_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Uncompressed LiDAR Export (.las)'
	} else if (RAW_LIDAR_CAPTURE_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Canonical 3D Point Cloud (.e57/.pcd/.ply)'
	} else if (SIM_SCRATCH_PATH_RE.test(lowerPath) || SCRATCH_SIM_EXT_RE.test(lowerBase)) {
		pipelineStage = 'Colcon / Gazebo / SLAM Scratch'
	}

	return { roboticsPlatform, pipelineStage }
}

/**
 * Extract normalized mission lineage stem and anchor key to correlate
 * uncompressed .bag/.db3/.mcap against .zst/.lz4 archives and .las against .laz anchors.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for mission folder context.
 * @return {string} Normalized lineage stem.
 */
export function extractRoboticsLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_ROBOTICS_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|uncompressed|extracted|decoded|reindex|reindexed|copy\d*|tmp|temp|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_ROBOTICS_STEMS.has(stem)) {
		const missionFolder = extractMeaningfulMissionFolder(normalizedPath)
		if (missionFolder) {
			return `${missionFolder}_${stem || 'mission'}`
		}
	}

	return stem || 'unknown-mission'
}

/**
 * Extract broader mission anchor key (stripping bag split suffixes like _0, _0001, _chunk02).
 *
 * @param {string} lineageStem Normalized lineage stem.
 * @return {string} Mission anchor key.
 */
export function extractMissionAnchorKey(lineageStem) {
	return String(lineageStem || '')
		.replace(/(?:[-_.](?:part\d+|seg\d+|chunk\d+|split\d+|\d{1,4}))+$/i, '')
		|| 'unknown-mission'
}

/**
 * Extract concise robotics artifact tag for badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Robotics artifact tag.
 */
function extractRoboticsTag(lowerBase, lowerPath) {
	if (/\.(?:urdf|xacro|srdf|mjcf)$/i.test(lowerBase)) {
		return 'urdf-kinematics'
	}
	if (/\.(?:launch\.py|launch\.xml|rviz)$/i.test(lowerBase)) {
		return 'ros-launch-graph'
	}
	if (/\.(?:calib\.ya?ml|extrinsics\.ya?ml|intrinsics\.ya?ml|tf\.ya?ml)$/i.test(lowerBase) || (/\.ya?ml$/i.test(lowerBase) && /calib|extrinsics|intrinsics/i.test(lowerPath))) {
		return 'sensor-calibration'
	}
	if (COMPRESSED_ROSBAG_EXT_RE.test(lowerBase)) {
		return 'rosbag-compressed'
	}
	if (UNCOMPRESSED_ROSBAG_EXT_RE.test(lowerBase)) {
		return 'rosbag-uncompressed'
	}
	if (COMPRESSED_LIDAR_EXT_RE.test(lowerBase)) {
		return 'lidar-compressed'
	}
	if (UNCOMPRESSED_LAS_EXT_RE.test(lowerBase)) {
		return 'lidar-las-uncompressed'
	}
	if (RAW_LIDAR_CAPTURE_EXT_RE.test(lowerBase)) {
		return 'lidar-pointcloud'
	}
	if (SCRATCH_SIM_EXT_RE.test(lowerBase) || SIM_SCRATCH_PATH_RE.test(lowerPath)) {
		return 'colcon-sim-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Robotics, Autonomous Systems, ROS2 Bags & LiDAR Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyRoboticsRosFile(file, referenceNowMs = Date.now()) {
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

	const hasRoboticsContext = ROBOTICS_CONTEXT_RE.test(lower)
	const isSimBuildScratchPath = SIM_SCRATCH_PATH_RE.test(lower)
	const isCanonicalMissionPath = CANONICAL_MISSION_PATH_RE.test(lower) && !isSimBuildScratchPath

	const isStrictKinematics = STRICT_KINEMATICS_EXT_RE.test(lowerBase)
	const isCalibrationYaml = /\.(?:calib\.ya?ml|extrinsics\.ya?ml|intrinsics\.ya?ml|tf\.ya?ml)$/i.test(lowerBase)
		|| (/\.ya?ml$/i.test(lowerBase) && /calib|extrinsics|intrinsics|urdf|moveit|nav2/i.test(lower))
	const isContextSdf = /\.sdf$/i.test(lowerBase) && hasRoboticsContext
	const isRosMetadata = ROS_METADATA_SIDECAR_RE.test(lowerBase) && hasRoboticsContext

	const isCompressedRosbag = COMPRESSED_ROSBAG_EXT_RE.test(lowerBase)
	const isUncompressedRosbag = !isCompressedRosbag && UNCOMPRESSED_ROSBAG_EXT_RE.test(lowerBase)

	const isCompressedLidar = COMPRESSED_LIDAR_EXT_RE.test(lowerBase)
	const isUncompressedLas = !isCompressedLidar && UNCOMPRESSED_LAS_EXT_RE.test(lowerBase)
	const isRawLidarCapture = RAW_LIDAR_CAPTURE_EXT_RE.test(lowerBase) && (hasRoboticsContext || /\.(?:e57|pcd)$/i.test(lowerBase))

	const isScratchSimExt = SCRATCH_SIM_EXT_RE.test(lowerBase)
	const isContextSimScratch = isSimBuildScratchPath && (hasRoboticsContext || ANY_ROBOTICS_EXT_RE.test(lowerBase))

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedKinematicsCalibration = false
	let isProtectedCompressedRosbag = false
	let isProtectedLidarCapture = false
	let isCompressedBagAnchor = false
	let isCompressedLidarAnchor = false
	let isUncompressedRosbagFile = false
	let isUncompressedLasFile = false
	const isMutableFile = MUTABLE_ROBOTICS_EXT_RE.test(lowerBase)

	if (isStrictKinematics || isCalibrationYaml || isContextSdf) {
		family = 'robot-kinematics-calibration'
		isProtectedKinematicsCalibration = !isSimBuildScratchPath
		if (isCalibrationYaml) {
			artifactKind = 'Sensor Extrinsics & Calibration (.yaml)'
			vaultRole = isSimBuildScratchPath ? 'Build/Sim Calibration Copy' : 'Canonical Calibration & TF Vault'
		} else {
			artifactKind = 'Robot Kinematics & Launch (.urdf/.xacro/.srdf/.sdf)'
			vaultRole = isSimBuildScratchPath ? 'Build/Sim Kinematics Copy' : 'Canonical Robot Description Vault'
		}
	} else if (isCompressedRosbag || isUncompressedRosbag || isRosMetadata) {
		family = 'rosbag-mcap-telemetry'
		if (isCompressedRosbag) {
			isCompressedBagAnchor = !isSimBuildScratchPath
			isProtectedCompressedRosbag = !isSimBuildScratchPath
			artifactKind = 'Compressed Telemetry Archive (.mcap.zst/.bag.lz4/.db3.zst)'
			vaultRole = isSimBuildScratchPath ? 'Scratch MCAP.ZST Copy' : 'Archived Compressed ROS2 / MCAP Vault'
		} else if (isRosMetadata) {
			isProtectedCompressedRosbag = !isSimBuildScratchPath
			artifactKind = 'ROS2 Bag Metadata Sidecar (metadata.yaml)'
			vaultRole = isSimBuildScratchPath ? 'Scratch ROS2 Manifest' : 'ROS2 Bag Topic Manifest'
		} else {
			isUncompressedRosbagFile = true
			artifactKind = 'Uncompressed ROS / MCAP Bag (.mcap/.bag/.db3)'
			vaultRole = isSimBuildScratchPath ? 'Scratch Uncompressed Bag' : 'Uncompressed Telemetry Copy'
		}
	} else if (isCompressedLidar || isUncompressedLas || isRawLidarCapture) {
		family = 'lidar-point-cloud'
		if (isCompressedLidar) {
			isCompressedLidarAnchor = !isSimBuildScratchPath
			isProtectedLidarCapture = !isSimBuildScratchPath
			artifactKind = 'Compressed LiDAR Point Cloud (.laz/.copc.laz/.pcd.zst)'
			vaultRole = isSimBuildScratchPath ? 'Scratch LiDAR Archive Copy' : 'Archived Compressed LiDAR Vault'
		} else if (isUncompressedLas) {
			isUncompressedLasFile = true
			artifactKind = 'Uncompressed LiDAR Point Cloud (.las)'
			vaultRole = isSimBuildScratchPath ? 'Scratch Uncompressed LAS' : 'Uncompressed LAS Export Copy'
		} else {
			isProtectedLidarCapture = !isSimBuildScratchPath
			artifactKind = 'Canonical 3D Point Cloud (.e57/.pcd/.ply)'
			vaultRole = isSimBuildScratchPath ? 'Scratch Point Cloud Copy' : 'Conserved Raw LiDAR Capture'
		}
	} else if (isScratchSimExt || isContextSimScratch) {
		family = 'colcon-sim-scratch'
		artifactKind = isScratchSimExt
			? 'ROS2 / Gazebo Transient Index or WAL'
			: 'Colcon Build / Gazebo / SLAM Scratch'
		vaultRole = 'Colcon / Gazebo / Isaac Sim Scratch'
	}

	const { roboticsPlatform, pipelineStage } = extractRoboticsPlatformAndStage(normalized, basename)
	const lineageStem = extractRoboticsLineageStem(basename, normalized)
	const missionAnchorKey = extractMissionAnchorKey(lineageStem)
	const missionFolder = extractMeaningfulMissionFolder(normalized)
	const roboticsTag = extractRoboticsTag(lowerBase, lower)

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
		roboticsPlatform,
		pipelineStage,
		lineageStem,
		missionAnchorKey,
		missionFolder,
		roboticsTag,
		isProtectedKinematicsCalibration,
		isProtectedCompressedRosbag,
		isProtectedLidarCapture,
		isCompressedBagAnchor,
		isCompressedLidarAnchor,
		isUncompressedRosbagFile,
		isUncompressedLasFile,
		isMutableFile,
		isSimBuildScratchPath: isSimBuildScratchPath || isScratchSimExt,
		isCanonicalMissionPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Robotics, ROS2 Bags & LiDAR Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isRoboticsRosGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyRoboticsRosFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified compressed ROS2/MCAP (.mcap.zst/.bag.lz4/.db3.zst)
 * and compressed LiDAR (.laz/.copc.laz) archive anchors to redundant uncompressed copies.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildRoboticsRosCorrelationIndex(groups) {
	const compressedBagStems = new Set()
	const compressedBagMissionKeys = new Set()
	const compressedLidarStems = new Set()
	const compressedLidarMissionKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyRoboticsRosFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedBagAnchor) {
				compressedBagStems.add(meta.lineageStem)
				compressedBagMissionKeys.add(meta.missionAnchorKey)
			}
			if (meta.isCompressedLidarAnchor) {
				compressedLidarStems.add(meta.lineageStem)
				compressedLidarMissionKeys.add(meta.missionAnchorKey)
			}
		}
	}

	return {
		compressedBagStems,
		compressedBagMissionKeys,
		compressedLidarStems,
		compressedLidarMissionKeys,
	}
}

/**
 * Determine primary family for a heterogeneous robotics cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'robot-kinematics-calibration')) {
		return 'robot-kinematics-calibration'
	}
	if (members.some(m => m.family === 'rosbag-mcap-telemetry')) {
		return 'rosbag-mcap-telemetry'
	}
	if (members.some(m => m.family === 'lidar-point-cloud')) {
		return 'lidar-point-cloud'
	}
	return 'colcon-sim-scratch'
}

/**
 * Compute deterministic survivor priority score for a Robotics vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-mission-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedKinematicsCalibration ? 98000 : 0)
			+ (member.isProtectedCompressedRosbag ? 94000 : 0)
			+ (member.isProtectedLidarCapture ? 92000 : 0)
			+ (member.isCanonicalMissionPath ? 25000 : 0)
			+ (member.isSimBuildScratchPath ? -55000 : 0)
			+ ((member.isUncompressedRosbagFile || member.isUncompressedLasFile) ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-calibration-first') {
		return (member.isProtectedKinematicsCalibration ? 98000 : 0)
			+ (member.isProtectedCompressedRosbag ? 94000 : 0)
			+ (member.isProtectedLidarCapture ? 92000 : 0)
			+ (member.isSimBuildScratchPath ? -50000 : 0)
			+ ((member.isUncompressedRosbagFile || member.isUncompressedLasFile) ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedKinematicsCalibration ? 50000 : 0)
			+ (member.isProtectedCompressedRosbag ? 48000 : 0)
			+ (member.isProtectedLidarCapture ? 46000 : 0)
			+ (member.isSimBuildScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedKinematicsCalibration ? 99000 : 0)
		+ (member.isProtectedCompressedRosbag ? 95000 : 0)
		+ (member.isProtectedLidarCapture ? 93000 : 0)
		+ (member.isCanonicalMissionPath ? 25000 : 0)
		+ ((member.isUncompressedRosbagFile || member.isUncompressedLasFile) ? -45000 : 0)
		+ (member.isSimBuildScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Robotics, ROS2 Bags & LiDAR duplicate cluster.
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
		const meta = classifyRoboticsRosFile(file, referenceNowMs)
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
	const primaryPlatform = rawMembers.find(m => m.roboticsPlatform)?.roboticsPlatform || ''
	const primaryStage = rawMembers.find(m => m.pipelineStage)?.pipelineStage || ''
	const primaryStem = rawMembers[0].lineageStem || extractRoboticsLineageStem(primaryName, rawMembers[0].normalized)
	const primaryMissionKey = rawMembers[0].missionAnchorKey || extractMissionAnchorKey(primaryStem)

	const hasCompressedBagAnchor = Boolean(
		rawMembers.some(m => m.isCompressedBagAnchor)
		|| correlationIndex.compressedBagStems.has(primaryStem)
		|| correlationIndex.compressedBagMissionKeys.has(primaryMissionKey)
	)

	const hasCompressedLidarAnchor = Boolean(
		rawMembers.some(m => m.isCompressedLidarAnchor)
		|| correlationIndex.compressedLidarStems.has(primaryStem)
		|| correlationIndex.compressedLidarMissionKeys.has(primaryMissionKey)
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

		const isRedundantBagMember = member.isUncompressedRosbagFile && hasCompressedBagAnchor
		const isRedundantLasMember = member.isUncompressedLasFile && hasCompressedLidarAnchor
		const isRedundantUncompressedMember = isRedundantBagMember || isRedundantLasMember

		let redundancyReason = ''
		if (member.isUncompressedRosbagFile) {
			redundancyReason = isRedundantBagMember
				? 'Uncompressed .bag/.db3/.mcap duplicates verified .mcap.zst/.bag.lz4/.db3.zst archive'
				: 'Uncompressed .bag/.db3/.mcap without verified compressed archive anchor'
		} else if (member.isUncompressedLasFile) {
			redundancyReason = isRedundantLasMember
				? 'Uncompressed .las duplicates verified .laz/.copc.laz compressed point cloud anchor'
				: 'Uncompressed .las without verified .laz compressed point cloud anchor'
		}

		let governanceTier = 'colcon-sim-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isProtectedKinematicsCalibration
				? 'kinematics-calibration-protected'
				: (member.isProtectedCompressedRosbag
					? 'compressed-rosbag-protected'
					: (member.isProtectedLidarCapture
						? 'lidar-pointcloud-protected'
						: ((member.isUncompressedRosbagFile || member.isUncompressedLasFile)
							? 'uncompressed-bag-las-redundant'
							: 'colcon-sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedKinematicsCalibration && config.protectKinematicsAndCalibration) {
			governanceTier = 'kinematics-calibration-protected'
			shielded = true
			protectedReason = 'Robot URDF/XACRO kinematics and sensor calibration strictly conserved'
		} else if (member.isProtectedCompressedRosbag && config.protectCompressedRosbags) {
			governanceTier = 'compressed-rosbag-protected'
			shielded = true
			protectedReason = 'Compressed ROS2/MCAP telemetry archive strictly conserved'
		} else if (member.isProtectedLidarCapture && config.protectCanonicalLidarCaptures) {
			governanceTier = 'lidar-pointcloud-protected'
			shielded = true
			protectedReason = member.isCompressedLidarAnchor
				? 'Compressed LiDAR archive (.laz/.copc.laz) strictly conserved'
				: 'Canonical 3D LiDAR capture (.e57/.pcd/.ply) strictly conserved'
		} else if (isSurvivor && !(isRedundantUncompressedMember)) {
			governanceTier = member.isProtectedKinematicsCalibration
				? 'kinematics-calibration-protected'
				: (member.isProtectedCompressedRosbag
					? 'compressed-rosbag-protected'
					: (member.isProtectedLidarCapture
						? 'lidar-pointcloud-protected'
						: ((member.isUncompressedRosbagFile || member.isUncompressedLasFile)
							? 'uncompressed-bag-las-redundant'
							: 'colcon-sim-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Robotics & ROS2 vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = (member.isUncompressedRosbagFile || member.isUncompressedLasFile)
				? 'uncompressed-bag-las-redundant'
				: (member.isProtectedKinematicsCalibration
					? 'kinematics-calibration-protected'
					: 'colcon-sim-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-bags-and-lidar' && !member.isMutableFile && !member.isSimBuildScratchPath
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
			config.keepRecentMissionDays > 0
			&& member.isSimBuildScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentMissionDays
		) {
			governanceTier = 'colcon-sim-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentMissionDays}-day active mission retention window`
		} else if (member.isUncompressedRosbagFile || member.isUncompressedLasFile) {
			governanceTier = 'uncompressed-bag-las-redundant'
			const hasRequiredAnchor = member.isUncompressedRosbagFile ? hasCompressedBagAnchor : hasCompressedLidarAnchor
			if (config.requireCompressedAnchorForPrune && !hasRequiredAnchor) {
				shielded = true
				protectedReason = member.isUncompressedRosbagFile
					? 'Blocked until a verified .mcap.zst/.bag.lz4/.db3.zst archive anchor exists'
					: 'Blocked until a verified .laz/.copc.laz archive anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isSimBuildScratchPath) {
			governanceTier = 'colcon-sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Colcon/Gazebo/Isaac simulation scratch eligible for safe cleanup'
		} else if (member.isProtectedCompressedRosbag || member.isProtectedLidarCapture) {
			governanceTier = member.isProtectedCompressedRosbag ? 'compressed-rosbag-protected' : 'lidar-pointcloud-protected'
			action = config.strategy === 'hardlink-immutable-bags-and-lidar' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-bags-and-lidar' && !member.isMutableFile) {
			governanceTier = 'compressed-rosbag-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'colcon-sim-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantBagMember,
			isRedundantLasMember,
			isRedundantUncompressedMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUncompressedBagOrLas = members.some(m => m.isRedundantUncompressedMember || m.isUncompressedRosbagFile || m.isUncompressedLasFile)
	const hasSimScratchIntermediate = members.some(m => m.isSimBuildScratchPath)
	const hasProtectedKinematicsCalibration = members.some(m => m.governanceTier === 'kinematics-calibration-protected')
	const hasProtectedCompressedRosbag = members.some(m => m.governanceTier === 'compressed-rosbag-protected')
	const hasProtectedLidarCapture = members.some(m => m.governanceTier === 'lidar-pointcloud-protected')

	let clusterVerdict = 'colcon-sim-scratch-intermediate'
	if (members.some(m => m.isRedundantUncompressedMember)) {
		clusterVerdict = 'uncompressed-bag-las-redundant'
	} else if (hasProtectedKinematicsCalibration) {
		clusterVerdict = 'kinematics-calibration-protected'
	} else if (hasProtectedCompressedRosbag) {
		clusterVerdict = 'compressed-rosbag-protected'
	} else if (hasProtectedLidarCapture) {
		clusterVerdict = 'lidar-pointcloud-protected'
	} else if (hasSimScratchIntermediate) {
		clusterVerdict = 'colcon-sim-scratch-intermediate'
	} else if (hasRedundantUncompressedBagOrLas) {
		clusterVerdict = 'uncompressed-bag-las-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const roboticsTags = Array.from(new Set(members.map(m => m.roboticsTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantUncompressedMember) ? 125 : 0)
		+ (hasSimScratchIntermediate ? 110 : 0)
		+ (hasProtectedKinematicsCalibration ? 95 : 0)
		+ (hasProtectedCompressedRosbag ? 90 : 0)
		+ (hasProtectedLidarCapture ? 85 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		roboticsPlatform: primaryPlatform,
		pipelineStage: primaryStage,
		lineageStem: primaryStem,
		missionAnchorKey: primaryMissionKey,
		family,
		familyLabel: ROBOTICS_ROS_FAMILY_META[family]?.label || family,
		clusterVerdict,
		riskScore,
		unitBytes,
		formattedUnitBytes: formatBytes(unitBytes),
		totalBytes,
		formattedTotalBytes: formatBytes(totalBytes),
		reclaimableBytes,
		formattedReclaimableBytes: formatBytes(reclaimableBytes),
		hardlinkSavingsBytes,
		copyCount: members.length,
		reclaimableTargetsCount: deleteTargetsCount + hardlinkTargetsCount,
		deleteTargetsCount,
		hardlinkTargetsCount,
		shieldedCount,
		hasReclaimable,
		survivorPath: survivor.normalized,
		hasProtectedKinematicsCalibration,
		hasProtectedCompressedRosbag,
		hasProtectedLidarCapture,
		hasRedundantUncompressedBagOrLas,
		hasSimScratchIntermediate,
		hasCompressedBagAnchor,
		hasCompressedLidarAnchor,
		roboticsTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Robotics, Autonomous Systems, ROS2 Bags & LiDAR Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditRoboticsRosVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeRoboticsRosConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isRoboticsRosGroup)
	const correlationIndex = buildRoboticsRosCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'robot-kinematics-calibration': 0,
		'rosbag-mcap-telemetry': 0,
		'lidar-point-cloud': 0,
		'colcon-sim-scratch': 0,
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
		if (config.verdictFilter === 'reclaimable' && !cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'shielded' && cluster.hasReclaimable) {
			return false
		}
		if (config.verdictFilter === 'uncompressed-bag-las-redundant' && !cluster.hasRedundantUncompressedBagOrLas) {
			return false
		}
		if (config.verdictFilter === 'colcon-sim-scratch-intermediate' && !cluster.hasSimScratchIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'uncompressed-bag-las-redundant'
			&& config.verdictFilter !== 'colcon-sim-scratch-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.lineageStem.toLowerCase().includes(query)
			const matchesPlatform = cluster.roboticsPlatform.toLowerCase().includes(query)
			const matchesStage = cluster.pipelineStage.toLowerCase().includes(query)
			const matchesTag = cluster.roboticsTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesPlatform && !matchesStage && !matchesTag && !matchesMember) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (config.sortMode === 'risk_desc') {
			return (b.riskScore - a.riskScore) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'copies_desc') {
			return (b.copyCount - a.copyCount) || (b.reclaimableBytes - a.reclaimableBytes) || a.name.localeCompare(b.name)
		}
		if (config.sortMode === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		return (b.reclaimableBytes - a.reclaimableBytes) || (b.totalBytes - a.totalBytes) || a.name.localeCompare(b.name)
	})

	let rawDuplicateBytes = 0
	let reclaimableBytes = 0
	let totalReclaimableCopiesCount = 0
	let totalShieldedCopiesCount = 0
	let totalKinematicsClusters = 0
	let totalCompressedRosbagClusters = 0
	let totalLidarClusters = 0
	let totalRedundantBagLasClusters = 0
	let totalSimScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedKinematicsCalibration) {
			totalKinematicsClusters += 1
		}
		if (cluster.hasProtectedCompressedRosbag) {
			totalCompressedRosbagClusters += 1
		}
		if (cluster.hasProtectedLidarCapture) {
			totalLidarClusters += 1
		}
		if (cluster.hasRedundantUncompressedBagOrLas) {
			totalRedundantBagLasClusters += 1
		}
		if (cluster.hasSimScratchIntermediate) {
			totalSimScratchClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = ROBOTICS_ROS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ROBOTICS_ROS_FAMILY_META[id].label,
			shortLabel: ROBOTICS_ROS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ROBOTICS_ROS_VAULT_SCHEMA,
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
			totalKinematicsClusters,
			totalCompressedRosbagClusters,
			totalLidarClusters,
			totalRedundantBagLasClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Robotics & ROS2 vaults.
 * Strictly blocks deletion or hardlinking of shielded URDF/calibration, compressed MCAP.ZST/BAG.LZ4,
 * and canonical LiDAR captures, and never hardlinks mutable files or simulation scratch.
 *
 * @param {object} auditResult Result from auditRoboticsRosVault.
 * @return {string} POSIX bash script.
 */
export function buildRoboticsRosRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./robotics-ros-vault-reclaim.sh only after verifying URDF/calibration, MCAP.ZST, and LAZ anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.robotics-ros-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-uncompressed-bags-and-sim-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isSimBuildScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-uncompressed-bags-and-scratch' && (target.isUncompressedRosbagFile || target.isUncompressedLasFile || target.isSimBuildScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable uncompressed .bag/.db3/.mcap/.las files or Colcon/Gazebo scratch under active vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Robotics & ROS2 Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditRoboticsRosVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildRoboticsRosCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'robotics_platform',
		'pipeline_stage',
		'lineage_stem',
		'mission_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_bag_anchor',
		'has_compressed_lidar_anchor',
		'is_redundant_uncompressed',
		'is_sim_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'robotics_tag',
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
				cluster.roboticsPlatform || '',
				cluster.pipelineStage || '',
				cluster.lineageStem,
				cluster.missionAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedBagAnchor ? 'true' : 'false',
				cluster.hasCompressedLidarAnchor ? 'true' : 'false',
				member.isRedundantUncompressedMember ? 'true' : 'false',
				member.isSimBuildScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.roboticsTag || '',
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
 * @param {object} auditResult Result from auditRoboticsRosVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildRoboticsRosJsonManifest(auditResult) {
	const payload = {
		schema: ROBOTICS_ROS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ROBOTICS_ROS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			roboticsPlatform: cluster.roboticsPlatform,
			pipelineStage: cluster.pipelineStage,
			lineageStem: cluster.lineageStem,
			missionAnchorKey: cluster.missionAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedKinematicsCalibration: cluster.hasProtectedKinematicsCalibration,
			hasProtectedCompressedRosbag: cluster.hasProtectedCompressedRosbag,
			hasProtectedLidarCapture: cluster.hasProtectedLidarCapture,
			hasRedundantUncompressedBagOrLas: cluster.hasRedundantUncompressedBagOrLas,
			hasSimScratchIntermediate: cluster.hasSimScratchIntermediate,
			hasCompressedBagAnchor: cluster.hasCompressedBagAnchor,
			hasCompressedLidarAnchor: cluster.hasCompressedLidarAnchor,
			roboticsTags: cluster.roboticsTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				roboticsTag: member.roboticsTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantBagMember: member.isRedundantBagMember,
				isRedundantLasMember: member.isRedundantLasMember,
				isRedundantUncompressedMember: member.isRedundantUncompressedMember,
				isSimBuildScratchPath: member.isSimBuildScratchPath,
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
 * cloud sync of Colcon build dirs, Gazebo/Isaac caches, SLAM temp stores,
 * and transient ROS2 SQLite WAL/SHM/index files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildRoboticsRosSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Robotics, ROS2 Bags & LiDAR Vaults',
		'colcon_build/',
		'ros_build/',
		'ros2_ws/build/',
		'ros2_ws/install/',
		'ros2_ws/log/',
		'catkin_ws/build/',
		'catkin_ws/devel/',
		'gazebo_cache/',
		'.gazebo/',
		'isaac_cache/',
		'slam_tmp/',
		'rosbag_extract/',
		'extracted_frames/',
		'pointcloud_tmp/',
		'nav2_costmap_tmp/',
		'*.db3-wal',
		'*.db3-shm',
		'*.rosbag_idx',
		'*.simcache',
		'*.colcon_cache',
		'*.tmp',
	].join('\n')
}
