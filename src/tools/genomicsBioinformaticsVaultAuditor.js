/**
 * Pure Genomics, Bioinformatics & Scientific Sequencing Data Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Genomics & Sequencing Vault families:
 * - Raw Sequencing Reads (.fastq, .fastq.gz, .fq, .fq.gz, .fasta, .fa, .fna, .faa)
 * - Alignments & Index Sidecars (.bam, .cram, .sam, .bai, .crai, .fai)
 * - Variants & Annotated Calls (.vcf, .vcf.gz, .bcf, .tbi, .csi)
 * - Matrices, Notebooks & Pipeline Work (.h5ad, .loom, .rds, .rdata, .ipynb, Nextflow work/, Snakemake tmp/)
 *
 * Enforces strict bioinformatics & sequencing governance defaults:
 * - Strictly conserves raw archived sequencing reads (.fastq.gz, .fq.gz, .cram, canonical .fastq/.fasta/.fa)
 * - Strictly conserves final variant callsets (.vcf.gz, .bcf)
 * - Strictly conserves alignment & variant index sidecars (.bai, .crai, .tbi, .csi, .fai)
 * - Detects redundant uncompressed .sam files when a verified .bam/.cram alignment anchor exists
 * - Separates Nextflow (work/, .nextflow/) & Snakemake (.snakemake/, tmp/) intermediates from archived raw data
 * - Blocks deletion of uncompressed .sam lacking a verified .bam/.cram anchor when guard is active
 * - Blocks hardlinks on mutable matrices, notebooks, R objects, and uncompressed .sam (.h5ad, .loom, .rds, .ipynb, .sam)
 *
 * Generates DRY_RUN=1 POSIX remediation scripts, CWE-1236-safe CSV reports, JSON audit
 * manifests, and .sync-exclude.lst rules. Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const GENOMICS_BIOINFORMATICS_VAULT_SCHEMA = 'duplicatefinder.genomics-bioinformatics-vault-auditor.v1'

export const GENOMICS_BIOINFORMATICS_FAMILIES = Object.freeze([
	'all',
	'raw-sequencing-reads',
	'alignments-and-indexes',
	'variants-and-annotations',
	'matrices-notebooks-pipelines',
])

export const GENOMICS_BIOINFORMATICS_FAMILY_META = Object.freeze({
	'raw-sequencing-reads': {
		id: 'raw-sequencing-reads',
		label: 'Raw Sequencing Reads',
		shortLabel: 'Reads & Ref (.fastq, .fastq.gz, .fq.gz, .fasta, .fa)',
	},
	'alignments-and-indexes': {
		id: 'alignments-and-indexes',
		label: 'Alignments & Indexes',
		shortLabel: 'Alignments (.bam, .cram, .sam, .bai, .crai)',
	},
	'variants-and-annotations': {
		id: 'variants-and-annotations',
		label: 'Variants & Indexes',
		shortLabel: 'Variants (.vcf, .vcf.gz, .bcf, .tbi, .csi)',
	},
	'matrices-notebooks-pipelines': {
		id: 'matrices-notebooks-pipelines',
		label: 'Matrices, Notebooks & Work',
		shortLabel: 'Matrices & Pipelines (.h5ad, .loom, .rds, .ipynb, work/tmp)',
	},
})

export const GENOMICS_BIOINFORMATICS_STRATEGIES = Object.freeze([
	'prune-sam-and-pipeline-intermediates',
	'hardlink-archived-reads-and-cram',
	'quarantine-uncompressed-sam-and-scratch',
])

export const GENOMICS_BIOINFORMATICS_SURVIVOR_RULES = Object.freeze([
	'raw-cram-vcf-archive-first',
	'oldest-run-first',
	'newest-analysis-first',
	'shortest-path',
])

export const GENOMICS_BIOINFORMATICS_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'raw-read-cram-protected',
	'final-vcf-protected',
	'index-sidecar-protected',
	'uncompressed-sam-redundant',
	'pipeline-work-intermediate',
	'matrix-notebook-duplicate',
	'shielded',
])

export const GENOMICS_BIOINFORMATICS_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const GENOMICS_BIOINFORMATICS_PRESETS = Object.freeze([
	{
		id: 'all-genomics-sequencing-audit',
		name: 'All Genomics & Sequencing Vaults',
		description: 'Audit raw FASTQ/FASTA reads, BAM/CRAM/SAM alignments, VCF/BCF variants, indexes (.bai/.crai/.tbi), single-cell matrices (.h5ad/.loom/.rds/.ipynb), and Nextflow/Snakemake work/tmp intermediates while conserving canonical raw & final archives.',
		familyFilter: 'all',
		strategy: 'prune-sam-and-pipeline-intermediates',
		survivorRule: 'raw-cram-vcf-archive-first',
		protectRawReadsAndCram: true,
		protectFinalVcfCalls: true,
		protectAlignmentAndVariantIndexes: true,
		requireBamOrCramForSamPrune: true,
		keepRecentPipelineDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'nextflow-snakemake-work-cleanup',
		name: 'Nextflow work/ & Snakemake tmp/ Cleanup',
		description: 'Reclaim redundant Nextflow work/ and Snakemake .snakemake/tmp/ pipeline intermediates while strictly conserving archived raw .fastq.gz, .cram, .vcf.gz, and .bai/.tbi files.',
		familyFilter: 'all',
		strategy: 'prune-sam-and-pipeline-intermediates',
		survivorRule: 'raw-cram-vcf-archive-first',
		protectRawReadsAndCram: true,
		protectFinalVcfCalls: true,
		protectAlignmentAndVariantIndexes: true,
		requireBamOrCramForSamPrune: true,
		keepRecentPipelineDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'redundant-uncompressed-sam-audit',
		name: 'Redundant Uncompressed .sam vs .bam/.cram',
		description: 'Detect uncompressed .sam files backed by a verified .bam or .cram alignment anchor and reclaim them safely while preserving .bam, .cram, .bai, and .crai.',
		familyFilter: 'alignments-and-indexes',
		strategy: 'quarantine-uncompressed-sam-and-scratch',
		survivorRule: 'raw-cram-vcf-archive-first',
		protectRawReadsAndCram: true,
		protectFinalVcfCalls: true,
		protectAlignmentAndVariantIndexes: true,
		requireBamOrCramForSamPrune: true,
		keepRecentPipelineDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'raw-fastq-cram-vcf-shield',
		name: 'Conserved FASTQ.GZ, CRAM, VCF.GZ & Index Shield',
		description: 'Inspect archived .fastq.gz/.fq.gz reads, .cram alignments, final .vcf.gz/.bcf variant calls, and .bai/.crai/.tbi index sidecars under strict governance shields.',
		familyFilter: 'raw-sequencing-reads',
		strategy: 'hardlink-archived-reads-and-cram',
		survivorRule: 'raw-cram-vcf-archive-first',
		protectRawReadsAndCram: true,
		protectFinalVcfCalls: true,
		protectAlignmentAndVariantIndexes: true,
		requireBamOrCramForSamPrune: true,
		keepRecentPipelineDays: 0,
		minSizeKb: 0,
	},
	{
		id: 'single-cell-matrices-notebooks',
		name: 'Single-Cell Matrices & Notebooks (.h5ad/.rds/.ipynb)',
		description: 'Audit duplicate .h5ad, .loom, .rds, and bioinformatics .ipynb notebooks plus .ipynb_checkpoints while blocking unsafe hardlinks on mutable analysis objects.',
		familyFilter: 'matrices-notebooks-pipelines',
		strategy: 'prune-sam-and-pipeline-intermediates',
		survivorRule: 'raw-cram-vcf-archive-first',
		protectRawReadsAndCram: true,
		protectFinalVcfCalls: true,
		protectAlignmentAndVariantIndexes: true,
		requireBamOrCramForSamPrune: true,
		keepRecentPipelineDays: 0,
		minSizeKb: 0,
	},
])

export const GENOMICS_BIOINFORMATICS_DEFAULT_CONFIG = Object.freeze({
	presetId: 'all-genomics-sequencing-audit',
	familyFilter: 'all',
	verdictFilter: 'all',
	strategy: 'prune-sam-and-pipeline-intermediates',
	survivorRule: 'raw-cram-vcf-archive-first',
	sortMode: 'reclaim_desc',
	searchQuery: '',
	protectRawReadsAndCram: true,
	protectFinalVcfCalls: true,
	protectAlignmentAndVariantIndexes: true,
	requireBamOrCramForSamPrune: true,
	keepRecentPipelineDays: 0,
	minSizeKb: 0,
})

const COMPRESSED_FASTQ_EXT_RE = /\.(?:fastq|fq)\.(?:gz|bgz)$/i
const UNCOMPRESSED_FASTQ_EXT_RE = /\.(?:fastq|fq)$/i
const FASTA_REF_EXT_RE = /\.(?:fasta|fa|fna|faa)(?:\.(?:gz|bgz))?$/i

const CRAM_EXT_RE = /\.cram$/i
const BAM_EXT_RE = /\.bam$/i
const SAM_EXT_RE = /\.sam$/i
const ALIGNMENT_INDEX_EXT_RE = /(?:\.bam\.bai|\.cram\.crai|\.bai|\.crai|\.fai)$/i

const FINAL_VCF_EXT_RE = /\.(?:vcf\.(?:gz|bgz)|bcf)$/i
const UNCOMPRESSED_VCF_EXT_RE = /\.vcf$/i
const VARIANT_INDEX_EXT_RE = /(?:\.vcf\.(?:gz|bgz)\.(?:tbi|csi)|\.bcf\.csi|\.tbi|\.csi)$/i

const MATRIX_EXT_RE = /\.(?:h5ad|loom|rds|rdata)$/i
const IPYNB_EXT_RE = /\.ipynb$/i
const MUTABLE_BIOINFO_EXT_RE = /\.(?:h5ad|loom|rds|rdata|ipynb|sam|tmp)$/i

const BIOINFO_IPYNB_CONTEXT_RE = /(?:rna[-_]?seq|scrna|single[-_]?cell|seurat|scanpy|genom|bioinfo|sequenc|fastq|bam|cram|vcf|variant|gwas|deseq|kallisto|salmon|star|bwa|gatk|nextflow|snakemake|atac|chip[-_]?seq|methyl|metagenom|cohort|transcriptom|proteom|\.ipynb_checkpoints)/i

const NEXTFLOW_WORK_PATH_RE = /(?:^|\/)(?:work\/[0-9a-f]{2}\/[0-9a-f]{6,}|work|nextflow_work|\.nextflow)(?:\/|$)/i
const SNAKEMAKE_WORK_PATH_RE = /(?:^|\/)(?:\.snakemake|snakemake_tmp|snakemake_work|benchmarks|intermediate|trimmed|aligned_tmp|sorted_tmp|dedup_tmp)(?:\/|$)/i
const GENERIC_SCRATCH_PATH_RE = /(?:^|\/)(?:tmp|temp|scratch|cache|downloads?|telechargements?|staging|\.ipynb_checkpoints|logs)(?:\/|$)/i
const CANONICAL_ARCHIVE_PATH_RE = /(?:^|\/)(?:00_raw|raw[_-]?reads?|raw[_-]?fastq|fastq[_-]?archive|cram[_-]?archive|sequencing[_-]?archive|genomics[_-]?vault|bioinfo[_-]?vault|final[_-]?variants?|vcf[_-]?archive|reference[_-]?genomes?|archive|vault|canonical|results|published)(?:\/|$)/i

const ANY_GENOMICS_EXT_RE = /\.(?:fastq\.gz|fq\.gz|fastq\.bgz|fq\.bgz|fasta\.gz|fa\.gz|fna\.gz|vcf\.gz\.tbi|vcf\.bgz\.tbi|vcf\.gz\.csi|vcf\.gz|vcf\.bgz|bcf\.csi|bam\.bai|cram\.crai|fastq|fq|fasta|fa|fna|faa|bam|cram|sam|bai|crai|fai|vcf|bcf|tbi|csi|h5ad|loom|rds|rdata|ipynb)$/i

const GENERIC_BIO_STEMS = new Set([
	'reads',
	'raw',
	'alignment',
	'aligned',
	'variants',
	'calls',
	'matrix',
	'counts',
	'analysis',
	'notebook',
	'output',
	'sample',
	'merged',
	'sorted',
])

const NOISE_PARENT_DIRS = new Set([
	'work',
	'tmp',
	'temp',
	'scratch',
	'.nextflow',
	'.snakemake',
	'.ipynb_checkpoints',
	'logs',
	'benchmarks',
	'fastq',
	'bam',
	'cram',
	'sam',
	'vcf',
	'variants',
	'alignments',
	'raw',
	'results',
	'intermediate',
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
export function normalizeGenomicsBioinformaticsConfig(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const preset = GENOMICS_BIOINFORMATICS_PRESETS.find(item => item.id === input.presetId) || null
	const base = preset
		? { ...GENOMICS_BIOINFORMATICS_DEFAULT_CONFIG, ...preset }
		: { ...GENOMICS_BIOINFORMATICS_DEFAULT_CONFIG }

	const familyFilter = GENOMICS_BIOINFORMATICS_FAMILIES.includes(input.familyFilter)
		? input.familyFilter
		: base.familyFilter
	const verdictFilter = GENOMICS_BIOINFORMATICS_VERDICT_FILTERS.includes(input.verdictFilter)
		? input.verdictFilter
		: base.verdictFilter
	const strategy = GENOMICS_BIOINFORMATICS_STRATEGIES.includes(input.strategy)
		? input.strategy
		: base.strategy
	const survivorRule = GENOMICS_BIOINFORMATICS_SURVIVOR_RULES.includes(input.survivorRule)
		? input.survivorRule
		: base.survivorRule
	const sortMode = GENOMICS_BIOINFORMATICS_SORT_MODES.includes(input.sortMode)
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
		protectRawReadsAndCram: typeof input.protectRawReadsAndCram === 'boolean'
			? input.protectRawReadsAndCram
			: base.protectRawReadsAndCram,
		protectFinalVcfCalls: typeof input.protectFinalVcfCalls === 'boolean'
			? input.protectFinalVcfCalls
			: base.protectFinalVcfCalls,
		protectAlignmentAndVariantIndexes: typeof input.protectAlignmentAndVariantIndexes === 'boolean'
			? input.protectAlignmentAndVariantIndexes
			: base.protectAlignmentAndVariantIndexes,
		requireBamOrCramForSamPrune: typeof input.requireBamOrCramForSamPrune === 'boolean'
			? input.requireBamOrCramForSamPrune
			: base.requireBamOrCramForSamPrune,
		keepRecentPipelineDays: normalizeNonNegativeInt(input.keepRecentPipelineDays, base.keepRecentPipelineDays, 3650),
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
 * Extract meaningful cohort or sequencing run folder from a path, skipping generic work/tmp subdirs.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Meaningful folder slug or empty string.
 */
