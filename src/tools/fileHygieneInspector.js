/**
 * Pure file hygiene, bad-extension, zero-byte, sync-conflict, and magic-byte
 * verification helpers inspired by Czkawka, dupeGuru, and Nextcloud Files.
 * Zero DOM dependencies, zero network side effects, and CWE-1236-safe CSV export.
 */

import { formatBytes } from './duplicateStats'
import { getFolderLabel } from './duplicateMetadataBadges'
import { getFileSelectionKey } from './duplicateSelectionAndExport'

export const HYGIENE_CATEGORIES = Object.freeze([
	'all',
	'bad-extension',
	'zero-byte',
	'sync-conflict',
	'mixed-extension-group',
])

export const HYGIENE_REPORT_SCHEMA = 'duplicatefinder.hygiene.v1'

const MICRO_STUB_MAX_BYTES = 32

const GENERIC_MIMES = new Set([
	'',
	'application/octet-stream',
	'binary/octet-stream',
	'httpd/unix-directory',
])

export const MIME_EXTENSION_MAP = Object.freeze({
	'image/jpeg': ['jpg', 'jpeg', 'jpe', 'jfif'],
	'image/png': ['png'],
	'image/gif': ['gif'],
	'image/webp': ['webp'],
	'image/heic': ['heic', 'heif'],
	'image/heif': ['heif', 'heic'],
	'image/svg+xml': ['svg'],
	'image/tiff': ['tif', 'tiff'],
	'image/bmp': ['bmp'],
	'image/x-ms-bmp': ['bmp'],
	'image/avif': ['avif'],
	'application/pdf': ['pdf'],
	'application/zip': ['zip'],
	'application/x-zip-compressed': ['zip'],
	'application/gzip': ['gz', 'tgz'],
	'application/x-gzip': ['gz', 'tgz'],
	'application/x-tar': ['tar'],
	'application/x-7z-compressed': ['7z'],
	'application/x-rar-compressed': ['rar'],
	'application/vnd.rar': ['rar'],
	'video/mp4': ['mp4', 'm4v'],
	'video/quicktime': ['mov', 'qt'],
	'video/x-matroska': ['mkv'],
	'video/webm': ['webm'],
	'video/x-msvideo': ['avi'],
	'audio/mpeg': ['mp3'],
	'audio/mp4': ['m4a', 'mp4'],
	'audio/flac': ['flac'],
	'audio/x-flac': ['flac'],
	'audio/ogg': ['ogg', 'oga'],
	'audio/wav': ['wav'],
	'audio/x-wav': ['wav'],
	'text/plain': ['txt', 'log', 'conf', 'ini', 'cfg', 'env'],
	'text/markdown': ['md', 'markdown'],
	'text/csv': ['csv'],
	'text/html': ['html', 'htm'],
	'application/json': ['json'],
	'application/xml': ['xml'],
	'text/xml': ['xml'],
	'application/msword': ['doc'],
	'application/vnd.ms-excel': ['xls'],
	'application/vnd.ms-powerpoint': ['ppt'],
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
	'application/vnd.oasis.opendocument.text': ['odt'],
	'application/vnd.oasis.opendocument.spreadsheet': ['ods'],
	'application/vnd.oasis.opendocument.presentation': ['odp'],
})

const SEVERITY_ORDER = Object.freeze({
	warning: 0,
	caution: 1,
	info: 2,
})

/**
 * Extract the filename segment from a file path.
 *
 * @param {string|null|undefined} filePath - File path.
 * @return {string} Basename or empty string.
 */
export function extractFilename(filePath) {
	if (typeof filePath !== 'string') {
		return ''
	}
	const trimmed = filePath.trim()
	if (!trimmed) {
		return ''
	}
	const normalized = trimmed.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Extract lowercase filename extension without leading dot.
 * Returns empty string for dotfiles without secondary extension (e.g. '.DS_Store').
 *
 * @param {string|null|undefined} filePath - File path or filename.
 * @return {string} Lowercase extension or empty string.
 */
export function extractExtension(filePath) {
	const name = extractFilename(filePath)
	if (!name) {
		return ''
	}
	const dotIdx = name.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === name.length - 1) {
		return ''
	}
	return name.slice(dotIdx + 1).toLowerCase()
}

