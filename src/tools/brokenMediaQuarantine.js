/**
 * Pure Broken / Zero-Byte / Truncated Media & Corrupted Header Quarantine helpers.
 * Inspired by Czkawka Broken Files, DigiKam Integrity Checker, and forensic container auditors.
 * Zero DOM dependencies, zero network side effects, CWE-1236-safe CSV export.
 */

import { extractFileExtension } from './duplicateFilters'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'

export const QUARANTINE_REPORT_SCHEMA = 'duplicatefinder.quarantine.v1'
export const QUARANTINE_STORAGE_KEY = 'duplicatefinder_quarantine_vault_v1'
export const MAX_HEADER_PROBE_BYTES = 65536
export const MAX_TAIL_PROBE_BYTES = 16384
export const MICRO_STUB_MAX_BYTES = 64

export const QUARANTINE_FILTERS = Object.freeze([
	'all',
	'damaged',
	'zero-byte',
	'corrupted-header',
	'truncated-tail',
	'incomplete-transfer',
	'quarantined',
	'healthy',
	'unprobed',
])

export const QUARANTINE_SORTS = Object.freeze([
	'severity_desc',
	'size_desc',
	'integrity_asc',
	'name_asc',
])

export const INTEGRITY_VERDICTS = Object.freeze([
	'zero-byte',
	'corrupted-header',
	'html-masquerade',
	'dead-fill',
	'truncated-tail',
	'incomplete-transfer',
	'healthy-verified',
	'unprobed',
])

const SEVERITY_RANK = Object.freeze({
	critical: 4,
	high: 3,
	medium: 2,
	info: 1,
	ok: 0,
})

const INCOMPLETE_EXTENSIONS = new Set([
	'part',
	'crdownload',
	'download',
	'partial',
	'icloud',
	'unconfirmed',
	'tmp',
	'temp',
	'opdownload',
])

const CORRUPT_NAME_HINT_RE = /(?:^|[\s._/-])(corrupt|corrupted|damaged|truncated|broken|unreadable|bad[_-]?sector|lost\+found|chk|recovered)(?:[\s._/-]|\d|$)/i

