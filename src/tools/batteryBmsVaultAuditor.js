/**
 * Pure Battery, EV Powertrain, BMS Telemetry & HIL Dyno Test Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Battery & EV BMS Vault families:
 * - BMS Calibration, DBC/ARXML & Homologation (.a2l, .dcm, .cdfx, .s19, .hex, .dbc, .arxml, .slx, .mdl, .fmu, .sdf, UN R100 / ISO 26262 / UL 2580)
 * - Compressed MDF4, HDF5 & Cycler Masters (.mf4, .mf4.gz, .mf4.zst, .blf, .blf.gz, .h5, .hdf5, .parquet, .ndax, .nda, .mpr, .mpt)
 * - Raw ASCII CAN & Re-Exported Cycler/Dyno Dumps (.asc, .trc, .clg, .csv, .tsv, .txt, .mat, .tdms, .mdf, .dat in battery/bms/cycler/dyno context)
 * - HIL & Dyno Bench Scratch & Build Cache (dspace_tmp/, controldesk_tmp/, veristand_tmp/, canape_tmp/, inca_tmp/, dyno_cache/, hil_scratch/, slprj/, .slxc, .lck, .tmp)
 *
 * Enforces strict homologation, BMS calibration, and compressed MDF4/HDF5/cycler anchor defaults:
 * - Strictly conserves BMS calibration, CAN/ARXML network definitions, Simulink/HIL models, and UN R100 / ISO 26262 homologation artifacts
 * - Strictly conserves compressed MDF4/BLF/HDF5/Parquet telemetry and native BioLogic/Neware cycler masters
 * - Detects redundant ASCII CAN (.asc/.trc) and CSV/MAT/TDMS exports when a verified .mf4/.blf/.h5/.parquet/.ndax/.mpr anchor exists
 * - Blocks deletion of raw exports lacking a verified compressed/binary anchor when guard is active
 * - Blocks hardlinks on mutable calibration/model/ASCII files and HIL/dyno bench scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const BATTERY_BMS_VAULT_SCHEMA = 'duplicatefinder.battery-bms-vault-auditor.v1'

export const BATTERY_BMS_FAMILIES = Object.freeze([
	'all',
	'bms-calibration-homologation',
	'compressed-telemetry-cycler',
	'raw-cycler-csv-exports',
	'hil-dyno-scratch-logs',
])

export const BATTERY_BMS_FAMILY_META = Object.freeze({
	'bms-calibration-homologation': {
		id: 'bms-calibration-homologation',
		label: 'Calibration & Homologation',
		shortLabel: 'BMS Calibration & Cert (.a2l, .dcm, .dbc, .arxml, .s19, .slx, UN R100)',
	},
	'compressed-telemetry-cycler': {
		id: 'compressed-telemetry-cycler',
		label: 'MDF4, HDF5 & Cycler',
		shortLabel: 'Telemetry & Cycler Masters (.mf4, .mf4.zst, .blf, .h5, .parquet, .ndax, .mpr)',
	},
	'raw-cycler-csv-exports': {
		id: 'raw-cycler-csv-exports',
		label: 'Raw CSV / ASC / TDMS',
		shortLabel: 'Raw Exports (.asc, .trc, .csv, .mat, .tdms, .mdf)',
	},
	'hil-dyno-scratch-logs': {
		id: 'hil-dyno-scratch-logs',
		label: 'HIL & Dyno Scratch',
		shortLabel: 'Bench Scratch (dspace_tmp/, canape_tmp/, dyno_cache/, slprj/, .slxc, .lck)',
	},
})

export const BATTERY_BMS_STRATEGIES = Object.freeze([
	'prune-raw-exports-and-bench-scratch',
	'hardlink-immutable-telemetry-and-cycler',
	'quarantine-raw-exports-and-scratch',
])

export const BATTERY_BMS_SURVIVOR_RULES = Object.freeze([
	'homologation-mdf4-first',
	'oldest-test-run-first',
	'newest-calibration-first',
	'shortest-path',
])

export const BATTERY_BMS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'calibration-homologation-protected',
	'telemetry-archive-protected',
	'homologation-abuse-protected',
	'raw-export-redundant',
	'hil-dyno-scratch-intermediate',
	'shielded',
])

export const BATTERY_BMS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const BATTERY_BMS_PRESETS = Object.freeze([
	{
		id: 'all-battery-bms-audit',
		name: 'All Battery & BMS Vaults',
		description: 'Audit BMS calibration (.a2l/.dcm/.dbc/.slx), UN R100/ISO 26262 homologation packs, MDF4/BLF/HDF5/cycler masters, raw CSV/ASC exports, and HIL/dyno scratch.',
		familyFilter: 'all',
		strategy: 'prune-raw-exports-and-bench-scratch',
		survivorRule: 'homologation-mdf4-first',
		protectCalibrationAndHomologation: true,
		protectCompressedTelemetryAnchors: true,
		protectThermalAbuseEvidence: true,
		requireCompressedAnchorForPrune: true,
		keepRecentBenchRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hil-dyno-scratch-cleanup',
		name: 'HIL & Dyno Scratch Cache',
		description: 'Reclaim redundant dspace_tmp/, controldesk_tmp/, canape_tmp/, inca_tmp/, slprj/, dyno_cache/, and .slxc/.lck scratch older than the active test bench grace window.',
		familyFilter: 'all',
		strategy: 'prune-raw-exports-and-bench-scratch',
		survivorRule: 'homologation-mdf4-first',
		protectCalibrationAndHomologation: true,
		protectCompressedTelemetryAnchors: true,
		protectThermalAbuseEvidence: true,
		requireCompressedAnchorForPrune: true,
		keepRecentBenchRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'raw-csv-asc-vs-mdf4-audit',
		name: 'Redundant .csv/.asc vs .mf4/.h5',
		description: 'Detect uncompressed ASCII CAN (.asc/.trc) and CSV/TDMS telemetry exports backed by a verified .mf4, .mf4.zst, .blf, .h5, or .parquet archive anchor.',
		familyFilter: 'raw-cycler-csv-exports',
		strategy: 'quarantine-raw-exports-and-scratch',
		survivorRule: 'homologation-mdf4-first',
		protectCalibrationAndHomologation: true,
		protectCompressedTelemetryAnchors: true,
		protectThermalAbuseEvidence: true,
		requireCompressedAnchorForPrune: true,
		keepRecentBenchRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cycler-eis-exports-audit',
		name: 'Cycler .csv/.mat vs .ndax/.mpr',
		description: 'Audit BioLogic, Arbin, Neware, and Maccor cell-cycler CSV/MAT/TDMS re-exports paired with canonical .ndax, .nda, .mpr, .h5, or .parquet formation masters.',
		familyFilter: 'all',
		strategy: 'quarantine-raw-exports-and-scratch',
		survivorRule: 'homologation-mdf4-first',
		protectCalibrationAndHomologation: true,
		protectCompressedTelemetryAnchors: true,
		protectThermalAbuseEvidence: true,
		requireCompressedAnchorForPrune: true,
		keepRecentBenchRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'homologation-a2l-shield',
		name: 'Homologation, .a2l & .dbc Shield',
		description: 'Inspect BMS calibration files (.a2l/.dcm/.s19/.hex), CAN/ARXML databases, Simulink/FMU models, and UN R100 thermal-abuse packs under strict safety preservation.',
		familyFilter: 'bms-calibration-homologation',
		strategy: 'hardlink-immutable-telemetry-and-cycler',
		survivorRule: 'homologation-mdf4-first',
		protectCalibrationAndHomologation: true,
		protectCompressedTelemetryAnchors: true,
		protectThermalAbuseEvidence: true,
		requireCompressedAnchorForPrune: true,
		keepRecentBenchRunDays: 0,
		minSizeKb: 0,
	},
])

export const BATTERY_BMS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-battery-bms-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-raw-exports-and-bench-scratch',
	survivorRule: 'homologation-mdf4-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCalibrationAndHomologation: true,
	protectCompressedTelemetryAnchors: true,
	protectThermalAbuseEvidence: true,
	requireCompressedAnchorForPrune: true,
	keepRecentBenchRunDays: 0,
	minSizeKb: 0,
})

const STRICT_CALIBRATION_EXT_RE = /\.(?:a2l|dcm|cdfx|s19|mot|arxml|kcd|odx|pdx|cdd|ldf)$/i
const CONTEXT_CALIBRATION_EXT_RE = /\.(?:dbc|hex|slx|mdl|fmu|sdf|sym|par|pa)$/i
const HOMOLOGATION_DOC_EXT_RE = /\.(?:pdf|xlsx|json)$/i

const COMPRESSED_TELEMETRY_EXT_RE = /\.(?:mf4\.gz|mf4\.zst|mdf\.gz|mdf\.zst|blf\.gz|blf\.zst|tdms\.gz|tdms\.zst|mat\.gz|mat\.zst|zarr\.zip|mf4|mdf4|blf|ndax|nda|mpr|mpt)$/i
const CONTEXT_TELEMETRY_EXT_RE = /\.(?:h5|hdf5|parquet)$/i

const STRICT_RAW_CAN_EXPORT_EXT_RE = /\.(?:asc|trc|clg)$/i
const CONTEXT_RAW_CYCLER_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|mat|tdms|mdf|dat|raw)$/i

const STRICT_BENCH_SCRATCH_EXT_RE = /\.(?:mf4\.tmp|blf\.tmp|slxc|mexw64|mexa64|autosave|lck|lock)$/i
const CONTEXT_BENCH_SCRATCH_EXT_RE = /\.(?:bak|tmp|log)$/i

const MUTABLE_BATTERY_EXT_RE = /\.(?:a2l|dcm|cdfx|s19|mot|hex|dbc|arxml|kcd|odx|pdx|cdd|ldf|slx|mdl|fmu|sdf|sym|par|pa|asc|trc|clg|csv|tsv|txt|mat|tdms|mdf|dat|raw|mpt|bak|tmp|log|lck|lock|autosave|slxc|mexw64|mexa64)$/i

const BATTERY_CONTEXT_RE = /(?:battery|bms|pack|cell|ev[_-]?powertrain|powertrain|inverter|e-axle|eaxle|traction|lithium|lfp|nmc|nca|solid[_-]?state|soc|soh|sop|eis|nyquist|hppc|ocv|cycler|formation|aging|cycle[_-]?life|thermal[_-]?runaway|abuse[_-]?test|nail[_-]?penetration|un[_-]?r100|iso[_-]?26262|ul[_-]?2580|dyno|dynamometer|hil|canape|canoe|dspace|controldesk|veristand|inca|diadem|arbin|neware|maccor|biologic|ec-lab|chroma|canfd|can-fd|mdf4)/i

const BENCH_SCRATCH_PATH_RE = /(?:^|\/)(?:dspace_tmp|controldesk_tmp|veristand_tmp|canoe_tmp|canape_tmp|inca_tmp|dyno_cache|hil_scratch|bms_build_tmp|cycler_tmp|sim_cache|slprj|sfprj|_autosave|bench_scratch|scratch|tmp|temp|cache)(?:\/|$)/i
const HOMOLOGATION_PATH_RE = /(?:^|\/)(?:homologation|un[_-]?r100|iso[_-]?26262|ul[_-]?2580|ece[_-]?r100|thermal[_-]?runaway|abuse[_-]?test|nail[_-]?penetration|safety[_-]?cert|cert|certification|signoff|golden[_-]?cal)(?:\/|$)/i
const CANONICAL_VAULT_PATH_RE = /(?:^|\/)(?:00_homologation|bms[_-]?vault|battery[_-]?vault|dyno[_-]?archive|mdf4[_-]?vault|cycler[_-]?masters|archive|vault|canonical|golden[_-]?baseline|release[_-]?cal)(?:\/|$)/i

const ANY_BATTERY_EXT_RE = /\.(?:mf4\.gz|mf4\.zst|mdf\.gz|mdf\.zst|blf\.gz|blf\.zst|tdms\.gz|tdms\.zst|mat\.gz|mat\.zst|zarr\.zip|mf4\.tmp|blf\.tmp|a2l|dcm|cdfx|s19|mot|arxml|kcd|odx|pdx|cdd|ldf|dbc|hex|slx|mdl|fmu|sdf|sym|par|pa|mf4|mdf4|blf|ndax|nda|mpr|mpt|h5|hdf5|parquet|asc|trc|clg|csv|tsv|txt|mat|tdms|mdf|dat|raw|slxc|mexw64|mexa64|autosave|lck|lock|bak|tmp|log)$/i

const GENERIC_BATTERY_STEMS = new Set([
	'telemetry',
	'trace',
	'log',
	'capture',
	'can',
	'canfd',
	'bms',
	'pack',
	'cell',
	'cycle',
	'cycler',
	'hppc',
	'eis',
	'dyno',
	'hil',
	'calibration',
	'cal',
	'data',
	'export',
	'run',
	'test',
])

const NOISE_PARENT_DIRS = new Set([
	'dspace_tmp',
	'controldesk_tmp',
	'veristand_tmp',
	'canoe_tmp',
	'canape_tmp',
	'inca_tmp',
	'dyno_cache',
	'hil_scratch',
	'bms_build_tmp',
	'cycler_tmp',
	'sim_cache',
	'slprj',
	'sfprj',
	'bench_scratch',
	'scratch',
	'tmp',
	'temp',
	'cache',
	'exports',
	'csv_export',
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
export function normalizeBatteryBmsConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = BATTERY_BMS_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...BATTERY_BMS_DEFAULT_CONFIG, ...preset }
		: { ...BATTERY_BMS_DEFAULT_CONFIG }

	const familyFilter = BATTERY_BMS_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = BATTERY_BMS_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = BATTERY_BMS_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = BATTERY_BMS_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = BATTERY_BMS_SORT_MODES.includes(input.sortMode)
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
		protectCalibrationAndHomologation: typeof input.protectCalibrationAndHomologation === 'boolean'
			? input.protectCalibrationAndHomologation
			: base.protectCalibrationAndHomologation,
		protectCompressedTelemetryAnchors: typeof input.protectCompressedTelemetryAnchors === 'boolean'
			? input.protectCompressedTelemetryAnchors
			: base.protectCompressedTelemetryAnchors,
		protectThermalAbuseEvidence: typeof input.protectThermalAbuseEvidence === 'boolean'
			? input.protectThermalAbuseEvidence
			: base.protectThermalAbuseEvidence,
		requireCompressedAnchorForPrune: typeof input.requireCompressedAnchorForPrune === 'boolean'
			? input.requireCompressedAnchorForPrune
			: base.requireCompressedAnchorForPrune,
		keepRecentBenchRunDays: normalizeNonNegativeInt(input.keepRecentBenchRunDays, base.keepRecentBenchRunDays, 3650),
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
 * Extract meaningful battery pack, cell campaign, or dyno test folder from path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulCampaignFolder(normalizedPath) {
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
 * Detect EV Battery/BMS toolchain and test stage from path and basename.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ benchToolchain: string, testStage: string }} Detected toolchain and stage.
 */
