/**
 * Pure file-type classification and reclaimable-space summary helpers
 * for fast duplicate triage.
 */

export const LARGE_FILE_THRESHOLD_BYTES = 10 * 1024 * 1024

export const DUPLICATE_FILTER_CATEGORIES = Object.freeze([
	'all',
	'images',
	'videos',
	'audio',
	'documents',
	'archives',
	'large',
])

const IMAGE_EXTENSIONS = new Set([
	'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg',
	'heic', 'heif', 'avif', 'tif', 'tiff', 'raw', 'cr2',
	'nef', 'arw', 'dng', 'ico',
])

const VIDEO_EXTENSIONS = new Set([
	'mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv',
	'm4v', 'mpg', 'mpeg', '3gp', 'ogv', 'mts', 'm2ts',
])

const AUDIO_EXTENSIONS = new Set([
	'mp3', 'wav', 'flac', 'aac', 'ogg', 'oga', 'm4a',
	'wma', 'opus', 'aiff', 'alac', 'mid', 'midi',
])

const ARCHIVE_EXTENSIONS = new Set([
	'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2',
	'tbz2', 'xz', 'txz', 'zst', 'iso', 'dmg', 'cab',
	'lz', 'lzma',
])

const DOCUMENT_EXTENSIONS = new Set([
	'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
	'odt', 'ods', 'odp', 'odg', 'txt', 'md', 'markdown',
	'rtf', 'csv', 'tsv', 'epub', 'tex', 'json', 'xml',
	'yaml', 'yml', 'html', 'htm', 'log', 'pages', 'numbers',
	'key',
])

const DOCUMENT_MIMES = new Set([
	'application/pdf',
	'application/msword',
	'application/vnd.ms-excel',
	'application/vnd.ms-powerpoint',
	'application/rtf',
	'application/epub+zip',
	'application/json',
	'application/xml',
	'application/csv',
	'application/x-tex',
])

const ARCHIVE_MIMES = new Set([
	'application/zip',
	'application/x-zip-compressed',
	'application/x-rar-compressed',
	'application/vnd.rar',
	'application/x-7z-compressed',
	'application/x-tar',
	'application/gzip',
	'application/x-gzip',
	'application/x-bzip2',
	'application/x-xz',
	'application/zstd',
	'application/x-iso9660-image',
	'application/x-apple-diskimage',
])

/**
 * Extract the lowercase file extension from a file path or filename.
 *
 * @param {string} filePath - File path or filename.
 * @return {string} Extension without leading dot, or empty string.
 */
export function extractFileExtension(filePath) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return ''
	}
	const cleanPath = filePath.split(/[?#]/)[0].trim()
	const slashIndex = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'))
	const fileName = slashIndex >= 0 ? cleanPath.slice(slashIndex + 1) : cleanPath
	const dotIndex = fileName.lastIndexOf('.')
	if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
		return ''
	}
	return fileName.slice(dotIndex + 1).toLowerCase()
}

/**
 * Classify a file entry into a high-level category using MIME type and extension.
 *
 * @param {object|null|undefined} file - File object containing mimetype and/or path/name.
 * @return {'images'|'videos'|'audio'|'documents'|'archives'|'other'} File category.
 */
export function classifyFileCategory(file) {
	if (!file || typeof file !== 'object') {
		return 'other'
	}

	const rawMime = typeof file.mimetype === 'string' ? file.mimetype.split(';')[0].trim().toLowerCase() : ''
	if (rawMime && rawMime !== 'application/octet-stream' && rawMime !== 'binary/octet-stream') {
		if (rawMime.startsWith('image/')) {
			return 'images'
		}
		if (rawMime.startsWith('video/')) {
			return 'videos'
		}
		if (rawMime.startsWith('audio/')) {
			return 'audio'
		}
		if (
			rawMime.startsWith('text/')
			|| DOCUMENT_MIMES.has(rawMime)
			|| rawMime.startsWith('application/vnd.openxmlformats-officedocument.')
			|| rawMime.startsWith('application/vnd.oasis.opendocument.')
		) {
			return 'documents'
		}
		if (ARCHIVE_MIMES.has(rawMime)) {
			return 'archives'
		}
	}

	const ext = extractFileExtension(file.path || file.name || '')
	if (!ext) {
		return 'other'
	}
	if (IMAGE_EXTENSIONS.has(ext)) {
		return 'images'
	}
	if (VIDEO_EXTENSIONS.has(ext)) {
		return 'videos'
	}
	if (AUDIO_EXTENSIONS.has(ext)) {
		return 'audio'
	}
	if (ARCHIVE_EXTENSIONS.has(ext)) {
		return 'archives'
	}
	if (DOCUMENT_EXTENSIONS.has(ext)) {
		return 'documents'
	}
	return 'other'
}

