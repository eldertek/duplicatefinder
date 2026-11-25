/**
 * Pure Wine Enology, Brewery Fermentation & Food-Safety HACCP Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Enology, Brewing & HACCP Vault families:
 * - HACCP, FSMA, OIV & TTB Regulatory / Recall Holds (.haccp, .fsma, .iso22000, .brcgs, .ifsfood, .oiv, .ttb, .vi1, .recall, .coa, .excise, .ccp, .fda204, .aoc, .docg, plus XML/JSON/YAML/SQLite/CSV/PDF in recall/regulatory baseline context)
 * - Wine Cellar, Brewhouse & Lab Spectroscopy Masters (.ferm, .brix, .plato, .must, .cellar, .barrel, .ftir, .hplc, .gcms, .oeno, .brewhouse, .mash, .wort, .yeast, .malo, .so2log, .enology, plus .ndvi/.tif/.tiff/.geojson/.shp/.gpkg/.parquet/.h5/.hdf5/.mzml/.cdf/.raw/.bin/.dat in enology/brewery/HACCP context)
 * - Redundant Tasting Sheet, Label Proof & Fermentation Report Exports (.csv, .tsv, .txt, .xlsx, .xls, .json, .jsonl, .pdf, .png, .jpg, .jpeg, .webp, .svg, .mp4, .mov, .avi in enology/brewery/HACCP export context)
 * - Cellar SCADA, Fermentation Telemetry & Lab Scratch (cellar_scada_tmp/, ferm_telemetry_cache/, hplc_spool/, ftir_buf/, gcms_scratch/, brewhouse_tmp/, bottling_line_cache/, vineyard_ndvi_tmp/, haccp_staging/, yeast_pitch_buf/, barrel_iot_cache/, oeno_viewer_tmp/, .ferm.tmp, .brix.tmp, .plato.bak, .ftir.idx, .hplc.tmp, .gcms.part, .cellar.lck, .barrel.tmp, .haccp.tmp, .oeno.tmp, .lck)
 *
 * Enforces strict HACCP / FSMA / TTB / OIV Compliance, Recall Quarantine Hold, and Enology/Fermentation Master defaults:
 * - Strictly conserves FSMA 204, FDA recall, allergen, cork-taint TCA, and HACCP CCP quarantine holds
 * - Strictly conserves canonical TTB excise manifests, OIV VI-1 certificates, COA lab baselines, and HACCP/ISO 22000 plans
 * - Strictly conserves verified Cellar SCADA, Brewhouse Plato/Brix, and FTIR/HPLC/GC-MS spectral masters
 * - Detects redundant tasting sheets, bottling label proofs, FTIR curve PNGs, and Brix CSV exports when a verified Enology/Lab/HACCP master anchor exists
 * - Blocks pruning of derived enology/brewery exports lacking a verified master anchor when guard is active
 * - Blocks hardlinks on mutable CSV/JSON/PDF/XML/GeoJSON/label files and telemetry/lab scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const WINE_ENOLOGY_HACCP_VAULT_SCHEMA = 'duplicatefinder.wine-enology-haccp-vault-auditor.v1'

export const WINE_ENOLOGY_HACCP_FAMILIES = Object.freeze([
	'all',
	'wine-haccp-regulatory-holds',
	'enology-fermentation-masters',
	'redundant-enology-reports-exports',
	'cellar-fermentation-lab-scratch',
])

export const WINE_ENOLOGY_HACCP_FAMILY_META = Object.freeze({
	'wine-haccp-regulatory-holds': {
		id: 'wine-haccp-regulatory-holds',
		label: 'HACCP / TTB / OIV & Recall',
		shortLabel: 'Recall Holds, FSMA 204, TTB Excise, OIV VI-1 & HACCP Plans (.haccp, .fsma, .oiv, .ttb, .recall, .coa)',
	},
	'enology-fermentation-masters': {
		id: 'enology-fermentation-masters',
		label: 'Cellar, Brewhouse & Lab Masters',
		shortLabel: 'Verified Masters (.ferm, .brix, .plato, .must, .cellar, .barrel, .ftir, .hplc, .gcms, .brewhouse)',
	},
	'redundant-enology-reports-exports': {
		id: 'redundant-enology-reports-exports',
		label: 'Derived Cellar & Lab Exports',
		shortLabel: 'Derived Tasting Sheets, FTIR Plots, Bottling Proofs & Brix CSVs (.pdf, .csv, .xlsx, .png, .svg)',
	},
	'cellar-fermentation-lab-scratch': {
		id: 'cellar-fermentation-lab-scratch',
		label: 'Cellar & Lab Scratch',
		shortLabel: 'Telemetry & Lab Scratch (cellar_scada_tmp/, ferm_telemetry_cache/, hplc_spool/, ftir_buf/, .ferm.tmp)',
	},
})

export const WINE_ENOLOGY_HACCP_STRATEGIES = Object.freeze([
	'prune-exports-and-cellar-scratch',
	'hardlink-immutable-enology-masters',
	'quarantine-exports-and-cellar-scratch',
])

export const WINE_ENOLOGY_HACCP_SURVIVOR_RULES = Object.freeze([
	'haccp-enology-master-first',
	'oldest-vintage-capture-first',
	'newest-lot-run-first',
	'shortest-path',
])

export const WINE_ENOLOGY_HACCP_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'wine-haccp-regulatory-protected',
	'enology-fermentation-master-protected',
	'recall-quarantine-hold-protected',
	'enology-export-redundant',
	'cellar-ferm-scratch',
	'shielded',
])

export const WINE_ENOLOGY_HACCP_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const WINE_ENOLOGY_HACCP_PRESETS = Object.freeze([
	{
		id: 'all-wine-enology-haccp-audit',
		name: 'All Wine, Brewery & HACCP',
		description: 'Audit HACCP/FSMA/OIV/TTB holds and excise baselines, Cellar/Brewhouse/FTIR/HPLC masters, derived exports, and telemetry scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-cellar-scratch',
		survivorRule: 'haccp-enology-master-first',
		protectRegulatoryAndHaccpHolds: true,
		protectEnologyMasters: true,
		protectRecallQuarantineHolds: true,
		requireEnologyMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'cellar-ferm-scratch-cleanup',
		name: 'Cellar & Lab Scratch',
		description: 'Reclaim cellar_scada_tmp/, ferm_telemetry_cache/, hplc_spool/, ftir_buf/, and .ferm.tmp/.ftir.idx scratch older than the active window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-cellar-scratch',
		survivorRule: 'haccp-enology-master-first',
		protectRegulatoryAndHaccpHolds: true,
		protectEnologyMasters: true,
		protectRecallQuarantineHolds: true,
		requireEnologyMasterAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-enology-exports-vs-masters',
		name: 'Derived Reports vs Masters',
		description: 'Detect derived tasting sheets, FTIR curve plots, bottling label proofs, and Brix/Plato CSVs backed by a verified Enology or Lab anchor.',
		familyFilter: 'redundant-enology-reports-exports',
		strategy: 'quarantine-exports-and-cellar-scratch',
		survivorRule: 'haccp-enology-master-first',
		protectRegulatoryAndHaccpHolds: true,
		protectEnologyMasters: true,
		protectRecallQuarantineHolds: true,
		requireEnologyMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'wine-haccp-regulatory-shield',
		name: 'HACCP / TTB / OIV Shield',
		description: 'Inspect FSMA 204 recall holds, FDA allergen/TCA quarantines, TTB excise manifests, OIV VI-1 certificates, and HACCP CCP plans under strict shield.',
		familyFilter: 'wine-haccp-regulatory-holds',
		strategy: 'hardlink-immutable-enology-masters',
		survivorRule: 'haccp-enology-master-first',
		protectRegulatoryAndHaccpHolds: true,
		protectEnologyMasters: true,
		protectRecallQuarantineHolds: true,
		requireEnologyMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'enology-fermentation-masters',
		name: 'Cellar, Brewhouse & Lab Masters',
		description: 'Audit verified Winery fermentation tanks, barrel-aging telemetry, Brewhouse mash/wort logs, and FTIR/HPLC/GC-MS spectroscopy masters.',
		familyFilter: 'enology-fermentation-masters',
		strategy: 'hardlink-immutable-enology-masters',
		survivorRule: 'haccp-enology-master-first',
		protectRegulatoryAndHaccpHolds: true,
		protectEnologyMasters: true,
		protectRecallQuarantineHolds: true,
		requireEnologyMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const WINE_ENOLOGY_HACCP_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-wine-enology-haccp-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-cellar-scratch',
	survivorRule: 'haccp-enology-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectRegulatoryAndHaccpHolds: true,
	protectEnologyMasters: true,
	protectRecallQuarantineHolds: true,
	requireEnologyMasterAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_WINE_REGULATORY_EXT_RE = /\.(?:haccp|fsma|iso22000|brcgs|ifsfood|oiv|ttb|vi1|recall|coa|excise|ccp|fda204|aoc|docg)$/i
const CONTEXT_WINE_REGULATORY_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_ENOLOGY_MASTER_EXT_RE = /\.(?:ferm|brix|plato|must|cellar|barrel|ftir|hplc|gcms|oeno|brewhouse|mash|wort|yeast|malo|so2log|enology)$/i
const CONTEXT_ENOLOGY_MASTER_EXT_RE = /\.(?:ndvi|tif|tiff|geojson|shp|gpkg|parquet|parq|h5|hdf5|mzml|cdf|raw|bin|dat)$/i
const CONTEXT_ENOLOGY_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|xls|json|jsonl|pdf|png|jpg|jpeg|webp|svg|mp4|mov|avi)$/i
const STRICT_CELLAR_SCRATCH_EXT_RE = /\.(?:ferm\.tmp|brix\.tmp|plato\.bak|ftir\.idx|hplc\.tmp|gcms\.part|cellar\.lck|barrel\.tmp|haccp\.tmp|oeno\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_WINE_EXCLUSION_RE = /(?:veterinary|vet_?pacs|vetdcm|vpacs|equine|livestock|coggins|icar_?dairy|isag_?snp|epanet|swmm|watergems|sdwis|phmsa|pipeline_ili|iec61850|comtrade|synchrophasor|v2x|scms|ntcip|etcs|ertms|cbtc|railml|quantum|qubit|qasm|geant4|cmssw|orbital|ccsds|human_?bids|hipaa|hl7|fhir|nifti|clinvar|gnomad|grch38|hg38|photoshop|lightroom|premiere|davinci|protools|logicpro|ableton|cubase|vst3|gdsii|oasis)/i
const WINE_CONTEXT_HINT_RE = /(?:winery|wine|enology|oeno|viticulture|vineyard|cellar|barrel|oak_?cask|ferment|brix|plato|specific_?gravity|must_?lot|malolactic|so2|sulfite|vintage|cuvee|chateau|brewery|brewhouse|mash_?tun|lauter|wort|trub|hop_?lot|yeast_?pitch|ftir|hplc|gcms|haccp|fsma|iso22000|brcgs|ifs_?food|oiv|ttb|vi1|coa_?lot|excise_?bond|bottling_?line|tasting_?room)/i
const WINE_RECALL_HOLD_PATH_RE = /(?:recall_?hold|fsma_?hold|fda_?hold|haccp_?hold|allergen_?hold|sulfite_?hold|taint_?hold|tca_?hold|brett_?hold|quarantine_?lot|regulatory_?hold|ttb_?audit_?hold|litigation_?hold)/i
const WINE_BASELINE_PATH_RE = /(?:00_haccp|00_fsma|00_oiv|00_ttb|00_coa|00_excise|haccp_plans|ccp_baselines|ttb_manifests|oiv_records|lot_traceability|bottling_compliance)/i
const CELLAR_SCRATCH_PATH_RE = /(?:cellar_scada_tmp|ferm_telemetry_cache|hplc_spool|ftir_buf|gcms_scratch|brewhouse_tmp|bottling_line_cache|vineyard_ndvi_tmp|haccp_staging|yeast_pitch_buf|barrel_iot_cache|oeno_viewer_tmp)/i
const WINE_INTERMEDIATE_PREFIX_RE = /^(?:tmp_wine_|tmp_ferm_|tmp_brew_|tmp_haccp_|tmp_ftir_|tmp_hplc_|tmp_cellar_|tmp_brix_|cache_cellar_|spool_lab_)/i
const WINE_INTERMEDIATE_SUFFIX_RE = /(?:_ferm_tmp|_cellar_cache|_hplc_spool|_ftir_buf|_brewhouse_tmp|_haccp_staging|_oeno_tmp)$/i
const WINE_EXPORT_PATH_RE = /(?:fermentation_reports|tasting_sheets|lab_exports|ftir_plots|bottling_exports|cellar_summaries|ndvi_renders|haccp_dashboards|_ferm_report|_tasting_sheet|_ftir_plot|_brix_csv|_ccp_export|_label_proof)/i
const CANONICAL_WINE_VAULT_PATH_RE = /(?:00_raw|00_cellar|00_ferm|00_brewhouse|00_lab|00_ftir|00_hplc|00_masters|canonical|winery_archive|brewery_archive|enology_archive)/i

/**
 * Normalize configuration values for Wine Enology, Brewery Fermentation & Food-Safety HACCP Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeWineEnologyHaccpConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = WINE_ENOLOGY_HACCP_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.familyFilter
	const verdictFilter = WINE_ENOLOGY_HACCP_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.verdictFilter
	const strategy = WINE_ENOLOGY_HACCP_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.strategy
	const survivorRule = WINE_ENOLOGY_HACCP_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.survivorRule
	const sortMode = WINE_ENOLOGY_HACCP_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : WINE_ENOLOGY_HACCP_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectRegulatoryAndHaccpHolds: cfg.protectRegulatoryAndHaccpHolds !== undefined ? Boolean(cfg.protectRegulatoryAndHaccpHolds) : true,
		protectEnologyMasters: cfg.protectEnologyMasters !== undefined ? Boolean(cfg.protectEnologyMasters) : true,
		protectRecallQuarantineHolds: cfg.protectRecallQuarantineHolds !== undefined ? Boolean(cfg.protectRecallQuarantineHolds) : true,
		requireEnologyMasterAnchorForPrune: cfg.requireEnologyMasterAnchorForPrune !== undefined ? Boolean(cfg.requireEnologyMasterAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized vintage lot, cellar tank, or brew batch stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized enology/brewery/HACCP stem.
 */
export function extractWineEnologyHaccpStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:ferm\.tmp|brix\.tmp|plato\.bak|ftir\.idx|hplc\.tmp|gcms\.part|cellar\.lck|barrel\.tmp|haccp\.tmp|oeno\.tmp)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(WINE_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(WINE_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:ferm_report|tasting_sheet|ftir_plot|brix_csv|ccp_export|label_proof|summary|export|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'enology-lot'
}

/**
 * Extract canonical anchor key linking derived tasting/FTIR/Brix exports to verified Enology, Brewhouse, Lab, or HACCP anchors.
 *
 * @param {string} wineStem Extracted enology/brewery/HACCP stem.
 * @return {string} Canonical anchor key.
 */
export function extractWineEnologyHaccpAnchorKey(wineStem) {
	return String(wineStem || 'enology-lot')
		.toLowerCase()
		.replace(/(?:[-_](?:haccp|fsma|iso22000|oiv|ttb|vi1|recall|coa|excise|ccp|ferm|brix|plato|must|cellar|barrel|ftir|hplc|gcms|oeno|brewhouse|mash|wort|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'enology-lot'
}

/**
 * Detect Wine Enology, Brewery Fermentation & Food-Safety HACCP toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ enologyToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractWineToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let enologyToolchain = ''
	if (/\.(?:ferm|brix|must|cellar|barrel|oeno|malo|so2log|enology)\b|cellar_?scada|barrel_?iot|winery|malolactic/.test(text)) {
		enologyToolchain = 'Winery Cellar SCADA & Barrel Fermentation'
	} else if (/\.(?:plato|brewhouse|mash|wort|yeast)\b|brewhouse|mash_?tun|lauter|yeast_?pitch|brewery/.test(text)) {
		enologyToolchain = 'Brewery Brewhouse Mash & Wort Telemetry'
	} else if (/\.(?:ftir|hplc|gcms|mzml|cdf)\b|ftir|hplc|gcms|spectroscopy|chromatography/.test(text)) {
		enologyToolchain = 'Enology FTIR, HPLC & GC-MS Lab Analytics'
	} else if (/\.(?:ndvi|geojson|shp|gpkg)\b|vineyard_?ndvi|viticulture|vineyard/.test(text)) {
		enologyToolchain = 'Vineyard NDVI & Harvest Block GIS'
	} else if (/\.(?:haccp|fsma|iso22000|brcgs|ifsfood|ccp|fda204)\b|haccp|fsma|iso22000|ccp_?baseline/.test(text)) {
		enologyToolchain = 'Food-Safety HACCP / FSMA 204 / ISO 22000'
	} else if (/\.(?:oiv|ttb|vi1|coa|excise|aoc|docg)\b|ttb_?manifest|oiv|vi1|excise/.test(text)) {
		enologyToolchain = 'TTB Excise, OIV VI-1 & COA Compliance'
	} else if (WINE_RECALL_HOLD_PATH_RE.test(text)) {
		enologyToolchain = 'Food-Safety Recall & Quarantine Hold'
	}

	let workflowStage = ''
	if (WINE_RECALL_HOLD_PATH_RE.test(text)) {
		workflowStage = 'FSMA Recall, Allergen or TCA Quarantine Hold'
	} else if (STRICT_WINE_REGULATORY_EXT_RE.test(basename) || WINE_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'HACCP / TTB / OIV Compliance Baseline'
	} else if (CELLAR_SCRATCH_PATH_RE.test(text) || STRICT_CELLAR_SCRATCH_EXT_RE.test(basename) || WINE_INTERMEDIATE_PREFIX_RE.test(basename) || WINE_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'Cellar SCADA, FTIR & HPLC Scratch'
	} else if (WINE_EXPORT_PATH_RE.test(text) || (CONTEXT_ENOLOGY_EXPORT_EXT_RE.test(basename) && WINE_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Tasting Sheet, Label Proof or Brix Export'
	} else if (STRICT_ENOLOGY_MASTER_EXT_RE.test(basename) || (CONTEXT_ENOLOGY_MASTER_EXT_RE.test(basename) && (WINE_CONTEXT_HINT_RE.test(text) || CANONICAL_WINE_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified Cellar, Brewhouse or Lab Master'
	}

	return { enologyToolchain, workflowStage }
}

/**
 * Extract concise Wine Enology, Brewery & HACCP domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractWineDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (WINE_RECALL_HOLD_PATH_RE.test(text)) {
		return 'FSMA / RECALL HOLD'
	}
	if (/\.(?:haccp|fsma|iso22000|brcgs|ifsfood|ccp|fda204)\b/.test(lowerBase)) {
		return 'HACCP / FSMA 204'
	}
	if (/\.(?:oiv|ttb|vi1|coa|excise|aoc|docg)\b/.test(lowerBase)) {
		return 'TTB / OIV / COA'
	}
	if (/\.(?:ferm|brix|must|cellar|barrel|oeno|malo|so2log|enology)\b/.test(lowerBase)) {
		return 'CELLAR / BRIX MASTER'
	}
	if (/\.(?:plato|brewhouse|mash|wort|yeast)\b/.test(lowerBase)) {
		return 'BREWERY / PLATO'
	}
	if (/\.(?:ftir|hplc|gcms|mzml|cdf)\b/.test(lowerBase)) {
		return 'FTIR / HPLC LAB'
	}
	if (STRICT_CELLAR_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'CELLAR / LAB SCRATCH'
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
 * Classify a single file within the Wine Enology, Brewery Fermentation & Food-Safety HACCP domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyWineEnologyHaccpFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_WINE_EXCLUSION_RE.test(lower)
	const hasWineContext = !hasExcludedContext && WINE_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && WINE_BASELINE_PATH_RE.test(lower)
	const isRecallHoldPath = !hasExcludedContext && WINE_RECALL_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_WINE_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && CELLAR_SCRATCH_PATH_RE.test(lower)
	const isWineExportPath = !hasExcludedContext && WINE_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_CELLAR_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (WINE_INTERMEDIATE_PREFIX_RE.test(lowerBase) || WINE_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictRegulatoryOrHaccp = !hasExcludedContext && STRICT_WINE_REGULATORY_EXT_RE.test(lowerBase)
	const isRegulatoryOrHaccp = !hasExcludedContext && (
		isStrictRegulatoryOrHaccp
		|| (CONTEXT_WINE_REGULATORY_EXT_RE.test(lowerBase) && !isWineExportPath && (isBaselinePath || isRecallHoldPath))
	)

	const isContextEnologyMaster = CONTEXT_ENOLOGY_MASTER_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasWineContext || isCanonicalVaultPath)
	const isStrictEnologyMaster = !hasExcludedContext && (
		STRICT_ENOLOGY_MASTER_EXT_RE.test(lowerBase)
		|| isContextEnologyMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictEnologyMaster
		&& !isRegulatoryOrHaccp
		&& CONTEXT_ENOLOGY_EXPORT_EXT_RE.test(lowerBase)
		&& (hasWineContext || isWineExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Wine Enology, Brewery & HACCP Vault'
	let isProtectedRegulatoryHaccp = false
	let isProtectedEnologyMaster = false
	let isProtectedRecallHold = false
	let isEnologyMasterAnchor = false
	let isRedundantEnologyExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictEnologyMaster || isRegulatoryOrHaccp))
		|| (isIntermediateSubfile && (isStrictEnologyMaster || isContextExport || hasWineContext))
		|| (isGenericScratchExt && hasWineContext && !isBaselinePath && !isRecallHoldPath)
	) {
		family = 'cellar-fermentation-lab-scratch'
		artifactKind = isStrictScratchExt
			? 'Cellar SCADA / FTIR / HPLC Scratch Artifact'
			: (isIntermediateSubfile ? 'Fermentation Telemetry / Lab Buffer Cache' : 'Cellar Viewer & Staging Scratch')
		vaultRole = 'Cellar SCADA, Brewhouse Telemetry, or FTIR/HPLC Lab Scratch'
		isMutableFile = true
	} else if (isRecallHoldPath && (isRegulatoryOrHaccp || isStrictEnologyMaster || isContextExport || hasWineContext)) {
		family = 'wine-haccp-regulatory-holds'
		artifactKind = 'FSMA Recall / Allergen / TCA Quarantine Hold'
		vaultRole = 'Protected FDA FSMA 204, Allergen, TCA Taint, or Recall Lot Hold'
		isProtectedRecallHold = true
		isProtectedRegulatoryHaccp = true
		isEnologyMasterAnchor = isStrictEnologyMaster || isRegulatoryOrHaccp
		isMutableFile = true
	} else if (isRegulatoryOrHaccp) {
		family = 'wine-haccp-regulatory-holds'
		if (/\.(?:haccp|fsma|iso22000|brcgs|ifsfood|ccp|fda204)$/i.test(lowerBase) || /haccp|fsma|iso22000|ccp/.test(lower)) {
			artifactKind = 'HACCP / FSMA 204 / ISO 22000 Compliance Plan'
			vaultRole = 'Canonical Critical Control Point, Sanitation & Traceability Record'
		} else {
			artifactKind = 'TTB Excise / OIV VI-1 / COA Lot Baseline'
			vaultRole = 'Canonical TTB Bond Manifest, OIV Export Certificate, or COA Baseline'
		}
		isProtectedRegulatoryHaccp = true
		isEnologyMasterAnchor = true
		isMutableFile = true
	} else if (isStrictEnologyMaster) {
		family = 'enology-fermentation-masters'
		if (/\.(?:ftir|hplc|gcms|mzml|cdf)$/i.test(lowerBase)) {
			artifactKind = 'FTIR / HPLC / GC-MS Lab Spectroscopy Master'
			vaultRole = 'Immutable Enology Polyphenol, Sugar & Volatile Aroma Assay'
			isMutableFile = false
		} else if (/\.(?:plato|brewhouse|mash|wort|yeast)$/i.test(lowerBase)) {
			artifactKind = 'Brewhouse Mash, Wort & Yeast Pitch Master'
			vaultRole = 'Immutable Brewery Gravity, Kettle Boil & Fermentation Master'
			isMutableFile = /\.(?:yeast)$/i.test(lowerBase)
		} else if (/\.(?:ndvi|geojson|shp|gpkg|tif|tiff)$/i.test(lowerBase)) {
			artifactKind = 'Vineyard NDVI & Harvest Block GIS Master'
			vaultRole = 'Canonical Vineyard Canopy Vigour & Parcel Harvest Baseline'
			isMutableFile = /\.(?:geojson|shp)$/i.test(lowerBase)
		} else {
			artifactKind = 'Winery Cellar Tank, Brix & Barrel Master'
			vaultRole = 'Immutable Cellar Fermentation Curve & Oak Cask Aging Master'
			isMutableFile = /\.(?:so2log|malo)$/i.test(lowerBase)
		}
		isProtectedEnologyMaster = true
		isEnologyMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-enology-reports-exports'
		if (/\.(?:mp4|mov|avi)$/i.test(lowerBase)) {
			artifactKind = 'Derived Bottling Line / Cellar Inspection Video'
		} else if (/\.(?:png|jpg|jpeg|webp|svg|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Tasting Sheet / FTIR Plot / Label Proof Export'
		} else {
			artifactKind = 'Derived Brix / Plato / CCP Summary CSV Export'
		}
		vaultRole = 'Derived Enology Report, Label Proof, or Fermentation CSV Export'
		isRedundantEnologyExport = true
		isMutableFile = true
	}

	const { enologyToolchain, workflowStage } = extractWineToolchainAndStage(normalized, basename)
	const wineStem = extractWineEnologyHaccpStem(basename, normalized)
	const wineAnchorKey = extractWineEnologyHaccpAnchorKey(wineStem)
	const wineTag = extractWineDomainTag(lowerBase, lower)

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
		enologyToolchain,
		workflowStage,
		wineStem,
		wineAnchorKey,
		wineTag,
		isProtectedRegulatoryHaccp,
		isProtectedEnologyMaster,
		isProtectedRecallHold,
		isEnologyMasterAnchor,
		isRedundantEnologyExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'cellar-fermentation-lab-scratch') || (isGenericScratchExt && hasWineContext && family === 'cellar-fermentation-lab-scratch'),
		isBaselinePath,
		isRecallHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Wine Enology, Brewery Fermentation & HACCP domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isWineEnologyHaccpGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyWineEnologyHaccpFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Cellar, Brewhouse, FTIR/HPLC, and HACCP/OIV/TTB anchors
 * to derived tasting sheets, FTIR plots, label proofs, and Brix/Plato CSV exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildWineEnologyHaccpCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyWineEnologyHaccpFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isEnologyMasterAnchor) {
				anchorStems.add(meta.wineStem)
				anchorKeys.add(meta.wineAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Wine Enology, Brewery & HACCP cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'wine-haccp-regulatory-holds')) {
		return 'wine-haccp-regulatory-holds'
	}
	if (members.some(m => m.family === 'enology-fermentation-masters')) {
		return 'enology-fermentation-masters'
	}
	if (members.some(m => m.family === 'redundant-enology-reports-exports')) {
		return 'redundant-enology-reports-exports'
	}
	return 'cellar-fermentation-lab-scratch'
}

/**
 * Compute deterministic survivor priority score for a Wine Enology, Brewery & HACCP vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-vintage-capture-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRecallHold ? 100000 : 0)
			+ (member.isProtectedRegulatoryHaccp ? 97000 : 0)
			+ (member.isProtectedEnologyMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantEnologyExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-lot-run-first') {
		return (member.isProtectedRecallHold ? 100000 : 0)
			+ (member.isProtectedRegulatoryHaccp ? 97000 : 0)
			+ (member.isProtectedEnologyMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantEnologyExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRecallHold ? 52000 : 0)
			+ (member.isProtectedRegulatoryHaccp ? 50000 : 0)
			+ (member.isProtectedEnologyMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRecallHold ? 100000 : 0)
		+ (member.isProtectedRegulatoryHaccp ? 97000 : 0)
		+ (member.isProtectedEnologyMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantEnologyExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Wine Enology, Brewery Fermentation & Food-Safety HACCP duplicate cluster.
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
		const meta = classifyWineEnologyHaccpFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.enologyToolchain)?.enologyToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].wineStem || extractWineEnologyHaccpStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].wineAnchorKey || extractWineEnologyHaccpAnchorKey(primaryStem)

	const hasEnologyMasterAnchor = Boolean(
		rawMembers.some(m => m.isEnologyMasterAnchor)
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

		const isRedundantEnologyExportMember = member.isRedundantEnologyExport && hasEnologyMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantEnologyExport) {
			redundancyReason = isRedundantEnologyExportMember
				? 'Derived tasting sheet, FTIR plot, or Brix CSV duplicates verified Cellar, Brewhouse, or Lab master'
				: 'Derived enology report or label proof without verified Cellar, Brewhouse, or Lab master anchor'
		}

		let governanceTier = 'cellar-ferm-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedRecallHold
				? 'recall-quarantine-hold-protected'
				: (member.isProtectedRegulatoryHaccp
					? 'wine-haccp-regulatory-protected'
					: (member.isProtectedEnologyMaster
						? 'enology-fermentation-master-protected'
						: (member.isRedundantEnologyExport
							? 'enology-export-redundant'
							: 'cellar-ferm-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRecallHold && config.protectRecallQuarantineHolds) {
			governanceTier = 'recall-quarantine-hold-protected'
			shielded = true
			protectedReason = 'FDA FSMA 204, allergen, TCA cork-taint, or lot recall quarantine hold strictly conserved'
		} else if (member.isProtectedRegulatoryHaccp && config.protectRegulatoryAndHaccpHolds) {
			governanceTier = 'wine-haccp-regulatory-protected'
			shielded = true
			protectedReason = 'HACCP CCP plan, TTB excise manifest, OIV VI-1 certificate, or COA baseline strictly conserved'
		} else if (member.isProtectedEnologyMaster && config.protectEnologyMasters) {
			governanceTier = 'enology-fermentation-master-protected'
			shielded = true
			protectedReason = 'Verified Cellar fermentation, Brewhouse mash/wort, or FTIR/HPLC/GC-MS master strictly conserved'
		} else if (isSurvivor && !isRedundantEnologyExportMember) {
			governanceTier = member.isProtectedRecallHold
				? 'recall-quarantine-hold-protected'
				: (member.isProtectedRegulatoryHaccp
					? 'wine-haccp-regulatory-protected'
					: (member.isProtectedEnologyMaster
						? 'enology-fermentation-master-protected'
						: (member.isRedundantEnologyExport
							? 'enology-export-redundant'
							: 'cellar-ferm-scratch')))
			shielded = true
			protectedReason = 'Canonical Wine Enology, Brewery & HACCP vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantEnologyExport
				? 'enology-export-redundant'
				: (member.isProtectedRegulatoryHaccp
					? 'wine-haccp-regulatory-protected'
					: 'cellar-ferm-scratch')
			action = config.strategy === 'hardlink-immutable-enology-masters' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'cellar-ferm-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active cellar telemetry, fermentation, or lab assay grace window`
		} else if (member.isRedundantEnologyExport) {
			governanceTier = 'enology-export-redundant'
			if (config.requireEnologyMasterAnchorForPrune && !hasEnologyMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Cellar, Brewhouse, or FTIR/HPLC master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'cellar-ferm-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Cellar SCADA, fermentation telemetry, or FTIR/HPLC scratch eligible for cleanup'
		} else if (member.isProtectedEnologyMaster || member.isProtectedRegulatoryHaccp) {
			governanceTier = member.isProtectedRegulatoryHaccp ? 'wine-haccp-regulatory-protected' : 'enology-fermentation-master-protected'
			action = config.strategy === 'hardlink-immutable-enology-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-enology-masters' && !member.isMutableFile) {
			governanceTier = 'enology-fermentation-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'cellar-ferm-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantEnologyExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantEnologyExport = members.some(m => m.isRedundantEnologyExportMember || m.isRedundantEnologyExport)
	const hasProtectedRecallHold = members.some(m => m.governanceTier === 'recall-quarantine-hold-protected' && m.shielded)
	const hasProtectedRegulatoryHaccp = members.some(m => m.governanceTier === 'wine-haccp-regulatory-protected' && m.shielded)
	const hasProtectedEnologyMaster = members.some(m => m.governanceTier === 'enology-fermentation-master-protected' && m.shielded)
	const hasCellarLabScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantEnologyExportMember && !m.shielded)) {
			clusterVerdict = 'enology-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'cellar-ferm-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedRecallHold) {
		clusterVerdict = 'recall-quarantine-hold-protected'
	} else if (hasProtectedRegulatoryHaccp) {
		clusterVerdict = 'wine-haccp-regulatory-protected'
	} else if (hasProtectedEnologyMaster) {
		clusterVerdict = 'enology-fermentation-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantEnologyExport ? 95 : 85
	} else if (hasProtectedRecallHold) {
		priorityScore = 60
	} else if (hasProtectedRegulatoryHaccp) {
		priorityScore = 50
	}

	const wineTags = [...new Set(members.map(m => m.wineTag).filter(Boolean))]
	const familyMeta = WINE_ENOLOGY_HACCP_FAMILY_META[family] || WINE_ENOLOGY_HACCP_FAMILY_META['cellar-fermentation-lab-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		enologyToolchain: primaryToolchain,
		workflowStage: primaryStage,
		wineStem: primaryStem,
		wineAnchorKey: primaryAnchorKey,
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
		hasProtectedRegulatoryHaccp,
		hasProtectedEnologyMaster,
		hasProtectedRecallHold,
		hasRedundantEnologyExport,
		hasCellarLabScratch,
		hasEnologyMasterAnchor,
		wineTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Wine Enology, Brewery Fermentation & Food-Safety HACCP Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Wine Enology, Brewery & HACCP vault audit report.
 */
export function auditWineEnologyHaccpVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeWineEnologyHaccpConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isWineEnologyHaccpGroup)
	const correlationIndex = buildWineEnologyHaccpCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'wine-haccp-regulatory-holds': 0,
		'enology-fermentation-masters': 0,
		'redundant-enology-reports-exports': 0,
		'cellar-fermentation-lab-scratch': 0,
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
				cluster.enologyToolchain,
				cluster.workflowStage,
				cluster.wineStem,
				cluster.wineAnchorKey,
				cluster.familyLabel,
				...cluster.wineTags,
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
	let totalRegulatoryHaccpClusters = 0
	let totalEnologyMasterClusters = 0
	let totalRecallHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedRegulatoryHaccp) {
			totalRegulatoryHaccpClusters += 1
		}
		if (cluster.hasProtectedEnologyMaster) {
			totalEnologyMasterClusters += 1
		}
		if (cluster.hasProtectedRecallHold) {
			totalRecallHoldClusters += 1
		}
		if (cluster.hasRedundantEnologyExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasCellarLabScratch) {
			totalScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = WINE_ENOLOGY_HACCP_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: WINE_ENOLOGY_HACCP_FAMILY_META[id].label,
			shortLabel: WINE_ENOLOGY_HACCP_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: WINE_ENOLOGY_HACCP_VAULT_SCHEMA,
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
			totalRegulatoryHaccpClusters,
			totalEnologyMasterClusters,
			totalRecallHoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Wine Enology, Brewery & HACCP Vaults.
 * Strictly blocks deletion or hardlinking of shielded FSMA/FDA Recall Holds, HACCP/TTB/OIV
 * compliance baselines, and verified Cellar/Brewhouse/FTIR/HPLC masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditWineEnologyHaccpVault.
 * @return {string} POSIX bash script.
 */
export function buildWineEnologyHaccpRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Wine Enology, Brewery Fermentation & Food-Safety HACCP Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./wine-enology-haccp-vault-reclaim.sh only after verifying Cellar, Brewhouse, and Lab anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.wine-enology-haccp-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-cellar-scratch'
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
			} else if (strategy === 'quarantine-exports-and-cellar-scratch' && (target.isRedundantEnologyExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable enology exports or cellar/lab scratch under active HACCP, TTB, OIV & Master shields.\\n"')
	} else {
		lines.push(`printf "Completed Wine Enology, Brewery & HACCP Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditWineEnologyHaccpVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildWineEnologyHaccpCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'enology_toolchain',
		'workflow_stage',
		'wine_stem',
		'wine_anchor_key',
		'family',
		'cluster_verdict',
		'has_enology_master_anchor',
		'is_redundant_enology_export',
		'is_cellar_lab_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'wine_tag',
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
				cluster.enologyToolchain || '',
				cluster.workflowStage || '',
				cluster.wineStem,
				cluster.wineAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasEnologyMasterAnchor ? 'true' : 'false',
				member.isRedundantEnologyExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.wineTag || '',
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
 * @param {object} auditResult Result from auditWineEnologyHaccpVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildWineEnologyHaccpJsonManifest(auditResult) {
	const payload = {
		schema: WINE_ENOLOGY_HACCP_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || WINE_ENOLOGY_HACCP_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			enologyToolchain: cluster.enologyToolchain,
			workflowStage: cluster.workflowStage,
			wineStem: cluster.wineStem,
			wineAnchorKey: cluster.wineAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedRegulatoryHaccp: cluster.hasProtectedRegulatoryHaccp,
			hasProtectedEnologyMaster: cluster.hasProtectedEnologyMaster,
			hasProtectedRecallHold: cluster.hasProtectedRecallHold,
			hasRedundantEnologyExport: cluster.hasRedundantEnologyExport,
			hasCellarLabScratch: cluster.hasCellarLabScratch,
			hasEnologyMasterAnchor: cluster.hasEnologyMasterAnchor,
			wineTags: cluster.wineTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				wineTag: member.wineTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantEnologyExportMember: member.isRedundantEnologyExportMember,
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
 * cloud sync of Cellar SCADA, fermentation telemetry, and FTIR/HPLC lab scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildWineEnologyHaccpSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Wine Enology, Brewery Fermentation & HACCP Vaults',
		'cellar_scada_tmp/',
		'ferm_telemetry_cache/',
		'hplc_spool/',
		'ftir_buf/',
		'gcms_scratch/',
		'brewhouse_tmp/',
		'bottling_line_cache/',
		'vineyard_ndvi_tmp/',
		'haccp_staging/',
		'yeast_pitch_buf/',
		'barrel_iot_cache/',
		'oeno_viewer_tmp/',
		'tmp_wine_*',
		'tmp_ferm_*',
		'tmp_brew_*',
		'tmp_haccp_*',
		'tmp_ftir_*',
		'tmp_hplc_*',
		'tmp_cellar_*',
		'tmp_brix_*',
		'cache_cellar_*',
		'spool_lab_*',
		'*.ferm.tmp',
		'*.brix.tmp',
		'*.plato.bak',
		'*.ftir.idx',
		'*.hplc.tmp',
		'*.gcms.part',
		'*.cellar.lck',
		'*.barrel.tmp',
		'*.haccp.tmp',
		'*.oeno.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