const JPEG_EXTS = new Set(['jpg', 'jpeg', 'jpe', 'jfif'])
const PNG_EXTS = new Set(['png'])
const GIF_EXTS = new Set(['gif'])
const WEBP_EXTS = new Set(['webp'])
const PDF_EXTS = new Set(['pdf'])
const ZIP_CONTAINER_EXTS = new Set(['zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'epub', 'jar'])
const MP4_EXTS = new Set(['mp4', 'm4v', 'mov', 'm4a', '3gp'])
const MP3_EXTS = new Set(['mp3'])
const FLAC_EXTS = new Set(['flac'])
const OGG_EXTS = new Set(['ogg', 'oga', 'opus'])
const WAV_EXTS = new Set(['wav'])
const AVI_EXTS = new Set(['avi'])

const KNOWN_TEXT_MASQUERADE_PREFIXES = [
	'<!doctype',
	'<html',
	'<head',
	'<body',
	'<?xml',
	'<error',
	'{"error',
	'{"message',
]

/**
 * Normalize an arbitrary binary input into a Uint8Array view.
 *
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} input - Raw bytes.
 * @return {Uint8Array} Normalized byte array.
 */
export function toByteArray(input) {
	if (!input) {
		return new Uint8Array(0)
	}
	if (input instanceof Uint8Array) {
		return input
	}
	if (input instanceof ArrayBuffer) {
		return new Uint8Array(input)
	}
	if (Array.isArray(input)) {
		return Uint8Array.from(input)
	}
	return new Uint8Array(0)
}

/**
 * Extract basename from a path string safely.
 *
 * @param {string|null|undefined} filePath - Path or filename.
 * @return {string} Basename string.
 */
function extractBasename(filePath) {
	if (typeof filePath !== 'string') {
		return ''
	}
	const clean = filePath.trim().replace(/\\/g, '/')
	if (!clean) {
		return ''
	}
	const slash = clean.lastIndexOf('/')
	return slash >= 0 ? clean.slice(slash + 1) : clean
}

/**
 * Extract parent folder label from a path string.
 *
 * @param {string|null|undefined} filePath - Raw path.
 * @return {string} Parent folder path.
 */
function extractFolderPath(filePath) {
	if (typeof filePath !== 'string') {
		return '/'
	}
	const clean = filePath.trim().replace(/\\/g, '/')
	const slash = clean.lastIndexOf('/')
	if (slash <= 0) {
		return '/'
	}
	return clean.slice(0, slash) || '/'
}

/**
 * Resolve a stable string key for a duplicate file entry.
 *
 * @param {object|null|undefined} file - File object.
 * @return {string|null} Stable file key or null.
 */
export function resolveQuarantineFileKey(file) {
	const key = getFileSelectionKey(file)
	if (key !== null && key !== undefined && key !== '') {
		return String(key)
	}
	if (file && typeof file.path === 'string' && file.path.trim() !== '') {
		return file.path.trim()
	}
	return null
}

/**
 * Check if a Uint8Array matches an ASCII token at offset.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {number} offset - Start offset.
 * @param {string} token - ASCII token.
 * @return {boolean} True when matched.
 */
function hasAsciiAt(bytes, offset, token) {
	if (!bytes || offset < 0 || bytes.length < offset + token.length) {
		return false
	}
	for (let i = 0; i < token.length; i++) {
		if (bytes[offset + i] !== token.charCodeAt(i)) {
			return false
		}
	}
	return true
}

/**
 * Check if a Uint8Array starts with a sequence of numeric byte values.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {number[]} prefix - Expected bytes.
 * @return {boolean} True when matched.
 */
function startsWithBytes(bytes, prefix) {
	if (!bytes || bytes.length < prefix.length) {
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
 * Search backward or forward in bytes for an ASCII token.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {string} token - ASCII string to find.
 * @param {boolean} [fromEnd=false] - Search from tail backward.
 * @return {number} Byte index or -1.
 */
function findAsciiIndex(bytes, token, fromEnd = false) {
	if (!bytes || !token || bytes.length < token.length) {
		return -1
	}
	const limit = bytes.length - token.length
	if (fromEnd) {
		for (let i = limit; i >= 0; i--) {
			if (hasAsciiAt(bytes, i, token)) {
				return i
			}
		}
		return -1
	}
	for (let i = 0; i <= limit; i++) {
		if (hasAsciiAt(bytes, i, token)) {
			return i
		}
	}
	return -1
}

/**
 * Read a 32-bit unsigned integer safely.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {number} offset - Offset.
 * @param {boolean} [littleEndian=false] - Byte order.
 * @return {number} Unsigned 32-bit value or -1.
 */
function readUint32(bytes, offset, littleEndian = false) {
	if (!bytes || offset < 0 || offset + 4 > bytes.length) {
		return -1
	}
	if (littleEndian) {
		return (
			bytes[offset]
			| (bytes[offset + 1] << 8)
			| (bytes[offset + 2] << 16)
			| (bytes[offset + 3] << 24)
		) >>> 0
	}
	return (
		(bytes[offset] << 24)
		| (bytes[offset + 1] << 16)
		| (bytes[offset + 2] << 8)
		| bytes[offset + 3]
	) >>> 0
}

/**
 * Read a 16-bit big-endian unsigned integer safely.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {number} offset - Offset.
 * @return {number} Unsigned 16-bit value or -1.
 */
function readUint16BE(bytes, offset) {
	if (!bytes || offset < 0 || offset + 2 > bytes.length) {
		return -1
	}
	return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0
}

/**
 * Format a short plain-text hex + sanitized ASCII preview of leading or trailing bytes.
 * Strictly control-char safe and HTML-injection free.
 *
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} rawBytes - Byte slice.
 * @param {number} [maxBytes=48] - Maximum bytes to render.
 * @param {boolean} [fromTail=false] - Whether to render the trailing window.
 * @return {string} Formatted multi-line plain text hex dump.
 */
export function formatSafeHexPreview(rawBytes, maxBytes = 48, fromTail = false) {
	const bytes = toByteArray(rawBytes)
	if (bytes.length === 0) {
		return '(empty)'
	}
	const count = Math.min(bytes.length, Math.max(8, maxBytes))
	const start = fromTail ? Math.max(0, bytes.length - count) : 0
	const slice = bytes.subarray(start, start + count)
	const lines = []
	for (let offset = 0; offset < slice.length; offset += 16) {
		const row = slice.subarray(offset, offset + 16)
		const addr = (start + offset).toString(16).padStart(4, '0').toUpperCase()
		const hexParts = []
		let ascii = ''
		for (let i = 0; i < 16; i++) {
			if (i < row.length) {
				const b = row[i]
				hexParts.push(b.toString(16).padStart(2, '0').toUpperCase())
				ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.'
			} else {
				hexParts.push('  ')
			}
		}
		lines.push(`${addr}: ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${ascii}|`)
	}
	return lines.join('\n')
}

/**
 * Detect whether a buffer starts with an HTML/XML/JSON error page masquerading as binary media.
 *
 * @param {Uint8Array} bytes - Leading bytes.
 * @return {string} Matched text signature or empty string.
 */
function detectTextErrorMasquerade(bytes) {
	if (!bytes || bytes.length < 5) {
		return ''
	}
	let start = 0
	while (start < Math.min(bytes.length, 64) && (bytes[start] <= 32)) {
		start += 1
	}
	const sampleLen = Math.min(bytes.length - start, 64)
	if (sampleLen < 5) {
		return ''
	}
	let lower = ''
	for (let i = 0; i < sampleLen; i++) {
		const code = bytes[start + i]
		lower += (code >= 65 && code <= 90) ? String.fromCharCode(code + 32) : String.fromCharCode(code)
	}
	for (const prefix of KNOWN_TEXT_MASQUERADE_PREFIXES) {
		if (lower.startsWith(prefix)) {
			return prefix
		}
	}
	return ''
}

/**
 * Detect dead-fill buffers where almost all bytes are identical (e.g. 0x00 or 0xFF blocks).
 *
 * @param {Uint8Array} bytes - Sampled bytes.
 * @return {{ isDeadFill: boolean, fillByte: number|null, ratio: number }} Dead fill telemetry.
 */
export function detectDeadFillBuffer(bytes) {
	if (!bytes || bytes.length < 32) {
		return { isDeadFill: false, fillByte: null, ratio: 0 }
	}
	const sampleLen = Math.min(bytes.length, 4096)
	const counts = new Uint32Array(256)
	for (let i = 0; i < sampleLen; i++) {
		counts[bytes[i]] += 1
	}
	let maxCount = 0
	let maxByte = 0
	for (let b = 0; b < 256; b++) {
		if (counts[b] > maxCount) {
			maxCount = counts[b]
			maxByte = b
		}
	}
	const ratio = maxCount / sampleLen
	return {
		isDeadFill: ratio >= 0.985,
		fillByte: ratio >= 0.985 ? maxByte : null,
		ratio: Number(ratio.toFixed(4)),
	}
}

/**
 * Validate JPEG SOI, marker chain, and EOI (0xFF 0xD9) trailer.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectJpegStructure(head, tail) {
	if (!startsWithBytes(head, [0xff, 0xd8, 0xff])) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 10,
			detectedSignature: 'Invalid JPEG SOI',
			expectedSignature: 'FF D8 FF',
			detail: 'JPEG file does not start with valid SOI + marker prefix (FF D8 FF).',
		}
	}

	let pos = 2
	let sawSof = false
	let sawSos = false
	let markerCount = 0
	while (pos + 1 < head.length && markerCount < 64) {
		if (head[pos] !== 0xff) {
			break
		}
		while (pos < head.length && head[pos] === 0xff) {
			pos += 1
		}
		if (pos >= head.length) {
			break
		}
		const marker = head[pos]
		pos += 1
		markerCount += 1
		if (marker === 0xd9) {
			return {
				verdict: 'healthy-verified',
				severity: 'ok',
				integrityScore: 100,
				detectedSignature: 'JPEG SOI + EOI (FF D9)',
				expectedSignature: 'FF D8 ... FF D9',
				detail: 'JPEG header markers and EOI trailer verified.',
			}
		}
		if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8)) {
			continue
		}
		if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
			sawSof = true
		}
		if (marker === 0xda) {
			sawSos = true
			break
		}
		const segLen = readUint16BE(head, pos)
		if (segLen < 2) {
			return {
				verdict: 'corrupted-header',
				severity: 'critical',
				integrityScore: 22,
				detectedSignature: 'Corrupt JPEG segment length',
				expectedSignature: 'FF D8 ... FF D9',
				detail: `JPEG marker 0x${marker.toString(16).toUpperCase()} has invalid length (${segLen}).`,
			}
		}
		pos += segLen
	}

	const checkBuf = tail.length >= 2 ? tail : head
	let hasEoi = false
	for (let i = checkBuf.length - 2; i >= Math.max(0, checkBuf.length - 64); i--) {
		if (checkBuf[i] === 0xff && checkBuf[i + 1] === 0xd9) {
			hasEoi = true
			break
		}
	}

	if (!hasEoi) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: sawSos ? 48 : 30,
			detectedSignature: sawSof ? 'JPEG SOI + SOF (missing EOI)' : 'JPEG SOI only (missing EOI)',
			expectedSignature: 'FF D8 ... FF D9',
			detail: 'Missing JPEG End-Of-Image marker (FF D9). Image is likely truncated mid-transfer.',
		}
	}

	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: 'JPEG SOI + EOI verified',
		expectedSignature: 'FF D8 ... FF D9',
		detail: 'Valid JPEG SOI header, marker framing, and EOI (FF D9) trailer.',
	}
}

/**
 * Validate PNG signature, IHDR dimensions, and IEND trailer chunk.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectPngStructure(head, tail) {
	const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
	if (!startsWithBytes(head, pngSig)) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 8,
			detectedSignature: 'Invalid PNG signature',
			expectedSignature: '89 50 4E 47 0D 0A 1A 0A',
			detail: 'PNG 8-byte magic header is missing or corrupted.',
		}
	}
	if (head.length < 24 || !hasAsciiAt(head, 12, 'IHDR')) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 20,
			detectedSignature: 'PNG missing IHDR chunk',
			expectedSignature: 'IHDR chunk at byte 12',
			detail: 'PNG file is missing a valid IHDR image header chunk.',
		}
	}
	const width = readUint32(head, 16, false)
	const height = readUint32(head, 20, false)
	if (width <= 0 || height <= 0 || width > 100000 || height > 100000) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 25,
			detectedSignature: `PNG invalid IHDR (${width}x${height})`,
			expectedSignature: 'Valid non-zero PNG dimensions',
			detail: `PNG IHDR reports implausible dimensions (${width}x${height}).`,
		}
	}
	const checkTail = tail.length >= 12 ? tail : head
	const iendIdx = findAsciiIndex(checkTail, 'IEND', true)
	if (iendIdx < 0) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: 45,
			detectedSignature: `PNG ${width}x${height} (missing IEND)`,
			expectedSignature: 'IEND trailer chunk',
			detail: 'PNG file lacks the closing IEND chunk; bottom scanlines may be truncated.',
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: `PNG ${width}x${height} + IEND`,
		expectedSignature: 'PNG IHDR + IEND',
		detail: `Valid PNG ${width}x${height} with intact IEND trailer.`,
	}
}

/**
 * Validate GIF header and 0x3B trailer byte.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectGifStructure(head, tail) {
	if (!hasAsciiAt(head, 0, 'GIF87a') && !hasAsciiAt(head, 0, 'GIF89a')) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 10,
			detectedSignature: 'Invalid GIF header',
			expectedSignature: 'GIF87a / GIF89a',
			detail: 'File does not start with GIF87a or GIF89a magic signature.',
		}
	}
	const checkTail = tail.length > 0 ? tail : head
	let hasTrailer = false
	for (let i = checkTail.length - 1; i >= Math.max(0, checkTail.length - 16); i--) {
		if (checkTail[i] === 0x3b) {
			hasTrailer = true
			break
		}
	}
	if (!hasTrailer) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: 45,
			detectedSignature: 'GIF header (missing 0x3B trailer)',
			expectedSignature: 'GIF trailer 0x3B (;)',
			detail: 'GIF stream is missing the 0x3B terminator byte.',
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: 'GIF89a/87a + 0x3B',
		expectedSignature: 'GIF + 0x3B',
		detail: 'Valid GIF signature and terminator byte verified.',
	}
}

/**
 * Validate RIFF-based containers (WebP, WAV, AVI) including declared length vs actual size.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {string} expectedFourCc - Expected RIFF type ('WEBP', 'WAVE', 'AVI ').
 * @param {number} actualFileSize - Reported file size in bytes.
 * @return {object} Structural diagnostic.
 */
function inspectRiffStructure(head, expectedFourCc, actualFileSize) {
	if (head.length < 12 || !hasAsciiAt(head, 0, 'RIFF')) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 12,
			detectedSignature: `Missing RIFF (${expectedFourCc})`,
			expectedSignature: `RIFF....${expectedFourCc}`,
			detail: `Expected RIFF container header for ${expectedFourCc} file.`,
		}
	}
	if (!hasAsciiAt(head, 8, expectedFourCc)) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 18,
			detectedSignature: 'Wrong RIFF FourCC',
			expectedSignature: `RIFF....${expectedFourCc}`,
			detail: `RIFF container does not declare ${expectedFourCc} payload format.`,
		}
	}
	const declaredSize = readUint32(head, 4, true) + 8
	if (actualFileSize > 0 && declaredSize > actualFileSize + 16) {
		const ratioPct = Math.max(1, Math.min(99, Math.round((actualFileSize / declaredSize) * 100)))
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: ratioPct,
			detectedSignature: `RIFF ${expectedFourCc} (${ratioPct}% of ${formatBytes(declaredSize)})`,
			expectedSignature: `${formatBytes(declaredSize)} declared`,
			detail: `File ends at ${formatBytes(actualFileSize)} while RIFF header declares ${formatBytes(declaredSize)}.`,
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: `RIFF ${expectedFourCc} complete`,
		expectedSignature: `RIFF ${expectedFourCc}`,
		detail: `RIFF ${expectedFourCc} header and declared payload size verified.`,
	}
}

