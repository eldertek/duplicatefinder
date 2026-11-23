/**
 * Pure near-duplicate document fuzzy diff, version lineage clustering,
 * PDF/Office/PlainText metadata & content inspection, survivor scoring,
 * and CWE-1236-safe audit export helpers.
 * Zero DOM dependencies, zero XSS sinks, bounded memory/CPU parsing.
 */

import { formatBytes } from './duplicateStats'
import { extractFileExtension } from './duplicateFilters'
import {
	escapeCsvCell,
	getFileSelectionKey,
	selectDuplicatesByKeepRule,
} from './duplicateSelectionAndExport'

export const DOC_LINEAGE_SCHEMA = 'duplicatefinder.document-lineage.v1'
export const MAX_DOC_PROBE_BYTES = 512 * 1024
export const MAX_TEXT_EXTRACT_CHARS = 120000
export const MAX_DIFF_LINES = 260
export const MAX_SHINGLE_COUNT = 800
export const MAX_OFFICE_ENTRIES = 256

export const DEFAULT_DOC_SIMILARITY_PCT = 75
export const MIN_DOC_SIMILARITY_PCT = 50
export const MAX_DOC_SIMILARITY_PCT = 100

export const DOC_KINDS = Object.freeze(['all', 'pdf', 'office', 'text', 'data'])
export const DOC_CLUSTERING_MODES = Object.freeze(['lineages', 'groups'])
export const DOC_KEEP_RULES = Object.freeze([
	'latest_complete',
	'highest_content',
	'newest',
	'oldest',
	'editable_source',
	'shortest_path',
])

export const PDF_EXTENSIONS = Object.freeze(['pdf'])
export const OFFICE_EXTENSIONS = Object.freeze([
	'docx', 'odt', 'xlsx', 'ods', 'pptx', 'odp', 'rtf', 'doc', 'xls', 'ppt',
])
export const TEXT_EXTENSIONS = Object.freeze([
	'txt', 'md', 'markdown', 'rst', 'org', 'tex', 'latex', 'log', 'adoc',
])
export const DATA_EXTENSIONS = Object.freeze([
	'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'toml', 'ini', 'html', 'htm',
])

export const DOC_EXTENSIONS = Object.freeze([
	...PDF_EXTENSIONS,
	...OFFICE_EXTENSIONS,
	...TEXT_EXTENSIONS,
	...DATA_EXTENSIONS,
])

const PDF_EXT_SET = new Set(PDF_EXTENSIONS)
const OFFICE_EXT_SET = new Set(OFFICE_EXTENSIONS)
const TEXT_EXT_SET = new Set(TEXT_EXTENSIONS)
const DATA_EXT_SET = new Set(DATA_EXTENSIONS)

const EDITABLE_EXTENSION_RANK = Object.freeze({
	docx: 5,
	odt: 5,
	xlsx: 5,
	ods: 5,
	pptx: 5,
	odp: 5,
	md: 5,
	markdown: 5,
	tex: 5,
	latex: 5,
	rst: 4,
	adoc: 4,
	rtf: 4,
	txt: 4,
	csv: 4,
	json: 4,
	yaml: 4,
	yml: 4,
	xml: 4,
	html: 3,
	htm: 3,
	doc: 3,
	xls: 3,
	ppt: 3,
	pdf: 2,
	log: 1,
})

const STOP_VERSION_WORDS = new Set([
	'final', 'finale', 'definitif', 'definitive', 'approved', 'valide', 'validee',
	'signed', 'signe', 'signee', 'draft', 'brouillon', 'wip', 'copy', 'copie',
	'backup', 'bak', 'old', 'archive', 'annotated', 'annote', 'clean', 'rev',
	'revision', 'release', 'rc', 'merged', 'edited', 'modifie',
])

/**
 * Strip ASCII control characters and collapse whitespace for safe plain-text rendering.
 *
 * @param {*} raw - Candidate text.
 * @param {number} [maxLen=200] - Maximum output length.
 * @return {string} Cleaned plain text.
 */
export function sanitizeDocText(raw, maxLen = 200) {
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
	return `${trimmed.slice(0, Math.max(0, maxLen - 3))}...`
}

/**
 * Clamp similarity percentage input into [50, 100].
 *
 * @param {*} value - Candidate similarity percentage.
 * @return {number} Clamped integer percentage.
 */
export function clampDocSimilarityPct(value) {
	const numeric = Number(value)
	if (!Number.isFinite(numeric)) {
		return DEFAULT_DOC_SIMILARITY_PCT
	}
	return Math.max(MIN_DOC_SIMILARITY_PCT, Math.min(MAX_DOC_SIMILARITY_PCT, Math.round(numeric)))
}

/**
 * Check whether a file entry is marked protected or locked.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {boolean} True when file must never be auto-selected for deletion.
 */
export function isProtectedDocumentFile(file) {
	if (!file || typeof file !== 'object') {
		return false
	}
	return Boolean(file.is_origin || file.isOrigin || file.protected || file.locked)
}

/**
 * Extract numeric modification timestamp in ms or fallback to 0.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {number} Epoch milliseconds.
 */
function extractMtimeMs(file) {
	if (!file || typeof file !== 'object') {
		return 0
	}
	const raw = file.mtime ?? file.modified ?? file.lastModified ?? file.date ?? null
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return raw > 0 && raw < 1e12 ? raw * 1000 : raw
	}
	if (typeof raw === 'string' && raw.trim()) {
		if (/^\d+(\.\d+)?$/.test(raw.trim())) {
			const n = Number(raw.trim())
			return n > 0 && n < 1e12 ? n * 1000 : n
		}
		const parsed = Date.parse(raw)
		if (Number.isFinite(parsed)) {
			return parsed
		}
	}
	return 0
}

/**
 * Extract filename from a duplicate file entry.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {string} Safe sanitized filename.
 */
function resolveFileName(file) {
	if (!file || typeof file !== 'object') {
		return ''
	}
	if (typeof file.name === 'string' && file.name.trim()) {
		return sanitizeDocText(file.name, 220)
	}
	if (typeof file.path === 'string' && file.path.trim()) {
		const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
		return sanitizeDocText(parts[parts.length - 1] || '', 220)
	}
	return ''
}

/**
 * Extract normalized parent folder path.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {string} Normalized folder path.
 */
function resolveParentFolder(file) {
	if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
		return '/'
	}
	const normalized = file.path.replace(/\\/g, '/').trim()
	const idx = normalized.lastIndexOf('/')
	if (idx <= 0) {
		return '/'
	}
	return normalized.slice(0, idx)
}

/**
 * Classify a file entry into a document category ('pdf' | 'office' | 'text' | 'data') or null.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {'pdf'|'office'|'text'|'data'|null} Document kind or null.
 */
export function classifyDocumentKind(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	const ext = extractFileExtension(resolveFileName(file) || file.path || '')
	const mime = typeof file.mimetype === 'string' ? file.mimetype.toLowerCase().trim() : ''

	if (PDF_EXT_SET.has(ext) || mime === 'application/pdf') {
		return 'pdf'
	}
	if (
		OFFICE_EXT_SET.has(ext)
		|| mime.includes('wordprocessingml')
		|| mime.includes('spreadsheetml')
		|| mime.includes('presentationml')
		|| mime.includes('opendocument')
		|| mime === 'application/msword'
		|| mime === 'application/vnd.ms-excel'
		|| mime === 'application/vnd.ms-powerpoint'
		|| mime === 'application/rtf'
		|| mime === 'text/rtf'
	) {
		return 'office'
	}
	if (
		DATA_EXT_SET.has(ext)
		|| mime === 'application/json'
		|| mime === 'text/csv'
		|| mime === 'text/tab-separated-values'
		|| mime === 'application/xml'
		|| mime === 'text/xml'
		|| mime === 'text/html'
		|| mime === 'application/yaml'
		|| mime === 'text/yaml'
	) {
		return 'data'
	}
	if (
		TEXT_EXT_SET.has(ext)
		|| mime === 'text/plain'
		|| mime === 'text/markdown'
		|| mime === 'text/x-tex'
	) {
		return 'text'
	}
	if (!ext && mime.startsWith('text/')) {
		return 'text'
	}
	return null
}

/**
 * Determine if a file is an inspectable document.
 *
 * @param {object|null|undefined} file - File entry.
 * @return {boolean} True when file belongs to any document category.
 */
export function isDocumentFile(file) {
	return classifyDocumentKind(file) !== null
}

/**
 * Parse version tags, stage ranks, copy markers, and canonical lineage stem from a filename.
 *
 * @param {string} fileNameOrPath - Filename or full path.
 * @return {object} Parsed version lineage metadata.
 */
