/**
 * Pure archive container inspection, ZIP/TAR/GZIP header & central directory parsing,
 * intra-archive duplicate detection, cross-archive payload overlap diffing, and
 * extracted loose-file duplicate cross-matching helpers.
 * Zero DOM dependencies, zero XSS sinks, bounded memory/CPU parsing.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import {
	escapeCsvCell,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
} from './duplicateSelectionAndExport'

export const ARCHIVE_INSPECTOR_SCHEMA = 'duplicatefinder.archive-payload.v1'
export const MAX_ARCHIVE_ENTRIES = 500
export const MAX_FULL_FETCH_BYTES = 2 * 1024 * 1024
export const RANGE_WINDOW_BYTES = 65536
export const ZIP_BOMB_RATIO_THRESHOLD = 100
export const ZIP_BOMB_MIN_UNCOMPRESSED_BYTES = 10 * 1024 * 1024

export const PURE_ARCHIVE_EXTENSIONS = Object.freeze([
	'zip', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', '7z', 'rar', 'zst', 'tzst',
])

export const CONTAINER_ARCHIVE_EXTENSIONS = Object.freeze([
	'jar', 'war', 'ear', 'apk', 'ipa', 'epub', 'docx', 'xlsx', 'pptx',
	'odt', 'ods', 'odp', 'whl', 'nupkg', 'xpi', 'vsix', 'cbz', 'cbr',
])

export const ZIP_CONTAINER_EXTENSIONS = new Set([
	'zip', 'jar', 'war', 'ear', 'apk', 'ipa', 'epub', 'docx', 'xlsx', 'pptx',
	'odt', 'ods', 'odp', 'whl', 'nupkg', 'xpi', 'vsix', 'cbz',
])

const TAR_EXTENSIONS = new Set(['tar'])
const GZIP_EXTENSIONS = new Set(['gz', 'tgz'])
const BZIP2_EXTENSIONS = new Set(['bz2', 'tbz2'])
const XZ_EXTENSIONS = new Set(['xz', 'txz'])
const SEVEN_ZIP_EXTENSIONS = new Set(['7z'])
const RAR_EXTENSIONS = new Set(['rar', 'cbr'])
const ZSTD_EXTENSIONS = new Set(['zst', 'tzst'])

const ARCHIVE_MIME_FAMILIES = Object.freeze({
	'application/zip': 'zip',
	'application/x-zip-compressed': 'zip',
	'application/java-archive': 'zip',
	'application/epub+zip': 'zip',
	'application/vnd.android.package-archive': 'zip',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'zip',
	'application/vnd.oasis.opendocument.text': 'zip',
	'application/vnd.oasis.opendocument.spreadsheet': 'zip',
	'application/vnd.oasis.opendocument.presentation': 'zip',
	'application/x-tar': 'tar',
	'application/tar': 'tar',
	'application/gzip': 'gzip',
	'application/x-gzip': 'gzip',
	'application/x-bzip2': 'bzip2',
	'application/x-xz': 'xz',
	'application/x-7z-compressed': '7z',
	'application/x-rar-compressed': 'rar',
	'application/vnd.rar': 'rar',
	'application/zstd': 'zstd',
})

export const ZIP_COMPRESSION_METHODS = Object.freeze({
	0: 'Store',
	1: 'Shrink',
	6: 'Implode',
	8: 'Deflate',
	9: 'Deflate64',
	12: 'BZIP2',
	14: 'LZMA',
	93: 'ZSTD',
	98: 'PPMd',
})

const NESTED_ARCHIVE_EXT_SET = new Set([
	...PURE_ARCHIVE_EXTENSIONS,
	'jar', 'war', 'ear', 'apk', 'whl', 'nupkg',
])

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text rendering.
 *
 * @param {*} raw - Candidate text.
 * @param {number} [maxLen=240] - Maximum character length.
 * @return {string} Cleaned plain text.
 */
export function sanitizeArchiveText(raw, maxLen = 240) {
	if (typeof raw !== 'string') {
		return ''
	}
	let out = ''
	for (let i = 0; i < raw.length; i += 1) {
		const code = raw.charCodeAt(i)
		if (code === 0) {
			continue
		}
		out += (code < 32 || code === 127) ? ' ' : raw[i]
	}
	const trimmed = out.replace(/\s+/g, ' ').trim()
	if (trimmed.length <= maxLen) {
		return trimmed
	}
	return `${trimmed.slice(0, Math.max(1, maxLen - 3))}...`
}

/**
 * Normalize and audit an inner archive member path for traversal patterns.
 *
 * @param {string} rawPath - Raw inner member path.
 * @return {{ path: string, fileName: string, folder: string, extension: string, hasPathTraversal: boolean }} Sanitized path info.
 */
