/**
 * Pure Nextcloud collaborative metadata, tag, favorite, comment, version,
 * and share-link consolidation planner for DuplicateFinder.
 * Zero DOM dependencies, zero network side effects, CWE-1236-safe CSV export.
 */

import { formatBytes } from './duplicateStats'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'

export const METADATA_CONSOLIDATION_SCHEMA = 'duplicatefinder.metadata-consolidation.v1'

export const SURVIVOR_STRATEGIES = Object.freeze([
	'metadata_richness',
	'origin_and_shares',
	'preserve_oldest',
	'preserve_newest',
	'shortest_path',
])

export const CONSOLIDATION_CATEGORIES = Object.freeze([
	'all',
	'unmigrated-shares',
	'favorite-split',
	'tag-divergence',
	'comment-version-loss',
	'clean-ready',
])

export const CONSOLIDATION_SORT_MODES = Object.freeze([
	'risk_desc',
	'reclaim_desc',
	'divergence_desc',
	'name_asc',
])

/**
 * Parse a file timestamp into finite epoch milliseconds, or null when missing.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Epoch ms or null.
 */
export function parseEpochMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const key of ['mtime', 'modified', 'updatedAt', 'lastModified']) {
		const raw = file[key]
		if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') {
			continue
		}
		const candidate = typeof raw === 'object' && !(raw instanceof Date) && typeof raw.date === 'string'
			? raw.date
			: raw
		if (candidate instanceof Date) {
			const ms = candidate.getTime()
			if (Number.isFinite(ms) && ms > 0) {
				return ms
			}
			continue
		}
		if (typeof candidate === 'number') {
			if (Number.isFinite(candidate) && candidate > 0) {
				return candidate < 1e11 ? candidate * 1000 : candidate
			}
			continue
		}
		if (typeof candidate === 'string') {
			const trimmed = candidate.trim()
			if (!trimmed) {
				continue
			}
			if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
				const num = Number(trimmed)
				if (Number.isFinite(num) && num > 0) {
					return num < 1e11 ? num * 1000 : num
				}
				continue
			}
			const parsed = Date.parse(trimmed)
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Extract Nextcloud user/owner hint from a normalized Nextcloud path when explicit owner is absent.
 *
 * @param {string} normalizedPath Normalized path string.
 * @return {string} Owner string or empty string.
 */
function inferOwnerFromPath(normalizedPath) {
	if (!normalizedPath) {
		return ''
	}
	const match = /^\/([^/]+)\/files(?:\/|$)/.exec(normalizedPath)
	return match ? match[1] : ''
}

/**
 * Normalize tag list from strings or Nextcloud systemtag objects.
 *
 * @param {*} rawTags Raw tag array or comma-separated string.
 * @return {Array<string>} Deduplicated sorted tag labels.
 */
function normalizeTagsList(rawTags) {
	const items = Array.isArray(rawTags)
		? rawTags
		: (typeof rawTags === 'string' && rawTags.trim() ? rawTags.split(',') : [])
	const seenLower = new Set()
	const result = []
	for (const entry of items) {
		let label = ''
		if (typeof entry === 'string') {
			label = entry.trim()
		} else if (entry && typeof entry === 'object') {
			const rawLabel = entry.displayName || entry.name || entry.label || entry.tag || ''
			label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
		}
		if (!label) {
			continue
		}
		const lower = label.toLowerCase()
		if (seenLower.has(lower)) {
			continue
		}
		seenLower.add(lower)
		result.push(label)
	}
	result.sort((a, b) => a.localeCompare(b))
	return result
}

/**
 * Normalize share entries from explicit shares array or boolean/count properties.
 *
 * @param {object} file Duplicate file object.
 * @return {Array<object>} Normalized share records.
 */
