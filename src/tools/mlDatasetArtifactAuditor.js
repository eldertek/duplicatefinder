/**
 * Pure ML Weights, Quantized Checkpoints & Dataset Shard Auditor.
 * Classifies and audits duplicate clusters across 4 machine learning and data engineering families:
 * - Model Master Weights & Sidecars (.safetensors, .bin weights, .onnx, .pt/.pth outside checkpoints, release/production, config.json, tokenizer.json, model.safetensors.index.json, SHA256SUMS)
 * - Quantized Weight Variants (.gguf Q4_K_M/Q5_K_M/Q8_0/F16, .awq, .exl2 sharing model lineage)
 * - Training Step Checkpoints (checkpoint-1000/, step-005000/, epoch_03/, optimizer.pt, scheduler.pt, rng_state.pth)
 * - Dataset Shards & Notebook/Hub Caches (.parquet, .arrow, .hdf5, .h5, .tfrecord, .ipynb_checkpoints/, mlruns/, wandb/run-*, .cache/huggingface/)
 *
 * Assigns 5 governance tiers:
 * - model-master-anchor (Canonical release/production master weights; strictly protected by default)
 * - model-sidecar-manifest (Tokenizer, config, safetensors index, or SHA256SUMS sidecar; strictly protected by default)
 * - quantized-variant (Quantized .gguf/.awq/.exl2 variant; deletion blocked unless a verified master weight or conserved SHA-256 twin is present)
 * - training-step-checkpoint (Intermediate training step checkpoint, optimizer, scheduler, or RNG state)
 * - dataset-shard-or-cache (Dataset shard .parquet/.arrow/.hdf5/.h5/.tfrecord or reconstructible .ipynb_checkpoints/mlruns/wandb/huggingface cache)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const ML_DATASET_ARTIFACT_SCHEMA = 'duplicatefinder.ml-dataset-artifact-auditor.v1'

export const ML_DATASET_ARTIFACT_FAMILIES = Object.freeze([
	'all',
	'model-master-weights',
	'quantized-weight-variants',
	'training-step-checkpoints',
	'dataset-shards-and-notebook-caches',
])

export const ML_DATASET_ARTIFACT_FAMILY_META = Object.freeze({
	'model-master-weights': {
		id: 'model-master-weights',
		label: 'Model Master Weights & Sidecars',
		shortLabel: 'Masters (.safetensors/.bin/.onnx/.pt/config.json/tokenizer.json/SHA256SUMS)',
	},
	'quantized-weight-variants': {
		id: 'quantized-weight-variants',
		label: 'Quantized Weight Variants',
		shortLabel: 'Quantized (.gguf Q4_K_M/Q5_K_M/Q8_0/F16/.awq/.exl2)',
	},
	'training-step-checkpoints': {
		id: 'training-step-checkpoints',
		label: 'Training Step Checkpoints',
		shortLabel: 'Checkpoints (checkpoint-*/step-*/epoch_*/optimizer.pt/scheduler.pt/rng_state.pth)',
	},
	'dataset-shards-and-notebook-caches': {
		id: 'dataset-shards-and-notebook-caches',
		label: 'Dataset Shards & Notebook/Hub Caches',
		shortLabel: 'Shards & Caches (.parquet/.arrow/.hdf5/.tfrecord/.ipynb_checkpoints/mlruns/wandb/.cache/huggingface)',
	},
})

export const ML_DATASET_ARTIFACT_STRATEGIES = Object.freeze([
	'prune-intermediate-step-checkpoints',
	'consolidate-quantized-model-twins',
	'prune-notebook-and-hub-caches',
])

export const ML_DATASET_ARTIFACT_SURVIVOR_RULES = Object.freeze([
	'model-master-and-release-first',
	'sidecar-and-tokenizer-first',
	'quantized-lineage-first',
	'newest-checkpoint-first',
	'shortest-path',
])

export const ML_DATASET_ARTIFACT_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'model-master',
	'sidecar-manifest',
	'quantized-variant',
	'step-checkpoint',
	'dataset-shard-cache',
	'shielded',
])

