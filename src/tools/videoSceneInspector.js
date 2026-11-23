/**
 * Pure video duplicate inspection, container header parsing (MP4/MOV/M4V, MKV/WebM, AVI),
 * perceptual keyframe dHash timeline comparison, duration-tolerance matching,
 * codec/resolution quality scoring, and CWE-1236-safe audit export helpers.
 * Zero DOM dependencies, zero XSS sinks, bounded memory/CPU parsing.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import {
	escapeCsvCell,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
} from './duplicateSelectionAndExport'
import {
	computeAspectRatioLabel,
	computeDifferenceHash,
	computeHammingSimilarity,
} from './visualMediaInspector'
import { formatMediaDuration } from './mediaContentInspector'

export const VIDEO_INSPECTOR_SCHEMA = 'duplicatefinder.video-scene-inspector.v1'
export const MAX_VIDEO_HEADER_BYTES = 2 * 1024 * 1024
export const VIDEO_RANGE_HEAD_BYTES = 131072
export const VIDEO_RANGE_TAIL_BYTES = 131072
export const DEFAULT_DURATION_TOLERANCE_PCT = 5
export const DEFAULT_FRAME_SIMILARITY_PCT = 85
export const KEYFRAME_POSITIONS = Object.freeze([0.1, 0.3, 0.5, 0.7, 0.9])

const MAX_CONTAINER_BOXES = 96
const MAX_EBML_ELEMENTS = 160

export const VIDEO_EXTENSIONS = Object.freeze([
	'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'ogv', '3gp', 'wmv', 'flv', 'mpg', 'mpeg', 'mts', 'm2ts',
])

export const VIDEO_KEEP_RULES = Object.freeze([
	'balanced_master',
	'highest_resolution',
	'highest_bitrate',
	'smallest_efficient',
	'oldest',
	'newest',
	'shortest_path',
])

const VIDEO_EXTENSION_SET = new Set(VIDEO_EXTENSIONS)

const MODERN_CODEC_RANK = Object.freeze({
	AV1: 5,
	HEVC: 4,
	VP9: 4,
	'H.264': 3,
	VP8: 2,
	MPEG4: 1,
	XVID: 1,
	MJPEG: 1,
})

const ISO_VIDEO_CODEC_MAP = Object.freeze({
	avc1: 'H.264',
	avc3: 'H.264',
	hvc1: 'HEVC',
	hev1: 'HEVC',
	av01: 'AV1',
	vp09: 'VP9',
	vp08: 'VP8',
	mp4v: 'MPEG4',
	mjpg: 'MJPEG',
})

const ISO_AUDIO_CODEC_MAP = Object.freeze({
	mp4a: 'AAC',
	opus: 'Opus',
	'ac-3': 'AC-3',
	'ec-3': 'E-AC-3',
	alac: 'ALAC',
	flac: 'FLAC',
	sowt: 'PCM',
	lpcm: 'PCM',
})

const MKV_CODEC_MAP = Object.freeze({
	V_MPEG4_ISO_AVC: 'H.264',
	V_MPEGH_ISO_HEVC: 'HEVC',
	V_VP9: 'VP9',
	V_VP8: 'VP8',
	V_AV1: 'AV1',
	V_MPEG2: 'MPEG2',
	A_OPUS: 'Opus',
	A_VORBIS: 'Vorbis',
	A_AAC: 'AAC',
	A_AC3: 'AC-3',
	A_EAC3: 'E-AC-3',
	A_FLAC: 'FLAC',
})

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text rendering.
 *
 * @param {*} raw - Candidate text.
 * @param {number} [maxLen=160] - Maximum output length.
 * @return {string} Cleaned plain text.
 */
export function sanitizeVideoText(raw, maxLen = 160) {
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
 * Convert ArrayBuffer / Uint8Array / DataView into a Uint8Array safely.
 *
 * @param {ArrayBuffer|Uint8Array|DataView|null|undefined} input - Binary buffer.
 * @return {Uint8Array} Byte slice (empty when invalid).
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
	if (ArrayBuffer.isView(input) && input.buffer) {
		return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
	}
	return new Uint8Array(0)
}

/**
 * Read ASCII characters safely from a DataView.
 *
 * @param {DataView} view - Binary DataView.
 * @param {number} offset - Start byte offset.
 * @param {number} length - Byte length.
 * @return {string} ASCII text.
 */
function readAscii(view, offset, length) {
	if (offset < 0 || length <= 0 || offset + length > view.byteLength) {
		return ''
	}
	let out = ''
	for (let i = 0; i < length; i += 1) {
		out += String.fromCharCode(view.getUint8(offset + i))
	}
	return out
}

/**
 * Determine whether a file entry is a video file by MIME type or extension.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {boolean} True when file is a video asset.
 */
export function isVideoFile(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	const mime = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''
	if (mime.startsWith('video/')) {
		return true
	}
	const ext = extractFileExtension(file.path || file.name || '')
	return VIDEO_EXTENSION_SET.has(ext)
}

/**
 * Classify video resolution into standard broadcast/streaming tiers.
 *
 * @param {number} width - Frame width in pixels.
 * @param {number} height - Frame height in pixels.
 * @return {{ id: string, label: string, rank: number }} Resolution tier descriptor.
 */
export function classifyResolutionTier(width, height) {
	const w = Number(width) || 0
	const h = Number(height) || 0
	const longEdge = Math.max(w, h)
	const shortEdge = Math.min(w, h)
	if (longEdge <= 0 || shortEdge <= 0) {
		return { id: 'unknown', label: 'Unknown', rank: 0 }
	}
	if (longEdge >= 3800 || shortEdge >= 2100) {
		return { id: '4k', label: '4K UHD', rank: 5 }
	}
	if (longEdge >= 2500 || shortEdge >= 1400) {
		return { id: '1440p', label: '1440p QHD', rank: 4 }
	}
	if (longEdge >= 1900 || shortEdge >= 1060) {
		return { id: '1080p', label: '1080p FHD', rank: 3 }
	}
	if (longEdge >= 1260 || shortEdge >= 700) {
		return { id: '720p', label: '720p HD', rank: 2 }
	}
	return { id: 'sd', label: 'SD / Low Res', rank: 1 }
}

/**
 * Extract non-authoritative resolution/FPS/codec hints from filename tags.
 *
 * @param {string} filePath - File path or filename.
 * @return {object} Parsed filename hints.
 */
export function extractFilenameVideoHints(filePath) {
	const raw = typeof filePath === 'string' ? filePath : ''
	const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
	const fileName = slash >= 0 ? raw.slice(slash + 1) : raw
	const lower = fileName.toLowerCase()

	let width = 0
	let height = 0
	if (/(?:^|[^0-9])(3840x2160|2160p|4k|uhd)(?:$|[^a-z0-9])/i.test(lower)) {
		width = 3840
		height = 2160
	} else if (/(?:^|[^0-9])(2560x1440|1440p|qhd|2k)(?:$|[^a-z0-9])/i.test(lower)) {
		width = 2560
		height = 1440
	} else if (/(?:^|[^0-9])(1920x1080|1080p|fhd|fullhd)(?:$|[^a-z0-9])/i.test(lower)) {
		width = 1920
		height = 1080
	} else if (/(?:^|[^0-9])(1280x720|720p|hd)(?:$|[^a-z0-9])/i.test(lower)) {
		width = 1280
		height = 720
	} else if (/(?:^|[^0-9])(854x480|640x480|480p|360p)(?:$|[^a-z0-9])/i.test(lower)) {
		width = 854
		height = 480
	}

	let videoCodec = ''
	if (/(?:x265|h265|hevc|h\.265)/i.test(lower)) {
		videoCodec = 'HEVC'
	} else if (/(?:x264|h264|avc|h\.264)/i.test(lower)) {
		videoCodec = 'H.264'
	} else if (/(?:av1|av01)/i.test(lower)) {
		videoCodec = 'AV1'
	} else if (/vp9/i.test(lower)) {
		videoCodec = 'VP9'
	}

	let fps = 0
	const fpsMatch = lower.match(/(?:^|[^0-9])(24|25|30|50|60|120)fps(?:$|[^a-z0-9])/i)
	if (fpsMatch) {
		fps = Number(fpsMatch[1])
	}

	return {
		width,
		height,
		videoCodec,
		fps,
		hasHints: Boolean(width > 0 || videoCodec || fps > 0),
	}
}

