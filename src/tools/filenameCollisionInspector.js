/**
 * Pure filename normalization, Unicode NFC/NFD/NFKC inspection, invisible/BiDi
 * character detection, case-fold collision clustering, and cross-OS portability
 * analyzer for Nextcloud DuplicateFinder.
 * Zero DOM dependencies, zero network side effects, and CWE-1236-safe CSV export.
 */

import { formatBytes } from './duplicateStats'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'

export const COLLISION_CATEGORIES = Object.freeze([
	'all',
	'same-folder-collision',
	'unicode-form',
	'invisible-chars',
	'case-clash',
	'cross-os-hazard',
	'copy-suffix',
])

export const COLLISION_MODES = Object.freeze([
	'strict',
	'aggressive',
])

export const COLLISION_SORT_MODES = Object.freeze([
	'severity_desc',
	'size_desc',
	'divergence_desc',
	'folder_risk_desc',
	'name_asc',
])

export const COLLISION_REPORT_SCHEMA = 'duplicatefinder.filename-collisions.v1'
export const COLLISION_STORAGE_KEY = 'duplicatefinder.filenameCollision.prefs.v1'

const WINDOWS_RESERVED_NAMES = new Set([
	'CON', 'PRN', 'AUX', 'NUL',
	'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
	'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

const WINDOWS_ILLEGAL_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])

const INVISIBLE_CODEPOINTS = Object.freeze({
	0x00A0: { name: 'NO-BREAK SPACE', severity: 'warning', category: 'space' },
	0x00AD: { name: 'SOFT HYPHEN', severity: 'critical', category: 'invisible' },
	0x034F: { name: 'COMBINING GRAPHEME JOINER', severity: 'critical', category: 'invisible' },
	0x061C: { name: 'ARABIC LETTER MARK', severity: 'critical', category: 'bidi' },
	0x180E: { name: 'MONGOLIAN VOWEL SEPARATOR', severity: 'critical', category: 'invisible' },
	0x2000: { name: 'EN QUAD', severity: 'warning', category: 'space' },
	0x2001: { name: 'EM QUAD', severity: 'warning', category: 'space' },
	0x2002: { name: 'EN SPACE', severity: 'warning', category: 'space' },
	0x2003: { name: 'EM SPACE', severity: 'warning', category: 'space' },
	0x2004: { name: 'THREE-PER-EM SPACE', severity: 'warning', category: 'space' },
	0x2005: { name: 'FOUR-PER-EM SPACE', severity: 'warning', category: 'space' },
	0x2006: { name: 'SIX-PER-EM SPACE', severity: 'warning', category: 'space' },
	0x2007: { name: 'FIGURE SPACE', severity: 'warning', category: 'space' },
	0x2008: { name: 'PUNCTUATION SPACE', severity: 'warning', category: 'space' },
	0x2009: { name: 'THIN SPACE', severity: 'warning', category: 'space' },
	0x200A: { name: 'HAIR SPACE', severity: 'warning', category: 'space' },
	0x200B: { name: 'ZERO WIDTH SPACE', severity: 'critical', category: 'invisible' },
	0x200C: { name: 'ZERO WIDTH NON-JOINER', severity: 'critical', category: 'invisible' },
	0x200D: { name: 'ZERO WIDTH JOINER', severity: 'critical', category: 'invisible' },
	0x200E: { name: 'LEFT-TO-RIGHT MARK', severity: 'critical', category: 'bidi' },
	0x200F: { name: 'RIGHT-TO-LEFT MARK', severity: 'critical', category: 'bidi' },
	0x202A: { name: 'LEFT-TO-RIGHT EMBEDDING', severity: 'critical', category: 'bidi' },
	0x202B: { name: 'RIGHT-TO-LEFT EMBEDDING', severity: 'critical', category: 'bidi' },
	0x202C: { name: 'POP DIRECTIONAL FORMATTING', severity: 'critical', category: 'bidi' },
	0x202D: { name: 'LEFT-TO-RIGHT OVERRIDE', severity: 'critical', category: 'bidi' },
	0x202E: { name: 'RIGHT-TO-LEFT OVERRIDE', severity: 'critical', category: 'bidi' },
	0x202F: { name: 'NARROW NO-BREAK SPACE', severity: 'warning', category: 'space' },
	0x205F: { name: 'MEDIUM MATHEMATICAL SPACE', severity: 'warning', category: 'space' },
	0x2060: { name: 'WORD JOINER', severity: 'critical', category: 'invisible' },
	0x2066: { name: 'LEFT-TO-RIGHT ISOLATE', severity: 'critical', category: 'bidi' },
	0x2067: { name: 'RIGHT-TO-LEFT ISOLATE', severity: 'critical', category: 'bidi' },
	0x2068: { name: 'FIRST STRONG ISOLATE', severity: 'critical', category: 'bidi' },
	0x2069: { name: 'POP DIRECTIONAL ISOLATE', severity: 'critical', category: 'bidi' },
	0x3000: { name: 'IDEOGRAPHIC SPACE', severity: 'warning', category: 'space' },
	0xFEFF: { name: 'ZERO WIDTH NO-BREAK SPACE (BOM)', severity: 'critical', category: 'invisible' },
})

const COPY_SUFFIX_PATTERNS = Object.freeze([
	{ regex: /^(.+?)(\s+\(conflicted copy[^)]*\))$/i, label: 'Nextcloud/Sync conflicted copy' },
	{ regex: /^(.+?)(\s+\[conflict[^\]]*\])$/i, label: 'Conflict tag' },
	{ regex: /^(.+?)(\s+-\s+(?:Copie|Copy)(?:\s+\(\d+\))?)$/i, label: 'Explorer/Finder Copy suffix' },
	{ regex: /^(.+?)(_(?:copy|copie)(?:\d+)?)$/i, label: 'Underscore copy suffix' },
	{ regex: /^(.+?)(\s+(?:copy|copie)(?:\s+\d+)?)$/i, label: 'Trailing copy suffix' },
	{ regex: /^(.+?)(\s*\(\d+\))$/, label: 'Numbered duplicate suffix (N)' },
])