export const ML_DATASET_ARTIFACT_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const ML_DATASET_ARTIFACT_PRESETS = Object.freeze([
	{
		id: 'all-ml-dataset-artifact-audit',
		name: 'All ML Weights & Dataset Audit',
		description: 'Audit master model weights, quantized GGUF/AWQ/EXL2 variants, intermediate training checkpoints, dataset shards, and notebook/hub caches while shielding model masters and sidecars.',
		familyFilter: 'all',
		strategy: 'consolidate-quantized-model-twins',
		survivorRule: 'model-master-and-release-first',
		protectModelMasters: true,
		protectSidecarManifests: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-intermediate-step-checkpoints',
		name: 'Prune Intermediate Step Checkpoints',
		description: 'Reclaim stale checkpoint-*/step-*/epoch_* directories, optimizer.pt, scheduler.pt, and rng_state.pth older than threshold while keeping recent checkpoints and release masters.',
		familyFilter: 'training-step-checkpoints',
		strategy: 'prune-intermediate-step-checkpoints',
		survivorRule: 'newest-checkpoint-first',
		protectModelMasters: true,
		protectSidecarManifests: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-quantized-model-twins',
		name: 'Consolidate Verified Quantized Twins & Shards',
		description: 'Consolidate duplicate .gguf, .awq, .exl2, and dataset shard copies only when a verified model master weight or conserved SHA-256 twin exists.',
		familyFilter: 'quantized-weight-variants',
		strategy: 'consolidate-quantized-model-twins',
		survivorRule: 'model-master-and-release-first',
		protectModelMasters: true,
		protectSidecarManifests: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-notebook-and-hub-caches',
		name: 'Prune Notebook, MLflow, W&B & HF Caches',
		description: 'Reclaim stale .ipynb_checkpoints/, mlruns/, wandb/run-*, and .cache/huggingface/ caches while protecting dataset shards and model masters.',
		familyFilter: 'dataset-shards-and-notebook-caches',
		strategy: 'prune-notebook-and-hub-caches',
		survivorRule: 'newest-checkpoint-first',
		protectModelMasters: true,
		protectSidecarManifests: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'model-master-sidecar-shield',
		name: 'Release Master & Tokenizer Integrity Shield',
		description: 'Inspect release/ and production/ model masters (.safetensors/.onnx/.pt/.bin) alongside config.json, tokenizer.json, and SHA256SUMS under strict protection.',
		familyFilter: 'model-master-weights',
		strategy: 'consolidate-quantized-model-twins',
		survivorRule: 'model-master-and-release-first',
		protectModelMasters: true,
		protectSidecarManifests: true,
		keepRecentCheckpoints: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const MASTER_WEIGHT_EXT_SET = new Set(['safetensors', 'onnx', 'pt', 'pth'])
const QUANTIZED_EXT_SET = new Set(['gguf', 'awq', 'exl2'])
const DATASET_SHARD_EXT_SET = new Set(['parquet', 'arrow', 'hdf5', 'h5', 'tfrecord', 'tfrecords'])

const ML_SIDECAR_FILENAMES = new Set([
	'config.json',
	'tokenizer.json',
	'tokenizer_config.json',
	'special_tokens_map.json',
	'generation_config.json',
	'model.safetensors.index.json',
	'pytorch_model.bin.index.json',
	'preprocessor_config.json',
	'adapter_config.json',
	'quantize_config.json',
])

const ML_BIN_BASENAME_RE = /^(?:pytorch_model|model|weights?|consolidated|adapter_model|lora|vocab|merges|ggml|embedding|tokenizer)[-_.\da-z]*\.bin$/i
const ML_WEIGHT_DIR_RE = /(\/(?:models?|weights?|release|releases|production|prod|huggingface|hf[-_ ]?models?|transformers?|llm|llms|lora|adapters?|model[-_ ]?vault|serving|inference)(?:\/|$)|\/__groupfolders\/\d+\/(?:models?|model[-_ ]?vault|release|production))/i
const RELEASE_PRODUCTION_PATH_RE = /(\/(?:release|releases|production|prod|model[-_ ]?vault|golden[-_ ]?models?)(?:\/|$)|\/__groupfolders\/\d+\/(?:release|production|model[-_ ]?vault))/i

const TRAINING_STEP_DIR_RE = /\/(?:checkpoints?|checkpoint[-_ ]\d+|step[-_ ]\d+|epoch[-_ ]?\d+)(?:\/|$)/i
const OPTIMIZER_STATE_FILE_RE = /^(?:optimizer|scheduler|scaler)(?:[-_.]\w+)*\.(?:pt|pth|bin|safetensors)$|^rng_state(?:[-_.]\w+)*\.(?:pt|pth)$|^trainer_state\.json$|^training_args\.bin$|^zero_pp_rank_\d+.*\.(?:pt|pth|bin)$/i

const NOTEBOOK_HUB_CACHE_DIR_RE = /\/(?:\.ipynb_checkpoints|mlruns|wandb\/run-[^/]+|\.cache\/huggingface)(?:\/|$)/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/)/i
const NON_ML_SYSTEM_PATH_RE = /^\/(?:etc|usr|var\/log|node_modules)\//i

const QUANT_TAG_RE = /(?:^|[_\-.\s])(q[2-8]_[k01]_[msl]|q[2-8]_0|q[2-8]_1|iq[1-4]_[a-z0-9]+|f16|fp16|bf16|fp32|f32|int4|int8|awq|exl2|gptq|gguf)(?=$|[_\-.\s])/gi
const SHARD_SUFFIX_RE = /(?:-\d{4,6}-of-\d{4,6}|[-_.]part[-_]?\d+|[-_.]shard[-_]?\d+)/gi
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi
const TRAILING_ML_EXT_RE = /\.(safetensors|bin|onnx|pt|pth|gguf|awq|exl2|parquet|arrow|hdf5|h5|tfrecord|tfrecords|sha256|json|tmp|part)$/i
const LINEAGE_STRIP_TAG_RE = /(?:^|[_\-.\s])(copy|backup|mirror|staging|tmp|temp|part|export|release|production|master|quantized|verified)(?=$|[_\-.\s])/gi
const STRICT_SHA256_HEX_RE = /^[a-f0-9]{64}$/i
const STEP_NUMBER_RE = /(?:checkpoint|step|epoch)[-_ ]?(\d+)/i

const TIER_LABELS = Object.freeze({
	'model-master-anchor': 'Model Master Weights',
	'model-sidecar-manifest': 'Model Sidecar & Checksum',
	'quantized-variant': 'Quantized Weight Variant',
	'training-step-checkpoint': 'Training Step Checkpoint',
	'dataset-shard-or-cache': 'Dataset Shard / Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'model-master-anchor': 99,
	'model-sidecar-manifest': 95,
	'quantized-variant': 68,
	'dataset-shard-or-cache': 44,
	'training-step-checkpoint': 18,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Model Anchor',
	'consolidate-to-model-master': 'Consolidate Verified Twin to Anchor',
	'reclaim-step-checkpoint': 'Prune Intermediate Step Checkpoint',
	'reclaim-notebook-hub-cache': 'Prune Stale Notebook / Hub Cache',
	'blocked-model-master-weights': 'Blocked: Model Master Weights Guard',
	'blocked-sidecar-manifest': 'Blocked: Sidecar & Tokenizer Guard',
	'blocked-unverified-model-master': 'Blocked: No Verified Master or Twin Conserved',
	'blocked-recent-step-checkpoint': 'Shielded: Recent Training Checkpoint',
	'blocked-fresh-notebook-cache': 'Shielded: Recent Notebook / Hub Cache',
	'blocked-not-step-checkpoint': 'Shielded: Non-Checkpoint ML Asset',
	'blocked-not-notebook-cache': 'Shielded: Non-Cache ML Asset',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'model-master-weights': 4,
	'quantized-weight-variants': 3,
	'training-step-checkpoints': 2,
	'dataset-shards-and-notebook-caches': 1,
})

/**
 * Quote a POSIX shell argument safely using single quotes.
 *
 * @param {string} value Raw string value.
 * @return {string} Single-quoted POSIX literal.
 */
export function escapePosixSingleQuote(value) {
	return `'${String(value ?? '').replace(/'/g, "'\\''")}'`
}

/**
 * Parse a timestamp field into epoch seconds.
 *
 * @param {*} value Candidate timestamp value.
 * @return {number|null} Epoch seconds or null when missing or invalid.
 */
function parseTimestampSeconds(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? Math.floor(ms / 1000) : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value < 0) {
			return null
		}
		return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const n = Number(trimmed)
			if (!Number.isFinite(n) || n < 0) {
				return null
			}
			return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file record.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Epoch seconds or null.
 */
function getFileMtimeSeconds(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestampSeconds(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Extract basename from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} File basename.
 */
function extractBasename(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Extract parent directory from a normalized file path.
 *
 * @param {string} normalizedPath Normalized path.
 * @return {string} Lowercase parent directory path or '/'.
 */
function extractParentDir(normalizedPath) {
	const raw = String(normalizedPath || '').replace(/\/+$/, '')
	const idx = raw.lastIndexOf('/')
	if (idx <= 0) {
		return '/'
	}
	return raw.slice(0, idx).toLowerCase()
}

/**
 * Extract lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractExtension(lowerBase) {
	if (lowerBase.endsWith('.safetensors.index.json') || lowerBase.endsWith('.bin.index.json')) {
		return 'index.json'
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Check whether a basename matches a SHA256SUMS manifest file.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {boolean} True when file is a SHA256SUMS manifest.
 */
function isSha256SumsBasename(lowerBase) {
	return lowerBase === 'sha256sums' || lowerBase === 'sha256sums.txt' || lowerBase === 'sha256sums.asc'
}

/**
 * Normalize a model or dataset stem into a canonical modelLineageStem.
 *
 * @param {string} rawStem Raw stem without outer extension.
 * @return {string} Clean canonical modelLineageStem.
 */
function normalizeModelLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.replace(SHARD_SUFFIX_RE, '')
		.trim()

	let prev
	do {
		prev = stem
		stem = stem.replace(TRAILING_ML_EXT_RE, '')
	} while (stem !== prev)

	do {
		prev = stem
		stem = stem.replace(QUANT_TAG_RE, '')
	} while (stem !== prev)

	do {
		prev = stem
		stem = stem.replace(LINEAGE_STRIP_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '-')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Extract quantization tag (e.g., Q4_K_M, Q5_K_M, Q8_0, F16, AWQ, EXL2) from basename or path.
 *
 * @param {string} rawBase Raw basename.
 * @param {string} ext Extracted extension.
 * @return {string} Uppercase quantization label or empty string.
 */
function extractQuantTag(rawBase, ext) {
	const match = String(rawBase || '').match(/(?:^|[_\-.\s])(q[2-8]_[k01]_[msl]|q[2-8]_0|q[2-8]_1|iq[1-4]_[a-z0-9]+|f16|fp16|bf16|fp32|int4|int8)(?=$|[_\-.\s])/i)
	if (match) {
		return match[1].toUpperCase()
	}
	if (ext === 'awq' || ext === 'exl2') {
		return ext.toUpperCase()
	}
	if (ext === 'gguf') {
		return 'GGUF'
	}
	return ''
}

/**
 * Parse ML weight, quantized variant, training checkpoint, dataset shard, and notebook cache metadata.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed modelLineageStem, tags, format flags, and governance cues.
 */
export function parseMlDatasetArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const ext = extractExtension(lowerBase)
	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isNotebookHubCachePath = NOTEBOOK_HUB_CACHE_DIR_RE.test(lowerPath)
	const isTrainingStepDirPath = TRAINING_STEP_DIR_RE.test(lowerPath)
	const isOptimizerStateFile = OPTIMIZER_STATE_FILE_RE.test(lowerBase)
	const isReleaseProductionPath = RELEASE_PRODUCTION_PATH_RE.test(lowerPath)
	const isMlWeightDirPath = ML_WEIGHT_DIR_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)
	const isNonMlSystemPath = NON_ML_SYSTEM_PATH_RE.test(lowerPath)

	const isQuantizedExt = QUANTIZED_EXT_SET.has(ext)
	const isDatasetShardExt = DATASET_SHARD_EXT_SET.has(ext)
	const isBinWeight = ext === 'bin' && !isOptimizerStateFile && (ML_BIN_BASENAME_RE.test(lowerBase) || isMlWeightDirPath || isReleaseProductionPath)
	const isDirectMasterExt = MASTER_WEIGHT_EXT_SET.has(ext)
	const isMlSidecarFile = !isNonMlSystemPath && (
		ML_SIDECAR_FILENAMES.has(lowerBase)
		|| isSha256SumsBasename(lowerBase)
		|| (ext === 'sha256' && (isMlWeightDirPath || isReleaseProductionPath || /\.(?:safetensors|bin|onnx|pt|pth|gguf|awq|exl2|parquet|arrow|hdf5|h5|tfrecord)\.sha256$/i.test(lowerBase)))
	)

	const isNotebookOrHubCache = isNotebookHubCachePath
	const isTrainingStepCandidate = Boolean(
		!isNotebookOrHubCache
		&& (isTrainingStepDirPath || isOptimizerStateFile)
	)
	const isQuantizedCandidate = Boolean(
		!isNotebookOrHubCache
		&& !isTrainingStepCandidate
		&& isQuantizedExt
	)
	const isDatasetShardCandidate = Boolean(
		!isNotebookOrHubCache
		&& !isTrainingStepCandidate
		&& !isQuantizedCandidate
		&& isDatasetShardExt
	)
	const isDatasetOrCacheCandidate = Boolean(
		isNotebookOrHubCache
		|| isDatasetShardCandidate
	)
	const isModelMasterCandidate = Boolean(
		!isNotebookOrHubCache
		&& !isTrainingStepCandidate
		&& !isQuantizedCandidate
		&& !isDatasetShardCandidate
		&& (isDirectMasterExt || isBinWeight)
	)
	const isSidecarManifestCandidate = Boolean(
		!isNotebookOrHubCache
		&& !isTrainingStepCandidate
		&& !isQuantizedCandidate
		&& !isDatasetShardCandidate
		&& !isModelMasterCandidate
		&& isMlSidecarFile
	)

	const stepMatch = lowerPath.match(STEP_NUMBER_RE)
	const stepNumber = stepMatch ? Number.parseInt(stepMatch[1], 10) : null
	const quantTag = extractQuantTag(rawBase, ext)

	const parentFolderName = extractBasename(extractParentDir(normalizedPath))
	const isGenericModelFile = /^(?:model|pytorch_model|consolidated|adapter_model|config|tokenizer|tokenizer_config|special_tokens_map|generation_config|model\.safetensors\.index|pytorch_model\.bin\.index|sha256sums)$/i.test(cleanRawStem)
	const effectiveStemSource = (isGenericModelFile || isMlSidecarFile) && parentFolderName && !/^(?:release|releases|production|prod|models?|weights?|downloads?|staging)$/i.test(parentFolderName)
		? parentFolderName
		: cleanRawStem

	const modelLineageStem = isSha256SumsBasename(lowerBase) && !parentFolderName
		? 'SHA256SUMS'
		: (normalizeModelLineageStem(effectiveStemSource) || effectiveStemSource || rawBase)

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isModelMasterCandidate) {
		pushTag(ext ? `master:${ext}` : 'master:weights')
		if (isReleaseProductionPath) {
			pushTag('release-vault')
		}
	}
	if (isSidecarManifestCandidate) {
		pushTag(isSha256SumsBasename(lowerBase) || ext === 'sha256' ? 'sidecar:SHA256SUMS' : `sidecar:${lowerBase}`)
	}
	if (isQuantizedCandidate) {
		pushTag(`quant:${ext}`)
		if (quantTag && quantTag !== ext.toUpperCase()) {
			pushTag(`precision:${quantTag}`)
		}
	}
	if (isTrainingStepCandidate) {
		pushTag(isOptimizerStateFile ? `state:${lowerBase}` : 'checkpoint:step')
		if (stepNumber !== null) {
			pushTag(`step:${stepNumber}`)
		}
	}
	if (isDatasetShardCandidate) {
		pushTag(`shard:${ext}`)
	}
	if (isNotebookOrHubCache) {
		if (lowerPath.includes('/.ipynb_checkpoints/')) {
			pushTag('cache:ipynb_checkpoints')
		} else if (lowerPath.includes('/mlruns/')) {
			pushTag('cache:mlruns')
		} else if (lowerPath.includes('/wandb/')) {
			pushTag('cache:wandb')
		} else {
			pushTag('cache:huggingface')
		}
	}

	return {
		rawStem: cleanRawStem,
		modelLineageStem,
		extension: ext,
		quantTag,
		stepNumber,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isNotebookHubCachePath,
		isTrainingStepDirPath,
		isOptimizerStateFile,
		isReleaseProductionPath,
		isMlWeightDirPath,
		isStagingBloatPath,
		isQuantizedExt,
		isDatasetShardExt,
		isBinWeight,
		isDirectMasterExt,
		isMlSidecarFile,
		isNotebookOrHubCache,
		isTrainingStepCandidate,
		isQuantizedCandidate,
		isDatasetShardCandidate,
		isDatasetOrCacheCandidate,
		isModelMasterCandidate,
		isSidecarManifestCandidate,
	}
}

/**
 * Build dataset-wide verification hints for conserved model masters, sidecars, and release anchors.
 * Respects operator exclude overrides so excluded masters or checksums are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset verification hints.
 */
function buildDatasetMlArtifactHints(duplicates, memberOverrides = {}) {
	const masterLineageStems = new Set()
	const sidecarLineageStems = new Set()
	const checksumFolders = new Set()
	const releaseStems = new Set()

	for (let groupIdx = 0; groupIdx < duplicates.length; groupIdx += 1) {
		const group = duplicates[groupIdx]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (let fileIdx = 0; fileIdx < group.files.length; fileIdx += 1) {
			const file = group.files[fileIdx]
			if (!file || typeof file !== 'object' || !file.path) {
				continue
			}
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (memberOverrides[selectionKey] === 'exclude') {
				continue
			}

			const normalized = normalizePathForDiff(file.path) || String(file.path)
			const info = parseMlDatasetArtifactInfo(extractBasename(normalized), normalized)
			if (info.isStagingBloatPath || info.isNotebookOrHubCache || info.isTrainingStepCandidate) {
				continue
			}

			const stemLower = info.modelLineageStem.toLowerCase()
			const parentDir = extractParentDir(normalized)

			if (info.isModelMasterCandidate) {
				if (stemLower) {
					masterLineageStems.add(stemLower)
				}
				if (info.isReleaseProductionPath && stemLower) {
					releaseStems.add(stemLower)
				}
			}

			if (info.isSidecarManifestCandidate) {
				checksumFolders.add(parentDir)
				if (stemLower && stemLower !== 'sha256sums') {
					sidecarLineageStems.add(stemLower)
				}
			}
		}
	}

	return {
		masterLineageStems,
		sidecarLineageStems,
		checksumFolders,
		releaseStems,
	}
}

/**
 * Classify a file path into one of the 4 ML Weights, Quantized Checkpoints & Dataset Shard families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyMlDatasetArtifact(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseMlDatasetArtifactInfo(basename, normalized)

	if (info.isDatasetOrCacheCandidate) {
		return {
			matched: true,
			family: 'dataset-shards-and-notebook-caches',
			familyLabel: ML_DATASET_ARTIFACT_FAMILY_META['dataset-shards-and-notebook-caches'].label,
			...info,
		}
	}

	if (info.isTrainingStepCandidate) {
		return {
			matched: true,
			family: 'training-step-checkpoints',
			familyLabel: ML_DATASET_ARTIFACT_FAMILY_META['training-step-checkpoints'].label,
			...info,
		}
	}

	if (info.isQuantizedCandidate) {
		return {
			matched: true,
			family: 'quantized-weight-variants',
			familyLabel: ML_DATASET_ARTIFACT_FAMILY_META['quantized-weight-variants'].label,
			...info,
		}
	}

	if (info.isModelMasterCandidate || info.isSidecarManifestCandidate) {
		return {
			matched: true,
			family: 'model-master-weights',
			familyLabel: ML_DATASET_ARTIFACT_FAMILY_META['model-master-weights'].label,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, master/checksum verification status, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentCheckpoints, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster master/checksum verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectMlDatasetMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseMlDatasetArtifactInfo(basename, normalizedPath)
	const parentDir = extractParentDir(normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isNotebookOrHubCache = Boolean(parsed.isNotebookOrHubCache)
	const isDatasetShard = Boolean(!isNotebookOrHubCache && (parsed.isDatasetShardCandidate || (classification.family === 'dataset-shards-and-notebook-caches' && parsed.isDatasetShardExt)))
	const isTrainingStepCheckpoint = Boolean(!isNotebookOrHubCache && !isDatasetShard && (parsed.isTrainingStepCandidate || classification.family === 'training-step-checkpoints'))
	const isQuantizedVariant = Boolean(!isNotebookOrHubCache && !isDatasetShard && !isTrainingStepCheckpoint && (parsed.isQuantizedCandidate || classification.family === 'quantized-weight-variants'))
	const isSidecarManifest = Boolean(!isNotebookOrHubCache && !isDatasetShard && !isTrainingStepCheckpoint && !isQuantizedVariant && parsed.isSidecarManifestCandidate)
	const isModelMasterWeight = Boolean(
		!isNotebookOrHubCache
		&& !isDatasetShard
		&& !isTrainingStepCheckpoint
		&& !isQuantizedVariant
		&& !isSidecarManifest
		&& !parsed.isStagingBloatPath
		&& (parsed.isModelMasterCandidate || classification.family === 'model-master-weights' || (file && file.isModelMaster === true))
	)

	const stemLower = parsed.modelLineageStem.toLowerCase()
	const hasConservedSidecar = Boolean(
		isSidecarManifest
		|| (stemLower && clusterHints.sidecarLineageStems && clusterHints.sidecarLineageStems.has(stemLower))
		|| (clusterHints.checksumFolders && clusterHints.checksumFolders.has(parentDir))
	)
	const hasConservedModelMaster = Boolean(
		isModelMasterWeight
		|| clusterHints.clusterHasConservedMaster
		|| (stemLower && clusterHints.masterLineageStems && clusterHints.masterLineageStems.has(stemLower))
		|| (stemLower && clusterHints.releaseStems && clusterHints.releaseStems.has(stemLower))
	)
	const hasConservedSizeAndHashTwin = Boolean(
		(file && (file.sha256Verified === true || file.sizeHashVerified === true))
		|| clusterHints.clusterHasVerifiedSizeAndHash
	)
	const hasVerifiedModelMasterTwin = Boolean(
		hasConservedModelMaster
		|| hasConservedSidecar
		|| hasConservedSizeAndHashTwin
	)

	const isStaleArtifact = ageDays === null || ageDays >= options.staleCacheDays
	const isFreshArtifact = ageDays !== null && ageDays < options.staleCacheDays

	let tier = 'dataset-shard-or-cache'
	if (isModelMasterWeight) {
		tier = 'model-master-anchor'
	} else if (isSidecarManifest) {
		tier = 'model-sidecar-manifest'
	} else if (isQuantizedVariant) {
		tier = 'quantized-variant'
	} else if (isTrainingStepCheckpoint) {
		tier = 'training-step-checkpoint'
	} else {
		tier = 'dataset-shard-or-cache'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 30
	if (isModelMasterWeight && parsed.isReleaseProductionPath) {
		authorityScore = 100
	} else if (isSidecarManifest && parsed.isReleaseProductionPath) {
		authorityScore = 97
	}
	if (isQuantizedVariant && hasVerifiedModelMasterTwin) {
		authorityScore += 8
	}
	if (isDatasetShard) {
		authorityScore += 10
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 20
	}
	if (isNotebookOrHubCache && isStaleArtifact) {
		authorityScore -= 10
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['dataset-shard-or-cache'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		modelLineageStem: parsed.modelLineageStem,
		quantTag: parsed.quantTag,
		stepNumber: parsed.stepNumber,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isModelMasterWeight,
		isSidecarManifest,
		isQuantizedVariant,
		isTrainingStepCheckpoint,
		isDatasetShard,
		isNotebookOrHubCache,
		isReleaseProductionPath: parsed.isReleaseProductionPath,
		isStagingBloatPath: parsed.isStagingBloatPath,
		hasConservedSidecar,
		hasConservedModelMaster,
		hasConservedSizeAndHashTwin,
		hasVerifiedModelMasterTwin,
		isStaleArtifact,
		isFreshArtifact,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside an ML & Dataset duplicate cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected canonical survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'sidecar-and-tokenizer-first') {
			if (a.context.isSidecarManifest !== b.context.isSidecarManifest) {
				return a.context.isSidecarManifest ? -1 : 1
			}
		} else if (survivorRule === 'quantized-lineage-first') {
			if (a.context.isQuantizedVariant !== b.context.isQuantizedVariant) {
				return a.context.isQuantizedVariant ? -1 : 1
			}
		} else if (survivorRule === 'newest-checkpoint-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
			const stepA = a.context.stepNumber ?? -1
			const stepB = b.context.stepNumber ?? -1
			if (stepA !== stepB) {
				return stepB - stepA
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
		} else {
			if (a.context.isReleaseProductionPath !== b.context.isReleaseProductionPath) {
				return a.context.isReleaseProductionPath ? -1 : 1
			}
		}

		if (a.context.authorityScore !== b.context.authorityScore) {
			return b.context.authorityScore - a.context.authorityScore
		}

		const tsA = a.context.mtimeSec ?? 0
		const tsB = b.context.mtimeSec ?? 0
		if (tsA !== tsB) {
			return tsB - tsA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic audit verdict for an ML & Dataset cluster member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @param {Map<string, number>} checkpointRankMap Zero-based recency rank for checkpoint members.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys, checkpointRankMap) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from ML weights and dataset audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative ML artifact anchor.`,
		}
	}

	if (forceKeepKeys.has(member.selectionKey)) {
		return {
			verdict: 'blocked-manual-shield',
			verdictLabel: VERDICT_LABELS['blocked-manual-shield'],
			actionKind: 'shield',
			note: 'Protected by manual Shield Copy override.',
		}
	}

	if (options.protectModelMasters && member.context.isModelMasterWeight) {
		return {
			verdict: 'blocked-model-master-weights',
			verdictLabel: VERDICT_LABELS['blocked-model-master-weights'],
			actionKind: 'shield',
			note: 'Strictly protected by Model Master Weights Guard; release/production master weights are never pruned automatically.',
		}
	}

	if (options.protectSidecarManifests && member.context.isSidecarManifest) {
		return {
			verdict: 'blocked-sidecar-manifest',
			verdictLabel: VERDICT_LABELS['blocked-sidecar-manifest'],
			actionKind: 'shield',
			note: 'Strictly protected by Sidecar & Tokenizer Guard; config.json, tokenizer.json, safetensors index, and SHA256SUMS are conserved.',
		}
	}

	if (options.strategy === 'prune-intermediate-step-checkpoints') {
		if (!member.context.isTrainingStepCheckpoint) {
			return {
				verdict: 'blocked-not-step-checkpoint',
				verdictLabel: VERDICT_LABELS['blocked-not-step-checkpoint'],
				actionKind: 'shield',
				note: 'Shielded by Step Checkpoint Pruner because member is not an intermediate checkpoint, optimizer, scheduler, or rng_state artifact.',
			}
		}
		const rank = checkpointRankMap.has(member.selectionKey) ? checkpointRankMap.get(member.selectionKey) : 999
		if (member.context.isFreshArtifact || rank < options.keepRecentCheckpoints) {
			return {
				verdict: 'blocked-recent-step-checkpoint',
				verdictLabel: VERDICT_LABELS['blocked-recent-step-checkpoint'],
				actionKind: 'shield',
				note: `Shielded because checkpoint is within keepRecentCheckpoints (${options.keepRecentCheckpoints}) or newer than stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-step-checkpoint',
			verdictLabel: VERDICT_LABELS['reclaim-step-checkpoint'],
			actionKind: 'reclaim',
			note: 'Intermediate training step checkpoint or optimizer/scheduler/rng_state duplicate safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-notebook-and-hub-caches') {
		if (!member.context.isNotebookOrHubCache) {
			return {
				verdict: 'blocked-not-notebook-cache',
				verdictLabel: VERDICT_LABELS['blocked-not-notebook-cache'],
				actionKind: 'shield',
				note: 'Shielded by Notebook & Hub Cache Pruner because member is not in .ipynb_checkpoints/, mlruns/, wandb/run-*, or .cache/huggingface/.',
			}
		}
		if (member.context.isFreshArtifact) {
			return {
				verdict: 'blocked-fresh-notebook-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-notebook-cache'],
				actionKind: 'shield',
				note: `Shielded because notebook or hub cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-notebook-hub-cache',
			verdictLabel: VERDICT_LABELS['reclaim-notebook-hub-cache'],
			actionKind: 'reclaim',
			note: 'Stale .ipynb_checkpoints, mlruns, wandb, or Hugging Face hub cache safe to prune after SHA-256 check.',
		}
	}

	if ((member.context.isQuantizedVariant || member.context.isDatasetShard) && !member.context.hasVerifiedModelMasterTwin) {
		return {
			verdict: 'blocked-unverified-model-master',
			verdictLabel: VERDICT_LABELS['blocked-unverified-model-master'],
			actionKind: 'shield',
			note: 'Blocked because no verified model master weight, conserved SHA256SUMS/index sidecar, or matching size+hash twin is conserved.',
		}
	}

	if (member.context.isTrainingStepCheckpoint) {
		const rank = checkpointRankMap.has(member.selectionKey) ? checkpointRankMap.get(member.selectionKey) : 999
		if (member.context.isFreshArtifact || rank < options.keepRecentCheckpoints) {
			return {
				verdict: 'blocked-recent-step-checkpoint',
				verdictLabel: VERDICT_LABELS['blocked-recent-step-checkpoint'],
				actionKind: 'shield',
				note: `Shielded because checkpoint is within keepRecentCheckpoints (${options.keepRecentCheckpoints}) or newer than stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-step-checkpoint',
			verdictLabel: VERDICT_LABELS['reclaim-step-checkpoint'],
			actionKind: 'reclaim',
			note: 'Intermediate training step checkpoint or optimizer/scheduler/rng_state duplicate safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isNotebookOrHubCache) {
		if (member.context.isFreshArtifact) {
			return {
				verdict: 'blocked-fresh-notebook-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-notebook-cache'],
				actionKind: 'shield',
				note: `Shielded because notebook or hub cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-notebook-hub-cache',
			verdictLabel: VERDICT_LABELS['reclaim-notebook-hub-cache'],
			actionKind: 'reclaim',
			note: 'Stale .ipynb_checkpoints, mlruns, wandb, or Hugging Face hub cache safe to prune after SHA-256 check.',
		}
	}

	return {
		verdict: 'consolidate-to-model-master',
		verdictLabel: VERDICT_LABELS['consolidate-to-model-master'],
		actionKind: 'consolidate',
		note: 'Consolidate verified identical-hash quantized model or dataset shard copy against canonical anchor using sha256sum and stat cross-device guard.',
	}
}

/**
 * Normalize ML Weights & Dataset Artifact auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = ML_DATASET_ARTIFACT_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = ML_DATASET_ARTIFACT_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = ML_DATASET_ARTIFACT_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = ML_DATASET_ARTIFACT_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-quantized-model-twins'
	const survivorRule = ML_DATASET_ARTIFACT_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'model-master-and-release-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentCheckpoints, 10)
	const keepRecentCheckpoints = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 2

	const parsedDays = Number.parseInt(rawOptions.staleCacheDays, 10)
	const staleCacheDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 14

	const parsedMinMb = Number.parseFloat(rawOptions.minSizeMb)
	const minSizeMb = Number.isFinite(parsedMinMb) && parsedMinMb >= 0
		? parsedMinMb
		: 0

	const refTime = Number(rawOptions.referenceTimeSec)
	const referenceTimeSec = Number.isFinite(refTime) && refTime > 0
		? Math.floor(refTime)
		: Math.floor(Date.now() / 1000)

	return {
		familyFilter,
		verdictFilter,
		sortMode,
		strategy,
		survivorRule,
		protectModelMasters: rawOptions.protectModelMasters !== false,
		protectSidecarManifests: rawOptions.protectSidecarManifests !== false,
		keepRecentCheckpoints,
		staleCacheDays,
		minSizeMb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

/**
 * Audit duplicate groups for ML Model Weights, Quantized Variants, Step Checkpoints, Dataset Shards & Caches.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeMlDatasetArtifactDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetMlArtifactHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'model-master-weights': 0,
		'quantized-weight-variants': 0,
		'training-step-checkpoints': 0,
		'dataset-shards-and-notebook-caches': 0,
	}

	const rawClusters = []

	for (let groupIdx = 0; groupIdx < safeDuplicates.length; groupIdx += 1) {
		const group = safeDuplicates[groupIdx]
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const validFiles = group.files.filter(f => f && typeof f === 'object')
		if (validFiles.length < 2) {
			continue
		}

		const matchedEntries = []
		for (let fileIdx = 0; fileIdx < validFiles.length; fileIdx += 1) {
			const file = validFiles[fileIdx]
			const info = classifyMlDatasetArtifact(file.path)
			if (info && info.matched) {
				matchedEntries.push({ file, fileIdx, info })
			}
		}

		if (matchedEntries.length === 0) {
			continue
		}

		const primaryEntry = [...matchedEntries].sort((a, b) => {
			return (FAMILY_PRIORITY[b.info.family] || 0) - (FAMILY_PRIORITY[a.info.family] || 0)
		})[0]
		const primaryInfo = primaryEntry.info

		const rawInfo = computeGroupReclaimableInfo(group)
		const groupSizeBytes = Number(group.size) || validFiles.reduce((max, f) => Math.max(max, Number(f.size) || 0), 0)
		if (minSizeBytes > 0 && groupSizeBytes < minSizeBytes) {
			continue
		}

		const nonExcludedFiles = validFiles.filter((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			return options.memberOverrides[selectionKey] !== 'exclude'
		})

		const clusterHasConservedMaster = nonExcludedFiles.some(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseMlDatasetArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isTrainingStepCandidate
				&& !parsed.isNotebookOrHubCache
				&& !parsed.isStagingBloatPath
				&& (parsed.isModelMasterCandidate || file.isModelMaster === true)
			)
		})

		const groupHashStr = String(group.hash || '').trim()
		const hasStrictGroupSha256 = STRICT_SHA256_HEX_RE.test(groupHashStr) || group.sha256Verified === true
		const nonStagingConservedWithSize = nonExcludedFiles.filter(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseMlDatasetArtifactInfo(extractBasename(normalized), normalized)
			const fileSize = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			return Boolean(!parsed.isStagingBloatPath && !parsed.isNotebookOrHubCache && fileSize > 0 && (groupSizeBytes <= 0 || fileSize === groupSizeBytes))
		})
		const clusterHasVerifiedSizeAndHash = Boolean(
			(hasStrictGroupSha256 && nonStagingConservedWithSize.length >= 1)
			|| nonStagingConservedWithSize.some(file => file.sha256Verified === true || file.sizeHashVerified === true)
		)

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyMlDatasetArtifact(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectMlDatasetMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedMaster,
					clusterHasVerifiedSizeAndHash,
				}
			)
			const size = Number.isFinite(Number(file.size)) ? Number(file.size) : groupSizeBytes
			const formattedMtime = formatFileModifiedTime(context.mtimeSec !== null ? context.mtimeSec : file.mtime)

			return {
				selectionKey,
				fileId: file.id ?? null,
				rawPath: String(file.path || ''),
				normalizedPath,
				basename,
				extension: context.extension || memberInfo.extension,
				family: memberInfo.family,
				familyLabel: memberInfo.familyLabel,
				size,
				formattedSize: formatBytes(size),
				formattedMtime,
				override,
				tier: context.tier,
				tierLabel: context.tierLabel,
				context,
			}
		})

		const survivor = selectClusterSurvivor(members, options.survivorRule, excludeKeys)

		const checkpointRankMap = new Map()
		const checkpointMembers = members
			.filter(m => m.context.isTrainingStepCheckpoint && !excludeKeys.has(m.selectionKey))
			.sort((a, b) => {
				const tsA = a.context.mtimeSec ?? -1
				const tsB = b.context.mtimeSec ?? -1
				if (tsA !== tsB) {
					return tsB - tsA
				}
				const stepA = a.context.stepNumber ?? -1
				const stepB = b.context.stepNumber ?? -1
				if (stepA !== stepB) {
					return stepB - stepA
				}
				return a.normalizedPath.localeCompare(b.normalizedPath)
			})
		checkpointMembers.forEach((m, idx) => {
			checkpointRankMap.set(m.selectionKey, idx)
		})

		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys, checkpointRankMap)
			member.role = survivor && member.selectionKey === survivor.selectionKey ? 'survivor' : 'duplicate'
			member.verdict = verdictInfo.verdict
			member.verdictLabel = verdictInfo.verdictLabel
			member.actionKind = verdictInfo.actionKind
			member.note = verdictInfo.note
		}

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'consolidate')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const modelMasterCopiesCount = members.filter(m => m.context.isModelMasterWeight).length
		const sidecarManifestCopiesCount = members.filter(m => m.context.isSidecarManifest).length
		const quantizedVariantCopiesCount = members.filter(m => m.context.isQuantizedVariant).length
		const stepCheckpointCopiesCount = members.filter(m => m.context.isTrainingStepCheckpoint).length
		const datasetShardCacheCopiesCount = members.filter(m => m.context.isDatasetShard || m.context.isNotebookOrHubCache).length

		const hasModelMaster = modelMasterCopiesCount > 0
		const hasSidecarManifest = sidecarManifestCopiesCount > 0
		const hasQuantizedVariant = quantizedVariantCopiesCount > 0
		const hasStepCheckpoint = stepCheckpointCopiesCount > 0
		const hasDatasetShardOrCache = datasetShardCacheCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-model-master')) {
			clusterRiskState = 'unverified-master'
		} else if (members.some(m => m.verdict === 'blocked-model-master-weights')) {
			clusterRiskState = 'model-master'
		} else if (members.some(m => m.verdict === 'blocked-sidecar-manifest')) {
			clusterRiskState = 'sidecar-manifest'
		} else if ((hasQuantizedVariant || members.some(m => m.context.isDatasetShard)) && reclaimableCopiesCount > 0) {
			clusterRiskState = 'master-verified'
		} else if ((hasStepCheckpoint || hasDatasetShardOrCache) && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `ml-dataset-artifact-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			modelLineageStem: survivor ? survivor.context.modelLineageStem : primaryInfo.modelLineageStem,
			artifactTags: allArtifactTags,
			artifactSummary: allArtifactTags.length > 0 ? allArtifactTags.join(', ') : 'none',
			extension: survivor ? survivor.extension : primaryInfo.extension,
			family: primaryInfo.family,
			familyLabel: primaryInfo.familyLabel,
			tierLabel: survivor ? survivor.tierLabel : members[0].tierLabel,
			governanceSummary: governanceSignals.join(', '),
			copyCount: members.length,
			rawReclaimableBytes: rawInfo.reclaimableBytes,
			formattedRawReclaimableBytes: formatBytes(rawInfo.reclaimableBytes),
			reclaimableBytes,
			formattedReclaimableBytes: formatBytes(reclaimableBytes),
			reclaimableCopiesCount,
			shieldedCopiesCount,
			modelMasterCopiesCount,
			sidecarManifestCopiesCount,
			quantizedVariantCopiesCount,
			stepCheckpointCopiesCount,
			datasetShardCacheCopiesCount,
			hasModelMaster,
			hasSidecarManifest,
			hasQuantizedVariant,
			hasStepCheckpoint,
			hasDatasetShardOrCache,
			clusterRiskState,
			survivor,
			members,
		})
	}

	const searchFiltered = rawClusters.filter(cluster => {
		if (!options.searchQuery) {
			return true
		}
		const q = options.searchQuery
		if (
			cluster.displayName.toLowerCase().includes(q)
			|| cluster.modelLineageStem.toLowerCase().includes(q)
			|| cluster.artifactSummary.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => (
			m.normalizedPath.toLowerCase().includes(q)
			|| m.basename.toLowerCase().includes(q)
			|| m.context.artifactTag.toLowerCase().includes(q)
		))
	})

	for (const cluster of searchFiltered) {
		familyCounts.all += 1
		if (Object.prototype.hasOwnProperty.call(familyCounts, cluster.family)) {
			familyCounts[cluster.family] += 1
		}
	}

	const clusters = searchFiltered.filter(cluster => {
		if (options.familyFilter !== 'all' && cluster.family !== options.familyFilter) {
			return false
		}
		if (options.verdictFilter === 'reclaimable' && cluster.reclaimableCopiesCount === 0) {
			return false
		}
		if (options.verdictFilter === 'model-master' && !cluster.hasModelMaster) {
			return false
		}
		if (options.verdictFilter === 'sidecar-manifest' && !cluster.hasSidecarManifest) {
			return false
		}
		if (options.verdictFilter === 'quantized-variant' && !cluster.hasQuantizedVariant) {
			return false
		}
		if (options.verdictFilter === 'step-checkpoint' && !cluster.hasStepCheckpoint) {
			return false
		}
		if (options.verdictFilter === 'dataset-shard-cache' && !cluster.hasDatasetShardOrCache) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.modelMasterCopiesCount * 5 + a.sidecarManifestCopiesCount * 4 + a.quantizedVariantCopiesCount * 3 + a.stepCheckpointCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.modelMasterCopiesCount * 5 + b.sidecarManifestCopiesCount * 4 + b.quantizedVariantCopiesCount * 3 + b.stepCheckpointCopiesCount * 2 + b.shieldedCopiesCount
			if (riskA !== riskB) {
				return riskB - riskA
			}
		} else if (options.sortMode === 'copies_desc') {
			if (a.copyCount !== b.copyCount) {
				return b.copyCount - a.copyCount
			}
		} else if (options.sortMode === 'name_asc') {
			return a.basename.localeCompare(b.basename)
		}

		if (a.reclaimableBytes !== b.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.basename.localeCompare(b.basename)
	})

	const totalRawDuplicateBytes = clusters.reduce((sum, c) => sum + c.rawReclaimableBytes, 0)
	const totalReclaimableBytes = clusters.reduce((sum, c) => sum + c.reclaimableBytes, 0)
	const totalReclaimableCopiesCount = clusters.reduce((sum, c) => sum + c.reclaimableCopiesCount, 0)
	const totalShieldedCopiesCount = clusters.reduce((sum, c) => sum + c.shieldedCopiesCount, 0)
	const totalModelMasterClusters = clusters.filter(c => c.hasModelMaster || c.hasSidecarManifest).length
	const totalQuantizedVariantClusters = clusters.filter(c => c.hasQuantizedVariant).length
	const totalStepCheckpointClusters = clusters.filter(c => c.hasStepCheckpoint).length
	const totalDatasetShardCacheClusters = clusters.filter(c => c.hasDatasetShardOrCache).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: ML_DATASET_ARTIFACT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectModelMasters: options.protectModelMasters,
			protectSidecarManifests: options.protectSidecarManifests,
			keepRecentCheckpoints: options.keepRecentCheckpoints,
			staleCacheDays: options.staleCacheDays,
			minSizeMb: options.minSizeMb,
			referenceTimeSec: options.referenceTimeSec,
		},
		summary: {
			totalClustersCount: clusters.length,
			totalRawDuplicateBytes,
			formattedRawDuplicateBytes: formatBytes(totalRawDuplicateBytes),
			totalReclaimableBytes,
			formattedReclaimableBytes: formatBytes(totalReclaimableBytes),
			totalReclaimableCopiesCount,
			totalShieldedCopiesCount,
			totalModelMasterClusters,
			totalQuantizedVariantClusters,
			totalStepCheckpointClusters,
			totalDatasetShardCacheClusters,
			efficiencyPct,
			familyCounts,
		},
		clusters,
	}
}

/**
 * Extract Nextcloud relative scan roots for occ files:scan suggestions.
 *
 * @param {Array<string>} paths Normalized file paths.
 * @return {Array<string>} Unique sorted Nextcloud relative roots.
 */
function extractOccScanPaths(paths) {
	const roots = new Set()
	for (const p of paths) {
		const clean = String(p || '').replace(/^\/+/, '')
		if (!clean) {
			continue
		}
		const parts = clean.split('/')
		if (parts[0] === '__groupfolders') {
			roots.add(`/__groupfolders/${parts[1] || ''}`.replace(/\/+$/, ''))
		} else if (parts.length >= 2 && parts[1] === 'files') {
			roots.add(`/${parts[0]}/files/${parts[2] || ''}`.replace(/\/+$/, ''))
		} else {
			roots.add(`/${parts[0]}`)
		}
	}
	return Array.from(roots).sort()
}

/**
 * Build a POSIX DRY_RUN=1 remediation script for ML Weights, Quantized Checkpoints & Dataset Shards.
 *
 * @param {object} analysis Output from analyzeMlDatasetArtifactDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildMlDatasetArtifactScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-quantized-model-twins'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'consolidate') {
				continue
			}
			operations.push({
				clusterName: cluster.basename,
				family: cluster.familyLabel,
				tier: member.tierLabel,
				actionKind: member.actionKind,
				survivorPath,
				targetPath: member.normalizedPath,
				size: member.size,
			})
			affectedPaths.push(member.rawPath || member.normalizedPath)
		}
	}

	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# ML Weights, Quantized Checkpoints & Dataset Shard Auditor',
		`# Strategy: ${strategy} | Safe defaults: DRY_RUN=1, VERIFY_SHA256=1`,
		'DRY_RUN="$' + '{DRY_RUN:-1}"',
		'VERIFY_SHA256="$' + '{VERIFY_SHA256:-1}"',
		`DATA_ROOT=${escapePosixSingleQuote(dataRoot)}`,
		'',
		'resolve_path() {',
		'  local rel="$1"',
		'  printf \'%s/%s\' "$DATA_ROOT" "$' + '{rel#/}"',
		'}',
		'',
		'verify_matching_digest() {',
		'  local survivor_full="$1"',
		'  local target_full="$2"',
		'  if [ "$VERIFY_SHA256" != "1" ]; then',
		'    return 0',
		'  fi',
		'  if command -v sha256sum >/dev/null 2>&1; then',
		'    local s_sum t_sum',
		'    s_sum="$(sha256sum -- "$survivor_full" | awk \'{print $1}\')"',
		'    t_sum="$(sha256sum -- "$target_full" | awk \'{print $1}\')"',
		'    [ "$s_sum" = "$t_sum" ]',
		'    return $?',
		'  fi',
		'  return 0',
		'}',
		'',
	]

	if (operations.length === 0) {
		lines.push('echo "No reclaimable or consolidatable step checkpoints, notebook/hub caches, or verified quantized twins under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_ml_artifact() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] verify %s && rm -f -- %s\\n\' "$survivor_full" "$target_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    rm -f -- "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')
	lines.push('consolidate_ml_artifact() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] consolidate %s -> %s\\n\' "$target_full" "$survivor_full"')
	lines.push('  else')
	lines.push('    if ! verify_matching_digest "$survivor_full" "$target_full"; then')
	lines.push('      printf \'[ABORT sha256 mismatch] %s\\n\' "$target_full" >&2')
	lines.push('      return 1')
	lines.push('    fi')
	lines.push('    local s_dev t_dev')
	lines.push('    s_dev="$(stat -c %d "$survivor_full" 2>/dev/null || stat -f %d "$survivor_full")"')
	lines.push('    t_dev="$(stat -c %d "$target_full" 2>/dev/null || stat -f %d "$target_full")"')
	lines.push('    if [ "$s_dev" != "$t_dev" ]; then')
	lines.push('      printf \'[SKIP cross-device] %s\\n\' "$target_full" >&2')
	lines.push('      return 0')
	lines.push('    fi')
	lines.push('    ln -f -- "$survivor_full" "$target_full"')
	lines.push('  fi')
	lines.push('}')
	lines.push('')

	for (const op of operations) {
		lines.push(`# ${op.family} [${op.tier}]: ${op.clusterName} (${formatBytes(op.size)})`)
		if (op.actionKind === 'consolidate') {
			lines.push(`consolidate_ml_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_ml_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		}
	}

	const scanPaths = extractOccScanPaths(affectedPaths)
	if (scanPaths.length > 0) {
		lines.push('')
		lines.push('# Nextcloud metadata rescan after DRY_RUN=0:')
		for (const scanPath of scanPaths) {
			lines.push(`# sudo -u www-data php occ files:scan --path=${escapePosixSingleQuote(scanPath)}`)
		}
	}

	return lines.join('\n')
}

/**
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for ML training checkpoints, notebook caches, and hub caches.
 *
 * @param {object} analysis Output from analyzeMlDatasetArtifactDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildMlDatasetArtifactSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for ML checkpoints, notebook & hub caches',
		'.ipynb_checkpoints/',
		'mlruns/',
		'wandb/',
		'.cache/huggingface/',
		'checkpoint-*/',
		'step-*/',
		'optimizer.pt',
		'scheduler.pt',
		'rng_state*.pth',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.hasStepCheckpoint && !seen.has('epoch_*/')) {
			lines.push('epoch_*/')
			seen.add('epoch_*/')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for ML Weights & Dataset Artifacts.
 *
 * @param {object} analysis Output from analyzeMlDatasetArtifactDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildMlDatasetArtifactCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'Model Lineage Stem',
		'Quant Tag',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Model Master Weight',
		'Sidecar Manifest',
		'Verified Master or Twin Conserved',
		'Risk State',
		'Member Role',
		'Verdict',
		'Action',
		'Path',
		'Size Bytes',
		'Age Days',
		'Authority Score',
		'Modified',
	]

	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	for (const cluster of clusters) {
		for (const member of cluster.members || []) {
			const hasVerifiedTwin = (member.context.isQuantizedVariant || member.context.isDatasetShard)
				? member.context.hasVerifiedModelMasterTwin
				: (member.context.isModelMasterWeight || member.context.isSidecarManifest)
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.modelLineageStem,
				member.context.quantTag || '',
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isModelMasterWeight ? 'yes' : 'no',
				member.context.isSidecarManifest ? 'yes' : 'no',
				hasVerifiedTwin ? 'yes' : 'no',
				cluster.clusterRiskState,
				member.role,
				member.verdictLabel,
				member.actionKind,
				member.normalizedPath,
				member.size,
				member.context.ageDays !== null ? member.context.ageDays : '',
				member.context.authorityScore,
				member.formattedMtime || '',
			]
			rows.push(row.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit manifest for ML Weights, Quantized Checkpoints & Dataset Shards.
 *
 * @param {object} analysis Output from analyzeMlDatasetArtifactDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildMlDatasetArtifactJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: ML_DATASET_ARTIFACT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			modelLineageStem: cluster.modelLineageStem,
			artifactTags: cluster.artifactTags,
			extension: cluster.extension,
			family: cluster.family,
			tierLabel: cluster.tierLabel,
			governanceSummary: cluster.governanceSummary,
			clusterRiskState: cluster.clusterRiskState,
			copyCount: cluster.copyCount,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivor ? cluster.survivor.normalizedPath : '',
			members: (cluster.members || []).map(member => ({
				selectionKey: member.selectionKey,
				path: member.normalizedPath,
				role: member.role,
				verdict: member.verdict,
				actionKind: member.actionKind,
				size: member.size,
				tier: member.tier,
				modelLineageStem: member.context.modelLineageStem,
				quantTag: member.context.quantTag,
				authorityScore: member.context.authorityScore,
				hasVerifiedModelMasterTwin: member.context.hasVerifiedModelMasterTwin,
				override: member.override,
			})),
		})),
	}, null, 2)
}
