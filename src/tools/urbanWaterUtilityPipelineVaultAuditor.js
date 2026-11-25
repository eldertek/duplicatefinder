/**
 * Pure Urban Water Utility, Hydraulic Network & Pipeline Telemetry Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Urban Water & Pipeline Vault families:
 * - EPA / AWWA / PHMSA Compliance & EPANET/SWMM Models (.inp, .net, .wtg, .icm, .iwm, .wml, .sdwis, .dmr, .ccr, plus XML/JSON/YAML/SQLite/CSV/PDF in regulatory/compliance/hold or hydraulic baseline context)
 * - Smart Metering (AMI), Acoustic Leak & ILI Pipeline Masters (.ami, .mdm, .dlms, .cosem, .wmbus, .lorawan, .ili, .mfl, .paut, .ut, .cor, .leak, .dnp3, .opcua, plus .parquet/.h5/.hdf5/.bin/.dat in water/utility/pipeline context)
 * - Redundant Flow, Pressure, Billing & GIS Exports (.csv, .tsv, .txt, .xlsx, .xls, .json, .jsonl, .pdf, .png, .svg, .shp, .geojson, .kml in water/utility/pipeline export context)
 * - Hydraulic Solver, SCADA & AMI Spool Scratch (epanet_tmp/, swmm_scratch/, watergems_cache/, infoworks_tmp/, hecras_scratch/, ami_spool/, mdm_staging/, ili_cache/, leak_buf/, scada_water_tmp/, .inp.tmp, .wtg.bak, .icm.lck, .ami.part, .mfl.idx, .cor.tmp, .lck)
 *
 * Enforces strict EPA SDWA / NPDES / PHMSA Compliance, EPANET/SWMM Baseline, and AMI/ILI Master defaults:
 * - Strictly conserves PHMSA pipeline integrity holds, EPA Consent Decree / CSO / SDWIS holds, and drinking-water compliance records
 * - Strictly conserves canonical EPANET, EPA SWMM, WaterGEMS, and InfoWorks hydraulic network baselines
 * - Strictly conserves verified AMI/DLMS/LoRaWAN meter masters, acoustic leak correlators, ILI/MFL smart pigging logs, and WTP/pump-station PLC historians
 * - Detects redundant CSV/PDF/PNG/GIS flow-profile, pressure-contour, and billing exports when a verified EPANET/AMI/ILI master anchor exists
 * - Blocks pruning of derived utility/GIS exports lacking a verified water/pipeline master anchor when guard is active
 * - Blocks hardlinks on mutable INP/CSV/JSON/PDF/GIS files and solver/AMI scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const URBAN_WATER_UTILITY_PIPELINE_VAULT_SCHEMA = 'duplicatefinder.urban-water-utility-pipeline-vault-auditor.v1'

export const URBAN_WATER_UTILITY_PIPELINE_FAMILIES = Object.freeze([
	'all',
	'water-regulatory-epanet-compliance',
	'ami-pipeline-telemetry-masters',
	'redundant-utility-csv-exports',
	'hydraulic-solver-utility-scratch',
])

export const URBAN_WATER_UTILITY_PIPELINE_FAMILY_META = Object.freeze({
	'water-regulatory-epanet-compliance': {
		id: 'water-regulatory-epanet-compliance',
		label: 'EPA / PHMSA & EPANET',
		shortLabel: 'SDWA / NPDES / PHMSA Holds & Hydraulic Models (.inp, .wtg, .icm, .wml, .sdwis, .dmr)',
	},
	'ami-pipeline-telemetry-masters': {
		id: 'ami-pipeline-telemetry-masters',
		label: 'AMI, Leak & ILI Masters',
		shortLabel: 'Verified Metering & Pipeline Masters (.ami, .dlms, .wmbus, .ili, .mfl, .paut, .cor, .dnp3)',
	},
	'redundant-utility-csv-exports': {
		id: 'redundant-utility-csv-exports',
		label: 'Derived Flow & GIS Exports',
		shortLabel: 'Derived Billing, Flow Profiles, Pressure Contours & Valve GIS (.csv, .xlsx, .pdf, .png, .shp, .geojson)',
	},
	'hydraulic-solver-utility-scratch': {
		id: 'hydraulic-solver-utility-scratch',
		label: 'EPANET & AMI Scratch',
		shortLabel: 'Solver & Spool Scratch (epanet_tmp/, swmm_scratch/, infoworks_tmp/, ami_spool/, ili_cache/, .inp.tmp, .ami.part)',
	},
})

export const URBAN_WATER_UTILITY_PIPELINE_STRATEGIES = Object.freeze([
	'prune-exports-and-utility-scratch',
	'hardlink-immutable-ami-and-ili',
	'quarantine-exports-and-utility-scratch',
])

export const URBAN_WATER_UTILITY_PIPELINE_SURVIVOR_RULES = Object.freeze([
	'regulatory-epanet-master-first',
	'oldest-telemetry-capture-first',
	'newest-calibration-run-first',
	'shortest-path',
])

export const URBAN_WATER_UTILITY_PIPELINE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'water-regulatory-epanet-protected',
	'ami-pipeline-master-protected',
	'pipeline-safety-hold-protected',
	'utility-export-redundant',
	'hydraulic-solver-scratch',
	'shielded',
])

export const URBAN_WATER_UTILITY_PIPELINE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const URBAN_WATER_UTILITY_PIPELINE_PRESETS = Object.freeze([
	{
		id: 'all-urban-water-utility-audit',
		name: 'All Water & Pipeline Vaults',
		description: 'Audit EPA/PHMSA holds and EPANET/SWMM models, AMI/ILI/acoustic leak masters, redundant utility exports, and solver/spool scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-utility-scratch',
		survivorRule: 'regulatory-epanet-master-first',
		protectComplianceAndEpanetModels: true,
		protectAmiAndPipelineMasters: true,
		protectPipelineSafetyHolds: true,
		requireUtilityAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'hydraulic-solver-scratch-cleanup',
		name: 'EPANET & AMI Scratch',
		description: 'Reclaim epanet_tmp/, swmm_scratch/, watergems_cache/, infoworks_tmp/, ami_spool/, and .inp.tmp/.ami.part scratch older than the active window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-utility-scratch',
		survivorRule: 'regulatory-epanet-master-first',
		protectComplianceAndEpanetModels: true,
		protectAmiAndPipelineMasters: true,
		protectPipelineSafetyHolds: true,
		requireUtilityAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-utility-exports-vs-masters',
		name: 'Derived Exports vs Masters',
		description: 'Detect derived flow-profile CSVs, pressure-contour PNGs, billing PDFs, and GIS valve sheets backed by a verified EPANET, AMI, or ILI anchor.',
		familyFilter: 'redundant-utility-csv-exports',
		strategy: 'quarantine-exports-and-utility-scratch',
		survivorRule: 'regulatory-epanet-master-first',
		protectComplianceAndEpanetModels: true,
		protectAmiAndPipelineMasters: true,
		protectPipelineSafetyHolds: true,
		requireUtilityAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'water-regulatory-compliance-shield',
		name: 'EPA / PHMSA & EPANET Shield',
		description: 'Inspect PHMSA pipeline integrity holds, EPA SDWIS/NPDES compliance packages, and calibrated EPANET/SWMM/InfoWorks models under strict shield.',
		familyFilter: 'water-regulatory-epanet-compliance',
		strategy: 'hardlink-immutable-ami-and-ili',
		survivorRule: 'regulatory-epanet-master-first',
		protectComplianceAndEpanetModels: true,
		protectAmiAndPipelineMasters: true,
		protectPipelineSafetyHolds: true,
		requireUtilityAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-ami-ili-telemetry-masters',
		name: 'AMI, Leak & ILI Masters',
		description: 'Audit verified AMI/DLMS/W-MBus smart meter archives, acoustic leak correlators, ILI/MFL smart pigging runs, and pump-station historians.',
		familyFilter: 'ami-pipeline-telemetry-masters',
		strategy: 'hardlink-immutable-ami-and-ili',
		survivorRule: 'regulatory-epanet-master-first',
		protectComplianceAndEpanetModels: true,
		protectAmiAndPipelineMasters: true,
		protectPipelineSafetyHolds: true,
		requireUtilityAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-urban-water-utility-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-utility-scratch',
	survivorRule: 'regulatory-epanet-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectComplianceAndEpanetModels: true,
	protectAmiAndPipelineMasters: true,
	protectPipelineSafetyHolds: true,
	requireUtilityAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_UTILITY_COMPLIANCE_EXT_RE = /\.(?:inp|net|wtg|icm|iwm|wml|sdwis|dmr|ccr)$/i
const CONTEXT_UTILITY_COMPLIANCE_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_UTILITY_MASTER_EXT_RE = /\.(?:ami|mdm|dlms|cosem|wmbus|lorawan|ili|mfl|paut|cor|leak|dnp3|opcua)$/i
const CONTEXT_UTILITY_TELEMETRY_EXT_RE = /\.(?:parquet|parq|h5|hdf5|bin|dat|ut)$/i
const CONTEXT_UTILITY_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|xls|json|jsonl|pdf|png|jpg|jpeg|webp|svg|shp|geojson|kml|dbf)$/i
const STRICT_UTILITY_SCRATCH_EXT_RE = /\.(?:inp\.tmp|wtg\.bak|icm\.lck|iwm\.tmp|ami\.part|mdm\.tmp|mfl\.idx|ili\.part|cor\.tmp|dnp3\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_UTILITY_WATER_EXCLUSION_RE = /(?:iec61850|comtrade|synchrophasor|nerc_?cip|prc-?002|pscad|psse|powerfactory|substation_relay|multibeam|bathymetry|kmall|s7k|xtf|iho_?s57|subsea_?rov|v2x|scms|ntcip|sumocfg|vissim|opendrive|etcs|ertms|cbtc|railml|quantum|qubit|qasm|bluefors|geant4|cmssw|cern|orbital|ccsds|electrophys|bids|dicom|nifti|speech|bioacoustic|textgrid|rttm|kaldi|espnet|bms_can|hil_dyno|ev_powertrain|tbm_tunnel|geosensor|inclinometer|photoshop|lightroom|premiere|davinci|protools|logicpro|ableton|cubase|vst3|gdsii|oasis)/i
const UTILITY_WATER_CONTEXT_HINT_RE = /(?:epanet|swmm|watergems|sewergems|infoworks|hecras|waterml|sdwis|sdwa|npdes|phmsa|awwa|ami_?meter|smart_?water|dlms|cosem|wmbus|lorawan|acoustic_?leak|hydrophone|correlator|smart_?pig|pipeline_?ili|mfl_?pig|pump_?station|water_?treatment|wtp|wwtp|wastewater|stormwater|water_?main|water_?network|district_?meter|dma_?zone|pressure_?zone|reservoir_?scada|valve_?book|hydrant|sewer_?basin|district_?heating)/i
const UTILITY_SAFETY_HOLD_PATH_RE = /(?:pipeline_?hold|phmsa_?hold|consent_?decree|epa_?hold|sdwa_?hold|cso_?hold|sso_?hold|boil_?water_?hold|rupture_?hold|regulatory_?hold|litigation_?hold|integrity_?hold)/i
const UTILITY_BASELINE_PATH_RE = /(?:00_epanet|00_swmm|00_hydraulic|00_compliance|00_sdwis|00_phmsa|hydraulic_baselines|compliance_records|network_models|calibrated_models|epa_submittals)/i
const UTILITY_SCRATCH_PATH_RE = /(?:epanet_tmp|swmm_scratch|watergems_cache|infoworks_tmp|hecras_scratch|ami_spool|mdm_staging|ili_cache|leak_buf|scada_water_tmp|pump_staging|gis_tile_cache)/i
const UTILITY_INTERMEDIATE_PREFIX_RE = /^(?:tmp_epanet_|tmp_swmm_|tmp_ami_|tmp_mdm_|tmp_ili_|tmp_leak_|tmp_pump_|tmp_water_|cache_ami_|spool_mdm_)/i
const UTILITY_INTERMEDIATE_SUFFIX_RE = /(?:_epanet_tmp|_swmm_tmp|_ami_spool|_ili_cache|_leak_buf|_staging)$/i
const UTILITY_EXPORT_PATH_RE = /(?:flow_profiles|pressure_contours|billing_exports|ami_rollups|valve_sheets|hydrograph_exports|leak_reports|gis_exports|_flow_profile|_pressure_contour|_billing_export|_ami_rollup|_valve_sheet|_hydrograph|_leak_report)/i
const CANONICAL_UTILITY_VAULT_PATH_RE = /(?:00_raw|00_ami|00_ili|00_leak|00_telemetry|00_masters|canonical|utility_archive|water_archive|pipeline_archive)/i

/**
 * Normalize configuration values for Urban Water Utility, Hydraulic Network & Pipeline Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeUrbanWaterUtilityPipelineConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = URBAN_WATER_UTILITY_PIPELINE_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.familyFilter
	const verdictFilter = URBAN_WATER_UTILITY_PIPELINE_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.verdictFilter
	const strategy = URBAN_WATER_UTILITY_PIPELINE_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.strategy
	const survivorRule = URBAN_WATER_UTILITY_PIPELINE_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.survivorRule
	const sortMode = URBAN_WATER_UTILITY_PIPELINE_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectComplianceAndEpanetModels: cfg.protectComplianceAndEpanetModels !== undefined ? Boolean(cfg.protectComplianceAndEpanetModels) : true,
		protectAmiAndPipelineMasters: cfg.protectAmiAndPipelineMasters !== undefined ? Boolean(cfg.protectAmiAndPipelineMasters) : true,
		protectPipelineSafetyHolds: cfg.protectPipelineSafetyHolds !== undefined ? Boolean(cfg.protectPipelineSafetyHolds) : true,
		requireUtilityAnchorForPrune: cfg.requireUtilityAnchorForPrune !== undefined ? Boolean(cfg.requireUtilityAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized network zone, DMA, or pipeline segment stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized water/pipeline stem.
 */
export function extractUrbanWaterUtilityPipelineStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:inp\.tmp|wtg\.bak|icm\.lck|iwm\.tmp|ami\.part|mdm\.tmp|mfl\.idx|ili\.part|cor\.tmp|dnp3\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(UTILITY_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(UTILITY_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:flow_profile|pressure_contour|billing_export|ami_rollup|valve_sheet|hydrograph|leak_report|contour|profile|summary|export|csv|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'utility-zone'
}

/**
 * Extract canonical anchor key linking derived flow/pressure/billing exports to verified EPANET/AMI/ILI anchors.
 *
 * @param {string} pipelineStem Extracted utility/pipeline stem.
 * @return {string} Canonical anchor key.
 */
export function extractUrbanWaterUtilityPipelineAnchorKey(pipelineStem) {
	return String(pipelineStem || 'utility-zone')
		.toLowerCase()
		.replace(/(?:[-_](?:inp|net|wtg|icm|iwm|wml|sdwis|dmr|ccr|ami|mdm|dlms|cosem|wmbus|lorawan|ili|mfl|paut|cor|leak|dnp3|opcua|profile|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'utility-zone'
}

/**
 * Detect Urban Water & Pipeline toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ utilityToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractUtilityToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let utilityToolchain = ''
	if (/\.(?:inp|net)\b|epanet|swmm/.test(text)) {
		utilityToolchain = 'EPA EPANET / SWMM Hydraulic Solver'
	} else if (/\.(?:wtg|icm|iwm)\b|watergems|sewergems|infoworks/.test(text)) {
		utilityToolchain = 'Bentley WaterGEMS / InfoWorks ICM'
	} else if (/\.(?:wml|sdwis|dmr|ccr)\b|sdwis|sdwa|npdes|waterml/.test(text)) {
		utilityToolchain = 'EPA SDWIS / NPDES & OGC WaterML 2.0'
	} else if (/\.(?:ami|mdm|dlms|cosem|wmbus|lorawan)\b|ami_?meter|smart_?water|dlms|wmbus/.test(text)) {
		utilityToolchain = 'Smart Metering AMI (DLMS / W-MBus / LoRaWAN)'
	} else if (/\.(?:ili|mfl|paut|ut)\b|smart_?pig|pipeline_?ili|mfl_?pig|phmsa/.test(text)) {
		utilityToolchain = 'PHMSA / API 1160 Pipeline ILI & MFL NDT'
	} else if (/\.(?:cor|leak)\b|acoustic_?leak|hydrophone|correlator/.test(text)) {
		utilityToolchain = 'Acoustic Leak Correlator & Hydrophone'
	} else if (/\.(?:dnp3|opcua)\b|pump_?station|water_?treatment|wtp|wwtp|reservoir_?scada/.test(text)) {
		utilityToolchain = 'Water SCADA (DNP3 / OPC-UA Pump & WTP)'
	} else if (/pipeline_?hold|consent_?decree|epa_?hold|cso_?hold|rupture_?hold/.test(text)) {
		utilityToolchain = 'Regulatory Integrity & Consent Hold'
	}

	let workflowStage = ''
	if (UTILITY_SAFETY_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Pipeline Integrity & EPA Regulatory Hold'
	} else if (STRICT_UTILITY_COMPLIANCE_EXT_RE.test(basename) || UTILITY_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'EPANET/SWMM Baseline & Compliance Submittal'
	} else if (UTILITY_SCRATCH_PATH_RE.test(text) || STRICT_UTILITY_SCRATCH_EXT_RE.test(basename) || UTILITY_INTERMEDIATE_PREFIX_RE.test(basename) || UTILITY_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Hydraulic Solver & AMI Spool Scratch'
	} else if (UTILITY_EXPORT_PATH_RE.test(text) || (CONTEXT_UTILITY_EXPORT_EXT_RE.test(basename) && UTILITY_WATER_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Flow, Pressure, Billing or GIS Export'
	} else if (STRICT_UTILITY_MASTER_EXT_RE.test(basename) || (CONTEXT_UTILITY_TELEMETRY_EXT_RE.test(basename) && (UTILITY_WATER_CONTEXT_HINT_RE.test(text) || CANONICAL_UTILITY_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified AMI, Leak or ILI Pipeline Master'
	}

	return { utilityToolchain, workflowStage }
}

/**
 * Extract concise Urban Water & Pipeline domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractUtilityDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (UTILITY_SAFETY_HOLD_PATH_RE.test(text)) {
		return 'REGULATORY / INTEGRITY HOLD'
	}
	if (/\.(?:sdwis|dmr|ccr|wml)\b/.test(lowerBase)) {
		return 'EPA SDWIS / WATERML'
	}
	if (/\.(?:inp|net|wtg|icm|iwm)\b/.test(lowerBase)) {
		return 'EPANET / INFOWORKS'
	}
	if (/\.(?:ami|mdm|dlms|cosem|wmbus|lorawan)\b/.test(lowerBase)) {
		return 'AMI SMART METER'
	}
	if (/\.(?:ili|mfl|paut|ut)\b/.test(lowerBase)) {
		return 'ILI / MFL PIPELINE'
	}
	if (/\.(?:cor|leak)\b/.test(lowerBase)) {
		return 'ACOUSTIC LEAK'
	}
	if (/\.(?:dnp3|opcua)\b/.test(lowerBase)) {
		return 'WATER SCADA'
	}
	if (STRICT_UTILITY_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'SOLVER / AMI SCRATCH'
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
 * Classify a single file within the Urban Water Utility, Hydraulic Network & Pipeline domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyUrbanWaterUtilityPipelineFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_UTILITY_WATER_EXCLUSION_RE.test(lower)
	const hasUtilityContext = !hasExcludedContext && UTILITY_WATER_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && UTILITY_BASELINE_PATH_RE.test(lower)
	const isSafetyHoldPath = !hasExcludedContext && UTILITY_SAFETY_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_UTILITY_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && UTILITY_SCRATCH_PATH_RE.test(lower)
	const isUtilityExportPath = !hasExcludedContext && UTILITY_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_UTILITY_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (UTILITY_INTERMEDIATE_PREFIX_RE.test(lowerBase) || UTILITY_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictComplianceOrEpanet = !hasExcludedContext && STRICT_UTILITY_COMPLIANCE_EXT_RE.test(lowerBase)
	const isComplianceOrModel = !hasExcludedContext && (
		isStrictComplianceOrEpanet
		|| (CONTEXT_UTILITY_COMPLIANCE_EXT_RE.test(lowerBase) && !isUtilityExportPath && (isBaselinePath || isSafetyHoldPath))
	)

	const isContextTelemetryMaster = CONTEXT_UTILITY_TELEMETRY_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasUtilityContext || isCanonicalVaultPath)
	const isStrictUtilityMaster = !hasExcludedContext && (
		STRICT_UTILITY_MASTER_EXT_RE.test(lowerBase)
		|| isContextTelemetryMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictUtilityMaster
		&& !isComplianceOrModel
		&& CONTEXT_UTILITY_EXPORT_EXT_RE.test(lowerBase)
		&& (hasUtilityContext || isUtilityExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Urban Water & Pipeline Vault'
	let isProtectedComplianceModel = false
	let isProtectedTelemetryMaster = false
	let isProtectedSafetyHold = false
	let isUtilityMasterAnchor = false
	let isRedundantUtilityExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictUtilityMaster || isComplianceOrModel))
		|| (isIntermediateSubfile && (isStrictUtilityMaster || isContextExport || hasUtilityContext))
		|| (isGenericScratchExt && hasUtilityContext && !isBaselinePath && !isSafetyHoldPath)
	) {
		family = 'hydraulic-solver-utility-scratch'
		artifactKind = isStrictScratchExt
			? 'EPANET / WaterGEMS / AMI Scratch Artifact'
			: (isIntermediateSubfile ? 'Hydraulic Solver / MDM Staging Cache' : 'Utility Solver & Spool Scratch')
		vaultRole = 'EPANET, SWMM, InfoWorks, AMI Spool or ILI Cache Scratch'
		isMutableFile = true
	} else if (isSafetyHoldPath && (isComplianceOrModel || isStrictUtilityMaster || isContextExport || hasUtilityContext)) {
		family = 'water-regulatory-epanet-compliance'
		artifactKind = 'Pipeline Integrity & EPA Regulatory Hold'
		vaultRole = 'Protected PHMSA, SDWA, NPDES or Consent Decree Hold'
		isProtectedSafetyHold = true
		isProtectedComplianceModel = true
		isUtilityMasterAnchor = isStrictUtilityMaster || isComplianceOrModel
		isMutableFile = true
	} else if (isComplianceOrModel) {
		family = 'water-regulatory-epanet-compliance'
		if (/\.(?:sdwis|dmr|ccr|wml)$/i.test(lowerBase) || /sdwis|npdes|compliance/.test(lower)) {
			artifactKind = 'EPA SDWIS / NPDES / WaterML Compliance'
			vaultRole = 'Canonical Drinking-Water, CSO or Effluent Compliance Record'
		} else {
			artifactKind = 'EPANET / SWMM / InfoWorks Hydraulic Model'
			vaultRole = 'Canonical Calibrated Water Distribution & Sewer Network Baseline'
		}
		isProtectedComplianceModel = true
		isUtilityMasterAnchor = true
		isMutableFile = true
	} else if (isStrictUtilityMaster) {
		family = 'ami-pipeline-telemetry-masters'
		if (/\.(?:ili|mfl|paut|ut)$/i.test(lowerBase)) {
			artifactKind = 'Pipeline ILI / MFL Pigging & Weld NDT Master'
			vaultRole = 'Immutable Smart Pigging, MFL Corrosion or Phased-Array Weld Log'
			isMutableFile = false
		} else if (/\.(?:cor|leak)$/i.test(lowerBase)) {
			artifactKind = 'Acoustic Leak Correlator & Hydrophone Master'
			vaultRole = 'Immutable Subsurface Pipe Acoustic Leak Capture'
			isMutableFile = false
		} else if (/\.(?:dnp3|opcua)$/i.test(lowerBase)) {
			artifactKind = 'Water SCADA Pump & WTP Historian Master'
			vaultRole = 'Immutable DNP3 / OPC-UA Treatment & Booster Telemetry Archive'
			isMutableFile = false
		} else {
			artifactKind = 'AMI / DLMS / LoRaWAN Smart Meter Master'
			vaultRole = 'Immutable Smart Water/Gas Metering & MDM Archive'
			isMutableFile = false
		}
		isProtectedTelemetryMaster = true
		isUtilityMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-utility-csv-exports'
		if (/\.(?:png|jpg|jpeg|webp|svg|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Pressure Contour / Flow Profile / Billing PDF'
		} else if (/\.(?:shp|geojson|kml|dbf)$/i.test(lowerBase)) {
			artifactKind = 'Derived Valve Book / Main Break GIS Export'
		} else {
			artifactKind = 'Derived AMI Rollup / Hydrograph CSV Export'
		}
		vaultRole = 'Derived Utility Flow, Pressure, Billing or GIS Sheet Export'
		isRedundantUtilityExport = true
		isMutableFile = true
	}

	const { utilityToolchain, workflowStage } = extractUtilityToolchainAndStage(normalized, basename)
	const pipelineStem = extractUrbanWaterUtilityPipelineStem(basename, normalized)
	const utilityAnchorKey = extractUrbanWaterUtilityPipelineAnchorKey(pipelineStem)
	const utilityTag = extractUtilityDomainTag(lowerBase, lower)

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
		utilityToolchain,
		workflowStage,
		pipelineStem,
		utilityAnchorKey,
		utilityTag,
		isProtectedComplianceModel,
		isProtectedTelemetryMaster,
		isProtectedSafetyHold,
		isUtilityMasterAnchor,
		isRedundantUtilityExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'hydraulic-solver-utility-scratch') || (isGenericScratchExt && hasUtilityContext && family === 'hydraulic-solver-utility-scratch'),
		isBaselinePath,
		isSafetyHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Urban Water Utility & Pipeline domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isUrbanWaterUtilityPipelineGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyUrbanWaterUtilityPipelineFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified EPANET/Compliance/AMI/ILI anchors
 * to derived flow profiles, pressure-contour plots, billing PDFs, and GIS valve exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildUrbanWaterUtilityPipelineCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyUrbanWaterUtilityPipelineFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isUtilityMasterAnchor) {
				anchorStems.add(meta.pipelineStem)
				anchorKeys.add(meta.utilityAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Urban Water & Pipeline cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'water-regulatory-epanet-compliance')) {
		return 'water-regulatory-epanet-compliance'
	}
	if (members.some(m => m.family === 'ami-pipeline-telemetry-masters')) {
		return 'ami-pipeline-telemetry-masters'
	}
	if (members.some(m => m.family === 'redundant-utility-csv-exports')) {
		return 'redundant-utility-csv-exports'
	}
	return 'hydraulic-solver-utility-scratch'
}

/**
 * Compute deterministic survivor priority score for an Urban Water & Pipeline vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-telemetry-capture-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedComplianceModel ? 97000 : 0)
			+ (member.isProtectedTelemetryMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantUtilityExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-calibration-run-first') {
		return (member.isProtectedSafetyHold ? 100000 : 0)
			+ (member.isProtectedComplianceModel ? 97000 : 0)
			+ (member.isProtectedTelemetryMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantUtilityExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedSafetyHold ? 52000 : 0)
			+ (member.isProtectedComplianceModel ? 50000 : 0)
			+ (member.isProtectedTelemetryMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedSafetyHold ? 100000 : 0)
		+ (member.isProtectedComplianceModel ? 97000 : 0)
		+ (member.isProtectedTelemetryMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantUtilityExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Urban Water Utility, Hydraulic Network & Pipeline duplicate cluster.
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
		const meta = classifyUrbanWaterUtilityPipelineFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.utilityToolchain)?.utilityToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].pipelineStem || extractUrbanWaterUtilityPipelineStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].utilityAnchorKey || extractUrbanWaterUtilityPipelineAnchorKey(primaryStem)

	const hasUtilityMasterAnchor = Boolean(
		rawMembers.some(m => m.isUtilityMasterAnchor)
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

		const isRedundantUtilityExportMember = member.isRedundantUtilityExport && hasUtilityMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantUtilityExport) {
			redundancyReason = isRedundantUtilityExportMember
				? 'Derived flow, pressure, billing, or GIS export duplicates verified EPANET, AMI, or ILI master'
				: 'Derived utility report or GIS export without verified EPANET, AMI, or ILI master anchor'
		}

		let governanceTier = 'hydraulic-solver-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedSafetyHold
				? 'pipeline-safety-hold-protected'
				: (member.isProtectedComplianceModel
					? 'water-regulatory-epanet-protected'
					: (member.isProtectedTelemetryMaster
						? 'ami-pipeline-master-protected'
						: (member.isRedundantUtilityExport
							? 'utility-export-redundant'
							: 'hydraulic-solver-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedSafetyHold && config.protectPipelineSafetyHolds) {
			governanceTier = 'pipeline-safety-hold-protected'
			shielded = true
			protectedReason = 'PHMSA pipeline integrity, EPA Consent Decree, or SDWA boil-water hold strictly conserved'
		} else if (member.isProtectedComplianceModel && config.protectComplianceAndEpanetModels) {
			governanceTier = 'water-regulatory-epanet-protected'
			shielded = true
			protectedReason = 'EPA SDWIS/NPDES compliance submittal or calibrated EPANET/SWMM/InfoWorks model strictly conserved'
		} else if (member.isProtectedTelemetryMaster && config.protectAmiAndPipelineMasters) {
			governanceTier = 'ami-pipeline-master-protected'
			shielded = true
			protectedReason = 'Verified AMI/DLMS meter archive, acoustic leak correlator, ILI/MFL run, or DNP3 historian strictly conserved'
		} else if (isSurvivor && !isRedundantUtilityExportMember) {
			governanceTier = member.isProtectedSafetyHold
				? 'pipeline-safety-hold-protected'
				: (member.isProtectedComplianceModel
					? 'water-regulatory-epanet-protected'
					: (member.isProtectedTelemetryMaster
						? 'ami-pipeline-master-protected'
						: (member.isRedundantUtilityExport
							? 'utility-export-redundant'
							: 'hydraulic-solver-scratch')))
			shielded = true
			protectedReason = 'Canonical Urban Water & Pipeline vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantUtilityExport
				? 'utility-export-redundant'
				: (member.isProtectedComplianceModel
					? 'water-regulatory-epanet-protected'
					: 'hydraulic-solver-scratch')
			action = config.strategy === 'hardlink-immutable-ami-and-ili' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'hydraulic-solver-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active hydraulic solver or AMI spool grace window`
		} else if (member.isRedundantUtilityExport) {
			governanceTier = 'utility-export-redundant'
			if (config.requireUtilityAnchorForPrune && !hasUtilityMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified EPANET, AMI, or ILI pipeline master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'hydraulic-solver-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'EPANET, SWMM, InfoWorks, AMI spool, or ILI cache scratch eligible for cleanup'
		} else if (member.isProtectedTelemetryMaster || member.isProtectedComplianceModel) {
			governanceTier = member.isProtectedComplianceModel ? 'water-regulatory-epanet-protected' : 'ami-pipeline-master-protected'
			action = config.strategy === 'hardlink-immutable-ami-and-ili' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-ami-and-ili' && !member.isMutableFile) {
			governanceTier = 'ami-pipeline-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'hydraulic-solver-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantUtilityExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUtilityExport = members.some(m => m.isRedundantUtilityExportMember || m.isRedundantUtilityExport)
	const hasProtectedSafetyHold = members.some(m => m.governanceTier === 'pipeline-safety-hold-protected' && m.shielded)
	const hasProtectedComplianceModel = members.some(m => m.governanceTier === 'water-regulatory-epanet-protected' && m.shielded)
	const hasProtectedTelemetryMaster = members.some(m => m.governanceTier === 'ami-pipeline-master-protected' && m.shielded)
	const hasHydraulicSolverScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantUtilityExportMember && !m.shielded)) {
			clusterVerdict = 'utility-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'hydraulic-solver-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedSafetyHold) {
		clusterVerdict = 'pipeline-safety-hold-protected'
	} else if (hasProtectedComplianceModel) {
		clusterVerdict = 'water-regulatory-epanet-protected'
	} else if (hasProtectedTelemetryMaster) {
		clusterVerdict = 'ami-pipeline-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantUtilityExport ? 95 : 85
	} else if (hasProtectedSafetyHold) {
		priorityScore = 60
	} else if (hasProtectedComplianceModel) {
		priorityScore = 50
	}

	const utilityTags = [...new Set(members.map(m => m.utilityTag).filter(Boolean))]
	const familyMeta = URBAN_WATER_UTILITY_PIPELINE_FAMILY_META[family] || URBAN_WATER_UTILITY_PIPELINE_FAMILY_META['hydraulic-solver-utility-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		utilityToolchain: primaryToolchain,
		workflowStage: primaryStage,
		pipelineStem: primaryStem,
		utilityAnchorKey: primaryAnchorKey,
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
		hasProtectedComplianceModel,
		hasProtectedTelemetryMaster,
		hasProtectedSafetyHold,
		hasRedundantUtilityExport,
		hasHydraulicSolverScratch,
		hasUtilityMasterAnchor,
		utilityTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as an Urban Water Utility, Hydraulic Network & Pipeline Telemetry Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Urban Water & Pipeline vault audit report.
 */
export function auditUrbanWaterUtilityPipelineVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeUrbanWaterUtilityPipelineConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isUrbanWaterUtilityPipelineGroup)
	const correlationIndex = buildUrbanWaterUtilityPipelineCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'water-regulatory-epanet-compliance': 0,
		'ami-pipeline-telemetry-masters': 0,
		'redundant-utility-csv-exports': 0,
		'hydraulic-solver-utility-scratch': 0,
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
				cluster.utilityToolchain,
				cluster.workflowStage,
				cluster.pipelineStem,
				cluster.utilityAnchorKey,
				cluster.familyLabel,
				...cluster.utilityTags,
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
	let totalComplianceModelClusters = 0
	let totalTelemetryMasterClusters = 0
	let totalSafetyHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalSolverScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedComplianceModel) {
			totalComplianceModelClusters += 1
		}
		if (cluster.hasProtectedTelemetryMaster) {
			totalTelemetryMasterClusters += 1
		}
		if (cluster.hasProtectedSafetyHold) {
			totalSafetyHoldClusters += 1
		}
		if (cluster.hasRedundantUtilityExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasHydraulicSolverScratch) {
			totalSolverScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = URBAN_WATER_UTILITY_PIPELINE_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: URBAN_WATER_UTILITY_PIPELINE_FAMILY_META[id].label,
			shortLabel: URBAN_WATER_UTILITY_PIPELINE_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: URBAN_WATER_UTILITY_PIPELINE_VAULT_SCHEMA,
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
			totalComplianceModelClusters,
			totalTelemetryMasterClusters,
			totalSafetyHoldClusters,
			totalRedundantExportClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Urban Water & Pipeline Vaults.
 * Strictly blocks deletion or hardlinking of shielded PHMSA/EPA Integrity Holds, EPANET/SWMM
 * baselines, and verified AMI/ILI/Leak masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditUrbanWaterUtilityPipelineVault.
 * @return {string} POSIX bash script.
 */
export function buildUrbanWaterUtilityPipelineRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Urban Water Utility, Hydraulic Network & Pipeline Telemetry Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./urban-water-utility-pipeline-vault-reclaim.sh only after verifying EPANET, AMI, and ILI anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.urban-water-pipeline-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-utility-scratch'
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
			} else if (strategy === 'quarantine-exports-and-utility-scratch' && (target.isRedundantUtilityExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable utility exports or hydraulic solver scratch under active EPA, PHMSA, EPANET & AMI shields.\\n"')
	} else {
		lines.push(`printf "Completed Urban Water & Pipeline Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditUrbanWaterUtilityPipelineVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildUrbanWaterUtilityPipelineCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'utility_toolchain',
		'workflow_stage',
		'pipeline_stem',
		'utility_anchor_key',
		'family',
		'cluster_verdict',
		'has_utility_master_anchor',
		'is_redundant_utility_export',
		'is_solver_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'utility_tag',
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
				cluster.utilityToolchain || '',
				cluster.workflowStage || '',
				cluster.pipelineStem,
				cluster.utilityAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasUtilityMasterAnchor ? 'true' : 'false',
				member.isRedundantUtilityExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.utilityTag || '',
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
 * @param {object} auditResult Result from auditUrbanWaterUtilityPipelineVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildUrbanWaterUtilityPipelineJsonManifest(auditResult) {
	const payload = {
		schema: URBAN_WATER_UTILITY_PIPELINE_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || URBAN_WATER_UTILITY_PIPELINE_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			utilityToolchain: cluster.utilityToolchain,
			workflowStage: cluster.workflowStage,
			pipelineStem: cluster.pipelineStem,
			utilityAnchorKey: cluster.utilityAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedComplianceModel: cluster.hasProtectedComplianceModel,
			hasProtectedTelemetryMaster: cluster.hasProtectedTelemetryMaster,
			hasProtectedSafetyHold: cluster.hasProtectedSafetyHold,
			hasRedundantUtilityExport: cluster.hasRedundantUtilityExport,
			hasHydraulicSolverScratch: cluster.hasHydraulicSolverScratch,
			hasUtilityMasterAnchor: cluster.hasUtilityMasterAnchor,
			utilityTags: cluster.utilityTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				utilityTag: member.utilityTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantUtilityExportMember: member.isRedundantUtilityExportMember,
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
 * cloud sync of EPANET, SWMM, WaterGEMS, InfoWorks, AMI spool, and ILI scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildUrbanWaterUtilityPipelineSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Urban Water Utility, Hydraulic & Pipeline Vaults',
		'epanet_tmp/',
		'swmm_scratch/',
		'watergems_cache/',
		'infoworks_tmp/',
		'hecras_scratch/',
		'ami_spool/',
		'mdm_staging/',
		'ili_cache/',
		'leak_buf/',
		'scada_water_tmp/',
		'pump_staging/',
		'gis_tile_cache/',
		'tmp_epanet_*',
		'tmp_swmm_*',
		'tmp_ami_*',
		'tmp_mdm_*',
		'tmp_ili_*',
		'tmp_leak_*',
		'tmp_pump_*',
		'tmp_water_*',
		'cache_ami_*',
		'spool_mdm_*',
		'*.inp.tmp',
		'*.wtg.bak',
		'*.icm.lck',
		'*.iwm.tmp',
		'*.ami.part',
		'*.mdm.tmp',
		'*.mfl.idx',
		'*.ili.part',
		'*.cor.tmp',
		'*.dnp3.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