const CATEGORY_META = Object.freeze({
	'same-folder-collision': { label: 'Same-folder collision', order: 0 },
	'invisible-chars': { label: 'Invisible / BiDi chars', order: 1 },
	'unicode-form': { label: 'Unicode NFC/NFD/NFKC', order: 2 },
	'case-clash': { label: 'Case-fold clash', order: 3 },
	'cross-os-hazard': { label: 'Cross-OS / Windows hazard', order: 4 },
	'copy-suffix': { label: 'Copy-suffix clutter', order: 5 },
})

const SEVERITY_ORDER = Object.freeze({
	critical: 0,
	warning: 1,
	caution: 2,
	info: 3,
})

/**
 * Format a numeric Unicode codepoint as U+XXXX (minimum 4 hex digits).
 *
 * @param {number} codePoint - Unicode scalar value.
 * @return {string} Formatted U+XXXX string.
 */
export function formatCodePointHex(codePoint) {
	return `U+${Number(codePoint).toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * Extract the filename segment from a file path without trimming semantic whitespace.
 *
 * @param {string|null|undefined} filePath - File path or filename.
 * @return {string} Filename segment or empty string.
 */
export function extractRawFilename(filePath) {
	if (typeof filePath !== 'string' || filePath.length === 0) {
		return ''
	}
	const normalized = filePath.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

/**
 * Extract normalized parent folder path from a file path.
 *
 * @param {string|null|undefined} filePath - File path.
 * @return {string} Folder path or '/'.
 */
export function extractParentFolder(filePath) {
	if (typeof filePath !== 'string' || filePath.length === 0) {
		return '/'
	}
	const normalized = normalizePathForDiff(filePath) || filePath.replace(/\\/g, '/')
	const idx = normalized.lastIndexOf('/')
	if (idx <= 0) {
		return '/'
	}
	return normalized.slice(0, idx)
}

/**
 * Split a filename into stem and extension (including leading dot in ext).
 * Dotfiles without secondary extension (e.g. '.gitignore') keep full name as stem.
 *
 * @param {string} filename - Basename to split.
 * @return {{ stem: string, ext: string }} Stem and extension.
 */
export function splitStemAndExt(filename) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return { stem: '', ext: '' }
	}
	const dotIdx = filename.lastIndexOf('.')
	if (dotIdx <= 0 || dotIdx === filename.length - 1) {
		return { stem: filename, ext: '' }
	}
	return {
		stem: filename.slice(0, dotIdx),
		ext: filename.slice(dotIdx),
	}
}

/**
 * Compute approximate UTF-8 byte length of a string.
 *
 * @param {string} text - Input string.
 * @return {number} UTF-8 byte count.
 */
export function getUtf8ByteLength(text) {
	if (typeof text !== 'string' || text.length === 0) {
		return 0
	}
	let bytes = 0
	for (const ch of text) {
		const cp = ch.codePointAt(0)
		if (cp <= 0x7F) {
			bytes += 1
		} else if (cp <= 0x7FF) {
			bytes += 2
		} else if (cp <= 0xFFFF) {
			bytes += 3
		} else {
			bytes += 4
		}
	}
	return bytes
}

/**
 * Check whether a Unicode scalar value is a combining mark (diacritic/variation selector).
 *
 * @param {number} cp - Unicode codepoint.
 * @return {boolean} True when codepoint is a combining mark.
 */
function isCombiningMarkCodePoint(cp) {
	return (
		(cp >= 0x0300 && cp <= 0x036F)
		|| (cp >= 0x1AB0 && cp <= 0x1AFF)
		|| (cp >= 0x1DC0 && cp <= 0x1DFF)
		|| (cp >= 0x20D0 && cp <= 0x20FF)
		|| (cp >= 0xFE00 && cp <= 0xFE0F)
		|| (cp >= 0xFE20 && cp <= 0xFE2F)
	)
}

/**
 * Check whether a Unicode scalar value is a C0/C1 control character.
 *
 * @param {number} cp - Unicode codepoint.
 * @return {boolean} True when control character.
 */
function isControlCodePoint(cp) {
	return (cp >= 0x00 && cp <= 0x1F) || (cp >= 0x7F && cp <= 0x9F)
}

/**
 * Detect Unicode normalization form of a filename.
 *
 * @param {string} filename - Raw filename.
 * @return {'ascii'|'nfc'|'nfd'|'nfkc-diff'|'mixed'} Detected normalization classification.
 */
export function detectUnicodeForm(filename) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return 'ascii'
	}
	let hasNonAscii = false
	for (const ch of filename) {
		if (ch.codePointAt(0) > 0x7F) {
			hasNonAscii = true
			break
		}
	}
	if (!hasNonAscii) {
		return 'ascii'
	}
	const nfc = filename.normalize('NFC')
	const nfd = filename.normalize('NFD')
	const nfkc = filename.normalize('NFKC')

	if (filename !== nfc && filename === nfd) {
		return 'nfd'
	}
	if (filename !== nfc) {
		return 'mixed'
	}
	if (filename !== nfkc) {
		return 'nfkc-diff'
	}
	return 'nfc'
}

/**
 * Inspect invisible, zero-width, BiDi control, non-standard space, and control characters.
 *
 * @param {string} filename - Raw filename.
 * @return {Array<{ codePoint: number, codePointHex: string, name: string, category: string, severity: string, index: number }>} Findings list.
 */
export function inspectInvisibleAndBidiChars(filename) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return []
	}
	const findings = []
	let offset = 0
	for (const ch of filename) {
		const cp = ch.codePointAt(0)
		const special = INVISIBLE_CODEPOINTS[cp]
		if (special) {
			findings.push({
				codePoint: cp,
				codePointHex: formatCodePointHex(cp),
				name: special.name,
				category: special.category,
				severity: special.severity,
				index: offset,
			})
		} else if (isControlCodePoint(cp)) {
			findings.push({
				codePoint: cp,
				codePointHex: formatCodePointHex(cp),
				name: 'CONTROL CHARACTER',
				category: 'control',
				severity: 'critical',
				index: offset,
			})
		}
		offset += ch.length
	}
	return findings
}

/**
 * Extract notable non-ASCII, combining mark, and NFKC-divergent codepoints for inspection.
 *
 * @param {string} filename - Raw filename.
 * @param {number} [limit=20] - Maximum tokens to return.
 * @return {{ nonAsciiCount: number, combiningCount: number, tokens: Array<object> }} Codepoint details.
 */
export function inspectUnicodeCodepoints(filename, limit = 20) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return { nonAsciiCount: 0, combiningCount: 0, tokens: [] }
	}
	let nonAsciiCount = 0
	let combiningCount = 0
	const tokens = []
	let index = 0

	for (const ch of filename) {
		const cp = ch.codePointAt(0)
		const invisible = INVISIBLE_CODEPOINTS[cp]
		const control = isControlCodePoint(cp)
		const combining = isCombiningMarkCodePoint(cp)
		const nfkcChanged = ch !== ch.normalize('NFKC')

		if (cp > 0x7F) {
			nonAsciiCount += 1
		}
		if (combining) {
			combiningCount += 1
		}

		if ((cp > 0x7F || control || invisible) && tokens.length < limit) {
			let kind = 'non-ascii'
			if (invisible) {
				kind = invisible.category
			} else if (control) {
				kind = 'control'
			} else if (combining) {
				kind = 'combining'
			} else if (nfkcChanged) {
				kind = 'nfkc-compat'
			}

			tokens.push({
				index,
				codePointHex: formatCodePointHex(cp),
				displayChar: (invisible || control) ? `[${formatCodePointHex(cp)}]` : ch,
				kind,
				label: invisible ? invisible.name : (combining ? 'COMBINING MARK' : (nfkcChanged ? 'NFKC COMPATIBILITY' : 'UNICODE CHAR')),
			})
		}
		index += ch.length
	}

	return {
		nonAsciiCount,
		combiningCount,
		tokens,
	}
}

/**
 * Inspect Windows, SMB, macOS, and Nextcloud Sync cross-OS portability hazards.
 *
 * @param {string} filename - Raw filename.
 * @param {string} [fullPath=''] - Full file path.
 * @return {{ hasHazard: boolean, maxSeverity: string|null, hazards: Array<{ id: string, label: string, severity: string }> }} Hazard report.
 */
export function inspectCrossOsHazards(filename, fullPath = '') {
	if (typeof filename !== 'string' || filename.length === 0) {
		return { hasHazard: false, maxSeverity: null, hazards: [] }
	}
	const hazards = []

	let hasIllegalChar = false
	let hasControlChar = false
	for (const ch of filename) {
		const cp = ch.codePointAt(0)
		if (WINDOWS_ILLEGAL_CHARS.has(ch)) {
			hasIllegalChar = true
		}
		if (isControlCodePoint(cp)) {
			hasControlChar = true
		}
	}

	if (hasIllegalChar) {
		hazards.push({
			id: 'windows-illegal-chars',
			label: 'Contains Windows-illegal characters (< > : " / \\ | ? *)',
			severity: 'critical',
		})
	}
	if (hasControlChar) {
		hazards.push({
			id: 'control-chars',
			label: 'Contains non-printable control characters',
			severity: 'critical',
		})
	}

	const { stem } = splitStemAndExt(filename)
	const firstDot = filename.indexOf('.')
	const deviceStem = (firstDot >= 0 ? filename.slice(0, firstDot) : stem).trim().toUpperCase()
	if (deviceStem && WINDOWS_RESERVED_NAMES.has(deviceStem)) {
		hazards.push({
			id: 'windows-reserved-name',
			label: `Uses Windows reserved device name (${deviceStem})`,
			severity: 'critical',
		})
	}

	if (/^\s/.test(filename) || /\s$/.test(filename)) {
		hazards.push({
			id: 'edge-whitespace',
			label: 'Leading or trailing whitespace breaks Windows/WebDAV sync',
			severity: 'warning',
		})
	}
	if (/\.$/.test(filename) && filename !== '.' && filename !== '..') {
		hazards.push({
			id: 'trailing-dot',
			label: 'Trailing dot in filename is stripped by Windows NTFS',
			severity: 'warning',
		})
	}

	const byteLen = getUtf8ByteLength(filename)
	if (byteLen > 240) {
		hazards.push({
			id: 'long-filename',
			label: `Filename exceeds safe 240 UTF-8 bytes (${byteLen} B)`,
			severity: 'warning',
		})
	}
	if (typeof fullPath === 'string' && fullPath.length > 260) {
		hazards.push({
			id: 'long-path',
			label: `Full path exceeds Windows 260-char MAX_PATH (${fullPath.length} chars)`,
			severity: 'caution',
		})
	}

	let maxSeverity = null
	for (const hazard of hazards) {
		if (!maxSeverity || SEVERITY_ORDER[hazard.severity] < SEVERITY_ORDER[maxSeverity]) {
			maxSeverity = hazard.severity
		}
	}

	return {
		hasHazard: hazards.length > 0,
		maxSeverity,
		hazards,
	}
}

/**
 * Detect Explorer, Finder, or Nextcloud conflicted/copy suffixes on filename stem.
 *
 * @param {string} filename - Raw filename.
 * @return {{ hasCopySuffix: boolean, suffix: string, suffixLabel: string, baseStem: string, cleanedFilename: string }} Copy suffix info.
 */
export function detectCopySuffix(filename) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return {
			hasCopySuffix: false,
			suffix: '',
			suffixLabel: '',
			baseStem: '',
			cleanedFilename: '',
		}
	}
	const { stem, ext } = splitStemAndExt(filename)
	let workingStem = stem
	let firstLabel = ''
	let matchedSuffix = ''

	// Peel up to 2 chained copy suffixes (e.g., "report - Copy (1).pdf")
	for (let pass = 0; pass < 2; pass += 1) {
		let matchedThisPass = false
		for (const pattern of COPY_SUFFIX_PATTERNS) {
			const match = workingStem.match(pattern.regex)
			if (match && match[1].trim().length > 0) {
				workingStem = match[1]
				matchedSuffix = match[2] + matchedSuffix
				if (!firstLabel) {
					firstLabel = pattern.label
				}
				matchedThisPass = true
				break
			}
		}
		if (!matchedThisPass) {
			break
		}
	}

	if (!matchedSuffix) {
		return {
			hasCopySuffix: false,
			suffix: '',
			suffixLabel: '',
			baseStem: stem,
			cleanedFilename: filename,
		}
	}

	return {
		hasCopySuffix: true,
		suffix: matchedSuffix,
		suffixLabel: firstLabel,
		baseStem: workingStem,
		cleanedFilename: `${workingStem}${ext}`,
	}
}

/**
 * Strip invisible, BiDi, and control characters from a string, replacing exotic
 * Unicode spaces with regular ASCII spaces.
 *
 * @param {string} text - Input string.
 * @return {string} Cleaned string.
 */
export function stripInvisibleAndControlChars(text) {
	if (typeof text !== 'string' || text.length === 0) {
		return ''
	}
	let out = ''
	for (const ch of text) {
		const cp = ch.codePointAt(0)
		const special = INVISIBLE_CODEPOINTS[cp]
		if (special) {
			if (special.category === 'space') {
				out += ' '
			}
			continue
		}
		if (isControlCodePoint(cp)) {
			continue
		}
		out += ch
	}
	return out
}

/**
 * Compute deterministic canonical key for collision grouping.
 *
 * @param {string} filename - Raw filename.
 * @param {'strict'|'aggressive'} [mode='strict'] - Normalization mode.
 * @return {string} Canonical comparison key.
 */
export function computeCanonicalKey(filename, mode = 'strict') {
	if (typeof filename !== 'string' || filename.length === 0) {
		return ''
	}
	const resolvedMode = COLLISION_MODES.includes(mode) ? mode : 'strict'
	const cleaned = stripInvisibleAndControlChars(filename)

	if (resolvedMode === 'strict') {
		return cleaned.normalize('NFKC').trim().toLowerCase()
	}

	const withoutCopySuffix = detectCopySuffix(cleaned).cleanedFilename
	const { stem, ext } = splitStemAndExt(withoutCopySuffix)

	const foldSegment = segment => {
		const decomposed = segment.normalize('NFKC').normalize('NFD')
		let strippedMarks = ''
		for (const ch of decomposed) {
			if (!isCombiningMarkCodePoint(ch.codePointAt(0))) {
				strippedMarks += ch
			}
		}
		return strippedMarks
			.replace(/[\s_-]+/g, ' ')
			.trim()
			.toLowerCase()
	}

	const foldedStem = foldSegment(stem)
	const foldedExt = foldSegment(ext)
	return `${foldedStem}${foldedExt}`
}

/**
 * Suggest a clean cross-OS-safe NFC canonical filename.
 *
 * @param {string} filename - Raw filename.
 * @param {object} [options] - Normalization options.
 * @param {boolean} [options.stripCopySuffix=false] - Whether to peel copy suffixes too.
 * @return {{ suggestedName: string, changed: boolean, reasons: string[] }} Rename suggestion.
 */
export function suggestCanonicalFilename(filename, options = {}) {
	if (typeof filename !== 'string' || filename.length === 0) {
		return { suggestedName: '', changed: false, reasons: [] }
	}
	const reasons = []
	let working = filename

	const invisible = inspectInvisibleAndBidiChars(working)
	if (invisible.length > 0) {
		working = stripInvisibleAndControlChars(working)
		reasons.push('Removed invisible/BiDi/exotic space characters')
	}

	const unicodeForm = detectUnicodeForm(working)
	if (unicodeForm === 'nfd' || unicodeForm === 'mixed') {
		working = working.normalize('NFC')
		reasons.push('Converted Unicode to canonical NFC')
	} else if (unicodeForm === 'nfkc-diff') {
		working = working.normalize('NFKC')
		reasons.push('Normalized compatibility glyphs (NFKC)')
	}

	if (options.stripCopySuffix) {
		const copyInfo = detectCopySuffix(working)
		if (copyInfo.hasCopySuffix) {
			working = copyInfo.cleanedFilename
			reasons.push(`Removed ${copyInfo.suffixLabel}`)
		}
	}

	let sanitized = ''
	let replacedIllegal = false
	for (const ch of working) {
		if (WINDOWS_ILLEGAL_CHARS.has(ch)) {
			sanitized += '_'
			replacedIllegal = true
		} else {
			sanitized += ch
		}
	}
	if (replacedIllegal) {
		reasons.push('Replaced Windows-illegal characters with "_"')
	}

	const { stem, ext } = splitStemAndExt(sanitized)
	const trimmedStem = stem.replace(/^\s+/, '').replace(/[\s.]+$/, '')
	const trimmedExt = ext.replace(/[\s.]+$/, '')
	if (trimmedStem !== stem || trimmedExt !== ext) {
		sanitized = `${trimmedStem || 'file'}${trimmedExt}`
		reasons.push('Trimmed leading/trailing whitespace or trailing dot')
	}

	const firstDot = sanitized.indexOf('.')
	const checkReserved = (firstDot >= 0 ? sanitized.slice(0, firstDot) : sanitized).toUpperCase()
	if (WINDOWS_RESERVED_NAMES.has(checkReserved)) {
		sanitized = `_${sanitized}`
		reasons.push(`Prefixed Windows reserved name (${checkReserved})`)
	}

	return {
		suggestedName: sanitized,
		changed: sanitized !== filename,
		reasons,
	}
}

/**
 * Score how clean a file is as a canonical keeper inside a duplicate group.
 * Higher score = cleaner canonical keeper.
 *
 * @param {object} analyzed - Pre-analyzed file metadata.
 * @return {number} Canonical cleanliness score.
 */
function scoreCanonicalKeeper(analyzed) {
	let score = 0
	if (analyzed.isInOriginFolder) {
		score += 10000
	}
	if (analyzed.isLocked) {
		score += 5000
	}
	if (!analyzed.invisibleChars.length) {
		score += 800
	}
	if (!analyzed.crossOs.hasHazard) {
		score += 600
	}
	if (analyzed.unicodeForm === 'ascii') {
		score += 400
	} else if (analyzed.unicodeForm === 'nfc') {
		score += 320
	} else if (analyzed.unicodeForm === 'nfkc-diff') {
		score += 140
	}
	if (!analyzed.copySuffix.hasCopySuffix) {
		score += 350
	}
	if (!analyzed.hasSameFolderCollision) {
		score += 150
	}
	// Slight preference for shorter, shallower paths
	score -= Math.min(120, Math.floor((analyzed.path || '').length / 4))
	return score
}

/**
 * Compute an overall collision severity label and numeric priority score.
 *
 * @param {object} info - Partial analyzed item flags.
 * @return {{ severity: string, severityScore: number }} Severity and score.
 */
function computeFindingSeverity(info) {
	let score = 0
	if (info.hasSameFolderCollision) {
		score += 50
	}
	if (info.invisibleChars.some(c => c.severity === 'critical')) {
		score += 45
	} else if (info.invisibleChars.length > 0) {
		score += 24
	}
	if (info.crossOs.maxSeverity === 'critical') {
		score += 40
	} else if (info.crossOs.maxSeverity === 'warning') {
		score += 22
	} else if (info.crossOs.maxSeverity === 'caution') {
		score += 12
	}
	if (info.unicodeForm === 'nfd' || info.unicodeForm === 'mixed') {
		score += 26
	} else if (info.unicodeForm === 'nfkc-diff') {
		score += 20
	}
	if (info.hasGroupUnicodeCollision) {
		score += 18
	}
	if (info.hasGroupCaseClash) {
		score += 20
	}
	if (info.copySuffix.hasCopySuffix) {
		score += 14
	}
	if (info.hasAggressiveCollision && !info.hasSameFolderCollision && !info.hasGroupCaseClash) {
		score += 10
	}

	let severity = 'info'
	if (score >= 45) {
		severity = 'critical'
	} else if (score >= 22) {
		severity = 'warning'
	} else if (score >= 10) {
		severity = 'caution'
	}

	return {
		severity,
		severityScore: Math.min(100, score),
	}
}

/**
 * Determine whether a catalog item matches category and search filters.
 *
 * @param {object} item - Collision item.
 * @param {string} category - Selected category filter.
 * @param {string} searchLower - Lowercase search query.
 * @return {boolean} True when item should remain visible.
 */
export function matchesCollisionFilter(item, category = 'all', searchLower = '') {
	if (!item) {
		return false
	}
	if (category && category !== 'all') {
		if (!Array.isArray(item.categories) || !item.categories.includes(category)) {
			return false
		}
	}
	if (searchLower) {
		const haystack = [
			item.name,
			item.path,
			item.folder,
			item.canonicalKey,
			item.suggestedName,
			item.unicodeForm,
			item.verdictReason,
			...(item.invisibleChars || []).map(c => `${c.codePointHex} ${c.name}`),
			...(item.codepointInfo?.tokens || []).map(t => t.codePointHex),
		]
			.filter(Boolean)
			.join(' ')
			.toLowerCase()
		if (!haystack.includes(searchLower)) {
			return false
		}
	}
	return true
}

/**
 * Compare two collision items according to the active sort mode.
 *
 * @param {object} a - First item.
 * @param {object} b - Second item.
 * @param {string} sortBy - Active sort key.
 * @return {number} Comparator result.
 */
export function compareCollisionItems(a, b, sortBy = 'severity_desc') {
	if (sortBy === 'size_desc') {
		if (b.size !== a.size) {
			return b.size - a.size
		}
	} else if (sortBy === 'divergence_desc') {
		const divA = (a.invisibleChars?.length || 0) * 10 + (a.codepointInfo?.combiningCount || 0) * 4 + (a.unicodeForm !== 'ascii' && a.unicodeForm !== 'nfc' ? 5 : 0)
		const divB = (b.invisibleChars?.length || 0) * 10 + (b.codepointInfo?.combiningCount || 0) * 4 + (b.unicodeForm !== 'ascii' && b.unicodeForm !== 'nfc' ? 5 : 0)
		if (divB !== divA) {
			return divB - divA
		}
	} else if (sortBy === 'folder_risk_desc') {
		if (b.sameFolderPeerCount !== a.sameFolderPeerCount) {
			return b.sameFolderPeerCount - a.sameFolderPeerCount
		}
		if (b.severityScore !== a.severityScore) {
			return b.severityScore - a.severityScore
		}
	} else if (sortBy === 'name_asc') {
		return (a.name || '').localeCompare(b.name || '')
	}

	if (b.severityScore !== a.severityScore) {
		return b.severityScore - a.severityScore
	}
	if (b.size !== a.size) {
		return b.size - a.size
	}
	return (a.path || '').localeCompare(b.path || '')
}

/**
 * Build a complete Filename Normalization & Locale/Unicode Collision catalog from duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate group objects.
 * @param {object} [options] - Inspection and filter options.
 * @param {'strict'|'aggressive'} [options.mode='strict'] - Normalization matching mode.
 * @param {string} [options.category='all'] - Active category filter.
 * @param {string} [options.folderFilter=''] - Optional folder path filter.
 * @param {string} [options.searchQuery=''] - Optional search query.
 * @param {string} [options.sortBy='severity_desc'] - Sort key.
 * @return {object} Complete catalog with items, allItems, categoryBreakdown, folderLeaderboard, summary.
 */
export function buildFilenameCollisionCatalog(duplicates, options = {}) {
	const mode = COLLISION_MODES.includes(options.mode) ? options.mode : 'strict'
	const category = COLLISION_CATEGORIES.includes(options.category) ? options.category : 'all'
	const folderFilter = typeof options.folderFilter === 'string' ? options.folderFilter : ''
	const searchLower = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const sortBy = COLLISION_SORT_MODES.includes(options.sortBy) ? options.sortBy : 'severity_desc'

	const groups = Array.isArray(duplicates) ? duplicates.filter(Boolean) : []
	const seenKeys = new Set()
	const rawRecords = []

	for (const group of groups) {
		const files = Array.isArray(group.files) ? group.files.filter(Boolean) : []
		for (let idx = 0; idx < files.length; idx += 1) {
			const file = files[idx]
			const filePath = typeof file.path === 'string' ? file.path : (typeof file.name === 'string' ? file.name : '')
			const name = extractRawFilename(filePath || file.name || '') || (typeof file.name === 'string' ? file.name : '')
			if (!name) {
				continue
			}

			const key = getFileSelectionKey(file) || `${group.id ?? 'g'}:${file.nodeId ?? file.id ?? idx}:${filePath}`
			if (seenKeys.has(key)) {
				continue
			}
			seenKeys.add(key)

			const folder = extractParentFolder(filePath)
			const size = Number.isFinite(Number(file.size)) ? Math.max(0, Number(file.size)) : 0
			const unicodeForm = detectUnicodeForm(name)
			const invisibleChars = inspectInvisibleAndBidiChars(name)
			const codepointInfo = inspectUnicodeCodepoints(name)
			const crossOs = inspectCrossOsHazards(name, filePath)
			const copySuffix = detectCopySuffix(name)
			const strictKey = computeCanonicalKey(name, 'strict')
			const canonicalKey = computeCanonicalKey(name, mode)
			const renameSuggestion = suggestCanonicalFilename(name, { stripCopySuffix: mode === 'aggressive' })

			rawRecords.push({
				key,
				groupId: group.id ?? null,
				groupHash: group.hash || '',
				groupFileCount: files.length,
				fileId: file.id ?? null,
				nodeId: file.nodeId ?? file.id ?? null,
				path: filePath || name,
				name,
				folder,
				size,
				sizeFormatted: formatBytes(size),
				mtime: file.mtime ?? null,
				mtimeFormatted: formatFileModifiedTime(file),
				isInOriginFolder: Boolean(file.isInOriginFolder),
				isLocked: Boolean(file.locked || file.isLocked),
				unicodeForm,
				invisibleChars,
				codepointInfo,
				crossOs,
				copySuffix,
				strictKey,
				canonicalKey,
				suggestedName: renameSuggestion.suggestedName,
				renameReasons: renameSuggestion.reasons,
				rawFile: file,
			})
		}
	}

	// Build collision maps across folder + group + global canonical keys
	const folderBuckets = new Map()
	const groupBuckets = new Map()
	const globalBuckets = new Map()

	for (const rec of rawRecords) {
		const folderBucketKey = `${rec.folder.toLowerCase()}::${rec.canonicalKey}`
		if (!folderBuckets.has(folderBucketKey)) {
			folderBuckets.set(folderBucketKey, [])
		}
		folderBuckets.get(folderBucketKey).push(rec)

		const groupBucketKey = `${rec.groupId ?? rec.groupHash}::${rec.canonicalKey}`
		if (!groupBuckets.has(groupBucketKey)) {
			groupBuckets.set(groupBucketKey, [])
		}
		groupBuckets.get(groupBucketKey).push(rec)

		if (!globalBuckets.has(rec.canonicalKey)) {
			globalBuckets.set(rec.canonicalKey, [])
		}
		globalBuckets.get(rec.canonicalKey).push(rec)
	}

	// Elect canonical keeper per duplicate group
	const groupKeeperMap = new Map()
	const recordsByGroup = new Map()
	for (const rec of rawRecords) {
		const gKey = String(rec.groupId ?? rec.groupHash ?? rec.key)
		if (!recordsByGroup.has(gKey)) {
			recordsByGroup.set(gKey, [])
		}
		recordsByGroup.get(gKey).push(rec)
	}

	for (const [gKey, list] of recordsByGroup.entries()) {
		let best = null
		let bestScore = -Infinity
		for (const rec of list) {
			const folderPeers = folderBuckets.get(`${rec.folder.toLowerCase()}::${rec.canonicalKey}`) || []
			const s = scoreCanonicalKeeper({
				...rec,
				hasSameFolderCollision: folderPeers.length > 1,
			})
			if (s > bestScore) {
				bestScore = s
				best = rec
			}
		}
		if (best) {
			groupKeeperMap.set(gKey, best)
		}
	}

	const allItems = []
	const folderStats = new Map()
	const categoryCounts = new Map(
		Object.keys(CATEGORY_META).map(cat => [cat, { id: cat, label: CATEGORY_META[cat].label, order: CATEGORY_META[cat].order, count: 0, bytes: 0 }])
	)

	let sameFolderCollisionCount = 0
	let unicodeDivergenceCount = 0
	let invisibleCharCount = 0
	let caseClashCount = 0
	let crossOsHazardCount = 0
	let copySuffixCount = 0
	let pruneCandidateCount = 0
	let pruneCandidateBytes = 0
	const activeClusterKeys = new Set()

	for (const rec of rawRecords) {
		const folderBucketKey = `${rec.folder.toLowerCase()}::${rec.canonicalKey}`
		const folderPeers = folderBuckets.get(folderBucketKey) || []
		const distinctFolderNames = new Set(folderPeers.map(p => p.name))
		const hasSameFolderCollision = folderPeers.length > 1 && distinctFolderNames.size > 1

		const groupBucketKey = `${rec.groupId ?? rec.groupHash}::${rec.canonicalKey}`
		const groupPeers = groupBuckets.get(groupBucketKey) || []
		const groupNames = new Set(groupPeers.map(p => p.name))

		// Check case-fold clash: two distinct names that become equal when NFC-lowercased
		const caseFoldVariants = new Set(
			[...folderPeers, ...groupPeers].map(p => stripInvisibleAndControlChars(p.name).normalize('NFC'))
		)
		const hasCaseClash = caseFoldVariants.size > 1 && new Set([...caseFoldVariants].map(v => v.toLowerCase())).size < caseFoldVariants.size

		// Check Unicode form divergence inside group or folder (e.g. NFC vs NFD or NFKC)
		const groupUnicodeForms = new Set([...folderPeers, ...groupPeers].map(p => p.unicodeForm))
		const hasUnicodeDivergence = (
			rec.unicodeForm === 'nfd'
			|| rec.unicodeForm === 'mixed'
			|| rec.unicodeForm === 'nfkc-diff'
			|| (groupNames.size > 1 && groupUnicodeForms.size > 1)
		)

		const hasInvisibleChars = rec.invisibleChars.length > 0
		const hasCrossOsHazard = rec.crossOs.hasHazard
		const hasCopySuffix = rec.copySuffix.hasCopySuffix
		const hasAggressiveCollision = mode === 'aggressive' && (folderPeers.length > 1 || groupPeers.length > 1) && groupNames.size > 1

		const categories = []
		if (hasSameFolderCollision) {
			categories.push('same-folder-collision')
		}
		if (hasUnicodeDivergence) {
			categories.push('unicode-form')
		}
		if (hasInvisibleChars) {
			categories.push('invisible-chars')
		}
		if (hasCaseClash) {
			categories.push('case-clash')
		}
		if (hasCrossOsHazard) {
			categories.push('cross-os-hazard')
		}
		if (hasCopySuffix) {
			categories.push('copy-suffix')
		}

		// Only surface flagged items in the collision catalog
		if (categories.length === 0) {
			continue
		}

		const gKey = String(rec.groupId ?? rec.groupHash ?? rec.key)
		const keeper = groupKeeperMap.get(gKey)
		const isKeeper = keeper && keeper.key === rec.key
		const isProtected = rec.isInOriginFolder || rec.isLocked
		const deletable = !isProtected && rec.groupFileCount > 1 && !isKeeper && Boolean(rec.nodeId)

		const { severity, severityScore } = computeFindingSeverity({
			hasSameFolderCollision,
			invisibleChars: rec.invisibleChars,
			crossOs: rec.crossOs,
			unicodeForm: rec.unicodeForm,
			hasGroupUnicodeCollision: hasUnicodeDivergence && groupNames.size > 1,
			hasGroupCaseClash: hasCaseClash,
			copySuffix: rec.copySuffix,
			hasAggressiveCollision,
		})

		let verdict = 'rename-recommended'
		let verdictReason = 'Normalize filename to cross-OS-safe NFC form.'
		let pruneRecommended = false

		if (isProtected) {
			verdict = 'protected-keep'
			verdictReason = rec.isInOriginFolder
				? 'Protected origin folder copy; rename in place if needed.'
				: 'Locked file; inspect and normalize safely.'
		} else if (isKeeper) {
			verdict = rec.suggestedName !== rec.name ? 'rename-recommended' : 'keep-canonical'
			verdictReason = rec.suggestedName !== rec.name
				? 'Canonical keeper in group, but filename has portability/Unicode issues to normalize.'
				: 'Cleanest canonical copy in duplicate group.'
		} else if (deletable && (hasUnicodeDivergence || hasInvisibleChars || hasCaseClash || hasCrossOsHazard || hasCopySuffix || hasSameFolderCollision)) {
			pruneRecommended = true
			verdict = 'prune-non-canonical'
			verdictReason = `Redundant non-canonical duplicate; canonical keeper "${keeper ? keeper.name : ''}" remains safe.`
		}

		// Collect colliding peer summaries (same folder OR same duplicate group)
		const peerMap = new Map()
		for (const peer of [...folderPeers, ...groupPeers]) {
			if (peer.key !== rec.key && !peerMap.has(peer.key)) {
				peerMap.set(peer.key, {
					key: peer.key,
					groupId: peer.groupId,
					name: peer.name,
					path: peer.path,
					folder: peer.folder,
					sizeFormatted: peer.sizeFormatted,
					unicodeForm: peer.unicodeForm,
					sameFolder: peer.folder === rec.folder,
					isCanonicalKeeper: Boolean(keeper && keeper.key === peer.key),
					isProtected: Boolean(peer.isInOriginFolder || peer.isLocked),
				})
			}
		}
		const peers = Array.from(peerMap.values())

		const item = {
			...rec,
			categories,
			hasSameFolderCollision,
			sameFolderPeerCount: folderPeers.filter(p => p.key !== rec.key).length,
			hasUnicodeDivergence,
			hasCaseClash,
			severity,
			severityScore,
			verdict,
			verdictReason,
			pruneRecommended,
			deletable,
			isCanonicalKeeper: Boolean(isKeeper),
			canonicalKeeperName: keeper ? keeper.name : rec.name,
			peers,
		}

		allItems.push(item)
		activeClusterKeys.add(rec.canonicalKey)

		if (hasSameFolderCollision) {
			sameFolderCollisionCount += 1
		}
		if (hasUnicodeDivergence) {
			unicodeDivergenceCount += 1
		}
		if (hasInvisibleChars) {
			invisibleCharCount += 1
		}
		if (hasCaseClash) {
			caseClashCount += 1
		}
		if (hasCrossOsHazard) {
			crossOsHazardCount += 1
		}
		if (hasCopySuffix) {
			copySuffixCount += 1
		}
		if (pruneRecommended) {
			pruneCandidateCount += 1
			pruneCandidateBytes += item.size
		}

		for (const cat of categories) {
			const bucket = categoryCounts.get(cat)
			if (bucket) {
				bucket.count += 1
				bucket.bytes += item.size
			}
		}

		if (!folderStats.has(item.folder)) {
			folderStats.set(item.folder, {
				folder: item.folder,
				issueCount: 0,
				sameFolderRisks: 0,
				pruneBytes: 0,
				totalBytes: 0,
			})
		}
		const fStat = folderStats.get(item.folder)
		fStat.issueCount += 1
		fStat.totalBytes += item.size
		if (hasSameFolderCollision) {
			fStat.sameFolderRisks += 1
		}
		if (pruneRecommended) {
			fStat.pruneBytes += item.size
		}
	}

	const categoryBreakdown = Array.from(categoryCounts.values())
		.sort((a, b) => a.order - b.order)
		.map(entry => ({
			...entry,
			bytesFormatted: formatBytes(entry.bytes),
			sharePct: allItems.length > 0 ? Math.round((entry.count / allItems.length) * 100) : 0,
		}))

	const folderLeaderboard = Array.from(folderStats.values())
		.sort((a, b) => {
			if (b.sameFolderRisks !== a.sameFolderRisks) {
				return b.sameFolderRisks - a.sameFolderRisks
			}
			if (b.issueCount !== a.issueCount) {
				return b.issueCount - a.issueCount
			}
			if (b.pruneBytes !== a.pruneBytes) {
				return b.pruneBytes - a.pruneBytes
			}
			return a.folder.localeCompare(b.folder)
		})
		.slice(0, 8)
		.map(entry => ({
			...entry,
			pruneBytesFormatted: formatBytes(entry.pruneBytes),
			totalBytesFormatted: formatBytes(entry.totalBytes),
		}))

	const filteredItems = allItems
		.filter(item => {
			if (folderFilter && item.folder !== folderFilter) {
				return false
			}
			return matchesCollisionFilter(item, category, searchLower)
		})
		.sort((a, b) => compareCollisionItems(a, b, sortBy))

	return {
		items: filteredItems,
		allItems,
		categoryBreakdown,
		folderLeaderboard,
		summary: {
			mode,
			totalFiles: rawRecords.length,
			flaggedFiles: allItems.length,
			filteredFiles: filteredItems.length,
			clusterCount: activeClusterKeys.size,
			sameFolderCollisionCount,
			unicodeDivergenceCount,
			invisibleCharCount,
			caseClashCount,
			crossOsHazardCount,
			copySuffixCount,
			pruneCandidateCount,
			pruneCandidateBytes,
			pruneCandidateBytesFormatted: formatBytes(pruneCandidateBytes),
		},
	}
}

/**
 * Select safe prune-recommended non-canonical keys from a collision catalog.
 *
 * @param {object} catalog - Catalog from buildFilenameCollisionCatalog.
 * @param {object} [options] - Selection options.
 * @param {boolean} [options.visibleOnly=false] - Only select from currently visible items.
 * @return {string[]} Array of stable selection keys.
 */
export function selectSafeNonCanonicalKeys(catalog, options = {}) {
	if (!catalog || typeof catalog !== 'object') {
		return []
	}
	const pool = options.visibleOnly
		? (Array.isArray(catalog.items) ? catalog.items : [])
		: (Array.isArray(catalog.allItems) ? catalog.allItems : [])

	return pool
		.filter(item => item && item.pruneRecommended && item.deletable)
		.map(item => item.key)
}

/**
 * Load persisted normalization mode preferences safely from localStorage.
 *
 * @return {{ mode: 'strict'|'aggressive' }} Stored mode preference.
 */
export function loadFilenameCollisionPreferences() {
	const defaults = { mode: 'strict' }
	if (typeof localStorage === 'undefined') {
		return defaults
	}
	try {
		const raw = localStorage.getItem(COLLISION_STORAGE_KEY)
		if (!raw) {
			return defaults
		}
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object') {
			return defaults
		}
		return {
			mode: COLLISION_MODES.includes(parsed.mode) ? parsed.mode : 'strict',
		}
	} catch (error) {
		return defaults
	}
}

/**
 * Persist normalization mode preferences safely to localStorage.
 *
 * @param {{ mode: string }} prefs - Preferences to save.
 */
export function saveFilenameCollisionPreferences(prefs) {
	if (typeof localStorage === 'undefined' || !prefs || typeof prefs !== 'object') {
		return
	}
	try {
		const payload = {
			mode: COLLISION_MODES.includes(prefs.mode) ? prefs.mode : 'strict',
		}
		localStorage.setItem(COLLISION_STORAGE_KEY, JSON.stringify(payload))
	} catch (error) {
		// Ignore quota or disabled storage errors
	}
}

/**
 * Export collision findings as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} catalog - Catalog from buildFilenameCollisionCatalog.
 * @return {string} Safe CSV text.
 */
export function exportFilenameCollisionCsv(catalog) {
	const headers = [
		'group_id',
		'group_hash',
		'file_name',
		'suggested_canonical_name',
		'canonical_key',
		'unicode_form',
		'invisible_codepoints',
		'categories',
		'same_folder_collision',
		'severity',
		'severity_score',
		'verdict',
		'prune_recommended',
		'protected',
		'size_bytes',
		'size_formatted',
		'file_path',
		'verdict_reason',
	]
	const items = Array.isArray(catalog && catalog.items) ? catalog.items : []
	const lines = [headers.map(escapeCsvCell).join(',')]

	for (const item of items) {
		const row = [
			item.groupId ?? '',
			item.groupHash || '',
			item.name || '',
			item.suggestedName || '',
			item.canonicalKey || '',
			item.unicodeForm || '',
			(item.invisibleChars || []).map(c => `${c.codePointHex} (${c.name})`).join('; '),
			(item.categories || []).join('; '),
			item.hasSameFolderCollision ? 'yes' : 'no',
			item.severity || '',
			item.severityScore ?? 0,
			item.verdict || '',
			item.pruneRecommended ? 'yes' : 'no',
			(item.isInOriginFolder || item.isLocked) ? 'yes' : 'no',
			item.size ?? 0,
			item.sizeFormatted || '',
			item.path || '',
			item.verdictReason || '',
		]
		lines.push(row.map(escapeCsvCell).join(','))
	}
	return lines.join('\r\n')
}

/**
 * Export collision catalog summary, breakdown, and findings as deterministic JSON.
 *
 * @param {object} catalog - Catalog from buildFilenameCollisionCatalog.
 * @return {string} Pretty-printed JSON manifest.
 */
export function exportFilenameCollisionManifestJson(catalog) {
	const items = Array.isArray(catalog && catalog.items) ? catalog.items : []
	const payload = {
		schema: COLLISION_REPORT_SCHEMA,
		exportedAt: new Date().toISOString(),
		summary: catalog?.summary || {},
		categoryBreakdown: catalog?.categoryBreakdown || [],
		folderLeaderboard: catalog?.folderLeaderboard || [],
		items: items.map(item => ({
			key: item.key,
			groupId: item.groupId,
			groupHash: item.groupHash,
			name: item.name,
			suggestedName: item.suggestedName,
			canonicalKey: item.canonicalKey,
			unicodeForm: item.unicodeForm,
			invisibleChars: item.invisibleChars || [],
			crossOsHazards: item.crossOs?.hazards || [],
			categories: item.categories || [],
			hasSameFolderCollision: Boolean(item.hasSameFolderCollision),
			severity: item.severity,
			severityScore: item.severityScore,
			verdict: item.verdict,
			pruneRecommended: Boolean(item.pruneRecommended),
			protected: Boolean(item.isInOriginFolder || item.isLocked),
			size: item.size,
			sizeFormatted: item.sizeFormatted,
			path: item.path,
			verdictReason: item.verdictReason,
		})),
	}
	return JSON.stringify(payload, null, 2)
}
