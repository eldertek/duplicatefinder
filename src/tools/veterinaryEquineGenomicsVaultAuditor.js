/**
 * Pure Veterinary Imaging, Equine Biomechanics & Livestock Genomics Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Veterinary & Livestock Vault families:
 * - USDA APHIS / WOAH / FEI / ICAR Regulatory & Pedigree Baselines (.fei, .icar, .isag, .adg, .coggins, .eia, .hcvi, .woah, .pedx, .pedigree, .ebv, .gebv, .studbook, .microchip, plus XML/JSON/YAML/SQLite/CSV/PDF in quarantine/regulatory/pedigree baseline context)
 * - Veterinary PACS, Equine Gait & Livestock SNP Masters (.vetdcm, .vpacs, .usvet, .equine, .hoof, .stride, .lameness, .forceplate, .saddle, .vetimu, .snpchip, .bgen, .grm, .plink, .ped, .map, .fam, .bim, .tped, .tfam, plus .dcm/.c3d/.vcf.gz/.fastq.gz/.parquet/.h5/.hdf5/.bin/.dat in veterinary/equine/livestock context)
 * - Redundant Vet Radiology, Gait Report & Breeding Index Exports (.csv, .tsv, .txt, .xlsx, .xls, .json, .jsonl, .pdf, .png, .jpg, .jpeg, .webp, .svg, .mp4, .mov, .avi in veterinary/equine/livestock export context)
 * - Vet PACS Viewer, Gait & Genomic Imputation Scratch (vet_pacs_tmp/, equine_gait_cache/, hoof_pressure_tmp/, lameness_buf/, plink_scratch/, imputation_tmp/, ultrasound_spool/, vet_viewer_cache/, herd_genomics_tmp/, saddle_pressure_cache/, studbook_staging/, .vetdcm.tmp, .vpacs.bak, .c3d.lck, .plink.tmp, .bed.tmp, .bgen.idx, .grm.part, .hoof.tmp, .lck)
 *
 * Enforces strict USDA APHIS / WOAH / FEI / ICAR Compliance, Biosecurity Hold, and Vet/Equine/SNP Master defaults:
 * - Strictly conserves USDA APHIS, WOAH, FEI equine passport, Coggins EIA, and quarantine biosecurity holds
 * - Strictly conserves canonical ICAR/ISAG parentage, studbook pedigree, and genomic EBV/GEBV baselines
 * - Strictly conserves verified Veterinary PACS/Ultrasound, Equine Gait/Forceplate/IMU, and Livestock SNP/BGEN/PLINK masters
 * - Detects redundant radiology PDFs, gait videos/CSVs, and breeding index exports when a verified Vet PACS/Gait/SNP/Pedigree master anchor exists
 * - Blocks pruning of derived vet/gait/breeding exports lacking a verified veterinary master anchor when guard is active
 * - Blocks hardlinks on mutable CSV/JSON/PDF/XML/PED/MAP/video files and viewer/imputation scratch
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const VETERINARY_EQUINE_GENOMICS_VAULT_SCHEMA = 'duplicatefinder.veterinary-equine-genomics-vault-auditor.v1'

export const VETERINARY_EQUINE_GENOMICS_FAMILIES = Object.freeze([
	'all',
	'vet-regulatory-pedigree-holds',
	'vet-imaging-gait-genomics-masters',
	'redundant-vet-reports-exports',
	'vet-pacs-gait-genomics-scratch',
])

export const VETERINARY_EQUINE_GENOMICS_FAMILY_META = Object.freeze({
	'vet-regulatory-pedigree-holds': {
		id: 'vet-regulatory-pedigree-holds',
		label: 'USDA / FEI / ICAR & Pedigree',
		shortLabel: 'Biosecurity Holds, Coggins EIA & ICAR/ISAG Pedigree (.fei, .icar, .isag, .coggins, .hcvi, .ebv)',
	},
	'vet-imaging-gait-genomics-masters': {
		id: 'vet-imaging-gait-genomics-masters',
		label: 'Vet PACS, Gait & SNP Masters',
		shortLabel: 'Verified Masters (.vetdcm, .vpacs, .usvet, .hoof, .forceplate, .snpchip, .bgen, .grm, .plink)',
	},
	'redundant-vet-reports-exports': {
		id: 'redundant-vet-reports-exports',
		label: 'Derived Vet & Gait Exports',
		shortLabel: 'Derived Radiology PDFs, Gait Videos, Stride CSVs & EBV Sheets (.pdf, .mp4, .csv, .xlsx, .png)',
	},
	'vet-pacs-gait-genomics-scratch': {
		id: 'vet-pacs-gait-genomics-scratch',
		label: 'PACS & PLINK Scratch',
		shortLabel: 'Viewer & Imputation Scratch (vet_pacs_tmp/, equine_gait_cache/, plink_scratch/, imputation_tmp/, .vetdcm.tmp)',
	},
})

export const VETERINARY_EQUINE_GENOMICS_STRATEGIES = Object.freeze([
	'prune-exports-and-vet-scratch',
	'hardlink-immutable-vet-masters',
	'quarantine-exports-and-vet-scratch',
])

export const VETERINARY_EQUINE_GENOMICS_SURVIVOR_RULES = Object.freeze([
	'pedigree-vet-master-first',
	'oldest-clinical-capture-first',
	'newest-evaluation-run-first',
	'shortest-path',
])

export const VETERINARY_EQUINE_GENOMICS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'vet-regulatory-pedigree-protected',
	'vet-imaging-gait-master-protected',
	'quarantine-biosecurity-hold-protected',
	'vet-export-redundant',
	'vet-pacs-scratch',
	'shielded',
])

export const VETERINARY_EQUINE_GENOMICS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const VETERINARY_EQUINE_GENOMICS_PRESETS = Object.freeze([
	{
		id: 'all-veterinary-equine-genomics-audit',
		name: 'All Vet & Livestock Vaults',
		description: 'Audit USDA/FEI/ICAR holds and pedigree baselines, Vet PACS/Equine Gait/Livestock SNP masters, derived exports, and viewer/imputation scratch.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-vet-scratch',
		survivorRule: 'pedigree-vet-master-first',
		protectRegulatoryAndPedigreeHolds: true,
		protectVetMasters: true,
		protectQuarantineBiosecurityHolds: true,
		requireVetMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'vet-pacs-gait-scratch-cleanup',
		name: 'PACS & PLINK Scratch',
		description: 'Reclaim vet_pacs_tmp/, equine_gait_cache/, plink_scratch/, imputation_tmp/, and .vetdcm.tmp/.bgen.idx scratch older than the active window.',
		familyFilter: 'all',
		strategy: 'prune-exports-and-vet-scratch',
		survivorRule: 'pedigree-vet-master-first',
		protectRegulatoryAndPedigreeHolds: true,
		protectVetMasters: true,
		protectQuarantineBiosecurityHolds: true,
		requireVetMasterAnchorForPrune: true,
		keepRecentRunDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'redundant-vet-exports-vs-masters',
		name: 'Derived Reports vs Masters',
		description: 'Detect derived radiology PDFs, lameness videos, stride CSVs, and EBV breeding sheets backed by a verified Vet PACS, Gait, or SNP anchor.',
		familyFilter: 'redundant-vet-reports-exports',
		strategy: 'quarantine-exports-and-vet-scratch',
		survivorRule: 'pedigree-vet-master-first',
		protectRegulatoryAndPedigreeHolds: true,
		protectVetMasters: true,
		protectQuarantineBiosecurityHolds: true,
		requireVetMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'vet-regulatory-pedigree-shield',
		name: 'USDA / FEI / ICAR Shield',
		description: 'Inspect USDA APHIS quarantine holds, Coggins EIA certificates, FEI passports, and ICAR/ISAG pedigree baselines under strict shield.',
		familyFilter: 'vet-regulatory-pedigree-holds',
		strategy: 'hardlink-immutable-vet-masters',
		survivorRule: 'pedigree-vet-master-first',
		protectRegulatoryAndPedigreeHolds: true,
		protectVetMasters: true,
		protectQuarantineBiosecurityHolds: true,
		requireVetMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'vet-imaging-gait-genomics-masters',
		name: 'Vet PACS, Gait & SNP Masters',
		description: 'Audit verified Veterinary DICOM/Ultrasound series, Equine forceplate/IMU gait captures, and Livestock BGEN/GRM/PLINK genotype masters.',
		familyFilter: 'vet-imaging-gait-genomics-masters',
		strategy: 'hardlink-immutable-vet-masters',
		survivorRule: 'pedigree-vet-master-first',
		protectRegulatoryAndPedigreeHolds: true,
		protectVetMasters: true,
		protectQuarantineBiosecurityHolds: true,
		requireVetMasterAnchorForPrune: true,
		keepRecentRunDays: 0,
		minSizeKb: 0,
	},
])

export const VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-veterinary-equine-genomics-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-exports-and-vet-scratch',
	survivorRule: 'pedigree-vet-master-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectRegulatoryAndPedigreeHolds: true,
	protectVetMasters: true,
	protectQuarantineBiosecurityHolds: true,
	requireVetMasterAnchorForPrune: true,
	keepRecentRunDays: 0,
	minSizeKb: 0,
})

const STRICT_VET_REGULATORY_EXT_RE = /\.(?:fei|icar|isag|adg|coggins|eia|hcvi|woah|pedx|pedigree|ebv|gebv|studbook|microchip)$/i
const CONTEXT_VET_REGULATORY_EXT_RE = /\.(?:xml|json|yaml|yml|toml|sqlite|sqlite3|db|csv|txt|pdf)$/i
const STRICT_VET_MASTER_EXT_RE = /\.(?:vetdcm|vpacs|usvet|equine|hoof|stride|lameness|forceplate|saddle|vetimu|snpchip|bgen|grm|plink|tped|tfam)$/i
const CONTEXT_VET_MASTER_EXT_RE = /\.(?:dcm|c3d|ped|map|fam|bim|bed|vcf\.gz|fastq\.gz|parquet|parq|h5|hdf5|bin|dat)$/i
const CONTEXT_VET_EXPORT_EXT_RE = /\.(?:csv|tsv|txt|xlsx|xls|json|jsonl|pdf|png|jpg|jpeg|webp|svg|mp4|mov|avi)$/i
const STRICT_VET_SCRATCH_EXT_RE = /\.(?:vetdcm\.tmp|vpacs\.bak|c3d\.lck|plink\.tmp|bed\.tmp|bgen\.idx|grm\.part|hoof\.tmp|usvet\.tmp|lck)$/i
const GENERIC_SCRATCH_EXT_RE = /\.(?:tmp|bak|lock|dmp|part|idx|log)$/i

const NON_VETERINARY_EXCLUSION_RE = /(?:epanet|swmm|watergems|sdwis|phmsa|pipeline_ili|iec61850|comtrade|synchrophasor|nerc_?cip|v2x|scms|ntcip|etcs|ertms|cbtc|railml|quantum|qubit|qasm|geant4|cmssw|orbital|ccsds|human_?bids|hipaa|hl7|fhir|nifti|clinvar|gnomad|grch38|hg38|1000genomes|xsens_?human|optitrack_?human|sub-0\d|photoshop|lightroom|premiere|davinci|protools|logicpro|ableton|cubase|vst3|gdsii|oasis)/i
const VET_CONTEXT_HINT_RE = /(?:veterinary|vet_?pacs|vet_?clinic|vet_?rad|vetdcm|vpacs|usvet|equine|horse|stallion|mare|foal|thoroughbred|dressage|showjumping|farrier|hoof|lameness|gait_?analysis|saddle_?pressure|forceplate|canine|feline|bovine|dairy_?herd|cattle|ovine|porcine|caprine|poultry|livestock|herd_?genomics|coggins|eia_?test|hcvi|usda_?aphis|woah|fei_?passport|icar_?dairy|isag_?snp|studbook|ebv|gebv|bgen|plink_?herd)/i
const VET_QUARANTINE_HOLD_PATH_RE = /(?:quarantine_?hold|biosecurity_?hold|usda_?aphis_?hold|aphis_?hold|woah_?hold|fei_?hold|coggins_?hold|eia_?hold|rabies_?hold|notifiable_?hold|import_?quarantine|regulatory_?hold|litigation_?hold)/i
const VET_BASELINE_PATH_RE = /(?:00_pedigree|00_icar|00_isag|00_fei|00_usda|00_studbook|pedigree_baselines|breeding_baselines|regulatory_records|fei_passports|aphis_submittals|herd_registries)/i
const VET_SCRATCH_PATH_RE = /(?:vet_pacs_tmp|equine_gait_cache|hoof_pressure_tmp|lameness_buf|plink_scratch|imputation_tmp|ultrasound_spool|vet_viewer_cache|herd_genomics_tmp|saddle_pressure_cache|studbook_staging|vet_dicom_tmp)/i
const VET_INTERMEDIATE_PREFIX_RE = /^(?:tmp_vet_|tmp_equine_|tmp_gait_|tmp_plink_|tmp_bgen_|tmp_pacs_|tmp_hoof_|tmp_herd_|cache_vet_|spool_pacs_)/i
const VET_INTERMEDIATE_SUFFIX_RE = /(?:_vet_tmp|_gait_cache|_plink_scratch|_imputation_tmp|_pacs_spool|_hoof_buf|_staging)$/i
const VET_EXPORT_PATH_RE = /(?:gait_reports|lameness_videos|radiology_exports|ebv_exports|breeding_sheets|herd_summaries|ultrasound_stills|pacs_viewer_exports|_gait_report|_lameness_summary|_ebv_export|_radiology_pdf|_stride_csv|_viewer_export)/i
const CANONICAL_VET_VAULT_PATH_RE = /(?:00_raw|00_vetpacs|00_gait|00_equine|00_genomics|00_snp|00_masters|canonical|vet_archive|equine_archive|livestock_archive)/i

/**
 * Normalize configuration values for Veterinary Imaging, Equine Biomechanics & Livestock Genomics Vault auditing.
 *
 * @param {object} [rawConfig] Raw user configuration.
 * @return {object} Normalized configuration.
 */