function normalizeSharesList(file) {
	const normalized = []
	if (Array.isArray(file.shares)) {
		file.shares.forEach((share, idx) => {
			if (!share || typeof share !== 'object') {
				if (typeof share === 'string' && share.trim()) {
					normalized.push({
						id: `share-${idx}`,
						type: 'user',
						target: share.trim(),
						permissions: 'read',
						token: '',
					})
				}
				return
			}
			const rawType = String(share.type || share.shareType || '').toLowerCase()
			let type = 'user'
			if (rawType.includes('public') || rawType === '3' || share.token) {
				type = 'public_link'
			} else if (rawType.includes('group') || rawType === '1') {
				type = 'group'
			} else if (rawType.includes('federat') || rawType === '6') {
				type = 'federated'
			}
			normalized.push({
				id: share.id !== undefined ? String(share.id) : `share-${idx}`,
				type,
				target: String(share.sharedWith || share.target || share.label || (type === 'public_link' ? 'Public Link' : 'Collaborator')),
				permissions: String(share.permissionsLabel || share.permissions || 'read'),
				token: typeof share.token === 'string' ? share.token : '',
			})
		})
	}
	if (normalized.length === 0) {
		if (file.publicLink || file.shareToken) {
			normalized.push({
				id: 'public-link-0',
				type: 'public_link',
				target: 'Public Link',
				permissions: 'read',
				token: typeof file.shareToken === 'string' ? file.shareToken : '',
			})
		} else if (Array.isArray(file.sharedWith) && file.sharedWith.length > 0) {
			file.sharedWith.forEach((target, idx) => {
				const cleanTarget = String(target || '').trim()
				if (cleanTarget) {
					normalized.push({
						id: `shared-with-${idx}`,
						type: 'user',
						target: cleanTarget,
						permissions: 'read',
						token: '',
					})
				}
			})
		} else if (file.isShared || (Number(file.shareCount) || 0) > 0) {
			const count = Math.max(1, Math.min(20, Math.round(Number(file.shareCount) || 1)))
			for (let i = 0; i < count; i++) {
				normalized.push({
					id: `implicit-share-${i}`,
					type: file.shareType === 'public_link' ? 'public_link' : 'user',
					target: file.shareType === 'public_link' ? 'Public Link' : `Share #${i + 1}`,
					permissions: 'read',
					token: '',
				})
			}
		}
	}
	return normalized
}

/**
 * Extract normalized collaborative Nextcloud metadata from a duplicate file entry.
 *
 * @param {object|null|undefined} file Duplicate file entry.
 * @return {object} Normalized collaborative metadata descriptor.
 */
export function extractFileCollaborativeMetadata(file) {
	if (!file || typeof file !== 'object') {
		return {
			fileId: null,
			etag: '',
			path: '',
			fileName: '',
			folder: '',
			owner: '',
			isFavorite: false,
			tags: [],
			commentsCount: 0,
			versionsCount: 0,
			shares: [],
			shareCount: 0,
			publicLinkCount: 0,
			isInOriginFolder: false,
			richnessScore: 0,
		}
	}

	const rawPath = typeof file.path === 'string' ? file.path.trim() : ''
	const path = normalizePathForDiff(rawPath) || rawPath
	const lastSlash = path.lastIndexOf('/')
	const fileName = lastSlash >= 0 ? path.slice(lastSlash + 1) : path
	const folder = lastSlash > 0 ? path.slice(0, lastSlash) : (lastSlash === 0 ? '/' : '')
	const owner = typeof file.owner === 'string' && file.owner.trim()
		? file.owner.trim()
		: (typeof file.userId === 'string' && file.userId.trim() ? file.userId.trim() : inferOwnerFromPath(path))

	const isFavorite = Boolean(file.isFavorite || file.favorite || file.starred)
	const combinedTags = [
		...(Array.isArray(file.tags) ? file.tags : (typeof file.tags === 'string' ? file.tags.split(',') : [])),
		...(Array.isArray(file.systemtags) ? file.systemtags : []),
		...(Array.isArray(file.systemTags) ? file.systemTags : []),
	]
	const tags = normalizeTagsList(combinedTags)

	const rawComments = file.commentsCount ?? file.commentCount ?? (Array.isArray(file.comments) ? file.comments.length : 0)
	const commentsCount = Number.isFinite(Number(rawComments)) && Number(rawComments) > 0
		? Math.round(Number(rawComments))
		: 0

	const rawVersions = file.versionsCount ?? file.versionCount ?? (Array.isArray(file.versions) ? file.versions.length : 0)
	const versionsCount = Number.isFinite(Number(rawVersions)) && Number(rawVersions) > 0
		? Math.round(Number(rawVersions))
		: 0

	const shares = normalizeSharesList(file)
	const rawShareCount = Number(file.shareCount)
	const shareCount = Math.max(
		shares.length,
		Number.isFinite(rawShareCount) && rawShareCount > 0 ? Math.round(rawShareCount) : 0,
		file.isShared ? 1 : 0,
	)
	const publicLinkCount = shares.filter(s => s.type === 'public_link').length
	const isInOriginFolder = Boolean(file.isInOriginFolder)

	const richnessScore = (shareCount * 40)
		+ (isFavorite ? 25 : 0)
		+ (tags.length * 12)
		+ (commentsCount * 10)
		+ (versionsCount * 5)
		+ (isInOriginFolder ? 30 : 0)

	return {
		fileId: file.fileId ?? file.id ?? null,
		etag: typeof file.etag === 'string' ? file.etag.trim() : (typeof file.eTag === 'string' ? file.eTag.trim() : ''),
		path,
		fileName,
		folder,
		owner,
		isFavorite,
		tags,
		commentsCount,
		versionsCount,
		shares,
		shareCount,
		publicLinkCount,
		isInOriginFolder,
		richnessScore,
	}
}

