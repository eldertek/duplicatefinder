/**
 * Pure orphaned sidecar (.xmp, .aae, .thm, .srt, .vtt, .lrc, .cue, .nfo, .sfv)
 * companion-pairing analyzer, WebDAV PROPFIND directory sibling parser,
 * cascade-orphan impact simulator, and deepest-first empty-folder sweep engine.
 * Zero DOM dependencies, zero network side effects, and CWE-1236-safe exports.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import {
	escapeCsvCell,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
} from './duplicateSelectionAndExport'
import { sanitizeContentUrl } from './mediaContentInspector'

export const SIDECAR_SWEEP_SCHEMA = 'duplicatefinder.sidecar-sweep.v1'

export const SIDECAR_FAMILIES = Object.freeze([
	'all',
	'photo-raw',
	'video-subtitle',
	'audio-companion',
	'checksum-manifest',
])

export const SIDECAR_STATUSES = Object.freeze([
	'all',
	'sweepable',
	'orphaned',
	'cascade-risk',
	'redundant',
	'healthy-paired',
])

export const SIDECAR_KEEP_STRATEGIES = Object.freeze([
	'paired_survivor',
	'protected_first',
	'oldest',
	'newest',
	'shortest_path',
])

const PHOTO_RAW_MASTER_EXTS = Object.freeze([
	'cr2', 'cr3', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'raf', 'orf', 'rw2', 'pef',
	'srw', 'x3f', 'mrw', 'crw', 'jpg', 'jpeg', 'jpe', 'png', 'tif', 'tiff', 'heic', 'heif',
	'webp', 'avif', 'bmp', 'gif',
])

const VIDEO_MASTER_EXTS = Object.freeze([
	'mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'wmv', 'ts', 'm2ts', 'mts', 'ogv', 'flv', '3gp',
])

const AUDIO_MASTER_EXTS = Object.freeze([
	'mp3', 'flac', 'm4a', 'ogg', 'opus', 'wav', 'aac', 'wma', 'alac', 'aiff', 'ape', 'wv', 'bin',
])

export const SIDECAR_RULES = Object.freeze({
	xmp: {
		family: 'photo-raw',
		label: 'Adobe / Darktable XMP metadata',
		masterExts: [...PHOTO_RAW_MASTER_EXTS, ...VIDEO_MASTER_EXTS],
		allowLanguageTag: false,
	},
	aae: {
		family: 'photo-raw',
		label: 'Apple Photos adjustment sidecar',
		masterExts: ['jpg', 'jpeg', 'heic', 'heif', 'png', 'mov', 'mp4', 'm4v'],
		allowLanguageTag: false,
	},
	thm: {
		family: 'photo-raw',
		label: 'Camera thumbnail companion',
		masterExts: [...VIDEO_MASTER_EXTS, 'cr2', 'crw', 'orf', 'mrw', 'jpg', 'jpeg'],
		allowLanguageTag: false,
	},
	pp3: {
		family: 'photo-raw',
		label: 'RawTherapee processing profile',
		masterExts: PHOTO_RAW_MASTER_EXTS,
		allowLanguageTag: false,
	},
	dop: {
		family: 'photo-raw',
		label: 'DxO PhotoLab sidecar',
		masterExts: PHOTO_RAW_MASTER_EXTS,
		allowLanguageTag: false,
	},
	on1: {
		family: 'photo-raw',
		label: 'ON1 Photo RAW sidecar',
		masterExts: PHOTO_RAW_MASTER_EXTS,
		allowLanguageTag: false,
	},
	cos: {
		family: 'photo-raw',
		label: 'Capture One settings sidecar',
		masterExts: PHOTO_RAW_MASTER_EXTS,
		allowLanguageTag: false,
	},
	srt: {
		family: 'video-subtitle',
		label: 'SubRip subtitle sidecar',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	vtt: {
		family: 'video-subtitle',
		label: 'WebVTT subtitle sidecar',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	ass: {
		family: 'video-subtitle',
		label: 'ASS / SSA styled subtitle sidecar',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	ssa: {
		family: 'video-subtitle',
		label: 'SubStation Alpha subtitle sidecar',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	sub: {
		family: 'video-subtitle',
		label: 'VobSub / MicroDVD subtitle sidecar',
		masterExts: [...VIDEO_MASTER_EXTS, 'idx'],
		allowLanguageTag: true,
	},
	idx: {
		family: 'video-subtitle',
		label: 'VobSub subtitle index sidecar',
		masterExts: [...VIDEO_MASTER_EXTS, 'sub'],
		allowLanguageTag: true,
	},
	smi: {
		family: 'video-subtitle',
		label: 'SAMI subtitle sidecar',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	nfo: {
		family: 'video-subtitle',
		label: 'Media library NFO metadata',
		masterExts: [...VIDEO_MASTER_EXTS, ...AUDIO_MASTER_EXTS],
		allowLanguageTag: false,
	},
	bif: {
		family: 'video-subtitle',
		label: 'Video trickplay thumbnail index',
		masterExts: VIDEO_MASTER_EXTS,
		allowLanguageTag: false,
	},
	lrc: {
		family: 'audio-companion',
		label: 'Synchronized audio lyrics sidecar',
		masterExts: AUDIO_MASTER_EXTS,
		allowLanguageTag: true,
	},
	cue: {
		family: 'audio-companion',
		label: 'Audio disc CUE sheet',
		masterExts: AUDIO_MASTER_EXTS,
		allowLanguageTag: false,
	},
	sfv: {
		family: 'checksum-manifest',
		label: 'SFV CRC32 verification companion',
		masterExts: ['*'],
		allowLanguageTag: false,
	},
	md5: {
		family: 'checksum-manifest',
		label: 'MD5 checksum companion',
		masterExts: ['*'],
		allowLanguageTag: false,
	},
	sha1: {
		family: 'checksum-manifest',
		label: 'SHA-1 checksum companion',
		masterExts: ['*'],
		allowLanguageTag: false,
	},
	sha256: {
		family: 'checksum-manifest',
		label: 'SHA-256 checksum companion',
		masterExts: ['*'],
		allowLanguageTag: false,
	},
})

const SUBTITLE_LANGUAGE_TOKENS = new Set([
	'en', 'eng', 'fr', 'fre', 'fra', 'de', 'deu', 'ger', 'es', 'spa', 'it', 'ita',
	'pt', 'por', 'nl', 'nld', 'dut', 'ja', 'jpn', 'ko', 'kor', 'zh', 'zho', 'chi',
	'ru', 'rus', 'ar', 'ara', 'pl', 'pol', 'sv', 'swe', 'da', 'dan', 'no', 'nor',
	'fi', 'fin', 'tr', 'tur', 'uk', 'ukr', 'cs', 'ces', 'cze', 'el', 'ell', 'gre',
	'he', 'heb', 'hi', 'hin', 'id', 'ind', 'vi', 'vie', 'th', 'tha',
	'forced', 'sdh', 'cc', 'hi', 'default', 'signs', 'songs', 'commentary', 'en-us', 'en-gb', 'fr-fr', 'pt-br',
])

const FOLDER_WIDE_CHECKSUM_NAMES = new Set([
	'checksums', 'checksum', 'md5sums', 'md5sum', 'sha1sums', 'sha1sum',
	'sha256sums', 'sha256sum', 'sfv', 'verify', 'manifest',
])

const STATUS_PRIORITY = Object.freeze({
	'orphaned-confirmed': 0,
	'cascade-orphan-risk': 1,
	'redundant-duplicate': 2,
	'orphaned-inferred': 3,
	'healthy-paired': 4,
})

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text display.
 *
 * @param {*} raw - Candidate string value.
 * @param {number} [maxLen=240] - Maximum character length.
 * @return {string} Cleaned plain text.
 */
