/**
 * Pure cross-group batch auto-selection rules and reference-anchor engine.
 * Combines Czkawka automated selection rules, dupeGuru reference anchor locking,
 * and Nextcloud Files batch triage safety invariants.
 */

import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { formatBytes } from './duplicateStats'

export const BATCH_RULE_IDS = Object.freeze([
	'keep_oldest',
	'keep_newest',
	'keep_shortest_path',
	'keep_deepest_path',
	'keep_preferred_folder',
	'mark_pattern_matches',
])

export const BATCH_SCOPES = Object.freeze([
	'filtered',
	'all',
])

export const BATCH_PLAN_SCHEMA = 'duplicatefinder.batch-plan.v1'

export const BATCH_PATTERN_PRESETS = Object.freeze([
	{ id: 'copy_paren', pattern: '* (1)*', label: '* (1)*' },
	{ id: 'copy_word', pattern: '*copy*', label: '*copy*' },
	{ id: 'downloads', pattern: '*/Downloads/*', label: '*/Downloads/*' },
	{ id: 'backups', pattern: '*/Backup*/*', label: '*/Backup*/*' },
	{ id: 'temp', pattern: '*/Temp/*', label: '*/Temp/*' },
])

const MAX_PATTERN_LENGTH = 200
const ALLOWED_REGEX_FLAGS = new Set(['i', 'm', 'u'])

/**
 * Parse a timestamp field (number, numeric string, Date, or ISO string) to milliseconds.
 *
 * @param {*} value Raw timestamp candidate.
 * @return {number|null} Finite timestamp or null.
 */