export function parseDocumentVersionMeta(fileNameOrPath) {
	const rawInput = typeof fileNameOrPath === 'string' ? fileNameOrPath : ''
	const segments = rawInput.replace(/\\/g, '/').split('/').filter(Boolean)
	const rawName = sanitizeDocText(segments[segments.length - 1] || rawInput, 220)
	const ext = extractFileExtension(rawName)
	const dotIdx = ext ? rawName.toLowerCase().lastIndexOf(`.${ext}`) : -1
	const stem = dotIdx > 0 ? rawName.slice(0, dotIdx) : rawName

	let working = stem
	let isCopyArtifact = false
	let isDraft = false
	let isSignedOrFinal = false
	let stageRank = 2
	let stageLabel = 'Standard'
	let versionTuple = null
	let versionLabel = ''
	let dateHint = ''

	if (/^copy\s+of\s+/i.test(working) || /^copie\s+de\s+/i.test(working)) {
		working = working.replace(/^(?:copy\s+of|copie\s+de)\s+/i, '')
		isCopyArtifact = true
	}

	const copyParenMatch = working.match(/(?:^|[\s_-])\((\d{1,3})\)$/)
	if (copyParenMatch) {
		isCopyArtifact = true
		working = working.slice(0, copyParenMatch.index).trim()
	}

	const dateMatch = working.match(/(?:^|[\s_-])(20\d{2}[-_.]?(?:0[1-9]|1[0-2])[-_.]?(?:0[1-9]|[12]\d|3[01]))(?:$|[\s_-])/)
	if (dateMatch) {
		dateHint = dateMatch[1]
		working = `${working.slice(0, dateMatch.index)} ${working.slice(dateMatch.index + dateMatch[0].length)}`.trim()
	}

	const versionMatch = working.match(/(?:^|[\s_.-])(?:v|ver|version|rev|r)[\s_.-]*(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,3}))?(?=$|[\s_.-])/i)
	if (versionMatch) {
		const major = Number(versionMatch[1]) || 0
		const minor = Number(versionMatch[2]) || 0
		const patch = Number(versionMatch[3]) || 0
		versionTuple = [major, minor, patch]
		versionLabel = versionMatch[3] !== undefined
			? `v${major}.${minor}.${patch}`
			: (versionMatch[2] !== undefined ? `v${major}.${minor}` : `v${major}`)
		working = `${working.slice(0, versionMatch.index)} ${working.slice(versionMatch.index + versionMatch[0].length)}`.trim()
	}

	const stemTokens = new Set(
		stem
			.toLowerCase()
			.split(/[^a-z0-9\u00c0-\u024f]+/)
			.filter(Boolean),
	)
	const hasAnyStemToken = candidates => candidates.some(token => stemTokens.has(token))

	if (hasAnyStemToken(['signed', 'signe', 'signee'])) {
		isSignedOrFinal = true
		stageRank = 5
		stageLabel = 'Signed'
	} else if (hasAnyStemToken(['final', 'finale', 'definitif', 'definitive', 'approved', 'valide', 'validee'])) {
		isSignedOrFinal = true
		stageRank = 4
		stageLabel = 'Final'
	} else if (hasAnyStemToken(['rc', 'release', 'clean'])) {
		stageRank = 3
		stageLabel = 'Release'
	} else if (hasAnyStemToken(['draft', 'brouillon', 'wip'])) {
		isDraft = true
		stageRank = 1
		stageLabel = 'Draft'
	} else if (hasAnyStemToken(['backup', 'bak', 'old', 'archive'])) {
		isDraft = true
		stageRank = 0
		stageLabel = 'Archive'
	}

	if (hasAnyStemToken(['copy', 'copie'])) {
		isCopyArtifact = true
		if (stageRank >= 2) {
			stageRank = Math.max(1, stageRank - 1)
		}
	}

	const tokens = working
		.toLowerCase()
		.replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(token => token && !STOP_VERSION_WORDS.has(token))

	let canonicalStem = tokens.join(' ').trim()
	if (!canonicalStem) {
		canonicalStem = stem.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() || rawName.toLowerCase()
	}

	return {
		rawName,
		extension: ext,
		stem,
		canonicalStem,
		versionTuple,
		versionLabel: versionLabel || (stageLabel !== 'Standard' ? stageLabel : ''),
		stageRank,
		stageLabel,
		isDraft,
		isSignedOrFinal,
		isCopyArtifact,
		dateHint,
	}
}

/**
 * Compare two parsed version tuples descending (> 0 means A is newer).
 *
 * @param {number[]|null} a - Version tuple A.
 * @param {number[]|null} b - Version tuple B.
 * @return {number} Comparison sign.
 */
export function compareVersionTuples(a, b) {
	if (!a && !b) {
		return 0
	}
	if (a && !b) {
		return 1
	}
	if (!a && b) {
		return -1
	}
	for (let i = 0; i < 3; i += 1) {
		const va = a[i] || 0
		const vb = b[i] || 0
		if (va !== vb) {
			return va - vb
		}
	}
	return 0
}

/**
 * Convert raw bytes to bounded ASCII/Latin-1 string for header inspection.
 *
 * @param {Uint8Array} bytes - Input bytes.
 * @param {number} [maxBytes=MAX_DOC_PROBE_BYTES] - Max bytes to decode.
 * @return {string} Decoded Latin-1 string.
 */
function bytesToBoundedLatin1(bytes, maxBytes = MAX_DOC_PROBE_BYTES) {
	const len = Math.min(bytes.length, maxBytes)
	const chunks = []
	const step = 16384
	for (let offset = 0; offset < len; offset += step) {
		const end = Math.min(len, offset + step)
		chunks.push(String.fromCharCode(...bytes.subarray(offset, end)))
	}
	return chunks.join('')
}

/**
 * Decode UTF-8 bytes cleanly with fallback to Latin-1.
 *
 * @param {Uint8Array} bytes - Input bytes.
 * @return {string} Decoded text.
 */
function decodeUtf8Bounded(bytes) {
	const slice = bytes.subarray(0, Math.min(bytes.length, MAX_DOC_PROBE_BYTES))
	if (typeof TextDecoder === 'function') {
		try {
			return new TextDecoder('utf-8', { fatal: false }).decode(slice)
		} catch (e) {
			// Fallback to Latin-1
		}
	}
	return bytesToBoundedLatin1(slice, MAX_DOC_PROBE_BYTES)
}

/**
 * Read little-endian unsigned 16-bit integer safely.
 *
 * @param {Uint8Array} bytes - Source byte buffer.
 * @param {number} offset - Start byte offset.
 * @return {number} Unsigned 16-bit integer.
 */
function readU16LE(bytes, offset) {
	if (offset < 0 || offset + 2 > bytes.length) {
		return 0
	}
	return bytes[offset] | (bytes[offset + 1] << 8)
}

/**
 * Read little-endian unsigned 32-bit integer safely.
 *
 * @param {Uint8Array} bytes - Source byte buffer.
 * @param {number} offset - Start byte offset.
 * @return {number} Unsigned 32-bit integer.
 */
function readU32LE(bytes, offset) {
	if (offset < 0 || offset + 4 > bytes.length) {
		return 0
	}
	return (
		bytes[offset]
		| (bytes[offset + 1] << 8)
		| (bytes[offset + 2] << 16)
		| (bytes[offset + 3] << 24)
	) >>> 0
}

/**
 * Extract bounded word 3-shingles from plain text for Jaccard fuzzy similarity.
 *
 * @param {string} text - Normalized document text.
 * @return {string[]} Sorted unique shingle list capped at MAX_SHINGLE_COUNT.
 */
export function buildTextShingles(text) {
	if (typeof text !== 'string' || !text.trim()) {
		return []
	}
	const words = text
		.toLowerCase()
		.replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)

	if (words.length === 0) {
		return []
	}
	const shingleSet = new Set()
	if (words.length < 3) {
		for (const word of words) {
			shingleSet.add(word)
		}
	} else {
		for (let i = 0; i <= words.length - 3; i += 1) {
			shingleSet.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
			if (shingleSet.size >= MAX_SHINGLE_COUNT) {
				break
			}
		}
	}
	return Array.from(shingleSet).sort()
}

/**
 * Compute Jaccard similarity percentage [0..100] between two shingle lists or Sets.
 *
 * @param {Array<string>|Set<string>} shinglesA - Shingles A.
 * @param {Array<string>|Set<string>} shinglesB - Shingles B.
 * @return {number|null} Similarity percentage or null if either side lacks shingles.
 */