export function sanitizeSweepText(raw, maxLen = 240) {
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
 * Extract normalized display path and parent folder from a raw Nextcloud file path.
 *
 * @param {string|null|undefined} rawPath - Raw path.
 * @return {{ displayPath: string, folderPath: string, fileName: string }} Path breakdown.
 */
export function splitDisplayPath(rawPath) {
	if (typeof rawPath !== 'string' || !rawPath.trim()) {
		return { displayPath: '', folderPath: '/', fileName: '' }
	}
	const normalized = normalizePathForDiff(rawPath.trim()).replace(/\\/g, '/').replace(/\/+/g, '/')
	const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
	const clean = withLeadingSlash.length > 1 ? withLeadingSlash.replace(/\/+$/, '') : withLeadingSlash
	const idx = clean.lastIndexOf('/')
	if (idx <= 0) {
		return {
			displayPath: clean,
			folderPath: '/',
			fileName: clean === '/' ? '' : clean.slice(1),
		}
	}
	return {
		displayPath: clean,
		folderPath: clean.slice(0, idx) || '/',
		fileName: clean.slice(idx + 1),
	}
}

/**
 * Determine whether a file entry is marked as protected/in an origin folder.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {boolean} True when protected.
 */
export function isProtectedFile(file) {
	return Boolean(file && (file.isInOriginFolder || file.isOriginFolder || file.protected))
}

/**
 * Return sidecar rule metadata for a file path or extension, or null when not a sidecar.
 *
 * @param {string|null|undefined} pathOrExt - File path or lowercase extension.
 * @return {object|null} Rule object with extension key, or null.
 */
export function getSidecarRule(pathOrExt) {
	if (typeof pathOrExt !== 'string' || !pathOrExt.trim()) {
		return null
	}
	const trimmed = pathOrExt.trim().toLowerCase()
	const ext = trimmed.includes('.') || trimmed.includes('/') || trimmed.includes('\\')
		? extractFileExtension(trimmed)
		: trimmed
	if (!ext || !Object.prototype.hasOwnProperty.call(SIDECAR_RULES, ext)) {
		return null
	}
	return {
		ext,
		...SIDECAR_RULES[ext],
	}
}

/**
 * Check whether an extension or path corresponds to a known sidecar companion type.
 *
 * @param {string|null|undefined} pathOrExt - File path or extension.
 * @return {boolean} True for known sidecars.
 */
export function isSidecarFile(pathOrExt) {
	return getSidecarRule(pathOrExt) !== null
}

/**
 * Parse a sidecar path into normalized base stem, double-extension hinted master,
 * and subtitle language/flag tokens.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {object|null} Parsed sidecar descriptor or null when not a sidecar.
 */
export function parseSidecarCandidate(rawPath) {
	const { displayPath, folderPath, fileName } = splitDisplayPath(rawPath)
	if (!fileName) {
		return null
	}
	const rule = getSidecarRule(fileName)
	if (!rule) {
		return null
	}

	const lowerName = fileName.toLowerCase()
	const withoutSidecarExt = lowerName.slice(0, -(rule.ext.length + 1))
	if (!withoutSidecarExt) {
		return null
	}

	let baseStem = withoutSidecarExt
	let hintedMasterExt = ''
	let hintedMasterName = ''
	const languageTags = []

	// Handle double-extension conventions such as IMG_0042.CR2.xmp or clip.mp4.pp3
	const secondDotIdx = withoutSidecarExt.lastIndexOf('.')
	if (secondDotIdx > 0 && secondDotIdx < withoutSidecarExt.length - 1) {
		const innerTail = withoutSidecarExt.slice(secondDotIdx + 1)
		if (
			rule.masterExts.includes('*')
			|| rule.masterExts.includes(innerTail)
		) {
			hintedMasterExt = innerTail
			hintedMasterName = withoutSidecarExt
			baseStem = withoutSidecarExt.slice(0, secondDotIdx)
		}
	}

	// Strip trailing language/flag tokens for subtitles and lyrics (e.g. Film.en.forced.srt)
	if (rule.allowLanguageTag && !hintedMasterExt) {
		const segments = baseStem.split('.')
		while (segments.length > 1) {
			const tail = segments[segments.length - 1]
			if (SUBTITLE_LANGUAGE_TOKENS.has(tail) || /^[a-z]{2}(?:-[a-z]{2})?$/.test(tail)) {
				languageTags.unshift(segments.pop())
			} else {
				break
			}
		}
		baseStem = segments.join('.')
	}

	// Apple Photos IMG_E1234.aae can pair with IMG_1234.jpg / IMG_E1234.jpg
	const alternateStems = []
	if (rule.ext === 'aae' && /^img_e\d+/.test(baseStem)) {
		alternateStems.push(`img_${baseStem.slice(5)}`)
	}

	const isFolderWideChecksum = rule.family === 'checksum-manifest'
		&& FOLDER_WIDE_CHECKSUM_NAMES.has(baseStem)

	return {
		displayPath,
		folderPath,
		fileName,
		sidecarExt: rule.ext,
		family: rule.family,
		familyLabel: rule.label,
		masterExts: rule.masterExts,
		baseStem,
		alternateStems,
		hintedMasterExt,
		hintedMasterName,
		languageTags,
		isFolderWideChecksum,
	}
}

/**
 * Decode safe XML character entities inside plain text nodes without DOM parsing.
 *
 * @param {string} value - Raw XML text content.
 * @return {string} Decoded plain string.
 */
export function decodeXmlEntities(value) {
	if (typeof value !== 'string' || !value) {
		return ''
	}
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, '\'')
		.replace(/&#(\d+);/g, (_, dec) => {
			const code = Number.parseInt(dec, 10)
			return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: ''
		})
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
			const code = Number.parseInt(hex, 16)
			return Number.isFinite(code) && code >= 32 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: ''
		})
		.replace(/&amp;/g, '&')
}

