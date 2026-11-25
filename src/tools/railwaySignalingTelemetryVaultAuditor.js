/**
 * Pure Railway, ETCS/CBTC Signaling, Wayside Diagnostics & Rolling Stock Telemetry Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Railway & Signaling Vault families:
 * - ETCS, Interlocking & SIL-4 Safety Holds (.bal, .etcs, .rbc, .ixl, .euroradio, .jru, .cbtc, .ptc, plus .xml, .json, .yaml, .toml, .sqlite, .db, .cfg in railway/interlocking/hold context)
 * - RailML, OTMR & Rolling Stock Telemetry Masters (.railml, .eulynx, .otmr, .ertms, .tgeo, .trdp, .mvb, .wtb, plus .mf4, .mdf, .tdms, .blf, .h5, .hdf5, .pcap, .pcapng in railway/wayside/tcms context)
 * - Redundant Track Geometry & Fleet KPI Exports (.csv, .tsv, .txt, .dat, .parquet, .feather, .xlsx, .png, .pdf, .svg, .kml, .geojson in railway export context)
 * - OpenTrack, ETCS Sim & Wayside Staging Scratch (etcs_sim_tmp/, opentrack_cache/, railsys_tmp/, ertms_sim_scratch/, wayside_buffer_tmp/, tcms_staging/, jru_decode_tmp/, track_geom_cache/, balise_compile_tmp/, cbtc_sim_tmp/, .jru.tmp, .bal.tmp, .ixl.tmp, .railml.tmp, .otmr.tmp, .mf4.part, .tdms.tmp, .pcap.tmp, .trdp.tmp, .h5.lock, .lck)
 *
 * Enforces strict SIL-4/ERA Safety Hold, ETCS/Interlocking Baseline, and OTMR/RailML/TCMS Master conservation defaults:
 * - Strictly conserves SIL-4, CENELEC EN 50128/50129, ERA homologation, JRU/accident, and interlocking-freeze holds
 * - Strictly conserves Eurobalise telegrams, RBC/IXL configurations, Euroradio sessions, CBTC/PTC track databases, and JRU baselines
 * - Strictly conserves verified RailML, EULYNX, OTMR, ERTMS, track geometry, and TCMS/TRDP/MVB/MDF4 masters
 * - Detects redundant TQI, wheel-flat, pantograph, speed-profile, and wayside KPI exports when a verified ETCS, Interlocking, JRU, RailML, or TCMS anchor exists
 * - Blocks pruning of derived track/fleet exports lacking a verified Railway master anchor when guard is active
 * - Blocks hardlinks on mutable RailML, EULYNX, interlocking, balise, CSV, Parquet, and simulator scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const RAILWAY_SIGNALING_TELEMETRY_VAULT_SCHEMA = 'duplicatefinder.railway-signaling-telemetry-vault-auditor.v1'

export const RAILWAY_SIGNALING_FAMILIES = Object.freeze([
	'all',
	'railway-interlocking-etcs-holds',
	'railway-telemetry-track-masters',
	'redundant-railway-kpi-exports',
	'railway-sim-wayside-scratch',
])

export const RAILWAY_SIGNALING_FAMILY_META = Object.freeze({
	'railway-interlocking-etcs-holds': {
		id: 'railway-interlocking-etcs-holds',
		label: 'ETCS, IXL & SIL-4 Holds',
		shortLabel: 'Eurobalise Telegrams, RBC/IXL Baselines, JRU Logs & SIL-4 Holds (.bal, .etcs, .rbc, .ixl, .jru, .cbtc)',
	},
	'railway-telemetry-track-masters': {
		id: 'railway-telemetry-track-masters',
		label: 'RailML, OTMR & TCMS Masters',
		shortLabel: 'Verified RailML, EULYNX, OTMR, Track Geometry & TCMS/MDF4 Masters (.railml, .eulynx, .otmr, .tgeo, .trdp, .mf4)',
	},
	'redundant-railway-kpi-exports': {
		id: 'redundant-railway-kpi-exports',
		label: 'Redundant Track & Fleet Exports',
		shortLabel: 'Derived TQI, Wheel-Flat, Pantograph & Speed-Profile Exports (.csv, .parquet, .xlsx, .png, .pdf, .kml)',
	},
	'railway-sim-wayside-scratch': {
		id: 'railway-sim-wayside-scratch',
		label: 'OpenTrack & Wayside Scratch',
		shortLabel: 'Simulator & Wayside Staging Scratch (etcs_sim_tmp/, opentrack_cache/, jru_decode_tmp/, .jru.tmp, .mf4.part)',
	},
})

export const RAILWAY_SIGNALING_STRATEGIES = Object.freeze([
	'prune-exports-and-wayside-scratch',
	'hardlink-immutable-otmr-and-hdf5',
	'quarantine-exports-and-wayside-scratch',
])

export const RAILWAY_SIGNALING_SURVIVOR_RULES = Object.freeze([
	'railway-etcs-otmr-first',
	'oldest-jru-run-first',
	'newest-sim-pass-first',
	'shortest-path',
])

export const RAILWAY_SIGNALING_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'railway-etcs-ixl-protected',
	'otmr-railml-master-protected',
	'sil4-safety-hold-protected',
	'railway-export-redundant',
	'sim-wayside-scratch',
	'shielded',
])

export const RAILWAY_SIGNALING_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const RAILWAY_SIGNALING_PRESETS = Object.freeze([
	{
		id: 'all-railway-signaling-audit',
		name: 'All Railway & ETCS Vaults',
		description: 'Audit ETCS/CBTC interlocking baselines, SIL-4 safety holds, RailML/OTMR/TCMS masters, redundant track/fleet KPI exports, and OpenTrack/wayside scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-wayside-scratch',
		survivorRule: 'railway-etcs-otmr-first',
		protectEtcsAndInterlocking: true,
		protectTelemetryAndRailmlMasters: true,
		protectSil4SafetyHolds: true,
		requireRailwayAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'opentrack-wayside-scratch-cleanup',
		name: 'OpenTrack & Wayside Scratch',
		description: 'Reclaim etcs_sim_tmp/, opentrack_cache/, railsys_tmp/, jru_decode_tmp/, tcms_staging/, and .jru.tmp/.mf4.part scratch older than the active diagnostic window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-wayside-scratch',
		survivorRule: 'railway-etcs-otmr-first',
		protectEtcsAndInterlocking: true,
		protectTelemetryAndRailmlMasters: true,
		protectSil4SafetyHolds: true,
		requireRailwayAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-kpi-vs-jru-railml',
		name: 'Redundant KPIs vs JRU/RailML',
		description: 'Detect derived TQI CSV/Parquet tables and speed-profile/wheel-flat plots backed by a verified ETCS, Interlocking, JRU, RailML, or OTMR master anchor.',
		familyFilter: 'redundant-railway-kpi-exports',
		strategy: 'quarantine-exports-and-wayside-scratch',
		survivorRule: 'railway-etcs-otmr-first',
		protectEtcsAndInterlocking: true,
		protectTelemetryAndRailmlMasters: true,
		protectSil4SafetyHolds: true,
		requireRailwayAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'etcs-ixl-sil4-hold-shield',
		name: 'ETCS, IXL & SIL-4 Holds Shield',
		description: 'Inspect Eurobalise telegrams, RBC/IXL tables, Euroradio logs, and SIL-4/ERA homologation holds under strict conservation shield.',
		familyFilter: 'railway-interlocking-etcs-holds',
		strategy: 'hardlink-immutable-otmr-and-hdf5',
		survivorRule: 'railway-etcs-otmr-first',
		protectEtcsAndInterlocking: true,
		protectTelemetryAndRailmlMasters: true,
		protectSil4SafetyHolds: true,
		requireRailwayAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-railml-otmr-tcms-masters',
		name: 'RailML, OTMR & TCMS Masters',
		description: 'Audit verified RailML/EULYNX models, OTMR/ERTMS captures, track geometry car runs, and TRDP/MVB/MDF4 rolling stock telemetry masters.',
		familyFilter: 'railway-telemetry-track-masters',
		strategy: 'hardlink-immutable-otmr-and-hdf5',
		survivorRule: 'railway-etcs-otmr-first',
		protectEtcsAndInterlocking: true,
		protectTelemetryAndRailmlMasters: true,
		protectSil4SafetyHolds: true,
		requireRailwayAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const RAILWAY_SIGNALING_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-railway-signaling-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-wayside-scratch',
	survivorRule: 'railway-etcs-otmr-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectEtcsAndInterlocking: true,
	protectTelemetryAndRailmlMasters: true,
	protectSil4SafetyHolds: true,
	requireRailwayAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_RAILWAY_ETCS_EXT_RE = /\.(?:bal|etcs|rbc|ixl|euroradio|jru|cbtc|ptc)$/i
const CONTEXT_RAILWAY_ETCS_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|cfg|bin)$/i
const STRICT_RAILWAY_MASTER_EXT_RE = /\.(?:railml|eulynx|otmr|ertms|tgeo|trdp|mvb|wtb)$/i
const CONTEXT_RAILWAY_TELEMETRY_EXT_RE = /\.(?:mf4|mdf|tdms|blf|h5|hdf5|pcap|pcapng)$/i
const CONTEXT_RAILWAY_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|dat|parquet|feather|xlsx|png|pdf|svg|kml|geojson)$/i
const STRICT_RAILWAY_SCRATCH_EXT_RE = /\.(?:jru\.tmp|bal\.tmp|ixl\.tmp|railml\.tmp|otmr\.tmp|mf4\.part|tdms\.tmp|pcap\.tmp|trdp\.tmp|h5\.lock|h5\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_RAILWAY_EXCLUSION_RE = /(?:quantum|qubit|qasm|bluefors|geant4|cmssw|cern|synchrotron|orbital|ccsds|neuro|electrophys|bids|dicom|nifti|hydrograph|multibeam|seismic|segy|qiskit|laboneq|rosbag|gazebo|autoware|bms_can|hil_dyno|ev_powertrain|tbm_tunnel|geosensor|inclinometer|photoshop|lightroom|premiere|davinci)/i
const RAILWAY_CONTEXT_HINT_RE = /(?:railway|railroad|etcs|ertms|cbtc|ptc|eurobalise|euroradio|interlocking|wayside|trackside|rolling_?stock|railml|eulynx|otmr|jru|tcms|trdp|mvb|wtb|pantograph|catenary|bogie|wheel_?flat|axle_?box|track_?geom|tqi|axle_?counter|point_?machine|opentrack|railsys|locomotive|traction_?inverter)/i
const RAILWAY_HOLD_PATH_RE = /(?:sil4_?hold|era_?hold|cenelec_?hold|safety_?hold|accident_?hold|incident_?hold|jru_?hold|homologation_?hold|era_?baseline|interlocking_?freeze|signaling_?hold|cert_?hold|en50128_?hold)/i
const RAILWAY_BASELINE_PATH_RE = /(?:00_etcs|00_interlocking|00_balise|00_ixl|00_jru|00_cbtc|etcs_baselines|balise_telegrams|track_topology|railml_baselines|signaling_tables|rbc_baselines)/i
const RAILWAY_SCRATCH_PATH_RE = /(?:etcs_sim_tmp|opentrack_cache|railsys_tmp|ertms_sim_scratch|wayside_buffer_tmp|tcms_staging|jru_decode_tmp|track_geom_cache|balise_compile_tmp|cbtc_sim_tmp|sim_scratch)/i
const RAILWAY_INTERMEDIATE_PREFIX_RE = /^(?:tmp_etcs_|tmp_bal_|tmp_ixl_|tmp_jru_|tmp_otmr_|tmp_railml_|tmp_tcms_|tmp_wayside_|cache_jru_|spill_mvb_)/i
const RAILWAY_INTERMEDIATE_SUFFIX_RE = /(?:_etcs_tmp|_opentrack_tmp|_jru_tmp|_tcms_tmp|_wayside_tmp|_staging)$/i
const RAILWAY_EXPORT_PATH_RE = /(?:kpi_exports|track_reports|geometry_plots|tqi_summaries|pantograph_reports|wheel_flat_plots|speed_profile_exports|_tqi|_track_report|_jru_csv|_speed_plot|_braking_curve|_wayside_summary|_fleet_kpi)/i
const CANONICAL_RAILWAY_VAULT_PATH_RE = /(?:00_raw|00_jru|00_otmr|00_track_geom|00_wayside|00_tcms|00_railml|00_masters|canonical|rail_archive|rolling_stock_archive)/i

/**
 * Normalize configuration values for Railway, ETCS/CBTC Signaling & Rolling Stock Telemetry auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeRailwaySignalingConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = RAILWAY_SIGNALING_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.familyFilter
	const verdictFilter = RAILWAY_SIGNALING_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.verdictFilter
	const strategy = RAILWAY_SIGNALING_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.strategy
	const survivorRule = RAILWAY_SIGNALING_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.survivorRule
	const sortMode = RAILWAY_SIGNALING_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: RAILWAY_SIGNALING_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : RAILWAY_SIGNALING_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectEtcsAndInterlocking: cfg.protectEtcsAndInterlocking !== undefined ? Boolean(cfg.protectEtcsAndInterlocking) : true,
		protectTelemetryAndRailmlMasters: cfg.protectTelemetryAndRailmlMasters !== undefined ? Boolean(cfg.protectTelemetryAndRailmlMasters) : true,
		protectSil4SafetyHolds: cfg.protectSil4SafetyHolds !== undefined ? Boolean(cfg.protectSil4SafetyHolds) : true,
		requireRailwayAnchorForPrune: cfg.requireRailwayAnchorForPrune !== undefined ? Boolean(cfg.requireRailwayAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized railway run or signaling corridor stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized railway corridor/run stem.
 */
