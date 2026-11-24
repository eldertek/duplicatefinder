/**
 * Pure Near-Duplicate Media Fidelity & Transcode-Loss Ranker.
 * Clusters cross-format and same-stem near-duplicates across images
 * (RAW/DNG/TIFF/PNG vs JPEG/WebP/HEIC), audio (FLAC/WAV/ALAC vs MP3/AAC/Opus),
 * video (ProRes/MKV/HEVC vs low-bitrate MP4/mobile), and documents
 * (DOCX/LaTeX/Vector PDF vs flattened/scanned PDF), scores true master
 * fidelity (0-100), detects fake-lossless/bloated upscales, enforces
 * master-preservation guardrails, and builds DRY_RUN=1 quarantine scripts
 * plus CWE-1236-safe CSV/JSON audit exports.
 * Zero DOM dependencies, zero XSS sinks, bounded memory/CPU inspection.
 */

import { extractFileExtension } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatBytes } from './duplicateStats'
import { parseImageHeaderAndExif } from './visualMediaInspector'

export const MEDIA_FIDELITY_SCHEMA = 'duplicatefinder.media-fidelity-ranker.v1'

export const MEDIA_FAMILIES = Object.freeze([
	'all',
	'image',
	'audio',
	'video',
	'document',
	'bloat-risk',
])

export const FIDELITY_KEEP_RULES = Object.freeze([
	'true_master',
	'highest_resolution',
	'most_metadata',
	'editable_source',
	'oldest',
])

export const FIDELITY_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'loss_gap_desc',
	'bloat_first',
	'name_asc',
])

const IMAGE_RAW_EXTS = new Set([
	'dng', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'orf', 'rw2', 'pef', 'srw', 'raw', 'iiq', '3fr',
])
const IMAGE_LOSSLESS_EXTS = new Set(['tiff', 'tif', 'psd', 'xcf', 'exr', 'png', 'tga', 'bmp'])
const IMAGE_VECTOR_EXTS = new Set(['svg'])
const IMAGE_MODERN_LOSSY_EXTS = new Set(['heic', 'heif', 'avif', 'jxl', 'webp'])
const IMAGE_LEGACY_LOSSY_EXTS = new Set(['jpg', 'jpeg', 'jpe', 'jfif', 'gif', 'ico'])

const AUDIO_LOSSLESS_EXTS = new Set(['flac', 'wav', 'aiff', 'aif', 'alac', 'ape', 'dsf', 'dff', 'wv'])
const AUDIO_MODERN_LOSSY_EXTS = new Set(['opus', 'm4a', 'aac', 'ogg', 'oga'])
const AUDIO_LEGACY_LOSSY_EXTS = new Set(['mp3', 'wma', 'mp2', 'amr'])

const VIDEO_MASTER_EXTS = new Set(['mxf', 'prores', 'mov', 'mkv', 'm2ts', 'mts'])
const VIDEO_MODERN_EXTS = new Set(['mp4', 'm4v', 'webm'])
const VIDEO_LEGACY_EXTS = new Set(['avi', 'wmv', 'flv', '3gp', 'ogv', 'mpg', 'mpeg'])

const DOC_EDITABLE_EXTS = new Set([
	'tex', 'latex', 'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'md', 'markdown', 'rst', 'adoc', 'epub',
])
const DOC_PDF_EXTS = new Set(['pdf'])
const DOC_LEGACY_EXTS = new Set(['doc', 'xls', 'ppt', 'rtf', 'txt', 'html', 'htm', 'csv'])

const CODEC_PROFILE_TABLE = Object.freeze({
	raw_master: { tier: 4, tierLabel: 'RAW Master', lossless: true, baseScore: 42 },
	vector_master: { tier: 4, tierLabel: 'Vector Master', lossless: true, baseScore: 40 },
	archival_lossless: { tier: 3, tierLabel: 'Lossless Archival', lossless: true, baseScore: 35 },
	editable_source: { tier: 4, tierLabel: 'Editable Source', lossless: true, baseScore: 40 },
	pdf_master: { tier: 3, tierLabel: 'PDF Document', lossless: false, baseScore: 29 },
	mezzanine_video: { tier: 4, tierLabel: 'Mezzanine / Matroska', lossless: false, baseScore: 36 },
	modern_efficient: { tier: 2, tierLabel: 'Modern Lossy', lossless: false, baseScore: 24 },
	lossy_delivery: { tier: 1, tierLabel: 'Legacy Lossy', lossless: false, baseScore: 17 },
	legacy_flattened: { tier: 1, tierLabel: 'Legacy / Flattened', lossless: false, baseScore: 16 },
})

const TRANSCODE_SUFFIX_RE = /(?:[-_\s.](?:compressed|compress|whatsapp|wa\d*|telegram|messenger|signal|insta|instagram|social|web|mobile|small|tiny|low|lite|lq|hq|reencode|reencoded|transcode|transcoded|converted|export|exported|preview|thumb|thumbnail|proxy|scan|scanned|flattened|optimized|opt|upscale|upscaled|upconvert|from[-_](?:mp3|aac|jpg|jpeg|web)|copy|final|\d{3,4}p|\d{2,3}kbps|\d{2,3}k))+$/i
const COPY_INDEX_SUFFIX_RE = /(?:\s*\(\d+\)|\s+copy(?:\s+\d+)?)$/i
const TRANSCODE_PATH_HINT_RE = /(?:^|\/)(?:whatsapp(?:\s+(?:images|audio|video|documents))?|telegram|messenger|signal|downloads|thumbnails|cache|compressed|exports?|proxies|web[-_]?ready|mobile)(?:\/|$)/i
const TRANSCODE_NAME_HINT_RE = /(?:^|[-_.\s])(compressed|whatsapp|wa\d{3,}|telegram|messenger|social|web|mobile|small|low|reencode|transcode|converted|proxy|scanned|flattened|thumb|thumbnail|360p|480p|720p|128k|96k|64k)(?:[-_.\s]|$)/i
const BLOAT_HINT_RE = /(?:^|[-_.\s])(upscale|upscaled|upconvert|from[-_]?mp3|from[-_]?jpg|from[-_]?jpeg|reencode|reencoded|transcode|converted|whatsapp|wa\d{3,})(?:[-_.\s]|$)/i

const MPEG1_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const MPEG2_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const MPEG_SAMPLERATES = {
	3: [44100, 48000, 32000],
	2: [22050, 24000, 16000],
	0: [11025, 12000, 8000],
}

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text rendering.
 *
 * @param {*} raw - Candidate text.
 * @param {number} [maxLen=240] - Maximum length.
 * @return {string} Sanitized plain text.
 */
export function sanitizeFidelityText(raw, maxLen = 240) {
	if (typeof raw !== 'string') {
		return ''
	}
	let cleaned = ''
	for (let i = 0; i < raw.length; i += 1) {
		const code = raw.charCodeAt(i)
		if (code === 0) {
			continue
		}
		cleaned += (code < 32 || code === 127) ? ' ' : raw[i]
	}
	const trimmed = cleaned.replace(/\s+/g, ' ').trim()
	if (trimmed.length <= maxLen) {
		return trimmed
	}
	return `${trimmed.slice(0, Math.max(1, maxLen - 3))}...`
}

/**
 * Coerce a value to a Uint8Array when inline header bytes are available.
 *
 * @param {*} bufferLike - ArrayBuffer, Uint8Array, or byte array.
 * @return {Uint8Array|null} Byte view or null.
 */
function toUint8Array(bufferLike) {
	if (!bufferLike) {
		return null
	}
	if (bufferLike instanceof Uint8Array) {
		return bufferLike
	}
	if (typeof ArrayBuffer !== 'undefined' && bufferLike instanceof ArrayBuffer) {
		return new Uint8Array(bufferLike)
	}
	if (Array.isArray(bufferLike) && bufferLike.length > 0) {
		return Uint8Array.from(bufferLike.slice(0, 65536))
	}
	return null
}

