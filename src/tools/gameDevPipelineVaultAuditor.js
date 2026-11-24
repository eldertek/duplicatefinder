/**
 * Pure Game Dev, Unity/Unreal & 3D Asset Pipeline Vault Auditor.
 * Classifies and audits duplicate clusters across 4 Game Dev & 3D Pipeline families:
 * - DCC & 3D Source Meshes (*.blend, *.fbx, *.glb, *.gltf, *.abc, *.usd, *.usda, *.usdc, *.usdz, *.obj, *.dae)
 * - Unity & Unreal Scenes, Prefabs & Materials (*.uasset, *.umap, *.uproject, *.upack, *.unity, *.prefab, *.mat, *.asset, *.controller, *.anim, *.unitypackage)
 * - Pipeline Textures & HDR/GPU Maps (*.exr, *.hdr, *.dds, *.tga, *.ktx2, *.ktx, *.astc, *.basis, and PBR/lightmap textures)
 * - Unity/Unreal Ephemeral Caches (Library/, Intermediate/, DerivedDataCache/, Temp/, Saved/Autosaves/, Saved/Cooked/, .godot/imported/, *.ddc, *.ushaderbytecode, *.shaderbin, *.blend1-2)
 *
 * Distinguishes identical mesh/texture asset duplicates from regenerable engine caches,
 * tracks cross-artifact DCC (.blend/.fbx) and scene/prefab (.unity/.prefab/.uasset/.umap) availability,
 * shields DCC sources and scenes/prefabs by default, and generates POSIX DRY_RUN=1 remediation scripts,
 * CWE-1236-safe CSV exports, JSON manifests, and .sync-exclude.lst rules.
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const GAME_DEV_PIPELINE_VAULT_SCHEMA = 'duplicatefinder.game-dev-pipeline-vault-auditor.v1'

export const GAME_DEV_PIPELINE_FAMILIES = Object.freeze([
	'all',
	'dcc-source-meshes',
	'engine-scenes-prefabs',
	'pipeline-textures-hdr',
	'engine-ephemeral-caches',
])

export const GAME_DEV_PIPELINE_FAMILY_META = Object.freeze({
	'dcc-source-meshes': {
		id: 'dcc-source-meshes',
		label: 'DCC & 3D Source Meshes',
		shortLabel: 'DCC Sources (.blend, .fbx, .glb, .gltf, .usd, .abc)',
	},
	'engine-scenes-prefabs': {
		id: 'engine-scenes-prefabs',
		label: 'Unity & Unreal Scenes / Prefabs',
		shortLabel: 'Scenes & Prefabs (.uasset, .umap, .unity, .prefab, .mat)',
	},
	'pipeline-textures-hdr': {
		id: 'pipeline-textures-hdr',
		label: 'Pipeline Textures & HDR/GPU',
		shortLabel: 'Textures (.exr, .hdr, .dds, .tga, .ktx2)',
	},
	'engine-ephemeral-caches': {
		id: 'engine-ephemeral-caches',
		label: 'Engine Ephemeral Caches',
		shortLabel: 'Regenerable Caches (Library/, Intermediate/, DerivedDataCache/, Temp/)',
	},
})

export const GAME_DEV_PIPELINE_STRATEGIES = Object.freeze([
	'prune-engine-caches-keep-sources',
	'consolidate-mesh-texture-hardlinks',
	'prune-ephemeral-caches-only',
])

export const GAME_DEV_PIPELINE_SURVIVOR_RULES = Object.freeze([
	'dcc-source-and-scene-first',
	'engine-content-assets-first',
	'shortest-path',
])

export const GAME_DEV_PIPELINE_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'mesh-duplicates',
	'texture-duplicates',
	'regenerable-caches',
	'dcc-sources',
	'scenes-prefabs',
	'unreal-assets',
	'unity-assets',
	'shielded',
])

export const GAME_DEV_PIPELINE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'cache_priority_desc',
	'copies_desc',
	'name_asc',
])

export const GAME_DEV_PIPELINE_PRESETS = Object.freeze([
	{
		id: 'all-gamedev-pipeline-audit',
		name: 'All Unity/Unreal & 3D Pipeline',
		description: 'Audit DCC source meshes (.blend/.fbx/.glb/.gltf), Unity/Unreal scenes & prefabs (.unity/.prefab/.mat/.uasset/.umap), textures (.exr/.hdr/.dds/.tga/.ktx2), and regenerable caches while guarding sources.',
		familyFilter: 'all',
		strategy: 'prune-engine-caches-keep-sources',
		survivorRule: 'dcc-source-and-scene-first',
		protectDccSources: true,
		protectScenesAndPrefabs: true,
		protectProductionAssets: true,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'prune-unreal-unity-caches',
		name: 'Prune Library/Intermediate/DDC',
		description: 'Reclaim regenerable Unity Library/ and Temp/ plus Unreal Intermediate/, DerivedDataCache/, and Saved/Autosaves/ caches while leaving DCC sources and scenes untouched.',
		familyFilter: 'engine-ephemeral-caches',
		strategy: 'prune-engine-caches-keep-sources',
		survivorRule: 'dcc-source-and-scene-first',
		protectDccSources: true,
		protectScenesAndPrefabs: true,
		protectProductionAssets: true,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'consolidate-meshes-textures',
		name: 'Hardlink Meshes & EXR/DDS/KTX2',
		description: 'Deduplicate identical .fbx, .glb, .gltf meshes and .exr, .hdr, .dds, .tga, .ktx2 textures onto canonical Assets/ or Content/ anchors via POSIX hardlinks.',
		familyFilter: 'pipeline-textures-hdr',
		strategy: 'consolidate-mesh-texture-hardlinks',
		survivorRule: 'engine-content-assets-first',
		protectDccSources: true,
		protectScenesAndPrefabs: true,
		protectProductionAssets: true,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
	{
		id: 'protect-dcc-scenes-prefabs',
		name: 'DCC Sources & Scenes/Prefabs Guard',
		description: 'Inspect .blend, .fbx, .glb, .unity, .prefab, .mat, .uasset, and .umap clusters so source meshes, levels, and prefab graphs stay strictly protected.',
		familyFilter: 'dcc-source-meshes',
		strategy: 'prune-engine-caches-keep-sources',
		survivorRule: 'dcc-source-and-scene-first',
		protectDccSources: true,
		protectScenesAndPrefabs: true,
		protectProductionAssets: true,
		staleCacheDays: 14,
		minSizeMb: 0,
	},
	{
		id: 'stale-engine-caches-only',
		name: 'Stale Cache Sweep Only',
		description: 'Reclaim only regenerable Library/, Intermediate/, DerivedDataCache/, and Temp/ artifacts older than the retention window without touching any mesh, texture, or scene.',
		familyFilter: 'all',
		strategy: 'prune-ephemeral-caches-only',
		survivorRule: 'dcc-source-and-scene-first',
		protectDccSources: true,
		protectScenesAndPrefabs: true,
		protectProductionAssets: true,
		staleCacheDays: 7,
		minSizeMb: 0,
	},
])

const DCC_SOURCE_MESH_EXT_SET = new Set([
	'blend',
	'fbx',
	'glb',
	'gltf',
	'abc',
	'usd',
	'usda',
	'usdc',
	'usdz',
	'obj',
	'dae',
])

const UNREAL_ASSET_EXT_SET = new Set([
	'uasset',
	'umap',
	'uproject',
	'upack',
	'ubulk',
	'uptnl',
])

const UNITY_ASSET_EXT_SET = new Set([
	'unity',
	'prefab',
	'mat',
	'asset',
	'controller',
	'anim',
	'unitypackage',
	'physicmaterial',
	'rendertexture',
	'lighting',
])

const ENGINE_SCENE_PREFAB_EXT_SET = new Set([
	...UNREAL_ASSET_EXT_SET,
	...UNITY_ASSET_EXT_SET,
])

const PIPELINE_TEXTURE_PRIMARY_EXT_SET = new Set([
	'exr',
	'hdr',
	'dds',
	'tga',
	'ktx2',
	'ktx',
	'astc',
	'basis',
])

const PIPELINE_TEXTURE_SECONDARY_EXT_SET = new Set([
	'png',
	'psd',
	'psb',
	'tif',
	'tiff',
	'webp',
])

const EPHEMERAL_CACHE_EXT_SET = new Set([
	'blend1',
	'blend2',
	'blend3',
	'ddc',
	'ushaderbytecode',
	'shaderbin',
	'assetcache',
	'meshcache',
	'pch',
	'ilk',
	'pdb',
	'exp',
	'tmp',
])

const EPHEMERAL_ENGINE_CACHE_PATH_RE = /(?:^|\/)(?:library\/(?:artifactdb|shadercache|packagecache|statecache|scriptassemblies|bee|il2cppbuildcache|giparams|shaderprecache|cache)|library|intermediate|deriveddatacache|ddc|temp|saved\/(?:autosaves|cooked|logs|shaders|stalls|crashes|backups)|\.godot\/imported|\.import|shader[_-]?cache|build\/(?:cache|temp))(?:\/|$)/i
const EPHEMERAL_STAGING_PATH_RE = /(?:^|\/)(?:downloads?|telechargements?|scratch|staging|exports?[_-]?tmp)(?:\/|$)/i
const CANONICAL_ENGINE_PATH_RE = /(?:^|\/)(?:assets|content|sourceart|source[_-]?art|dcc[_-]?sources?|master[_-]?scenes?|scenes|prefabs|materials|textures|meshes|blueprints|levels|maps|canonical|vault|__groupfolders\/\d+\/(?:gamedev|unity|unreal|ue5|3d|assets))(?:\/|$)/i
const PRODUCTION_LOCKED_PATH_RE = /(?:golden[_-]?master|shipped[_-]?build|release[_-]?assets?|master[_-]?levels?|cert[_-]?build|milestone[_-]?freeze|prod[_-]?vault)/i

const TEXTURE_CHANNEL_RE = /(?:^|[._-])(albedo|basecolor|base[_-]?color|diffuse|normal|nrm|roughness|rough|metallic|metalness|ao|ambient[_-]?occlusion|orm|arm|emissive|emission|height|disp|displacement|mask|opacity|lightmap|envmap|hdri|skybox|cubemap|specular|gloss)(?:$|[._-])/i
const TEXTURE_RES_LOD_RE = /(?:^|[^a-z0-9])(8k|4k|2k|1k|512|lod[0-4])(?:$|[^a-z0-9])/i
const GAME_DEV_CONTEXT_RE = /(?:unity|unreal|ue4|ue5|uproject|uasset|umap|prefab|blender|godot|substance|pbr|lightmap|shader|fbx|gltf|glb|ktx2|dds|exr|hdr|tga|gamedev|game[_-]?dev|assets|content|sourceart|meshes|textures|materials|blueprints|levels)/i
const REVISION_RE = /(?:^|[._\s-])(?:v|rev|r|lod|bak)[._-]?(\d{1,4})(?:[._\s-]|$)/i

const IGNORED_WORKSPACE_SEGMENTS = new Set([
	'files',
	'gamedev',
	'game-dev',
	'unity',
	'unreal',
	'ue4',
	'ue5',
	'godot',
	'assets',
	'content',
	'sourceart',
	'source-art',
	'sources',
	'masters',
	'meshes',
	'models',
	'textures',
	'materials',
	'scenes',
	'prefabs',
	'levels',
	'maps',
	'blueprints',
	'library',
	'intermediate',
	'deriveddatacache',
	'temp',
	'saved',
	'autosaves',
	'cooked',
	'shadercache',
	'artifactdb',
	'downloads',
	'telechargements',
	'scratch',
	'staging',
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
 * Normalize a Game Dev asset filename into a canonical asset stem so DCC sources,
 * Unity/Unreal prefabs/uassets, textures, and derived caches correlate across formats.
 *
 * @param {string} basename File basename.
 * @return {string} Canonical asset stem.
 */