function parseTimestampValue(value) {
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
 * Extract the best modification timestamp from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Timestamp or null when unavailable.
 */
function getFileMtime(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const parsed = parseTimestampValue(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Normalize a folder prefix for boundary-safe matching against normalized display paths.
 *
 * @param {string|null|undefined} rawFolder Raw folder input.
 * @return {string} Normalized folder prefix starting with '/', or empty string.
 */
export function normalizeFolderPrefix(rawFolder) {
	if (typeof rawFolder !== 'string') {
		return ''
	}
	const trimmed = rawFolder.trim()
	if (!trimmed) {
		return ''
	}
	const displayPath = normalizePathForDiff(trimmed).replace(/\\/g, '/').replace(/\/+/g, '/')
	const withSlash = displayPath.startsWith('/') ? displayPath : `/${displayPath}`
	const withoutTrailing = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash
	return withoutTrailing
}

/**
 * Extract the normalized display parent folder for a file entry.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @return {string} Normalized folder path or empty string.
 */
export function getNormalizedFileFolder(file) {
	if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
		return ''
	}
	const displayPath = normalizePathForDiff(file.path)
	if (!displayPath) {
		return ''
	}
	const slashIndex = displayPath.lastIndexOf('/')
	if (slashIndex <= 0) {
		return '/'
	}
	return displayPath.slice(0, slashIndex)
}

/**
 * Extract the basename from a file path.
 *
 * @param {string|null|undefined} filePath Raw path.
 * @return {string} Basename or empty string.
 */
function getBasename(filePath) {
	if (typeof filePath !== 'string') {
		return ''
	}
	const clean = filePath.replace(/\\/g, '/')
	const idx = clean.lastIndexOf('/')
	return idx >= 0 ? clean.slice(idx + 1) : clean
}

/**
 * Check whether a normalized file path belongs to a normalized folder prefix (boundary-safe).
 *
 * @param {string} displayPath Normalized file display path.
 * @param {string} folderPrefix Normalized folder prefix.
 * @return {boolean} True when file is inside the folder prefix.
 */
export function isPathInFolderPrefix(displayPath, folderPrefix) {
	if (!displayPath || !folderPrefix) {
		return false
	}
	const pathLower = displayPath.toLowerCase()
	const prefixLower = folderPrefix.toLowerCase()
	if (prefixLower === '/') {
		return pathLower.startsWith('/')
	}
	return pathLower === prefixLower || pathLower.startsWith(`${prefixLower}/`)
}

/**
 * Compile a user-entered glob, regex (/pattern/flags), or substring pattern safely.
 *
 * @param {string|null|undefined} rawPattern Raw user pattern.
 * @return {{ valid: boolean, mode: 'empty'|'glob'|'regex'|'substring', regex: RegExp|null, error: string }} Compilation result.
 */
export function compileBatchPathPattern(rawPattern) {
	if (typeof rawPattern !== 'string') {
		return { valid: false, mode: 'empty', regex: null, error: '' }
	}
	const trimmed = rawPattern.trim()
	if (!trimmed) {
		return { valid: false, mode: 'empty', regex: null, error: '' }
	}
	if (trimmed.length > MAX_PATTERN_LENGTH) {
		return {
			valid: false,
			mode: 'regex',
			regex: null,
			error: `Pattern exceeds ${MAX_PATTERN_LENGTH} characters`,
		}
	}

	if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
		const lastSlash = trimmed.lastIndexOf('/')
		const body = trimmed.slice(1, lastSlash)
		const rawFlags = trimmed.slice(lastSlash + 1)
		if (!body) {
			return {
				valid: false,
				mode: 'regex',
				regex: null,
				error: 'Empty regular expression',
			}
		}
		const flagChars = []
		for (const ch of rawFlags) {
			if (!ALLOWED_REGEX_FLAGS.has(ch)) {
				return {
					valid: false,
					mode: 'regex',
					regex: null,
					error: `Unsupported regex flag: ${ch}`,
				}
			}
			if (!flagChars.includes(ch)) {
				flagChars.push(ch)
			}
		}
		try {
			return {
				valid: true,
				mode: 'regex',
				regex: new RegExp(body, flagChars.join('')),
				error: '',
			}
		} catch (error) {
			return {
				valid: false,
				mode: 'regex',
				regex: null,
				error: error && error.message ? error.message : 'Invalid regular expression',
			}
		}
	}

	const hasGlob = /[*?]/.test(trimmed)
	if (hasGlob) {
		const escaped = trimmed.replace(/[.+^${}()|[\]\\]/g, '\\$&')
		const regexSource = escaped.replace(/\*/g, '.*').replace(/\?/g, '.')
		try {
			const hasSlash = trimmed.includes('/') || trimmed.includes('\\')
			const anchorRegex = hasSlash
				? new RegExp(regexSource, 'i')
				: new RegExp(`^${regexSource}$`, 'i')
			return {
				valid: true,
				mode: 'glob',
				regex: anchorRegex,
				error: '',
			}
		} catch (error) {
			return {
				valid: false,
				mode: 'glob',
				regex: null,
				error: 'Invalid glob pattern',
			}
		}
	}

	const escapedSubstring = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return {
		valid: true,
		mode: 'substring',
		regex: new RegExp(escapedSubstring, 'i'),
		error: '',
	}
}

/**
 * Evaluate whether a file entry matches a compiled pattern against its display path or basename.
 *
 * @param {object} file Duplicate file entry.
 * @param {{ valid: boolean, mode: string, regex: RegExp|null }} compiled Compiled pattern descriptor.
 * @return {boolean} True when matched.
 */
export function doesFileMatchCompiledPattern(file, compiled) {
	if (!file || typeof file !== 'object' || !compiled || !compiled.valid || !compiled.regex) {
		return false
	}
	const displayPath = normalizePathForDiff(file.path || '')
	const basename = getBasename(displayPath || file.path || '')
	if (compiled.mode === 'glob' && !displayPath.includes('/')) {
		return compiled.regex.test(basename)
	}
	if (compiled.mode === 'glob') {
		return compiled.regex.test(basename) || compiled.regex.test(displayPath)
	}
	return compiled.regex.test(displayPath) || compiled.regex.test(basename)
}

/**
 * Deterministic comparator by normalized display path then selection key.
 *
 * @param {object} a First file entry.
 * @param {object} b Second file entry.
 * @return {number} Negative if a < b, positive if a > b, 0 if equal.
 */
function compareFilesByPath(a, b) {
	const pathA = normalizePathForDiff(a.path || '')
	const pathB = normalizePathForDiff(b.path || '')
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
 * Compare two files according to a deterministic anchor selection rule.
 *
 * @param {object} a First file entry.
 * @param {object} b Second file entry.
 * @param {'keep_oldest'|'keep_newest'|'keep_shortest_path'|'keep_deepest_path'} strategy Strategy name.
 * @return {number} Comparator result (< 0 means `a` is preferred as kept anchor).
 */
function compareFilesForStrategy(a, b, strategy) {
	if (strategy === 'keep_shortest_path' || strategy === 'keep_deepest_path') {
		const pathA = normalizePathForDiff(a.path || '')
		const pathB = normalizePathForDiff(b.path || '')
		const lenA = pathA ? pathA.length : (strategy === 'keep_shortest_path' ? Number.POSITIVE_INFINITY : -1)
		const lenB = pathB ? pathB.length : (strategy === 'keep_shortest_path' ? Number.POSITIVE_INFINITY : -1)
		if (lenA !== lenB) {
			return strategy === 'keep_shortest_path' ? lenA - lenB : lenB - lenA
		}
		return compareFilesByPath(a, b)
	}

	const tsA = getFileMtime(a)
	const tsB = getFileMtime(b)
	if (tsA !== null && tsB !== null && tsA !== tsB) {
		return strategy === 'keep_newest' ? tsB - tsA : tsA - tsB
	}
	if (tsA !== null && tsB === null) {
		return -1
	}
	if (tsA === null && tsB !== null) {
		return 1
	}
	return compareFilesByPath(a, b)
}

/**
 * Extract sorted candidate parent folders across a set of duplicate groups.
 *
 * @param {Array<object>} groups Duplicate groups.
 * @param {number} [limit] Maximum number of folders to return.
 * @return {Array<{ folder: string, groupCount: number }>} Candidate folder summaries.
 */
export function extractCandidateFolders(groups, limit = 12) {
	if (!Array.isArray(groups) || groups.length === 0) {
		return []
	}
	const counts = new Map()
	for (const group of groups) {
		const files = Array.isArray(group && group.files) ? group.files : []
		const groupFolders = new Set()
		for (const file of files) {
			const folder = getNormalizedFileFolder(file)
			if (folder) {
				groupFolders.add(folder)
			}
		}
		for (const folder of groupFolders) {
			counts.set(folder, (counts.get(folder) || 0) + 1)
		}
	}
	const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 12
	return Array.from(counts.entries())
		.map(([folder, groupCount]) => ({ folder, groupCount }))
		.sort((a, b) => b.groupCount - a.groupCount || a.folder.localeCompare(b.folder))
		.slice(0, safeLimit)
}

/**
 * Resolve a stable group key from a duplicate group object.
 *
 * @param {object|null|undefined} group Duplicate group.
 * @return {string} Stable group identifier.
 */
export function getBatchGroupKey(group) {
	if (!group || typeof group !== 'object') {
		return ''
	}
	if (group.id !== null && group.id !== undefined && group.id !== '') {
		return String(group.id)
	}
	if (typeof group.hash === 'string' && group.hash) {
		return group.hash
	}
	return ''
}

/**
 * Derive a readable display title for a duplicate group.
 *
 * @param {object|null|undefined} group Duplicate group.
 * @return {string} Display title.
 */
export function getBatchGroupName(group) {
	const files = Array.isArray(group && group.files) ? group.files : []
	if (files.length === 0) {
		return 'Duplicate group'
	}
	const name = getBasename(files[0].path || files[0].name || '')
	return name || 'Duplicate group'
}

/**
 * Evaluate a single duplicate group against a batch auto-select rule while enforcing
 * all safety invariants (protected origin files never selected, at least 1 surviving copy).
 *
 * @param {object} group Duplicate group with files array.
 * @param {object} [options] Rule and override options.
 * @return {object} Evaluated group plan entry.
 */
export function evaluateGroupForBatch(group, options = {}) {
	const files = Array.isArray(group && group.files)
		? group.files.filter(file => file && typeof file === 'object')
		: []
	const groupKey = getBatchGroupKey(group)
	const groupName = getBatchGroupName(group)
	const rule = BATCH_RULE_IDS.includes(options.rule) ? options.rule : 'keep_oldest'
	const includeAcknowledged = Boolean(options.includeAcknowledged)
	const manualAnchorKey = options.manualAnchorKey !== undefined && options.manualAnchorKey !== null
		? String(options.manualAnchorKey)
		: ''
	const excludedSet = options.excludedFileKeys instanceof Set
		? options.excludedFileKeys
		: new Set(Array.isArray(options.excludedFileKeys) ? options.excludedFileKeys.map(String) : [])

	if (files.length <= 1) {
		return {
			groupKey,
			groupId: group && group.id !== undefined ? group.id : null,
			hash: group && typeof group.hash === 'string' ? group.hash : '',
			groupName,
			acknowledged: Boolean(group && group.acknowledged),
			status: 'no_rule_match',
			anchorFile: files[0] || null,
			anchorKey: files[0] ? String(getFileSelectionKey(files[0]) ?? '') : '',
			anchorReason: 'single_copy',
			hasManualAnchor: false,
			markedFiles: [],
			keptFiles: files.slice(),
			allFiles: files.slice(),
			totalFiles: files.length,
			groupReclaimableBytes: 0,
			rawGroup: group,
		}
	}

	if (group && group.acknowledged && !includeAcknowledged) {
		return {
			groupKey,
			groupId: group.id !== undefined ? group.id : null,
			hash: typeof group.hash === 'string' ? group.hash : '',
			groupName,
			acknowledged: true,
			status: 'skipped_acknowledged',
			anchorFile: files[0],
			anchorKey: String(getFileSelectionKey(files[0]) ?? ''),
			anchorReason: 'acknowledged',
			hasManualAnchor: false,
			markedFiles: [],
			keptFiles: files.slice(),
			allFiles: files.slice(),
			totalFiles: files.length,
			groupReclaimableBytes: 0,
			rawGroup: group,
		}
	}

	const protectedFiles = files.filter(file => Boolean(file.isInOriginFolder))
	const deletableFiles = files.filter(file => !file.isInOriginFolder)

	if (deletableFiles.length === 0) {
		return {
			groupKey,
			groupId: group && group.id !== undefined ? group.id : null,
			hash: group && typeof group.hash === 'string' ? group.hash : '',
			groupName,
			acknowledged: Boolean(group && group.acknowledged),
			status: 'protected_only',
			anchorFile: protectedFiles[0] || files[0],
			anchorKey: String(getFileSelectionKey(protectedFiles[0] || files[0]) ?? ''),
			anchorReason: 'protected',
			hasManualAnchor: false,
			markedFiles: [],
			keptFiles: files.slice(),
			allFiles: files.slice(),
			totalFiles: files.length,
			groupReclaimableBytes: 0,
			rawGroup: group,
		}
	}

	let anchorFile = null
	let anchorReason = 'oldest'
	let hasManualAnchor = false
	let candidateMarked = []
	let status = 'matched'

	const manualMatch = manualAnchorKey
		? files.find(file => String(getFileSelectionKey(file) ?? '') === manualAnchorKey)
		: null

	if (manualMatch) {
		anchorFile = manualMatch
		anchorReason = manualMatch.isInOriginFolder ? 'protected' : 'manual'
		hasManualAnchor = !manualMatch.isInOriginFolder
	} else if (protectedFiles.length > 0 && rule !== 'mark_pattern_matches' && rule !== 'keep_preferred_folder') {
		const sortedProtected = protectedFiles.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))
		anchorFile = sortedProtected[0]
		anchorReason = 'protected'
	}

	if (rule === 'keep_preferred_folder') {
		const folderPrefix = normalizeFolderPrefix(options.preferredFolder || '')
		const requireFolderMatch = options.requireFolderMatch !== false
		if (!folderPrefix) {
			status = 'no_rule_match'
			anchorFile = anchorFile || protectedFiles[0] || files[0]
			anchorReason = protectedFiles.length > 0 ? 'protected' : 'none'
			candidateMarked = []
		} else {
			const inFolder = files.filter(file => isPathInFolderPrefix(normalizePathForDiff(file.path || ''), folderPrefix))
			if (inFolder.length > 0) {
				if (!anchorFile) {
					const sortedInFolder = inFolder.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))
					anchorFile = sortedInFolder[0]
					anchorReason = anchorFile.isInOriginFolder ? 'protected' : 'preferred_folder'
				}
				const anchorKey = String(getFileSelectionKey(anchorFile) ?? '')
				candidateMarked = deletableFiles.filter(file => {
					const key = String(getFileSelectionKey(file) ?? '')
					if (key === anchorKey) {
						return false
					}
					if (hasManualAnchor) {
						return true
					}
					return !isPathInFolderPrefix(normalizePathForDiff(file.path || ''), folderPrefix)
				})
				if (candidateMarked.length === 0) {
					status = 'no_rule_match'
				}
			} else if (requireFolderMatch && !hasManualAnchor) {
				status = 'no_rule_match'
				anchorFile = anchorFile || protectedFiles[0] || files[0]
				anchorReason = protectedFiles.length > 0 ? 'protected' : 'no_folder_match'
				candidateMarked = []
			} else {
				if (!anchorFile) {
					const sortedFallback = files.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))
					anchorFile = sortedFallback[0]
					anchorReason = anchorFile.isInOriginFolder ? 'protected' : 'oldest_fallback'
				}
				const anchorKey = String(getFileSelectionKey(anchorFile) ?? '')
				candidateMarked = deletableFiles.filter(file => String(getFileSelectionKey(file) ?? '') !== anchorKey)
			}
		}
	} else if (rule === 'mark_pattern_matches') {
		const compiled = options.compiledPattern || compileBatchPathPattern(options.pattern || '')
		if (!compiled.valid) {
			status = 'no_rule_match'
			anchorFile = anchorFile || protectedFiles[0] || files[0]
			anchorReason = protectedFiles.length > 0 ? 'protected' : 'none'
			candidateMarked = []
		} else {
			const matchingFiles = files.filter(file => doesFileMatchCompiledPattern(file, compiled))
			const nonMatchingFiles = files.filter(file => !doesFileMatchCompiledPattern(file, compiled))
			if (!anchorFile) {
				if (protectedFiles.length > 0) {
					const nonMatchingProtected = protectedFiles.filter(file => !doesFileMatchCompiledPattern(file, compiled))
					const pool = nonMatchingProtected.length > 0 ? nonMatchingProtected : protectedFiles
					anchorFile = pool.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))[0]
					anchorReason = 'protected'
				} else if (nonMatchingFiles.length > 0) {
					anchorFile = nonMatchingFiles.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))[0]
					anchorReason = 'pattern_preserved'
				} else {
					anchorFile = files.slice().sort((a, b) => compareFilesForStrategy(a, b, 'keep_oldest'))[0]
					anchorReason = 'pattern_preserved'
				}
			}
			const anchorKey = String(getFileSelectionKey(anchorFile) ?? '')
			candidateMarked = matchingFiles.filter(file => {
				if (file.isInOriginFolder) {
					return false
				}
				return String(getFileSelectionKey(file) ?? '') !== anchorKey
			})
			if (candidateMarked.length === 0) {
				status = 'no_rule_match'
			}
		}
	} else {
		if (!anchorFile) {
			const sorted = files.slice().sort((a, b) => compareFilesForStrategy(a, b, rule))
			anchorFile = sorted[0]
			anchorReason = rule.replace(/^keep_/, '')
		}
		const anchorKey = String(getFileSelectionKey(anchorFile) ?? '')
		candidateMarked = deletableFiles.filter(file => String(getFileSelectionKey(file) ?? '') !== anchorKey)
	}

	const markedFiles = candidateMarked.filter(file => {
		const key = String(getFileSelectionKey(file) ?? '')
		return !excludedSet.has(key)
	})

	// Hard safety invariant: always keep at least one surviving copy per group
	if (markedFiles.length >= files.length) {
		markedFiles.pop()
	}

	const markedKeySet = new Set(markedFiles.map(file => String(getFileSelectionKey(file) ?? '')))
	const keptFiles = files.filter(file => !markedKeySet.has(String(getFileSelectionKey(file) ?? '')))
	const groupReclaimableBytes = markedFiles.reduce(
		(sum, file) => sum + (Number(file.size) > 0 ? Math.floor(Number(file.size)) : 0),
		0
	)

	if (status === 'matched' && candidateMarked.length === 0) {
		status = 'no_rule_match'
	}

	return {
		groupKey,
		groupId: group && group.id !== undefined ? group.id : null,
		hash: group && typeof group.hash === 'string' ? group.hash : '',
		groupName,
		acknowledged: Boolean(group && group.acknowledged),
		status,
		anchorFile,
		anchorKey: anchorFile ? String(getFileSelectionKey(anchorFile) ?? '') : '',
		anchorReason,
		hasManualAnchor,
		markedFiles,
		keptFiles,
		allFiles: files.slice(),
		totalFiles: files.length,
		groupReclaimableBytes,
		rawGroup: group,
	}
}