/**
 * Read a 32-bit unsigned big-endian integer safely.
 *
 * @param {Uint8Array} bytes - Byte view.
 * @param {number} offset - Start offset.
 * @return {number} Unsigned integer.
 */
function readUint32BE(bytes, offset) {
	if (!bytes || offset + 3 >= bytes.length) {
		return 0
	}
	return (
		((bytes[offset] << 24) >>> 0)
		+ (bytes[offset + 1] << 16)
		+ (bytes[offset + 2] << 8)
		+ bytes[offset + 3]
	)
}

/**
 * Read a 16-bit unsigned little-endian integer safely.
 *
 * @param {Uint8Array} bytes - Byte view.
 * @param {number} offset - Start offset.
 * @return {number} Unsigned integer.
 */
function readUint16LE(bytes, offset) {
	if (!bytes || offset + 1 >= bytes.length) {
		return 0
	}
	return bytes[offset] + (bytes[offset + 1] << 8)
}

/**
 * Read a 32-bit unsigned little-endian integer safely.
 *
 * @param {Uint8Array} bytes - Byte view.
 * @param {number} offset - Start offset.
 * @return {number} Unsigned integer.
 */
function readUint32LE(bytes, offset) {
	if (!bytes || offset + 3 >= bytes.length) {
		return 0
	}
	return (
		bytes[offset]
		+ (bytes[offset + 1] << 8)
		+ (bytes[offset + 2] << 16)
		+ ((bytes[offset + 3] << 24) >>> 0)
	)
}

/**
 * Decode bounded ASCII characters from bytes for header magic/marker sniffing.
 *
 * @param {Uint8Array} bytes - Byte view.
 * @param {number} [maxBytes=16384] - Maximum slice to decode.
 * @return {string} ASCII-safe preview string.
 */
function bytesToLatin1Preview(bytes, maxBytes = 16384) {
	if (!bytes || bytes.length === 0) {
		return ''
	}
	const limit = Math.min(bytes.length, maxBytes)
	let out = ''
	for (let i = 0; i < limit; i += 1) {
		const b = bytes[i]
		out += (b >= 32 && b <= 126) || b === 10 || b === 13 ? String.fromCharCode(b) : ' '
	}
	return out
}

/**
 * Inspect bounded inline audio/PDF/image header bytes without network side effects.
 *
 * @param {Uint8Array|ArrayBuffer|null} inlineBuffer - Optional file header bytes.
 * @param {string} family - Media family.
 * @param {string} ext - Lowercase file extension without dot.
 * @return {object} Extracted header telemetry.
 */
export function probeMediaHeaderBytes(inlineBuffer, family, ext) {
	const bytes = toUint8Array(inlineBuffer)
	if (!bytes || bytes.length < 4) {
		return {}
	}

	if (family === 'image') {
		try {
			const parsed = parseImageHeaderAndExif(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
			if (parsed && typeof parsed === 'object') {
				const exif = parsed.exif && typeof parsed.exif === 'object' ? parsed.exif : {}
				const hasExif = Boolean(
					exif.make
					|| exif.model
					|| exif.dateTimeOriginal
					|| exif.iso
					|| exif.fNumber
					|| exif.focalLength,
				)
				return {
					width: Number(parsed.width) > 0 ? Number(parsed.width) : 0,
					height: Number(parsed.height) > 0 ? Number(parsed.height) : 0,
					bitDepth: Number(parsed.bitDepth) > 0 ? Number(parsed.bitDepth) : 0,
					hasExif,
					cameraModel: sanitizeFidelityText([exif.make, exif.model].filter(Boolean).join(' '), 80),
					probedFromBytes: true,
				}
			}
		} catch (_error) {
			return {}
		}
		return {}
	}

	if (family === 'audio') {
		// FLAC magic: fLaC + STREAMINFO block
		if (bytes.length >= 42 && bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
			const blockType = bytes[4] & 0x7f
			if (blockType === 0) {
				const sampleRate = ((bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4)) >>> 0
				const channels = ((bytes[20] >> 1) & 0x07) + 1
				const bitsPerSample = (((bytes[20] & 0x01) << 4) | (bytes[21] >> 4)) + 1
				return {
					sampleRate,
					channels,
					bitDepth: bitsPerSample,
					codec: 'FLAC',
					probedFromBytes: true,
				}
			}
		}

		// WAV magic: RIFF....WAVE + fmt chunk
		if (bytes.length >= 44 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
			if (bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) {
				let offset = 12
				while (offset + 8 <= bytes.length) {
					const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
					const chunkSize = readUint32LE(bytes, offset + 4)
					if (chunkId === 'fmt ' && offset + 24 <= bytes.length) {
						const channels = readUint16LE(bytes, offset + 10)
						const sampleRate = readUint32LE(bytes, offset + 12)
						const bitsPerSample = readUint16LE(bytes, offset + 22)
						return {
							sampleRate,
							channels,
							bitDepth: bitsPerSample,
							codec: 'PCM/WAV',
							probedFromBytes: true,
						}
					}
					if (chunkSize === 0) {
						break
					}
					offset += 8 + chunkSize + (chunkSize % 2)
				}
			}
		}

		// MP3: optional ID3v2 header + MPEG frame sync
		let scanStart = 0
		let hasId3 = false
		if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
			hasId3 = true
			const tagSize = ((bytes[6] & 0x7f) << 21)
				| ((bytes[7] & 0x7f) << 14)
				| ((bytes[8] & 0x7f) << 7)
				| (bytes[9] & 0x7f)
			scanStart = Math.min(bytes.length - 4, 10 + tagSize)
		}
		for (let i = Math.max(0, scanStart); i + 3 < bytes.length && i < scanStart + 4096; i += 1) {
			if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) {
				const versionBits = (bytes[i + 1] >> 3) & 0x03
				const layerBits = (bytes[i + 1] >> 1) & 0x03
				const bitrateIdx = (bytes[i + 2] >> 4) & 0x0f
				const sampleRateIdx = (bytes[i + 2] >> 2) & 0x03
				if (versionBits !== 1 && layerBits === 1 && bitrateIdx > 0 && bitrateIdx < 15 && sampleRateIdx < 3) {
					const bitrateKbps = versionBits === 3 ? MPEG1_BITRATES[bitrateIdx] : MPEG2_BITRATES[bitrateIdx]
					const sampleRate = (MPEG_SAMPLERATES[versionBits] || MPEG_SAMPLERATES[3])[sampleRateIdx]
					return {
						bitrateKbps,
						sampleRate,
						hasId3,
						codec: 'MP3',
						probedFromBytes: true,
					}
				}
			}
		}
		if (hasId3) {
			return { hasId3: true, codec: ext.toUpperCase(), probedFromBytes: true }
		}
	}

	if (family === 'document' && ext === 'pdf') {
		const ascii = bytesToLatin1Preview(bytes, 24576)
		if (ascii.startsWith('%PDF-')) {
			const hasFonts = /\/Font\b|\/BaseFont\b/.test(ascii)
			const hasImageStream = /\/DCTDecode\b|\/JPXDecode\b|\/JBIG2Decode\b/.test(ascii)
			const isPdfA = /pdfaid:part|PDF\/A/i.test(ascii)
			const hasXmp = /<x:xmpmeta|\/Metadata\b/.test(ascii)
			const hasOutline = /\/Outlines\b/.test(ascii)
			return {
				hasFonts,
				isScanned: hasImageStream && !hasFonts,
				isPdfA,
				hasXmp,
				hasOutline,
				probedFromBytes: true,
			}
		}
	}

	if (family === 'video') {
		// MP4/MOV ftyp brand inspection
		if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
			const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).trim()
			const boxSize = readUint32BE(bytes, 0)
			return {
				codec: brand === 'qt' ? 'QuickTime/MOV' : brand.toUpperCase(),
				probedFromBytes: boxSize >= 8,
			}
		}
	}

	return {}
}