export function computeShingleJaccardSimilarity(shinglesA, shinglesB) {
	const listA = Array.isArray(shinglesA) ? shinglesA : Array.from(shinglesA || [])
	const listB = Array.isArray(shinglesB) ? shinglesB : Array.from(shinglesB || [])
	if (listA.length === 0 || listB.length === 0) {
		return null
	}
	const setA = new Set(listA)
	const setB = new Set(listB)
	let intersection = 0
	for (const token of setA) {
		if (setB.has(token)) {
			intersection += 1
		}
	}
	const union = setA.size + setB.size - intersection
	if (union <= 0) {
		return 100
	}
	return Math.round((intersection / union) * 100)
}

/**
 * Compute token-frequency cosine similarity percentage [0..100] between two strings.
 *
 * @param {string} textA - Text A.
 * @param {string} textB - Text B.
 * @return {number|null} Cosine similarity percentage or null if either string is empty.
 */
export function computeTokenCosineSimilarity(textA, textB) {
	if (typeof textA !== 'string' || typeof textB !== 'string') {
		return null
	}
	const tokenize = value => value
		.toLowerCase()
		.replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)

	const wordsA = tokenize(textA)
	const wordsB = tokenize(textB)
	if (wordsA.length === 0 || wordsB.length === 0) {
		return null
	}

	const freqA = new Map()
	const freqB = new Map()
	for (const w of wordsA) {
		freqA.set(w, (freqA.get(w) || 0) + 1)
	}
	for (const w of wordsB) {
		freqB.set(w, (freqB.get(w) || 0) + 1)
	}

	let dot = 0
	let normA = 0
	let normB = 0
	for (const [word, countA] of freqA.entries()) {
		normA += countA * countA
		const countB = freqB.get(word)
		if (countB) {
			dot += countA * countB
		}
	}
	for (const countB of freqB.values()) {
		normB += countB * countB
	}
	if (normA === 0 || normB === 0) {
		return 0
	}
	return Math.round((dot / (Math.sqrt(normA) * Math.sqrt(normB))) * 100)
}

/**
 * Extract readable PDF literal string field like `/Title (Contract v2)`.
 *
 * @param {string} text - Bounded Latin-1 PDF stream text.
 * @param {string} key - Dictionary key without slash.
 * @return {string} Cleaned text value.
 */
function extractPdfStringField(text, key) {
	const pattern = new RegExp(`/${key}\\s*\\(([^()]{1,180})\\)`)
	const match = text.match(pattern)
	if (!match) {
		return ''
	}
	const cleaned = match[1]
		.replace(/\\([()\\])/g, '$1')
		.replace(/\\n|\\r|\\t/g, ' ')
	return sanitizeDocText(cleaned, 160)
}

/**
 * Safely parse PDF header, page estimate, Info dictionary, text layer, and signature markers.
 *
 * @param {Uint8Array|ArrayBuffer} input - Raw PDF bytes.
 * @param {object|null} [file=null] - Optional file context.
 * @return {object} Normalized PDF probe summary.
 */