function extractMeaningfulRunFolder(normalizedPath) {
	const parts = String(normalizedPath || '').split('/').filter(Boolean)
	if (parts.length <= 1) {
		return ''
	}
	for (let i = parts.length - 2; i >= 0; i -= 1) {
		const segment = parts[i].toLowerCase()
		if (/^[0-9a-f]{2}$/.test(segment) || /^[0-9a-f]{6,}$/.test(segment)) {
			continue
		}
		if (!NOISE_PARENT_DIRS.has(segment)) {
			return segment.replace(/[^a-z0-9_-]/g, '-')
		}
	}
	return ''
}

/**
 * Detect bioinformatics pipeline engine and sequencing format stage.
 *
 * @param {string} normalizedPath Normalized path.
 * @param {string} [basename] File basename.
 * @return {{ pipelineEngine: string, sequencingStage: string }} Detected engine and stage.
 */
export function extractBioinformaticsEngineAndStage(normalizedPath, basename = '') {
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const lowerBase = String(basename || '').toLowerCase()

	let pipelineEngine = ''
	if (NEXTFLOW_WORK_PATH_RE.test(lowerPath)) {
		pipelineEngine = 'Nextflow'
	} else if (SNAKEMAKE_WORK_PATH_RE.test(lowerPath)) {
		pipelineEngine = 'Snakemake'
	} else if (/\.ipynb_checkpoints/i.test(lowerPath) || IPYNB_EXT_RE.test(lowerBase)) {
		pipelineEngine = 'Jupyter / Scanpy'
	} else if (/\.(?:rds|rdata)$/i.test(lowerBase)) {
		pipelineEngine = 'R / Seurat / Bioconductor'
	} else if (/\.(?:h5ad|loom)$/i.test(lowerBase)) {
		pipelineEngine = 'AnnData / Single-Cell'
	} else if (CANONICAL_ARCHIVE_PATH_RE.test(lowerPath)) {
		pipelineEngine = 'Sequencing Vault Archive'
	} else if (GENERIC_SCRATCH_PATH_RE.test(lowerPath)) {
		pipelineEngine = 'Scratch / Staging'
	} else if (BAM_EXT_RE.test(lowerBase) || CRAM_EXT_RE.test(lowerBase) || SAM_EXT_RE.test(lowerBase)) {
		pipelineEngine = 'SAMtools / BWA / Minimap2'
	} else if (FINAL_VCF_EXT_RE.test(lowerBase) || UNCOMPRESSED_VCF_EXT_RE.test(lowerBase)) {
		pipelineEngine = 'GATK / BCFtools'
	} else {
		pipelineEngine = 'Bioinformatics Pipeline'
	}

	let sequencingStage = ''
	if (COMPRESSED_FASTQ_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Raw Compressed Reads (FASTQ.GZ)'
	} else if (UNCOMPRESSED_FASTQ_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Uncompressed FASTQ Reads'
	} else if (FASTA_REF_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Reference Genome / Contigs (FASTA)'
	} else if (CRAM_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Compressed Reference Alignment (CRAM)'
	} else if (BAM_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Binary Alignment Map (BAM)'
	} else if (SAM_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Uncompressed Text Alignment (SAM)'
	} else if (ALIGNMENT_INDEX_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Alignment Index Sidecar (.bai/.crai/.fai)'
	} else if (VARIANT_INDEX_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Variant Index Sidecar (.tbi/.csi)'
	} else if (FINAL_VCF_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Final Variant Callset (VCF.GZ/BCF)'
	} else if (UNCOMPRESSED_VCF_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Uncompressed Variant Calls (VCF)'
	} else if (MATRIX_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Single-Cell / Expression Matrix'
	} else if (IPYNB_EXT_RE.test(lowerBase)) {
		sequencingStage = 'Bioinformatics Notebook'
	}

	return { pipelineEngine, sequencingStage }
}