/**
 * Parse ISO BMFF (MP4 / MOV / M4V / 3GP) box tree safely.
 *
 * @param {Uint8Array} bytes - Binary slice.
 * @return {object|null} Parsed ISO BMFF video metadata or null.
 */
function parseIsoBmffVideoBytes(bytes) {
	if (bytes.byteLength < 8) {
		return null
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let majorBrand = ''
	let format = ''
	if (bytes.byteLength >= 12 && readAscii(view, 4, 4) === 'ftyp') {
		majorBrand = readAscii(view, 8, 4).trim()
		if (majorBrand === 'qt') {
			format = 'MOV'
		} else if (majorBrand === '3gp4' || majorBrand === '3gp5') {
			format = '3GP'
		} else if (majorBrand === 'M4V') {
			format = 'M4V'
		} else {
			format = 'MP4'
		}
	}

	let durationSeconds = 0
	let width = 0
	let height = 0
	let videoCodec = ''
	let audioCodec = ''
	let fps = 0
	let currentTrackKind = ''
	let currentMdTimescale = 0
	let foundAtom = Boolean(format)

	const scanBoxes = (start, end, depth) => {
		if (depth > 6) {
			return
		}
		let offset = start
		let guard = 0
		while (offset + 8 <= end && guard < MAX_CONTAINER_BOXES) {
			guard += 1
			let size = view.getUint32(offset, false)
			const type = readAscii(view, offset + 4, 4)
			if (!/^[\x20-\x7E]{4}$/.test(type)) {
				break
			}
			let headerSize = 8
			if (size === 1 && offset + 16 <= end) {
				const hi = view.getUint32(offset + 8, false)
				const lo = view.getUint32(offset + 12, false)
				size = (hi * 4294967296) + lo
				headerSize = 16
			} else if (size === 0) {
				size = end - offset
			}
			if (size < headerSize || offset + size > end + 8192) {
				break
			}
			const boxEnd = Math.min(end, offset + size)
			const payloadStart = offset + headerSize

			if (type === 'moov' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
				foundAtom = true
				if (type === 'trak') {
					currentTrackKind = ''
					currentMdTimescale = 0
				}
				scanBoxes(payloadStart, boxEnd, depth + 1)
			} else if (type === 'mvhd' && payloadStart + 20 <= boxEnd) {
				foundAtom = true
				const version = view.getUint8(payloadStart)
				if (version === 0 && payloadStart + 20 <= boxEnd) {
					const timescale = view.getUint32(payloadStart + 12, false)
					const duration = view.getUint32(payloadStart + 16, false)
					if (timescale > 0 && duration > 0) {
						durationSeconds = duration / timescale
					}
				} else if (version === 1 && payloadStart + 32 <= boxEnd) {
					const timescale = view.getUint32(payloadStart + 20, false)
					const durHi = view.getUint32(payloadStart + 24, false)
					const durLo = view.getUint32(payloadStart + 28, false)
					const duration = (durHi * 4294967296) + durLo
					if (timescale > 0 && duration > 0) {
						durationSeconds = duration / timescale
					}
				}
			} else if (type === 'tkhd' && payloadStart + 84 <= boxEnd) {
				foundAtom = true
				const version = view.getUint8(payloadStart)
				const dimOffset = version === 1 ? payloadStart + 88 : payloadStart + 76
				if (dimOffset + 8 <= boxEnd) {
					const w = view.getUint32(dimOffset, false) >>> 16
					const h = view.getUint32(dimOffset + 4, false) >>> 16
					if (w > 0 && h > 0 && width === 0) {
						width = w
						height = h
					}
				}
			} else if (type === 'hdlr' && payloadStart + 12 <= boxEnd) {
				const handler = readAscii(view, payloadStart + 8, 4)
				if (handler === 'vide') {
					currentTrackKind = 'video'
				} else if (handler === 'soun') {
					currentTrackKind = 'audio'
				}
			} else if (type === 'mdhd' && payloadStart + 20 <= boxEnd) {
				const version = view.getUint8(payloadStart)
				if (version === 0 && payloadStart + 20 <= boxEnd) {
					currentMdTimescale = view.getUint32(payloadStart + 12, false)
				} else if (version === 1 && payloadStart + 28 <= boxEnd) {
					currentMdTimescale = view.getUint32(payloadStart + 20, false)
				}
			} else if (type === 'stsd' && payloadStart + 16 <= boxEnd) {
				const entryType = readAscii(view, payloadStart + 12, 4)
				const entryKey = entryType.toLowerCase()
				if (ISO_VIDEO_CODEC_MAP[entryKey] && !videoCodec) {
					videoCodec = ISO_VIDEO_CODEC_MAP[entryKey]
				} else if (ISO_AUDIO_CODEC_MAP[entryKey] && !audioCodec) {
					audioCodec = ISO_AUDIO_CODEC_MAP[entryKey]
				}
				if (currentTrackKind === 'video' && payloadStart + 44 <= boxEnd && width === 0) {
					const vw = view.getUint16(payloadStart + 32, false)
					const vh = view.getUint16(payloadStart + 34, false)
					if (vw > 0 && vh > 0) {
						width = vw
						height = vh
					}
				}
			} else if (type === 'stts' && currentTrackKind === 'video' && payloadStart + 16 <= boxEnd) {
				const entryCount = view.getUint32(payloadStart + 4, false)
				if (entryCount > 0 && currentMdTimescale > 0) {
					const sampleDelta = view.getUint32(payloadStart + 12, false)
					if (sampleDelta > 0) {
						const estFps = currentMdTimescale / sampleDelta
						if (estFps >= 1 && estFps <= 240) {
							fps = Math.round(estFps * 100) / 100
						}
					}
				}
			}

			offset += size
		}
	}

	scanBoxes(0, bytes.byteLength, 0)

	if (!foundAtom) {
		return null
	}

	return {
		container: format || 'MP4',
		brand: majorBrand,
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 100) / 100 : 0,
		width,
		height,
		videoCodec,
		audioCodec,
		fps,
	}
}

/**
 * Read an EBML variable-size integer (VINT) from bytes.
 *
 * @param {Uint8Array} bytes - Source byte buffer.
 * @param {number} offset - Start offset.
 * @param {boolean} [keepMarker=false] - Keep width marker bit for element IDs.
 * @return {{ value: number, length: number }|null} Decoded integer and byte width.
 */
function readEbmlVint(bytes, offset, keepMarker = false) {
	if (offset < 0 || offset >= bytes.byteLength) {
		return null
	}
	const first = bytes[offset]
	if (first === 0) {
		return null
	}
	let width = 1
	let mask = 0x80
	while (width <= 8 && (first & mask) === 0) {
		width += 1
		mask >>= 1
	}
	if (width > 8 || offset + width > bytes.byteLength) {
		return null
	}
	let value = keepMarker ? first : (first & (mask - 1))
	for (let i = 1; i < width; i += 1) {
		value = (value * 256) + bytes[offset + i]
	}
	return { value, length: width }
}