export function normalizeVeterinaryEquineGenomicsConfig(rawConfig = {}) {
	const cfg = rawConfig && typeof rawConfig === 'object' ? rawConfig : {}
	const familyFilter = VETERINARY_EQUINE_GENOMICS_FAMILIES.includes(cfg.familyFilter)
		? cfg.familyFilter
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.familyFilter
	const verdictFilter = VETERINARY_EQUINE_GENOMICS_VERDICT_FILTERS.includes(cfg.verdictFilter)
		? cfg.verdictFilter
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.verdictFilter
	const strategy = VETERINARY_EQUINE_GENOMICS_STRATEGIES.includes(cfg.strategy)
		? cfg.strategy
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.strategy
	const survivorRule = VETERINARY_EQUINE_GENOMICS_SURVIVOR_RULES.includes(cfg.survivorRule)
		? cfg.survivorRule
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.survivorRule
	const sortMode = VETERINARY_EQUINE_GENOMICS_SORT_MODES.includes(cfg.sortMode)
		? cfg.sortMode
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.sortMode

	const keepRecentParsed = Number(cfg.keepRecentRunDays)
	const keepRecentRunDays = Number.isFinite(keepRecentParsed) && keepRecentParsed >= 0
		? Math.floor(keepRecentParsed)
		: VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.keepRecentRunDays

	const minSizeParsed = Number(cfg.minSizeKb)
	const minSizeKb = Number.isFinite(minSizeParsed) && minSizeParsed > 0
		? minSizeParsed
		: 0

	return {
		presetId: typeof cfg.presetId === 'string' && cfg.presetId ? cfg.presetId : VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG.presetId,
		familyFilter,
		verdictFilter,
		strategy,
		survivorRule,
		sortMode,
		searchQuery: typeof cfg.searchQuery === 'string' ? cfg.searchQuery.trim() : '',
		protectRegulatoryAndPedigreeHolds: cfg.protectRegulatoryAndPedigreeHolds !== undefined ? Boolean(cfg.protectRegulatoryAndPedigreeHolds) : true,
		protectVetMasters: cfg.protectVetMasters !== undefined ? Boolean(cfg.protectVetMasters) : true,
		protectQuarantineBiosecurityHolds: cfg.protectQuarantineBiosecurityHolds !== undefined ? Boolean(cfg.protectQuarantineBiosecurityHolds) : true,
		requireVetMasterAnchorForPrune: cfg.requireVetMasterAnchorForPrune !== undefined ? Boolean(cfg.requireVetMasterAnchorForPrune) : true,
		keepRecentRunDays,
		minSizeKb,
		memberOverrides: cfg.memberOverrides && typeof cfg.memberOverrides === 'object' ? { ...cfg.memberOverrides } : {},
	}
}

