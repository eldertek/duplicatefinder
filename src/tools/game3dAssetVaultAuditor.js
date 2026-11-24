/**
 * Pure Game Engine, Blender Backup & 3D PBR Texture Vault Auditor.
 * Classifies and audits duplicate clusters across 4 3D/game-dev storage families:
 * - 3D Scene & Mesh Masters (.blend, .uproject, .unity, .fbx, .glb, .gltf, .usdz, .3mf outside caches/backups)
 * - Blender & Slicer Backups (.blend1, .blend2, .blend3, autosave_*.blend, .gcode, .bgcode linked to conserved .3mf/.blend masters)
 * - PBR Texture Resolution Pyramids (_8k/_4k/_2k/_1k / _albedo/_basecolor/_normal/_roughness/_orm in .png/.tga/.ktx2/.dds/.webp sharing material/texture stem)
 * - Engine Derived & Shader Caches (Library/ArtifactDB, Library/ShaderCache, Temp/, DerivedDataCache/, Intermediate/, Saved/Autosaves/, *.meshcache, shader_cache_*.bin)
 *
 * Assigns 5 governance tiers:
 * - 3d-scene-master-anchor (Canonical 3D scene/mesh master; strictly protected by default)
 * - master-pbr-4k-or-8k (High-resolution 4K/8K PBR texture master; strictly protected by default)
 * - pbr-texture-downscale (2K/1K/512 PBR downscale or GPU twin; deletion blocked if verified 4K/8K master is missing)
 * - blender-or-slicer-backup (Blender autosave/.blend1-3 or sliced .gcode/.bgcode; deletion blocked if verified .blend/.3mf master is missing)
 * - engine-derived-cache (Reconstructible Unity/Unreal/Engine derived data, artifact DB, or shader cache)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const GAME3D_ASSET_VAULT_SCHEMA = 'duplicatefinder.game3d-asset-vault-auditor.v1'

export const GAME3D_ASSET_FAMILIES = Object.freeze([
	'all',
	'3d-scene-and-mesh-masters',
	'blender-and-slicer-backups',
	'pbr-texture-resolution-pyramids',
	'engine-derived-shader-caches',
])

export const GAME3D_ASSET_FAMILY_META = Object.freeze({
	'3d-scene-and-mesh-masters': {
		id: '3d-scene-and-mesh-masters',
		label: '3D Scene & Mesh Masters',
		shortLabel: 'Scene Masters (.blend/.uproject/.unity/.fbx/.glb/.gltf/.usdz/.3mf)',
	},
	'blender-and-slicer-backups': {
		id: 'blender-and-slicer-backups',
		label: 'Blender & Slicer Backups',
		shortLabel: 'Backups & G-Code (.blend1-3/autosave_*.blend/.gcode/.bgcode)',
	},
	'pbr-texture-resolution-pyramids': {
		id: 'pbr-texture-resolution-pyramids',
		label: 'PBR Texture Resolution Pyramids',
		shortLabel: 'PBR Textures (_8k/_4k/_2k/_1k _albedo/_normal/_roughness/_orm)',
	},
	'engine-derived-shader-caches': {
		id: 'engine-derived-shader-caches',
		label: 'Engine Derived & Shader Caches',
		shortLabel: 'Engine Caches (Library/ArtifactDB/ShaderCache/Temp/DerivedDataCache/Intermediate/Saved/Autosaves)',
	},
})

export const GAME3D_ASSET_STRATEGIES = Object.freeze([
	'prune-engine-derived-caches',
	'prune-blender-auto-backups',
	'consolidate-pbr-texture-downscales',
])

export const GAME3D_ASSET_SURVIVOR_RULES = Object.freeze([
	'scene-master-and-vault-first',
	'pbr-highres-4k-8k-first',
	'newest-asset-first',
	'shortest-path',
])

export const GAME3D_ASSET_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'scene-master',
	'pbr-master',
	'pbr-downscale',
	'blender-backup',
	'engine-cache',
	'shielded',
])

export const GAME3D_ASSET_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const GAME3D_ASSET_PRESETS = Object.freeze([
	{
		id: 'all-game3d-vault-audit',
		name: 'All 3D & Game Vault Audit',
		description: 'Audit 3D scene masters, Blender/slicer backups, PBR texture pyramids, and Unity/Unreal derived caches while guarding scene and 4K/8K PBR masters.',
		familyFilter: 'all',
		strategy: 'consolidate-pbr-texture-downscales',
		survivorRule: 'scene-master-and-vault-first',
		protectSceneMasters: true,
		protectPbrMasters: true,
		keepRecentBackups: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-engine-derived-caches',
		name: 'Prune Engine & Shader Caches',
		description: 'Reclaim stale Unity Library/ArtifactDB, Library/ShaderCache, Temp/, Unreal DerivedDataCache/, Intermediate/, Saved/Autosaves/, *.meshcache, and shader_cache_*.bin.',
		familyFilter: 'engine-derived-shader-caches',
		strategy: 'prune-engine-derived-caches',
		survivorRule: 'newest-asset-first',
		protectSceneMasters: true,
		protectPbrMasters: true,
		keepRecentBackups: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-blender-auto-backups',
		name: 'Prune Blender & Slicer Backups',
		description: 'Reclaim stale .blend1/.blend2/.blend3, autosave_*.blend, and .gcode/.bgcode duplicates only when a verified .blend or .3mf scene master is conserved.',
		familyFilter: 'blender-and-slicer-backups',
		strategy: 'prune-blender-auto-backups',
		survivorRule: 'newest-asset-first',
		protectSceneMasters: true,
		protectPbrMasters: true,
		keepRecentBackups: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-pbr-texture-downscales',
		name: 'Consolidate PBR Texture Downscales',
		description: 'Consolidate duplicate 2K/1K/512 PBR maps only when a conserved 4K or 8K PBR master exists for the same material and channel.',
		familyFilter: 'pbr-texture-resolution-pyramids',
		strategy: 'consolidate-pbr-texture-downscales',
		survivorRule: 'pbr-highres-4k-8k-first',
		protectSceneMasters: true,
		protectPbrMasters: true,
		keepRecentBackups: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'scene-and-pbr-master-shield',
		name: 'Scene & 4K/8K PBR Master Shield',
		description: 'Inspect canonical .blend/.uproject/.unity/.fbx/.glb/.3mf scene anchors and 4K/8K PBR texture sources under strict preservation guards.',
		familyFilter: '3d-scene-and-mesh-masters',
		strategy: 'consolidate-pbr-texture-downscales',
		survivorRule: 'scene-master-and-vault-first',
		protectSceneMasters: true,
		protectPbrMasters: true,
		keepRecentBackups: 1,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const SCENE_MASTER_EXT_SET = new Set(['blend', 'uproject', 'unity', 'fbx', 'glb', 'gltf', 'usdz', '3mf'])
const SLICER_BACKUP_EXT_SET = new Set(['gcode', 'bgcode'])
const PBR_TEXTURE_EXT_SET = new Set(['png', 'tga', 'ktx2', 'dds', 'webp'])
const GPU_DEDICATED_TEXTURE_EXT_SET = new Set(['ktx2', 'dds'])

const ENGINE_CACHE_DIR_RE = /\/(?:library\/artifactdb|library\/shadercache|temp|deriveddatacache|intermediate|saved\/autosaves)(?:\/|$)/i
const ENGINE_CACHE_FILE_RE = /(?:^shader_cache_.*\.bin$|\.meshcache$)/i

const BLENDER_BACKUP_EXT_RE = /^blend[1-9]\d*$/i
const BLENDER_AUTOSAVE_FILE_RE = /^(?:autosave_.*\.blend|.*_autosave\.blend)$/i

const PBR_RES_TAG_RE = /(?:^|[_\-.\s])(8k|4k|2k|1k|512)(?=$|[_\-.\s])/i
const PBR_RES_STRIP_RE = /(?:^|[_\-.\s])(8k|4k|2k|1k|512)(?=$|[_\-.\s])/gi
const PBR_CHANNEL_TAG_RE = /(?:^|[_\-.\s])(albedo|basecolor|base_color|normal|nrm|roughness|rough|orm|metallic|metalness|ao|ambient_occlusion|height|displacement|emissive|specular|opacity)(?=$|[_\-.\s])/i
const PBR_CHANNEL_STRIP_RE = /(?:^|[_\-.\s])(albedo|basecolor|base_color|normal|nrm|roughness|rough|orm|metallic|metalness|ao|ambient_occlusion|height|displacement|emissive|specular|opacity)(?=$|[_\-.\s])/gi

const VAULT_PRODUCTION_PATH_RE = /(\/(?:assets?|scenes?|models?|masters?|vault|library|textures?|materials?|pbr|production|prod|release|releases|projects?)(?:\/|$)|\/__groupfolders\/\d+\/(?:assets?|scenes?|models?|masters?|vault|textures?|production|release))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/|\/airdrop\/|\/export_tmp\/)/i
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi
const TRAILING_ASSET_EXT_RE = /\.(blend\d*|uproject|unity|fbx|glb|gltf|usdz|3mf|gcode|bgcode|png|tga|ktx2|dds|webp|meshcache|bin|tmp|bak)$/i
const STRICT_SHA256_HEX_RE = /^[a-f0-9]{64}$/i

const TIER_LABELS = Object.freeze({
	'3d-scene-master-anchor': '3D Scene & Mesh Master',
	'master-pbr-4k-or-8k': 'PBR Master (4K / 8K)',
	'pbr-texture-downscale': 'PBR Downscale / GPU Map',
	'blender-or-slicer-backup': 'Blender / Slicer Backup',
	'engine-derived-cache': 'Engine Derived / Shader Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'3d-scene-master-anchor': 98,
	'master-pbr-4k-or-8k': 94,
	'pbr-texture-downscale': 62,
	'blender-or-slicer-backup': 36,
	'engine-derived-cache': 14,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Vault Anchor',
	'consolidate-to-vault-master': 'Consolidate Staging Twin to Vault Anchor',
	'consolidate-pbr-downscale': 'Consolidate Verified PBR Downscale',
	'reclaim-blender-slicer-backup': 'Prune Verified Blender / Slicer Backup',
	'reclaim-engine-derived-cache': 'Prune Reconstructible Engine Cache',
	'blocked-scene-master': 'Blocked: 3D Scene Master Guard',
	'blocked-pbr-master-4k-8k': 'Blocked: PBR 4K/8K Master Guard',
	'blocked-unverified-scene-master': 'Blocked: Missing Verified Master',
	'blocked-recent-backup': 'Shielded: Recent Blender / Slicer Backup',
	'blocked-fresh-engine-cache': 'Shielded: Fresh Engine Cache',
	'blocked-not-engine-cache': 'Shielded: Non-Cache Asset',
	'blocked-not-blender-backup': 'Shielded: Non-Backup Asset',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'3d-scene-and-mesh-masters': 4,
	'pbr-texture-resolution-pyramids': 3,
	'blender-and-slicer-backups': 2,
	'engine-derived-shader-caches': 1,
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
 * Extract lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractExtension(lowerBase) {
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Normalize a PBR channel token into a canonical channel group.
 *
 * @param {string} rawChannel Raw extracted channel tag.
 * @return {string} Canonical PBR channel group.
 */
