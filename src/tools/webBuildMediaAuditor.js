/**
 * Pure Web Build Output, Responsive Image Pyramid, HLS/DASH Chunks & Source-Map Bloat Auditor.
 * Classifies and audits duplicate clusters across 4 domain families:
 * - Responsive Media Pyramids (@2x, @3x, -1280w, _thumb, _640x480, .webp, .avif, .jxl, DAM masters)
 * - Streaming Chunk Trees (HLS .ts in streaming/HLS folders, .m4s, .m3u8, .mpd, _480p/_720p ladders)
 * - Frontend Build Caches (.next/static/, .nuxt/, dist/assets/, hashed main.<hash>.js / chunk-<hash>.css)
 * - Debug Source-Maps & Symbols (.js.map, .css.map, .d.ts.map, .wasm.map, .tsbuildinfo, stats.json)
 *
 * Extracts assetLineageStem and pyramid/build/chunk tags, and assigns 5 governance tiers:
 * - dam-source-master (DAM source originals; strictly protected by default)
 * - active-cdn-release (Active CDN / production release; strictly protected by default)
 * - staging-snapshot-build (Staging, preview, or CI build snapshot)
 * - transcode-ladder-cache (Transcode ladder, HLS/DASH segment cache, or responsive derivative cache)
 * - unstripped-map-leak (Exposed .map source-maps, .tsbuildinfo, and bundle stats bloat)
 *
 * Zero DOM dependencies, zero network side effects.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const WEB_BUILD_MEDIA_SCHEMA = 'duplicatefinder.web-build-media-auditor.v1'

export const WEB_BUILD_MEDIA_FAMILIES = Object.freeze([
	'all',
	'responsive-media-pyramids',
	'streaming-chunk-trees',
	'frontend-build-caches',
	'debug-sourcemaps-symbols',
])

export const WEB_BUILD_MEDIA_FAMILY_META = Object.freeze({
	'responsive-media-pyramids': {
		id: 'responsive-media-pyramids',
		label: 'Responsive Media Pyramids',
		shortLabel: 'Pyramids (@2x/.webp/.avif)',
	},
	'streaming-chunk-trees': {
		id: 'streaming-chunk-trees',
		label: 'HLS / DASH Streaming Chunks',
		shortLabel: 'HLS & DASH (.ts/.m4s/.mpd)',
	},
	'frontend-build-caches': {
		id: 'frontend-build-caches',
		label: 'Frontend Build Caches',
		shortLabel: 'Build Caches (.next/dist)',
	},
	'debug-sourcemaps-symbols': {
		id: 'debug-sourcemaps-symbols',
		label: 'Debug Source-Maps & Symbols',
		shortLabel: 'Source-Maps (.js.map/.tsbuildinfo)',
	},
})

export const WEB_BUILD_STRATEGIES = Object.freeze([
	'consolidate-dam-originals',
	'strip-stale-sourcemaps-builds',
	'hardlink-shared-asset-chunks',
])

export const WEB_BUILD_SURVIVOR_RULES = Object.freeze([
	'dam-cdn-authority-first',
	'master-format-first',
	'newest-release',
	'oldest-canonical',
	'shortest-path',
])

export const WEB_BUILD_VERDICT_FILTERS = Object.freeze([
	'all',
	'reclaimable',
	'dam-masters',
	'active-cdn',
	'map-leaks',
	'shielded',
])

export const WEB_BUILD_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'risk_desc',
	'copies_desc',
	'name_asc',
])

export const WEB_BUILD_PRESETS = Object.freeze([
	{
		id: 'all-web-media-audit',
		name: 'All Web Build, Media Pyramid & HLS Audit',
		description: 'Audit responsive @2x/.webp/.avif image pyramids, HLS/DASH streaming chunks, .next/.nuxt/dist build caches, and exposed .map source-maps while strictly shielding DAM masters and active CDN releases.',
		familyFilter: 'all',
		strategy: 'consolidate-dam-originals',
		survivorRule: 'dam-cdn-authority-first',
		protectDamMasters: true,
		protectActiveCdnRelease: true,
		protectMasterFormats: true,
		staleBuildDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'dam-cdn-authority-guard',
		name: 'DAM Originals & Active CDN Guard',
		description: 'Protect canonical DAM source masters and live CDN releases while consolidating redundant staging copies and derivative image caches.',
		familyFilter: 'responsive-media-pyramids',
		strategy: 'consolidate-dam-originals',
		survivorRule: 'dam-cdn-authority-first',
		protectDamMasters: true,
		protectActiveCdnRelease: true,
		protectMasterFormats: true,
		staleBuildDays: 14,
		minSizeKb: 0,
	},
	{
		id: 'strip-exposed-sourcemaps',
		name: 'Strip .map Leaks & Stale .next/dist Caches',
		description: 'Target unstripped .js.map/.css.map/.d.ts.map/.wasm.map files, .tsbuildinfo, stats.json, and stale .next/static, .nuxt, or dist/assets caches while shielding production assets.',
		familyFilter: 'all',
		strategy: 'strip-stale-sourcemaps-builds',
		survivorRule: 'dam-cdn-authority-first',
		protectDamMasters: true,
		protectActiveCdnRelease: true,
		protectMasterFormats: true,
		staleBuildDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'hls-dash-ladder-hardlink',
		name: 'HLS/DASH Chunks & Build Asset Hardlink',
		description: 'Keep canonical streaming segments (.ts/.m4s/.m3u8/.mpd), _480p/_720p ladders, and hashed chunks while hardlinking redundant copies with stat cross-device safety.',
		familyFilter: 'streaming-chunk-trees',
		strategy: 'hardlink-shared-asset-chunks',
		survivorRule: 'dam-cdn-authority-first',
		protectDamMasters: true,
		protectActiveCdnRelease: true,
		protectMasterFormats: true,
		staleBuildDays: 7,
		minSizeKb: 0,
	},
	{
		id: 'responsive-pyramid-cleanup',
		name: 'Responsive @2x/.webp/.avif Pyramid Audit',
		description: 'Audit @2x/@3x, -1280w, _thumb, _640x480, and .webp/.avif/.jxl derivative trees against DAM .png/.jpg/.tif masters.',
		familyFilter: 'responsive-media-pyramids',
		strategy: 'consolidate-dam-originals',
		survivorRule: 'master-format-first',
		protectDamMasters: true,
		protectActiveCdnRelease: true,
		protectMasterFormats: true,
		staleBuildDays: 14,
		minSizeKb: 0,
	},
])

const SOURCEMAP_EXT_RE = /\.(?:js|mjs|cjs|css|d\.ts|wasm)\.map$/i
const TSBUILDINFO_RE = /\.tsbuildinfo$/i
const BUNDLE_STATS_RE = /^(?:stats|bundle-stats|webpack-stats|vite-stats|rollup-stats)\.json$|\.stats\.json$/i

const STREAM_MANIFEST_EXT_SET = new Set(['m4s', 'm3u8', 'mpd'])
const HLS_PATH_RE = /(\/hls\/|\/hls[-_][^/]*\/|\/dash\/|\/stream\/|\/streams\/|\/vod\/|\/live\/|\/segments\/|\/chunks\/|\/transcode[^/]*\/)/i
const HLS_TS_NAME_RE = /(?:^|[_-])(?:seg|segment|chunk|frag|media|index|stream)\d*\.ts$|(?:^|[_-])(?:240|360|480|540|720|1080|1440|2160|4k)p(?:[_.-].*)?\.ts$/i
const VIDEO_LADDER_RE = /(?:[_-](?:240|360|480|540|720|1080|1440|2160|4k)p(?:[_.-].*)?|_init)\.(?:mp4|webm|m4v)$/i
const DASH_INIT_RE = /^init[-_].*\.(?:m4s|mp4)$/i

const RESPONSIVE_DERIVATIVE_EXT_SET = new Set(['webp', 'avif', 'jxl'])
const MASTER_RASTER_EXT_SET = new Set(['png', 'jpg', 'jpeg', 'tif', 'tiff'])
const RESPONSIVE_RETINA_TAG_RE = /(@[1-4]x)(?=\.[^.]+$|$)/gi
const RESPONSIVE_WIDTH_TAG_RE = /[_-](\d{2,4}w)(?=\.[^.]+$|$)/gi
const RESPONSIVE_DIMS_TAG_RE = /[_-](\d{2,4}x\d{2,4})(?=\.[^.]+$|$)/gi
const RESPONSIVE_THUMB_TAG_RE = /[_-](thumb(?:nail)?)(?=\.[^.]+$|$)/gi
const RESPONSIVE_PATH_RE = /(\/srcset\/|\/responsive\/|\/pyramids\/|\/renditions\/|\/derivatives\/|\/image-cache\/|\/imgproxy\/|\/sharp-cache\/|\/dam-originals\/|\/dam-masters\/|\/dam\/|\/source-masters\/|\/master-assets\/|\/cdn-release\/|\/active-cdn\/|\/prod-cdn\/)/i

const BUILD_CACHE_PATH_RE = /(\/\.next\/static\/|\/\.next\/|\/\.nuxt\/|\/dist\/assets\/|\/dist\/|\/build\/static\/|\/\.svelte-kit\/|\/\.vite\/|\/\.turbo\/|\/\.parcel-cache\/|\/out\/_next\/)/i
const HASHED_BUNDLE_CHUNK_RE = /^(?:(?:main|app|vendor|runtime|polyfills|chunk|bundle|index|common|styles|entry|manifest|framework|webpack)[.-]([a-f0-9]{6,20}|[a-z0-9_-]{8,16})|[a-z0-9_-]+\.([a-f0-9]{8,20})|chunk-([a-z0-9]{6,20}))\.(?:js|mjs|cjs|css|woff2?)$/i

const DAM_SOURCE_MASTER_PATH_RE = /(\/dam-originals\/|\/dam_originals\/|\/dam-masters\/|\/dam_masters\/|\/dam\/|\/source-masters\/|\/source_masters\/|\/raw-masters\/|\/master-assets\/|\/brand-masters\/|\/__groupfolders\/\d+\/(?:dam|dam-originals|masters|source-masters))/i
const ACTIVE_CDN_RELEASE_PATH_RE = /(\/cdn-release\/|\/cdn_release\/|\/active-cdn\/|\/active_cdn\/|\/prod-cdn\/|\/cdn\/live\/|\/cdn\/active\/|\/active-release\/|\/releases\/current\/|\/public-cdn\/live\/|\/__groupfolders\/\d+\/(?:cdn-release|active-cdn|prod-cdn|active-release))/i
const STAGING_SNAPSHOT_PATH_RE = /(\/staging\/|\/preview\/|\/snapshot\/|\/snapshots\/|\/ci-artifacts\/|\/build-snapshots\/|\/\.next\/|\/\.nuxt\/|\/dist\/|\/build\/|\/out\/)/i
const TRANSCODE_LADDER_CACHE_PATH_RE = /(\/transcode-cache\/|\/transcode_cache\/|\/hls-cache\/|\/dash-cache\/|\/image-cache\/|\/imgproxy\/|\/sharp-cache\/|\/var\/cache\/|\/downloads\/|\/telechargements\/|\/tmp\/|\/temp\/|\/scratch\/)/i

const COPY_SUFFIX_RE = /\s-\s?copy(?:\s*\(\d+\))?|\s*\(\d+\)|_copy\b/gi

const TIER_LABELS = Object.freeze({
	'dam-source-master': 'DAM Source Master',
	'active-cdn-release': 'Active CDN Release',
	'staging-snapshot-build': 'Staging / Build Snapshot',
	'transcode-ladder-cache': 'Transcode / Derivative Cache',
	'unstripped-map-leak': 'Unstripped Source-Map / Symbol Leak',
})

const TIER_AUTHORITY = Object.freeze({
	'dam-source-master': 98,
	'active-cdn-release': 84,
	'staging-snapshot-build': 58,
	'transcode-ladder-cache': 28,
	'unstripped-map-leak': 14,
})

const VERDICT_LABELS = Object.freeze({
	'keep-canonical-survivor': 'Keep Canonical Master',
	'reclaim-build-cache': 'Reclaim Build / Derivative Copy',
	'reclaim-map-leak': 'Strip Exposed Map / Symbol Bloat',
	'hardlink-asset-chunk': 'Hardlink Asset / Stream Chunk',
	'blocked-dam-master': 'Blocked: DAM Source Master',
	'blocked-active-cdn': 'Blocked: Active CDN Release',
	'blocked-master-format': 'Blocked: Master Raster / Video Format',
	'blocked-not-map-or-build': 'Shielded: Non-Map / Non-Build Asset',
	'blocked-manual-shield': 'Blocked: Operator Shield',
	excluded: 'Excluded by Operator',
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
	const raw = String(normalizedPath || '')
	const idx = raw.lastIndexOf('/')
	return idx === -1 ? raw : raw.slice(idx + 1)
}

/**
 * Collect regex capture matches from a string cleanly.
 *
 * @param {string} input Source string.
 * @param {RegExp} pattern Global regex pattern.
 * @return {Array<string>} Matched tokens.
 */