export function sanitizeInnerArchivePath(rawPath) {
	const cleaned = sanitizeArchiveText(rawPath, 320).replace(/\\/g, '/')
	const hasWindowsDrive = /^[A-Za-z]:/.test(cleaned)
	const hasLeadingSlash = cleaned.startsWith('/')
	const hasDotDot = /(?:^|\/)\.\.(?:\/|$)/.test(cleaned)
	const hasPathTraversal = hasWindowsDrive || hasLeadingSlash || hasDotDot

	const safeTrimmed = cleaned
		.replace(/^[A-Za-z]:/, '')
		.replace(/^\/+/, '')
		.replace(/^\.\//, '')
		.replace(/\/+$/, '')
	const segments = safeTrimmed.split('/').filter(Boolean)
	const fileName = segments.length > 0 ? segments[segments.length - 1] : ''
	const folder = segments.length > 1 ? segments.slice(0, -1).join('/') : ''
	const extension = extractFileExtension(fileName)

	return {
		path: safeTrimmed || cleaned || '(unnamed)',
		fileName,
		folder,
		extension,
		hasPathTraversal,
	}
}

/**
 * Extract filename from a path.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {string} Basename or empty string.
 */
export function extractArchiveFileName(rawPath) {
	if (typeof rawPath !== 'string' || !rawPath.trim()) {
		return ''
	}
	const normalized = rawPath.trim().replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Classify whether a duplicate file entry is an archive or ZIP-based container.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {{
 *   isArchive: boolean,
 *   kind: 'pure-archive'|'package-container'|'non-archive',
 *   containerFamily: string,
 *   inspectableByClient: boolean,
 *   extension: string,
 *   label: string
 * }} Classification details.
 */
export function classifyArchiveContainer(file) {
	if (!file || typeof file !== 'object') {
		return {
			isArchive: false,
			kind: 'non-archive',
			containerFamily: 'other',
			inspectableByClient: false,
			extension: '',
			label: '',
		}
	}

	const rawPath = file.path || file.name || ''
	const fileName = extractArchiveFileName(rawPath).toLowerCase()
	let ext = extractFileExtension(fileName)
	if (fileName.endsWith('.tar.gz')) {
		ext = 'tgz'
	} else if (fileName.endsWith('.tar.bz2')) {
		ext = 'tbz2'
	} else if (fileName.endsWith('.tar.xz')) {
		ext = 'txz'
	} else if (fileName.endsWith('.tar.zst')) {
		ext = 'tzst'
	}

	const mime = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''

	let containerFamily = ''
	if (ZIP_CONTAINER_EXTENSIONS.has(ext)) {
		containerFamily = 'zip'
	} else if (TAR_EXTENSIONS.has(ext)) {
		containerFamily = 'tar'
	} else if (GZIP_EXTENSIONS.has(ext)) {
		containerFamily = 'gzip'
	} else if (BZIP2_EXTENSIONS.has(ext)) {
		containerFamily = 'bzip2'
	} else if (XZ_EXTENSIONS.has(ext)) {
		containerFamily = 'xz'
	} else if (SEVEN_ZIP_EXTENSIONS.has(ext)) {
		containerFamily = '7z'
	} else if (RAR_EXTENSIONS.has(ext)) {
		containerFamily = 'rar'
	} else if (ZSTD_EXTENSIONS.has(ext)) {
		containerFamily = 'zstd'
	} else if (ARCHIVE_MIME_FAMILIES[mime]) {
		containerFamily = ARCHIVE_MIME_FAMILIES[mime]
	}

	if (!containerFamily) {
		return {
			isArchive: false,
			kind: 'non-archive',
			containerFamily: 'other',
			inspectableByClient: false,
			extension: ext,
			label: '',
		}
	}

	const isPure = PURE_ARCHIVE_EXTENSIONS.includes(ext)
		|| (!CONTAINER_ARCHIVE_EXTENSIONS.includes(ext) && Boolean(ARCHIVE_MIME_FAMILIES[mime]))
	const kind = isPure ? 'pure-archive' : 'package-container'
	const inspectableByClient = containerFamily === 'zip' || containerFamily === 'tar' || containerFamily === 'gzip'
	const label = ext ? ext.toUpperCase() : containerFamily.toUpperCase()

	return {
		isArchive: true,
		kind,
		containerFamily,
		inspectableByClient,
		extension: ext,
		label,
	}
}

/**
 * Convert an ArrayBuffer or Uint8Array slice into a Uint8Array safely.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} input - Binary input.
 * @return {Uint8Array} Normalized byte view.
 */
function toUint8Array(input) {
	if (!input) {
		return new Uint8Array(0)
	}
	if (input instanceof Uint8Array) {
		return input
	}
	if (input instanceof ArrayBuffer) {
		return new Uint8Array(input)
	}
	if (ArrayBuffer.isView(input)) {
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
	}
	return new Uint8Array(0)
}

/**
 * Detect container format from magic bytes.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} input - Leading or container bytes.
 * @return {{ format: string, signatureHex: string, valid: boolean }} Magic byte detection result.
 */
export function detectArchiveMagic(input) {
	const bytes = toUint8Array(input)
	if (bytes.length === 0) {
		return { format: 'unknown', signatureHex: '', valid: false }
	}

	const headerLen = Math.min(8, bytes.length)
	const hexParts = []
	for (let i = 0; i < headerLen; i += 1) {
		hexParts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase())
	}
	const signatureHex = hexParts.join(' ')

	if (
		bytes.length >= 4
		&& bytes[0] === 0x50
		&& bytes[1] === 0x4b
		&& ((bytes[2] === 0x03 && bytes[3] === 0x04)
			|| (bytes[2] === 0x05 && bytes[3] === 0x06)
			|| (bytes[2] === 0x01 && bytes[3] === 0x02))
	) {
		return { format: 'zip', signatureHex, valid: true }
	}

	if (bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) {
		return { format: 'gzip', signatureHex, valid: true }
	}

	if (
		bytes.length >= 6
		&& bytes[0] === 0x37
		&& bytes[1] === 0x7a
		&& bytes[2] === 0xbc
		&& bytes[3] === 0xaf
		&& bytes[4] === 0x27
		&& bytes[5] === 0x1c
	) {
		return { format: '7z', signatureHex, valid: true }
	}

	if (
		bytes.length >= 6
		&& bytes[0] === 0x52
		&& bytes[1] === 0x61
		&& bytes[2] === 0x72
		&& bytes[3] === 0x21
		&& bytes[4] === 0x1a
		&& bytes[5] === 0x07
	) {
		return { format: 'rar', signatureHex, valid: true }
	}

	if (bytes.length >= 3 && bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68) {
		return { format: 'bzip2', signatureHex, valid: true }
	}

	if (
		bytes.length >= 6
		&& bytes[0] === 0xfd
		&& bytes[1] === 0x37
		&& bytes[2] === 0x7a
		&& bytes[3] === 0x58
		&& bytes[4] === 0x5a
		&& bytes[5] === 0x00
	) {
		return { format: 'xz', signatureHex, valid: true }
	}

	if (
		bytes.length >= 4
		&& bytes[0] === 0x28
		&& bytes[1] === 0xb5
		&& bytes[2] === 0x2f
		&& bytes[3] === 0xfd
	) {
		return { format: 'zstd', signatureHex, valid: true }
	}

	if (
		bytes.length >= 265
		&& bytes[257] === 0x75
		&& bytes[258] === 0x73
		&& bytes[259] === 0x74
		&& bytes[260] === 0x61
		&& bytes[261] === 0x72
	) {
		return { format: 'tar', signatureHex, valid: true }
	}

	return { format: 'unknown', signatureHex, valid: false }
}

/**
 * Decode MS-DOS 16-bit time & date fields into an ISO timestamp string.
 *
 * @param {number} dosTime - 16-bit DOS time.
 * @param {number} dosDate - 16-bit DOS date.
 * @return {string} ISO string or empty string when invalid.
 */
export function decodeDosDateTime(dosTime, dosDate) {
	if (!Number.isFinite(dosDate) || dosDate <= 0) {
		return ''
	}
	const year = ((dosDate >> 9) & 0x7f) + 1980
	const month = (dosDate >> 5) & 0x0f
	const day = dosDate & 0x1f
	if (month < 1 || month > 12 || day < 1 || day > 31) {
		return ''
	}
	const hour = (dosTime >> 11) & 0x1f
	const minute = (dosTime >> 5) & 0x3f
	const second = (dosTime & 0x1f) * 2
	if (hour > 23 || minute > 59 || second > 59) {
		return ''
	}
	const ms = Date.UTC(year, month - 1, day, hour, minute, second)
	if (!Number.isFinite(ms)) {
		return ''
	}
	return new Date(ms).toISOString()
}

/**
 * Decode raw entry filename bytes cleanly using UTF-8 or Latin-1 fallback.
 *
 * @param {Uint8Array} slice - Filename bytes.
 * @param {boolean} isUtf8 - Whether GPBF bit 11 UTF-8 flag is set.
 * @return {string} Decoded filename.
 */
function decodeEntryNameBytes(slice, isUtf8) {
	if (!slice || slice.length === 0) {
		return ''
	}
	if (typeof TextDecoder === 'function') {
		try {
			const decoder = new TextDecoder(isUtf8 ? 'utf-8' : 'utf-8', { fatal: !isUtf8 })
			return decoder.decode(slice)
		} catch (error) {
			try {
				return new TextDecoder('latin1').decode(slice)
			} catch (fallbackError) {
				// Fallback to manual ASCII/Latin-1 decoding
			}
		}
	}
	let out = ''
	for (let i = 0; i < slice.length; i += 1) {
		out += String.fromCharCode(slice[i])
	}
	return out
}

/**
 * Build a normalized archive member record with safety and nested-archive flags.
 *
 * @param {object} rawEntry - Parsed raw member fields.
 * @return {object} Normalized archive member object.
 */
function buildNormalizedArchiveEntry(rawEntry) {
	const pathInfo = sanitizeInnerArchivePath(rawEntry.rawName || '')
	const compressedSize = Math.max(0, Number(rawEntry.compressedSize) || 0)
	const uncompressedSize = Math.max(0, Number(rawEntry.uncompressedSize) || 0)
	const isDirectory = Boolean(rawEntry.isDirectory) || String(rawEntry.rawName || '').endsWith('/')
	const compressionMethodCode = Number.isFinite(Number(rawEntry.compressionMethodCode))
		? Number(rawEntry.compressionMethodCode)
		: 0
	const compressionMethod = rawEntry.compressionMethod
		|| ZIP_COMPRESSION_METHODS[compressionMethodCode]
		|| `Method ${compressionMethodCode}`
	const expansionRatio = compressedSize > 0 ? uncompressedSize / compressedSize : (uncompressedSize > 0 ? uncompressedSize : 1)
	const compressionRatioPercent = uncompressedSize > 0
		? Math.max(0, Math.min(100, Math.round((1 - (compressedSize / uncompressedSize)) * 100)))
		: 0
	const isZipBombSuspect = !isDirectory
		&& uncompressedSize >= ZIP_BOMB_MIN_UNCOMPRESSED_BYTES
		&& compressedSize > 0
		&& expansionRatio >= ZIP_BOMB_RATIO_THRESHOLD
	const isNestedArchive = !isDirectory && NESTED_ARCHIVE_EXT_SET.has(pathInfo.extension)
	const crc32 = typeof rawEntry.crc32 === 'string' && rawEntry.crc32
		? rawEntry.crc32.toLowerCase()
		: '00000000'

	return {
		path: pathInfo.path,
		fileName: pathInfo.fileName,
		folder: pathInfo.folder,
		extension: pathInfo.extension,
		compressedSize,
		compressedFormatted: formatBytes(compressedSize),
		uncompressedSize,
		uncompressedFormatted: formatBytes(uncompressedSize),
		crc32,
		compressionMethodCode,
		compressionMethod,
		compressionRatioPercent,
		mtimeIso: rawEntry.mtimeIso || '',
		isDirectory,
		isEncrypted: Boolean(rawEntry.isEncrypted),
		isNestedArchive,
		hasPathTraversal: pathInfo.hasPathTraversal,
		isZipBombSuspect,
		isIntraDuplicate: false,
		intraDuplicateCount: 1,
		matchedLooseGroupIds: [],
		fingerprint: (!isDirectory && uncompressedSize > 0 && crc32 !== '00000000')
			? `${crc32}:${uncompressedSize}`
			: `${pathInfo.path.toLowerCase()}:${uncompressedSize}`,
	}
}

/**
 * Compute aggregate summary & intra-archive duplicate flags for parsed entries.
 *
 * @param {Array<object>} rawEntries - Normalized entries.
 * @param {object} meta - Container metadata.
 * @return {object} Complete parsed archive payload inspection object.
 */
function finalizeArchiveInspection(rawEntries, meta = {}) {
	const entries = Array.isArray(rawEntries) ? rawEntries : []
	const fingerprintCounts = new Map()
	for (const entry of entries) {
		if (!entry.isDirectory && entry.uncompressedSize > 0 && entry.crc32 && entry.crc32 !== '00000000') {
			fingerprintCounts.set(entry.fingerprint, (fingerprintCounts.get(entry.fingerprint) || 0) + 1)
		}
	}

	const seenFingerprints = new Set()
	let fileCount = 0
	let directoryCount = 0
	let totalCompressedBytes = 0
	let totalUncompressedBytes = 0
	let nestedArchiveCount = 0
	let intraDuplicateCount = 0
	let intraDuplicateWastedBytes = 0
	let pathTraversalCount = 0
	let zipBombSuspectCount = 0
	let encryptedCount = 0

	for (const entry of entries) {
		if (entry.isDirectory) {
			directoryCount += 1
		} else {
			fileCount += 1
			totalCompressedBytes += entry.compressedSize
			totalUncompressedBytes += entry.uncompressedSize
			if (entry.isNestedArchive) {
				nestedArchiveCount += 1
			}
			const fpCount = fingerprintCounts.get(entry.fingerprint) || 0
			if (fpCount > 1) {
				entry.isIntraDuplicate = true
				entry.intraDuplicateCount = fpCount
				if (seenFingerprints.has(entry.fingerprint)) {
					intraDuplicateCount += 1
					intraDuplicateWastedBytes += entry.uncompressedSize
				} else {
					seenFingerprints.add(entry.fingerprint)
				}
			}
		}
		if (entry.hasPathTraversal) {
			pathTraversalCount += 1
		}
		if (entry.isZipBombSuspect) {
			zipBombSuspectCount += 1
		}
		if (entry.isEncrypted) {
			encryptedCount += 1
		}
	}

	const compressionRatioPercent = totalUncompressedBytes > 0
		? Math.max(0, Math.min(100, Math.round((1 - (totalCompressedBytes / totalUncompressedBytes)) * 100)))
		: 0

	return {
		status: meta.status || 'ready',
		format: meta.format || 'unknown',
		parseMode: meta.parseMode || 'none',
		signatureHex: meta.signatureHex || '',
		signatureMismatch: Boolean(meta.signatureMismatch),
		detail: meta.detail || '',
		truncated: Boolean(meta.truncated),
		totalDeclaredEntries: Number.isFinite(Number(meta.totalDeclaredEntries))
			? Number(meta.totalDeclaredEntries)
			: entries.length,
		entries,
		summary: {
			totalEntries: entries.length,
			fileCount,
			directoryCount,
			totalCompressedBytes,
			totalCompressedFormatted: formatBytes(totalCompressedBytes),
			totalUncompressedBytes,
			totalUncompressedFormatted: formatBytes(totalUncompressedBytes),
			compressionRatioPercent,
			nestedArchiveCount,
			intraDuplicateCount,
			intraDuplicateWastedBytes,
			intraDuplicateWastedFormatted: formatBytes(intraDuplicateWastedBytes),
			pathTraversalCount,
			zipBombSuspectCount,
			encryptedCount,
		},
	}
}

/**
 * Parse ZIP entries from Central Directory (via EOCD) or Local File Headers.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - Full ZIP bytes or tail/head window.
 * @param {object} [options] - Parser options.
 * @param {number} [options.tailOffset=0] - Byte offset of `buffer` within the remote file when sliced from tail.
 * @param {Uint8Array|ArrayBuffer|null} [options.headBuffer=null] - Optional head bytes for local-header fallback.
 * @return {object} Parsed ZIP payload inspection result.
 */
export function parseZipBuffer(buffer, options = {}) {
	const bytes = toUint8Array(buffer)
	const tailOffset = Math.max(0, Number(options.tailOffset) || 0)
	const headBytes = options.headBuffer ? toUint8Array(options.headBuffer) : bytes
	const magic = detectArchiveMagic(headBytes.length > 0 ? headBytes : bytes)

	if (bytes.length < 22 && headBytes.length < 30) {
		return finalizeArchiveInspection([], {
			status: 'unavailable',
			format: 'zip',
			parseMode: 'truncated',
			signatureHex: magic.signatureHex,
			detail: 'Buffer too small to contain ZIP headers.',
		})
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const minEocdSearch = Math.max(0, bytes.length - 65557)
	let eocdOffset = -1
	for (let pos = bytes.length - 22; pos >= minEocdSearch; pos -= 1) {
		if (
			bytes[pos] === 0x50
			&& bytes[pos + 1] === 0x4b
			&& bytes[pos + 2] === 0x05
			&& bytes[pos + 3] === 0x06
		) {
			const commentLen = view.getUint16(pos + 20, true)
			if (pos + 22 + commentLen <= bytes.length) {
				eocdOffset = pos
				break
			}
		}
	}

	if (eocdOffset >= 0) {
		const totalDeclaredEntries = view.getUint16(eocdOffset + 10, true)
		const cdSize = view.getUint32(eocdOffset + 12, true)
		const cdOffset = view.getUint32(eocdOffset + 16, true)
		const localCdOffset = cdOffset - tailOffset

		if (
			cdOffset !== 0xffffffff
			&& totalDeclaredEntries !== 0xffff
			&& localCdOffset >= 0
			&& localCdOffset + cdSize <= bytes.length
		) {
			const entries = []
			let cursor = localCdOffset
			const cdEnd = localCdOffset + cdSize
			let truncated = false

			while (cursor + 46 <= cdEnd) {
				if (view.getUint32(cursor, true) !== 0x02014b50) {
					break
				}
				if (entries.length >= MAX_ARCHIVE_ENTRIES) {
					truncated = true
					break
				}
				const flags = view.getUint16(cursor + 8, true)
				const method = view.getUint16(cursor + 10, true)
				const dosTime = view.getUint16(cursor + 12, true)
				const dosDate = view.getUint16(cursor + 14, true)
				const crcNum = view.getUint32(cursor + 16, true)
				const compressedSize = view.getUint32(cursor + 20, true)
				const uncompressedSize = view.getUint32(cursor + 24, true)
				const nameLen = view.getUint16(cursor + 28, true)
				const extraLen = view.getUint16(cursor + 30, true)
				const commentLen = view.getUint16(cursor + 32, true)
				const externalAttrs = view.getUint32(cursor + 38, true)

				const recordSize = 46 + nameLen + extraLen + commentLen
				if (cursor + recordSize > cdEnd) {
					truncated = true
					break
				}

				const nameSlice = bytes.subarray(cursor + 46, cursor + 46 + nameLen)
				const rawName = decodeEntryNameBytes(nameSlice, Boolean(flags & 0x0800))
				const isDirAttr = (externalAttrs & 0x10) !== 0
				entries.push(buildNormalizedArchiveEntry({
					rawName,
					compressedSize,
					uncompressedSize,
					crc32: crcNum.toString(16).padStart(8, '0'),
					compressionMethodCode: method,
					mtimeIso: decodeDosDateTime(dosTime, dosDate),
					isDirectory: rawName.endsWith('/') || (isDirAttr && uncompressedSize === 0),
					isEncrypted: Boolean(flags & 0x0001),
				}))
				cursor += recordSize
			}

			return finalizeArchiveInspection(entries, {
				status: 'ready',
				format: 'zip',
				parseMode: 'central-directory',
				signatureHex: magic.signatureHex,
				totalDeclaredEntries,
				truncated: truncated || totalDeclaredEntries > entries.length,
			})
		}
	}

	// Fallback: sequential Local File Header walk on head buffer
	const scanBytes = headBytes
	const scanView = new DataView(scanBytes.buffer, scanBytes.byteOffset, scanBytes.byteLength)
	const entries = []
	let offset = 0
	let truncated = false

	while (offset + 30 <= scanBytes.length) {
		const sig = scanView.getUint32(offset, true)
		if (sig !== 0x04034b50) {
			break
		}
		if (entries.length >= MAX_ARCHIVE_ENTRIES) {
			truncated = true
			break
		}
		const flags = scanView.getUint16(offset + 6, true)
		const method = scanView.getUint16(offset + 8, true)
		const dosTime = scanView.getUint16(offset + 10, true)
		const dosDate = scanView.getUint16(offset + 12, true)
		const crcNum = scanView.getUint32(offset + 14, true)
		const compressedSize = scanView.getUint32(offset + 18, true)
		const uncompressedSize = scanView.getUint32(offset + 22, true)
		const nameLen = scanView.getUint16(offset + 26, true)
		const extraLen = scanView.getUint16(offset + 28, true)
		const headerTotal = 30 + nameLen + extraLen
		if (offset + headerTotal > scanBytes.length) {
			truncated = true
			break
		}

		const nameSlice = scanBytes.subarray(offset + 30, offset + 30 + nameLen)
		const rawName = decodeEntryNameBytes(nameSlice, Boolean(flags & 0x0800))
		entries.push(buildNormalizedArchiveEntry({
			rawName,
			compressedSize,
			uncompressedSize,
			crc32: crcNum.toString(16).padStart(8, '0'),
			compressionMethodCode: method,
			mtimeIso: decodeDosDateTime(dosTime, dosDate),
			isDirectory: rawName.endsWith('/'),
			isEncrypted: Boolean(flags & 0x0001),
		}))

		// When data descriptor bit 3 is set and compressedSize is 0, we cannot jump past payload reliably
		if ((flags & 0x0008) !== 0 && compressedSize === 0) {
			truncated = true
			break
		}
		const nextOffset = offset + headerTotal + compressedSize
		if (nextOffset <= offset || nextOffset > scanBytes.length) {
			truncated = true
			break
		}
		offset = nextOffset
	}

	if (entries.length === 0) {
		return finalizeArchiveInspection([], {
			status: 'unavailable',
			format: 'zip',
			parseMode: 'no-headers',
			signatureHex: magic.signatureHex,
			detail: 'No ZIP central directory or local file headers found in inspected byte range.',
		})
	}

	return finalizeArchiveInspection(entries, {
		status: 'ready',
		format: 'zip',
		parseMode: truncated ? 'local-headers-partial' : 'local-headers',
		signatureHex: magic.signatureHex,
		truncated,
	})
}

/**
 * Read a null-terminated ASCII/UTF-8 string from a fixed TAR header field.
 *
 * @param {Uint8Array} bytes - Full byte buffer.
 * @param {number} start - Field start offset.
 * @param {number} length - Field byte length.
 * @return {string} Trimmed field value.
 */
function readTarField(bytes, start, length) {
	const end = Math.min(bytes.length, start + length)
	let actualEnd = start
	while (actualEnd < end && bytes[actualEnd] !== 0) {
		actualEnd += 1
	}
	return decodeEntryNameBytes(bytes.subarray(start, actualEnd), true).trim()
}

/**
 * Parse TAR (USTAR / POSIX) 512-byte header blocks.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - TAR archive bytes.
 * @return {object} Parsed TAR payload inspection result.
 */
export function parseTarBuffer(buffer) {
	const bytes = toUint8Array(buffer)
	const magic = detectArchiveMagic(bytes)
	if (bytes.length < 512) {
		return finalizeArchiveInspection([], {
			status: 'unavailable',
			format: 'tar',
			parseMode: 'truncated',
			signatureHex: magic.signatureHex,
			detail: 'Buffer too small to contain a 512-byte TAR header.',
		})
	}

	const entries = []
	let offset = 0
	let truncated = false

	while (offset + 512 <= bytes.length) {
		let allZero = true
		for (let i = 0; i < 512; i += 1) {
			if (bytes[offset + i] !== 0) {
				allZero = false
				break
			}
		}
		if (allZero) {
			break
		}
		if (entries.length >= MAX_ARCHIVE_ENTRIES) {
			truncated = true
			break
		}

		const namePart = readTarField(bytes, offset, 100)
		const sizeOctal = readTarField(bytes, offset + 124, 12).replace(/\s+/g, '')
		const mtimeOctal = readTarField(bytes, offset + 136, 12).replace(/\s+/g, '')
		const typeFlag = String.fromCharCode(bytes[offset + 156] || 48)
		const ustarMagic = readTarField(bytes, offset + 257, 6)
		const prefixPart = ustarMagic.startsWith('ustar')
			? readTarField(bytes, offset + 345, 155)
			: ''

		const size = /^[0-7]+$/.test(sizeOctal) ? parseInt(sizeOctal, 8) : 0
		const mtimeSec = /^[0-7]+$/.test(mtimeOctal) ? parseInt(mtimeOctal, 8) : 0
		const rawName = prefixPart ? `${prefixPart}/${namePart}` : namePart

		if (!rawName) {
			break
		}

		const mtimeIso = mtimeSec > 0 ? new Date(mtimeSec * 1000).toISOString() : ''
		const isDirectory = typeFlag === '5' || rawName.endsWith('/')
		entries.push(buildNormalizedArchiveEntry({
			rawName,
			compressedSize: size,
			uncompressedSize: size,
			crc32: '00000000',
			compressionMethod: 'TAR',
			compressionMethodCode: 0,
			mtimeIso,
			isDirectory,
			isEncrypted: false,
		}))

		const paddedBlocks = Math.ceil(size / 512) * 512
		const nextOffset = offset + 512 + paddedBlocks
		if (nextOffset > bytes.length) {
			truncated = true
			break
		}
		offset = nextOffset
	}

	return finalizeArchiveInspection(entries, {
		status: entries.length > 0 ? 'ready' : 'unavailable',
		format: 'tar',
		parseMode: truncated ? 'tar-ustar-partial' : 'tar-ustar',
		signatureHex: magic.signatureHex,
		truncated,
	})
}

/**
 * Parse GZIP container header metadata and optional embedded original filename.
 *
 * @param {ArrayBuffer|Uint8Array} buffer - GZIP bytes.
 * @param {object} [fileMeta] - Optional outer file metadata.
 * @return {object} Parsed GZIP inspection result.
 */
export function parseGzipBuffer(buffer, fileMeta = {}) {
	const bytes = toUint8Array(buffer)
	const magic = detectArchiveMagic(bytes)
	if (bytes.length < 10 || magic.format !== 'gzip') {
		return finalizeArchiveInspection([], {
			status: 'unavailable',
			format: 'gzip',
			parseMode: 'invalid-gzip',
			signatureHex: magic.signatureHex,
			detail: 'Invalid GZIP header.',
		})
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	const flg = bytes[3]
	const mtimeSec = view.getUint32(4, true)
	let cursor = 10

	if (flg & 0x04) {
		if (cursor + 2 <= bytes.length) {
			const xlen = view.getUint16(cursor, true)
			cursor += 2 + xlen
		}
	}

	let innerName = ''
	if ((flg & 0x08) && cursor < bytes.length) {
		let end = cursor
		while (end < bytes.length && bytes[end] !== 0) {
			end += 1
		}
		innerName = decodeEntryNameBytes(bytes.subarray(cursor, end), true)
	}

	if (!innerName) {
		const outerName = extractArchiveFileName(fileMeta.path || fileMeta.name || 'payload.gz')
		innerName = outerName.replace(/\.gz$/i, '') || 'payload'
	}

	const outerSize = Number(fileMeta.size) > 0 ? Number(fileMeta.size) : bytes.length
	const isize = bytes.length >= 18 ? view.getUint32(bytes.length - 4, true) : 0
	const uncompressedSize = isize > 0 ? isize : outerSize
	const mtimeIso = mtimeSec > 0 ? new Date(mtimeSec * 1000).toISOString() : ''

	const entry = buildNormalizedArchiveEntry({
		rawName: innerName,
		compressedSize: outerSize,
		uncompressedSize,
		crc32: '00000000',
		compressionMethod: 'GZIP Deflate',
		compressionMethodCode: 8,
		mtimeIso,
		isDirectory: false,
		isEncrypted: false,
	})

	return finalizeArchiveInspection([entry], {
		status: 'ready',
		format: 'gzip',
		parseMode: 'gzip-header',
		signatureHex: magic.signatureHex,
	})
}

/**
 * Normalize an inline pre-parsed archive manifest (for precomputed or mocked payloads).
 *
 * @param {object} manifest - Raw manifest object.
 * @param {object} [fileMeta] - Outer file metadata.
 * @return {object|null} Normalized inspection result or null.
 */
export function normalizePreloadedManifest(manifest, fileMeta = {}) {
	if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.entries)) {
		return null
	}
	const bounded = manifest.entries.slice(0, MAX_ARCHIVE_ENTRIES).map(item => buildNormalizedArchiveEntry({
		rawName: item.path || item.name || item.rawName || '',
		compressedSize: item.compressedSize ?? item.size ?? 0,
		uncompressedSize: item.uncompressedSize ?? item.size ?? 0,
		crc32: item.crc32 || '00000000',
		compressionMethod: item.compressionMethod || 'Deflate',
		compressionMethodCode: item.compressionMethodCode ?? 8,
		mtimeIso: item.mtimeIso || item.mtime || '',
		isDirectory: Boolean(item.isDirectory),
		isEncrypted: Boolean(item.isEncrypted),
	}))
	const container = classifyArchiveContainer(fileMeta)
	return finalizeArchiveInspection(bounded, {
		status: 'ready',
		format: manifest.format || container.containerFamily || 'zip',
		parseMode: manifest.parseMode || 'manifest',
		signatureHex: manifest.signatureHex || '',
		signatureMismatch: Boolean(manifest.signatureMismatch),
		truncated: manifest.entries.length > MAX_ARCHIVE_ENTRIES || Boolean(manifest.truncated),
		totalDeclaredEntries: Number(manifest.totalDeclaredEntries) || manifest.entries.length,
	})
}

/**
 * Unified archive container payload parser from bytes and file metadata.
 *
 * @param {ArrayBuffer|Uint8Array|null|undefined} buffer - Container bytes (full or tail window).
 * @param {object} [fileMeta] - Outer duplicate file metadata.
 * @param {object} [options] - Range/head options.
 * @return {object} Normalized inspection result.
 */
export function parseArchivePayload(buffer, fileMeta = {}, options = {}) {
	if (fileMeta && fileMeta.archiveManifest) {
		const preloaded = normalizePreloadedManifest(fileMeta.archiveManifest, fileMeta)
		if (preloaded) {
			return preloaded
		}
	}

	const container = classifyArchiveContainer(fileMeta)
	const bytes = toUint8Array(buffer)
	const headBytes = options.headBuffer ? toUint8Array(options.headBuffer) : bytes
	const magic = detectArchiveMagic(headBytes.length > 0 ? headBytes : bytes)

	const expected = container.containerFamily
	const actual = magic.format !== 'unknown' ? magic.format : expected
	const signatureMismatch = Boolean(
		magic.valid
		&& expected
		&& expected !== 'other'
		&& magic.format !== expected
	)

	if (actual === 'zip') {
		const parsed = parseZipBuffer(bytes, options)
		parsed.signatureMismatch = signatureMismatch
		return parsed
	}
	if (actual === 'tar') {
		const parsed = parseTarBuffer(bytes)
		parsed.signatureMismatch = signatureMismatch
		return parsed
	}
	if (actual === 'gzip') {
		const parsed = parseGzipBuffer(bytes, fileMeta)
		parsed.signatureMismatch = signatureMismatch
		return parsed
	}

	if (magic.valid) {
		return finalizeArchiveInspection([], {
			status: 'signature-only',
			format: magic.format,
			parseMode: 'magic-signature',
			signatureHex: magic.signatureHex,
			signatureMismatch,
			detail: `Verified ${magic.format.toUpperCase()} container signature (${magic.signatureHex}). Client-side member listing is supported for ZIP, TAR, and GZIP.`,
		})
	}

	return finalizeArchiveInspection([], {
		status: 'unavailable',
		format: expected || 'unknown',
		parseMode: 'none',
		signatureHex: magic.signatureHex,
		signatureMismatch: false,
		detail: 'Archive container header is unavailable or format is unsupported for client-side listing.',
	})
}

/**
 * Build an index of non-archive duplicate files for extracted-payload cross-matching.
 *
 * @param {Array<object>} duplicates - Duplicate groups list.
 * @return {{ byNameAndSize: Map<string, Array<object>>, byName: Map<string, Array<object>> }} Loose file index.
 */
export function buildLooseFileIndex(duplicates) {
	const byNameAndSize = new Map()
	const byName = new Map()

	for (const group of Array.isArray(duplicates) ? duplicates : []) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			if (!file || classifyArchiveContainer(file).isArchive) {
				continue
			}
			const fileName = extractArchiveFileName(file.path || file.name || '').toLowerCase()
			if (!fileName) {
				continue
			}
			const size = Math.max(0, Number(file.size) || 0)
			const record = {
				groupId: group.id,
				hash: group.hash || '',
				path: normalizePathForDiff(file.path || '') || file.path || '',
				fileName,
				size,
			}
			const exactKey = `${fileName}:${size}`
			if (!byNameAndSize.has(exactKey)) {
				byNameAndSize.set(exactKey, [])
			}
			byNameAndSize.get(exactKey).push(record)

			if (!byName.has(fileName)) {
				byName.set(fileName, [])
			}
			byName.get(fileName).push(record)
		}
	}

	return { byNameAndSize, byName }
}