/**
 * Validate PDF %PDF- header and %%EOF trailer.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectPdfStructure(head, tail) {
	const pdfIdx = findAsciiIndex(head.subarray(0, Math.min(head.length, 1024)), '%PDF-', false)
	if (pdfIdx < 0) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 10,
			detectedSignature: 'Missing %PDF- header',
			expectedSignature: '%PDF-1.x / 2.x',
			detail: 'PDF signature (%PDF-) not found within the first 1024 bytes.',
		}
	}
	const checkTail = tail.length >= 5 ? tail : head
	const eofIdx = findAsciiIndex(checkTail, '%%EOF', true)
	if (eofIdx < 0) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: 40,
			detectedSignature: '%PDF- header (missing %%EOF)',
			expectedSignature: '%%EOF trailer',
			detail: 'PDF document is missing the closing %%EOF marker and xref tail.',
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: '%PDF- + %%EOF',
		expectedSignature: '%PDF- ... %%EOF',
		detail: 'Valid PDF header and closing %%EOF trailer verified.',
	}
}

/**
 * Validate ZIP / OOXML containers (PK local header + End of Central Directory).
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectZipStructure(head, tail) {
	const hasLocal = startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04])
	const hasEmpty = startsWithBytes(head, [0x50, 0x4b, 0x05, 0x06])
	if (!hasLocal && !hasEmpty) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 10,
			detectedSignature: 'Invalid ZIP PK header',
			expectedSignature: '50 4B 03 04 (PK)',
			detail: 'Archive or Office container lacks PK signature.',
		}
	}
	const checkTail = tail.length >= 22 ? tail : head
	let hasEocd = false
	for (let i = checkTail.length - 22; i >= 0; i--) {
		if (
			checkTail[i] === 0x50
			&& checkTail[i + 1] === 0x4b
			&& checkTail[i + 2] === 0x05
			&& checkTail[i + 3] === 0x06
		) {
			hasEocd = true
			break
		}
	}
	if (!hasEocd) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: 35,
			detectedSignature: 'PK header (missing EOCD)',
			expectedSignature: '50 4B 05 06 EOCD',
			detail: 'ZIP Central Directory End (EOCD) is missing; archive is truncated.',
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: 'PK + EOCD verified',
		expectedSignature: 'PK0304 ... PK0506',
		detail: 'ZIP local signature and End of Central Directory verified.',
	}
}

/**
 * Validate ISO BMFF (MP4 / MOV / M4V / M4A) ftyp and moov atoms.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {Uint8Array} tail - Trailing bytes.
 * @return {object} Structural diagnostic.
 */