/**
 * Resolve a stable group key for a duplicate group.
 *
 * @param {object} group Duplicate group object.
 * @param {number} index Group index.
 * @return {string} Deterministic group key.
 */
export function resolveConsolidationGroupKey(group, index = 0) {
	if (!group || typeof group !== 'object') {
		return `idx:${index}`
	}
	if (group.id !== null && group.id !== undefined && group.id !== '') {
		return `id:${String(group.id)}`
	}
	if (typeof group.hash === 'string' && group.hash.trim() !== '') {
		return `hash:${group.hash.trim()}`
	}
	return `idx:${index}`
}

/**
 * Compare two normalized copy entries according to the chosen survivor strategy.
 * Negative return value means `a` is preferred over `b` as survivor.
 *
 * @param {object} a First normalized copy.
 * @param {object} b Second normalized copy.
 * @param {string} strategy Survivor strategy id.
 * @return {number} Sort comparator value.
 */
function compareSurvivorPriority(a, b, strategy) {
	const ageA = a.epochMs !== null ? a.epochMs : Number.MAX_SAFE_INTEGER
	const ageB = b.epochMs !== null ? b.epochMs : Number.MAX_SAFE_INTEGER
	const lenA = a.meta.path.length || Number.MAX_SAFE_INTEGER
	const lenB = b.meta.path.length || Number.MAX_SAFE_INTEGER

	if (strategy === 'origin_and_shares') {
		if (a.meta.isInOriginFolder !== b.meta.isInOriginFolder) {
			return a.meta.isInOriginFolder ? -1 : 1
		}
		if (a.meta.shareCount !== b.meta.shareCount) {
			return b.meta.shareCount - a.meta.shareCount
		}
		if (a.meta.richnessScore !== b.meta.richnessScore) {
			return b.meta.richnessScore - a.meta.richnessScore
		}
		if (ageA !== ageB) {
			return ageA - ageB
		}
		return lenA - lenB
	}

	if (strategy === 'preserve_oldest') {
		if (ageA !== ageB) {
			return ageA - ageB
		}
		if (a.meta.richnessScore !== b.meta.richnessScore) {
			return b.meta.richnessScore - a.meta.richnessScore
		}
		return lenA - lenB
	}

	if (strategy === 'preserve_newest') {
		const newestA = a.epochMs !== null ? a.epochMs : -1
		const newestB = b.epochMs !== null ? b.epochMs : -1
		if (newestA !== newestB) {
			return newestB - newestA
		}
		if (a.meta.richnessScore !== b.meta.richnessScore) {
			return b.meta.richnessScore - a.meta.richnessScore
		}
		return lenA - lenB
	}

	if (strategy === 'shortest_path') {
		if (lenA !== lenB) {
			return lenA - lenB
		}
		if (a.meta.richnessScore !== b.meta.richnessScore) {
			return b.meta.richnessScore - a.meta.richnessScore
		}
		return ageA - ageB
	}

	// Default: metadata_richness
	if (a.meta.richnessScore !== b.meta.richnessScore) {
		return b.meta.richnessScore - a.meta.richnessScore
	}
	if (a.meta.isInOriginFolder !== b.meta.isInOriginFolder) {
		return a.meta.isInOriginFolder ? -1 : 1
	}
	if (ageA !== ageB) {
		return ageA - ageB
	}
	if (lenA !== lenB) {
		return lenA - lenB
	}
	return a.selectionKey.localeCompare(b.selectionKey)
}

/**
 * Analyze Nextcloud collaborative metadata divergence across duplicate groups.
 *
 * @param {Array<object>} duplicates Duplicate groups list.
 * @param {object} [options] Analysis options.
 * @param {string} [options.strategy='metadata_richness'] Survivor strategy.
 * @param {string} [options.category='all'] Active category filter.
 * @param {string} [options.sortMode='risk_desc'] Active sort mode.
 * @param {string} [options.searchQuery=''] Search filter query.
 * @param {boolean} [options.protectSharedCopies=true] Block deletion of copies carrying active shares.
 * @param {boolean} [options.protectFavorites=true] Hold copies whose favorite flag is missing on survivor.
 * @param {boolean} [options.requireTagMerge=true] Hold copies carrying tags missing on survivor.
 * @param {Set<string>|Array<string>} [options.acknowledgedGroupKeys] Group keys marked as migrated/verified.
 * @return {object} Complete metadata consolidation analysis report.
 */
