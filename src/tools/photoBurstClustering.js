/**
 * Pure Smart Photo & Media Timeline Bursts and Chronology Clustering helpers.
 * Inspired by Immich, PhotoPrism, and Gemini 2 for grouping duplicate photo/video
 * shoots into chronological burst clusters with safe master-selection strategies.
 */

import { extractFileExtension } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PHOTO_BURST_MANIFEST_SCHEMA = 'duplicatefinder.photo-bursts.v1'

export const BURST_WINDOW_PRESETS = Object.freeze([5, 15, 60, 1440])
export const DEFAULT_BURST_WINDOW_MINUTES = 15

export const MEDIA_FILTER_MODES = Object.freeze(['all', 'images', 'videos', 'variants'])
export const BURST_KEEP_STRATEGIES = Object.freeze(['sharpest', 'oldest', 'newest', 'shortest_path'])
export const BURST_SORT_MODES = Object.freeze([
	'newest_first',
	'oldest_first',
	'reclaimable_desc',
	'groups_desc',
])

export const RAW_PHOTO_EXTENSIONS = new Set([
	'dng',
	'cr2',
	'cr3',
	'nef',
	'arw',
	'raf',
	'orf',
	'rw2',
	'pef',
	'srw',
	'raw',
])

export const IMAGE_MEDIA_EXTENSIONS = new Set([
	'jpg',
	'jpeg',
	'png',
	'heic',
	'heif',
	'webp',
	'gif',
	'bmp',
	'tiff',
	'tif',
	'avif',
	...RAW_PHOTO_EXTENSIONS,
])

export const VIDEO_MEDIA_EXTENSIONS = new Set([
	'mp4',
	'mov',
	'm4v',
	'avi',
	'mkv',
	'webm',
	'3gp',
	'mts',
	'm2ts',
])

const EDITED_FILENAME_RE = /(?:^|[\s._-])(edited|edit|crop|cropped|retouch|retouched|final|hdr|pano|enhanced|filtered)(?:[\s._-]|\d|$)/i
const SOCIAL_FILENAME_RE = /(?:^|[\s._-])(wa\d{3,}|whatsapp|telegram|fb_img|messenger|signal|compressed|resized|thumb|thumbnail)(?:[\s._-]|\d|$)/i
const BURST_KEYWORD_RE = /(?:^|[\s._-])(burst|cover|sequence|seq)(?:[\s._-]|\d|$)/i

const DATETIME_COMPACT_RE = /(?:^|[^\d])(20\d{2}|19\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)[T_\s.-]([0-2]\d)[.:_-]?([0-5]\d)[.:_-]?([0-5]\d)(?:[^\d]|$)/
const DATE_ONLY_RE = /(?:^|[^\d])(20\d{2}|19\d{2})[-_.]?([01]\d)[-_.]?([0-3]\d)(?:[^\d]|$)/
const SEQUENCE_STEM_RE = /^([a-zA-Z_-]*?)(\d{2,6})(?:[\s._-].*)?$/

/**
 * Resolve a stable selection key for a duplicate file entry.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {string|null} Stable string key or null.
 */
export function resolveMediaFileKey(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	if (file.id !== null && file.id !== undefined && file.id !== '') {
		return `id:${String(file.id)}`
	}
	if (typeof file.path === 'string' && file.path.trim() !== '') {
		return `path:${file.path.trim()}`
	}
	return null
}

/**
 * Extract normalized path, parent folder, filename, and extension for a file entry.
 *
 * @param {string|null|undefined} rawPath - Raw file path.
 * @return {{ normalizedPath: string, folder: string, fileName: string, stem: string, extension: string }} Parsed parts.
 */
function parseFilePathParts(rawPath) {
	const raw = typeof rawPath === 'string' ? rawPath.trim() : ''
	const normalized = normalizePathForDiff(raw) || raw
	const cleaned = normalized
		? (normalized.startsWith('/') ? normalized : `/${normalized}`)
		: '/'
	const lastSlash = cleaned.lastIndexOf('/')
	const fileName = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned
	const folder = lastSlash > 0 ? cleaned.slice(0, lastSlash) : '/'
	const extension = extractFileExtension(fileName)
	const stem = extension && fileName.toLowerCase().endsWith(`.${extension}`)
		? fileName.slice(0, -(extension.length + 1))
		: fileName

	return {
		normalizedPath: cleaned,
		folder,
		fileName,
		stem,
		extension,
	}
}

/**
 * Classify a file entry as 'raw', 'image', 'video', or null when non-visual media.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {'raw'|'image'|'video'|null} Media classification or null.
 */
export function classifyMediaFileKind(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const { fileName, extension } = parseFilePathParts(file.path)
	const ext = extension || extractFileExtension(fileName)
	const mimetype = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''

	if (RAW_PHOTO_EXTENSIONS.has(ext) || mimetype.includes('raw') || mimetype === 'image/x-adobe-dng') {
		return 'raw'
	}
	if (VIDEO_MEDIA_EXTENSIONS.has(ext) || mimetype.startsWith('video/')) {
		return 'video'
	}
	if (IMAGE_MEDIA_EXTENSIONS.has(ext) || (mimetype.startsWith('image/') && mimetype !== 'image/svg+xml')) {
		return 'image'
	}
	return null
}

/**
 * Validate calendar date/time parts and construct a UTC epoch timestamp in ms.
 *
 * @param {number} year - 4-digit year.
 * @param {number} month - 1-based month (1-12).
 * @param {number} day - Day of month (1-31).
 * @param {number} [hour=12] - Hour (0-23).
 * @param {number} [minute=0] - Minute (0-59).
 * @param {number} [second=0] - Second (0-59).
 * @return {number|null} Epoch ms or null when invalid.
 */