/**
 * Determine media family from extension and MIME type.
 *
 * @param {string} ext - Lowercase extension without dot.
 * @param {string} mimetype - MIME type string.
 * @return {'image'|'audio'|'video'|'document'|'other'} Media family.
 */
export function resolveMediaFamily(ext, mimetype = '') {
	const normalizedExt = String(ext || '').toLowerCase()
	if (IMAGE_RAW_EXTS.has(normalizedExt)
		|| IMAGE_LOSSLESS_EXTS.has(normalizedExt)
		|| IMAGE_VECTOR_EXTS.has(normalizedExt)
		|| IMAGE_MODERN_LOSSY_EXTS.has(normalizedExt)
		|| IMAGE_LEGACY_LOSSY_EXTS.has(normalizedExt)) {
		return 'image'
	}
	if (AUDIO_LOSSLESS_EXTS.has(normalizedExt)
		|| AUDIO_MODERN_LOSSY_EXTS.has(normalizedExt)
		|| AUDIO_LEGACY_LOSSY_EXTS.has(normalizedExt)) {
		return 'audio'
	}
	if (VIDEO_MASTER_EXTS.has(normalizedExt)
		|| VIDEO_MODERN_EXTS.has(normalizedExt)
		|| VIDEO_LEGACY_EXTS.has(normalizedExt)) {
		return 'video'
	}
	if (DOC_EDITABLE_EXTS.has(normalizedExt)
		|| DOC_PDF_EXTS.has(normalizedExt)
		|| DOC_LEGACY_EXTS.has(normalizedExt)) {
		return 'document'
	}

	const mime = String(mimetype || '').toLowerCase()
	if (mime.startsWith('image/')) {
		return 'image'
	}
	if (mime.startsWith('audio/')) {
		return 'audio'
	}
	if (mime.startsWith('video/')) {
		return 'video'
	}
	if (mime === 'application/pdf' || mime.startsWith('text/')) {
		return 'document'
	}
	return 'other'
}

/**
 * Strip transcode and copy suffixes to compute a canonical stem for near-duplicate clustering.
 *
 * @param {string} fileName - Base file name.
 * @return {{ canonicalStem: string, rawStem: string, suffixHits: string[] }} Stem normalization result.
 */
export function normalizeMediaStem(fileName) {
	const safeName = sanitizeFidelityText(fileName, 200)
	const dotIndex = safeName.lastIndexOf('.')
	const rawStem = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName
	let stem = rawStem.trim()
	const suffixHits = []

	let changed = true
	let guard = 0
	while (changed && guard < 6) {
		changed = false
		guard += 1
		const copyMatch = stem.match(COPY_INDEX_SUFFIX_RE)
		if (copyMatch) {
			suffixHits.push(copyMatch[0].trim())
			stem = stem.slice(0, stem.length - copyMatch[0].length).trim()
			changed = true
		}
		const transcodeMatch = stem.match(TRANSCODE_SUFFIX_RE)
		if (transcodeMatch) {
			suffixHits.push(transcodeMatch[0].trim())
			stem = stem.slice(0, stem.length - transcodeMatch[0].length).trim()
			changed = true
		}
	}

	const canonicalStem = stem
		.toLowerCase()
		.replace(/[\s._-]+/g, '-')
		.replace(/^-+|-+$/g, '') || rawStem.toLowerCase()

	return {
		canonicalStem,
		rawStem,
		suffixHits,
	}
}

/**
 * Resolve codec tier key and display label for a media extension.
 *
 * @param {'image'|'audio'|'video'|'document'|'other'} family - Media family.
 * @param {string} ext - Lowercase extension without dot.
 * @param {object} telemetry - Merged file & probed telemetry.
 * @return {{ profileKey: string, tier: number, tierLabel: string, lossless: boolean, baseScore: number, codecLabel: string }}
 */
function resolveCodecProfile(family, ext, telemetry) {
	let profileKey = 'lossy_delivery'
	if (family === 'image') {
		if (IMAGE_RAW_EXTS.has(ext)) {
			profileKey = 'raw_master'
		} else if (IMAGE_VECTOR_EXTS.has(ext)) {
			profileKey = 'vector_master'
		} else if (IMAGE_LOSSLESS_EXTS.has(ext)) {
			profileKey = 'archival_lossless'
		} else if (IMAGE_MODERN_LOSSY_EXTS.has(ext)) {
			profileKey = 'modern_efficient'
		} else {
			profileKey = 'lossy_delivery'
		}
	} else if (family === 'audio') {
		if (AUDIO_LOSSLESS_EXTS.has(ext)) {
			profileKey = 'archival_lossless'
		} else if (AUDIO_MODERN_LOSSY_EXTS.has(ext)) {
			profileKey = 'modern_efficient'
		} else {
			profileKey = 'lossy_delivery'
		}
	} else if (family === 'video') {
		if (VIDEO_MASTER_EXTS.has(ext)) {
			profileKey = 'mezzanine_video'
		} else if (VIDEO_MODERN_EXTS.has(ext)) {
			profileKey = 'modern_efficient'
		} else {
			profileKey = 'legacy_flattened'
		}
	} else if (family === 'document') {
		if (DOC_EDITABLE_EXTS.has(ext)) {
			profileKey = 'editable_source'
		} else if (DOC_PDF_EXTS.has(ext)) {
			profileKey = 'pdf_master'
		} else {
			profileKey = 'legacy_flattened'
		}
	}

	const profile = CODEC_PROFILE_TABLE[profileKey] || CODEC_PROFILE_TABLE.lossy_delivery
	const codecText = sanitizeFidelityText(String(telemetry.codec || ''), 40)
	const codecLabel = codecText
		? `${ext.toUpperCase()} (${codecText})`
		: (ext ? ext.toUpperCase() : 'UNKNOWN')

	return {
		profileKey,
		tier: profile.tier,
		tierLabel: profile.tierLabel,
		lossless: profile.lossless,
		baseScore: profile.baseScore,
		codecLabel,
	}
}

/**
 * Inspect protection flags on a Nextcloud duplicate file entry.
 *
 * @param {object} file - File object.
 * @param {string} normalizedPath - Normalized path.
 * @return {{ protectedOrigin: boolean, locked: boolean, readOnly: boolean, isProtected: boolean }}
 */
function resolveEntryProtection(file, normalizedPath) {
	const protectedOrigin = Boolean(
		file.isOriginFolder
		|| file.protectedOrigin
		|| file.originProtected
		|| file.inOriginFolder,
	)
	const locked = Boolean(file.locked || file.isLocked || file.lockType)
	const permMask = typeof file.permissions === 'number' ? file.permissions : null
	const readOnlyByMask = permMask !== null && (permMask & 8) === 0
	const readOnly = Boolean(
		file.readOnly
		|| file.isReadOnly
		|| readOnlyByMask
		|| /\/shared-ro\//i.test(normalizedPath),
	)
	return {
		protectedOrigin,
		locked,
		readOnly,
		isProtected: protectedOrigin || locked || readOnly,
	}
}

/**
 * Extract owner identifier from a Nextcloud path or file record.
 *
 * @param {object} file - File entry.
 * @param {string} normalizedPath - Normalized file path.
 * @return {string} Owner label.
 */
function resolveOwner(file, normalizedPath) {
	if (typeof file.owner === 'string' && file.owner.trim()) {
		return sanitizeFidelityText(file.owner, 64)
	}
	if (typeof file.userId === 'string' && file.userId.trim()) {
		return sanitizeFidelityText(file.userId, 64)
	}
	const match = normalizedPath.match(/^\/([^/]+)\/files(?:\/|$)/)
	if (match && match[1]) {
		return sanitizeFidelityText(match[1], 64)
	}
	return 'admin'
}

/**
 * Classify a single media duplicate entry with metadata, codec tier, stem, and transcode clues.
 *
 * @param {object} file - Raw duplicate file entry.
 * @param {object} [group] - Parent duplicate group.
 * @return {object|null} Classified entry or null when not a supported media entry.
 */
