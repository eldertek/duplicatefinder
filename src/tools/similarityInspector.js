/**
 * Pure fuzzy similarity matching, threshold clustering, and live group merge
 * impact analysis helpers inspired by dupeGuru and Czkawka.
 */

import { classifyFileCategory, extractFileExtension } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const SIMILARITY_MODES = Object.freeze([
	'hybrid',
	'levenshtein',
	'token',
	'path-size',
])

export const DEFAULT_SIMILARITY_MODE = 'hybrid'
export const DEFAULT_SIMILARITY_THRESHOLD = 75
export const MIN_SIMILARITY_THRESHOLD = 50
export const MAX_SIMILARITY_THRESHOLD = 100
export const MAX_GROUPS_FOR_PAIRWISE = 150

export const SIMILARITY_PRESETS = Object.freeze([
	{ id: 'strict', threshold: 90 },
	{ id: 'balanced', threshold: 75 },
	{ id: 'broad', threshold: 60 },
])

const COPY_SUFFIX_PATTERNS = [
	/(?:[\s._-]+)(?:copy|copie|dup|duplicate|backup|bak|final|edited|edit|compressed|resized)(?:[\s._-]*\d+)?$/i,
	/(?:[\s._-]+)v\d+$/i,
	/\s*\(\d+\)$/,
	/\s*\[\d+\]$/,
	/[_-]\d{1,2}$/,
]

/**
 * Clamp a similarity threshold cleanly into [50, 100].
 *
 * @param {number|string} value - Candidate threshold value.
 * @return {number} Integer threshold in [50, 100].
 */
export function clampSimilarityThreshold(value) {
	if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
		return DEFAULT_SIMILARITY_THRESHOLD
	}
	const parsed = Number(value)
	if (!Number.isFinite(parsed)) {
		return DEFAULT_SIMILARITY_THRESHOLD
	}
	return Math.min(MAX_SIMILARITY_THRESHOLD, Math.max(MIN_SIMILARITY_THRESHOLD, Math.round(parsed)))
}

/**
 * Normalize fuzzy similarity inspector options safely.
 *
 * @param {object|null|undefined} raw - Raw options object.
 * @return {{
 *   mode: string,
 *   threshold: number,
 *   ignoreCopySuffixes: boolean,
 *   sameCategoryOnly: boolean,
 *   categoryFilter: string,
 *   searchQuery: string
 * }} Normalized options.
 */
export function normalizeSimilarityOptions(raw = {}) {
	const input = raw && typeof raw === 'object' ? raw : {}
	const mode = SIMILARITY_MODES.includes(input.mode) ? input.mode : DEFAULT_SIMILARITY_MODE
	const threshold = clampSimilarityThreshold(input.threshold)
	const ignoreCopySuffixes = input.ignoreCopySuffixes !== false
	const sameCategoryOnly = Boolean(input.sameCategoryOnly)
	const categoryFilter = typeof input.categoryFilter === 'string' && input.categoryFilter.trim()
		? input.categoryFilter.trim().toLowerCase()
		: 'all'
	const searchQuery = typeof input.searchQuery === 'string'
		? input.searchQuery.trim().toLowerCase()
		: ''

	return {
		mode,
		threshold,
		ignoreCopySuffixes,
		sameCategoryOnly,
		categoryFilter,
		searchQuery,
	}
}

/**
 * Extract filename and directory folder from a raw file path.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {{ normalizedPath: string, fileName: string, folder: string, stem: string, extension: string }} Parsed parts.
 */
export function parsePathIdentity(rawPath) {
	const raw = typeof rawPath === 'string' ? rawPath.trim() : ''
	const normalizedPath = normalizePathForDiff(raw) || raw
	const slashIdx = normalizedPath.lastIndexOf('/')
	const fileName = slashIdx >= 0 ? normalizedPath.slice(slashIdx + 1) : normalizedPath
	const folder = slashIdx > 0
		? normalizedPath.slice(0, slashIdx)
		: (slashIdx === 0 ? '/' : '')
	const extension = extractFileExtension(fileName)
	const stem = extension && fileName.toLowerCase().endsWith(`.${extension}`)
		? fileName.slice(0, -(extension.length + 1))
		: fileName

	return {
		normalizedPath,
		fileName,
		folder,
		stem,
		extension,
	}
}

