/**
 * Pure multi-format media, document, and text content inspection helpers
 * for side-by-side duplicate comparison (Video, Audio, PDF, and Text/Code/JSON/CSV).
 * Zero DOM dependencies, zero XSS sinks, bounded parsing.
 */

import { isRasterImageMimetype, resolveVisualFileKey } from './visualMediaInspector'

const MAX_BOX_WALK = 64
const MAX_PREVIEW_LINES = 150
const MAX_LINE_LENGTH = 500
const MAX_DIFF_LINES = 200
const MAX_TEXT_INSPECT_BYTES = 65536

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi', 'ogv', '3gp'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wma'])
const TEXT_EXTENSIONS = new Set([
	'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'yml', 'yaml', 'xml',
	'log', 'ini', 'conf', 'cfg', 'env', 'js', 'mjs', 'cjs', 'ts', 'vue',
	'php', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh', 'bash',
	'css', 'scss', 'html', 'htm', 'sql', 'rst', 'toml',
])
const TEXT_MIMETYPES = new Set([
	'application/json',
	'application/ld+json',
	'application/xml',
	'application/javascript',
	'application/x-javascript',
	'application/ecmascript',
	'application/x-yaml',
	'application/yaml',
	'application/sql',
	'application/x-sh',
	'application/x-httpd-php',
])

const MPEG1_L3_BITRATES = Object.freeze([
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
])
const MPEG2_L3_BITRATES = Object.freeze([
	0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
])
const MPEG_SAMPLE_RATES = Object.freeze({
	3: [44100, 48000, 32000], // MPEG 1
	2: [22050, 24000, 16000], // MPEG 2
	0: [11025, 12000, 8000], // MPEG 2.5
})
const CHANNEL_MODES = Object.freeze(['Stereo', 'Joint Stereo', 'Dual Channel', 'Mono'])

/**
 * Strip ASCII control characters from extracted metadata strings safely.
 *
 * @param {string} raw - Raw extracted text.
 * @param {number} [maxLen=120] - Maximum output length.
 * @return {string} Cleaned plain text.
 */
function sanitizePlainMetadata(raw, maxLen = 120) {
	if (typeof raw !== 'string') {
		return ''
	}
	let out = ''
	for (let i = 0; i < raw.length; i++) {
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
	return `${trimmed.slice(0, maxLen - 3)}...`
}

/**
 * Extract lowercase extension without leading dot from a file path.
 *
 * @param {string|null|undefined} filePath - File path or filename.
 * @return {string} Extension or empty string.
 */
function getFileExtension(filePath) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return ''
	}
	const clean = filePath.split(/[?#]/)[0].trim()
	const slash = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'))
	const name = slash >= 0 ? clean.slice(slash + 1) : clean
	const dot = name.lastIndexOf('.')
	if (dot <= 0 || dot === name.length - 1) {
		return ''
	}
	return name.slice(dot + 1).toLowerCase()
}

/**
 * Classify a duplicate file entry into a content inspection category.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {'image'|'video'|'audio'|'pdf'|'text'|'binary'} Content classification.
 */
export function classifyInspectableContent(file) {
	if (!file || typeof file !== 'object') {
		return 'binary'
	}
	const mime = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''
	const ext = getFileExtension(file.path || file.name || '')

	if (isRasterImageMimetype(mime) || mime.startsWith('image/')) {
		return 'image'
	}
	if (mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext)) {
		return 'video'
	}
	if (mime.startsWith('audio/') || AUDIO_EXTENSIONS.has(ext)) {
		return 'audio'
	}
	if (mime === 'application/pdf' || ext === 'pdf') {
		return 'pdf'
	}
	if (mime.startsWith('text/') || TEXT_MIMETYPES.has(mime) || TEXT_EXTENSIONS.has(ext)) {
		return 'text'
	}
	return 'binary'
}

/**
 * Determine whether a file supports Cycle 126 media/document/text inspection.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {boolean} True for video, audio, pdf, or text/code files.
 */
export function isContentInspectableFile(file) {
	const kind = classifyInspectableContent(file)
	return kind === 'video' || kind === 'audio' || kind === 'pdf' || kind === 'text'
}

/**
 * Determine whether a classified content kind supports native HTML5 playback.
 *
 * @param {string} kind - Content kind from classifyInspectableContent.
 * @return {boolean} True for video or audio.
 */
export function isPlayableMediaKind(kind) {
	return kind === 'video' || kind === 'audio'
}

/**
 * Resolve the dominant non-image inspection mode for a pair of files.
 *
 * @param {object|null|undefined} leftFile - Left pane file.
 * @param {object|null|undefined} rightFile - Right pane file.
 * @return {'video'|'audio'|'pdf'|'text'|null} Dominant non-image content mode or null.
 */
export function resolveContentInspectionKind(leftFile, rightFile) {
	const leftKind = classifyInspectableContent(leftFile)
	const rightKind = classifyInspectableContent(rightFile)
	const candidates = [leftKind, rightKind].filter(
		kind => kind === 'video' || kind === 'audio' || kind === 'pdf' || kind === 'text',
	)
	if (candidates.length === 0) {
		return null
	}
	if (candidates[0] === candidates[1] || candidates.length === 1) {
		return candidates[0]
	}
	return candidates[0]
}