/**
 * Build a complete cross-group batch auto-select dry-run plan with summary metrics.
 *
 * @param {Array<object>} groups Candidate duplicate groups.
 * @param {object} [options] Batch rule configuration and overrides.
 * @return {object} Evaluated plan, summary totals, candidate folders, and pattern validation.
 */
export function buildBatchAutoSelectPlan(groups, options = {}) {
	const safeGroups = Array.isArray(groups)
		? groups.filter(group => group && typeof group === 'object')
		: []
	const rule = BATCH_RULE_IDS.includes(options.rule) ? options.rule : 'keep_oldest'
	const compiledPattern = rule === 'mark_pattern_matches'
		? compileBatchPathPattern(options.pattern || '')
		: { valid: true, mode: 'empty', regex: null, error: '' }
	const manualAnchorsByGroup = options.manualAnchorsByGroup && typeof options.manualAnchorsByGroup === 'object'
		? options.manualAnchorsByGroup
		: {}
	const excludedFileKeysByGroup = options.excludedFileKeysByGroup && typeof options.excludedFileKeysByGroup === 'object'
		? options.excludedFileKeysByGroup
		: {}
	const minCopies = Number.isFinite(Number(options.minCopies)) && Number(options.minCopies) >= 2
		? Math.floor(Number(options.minCopies))
		: 2

	const evaluatedGroups = []
	let matchedGroupCount = 0
	let protectedOnlyGroupCount = 0
	let skippedAcknowledgedCount = 0
	let noMatchGroupCount = 0
	let markedFileCount = 0
	let keptFileCount = 0
	let reclaimableBytes = 0

	for (const group of safeGroups) {
		const filesCount = Array.isArray(group.files) ? group.files.length : 0
		if (filesCount < minCopies) {
			continue
		}
		const groupKey = getBatchGroupKey(group)
		const evaluated = evaluateGroupForBatch(group, {
			rule,
			preferredFolder: options.preferredFolder || '',
			requireFolderMatch: options.requireFolderMatch !== false,
			pattern: options.pattern || '',
			compiledPattern,
			includeAcknowledged: Boolean(options.includeAcknowledged),
			manualAnchorKey: groupKey ? manualAnchorsByGroup[groupKey] : undefined,
			excludedFileKeys: groupKey ? excludedFileKeysByGroup[groupKey] : undefined,
		})
		evaluatedGroups.push(evaluated)

		if (evaluated.status === 'matched') {
			if (evaluated.markedFiles.length > 0) {
				matchedGroupCount += 1
			} else {
				noMatchGroupCount += 1
			}
		} else if (evaluated.status === 'protected_only') {
			protectedOnlyGroupCount += 1
		} else if (evaluated.status === 'skipped_acknowledged') {
			skippedAcknowledgedCount += 1
		} else {
			noMatchGroupCount += 1
		}

		markedFileCount += evaluated.markedFiles.length
		keptFileCount += evaluated.keptFiles.length
		reclaimableBytes += evaluated.groupReclaimableBytes
	}

	return {
		rule,
		patternValidation: compiledPattern,
		availableFolders: extractCandidateFolders(safeGroups),
		groups: evaluatedGroups,
		summary: {
			totalGroupsEvaluated: evaluatedGroups.length,
			matchedGroupCount,
			protectedOnlyGroupCount,
			skippedAcknowledgedCount,
			noMatchGroupCount,
			markedFileCount,
			keptFileCount,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
		},
	}
}

