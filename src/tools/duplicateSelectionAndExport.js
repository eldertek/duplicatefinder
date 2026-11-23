/**
 * Pure keep-rule selection and CWE-1236-safe RFC 4180 CSV export helpers
 * for duplicate file triage.
 */

export const KEEP_RULES = Object.freeze([
	'oldest',
	'newest',
	'shortest_path',
])

/**
 * Resolve a stable identifier for a duplicate file entry (id when available, else path).
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {string|number|null} Stable file identifier or null when unavailable.
 */
export function getFileSelectionKey(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	if (file.id !== null && file.id !== undefined && file.id !== '') {
		return file.id
	}
	if (typeof file.path === 'string' && file.path.length > 0) {
		return file.path
	}
	return null
}

/**
 * Parse a timestamp value (number, numeric string, Date, or ISO date string) into a numeric value.
 *
 * @param {*} value - Candidate timestamp field.
 * @return {number|null} Numeric timestamp or null when invalid/missing.
 */
function parseTimestamp(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed)
			return Number.isFinite(numeric) ? numeric : null
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Extract the best available modification timestamp from a duplicate file entry.
 *
 * @param {object} file - Duplicate file entry.
 * @return {number|null} Numeric timestamp or null when absent.
 */
function getFileTimestamp(file) {
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const ts = parseTimestamp(file[field])
			if (ts !== null) {
				return ts
			}
		}
	}
	return null
}

/**
 * Deterministic locale-independent comparator by file path, falling back to selection key.
 *
 * @param {object} a - First file entry.
 * @param {object} b - Second file entry.
 * @return {number} Negative if a < b, positive if a > b, 0 if equal.
 */
function comparePathsDeterministically(a, b) {
	const pathA = typeof a.path === 'string' ? a.path : ''
	const pathB = typeof b.path === 'string' ? b.path : ''
	if (pathA < pathB) {
		return -1
	}
	if (pathA > pathB) {
		return 1
	}
	const keyA = String(getFileSelectionKey(a) ?? '')
	const keyB = String(getFileSelectionKey(b) ?? '')
	if (keyA < keyB) {
		return -1
	}
	if (keyA > keyB) {
		return 1
	}
	return 0
}

/**
 * Compare two file entries according to the requested keep rule.
 * A return value < 0 means `a` is preferred as the kept master over `b`.
 *
 * @param {object} a - First file entry.
 * @param {object} b - Second file entry.
 * @param {'oldest'|'newest'|'shortest_path'} rule - Keep rule identifier.
 * @return {number} Comparator result.
 */
function compareFilesForKeepRule(a, b, rule) {
	if (rule === 'shortest_path') {
		const lenA = typeof a.path === 'string' ? a.path.length : Number.POSITIVE_INFINITY
		const lenB = typeof b.path === 'string' ? b.path.length : Number.POSITIVE_INFINITY
		if (lenA !== lenB) {
			return lenA - lenB
		}
		return comparePathsDeterministically(a, b)
	}

	const tsA = getFileTimestamp(a)
	const tsB = getFileTimestamp(b)
	if (tsA !== null && tsB !== null && tsA !== tsB) {
		return rule === 'oldest' ? tsA - tsB : tsB - tsA
	}
	if (tsA !== null && tsB === null) {
		return -1
	}
	if (tsA === null && tsB !== null) {
		return 1
	}
	return comparePathsDeterministically(a, b)
}

/**
 * Select duplicate file identifiers (ID when present, else path) to mark for deletion
 * according to a smart keep rule while ALWAYS preserving at least one master file
 * and never selecting protected origin-folder files.
 *
 * @param {Array<object>} files - Files belonging to one duplicate group.
 * @param {'oldest'|'newest'|'shortest_path'} rule - Smart keep rule.
 * @return {Array<string|number>} Identifiers of files to select for deletion.
 */
