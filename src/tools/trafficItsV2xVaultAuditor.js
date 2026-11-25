/**
 * Pure Traffic ITS, V2X Connected Mobility & Corridor Signal Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Traffic ITS & V2X Vault families:
 * - V2X PKI, Timing & Safety Holds (.scms, .oer, .uper, .asn, .ntcip, .spat, .map, .timing, plus XML/JSON/YAML/SQLite/CSV in SCMS/PKI/signal-timing/safety-hold context)
 * - Verified V2X, Loop & Simulation Masters (.blf, .mf4, .pcapng, .inpx, .vissim, .layx, .sumocfg, .net.xml, .rou.xml, .wim, .pvr, .xodr, .trj, .datex2)
 * - Redundant Corridor Heatmaps & Report Exports (.png, .jpg, .svg, .pdf, .csv, .tsv, .txt, .json, .jsonl, .xlsx, .mp4, .fcd.xml in traffic/ITS/V2X export context)
 * - SUMO, VISSIM & RSU Stream Scratch (sumo_tmp/, vissim_scratch/, rsu_spool/, obu_cache/, anpr_staging/, fcd_tmp/, spat_cache/, loop_staging/, .rou.tmp, .fcd.tmp, .blf.part, .inpx.bak, .pcapng.tmp, .lck)
 *
 * Enforces strict V2X PKI/SCMS, NTCIP Signal Timing, Corridor Safety Hold, and V2X/Loop Master defaults:
 * - Strictly conserves SCMS/ETSI PKI trust anchors, corridor crash/incident litigation holds, and safety audit freezes
 * - Strictly conserves SAE J2735 / ETSI ITS-G5 ASN.1 schemas, SPaT/MAP baselines, and NTCIP signal timing plans
 * - Strictly conserves verified RSU/OBU PCAPNG/BLF/MF4 captures, WIM/PVR loop records, and OpenDRIVE/SUMO/VISSIM network masters
 * - Detects redundant LOS heatmaps, speed-contour plots, turn-movement PDFs, and FCD/CSV reports when a verified V2X/Loop/Sim anchor exists
 * - Blocks pruning of derived corridor exports lacking a verified V2X/Loop/Sim master anchor when guard is active
 * - Blocks hardlinks on mutable timing plans, SUMO/VISSIM/OpenDRIVE XML models, CSV/JSON/PDF exports, and simulation/RSU scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const TRAFFIC_ITS_V2X_VAULT_SCHEMA = 'duplicatefinder.traffic-its-v2x-vault-auditor.v1'

export const TRAFFIC_ITS_V2X_FAMILIES = Object.freeze([
	'all',
	'v2x-pki-signal-timing-holds',
	'traffic-v2x-telemetry-masters',
	'redundant-corridor-report-exports',
	'sumo-vissim-rsu-scratch',
])

export const TRAFFIC_ITS_V2X_FAMILY_META = Object.freeze({
	'v2x-pki-signal-timing-holds': {
		id: 'v2x-pki-signal-timing-holds',
		label: 'V2X PKI, Timing & Holds',
		shortLabel: 'SCMS/ETSI PKI Certs, J2735/SPaT/MAP Schemas, NTCIP Timing Plans & Safety Holds (.scms, .oer, .ntcip, .spat, .timing)',
	},
	'traffic-v2x-telemetry-masters': {
		id: 'traffic-v2x-telemetry-masters',
		label: 'V2X, Loop & Sim Masters',
		shortLabel: 'Verified Captures & Models (.blf, .mf4, .pcapng, .wim, .pvr, .sumocfg, .net.xml, .inpx, .xodr, .datex2)',
	},
	'redundant-corridor-report-exports': {
		id: 'redundant-corridor-report-exports',
		label: 'Heatmaps & Corridor Exports',
		shortLabel: 'Derived LOS Heatmaps, Speed Contours, Turn-Count PDFs, FCD/CSV Reports & Clip Previews (.png, .pdf, .csv, .fcd.xml, .mp4)',
	},
	'sumo-vissim-rsu-scratch': {
		id: 'sumo-vissim-rsu-scratch',
		label: 'SUMO, VISSIM & RSU Scratch',
		shortLabel: 'Simulation & Roadside Scratch (sumo_tmp/, vissim_scratch/, rsu_spool/, fcd_tmp/, .rou.tmp, .blf.part, .inpx.bak)',
	},
})

export const TRAFFIC_ITS_V2X_STRATEGIES = Object.freeze([
	'prune-exports-and-rsu-scratch',
	'hardlink-immutable-v2x-and-loop-masters',
	'quarantine-exports-and-rsu-scratch',
])

export const TRAFFIC_ITS_V2X_SURVIVOR_RULES = Object.freeze([
	'pki-timing-master-first',
	'oldest-corridor-capture-first',
	'newest-calibration-pass-first',
	'shortest-path',
])

export const TRAFFIC_ITS_V2X_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'v2x-pki-timing-protected',
	'traffic-telemetry-master-protected',
	'corridor-safety-hold-protected',
	'corridor-export-redundant',
	'its-sim-rsu-scratch',
	'shielded',
])

export const TRAFFIC_ITS_V2X_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const TRAFFIC_ITS_V2X_PRESETS = Object.freeze([
	{
		id: 'all-traffic-its-v2x-audit',
		name: 'All Traffic & V2X Vaults',
		description: 'Audit V2X PKI/timing/safety holds, RSU/loop/SUMO/VISSIM masters, redundant corridor reports, and SUMO/VISSIM/RSU scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-rsu-scratch',
		survivorRule: 'pki-timing-master-first',
		protectPkiAndTimingPlans: true,
		protectTelemetryAndSimMasters: true,
		protectCorridorSafetyHolds: true,
		requireTrafficAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'sumo-vissim-rsu-scratch-cleanup',
		name: 'SUMO, VISSIM & RSU Scratch',
		description: 'Reclaim sumo_tmp/, vissim_scratch/, rsu_spool/, obu_cache/, fcd_tmp/, and .rou.tmp/.blf.part scratch older than the active corridor window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-rsu-scratch',
		survivorRule: 'pki-timing-master-first',
		protectPkiAndTimingPlans: true,
		protectTelemetryAndSimMasters: true,
		protectCorridorSafetyHolds: true,
		requireTrafficAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-corridor-exports-vs-masters',
		name: 'Heatmaps & Reports vs Masters',
		description: 'Detect derived LOS heatmaps, speed-contour PNGs, turn-movement PDFs, and FCD/CSV reports backed by a verified V2X, WIM/PVR, or SUMO/VISSIM anchor.',
		familyFilter: 'redundant-corridor-report-exports',
		strategy: 'quarantine-exports-and-rsu-scratch',
		survivorRule: 'pki-timing-master-first',
		protectPkiAndTimingPlans: true,
		protectTelemetryAndSimMasters: true,
		protectCorridorSafetyHolds: true,
		requireTrafficAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'v2x-pki-signal-timing-shield',
		name: 'V2X PKI & Timing Holds Shield',
		description: 'Inspect corridor crash/safety holds, SCMS/ETSI PKI trust anchors, J2735 SPaT/MAP schemas, and NTCIP signal timing plans under strict conservation shield.',
		familyFilter: 'v2x-pki-signal-timing-holds',
		strategy: 'hardlink-immutable-v2x-and-loop-masters',
		survivorRule: 'pki-timing-master-first',
		protectPkiAndTimingPlans: true,
		protectTelemetryAndSimMasters: true,
		protectCorridorSafetyHolds: true,
		requireTrafficAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-v2x-loop-sim-masters',
		name: 'V2X, Loop & Sim Masters',
		description: 'Audit verified BLF/MF4/PCAPNG roadside captures, WIM/PVR loop logs, OpenDRIVE geometry, and calibrated SUMO/VISSIM network masters.',
		familyFilter: 'traffic-v2x-telemetry-masters',
		strategy: 'hardlink-immutable-v2x-and-loop-masters',
		survivorRule: 'pki-timing-master-first',
		protectPkiAndTimingPlans: true,
		protectTelemetryAndSimMasters: true,
		protectCorridorSafetyHolds: true,
		requireTrafficAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const TRAFFIC_ITS_V2X_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-traffic-its-v2x-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-rsu-scratch',
	survivorRule: 'pki-timing-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectPkiAndTimingPlans: true,
	protectTelemetryAndSimMasters: true,
	protectCorridorSafetyHolds: true,
	requireTrafficAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_TRAFFIC_PKI_TIMING_EXT_RE = /\.(?:scms|oer|uper|asn|ntcip|spat|map|timing)$/i
const CONTEXT_TRAFFIC_TIMING_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt)$/i
const STRICT_TRAFFIC_MASTER_EXT_RE = /\.(?:blf|mf4|pcapng|inpx|vissim|layx|sumocfg|net\.xml|rou\.xml|wim|pvr|xodr|trj|datex2)$/i
const CONTEXT_TRAFFIC_TELEMETRY_EXT_RE = /\.(?:pcap|cap|parquet|h5|hdf5|bin|dat)$/i
const CONTEXT_TRAFFIC_EXPORT_EXT_RE = /\.(?:png|jpg|jpeg|webp|svg|pdf|csv|tsv|txt|json|jsonl|xlsx|mp4|fcd\.xml)$/i
const STRICT_TRAFFIC_SCRATCH_EXT_RE = /\.(?:rou\.tmp|fcd\.tmp|net\.tmp|blf\.part|mf4\.part|pcapng\.tmp|inpx\.bak|sumocfg\.bak|vissim\.tmp|rsu\.part|obu\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_TRAFFIC_EXCLUSION_RE = /(?:speech|bioacoustic|textgrid|rttm|kaldi|espnet|guano|railway|etcs|ertms|cbtc|otmr|railml|eurobalise|interlocking|quantum|qubit|qasm|bluefors|geant4|cmssw|cern|synchrotron|orbital|ccsds|electrophys|bids|dicom|nifti|hydrograph|multibeam|seismic|segy|qiskit|laboneq|rosbag|gazebo|autoware|bms_can|hil_dyno|ev_powertrain|tbm_tunnel|geosensor|inclinometer|photoshop|lightroom|premiere|davinci|protools|logicpro|ableton|cubase|vst3|gdsii|oasis)/i
const TRAFFIC_CONTEXT_HINT_RE = /(?:v2x|its[-_]?g5|j2735|scms|spat|bsm|denm|cam_msg|ntcip|rsu|obu|corridor|intersection|signal_?timing|traffic|sumo|vissim|ptv|opendrive|xodr|wim|weigh_?in_?motion|loop_?detector|utmc|datex2|anpr|toll_?gantry|fcd|turn_?movement|level_?of_?service)/i
const TRAFFIC_SAFETY_HOLD_PATH_RE = /(?:corridor_?hold|safety_?hold|crash_?hold|incident_?hold|litigation_?hold|v2x_?pki_?hold|scms_?hold|dot_?audit_?hold|vision_?zero_?hold|enforcement_?hold)/i
const TRAFFIC_BASELINE_PATH_RE = /(?:00_pki|00_scms|00_timing|00_ntcip|00_j2735|scms_certs|signal_timing_baselines|asn1_schemas|spat_map_baselines|corridor_manifests)/i
const TRAFFIC_SCRATCH_PATH_RE = /(?:sumo_tmp|vissim_scratch|rsu_spool|obu_cache|anpr_staging|fcd_tmp|spat_cache|loop_staging|v2x_scratch|traffic_tmp|utmc_cache|toll_staging)/i
const TRAFFIC_INTERMEDIATE_PREFIX_RE = /^(?:tmp_sumo_|tmp_vissim_|tmp_rsu_|tmp_obu_|tmp_fcd_|tmp_spat_|tmp_loop_|tmp_anpr_|cache_v2x_|spool_rsu_)/i
const TRAFFIC_INTERMEDIATE_SUFFIX_RE = /(?:_sumo_tmp|_vissim_tmp|_rsu_spool|_fcd_tmp|_spat_tmp|_staging)$/i
const TRAFFIC_EXPORT_PATH_RE = /(?:corridor_heatmaps|los_heatmaps|speed_contours|turn_movement_pdfs|travel_time_reports|fcd_exports|anpr_previews|_heatmap|_speed_contour|_turn_count|_los_report|_travel_time|_fcd_export|_clip_preview)/i
const CANONICAL_TRAFFIC_VAULT_PATH_RE = /(?:00_raw|00_v2x|00_rsu|00_loop|00_sim|00_masters|canonical|corridor_archive|v2x_archive|its_archive)/i

/**
 * Normalize configuration values for Traffic ITS, V2X & Corridor Signal Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeTrafficItsV2xConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = TRAFFIC_ITS_V2X_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.familyFilter
	const verdictFilter = TRAFFIC_ITS_V2X_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.verdictFilter
	const strategy = TRAFFIC_ITS_V2X_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.strategy
	const survivorRule = TRAFFIC_ITS_V2X_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.survivorRule
	const sortMode = TRAFFIC_ITS_V2X_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: TRAFFIC_ITS_V2X_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : TRAFFIC_ITS_V2X_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectPkiAndTimingPlans: cfg.protectPkiAndTimingPlans !== undefined ? Boolean(cfg.protectPkiAndTimingPlans) : true,
		protectTelemetryAndSimMasters: cfg.protectTelemetryAndSimMasters !== undefined ? Boolean(cfg.protectTelemetryAndSimMasters) : true,
		protectCorridorSafetyHolds: cfg.protectCorridorSafetyHolds !== undefined ? Boolean(cfg.protectCorridorSafetyHolds) : true,
		requireTrafficAnchorForPrune: cfg.requireTrafficAnchorForPrune !== undefined ? Boolean(cfg.requireTrafficAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized corridor, intersection, or simulation run stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized corridor/V2X stem.
 */