/**
 * Validate and normalize a URL to allow only https:// or single-slash relative paths.
 * Rejects javascript:, data:, vbscript:, http:// (unless explicitly safe relative), and protocol-relative //.
 *
 * @param {string|null|undefined} rawUrl - Candidate URL.
 * @return {string} Safe URL or empty string.
 */
export function sanitizeContentUrl(rawUrl) {
	if (typeof rawUrl !== 'string') {
		return ''
	}
	const trimmed = rawUrl.trim()
	if (!trimmed) {
		return ''
	}
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
		return trimmed
	}
	if (/^https:\/\//i.test(trimmed)) {
		return trimmed
	}
	return ''
}

/**
 * Format duration in seconds into MM:SS or H:MM:SS.
 *
 * @param {number|null|undefined} seconds - Duration in seconds.
 * @return {string} Formatted duration or empty string.
 */
export function formatMediaDuration(seconds) {
	const val = Number(seconds)
	if (!Number.isFinite(val) || val <= 0) {
		return ''
	}
	const rounded = Math.round(val)
	if (rounded < 1) {
		return `${Math.round(val * 10) / 10} s`
	}
	const hours = Math.floor(rounded / 3600)
	const mins = Math.floor((rounded % 3600) / 60)
	const secs = rounded % 60
	const pad = n => String(n).padStart(2, '0')
	if (hours > 0) {
		return `${hours}:${pad(mins)}:${pad(secs)}`
	}
	return `${pad(mins)}:${pad(secs)}`
}

/**
 * Format audio stream channels, sample rate, and bit depth into a concise label.
 *
 * @param {object|null|undefined} info - Parsed media header object.
 * @return {string} Formatted audio stream string or empty string.
 */
export function formatAudioStreamSummary(info) {
	if (!info || typeof info !== 'object') {
		return ''
	}
	const parts = []
	if (info.channelLabel) {
		parts.push(info.channelLabel)
	} else if (Number(info.channels) > 0) {
		const ch = Number(info.channels)
		parts.push(ch === 1 ? 'Mono' : (ch === 2 ? 'Stereo' : `${ch} ch`))
	}
	if (Number(info.sampleRate) > 0) {
		const khz = Math.round((Number(info.sampleRate) / 1000) * 10) / 10
		parts.push(`${khz} kHz`)
	}
	if (Number(info.bitsPerSample) > 0) {
		parts.push(`${Number(info.bitsPerSample)}-bit`)
	}
	return parts.join(', ')
}

/**
 * Read 4 ASCII characters safely from a DataView.
 *
 * @param {DataView} view - Binary DataView.
 * @param {number} offset - Start byte offset.
 * @param {number} [length=4] - Byte length.
 * @return {string} ASCII string.
 */
function readAscii(view, offset, length = 4) {
	if (offset < 0 || offset + length > view.byteLength) {
		return ''
	}
	let out = ''
	for (let i = 0; i < length; i++) {
		out += String.fromCharCode(view.getUint8(offset + i))
	}
	return out
}

/**
 * Parse ISO Base Media File Format (MP4 / MOV / M4A) headers safely.
 *
 * @param {Uint8Array} bytes - Binary header bytes.
 * @param {DataView} view - DataView wrapping bytes.
 * @return {object|null} Parsed container metadata or null.
 */
function parseIsoBmffHeader(bytes, view) {
	if (bytes.byteLength < 12 || readAscii(view, 4, 4) !== 'ftyp') {
		return null
	}
	const majorBrand = readAscii(view, 8, 4)
	let format = 'MP4'
	if (majorBrand === 'qt  ') {
		format = 'MOV'
	} else if (majorBrand === 'M4A ') {
		format = 'M4A'
	} else if (majorBrand === '3gp4' || majorBrand === '3gp5') {
		format = '3GP'
	}

	let durationSeconds = 0
	let width = 0
	let height = 0

	const scanBoxes = (start, end, depth) => {
		if (depth > 4) {
			return
		}
		let offset = start
		let guard = 0
		while (offset + 8 <= end && guard < MAX_BOX_WALK) {
			guard += 1
			let size = view.getUint32(offset, false)
			const type = readAscii(view, offset + 4, 4)
			let headerSize = 8
			if (size === 1 && offset + 16 <= end) {
				const hi = view.getUint32(offset + 8, false)
				const lo = view.getUint32(offset + 12, false)
				size = (hi * 4294967296) + lo
				headerSize = 16
			} else if (size === 0) {
				size = end - offset
			}
			if (size < headerSize || offset + size > end + 4096) {
				break
			}
			const boxEnd = Math.min(end, offset + size)
			const payloadStart = offset + headerSize

			if (type === 'mvhd' && payloadStart + 20 <= boxEnd) {
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
			} else if (type === 'moov' || type === 'trak') {
				scanBoxes(payloadStart, boxEnd, depth + 1)
			}

			offset += size
		}
	}

	scanBoxes(0, bytes.byteLength, 0)

	return {
		kind: format === 'M4A' ? 'audio' : 'video',
		format,
		brand: majorBrand.trim(),
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatMediaDuration(durationSeconds),
		width,
		height,
	}
}

/**
 * Parse RIFF (WAV audio or AVI video) container headers safely.
 *
 * @param {Uint8Array} bytes - Binary header bytes.
 * @param {DataView} view - DataView wrapping bytes.
 * @return {object|null} Parsed container metadata or null.
 */
