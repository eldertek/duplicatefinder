/**
 * Pure WizTree / WinDirStat-inspired Extension, Media-Category & Size-Tier
 * Storage Footprint Analyzer for duplicate triage.
 */

import { classifyFileCategory } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes, getDuplicateExtension } from './duplicateStats'

export const FOOTPRINT_REPORT_SCHEMA = 'duplicatefinder.storage-footprint.v1'

export const FOOTPRINT_CATEGORIES = Object.freeze([
	'images',
	'videos',
	'audio',
	'documents',
	'archives',
	'other',
])

export const FOOTPRINT_SORT_MODES = Object.freeze([
	'reclaimable_desc',
	'total_desc',
	'groups_desc',
	'files_desc',
	'ext_asc',
])

export const SIZE_TIER_DEFINITIONS = Object.freeze([
	{ id: 'tiny', minBytes: 0, maxBytes: 100 * 1024 },
	{ id: 'small', minBytes: 100 * 1024, maxBytes: 1024 * 1024 },
	{ id: 'medium', minBytes: 1024 * 1024, maxBytes: 10 * 1024 * 1024 },
	{ id: 'large', minBytes: 10 * 1024 * 1024, maxBytes: 100 * 1024 * 1024 },
	{ id: 'huge', minBytes: 100 * 1024 * 1024, maxBytes: Number.POSITIVE_INFINITY },
])

/**
 * Classify a unit file size in bytes into one of the five storage size tiers.
 *
 * @param {number} unitSize - Single file size in bytes.
 * @return {'tiny'|'small'|'medium'|'large'|'huge'} Size tier identifier.
 */
export function classifySizeTier(unitSize) {
	const numeric = Number(unitSize)
	const size = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0
	for (const tier of SIZE_TIER_DEFINITIONS) {
		if (size >= tier.minBytes && size < tier.maxBytes) {
			return tier.id
		}
	}
	return 'tiny'
}

/**
 * Extract normalized parent folder path from a file path.
 *
 * @param {string|null|undefined} rawPath - Raw file path.
 * @return {string} Normalized parent folder path (e.g. '/Photos/2025' or '/').
 */
function getNormalizedParentFolder(rawPath) {
	const normalized = normalizePathForDiff(rawPath)
	if (!normalized) {
		return '/'
	}
	const cleaned = normalized.startsWith('/') ? normalized : `/${normalized}`
	const lastSlash = cleaned.lastIndexOf('/')
	if (lastSlash <= 0) {
		return '/'
	}
	return cleaned.slice(0, lastSlash)
}

/**
 * Derive a concise display label for a duplicate group.
 *
 * @param {object} duplicate - Duplicate group object.
 * @return {string} File basename or fallback hash/id label.
 */
function getGroupDisplayLabel(duplicate) {
	const files = Array.isArray(duplicate && duplicate.files) ? duplicate.files : []
	for (const file of files) {
		if (!file || typeof file.path !== 'string') {
			continue
		}
		const normalized = normalizePathForDiff(file.path) || file.path
		const lastSlash = normalized.lastIndexOf('/')
		const basename = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
		if (basename) {
			return basename
		}
	}
	if (typeof duplicate.name === 'string' && duplicate.name.trim()) {
		return duplicate.name.trim()
	}
	if (typeof duplicate.hash === 'string' && duplicate.hash.trim()) {
		return duplicate.hash.trim().slice(0, 8)
	}
	return String((duplicate && duplicate.id) ?? 'Duplicate')
}

/**
 * Determine the primary media category for a duplicate group.
 *
 * @param {object} duplicate - Duplicate group object.
 * @return {'images'|'videos'|'audio'|'documents'|'archives'|'other'} Media category.
 */
function getGroupCategory(duplicate) {
	const files = Array.isArray(duplicate && duplicate.files) ? duplicate.files : []
	for (const file of files) {
		if (!file || typeof file !== 'object') {
			continue
		}
		const category = classifyFileCategory(file)
		if (category !== 'other') {
			return category
		}
	}
	if (files[0]) {
		return classifyFileCategory(files[0])
	}
	return classifyFileCategory({ path: duplicate && (duplicate.path || duplicate.name || '') })
}