export function classifyMediaEntry(file, group = null) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const rawPath = sanitizeFidelityText(String(file.path || file.name || ''), 480)
	if (!rawPath) {
		return null
	}
	const normalizedPath = normalizePathForDiff(rawPath) || rawPath
	const slashIndex = normalizedPath.lastIndexOf('/')
	const fileName = slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) : normalizedPath
	const parentDir = slashIndex > 0 ? normalizedPath.slice(0, slashIndex) : '/'
	const ext = extractFileExtension(fileName, file.mimetype || file.mime || '')
	const family = resolveMediaFamily(ext, file.mimetype || file.mime || '')
	if (family === 'other') {
		return null
	}

	const probedBytes = probeMediaHeaderBytes(file.inlineBuffer || file.headerBytes || null, family, ext)
	const metaObj = file.metadata && typeof file.metadata === 'object' ? file.metadata : {}
	const telemetry = {
		width: Number(file.width || metaObj.width || probedBytes.width || 0) || 0,
		height: Number(file.height || metaObj.height || probedBytes.height || 0) || 0,
		bitDepth: Number(file.bitDepth || metaObj.bitDepth || probedBytes.bitDepth || 0) || 0,
		sampleRate: Number(file.sampleRate || metaObj.sampleRate || probedBytes.sampleRate || 0) || 0,
		bitrateKbps: Number(file.bitrateKbps || file.bitrate || metaObj.bitrateKbps || probedBytes.bitrateKbps || 0) || 0,
		channels: Number(file.channels || metaObj.channels || probedBytes.channels || 0) || 0,
		durationSec: Number(file.durationSec || file.duration || metaObj.durationSec || 0) || 0,
		pageCount: Number(file.pageCount || metaObj.pageCount || 0) || 0,
		hasExif: Boolean(file.hasExif || metaObj.hasExif || probedBytes.hasExif || file.cameraModel || metaObj.cameraModel || probedBytes.cameraModel),
		hasId3: Boolean(file.hasId3 || metaObj.hasId3 || probedBytes.hasId3 || file.artist || metaObj.artist || file.album || metaObj.album),
		hasXmp: Boolean(file.hasXmp || metaObj.hasXmp || probedBytes.hasXmp),
		hasFonts: file.hasFonts !== undefined ? Boolean(file.hasFonts) : Boolean(metaObj.hasFonts || probedBytes.hasFonts),
		isScanned: Boolean(file.isScanned || metaObj.isScanned || probedBytes.isScanned),
		isPdfA: Boolean(file.isPdfA || metaObj.isPdfA || probedBytes.isPdfA),
		hasOutline: Boolean(file.hasOutline || metaObj.hasOutline || probedBytes.hasOutline),
		cameraModel: sanitizeFidelityText(String(file.cameraModel || metaObj.cameraModel || probedBytes.cameraModel || ''), 80),
		codec: sanitizeFidelityText(String(file.codec || metaObj.codec || probedBytes.codec || ''), 40),
		probedFromBytes: Boolean(probedBytes.probedFromBytes),
	}

	const stemInfo = normalizeMediaStem(fileName)
	const codecProfile = resolveCodecProfile(family, ext, telemetry)
	const sizeBytes = Math.max(0, Number(file.size ?? (group ? group.size : 0)) || 0)
	const mtime = Number(file.mtime || file.modified || 0) || 0
	const protection = resolveEntryProtection(file, normalizedPath)

	const pathHint = TRANSCODE_PATH_HINT_RE.test(normalizedPath)
	const nameHint = TRANSCODE_NAME_HINT_RE.test(fileName) || stemInfo.suffixHits.length > 0
	const bloatHint = BLOAT_HINT_RE.test(fileName) || BLOAT_HINT_RE.test(normalizedPath)

	const transcodeSignals = []
	if (stemInfo.suffixHits.length > 0) {
		transcodeSignals.push(`suffix:${stemInfo.suffixHits.join(',')}`)
	}
	if (pathHint) {
		transcodeSignals.push('social-or-export-folder')
	}
	if (nameHint && stemInfo.suffixHits.length === 0) {
		transcodeSignals.push('transcode-filename-marker')
	}
	if (telemetry.isScanned) {
		transcodeSignals.push('scanned-raster-pdf')
	}

	return {
		selectionKey: getFileSelectionKey(file) || normalizedPath,
		rawFile: file,
		groupId: group && group.id !== undefined ? group.id : null,
		groupHash: group && group.hash ? String(group.hash) : '',
		normalizedPath,
		parentDir,
		fileName,
		owner: resolveOwner(file, normalizedPath),
		ext,
		family,
		sizeBytes,
		sizeFormatted: formatBytes(sizeBytes),
		mtime,
		canonicalStem: stemInfo.canonicalStem,
		rawStem: stemInfo.rawStem,
		suffixHits: stemInfo.suffixHits,
		codecProfile,
		telemetry,
		protection,
		transcodeSignals,
		hasTranscodeHint: transcodeSignals.length > 0,
		hasBloatNameHint: bloatHint,
	}
}

/**
 * Score an individual classified media entry against its cluster peers.
 *
 * @param {object} entry - Classified media entry.
 * @param {object} clusterContext - Peer statistics for the cluster.
 * @return {object} Fidelity score breakdown, bloat warning, and grade.
 */
