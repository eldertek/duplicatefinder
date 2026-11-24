/**
 * Pure 3D VFX Scene, Texture Mip Pyramid, Bake Sim Cache & Autosave Auditor.
 * Classifies and audits duplicate clusters across 4 3D/VFX domain families:
 * - 3D & VFX Scene Masters (.blend, .hip, .hiplc, .ma, .mb, .c4d, .usd, .usda, .usdc, .usdz in Master-Shot/ or Final/)
 * - Texture Mip Pyramids (_8K/_4K vs _2K/_1K/_512 _albedo/_normal/_roughness/.tx/.dds/.ktx2 sharing assetLineageStem)
 * - Sim, Bake & Frame Caches (.bphys, .vdb, .abc, .pc2, .mdd, DerivedDataCache/, Bake/, LightingData/, _preview.exr)
 * - Scene Autosave Generations (.blend1, .blend2, .autosave, .c4d.bak, .ma.swatches)
 *
 * Assigns 5 governance tiers:
 * - shot-master-vault (Master-Shot / Final Scene Vault; strictly protected by default)
 * - highres-texture-source (4K/8K High-Res Texture Source; strictly protected by default)
 * - published-usd-stage (Published USD Stage .usd/.usda/.usdc/.usdz; strictly protected by default)
 * - mip-downscale-twin (Downscaled mip or compressed texture twin; deletion blocked if no verified 4K/8K source is conserved)
 * - autosave-bake-cache (Reconstructible scene autosave, sim bake, DerivedDataCache, LightingData, or preview EXR)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const VFX_RENDER_CACHE_SCHEMA = 'duplicatefinder.vfx-render-cache-auditor.v1'

export const VFX_RENDER_FAMILIES = Object.freeze([
	'all',
	'vfx-scene-blend-masters',
	'texture-mip-pyramids',
	'sim-bake-frame-caches',
	'scene-autosave-generations',
])

export const VFX_RENDER_FAMILY_META = Object.freeze({
	'vfx-scene-blend-masters': {
		id: 'vfx-scene-blend-masters',
		label: '3D & VFX Scene Masters',
		shortLabel: 'Scene Masters (.blend/.hip/.ma/.c4d/.usd)',
	},
	'texture-mip-pyramids': {
		id: 'texture-mip-pyramids',
		label: 'Texture Mip Pyramids',
		shortLabel: 'Textures (_8K/_4K vs _2K/_1K/.tx/.dds/.ktx2)',
	},
	'sim-bake-frame-caches': {
		id: 'sim-bake-frame-caches',
		label: 'Sim, Bake & Frame Caches',
		shortLabel: 'Sim & Bake (.bphys/.vdb/.abc/DerivedDataCache)',
	},
	'scene-autosave-generations': {
		id: 'scene-autosave-generations',
		label: 'Scene Autosave Generations',
		shortLabel: 'Autosaves (.blend1/.blend2/.autosave/.c4d.bak)',
	},
})

export const VFX_RENDER_STRATEGIES = Object.freeze([
	'consolidate-shot-master-vault',
	'prune-autosave-bake-caches',
	'prune-downscaled-textures-when-source-verified',
])

export const VFX_RENDER_SURVIVOR_RULES = Object.freeze([
	'master-vault-and-usd-first',
	'highres-texture-first',
	'newest-scene-first',
	'shortest-path',
])

export const VFX_RENDER_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'master-vault',
	'highres-source',
	'usd-stage',
	'mip-downscale',
	'autosave-bake',
	'shielded',
])

export const VFX_RENDER_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const VFX_RENDER_PRESETS = Object.freeze([
	{
		id: 'all-vfx-render-audit',
		name: 'All 3D, VFX, Mip & Cache Audit',
		description: 'Audit 3D scene masters, 4K/8K vs downscaled texture mip pyramids, sim/bake caches, and autosave generations while shielding Master-Shot, Final, USD stages, and 4K/8K sources.',
		familyFilter: 'all',
		strategy: 'consolidate-shot-master-vault',
		survivorRule: 'master-vault-and-usd-first',
		protectShotMasterVault: true,
		protectHighresTextureSource: true,
		protectPublishedUsdStage: true,
		keepRecentAutosaves: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'prune-autosave-bake-caches',
		name: 'Prune Stale Autosave & Sim Caches',
		description: 'Safely reclaim aged .blend1/.blend2/.autosave/.c4d.bak/.ma.swatches and .bphys/.vdb/.abc/DerivedDataCache/Bake/LightingData/_preview.exr artifacts without touching scene masters.',
		familyFilter: 'sim-bake-frame-caches',
		strategy: 'prune-autosave-bake-caches',
		survivorRule: 'master-vault-and-usd-first',
		protectShotMasterVault: true,
		protectHighresTextureSource: true,
		protectPublishedUsdStage: true,
		keepRecentAutosaves: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'prune-downscales-when-highres-verified',
		name: 'Prune Downscaled Mips When 4K/8K Verified',
		description: 'Reclaim redundant _2K/_1K/_512 or .tx/.dds/.ktx2 downscales only when a verified 4K/8K texture source sharing the assetLineageStem and channel is conserved.',
		familyFilter: 'texture-mip-pyramids',
		strategy: 'prune-downscaled-textures-when-source-verified',
		survivorRule: 'highres-texture-first',
		protectShotMasterVault: true,
		protectHighresTextureSource: true,
		protectPublishedUsdStage: true,
		keepRecentAutosaves: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-shot-master-vault',
		name: 'Consolidate to Master-Shot & USD Vault',
		description: 'Keep canonical scenes inside Master-Shot/, Final/, or Published USD stages and consolidate stray copies from Downloads or staging directories.',
		familyFilter: 'vfx-scene-blend-masters',
		strategy: 'consolidate-shot-master-vault',
		survivorRule: 'master-vault-and-usd-first',
		protectShotMasterVault: true,
		protectHighresTextureSource: true,
		protectPublishedUsdStage: true,
		keepRecentAutosaves: 2,
		staleCacheDays: 30,
		minSizeMb: 0,
	},
	{
		id: 'scene-autosave-generations-sweep',
		name: 'Scene Autosave Generations Sweep',
		description: 'Audit .blend1, .blend2, .autosave, .c4d.bak, and .ma.swatches backup generations against active scene files.',
		familyFilter: 'scene-autosave-generations',
		strategy: 'prune-autosave-bake-caches',
		survivorRule: 'newest-scene-first',
		protectShotMasterVault: true,
		protectHighresTextureSource: true,
		protectPublishedUsdStage: true,
		keepRecentAutosaves: 2,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
])

const VFX_SCENE_EXT_SET = new Set([
	'blend', 'hip', 'hiplc', 'ma', 'mb', 'c4d', 'usd', 'usda', 'usdc', 'usdz',
])

const USD_STAGE_EXT_SET = new Set([
	'usd', 'usda', 'usdc', 'usdz',
])

const TEXTURE_EXT_SET = new Set([
	'tx', 'dds', 'ktx2', 'exr', 'tif', 'tiff', 'png', 'tga', 'hdr', 'jpg', 'jpeg', 'webp',
])

const COMPRESSED_MIP_EXT_SET = new Set([
	'tx', 'dds', 'ktx2',
])

const SIM_BAKE_EXT_SET = new Set([
	'bphys', 'vdb', 'abc', 'pc2', 'mdd',
])

const AUTOSAVE_EXT_SET = new Set([
	'autosave',
])

const MASTER_SHOT_PATH_RE = /(\/(?:master[-_ ]?shots?|finals?|shot[-_ ]?vault|master[-_ ]?vault|published[-_ ]?shots?|approved[-_ ]?scenes?)(?:\/|$)|\/__groupfolders\/\d+\/(?:master[-_ ]?shots?|finals?|shots?|usd|scenes?))/i
const PUBLISHED_USD_PATH_RE = /(\/(?:usd|published[-_ ]?usd|usd[-_ ]?stages?|stages?|published)(?:\/|$))/i
const SIM_BAKE_PATH_RE = /(\/(?:deriveddatacache|bake|bakes|lightingdata|sim[-_ ]?cache|fluid[-_ ]?cache|cloth[-_ ]?cache|render[-_ ]?cache|point[-_ ]?cache)(?:\/|$))/i
const HIGHRES_TEXTURE_PATH_RE = /(\/(?:textures[-_ ]?(?:8k|4k|source|masters?)|highres[-_ ]?textures?|source[-_ ]?textures?|8k|4k)(?:\/|$))/i
const MIP_DOWNSCALE_PATH_RE = /(\/(?:mips?|mipmaps?|downscales?|textures[-_ ]?(?:2k|1k|512)|2k|1k|512|proxy[-_ ]?textures?)(?:\/|$))/i
const TEXTURE_DIR_PATH_RE = /(\/(?:textures?|tex|materials?|shaders?|lookdev|maps?)(?:\/|$))/i
const AUTOSAVE_PATH_RE = /(\/(?:autosaves?|autoback|scene[-_ ]?backups?|incremental[-_ ]?saves?)(?:\/|$))/i
const STAGING_BLOAT_PATH_RE = /(\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/|\/incoming\/|\/staging\/|\/wetransfer\/)/i

const HIGHRES_MARKER_RE = /(?:^|[_\-.\s])(8k|4k|uhd|8192|4096)(?=$|[_\-.\s])/i
const DOWNSCALE_MARKER_RE = /(?:^|[_\-.\s])(2k|1k|512|256|2048|1024|mip\d*|lod\d*)(?=$|[_\-.\s])/i
const TEXTURE_CHANNEL_RE = /(?:^|[_\-.\s])(albedo|normal|roughness|metallic|metalness|ao|ambient[-_]?occlusion|height|displacement|disp|emissive|specular|diffuse|bump|opacity|arm|orm)(?=$|[_\-.\s])/i
const PREVIEW_EXR_RE = /_preview\.exr$/i
const SCENE_MASTER_MARKER_RE = /(?:^|[_\-.\s])(master|final|published|hero|shot|sh\d+|seq\d+|lookdev|anim|rig|lighting)(?=$|[_\-.\s])/i

const LINEAGE_STRIP_TAG_RE = /(?:^|[_\-.\s])(8k|4k|2k|1k|512|256|8192|4096|2048|1024|uhd|mip\d*|lod\d*|albedo|normal|roughness|metallic|metalness|ao|height|displacement|disp|emissive|specular|diffuse|bump|opacity|arm|orm|v\d+(?:\.\d+)?|rev\d+|r\d+|master|final|published|preview|bake|cache|autosave)(?=$|[_\-.\s])/gi
const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b|\[\d{4}-\d{2}-\d{2}[^\]]*\]/gi

const TIER_LABELS = Object.freeze({
	'shot-master-vault': 'Master-Shot / Final Scene Vault',
	'highres-texture-source': 'High-Res 4K/8K Texture Source',
	'published-usd-stage': 'Published USD Stage',
	'mip-downscale-twin': 'Downscaled Mip / Compressed Texture Twin',
	'autosave-bake-cache': 'Autosave, Sim & Bake Cache',
})

const TIER_AUTHORITY = Object.freeze({
	'shot-master-vault': 99,
	'published-usd-stage': 96,
	'highres-texture-source': 93,
	'mip-downscale-twin': 34,
	'autosave-bake-cache': 16,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical VFX Anchor',
	'consolidate-to-shot-master-vault': 'Consolidate to Master-Shot Vault',
	'reclaim-autosave-bake-cache': 'Prune Stale Autosave / Sim Cache',
	'reclaim-downscale-mip': 'Prune Verified Downscaled Mip',
	'blocked-shot-master-vault': 'Blocked: Master-Shot / Final Guard',
	'blocked-published-usd-stage': 'Blocked: Published USD Stage Guard',
	'blocked-highres-texture-source': 'Protected: High-Res 4K/8K Texture Source',
	'blocked-unverified-highres-source': 'Blocked: No Verified 4K/8K Source Conserved',
	'blocked-not-autosave-bake-cache': 'Shielded: Non-Cache Scene / Texture Asset',
	'blocked-fresh-autosave-bake-cache': 'Shielded: Recent Autosave / Sim Cache',
	'blocked-not-mip-downscale': 'Shielded: Non-Downscale VFX Artifact',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
})

const FAMILY_PRIORITY = Object.freeze({
	'vfx-scene-blend-masters': 4,
	'texture-mip-pyramids': 3,
	'sim-bake-frame-caches': 2,
	'scene-autosave-generations': 1,
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
 * Extract compound or single lowercase extension without leading dot.
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Extension string or empty string.
 */
