/**
 * Pure Orphaned Nextcloud Preview/Thumbnail & Cache Reclaim Analyzer.
 * Inspects Nextcloud preview pyramids (appdata_<id>/preview/...), OS/NAS
 * thumbnail caches (Thumbs.db, .DS_Store, .thumbnails, @eaDir), Nextcloud
 * trashbin/version duplicates, and sync temp caches with deterministic orphan
 * correlation, HiDPI tier breakdown, safe survivor-preserving reclaim plans,
 * OCC cleanup script generation, and CWE-1236-safe CSV/JSON exports.
 * Zero DOM dependencies, zero network side effects.
 */

import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const PREVIEW_CACHE_SCHEMA = 'duplicatefinder.preview-cache-reclaim.v1'

export const CACHE_CATEGORIES = Object.freeze([
	'nextcloud_preview',
	'os_thumbnail',
	'nextcloud_versions_trash',
	'sync_temp_cache',
])

export const PREVIEW_CACHE_SORT_MODES = Object.freeze([
	'reclaim_desc',
	'count_desc',
	'largest_file_desc',
	'name_asc',
])

export const PREVIEW_DIMENSION_THRESHOLDS = Object.freeze([
	0,
	256,
	512,
	1024,
	2048,
])

const CATEGORY_LABELS = Object.freeze({
	nextcloud_preview: 'Nextcloud preview pyramid',
	os_thumbnail: 'OS & NAS thumbnail cache',
	nextcloud_versions_trash: 'Trashbin & file versions',
	sync_temp_cache: 'Sync & temp cache',
	source_file: 'Active source file',
})

const DIMENSION_TIER_LABELS = Object.freeze({
	micro: 'Micro (<= 256px)',
	standard: 'Standard (257-1024px)',
	hidpi: 'HiDPI (> 1024px)',
	unknown: 'Unspecified size',
})

const MS_PER_DAY = 86400 * 1000
const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

const OS_THUMBNAIL_NAMES = new Set([
	'thumbs.db',
	'ehthumbs.db',
	'ehthumbs_vista.db',
	'.ds_store',
	'desktop.ini',
	'picasa.ini',
	'.picasa.ini',
])

/**
 * Normalize raw path into forward-slash canonical string.
 *
 * @param {string|null|undefined} rawPath Raw path candidate.
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
	return cleaned.length > 1 ? cleaned.replace(/\/+$/, '') : cleaned
}

/**
 * Extract safe basename from a file entry or normalized path.
 *
 * @param {object|null|undefined} file File object.
 * @param {string} normalizedPath Normalized path string.
 * @return {string} Basename string.
 */
function extractBasename(file, normalizedPath) {
	if (file && typeof file.name === 'string' && file.name.trim()) {
		return file.name.replace(/[\r\n\t\0]/g, ' ').trim()
	}
	if (!normalizedPath) {
		return 'unknown'
	}
	const slashIndex = normalizedPath.lastIndexOf('/')
	return slashIndex >= 0 ? normalizedPath.slice(slashIndex + 1) || 'unknown' : normalizedPath
}

/**
 * Parse a timestamp value (seconds, ms, Date, or ISO string) into milliseconds.
 *
 * @param {*} value Raw timestamp candidate.
 * @return {number|null} Timestamp in milliseconds or null.
 */
function parseTimestampMs(value) {
	if (value === null || value === undefined || value === '') {
		return null
	}
	if (value instanceof Date) {
		const ms = value.getTime()
		return Number.isFinite(ms) ? ms : null
	}
	let numeric = null
	if (typeof value === 'number') {
		numeric = Number.isFinite(value) ? value : null
	} else if (typeof value === 'string') {
		const trimmed = value.trim()
		if (!trimmed) {
			return null
		}
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			const parsedNum = Number(trimmed)
			numeric = Number.isFinite(parsedNum) ? parsedNum : null
		} else {
			const parsedIso = Date.parse(trimmed)
			return Number.isFinite(parsedIso) ? parsedIso : null
		}
	}
	if (numeric === null || numeric <= 0) {
		return null
	}
	// Heuristic: Unix seconds (< 1e11) vs milliseconds
	return numeric < 1e11 ? Math.round(numeric * 1000) : Math.round(numeric)
}

/**
 * Resolve modification timestamp in ms from a file object.
 *
 * @param {object|null|undefined} file File entry.
 * @return {number|null} Timestamp in milliseconds or null.
 */
function getFileTimestampMs(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(file, field)) {
			const parsed = parseTimestampMs(file[field])
			if (parsed !== null) {
				return parsed
			}
		}
	}
	return null
}

/**
 * Escape a string for safe inclusion inside POSIX single-quoted shell literals.
 *
 * @param {string} value Raw string.
 * @return {string} Single-quoted POSIX string.
 */
function shellQuote(value) {
	const safe = String(value ?? '').replace(/[\r\n\0]/g, '')
	return `'${safe.replace(/'/g, "'\\''")}'`
}