function buildValidatedUtcTimestamp(year, month, day, hour = 12, minute = 0, second = 0) {
	if (
		year < 1970 || year > 2100
		|| month < 1 || month > 12
		|| day < 1 || day > 31
		|| hour < 0 || hour > 23
		|| minute < 0 || minute > 59
		|| second < 0 || second > 59
	) {
		return null
	}
	const ms = Date.UTC(year, month - 1, day, hour, minute, second)
	if (!Number.isFinite(ms)) {
		return null
	}
	const check = new Date(ms)
	if (
		check.getUTCFullYear() !== year
		|| check.getUTCMonth() !== month - 1
		|| check.getUTCDate() !== day
	) {
		return null
	}
	return ms
}

/**
 * Parse camera roll timestamp, burst sequence prefix/number, and variant markers from a filename.
 *
 * @param {string|null|undefined} fileName - Basename of the media file.
 * @return {{
 *   timestampFromName: number|null,
 *   hasTimePrecision: boolean,
 *   burstPrefix: string,
 *   sequenceNumber: number|null,
 *   isEdited: boolean,
 *   isSocialCopy: boolean,
 *   isBurstNamed: boolean
 * }} Parsed metadata.
 */
export function parseMediaFilenameMeta(fileName) {
	const name = typeof fileName === 'string' ? fileName.trim() : ''
	if (!name) {
		return {
			timestampFromName: null,
			hasTimePrecision: false,
			burstPrefix: '',
			sequenceNumber: null,
			isEdited: false,
			isSocialCopy: false,
			isBurstNamed: false,
		}
	}

	const ext = extractFileExtension(name)
	const stem = ext && name.toLowerCase().endsWith(`.${ext}`)
		? name.slice(0, -(ext.length + 1))
		: name

	let timestampFromName = null
	let hasTimePrecision = false

	const fullMatch = DATETIME_COMPACT_RE.exec(stem)
	if (fullMatch) {
		const parsed = buildValidatedUtcTimestamp(
			Number(fullMatch[1]),
			Number(fullMatch[2]),
			Number(fullMatch[3]),
			Number(fullMatch[4]),
			Number(fullMatch[5]),
			Number(fullMatch[6])
		)
		if (parsed !== null) {
			timestampFromName = parsed
			hasTimePrecision = true
		}
	} else {
		const dateMatch = DATE_ONLY_RE.exec(stem)
		if (dateMatch) {
			const parsed = buildValidatedUtcTimestamp(
				Number(dateMatch[1]),
				Number(dateMatch[2]),
				Number(dateMatch[3]),
				12,
				0,
				0
			)
			if (parsed !== null) {
				timestampFromName = parsed
				hasTimePrecision = false
			}
		}
	}

	let burstPrefix = ''
	let sequenceNumber = null
	const seqMatch = SEQUENCE_STEM_RE.exec(stem)
	if (seqMatch && !fullMatch) {
		const candidateSeq = Number(seqMatch[2])
		if (Number.isInteger(candidateSeq) && candidateSeq >= 0) {
			burstPrefix = (seqMatch[1] || 'SEQ').toUpperCase()
			sequenceNumber = candidateSeq
		}
	} else if (fullMatch) {
		// Camera shots taken in sequence share prefix before date token (e.g. IMG_ / PXL_ / BURST)
		const prefixEnd = Math.max(0, fullMatch.index)
		const rawPrefix = stem.slice(0, prefixEnd).replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()
		burstPrefix = rawPrefix || 'CAM'
	}

	const isEdited = EDITED_FILENAME_RE.test(stem)
	const isSocialCopy = SOCIAL_FILENAME_RE.test(stem)
	const isBurstNamed = BURST_KEYWORD_RE.test(stem)

	return {
		timestampFromName,
		hasTimePrecision,
		burstPrefix,
		sequenceNumber,
		isEdited,
		isSocialCopy,
		isBurstNamed,
	}
}

/**
 * Normalize a raw timestamp value (Unix seconds, Unix ms, Date, or ISO string) into epoch ms.
 *
 * @param {*} raw - Candidate timestamp value.
 * @return {number|null} Epoch milliseconds or null.
 */
function normalizeEpochMs(raw) {
	if (raw === null || raw === undefined || raw === '') {
		return null
	}
	if (raw instanceof Date) {
		const ms = raw.getTime()
		return Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : null
	}
	if (typeof raw === 'number') {
		if (!Number.isFinite(raw) || raw <= 0) {
			return null
		}
		return raw < 1e11 ? Math.floor(raw * 1000) : Math.floor(raw)
	}
	if (typeof raw === 'string') {
		const trimmed = raw.trim()
		if (!trimmed) {
			return null
		}
		if (/^\d+(\.\d+)?$/.test(trimmed)) {
			const num = Number(trimmed)
			if (!Number.isFinite(num) || num <= 0) {
				return null
			}
			return num < 1e11 ? Math.floor(num * 1000) : Math.floor(num)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
	}
	return null
}

/**
 * Extract the best capture/modification timestamp for a media file entry.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {{ timestampMs: number|null, source: 'filename'|'exif'|'mtime'|'none' }} Timestamp info.
 */
export function extractMediaFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return { timestampMs: null, source: 'none' }
	}

	for (const field of ['dateTaken', 'exifDate', 'capturedAt']) {
		const exifMs = normalizeEpochMs(file[field])
		if (exifMs !== null) {
			return { timestampMs: exifMs, source: 'exif' }
		}
	}

	const { fileName } = parseFilePathParts(file.path)
	const meta = parseMediaFilenameMeta(fileName)
	if (meta.timestampFromName !== null && meta.hasTimePrecision) {
		return { timestampMs: meta.timestampFromName, source: 'filename' }
	}

	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const mtimeMs = normalizeEpochMs(file[field])
		if (mtimeMs !== null) {
			return { timestampMs: mtimeMs, source: 'mtime' }
		}
	}

	if (meta.timestampFromName !== null) {
		return { timestampMs: meta.timestampFromName, source: 'filename' }
	}

	return { timestampMs: null, source: 'none' }
}