export function parsePdfMetadata(input, file = null) {
	const bytes = input instanceof Uint8Array
		? input
		: (input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(0))

	if (bytes.length < 8) {
		return {
			kind: 'pdf',
			formatLabel: 'PDF',
			probed: false,
			corrupt: true,
			qualityNotes: ['Buffer too small for PDF header'],
		}
	}

	const rawText = bytesToBoundedLatin1(bytes, MAX_DOC_PROBE_BYTES)
	const headerMatch = rawText.match(/^%PDF-(\d+\.\d+)/)
	if (!headerMatch) {
		return {
			kind: 'pdf',
			formatLabel: 'PDF',
			probed: false,
			corrupt: true,
			qualityNotes: ['Missing %PDF signature'],
		}
	}

	const pdfVersion = headerMatch[1]
	const title = extractPdfStringField(rawText, 'Title')
	const author = extractPdfStringField(rawText, 'Author')
	const creator = extractPdfStringField(rawText, 'Creator')
	const producer = extractPdfStringField(rawText, 'Producer')
	const modDate = extractPdfStringField(rawText, 'ModDate') || extractPdfStringField(rawText, 'CreationDate')

	let pageCount = null
	const countMatches = rawText.match(/\/Type\s*\/Pages[\s\S]{0,160}?\/Count\s+(\d{1,5})/g)
	if (countMatches && countMatches.length > 0) {
		let maxCount = 0
		for (const block of countMatches) {
			const c = block.match(/\/Count\s+(\d{1,5})/)
			if (c) {
				maxCount = Math.max(maxCount, Number(c[1]) || 0)
			}
		}
		if (maxCount > 0) {
			pageCount = maxCount
		}
	}
	if (pageCount === null) {
		const singlePages = rawText.match(/\/Type\s*\/Page(?!s)\b/g)
		if (singlePages && singlePages.length > 0) {
			pageCount = singlePages.length
		}
	}

	const hasTextLayer = /\/Font\b|\/ToUnicode\b|\bBT\s+[\s\S]{0,80}\bTj\b/.test(rawText)
	const isSigned = /\/Type\s*\/Sig\b|\/ByteRange\s*\[|\/SubFilter\s*\/adbe/.test(rawText)
	const hasForms = /\/AcroForm\b/.test(rawText)
	const isEncrypted = /\/Encrypt\b/.test(rawText)

	// Extract readable parenthesized text tokens from streams for lightweight fuzzy fingerprinting
	const textSamples = []
	const textRegex = /\(([^()\\]{4,80})\)\s*Tj/g
	let match
	while ((match = textRegex.exec(rawText)) !== null && textSamples.length < 180) {
		const clean = sanitizeDocText(match[1], 80)
		if (clean && /[a-zA-Z0-9\u00c0-\u024f]{2,}/.test(clean)) {
			textSamples.push(clean)
		}
	}

	const previewText = textSamples.join(' ').slice(0, 1200)
	const lines = textSamples.slice(0, MAX_DIFF_LINES)
	const shingles = buildTextShingles(previewText || `${title} ${author} ${resolveFileName(file)}`)
	const qualityNotes = []
	if (isSigned) {
		qualityNotes.push('Digitally signed')
	}
	if (!hasTextLayer && !isEncrypted) {
		qualityNotes.push('Likely scanned image PDF (no text layer detected in probed slice)')
	}
	if (isEncrypted) {
		qualityNotes.push('Encrypted PDF')
	}
	if (hasForms) {
		qualityNotes.push('Interactive AcroForm fields')
	}

	return {
		kind: 'pdf',
		formatLabel: `PDF ${pdfVersion}`,
		pdfVersion,
		probed: true,
		corrupt: false,
		title,
		author: author || creator,
		producer,
		modifiedHint: modDate,
		pageCount,
		wordCount: previewText ? previewText.split(/\s+/).filter(Boolean).length : null,
		lineCount: lines.length || null,
		hasTextLayer,
		isSigned,
		isEncrypted,
		hasForms,
		embeddedMediaCount: 0,
		previewText,
		lines,
		shingles,
		qualityNotes,
	}
}

/**
 * Extract plain tag inner content safely without DOMParser or XSS sinks.
 *
 * @param {string} xmlText - Bounded XML string.
 * @param {string} tagName - Exact XML tag name.
 * @return {string} Cleaned text content.
 */
function extractXmlTagText(xmlText, tagName) {
	const idx = xmlText.indexOf(`<${tagName}`)
	if (idx === -1) {
		return ''
	}
	const openEnd = xmlText.indexOf('>', idx)
	if (openEnd === -1) {
		return ''
	}
	const closeIdx = xmlText.indexOf(`</${tagName}>`, openEnd + 1)
	if (closeIdx === -1) {
		return ''
	}
	return sanitizeDocText(xmlText.slice(openEnd + 1, closeIdx), 180)
}

/**
 * Inspect ZIP-based Office containers (DOCX, ODT, XLSX, ODS, PPTX, ODP) safely via bounded
 * Local File Header & Central Directory scans. Never allocates full uncompressed streams.
 *
 * @param {Uint8Array|ArrayBuffer} input - Raw Office document bytes.
 * @param {object|null} [file=null] - Optional file context.
 * @return {object} Normalized Office probe summary.
 */
export function parseZipOfficeMetadata(input, file = null) {
	const bytes = input instanceof Uint8Array
		? input
		: (input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(0))

	const ext = extractFileExtension(resolveFileName(file) || '')
	const formatLabel = ext ? ext.toUpperCase() : 'OFFICE'

	if (bytes.length < 22) {
		return {
			kind: 'office',
			formatLabel,
			probed: false,
			corrupt: true,
			qualityNotes: ['Buffer too small for Office container'],
		}
	}

	const entries = []
	let uncompressedXmlBytes = 0
	let embeddedMediaCount = 0
	let hasComments = false
	let hasTrackedChanges = false
	let hasDigitalSig = false
	let title = ''
	let author = ''
	let revision = null
	let modifiedHint = ''
	let detectedApp = formatLabel

	const recordEntry = (name, compMethod, compSize, uncompSize, payloadBytes) => {
		if (!name || entries.length >= MAX_OFFICE_ENTRIES) {
			return
		}
		const cleanName = sanitizeDocText(name, 160)
		entries.push(cleanName)
		const lower = cleanName.toLowerCase()
		if (lower.endsWith('.xml') || lower.endsWith('.rels')) {
			uncompressedXmlBytes += Math.max(0, Number(uncompSize) || 0)
		}
		if (lower.includes('/media/') || lower.startsWith('pictures/') || lower.includes('/embeddings/')) {
			embeddedMediaCount += 1
		}
		if (lower.includes('comments.xml')) {
			hasComments = true
		}
		if (lower.includes('_xmlsignatures/') || lower.includes('signature')) {
			hasDigitalSig = true
		}
		if (lower === 'word/document.xml') {
			detectedApp = 'DOCX'
		} else if (lower === 'xl/workbook.xml') {
			detectedApp = 'XLSX'
		} else if (lower === 'ppt/presentation.xml') {
			detectedApp = 'PPTX'
		} else if (lower === 'content.xml') {
			detectedApp = ext ? ext.toUpperCase() : 'ODF'
		}

		if (
			compMethod === 0
			&& payloadBytes
			&& payloadBytes.length > 0
			&& payloadBytes.length <= 65536
			&& (lower === 'docprops/core.xml' || lower === 'meta.xml' || lower === 'word/document.xml')
		) {
			const xmlText = decodeUtf8Bounded(payloadBytes)
			if (lower === 'docprops/core.xml') {
				title = title || extractXmlTagText(xmlText, 'dc:title')
				author = author || extractXmlTagText(xmlText, 'cp:lastModifiedBy') || extractXmlTagText(xmlText, 'dc:creator')
				const revText = extractXmlTagText(xmlText, 'cp:revision')
				if (revText && /^\d+$/.test(revText)) {
					revision = Number(revText)
				}
				modifiedHint = modifiedHint || extractXmlTagText(xmlText, 'dcterms:modified')
			} else if (lower === 'meta.xml') {
				title = title || extractXmlTagText(xmlText, 'dc:title')
				author = author || extractXmlTagText(xmlText, 'dc:creator')
				modifiedHint = modifiedHint || extractXmlTagText(xmlText, 'dc:date')
			} else if (lower === 'word/document.xml') {
				if (xmlText.includes('<w:ins ') || xmlText.includes('<w:del ')) {
					hasTrackedChanges = true
				}
			}
		}
	}

	// Scan Central Directory from EOCD if present in probed slice
	let eocdOffset = -1
	const searchStart = Math.max(0, bytes.length - 65557)
	for (let i = bytes.length - 22; i >= searchStart; i -= 1) {
		if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
			eocdOffset = i
			break
		}
	}

	if (eocdOffset !== -1) {
		const cdOffset = readU32LE(bytes, eocdOffset + 16)
		const totalEntries = readU16LE(bytes, eocdOffset + 10)
		if (cdOffset < bytes.length) {
			let ptr = cdOffset
			const cap = Math.min(totalEntries, MAX_OFFICE_ENTRIES)
			for (let idx = 0; idx < cap && ptr + 46 <= bytes.length; idx += 1) {
				if (bytes[ptr] !== 0x50 || bytes[ptr + 1] !== 0x4b || bytes[ptr + 2] !== 0x01 || bytes[ptr + 3] !== 0x02) {
					break
				}
				const compMethod = readU16LE(bytes, ptr + 10)
				const compSize = readU32LE(bytes, ptr + 20)
				const uncompSize = readU32LE(bytes, ptr + 24)
				const nameLen = readU16LE(bytes, ptr + 28)
				const extraLen = readU16LE(bytes, ptr + 30)
				const commentLen = readU16LE(bytes, ptr + 32)
				const localOffset = readU32LE(bytes, ptr + 42)
				if (ptr + 46 + nameLen > bytes.length) {
					break
				}
				const entryName = decodeUtf8Bounded(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
				let payload = null
				if (compMethod === 0 && localOffset + 30 < bytes.length && compSize <= 65536) {
					const lfhNameLen = readU16LE(bytes, localOffset + 26)
					const lfhExtraLen = readU16LE(bytes, localOffset + 28)
					const dataStart = localOffset + 30 + lfhNameLen + lfhExtraLen
					if (dataStart + compSize <= bytes.length) {
						payload = bytes.subarray(dataStart, dataStart + compSize)
					}
				}
				recordEntry(entryName, compMethod, compSize, uncompSize, payload)
				ptr += 46 + nameLen + extraLen + commentLen
			}
		}
	}

	// Fallback: sequential Local File Header walk if EOCD was outside tail/head slice
	if (entries.length === 0) {
		let ptr = 0
		while (ptr + 30 <= bytes.length && entries.length < MAX_OFFICE_ENTRIES) {
			if (bytes[ptr] !== 0x50 || bytes[ptr + 1] !== 0x4b || bytes[ptr + 2] !== 0x03 || bytes[ptr + 3] !== 0x04) {
				break
			}
			const flags = readU16LE(bytes, ptr + 6)
			const compMethod = readU16LE(bytes, ptr + 8)
			const compSize = readU32LE(bytes, ptr + 18)
			const uncompSize = readU32LE(bytes, ptr + 22)
			const nameLen = readU16LE(bytes, ptr + 26)
			const extraLen = readU16LE(bytes, ptr + 28)
			if (ptr + 30 + nameLen > bytes.length) {
				break
			}
			const entryName = decodeUtf8Bounded(bytes.subarray(ptr + 30, ptr + 30 + nameLen))
			const dataStart = ptr + 30 + nameLen + extraLen
			const hasDataDescriptor = (flags & 0x08) !== 0
			let payload = null
			if (compMethod === 0 && compSize > 0 && compSize <= 65536 && dataStart + compSize <= bytes.length) {
				payload = bytes.subarray(dataStart, dataStart + compSize)
			}
			recordEntry(entryName, compMethod, compSize, uncompSize, payload)
			if (hasDataDescriptor || compSize === 0 || dataStart + compSize > bytes.length) {
				break
			}
			ptr = dataStart + compSize
		}
	}

	if (entries.length === 0) {
		return {
			kind: 'office',
			formatLabel,
			probed: false,
			corrupt: true,
			qualityNotes: ['Unable to inspect Office ZIP directory'],
		}
	}

	const qualityNotes = []
	if (hasDigitalSig) {
		qualityNotes.push('Digitally signed package')
	}
	if (hasComments) {
		qualityNotes.push('Contains review comments')
	}
	if (hasTrackedChanges) {
		qualityNotes.push('Contains tracked revisions')
	}
	if (embeddedMediaCount > 0) {
		qualityNotes.push(`${embeddedMediaCount} embedded media assets`)
	}

	const summaryText = [title, author, ...entries.slice(0, 24)].filter(Boolean).join(' ')
	return {
		kind: 'office',
		formatLabel: detectedApp,
		probed: true,
		corrupt: false,
		title,
		author,
		revision,
		modifiedHint,
		pageCount: null,
		wordCount: uncompressedXmlBytes > 0 ? Math.round(uncompressedXmlBytes / 18) : null,
		lineCount: entries.length,
		hasTextLayer: true,
		isSigned: hasDigitalSig,
		isEncrypted: false,
		hasComments,
		hasTrackedChanges,
		embeddedMediaCount,
		packageEntries: entries.slice(0, 32),
		previewText: sanitizeDocText(summaryText, 400),
		lines: entries.slice(0, MAX_DIFF_LINES),
		shingles: buildTextShingles(summaryText),
		qualityNotes,
	}
}

/**
 * Parse plain-text, Markdown, CSV, JSON, XML, HTML, or TeX document content safely.
 *
 * @param {string|Uint8Array|ArrayBuffer} input - Raw text or UTF-8 bytes.
 * @param {object|null} [file=null] - Optional file context.
 * @return {object} Normalized text document probe summary.
 */
export function parsePlainTextDocument(input, file = null) {
	let text = ''
	if (typeof input === 'string') {
		text = input.slice(0, MAX_TEXT_EXTRACT_CHARS)
	} else if (input instanceof Uint8Array) {
		text = decodeUtf8Bounded(input).slice(0, MAX_TEXT_EXTRACT_CHARS)
	} else if (input instanceof ArrayBuffer) {
		text = decodeUtf8Bounded(new Uint8Array(input)).slice(0, MAX_TEXT_EXTRACT_CHARS)
	}

	// Strip UTF-8 BOM
	if (text.charCodeAt(0) === 0xfeff) {
		text = text.slice(1)
	}

	const ext = extractFileExtension(resolveFileName(file) || '')
	const kind = classifyDocumentKind(file) || (DATA_EXT_SET.has(ext) ? 'data' : 'text')
	const formatLabel = ext ? ext.toUpperCase() : 'TXT'

	const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
	const cleanLines = rawLines
		.slice(0, MAX_DIFF_LINES)
		.map(line => {
			let out = ''
			for (let i = 0; i < line.length && i < 400; i += 1) {
				const code = line.charCodeAt(i)
				if (code === 0) {
					continue
				}
				out += (code < 32 && code !== 9) || code === 127 ? ' ' : line[i]
			}
			return out
		})

	const nonEmptyLineCount = rawLines.filter(line => line.trim().length > 0).length
	const normalizedBody = sanitizeDocText(text.slice(0, 40000), 40000)
	const words = normalizedBody ? normalizedBody.split(/\s+/).filter(Boolean) : []
	const headingMatch = text.match(/^(?:#{1,6}\s+.+|\\(?:section|subsection|chapter)\{.+?\})/gm)
	const headingCount = headingMatch ? headingMatch.length : 0

	const qualityNotes = []
	let title = ''
	if (ext === 'md' || ext === 'markdown') {
		const h1 = text.match(/^#\s+(.{1,140})/m)
		if (h1) {
			title = sanitizeDocText(h1[1], 140)
		}
	} else if (ext === 'json') {
		try {
			JSON.parse(text)
			qualityNotes.push('Valid JSON')
		} catch (e) {
			qualityNotes.push('Truncated or malformed JSON')
		}
	} else if (ext === 'csv' || ext === 'tsv') {
		const delimiter = ext === 'tsv' ? '\t' : ','
		const firstLine = rawLines.find(l => l.trim().length > 0) || ''
		const colCount = firstLine ? firstLine.split(delimiter).length : 0
		if (colCount > 0) {
			qualityNotes.push(`${colCount} columns detected`)
		}
	}

	if (headingCount > 0) {
		qualityNotes.push(`${headingCount} headings`)
	}
	if (words.length === 0) {
		qualityNotes.push('Empty text body')
	}

	return {
		kind,
		formatLabel,
		probed: true,
		corrupt: false,
		title,
		author: '',
		revision: null,
		modifiedHint: '',
		pageCount: null,
		wordCount: words.length,
		lineCount: rawLines.length,
		nonEmptyLineCount,
		headingCount,
		hasTextLayer: words.length > 0,
		isSigned: false,
		isEncrypted: false,
		embeddedMediaCount: 0,
		previewText: sanitizeDocText(text.slice(0, 1200), 1200),
		lines: cleanLines,
		shingles: buildTextShingles(normalizedBody),
		qualityNotes,
	}
}

/**
 * Inspect any document buffer or string automatically by magic bytes and file extension.
 *
 * @param {Uint8Array|ArrayBuffer|string} input - Document bytes or text.
 * @param {object|null} [file=null] - File metadata.
 * @return {object} Normalized document probe metadata.
 */
export function probeDocumentBuffer(input, file = null) {
	if (typeof input === 'string') {
		if (input.startsWith('%PDF-')) {
			const arr = new Uint8Array(Math.min(input.length, MAX_DOC_PROBE_BYTES))
			for (let i = 0; i < arr.length; i += 1) {
				arr[i] = input.charCodeAt(i) & 0xff
			}
			return parsePdfMetadata(arr, file)
		}
		return parsePlainTextDocument(input, file)
	}

	const bytes = input instanceof Uint8Array
		? input
		: (input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(0))

	if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
		return parsePdfMetadata(bytes, file)
	}
	if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05)) {
		return parseZipOfficeMetadata(bytes, file)
	}

	const kind = classifyDocumentKind(file)
	if (kind === 'pdf') {
		return parsePdfMetadata(bytes, file)
	}
	if (kind === 'office' && extractFileExtension(resolveFileName(file)) !== 'rtf') {
		return parseZipOfficeMetadata(bytes, file)
	}
	return parsePlainTextDocument(bytes, file)
}

/**
 * Compute bounded LCS line-by-line diff between two arrays of lines.
 * Safe against O(N^2) blowups via MAX_DIFF_LINES cap.
 *
 * @param {string[]} leftLines - Baseline lines.
 * @param {string[]} rightLines - Candidate lines.
 * @param {object} [options] - Diff limits.
 * @param {number} [options.maxLines=140] - Max lines per side for LCS table.
 * @return {object} Deterministic line diff summary.
 */
export function computeDocumentLineDiff(leftLines, rightLines, options = {}) {
	const rawLeft = Array.isArray(leftLines) ? leftLines : []
	const rawRight = Array.isArray(rightLines) ? rightLines : []
	const cap = Math.max(10, Math.min(MAX_DIFF_LINES, Number(options.maxLines) || 140))

	const left = rawLeft.slice(0, cap).map(line => String(line ?? ''))
	const right = rawRight.slice(0, cap).map(line => String(line ?? ''))
	const truncated = rawLeft.length > cap || rawRight.length > cap

	const m = left.length
	const n = right.length
	if (m === 0 && n === 0) {
		return {
			rows: [],
			addedCount: 0,
			removedCount: 0,
			unchangedCount: 0,
			similarityPct: 100,
			truncated: false,
		}
	}

	// Int32Array flat DP table for fast bounded LCS
	const width = n + 1
	const dp = new Int32Array((m + 1) * width)
	for (let i = m - 1; i >= 0; i -= 1) {
		const rowOffset = i * width
		const nextRowOffset = (i + 1) * width
		for (let j = n - 1; j >= 0; j -= 1) {
			if (left[i] === right[j]) {
				dp[rowOffset + j] = 1 + dp[nextRowOffset + j + 1]
			} else {
				const down = dp[nextRowOffset + j]
				const rightVal = dp[rowOffset + j + 1]
				dp[rowOffset + j] = down >= rightVal ? down : rightVal
			}
		}
	}

	const rows = []
	let i = 0
	let j = 0
	let addedCount = 0
	let removedCount = 0
	let unchangedCount = 0

	while (i < m && j < n) {
		if (left[i] === right[j]) {
			rows.push({
				type: 'equal',
				leftLineNumber: i + 1,
				rightLineNumber: j + 1,
				text: left[i],
			})
			unchangedCount += 1
			i += 1
			j += 1
		} else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
			rows.push({
				type: 'remove',
				leftLineNumber: i + 1,
				rightLineNumber: null,
				text: left[i],
			})
			removedCount += 1
			i += 1
		} else {
			rows.push({
				type: 'add',
				leftLineNumber: null,
				rightLineNumber: j + 1,
				text: right[j],
			})
			addedCount += 1
			j += 1
		}
	}

	while (i < m) {
		rows.push({
			type: 'remove',
			leftLineNumber: i + 1,
			rightLineNumber: null,
			text: left[i],
		})
		removedCount += 1
		i += 1
	}

	while (j < n) {
		rows.push({
			type: 'add',
			leftLineNumber: null,
			rightLineNumber: j + 1,
			text: right[j],
		})
		addedCount += 1
		j += 1
	}

	const unionLines = unchangedCount + addedCount + removedCount
	const similarityPct = unionLines > 0
		? Math.round((unchangedCount / unionLines) * 100)
		: 100

	return {
		rows,
		addedCount,
		removedCount,
		unchangedCount,
		similarityPct,
		truncated,
	}
}