/**
 * Compare two inspected archive payloads and quantify shared member overlap.
 *
 * @param {object|null} inspectionA - First archive inspection object.
 * @param {object|null} inspectionB - Second archive inspection object.
 * @return {object|null} Comparison metrics and entry diffs or null if either is uninspected.
 */
export function compareArchivePayloads(inspectionA, inspectionB) {
	if (
		!inspectionA
		|| !inspectionB
		|| inspectionA.status !== 'ready'
		|| inspectionB.status !== 'ready'
	) {
		return null
	}

	const filesA = inspectionA.entries.filter(entry => !entry.isDirectory)
	const filesB = inspectionB.entries.filter(entry => !entry.isDirectory)
	const mapA = new Map()
	const mapB = new Map()

	for (const entry of filesA) {
		if (!mapA.has(entry.fingerprint)) {
			mapA.set(entry.fingerprint, entry)
		}
	}
	for (const entry of filesB) {
		if (!mapB.has(entry.fingerprint)) {
			mapB.set(entry.fingerprint, entry)
		}
	}

	const sharedEntries = []
	const onlyAEntries = []
	const onlyBEntries = []
	let sharedBytes = 0

	for (const [fp, entryA] of mapA.entries()) {
		if (mapB.has(fp)) {
			sharedEntries.push({
				fingerprint: fp,
				pathA: entryA.path,
				pathB: mapB.get(fp).path,
				uncompressedSize: entryA.uncompressedSize,
				uncompressedFormatted: entryA.uncompressedFormatted,
				crc32: entryA.crc32,
			})
			sharedBytes += entryA.uncompressedSize
		} else {
			onlyAEntries.push(entryA)
		}
	}

	for (const [fp, entryB] of mapB.entries()) {
		if (!mapA.has(fp)) {
			onlyBEntries.push(entryB)
		}
	}

	const unionSize = mapA.size + mapB.size - sharedEntries.length
	const jaccardPercent = unionSize > 0
		? Math.round((sharedEntries.length / unionSize) * 100)
		: 0

	return {
		jaccardPercent,
		sharedCount: sharedEntries.length,
		onlyACount: onlyAEntries.length,
		onlyBCount: onlyBEntries.length,
		sharedBytes,
		sharedBytesFormatted: formatBytes(sharedBytes),
		sharedEntries: sharedEntries.slice(0, 100),
		onlyAEntries: onlyAEntries.slice(0, 100),
		onlyBEntries: onlyBEntries.slice(0, 100),
	}
}