function inspectMp4Structure(head, tail) {
	if (head.length < 12 || !hasAsciiAt(head, 4, 'ftyp')) {
		return {
			verdict: 'corrupted-header',
			severity: 'critical',
			integrityScore: 14,
			detectedSignature: 'Missing MP4/MOV ftyp atom',
			expectedSignature: 'ftyp box at offset 4',
			detail: 'ISO BMFF media file does not start with a valid ftyp container box.',
		}
	}
	const moovInHead = findAsciiIndex(head, 'moov', false) >= 0
	const moovInTail = tail.length > 0 && findAsciiIndex(tail, 'moov', false) >= 0
	if (!moovInHead && !moovInTail) {
		return {
			verdict: 'truncated-tail',
			severity: 'high',
			integrityScore: 42,
			detectedSignature: 'MP4 ftyp (moov atom not in head/tail)',
			expectedSignature: 'ftyp + moov box',
			detail: 'No moov index box found in probed header/tail windows (often unplayable truncated recording).',
		}
	}
	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: 'MP4 ftyp + moov',
		expectedSignature: 'ftyp + moov',
		detail: 'ISO BMFF ftyp and moov index atom detected.',
	}
}

/**
 * Validate MP3 / FLAC / OGG audio frame headers.
 *
 * @param {Uint8Array} head - Leading bytes.
 * @param {string} ext - Lowercase extension.
 * @return {object} Structural diagnostic.
 */
