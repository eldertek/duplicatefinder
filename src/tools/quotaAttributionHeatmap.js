/**
 * Pure Multi-Root Cross-User Quota Attribution & Chargeback Heatmap Engine.
 * Attributes duplicate waste and gross storage footprints across Nextcloud user
 * namespaces, group folders, external mounts, and top-level directory roots
 * with FinOps showback estimation, cross-user overlap detection, quota alerts,
 * protected-origin + surviving-copy safe prune planning, and CWE-1236-safe exports.
 * Zero DOM dependencies, zero network side effects.
 */

import { classifyFileCategory } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const QUOTA_ATTRIBUTION_SCHEMA = 'duplicatefinder.quota-attribution.v1'

export const ATTRIBUTION_POLICIES = Object.freeze([
	'surplus_extra',
	'equal_split',
	'gross_footprint',
])

export const ROOT_GRANULARITIES = Object.freeze([
	'mount',
	'top_folder',
])

export const KEEPER_STRATEGIES = Object.freeze([
	'origin_first',
	'oldest',
	'newest',
	'shortest_path',
])

export const QUOTA_SORT_MODES = Object.freeze([
	'attributed_desc',
	'gross_desc',
	'owners_desc',
	'copies_desc',
	'name_asc',
])

export const CHARGEBACK_CURRENCIES = Object.freeze({
	EUR: { code: 'EUR', label: 'EUR' },
	USD: { code: 'USD', label: 'USD' },
	GBP: { code: 'GBP', label: 'GBP' },
})

const BYTES_PER_GB = 1024 * 1024 * 1024
const BYTES_PER_MB = 1024 * 1024
const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

/**
 * Parse a timestamp field into finite milliseconds or null.
 *
 * @param {*} value Raw timestamp value.
 * @return {number|null} Timestamp in ms or null.
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
			const num = Number(trimmed)
			return Number.isFinite(num) ? num : null
		}
		const parsed = Date.parse(trimmed)
		return Number.isFinite(parsed) ? parsed : null
	}
	return null
}

/**
 * Extract modification timestamp from a duplicate file entry.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Timestamp in ms or null.
 */