export function selectDuplicatesByKeepRule(files, rule) {
	if (!Array.isArray(files) || !KEEP_RULES.includes(rule)) {
		return []
	}

	const validFiles = files.filter(file => file && typeof file === 'object')
	if (validFiles.length <= 1) {
		return []
	}

	const hasDeletable = validFiles.some(file => !file.isInOriginFolder)
	if (!hasDeletable) {
		return []
	}

	let masterIndex = 0
	for (let i = 1; i < validFiles.length; i++) {
		if (compareFilesForKeepRule(validFiles[i], validFiles[masterIndex], rule) < 0) {
			masterIndex = i
		}
	}

	const masterKey = getFileSelectionKey(validFiles[masterIndex])
	const keysToDelete = []
	for (let i = 0; i < validFiles.length; i++) {
		if (i === masterIndex) {
			continue
		}
		const candidate = validFiles[i]
		if (candidate.isInOriginFolder) {
			continue
		}
		const key = getFileSelectionKey(candidate)
		if (key !== null && key !== masterKey) {
			keysToDelete.push(key)
		}
	}

	return keysToDelete
}

/**
 * Escape a single CSV cell per RFC 4180 and neutralize CWE-1236 spreadsheet formula injection.
 * Prefixes values starting with '=', '+', '-', '@', '\t', or '\r' (or whitespace followed by
 * a formula trigger) with a single apostrophe and wraps special/neutralized values in quotes.
 *
 * @param {*} value - Raw cell value.
 * @return {string} Safe CSV cell representation.
 */
export function escapeCsvCell(value) {
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

const CSV_HEADERS = Object.freeze([
	'group_id',
	'hash',
	'status',
	'file_id',
	'path',
	'size_bytes',
	'mimetype',
	'protected',
])

/**
 * Build a CWE-1236-safe RFC 4180 CSV string from a list of duplicate groups.
 *
 * @param {Array<object>} duplicates - Filtered duplicate group objects.
 * @return {string} CSV document content with CRLF line endings.
 */
export function buildDuplicatesCsv(duplicates) {
	const lines = [CSV_HEADERS.map(escapeCsvCell).join(',')]
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return lines[0]
	}

	for (const duplicate of duplicates) {
		if (!duplicate || typeof duplicate !== 'object') {
			continue
		}
		const groupId = duplicate.id ?? ''
		const hash = duplicate.hash ?? ''
		const status = duplicate.acknowledged ? 'acknowledged' : 'unacknowledged'
		const files = Array.isArray(duplicate.files) ? duplicate.files : []

		for (const file of files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			const fileId = file.id ?? ''
			const path = file.path ?? ''
			const rawSize = Number(file.size)
			const sizeBytes = Number.isFinite(rawSize) && rawSize >= 0 ? Math.floor(rawSize) : 0
			const mimetype = file.mimetype ?? ''
			const isProtected = file.isInOriginFolder ? 'true' : 'false'

			const row = [
				groupId,
				hash,
				status,
				fileId,
				path,
				sizeBytes,
				mimetype,
				isProtected,
			]
			lines.push(row.map(escapeCsvCell).join(','))
		}
	}

	return lines.join('\r\n')
}

/**
 * Trigger a client-side CSV download for the provided filtered duplicate groups
 * using a Blob and a temporary anchor element.
 *
 * @param {Array<object>} duplicates - Filtered duplicate group objects.
 * @param {string} [filename='duplicates-export.csv'] - Suggested download filename.
 * @return {boolean} True when a download was triggered, false otherwise.
 */
export function downloadDuplicatesCsv(duplicates, filename = 'duplicates-export.csv') {
	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return false
	}
	if (
		typeof document === 'undefined'
		|| typeof Blob === 'undefined'
		|| typeof URL === 'undefined'
		|| typeof URL.createObjectURL !== 'function'
	) {
		return false
	}

	const csvContent = buildDuplicatesCsv(duplicates)
	const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.setAttribute('download', filename)
	link.style.display = 'none'
	document.body.appendChild(link)
	try {
		link.click()
	} finally {
		document.body.removeChild(link)
		if (typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(url)
		}
	}
	return true
}