function parseRiffHeader(bytes, view) {
	if (bytes.byteLength < 12 || readAscii(view, 0, 4) !== 'RIFF') {
		return null
	}
	const formType = readAscii(view, 8, 4)
	if (formType === 'WAVE') {
		let channels = 0
		let sampleRate = 0
		let bitsPerSample = 0
		let byteRate = 0
		let audioFormat = 0
		let dataSize = 0
		let offset = 12
		let guard = 0
		while (offset + 8 <= bytes.byteLength && guard < MAX_BOX_WALK) {
			guard += 1
			const chunkId = readAscii(view, offset, 4)
			const chunkSize = view.getUint32(offset + 4, true)
			const payload = offset + 8
			if (chunkId === 'fmt ' && payload + 16 <= bytes.byteLength) {
				audioFormat = view.getUint16(payload, true)
				channels = view.getUint16(payload + 2, true)
				sampleRate = view.getUint32(payload + 4, true)
				byteRate = view.getUint32(payload + 8, true)
				bitsPerSample = view.getUint16(payload + 14, true)
			} else if (chunkId === 'data') {
				dataSize = chunkSize
				break
			}
			const step = 8 + chunkSize + (chunkSize % 2)
			if (step <= 8) {
				break
			}
			offset += step
		}
		const durationSeconds = byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0
		const bitrateKbps = byteRate > 0 ? Math.round((byteRate * 8) / 1000) : 0
		const codecLabel = audioFormat === 1 ? 'WAV (PCM)' : (audioFormat === 3 ? 'WAV (Float)' : 'WAV')
		return {
			kind: 'audio',
			format: codecLabel,
			channels,
			sampleRate,
			bitsPerSample,
			bitrateKbps,
			durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
			durationFormatted: formatMediaDuration(durationSeconds),
		}
	}

	if (formType === 'AVI ') {
		let offset = 12
		let guard = 0
		while (offset + 8 <= bytes.byteLength && guard < MAX_BOX_WALK) {
			guard += 1
			const chunkId = readAscii(view, offset, 4)
			const chunkSize = view.getUint32(offset + 4, true)
			if (chunkId === 'LIST' && offset + 12 <= bytes.byteLength) {
				offset += 12
				continue
			}
			if (chunkId === 'avih' && offset + 48 <= bytes.byteLength) {
				const p = offset + 8
				const microSecPerFrame = view.getUint32(p, true)
				const totalFrames = view.getUint32(p + 16, true)
				const width = view.getUint32(p + 32, true)
				const height = view.getUint32(p + 36, true)
				const durationSeconds = microSecPerFrame > 0 && totalFrames > 0
					? (microSecPerFrame * totalFrames) / 1000000
					: 0
				return {
					kind: 'video',
					format: 'AVI',
					width,
					height,
					durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
					durationFormatted: formatMediaDuration(durationSeconds),
				}
			}
			const step = 8 + chunkSize + (chunkSize % 2)
			if (step <= 8) {
				break
			}
			offset += step
		}
	}

	return null
}

/**
 * Parse FLAC STREAMINFO header safely.
 *
 * @param {Uint8Array} bytes - Binary header bytes.
 * @param {DataView} view - DataView wrapping bytes.
 * @return {object|null} Parsed FLAC metadata or null.
 */
function parseFlacHeader(bytes, view) {
	if (bytes.byteLength < 42 || readAscii(view, 0, 4) !== 'fLaC') {
		return null
	}
	const blockType = bytes[4] & 0x7f
	if (blockType !== 0) {
		return { kind: 'audio', format: 'FLAC' }
	}
	// STREAMINFO starts at byte 8; sampleRate/channels/bps/totalSamples start at byte 18
	const sampleRate = (bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4)
	const channels = ((bytes[20] >> 1) & 0x07) + 1
	const bitsPerSample = (((bytes[20] & 0x01) << 4) | (bytes[21] >> 4)) + 1
	const totalSamplesHi = bytes[21] & 0x0f
	const totalSamplesLo = view.getUint32(22, false)
	const totalSamples = (totalSamplesHi * 4294967296) + totalSamplesLo
	const durationSeconds = sampleRate > 0 && totalSamples > 0 ? totalSamples / sampleRate : 0

	return {
		kind: 'audio',
		format: 'FLAC',
		channels,
		sampleRate,
		bitsPerSample,
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatMediaDuration(durationSeconds),
	}
}

/**
 * Parse OGG (Opus / Vorbis) header safely.
 *
 * @param {Uint8Array} bytes - Binary header bytes.
 * @param {DataView} view - DataView wrapping bytes.
 * @return {object|null} Parsed OGG metadata or null.
 */