/**
 * Compare two document entries using probed content (when loaded) + version/size metadata.
 *
 * @param {object|null} leftFile - Baseline document.
 * @param {object|null} rightFile - Candidate document.
 * @param {object} [probeByKey={}] - Map of file selection key -> probed document record.
 * @return {object} Pair comparison metrics and diff rows.
 */
export function compareDocumentPair(leftFile, rightFile, probeByKey = {}) {
	if (!leftFile || !rightFile) {
		return {
			comparable: false,
			hasProbedContent: false,
			exactHashMatch: false,
			shingleSimilarityPct: null,
			cosineSimilarityPct: null,
			lineSimilarityPct: null,
			overallSimilarityPct: 0,
			diff: computeDocumentLineDiff([], []),
			sizeDeltaBytes: 0,
		}
	}

	const leftKey = String(getFileSelectionKey(leftFile) ?? '')
	const rightKey = String(getFileSelectionKey(rightFile) ?? '')
	const leftProbe = leftKey && probeByKey[leftKey] ? probeByKey[leftKey] : null
	const rightProbe = rightKey && probeByKey[rightKey] ? probeByKey[rightKey] : null

	const exactHashMatch = Boolean(
		leftFile.fileHash
		&& rightFile.fileHash
		&& leftFile.fileHash === rightFile.fileHash,
	)

	const leftMeta = parseDocumentVersionMeta(resolveFileName(leftFile))
	const rightMeta = parseDocumentVersionMeta(resolveFileName(rightFile))

	const leftSize = Number(leftFile.size) || 0
	const rightSize = Number(rightFile.size) || 0
	const sizeDeltaBytes = rightSize - leftSize

	if (leftProbe && rightProbe && leftProbe.probed && rightProbe.probed) {
		const shingleSimilarityPct = computeShingleJaccardSimilarity(leftProbe.shingles, rightProbe.shingles)
		const cosineSimilarityPct = computeTokenCosineSimilarity(leftProbe.previewText || '', rightProbe.previewText || '')
		const diff = computeDocumentLineDiff(leftProbe.lines || [], rightProbe.lines || [])
		const lineSimilarityPct = diff.similarityPct

		let overallSimilarityPct = lineSimilarityPct
		if (exactHashMatch) {
			overallSimilarityPct = 100
		} else if (shingleSimilarityPct !== null && cosineSimilarityPct !== null) {
			overallSimilarityPct = Math.round(
				(shingleSimilarityPct * 0.45) + (cosineSimilarityPct * 0.35) + (lineSimilarityPct * 0.2),
			)
		} else if (shingleSimilarityPct !== null) {
			overallSimilarityPct = Math.round((shingleSimilarityPct * 0.65) + (lineSimilarityPct * 0.35))
		}

		return {
			comparable: true,
			hasProbedContent: true,
			exactHashMatch,
			shingleSimilarityPct,
			cosineSimilarityPct,
			lineSimilarityPct,
			overallSimilarityPct,
			diff,
			sizeDeltaBytes,
			leftProbe,
			rightProbe,
		}
	}

	// Metadata-only fallback before WebDAV probing
	const stemMatch = leftMeta.canonicalStem === rightMeta.canonicalStem
	const maxSize = Math.max(leftSize, rightSize)
	const sizeSimilarity = maxSize > 0
		? Math.round((Math.min(leftSize, rightSize) / maxSize) * 100)
		: 100
	const overallSimilarityPct = exactHashMatch
		? 100
		: (stemMatch ? Math.max(65, Math.round((sizeSimilarity * 0.5) + 45)) : Math.round(sizeSimilarity * 0.6))

	return {
		comparable: true,
		hasProbedContent: false,
		exactHashMatch,
		shingleSimilarityPct: null,
		cosineSimilarityPct: null,
		lineSimilarityPct: null,
		overallSimilarityPct,
		diff: computeDocumentLineDiff([], []),
		sizeDeltaBytes,
		leftProbe,
		rightProbe,
	}
}