/**
 * Format an epoch ms timestamp into an ISO-style UTC date bucket (YYYY-MM-DD) or 'undated'.
 *
 * @param {number|null|undefined} timestampMs - Epoch milliseconds.
 * @return {string} Date bucket string.
 */
export function formatUtcDateBucket(timestampMs) {
	if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
		return 'undated'
	}
	const date = new Date(timestampMs)
	const year = date.getUTCFullYear()
	const month = String(date.getUTCMonth() + 1).padStart(2, '0')
	const day = String(date.getUTCDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

/**
 * Format an epoch ms timestamp into UTC HH:MM:SS.
 *
 * @param {number|null|undefined} timestampMs - Epoch milliseconds.
 * @return {string} Formatted time string or empty string.
 */
export function formatTimeOfDay(timestampMs) {
	if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
		return ''
	}
	const date = new Date(timestampMs)
	const hh = String(date.getUTCHours()).padStart(2, '0')
	const mm = String(date.getUTCMinutes()).padStart(2, '0')
	const ss = String(date.getUTCSeconds()).padStart(2, '0')
	return `${hh}:${mm}:${ss}`
}

/**
 * Format a duration span between two timestamps cleanly.
 *
 * @param {number|null|undefined} startMs - Start epoch ms.
 * @param {number|null|undefined} endMs - End epoch ms.
 * @return {string} Formatted span label.
 */
