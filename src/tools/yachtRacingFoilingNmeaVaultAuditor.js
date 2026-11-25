/**
 * Pure Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Yacht Racing, Foiling & Maritime NMEA/VDR Vault families:
 * - Class Rules, IMO VDR & Jury Protest/Safety Holds (.orc, .irc, .vdr, .svdr, .nmea2k, .aislog, .marpol, .imo, .protest, .yrhold, .foilrule, .meas, plus XML/JSON/YAML/SQLite/CSV/PDF in class-rule/VDR/safety-hold baseline context)
 * - NMEA 0183/2000, Foil Hydrodynamics & VPP/GRIB Masters (.nmea, .n2k, .canboat, .pgn, .expedition, .adrena, .deckman, .bng, .grib, .grb2, .vpp, .pol, .polar, .foil, .hydro, plus .parquet/.h5/.hdf5/.tdms/.mat/.mf4/.blf/.cgns/.cas/.vtk/.vtu/.bin/.npz in yacht/foil/NMEA/regatta context)
 * - Derived Race Replays, Polar Plots & Steward Track Exports (.mp4, .webm, .mov, .gif, .png, .jpg, .jpeg, .webp, .pdf, .csv, .tsv, .json, .jsonl, .gpx, .kml, .html in yacht/foil/NMEA export context)
 * - Nav-Suite Cache, VPP Solver & NMEA Ring-Buffer Scratch (expedition_cache/, adrena_route_tmp/, nmea_ring_spool/, vdr_ingest_buf/, foil_cfd_scratch/, vpp_solver_tmp/, grib_tile_cache/, bng_replay_cache/, sailgp_telemetry_tmp/, ac75_sim_spool/, canboat_frame_tmp/, regatta_debrief_cache/, .nmea.tmp, .n2k.idx, .vdr.part, .exp.bak, .adr.tmp, .grib.idx, .polar.tmp, .foil.lck, .vpp.tmp, .can.part, .lck)
 *
 * Enforces strict IMO VDR / Protest Hold, Class Measurement & Telemetry Master defaults:
 * - Strictly conserves Jury protest, collision casualty, SOLAS/IMO VDR, and maritime safety holds
 * - Strictly conserves canonical ORC/IRC hull offset certificates, AC75/IMOCA foil class rules, and VDR/S-VDR baseline manifests
 * - Strictly conserves verified NMEA 0183/2000 PGN logs, hydrofoil load/cavitation DAQ masters, VPP polar tables, and GRIB2 routing masters
 * - Detects redundant 3D race-replay MP4s, polar overlay PNGs, debrief PDFs, and GPX/KML/CSV track exports when a verified NMEA/Foil/VPP/VDR master anchor exists
 * - Blocks pruning of derived yacht race previews or track exports lacking a verified master anchor when guard is active
 * - Blocks hardlinks on mutable JSON/XML/CSV/GPX/KML/MP4/PDF files and nav-suite/telemetry scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const YACHT_RACING_FOILING_NMEA_VAULT_SCHEMA = 'duplicatefinder.yacht-racing-foiling-nmea-vault-auditor.v1'

export const YACHT_RACING_FOILING_NMEA_FAMILIES = Object.freeze([
	'all',
	'yacht-class-rules-vdr-holds',
	'yacht-nmea-foil-hydro-masters',
	'redundant-yacht-export-previews',
	'yacht-nav-sim-telemetry-scratch',
])

export const YACHT_RACING_FOILING_NMEA_FAMILY_META = Object.freeze({
	'yacht-class-rules-vdr-holds': {
		id: 'yacht-class-rules-vdr-holds',
		label: 'Class Rules, IMO VDR & Holds',
		shortLabel: 'ORC/IRC Measurement, IMO VDR/S-VDR & Protest/Safety Holds (.orc, .irc, .vdr, .svdr, .protest, .yrhold, .foilrule)',
	},
	'yacht-nmea-foil-hydro-masters': {
		id: 'yacht-nmea-foil-hydro-masters',
		label: 'NMEA, Foil & VPP Masters',
		shortLabel: 'Verified Masters (.nmea, .n2k, .canboat, .pgn, .expedition, .adrena, .bng, .grib, .grb2, .vpp, .pol, .foil, .hydro)',
	},
	'redundant-yacht-export-previews': {
		id: 'redundant-yacht-export-previews',
		label: 'Derived Replays & GPX/CSV',
		shortLabel: 'Derived Replay MP4s, Polar PNGs, Debrief PDFs & GPX/KML/CSV Track Exports (.mp4, .png, .pdf, .gpx, .kml, .csv)',
	},
	'yacht-nav-sim-telemetry-scratch': {
		id: 'yacht-nav-sim-telemetry-scratch',
		label: 'Nav-Suite & Sim Scratch',
		shortLabel: 'Cache & Spool (expedition_cache/, adrena_route_tmp/, nmea_ring_spool/, foil_cfd_scratch/, .nmea.tmp, .n2k.idx)',
	},
})

export const YACHT_RACING_FOILING_NMEA_STRATEGIES = Object.freeze([
	'prune-exports-and-yacht-scratch',
	'hardlink-immutable-yacht-masters',
	'quarantine-exports-and-yacht-scratch',
])

export const YACHT_RACING_FOILING_NMEA_SURVIVOR_RULES = Object.freeze([
	'yacht-vdr-nmea-master-first',
	'oldest-regatta-leg-first',
	'newest-foil-run-first',
	'shortest-path',
])

export const YACHT_RACING_FOILING_NMEA_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'yacht-class-vdr-protected',
	'yacht-nmea-foil-master-protected',
	'yacht-protest-hold-protected',
	'yacht-export-redundant',
	'yacht-nav-scratch',
	'shielded',
])

export const YACHT_RACING_FOILING_NMEA_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const YACHT_RACING_FOILING_NMEA_PRESETS = Object.freeze([
	{
		id: 'all-yacht-racing-nmea-audit',
		name: 'All Yacht, Foil & NMEA/VDR',
		description: 'Audit ORC/IRC measurement rules, IMO VDR packages, protest/safety holds, NMEA 0183/2000 & foil masters, derived race replays/GPX exports, and nav scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-yacht-scratch',
		survivorRule: 'yacht-vdr-nmea-master-first',
		protectClassRulesAndVdrBaselines: true,
		protectNmeaFoilHydroMasters: true,
		protectProtestAndSafetyHolds: true,
		requireYachtMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'yacht-nav-scratch-cleanup',
		name: 'Nav & Telemetry Scratch',
		description: 'Reclaim expedition_cache/, adrena_route_tmp/, nmea_ring_spool/, foil_cfd_scratch/, and .nmea.tmp/.n2k.idx scratch older than the active regatta window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-yacht-scratch',
		survivorRule: 'yacht-vdr-nmea-master-first',
		protectClassRulesAndVdrBaselines: true,
		protectNmeaFoilHydroMasters: true,
		protectProtestAndSafetyHolds: true,
		requireYachtMasterAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-yacht-exports-vs-masters',
		name: 'Derived Replays vs Masters',
		description: 'Detect derived 3D race replays, polar overlay PNGs, debrief PDFs, and GPX/KML/CSV track exports backed by a verified NMEA/Foil/VPP/VDR master anchor.',
		familyFilter: 'redundant-yacht-export-previews',
		strategy: 'quarantine-exports-and-yacht-scratch',
		survivorRule: 'yacht-vdr-nmea-master-first',
		protectClassRulesAndVdrBaselines: true,
		protectNmeaFoilHydroMasters: true,
		protectProtestAndSafetyHolds: true,
		requireYachtMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'yacht-class-vdr-shield',
		name: 'Class Rules & VDR Shield',
		description: 'Inspect ORC/IRC hull certificates, AC75/IMOCA foil class rules, IMO VDR packages, and jury protest/casualty holds under strict shield.',
		familyFilter: 'yacht-class-rules-vdr-holds',
		strategy: 'hardlink-immutable-yacht-masters',
		survivorRule: 'yacht-vdr-nmea-master-first',
		protectClassRulesAndVdrBaselines: true,
		protectNmeaFoilHydroMasters: true,
		protectProtestAndSafetyHolds: true,
		requireYachtMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'yacht-nmea-foil-masters',
		name: 'NMEA / Foil / VPP Masters',
		description: 'Audit verified NMEA 0183/2000 PGN logs, hydrofoil load/cavitation DAQ streams, Expedition/Adrena/B&G sessions, VPP polars, and GRIB2 routing masters.',
		familyFilter: 'yacht-nmea-foil-hydro-masters',
		strategy: 'hardlink-immutable-yacht-masters',
		survivorRule: 'yacht-vdr-nmea-master-first',
		protectClassRulesAndVdrBaselines: true,
		protectNmeaFoilHydroMasters: true,
		protectProtestAndSafetyHolds: true,
		requireYachtMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-yacht-racing-nmea-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-yacht-scratch',
	survivorRule: 'yacht-vdr-nmea-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectClassRulesAndVdrBaselines: true,
	protectNmeaFoilHydroMasters: true,
	protectProtestAndSafetyHolds: true,
	requireYachtMasterAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_YACHT_CLASS_VDR_EXT_RE = /\.(?:orc|irc|vdr|svdr|nmea2k|aislog|marpol|imo|protest|yrhold|foilrule|meas)$/i
const CONTEXT_YACHT_CLASS_VDR_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_YACHT_MASTER_EXT_RE = /\.(?:nmea|n2k|canboat|pgn|expedition|adrena|deckman|bng|grib|grb2|vpp|pol|polar|foil|hydro)$/i
const CONTEXT_YACHT_MASTER_EXT_RE = /\.(?:parquet|h5|hdf5|tdms|mat|mf4|blf|cgns|cas|vtk|vtu|bin|npz)$/i
const CONTEXT_YACHT_EXPORT_EXT_RE = /\.(?:mp4|webm|mov|gif|png|jpg|jpeg|webp|pdf|csv|tsv|json|jsonl|gpx|kml|html)$/i
const STRICT_YACHT_SCRATCH_EXT_RE = /\.(?:nmea\.tmp|n2k\.idx|vdr\.part|exp\.bak|adr\.tmp|grib\.idx|polar\.tmp|foil\.lck|vpp\.tmp|can\.part|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_YACHT_EXCLUSION_RE = /(?:hydrograph|bathymetr|multibeam|mbes|sidescan|kongsberg|kmall|s7k|xtf|qimera|caris|sbet|rov_?archive|rov_?survey|xr_?vault|openxr|nerfstudio|3dgs|gsplat|colmap|volcap|winery_?vault|enology|haccp|veterinary|vet_?pacs|vetdcm|epanet|swmm|watergems|v2x|ntcip|etcs|cbtc|railml|quantum|qubit|qasm|geant4|cmssw|orbital|ccsds|human_?bids|dicom|nifti|gdsii|oasis|aerospace_?cfd|nasa_?cfl3d)/i
const YACHT_CONTEXT_HINT_RE = /(?:yacht_?vault|yacht_?racing|regatta|foiling|hydrofoil|ac75|imoca|sailgp|f50|orc_?rule|irc_?rule|vdr_?vault|svdr|nmea|n2k|canboat|pgn_?log|expedition_?nav|adrena|deckman|bng_?h5000|sailmon|vpp_?polar|polar_?table|grib2|cavitation|cant_?angle|ride_?height|towing_?tank|race_?replay|layline|windward_?leeward|ais_?track|maritime_?vdr)/i
const YACHT_PROTEST_HOLD_PATH_RE = /(?:protest_?hold|jury_?hold|yrhold|casualty_?hold|collision_?hold|vdr_?hold|solas_?hold|marpol_?hold|safety_?hold|measurer_?hold|disqualification_?hold|litigation_?hold|regulatory_?hold)/i
const YACHT_BASELINE_PATH_RE = /(?:00_orc|00_irc|00_vdr|00_class_?rules|00_measurement|00_safety|class_?certificates|hull_?offsets|vdr_?baselines|imo_?msc333|foil_?rules|measurement_?baselines)/i
const YACHT_SCRATCH_PATH_RE = /(?:expedition_cache|adrena_route_tmp|nmea_ring_spool|vdr_ingest_buf|foil_cfd_scratch|vpp_solver_tmp|grib_tile_cache|bng_replay_cache|sailgp_telemetry_tmp|ac75_sim_spool|canboat_frame_tmp|regatta_debrief_cache)/i
const YACHT_INTERMEDIATE_PREFIX_RE = /^(?:tmp_nmea_|tmp_n2k_|tmp_vdr_|tmp_foil_|tmp_vpp_|tmp_grib_|tmp_polar_|cache_regatta_|spool_yacht_)/i
const YACHT_INTERMEDIATE_SUFFIX_RE = /(?:_nmea_tmp|_n2k_cache|_vdr_spool|_foil_buf|_vpp_tmp|_grib_cache|_polar_tmp)$/i
const YACHT_EXPORT_PATH_RE = /(?:race_replays|polar_plots|debrief_pdfs|steward_exports|gpx_tracks|layline_renders|telemetry_csvs|track_previews|_replay|_polar_plot|_debrief|_gpx_export|_track_csv|_steward_summary)/i
const CANONICAL_YACHT_VAULT_PATH_RE = /(?:00_raw|00_nmea|00_n2k|00_foil|00_vpp|00_grib|00_hydro|00_masters|canonical|yacht_archive|regatta_archive|telemetry_archive)/i

/**
 * Normalize configuration values for Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeYachtRacingFoilingNmeaConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = YACHT_RACING_FOILING_NMEA_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.familyFilter
	const verdictFilter = YACHT_RACING_FOILING_NMEA_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.verdictFilter
	const strategy = YACHT_RACING_FOILING_NMEA_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.strategy
	const survivorRule = YACHT_RACING_FOILING_NMEA_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.survivorRule
	const sortMode = YACHT_RACING_FOILING_NMEA_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectClassRulesAndVdrBaselines: cfg.protectClassRulesAndVdrBaselines !== undefined ? Boolean(cfg.protectClassRulesAndVdrBaselines) : true,
		protectNmeaFoilHydroMasters: cfg.protectNmeaFoilHydroMasters !== undefined ? Boolean(cfg.protectNmeaFoilHydroMasters) : true,
		protectProtestAndSafetyHolds: cfg.protectProtestAndSafetyHolds !== undefined ? Boolean(cfg.protectProtestAndSafetyHolds) : true,
		requireYachtMasterAnchorForPrune: cfg.requireYachtMasterAnchorForPrune !== undefined ? Boolean(cfg.requireYachtMasterAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized regatta leg, foil test run, or vessel voyage stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized yacht/foil/NMEA stem.
 */
export function extractYachtRacingFoilingNmeaStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:nmea\.tmp|n2k\.idx|vdr\.part|exp\.bak|adr\.tmp|grib\.idx|polar\.tmp|foil\.lck|vpp\.tmp|can\.part)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,12}$/i, '')
	stem = stem.replace(YACHT_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(YACHT_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:replay|polar_plot|debrief|gpx_export|track_csv|steward_summary|summary|export|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'yacht-session'
}

/**
 * Extract canonical anchor key linking derived race replays/GPX/CSV exports to verified NMEA, Foil, VPP, or VDR anchors.
 *
 * @param {string} yachtStem Extracted yacht/foil/NMEA stem.
 * @return {string} Canonical anchor key.
 */
export function extractYachtRacingFoilingNmeaAnchorKey(yachtStem) {
	return String(yachtStem || 'yacht-session')
		.toLowerCase()
		.replace(/(?:[-_](?:orc|irc|vdr|svdr|nmea2k|aislog|protest|yrhold|foilrule|nmea|n2k|canboat|pgn|expedition|adrena|deckman|bng|grib|grb2|vpp|pol|polar|foil|hydro|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'yacht-session'
}

/**
 * Detect Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR telemetry toolchain and workflow stage.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ maritimeToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractMaritimeToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let maritimeToolchain = ''
	if (/\.(?:nmea|n2k|canboat|pgn)\b|nmea|canboat|pgn_?log/.test(text)) {
		maritimeToolchain = 'NMEA 0183 / NMEA 2000 CAN-Bus Telemetry'
	} else if (/\.(?:vdr|svdr|nmea2k|aislog|marpol|imo)\b|vdr_?vault|imo_?msc333|svdr/.test(text)) {
		maritimeToolchain = 'IMO MSC.333(90) VDR / S-VDR Bridge Recorder'
	} else if (/\.(?:foil|hydro|foilrule)\b|hydrofoil|ac75|sailgp|f50|cavitation|cant_?angle|ride_?height|towing_?tank/.test(text)) {
		maritimeToolchain = 'Hydrofoil DAQ, Cavitation & Towing-Tank CFD'
	} else if (/\.(?:expedition|adrena|deckman|bng)\b|expedition|adrena|deckman|bng_?h5000|sailmon/.test(text)) {
		maritimeToolchain = 'Expedition / Adrena / B&G Nav-Suite'
	} else if (/\.(?:vpp|pol|polar|grib|grb2)\b|vpp_?polar|polar_?table|grib2/.test(text)) {
		maritimeToolchain = 'VPP Polar Optimizer & GRIB2 Weather Routing'
	} else if (/\.(?:orc|irc|meas|protest|yrhold)\b|orc_?rule|irc_?rule|hull_?offset|protest_?hold|jury_?hold/.test(text)) {
		maritimeToolchain = 'ORC/IRC Measurement & World Sailing Jury'
	} else if (YACHT_PROTEST_HOLD_PATH_RE.test(text)) {
		maritimeToolchain = 'Maritime Protest, Casualty & Safety Hold'
	}

	let workflowStage = ''
	if (YACHT_PROTEST_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Jury Protest, Casualty or Maritime Safety Hold'
	} else if (STRICT_YACHT_CLASS_VDR_EXT_RE.test(basename) || YACHT_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'ORC/IRC Class Rule or IMO VDR Baseline'
	} else if (YACHT_SCRATCH_PATH_RE.test(text) || STRICT_YACHT_SCRATCH_EXT_RE.test(basename) || YACHT_INTERMEDIATE_PREFIX_RE.test(basename) || YACHT_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Nav-Suite Cache, VPP Solver or Ring-Buffer Scratch'
	} else if (YACHT_EXPORT_PATH_RE.test(text) || (CONTEXT_YACHT_EXPORT_EXT_RE.test(basename) && YACHT_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Race Replay, Polar Plot or GPX/CSV Export'
	} else if (STRICT_YACHT_MASTER_EXT_RE.test(basename) || (CONTEXT_YACHT_MASTER_EXT_RE.test(basename) && (YACHT_CONTEXT_HINT_RE.test(text) || CANONICAL_YACHT_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified NMEA/PGN, Hydrofoil DAQ or VPP Master'
	}

	return { maritimeToolchain, workflowStage }
}

/**
 * Extract concise Yacht Racing, Foil Hydrodynamics & NMEA/VDR domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractYachtDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (YACHT_PROTEST_HOLD_PATH_RE.test(text)) {
		return 'PROTEST / VDR HOLD'
	}
	if (/\.(?:vdr|svdr|nmea2k|aislog|marpol|imo)\b/.test(lowerBase)) {
		return 'IMO VDR / AIS'
	}
	if (/\.(?:orc|irc|protest|yrhold|foilrule|meas)\b/.test(lowerBase)) {
		return 'CLASS RULE / ORC'
	}
	if (/\.(?:nmea|n2k|canboat|pgn)\b/.test(lowerBase)) {
		return 'NMEA / PGN MASTER'
	}
	if (/\.(?:foil|hydro|vpp|pol|polar)\b/.test(lowerBase)) {
		return 'FOIL / VPP MASTER'
	}
	if (/\.(?:expedition|adrena|deckman|bng|grib|grb2)\b/.test(lowerBase)) {
		return 'NAV / GRIB2'
	}
	if (STRICT_YACHT_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'NAV / SIM SCRATCH'
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
 * Classify a single file within the Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyYachtRacingFoilingNmeaFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_YACHT_EXCLUSION_RE.test(lower)
	const hasYachtContext = !hasExcludedContext && YACHT_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && YACHT_BASELINE_PATH_RE.test(lower)
	const isProtestHoldPath = !hasExcludedContext && YACHT_PROTEST_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_YACHT_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && YACHT_SCRATCH_PATH_RE.test(lower)
	const isYachtExportPath = !hasExcludedContext && YACHT_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_YACHT_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (YACHT_INTERMEDIATE_PREFIX_RE.test(lowerBase) || YACHT_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictClassOrVdr = !hasExcludedContext && STRICT_YACHT_CLASS_VDR_EXT_RE.test(lowerBase)
	const isClassOrVdr = !hasExcludedContext && (
		isStrictClassOrVdr
		|| (CONTEXT_YACHT_CLASS_VDR_EXT_RE.test(lowerBase) && !isYachtExportPath && (isBaselinePath || isProtestHoldPath))
	)

	const isContextYachtMaster = CONTEXT_YACHT_MASTER_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasYachtContext || isCanonicalVaultPath)
	const isStrictYachtMaster = !hasExcludedContext && (
		STRICT_YACHT_MASTER_EXT_RE.test(lowerBase)
		|| isContextYachtMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictYachtMaster
		&& !isClassOrVdr
		&& CONTEXT_YACHT_EXPORT_EXT_RE.test(lowerBase)
		&& (hasYachtContext || isYachtExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Yacht Racing, Foiling & NMEA/VDR Vault'
	let isProtectedClassOrVdr = false
	let isProtectedNmeaFoilMaster = false
	let isProtectedProtestHold = false
	let isYachtMasterAnchor = false
	let isRedundantYachtExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictYachtMaster || isClassOrVdr))
		|| (isIntermediateSubfile && (isStrictYachtMaster || isContextExport || hasYachtContext))
		|| (isGenericScratchExt && hasYachtContext && !isBaselinePath && !isProtestHoldPath)
	) {
		family = 'yacht-nav-sim-telemetry-scratch'
		artifactKind = isStrictScratchExt
			? 'NMEA / Nav-Suite / Foil Sim Scratch Artifact'
			: (isIntermediateSubfile ? 'VPP Solver / Ring-Buffer Cache' : 'Expedition / Adrena Routing & Telemetry Scratch')
		vaultRole = 'Nav-Suite Cache, VPP Solver Buffer, or NMEA Ring-Buffer Scratch'
		isMutableFile = true
	} else if (isProtestHoldPath && (isClassOrVdr || isStrictYachtMaster || isContextExport || hasYachtContext)) {
		family = 'yacht-class-rules-vdr-holds'
		artifactKind = 'Jury Protest / Casualty / IMO VDR Safety Hold'
		vaultRole = 'Protected World Sailing Jury Protest, SOLAS VDR, or Casualty Hold'
		isProtectedProtestHold = true
		isProtectedClassOrVdr = true
		isYachtMasterAnchor = isStrictYachtMaster || isClassOrVdr
		isMutableFile = true
	} else if (isClassOrVdr) {
		family = 'yacht-class-rules-vdr-holds'
		if (/\.(?:vdr|svdr|nmea2k|aislog|marpol|imo)$/i.test(lowerBase) || /vdr|svdr|imo_?msc333/.test(lower)) {
			artifactKind = 'IMO VDR / S-VDR Voyage Telemetry Baseline'
			vaultRole = 'Canonical IMO MSC.333(90) Bridge VDR & AIS Compliance Record'
		} else {
			artifactKind = 'ORC / IRC Measurement & Foil Class Rule Baseline'
			vaultRole = 'Canonical Hull Offset, Sail Certificate, or AC75/IMOCA Class Rule'
		}
		isProtectedClassOrVdr = true
		isYachtMasterAnchor = true
		isMutableFile = true
	} else if (isStrictYachtMaster) {
		family = 'yacht-nmea-foil-hydro-masters'
		if (/\.(?:nmea|n2k|canboat|pgn|blf|mf4)$/i.test(lowerBase)) {
			artifactKind = 'NMEA 0183 / 2000 CAN-Bus Telemetry Master'
			vaultRole = 'Immutable Vessel Sensor, Heading, Wind & PGN Frame Master'
			isMutableFile = false
		} else if (/\.(?:foil|hydro|tdms|cgns|cas|vtk|vtu|h5|hdf5)$/i.test(lowerBase)) {
			artifactKind = 'Hydrofoil Load, Cavitation & CFD Tank Master'
			vaultRole = 'Immutable Foil Strain-Gauge, Ride-Height & Hydrodynamic Master'
			isMutableFile = false
		} else if (/\.(?:vpp|pol|polar|grib|grb2)$/i.test(lowerBase)) {
			artifactKind = 'VPP Polar Table / GRIB2 Weather Routing Master'
			vaultRole = 'Canonical Velocity Prediction Polar or Synoptic GRIB2 Master'
			isMutableFile = /\.(?:pol|polar)$/i.test(lowerBase)
		} else {
			artifactKind = 'Expedition / Adrena / B&G Regatta Log Master'
			vaultRole = 'Canonical Tactician Nav-Suite Session & Instrumentation Master'
			isMutableFile = /\.(?:expedition|adrena|deckman)$/i.test(lowerBase)
		}
		isProtectedNmeaFoilMaster = true
		isYachtMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-yacht-export-previews'
		if (/\.(?:mp4|webm|mov|gif)$/i.test(lowerBase)) {
			artifactKind = 'Derived 3D Race-Replay / Foil Telemetry Video'
		} else if (/\.(?:gpx|kml)$/i.test(lowerBase)) {
			artifactKind = 'Derived GPX / KML Regatta Track Export'
		} else if (/\.(?:png|jpg|jpeg|webp|pdf|html)$/i.test(lowerBase)) {
			artifactKind = 'Derived Polar Overlay Plot or Debrief PDF'
		} else {
			artifactKind = 'Derived NMEA / Foil Steward Summary CSV'
		}
		vaultRole = 'Derived Race Replay Video, Polar Plot, or Steward Track Export'
		isRedundantYachtExport = true
		isMutableFile = true
	}

	const { maritimeToolchain, workflowStage } = extractMaritimeToolchainAndStage(normalized, basename)
	const yachtStem = extractYachtRacingFoilingNmeaStem(basename, normalized)
	const yachtAnchorKey = extractYachtRacingFoilingNmeaAnchorKey(yachtStem)
	const yachtTag = extractYachtDomainTag(lowerBase, lower)

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
		maritimeToolchain,
		workflowStage,
		yachtStem,
		yachtAnchorKey,
		yachtTag,
		isProtectedClassOrVdr,
		isProtectedNmeaFoilMaster,
		isProtectedProtestHold,
		isYachtMasterAnchor,
		isRedundantYachtExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'yacht-nav-sim-telemetry-scratch') || (isGenericScratchExt && hasYachtContext && family === 'yacht-nav-sim-telemetry-scratch'),
		isBaselinePath,
		isProtestHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isYachtRacingFoilingNmeaGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyYachtRacingFoilingNmeaFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified NMEA, Foil, VPP, and VDR/Class anchors
 * to derived race replays, polar plots, debrief PDFs, and GPX/CSV track exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildYachtRacingFoilingNmeaCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyYachtRacingFoilingNmeaFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isYachtMasterAnchor) {
				anchorStems.add(meta.yachtStem)
				anchorKeys.add(meta.yachtAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Yacht Racing, Foiling & NMEA/VDR cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'yacht-class-rules-vdr-holds')) {
		return 'yacht-class-rules-vdr-holds'
	}
	if (members.some(m => m.family === 'yacht-nmea-foil-hydro-masters')) {
		return 'yacht-nmea-foil-hydro-masters'
	}
	if (members.some(m => m.family === 'redundant-yacht-export-previews')) {
		return 'redundant-yacht-export-previews'
	}
	return 'yacht-nav-sim-telemetry-scratch'
}

/**
 * Compute deterministic survivor priority score for a Yacht Racing, Foiling & NMEA/VDR vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-regatta-leg-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedProtestHold ? 100000 : 0)
			+ (member.isProtectedClassOrVdr ? 97000 : 0)
			+ (member.isProtectedNmeaFoilMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantYachtExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-foil-run-first') {
		return (member.isProtectedProtestHold ? 100000 : 0)
			+ (member.isProtectedClassOrVdr ? 97000 : 0)
			+ (member.isProtectedNmeaFoilMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantYachtExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedProtestHold ? 52000 : 0)
			+ (member.isProtectedClassOrVdr ? 50000 : 0)
			+ (member.isProtectedNmeaFoilMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedProtestHold ? 100000 : 0)
		+ (member.isProtectedClassOrVdr ? 97000 : 0)
		+ (member.isProtectedNmeaFoilMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantYachtExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry duplicate cluster.
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
		const meta = classifyYachtRacingFoilingNmeaFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.maritimeToolchain)?.maritimeToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].yachtStem || extractYachtRacingFoilingNmeaStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].yachtAnchorKey || extractYachtRacingFoilingNmeaAnchorKey(primaryStem)

	const hasYachtMasterAnchor = Boolean(
		rawMembers.some(m => m.isYachtMasterAnchor)
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

		const isRedundantYachtExportMember = member.isRedundantYachtExport && hasYachtMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantYachtExport) {
			redundancyReason = isRedundantYachtExportMember
				? 'Derived race replay, polar plot, or GPX/CSV export duplicates verified NMEA, Foil, VPP, or VDR master'
				: 'Derived yacht replay or GPX/CSV export without verified NMEA, Foil, VPP, or VDR master anchor'
		}

		let governanceTier = 'yacht-nav-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedProtestHold
				? 'yacht-protest-hold-protected'
				: (member.isProtectedClassOrVdr
					? 'yacht-class-vdr-protected'
					: (member.isProtectedNmeaFoilMaster
						? 'yacht-nmea-foil-master-protected'
						: (member.isRedundantYachtExport
							? 'yacht-export-redundant'
							: 'yacht-nav-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedProtestHold && config.protectProtestAndSafetyHolds) {
			governanceTier = 'yacht-protest-hold-protected'
			shielded = true
			protectedReason = 'World Sailing jury protest, collision casualty, or IMO VDR safety hold strictly conserved'
		} else if (member.isProtectedClassOrVdr && config.protectClassRulesAndVdrBaselines) {
			governanceTier = 'yacht-class-vdr-protected'
			shielded = true
			protectedReason = 'ORC/IRC hull certificate, foil class rule, or IMO VDR baseline strictly conserved'
		} else if (member.isProtectedNmeaFoilMaster && config.protectNmeaFoilHydroMasters) {
			governanceTier = 'yacht-nmea-foil-master-protected'
			shielded = true
			protectedReason = 'Verified NMEA 0183/2000 PGN log, hydrofoil DAQ, VPP polar, or GRIB2 master strictly conserved'
		} else if (isSurvivor && !isRedundantYachtExportMember) {
			governanceTier = member.isProtectedProtestHold
				? 'yacht-protest-hold-protected'
				: (member.isProtectedClassOrVdr
					? 'yacht-class-vdr-protected'
					: (member.isProtectedNmeaFoilMaster
						? 'yacht-nmea-foil-master-protected'
						: (member.isRedundantYachtExport
							? 'yacht-export-redundant'
							: 'yacht-nav-scratch')))
			shielded = true
			protectedReason = 'Canonical Yacht Racing, Foiling & NMEA/VDR vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantYachtExport
				? 'yacht-export-redundant'
				: (member.isProtectedClassOrVdr
					? 'yacht-class-vdr-protected'
					: 'yacht-nav-scratch')
			action = config.strategy === 'hardlink-immutable-yacht-masters' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'yacht-nav-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active regatta nav-suite, VPP solver, or NMEA spool grace window`
		} else if (member.isRedundantYachtExport) {
			governanceTier = 'yacht-export-redundant'
			if (config.requireYachtMasterAnchorForPrune && !hasYachtMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified NMEA, Foil DAQ, VPP, or VDR master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'yacht-nav-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Nav-suite cache, VPP solver buffer, or NMEA ring-buffer scratch eligible for cleanup'
		} else if (member.isProtectedNmeaFoilMaster || member.isProtectedClassOrVdr) {
			governanceTier = member.isProtectedClassOrVdr ? 'yacht-class-vdr-protected' : 'yacht-nmea-foil-master-protected'
			action = config.strategy === 'hardlink-immutable-yacht-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-yacht-masters' && !member.isMutableFile) {
			governanceTier = 'yacht-nmea-foil-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'yacht-nav-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantYachtExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantYachtExport = members.some(m => m.isRedundantYachtExportMember || m.isRedundantYachtExport)
	const hasProtectedProtestHold = members.some(m => m.governanceTier === 'yacht-protest-hold-protected' && m.shielded)
	const hasProtectedClassOrVdr = members.some(m => m.governanceTier === 'yacht-class-vdr-protected' && m.shielded)
	const hasProtectedNmeaFoilMaster = members.some(m => m.governanceTier === 'yacht-nmea-foil-master-protected' && m.shielded)
	const hasYachtNavScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantYachtExportMember && !m.shielded)) {
			clusterVerdict = 'yacht-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'yacht-nav-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedProtestHold) {
		clusterVerdict = 'yacht-protest-hold-protected'
	} else if (hasProtectedClassOrVdr) {
		clusterVerdict = 'yacht-class-vdr-protected'
	} else if (hasProtectedNmeaFoilMaster) {
		clusterVerdict = 'yacht-nmea-foil-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantYachtExport ? 95 : 85
	} else if (hasProtectedProtestHold) {
		priorityScore = 60
	} else if (hasProtectedClassOrVdr) {
		priorityScore = 50
	}

	const yachtTags = [...new Set(members.map(m => m.yachtTag).filter(Boolean))]
	const familyMeta = YACHT_RACING_FOILING_NMEA_FAMILY_META[family] || YACHT_RACING_FOILING_NMEA_FAMILY_META['yacht-nav-sim-telemetry-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		maritimeToolchain: primaryToolchain,
		workflowStage: primaryStage,
		yachtStem: primaryStem,
		yachtAnchorKey: primaryAnchorKey,
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
		hasProtectedClassOrVdr,
		hasProtectedNmeaFoilMaster,
		hasProtectedProtestHold,
		hasRedundantYachtExport,
		hasYachtNavScratch,
		hasYachtMasterAnchor,
		yachtTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Yacht Racing, Foiling & NMEA/VDR vault audit report.
 */
export function auditYachtRacingFoilingNmeaVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeYachtRacingFoilingNmeaConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isYachtRacingFoilingNmeaGroup)
	const correlationIndex = buildYachtRacingFoilingNmeaCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'yacht-class-rules-vdr-holds': 0,
		'yacht-nmea-foil-hydro-masters': 0,
		'redundant-yacht-export-previews': 0,
		'yacht-nav-sim-telemetry-scratch': 0,
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
				cluster.maritimeToolchain,
				cluster.workflowStage,
				cluster.yachtStem,
				cluster.yachtAnchorKey,
				cluster.familyLabel,
				...cluster.yachtTags,
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
	let totalClassVdrClusters = 0
	let totalNmeaFoilMasterClusters = 0
	let totalProtestHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedClassOrVdr) {
			totalClassVdrClusters += 1
		}
		if (cluster.hasProtectedNmeaFoilMaster) {
			totalNmeaFoilMasterClusters += 1
		}
		if (cluster.hasProtectedProtestHold) {
			totalProtestHoldClusters += 1
		}
		if (cluster.hasRedundantYachtExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasYachtNavScratch) {
			totalScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = YACHT_RACING_FOILING_NMEA_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: YACHT_RACING_FOILING_NMEA_FAMILY_META[id].label,
			shortLabel: YACHT_RACING_FOILING_NMEA_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: YACHT_RACING_FOILING_NMEA_VAULT_SCHEMA,
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
			totalClassVdrClusters,
			totalNmeaFoilMasterClusters,
			totalProtestHoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Yacht Racing, Foiling & Maritime NMEA/VDR Vaults.
 * Strictly blocks deletion or hardlinking of shielded Protest/Safety Holds, ORC/IRC/VDR baselines,
 * and verified NMEA/Foil/VPP masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditYachtRacingFoilingNmeaVault.
 * @return {string} POSIX bash script.
 */
export function buildYachtRacingFoilingNmeaRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Telemetry Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./yacht-racing-foiling-nmea-vault-reclaim.sh only after verifying ORC/IRC, VDR, and NMEA/Foil anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.yacht-racing-foiling-nmea-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-yacht-scratch'
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
			} else if (strategy === 'quarantine-exports-and-yacht-scratch' && (target.isRedundantYachtExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable yacht replays or nav/telemetry scratch under active Class Rule, VDR & NMEA/Foil shields.\\n"')
	} else {
		lines.push(`printf "Completed Yacht Racing, Foiling & NMEA/VDR Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditYachtRacingFoilingNmeaVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildYachtRacingFoilingNmeaCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'maritime_toolchain',
		'workflow_stage',
		'yacht_stem',
		'yacht_anchor_key',
		'family',
		'cluster_verdict',
		'has_yacht_master_anchor',
		'is_redundant_yacht_export',
		'is_yacht_nav_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'yacht_tag',
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
				cluster.maritimeToolchain || '',
				cluster.workflowStage || '',
				cluster.yachtStem,
				cluster.yachtAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasYachtMasterAnchor ? 'true' : 'false',
				member.isRedundantYachtExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.yachtTag || '',
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
 * @param {object} auditResult Result from auditYachtRacingFoilingNmeaVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildYachtRacingFoilingNmeaJsonManifest(auditResult) {
	const payload = {
		schema: YACHT_RACING_FOILING_NMEA_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || YACHT_RACING_FOILING_NMEA_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			maritimeToolchain: cluster.maritimeToolchain,
			workflowStage: cluster.workflowStage,
			yachtStem: cluster.yachtStem,
			yachtAnchorKey: cluster.yachtAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedClassOrVdr: cluster.hasProtectedClassOrVdr,
			hasProtectedNmeaFoilMaster: cluster.hasProtectedNmeaFoilMaster,
			hasProtectedProtestHold: cluster.hasProtectedProtestHold,
			hasRedundantYachtExport: cluster.hasRedundantYachtExport,
			hasYachtNavScratch: cluster.hasYachtNavScratch,
			hasYachtMasterAnchor: cluster.hasYachtMasterAnchor,
			yachtTags: cluster.yachtTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				yachtTag: member.yachtTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantYachtExportMember: member.isRedundantYachtExportMember,
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
 * cloud sync of nav-suite caches, VPP solver buffers, and NMEA ring-buffer spools.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildYachtRacingFoilingNmeaSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Vaults',
		'expedition_cache/',
		'adrena_route_tmp/',
		'nmea_ring_spool/',
		'vdr_ingest_buf/',
		'foil_cfd_scratch/',
		'vpp_solver_tmp/',
		'grib_tile_cache/',
		'bng_replay_cache/',
		'sailgp_telemetry_tmp/',
		'ac75_sim_spool/',
		'canboat_frame_tmp/',
		'regatta_debrief_cache/',
		'tmp_nmea_*',
		'tmp_n2k_*',
		'tmp_vdr_*',
		'tmp_foil_*',
		'tmp_vpp_*',
		'tmp_grib_*',
		'tmp_polar_*',
		'cache_regatta_*',
		'spool_yacht_*',
		'*.nmea.tmp',
		'*.n2k.idx',
		'*.vdr.part',
		'*.exp.bak',
		'*.adr.tmp',
		'*.grib.idx',
		'*.polar.tmp',
		'*.foil.lck',
		'*.vpp.tmp',
		'*.can.part',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