/**
 * Round a percentage share to 1 decimal place cleanly.
 *
 * @param {number} part - Numerator value.
 * @param {number} total - Denominator value.
 * @return {number} Percentage rounded to 1 decimal place (0..100).
 */
function computeSharePct(part, total) {
	if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part <= 0) {
		return 0
	}
	return Math.round((part / total) * 1000) / 10
}

/**
 * Build a complete storage footprint breakdown across extensions, media categories,
 * and file-size tiers from a list of duplicate groups.
 *
 * @param {Array<object>} duplicates - Duplicate group objects.
 * @param {object} [options] - Filtering and sorting options.
 * @param {boolean} [options.includeAcknowledged=true] - Whether acknowledged groups are included.
 * @param {string} [options.categoryFilter='all'] - Media category filter.
 * @param {string} [options.sizeTierFilter='all'] - Size tier filter.
 * @param {string} [options.searchQuery=''] - Substring search across extensions and filenames.
 * @param {string} [options.sortBy='reclaimable_desc'] - Extension sort mode.
 * @return {object} Deterministic storage footprint report.
 */
export function buildStorageFootprintReport(duplicates, options = {}) {
	const includeAcknowledged = options.includeAcknowledged !== false
	const rawCategory = typeof options.categoryFilter === 'string' ? options.categoryFilter.trim().toLowerCase() : 'all'
	const categoryFilter = FOOTPRINT_CATEGORIES.includes(rawCategory) ? rawCategory : 'all'
	const validTierIds = SIZE_TIER_DEFINITIONS.map(tier => tier.id)
	const rawTier = typeof options.sizeTierFilter === 'string' ? options.sizeTierFilter.trim().toLowerCase() : 'all'
	const sizeTierFilter = validTierIds.includes(rawTier) ? rawTier : 'all'
	const searchTokens = typeof options.searchQuery === 'string'
		? options.searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
		: []
	const sortBy = FOOTPRINT_SORT_MODES.includes(options.sortBy) ? options.sortBy : 'reclaimable_desc'

	const scopeRecords = []
	let skippedAcknowledgedCount = 0

	for (const duplicate of Array.isArray(duplicates) ? duplicates : []) {
		if (!duplicate || typeof duplicate !== 'object') {
			continue
		}
		if (!includeAcknowledged && duplicate.acknowledged) {
			skippedAcknowledgedCount += 1
			continue
		}
		const info = computeGroupReclaimableInfo(duplicate)
		if (!info.valid) {
			continue
		}
		const files = Array.isArray(duplicate.files) ? duplicate.files.filter(Boolean) : []
		const ext = getDuplicateExtension(duplicate)
		const category = getGroupCategory(duplicate)
		const sizeTier = classifySizeTier(info.unitSize)
		const totalFootprintBytes = info.count * info.unitSize
		const protectedFiles = files.filter(file => Boolean(file.isInOriginFolder)).length
		const groupName = getGroupDisplayLabel(duplicate)
		const searchableText = [
			ext,
			category,
			groupName,
			...files.map(file => (typeof file.path === 'string' ? file.path : '')),
		].join(' ').toLowerCase()

		scopeRecords.push({
			duplicate,
			id: duplicate.id,
			hash: typeof duplicate.hash === 'string' ? duplicate.hash : '',
			name: groupName,
			ext,
			category,
			sizeTier,
			unitSize: info.unitSize,
			fileCount: info.count,
			redundantFiles: info.extraCopies,
			protectedFiles,
			totalFootprintBytes,
			reclaimableBytes: info.reclaimableBytes,
			files,
			searchableText,
		})
	}

	// Aggregate category and size-tier distributions across the full scope
	const categoryMap = new Map()
	for (const category of FOOTPRINT_CATEGORIES) {
		categoryMap.set(category, {
			category,
			groupCount: 0,
			fileCount: 0,
			redundantFiles: 0,
			totalFootprintBytes: 0,
			reclaimableBytes: 0,
		})
	}

	const tierMap = new Map()
	for (const tier of SIZE_TIER_DEFINITIONS) {
		tierMap.set(tier.id, {
			id: tier.id,
			groupCount: 0,
			fileCount: 0,
			redundantFiles: 0,
			totalFootprintBytes: 0,
			reclaimableBytes: 0,
		})
	}

	let scopeReclaimableBytes = 0
	for (const rec of scopeRecords) {
		scopeReclaimableBytes += rec.reclaimableBytes
		const catBucket = categoryMap.get(rec.category)
		catBucket.groupCount += 1
		catBucket.fileCount += rec.fileCount
		catBucket.redundantFiles += rec.redundantFiles
		catBucket.totalFootprintBytes += rec.totalFootprintBytes
		catBucket.reclaimableBytes += rec.reclaimableBytes

		const tierBucket = tierMap.get(rec.sizeTier)
		tierBucket.groupCount += 1
		tierBucket.fileCount += rec.fileCount
		tierBucket.redundantFiles += rec.redundantFiles
		tierBucket.totalFootprintBytes += rec.totalFootprintBytes
		tierBucket.reclaimableBytes += rec.reclaimableBytes
	}

	const categories = Array.from(categoryMap.values()).map(item => ({
		...item,
		reclaimableFormatted: formatBytes(item.reclaimableBytes),
		totalFootprintFormatted: formatBytes(item.totalFootprintBytes),
		sharePct: computeSharePct(item.reclaimableBytes, scopeReclaimableBytes),
	}))

	const sizeTiers = Array.from(tierMap.values()).map(item => ({
		...item,
		reclaimableFormatted: formatBytes(item.reclaimableBytes),
		totalFootprintFormatted: formatBytes(item.totalFootprintBytes),
		sharePct: computeSharePct(item.reclaimableBytes, scopeReclaimableBytes),
	}))

	// Apply active category, size-tier, and search filters
	const matchedRecords = scopeRecords.filter(rec => {
		if (categoryFilter !== 'all' && rec.category !== categoryFilter) {
			return false
		}
		if (sizeTierFilter !== 'all' && rec.sizeTier !== sizeTierFilter) {
			return false
		}
		if (searchTokens.length > 0 && !searchTokens.every(token => rec.searchableText.includes(token))) {
			return false
		}
		return true
	})

	let totalFiles = 0
	let redundantFiles = 0
	let protectedFiles = 0
	let totalFootprintBytes = 0
	let reclaimableBytes = 0

	const extensionMap = new Map()
	for (const rec of matchedRecords) {
		totalFiles += rec.fileCount
		redundantFiles += rec.redundantFiles
		protectedFiles += rec.protectedFiles
		totalFootprintBytes += rec.totalFootprintBytes
		reclaimableBytes += rec.reclaimableBytes

		let entry = extensionMap.get(rec.ext)
		if (!entry) {
			entry = {
				ext: rec.ext,
				categoryCounts: new Map(),
				folderReclaimable: new Map(),
				groupCount: 0,
				fileCount: 0,
				redundantFiles: 0,
				protectedFiles: 0,
				totalFootprintBytes: 0,
				reclaimableBytes: 0,
				largestRecord: null,
			}
			extensionMap.set(rec.ext, entry)
		}

		entry.groupCount += 1
		entry.fileCount += rec.fileCount
		entry.redundantFiles += rec.redundantFiles
		entry.protectedFiles += rec.protectedFiles
		entry.totalFootprintBytes += rec.totalFootprintBytes
		entry.reclaimableBytes += rec.reclaimableBytes

		entry.categoryCounts.set(rec.category, (entry.categoryCounts.get(rec.category) || 0) + rec.reclaimableBytes + 1)

		const seenFolders = new Set()
		for (const file of rec.files) {
			const folder = getNormalizedParentFolder(file.path)
			if (!seenFolders.has(folder)) {
				seenFolders.add(folder)
				entry.folderReclaimable.set(folder, (entry.folderReclaimable.get(folder) || 0) + rec.reclaimableBytes + 1)
			}
		}

		if (
			!entry.largestRecord
			|| rec.reclaimableBytes > entry.largestRecord.reclaimableBytes
			|| (rec.reclaimableBytes === entry.largestRecord.reclaimableBytes && rec.totalFootprintBytes > entry.largestRecord.totalFootprintBytes)
		) {
			entry.largestRecord = rec
		}
	}

	const rawExtensions = Array.from(extensionMap.values()).map(entry => {
		let dominantCategory = 'other'
		let bestCategoryWeight = -1
		for (const [cat, weight] of entry.categoryCounts.entries()) {
			if (weight > bestCategoryWeight) {
				bestCategoryWeight = weight
				dominantCategory = cat
			}
		}

		let topFolder = '/'
		let bestFolderWeight = -1
		for (const [folder, weight] of entry.folderReclaimable.entries()) {
			if (weight > bestFolderWeight) {
				bestFolderWeight = weight
				topFolder = folder
			}
		}

		const largest = entry.largestRecord
		return {
			ext: entry.ext,
			category: dominantCategory,
			groupCount: entry.groupCount,
			fileCount: entry.fileCount,
			redundantFiles: entry.redundantFiles,
			protectedFiles: entry.protectedFiles,
			totalFootprintBytes: entry.totalFootprintBytes,
			totalFootprintFormatted: formatBytes(entry.totalFootprintBytes),
			reclaimableBytes: entry.reclaimableBytes,
			reclaimableFormatted: formatBytes(entry.reclaimableBytes),
			sharePct: computeSharePct(entry.reclaimableBytes, reclaimableBytes),
			maxBarPct: 0,
			avgCopies: entry.groupCount > 0 ? Math.round((entry.fileCount / entry.groupCount) * 10) / 10 : 0,
			topFolder,
			largestGroup: largest
				? {
					id: largest.id,
					hash: largest.hash,
					name: largest.name,
					unitSize: largest.unitSize,
					unitSizeFormatted: formatBytes(largest.unitSize),
					reclaimableBytes: largest.reclaimableBytes,
					reclaimableFormatted: formatBytes(largest.reclaimableBytes),
					copies: largest.fileCount,
					duplicate: largest.duplicate,
				}
				: null,
		}
	})

	const maxReclaimable = rawExtensions.reduce((max, item) => Math.max(max, item.reclaimableBytes), 0)
	for (const item of rawExtensions) {
		item.maxBarPct = maxReclaimable > 0
			? Math.max(4, Math.round((item.reclaimableBytes / maxReclaimable) * 100))
			: 0
	}

	rawExtensions.sort((a, b) => {
		if (sortBy === 'total_desc') {
			if (b.totalFootprintBytes !== a.totalFootprintBytes) {
				return b.totalFootprintBytes - a.totalFootprintBytes
			}
		} else if (sortBy === 'groups_desc') {
			if (b.groupCount !== a.groupCount) {
				return b.groupCount - a.groupCount
			}
		} else if (sortBy === 'files_desc') {
			if (b.fileCount !== a.fileCount) {
				return b.fileCount - a.fileCount
			}
		} else if (sortBy === 'ext_asc') {
			if (a.ext < b.ext) {
				return -1
			}
			if (a.ext > b.ext) {
				return 1
			}
		}

		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (b.groupCount !== a.groupCount) {
			return b.groupCount - a.groupCount
		}
		return a.ext < b.ext ? -1 : (a.ext > b.ext ? 1 : 0)
	})

	const topOffenders = [...matchedRecords]
		.sort((a, b) => {
			if (b.reclaimableBytes !== a.reclaimableBytes) {
				return b.reclaimableBytes - a.reclaimableBytes
			}
			if (b.totalFootprintBytes !== a.totalFootprintBytes) {
				return b.totalFootprintBytes - a.totalFootprintBytes
			}
			return String(a.id ?? '').localeCompare(String(b.id ?? ''))
		})
		.slice(0, 5)
		.map(rec => ({
			id: rec.id,
			hash: rec.hash,
			name: rec.name,
			ext: rec.ext,
			category: rec.category,
			copies: rec.fileCount,
			redundantFiles: rec.redundantFiles,
			reclaimableBytes: rec.reclaimableBytes,
			reclaimableFormatted: formatBytes(rec.reclaimableBytes),
			totalFootprintBytes: rec.totalFootprintBytes,
			totalFootprintFormatted: formatBytes(rec.totalFootprintBytes),
			duplicate: rec.duplicate,
		}))

	const topExtByReclaimable = [...rawExtensions].sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)[0] || null
	const topCatByReclaimable = [...categories]
		.filter(item => item.reclaimableBytes > 0)
		.sort((a, b) => b.reclaimableBytes - a.reclaimableBytes)[0] || null

	return {
		filters: {
			includeAcknowledged,
			categoryFilter,
			sizeTierFilter,
			searchQuery: typeof options.searchQuery === 'string' ? options.searchQuery.trim() : '',
			sortBy,
		},
		scopeSummary: {
			totalGroups: scopeRecords.length,
			skippedAcknowledgedCount,
			reclaimableBytes: scopeReclaimableBytes,
			reclaimableFormatted: formatBytes(scopeReclaimableBytes),
		},
		summary: {
			totalGroups: matchedRecords.length,
			totalFiles,
			redundantFiles,
			protectedFiles,
			totalFootprintBytes,
			totalFootprintFormatted: formatBytes(totalFootprintBytes),
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
			wastedRatioPct: computeSharePct(reclaimableBytes, totalFootprintBytes),
			uniqueExtensionsCount: rawExtensions.length,
			topExtension: topExtByReclaimable
				? {
					ext: topExtByReclaimable.ext,
					reclaimableFormatted: topExtByReclaimable.reclaimableFormatted,
					sharePct: topExtByReclaimable.sharePct,
				}
				: null,
			topCategory: topCatByReclaimable
				? {
					category: topCatByReclaimable.category,
					reclaimableFormatted: topCatByReclaimable.reclaimableFormatted,
					sharePct: topCatByReclaimable.sharePct,
				}
				: null,
		},
		categories,
		sizeTiers,
		extensions: rawExtensions,
		topOffenders,
	}
}