/**
 * Extract normalized patient/animal, equine trial, or herd cohort stem by stripping extensions and export suffixes.
 *
 * @param {string} basename Filename without directory.
 * @param {string} [normalized] Full normalized path.
 * @return {string} Normalized veterinary/equine/livestock stem.
 */
export function extractVeterinaryEquineGenomicsStem(basename, normalized = '') {
	let stem = String(basename || normalized || '').trim().toLowerCase()
	stem = stem.replace(/\.(?:vetdcm\.tmp|vpacs\.bak|c3d\.lck|plink\.tmp|bed\.tmp|bgen\.idx|grm\.part|hoof\.tmp|usvet\.tmp|vcf\.gz|fastq\.gz)$/i, '')
	stem = stem.replace(/\.[a-z0-9]{1,9}$/i, '')
	stem = stem.replace(VET_INTERMEDIATE_PREFIX_RE, '')
	stem = stem.replace(VET_INTERMEDIATE_SUFFIX_RE, '')
	stem = stem.replace(/(?:[-_](?:gait_report|lameness_summary|ebv_export|radiology_pdf|stride_csv|viewer_export|summary|export|report|preview|copy|bak|draft|v\d+|rev\d+))+$/i, '')
	return stem || 'vet-cohort'
}

/**
 * Extract canonical anchor key linking derived radiology/gait/EBV exports to verified Vet PACS, Gait, or SNP anchors.
 *
 * @param {string} vetStem Extracted veterinary/equine/livestock stem.
 * @return {string} Canonical anchor key.
 */