/**
 * Parse Nextcloud preview pyramid metadata from a normalized path and basename.
 *
 * @param {string} normalizedPath Canonical forward-slash path.
 * @param {string} fileName Basename of the file.
 * @return {object} Parsed preview metadata.
 */
export function parsePreviewMetadata(normalizedPath, fileName) {
	const empty = {
		isNextcloudPreview: false,
		instanceId: '',
		previewFileId: null,
		width: null,
		height: null,
		maxDimension: 0,
		dimensionLabel: 'unknown',
		tier: 'unknown',
	}

	const pathLower = String(normalizedPath || '').toLowerCase()
	const baseName = String(fileName || '').trim()
	const baseLower = baseName.toLowerCase()

	const appdataMatch = String(normalizedPath || '').match(/(?:^|\/)appdata_([^/]+)\/preview(?:\/|$)/i)
	const bucketPreviewMatch = /(?:^|\/)preview\/(?:[0-9a-f]\/){2,}/i.test(pathLower)
	const previewDirMatch = /(?:^|\/)preview(?:s)?(?:\/|$)/i.test(pathLower)
	const dimFileMatch = baseLower.match(/^(\d{2,5})-(\d{2,5})(?:-max|-crop|-x)?\.(?:jpe?g|png|webp|avif|gif)$/)
	const maxFileMatch = baseLower.match(/^max\.(?:jpe?g|png|webp|avif|gif)$/)

	const isNextcloudPreview = Boolean(
		appdataMatch
		|| bucketPreviewMatch
		|| (previewDirMatch && (dimFileMatch || maxFileMatch)),
	)

	if (!isNextcloudPreview) {
		return empty
	}

	const instanceId = appdataMatch && appdataMatch[1]
		? appdataMatch[1].replace(/[^a-zA-Z0-9_-]/g, '')
		: 'default'

	let previewFileId = null
	const segments = String(normalizedPath || '').split('/').filter(Boolean)
	if (segments.length >= 2) {
		const parentSeg = segments[segments.length - 2]
		if (/^\d{1,15}$/.test(parentSeg)) {
			previewFileId = parentSeg
		} else if (segments.length >= 3 && /^\d{1,15}$/.test(segments[segments.length - 3])) {
			previewFileId = segments[segments.length - 3]
		}
	}

	let width = null
	let height = null
	let maxDimension = 0
	let dimensionLabel = 'unknown'
	let tier = 'unknown'

	if (dimFileMatch) {
		const parsedW = Number(dimFileMatch[1])
		const parsedH = Number(dimFileMatch[2])
		if (Number.isFinite(parsedW) && parsedW > 0 && Number.isFinite(parsedH) && parsedH > 0) {
			width = parsedW
			height = parsedH
			maxDimension = Math.max(parsedW, parsedH)
			dimensionLabel = `${parsedW}x${parsedH}`
			if (maxDimension <= 256) {
				tier = 'micro'
			} else if (maxDimension <= 1024) {
				tier = 'standard'
			} else {
				tier = 'hidpi'
			}
		}
	} else if (maxFileMatch) {
		dimensionLabel = 'max'
		tier = 'hidpi'
		maxDimension = 2048
	}

	return {
		isNextcloudPreview: true,
		instanceId,
		previewFileId,
		width,
		height,
		maxDimension,
		dimensionLabel,
		tier,
	}
}

/**
 * Classify a single file entry for Nextcloud preview/thumbnail/cache status.
 *
 * @param {object|null|undefined} file File entry.
 * @param {object} [options] Classification options.
 * @param {Set<string>|Array<string|number>} [options.knownSourceFileIds] Known active source file IDs.
 * @param {number} [options.referenceNowMs] Deterministic reference timestamp in ms.
 * @param {number} [options.staleDays=30] Age threshold in days for stale cache tagging.
 * @return {object} Classification descriptor.
 */