function collectTagMatches(input, pattern) {
	const out = []
	const re = new RegExp(pattern.source, pattern.flags)
	let match = re.exec(input)
	while (match !== null) {
		const token = (match[1] || match[0] || '').trim()
		if (token) {
			out.push(token)
		}
		if (match.index === re.lastIndex) {
			re.lastIndex += 1
		}
		match = re.exec(input)
	}
	return out
}

/**
 * Extract normalized extension, handling compound source-map extensions (.js.map, .d.ts.map, etc.).
 *
 * @param {string} lowerBase Lowercase basename.
 * @return {string} Normalized extension without leading dot.
 */
function extractWebArtifactExtension(lowerBase) {
	if (/\.d\.ts\.map$/i.test(lowerBase)) {
		return 'd.ts.map'
	}
	if (/\.js\.map$/i.test(lowerBase)) {
		return 'js.map'
	}
	if (/\.mjs\.map$/i.test(lowerBase)) {
		return 'mjs.map'
	}
	if (/\.cjs\.map$/i.test(lowerBase)) {
		return 'cjs.map'
	}
	if (/\.css\.map$/i.test(lowerBase)) {
		return 'css.map'
	}
	if (/\.wasm\.map$/i.test(lowerBase)) {
		return 'wasm.map'
	}
	const lastDot = lowerBase.lastIndexOf('.')
	if (lastDot <= 0 || lastDot >= lowerBase.length - 1) {
		return ''
	}
	return lowerBase.slice(lastDot + 1)
}