/**
 * Normalize a declared MIME type string (stripping parameters like '; charset=utf-8').
 *
 * @param {string|null|undefined} mimetype - Raw MIME string.
 * @return {string} Lowercase normalized MIME string.
 */
export function normalizeMimeType(mimetype) {
	if (typeof mimetype !== 'string') {
		return ''
	}
	const base = mimetype.split(';')[0].trim().toLowerCase()
	return base
}

/**
 * Detect Nextcloud sync conflict copies, temp/staging leftovers, and OS clutter filenames.
 *
 * @param {string|null|undefined} filePath - File path.
 * @return {{ matched: boolean, subType: string, label: string }} Detection result.
 */
export function detectSyncConflictOrJunk(filePath) {
	const name = extractFilename(filePath)
	if (!name) {
		return { matched: false, subType: '', label: '' }
	}
	const lower = name.toLowerCase()

	if (/\(conflicted copy[^)]*\)/i.test(name) || /\bconflicted copy\b/i.test(name)) {
		return {
			matched: true,
			subType: 'nextcloud-conflict',
			label: 'Nextcloud sync conflict copy',
		}
	}

	if (lower.startsWith('._') || lower === '.ds_store' || lower === 'thumbs.db' || lower === 'desktop.ini') {
		return {
			matched: true,
			subType: 'os-junk',
			label: 'OS metadata or AppleDouble clutter',
		}
	}

	if (lower.startsWith('~lock.') || lower.startsWith('~$')) {
		return {
			matched: true,
			subType: 'lock-temp',
			label: 'Office lock or temporary file',
		}
	}

	const ext = extractExtension(name)
	if (['part', 'crdownload', 'download', 'tmp', 'temp', 'bak', 'old', 'orig'].includes(ext)) {
		return {
			matched: true,
			subType: 'staging-backup',
			label: `Staging or backup extension (.${ext})`,
		}
	}

	if (/^copy of /i.test(name) || / - copy(\.[^.]+)?$/i.test(name) || / \(\d+\)(\.[^.]+)?$/.test(name)) {
		return {
			matched: true,
			subType: 'numbered-copy',
			label: 'Duplicate copy suffix in filename',
		}
	}

	return { matched: false, subType: '', label: '' }
}

/**
 * Compare a file's extension against its declared MIME type (Czkawka Bad Extensions logic).
 *
 * @param {string|null|undefined} filePath - File path.
 * @param {string|null|undefined} mimetype - Declared MIME type.
 * @return {{
 *   mismatch: boolean,
 *   reason: string|null,
 *   currentExtension: string,
 *   expectedExtensions: string[],
 *   suggestedExtension: string,
 *   normalizedMime: string
 * }} Mismatch evaluation.
 */
export function detectBadExtension(filePath, mimetype) {
	const currentExtension = extractExtension(filePath)
	const normalizedMime = normalizeMimeType(mimetype)

	if (!normalizedMime || GENERIC_MIMES.has(normalizedMime)) {
		return {
			mismatch: false,
			reason: null,
			currentExtension,
			expectedExtensions: [],
			suggestedExtension: '',
			normalizedMime,
		}
	}

	const expectedExtensions = MIME_EXTENSION_MAP[normalizedMime] || []
	if (expectedExtensions.length === 0) {
		return {
			mismatch: false,
			reason: null,
			currentExtension,
			expectedExtensions: [],
			suggestedExtension: '',
			normalizedMime,
		}
	}

	if (!currentExtension) {
		return {
			mismatch: true,
			reason: 'missing-extension',
			currentExtension: '',
			expectedExtensions: [...expectedExtensions],
			suggestedExtension: expectedExtensions[0],
			normalizedMime,
		}
	}

	if (!expectedExtensions.includes(currentExtension)) {
		return {
			mismatch: true,
			reason: 'extension-mismatch',
			currentExtension,
			expectedExtensions: [...expectedExtensions],
			suggestedExtension: expectedExtensions[0],
			normalizedMime,
		}
	}

	return {
		mismatch: false,
		reason: null,
		currentExtension,
		expectedExtensions: [...expectedExtensions],
		suggestedExtension: expectedExtensions[0],
		normalizedMime,
	}
}

/**
 * Check whether bytes start with an ASCII token at a given offset.
 *
 * @param {Uint8Array} bytes - Binary header slice.
 * @param {number} offset - Byte offset.
 * @param {string} ascii - ASCII string to match.
 * @return {boolean} True when matched.
 */