function inspectAudioStructure(head, ext) {
	if (MP3_EXTS.has(ext)) {
		const isId3 = hasAsciiAt(head, 0, 'ID3')
		const isFrameSync = head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0
		if (!isId3 && !isFrameSync) {
			return {
				verdict: 'corrupted-header',
				severity: 'critical',
				integrityScore: 15,
				detectedSignature: 'Invalid MP3 sync/ID3',
				expectedSignature: 'ID3 or FF Ex sync',
				detail: 'MP3 file starts with neither an ID3 tag nor an MPEG audio sync frame.',
			}
		}
		return {
			verdict: 'healthy-verified',
			severity: 'ok',
			integrityScore: 100,
			detectedSignature: isId3 ? 'ID3 + MP3' : 'MPEG sync frame',
			expectedSignature: 'ID3 / FF Ex',
			detail: 'MP3 audio header verified.',
		}
	}

	if (FLAC_EXTS.has(ext)) {
		if (!hasAsciiAt(head, 0, 'fLaC')) {
			return {
				verdict: 'corrupted-header',
				severity: 'critical',
				integrityScore: 12,
				detectedSignature: 'Missing fLaC magic',
				expectedSignature: '66 4C 61 43 (fLaC)',
				detail: 'FLAC file does not begin with the fLaC stream marker.',
			}
		}
		return {
			verdict: 'healthy-verified',
			severity: 'ok',
			integrityScore: 100,
			detectedSignature: 'fLaC stream verified',
			expectedSignature: 'fLaC',
			detail: 'FLAC stream marker verified.',
		}
	}

	if (OGG_EXTS.has(ext)) {
		if (!hasAsciiAt(head, 0, 'OggS')) {
			return {
				verdict: 'corrupted-header',
				severity: 'critical',
				integrityScore: 12,
				detectedSignature: 'Missing OggS capture',
				expectedSignature: 'OggS',
				detail: 'OGG/Opus container does not start with an OggS page capture pattern.',
			}
		}
		return {
			verdict: 'healthy-verified',
			severity: 'ok',
			integrityScore: 100,
			detectedSignature: 'OggS page verified',
			expectedSignature: 'OggS',
			detail: 'OGG page header verified.',
		}
	}

	return {
		verdict: 'healthy-verified',
		severity: 'ok',
		integrityScore: 100,
		detectedSignature: 'Non-empty header',
		expectedSignature: ext ? ext.toUpperCase() : 'Binary',
		detail: 'File header bytes appear non-empty and valid.',
	}
}

/**
 * Inspect a file's metadata and optional head/tail binary byte ranges for zero-byte,
 * truncated media, HTML error masquerade, dead-fill blocks, and corrupted headers.
 *
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} rawHead - Leading byte slice.
 * @param {Uint8Array|ArrayBuffer|number[]|null|undefined} rawTail - Trailing byte slice.
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {object} Deterministic structural integrity report.
 */
export function inspectFileStructuralIntegrity(rawHead, rawTail, file) {
	const head = toByteArray(rawHead)
	const tail = toByteArray(rawTail)
	const fileObj = file && typeof file === 'object' ? file : {}
	const path = typeof fileObj.path === 'string' ? fileObj.path : ''
	const name = typeof fileObj.name === 'string' && fileObj.name.trim()
		? fileObj.name.trim()
		: extractBasename(path)
	const ext = extractFileExtension(name || path)
	const size = Number(fileObj.size)
	const actualSize = Number.isFinite(size) && size >= 0 ? size : head.length
	const hasProbedBytes = head.length > 0

	if (actualSize === 0 || (hasProbedBytes && head.length === 0)) {
		return {
			probed: true,
			verdict: 'zero-byte',
			severity: 'critical',
			integrityScore: 0,
			detectedSignature: '0 bytes (empty payload)',
			expectedSignature: ext ? `.${ext.toUpperCase()} header` : 'Non-empty file',
			detail: 'Zero-byte file contains zero payload bytes and cannot be decoded.',
			headerHexPreview: '(0 bytes)',
			tailHexPreview: '(0 bytes)',
		}
	}

	if (INCOMPLETE_EXTENSIONS.has(ext)) {
		return {
			probed: hasProbedBytes,
			verdict: 'incomplete-transfer',
			severity: 'medium',
			integrityScore: 28,
			detectedSignature: `Staging extension (.${ext})`,
			expectedSignature: 'Completed media/document file',
			detail: `Temporary or cloud placeholder extension (.${ext}) indicates an incomplete transfer.`,
			headerHexPreview: hasProbedBytes ? formatSafeHexPreview(head, 48, false) : '(not probed)',
			tailHexPreview: tail.length > 0 ? formatSafeHexPreview(tail, 32, true) : '(not probed)',
		}
	}

	if (!hasProbedBytes && actualSize > 0 && actualSize <= MICRO_STUB_MAX_BYTES) {
		return {
			probed: false,
			verdict: 'zero-byte',
			severity: 'critical',
			integrityScore: 8,
			detectedSignature: `Micro-stub (${actualSize} B)`,
			expectedSignature: ext ? `Valid .${ext.toUpperCase()} container` : 'Complete file',
			detail: `File is only ${actualSize} bytes, too small for a valid media or document container.`,
			headerHexPreview: '(probe header for hex)',
			tailHexPreview: '(probe tail for hex)',
		}
	}

	if (!hasProbedBytes) {
		const nameHasCorruptHint = CORRUPT_NAME_HINT_RE.test(name)
		return {
			probed: false,
			verdict: nameHasCorruptHint ? 'incomplete-transfer' : 'unprobed',
			severity: nameHasCorruptHint ? 'medium' : 'info',
			integrityScore: nameHasCorruptHint ? 55 : null,
			detectedSignature: nameHasCorruptHint ? 'Filename corruption hint' : 'Awaiting byte probe',
			expectedSignature: ext ? `.${ext.toUpperCase()} header + trailer` : 'Header signature',
			detail: nameHasCorruptHint
				? 'Filename contains a corruption/recovery hint; probe binary header & tail to verify.'
				: 'Metadata loaded. Run "Probe headers & tails" to verify magic bytes and container EOF markers.',
			headerHexPreview: '(not probed yet)',
			tailHexPreview: '(not probed yet)',
		}
	}

	const headerHexPreview = formatSafeHexPreview(head, 48, false)
	const tailHexPreview = formatSafeHexPreview(tail.length > 0 ? tail : head, 32, true)

	const masqueradeToken = detectTextErrorMasquerade(head)
	if (masqueradeToken && (
		JPEG_EXTS.has(ext)
		|| PNG_EXTS.has(ext)
		|| GIF_EXTS.has(ext)
		|| WEBP_EXTS.has(ext)
		|| PDF_EXTS.has(ext)
		|| ZIP_CONTAINER_EXTS.has(ext)
		|| MP4_EXTS.has(ext)
		|| MP3_EXTS.has(ext)
		|| FLAC_EXTS.has(ext)
	)) {
		return {
			probed: true,
			verdict: 'html-masquerade',
			severity: 'high',
			integrityScore: 5,
			detectedSignature: `Text/HTML error (${masqueradeToken})`,
			expectedSignature: `.${ext.toUpperCase()} binary header`,
			detail: `File begins with "${masqueradeToken}" text instead of binary .${ext} data (likely a saved HTTP error page).`,
			headerHexPreview,
			tailHexPreview,
		}
	}

	const deadFill = detectDeadFillBuffer(head)
	if (deadFill.isDeadFill) {
		const hexByte = deadFill.fillByte !== null
			? `0x${deadFill.fillByte.toString(16).padStart(2, '0').toUpperCase()}`
			: '0x00'
		return {
			probed: true,
			verdict: 'dead-fill',
			severity: 'high',
			integrityScore: 6,
			detectedSignature: `Constant ${hexByte} fill (${Math.round(deadFill.ratio * 100)}%)`,
			expectedSignature: 'Structured media entropy',
			detail: `Header payload is ${Math.round(deadFill.ratio * 100)}% identical ${hexByte} bytes (corrupted disk/sync allocation).`,
			headerHexPreview,
			tailHexPreview,
		}
	}

	let structural = null
	if (JPEG_EXTS.has(ext)) {
		structural = inspectJpegStructure(head, tail)
	} else if (PNG_EXTS.has(ext)) {
		structural = inspectPngStructure(head, tail)
	} else if (GIF_EXTS.has(ext)) {
		structural = inspectGifStructure(head, tail)
	} else if (WEBP_EXTS.has(ext)) {
		structural = inspectRiffStructure(head, 'WEBP', actualSize)
	} else if (WAV_EXTS.has(ext)) {
		structural = inspectRiffStructure(head, 'WAVE', actualSize)
	} else if (AVI_EXTS.has(ext)) {
		structural = inspectRiffStructure(head, 'AVI ', actualSize)
	} else if (PDF_EXTS.has(ext)) {
		structural = inspectPdfStructure(head, tail)
	} else if (ZIP_CONTAINER_EXTS.has(ext)) {
		structural = inspectZipStructure(head, tail)
	} else if (MP4_EXTS.has(ext)) {
		structural = inspectMp4Structure(head, tail)
	} else if (MP3_EXTS.has(ext) || FLAC_EXTS.has(ext) || OGG_EXTS.has(ext)) {
		structural = inspectAudioStructure(head, ext)
	} else {
		structural = {
			verdict: 'healthy-verified',
			severity: 'ok',
			integrityScore: 100,
			detectedSignature: `${ext ? ext.toUpperCase() : 'Binary'} non-empty`,
			expectedSignature: 'Non-empty non-zero payload',
			detail: 'Header bytes are non-empty and free of dead-fill corruption.',
		}
	}

	return {
		probed: true,
		...structural,
		headerHexPreview,
		tailHexPreview,
	}
}