export function normalizeGameDevAssetStem(basename) {
	if (!basename || typeof basename !== 'string') {
		return 'untitled-asset'
	}
	let stem = basename.trim()
	const dotIdx = stem.lastIndexOf('.')
	if (dotIdx > 0) {
		stem = stem.slice(0, dotIdx)
	}

	let prev = ''
	while (prev !== stem) {
		prev = stem
		stem = stem.replace(
			/(?:\s*\(\d+\)|[._\s-]+(?:8k|4k|2k|1k|512|lod[0-4]|albedo|basecolor|base[_-]?color|diffuse|normal|nrm|roughness|rough|metallic|metalness|ao|orm|arm|emissive|height|disp|mask|lightmap|hdri|cubemap|baked|cooked|cache|cached|autosave|copy|backup|bak|dup|duplicate|old|tmp|final|v\d+|rev\d+|r\d+))+$/gi,
			''
		)
	}

	stem = stem
		.replace(/^(?:sm_|sk_|t_|m_|mi_|bp_|l_|wp_|pf_|mat_)/i, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')

	return stem || 'gamedev-asset'
}

/**
 * Extract project workspace slug (e.g. game project name) from path segments.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full normalized path.
 * @return {string} Project workspace slug.
 */
export function extractGameProjectWorkspace(basename, fullPath = '') {
	const segments = safeNormalizePath(fullPath).split('/').filter(Boolean)
	const dirSegments = segments.slice(0, -1)

	for (let i = 0; i < dirSegments.length; i += 1) {
		const lower = dirSegments[i].toLowerCase()
		if ((lower === 'assets' || lower === 'content' || lower === 'library' || lower === 'intermediate' || lower === 'deriveddatacache' || lower === 'saved') && i > 0) {
			const candidate = dirSegments[i - 1].toLowerCase()
			if (candidate && !IGNORED_WORKSPACE_SEGMENTS.has(candidate) && !/^\d+$/.test(candidate)) {
				return candidate.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'game-project'
			}
		}
	}

	for (let i = dirSegments.length - 1; i >= 0; i -= 1) {
		const clean = dirSegments[i].toLowerCase()
		if (clean && !IGNORED_WORKSPACE_SEGMENTS.has(clean) && !/^\d+$/.test(clean)) {
			return clean.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'game-project'
		}
	}

	return normalizeGameDevAssetStem(basename)
}

/**
 * Extract game engine, pipeline stage, and texture/LOD spec metadata.
 *
 * @param {string} ext File extension.
 * @param {string} combinedContext Path + basename context.
 * @param {string} family Assigned pipeline family.
 * @return {object} Engine, stage, and spec metadata.
 */
export function extractGameEnginePipelineMetadata(ext, combinedContext, family) {
	let engineName = '3D Asset Pipeline'
	if (UNREAL_ASSET_EXT_SET.has(ext) || /unreal|ue4|ue5|uproject|deriveddatacache|intermediate|saved\/cooked|saved\/autosaves|\/content\//i.test(combinedContext)) {
		engineName = 'Unreal Engine'
	} else if (UNITY_ASSET_EXT_SET.has(ext) || /unity|library\/artifactdb|library\/shadercache|library\/bee|\/assets\//i.test(combinedContext)) {
		engineName = 'Unity'
	} else if (/godot|\.godot\//i.test(combinedContext)) {
		engineName = 'Godot'
	} else if (ext === 'blend' || ext === 'blend1' || ext === 'blend2' || ext === 'blend3') {
		engineName = 'Blender DCC'
	} else if (ext === 'glb' || ext === 'gltf' || ext === 'usd' || ext === 'usda' || ext === 'usdc' || ext === 'usdz') {
		engineName = 'glTF / OpenUSD'
	} else if (ext === 'fbx' || ext === 'abc') {
		engineName = 'FBX / Alembic DCC'
	}

	let pipelineStage = 'Asset Cluster'
	if (family === 'engine-ephemeral-caches') {
		if (/deriveddatacache|ddc/i.test(combinedContext)) {
			pipelineStage = 'Unreal DDC Cache'
		} else if (/intermediate/i.test(combinedContext)) {
			pipelineStage = 'Unreal Intermediate'
		} else if (/saved\/autosaves/i.test(combinedContext)) {
			pipelineStage = 'Unreal Autosave'
		} else if (/saved\/cooked/i.test(combinedContext)) {
			pipelineStage = 'Cooked Staging Cache'
		} else if (/library\/artifactdb/i.test(combinedContext)) {
			pipelineStage = 'Unity ArtifactDB'
		} else if (/library\/shadercache|shadercache|shaderbin|ushaderbytecode/i.test(combinedContext)) {
			pipelineStage = 'Shader Cache'
		} else if (/library\//i.test(combinedContext)) {
			pipelineStage = 'Unity Library Cache'
		} else {
			pipelineStage = 'Ephemeral Cache'
		}
	} else if (family === 'engine-scenes-prefabs') {
		if (ext === 'umap' || ext === 'unity') {
			pipelineStage = 'Level / Scene'
		} else if (ext === 'prefab') {
			pipelineStage = 'Unity Prefab'
		} else if (ext === 'mat') {
			pipelineStage = 'Material Asset'
		} else if (ext === 'uasset') {
			pipelineStage = 'Unreal UAsset'
		} else if (ext === 'uproject') {
			pipelineStage = 'Unreal Project'
		} else {
			pipelineStage = 'Engine Graph Asset'
		}
	} else if (family === 'pipeline-textures-hdr') {
		if (ext === 'exr' || ext === 'hdr') {
			pipelineStage = 'HDRI / 32-bit EXR'
		} else if (ext === 'ktx2' || ext === 'ktx' || ext === 'dds' || ext === 'astc' || ext === 'basis') {
			pipelineStage = 'GPU Compressed Texture'
		} else {
			pipelineStage = 'TGA / Pipeline Map'
		}
	} else if (family === 'dcc-source-meshes') {
		pipelineStage = ext === 'blend' ? 'Blender Source' : '3D Interchange Mesh'
	}

	const resMatch = TEXTURE_RES_LOD_RE.exec(combinedContext)
	const channelMatch = TEXTURE_CHANNEL_RE.exec(combinedContext)
	const specParts = []
	if (resMatch) {
		specParts.push(resMatch[1].toUpperCase())
	}
	if (channelMatch) {
		specParts.push(channelMatch[1].toUpperCase().replace(/_/g, '-'))
	}
	const assetSpec = specParts.length > 0
		? specParts.join(' / ')
		: (family === 'engine-ephemeral-caches' ? 'Regenerable' : 'Canonical')

	return {
		engineName,
		pipelineStage,
		assetSpec,
	}
}

/**
 * Parse revision or LOD number from basename or path.
 *
 * @param {string} basename File basename.
 * @param {string} fullPath Full path.
 * @return {number} Revision/LOD index or 0.
 */
export function parsePipelineRevision(basename, fullPath = '') {
	const match = REVISION_RE.exec(basename) || REVISION_RE.exec(fullPath)
	if (!match) {
		return 0
	}
	const num = Number.parseInt(match[1], 10)
	return Number.isFinite(num) && num > 0 ? num : 0
}

/**
 * Format bytes as GB string with 2 decimals (e.g. "2.50 GB").
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
 * Classify a single file into one of the 4 Game Dev, Unity/Unreal & 3D Asset Pipeline families.
 *
 * @param {object} file Duplicate file entry.
 * @return {object|null} Classification metadata or null if unrelated.
 */
export function classifyGameDevPipelineFile(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const path = safeNormalizePath(file.path || file.filePath || '')
	const basename = getBasename(path)
	if (!basename) {
		return null
	}
	const ext = getExtension(basename)
	const mtimeSec = normalizeMtimeSec(file.mtime)
	const combinedContext = `${path} ${basename}`

	const inEphemeralCachePath = EPHEMERAL_ENGINE_CACHE_PATH_RE.test(path)
	const inStagingPath = EPHEMERAL_STAGING_PATH_RE.test(path)
	const isCacheExt = EPHEMERAL_CACHE_EXT_SET.has(ext)
	const isDccMesh = DCC_SOURCE_MESH_EXT_SET.has(ext)
	const isUnrealAsset = UNREAL_ASSET_EXT_SET.has(ext)
	const isUnityAsset = UNITY_ASSET_EXT_SET.has(ext)
	const isEngineScenePrefab = ENGINE_SCENE_PREFAB_EXT_SET.has(ext)
	const isPrimaryTexture = PIPELINE_TEXTURE_PRIMARY_EXT_SET.has(ext)
	const isSecondaryTexture = PIPELINE_TEXTURE_SECONDARY_EXT_SET.has(ext)
		&& (TEXTURE_CHANNEL_RE.test(combinedContext) || GAME_DEV_CONTEXT_RE.test(combinedContext))
	const isPipelineTexture = isPrimaryTexture || isSecondaryTexture

	const isArtifactDbNoExt = !ext && /(?:artifactdb|shadercache|shaderprecache|ddc)$/i.test(basename) && inEphemeralCachePath
	const isEphemeralCache = inEphemeralCachePath || isCacheExt || isArtifactDbNoExt

	if (!isEphemeralCache && !isDccMesh && !isEngineScenePrefab && !isPipelineTexture) {
		return null
	}

	let family = 'dcc-source-meshes'
	let artifactKind = 'dcc-source-mesh'
	let artifactKindBadge = 'DCC Source Mesh'
	let formatBadge = ext ? `.${ext.toUpperCase()}` : 'CACHE'

	if (isEphemeralCache) {
		family = 'engine-ephemeral-caches'
		artifactKind = 'regenerable-engine-cache'
		if (/deriveddatacache|ddc/i.test(combinedContext)) {
			artifactKindBadge = 'DerivedDataCache'
		} else if (/intermediate/i.test(combinedContext)) {
			artifactKindBadge = 'Unreal Intermediate'
		} else if (/library\//i.test(combinedContext)) {
			artifactKindBadge = 'Unity Library Cache'
		} else if (/saved\/autosaves/i.test(combinedContext)) {
			artifactKindBadge = 'Engine Autosave'
		} else {
			artifactKindBadge = 'Ephemeral Cache'
		}
		formatBadge = ext ? `Cache .${ext.toUpperCase()}` : 'Cache Blob'
	} else if (isEngineScenePrefab) {
		family = 'engine-scenes-prefabs'
		artifactKind = 'engine-scene-prefab'
		if (isUnrealAsset) {
			artifactKindBadge = ext === 'umap' ? 'Unreal Map' : 'Unreal UAsset'
			formatBadge = `UE .${ext.toUpperCase()}`
		} else {
			artifactKindBadge = ext === 'unity' ? 'Unity Scene' : (ext === 'prefab' ? 'Unity Prefab' : 'Unity Asset')
			formatBadge = `Unity .${ext.toUpperCase()}`
		}
	} else if (isPipelineTexture) {
		family = 'pipeline-textures-hdr'
		artifactKind = 'pipeline-texture'
		if (ext === 'exr' || ext === 'hdr') {
			artifactKindBadge = 'HDR / EXR Master'
			formatBadge = `HDR .${ext.toUpperCase()}`
		} else if (ext === 'ktx2' || ext === 'ktx' || ext === 'dds' || ext === 'astc' || ext === 'basis') {
			artifactKindBadge = 'GPU Texture'
			formatBadge = `GPU .${ext.toUpperCase()}`
		} else {
			artifactKindBadge = 'Pipeline Texture'
			formatBadge = `Tex .${ext.toUpperCase()}`
		}
	} else {
		family = 'dcc-source-meshes'
		artifactKind = 'dcc-source-mesh'
		artifactKindBadge = ext === 'blend' ? 'Blender Source' : 'DCC 3D Mesh'
		formatBadge = `3D .${ext.toUpperCase()}`
	}

	const assetStem = normalizeGameDevAssetStem(basename)
	const projectWorkspace = extractGameProjectWorkspace(basename, path)
	const revisionNumber = parsePipelineRevision(basename, path)
	const engineMeta = extractGameEnginePipelineMetadata(ext, combinedContext, family)

	const isProductionLocked = PRODUCTION_LOCKED_PATH_RE.test(combinedContext)
	const inCanonicalEngine = CANONICAL_ENGINE_PATH_RE.test(path) && !inEphemeralCachePath && !inStagingPath
	const isHdrMasterTexture = (ext === 'exr' || ext === 'hdr') && !inEphemeralCachePath && !inStagingPath

	const vaultKey = `${projectWorkspace}/${assetStem}`

	return {
		path,
		dirname: getDirname(path),
		basename,
		ext,
		family,
		artifactKind,
		artifactKindBadge,
		formatBadge,
		assetStem,
		projectWorkspace,
		revisionNumber,
		engineName: engineMeta.engineName,
		pipelineStage: engineMeta.pipelineStage,
		assetSpec: engineMeta.assetSpec,
		mtimeSec,
		isEphemeralCache,
		isDccMesh: !isEphemeralCache && isDccMesh,
		isEngineScenePrefab: !isEphemeralCache && isEngineScenePrefab,
		isUnrealAsset: !isEphemeralCache && isUnrealAsset,
		isUnityAsset: !isEphemeralCache && isUnityAsset,
		isPipelineTexture: !isEphemeralCache && isPipelineTexture,
		isHdrMasterTexture,
		isProductionLocked,
		inCanonicalEngine,
		inEphemeralCachePath,
		inStagingPath,
		vaultKey,
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
 * Score a file copy's authority as canonical Game Dev pipeline survivor (0-100).
 *
 * @param {object} member Classified file member.
 * @param {string} survivorRule Selected survivor rule.
 * @return {number} Authority score 0-100.
 */
function computeMemberAuthorityScore(member, survivorRule) {
	let score = 40

	if (member.meta.isProductionLocked) {
		score += 34
	}
	if (member.meta.isDccMesh) {
		score += 28
	}
	if (member.meta.isEngineScenePrefab) {
		score += 26
	}
	if (member.meta.isHdrMasterTexture) {
		score += 18
	}
	if (member.meta.inCanonicalEngine) {
		score += 22
	}
	if (member.meta.inEphemeralCachePath || member.meta.isEphemeralCache) {
		score -= 32
	} else if (member.meta.inStagingPath) {
		score -= 22
	}
	if (member.isInOriginFolder) {
		score += 18
	}

	if (survivorRule === 'engine-content-assets-first') {
		if (/\/(?:assets|content)\//i.test(member.meta.path)) {
			score += 22
		}
		if (member.meta.isEngineScenePrefab) {
			score += 10
		}
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
	if (a.meta.isProductionLocked !== b.meta.isProductionLocked) {
		return a.meta.isProductionLocked ? -1 : 1
	}
	if (a.meta.inEphemeralCachePath !== b.meta.inEphemeralCachePath) {
		return a.meta.inEphemeralCachePath ? 1 : -1
	}
	if (survivorRule === 'engine-content-assets-first') {
		const aContent = /\/(?:assets|content)\//i.test(a.meta.path)
		const bContent = /\/(?:assets|content)\//i.test(b.meta.path)
		if (aContent !== bContent) {
			return aContent ? -1 : 1
		}
	}
	if (a.meta.isDccMesh !== b.meta.isDccMesh) {
		return a.meta.isDccMesh ? -1 : 1
	}
	if (a.meta.isEngineScenePrefab !== b.meta.isEngineScenePrefab) {
		return a.meta.isEngineScenePrefab ? -1 : 1
	}
	if (a.meta.inCanonicalEngine !== b.meta.inCanonicalEngine) {
		return a.meta.inCanonicalEngine ? -1 : 1
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
 * Analyze duplicate groups for Game Dev, Unity/Unreal & 3D Asset Pipeline governance.
 *
 * @param {Array<object>} duplicateGroups Array of duplicate group objects.
 * @param {object} [options] Analysis configuration options.
 * @return {object} Deterministic audit report.
 */
export function analyzeGameDevPipelineVault(duplicateGroups, options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const familyFilter = GAME_DEV_PIPELINE_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const verdictFilter = GAME_DEV_PIPELINE_VERDICT_FILTERS.includes(options.verdictFilter) ? options.verdictFilter : 'all'
	const sortMode = GAME_DEV_PIPELINE_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const strategy = GAME_DEV_PIPELINE_STRATEGIES.includes(options.strategy)
		? options.strategy
		: 'prune-engine-caches-keep-sources'
	const survivorRule = GAME_DEV_PIPELINE_SURVIVOR_RULES.includes(options.survivorRule)
		? options.survivorRule
		: 'dcc-source-and-scene-first'

	const protectDccSources = options.protectDccSources !== false
	const protectScenesAndPrefabs = options.protectScenesAndPrefabs !== false
	const protectProductionAssets = options.protectProductionAssets !== false
	const staleCacheDays = Number.isFinite(Number(options.staleCacheDays)) && Number(options.staleCacheDays) >= 0
		? Number(options.staleCacheDays)
		: 7
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
	const dccStemsPresent = new Set()
	const sceneStemsPresent = new Set()

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		if (files.length < 2) {
			continue
		}

		const classifiedMembers = []
		for (const file of files) {
			const meta = classifyGameDevPipelineFile(file)
			if (!meta) {
				continue
			}
			if (meta.isDccMesh) {
				dccStemsPresent.add(meta.assetStem)
			}
			if (meta.isEngineScenePrefab) {
				sceneStemsPresent.add(meta.assetStem)
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
		const familyMeta = GAME_DEV_PIPELINE_FAMILY_META[family] || GAME_DEV_PIPELINE_FAMILY_META['dcc-source-meshes']

		const hasDccSourceInCluster = classifiedMembers.some(m => m.meta.isDccMesh)
		const hasDccSourceInVault = hasDccSourceInCluster || dccStemsPresent.has(primaryMeta.assetStem)
		const hasScenePrefabInCluster = classifiedMembers.some(m => m.meta.isEngineScenePrefab)
		const hasScenePrefabInVault = hasScenePrefabInCluster || sceneStemsPresent.has(primaryMeta.assetStem)
		const hasProductionLock = classifiedMembers.some(m => m.meta.isProductionLocked)
		const hasUnrealAssets = classifiedMembers.some(m => m.meta.isUnrealAsset || m.meta.engineName === 'Unreal Engine')
		const hasUnityAssets = classifiedMembers.some(m => m.meta.isUnityAsset || m.meta.engineName === 'Unity')

		let duplicationClass = 'mesh-duplicate'
		let duplicationBadge = '3D Mesh Duplicate'
		let assetLineageBadge = 'DCC Source Present'

		if (family === 'engine-ephemeral-caches') {
			duplicationClass = 'regenerable-cache'
			duplicationBadge = primaryMeta.pipelineStage
			assetLineageBadge = (hasDccSourceInVault || hasScenePrefabInVault)
				? 'Regenerable from Project Sources'
				: 'Ephemeral Engine Cache'
		} else if (family === 'engine-scenes-prefabs') {
			duplicationClass = 'scene-prefab'
			duplicationBadge = primaryMeta.artifactKindBadge
			assetLineageBadge = hasDccSourceInVault
				? 'Linked DCC Source Present'
				: 'Engine Scene / Prefab Anchor'
		} else if (family === 'pipeline-textures-hdr') {
			duplicationClass = 'texture-duplicate'
			duplicationBadge = primaryMeta.isHdrMasterTexture ? 'HDR / EXR Texture Duplicate' : 'GPU / Pipeline Texture Duplicate'
			assetLineageBadge = (hasDccSourceInVault || hasScenePrefabInVault)
				? 'Linked to Scene / DCC Asset'
				: 'Standalone Texture Cluster'
		} else {
			duplicationClass = 'mesh-duplicate'
			duplicationBadge = primaryMeta.ext === 'blend' ? 'Blender Source Duplicate' : '3D Mesh Duplicate'
			assetLineageBadge = hasScenePrefabInVault
				? 'Imported in Unity/Unreal Scene'
				: 'DCC Source Mesh Vault'
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
				if (member.meta.isProductionLocked) {
					member.verdictReason = `Golden master / shipped build anchor (${member.meta.engineName})`
				} else if (member.meta.isDccMesh) {
					member.verdictReason = `Canonical DCC source mesh (${member.meta.formatBadge})`
				} else if (member.meta.isEngineScenePrefab) {
					member.verdictReason = `Canonical ${member.meta.engineName} scene/prefab anchor`
				} else if (member.meta.inCanonicalEngine) {
					member.verdictReason = `Primary ${member.meta.projectWorkspace} pipeline anchor`
				} else {
					member.verdictReason = 'Highest-authority Game Dev pipeline survivor'
				}
				shieldedCopiesCount += 1
				return
			}

			if (override === 'keep') {
				member.verdict = 'blocked-manual-shield'
				member.actionType = 'keep'
				member.verdictReason = 'Manually shielded by technical artist / pipeline lead'
				shieldedCopiesCount += 1
				return
			}

			if (override === 'prune') {
				member.verdict = strategy === 'consolidate-mesh-texture-hardlinks'
					? 'consolidate-hardlink-pipeline-asset'
					: 'reclaim-duplicate-pipeline-asset'
				member.actionType = strategy === 'consolidate-mesh-texture-hardlinks' ? 'hardlink' : 'prune'
				member.verdictReason = 'Pipeline override: marked for controlled remediation'
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

			if (protectProductionAssets && (member.meta.isProductionLocked || (member.meta.isHdrMasterTexture && member.meta.inCanonicalEngine)) && strategy !== 'consolidate-mesh-texture-hardlinks') {
				member.verdict = 'blocked-production-asset'
				member.actionType = 'keep'
				member.verdictReason = member.meta.isProductionLocked
					? `Golden master / shipped build locked (${member.meta.engineName})`
					: `Canonical HDR/EXR master texture protected (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (protectDccSources && member.meta.isDccMesh && strategy !== 'consolidate-mesh-texture-hardlinks') {
				member.verdict = 'blocked-dcc-source'
				member.actionType = 'keep'
				member.verdictReason = `DCC source conservation active (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (protectScenesAndPrefabs && member.meta.isEngineScenePrefab && strategy !== 'consolidate-mesh-texture-hardlinks') {
				member.verdict = 'blocked-scene-prefab'
				member.actionType = 'keep'
				member.verdictReason = `${member.meta.engineName} scene/prefab/material preserved (${member.meta.formatBadge})`
				shieldedCopiesCount += 1
				return
			}

			if (
				member.meta.isEphemeralCache
				&& !member.meta.isProductionLocked
				&& member.ageDays < staleCacheDays
				&& strategy === 'prune-ephemeral-caches-only'
			) {
				member.verdict = 'blocked-recent-cache'
				member.actionType = 'keep'
				member.verdictReason = `Recent engine cache (${member.ageDays}d < ${staleCacheDays}d window)`
				shieldedCopiesCount += 1
				return
			}

			if (strategy === 'consolidate-mesh-texture-hardlinks') {
				member.verdict = 'consolidate-hardlink-pipeline-asset'
				member.actionType = 'hardlink'
				member.verdictReason = `Hardlink-consolidate onto ${survivor.basename} canonical anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				consolidatableCopiesCount += 1
				return
			}

			if (strategy === 'prune-ephemeral-caches-only') {
				if (member.meta.isEphemeralCache) {
					member.verdict = 'reclaim-ephemeral-engine-cache'
					member.actionType = 'prune'
					member.verdictReason = `Stale regenerable ${member.meta.pipelineStage} cache`
					reclaimableBytes += member.size
					reclaimableCopiesCount += 1
					return
				}
				member.verdict = 'blocked-strategy-scope'
				member.actionType = 'keep'
				member.verdictReason = 'Outside ephemeral cache sweep scope'
				shieldedCopiesCount += 1
				return
			}

			if (member.meta.isEphemeralCache) {
				member.verdict = 'reclaim-ephemeral-engine-cache'
				member.actionType = 'prune'
				member.verdictReason = (hasDccSourceInVault || hasScenePrefabInVault)
					? `Regenerable ${member.meta.pipelineStage} (project sources preserved)`
					: `Ephemeral ${member.meta.pipelineStage} duplicate outside canonical anchor`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isPipelineTexture) {
				member.verdict = 'reclaim-duplicate-texture'
				member.actionType = 'prune'
				member.verdictReason = member.meta.inEphemeralCachePath
					? 'Redundant texture export in staging/downloads folder'
					: `Duplicate ${member.meta.formatBadge} outside canonical Assets/Content`
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			if (member.meta.isDccMesh) {
				member.verdict = 'reclaim-duplicate-mesh'
				member.actionType = 'prune'
				member.verdictReason = 'Duplicate DCC mesh copy outside source conservation guard'
				reclaimableBytes += member.size
				reclaimableCopiesCount += 1
				return
			}

			member.verdict = 'reclaim-duplicate-scene-copy'
			member.actionType = 'prune'
			member.verdictReason = 'Duplicate scene/prefab copy outside conservation guard'
			reclaimableBytes += member.size
			reclaimableCopiesCount += 1
		})

		const rawInfo = computeGroupReclaimableInfo({ ...group, files })
		const rawDuplicateBytes = rawInfo.reclaimableBytes || Math.max(0, (classifiedMembers.length - 1) * survivor.size)

		let riskState = 'reclaimable'
		let riskPriority = 2
		if (reclaimableCopiesCount === 0) {
			if (hasProductionLock) {
				riskState = 'production-asset-locked'
				riskPriority = 6
			} else if (hasDccSourceInCluster) {
				riskState = 'dcc-source-protected'
				riskPriority = 5
			} else if (hasScenePrefabInCluster) {
				riskState = 'scene-prefab-protected'
				riskPriority = 4
			} else {
				riskState = 'shielded'
				riskPriority = 3
			}
		} else if (consolidatableCopiesCount > 0) {
			riskState = 'consolidatable'
			riskPriority = 3
		} else if (duplicationClass === 'regenerable-cache') {
			riskState = 'ephemeral-cache-reclaimable'
			riskPriority = 5
		}

		allClusters.push({
			groupKey: `${group.id ?? group.hash ?? primaryMeta.vaultKey}::${primaryMeta.vaultKey}`,
			primaryGroupId: group.id ?? null,
			hash: group.hash || '',
			family,
			familyLabel: familyMeta.label,
			familyShortLabel: familyMeta.shortLabel,
			projectWorkspace: primaryMeta.projectWorkspace,
			assetStem: primaryMeta.assetStem,
			engineName: primaryMeta.engineName,
			pipelineStage: primaryMeta.pipelineStage,
			assetSpec: primaryMeta.assetSpec,
			revisionNumber: primaryMeta.revisionNumber,
			revisionLabel: primaryMeta.revisionNumber > 0 ? `v/LOD #${primaryMeta.revisionNumber}` : 'canonical',
			formatBadge: primaryMeta.formatBadge,
			duplicationClass,
			duplicationBadge,
			assetLineageBadge,
			hasDccSourceInVault,
			hasScenePrefabInVault,
			hasDccSourceInCluster,
			hasScenePrefabInCluster,
			hasProductionLock,
			hasUnrealAssets,
			hasUnityAssets,
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

	const familyBreakdown = Object.keys(GAME_DEV_PIPELINE_FAMILY_META).map(famId => {
		const famClusters = allClusters.filter(c => c.family === famId)
		const famReclaim = famClusters.reduce((acc, c) => acc + c.reclaimableBytes, 0)
		return {
			id: famId,
			label: GAME_DEV_PIPELINE_FAMILY_META[famId].label,
			shortLabel: GAME_DEV_PIPELINE_FAMILY_META[famId].shortLabel,
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
			if (verdictFilter === 'mesh-duplicates' && cluster.duplicationClass !== 'mesh-duplicate') {
				return false
			}
			if (verdictFilter === 'texture-duplicates' && cluster.duplicationClass !== 'texture-duplicate') {
				return false
			}
			if (verdictFilter === 'regenerable-caches' && cluster.duplicationClass !== 'regenerable-cache') {
				return false
			}
			if (verdictFilter === 'dcc-sources' && cluster.family !== 'dcc-source-meshes') {
				return false
			}
			if (verdictFilter === 'scenes-prefabs' && cluster.family !== 'engine-scenes-prefabs') {
				return false
			}
			if (verdictFilter === 'unreal-assets' && !cluster.hasUnrealAssets) {
				return false
			}
			if (verdictFilter === 'unity-assets' && !cluster.hasUnityAssets) {
				return false
			}
			if (verdictFilter === 'shielded' && cluster.reclaimableCopiesCount > 0) {
				return false
			}
		}
		if (searchQuery) {
			const haystack = [
				cluster.projectWorkspace,
				cluster.assetStem,
				cluster.engineName,
				cluster.pipelineStage,
				cluster.assetSpec,
				cluster.duplicationBadge,
				cluster.assetLineageBadge,
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
				'regenerable-cache': 4,
				'texture-duplicate': 3,
				'mesh-duplicate': 2,
				'scene-prefab': 1,
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
	const totalMeshDuplicateClusters = filteredClusters.filter(c => c.duplicationClass === 'mesh-duplicate').length
	const totalTextureDuplicateClusters = filteredClusters.filter(c => c.duplicationClass === 'texture-duplicate').length
	const totalRegenerableCacheClusters = filteredClusters.filter(c => c.duplicationClass === 'regenerable-cache').length
	const totalScenePrefabClusters = filteredClusters.filter(c => c.family === 'engine-scenes-prefabs').length
	const totalUnrealClusters = filteredClusters.filter(c => c.hasUnrealAssets).length
	const totalUnityClusters = filteredClusters.filter(c => c.hasUnityAssets).length
	const distinctAssetStemsCount = new Set(filteredClusters.map(c => c.assetStem)).size
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.min(100, Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100))
		: 0

	return {
		schema: GAME_DEV_PIPELINE_VAULT_SCHEMA,
		generatedAt: new Date(referenceNowSec * 1000).toISOString(),
		options: {
			familyFilter,
			verdictFilter,
			sortMode,
			strategy,
			survivorRule,
			protectDccSources,
			protectScenesAndPrefabs,
			protectProductionAssets,
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
			totalMeshDuplicateClusters,
			totalTextureDuplicateClusters,
			totalRegenerableCacheClusters,
			totalScenePrefabClusters,
			totalUnrealClusters,
			totalUnityClusters,
			distinctAssetStemsCount,
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
 * Build a safe POSIX DRY_RUN=1 remediation script for Game Dev, Unity/Unreal & 3D Asset Pipeline cleanup.
 *
 * @param {object} analysis Output of analyzeGameDevPipelineVault.
 * @param {object} [options] Script generation options.
 * @return {string} POSIX shell script.
 */
export function buildGameDevPipelineRemediationScript(analysis, options = {}) {
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
		'# DuplicateFinder Game Dev, Unity/Unreal & 3D Asset Pipeline Remediation Script',
		`# Schema: ${GAME_DEV_PIPELINE_VAULT_SCHEMA}`,
		`# Clusters: ${summary.totalClustersCount} | Reclaimable: ${summary.formattedReclaimableBytes} (${summary.reclaimableGb}) | Targets: ${summary.totalReclaimableCopiesCount}`,
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
		lines.push(`# Game Dev Pipeline: ${cluster.vaultKey} [${cluster.duplicationBadge} / ${cluster.engineName}] (${cluster.formattedReclaimableBytes})`)
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
		lines.push('# No actionable ephemeral engine caches or redundant mesh/texture copies under current DCC & scene guards.')
	} else {
		lines.push('# After applying with DRY_RUN=0, refresh Nextcloud filecache:')
		lines.push('# sudo -u www-data php /var/www/nextcloud/occ files:scan --all')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} analysis Output of analyzeGameDevPipelineVault.
 * @return {string} CSV content.
 */
export function buildGameDevPipelineCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'ProjectWorkspace',
		'AssetStem',
		'DuplicationClass',
		'AssetLineage',
		'EngineName',
		'PipelineStage',
		'AssetSpec',
		'Family',
		'Format',
		'DccSourcePresent',
		'ScenePrefabPresent',
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
				cluster.projectWorkspace,
				cluster.assetStem,
				cluster.duplicationClass,
				cluster.assetLineageBadge,
				cluster.engineName,
				cluster.pipelineStage,
				cluster.assetSpec,
				cluster.family,
				member.meta.formatBadge,
				cluster.hasDccSourceInVault ? 'yes' : 'no',
				cluster.hasScenePrefabInVault ? 'yes' : 'no',
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
 * @param {object} analysis Output of analyzeGameDevPipelineVault.
 * @return {string} Pretty-printed JSON string.
 */
export function buildGameDevPipelineJsonReport(analysis) {
	const payload = {
		schema: GAME_DEV_PIPELINE_VAULT_SCHEMA,
		generatedAt: analysis && analysis.generatedAt ? analysis.generatedAt : new Date().toISOString(),
		options: analysis ? analysis.options : {},
		summary: analysis ? analysis.summary : {},
		familyBreakdown: analysis ? analysis.familyBreakdown : [],
		clusters: (analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []).map(cluster => ({
			groupKey: cluster.groupKey,
			primaryGroupId: cluster.primaryGroupId,
			hash: cluster.hash,
			projectWorkspace: cluster.projectWorkspace,
			assetStem: cluster.assetStem,
			engineName: cluster.engineName,
			pipelineStage: cluster.pipelineStage,
			assetSpec: cluster.assetSpec,
			family: cluster.family,
			formatBadge: cluster.formatBadge,
			duplicationClass: cluster.duplicationClass,
			duplicationBadge: cluster.duplicationBadge,
			assetLineageBadge: cluster.assetLineageBadge,
			hasDccSourceInVault: cluster.hasDccSourceInVault,
			hasScenePrefabInVault: cluster.hasScenePrefabInVault,
			hasProductionLock: cluster.hasProductionLock,
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
 * Build a Nextcloud desktop client .sync-exclude.lst snippet for Unity/Unreal ephemeral caches and transient build folders.
 *
 * @param {object} analysis Output of analyzeGameDevPipelineVault.
 * @return {string} Sync exclude rules.
 */
export function buildGameDevPipelineSyncExcludeSnippet(analysis) {
	const cacheCount = analysis && analysis.summary ? analysis.summary.totalRegenerableCacheClusters : 0
	const meshTexCount = analysis && analysis.summary
		? (analysis.summary.totalMeshDuplicateClusters + analysis.summary.totalTextureDuplicateClusters)
		: 0
	return [
		'# DuplicateFinder Game Dev, Unity/Unreal & 3D Pipeline Sync Exclusions',
		`# Detected mesh/texture clusters: ${meshTexCount} | Regenerable engine cache clusters: ${cacheCount}`,
		'Library/',
		'Library/ArtifactDB*',
		'Library/ShaderCache/',
		'Library/Bee/',
		'Temp/',
		'Obj/',
		'Intermediate/',
		'DerivedDataCache/',
		'Saved/Autosaves/',
		'Saved/Cooked/',
		'Saved/Logs/',
		'Saved/Shaders/',
		'.godot/imported/',
		'*.blend1',
		'*.blend2',
		'*.ddc',
		'*.ushaderbytecode',
		'*.shaderbin',
		'Thumbs.db',
		'.DS_Store',
	].join('\n')
}