/**
 * Extract the text content of the first matching XML tag (namespace-prefix tolerant).
 *
 * @param {string} block - XML fragment.
 * @param {string} localName - XML element local name.
 * @return {string} Trimmed decoded tag value or empty string.
 */
function extractXmlTagText(block, localName) {
	const regex = new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${localName}>`, 'i')
	const match = block.match(regex)
	if (!match) {
		return ''
	}
	return decodeXmlEntities(match[1].replace(/<[^>]*>/g, '')).trim()
}

/**
 * Build a safe Nextcloud WebDAV folder URL for Depth: 1 PROPFIND probing.
 *
 * @param {string} folderPath - Normalized display folder path (e.g. '/Photos/2025').
 * @param {object} [ocGlobal] - Optional Nextcloud OC global object.
 * @return {string} Sanitized WebDAV URL or empty string when unavailable.
 */
export function buildWebdavFolderPropfindUrl(folderPath, ocGlobal = null) {
	const oc = ocGlobal || (typeof window !== 'undefined' ? window.OC : null)
	if (!oc || typeof oc.getCurrentUser !== 'function' || typeof oc.linkToRemoteBase !== 'function') {
		return ''
	}
	const user = oc.getCurrentUser()
	const uid = user && typeof user.uid === 'string' ? user.uid.trim() : ''
	if (!uid) {
		return ''
	}
	const { displayPath } = splitDisplayPath(folderPath || '/')
	const segments = displayPath === '/'
		? []
		: displayPath.split('/').filter(Boolean).map(seg => encodeURIComponent(seg))
	const suffix = segments.length > 0 ? `/${segments.join('/')}/` : '/'
	return sanitizeContentUrl(oc.linkToRemoteBase(`dav/files/${encodeURIComponent(uid)}${suffix}`))
}

/**
 * Parse a Nextcloud WebDAV PROPFIND XML multistatus response into sibling entries.
 * Pure string/regex XML extraction (zero DOM HTML parsing or XSS sinks).
 *
 * @param {string} xmlText - Raw XML response body.
 * @param {string} [folderPath='/'] - Probed folder display path.
 * @return {Array<{
 *   path: string,
 *   name: string,
 *   folderPath: string,
 *   isDirectory: boolean,
 *   size: number,
 *   mtime: number|null,
 *   mimetype: string,
 *   isFromProbe: boolean
 * }>} Parsed directory entries (excluding the probed folder itself).
 */
export function parseWebdavDirectoryEntries(xmlText, folderPath = '/') {
	if (typeof xmlText !== 'string' || !xmlText.trim()) {
		return []
	}
	const normalizedFolder = splitDisplayPath(folderPath).displayPath || '/'
	const responseRegex = /<(?:[a-zA-Z0-9_-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?response>/gi
	const entries = []
	const seenPaths = new Set()

	let match = responseRegex.exec(xmlText)
	while (match !== null) {
		const block = match[1]
		const rawHref = extractXmlTagText(block, 'href')
		if (rawHref) {
			const cleanHref = rawHref.split(/[?#]/)[0]
			const isTrailingSlash = cleanHref.endsWith('/')
			const hasCollection = /<(?:[a-zA-Z0-9_-]+:)?collection(?:\s*\/)?>/i.test(block)
			const isDirectory = hasCollection || isTrailingSlash

			// Decode segments after /dav/files/<user>/ when present
			let relativeDecoded = ''
			const davMatch = cleanHref.match(/\/remote\.php\/dav\/files\/[^/]+(\/.*)?$/i)
				|| cleanHref.match(/\/dav\/files\/[^/]+(\/.*)?$/i)
			const rawTail = davMatch ? (davMatch[1] || '/') : cleanHref
			try {
				relativeDecoded = decodeURIComponent(rawTail)
			} catch {
				relativeDecoded = rawTail
			}

			const { displayPath, fileName } = splitDisplayPath(relativeDecoded)
			// Skip the folder itself if href matches the probed folder
			const isSelf = displayPath === normalizedFolder
				|| (normalizedFolder === '/' && (displayPath === '/' || fileName === ''))

			if (!isSelf && fileName) {
				const targetPath = normalizedFolder === '/'
					? `/${fileName}`
					: `${normalizedFolder}/${fileName}`
				if (!seenPaths.has(targetPath)) {
					seenPaths.add(targetPath)
					const rawSize = extractXmlTagText(block, 'getcontentlength')
					const parsedSize = rawSize ? Number.parseInt(rawSize, 10) : 0
					const rawMtime = extractXmlTagText(block, 'getlastmodified')
					const parsedMtime = rawMtime ? Date.parse(rawMtime) : Number.NaN
					const mimetype = sanitizeSweepText(extractXmlTagText(block, 'getcontenttype'), 120)
					const rawId = extractXmlTagText(block, 'fileid')
					const parsedId = rawId && /^\d+$/.test(rawId) ? Number.parseInt(rawId, 10) : null

					entries.push({
						id: null,
						nodeId: parsedId,
						path: targetPath,
						name: sanitizeSweepText(fileName, 200),
						folderPath: normalizedFolder,
						isDirectory,
						size: Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : 0,
						mtime: Number.isFinite(parsedMtime) && parsedMtime > 0 ? Math.floor(parsedMtime / 1000) : null,
						mimetype: isDirectory ? 'httpd/unix-directory' : mimetype,
						isFromProbe: true,
					})
				}
			}
		}
		match = responseRegex.exec(xmlText)
	}

	return entries
}

/**
 * Determine which file in a duplicate group survives under a sidecar-aware keep strategy.
 *
 * @param {object} group - Duplicate group object.
 * @param {string} keepStrategy - Keep strategy identifier.
 * @param {Map<string, Array>} folderIndex - Indexed folder entries for paired-master lookup.
 * @param {Set<string|number>} [deletedMasterKeys] - Planned deleted master file selection keys.
 * @return {{ survivors: Array<object>, deletionCandidates: Array<object> }} Partitioned files.
 */
function partitionDuplicateGroup(group, keepStrategy, folderIndex, deletedMasterKeys = new Set()) {
	const files = Array.isArray(group && group.files) ? group.files.filter(Boolean) : []
	if (files.length === 0) {
		return { survivors: [], deletionCandidates: [] }
	}
	if (files.length === 1) {
		return { survivors: [files[0]], deletionCandidates: [] }
	}

	// Protected origin files always survive
	const protectedFiles = files.filter(file => isProtectedFile(file))
	if (protectedFiles.length > 0 && keepStrategy === 'protected_first') {
		const protectedKeys = new Set(protectedFiles.map(f => getFileSelectionKey(f)))
		return {
			survivors: protectedFiles,
			deletionCandidates: files.filter(f => !protectedKeys.has(getFileSelectionKey(f))),
		}
	}

	// Paired-survivor strategy prefers a sidecar copy sitting next to a surviving master file
	if (keepStrategy === 'paired_survivor') {
		const scored = files.map(file => {
			const parsed = parseSidecarCandidate(file.path)
			let pairedScore = 0
			if (parsed) {
				const folderFiles = folderIndex.get(parsed.folderPath) || []
				const matches = findMatchingMastersInFolder(parsed, folderFiles, deletedMasterKeys)
				if (matches.survivingMasters.length > 0) {
					pairedScore = 2
				}
			}
			if (isProtectedFile(file)) {
				pairedScore += 4
			}
			return { file, pairedScore }
		})
		const maxScore = Math.max(...scored.map(s => s.pairedScore))
		if (maxScore > 0) {
			const preferred = scored.filter(s => s.pairedScore === maxScore).map(s => s.file)
			const keeper = preferred[0]
			const keeperKey = getFileSelectionKey(keeper)
			const survivors = files.filter(f => isProtectedFile(f) || getFileSelectionKey(f) === keeperKey)
			const survivorKeys = new Set(survivors.map(f => getFileSelectionKey(f)))
			return {
				survivors,
				deletionCandidates: files.filter(f => !survivorKeys.has(getFileSelectionKey(f))),
			}
		}
	}

	const rule = keepStrategy === 'newest' || keepStrategy === 'shortest_path'
		? keepStrategy
		: 'oldest'
	const selectedKeySet = new Set(selectDuplicatesByKeepRule(files, rule))

	// Safety invariant: never delete protected files
	const safeDeletion = files.filter(f => selectedKeySet.has(getFileSelectionKey(f)) && !isProtectedFile(f))
	const safeDeleteKeys = new Set(safeDeletion.map(f => getFileSelectionKey(f)))
	const survivors = files.filter(f => !safeDeleteKeys.has(getFileSelectionKey(f)))

	if (survivors.length === 0 && files.length > 0) {
		return {
			survivors: [files[0]],
			deletionCandidates: files.slice(1).filter(f => !isProtectedFile(f)),
		}
	}
	return { survivors, deletionCandidates: safeDeletion }
}

/**
 * Find matching non-sidecar master media files inside the same folder.
 *
 * @param {object} parsedSidecar - Result from parseSidecarCandidate.
 * @param {Array<object>} folderEntries - All known files in that folder.
 * @param {Set<string|number>} deletedKeySet - Keys of master files queued for deletion.
 * @return {{
 *   allMasters: Array<object>,
 *   survivingMasters: Array<object>,
 *   queuedDeleteMasters: Array<object>
 * }} Master match sets.
 */
export function findMatchingMastersInFolder(parsedSidecar, folderEntries, deletedKeySet = new Set()) {
	if (!parsedSidecar || !Array.isArray(folderEntries)) {
		return { allMasters: [], survivingMasters: [], queuedDeleteMasters: [] }
	}
	const allMasters = []
	const seen = new Set()

	for (const entry of folderEntries) {
		if (!entry || entry.isDirectory) {
			continue
		}
		const { fileName, displayPath } = splitDisplayPath(entry.path || entry.name || '')
		if (!fileName || isSidecarFile(fileName)) {
			continue
		}
		const lowerName = fileName.toLowerCase()
		const ext = extractFileExtension(lowerName)
		const dotIdx = lowerName.lastIndexOf('.')
		const entryStem = dotIdx > 0 ? lowerName.slice(0, dotIdx) : lowerName

		let matched = false
		if (parsedSidecar.isFolderWideChecksum) {
			matched = true
		} else if (parsedSidecar.hintedMasterName && lowerName === parsedSidecar.hintedMasterName) {
			matched = true
		} else {
			const extAllowed = parsedSidecar.masterExts.includes('*') || (ext && parsedSidecar.masterExts.includes(ext))
			if (extAllowed) {
				if (entryStem === parsedSidecar.baseStem) {
					matched = true
				} else if (parsedSidecar.alternateStems.includes(entryStem)) {
					matched = true
				}
			}
		}

		if (matched && !seen.has(displayPath)) {
			seen.add(displayPath)
			allMasters.push(entry)
		}
	}

	const survivingMasters = []
	const queuedDeleteMasters = []
	for (const master of allMasters) {
		const key = getFileSelectionKey(master)
		if (key !== null && deletedKeySet.has(key)) {
			queuedDeleteMasters.push(master)
		} else {
			survivingMasters.push(master)
		}
	}

	return { allMasters, survivingMasters, queuedDeleteMasters }
}

/**
 * Normalize and sort detected empty folders deepest-first for safe post-cleanup sweeping.
 *
 * @param {Array<object>} emptyFolders - Raw folders from scanEmptyFolders API.
 * @param {Array<string>} ignoredEmptyFolders - Ignored folder paths.
 * @return {object} Normalized empty-folder report.
 */
export function buildEmptyFolderSweepReport(emptyFolders = [], ignoredEmptyFolders = []) {
	const ignoredSet = new Set(
		(Array.isArray(ignoredEmptyFolders) ? ignoredEmptyFolders : [])
			.filter(item => typeof item === 'string' && item.trim() !== '')
			.map(item => splitDisplayPath(item).displayPath),
	)

	const deduped = new Map()
	for (const raw of Array.isArray(emptyFolders) ? emptyFolders : []) {
		if (!raw || typeof raw.path !== 'string' || !raw.path.trim()) {
			continue
		}
		const { displayPath, fileName } = splitDisplayPath(raw.path)
		if (!displayPath || displayPath === '/') {
			continue
		}
		const depth = Number.isFinite(Number(raw.depth))
			? Number(raw.depth)
			: displayPath.split('/').filter(Boolean).length
		const mtimeNum = Number(raw.mtime)
		deduped.set(displayPath, {
			path: raw.path,
			displayPath,
			name: sanitizeSweepText(raw.name || fileName || displayPath, 160),
			depth,
			hasEmptySubfolders: Boolean(raw.hasEmptySubfolders),
			mtime: Number.isFinite(mtimeNum) && mtimeNum > 0 ? mtimeNum : null,
			mtimeFormatted: Number.isFinite(mtimeNum) && mtimeNum > 0 ? formatFileModifiedTime({ mtime: mtimeNum }) : '',
			ignored: ignoredSet.has(displayPath) || ignoredSet.has(raw.path),
		})
	}

	const sorted = Array.from(deduped.values()).sort((a, b) => {
		if (b.depth !== a.depth) {
			return b.depth - a.depth
		}
		return a.displayPath.localeCompare(b.displayPath)
	})

	const active = sorted.filter(folder => !folder.ignored)
	const ignored = sorted.filter(folder => folder.ignored)

	return {
		all: sorted,
		active,
		ignored,
		totalCount: sorted.length,
		activeCount: active.length,
		ignoredCount: ignored.length,
	}
}

/**
 * Analyze duplicate groups, WebDAV-probed sibling files, cascade deletion impact,
 * and empty folders into a unified deterministic sweep catalog.
 *
 * @param {Array<object>} duplicateGroups - Loaded or filtered duplicate groups.
 * @param {object} [options] - Analysis options.
 * @param {string} [options.keepStrategy='paired_survivor'] - Survivor strategy.
 * @param {object} [options.probedFoldersByPath={}] - Map of folderPath -> { status, entries, error }.
 * @param {Array<object>} [options.emptyFolders=[]] - Empty folders list from API.
 * @param {Array<string>} [options.ignoredEmptyFolders=[]] - Ignored empty folder paths.
 * @param {Array<string|number>} [options.plannedDeleteKeys=[]] - Optional override deleted master keys.
 * @return {object} Complete sidecar & empty-folder sweep catalog.
 */
export function analyzeSidecarSweepCatalog(duplicateGroups = [], options = {}) {
	const groups = Array.isArray(duplicateGroups) ? duplicateGroups.filter(Boolean) : []
	const keepStrategy = SIDECAR_KEEP_STRATEGIES.includes(options.keepStrategy)
		? options.keepStrategy
		: 'paired_survivor'
	const probedFoldersByPath = options.probedFoldersByPath && typeof options.probedFoldersByPath === 'object'
		? options.probedFoldersByPath
		: {}

	// 1. Build unified folder file index from duplicate groups + WebDAV folder probes
	const folderIndex = new Map()
	const uniqueFoldersSet = new Set()

	const addFileToFolderIndex = (folderPath, fileEntry) => {
		if (!folderPath) {
			return
		}
		uniqueFoldersSet.add(folderPath)
		if (!folderIndex.has(folderPath)) {
			folderIndex.set(folderPath, [])
		}
		const bucket = folderIndex.get(folderPath)
		const { displayPath } = splitDisplayPath(fileEntry.path || fileEntry.name || '')
		if (!bucket.some(existing => splitDisplayPath(existing.path || existing.name || '').displayPath === displayPath)) {
			bucket.push(fileEntry)
		}
	}

	for (const group of groups) {
		for (const file of Array.isArray(group.files) ? group.files : []) {
			if (!file || typeof file.path !== 'string') {
				continue
			}
			const { folderPath } = splitDisplayPath(file.path)
			addFileToFolderIndex(folderPath, file)
		}
	}

	for (const [rawFolder, probeState] of Object.entries(probedFoldersByPath)) {
		const folderPath = splitDisplayPath(rawFolder).displayPath || '/'
		uniqueFoldersSet.add(folderPath)
		if (probeState && probeState.status === 'probed' && Array.isArray(probeState.entries)) {
			for (const entry of probeState.entries) {
				addFileToFolderIndex(folderPath, entry)
			}
		}
	}

	// 2. Two-pass partition: determine planned master deletions first, then sidecar survivors
	const plannedDeleteKeySet = new Set(Array.isArray(options.plannedDeleteKeys) ? options.plannedDeleteKeys : [])
	for (const group of groups) {
		const files = Array.isArray(group && group.files) ? group.files : []
		if (files.some(f => f && !isSidecarFile(f.path))) {
			const partition = partitionDuplicateGroup(group, keepStrategy, folderIndex, plannedDeleteKeySet)
			for (const file of partition.deletionCandidates) {
				const key = getFileSelectionKey(file)
				if (key !== null && !isSidecarFile(file.path)) {
					plannedDeleteKeySet.add(key)
				}
			}
		}
	}

	const groupPartitions = new Map()
	for (const group of groups) {
		const partition = partitionDuplicateGroup(group, keepStrategy, folderIndex, plannedDeleteKeySet)
		groupPartitions.set(group, partition)
	}

	// 3. Collect all sidecar entries across duplicate groups AND probed sibling folders
	const items = []
	const seenSidecarKeys = new Set()

	const pushSidecarItem = (file, groupContext = null, isRedundantDuplicateCopy = false, survivingTwinPath = '') => {
		const parsed = parseSidecarCandidate(file && (file.path || file.name))
		if (!parsed) {
			return
		}
		const dedupeKey = parsed.displayPath
		if (seenSidecarKeys.has(dedupeKey)) {
			return
		}
		seenSidecarKeys.add(dedupeKey)

		const probeInfo = probedFoldersByPath[parsed.folderPath] || null
		const isFolderProbed = Boolean(probeInfo && probeInfo.status === 'probed')
		const folderEntries = folderIndex.get(parsed.folderPath) || []
		const masterMatches = findMatchingMastersInFolder(parsed, folderEntries, plannedDeleteKeySet)
		const isProtected = isProtectedFile(file)
		const sizeBytes = Number.isFinite(Number(file.size)) && Number(file.size) >= 0 ? Number(file.size) : 0

		let status = 'orphaned-inferred'
		let statusLabel = 'Unpaired in scanned groups'
		let reason = ''

		if (masterMatches.survivingMasters.length > 0) {
			if (isRedundantDuplicateCopy && !isProtected) {
				status = 'redundant-duplicate'
				statusLabel = 'Redundant sidecar copy'
				reason = survivingTwinPath
					? `Duplicate sidecar copy; surviving companion kept at ${survivingTwinPath}`
					: 'Duplicate sidecar copy; another copy is retained in this group'
			} else {
				status = 'healthy-paired'
				statusLabel = 'Paired with master'
				const sampleMaster = splitDisplayPath(masterMatches.survivingMasters[0].path || masterMatches.survivingMasters[0].name).fileName
				reason = `Paired with surviving master ${sampleMaster}`
			}
		} else if (masterMatches.queuedDeleteMasters.length > 0) {
			status = 'cascade-orphan-risk'
			statusLabel = 'Cascade orphan risk'
			const doomedMaster = splitDisplayPath(masterMatches.queuedDeleteMasters[0].path || masterMatches.queuedDeleteMasters[0].name).fileName
			reason = `Master ${doomedMaster} is queued for deletion under current keep rule`
		} else if (isRedundantDuplicateCopy && !isProtected) {
			status = 'redundant-duplicate'
			statusLabel = 'Redundant sidecar copy'
			reason = survivingTwinPath
				? `Duplicate sidecar copy; primary copy kept at ${survivingTwinPath}`
				: 'Duplicate sidecar copy in non-surviving folder'
		} else if (isFolderProbed) {
			status = 'orphaned-confirmed'
			statusLabel = 'Confirmed orphan'
			reason = parsed.hintedMasterName
				? `Expected master ${parsed.hintedMasterName} not found in probed folder`
				: `No matching master file (.${parsed.masterExts.slice(0, 4).join(', .')}) found in probed folder`
		} else {
			status = 'orphaned-inferred'
			statusLabel = 'Potential orphan (unprobed)'
			reason = 'No matching master found in duplicate scan; run WebDAV folder probe to verify non-duplicate siblings'
		}

		const selectionKey = getFileSelectionKey(file)
		const canDelete = Boolean(
			!isProtected
			&& !file.isFromProbe
			&& file.id !== null
			&& file.id !== undefined
			&& status !== 'healthy-paired',
		)
		const canProbeDelete = Boolean(
			!isProtected
			&& status !== 'healthy-paired',
		)

		items.push({
			itemKey: `${dedupeKey}::${selectionKey ?? 'probe'}`,
			selectionKey,
			file,
			id: file.id ?? null,
			nodeId: file.nodeId ?? null,
			path: file.path || parsed.displayPath,
			displayPath: parsed.displayPath,
			folderPath: parsed.folderPath,
			fileName: sanitizeSweepText(parsed.fileName, 200),
			sidecarExt: parsed.sidecarExt,
			family: parsed.family,
			familyLabel: parsed.familyLabel,
			baseStem: parsed.baseStem,
			hintedMasterName: parsed.hintedMasterName,
			languageTags: parsed.languageTags,
			expectedMasterExts: parsed.masterExts,
			sizeBytes,
			sizeFormatted: formatBytes(sizeBytes),
			mtime: file.mtime ?? null,
			mtimeFormatted: formatFileModifiedTime(file),
			isProtected,
			isFromProbe: Boolean(file.isFromProbe),
			isFolderProbed,
			status,
			statusLabel,
			reason,
			priorityRank: STATUS_PRIORITY[status] ?? 9,
			groupId: groupContext ? groupContext.id : null,
			groupHash: groupContext ? (groupContext.hash || '') : '',
			group: groupContext,
			survivingMasterNames: masterMatches.survivingMasters.map(m => splitDisplayPath(m.path || m.name).fileName),
			queuedDeleteMasterNames: masterMatches.queuedDeleteMasters.map(m => splitDisplayPath(m.path || m.name).fileName),
			siblingCount: folderEntries.filter(e => !e.isDirectory).length,
			canApiDelete: canDelete,
			canSweepCandidate: canProbeDelete && status !== 'healthy-paired',
		})
	}

	for (const group of groups) {
		const partition = groupPartitions.get(group) || { survivors: [], deletionCandidates: [] }
		const survivorKeys = new Set(partition.survivors.map(s => getFileSelectionKey(s)))
		const firstSurvivorPath = partition.survivors[0]
			? splitDisplayPath(partition.survivors[0].path).displayPath
			: ''

		for (const file of Array.isArray(group.files) ? group.files : []) {
			if (!file || !isSidecarFile(file.path)) {
				continue
			}
			const key = getFileSelectionKey(file)
			const isRedundant = group.files.length > 1 && !survivorKeys.has(key)
			pushSidecarItem(file, group, isRedundant, firstSurvivorPath)
		}
	}

	for (const [rawFolder, probeState] of Object.entries(probedFoldersByPath)) {
		if (!probeState || probeState.status !== 'probed' || !Array.isArray(probeState.entries)) {
			continue
		}
		for (const entry of probeState.entries) {
			if (!entry || entry.isDirectory || !isSidecarFile(entry.path || entry.name)) {
				continue
			}
			pushSidecarItem(
				{
					...entry,
					path: entry.path || `${splitDisplayPath(rawFolder).displayPath}/${entry.name}`,
				},
				null,
				false,
				'',
			)
		}
	}

	items.sort((a, b) => {
		if (a.priorityRank !== b.priorityRank) {
			return a.priorityRank - b.priorityRank
		}
		if (b.sizeBytes !== a.sizeBytes) {
			return b.sizeBytes - a.sizeBytes
		}
		return a.displayPath.localeCompare(b.displayPath)
	})

	const byFamily = {
		'photo-raw': 0,
		'video-subtitle': 0,
		'audio-companion': 0,
		'checksum-manifest': 0,
	}
	let confirmedOrphanCount = 0
	let inferredOrphanCount = 0
	let cascadeRiskCount = 0
	let redundantDuplicateCount = 0
	let healthyPairedCount = 0
	let protectedOriginCount = 0
	let sweepCandidateCount = 0
	let sweepReclaimableBytes = 0

	for (const item of items) {
		if (Object.prototype.hasOwnProperty.call(byFamily, item.family)) {
			byFamily[item.family] += 1
		}
		if (item.isProtected) {
			protectedOriginCount += 1
		}
		if (item.status === 'orphaned-confirmed') {
			confirmedOrphanCount += 1
		} else if (item.status === 'orphaned-inferred') {
			inferredOrphanCount += 1
		} else if (item.status === 'cascade-orphan-risk') {
			cascadeRiskCount += 1
		} else if (item.status === 'redundant-duplicate') {
			redundantDuplicateCount += 1
		} else if (item.status === 'healthy-paired') {
			healthyPairedCount += 1
		}

		if (item.canSweepCandidate) {
			sweepCandidateCount += 1
			sweepReclaimableBytes += item.sizeBytes
		}
	}

	const uniqueFolders = Array.from(uniqueFoldersSet).sort()
	const probedFolderCount = uniqueFolders.filter(
		folder => probedFoldersByPath[folder] && probedFoldersByPath[folder].status === 'probed',
	).length

	const emptyFoldersReport = buildEmptyFolderSweepReport(
		options.emptyFolders,
		options.ignoredEmptyFolders,
	)

	return {
		keepStrategy,
		items,
		uniqueFolders,
		folderEntriesMap: Object.fromEntries(folderIndex.entries()),
		emptyFoldersReport,
		summary: {
			totalSidecarItems: items.length,
			confirmedOrphanCount,
			inferredOrphanCount,
			cascadeRiskCount,
			redundantDuplicateCount,
			healthyPairedCount,
			protectedOriginCount,
			sweepCandidateCount,
			sweepReclaimableBytes,
			sweepReclaimableFormatted: formatBytes(sweepReclaimableBytes),
			probedFolderCount,
			totalUniqueFolderCount: uniqueFolders.length,
			activeEmptyFolderCount: emptyFoldersReport.activeCount,
			ignoredEmptyFolderCount: emptyFoldersReport.ignoredCount,
			byFamily,
		},
	}
}

/**
 * Filter and sort analyzed sidecar items deterministically.
 *
 * @param {Array<object>} items - Sidecar items from analyzeSidecarSweepCatalog.
 * @param {object} [options] - Filter and sort options.
 * @return {Array<object>} Filtered and sorted items.
 */
export function filterAndSortSidecarItems(items = [], options = {}) {
	const list = Array.isArray(items) ? items : []
	const statusFilter = typeof options.statusFilter === 'string' ? options.statusFilter : 'all'
	const familyFilter = typeof options.familyFilter === 'string' ? options.familyFilter : 'all'
	const sortBy = typeof options.sortBy === 'string' ? options.sortBy : 'priority-desc'
	const query = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''

	const filtered = list.filter(item => {
		if (!item) {
			return false
		}
		if (familyFilter !== 'all' && item.family !== familyFilter) {
			return false
		}
		if (statusFilter === 'sweepable') {
			if (!item.canSweepCandidate) {
				return false
			}
		} else if (statusFilter === 'orphaned') {
			if (item.status !== 'orphaned-confirmed' && item.status !== 'orphaned-inferred') {
				return false
			}
		} else if (statusFilter === 'cascade-risk') {
			if (item.status !== 'cascade-orphan-risk') {
				return false
			}
		} else if (statusFilter === 'redundant') {
			if (item.status !== 'redundant-duplicate') {
				return false
			}
		} else if (statusFilter === 'healthy-paired') {
			if (item.status !== 'healthy-paired') {
				return false
			}
		}

		if (query) {
			const haystack = [
				item.displayPath,
				item.fileName,
				item.sidecarExt,
				item.familyLabel,
				item.statusLabel,
				item.reason,
				item.hintedMasterName,
			].join(' ').toLowerCase()
			if (!haystack.includes(query)) {
				return false
			}
		}
		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortBy === 'size-desc') {
			if (b.sizeBytes !== a.sizeBytes) {
				return b.sizeBytes - a.sizeBytes
			}
			return a.displayPath.localeCompare(b.displayPath)
		}
		if (sortBy === 'path-asc') {
			return a.displayPath.localeCompare(b.displayPath)
		}
		if (sortBy === 'mtime-desc') {
			const mtimeA = Number(a.mtime) || 0
			const mtimeB = Number(b.mtime) || 0
			if (mtimeB !== mtimeA) {
				return mtimeB - mtimeA
			}
			return a.displayPath.localeCompare(b.displayPath)
		}
		if (a.priorityRank !== b.priorityRank) {
			return a.priorityRank - b.priorityRank
		}
		if (b.sizeBytes !== a.sizeBytes) {
			return b.sizeBytes - a.sizeBytes
		}
		return a.displayPath.localeCompare(b.displayPath)
	})
}

/**
 * Select safe sidecar itemKeys for batch sweep deletion, respecting origin protection
 * and paired-master protection.
 *
 * @param {object} catalog - Result of analyzeSidecarSweepCatalog.
 * @param {object} [options] - Inclusion toggles.
 * @param {boolean} [options.includeInferred=false] - Include unprobed inferred orphans.
 * @param {boolean} [options.includeCascade=true] - Include cascade-orphaned sidecars.
 * @param {boolean} [options.onlyApiDeletable=false] - Restrict to items backed by file DB ids.
 * @return {Array<string>} Selected itemKey values.
 */
export function selectSafeSweepItemKeys(catalog, options = {}) {
	if (!catalog || !Array.isArray(catalog.items)) {
		return []
	}
	const includeInferred = Boolean(options.includeInferred)
	const includeCascade = options.includeCascade !== false
	const onlyApiDeletable = Boolean(options.onlyApiDeletable)

	return catalog.items
		.filter(item => {
			if (!item || item.isProtected || item.status === 'healthy-paired') {
				return false
			}
			if (onlyApiDeletable && !item.canApiDelete) {
				return false
			}
			if (item.status === 'orphaned-confirmed' || item.status === 'redundant-duplicate') {
				return true
			}
			if (item.status === 'cascade-orphan-risk') {
				return includeCascade
			}
			if (item.status === 'orphaned-inferred') {
				return includeInferred
			}
			return false
		})
		.map(item => item.itemKey)
}

/**
 * POSIX-safe single-quote escaping for generated recovery shell scripts.
 *
 * @param {*} value - Raw scalar value.
 * @return {string} Single-quoted POSIX shell literal.
 */
function shellQuotePosix(value) {
	const str = value === null || value === undefined ? '' : String(value)
	const clean = str.replace(/[\r\n\0]/g, ' ')
	return `'${clean.replace(/'/g, '\'"\'"\'')}'`
}