function normalizePbrChannelGroup(rawChannel) {
	const ch = String(rawChannel || '').toLowerCase()
	if (ch === 'basecolor' || ch === 'base_color' || ch === 'albedo') {
		return 'albedo'
	}
	if (ch === 'nrm' || ch === 'normal') {
		return 'normal'
	}
	if (ch === 'rough' || ch === 'roughness') {
		return 'roughness'
	}
	if (ch === 'metalness' || ch === 'metallic') {
		return 'metallic'
	}
	if (ch === 'ambient_occlusion' || ch === 'ao') {
		return 'ao'
	}
	if (ch === 'displacement' || ch === 'height') {
		return 'height'
	}
	return ch
}

/**
 * Clean a stem string by stripping copy suffixes and trailing asset extensions.
 *
 * @param {string} rawStem Raw stem string.
 * @return {string} Cleaned stem.
 */
function stripTrailingExtensionsAndCopy(rawStem) {
	let stem = String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
	let prev
	do {
		prev = stem
		stem = stem.replace(TRAILING_ASSET_EXT_RE, '')
	} while (stem !== prev)
	return stem.replace(/^[\s_.-]+|[\s_.-]+$/g, '')
}

/**
 * Normalize a 3D scene or PBR texture stem into a clean canonical lineage identifier.
 *
 * @param {string} rawStem Raw stem without outer extension.
 * @param {object} [opts] Normalization options.
 * @param {boolean} [opts.stripPbrChannel=false] Whether to strip PBR channel tag for material-level stem.
 * @return {string} Clean canonical stem.
 */