/**
 * Strip common copy/revision suffixes from a filename stem when enabled.
 *
 * @param {string} stem - Filename stem without extension.
 * @return {string} Normalized stem.
 */
export function stripCopySuffixes(stem) {
	if (typeof stem !== 'string' || !stem.trim()) {
		return ''
	}
	let current = stem.trim()
	let changed = true
	let guard = 0
	while (changed && guard < 4) {
		changed = false
		guard += 1
		for (const pattern of COPY_SUFFIX_PATTERNS) {
			const next = current.replace(pattern, '').trim()
			if (next && next !== current) {
				current = next
				changed = true
			}
		}
	}
	return current || stem.trim()
}

/**
 * Normalize a filename stem for fuzzy comparison.
 *
 * @param {string} stem - Raw filename stem.
 * @param {boolean} [ignoreCopySuffixes=true] - Whether to strip copy/version tags.
 * @return {string} Lowercased normalized stem.
 */
export function normalizeComparisonStem(stem, ignoreCopySuffixes = true) {
	if (typeof stem !== 'string' || !stem.trim()) {
		return ''
	}
	const base = ignoreCopySuffixes ? stripCopySuffixes(stem) : stem.trim()
	return base
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[\s._-]+/g, ' ')
		.trim()
}

/**
 * Split a filename stem or path segment into normalized comparison tokens.
 *
 * @param {string} value - Input string.
 * @return {string[]} Unique lowercase tokens.
 */
export function tokenizeForSimilarity(value) {
	if (typeof value !== 'string' || !value.trim()) {
		return []
	}
	const separated = value
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Za-z])(\d)/g, '$1 $2')
		.replace(/(\d)([A-Za-z])/g, '$1 $2')
		.toLowerCase()

	const rawTokens = separated.split(/[\s._\-/\\()[\]{},;:]+/)
	const unique = []
	const seen = new Set()
	for (const token of rawTokens) {
		const cleaned = token.trim()
		if (!cleaned || seen.has(cleaned)) {
			continue
		}
		seen.add(cleaned)
		unique.push(cleaned)
	}
	return unique
}

/**
 * Compute Levenshtein edit distance between two strings.
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @return {number} Edit distance.
 */
export function levenshteinDistance(a, b) {
	const left = typeof a === 'string' ? a : ''
	const right = typeof b === 'string' ? b : ''
	if (left === right) {
		return 0
	}
	if (!left.length) {
		return right.length
	}
	if (!right.length) {
		return left.length
	}

	const m = left.length
	const n = right.length
	let prev = new Array(n + 1)
	let curr = new Array(n + 1)

	for (let j = 0; j <= n; j += 1) {
		prev[j] = j
	}

	for (let i = 1; i <= m; i += 1) {
		curr[0] = i
		const leftChar = left.charCodeAt(i - 1)
		for (let j = 1; j <= n; j += 1) {
			const cost = leftChar === right.charCodeAt(j - 1) ? 0 : 1
			const deletion = prev[j] + 1
			const insertion = curr[j - 1] + 1
			const substitution = prev[j - 1] + cost
			curr[j] = Math.min(deletion, insertion, substitution)
		}
		const swap = prev
		prev = curr
		curr = swap
	}

	return prev[n]
}

/**
 * Compute normalized Levenshtein similarity percentage in [0, 100].
 *
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @return {number} Similarity percentage rounded to 1 decimal place.
 */
export function computeLevenshteinSimilarity(a, b) {
	const left = typeof a === 'string' ? a : ''
	const right = typeof b === 'string' ? b : ''
	if (!left && !right) {
		return 100
	}
	if (!left || !right) {
		return 0
	}
	const maxLen = Math.max(left.length, right.length)
	const dist = levenshteinDistance(left, right)
	return Math.round(((maxLen - dist) / maxLen) * 1000) / 10
}