/**
 * Build a structured JSON export payload for a batch auto-select plan.
 *
 * @param {object} plan Output from buildBatchAutoSelectPlan.
 * @param {object} [meta] Optional metadata (scope, rule, timestamp).
 * @return {string} Formatted JSON string.
 */
export function buildBatchPlanJson(plan, meta = {}) {
	const safePlan = plan && typeof plan === 'object' ? plan : { groups: [], summary: {} }
	const entries = Array.isArray(safePlan.groups)
		? safePlan.groups
			.filter(entry => entry.markedFiles && entry.markedFiles.length > 0)
			.map(entry => ({
				groupId: entry.groupId,
				hash: entry.hash,
				groupName: entry.groupName,
				anchorReason: entry.anchorReason,
				keptReference: entry.anchorFile ? normalizePathForDiff(entry.anchorFile.path || '') : '',
				keptCount: entry.keptFiles.length,
				markedForDeletion: entry.markedFiles.map(file => ({
					id: file.id ?? null,
					nodeId: file.nodeId ?? null,
					path: normalizePathForDiff(file.path || ''),
					size: Number(file.size) || 0,
					modified: formatFileModifiedTime(file),
				})),
				reclaimableBytes: entry.groupReclaimableBytes,
			}))
		: []

	return JSON.stringify({
		schema: BATCH_PLAN_SCHEMA,
		exportedAt: typeof meta.exportedAt === 'string' ? meta.exportedAt : new Date().toISOString(),
		rule: safePlan.rule || 'keep_oldest',
		scope: meta.scope || 'filtered',
		summary: safePlan.summary || {},
		groups: entries,
	}, null, 2)
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV export for a batch auto-select plan.
 *
 * @param {object} plan Output from buildBatchAutoSelectPlan.
 * @return {string} CSV document string.
 */
export function buildBatchPlanCsv(plan) {
	const headers = [
		'group_hash',
		'group_name',
		'action',
		'anchor_reason',
		'file_path',
		'size_bytes',
		'modified',
		'protected_origin',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	const groups = Array.isArray(plan && plan.groups) ? plan.groups : []
	for (const group of groups) {
		if (!group || !Array.isArray(group.markedFiles) || group.markedFiles.length === 0) {
			continue
		}
		for (const file of group.keptFiles || []) {
			rows.push([
				group.hash || '',
				group.groupName || '',
				'KEEP',
				group.anchorReason || '',
				normalizePathForDiff(file.path || ''),
				Number(file.size) || 0,
				formatFileModifiedTime(file) || '',
				file.isInOriginFolder ? 'yes' : 'no',
			].map(escapeCsvCell).join(','))
		}
		for (const file of group.markedFiles) {
			rows.push([
				group.hash || '',
				group.groupName || '',
				'DELETE_CANDIDATE',
				group.anchorReason || '',
				normalizePathForDiff(file.path || ''),
				Number(file.size) || 0,
				formatFileModifiedTime(file) || '',
				file.isInOriginFolder ? 'yes' : 'no',
			].map(escapeCsvCell).join(','))
		}
	}
	return rows.join('\r\n')
}
