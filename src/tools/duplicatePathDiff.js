/**
 * Pure Beyond Compare-inspired path diffing and modified-timestamp formatting
 * helpers for faster, safer duplicate file comparison.
 */

const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

/**
 * Normalize a Nextcloud file path by stripping the leading `/<user>/files` prefix
 * when present while keeping relative or plain paths intact.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {string} Normalized path string, or empty string when missing/invalid.
 */
export function normalizePathForDiff(rawPath) {
	if (typeof rawPath !== 'string' || rawPath.trim() === '') {
		return ''
	}
	const stripped = rawPath.replace(/^\/[^/]+\/files(?=\/|$)/, '')
	if (stripped === '' && /^\/[^/]+\/files$/.test(rawPath)) {
		return '/'
	}
	return stripped
}

/**
 * Parse a normalized path into directory tokens and filename while preserving
 * exact leading-slash structure for lossless segment reconstruction.
 *
 * @param {string} normalizedPath - Normalized path string.
 * @return {{ hasLeadingSlash: boolean, dirTokens: string[], fileName: string }}
 */
function parseNormalizedPath(normalizedPath) {
	const lastSlashIndex = normalizedPath.lastIndexOf('/')
	const hasLeadingSlash = normalizedPath.startsWith('/')

	if (lastSlashIndex === -1) {
		return {
			hasLeadingSlash: false,
			dirTokens: [],
			fileName: normalizedPath,
		}
	}

	if (lastSlashIndex === 0) {
		return {
			hasLeadingSlash: true,
			dirTokens: [],
			fileName: normalizedPath.slice(1),
		}
	}

	const dirPart = normalizedPath.slice(0, lastSlashIndex)
	const dirTokens = (hasLeadingSlash ? dirPart.slice(1) : dirPart).split('/')

	return {
		hasLeadingSlash,
		dirTokens,
		fileName: normalizedPath.slice(lastSlashIndex + 1),
	}
}

/**
 * Append a typed segment, merging adjacent segments of identical kind to keep DOM lean.
 *
 * @param {Array<{ text: string, kind: 'common'|'diff'|'filename' }>} segments - Target array.
 * @param {string} text - Segment text.
 * @param {'common'|'diff'|'filename'} kind - Segment classification.
 */
function pushSegment(segments, text, kind) {
	if (!text) {
		return
	}
	if (segments.length > 0 && segments[segments.length - 1].kind === kind) {
		segments[segments.length - 1].text += text
		return
	}
	segments.push({ text, kind })
}

/**
 * Compute Beyond Compare-style path diff segments across a duplicate group.
 * Concatenating segment.text values for each valid file always reproduces its
 * exact normalized path losslessly.
 *
 * @param {Array<object>|null|undefined} files - Duplicate group file entries.
 * @return {Array<Array<{ text: string, kind: 'common'|'diff'|'filename' }>>} Segments aligned 1:1 with input files.
 */