/**
 * Score a document candidate for survivor selection under the active strategy.
 *
 * @param {object} file - Document file entry.
 * @param {object} [probeByKey={}] - Map of probed file metadata.
 * @param {string} [keepRule='latest_complete'] - Survivor rule.
 * @return {{ score: number, reasons: string[], versionMeta: object, probe: object|null }} Scoring tuple.
 */
export function scoreDocumentSurvivor(file, probeByKey = {}, keepRule = 'latest_complete') {
	const key = String(getFileSelectionKey(file) ?? '')
	const probe = key && probeByKey[key] ? probeByKey[key] : null
	const meta = parseDocumentVersionMeta(resolveFileName(file))
	const mtime = extractMtimeMs(file)
	const size = Number(file.size) || 0
	const extRank = EDITABLE_EXTENSION_RANK[meta.extension] || 2
	const pathLen = typeof file.path === 'string' ? file.path.length : 999
	const reasons = []

	if (isProtectedDocumentFile(file)) {
		reasons.push('Protected Origin')
	}
	if (probe && probe.isSigned) {
		reasons.push('Digitally Signed')
	} else if (meta.isSignedOrFinal) {
		reasons.push(meta.stageLabel)
	}
	if (meta.versionLabel && meta.versionTuple) {
		reasons.push(meta.versionLabel)
	}
	if (probe && probe.probed && probe.wordCount > 0) {
		reasons.push(`${probe.wordCount} words`)
	}
	if (probe && probe.probed && probe.pageCount > 0) {
		reasons.push(`${probe.pageCount} pages`)
	}
	if (probe && probe.kind === 'pdf' && probe.probed && probe.hasTextLayer === false) {
		reasons.push('Scanned PDF')
	}

	const versionNumeric = meta.versionTuple
		? (meta.versionTuple[0] * 10000) + (meta.versionTuple[1] * 100) + meta.versionTuple[2]
		: 0

	let score = 0
	if (keepRule === 'highest_content') {
		const wordScore = probe && probe.wordCount ? probe.wordCount * 4 : 0
		const pageScore = probe && probe.pageCount ? probe.pageCount * 80 : 0
		const textLayerBonus = probe && probe.hasTextLayer ? 400 : 0
		score = wordScore + pageScore + textLayerBonus + Math.min(size / 1024, 5000) + (meta.stageRank * 120)
	} else if (keepRule === 'newest') {
		score = (versionNumeric * 1000) + (mtime / 1000) + (meta.stageRank * 500)
	} else if (keepRule === 'oldest') {
		score = mtime > 0 ? -(mtime / 1000) : 0
	} else if (keepRule === 'editable_source') {
		score = (extRank * 100000) + (versionNumeric * 200) + (meta.stageRank * 500) + (mtime / 1e7)
	} else if (keepRule === 'shortest_path') {
		score = -(pathLen * 1000) + (meta.stageRank * 50)
	} else {
		// latest_complete (default)
		const signedBonus = (probe && probe.isSigned) ? 25000 : 0
		const textBonus = (probe && probe.kind === 'pdf' && probe.hasTextLayer === false) ? -3000 : 800
		const richnessBonus = probe && probe.wordCount ? Math.min(probe.wordCount, 4000) : 0
		const copyPenalty = meta.isCopyArtifact ? -4500 : 0
		score = signedBonus
			+ textBonus
			+ richnessBonus
			+ copyPenalty
			+ (meta.stageRank * 2500)
			+ (versionNumeric * 60)
			+ (mtime / 1e8)
	}

	if (isProtectedDocumentFile(file)) {
		score += 1e12
	}

	return {
		score,
		reasons,
		versionMeta: meta,
		probe,
	}
}

/**
 * Pick the survivor file inside a document cluster given a keepRule or manual keep key.
 *
 * @param {Array<object>} files - Cluster file entries.
 * @param {object} [probeByKey={}] - Probed metadata map.
 * @param {string} [keepRule='latest_complete'] - Keep strategy.
 * @param {string|number|null} [manualKeepKey=null] - Explicit user-chosen survivor key.
 * @return {object|null} Chosen survivor file.
 */
export function pickDocumentSurvivor(files, probeByKey = {}, keepRule = 'latest_complete', manualKeepKey = null) {
	if (!Array.isArray(files) || files.length === 0) {
		return null
	}
	if (manualKeepKey !== null && manualKeepKey !== undefined && manualKeepKey !== '') {
		const manualMatch = files.find(file => String(getFileSelectionKey(file) ?? '') === String(manualKeepKey))
		if (manualMatch) {
			return manualMatch
		}
	}

	if (keepRule === 'oldest' || keepRule === 'newest' || keepRule === 'shortest_path') {
		const hasProtected = files.some(isProtectedDocumentFile)
		if (!hasProtected && files.every(f => f.fileHash === files[0].fileHash)) {
			const toDelete = selectDuplicatesByKeepRule(files, keepRule)
			const deleteSet = new Set(toDelete.map(f => String(getFileSelectionKey(f) ?? '')))
			const survivor = files.find(f => !deleteSet.has(String(getFileSelectionKey(f) ?? '')))
			if (survivor) {
				return survivor
			}
		}
	}

	let bestFile = files[0]
	let bestScore = -Infinity
	for (const file of files) {
		const evaluated = scoreDocumentSurvivor(file, probeByKey, keepRule)
		if (evaluated.score > bestScore) {
			bestScore = evaluated.score
			bestFile = file
		}
	}
	return bestFile
}