/**
 * Load persisted quarantine vault map safely from storage.
 *
 * @param {Storage|null|undefined} [storage] - Browser storage object.
 * @return {object} Validated vault map.
 */
export function loadQuarantineVault(storage) {
	const store = storage || (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
	if (!store || typeof store.getItem !== 'function') {
		return {}
	}
	try {
		const raw = store.getItem(QUARANTINE_STORAGE_KEY)
		if (!raw || typeof raw !== 'string') {
			return {}
		}
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {}
		}
		const clean = {}
		for (const [key, entry] of Object.entries(parsed)) {
			if (!key || !entry || typeof entry !== 'object') {
				continue
			}
			clean[String(key)] = {
				quarantinedAt: typeof entry.quarantinedAt === 'string' ? entry.quarantinedAt : '',
				reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 140) : 'Manual quarantine hold',
			}
		}
		return clean
	} catch (error) {
		return {}
	}
}

/**
 * Persist quarantine vault map safely to storage.
 *
 * @param {object} vault - Vault map.
 * @param {Storage|null|undefined} [storage] - Browser storage object.
 * @return {boolean} True when saved.
 */
export function saveQuarantineVault(vault, storage) {
	const store = storage || (typeof window !== 'undefined' && window.localStorage ? window.localStorage : null)
	if (!store || typeof store.setItem !== 'function') {
		return false
	}
	try {
		const clean = {}
		if (vault && typeof vault === 'object') {
			for (const [key, entry] of Object.entries(vault)) {
				if (key && entry && typeof entry === 'object') {
					clean[String(key)] = {
						quarantinedAt: typeof entry.quarantinedAt === 'string' ? entry.quarantinedAt : '',
						reason: typeof entry.reason === 'string' ? entry.reason.slice(0, 140) : 'Manual quarantine hold',
					}
				}
			}
		}
		store.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(clean))
		return true
	} catch (error) {
		return false
	}
}

/**
 * Determine whether a verdict represents a damaged/suspicious file.
 *
 * @param {string} verdict - Structural verdict.
 * @return {boolean} True when damaged or incomplete.
 */
export function isDamagedVerdict(verdict) {
	return (
		verdict === 'zero-byte'
		|| verdict === 'corrupted-header'
		|| verdict === 'html-masquerade'
		|| verdict === 'dead-fill'
		|| verdict === 'truncated-tail'
		|| verdict === 'incomplete-transfer'
	)
}