export function scoreMediaEntry(entry, clusterContext = {}) {
	const {
		maxBytes = entry.sizeBytes,
		maxMegapixels = 0,
		maxAudioBitrate = 0,
		maxSampleRate = 0,
		hasSmallerLossyPeer = false,
		smallestLossyBytes = 0,
		hasEditableOrVectorDocPeer = false,
		smallestEditableDocBytes = 0,
	} = clusterContext

	const t = entry.telemetry
	const cp = entry.codecProfile
	let codecScore = cp.baseScore
	let resolutionBitrateScore = 0
	let metadataCompletenessScore = 0
	let lineageAdjustment = 0

	if (entry.family === 'image') {
		const megapixels = (t.width > 0 && t.height > 0) ? (t.width * t.height) / 1000000 : 0
		if (megapixels > 0 && maxMegapixels > 0) {
			resolutionBitrateScore = Math.round(Math.min(24, (megapixels / maxMegapixels) * 24))
		} else if (maxBytes > 0) {
			resolutionBitrateScore = Math.round(Math.min(18, (entry.sizeBytes / maxBytes) * 18))
		}
		if (t.bitDepth >= 12) {
			resolutionBitrateScore = Math.min(28, resolutionBitrateScore + 4)
		} else if (t.bitDepth >= 10) {
			resolutionBitrateScore = Math.min(28, resolutionBitrateScore + 2)
		}
		if (t.hasExif) {
			metadataCompletenessScore += 10
		}
		if (t.cameraModel) {
			metadataCompletenessScore += 5
		}
		if (t.hasXmp) {
			metadataCompletenessScore += 3
		}
	} else if (entry.family === 'audio') {
		if (cp.lossless) {
			resolutionBitrateScore = 20
			if (t.sampleRate >= 96000) {
				resolutionBitrateScore += 4
			} else if (t.sampleRate >= 44100) {
				resolutionBitrateScore += 2
			}
			if (t.bitDepth >= 24) {
				resolutionBitrateScore += 4
			} else if (t.bitDepth >= 16) {
				resolutionBitrateScore += 2
			}
		} else if (t.bitrateKbps > 0) {
			const denom = Math.max(320, maxAudioBitrate || 320)
			resolutionBitrateScore = Math.round(Math.min(22, (t.bitrateKbps / denom) * 22))
			if (t.sampleRate >= 44100) {
				resolutionBitrateScore = Math.min(24, resolutionBitrateScore + 2)
			}
		} else if (maxBytes > 0) {
			resolutionBitrateScore = Math.round(Math.min(16, (entry.sizeBytes / maxBytes) * 16))
		}
		if (t.hasId3) {
			metadataCompletenessScore += 12
		}
		if (t.hasXmp) {
			metadataCompletenessScore += 3
		}
		if (t.channels >= 2) {
			metadataCompletenessScore += 3
		}
	} else if (entry.family === 'video') {
		const megapixels = (t.width > 0 && t.height > 0) ? (t.width * t.height) / 1000000 : 0
		if (megapixels > 0 && maxMegapixels > 0) {
			resolutionBitrateScore = Math.round(Math.min(22, (megapixels / maxMegapixels) * 22))
		} else if (maxBytes > 0) {
			resolutionBitrateScore = Math.round(Math.min(16, (entry.sizeBytes / maxBytes) * 16))
		}
		if (t.bitrateKbps >= 15000) {
			resolutionBitrateScore = Math.min(28, resolutionBitrateScore + 6)
		} else if (t.bitrateKbps >= 5000) {
			resolutionBitrateScore = Math.min(28, resolutionBitrateScore + 3)
		}
		if (t.hasXmp || t.codec) {
			metadataCompletenessScore += 8
		}
		if (t.durationSec > 0) {
			metadataCompletenessScore += 4
		}
	} else if (entry.family === 'document') {
		if (cp.profileKey === 'editable_source') {
			resolutionBitrateScore = 24
			metadataCompletenessScore = 14
		} else if (entry.ext === 'pdf') {
			if (t.isPdfA) {
				codecScore = Math.min(40, codecScore + 6)
			}
			if (t.hasFonts && !t.isScanned) {
				resolutionBitrateScore = 22
				metadataCompletenessScore += 10
			} else if (t.isScanned) {
				resolutionBitrateScore = 10
				lineageAdjustment -= 12
			} else {
				resolutionBitrateScore = 16
				metadataCompletenessScore += 6
			}
			if (t.hasOutline) {
				metadataCompletenessScore += 4
			}
			if (t.hasXmp) {
				metadataCompletenessScore += 4
			}
		} else {
			resolutionBitrateScore = 12
			metadataCompletenessScore = 6
		}
	}

	// Lineage & transcode signal adjustments
	if (entry.suffixHits.length > 0) {
		lineageAdjustment -= Math.min(18, entry.suffixHits.length * 9)
	}
	if (entry.transcodeSignals.includes('social-or-export-folder')) {
		lineageAdjustment -= 10
	}
	if (entry.transcodeSignals.includes('transcode-filename-marker')) {
		lineageAdjustment -= 8
	}
	if (entry.protection.protectedOrigin) {
		lineageAdjustment += 8
	}

	// Fake-lossless / bloated upscale detection
	let isBloatedUpscale = false
	let bloatReason = ''

	if (entry.family === 'audio' && cp.lossless) {
		if (entry.hasBloatNameHint) {
			isBloatedUpscale = true
			bloatReason = 'Lossless container carries lossy-reencode filename or folder markers.'
		} else if ((t.sampleRate > 0 && t.sampleRate <= 22050) || (t.bitDepth > 0 && t.bitDepth <= 8)) {
			isBloatedUpscale = true
			bloatReason = `Low PCM resolution (${t.sampleRate || '?'} Hz / ${t.bitDepth || '?'}-bit) in lossless container suggests upscaled source.`
		} else if (maxSampleRate > 0 && t.sampleRate > 0 && t.sampleRate < maxSampleRate && hasSmallerLossyPeer) {
			isBloatedUpscale = true
			bloatReason = 'Lower sample rate than cluster peers despite lossless wrapper.'
		}
	} else if (entry.family === 'image' && cp.lossless && !IMAGE_RAW_EXTS.has(entry.ext) && !IMAGE_VECTOR_EXTS.has(entry.ext)) {
		if (entry.hasBloatNameHint) {
			isBloatedUpscale = true
			bloatReason = 'Lossless raster container carries re-encode/upscale markers.'
		} else if (hasSmallerLossyPeer && smallestLossyBytes > 0 && entry.sizeBytes >= smallestLossyBytes * 3.5 && t.bitDepth <= 8 && !t.hasExif) {
			isBloatedUpscale = true
			bloatReason = '8-bit lossless raster without EXIF is >3.5x larger than clean lossy peer (likely re-saved PNG/TIFF bloat).'
		}
	} else if (entry.family === 'document' && entry.ext === 'pdf' && t.isScanned) {
		if (hasEditableOrVectorDocPeer && smallestEditableDocBytes > 0 && entry.sizeBytes >= smallestEditableDocBytes * 2) {
			isBloatedUpscale = true
			bloatReason = 'Scanned image-only PDF is >2x larger than editable/vector source document.'
		}
	}

	if (isBloatedUpscale) {
		lineageAdjustment -= 26
	}

	const rawTotal = codecScore + resolutionBitrateScore + metadataCompletenessScore + lineageAdjustment
	const fidelityScore = Math.max(5, Math.min(100, Math.round(rawTotal)))

	let grade = 'transcoded-copy'
	if (isBloatedUpscale) {
		grade = 'bloated-upscale'
	} else if (fidelityScore >= 82 && cp.lossless) {
		grade = 'master-lossless'
	} else if (fidelityScore >= 68) {
		grade = 'near-lossless'
	} else if (fidelityScore < 42) {
		grade = 'heavily-degraded'
	}

	return {
		fidelityScore,
		grade,
		isBloatedUpscale,
		bloatReason,
		breakdown: {
			codecScore,
			resolutionBitrateScore,
			metadataCompletenessScore,
			lineageAdjustment,
		},
	}
}

/**
 * Choose the winning master entry in a cluster according to keepRule and bloat guardrails.
 *
 * @param {Array<object>} scoredEntries - Scored entries in the cluster.
 * @param {string} keepRule - One of FIDELITY_KEEP_RULES.
 * @return {object} Surviving master entry.
 */
function pickClusterMaster(scoredEntries, keepRule) {
	const sorted = [...scoredEntries].sort((a, b) => {
		// Always push confirmed fake-lossless bloat down when picking true master
		if (a.scoring.isBloatedUpscale !== b.scoring.isBloatedUpscale) {
			return a.scoring.isBloatedUpscale ? 1 : -1
		}

		if (keepRule === 'highest_resolution') {
			const pxA = a.telemetry.width * a.telemetry.height
			const pxB = b.telemetry.width * b.telemetry.height
			if (pxA !== pxB) {
				return pxB - pxA
			}
			const brA = a.telemetry.bitrateKbps || a.telemetry.sampleRate
			const brB = b.telemetry.bitrateKbps || b.telemetry.sampleRate
			if (brA !== brB) {
				return brB - brA
			}
		} else if (keepRule === 'most_metadata') {
			if (a.scoring.breakdown.metadataCompletenessScore !== b.scoring.breakdown.metadataCompletenessScore) {
				return b.scoring.breakdown.metadataCompletenessScore - a.scoring.breakdown.metadataCompletenessScore
			}
		} else if (keepRule === 'editable_source') {
			if (a.codecProfile.tier !== b.codecProfile.tier) {
				return b.codecProfile.tier - a.codecProfile.tier
			}
		} else if (keepRule === 'oldest') {
			if (a.mtime > 0 && b.mtime > 0 && a.mtime !== b.mtime) {
				return a.mtime - b.mtime
			}
		}

		if (a.scoring.fidelityScore !== b.scoring.fidelityScore) {
			return b.scoring.fidelityScore - a.scoring.fidelityScore
		}
		if (a.protection.protectedOrigin !== b.protection.protectedOrigin) {
			return a.protection.protectedOrigin ? -1 : 1
		}
		if (a.codecProfile.tier !== b.codecProfile.tier) {
			return b.codecProfile.tier - a.codecProfile.tier
		}
		return a.normalizedPath.localeCompare(b.normalizedPath)
	})
	return sorted[0]
}

/**
 * Format grade into human-readable label.
 *
 * @param {string} grade - Grade identifier.
 * @return {string} Display label.
 */