/**
 * Compute token Jaccard + containment blend similarity in [0, 100].
 *
 * @param {string[]} tokensA - Tokens from first name.
 * @param {string[]} tokensB - Tokens from second name.
 * @return {number} Token similarity percentage rounded to 1 decimal place.
 */
export function computeTokenSimilarity(tokensA, tokensB) {
	const listA = Array.isArray(tokensA) ? tokensA : []
	const listB = Array.isArray(tokensB) ? tokensB : []
	if (listA.length === 0 && listB.length === 0) {
		return 100
	}
	if (listA.length === 0 || listB.length === 0) {
		return 0
	}

	const setA = new Set(listA)
	const setB = new Set(listB)
	let intersection = 0
	for (const token of setA) {
		if (setB.has(token)) {
			intersection += 1
		}
	}
	if (intersection === 0) {
		return 0
	}

	const union = setA.size + setB.size - intersection
	const jaccard = intersection / union
	const containment = intersection / Math.min(setA.size, setB.size)
	const blended = jaccard * 0.7 + containment * 0.3
	return Math.round(blended * 1000) / 10
}

/**
 * Compute byte-size proximity ratio in [0, 100].
 *
 * @param {number} bytesA - First file size.
 * @param {number} bytesB - Second file size.
 * @return {number} Proximity percentage rounded to 1 decimal place.
 */
export function computeSizeProximity(bytesA, bytesB) {
	const a = Number(bytesA)
	const b = Number(bytesB)
	if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) {
		return 0
	}
	if (a === 0 && b === 0) {
		return 100
	}
	const max = Math.max(a, b)
	const min = Math.min(a, b)
	if (max <= 0) {
		return 0
	}
	return Math.round((min / max) * 1000) / 10
}

/**
 * Compute folder path token similarity in [0, 100].
 *
 * @param {string} folderA - First folder path.
 * @param {string} folderB - Second folder path.
 * @return {number} Path similarity percentage rounded to 1 decimal place.
 */
export function computeFolderProximity(folderA, folderB) {
	const normA = typeof folderA === 'string' ? folderA.trim().toLowerCase() : ''
	const normB = typeof folderB === 'string' ? folderB.trim().toLowerCase() : ''
	if (normA === normB) {
		return 100
	}
	if (!normA || !normB) {
		return 0
	}
	const tokensA = tokenizeForSimilarity(normA)
	const tokensB = tokenizeForSimilarity(normB)
	return computeTokenSimilarity(tokensA, tokensB)
}

/**
 * Select the single best anchor/master file from a list of candidate files.
 * Priority: protected origin > oldest mtime > largest size > shortest path.
 *
 * @param {Array<object>} files - Candidate file entries.
 * @return {{ file: object|null, index: number, reason: 'protected'|'oldest'|'largest'|'shortest' }} Best anchor selection.
 */