export function formatDurationSpan(startMs, endMs) {
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || endMs <= 0) {
		return 'Undated'
	}
	const deltaSec = Math.max(0, Math.round((endMs - startMs) / 1000))
	if (deltaSec === 0) {
		return 'Single instant'
	}
	if (deltaSec < 60) {
		return `${deltaSec}s`
	}
	const mins = Math.floor(deltaSec / 60)
	const secs = deltaSec % 60
	if (mins < 60) {
		return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
	}
	const hours = Math.floor(mins / 60)
	const remMins = mins % 60
	return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`
}

/**
 * Extract pixel count when width & height metadata are available on a file object.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {number} Pixel count (0 when unknown).
 */
function getFilePixelCount(file) {
	if (!file || typeof file !== 'object') {
		return 0
	}
	const width = Number(file.width || (file.dimensions && file.dimensions.width))
	const height = Number(file.height || (file.dimensions && file.dimensions.height))
	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		return Math.round(width * height)
	}
	return 0
}

/**
 * Compare two numeric/string candidate values deterministically.
 *
 * @param {object} a - First file candidate descriptor.
 * @param {object} b - Second file candidate descriptor.
 * @param {'sharpest'|'oldest'|'newest'|'shortest_path'} strategy - Keep strategy.
 * @return {number} Comparator result (<0 means a wins over b).
 */
function compareMasterCandidates(a, b, strategy) {
	// Protected origin folders always win unconditionally
	if (a.isProtected !== b.isProtected) {
		return a.isProtected ? -1 : 1
	}

	if (strategy === 'sharpest') {
		if (a.pixels !== b.pixels) {
			return b.pixels - a.pixels
		}
		if (a.isRaw !== b.isRaw) {
			return a.isRaw ? -1 : 1
		}
		if (a.isSocialCopy !== b.isSocialCopy) {
			return a.isSocialCopy ? 1 : -1
		}
		if (a.isEdited !== b.isEdited) {
			return a.isEdited ? 1 : -1
		}
		if (a.size !== b.size) {
			return b.size - a.size
		}
		if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
			return a.timestampMs - b.timestampMs
		}
		if (a.pathLen !== b.pathLen) {
			return a.pathLen - b.pathLen
		}
		return a.path.localeCompare(b.path)
	}

	if (strategy === 'oldest') {
		if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
			return a.timestampMs - b.timestampMs
		}
		if (a.timestampMs !== null && b.timestampMs === null) {
			return -1
		}
		if (a.timestampMs === null && b.timestampMs !== null) {
			return 1
		}
		if (a.size !== b.size) {
			return b.size - a.size
		}
		if (a.pathLen !== b.pathLen) {
			return a.pathLen - b.pathLen
		}
		return a.path.localeCompare(b.path)
	}

	if (strategy === 'newest') {
		if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
			return b.timestampMs - a.timestampMs
		}
		if (a.timestampMs !== null && b.timestampMs === null) {
			return -1
		}
		if (a.timestampMs === null && b.timestampMs !== null) {
			return 1
		}
		if (a.size !== b.size) {
			return b.size - a.size
		}
		if (a.pathLen !== b.pathLen) {
			return a.pathLen - b.pathLen
		}
		return a.path.localeCompare(b.path)
	}

	// shortest_path
	if (a.pathLen !== b.pathLen) {
		return a.pathLen - b.pathLen
	}
	if (a.size !== b.size) {
		return b.size - a.size
	}
	if (a.timestampMs !== null && b.timestampMs !== null && a.timestampMs !== b.timestampMs) {
		return a.timestampMs - b.timestampMs
	}
	return a.path.localeCompare(b.path)
}

/**
 * Determine the kept master copy and safe deletion candidates for one duplicate group.
 *
 * @param {Array<object>} files - Files belonging to the duplicate group.
 * @param {'sharpest'|'oldest'|'newest'|'shortest_path'} [strategy='sharpest'] - Master keep rule.
 * @param {string|null} [manualKeepKey=null] - Optional manual override key for the kept file.
 * @return {{
 *   winnerFile: object|null,
 *   winnerKey: string|null,
 *   winnerReason: string,
 *   deleteCandidates: Array<object>,
 *   protectedCount: number,
 *   protectedOnly: boolean
 * }} Selection result.
 */
export function pickBurstGroupWinner(files, strategy = 'sharpest', manualKeepKey = null) {
	const validFiles = Array.isArray(files) ? files.filter(f => f && typeof f === 'object') : []
	if (validFiles.length === 0) {
		return {
			winnerFile: null,
			winnerKey: null,
			winnerReason: 'none',
			deleteCandidates: [],
			protectedCount: 0,
			protectedOnly: false,
		}
	}

	const normalizedStrategy = BURST_KEEP_STRATEGIES.includes(strategy) ? strategy : 'sharpest'
	const candidates = validFiles.map(file => {
		const { normalizedPath, fileName } = parseFilePathParts(file.path)
		const meta = parseMediaFilenameMeta(fileName)
		const ts = extractMediaFileTimestamp(file)
		const kind = classifyMediaFileKind(file)
		const rawSize = Number(file.size)
		const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0
		return {
			file,
			key: resolveMediaFileKey(file),
			path: normalizedPath,
			pathLen: normalizedPath.length,
			isProtected: Boolean(file.isInOriginFolder),
			pixels: getFilePixelCount(file),
			isRaw: kind === 'raw',
			isEdited: meta.isEdited,
			isSocialCopy: meta.isSocialCopy,
			size,
			timestampMs: ts.timestampMs,
		}
	})

	const protectedCount = candidates.filter(c => c.isProtected).length
	const protectedOnly = protectedCount === candidates.length

	let winner = null
	let winnerReason = 'shortest_path'

	if (manualKeepKey) {
		const manualMatch = candidates.find(c => c.key === manualKeepKey)
		if (manualMatch) {
			winner = manualMatch
			winnerReason = manualMatch.isProtected ? 'protected_origin' : 'manual_keep'
		}
	}

	if (!winner) {
		const sorted = [...candidates].sort((a, b) => compareMasterCandidates(a, b, normalizedStrategy))
		winner = sorted[0]
		if (winner.isProtected) {
			winnerReason = 'protected_origin'
		} else if (normalizedStrategy === 'sharpest') {
			const hasPixelAdvantage = sorted.some(c => c !== winner && c.pixels < winner.pixels)
			if (hasPixelAdvantage || winner.isRaw) {
				winnerReason = 'highest_resolution'
			} else {
				winnerReason = 'original_quality'
			}
		} else if (normalizedStrategy === 'oldest') {
			winnerReason = 'oldest_capture'
		} else if (normalizedStrategy === 'newest') {
			winnerReason = 'newest_edit'
		} else {
			winnerReason = 'shortest_path'
		}
	}

	const deleteCandidates = validFiles.filter(file => {
		if (file.isInOriginFolder) {
			return false
		}
		const key = resolveMediaFileKey(file)
		if (winner && key !== null && key === winner.key) {
			return false
		}
		return file !== (winner && winner.file)
	})

	// Never allow deleting all copies in a group
	if (deleteCandidates.length >= validFiles.length && deleteCandidates.length > 0) {
		deleteCandidates.pop()
	}

	return {
		winnerFile: winner ? winner.file : null,
		winnerKey: winner ? winner.key : null,
		winnerReason,
		deleteCandidates,
		protectedCount,
		protectedOnly,
	}
}

/**
 * Determine whether two adjacent media groups belong in the same chronological burst cluster.
 *
 * @param {object} prevGroup - Previous media group entry.
 * @param {object} nextGroup - Next media group entry.
 * @param {number} windowMs - Burst window threshold in ms.
 * @return {boolean} True when both groups belong to the same burst cluster.
 */
function shouldClusterMediaGroups(prevGroup, nextGroup, windowMs) {
	if (!prevGroup || !nextGroup) {
		return false
	}
	if (prevGroup.dateBucket === 'undated' || nextGroup.dateBucket === 'undated') {
		return prevGroup.dateBucket === nextGroup.dateBucket && prevGroup.primaryFolder === nextGroup.primaryFolder
	}
	if (prevGroup.dateBucket !== nextGroup.dateBucket) {
		return false
	}

	const deltaMs = Math.abs((nextGroup.timestampMs || 0) - (prevGroup.timestampMs || 0))
	if (deltaMs <= windowMs) {
		return true
	}

	if (
		prevGroup.primaryFolder === nextGroup.primaryFolder
		&& prevGroup.burstPrefix
		&& prevGroup.burstPrefix === nextGroup.burstPrefix
		&& prevGroup.sequenceNumber !== null
		&& nextGroup.sequenceNumber !== null
		&& Math.abs(nextGroup.sequenceNumber - prevGroup.sequenceNumber) <= 5
	) {
		return true
	}

	return false
}

/**
 * Build a media group entry from a duplicate group if it qualifies under the active media filter.
 *
 * @param {object} duplicate - Raw duplicate group.
 * @param {'all'|'images'|'videos'|'variants'} mediaFilter - Media filter mode.
 * @param {'sharpest'|'oldest'|'newest'|'shortest_path'} keepStrategy - Keep rule.
 * @return {object|null} Normalized media group entry or null if non-media / filtered out.
 */
function toMediaGroupEntry(duplicate, mediaFilter, keepStrategy) {
	const info = computeGroupReclaimableInfo(duplicate)
	if (!info.valid) {
		return null
	}
	const files = Array.isArray(duplicate.files) ? duplicate.files.filter(Boolean) : []
	const mediaFiles = []
	let hasImage = false
	let hasVideo = false
	let hasRaw = false
	let hasEdited = false
	let hasSocial = false
	let hasBurstNamed = false

	for (const file of files) {
		const kind = classifyMediaFileKind(file)
		if (!kind) {
			continue
		}
		mediaFiles.push(file)
		if (kind === 'raw') {
			hasRaw = true
			hasImage = true
		} else if (kind === 'image') {
			hasImage = true
		} else if (kind === 'video') {
			hasVideo = true
		}
		const { fileName } = parseFilePathParts(file.path)
		const meta = parseMediaFilenameMeta(fileName)
		if (meta.isEdited) {
			hasEdited = true
		}
		if (meta.isSocialCopy) {
			hasSocial = true
		}
		if (meta.isBurstNamed) {
			hasBurstNamed = true
		}
	}

	if (mediaFiles.length === 0) {
		return null
	}

	const mediaKind = hasImage && hasVideo ? 'mixed' : (hasVideo ? 'video' : 'image')
	const isVariantGroup = hasRaw || hasEdited || hasSocial || hasBurstNamed || (hasImage && hasVideo)

	if (mediaFilter === 'images' && !hasImage) {
		return null
	}
	if (mediaFilter === 'videos' && !hasVideo) {
		return null
	}
	if (mediaFilter === 'variants' && !isVariantGroup) {
		return null
	}

	const winnerInfo = pickBurstGroupWinner(files, keepStrategy)
	const anchorFile = winnerInfo.winnerFile || mediaFiles[0] || files[0]
	const anchorParts = parseFilePathParts(anchorFile && anchorFile.path)
	const anchorMeta = parseMediaFilenameMeta(anchorParts.fileName)

	// Pick best timestamp across all files in group (prefer filename/EXIF, then earliest mtime)
	let bestTimestampMs = null
	let bestTimestampSource = 'none'
	for (const file of files) {
		const ts = extractMediaFileTimestamp(file)
		if (ts.timestampMs === null) {
			continue
		}
		if (bestTimestampMs === null) {
			bestTimestampMs = ts.timestampMs
			bestTimestampSource = ts.source
		} else if (ts.source !== 'mtime' && bestTimestampSource === 'mtime') {
			bestTimestampMs = ts.timestampMs
			bestTimestampSource = ts.source
		} else if (ts.source === bestTimestampSource && ts.timestampMs < bestTimestampMs) {
			bestTimestampMs = ts.timestampMs
		}
	}

	const variantTags = []
	if (hasRaw) {
		variantTags.push('raw')
	}
	if (hasEdited) {
		variantTags.push('edited')
	}
	if (hasSocial) {
		variantTags.push('social')
	}
	if (hasBurstNamed) {
		variantTags.push('burst')
	}
	if (hasImage && hasVideo) {
		variantTags.push('live_pair')
	}

	const dateBucket = formatUtcDateBucket(bestTimestampMs)
	const folderSet = Array.from(new Set(files.map(f => parseFilePathParts(f.path).folder)))

	return {
		rawGroup: duplicate,
		groupId: duplicate.id ?? duplicate.hash ?? anchorParts.normalizedPath,
		groupKey: String(duplicate.id ?? duplicate.hash ?? anchorParts.normalizedPath),
		hash: typeof duplicate.hash === 'string' ? duplicate.hash : '',
		acknowledged: Boolean(duplicate.acknowledged),
		mediaKind,
		isRaw: hasRaw,
		isVariantGroup,
		variantTags,
		displayName: anchorParts.fileName || (duplicate.hash ? duplicate.hash.slice(0, 8) : 'Media'),
		extension: anchorParts.extension ? `.${anchorParts.extension}` : '',
		primaryFolder: anchorParts.folder,
		folders: folderSet,
		timestampMs: bestTimestampMs,
		timestampSource: bestTimestampSource,
		dateBucket,
		timeLabel: formatTimeOfDay(bestTimestampMs),
		burstPrefix: anchorMeta.burstPrefix,
		sequenceNumber: anchorMeta.sequenceNumber,
		unitSize: info.unitSize,
		unitSizeFormatted: formatBytes(info.unitSize),
		reclaimableBytes: info.reclaimableBytes,
		reclaimableFormatted: formatBytes(info.reclaimableBytes),
		totalFiles: files.length,
		redundantCount: info.extraCopies,
		protectedCount: winnerInfo.protectedCount,
		protectedOnly: winnerInfo.protectedOnly,
		winnerFile: winnerInfo.winnerFile,
		winnerKey: winnerInfo.winnerKey,
		winnerReason: winnerInfo.winnerReason,
		deleteCandidates: winnerInfo.deleteCandidates,
		files,
		searchableText: [
			anchorParts.fileName,
			...files.map(f => parseFilePathParts(f.path).normalizedPath),
			dateBucket,
			...variantTags,
		].join(' ').toLowerCase(),
	}
}

/**
 * Normalize burst timeline query options safely.
 *
 * @param {object} [rawOptions] - Raw configuration options.
 * @return {object} Sanitized options object.
 */
export function normalizeBurstTimelineOptions(rawOptions = {}) {
	const input = rawOptions && typeof rawOptions === 'object' ? rawOptions : {}
	const windowMinutes = BURST_WINDOW_PRESETS.includes(Number(input.burstWindowMinutes))
		? Number(input.burstWindowMinutes)
		: DEFAULT_BURST_WINDOW_MINUTES
	const mediaFilter = MEDIA_FILTER_MODES.includes(input.mediaFilter) ? input.mediaFilter : 'all'
	const keepStrategy = BURST_KEEP_STRATEGIES.includes(input.keepStrategy) ? input.keepStrategy : 'sharpest'
	const sortBy = BURST_SORT_MODES.includes(input.sortBy) ? input.sortBy : 'newest_first'
	const includeAcknowledged = Boolean(input.includeAcknowledged)
	const onlyMultiGroupBursts = Boolean(input.onlyMultiGroupBursts)
	const searchQuery = typeof input.searchQuery === 'string' ? input.searchQuery.trim().toLowerCase() : ''

	return {
		burstWindowMinutes: windowMinutes,
		mediaFilter,
		keepStrategy,
		sortBy,
		includeAcknowledged,
		onlyMultiGroupBursts,
		searchQuery,
	}
}

/**
 * Build chronological photo & media burst clusters organized by shoot day.
 *
 * @param {Array<object>} duplicates - Duplicate groups in current scope.
 * @param {object} [rawOptions] - Clustering, filtering, and keep-strategy options.
 * @return {{
 *   options: object,
 *   summary: object,
 *   scopeSummary: object,
 *   clusters: Array<object>,
 *   days: Array<object>
 * }} Complete timeline cluster report.
 */
export function buildPhotoBurstTimeline(duplicates, rawOptions = {}) {
	const options = normalizeBurstTimelineOptions(rawOptions)
	const inputGroups = Array.isArray(duplicates) ? duplicates : []

	let skippedAcknowledgedCount = 0
	let skippedNonMediaCount = 0
	const entries = []

	for (const group of inputGroups) {
		if (!group || typeof group !== 'object') {
			continue
		}
		if (!options.includeAcknowledged && group.acknowledged) {
			skippedAcknowledgedCount += 1
			continue
		}
		const entry = toMediaGroupEntry(group, options.mediaFilter, options.keepStrategy)
		if (!entry) {
			skippedNonMediaCount += 1
			continue
		}
		entries.push(entry)
	}

	// Sort chronologically ascending before grouping into bursts
	const chronological = [...entries].sort((a, b) => {
		if (a.dateBucket === 'undated' && b.dateBucket !== 'undated') {
			return 1
		}
		if (a.dateBucket !== 'undated' && b.dateBucket === 'undated') {
			return -1
		}
		if ((a.timestampMs || 0) !== (b.timestampMs || 0)) {
			return (a.timestampMs || 0) - (b.timestampMs || 0)
		}
		if (a.primaryFolder !== b.primaryFolder) {
			return a.primaryFolder.localeCompare(b.primaryFolder)
		}
		return a.displayName.localeCompare(b.displayName)
	})

	const windowMs = options.burstWindowMinutes * 60 * 1000
	const rawClusters = []
	let currentBucket = null

	for (const entry of chronological) {
		if (
			currentBucket
			&& shouldClusterMediaGroups(currentBucket[currentBucket.length - 1], entry, windowMs)
		) {
			currentBucket.push(entry)
		} else {
			currentBucket = [entry]
			rawClusters.push(currentBucket)
		}
	}

	let clusters = rawClusters.map((groupEntries, index) => {
		const validTimes = groupEntries.map(g => g.timestampMs).filter(t => Number.isFinite(t) && t > 0)
		const startTimeMs = validTimes.length > 0 ? Math.min(...validTimes) : null
		const endTimeMs = validTimes.length > 0 ? Math.max(...validTimes) : null
		const dateBucket = groupEntries[0].dateBucket

		let totalFiles = 0
		let deletableCount = 0
		let protectedFiles = 0
		let protectedOnlyCount = 0
		let reclaimableBytes = 0
		let deletableBytes = 0

		const folderCounts = new Map()
		for (const g of groupEntries) {
			totalFiles += g.totalFiles
			reclaimableBytes += g.reclaimableBytes
			protectedFiles += g.protectedCount
			if (g.protectedOnly) {
				protectedOnlyCount += 1
			}
			deletableCount += g.deleteCandidates.length
			for (const candidate of g.deleteCandidates) {
				const s = Number(candidate && candidate.size)
				if (Number.isFinite(s) && s > 0) {
					deletableBytes += Math.floor(s)
				}
			}
			folderCounts.set(g.primaryFolder, (folderCounts.get(g.primaryFolder) || 0) + 1)
		}

		let primaryFolder = groupEntries[0].primaryFolder
		let maxFolderHits = 0
		for (const [folder, hits] of folderCounts.entries()) {
			if (hits > maxFolderHits) {
				maxFolderHits = hits
				primaryFolder = folder
			}
		}

		const isRapidBurst = groupEntries.length >= 2 && (
			(startTimeMs !== null && endTimeMs !== null && (endTimeMs - startTimeMs) <= 5 * 60 * 1000)
			|| groupEntries.some(g => g.variantTags.includes('burst'))
		)
		const clusterKind = groupEntries.length === 1
			? 'single_group'
			: (isRapidBurst ? 'rapid_burst' : 'shoot_session')

		const firstLabel = groupEntries[0].displayName
		const lastLabel = groupEntries[groupEntries.length - 1].displayName
		const title = groupEntries.length === 1
			? firstLabel
			: (firstLabel === lastLabel
				? `${firstLabel} (${groupEntries.length} groups)`
				: `${firstLabel} .. ${lastLabel}`)

		return {
			clusterId: `burst-${dateBucket}-${index + 1}`,
			title,
			dateBucket,
			primaryFolder,
			clusterKind,
			startTimeMs,
			endTimeMs,
			startTimeLabel: formatTimeOfDay(startTimeMs),
			endTimeLabel: formatTimeOfDay(endTimeMs),
			spanLabel: formatDurationSpan(startTimeMs, endTimeMs),
			groupCount: groupEntries.length,
			totalFiles,
			deletableCount,
			deletableBytes,
			deletableFormatted: formatBytes(deletableBytes),
			protectedFiles,
			protectedOnlyCount,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			groups: groupEntries,
		}
	})

	if (options.onlyMultiGroupBursts) {
		clusters = clusters.filter(cluster => cluster.groupCount >= 2)
	}

	if (options.searchQuery) {
		clusters = clusters.filter(cluster => {
			if (cluster.title.toLowerCase().includes(options.searchQuery)) {
				return true
			}
			if (cluster.primaryFolder.toLowerCase().includes(options.searchQuery)) {
				return true
			}
			if (cluster.dateBucket.toLowerCase().includes(options.searchQuery)) {
				return true
			}
			return cluster.groups.some(g => g.searchableText.includes(options.searchQuery))
		})
	}

	clusters.sort((a, b) => {
		if (options.sortBy === 'reclaimable_desc') {
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
		} else if (options.sortBy === 'groups_desc') {
			if (b.groupCount !== a.groupCount) {
				return b.groupCount - a.groupCount
			}
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
		} else if (options.sortBy === 'oldest_first') {
			if (a.dateBucket === 'undated' && b.dateBucket !== 'undated') {
				return 1
			}
			if (a.dateBucket !== 'undated' && b.dateBucket === 'undated') {
				return -1
			}
			if ((a.startTimeMs || 0) !== (b.startTimeMs || 0)) {
				return (a.startTimeMs || 0) - (b.startTimeMs || 0)
			}
		} else {
			// newest_first
			if (a.dateBucket === 'undated' && b.dateBucket !== 'undated') {
				return 1
			}
			if (a.dateBucket !== 'undated' && b.dateBucket === 'undated') {
				return -1
			}
			if ((b.startTimeMs || 0) !== (a.startTimeMs || 0)) {
				return (b.startTimeMs || 0) - (a.startTimeMs || 0)
			}
		}
		return a.clusterId.localeCompare(b.clusterId)
	})

	const dayMap = new Map()
	let totalMediaGroups = 0
	let rapidBurstCount = 0
	let totalFiles = 0
	let redundantFiles = 0
	let protectedFiles = 0
	let reclaimableBytes = 0
	let imagesCount = 0
	let videosCount = 0
	let rawCount = 0
	let variantsCount = 0

	for (const cluster of clusters) {
		if (cluster.clusterKind === 'rapid_burst') {
			rapidBurstCount += 1
		}
		totalMediaGroups += cluster.groupCount
		totalFiles += cluster.totalFiles
		protectedFiles += cluster.protectedFiles
		reclaimableBytes += cluster.reclaimableBytes

		for (const group of cluster.groups) {
			redundantFiles += group.redundantCount
			if (group.mediaKind === 'video') {
				videosCount += 1
			} else {
				imagesCount += 1
			}
			if (group.isRaw) {
				rawCount += 1
			}
			if (group.isVariantGroup) {
				variantsCount += 1
			}
		}

		const existingDay = dayMap.get(cluster.dateBucket)
		if (existingDay) {
			existingDay.clusters.push(cluster)
			existingDay.clusterCount += 1
			existingDay.groupCount += cluster.groupCount
			existingDay.reclaimableBytes += cluster.reclaimableBytes
			existingDay.reclaimableFormatted = formatBytes(existingDay.reclaimableBytes)
		} else {
			dayMap.set(cluster.dateBucket, {
				dateBucket: cluster.dateBucket,
				label: cluster.dateBucket === 'undated' ? 'Undated media' : cluster.dateBucket,
				clusterCount: 1,
				groupCount: cluster.groupCount,
				reclaimableBytes: cluster.reclaimableBytes,
				reclaimableFormatted: formatBytes(cluster.reclaimableBytes),
				clusters: [cluster],
			})
		}
	}

	const days = Array.from(dayMap.values())

	return {
		options,
		scopeSummary: {
			inputGroupCount: inputGroups.length,
			eligibleMediaGroupCount: entries.length,
			skippedAcknowledgedCount,
			skippedNonMediaCount,
		},
		summary: {
			totalGroups: totalMediaGroups,
			mediaGroupsCount: totalMediaGroups,
			clusterCount: clusters.length,
			rapidBurstCount,
			shootDayCount: days.length,
			totalFiles,
			redundantFiles,
			protectedFiles,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			mediaBreakdown: {
				images: imagesCount,
				videos: videosCount,
				raw: rawCount,
				variants: variantsCount,
			},
		},
		clusters,
		days,
	}
}

/**
 * Resolve effective deletion plan for a burst cluster taking manual keep/uncheck overrides into account.
 *
 * @param {object} cluster - Cluster entry from buildPhotoBurstTimeline.
 * @param {string} keepStrategy - Active keep strategy.
 * @param {object} [manualKeepByGroup={}] - Map of groupKey -> fileKey to keep.
 * @param {Set<string>|object} [uncheckedFileKeys=new Set()] - Keys unchecked from deletion.
 * @return {{
 *   selectedFiles: Array<object>,
 *   selectedCount: number,
 *   reclaimableBytes: number,
 *   reclaimableFormatted: string,
 *   groupResolutions: object
 * }} Cluster execution plan.
 */
export function resolveClusterDeletionPlan(
	cluster,
	keepStrategy = 'sharpest',
	manualKeepByGroup = {},
	uncheckedFileKeys = new Set()
) {
	const groups = cluster && Array.isArray(cluster.groups) ? cluster.groups : []
	const uncheckedSet = uncheckedFileKeys instanceof Set
		? uncheckedFileKeys
		: new Set(Object.keys(uncheckedFileKeys || {}).filter(k => uncheckedFileKeys[k]))

	const selectedFiles = []
	let reclaimableBytes = 0
	const groupResolutions = {}

	for (const group of groups) {
		const manualKey = manualKeepByGroup && manualKeepByGroup[group.groupKey]
			? manualKeepByGroup[group.groupKey]
			: null
		const winnerInfo = pickBurstGroupWinner(group.files, keepStrategy, manualKey)
		const targetedFiles = []

		for (const candidate of winnerInfo.deleteCandidates) {
			const fKey = resolveMediaFileKey(candidate)
			if (fKey && uncheckedSet.has(fKey)) {
				continue
			}
			targetedFiles.push(candidate)
			selectedFiles.push(candidate)
			const s = Number(candidate && candidate.size)
			if (Number.isFinite(s) && s > 0) {
				reclaimableBytes += Math.floor(s)
			}
		}

		groupResolutions[group.groupKey] = {
			winnerFile: winnerInfo.winnerFile,
			winnerKey: winnerInfo.winnerKey,
			winnerReason: winnerInfo.winnerReason,
			deleteCandidates: winnerInfo.deleteCandidates,
			targetedFiles,
			protectedOnly: winnerInfo.protectedOnly,
		}
	}

	return {
		selectedFiles,
		selectedCount: selectedFiles.length,
		reclaimableBytes,
		reclaimableFormatted: formatBytes(reclaimableBytes),
		groupResolutions,
	}
}

/**
 * Serialize the photo burst timeline and keep/delete actions into a JSON manifest.
 *
 * @param {object} timeline - Output of buildPhotoBurstTimeline.
 * @param {object} [manualKeepByGroup={}] - Map of groupKey -> kept file key.
 * @param {Set<string>|object} [uncheckedFileKeys=new Set()] - File keys unchecked from deletion.
 * @param {string} [exportedAt] - Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON string.
 */
export function buildBurstManifestJson(
	timeline,
	manualKeepByGroup = {},
	uncheckedFileKeys = new Set(),
	exportedAt
) {
	const safeTimeline = timeline && typeof timeline === 'object'
		? timeline
		: buildPhotoBurstTimeline([])
	const strategy = (safeTimeline.options && safeTimeline.options.keepStrategy) || 'sharpest'
	const timestamp = typeof exportedAt === 'string' && exportedAt.trim()
		? exportedAt.trim()
		: new Date().toISOString()

	const clusters = (safeTimeline.clusters || []).map(cluster => {
		const plan = resolveClusterDeletionPlan(cluster, strategy, manualKeepByGroup, uncheckedFileKeys)
		return {
			clusterId: cluster.clusterId,
			dateBucket: cluster.dateBucket,
			clusterKind: cluster.clusterKind,
			primaryFolder: cluster.primaryFolder,
			spanLabel: cluster.spanLabel,
			groupCount: cluster.groupCount,
			reclaimableBytes: cluster.reclaimableBytes,
			plannedDeleteCount: plan.selectedCount,
			plannedDeleteBytes: plan.reclaimableBytes,
			groups: cluster.groups.map(group => {
				const res = plan.groupResolutions[group.groupKey] || {}
				return {
					groupId: group.groupId,
					hash: group.hash,
					displayName: group.displayName,
					mediaKind: group.mediaKind,
					timestampMs: group.timestampMs,
					winnerPath: res.winnerFile ? res.winnerFile.path : '',
					winnerReason: res.winnerReason || group.winnerReason,
					deletePaths: (res.targetedFiles || []).map(f => f.path || ''),
				}
			}),
		}
	})

	return JSON.stringify({
		schema: PHOTO_BURST_MANIFEST_SCHEMA,
		exportedAt: timestamp,
		options: safeTimeline.options,
		summary: safeTimeline.summary,
		clusters,
	}, null, 2)
}

/**
 * Serialize the photo burst timeline into a CWE-1236-safe CSV report.
 *
 * @param {object} timeline - Output of buildPhotoBurstTimeline.
 * @param {object} [manualKeepByGroup={}] - Map of groupKey -> kept file key.
 * @param {Set<string>|object} [uncheckedFileKeys=new Set()] - File keys unchecked from deletion.
 * @return {string} UTF-8 CSV content.
 */
export function buildBurstManifestCsv(
	timeline,
	manualKeepByGroup = {},
	uncheckedFileKeys = new Set()
) {
	const safeTimeline = timeline && typeof timeline === 'object'
		? timeline
		: buildPhotoBurstTimeline([])
	const strategy = (safeTimeline.options && safeTimeline.options.keepStrategy) || 'sharpest'

	const headers = [
		'Cluster ID',
		'Date Bucket',
		'Cluster Kind',
		'Primary Folder',
		'Group Name',
		'Media Kind',
		'Keep Strategy Winner',
		'Winner Reason',
		'Planned Delete Count',
		'Reclaimable Bytes',
		'Delete Paths',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]

	for (const cluster of safeTimeline.clusters || []) {
		const plan = resolveClusterDeletionPlan(cluster, strategy, manualKeepByGroup, uncheckedFileKeys)
		for (const group of cluster.groups) {
			const res = plan.groupResolutions[group.groupKey] || {}
			const deletePaths = (res.targetedFiles || []).map(f => f.path || '').join(' | ')
			rows.push([
				cluster.clusterId,
				cluster.dateBucket,
				cluster.clusterKind,
				cluster.primaryFolder,
				group.displayName,
				group.mediaKind,
				res.winnerFile ? (res.winnerFile.path || '') : '',
				res.winnerReason || group.winnerReason,
				String((res.targetedFiles || []).length),
				String(group.reclaimableBytes),
				deletePaths,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\n')
}
