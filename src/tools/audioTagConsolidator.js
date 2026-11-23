/**
 * Pure audio duplicate inspection, ID3v2/ID3v1/Vorbis/FLAC/M4A/WAV tag parsing,
 * bitrate & lossless quality scoring, cross-format track matching, and album tag
 * consolidation helpers.
 * Zero DOM dependencies, zero XSS sinks, bounded memory/CPU parsing.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import {
	escapeCsvCell,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
} from './duplicateSelectionAndExport'

export const AUDIO_CONSOLIDATOR_SCHEMA = 'duplicatefinder.audio-tag-consolidator.v1'
export const MAX_AUDIO_FETCH_BYTES = 2 * 1024 * 1024
export const AUDIO_RANGE_HEAD_BYTES = 65536
export const AUDIO_RANGE_TAIL_BYTES = 256
const MAX_ID3_FRAMES = 96
const MAX_CONTAINER_BOXES = 64

export const AUDIO_EXTENSIONS = Object.freeze([
	'mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wav', 'wma', 'alac', 'aiff', 'aif', 'ape',
])

export const LOSSLESS_EXTENSIONS = new Set(['flac', 'wav', 'alac', 'aiff', 'aif', 'ape'])

export const AUDIO_KEEP_RULES = Object.freeze([
	'balanced_master',
	'highest_quality',
	'most_complete_tags',
	'oldest',
	'newest',
	'shortest_path',
])

const AUDIO_EXTENSION_SET = new Set(AUDIO_EXTENSIONS)

const MPEG1_L3_BITRATES = Object.freeze([
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
])
const MPEG2_L3_BITRATES = Object.freeze([
	0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0,
])
const MPEG_SAMPLE_RATES = Object.freeze({
	3: [44100, 48000, 32000],
	2: [22050, 24000, 16000],
	0: [11025, 12000, 8000],
})
const CHANNEL_MODES = Object.freeze(['Stereo', 'Joint Stereo', 'Dual Channel', 'Mono'])

const ID3V1_GENRES = Object.freeze([
	'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
	'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap',
	'Reggae', 'Rock', 'Techno', 'Industrial', 'Alternative', 'Ska', 'Death Metal', 'Pranks',
	'Soundtrack', 'Euro-Techno', 'Ambient', 'Trip-Hop', 'Vocal', 'Jazz+Funk', 'Fusion', 'Trance',
	'Classical', 'Instrumental', 'Acid', 'House', 'Game', 'Sound Clip', 'Gospel', 'Noise',
	'AlternRock', 'Bass', 'Soul', 'Punk', 'Space', 'Meditative', 'Instrumental Pop', 'Instrumental Rock',
	'Ethnic', 'Gothic', 'Darkwave', 'Techno-Industrial', 'Electronic', 'Pop-Folk', 'Eurodance', 'Dream',
	'Southern Rock', 'Comedy', 'Cult', 'Gangsta', 'Top 40', 'Christian Rap', 'Pop/Funk', 'Jungle',
])

const TAG_FIELDS = Object.freeze([
	{ key: 'title', label: 'Title', weight: 10 },
	{ key: 'artist', label: 'Artist', weight: 10 },
	{ key: 'album', label: 'Album', weight: 8 },
	{ key: 'trackNumber', label: 'Track #', weight: 4 },
	{ key: 'year', label: 'Year', weight: 3 },
	{ key: 'genre', label: 'Genre', weight: 2 },
	{ key: 'hasCoverArt', label: 'Cover Art', weight: 3 },
])

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text rendering.
 *
 * @param {*} raw - Candidate text.
 * @param {number} [maxLen=160] - Maximum output length.
 * @return {string} Cleaned plain text.
 */