export function analyzeMetadataConsolidation(duplicates, options = {}) {
	const list = Array.isArray(duplicates) ? duplicates : []
	const strategy = SURVIVOR_STRATEGIES.includes(options.strategy) ? options.strategy : 'metadata_richness'
	const category = CONSOLIDATION_CATEGORIES.includes(options.category) ? options.category : 'all'
	const sortMode = CONSOLIDATION_SORT_MODES.includes(options.sortMode) ? options.sortMode : 'risk_desc'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery.trim().toLowerCase() : ''
	const protectSharedCopies = options.protectSharedCopies !== false
	const protectFavorites = options.protectFavorites !== false
	const requireTagMerge = options.requireTagMerge !== false
	const acknowledgedSet = options.acknowledgedGroupKeys instanceof Set
		? options.acknowledgedGroupKeys
		: new Set(Array.isArray(options.acknowledgedGroupKeys) ? options.acknowledgedGroupKeys : [])

	const analyzedGroups = []
	const categoryCounts = {
		all: 0,
		'unmigrated-shares': 0,
		'favorite-split': 0,
		'tag-divergence': 0,
		'comment-version-loss': 0,
		'clean-ready': 0,
	}

	let totalReclaimableBytes = 0
	let totalSafeNowBytes = 0
	let totalBlockedBytes = 0
	let safeCandidateCount = 0
	let migrateCandidateCount = 0
	let blockedCandidateCount = 0
	let pendingMigrationsCount = 0

	list.forEach((group, groupIndex) => {
		if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length < 2) {
			return
		}
		const groupKey = resolveConsolidationGroupKey(group, groupIndex)
		const isGroupAcknowledged = acknowledgedSet.has(groupKey)

		const copies = group.files
			.filter(file => file && typeof file === 'object')
			.map((file, fileIdx) => {
				const meta = extractFileCollaborativeMetadata(file)
				const rawSize = Number(file.size)
				const groupSize = Number(group.size)
				const sizeBytes = Number.isFinite(rawSize) && rawSize > 0
					? rawSize
					: (Number.isFinite(groupSize) && groupSize > 0 ? groupSize : 0)
				return {
					file,
					index: fileIdx,
					selectionKey: getFileSelectionKey(file, fileIdx),
					meta,
					sizeBytes,
					formattedSize: formatBytes(sizeBytes),
					epochMs: parseEpochMs(file),
					modifiedAt: formatFileModifiedTime(file),
				}
			})

		if (copies.length < 2) {
			return
		}

		const sortedForSurvivor = [...copies].sort((a, b) => compareSurvivorPriority(a, b, strategy))
		const survivor = sortedForSurvivor[0]
		const candidates = sortedForSurvivor.slice(1)

		const unionTagsMap = new Map()
		copies.forEach(copy => {
			copy.meta.tags.forEach(tag => {
				const lower = tag.toLowerCase()
				if (!unionTagsMap.has(lower)) {
					unionTagsMap.set(lower, tag)
				}
			})
		})
		const unionTags = Array.from(unionTagsMap.values()).sort((a, b) => a.localeCompare(b))
		const survivorTagSet = new Set(survivor.meta.tags.map(t => t.toLowerCase()))
		const missingTagsOnSurvivor = unionTags.filter(tag => !survivorTagSet.has(tag.toLowerCase()))

		const anyFavorite = copies.some(copy => copy.meta.isFavorite)
		const needsFavoriteSync = anyFavorite && !survivor.meta.isFavorite
		const favoriteOwnersCount = copies.filter(copy => copy.meta.isFavorite).length

		let sharesOnCandidates = 0
		let publicLinksOnCandidates = 0
		let commentsOnCandidates = 0
		let versionsOnCandidates = 0

		const analyzedCandidates = candidates.map(copy => {
			const missingTagsFromSurvivor = copy.meta.tags.filter(tag => !survivorTagSet.has(tag.toLowerCase()))
			const hasUnmergedFavorite = copy.meta.isFavorite && !survivor.meta.isFavorite
			const hasActiveShares = copy.meta.shareCount > 0
			const hasCommentsOrVersions = copy.meta.commentsCount > 0 || copy.meta.versionsCount > 0

			sharesOnCandidates += copy.meta.shareCount
			publicLinksOnCandidates += copy.meta.publicLinkCount
			commentsOnCandidates += copy.meta.commentsCount
			versionsOnCandidates += copy.meta.versionsCount

			let copyStatus = 'safe-to-delete'
			const blockReasons = []

			if (hasActiveShares && protectSharedCopies && !isGroupAcknowledged) {
				copyStatus = 'blocked-active-share'
				blockReasons.push('Active Nextcloud share links attached')
			} else if (!isGroupAcknowledged) {
				if (hasUnmergedFavorite && protectFavorites) {
					copyStatus = 'migrate-before-delete'
					blockReasons.push('Favorite flag not present on survivor')
				}
				if (missingTagsFromSurvivor.length > 0 && requireTagMerge) {
					copyStatus = 'migrate-before-delete'
					blockReasons.push(`Carries ${missingTagsFromSurvivor.length} unmerged tag(s)`)
				}
				if (hasCommentsOrVersions) {
					copyStatus = 'migrate-before-delete'
					blockReasons.push('Has file comments or version history')
				}
			}

			return {
				...copy,
				missingTagsFromSurvivor,
				hasUnmergedFavorite,
				hasActiveShares,
				hasCommentsOrVersions,
				copyStatus,
				blockReasons,
			}
		})

		const migrationActions = []
		if (missingTagsOnSurvivor.length > 0) {
			migrationActions.push({
				id: `${groupKey}:tags`,
				kind: 'add-tags',
				severity: 'medium',
				summary: `Attach ${missingTagsOnSurvivor.length} tag(s) to survivor: ${missingTagsOnSurvivor.join(', ')}`,
				tags: missingTagsOnSurvivor,
				targetPath: survivor.meta.path,
			})
		}
		if (needsFavoriteSync) {
			migrationActions.push({
				id: `${groupKey}:favorite`,
				kind: 'set-favorite',
				severity: 'medium',
				summary: `Mark survivor as Favorite (${survivor.meta.fileName})`,
				targetPath: survivor.meta.path,
			})
		}
		if (sharesOnCandidates > 0) {
			migrationActions.push({
				id: `${groupKey}:shares`,
				kind: 'retarget-share',
				severity: 'critical',
				summary: `Retarget ${sharesOnCandidates} active share(s) (${publicLinksOnCandidates} public link(s)) before deletion`,
				targetPath: survivor.meta.path,
			})
		}
		if (commentsOnCandidates > 0 || versionsOnCandidates > 0) {
			migrationActions.push({
				id: `${groupKey}:history`,
				kind: 'archive-comments',
				severity: 'high',
				summary: `Review ${commentsOnCandidates} comment(s) and ${versionsOnCandidates} version(s) on candidate copies`,
				targetPath: survivor.meta.path,
			})
		}

		const groupCategories = []
		if (sharesOnCandidates > 0) {
			groupCategories.push('unmigrated-shares')
		}
		if (needsFavoriteSync || (anyFavorite && favoriteOwnersCount < copies.length)) {
			groupCategories.push('favorite-split')
		}
		if (missingTagsOnSurvivor.length > 0 || (unionTags.length > 0 && copies.some(c => c.meta.tags.length !== unionTags.length))) {
			groupCategories.push('tag-divergence')
		}
		if (commentsOnCandidates > 0 || versionsOnCandidates > 0) {
			groupCategories.push('comment-version-loss')
		}

		const groupSafeBytes = analyzedCandidates
			.filter(c => c.copyStatus === 'safe-to-delete')
			.reduce((sum, c) => sum + c.sizeBytes, 0)
		const groupBlockedBytes = analyzedCandidates
			.filter(c => c.copyStatus !== 'safe-to-delete')
			.reduce((sum, c) => sum + c.sizeBytes, 0)
		const groupReclaimableBytes = analyzedCandidates.reduce((sum, c) => sum + c.sizeBytes, 0)

		const isCleanReady = migrationActions.length === 0 || isGroupAcknowledged
		if (isCleanReady) {
			groupCategories.push('clean-ready')
		}

		let riskTier = 'low'
		if (sharesOnCandidates > 0 && !isGroupAcknowledged) {
			riskTier = 'critical'
		} else if ((commentsOnCandidates > 0 || versionsOnCandidates > 0 || (needsFavoriteSync && missingTagsOnSurvivor.length > 0)) && !isGroupAcknowledged) {
			riskTier = 'high'
		} else if ((needsFavoriteSync || missingTagsOnSurvivor.length > 0) && !isGroupAcknowledged) {
			riskTier = 'medium'
		}

		const riskScore = isGroupAcknowledged
			? 0
			: (sharesOnCandidates * 100) + (commentsOnCandidates * 20) + (versionsOnCandidates * 10) + (missingTagsOnSurvivor.length * 15) + (needsFavoriteSync ? 25 : 0)

		const divergenceCount = missingTagsOnSurvivor.length
			+ (needsFavoriteSync ? 1 : 0)
			+ sharesOnCandidates
			+ commentsOnCandidates
			+ versionsOnCandidates

		totalReclaimableBytes += groupReclaimableBytes
		totalSafeNowBytes += groupSafeBytes
		totalBlockedBytes += groupBlockedBytes
		safeCandidateCount += analyzedCandidates.filter(c => c.copyStatus === 'safe-to-delete').length
		migrateCandidateCount += analyzedCandidates.filter(c => c.copyStatus === 'migrate-before-delete').length
		blockedCandidateCount += analyzedCandidates.filter(c => c.copyStatus === 'blocked-active-share').length
		if (!isGroupAcknowledged) {
			pendingMigrationsCount += migrationActions.length
		}

		categoryCounts.all += 1
		for (const cat of new Set(groupCategories)) {
			if (cat in categoryCounts) {
				categoryCounts[cat] += 1
			}
		}

		analyzedGroups.push({
			groupKey,
			groupId: group.id !== undefined && group.id !== null ? group.id : groupKey,
			hash: typeof group.hash === 'string' ? group.hash : '',
			rawGroup: group,
			title: survivor.meta.fileName || survivor.meta.path || `Group ${groupKey}`,
			copiesCount: copies.length,
			survivor,
			candidates: analyzedCandidates,
			unionTags,
			missingTagsOnSurvivor,
			anyFavorite,
			needsFavoriteSync,
			sharesOnCandidates,
			publicLinksOnCandidates,
			commentsOnCandidates,
			versionsOnCandidates,
			migrationActions,
			categories: groupCategories,
			isCleanReady,
			isGroupAcknowledged,
			riskTier,
			riskScore,
			divergenceCount,
			reclaimableBytes: groupReclaimableBytes,
			reclaimableFormatted: formatBytes(groupReclaimableBytes),
			safeNowBytes: groupSafeBytes,
			safeNowFormatted: formatBytes(groupSafeBytes),
			blockedBytes: groupBlockedBytes,
			blockedBytesFormatted: formatBytes(groupBlockedBytes),
		})
	})

	let filtered = analyzedGroups
	if (category !== 'all') {
		filtered = filtered.filter(item => item.categories.includes(category))
	}
	if (searchQuery) {
		filtered = filtered.filter(item => {
			if (item.title.toLowerCase().includes(searchQuery) || item.hash.toLowerCase().includes(searchQuery)) {
				return true
			}
			if (item.unionTags.some(tag => tag.toLowerCase().includes(searchQuery))) {
				return true
			}
			return [item.survivor, ...item.candidates].some(copy =>
				copy.meta.path.toLowerCase().includes(searchQuery)
				|| copy.meta.owner.toLowerCase().includes(searchQuery))
		})
	}

	filtered = [...filtered].sort((a, b) => {
		if (sortMode === 'reclaim_desc') {
			return b.reclaimableBytes - a.reclaimableBytes || b.riskScore - a.riskScore
		}
		if (sortMode === 'divergence_desc') {
			return b.divergenceCount - a.divergenceCount || b.reclaimableBytes - a.reclaimableBytes
		}
		if (sortMode === 'name_asc') {
			return a.title.localeCompare(b.title)
		}
		// risk_desc
		return b.riskScore - a.riskScore || b.reclaimableBytes - a.reclaimableBytes
	})

	return {
		schema: METADATA_CONSOLIDATION_SCHEMA,
		strategy,
		category,
		sortMode,
		safeguards: {
			protectSharedCopies,
			protectFavorites,
			requireTagMerge,
		},
		summary: {
			totalGroups: analyzedGroups.length,
			filteredGroups: filtered.length,
			totalReclaimableBytes,
			totalReclaimableFormatted: formatBytes(totalReclaimableBytes),
			safeNowBytes: totalSafeNowBytes,
			safeNowFormatted: formatBytes(totalSafeNowBytes),
			blockedBytes: totalBlockedBytes,
			blockedBytesFormatted: formatBytes(totalBlockedBytes),
			safeCandidateCount,
			migrateCandidateCount,
			blockedCandidateCount,
			pendingMigrationsCount,
			cleanGroupsCount: categoryCounts['clean-ready'],
			categoryCounts,
		},
		items: filtered,
	}
}