/**
 * Build the complete quarantine catalog, recovery safety matrix, and summary KPIs
 * from duplicate groups and probed byte telemetry.
 *
 * @param {Array<object>} duplicates - Loaded duplicate groups.
 * @param {object} [options] - Catalog options.
 * @param {object} [options.probeByKey] - Binary probe results keyed by file key.
 * @param {object} [options.quarantineVault] - Quarantined file entries keyed by file key.
 * @param {string} [options.filter='all'] - Active filter category.
 * @param {string} [options.sortBy='severity_desc'] - Active sort mode.
 * @param {string} [options.searchQuery=''] - Filename/folder/verdict search query.
 * @return {object} Normalized quarantine catalog.
 */
export function buildQuarantineCatalog(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const probeByKey = options.probeByKey && typeof options.probeByKey === 'object'
		? options.probeByKey
		: {}
	const quarantineVault = options.quarantineVault && typeof options.quarantineVault === 'object'
		? options.quarantineVault
		: {}
	const filter = QUARANTINE_FILTERS.includes(options.filter) ? options.filter : 'all'
	const sortBy = QUARANTINE_SORTS.includes(options.sortBy) ? options.sortBy : 'severity_desc'
	const query = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const allEntries = []
	const seenKeys = new Set()

	for (let gIdx = 0; gIdx < list.length; gIdx++) {
		const group = list[gIdx]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const groupId = group.id ?? `group-${gIdx}`
		const groupHash = typeof group.hash === 'string' ? group.hash : ''

		const evaluatedFiles = []
		for (let fIdx = 0; fIdx < group.files.length; fIdx++) {
			const file = group.files[fIdx]
			if (!file || typeof file !== 'object') {
				continue
			}
			const key = resolveQuarantineFileKey(file) || `${groupId}:${fIdx}`
			const probe = probeByKey[key] || null
			const integrity = probe && probe.verdict
				? probe
				: inspectFileStructuralIntegrity(null, null, file)
			const path = typeof file.path === 'string' ? file.path : ''
			const name = typeof file.name === 'string' && file.name.trim()
				? file.name.trim()
				: extractBasename(path) || `file-${fIdx + 1}`
			const size = Number.isFinite(Number(file.size)) && Number(file.size) >= 0
				? Number(file.size)
				: 0
			const isProtected = Boolean(file.isProtected || file.inOriginFolder)
			const vaultEntry = quarantineVault[key] || null
			const isQuarantined = Boolean(vaultEntry)

			evaluatedFiles.push({
				key,
				file,
				groupId,
				groupHash,
				name,
				path,
				folder: extractFolderPath(path),
				extension: extractFileExtension(name || path),
				mimetype: typeof file.mimetype === 'string' ? file.mimetype : '',
				size,
				sizeFormatted: formatBytes(size),
				isProtected,
				isQuarantined,
				quarantinedAt: vaultEntry ? vaultEntry.quarantinedAt : '',
				quarantineReason: vaultEntry ? vaultEntry.reason : '',
				integrity,
				isDamaged: isDamagedVerdict(integrity.verdict),
			})
		}

		const healthySiblings = evaluatedFiles.filter(item => !item.isDamaged)
		const totalInGroup = evaluatedFiles.length

		for (const item of evaluatedFiles) {
			if (seenKeys.has(item.key)) {
				continue
			}
			seenKeys.add(item.key)

			const otherHealthyCount = healthySiblings.filter(sib => sib.key !== item.key).length
			const otherCopiesCount = Math.max(0, totalInGroup - 1)
			const hasIntactSurvivor = otherHealthyCount > 0

			let deletionSafetyTier = 'damaged-only-confirm'
			if (item.isProtected) {
				deletionSafetyTier = 'protected-origin-locked'
			} else if (hasIntactSurvivor) {
				deletionSafetyTier = 'safe-has-intact-copy'
			}

			const siblingFiles = evaluatedFiles.map(sib => ({
				key: sib.key,
				name: sib.name,
				path: sib.path,
				folder: sib.folder,
				sizeFormatted: sib.sizeFormatted,
				isCurrent: sib.key === item.key,
				isProtected: sib.isProtected,
				verdict: sib.integrity.verdict,
				isDamaged: sib.isDamaged,
				isQuarantined: sib.isQuarantined,
			}))

			allEntries.push({
				...item,
				otherHealthyCount,
				otherCopiesCount,
				hasIntactSurvivor,
				deletionSafetyTier,
				deletable: !item.isProtected,
				safeAutoSelectable: item.isDamaged && !item.isProtected && hasIntactSurvivor,
				siblings: siblingFiles,
			})
		}
	}

	const summary = {
		totalInspected: allEntries.length,
		damagedCount: 0,
		zeroByteCount: 0,
		corruptedHeaderCount: 0,
		truncatedTailCount: 0,
		incompleteCount: 0,
		healthyCount: 0,
		unprobedCount: 0,
		quarantinedCount: 0,
		safeReclaimableBytes: 0,
		quarantinedBytes: 0,
	}

	for (const entry of allEntries) {
		if (entry.isDamaged) {
			summary.damagedCount += 1
			if (!entry.isProtected) {
				summary.safeReclaimableBytes += entry.size
			}
		}
		if (entry.integrity.verdict === 'zero-byte') {
			summary.zeroByteCount += 1
		} else if (
			entry.integrity.verdict === 'corrupted-header'
			|| entry.integrity.verdict === 'html-masquerade'
			|| entry.integrity.verdict === 'dead-fill'
		) {
			summary.corruptedHeaderCount += 1
		} else if (entry.integrity.verdict === 'truncated-tail') {
			summary.truncatedTailCount += 1
		} else if (entry.integrity.verdict === 'incomplete-transfer') {
			summary.incompleteCount += 1
		} else if (entry.integrity.verdict === 'healthy-verified') {
			summary.healthyCount += 1
		} else {
			summary.unprobedCount += 1
		}

		if (entry.isQuarantined) {
			summary.quarantinedCount += 1
			summary.quarantinedBytes += entry.size
		}
	}

	summary.safeReclaimableFormatted = formatBytes(summary.safeReclaimableBytes)
	summary.quarantinedBytesFormatted = formatBytes(summary.quarantinedBytes)

	const filtered = allEntries.filter(entry => {
		if (filter === 'damaged' && !entry.isDamaged) {
			return false
		}
		if (filter === 'zero-byte' && entry.integrity.verdict !== 'zero-byte') {
			return false
		}
		if (
			filter === 'corrupted-header'
			&& entry.integrity.verdict !== 'corrupted-header'
			&& entry.integrity.verdict !== 'html-masquerade'
			&& entry.integrity.verdict !== 'dead-fill'
		) {
			return false
		}
		if (filter === 'truncated-tail' && entry.integrity.verdict !== 'truncated-tail') {
			return false
		}
		if (filter === 'incomplete-transfer' && entry.integrity.verdict !== 'incomplete-transfer') {
			return false
		}
		if (filter === 'quarantined' && !entry.isQuarantined) {
			return false
		}
		if (filter === 'healthy' && entry.integrity.verdict !== 'healthy-verified') {
			return false
		}
		if (filter === 'unprobed' && entry.integrity.probed) {
			return false
		}

		if (query) {
			const hay = `${entry.name} ${entry.path} ${entry.integrity.verdict} ${entry.integrity.detectedSignature}`.toLowerCase()
			if (!hay.includes(query)) {
				return false
			}
		}
		return true
	})

	filtered.sort((a, b) => {
		if (sortBy === 'size_desc') {
			return b.size - a.size || a.name.localeCompare(b.name)
		}
		if (sortBy === 'integrity_asc') {
			const scoreA = a.integrity.integrityScore === null ? 999 : a.integrity.integrityScore
			const scoreB = b.integrity.integrityScore === null ? 999 : b.integrity.integrityScore
			return scoreA - scoreB || b.size - a.size
		}
		if (sortBy === 'name_asc') {
			return a.name.localeCompare(b.name)
		}
		// Default: severity_desc (quarantined/critical first, then size)
		const rankDiff = (SEVERITY_RANK[b.integrity.severity] || 0) - (SEVERITY_RANK[a.integrity.severity] || 0)
		if (rankDiff !== 0) {
			return rankDiff
		}
		if (a.isQuarantined !== b.isQuarantined) {
			return a.isQuarantined ? -1 : 1
		}
		return b.size - a.size || a.name.localeCompare(b.name)
	})

	return {
		items: filtered,
		allItems: allEntries,
		summary,
		filter,
		sortBy,
	}
}