/**
 * Pick safe survivor and deletion candidates for a duplicate archive group,
 * always protecting origin folders and never deleting the last copy.
 *
 * @param {Array<object>} files - Group files.
 * @param {string} keepRule - Survivor preference ('oldest'|'newest'|'shortest_path').
 * @return {{
 *   survivors: Array<object>,
 *   deletionCandidates: Array<object>,
 *   protectedCount: number,
 *   deletableCount: number,
 *   allProtected: boolean
 * }} Triage plan.
 */
function resolveArchiveGroupPlan(files, keepRule) {
	const safeFiles = Array.isArray(files) ? files.filter(Boolean) : []
	if (safeFiles.length <= 1) {
		return {
			survivors: safeFiles,
			deletionCandidates: [],
			protectedCount: safeFiles.filter(f => Boolean(f.isInOriginFolder)).length,
			deletableCount: 0,
			allProtected: true,
		}
	}

	const protectedFiles = safeFiles.filter(f => Boolean(f.isInOriginFolder))
	const nonProtected = safeFiles.filter(f => !f.isInOriginFolder)

	if (protectedFiles.length > 0) {
		return {
			survivors: protectedFiles,
			deletionCandidates: nonProtected,
			protectedCount: protectedFiles.length,
			deletableCount: nonProtected.length,
			allProtected: nonProtected.length === 0,
		}
	}

	const selectedToDelete = selectDuplicatesByKeepRule(safeFiles, keepRule)
	const deleteKeys = new Set(selectedToDelete.map(f => getFileSelectionKey(f)))
	const survivors = safeFiles.filter(f => !deleteKeys.has(getFileSelectionKey(f)))
	const deletionCandidates = safeFiles.filter(f => deleteKeys.has(getFileSelectionKey(f)))

	return {
		survivors,
		deletionCandidates,
		protectedCount: 0,
		deletableCount: deletionCandidates.length,
		allProtected: deletionCandidates.length === 0,
	}
}