/**
 * Extract normalized genomics lineage stem and sample anchor key to correlate
 * uncompressed .sam against .bam/.cram and index sidecars against parent files.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath] Full normalized path for run folder context.
 * @return {string} Normalized sequencing lineage stem.
 */
export function extractGenomicsLineageStem(basename, normalizedPath = '') {
	let stem = String(basename || '').trim().toLowerCase()
	stem = stem.replace(ANY_GENOMICS_EXT_RE, '')
	stem = stem.replace(/\s+\(\d+\)$/, '')
	stem = stem.replace(/\s*-\s*copy(?:\s*\(\d+\))?$/i, '')

	let prev = ''
	while (stem !== prev) {
		prev = stem
		stem = stem.replace(
			/(?:[-_.](?:sorted|coord[-_]?sorted|dedup|markdup|md|bqsr|recal|filtered|trimmed|clean|raw|final|checkpoint|copy\d*|v\d+(?:\.\d+)?))$/i,
			''
		)
	}

	if (!stem || GENERIC_BIO_STEMS.has(stem)) {
		const runFolder = extractMeaningfulRunFolder(normalizedPath)
		if (runFolder) {
			return `${runFolder}_${stem || 'sample'}`
		}
	}

	return stem || 'unknown-sample'
}

/**
 * Extract broader sample anchor key (stripping _R1/_R2/_L001 lane/read suffixes)
 * so paired-end .sam files still correlate with merged sample .bam/.cram files.
 *
 * @param {string} lineageStem Normalized lineage stem.
 * @return {string} Sample anchor key.
 */
export function extractSampleAnchorKey(lineageStem) {
	return String(lineageStem || '')
		.replace(/(?:[-_.](?:r[12]|read[12]|l0*\d+))+$/i, '')
		|| 'unknown-sample'
}

/**
 * Extract concise bioinformatics artifact tag for badges and CSV exports.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Genomics artifact tag.
 */