export function formatFidelityGrade(grade) {
	const labels = {
		'master-lossless': 'Master Lossless',
		'near-lossless': 'Near-Lossless',
		'transcoded-copy': 'Transcoded Copy',
		'heavily-degraded': 'Heavily Degraded',
		'bloated-upscale': 'Bloated Upscale',
	}
	return labels[grade] || grade
}

/**
 * Analyze duplicate groups into cross-format near-duplicate media fidelity clusters.
 *
 * @param {Array<object>} duplicates - Duplicate groups from Nextcloud DuplicateFinder store.
 * @param {object} [options] - Analysis options and filters.
 * @return {object} Complete fidelity ranker report.
 */
export function analyzeMediaFidelity(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const familyFilter = MEDIA_FAMILIES.includes(options.familyFilter) ? options.familyFilter : 'all'
	const keepRule = FIDELITY_KEEP_RULES.includes(options.keepRule) ? options.keepRule : 'true_master'
	const sortMode = FIDELITY_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'reclaim_desc'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const minLossPct = Math.max(0, Math.min(100, Number(options.minLossPct) || 0))
	const minSizeBytes = Math.max(0, Number(options.minSizeBytes) || 0)
	const protectLastMaster = options.protectLastMaster !== false
	const holdLossyOnly = Boolean(options.holdLossyOnly)
	const flagFakeLosslessBloat = options.flagFakeLosslessBloat !== false

	const clusterBuckets = new Map()
	const groupMediaEntries = new Map()
	const seenKeys = new Set()

	for (const group of list) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const groupKeyPrefix = group.id !== null && group.id !== undefined ? `group:${group.id}` : ''
		for (const file of group.files) {
			const entry = classifyMediaEntry(file, group)
			if (!entry) {
				continue
			}
			const dedupKey = `${entry.selectionKey}::${entry.normalizedPath}`
			if (seenKeys.has(dedupKey)) {
				continue
			}
			seenKeys.add(dedupKey)

			const bucketKey = `${entry.family}::${entry.canonicalStem}`
			if (!clusterBuckets.has(bucketKey)) {
				clusterBuckets.set(bucketKey, [])
			}
			clusterBuckets.get(bucketKey).push(entry)

			if (groupKeyPrefix) {
				const gk = `${groupKeyPrefix}::${entry.family}`
				if (!groupMediaEntries.has(gk)) {
					groupMediaEntries.set(gk, [])
				}
				groupMediaEntries.get(gk).push(entry)
			}
		}
	}

	// Preserve intra-group duplicate pairs whose filenames differ beyond transcode suffix stripping
	for (const [groupBucketKey, gEntries] of groupMediaEntries.entries()) {
		if (gEntries.length < 2) {
			continue
		}
		const existingStemTarget = gEntries
			.map(e => `${e.family}::${e.canonicalStem}`)
			.find(k => (clusterBuckets.get(k) || []).length >= 2)
		const orphanEntries = gEntries.filter(entry => {
			const stemBucket = clusterBuckets.get(`${entry.family}::${entry.canonicalStem}`)
			return !stemBucket || stemBucket.length < 2
		})
		if (orphanEntries.length === 0) {
			continue
		}
		if (existingStemTarget) {
			const targetBucket = clusterBuckets.get(existingStemTarget)
			for (const entry of orphanEntries) {
				const stemKey = `${entry.family}::${entry.canonicalStem}`
				clusterBuckets.delete(stemKey)
				targetBucket.push(entry)
			}
		} else {
			for (const entry of gEntries) {
				const stemKey = `${entry.family}::${entry.canonicalStem}`
				const existing = clusterBuckets.get(stemKey)
				if (existing && existing.length === 1) {
					clusterBuckets.delete(stemKey)
				}
			}
			clusterBuckets.set(groupBucketKey, gEntries)
		}
	}

	const allClusters = []

	for (const [clusterKey, rawEntries] of clusterBuckets.entries()) {
		if (rawEntries.length < 2) {
			continue
		}

		// Compute cluster context for comparative scoring & bloat detection
		let maxBytes = 0
		let maxMegapixels = 0
		let maxAudioBitrate = 0
		let maxSampleRate = 0
		let hasSmallerLossyPeer = false
		let smallestLossyBytes = Infinity
		let hasEditableOrVectorDocPeer = false
		let smallestEditableDocBytes = Infinity

		for (const entry of rawEntries) {
			if (entry.sizeBytes > maxBytes) {
				maxBytes = entry.sizeBytes
			}
			const mp = (entry.telemetry.width > 0 && entry.telemetry.height > 0)
				? (entry.telemetry.width * entry.telemetry.height) / 1000000
				: 0
			if (mp > maxMegapixels) {
				maxMegapixels = mp
			}
			if (entry.telemetry.bitrateKbps > maxAudioBitrate) {
				maxAudioBitrate = entry.telemetry.bitrateKbps
			}
			if (entry.telemetry.sampleRate > maxSampleRate) {
				maxSampleRate = entry.telemetry.sampleRate
			}
			if (!entry.codecProfile.lossless && entry.sizeBytes > 0) {
				hasSmallerLossyPeer = true
				if (entry.sizeBytes < smallestLossyBytes) {
					smallestLossyBytes = entry.sizeBytes
				}
			}
			if (entry.codecProfile.profileKey === 'editable_source'
				|| (entry.ext === 'pdf' && entry.telemetry.hasFonts && !entry.telemetry.isScanned)) {
				hasEditableOrVectorDocPeer = true
				if (entry.sizeBytes > 0 && entry.sizeBytes < smallestEditableDocBytes) {
					smallestEditableDocBytes = entry.sizeBytes
				}
			}
		}

		const clusterContext = {
			maxBytes,
			maxMegapixels,
			maxAudioBitrate,
			maxSampleRate,
			hasSmallerLossyPeer,
			smallestLossyBytes: Number.isFinite(smallestLossyBytes) ? smallestLossyBytes : 0,
			hasEditableOrVectorDocPeer,
			smallestEditableDocBytes: Number.isFinite(smallestEditableDocBytes) ? smallestEditableDocBytes : 0,
		}

		const scoredEntries = rawEntries.map(entry => {
			const scoring = scoreMediaEntry(entry, clusterContext)
			return {
				...entry,
				scoring,
			}
		})

		const masterEntry = pickClusterMaster(scoredEntries, keepRule)
		const masterScore = masterEntry.scoring.fidelityScore
		const hasLosslessMaster = scoredEntries.some(e => e.codecProfile.lossless && !e.scoring.isBloatedUpscale)
		const hasBloatRisk = flagFakeLosslessBloat && scoredEntries.some(e => e.scoring.isBloatedUpscale)

		const evaluatedEntries = scoredEntries
			.map(entry => {
				const isMaster = entry.selectionKey === masterEntry.selectionKey
					&& entry.normalizedPath === masterEntry.normalizedPath
				const lossDelta = Math.max(0, masterScore - entry.scoring.fidelityScore)
				const transcodeLossPct = masterScore > 0
					? Math.min(100, Math.round((lossDelta / masterScore) * 100))
					: 0

				let actionVerdict = 'quarantine-lossy'
				let verdictLabel = 'Quarantine Copy'
				let canQuarantine = true
				let reason = `Score ${entry.scoring.fidelityScore}/100 (-${transcodeLossPct}% fidelity vs master ${masterEntry.fileName}).`

				if (isMaster) {
					actionVerdict = 'keep-master'
					verdictLabel = 'Keep Master'
					canQuarantine = false
					reason = entry.codecProfile.lossless
						? `Highest-fidelity lossless master (${entry.scoring.fidelityScore}/100, ${entry.codecProfile.codecLabel}).`
						: `Best available survivor in cluster (${entry.scoring.fidelityScore}/100, ${entry.codecProfile.codecLabel}).`
				} else if (entry.protection.protectedOrigin) {
					actionVerdict = 'protected-hold'
					verdictLabel = 'Origin Protected'
					canQuarantine = false
					reason = 'Protected Origin folder cannot be quarantined automatically.'
				} else if (entry.protection.locked) {
					actionVerdict = 'protected-hold'
					verdictLabel = 'Locked File'
					canQuarantine = false
					reason = 'File is locked by Nextcloud lock/retention policy.'
				} else if (entry.protection.readOnly) {
					actionVerdict = 'protected-hold'
					verdictLabel = 'Read-Only'
					canQuarantine = false
					reason = 'Missing DELETE permission bit on file or share mount.'
				} else if (holdLossyOnly && !hasLosslessMaster) {
					actionVerdict = 'protected-hold'
					verdictLabel = 'Lossy-Only Hold'
					canQuarantine = false
					reason = 'No true lossless master in cluster; held by Lossy-Only safety guardrail.'
				} else if (protectLastMaster && entry.codecProfile.tier > masterEntry.codecProfile.tier && !entry.scoring.isBloatedUpscale) {
					actionVerdict = 'protected-hold'
					verdictLabel = 'Higher-Tier Guard'
					canQuarantine = false
					reason = `Higher codec tier (${entry.codecProfile.tierLabel}) than selected survivor; protected until verified.`
				} else if (flagFakeLosslessBloat && entry.scoring.isBloatedUpscale) {
					actionVerdict = 'review-bloat'
					verdictLabel = 'Bloated Upscale'
					canQuarantine = true
					reason = entry.scoring.bloatReason || 'Suspicious upscaled lossless container.'
				}

				return {
					...entry,
					isMaster,
					transcodeLossPct,
					decision: {
						actionVerdict,
						verdictLabel,
						canQuarantine,
						reason,
					},
				}
			})
			.sort((a, b) => {
				if (a.isMaster !== b.isMaster) {
					return a.isMaster ? -1 : 1
				}
				return b.scoring.fidelityScore - a.scoring.fidelityScore
			})

		const quarantineEntries = evaluatedEntries.filter(e => e.decision.canQuarantine)
		const protectedEntries = evaluatedEntries.filter(e => !e.isMaster && !e.decision.canQuarantine)
		const safeReclaimBytes = quarantineEntries.reduce((sum, e) => sum + e.sizeBytes, 0)
		const maxLossPct = evaluatedEntries.reduce((max, e) => Math.max(max, e.transcodeLossPct), 0)
		const totalClusterBytes = evaluatedEntries.reduce((sum, e) => sum + e.sizeBytes, 0)

		let topVerdict = 'master-ready'
		if (hasBloatRisk) {
			topVerdict = 'bloat-alert'
		} else if (!hasLosslessMaster) {
			topVerdict = 'lossy-only'
		} else if (quarantineEntries.length === 0) {
			topVerdict = 'protected-hold'
		}

		const evaluatedMaster = evaluatedEntries.find(e => e.isMaster) || evaluatedEntries[0]
		const firstGroupEntry = evaluatedEntries.find(e => e.groupId !== null) || evaluatedEntries[0]
		const rawGroup = list.find(g => g && g.id === firstGroupEntry.groupId) || {
			id: firstGroupEntry.groupId,
			hash: firstGroupEntry.groupHash,
			files: evaluatedEntries.map(e => e.rawFile),
		}

		allClusters.push({
			clusterKey,
			family: evaluatedMaster.family,
			canonicalStem: evaluatedMaster.canonicalStem,
			primaryName: evaluatedMaster.fileName,
			primaryPath: evaluatedMaster.normalizedPath,
			groupId: firstGroupEntry.groupId,
			rawGroup,
			masterEntry: evaluatedMaster,
			entries: evaluatedEntries,
			quarantineEntries,
			protectedEntries,
			hasLosslessMaster,
			hasBloatRisk,
			topVerdict,
			maxLossPct,
			safeReclaimBytes,
			safeReclaimFormatted: formatBytes(safeReclaimBytes),
			totalClusterBytes,
			totalClusterFormatted: formatBytes(totalClusterBytes),
		})
	}

	const filteredClusters = allClusters.filter(cluster => {
		if (familyFilter === 'bloat-risk') {
			if (!cluster.hasBloatRisk) {
				return false
			}
		} else if (familyFilter !== 'all' && cluster.family !== familyFilter) {
			return false
		}

		if (minLossPct > 0 && cluster.maxLossPct < minLossPct) {
			return false
		}
		if (minSizeBytes > 0 && cluster.safeReclaimBytes < minSizeBytes) {
			return false
		}
		if (searchQuery) {
			const hay = [
				cluster.primaryName,
				cluster.canonicalStem,
				cluster.family,
				...cluster.entries.map(e => `${e.normalizedPath} ${e.codecProfile.codecLabel} ${e.owner}`),
			].join(' ').toLowerCase()
			if (!hay.includes(searchQuery)) {
				return false
			}
		}
		return true
	})

	filteredClusters.sort((a, b) => {
		if (sortMode === 'loss_gap_desc') {
			if (b.maxLossPct !== a.maxLossPct) {
				return b.maxLossPct - a.maxLossPct
			}
		} else if (sortMode === 'bloat_first') {
			if (a.hasBloatRisk !== b.hasBloatRisk) {
				return a.hasBloatRisk ? -1 : 1
			}
		} else if (sortMode === 'name_asc') {
			return a.primaryName.localeCompare(b.primaryName)
		}
		if (b.safeReclaimBytes !== a.safeReclaimBytes) {
			return b.safeReclaimBytes - a.safeReclaimBytes
		}
		return a.primaryName.localeCompare(b.primaryName)
	})

	const safeReclaimBytes = filteredClusters.reduce((sum, c) => sum + c.safeReclaimBytes, 0)
	const safeQuarantineCount = filteredClusters.reduce((sum, c) => sum + c.quarantineEntries.length, 0)
	const totalFiles = filteredClusters.reduce((sum, c) => sum + c.entries.length, 0)
	const masterReadyCount = filteredClusters.filter(c => c.topVerdict === 'master-ready').length
	const bloatAlertCount = filteredClusters.filter(c => c.hasBloatRisk).length
	const lossyOnlyCount = filteredClusters.filter(c => !c.hasLosslessMaster).length
	const protectedHoldCount = filteredClusters.filter(c => c.topVerdict === 'protected-hold').length
	const avgLossPct = filteredClusters.length > 0
		? Math.round(filteredClusters.reduce((sum, c) => sum + c.maxLossPct, 0) / filteredClusters.length)
		: 0

	return {
		schema: MEDIA_FIDELITY_SCHEMA,
		generatedAt: new Date().toISOString(),
		options: {
			familyFilter,
			keepRule,
			sortMode,
			minLossPct,
			minSizeBytes,
			protectLastMaster,
			holdLossyOnly,
			flagFakeLosslessBloat,
		},
		summary: {
			totalClusters: filteredClusters.length,
			unfilteredClusters: allClusters.length,
			totalFiles,
			masterReadyCount,
			bloatAlertCount,
			lossyOnlyCount,
			protectedHoldCount,
			safeQuarantineCount,
			safeReclaimBytes,
			safeReclaimFormatted: formatBytes(safeReclaimBytes),
			avgLossPct,
		},
		items: filteredClusters,
	}
}