/**
 * Read unsigned big-endian integer up to 6 bytes safely.
 *
 * @param {Uint8Array} bytes - Source buffer.
 * @param {number} offset - Start offset.
 * @param {number} length - Byte count.
 * @return {number} Unsigned integer value.
 */
function readUintBE(bytes, offset, length) {
	let val = 0
	for (let i = 0; i < length; i += 1) {
		val = (val * 256) + bytes[offset + i]
	}
	return val
}

/**
 * Normalize EBML / Matroska CodecID string to readable codec label.
 *
 * @param {string} codecId - Raw CodecID.
 * @return {string} Normalized codec label.
 */
function normalizeMkvCodec(codecId) {
	const clean = sanitizeVideoText(codecId, 48).replace(/[/.\- ]+/g, '_').toUpperCase()
	if (MKV_CODEC_MAP[clean]) {
		return MKV_CODEC_MAP[clean]
	}
	if (clean.includes('HEVC') || clean.includes('MPEGH')) {
		return 'HEVC'
	}
	if (clean.includes('AVC') || clean.includes('H264')) {
		return 'H.264'
	}
	if (clean.includes('AV1')) {
		return 'AV1'
	}
	if (clean.includes('VP9')) {
		return 'VP9'
	}
	if (clean.includes('VP8')) {
		return 'VP8'
	}
	if (clean.includes('OPUS')) {
		return 'Opus'
	}
	if (clean.includes('AAC')) {
		return 'AAC'
	}
	if (clean.includes('VORBIS')) {
		return 'Vorbis'
	}
	return sanitizeVideoText(codecId, 24)
}

/**
 * Parse EBML (Matroska / WebM) header, Info, and Tracks elements safely.
 *
 * @param {Uint8Array} bytes - Binary slice.
 * @return {object|null} Parsed MKV/WebM metadata or null.
 */
