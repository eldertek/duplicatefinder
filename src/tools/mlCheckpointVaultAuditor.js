/**
 * Pure Machine Learning, LLM Weights & Dataset Checkpoint Vault Auditor.
 * Classifies and audits duplicate clusters across 4 ML/LLM engineering vault families:
 * - Best/Final Model Weights & Configs (.safetensors, .ckpt, .pt, .pth, .onnx, .bin, best/, final/, tokenizer.json, config.json)
 * - GGUF Quantizations & Derived Weights (.gguf Q4_K_M/Q8_0/Q5_K_M/Q6_K/F16/BF16 derived from FP16 safetensors)
 * - Intermediate Step Checkpoints (checkpoints/step-*, checkpoint-*, epoch_*, optimizer.pt, scheduler.pt, rng_state.pth)
 * - Datasets & Regenerable ML Caches (.parquet, .arrow, .jsonl, .tfrecord, __pycache__/, .cache/huggingface/, wandb/, lightning_logs/)
 *
 * Strictly conserves best/final model weights, FP16 safetensors masters, and tokenizer.json/config.json sidecars by default,
 * traces GGUF Q4_K_M/Q8_0 quantizations back to FP16 safetensors masters across the vault, and generates POSIX DRY_RUN=1
 * remediation scripts, CWE-1236-safe CSV audits, JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ML_CHECKPOINT_VAULT_SCHEMA = 'duplicatefinder.ml-checkpoint-vault-auditor.v1'

export const ML_CHECKPOINT_FAMILIES = Object.freeze([
	'all',
	'best-final-weights-configs',
	'quantized-gguf-variants',
	'intermediate-step-checkpoints',
	'datasets-and-regenerable-caches',
])

export const ML_CHECKPOINT_FAMILY_META = Object.freeze({
	'best-final-weights-configs': {
		id: 'best-final-weights-configs',
		label: 'Best/Final Weights & Configs',
		shortLabel: 'Masters & Sidecars (.safetensors, .ckpt, .pt, .pth, .onnx, .bin, tokenizer.json, config.json)',
	},
	'quantized-gguf-variants': {
		id: 'quantized-gguf-variants',
		label: 'GGUF Quantizations',
		shortLabel: 'Quantized (.gguf Q4_K_M, Q8_0, Q5_K_M, Q6_K, F16 vs FP16 Safetensors)',
	},
	'intermediate-step-checkpoints': {
		id: 'intermediate-step-checkpoints',
		label: 'Step Checkpoints',
		shortLabel: 'Intermediate (checkpoints/step-*, checkpoint-*, epoch_*, optimizer.pt, scheduler.pt)',
	},
	'datasets-and-regenerable-caches': {
		id: 'datasets-and-regenerable-caches',
		label: 'Datasets & ML Caches',
		shortLabel: 'Datasets & Caches (.parquet, .arrow, .jsonl, .tfrecord, __pycache__/, .cache/huggingface/, wandb/, lightning_logs/)',
	},
})

export const ML_CHECKPOINT_STRATEGIES = Object.freeze([
	'prune-caches-step-ckpts-keep-best',
	'consolidate-vault-hardlinks',
	'prune-regenerable-caches-only',
])

export const ML_CHECKPOINT_SURVIVOR_RULES = Object.freeze([
	'best-final-safetensors-first',
	'newest-checkpoint-first',
	'shortest-path',
])

export const ML_CHECKPOINT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'best-final-weights',
	'tokenizer-configs',
	'gguf-quantized',
	'step-checkpoints',
	'datasets',
	'regenerable-caches',
	'shielded',
])

export const ML_CHECKPOINT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'cache_priority_desc',
	'copies_desc',
	'name_asc',
])

export const ML_CHECKPOINT_PRESETS = Object.freeze([
	{
		id: 'all-ml-checkpoint-vault-audit',
		name: 'All LLM Weights, Checkpoints & Datasets',
		description: 'Audit .safetensors/.gguf/.ckpt/.pt/.pth/.onnx/.bin weights, .parquet/.arrow/.jsonl/.tfrecord datasets, checkpoints/step-* vs best/final, and __pycache__/.cache/huggingface/wandb/lightning_logs caches while shielding best/final weights and tokenizer/config.',
		familyFilter: 'all',
		strategy: 'prune-caches-step-ckpts-keep-best',
		survivorRule: 'best-final-safetensors-first',
		protectBestFinalWeights: true,
		protectTokenizerAndConfig: true,
		protectFp16SafetensorsMaster: true,
		requireFp16MasterForQuantPrune: true,
		protectDatasetShards: false,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-ml-regenerable-caches',
		name: 'Prune __pycache__, HF Hub, wandb & Lightning',
		description: 'Reclaim regenerable __pycache__/, .cache/huggingface/, wandb/, and lightning_logs/ caches while strictly preserving best/final model weights, tokenizer.json, config.json, and dataset shards.',
		familyFilter: 'datasets-and-regenerable-caches',
		strategy: 'prune-regenerable-caches-only',
		survivorRule: 'best-final-safetensors-first',
		protectBestFinalWeights: true,
		protectTokenizerAndConfig: true,
		protectFp16SafetensorsMaster: true,
		requireFp16MasterForQuantPrune: true,
		protectDatasetShards: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-intermediate-step-checkpoints',
		name: 'Prune checkpoints/step-* (Keep best/final)',
		description: 'Target intermediate checkpoints/step-*, optimizer.pt, and scheduler.pt runs while strictly conserving best/final weights, FP16 safetensors masters, and tokenizer/config.',
		familyFilter: 'intermediate-step-checkpoints',
		strategy: 'prune-caches-step-ckpts-keep-best',
		survivorRule: 'newest-checkpoint-first',
		protectBestFinalWeights: true,
		protectTokenizerAndConfig: true,
		protectFp16SafetensorsMaster: true,
		requireFp16MasterForQuantPrune: true,
		protectDatasetShards: false,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'audit-gguf-quants-vs-fp16',
		name: 'GGUF Q4_K_M/Q8_0 vs FP16 Safetensors',
		description: 'Audit GGUF Q4_K_M and Q8_0 quantizations derived from FP16 .safetensors masters, blocking pruning unless a verified FP16 safetensors master exists in the vault.',
		familyFilter: 'quantized-gguf-variants',
		strategy: 'prune-caches-step-ckpts-keep-best',
		survivorRule: 'best-final-safetensors-first',
		protectBestFinalWeights: true,
		protectTokenizerAndConfig: true,
		protectFp16SafetensorsMaster: true,
		requireFp16MasterForQuantPrune: true,
		protectDatasetShards: false,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-ml-vault-hardlinks',
		name: 'Hardlink-Consolidate Onto ML Vault',
		description: 'Consolidate identical model weights, tokenizer configs, and dataset shards onto canonical ML Vault anchors via POSIX hardlinks.',
		familyFilter: 'all',
		strategy: 'consolidate-vault-hardlinks',
		survivorRule: 'best-final-safetensors-first',
		protectBestFinalWeights: true,
		protectTokenizerAndConfig: true,
		protectFp16SafetensorsMaster: true,
		requireFp16MasterForQuantPrune: false,
		protectDatasetShards: false,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const MODEL_WEIGHT_EXT_SET = new Set([
	'safetensors',
	'gguf',
	'ckpt',
	'pt',
	'pth',
	'onnx',
	'bin',
])

const DATASET_EXT_SET = new Set([
	'parquet',
	'arrow',
	'jsonl',
	'tfrecord',
])

const ALWAYS_ML_SIDECAR_FILES = new Set([
	'tokenizer.json',
	'tokenizer_config.json',
	'generation_config.json',
	'special_tokens_map.json',
	'model.safetensors.index.json',
	'pytorch_model.bin.index.json',
	'tokenizer.model',
	'spiece.model',
	'added_tokens.json',
	'adapter_config.json',
	'preprocessor_config.json',
])

const CONTEXTUAL_ML_SIDECAR_FILES = new Set([
	'config.json',
	'vocab.json',
	'merges.txt',
	'trainer_state.json',
])

const REGENERABLE_CACHE_EXT_SET = new Set([
	'pyc',
	'pyo',
])

const REGENERABLE_CACHE_PATH_RE = /(?:^|\/)(?:__pycache__|\.cache\/huggingface|huggingface\/hub|wandb|lightning_logs|\.ipynb_checkpoints|mlruns|tensorboard|tb_logs|\.pytest_cache|\.mypy_cache)(?:\/|$)/i
const STAGING_PATH_RE = /(?:^|\/)(?:downloads?|telechargements?|scratch|staging|temp|tmp|exports?|artifacts[-_ ]?tmp)(?:\/|$)/i
const CANONICAL_VAULT_PATH_RE = /(?:^|\/)(?:ml[-_ ]?vault|llm[-_ ]?vault|models?|weights?|huggingface|hf[-_ ]?models?|release|production|prod|canonical|best|final|datasets?|__groupfolders\/\d+\/(?:ml|llm|ai|models|datasets))(?:\/|$)/i
const INTERMEDIATE_STEP_RE = /(?:^|\/)(?:checkpoints?\/step[-_]?\d+|checkpoint[-_]\d+|step[-_]\d+|global_step\d+|epoch[-_]?\d+)(?:\/|$|[._-])/i
const INTERMEDIATE_STATE_FILE_RE = /^(?:optimizer|scheduler|rng_state|zero_pp_rank_\d+|mp_rank_\d+).*\.(?:pt|pth|ckpt|bin|safetensors)$/i
const BEST_FINAL_MARKER_RE = /(?:^|\/|[._-])(best|final|release|production|prod|canonical|merged)(?:$|\/|[._-])/i
const GGUF_QUANT_RE = /(?:^|[._-])(Q[2-8]_[0-9A-Z_]+|IQ[1-4]_[A-Z0-9_]+|F16|BF16|F32|Q4_K_M|Q5_K_M|Q8_0|Q4_0|Q6_K|Q3_K_M|Q2_K)(?:[._-]|$)/i
const FP16_MASTER_RE = /(?:^|[._/-])(fp16|f16|bf16|bfloat16|float16)(?:[._/-]|$)/i
const ML_CONTEXT_RE = /(?:llm|model|weights?|safetensors|gguf|ckpt|pytorch|onnx|huggingface|hf|llama|mistral|qwen|gemma|deepseek|phi|bert|whisper|flux|sdxl|lora|adapter|tokenizer|checkpoint|wandb|lightning_logs|__pycache__|parquet|arrow|tfrecord|dataset|train|eval)/i
const TFEVENTS_RE = /^events\.out\.tfevents/i
const STEP_NUMBER_RE = /(?:step|checkpoint|epoch|global_step)[-_]?(\d+)/i

const IGNORED_WORKSPACE_SEGMENTS = new Set([
	'files',
	'ml',
	'llm',
	'ai',
	'models',
	'model',
	'weights',
	'checkpoints',
	'checkpoint',
	'best',
	'final',
	'release',
	'production',
	'prod',
	'quantized',
	'gguf',
	'safetensors',
	'datasets',
	'dataset',
	'data',
	'shards',
	'__pycache__',
	'.cache',
	'huggingface',
	'hub',
	'wandb',
	'lightning_logs',
	'mlruns',
	'.ipynb_checkpoints',
	'tensorboard',
	'downloads',
	'telechargements',
	'staging',
	'scratch',
	'tmp',
	'temp',
	'__groupfolders',
	'users',
	'home',
])

/**
 * Normalize path separators safely to POSIX style.
 *
 * @param {string} rawPath Raw file path.
 * @return {string} Normalized POSIX path.
 */