export function pickAnchorMasterFile(files) {
	if (!Array.isArray(files) || files.length === 0) {
		return { file: null, index: -1, reason: 'shortest' }
	}

	let bestIndex = 0
	let bestFile = files[0]

	const getMtime = file => {
		const raw = Number(file?.mtime ?? file?.modified ?? file?.lastModified)
		return Number.isFinite(raw) && raw > 0 ? raw : Number.POSITIVE_INFINITY
	}
	const getSize = file => {
		const raw = Number(file?.size)
		return Number.isFinite(raw) && raw > 0 ? raw : 0
	}
	const getPathLen = file => {
		const parsed = parsePathIdentity(file?.path || file?.name || '')
		return parsed.normalizedPath.length || Number.POSITIVE_INFINITY
	}

	for (let i = 1; i < files.length; i += 1) {
		const candidate = files[i]
		if (!candidate) {
			continue
		}
		if (!bestFile) {
			bestFile = candidate
			bestIndex = i
			continue
		}

		const candProtected = Boolean(candidate.isInOriginFolder)
		const bestProtected = Boolean(bestFile.isInOriginFolder)
		if (candProtected !== bestProtected) {
			if (candProtected) {
				bestFile = candidate
				bestIndex = i
			}
			continue
		}

		const candMtime = getMtime(candidate)
		const bestMtime = getMtime(bestFile)
		if (candMtime !== bestMtime) {
			if (candMtime < bestMtime) {
				bestFile = candidate
				bestIndex = i
			}
			continue
		}

		const candSize = getSize(candidate)
		const bestSize = getSize(bestFile)
		if (candSize !== bestSize) {
			if (candSize > bestSize) {
				bestFile = candidate
				bestIndex = i
			}
			continue
		}

		if (getPathLen(candidate) < getPathLen(bestFile)) {
			bestFile = candidate
			bestIndex = i
		}
	}

	let reason = 'shortest'
	if (bestFile?.isInOriginFolder) {
		reason = 'protected'
	} else if (Number.isFinite(getMtime(bestFile))) {
		reason = 'oldest'
	} else if (getSize(bestFile) > 0) {
		reason = 'largest'
	}

	return {
		file: bestFile || null,
		index: bestIndex,
		reason,
	}
}

/**
 * Extract normalized comparison metadata for a duplicate group.
 *
 * @param {object|null|undefined} group - Duplicate group object.
 * @param {number} [fallbackIndex=0] - Fallback index when id is missing.
 * @param {boolean} [ignoreCopySuffixes=true] - Whether to strip copy suffixes.
 * @return {object|null} Group signature or null if invalid.
 */
export function extractGroupSignature(group, fallbackIndex = 0, ignoreCopySuffixes = true) {
	if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length === 0) {
		return null
	}

	const anchor = pickAnchorMasterFile(group.files)
	const anchorFile = anchor.file || group.files[0]
	const identity = parsePathIdentity(anchorFile?.path || anchorFile?.name || group.name || '')
	const normalizedStem = normalizeComparisonStem(identity.stem, ignoreCopySuffixes)
	const tokens = tokenizeForSimilarity(normalizedStem)
	const category = classifyFileCategory(anchorFile)
	const reclaimInfo = computeGroupReclaimableInfo(group)
	const unitSize = reclaimInfo.unitSize > 0
		? reclaimInfo.unitSize
		: (Number(anchorFile?.size) > 0 ? Number(anchorFile.size) : 0)
	const totalBytes = group.files.reduce((sum, file) => {
		const size = Number(file?.size)
		return sum + (Number.isFinite(size) && size > 0 ? size : unitSize)
	}, 0)

	const id = group.id !== undefined && group.id !== null && group.id !== ''
		? String(group.id)
		: `group-${fallbackIndex}`
	const hash = typeof group.hash === 'string' ? group.hash.trim() : ''

	return {
		id,
		hash,
		group,
		fileCount: group.files.length,
		unitSize,
		totalBytes,
		reclaimableBytes: reclaimInfo.reclaimableBytes,
		acknowledged: Boolean(group.acknowledged),
		hasProtectedOrigin: group.files.some(file => Boolean(file && file.isInOriginFolder)),
		anchorFile,
		anchorReason: anchor.reason,
		fileName: identity.fileName || id,
		normalizedPath: identity.normalizedPath || identity.fileName || id,
		folder: identity.folder,
		stem: identity.stem,
		normalizedStem,
		tokens,
		extension: identity.extension,
		category,
	}
}

/**
 * Compute pairwise similarity score and signal breakdown between two group signatures.
 *
 * @param {object} sigA - First group signature.
 * @param {object} sigB - Second group signature.
 * @param {object} [options] - Normalized similarity options.
 * @return {{
 *   score: number,
 *   eligible: boolean,
 *   exactHashMatch: boolean,
 *   signals: {
 *     nameLevenshtein: number,
 *     tokenOverlap: number,
 *     sizeProximity: number,
 *     pathProximity: number,
 *     sameExtension: boolean,
 *     sameCategory: boolean
 *   },
 *   dominantReason: string
 * }} Pair similarity result.
 */