/**
 * Serialize a storage footprint report into CWE-1236-safe RFC 4180 CSV.
 *
 * @param {object} report - Output of buildStorageFootprintReport.
 * @return {string} Safe CSV string.
 */
export function exportFootprintCsv(report) {
	const header = [
		'Extension',
		'Category',
		'Groups',
		'Total Copies',
		'Redundant Copies',
		'Protected Copies',
		'Reclaimable Bytes',
		'Reclaimable Size',
		'Total Footprint Bytes',
		'Total Footprint Size',
		'Share %',
		'Top Folder',
		'Largest Group',
	]
	const rows = [header.map(escapeCsvCell).join(',')]
	const extensions = Array.isArray(report && report.extensions) ? report.extensions : []
	for (const item of extensions) {
		rows.push([
			item.ext,
			item.category,
			item.groupCount,
			item.fileCount,
			item.redundantFiles,
			item.protectedFiles,
			item.reclaimableBytes,
			item.reclaimableFormatted,
			item.totalFootprintBytes,
			item.totalFootprintFormatted,
			item.sharePct,
			item.topFolder,
			item.largestGroup ? item.largestGroup.name : '',
		].map(escapeCsvCell).join(','))
	}
	return rows.join('\r\n')
}

/**
 * Serialize a storage footprint report into deterministic JSON without raw group references.
 *
 * @param {object} report - Output of buildStorageFootprintReport.
 * @return {string} Formatted JSON string.
 */