function parseOggHeader(bytes, view) {
	if (bytes.byteLength < 36 || readAscii(view, 0, 4) !== 'OggS') {
		return null
	}
	const segmentCount = bytes[26]
	const payloadOffset = 27 + segmentCount
	if (payloadOffset + 16 > bytes.byteLength) {
		return { kind: 'audio', format: 'OGG' }
	}
	if (readAscii(view, payloadOffset, 8) === 'OpusHead' && payloadOffset + 16 <= bytes.byteLength) {
		const channels = bytes[payloadOffset + 9]
		const sampleRate = view.getUint32(payloadOffset + 12, true)
		return {
			kind: 'audio',
			format: 'OGG (Opus)',
			channels,
			sampleRate: sampleRate > 0 ? sampleRate : 48000,
		}
	}
	if (bytes[payloadOffset] === 1 && readAscii(view, payloadOffset + 1, 6) === 'vorbis' && payloadOffset + 24 <= bytes.byteLength) {
		const channels = bytes[payloadOffset + 11]
		const sampleRate = view.getUint32(payloadOffset + 12, true)
		const bitrateNominal = view.getInt32(payloadOffset + 20, true)
		return {
			kind: 'audio',
			format: 'OGG (Vorbis)',
			channels,
			sampleRate,
			bitrateKbps: bitrateNominal > 0 ? Math.round(bitrateNominal / 1000) : 0,
		}
	}
	return { kind: 'audio', format: 'OGG' }
}

/**
 * Decode an ID3v2 text frame payload into a clean string.
 *
 * @param {Uint8Array} bytes - Byte array.
 * @param {number} start - Payload start offset.
 * @param {number} length - Frame byte length.
 * @return {string} Decoded metadata string.
 */
function readId3TextFrame(bytes, start, length) {
	if (length <= 1 || start + length > bytes.byteLength) {
		return ''
	}
	const encoding = bytes[start]
	const slice = bytes.subarray(start + 1, start + length)
	let raw = ''
	if (encoding === 1 || encoding === 2) {
		// UTF-16: strip BOM and decode 16-bit code units safely
		const littleEndian = encoding === 1 && slice.length >= 2 && slice[0] === 0xff && slice[1] === 0xfe
		const textStart = (encoding === 1 && slice.length >= 2 && ((slice[0] === 0xff && slice[1] === 0xfe) || (slice[0] === 0xfe && slice[1] === 0xff))) ? 2 : 0
		for (let i = textStart; i + 1 < slice.length; i += 2) {
			const code = littleEndian ? (slice[i] | (slice[i + 1] << 8)) : ((slice[i] << 8) | slice[i + 1])
			if (code === 0) {
				break
			}
			raw += String.fromCharCode(code)
		}
	} else if (encoding === 3 && typeof TextDecoder === 'function') {
		raw = new TextDecoder('utf-8', { fatal: false }).decode(slice)
	} else {
		for (let i = 0; i < slice.length; i++) {
			if (slice[i] === 0) {
				break
			}
			raw += String.fromCharCode(slice[i])
		}
	}
	return sanitizePlainMetadata(raw, 100)
}

/**
 * Parse MP3 ID3v2 tags and MPEG audio frame header safely.
 *
 * @param {Uint8Array} bytes - Binary header bytes.
 * @param {DataView} view - DataView wrapping bytes.
 * @return {object|null} Parsed MP3 metadata or null.
 */
function parseMp3Header(bytes, view) {
	let scanOffset = 0
	let id3Version = ''
	let title = ''
	let artist = ''
	let album = ''

	if (bytes.byteLength >= 10 && readAscii(view, 0, 3) === 'ID3') {
		const major = bytes[3]
		id3Version = `ID3v2.${major}`
		const tagSize = ((bytes[6] & 0x7f) << 21)
			| ((bytes[7] & 0x7f) << 14)
			| ((bytes[8] & 0x7f) << 7)
			| (bytes[9] & 0x7f)
		const tagEnd = Math.min(bytes.byteLength, 10 + tagSize)
		let framePos = 10
		let guard = 0
		if (major >= 3) {
			while (framePos + 10 <= tagEnd && guard < 64) {
				guard += 1
				const frameId = readAscii(view, framePos, 4)
				if (!/^[A-Z0-9]{4}$/.test(frameId)) {
					break
				}
				const frameSize = major === 4
					? (((bytes[framePos + 4] & 0x7f) << 21)
						| ((bytes[framePos + 5] & 0x7f) << 14)
						| ((bytes[framePos + 6] & 0x7f) << 7)
						| (bytes[framePos + 7] & 0x7f))
					: view.getUint32(framePos + 4, false)
				if (frameSize <= 0 || framePos + 10 + frameSize > tagEnd) {
					break
				}
				if (frameId === 'TIT2' && !title) {
					title = readId3TextFrame(bytes, framePos + 10, frameSize)
				} else if (frameId === 'TPE1' && !artist) {
					artist = readId3TextFrame(bytes, framePos + 10, frameSize)
				} else if (frameId === 'TALB' && !album) {
					album = readId3TextFrame(bytes, framePos + 10, frameSize)
				}
				framePos += 10 + frameSize
			}
		}
		scanOffset = Math.min(bytes.byteLength, 10 + tagSize)
	}

	let bitrateKbps = 0
	let sampleRate = 0
	let channelLabel = ''
	let channels = 0

	const limit = Math.min(bytes.byteLength - 4, scanOffset + 4096)
	for (let i = scanOffset; i <= limit; i++) {
		if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
			continue
		}
		const versionBits = (bytes[i + 1] >> 3) & 0x03
		const layerBits = (bytes[i + 1] >> 1) & 0x03
		const bitrateIdx = (bytes[i + 2] >> 4) & 0x0f
		const sampleIdx = (bytes[i + 2] >> 2) & 0x03
		const chModeIdx = (bytes[i + 3] >> 6) & 0x03

		if (versionBits === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || sampleIdx === 3) {
			continue
		}
		const rates = MPEG_SAMPLE_RATES[versionBits]
		if (!rates) {
			continue
		}
		sampleRate = rates[sampleIdx]
		bitrateKbps = versionBits === 3
			? MPEG1_L3_BITRATES[bitrateIdx]
			: MPEG2_L3_BITRATES[bitrateIdx]
		channelLabel = CHANNEL_MODES[chModeIdx] || 'Stereo'
		channels = chModeIdx === 3 ? 1 : 2
		break
	}

	if (!id3Version && !bitrateKbps && !sampleRate) {
		return null
	}

	return {
		kind: 'audio',
		format: id3Version ? `MP3 (${id3Version})` : 'MP3',
		bitrateKbps,
		sampleRate,
		channels,
		channelLabel,
		title,
		artist,
		album,
	}
}