function extractCompoundExtension(lowerBase) {
	for (const compound of ['c4d.bak', 'ma.swatches', 'mb.swatches', 'hip.bak', 'vdb.tmp']) {
		if (lowerBase.endsWith(`.${compound}`)) {
			return compound
		}
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Normalize a 3D/VFX asset stem into a canonical assetLineageStem for mip/scene matching.
 *
 * @param {string} rawStem Raw stem without extension.
 * @return {string} Clean canonical assetLineageStem.
 */
function normalizeVfxLineageStem(rawStem) {
	let stem = String(rawStem || '')
		.replace(COPY_SUFFIX_RE, '')
		.trim()

	let prev
	do {
		prev = stem
		stem = stem.replace(LINEAGE_STRIP_TAG_RE, '')
	} while (stem !== prev)

	stem = stem
		.replace(/[-_.\s]{2,}/g, '_')
		.replace(/^[\s_.-]+|[\s_.-]+$/g, '')

	return stem || String(rawStem || '').replace(COPY_SUFFIX_RE, '').trim()
}

/**
 * Extract normalized texture channel token when present.
 *
 * @param {string} cleanRawStem Clean raw stem.
 * @return {string} Lowercase channel name or empty string.
 */
function extractTextureChannel(cleanRawStem) {
	const match = cleanRawStem.match(TEXTURE_CHANNEL_RE)
	if (!match || !match[1]) {
		return ''
	}
	const raw = match[1].toLowerCase()
	if (raw === 'metalness') {
		return 'metallic'
	}
	if (raw === 'disp') {
		return 'displacement'
	}
	if (raw === 'ambient_occlusion' || raw === 'ambient-occlusion') {
		return 'ao'
	}
	return raw
}

/**
 * Build the channel-aware lineage lookup key for texture source conservation checks.
 *
 * @param {string} assetLineageStem Normalized asset lineage stem.
 * @param {string} textureChannel Normalized texture channel or empty string.
 * @return {string} Lookup key.
 */
function buildTextureLineageKey(assetLineageStem, textureChannel) {
	const stemLower = String(assetLineageStem || '').toLowerCase()
	const chanLower = String(textureChannel || '').toLowerCase()
	return `${stemLower}::${chanLower || '*'}`
}

/**
 * Parse 3D scene, texture mip pyramid, sim/bake cache, and autosave metadata from basename and path.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Parsed assetLineageStem, tags, format flags, and governance cues.
 */
export function parseVfxRenderArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const ext = extractCompoundExtension(lowerBase)

	let rawStem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		rawStem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}
	const cleanRawStem = rawStem.replace(COPY_SUFFIX_RE, '').trim() || rawStem

	const isBlendBackupExt = /^blend\d+$/i.test(ext)
	const isCompoundAutosaveExt = ext === 'c4d.bak' || ext === 'ma.swatches' || ext === 'mb.swatches' || ext === 'hip.bak'
	const isAutosaveExt = AUTOSAVE_EXT_SET.has(ext) || isBlendBackupExt || isCompoundAutosaveExt
	const isPreviewExr = PREVIEW_EXR_RE.test(lowerBase)
	const isVdbTmp = ext === 'vdb.tmp'
	const isSimBakeExt = SIM_BAKE_EXT_SET.has(ext) || isVdbTmp
	const isUsdExt = USD_STAGE_EXT_SET.has(ext)
	const isSceneExt = VFX_SCENE_EXT_SET.has(ext)
	const isTextureExt = TEXTURE_EXT_SET.has(ext) && !isPreviewExr
	const isCompressedMipExt = COMPRESSED_MIP_EXT_SET.has(ext)

	const isMasterShotPath = MASTER_SHOT_PATH_RE.test(lowerPath)
	const isPublishedUsdPath = PUBLISHED_USD_PATH_RE.test(lowerPath)
	const isSimBakePath = SIM_BAKE_PATH_RE.test(lowerPath)
	const isHighresTexturePath = HIGHRES_TEXTURE_PATH_RE.test(lowerPath)
	const isMipDownscalePath = MIP_DOWNSCALE_PATH_RE.test(lowerPath)
	const isTextureDirPath = TEXTURE_DIR_PATH_RE.test(lowerPath)
	const isAutosavePath = AUTOSAVE_PATH_RE.test(lowerPath)
	const isStagingBloatPath = STAGING_BLOAT_PATH_RE.test(lowerPath)

	const hasHighresMarker = HIGHRES_MARKER_RE.test(cleanRawStem)
	const hasDownscaleMarker = DOWNSCALE_MARKER_RE.test(cleanRawStem)
	const textureChannel = extractTextureChannel(cleanRawStem)
	const hasTextureChannelMarker = Boolean(textureChannel)
	const hasSceneMasterMarker = SCENE_MASTER_MARKER_RE.test(cleanRawStem)

	const isAutosaveGeneration = isAutosaveExt || (isAutosavePath && !isMasterShotPath && !isPublishedUsdPath)
	const isSimBakeCache = !isAutosaveGeneration && (isSimBakeExt || isPreviewExr || (isSimBakePath && !isSceneExt && !isMasterShotPath && !isPublishedUsdPath))

	const isHighresTextureCandidate = !isAutosaveGeneration && !isSimBakeCache && isTextureExt && (
		hasHighresMarker || isHighresTexturePath
	)
	const isMipDownscaleCandidate = !isAutosaveGeneration && !isSimBakeCache && !isHighresTextureCandidate && (
		isCompressedMipExt
		|| (isTextureExt && (hasDownscaleMarker || isMipDownscalePath))
	)
	const isTexturePyramidCandidate = isHighresTextureCandidate || isMipDownscaleCandidate || (
		!isAutosaveGeneration && !isSimBakeCache && isTextureExt && (hasTextureChannelMarker || isTextureDirPath)
	)

	const isSceneMasterCandidate = !isAutosaveGeneration && !isSimBakeCache && (
		isSceneExt
		|| (!isTexturePyramidCandidate && isMasterShotPath && hasSceneMasterMarker)
	)

	const assetLineageStem = normalizeVfxLineageStem(cleanRawStem) || cleanRawStem || rawBase

	const artifactTags = []
	const pushTag = tag => {
		const norm = String(tag || '').trim()
		if (norm && !artifactTags.includes(norm)) {
			artifactTags.push(norm)
		}
	}

	if (isSceneExt) {
		pushTag(`scene:${ext}`)
	}
	if (isUsdExt || isPublishedUsdPath) {
		pushTag('usd-stage')
	}
	if (isMasterShotPath) {
		pushTag('master-shot')
	}
	if (hasHighresMarker) {
		const resMatch = cleanRawStem.match(HIGHRES_MARKER_RE)
		pushTag(resMatch && resMatch[1] ? resMatch[1].toUpperCase() : 'highres')
	}
	if (hasDownscaleMarker) {
		const downMatch = cleanRawStem.match(DOWNSCALE_MARKER_RE)
		pushTag(downMatch && downMatch[1] ? downMatch[1].toUpperCase() : 'downscale')
	}
	if (textureChannel) {
		pushTag(textureChannel)
	}
	if (isCompressedMipExt) {
		pushTag(`mip:${ext}`)
	}
	if (isSimBakeCache) {
		pushTag(isPreviewExr ? 'preview-exr' : (isSimBakeExt ? `sim:${ext}` : 'bake-cache'))
	}
	if (isAutosaveGeneration) {
		pushTag(ext ? `autosave:${ext}` : 'autosave')
	}

	return {
		rawStem: cleanRawStem,
		assetLineageStem,
		textureChannel,
		textureLineageKey: buildTextureLineageKey(assetLineageStem, textureChannel),
		extension: ext,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isBlendBackupExt,
		isCompoundAutosaveExt,
		isAutosaveExt,
		isPreviewExr,
		isVdbTmp,
		isSimBakeExt,
		isUsdExt,
		isSceneExt,
		isTextureExt,
		isCompressedMipExt,
		isMasterShotPath,
		isPublishedUsdPath,
		isSimBakePath,
		isHighresTexturePath,
		isMipDownscalePath,
		isTextureDirPath,
		isAutosavePath,
		isStagingBloatPath,
		hasHighresMarker,
		hasDownscaleMarker,
		hasTextureChannelMarker,
		hasSceneMasterMarker,
		isAutosaveGeneration,
		isSimBakeCache,
		isHighresTextureCandidate,
		isMipDownscaleCandidate,
		isTexturePyramidCandidate,
		isSceneMasterCandidate,
	}
}