export function classifyCacheArtifact(file, options = {}) {
	const rawPath = file && typeof file === 'object' ? (file.path || file.name || '') : ''
	const normalizedPath = sanitizePath(normalizePathForDiff(rawPath) || rawPath)
	const fileName = extractBasename(file, normalizedPath)
	const lowerPath = normalizedPath.toLowerCase()
	const lowerName = fileName.toLowerCase()

	const staleDays = Number.isFinite(Number(options.staleDays)) && Number(options.staleDays) >= 0
		? Number(options.staleDays)
		: 30
	const referenceNowMs = Number.isFinite(Number(options.referenceNowMs)) && Number(options.referenceNowMs) > 0
		? Number(options.referenceNowMs)
		: Date.now()

	const mtimeMs = getFileTimestampMs(file)
	const ageDays = mtimeMs !== null
		? Math.max(0, Math.floor((referenceNowMs - mtimeMs) / MS_PER_DAY))
		: null
	const isStale = ageDays !== null && ageDays >= staleDays

	let knownSourceSet = null
	if (options.knownSourceFileIds instanceof Set) {
		knownSourceSet = options.knownSourceFileIds
	} else if (Array.isArray(options.knownSourceFileIds)) {
		knownSourceSet = new Set(options.knownSourceFileIds.map(id => String(id)))
	}

	const previewMeta = parsePreviewMetadata(normalizedPath, fileName)

	let category = 'source_file'
	let regenerable = false
	let reason = 'Active non-cache user file'

	if (previewMeta.isNextcloudPreview) {
		category = 'nextcloud_preview'
		regenerable = true
		reason = previewMeta.tier === 'hidpi'
			? 'High-resolution Nextcloud preview pyramid artifact'
			: 'Nextcloud preview pyramid artifact'
	} else if (
		/(?:^|\/)(?:files_trashbin|files_versions)(?:\/|$)/i.test(lowerPath)
		|| /\.v\d{6,12}$/i.test(lowerName)
	) {
		category = 'nextcloud_versions_trash'
		regenerable = false
		reason = lowerPath.includes('files_trashbin')
			? 'Duplicate inside Nextcloud trashbin'
			: 'Duplicate inside Nextcloud file versions'
	} else if (
		OS_THUMBNAIL_NAMES.has(lowerName)
		|| lowerName.startsWith('._')
		|| lowerName.startsWith('synofile_thumb_')
		|| /(?:^|\/)(?:\.thumbnails|@eadir|\.synologyworkingdirectory|\.picasaoriginals|\.bridgecache|\.appledouble)(?:\/|$)/i.test(lowerPath)
	) {
		category = 'os_thumbnail'
		regenerable = true
		reason = 'OS or NAS thumbnail index / resource fork'
	} else if (
		/(?:^|\/)(?:\.cache|cache|tmp|\.tmp)(?:\/|$)/i.test(lowerPath)
		|| /\.(?:tmp|part|crdownload|bak~)$/i.test(lowerName)
		|| /^\.~lock\./i.test(lowerName)
		|| /^\.owncloudsync\.log/i.test(lowerName)
		|| /^\._sync_[a-f0-9]+\.db/i.test(lowerName)
	) {
		category = 'sync_temp_cache'
		regenerable = true
		reason = 'Client sync or temporary cache artifact'
	}

	const isCacheArtifact = category !== 'source_file'
	let isOrphaned = false
	let orphanStatus = isCacheArtifact ? 'regenerable_cache' : 'active_source'

	if (category === 'nextcloud_preview') {
		const explicitOrphan = Boolean(file && file.isOrphanedPreview)
		const inTrashOrBackup = /(?:^|\/)(?:backup|old|archive|files_trashbin)(?:\/|$)/i.test(lowerPath)
		const fileIdMissingFromSources = Boolean(
			previewMeta.previewFileId
			&& (!knownSourceSet || !knownSourceSet.has(String(previewMeta.previewFileId))),
		)
		if (explicitOrphan || inTrashOrBackup || fileIdMissingFromSources) {
			isOrphaned = true
			orphanStatus = 'orphaned_preview'
			reason = explicitOrphan || inTrashOrBackup
				? 'Orphaned Nextcloud preview outside live appdata root'
				: `Orphaned preview (source fileId ${previewMeta.previewFileId} not in active source index)`
		} else if (isStale) {
			orphanStatus = 'stale_cache'
		}
	} else if (isCacheArtifact && isStale) {
		orphanStatus = 'stale_cache'
	}

	return {
		isCacheArtifact,
		category,
		categoryLabel: CATEGORY_LABELS[category] || CATEGORY_LABELS.source_file,
		regenerable,
		orphanStatus,
		isOrphaned,
		previewMeta,
		mtimeMs,
		ageDays,
		isStale,
		normalizedPath,
		fileName,
		reason,
	}
}

/**
 * Collect active non-cache source file IDs from loaded duplicate groups.
 *
 * @param {Array<object>} duplicates Loaded duplicate groups.
 * @return {Set<string>} Set of active non-cache source file IDs.
 */
function collectSourceFileIdIndex(duplicates) {
	const index = new Set()
	if (!Array.isArray(duplicates)) {
		return index
	}
	for (const duplicate of duplicates) {
		if (!duplicate || typeof duplicate !== 'object' || !Array.isArray(duplicate.files)) {
			continue
		}
		for (const file of duplicate.files) {
			if (!file || typeof file !== 'object') {
				continue
			}
			const rawPath = sanitizePath(normalizePathForDiff(file.path || file.name || '') || file.path || '')
			const baseName = extractBasename(file, rawPath)
			const meta = parsePreviewMetadata(rawPath, baseName)
			const lowerPath = rawPath.toLowerCase()
			const isNonSource = meta.isNextcloudPreview
				|| /(?:^|\/)(?:files_trashbin|files_versions|\.thumbnails|@eadir|\.cache|cache|tmp)(?:\/|$)/i.test(lowerPath)
				|| OS_THUMBNAIL_NAMES.has(baseName.toLowerCase())
			if (isNonSource) {
				continue
			}
			for (const candidateId of [file.fileId, file.nodeId, file.id]) {
				if (candidateId !== null && candidateId !== undefined && candidateId !== '') {
					index.add(String(candidateId))
				}
			}
		}
	}
	return index
}