/**
 * Generate a POSIX-safe dry-run/execute rollback shell script for swept sidecars
 * and recreated folder paths.
 *
 * @param {object} catalog - Catalog from analyzeSidecarSweepCatalog.
 * @param {object} [options] - Export options.
 * @return {string} Bash script content.
 */
export function generateSidecarRollbackScript(catalog, options = {}) {
	const safeCatalog = catalog && typeof catalog === 'object'
		? catalog
		: analyzeSidecarSweepCatalog([])
	const timestamp = typeof options.exportedAt === 'string' && options.exportedAt.trim()
		? options.exportedAt.trim()
		: new Date().toISOString()

	const selectedSet = Array.isArray(options.selectedItemKeys) && options.selectedItemKeys.length > 0
		? new Set(options.selectedItemKeys)
		: null

	const targetItems = (Array.isArray(safeCatalog.items) ? safeCatalog.items : []).filter(item => {
		if (!item || !item.canSweepCandidate) {
			return false
		}
		return selectedSet ? selectedSet.has(item.itemKey) : true
	})

	const emptyFolders = safeCatalog.emptyFoldersReport && Array.isArray(safeCatalog.emptyFoldersReport.active)
		? safeCatalog.emptyFoldersReport.active
		: []

	/* eslint-disable no-template-curly-in-string */
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Sidecar & Empty-Folder Sweep Recovery Manifest',
		`# Schema: ${SIDECAR_SWEEP_SCHEMA}`,
		`# Generated: ${timestamp}`,
		'# Defaults to dry-run. Pass --execute to restore sidecars from Nextcloud trashbin or recreate folders.',
		'',
		'MODE="dry-run"',
		'if [[ "${1:-}" == "--execute" ]]; then',
		'  MODE="execute"',
		'fi',
		'',
		'NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT:-/var/www/nextcloud}"',
		'NC_USER="${NC_USER:-admin}"',
		'OCC_BIN="$NEXTCLOUD_ROOT/occ"',
		'',
		'restore_sidecar_entry() {',
		'  local target_rel="$1"',
		'  local file_name="$2"',
		'  local status="$3"',
		'  local size_bytes="$4"',
		'',
		'  echo "[SIDECAR] status=$status size=${size_bytes}B target=$target_rel"',
		'  if [[ "$MODE" == "dry-run" ]]; then',
		'    echo "  DRY-RUN: would search Nextcloud trashbin for \'$file_name\' -> $target_rel"',
		'    return 0',
		'  fi',
		'  local user_data_dir="${NEXTCLOUD_DATA_DIR:-$NEXTCLOUD_ROOT/data}/$NC_USER"',
		'  local trash_dir="$user_data_dir/files_trashbin/files"',
		'  local restore_dest="$user_data_dir/files$target_rel"',
		'  local match=""',
		'  if [[ -d "$trash_dir" ]]; then',
		'    match=$(find "$trash_dir" -maxdepth 2 -name "${file_name}.d*" 2>/dev/null | head -n 1 || true)',
		'  fi',
		'  if [[ -n "$match" ]]; then',
		'    mkdir -p "$(dirname "$restore_dest")"',
		'    mv -n "$match" "$restore_dest"',
		'    if [[ -f "$OCC_BIN" ]]; then',
		'      php "$OCC_BIN" files:scan --path="/$NC_USER/files$(dirname "$target_rel")" >/dev/null || true',
		'    fi',
		'    echo "  RESTORED: $restore_dest"',
		'  else',
		'    echo "  INFO: sidecar not found in local trashbin; check Nextcloud Trashbin UI for $target_rel" >&2',
		'  fi',
		'}',
		'',
		'recreate_empty_folder() {',
		'  local folder_rel="$1"',
		'  echo "[FOLDER] target=$folder_rel"',
		'  if [[ "$MODE" == "dry-run" ]]; then',
		'    echo "  DRY-RUN: would recreate directory $folder_rel"',
		'    return 0',
		'  fi',
		'  local user_data_dir="${NEXTCLOUD_DATA_DIR:-$NEXTCLOUD_ROOT/data}/$NC_USER"',
		'  mkdir -p "$user_data_dir/files$folder_rel"',
		'  echo "  RECREATED: $user_data_dir/files$folder_rel"',
		'}',
		'',
	]
	/* eslint-enable no-template-curly-in-string */

	for (const item of targetItems) {
		lines.push(
			`restore_sidecar_entry ${shellQuotePosix(item.displayPath)} ${shellQuotePosix(item.fileName)} ${shellQuotePosix(item.status)} ${shellQuotePosix(item.sizeBytes)}`,
		)
	}
	for (const folder of emptyFolders) {
		lines.push(`recreate_empty_folder ${shellQuotePosix(folder.displayPath)}`)
	}

	if (targetItems.length === 0 && emptyFolders.length === 0) {
		lines.push('echo "[DuplicateFinder] No sidecar or empty-folder sweep targets queued."')
	} else {
		lines.push('')
		lines.push(`echo "[DuplicateFinder] Processed ${targetItems.length} sidecar entries and ${emptyFolders.length} folder entries in $MODE mode."`)
	}

	return `${lines.join('\n')}\n`
}