export function sanitizeAudioText(raw, maxLen = 160) {
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
 * Convert ArrayBuffer / Uint8Array / Buffer into a Uint8Array safely.
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
 * Read ASCII bytes safely from a Uint8Array.
 *
 * @param {Uint8Array} bytes - Byte buffer.
 * @param {number} offset - Start offset.
 * @param {number} [length=4] - Byte count.
 * @return {string} ASCII string.
 */
function readAscii(bytes, offset, length = 4) {
	if (offset < 0 || offset + length > bytes.length) {
		return ''
	}
	let out = ''
	for (let i = 0; i < length; i += 1) {
		out += String.fromCharCode(bytes[offset + i])
	}
	return out
}

/**
 * Decode UTF-8 bytes safely using TextDecoder with ASCII fallback.
 *
 * @param {Uint8Array} slice - Byte slice.
 * @return {string} Decoded string.
 */
function decodeUtf8Bytes(slice) {
	if (!slice || slice.length === 0) {
		return ''
	}
	if (typeof TextDecoder === 'function') {
		try {
			return new TextDecoder('utf-8', { fatal: false }).decode(slice)
		} catch (error) {
			// Fallback below
		}
	}
	let out = ''
	for (let i = 0; i < slice.length; i += 1) {
		if (slice[i] === 0) {
			break
		}
		out += String.fromCharCode(slice[i])
	}
	return out
}

/**
 * Format duration in seconds into MM:SS or H:MM:SS.
 *
 * @param {number|null|undefined} seconds - Duration in seconds.
 * @return {string} Formatted duration or empty string.
 */
export function formatAudioDuration(seconds) {
	const val = Number(seconds)
	if (!Number.isFinite(val) || val <= 0) {
		return ''
	}
	const rounded = Math.round(val)
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
 * Determine whether a file entry is an audio track by extension or MIME type.
 *
 * @param {object|null|undefined} file - Duplicate file record.
 * @return {boolean} True when the file is an audio file.
 */
export function isAudioFile(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	const mime = typeof file.mimetype === 'string'
		? file.mimetype.trim().toLowerCase().split(';')[0]
		: ''
	if (mime.startsWith('audio/')) {
		return true
	}
	const ext = extractFileExtension(file.path || file.name || '')
	return AUDIO_EXTENSION_SET.has(ext)
}

/**
 * Normalize text for fuzzy track identity matching (strips punctuation, copy suffixes, diacritics).
 *
 * @param {string|null|undefined} raw - Raw track/artist string.
 * @return {string} Normalized token string.
 */
export function normalizeAudioIdentityToken(raw) {
	if (typeof raw !== 'string') {
		return ''
	}
	const base = raw
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/\s*\(\d+\)\s*$/g, '')
		.replace(/\s*[-_ ]copy(\s*\d*)?\s*$/gi, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
	return base
}

/**
 * Infer structured artist, album, track number, and title hints from file path when tags are absent.
 *
 * @param {string|null|undefined} filePath - File path.
 * @return {{ title: string, artist: string, album: string, trackNumber: string, year: string, stem: string }} Inferred hints.
 */
export function inferAudioHintsFromPath(filePath) {
	if (typeof filePath !== 'string' || !filePath.trim()) {
		return {
			title: '',
			artist: '',
			album: '',
			trackNumber: '',
			year: '',
			stem: '',
		}
	}
	const normalized = filePath.replace(/\\/g, '/')
	const segments = normalized.split('/').filter(Boolean)
	const fileName = segments.length > 0 ? segments[segments.length - 1] : ''
	const dotIdx = fileName.lastIndexOf('.')
	const rawStem = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName
	const cleanedStem = sanitizeAudioText(
		rawStem
			.replace(/\s*\(\d+\)\s*$/g, '')
			.replace(/\s*[-_ ]copy(\s*\d*)?\s*$/gi, ''),
		140,
	)

	let trackNumber = ''
	let remainder = cleanedStem
	const trackPrefix = remainder.match(/^(\d{1,3})\s*[-._)]\s*(.+)$/)
	if (trackPrefix) {
		trackNumber = String(Number(trackPrefix[1]))
		remainder = trackPrefix[2].trim()
	}

	let artist = ''
	let title = remainder
	const artistTitle = remainder.match(/^(.+?)\s+-\s+(.+)$/)
	if (artistTitle) {
		artist = sanitizeAudioText(artistTitle[1], 100)
		title = sanitizeAudioText(artistTitle[2], 120)
	}

	let album = ''
	let year = ''
	if (segments.length >= 2) {
		const parent = sanitizeAudioText(segments[segments.length - 2], 100)
		const yearMatch = parent.match(/^(?:\(?((?:19|20)\d{2})\)?\s*[-_ ]+)?(.+)$/)
		if (parent && !/^(music|audio|downloads|files|tracks|unsorted|shared)$/i.test(parent)) {
			album = yearMatch && yearMatch[2] ? yearMatch[2].trim() : parent
			if (yearMatch && yearMatch[1]) {
				year = yearMatch[1]
			}
		}
	}
	if (!artist && segments.length >= 3) {
		const grandParent = sanitizeAudioText(segments[segments.length - 3], 100)
		if (grandParent && !/^(music|audio|downloads|files|home|media)$/i.test(grandParent)) {
			artist = grandParent
		}
	}

	return {
		title: sanitizeAudioText(title, 120),
		artist: sanitizeAudioText(artist, 100),
		album: sanitizeAudioText(album, 100),
		trackNumber,
		year,
		stem: cleanedStem,
	}
}

/**
 * Decode an ID3v2 text frame payload safely.
 *
 * @param {Uint8Array} bytes - Source bytes.
 * @param {number} start - Payload start offset.
 * @param {number} length - Payload length.
 * @return {string} Decoded text.
 */
function decodeId3TextPayload(bytes, start, length) {
	if (length <= 1 || start + length > bytes.length) {
		return ''
	}
	const encoding = bytes[start]
	const slice = bytes.subarray(start + 1, start + length)
	let raw = ''
	if (encoding === 1 || encoding === 2) {
		const hasBom = slice.length >= 2 && ((slice[0] === 0xff && slice[1] === 0xfe) || (slice[0] === 0xfe && slice[1] === 0xff))
		const littleEndian = encoding === 1 && !(slice.length >= 2 && slice[0] === 0xfe && slice[1] === 0xff)
		const textStart = hasBom ? 2 : 0
		for (let i = textStart; i + 1 < slice.length; i += 2) {
			const code = littleEndian ? (slice[i] | (slice[i + 1] << 8)) : ((slice[i] << 8) | slice[i + 1])
			if (code === 0) {
				break
			}
			raw += String.fromCharCode(code)
		}
	} else if (encoding === 3) {
		raw = decodeUtf8Bytes(slice)
	} else {
		for (let i = 0; i < slice.length; i += 1) {
			if (slice[i] === 0) {
				break
			}
			raw += String.fromCharCode(slice[i])
		}
	}
	return sanitizeAudioText(raw, 140)
}

/**
 * Normalize ID3v1 / ID3v2 genre strings such as "(17)" or "(13)Pop".
 *
 * @param {string} rawGenre - Raw genre text.
 * @return {string} Clean genre label.
 */
function normalizeGenreLabel(rawGenre) {
	const cleaned = sanitizeAudioText(rawGenre, 60)
	if (!cleaned) {
		return ''
	}
	const numericMatch = cleaned.match(/^\((\d{1,3})\)(.*)$/)
	if (numericMatch) {
		const idx = Number(numericMatch[1])
		const tail = numericMatch[2].trim()
		if (tail) {
			return tail
		}
		return ID3V1_GENRES[idx] || ''
	}
	return cleaned
}

/**
 * Parse ID3v1 128-byte footer block if present at the tail of a buffer.
 *
 * @param {Uint8Array} tailBytes - Tail bytes (or full buffer).
 * @return {object|null} Extracted ID3v1 fields or null.
 */
export function parseId3v1Footer(tailBytes) {
	const bytes = toUint8Array(tailBytes)
	if (bytes.length < 128) {
		return null
	}
	const offset = bytes.length - 128
	if (readAscii(bytes, offset, 3) !== 'TAG') {
		return null
	}
	const readFixed = (start, len) => {
		let out = ''
		for (let i = 0; i < len; i += 1) {
			const b = bytes[start + i]
			if (b === 0) {
				break
			}
			out += String.fromCharCode(b)
		}
		return sanitizeAudioText(out, 60)
	}
	const title = readFixed(offset + 3, 30)
	const artist = readFixed(offset + 33, 30)
	const album = readFixed(offset + 63, 30)
	const year = readFixed(offset + 93, 4)
	let trackNumber = ''
	if (bytes[offset + 125] === 0 && bytes[offset + 126] > 0) {
		trackNumber = String(bytes[offset + 126])
	}
	const genreByte = bytes[offset + 127]
	const genre = genreByte < ID3V1_GENRES.length ? ID3V1_GENRES[genreByte] : ''
	return {
		id3v1: true,
		title,
		artist,
		album,
		year: /^(19|20)\d{2}$/.test(year) ? year : '',
		trackNumber,
		genre,
	}
}

/**
 * Parse MP3 ID3v2.2/v2.3/v2.4 tags, Xing/Info VBR header, and MPEG audio frames.
 *
 * @param {Uint8Array} bytes - Head or full MP3 bytes.
 * @param {object} [options={}] - Parser options.
 * @param {number} [options.fileSize=0] - File size in bytes for duration estimation.
 * @param {Uint8Array|ArrayBuffer|null} [options.tailBuffer=null] - Optional tail bytes for ID3v1 fallback.
 * @return {object|null} Parsed MP3 tags and stream metrics or null.
 */
export function parseMp3Buffer(bytes, options = {}) {
	const buf = toUint8Array(bytes)
	if (buf.length < 4) {
		return null
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

	let scanOffset = 0
	let tagVersion = ''
	let title = ''
	let artist = ''
	let album = ''
	let albumArtist = ''
	let trackNumber = ''
	let year = ''
	let genre = ''
	let hasCoverArt = false
	let coverArtBytes = 0

	if (buf.length >= 10 && readAscii(buf, 0, 3) === 'ID3') {
		const major = buf[3]
		const rev = buf[4]
		tagVersion = `ID3v2.${major}.${rev}`
		const tagSize = ((buf[6] & 0x7f) << 21)
			| ((buf[7] & 0x7f) << 14)
			| ((buf[8] & 0x7f) << 7)
			| (buf[9] & 0x7f)
		const tagEnd = Math.min(buf.length, 10 + tagSize)
		let framePos = 10
		let guard = 0

		if (major === 2) {
			while (framePos + 6 <= tagEnd && guard < MAX_ID3_FRAMES) {
				guard += 1
				const frameId = readAscii(buf, framePos, 3)
				if (!/^[A-Z0-9]{3}$/.test(frameId)) {
					break
				}
				const frameSize = (buf[framePos + 3] << 16) | (buf[framePos + 4] << 8) | buf[framePos + 5]
				if (frameSize <= 0 || framePos + 6 + frameSize > tagEnd) {
					break
				}
				const payloadStart = framePos + 6
				if (frameId === 'TT2' && !title) {
					title = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TP1' && !artist) {
					artist = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TAL' && !album) {
					album = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TP2' && !albumArtist) {
					albumArtist = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TRK' && !trackNumber) {
					trackNumber = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TYE' && !year) {
					year = decodeId3TextPayload(buf, payloadStart, frameSize).slice(0, 4)
				} else if (frameId === 'TCO' && !genre) {
					genre = normalizeGenreLabel(decodeId3TextPayload(buf, payloadStart, frameSize))
				} else if (frameId === 'PIC') {
					hasCoverArt = true
					coverArtBytes = frameSize
				}
				framePos += 6 + frameSize
			}
		} else if (major >= 3) {
			while (framePos + 10 <= tagEnd && guard < MAX_ID3_FRAMES) {
				guard += 1
				const frameId = readAscii(buf, framePos, 4)
				if (!/^[A-Z0-9]{4}$/.test(frameId)) {
					break
				}
				const frameSize = major === 4
					? (((buf[framePos + 4] & 0x7f) << 21)
						| ((buf[framePos + 5] & 0x7f) << 14)
						| ((buf[framePos + 6] & 0x7f) << 7)
						| (buf[framePos + 7] & 0x7f))
					: view.getUint32(framePos + 4, false)
				if (frameSize <= 0 || framePos + 10 + frameSize > tagEnd) {
					break
				}
				const payloadStart = framePos + 10
				if (frameId === 'TIT2' && !title) {
					title = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TPE1' && !artist) {
					artist = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TALB' && !album) {
					album = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TPE2' && !albumArtist) {
					albumArtist = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if (frameId === 'TRCK' && !trackNumber) {
					trackNumber = decodeId3TextPayload(buf, payloadStart, frameSize)
				} else if ((frameId === 'TYER' || frameId === 'TDRC') && !year) {
					const rawYear = decodeId3TextPayload(buf, payloadStart, frameSize)
					const yrMatch = rawYear.match(/\b((?:19|20)\d{2})\b/)
					if (yrMatch) {
						year = yrMatch[1]
					}
				} else if (frameId === 'TCON' && !genre) {
					genre = normalizeGenreLabel(decodeId3TextPayload(buf, payloadStart, frameSize))
				} else if (frameId === 'APIC') {
					hasCoverArt = true
					coverArtBytes = frameSize
				}
				framePos += 10 + frameSize
			}
		}
		scanOffset = Math.min(buf.length, 10 + tagSize)
	}

	const tailSource = options.tailBuffer ? toUint8Array(options.tailBuffer) : buf
	const v1 = parseId3v1Footer(tailSource)
	if (v1) {
		title = title || v1.title
		artist = artist || v1.artist
		album = album || v1.album
		year = year || v1.year
		trackNumber = trackNumber || v1.trackNumber
		genre = genre || v1.genre
		if (!tagVersion) {
			tagVersion = 'ID3v1'
		}
	}

	let bitrateKbps = 0
	let sampleRate = 0
	let channels = 0
	let channelLabel = ''
	let bitrateMode = 'CBR'
	let durationSeconds = 0

	const limit = Math.min(buf.length - 4, scanOffset + 8192)
	for (let i = scanOffset; i <= limit; i += 1) {
		if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) {
			continue
		}
		const versionBits = (buf[i + 1] >> 3) & 0x03
		const layerBits = (buf[i + 1] >> 1) & 0x03
		const bitrateIdx = (buf[i + 2] >> 4) & 0x0f
		const sampleIdx = (buf[i + 2] >> 2) & 0x03
		const chModeIdx = (buf[i + 3] >> 6) & 0x03

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

		const sideInfoSize = versionBits === 3
			? (channels === 1 ? 17 : 32)
			: (channels === 1 ? 9 : 17)
		const xingOffset = i + 4 + sideInfoSize
		if (xingOffset + 12 <= buf.length) {
			const xingSig = readAscii(buf, xingOffset, 4)
			if (xingSig === 'Xing' || xingSig === 'Info') {
				bitrateMode = xingSig === 'Xing' ? 'VBR' : 'CBR'
				const xingFlags = view.getUint32(xingOffset + 4, false)
				if ((xingFlags & 0x01) !== 0 && xingOffset + 12 <= buf.length) {
					const frames = view.getUint32(xingOffset + 8, false)
					const samplesPerFrame = versionBits === 3 ? 1152 : 576
					if (frames > 0 && sampleRate > 0) {
						durationSeconds = (frames * samplesPerFrame) / sampleRate
					}
				}
				if ((xingFlags & 0x02) !== 0 && durationSeconds > 0 && xingOffset + 16 <= buf.length) {
					const byteCountOffset = (xingFlags & 0x01) !== 0 ? xingOffset + 12 : xingOffset + 8
					if (byteCountOffset + 4 <= buf.length) {
						const audioBytes = view.getUint32(byteCountOffset, false)
						if (audioBytes > 0) {
							bitrateKbps = Math.round((audioBytes * 8) / (durationSeconds * 1000))
						}
					}
				}
			}
		}
		break
	}

	const fileSize = Number(options.fileSize) || buf.length
	if (durationSeconds <= 0 && bitrateKbps > 0 && fileSize > scanOffset) {
		const audioPayloadBytes = Math.max(0, fileSize - scanOffset)
		durationSeconds = (audioPayloadBytes * 8) / (bitrateKbps * 1000)
	}

	if (!tagVersion && !bitrateKbps && !sampleRate) {
		return null
	}

	return {
		codec: 'MP3',
		formatLabel: tagVersion ? `MP3 (${tagVersion})` : 'MP3',
		tagFormat: tagVersion || 'None',
		lossless: false,
		bitrateMode,
		bitrateKbps,
		sampleRate,
		bitsPerSample: 0,
		channels,
		channelLabel,
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatAudioDuration(durationSeconds),
		title,
		artist,
		album,
		albumArtist,
		trackNumber,
		year,
		genre,
		hasCoverArt,
		coverArtBytes,
	}
}

/**
 * Parse a Vorbis comment key/value payload safely (shared by FLAC and OGG).
 *
 * @param {Uint8Array} buf - Buffer bytes.
 * @param {number} start - Comment payload start.
 * @param {number} end - Comment payload end.
 * @return {object} Extracted comment tags.
 */
function parseVorbisCommentBlock(buf, start, end) {
	const result = {
		title: '',
		artist: '',
		album: '',
		albumArtist: '',
		trackNumber: '',
		year: '',
		genre: '',
	}
	if (start + 8 > end) {
		return result
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
	const vendorLen = view.getUint32(start, true)
	let cursor = start + 4 + vendorLen
	if (cursor + 4 > end) {
		return result
	}
	const commentCount = Math.min(128, view.getUint32(cursor, true))
	cursor += 4

	for (let i = 0; i < commentCount; i += 1) {
		if (cursor + 4 > end) {
			break
		}
		const len = view.getUint32(cursor, true)
		cursor += 4
		if (len <= 0 || cursor + len > end) {
			break
		}
		const entry = decodeUtf8Bytes(buf.subarray(cursor, cursor + len))
		cursor += len
		const eq = entry.indexOf('=')
		if (eq <= 0) {
			continue
		}
		const key = entry.slice(0, eq).trim().toUpperCase()
		const val = sanitizeAudioText(entry.slice(eq + 1), 140)
		if (!val) {
			continue
		}
		if (key === 'TITLE' && !result.title) {
			result.title = val
		} else if (key === 'ARTIST' && !result.artist) {
			result.artist = val
		} else if (key === 'ALBUM' && !result.album) {
			result.album = val
		} else if ((key === 'ALBUMARTIST' || key === 'ALBUM ARTIST') && !result.albumArtist) {
			result.albumArtist = val
		} else if ((key === 'TRACKNUMBER' || key === 'TRACK') && !result.trackNumber) {
			result.trackNumber = val
		} else if ((key === 'DATE' || key === 'YEAR') && !result.year) {
			const yr = val.match(/\b((?:19|20)\d{2})\b/)
			result.year = yr ? yr[1] : val.slice(0, 4)
		} else if (key === 'GENRE' && !result.genre) {
			result.genre = val
		}
	}
	return result
}

/**
 * Parse FLAC STREAMINFO, VORBIS_COMMENT, and PICTURE metadata blocks.
 *
 * @param {Uint8Array} bytes - Binary FLAC bytes.
 * @param {object} [options={}] - Parser options.
 * @param {number} [options.fileSize=0] - File size in bytes.
 * @return {object|null} Parsed FLAC tags and stream metrics or null.
 */
export function parseFlacBuffer(bytes, options = {}) {
	const buf = toUint8Array(bytes)
	if (buf.length < 42 || readAscii(buf, 0, 4) !== 'fLaC') {
		return null
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

	let sampleRate = 0
	let channels = 0
	let bitsPerSample = 0
	let durationSeconds = 0
	let hasCoverArt = false
	let coverArtBytes = 0
	let tags = {
		title: '',
		artist: '',
		album: '',
		albumArtist: '',
		trackNumber: '',
		year: '',
		genre: '',
	}

	let offset = 4
	let guard = 0
	while (offset + 4 <= buf.length && guard < 32) {
		guard += 1
		const headerByte = buf[offset]
		const isLast = (headerByte & 0x80) !== 0
		const blockType = headerByte & 0x7f
		const blockLen = (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]
		const payloadStart = offset + 4
		const payloadEnd = Math.min(buf.length, payloadStart + blockLen)

		if (blockType === 0 && payloadStart + 18 <= payloadEnd) {
			sampleRate = (buf[payloadStart + 10] << 12)
				| (buf[payloadStart + 11] << 4)
				| (buf[payloadStart + 12] >> 4)
			channels = ((buf[payloadStart + 12] >> 1) & 0x07) + 1
			bitsPerSample = (((buf[payloadStart + 12] & 0x01) << 4) | (buf[payloadStart + 13] >> 4)) + 1
			const totalSamplesHi = buf[payloadStart + 13] & 0x0f
			const totalSamplesLo = view.getUint32(payloadStart + 14, false)
			const totalSamples = (totalSamplesHi * 4294967296) + totalSamplesLo
			if (sampleRate > 0 && totalSamples > 0) {
				durationSeconds = totalSamples / sampleRate
			}
		} else if (blockType === 4 && payloadStart + 8 <= payloadEnd) {
			tags = parseVorbisCommentBlock(buf, payloadStart, payloadEnd)
		} else if (blockType === 6) {
			hasCoverArt = true
			coverArtBytes = blockLen
		}

		if (isLast || payloadStart + blockLen > buf.length) {
			break
		}
		offset = payloadStart + blockLen
	}

	const fileSize = Number(options.fileSize) || buf.length
	const bitrateKbps = durationSeconds > 0 && fileSize > 0
		? Math.round((fileSize * 8) / (durationSeconds * 1000))
		: 0

	return {
		codec: 'FLAC',
		formatLabel: 'FLAC',
		tagFormat: 'Vorbis Comment',
		lossless: true,
		bitrateMode: 'VBR',
		bitrateKbps,
		sampleRate,
		bitsPerSample,
		channels,
		channelLabel: channels === 1 ? 'Mono' : (channels === 2 ? 'Stereo' : `${channels} ch`),
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatAudioDuration(durationSeconds),
		...tags,
		hasCoverArt,
		coverArtBytes,
	}
}

/**
 * Parse OGG (Vorbis / Opus) header and Vorbis Comment metadata packet.
 *
 * @param {Uint8Array} bytes - Binary OGG bytes.
 * @return {object|null} Parsed OGG metadata or null.
 */
export function parseOggBuffer(bytes) {
	const buf = toUint8Array(bytes)
	if (buf.length < 36 || readAscii(buf, 0, 4) !== 'OggS') {
		return null
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
	const segCount = buf[26]
	const payloadOffset = 27 + segCount
	if (payloadOffset + 16 > buf.length) {
		return {
			codec: 'OGG',
			formatLabel: 'OGG',
			tagFormat: 'Vorbis Comment',
			lossless: false,
			bitrateMode: 'VBR',
			bitrateKbps: 0,
			sampleRate: 0,
			bitsPerSample: 0,
			channels: 0,
			channelLabel: '',
			durationSeconds: 0,
			durationFormatted: '',
			title: '',
			artist: '',
			album: '',
			albumArtist: '',
			trackNumber: '',
			year: '',
			genre: '',
			hasCoverArt: false,
			coverArtBytes: 0,
		}
	}

	let codec = 'OGG'
	let formatLabel = 'OGG'
	let channels = 0
	let sampleRate = 0
	let bitrateKbps = 0

	if (readAscii(buf, payloadOffset, 8) === 'OpusHead' && payloadOffset + 16 <= buf.length) {
		codec = 'OPUS'
		formatLabel = 'OGG (Opus)'
		channels = buf[payloadOffset + 9]
		sampleRate = view.getUint32(payloadOffset + 12, true) || 48000
	} else if (buf[payloadOffset] === 1 && readAscii(buf, payloadOffset + 1, 6) === 'vorbis' && payloadOffset + 24 <= buf.length) {
		codec = 'OGG'
		formatLabel = 'OGG (Vorbis)'
		channels = buf[payloadOffset + 11]
		sampleRate = view.getUint32(payloadOffset + 12, true)
		const nominal = view.getInt32(payloadOffset + 20, true)
		if (nominal > 0) {
			bitrateKbps = Math.round(nominal / 1000)
		}
	}

	let tags = {
		title: '',
		artist: '',
		album: '',
		albumArtist: '',
		trackNumber: '',
		year: '',
		genre: '',
	}

	// Scan for second OggS page containing Vorbis/Opus comment packet
	const secondPage = findAsciiOffset(buf, 'OggS', 27)
	if (secondPage >= 0 && secondPage + 28 < buf.length) {
		const p2Segs = buf[secondPage + 26]
		let p2PayloadLen = 0
		for (let i = 0; i < p2Segs && secondPage + 27 + i < buf.length; i += 1) {
			p2PayloadLen += buf[secondPage + 27 + i]
		}
		const p2Start = secondPage + 27 + p2Segs
		const p2End = Math.min(buf.length, p2Start + p2PayloadLen)
		if (p2Start + 8 < p2End) {
			if (readAscii(buf, p2Start, 8) === 'OpusTags') {
				tags = parseVorbisCommentBlock(buf, p2Start + 8, p2End)
			} else if (buf[p2Start] === 3 && readAscii(buf, p2Start + 1, 6) === 'vorbis') {
				tags = parseVorbisCommentBlock(buf, p2Start + 7, p2End)
			}
		}
	}

	return {
		codec,
		formatLabel,
		tagFormat: 'Vorbis Comment',
		lossless: false,
		bitrateMode: 'VBR',
		bitrateKbps,
		sampleRate,
		bitsPerSample: 0,
		channels,
		channelLabel: channels === 1 ? 'Mono' : (channels === 2 ? 'Stereo' : ''),
		durationSeconds: 0,
		durationFormatted: '',
		...tags,
		hasCoverArt: false,
		coverArtBytes: 0,
	}
}

/**
 * Find first ASCII marker offset in a Uint8Array starting at `fromIndex`.
 *
 * @param {Uint8Array} buf - Buffer.
 * @param {string} marker - ASCII marker.
 * @param {number} fromIndex - Start index.
 * @return {number} Offset or -1.
 */
function findAsciiOffset(buf, marker, fromIndex) {
	const limit = buf.length - marker.length
	for (let i = Math.max(0, fromIndex); i <= limit; i += 1) {
		let matched = true
		for (let j = 0; j < marker.length; j += 1) {
			if (buf[i + j] !== marker.charCodeAt(j)) {
				matched = false
				break
			}
		}
		if (matched) {
			return i
		}
	}
	return -1
}

/**
 * Parse M4A / MP4 / ALAC container duration, codec, and iTunes ilst atoms.
 *
 * @param {Uint8Array} bytes - Binary M4A bytes.
 * @param {object} [options={}] - Parser options.
 * @param {number} [options.fileSize=0] - File size in bytes.
 * @return {object|null} Parsed M4A metadata or null.
 */
export function parseM4aBuffer(bytes, options = {}) {
	const buf = toUint8Array(bytes)
	if (buf.length < 16 || readAscii(buf, 4, 4) !== 'ftyp') {
		return null
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
	const majorBrand = readAscii(buf, 8, 4)
	if (majorBrand !== 'M4A ' && majorBrand !== 'mp42' && majorBrand !== 'isom' && majorBrand !== 'M4B ') {
		return null
	}

	let durationSeconds = 0
	let lossless = false
	let codec = 'AAC'
	let title = ''
	let artist = ''
	let album = ''
	let albumArtist = ''
	let trackNumber = ''
	let year = ''
	let genre = ''
	let hasCoverArt = false
	let coverArtBytes = 0

	const readIlstDataText = (atomStart, atomEnd) => {
		let cursor = atomStart
		let guard = 0
		while (cursor + 8 <= atomEnd && guard < 12) {
			guard += 1
			const sz = view.getUint32(cursor, false)
			const nm = readAscii(buf, cursor + 4, 4)
			if (sz < 8 || cursor + sz > atomEnd) {
				break
			}
			if (nm === 'data' && sz > 16) {
				return sanitizeAudioText(decodeUtf8Bytes(buf.subarray(cursor + 16, cursor + sz)), 140)
			}
			cursor += sz
		}
		return ''
	}

	const scanAtoms = (start, end, depth) => {
		if (depth > 6) {
			return
		}
		let offset = start
		let guard = 0
		while (offset + 8 <= end && guard < MAX_CONTAINER_BOXES) {
			guard += 1
			const size = view.getUint32(offset, false)
			const type = readAscii(buf, offset + 4, 4)
			if (size < 8) {
				break
			}
			const boxEnd = Math.min(end, offset + size)
			const payload = offset + 8

			if (type === 'mvhd' && payload + 20 <= boxEnd) {
				const version = buf[payload]
				if (version === 0 && payload + 20 <= boxEnd) {
					const ts = view.getUint32(payload + 12, false)
					const dur = view.getUint32(payload + 16, false)
					if (ts > 0 && dur > 0) {
						durationSeconds = dur / ts
					}
				}
			} else if (type === 'alac') {
				lossless = true
				codec = 'ALAC'
			} else if (type === 'meta' && payload + 4 <= boxEnd) {
				scanAtoms(payload + 4, boxEnd, depth + 1)
			} else if (type === 'moov' || type === 'udta' || type === 'ilst' || type === 'trak' || type === 'mdia' || type === 'minf' || type === 'stbl') {
				scanAtoms(payload, boxEnd, depth + 1)
			} else if (type === 'stsd' && payload + 16 <= boxEnd) {
				scanAtoms(payload + 8, boxEnd, depth + 1)
			} else if (depth >= 3) {
				const code0 = buf[offset + 4]
				if (code0 === 0xa9 && type.slice(1) === 'nam' && !title) {
					title = readIlstDataText(payload, boxEnd)
				} else if (code0 === 0xa9 && type.slice(1) === 'ART' && !artist) {
					artist = readIlstDataText(payload, boxEnd)
				} else if (code0 === 0xa9 && type.slice(1) === 'alb' && !album) {
					album = readIlstDataText(payload, boxEnd)
				} else if (type === 'aART' && !albumArtist) {
					albumArtist = readIlstDataText(payload, boxEnd)
				} else if (code0 === 0xa9 && type.slice(1) === 'day' && !year) {
					const rawYr = readIlstDataText(payload, boxEnd)
					const m = rawYr.match(/\b((?:19|20)\d{2})\b/)
					year = m ? m[1] : rawYr.slice(0, 4)
				} else if (code0 === 0xa9 && type.slice(1) === 'gen' && !genre) {
					genre = readIlstDataText(payload, boxEnd)
				} else if (type === 'trkn' && payload + 20 <= boxEnd) {
					const dataAtom = readAscii(buf, payload + 4, 4)
					if (dataAtom === 'data' && payload + 20 <= boxEnd) {
						const trk = view.getUint16(payload + 18, false)
						if (trk > 0) {
							trackNumber = String(trk)
						}
					}
				} else if (type === 'covr') {
					hasCoverArt = true
					coverArtBytes = Math.max(0, boxEnd - payload - 16)
				}
			}

			if (offset + size > end) {
				break
			}
			offset += size
		}
	}

	scanAtoms(0, buf.length, 0)
	const fileSize = Number(options.fileSize) || buf.length
	const bitrateKbps = durationSeconds > 0 && fileSize > 0
		? Math.round((fileSize * 8) / (durationSeconds * 1000))
		: 0

	return {
		codec: lossless ? 'ALAC' : 'M4A',
		formatLabel: lossless ? 'M4A (ALAC)' : `M4A (${codec})`,
		tagFormat: 'iTunes MP4 Atoms',
		lossless,
		bitrateMode: lossless ? 'VBR' : 'AAC',
		bitrateKbps,
		sampleRate: 44100,
		bitsPerSample: lossless ? 16 : 0,
		channels: 2,
		channelLabel: 'Stereo',
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatAudioDuration(durationSeconds),
		title,
		artist,
		album,
		albumArtist,
		trackNumber,
		year,
		genre,
		hasCoverArt,
		coverArtBytes,
	}
}

/**
 * Parse RIFF WAVE header and optional LIST/INFO metadata tags.
 *
 * @param {Uint8Array} bytes - Binary WAV bytes.
 * @return {object|null} Parsed WAV metadata or null.
 */
export function parseWavBuffer(bytes) {
	const buf = toUint8Array(bytes)
	if (buf.length < 12 || readAscii(buf, 0, 4) !== 'RIFF' || readAscii(buf, 8, 4) !== 'WAVE') {
		return null
	}
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)

	let channels = 0
	let sampleRate = 0
	let bitsPerSample = 0
	let byteRate = 0
	let dataSize = 0
	let title = ''
	let artist = ''
	let album = ''
	let year = ''
	let genre = ''

	let offset = 12
	let guard = 0
	while (offset + 8 <= buf.length && guard < MAX_CONTAINER_BOXES) {
		guard += 1
		const chunkId = readAscii(buf, offset, 4)
		const chunkSize = view.getUint32(offset + 4, true)
		const payload = offset + 8

		if (chunkId === 'fmt ' && payload + 16 <= buf.length) {
			channels = view.getUint16(payload + 2, true)
			sampleRate = view.getUint32(payload + 4, true)
			byteRate = view.getUint32(payload + 8, true)
			bitsPerSample = view.getUint16(payload + 14, true)
		} else if (chunkId === 'data') {
			dataSize = chunkSize
		} else if (chunkId === 'LIST' && payload + 4 <= buf.length && readAscii(buf, payload, 4) === 'INFO') {
			let sub = payload + 4
			const listEnd = Math.min(buf.length, payload + chunkSize)
			let subGuard = 0
			while (sub + 8 <= listEnd && subGuard < 24) {
				subGuard += 1
				const subId = readAscii(buf, sub, 4)
				const subLen = view.getUint32(sub + 4, true)
				const textEnd = Math.min(listEnd, sub + 8 + subLen)
				const val = sanitizeAudioText(decodeUtf8Bytes(buf.subarray(sub + 8, textEnd)), 120)
				if (subId === 'INAM' && !title) {
					title = val
				} else if (subId === 'IART' && !artist) {
					artist = val
				} else if (subId === 'IPRD' && !album) {
					album = val
				} else if (subId === 'ICRD' && !year) {
					const m = val.match(/\b((?:19|20)\d{2})\b/)
					year = m ? m[1] : ''
				} else if (subId === 'IGNR' && !genre) {
					genre = val
				}
				const subStep = 8 + subLen + (subLen % 2)
				if (subStep <= 8) {
					break
				}
				sub += subStep
			}
		}

		const step = 8 + chunkSize + (chunkSize % 2)
		if (step <= 8 || offset + step > buf.length) {
			break
		}
		offset += step
	}

	const durationSeconds = byteRate > 0 && dataSize > 0 ? dataSize / byteRate : 0
	const bitrateKbps = byteRate > 0 ? Math.round((byteRate * 8) / 1000) : 0

	return {
		codec: 'WAV',
		formatLabel: 'WAV (PCM)',
		tagFormat: (title || artist || album) ? 'RIFF INFO' : 'None',
		lossless: true,
		bitrateMode: 'PCM',
		bitrateKbps,
		sampleRate,
		bitsPerSample,
		channels,
		channelLabel: channels === 1 ? 'Mono' : (channels === 2 ? 'Stereo' : `${channels} ch`),
		durationSeconds: durationSeconds > 0 ? Math.round(durationSeconds * 10) / 10 : 0,
		durationFormatted: formatAudioDuration(durationSeconds),
		title,
		artist,
		album,
		albumArtist: '',
		trackNumber: '',
		year,
		genre,
		hasCoverArt: false,
		coverArtBytes: 0,
	}
}

/**
 * Compute tag completeness breakdown (0-100%) and quality score (0-100) for parsed audio metadata.
 *
 * @param {object} meta - Normalized audio metadata object.
 * @return {{
 *   tagCompletenessPercent: number,
 *   presentTagCount: number,
 *   totalTagCount: number,
 *   missingTagFields: Array<string>,
 *   qualityScore: number,
 *   combinedScore: number,
 *   qualityTier: 'lossless'|'high'|'standard'|'low'|'unknown'
 * }} Scoring outcome.
 */
export function scoreAudioQualityAndTags(meta) {
	const safe = meta && typeof meta === 'object' ? meta : {}
	let tagPoints = 0
	let presentTagCount = 0
	const missingTagFields = []

	for (const field of TAG_FIELDS) {
		const rawVal = safe[field.key]
		const present = field.key === 'hasCoverArt' ? Boolean(rawVal) : Boolean(typeof rawVal === 'string' && rawVal.trim())
		if (present) {
			tagPoints += field.weight
			presentTagCount += 1
		} else {
			missingTagFields.push(field.label)
		}
	}

	const tagCompletenessPercent = Math.round((tagPoints / 40) * 100)
	const bitrate = Number(safe.bitrateKbps) || 0
	const lossless = Boolean(safe.lossless)
	const sampleRate = Number(safe.sampleRate) || 0
	const bitsPerSample = Number(safe.bitsPerSample) || 0

	let qualityScore = 20
	let qualityTier = 'unknown'

	if (lossless) {
		qualityTier = 'lossless'
		qualityScore = 54
		if (bitsPerSample >= 24 || sampleRate >= 88200) {
			qualityScore = 60
		} else if (sampleRate >= 44100) {
			qualityScore = 57
		}
	} else if (bitrate >= 300) {
		qualityTier = 'high'
		qualityScore = 49
	} else if (bitrate >= 240) {
		qualityTier = 'high'
		qualityScore = 44
	} else if (bitrate >= 192) {
		qualityTier = 'standard'
		qualityScore = 36
	} else if (bitrate >= 128) {
		qualityTier = 'low'
		qualityScore = 25
	} else if (bitrate > 0) {
		qualityTier = 'low'
		qualityScore = 15
	}

	const combinedScore = Math.min(100, qualityScore + tagPoints)

	return {
		tagCompletenessPercent,
		presentTagCount,
		totalTagCount: TAG_FIELDS.length,
		missingTagFields,
		qualityScore,
		combinedScore,
		qualityTier,
	}
}

/**
 * Parse binary audio header + tags or inline `file.audioTags` safely into a unified track profile.
 *
 * @param {ArrayBuffer|Uint8Array|null} buffer - Head or full audio bytes.
 * @param {object} [file={}] - Duplicate file metadata object.
 * @param {object} [options={}] - Additional buffers (`tailBuffer`).
 * @return {object} Unified audio track inspection payload.
 */
export function parseAudioTrackMetadata(buffer, file = {}, options = {}) {
	const safeFile = file && typeof file === 'object' ? file : {}
	const ext = extractFileExtension(safeFile.path || safeFile.name || '').toUpperCase()
	const fileSize = Number(safeFile.size) || 0
	const hints = inferAudioHintsFromPath(safeFile.path || safeFile.name || '')

	let parsed = null
	let status = 'uninspected'
	let parseSource = 'path-heuristic'

	if (safeFile.audioTags && typeof safeFile.audioTags === 'object') {
		const inline = safeFile.audioTags
		const inlineCodec = sanitizeAudioText(String(inline.codec || ext || 'AUDIO'), 24).toUpperCase()
		const lossless = Boolean(inline.lossless) || LOSSLESS_EXTENSIONS.has(inlineCodec.toLowerCase())
		parsed = {
			codec: inlineCodec,
			formatLabel: sanitizeAudioText(String(inline.formatLabel || inlineCodec), 40),
			tagFormat: sanitizeAudioText(String(inline.tagFormat || 'Inline Tags'), 40),
			lossless,
			bitrateMode: sanitizeAudioText(String(inline.bitrateMode || (lossless ? 'VBR' : 'CBR')), 16),
			bitrateKbps: Number(inline.bitrateKbps) || 0,
			sampleRate: Number(inline.sampleRate) || 0,
			bitsPerSample: Number(inline.bitsPerSample) || 0,
			channels: Number(inline.channels) || 0,
			channelLabel: sanitizeAudioText(String(inline.channelLabel || ''), 24),
			durationSeconds: Number(inline.durationSeconds) || 0,
			durationFormatted: formatAudioDuration(inline.durationSeconds),
			title: sanitizeAudioText(String(inline.title || ''), 140),
			artist: sanitizeAudioText(String(inline.artist || ''), 120),
			album: sanitizeAudioText(String(inline.album || ''), 120),
			albumArtist: sanitizeAudioText(String(inline.albumArtist || ''), 120),
			trackNumber: sanitizeAudioText(String(inline.trackNumber || ''), 16),
			year: sanitizeAudioText(String(inline.year || ''), 10),
			genre: sanitizeAudioText(String(inline.genre || ''), 60),
			hasCoverArt: Boolean(inline.hasCoverArt),
			coverArtBytes: Number(inline.coverArtBytes) || 0,
		}
		status = 'ready'
		parseSource = 'inline-tags'
	} else {
		const bytes = toUint8Array(buffer)
		const tailBytes = options.tailBuffer ? toUint8Array(options.tailBuffer) : null
		if (bytes.length >= 4) {
			const magic4 = readAscii(bytes, 0, 4)
			if (magic4 === 'fLaC') {
				parsed = parseFlacBuffer(bytes, { fileSize })
			} else if (magic4 === 'OggS') {
				parsed = parseOggBuffer(bytes)
			} else if (magic4 === 'RIFF') {
				parsed = parseWavBuffer(bytes)
			} else if (readAscii(bytes, 4, 4) === 'ftyp') {
				parsed = parseM4aBuffer(bytes, { fileSize })
			} else {
				parsed = parseMp3Buffer(bytes, { fileSize, tailBuffer: tailBytes })
			}
			if (parsed) {
				status = 'ready'
				parseSource = 'binary-header'
			} else {
				status = 'unavailable'
				parseSource = 'unrecognized-header'
			}
		}
	}

	const isFallbackLossless = LOSSLESS_EXTENSIONS.has(ext.toLowerCase())
	const base = parsed || {
		codec: ext || 'AUDIO',
		formatLabel: ext || 'AUDIO',
		tagFormat: 'Heuristic',
		lossless: isFallbackLossless,
		bitrateMode: '',
		bitrateKbps: 0,
		sampleRate: 0,
		bitsPerSample: 0,
		channels: 0,
		channelLabel: '',
		durationSeconds: 0,
		durationFormatted: '',
		title: hints.title,
		artist: hints.artist,
		album: hints.album,
		albumArtist: '',
		trackNumber: hints.trackNumber,
		year: hints.year,
		genre: '',
		hasCoverArt: false,
		coverArtBytes: 0,
	}

	const scores = scoreAudioQualityAndTags(base)
	const effectiveTitle = base.title || hints.title || hints.stem
	const effectiveArtist = base.artist || hints.artist
	const effectiveAlbum = base.album || hints.album

	const trackIdentityKey = [
		normalizeAudioIdentityToken(effectiveArtist),
		normalizeAudioIdentityToken(effectiveTitle),
	].filter(Boolean).join('::') || normalizeAudioIdentityToken(hints.stem)

	return {
		status,
		parseSource,
		...base,
		effectiveTitle,
		effectiveArtist,
		effectiveAlbum,
		inferredHints: hints,
		trackIdentityKey,
		...scores,
	}
}

/**
 * Pick the surviving file inside a duplicate group using audio-aware or classic keep rules,
 * always protecting origin-folder files.
 *
 * @param {Array<object>} files - Group file wrappers `{ raw, meta }`.
 * @param {string} keepRule - Selected rule (`AUDIO_KEEP_RULES`).
 * @return {{ survivors: Array<object>, deletionCandidates: Array<object>, strategyReason: string }} Selection result.
 */
export function selectAudioGroupSurvivor(files, keepRule = 'balanced_master') {
	const list = Array.isArray(files) ? files : []
	if (list.length === 0) {
		return { survivors: [], deletionCandidates: [], strategyReason: '' }
	}

	const protectedItems = list.filter(item => Boolean(item.raw && item.raw.isInOriginFolder))
	if (protectedItems.length > 0) {
		const protectedKeys = new Set(protectedItems.map(item => getFileSelectionKey(item.raw)))
		return {
			survivors: protectedItems,
			deletionCandidates: list.filter(item => !protectedKeys.has(getFileSelectionKey(item.raw))),
			strategyReason: 'Protected origin folder anchor',
		}
	}

	if (keepRule === 'oldest' || keepRule === 'newest' || keepRule === 'shortest_path') {
		const rawFiles = list.map(item => item.raw)
		const keysToDelete = new Set(selectDuplicatesByKeepRule(rawFiles, keepRule))
		const survivors = list.filter(item => !keysToDelete.has(getFileSelectionKey(item.raw)))
		const deletionCandidates = list.filter(item => keysToDelete.has(getFileSelectionKey(item.raw)))
		const labels = {
			oldest: 'Oldest modification timestamp',
			newest: 'Newest modification timestamp',
			shortest_path: 'Shortest folder path',
		}
		return {
			survivors,
			deletionCandidates,
			strategyReason: labels[keepRule] || keepRule,
		}
	}

	const sorted = [...list].sort((a, b) => {
		const ma = a.meta
		const mb = b.meta
		if (keepRule === 'highest_quality') {
			if (mb.qualityScore !== ma.qualityScore) {
				return mb.qualityScore - ma.qualityScore
			}
			if ((mb.bitrateKbps || 0) !== (ma.bitrateKbps || 0)) {
				return (mb.bitrateKbps || 0) - (ma.bitrateKbps || 0)
			}
			if (mb.tagCompletenessPercent !== ma.tagCompletenessPercent) {
				return mb.tagCompletenessPercent - ma.tagCompletenessPercent
			}
		} else if (keepRule === 'most_complete_tags') {
			if (mb.tagCompletenessPercent !== ma.tagCompletenessPercent) {
				return mb.tagCompletenessPercent - ma.tagCompletenessPercent
			}
			if (mb.qualityScore !== ma.qualityScore) {
				return mb.qualityScore - ma.qualityScore
			}
		} else {
			if (mb.combinedScore !== ma.combinedScore) {
				return mb.combinedScore - ma.combinedScore
			}
			if (mb.qualityScore !== ma.qualityScore) {
				return mb.qualityScore - ma.qualityScore
			}
			if (mb.tagCompletenessPercent !== ma.tagCompletenessPercent) {
				return mb.tagCompletenessPercent - ma.tagCompletenessPercent
			}
		}
		return String(a.raw.path || '').length - String(b.raw.path || '').length
	})

	const winner = sorted[0]
	const reasonMap = {
		highest_quality: winner.meta.lossless
			? `Lossless ${winner.meta.codec}`
			: `${winner.meta.bitrateKbps || 'Best'} kbps ${winner.meta.codec}`,
		most_complete_tags: `${winner.meta.tagCompletenessPercent}% ID3 tags`,
		balanced_master: `Score ${winner.meta.combinedScore}/100 (${winner.meta.codec}, ${winner.meta.tagCompletenessPercent}% tags)`,
	}

	return {
		survivors: [winner],
		deletionCandidates: sorted.slice(1),
		strategyReason: reasonMap[keepRule] || 'Best audio copy',
	}
}

/**
 * Compute a consolidated master tag sheet across a list of audio file profiles
 * and highlight fields missing from the surviving copy that exist on redundant copies.
 *
 * @param {Array<object>} fileEntries - Array of `{ raw, meta }` file entries.
 * @param {object|null} survivorEntry - Surviving `{ raw, meta }` file entry.
 * @return {{
 *   consolidatedTags: object,
 *   mergeableFields: Array<{ field: string, label: string, value: string, sourcePath: string }>,
 *   tagConflictFields: Array<string>,
 *   tagConsolidationNeeded: boolean
 * }} Consolidation plan.
 */
export function buildAlbumTagConsolidationPlan(fileEntries, survivorEntry) {
	const entries = Array.isArray(fileEntries) ? fileEntries : []
	const survivorMeta = survivorEntry && survivorEntry.meta ? survivorEntry.meta : {}

	const consolidatedTags = {
		title: survivorMeta.title || '',
		artist: survivorMeta.artist || '',
		album: survivorMeta.album || '',
		albumArtist: survivorMeta.albumArtist || '',
		trackNumber: survivorMeta.trackNumber || '',
		year: survivorMeta.year || '',
		genre: survivorMeta.genre || '',
		hasCoverArt: Boolean(survivorMeta.hasCoverArt),
	}

	const mergeableFields = []
	const tagConflictFields = []
	const inspectFields = [
		{ key: 'title', label: 'Title' },
		{ key: 'artist', label: 'Artist' },
		{ key: 'album', label: 'Album' },
		{ key: 'albumArtist', label: 'Album Artist' },
		{ key: 'trackNumber', label: 'Track #' },
		{ key: 'year', label: 'Year' },
		{ key: 'genre', label: 'Genre' },
		{ key: 'hasCoverArt', label: 'Cover Art' },
	]

	for (const spec of inspectFields) {
		const survivorVal = consolidatedTags[spec.key]
		const distinctNonEmpty = new Set()
		let bestCandidate = null

		for (const item of entries) {
			const val = item && item.meta ? item.meta[spec.key] : ''
			if (spec.key === 'hasCoverArt') {
				if (val) {
					distinctNonEmpty.add('Embedded Cover Art')
					if (!bestCandidate) {
						bestCandidate = {
							value: 'Embedded Cover Art',
							sourcePath: String(item.raw?.path || ''),
						}
					}
				}
			} else if (typeof val === 'string' && val.trim()) {
				distinctNonEmpty.add(val.trim())
				if (!bestCandidate) {
					bestCandidate = {
						value: val.trim(),
						sourcePath: String(item.raw?.path || ''),
					}
				}
			}
		}

		if (distinctNonEmpty.size > 1) {
			tagConflictFields.push(spec.label)
		}

		const isMissingOnSurvivor = spec.key === 'hasCoverArt' ? !survivorVal : !String(survivorVal || '').trim()
		if (isMissingOnSurvivor && bestCandidate) {
			consolidatedTags[spec.key] = spec.key === 'hasCoverArt' ? true : bestCandidate.value
			mergeableFields.push({
				field: spec.key,
				label: spec.label,
				value: bestCandidate.value,
				sourcePath: bestCandidate.sourcePath,
			})
		}
	}

	return {
		consolidatedTags,
		mergeableFields,
		tagConflictFields,
		tagConsolidationNeeded: mergeableFields.length > 0 || tagConflictFields.length > 0,
	}
}

/**
 * Build the complete Audio Duplicate & ID3 Tag Consolidation catalog from duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate groups from store/props.
 * @param {object} [inspectedByFileKey={}] - Map of file selection key -> parsed audio metadata.
 * @param {object} [options={}] - Catalog options (`keepRule`).
 * @return {{
 *   groups: Array<object>,
 *   summary: {
 *     totalAudioGroups: number,
 *     totalAudioFiles: number,
 *     totalReclaimableBytes: number,
 *     totalReclaimableFormatted: string,
 *     inspectedCount: number,
 *     losslessGroupsCount: number,
 *     lowBitrateGroupsCount: number,
 *     missingTagsGroupsCount: number,
 *     crossFormatGroupsCount: number,
 *     tagConsolidationCount: number,
 *     averageTagCompleteness: number
 *   }
 * }} Audio catalog and KPIs.
 */
export function buildAudioConsolidationCatalog(duplicates, inspectedByFileKey = {}, options = {}) {
	const groupList = Array.isArray(duplicates) ? duplicates : []
	const inspectedMap = inspectedByFileKey && typeof inspectedByFileKey === 'object' ? inspectedByFileKey : {}
	const keepRule = AUDIO_KEEP_RULES.includes(options.keepRule) ? options.keepRule : 'balanced_master'

	const groups = []
	const identityBuckets = new Map()

	for (const group of groupList) {
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}
		const audioFiles = group.files.filter(isAudioFile)
		if (audioFiles.length === 0) {
			continue
		}

		const groupKey = String(group.id !== undefined && group.id !== null ? group.id : (group.hash || audioFiles[0].path || ''))
		const wrappedFiles = group.files.map(raw => {
			const fileKey = getFileSelectionKey(raw)
			const cached = inspectedMap[fileKey]
			const meta = cached || parseAudioTrackMetadata(null, raw)
			return {
				fileKey,
				raw,
				meta,
			}
		})

		const selection = selectAudioGroupSurvivor(wrappedFiles, keepRule)
		const primaryEntry = selection.survivors[0] || wrappedFiles[0]
		const primaryMeta = primaryEntry.meta
		const fileSize = Number(primaryEntry.raw.size) || 0
		const reclaimableBytes = selection.deletionCandidates.reduce(
			(sum, item) => sum + (Number(item.raw?.size) || 0),
			0,
		)
		const allProtected = selection.deletionCandidates.length === 0
		const inspectedFilesCount = wrappedFiles.filter(item => item.meta.status === 'ready').length

		const consolidation = buildAlbumTagConsolidationPlan(wrappedFiles, primaryEntry)
		const maxBitrateKbps = wrappedFiles.reduce((max, item) => Math.max(max, Number(item.meta.bitrateKbps) || 0), 0)
		const hasLossless = wrappedFiles.some(item => item.meta.lossless)
		const hasLowBitrate = wrappedFiles.some(item => !item.meta.lossless && item.meta.bitrateKbps > 0 && item.meta.bitrateKbps < 192)
		const minTagCompleteness = wrappedFiles.reduce(
			(min, item) => Math.min(min, item.meta.tagCompletenessPercent),
			100,
		)
		const maxTagCompleteness = wrappedFiles.reduce(
			(max, item) => Math.max(max, item.meta.tagCompletenessPercent),
			0,
		)

		const displayTitle = consolidation.consolidatedTags.title
			|| primaryMeta.effectiveTitle
			|| primaryEntry.raw.name
			|| primaryEntry.raw.path
			|| 'Audio track'
		const displayArtist = consolidation.consolidatedTags.artist || primaryMeta.effectiveArtist || ''
		const displayAlbum = consolidation.consolidatedTags.album || primaryMeta.effectiveAlbum || ''

		const record = {
			groupKey,
			groupId: group.id !== undefined ? group.id : null,
			hash: String(group.hash || ''),
			rawGroup: group,
			files: wrappedFiles,
			survivors: selection.survivors.map(item => item.raw),
			deletionCandidates: selection.deletionCandidates.map(item => item.raw),
			survivorEntry: primaryEntry,
			strategyReason: selection.strategyReason,
			allProtected,
			copyCount: wrappedFiles.length,
			fileSize,
			fileSizeFormatted: formatBytes(fileSize),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			representativePath: String(primaryEntry.raw.path || ''),
			codec: primaryMeta.codec,
			formatLabel: primaryMeta.formatLabel,
			lossless: hasLossless,
			bitrateKbps: maxBitrateKbps,
			bitrateLabel: hasLossless
				? (maxBitrateKbps > 0 ? `Lossless (${maxBitrateKbps} kbps)` : 'Lossless')
				: (maxBitrateKbps > 0 ? `${maxBitrateKbps} kbps` : 'Bitrate pending'),
			sampleRate: primaryMeta.sampleRate,
			durationSeconds: primaryMeta.durationSeconds,
			durationFormatted: primaryMeta.durationFormatted,
			displayTitle: sanitizeAudioText(displayTitle, 140),
			displayArtist: sanitizeAudioText(displayArtist, 120),
			displayAlbum: sanitizeAudioText(displayAlbum, 120),
			tagCompletenessPercent: maxTagCompleteness,
			minTagCompleteness,
			hasLowBitrate,
			isMissingTags: maxTagCompleteness < 70,
			inspectedFilesCount,
			trackIdentityKey: primaryMeta.trackIdentityKey,
			consolidation,
			crossFormatMatches: [],
			rawCrossGroupFiles: [],
		}

		groups.push(record)

		if (record.trackIdentityKey && record.trackIdentityKey.length >= 3) {
			if (!identityBuckets.has(record.trackIdentityKey)) {
				identityBuckets.set(record.trackIdentityKey, [])
			}
			identityBuckets.get(record.trackIdentityKey).push(record)
		}
	}

	// Cross-format / re-encoded near-duplicate track linking across different hash groups
	for (const bucket of identityBuckets.values()) {
		if (bucket.length < 2) {
			continue
		}
		for (const group of bucket) {
			const peers = bucket.filter(other => other.groupKey !== group.groupKey)
			group.crossFormatMatches = peers.map(peer => ({
				groupKey: peer.groupKey,
				groupId: peer.groupId,
				displayTitle: peer.displayTitle,
				displayArtist: peer.displayArtist,
				formatLabel: peer.formatLabel,
				bitrateLabel: peer.bitrateLabel,
				tagCompletenessPercent: peer.tagCompletenessPercent,
				lossless: peer.lossless,
				representativePath: peer.representativePath,
				rawGroup: peer.rawGroup,
			}))
			const combinedEntries = [
				...group.files,
				...peers.flatMap(peer => peer.files),
			]
			group.consolidation = buildAlbumTagConsolidationPlan(combinedEntries, group.survivorEntry)
		}
	}

	const totalAudioFiles = groups.reduce((sum, g) => sum + g.copyCount, 0)
	const totalReclaimableBytes = groups.reduce((sum, g) => sum + g.reclaimableBytes, 0)
	const inspectedCount = groups.filter(g => g.inspectedFilesCount > 0).length
	const losslessGroupsCount = groups.filter(g => g.lossless).length
	const lowBitrateGroupsCount = groups.filter(g => g.hasLowBitrate).length
	const missingTagsGroupsCount = groups.filter(g => g.isMissingTags).length
	const crossFormatGroupsCount = groups.filter(g => g.crossFormatMatches.length > 0).length
	const tagConsolidationCount = groups.filter(g => g.consolidation.tagConsolidationNeeded).length
	const averageTagCompleteness = groups.length > 0
		? Math.round(groups.reduce((sum, g) => sum + g.tagCompletenessPercent, 0) / groups.length)
		: 0

	return {
		groups,
		summary: {
			totalAudioGroups: groups.length,
			totalAudioFiles,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
			inspectedCount,
			losslessGroupsCount,
			lowBitrateGroupsCount,
			missingTagsGroupsCount,
			crossFormatGroupsCount,
			tagConsolidationCount,
			averageTagCompleteness,
		},
	}
}

/**
 * Filter and sort audio duplicate groups deterministically.
 *
 * @param {Array<object>} groups - Catalog groups.
 * @param {object} [options={}] - Filter/sort options (`category`, `sortBy`, `searchQuery`).
 * @return {Array<object>} Filtered and sorted groups.
 */
export function filterAndSortAudioGroups(groups, options = {}) {
	const list = Array.isArray(groups) ? groups : []
	const category = options.category || 'all'
	const sortBy = options.sortBy || 'reclaimable-desc'
	const query = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const filtered = list.filter(item => {
		if (category === 'lossless' && !item.lossless) {
			return false
		}
		if (category === 'lossy-low' && !item.hasLowBitrate) {
			return false
		}
		if (category === 'missing-tags' && !item.isMissingTags) {
			return false
		}
		if (category === 'cross-format' && item.crossFormatMatches.length === 0) {
			return false
		}
		if (category === 'tag-merge' && !item.consolidation.tagConsolidationNeeded) {
			return false
		}

		if (query) {
			const haystacks = [
				item.displayTitle,
				item.displayArtist,
				item.displayAlbum,
				item.codec,
				item.formatLabel,
				item.representativePath,
				...item.files.map(f => String(f.raw?.path || '')),
			]
			const matched = haystacks.some(val => String(val || '').toLowerCase().includes(query))
			if (!matched) {
				return false
			}
		}
		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortBy === 'bitrate-desc') {
			if (a.lossless !== b.lossless) {
				return a.lossless ? -1 : 1
			}
			if (b.bitrateKbps !== a.bitrateKbps) {
				return b.bitrateKbps - a.bitrateKbps
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'tag-score-desc') {
			if (b.tagCompletenessPercent !== a.tagCompletenessPercent) {
				return b.tagCompletenessPercent - a.tagCompletenessPercent
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'copies-desc') {
			if (b.copyCount !== a.copyCount) {
				return b.copyCount - a.copyCount
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortBy === 'duration-desc') {
			if (b.durationSeconds !== a.durationSeconds) {
				return b.durationSeconds - a.durationSeconds
			}
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return a.displayTitle.localeCompare(b.displayTitle)
	})
}

/**
 * Build a plain-text consolidated ID3/Vorbis tag summary for clipboard copy.
 *
 * @param {object|null} group - Audio catalog group.
 * @return {string} Formatted multi-line plain text tag manifest.
 */
export function formatConsolidatedTagsText(group) {
	if (!group || !group.consolidation) {
		return ''
	}
	const tags = group.consolidation.consolidatedTags
	const lines = [
		`Title: ${tags.title || '(missing)'}`,
		`Artist: ${tags.artist || '(missing)'}`,
		`Album: ${tags.album || '(missing)'}`,
		`Album Artist: ${tags.albumArtist || '(missing)'}`,
		`Track #: ${tags.trackNumber || '(missing)'}`,
		`Year: ${tags.year || '(missing)'}`,
		`Genre: ${tags.genre || '(missing)'}`,
		`Cover Art: ${tags.hasCoverArt ? 'Embedded' : 'None'}`,
		`Recommended Survivor: ${group.representativePath}`,
	]
	return lines.join('\n')
}

/**
 * Build a deterministic JSON audit report for audio duplicate & tag consolidation.
 *
 * @param {object} catalog - Output from `buildAudioConsolidationCatalog`.
 * @param {object|null} [activeGroup=null] - Optional currently selected group.
 * @return {string} Pretty-printed JSON report.
 */
export function buildAudioAuditJson(catalog, activeGroup = null) {
	const safeCatalog = catalog && typeof catalog === 'object'
		? catalog
		: { groups: [], summary: {} }

	const payload = {
		schema: AUDIO_CONSOLIDATOR_SCHEMA,
		exportedAt: new Date().toISOString(),
		summary: safeCatalog.summary || {},
		groups: (safeCatalog.groups || []).map(group => ({
			groupId: group.groupId,
			hash: group.hash,
			title: group.displayTitle,
			artist: group.displayArtist,
			album: group.displayAlbum,
			codec: group.codec,
			lossless: group.lossless,
			bitrateKbps: group.bitrateKbps,
			durationSeconds: group.durationSeconds,
			copyCount: group.copyCount,
			reclaimableBytes: group.reclaimableBytes,
			tagCompletenessPercent: group.tagCompletenessPercent,
			strategyReason: group.strategyReason,
			survivorPaths: group.survivors.map(f => String(f.path || '')),
			deletionCandidatePaths: group.deletionCandidates.map(f => String(f.path || '')),
			consolidatedTags: group.consolidation.consolidatedTags,
			mergeableFields: group.consolidation.mergeableFields,
			crossFormatMatchCount: group.crossFormatMatches.length,
		})),
		activeConsolidatedTags: activeGroup ? activeGroup.consolidation.consolidatedTags : null,
	}

	return JSON.stringify(payload, null, 2)
}

/**
 * Build a CWE-1236 formula-injection-safe CSV audit report for audio duplicate groups.
 *
 * @param {object} catalog - Output from `buildAudioConsolidationCatalog`.
 * @return {string} RFC 4180 CSV content.
 */
export function buildAudioAuditCsv(catalog) {
	const safeCatalog = catalog && typeof catalog === 'object' ? catalog : { groups: [] }
	const headers = [
		'Group ID',
		'Title',
		'Artist',
		'Album',
		'Codec',
		'Lossless',
		'Bitrate (kbps)',
		'Duration',
		'Tag Completeness (%)',
		'Copies',
		'Reclaimable Bytes',
		'Cross-Format Matches',
		'Tag Merge Needed',
		'Survivor Path',
		'Strategy Reason',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	for (const group of (safeCatalog.groups || [])) {
		const row = [
			group.groupId !== null ? group.groupId : group.groupKey,
			group.displayTitle,
			group.displayArtist,
			group.displayAlbum,
			group.formatLabel,
			group.lossless ? 'Yes' : 'No',
			group.bitrateKbps || 0,
			group.durationFormatted || '',
			group.tagCompletenessPercent,
			group.copyCount,
			group.reclaimableBytes,
			group.crossFormatMatches.length,
			group.consolidation.tagConsolidationNeeded ? 'Yes' : 'No',
			group.representativePath,
			group.strategyReason,
		]
		rows.push(row.map(escapeCsvCell).join(','))
	}
	return rows.join('\n')
}