/**
 * Build a complete Preview/Thumbnail & Cache Reclaim Audit Report.
 *
 * @param {Array<object>} duplicates Duplicate groups from store.
 * @param {object} [options] Analysis options.
 * @param {number} [options.minPreviewDimension=0] Minimum preview width/height filter.
 * @param {number} [options.staleDays=30] Age threshold in days.
 * @param {Set<string>|Array<string|number>} [options.knownSourceFileIds] Optional external source fileId set.
 * @param {number} [options.referenceNowMs] Optional deterministic reference timestamp in ms.
 * @return {object} Structured audit report.
 */
export function buildPreviewCacheReport(duplicates, options = {}) {
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const minPreviewDimension = Number.isFinite(Number(options.minPreviewDimension)) && Number(options.minPreviewDimension) > 0
		? Number(options.minPreviewDimension)
		: 0

	const autoSourceIndex = collectSourceFileIdIndex(safeDuplicates)
	let knownSourceSet = autoSourceIndex
	if (options.knownSourceFileIds instanceof Set) {
		knownSourceSet = new Set([...autoSourceIndex, ...options.knownSourceFileIds])
	} else if (Array.isArray(options.knownSourceFileIds)) {
		knownSourceSet = new Set([...autoSourceIndex, ...options.knownSourceFileIds.map(v => String(v))])
	}

	const categoryMap = new Map()
	for (const cat of CACHE_CATEGORIES) {
		categoryMap.set(cat, {
			category: cat,
			label: CATEGORY_LABELS[cat],
			artifactCount: 0,
			totalBytes: 0,
			reclaimableBytes: 0,
			orphanedCount: 0,
		})
	}

	const dimensionMap = new Map([
		['micro', { tier: 'micro', label: DIMENSION_TIER_LABELS.micro, count: 0, totalBytes: 0 }],
		['standard', { tier: 'standard', label: DIMENSION_TIER_LABELS.standard, count: 0, totalBytes: 0 }],
		['hidpi', { tier: 'hidpi', label: DIMENSION_TIER_LABELS.hidpi, count: 0, totalBytes: 0 }],
		['unknown', { tier: 'unknown', label: DIMENSION_TIER_LABELS.unknown, count: 0, totalBytes: 0 }],
	])

	const instanceMap = new Map()
	const enrichedGroups = []

	let totalCacheArtifactsCount = 0
	let totalCacheBytes = 0
	let totalReclaimableBytes = 0
	let orphanedPreviewCount = 0
	let orphanedPreviewBytes = 0
	let hidpiPreviewCount = 0
	let hidpiPreviewBytes = 0
	let regenerableBytes = 0
	let protectedOriginSkippedCount = 0

	for (let gIdx = 0; gIdx < safeDuplicates.length; gIdx++) {
		const duplicate = safeDuplicates[gIdx]
		if (!duplicate || typeof duplicate !== 'object') {
			continue
		}
		const rawFiles = Array.isArray(duplicate.files) ? duplicate.files : []
		if (rawFiles.length === 0) {
			continue
		}

		const reclaimInfo = computeGroupReclaimableInfo(duplicate)
		const classifiedFiles = []
		let groupCacheCount = 0
		let groupCacheBytes = 0
		let groupOrphanCount = 0
		let groupMaxDim = 0
		let groupHasProtected = false
		let groupHasLocked = false
		let groupHasRegenerable = false
		const groupCategoryCounts = new Map()

		for (let fIdx = 0; fIdx < rawFiles.length; fIdx++) {
			const file = rawFiles[fIdx]
			if (!file || typeof file !== 'object') {
				continue
			}
			const sizeBytes = Number.isFinite(Number(file.size)) && Number(file.size) > 0
				? Math.floor(Number(file.size))
				: 0
			const isProtected = Boolean(file.isInOriginFolder)
			const isLocked = Boolean(file.locked)
			if (isProtected) {
				groupHasProtected = true
			}
			if (isLocked) {
				groupHasLocked = true
			}

			const classification = classifyCacheArtifact(file, {
				knownSourceFileIds: knownSourceSet,
				referenceNowMs: options.referenceNowMs,
				staleDays: options.staleDays,
			})

			if (classification.isCacheArtifact) {
				groupCacheCount += 1
				groupCacheBytes += sizeBytes
				totalCacheArtifactsCount += 1
				totalCacheBytes += sizeBytes
				if (classification.regenerable) {
					groupHasRegenerable = true
					regenerableBytes += sizeBytes
				}
				if (isProtected) {
					protectedOriginSkippedCount += 1
				}

				groupCategoryCounts.set(
					classification.category,
					(groupCategoryCounts.get(classification.category) || 0) + 1,
				)

				const catBucket = categoryMap.get(classification.category)
				if (catBucket) {
					catBucket.artifactCount += 1
					catBucket.totalBytes += sizeBytes
					if (classification.isOrphaned) {
						catBucket.orphanedCount += 1
					}
				}

				if (classification.category === 'nextcloud_preview') {
					const dim = classification.previewMeta.maxDimension || 0
					if (dim > groupMaxDim) {
						groupMaxDim = dim
					}
					const tierBucket = dimensionMap.get(classification.previewMeta.tier || 'unknown')
					if (tierBucket) {
						tierBucket.count += 1
						tierBucket.totalBytes += sizeBytes
					}
					if (classification.previewMeta.tier === 'hidpi') {
						hidpiPreviewCount += 1
						hidpiPreviewBytes += sizeBytes
					}
					if (classification.isOrphaned) {
						groupOrphanCount += 1
						orphanedPreviewCount += 1
						orphanedPreviewBytes += sizeBytes
					}
					const instId = classification.previewMeta.instanceId || 'default'
					if (!instanceMap.has(instId)) {
						instanceMap.set(instId, {
							instanceId: instId,
							artifactCount: 0,
							totalBytes: 0,
							orphanedCount: 0,
						})
					}
					const instEntry = instanceMap.get(instId)
					instEntry.artifactCount += 1
					instEntry.totalBytes += sizeBytes
					if (classification.isOrphaned) {
						instEntry.orphanedCount += 1
					}
				}
			}

			classifiedFiles.push({
				...file,
				fileIndex: fIdx,
				selectionKey: getFileSelectionKey(file) ?? `${gIdx}:${fIdx}`,
				sizeBytes,
				sizeFormatted: formatBytes(sizeBytes),
				isProtected,
				isLocked,
				isCacheArtifact: classification.isCacheArtifact,
				artifactCategory: classification.category,
				categoryLabel: classification.categoryLabel,
				regenerable: classification.regenerable,
				orphanStatus: classification.orphanStatus,
				isOrphaned: classification.isOrphaned,
				previewMeta: classification.previewMeta,
				ageDays: classification.ageDays,
				isStale: classification.isStale,
				normalizedPath: classification.normalizedPath || extractBasename(file, ''),
				fileName: classification.fileName,
				reason: classification.reason,
			})
		}

		if (groupCacheCount === 0) {
			continue
		}

		if (minPreviewDimension > 0 && groupMaxDim < minPreviewDimension) {
			continue
		}

		// Determine dominant cache category for the group
		let dominantCategory = 'nextcloud_preview'
		let bestCount = -1
		for (const [cat, count] of groupCategoryCounts.entries()) {
			if (count > bestCount) {
				bestCount = count
				dominantCategory = cat
			}
		}

		// Safe reclaimable bytes within this group: preserve at least 1 surviving copy
		// and preserve all protected/locked files
		const nonCacheCount = classifiedFiles.filter(f => !f.isCacheArtifact).length
		const safeCacheCandidates = classifiedFiles.filter(f => f.isCacheArtifact && !f.isProtected && !f.isLocked)
		const maxDeletableCopies = nonCacheCount > 0
			? safeCacheCandidates.length
			: Math.max(0, Math.min(safeCacheCandidates.length, classifiedFiles.length - 1))
		const groupReclaimableBytes = safeCacheCandidates
			.slice(0, maxDeletableCopies)
			.reduce((sum, f) => sum + f.sizeBytes, 0)

		totalReclaimableBytes += groupReclaimableBytes
		const catBucket = categoryMap.get(dominantCategory)
		if (catBucket) {
			catBucket.reclaimableBytes += groupReclaimableBytes
		}

		const firstFile = classifiedFiles[0]
		const largestFileSize = classifiedFiles.reduce((max, f) => Math.max(max, f.sizeBytes), 0)

		enrichedGroups.push({
			groupKey: duplicate.id !== undefined && duplicate.id !== null
				? String(duplicate.id)
				: (duplicate.hash || `group-${gIdx}`),
			id: duplicate.id ?? null,
			hash: typeof duplicate.hash === 'string' ? duplicate.hash : '',
			displayName: firstFile ? firstFile.fileName : 'Unnamed cache group',
			fileCount: classifiedFiles.length,
			cacheArtifactCount: groupCacheCount,
			orphanedCount: groupOrphanCount,
			dominantCategory,
			dominantCategoryLabel: CATEGORY_LABELS[dominantCategory] || dominantCategory,
			maxPreviewDimension: groupMaxDim,
			hasProtectedOrigin: groupHasProtected,
			hasLockedFiles: groupHasLocked,
			hasRegenerable: groupHasRegenerable,
			safeDeletableCount: maxDeletableCopies,
			totalGroupBytes: classifiedFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
			totalGroupBytesFormatted: formatBytes(classifiedFiles.reduce((sum, f) => sum + f.sizeBytes, 0)),
			cacheBytes: groupCacheBytes,
			cacheBytesFormatted: formatBytes(groupCacheBytes),
			reclaimableBytes: groupReclaimableBytes > 0 ? groupReclaimableBytes : reclaimInfo.reclaimableBytes,
			reclaimableBytesFormatted: formatBytes(groupReclaimableBytes > 0 ? groupReclaimableBytes : reclaimInfo.reclaimableBytes),
			largestFileSize,
			files: classifiedFiles,
			duplicateRef: duplicate,
		})
	}

	const categoryBreakdown = Array.from(categoryMap.values()).map(entry => ({
		...entry,
		totalBytesFormatted: formatBytes(entry.totalBytes),
		reclaimableBytesFormatted: formatBytes(entry.reclaimableBytes),
		sharePercent: totalCacheBytes > 0
			? Math.round((entry.totalBytes / totalCacheBytes) * 100)
			: 0,
	}))

	const dimensionBuckets = Array.from(dimensionMap.values()).map(entry => ({
		...entry,
		totalBytesFormatted: formatBytes(entry.totalBytes),
	}))

	const instanceBuckets = Array.from(instanceMap.values())
		.sort((a, b) => b.totalBytes - a.totalBytes || a.instanceId.localeCompare(b.instanceId))
		.map(entry => ({
			...entry,
			totalBytesFormatted: formatBytes(entry.totalBytes),
		}))

	const regenerablePercent = totalCacheBytes > 0
		? Math.round((regenerableBytes / totalCacheBytes) * 100)
		: 0

	return {
		schema: PREVIEW_CACHE_SCHEMA,
		summary: {
			totalGroupsInspected: safeDuplicates.length,
			matchedGroupsCount: enrichedGroups.length,
			totalCacheArtifactsCount,
			totalCacheBytes,
			totalCacheBytesFormatted: formatBytes(totalCacheBytes),
			reclaimableBytes: totalReclaimableBytes,
			reclaimableBytesFormatted: formatBytes(totalReclaimableBytes),
			orphanedPreviewCount,
			orphanedPreviewBytes,
			orphanedPreviewBytesFormatted: formatBytes(orphanedPreviewBytes),
			hidpiPreviewCount,
			hidpiPreviewBytes,
			hidpiPreviewBytesFormatted: formatBytes(hidpiPreviewBytes),
			regenerableBytes,
			regenerableBytesFormatted: formatBytes(regenerableBytes),
			regenerablePercent,
			protectedOriginSkippedCount,
		},
		categoryBreakdown,
		dimensionBuckets,
		instanceBuckets,
		groups: enrichedGroups,
	}
}