/**
 * Parse responsive pyramid tags, streaming ladder markers, hashed chunk tokens, and canonical assetLineageStem.
 *
 * @param {string} basename File basename.
 * @param {string} [normalizedPath=''] Normalized file path.
 * @return {object} Lineage stem and extracted artifact tags.
 */
export function parseWebBuildArtifactInfo(basename, normalizedPath = '') {
	const rawBase = String(basename || '')
	const lowerBase = rawBase.toLowerCase()
	const lowerPath = String(normalizedPath || '').toLowerCase()
	const ext = extractWebArtifactExtension(lowerBase)

	let stem = rawBase
	if (ext && lowerBase.endsWith(`.${ext}`)) {
		stem = rawBase.slice(0, rawBase.length - ext.length - 1)
	}

	const retinaTags = collectTagMatches(stem, RESPONSIVE_RETINA_TAG_RE)
	const widthTags = collectTagMatches(stem, RESPONSIVE_WIDTH_TAG_RE)
	const dimsTags = collectTagMatches(stem, RESPONSIVE_DIMS_TAG_RE)
	const thumbTags = collectTagMatches(stem, RESPONSIVE_THUMB_TAG_RE)

	const ladderMatch = stem.match(/[_-]((?:240|360|480|540|720|1080|1440|2160|4k)p)(?=[_.-]|$)/i)
	const hashMatch = rawBase.match(HASHED_BUNDLE_CHUNK_RE)
	const chunkHash = hashMatch ? (hashMatch[1] || hashMatch[2] || hashMatch[3] || '') : ''

	const artifactTags = []
	for (const token of [...retinaTags, ...widthTags, ...dimsTags, ...thumbTags]) {
		if (!artifactTags.includes(token)) {
			artifactTags.push(token)
		}
	}
	if (RESPONSIVE_DERIVATIVE_EXT_SET.has(ext) && !artifactTags.includes(ext)) {
		artifactTags.push(ext)
	}
	if (ladderMatch && !artifactTags.includes(ladderMatch[1].toLowerCase())) {
		artifactTags.push(ladderMatch[1].toLowerCase())
	}
	if (ext === 'm3u8' || HLS_PATH_RE.test(lowerPath) || HLS_TS_NAME_RE.test(lowerBase)) {
		if (!artifactTags.includes('hls')) {
			artifactTags.push('hls')
		}
	}
	if (ext === 'mpd' || ext === 'm4s' || DASH_INIT_RE.test(lowerBase)) {
		if (!artifactTags.includes('dash')) {
			artifactTags.push('dash')
		}
	}
	if (chunkHash) {
		artifactTags.push(`hash:${chunkHash}`)
	}
	if (SOURCEMAP_EXT_RE.test(lowerBase) || TSBUILDINFO_RE.test(lowerBase) || BUNDLE_STATS_RE.test(lowerBase)) {
		artifactTags.push(ext || 'map')
	}
	if (/\/\.next\/static\//i.test(lowerPath)) {
		artifactTags.push('.next/static')
	} else if (/\/\.nuxt\//i.test(lowerPath)) {
		artifactTags.push('.nuxt')
	} else if (/\/dist\/assets\//i.test(lowerPath)) {
		artifactTags.push('dist/assets')
	}

	let cleanStem = stem
		.replace(RESPONSIVE_RETINA_TAG_RE, '')
		.replace(RESPONSIVE_WIDTH_TAG_RE, '')
		.replace(RESPONSIVE_DIMS_TAG_RE, '')
		.replace(RESPONSIVE_THUMB_TAG_RE, '')
		.replace(/[_-](?:240|360|480|540|720|1080|1440|2160|4k)p$/i, '')
		.replace(COPY_SUFFIX_RE, '')

	if (chunkHash) {
		cleanStem = cleanStem.replace(new RegExp(`[._-]${chunkHash}$`, 'i'), '')
	}

	cleanStem = cleanStem
		.replace(/[\s_.-]+$/g, '')
		.replace(/^[\s_.-]+/g, '')

	if (!cleanStem) {
		cleanStem = stem || rawBase
	}

	const isResponsiveDerivative = Boolean(
		RESPONSIVE_DERIVATIVE_EXT_SET.has(ext)
		|| retinaTags.length > 0
		|| widthTags.length > 0
		|| dimsTags.length > 0
		|| thumbTags.length > 0
	)

	const isSourceMapOrSymbol = Boolean(
		SOURCEMAP_EXT_RE.test(lowerBase)
		|| TSBUILDINFO_RE.test(lowerBase)
		|| BUNDLE_STATS_RE.test(lowerBase)
	)

	const isStreamingChunk = Boolean(
		STREAM_MANIFEST_EXT_SET.has(ext)
		|| (ext === 'ts' && (HLS_PATH_RE.test(lowerPath) || HLS_TS_NAME_RE.test(lowerBase)))
		|| VIDEO_LADDER_RE.test(lowerBase)
		|| DASH_INIT_RE.test(lowerBase)
	)

	const isBuildCacheArtifact = Boolean(
		!isSourceMapOrSymbol
		&& (BUILD_CACHE_PATH_RE.test(lowerPath) || Boolean(chunkHash))
	)

	return {
		assetLineageStem: cleanStem,
		artifactTags,
		artifactTag: artifactTags.length > 0 ? artifactTags.join(', ') : 'none',
		isResponsiveDerivative,
		isSourceMapOrSymbol,
		isStreamingChunk,
		isBuildCacheArtifact,
	}
}