export function computeGroupPairSimilarity(sigA, sigB, options = {}) {
	const opts = normalizeSimilarityOptions(options)
	const exactHashMatch = Boolean(sigA?.hash && sigB?.hash && sigA.hash === sigB.hash)
	const sameExtension = Boolean(sigA?.extension && sigB?.extension && sigA.extension === sigB.extension)
	const sameCategory = Boolean(sigA?.category && sigB?.category && sigA.category === sigB.category)

	const nameLevenshtein = computeLevenshteinSimilarity(sigA?.normalizedStem || '', sigB?.normalizedStem || '')
	const tokenOverlap = computeTokenSimilarity(sigA?.tokens || [], sigB?.tokens || [])
	const sizeProximity = computeSizeProximity(sigA?.unitSize || 0, sigB?.unitSize || 0)
	const pathProximity = computeFolderProximity(sigA?.folder || '', sigB?.folder || '')

	const signals = {
		nameLevenshtein,
		tokenOverlap,
		sizeProximity,
		pathProximity,
		sameExtension,
		sameCategory,
	}

	if (opts.sameCategoryOnly && !sameCategory && sigA?.category !== 'other' && sigB?.category !== 'other') {
		return {
			score: 0,
			eligible: false,
			exactHashMatch,
			signals,
			dominantReason: 'levenshtein',
		}
	}

	let score = 0
	let dominantReason = opts.mode === 'hybrid' ? 'levenshtein' : opts.mode

	if (exactHashMatch) {
		score = 100
		dominantReason = 'hash'
	} else if (opts.mode === 'levenshtein') {
		score = nameLevenshtein
		dominantReason = 'levenshtein'
	} else if (opts.mode === 'token') {
		score = tokenOverlap
		dominantReason = 'token'
	} else if (opts.mode === 'path-size') {
		score = Math.round((pathProximity * 0.5 + sizeProximity * 0.5) * 10) / 10
		dominantReason = 'path-size'
	} else {
		const extBonus = sameExtension ? 100 : (sameCategory ? 55 : 0)
		const rawScore = (nameLevenshtein * 0.42)
			+ (tokenOverlap * 0.28)
			+ (sizeProximity * 0.2)
			+ (extBonus * 0.1)
		score = Math.round(rawScore * 10) / 10
		const ranked = [
			{ key: 'levenshtein', val: nameLevenshtein },
			{ key: 'token', val: tokenOverlap },
			{ key: 'path-size', val: (sizeProximity + pathProximity) / 2 },
		].sort((a, b) => b.val - a.val)
		dominantReason = ranked[0].key
	}

	return {
		score,
		eligible: true,
		exactHashMatch,
		signals,
		dominantReason,
	}
}

/**
 * Compute within-group filename and path similarity consistency for a single group.
 *
 * @param {object|null|undefined} group - Duplicate group object.
 * @param {object} [options] - Normalized similarity options.
 * @return {{
 *   fileCount: number,
 *   avgNameSimilarity: number,
 *   minNameSimilarity: number,
 *   hasRenamedCopies: boolean,
 *   distinctNames: string[],
 *   anchorFileName: string
 * }|null} Intra-group consistency summary or null.
 */