/**
 * Serialize the sidecar and empty-folder sweep catalog to pretty-printed JSON.
 *
 * @param {object} catalog - Catalog from analyzeSidecarSweepCatalog.
 * @param {object} [options] - Export options.
 * @return {string} JSON manifest string.
 */
export function exportSidecarSweepJson(catalog, options = {}) {
	const safeCatalog = catalog && typeof catalog === 'object'
		? catalog
		: analyzeSidecarSweepCatalog([])
	const timestamp = typeof options.exportedAt === 'string' && options.exportedAt.trim()
		? options.exportedAt.trim()
		: new Date().toISOString()

	const payload = {
		schema: SIDECAR_SWEEP_SCHEMA,
		exportedAt: timestamp,
		keepStrategy: safeCatalog.keepStrategy || 'paired_survivor',
		summary: safeCatalog.summary || {},
		sidecars: (Array.isArray(safeCatalog.items) ? safeCatalog.items : []).map(item => ({
			path: item.displayPath,
			folderPath: item.folderPath,
			fileName: item.fileName,
			extension: item.sidecarExt,
			family: item.family,
			status: item.status,
			reason: item.reason,
			sizeBytes: item.sizeBytes,
			mtimeIso: item.mtimeFormatted || '',
			protected: item.isProtected,
			folderProbed: item.isFolderProbed,
			groupId: item.groupId,
			groupHash: item.groupHash,
			survivingMasters: item.survivingMasterNames,
			queuedDeleteMasters: item.queuedDeleteMasterNames,
			canApiDelete: item.canApiDelete,
		})),
		emptyFolders: (safeCatalog.emptyFoldersReport && Array.isArray(safeCatalog.emptyFoldersReport.all)
			? safeCatalog.emptyFoldersReport.all
			: []
		).map(folder => ({
			path: folder.displayPath,
			depth: folder.depth,
			hasEmptySubfolders: folder.hasEmptySubfolders,
			ignored: folder.ignored,
			mtimeIso: folder.mtimeFormatted || '',
		})),
	}

	return JSON.stringify(payload, null, 2)
}