function safeNormalizePath(rawPath) {
	if (!rawPath || typeof rawPath !== 'string') {
		return ''
	}
	return normalizePathForDiff(rawPath).replace(/\\/g, '/')
}

/**
 * Extract basename from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Basename.
 */
function getBasename(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	if (!clean) {
		return ''
	}
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Extract parent directory from a normalized path.
 *
 * @param {string} filePath Normalized path.
 * @return {string} Directory path.
 */
function getDirname(filePath) {
	const clean = safeNormalizePath(filePath).replace(/\/+$/, '')
	const idx = clean.lastIndexOf('/')
	return idx > 0 ? clean.slice(0, idx) : '/'
}

/**
 * Extract lowercase extension without leading dot.
 *
 * @param {string} basename File basename.
 * @return {string} Lowercase extension.
 */
function getExtension(basename) {
	if (!basename || typeof basename !== 'string') {
		return ''
	}
	const lower = basename.toLowerCase()
	if (TFEVENTS_RE.test(lower)) {
		return 'tfevents'
	}
	const dotIdx = lower.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === lower.length - 1) {
		return ''
	}
	return lower.slice(dotIdx + 1)
}

/**
 * Normalize mtime to epoch seconds.
 *
 * @param {number|string|null|undefined} rawMtime Timestamp in seconds or ms.
 * @return {number} Epoch seconds or 0.
 */
function normalizeMtimeSec(rawMtime) {
	const num = Number(rawMtime)
	if (!Number.isFinite(num) || num <= 0) {
		return 0
	}
	return num > 1e12 ? Math.floor(num / 1000) : Math.floor(num)
}

/**
 * Normalize a model or dataset filename + path into a canonical model lineage stem
 * so FP16 safetensors masters, GGUF Q4_K_M/Q8_0 quantizations, best/final weights,
 * tokenizer/config sidecars, and step checkpoints correlate across the vault.
 *
 * @param {string} basename File basename.
 * @param {string} [fullPath=''] Full file path for generic filenames like model.safetensors or config.json.
 * @return {string} Canonical model lineage stem.
 */
export function normalizeModelStem(basename, fullPath = '') {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-model'
	}
	let stem = basename.trim()
	const lowerBase = stem.toLowerCase()
	const genericModelBases = new Set([
		'model.safetensors',
		'pytorch_model.bin',
		'adapter_model.safetensors',
		'adapter_model.bin',
		'model.ckpt',
		'weights.pt',
		'weights.pth',
		'model.onnx',
		'tokenizer.json',
		'config.json',
		'tokenizer_config.json',
		'generation_config.json',
		'special_tokens_map.json',
		'model.safetensors.index.json',
		'pytorch_model.bin.index.json',
		'vocab.json',
		'merges.txt',
		'tokenizer.model',
		'optimizer.pt',
		'scheduler.pt',
		'rng_state.pth',
	])

	if (genericModelBases.has(lowerBase) && fullPath) {
		const segments = safeNormalizePath(fullPath).split('/').filter(Boolean).slice(0, -1)
		for (let i = segments.length - 1; i >= 0; i -= 1) {
			const seg = segments[i].toLowerCase()
			if (
				seg
				&& !IGNORED_WORKSPACE_SEGMENTS.has(seg)
				&& !/^step[-_]?\d+$/i.test(seg)
				&& !/^checkpoint[-_]?\d+$/i.test(seg)
				&& !/^epoch[-_]?\d+$/i.test(seg)
				&& !/^version[-_]?\d+$/i.test(seg)
				&& !/^\d+$/.test(seg)
			) {
				stem = seg
				break
			}
		}
	} else {
		const dotIdx = stem.lastIndexOf('.')
		if (dotIdx > 0) {
			stem = stem.slice(0, dotIdx)
		}
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(
			/(?:\s*\(\d+\)|[._\s-]+(?:Q[2-8]_[0-9A-Z_]+|IQ[1-4]_[A-Z0-9_]+|fp16|bf16|fp32|f16|f32|int8|int4|quant|quantized|best|final|release|prod|production|master|canonical|merged|step[-_]?\d+|checkpoint[-_]?\d+|epoch[-_]?\d+|copy|backup|bak|dup|duplicate|old|tmp|\d{5}-of-\d{5}|v\d+|rev\d+))+$/gi,
			''
		)
	}

	stem = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'ml-artifact'
}