/**
 * Parse PDF document header (%PDF-1.x, page count hint, encryption, title/producer).
 *
 * @param {Uint8Array} bytes - Binary PDF header bytes.
 * @return {object|null} Parsed PDF metadata or null.
 */
function parsePdfHeader(bytes) {
	if (bytes.byteLength < 8) {
		return null
	}
	const headLen = Math.min(bytes.byteLength, 32768)
	let ascii = ''
	for (let i = 0; i < headLen; i++) {
		const b = bytes[i]
		ascii += (b >= 32 && b <= 126) || b === 10 || b === 13 ? String.fromCharCode(b) : ' '
	}
	const versionMatch = ascii.match(/%PDF-(\d+\.\d+)/)
	if (!versionMatch) {
		return null
	}

	const version = versionMatch[1]
	const encrypted = /\/Encrypt\b/.test(ascii)

	let pageCount = 0
	const pagesCountMatch = ascii.match(/\/Type\s*\/Pages\b[\s\S]{0,240}?\/Count\s+(\d+)/)
	if (pagesCountMatch) {
		pageCount = Number(pagesCountMatch[1]) || 0
	} else {
		const pageMatches = ascii.match(/\/Type\s*\/Page\b(?!s)/g)
		if (pageMatches) {
			pageCount = pageMatches.length
		}
	}

	const titleMatch = ascii.match(/\/Title\s*\(([^()]{1,120})\)/)
	const producerMatch = ascii.match(/\/Producer\s*\(([^()]{1,120})\)/)

	return {
		kind: 'pdf',
		format: `PDF ${version}`,
		version,
		encrypted,
		pageCount,
		title: titleMatch ? sanitizePlainMetadata(titleMatch[1], 100) : '',
		producer: producerMatch ? sanitizePlainMetadata(producerMatch[1], 80) : '',
	}
}

/**
 * Inspect plain text, code, JSON, or CSV payload safely.
 *
 * @param {string|Uint8Array|ArrayBuffer|null|undefined} input - Text string or raw bytes.
 * @param {object|null|undefined} [file] - Optional file object for extension/MIME hints.
 * @return {object|null} Parsed text summary + bounded preview lines or null.
 */