/**
 * Filter and sort cache-bearing duplicate groups deterministically.
 *
 * @param {Array<object>} groups Enriched groups from buildPreviewCacheReport.
 * @param {object} [filters] Active filter options.
 * @param {string} [filters.categoryFilter='all'] Category filter or 'all'.
 * @param {boolean} [filters.orphanOnly=false] Only show groups with orphaned previews.
 * @param {number} [filters.minPreviewDimension=0] Minimum preview dimension threshold.
 * @param {string} [filters.instanceFilter=''] Optional appdata instanceId filter.
 * @param {string} [filters.searchQuery=''] Case-insensitive path/filename/hash query.
 * @param {string} [filters.sortMode='reclaim_desc'] Deterministic sort mode.
 * @return {Array<object>} Filtered and sorted group list.
 */
export function filterPreviewCacheGroups(groups, filters = {}) {
	if (!Array.isArray(groups)) {
		return []
	}
	const categoryFilter = typeof filters.categoryFilter === 'string' && filters.categoryFilter !== ''
		? filters.categoryFilter
		: 'all'
	const orphanOnly = Boolean(filters.orphanOnly)
	const minDim = Number.isFinite(Number(filters.minPreviewDimension)) && Number(filters.minPreviewDimension) > 0
		? Number(filters.minPreviewDimension)
		: 0
	const instanceFilter = typeof filters.instanceFilter === 'string' ? filters.instanceFilter.trim() : ''
	const query = typeof filters.searchQuery === 'string' ? filters.searchQuery.trim().toLowerCase() : ''
	const sortMode = PREVIEW_CACHE_SORT_MODES.includes(filters.sortMode)
		? filters.sortMode
		: 'reclaim_desc'

	const filtered = groups.filter(group => {
		if (!group || typeof group !== 'object') {
			return false
		}
		if (categoryFilter !== 'all') {
			const hasCategory = Array.isArray(group.files)
				&& group.files.some(f => f.artifactCategory === categoryFilter)
			if (!hasCategory) {
				return false
			}
		}
		if (orphanOnly && Number(group.orphanedCount) <= 0) {
			return false
		}
		if (minDim > 0 && Number(group.maxPreviewDimension) < minDim) {
			return false
		}
		if (instanceFilter) {
			const matchesInstance = Array.isArray(group.files)
				&& group.files.some(f => f.previewMeta && f.previewMeta.instanceId === instanceFilter)
			if (!matchesInstance) {
				return false
			}
		}
		if (query) {
			const haystacks = [
				group.displayName || '',
				group.hash || '',
				group.dominantCategoryLabel || '',
				...(Array.isArray(group.files) ? group.files.map(f => f.normalizedPath || '') : []),
			]
			if (!haystacks.some(text => String(text).toLowerCase().includes(query))) {
				return false
			}
		}
		return true
	})

	const sorted = [...filtered]
	sorted.sort((a, b) => {
		if (sortMode === 'count_desc') {
			const diff = (b.cacheArtifactCount || 0) - (a.cacheArtifactCount || 0)
			if (diff !== 0) {
				return diff
			}
		} else if (sortMode === 'largest_file_desc') {
			const diff = (b.largestFileSize || 0) - (a.largestFileSize || 0)
			if (diff !== 0) {
				return diff
			}
		} else if (sortMode === 'name_asc') {
			const cmp = String(a.displayName || '').localeCompare(String(b.displayName || ''))
			if (cmp !== 0) {
				return cmp
			}
		} else {
			const diff = (b.reclaimableBytes || 0) - (a.reclaimableBytes || 0)
			if (diff !== 0) {
				return diff
			}
		}
		return String(a.groupKey || '').localeCompare(String(b.groupKey || ''))
	})

	return sorted
}