/**
 * Find pairwise payload overlaps across inspected archive groups.
 *
 * @param {Array<object>} archiveGroups - Built archive group records.
 * @return {Array<object>} Ranked overlap pairs.
 */
export function findCrossArchiveOverlaps(archiveGroups) {
	const inspected = (Array.isArray(archiveGroups) ? archiveGroups : [])
		.filter(g => g.inspection && g.inspection.status === 'ready' && g.inspection.summary.fileCount > 0)
		.slice(0, 40)

	const pairs = []
	for (let i = 0; i < inspected.length; i += 1) {
		for (let j = i + 1; j < inspected.length; j += 1) {
			const groupA = inspected[i]
			const groupB = inspected[j]
			const diff = compareArchivePayloads(groupA.inspection, groupB.inspection)
			if (!diff || diff.sharedCount === 0) {
				continue
			}
			pairs.push({
				id: `${groupA.groupKey}::${groupB.groupKey}`,
				groupKeyA: groupA.groupKey,
				groupKeyB: groupB.groupKey,
				nameA: groupA.representativeName,
				nameB: groupB.representativeName,
				jaccardPercent: diff.jaccardPercent,
				sharedCount: diff.sharedCount,
				sharedBytes: diff.sharedBytes,
				sharedBytesFormatted: diff.sharedBytesFormatted,
			})
		}
	}

	pairs.sort((a, b) => {
		if (b.jaccardPercent !== a.jaccardPercent) {
			return b.jaccardPercent - a.jaccardPercent
		}
		return b.sharedBytes - a.sharedBytes
	})
	return pairs
}