export function inspectTextContent(input, file = null) {
	if (input === null || input === undefined) {
		return null
	}
	let text = ''
	let encoding = 'UTF-8'

	if (typeof input === 'string') {
		text = input
	} else {
		const bytes = input instanceof Uint8Array
			? input
			: (input instanceof ArrayBuffer ? new Uint8Array(input) : null)
		if (!bytes) {
			return null
		}
		const bounded = bytes.byteLength > MAX_TEXT_INSPECT_BYTES
			? bytes.subarray(0, MAX_TEXT_INSPECT_BYTES)
			: bytes
		for (let i = 0; i < Math.min(bounded.byteLength, 4096); i++) {
			if (bounded[i] === 0) {
				// Ignore NUL bytes only if UTF-16 BOM is present
				const hasUtf16Bom = bounded.byteLength >= 2
					&& ((bounded[0] === 0xff && bounded[1] === 0xfe) || (bounded[0] === 0xfe && bounded[1] === 0xff))
				if (!hasUtf16Bom) {
					return null
				}
				break
			}
		}
		let slice = bounded
		if (bounded.byteLength >= 3 && bounded[0] === 0xef && bounded[1] === 0xbb && bounded[2] === 0xbf) {
			encoding = 'UTF-8 BOM'
			slice = bounded.subarray(3)
		} else if (bounded.byteLength >= 2 && bounded[0] === 0xff && bounded[1] === 0xfe) {
			encoding = 'UTF-16 LE'
			slice = bounded.subarray(2)
		} else if (bounded.byteLength >= 2 && bounded[0] === 0xfe && bounded[1] === 0xff) {
			encoding = 'UTF-16 BE'
			slice = bounded.subarray(2)
		}

		if (typeof TextDecoder === 'function') {
			const decoderName = encoding === 'UTF-16 LE'
				? 'utf-16le'
				: (encoding === 'UTF-16 BE' ? 'utf-16be' : 'utf-8')
			try {
				text = new TextDecoder(decoderName, { fatal: false }).decode(slice)
			} catch (error) {
				text = ''
				for (let i = 0; i < slice.byteLength; i++) {
					text += String.fromCharCode(slice[i])
				}
			}
		} else {
			for (let i = 0; i < slice.byteLength; i++) {
				text += String.fromCharCode(slice[i])
			}
		}
	}

	const crlfCount = (text.match(/\r\n/g) || []).length
	const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
	const lfCount = (text.replace(/\r\n/g, '').match(/\n/g) || []).length
	let lineEnding = 'Single line'
	if (crlfCount > 0 && lfCount > 0) {
		lineEnding = 'Mixed (CRLF/LF)'
	} else if (crlfCount > 0) {
		lineEnding = 'CRLF'
	} else if (lfCount > 0) {
		lineEnding = 'LF'
	}

	const rawLines = normalized === '' ? [] : normalized.split('\n')
	const lineCount = rawLines.length
	const nonEmptyLineCount = rawLines.filter(line => line.trim() !== '').length
	const words = normalized.trim() ? normalized.trim().split(/\s+/).length : 0

	const ext = getFileExtension(file?.path || file?.name || '')
	const mime = typeof file?.mimetype === 'string' ? file.mimetype.toLowerCase() : ''
	let structuredSummary = ''

	if (ext === 'json' || mime.includes('json')) {
		try {
			const parsed = JSON.parse(normalized)
			if (Array.isArray(parsed)) {
				structuredSummary = `JSON Array (${parsed.length} items)`
			} else if (parsed && typeof parsed === 'object') {
				structuredSummary = `JSON Object (${Object.keys(parsed).length} keys)`
			} else {
				structuredSummary = `JSON (${typeof parsed})`
			}
		} catch (err) {
			structuredSummary = 'JSON (syntax/truncated)'
		}
	} else if ((ext === 'csv' || ext === 'tsv' || mime.includes('csv')) && rawLines.length > 0) {
		const header = rawLines[0]
		const delimiter = ext === 'tsv' || header.includes('\t')
			? '\t'
			: (header.includes(';') && !header.includes(',') ? ';' : ',')
		const cols = header.split(delimiter).length
		const delimLabel = delimiter === '\t' ? 'Tab' : delimiter
		structuredSummary = `${cols} cols (${delimLabel}), ${lineCount} rows`
	}

	const previewLines = rawLines.slice(0, MAX_PREVIEW_LINES).map((lineText, idx) => ({
		lineNumber: idx + 1,
		text: lineText.length > MAX_LINE_LENGTH
			? `${lineText.slice(0, MAX_LINE_LENGTH - 3)}...`
			: lineText,
	}))

	return {
		kind: 'text',
		format: `${encoding} (${lineEnding})`,
		encoding,
		lineEnding,
		lineCount,
		nonEmptyLineCount,
		wordCount: words,
		charCount: normalized.length,
		structuredSummary,
		rawText: normalized,
		previewLines,
		truncated: rawLines.length > MAX_PREVIEW_LINES,
	}
}

/**
 * Parse binary or text header bytes into a unified media/document/text metadata record.
 *
 * @param {ArrayBuffer|Uint8Array|string|null|undefined} input - File payload or header bytes.
 * @param {object|null|undefined} [file] - Duplicate file entry for MIME/extension context.
 * @return {object|null} Parsed header descriptor or null.
 */