function getFileTimestamp(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const parsed = parseTimestamp(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Normalize a raw filesystem path to forward-slash canonical form without trailing slashes.
 *
 * @param {string|null|undefined} rawPath Raw path string.
 * @return {string} Normalized path or empty string.
 */
function sanitizePath(rawPath) {
	if (typeof rawPath !== 'string') {
		return ''
	}
	const cleaned = rawPath.replace(/\\/g, '/').replace(/\/+/g, '/').trim()
	if (!cleaned) {
		return ''
	}
	if (cleaned.length > 1) {
		return cleaned.replace(/\/+$/, '')
	}
	return cleaned
}

/**
 * Extract basename from a file object or path string.
 *
 * @param {object|null|undefined} file File object.
 * @return {string} Basename or fallback label.
 */
function extractBasename(file) {
	if (!file || typeof file !== 'object') {
		return 'unknown'
	}
	if (typeof file.name === 'string' && file.name.trim()) {
		return file.name.trim()
	}
	const pathStr = sanitizePath(file.path || '')
	if (!pathStr) {
		return 'unknown'
	}
	const slashIndex = pathStr.lastIndexOf('/')
	return slashIndex >= 0 ? pathStr.slice(slashIndex + 1) || 'unknown' : pathStr
}

/**
 * Sanitize an owner or user identifier string.
 *
 * @param {*} rawOwner Raw owner candidate.
 * @return {string} Clean owner label or empty string.
 */
function sanitizeLabel(rawOwner) {
	if (typeof rawOwner !== 'string') {
		return ''
	}
	return rawOwner.replace(/[\r\n\t\0]/g, ' ').trim()
}

/**
 * Resolve a stable group key for a duplicate group.
 *
 * @param {object|null|undefined} group Duplicate group.
 * @param {number} [index=0] Fallback index.
 * @return {string} Stable group key.
 */
export function resolveQuotaGroupKey(group, index = 0) {
	if (!group || typeof group !== 'object') {
		return `idx:${index}`
	}
	if (typeof group.hash === 'string' && group.hash.trim() !== '') {
		return `hash:${group.hash.trim()}`
	}
	if (group.id !== null && group.id !== undefined && group.id !== '') {
		return `id:${String(group.id)}`
	}
	return `idx:${index}`
}

/**
 * Extract owner identity and storage root attribution metadata from a duplicate file entry.
 * Supports Nextcloud `/<user>/files/...`, `/__groupfolders/<id>/...`, `/External/<mount>/...`,
 * `/Shared/...`, explicit `owner`/`userId`/`storageRoot`/`mountPoint` properties, and plain paths.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @param {object} [options] Extraction options.
 * @param {'mount'|'top_folder'} [options.rootGranularity='mount'] Granularity for root grouping.
 * @param {string} [options.defaultOwner='local-user'] Fallback owner when path has no user prefix.
 * @return {{owner: string, rootKey: string, rootLabel: string, rootKind: string, normalizedPath: string, topFolder: string}} Extracted attribution identity.
 */
export function extractOwnerAndRoot(file, options = {}) {
	const granularity = ROOT_GRANULARITIES.includes(options.rootGranularity)
		? options.rootGranularity
		: 'mount'
	const defaultOwner = sanitizeLabel(options.defaultOwner) || 'local-user'

	if (!file || typeof file !== 'object') {
		return {
			owner: defaultOwner,
			rootKey: 'root:unknown',
			rootLabel: '/ (Unknown)',
			rootKind: 'folder',
			normalizedPath: '/',
			topFolder: '/',
		}
	}

	const rawPath = sanitizePath(file.path || file.name || '')
	const explicitOwner = sanitizeLabel(
		file.owner || file.userId || file.ownerId || file.user || file.sharedBy || '',
	)
	const explicitRoot = sanitizeLabel(
		file.storageRoot || file.root || file.mountPoint || file.groupFolder || '',
	)
	const isOrigin = Boolean(file.isInOriginFolder)

	let owner = explicitOwner
	let rootKey = ''
	let rootLabel = ''
	let rootKind = 'user_home'
	let innerSubpath = ''

	const ncUserMatch = rawPath.match(/^\/([^/]+)\/files(?:\/(.*))?$/)
	const groupFolderMatch = rawPath.match(/^\/__groupfolders\/([^/]+)(?:\/(.*))?$/)
	const teamFolderMatch = rawPath.match(/^\/(?:Team Folders|TeamFolders|Shared)\/([^/]+)(?:\/(.*))?$/i)
	const externalMatch = rawPath.match(/^\/(?:External|Mounts|Volumes|mnt)\/([^/]+)(?:\/(.*))?$/i)

	if (groupFolderMatch) {
		const gfId = groupFolderMatch[1]
		innerSubpath = groupFolderMatch[2] || ''
		if (!owner) {
			owner = `team:${gfId}`
		}
		rootKind = 'groupfolder'
		rootKey = `groupfolder:${gfId}`
		rootLabel = `GroupFolder #${gfId}`
	} else if (ncUserMatch) {
		const pathUser = sanitizeLabel(ncUserMatch[1])
		innerSubpath = ncUserMatch[2] || ''
		if (!owner) {
			owner = pathUser || defaultOwner
		}
		const lowerInner = innerSubpath.toLowerCase()
		if (lowerInner.startsWith('external/') || lowerInner.startsWith('mounts/')) {
			const extParts = innerSubpath.split('/')
			const mountName = extParts[1] || 'external'
			rootKind = 'external'
			rootKey = `${owner}:external:${mountName}`
			rootLabel = `${owner} / External:${mountName}`
			innerSubpath = extParts.slice(2).join('/')
		} else if (lowerInner.startsWith('shared/') || Boolean(file.shared)) {
			rootKind = 'shared'
			rootKey = `${owner}:shared`
			rootLabel = `${owner} / Shared`
		} else if (isOrigin) {
			rootKind = 'origin'
			rootKey = `${owner}:origin`
			rootLabel = `${owner} / Origin`
		} else {
			rootKind = 'user_home'
			rootKey = `${owner}:files`
			rootLabel = `${owner}:/files`
		}
	} else if (externalMatch) {
		const mountName = externalMatch[1]
		innerSubpath = externalMatch[2] || ''
		if (!owner) {
			owner = `mount:${mountName}`
		}
		rootKind = 'external'
		rootKey = `external:${mountName}`
		rootLabel = `External:${mountName}`
	} else if (teamFolderMatch) {
		const spaceName = teamFolderMatch[1]
		innerSubpath = teamFolderMatch[2] || ''
		if (!owner) {
			owner = `shared:${spaceName}`
		}
		rootKind = 'shared'
		rootKey = `shared:${spaceName}`
		rootLabel = `Shared:${spaceName}`
	} else {
		const diffNorm = sanitizePath(normalizePathForDiff(rawPath))
		const stripped = diffNorm.startsWith('/') ? diffNorm.slice(1) : diffNorm
		const parts = stripped ? stripped.split('/') : []
		if (!owner) {
			owner = defaultOwner
		}
		if (parts.length > 1) {
			const topSegment = parts[0]
			innerSubpath = parts.slice(1).join('/')
			rootKind = isOrigin ? 'origin' : 'folder'
			rootKey = `${owner}:dir:${topSegment}`
			rootLabel = `${owner} / ${topSegment}`
		} else {
			rootKind = isOrigin ? 'origin' : 'folder'
			rootKey = `${owner}:root`
			rootLabel = `${owner} / Root`
		}
	}

	if (explicitRoot) {
		rootKey = `explicit:${explicitRoot}`
		rootLabel = explicitRoot
		if (isOrigin) {
			rootKind = 'origin'
		}
	}

	const normalizedPath = sanitizePath(normalizePathForDiff(rawPath)) || rawPath || '/'
	const cleanInner = innerSubpath.replace(/^\/+/, '')
	const innerParts = cleanInner ? cleanInner.split('/').filter(Boolean) : []
	const topFolder = innerParts.length > 1 ? innerParts[0] : (innerParts.length === 1 && !rawPath.includes('.') ? innerParts[0] : '/')

	if (granularity === 'top_folder' && !explicitRoot) {
		const folderSegment = innerParts.length > 1 ? innerParts[0] : 'Root'
		rootKey = `${rootKey}:folder:${folderSegment}`
		rootLabel = `${rootLabel} / ${folderSegment}`
	}

	return {
		owner,
		rootKey,
		rootLabel,
		rootKind,
		normalizedPath,
		topFolder,
	}
}

/**
 * Select the canonical surviving keeper file index inside a duplicate group.
 *
 * @param {Array<object>} files Duplicate files in group.
 * @param {'origin_first'|'oldest'|'newest'|'shortest_path'} [strategy='origin_first'] Tie-break strategy.
 * @return {number} Index of canonical keeper file, or 0 when files is non-empty.
 */
export function selectCanonicalKeeperIndex(files, strategy = 'origin_first') {
	if (!Array.isArray(files) || files.length === 0) {
		return -1
	}
	const resolvedStrategy = KEEPER_STRATEGIES.includes(strategy) ? strategy : 'origin_first'

	let bestIndex = 0
	for (let idx = 1; idx < files.length; idx += 1) {
		const candidate = files[idx] || {}
		const currentBest = files[bestIndex] || {}

		if (resolvedStrategy === 'origin_first') {
			const candOrigin = Boolean(candidate.isInOriginFolder)
			const bestOrigin = Boolean(currentBest.isInOriginFolder)
			if (candOrigin !== bestOrigin) {
				if (candOrigin) {
					bestIndex = idx
				}
				continue
			}
		}

		if (resolvedStrategy === 'oldest' || resolvedStrategy === 'origin_first') {
			const candTs = getFileTimestamp(candidate)
			const bestTs = getFileTimestamp(currentBest)
			if (candTs !== null && bestTs !== null && candTs !== bestTs) {
				if (candTs < bestTs) {
					bestIndex = idx
				}
				continue
			}
			if (candTs !== null && bestTs === null) {
				bestIndex = idx
				continue
			}
		} else if (resolvedStrategy === 'newest') {
			const candTs = getFileTimestamp(candidate)
			const bestTs = getFileTimestamp(currentBest)
			if (candTs !== null && bestTs !== null && candTs !== bestTs) {
				if (candTs > bestTs) {
					bestIndex = idx
				}
				continue
			}
			if (candTs !== null && bestTs === null) {
				bestIndex = idx
				continue
			}
		}

		const candPath = sanitizePath(candidate.path || candidate.name || '')
		const bestPath = sanitizePath(currentBest.path || currentBest.name || '')
		if (candPath.length !== bestPath.length) {
			if (candPath.length < bestPath.length) {
				bestIndex = idx
			}
			continue
		}
		if (candPath.localeCompare(bestPath) < 0) {
			bestIndex = idx
		}
	}
	return bestIndex
}

/**
 * Compute estimated monthly chargeback amount in currency units for a byte volume.
 *
 * @param {number} bytes Byte count.
 * @param {number} costPerGbMonth Storage rate per GiB per month.
 * @return {number} Estimated monthly charge rounded to 4 decimal places.
 */
export function computeChargebackAmount(bytes, costPerGbMonth) {
	const numericBytes = Number(bytes)
	const numericRate = Number(costPerGbMonth)
	if (!Number.isFinite(numericBytes) || numericBytes <= 0) {
		return 0
	}
	if (!Number.isFinite(numericRate) || numericRate <= 0) {
		return 0
	}
	const raw = (numericBytes / BYTES_PER_GB) * numericRate
	return Math.round(raw * 10000) / 10000
}

/**
 * Format a numeric monthly chargeback amount cleanly with currency code.
 *
 * @param {number} amount Chargeback amount.
 * @param {string} [currency='EUR'] Currency code.
 * @return {string} Formatted currency string.
 */
export function formatChargebackAmount(amount, currency = 'EUR') {
	const code = CHARGEBACK_CURRENCIES[currency] ? CHARGEBACK_CURRENCIES[currency].code : 'EUR'
	const numeric = Number(amount)
	if (!Number.isFinite(numeric) || numeric <= 0) {
		return `0.00 ${code}`
	}
	if (numeric < 0.01) {
		return `${numeric.toFixed(4)} ${code}`
	}
	return `${numeric.toFixed(2)} ${code}`
}

/**
 * Classify a heatmap cell intensity ratio into a discrete visual tier.
 *
 * @param {number} ratio Ratio between 0 and 1.
 * @return {'none'|'low'|'medium'|'high'|'critical'} Heat tier.
 */
function classifyHeatTier(ratio) {
	if (!Number.isFinite(ratio) || ratio <= 0) {
		return 'none'
	}
	if (ratio >= 0.75) {
		return 'critical'
	}
	if (ratio >= 0.45) {
		return 'high'
	}
	if (ratio >= 0.18) {
		return 'medium'
	}
	return 'low'
}

/**
 * Parse a user-entered numeric setting cleanly without crashing on empty/partial input.
 *
 * @param {*} rawValue Input value.
 * @param {number} fallback Fallback default.
 * @param {number} [min=0] Minimum allowed value.
 * @return {number} Parsed non-negative number.
 */
function parseNonNegativeNumber(rawValue, fallback, min = 0) {
	if (rawValue === '' || rawValue === null || rawValue === undefined) {
		return fallback
	}
	const num = Number(rawValue)
	if (!Number.isFinite(num) || num < min) {
		return fallback
	}
	return num
}

/**
 * Build the complete multi-root cross-user quota attribution and chargeback heatmap report.
 *
 * @param {Array<object>|null|undefined} duplicates Duplicate groups.
 * @param {object} [options] Attribution and chargeback options.
 * @param {'surplus_extra'|'equal_split'|'gross_footprint'} [options.policy='surplus_extra'] Attribution policy.
 * @param {'mount'|'top_folder'} [options.rootGranularity='mount'] Storage root granularity.
 * @param {'origin_first'|'oldest'|'newest'|'shortest_path'} [options.keeperStrategy='origin_first'] Canonical keeper rule.
 * @param {number|string} [options.costPerGbMonth=0.025] Monthly chargeback rate per GiB.
 * @param {'EUR'|'USD'|'GBP'} [options.currency='EUR'] Display currency code.
 * @param {number|string} [options.quotaThresholdMb=100] Per-owner duplicate waste alert threshold in MiB.
 * @param {string} [options.defaultOwner='local-user'] Fallback owner when path lacks user prefix.
 * @return {object} Complete quota attribution report.
 */
export function buildQuotaAttributionReport(duplicates, options = {}) {
	const policy = ATTRIBUTION_POLICIES.includes(options.policy) ? options.policy : 'surplus_extra'
	const rootGranularity = ROOT_GRANULARITIES.includes(options.rootGranularity)
		? options.rootGranularity
		: 'mount'
	const keeperStrategy = KEEPER_STRATEGIES.includes(options.keeperStrategy)
		? options.keeperStrategy
		: 'origin_first'
	const costPerGbMonth = parseNonNegativeNumber(options.costPerGbMonth, 0.025, 0)
	const currency = CHARGEBACK_CURRENCIES[options.currency] ? options.currency : 'EUR'
	const quotaThresholdMb = parseNonNegativeNumber(options.quotaThresholdMb, 100, 1)
	const quotaThresholdBytes = quotaThresholdMb * BYTES_PER_MB

	const ownerMap = new Map()
	const rootMap = new Map()
	const cellMap = new Map()
	const pairMap = new Map()
	const groups = []

	let totalFiles = 0
	let totalGrossBytes = 0
	let totalReclaimableBytes = 0
	let totalAttributedBytes = 0
	let crossUserGroupCount = 0
	let crossRootGroupCount = 0

	const list = Array.isArray(duplicates) ? duplicates : []

	for (let groupIndex = 0; groupIndex < list.length; groupIndex += 1) {
		const group = list[groupIndex]
		if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		const validFiles = group.files.filter(f => f && typeof f === 'object')
		if (validFiles.length < 2) {
			continue
		}

		const info = computeGroupReclaimableInfo({ ...group, files: validFiles })
		const unitSize = info.unitSize > 0
			? info.unitSize
			: Math.max(0, Number(validFiles[0].size) || 0)
		const copyCount = validFiles.length
		const groupGrossBytes = unitSize * copyCount
		const groupReclaimableBytes = unitSize * Math.max(0, copyCount - 1)
		const keeperIndex = selectCanonicalKeeperIndex(validFiles, keeperStrategy)
		const groupKey = resolveQuotaGroupKey(group, groupIndex)
		const displayName = extractBasename(validFiles[keeperIndex] || validFiles[0])

		const groupOwnersSet = new Set()
		const groupRootsSet = new Set()
		const attributedFiles = []

		for (let fileIndex = 0; fileIndex < validFiles.length; fileIndex += 1) {
			const file = validFiles[fileIndex]
			const fileSize = Math.max(0, Number(file.size) || unitSize)
			const identity = extractOwnerAndRoot(file, {
				rootGranularity,
				defaultOwner: options.defaultOwner,
			})
			const isProtectedOrigin = Boolean(file.isInOriginFolder)
			const isKeeper = fileIndex === keeperIndex
			const isSafePruneCandidate = !isKeeper && !isProtectedOrigin

			let attributedBytes = 0
			if (policy === 'surplus_extra') {
				attributedBytes = isKeeper ? 0 : fileSize
			} else if (policy === 'equal_split') {
				attributedBytes = Math.round((groupReclaimableBytes / copyCount))
			} else {
				attributedBytes = fileSize
			}

			groupOwnersSet.add(identity.owner)
			groupRootsSet.add(identity.rootKey)

			attributedFiles.push({
				fileIndex,
				selectionKey: getFileSelectionKey(file),
				fileRef: file,
				owner: identity.owner,
				rootKey: identity.rootKey,
				rootLabel: identity.rootLabel,
				rootKind: identity.rootKind,
				normalizedPath: identity.normalizedPath,
				rawPath: sanitizePath(file.path || file.name || ''),
				fileName: extractBasename(file),
				category: classifyFileCategory(file),
				size: fileSize,
				sizeFormatted: formatBytes(fileSize),
				attributedBytes,
				attributedBytesFormatted: formatBytes(attributedBytes),
				estimatedMonthlyCharge: computeChargebackAmount(attributedBytes, costPerGbMonth),
				estimatedMonthlyChargeFormatted: formatChargebackAmount(
					computeChargebackAmount(attributedBytes, costPerGbMonth),
					currency,
				),
				isKeeper,
				isProtectedOrigin,
				isSafePruneCandidate,
				role: isKeeper ? 'keeper' : (isProtectedOrigin ? 'protected' : 'redundant'),
			})
		}

		// Reconcile rounding drift on equal_split so group sum equals exact groupReclaimableBytes
		if (policy === 'equal_split' && attributedFiles.length > 0) {
			const currentSum = attributedFiles.reduce((acc, f) => acc + f.attributedBytes, 0)
			const drift = groupReclaimableBytes - currentSum
			if (drift !== 0) {
				const targetIdx = attributedFiles.findIndex(f => !f.isKeeper)
				const adjustIdx = targetIdx >= 0 ? targetIdx : 0
				attributedFiles[adjustIdx].attributedBytes = Math.max(
					0,
					attributedFiles[adjustIdx].attributedBytes + drift,
				)
				attributedFiles[adjustIdx].attributedBytesFormatted = formatBytes(
					attributedFiles[adjustIdx].attributedBytes,
				)
				const adjustedCharge = computeChargebackAmount(
					attributedFiles[adjustIdx].attributedBytes,
					costPerGbMonth,
				)
				attributedFiles[adjustIdx].estimatedMonthlyCharge = adjustedCharge
				attributedFiles[adjustIdx].estimatedMonthlyChargeFormatted = formatChargebackAmount(
					adjustedCharge,
					currency,
				)
			}
		}

		const isCrossUser = groupOwnersSet.size > 1
		const isCrossRoot = groupRootsSet.size > 1
		if (isCrossUser) {
			crossUserGroupCount += 1
		}
		if (isCrossRoot) {
			crossRootGroupCount += 1
		}

		// Accumulate per-owner, per-root, and heatmap cell metrics
		const seenOwnersInGroup = new Set()
		const seenRootsInGroup = new Set()
		const seenCellsInGroup = new Set()

		let groupAttributedBytes = 0
		let groupSafePruneCount = 0
		let groupSafePruneBytes = 0
		let hasProtectedOrigin = false

		for (const entry of attributedFiles) {
			totalFiles += 1
			groupAttributedBytes += entry.attributedBytes
			if (entry.isProtectedOrigin) {
				hasProtectedOrigin = true
			}
			if (entry.isSafePruneCandidate) {
				groupSafePruneCount += 1
				groupSafePruneBytes += entry.size
			}

			// Owner bucket
			if (!ownerMap.has(entry.owner)) {
				ownerMap.set(entry.owner, {
					owner: entry.owner,
					attributedBytes: 0,
					grossBytes: 0,
					groupCount: 0,
					fileCount: 0,
					redundantCount: 0,
					protectedCount: 0,
					crossUserGroupCount: 0,
					safePruneCount: 0,
					safePruneBytes: 0,
					rootKeys: new Set(),
				})
			}
			const ownerBucket = ownerMap.get(entry.owner)
			ownerBucket.attributedBytes += entry.attributedBytes
			ownerBucket.grossBytes += entry.size
			ownerBucket.fileCount += 1
			if (!entry.isKeeper) {
				ownerBucket.redundantCount += 1
			}
			if (entry.isProtectedOrigin) {
				ownerBucket.protectedCount += 1
			}
			if (entry.isSafePruneCandidate) {
				ownerBucket.safePruneCount += 1
				ownerBucket.safePruneBytes += entry.size
			}
			ownerBucket.rootKeys.add(entry.rootKey)
			if (!seenOwnersInGroup.has(entry.owner)) {
				ownerBucket.groupCount += 1
				if (isCrossUser) {
					ownerBucket.crossUserGroupCount += 1
				}
				seenOwnersInGroup.add(entry.owner)
			}

			// Root bucket
			if (!rootMap.has(entry.rootKey)) {
				rootMap.set(entry.rootKey, {
					rootKey: entry.rootKey,
					rootLabel: entry.rootLabel,
					rootKind: entry.rootKind,
					attributedBytes: 0,
					grossBytes: 0,
					groupCount: 0,
					fileCount: 0,
					redundantCount: 0,
					protectedCount: 0,
					safePruneCount: 0,
					safePruneBytes: 0,
					owners: new Set(),
				})
			}
			const rootBucket = rootMap.get(entry.rootKey)
			rootBucket.attributedBytes += entry.attributedBytes
			rootBucket.grossBytes += entry.size
			rootBucket.fileCount += 1
			if (!entry.isKeeper) {
				rootBucket.redundantCount += 1
			}
			if (entry.isProtectedOrigin) {
				rootBucket.protectedCount += 1
			}
			if (entry.isSafePruneCandidate) {
				rootBucket.safePruneCount += 1
				rootBucket.safePruneBytes += entry.size
			}
			rootBucket.owners.add(entry.owner)
			if (!seenRootsInGroup.has(entry.rootKey)) {
				rootBucket.groupCount += 1
				seenRootsInGroup.add(entry.rootKey)
			}

			// Heatmap cell (owner x rootKey)
			const cellKey = `${entry.owner}::${entry.rootKey}`
			if (!cellMap.has(cellKey)) {
				cellMap.set(cellKey, {
					cellKey,
					owner: entry.owner,
					rootKey: entry.rootKey,
					rootLabel: entry.rootLabel,
					rootKind: entry.rootKind,
					attributedBytes: 0,
					grossBytes: 0,
					fileCount: 0,
					groupCount: 0,
					redundantCount: 0,
					protectedCount: 0,
					safePruneCount: 0,
					safePruneBytes: 0,
					crossUserOverlapCount: 0,
				})
			}
			const cell = cellMap.get(cellKey)
			cell.attributedBytes += entry.attributedBytes
			cell.grossBytes += entry.size
			cell.fileCount += 1
			if (!entry.isKeeper) {
				cell.redundantCount += 1
			}
			if (entry.isProtectedOrigin) {
				cell.protectedCount += 1
			}
			if (entry.isSafePruneCandidate) {
				cell.safePruneCount += 1
				cell.safePruneBytes += entry.size
			}
			if (!seenCellsInGroup.has(cellKey)) {
				cell.groupCount += 1
				if (isCrossUser) {
					cell.crossUserOverlapCount += 1
				}
				seenCellsInGroup.add(cellKey)
			}
		}

		// Cross-user overlap pairs for shared payloads across distinct owners
		if (isCrossUser) {
			const sortedOwners = Array.from(groupOwnersSet).sort((a, b) => a.localeCompare(b))
			for (let i = 0; i < sortedOwners.length; i += 1) {
				for (let j = i + 1; j < sortedOwners.length; j += 1) {
					const ownerA = sortedOwners[i]
					const ownerB = sortedOwners[j]
					const pairKey = `${ownerA}::${ownerB}`
					if (!pairMap.has(pairKey)) {
						pairMap.set(pairKey, {
							pairKey,
							ownerA,
							ownerB,
							sharedGroupCount: 0,
							sharedPayloadBytes: 0,
							reclaimableBytes: 0,
							groupKeys: [],
						})
					}
					const pair = pairMap.get(pairKey)
					pair.sharedGroupCount += 1
					pair.sharedPayloadBytes += unitSize
					pair.reclaimableBytes += groupReclaimableBytes
					pair.groupKeys.push(groupKey)
				}
			}
		}

		totalGrossBytes += groupGrossBytes
		totalReclaimableBytes += groupReclaimableBytes
		totalAttributedBytes += groupAttributedBytes

		const groupMonthlyCharge = computeChargebackAmount(groupAttributedBytes, costPerGbMonth)
		groups.push({
			groupKey,
			id: group.id !== undefined ? group.id : groupKey,
			hash: typeof group.hash === 'string' ? group.hash : '',
			displayName,
			unitSize,
			unitSizeFormatted: formatBytes(unitSize),
			fileCount: validFiles.length,
			ownerCount: groupOwnersSet.size,
			rootCount: groupRootsSet.size,
			owners: Array.from(groupOwnersSet).sort((a, b) => a.localeCompare(b)),
			roots: Array.from(groupRootsSet).sort((a, b) => a.localeCompare(b)),
			isCrossUser,
			isCrossRoot,
			hasProtectedOrigin,
			keeperIndex,
			attributedBytes: groupAttributedBytes,
			attributedBytesFormatted: formatBytes(groupAttributedBytes),
			grossBytes: groupGrossBytes,
			grossBytesFormatted: formatBytes(groupGrossBytes),
			reclaimableBytes: groupReclaimableBytes,
			reclaimableBytesFormatted: formatBytes(groupReclaimableBytes),
			estimatedMonthlyCharge: groupMonthlyCharge,
			estimatedMonthlyChargeFormatted: formatChargebackAmount(groupMonthlyCharge, currency),
			safePruneCount: groupSafePruneCount,
			safePruneBytes: groupSafePruneBytes,
			safePruneBytesFormatted: formatBytes(groupSafePruneBytes),
			duplicateRef: group,
			files: attributedFiles,
		})
	}

	const owners = Array.from(ownerMap.values())
		.map(entry => {
			const monthlyCharge = computeChargebackAmount(entry.attributedBytes, costPerGbMonth)
			const quotaUtilizationPct = quotaThresholdBytes > 0
				? Math.round((entry.attributedBytes / quotaThresholdBytes) * 1000) / 10
				: 0
			return {
				owner: entry.owner,
				attributedBytes: entry.attributedBytes,
				attributedBytesFormatted: formatBytes(entry.attributedBytes),
				grossBytes: entry.grossBytes,
				grossBytesFormatted: formatBytes(entry.grossBytes),
				groupCount: entry.groupCount,
				fileCount: entry.fileCount,
				redundantCount: entry.redundantCount,
				protectedCount: entry.protectedCount,
				crossUserGroupCount: entry.crossUserGroupCount,
				safePruneCount: entry.safePruneCount,
				safePruneBytes: entry.safePruneBytes,
				safePruneBytesFormatted: formatBytes(entry.safePruneBytes),
				estimatedMonthlyCharge: monthlyCharge,
				estimatedMonthlyChargeFormatted: formatChargebackAmount(monthlyCharge, currency),
				quotaUtilizationPct,
				overQuota: entry.attributedBytes > quotaThresholdBytes,
				roots: Array.from(entry.rootKeys).sort((a, b) => a.localeCompare(b)),
			}
		})
		.sort((a, b) => (
			b.attributedBytes - a.attributedBytes
			|| b.grossBytes - a.grossBytes
			|| a.owner.localeCompare(b.owner)
		))

	const roots = Array.from(rootMap.values())
		.map(entry => {
			const monthlyCharge = computeChargebackAmount(entry.attributedBytes, costPerGbMonth)
			return {
				rootKey: entry.rootKey,
				rootLabel: entry.rootLabel,
				rootKind: entry.rootKind,
				attributedBytes: entry.attributedBytes,
				attributedBytesFormatted: formatBytes(entry.attributedBytes),
				grossBytes: entry.grossBytes,
				grossBytesFormatted: formatBytes(entry.grossBytes),
				groupCount: entry.groupCount,
				fileCount: entry.fileCount,
				redundantCount: entry.redundantCount,
				protectedCount: entry.protectedCount,
				ownerCount: entry.owners.size,
				safePruneCount: entry.safePruneCount,
				safePruneBytes: entry.safePruneBytes,
				safePruneBytesFormatted: formatBytes(entry.safePruneBytes),
				estimatedMonthlyCharge: monthlyCharge,
				estimatedMonthlyChargeFormatted: formatChargebackAmount(monthlyCharge, currency),
			}
		})
		.sort((a, b) => (
			b.attributedBytes - a.attributedBytes
			|| b.grossBytes - a.grossBytes
			|| a.rootLabel.localeCompare(b.rootLabel)
		))

	let maxCellBytes = 0
	for (const cell of cellMap.values()) {
		if (cell.attributedBytes > maxCellBytes) {
			maxCellBytes = cell.attributedBytes
		}
	}
	if (maxCellBytes === 0) {
		for (const cell of cellMap.values()) {
			if (cell.grossBytes > maxCellBytes) {
				maxCellBytes = cell.grossBytes
			}
		}
	}

	const cellsByKey = {}
	for (const [key, cell] of cellMap.entries()) {
		const metricValue = cell.attributedBytes > 0 ? cell.attributedBytes : cell.grossBytes
		const ratio = maxCellBytes > 0 ? metricValue / maxCellBytes : 0
		const monthlyCharge = computeChargebackAmount(cell.attributedBytes, costPerGbMonth)
		cellsByKey[key] = {
			...cell,
			attributedBytesFormatted: formatBytes(cell.attributedBytes),
			grossBytesFormatted: formatBytes(cell.grossBytes),
			safePruneBytesFormatted: formatBytes(cell.safePruneBytes),
			estimatedMonthlyCharge: monthlyCharge,
			estimatedMonthlyChargeFormatted: formatChargebackAmount(monthlyCharge, currency),
			heatRatio: Math.round(ratio * 1000) / 1000,
			heatTier: classifyHeatTier(ratio),
		}
	}

	const heatmapRows = owners.map(ownerSummary => ({
		owner: ownerSummary.owner,
		ownerSummary,
		cells: roots.map(rootSummary => {
			const cellKey = `${ownerSummary.owner}::${rootSummary.rootKey}`
			if (cellsByKey[cellKey]) {
				return cellsByKey[cellKey]
			}
			return {
				cellKey,
				owner: ownerSummary.owner,
				rootKey: rootSummary.rootKey,
				rootLabel: rootSummary.rootLabel,
				rootKind: rootSummary.rootKind,
				attributedBytes: 0,
				attributedBytesFormatted: '0 B',
				grossBytes: 0,
				grossBytesFormatted: '0 B',
				fileCount: 0,
				groupCount: 0,
				redundantCount: 0,
				protectedCount: 0,
				safePruneCount: 0,
				safePruneBytes: 0,
				safePruneBytesFormatted: '0 B',
				crossUserOverlapCount: 0,
				estimatedMonthlyCharge: 0,
				estimatedMonthlyChargeFormatted: formatChargebackAmount(0, currency),
				heatRatio: 0,
				heatTier: 'none',
			}
		}),
	}))

	const crossUserPairs = Array.from(pairMap.values())
		.map(pair => {
			const monthlyCharge = computeChargebackAmount(pair.reclaimableBytes, costPerGbMonth)
			return {
				...pair,
				sharedPayloadBytesFormatted: formatBytes(pair.sharedPayloadBytes),
				reclaimableBytesFormatted: formatBytes(pair.reclaimableBytes),
				estimatedMonthlyCharge: monthlyCharge,
				estimatedMonthlyChargeFormatted: formatChargebackAmount(monthlyCharge, currency),
			}
		})
		.sort((a, b) => (
			b.reclaimableBytes - a.reclaimableBytes
			|| b.sharedGroupCount - a.sharedGroupCount
			|| a.pairKey.localeCompare(b.pairKey)
		))

	const overQuotaOwnerCount = owners.filter(o => o.overQuota).length
	const totalSafePruneCount = groups.reduce((acc, g) => acc + g.safePruneCount, 0)
	const totalSafePruneBytes = groups.reduce((acc, g) => acc + g.safePruneBytes, 0)
	const totalMonthlyCharge = computeChargebackAmount(totalAttributedBytes, costPerGbMonth)
	const safePruneMonthlySavings = computeChargebackAmount(totalSafePruneBytes, costPerGbMonth)

	return {
		schema: QUOTA_ATTRIBUTION_SCHEMA,
		policy,
		rootGranularity,
		keeperStrategy,
		costPerGbMonth,
		currency,
		quotaThresholdMb,
		quotaThresholdBytes,
		summary: {
			groupCount: groups.length,
			totalFiles,
			ownerCount: owners.length,
			rootCount: roots.length,
			crossUserGroupCount,
			crossRootGroupCount,
			totalGrossBytes,
			totalGrossBytesFormatted: formatBytes(totalGrossBytes),
			totalReclaimableBytes,
			totalReclaimableBytesFormatted: formatBytes(totalReclaimableBytes),
			totalAttributedBytes,
			totalAttributedBytesFormatted: formatBytes(totalAttributedBytes),
			estimatedMonthlyCharge: totalMonthlyCharge,
			estimatedMonthlyChargeFormatted: formatChargebackAmount(totalMonthlyCharge, currency),
			overQuotaOwnerCount,
			safePruneCount: totalSafePruneCount,
			safePruneBytes: totalSafePruneBytes,
			safePruneBytesFormatted: formatBytes(totalSafePruneBytes),
			safePruneMonthlySavings,
			safePruneMonthlySavingsFormatted: formatChargebackAmount(safePruneMonthlySavings, currency),
			maxCellBytes,
		},
		owners,
		roots,
		heatmap: {
			owners: owners.map(o => o.owner),
			roots: roots.map(r => ({
				rootKey: r.rootKey,
				rootLabel: r.rootLabel,
				rootKind: r.rootKind,
			})),
			cellsByKey,
			rows: heatmapRows,
			maxCellBytes,
		},
		crossUserPairs,
		groups,
	}
}

/**
 * Filter and sort attributed duplicate groups according to active workbench filters.
 *
 * @param {Array<object>} groups Attributed groups from buildQuotaAttributionReport.
 * @param {object} [filters] Active filter options.
 * @param {string} [filters.ownerFilter=''] Restrict to groups containing this owner.
 * @param {string} [filters.rootFilter=''] Restrict to groups containing this rootKey.
 * @param {string} [filters.pairKeyFilter=''] Restrict to groups shared by this owner pair (`ownerA::ownerB`).
 * @param {boolean} [filters.crossUserOnly=false] Only show groups spanning 2+ owners.
 * @param {boolean} [filters.overQuotaOnly=false] Only show groups involving at least one over-quota owner.
 * @param {Set<string>} [filters.overQuotaOwners] Set of owner identifiers exceeding threshold.
 * @param {string} [filters.searchQuery=''] Substring match against name, path, owner, root, or hash.
 * @param {'attributed_desc'|'gross_desc'|'owners_desc'|'copies_desc'|'name_asc'} [filters.sortBy='attributed_desc'] Sort order.
 * @return {Array<object>} Filtered and sorted groups.
 */
export function filterQuotaAttributionGroups(groups, filters = {}) {
	if (!Array.isArray(groups) || groups.length === 0) {
		return []
	}

	const ownerFilter = typeof filters.ownerFilter === 'string' ? filters.ownerFilter.trim() : ''
	const rootFilter = typeof filters.rootFilter === 'string' ? filters.rootFilter.trim() : ''
	const pairKeyFilter = typeof filters.pairKeyFilter === 'string' ? filters.pairKeyFilter.trim() : ''
	const crossUserOnly = Boolean(filters.crossUserOnly)
	const overQuotaOnly = Boolean(filters.overQuotaOnly)
	const overQuotaOwners = filters.overQuotaOwners instanceof Set ? filters.overQuotaOwners : new Set()
	const query = typeof filters.searchQuery === 'string' ? filters.searchQuery.trim().toLowerCase() : ''
	const sortBy = QUOTA_SORT_MODES.includes(filters.sortBy) ? filters.sortBy : 'attributed_desc'

	let pairOwners = null
	if (pairKeyFilter && pairKeyFilter.includes('::')) {
		const sepIndex = pairKeyFilter.indexOf('::')
		pairOwners = [pairKeyFilter.slice(0, sepIndex), pairKeyFilter.slice(sepIndex + 2)]
	}

	const filtered = groups.filter(group => {
		if (!group || typeof group !== 'object') {
			return false
		}
		if (crossUserOnly && !group.isCrossUser) {
			return false
		}
		if (ownerFilter && !group.owners.includes(ownerFilter)) {
			return false
		}
		if (rootFilter && !group.roots.includes(rootFilter)) {
			return false
		}
		if (pairOwners && (!group.owners.includes(pairOwners[0]) || !group.owners.includes(pairOwners[1]))) {
			return false
		}
		if (overQuotaOnly && !group.owners.some(o => overQuotaOwners.has(o))) {
			return false
		}
		if (ownerFilter && rootFilter) {
			const hasMatchingCell = group.files.some(f => f.owner === ownerFilter && f.rootKey === rootFilter)
			if (!hasMatchingCell) {
				return false
			}
		}
		if (query) {
			const haystack = [
				group.displayName,
				group.hash,
				...group.owners,
				...group.files.map(f => `${f.normalizedPath} ${f.rootLabel}`),
			].join(' ').toLowerCase()
			if (!haystack.includes(query)) {
				return false
			}
		}
		return true
	})

	return [...filtered].sort((a, b) => {
		if (sortBy === 'gross_desc') {
			return b.grossBytes - a.grossBytes || b.attributedBytes - a.attributedBytes || a.displayName.localeCompare(b.displayName)
		}
		if (sortBy === 'owners_desc') {
			return b.ownerCount - a.ownerCount || b.rootCount - a.rootCount || b.attributedBytes - a.attributedBytes
		}
		if (sortBy === 'copies_desc') {
			return b.fileCount - a.fileCount || b.attributedBytes - a.attributedBytes || a.displayName.localeCompare(b.displayName)
		}
		if (sortBy === 'name_asc') {
			return a.displayName.localeCompare(b.displayName) || b.attributedBytes - a.attributedBytes
		}
		return b.attributedBytes - a.attributedBytes || b.grossBytes - a.grossBytes || a.displayName.localeCompare(b.displayName)
	})
}

/**
 * Build a protected-origin and surviving-copy-safe batch prune plan across filtered groups.
 * When `ownerFilter` or `rootFilter` is set, only redundant copies matching that target are
 * queued for deletion, and at least one surviving copy per group is strictly guaranteed.
 *
 * @param {Array<object>} groups Filtered attributed groups.
 * @param {object} [options] Scope and currency options.
 * @param {string} [options.ownerFilter=''] Optional target owner filter.
 * @param {string} [options.rootFilter=''] Optional target rootKey filter.
 * @param {number} [options.costPerGbMonth=0.025] Monthly rate per GiB.
 * @param {'EUR'|'USD'|'GBP'} [options.currency='EUR'] Currency code.
 * @return {object} Safe prune execution plan.
 */
export function buildQuotaPrunePlan(groups, options = {}) {
	const ownerFilter = typeof options.ownerFilter === 'string' ? options.ownerFilter.trim() : ''
	const rootFilter = typeof options.rootFilter === 'string' ? options.rootFilter.trim() : ''
	const costPerGbMonth = parseNonNegativeNumber(options.costPerGbMonth, 0.025, 0)
	const currency = CHARGEBACK_CURRENCIES[options.currency] ? options.currency : 'EUR'

	const safeFiles = []
	const seenKeys = new Set()
	let skippedProtectedCount = 0
	let skippedLastCopyCount = 0
	let reclaimableBytes = 0

	const list = Array.isArray(groups) ? groups : []
	for (const group of list) {
		if (!group || !Array.isArray(group.files) || group.files.length < 2) {
			continue
		}

		// Guarantee at least one surviving copy (canonical keeper or protected origin)
		const candidateEntries = group.files.filter(entry => {
			if (ownerFilter && entry.owner !== ownerFilter) {
				return false
			}
			if (rootFilter && entry.rootKey !== rootFilter) {
				return false
			}
			return true
		})

		let remainingSurvivors = group.files.length
		for (const entry of candidateEntries) {
			if (entry.isProtectedOrigin) {
				skippedProtectedCount += 1
				continue
			}
			if (entry.isKeeper || remainingSurvivors <= 1) {
				skippedLastCopyCount += 1
				continue
			}
			const key = entry.selectionKey !== null && entry.selectionKey !== undefined
				? String(entry.selectionKey)
				: `${group.groupKey}:${entry.fileIndex}`
			if (seenKeys.has(key)) {
				continue
			}
			seenKeys.add(key)
			remainingSurvivors -= 1
			reclaimableBytes += entry.size
			safeFiles.push(entry.fileRef)
		}
	}

	const monthlySavings = computeChargebackAmount(reclaimableBytes, costPerGbMonth)

	return {
		safeFiles,
		safeCount: safeFiles.length,
		skippedProtectedCount,
		skippedLastCopyCount,
		reclaimableBytes,
		reclaimableBytesFormatted: formatBytes(reclaimableBytes),
		estimatedMonthlySavings: monthlySavings,
		estimatedMonthlySavingsFormatted: formatChargebackAmount(monthlySavings, currency),
	}
}

/**
 * Export the quota attribution ledger and file-level chargeback rows as CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} report Output of buildQuotaAttributionReport.
 * @param {Array<object>} [groupsOverride] Optional filtered groups subset.
 * @return {string} RFC 4180 CSV string.
 */
export function exportQuotaAttributionCsv(report, groupsOverride) {
	const header = [
		'Group ID',
		'Hash',
		'Filename',
		'Owner',
		'Root Label',
		'Root Kind',
		'Path',
		'Role',
		'Protected Origin',
		'Cross-User Group',
		'File Size (Bytes)',
		'Attributed Waste (Bytes)',
		'Policy',
		'Monthly Chargeback',
		'Currency',
	].map(escapeCsvCell).join(',')

	const rows = [header]
	const groups = Array.isArray(groupsOverride)
		? groupsOverride
		: (report && Array.isArray(report.groups) ? report.groups : [])
	const policy = report && report.policy ? report.policy : 'surplus_extra'
	const currency = report && report.currency ? report.currency : 'EUR'

	for (const group of groups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			rows.push([
				group.id,
				group.hash || '',
				file.fileName,
				file.owner,
				file.rootLabel,
				file.rootKind,
				file.normalizedPath,
				file.role,
				file.isProtectedOrigin ? 'yes' : 'no',
				group.isCrossUser ? 'yes' : 'no',
				file.size,
				file.attributedBytes,
				policy,
				file.estimatedMonthlyCharge,
				currency,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Export structured JSON chargeback report for FinOps / admin consumption.
 *
 * @param {object} report Output of buildQuotaAttributionReport.
 * @param {Array<object>} [groupsOverride] Optional filtered groups subset.
 * @return {string} Pretty-printed JSON report string.
 */
export function exportQuotaAttributionJson(report, groupsOverride) {
	const safeReport = report && typeof report === 'object' ? report : {}
	const groups = Array.isArray(groupsOverride)
		? groupsOverride
		: (Array.isArray(safeReport.groups) ? safeReport.groups : [])

	const payload = {
		schema: QUOTA_ATTRIBUTION_SCHEMA,
		policy: safeReport.policy || 'surplus_extra',
		rootGranularity: safeReport.rootGranularity || 'mount',
		keeperStrategy: safeReport.keeperStrategy || 'origin_first',
		costPerGbMonth: safeReport.costPerGbMonth || 0,
		currency: safeReport.currency || 'EUR',
		quotaThresholdMb: safeReport.quotaThresholdMb || 100,
		summary: safeReport.summary || {},
		owners: safeReport.owners || [],
		roots: safeReport.roots || [],
		crossUserPairs: safeReport.crossUserPairs || [],
		groups: groups.map(group => ({
			id: group.id,
			hash: group.hash,
			displayName: group.displayName,
			isCrossUser: group.isCrossUser,
			isCrossRoot: group.isCrossRoot,
			attributedBytes: group.attributedBytes,
			grossBytes: group.grossBytes,
			reclaimableBytes: group.reclaimableBytes,
			estimatedMonthlyCharge: group.estimatedMonthlyCharge,
			safePruneCount: group.safePruneCount,
			files: group.files.map(f => ({
				owner: f.owner,
				rootKey: f.rootKey,
				rootLabel: f.rootLabel,
				rootKind: f.rootKind,
				path: f.normalizedPath,
				role: f.role,
				size: f.size,
				attributedBytes: f.attributedBytes,
				estimatedMonthlyCharge: f.estimatedMonthlyCharge,
				isProtectedOrigin: f.isProtectedOrigin,
			})),
		})),
	}

	return JSON.stringify(payload, null, 2)
}