/**
 * Build dataset-wide lineage hints for conserved 4K/8K texture sources.
 * Respects operator exclude overrides so excluded sources are not counted as conserved.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [memberOverrides={}] Operator member overrides keyed by selectionKey.
 * @return {object} Dataset texture lineage hints.
 */
function buildDatasetVfxHints(duplicates, memberOverrides = {}) {
	const highresSourceKeys = new Set()
	const highresSourceStems = new Set()
	const highresPathsByKey = new Map()

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
			const info = parseVfxRenderArtifactInfo(extractBasename(normalized), normalized)
			const isHighres = info.isHighresTextureCandidate
				|| (!info.isAutosaveGeneration && !info.isSimBakeCache && info.isTextureExt && file.highresSourceVerified === true)
			if (isHighres) {
				const stemLower = info.assetLineageStem.toLowerCase()
				if (stemLower) {
					highresSourceStems.add(stemLower)
					highresSourceKeys.add(info.textureLineageKey)
					if (!info.textureChannel) {
						highresSourceKeys.add(`${stemLower}::*`)
					}
					if (!highresPathsByKey.has(info.textureLineageKey)) {
						highresPathsByKey.set(info.textureLineageKey, [])
					}
					highresPathsByKey.get(info.textureLineageKey).push(normalized)
				}
			}
		}
	}

	return {
		highresSourceKeys,
		highresSourceStems,
		highresPathsByKey,
	}
}