function parseEbmlVideoBytes(bytes) {
	if (
		bytes.byteLength < 12
		|| bytes[0] !== 0x1a
		|| bytes[1] !== 0x45
		|| bytes[2] !== 0xdf
		|| bytes[3] !== 0xa3
	) {
		return null
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	let docType = ''
	let timecodeScale = 1000000
	let rawDuration = 0
	let width = 0
	let height = 0
	let videoCodec = ''
	let audioCodec = ''
	let fps = 0
	let currentTrackType = 0
	let currentCodec = ''
	let guard = 0

	const walkEbml = (start, end, depth) => {
		if (depth > 5) {
			return
		}
		let offset = start
		while (offset < end && guard < MAX_EBML_ELEMENTS) {
			guard += 1
			const idInfo = readEbmlVint(bytes, offset, true)
			if (!idInfo) {
				break
			}
			const sizeInfo = readEbmlVint(bytes, offset + idInfo.length, false)
			if (!sizeInfo) {
				break
			}
			const payloadStart = offset + idInfo.length + sizeInfo.length
			const payloadLen = sizeInfo.value
			const payloadEnd = payloadLen > 0 && payloadStart + payloadLen <= end
				? payloadStart + payloadLen
				: end
			const id = idInfo.value

			if (
				id === 0x1a45dfa3 // EBML
				|| id === 0x18538067 // Segment
				|| id === 0x1549a966 // Info
				|| id === 0x1654ae6b // Tracks
				|| id === 0xae // TrackEntry
				|| id === 0xe0 // Video
			) {
				if (id === 0xae) {
					currentTrackType = 0
					currentCodec = ''
				}
				walkEbml(payloadStart, payloadEnd, depth + 1)
			} else if (id === 0x4282 && payloadStart + payloadLen <= end) {
				docType = sanitizeVideoText(readAscii(view, payloadStart, payloadLen), 16).toLowerCase()
			} else if (id === 0x2ad7b1 && payloadLen <= 8 && payloadStart + payloadLen <= end) {
				const scale = readUintBE(bytes, payloadStart, payloadLen)
				if (scale > 0) {
					timecodeScale = scale
				}
			} else if (id === 0x4489 && payloadStart + payloadLen <= end) {
				if (payloadLen === 4) {
					rawDuration = view.getFloat32(payloadStart, false)
				} else if (payloadLen === 8) {
					rawDuration = view.getFloat64(payloadStart, false)
				}
			} else if (id === 0x83 && payloadLen === 1 && payloadStart + 1 <= end) {
				currentTrackType = bytes[payloadStart]
			} else if (id === 0x86 && payloadStart + payloadLen <= end) {
				currentCodec = normalizeMkvCodec(readAscii(view, payloadStart, payloadLen))
				if (currentTrackType === 1 && !videoCodec) {
					videoCodec = currentCodec
				} else if (currentTrackType === 2 && !audioCodec) {
					audioCodec = currentCodec
				} else if (!videoCodec && currentCodec && !['Opus', 'AAC', 'Vorbis', 'AC-3', 'FLAC'].includes(currentCodec)) {
					videoCodec = currentCodec
				}
			} else if (id === 0x23e383 && payloadLen <= 8 && payloadStart + payloadLen <= end) {
				const nsPerFrame = readUintBE(bytes, payloadStart, payloadLen)
				if (nsPerFrame > 0 && currentTrackType === 1 && fps === 0) {
					const estFps = 1000000000 / nsPerFrame
					if (estFps >= 1 && estFps <= 240) {
						fps = Math.round(estFps * 100) / 100
					}
				}
			} else if (id === 0xb0 && payloadLen <= 4 && payloadStart + payloadLen <= end) {
				const w = readUintBE(bytes, payloadStart, payloadLen)
				if (w > 0 && width === 0) {
					width = w
				}
			} else if (id === 0xba && payloadLen <= 4 && payloadStart + payloadLen <= end) {
				const h = readUintBE(bytes, payloadStart, payloadLen)
				if (h > 0 && height === 0) {
					height = h
				}
			}

			if (payloadLen <= 0 || payloadEnd <= offset) {
				break
			}
			offset = payloadEnd
		}
	}

	walkEbml(0, bytes.byteLength, 0)

	const durationSeconds = rawDuration > 0
		? Math.round(((rawDuration * timecodeScale) / 1000000000) * 100) / 100
		: 0

	return {
		container: docType === 'webm' ? 'WebM' : 'MKV',
		brand: docType || 'matroska',
		durationSeconds,
		width,
		height,
		videoCodec,
		audioCodec,
		fps,
	}
}

/**
 * Parse RIFF AVI container headers safely.
 *
 * @param {Uint8Array} bytes - Binary slice.
 * @return {object|null} Parsed AVI metadata or null.
 */
function parseAviVideoBytes(bytes) {
	if (bytes.byteLength < 12) {
		return null
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
	if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'AVI ') {
		return null
	}

	let width = 0
	let height = 0
	let fps = 0
	let durationSeconds = 0
	let videoCodec = ''
	let bitrateKbps = 0

	const scanChunks = (start, end, depth) => {
		if (depth > 4) {
			return
		}
		let offset = start
		let guard = 0
		while (offset + 8 <= end && guard < MAX_CONTAINER_BOXES) {
			guard += 1
			const id = readAscii(view, offset, 4)
			const size = view.getUint32(offset + 4, true)
			const payload = offset + 8
			if (id === 'LIST' && payload + 4 <= end) {
				const listType = readAscii(view, payload, 4)
				const listEnd = Math.min(end, payload + size)
				if (listType === 'hdrl' || listType === 'strl') {
					scanChunks(payload + 4, listEnd, depth + 1)
				}
			} else if (id === 'avih' && payload + 40 <= end) {
				const microsecPerFrame = view.getUint32(payload, true)
				const maxBytesPerSec = view.getUint32(payload + 4, true)
				const totalFrames = view.getUint32(payload + 16, true)
				const w = view.getUint32(payload + 32, true)
				const h = view.getUint32(payload + 36, true)
				if (w > 0 && h > 0) {
					width = w
					height = h
				}
				if (microsecPerFrame > 0) {
					const estFps = 1000000 / microsecPerFrame
					if (estFps >= 1 && estFps <= 240) {
						fps = Math.round(estFps * 100) / 100
					}
					if (totalFrames > 0) {
						durationSeconds = Math.round(((totalFrames * microsecPerFrame) / 1000000) * 100) / 100
					}
				}
				if (maxBytesPerSec > 0) {
					bitrateKbps = Math.round((maxBytesPerSec * 8) / 1000)
				}
			} else if (id === 'strh' && payload + 8 <= end) {
				const streamType = readAscii(view, payload, 4)
				const handler = sanitizeVideoText(readAscii(view, payload + 4, 4), 8).toUpperCase()
				if (streamType === 'vids' && handler && !videoCodec) {
					videoCodec = handler === 'H264' ? 'H.264' : handler
				}
			}

			const step = 8 + size + (size % 2)
			if (step <= 8 || offset + step > end + 8192) {
				break
			}
			offset += step
		}
	}

	scanChunks(12, bytes.byteLength, 0)

	return {
		container: 'AVI',
		brand: 'AVI',
		durationSeconds,
		width,
		height,
		videoCodec,
		audioCodec: '',
		fps,
		bitrateKbps,
	}
}

/**
 * Compute a deterministic 0..100 video quality score based on resolution, codec, bitrate, and FPS.
 *
 * @param {object} meta - Normalized video metadata.
 * @return {number} Quality score 0..100.
 */
export function computeVideoQualityScore(meta) {
	if (!meta || typeof meta !== 'object') {
		return 0
	}
	const w = Number(meta.width) || 0
	const h = Number(meta.height) || 0
	const pixels = w * h
	let resPts = 0
	if (pixels >= 3840 * 2160 * 0.9) {
		resPts = 45
	} else if (pixels >= 2560 * 1440 * 0.9) {
		resPts = 38
	} else if (pixels >= 1920 * 1080 * 0.9) {
		resPts = 32
	} else if (pixels >= 1280 * 720 * 0.9) {
		resPts = 22
	} else if (pixels > 0) {
		resPts = 12
	}

	const codecRank = MODERN_CODEC_RANK[meta.videoCodec] || (meta.videoCodec ? 2 : 0)
	const codecPts = codecRank * 4

	const bitrate = Number(meta.bitrateKbps) || 0
	let bitratePts = 0
	if (bitrate >= 15000) {
		bitratePts = 20
	} else if (bitrate >= 6000) {
		bitratePts = 16
	} else if (bitrate >= 2500) {
		bitratePts = 12
	} else if (bitrate >= 900) {
		bitratePts = 8
	} else if (bitrate > 0) {
		bitratePts = 4
	}

	const fps = Number(meta.fps) || 0
	let fpsPts = 0
	if (fps >= 59) {
		fpsPts = 10
	} else if (fps >= 29) {
		fpsPts = 8
	} else if (fps >= 23) {
		fpsPts = 6
	} else if (fps > 0) {
		fpsPts = 3
	}

	const audioPts = meta.audioCodec ? 5 : 0
	return Math.max(0, Math.min(100, resPts + codecPts + bitratePts + fpsPts + audioPts))
}

/**
 * Parse video container metadata from head/tail binary buffers plus file metadata or browser probe.
 *
 * @param {ArrayBuffer|Uint8Array|DataView|null|undefined} buffer - Head binary buffer.
 * @param {object|null|undefined} file - Duplicate file entry.
 * @param {object} [options] - Optional tailBuffer, probeResult, or prior inspected record.
 * @return {object} Normalized video metadata object.
 */
export function parseVideoContainerMetadata(buffer, file, options = {}) {
	const bytes = toUint8Array(buffer)
	const tailBytes = toUint8Array(options.tailBuffer)
	const ext = extractFileExtension((file && (file.path || file.name)) || '')
	const containerFallback = ext ? ext.toUpperCase() : 'VIDEO'
	const sizeBytes = Number(file && file.size) || 0

	let parsed = null
	if (bytes.byteLength >= 8) {
		parsed = parseEbmlVideoBytes(bytes)
			|| parseAviVideoBytes(bytes)
			|| parseIsoBmffVideoBytes(bytes)
	}
	if ((!parsed || (!parsed.durationSeconds && !parsed.width)) && tailBytes.byteLength >= 8) {
		const tailParsed = parseIsoBmffVideoBytes(tailBytes)
		if (tailParsed) {
			parsed = {
				...(parsed || {}),
				...tailParsed,
				container: (parsed && parsed.container) || tailParsed.container,
				durationSeconds: tailParsed.durationSeconds || (parsed && parsed.durationSeconds) || 0,
				width: tailParsed.width || (parsed && parsed.width) || 0,
				height: tailParsed.height || (parsed && parsed.height) || 0,
				videoCodec: tailParsed.videoCodec || (parsed && parsed.videoCodec) || '',
				audioCodec: tailParsed.audioCodec || (parsed && parsed.audioCodec) || '',
				fps: tailParsed.fps || (parsed && parsed.fps) || 0,
			}
		}
	}

	const embedded = (file && (file.videoMetadata || file.mediaInfo)) || {}
	const probe = options.probeResult || options.inspected || {}
	const hints = extractFilenameVideoHints((file && (file.path || file.name)) || '')

	const width = Number(probe.width) || Number(parsed && parsed.width) || Number(embedded.width) || hints.width || 0
	const height = Number(probe.height) || Number(parsed && parsed.height) || Number(embedded.height) || hints.height || 0
	const durationSeconds = Number(probe.durationSeconds)
		|| Number(parsed && parsed.durationSeconds)
		|| Number(embedded.durationSeconds)
		|| 0
	const fps = Number(probe.fps) || Number(parsed && parsed.fps) || Number(embedded.fps) || hints.fps || 0
	const videoCodec = sanitizeVideoText(
		String(probe.videoCodec || (parsed && parsed.videoCodec) || embedded.videoCodec || hints.videoCodec || ''),
		32,
	)
	const audioCodec = sanitizeVideoText(
		String(probe.audioCodec || (parsed && parsed.audioCodec) || embedded.audioCodec || ''),
		32,
	)
	const container = sanitizeVideoText(
		String(probe.container || (parsed && parsed.container) || embedded.container || containerFallback),
		16,
	)

	let bitrateKbps = Number(probe.bitrateKbps) || Number(parsed && parsed.bitrateKbps) || Number(embedded.bitrateKbps) || 0
	if (!bitrateKbps && sizeBytes > 0 && durationSeconds > 0) {
		bitrateKbps = Math.round((sizeBytes * 8) / (durationSeconds * 1000))
	}

	const keyframes = Array.isArray(probe.keyframes)
		? probe.keyframes
		: (Array.isArray(file && file.keyframes) ? file.keyframes : [])

	let metadataSource = 'none'
	if (probe.source === 'browser-probe' || keyframes.length > 0) {
		metadataSource = parsed ? 'container+frames' : 'browser-probe'
	} else if (parsed && (parsed.width > 0 || parsed.durationSeconds > 0 || parsed.videoCodec)) {
		metadataSource = 'container'
	} else if (embedded.width > 0 || embedded.durationSeconds > 0) {
		metadataSource = 'metadata'
	} else if (hints.hasHints) {
		metadataSource = 'filename-hint'
	}

	const resolutionTier = classifyResolutionTier(width, height)
	const aspectRatio = computeAspectRatioLabel(width, height)
	const resolutionLabel = width > 0 && height > 0 ? `${width}x${height}` : 'Unknown'
	const bitrateLabel = bitrateKbps >= 1000
		? `${(Math.round((bitrateKbps / 1000) * 10) / 10)} Mbps`
		: (bitrateKbps > 0 ? `${bitrateKbps} kbps` : 'Unknown bitrate')

	const meta = {
		container,
		brand: sanitizeVideoText(String((parsed && parsed.brand) || ''), 16),
		width,
		height,
		pixelArea: width * height,
		resolutionLabel,
		resolutionTier,
		aspectRatio,
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 100) / 100 : 0,
		durationFormatted: formatMediaDuration(durationSeconds),
		fps,
		videoCodec,
		audioCodec,
		bitrateKbps,
		bitrateLabel,
		keyframes,
		metadataSource,
		inspected: metadataSource !== 'none' && metadataSource !== 'filename-hint',
		qualityScore: 0,
	}
	meta.qualityScore = computeVideoQualityScore(meta)
	return meta
}