/**
 * Determine whether a file exceeds the large-file threshold (> 10 MB by default).
 *
 * @param {object|null|undefined} file - File entry with a numeric size.
 * @param {number} [thresholdBytes=LARGE_FILE_THRESHOLD_BYTES] - Size threshold in bytes.
 * @return {boolean} True when file size is strictly greater than thresholdBytes.
 */
export function isLargeFile(file, thresholdBytes = LARGE_FILE_THRESHOLD_BYTES) {
	if (!file || typeof file !== 'object') {
		return false
	}
	const size = Number(file.size)
	return Number.isFinite(size) && size > thresholdBytes
}

/**
 * Check whether a duplicate group matches the selected quick filter category.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @param {string} category - Selected category ('all', 'images', 'videos', 'audio', 'documents', 'archives', 'large').
 * @return {boolean} True if the duplicate group matches the category.
 */
export function matchesDuplicateCategory(duplicate, category) {
	if (!duplicate || typeof duplicate !== 'object') {
		return false
	}
	if (!category || category === 'all' || !DUPLICATE_FILTER_CATEGORIES.includes(category)) {
		return true
	}
	const files = Array.isArray(duplicate.files) ? duplicate.files : []
	if (files.length === 0) {
		return false
	}
	if (category === 'large') {
		return files.some(file => isLargeFile(file))
	}
	return files.some(file => classifyFileCategory(file) === category)
}

/**
 * Return a filtered array of duplicate groups matching the requested category.
 *
 * @param {Array} duplicates - Array of duplicate group objects.
 * @param {string} [category='all'] - Target category identifier.
 * @return {Array} Filtered duplicate groups.
 */
export function filterDuplicatesByCategory(duplicates, category = 'all') {
	if (!Array.isArray(duplicates)) {
		return []
	}
	if (!category || category === 'all' || !DUPLICATE_FILTER_CATEGORIES.includes(category)) {
		return duplicates.filter(Boolean)
	}
	return duplicates.filter(duplicate => matchesDuplicateCategory(duplicate, category))
}

/**
 * Format a byte count into a concise readable string using B, KB, MB, or GB.
 *
 * @param {number} bytes - Byte count to format.
 * @return {string} Formatted byte size (e.g. '0 B', '512 B', '1.5 MB', '2 GB').
 */
export function formatBytes(bytes) {
	const units = ['B', 'KB', 'MB', 'GB']
	const numericBytes = Number(bytes)
	if (!Number.isFinite(numericBytes) || numericBytes <= 0) {
		return '0 B'
	}
	if (numericBytes < 1024) {
		return `${Math.round(numericBytes)} B`
	}

	let unitIndex = Math.min(units.length - 1, Math.floor(Math.log(numericBytes) / Math.log(1024)))
	let scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	if (scaled >= 1024 && unitIndex < units.length - 1) {
		unitIndex += 1
		scaled = Math.round((numericBytes / Math.pow(1024, unitIndex)) * 10) / 10
	}
	return `${scaled} ${units[unitIndex]}`
}

/**
 * Compute reclaimable storage summary across duplicate groups.
 * Sums (count - 1) * size for every valid group (count > 1).
 *
 * @param {Array} duplicates - Array of duplicate group objects.
 * @return {{ bytes: number, formatted: string, groupCount: number, redundantCopies: number }} Summary metrics.
 */
export function computeReclaimableSummary(duplicates) {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return {
			bytes: 0,
			formatted: '0 B',
			groupCount: 0,
			redundantCopies: 0,
		}
	}

	let totalBytes = 0
	let groupCount = 0
	let redundantCopies = 0

	for (const duplicate of duplicates) {
		if (!duplicate || typeof duplicate !== 'object') {
			continue
		}

		let count = 0
		let unitSize = 0

		if (Array.isArray(duplicate.files)) {
			count = duplicate.files.length
			if (count <= 1) {
				continue
			}
			for (const file of duplicate.files) {
				const size = Number(file && file.size)
				if (Number.isFinite(size) && size > 0) {
					unitSize = size
					break
				}
			}
		} else if (duplicate.count !== undefined) {
			const rawCount = Number(duplicate.count)
			if (!Number.isFinite(rawCount) || rawCount <= 1) {
				continue
			}
			count = Math.floor(rawCount)
			const rawSize = Number(duplicate.size)
			unitSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0
		} else {
			continue
		}

		const extraCopies = count - 1
		groupCount += 1
		redundantCopies += extraCopies
		totalBytes += extraCopies * unitSize
	}

	return {
		bytes: totalBytes,
		formatted: formatBytes(totalBytes),
		groupCount,
		redundantCopies,
	}
}