function extractGenomicsTag(lowerBase) {
	if (COMPRESSED_FASTQ_EXT_RE.test(lowerBase)) {
		return 'fastq-gz'
	}
	if (UNCOMPRESSED_FASTQ_EXT_RE.test(lowerBase)) {
		return 'fastq-raw'
	}
	if (FASTA_REF_EXT_RE.test(lowerBase)) {
		return 'fasta-ref'
	}
	if (CRAM_EXT_RE.test(lowerBase)) {
		return 'cram-align'
	}
	if (BAM_EXT_RE.test(lowerBase)) {
		return 'bam-align'
	}
	if (SAM_EXT_RE.test(lowerBase)) {
		return 'sam-uncompressed'
	}
	if (ALIGNMENT_INDEX_EXT_RE.test(lowerBase)) {
		if (/\.crai$/i.test(lowerBase)) {
			return 'crai-index'
		}
		if (/\.fai$/i.test(lowerBase)) {
			return 'fai-index'
		}
		return 'bai-index'
	}
	if (VARIANT_INDEX_EXT_RE.test(lowerBase)) {
		return /\.csi$/i.test(lowerBase) ? 'csi-index' : 'tbi-index'
	}
	if (FINAL_VCF_EXT_RE.test(lowerBase)) {
		return /\.bcf$/i.test(lowerBase) ? 'bcf-variants' : 'vcf-gz-variants'
	}
	if (UNCOMPRESSED_VCF_EXT_RE.test(lowerBase)) {
		return 'vcf-uncompressed'
	}
	if (/\.h5ad$/i.test(lowerBase)) {
		return 'h5ad-anndata'
	}
	if (/\.loom$/i.test(lowerBase)) {
		return 'loom-matrix'
	}
	if (/\.(?:rds|rdata)$/i.test(lowerBase)) {
		return 'rds-object'
	}
	if (/\.ipynb$/i.test(lowerBase)) {
		return 'ipynb-notebook'
	}
	return ''
}

/**
 * Classify a single duplicate file into the Genomics, Bioinformatics & Sequencing Vault domain.
 *
 * @param {object} file Duplicate file entry.
 * @param {number} [referenceNowMs] Reference epoch ms.
 * @return {object} Classification metadata (family === null if outside domain).
 */
export function classifyGenomicsBioinformaticsFile(file, referenceNowMs = Date.now()) {
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

	const isCompressedFastq = COMPRESSED_FASTQ_EXT_RE.test(lowerBase)
	const isUncompressedFastq = !isCompressedFastq && UNCOMPRESSED_FASTQ_EXT_RE.test(lowerBase)
	const isFastaRef = FASTA_REF_EXT_RE.test(lowerBase)

	const isCram = CRAM_EXT_RE.test(lowerBase)
	const isBam = BAM_EXT_RE.test(lowerBase)
	const isSam = SAM_EXT_RE.test(lowerBase)
	const isAlignmentIndex = ALIGNMENT_INDEX_EXT_RE.test(lowerBase)

	const isVariantIndex = VARIANT_INDEX_EXT_RE.test(lowerBase)
	const isFinalVcf = !isVariantIndex && FINAL_VCF_EXT_RE.test(lowerBase)
	const isUncompressedVcf = !isVariantIndex && !isFinalVcf && UNCOMPRESSED_VCF_EXT_RE.test(lowerBase)

	const isMatrixExt = MATRIX_EXT_RE.test(lowerBase)
	const isIpynbExt = IPYNB_EXT_RE.test(lowerBase) && BIOINFO_IPYNB_CONTEXT_RE.test(`${lower} ${lowerBase}`)

	const isNextflowWork = NEXTFLOW_WORK_PATH_RE.test(lower)
	const isSnakemakeWork = SNAKEMAKE_WORK_PATH_RE.test(lower)
	const isGenericScratch = GENERIC_SCRATCH_PATH_RE.test(lower)
	const isPipelineWorkPath = isNextflowWork || isSnakemakeWork || isGenericScratch
	const isCanonicalArchivePath = CANONICAL_ARCHIVE_PATH_RE.test(lower) && !isPipelineWorkPath

	let family = null
	let artifactKind = ''
	let vaultRole = ''
	let isProtectedRawReadOrCram = false
	let isProtectedFinalVcf = false
	let isProtectedIndexSidecar = false
	let isBamAnchor = false
	let isCramAnchor = false
	let isUncompressedSam = false
	let isUncompressedVcfFile = false
	let isMatrixOrNotebook = false
	let isMutableFile = MUTABLE_BIOINFO_EXT_RE.test(lowerBase)

	if (isCompressedFastq || isUncompressedFastq || isFastaRef) {
		family = 'raw-sequencing-reads'
		if (isCompressedFastq) {
			isProtectedRawReadOrCram = !isPipelineWorkPath
			artifactKind = 'Compressed Sequencing Reads (.fastq.gz/.fq.gz)'
			vaultRole = isPipelineWorkPath
				? 'Pipeline Work / Scratch FASTQ.GZ Copy'
				: (isCanonicalArchivePath ? 'Archived Raw Sequencing Vault' : 'Raw Compressed FASTQ Reads')
		} else if (isFastaRef) {
			isProtectedRawReadOrCram = !isPipelineWorkPath
			artifactKind = 'Reference / Assembly FASTA (.fasta/.fa)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work FASTA Intermediate' : 'Reference Genome / Contig Archive'
		} else {
			isProtectedRawReadOrCram = isCanonicalArchivePath && !isPipelineWorkPath
			artifactKind = 'Uncompressed Sequencing Reads (.fastq/.fq)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Uncompressed FASTQ' : 'Uncompressed Raw FASTQ'
		}
	} else if (isCram || isBam || isSam || isAlignmentIndex) {
		family = 'alignments-and-indexes'
		if (isCram) {
			isCramAnchor = !isPipelineWorkPath
			isProtectedRawReadOrCram = !isPipelineWorkPath
			artifactKind = 'Compressed CRAM Alignment (.cram)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work CRAM Copy' : 'Archived CRAM Alignment Vault'
		} else if (isBam) {
			isBamAnchor = !isPipelineWorkPath
			artifactKind = 'Binary BAM Alignment (.bam)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work BAM Intermediate' : 'Canonical BAM Alignment'
		} else if (isSam) {
			isUncompressedSam = true
			artifactKind = 'Uncompressed SAM Alignment (.sam)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Uncompressed SAM' : 'Uncompressed Text SAM Copy'
		} else {
			isProtectedIndexSidecar = !isPipelineWorkPath
			artifactKind = 'Alignment Index Sidecar (.bai/.crai/.fai)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Index Copy' : 'Conserved Alignment Index Sidecar'
		}
	} else if (isFinalVcf || isUncompressedVcf || isVariantIndex) {
		family = 'variants-and-annotations'
		if (isFinalVcf) {
			isProtectedFinalVcf = !isPipelineWorkPath
			artifactKind = /\.bcf$/i.test(lowerBase)
				? 'Binary Variant Callset (.bcf)'
				: 'Compressed Final Variant Callset (.vcf.gz)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Variant Intermediate' : 'Conserved Final Variant Callset'
		} else if (isVariantIndex) {
			isProtectedIndexSidecar = !isPipelineWorkPath
			artifactKind = 'Variant Index Sidecar (.tbi/.csi)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Variant Index Copy' : 'Conserved Tabix/CSI Index Sidecar'
		} else {
			isUncompressedVcfFile = true
			artifactKind = 'Uncompressed Variant Calls (.vcf)'
			vaultRole = isPipelineWorkPath ? 'Pipeline Work Uncompressed VCF' : 'Uncompressed Text VCF Copy'
		}
	} else if (isMatrixExt || isIpynbExt) {
		family = 'matrices-notebooks-pipelines'
		isMatrixOrNotebook = true
		if (/\.h5ad$/i.test(lowerBase)) {
			artifactKind = 'Scanpy AnnData Matrix (.h5ad)'
		} else if (/\.loom$/i.test(lowerBase)) {
			artifactKind = 'Single-Cell Loom Matrix (.loom)'
		} else if (/\.(?:rds|rdata)$/i.test(lowerBase)) {
			artifactKind = 'R / Seurat Serialized Object (.rds)'
		} else {
			artifactKind = 'Bioinformatics Jupyter Notebook (.ipynb)'
		}
		vaultRole = isPipelineWorkPath
			? 'Pipeline Work / Checkpoint Copy'
			: (isCanonicalArchivePath ? 'Canonical Analysis Vault' : 'Bioinformatics Analysis Artifact')
	}

	const { pipelineEngine, sequencingStage } = extractBioinformaticsEngineAndStage(normalized, basename)
	const lineageStem = extractGenomicsLineageStem(basename, normalized)
	const sampleAnchorKey = extractSampleAnchorKey(lineageStem)
	const runFolder = extractMeaningfulRunFolder(normalized)
	const genomicsTag = extractGenomicsTag(lowerBase)

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
		pipelineEngine,
		sequencingStage,
		lineageStem,
		sampleAnchorKey,
		runFolder,
		genomicsTag,
		isCompressedFastq,
		isUncompressedFastq,
		isFastaRef,
		isCram,
		isBam,
		isSam,
		isAlignmentIndex,
		isFinalVcf,
		isUncompressedVcf,
		isVariantIndex,
		isMatrixExt,
		isIpynbExt,
		isProtectedRawReadOrCram,
		isProtectedFinalVcf,
		isProtectedIndexSidecar,
		isBamAnchor,
		isCramAnchor,
		isUncompressedSam,
		isUncompressedVcfFile,
		isMatrixOrNotebook,
		isMutableFile,
		isNextflowWork,
		isSnakemakeWork,
		isGenericScratch,
		isPipelineWorkPath,
		isCanonicalArchivePath,
	}
}

