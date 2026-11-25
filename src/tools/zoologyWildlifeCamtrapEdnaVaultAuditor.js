/**
 * Pure Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Zoology & Wildlife Biodiversity Vault families:
 * - CITES Permits, IACUC Ethics & Quarantine Holds (.cites, .iucn, .iacuc, .wildlife_hold, .poaching_hold, .necropsy, .voucher, .gbif_hold, .dwc_hold, .banding, .rehab_hold, plus XML/JSON/YAML/SQLite/CSV/PDF in CITES/permit/voucher/quarantine-hold baseline context)
 * - Camera-Trap, GPS Collar & eDNA Masters (.camtrap, .camtrapdp, .wildbook, .ctdp, .lotek, .vectronic, .telonics, .movebank, .argos, .edna, .bold, .otu, .asv, .biom, .fast5, .pod5, plus .fastq/.fq/.fastq.gz/.fq.gz/.fasta/.fa/.bam/.cram/.vcf/.parquet/.h5/.hdf5/.gpx/.kml/.bin/.dat/.raw/.dng/.cr3/.nef/.arw in wildlife/camtrap/collar/eDNA context)
 * - Derived Crops, Heatmaps & Krona/GBIF Exports (.mp4, .webm, .mov, .avi, .gif, .png, .jpg, .jpeg, .webp, .pdf, .csv, .tsv, .json, .jsonl, .html, .geojson in wildlife/camtrap/GPS/eDNA export context)
 * - MegaDetector, QIIME2 & Collar Spool Scratch (megadetector_cache/, camtrap_ingest_tmp/, wildbook_spool/, collar_argos_buf/, movebank_sync_tmp/, edna_demux_scratch/, qiime2_artifact_tmp/, dada2_denoise_cache/, vsearch_otu_tmp/, gbif_dwc_spool/, ctdp_thumb_cache/, wildlife_ml_tmp/, .camtrap.tmp, .megadetector.idx, .wildbook.part, .movebank.bak, .collar.tmp, .edna.idx, .qiime2.tmp, .vsearch.lck, .blast.tmp, .ctdp.part, .lck)
 *
 * Enforces strict CITES / Poaching / IACUC Hold, Voucher Baseline & Master Telemetry defaults:
 * - Strictly conserves CITES seizure, anti-poaching forensic, IACUC ethics, and wildlife quarantine holds
 * - Strictly conserves canonical CITES export/import permits, Darwin Core (DwC) museum vouchers, and USGS/EURING banding baselines
 * - Strictly conserves verified camera-trap burst masters, Lotek/Vectronic/Argos GPS collar logs, and eDNA metabarcoding/Nanopore masters
 * - Detects redundant MegaDetector annotated crops, camera-trap JPEG thumbnails, GPS kernel density heatmaps, and eDNA Krona HTML reports when a verified Wildlife master anchor exists
 * - Blocks pruning of derived wildlife crops, heatmaps, or Krona reports lacking a verified master anchor when guard is active
 * - Blocks hardlinks on mutable JSON/XML/CSV/GPX/KML/HTML/JPEG/MP4/PDF files and pipeline/ingest scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_VAULT_SCHEMA = 'duplicatefinder.zoology-wildlife-camtrap-edna-vault-auditor.v1'

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILIES = Object.freeze([
	'all',
	'wildlife-cites-permits-quarantine-holds',
	'wildlife-camtrap-gps-edna-masters',
	'redundant-wildlife-export-previews',
	'wildlife-pipeline-ingest-scratch',
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILY_META = Object.freeze({
	'wildlife-cites-permits-quarantine-holds': {
		id: 'wildlife-cites-permits-quarantine-holds',
		label: 'CITES Permits & Holds',
		shortLabel: 'CITES Permits, Darwin Core Vouchers, IACUC Ethics & Quarantine/Poaching Holds (.cites, .iucn, .iacuc, .voucher, .wildlife_hold, .poaching_hold)',
	},
	'wildlife-camtrap-gps-edna-masters': {
		id: 'wildlife-camtrap-gps-edna-masters',
		label: 'Cam-Trap, Collar & eDNA',
		shortLabel: 'Verified Masters (.camtrap, .camtrapdp, .wildbook, .lotek, .vectronic, .movebank, .argos, .edna, .biom, .fast5, .pod5)',
	},
	'redundant-wildlife-export-previews': {
		id: 'redundant-wildlife-export-previews',
		label: 'Derived Crops & Heatmaps',
		shortLabel: 'Derived MegaDetector BBox Crops, Cam-Trap Thumbnails, Collar Heatmaps & eDNA Krona HTML (.jpg, .mp4, .pdf, .html, .geojson)',
	},
	'wildlife-pipeline-ingest-scratch': {
		id: 'wildlife-pipeline-ingest-scratch',
		label: 'Detector & QIIME2 Scratch',
		shortLabel: 'Cache & Spool (megadetector_cache/, camtrap_ingest_tmp/, collar_argos_buf/, qiime2_artifact_tmp/, .camtrap.tmp, .edna.idx)',
	},
})

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_STRATEGIES = Object.freeze([
	'prune-exports-and-wildlife-scratch',
	'hardlink-immutable-wildlife-masters',
	'quarantine-exports-and-wildlife-scratch',
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_SURVIVOR_RULES = Object.freeze([
	'wildlife-cites-master-first',
	'oldest-survey-season-first',
	'newest-edna-run-first',
	'shortest-path',
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'wildlife-cites-voucher-protected',
	'wildlife-master-protected',
	'wildlife-hold-protected',
	'wildlife-export-redundant',
	'wildlife-pipeline-scratch',
	'shielded',
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_PRESETS = Object.freeze([
	{
		id: 'all-zoology-wildlife-audit',
		name: 'All Wildlife, Collar & eDNA',
		description: 'Audit CITES permits, IACUC/quarantine holds, camera-trap, GPS collar & eDNA masters, derived crops/heatmaps, and detector/QIIME2 scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-wildlife-scratch',
		survivorRule: 'wildlife-cites-master-first',
		protectCitesPermitsAndVoucherBaselines: true,
		protectWildlifeCamtrapGpsEdnaMasters: true,
		protectCitesEthicsAndQuarantineHolds: true,
		requireWildlifeMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'wildlife-pipeline-scratch-cleanup',
		name: 'Detector & eDNA Scratch',
		description: 'Reclaim megadetector_cache/, camtrap_ingest_tmp/, collar_argos_buf/, qiime2_artifact_tmp/, and .camtrap.tmp/.edna.idx scratch older than the field survey window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-wildlife-scratch',
		survivorRule: 'wildlife-cites-master-first',
		protectCitesPermitsAndVoucherBaselines: true,
		protectWildlifeCamtrapGpsEdnaMasters: true,
		protectCitesEthicsAndQuarantineHolds: true,
		requireWildlifeMasterAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-wildlife-exports-vs-masters',
		name: 'Derived Crops vs Masters',
		description: 'Detect derived MegaDetector bbox crops, thumbnail JPEGs, GPS collar heatmaps, and Krona HTML reports backed by a verified Wildlife master anchor.',
		familyFilter: 'redundant-wildlife-export-previews',
		strategy: 'quarantine-exports-and-wildlife-scratch',
		survivorRule: 'wildlife-cites-master-first',
		protectCitesPermitsAndVoucherBaselines: true,
		protectWildlifeCamtrapGpsEdnaMasters: true,
		protectCitesEthicsAndQuarantineHolds: true,
		requireWildlifeMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'wildlife-cites-holds-shield',
		name: 'CITES Permits & Holds Shield',
		description: 'Inspect CITES permits, Darwin Core vouchers, IACUC approvals, and anti-poaching/quarantine holds under strict preservation shield.',
		familyFilter: 'wildlife-cites-permits-quarantine-holds',
		strategy: 'hardlink-immutable-wildlife-masters',
		survivorRule: 'wildlife-cites-master-first',
		protectCitesPermitsAndVoucherBaselines: true,
		protectWildlifeCamtrapGpsEdnaMasters: true,
		protectCitesEthicsAndQuarantineHolds: true,
		requireWildlifeMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'wildlife-camtrap-edna-masters',
		name: 'Cam-Trap / GPS / eDNA Masters',
		description: 'Audit verified camera-trap burst masters, Lotek/Vectronic/Movebank GPS collar streams, and biodiversity eDNA/BIOM/Nanopore masters.',
		familyFilter: 'wildlife-camtrap-gps-edna-masters',
		strategy: 'hardlink-immutable-wildlife-masters',
		survivorRule: 'wildlife-cites-master-first',
		protectCitesPermitsAndVoucherBaselines: true,
		protectWildlifeCamtrapGpsEdnaMasters: true,
		protectCitesEthicsAndQuarantineHolds: true,
		requireWildlifeMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-zoology-wildlife-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-wildlife-scratch',
	survivorRule: 'wildlife-cites-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectCitesPermitsAndVoucherBaselines: true,
	protectWildlifeCamtrapGpsEdnaMasters: true,
	protectCitesEthicsAndQuarantineHolds: true,
	requireWildlifeMasterAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_WILDLIFE_CITES_HOLD_EXT_RE = /\.(?:cites|iucn|iacuc|wildlife_hold|poaching_hold|necropsy|voucher|gbif_hold|dwc_hold|banding|rehab_hold)$/i
const CONTEXT_WILDLIFE_CITES_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_WILDLIFE_MASTER_EXT_RE = /\.(?:camtrap|camtrapdp|wildbook|ctdp|lotek|vectronic|telonics|movebank|argos|edna|bold|otu|asv|biom|fast5|pod5)$/i
const CONTEXT_WILDLIFE_MASTER_EXT_RE = /\.(?:fastq|fq|fastq\.gz|fq\.gz|fasta|fa|bam|cram|vcf|parquet|h5|hdf5|gpx|kml|bin|dat|raw|dng|cr3|nef|arw)$/i
const CONTEXT_WILDLIFE_EXPORT_EXT_RE = /\.(?:mp4|webm|mov|avi|gif|png|jpg|jpeg|webp|pdf|csv|tsv|json|jsonl|html|geojson)$/i
const STRICT_WILDLIFE_SCRATCH_EXT_RE = /\.(?:camtrap\.tmp|megadetector\.idx|wildbook\.part|movebank\.bak|collar\.tmp|edna\.idx|qiime2\.tmp|vsearch\.lck|blast\.tmp|ctdp\.part|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_WILDLIFE_EXCLUSION_RE = /(?:yacht_?vault|yacht_?racing|foiling|ac75|nmea|n2k|canboat|vdr_?vault|svdr|xr_?vault|openxr|nerfstudio|3dgs|gsplat|colmap|volcap|winery_?vault|enology|haccp|veterinary|vet_?pacs|vetdcm|equine|livestock|epanet|swmm|watergems|v2x|ntcip|etcs|cbtc|railml|quantum|qubit|qasm|geant4|cmssw|orbital|ccsds|human_?bids|dicom|nifti|gdsii|oasis|aerospace_?cfd|nasa_?cfl3d|speech_?asr|whisper|kaldi|hydrograph|bathymetr|multibeam|kongsberg|kmall)/i
const WILDLIFE_CONTEXT_HINT_RE = /(?:zoology_?vault|wildlife_?vault|camtrap|camera_?trap|camtrapdp|wildbook|megadetector|trap_?grid|transect|lotek|vectronic|telonics|movebank|argos_?ptt|gps_?collar|biologg|home_?range|kud_?polygon|edna|metabarcod|qiime2|dada2|vsearch|bold_?coi|gbif|darwin_?core|cites|iucn|iacuc|biodivers|taxon|species_?survey|fauna_?vault|rehab_?hold|banding_?station)/i
const WILDLIFE_HOLD_PATH_RE = /(?:cites_?hold|poaching_?hold|iacuc_?hold|quarantine_?hold|wildlife_?hold|mortality_?hold|necropsy_?hold|forensic_?hold|endangered_?hold|seizure_?hold|ethics_?hold|regulatory_?hold)/i
const WILDLIFE_BASELINE_PATH_RE = /(?:00_cites|00_iacuc|00_voucher|00_dwc|00_permits|00_taxonomy|cites_?permits|darwin_?core|museum_?vouchers|banding_?baselines|ethics_?approvals|protected_?species_?baselines)/i
const WILDLIFE_SCRATCH_PATH_RE = /(?:megadetector_cache|camtrap_ingest_tmp|wildbook_spool|collar_argos_buf|movebank_sync_tmp|edna_demux_scratch|qiime2_artifact_tmp|dada2_denoise_cache|vsearch_otu_tmp|gbif_dwc_spool|ctdp_thumb_cache|wildlife_ml_tmp)/i
const WILDLIFE_INTERMEDIATE_PREFIX_RE = /^(?:tmp_camtrap_|tmp_collar_|tmp_edna_|tmp_qiime2_|tmp_megadetector_|tmp_movebank_|tmp_wildbook_|cache_wildlife_|spool_biodiv_)/i
const WILDLIFE_INTERMEDIATE_SUFFIX_RE = /(?:_camtrap_tmp|_collar_cache|_edna_spool|_qiime2_buf|_megadetector_tmp|_movebank_cache|_ctdp_tmp)$/i
const WILDLIFE_EXPORT_PATH_RE = /(?:camtrap_thumbs|annotated_crops|megadetector_renders|species_previews|collar_heatmaps|kud_polygons|edna_krona_html|diversity_reports|survey_exports|_thumb|_annotated|_bbox_preview|_heatmap|_krona|_summary_csv)/i
const CANONICAL_WILDLIFE_VAULT_PATH_RE = /(?:00_raw|00_camtrap|00_gps|00_collar|00_edna|00_masters|canonical|wildlife_archive|biodiversity_archive|camtrap_archive|zoology_archive)/i

/**
 * Normalize configuration values for Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeZoologyWildlifeCamtrapEdnaConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.familyFilter
	const verdictFilter = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.verdictFilter
	const strategy = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.strategy
	const survivorRule = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.survivorRule
	const sortMode = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectCitesPermitsAndVoucherBaselines: cfg.protectCitesPermitsAndVoucherBaselines !== undefined ? Boolean(cfg.protectCitesPermitsAndVoucherBaselines) : true,
		protectWildlifeCamtrapGpsEdnaMasters: cfg.protectWildlifeCamtrapGpsEdnaMasters !== undefined ? Boolean(cfg.protectWildlifeCamtrapGpsEdnaMasters) : true,
		protectCitesEthicsAndQuarantineHolds: cfg.protectCitesEthicsAndQuarantineHolds !== undefined ? Boolean(cfg.protectCitesEthicsAndQuarantineHolds) : true,
		requireWildlifeMasterAnchorForPrune: cfg.requireWildlifeMasterAnchorForPrune !== undefined ? Boolean(cfg.requireWildlifeMasterAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized survey transect, camera-trap station, collar ID, or eDNA sample stem.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized wildlife/biodiversity stem.
 */