/**
 * Build a survivor-preserving, protected-origin-safe reclaim plan for cache artifacts.
 *
 * @param {Array<object>} groups Filtered enriched groups.
 * @param {object} [options] Plan options.
 * @param {string} [options.categoryFilter='all'] Optional category filter inside groups.
 * @param {boolean} [options.orphanOnly=false] Only queue orphaned preview copies.
 * @return {object} Safe reclaim plan.
 */
export function buildPreviewCacheReclaimPlan(groups, options = {}) {
	const safeGroups = Array.isArray(groups) ? groups : []
	const categoryFilter = typeof options.categoryFilter === 'string' && options.categoryFilter !== ''
		? options.categoryFilter
		: 'all'
	const orphanOnly = Boolean(options.orphanOnly)

	const safeFiles = []
	const seenKeys = new Set()
	const instanceIds = new Set()
	let skippedProtectedCount = 0
	let skippedLockedCount = 0
	let skippedSurvivorCount = 0
	let skippedSourceCount = 0
	let reclaimableBytes = 0

	for (const group of safeGroups) {
		if (!group || !Array.isArray(group.files) || group.files.length <= 1) {
			continue
		}

		// Preserve all non-cache source files first, then protected/locked files,
		// then ensure at least 1 surviving copy remains in the group.
		const files = group.files
		const nonCacheFiles = files.filter(f => !f.isCacheArtifact)
		skippedSourceCount += nonCacheFiles.length

		let survivingCount = nonCacheFiles.length
		const protectedOrLocked = files.filter(f => f.isCacheArtifact && (f.isProtected || f.isLocked))
		for (const item of protectedOrLocked) {
			if (item.isProtected) {
				skippedProtectedCount += 1
			}
			if (item.isLocked) {
				skippedLockedCount += 1
			}
			survivingCount += 1
		}

		// Order mutable cache candidates: orphaned previews first, then largest, then oldest
		const mutableCandidates = files
			.filter(f => f.isCacheArtifact && !f.isProtected && !f.isLocked)
			.sort((a, b) => {
				if (a.isOrphaned !== b.isOrphaned) {
					return a.isOrphaned ? -1 : 1
				}
				if (b.sizeBytes !== a.sizeBytes) {
					return b.sizeBytes - a.sizeBytes
				}
				return String(a.normalizedPath || '').localeCompare(String(b.normalizedPath || ''))
			})

		for (let idx = 0; idx < mutableCandidates.length; idx++) {
			const candidate = mutableCandidates[idx]
			const remainingAfterThis = survivingCount + (mutableCandidates.length - 1 - idx)
			if (remainingAfterThis < 1) {
				skippedSurvivorCount += 1
				survivingCount += 1
				continue
			}
			if (categoryFilter !== 'all' && candidate.artifactCategory !== categoryFilter) {
				survivingCount += 1
				continue
			}
			if (orphanOnly && !candidate.isOrphaned) {
				survivingCount += 1
				continue
			}

			const key = String(candidate.selectionKey)
			if (seenKeys.has(key)) {
				continue
			}
			seenKeys.add(key)
			safeFiles.push(candidate)
			reclaimableBytes += candidate.sizeBytes
			if (candidate.previewMeta && candidate.previewMeta.instanceId) {
				instanceIds.add(candidate.previewMeta.instanceId)
			}
		}
	}

	return {
		safeFiles,
		safeCount: safeFiles.length,
		reclaimableBytes,
		reclaimableBytesFormatted: formatBytes(reclaimableBytes),
		skippedProtectedCount,
		skippedLockedCount,
		skippedSurvivorCount,
		skippedSourceCount,
		affectedInstanceIds: Array.from(instanceIds).sort(),
	}
}