/**
 * Detect whether a sampled RGBA video frame is predominantly black/blank (intro/outro fade).
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba - RGBA pixel buffer.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @return {boolean} True when average luma is below black-frame threshold.
 */
export function detectBlankVideoFrame(rgba, width, height) {
	const w = Math.floor(Number(width))
	const h = Math.floor(Number(height))
	if (!rgba || w <= 0 || h <= 0 || rgba.length < w * h * 4) {
		return false
	}
	const step = Math.max(1, Math.floor((w * h) / 256))
	let sum = 0
	let count = 0
	for (let p = 0; p < w * h; p += step) {
		const i = p * 4
		sum += (0.299 * rgba[i]) + (0.587 * rgba[i + 1]) + (0.114 * rgba[i + 2])
		count += 1
	}
	return count > 0 && (sum / count) < 14
}

/**
 * Build a perceptual keyframe fingerprint sample from RGBA pixels.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba - RGBA frame pixels.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @param {number} position - Timeline fraction 0..1.
 * @param {number} [durationSeconds=0] - Total duration in seconds.
 * @param {string} [thumbnailDataUrl=''] - Optional safe data/blob preview URL.
 * @return {object|null} Keyframe record or null.
 */
export function buildKeyframeSample(rgba, width, height, position, durationSeconds = 0, thumbnailDataUrl = '') {
	const dHash = computeDifferenceHash(rgba, width, height)
	if (!dHash) {
		return null
	}
	const pos = Math.max(0, Math.min(1, Number(position) || 0))
	const tsSeconds = durationSeconds > 0 ? Math.round(pos * durationSeconds * 10) / 10 : 0
	const safeThumb = typeof thumbnailDataUrl === 'string' && thumbnailDataUrl.startsWith('data:image/')
		? thumbnailDataUrl
		: ''
	return {
		position: pos,
		positionPercent: Math.round(pos * 100),
		timestampSeconds: tsSeconds,
		timestampLabel: durationSeconds > 0 ? (formatMediaDuration(tsSeconds) || '00:00') : `${Math.round(pos * 100)}%`,
		dHash: dHash.hex,
		isBlank: detectBlankVideoFrame(rgba, width, height),
		thumbnailDataUrl: safeThumb,
	}
}

/**
 * Compare two sampled keyframe timeline strips with optional +/-1 temporal shift tolerance.
 *
 * @param {Array<object>} framesA - First video keyframes.
 * @param {Array<object>} framesB - Second video keyframes.
 * @param {object} [options] - Threshold options.
 * @param {number} [options.similarityThreshold=85] - Frame match cutoff percentage.
 * @return {object} Timeline similarity analysis.
 */
export function compareVideoFrameStrips(framesA, framesB, options = {}) {
	const listA = Array.isArray(framesA) ? framesA.filter(f => f && f.dHash) : []
	const listB = Array.isArray(framesB) ? framesB.filter(f => f && f.dHash) : []
	const threshold = Math.max(50, Math.min(100, Number(options.similarityThreshold) || DEFAULT_FRAME_SIMILARITY_PCT))

	if (listA.length === 0 || listB.length === 0) {
		return {
			comparable: false,
			overallSimilarityPercent: 0,
			matchedFrameCount: 0,
			totalComparedFrames: 0,
			bestShift: 0,
			classification: 'unprobed',
			frameComparisons: [],
		}
	}

	const evaluateShift = shift => {
		const comparisons = []
		let sumSim = 0
		let matched = 0
		for (let i = 0; i < listA.length; i += 1) {
			const j = i + shift
			if (j < 0 || j >= listB.length) {
				continue
			}
			const frameA = listA[i]
			const frameB = listB[j]
			if (frameA.isBlank && frameB.isBlank) {
				continue
			}
			const sim = computeHammingSimilarity(frameA.dHash, frameB.dHash)
			if (!sim) {
				continue
			}
			sumSim += sim.similarityPercent
			if (sim.similarityPercent >= threshold) {
				matched += 1
			}
			comparisons.push({
				indexA: i,
				indexB: j,
				positionPercent: frameA.positionPercent || Math.round((frameA.position || 0) * 100),
				timestampLabel: frameA.timestampLabel || '',
				hashA: frameA.dHash,
				hashB: frameB.dHash,
				distance: sim.distance,
				similarityPercent: sim.similarityPercent,
				isMatch: sim.similarityPercent >= threshold,
			})
		}
		const count = comparisons.length
		const avg = count > 0 ? Math.round((sumSim / count) * 10) / 10 : 0
		return { count, avg, matched, comparisons }
	}

	let bestShift = 0
	let best = evaluateShift(0)
	for (const shift of [-1, 1]) {
		const candidate = evaluateShift(shift)
		if (candidate.count > 0 && candidate.avg > best.avg + 4) {
			best = candidate
			bestShift = shift
		}
	}

	let classification = 'different-scene'
	if (best.count === 0) {
		classification = 'unprobed'
	} else if (best.avg >= 97 && bestShift === 0) {
		classification = 'exact-visual'
	} else if (best.avg >= threshold && bestShift === 0) {
		classification = 're-encode-match'
	} else if (best.avg >= threshold && bestShift !== 0) {
		classification = 'trimmed-subclip'
	}

	return {
		comparable: best.count > 0,
		overallSimilarityPercent: best.avg,
		matchedFrameCount: best.matched,
		totalComparedFrames: best.count,
		bestShift,
		classification,
		frameComparisons: best.comparisons,
	}
}

/**
 * Evaluate whether two video durations lie within the configured percentage tolerance.
 *
 * @param {number} durA - First duration in seconds.
 * @param {number} durB - Second duration in seconds.
 * @param {number} [tolerancePct=5] - Tolerance percentage 0..25.
 * @return {{ comparable: boolean, withinTolerance: boolean, driftSeconds: number, driftPercent: number }} Duration comparison.
 */
export function isDurationWithinTolerance(durA, durB, tolerancePct = DEFAULT_DURATION_TOLERANCE_PCT) {
	const a = Number(durA) || 0
	const b = Number(durB) || 0
	const tol = Math.max(0, Math.min(50, Number(tolerancePct) || 0))
	if (a <= 0 || b <= 0) {
		return {
			comparable: false,
			withinTolerance: false,
			driftSeconds: 0,
			driftPercent: 0,
		}
	}
	const maxDur = Math.max(a, b)
	const driftSeconds = Math.round(Math.abs(a - b) * 100) / 100
	const driftPercent = Math.round(((driftSeconds / maxDur) * 100) * 10) / 10
	return {
		comparable: true,
		withinTolerance: driftPercent <= tol,
		driftSeconds,
		driftPercent,
	}
}