/**
 * Determine whether a duplicate group belongs to the Genomics, Bioinformatics & Sequencing Vault domain.
 *
 * @param {object} group Duplicate group.
 * @return {boolean} True when at least one file belongs to this domain.
 */
export function isGenomicsBioinformaticsGroup(group) {
	if (!group || !Array.isArray(group.files) || group.files.length === 0) {
		return false
	}
	return group.files.some(file => classifyGenomicsBioinformaticsFile(file).family !== null)
}

/**
 * Build cross-group correlation index linking:
 * - Verified .bam / .cram alignment anchors to redundant uncompressed .sam files
 * - Compressed .fastq.gz / .fq.gz read anchors to uncompressed .fastq/.fq files
 * - Compressed .vcf.gz / .bcf callsets to uncompressed .vcf files
 * - Parent .bam / .cram / .vcf.gz / .bcf files to .bai / .crai / .tbi / .csi index sidecars
 *
 * @param {Array<object>} groups Domain duplicate groups.
 * @return {object} Correlation index.
 */
export function buildGenomicsBioinformaticsCorrelationIndex(groups) {
	const alignmentAnchorStems = new Set()
	const alignmentAnchorSampleKeys = new Set()
	const compressedFastqStems = new Set()
	const compressedVcfStems = new Set()

	for (const group of Array.isArray(groups) ? groups : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = classifyGenomicsBioinformaticsFile(file)
			if (!meta.family) {
				continue
			}
			if (meta.isBam || meta.isCram) {
				alignmentAnchorStems.add(meta.lineageStem)
				alignmentAnchorSampleKeys.add(meta.sampleAnchorKey)
			}
			if (meta.isCompressedFastq) {
				compressedFastqStems.add(meta.lineageStem)
			}
			if (meta.isFinalVcf) {
				compressedVcfStems.add(meta.lineageStem)
			}
		}
	}

	return {
		alignmentAnchorStems,
		alignmentAnchorSampleKeys,
		compressedFastqStems,
		compressedVcfStems,
	}
}

/**
 * Determine primary family for a heterogeneous genomics cluster.
 *
 * @param {Array<object>} members Classified members.
 * @return {string} Family ID.
 */
function resolveClusterFamily(members) {
	if (members.some(m => m.family === 'raw-sequencing-reads')) {
		return 'raw-sequencing-reads'
	}
	if (members.some(m => m.family === 'alignments-and-indexes')) {
		return 'alignments-and-indexes'
	}
	if (members.some(m => m.family === 'variants-and-annotations')) {
		return 'variants-and-annotations'
	}
	return 'matrices-notebooks-pipelines'
}

/**
 * Compute deterministic survivor priority score for a genomics vault member.
 *
 * @param {object} member Classified member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Priority score (higher wins).
 */
function scoreMemberForSurvivor(member, survivorRule) {
	const mtimeScore = member.mtimeMs !== null ? member.mtimeMs / 1e10 : 0
	const shortPathScore = 1000 - Math.min(999, member.normalized.length)

	if (survivorRule === 'oldest-run-first') {
		const oldestScore = member.mtimeMs !== null ? -mtimeScore : 0
		return (member.isProtectedRawReadOrCram ? 95000 : 0)
			+ (member.isProtectedFinalVcf ? 92000 : 0)
			+ (member.isProtectedIndexSidecar ? 90000 : 0)
			+ (member.isBamAnchor ? 82000 : 0)
			+ (member.isCanonicalArchivePath ? 25000 : 0)
			+ (member.isPipelineWorkPath ? -50000 : 0)
			+ (member.isUncompressedSam ? -40000 : 0)
			+ oldestScore
			+ shortPathScore
	}

	if (survivorRule === 'newest-analysis-first') {
		return (member.isProtectedRawReadOrCram ? 95000 : 0)
			+ (member.isProtectedFinalVcf ? 92000 : 0)
			+ (member.isProtectedIndexSidecar ? 90000 : 0)
			+ (member.isBamAnchor ? 82000 : 0)
			+ (member.isPipelineWorkPath ? -45000 : 0)
			+ (member.isUncompressedSam ? -40000 : 0)
			+ mtimeScore
	}

	if (survivorRule === 'shortest-path') {
		return (member.isProtectedRawReadOrCram ? 50000 : 0)
			+ (member.isProtectedFinalVcf ? 48000 : 0)
			+ (member.isProtectedIndexSidecar ? 46000 : 0)
			+ (member.isPipelineWorkPath ? -30000 : 0)
			+ shortPathScore
	}

	return (member.isProtectedRawReadOrCram ? 98000 : 0)
		+ (member.isProtectedFinalVcf ? 95000 : 0)
		+ (member.isProtectedIndexSidecar ? 92000 : 0)
		+ (member.isBamAnchor ? 85000 : 0)
		+ (member.isCanonicalArchivePath ? 25000 : 0)
		+ (member.isUncompressedSam ? -45000 : 0)
		+ (member.isPipelineWorkPath ? -55000 : 0)
		+ shortPathScore
}