export function extractVeterinaryEquineGenomicsAnchorKey(vetStem) {
	return String(vetStem || 'vet-cohort')
		.toLowerCase()
		.replace(/(?:[-_](?:fei|icar|isag|adg|coggins|eia|hcvi|woah|pedx|pedigree|ebv|gebv|studbook|vetdcm|vpacs|usvet|equine|hoof|stride|lameness|forceplate|saddle|vetimu|snpchip|bgen|grm|plink|report|export))$/i, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'vet-cohort'
}

/**
 * Detect Veterinary, Equine Biomechanics & Livestock Genomics toolchain and workflow stage from path and filename.
 *
 * @param {string} normalized Normalized path.
 * @param {string} basename Filename.
 * @return {{ vetToolchain: string, workflowStage: string }} Detected toolchain and stage.
 */
function extractVetToolchainAndStage(normalized, basename) {
	const text = `${normalized} ${basename}`.toLowerCase()
	let vetToolchain = ''
	if (/\.(?:vetdcm|vpacs|usvet|dcm)\b|vet_?pacs|vet_?rad|ultrasound/.test(text)) {
		vetToolchain = 'Veterinary PACS DICOM & Ultrasound'
	} else if (/\.(?:equine|hoof|stride|lameness|forceplate|saddle|vetimu|c3d)\b|equine|lameness|forceplate|hoof|saddle_?pressure/.test(text)) {
		vetToolchain = 'Equine Gait, Forceplate & IMU Biomechanics'
	} else if (/\.(?:snpchip|bgen|grm|plink|tped|tfam)\b|plink|bgen|imputation|herd_?genomics|snpchip/.test(text)) {
		vetToolchain = 'Livestock SNP Array & PLINK / BGEN Genomics'
	} else if (/\.(?:icar|isag|adg|ebv|gebv|pedx|pedigree|studbook)\b|icar|isag|studbook|ebv|gebv/.test(text)) {
		vetToolchain = 'ICAR / ISAG Parentage & Breeding Evaluation'
	} else if (/\.(?:fei|coggins|eia|hcvi|woah|microchip)\b|usda_?aphis|fei_?passport|coggins|woah/.test(text)) {
		vetToolchain = 'USDA APHIS / WOAH / FEI Regulatory Compliance'
	} else if (VET_QUARANTINE_HOLD_PATH_RE.test(text)) {
		vetToolchain = 'Biosecurity & Quarantine Regulatory Hold'
	}

	let workflowStage = ''
	if (VET_QUARANTINE_HOLD_PATH_RE.test(text)) {
		workflowStage = 'Quarantine, Coggins EIA or APHIS Hold'
	} else if (STRICT_VET_REGULATORY_EXT_RE.test(basename) || VET_BASELINE_PATH_RE.test(text)) {
		workflowStage = 'ICAR / FEI / Pedigree & Regulatory Baseline'
	} else if (VET_SCRATCH_PATH_RE.test(text) || STRICT_VET_SCRATCH_EXT_RE.test(basename) || VET_INTERMEDIATE_PREFIX_RE.test(basename) || VET_INTERMEDIATE_SUFFIX_RE.test(basename)) {
		workflowStage = 'PACS Viewer, Gait & Imputation Scratch'
	} else if (VET_EXPORT_PATH_RE.test(text) || (CONTEXT_VET_EXPORT_EXT_RE.test(basename) && VET_CONTEXT_HINT_RE.test(text))) {
		workflowStage = 'Derived Radiology, Gait Video or EBV Export'
	} else if (STRICT_VET_MASTER_EXT_RE.test(basename) || (CONTEXT_VET_MASTER_EXT_RE.test(basename) && (VET_CONTEXT_HINT_RE.test(text) || CANONICAL_VET_VAULT_PATH_RE.test(text)))) {
		workflowStage = 'Verified Vet PACS, Equine Gait or SNP Master'
	}

	return { vetToolchain, workflowStage }
}

/**
 * Extract concise Veterinary, Equine & Livestock domain tag badge when present.
 *
 * @param {string} lowerBase Lowercase filename.
 * @param {string} lowerPath Lowercase full path.
 * @return {string} Short tag or empty string.
 */
function extractVetDomainTag(lowerBase, lowerPath) {
	const text = `${lowerPath} ${lowerBase}`
	if (VET_QUARANTINE_HOLD_PATH_RE.test(text)) {
		return 'BIOSECURITY / APHIS HOLD'
	}
	if (/\.(?:fei|coggins|eia|hcvi|woah|microchip)\b/.test(lowerBase)) {
		return 'USDA / FEI / COGGINS'
	}
	if (/\.(?:icar|isag|adg|pedx|pedigree|ebv|gebv|studbook)\b/.test(lowerBase)) {
		return 'ICAR / ISAG PEDIGREE'
	}
	if (/\.(?:vetdcm|vpacs|usvet|dcm)\b/.test(lowerBase)) {
		return 'VET PACS / ULTRASOUND'
	}
	if (/\.(?:equine|hoof|stride|lameness|forceplate|saddle|vetimu|c3d)\b/.test(lowerBase)) {
		return 'EQUINE GAIT / IMU'
	}
	if (/\.(?:snpchip|bgen|grm|plink|tped|tfam|ped|map|fam|bim|bed)\b/.test(lowerBase)) {
		return 'LIVESTOCK SNP / BGEN'
	}
	if (STRICT_VET_SCRATCH_EXT_RE.test(lowerBase)) {
		return 'PACS / PLINK SCRATCH'
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
 * Classify a single file within the Veterinary Imaging, Equine Biomechanics & Livestock Genomics domain.
 *
 * @param {object} file Duplicate file object.
 * @param {number} [referenceNowMs] Reference current timestamp in ms.
 * @return {object} Classification metadata (family === null if non-domain file).
 */
export function classifyVeterinaryEquineGenomicsFile(file, referenceNowMs = Date.now()) {
	const rawPath = String(file?.path || file?.name || '')
	const normalized = normalizePathForDiff(rawPath)
	const lower = normalized.toLowerCase()
	const slashIdx = normalized.lastIndexOf('/')
	const basename = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
	const dirname = slashIdx >= 0 ? normalized.slice(0, slashIdx) : ''
	const lowerBase = basename.toLowerCase()
	const size = Math.max(0, Number(file?.size) || 0)
	const { mtimeMs, ageDays, formattedMtime } = parseFileTime(file, referenceNowMs)

	const hasExcludedContext = NON_VETERINARY_EXCLUSION_RE.test(lower)
	const hasVetContext = !hasExcludedContext && VET_CONTEXT_HINT_RE.test(lower)
	const isBaselinePath = !hasExcludedContext && VET_BASELINE_PATH_RE.test(lower)
	const isQuarantineHoldPath = !hasExcludedContext && VET_QUARANTINE_HOLD_PATH_RE.test(lower)
	const isCanonicalVaultPath = !hasExcludedContext && CANONICAL_VET_VAULT_PATH_RE.test(lower)
	const isScratchPath = !hasExcludedContext && VET_SCRATCH_PATH_RE.test(lower)
	const isVetExportPath = !hasExcludedContext && VET_EXPORT_PATH_RE.test(lower)

	const isStrictScratchExt = !hasExcludedContext && STRICT_VET_SCRATCH_EXT_RE.test(lowerBase)
	const isGenericScratchExt = GENERIC_SCRATCH_EXT_RE.test(lowerBase)
	const isIntermediateSubfile = !hasExcludedContext && (VET_INTERMEDIATE_PREFIX_RE.test(lowerBase) || VET_INTERMEDIATE_SUFFIX_RE.test(lowerBase))

	const isStrictRegulatoryOrPedigree = !hasExcludedContext && STRICT_VET_REGULATORY_EXT_RE.test(lowerBase)
	const isRegulatoryOrPedigree = !hasExcludedContext && (
		isStrictRegulatoryOrPedigree
		|| (CONTEXT_VET_REGULATORY_EXT_RE.test(lowerBase) && !isVetExportPath && (isBaselinePath || isQuarantineHoldPath))
	)

	const isContextVetMaster = CONTEXT_VET_MASTER_EXT_RE.test(lowerBase)
		&& !hasExcludedContext
		&& (hasVetContext || isCanonicalVaultPath)
	const isStrictVetMaster = !hasExcludedContext && (
		STRICT_VET_MASTER_EXT_RE.test(lowerBase)
		|| isContextVetMaster
	)

	const isContextExport = !hasExcludedContext
		&& !isStrictVetMaster
		&& !isRegulatoryOrPedigree
		&& CONTEXT_VET_EXPORT_EXT_RE.test(lowerBase)
		&& (hasVetContext || isVetExportPath)

	let family = null
	let artifactKind = 'Unknown'
	let vaultRole = 'Outside Veterinary, Equine & Livestock Vault'
	let isProtectedRegulatoryPedigree = false
	let isProtectedVetMaster = false
	let isProtectedQuarantineHold = false
	let isVetMasterAnchor = false
	let isRedundantVetExport = false
	let isMutableFile = false

	if (
		isStrictScratchExt
		|| (isScratchPath && (isGenericScratchExt || isContextExport || isStrictVetMaster || isRegulatoryOrPedigree))
		|| (isIntermediateSubfile && (isStrictVetMaster || isContextExport || hasVetContext))
		|| (isGenericScratchExt && hasVetContext && !isBaselinePath && !isQuarantineHoldPath)
	) {
		family = 'vet-pacs-gait-genomics-scratch'
		artifactKind = isStrictScratchExt
			? 'Vet PACS / PLINK / Gait Scratch Artifact'
			: (isIntermediateSubfile ? 'Equine Gait / Genomic Imputation Cache' : 'Vet Viewer & Staging Scratch')
		vaultRole = 'Vet PACS Viewer, Equine Gait Buffer, or PLINK/BGEN Scratch'
		isMutableFile = true
	} else if (isQuarantineHoldPath && (isRegulatoryOrPedigree || isStrictVetMaster || isContextExport || hasVetContext)) {
		family = 'vet-regulatory-pedigree-holds'
		artifactKind = 'USDA APHIS / Biosecurity Quarantine Hold'
		vaultRole = 'Protected Coggins EIA, USDA APHIS, WOAH, or Quarantine Hold'
		isProtectedQuarantineHold = true
		isProtectedRegulatoryPedigree = true
		isVetMasterAnchor = isStrictVetMaster || isRegulatoryOrPedigree
		isMutableFile = true
	} else if (isRegulatoryOrPedigree) {
		family = 'vet-regulatory-pedigree-holds'
		if (/\.(?:fei|coggins|eia|hcvi|woah|microchip)$/i.test(lowerBase) || /fei|coggins|aphis|woah/.test(lower)) {
			artifactKind = 'FEI Passport / Coggins EIA / APHIS Compliance'
			vaultRole = 'Canonical Equine Passport, Health Certificate, or Quarantine Record'
		} else {
			artifactKind = 'ICAR / ISAG Pedigree & EBV Baseline'
			vaultRole = 'Canonical Studbook, Parentage & Genomic Breeding Value Baseline'
		}
		isProtectedRegulatoryPedigree = true
		isVetMasterAnchor = true
		isMutableFile = true
	} else if (isStrictVetMaster) {
		family = 'vet-imaging-gait-genomics-masters'
		if (/\.(?:vetdcm|vpacs|usvet|dcm)$/i.test(lowerBase)) {
			artifactKind = 'Veterinary PACS DICOM / Ultrasound Master'
			vaultRole = 'Immutable Veterinary Radiography, CT/MRI, or Ultrasound Series'
			isMutableFile = false
		} else if (/\.(?:equine|hoof|stride|lameness|forceplate|saddle|vetimu|c3d)$/i.test(lowerBase)) {
			artifactKind = 'Equine Gait, Forceplate & IMU Master'
			vaultRole = 'Immutable Equine Biomechanics, Hoof Pressure & Stride Capture'
			isMutableFile = false
		} else {
			artifactKind = 'Livestock SNP / BGEN / PLINK Master'
			vaultRole = 'Immutable Bovine/Ovine/Porcine Genotype & GRM Master'
			isMutableFile = /\.(?:ped|map)$/i.test(lowerBase)
		}
		isProtectedVetMaster = true
		isVetMasterAnchor = true
	} else if (isContextExport) {
		family = 'redundant-vet-reports-exports'
		if (/\.(?:mp4|mov|avi)$/i.test(lowerBase)) {
			artifactKind = 'Derived Equine Gait / Lameness Video Export'
		} else if (/\.(?:png|jpg|jpeg|webp|svg|pdf)$/i.test(lowerBase)) {
			artifactKind = 'Vet Radiology PDF / Ultrasound Still Export'
		} else {
			artifactKind = 'Derived EBV / Stride / Herd Summary CSV Export'
		}
		vaultRole = 'Derived Veterinary Report, Gait Video, or Breeding Index Export'
		isRedundantVetExport = true
		isMutableFile = true
	}

	const { vetToolchain, workflowStage } = extractVetToolchainAndStage(normalized, basename)
	const vetStem = extractVeterinaryEquineGenomicsStem(basename, normalized)
	const vetAnchorKey = extractVeterinaryEquineGenomicsAnchorKey(vetStem)
	const vetTag = extractVetDomainTag(lowerBase, lower)

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
		vetToolchain,
		workflowStage,
		vetStem,
		vetAnchorKey,
		vetTag,
		isProtectedRegulatoryPedigree,
		isProtectedVetMaster,
		isProtectedQuarantineHold,
		isVetMasterAnchor,
		isRedundantVetExport,
		isMutableFile,
		isScratchPath: isScratchPath || isStrictScratchExt || (isIntermediateSubfile && family === 'vet-pacs-gait-genomics-scratch') || (isGenericScratchExt && hasVetContext && family === 'vet-pacs-gait-genomics-scratch'),
		isBaselinePath,
		isQuarantineHoldPath,
		isCanonicalVaultPath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Veterinary, Equine & Livestock Genomics domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isVeterinaryEquineGenomicsGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyVeterinaryEquineGenomicsFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking verified Vet PACS, Equine Gait, Livestock SNP, and Pedigree anchors
 * to derived radiology PDFs, gait videos/CSVs, and EBV breeding index exports.
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildVeterinaryEquineGenomicsCorrelationIndex(groups) {
	const anchorStems = new Set()
	const anchorKeys = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyVeterinaryEquineGenomicsFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isVetMasterAnchor) {
				anchorStems.add(meta.vetStem)
				anchorKeys.add(meta.vetAnchorKey)
			}
		}
	}

	return {
		anchorStems,
		anchorKeys,
	}
}

/**
 * Determine primary family for a heterogeneous Veterinary & Livestock cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'vet-regulatory-pedigree-holds')) {
		return 'vet-regulatory-pedigree-holds'
	}
	if (members.some(m => m.family === 'vet-imaging-gait-genomics-masters')) {
		return 'vet-imaging-gait-genomics-masters'
	}
	if (members.some(m => m.family === 'redundant-vet-reports-exports')) {
		return 'redundant-vet-reports-exports'
	}
	return 'vet-pacs-gait-genomics-scratch'
}

/**
 * Compute deterministic survivor priority score for a Veterinary & Livestock vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-clinical-capture-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedQuarantineHold ? 100000 : 0)
			+ (member.isProtectedRegulatoryPedigree ? 97000 : 0)
			+ (member.isProtectedVetMaster ? 94000 : 0)
			+ (member.isCanonicalVaultPath ? 25000 : 0)
			+ (member.isBaselinePath ? 10000 : 0)
			+ (member.isScratchPath ? -55000 : 0)
			+ (member.isRedundantVetExport ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-evaluation-run-first') {
		return (member.isProtectedQuarantineHold ? 100000 : 0)
			+ (member.isProtectedRegulatoryPedigree ? 97000 : 0)
			+ (member.isProtectedVetMaster ? 94000 : 0)
			+ (member.isScratchPath ? -50000 : 0)
			+ (member.isRedundantVetExport ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedQuarantineHold ? 52000 : 0)
			+ (member.isProtectedRegulatoryPedigree ? 50000 : 0)
			+ (member.isProtectedVetMaster ? 48000 : 0)
			+ (member.isScratchPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedQuarantineHold ? 100000 : 0)
		+ (member.isProtectedRegulatoryPedigree ? 97000 : 0)
		+ (member.isProtectedVetMaster ? 94000 : 0)
		+ (member.isCanonicalVaultPath ? 25000 : 0)
		+ (member.isBaselinePath ? 10000 : 0)
		+ (member.isRedundantVetExport ? -45000 : 0)
		+ (member.isScratchPath ? -60000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Veterinary Imaging, Equine Biomechanics & Livestock Genomics duplicate cluster.
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
		const meta = classifyVeterinaryEquineGenomicsFile(file, referenceNowMs)
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
	const primaryToolchain = rawMembers.find(m => m.vetToolchain)?.vetToolchain || ''
	const primaryStage = rawMembers.find(m => m.workflowStage)?.workflowStage || ''
	const primaryStem = rawMembers[0].vetStem || extractVeterinaryEquineGenomicsStem(primaryName, rawMembers[0].normalized)
	const primaryAnchorKey = rawMembers[0].vetAnchorKey || extractVeterinaryEquineGenomicsAnchorKey(primaryStem)

	const hasVetMasterAnchor = Boolean(
		rawMembers.some(m => m.isVetMasterAnchor)
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

		const isRedundantVetExportMember = member.isRedundantVetExport && hasVetMasterAnchor

		let redundancyReason = ''
		if (member.isRedundantVetExport) {
			redundancyReason = isRedundantVetExportMember
				? 'Derived radiology PDF, gait video, or EBV export duplicates verified Vet PACS, Gait, or SNP master'
				: 'Derived veterinary report or gait export without verified Vet PACS, Gait, or SNP master anchor'
		}

		let governanceTier = 'vet-pacs-scratch'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep') {
			governanceTier = member.isProtectedQuarantineHold
				? 'quarantine-biosecurity-hold-protected'
				: (member.isProtectedRegulatoryPedigree
					? 'vet-regulatory-pedigree-protected'
					: (member.isProtectedVetMaster
						? 'vet-imaging-gait-master-protected'
						: (member.isRedundantVetExport
							? 'vet-export-redundant'
							: 'vet-pacs-scratch')))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedQuarantineHold && config.protectQuarantineBiosecurityHolds) {
			governanceTier = 'quarantine-biosecurity-hold-protected'
			shielded = true
			protectedReason = 'USDA APHIS, WOAH, Coggins EIA, or biosecurity quarantine hold strictly conserved'
		} else if (member.isProtectedRegulatoryPedigree && config.protectRegulatoryAndPedigreeHolds) {
			governanceTier = 'vet-regulatory-pedigree-protected'
			shielded = true
			protectedReason = 'FEI equine passport, ICAR/ISAG parentage, or studbook pedigree baseline strictly conserved'
		} else if (member.isProtectedVetMaster && config.protectVetMasters) {
			governanceTier = 'vet-imaging-gait-master-protected'
			shielded = true
			protectedReason = 'Verified Vet PACS/Ultrasound, Equine Gait/Forceplate, or Livestock SNP/BGEN master strictly conserved'
		} else if (isSurvivor && !isRedundantVetExportMember) {
			governanceTier = member.isProtectedQuarantineHold
				? 'quarantine-biosecurity-hold-protected'
				: (member.isProtectedRegulatoryPedigree
					? 'vet-regulatory-pedigree-protected'
					: (member.isProtectedVetMaster
						? 'vet-imaging-gait-master-protected'
						: (member.isRedundantVetExport
							? 'vet-export-redundant'
							: 'vet-pacs-scratch')))
			shielded = true
			protectedReason = 'Canonical Veterinary & Livestock vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isRedundantVetExport
				? 'vet-export-redundant'
				: (member.isProtectedRegulatoryPedigree
					? 'vet-regulatory-pedigree-protected'
					: 'vet-pacs-scratch')
			action = config.strategy === 'hardlink-immutable-vet-masters' && !member.isMutableFile && !member.isScratchPath
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
			governanceTier = 'vet-pacs-scratch'
			shielded = true
			protectedReason = `Within ${config.keepRecentRunDays}-day active PACS viewer, gait capture, or PLINK imputation grace window`
		} else if (member.isRedundantVetExport) {
			governanceTier = 'vet-export-redundant'
			if (config.requireVetMasterAnchorForPrune && !hasVetMasterAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified Vet PACS, Equine Gait, or Livestock SNP master anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = redundancyReason
			}
		} else if (member.isScratchPath) {
			governanceTier = 'vet-pacs-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = 'Vet PACS viewer, equine gait buffer, or PLINK/BGEN imputation scratch eligible for cleanup'
		} else if (member.isProtectedVetMaster || member.isProtectedRegulatoryPedigree) {
			governanceTier = member.isProtectedRegulatoryPedigree ? 'vet-regulatory-pedigree-protected' : 'vet-imaging-gait-master-protected'
			action = config.strategy === 'hardlink-immutable-vet-masters' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-immutable-vet-masters' && !member.isMutableFile) {
			governanceTier = 'vet-imaging-gait-master-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = 'vet-pacs-scratch'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantVetExportMember,
			redundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantVetExport = members.some(m => m.isRedundantVetExportMember || m.isRedundantVetExport)
	const hasProtectedQuarantineHold = members.some(m => m.governanceTier === 'quarantine-biosecurity-hold-protected' && m.shielded)
	const hasProtectedRegulatoryPedigree = members.some(m => m.governanceTier === 'vet-regulatory-pedigree-protected' && m.shielded)
	const hasProtectedVetMaster = members.some(m => m.governanceTier === 'vet-imaging-gait-master-protected' && m.shielded)
	const hasVetPacsScratch = members.some(m => m.isScratchPath)

	let clusterVerdict = 'shielded'
	if (reclaimableBytes > 0) {
		if (members.some(m => m.isRedundantVetExportMember && !m.shielded)) {
			clusterVerdict = 'vet-export-redundant'
		} else if (members.some(m => m.isScratchPath && !m.shielded)) {
			clusterVerdict = 'vet-pacs-scratch'
		} else {
			clusterVerdict = 'reclaimable'
		}
	} else if (hasProtectedQuarantineHold) {
		clusterVerdict = 'quarantine-biosecurity-hold-protected'
	} else if (hasProtectedRegulatoryPedigree) {
		clusterVerdict = 'vet-regulatory-pedigree-protected'
	} else if (hasProtectedVetMaster) {
		clusterVerdict = 'vet-imaging-gait-master-protected'
	}

	let priorityScore = 10
	if (reclaimableBytes > 0) {
		priorityScore = hasRedundantVetExport ? 95 : 85
	} else if (hasProtectedQuarantineHold) {
		priorityScore = 60
	} else if (hasProtectedRegulatoryPedigree) {
		priorityScore = 50
	}

	const vetTags = [...new Set(members.map(m => m.vetTag).filter(Boolean))]
	const familyMeta = VETERINARY_EQUINE_GENOMICS_FAMILY_META[family] || VETERINARY_EQUINE_GENOMICS_FAMILY_META['vet-pacs-gait-genomics-scratch']

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		vetToolchain: primaryToolchain,
		workflowStage: primaryStage,
		vetStem: primaryStem,
		vetAnchorKey: primaryAnchorKey,
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
		hasProtectedRegulatoryPedigree,
		hasProtectedVetMaster,
		hasProtectedQuarantineHold,
		hasRedundantVetExport,
		hasVetPacsScratch,
		hasVetMasterAnchor,
		vetTags,
		members,
		sourceGroup: group,
	}
}

/**
 * Audit a list of duplicate groups as a Veterinary Imaging, Equine Biomechanics & Livestock Genomics Vault.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Optional audit configuration.
 * @param {number} [referenceNowMs] Optional reference timestamp in ms.
 * @return {object} Comprehensive Veterinary, Equine & Livestock vault audit report.
 */
export function auditVeterinaryEquineGenomicsVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeVeterinaryEquineGenomicsConfig(rawConfig)
	const groupList = Array.isArray(groups) ? groups : []

	const domainGroups = groupList.filter(isVeterinaryEquineGenomicsGroup)
	const correlationIndex = buildVeterinaryEquineGenomicsCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minBytes || cluster.totalBytes >= minBytes)

	const familyCounts = {
		'vet-regulatory-pedigree-holds': 0,
		'vet-imaging-gait-genomics-masters': 0,
		'redundant-vet-reports-exports': 0,
		'vet-pacs-gait-genomics-scratch': 0,
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
				cluster.vetToolchain,
				cluster.workflowStage,
				cluster.vetStem,
				cluster.vetAnchorKey,
				cluster.familyLabel,
				...cluster.vetTags,
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
	let totalRegulatoryPedigreeClusters = 0
	let totalVetMasterClusters = 0
	let totalQuarantineHoldClusters = 0
	let totalRedundantExportClusters = 0
	let totalScratchClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount
		if (cluster.hasProtectedRegulatoryPedigree) {
			totalRegulatoryPedigreeClusters += 1
		}
		if (cluster.hasProtectedVetMaster) {
			totalVetMasterClusters += 1
		}
		if (cluster.hasProtectedQuarantineHold) {
			totalQuarantineHoldClusters += 1
		}
		if (cluster.hasRedundantVetExport) {
			totalRedundantExportClusters += 1
		}
		if (cluster.hasVetPacsScratch) {
			totalScratchClusters += 1
		}
	}

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const familyBreakdown = VETERINARY_EQUINE_GENOMICS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: VETERINARY_EQUINE_GENOMICS_FAMILY_META[id].label,
			shortLabel: VETERINARY_EQUINE_GENOMICS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: VETERINARY_EQUINE_GENOMICS_VAULT_SCHEMA,
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
			totalRegulatoryPedigreeClusters,
			totalVetMasterClusters,
			totalQuarantineHoldClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Veterinary & Livestock Vaults.
 * Strictly blocks deletion or hardlinking of shielded USDA APHIS/WOAH Quarantine Holds, FEI/ICAR
 * pedigree baselines, and verified Vet PACS/Equine Gait/SNP masters, and never hardlinks mutable files or scratch.
 *
 * @param {object} auditResult Result from auditVeterinaryEquineGenomicsVault.
 * @return {string} POSIX bash script.
 */
export function buildVeterinaryEquineGenomicsRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Veterinary Imaging, Equine Biomechanics & Livestock Genomics Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./veterinary-equine-genomics-vault-reclaim.sh only after verifying Vet PACS, Gait, and SNP anchors.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.veterinary-equine-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-exports-and-vet-scratch'
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
			} else if (strategy === 'quarantine-exports-and-vet-scratch' && (target.isRedundantVetExport || target.isScratchPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable vet exports or PACS/PLINK scratch under active USDA, FEI, ICAR & Vet Master shields.\\n"')
	} else {
		lines.push(`printf "Completed Veterinary & Livestock Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditVeterinaryEquineGenomicsVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildVeterinaryEquineGenomicsCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'vet_toolchain',
		'workflow_stage',
		'vet_stem',
		'vet_anchor_key',
		'family',
		'cluster_verdict',
		'has_vet_master_anchor',
		'is_redundant_vet_export',
		'is_pacs_plink_scratch',
		'member_path',
		'artifact_kind',
		'vault_role',
		'vet_tag',
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
				cluster.vetToolchain || '',
				cluster.workflowStage || '',
				cluster.vetStem,
				cluster.vetAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasVetMasterAnchor ? 'true' : 'false',
				member.isRedundantVetExportMember ? 'true' : 'false',
				member.isScratchPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.vetTag || '',
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
 * @param {object} auditResult Result from auditVeterinaryEquineGenomicsVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildVeterinaryEquineGenomicsJsonManifest(auditResult) {
	const payload = {
		schema: VETERINARY_EQUINE_GENOMICS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || VETERINARY_EQUINE_GENOMICS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			vetToolchain: cluster.vetToolchain,
			workflowStage: cluster.workflowStage,
			vetStem: cluster.vetStem,
			vetAnchorKey: cluster.vetAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedRegulatoryPedigree: cluster.hasProtectedRegulatoryPedigree,
			hasProtectedVetMaster: cluster.hasProtectedVetMaster,
			hasProtectedQuarantineHold: cluster.hasProtectedQuarantineHold,
			hasRedundantVetExport: cluster.hasRedundantVetExport,
			hasVetPacsScratch: cluster.hasVetPacsScratch,
			hasVetMasterAnchor: cluster.hasVetMasterAnchor,
			vetTags: cluster.vetTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				vetTag: member.vetTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantVetExportMember: member.isRedundantVetExportMember,
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
 * cloud sync of Vet PACS viewer, equine gait buffer, and PLINK/BGEN imputation scratch.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildVeterinaryEquineGenomicsSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Veterinary Imaging, Equine Gait & Livestock Genomics Vaults',
		'vet_pacs_tmp/',
		'equine_gait_cache/',
		'hoof_pressure_tmp/',
		'lameness_buf/',
		'plink_scratch/',
		'imputation_tmp/',
		'ultrasound_spool/',
		'vet_viewer_cache/',
		'herd_genomics_tmp/',
		'saddle_pressure_cache/',
		'studbook_staging/',
		'vet_dicom_tmp/',
		'tmp_vet_*',
		'tmp_equine_*',
		'tmp_gait_*',
		'tmp_plink_*',
		'tmp_bgen_*',
		'tmp_pacs_*',
		'tmp_hoof_*',
		'tmp_herd_*',
		'cache_vet_*',
		'spool_pacs_*',
		'*.vetdcm.tmp',
		'*.vpacs.bak',
		'*.c3d.lck',
		'*.plink.tmp',
		'*.bed.tmp',
		'*.bgen.idx',
		'*.grm.part',
		'*.hoof.tmp',
		'*.usvet.tmp',
		'*.lck',
		'*.lock',
		'*.tmp',
	].join('\n')
}