function normalizeGame3dStem(rawStem, opts = {}) {
	let stem = stripTrailingExtensionsAndCopy(rawStem)
	stem = stem.replace(/^autosave[-_.]?/i, '').replace(/[-_.]?autosave$/i, '')

	let prev
	do {
		prev = stem
		stem = stem.replace(PBR_RES_STRIP_RE, '')
	} while (stem !== prev)

	if (opts.stripPbrChannel) {
		do {
			prev = stem
			stem = stem.replace(PBR_CHANNEL_STRIP_RE, '')
		} while (stem !== prev)
	}

	stem = stem
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || stripTrailingExtensionsAndCopy(rawStem)
}

/**
 * Parse Game Engine, Blender Backup & 3D PBR Texture metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed asset lineage, resolution tier, channel, backup generation, and governance flags.
 */
export function parseGame3dAssetInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()

	const ext = extractExtension(lowerBase)
	const rawStem = ext && lowerBase.endsWith(`.${ext}`)
		? rawBase.slice(0, rawBase.length - ext.length - 1)
		: rawBase
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isEngineCacheDir = ENGINE_CACHE_DIR_RE.test(lowerPath)
	const isEngineCacheFile = ENGINE_CACHE_FILE_RE.test(lowerBase)
	const isEngineDerivedCache = Boolean(isEngineCacheDir || isEngineCacheFile)

	const isBlenderBackupExt = BLENDER_BACKUP_EXT_RE.test(ext)
	const isBlenderAutosave = BLENDER_AUTOSAVE_FILE_RE.test(lowerBase)
	const isSlicerGcodeExt = SLICER_BACKUP_EXT_SET.has(ext)
	const isBlenderOrSlicerBackup = Boolean(
		!isEngineDerivedCache
		&& (isBlenderBackupExt || isBlenderAutosave || isSlicerGcodeExt)
	)

	const resMatch = cleanRawStem.match(PBR_RES_TAG_RE) || lowerPath.match(PBR_RES_TAG_RE)
	const resolutionTier = resMatch ? resMatch[1].toLowerCase() : ''

	const channelMatch = cleanRawStem.match(PBR_CHANNEL_TAG_RE)
	const pbrChannelRaw = channelMatch ? channelMatch[1].toLowerCase() : ''
	const pbrChannel = normalizePbrChannelGroup(pbrChannelRaw)

	const isPbrTextureExt = PBR_TEXTURE_EXT_SET.has(ext)
	const isPbrTextureCandidate = Boolean(
		!isEngineDerivedCache
		&& !isBlenderOrSlicerBackup
		&& isPbrTextureExt
		&& (Boolean(resolutionTier) || Boolean(pbrChannel) || GPU_DEDICATED_TEXTURE_EXT_SET.has(ext))
	)

	const isSceneMasterCandidate = Boolean(
		!isEngineDerivedCache
		&& !isBlenderOrSlicerBackup
		&& !isPbrTextureCandidate
		&& SCENE_MASTER_EXT_SET.has(ext)
	)

	const isVaultProductionPath = VAULT_PRODUCTION_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	let backupGeneration = null
	if (isBlenderBackupExt) {
		const genNum = Number.parseInt(ext.replace(/^blend/i, ''), 10)
		if (Number.isFinite(genNum)) {
			backupGeneration = genNum
		}
	}

	const pbrMaterialStem = isPbrTextureCandidate
		? (normalizeGame3dStem(cleanRawStem, { stripPbrChannel: true }) || cleanRawStem)
		: ''
	const assetLineageStem = isPbrTextureCandidate
		? (pbrChannel ? `${pbrMaterialStem}_${pbrChannel}` : pbrMaterialStem)
		: (normalizeGame3dStem(cleanRawStem) || cleanRawStem || rawBase)

	const isMasterPbr4kOr8k = Boolean(
		isPbrTextureCandidate
		&& (resolutionTier === '8k' || resolutionTier === '4k')
	)
	const isPbrDownscale = Boolean(isPbrTextureCandidate && !isMasterPbr4kOr8k)

	const assetTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !assetTags.includes(norm)) {
			assetTags.push(norm)
		}
	}

	if (isSceneMasterCandidate) {
		pushTag(`master:${ext}`)
		if (isVaultProductionPath) {
			pushTag('vault-anchor')
		}
	}
	if (isBlenderOrSlicerBackup) {
		if (isSlicerGcodeExt) {
			pushTag(`slicer:${ext}`)
		} else if (isBlenderAutosave) {
			pushTag('blender:autosave')
		} else {
			pushTag(`blender:${ext}`)
		}
	}
	if (isPbrTextureCandidate) {
		pushTag(`pbr:${ext}`)
		if (resolutionTier) {
			pushTag(`res:${resolutionTier.toUpperCase()}`)
		}
		if (pbrChannel) {
			pushTag(`map:${pbrChannel}`)
		}
	}
	if (isEngineDerivedCache) {
		if (lowerPath.includes('/library/artifactdb')) {
			pushTag('cache:unity-artifactdb')
		} else if (lowerPath.includes('/library/shadercache')) {
			pushTag('cache:unity-shadercache')
		} else if (lowerPath.includes('/deriveddatacache/')) {
			pushTag('cache:unreal-ddc')
		} else if (lowerPath.includes('/intermediate/')) {
			pushTag('cache:unreal-intermediate')
		} else if (lowerPath.includes('/saved/autosaves/')) {
			pushTag('cache:saved-autosaves')
		} else if (lowerPath.includes('/temp/')) {
			pushTag('cache:engine-temp')
		} else if (ext === 'meshcache') {
			pushTag('cache:meshcache')
		} else {
			pushTag('cache:shader-bin')
		}
	}

	return {
		rawStem: cleanRawStem,
		assetLineageStem,
		pbrMaterialStem,
		extension: ext,
		resolutionTier,
		pbrChannel,
		backupGeneration,
		assetTags,
		assetTag: assetTags.length > 0 ? assetTags.join(', ') : 'none',
		isEngineCacheDir,
		isEngineCacheFile,
		isEngineDerivedCache,
		isBlenderBackupExt,
		isBlenderAutosave,
		isSlicerGcodeExt,
		isBlenderOrSlicerBackup,
		isPbrTextureCandidate,
		isMasterPbr4kOr8k,
		isPbrDownscale,
		isSceneMasterCandidate,
		isVaultProductionPath,
		isStagingBloatPath,
	}
}