export function computeIntraGroupSimilarity(group, options = {}) {
	if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length < 2) {
		return null
	}
	const opts = normalizeSimilarityOptions(options)
	const identities = group.files.map(file => {
		const parsed = parsePathIdentity(file?.path || file?.name || '')
		const normalizedStem = normalizeComparisonStem(parsed.stem, opts.ignoreCopySuffixes)
		return {
			fileName: parsed.fileName || parsed.normalizedPath || '',
			normalizedStem,
		}
	})

	const distinctNames = Array.from(new Set(identities.map(item => item.fileName).filter(Boolean)))
	let sum = 0
	let count = 0
	let minNameSimilarity = 100

	for (let i = 0; i < identities.length; i += 1) {
		for (let j = i + 1; j < identities.length; j += 1) {
			const sim = computeLevenshteinSimilarity(
				identities[i].normalizedStem,
				identities[j].normalizedStem,
			)
			sum += sim
			count += 1
			if (sim < minNameSimilarity) {
				minNameSimilarity = sim
			}
		}
	}

	const avgNameSimilarity = count > 0 ? Math.round((sum / count) * 10) / 10 : 100
	const anchor = pickAnchorMasterFile(group.files)
	const anchorIdentity = parsePathIdentity(anchor.file?.path || anchor.file?.name || '')

	return {
		fileCount: group.files.length,
		avgNameSimilarity,
		minNameSimilarity,
		hasRenamedCopies: distinctNames.length > 1,
		distinctNames,
		anchorFileName: anchorIdentity.fileName || anchorIdentity.normalizedPath,
	}
}

/**
 * Classify confidence tier from cluster average score and exact-hash status.
 *
 * @param {number} avgScore - Average cluster similarity score.
 * @param {boolean} allExactHash - True when all edges share an identical hash.
 * @return {'exact'|'high'|'moderate'|'fuzzy'} Confidence tier.
 */
export function classifyConfidenceTier(avgScore, allExactHash = false) {
	if (allExactHash || avgScore >= 99.5) {
		return 'exact'
	}
	if (avgScore >= 90) {
		return 'high'
	}
	if (avgScore >= 75) {
		return 'moderate'
	}
	return 'fuzzy'
}

/**
 * Cluster duplicate groups by interactive similarity threshold and compute
 * live merge impact metrics.
 *
 * @param {Array<object>|null|undefined} duplicates - Loaded duplicate groups.
 * @param {object} [rawOptions] - Similarity mode, threshold, and filter options.
 * @return {{
 *   options: object,
 *   clusters: Array<object>,
 *   impact: object
 * }} Full similarity cluster analysis and live merge impact report.
 */