/**
 * Collect candidate files eligible for immediate safe deletion (never deletes last copy).
 *
 * @param {object} report Consolidation analysis report.
 * @param {object} [options] Selection options.
 * @param {string|null} [options.groupKey=null] Restrict to a single group key when specified.
 * @return {object} Safe files list, selection keys, and total bytes.
 */
export function collectConsolidationDeleteSelection(report, options = {}) {
	const targetGroupKey = options.groupKey || null
	const items = report && Array.isArray(report.items) ? report.items : []
	const files = []
	const selectionKeys = []
	let totalBytes = 0

	for (const group of items) {
		if (targetGroupKey && group.groupKey !== targetGroupKey) {
			continue
		}
		const safeCandidates = group.candidates.filter(c => c.copyStatus === 'safe-to-delete')
		// Guarantee at least the survivor remains untouched
		const maxRemovable = Math.max(0, group.copiesCount - 1)
		for (const candidate of safeCandidates.slice(0, maxRemovable)) {
			files.push(candidate.file)
			selectionKeys.push(candidate.selectionKey)
			totalBytes += candidate.sizeBytes
		}
	}

	return {
		files,
		selectionKeys,
		totalBytes,
		totalBytesFormatted: formatBytes(totalBytes),
	}
}

/**
 * Escape a string for safe POSIX single-quoted shell literal usage.
 *
 * @param {string} value Raw string value.
 * @return {string} POSIX single-quoted literal.
 */