export function extractBenchToolchainAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()
	const combined = `${lowerPath}/${lowerBase}`

	let benchToolchain = 'Battery & EV BMS Vault'
	if (/biologic|ec-lab|\.(?:mpr|mpt)$/i.test(combined)) {
		benchToolchain = 'BioLogic EC-Lab / EIS'
	} else if (/arbin|neware|maccor|chroma|\.(?:ndax|nda)$/i.test(combined)) {
		benchToolchain = 'Arbin / Neware / Maccor Cycler'
	} else if (/dspace|controldesk|slprj|sfprj|\.(?:sdf|slx|mdl|slxc|fmu)$/i.test(combined)) {
		benchToolchain = 'dSPACE ControlDesk / Simulink HIL'
	} else if (/etas|inca|\.(?:dcm|cdfx)$/i.test(combined)) {
		benchToolchain = 'ETAS INCA Calibration'
	} else if (/veristand|diadem|labview|\.tdms(?:\.(?:gz|zst))?$/i.test(combined)) {
		benchToolchain = 'NI VeriStand / DIAdem Dyno'
	} else if (/vector|canoe|canape|\.(?:mf4(?:\.(?:gz|zst))?|blf(?:\.(?:gz|zst))?|asc|dbc|a2l|arxml)$/i.test(combined)) {
		benchToolchain = 'Vector CANoe / CANape / MDF4'
	} else if (/thermal[_-]?runaway|abuse[_-]?test|un[_-]?r100|iso[_-]?26262|ul[_-]?2580|homologation/i.test(combined)) {
		benchToolchain = 'Thermal Abuse & Homologation Rig'
	}

	let testStage = ''
	if (HOMOLOGATION_PATH_RE.test(lowerPath)) {
		testStage = 'Homologation & Thermal Abuse Evidence'
	} else if (STRICT_CALIBRATION_EXT_RE.test(lowerBase) || (CONTEXT_CALIBRATION_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		testStage = 'BMS Calibration & HIL Model Baseline'
	} else if (COMPRESSED_TELEMETRY_EXT_RE.test(lowerBase) || (CONTEXT_TELEMETRY_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		testStage = 'Compressed MDF4 / HDF5 / Cycler Master'
	} else if (STRICT_RAW_CAN_EXPORT_EXT_RE.test(lowerBase) || (CONTEXT_RAW_CYCLER_EXPORT_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		testStage = 'Raw ASCII CAN / CSV Cycler Export'
	} else if (BENCH_SCRATCH_PATH_RE.test(lowerPath) || STRICT_BENCH_SCRATCH_EXT_RE.test(lowerBase)) {
		testStage = 'HIL / Dyno Bench Scratch & Cache'
	}

	return { benchToolchain, testStage }
}

/**
 * Extract normalized battery test run stem to correlate .asc/.trc/.csv/.mat/.tdms exports
 * against verified .mf4/.mf4.zst/.blf/.h5/.parquet/.ndax/.mpr anchors.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for campaign folder context.
 * @return {string} Normalized run lineage stem.
 */
export function extractBatteryRunStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_BATTERY_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:raw|ascii|csv|decimated|resampled|exported|uncompressed|dump|mirror|copy\d*|tmp|temp|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_BATTERY_STEMS.has(stem)) {
		const campaignFolder = extractMeaningfulCampaignFolder(normalizedPath)
		if (campaignFolder) {
			return `${campaignFolder}_${stem || 'bms'}`
		}
	}

	return stem || 'unknown-battery-run'
}