/**
 * Classify a file path into one of the 4 Web Build, Responsive Media, HLS/DASH, and Source-Map families.
 *
 * @param {string} rawPath File path.
 * @return {object|null} Classification metadata or null for unrelated files.
 */
export function classifyWebBuildMediaArtifact(rawPath) {
	const normalized = normalizePathForDiff(rawPath) || String(rawPath || '')
	const basename = extractBasename(normalized)
	const lowerBase = basename.toLowerCase()
	const lowerPath = normalized.toLowerCase()

	if (!lowerBase) {
		return null
	}

	const ext = extractWebArtifactExtension(lowerBase)
	const info = parseWebBuildArtifactInfo(basename, normalized)

	if (info.isSourceMapOrSymbol) {
		return {
			matched: true,
			family: 'debug-sourcemaps-symbols',
			familyLabel: WEB_BUILD_MEDIA_FAMILY_META['debug-sourcemaps-symbols'].label,
			extension: ext,
			...info,
		}
	}

	if (info.isStreamingChunk) {
		return {
			matched: true,
			family: 'streaming-chunk-trees',
			familyLabel: WEB_BUILD_MEDIA_FAMILY_META['streaming-chunk-trees'].label,
			extension: ext,
			...info,
		}
	}

	const hasResponsiveMasterContext = MASTER_RASTER_EXT_SET.has(ext)
		&& (info.isResponsiveDerivative || RESPONSIVE_PATH_RE.test(lowerPath))

	if (RESPONSIVE_DERIVATIVE_EXT_SET.has(ext) || hasResponsiveMasterContext) {
		return {
			matched: true,
			family: 'responsive-media-pyramids',
			familyLabel: WEB_BUILD_MEDIA_FAMILY_META['responsive-media-pyramids'].label,
			extension: ext,
			...info,
		}
	}

	if (info.isBuildCacheArtifact) {
		return {
			matched: true,
			family: 'frontend-build-caches',
			familyLabel: WEB_BUILD_MEDIA_FAMILY_META['frontend-build-caches'].label,
			extension: ext,
			...info,
		}
	}

	return null
}

/**
 * Inspect governance tier, protection flags, and web build/media context for a cluster member.
 *
 * @param {object} file Duplicate file entry.
 * @param {object} classification Classification metadata.
 * @param {number} referenceTimeSec Reference epoch seconds.
 * @param {number} staleBuildDays Stale build/cache threshold in days.
 * @return {object} Governance and lineage context.
 */