const SIDECAR_CSV_HEADERS = Object.freeze([
	'record_type',
	'status',
	'family',
	'extension',
	'path',
	'folder_path',
	'size_bytes',
	'mtime_iso',
	'protected',
	'folder_probed',
	'group_id',
	'reason',
])

/**
 * Export sidecar sweep findings and empty folders as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} catalog - Catalog from analyzeSidecarSweepCatalog.
 * @return {string} CSV document content.
 */
export function exportSidecarSweepCsv(catalog) {
	const safeCatalog = catalog && typeof catalog === 'object'
		? catalog
		: analyzeSidecarSweepCatalog([])
	const lines = [SIDECAR_CSV_HEADERS.map(escapeCsvCell).join(',')]

	for (const item of Array.isArray(safeCatalog.items) ? safeCatalog.items : []) {
		lines.push([
			'sidecar',
			item.status,
			item.family,
			item.sidecarExt,
			item.displayPath,
			item.folderPath,
			item.sizeBytes,
			item.mtimeFormatted || '',
			item.isProtected ? 'true' : 'false',
			item.isFolderProbed ? 'true' : 'false',
			item.groupId ?? '',
			item.reason,
		].map(escapeCsvCell).join(','))
	}

	const emptyList = safeCatalog.emptyFoldersReport && Array.isArray(safeCatalog.emptyFoldersReport.all)
		? safeCatalog.emptyFoldersReport.all
		: []
	for (const folder of emptyList) {
		lines.push([
			'empty-folder',
			folder.ignored ? 'ignored' : 'empty-active',
			'directory',
			'',
			folder.displayPath,
			folder.displayPath,
			0,
			folder.mtimeFormatted || '',
			'false',
			'true',
			'',
			folder.hasEmptySubfolders ? `Depth ${folder.depth} (contains empty subfolders)` : `Depth ${folder.depth}`,
		].map(escapeCsvCell).join(','))
	}

	return lines.join('\r\n')
}