function shellQuote(value) {
	return `'${String(value || '').replace(/'/g, "'\\''")}'`
}

/**
 * Escape XML text nodes for WebDAV PROPPATCH payloads.
 *
 * @param {string} value Raw text.
 * @return {string} XML-escaped string.
 */
function escapeXml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;')
}

/**
 * Generate a dry-run-first POSIX bash script containing Nextcloud WebDAV PROPPATCH
 * and OCC commands to consolidate tags, favorites, and share retarget checklists
 * onto canonical survivor copies before deleting redundant duplicates.
 *
 * @param {object} report Consolidation report.
 * @param {object} [options] Script options.
 * @param {string} [options.baseUrl='https://cloud.example.com'] Nextcloud base URL.
 * @return {string} POSIX shell runbook script.
 */
export function buildWebdavMigrationScript(report, options = {}) {
	const baseUrl = typeof options.baseUrl === 'string' && options.baseUrl.trim()
		? options.baseUrl.trim().replace(/\/+$/, '')
		: 'https://cloud.example.com'
	const items = report && Array.isArray(report.items) ? report.items : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# Nextcloud DuplicateFinder Metadata Consolidation Runbook',
		`# Schema: ${METADATA_CONSOLIDATION_SCHEMA}`,
		`# Strategy: ${report && report.strategy ? report.strategy : 'metadata_richness'}`,
		'# Dry-run by default. Pass --apply and export NC_USER / NC_APP_PASSWORD to execute PROPPATCH calls.',
		'',
		'APPLY=0',
		'if [[ "$' + '{1:-}" == "--apply" ]]; then',
		'  APPLY=1',
		'fi',
		'',
		'NC_BASE_URL="$' + `{NC_BASE_URL:-${baseUrl.replace(/"/g, '\\"')}}"`,
		'NC_USER="$' + '{NC_USER:-admin}"',
		'NC_APP_PASSWORD="$' + '{NC_APP_PASSWORD:-}"',
		'OCC_BIN="$' + '{OCC_BIN:-php occ}"',
		'',
		'run_cmd() {',
		'  if [[ "$APPLY" -eq 1 ]]; then',
		'    "$@"',
		'  else',
		'    printf "[DRY-RUN] %s\\n" "$*"',
		'  fi',
		'}',
		'',
	]

	const actionableGroups = items.filter(g => g.migrationActions.length > 0 && !g.isGroupAcknowledged)
	if (actionableGroups.length === 0) {
		lines.push('echo "No unmigrated collaborative metadata differences detected in current scope."')
		lines.push('')
		return lines.join('\n')
	}

	actionableGroups.forEach(group => {
		const survivorPath = group.survivor.meta.path || ''
		const survivorId = group.survivor.meta.fileId !== null ? String(group.survivor.meta.fileId) : ''
		lines.push(`# Group ${group.groupId}: ${group.title} (Risk: ${group.riskTier})`)
		lines.push(`# Survivor: ${survivorPath}${survivorId ? ` [fileId=${survivorId}]` : ''}`)

		if (group.needsFavoriteSync) {
			const encodedPath = survivorPath.split('/').map(seg => encodeURIComponent(seg)).join('/')
			const owner = group.survivor.meta.owner || 'admin'
			const davUrl = `${baseUrl}/remote.php/dav/files/${encodeURIComponent(owner)}${encodedPath}`
			const payload = '<?xml version="1.0"?><d:propertyupdate xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:set><d:prop><oc:favorite>1</oc:favorite></d:prop></d:set></d:propertyupdate>'
			lines.push(
				`run_cmd curl -fsS -u "$NC_USER:$NC_APP_PASSWORD" -X PROPPATCH -H "Content-Type: application/xml" --data ${shellQuote(payload)} ${shellQuote(davUrl)}`,
			)
		}

		if (group.missingTagsOnSurvivor.length > 0) {
			group.missingTagsOnSurvivor.forEach(tag => {
				if (survivorId) {
					lines.push(`# Attach tag ${escapeXml(tag)} to survivor fileId ${survivorId}`)
					lines.push(
						`run_cmd curl -fsS -u "$NC_USER:$NC_APP_PASSWORD" -X PUT ${shellQuote(`${baseUrl}/remote.php/dav/systemtags-relations/files/${encodeURIComponent(survivorId)}/${encodeURIComponent(tag)}`)}`,
					)
				} else {
					lines.push(`# Attach tag ${escapeXml(tag)} manually to ${shellQuote(survivorPath)} (fileId unavailable)`)
				}
			})
		}

		if (group.sharesOnCandidates > 0) {
			lines.push(`# MANUAL ACTION REQUIRED: ${group.sharesOnCandidates} active share(s) exist on candidate copy/copies:`)
			group.candidates.filter(c => c.meta.shareCount > 0).forEach(cand => {
				lines.push(`#   - Candidate ${cand.meta.path} (${cand.meta.shareCount} share(s), ${cand.meta.publicLinkCount} public link(s))`)
			})
			lines.push(`# Inspect shares with: $OCC_BIN sharing:list --path ${shellQuote(survivorPath)}`)
		}

		if (group.commentsOnCandidates > 0 || group.versionsOnCandidates > 0) {
			lines.push(`# ADVISORY: ${group.commentsOnCandidates} comment(s) and ${group.versionsOnCandidates} file version(s) exist on candidate copies.`)
		}

		lines.push('')
	})

	return lines.join('\n')
}