export function computePathDiffSegments(files) {
	if (!Array.isArray(files) || files.length === 0) {
		return []
	}

	const parsedEntries = files.map(file => {
		const normalizedPath = normalizePathForDiff(file && file.path)
		if (!normalizedPath) {
			return null
		}
		return {
			normalizedPath,
			...parseNormalizedPath(normalizedPath),
		}
	})

	const validEntries = parsedEntries.filter(Boolean)
	if (validEntries.length === 0) {
		return parsedEntries.map(() => [])
	}

	if (validEntries.length === 1) {
		return parsedEntries.map(entry => {
			if (!entry) {
				return []
			}
			const segments = []
			if (entry.dirTokens.length > 0) {
				pushSegment(
					segments,
					`${entry.hasLeadingSlash ? '/' : ''}${entry.dirTokens.join('/')}/`,
					'common'
				)
			} else if (entry.hasLeadingSlash) {
				pushSegment(segments, '/', 'common')
			}
			if (entry.fileName) {
				pushSegment(segments, entry.fileName, 'filename')
			}
			return segments
		})
	}

	const firstEntry = validEntries[0]
	const minDirLen = Math.min(...validEntries.map(entry => entry.dirTokens.length))

	let commonPrefixLen = 0
	for (let i = 0; i < minDirLen; i++) {
		const candidate = firstEntry.dirTokens[i]
		if (validEntries.every(entry => entry.dirTokens[i] === candidate)) {
			commonPrefixLen += 1
		} else {
			break
		}
	}

	let commonSuffixLen = 0
	const maxSuffixLen = minDirLen - commonPrefixLen
	for (let i = 0; i < maxSuffixLen; i++) {
		const candidate = firstEntry.dirTokens[firstEntry.dirTokens.length - 1 - i]
		if (validEntries.every(entry => entry.dirTokens[entry.dirTokens.length - 1 - i] === candidate)) {
			commonSuffixLen += 1
		} else {
			break
		}
	}

	const allSameFilename = validEntries.every(entry => entry.fileName === firstEntry.fileName)

	return parsedEntries.map(entry => {
		if (!entry) {
			return []
		}
		const segments = []
		const prefixTokens = entry.dirTokens.slice(0, commonPrefixLen)
		const diffTokens = entry.dirTokens.slice(commonPrefixLen, entry.dirTokens.length - commonSuffixLen)
		const suffixTokens = entry.dirTokens.slice(entry.dirTokens.length - commonSuffixLen)

		let wrotePrefixOrDir = false

		if (prefixTokens.length > 0) {
			pushSegment(
				segments,
				`${entry.hasLeadingSlash ? '/' : ''}${prefixTokens.join('/')}`,
				'common'
			)
			wrotePrefixOrDir = true
		}

		if (diffTokens.length > 0) {
			const needsSlash = wrotePrefixOrDir || entry.hasLeadingSlash
			pushSegment(
				segments,
				`${needsSlash ? '/' : ''}${diffTokens.join('/')}`,
				'diff'
			)
			wrotePrefixOrDir = true
		}

		if (suffixTokens.length > 0) {
			const needsSlash = wrotePrefixOrDir || entry.hasLeadingSlash
			pushSegment(
				segments,
				`${needsSlash ? '/' : ''}${suffixTokens.join('/')}`,
				'common'
			)
			wrotePrefixOrDir = true
		}

		if (wrotePrefixOrDir || entry.hasLeadingSlash) {
			pushSegment(segments, '/', 'common')
		}

		if (entry.fileName) {
			pushSegment(segments, entry.fileName, allSameFilename ? 'filename' : 'diff')
		}

		return segments
	})
}

/**
 * Parse a timestamp value into milliseconds since Unix epoch.
 * Positive numeric values below 1e11 are treated as Unix seconds.
 *
 * @param {*} value - Candidate timestamp field.
 * @return {number|null} Millisecond epoch timestamp or null when invalid/non-positive.
 */
function parseEpochMilliseconds(value) {
	if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) && ms > 0 ? ms : null
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value) || value <= 0) {
			return null
		}
		return value < 1e11 ? Math.round(value * 1000) : Math.round(value)
	}
	if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return null
			}
			return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric)
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) && parsed > 0 ? parsed : null
	}
	return null
}

/**
 * Format a file entry's modification timestamp as `YYYY-MM-DD HH:mm` for compact
 * tabular comparison, or empty string when unavailable/invalid.
 *
 * @param {object|null|undefined} file - Duplicate file entry.
 * @return {string} Formatted timestamp or empty string.
 */
export function formatFileModifiedTime(file) {
	if (!file || typeof file !== 'object') {
		return ''
	}

	let epochMs = null
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			epochMs = parseEpochMilliseconds(file[field])
			if (epochMs !== null) {
				break
			}
		}
	}

	if (epochMs === null) {
		return ''
	}

	const date = new Date(epochMs)
	if (Number.isNaN(date.getTime())) {
		return ''
	}

	const pad2 = n => String(n).padStart(2, '0')
	const year = date.getFullYear()
	const month = pad2(date.getMonth() + 1)
	const day = pad2(date.getDate())
	const hours = pad2(date.getHours())
	const minutes = pad2(date.getMinutes())

	return `${year}-${month}-${day} ${hours}:${minutes}`
}