/**
 * Collect safe-to-quarantine/delete file objects while ensuring at least one master survivor remains per cluster.
 *
 * @param {object} report - Output from analyzeMediaFidelity().
 * @param {object} [options] - Target cluster filter.
 * @return {{ files: Array<object>, totalBytes: number, totalFormatted: string, skippedProtectedCount: number }}
 */
export function collectSafeFidelitySelection(report, options = {}) {
	if (!report || !Array.isArray(report.items)) {
		return {
			files: [],
			totalBytes: 0,
			totalFormatted: '0 B',
			skippedProtectedCount: 0,
		}
	}

	const targetClusterKey = options.targetClusterKey || null
	const files = []
	const seen = new Set()
	let totalBytes = 0
	let skippedProtectedCount = 0

	for (const cluster of report.items) {
		if (targetClusterKey && cluster.clusterKey !== targetClusterKey) {
			continue
		}
		skippedProtectedCount += cluster.protectedEntries.length
		if (cluster.entries.length <= 1) {
			continue
		}
		for (const entry of cluster.quarantineEntries) {
			if (!entry.decision.canQuarantine || entry.isMaster) {
				continue
			}
			const key = `${entry.selectionKey}::${entry.normalizedPath}`
			if (seen.has(key)) {
				continue
			}
			seen.add(key)
			files.push(entry.rawFile)
			totalBytes += entry.sizeBytes
		}
	}

	return {
		files,
		totalBytes,
		totalFormatted: formatBytes(totalBytes),
		skippedProtectedCount,
	}
}