function matchesAsciiAt(bytes, offset, ascii) {
	if (bytes.length < offset + ascii.length) {
		return false
	}
	for (let i = 0; i < ascii.length; i++) {
		if (bytes[offset + i] !== ascii.charCodeAt(i)) {
			return false
		}
	}
	return true
}

/**
 * Check whether bytes start with a numeric byte prefix.
 *
 * @param {Uint8Array} bytes - Binary header slice.
 * @param {number[]} prefix - Expected byte values.
 * @return {boolean} True when matched.
 */
function matchesBytesPrefix(bytes, prefix) {
	if (bytes.length < prefix.length) {
		return false
	}
	for (let i = 0; i < prefix.length; i++) {
		if (bytes[i] !== prefix[i]) {
			return false
		}
	}
	return true
}

/**
 * Inspect initial file header bytes (magic numbers) and compare with extension and MIME.
 *
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} rawBytes - Leading bytes of file.
 * @param {string|null|undefined} declaredMime - Declared MIME type.
 * @param {string|null|undefined} filePath - File path.
 * @return {{
 *   status: 'empty'|'verified'|'header-mismatch'|'unknown',
 *   detectedFormat: string,
 *   detectedMime: string,
 *   detectedExtensions: string[],
 *   detail: string
 * }} Header inspection result.
 */