export function parseMediaOrDocumentHeader(input, file = null) {
	if (!input) {
		return null
	}
	if (typeof input === 'string') {
		return inspectTextContent(input, file)
	}
	const bytes = input instanceof Uint8Array
		? input
		: (input instanceof ArrayBuffer ? new Uint8Array(input) : null)
	if (!bytes || bytes.byteLength === 0) {
		return null
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

	const iso = parseIsoBmffHeader(bytes, view)
	if (iso) {
		return iso
	}

	const riff = parseRiffHeader(bytes, view)
	if (riff) {
		return riff
	}

	const flac = parseFlacHeader(bytes, view)
	if (flac) {
		return flac
	}

	const ogg = parseOggHeader(bytes, view)
	if (ogg) {
		return ogg
	}

	const pdf = parsePdfHeader(bytes)
	if (pdf) {
		return pdf
	}

	const contentKind = classifyInspectableContent(file)
	if (contentKind === 'audio' || readAscii(view, 0, 3) === 'ID3') {
		const mp3 = parseMp3Header(bytes, view)
		if (mp3) {
			return mp3
		}
	}

	if (contentKind === 'text') {
		return inspectTextContent(bytes, file)
	}

	return null
}

/**
 * Compute a bounded side-by-side line diff between two text strings.
 *
 * @param {string|null|undefined} leftText - Left text content.
 * @param {string|null|undefined} rightText - Right text content.
 * @param {object} [options] - Diff options.
 * @param {number} [options.maxLines=MAX_DIFF_LINES] - Maximum lines per side to align.
 * @return {{
 *   rows: Array<{ rowNumber: number, leftLineNum: number|null, rightLineNum: number|null, leftText: string, rightText: string, status: 'equal'|'changed'|'added'|'removed' }>,
 *   summary: { totalRows: number, equalLines: number, changedLines: number, addedLines: number, removedLines: number, identical: boolean }
 * }} Aligned diff rows and summary.
 */
export function computeTextLineDiff(leftText, rightText, options = {}) {
	const maxLines = Number.isInteger(options.maxLines) && options.maxLines > 0
		? Math.min(MAX_DIFF_LINES, options.maxLines)
		: MAX_DIFF_LINES

	const splitLines = text => {
		if (typeof text !== 'string' || text.length === 0) {
			return []
		}
		return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').slice(0, maxLines)
	}

	const a = splitLines(leftText)
	const b = splitLines(rightText)
	const n = a.length
	const m = b.length

	// LCS DP table (bounded to maxLines <= 200 so memory is <= 40k ints)
	const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			if (a[i] === b[j]) {
				dp[i][j] = dp[i + 1][j + 1] + 1
			} else {
				dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1]
			}
		}
	}

	const rawOps = []
	let i = 0
	let j = 0
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			rawOps.push({ type: 'equal', leftIdx: i, rightIdx: j })
			i += 1
			j += 1
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			rawOps.push({ type: 'removed', leftIdx: i })
			i += 1
		} else {
			rawOps.push({ type: 'added', rightIdx: j })
			j += 1
		}
	}
	while (i < n) {
		rawOps.push({ type: 'removed', leftIdx: i })
		i += 1
	}
	while (j < m) {
		rawOps.push({ type: 'added', rightIdx: j })
		j += 1
	}

	// Pair consecutive removed + added operations into 'changed' side-by-side rows
	const rows = []
	let equalLines = 0
	let changedLines = 0
	let addedLines = 0
	let removedLines = 0

	let opIdx = 0
	while (opIdx < rawOps.length) {
		const op = rawOps[opIdx]
		if (op.type === 'equal') {
			equalLines += 1
			rows.push({
				rowNumber: rows.length + 1,
				leftLineNum: op.leftIdx + 1,
				rightLineNum: op.rightIdx + 1,
				leftText: a[op.leftIdx],
				rightText: b[op.rightIdx],
				status: 'equal',
			})
			opIdx += 1
		} else if (op.type === 'removed' && rawOps[opIdx + 1] && rawOps[opIdx + 1].type === 'added') {
			const nextOp = rawOps[opIdx + 1]
			changedLines += 1
			rows.push({
				rowNumber: rows.length + 1,
				leftLineNum: op.leftIdx + 1,
				rightLineNum: nextOp.rightIdx + 1,
				leftText: a[op.leftIdx],
				rightText: b[nextOp.rightIdx],
				status: 'changed',
			})
			opIdx += 2
		} else if (op.type === 'removed') {
			removedLines += 1
			rows.push({
				rowNumber: rows.length + 1,
				leftLineNum: op.leftIdx + 1,
				rightLineNum: null,
				leftText: a[op.leftIdx],
				rightText: '',
				status: 'removed',
			})
			opIdx += 1
		} else {
			addedLines += 1
			rows.push({
				rowNumber: rows.length + 1,
				leftLineNum: null,
				rightLineNum: op.rightIdx + 1,
				leftText: '',
				rightText: b[op.rightIdx],
				status: 'added',
			})
			opIdx += 1
		}
	}

	return {
		rows,
		summary: {
			totalRows: rows.length,
			equalLines,
			changedLines,
			addedLines,
			removedLines,
			identical: changedLines === 0 && addedLines === 0 && removedLines === 0,
		},
	}
}

/**
 * Compute a deterministic quality/richness score for non-image media or document copies.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @param {object|null|undefined} parsed - Parsed header metadata.
 * @return {{ score: number, reasonKey: string }} Score and primary advantage reason.
 */
function scoreMediaOrDocumentQuality(file, parsed) {
	if (!file || typeof file !== 'object') {
		return { score: 0, reasonKey: '' }
	}
	const info = parsed && typeof parsed === 'object' ? parsed : {}
	const w = Number(info.width || file.width || 0)
	const h = Number(info.height || file.height || 0)
	const bitrate = Number(info.bitrateKbps || file.bitrateKbps || 0)
	const sampleRate = Number(info.sampleRate || file.sampleRate || 0)
	const size = Number(file.size || 0)

	let score = 0
	let reasonKey = ''

	if (w > 0 && h > 0) {
		score += (w * h)
		reasonKey = 'higher_resolution'
	}
	if (bitrate > 0) {
		score += bitrate * 100
		if (!reasonKey) {
			reasonKey = 'higher_bitrate'
		}
	}
	if (sampleRate > 0) {
		score += sampleRate
		if (!reasonKey) {
			reasonKey = 'higher_sample_rate'
		}
	}
	if (info.kind === 'pdf' && info.encrypted === false) {
		score += 500
	}
	if (info.title || info.artist || info.producer) {
		score += 200
		if (!reasonKey) {
			reasonKey = 'richer_metadata'
		}
	}
	if (score === 0 && size > 0) {
		score = size
	}
	return { score, reasonKey }
}

/**
 * Evaluate non-image media/document quality winners across duplicate copies.
 *
 * @param {Array<object>} files - Files in the duplicate group.
 * @param {object} [parsedByKey={}] - Map of file key to parsed header metadata.
 * @return {{
 *   hasContentMedia: boolean,
 *   hasQualitySpread: boolean,
 *   winnerIndex: number,
 *   reasonKey: string,
 *   perFile: Array<{ isQualityWinner: boolean, isLowerQuality: boolean, reasonKey: string }>
 * }} Quality evaluation result.
 */