/**
 * Audit a single Genomics, Bioinformatics & Sequencing Vault duplicate cluster.
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
		const meta = classifyGenomicsBioinformaticsFile(file, referenceNowMs)
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
	const primaryEngine = rawMembers.find(m => m.pipelineEngine)?.pipelineEngine || ''
	const primaryStage = rawMembers.find(m => m.sequencingStage)?.sequencingStage || ''
	const primaryStem = rawMembers[0].lineageStem || extractGenomicsLineageStem(primaryName, rawMembers[0].normalized)
	const primarySampleKey = rawMembers[0].sampleAnchorKey || extractSampleAnchorKey(primaryStem)

	const hasBamOrCramAnchor = Boolean(
		rawMembers.some(m => m.isBam || m.isCram)
		|| correlationIndex.alignmentAnchorStems.has(primaryStem)
		|| correlationIndex.alignmentAnchorSampleKeys.has(primarySampleKey)
	)
	const hasCompressedFastqAnchor = Boolean(
		rawMembers.some(m => m.isCompressedFastq)
		|| correlationIndex.compressedFastqStems.has(primaryStem)
	)
	const hasCompressedVcfAnchor = Boolean(
		rawMembers.some(m => m.isFinalVcf)
		|| correlationIndex.compressedVcfStems.has(primaryStem)
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

		const isRedundantSamMember = member.isUncompressedSam && hasBamOrCramAnchor
		const samRiskLevel = member.isUncompressedSam
			? (isRedundantSamMember ? 'critical' : 'elevated')
			: 'none'
		const samRedundancyReason = member.isUncompressedSam
			? (isRedundantSamMember
				? 'Uncompressed .sam duplicates verified .bam/.cram alignment anchor'
				: 'Uncompressed .sam without verified .bam/.cram alignment anchor')
			: ''

		let governanceTier = 'matrix-notebook-duplicate'
		let shielded = false
		let protectedReason = ''
		let action = 'keep'

		if (override === 'keep' && !isSurvivor) {
			governanceTier = member.isProtectedRawReadOrCram
				? 'raw-read-cram-protected'
				: (member.isProtectedFinalVcf
					? 'final-vcf-protected'
					: (member.isProtectedIndexSidecar
						? 'index-sidecar-protected'
						: (member.isUncompressedSam
							? 'uncompressed-sam-redundant'
							: (member.isPipelineWorkPath ? 'pipeline-work-intermediate' : 'matrix-notebook-duplicate'))))
			shielded = true
			protectedReason = 'Manually shielded via per-copy override'
		} else if (member.isProtectedRawReadOrCram && config.protectRawReadsAndCram) {
			governanceTier = 'raw-read-cram-protected'
			shielded = true
			protectedReason = member.isCram
				? 'Archived .cram alignment strictly conserved'
				: 'Archived raw sequencing reads (.fastq.gz/.fq.gz/.fasta) strictly conserved'
		} else if (member.isProtectedFinalVcf && config.protectFinalVcfCalls) {
			governanceTier = 'final-vcf-protected'
			shielded = true
			protectedReason = 'Final variant callset (.vcf.gz/.bcf) strictly conserved'
		} else if (member.isProtectedIndexSidecar && config.protectAlignmentAndVariantIndexes) {
			governanceTier = 'index-sidecar-protected'
			shielded = true
			protectedReason = 'Index sidecar (.bai/.crai/.tbi/.csi/.fai) strictly conserved'
		} else if (isSurvivor && !(member.isUncompressedSam && isRedundantSamMember && !config.protectRawReadsAndCram)) {
			governanceTier = (member.isCompressedFastq || member.isCram || member.isFastaRef || member.isUncompressedFastq)
				? 'raw-read-cram-protected'
				: ((member.isFinalVcf || member.isUncompressedVcf)
					? 'final-vcf-protected'
					: ((member.isAlignmentIndex || member.isVariantIndex)
						? 'index-sidecar-protected'
						: (member.isUncompressedSam
							? 'uncompressed-sam-redundant'
							: (member.isPipelineWorkPath ? 'pipeline-work-intermediate' : 'matrix-notebook-duplicate'))))
			shielded = true
			protectedReason = 'Canonical sequencing vault survivor retained'
		} else if (override === 'prune') {
			governanceTier = member.isUncompressedSam
				? 'uncompressed-sam-redundant'
				: (member.isPipelineWorkPath ? 'pipeline-work-intermediate' : 'matrix-notebook-duplicate')
			action = config.strategy === 'hardlink-archived-reads-and-cram' && !member.isMutableFile && !member.isPipelineWorkPath
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
			config.keepRecentPipelineDays > 0
			&& member.isPipelineWorkPath
			&& member.ageDays !== null
			&& member.ageDays < config.keepRecentPipelineDays
		) {
			governanceTier = 'pipeline-work-intermediate'
			shielded = true
			protectedReason = `Within ${config.keepRecentPipelineDays}-day Nextflow/Snakemake pipeline work retention window`
		} else if (member.isUncompressedSam) {
			governanceTier = 'uncompressed-sam-redundant'
			if (config.requireBamOrCramForSamPrune && !hasBamOrCramAnchor) {
				shielded = true
				protectedReason = 'Blocked until a verified .bam/.cram alignment anchor exists'
			} else {
				action = 'delete'
				deleteTargetsCount += 1
				reclaimableBytes += member.size
				protectedReason = samRedundancyReason
			}
		} else if (member.isPipelineWorkPath) {
			governanceTier = 'pipeline-work-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
			protectedReason = member.isNextflowWork
				? 'Nextflow work/ intermediate eligible for safe cleanup'
				: (member.isSnakemakeWork
					? 'Snakemake .snakemake/tmp intermediate eligible for safe cleanup'
					: 'Scratch/checkpoint copy eligible for safe cleanup')
		} else if (member.isProtectedRawReadOrCram) {
			governanceTier = 'raw-read-cram-protected'
			action = config.strategy === 'hardlink-archived-reads-and-cram' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (member.isProtectedFinalVcf) {
			governanceTier = 'final-vcf-protected'
			action = config.strategy === 'hardlink-archived-reads-and-cram' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (member.isProtectedIndexSidecar) {
			governanceTier = 'index-sidecar-protected'
			action = config.strategy === 'hardlink-archived-reads-and-cram' && !member.isMutableFile ? 'hardlink' : 'delete'
			if (action === 'hardlink') {
				hardlinkSavingsBytes += member.size
				hardlinkTargetsCount += 1
			} else {
				deleteTargetsCount += 1
			}
			reclaimableBytes += member.size
		} else if (config.strategy === 'hardlink-archived-reads-and-cram' && !member.isMutableFile) {
			governanceTier = member.isMatrixOrNotebook ? 'matrix-notebook-duplicate' : 'raw-read-cram-protected'
			action = 'hardlink'
			hardlinkSavingsBytes += member.size
			hardlinkTargetsCount += 1
			reclaimableBytes += member.size
		} else {
			governanceTier = member.isMatrixOrNotebook ? 'matrix-notebook-duplicate' : 'pipeline-work-intermediate'
			action = 'delete'
			deleteTargetsCount += 1
			reclaimableBytes += member.size
		}

		if (shielded) {
			shieldedCount += 1
		}

		return {
			...member,
			isRedundantSamMember,
			samRiskLevel,
			samRedundancyReason,
			isSurvivor,
			governanceTier,
			shielded,
			protectedReason,
			action,
		}
	})

	const hasRedundantUncompressedSam = members.some(m => m.isRedundantSamMember || m.isUncompressedSam)
	const hasPipelineWorkIntermediate = members.some(m => m.isPipelineWorkPath)
	const hasProtectedRawReadOrCram = members.some(m => m.governanceTier === 'raw-read-cram-protected')
	const hasProtectedFinalVcf = members.some(m => m.governanceTier === 'final-vcf-protected')
	const hasProtectedIndexSidecar = members.some(m => m.governanceTier === 'index-sidecar-protected')
	const hasMatrixOrNotebook = members.some(m => m.isMatrixOrNotebook)

	let clusterVerdict = 'matrix-notebook-duplicate'
	if (hasRedundantUncompressedSam && members.some(m => m.isRedundantSamMember)) {
		clusterVerdict = 'uncompressed-sam-redundant'
	} else if (hasProtectedRawReadOrCram) {
		clusterVerdict = 'raw-read-cram-protected'
	} else if (hasProtectedFinalVcf) {
		clusterVerdict = 'final-vcf-protected'
	} else if (hasProtectedIndexSidecar) {
		clusterVerdict = 'index-sidecar-protected'
	} else if (hasPipelineWorkIntermediate) {
		clusterVerdict = 'pipeline-work-intermediate'
	} else if (hasRedundantUncompressedSam) {
		clusterVerdict = 'uncompressed-sam-redundant'
	}

	const hasReclaimable = (deleteTargetsCount + hardlinkTargetsCount) > 0
	const genomicsTags = Array.from(new Set(members.map(m => m.genomicsTag).filter(Boolean)))

	const riskScore = (members.some(m => m.isRedundantSamMember) ? 125 : 0)
		+ (hasPipelineWorkIntermediate ? 110 : 0)
		+ (hasProtectedRawReadOrCram ? 95 : 0)
		+ (hasProtectedFinalVcf ? 90 : 0)
		+ (hasProtectedIndexSidecar ? 85 : 0)
		+ (hasMatrixOrNotebook ? 70 : 0)
		+ (hasReclaimable ? 20 : 0)

	return {
		id: group.id ?? primaryName,
		hash: group.hash || '',
		name: primaryName,
		pipelineEngine: primaryEngine,
		sequencingStage: primaryStage,
		lineageStem: primaryStem,
		sampleAnchorKey: primarySampleKey,
		family,
		familyLabel: GENOMICS_BIOINFORMATICS_FAMILY_META[family]?.label || family,
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
		hasProtectedRawReadOrCram,
		hasProtectedFinalVcf,
		hasProtectedIndexSidecar,
		hasRedundantUncompressedSam,
		hasPipelineWorkIntermediate,
		hasMatrixOrNotebook,
		hasBamOrCramAnchor,
		hasCompressedFastqAnchor,
		hasCompressedVcfAnchor,
		genomicsTags,
		members,
		group,
	}
}

/**
 * Audit duplicate groups across Genomics, Bioinformatics & Scientific Sequencing Data Vaults.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {object} [rawConfig] Audit configuration overrides.
 * @param {number} [referenceNowMs] Reference epoch ms for deterministic tests.
 * @return {object} Complete audit report with summary, family counts, and filtered clusters.
 */