/**
 * Generate a safe POSIX shell dry-run/cleanup and Nextcloud OCC command script.
 *
 * @param {object} plan Safe reclaim plan from buildPreviewCacheReclaimPlan.
 * @param {object} [report] Optional full report for OCC summary comments.
 * @param {object} [options] Script options.
 * @param {boolean} [options.dryRun=true] Whether DRY_RUN defaults to 1.
 * @return {string} POSIX shell script content.
 */
export function generatePreviewCleanupScript(plan, report = null, options = {}) {
	const dryRunDefault = options.dryRun !== false ? '1' : '0'
	const safeFiles = plan && Array.isArray(plan.safeFiles) ? plan.safeFiles : []
	const lines = [
		'#!/usr/bin/env bash',
		'set -euo pipefail',
		'',
		'# DuplicateFinder Nextcloud Preview & Cache Reclaim Script',
		`# Queued safe files: ${safeFiles.length} (${plan ? plan.reclaimableBytesFormatted : '0 B'})`,
		`DRY_RUN="\${DRY_RUN:-${dryRunDefault}}"`,
		'',
		'remove_artifact() {',
		'  local target="$1"',
		'  if [ "$DRY_RUN" = "1" ]; then',
		'    printf \'[DRY-RUN] rm -f -- %s\\n\' "$target"',
		'  else',
		'    rm -f -- "$target"',
		'    printf \'[REMOVED] %s\\n\' "$target"',
		'  fi',
		'}',
		'',
	]

	for (const file of safeFiles) {
		const pathStr = file.normalizedPath || file.path || ''
		if (!pathStr) {
			continue
		}
		lines.push(`remove_artifact ${shellQuote(pathStr)} # ${file.categoryLabel} (${file.sizeFormatted})`)
	}

	const instances = report && Array.isArray(report.instanceBuckets)
		? report.instanceBuckets.map(b => b.instanceId).filter(Boolean)
		: []

	lines.push('')
	lines.push('# Recommended Nextcloud OCC maintenance commands (run as web server user):')
	lines.push('# php occ preview:cleanup')
	lines.push('# php occ files:scan-app-data')
	if (instances.length > 0) {
		lines.push(`# Detected appdata instances: ${instances.join(', ')}`)
	}
	lines.push('')
	return lines.join('\n')
}