/**
 * Normalize catalog builder options safely.
 *
 * @param {object} [rawOptions={}] - Caller options.
 * @return {object} Normalized options.
 */
export function normalizeDocumentLineageOptions(rawOptions = {}) {
	const raw = rawOptions && typeof rawOptions === 'object' ? rawOptions : {}
	const keepRule = DOC_KEEP_RULES.includes(raw.keepRule) ? raw.keepRule : 'latest_complete'
	const kindFilter = DOC_KINDS.includes(raw.kindFilter) ? raw.kindFilter : 'all'
	const clusteringMode = DOC_CLUSTERING_MODES.includes(raw.clusteringMode) ? raw.clusteringMode : 'lineages'
	const similarityThreshold = clampDocSimilarityPct(raw.similarityThreshold)
	const searchQuery = typeof raw.searchQuery === 'string' ? raw.searchQuery.trim().toLowerCase() : ''
	const probeByKey = raw.probeByKey && typeof raw.probeByKey === 'object' ? raw.probeByKey : {}
	const manualKeepByCluster = raw.manualKeepByCluster && typeof raw.manualKeepByCluster === 'object'
		? raw.manualKeepByCluster
		: {}

	return {
		keepRule,
		kindFilter,
		clusteringMode,
		similarityThreshold,
		searchQuery,
		probeByKey,
		manualKeepByCluster,
	}
}

/**
 * Build the complete Document Fuzzy Diff & Version Lineage catalog from duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate groups loaded from DuplicateFinder state.
 * @param {object} [rawOptions={}] - Catalog options.
 * @return {object} Deterministic document lineage catalog.
 */
export function buildDocumentLineageCatalog(duplicates, rawOptions = {}) {
	const options = normalizeDocumentLineageOptions(rawOptions)
	const sourceGroups = Array.isArray(duplicates) ? duplicates : []

	// Flatten all document files while tracking exact hash group membership
	const fileRecords = []
	const seenKeys = new Set()

	for (let gIdx = 0; gIdx < sourceGroups.length; gIdx += 1) {
		const group = sourceGroups[gIdx]
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		const groupHash = typeof group.hash === 'string' ? group.hash : ''
		for (const file of group.files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			const kind = classifyDocumentKind(file)
			if (!kind) {
				continue
			}
			const key = String(getFileSelectionKey(file) ?? `${gIdx}:${resolveFileName(file)}`)
			if (seenKeys.has(key)) {
				continue
			}
			seenKeys.add(key)
			const fileName = resolveFileName(file)
			const versionMeta = parseDocumentVersionMeta(fileName)
			fileRecords.push({
				key,
				file: {
					...file,
					fileHash: file.fileHash || groupHash,
				},
				kind,
				groupId: group.id ?? gIdx,
				groupHash,
				folderPath: resolveParentFolder(file),
				versionMeta,
			})
		}
	}

	// Build raw buckets according to clusteringMode
	const bucketMap = new Map()
	for (const rec of fileRecords) {
		const bucketId = options.clusteringMode === 'groups'
			? `group:${rec.groupHash || rec.groupId}`
			: `lineage:${rec.versionMeta.canonicalStem}`

		if (!bucketMap.has(bucketId)) {
			bucketMap.set(bucketId, [])
		}
		bucketMap.get(bucketId).push(rec)
	}

	const clusters = []
	const kindCounts = { pdf: 0, office: 0, text: 0, data: 0 }
	let totalDocuments = 0
	let versionLineageCount = 0
	let crossFormatCount = 0
	let exactDuplicateFiles = 0
	let nearDuplicateRevisions = 0
	let totalReclaimableBytes = 0
	let probedCount = 0

	for (const [clusterKey, members] of bucketMap.entries()) {
		if (members.length < 2) {
			continue
		}

		const files = members.map(m => m.file)
		const manualKeepKey = options.manualKeepByCluster[clusterKey] || null
		const survivorFile = pickDocumentSurvivor(files, options.probeByKey, options.keepRule, manualKeepKey)
		const survivorKey = survivorFile ? String(getFileSelectionKey(survivorFile) ?? '') : ''

		// Compute pair similarity of each member against survivor
		const enrichedFiles = members.map(rec => {
			const scored = scoreDocumentSurvivor(rec.file, options.probeByKey, options.keepRule)
			const pair = survivorFile && rec.key !== survivorKey
				? compareDocumentPair(survivorFile, rec.file, options.probeByKey)
				: {
					overallSimilarityPct: 100,
					exactHashMatch: true,
					hasProbedContent: Boolean(scored.probe && scored.probe.probed),
				}
			const isSurvivor = rec.key === survivorKey
			const isProtected = isProtectedDocumentFile(rec.file)
			const isExactCopyOfSurvivor = Boolean(
				!isSurvivor
				&& survivorFile
				&& rec.file.fileHash
				&& survivorFile.fileHash
				&& rec.file.fileHash === survivorFile.fileHash,
			)
			return {
				key: rec.key,
				file: rec.file,
				name: resolveFileName(rec.file),
				path: typeof rec.file.path === 'string' ? rec.file.path : resolveFileName(rec.file),
				folderPath: rec.folderPath,
				size: Number(rec.file.size) || 0,
				sizeFormatted: formatBytes(Number(rec.file.size) || 0),
				mtimeMs: extractMtimeMs(rec.file),
				kind: rec.kind,
				extension: rec.versionMeta.extension.toUpperCase() || rec.kind.toUpperCase(),
				groupId: rec.groupId,
				groupHash: rec.groupHash,
				versionMeta: rec.versionMeta,
				probe: scored.probe,
				score: scored.score,
				reasons: scored.reasons,
				isSurvivor,
				isProtected,
				isExactCopyOfSurvivor,
				isRevisionVariant: !isSurvivor && !isExactCopyOfSurvivor,
				similarityPct: isSurvivor ? 100 : (pair.overallSimilarityPct ?? 100),
				deletable: !isSurvivor && !isProtected,
			}
		})

		// Sort survivor first, then highest version/mtime, then path
		enrichedFiles.sort((a, b) => {
			if (a.isSurvivor !== b.isSurvivor) {
				return a.isSurvivor ? -1 : 1
			}
			const verCmp = compareVersionTuples(b.versionMeta.versionTuple, a.versionMeta.versionTuple)
			if (verCmp !== 0) {
				return verCmp
			}
			if (b.mtimeMs !== a.mtimeMs) {
				return b.mtimeMs - a.mtimeMs
			}
			return a.path.localeCompare(b.path)
		})

		const maxSimilarity = enrichedFiles
			.filter(item => !item.isSurvivor)
			.reduce((max, item) => Math.max(max, item.similarityPct), 0)

		if (maxSimilarity < options.similarityThreshold && !enrichedFiles.some(f => f.isExactCopyOfSurvivor)) {
			continue
		}

		// Filter by document kind
		const formatSet = new Set(enrichedFiles.map(item => item.extension))
		const kindSet = new Set(enrichedFiles.map(item => item.kind))
		const primaryKind = enrichedFiles[0].kind
		if (options.kindFilter !== 'all' && !kindSet.has(options.kindFilter)) {
			continue
		}

		// Search query match
		if (options.searchQuery) {
			const hay = [
				members[0].versionMeta.canonicalStem,
				...enrichedFiles.map(f => `${f.name} ${f.path} ${f.probe?.title || ''} ${f.probe?.author || ''} ${f.versionMeta.versionLabel}`),
			].join(' ').toLowerCase()
			if (!hay.includes(options.searchQuery)) {
				continue
			}
		}

		const distinctHashes = new Set(enrichedFiles.map(f => f.groupHash).filter(Boolean))
		const isCrossGroupLineage = distinctHashes.size > 1 || enrichedFiles.some(f => f.isRevisionVariant)
		const hasCrossFormat = formatSet.size > 1
		const hasSignedCopy = enrichedFiles.some(f => (f.probe && f.probe.isSigned) || f.versionMeta.isSignedOrFinal)
		const hasScannedOnlyPdf = enrichedFiles.some(f => f.kind === 'pdf' && f.probe && f.probe.probed && f.probe.hasTextLayer === false)

		const versionLabels = enrichedFiles
			.map(f => f.versionMeta.versionLabel)
			.filter(Boolean)
		const uniqueVersionLabels = Array.from(new Set(versionLabels))
		const versionSpan = uniqueVersionLabels.length >= 2
			? `${uniqueVersionLabels[uniqueVersionLabels.length - 1]} -> ${uniqueVersionLabels[0]}`
			: (uniqueVersionLabels[0] || '')

		const deletableFiles = enrichedFiles.filter(f => f.deletable)
		const exactCopyItems = deletableFiles.filter(f => f.isExactCopyOfSurvivor)
		const revisionItems = deletableFiles.filter(f => f.isRevisionVariant)
		const reclaimableBytes = deletableFiles.reduce((sum, f) => sum + f.size, 0)

		const canonicalTitle = enrichedFiles[0].probe?.title
			|| members[0].versionMeta.canonicalStem
			|| enrichedFiles[0].name

		const probedInCluster = enrichedFiles.filter(f => f.probe && f.probe.probed).length

		for (const item of enrichedFiles) {
			kindCounts[item.kind] = (kindCounts[item.kind] || 0) + 1
		}
		totalDocuments += enrichedFiles.length
		if (isCrossGroupLineage) {
			versionLineageCount += 1
		}
		if (hasCrossFormat) {
			crossFormatCount += 1
		}
		exactDuplicateFiles += exactCopyItems.length
		nearDuplicateRevisions += revisionItems.length
		totalReclaimableBytes += reclaimableBytes
		probedCount += probedInCluster

		clusters.push({
			clusterKey,
			canonicalTitle: sanitizeDocText(canonicalTitle, 140),
			canonicalStem: members[0].versionMeta.canonicalStem,
			primaryKind,
			kindBadges: Array.from(kindSet),
			formatBadges: Array.from(formatSet),
			files: enrichedFiles,
			fileCount: enrichedFiles.length,
			survivorKey,
			survivorFile: enrichedFiles.find(f => f.isSurvivor) || enrichedFiles[0],
			deletableKeys: deletableFiles.map(f => f.key),
			exactCopyKeys: exactCopyItems.map(f => f.key),
			revisionKeys: revisionItems.map(f => f.key),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			similarityPct: maxSimilarity,
			versionSpan,
			isCrossGroupLineage,
			hasCrossFormat,
			hasSignedCopy,
			hasScannedOnlyPdf,
			probedCount: probedInCluster,
			primaryGroupId: enrichedFiles[0].groupId,
		})
	}

	clusters.sort((a, b) => {
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		return b.fileCount - a.fileCount
	})

	return {
		clusters,
		options,
		summary: {
			totalClusters: clusters.length,
			totalDocuments,
			versionLineageCount,
			crossFormatCount,
			exactDuplicateFiles,
			nearDuplicateRevisions,
			totalSupersededCount: exactDuplicateFiles + nearDuplicateRevisions,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
			probedCount,
			kindCounts,
		},
	}
}