export function evaluateMediaContentQuality(files, parsedByKey = {}) {
	const list = Array.isArray(files) ? files : []
	const map = parsedByKey && typeof parsedByKey === 'object' ? parsedByKey : {}
	const perFile = list.map(() => ({
		isQualityWinner: false,
		isLowerQuality: false,
		reasonKey: '',
	}))

	const hasContentMedia = list.some(file => isContentInspectableFile(file))
	if (!hasContentMedia || list.length < 2) {
		return {
			hasContentMedia,
			hasQualitySpread: false,
			winnerIndex: -1,
			reasonKey: '',
			perFile,
		}
	}

	const scored = list.map(file => {
		const key = resolveVisualFileKey(file)
		const parsed = key !== null ? map[key] : null
		return scoreMediaOrDocumentQuality(file, parsed)
	})

	const positiveScores = scored.map(item => item.score).filter(s => s > 0)
	if (positiveScores.length < 2) {
		return {
			hasContentMedia,
			hasQualitySpread: false,
			winnerIndex: -1,
			reasonKey: '',
			perFile,
		}
	}

	const maxScore = Math.max(...positiveScores)
	const minScore = Math.min(...positiveScores)
	if (maxScore === minScore) {
		return {
			hasContentMedia,
			hasQualitySpread: false,
			winnerIndex: -1,
			reasonKey: '',
			perFile,
		}
	}

	const winnerIndex = scored.findIndex(item => item.score === maxScore)
	const winnerReason = scored[winnerIndex]?.reasonKey || 'richer_metadata'
	scored.forEach((item, idx) => {
		if (item.score === maxScore) {
			perFile[idx] = {
				isQualityWinner: true,
				isLowerQuality: false,
				reasonKey: winnerReason,
			}
		} else if (item.score > 0 && item.score < maxScore) {
			perFile[idx] = {
				isQualityWinner: false,
				isLowerQuality: true,
				reasonKey: winnerReason,
			}
		}
	})

	return {
		hasContentMedia,
		hasQualitySpread: true,
		winnerIndex,
		reasonKey: winnerReason,
		perFile,
	}
}

/**
 * Build comparison diff rows for non-image media, PDF, and text/code inspection.
 *
 * @param {object|null|undefined} leftFile - Left pane file.
 * @param {object|null|undefined} rightFile - Right pane file.
 * @param {object} [options] - Parsed metadata and localization labels.
 * @return {{ rows: Array<object>, diffCount: number }} Content inspection diff rows.
 */
export function buildContentInspectionDiffRows(leftFile, rightFile, options = {}) {
	const leftParsed = options.leftParsed && typeof options.leftParsed === 'object' ? options.leftParsed : null
	const rightParsed = options.rightParsed && typeof options.rightParsed === 'object' ? options.rightParsed : null
	const unavailableLabel = options.unavailableLabel || 'Unavailable'

	if (!leftParsed && !rightParsed) {
		return { rows: [], diffCount: 0 }
	}

	const formatDimensions = info => {
		if (!info || !Number(info.width) || !Number(info.height)) {
			return ''
		}
		return `${info.width} x ${info.height} px`
	}

	const formatTags = info => {
		if (!info) {
			return ''
		}
		const parts = []
		if (info.artist) {
			parts.push(info.artist)
		}
		if (info.title) {
			parts.push(info.title)
		}
		if (info.album) {
			parts.push(info.album)
		}
		if (info.producer) {
			parts.push(info.producer)
		}
		return parts.join(' / ')
	}

	const formatDocStats = info => {
		if (!info) {
			return ''
		}
		if (info.kind === 'pdf') {
			const parts = []
			if (Number(info.pageCount) > 0) {
				parts.push(`${info.pageCount} pages`)
			}
			parts.push(info.encrypted ? 'Encrypted' : 'Unencrypted')
			return parts.join(', ')
		}
		if (info.kind === 'text') {
			const parts = [`${info.lineCount} lines`, `${info.wordCount} words`]
			if (info.structuredSummary) {
				parts.push(info.structuredSummary)
			}
			return parts.join(', ')
		}
		return ''
	}

	const candidates = [
		{
			key: 'contentFormat',
			left: leftParsed?.format || '',
			right: rightParsed?.format || '',
		},
		{
			key: 'duration',
			left: leftParsed?.durationFormatted || '',
			right: rightParsed?.durationFormatted || '',
		},
		{
			key: 'mediaDimensions',
			left: formatDimensions(leftParsed),
			right: formatDimensions(rightParsed),
		},
		{
			key: 'audioStream',
			left: formatAudioStreamSummary(leftParsed),
			right: formatAudioStreamSummary(rightParsed),
		},
		{
			key: 'bitrate',
			left: Number(leftParsed?.bitrateKbps) > 0 ? `${leftParsed.bitrateKbps} kbps` : '',
			right: Number(rightParsed?.bitrateKbps) > 0 ? `${rightParsed.bitrateKbps} kbps` : '',
		},
		{
			key: 'mediaTags',
			left: formatTags(leftParsed),
			right: formatTags(rightParsed),
		},
		{
			key: 'documentStats',
			left: formatDocStats(leftParsed),
			right: formatDocStats(rightParsed),
		},
	]

	const rows = []
	let diffCount = 0
	for (const item of candidates) {
		if (!item.left && !item.right) {
			continue
		}
		const leftValue = item.left || unavailableLabel
		const rightValue = item.right || unavailableLabel
		const isDiff = leftValue !== rightValue
		if (isDiff) {
			diffCount += 1
		}
		rows.push({
			key: item.key,
			leftValue,
			rightValue,
			isDiff,
		})
	}

	return { rows, diffCount }
}