export function inspectMagicBytes(rawBytes, declaredMime, filePath) {
	let bytes
	if (rawBytes instanceof Uint8Array) {
		bytes = rawBytes
	} else if (rawBytes instanceof ArrayBuffer) {
		bytes = new Uint8Array(rawBytes)
	} else if (Array.isArray(rawBytes)) {
		bytes = Uint8Array.from(rawBytes)
	} else {
		bytes = new Uint8Array(0)
	}

	if (bytes.length === 0) {
		return {
			status: 'empty',
			detectedFormat: 'Empty (0 B)',
			detectedMime: '',
			detectedExtensions: [],
			detail: 'File header is empty (0 bytes returned).',
		}
	}

	let detectedFormat = ''
	let detectedMime = ''
	let detectedExtensions = []

	if (matchesBytesPrefix(bytes, [0xFF, 0xD8, 0xFF])) {
		detectedFormat = 'JPEG'
		detectedMime = 'image/jpeg'
		detectedExtensions = ['jpg', 'jpeg', 'jpe', 'jfif']
	} else if (matchesBytesPrefix(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
		detectedFormat = 'PNG'
		detectedMime = 'image/png'
		detectedExtensions = ['png']
	} else if (matchesAsciiAt(bytes, 0, 'GIF87a') || matchesAsciiAt(bytes, 0, 'GIF89a')) {
		detectedFormat = 'GIF'
		detectedMime = 'image/gif'
		detectedExtensions = ['gif']
	} else if (matchesAsciiAt(bytes, 0, 'RIFF') && matchesAsciiAt(bytes, 8, 'WEBP')) {
		detectedFormat = 'WebP'
		detectedMime = 'image/webp'
		detectedExtensions = ['webp']
	} else if (matchesAsciiAt(bytes, 0, 'RIFF') && matchesAsciiAt(bytes, 8, 'WAVE')) {
		detectedFormat = 'WAV'
		detectedMime = 'audio/wav'
		detectedExtensions = ['wav']
	} else if (matchesAsciiAt(bytes, 0, '%PDF-')) {
		detectedFormat = 'PDF'
		detectedMime = 'application/pdf'
		detectedExtensions = ['pdf']
	} else if (matchesBytesPrefix(bytes, [0x50, 0x4B, 0x03, 0x04]) || matchesBytesPrefix(bytes, [0x50, 0x4B, 0x05, 0x06])) {
		detectedFormat = 'ZIP / OOXML'
		detectedMime = 'application/zip'
		detectedExtensions = ['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'jar']
	} else if (matchesBytesPrefix(bytes, [0x1F, 0x8B])) {
		detectedFormat = 'GZIP'
		detectedMime = 'application/gzip'
		detectedExtensions = ['gz', 'tgz']
	} else if (matchesAsciiAt(bytes, 4, 'ftyp')) {
		const brand = bytes.length >= 12
			? String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase()
			: ''
		if (brand === 'heic' || brand === 'heix' || brand === 'mif1') {
			detectedFormat = 'HEIC'
			detectedMime = 'image/heic'
			detectedExtensions = ['heic', 'heif']
		} else if (brand === 'qt  ') {
			detectedFormat = 'QuickTime MOV'
			detectedMime = 'video/quicktime'
			detectedExtensions = ['mov', 'qt']
		} else {
			detectedFormat = 'ISO BMFF (MP4/M4A)'
			detectedMime = 'video/mp4'
			detectedExtensions = ['mp4', 'm4v', 'm4a', 'mov']
		}
	} else if (matchesAsciiAt(bytes, 0, 'ID3') || (bytes.length >= 2 && bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0)) {
		detectedFormat = 'MP3'
		detectedMime = 'audio/mpeg'
		detectedExtensions = ['mp3']
	} else if (matchesAsciiAt(bytes, 0, 'fLaC')) {
		detectedFormat = 'FLAC'
		detectedMime = 'audio/flac'
		detectedExtensions = ['flac']
	} else if (matchesAsciiAt(bytes, 0, 'OggS')) {
		detectedFormat = 'OGG'
		detectedMime = 'audio/ogg'
		detectedExtensions = ['ogg', 'oga']
	} else if (matchesBytesPrefix(bytes, [0x42, 0x4D])) {
		detectedFormat = 'BMP'
		detectedMime = 'image/bmp'
		detectedExtensions = ['bmp']
	} else if (matchesBytesPrefix(bytes, [0x49, 0x49, 0x2A, 0x00]) || matchesBytesPrefix(bytes, [0x4D, 0x4D, 0x00, 0x2A])) {
		detectedFormat = 'TIFF'
		detectedMime = 'image/tiff'
		detectedExtensions = ['tif', 'tiff']
	}

	if (!detectedFormat) {
		return {
			status: 'unknown',
			detectedFormat: 'Unrecognized binary/text',
			detectedMime: '',
			detectedExtensions: [],
			detail: 'Magic signature not in known binary header table.',
		}
	}

	const ext = extractExtension(filePath)
	const normMime = normalizeMimeType(declaredMime)
	const extMatches = ext !== '' && detectedExtensions.includes(ext)
	const mimeMatches = !normMime || GENERIC_MIMES.has(normMime) || normMime === detectedMime
		|| (detectedFormat === 'ZIP / OOXML' && normMime.includes('officedocument'))
		|| (detectedFormat === 'ISO BMFF (MP4/M4A)' && (normMime === 'audio/mp4' || normMime === 'video/quicktime'))

	if (!extMatches || !mimeMatches) {
		const extDesc = ext ? `.${ext}` : '(none)'
		return {
			status: 'header-mismatch',
			detectedFormat,
			detectedMime,
			detectedExtensions,
			detail: `Magic header is ${detectedFormat} (${detectedMime}), mismatches ${extDesc}.`,
		}
	}

	return {
		status: 'verified',
		detectedFormat,
		detectedMime,
		detectedExtensions,
		detail: `Verified ${detectedFormat} magic signature.`,
	}
}

/**
 * Resolve a stable group key for a duplicate group object.
 *
 * @param {object} group - Duplicate group object.
 * @param {number} index - Fallback index.
 * @return {string} Stable group key.
 */
function resolveGroupKey(group, index) {
	if (group && group.hash) {
		return `hash:${group.hash}`
	}
	if (group && group.id !== undefined && group.id !== null) {
		return `id:${group.id}`
	}
	return `idx:${index}`
}

/**
 * Resolve a safe non-negative integer size from a file object.
 *
 * @param {object} file - File entry.
 * @return {number} File size in bytes.
 */
function getSafeFileSize(file) {
	const raw = Number(file && file.size)
	if (!Number.isFinite(raw) || raw < 0) {
		return 0
	}
	return Math.floor(raw)
}

/**
 * Analyze duplicate groups for hygiene anomalies (bad extensions, zero-byte files,
 * sync conflicts/junk, and cross-copy extension divergence).
 *
 * @param {Array<object>} duplicates - Duplicate groups to inspect.
 * @return {{
 *   findings: Array<object>,
 *   summary: {
 *     totalFindings: number,
 *     affectedGroupCount: number,
 *     byCategory: object.<string, number>,
 *     safeCleanableCount: number,
 *     safeReclaimableBytes: number,
 *     safeReclaimableFormatted: string,
 *     protectedFindingCount: number
 *   }
 * }} Structured hygiene analysis.
 */
export function analyzeFileHygiene(duplicates) {
	const groups = Array.isArray(duplicates) ? duplicates : []
	const findings = []
	const affectedGroupKeys = new Set()
	const byCategory = {
		'bad-extension': 0,
		'zero-byte': 0,
		'sync-conflict': 0,
		'mixed-extension-group': 0,
	}

	let safeCleanableCount = 0
	let safeReclaimableBytes = 0
	let protectedFindingCount = 0

	groups.forEach((group, groupIndex) => {
		if (!group || typeof group !== 'object') {
			return
		}
		const files = Array.isArray(group.files)
			? group.files.filter(f => f && typeof f === 'object')
			: []
		if (files.length === 0) {
			return
		}

		const groupKey = resolveGroupKey(group, groupIndex)
		const groupName = extractFilename(files[0].path) || group.hash || String(group.id || groupIndex + 1)
		const groupExtensions = new Set()
		const nonOriginFiles = files.filter(file => !file.isInOriginFolder)

		files.forEach((file, fileIndex) => {
			const filePath = typeof file.path === 'string' ? file.path : ''
			const fileKey = String(getFileSelectionKey(file) ?? `${groupKey}:file:${fileIndex}`)
			const sizeBytes = getSafeFileSize(file)
			const normalizedMime = normalizeMimeType(file.mimetype)
			const ext = extractExtension(filePath)
			if (ext) {
				groupExtensions.add(ext)
			}
			const isProtected = Boolean(file.isInOriginFolder)
			// Safe deletion requires leaving at least 1 surviving copy in the group
			const canSafelyDelete = !isProtected && files.length > 1

			const badExt = detectBadExtension(filePath, file.mimetype)
			if (badExt.mismatch) {
				const findingId = `${groupKey}:${fileKey}:bad-extension`
				const detail = badExt.reason === 'missing-extension'
					? `Missing file extension for ${badExt.normalizedMime} (suggested .${badExt.suggestedExtension})`
					: `Extension .${badExt.currentExtension} mismatches ${badExt.normalizedMime} (expected .${badExt.suggestedExtension})`
				findings.push({
					id: findingId,
					category: 'bad-extension',
					severity: 'warning',
					groupKey,
					groupId: group.id ?? null,
					groupHash: group.hash || '',
					groupName,
					acknowledged: Boolean(group.acknowledged),
					groupFileCount: files.length,
					rawGroup: group,
					fileKey,
					file,
					filePath,
					filename: extractFilename(filePath),
					folderLabel: getFolderLabel(filePath),
					sizeBytes,
					sizeFormatted: formatBytes(sizeBytes),
					declaredMime: normalizedMime,
					currentExtension: badExt.currentExtension,
					suggestedExtension: badExt.suggestedExtension,
					reason: detail,
					subType: badExt.reason,
					isProtected,
					canSafelyDelete,
				})
				byCategory['bad-extension'] += 1
				affectedGroupKeys.add(groupKey)
				if (isProtected) {
					protectedFindingCount += 1
				}
			}

			if (sizeBytes === 0 || sizeBytes <= MICRO_STUB_MAX_BYTES) {
				const isZero = sizeBytes === 0
				const findingId = `${groupKey}:${fileKey}:zero-byte`
				const detail = isZero
					? `Empty 0 B duplicate file (${files.length} copies in group)`
					: `Micro-stub duplicate (${sizeBytes} B, ${files.length} copies in group)`
				findings.push({
					id: findingId,
					category: 'zero-byte',
					severity: isZero ? 'warning' : 'info',
					groupKey,
					groupId: group.id ?? null,
					groupHash: group.hash || '',
					groupName,
					acknowledged: Boolean(group.acknowledged),
					groupFileCount: files.length,
					rawGroup: group,
					fileKey,
					file,
					filePath,
					filename: extractFilename(filePath),
					folderLabel: getFolderLabel(filePath),
					sizeBytes,
					sizeFormatted: formatBytes(sizeBytes),
					declaredMime: normalizedMime,
					currentExtension: ext,
					suggestedExtension: '',
					reason: detail,
					subType: isZero ? 'zero-byte' : 'micro-stub',
					isProtected,
					canSafelyDelete,
				})
				byCategory['zero-byte'] += 1
				affectedGroupKeys.add(groupKey)
				if (isProtected) {
					protectedFindingCount += 1
				}
			}

			const conflict = detectSyncConflictOrJunk(filePath)
			if (conflict.matched) {
				const findingId = `${groupKey}:${fileKey}:sync-conflict`
				findings.push({
					id: findingId,
					category: 'sync-conflict',
					severity: conflict.subType === 'nextcloud-conflict' ? 'warning' : 'caution',
					groupKey,
					groupId: group.id ?? null,
					groupHash: group.hash || '',
					groupName,
					acknowledged: Boolean(group.acknowledged),
					groupFileCount: files.length,
					rawGroup: group,
					fileKey,
					file,
					filePath,
					filename: extractFilename(filePath),
					folderLabel: getFolderLabel(filePath),
					sizeBytes,
					sizeFormatted: formatBytes(sizeBytes),
					declaredMime: normalizedMime,
					currentExtension: ext,
					suggestedExtension: '',
					reason: conflict.label,
					subType: conflict.subType,
					isProtected,
					canSafelyDelete,
				})
				byCategory['sync-conflict'] += 1
				affectedGroupKeys.add(groupKey)
				if (isProtected) {
					protectedFindingCount += 1
				}
			}
		})

		if (groupExtensions.size >= 2) {
			const extList = Array.from(groupExtensions).sort().map(item => `.${item}`).join(', ')
			const primaryFile = nonOriginFiles[0] || files[0]
			const primaryKey = String(getFileSelectionKey(primaryFile) ?? `${groupKey}:mixed`)
			findings.push({
				id: `${groupKey}:mixed-extension-group`,
				category: 'mixed-extension-group',
				severity: 'info',
				groupKey,
				groupId: group.id ?? null,
				groupHash: group.hash || '',
				groupName,
				acknowledged: Boolean(group.acknowledged),
				groupFileCount: files.length,
				rawGroup: group,
				fileKey: primaryKey,
				file: primaryFile,
				filePath: primaryFile.path || '',
				filename: extractFilename(primaryFile.path),
				folderLabel: getFolderLabel(primaryFile.path),
				sizeBytes: getSafeFileSize(primaryFile),
				sizeFormatted: formatBytes(getSafeFileSize(primaryFile)),
				declaredMime: normalizeMimeType(primaryFile.mimetype),
				currentExtension: extractExtension(primaryFile.path),
				suggestedExtension: '',
				reason: `Identical hash spans multiple extensions (${extList})`,
				subType: 'mixed-extension-group',
				isProtected: Boolean(primaryFile.isInOriginFolder),
				canSafelyDelete: false,
			})
			byCategory['mixed-extension-group'] += 1
			affectedGroupKeys.add(groupKey)
		}
	})

	// Count unique safely cleanable files (sync-conflict / zero-byte / bad-extension) while reserving >=1 copy per group
	const cleanableGroupCounts = new Map()
	const seenCleanableFileKeys = new Set()
	for (const finding of findings) {
		if (!finding.canSafelyDelete) {
			continue
		}
		const uniqueFileId = `${finding.groupKey}::${finding.fileKey}`
		if (seenCleanableFileKeys.has(uniqueFileId)) {
			continue
		}
		const alreadySelectedInGroup = cleanableGroupCounts.get(finding.groupKey) || 0
		if (alreadySelectedInGroup + 1 >= finding.groupFileCount) {
			continue
		}
		seenCleanableFileKeys.add(uniqueFileId)
		cleanableGroupCounts.set(finding.groupKey, alreadySelectedInGroup + 1)
		safeCleanableCount += 1
		safeReclaimableBytes += finding.sizeBytes
	}

	findings.sort((a, b) => {
		const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
		if (sevDiff !== 0) {
			return sevDiff
		}
		if (a.groupKey !== b.groupKey) {
			return a.groupKey < b.groupKey ? -1 : 1
		}
		if (a.filePath !== b.filePath) {
			return a.filePath < b.filePath ? -1 : 1
		}
		return a.category < b.category ? -1 : (a.category > b.category ? 1 : 0)
	})

	return {
		findings,
		summary: {
			totalFindings: findings.length,
			affectedGroupCount: affectedGroupKeys.size,
			byCategory,
			safeCleanableCount,
			safeReclaimableBytes,
			safeReclaimableFormatted: formatBytes(safeReclaimableBytes),
			protectedFindingCount,
		},
	}
}

/**
 * Filter hygiene findings by category and case-insensitive search query.
 *
 * @param {Array<object>} findings - Analyzed findings list.
 * @param {object} [filters] - Active filters.
 * @param {string} [filters.category] - Category filter.
 * @param {string} [filters.query] - Case-insensitive query string.
 * @return {Array<object>} Filtered findings.
 */
export function filterHygieneFindings(findings, filters = {}) {
	if (!Array.isArray(findings) || findings.length === 0) {
		return []
	}
	const category = HYGIENE_CATEGORIES.includes(filters.category) ? filters.category : 'all'
	const query = typeof filters.query === 'string' ? filters.query.trim().toLowerCase() : ''

	return findings.filter(item => {
		if (!item || typeof item !== 'object') {
			return false
		}
		if (category !== 'all' && item.category !== category) {
			return false
		}
		if (!query) {
			return true
		}
		const haystack = [
			item.filePath,
			item.groupName,
			item.declaredMime,
			item.currentExtension,
			item.suggestedExtension,
			item.reason,
			item.groupHash,
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
		return haystack.includes(query)
	})
}

/**
 * Auto-select safe clutter findings (sync-conflict and zero-byte copies) while strictly
 * preserving protected origin folders and at least 1 surviving copy per duplicate group.
 *
 * @param {Array<object>} findings - Analyzed findings.
 * @return {string[]} Array of selected unique file selection tokens (`groupKey::fileKey`).
 */
export function pickSafeHygieneSelectionKeys(findings) {
	if (!Array.isArray(findings) || findings.length === 0) {
		return []
	}
	const groupSelectedCount = new Map()
	const selectedTokens = []
	const seenFileTokens = new Set()

	for (const item of findings) {
		if (!item || !item.canSafelyDelete || item.isProtected) {
			continue
		}
		if (item.category !== 'sync-conflict' && item.category !== 'zero-byte') {
			continue
		}
		const token = `${item.groupKey}::${item.fileKey}`
		if (seenFileTokens.has(token)) {
			continue
		}
		const usedInGroup = groupSelectedCount.get(item.groupKey) || 0
		if (usedInGroup + 1 >= item.groupFileCount) {
			continue
		}
		seenFileTokens.add(token)
		groupSelectedCount.set(item.groupKey, usedInGroup + 1)
		selectedTokens.push(token)
	}

	return selectedTokens
}

/**
 * Build a safe deletion plan from selected hygiene tokens (`groupKey::fileKey`),
 * strictly refusing protected origin copies and preserving at least 1 copy per group.
 *
 * @param {Array<object>} findings - Analyzed findings.
 * @param {Array<string>|Set<string>} selectedTokens - Selected `groupKey::fileKey` tokens.
 * @return {{
 *   selectedFiles: Array<object>,
 *   selectedEntries: Array<object>,
 *   selectedCount: number,
 *   affectedGroupCount: number,
 *   reclaimableBytes: number,
 *   reclaimableFormatted: string,
 *   skippedProtectedCount: number,
 *   skippedLastCopyCount: number
 * }} Safe hygiene cleanup plan.
 */
export function buildHygieneCleanupPlan(findings, selectedTokens) {
	const tokenSet = selectedTokens instanceof Set
		? selectedTokens
		: new Set(Array.isArray(selectedTokens) ? selectedTokens : [])

	if (!Array.isArray(findings) || findings.length === 0 || tokenSet.size === 0) {
		return {
			selectedFiles: [],
			selectedEntries: [],
			selectedCount: 0,
			affectedGroupCount: 0,
			reclaimableBytes: 0,
			reclaimableFormatted: formatBytes(0),
			skippedProtectedCount: 0,
			skippedLastCopyCount: 0,
		}
	}

	const groupSelectedCount = new Map()
	const seenTokens = new Set()
	const affectedGroups = new Set()
	const selectedFiles = []
	const selectedEntries = []
	let reclaimableBytes = 0
	let skippedProtectedCount = 0
	let skippedLastCopyCount = 0

	for (const item of findings) {
		if (!item || !item.file) {
			continue
		}
		const token = `${item.groupKey}::${item.fileKey}`
		if (!tokenSet.has(token) || seenTokens.has(token)) {
			continue
		}
		seenTokens.add(token)

		if (item.isProtected || item.file.isInOriginFolder) {
			skippedProtectedCount += 1
			continue
		}

		const usedInGroup = groupSelectedCount.get(item.groupKey) || 0
		if (item.groupFileCount <= 1 || usedInGroup + 1 >= item.groupFileCount) {
			skippedLastCopyCount += 1
			continue
		}

		groupSelectedCount.set(item.groupKey, usedInGroup + 1)
		affectedGroups.add(item.groupKey)
		selectedFiles.push({
			...item.file,
			fileHash: item.file.fileHash || item.groupHash || '',
		})
		selectedEntries.push(item)
		reclaimableBytes += item.sizeBytes
	}

	return {
		selectedFiles,
		selectedEntries,
		selectedCount: selectedFiles.length,
		affectedGroupCount: affectedGroups.size,
		reclaimableBytes,
		reclaimableFormatted: formatBytes(reclaimableBytes),
		skippedProtectedCount,
		skippedLastCopyCount,
	}
}

/**
 * Neutralize CWE-1236 spreadsheet formula triggers and escape RFC 4180 CSV cells.
 *
 * @param {*} value - Cell value.
 * @return {string} Safe CSV cell string.
 */
function escapeCsvCell(value) {
	if (value === null || value === undefined) {
		return ''
	}
	let text = String(value)
	const hasFormulaTrigger = /^[=+\-@\t\r]|^\s+[=+\-@]/.test(text)
	if (hasFormulaTrigger) {
		text = `'${text}`
	}
	if (hasFormulaTrigger || /[",\r\n]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`
	}
	return text
}

const HYGIENE_CSV_HEADERS = Object.freeze([
	'category',
	'severity',
	'group_id',
	'hash',
	'file_path',
	'size_bytes',
	'declared_mime',
	'current_extension',
	'suggested_extension',
	'protected',
	'reason',
])

/**
 * Build a CWE-1236-safe RFC 4180 CSV audit report of hygiene findings.
 *
 * @param {Array<object>} findings - Hygiene findings.
 * @return {string} CSV document content with CRLF line endings.
 */
export function buildHygieneAuditCsv(findings) {
	const lines = [HYGIENE_CSV_HEADERS.map(escapeCsvCell).join(',')]
	if (!Array.isArray(findings) || findings.length === 0) {
		return lines[0]
	}

	for (const item of findings) {
		if (!item || typeof item !== 'object') {
			continue
		}
		const row = [
			item.category ?? '',
			item.severity ?? '',
			item.groupId ?? '',
			item.groupHash ?? '',
			item.filePath ?? '',
			item.sizeBytes ?? 0,
			item.declaredMime ?? '',
			item.currentExtension ?? '',
			item.suggestedExtension ?? '',
			item.isProtected ? 'true' : 'false',
			item.reason ?? '',
		]
		lines.push(row.map(escapeCsvCell).join(','))
	}

	return lines.join('\r\n')
}

/**
 * Build a structured JSON audit report of hygiene findings.
 *
 * @param {{ findings: Array<object>, summary: object }} analysis - Output from analyzeFileHygiene.
 * @param {string} [exportedAt] - Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON string.
 */
export function buildHygieneAuditJson(analysis, exportedAt) {
	const safeAnalysis = analysis && typeof analysis === 'object' ? analysis : { findings: [], summary: {} }
	const findings = Array.isArray(safeAnalysis.findings) ? safeAnalysis.findings : []
	const timestamp = typeof exportedAt === 'string' && exportedAt.trim()
		? exportedAt.trim()
		: new Date().toISOString()

	return JSON.stringify({
		schema: HYGIENE_REPORT_SCHEMA,
		exportedAt: timestamp,
		summary: safeAnalysis.summary || {},
		findings: findings.map(item => ({
			id: item.id,
			category: item.category,
			severity: item.severity,
			groupId: item.groupId,
			groupHash: item.groupHash,
			filePath: item.filePath,
			sizeBytes: item.sizeBytes,
			declaredMime: item.declaredMime,
			currentExtension: item.currentExtension,
			suggestedExtension: item.suggestedExtension,
			protected: Boolean(item.isProtected),
			canSafelyDelete: Boolean(item.canSafelyDelete),
			reason: item.reason,
		})),
	}, null, 2)
}