/**
 * Extract model / experiment workspace slug from path segments.
 *
 * @param {string} basename File basename.
 * @param {string} [fullPath=''] Full normalized path.
 * @return {string} Workspace slug.
 */
export function extractModelWorkspace(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const lower = dirSegments[i].toLowerCase()
		if ((lower === 'checkpoints' || lower === 'wandb' || lower === 'lightning_logs' || lower === '__pycache__') && i > 0) {
			const candidate = dirSegments[i - 1].toLowerCase()
			if (candidate && !IGNORED_WORKSPACE_SEGMENTS.has(candidate) && !/^\d+$/.test(candidate)) {
				return candidate.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ml-workspace'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (
			clean
			&& !IGNORED_WORKSPACE_SEGMENTS.has(clean)
			&& !/^step[-_]?\d+$/i.test(clean)
			&& !/^checkpoint[-_]?\d+$/i.test(clean)
			&& !/^epoch[-_]?\d+$/i.test(clean)
			&& !/^\d+$/.test(clean)
		) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'ml-workspace'
		}
	}

	return normalizeModelStem(basename, fullPath)
}

/**
 * Extract ML/LLM framework suite, artifact stage, and quant/precision spec.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path + basename context.
 * @param {string} family Assigned vault family.
 * @return {object} Framework metadata.
 */
export function extractMlCheckpointMetadata(ext, combinedContext, family) {
	let frameworkSuite = 'ML Checkpoint Vault'
	if (ext === 'gguf' || /llama\.cpp|gguf|ollama/i.test(combinedContext)) {
		frameworkSuite = 'llama.cpp / GGUF'
	} else if (ext === 'safetensors' || /\.cache\/huggingface|huggingface\/hub|tokenizer\.json|config\.json/i.test(combinedContext)) {
		frameworkSuite = 'HuggingFace / Safetensors'
	} else if (/wandb/i.test(combinedContext)) {
		frameworkSuite = 'Weights & Biases'
	} else if (/lightning_logs/i.test(combinedContext) || ext === 'ckpt') {
		frameworkSuite = 'PyTorch / Lightning'
	} else if (ext === 'onnx') {
		frameworkSuite = 'ONNX Runtime'
	} else if (ext === 'pt' || ext === 'pth' || ext === 'bin' || /__pycache__/i.test(combinedContext)) {
		frameworkSuite = 'PyTorch / Python'
	} else if (DATASET_EXT_SET.has(ext)) {
		frameworkSuite = 'Dataset Pipeline'
	}

	let artifactStage = 'Model Weights'
	if (family === 'datasets-and-regenerable-caches') {
		if (/\/__pycache__(?:\/|$)/i.test(combinedContext) || ext === 'pyc' || ext === 'pyo') {
			artifactStage = '__pycache__ Bytecode'
		} else if (/\.cache\/huggingface|huggingface\/hub/i.test(combinedContext)) {
			artifactStage = 'HuggingFace Hub Cache'
		} else if (/\/wandb(?:\/|$)/i.test(combinedContext)) {
			artifactStage = 'Weights & Biases Cache'
		} else if (/\/lightning_logs(?:\/|$)/i.test(combinedContext)) {
			artifactStage = 'Lightning Logs Cache'
		} else if (DATASET_EXT_SET.has(ext)) {
			artifactStage = `Dataset Shard (.${ext})`
		} else {
			artifactStage = 'Regenerable ML Cache'
		}
	} else if (family === 'quantized-gguf-variants') {
		artifactStage = 'GGUF Quantized Weights'
	} else if (family === 'intermediate-step-checkpoints') {
		artifactStage = INTERMEDIATE_STATE_FILE_RE.test(combinedContext)
			? 'Optimizer / Scheduler State'
			: 'Intermediate Step Checkpoint'
	} else if (ALWAYS_ML_SIDECAR_FILES.has(getBasename(combinedContext).toLowerCase()) || CONTEXTUAL_ML_SIDECAR_FILES.has(getBasename(combinedContext).toLowerCase())) {
		artifactStage = 'Tokenizer / Model Config'
	} else if (BEST_FINAL_MARKER_RE.test(combinedContext)) {
		artifactStage = 'Best / Final Model Weights'
	} else if (ext === 'safetensors') {
		artifactStage = 'Safetensors Master Weights'
	}

	const quantMatch = GGUF_QUANT_RE.exec(combinedContext)
	const fp16Match = FP16_MASTER_RE.exec(combinedContext)
	const stepMatch = STEP_NUMBER_RE.exec(combinedContext)
	let quantOrPrecisionSpec = 'Weights'
	if (quantMatch) {
		quantOrPrecisionSpec = quantMatch[1].toUpperCase()
	} else if (fp16Match) {
		quantOrPrecisionSpec = fp16Match[1].toUpperCase()
	} else if (stepMatch) {
		quantOrPrecisionSpec = `step-${stepMatch[1]}`
	} else if (BEST_FINAL_MARKER_RE.test(combinedContext)) {
		quantOrPrecisionSpec = 'best/final'
	} else if (DATASET_EXT_SET.has(ext)) {
		quantOrPrecisionSpec = ext.toUpperCase()
	} else if (family === 'datasets-and-regenerable-caches') {
		quantOrPrecisionSpec = 'Regenerable'
	}

	return {
		frameworkSuite,
		artifactStage,
		quantOrPrecisionSpec,
	}
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "4.25 GB").
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted GB string.
 */
export function formatGigabytes(bytes) {
	const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
	const gb = safe / (1024 * 1024 * 1024)
	return `${gb.toFixed(2)} GB`
}