export function auditGenomicsBioinformaticsVault(groups, rawConfig = {}, referenceNowMs = Date.now()) {
	const config = normalizeGenomicsBioinformaticsConfig(rawConfig)
	const sourceGroups = Array.isArray(groups) ? groups : []
	const domainGroups = sourceGroups.filter(isGenomicsBioinformaticsGroup)
	const correlationIndex = buildGenomicsBioinformaticsCorrelationIndex(domainGroups)

	const allClusters = domainGroups
		.map(group => auditSingleCluster(group, correlationIndex, config, referenceNowMs))
		.filter(Boolean)

	const minSizeBytes = config.minSizeKb * 1024
	const sizeFiltered = allClusters.filter(cluster => cluster.unitBytes >= minSizeBytes)

	const familyCounts = {
		all: sizeFiltered.length,
		'raw-sequencing-reads': 0,
		'alignments-and-indexes': 0,
		'variants-and-annotations': 0,
		'matrices-notebooks-pipelines': 0,
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
		if (config.verdictFilter === 'uncompressed-sam-redundant' && !cluster.hasRedundantUncompressedSam) {
			return false
		}
		if (config.verdictFilter === 'pipeline-work-intermediate' && !cluster.hasPipelineWorkIntermediate) {
			return false
		}
		if (
			config.verdictFilter !== 'all'
			&& config.verdictFilter !== 'reclaimable'
			&& config.verdictFilter !== 'shielded'
			&& config.verdictFilter !== 'uncompressed-sam-redundant'
			&& config.verdictFilter !== 'pipeline-work-intermediate'
			&& cluster.clusterVerdict !== config.verdictFilter
		) {
			return false
		}
		if (query.length > 0) {
			const matchesName = cluster.name.toLowerCase().includes(query)
			const matchesStem = cluster.lineageStem.toLowerCase().includes(query)
			const matchesEngine = cluster.pipelineEngine.toLowerCase().includes(query)
			const matchesStage = cluster.sequencingStage.toLowerCase().includes(query)
			const matchesTag = cluster.genomicsTags.some(tag => tag.toLowerCase().includes(query))
			const matchesMember = cluster.members.some(m => m.lower.includes(query))
			if (!matchesName && !matchesStem && !matchesEngine && !matchesStage && !matchesTag && !matchesMember) {
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
	let totalRawReadCramClusters = 0
	let totalFinalVcfClusters = 0
	let totalIndexSidecarClusters = 0
	let totalRedundantSamClusters = 0
	let totalPipelineWorkClusters = 0
	let totalMatrixNotebookClusters = 0

	for (const cluster of filteredClusters) {
		rawDuplicateBytes += Math.max(0, cluster.totalBytes - cluster.unitBytes)
		reclaimableBytes += cluster.reclaimableBytes
		totalReclaimableCopiesCount += cluster.reclaimableTargetsCount
		totalShieldedCopiesCount += cluster.shieldedCount

		if (cluster.hasProtectedRawReadOrCram) {
			totalRawReadCramClusters += 1
		}
		if (cluster.hasProtectedFinalVcf) {
			totalFinalVcfClusters += 1
		}
		if (cluster.hasProtectedIndexSidecar) {
			totalIndexSidecarClusters += 1
		}
		if (cluster.hasRedundantUncompressedSam) {
			totalRedundantSamClusters += 1
		}
		if (cluster.hasPipelineWorkIntermediate) {
			totalPipelineWorkClusters += 1
		}
		if (cluster.hasMatrixOrNotebook) {
			totalMatrixNotebookClusters += 1
		}
	}

	const efficiencyPct = rawDuplicateBytes > 0
		? Math.min(100, Math.round((reclaimableBytes / rawDuplicateBytes) * 100))
		: 0

	const reclaimableGb = `${(reclaimableBytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`

	const familyBreakdown = GENOMICS_BIOINFORMATICS_FAMILIES
		.filter(id => id !== 'all')
		.map(id => ({
			id,
			label: GENOMICS_BIOINFORMATICS_FAMILY_META[id].label,
			shortLabel: GENOMICS_BIOINFORMATICS_FAMILY_META[id].shortLabel,
			clustersCount: familyCounts[id] || 0,
		}))

	return {
		schema: GENOMICS_BIOINFORMATICS_VAULT_SCHEMA,
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
			totalRawReadCramClusters,
			totalFinalVcfClusters,
			totalIndexSidecarClusters,
			totalRedundantSamClusters,
			totalPipelineWorkClusters,
			totalMatrixNotebookClusters,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Genomics & Bioinformatics vaults.
 * Strictly blocks deletion or hardlinking of shielded raw .fastq.gz/.cram reads,
 * final .vcf.gz/.bcf calls, and .bai/.crai/.tbi/.csi indexes, and never hardlinks
 * mutable matrices/notebooks/uncompressed SAM (.h5ad, .loom, .rds, .ipynb, .sam).
 *
 * @param {object} auditResult Result from auditGenomicsBioinformaticsVault.
 * @return {string} POSIX bash script.
 */
export function buildGenomicsBioinformaticsRemediationScript(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Genomics, Bioinformatics & Scientific Sequencing Data Vault Auditor',
		'# Safe POSIX Remediation Script (default DRY_RUN=1)',
		'# Run with DRY_RUN=0 ./genomics-sequencing-vault-reclaim.sh only after verifying FASTQ.GZ, CRAM, VCF.GZ, and .bai/.tbi archives.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'QUARANTINE_DIR="$' + '{QUARANTINE_DIR:-./.genomics-sam-scratch-quarantine}"',
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
	const strategy = auditResult?.config?.strategy || 'prune-sam-and-pipeline-intermediates'
	for (const cluster of clusters) {
		const actions = (cluster.members || []).filter(m => !m.shielded && (m.action === 'delete' || m.action === 'hardlink'))
		if (actions.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${cluster.name} | Family: ${cluster.familyLabel} | Survivor: ${cluster.survivorPath}`)
		for (const target of actions) {
			actionCount += 1
			if (target.action === 'hardlink' && !target.isMutableFile && !target.isPipelineWorkPath) {
				lines.push(`run_cmd ln -f ${quotePosixPath(cluster.survivorPath)} ${quotePosixPath(target.normalized)}`)
			} else if (strategy === 'quarantine-uncompressed-sam-and-scratch' && (target.isUncompressedSam || target.isPipelineWorkPath)) {
				lines.push('run_cmd mkdir -p "$QUARANTINE_DIR"')
				lines.push(`run_cmd mv -n ${quotePosixPath(target.normalized)} "$QUARANTINE_DIR/"`)
			} else {
				lines.push(`run_cmd rm -f ${quotePosixPath(target.normalized)}`)
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('printf "No reclaimable uncompressed .sam files or Nextflow/Snakemake work intermediates under active sequencing shields.\\n"')
	} else {
		lines.push(`printf "Completed Genomics & Bioinformatics Vault remediation plan (%d target actions, DRY_RUN=%s).\\n" "${actionCount}" "$DRY_RUN"`)
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe RFC-4180 CSV audit report.
 *
 * @param {object} auditResult Result from auditGenomicsBioinformaticsVault.
 * @return {string} RFC-4180 CSV string.
 */
export function buildGenomicsBioinformaticsCsvReport(auditResult) {
	const clusters = Array.isArray(auditResult?.clusters) ? auditResult.clusters : []
	const headers = [
		'cluster_id',
		'cluster_name',
		'pipeline_engine',
		'sequencing_stage',
		'lineage_stem',
		'sample_anchor_key',
		'family',
		'cluster_verdict',
		'has_bam_or_cram_anchor',
		'is_redundant_sam',
		'is_pipeline_work',
		'member_path',
		'artifact_kind',
		'vault_role',
		'genomics_tag',
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
				cluster.pipelineEngine || '',
				cluster.sequencingStage || '',
				cluster.lineageStem,
				cluster.sampleAnchorKey,
				cluster.family,
				cluster.clusterVerdict,
				cluster.hasBamOrCramAnchor ? 'true' : 'false',
				member.isRedundantSamMember ? 'true' : 'false',
				member.isPipelineWorkPath ? 'true' : 'false',
				member.normalized,
				member.artifactKind,
				member.vaultRole,
				member.genomicsTag || '',
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
 * @param {object} auditResult Result from auditGenomicsBioinformaticsVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildGenomicsBioinformaticsJsonManifest(auditResult) {
	const payload = {
		schema: GENOMICS_BIOINFORMATICS_VAULT_SCHEMA,
		generatedAt: new Date().toISOString(),
		config: auditResult?.config || GENOMICS_BIOINFORMATICS_DEFAULT_CONFIG,
		summary: auditResult?.summary || {},
		clusters: (auditResult?.clusters || []).map(cluster => ({
			id: cluster.id,
			name: cluster.name,
			pipelineEngine: cluster.pipelineEngine,
			sequencingStage: cluster.sequencingStage,
			lineageStem: cluster.lineageStem,
			sampleAnchorKey: cluster.sampleAnchorKey,
			family: cluster.family,
			clusterVerdict: cluster.clusterVerdict,
			unitBytes: cluster.unitBytes,
			totalBytes: cluster.totalBytes,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorPath,
			hasProtectedRawReadOrCram: cluster.hasProtectedRawReadOrCram,
			hasProtectedFinalVcf: cluster.hasProtectedFinalVcf,
			hasProtectedIndexSidecar: cluster.hasProtectedIndexSidecar,
			hasRedundantUncompressedSam: cluster.hasRedundantUncompressedSam,
			hasPipelineWorkIntermediate: cluster.hasPipelineWorkIntermediate,
			hasMatrixOrNotebook: cluster.hasMatrixOrNotebook,
			hasBamOrCramAnchor: cluster.hasBamOrCramAnchor,
			genomicsTags: cluster.genomicsTags,
			members: (cluster.members || []).map(member => ({
				path: member.normalized,
				artifactKind: member.artifactKind,
				vaultRole: member.vaultRole,
				genomicsTag: member.genomicsTag || '',
				governanceTier: member.governanceTier,
				action: member.action,
				shielded: member.shielded,
				protectedReason: member.protectedReason,
				isRedundantSamMember: member.isRedundantSamMember,
				isPipelineWorkPath: member.isPipelineWorkPath,
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
 * cloud sync of Nextflow work/ caches, Snakemake .snakemake/ tmp dirs,
 * Jupyter checkpoints, and transient SAM/BAM/FASTQ staging files.
 *
 * @return {string} Line-delimited .sync-exclude.lst rules.
 */
export function buildGenomicsBioinformaticsSyncExcludeList() {
	return [
		'# Nextcloud / rsync exclusion rules for Genomics, Bioinformatics & Sequencing Vaults',
		'work/',
		'.nextflow/',
		'.nextflow.log*',
		'.snakemake/',
		'snakemake_tmp/',
		'.ipynb_checkpoints/',
		'*.sam.tmp',
		'*.bam.tmp.*',
		'*.cram.tmp.*',
		'*.fastq.tmp',
		'*.fq.tmp',
		'*.tbi.tmp',
		'*.csi.tmp',
		'*.tmp',
	].join('\n')
}