export function extractTrafficItsV2xStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:rou\.tmp|fcd\.tmp|net\.tmp|blf\.part|mf4\.part|pcapng\.tmp|inpx\.bak|sumocfg\.bak|vissim\.tmp|rsu\.part|obu\.tmp|net\.xml|rou\.xml|fcd\.xml)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(TRAFFIC_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(TRAFFIC_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:heatmap|speed_contour|turn_count|los_report|travel_time|fcd_export|clip_preview|contour|los|summary|export|csv|jsonl|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'corridor-session'
}

/**
 * Extract canonical anchor key linking derived heatmaps/reports/FCD exports to verified V2X/Loop/Sim anchors.
 *
 * @param {string} corridorStem Extracted corridor/V2X stem.
 * @return {string} Canonical anchor key.
 */
export function extractTrafficItsV2xAnchorKey(corridorStem) {
	return String(corridorStem || 'corridor-session')
		.toLowerCase()
		.replace(/(?:[-_](?:blf|mf4|pcapng|inpx|vissim|layx|sumocfg|net|rou|wim|pvr|xodr|trj|datex2|scms|oer|uper|asn|ntcip|spat|map|timing|heatmap|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'corridor-session'
}

/**
 * Detect Traffic ITS & V2X toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ trafficToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractTrafficToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let trafficToolchain = ''
	if (/\.(?:scms|oer|uper|asn)\b|scms|j2735|its[-_]?g5|bsm|denm/.test(text)) {
		trafficToolchain = 'SAE J2735 / ETSI ITS-G5 & SCMS PKI'
	} else if (/\.(?:ntcip|spat|map|timing)\b|ntcip|signal_?timing/.test(text)) {
		trafficToolchain = 'NTCIP 1202 / SPaT & Signal Timing'
	} else if (/\.(?:sumocfg|net\.xml|rou\.xml|fcd\.xml)\b|sumo/.test(text)) {
		trafficToolchain = 'Eclipse SUMO Microscopic Traffic Sim'
	} else if (/\.(?:inpx|vissim|layx|trj)\b|vissim|ptv/.test(text)) {
		trafficToolchain = 'PTV VISSIM / Visum Corridor Sim'
	} else if (/\.xodr\b|opendrive/.test(text)) {
		trafficToolchain = 'ASAM OpenDRIVE Corridor Geometry'
	} else if (/\.(?:wim|pvr|datex2)\b|weigh_?in_?motion|loop_?detector|utmc|datex2/.test(text)) {
		trafficToolchain = 'WIM / Inductive Loop & DATEX II'
	} else if (/\.(?:blf|mf4|pcapng)\b|rsu|obu/.test(text)) {
		trafficToolchain = 'RSU / OBU Roadside V2X Capture'
	} else if (/corridor_?hold|safety_?hold|crash_?hold|vision_?zero/.test(text)) {
		trafficToolchain = 'DOT Corridor Safety & Incident Hold'
	}

	let workflowStage = ''
	if (TRAFFIC_SAFETY_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Corridor Safety & Incident Hold'
	} else if (STRICT_TRAFFIC_PKI_TIMING_EXT_RE.test(basename) || TRAFFIC_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'V2X PKI, Schema & Signal Timing Baseline'
	} else if (TRAFFIC_SCRATCH_PATH_RE.test(text) || STRICT_TRAFFIC_SCRATCH_EXT_RE.test(basename) || TRAFFIC_INTERMEDIATE_PREFIX_RE.test(basename) || TRAFFIC_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'SUMO, VISSIM & RSU Stream Scratch'
	} else if (TRAFFIC_EXPORT_PATH_RE.test(text) || (CONTEXT_TRAFFIC_EXPORT_EXT_RE.test(basename) && TRAFFIC_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Heatmap, FCD or Corridor Report'
	} else if (STRICT_TRAFFIC_MASTER_EXT_RE.test(basename) || (CONTEXT_TRAFFIC_TELEMETRY_EXT_RE.test(basename) && (TRAFFIC_CONTEXT_HINT_RE.test(text) || CANONICAL_TRAFFIC_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified V2X, Loop or Sim Master'
	}

	return { trafficToolchain, workflowStage }
}

/**
 * Extract concise Traffic ITS & V2X domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractTrafficDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (TRAFFIC_SAFETY_HOLD_PATH_RE.test(text)) {
		return 'CORRIDOR SAFETY HOLD'
	}
	if (/\.(?:scms|oer|uper|asn)\b/.test(lowerBase)) {
		return 'V2X PKI / J2735'
	}
	if (/\.(?:ntcip|spat|map|timing)\b/.test(lowerBase)) {
		return 'NTCIP / SPAT TIMING'
	}
	if (/\.(?:sumocfg|net\.xml|rou\.xml)\b/.test(lowerBase)) {
		return 'SUMO NETWORK'
	}
	if (/\.(?:inpx|vissim|layx|trj)\b/.test(lowerBase)) {
		return 'PTV VISSIM'
	}
	if (/\.xodr$/i.test(lowerBase)) {
		return 'OPENDRIVE XODR'
	}
	if (/\.(?:wim|pvr|datex2)\b/.test(lowerBase)) {
		return 'WIM / LOOP / DATEX2'
	}
	if (/\.(?:blf|mf4|pcapng)\b/.test(lowerBase)) {
		return 'RSU / OBU CAPTURE'
	}
	if (STRICT_TRAFFIC_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'SIM / RSU SCRATCH'
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
 * Classify a single file within the Traffic ITS, V2X Connected Mobility & Corridor Signal domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyTrafficItsV2xFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_TRAFFIC_EXCLUSION_RE.test(lower)
	const hasTrafficContext = !hasExcludedContext && TRAFFIC_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && TRAFFIC_BASELINE_PATH_RE.test(lower)
	const isSafetyHoldPath = !hasExcludedContext && TRAFFIC_SAFETY_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_TRAFFIC_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && TRAFFIC_SCRATCH_PATH_RE.test(lower)
	const isTrafficExportPath = !hasExcludedContext && TRAFFIC_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_TRAFFIC_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (TRAFFIC_INTERMEDIATE_PREFIX_RE.test(lowerBase) || TRAFFIC_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isPkiOrTimingHold = !hasExcludedContext && (
		STRICT_TRAFFIC_PKI_TIMING_EXT_RE.test(lowerBase)
		|| (CONTEXT_TRAFFIC_TIMING_EXT_RE.test(lowerBase) && !isTrafficExportPath && (isBaselinePath || isSafetyHoldPath))
	)

	const isContextTelemetryMaster = CONTEXT_TRAFFIC_TELEMETRY_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasTrafficContext || isCanonicalVaultPath)
	const isStrictTrafficMaster = !hasExcludedContext && (
		STRICT_TRAFFIC_MASTER_EXT_RE.test(lowerBase)
		|| isContextTelemetryMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictTrafficMaster
		&& !isPkiOrTimingHold
		&& CONTEXT_TRAFFIC_EXPORT_EXT_RE.test(lowerBase)
		&& (hasTrafficContext || isTrafficExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Traffic ITS & V2X Vault'
	let isProtectedPkiTiming = false
	let isProtectedTelemetryMaster = false
	let isProtectedSafetyHold = false
	let isTrafficMasterAnchor = false
	let isRedundantTrafficExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictTrafficMaster || isPkiOrTimingHold))
		|| (isIntermediateSubfile && (isStrictTrafficMaster || isContextExport || hasTrafficContext))
		|| (isGenericScratchExt && hasTrafficContext && !isBaselinePath && !isSafetyHoldPath)
	) {
		family = 'sumo-vissim-rsu-scratch'
		artifactKind = isStrictScratchExt
			? 'SUMO / VISSIM / BLF Scratch Artifact'
			: (isIntermediateSubfile ? 'RSU / FCD / SPaT Intermediate Cache' : 'Corridor Simulation & RSU Scratch')
		vaultRole = 'SUMO, VISSIM, RSU Spool or FCD Streaming Scratch'
		isMutableFile = true
	} else if (isSafetyHoldPath && (isPkiOrTimingHold || isStrictTrafficMaster || isContextExport || hasTrafficContext)) {
		family = 'v2x-pki-signal-timing-holds'
		artifactKind = 'Corridor Safety & Crash Hold'
		vaultRole = 'Protected DOT Safety, Crash Investigation or PKI Audit Hold'
		isProtectedSafetyHold = true
		isProtectedPkiTiming = true
		isTrafficMasterAnchor = isStrictTrafficMaster || isPkiOrTimingHold
		isMutableFile = true
	} else if (isPkiOrTimingHold) {
		family = 'v2x-pki-signal-timing-holds'
		if (/\.(?:scms|oer|uper|asn)$/i.test(lowerBase)) {
			artifactKind = 'SCMS / ETSI PKI & J2735 Schema'
			vaultRole = 'Canonical V2X Security Credential or ASN.1 Message Baseline'
		} else {
			artifactKind = 'NTCIP / SPaT Signal Timing Baseline'
			vaultRole = 'Canonical Intersection Controller Timing & Phase Plan'
		}
		isProtectedPkiTiming = true
		isTrafficMasterAnchor = true
		isMutableFile = true
	} else if (isStrictTrafficMaster) {
		family = 'traffic-v2x-telemetry-masters'
		if (/\.(?:sumocfg|net\.xml|rou\.xml|inpx|vissim|layx|xodr|trj)$/i.test(lowerBase)) {
			artifactKind = 'SUMO / VISSIM / OpenDRIVE Network Master'
			vaultRole = 'Mutable Calibrated Corridor Network & Demand Master'
			isMutableFile = true
		} else if (/\.datex2$/i.test(lowerBase)) {
			artifactKind = 'DATEX II Traffic Feed Master'
			vaultRole = 'Mutable Standardized Corridor Event & Incident Feed'
			isMutableFile = true
		} else if (/\.(?:wim|pvr)$/i.test(lowerBase)) {
			artifactKind = 'WIM / PVR Loop Record Master'
			vaultRole = 'Immutable Weigh-In-Motion & Per-Vehicle Loop Capture'
			isMutableFile = false
		} else {
			artifactKind = 'RSU / OBU V2X Telemetry Master'
			vaultRole = 'Immutable BLF, MF4, PCAPNG or HDF5 Roadside Capture'
			isMutableFile = false
		}
		isProtectedTelemetryMaster = true
		isTrafficMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-corridor-report-exports'
		if (/\.(?:png|jpg|jpeg|webp|svg|pdf)$/i.test(lowerBase)) {
			artifactKind = 'LOS Heatmap / Speed Contour / PDF Report'
		} else if (/\.mp4$/i.test(lowerBase)) {
			artifactKind = 'Intersection Simulation / ANPR Preview Clip'
		} else {
			artifactKind = 'Derived FCD / Travel-Time / Turn-Count Export'
		}
		vaultRole = 'Derived Corridor Heatmap, FCD Export or Preview Render'
		isRedundantTrafficExport = true
		isMutableFile = true
	}

	const { trafficToolchain, workflowStage } = extractTrafficToolchainAndStage(normalized, basename)
	const corridorStem = extractTrafficItsV2xStem(basename, normalized)
	const trafficAnchorKey = extractTrafficItsV2xAnchorKey(corridorStem)
	const trafficTag = extractTrafficDomainTag(lowerBase, lower)

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
		trafficToolchain,
		workflowStage,
		corridorStem,
		trafficAnchorKey,
		trafficTag,
		isProtectedPkiTiming,
		isProtectedTelemetryMaster,
		isProtectedSafetyHold,
		isTrafficMasterAnchor,
		isRedundantTrafficExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'sumo-vissim-rsu-scratch') || (isGenericScratchExt && hasTrafficContext && family === 'sumo-vissim-rsu-scratch'),
		isBaselinePath,
		isSafetyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Traffic ITS, V2X & Corridor Signal domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isTrafficItsV2xGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyTrafficItsV2xFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified PKI/Timing/V2X/Loop/Sim anchors
 * to derived corridor heatmaps, speed-contour plots, and FCD/CSV reports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildTrafficItsV2xCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyTrafficItsV2xFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isTrafficMasterAnchor) {
				anchorStems.add(meta.corridorStem)
				anchorKeys.add(meta.trafficAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Traffic ITS & V2X cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'v2x-pki-signal-timing-holds')) {
		return 'v2x-pki-signal-timing-holds'
	}
	if (members.some(m => m.family === 'traffic-v2x-telemetry-masters')) {
		return 'traffic-v2x-telemetry-masters'
	}
	if (members.some(m => m.family === 'redundant-corridor-report-exports')) {
		return 'redundant-corridor-report-exports'
	}
	return 'sumo-vissim-rsu-scratch'
}

/**
 * Compute deterministic survivor priority score for a Traffic ITS & V2X vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-corridor-capture-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedPkiTiming ? 97000 : 0)
			+ (member.isProtectedTelemetryMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantTrafficExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-calibration-pass-first') {
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedPkiTiming ? 97000 : 0)
			+ (member.isProtectedTelemetryMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantTrafficExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedSafetyHold ? 52000 : 0)
			+ (member.isProtectedPkiTiming ? 50000 : 0)
			+ (member.isProtectedTelemetryMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedSafetyHold ? 100000 : 0)
		+ (member.isProtectedPkiTiming ? 97000 : 0)
		+ (member.isProtectedTelemetryMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantTrafficExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Traffic ITS, V2X & Corridor Signal duplicate cluster.
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
		const meta = classifyTrafficItsV2xFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.trafficToolchain)?.trafficToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].corridorStem || extractTrafficItsV2xStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].trafficAnchorKey || extractTrafficItsV2xAnchorKey(primaryStem)

	const hasTrafficMasterAnchor = Boolean(
		rawMembers.some(m => m.isTrafficMasterAnchor)
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

		const isRedundantTrafficExportMember = member.isRedundantTrafficExport && hasTrafficMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantTrafficExport) {
			redundancyReason = isRedundantTrafficExportMember
				? 'Derived LOS heatmap, contour plot, or FCD/CSV export duplicates verified V2X, Loop, or SUMO/VISSIM master'
				: 'Derived corridor heatmap or report export without verified V2X, Loop, or Simulation anchor'
		}

		let governanceTier = 'its-sim-rsu-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedSafetyHold
				? 'corridor-safety-hold-protected'
				: (member.isProtectedPkiTiming
					? 'v2x-pki-timing-protected'
					: (member.isProtectedTelemetryMaster
						? 'traffic-telemetry-master-protected'
						: (member.isRedundantTrafficExport
							? 'corridor-export-redundant'
							: 'its-sim-rsu-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedSafetyHold && config.protectCorridorSafetyHolds) {
			governanceTier = 'corridor-safety-hold-protected'
			shielded = true
			protectedReason = 'DOT corridor safety, crash litigation, or Vision Zero hold strictly conserved'
		} else if (member.isProtectedPkiTiming && config.protectPkiAndTimingPlans) {
			governanceTier = 'v2x-pki-timing-protected'
			shielded = true
			protectedReason = 'V2X SCMS/ETSI PKI anchor, J2735 schema, or NTCIP signal timing baseline strictly conserved'
		} else if (member.isProtectedTelemetryMaster && config.protectTelemetryAndSimMasters) {
			governanceTier = 'traffic-telemetry-master-protected'
			shielded = true
			protectedReason = 'Verified BLF/MF4/PCAPNG RSU capture, WIM/PVR loop record, or SUMO/VISSIM master strictly conserved'
		} else if (isSurvivor && !isRedundantTrafficExportMember) {
			governanceTier = member.isProtectedSafetyHold
				? 'corridor-safety-hold-protected'
				: (member.isProtectedPkiTiming
					? 'v2x-pki-timing-protected'
					: (member.isProtectedTelemetryMaster
						? 'traffic-telemetry-master-protected'
						: (member.isRedundantTrafficExport
							? 'corridor-export-redundant'
							: 'its-sim-rsu-scratch')))
			shielded = true
			protectedReason = 'Canonical Traffic ITS & V2X vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantTrafficExport
				? 'corridor-export-redundant'
				: (member.isProtectedPkiTiming
					? 'v2x-pki-timing-protected'
					: 'its-sim-rsu-scratch')
			action = config.strategy === 'hardlink-immutable-v2x-and-loop-masters' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'its-sim-rsu-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active corridor simulation or RSU spool grace window`
		} else if (member.isRedundantTrafficExport) {
			governanceTier = 'corridor-export-redundant'
			if (config.requireTrafficAnchorForPrune && !hasTrafficMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified V2X, Loop, or SUMO/VISSIM master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'its-sim-rsu-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'SUMO, VISSIM, RSU spool, or FCD streaming scratch eligible for cleanup'
		} else if (member.isProtectedTelemetryMaster || member.isProtectedPkiTiming) {
			governanceTier = member.isProtectedPkiTiming ? 'v2x-pki-timing-protected' : 'traffic-telemetry-master-protected'
			action = config.strategy === 'hardlink-immutable-v2x-and-loop-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-v2x-and-loop-masters' && !member.isMutableFile) {
			governanceTier = 'traffic-telemetry-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'its-sim-rsu-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantTrafficExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantTrafficExport = members.some(m => m.isRedundantTrafficExportMember || m.isRedundantTrafficExport)
	const hasProtectedSafetyHold = members.some(m => m.governanceTier === 'corridor-safety-hold-protected' && m.shielded)
	const hasProtectedPkiTiming = members.some(m => m.governanceTier === 'v2x-pki-timing-protected' && m.shielded)
	const hasProtectedTelemetryMaster = members.some(m => m.governanceTier === 'traffic-telemetry-master-protected' && m.shielded)
	const hasItsSimRsuScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantTrafficExportMember && !m.shielded)) {
			clusterVerdict = 'corridor-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'its-sim-rsu-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedSafetyHold) {
		clusterVerdict = 'corridor-safety-hold-protected'
	} else if (hasProtectedPkiTiming) {
		clusterVerdict = 'v2x-pki-timing-protected'
	} else if (hasProtectedTelemetryMaster) {
		clusterVerdict = 'traffic-telemetry-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantTrafficExport ? 95 : 85
	} else if (hasProtectedSafetyHold) {
		priorityScore = 60
	} else if (hasProtectedPkiTiming) {
		priorityScore = 50
	}

	const trafficTags = [...new Set(members.map(m => m.trafficTag).filter(Boolean))]
	const familyMeta = TRAFFIC_ITS_V2X_FAMILY_META[family] || TRAFFIC_ITS_V2X_FAMILY_META['sumo-vissim-rsu-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		trafficToolchain: primaryToolchain,
		workflowStage: primaryStage,
		corridorStem: primaryStem,
		trafficAnchorKey: primaryAnchorKey,
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
		hasProtectedPkiTiming,
		hasProtectedTelemetryMaster,
		hasProtectedSafetyHold,
		hasRedundantTrafficExport,
		hasItsSimRsuScratch,
		hasTrafficMasterAnchor,
		trafficTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Traffic ITS, V2X Connected Mobility & Corridor Signal Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Traffic ITS & V2X vault audit report.
 */
export function auditTrafficItsV2xVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeTrafficItsV2xConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isTrafficItsV2xGroup)
	const correlationIndex = buildTrafficItsV2xCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'v2x-pki-signal-timing-holds': 0,
		'traffic-v2x-telemetry-masters': 0,
		'redundant-corridor-report-exports': 0,
		'sumo-vissim-rsu-scratch': 0,
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
				cluster.trafficToolchain,
				cluster.workflowStage,
				cluster.corridorStem,
				cluster.trafficAnchorKey,
				cluster.familyLabel,
				...cluster.trafficTags,
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
	let totalPkiTimingClusters = 0
	let totalTelemetryMasterClusters = 0
	let totalSafetyHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalSimRsuScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedPkiTiming) {
			totalPkiTimingClusters += 1
		}
		if (cluster.hasProtectedTelemetryMaster) {
			totalTelemetryMasterClusters += 1
		}
		if (cluster.hasProtectedSafetyHold) {
			totalSafetyHoldClusters += 1
		}
		if (cluster.hasRedundantTrafficExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasItsSimRsuScratch) {
			totalSimRsuScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = TRAFFIC_ITS_V2X_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: TRAFFIC_ITS_V2X_FAMILY_META[id].label,
			shortLabel: TRAFFIC_ITS_V2X_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: TRAFFIC_ITS_V2X_VAULT_SCHEMA,
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
			totalPkiTimingClusters,
			totalTelemetryMasterClusters,
			totalSafetyHoldClusters,
			totalRedundantExportClusters,
			totalSimRsuScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Traffic ITS & V2X Vaults.
 * Strictly blocks deletion or hardlinking of shielded Corridor Safety Holds, V2X PKI/Timing
 * baselines, and verified BLF/MF4/PCAPNG/WIM/SUMO/VISSIM masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditTrafficItsV2xVault.
 * @return {string} POSIX bash script.
 */
export function buildTrafficItsV2xRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Traffic ITS, V2X Connected Mobility & Corridor Signal Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./traffic-its-v2x-vault-reclaim.sh only after verifying V2X, WIM/Loop, and SUMO/VISSIM anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.traffic-its-v2x-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-rsu-scratch'
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
			} else if (strategy === 'quarantine-exports-and-rsu-scratch' && (target.isRedundantTrafficExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable corridor exports or RSU/Sim scratch under active V2X PKI, Timing & Safety shields.\\n"')
	} else {
		lines.push(`printf "Completed Traffic ITS & V2X Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditTrafficItsV2xVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildTrafficItsV2xCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'traffic_toolchain',
		'workflow_stage',
		'corridor_stem',
		'traffic_anchor_key',
		'family',
		'cluster_verdict',
		'has_traffic_master_anchor',
		'is_redundant_traffic_export',
		'is_sim_rsu_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'traffic_tag',
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
				cluster.trafficToolchain || '',
				cluster.workflowStage || '',
				cluster.corridorStem,
				cluster.trafficAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasTrafficMasterAnchor ? 'true' : 'false',
				member.isRedundantTrafficExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.trafficTag || '',
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
 * @param {object} auditResult Result from auditTrafficItsV2xVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildTrafficItsV2xJsonManifest(auditResult) {
	const payload = {
		schema: TRAFFIC_ITS_V2X_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || TRAFFIC_ITS_V2X_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			trafficToolchain: cluster.trafficToolchain,
			workflowStage: cluster.workflowStage,
			corridorStem: cluster.corridorStem,
			trafficAnchorKey: cluster.trafficAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedPkiTiming: cluster.hasProtectedPkiTiming,
			hasProtectedTelemetryMaster: cluster.hasProtectedTelemetryMaster,
			hasProtectedSafetyHold: cluster.hasProtectedSafetyHold,
			hasRedundantTrafficExport: cluster.hasRedundantTrafficExport,
			hasItsSimRsuScratch: cluster.hasItsSimRsuScratch,
			hasTrafficMasterAnchor: cluster.hasTrafficMasterAnchor,
			trafficTags: cluster.trafficTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				trafficTag: member.trafficTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantTrafficExportMember: member.isRedundantTrafficExportMember,
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
 * cloud sync of SUMO, VISSIM, RSU, OBU, ANPR, and FCD corridor streaming scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildTrafficItsV2xSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Traffic ITS, V2X & Corridor Signal Vaults',
		'sumo_tmp/',
		'vissim_scratch/',
		'rsu_spool/',
		'obu_cache/',
		'anpr_staging/',
		'fcd_tmp/',
		'spat_cache/',
		'loop_staging/',
		'v2x_scratch/',
		'traffic_tmp/',
		'utmc_cache/',
		'toll_staging/',
		'tmp_sumo_*',
		'tmp_vissim_*',
		'tmp_rsu_*',
		'tmp_obu_*',
		'tmp_fcd_*',
		'tmp_spat_*',
		'tmp_loop_*',
		'tmp_anpr_*',
		'cache_v2x_*',
		'spool_rsu_*',
		'*.rou.tmp',
		'*.fcd.tmp',
		'*.net.tmp',
		'*.blf.part',
		'*.mf4.part',
		'*.pcapng.tmp',
		'*.inpx.bak',
		'*.sumocfg.bak',
		'*.vissim.tmp',
		'*.rsu.part',
		'*.obu.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