/**
 * Build dataset-wide verification hints for conserved 3D scene masters and 4K/8K PBR masters.
 * Respects operator exclude overrides so excluded masters are not treated as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset verification hints.
 */
function buildDatasetGame3dHints(duplicates, memberOverrides = {}) {
	const sceneMasterStems = new Set()
	const blenderAnd3mfMasterStems = new Set()
	const pbrMasterChannelKeys = new Set()
	const pbrMasterMaterialStems = new Set()

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
			const info = parseGame3dAssetInfo(extractBasename(normalized), normalized)
			if (info.isStagingBloatPath || info.isEngineDerivedCache || info.isBlenderOrSlicerBackup) {
				continue
			}

			if (info.isSceneMasterCandidate) {
				const stemLower = info.assetLineageStem.toLowerCase()
				if (stemLower) {
					sceneMasterStems.add(stemLower)
					if (info.extension === 'blend' || info.extension === '3mf') {
						blenderAnd3mfMasterStems.add(stemLower)
					}
				}
			}

			if (info.isMasterPbr4kOr8k) {
				const matLower = info.pbrMaterialStem.toLowerCase()
				if (matLower) {
					pbrMasterMaterialStems.add(matLower)
					if (info.pbrChannel) {
						pbrMasterChannelKeys.add(`${matLower}::${info.pbrChannel}`)
					}
				}
			}
		}
	}

	return {
		sceneMasterStems,
		blenderAnd3mfMasterStems,
		pbrMasterChannelKeys,
		pbrMasterMaterialStems,
	}
}