export function extractZoologyWildlifeCamtrapEdnaStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:camtrap\.tmp|megadetector\.idx|wildbook\.part|movebank\.bak|collar\.tmp|edna\.idx|qiime2\.tmp|vsearch\.lck|blast\.tmp|ctdp\.part|fastq\.gz|fq\.gz)$/i, '')
	stem = stem.replace(/\.[a-z0-9_]{1,14}$/i, '')
	stem = stem.replace(WILDLIFE_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(WILDLIFE_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:thumb|annotated|bbox_preview|heatmap|krona|summary_csv|summary|export|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'wildlife-survey'
}

/**
 * Extract canonical anchor key linking derived crops/heatmaps/Krona exports to verified Camera-Trap, GPS Collar, eDNA, or CITES anchors.
 *
 * @param {string} wildlifeStem Extracted wildlife stem.
 * @return {string} Canonical anchor key.
 */
export function extractZoologyWildlifeCamtrapEdnaAnchorKey(wildlifeStem) {
	return String(wildlifeStem || 'wildlife-survey')
		.toLowerCase()
		.replace(/(?:[-_](?:cites|iucn|iacuc|voucher|camtrap|camtrapdp|wildbook|ctdp|lotek|vectronic|telonics|movebank|argos|edna|bold|otu|asv|biom|fast5|pod5|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'wildlife-survey'
}

/**
 * Detect Zoology, Wildlife Camera-Trap, GPS Collar & eDNA toolchain and workflow stage.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ wildlifeToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractWildlifeToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let wildlifeToolchain = ''
	if (/\.(?:camtrap|camtrapdp|wildbook|ctdp)\b|camtrap|camera_?trap|wildbook|megadetector/.test(text)) {
		wildlifeToolchain = 'CamtrapDP / Wildbook / MegaDetector'
	} else if (/\.(?:lotek|vectronic|telonics|movebank|argos)\b|lotek|vectronic|telonics|movebank|argos_?ptt|gps_?collar/.test(text)) {
		wildlifeToolchain = 'Movebank / Lotek / Vectronic GPS Telemetry'
	} else if (/\.(?:edna|bold|otu|asv|biom|fast5|pod5)\b|edna|qiime2|dada2|vsearch|bold_?coi|metabarcod/.test(text)) {
		wildlifeToolchain = 'QIIME2 / DADA2 / BOLD eDNA Metabarcoding'
	} else if (/\.(?:cites|iucn|iacuc|voucher|banding|gbif_hold|dwc_hold)\b|cites|darwin_?core|gbif|museum_?voucher|banding/.test(text)) {
		wildlifeToolchain = 'CITES / Darwin Core / GBIF Registry'
	} else if (WILDLIFE_HOLD_PATH_RE.test(text)) {
		wildlifeToolchain = 'Wildlife Forensics, IACUC & Quarantine Hold'
	}

	let workflowStage = ''
	if (WILDLIFE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'CITES Seizure, IACUC Ethics or Quarantine Hold'
	} else if (STRICT_WILDLIFE_CITES_HOLD_EXT_RE.test(basename) || WILDLIFE_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'CITES Permit, Darwin Core Voucher or Banding Baseline'
	} else if (WILDLIFE_SCRATCH_PATH_RE.test(text) || STRICT_WILDLIFE_SCRATCH_EXT_RE.test(basename) || WILDLIFE_INTERMEDIATE_PREFIX_RE.test(basename) || WILDLIFE_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'MegaDetector, QIIME2 or Collar Spool Scratch'
	} else if (WILDLIFE_EXPORT_PATH_RE.test(text) || (CONTEXT_WILDLIFE_EXPORT_EXT_RE.test(basename) && WILDLIFE_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived BBox Crop, Collar Heatmap or Krona Export'
	} else if (STRICT_WILDLIFE_MASTER_EXT_RE.test(basename) || (CONTEXT_WILDLIFE_MASTER_EXT_RE.test(basename) && (WILDLIFE_CONTEXT_HINT_RE.test(text) || CANONICAL_WILDLIFE_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified Camera-Trap, GPS Collar or eDNA Master'
	}

	return { wildlifeToolchain, workflowStage }
}

/**
 * Extract concise Zoology, Wildlife Camera-Trap, GPS Collar & eDNA domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractWildlifeDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (WILDLIFE_HOLD_PATH_RE.test(text)) {
		return 'CITES / QUARANTINE HOLD'
	}
	if (/\.(?:cites|iucn|iacuc|wildlife_hold|poaching_hold|necropsy|voucher|gbif_hold|dwc_hold|banding|rehab_hold)\b/.test(lowerBase)) {
		return 'CITES / VOUCHER'
	}
	if (/\.(?:camtrap|camtrapdp|wildbook|ctdp)\b/.test(lowerBase)) {
		return 'CAMTRAP MASTER'
	}
	if (/\.(?:lotek|vectronic|telonics|movebank|argos)\b/.test(lowerBase)) {
		return 'GPS COLLAR MASTER'
	}
	if (/\.(?:edna|bold|otu|asv|biom|fast5|pod5)\b/.test(lowerBase)) {
		return 'eDNA / BIOM MASTER'
	}
	if (STRICT_WILDLIFE_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'PIPELINE SCRATCH'
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
 * Classify a single file within the Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyZoologyWildlifeCamtrapEdnaFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_WILDLIFE_EXCLUSION_RE.test(lower)
	const hasWildlifeContext = !hasExcludedContext && WILDLIFE_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && WILDLIFE_BASELINE_PATH_RE.test(lower)
	const isHoldPath = !hasExcludedContext && WILDLIFE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_WILDLIFE_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && WILDLIFE_SCRATCH_PATH_RE.test(lower)
	const isWildlifeExportPath = !hasExcludedContext && WILDLIFE_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_WILDLIFE_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (WILDLIFE_INTERMEDIATE_PREFIX_RE.test(lowerBase) || WILDLIFE_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictCitesOrHold = !hasExcludedContext && STRICT_WILDLIFE_CITES_HOLD_EXT_RE.test(lowerBase)
	const isCitesOrVoucher = !hasExcludedContext && (
		isStrictCitesOrHold
		|| (CONTEXT_WILDLIFE_CITES_EXT_RE.test(lowerBase) && !isWildlifeExportPath && (isBaselinePath || isHoldPath))
	)

	const isContextWildlifeMaster = CONTEXT_WILDLIFE_MASTER_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasWildlifeContext || isCanonicalVaultPath)
	const isStrictWildlifeMaster = !hasExcludedContext && (
		STRICT_WILDLIFE_MASTER_EXT_RE.test(lowerBase)
		|| isContextWildlifeMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictWildlifeMaster
		&& !isCitesOrVoucher
		&& CONTEXT_WILDLIFE_EXPORT_EXT_RE.test(lowerBase)
		&& (hasWildlifeContext || isWildlifeExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Zoology, Wildlife & eDNA Vault'
	let isProtectedCitesOrVoucher = false
	let isProtectedWildlifeMaster = false
	let isProtectedWildlifeHold = false
	let isWildlifeMasterAnchor = false
	let isRedundantWildlifeExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictWildlifeMaster || isCitesOrVoucher))
		|| (isIntermediateSubfile && (isStrictWildlifeMaster || isContextExport || hasWildlifeContext))
		|| (isGenericScratchExt && hasWildlifeContext && !isBaselinePath && !isHoldPath)
	) {
		family = 'wildlife-pipeline-ingest-scratch'
		artifactKind = isStrictScratchExt
			? 'MegaDetector / QIIME2 / Collar Spool Scratch'
			: (isIntermediateSubfile ? 'eDNA Demux / Camera-Trap Cache' : 'Wildlife Ingest & Detector Scratch')
		vaultRole = 'MegaDetector Cache, QIIME2 Artifact Tmp, or Collar Telemetry Spool Scratch'
		isMutableFile = true
	} else if (isHoldPath && (isCitesOrVoucher || isStrictWildlifeMaster || isContextExport || hasWildlifeContext)) {
		family = 'wildlife-cites-permits-quarantine-holds'
		artifactKind = 'CITES Seizure / IACUC Ethics / Quarantine Hold'
		vaultRole = 'Protected CITES Forensic, Anti-Poaching, IACUC, or Wildlife Quarantine Hold'
		isProtectedWildlifeHold = true
		isProtectedCitesOrVoucher = true
		isWildlifeMasterAnchor = isStrictWildlifeMaster || isCitesOrVoucher
		isMutableFile = true
	} else if (isCitesOrVoucher) {
		family = 'wildlife-cites-permits-quarantine-holds'
		if (/\.(?:wildlife_hold|poaching_hold|gbif_hold|dwc_hold|rehab_hold|necropsy)$/i.test(lowerBase)) {
			artifactKind = 'Wildlife Forensics / Quarantine Hold Record'
			vaultRole = 'Protected Anti-Poaching, Necropsy, or Quarantine Hold Evidence'
			isProtectedWildlifeHold = true
		} else {
			artifactKind = 'CITES Permit / Darwin Core Voucher Baseline'
			vaultRole = 'Canonical CITES Permit, Museum Voucher, or IUCN/Banding Baseline'
		}
		isProtectedCitesOrVoucher = true
		isWildlifeMasterAnchor = true
		isMutableFile = true
	} else if (isStrictWildlifeMaster) {
		family = 'wildlife-camtrap-gps-edna-masters'
		if (/\.(?:camtrap|camtrapdp|wildbook|ctdp|raw|dng|cr3|nef|arw)$/i.test(lowerBase)) {
			artifactKind = 'Camera-Trap Burst / Wildbook Master'
			vaultRole = 'Canonical Camera-Trap Station Burst or CamtrapDP Master'
			isMutableFile = /\.(?:camtrapdp|ctdp)$/i.test(lowerBase)
		} else if (/\.(?:lotek|vectronic|telonics|movebank|argos|gpx|kml|bin|dat)$/i.test(lowerBase)) {
			artifactKind = 'GPS Collar / Movebank Argos Master'
			vaultRole = 'Canonical Wildlife Biologging Collar & Argos Telemetry Master'
			isMutableFile = /\.(?:movebank|gpx|kml)$/i.test(lowerBase)
		} else {
			artifactKind = 'Biodiversity eDNA / BIOM / Nanopore Master'
			vaultRole = 'Canonical eDNA Metabarcoding, ASV/BIOM, or FAST5/POD5 Master'
			isMutableFile = /\.(?:biom|otu|asv|fasta|fa|vcf)$/i.test(lowerBase)
		}
		isProtectedWildlifeMaster = true
		isWildlifeMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-wildlife-export-previews'
		if (/\.(?:mp4|webm|mov|avi|gif)$/i.test(lowerBase)) {
			artifactKind = 'Derived Camera-Trap Burst Clip / Preview'
		} else if (/\.(?:geojson|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Derived Collar KUD Heatmap or Survey Report PDF'
		} else if (/\.(?:html)$/i.test(lowerBase)) {
			artifactKind = 'Derived eDNA Krona / Taxonomic Diversity HTML'
		} else if (/\.(?:png|jpg|jpeg|webp)$/i.test(lowerBase)) {
			artifactKind = 'Derived MegaDetector BBox Crop / Thumbnail'
		} else {
			artifactKind = 'Derived GBIF / Species Occurrence Summary CSV'
		}
		vaultRole = 'Derived Camera-Trap Crop, GPS Heatmap, or eDNA Krona Report'
		isRedundantWildlifeExport = true
		isMutableFile = true
	}

	const { wildlifeToolchain, workflowStage } = extractWildlifeToolchainAndStage(normalized, basename)
	const wildlifeStem = extractZoologyWildlifeCamtrapEdnaStem(basename, normalized)
	const wildlifeAnchorKey = extractZoologyWildlifeCamtrapEdnaAnchorKey(wildlifeStem)
	const wildlifeTag = extractWildlifeDomainTag(lowerBase, lower)

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
		wildlifeToolchain,
		workflowStage,
		wildlifeStem,
		wildlifeAnchorKey,
		wildlifeTag,
		isProtectedCitesOrVoucher,
		isProtectedWildlifeMaster,
		isProtectedWildlifeHold,
		isWildlifeMasterAnchor,
		isRedundantWildlifeExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'wildlife-pipeline-ingest-scratch') || (isGenericScratchExt && hasWildlifeContext && family === 'wildlife-pipeline-ingest-scratch'),
		isBaselinePath,
		isHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isZoologyWildlifeCamtrapEdnaGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyZoologyWildlifeCamtrapEdnaFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Camera-Trap, GPS Collar, eDNA, and CITES anchors
 * to derived bbox crops, thumbnails, heatmaps, and Krona/GBIF reports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildZoologyWildlifeCamtrapEdnaCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyZoologyWildlifeCamtrapEdnaFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isWildlifeMasterAnchor) {
				anchorStems.add(meta.wildlifeStem)
				anchorKeys.add(meta.wildlifeAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Zoology, Wildlife & eDNA cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'wildlife-cites-permits-quarantine-holds')) {
		return 'wildlife-cites-permits-quarantine-holds'
	}
	if (members.some(m => m.family === 'wildlife-camtrap-gps-edna-masters')) {
		return 'wildlife-camtrap-gps-edna-masters'
	}
	if (members.some(m => m.family === 'redundant-wildlife-export-previews')) {
		return 'redundant-wildlife-export-previews'
	}
	return 'wildlife-pipeline-ingest-scratch'
}

/**
 * Compute deterministic survivor priority score for a Zoology, Wildlife & eDNA vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-survey-season-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedWildlifeHold ? 100000 : 0)
			+ (member.isProtectedCitesOrVoucher ? 97000 : 0)
			+ (member.isProtectedWildlifeMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantWildlifeExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-edna-run-first') {
		return (member.isProtectedWildlifeHold ? 100000 : 0)
			+ (member.isProtectedCitesOrVoucher ? 97000 : 0)
			+ (member.isProtectedWildlifeMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantWildlifeExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedWildlifeHold ? 52000 : 0)
			+ (member.isProtectedCitesOrVoucher ? 50000 : 0)
			+ (member.isProtectedWildlifeMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedWildlifeHold ? 100000 : 0)
		+ (member.isProtectedCitesOrVoucher ? 97000 : 0)
		+ (member.isProtectedWildlifeMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantWildlifeExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA duplicate cluster.
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
		const meta = classifyZoologyWildlifeCamtrapEdnaFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.wildlifeToolchain)?.wildlifeToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].wildlifeStem || extractZoologyWildlifeCamtrapEdnaStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].wildlifeAnchorKey || extractZoologyWildlifeCamtrapEdnaAnchorKey(primaryStem)

	const hasWildlifeMasterAnchor = Boolean(
		rawMembers.some(m => m.isWildlifeMasterAnchor)
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

		const isRedundantWildlifeExportMember = member.isRedundantWildlifeExport && hasWildlifeMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantWildlifeExport) {
			redundancyReason = isRedundantWildlifeExportMember
				? 'Derived MegaDetector crop, collar heatmap, or eDNA Krona export duplicates verified Wildlife master'
				: 'Derived wildlife preview or export without verified Camera-Trap, GPS Collar, eDNA, or CITES anchor'
		}

		let governanceTier = 'wildlife-pipeline-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedWildlifeHold
				? 'wildlife-hold-protected'
				: (member.isProtectedCitesOrVoucher
					? 'wildlife-cites-voucher-protected'
					: (member.isProtectedWildlifeMaster
						? 'wildlife-master-protected'
						: (member.isRedundantWildlifeExport
							? 'wildlife-export-redundant'
							: 'wildlife-pipeline-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedWildlifeHold && config.protectCitesEthicsAndQuarantineHolds) {
			governanceTier = 'wildlife-hold-protected'
			shielded = true
			protectedReason = 'CITES seizure, anti-poaching forensic, IACUC ethics, or quarantine hold strictly conserved'
		} else if (member.isProtectedCitesOrVoucher && config.protectCitesPermitsAndVoucherBaselines) {
			governanceTier = 'wildlife-cites-voucher-protected'
			shielded = true
			protectedReason = 'CITES permit, Darwin Core museum voucher, or banding baseline strictly conserved'
		} else if (member.isProtectedWildlifeMaster && config.protectWildlifeCamtrapGpsEdnaMasters) {
			governanceTier = 'wildlife-master-protected'
			shielded = true
			protectedReason = 'Verified Camera-Trap, GPS Collar, or eDNA master strictly conserved'
		} else if (isSurvivor && !isRedundantWildlifeExportMember) {
			governanceTier = member.isProtectedWildlifeHold
				? 'wildlife-hold-protected'
				: (member.isProtectedCitesOrVoucher
					? 'wildlife-cites-voucher-protected'
					: (member.isProtectedWildlifeMaster
						? 'wildlife-master-protected'
						: (member.isRedundantWildlifeExport
							? 'wildlife-export-redundant'
							: 'wildlife-pipeline-scratch')))
			shielded = true
			protectedReason = 'Canonical Zoology, Wildlife & eDNA vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantWildlifeExport
				? 'wildlife-export-redundant'
				: (member.isProtectedCitesOrVoucher
					? 'wildlife-cites-voucher-protected'
					: 'wildlife-pipeline-scratch')
			action = config.strategy === 'hardlink-immutable-wildlife-masters' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'wildlife-pipeline-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active field survey, MegaDetector, or QIIME2 spool grace window`
		} else if (member.isRedundantWildlifeExport) {
			governanceTier = 'wildlife-export-redundant'
			if (config.requireWildlifeMasterAnchorForPrune && !hasWildlifeMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Camera-Trap, GPS Collar, eDNA, or CITES anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'wildlife-pipeline-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'MegaDetector cache, QIIME2 temp, or collar spool scratch eligible for cleanup'
		} else if (member.isProtectedWildlifeMaster || member.isProtectedCitesOrVoucher) {
			governanceTier = member.isProtectedCitesOrVoucher ? 'wildlife-cites-voucher-protected' : 'wildlife-master-protected'
			action = config.strategy === 'hardlink-immutable-wildlife-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-wildlife-masters' && !member.isMutableFile) {
			governanceTier = 'wildlife-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'wildlife-pipeline-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantWildlifeExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantWildlifeExport = members.some(m => m.isRedundantWildlifeExportMember || m.isRedundantWildlifeExport)
	const hasProtectedWildlifeHold = members.some(m => m.governanceTier === 'wildlife-hold-protected' && m.shielded)
	const hasProtectedCitesOrVoucher = members.some(m => m.governanceTier === 'wildlife-cites-voucher-protected' && m.shielded)
	const hasProtectedWildlifeMaster = members.some(m => m.governanceTier === 'wildlife-master-protected' && m.shielded)
	const hasWildlifePipelineScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantWildlifeExportMember && !m.shielded)) {
			clusterVerdict = 'wildlife-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'wildlife-pipeline-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedWildlifeHold) {
		clusterVerdict = 'wildlife-hold-protected'
	} else if (hasProtectedCitesOrVoucher) {
		clusterVerdict = 'wildlife-cites-voucher-protected'
	} else if (hasProtectedWildlifeMaster) {
		clusterVerdict = 'wildlife-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantWildlifeExport ? 95 : 85
	} else if (hasProtectedWildlifeHold) {
		priorityScore = 60
	} else if (hasProtectedCitesOrVoucher) {
		priorityScore = 50
	}

	const wildlifeTags = [...new Set(members.map(m => m.wildlifeTag).filter(Boolean))]
	const familyMeta = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILY_META[family] || ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILY_META['wildlife-pipeline-ingest-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		wildlifeToolchain: primaryToolchain,
		workflowStage: primaryStage,
		wildlifeStem: primaryStem,
		wildlifeAnchorKey: primaryAnchorKey,
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
		hasProtectedCitesOrVoucher,
		hasProtectedWildlifeMaster,
		hasProtectedWildlifeHold,
		hasRedundantWildlifeExport,
		hasWildlifePipelineScratch,
		hasWildlifeMasterAnchor,
		wildlifeTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Zoology, Wildlife & eDNA vault audit report.
 */
export function auditZoologyWildlifeCamtrapEdnaVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeZoologyWildlifeCamtrapEdnaConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isZoologyWildlifeCamtrapEdnaGroup)
	const correlationIndex = buildZoologyWildlifeCamtrapEdnaCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'wildlife-cites-permits-quarantine-holds': 0,
		'wildlife-camtrap-gps-edna-masters': 0,
		'redundant-wildlife-export-previews': 0,
		'wildlife-pipeline-ingest-scratch': 0,
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
				cluster.wildlifeToolchain,
				cluster.workflowStage,
				cluster.wildlifeStem,
				cluster.wildlifeAnchorKey,
				cluster.familyLabel,
				...cluster.wildlifeTags,
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
	let totalCitesVoucherClusters = 0
	let totalWildlifeMasterClusters = 0
	let totalWildlifeHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedCitesOrVoucher) {
			totalCitesVoucherClusters += 1
		}
		if (cluster.hasProtectedWildlifeMaster) {
			totalWildlifeMasterClusters += 1
		}
		if (cluster.hasProtectedWildlifeHold) {
			totalWildlifeHoldClusters += 1
		}
		if (cluster.hasRedundantWildlifeExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasWildlifePipelineScratch) {
			totalScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILY_META[id].label,
			shortLabel: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_VAULT_SCHEMA,
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
			totalCitesVoucherClusters,
			totalWildlifeMasterClusters,
			totalWildlifeHoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Zoology, Wildlife Camera-Trap, GPS Collar & eDNA Vaults.
 * Strictly blocks deletion or hardlinking of shielded CITES/Quarantine Holds, Voucher Baselines,
 * and verified Camera-Trap/Collar/eDNA masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditZoologyWildlifeCamtrapEdnaVault.
 * @return {string} POSIX bash script.
 */
export function buildZoologyWildlifeCamtrapEdnaRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Zoology, Wildlife Camera-Trap, GPS Collar & Biodiversity eDNA Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./zoology-wildlife-camtrap-edna-vault-reclaim.sh only after verifying CITES, Camera-Trap, GPS, and eDNA anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.zoology-wildlife-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-wildlife-scratch'
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
			} else if (strategy === 'quarantine-exports-and-wildlife-scratch' && (target.isRedundantWildlifeExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable wildlife crops or pipeline scratch under active CITES, Hold & Master shields.\\n"')
	} else {
		lines.push(`printf "Completed Zoology, Wildlife & eDNA Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditZoologyWildlifeCamtrapEdnaVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildZoologyWildlifeCamtrapEdnaCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'wildlife_toolchain',
		'workflow_stage',
		'wildlife_stem',
		'wildlife_anchor_key',
		'family',
		'cluster_verdict',
		'has_wildlife_master_anchor',
		'is_redundant_wildlife_export',
		'is_wildlife_pipeline_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'wildlife_tag',
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
				cluster.wildlifeToolchain || '',
				cluster.workflowStage || '',
				cluster.wildlifeStem,
				cluster.wildlifeAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasWildlifeMasterAnchor ? 'true' : 'false',
				member.isRedundantWildlifeExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.wildlifeTag || '',
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
 * @param {object} auditResult Result from auditZoologyWildlifeCamtrapEdnaVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildZoologyWildlifeCamtrapEdnaJsonManifest(auditResult) {
	const payload = {
		schema: ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || ZOOLOGY_WILDLIFE_CAMTRAP_EDNA_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			wildlifeToolchain: cluster.wildlifeToolchain,
			workflowStage: cluster.workflowStage,
			wildlifeStem: cluster.wildlifeStem,
			wildlifeAnchorKey: cluster.wildlifeAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedCitesOrVoucher: cluster.hasProtectedCitesOrVoucher,
			hasProtectedWildlifeMaster: cluster.hasProtectedWildlifeMaster,
			hasProtectedWildlifeHold: cluster.hasProtectedWildlifeHold,
			hasRedundantWildlifeExport: cluster.hasRedundantWildlifeExport,
			hasWildlifePipelineScratch: cluster.hasWildlifePipelineScratch,
			hasWildlifeMasterAnchor: cluster.hasWildlifeMasterAnchor,
			wildlifeTags: cluster.wildlifeTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				wildlifeTag: member.wildlifeTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantWildlifeExportMember: member.isRedundantWildlifeExportMember,
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
 * cloud sync of MegaDetector caches, QIIME2 scratch, and collar telemetry spools.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildZoologyWildlifeCamtrapEdnaSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Zoology, Wildlife Camera-Trap, GPS Collar & eDNA Vaults',
		'megadetector_cache/',
		'camtrap_ingest_tmp/',
		'wildbook_spool/',
		'collar_argos_buf/',
		'movebank_sync_tmp/',
		'edna_demux_scratch/',
		'qiime2_artifact_tmp/',
		'dada2_denoise_cache/',
		'vsearch_otu_tmp/',
		'gbif_dwc_spool/',
		'ctdp_thumb_cache/',
		'wildlife_ml_tmp/',
		'tmp_camtrap_*',
		'tmp_collar_*',
		'tmp_edna_*',
		'tmp_qiime2_*',
		'tmp_megadetector_*',
		'tmp_movebank_*',
		'tmp_wildbook_*',
		'cache_wildlife_*',
		'spool_biodiv_*',
		'*.camtrap.tmp',
		'*.megadetector.idx',
		'*.wildbook.part',
		'*.movebank.bak',
		'*.collar.tmp',
		'*.edna.idx',
		'*.qiime2.tmp',
		'*.vsearch.lck',
		'*.blast.tmp',
		'*.ctdp.part',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