export function extractRailwaySignalingStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:jru\.tmp|bal\.tmp|ixl\.tmp|railml\.tmp|otmr\.tmp|mf4\.part|tdms\.tmp|pcap\.tmp|trdp\.tmp|h5\.lock|h5\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(RAILWAY_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(RAILWAY_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:tqi|track_report|jru_csv|speed_plot|braking_curve|wayside_summary|fleet_kpi|wheel_flat|pantograph|plot|summary|export|csv|parquet|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'rail-run'
}

/**
 * Extract canonical anchor key linking derived TQI/fleet exports to ETCS, JRU, RailML, or OTMR masters.
 *
 * @param {string} runStem Extracted railway run stem.
 * @return {string} Canonical anchor key.
 */
export function extractRailwaySignalingAnchorKey(runStem) {
	return String(runStem || 'rail-run')
		.toLowerCase()
		.replace(/(?:[-_](?:bal|etcs|rbc|ixl|euroradio|jru|cbtc|ptc|railml|eulynx|otmr|ertms|tgeo|trdp|mvb|wtb|mf4|mdf|tdms|blf|h5|hdf5|pcap|pcapng|tqi|kpi|plot|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'rail-run'
}

/**
 * Detect Railway, ETCS/CBTC & Rolling Stock toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ railwayToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractRailwayToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let railwayToolchain = ''
	if (/\.(?:bal|etcs|rbc|euroradio)\b|eurobalise|euroradio|rbc_?baseline/.test(text)) {
		railwayToolchain = 'ETCS L2/L3 / Eurobalise & RBC'
	} else if (/\.(?:ixl)\b|interlocking|point_?machine|axle_?counter/.test(text)) {
		railwayToolchain = 'Electronic Interlocking (IXL / SIL-4)'
	} else if (/\.(?:cbtc|ptc)\b/.test(text)) {
		railwayToolchain = 'CBTC / PTC Train Control'
	} else if (/\.(?:jru|otmr|ertms)\b|jru_?decode/.test(text)) {
		railwayToolchain = 'ETCS JRU / OTMR Legal Recorder'
	} else if (/\.(?:railml|eulynx)\b/.test(text)) {
		railwayToolchain = 'RailML / EULYNX Infrastructure'
	} else if (/\.(?:tgeo)\b|track_?geom|tqi|pantograph|catenary/.test(text)) {
		railwayToolchain = 'Track Geometry & Wayside Inspection'
	} else if (/\.(?:trdp|mvb|wtb|mf4|mdf|tdms|blf|pcap|pcapng|h5|hdf5)\b|tcms|bogie|wheel_?flat|traction_?inverter/.test(text)) {
		railwayToolchain = 'TCMS / TRDP / MVB Rolling Stock Bus'
	} else if (/opentrack|railsys/.test(text)) {
		railwayToolchain = 'OpenTrack / RailSys Timetable Sim'
	}

	let workflowStage = ''
	if (RAILWAY_HOLD_PATH_RE.test(text)) {
		workflowStage = 'SIL-4 / ERA / Incident Safety Hold'
	} else if (STRICT_RAILWAY_ETCS_EXT_RE.test(basename) || RAILWAY_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'ETCS, Interlocking & JRU Baseline'
	} else if (RAILWAY_SCRATCH_PATH_RE.test(text) || STRICT_RAILWAY_SCRATCH_EXT_RE.test(basename) || RAILWAY_INTERMEDIATE_PREFIX_RE.test(basename) || RAILWAY_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'OpenTrack / ETCS Sim / Wayside Scratch'
	} else if (RAILWAY_EXPORT_PATH_RE.test(text) || (CONTEXT_RAILWAY_EXPORT_EXT_RE.test(basename) && RAILWAY_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Track Geometry / Fleet KPI Export'
	} else if (STRICT_RAILWAY_MASTER_EXT_RE.test(basename) || (CONTEXT_RAILWAY_TELEMETRY_EXT_RE.test(basename) && RAILWAY_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Verified RailML, OTMR or TCMS Master'
	}

	return { railwayToolchain, workflowStage }
}

/**
 * Extract concise Railway & ETCS domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractRailwayDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (RAILWAY_HOLD_PATH_RE.test(text)) {
		return 'SIL-4 / ERA HOLD'
	}
	if (/\.(?:bal|etcs|rbc|euroradio)\b/.test(lowerBase)) {
		return 'ETCS / BALISE'
	}
	if (/\.(?:ixl|cbtc|ptc)\b/.test(lowerBase)) {
		return 'IXL / CBTC BASELINE'
	}
	if (/\.(?:jru|otmr|ertms)\b/.test(lowerBase)) {
		return 'JRU / OTMR MASTER'
	}
	if (/\.(?:railml|eulynx)\b/.test(lowerBase)) {
		return 'RAILML / EULYNX'
	}
	if (/\.tgeo\b/.test(lowerBase)) {
		return 'TRACK GEOMETRY'
	}
	if (/\.(?:trdp|mvb|wtb)\b/.test(lowerBase)) {
		return 'TCMS / TRDP BUS'
	}
	if (/\.(?:mf4|mdf|tdms|blf|h5|hdf5|pcap|pcapng)\b/.test(lowerBase) && RAILWAY_CONTEXT_HINT_RE.test(text)) {
		return 'ROLLING STOCK DAQ'
	}
	if (STRICT_RAILWAY_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'SIM / WAYSIDE SCRATCH'
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
 * Classify a single file within the Railway, ETCS/CBTC Signaling & Rolling Stock Telemetry domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyRailwaySignalingFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_RAILWAY_EXCLUSION_RE.test(lower)
	const hasRailwayContext = !hasExcludedContext && RAILWAY_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && RAILWAY_BASELINE_PATH_RE.test(lower)
	const isSafetyHoldPath = !hasExcludedContext && RAILWAY_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_RAILWAY_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && RAILWAY_SCRATCH_PATH_RE.test(lower)
	const isRailwayExportPath = !hasExcludedContext && RAILWAY_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_RAILWAY_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (RAILWAY_INTERMEDIATE_PREFIX_RE.test(lowerBase) || RAILWAY_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isEtcsOrInterlocking = !hasExcludedContext && (
		STRICT_RAILWAY_ETCS_EXT_RE.test(lowerBase)
		|| (CONTEXT_RAILWAY_ETCS_EXT_RE.test(lowerBase) && (hasRailwayContext || isBaselinePath || isSafetyHoldPath))
	)

	const isContextTelemetryMaster = CONTEXT_RAILWAY_TELEMETRY_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasRailwayContext || isCanonicalVaultPath)
	const isStrictTelemetryOrRailmlMaster = !hasExcludedContext && (
		STRICT_RAILWAY_MASTER_EXT_RE.test(lowerBase)
		|| isContextTelemetryMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictTelemetryOrRailmlMaster
		&& !isEtcsOrInterlocking
		&& CONTEXT_RAILWAY_EXPORT_EXT_RE.test(lowerBase)
		&& (hasRailwayContext || isRailwayExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Railway & ETCS Signaling Vault'
	let isProtectedEtcsInterlocking = false
	let isProtectedTelemetryRailmlMaster = false
	let isProtectedSil4Hold = false
	let isRailwayMasterAnchor = false
	let isRedundantRailwayExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictTelemetryOrRailmlMaster || isEtcsOrInterlocking))
		|| (isIntermediateSubfile && (isStrictTelemetryOrRailmlMaster || isContextExport || hasRailwayContext))
		|| (isGenericScratchExt && hasRailwayContext && !isBaselinePath && !isSafetyHoldPath)
	) {
		family = 'railway-sim-wayside-scratch'
		artifactKind = isStrictScratchExt
			? 'JRU / Balise / OTMR / MDF4 Staging Scratch'
			: (isIntermediateSubfile ? 'OpenTrack / ETCS Intermediate Cache' : 'Wayside & TCMS Simulation Scratch')
		vaultRole = 'OpenTrack, RailSys, ETCS Sim or Wayside Staging Scratch'
		isMutableFile = true
	} else if (isSafetyHoldPath && (isEtcsOrInterlocking || isStrictTelemetryOrRailmlMaster || isContextExport || hasRailwayContext)) {
		family = 'railway-interlocking-etcs-holds'
		artifactKind = 'SIL-4 / ERA / Incident Safety Hold'
		vaultRole = 'Protected SIL-4 Homologation & Incident Hold'
		isProtectedSil4Hold = true
		isProtectedEtcsInterlocking = true
		isRailwayMasterAnchor = isStrictTelemetryOrRailmlMaster || isEtcsOrInterlocking
		isMutableFile = true
	} else if (isEtcsOrInterlocking) {
		family = 'railway-interlocking-etcs-holds'
		if (/\.(?:bal|etcs|euroradio)$/i.test(lowerBase)) {
			artifactKind = 'Eurobalise Telegram / ETCS Baseline'
			vaultRole = 'Canonical ETCS Wayside Telegram & Euroradio Log'
		} else if (/\.(?:rbc|ixl|cbtc|ptc)$/i.test(lowerBase)) {
			artifactKind = 'RBC / Electronic Interlocking Baseline'
			vaultRole = 'Canonical Interlocking & Moving-Block Control Table'
		} else if (/\.jru$/i.test(lowerBase)) {
			artifactKind = 'ETCS Juridical Recording Unit (JRU) Log'
			vaultRole = 'Canonical On-Board Legal Signaling Recorder'
		} else {
			artifactKind = 'Railway Signaling & Track Topology Config'
			vaultRole = 'Canonical ETCS, IXL or CBTC Configuration Baseline'
		}
		isProtectedEtcsInterlocking = true
		isRailwayMasterAnchor = true
		isMutableFile = true
	} else if (isStrictTelemetryOrRailmlMaster) {
		family = 'railway-telemetry-track-masters'
		if (/\.(?:railml|eulynx)$/i.test(lowerBase)) {
			artifactKind = 'RailML / EULYNX Infrastructure Master'
			vaultRole = 'Canonical Standardized Railway Topology & Signaling XML'
			isMutableFile = true
		} else if (/\.(?:otmr|ertms)$/i.test(lowerBase)) {
			artifactKind = 'OTMR / ERTMS On-Train Recorder Master'
			vaultRole = 'Immutable Trainborne Speed, Brake & Cab-Signal Capture'
			isMutableFile = false
		} else if (/\.tgeo$/i.test(lowerBase)) {
			artifactKind = 'Track Geometry Recording Car Master'
			vaultRole = 'Immutable Gauge, Cant, Twist & Alignment Channel Data'
			isMutableFile = false
		} else if (/\.(?:trdp|mvb|wtb)$/i.test(lowerBase)) {
			artifactKind = 'TCMS / TRDP / MVB Vehicle Bus Master'
			vaultRole = 'Immutable Train Communication Network Frame Capture'
			isMutableFile = false
		} else {
			artifactKind = 'Rolling Stock & Wayside Telemetry DAQ Master'
			vaultRole = 'Immutable MDF4, TDMS, HDF5 or PCAP Wayside/Bogie Master'
			isMutableFile = false
		}
		isProtectedTelemetryRailmlMaster = true
		isRailwayMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-railway-kpi-exports'
		if (/\.(?:csv|tsv|txt|dat|parquet|feather|xlsx)$/i.test(lowerBase)) {
			artifactKind = 'Derived TQI / Braking / Fleet KPI Table'
		} else {
			artifactKind = 'Track Geometry / Speed-Profile Plot or GIS Export'
		}
		vaultRole = 'Derived Railway KPI Table, Plot or GeoJSON Export'
		isRedundantRailwayExport = true
		isMutableFile = true
	}

	const { railwayToolchain, workflowStage } = extractRailwayToolchainAndStage(normalized, basename)
	const runStem = extractRailwaySignalingStem(basename, normalized)
	const railwayAnchorKey = extractRailwaySignalingAnchorKey(runStem)
	const railwayTag = extractRailwayDomainTag(lowerBase, lower)

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
		railwayToolchain,
		workflowStage,
		runStem,
		railwayAnchorKey,
		railwayTag,
		isProtectedEtcsInterlocking,
		isProtectedTelemetryRailmlMaster,
		isProtectedSil4Hold,
		isRailwayMasterAnchor,
		isRedundantRailwayExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'railway-sim-wayside-scratch') || (isGenericScratchExt && hasRailwayContext && family === 'railway-sim-wayside-scratch'),
		isBaselinePath,
		isSafetyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Railway, ETCS/CBTC Signaling & Rolling Stock Telemetry domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isRailwaySignalingGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyRailwaySignalingFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified ETCS/Interlocking/JRU/RailML/OTMR/TCMS anchors
 * to derived TQI/wheel-flat/pantograph/speed-profile exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildRailwaySignalingCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyRailwaySignalingFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isRailwayMasterAnchor) {
				anchorStems.add(meta.runStem)
				anchorKeys.add(meta.railwayAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Railway & Signaling cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'railway-interlocking-etcs-holds')) {
		return 'railway-interlocking-etcs-holds'
	}
	if (members.some(m => m.family === 'railway-telemetry-track-masters')) {
		return 'railway-telemetry-track-masters'
	}
	if (members.some(m => m.family === 'redundant-railway-kpi-exports')) {
		return 'redundant-railway-kpi-exports'
	}
	return 'railway-sim-wayside-scratch'
}

/**
 * Compute deterministic survivor priority score for a Railway & Signaling vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-jru-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedSil4Hold ? 100000 : 0)
			+ (member.isProtectedEtcsInterlocking ? 97000 : 0)
			+ (member.isProtectedTelemetryRailmlMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantRailwayExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-sim-pass-first') {
		return (member.isProtectedSil4Hold ? 100000 : 0)
			+ (member.isProtectedEtcsInterlocking ? 97000 : 0)
			+ (member.isProtectedTelemetryRailmlMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantRailwayExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedSil4Hold ? 52000 : 0)
			+ (member.isProtectedEtcsInterlocking ? 50000 : 0)
			+ (member.isProtectedTelemetryRailmlMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedSil4Hold ? 100000 : 0)
		+ (member.isProtectedEtcsInterlocking ? 97000 : 0)
		+ (member.isProtectedTelemetryRailmlMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantRailwayExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Railway, ETCS/CBTC Signaling & Rolling Stock Telemetry duplicate cluster.
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
		const meta = classifyRailwaySignalingFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.railwayToolchain)?.railwayToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].runStem || extractRailwaySignalingStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].railwayAnchorKey || extractRailwaySignalingAnchorKey(primaryStem)

	const hasRailwayMasterAnchor = Boolean(
		rawMembers.some(m => m.isRailwayMasterAnchor)
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

		const isRedundantRailwayExportMember = member.isRedundantRailwayExport && hasRailwayMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantRailwayExport) {
			redundancyReason = isRedundantRailwayExportMember
				? 'Derived TQI table or fleet plot duplicates verified ETCS, IXL, JRU, RailML, or OTMR master'
				: 'Derived track/fleet export without verified ETCS, IXL, JRU, RailML, or OTMR anchor'
		}

		let governanceTier = 'sim-wayside-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedSil4Hold
				? 'sil4-safety-hold-protected'
				: (member.isProtectedEtcsInterlocking
					? 'railway-etcs-ixl-protected'
					: (member.isProtectedTelemetryRailmlMaster
						? 'otmr-railml-master-protected'
						: (member.isRedundantRailwayExport
							? 'railway-export-redundant'
							: 'sim-wayside-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedSil4Hold && config.protectSil4SafetyHolds) {
			governanceTier = 'sil4-safety-hold-protected'
			shielded = true
			protectedReason = 'SIL-4, ERA homologation, incident, or interlocking-freeze hold strictly conserved'
		} else if (member.isProtectedEtcsInterlocking && config.protectEtcsAndInterlocking) {
			governanceTier = 'railway-etcs-ixl-protected'
			shielded = true
			protectedReason = 'Eurobalise telegram, RBC/IXL table, CBTC/PTC baseline, or JRU log strictly conserved'
		} else if (member.isProtectedTelemetryRailmlMaster && config.protectTelemetryAndRailmlMasters) {
			governanceTier = 'otmr-railml-master-protected'
			shielded = true
			protectedReason = 'Verified RailML, EULYNX, OTMR, track geometry, or TCMS/MDF4 master strictly conserved'
		} else if (isSurvivor && !isRedundantRailwayExportMember) {
			governanceTier = member.isProtectedSil4Hold
				? 'sil4-safety-hold-protected'
				: (member.isProtectedEtcsInterlocking
					? 'railway-etcs-ixl-protected'
					: (member.isProtectedTelemetryRailmlMaster
						? 'otmr-railml-master-protected'
						: (member.isRedundantRailwayExport
							? 'railway-export-redundant'
							: 'sim-wayside-scratch')))
			shielded = true
			protectedReason = 'Canonical Railway & Signaling vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantRailwayExport
				? 'railway-export-redundant'
				: (member.isProtectedEtcsInterlocking
					? 'railway-etcs-ixl-protected'
					: 'sim-wayside-scratch')
			action = config.strategy === 'hardlink-immutable-otmr-and-hdf5' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'sim-wayside-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active wayside or simulation grace window`
		} else if (member.isRedundantRailwayExport) {
			governanceTier = 'railway-export-redundant'
			if (config.requireRailwayAnchorForPrune && !hasRailwayMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified ETCS, IXL, JRU, RailML, or OTMR anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'sim-wayside-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'OpenTrack, RailSys, ETCS sim, or wayside staging scratch eligible for cleanup'
		} else if (member.isProtectedTelemetryRailmlMaster || member.isProtectedEtcsInterlocking) {
			governanceTier = member.isProtectedEtcsInterlocking ? 'railway-etcs-ixl-protected' : 'otmr-railml-master-protected'
			action = config.strategy === 'hardlink-immutable-otmr-and-hdf5' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-otmr-and-hdf5' && !member.isMutableFile) {
			governanceTier = 'otmr-railml-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'sim-wayside-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantRailwayExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantRailwayExport = members.some(m => m.isRedundantRailwayExportMember || m.isRedundantRailwayExport)
	const hasProtectedSil4Hold = members.some(m => m.governanceTier === 'sil4-safety-hold-protected' && m.shielded)
	const hasProtectedEtcsInterlocking = members.some(m => m.governanceTier === 'railway-etcs-ixl-protected' && m.shielded)
	const hasProtectedTelemetryRailmlMaster = members.some(m => m.governanceTier === 'otmr-railml-master-protected' && m.shielded)
	const hasSimWaysideScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantRailwayExportMember && !m.shielded)) {
			clusterVerdict = 'railway-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'sim-wayside-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedSil4Hold) {
		clusterVerdict = 'sil4-safety-hold-protected'
	} else if (hasProtectedEtcsInterlocking) {
		clusterVerdict = 'railway-etcs-ixl-protected'
	} else if (hasProtectedTelemetryRailmlMaster) {
		clusterVerdict = 'otmr-railml-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantRailwayExport ? 95 : 85
	} else if (hasProtectedSil4Hold) {
		priorityScore = 60
	} else if (hasProtectedEtcsInterlocking) {
		priorityScore = 50
	}

	const railwayTags = [...new Set(members.map(m => m.railwayTag).filter(Boolean))]
	const familyMeta = RAILWAY_SIGNALING_FAMILY_META[family] || RAILWAY_SIGNALING_FAMILY_META['railway-sim-wayside-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		railwayToolchain: primaryToolchain,
		workflowStage: primaryStage,
		runStem: primaryStem,
		railwayAnchorKey: primaryAnchorKey,
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
		hasProtectedEtcsInterlocking,
		hasProtectedTelemetryRailmlMaster,
		hasProtectedSil4Hold,
		hasRedundantRailwayExport,
		hasSimWaysideScratch,
		hasRailwayMasterAnchor,
		railwayTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Railway, ETCS/CBTC Signaling, Wayside Diagnostics & Rolling Stock Telemetry Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Railway & Signaling vault audit report.
 */
export function auditRailwaySignalingVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeRailwaySignalingConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isRailwaySignalingGroup)
	const correlationIndex = buildRailwaySignalingCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'railway-interlocking-etcs-holds': 0,
		'railway-telemetry-track-masters': 0,
		'redundant-railway-kpi-exports': 0,
		'railway-sim-wayside-scratch': 0,
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
				cluster.railwayToolchain,
				cluster.workflowStage,
				cluster.runStem,
				cluster.railwayAnchorKey,
				cluster.familyLabel,
				...cluster.railwayTags,
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
	let totalEtcsIxlClusters = 0
	let totalTelemetryMasterClusters = 0
	let totalSil4HoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalSimScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedEtcsInterlocking) {
			totalEtcsIxlClusters += 1
		}
		if (cluster.hasProtectedTelemetryRailmlMaster) {
			totalTelemetryMasterClusters += 1
		}
		if (cluster.hasProtectedSil4Hold) {
			totalSil4HoldClusters += 1
		}
		if (cluster.hasRedundantRailwayExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasSimWaysideScratch) {
			totalSimScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = RAILWAY_SIGNALING_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: RAILWAY_SIGNALING_FAMILY_META[id].label,
			shortLabel: RAILWAY_SIGNALING_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: RAILWAY_SIGNALING_TELEMETRY_VAULT_SCHEMA,
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
			totalEtcsIxlClusters,
			totalTelemetryMasterClusters,
			totalSil4HoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Railway & Signaling Vaults.
 * Strictly blocks deletion or hardlinking of shielded ETCS/IXL baselines, SIL-4 holds,
 * and verified RailML/OTMR/TCMS masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditRailwaySignalingVault.
 * @return {string} POSIX bash script.
 */
export function buildRailwaySignalingRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Railway, ETCS/CBTC Signaling, Wayside Diagnostics & Rolling Stock Telemetry Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./railway-signaling-vault-reclaim.sh only after verifying ETCS, IXL, JRU, and RailML anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.railway-wayside-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-wayside-scratch'
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
			} else if (strategy === 'quarantine-exports-and-wayside-scratch' && (target.isRedundantRailwayExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable exports or wayside scratch under active Railway & SIL-4 shields.\\n"')
	} else {
		lines.push(`printf "Completed Railway & ETCS Signaling Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditRailwaySignalingVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildRailwaySignalingCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'railway_toolchain',
		'workflow_stage',
		'run_stem',
		'railway_anchor_key',
		'family',
		'cluster_verdict',
		'has_railway_master_anchor',
		'is_redundant_railway_export',
		'is_sim_wayside_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'railway_tag',
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
				cluster.railwayToolchain || '',
				cluster.workflowStage || '',
				cluster.runStem,
				cluster.railwayAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasRailwayMasterAnchor ? 'true' : 'false',
				member.isRedundantRailwayExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.railwayTag || '',
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
 * @param {object} auditResult Result from auditRailwaySignalingVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildRailwaySignalingJsonManifest(auditResult) {
	const payload = {
		schema: RAILWAY_SIGNALING_TELEMETRY_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || RAILWAY_SIGNALING_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			railwayToolchain: cluster.railwayToolchain,
			workflowStage: cluster.workflowStage,
			runStem: cluster.runStem,
			railwayAnchorKey: cluster.railwayAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedEtcsInterlocking: cluster.hasProtectedEtcsInterlocking,
			hasProtectedTelemetryRailmlMaster: cluster.hasProtectedTelemetryRailmlMaster,
			hasProtectedSil4Hold: cluster.hasProtectedSil4Hold,
			hasRedundantRailwayExport: cluster.hasRedundantRailwayExport,
			hasSimWaysideScratch: cluster.hasSimWaysideScratch,
			hasRailwayMasterAnchor: cluster.hasRailwayMasterAnchor,
			railwayTags: cluster.railwayTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				railwayTag: member.railwayTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantRailwayExportMember: member.isRedundantRailwayExportMember,
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
 * cloud sync of OpenTrack, RailSys, ETCS simulation, JRU decode, and wayside staging scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildRailwaySignalingSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Railway, ETCS/CBTC Signaling & Telemetry Vaults',
		'etcs_sim_tmp/',
		'opentrack_cache/',
		'railsys_tmp/',
		'ertms_sim_scratch/',
		'wayside_buffer_tmp/',
		'tcms_staging/',
		'jru_decode_tmp/',
		'track_geom_cache/',
		'balise_compile_tmp/',
		'cbtc_sim_tmp/',
		'sim_scratch/',
		'tmp_etcs_*',
		'tmp_bal_*',
		'tmp_ixl_*',
		'tmp_jru_*',
		'tmp_otmr_*',
		'tmp_railml_*',
		'tmp_tcms_*',
		'tmp_wayside_*',
		'cache_jru_*',
		'spill_mvb_*',
		'*.jru.tmp',
		'*.bal.tmp',
		'*.ixl.tmp',
		'*.railml.tmp',
		'*.otmr.tmp',
		'*.mf4.part',
		'*.tdms.tmp',
		'*.pcap.tmp',
		'*.trdp.tmp',
		'*.h5.lock',
		'*.h5.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