/**
 * Build the complete archive & container payload catalog from duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate groups.
 * @param {object} [inspectedByGroupKey] - Map of groupKey -> parsed inspection object.
 * @param {object} [options] - Build options.
 * @param {string} [options.keepRule='oldest'] - Survivor keep strategy.
 * @param {Array<object>} [options.looseIndexSource] - Optional broader duplicate list for loose-file matching.
 * @return {{
 *   groups: Array<object>,
 *   crossOverlaps: Array<object>,
 *   summary: object
 * }} Archive catalog and summary telemetry.
 */
export function buildArchiveGroupsCatalog(duplicates, inspectedByGroupKey = {}, options = {}) {
	const sourceGroups = Array.isArray(duplicates) ? duplicates : []
	const keepRule = options.keepRule || 'oldest'
	const looseSource = Array.isArray(options.looseIndexSource) ? options.looseIndexSource : sourceGroups
	const looseIndex = buildLooseFileIndex(looseSource)
	const inspectedMap = inspectedByGroupKey && typeof inspectedByGroupKey === 'object' ? inspectedByGroupKey : {}

	const archiveGroups = []
	for (let idx = 0; idx < sourceGroups.length; idx += 1) {
		const group = sourceGroups[idx]
		if (!group || !Array.isArray(group.files) || group.files.length === 0) {
			continue
		}
		const archiveFiles = group.files
			.map(file => ({ file, meta: classifyArchiveContainer(file) }))
			.filter(item => item.meta.isArchive)

		if (archiveFiles.length === 0) {
			continue
		}

		const primary = archiveFiles[0]
		const groupKey = String(group.id ?? group.hash ?? `archive-idx-${idx}`)
		const representativeName = extractArchiveFileName(primary.file.path || primary.file.name || '') || groupKey
		const fileSize = Math.max(0, Number(primary.file.size) || 0)
		const copyCount = group.files.length
		const reclaimableBytes = Math.max(0, (copyCount - 1) * fileSize)
		const plan = resolveArchiveGroupPlan(group.files, keepRule)

		let inspection = inspectedMap[groupKey] || null
		if (!inspection) {
			const fileWithManifest = group.files.find(f => f && f.archiveManifest)
			if (fileWithManifest) {
				inspection = normalizePreloadedManifest(fileWithManifest.archiveManifest, primary.file)
			}
		}

		let extractedMatchCount = 0
		let extractedMatchBytes = 0
		const extractedMatches = []

		if (inspection && inspection.status === 'ready') {
			for (const entry of inspection.entries) {
				entry.matchedLooseGroupIds = []
				if (entry.isDirectory || !entry.fileName) {
					continue
				}
				const exactKey = `${entry.fileName.toLowerCase()}:${entry.uncompressedSize}`
				const matches = looseIndex.byNameAndSize.get(exactKey) || []
				if (matches.length > 0) {
					entry.matchedLooseGroupIds = Array.from(new Set(matches.map(m => m.groupId)))
					extractedMatchCount += 1
					extractedMatchBytes += entry.uncompressedSize
					extractedMatches.push({
						entryPath: entry.path,
						size: entry.uncompressedSize,
						sizeFormatted: entry.uncompressedFormatted,
						loosePaths: matches.map(m => m.path).slice(0, 3),
					})
				}
			}
		}

		const hasSecurityRisk = Boolean(
			inspection
			&& (inspection.signatureMismatch
				|| inspection.summary.pathTraversalCount > 0
				|| inspection.summary.zipBombSuspectCount > 0)
		)
		const hasPayloadAttention = Boolean(
			inspection
			&& inspection.status === 'ready'
			&& (inspection.summary.nestedArchiveCount > 0
				|| inspection.summary.intraDuplicateCount > 0
				|| extractedMatchCount > 0)
		)

		let alertLevel = 'clean'
		if (hasSecurityRisk) {
			alertLevel = 'warning'
		} else if (hasPayloadAttention) {
			alertLevel = 'attention'
		}

		archiveGroups.push({
			groupKey,
			groupId: group.id,
			hash: group.hash || '',
			rawGroup: group,
			representativeName,
			representativePath: normalizePathForDiff(primary.file.path || '') || primary.file.path || '',
			extension: primary.meta.extension,
			kind: primary.meta.kind,
			containerFamily: primary.meta.containerFamily,
			formatLabel: primary.meta.label,
			inspectableByClient: primary.meta.inspectableByClient,
			copyCount,
			fileSize,
			fileSizeFormatted: formatBytes(fileSize),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			protectedCount: plan.protectedCount,
			deletableCount: plan.deletableCount,
			allProtected: plan.allProtected,
			survivors: plan.survivors,
			deletionCandidates: plan.deletionCandidates,
			files: group.files.map(file => ({
				raw: file,
				key: getFileSelectionKey(file),
				path: normalizePathForDiff(file.path || '') || file.path || '',
				fileName: extractArchiveFileName(file.path || ''),
				isProtected: Boolean(file.isInOriginFolder),
				size: Math.max(0, Number(file.size) || 0),
			})),
			inspection,
			extractedMatchCount,
			extractedMatchBytes,
			extractedMatchFormatted: formatBytes(extractedMatchBytes),
			extractedMatches: extractedMatches.slice(0, 25),
			alertLevel,
			crossOverlapCount: 0,
			maxOverlapPercent: 0,
		})
	}

	const crossOverlaps = findCrossArchiveOverlaps(archiveGroups)
	const overlapByGroup = new Map()
	for (const pair of crossOverlaps) {
		for (const key of [pair.groupKeyA, pair.groupKeyB]) {
			const existing = overlapByGroup.get(key) || { count: 0, maxPercent: 0 }
			existing.count += 1
			existing.maxPercent = Math.max(existing.maxPercent, pair.jaccardPercent)
			overlapByGroup.set(key, existing)
		}
	}

	let totalArchiveReclaimableBytes = 0
	let inspectedCount = 0
	let nestedArchiveGroupsCount = 0
	let intraDupGroupsCount = 0
	let extractedOverlapGroupsCount = 0
	let securityRiskGroupsCount = 0

	for (const item of archiveGroups) {
		const ov = overlapByGroup.get(item.groupKey)
		if (ov) {
			item.crossOverlapCount = ov.count
			item.maxOverlapPercent = ov.maxPercent
			if (item.alertLevel === 'clean') {
				item.alertLevel = 'attention'
			}
		}
		totalArchiveReclaimableBytes += item.reclaimableBytes
		if (item.inspection && (item.inspection.status === 'ready' || item.inspection.status === 'signature-only')) {
			inspectedCount += 1
		}
		if (item.inspection && item.inspection.summary.nestedArchiveCount > 0) {
			nestedArchiveGroupsCount += 1
		}
		if (item.inspection && item.inspection.summary.intraDuplicateCount > 0) {
			intraDupGroupsCount += 1
		}
		if (item.extractedMatchCount > 0) {
			extractedOverlapGroupsCount += 1
		}
		if (item.alertLevel === 'warning') {
			securityRiskGroupsCount += 1
		}
	}

	return {
		groups: archiveGroups,
		crossOverlaps,
		summary: {
			totalArchiveGroups: archiveGroups.length,
			inspectedCount,
			totalArchiveReclaimableBytes,
			totalArchiveReclaimableFormatted: formatBytes(totalArchiveReclaimableBytes),
			nestedArchiveGroupsCount,
			intraDupGroupsCount,
			extractedOverlapGroupsCount,
			crossOverlapPairsCount: crossOverlaps.length,
			securityRiskGroupsCount,
		},
	}
}