/**
 * Classify a file path into one of the 4 Game Engine, Blender & 3D PBR Texture Vault families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyGame3dAsset(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseGame3dAssetInfo(basename, normalized)

	if (info.isEngineDerivedCache) {
		return {
			matched: true,
			family: 'engine-derived-shader-caches',
			familyLabel: GAME3D_ASSET_FAMILY_META['engine-derived-shader-caches'].label,
			...info,
		}
	}

	if (info.isBlenderOrSlicerBackup) {
		return {
			matched: true,
			family: 'blender-and-slicer-backups',
			familyLabel: GAME3D_ASSET_FAMILY_META['blender-and-slicer-backups'].label,
			...info,
		}
	}

	if (info.isPbrTextureCandidate) {
		return {
			matched: true,
			family: 'pbr-texture-resolution-pyramids',
			familyLabel: GAME3D_ASSET_FAMILY_META['pbr-texture-resolution-pyramids'].label,
			...info,
		}
	}

	if (info.isSceneMasterCandidate) {
		return {
			matched: true,
			family: '3d-scene-and-mesh-masters',
			familyLabel: GAME3D_ASSET_FAMILY_META['3d-scene-and-mesh-masters'].label,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, master verification status, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentBackups, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster master verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectGame3dMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseGame3dAssetInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isEngineDerivedCache = Boolean(parsed.isEngineDerivedCache || classification.family === 'engine-derived-shader-caches')
	const isBlenderOrSlicerBackup = Boolean(!isEngineDerivedCache && (parsed.isBlenderOrSlicerBackup || classification.family === 'blender-and-slicer-backups'))
	const isMasterPbr4kOr8k = Boolean(!isEngineDerivedCache && !isBlenderOrSlicerBackup && parsed.isMasterPbr4kOr8k)
	const isPbrDownscale = Boolean(!isEngineDerivedCache && !isBlenderOrSlicerBackup && !isMasterPbr4kOr8k && (parsed.isPbrDownscale || classification.family === 'pbr-texture-resolution-pyramids'))
	const isSceneMaster = Boolean(
		!isEngineDerivedCache
		&& !isBlenderOrSlicerBackup
		&& !isMasterPbr4kOr8k
		&& !isPbrDownscale
		&& (parsed.isSceneMasterCandidate || classification.family === '3d-scene-and-mesh-masters' || (file && file.isSceneMaster === true))
	)

	const stemLower = parsed.assetLineageStem.toLowerCase()
	const matLower = parsed.pbrMaterialStem.toLowerCase()
	const channelKey = parsed.pbrChannel && matLower ? `${matLower}::${parsed.pbrChannel}` : ''

	const hasVerifiedSceneMaster = Boolean(
		isSceneMaster
		|| clusterHints.clusterHasConservedSceneMaster
		|| (stemLower && clusterHints.blenderAnd3mfMasterStems && clusterHints.blenderAnd3mfMasterStems.has(stemLower))
		|| (stemLower && clusterHints.sceneMasterStems && clusterHints.sceneMasterStems.has(stemLower))
	)

	const hasVerifiedPbrMaster = Boolean(
		isMasterPbr4kOr8k
		|| clusterHints.clusterHasConservedPbrMaster
		|| (channelKey && clusterHints.pbrMasterChannelKeys && clusterHints.pbrMasterChannelKeys.has(channelKey))
		|| (!channelKey && matLower && clusterHints.pbrMasterMaterialStems && clusterHints.pbrMasterMaterialStems.has(matLower))
	)

	const isStaleArtifact = ageDays === null || ageDays >= options.staleCacheDays
	const isFreshArtifact = ageDays !== null && ageDays < options.staleCacheDays

	let tier = 'engine-derived-cache'
	if (isSceneMaster) {
		tier = '3d-scene-master-anchor'
	} else if (isMasterPbr4kOr8k) {
		tier = 'master-pbr-4k-or-8k'
	} else if (isPbrDownscale) {
		tier = 'pbr-texture-downscale'
	} else if (isBlenderOrSlicerBackup) {
		tier = 'blender-or-slicer-backup'
	} else {
		tier = 'engine-derived-cache'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 20
	if (isSceneMaster && parsed.isVaultProductionPath && !parsed.isStagingBloatPath) {
		authorityScore = 100
	} else if (isMasterPbr4kOr8k && parsed.isVaultProductionPath && !parsed.isStagingBloatPath) {
		authorityScore = 97
	}
	if (isMasterPbr4kOr8k && parsed.resolutionTier === '8k') {
		authorityScore = Math.min(100, authorityScore + 2)
	}
	if (isPbrDownscale && hasVerifiedPbrMaster) {
		authorityScore += 6
	}
	if (isBlenderOrSlicerBackup && hasVerifiedSceneMaster) {
		authorityScore += 6
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 22
	}
	if (isEngineDerivedCache && isStaleArtifact) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['engine-derived-cache'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		assetLineageStem: parsed.assetLineageStem,
		pbrMaterialStem: parsed.pbrMaterialStem,
		resolutionTier: parsed.resolutionTier,
		pbrChannel: parsed.pbrChannel,
		backupGeneration: parsed.backupGeneration,
		assetTags: parsed.assetTags,
		assetTag: parsed.assetTag,
		isSceneMaster,
		isMasterPbr4kOr8k,
		isPbrDownscale,
		isBlenderOrSlicerBackup,
		isEngineDerivedCache,
		isVaultProductionPath: parsed.isVaultProductionPath,
		isStagingBloatPath: parsed.isStagingBloatPath,
		hasVerifiedSceneMaster,
		hasVerifiedPbrMaster,
		isStaleArtifact,
		isFreshArtifact,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a Game/3D duplicate cluster.
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
		if (survivorRule === 'pbr-highres-4k-8k-first') {
			if (a.context.isMasterPbr4kOr8k !== b.context.isMasterPbr4kOr8k) {
				return a.context.isMasterPbr4kOr8k ? -1 : 1
			}
		} else if (survivorRule === 'newest-asset-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
		} else {
			if (a.context.isVaultProductionPath !== b.context.isVaultProductionPath) {
				return a.context.isVaultProductionPath ? -1 : 1
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
 * Determine the deterministic audit verdict for a Game/3D Vault cluster member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @param {Map<string, number>} backupRankMap Zero-based recency rank for backup members.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys, backupRankMap) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from 3D Vault & PBR Texture audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative studio vault anchor.`,
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

	if (options.protectSceneMasters && member.context.isSceneMaster && !member.context.isStagingBloatPath) {
		return {
			verdict: 'blocked-scene-master',
			verdictLabel: VERDICT_LABELS['blocked-scene-master'],
			actionKind: 'shield',
			note: 'Strictly protected by 3D Scene Master Guard; canonical .blend/.uproject/.unity/.fbx/.glb/.gltf/.usdz/.3mf vault copies are never pruned automatically.',
		}
	}

	if (options.protectPbrMasters && member.context.isMasterPbr4kOr8k && !member.context.isStagingBloatPath) {
		return {
			verdict: 'blocked-pbr-master-4k-8k',
			verdictLabel: VERDICT_LABELS['blocked-pbr-master-4k-8k'],
			actionKind: 'shield',
			note: 'Strictly protected by PBR 4K/8K Master Guard; high-resolution source texture maps are conserved.',
		}
	}

	if (options.strategy === 'prune-engine-derived-caches') {
		if (!member.context.isEngineDerivedCache) {
			return {
				verdict: 'blocked-not-engine-cache',
				verdictLabel: VERDICT_LABELS['blocked-not-engine-cache'],
				actionKind: 'shield',
				note: 'Shielded by Engine Cache Pruner because member is not in Library/ArtifactDB, Library/ShaderCache, Temp/, DerivedDataCache/, Intermediate/, Saved/Autosaves/, *.meshcache, or shader_cache_*.bin.',
			}
		}
		if (member.context.isFreshArtifact) {
			return {
				verdict: 'blocked-fresh-engine-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-engine-cache'],
				actionKind: 'shield',
				note: `Shielded because engine derived cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-engine-derived-cache',
			verdictLabel: VERDICT_LABELS['reclaim-engine-derived-cache'],
			actionKind: 'reclaim',
			note: 'Reconstructible Unity/Unreal/Engine derived data or shader cache safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-blender-auto-backups') {
		if (!member.context.isBlenderOrSlicerBackup) {
			return {
				verdict: 'blocked-not-blender-backup',
				verdictLabel: VERDICT_LABELS['blocked-not-blender-backup'],
				actionKind: 'shield',
				note: 'Shielded by Blender & Slicer Backup Pruner because member is not a .blend1-3, autosave_*.blend, .gcode, or .bgcode file.',
			}
		}
		if (!member.context.hasVerifiedSceneMaster) {
			return {
				verdict: 'blocked-unverified-scene-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-scene-master'],
				actionKind: 'shield',
				note: 'Blocked because no conserved .blend or .3mf scene master matching this asset stem exists in the vault.',
			}
		}
		const rank = backupRankMap.has(member.selectionKey) ? backupRankMap.get(member.selectionKey) : 999
		if (member.context.isFreshArtifact || rank < options.keepRecentBackups) {
			return {
				verdict: 'blocked-recent-backup',
				verdictLabel: VERDICT_LABELS['blocked-recent-backup'],
				actionKind: 'shield',
				note: `Shielded because backup is within keepRecentBackups (${options.keepRecentBackups}) or newer than stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-blender-slicer-backup',
			verdictLabel: VERDICT_LABELS['reclaim-blender-slicer-backup'],
			actionKind: 'reclaim',
			note: 'Verified .blend/.3mf master exists; stale Blender backup or sliced G-code duplicate is safe to prune.',
		}
	}

	if (member.context.isEngineDerivedCache) {
		if (member.context.isFreshArtifact) {
			return {
				verdict: 'blocked-fresh-engine-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-engine-cache'],
				actionKind: 'shield',
				note: `Shielded because engine derived cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-engine-derived-cache',
			verdictLabel: VERDICT_LABELS['reclaim-engine-derived-cache'],
			actionKind: 'reclaim',
			note: 'Reconstructible Unity/Unreal/Engine derived data or shader cache safe to prune after SHA-256 verification.',
		}
	}

	if (member.context.isBlenderOrSlicerBackup) {
		if (!member.context.hasVerifiedSceneMaster) {
			return {
				verdict: 'blocked-unverified-scene-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-scene-master'],
				actionKind: 'shield',
				note: 'Blocked because no conserved .blend or .3mf scene master matching this asset stem exists in the vault.',
			}
		}
		const rank = backupRankMap.has(member.selectionKey) ? backupRankMap.get(member.selectionKey) : 999
		if (member.context.isFreshArtifact || rank < options.keepRecentBackups) {
			return {
				verdict: 'blocked-recent-backup',
				verdictLabel: VERDICT_LABELS['blocked-recent-backup'],
				actionKind: 'shield',
				note: `Shielded because backup is within keepRecentBackups (${options.keepRecentBackups}) or newer than stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-blender-slicer-backup',
			verdictLabel: VERDICT_LABELS['reclaim-blender-slicer-backup'],
			actionKind: 'reclaim',
			note: 'Verified .blend/.3mf master exists; stale Blender backup or sliced G-code duplicate is safe to prune.',
		}
	}

	if (member.context.isPbrDownscale) {
		if (!member.context.hasVerifiedPbrMaster) {
			return {
				verdict: 'blocked-unverified-scene-master',
				verdictLabel: VERDICT_LABELS['blocked-unverified-scene-master'],
				actionKind: 'shield',
				note: 'Blocked because no conserved 4K or 8K PBR master texture matching this material and channel exists in the vault.',
			}
		}
		return {
			verdict: 'consolidate-pbr-downscale',
			verdictLabel: VERDICT_LABELS['consolidate-pbr-downscale'],
			actionKind: 'consolidate',
			note: 'Verified 4K/8K PBR master exists; duplicate downscale texture copy can be safely consolidated via sha256sum and stat cross-device guard.',
		}
	}

	return {
		verdict: 'consolidate-to-vault-master',
		verdictLabel: VERDICT_LABELS['consolidate-to-vault-master'],
		actionKind: 'consolidate',
		note: 'Staging twin of a conserved 3D scene or 4K/8K PBR master; safe to consolidate against canonical vault anchor.',
	}
}

/**
 * Normalize Game Engine, Blender & 3D PBR Texture Vault auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = GAME3D_ASSET_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = GAME3D_ASSET_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = GAME3D_ASSET_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = GAME3D_ASSET_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-pbr-texture-downscales'
	const survivorRule = GAME3D_ASSET_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'scene-master-and-vault-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentBackups, 10)
	const keepRecentBackups = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 1

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
		protectSceneMasters: rawOptions.protectSceneMasters !== false,
		protectPbrMasters: rawOptions.protectPbrMasters !== false,
		keepRecentBackups,
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
 * Audit duplicate groups for Game Engine caches, Blender/Slicer backups, 3D scene masters & PBR texture pyramids.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeGame3dAssetVaultDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetGame3dHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'3d-scene-and-mesh-masters': 0,
		'blender-and-slicer-backups': 0,
		'pbr-texture-resolution-pyramids': 0,
		'engine-derived-shader-caches': 0,
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
			const info = classifyGame3dAsset(file.path)
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

		const clusterHasConservedSceneMaster = nonExcludedFiles.some(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseGame3dAssetInfo(extractBasename(normalized), normalized)
			return Boolean(
				!parsed.isStagingBloatPath
				&& !parsed.isEngineDerivedCache
				&& !parsed.isBlenderOrSlicerBackup
				&& (parsed.isSceneMasterCandidate || file.isSceneMaster === true)
			)
		})

		const clusterHasConservedPbrMaster = nonExcludedFiles.some(file => {
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseGame3dAssetInfo(extractBasename(normalized), normalized)
			return Boolean(!parsed.isStagingBloatPath && parsed.isMasterPbr4kOr8k)
		})

		const groupHashStr = String(group.hash || '').trim()
		const hasStrictGroupSha256 = STRICT_SHA256_HEX_RE.test(groupHashStr) || group.sha256Verified === true

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

			const directInfo = classifyGame3dAsset(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectGame3dMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedSceneMaster,
					clusterHasConservedPbrMaster,
					hasStrictGroupSha256,
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

		const backupRankMap = new Map()
		const backupMembers = members
			.filter(m => m.context.isBlenderOrSlicerBackup && !excludeKeys.has(m.selectionKey))
			.sort((a, b) => {
				const tsA = a.context.mtimeSec ?? -1
				const tsB = b.context.mtimeSec ?? -1
				if (tsA !== tsB) {
					return tsB - tsA
				}
				const genA = a.context.backupGeneration ?? 999
				const genB = b.context.backupGeneration ?? 999
				if (genA !== genB) {
					return genA - genB
				}
				return a.normalizedPath.localeCompare(b.normalizedPath)
			})
		backupMembers.forEach((m, idx) => {
			backupRankMap.set(m.selectionKey, idx)
		})

		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys, backupRankMap)
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
		const sceneMasterCopiesCount = members.filter(m => m.context.isSceneMaster).length
		const pbrMasterCopiesCount = members.filter(m => m.context.isMasterPbr4kOr8k).length
		const pbrDownscaleCopiesCount = members.filter(m => m.context.isPbrDownscale).length
		const blenderBackupCopiesCount = members.filter(m => m.context.isBlenderOrSlicerBackup).length
		const engineCacheCopiesCount = members.filter(m => m.context.isEngineDerivedCache).length

		const hasSceneMaster = sceneMasterCopiesCount > 0
		const hasPbrMaster = pbrMasterCopiesCount > 0
		const hasPbrDownscale = pbrDownscaleCopiesCount > 0
		const hasBlenderBackup = blenderBackupCopiesCount > 0
		const hasEngineCache = engineCacheCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-scene-master')) {
			clusterRiskState = 'unverified-master'
		} else if (members.some(m => m.verdict === 'blocked-scene-master')) {
			clusterRiskState = 'scene-master'
		} else if (members.some(m => m.verdict === 'blocked-pbr-master-4k-8k')) {
			clusterRiskState = 'pbr-master'
		} else if ((hasPbrDownscale || hasBlenderBackup) && reclaimableCopiesCount > 0) {
			clusterRiskState = 'master-verified'
		} else if (hasEngineCache && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `game3d-asset-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allAssetTags = Array.from(new Set(members.flatMap(m => m.context.assetTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			assetLineageStem: survivor ? survivor.context.assetLineageStem : primaryInfo.assetLineageStem,
			pbrMaterialStem: survivor ? survivor.context.pbrMaterialStem : primaryInfo.pbrMaterialStem,
			assetTags: allAssetTags,
			assetSummary: allAssetTags.length > 0 ? allAssetTags.join(', ') : 'none',
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
			sceneMasterCopiesCount,
			pbrMasterCopiesCount,
			pbrDownscaleCopiesCount,
			blenderBackupCopiesCount,
			engineCacheCopiesCount,
			hasSceneMaster,
			hasPbrMaster,
			hasPbrDownscale,
			hasBlenderBackup,
			hasEngineCache,
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
			|| cluster.assetLineageStem.toLowerCase().includes(q)
			|| cluster.pbrMaterialStem.toLowerCase().includes(q)
			|| cluster.assetSummary.toLowerCase().includes(q)
			|| cluster.extension.toLowerCase().includes(q)
			|| cluster.familyLabel.toLowerCase().includes(q)
			|| cluster.governanceSummary.toLowerCase().includes(q)
		) {
			return true
		}
		return cluster.members.some(m => (
			m.normalizedPath.toLowerCase().includes(q)
			|| m.basename.toLowerCase().includes(q)
			|| m.context.assetTag.toLowerCase().includes(q)
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
		if (options.verdictFilter === 'scene-master' && !cluster.hasSceneMaster) {
			return false
		}
		if (options.verdictFilter === 'pbr-master' && !cluster.hasPbrMaster) {
			return false
		}
		if (options.verdictFilter === 'pbr-downscale' && !cluster.hasPbrDownscale) {
			return false
		}
		if (options.verdictFilter === 'blender-backup' && !cluster.hasBlenderBackup) {
			return false
		}
		if (options.verdictFilter === 'engine-cache' && !cluster.hasEngineCache) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.sceneMasterCopiesCount * 5 + a.pbrMasterCopiesCount * 4 + a.pbrDownscaleCopiesCount * 3 + a.blenderBackupCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.sceneMasterCopiesCount * 5 + b.pbrMasterCopiesCount * 4 + b.pbrDownscaleCopiesCount * 3 + b.blenderBackupCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalSceneMasterClusters = clusters.filter(c => c.hasSceneMaster || c.hasPbrMaster).length
	const totalPbrPyramidClusters = clusters.filter(c => c.hasPbrMaster || c.hasPbrDownscale).length
	const totalBlenderBackupClusters = clusters.filter(c => c.hasBlenderBackup).length
	const totalEngineCacheClusters = clusters.filter(c => c.hasEngineCache).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: GAME3D_ASSET_VAULT_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectSceneMasters: options.protectSceneMasters,
			protectPbrMasters: options.protectPbrMasters,
			keepRecentBackups: options.keepRecentBackups,
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
			totalSceneMasterClusters,
			totalPbrPyramidClusters,
			totalBlenderBackupClusters,
			totalEngineCacheClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for Game Engine, Blender Backup & 3D PBR Texture Vaults.
 *
 * @param {object} analysis Output from analyzeGame3dAssetVaultDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildGame3dAssetVaultScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-pbr-texture-downscales'

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
		'# Game Engine, Blender Backup & 3D PBR Texture Vault Auditor',
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
		lines.push('echo "No reclaimable engine caches, verified Blender/slicer backups, or verified PBR downscales under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_3d_artifact() {')
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
	lines.push('consolidate_3d_artifact() {')
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
			lines.push(`consolidate_3d_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_3d_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for Game Engine caches and Blender autosaves.
 *
 * @param {object} analysis Output from analyzeGame3dAssetVaultDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildGame3dAssetVaultSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for Game Engines, Blender backups & shader caches',
		'Library/ArtifactDB/',
		'Library/ShaderCache/',
		'Temp/',
		'DerivedDataCache/',
		'Intermediate/',
		'Saved/Autosaves/',
		'*.meshcache',
		'shader_cache_*.bin',
		'*.blend1',
		'*.blend2',
		'*.blend3',
		'autosave_*.blend',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.members && cluster.members.some(m => m.context.isSlicerGcodeExt) && !seen.has('*.gcode')) {
			lines.push('*.gcode')
			lines.push('*.bgcode')
			seen.add('*.gcode')
			seen.add('*.bgcode')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Game Engine, Blender & 3D PBR Vaults.
 *
 * @param {object} analysis Output from analyzeGame3dAssetVaultDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildGame3dAssetVaultCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Asset Name',
		'Asset Lineage Stem',
		'PBR Material Stem',
		'PBR Channel',
		'Resolution Tier',
		'Asset Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'3D Scene Master',
		'PBR 4K/8K Master',
		'Verified Master Conserved',
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
			const hasVerifiedMaster = member.context.isPbrDownscale
				? member.context.hasVerifiedPbrMaster
				: (member.context.isBlenderOrSlicerBackup
					? member.context.hasVerifiedSceneMaster
					: (member.context.isSceneMaster || member.context.isMasterPbr4kOr8k))
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.assetLineageStem,
				member.context.pbrMaterialStem,
				member.context.pbrChannel,
				member.context.resolutionTier ? member.context.resolutionTier.toUpperCase() : '',
				member.context.assetTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isSceneMaster ? 'yes' : 'no',
				member.context.isMasterPbr4kOr8k ? 'yes' : 'no',
				hasVerifiedMaster ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for Game Engine, Blender Backup & 3D PBR Texture Vaults.
 *
 * @param {object} analysis Output from analyzeGame3dAssetVaultDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildGame3dAssetVaultJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: GAME3D_ASSET_VAULT_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			assetLineageStem: cluster.assetLineageStem,
			pbrMaterialStem: cluster.pbrMaterialStem,
			assetTags: cluster.assetTags,
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
				assetLineageStem: member.context.assetLineageStem,
				pbrMaterialStem: member.context.pbrMaterialStem,
				pbrChannel: member.context.pbrChannel,
				resolutionTier: member.context.resolutionTier,
				authorityScore: member.context.authorityScore,
				hasVerifiedSceneMaster: member.context.hasVerifiedSceneMaster,
				hasVerifiedPbrMaster: member.context.hasVerifiedPbrMaster,
				override: member.override,
			})),
		})),
	}, null, 2)
}