/**
 * Check whether a verified 4K/8K texture source sharing assetLineageStem and channel is conserved.
 *
 * @param {object} info Parsed artifact metadata.
 * @param {object|null} hints Dataset or cluster hints.
 * @return {boolean} True when a verified 4K/8K source exists for this texture lineage.
 */
function hasMatchingHighresSource(info, hints) {
	if (!hints || !hints.highresSourceKeys) {
		return false
	}
	const stemLower = String(info.assetLineageStem || '').toLowerCase()
	if (!stemLower) {
		return false
	}
	if (hints.highresSourceKeys.has(info.textureLineageKey)) {
		return true
	}
	if (!info.textureChannel && hints.highresSourceStems && hints.highresSourceStems.has(stemLower)) {
		return true
	}
	return hints.highresSourceKeys.has(`${stemLower}::*`)
}

/**
 * Classify a file path into one of the 4 3D/VFX Scene, Texture Mip, Sim/Bake, and Autosave families.
 *
 * @param {string} rawPath File path.
 * @param {object} [hints=null] Optional dataset hints (highresSourceKeys).
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyVfxRenderArtifact(rawPath, hints = null) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const info = parseVfxRenderArtifactInfo(basename, normalized)

	if (info.isAutosaveGeneration) {
		return {
			matched: true,
			family: 'scene-autosave-generations',
			familyLabel: VFX_RENDER_FAMILY_META['scene-autosave-generations'].label,
			sharesHighresLineage: false,
			...info,
		}
	}

	if (info.isSimBakeCache) {
		return {
			matched: true,
			family: 'sim-bake-frame-caches',
			familyLabel: VFX_RENDER_FAMILY_META['sim-bake-frame-caches'].label,
			sharesHighresLineage: false,
			...info,
		}
	}

	const sharesHighresLineage = hasMatchingHighresSource(info, hints)

	if (info.isTexturePyramidCandidate || (info.isTextureExt && sharesHighresLineage)) {
		return {
			matched: true,
			family: 'texture-mip-pyramids',
			familyLabel: VFX_RENDER_FAMILY_META['texture-mip-pyramids'].label,
			sharesHighresLineage: info.isHighresTextureCandidate || sharesHighresLineage,
			...info,
		}
	}

	if (info.isSceneMasterCandidate) {
		return {
			matched: true,
			family: 'vfx-scene-blend-masters',
			familyLabel: VFX_RENDER_FAMILY_META['vfx-scene-blend-masters'].label,
			sharesHighresLineage: false,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, verified 4K/8K texture source presence, and authority context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {object} options Normalized options (keepRecentAutosaves, staleCacheDays).
 * @param {object} [clusterHints={}] Dataset and cluster verification hints.
 * @return {object} Member governance and verification context.
 */