/**
 * Classify a single file into one of the 4 ML, LLM Weights & Dataset Checkpoint Vault families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyMlCheckpointFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const lowerBase = basename.toLowerCase()
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const inRegenerableCachePath = REGENERABLE_CACHE_PATH_RE.test(path)
	const inStagingPath = STAGING_PATH_RE.test(path)
	const inCanonicalVault = CANONICAL_VAULT_PATH_RE.test(path) && !inRegenerableCachePath && !inStagingPath
	const isCacheExt = REGENERABLE_CACHE_EXT_SET.has(ext) || ext === 'tfevents'
	const isRegenerableCache = inRegenerableCachePath || isCacheExt

	const isAlwaysSidecar = ALWAYS_ML_SIDECAR_FILES.has(lowerBase)
	const isContextualSidecar = CONTEXTUAL_ML_SIDECAR_FILES.has(lowerBase) && ML_CONTEXT_RE.test(path)
	const isTokenizerOrConfig = !isRegenerableCache && (isAlwaysSidecar || isContextualSidecar)

	const isDatasetShard = !isRegenerableCache && DATASET_EXT_SET.has(ext)
	const isModelWeightExt = MODEL_WEIGHT_EXT_SET.has(ext)
	const isBinAllowed = ext !== 'bin' || ML_CONTEXT_RE.test(combinedContext) || inCanonicalVault || inRegenerableCachePath
	const isModelWeight = !isRegenerableCache && isModelWeightExt && isBinAllowed

	const isIntermediateStepCheckpoint = !isRegenerableCache
		&& !isTokenizerOrConfig
		&& !isDatasetShard
		&& (
			INTERMEDIATE_STATE_FILE_RE.test(basename)
			|| (INTERMEDIATE_STEP_RE.test(combinedContext) && !BEST_FINAL_MARKER_RE.test(combinedContext))
		)

	const isQuantizedGguf = !isRegenerableCache && !isIntermediateStepCheckpoint && ext === 'gguf'
	const isBestOrFinalWeight = !isRegenerableCache
		&& !isIntermediateStepCheckpoint
		&& (isModelWeight || isTokenizerOrConfig)
		&& BEST_FINAL_MARKER_RE.test(combinedContext)

	const isFp16SafetensorsMaster = !isRegenerableCache
		&& !isIntermediateStepCheckpoint
		&& !inStagingPath
		&& ext === 'safetensors'
		&& (FP16_MASTER_RE.test(combinedContext) || isBestOrFinalWeight || !GGUF_QUANT_RE.test(basename))

	const hasMlContext = isRegenerableCache
		|| isTokenizerOrConfig
		|| isDatasetShard
		|| isModelWeight
		|| isIntermediateStepCheckpoint

	if (!hasMlContext) {
		return null
	}

	let family = 'best-final-weights-configs'
	let artifactKind = 'model-master-weight'
	let artifactKindBadge = `Weight .${ext.toUpperCase()}`
	let formatBadge = ext ? `.${ext.toUpperCase()}` : 'ML'

	if (isRegenerableCache) {
		family = 'datasets-and-regenerable-caches'
		artifactKind = 'regenerable-ml-cache'
		if (/\/__pycache__(?:\/|$)/i.test(path) || ext === 'pyc' || ext === 'pyo') {
			artifactKindBadge = '__pycache__'
		} else if (/\.cache\/huggingface|huggingface\/hub/i.test(path)) {
			artifactKindBadge = '.cache/huggingface'
		} else if (/\/wandb(?:\/|$)/i.test(path)) {
			artifactKindBadge = 'wandb/ Cache'
		} else if (/\/lightning_logs(?:\/|$)/i.test(path)) {
			artifactKindBadge = 'lightning_logs/'
		} else {
			artifactKindBadge = 'ML Cache'
		}
		formatBadge = ext ? `Cache .${ext.toUpperCase()}` : 'ML Cache'
	} else if (isTokenizerOrConfig) {
		family = 'best-final-weights-configs'
		artifactKind = 'tokenizer-config-sidecar'
		artifactKindBadge = lowerBase.includes('tokenizer') ? 'Tokenizer Sidecar' : 'Model Config'
		formatBadge = lowerBase
	} else if (isIntermediateStepCheckpoint) {
		family = 'intermediate-step-checkpoints'
		artifactKind = 'intermediate-step-checkpoint'
		const stepMatch = STEP_NUMBER_RE.exec(combinedContext)
		artifactKindBadge = INTERMEDIATE_STATE_FILE_RE.test(basename)
			? 'Optimizer / State'
			: (stepMatch ? `Step-${stepMatch[1]} Ckpt` : 'Step Checkpoint')
		formatBadge = ext ? `Ckpt .${ext.toUpperCase()}` : 'Step Ckpt'
	} else if (isQuantizedGguf) {
		family = 'quantized-gguf-variants'
		artifactKind = 'gguf-quantized-weight'
		const quantMatch = GGUF_QUANT_RE.exec(combinedContext)
		artifactKindBadge = quantMatch ? `GGUF ${quantMatch[1].toUpperCase()}` : 'GGUF Quant'
		formatBadge = quantMatch ? `GGUF ${quantMatch[1].toUpperCase()}` : 'GGUF'
	} else if (isDatasetShard) {
		family = 'datasets-and-regenerable-caches'
		artifactKind = 'dataset-shard'
		artifactKindBadge = `Dataset .${ext.toUpperCase()}`
		formatBadge = `Dataset .${ext.toUpperCase()}`
	} else {
		family = 'best-final-weights-configs'
		artifactKind = isBestOrFinalWeight ? 'best-final-model-weight' : 'model-master-weight'
		if (isBestOrFinalWeight) {
			artifactKindBadge = `Best/Final .${ext.toUpperCase()}`
		} else if (isFp16SafetensorsMaster) {
			artifactKindBadge = 'FP16 .SAFETENSORS'
		} else {
			artifactKindBadge = `Weights .${ext.toUpperCase()}`
		}
		formatBadge = `.${ext.toUpperCase()}`
	}

	const modelStem = normalizeModelStem(basename, path)
	const modelWorkspace = extractModelWorkspace(basename, path)
	const mlMeta = extractMlCheckpointMetadata(ext, combinedContext, family)
	const stepMatch = STEP_NUMBER_RE.exec(combinedContext)
	const stepNumber = stepMatch ? Number(stepMatch[1]) : null
	const quantMatch = GGUF_QUANT_RE.exec(combinedContext)
	const quantTag = quantMatch ? quantMatch[1].toUpperCase() : ''

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		artifactKindBadge,
		formatBadge,
		modelStem,
		modelWorkspace,
		frameworkSuite: mlMeta.frameworkSuite,
		artifactStage: mlMeta.artifactStage,
		quantOrPrecisionSpec: mlMeta.quantOrPrecisionSpec,
		quantTag,
		stepNumber,
		mtimeSec,
		isModelWeight,
		isBestOrFinalWeight,
		isTokenizerOrConfig,
		isFp16SafetensorsMaster,
		isQuantizedGguf,
		isIntermediateStepCheckpoint,
		isDatasetShard,
		isRegenerableCache,
		inCanonicalVault,
		inRegenerableCachePath,
		inStagingPath,
		vaultKey: `${modelWorkspace}/${modelStem}`,
	}
}

/**
 * Compute deterministic reference timestamp from duplicate groups.
 *
 * @param {Array<object>} duplicateGroups Raw duplicate groups.
 * @return {number} Epoch seconds.
 */
function resolveReferenceNowSec(duplicateGroups) {
	let maxMtimeSec = 0
	for (const group of duplicateGroups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const mtime = normalizeMtimeSec(file && file.mtime)
			if (mtime > maxMtimeSec) {
				maxMtimeSec = mtime
			}
		}
	}
	return maxMtimeSec > 0 ? maxMtimeSec : Math.floor(Date.now() / 1000)
}

