/**
 * Pure Orbital Spaceflight, CCSDS & Satellite Telemetry Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Orbital Spaceflight & Telemetry Vault families:
 * - CCSDS NDM, TLE, GNSS & Flight-Ops Holds (.oem, .opm, .omm, .cdm, .tdm, .aem, .ndm, .xtce, .mib, .tle, .3le, .sp3, .clk, .rnx, .ionex, .eop, ITAR/EAR/ECSS/conjunction holds)
 * - Raw Spacecraft Telemetry, CADU & L0 Masters (.cadu, .vcdu, .ccsds, .tlm, .pkt, .l0, .l1a, .l1b, .spw, .1553, orbital .cdf/.he5/.nc/.h5, ground-station baseband .cf32/.cs16/.sc16/.iq)
 * - Redundant Ephemeris Tables, Ground Tracks & Quicklooks (.czml, .kml, .geojson, .rpt, .csv, .tsv, .json, .xlsx, .parquet, .png, .pdf, .mp4 in orbital/telemetry/pass context)
 * - GMAT, STK, Orekit & Ground-Station Pass Scratch (gmat_tmp/, stk_cache/, orekit_scratch/, yamcs_scratch/, openmct_cache/, cosmos_tmp/, satnogs_tmp/, pass_staging/, .cadu.part, .cadu.tmp, .oem.tmp, .sp3.tmp, .iq.tmp, .lck)
 *
 * Enforces strict ITAR/Flight-Ops Hold, CCSDS/TLE Baseline, and Raw CADU/TLM Master conservation defaults:
 * - Strictly conserves ITAR, EAR, ECSS, conjunction-alert, anomaly, and launch flight-ops holds
 * - Strictly conserves CCSDS Navigation Data Messages (OEM/OPM/OMM/CDM/TDM/AEM), XTCE/MIB schemas, TLE catalogs, and GNSS SP3/RINEX products
 * - Strictly conserves verified raw CADU/VCDU frames, CCSDS packet dumps, L0/L1A/L1B payload masters, SpaceWire/1553 captures, and baseband pass IQ recordings
 * - Detects redundant decoded CSV tables, CZML/KML ground tracks, and pass quicklook plots when a verified Raw Telemetry/CCSDS master anchor exists
 * - Blocks pruning of derived ephemeris/plot exports lacking a verified Orbital Master or CCSDS anchor when guard is active
 * - Blocks hardlinks on mutable CCSDS XML/KVN, TLE, XTCE, CSV, JSON, CZML, KML, and scratch files
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ORBITAL_SPACECRAFT_VAULT_SCHEMA = 'duplicatefinder.orbital-spacecraft-vault-auditor.v1'

export const ORBITAL_SPACECRAFT_FAMILIES = Object.freeze([
	'all',
	'ccsds-flight-dynamics-holds',
	'raw-telemetry-payload-masters',
	'redundant-orbit-ephem-exports',
	'gmat-stk-groundstation-scratch',
])

export const ORBITAL_SPACECRAFT_FAMILY_META = Object.freeze({
	'ccsds-flight-dynamics-holds': {
		id: 'ccsds-flight-dynamics-holds',
		label: 'CCSDS, TLE & Flight Holds',
		shortLabel: 'CCSDS NDM, XTCE/MIB, TLE, GNSS SP3/RINEX & ITAR/Conjunction Holds (.oem, .cdm, .tle, .sp3, .xtce)',
	},
	'raw-telemetry-payload-masters': {
		id: 'raw-telemetry-payload-masters',
		label: 'Raw CADU, TLM & L0',
		shortLabel: 'Verified Raw Frames & Payload Masters (.cadu, .vcdu, .ccsds, .tlm, .l0, .l1a, .cdf, pass .cf32/.iq)',
	},
	'redundant-orbit-ephem-exports': {
		id: 'redundant-orbit-ephem-exports',
		label: 'Redundant Ephem & Plots',
		shortLabel: 'Derived Ground Tracks & Telemetry Exports (.czml, .kml, .csv, .parquet, .rpt, quicklook .png/.mp4)',
	},
	'gmat-stk-groundstation-scratch': {
		id: 'gmat-stk-groundstation-scratch',
		label: 'GMAT, STK & Pass Scratch',
		shortLabel: 'Pass & Mission Scratch (gmat_tmp/, stk_cache/, orekit_scratch/, yamcs_scratch/, satnogs_tmp/, .cadu.part)',
	},
})

export const ORBITAL_SPACECRAFT_STRATEGIES = Object.freeze([
	'prune-exports-and-pass-scratch',
	'hardlink-immutable-cadu-and-l0',
	'quarantine-exports-and-pass-scratch',
])

export const ORBITAL_SPACECRAFT_SURVIVOR_RULES = Object.freeze([
	'ccsds-raw-telemetry-first',
	'oldest-pass-first',
	'newest-ephem-first',
	'shortest-path',
])

export const ORBITAL_SPACECRAFT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'ccsds-flight-protected',
	'raw-telemetry-protected',
	'mission-hold-protected',
	'orbital-export-redundant',
	'pass-scratch-intermediate',
	'shielded',
])

export const ORBITAL_SPACECRAFT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ORBITAL_SPACECRAFT_PRESETS = Object.freeze([
	{
		id: 'all-orbital-spacecraft-audit',
		name: 'All Orbital & CCSDS Vaults',
		description: 'Audit CCSDS NDM/TLE/XTCE baselines, ITAR/conjunction holds, raw CADU/VCDU/TLM/L0 masters, redundant ephemeris/ground-track exports, and GMAT/STK pass scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-pass-scratch',
		survivorRule: 'ccsds-raw-telemetry-first',
		protectCcsdsAndFlightDynamics: true,
		protectRawTelemetryMasters: true,
		protectMissionFlightHolds: true,
		requireOrbitalAnchorForPrune: true,
		keepRecentPassDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'gmat-stk-pass-scratch-cleanup',
		name: 'GMAT, STK & Pass Scratch',
		description: 'Reclaim gmat_tmp/, stk_cache/, orekit_scratch/, yamcs_scratch/, satnogs_tmp/, pass_staging/, and .cadu.part/.iq.tmp scratch older than the active pass grace window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-pass-scratch',
		survivorRule: 'ccsds-raw-telemetry-first',
		protectCcsdsAndFlightDynamics: true,
		protectRawTelemetryMasters: true,
		protectMissionFlightHolds: true,
		requireOrbitalAnchorForPrune: true,
		keepRecentPassDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-ephem-vs-raw-cadu',
		name: 'Redundant Exports vs Raw CADU/L0',
		description: 'Detect decoded telemetry CSV/Parquet tables, CZML/KML ground tracks, and pass quicklook plots backed by a verified Raw CADU/TLM/L0 or CCSDS master anchor.',
		familyFilter: 'redundant-orbit-ephem-exports',
		strategy: 'quarantine-exports-and-pass-scratch',
		survivorRule: 'ccsds-raw-telemetry-first',
		protectCcsdsAndFlightDynamics: true,
		protectRawTelemetryMasters: true,
		protectMissionFlightHolds: true,
		requireOrbitalAnchorForPrune: true,
		keepRecentPassDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'ccsds-tle-flight-holds-shield',
		name: 'CCSDS, TLE & Flight Holds Shield',
		description: 'Inspect CCSDS NDM (.oem, .opm, .omm, .cdm), XTCE/MIB telemetry schemas, TLE catalogs, GNSS SP3/RINEX, and ITAR/conjunction flight holds under strict shield.',
		familyFilter: 'ccsds-flight-dynamics-holds',
		strategy: 'hardlink-immutable-cadu-and-l0',
		survivorRule: 'ccsds-raw-telemetry-first',
		protectCcsdsAndFlightDynamics: true,
		protectRawTelemetryMasters: true,
		protectMissionFlightHolds: true,
		requireOrbitalAnchorForPrune: true,
		keepRecentPassDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-cadu-tlm-l0-masters',
		name: 'Raw CADU, VCDU, TLM & L0 Masters',
		description: 'Audit verified raw CCSDS CADU/VCDU frames, packet dumps, L0/L1A/L1B science payload masters, SpaceWire/1553 captures, and S/X/Ka-band pass IQ masters.',
		familyFilter: 'raw-telemetry-payload-masters',
		strategy: 'hardlink-immutable-cadu-and-l0',
		survivorRule: 'ccsds-raw-telemetry-first',
		protectCcsdsAndFlightDynamics: true,
		protectRawTelemetryMasters: true,
		protectMissionFlightHolds: true,
		requireOrbitalAnchorForPrune: true,
		keepRecentPassDays: 0,
		minSizeKb: 0,
	},
])

export const ORBITAL_SPACECRAFT_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-orbital-spacecraft-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-pass-scratch',
	survivorRule: 'ccsds-raw-telemetry-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCcsdsAndFlightDynamics: true,
	protectRawTelemetryMasters: true,
	protectMissionFlightHolds: true,
	requireOrbitalAnchorForPrune: true,
	keepRecentPassDays: 0,
	minSizeKb: 0,
})

const STRICT_CCSDS_NDM_EXT_RE = /\.(?:oem|opm|omm|cdm|tdm|aem|ndm|xtce|mib|tle|3le|sp3|ionex|eop)$/i
const CONTEXT_GNSS_EXT_RE = /\.(?:clk|rnx|obs|nav)$/i
const STRICT_RAW_TELEMETRY_EXT_RE = /\.(?:cadu|vcdu|ccsds|tlm|pkt|l0|l1a|l1b|spw|1553)$/i
const ORBITAL_SCIENCE_CDF_EXT_RE = /\.(?:cdf|he5|nc|h5|hdf5)$/i
const BASEBAND_IQ_EXT_RE = /\.(?:cf32|cs16|sc16|iq)$/i
const STRICT_ORBITAL_EXPORT_EXT_RE = /\.(?:czml|rpt)$/i
const CONTEXT_ORBITAL_EXPORT_EXT_RE = /\.(?:kml|geojson|csv|tsv|json|xml|xlsx|parquet|feather|txt|png|pdf|mp4|webm)$/i
const STRICT_ORBITAL_SCRATCH_EXT_RE = /\.(?:cadu\.part|cadu\.tmp|vcdu\.tmp|tlm\.tmp|ccsds\.tmp|oem\.tmp|cdm\.tmp|sp3\.tmp|iq\.tmp|cf32\.tmp|l0\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_ORBITAL_EXCLUSION_RE = /(?:neuro|electrophys|bids|kilosort|dicom|nifti|nastran|fluent|hydrograph|multibeam|kmall|s7k|seismic|segy|photoshop|lightroom|premiere|davinci)/i
const ORBITAL_CONTEXT_HINT_RE = /(?:orbital|orbit|spacecraft|satellite|satnogs|ccsds|ecss|flight_?dynamics|fdo|ground_?station|groundstation|sband|s-band|xband|x-band|kaband|ka-band|uhf_?pass|downlink|uplink|telecommand|telemetry|cadu|vcdu|xtce|yamcs|openmct|cosmos_?tlm|orekit|gmat|\bstk\b|tle|conjunction|ephemeris|ephem|apogee|perigee|perilune|cubesat|smallsat|constellation|spacewire|mil-std-1553|payload_l0|level0|l1a|l1b|gnss|rinex|sp3)/i
const ORBITAL_MISSION_HOLD_PATH_RE = /(?:itar_?hold|ear_?hold|flight_?ops_?hold|conjunction_?hold|conjunction_?alert|anomaly_?hold|launch_?hold|ecss_?hold|ccsds_?archive_?hold|mission_?critical_?hold|spacecraft_?hold)/i
const CCSDS_BASELINE_PATH_RE = /(?:00_ccsds|00_ephemeris|00_tle|00_flight_dynamics|00_xtce|flight_dynamics|conjunction|ephemeris_baseline|xtce_schemas|gnss_products)/i
const ORBITAL_SCRATCH_PATH_RE = /(?:gmat_tmp|gmat_cache|stk_cache|stk_tmp|orekit_scratch|orekit_cache|yamcs_scratch|openmct_cache|cosmos_tmp|gnuradio_tmp|satnogs_tmp|pass_staging|ephem_cache|tlm_decode_tmp|baseband_spill|downlink_tmp)/i
const ORBITAL_INTERMEDIATE_PREFIX_RE = /^(?:tmp_cadu_|tmp_vcdu_|tmp_gmat_|tmp_stk_|tmp_orekit_|tmp_pass_|tmp_tlm_|tmp_ephem_|spill_iq_|decode_staging_)/i
const ORBITAL_INTERMEDIATE_SUFFIX_RE = /(?:_gmat_tmp|_stk_tmp|_orekit_tmp|_pass_tmp|_tlm_tmp|_cadu_tmp|_staging)$/i
const ORBITAL_EXPORT_PATH_RE = /(?:decoded_exports|ground_tracks|groundtracks|pass_plots|quicklooks|czml_exports|ephem_reports|stk_reports|gmat_reports|telemetry_csv|_decoded|_groundtrack|_quicklook|_ephem_export)/i
const CANONICAL_ORBITAL_VAULT_PATH_RE = /(?:00_raw|00_cadu|00_telemetry|00_ccsds|00_l0|00_pass_masters|canonical|mission_archive|flight_archive)/i

/**
 * Normalize configuration values for Orbital Spaceflight, CCSDS & Satellite Telemetry Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeOrbitalSpacecraftConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = ORBITAL_SPACECRAFT_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.familyFilter
	const verdictFilter = ORBITAL_SPACECRAFT_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.verdictFilter
	const strategy = ORBITAL_SPACECRAFT_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.strategy
	const survivorRule = ORBITAL_SPACECRAFT_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.survivorRule
	const sortMode = ORBITAL_SPACECRAFT_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentPassDays)
	const keepRecentPassDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: ORBITAL_SPACECRAFT_DEFAULT_CONFIG.keepRecentPassDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : ORBITAL_SPACECRAFT_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCcsdsAndFlightDynamics: cfg.protectCcsdsAndFlightDynamics !== undefined ? Boolean(cfg.protectCcsdsAndFlightDynamics) : true,
		protectRawTelemetryMasters: cfg.protectRawTelemetryMasters !== undefined ? Boolean(cfg.protectRawTelemetryMasters) : true,
		protectMissionFlightHolds: cfg.protectMissionFlightHolds !== undefined ? Boolean(cfg.protectMissionFlightHolds) : true,
		requireOrbitalAnchorForPrune: cfg.requireOrbitalAnchorForPrune !== undefined ? Boolean(cfg.requireOrbitalAnchorForPrune) : true,
		keepRecentPassDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized mission pass or spacecraft stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized pass/mission stem.
 */
export function extractOrbitalSpacecraftStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:cadu\.part|cadu\.tmp|vcdu\.tmp|tlm\.tmp|ccsds\.tmp|oem\.tmp|cdm\.tmp|sp3\.tmp|iq\.tmp|cf32\.tmp|l0\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,8}$/i, '')
	stem = stem.replace(ORBITAL_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(ORBITAL_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:decoded|groundtrack|ground_track|quicklook|ephem|ephemeris|orbit|pass_plot|summary|report|export|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'orbital-pass'
}

/**
 * Extract canonical anchor key linking derived CSV/CZML/KML/plot exports to raw CADU/TLM/CCSDS masters.
 *
 * @param {string} passStem Extracted pass stem.
 * @return {string} Canonical anchor key.
 */
export function extractOrbitalSpacecraftAnchorKey(passStem) {
	return String(passStem || 'orbital-pass')
		.toLowerCase()
		.replace(/(?:[-_](?:cadu|vcdu|ccsds|tlm|pkt|l0|l1a|l1b|oem|opm|omm|cdm|tle|sp3|iq|cf32|decoded|groundtrack|quicklook|report))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'orbital-pass'
}

/**
 * Detect Orbital Spaceflight toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ orbitalToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractOrbitalToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let orbitalToolchain = ''
	if (/\.(?:oem|opm|omm|cdm|tdm|aem|ndm)\b|ccsds/.test(text)) {
		orbitalToolchain = 'CCSDS Navigation / Telemetry'
	} else if (/\.(?:xtce|mib)\b|yamcs|openmct|cosmos/.test(text)) {
		orbitalToolchain = 'XTCE / Yamcs / COSMOS Ops'
	} else if (/\.(?:tle|3le)\b|norad|celestrak/.test(text)) {
		orbitalToolchain = 'TLE / GP Orbital Catalog'
	} else if (/\.(?:sp3|clk|rnx|ionex|eop)\b|rinex|gnss/.test(text)) {
		orbitalToolchain = 'GNSS Precise Orbit (IGS / RINEX)'
	} else if (/\.(?:cadu|vcdu)\b/.test(text)) {
		orbitalToolchain = 'CCSDS CADU / VCDU Frame Sync'
	} else if (/\.(?:l0|l1a|l1b|cdf|he5)\b/.test(text)) {
		orbitalToolchain = 'Spacecraft L0 / SPDF Payload'
	} else if (/\.(?:cf32|cs16|sc16|iq)\b|gnuradio|satnogs/.test(text)) {
		orbitalToolchain = 'Ground-Station Baseband RF (IQ)'
	} else if (/\.(?:spw|1553)\b|spacewire/.test(text)) {
		orbitalToolchain = 'On-Board SpaceWire / 1553 Bus'
	} else if (/gmat|orekit|\bstk\b/.test(text)) {
		orbitalToolchain = 'GMAT / Orekit / STK Flight Dynamics'
	} else if (/\.(?:czml|kml)\b/.test(text)) {
		orbitalToolchain = 'Cesium CZML / KML Ground Track'
	}

	let workflowStage = ''
	if (ORBITAL_MISSION_HOLD_PATH_RE.test(text)) {
		workflowStage = 'ITAR / Flight-Ops / Conjunction Hold'
	} else if (STRICT_CCSDS_NDM_EXT_RE.test(basename) || CONTEXT_GNSS_EXT_RE.test(basename)) {
		workflowStage = 'CCSDS / Flight-Dynamics Baseline'
	} else if (ORBITAL_SCRATCH_PATH_RE.test(text) || STRICT_ORBITAL_SCRATCH_EXT_RE.test(basename) || ORBITAL_INTERMEDIATE_PREFIX_RE.test(basename) || ORBITAL_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'GMAT / STK / Pass Staging Scratch'
	} else if (STRICT_ORBITAL_EXPORT_EXT_RE.test(basename) || ORBITAL_EXPORT_PATH_RE.test(text)) {
		workflowStage = 'Decoded Telemetry / Ground-Track Export'
	} else if (STRICT_RAW_TELEMETRY_EXT_RE.test(basename) || ORBITAL_SCIENCE_CDF_EXT_RE.test(basename) || BASEBAND_IQ_EXT_RE.test(basename)) {
		workflowStage = 'Raw Spacecraft Telemetry / Pass Master'
	}

	return { orbitalToolchain, workflowStage }
}

/**
 * Extract concise Orbital Spaceflight domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractOrbitalDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (ORBITAL_MISSION_HOLD_PATH_RE.test(text)) {
		return 'FLIGHT-OPS / ITAR HOLD'
	}
	if (/\.(?:oem|opm|omm|cdm|tdm|aem|ndm)\b/.test(lowerBase)) {
		return 'CCSDS NDM'
	}
	if (/\.(?:xtce|mib)\b/.test(lowerBase)) {
		return 'XTCE / MIB SCHEMA'
	}
	if (/\.(?:tle|3le)\b/.test(lowerBase)) {
		return 'TLE CATALOG'
	}
	if (/\.(?:sp3|clk|rnx|ionex|eop)\b/.test(lowerBase)) {
		return 'GNSS SP3 / RINEX'
	}
	if (/\.(?:cadu|vcdu)\b/.test(lowerBase)) {
		return 'CADU / VCDU FRAME'
	}
	if (/\.(?:ccsds|tlm|pkt)\b/.test(lowerBase)) {
		return 'CCSDS TELEMETRY'
	}
	if (/\.(?:l0|l1a|l1b)\b/.test(lowerBase)) {
		return 'PAYLOAD L0 / L1'
	}
	if (/\.(?:cf32|cs16|sc16|iq)\b/.test(lowerBase)) {
		return 'BASEBAND PASS IQ'
	}
	if (/\.czml\b/.test(lowerBase)) {
		return 'CZML GROUND TRACK'
	}
	if (STRICT_ORBITAL_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'PASS / FDO SCRATCH'
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
 * Classify a single file within the Orbital Spaceflight, CCSDS & Satellite Telemetry domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyOrbitalSpacecraftFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_ORBITAL_EXCLUSION_RE.test(lower)
	const hasOrbitalContext = !hasExcludedContext && ORBITAL_CONTEXT_HINT_RE.test(lower)
	const isCcsdsBaselinePath = !hasExcludedContext && CCSDS_BASELINE_PATH_RE.test(lower)
	const isMissionHoldPath = !hasExcludedContext && ORBITAL_MISSION_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_ORBITAL_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && ORBITAL_SCRATCH_PATH_RE.test(lower)
	const isOrbitalExportPath = !hasExcludedContext && ORBITAL_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_ORBITAL_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (ORBITAL_INTERMEDIATE_PREFIX_RE.test(lowerBase) || ORBITAL_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isCcsdsOrFlightBaseline = !hasExcludedContext && (
		STRICT_CCSDS_NDM_EXT_RE.test(lowerBase)
		|| (CONTEXT_GNSS_EXT_RE.test(lowerBase) && (hasOrbitalContext || isCcsdsBaselinePath || /rinex|gnss|igs|orbit/i.test(lower)))
	)

	const isOrbitalScienceMaster = ORBITAL_SCIENCE_CDF_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasOrbitalContext || isCanonicalVaultPath)
	const isBasebandMaster = BASEBAND_IQ_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasOrbitalContext || isCanonicalVaultPath || /pass_|downlink|sband|xband|kaband|satnogs/i.test(lower))
	const isStrictRawTelemetryExt = !hasExcludedContext && (
		STRICT_RAW_TELEMETRY_EXT_RE.test(lowerBase)
		|| isOrbitalScienceMaster
		|| isBasebandMaster
	)

	const isContextExport = !hasExcludedContext && (
		STRICT_ORBITAL_EXPORT_EXT_RE.test(lowerBase)
		|| (CONTEXT_ORBITAL_EXPORT_EXT_RE.test(lowerBase) && !isStrictRawTelemetryExt && !isCcsdsOrFlightBaseline && (hasOrbitalContext || isOrbitalExportPath))
	)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Orbital Spaceflight & CCSDS Vault'
	let isProtectedCcsdsFlightDynamics = false
	let isProtectedRawTelemetryMaster = false
	let isProtectedMissionFlightHold = false
	let isOrbitalMasterAnchor = false
	let isRedundantOrbitalExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictRawTelemetryExt || isCcsdsOrFlightBaseline))
		|| (isIntermediateSubfile && (isStrictRawTelemetryExt || isContextExport || hasOrbitalContext))
		|| (isGenericScratchExt && hasOrbitalContext)
	) {
		family = 'gmat-stk-groundstation-scratch'
		artifactKind = isStrictScratchExt
			? 'CADU / Ephemeris / Baseband Staging Scratch'
			: (isIntermediateSubfile ? 'GMAT / STK / Orekit Intermediate Cache' : 'Ground-Station / Yamcs / SatNOGS Scratch')
		vaultRole = 'GMAT, STK, Orekit, Yamcs or Ground-Station Scratch'
		isMutableFile = true
	} else if (isMissionHoldPath && (isCcsdsOrFlightBaseline || isStrictRawTelemetryExt || isContextExport || hasOrbitalContext)) {
		family = 'ccsds-flight-dynamics-holds'
		artifactKind = 'ITAR / Flight-Ops / Conjunction Hold'
		vaultRole = 'Protected Mission-Critical & Regulatory Hold'
		isProtectedMissionFlightHold = true
		isProtectedCcsdsFlightDynamics = true
		isOrbitalMasterAnchor = isStrictRawTelemetryExt || isCcsdsOrFlightBaseline
		isMutableFile = /\.(?:oem|opm|omm|cdm|tdm|aem|ndm|xtce|mib|tle|3le|sp3|clk|rnx|csv|tsv|json|xml|txt|log)$/i.test(lowerBase) || isCcsdsOrFlightBaseline
	} else if (isCcsdsOrFlightBaseline) {
		family = 'ccsds-flight-dynamics-holds'
		if (/\.(?:oem|opm|omm|cdm|tdm|aem|ndm)$/i.test(lowerBase)) {
			artifactKind = 'CCSDS Navigation Data Message (NDM)'
			vaultRole = 'Canonical Orbit, Attitude & Conjunction Baseline'
		} else if (/\.(?:xtce|mib)$/i.test(lowerBase)) {
			artifactKind = 'XTCE / SCOS-2000 MIB Telemetry Schema'
			vaultRole = 'Canonical Spacecraft Packet & Calibration Dictionary'
		} else if (/\.(?:tle|3le)$/i.test(lowerBase)) {
			artifactKind = 'Two-Line / Three-Line Element Catalog'
			vaultRole = 'Canonical Orbital Ephemeris Catalog'
		} else {
			artifactKind = 'GNSS Precise Orbit / RINEX / EOP Baseline'
			vaultRole = 'Canonical IGS Orbit, Clock & Timing Product'
		}
		isProtectedCcsdsFlightDynamics = true
		isOrbitalMasterAnchor = true
		isMutableFile = true
	} else if (isStrictRawTelemetryExt) {
		family = 'raw-telemetry-payload-masters'
		if (/\.(?:cadu|vcdu)$/i.test(lowerBase)) {
			artifactKind = 'CCSDS CADU / VCDU Transfer Frame Master'
			vaultRole = 'Unaltered Downlink Channel & Frame Master'
		} else if (/\.(?:ccsds|tlm|pkt)$/i.test(lowerBase)) {
			artifactKind = 'Raw CCSDS Space Packet Telemetry Master'
			vaultRole = 'Canonical Spacecraft TM/TC Packet Stream'
		} else if (/\.(?:l0|l1a|l1b)$/i.test(lowerBase)) {
			artifactKind = 'Payload Level-0 / Level-1 Science Master'
			vaultRole = 'Unreprocessed Instrument Telemetry Master'
		} else if (/\.(?:spw|1553)$/i.test(lowerBase)) {
			artifactKind = 'SpaceWire / MIL-STD-1553 Bus Capture'
			vaultRole = 'Flight Computer & Avionics Bus Master'
		} else if (isBasebandMaster) {
			artifactKind = 'Ground-Station Baseband Pass IQ Master'
			vaultRole = 'Raw S / X / Ka-Band Downlink Recording'
		} else {
			artifactKind = 'Spacecraft CDF / HDF5 / NetCDF Science Master'
			vaultRole = 'Canonical Orbital Instrument Data Master'
		}
		isProtectedRawTelemetryMaster = true
		isOrbitalMasterAnchor = true
		isMutableFile = /\.(?:xml|json)$/i.test(lowerBase)
	} else if (isContextExport) {
		family = 'redundant-orbit-ephem-exports'
		if (/\.czml$/i.test(lowerBase) || /\.(?:kml|geojson)$/i.test(lowerBase)) {
			artifactKind = 'CZML / KML Ground-Track Visualization Export'
		} else if (/\.rpt$/i.test(lowerBase) || /\.txt$/i.test(lowerBase)) {
			artifactKind = 'GMAT / STK Ephemeris Report Export'
		} else if (/\.(?:csv|tsv|xlsx|parquet|feather|json|xml)$/i.test(lowerBase)) {
			artifactKind = 'Decoded Telemetry / Pass Table Export'
		} else {
			artifactKind = 'Pass Quicklook / Orbit Plot Export'
		}
		vaultRole = 'Derived Telemetry, Ground-Track or Plot Export'
		isRedundantOrbitalExport = true
		isMutableFile = true
	}

	const { orbitalToolchain, workflowStage } = extractOrbitalToolchainAndStage(normalized, basename)
	const passStem = extractOrbitalSpacecraftStem(basename, normalized)
	const orbitalAnchorKey = extractOrbitalSpacecraftAnchorKey(passStem)
	const orbitalTag = extractOrbitalDomainTag(lowerBase, lower)

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
		orbitalToolchain,
		workflowStage,
		passStem,
		orbitalAnchorKey,
		orbitalTag,
		isProtectedCcsdsFlightDynamics,
		isProtectedRawTelemetryMaster,
		isProtectedMissionFlightHold,
		isOrbitalMasterAnchor,
		isRedundantOrbitalExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'gmat-stk-groundstation-scratch') || (isGenericScratchExt && hasOrbitalContext),
		isCcsdsBaselinePath,
		isMissionHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Orbital Spaceflight & CCSDS domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isOrbitalSpacecraftGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyOrbitalSpacecraftFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Raw Telemetry/CCSDS/Flight-Dynamics anchors
 * to derived CZML/KML ground tracks, decoded CSV tables, and pass quicklook exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildOrbitalSpacecraftCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyOrbitalSpacecraftFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isOrbitalMasterAnchor) {
				anchorStems.add(meta.passStem)
				anchorKeys.add(meta.orbitalAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Orbital Spaceflight cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'ccsds-flight-dynamics-holds')) {
		return 'ccsds-flight-dynamics-holds'
	}
	if (members.some(m => m.family === 'raw-telemetry-payload-masters')) {
		return 'raw-telemetry-payload-masters'
	}
	if (members.some(m => m.family === 'redundant-orbit-ephem-exports')) {
		return 'redundant-orbit-ephem-exports'
	}
	return 'gmat-stk-groundstation-scratch'
}

/**
 * Compute deterministic survivor priority score for an Orbital Spaceflight vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-pass-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedMissionFlightHold ? 100000 : 0)
			+ (member.isProtectedCcsdsFlightDynamics ? 97000 : 0)
			+ (member.isProtectedRawTelemetryMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isCcsdsBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantOrbitalExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-ephem-first') {
		return (member.isProtectedMissionFlightHold ? 100000 : 0)
			+ (member.isProtectedCcsdsFlightDynamics ? 97000 : 0)
			+ (member.isProtectedRawTelemetryMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantOrbitalExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedMissionFlightHold ? 52000 : 0)
			+ (member.isProtectedCcsdsFlightDynamics ? 50000 : 0)
			+ (member.isProtectedRawTelemetryMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedMissionFlightHold ? 100000 : 0)
		+ (member.isProtectedCcsdsFlightDynamics ? 97000 : 0)
		+ (member.isProtectedRawTelemetryMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isCcsdsBaselinePath ? 10000 : 0)
		+ (member.isRedundantOrbitalExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Orbital Spaceflight & CCSDS duplicate cluster.
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
		const meta = classifyOrbitalSpacecraftFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.orbitalToolchain)?.orbitalToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].passStem || extractOrbitalSpacecraftStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].orbitalAnchorKey || extractOrbitalSpacecraftAnchorKey(primaryStem)

	const hasOrbitalMasterAnchor = Boolean(
		rawMembers.some(m => m.isOrbitalMasterAnchor)
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

		const isRedundantOrbitalExportMember = member.isRedundantOrbitalExport && hasOrbitalMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantOrbitalExport) {
			redundancyReason = isRedundantOrbitalExportMember
				? 'Derived telemetry CSV, CZML/KML ground track, or quicklook plot duplicates verified Raw CADU/TLM/CCSDS master'
				: 'Decoded telemetry or ephemeris export without verified Raw Telemetry or CCSDS master anchor'
		}

		let governanceTier = 'pass-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedMissionFlightHold
				? 'mission-hold-protected'
				: (member.isProtectedCcsdsFlightDynamics
					? 'ccsds-flight-protected'
					: (member.isProtectedRawTelemetryMaster
						? 'raw-telemetry-protected'
						: (member.isRedundantOrbitalExport
							? 'orbital-export-redundant'
							: 'pass-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedMissionFlightHold && config.protectMissionFlightHolds) {
			governanceTier = 'mission-hold-protected'
			shielded = true
			protectedReason = 'ITAR, EAR, ECSS, conjunction, or flight-ops anomaly hold strictly conserved'
		} else if (member.isProtectedCcsdsFlightDynamics && config.protectCcsdsAndFlightDynamics) {
			governanceTier = 'ccsds-flight-protected'
			shielded = true
			protectedReason = 'CCSDS NDM, XTCE/MIB schema, TLE catalog, or GNSS SP3/RINEX baseline strictly conserved'
		} else if (member.isProtectedRawTelemetryMaster && config.protectRawTelemetryMasters) {
			governanceTier = 'raw-telemetry-protected'
			shielded = true
			protectedReason = 'Verified raw CADU, VCDU, CCSDS, TLM, L0/L1, SpaceWire/1553, or baseband IQ master strictly conserved'
		} else if (isSurvivor && !isRedundantOrbitalExportMember) {
			governanceTier = member.isProtectedMissionFlightHold
				? 'mission-hold-protected'
				: (member.isProtectedCcsdsFlightDynamics
					? 'ccsds-flight-protected'
					: (member.isProtectedRawTelemetryMaster
						? 'raw-telemetry-protected'
						: (member.isRedundantOrbitalExport
							? 'orbital-export-redundant'
							: 'pass-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Orbital Spaceflight & CCSDS vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantOrbitalExport
				? 'orbital-export-redundant'
				: (member.isProtectedCcsdsFlightDynamics
					? 'ccsds-flight-protected'
					: 'pass-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-cadu-and-l0' && !member.isMutableFile && !member.isScratchPath
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
			config.keepRecentPassDays > 0
			&& member.isScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentPassDays
		) {
			governanceTier = 'pass-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentPassDays}-day active GMAT, STK, Orekit, or pass grace window`
		} else if (member.isRedundantOrbitalExport) {
			governanceTier = 'orbital-export-redundant'
			if (config.requireOrbitalAnchorForPrune && !hasOrbitalMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Raw CADU, VCDU, TLM, L0, or CCSDS master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'pass-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'GMAT, STK, Orekit, Yamcs, SatNOGS, or pass staging scratch eligible for cleanup'
		} else if (member.isProtectedRawTelemetryMaster || member.isProtectedCcsdsFlightDynamics) {
			governanceTier = member.isProtectedCcsdsFlightDynamics ? 'ccsds-flight-protected' : 'raw-telemetry-protected'
			action = config.strategy === 'hardlink-immutable-cadu-and-l0' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-cadu-and-l0' && !member.isMutableFile) {
			governanceTier = 'raw-telemetry-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'pass-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantOrbitalExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantOrbitalExport = members.some(m => m.isRedundantOrbitalExportMember || m.isRedundantOrbitalExport)
	const hasProtectedMissionHold = members.some(m => m.governanceTier === 'mission-hold-protected' && m.shielded)
	const hasProtectedCcsdsFlight = members.some(m => m.governanceTier === 'ccsds-flight-protected' && m.shielded)
	const hasProtectedRawTelemetryMaster = members.some(m => m.governanceTier === 'raw-telemetry-protected' && m.shielded)
	const hasPassScratchIntermediate = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantOrbitalExportMember && !m.shielded)) {
			clusterVerdict = 'orbital-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'pass-scratch-intermediate'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedMissionHold) {
		clusterVerdict = 'mission-hold-protected'
	} else if (hasProtectedCcsdsFlight) {
		clusterVerdict = 'ccsds-flight-protected'
	} else if (hasProtectedRawTelemetryMaster) {
		clusterVerdict = 'raw-telemetry-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantOrbitalExport ? 95 : 85
	} else if (hasProtectedMissionHold) {
		priorityScore = 60
	} else if (hasProtectedCcsdsFlight) {
		priorityScore = 50
	}

	const orbitalTags = [...new Set(members.map(m => m.orbitalTag).filter(Boolean))]
	const familyMeta = ORBITAL_SPACECRAFT_FAMILY_META[family] || ORBITAL_SPACECRAFT_FAMILY_META['gmat-stk-groundstation-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		orbitalToolchain: primaryToolchain,
		workflowStage: primaryStage,
		passStem: primaryStem,
		orbitalAnchorKey: primaryAnchorKey,
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
		hasProtectedCcsdsFlight,
		hasProtectedRawTelemetryMaster,
		hasProtectedMissionHold,
		hasRedundantOrbitalExport,
		hasPassScratchIntermediate,
		hasOrbitalMasterAnchor,
		orbitalTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as an Orbital Spaceflight, CCSDS & Satellite Telemetry Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Orbital Spaceflight vault audit report.
 */
export function auditOrbitalSpacecraftVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeOrbitalSpacecraftConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isOrbitalSpacecraftGroup)
	const correlationIndex = buildOrbitalSpacecraftCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'ccsds-flight-dynamics-holds': 0,
		'raw-telemetry-payload-masters': 0,
		'redundant-orbit-ephem-exports': 0,
		'gmat-stk-groundstation-scratch': 0,
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
				cluster.orbitalToolchain,
				cluster.workflowStage,
				cluster.passStem,
				cluster.orbitalAnchorKey,
				cluster.familyLabel,
				...cluster.orbitalTags,
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
	let totalCcsdsFlightClusters = 0
	let totalRawTelemetryMasterClusters = 0
	let totalMissionHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalPassScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCcsdsFlight) {
			totalCcsdsFlightClusters += 1
		}
		if (cluster.hasProtectedRawTelemetryMaster) {
			totalRawTelemetryMasterClusters += 1
		}
		if (cluster.hasProtectedMissionHold) {
			totalMissionHoldClusters += 1
		}
		if (cluster.hasRedundantOrbitalExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasPassScratchIntermediate) {
			totalPassScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = ORBITAL_SPACECRAFT_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ORBITAL_SPACECRAFT_FAMILY_META[id].label,
			shortLabel: ORBITAL_SPACECRAFT_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ORBITAL_SPACECRAFT_VAULT_SCHEMA,
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
			totalCcsdsFlightClusters,
			totalRawTelemetryMasterClusters,
			totalMissionHoldClusters,
			totalRedundantExportClusters,
			totalPassScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Orbital Spaceflight & CCSDS Vaults.
 * Strictly blocks deletion or hardlinking of shielded CCSDS baselines, ITAR/Flight-Ops holds,
 * and verified Raw CADU/TLM/L0 masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditOrbitalSpacecraftVault.
 * @return {string} POSIX bash script.
 */
export function buildOrbitalSpacecraftRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Orbital Spaceflight, CCSDS & Satellite Telemetry Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./orbital-spacecraft-vault-reclaim.sh only after verifying Raw CADU/VCDU/TLM/L0 and CCSDS anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.orbital-spacecraft-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-pass-scratch'
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
			} else if (strategy === 'quarantine-exports-and-pass-scratch' && (target.isRedundantOrbitalExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable exports or pass scratch under active Orbital & CCSDS shields.\\n"')
	} else {
		lines.push(`printf "Completed Orbital Spaceflight & CCSDS Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditOrbitalSpacecraftVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildOrbitalSpacecraftCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'orbital_toolchain',
		'workflow_stage',
		'pass_stem',
		'orbital_anchor_key',
		'family',
		'cluster_verdict',
		'has_orbital_master_anchor',
		'is_redundant_orbital_export',
		'is_pass_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'orbital_tag',
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
				cluster.orbitalToolchain || '',
				cluster.workflowStage || '',
				cluster.passStem,
				cluster.orbitalAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasOrbitalMasterAnchor ? 'true' : 'false',
				member.isRedundantOrbitalExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.orbitalTag || '',
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
 * @param {object} auditResult Result from auditOrbitalSpacecraftVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildOrbitalSpacecraftJsonManifest(auditResult) {
	const payload = {
		schema: ORBITAL_SPACECRAFT_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ORBITAL_SPACECRAFT_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			orbitalToolchain: cluster.orbitalToolchain,
			workflowStage: cluster.workflowStage,
			passStem: cluster.passStem,
			orbitalAnchorKey: cluster.orbitalAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCcsdsFlight: cluster.hasProtectedCcsdsFlight,
			hasProtectedRawTelemetryMaster: cluster.hasProtectedRawTelemetryMaster,
			hasProtectedMissionHold: cluster.hasProtectedMissionHold,
			hasRedundantOrbitalExport: cluster.hasRedundantOrbitalExport,
			hasPassScratchIntermediate: cluster.hasPassScratchIntermediate,
			hasOrbitalMasterAnchor: cluster.hasOrbitalMasterAnchor,
			orbitalTags: cluster.orbitalTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				orbitalTag: member.orbitalTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantOrbitalExportMember: member.isRedundantOrbitalExportMember,
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
 * cloud sync of GMAT, STK, Orekit, Yamcs, OpenMCT, COSMOS, GNU Radio, and SatNOGS pass scratch directories.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildOrbitalSpacecraftSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Orbital Spaceflight & CCSDS Vaults',
		'gmat_tmp/',
		'gmat_cache/',
		'stk_cache/',
		'stk_tmp/',
		'orekit_scratch/',
		'orekit_cache/',
		'yamcs_scratch/',
		'openmct_cache/',
		'cosmos_tmp/',
		'gnuradio_tmp/',
		'satnogs_tmp/',
		'pass_staging/',
		'ephem_cache/',
		'tlm_decode_tmp/',
		'baseband_spill/',
		'downlink_tmp/',
		'tmp_cadu_*',
		'tmp_vcdu_*',
		'tmp_gmat_*',
		'tmp_stk_*',
		'tmp_orekit_*',
		'tmp_pass_*',
		'tmp_tlm_*',
		'tmp_ephem_*',
		'spill_iq_*',
		'*.cadu.part',
		'*.cadu.tmp',
		'*.vcdu.tmp',
		'*.tlm.tmp',
		'*.ccsds.tmp',
		'*.oem.tmp',
		'*.cdm.tmp',
		'*.sp3.tmp',
		'*.iq.tmp',
		'*.cf32.tmp',
		'*.l0.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