export function inspectVfxRenderMemberContext(file, classification, referenceTimeSec, options, clusterHints = {}) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const parsed = parseVfxRenderArtifactInfo(basename, normalizedPath)
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const isAutosaveOrBake = Boolean(
		parsed.isAutosaveGeneration
		|| parsed.isSimBakeCache
		|| classification.family === 'scene-autosave-generations'
		|| classification.family === 'sim-bake-frame-caches'
	)

	const isShotMasterVault = Boolean(
		!isAutosaveOrBake
		&& !parsed.isStagingBloatPath
		&& !parsed.isTextureExt
		&& (parsed.isMasterShotPath || (file && file.isShotMasterVault === true))
	)

	const isPublishedUsdStage = Boolean(
		!isAutosaveOrBake
		&& !parsed.isStagingBloatPath
		&& (parsed.isUsdExt || (parsed.isSceneExt && parsed.isPublishedUsdPath) || (file && file.isPublishedUsdStage === true))
	)

	const isHighresTextureSource = Boolean(
		!isAutosaveOrBake
		&& !parsed.isStagingBloatPath
		&& parsed.isTextureExt
		&& (
			parsed.isHighresTextureCandidate
			|| (file && file.highresSourceVerified === true)
		)
	)

	const isMipDownscaleTwin = Boolean(
		!isAutosaveOrBake
		&& !isHighresTextureSource
		&& (
			parsed.isMipDownscaleCandidate
			|| (!parsed.isSceneExt && classification.family === 'texture-mip-pyramids' && !parsed.isHighresTextureCandidate)
		)
	)

	const hasVerifiedHighresSource = Boolean(
		isHighresTextureSource
		|| (file && file.highresSourceVerified === true)
		|| clusterHints.clusterHasConservedHighresSource
		|| hasMatchingHighresSource(parsed, clusterHints)
	)

	const isStaleAutosaveBakeCache = Boolean(
		isAutosaveOrBake
		&& (ageDays === null || ageDays >= options.staleCacheDays)
	)

	let tier = 'autosave-bake-cache'
	if (isShotMasterVault) {
		tier = 'shot-master-vault'
	} else if (isPublishedUsdStage) {
		tier = 'published-usd-stage'
	} else if (isHighresTextureSource) {
		tier = 'highres-texture-source'
	} else if (isAutosaveOrBake) {
		tier = 'autosave-bake-cache'
	} else if (isMipDownscaleTwin) {
		tier = 'mip-downscale-twin'
	} else if (parsed.isSceneExt) {
		tier = 'published-usd-stage'
	} else {
		tier = 'mip-downscale-twin'
	}

	let authorityScore = TIER_AUTHORITY[tier] || 50
	if (parsed.isSceneExt && !isShotMasterVault && !isPublishedUsdStage) {
		authorityScore = 76
	}
	if (parsed.hasHighresMarker && parsed.isStagingBloatPath) {
		authorityScore = 64
	}
	if (parsed.isMasterShotPath && parsed.isUsdExt) {
		authorityScore += 2
	}
	if (parsed.isStagingBloatPath) {
		authorityScore -= 18
	}
	if (isStaleAutosaveBakeCache) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['autosave-bake-cache'],
		authorityScore,
		extension: parsed.extension || classification.extension || '',
		rawStem: parsed.rawStem,
		assetLineageStem: parsed.assetLineageStem,
		textureChannel: parsed.textureChannel,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isShotMasterVault,
		isPublishedUsdStage,
		isHighresTextureSource,
		isMipDownscaleTwin,
		isAutosaveOrBake,
		isAutosaveGeneration: parsed.isAutosaveGeneration,
		isSimBakeCache: parsed.isSimBakeCache,
		hasVerifiedHighresSource,
		isStaleAutosaveBakeCache,
		isStagingBloatPath: parsed.isStagingBloatPath,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a 3D/VFX duplicate cluster.
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
		if (survivorRule === 'highres-texture-first') {
			if (a.context.isHighresTextureSource !== b.context.isHighresTextureSource) {
				return a.context.isHighresTextureSource ? -1 : 1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-scene-first') {
			const tsA = a.context.mtimeSec ?? -1
			const tsB = b.context.mtimeSec ?? -1
			if (tsA !== tsB) {
				return tsB - tsA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'shortest-path') {
			if (a.normalizedPath.length !== b.normalizedPath.length) {
				return a.normalizedPath.length - b.normalizedPath.length
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else {
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
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
 * Determine the deterministic audit verdict for a 3D/VFX cluster member.
 *
 * @param {object} member Enriched member object.
 * @param {object|null} survivor Selected canonical survivor.
 * @param {object} options Normalized analysis options.
 * @param {Set<string>} forceKeepKeys Operator force-keep keys.
 * @param {Set<string>} excludeKeys Operator exclude keys.
 * @return {{ verdict: string, verdictLabel: string, actionKind: string, note: string }}
 */
function resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys) {
	if (excludeKeys.has(member.selectionKey)) {
		return {
			verdict: 'excluded',
			verdictLabel: VERDICT_LABELS.excluded,
			actionKind: 'exclude',
			note: 'Excluded from 3D & VFX audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative pipeline anchor.`,
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

	if (options.protectShotMasterVault && member.context.isShotMasterVault) {
		return {
			verdict: 'blocked-shot-master-vault',
			verdictLabel: VERDICT_LABELS['blocked-shot-master-vault'],
			actionKind: 'shield',
			note: 'Strictly protected by Master-Shot / Final Scene Vault Guard; master shots are never pruned automatically.',
		}
	}

	if (options.protectPublishedUsdStage && member.context.isPublishedUsdStage) {
		return {
			verdict: 'blocked-published-usd-stage',
			verdictLabel: VERDICT_LABELS['blocked-published-usd-stage'],
			actionKind: 'shield',
			note: 'Strictly protected by Published USD Stage Guard; .usd/.usda/.usdc/.usdz stages are never pruned automatically.',
		}
	}

	if (options.protectHighresTextureSource && member.context.isHighresTextureSource) {
		return {
			verdict: 'blocked-highres-texture-source',
			verdictLabel: VERDICT_LABELS['blocked-highres-texture-source'],
			actionKind: 'shield',
			note: 'Strictly protected by High-Res 4K/8K Texture Source Guard; source maps are conserved before any mip pruning.',
		}
	}

	if (options.strategy === 'prune-autosave-bake-caches') {
		if (!member.context.isAutosaveOrBake) {
			return {
				verdict: 'blocked-not-autosave-bake-cache',
				verdictLabel: VERDICT_LABELS['blocked-not-autosave-bake-cache'],
				actionKind: 'shield',
				note: 'Shielded by Autosave & Sim Cache strategy because member is not an autosave generation or reconstructible sim/bake cache.',
			}
		}
		if (!member.context.isStaleAutosaveBakeCache) {
			return {
				verdict: 'blocked-fresh-autosave-bake-cache',
				verdictLabel: VERDICT_LABELS['blocked-fresh-autosave-bake-cache'],
				actionKind: 'shield',
				note: `Shielded because autosave/bake cache age is below stale threshold (${options.staleCacheDays}d).`,
			}
		}
		return {
			verdict: 'reclaim-autosave-bake-cache',
			verdictLabel: VERDICT_LABELS['reclaim-autosave-bake-cache'],
			actionKind: 'reclaim',
			note: 'Stale reconstructible autosave, sim bake, DerivedDataCache, or preview EXR artifact safe to prune after SHA-256 verification.',
		}
	}

	if (options.strategy === 'prune-downscaled-textures-when-source-verified') {
		if (options.protectHighresTextureSource && member.context.isHighresTextureSource) {
			return {
				verdict: 'blocked-highres-texture-source',
				verdictLabel: VERDICT_LABELS['blocked-highres-texture-source'],
				actionKind: 'shield',
				note: 'Protected 4K/8K high-resolution texture source; never pruned during mip pyramid sweep.',
			}
		}
		if (!member.context.isMipDownscaleTwin) {
			return {
				verdict: 'blocked-not-mip-downscale',
				verdictLabel: VERDICT_LABELS['blocked-not-mip-downscale'],
				actionKind: 'shield',
				note: 'Shielded by Downscaled Mip Pruner because member is not a _2K/_1K/_512 or .tx/.dds/.ktx2 downscale twin.',
			}
		}
		if (!member.context.hasVerifiedHighresSource) {
			return {
				verdict: 'blocked-unverified-highres-source',
				verdictLabel: VERDICT_LABELS['blocked-unverified-highres-source'],
				actionKind: 'shield',
				note: 'Blocked because no verified 4K/8K texture source sharing this assetLineageStem is conserved; downscaled mip cannot be deleted safely.',
			}
		}
		return {
			verdict: 'reclaim-downscale-mip',
			verdictLabel: VERDICT_LABELS['reclaim-downscale-mip'],
			actionKind: 'reclaim',
			note: 'Redundant downscaled mip whose 4K/8K source texture is verified and conserved; safe to prune.',
		}
	}

	if (member.context.isMipDownscaleTwin && !member.context.hasVerifiedHighresSource) {
		return {
			verdict: 'blocked-unverified-highres-source',
			verdictLabel: VERDICT_LABELS['blocked-unverified-highres-source'],
			actionKind: 'shield',
			note: 'Blocked because no verified 4K/8K texture source sharing this assetLineageStem is conserved; downscaled mip is shielded.',
		}
	}

	return {
		verdict: 'consolidate-to-shot-master-vault',
		verdictLabel: VERDICT_LABELS['consolidate-to-shot-master-vault'],
		actionKind: 'consolidate',
		note: 'Consolidate identical-hash VFX/3D copy against canonical Master-Shot, USD stage, or 4K/8K anchor using SHA-256 and stat device checks.',
	}
}

/**
 * Normalize 3D VFX Render Cache auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = VFX_RENDER_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = VFX_RENDER_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = VFX_RENDER_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = VFX_RENDER_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-shot-master-vault'
	const survivorRule = VFX_RENDER_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'master-vault-and-usd-first'

	const parsedKeep = Number.parseInt(rawOptions.keepRecentAutosaves, 10)
	const keepRecentAutosaves = Number.isFinite(parsedKeep) && parsedKeep >= 1
		? Math.min(parsedKeep, 100)
		: 2

	const parsedDays = Number.parseInt(rawOptions.staleCacheDays, 10)
	const staleCacheDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 30

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
		protectShotMasterVault: rawOptions.protectShotMasterVault !== false,
		protectHighresTextureSource: rawOptions.protectHighresTextureSource !== false,
		protectPublishedUsdStage: rawOptions.protectPublishedUsdStage !== false,
		keepRecentAutosaves,
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
 * Audit duplicate groups for 3D/VFX Scenes, Texture Mip Pyramids, Sim/Bake Caches & Autosave Generations.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeVfxRenderDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeMb * 1024 * 1024

	const datasetHints = buildDatasetVfxHints(safeDuplicates, options.memberOverrides)

	const familyCounts = {
		all: 0,
		'vfx-scene-blend-masters': 0,
		'texture-mip-pyramids': 0,
		'sim-bake-frame-caches': 0,
		'scene-autosave-generations': 0,
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
			const info = classifyVfxRenderArtifact(file.path, datasetHints)
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

		const clusterHasConservedHighresSource = validFiles.some((file, fileIdx) => {
			const selectionKey = String(getFileSelectionKey(file) ?? `${groupIdx}-${fileIdx}`)
			if (options.memberOverrides[selectionKey] === 'exclude') {
				return false
			}
			const normalized = normalizePathForDiff(file.path) || String(file.path || '')
			const parsed = parseVfxRenderArtifactInfo(extractBasename(normalized), normalized)
			return Boolean(
				parsed.isHighresTextureCandidate
				|| (!parsed.isAutosaveGeneration && !parsed.isSimBakeCache && parsed.isTextureExt && file.highresSourceVerified === true)
			)
		})

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

			const directInfo = classifyVfxRenderArtifact(file.path, datasetHints)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectVfxRenderMemberContext(
				file,
				memberInfo,
				options.referenceTimeSec,
				options,
				{
					...datasetHints,
					clusterHasConservedHighresSource,
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
		for (const member of members) {
			const verdictInfo = resolveMemberVerdict(member, survivor, options, forceKeepKeys, excludeKeys)
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
		const masterVaultCopiesCount = members.filter(m => m.context.isShotMasterVault).length
		const highresSourceCopiesCount = members.filter(m => m.context.isHighresTextureSource).length
		const usdStageCopiesCount = members.filter(m => m.context.isPublishedUsdStage).length
		const mipDownscaleCopiesCount = members.filter(m => m.context.isMipDownscaleTwin).length
		const autosaveBakeCopiesCount = members.filter(m => m.context.isAutosaveOrBake).length

		const hasMasterVault = masterVaultCopiesCount > 0
		const hasHighresSource = highresSourceCopiesCount > 0
		const hasUsdStage = usdStageCopiesCount > 0
		const hasMipDownscales = mipDownscaleCopiesCount > 0
		const hasAutosaveBakeCaches = autosaveBakeCopiesCount > 0

		let clusterRiskState = 'reclaimable'
		if (members.some(m => m.verdict === 'blocked-unverified-highres-source')) {
			clusterRiskState = 'unverified-highres'
		} else if (members.some(m => m.verdict === 'blocked-shot-master-vault')) {
			clusterRiskState = 'master-vault'
		} else if (members.some(m => m.verdict === 'blocked-published-usd-stage')) {
			clusterRiskState = 'usd-stage'
		} else if (members.some(m => m.verdict === 'blocked-highres-texture-source')) {
			clusterRiskState = 'highres-source'
		} else if (hasAutosaveBakeCaches && reclaimableCopiesCount > 0) {
			clusterRiskState = 'reclaimable'
		} else if (hasMipDownscales && reclaimableCopiesCount > 0) {
			clusterRiskState = 'mip-verified'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `vfx-render-${groupIdx}`)
		const displayName = survivor ? survivor.basename : members[0].basename
		const governanceSignals = Array.from(new Set(members.map(m => m.tier)))
		const allArtifactTags = Array.from(new Set(members.flatMap(m => m.context.artifactTags)))

		rawClusters.push({
			groupKey,
			primaryGroupId,
			hash: group.hash || '',
			displayName,
			basename: displayName,
			assetLineageStem: survivor ? survivor.context.assetLineageStem : primaryInfo.assetLineageStem,
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
			masterVaultCopiesCount,
			highresSourceCopiesCount,
			usdStageCopiesCount,
			mipDownscaleCopiesCount,
			autosaveBakeCopiesCount,
			hasMasterVault,
			hasHighresSource,
			hasUsdStage,
			hasMipDownscales,
			hasAutosaveBakeCaches,
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
		if (options.verdictFilter === 'master-vault' && !cluster.hasMasterVault) {
			return false
		}
		if (options.verdictFilter === 'highres-source' && !cluster.hasHighresSource) {
			return false
		}
		if (options.verdictFilter === 'usd-stage' && !cluster.hasUsdStage) {
			return false
		}
		if (options.verdictFilter === 'mip-downscale' && !cluster.hasMipDownscales) {
			return false
		}
		if (options.verdictFilter === 'autosave-bake' && !cluster.hasAutosaveBakeCaches) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.masterVaultCopiesCount * 5 + a.usdStageCopiesCount * 4 + a.highresSourceCopiesCount * 3 + a.mipDownscaleCopiesCount * 2 + a.shieldedCopiesCount
			const riskB = b.masterVaultCopiesCount * 5 + b.usdStageCopiesCount * 4 + b.highresSourceCopiesCount * 3 + b.mipDownscaleCopiesCount * 2 + b.shieldedCopiesCount
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
	const totalMasterVaultClusters = clusters.filter(c => c.hasMasterVault || c.hasUsdStage).length
	const totalHighresSourceClusters = clusters.filter(c => c.hasHighresSource).length
	const totalMipDownscaleClusters = clusters.filter(c => c.hasMipDownscales).length
	const totalAutosaveBakeClusters = clusters.filter(c => c.hasAutosaveBakeCaches).length
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: VFX_RENDER_CACHE_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectShotMasterVault: options.protectShotMasterVault,
			protectHighresTextureSource: options.protectHighresTextureSource,
			protectPublishedUsdStage: options.protectPublishedUsdStage,
			keepRecentAutosaves: options.keepRecentAutosaves,
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
			totalMasterVaultClusters,
			totalHighresSourceClusters,
			totalMipDownscaleClusters,
			totalAutosaveBakeClusters,
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
 * Build a POSIX DRY_RUN=1 remediation script for 3D/VFX Scenes, Mip Pyramids, Sim/Bake Caches & Autosaves.
 *
 * @param {object} analysis Output from analyzeVfxRenderDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, sha256sum -- verification, stat cross-device guard, and DRY_RUN=1 default.
 */
export function buildVfxRenderScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-shot-master-vault'

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
		'# 3D VFX Scene, Texture Mip Pyramid, Bake Sim Cache & Autosave Auditor',
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
		lines.push('echo "No reclaimable or consolidatable 3D/VFX scene, mip downscale, sim bake, or autosave targets under current guards."')
		return lines.join('\n')
	}

	lines.push('prune_verified_vfx_artifact() {')
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
	lines.push('consolidate_shot_master_copy() {')
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
			lines.push(`consolidate_shot_master_copy ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`prune_verified_vfx_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for 3D autosaves and sim/bake caches.
 *
 * @param {object} analysis Output from analyzeVfxRenderDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildVfxRenderSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for 3D autosaves and sim/bake caches',
		'*.blend1',
		'*.blend2',
		'DerivedDataCache/',
		'*.bphys',
		'*.vdb.tmp',
		'*.autosave',
		'*.c4d.bak',
		'*.ma.swatches',
		'Bake/',
		'LightingData/',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'hip' && !seen.has('backup/')) {
			lines.push('backup/')
			seen.add('backup/')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for 3D/VFX Scenes, Mips, Sim Bakes & Autosaves.
 *
 * @param {object} analysis Output from analyzeVfxRenderDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildVfxRenderCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'VFX Asset or Scene Name',
		'Asset Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'Shot Master Vault',
		'Published USD Stage',
		'High-Res 4K/8K Source',
		'Verified 4K/8K Conserved',
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
			const row = [
				cluster.groupKey,
				cluster.basename,
				member.context.assetLineageStem,
				member.context.artifactTag,
				member.extension,
				cluster.familyLabel,
				member.tierLabel,
				member.context.isShotMasterVault ? 'yes' : 'no',
				member.context.isPublishedUsdStage ? 'yes' : 'no',
				member.context.isHighresTextureSource ? 'yes' : 'no',
				member.context.hasVerifiedHighresSource ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for 3D/VFX Scenes, Mips, Sim Bakes & Autosaves.
 *
 * @param {object} analysis Output from analyzeVfxRenderDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildVfxRenderJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: VFX_RENDER_CACHE_SCHEMA,
		generatedAt,
		options: safeAnalysis.options || {},
		summary: safeAnalysis.summary || {},
		clusters: (safeAnalysis.clusters || []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			basename: cluster.basename,
			assetLineageStem: cluster.assetLineageStem,
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
				ageDays: member.context.ageDays,
				tier: member.tier,
				assetLineageStem: member.context.assetLineageStem,
				textureChannel: member.context.textureChannel,
				artifactTags: member.context.artifactTags,
				isShotMasterVault: member.context.isShotMasterVault,
				isPublishedUsdStage: member.context.isPublishedUsdStage,
				isHighresTextureSource: member.context.isHighresTextureSource,
				isMipDownscaleTwin: member.context.isMipDownscaleTwin,
				isAutosaveOrBake: member.context.isAutosaveOrBake,
				hasVerifiedHighresSource: member.context.hasVerifiedHighresSource,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