/**
 * Quote a string safely for POSIX single-quoted bash arguments, stripping control characters.
 *
 * @param {string} value - Raw string.
 * @return {string} POSIX-safe single-quoted literal.
 */
function quotePosixSafe(value) {
	const cleaned = sanitizeFidelityText(String(value || ''), 600)
	return `'${cleaned.replace(/'/g, "'\\''")}'`
}

/**
 * Build a DRY_RUN=1 POSIX quarantine & Nextcloud occ files:scan script for degraded media copies.
 *
 * @param {object} report - Output from analyzeMediaFidelity().
 * @param {object} [options] - Script options.
 * @return {string} POSIX shell script.
 */
export function buildFidelityQuarantineScript(report, options = {}) {
	const dataRoot = sanitizeFidelityText(String(options.dataRoot || '/var/www/nextcloud/data'), 240).replace(/\/+$/, '') || '/var/www/nextcloud/data'
	const quarantineFolder = sanitizeFidelityText(String(options.quarantineFolder || '_MediaFidelityQuarantine'), 120).replace(/^\/+|\/+$/g, '') || '_MediaFidelityQuarantine'
	const targetClusterKey = options.targetClusterKey || null
	const items = (report && Array.isArray(report.items) ? report.items : [])
		.filter(cluster => !targetClusterKey || cluster.clusterKey === targetClusterKey)

	const D = '$'
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Media Fidelity & Transcode-Loss Quarantine Script',
		`# Schema: ${MEDIA_FIDELITY_SCHEMA}`,
		'# Safe default: DRY_RUN=1 previews moves without modifying storage. Run DRY_RUN=0 ./script.sh to apply.',
		`DRY_RUN="${D}{DRY_RUN:-1}"`,
		`DATA_ROOT=${quotePosixSafe(dataRoot)}`,
		`QUARANTINE_SUBDIR=${quotePosixSafe(quarantineFolder)}`,
		`OCC_BIN="${D}{OCC_BIN:-sudo -u www-data php /var/www/nextcloud/occ}"`,
		'',
		'quarantine_file() {',
		'  local owner="$1"',
		'  local rel_path="$2"',
		`  local src="${D}{DATA_ROOT}/${D}{rel_path#/}"`,
		`  local dst_dir="${D}{DATA_ROOT}/${D}{owner}/files/${D}{QUARANTINE_SUBDIR}"`,
		`  local dst="${D}{dst_dir}/$(basename -- "${D}{rel_path}")"`,
		`  if [ "${D}{DRY_RUN}" = "1" ]; then`,
		`    printf "[DRY_RUN] mv -n -- %s %s\\n" "${D}{src}" "${D}{dst}"`,
		'  else',
		`    mkdir -p -- "${D}{dst_dir}"`,
		`    mv -n -- "${D}{src}" "${D}{dst}"`,
		'  fi',
		'}',
		'',
	]

	const ownersToScan = new Set()
	let moveCount = 0

	for (const cluster of items) {
		if (cluster.quarantineEntries.length === 0) {
			continue
		}
		lines.push(`# Cluster: ${sanitizeFidelityText(cluster.primaryName, 120)} | Master kept: ${sanitizeFidelityText(cluster.masterEntry.normalizedPath, 240)} (${cluster.masterEntry.scoring.fidelityScore}/100)`)
		for (const entry of cluster.quarantineEntries) {
			ownersToScan.add(entry.owner)
			lines.push(`quarantine_file ${quotePosixSafe(entry.owner)} ${quotePosixSafe(entry.normalizedPath)} # Score ${entry.scoring.fidelityScore}/100 (-${entry.transcodeLossPct}%, ${entry.sizeFormatted})`)
			moveCount += 1
		}
		lines.push('')
	}

	if (moveCount === 0) {
		lines.push('echo "No degraded copies cleared for quarantine under current guardrails."')
	} else {
		lines.push('# Rescan affected Nextcloud user filecaches after applying DRY_RUN=0')
		lines.push(`if [ "${D}{DRY_RUN}" = "0" ]; then`)
		for (const owner of ownersToScan) {
			lines.push(`  ${D}{OCC_BIN} files:scan --path=${quotePosixSafe(`/${owner}/files`)}`)
		}
		lines.push('else')
		lines.push(`  echo "Dry-run complete (${moveCount} candidate move(s)). Re-run with DRY_RUN=0 to execute."`)
		lines.push('fi')
	}

	return lines.join('\n')
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV ledger of all clustered fidelity evaluations.
 *
 * @param {object} report - Output from analyzeMediaFidelity().
 * @return {string} Safe CSV content.
 */
export function buildFidelityAuditCsv(report) {
	const headers = [
		'Cluster',
		'Family',
		'Cluster Verdict',
		'Master Path',
		'Candidate Name',
		'Candidate Path',
		'Owner',
		'Codec Tier',
		'Fidelity Score',
		'Transcode Loss %',
		'Grade',
		'Bloated Upscale',
		'Action Verdict',
		'Size Bytes',
		'Size Formatted',
		'Reason',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	const items = report && Array.isArray(report.items) ? report.items : []

	for (const cluster of items) {
		for (const entry of cluster.entries) {
			rows.push([
				cluster.primaryName,
				cluster.family,
				cluster.topVerdict,
				cluster.masterEntry.normalizedPath,
				entry.fileName,
				entry.normalizedPath,
				entry.owner,
				entry.codecProfile.codecLabel,
				String(entry.scoring.fidelityScore),
				String(entry.transcodeLossPct),
				formatFidelityGrade(entry.scoring.grade),
				entry.scoring.isBloatedUpscale ? 'YES' : 'NO',
				entry.decision.verdictLabel,
				String(entry.sizeBytes),
				entry.sizeFormatted,
				entry.decision.reason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON audit certificate for the media fidelity analysis.
 *
 * @param {object} report - Output from analyzeMediaFidelity().
 * @return {string} Formatted JSON string.
 */
export function buildFidelityJsonReport(report) {
	const items = report && Array.isArray(report.items) ? report.items : []
	return JSON.stringify({
		schema: MEDIA_FIDELITY_SCHEMA,
		generatedAt: report ? report.generatedAt : new Date().toISOString(),
		options: report ? report.options : {},
		summary: report ? report.summary : {},
		clusters: items.map(cluster => ({
			clusterKey: cluster.clusterKey,
			family: cluster.family,
			topVerdict: cluster.topVerdict,
			hasLosslessMaster: cluster.hasLosslessMaster,
			hasBloatRisk: cluster.hasBloatRisk,
			safeReclaimBytes: cluster.safeReclaimBytes,
			masterPath: cluster.masterEntry.normalizedPath,
			masterScore: cluster.masterEntry.scoring.fidelityScore,
			entries: cluster.entries.map(entry => ({
				path: entry.normalizedPath,
				owner: entry.owner,
				ext: entry.ext,
				codec: entry.codecProfile.codecLabel,
				sizeBytes: entry.sizeBytes,
				fidelityScore: entry.scoring.fidelityScore,
				transcodeLossPct: entry.transcodeLossPct,
				grade: entry.scoring.grade,
				isBloatedUpscale: entry.scoring.isBloatedUpscale,
				breakdown: entry.scoring.breakdown,
				verdict: entry.decision.actionVerdict,
				canQuarantine: entry.decision.canQuarantine,
				reason: entry.decision.reason,
			})),
		})),
	}, null, 2)
}