/**
 * Normalize video stem name for cross-group re-encode heuristic matching.
 *
 * @param {string} filePath - File path or name.
 * @return {string} Normalized token stem.
 */
function normalizeVideoStem(filePath) {
	const raw = typeof filePath === 'string' ? filePath : ''
	const slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'))
	const fileName = slash >= 0 ? raw.slice(slash + 1) : raw
	const dot = fileName.lastIndexOf('.')
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName
	return stem
		.toLowerCase()
		.replace(/\b(2160p|1440p|1080p|720p|480p|360p|4k|uhd|fhd|hd|x264|x265|h264|h265|hevc|av1|vp9|60fps|30fps|copy|reencode|compressed|web|mobile)\b/g, ' ')
		.replace(/[_\-.()[\]]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

/**
 * Select the best surviving video copy and deletion candidates for a group.
 *
 * @param {Array<object>} wrappedFiles - Files annotated with `.meta` and `.fileKey`.
 * @param {string} keepRule - Strategy from VIDEO_KEEP_RULES.
 * @return {{ survivors: Array<object>, deletionCandidates: Array<object>, reason: string }} Selection plan.
 */
function selectVideoSurvivorPlan(wrappedFiles, keepRule) {
	const list = Array.isArray(wrappedFiles) ? wrappedFiles : []
	if (list.length <= 1) {
		return {
			survivors: list.map(w => w.raw),
			deletionCandidates: [],
			reason: 'Single file',
		}
	}

	if (keepRule === 'oldest' || keepRule === 'newest' || keepRule === 'shortest_path') {
		const rawFiles = list.map(w => w.raw)
		const deletion = selectDuplicatesByKeepRule(rawFiles, keepRule, { skipProtected: true })
		const delKeys = new Set(deletion.map(f => getFileSelectionKey(f)))
		const survivors = rawFiles.filter(f => !delKeys.has(getFileSelectionKey(f)))
		const labels = {
			oldest: 'Oldest copy',
			newest: 'Newest copy',
			shortest_path: 'Shortest path',
		}
		return {
			survivors,
			deletionCandidates: deletion,
			reason: labels[keepRule],
		}
	}

	const sorted = [...list].sort((a, b) => {
		const aProt = a.raw.isProtectedOrigin ? 1 : 0
		const bProt = b.raw.isProtectedOrigin ? 1 : 0
		if (aProt !== bProt) {
			return bProt - aProt
		}
		if (keepRule === 'highest_resolution') {
			if (a.meta.pixelArea !== b.meta.pixelArea) {
				return b.meta.pixelArea - a.meta.pixelArea
			}
			if (a.meta.fps !== b.meta.fps) {
				return b.meta.fps - a.meta.fps
			}
			if (a.meta.bitrateKbps !== b.meta.bitrateKbps) {
				return b.meta.bitrateKbps - a.meta.bitrateKbps
			}
		} else if (keepRule === 'highest_bitrate') {
			if (a.meta.bitrateKbps !== b.meta.bitrateKbps) {
				return b.meta.bitrateKbps - a.meta.bitrateKbps
			}
			if (a.meta.pixelArea !== b.meta.pixelArea) {
				return b.meta.pixelArea - a.meta.pixelArea
			}
		} else if (keepRule === 'smallest_efficient') {
			const aMinHd = a.meta.resolutionTier.rank >= 2 ? 1 : 0
			const bMinHd = b.meta.resolutionTier.rank >= 2 ? 1 : 0
			if (aMinHd !== bMinHd) {
				return bMinHd - aMinHd
			}
			const aCodec = MODERN_CODEC_RANK[a.meta.videoCodec] || 0
			const bCodec = MODERN_CODEC_RANK[b.meta.videoCodec] || 0
			if (aCodec !== bCodec) {
				return bCodec - aCodec
			}
			const aSize = Number(a.raw.size) || Number.MAX_SAFE_INTEGER
			const bSize = Number(b.raw.size) || Number.MAX_SAFE_INTEGER
			if (aSize !== bSize) {
				return aSize - bSize
			}
		} else {
			// balanced_master: resolution -> quality score -> bitrate -> duration -> size
			if (a.meta.pixelArea !== b.meta.pixelArea) {
				return b.meta.pixelArea - a.meta.pixelArea
			}
			if (a.meta.qualityScore !== b.meta.qualityScore) {
				return b.meta.qualityScore - a.meta.qualityScore
			}
			if (a.meta.bitrateKbps !== b.meta.bitrateKbps) {
				return b.meta.bitrateKbps - a.meta.bitrateKbps
			}
		}
		const aSize = Number(a.raw.size) || 0
		const bSize = Number(b.raw.size) || 0
		if (aSize !== bSize) {
			return bSize - aSize
		}
		return String(a.raw.path || '').localeCompare(String(b.raw.path || ''))
	})

	const master = sorted[0]
	const protectedSurvivors = sorted.filter(w => Boolean(w.raw.isProtectedOrigin))
	const survivorSet = new Set([master.fileKey, ...protectedSurvivors.map(w => w.fileKey)])
	const survivors = list.filter(w => survivorSet.has(w.fileKey)).map(w => w.raw)
	const deletionCandidates = list.filter(w => !survivorSet.has(w.fileKey)).map(w => w.raw)

	const reasonMap = {
		balanced_master: 'Highest resolution & codec quality',
		highest_resolution: 'Highest pixel resolution',
		highest_bitrate: 'Highest stream bitrate',
		smallest_efficient: 'Most efficient HD codec',
	}

	return {
		survivors,
		deletionCandidates,
		reason: reasonMap[keepRule] || 'Best video master',
	}
}

/**
 * Analyze duplicate groups containing video files, evaluate codec/resolution winners,
 * perceptual frame fingerprints, and cross-group duration tolerance matches.
 *
 * @param {Array<object>} duplicates - Duplicate groups from store.
 * @param {object} [options] - Keep rule, durationTolerancePct, similarityThreshold, inspectedByFileKey.
 * @return {{ schema: string, groups: Array<object>, summary: object }} Video catalog analysis.
 */
export function analyzeVideoCatalog(duplicates, options = {}) {
	const rawList = Array.isArray(duplicates) ? duplicates : []
	const keepRule = VIDEO_KEEP_RULES.includes(options.keepRule) ? options.keepRule : 'balanced_master'
	const durationTolerancePct = Math.max(
		0,
		Math.min(25, Number.isFinite(Number(options.durationTolerancePct))
			? Number(options.durationTolerancePct)
			: DEFAULT_DURATION_TOLERANCE_PCT),
	)
	const similarityThreshold = Math.max(
		60,
		Math.min(100, Number.isFinite(Number(options.similarityThreshold))
			? Number(options.similarityThreshold)
			: DEFAULT_FRAME_SIMILARITY_PCT),
	)
	const inspectedMap = options.inspectedByFileKey && typeof options.inspectedByFileKey === 'object'
		? options.inspectedByFileKey
		: {}

	const groups = []
	let totalVideoFiles = 0
	let totalReclaimableBytes = 0
	let uhdAndHdCount = 0
	let lowResOrReencodeCount = 0
	let durationMatchAlertsCount = 0
	let probedFramesCount = 0
	let containerScannedCount = 0
	const tierCounts = { '4k': 0, '1440p': 0, '1080p': 0, '720p': 0, sd: 0, unknown: 0 }

	for (let index = 0; index < rawList.length; index += 1) {
		const group = rawList[index]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const videoFiles = group.files.filter(isVideoFile)
		if (videoFiles.length === 0) {
			continue
		}

		const groupKey = String(group.id ?? group.hash ?? `video-group-${index}`)
		const wrappedFiles = videoFiles.map((file, fileIdx) => {
			const fileKey = String(getFileSelectionKey(file) ?? `${groupKey}-${fileIdx}`)
			const inspected = inspectedMap[fileKey] || null
			const meta = parseVideoContainerMetadata(null, file, { inspected })
			return { raw: file, fileKey, meta }
		})

		const plan = selectVideoSurvivorPlan(wrappedFiles, keepRule)
		const reclaimableBytes = plan.deletionCandidates.reduce(
			(sum, file) => sum + (Number(file && file.size) || 0),
			0,
		)
		const totalBytes = wrappedFiles.reduce((sum, w) => sum + (Number(w.raw.size) || 0), 0)

		const bestMeta = [...wrappedFiles]
			.sort((a, b) => (b.meta.qualityScore - a.meta.qualityScore) || (b.meta.pixelArea - a.meta.pixelArea))[0]
			.meta

		const distinctResolutions = new Set(wrappedFiles.map(w => w.meta.resolutionLabel).filter(r => r !== 'Unknown'))
		const distinctCodecs = new Set(wrappedFiles.map(w => w.meta.videoCodec).filter(Boolean))
		const hasResolutionMismatch = distinctResolutions.size > 1
		const hasCodecMismatch = distinctCodecs.size > 1
		const hasLowRes = wrappedFiles.some(w => w.meta.resolutionTier.rank > 0 && w.meta.resolutionTier.rank < 2)
		const hasProbedFrames = wrappedFiles.some(w => Array.isArray(w.meta.keyframes) && w.meta.keyframes.length > 0)
		const inspectedFilesCount = wrappedFiles.filter(w => w.meta.inspected).length
		const allProtected = wrappedFiles.every(w => Boolean(w.raw.isProtectedOrigin))

		const repFile = plan.survivors[0] || wrappedFiles[0].raw
		const repPath = sanitizeVideoText(String(repFile.path || repFile.name || 'video'), 220)
		const slash = Math.max(repPath.lastIndexOf('/'), repPath.lastIndexOf('\\'))
		const displayTitle = slash >= 0 ? repPath.slice(slash + 1) : repPath
		const normalizedStem = normalizeVideoStem(repPath)

		totalVideoFiles += wrappedFiles.length
		totalReclaimableBytes += reclaimableBytes
		if (bestMeta.resolutionTier.rank >= 2) {
			uhdAndHdCount += 1
		}
		if (hasLowRes || hasResolutionMismatch || hasCodecMismatch) {
			lowResOrReencodeCount += 1
		}
		if (hasProbedFrames) {
			probedFramesCount += 1
		}
		if (inspectedFilesCount > 0) {
			containerScannedCount += 1
		}
		tierCounts[bestMeta.resolutionTier.id] = (tierCounts[bestMeta.resolutionTier.id] || 0) + 1

		groups.push({
			groupKey,
			groupId: group.id ?? null,
			hash: String(group.hash || ''),
			rawGroup: group,
			displayTitle,
			representativePath: repPath,
			normalizedStem,
			copyCount: wrappedFiles.length,
			totalBytes,
			totalFormatted: formatBytes(totalBytes),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			container: bestMeta.container,
			videoCodec: bestMeta.videoCodec || 'Unknown',
			audioCodec: bestMeta.audioCodec || '',
			width: bestMeta.width,
			height: bestMeta.height,
			resolutionLabel: bestMeta.resolutionLabel,
			resolutionTier: bestMeta.resolutionTier,
			aspectRatio: bestMeta.aspectRatio,
			durationSeconds: bestMeta.durationSeconds,
			durationFormatted: bestMeta.durationFormatted,
			fps: bestMeta.fps,
			bitrateKbps: bestMeta.bitrateKbps,
			bitrateLabel: bestMeta.bitrateLabel,
			qualityScore: bestMeta.qualityScore,
			keyframes: bestMeta.keyframes,
			hasProbedFrames,
			inspectedFilesCount,
			hasResolutionMismatch,
			hasCodecMismatch,
			hasLowRes,
			allProtected,
			strategyReason: plan.reason,
			survivors: plan.survivors,
			deletionCandidates: plan.deletionCandidates,
			files: wrappedFiles,
			crossGroupMatches: [],
		})
	}

	// Cross-group scene & duration-tolerance matching
	for (let i = 0; i < groups.length; i += 1) {
		const groupA = groups[i]
		for (let j = i + 1; j < groups.length; j += 1) {
			const groupB = groups[j]
			const durCheck = isDurationWithinTolerance(
				groupA.durationSeconds,
				groupB.durationSeconds,
				durationTolerancePct,
			)
			const frameCompare = compareVideoFrameStrips(groupA.keyframes, groupB.keyframes, {
				similarityThreshold,
			})
			const stemMatch = Boolean(
				groupA.normalizedStem
				&& groupB.normalizedStem
				&& groupA.normalizedStem.length >= 3
				&& (groupA.normalizedStem === groupB.normalizedStem
					|| groupA.normalizedStem.includes(groupB.normalizedStem)
					|| groupB.normalizedStem.includes(groupA.normalizedStem)),
			)

			const frameMatched = frameCompare.comparable && frameCompare.overallSimilarityPercent >= similarityThreshold
			const durationAndStemMatched = durCheck.comparable && durCheck.withinTolerance && stemMatch
			const durationCloseSameCodecOrRes = durCheck.comparable
				&& durCheck.withinTolerance
				&& (groupA.aspectRatio && groupA.aspectRatio === groupB.aspectRatio)
				&& Math.abs(groupA.durationSeconds - groupB.durationSeconds) <= 2

			if (frameMatched || durationAndStemMatched || durationCloseSameCodecOrRes) {
				const reason = frameMatched
					? (frameCompare.classification === 'trimmed-subclip'
						? `Trimmed scene match (${frameCompare.overallSimilarityPercent}%)`
						: `Frame dHash match (${frameCompare.overallSimilarityPercent}%)`)
					: (durationAndStemMatched
						? `Duration +/-${durCheck.driftPercent}% & matching title`
						: `Duration +/-${durCheck.driftPercent}% & ${groupA.aspectRatio} ratio`)

				const similarityPercent = frameCompare.comparable
					? frameCompare.overallSimilarityPercent
					: Math.max(70, Math.round((100 - durCheck.driftPercent) * 10) / 10)

				groupA.crossGroupMatches.push({
					targetGroupKey: groupB.groupKey,
					targetGroupId: groupB.groupId,
					targetTitle: groupB.displayTitle,
					targetPath: groupB.representativePath,
					targetResolution: groupB.resolutionLabel,
					targetCodec: groupB.videoCodec,
					targetDuration: groupB.durationFormatted,
					targetBitrate: groupB.bitrateLabel,
					targetRawGroup: groupB.rawGroup,
					driftSeconds: durCheck.driftSeconds,
					driftPercent: durCheck.driftPercent,
					similarityPercent,
					classification: frameCompare.comparable ? frameCompare.classification : 'duration-tolerance',
					frameComparisons: frameCompare.frameComparisons,
					reason,
				})
				groupB.crossGroupMatches.push({
					targetGroupKey: groupA.groupKey,
					targetGroupId: groupA.groupId,
					targetTitle: groupA.displayTitle,
					targetPath: groupA.representativePath,
					targetResolution: groupA.resolutionLabel,
					targetCodec: groupA.videoCodec,
					targetDuration: groupA.durationFormatted,
					targetBitrate: groupA.bitrateLabel,
					targetRawGroup: groupA.rawGroup,
					driftSeconds: durCheck.driftSeconds,
					driftPercent: durCheck.driftPercent,
					similarityPercent,
					classification: frameCompare.comparable ? frameCompare.classification : 'duration-tolerance',
					frameComparisons: frameCompare.frameComparisons,
					reason,
				})
			}
		}
	}

	for (const group of groups) {
		if (group.crossGroupMatches.length > 0) {
			durationMatchAlertsCount += 1
			group.crossGroupMatches.sort((a, b) => b.similarityPercent - a.similarityPercent)
		}
	}

	return {
		schema: VIDEO_INSPECTOR_SCHEMA,
		groups,
		summary: {
			totalVideoGroups: groups.length,
			totalVideoFiles,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
			uhdAndHdCount,
			lowResOrReencodeCount,
			durationMatchAlertsCount,
			probedFramesCount,
			containerScannedCount,
			durationTolerancePct,
			similarityThreshold,
			tierCounts,
		},
	}
}

/**
 * Filter and sort analyzed video groups deterministically.
 *
 * @param {Array<object>} groups - Analyzed video groups.
 * @param {object} [options] - Category, sortBy, searchQuery.
 * @return {Array<object>} Filtered and sorted list.
 */
export function filterAndSortVideoGroups(groups, options = {}) {
	if (!Array.isArray(groups)) {
		return []
	}
	const category = options.category || 'all'
	const sortBy = options.sortBy || 'reclaimable-desc'
	const query = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const filtered = groups.filter(group => {
		if (category === 'uhd-hd' && group.resolutionTier.rank < 2) {
			return false
		}
		if (category === 'reencode-alert' && group.crossGroupMatches.length === 0 && !group.hasCodecMismatch) {
			return false
		}
		if (category === 'resolution-mismatch' && !group.hasResolutionMismatch) {
			return false
		}
		if (category === 'low-res' && !group.hasLowRes) {
			return false
		}
		if (category === 'probed' && !group.hasProbedFrames && group.inspectedFilesCount === 0) {
			return false
		}
		if (query) {
			const haystack = [
				group.displayTitle,
				group.representativePath,
				group.container,
				group.videoCodec,
				group.resolutionLabel,
				group.resolutionTier.label,
				...group.files.map(f => f.raw.path || ''),
			].join(' ').toLowerCase()
			if (!haystack.includes(query)) {
				return false
			}
		}
		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortBy === 'resolution-desc') {
			const areaDiff = (b.width * b.height) - (a.width * a.height)
			if (areaDiff !== 0) {
				return areaDiff
			}
		} else if (sortBy === 'bitrate-desc') {
			if (b.bitrateKbps !== a.bitrateKbps) {
				return b.bitrateKbps - a.bitrateKbps
			}
		} else if (sortBy === 'duration-desc') {
			if (b.durationSeconds !== a.durationSeconds) {
				return b.durationSeconds - a.durationSeconds
			}
		} else if (sortBy === 'copies-desc') {
			if (b.copyCount !== a.copyCount) {
				return b.copyCount - a.copyCount
			}
		}
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.displayTitle.localeCompare(b.displayTitle)
	})
}

/**
 * Format a concise plain-text video technical sheet for clipboard copy.
 *
 * @param {object|null|undefined} group - Analyzed video group.
 * @return {string} Formatted video sheet.
 */
export function formatVideoSheetText(group) {
	if (!group) {
		return ''
	}
	const lines = [
		`Title: ${group.displayTitle}`,
		`Container: ${group.container} | Codec: ${group.videoCodec}${group.audioCodec ? ` + ${group.audioCodec}` : ''}`,
		`Resolution: ${group.resolutionLabel} (${group.resolutionTier.label})${group.aspectRatio ? ` | Aspect: ${group.aspectRatio}` : ''}`,
		`Duration: ${group.durationFormatted || 'Unknown'} | FPS: ${group.fps > 0 ? group.fps : 'Unknown'} | Bitrate: ${group.bitrateLabel}`,
		`Quality Score: ${group.qualityScore}/100 | Reclaimable: ${group.reclaimableFormatted}`,
		`Survivor (${group.strategyReason}): ${group.survivors.map(f => f.path).join(', ')}`,
	]
	if (Array.isArray(group.keyframes) && group.keyframes.length > 0) {
		lines.push(`Keyframes: ${group.keyframes.map(kf => `${kf.timestampLabel}=${kf.dHash}`).join(', ')}`)
	}
	return lines.join('\n')
}

/**
 * Export the video inspection catalog as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} catalog - Output of analyzeVideoCatalog.
 * @return {string} Safe CSV payload.
 */
export function exportVideoAuditCsv(catalog) {
	const groups = catalog && Array.isArray(catalog.groups) ? catalog.groups : []
	const headers = [
		'GroupKey',
		'Title',
		'Container',
		'VideoCodec',
		'Resolution',
		'Tier',
		'FPS',
		'BitrateKbps',
		'DurationSeconds',
		'QualityScore',
		'Copies',
		'ReclaimableBytes',
		'CrossGroupMatches',
		'SurvivorPath',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	for (const group of groups) {
		const row = [
			group.groupKey,
			group.displayTitle,
			group.container,
			group.videoCodec,
			group.resolutionLabel,
			group.resolutionTier ? group.resolutionTier.label : '',
			group.fps || 0,
			group.bitrateKbps || 0,
			group.durationSeconds || 0,
			group.qualityScore || 0,
			group.copyCount || 0,
			group.reclaimableBytes || 0,
			Array.isArray(group.crossGroupMatches) ? group.crossGroupMatches.length : 0,
			group.survivors && group.survivors[0] ? group.survivors[0].path : group.representativePath,
		]
		rows.push(row.map(escapeCsvCell).join(','))
	}
	return rows.join('\n')
}

/**
 * Export the video inspection catalog as structured JSON.
 *
 * @param {object} catalog - Output of analyzeVideoCatalog.
 * @return {string} Pretty-printed JSON report.
 */
export function exportVideoAuditJson(catalog) {
	const groups = catalog && Array.isArray(catalog.groups) ? catalog.groups : []
	const summary = catalog && catalog.summary ? catalog.summary : {}
	const payload = {
		schema: VIDEO_INSPECTOR_SCHEMA,
		exportedAt: new Date().toISOString(),
		summary,
		groups: groups.map(group => ({
			groupKey: group.groupKey,
			groupId: group.groupId,
			hash: group.hash,
			displayTitle: group.displayTitle,
			container: group.container,
			videoCodec: group.videoCodec,
			audioCodec: group.audioCodec,
			width: group.width,
			height: group.height,
			resolutionLabel: group.resolutionLabel,
			fps: group.fps,
			bitrateKbps: group.bitrateKbps,
			durationSeconds: group.durationSeconds,
			qualityScore: group.qualityScore,
			copyCount: group.copyCount,
			reclaimableBytes: group.reclaimableBytes,
			strategyReason: group.strategyReason,
			keyframes: (group.keyframes || []).map(kf => ({
				positionPercent: kf.positionPercent,
				timestampLabel: kf.timestampLabel,
				dHash: kf.dHash,
				isBlank: Boolean(kf.isBlank),
			})),
			crossGroupMatches: (group.crossGroupMatches || []).map(match => ({
				targetGroupKey: match.targetGroupKey,
				targetTitle: match.targetTitle,
				similarityPercent: match.similarityPercent,
				driftPercent: match.driftPercent,
				classification: match.classification,
			})),
			survivors: group.survivors.map(f => f.path),
			deletionCandidates: group.deletionCandidates.map(f => f.path),
		})),
	}
	return JSON.stringify(payload, null, 2)
}