/**
 * Score a file copy's authority as canonical ML checkpoint survivor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isBestOrFinalWeight) {
		score += 36
	}
	if (member.meta.isTokenizerOrConfig) {
		score += 34
	}
	if (member.meta.isFp16SafetensorsMaster) {
		score += 30
	}
	if (member.meta.isDatasetShard) {
		score += 18
	}
	if (member.meta.inCanonicalVault) {
		score += 20
	}
	if (member.meta.inRegenerableCachePath || member.meta.isRegenerableCache) {
		score -= 34
	} else if (member.meta.inStagingPath) {
		score -= 22
	} else if (member.meta.isIntermediateStepCheckpoint) {
		score -= 14
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'newest-checkpoint-first' && member.mtimeSec > 0) {
		score += 10
	} else if (survivorRule === 'shortest-path') {
		const depth = member.meta.path.split('/').filter(Boolean).length
		score += Math.max(-15, 18 - depth * 3)
	}

	return Math.max(5, Math.min(100, Math.round(score)))
}

/**
 * Compare two members to pick the canonical survivor.
 *
 * @param {object} a First member.
 * @param {object} b Second member.
 * @param {string} survivorRule Survivor rule.
 * @return {number} Sort comparator result.
 */
function compareSurvivorCandidates(a, b, survivorRule) {
	if (a.isInOriginFolder !== b.isInOriginFolder) {
		return a.isInOriginFolder ? -1 : 1
	}
	if (a.meta.inRegenerableCachePath !== b.meta.inRegenerableCachePath) {
		return a.meta.inRegenerableCachePath ? 1 : -1
	}
	if (a.meta.isBestOrFinalWeight !== b.meta.isBestOrFinalWeight) {
		return a.meta.isBestOrFinalWeight ? -1 : 1
	}
	if (a.meta.isTokenizerOrConfig !== b.meta.isTokenizerOrConfig) {
		return a.meta.isTokenizerOrConfig ? -1 : 1
	}
	if (a.meta.isFp16SafetensorsMaster !== b.meta.isFp16SafetensorsMaster) {
		return a.meta.isFp16SafetensorsMaster ? -1 : 1
	}
	if (a.meta.inCanonicalVault !== b.meta.inCanonicalVault) {
		return a.meta.inCanonicalVault ? -1 : 1
	}
	if (a.meta.inStagingPath !== b.meta.inStagingPath) {
		return a.meta.inStagingPath ? 1 : -1
	}
	if (survivorRule === 'newest-checkpoint-first' && a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	if (survivorRule === 'shortest-path' && a.meta.path.length !== b.meta.path.length) {
		return a.meta.path.length - b.meta.path.length
	}
	if (a.authorityScore !== b.authorityScore) {
		return b.authorityScore - a.authorityScore
	}
	if (a.mtimeSec !== b.mtimeSec) {
		return b.mtimeSec - a.mtimeSec
	}
	return a.meta.path.localeCompare(b.meta.path)
}

/**
 * Analyze duplicate groups for Machine Learning, LLM Weights & Dataset Checkpoint Vault governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeMlCheckpointVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = ML_CHECKPOINT_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = ML_CHECKPOINT_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = ML_CHECKPOINT_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = ML_CHECKPOINT_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-caches-step-ckpts-keep-best'
	const survivorRule = ML_CHECKPOINT_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'best-final-safetensors-first'

	const protectBestFinalWeights = options.protectBestFinalWeights !== false
	const protectTokenizerAndConfig = options.protectTokenizerAndConfig !== false
	const protectFp16SafetensorsMaster = options.protectFp16SafetensorsMaster !== false
	const requireFp16MasterForQuantPrune = options.requireFp16MasterForQuantPrune !== false
	const protectDatasetShards = options.protectDatasetShards === true
	const keepRecentCheckpoints = Number.isFinite(Number(options.keepRecentCheckpoints)) && Number(options.keepRecentCheckpoints) >= 0
		? Number(options.keepRecentCheckpoints)
		: 2
	const staleCacheDays = Number.isFinite(Number(options.staleCacheDays)) && Number(options.staleCacheDays) >= 0
		? Number(options.staleCacheDays)
		: 14
	const minSizeMb = Number.isFinite(Number(options.minSizeMb)) && Number(options.minSizeMb) > 0
		? Number(options.minSizeMb)
		: 0
	const minSizeBytes = minSizeMb * 1024 * 1024
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const memberOverrides = options.memberOverrides && typeof options.memberOverrides === 'object'
		? options.memberOverrides
		: {}

	const referenceNowSec = Number.isFinite(Number(options.referenceNowSec)) && Number(options.referenceNowSec) > 0
		? Number(options.referenceNowSec)
		: resolveReferenceNowSec(groups)

	const preClassifiedGroups = []
	const fp16SafetensorsStems = new Set()
	const bestFinalModelStems = new Set()
	const tokenizerConfigStems = new Set()

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyMlCheckpointFile(file)
			if (!meta) {
				continue
			}
			if (meta.isFp16SafetensorsMaster) {
				fp16SafetensorsStems.add(meta.modelStem)
			}
			if (meta.isBestOrFinalWeight) {
				bestFinalModelStems.add(meta.modelStem)
			}
			if (meta.isTokenizerOrConfig) {
				tokenizerConfigStems.add(meta.modelStem)
			}

			const size = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Number(file.size)
				: (Number.isFinite(Number(group.size)) ? Number(group.size) : 0)
			const mtimeSec = normalizeMtimeSec(file.mtime)
			const ageDays = mtimeSec > 0 ? Math.max(0, Math.round(((referenceNowSec - mtimeSec) / 86400) * 10) / 10) : 0
			const selectionKey = getFileSelectionKey(file)

			const member = {
				file,
				id: file.id ?? file.nodeId ?? selectionKey,
				selectionKey,
				path: meta.path,
				basename: meta.basename,
				size,
				formattedSize: formatBytes(size),
				mtimeSec,
				formattedMtime: formatFileModifiedTime(mtimeSec),
				ageDays,
				isInOriginFolder: Boolean(file.isInOriginFolder),
				meta,
				authorityScore: 0,
				verdict: 'keep-canonical-survivor',
				verdictReason: '',
				actionType: 'keep',
			}
			member.authorityScore = computeMemberAuthorityScore(member, survivorRule)
			classifiedMembers.push(member)
		}

		if (classifiedMembers.length >= 2) {
			preClassifiedGroups.push({ group, files, classifiedMembers })
		}
	}

	const allClusters = []

	for (const entry of preClassifiedGroups) {
		const { group, files, classifiedMembers } = entry
		classifiedMembers.sort((a, b) => compareSurvivorCandidates(a, b, survivorRule))
		const survivor = classifiedMembers[0]
		const primaryMeta = survivor.meta
		const family = primaryMeta.family
		const familyMeta = ML_CHECKPOINT_FAMILY_META[family] || ML_CHECKPOINT_FAMILY_META['best-final-weights-configs']

		const hasFp16MasterInCluster = classifiedMembers.some(m => m.meta.isFp16SafetensorsMaster)
		const hasFp16SafetensorsMaster = hasFp16MasterInCluster || fp16SafetensorsStems.has(primaryMeta.modelStem)
		const hasBestOrFinalInCluster = classifiedMembers.some(m => m.meta.isBestOrFinalWeight)
		const hasBestOrFinalInVault = hasBestOrFinalInCluster || bestFinalModelStems.has(primaryMeta.modelStem)
		const hasTokenizerConfigInCluster = classifiedMembers.some(m => m.meta.isTokenizerOrConfig)
		const hasTokenizerConfigInVault = hasTokenizerConfigInCluster || tokenizerConfigStems.has(primaryMeta.modelStem)
		const hasQuantizedGgufInCluster = classifiedMembers.some(m => m.meta.isQuantizedGguf)
		const hasStepCheckpointInCluster = classifiedMembers.some(m => m.meta.isIntermediateStepCheckpoint)
		const hasDatasetShardInCluster = classifiedMembers.some(m => m.meta.isDatasetShard)
		const hasRegenerableCacheInCluster = classifiedMembers.some(m => m.meta.isRegenerableCache)
		const isDerivedGgufQuantFromFp16 = hasQuantizedGgufInCluster && hasFp16SafetensorsMaster

		let duplicationClass = 'model-weight-master'
		let duplicationBadge = primaryMeta.artifactKindBadge
		let lineageBadge = 'Canonical Model Anchor'

		if (family === 'datasets-and-regenerable-caches') {
			if (hasRegenerableCacheInCluster) {
				duplicationClass = 'regenerable-cache'
				duplicationBadge = primaryMeta.artifactKindBadge
				lineageBadge = hasBestOrFinalInVault || hasFp16SafetensorsMaster
					? 'Regenerable Cache (Weights Intact)'
					: 'Regenerable ML Runtime Cache'
			} else {
				duplicationClass = 'dataset-shard'
				duplicationBadge = primaryMeta.artifactKindBadge
				lineageBadge = 'Dataset Shard Duplicate'
			}
		} else if (family === 'intermediate-step-checkpoints') {
			duplicationClass = 'step-checkpoint'
			duplicationBadge = primaryMeta.artifactKindBadge
			lineageBadge = hasBestOrFinalInVault
				? 'Intermediate Step (best/final Conserved)'
				: 'Training Step Checkpoint'
		} else if (family === 'quantized-gguf-variants') {
			duplicationClass = 'gguf-quantized'
			duplicationBadge = primaryMeta.artifactKindBadge
			lineageBadge = hasFp16SafetensorsMaster
				? 'Derived from FP16 Safetensors'
				: 'Unverified FP16 Safetensors Master'
		} else if (hasTokenizerConfigInCluster) {
			duplicationClass = 'tokenizer-config'
			duplicationBadge = primaryMeta.artifactKindBadge
			lineageBadge = hasBestOrFinalInVault || hasFp16SafetensorsMaster
				? 'Bound to Conserved Model Weights'
				: 'Tokenizer / Config Anchor'
		} else {
			duplicationClass = 'model-weight-master'
			duplicationBadge = primaryMeta.artifactKindBadge
			lineageBadge = hasTokenizerConfigInVault
				? 'Best/Final Weights + Tokenizer/Config'
				: 'Model Weight Master Anchor'
		}

		let reclaimableBytes = 0
		let reclaimableCopiesCount = 0
		let consolidatableCopiesCount = 0
		let shieldedCopiesCount = 0

		classifiedMembers.forEach((member, idx) => {
			const override = memberOverrides[member.selectionKey] || 'auto'

			if (idx === 0) {
				member.verdict = 'keep-canonical-survivor'
				member.actionType = 'keep'
				if (member.meta.isBestOrFinalWeight) {
					member.verdictReason = `Canonical best/final weights (${member.meta.formatBadge})`
				} else if (member.meta.isTokenizerOrConfig) {
					member.verdictReason = `Canonical tokenizer/config sidecar (${member.basename})`
				} else if (member.meta.isFp16SafetensorsMaster) {
					member.verdictReason = `Canonical FP16 safetensors master (${member.meta.quantOrPrecisionSpec})`
				} else if (member.meta.isQuantizedGguf) {
					member.verdictReason = `Primary ${member.meta.artifactKindBadge} anchor`
				} else if (member.meta.isDatasetShard) {
					member.verdictReason = `Canonical dataset shard (${member.meta.formatBadge})`
				} else {
					member.verdictReason = 'Highest-authority ML checkpoint survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by ML engineer'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-vault-hardlinks'
					? 'consolidate-hardlink-ml-asset'
					: 'reclaim-duplicate-ml-asset'
				member.actionType = strategy === 'consolidate-vault-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Operator override: marked for controlled remediation'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				if (member.actionType === 'hardlink') {
					consolidatableCopiesCount += 1
				}
				return
			}

			if (member.isInOriginFolder) {
				member.verdict = 'blocked-origin-folder'
				member.actionType = 'keep'
				member.verdictReason = 'Protected Nextcloud origin folder'
				shieldedCopiesCount += 1
				return
			}

			if (protectBestFinalWeights && member.meta.isBestOrFinalWeight && strategy !== 'consolidate-vault-hardlinks') {
				member.verdict = 'blocked-best-final-weights'
				member.actionType = 'keep'
				member.verdictReason = `Strict best/final weight conservation active (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (protectTokenizerAndConfig && member.meta.isTokenizerOrConfig && strategy !== 'consolidate-vault-hardlinks') {
				member.verdict = 'blocked-tokenizer-config'
				member.actionType = 'keep'
				member.verdictReason = `Strict tokenizer/config conservation active (${member.basename})`
				shieldedCopiesCount += 1
				return
			}

			if (protectFp16SafetensorsMaster && member.meta.isFp16SafetensorsMaster && strategy !== 'consolidate-vault-hardlinks') {
				member.verdict = 'blocked-fp16-master-safetensors'
				member.actionType = 'keep'
				member.verdictReason = 'Strict FP16 safetensors master conservation active'
				shieldedCopiesCount += 1
				return
			}

			if (
				member.meta.isRegenerableCache
				&& member.ageDays < staleCacheDays
				&& strategy === 'prune-regenerable-caches-only'
			) {
				member.verdict = 'blocked-recent-ml-cache'
				member.actionType = 'keep'
				member.verdictReason = `Recent ML cache (${member.ageDays}d < ${staleCacheDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			if (strategy === 'consolidate-vault-hardlinks') {
				member.verdict = 'consolidate-hardlink-ml-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} canonical anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-regenerable-caches-only') {
				if (member.meta.isRegenerableCache) {
					member.verdict = 'reclaim-regenerable-ml-cache'
					member.actionType = 'prune'
					member.verdictReason = `Stale regenerable ${member.meta.artifactStage}`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside regenerable ML cache sweep scope'
				shieldedCopiesCount += 1
				return
			}

			if (member.meta.isRegenerableCache) {
				member.verdict = 'reclaim-regenerable-ml-cache'
				member.actionType = 'prune'
				member.verdictReason = `Regenerable ${member.meta.artifactStage} (weights & configs intact)`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isIntermediateStepCheckpoint) {
				if (member.ageDays < staleCacheDays && !hasBestOrFinalInVault && keepRecentCheckpoints > 0) {
					member.verdict = 'blocked-recent-step-checkpoint'
					member.actionType = 'keep'
					member.verdictReason = `Recent step checkpoint (${member.ageDays}d < ${staleCacheDays}d; keepRecent=${keepRecentCheckpoints})`
					shieldedCopiesCount += 1
					return
				}
				member.verdict = 'reclaim-intermediate-step-checkpoint'
				member.actionType = 'prune'
				member.verdictReason = hasBestOrFinalInVault
					? 'Redundant intermediate step-* checkpoint (best/final weights conserved)'
					: 'Duplicate intermediate training step-* checkpoint'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isQuantizedGguf) {
				if (requireFp16MasterForQuantPrune && !hasFp16SafetensorsMaster) {
					member.verdict = 'blocked-unverified-fp16-master'
					member.actionType = 'keep'
					member.verdictReason = 'Blocked: no verified FP16 safetensors master conserved for this model'
					shieldedCopiesCount += 1
					return
				}
				member.verdict = 'reclaim-quantized-gguf-twin'
				member.actionType = 'prune'
				member.verdictReason = hasFp16SafetensorsMaster
					? `Duplicate ${member.meta.artifactKindBadge} (FP16 safetensors master verified)`
					: `Duplicate ${member.meta.artifactKindBadge} copy`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isDatasetShard) {
				if (protectDatasetShards) {
					member.verdict = 'blocked-dataset-shard'
					member.actionType = 'keep'
					member.verdictReason = `Dataset shard conservation active (${member.meta.formatBadge})`
					shieldedCopiesCount += 1
					return
				}
				member.verdict = 'reclaim-dataset-shard-copy'
				member.actionType = 'prune'
				member.verdictReason = `Duplicate dataset shard copy (${member.meta.formatBadge})`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-ml-asset'
			member.actionType = 'prune'
			member.verdictReason = 'Duplicate model artifact outside conservation shield'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasBestOrFinalInCluster) {
				riskState = 'best-final-protected'
				riskPriority = 6
			} else if (hasTokenizerConfigInCluster) {
				riskState = 'tokenizer-config-protected'
				riskPriority = 5
			} else if (hasFp16MasterInCluster) {
				riskState = 'fp16-master-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (duplicationClass === 'regenerable-cache') {
			riskState = 'cache-reclaimable'
			riskPriority = 5
		} else if (duplicationClass === 'step-checkpoint') {
			riskState = 'step-ckpt-reclaimable'
			riskPriority = 4
		} else if (duplicationClass === 'gguf-quantized') {
			riskState = 'gguf-quant-reclaimable'
			riskPriority = 4
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			modelWorkspace: primaryMeta.modelWorkspace,
			modelStem: primaryMeta.modelStem,
			frameworkSuite: primaryMeta.frameworkSuite,
			artifactStage: primaryMeta.artifactStage,
			quantOrPrecisionSpec: primaryMeta.quantOrPrecisionSpec,
			formatBadge: primaryMeta.formatBadge,
			duplicationClass,
			duplicationBadge,
			lineageBadge,
			hasFp16SafetensorsMaster,
			hasBestOrFinalInCluster,
			hasBestOrFinalInVault,
			hasTokenizerConfigInCluster,
			hasTokenizerConfigInVault,
			hasQuantizedGgufInCluster,
			isDerivedGgufQuantFromFp16,
			hasStepCheckpointInCluster,
			hasDatasetShardInCluster,
			hasRegenerableCacheInCluster,
			vaultKey: primaryMeta.vaultKey,
			displayName: survivor.basename,
			riskState,
			riskPriority,
			copiesCount: classifiedMembers.length,
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableGb: formatGigabytes(reclaimableBytes),
			rawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(rawDuplicateBytes),
			reclaimableCopiesCount,
			consolidatableCopiesCount,
			shieldedCopiesCount,
			survivor,
			members: classifiedMembers,
		})
	}

	const familyBreakdown = Object.keys(ML_CHECKPOINT_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: ML_CHECKPOINT_FAMILY_META[famId].label,
			shortLabel: ML_CHECKPOINT_FAMILY_META[famId].shortLabel,
			clustersCount: famClusters.length,
			reclaimableBytes: famReclaim,
			formattedReclaimableBytes: formatBytes(famReclaim),
		}
	})

	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}
		if (minSizeBytes > 0 && cluster.survivor.size < minSizeBytes) {
			return false
		}
		if (verdictFilter !== 'all') {
			if (verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
				return false
			}
			if (verdictFilter === 'best-final-weights' && !cluster.hasBestOrFinalInCluster) {
				return false
			}
			if (verdictFilter === 'tokenizer-configs' && !cluster.hasTokenizerConfigInCluster) {
				return false
			}
			if (verdictFilter === 'gguf-quantized' && !cluster.hasQuantizedGgufInCluster) {
				return false
			}
			if (verdictFilter === 'step-checkpoints' && !cluster.hasStepCheckpointInCluster) {
				return false
			}
			if (verdictFilter === 'datasets' && !cluster.hasDatasetShardInCluster) {
				return false
			}
			if (verdictFilter === 'regenerable-caches' && !cluster.hasRegenerableCacheInCluster) {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.modelWorkspace,
				cluster.modelStem,
				cluster.frameworkSuite,
				cluster.artifactStage,
				cluster.quantOrPrecisionSpec,
				cluster.duplicationBadge,
				cluster.lineageBadge,
				cluster.formatBadge,
				cluster.vaultKey,
				cluster.displayName,
				...cluster.members.map(m => m.path),
			].join(' ').toLowerCase()
			if (!haystack.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'cache_priority_desc') {
			const classWeight = {
				'regenerable-cache': 5,
				'step-checkpoint': 4,
				'gguf-quantized': 3,
				'dataset-shard': 2,
				'tokenizer-config': 1,
				'model-weight-master': 0,
			}
			const diff = (classWeight[b.duplicationClass] || 0) - (classWeight[a.duplicationClass] || 0)
			if (diff !== 0) {
				return diff
			}
			if (a.riskPriority !== b.riskPriority) {
				return b.riskPriority - a.riskPriority
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'copies_desc') {
			if (a.copiesCount !== b.copiesCount) {
				return b.copiesCount - a.copiesCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.displayName.localeCompare(b.displayName)
		}
		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (a.rawDuplicateBytes !== b.rawDuplicateBytes) {
			return b.rawDuplicateBytes - a.rawDuplicateBytes
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const totalRawDuplicateBytes = filteredClusters.reduce((acc, c) => acc + c.rawDuplicateBytes, 0)
	const totalReclaimableBytes = filteredClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
	const totalFilesCount = filteredClusters.reduce((acc, c) => acc + c.copiesCount, 0)
	const totalReclaimableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.reclaimableCopiesCount, 0)
	const totalConsolidatableCopiesCount = filteredClusters.reduce((acc, c) => acc + c.consolidatableCopiesCount, 0)
	const totalShieldedCopiesCount = filteredClusters.reduce((acc, c) => acc + c.shieldedCopiesCount, 0)
	const totalBestFinalClusters = filteredClusters.filter(c => c.hasBestOrFinalInCluster).length
	const totalTokenizerConfigClusters = filteredClusters.filter(c => c.hasTokenizerConfigInCluster).length
	const totalGgufQuantClusters = filteredClusters.filter(c => c.hasQuantizedGgufInCluster).length
	const totalStepCheckpointClusters = filteredClusters.filter(c => c.hasStepCheckpointInCluster).length
	const totalDatasetClusters = filteredClusters.filter(c => c.hasDatasetShardInCluster).length
	const totalRegenerableCacheClusters = filteredClusters.filter(c => c.hasRegenerableCacheInCluster).length
	const distinctModelStemsCount = new Set(filteredClusters.map(c => c.modelStem)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: ML_CHECKPOINT_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectBestFinalWeights,
			protectTokenizerAndConfig,
			protectFp16SafetensorsMaster,
			requireFp16MasterForQuantPrune,
			protectDatasetShards,
			keepRecentCheckpoints,
			staleCacheDays,
			minSizeMb,
			searchQuery,
		},
		summary: {
			totalClustersCount: filteredClusters.length,
			totalUnfilteredClustersCount: allClusters.length,
			totalFilesCount,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			reclaimableGb: formatGigabytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalConsolidatableCopiesCount,
			totalShieldedCopiesCount,
			totalBestFinalClusters,
			totalTokenizerConfigClusters,
			totalGgufQuantClusters,
			totalStepCheckpointClusters,
			totalDatasetClusters,
			totalRegenerableCacheClusters,
			distinctModelStemsCount,
			efficiencyPct,
		},
		familyBreakdown,
		clusters: filteredClusters,
	}
}

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string.
 * @return {string} POSIX single-quoted string.
 */
function shellQuote(value) {
	const str = String(value ?? '')
	return `'${str.replace(/'/g, '\'\\\'\'')}'`
}

/**
 * Join Nextcloud data root and normalized artifact path cleanly.
 *
 * @param {string} dataRoot Nextcloud data root directory.
 * @param {string} relPath Artifact path.
 * @return {string} Combined POSIX path.
 */
function joinDataRoot(dataRoot, relPath) {
	const root = String(dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '')
	const cleanRel = safeNormalizePath(relPath).replace(/^\/+/, '')
	return `${root}/${cleanRel}`
}

/**
 * Build a safe POSIX DRY_RUN=1 remediation script for ML, LLM Weights & Dataset Checkpoint cleanup.
 *
 * @param {object} analysis Output of analyzeMlCheckpointVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildMlCheckpointVaultRemediationScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').trim() || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const summary = (analysis && analysis.summary) || {
		totalClustersCount: 0,
		formattedReclaimableBytes: '0 B',
		reclaimableGb: '0.00 GB',
		totalReclaimableCopiesCount: 0,
	}

	const lines = [
		'#!/usr/bin/env sh',
		'set -eu',
		'# DuplicateFinder Machine Learning, LLM Weights & Dataset Checkpoint Vault Remediation Script',
		`# Schema: ${ML_CHECKPOINT_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
		'# Strict conservation: best/final weights, FP16 safetensors masters, and tokenizer.json/config.json are never removed by default.',
		'# Default is safe dry-run mode. Run with DRY_RUN=0 sh script.sh to apply.',
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'',
		'run_cmd() {',
		'  if [ "$DRY_RUN" = "0" ]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY_RUN=1] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	let actionCount = 0

	for (const cluster of clusters) {
		const targets = (cluster.members || []).filter(m => m.actionType === 'prune' || m.actionType === 'hardlink')
		if (!targets.length) {
			continue
		}
		const anchorPath = joinDataRoot(dataRoot, cluster.survivor.path)
		lines.push(`# ML Vault: ${cluster.vaultKey} [${cluster.duplicationBadge} / ${cluster.frameworkSuite}] (${cluster.formattedReclaimableBytes})`)
		lines.push(`# Anchor: ${anchorPath}`)

		for (const target of targets) {
			const targetPath = joinDataRoot(dataRoot, target.path)
			actionCount += 1
			if (target.actionType === 'hardlink') {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd ln -f ${shellQuote(anchorPath)} ${shellQuote(targetPath)}`)
				lines.push('fi')
			} else {
				lines.push(`if [ -f ${shellQuote(anchorPath)} ] && [ -f ${shellQuote(targetPath)} ]; then`)
				lines.push(`  run_cmd rm -f ${shellQuote(targetPath)}`)
				lines.push('fi')
			}
		}
		lines.push('')
	}

	if (actionCount === 0) {
		lines.push('# No actionable step checkpoints, GGUF twins, dataset copies, or caches under active best/final and tokenizer/config shields.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeMlCheckpointVault.
 * @return {string} CSV content.
 */
export function buildMlCheckpointVaultCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'ModelWorkspace',
		'ModelStem',
		'DuplicationClass',
		'DerivedGgufFromFp16',
		'LineageStatus',
		'FrameworkSuite',
		'ArtifactStage',
		'QuantOrPrecision',
		'Family',
		'Format',
		'Fp16SafetensorsMasterVerified',
		'BestFinalVerified',
		'TokenizerConfigVerified',
		'Verdict',
		'Action',
		'AuthorityScore',
		'SizeBytes',
		'Path',
		'Reason',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			rows.push([
				cluster.modelWorkspace,
				cluster.modelStem,
				cluster.duplicationClass,
				cluster.isDerivedGgufQuantFromFp16 ? 'yes' : 'no',
				cluster.lineageBadge,
				cluster.frameworkSuite,
				cluster.artifactStage,
				cluster.quantOrPrecisionSpec,
				cluster.family,
				member.meta.formatBadge,
				cluster.hasFp16SafetensorsMaster ? 'yes' : 'no',
				cluster.hasBestOrFinalInVault ? 'yes' : 'no',
				cluster.hasTokenizerConfigInVault ? 'yes' : 'no',
				member.verdict,
				member.actionType,
				String(member.authorityScore),
				String(member.size),
				member.path,
				member.verdictReason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}

/**
 * Build a structured JSON audit manifest.
 *
 * @param {object} analysis Output of analyzeMlCheckpointVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildMlCheckpointVaultJsonReport(analysis) {
	const payload = {
		schema: ML_CHECKPOINT_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			modelWorkspace: cluster.modelWorkspace,
			modelStem: cluster.modelStem,
			frameworkSuite: cluster.frameworkSuite,
			artifactStage: cluster.artifactStage,
			quantOrPrecisionSpec: cluster.quantOrPrecisionSpec,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			duplicationClass: cluster.duplicationClass,
			duplicationBadge: cluster.duplicationBadge,
			lineageBadge: cluster.lineageBadge,
			hasFp16SafetensorsMaster: cluster.hasFp16SafetensorsMaster,
			hasBestOrFinalInVault: cluster.hasBestOrFinalInVault,
			hasTokenizerConfigInVault: cluster.hasTokenizerConfigInVault,
			isDerivedGgufQuantFromFp16: cluster.isDerivedGgufQuantFromFp16,
			riskState: cluster.riskState,
			reclaimableBytes: cluster.reclaimableBytes,
			reclaimableGb: cluster.reclaimableGb,
			rawDuplicateBytes: cluster.rawDuplicateBytes,
			members: (cluster.members || []).map(m => ({
				path: m.path,
				size: m.size,
				artifactKind: m.meta.artifactKind,
				authorityScore: m.authorityScore,
				verdict: m.verdict,
				actionType: m.actionType,
				verdictReason: m.verdictReason,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for ML/LLM caches,
 * intermediate training checkpoints, and telemetry directories.
 *
 * @param {object} analysis Output of analyzeMlCheckpointVault.
 * @return {string} Sync exclude rules.
 */
export function buildMlCheckpointVaultSyncExcludeSnippet(analysis) {
	const cacheCount = analysis && analysis.summary ? analysis.summary.totalRegenerableCacheClusters : 0
	const stepCount = analysis && analysis.summary ? analysis.summary.totalStepCheckpointClusters : 0
	return [
		'# DuplicateFinder Machine Learning, LLM Weights & Checkpoint Sync Exclusions',
		`# Detected regenerable cache clusters: ${cacheCount} | step-* checkpoint clusters: ${stepCount}`,
		'__pycache__/',
		'*.pyc',
		'*.pyo',
		'.cache/huggingface/',
		'huggingface/hub/',
		'wandb/',
		'lightning_logs/',
		'checkpoints/step-*/',
		'checkpoint-*/',
		'.ipynb_checkpoints/',
		'mlruns/',
		'tensorboard/',
		'tb_logs/',
		'events.out.tfevents.*',
		'*.tmp',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