/**
 * Export structured JSON consolidation manifest.
 *
 * @param {object} report Consolidation report.
 * @return {string} Pretty JSON string.
 */
export function buildConsolidationManifestJson(report) {
	const safeReport = report && typeof report === 'object' ? report : { summary: {}, items: [] }
	const payload = {
		schema: METADATA_CONSOLIDATION_SCHEMA,
		generatedAt: new Date().toISOString(),
		strategy: safeReport.strategy || 'metadata_richness',
		safeguards: safeReport.safeguards || {},
		summary: safeReport.summary || {},
		groups: (Array.isArray(safeReport.items) ? safeReport.items : []).map(group => ({
			groupKey: group.groupKey,
			groupId: group.groupId,
			hash: group.hash,
			riskTier: group.riskTier,
			isCleanReady: group.isCleanReady,
			isGroupAcknowledged: group.isGroupAcknowledged,
			survivor: {
				path: group.survivor.meta.path,
				fileId: group.survivor.meta.fileId,
				isFavorite: group.survivor.meta.isFavorite,
				tags: group.survivor.meta.tags,
				shareCount: group.survivor.meta.shareCount,
				commentsCount: group.survivor.meta.commentsCount,
				versionsCount: group.survivor.meta.versionsCount,
				richnessScore: group.survivor.meta.richnessScore,
			},
			missingTagsOnSurvivor: group.missingTagsOnSurvivor,
			needsFavoriteSync: group.needsFavoriteSync,
			sharesOnCandidates: group.sharesOnCandidates,
			migrationActions: group.migrationActions,
			candidates: group.candidates.map(cand => ({
				path: cand.meta.path,
				fileId: cand.meta.fileId,
				sizeBytes: cand.sizeBytes,
				copyStatus: cand.copyStatus,
				blockReasons: cand.blockReasons,
				isFavorite: cand.meta.isFavorite,
				tags: cand.meta.tags,
				shareCount: cand.meta.shareCount,
				commentsCount: cand.meta.commentsCount,
				versionsCount: cand.meta.versionsCount,
			})),
		})),
	}
	return JSON.stringify(payload, null, 2)
}