/**
 * Filter and sort archive groups deterministically.
 *
 * @param {Array<object>} groups - Archive group catalog entries.
 * @param {object} [options] - Filter & sort options.
 * @return {Array<object>} Filtered and sorted archive groups.
 */
export function filterAndSortArchiveGroups(groups, options = {}) {
	const list = Array.isArray(groups) ? groups : []
	const category = typeof options.category === 'string' ? options.category : 'all'
	const sortBy = typeof options.sortBy === 'string' ? options.sortBy : 'reclaimable-desc'
	const query = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const filtered = list.filter(item => {
		if (category === 'zip' && item.containerFamily !== 'zip') {
			return false
		}
		if (category === 'tar-gz' && item.containerFamily !== 'tar' && item.containerFamily !== 'gzip') {
			return false
		}
		if (category === 'nested' && (!item.inspection || item.inspection.summary.nestedArchiveCount === 0)) {
			return false
		}
		if (category === 'extracted-overlap' && item.extractedMatchCount === 0 && item.crossOverlapCount === 0) {
			return false
		}
		if (category === 'intra-dup' && (!item.inspection || item.inspection.summary.intraDuplicateCount === 0)) {
			return false
		}
		if (category === 'security-risk' && item.alertLevel !== 'warning') {
			return false
		}

		if (query) {
			const haystacks = [
				item.representativeName,
				item.representativePath,
				item.hash,
				item.formatLabel,
				...item.files.map(f => f.path),
			]
			if (item.inspection && Array.isArray(item.inspection.entries)) {
				for (const entry of item.inspection.entries.slice(0, 200)) {
					haystacks.push(entry.path)
				}
			}
			const matched = haystacks.some(val => typeof val === 'string' && val.toLowerCase().includes(query))
			if (!matched) {
				return false
			}
		}

		return true
	})

	filtered.sort((a, b) => {
		if (sortBy === 'size-desc') {
			return b.fileSize - a.fileSize || b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'entries-desc') {
			const countA = a.inspection ? a.inspection.summary.fileCount : -1
			const countB = b.inspection ? b.inspection.summary.fileCount : -1
			return countB - countA || b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'overlap-desc') {
			return b.maxOverlapPercent - a.maxOverlapPercent
				|| b.extractedMatchCount - a.extractedMatchCount
				|| b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'copies-desc') {
			return b.copyCount - a.copyCount || b.reclaimableBytes - a.reclaimableBytes
		}
		return b.reclaimableBytes - a.reclaimableBytes || b.fileSize - a.fileSize
	})

	return filtered
}