export function analyzeSimilarityClusters(duplicates, rawOptions = {}) {
	const options = normalizeSimilarityOptions(rawOptions)
	const sourceList = Array.isArray(duplicates) ? duplicates : []

	const signatures = []
	for (let i = 0; i < sourceList.length; i += 1) {
		const sig = extractGroupSignature(sourceList[i], i, options.ignoreCopySuffixes)
		if (!sig) {
			continue
		}
		if (options.categoryFilter !== 'all' && sig.category !== options.categoryFilter) {
			continue
		}
		if (options.searchQuery) {
			const haystack = `${sig.fileName} ${sig.normalizedPath} ${sig.hash}`.toLowerCase()
			if (!haystack.includes(options.searchQuery)) {
				continue
			}
		}
		signatures.push(sig)
	}

	const totalGroupCount = signatures.length
	const truncated = totalGroupCount > MAX_GROUPS_FOR_PAIRWISE
	const evaluated = truncated ? signatures.slice(0, MAX_GROUPS_FOR_PAIRWISE) : signatures
	const n = evaluated.length

	const parent = Array.from({ length: n }, (_, idx) => idx)
	const find = x => {
		let root = x
		while (parent[root] !== root) {
			parent[root] = parent[parent[root]]
			root = parent[root]
		}
		return root
	}
	const unite = (a, b) => {
		const ra = find(a)
		const rb = find(b)
		if (ra !== rb) {
			parent[rb] = ra
		}
	}

	const edgesByComponentCandidate = []
	for (let i = 0; i < n; i += 1) {
		for (let j = i + 1; j < n; j += 1) {
			const pair = computeGroupPairSimilarity(evaluated[i], evaluated[j], options)
			if (pair.eligible && pair.score >= options.threshold) {
				unite(i, j)
				edgesByComponentCandidate.push({
					i,
					j,
					pair,
				})
			}
		}
	}

	const componentsMap = new Map()
	for (let i = 0; i < n; i += 1) {
		const root = find(i)
		if (!componentsMap.has(root)) {
			componentsMap.set(root, { indices: [], edges: [] })
		}
		componentsMap.get(root).indices.push(i)
	}
	for (const edge of edgesByComponentCandidate) {
		const root = find(edge.i)
		componentsMap.get(root).edges.push(edge)
	}

	const clusters = []
	const confidenceCounts = { exact: 0, high: 0, moderate: 0, fuzzy: 0 }
	let linkedGroupCount = 0
	let totalClusteredFiles = 0
	let currentReclaimableBytes = 0
	let mergedReclaimableBytes = 0

	for (const comp of componentsMap.values()) {
		if (comp.indices.length < 2) {
			continue
		}

		const memberSigs = comp.indices.map(idx => evaluated[idx])
		const allFiles = memberSigs.flatMap(sig => sig.group.files)
		const anchor = pickAnchorMasterFile(allFiles)
		const anchorIdentity = parsePathIdentity(anchor.file?.path || anchor.file?.name || '')

		// Sort member groups so the group containing the anchor file (or highest unitSize) comes first
		const sortedMembers = [...memberSigs].sort((a, b) => {
			const aHasAnchor = a.group.files.includes(anchor.file) ? 1 : 0
			const bHasAnchor = b.group.files.includes(anchor.file) ? 1 : 0
			if (aHasAnchor !== bHasAnchor) {
				return bHasAnchor - aHasAnchor
			}
			if (b.totalBytes !== a.totalBytes) {
				return b.totalBytes - a.totalBytes
			}
			return a.fileName.localeCompare(b.fileName)
		})

		const clusterCurrentReclaimable = sortedMembers.reduce((sum, sig) => sum + sig.reclaimableBytes, 0)
		const clusterTotalBytes = sortedMembers.reduce((sum, sig) => sum + sig.totalBytes, 0)
		const anchorSize = Number(anchor.file?.size) > 0
			? Number(anchor.file.size)
			: (sortedMembers[0]?.unitSize || 0)
		const clusterMergedReclaimable = Math.max(clusterCurrentReclaimable, Math.max(0, clusterTotalBytes - anchorSize))
		const additionalMergeGainBytes = Math.max(0, clusterMergedReclaimable - clusterCurrentReclaimable)

		let minScore = 100
		let maxScore = 0
		let scoreSum = 0
		let levSum = 0
		let tokSum = 0
		let sizeSum = 0
		let pathSum = 0
		let allExactHash = comp.edges.length > 0

		for (const edge of comp.edges) {
			const { score, exactHashMatch, signals } = edge.pair
			if (score < minScore) {
				minScore = score
			}
			if (score > maxScore) {
				maxScore = score
			}
			scoreSum += score
			levSum += signals.nameLevenshtein
			tokSum += signals.tokenOverlap
			sizeSum += signals.sizeProximity
			pathSum += signals.pathProximity
			if (!exactHashMatch) {
				allExactHash = false
			}
		}

		const edgeCount = comp.edges.length || 1
		const avgScore = Math.round((scoreSum / edgeCount) * 10) / 10
		const confidenceTier = classifyConfidenceTier(avgScore, allExactHash)
		confidenceCounts[confidenceTier] += 1

		const topPairs = [...comp.edges]
			.sort((a, b) => b.pair.score - a.pair.score)
			.slice(0, 3)
			.map(edge => ({
				leftGroupId: evaluated[edge.i].id,
				rightGroupId: evaluated[edge.j].id,
				leftName: evaluated[edge.i].fileName,
				rightName: evaluated[edge.j].fileName,
				score: edge.pair.score,
				exactHashMatch: edge.pair.exactHashMatch,
				dominantReason: edge.pair.dominantReason,
				signals: edge.pair.signals,
			}))

		const clusterId = sortedMembers.map(sig => sig.id).sort().join('::')

		linkedGroupCount += sortedMembers.length
		totalClusteredFiles += allFiles.length
		currentReclaimableBytes += clusterCurrentReclaimable
		mergedReclaimableBytes += clusterMergedReclaimable

		clusters.push({
			clusterId,
			label: anchorIdentity.fileName || sortedMembers[0].fileName,
			groupCount: sortedMembers.length,
			totalFiles: allFiles.length,
			redundantAfterMerge: Math.max(0, allFiles.length - 1),
			totalBytes: clusterTotalBytes,
			totalFormatted: formatBytes(clusterTotalBytes),
			currentReclaimableBytes: clusterCurrentReclaimable,
			currentReclaimableFormatted: formatBytes(clusterCurrentReclaimable),
			mergedReclaimableBytes: clusterMergedReclaimable,
			mergedReclaimableFormatted: formatBytes(clusterMergedReclaimable),
			additionalMergeGainBytes,
			additionalMergeGainFormatted: formatBytes(additionalMergeGainBytes),
			minPairScore: minScore,
			avgPairScore: avgScore,
			maxPairScore: maxScore,
			confidenceTier,
			avgSignals: {
				nameLevenshtein: Math.round((levSum / edgeCount) * 10) / 10,
				tokenOverlap: Math.round((tokSum / edgeCount) * 10) / 10,
				sizeProximity: Math.round((sizeSum / edgeCount) * 10) / 10,
				pathProximity: Math.round((pathSum / edgeCount) * 10) / 10,
			},
			anchorFile: {
				fileName: anchorIdentity.fileName || anchorIdentity.normalizedPath,
				normalizedPath: anchorIdentity.normalizedPath,
				folder: anchorIdentity.folder,
				sizeBytes: anchorSize,
				sizeFormatted: formatBytes(anchorSize),
				isProtected: Boolean(anchor.file?.isInOriginFolder),
				reason: anchor.reason,
			},
			members: sortedMembers.map(sig => ({
				id: sig.id,
				hash: sig.hash,
				fileName: sig.fileName,
				normalizedPath: sig.normalizedPath,
				folder: sig.folder,
				fileCount: sig.fileCount,
				unitSize: sig.unitSize,
				unitSizeFormatted: formatBytes(sig.unitSize),
				totalBytes: sig.totalBytes,
				totalFormatted: formatBytes(sig.totalBytes),
				reclaimableBytes: sig.reclaimableBytes,
				reclaimableFormatted: formatBytes(sig.reclaimableBytes),
				category: sig.category,
				acknowledged: sig.acknowledged,
				hasProtectedOrigin: sig.hasProtectedOrigin,
				isAnchorGroup: sig.group.files.includes(anchor.file),
				group: sig.group,
			})),
			topPairs,
		})
	}

	clusters.sort((a, b) => {
		if (b.additionalMergeGainBytes !== a.additionalMergeGainBytes) {
			return b.additionalMergeGainBytes - a.additionalMergeGainBytes
		}
		if (b.mergedReclaimableBytes !== a.mergedReclaimableBytes) {
			return b.mergedReclaimableBytes - a.mergedReclaimableBytes
		}
		return b.avgPairScore - a.avgPairScore
	})

	const clusterCount = clusters.length
	const unmergedGroupCount = Math.max(0, n - linkedGroupCount)
	const reducedEffectiveCount = unmergedGroupCount + clusterCount
	const fragmentationReductionPercent = n > 0
		? Math.round(((n - reducedEffectiveCount) / n) * 1000) / 10
		: 0
	const additionalMergeGainBytes = Math.max(0, mergedReclaimableBytes - currentReclaimableBytes)

	return {
		options,
		clusters,
		impact: {
			totalGroupCount,
			evaluatedGroupCount: n,
			truncated,
			clusterCount,
			linkedGroupCount,
			unmergedGroupCount,
			reducedEffectiveCount,
			fragmentationReductionPercent,
			totalClusteredFiles,
			currentReclaimableBytes,
			currentReclaimableFormatted: formatBytes(currentReclaimableBytes),
			mergedReclaimableBytes,
			mergedReclaimableFormatted: formatBytes(mergedReclaimableBytes),
			additionalMergeGainBytes,
			additionalMergeGainFormatted: formatBytes(additionalMergeGainBytes),
			confidenceCounts,
		},
	}
}