/**
 * Export CWE-1236 formula-injection-safe CSV audit report.
 *
 * @param {object} report Consolidation report.
 * @return {string} CSV document string.
 */
export function buildConsolidationCsv(report) {
	const headers = [
		'Group ID',
		'Risk Tier',
		'Copy Role',
		'Copy Status',
		'Path',
		'Size Bytes',
		'Favorite',
		'Tags',
		'Comments',
		'Versions',
		'Shares',
		'Missing Tags To Migrate',
		'Survivor Path',
	]
	const rows = [headers.map(h => escapeCsvCell(h)).join(',')]
	const items = report && Array.isArray(report.items) ? report.items : []

	for (const group of items) {
		const survivorRow = [
			group.groupId,
			group.riskTier,
			'survivor',
			'protected-survivor',
			group.survivor.meta.path,
			group.survivor.sizeBytes,
			group.survivor.meta.isFavorite ? 'yes' : 'no',
			group.survivor.meta.tags.join('; '),
			group.survivor.meta.commentsCount,
			group.survivor.meta.versionsCount,
			group.survivor.meta.shareCount,
			group.missingTagsOnSurvivor.join('; '),
			group.survivor.meta.path,
		]
		rows.push(survivorRow.map(cell => escapeCsvCell(cell)).join(','))

		for (const cand of group.candidates) {
			const candRow = [
				group.groupId,
				group.riskTier,
				'candidate',
				cand.copyStatus,
				cand.meta.path,
				cand.sizeBytes,
				cand.meta.isFavorite ? 'yes' : 'no',
				cand.meta.tags.join('; '),
				cand.meta.commentsCount,
				cand.meta.versionsCount,
				cand.meta.shareCount,
				cand.missingTagsFromSurvivor.join('; '),
				group.survivor.meta.path,
			]
			rows.push(candRow.map(cell => escapeCsvCell(cell)).join(','))
		}
	}

	return rows.join('\n')
}