/**
 * Export CWE-1236-safe RFC 4180 CSV report for preview/cache artifacts.
 *
 * @param {object} report Preview cache report.
 * @param {Array<object>} [groupsOverride] Optional filtered groups subset.
 * @return {string} CSV document with CRLF line endings.
 */
export function exportPreviewCacheCsv(report, groupsOverride) {
	const groups = Array.isArray(groupsOverride)
		? groupsOverride
		: (report && Array.isArray(report.groups) ? report.groups : [])

	const header = [
		'Group ID',
		'Hash',
		'Category',
		'Orphan Status',
		'Preview Instance',
		'Preview FileId',
		'Preview Dimensions',
		'Age Days',
		'Protected Origin',
		'Locked',
		'Size Bytes',
		'Path',
		'Reason',
	]
	const rows = [header.map(escapeCsvCell).join(',')]

	for (const group of groups) {
		if (!group || !Array.isArray(group.files)) {
			continue
		}
		for (const file of group.files) {
			const meta = file.previewMeta || {}
			rows.push([
				group.groupKey,
				group.hash,
				file.categoryLabel,
				file.orphanStatus,
				meta.instanceId || '',
				meta.previewFileId || '',
				meta.dimensionLabel || '',
				file.ageDays !== null && file.ageDays !== undefined ? file.ageDays : '',
				file.isProtected ? 'true' : 'false',
				file.isLocked ? 'true' : 'false',
				file.sizeBytes,
				file.normalizedPath,
				file.reason,
			].map(escapeCsvCell).join(','))
		}
	}

	return rows.join('\r\n')
}

/**
 * Export structured JSON report for Nextcloud preview and cache audit.
 *
 * @param {object} report Preview cache report.
 * @param {Array<object>} [groupsOverride] Optional filtered groups subset.
 * @param {string} [exportedAt] Optional ISO timestamp override.
 * @return {string} Pretty-printed JSON string.
 */
export function exportPreviewCacheJson(report, groupsOverride, exportedAt) {
	const groups = Array.isArray(groupsOverride)
		? groupsOverride
		: (report && Array.isArray(report.groups) ? report.groups : [])
	const timestamp = typeof exportedAt === 'string' && exportedAt.trim()
		? exportedAt.trim()
		: new Date().toISOString()

	return JSON.stringify({
		schema: PREVIEW_CACHE_SCHEMA,
		exportedAt: timestamp,
		summary: report ? report.summary : {},
		categoryBreakdown: report ? report.categoryBreakdown : [],
		dimensionBuckets: report ? report.dimensionBuckets : [],
		instanceBuckets: report ? report.instanceBuckets : [],
		groups: groups.map(group => ({
			groupKey: group.groupKey,
			id: group.id,
			hash: group.hash,
			displayName: group.displayName,
			dominantCategory: group.dominantCategory,
			cacheArtifactCount: group.cacheArtifactCount,
			orphanedCount: group.orphanedCount,
			maxPreviewDimension: group.maxPreviewDimension,
			reclaimableBytes: group.reclaimableBytes,
			files: group.files.map(file => ({
				selectionKey: file.selectionKey,
				path: file.normalizedPath,
				sizeBytes: file.sizeBytes,
				category: file.artifactCategory,
				orphanStatus: file.orphanStatus,
				isOrphaned: file.isOrphaned,
				isProtected: file.isProtected,
				isLocked: file.isLocked,
				previewMeta: file.previewMeta,
				ageDays: file.ageDays,
				reason: file.reason,
			})),
		})),
	}, null, 2)
}