/**
 * Extract broader telemetry campaign anchor key (stripping cycle, channel, and split-part suffixes).
 *
 * @param {string} runStem Normalized run lineage stem.
 * @return {string} Campaign anchor key.
 */
export function extractTelemetryAnchorKey(runStem) {
	return String(runStem || '')
		.replace(/(?:[-_.](?:cyc\d+|ch\d+|part\d+|seg\d+|split\d+|run\d+|\d{1,4}))+$/i, '')
		|| 'unknown-battery-run'
}

/**
 * Extract concise Battery/BMS artifact tag for UI badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Battery/BMS artifact tag.
 */
function extractBatteryTag(lowerBase, lowerPath) {
	if (HOMOLOGATION_PATH_RE.test(lowerPath)) {
		return 'homologation-abuse-evidence'
	}
	if (STRICT_CALIBRATION_EXT_RE.test(lowerBase) || (CONTEXT_CALIBRATION_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		return 'bms-calibration-model'
	}
	if (COMPRESSED_TELEMETRY_EXT_RE.test(lowerBase) || (CONTEXT_TELEMETRY_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		return 'mdf4-hdf5-cycler-master'
	}
	if (STRICT_RAW_CAN_EXPORT_EXT_RE.test(lowerBase) || (CONTEXT_RAW_CYCLER_EXPORT_EXT_RE.test(lowerBase) && BATTERY_CONTEXT_RE.test(lowerPath))) {
		return 'raw-ascii-csv-export'
	}
	if (STRICT_BENCH_SCRATCH_EXT_RE.test(lowerBase) || BENCH_SCRATCH_PATH_RE.test(lowerPath)) {
		return 'hil-dyno-scratch'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Battery, EV Powertrain, BMS Telemetry & HIL Dyno Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyBatteryBmsFile(file, referenceNowMs = Date.now()) {
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

	const hasBatteryContext = BATTERY_CONTEXT_RE.test(lower)
	const isBenchScratchPath = BENCH_SCRATCH_PATH_RE.test(lower)
	const isHomologationPath = HOMOLOGATION_PATH_RE.test(lower) && !isBenchScratchPath
	const isCanonicalVaultPath = (CANONICAL_VAULT_PATH_RE.test(lower) || isHomologationPath) && !isBenchScratchPath

	const isStrictCalibration = STRICT_CALIBRATION_EXT_RE.test(lowerBase)
	const isContextCalibration = CONTEXT_CALIBRATION_EXT_RE.test(lowerBase) && hasBatteryContext
	const isHomologationDoc = isHomologationPath && HOMOLOGATION_DOC_EXT_RE.test(lowerBase)

	const isStrictCompressedTelemetry = COMPRESSED_TELEMETRY_EXT_RE.test(lowerBase)
	const isContextCompressedTelemetry = CONTEXT_TELEMETRY_EXT_RE.test(lowerBase) && hasBatteryContext

	const isStrictRawCan = STRICT_RAW_CAN_EXPORT_EXT_RE.test(lowerBase) && hasBatteryContext
	const isContextRawCycler = !isStrictCompressedTelemetry && !isContextCompressedTelemetry
		&& CONTEXT_RAW_CYCLER_EXPORT_EXT_RE.test(lowerBase)
		&& hasBatteryContext

	const isStrictScratchExt = STRICT_BENCH_SCRATCH_EXT_RE.test(lowerBase) && (hasBatteryContext || isBenchScratchPath)
	const isContextScratch = (isBenchScratchPath && (hasBatteryContext || ANY_BATTERY_EXT_RE.test(lowerBase)))
		|| (CONTEXT_BENCH_SCRATCH_EXT_RE.test(lowerBase) && hasBatteryContext)

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedCalibration = false
	let isProtectedCompressedTelemetry = false
	let isProtectedHomologation = false
	let isCompressedTelemetryAnchor = false
	let isRawTelemetryExport = false
	const isMutableFile = MUTABLE_BATTERY_EXT_RE.test(lowerBase)

	if (isStrictCalibration || isContextCalibration || isHomologationDoc) {
		family = 'bms-calibration-homologation'
		isProtectedCalibration = !isBenchScratchPath
		isProtectedHomologation = isHomologationPath || isHomologationDoc
		if (isHomologationDoc) {
			artifactKind = 'UN R100 / ISO 26262 Homologation & Abuse Evidence'
			vaultRole = 'Conserved Safety Homologation Vault'
		} else if (/\.(?:slx|mdl|fmu|sdf)$/i.test(lowerBase)) {
			artifactKind = 'Simulink / FMU Plant & BMS Control Model'
			vaultRole = isBenchScratchPath ? 'Scratch Model Copy' : 'Canonical HIL Model Baseline'
		} else if (/\.(?:dbc|arxml|kcd|odx|pdx|cdd|ldf|sym)$/i.test(lowerBase)) {
			artifactKind = 'CAN / CAN-FD / AUTOSAR Network Matrix'
			vaultRole = isBenchScratchPath ? 'Scratch Bus Definition' : 'Canonical BMS Bus Matrix Vault'
		} else {
			artifactKind = 'BMS ECU Calibration & Firmware (.a2l/.dcm/.s19/.hex)'
			vaultRole = isBenchScratchPath ? 'Scratch Calibration Copy' : 'Canonical BMS Calibration Vault'
		}
	} else if (isStrictCompressedTelemetry || isContextCompressedTelemetry) {
		family = 'compressed-telemetry-cycler'
		isCompressedTelemetryAnchor = !isBenchScratchPath
		isProtectedCompressedTelemetry = !isBenchScratchPath
		isProtectedHomologation = isHomologationPath
		if (/\.(?:ndax|nda|mpr|mpt)$/i.test(lowerBase)) {
			artifactKind = 'Native Cycler / EIS Master (.ndax/.nda/.mpr/.mpt)'
			vaultRole = isBenchScratchPath ? 'Scratch Cycler Copy' : 'Canonical Cell Cycler Master Vault'
		} else if (/\.(?:h5|hdf5|parquet|zarr\.zip)$/i.test(lowerBase)) {
			artifactKind = 'Columnar / HDF5 Telemetry Archive (.h5/.parquet)'
			vaultRole = isBenchScratchPath ? 'Scratch HDF5/Parquet Copy' : 'Archived BMS HDF5/Parquet Master'
		} else {
			artifactKind = 'ASAM MDF4 / Vector BLF Telemetry Master (.mf4/.blf)'
			vaultRole = isBenchScratchPath ? 'Scratch MDF4/BLF Copy' : 'Canonical MDF4/BLF Telemetry Vault'
		}
	} else if (isStrictRawCan || isContextRawCycler) {
		family = 'raw-cycler-csv-exports'
		isProtectedHomologation = isHomologationPath
		isRawTelemetryExport = true
		if (isStrictRawCan) {
			artifactKind = 'Uncompressed ASCII CAN / Peak Trace (.asc/.trc/.clg)'
			vaultRole = isBenchScratchPath ? 'Scratch ASCII CAN Export' : 'Redundant ASCII CAN Trace Copy'
		} else {
			artifactKind = 'Re-Exported Cycler / Dyno Dump (.csv/.mat/.tdms/.mdf)'
			vaultRole = isBenchScratchPath ? 'Scratch Cycler CSV/MAT' : 'Uncompressed Cycler/Dyno Export Copy'
		}
	} else if (isStrictScratchExt || isContextScratch) {
		family = 'hil-dyno-scratch-logs'
		artifactKind = isStrictScratchExt
			? 'Simulink / MDF4 Bench Lock or Cache (.slxc/.mf4.tmp/.lck)'
			: 'HIL / Dyno Bench Temp & Cache (dspace_tmp/, dyno_cache/)'
		vaultRole = 'dSPACE / CANape / INCA / Dyno Bench Scratch'
	}

	const { benchToolchain, testStage } = extractBenchToolchainAndStage(normalized, basename)
	const runStem = extractBatteryRunStem(basename, normalized)
	const telemetryAnchorKey = extractTelemetryAnchorKey(runStem)
	const campaignFolder = extractMeaningfulCampaignFolder(normalized)
	const batteryTag = extractBatteryTag(lowerBase, lower)

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
		benchToolchain,
		testStage,
		runStem,
		telemetryAnchorKey,
		campaignFolder,
		batteryTag,
		isProtectedCalibration,
		isProtectedCompressedTelemetry,
		isProtectedHomologation,
		isCompressedTelemetryAnchor,
		isRawTelemetryExport,
		isMutableFile,
		isBenchScratchPath: isBenchScratchPath || isStrictScratchExt,
		isHomologationPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Battery, EV Powertrain & BMS Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isBatteryBmsGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyBatteryBmsFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified MDF4/BLF/HDF5/Parquet/Cycler masters
 * to uncompressed ASCII CAN (.asc/.trc) and CSV/MAT/TDMS exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildBatteryBmsCorrelationIndex(groups) {
	const compressedStems = new Set()
	const compressedAnchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyBatteryBmsFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isCompressedTelemetryAnchor) {
				compressedStems.add(meta.runStem)
				compressedAnchorKeys.add(meta.telemetryAnchorKey)
			}
		}
	}

	return {
		compressedStems,
		compressedAnchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Battery/BMS cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'bms-calibration-homologation')) {
		return 'bms-calibration-homologation'
	}
	if (members.some(m => m.family === 'compressed-telemetry-cycler')) {
		return 'compressed-telemetry-cycler'
	}
	if (members.some(m => m.family === 'raw-cycler-csv-exports')) {
		return 'raw-cycler-csv-exports'
	}
	return 'hil-dyno-scratch-logs'
}

/**
 * Compute deterministic survivor priority score for a Battery/BMS vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-test-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedHomologation ? 100000 : 0)
			+ (member.isProtectedCalibration ? 97000 : 0)
			+ (member.isProtectedCompressedTelemetry ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBenchScratchPath ? -55000 : 0)
			+ (member.isRawTelemetryExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-calibration-first') {
		return (member.isProtectedHomologation ? 100000 : 0)
			+ (member.isProtectedCalibration ? 97000 : 0)
			+ (member.isProtectedCompressedTelemetry ? 94000 : 0)
			+ (member.isBenchScratchPath ? -50000 : 0)
			+ (member.isRawTelemetryExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedHomologation ? 52000 : 0)
			+ (member.isProtectedCalibration ? 50000 : 0)
			+ (member.isProtectedCompressedTelemetry ? 48000 : 0)
			+ (member.isBenchScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedHomologation ? 100000 : 0)
		+ (member.isProtectedCalibration ? 97000 : 0)
		+ (member.isProtectedCompressedTelemetry ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isRawTelemetryExport ? -45000 : 0)
		+ (member.isBenchScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Battery, EV Powertrain & BMS duplicate cluster.
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
		const meta = classifyBatteryBmsFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.benchToolchain)?.benchToolchain || ''
	const primaryStage = rawMembers.find(m => m.testStage)?.testStage || ''
	const primaryStem = rawMembers[0].runStem || extractBatteryRunStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].telemetryAnchorKey || extractTelemetryAnchorKey(primaryStem)

	const hasCompressedTelemetryAnchor = Boolean(
		rawMembers.some(m => m.isCompressedTelemetryAnchor)
		|| correlationIndex.compressedStems.has(primaryStem)
		|| correlationIndex.compressedAnchorKeys.has(primaryAnchorKey)
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

		const isRedundantRawExportMember = member.isRawTelemetryExport && hasCompressedTelemetryAnchor

		let redundancyReason = ''
		if (member.isRawTelemetryExport) {
			redundancyReason = isRedundantRawExportMember
				? 'Uncompressed .asc/.csv/.mat/.tdms duplicates verified .mf4/.blf/.h5/.ndax master anchor'
				: 'Raw ASCII/CSV telemetry export without verified .mf4/.blf/.h5/.ndax anchor'
		}

		let governanceTier = 'hil-dyno-scratch-intermediate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedHomologation
				? 'homologation-abuse-protected'
				: (member.isProtectedCalibration
					? 'calibration-homologation-protected'
					: (member.isProtectedCompressedTelemetry
						? 'telemetry-archive-protected'
						: (member.isRawTelemetryExport
							? 'raw-export-redundant'
							: 'hil-dyno-scratch-intermediate')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedHomologation && config.protectThermalAbuseEvidence) {
			governanceTier = 'homologation-abuse-protected'
			shielded = true
			protectedReason = 'UN R100 / ISO 26262 / UL 2580 thermal-abuse and homologation evidence strictly conserved'
		} else if (member.isProtectedCalibration && config.protectCalibrationAndHomologation) {
			governanceTier = 'calibration-homologation-protected'
			shielded = true
			protectedReason = 'BMS calibration (.a2l/.dcm/.s19), bus matrix (.dbc/.arxml), and HIL model strictly conserved'
		} else if (member.isProtectedCompressedTelemetry && config.protectCompressedTelemetryAnchors) {
			governanceTier = 'telemetry-archive-protected'
			shielded = true
			protectedReason = 'Compressed MDF4/BLF/HDF5/Parquet or native cycler master strictly conserved'
		} else if (isSurvivor && !isRedundantRawExportMember) {
			governanceTier = member.isProtectedHomologation
				? 'homologation-abuse-protected'
				: (member.isProtectedCalibration
					? 'calibration-homologation-protected'
					: (member.isProtectedCompressedTelemetry
						? 'telemetry-archive-protected'
						: (member.isRawTelemetryExport
							? 'raw-export-redundant'
							: 'hil-dyno-scratch-intermediate')))
			shielded = true
			protectedReason = 'Canonical Battery & BMS vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRawTelemetryExport
				? 'raw-export-redundant'
				: (member.isProtectedCalibration
					? 'calibration-homologation-protected'
					: 'hil-dyno-scratch-intermediate')
			action = config.strategy === 'hardlink-immutable-telemetry-and-cycler' && !member.isMutableFile && !member.isBenchScratchPath
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
			config.keepRecentBenchRunDays > 0
			&& member.isBenchScratchPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentBenchRunDays
		) {
			governanceTier = 'hil-dyno-scratch-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentBenchRunDays}-day active HIL/dyno bench run retention window`
		} else if (member.isRawTelemetryExport) {
			governanceTier = 'raw-export-redundant'
			if (config.requireCompressedAnchorForPrune && !hasCompressedTelemetryAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .mf4/.blf/.h5/.parquet/.ndax/.mpr anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isBenchScratchPath) {
			governanceTier = 'hil-dyno-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'dSPACE/CANape/INCA/dyno bench scratch or lock file eligible for cleanup'
		} else if (member.isProtectedCompressedTelemetry || member.isProtectedCalibration) {
			governanceTier = member.isProtectedCalibration ? 'calibration-homologation-protected' : 'telemetry-archive-protected'
			action = config.strategy === 'hardlink-immutable-telemetry-and-cycler' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-telemetry-and-cycler' && !member.isMutableFile) {
			governanceTier = 'telemetry-archive-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'hil-dyno-scratch-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantRawExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantRawExport = members.some(m => m.isRedundantRawExportMember || m.isRawTelemetryExport)
	const hasBenchScratchIntermediate = members.some(m => m.isBenchScratchPath)
	const hasProtectedCalibration = members.some(m => m.governanceTier === 'calibration-homologation-protected')
	const hasProtectedCompressedTelemetry = members.some(m => m.governanceTier === 'telemetry-archive-protected')
	const hasProtectedHomologation = members.some(m => m.governanceTier === 'homologation-abuse-protected')

	let clusterVerdict = 'hil-dyno-scratch-intermediate'
	if (members.some(m => m.isRedundantRawExportMember)) {
		clusterVerdict = 'raw-export-redundant'
	} else if (hasProtectedHomologation) {
		clusterVerdict = 'homologation-abuse-protected'
	} else if (hasProtectedCalibration) {
		clusterVerdict = 'calibration-homologation-protected'
	} else if (hasProtectedCompressedTelemetry) {
		clusterVerdict = 'telemetry-archive-protected'
	} else if (hasBenchScratchIntermediate) {
		clusterVerdict = 'hil-dyno-scratch-intermediate'
	} else if (hasRedundantRawExport) {
		clusterVerdict = 'raw-export-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const batteryTags = Array.from(new Set(members.map(m => m.batteryTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantRawExportMember) ? 125 : 0)
		+ (hasBenchScratchIntermediate ? 110 : 0)
		+ (hasProtectedHomologation ? 100 : 0)
		+ (hasProtectedCalibration ? 95 : 0)
		+ (hasProtectedCompressedTelemetry ? 90 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		benchToolchain: primaryToolchain,
		testStage: primaryStage,
		runStem: primaryStem,
		telemetryAnchorKey: primaryAnchorKey,
		family,
		familyLabel: BATTERY_BMS_FAMILY_META[family]?.label || family,
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
		hasProtectedCalibration,
		hasProtectedCompressedTelemetry,
		hasProtectedHomologation,
		hasRedundantRawExport,
		hasBenchScratchIntermediate,
		hasCompressedTelemetryAnchor,
		batteryTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Battery, EV Powertrain, BMS Telemetry & HIL Dyno Test Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditBatteryBmsVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeBatteryBmsConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isBatteryBmsGroup)
	const correlationIndex = buildBatteryBmsCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'bms-calibration-homologation': 0,
		'compressed-telemetry-cycler': 0,
		'raw-cycler-csv-exports': 0,
		'hil-dyno-scratch-logs': 0,
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
		if (config.verdictFilter === 'raw-export-redundant' && !cluster.hasRedundantRawExport) {
			return false
		}
		if (config.verdictFilter === 'hil-dyno-scratch-intermediate' && !cluster.hasBenchScratchIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'raw-export-redundant'
			&& config.verdictFilter !== 'hil-dyno-scratch-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.runStem.toLowerCase().includes(query)
			const matchesToolchain = cluster.benchToolchain.toLowerCase().includes(query)
			const matchesStage = cluster.testStage.toLowerCase().includes(query)
			const matchesTag = cluster.batteryTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesToolchain && !matchesStage && !matchesTag && !matchesMember) {
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
	let totalCalibrationClusters = 0
	let totalTelemetryArchiveClusters = 0
	let totalHomologationClusters = 0
	let totalRedundantExportClusters = 0
	let totalBenchScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedCalibration) {
			totalCalibrationClusters += 1
		}
		if (cluster.hasProtectedCompressedTelemetry) {
			totalTelemetryArchiveClusters += 1
		}
		if (cluster.hasProtectedHomologation) {
			totalHomologationClusters += 1
		}
		if (cluster.hasRedundantRawExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasBenchScratchIntermediate) {
			totalBenchScratchClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = BATTERY_BMS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: BATTERY_BMS_FAMILY_META[id].label,
			shortLabel: BATTERY_BMS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: BATTERY_BMS_VAULT_SCHEMA,
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
			totalTelemetryArchiveClusters,
			totalHomologationClusters,
			totalRedundantExportClusters,
			totalBenchScratchClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Battery & EV BMS Vaults.
 * Strictly blocks deletion or hardlinking of shielded BMS calibration, homologation evidence,
 * and compressed MDF4/HDF5/cycler anchors, and never hardlinks mutable files or bench scratch.
 *
 * @param {object} auditResult Result from auditBatteryBmsVault.
 * @return {string} POSIX bash script.
 */
export function buildBatteryBmsRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Battery, EV Powertrain, BMS Telemetry & HIL Dyno Test Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./battery-bms-vault-reclaim.sh only after verifying MDF4/HDF5 and homologation anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.battery-bms-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-raw-exports-and-bench-scratch'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isBenchScratchPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-raw-exports-and-scratch' && (target.isRawTelemetryExport || target.isBenchScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable ASCII/CSV telemetry exports or HIL/dyno scratch under active vault shields.\\n"')
	} else {
		lines.push(`printf "Completed Battery & BMS Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditBatteryBmsVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildBatteryBmsCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'bench_toolchain',
		'test_stage',
		'run_stem',
		'telemetry_anchor_key',
		'family',
		'cluster_verdict',
		'has_compressed_telemetry_anchor',
		'is_redundant_raw_export',
		'is_bench_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'battery_tag',
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
				cluster.benchToolchain || '',
				cluster.testStage || '',
				cluster.runStem,
				cluster.telemetryAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasCompressedTelemetryAnchor ? 'true' : 'false',
				member.isRedundantRawExportMember ? 'true' : 'false',
				member.isBenchScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.batteryTag || '',
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
 * @param {object} auditResult Result from auditBatteryBmsVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildBatteryBmsJsonManifest(auditResult) {
	const payload = {
		schema: BATTERY_BMS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || BATTERY_BMS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			benchToolchain: cluster.benchToolchain,
			testStage: cluster.testStage,
			runStem: cluster.runStem,
			telemetryAnchorKey: cluster.telemetryAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCalibration: cluster.hasProtectedCalibration,
			hasProtectedCompressedTelemetry: cluster.hasProtectedCompressedTelemetry,
			hasProtectedHomologation: cluster.hasProtectedHomologation,
			hasRedundantRawExport: cluster.hasRedundantRawExport,
			hasBenchScratchIntermediate: cluster.hasBenchScratchIntermediate,
			hasCompressedTelemetryAnchor: cluster.hasCompressedTelemetryAnchor,
			batteryTags: cluster.batteryTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				batteryTag: member.batteryTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantRawExportMember: member.isRedundantRawExportMember,
				isBenchScratchPath: member.isBenchScratchPath,
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
 * cloud sync of dSPACE/CANape/INCA/dyno bench scratch directories, Simulink slprj/
 * build caches, and transient MDF4/BLF lock files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildBatteryBmsSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Battery, EV Powertrain & BMS Vaults',
		'dspace_tmp/',
		'controldesk_tmp/',
		'veristand_tmp/',
		'canoe_tmp/',
		'canape_tmp/',
		'inca_tmp/',
		'dyno_cache/',
		'hil_scratch/',
		'bms_build_tmp/',
		'cycler_tmp/',
		'slprj/',
		'sfprj/',
		'*.mf4.tmp',
		'*.blf.tmp',
		'*.slxc',
		'*.autosave',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