export function inspectWebBuildMemberContext(file, classification, referenceTimeSec, staleBuildDays) {
	const normalizedPath = normalizePathForDiff(file && file.path) || String((file && file.path) || '')
	const basename = extractBasename(normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const mtimeSec = getFileMtimeSeconds(file)
	const ageDays = mtimeSec !== null && Number.isFinite(referenceTimeSec)
		? Math.max(0, Math.floor((referenceTimeSec - mtimeSec) / 86400))
		: null

	const parsed = parseWebBuildArtifactInfo(basename, normalizedPath)
	const ext = extractWebArtifactExtension(basename.toLowerCase()) || classification.extension || ''

	const isUnstrippedMapLeak = parsed.isSourceMapOrSymbol
	const isDamSourceMaster = !isUnstrippedMapLeak && DAM_SOURCE_MASTER_PATH_RE.test(lowerPath)
	const isActiveCdnRelease = !isUnstrippedMapLeak && !isDamSourceMaster && ACTIVE_CDN_RELEASE_PATH_RE.test(lowerPath)
	const isTranscodeLadderPath = TRANSCODE_LADDER_CACHE_PATH_RE.test(lowerPath)
	const isStagingSnapshotPath = STAGING_SNAPSHOT_PATH_RE.test(lowerPath)

	let tier = 'staging-snapshot-build'
	if (isUnstrippedMapLeak) {
		tier = 'unstripped-map-leak'
	} else if (isDamSourceMaster) {
		tier = 'dam-source-master'
	} else if (isActiveCdnRelease) {
		tier = 'active-cdn-release'
	} else if (isTranscodeLadderPath || (!isStagingSnapshotPath && (parsed.isResponsiveDerivative || parsed.isStreamingChunk))) {
		tier = 'transcode-ladder-cache'
	} else if (isStagingSnapshotPath || parsed.isBuildCacheArtifact) {
		tier = 'staging-snapshot-build'
	}

	const isTranscodeLadderCache = tier === 'transcode-ladder-cache'
	const isStagingSnapshotBuild = tier === 'staging-snapshot-build'
	const isMasterFormatOriginal = !isUnstrippedMapLeak
		&& !parsed.isResponsiveDerivative
		&& !parsed.isBuildCacheArtifact
		&& !isTranscodeLadderPath
		&& (MASTER_RASTER_EXT_SET.has(ext) || ext === 'svg' || (ext === 'mp4' && !VIDEO_LADDER_RE.test(basename.toLowerCase())))

	const isExposedMapInPublic = isUnstrippedMapLeak
		&& /(\/cdn|\/public\/|\/dist\/|\/build\/|\/\.next\/|\/\.nuxt\/|\/staging\/|\/out\/)/i.test(lowerPath)

	const isStaleBuildOrCache = ageDays !== null
		&& ageDays >= staleBuildDays
		&& (isUnstrippedMapLeak || isTranscodeLadderCache || isStagingSnapshotBuild || parsed.isBuildCacheArtifact)

	let authorityScore = TIER_AUTHORITY[tier] || 50
	if (isMasterFormatOriginal) {
		authorityScore += 6
	}
	if (isDamSourceMaster && MASTER_RASTER_EXT_SET.has(ext)) {
		authorityScore += 2
	}
	if (parsed.isResponsiveDerivative) {
		authorityScore -= 4
	}
	if (isExposedMapInPublic) {
		authorityScore -= 6
	}

	return {
		tier,
		tierLabel: TIER_LABELS[tier] || TIER_LABELS['staging-snapshot-build'],
		authorityScore,
		extension: ext,
		assetLineageStem: parsed.assetLineageStem,
		artifactTags: parsed.artifactTags,
		artifactTag: parsed.artifactTag,
		isDamSourceMaster,
		isActiveCdnRelease,
		isStagingSnapshotBuild,
		isTranscodeLadderCache,
		isUnstrippedMapLeak,
		isExposedMapInPublic,
		isMasterFormatOriginal,
		isResponsiveDerivative: parsed.isResponsiveDerivative,
		isStreamingChunk: parsed.isStreamingChunk,
		isBuildCacheArtifact: parsed.isBuildCacheArtifact,
		isStaleBuildOrCache,
		mtimeSec,
		ageDays,
	}
}

/**
 * Select the canonical surviving copy inside a Web Build / Media Pyramid cluster.
 *
 * @param {Array<object>} members Enriched cluster members.
 * @param {string} survivorRule Survivor selection rule.
 * @param {Set<string>} excludeKeys Excluded member keys.
 * @return {object|null} Selected survivor or null.
 */
function selectClusterSurvivor(members, survivorRule, excludeKeys) {
	if (!Array.isArray(members) || members.length === 0) {
		return null
	}
	const eligible = members.filter(m => !excludeKeys.has(m.selectionKey))
	const pool = eligible.length > 0 ? eligible : members

	const sorted = [...pool].sort((a, b) => {
		if (survivorRule === 'master-format-first') {
			if (a.context.isMasterFormatOriginal !== b.context.isMasterFormatOriginal) {
				return a.context.isMasterFormatOriginal ? -1 : 1
			}
			if (a.context.isUnstrippedMapLeak !== b.context.isUnstrippedMapLeak) {
				return a.context.isUnstrippedMapLeak ? 1 : -1
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'newest-release') {
			if (a.context.isUnstrippedMapLeak !== b.context.isUnstrippedMapLeak) {
				return a.context.isUnstrippedMapLeak ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? -1
			const mtimeB = b.context.mtimeSec ?? -1
			if (mtimeA !== mtimeB) {
				return mtimeB - mtimeA
			}
			if (a.context.authorityScore !== b.context.authorityScore) {
				return b.context.authorityScore - a.context.authorityScore
			}
		} else if (survivorRule === 'oldest-canonical') {
			if (a.context.isUnstrippedMapLeak !== b.context.isUnstrippedMapLeak) {
				return a.context.isUnstrippedMapLeak ? 1 : -1
			}
			const mtimeA = a.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			const mtimeB = b.context.mtimeSec ?? Number.MAX_SAFE_INTEGER
			if (mtimeA !== mtimeB) {
				return mtimeA - mtimeB
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

		const mtimeA = a.context.mtimeSec ?? 0
		const mtimeB = b.context.mtimeSec ?? 0
		if (mtimeA !== mtimeB) {
			return mtimeB - mtimeA
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})

	return sorted[0] || null
}

/**
 * Determine the deterministic remediation verdict for a Web Build / Media cluster member.
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
			note: 'Excluded from Web Build & Media audit actions by manual operator override.',
		}
	}

	if (survivor && member.selectionKey === survivor.selectionKey) {
		return {
			verdict: 'keep-canonical-survivor',
			verdictLabel: VERDICT_LABELS['keep-canonical-survivor'],
			actionKind: 'keep',
			note: `Canonical ${member.context.tierLabel} copy retained as the authoritative asset.`,
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

	if (options.protectDamMasters && member.context.isDamSourceMaster) {
		return {
			verdict: 'blocked-dam-master',
			verdictLabel: VERDICT_LABELS['blocked-dam-master'],
			actionKind: 'shield',
			note: 'Strictly protected by DAM Source Master Guard; original source assets in DAM vaults are never deleted automatically.',
		}
	}

	if (options.protectActiveCdnRelease && member.context.isActiveCdnRelease) {
		return {
			verdict: 'blocked-active-cdn',
			verdictLabel: VERDICT_LABELS['blocked-active-cdn'],
			actionKind: 'shield',
			note: 'Protected by Active CDN Release Guard; live production bundles and responsive asset pyramids require release sign-off.',
		}
	}

	if (options.protectMasterFormats && member.context.isMasterFormatOriginal && !member.context.isStagingSnapshotBuild) {
		return {
			verdict: 'blocked-master-format',
			verdictLabel: VERDICT_LABELS['blocked-master-format'],
			actionKind: 'shield',
			note: 'Protected by Master Format Guard; uncompressed .png/.jpg/.tif or full-resolution master outside build/cache pools.',
		}
	}

	if (member.context.isUnstrippedMapLeak) {
		return {
			verdict: 'reclaim-map-leak',
			verdictLabel: VERDICT_LABELS['reclaim-map-leak'],
			actionKind: 'reclaim',
			note: member.context.isExposedMapInPublic
				? 'Exposed source-map or build symbol artifact inside public/dist/CDN output; strip from web serving root.'
				: 'Redundant debug source-map (.map), .tsbuildinfo, or bundle stats.json superseded by canonical symbol store.',
		}
	}

	if (options.strategy === 'strip-stale-sourcemaps-builds') {
		const isStripEligible = member.context.isUnstrippedMapLeak
			|| member.context.isBuildCacheArtifact
			|| member.context.isStagingSnapshotBuild
			|| member.context.isStaleBuildOrCache
		if (!isStripEligible) {
			return {
				verdict: 'blocked-not-map-or-build',
				verdictLabel: VERDICT_LABELS['blocked-not-map-or-build'],
				actionKind: 'shield',
				note: 'Retained by Strip Source-Maps & Stale Builds strategy because copy is outside build caches and exposed map trees.',
			}
		}
		return {
			verdict: 'reclaim-build-cache',
			verdictLabel: VERDICT_LABELS['reclaim-build-cache'],
			actionKind: 'reclaim',
			note: 'Stale .next/static, .nuxt, dist/assets, or staging build snapshot superseded by canonical survivor.',
		}
	}

	if (options.strategy === 'hardlink-shared-asset-chunks') {
		return {
			verdict: 'hardlink-asset-chunk',
			verdictLabel: VERDICT_LABELS['hardlink-asset-chunk'],
			actionKind: 'hardlink',
			note: 'Replace redundant responsive derivative, HLS/DASH segment, or hashed build chunk with a same-filesystem POSIX hardlink.',
		}
	}

	return {
		verdict: 'reclaim-build-cache',
		verdictLabel: VERDICT_LABELS['reclaim-build-cache'],
		actionKind: 'reclaim',
		note: 'Identical-hash responsive derivative, streaming ladder cache, or build output copy superseded by canonical DAM/CDN master.',
	}
}

/**
 * Normalize Web Build & Media auditor options into deterministic bounds.
 *
 * @param {object} [rawOptions] Caller options.
 * @return {object} Normalized options.
 */
function normalizeOptions(rawOptions = {}) {
	const familyFilter = WEB_BUILD_MEDIA_FAMILIES.includes(rawOptions.familyFilter)
		? rawOptions.familyFilter
		: 'all'
	const verdictFilter = WEB_BUILD_VERDICT_FILTERS.includes(rawOptions.verdictFilter)
		? rawOptions.verdictFilter
		: 'all'
	const sortMode = WEB_BUILD_SORT_MODES.includes(rawOptions.sortMode)
		? rawOptions.sortMode
		: 'reclaim_desc'
	const strategy = WEB_BUILD_STRATEGIES.includes(rawOptions.strategy)
		? rawOptions.strategy
		: 'consolidate-dam-originals'
	const survivorRule = WEB_BUILD_SURVIVOR_RULES.includes(rawOptions.survivorRule)
		? rawOptions.survivorRule
		: 'dam-cdn-authority-first'

	const parsedDays = Number.parseInt(rawOptions.staleBuildDays, 10)
	const staleBuildDays = Number.isFinite(parsedDays) && parsedDays >= 0
		? Math.min(parsedDays, 3650)
		: 14

	const parsedMinKb = Number.parseFloat(rawOptions.minSizeKb)
	const minSizeKb = Number.isFinite(parsedMinKb) && parsedMinKb >= 0
		? parsedMinKb
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
		protectDamMasters: rawOptions.protectDamMasters !== false,
		protectActiveCdnRelease: rawOptions.protectActiveCdnRelease !== false,
		protectMasterFormats: rawOptions.protectMasterFormats !== false,
		staleBuildDays,
		minSizeKb,
		searchQuery: String(rawOptions.searchQuery || '').trim().toLowerCase(),
		referenceTimeSec,
		memberOverrides: rawOptions.memberOverrides && typeof rawOptions.memberOverrides === 'object'
			? rawOptions.memberOverrides
			: {},
	}
}

const FAMILY_PRIORITY = Object.freeze({
	'debug-sourcemaps-symbols': 4,
	'streaming-chunk-trees': 3,
	'responsive-media-pyramids': 2,
	'frontend-build-caches': 1,
})

/**
 * Audit duplicate groups for Web Build Output, Responsive Image Pyramids, HLS/DASH Chunks, and Source-Map Bloat.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @param {object} [rawOptions] Auditor configuration options.
 * @return {object} Deterministic audit analysis with summary, counts, and clusters.
 */
export function analyzeWebBuildMediaDuplicates(duplicates, rawOptions = {}) {
	const options = normalizeOptions(rawOptions)
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minSizeBytes = options.minSizeKb * 1024

	const familyCounts = {
		all: 0,
		'responsive-media-pyramids': 0,
		'streaming-chunk-trees': 0,
		'frontend-build-caches': 0,
		'debug-sourcemaps-symbols': 0,
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
			const info = classifyWebBuildMediaArtifact(file.path)
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

		const forceKeepKeys = new Set()
		const excludeKeys = new Set()

		const members = validFiles.map((file, fileIdx) => {
			const normalizedPath = normalizePathForDiff(file.path) || String(file.path || '')
			const basename = extractBasename(normalizedPath)
			const selectionKey = String(getFileSelectionKey(file, `${groupIdx}-${fileIdx}`))
			const override = options.memberOverrides[selectionKey] || 'auto'
			if (override === 'force-keep') {
				forceKeepKeys.add(selectionKey)
			} else if (override === 'exclude') {
				excludeKeys.add(selectionKey)
			}

			const directInfo = classifyWebBuildMediaArtifact(file.path)
			const memberInfo = directInfo && directInfo.matched ? directInfo : primaryInfo
			const context = inspectWebBuildMemberContext(file, memberInfo, options.referenceTimeSec, options.staleBuildDays)
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

		const reclaimableMembers = members.filter(m => m.actionKind === 'reclaim' || m.actionKind === 'hardlink')
		const reclaimableBytes = reclaimableMembers.reduce((sum, m) => sum + m.size, 0)
		const reclaimableCopiesCount = reclaimableMembers.length
		const shieldedCopiesCount = members.filter(m => m.actionKind === 'shield').length
		const damMasterCopiesCount = members.filter(m => m.verdict === 'blocked-dam-master' || m.context.isDamSourceMaster).length
		const activeCdnCopiesCount = members.filter(m => m.verdict === 'blocked-active-cdn' || m.context.isActiveCdnRelease).length
		const mapLeakCopiesCount = members.filter(m => m.context.isUnstrippedMapLeak).length

		const hasDamSourceMaster = members.some(m => m.context.isDamSourceMaster)
		const hasActiveCdnRelease = members.some(m => m.context.isActiveCdnRelease)
		const hasUnstrippedMapLeak = members.some(m => m.context.isUnstrippedMapLeak)
		const hasStreamingChunks = members.some(m => m.context.isStreamingChunk)

		let clusterRiskState = 'reclaimable'
		if (hasUnstrippedMapLeak) {
			clusterRiskState = 'map-leak'
		} else if (members.some(m => m.verdict === 'blocked-dam-master')) {
			clusterRiskState = 'dam-master'
		} else if (members.some(m => m.verdict === 'blocked-active-cdn')) {
			clusterRiskState = 'active-cdn'
		} else if (reclaimableCopiesCount === 0) {
			clusterRiskState = 'shielded'
		}

		const primaryGroupId = group.id ?? null
		const groupKey = String(group.hash || primaryGroupId || `web-${groupIdx}`)
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
			damMasterCopiesCount,
			activeCdnCopiesCount,
			mapLeakCopiesCount,
			hasDamSourceMaster,
			hasActiveCdnRelease,
			hasUnstrippedMapLeak,
			hasStreamingChunks,
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
		if (options.verdictFilter === 'dam-masters' && !cluster.hasDamSourceMaster) {
			return false
		}
		if (options.verdictFilter === 'active-cdn' && !cluster.hasActiveCdnRelease) {
			return false
		}
		if (options.verdictFilter === 'map-leaks' && !cluster.hasUnstrippedMapLeak) {
			return false
		}
		if (options.verdictFilter === 'shielded' && cluster.shieldedCopiesCount === 0 && cluster.clusterRiskState !== 'shielded') {
			return false
		}
		return true
	})

	clusters.sort((a, b) => {
		if (options.sortMode === 'risk_desc') {
			const riskA = a.mapLeakCopiesCount * 6 + a.damMasterCopiesCount * 4 + a.activeCdnCopiesCount * 3 + a.shieldedCopiesCount
			const riskB = b.mapLeakCopiesCount * 6 + b.damMasterCopiesCount * 4 + b.activeCdnCopiesCount * 3 + b.shieldedCopiesCount
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
	const totalDamMasterClusters = clusters.filter(c => c.hasDamSourceMaster).length
	const totalActiveCdnClusters = clusters.filter(c => c.hasActiveCdnRelease).length
	const totalMapLeakCopiesCount = clusters.reduce((sum, c) => sum + c.mapLeakCopiesCount, 0)
	const efficiencyPct = totalRawDuplicateBytes > 0
		? Math.round((totalReclaimableBytes / totalRawDuplicateBytes) * 100)
		: 0

	return {
		schema: WEB_BUILD_MEDIA_SCHEMA,
		options: {
			familyFilter: options.familyFilter,
			verdictFilter: options.verdictFilter,
			sortMode: options.sortMode,
			strategy: options.strategy,
			survivorRule: options.survivorRule,
			protectDamMasters: options.protectDamMasters,
			protectActiveCdnRelease: options.protectActiveCdnRelease,
			protectMasterFormats: options.protectMasterFormats,
			staleBuildDays: options.staleBuildDays,
			minSizeKb: options.minSizeKb,
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
			totalDamMasterClusters,
			totalActiveCdnClusters,
			totalMapLeakCopiesCount,
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
 * Build a POSIX DRY_RUN=1 remediation script for Web Build, Responsive Media, HLS/DASH, and Source-Map cleanup.
 *
 * @param {object} analysis Output from analyzeWebBuildMediaDuplicates.
 * @param {object} [options] Script options.
 * @param {string} [options.dataRoot='/var/www/nextcloud/data'] Nextcloud data root directory.
 * @return {string} POSIX bash script with single-quoted paths, SHA-256 verification, cross-device stat guard, and DRY_RUN=1 default.
 */
export function buildWebBuildMediaScript(analysis, options = {}) {
	const dataRoot = String(options.dataRoot || '/var/www/nextcloud/data').replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const strategy = (analysis && analysis.options && analysis.options.strategy) || 'consolidate-dam-originals'

	const operations = []
	const affectedPaths = []

	for (const cluster of clusters) {
		const survivorPath = cluster && cluster.survivor ? cluster.survivor.normalizedPath : ''
		if (!survivorPath) {
			continue
		}
		for (const member of cluster.members || []) {
			if (member.actionKind !== 'reclaim' && member.actionKind !== 'hardlink') {
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
		'# Web Build Output, Responsive Image Pyramid, HLS/DASH Chunks & Source-Map Auditor',
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
		lines.push('echo "No reclaimable or hardlinkable web build, media pyramid, HLS/DASH, or source-map targets under current guards."')
		return lines.join('\n')
	}

	lines.push('reclaim_web_artifact() {')
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
	lines.push('hardlink_web_chunk() {')
	lines.push('  local survivor_rel="$1"')
	lines.push('  local target_rel="$2"')
	lines.push('  local survivor_full target_full')
	lines.push('  survivor_full="$(resolve_path "$survivor_rel")"')
	lines.push('  target_full="$(resolve_path "$target_rel")"')
	lines.push('  if [ "$DRY_RUN" = "1" ]; then')
	lines.push('    printf \'[DRY_RUN] ln -f -- %s %s\\n\' "$survivor_full" "$target_full"')
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
		if (op.actionKind === 'hardlink') {
			lines.push(`hardlink_web_chunk ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
		} else {
			lines.push(`reclaim_web_artifact ${escapePosixSingleQuote(op.survivorPath)} ${escapePosixSingleQuote(op.targetPath)}`)
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
 * Build a Nextcloud Desktop .sync-exclude.lst snippet for frontend build outputs, source-maps, and TypeScript caches.
 *
 * @param {object} analysis Output from analyzeWebBuildMediaDuplicates.
 * @return {string} Newline-delimited Nextcloud sync-exclude patterns.
 */
export function buildWebBuildSyncExcludeSnippet(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const lines = [
		'# Nextcloud Desktop .sync-exclude.lst rules for frontend build outputs, source-maps, and TS build caches',
		'dist/',
		'.next/',
		'.nuxt/',
		'*.js.map',
		'*.css.map',
		'*.d.ts.map',
		'*.wasm.map',
		'*.tsbuildinfo',
		'stats.json',
	]
	const seen = new Set(lines)
	for (const cluster of clusters) {
		if (cluster && cluster.extension === 'm4s' && !seen.has('*.m4s')) {
			lines.push('*.m4s')
			seen.add('*.m4s')
		}
	}
	return lines.join('\n')
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for Web Build, Media Pyramid, HLS/DASH, and Source-Map clusters.
 *
 * @param {object} analysis Output from analyzeWebBuildMediaDuplicates.
 * @return {string} RFC-4180 CSV string with CWE-1236 formula escaping.
 */
export function buildWebBuildMediaCsvReport(analysis) {
	const clusters = analysis && Array.isArray(analysis.clusters) ? analysis.clusters : []
	const headers = [
		'Cluster Key',
		'Artifact Name',
		'Asset Lineage Stem',
		'Artifact Tags',
		'Extension',
		'Family',
		'Governance Tier',
		'DAM Source Master',
		'Active CDN Release',
		'Unstripped Map Leak',
		'Responsive Derivative',
		'Streaming Chunk',
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
				member.context.isDamSourceMaster ? 'yes' : 'no',
				member.context.isActiveCdnRelease ? 'yes' : 'no',
				member.context.isUnstrippedMapLeak ? 'yes' : 'no',
				member.context.isResponsiveDerivative ? 'yes' : 'no',
				member.context.isStreamingChunk ? 'yes' : 'no',
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
 * Build a structured JSON audit manifest for Web Build, Responsive Media, HLS/DASH, and Source-Map clusters.
 *
 * @param {object} analysis Output from analyzeWebBuildMediaDuplicates.
 * @param {string} [generatedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function buildWebBuildMediaJsonReport(analysis, generatedAt = new Date().toISOString()) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { summary: {}, clusters: [], options: {} }
	return JSON.stringify({
		schema: WEB_BUILD_MEDIA_SCHEMA,
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
				artifactTags: member.context.artifactTags,
				isDamSourceMaster: member.context.isDamSourceMaster,
				isActiveCdnRelease: member.context.isActiveCdnRelease,
				isUnstrippedMapLeak: member.context.isUnstrippedMapLeak,
				isResponsiveDerivative: member.context.isResponsiveDerivative,
				isStreamingChunk: member.context.isStreamingChunk,
				isBuildCacheArtifact: member.context.isBuildCacheArtifact,
				authorityScore: member.context.authorityScore,
			})),
		})),
	}, null, 2)
}