export function exportFootprintJson(report) {
	const safeReport = {
		schema: FOOTPRINT_REPORT_SCHEMA,
		filters: report && report.filters ? report.filters : {},
		summary: report && report.summary ? report.summary : {},
		categories: Array.isArray(report && report.categories) ? report.categories : [],
		sizeTiers: Array.isArray(report && report.sizeTiers) ? report.sizeTiers : [],
		extensions: Array.isArray(report && report.extensions)
			? report.extensions.map(item => ({
				ext: item.ext,
				category: item.category,
				groupCount: item.groupCount,
				fileCount: item.fileCount,
				redundantFiles: item.redundantFiles,
				protectedFiles: item.protectedFiles,
				totalFootprintBytes: item.totalFootprintBytes,
				totalFootprintFormatted: item.totalFootprintFormatted,
				reclaimableBytes: item.reclaimableBytes,
				reclaimableFormatted: item.reclaimableFormatted,
				sharePct: item.sharePct,
				avgCopies: item.avgCopies,
				topFolder: item.topFolder,
				largestGroup: item.largestGroup
					? {
						id: item.largestGroup.id,
						hash: item.largestGroup.hash,
						name: item.largestGroup.name,
						unitSize: item.largestGroup.unitSize,
						reclaimableBytes: item.largestGroup.reclaimableBytes,
						copies: item.largestGroup.copies,
					}
					: null,
			}))
			: [],
	}
	return JSON.stringify(safeReport, null, 2)
}