/**
 * Build deterministic JSON export payload for archive payload inspection audit.
 *
 * @param {object} catalog - Output of buildArchiveGroupsCatalog.
 * @param {object|null} [comparison] - Optional side-by-side comparison metrics.
 * @return {string} Pretty-printed JSON string.
 */
export function buildArchiveAuditJson(catalog, comparison = null) {
	const safeCatalog = catalog && typeof catalog === 'object' ? catalog : { groups: [], crossOverlaps: [], summary: {} }
	const payload = {
		schema: ARCHIVE_INSPECTOR_SCHEMA,
		exportedAt: new Date().toISOString(),
		summary: safeCatalog.summary || {},
		crossOverlaps: safeCatalog.crossOverlaps || [],
		selectedComparison: comparison || null,
		archives: (safeCatalog.groups || []).map(group => ({
			groupId: group.groupId,
			hash: group.hash,
			representativeName: group.representativeName,
			representativePath: group.representativePath,
			containerFamily: group.containerFamily,
			copyCount: group.copyCount,
			fileSize: group.fileSize,
			reclaimableBytes: group.reclaimableBytes,
			alertLevel: group.alertLevel,
			extractedMatchCount: group.extractedMatchCount,
			maxOverlapPercent: group.maxOverlapPercent,
			inspection: group.inspection
				? {
					status: group.inspection.status,
					format: group.inspection.format,
					parseMode: group.inspection.parseMode,
					summary: group.inspection.summary,
					entries: group.inspection.entries.slice(0, 100).map(entry => ({
						path: entry.path,
						compressedSize: entry.compressedSize,
						uncompressedSize: entry.uncompressedSize,
						crc32: entry.crc32,
						compressionMethod: entry.compressionMethod,
						isNestedArchive: entry.isNestedArchive,
						isIntraDuplicate: entry.isIntraDuplicate,
						hasPathTraversal: entry.hasPathTraversal,
						isZipBombSuspect: entry.isZipBombSuspect,
						matchedLooseGroupIds: entry.matchedLooseGroupIds,
					})),
				}
				: null,
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Build CWE-1236-safe RFC 4180 CSV export for archive container groups and payload telemetry.
 *
 * @param {object} catalog - Output of buildArchiveGroupsCatalog.
 * @return {string} CSV string.
 */
export function buildArchiveAuditCsv(catalog) {
	const safeCatalog = catalog && typeof catalog === 'object' ? catalog : { groups: [] }
	const headers = [
		'Group ID',
		'Archive Name',
		'Container Format',
		'Copies',
		'Archive Size (Bytes)',
		'Reclaimable Space (Bytes)',
		'Inspection Status',
		'Member Files',
		'Uncompressed Payload (Bytes)',
		'Compression Ratio (%)',
		'Nested Archives',
		'Intra-Archive Duplicates',
		'Extracted Loose Matches',
		'Max Cross-Archive Overlap (%)',
		'Alert Level',
		'Representative Path',
	]

	const rows = [headers.map(escapeCsvCell).join(',')]
	for (const group of safeCatalog.groups || []) {
		const summary = group.inspection && group.inspection.summary ? group.inspection.summary : null
		const cells = [
			group.groupId ?? '',
			group.representativeName,
			group.formatLabel,
			group.copyCount,
			group.fileSize,
			group.reclaimableBytes,
			group.inspection ? group.inspection.status : 'uninspected',
			summary ? summary.fileCount : '',
			summary ? summary.totalUncompressedBytes : '',
			summary ? summary.compressionRatioPercent : '',
			summary ? summary.nestedArchiveCount : '',
			summary ? summary.intraDuplicateCount : '',
			group.extractedMatchCount,
			group.maxOverlapPercent,
			group.alertLevel,
			group.representativePath,
		]
		rows.push(cells.map(escapeCsvCell).join(','))
	}
	return rows.join('\r\n')
}