/**
 * Compute safe deletion keys across the document catalog while never deleting
 * the survivor or any protected origin file, and never deleting the last remaining
 * copy of an exact hash group unless explicitly requested as an older revision.
 *
 * @param {object} catalog - Output from buildDocumentLineageCatalog.
 * @param {object} [options={}] - Selection policy.
 * @param {boolean} [options.includeExactCopies=true] - Include exact-hash redundant copies.
 * @param {boolean} [options.includeOlderRevisions=false] - Include near-duplicate superseded drafts.
 * @return {string[]} Safe selection keys.
 */
export function selectSupersededDocumentKeys(catalog, options = {}) {
	if (!catalog || !Array.isArray(catalog.clusters)) {
		return []
	}
	const includeExactCopies = options.includeExactCopies !== false
	const includeOlderRevisions = Boolean(options.includeOlderRevisions)
	const selected = new Set()

	for (const cluster of catalog.clusters) {
		if (!cluster || !Array.isArray(cluster.files)) {
			continue
		}
		// Count total files per exact fileHash across this cluster so we never wipe out an unbacked hash accidentally
		const remainingByHash = new Map()
		for (const item of cluster.files) {
			if (item.groupHash) {
				remainingByHash.set(item.groupHash, (remainingByHash.get(item.groupHash) || 0) + 1)
			}
		}

		for (const item of cluster.files) {
			if (!item.deletable || item.isSurvivor || item.isProtected) {
				continue
			}
			const matchesPolicy = (includeExactCopies && item.isExactCopyOfSurvivor)
				|| (includeOlderRevisions && item.isRevisionVariant)
			if (!matchesPolicy) {
				continue
			}
			// If exact copy mode only, preserve at least 1 copy of every distinct hash
			if (!includeOlderRevisions && item.groupHash) {
				const count = remainingByHash.get(item.groupHash) || 0
				if (count <= 1) {
					continue
				}
				remainingByHash.set(item.groupHash, count - 1)
			}
			selected.add(item.key)
		}
	}

	return Array.from(selected)
}

/**
 * Export the document lineage catalog as a structured JSON report.
 *
 * @param {object} catalog - Catalog produced by buildDocumentLineageCatalog.
 * @param {string} [exportedAt] - Optional ISO timestamp.
 * @return {string} Pretty JSON string.
 */
export function exportDocumentLineageJson(catalog, exportedAt = new Date().toISOString()) {
	const safeCatalog = catalog && typeof catalog === 'object' ? catalog : { clusters: [], summary: {} }
	const payload = {
		schema: DOC_LINEAGE_SCHEMA,
		exportedAt,
		summary: safeCatalog.summary || {},
		options: safeCatalog.options
			? {
				keepRule: safeCatalog.options.keepRule,
				kindFilter: safeCatalog.options.kindFilter,
				clusteringMode: safeCatalog.options.clusteringMode,
				similarityThreshold: safeCatalog.options.similarityThreshold,
			}
			: {},
		clusters: (safeCatalog.clusters || []).map(cluster => ({
			clusterKey: cluster.clusterKey,
			canonicalTitle: cluster.canonicalTitle,
			primaryKind: cluster.primaryKind,
			formatBadges: cluster.formatBadges,
			versionSpan: cluster.versionSpan,
			similarityPct: cluster.similarityPct,
			isCrossGroupLineage: cluster.isCrossGroupLineage,
			hasCrossFormat: cluster.hasCrossFormat,
			reclaimableBytes: cluster.reclaimableBytes,
			survivorPath: cluster.survivorFile ? cluster.survivorFile.path : '',
			files: cluster.files.map(item => ({
				name: item.name,
				path: item.path,
				extension: item.extension,
				size: item.size,
				role: item.isSurvivor ? 'survivor' : (item.isExactCopyOfSurvivor ? 'exact_copy' : 'revision_variant'),
				protected: item.isProtected,
				similarityPct: item.similarityPct,
				versionLabel: item.versionMeta.versionLabel,
				stageLabel: item.versionMeta.stageLabel,
				probed: Boolean(item.probe && item.probe.probed),
				author: item.probe ? item.probe.author || '' : '',
				pageCount: item.probe ? item.probe.pageCount ?? null : null,
				wordCount: item.probe ? item.probe.wordCount ?? null : null,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export the document lineage catalog as a CWE-1236-safe RFC 4180 CSV report.
 *
 * @param {object} catalog - Catalog produced by buildDocumentLineageCatalog.
 * @return {string} Safe CSV text.
 */
export function exportDocumentLineageCsv(catalog) {
	const header = [
		'Cluster',
		'Role',
		'FileName',
		'Path',
		'Format',
		'VersionTag',
		'Stage',
		'SimilarityPct',
		'SizeBytes',
		'Protected',
		'Author',
		'Pages',
		'Words',
		'Notes',
	]
	const rows = [header.map(escapeCsvCell).join(',')]
	const clusters = catalog && Array.isArray(catalog.clusters) ? catalog.clusters : []

	for (const cluster of clusters) {
		for (const item of cluster.files || []) {
			const role = item.isSurvivor
				? 'survivor'
				: (item.isExactCopyOfSurvivor ? 'exact_copy' : 'revision_variant')
			const notes = item.probe && Array.isArray(item.probe.qualityNotes)
				? item.probe.qualityNotes.join('; ')
				: ''
			rows.push([
				cluster.canonicalTitle,
				role,
				item.name,
				item.path,
				item.extension,
				item.versionMeta.versionLabel,
				item.versionMeta.stageLabel,
				item.similarityPct,
				item.size,
				item.isProtected ? 'yes' : 'no',
				item.probe ? (item.probe.author || '') : '',
				item.probe && item.probe.pageCount !== null && item.probe.pageCount !== undefined ? item.probe.pageCount : '',
				item.probe && item.probe.wordCount !== null && item.probe.wordCount !== undefined ? item.probe.wordCount : '',
				notes,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}