/**
 * Select all broken/damaged non-protected entries that have at least one intact survivor.
 *
 * @param {object} catalog - Catalog produced by `buildQuarantineCatalog`.
 * @param {object} [options] - Selection options.
 * @param {boolean} [options.includeDamagedOnly=false] - Also include damaged entries without intact siblings.
 * @return {string[]} Array of selected file keys.
 */
export function selectSafeDamagedKeys(catalog, options = {}) {
	if (!catalog || !Array.isArray(catalog.items)) {
		return []
	}
	const includeDamagedOnly = Boolean(options.includeDamagedOnly)
	const keys = []
	for (const item of catalog.items) {
		if (!item || !item.isDamaged || item.isProtected) {
			continue
		}
		if (item.hasIntactSurvivor || includeDamagedOnly) {
			keys.push(item.key)
		}
	}
	return keys
}

/**
 * Export the Quarantine & Structural Integrity audit as a JSON manifest.
 *
 * @param {object} catalog - Catalog produced by `buildQuarantineCatalog`.
 * @param {string} [exportedAt] - ISO timestamp override.
 * @return {string} Pretty-printed JSON manifest.
 */
export function exportQuarantineManifestJson(catalog, exportedAt = new Date().toISOString()) {
	const items = catalog && Array.isArray(catalog.items) ? catalog.items : []
	const summary = catalog && catalog.summary ? catalog.summary : {}
	const payload = {
		schema: QUARANTINE_REPORT_SCHEMA,
		exportedAt,
		summary,
		findings: items.map(item => ({
			key: item.key,
			name: item.name,
			path: item.path,
			size: item.size,
			groupHash: item.groupHash,
			verdict: item.integrity.verdict,
			severity: item.integrity.severity,
			integrityScore: item.integrity.integrityScore,
			detectedSignature: item.integrity.detectedSignature,
			expectedSignature: item.integrity.expectedSignature,
			probed: item.integrity.probed,
			quarantined: item.isQuarantined,
			quarantinedAt: item.quarantinedAt,
			quarantineReason: item.quarantineReason,
			hasIntactSurvivor: item.hasIntactSurvivor,
			deletionSafetyTier: item.deletionSafetyTier,
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export the Quarantine & Structural Integrity audit as a CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} catalog - Catalog produced by `buildQuarantineCatalog`.
 * @return {string} CSV content.
 */
export function exportQuarantineCsv(catalog) {
	const items = catalog && Array.isArray(catalog.items) ? catalog.items : []
	const headers = [
		'Name',
		'Path',
		'SizeBytes',
		'Verdict',
		'Severity',
		'IntegrityScore',
		'DetectedSignature',
		'ExpectedSignature',
		'Quarantined',
		'SafetyTier',
		'GroupHash',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	for (const item of items) {
		rows.push([
			item.name,
			item.path,
			String(item.size),
			item.integrity.verdict,
			item.integrity.severity,
			item.integrity.integrityScore === null ? '' : String(item.integrity.integrityScore),
			item.integrity.detectedSignature,
			item.integrity.expectedSignature,
			item.isQuarantined ? 'yes' : 'no',
			item.deletionSafetyTier,
			item.groupHash,
		].map(escapeCsvCell).join(','))
	}
	return rows.join('\r\n')
}
