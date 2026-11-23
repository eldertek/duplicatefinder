/**
 * Pure Directory Folder Pair Overlap Matrix & Side-by-Side Folder Deduplication Engine.
 * Inspired by Beyond Compare Folder Compare, WinMerge Directory Diff, and dupeGuru
 * directory overlap workflows while enforcing Nextcloud protected-origin and
 * surviving-copy safety invariants.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'
import { escapeCsvCell, getFileSelectionKey } from './duplicateSelectionAndExport'
import { computeGroupReclaimableInfo, formatBytes } from './duplicateStats'

export const FOLDER_PAIR_SCHEMA = 'duplicatefinder.folder-pair-matrix.v1'

export const FOLDER_PAIR_SORT_MODES = Object.freeze([
	'reclaimable_desc',
	'files_desc',
	'overlap_desc',
	'name_asc',
])

export const FOLDER_PAIR_KEEP_SIDES = Object.freeze([
	'auto',
	'left',
	'right',
])

const TIMESTAMP_FIELDS = Object.freeze(['mtime', 'modified', 'updatedAt', 'lastModified'])

/**
 * Parse a timestamp field into finite milliseconds or null.
 *
 * @param {*} value Raw timestamp value.
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
 * Extract modification timestamp from a duplicate file entry.
 *
 * @param {object} file Duplicate file entry.
 * @return {number|null} Timestamp or null when unavailable.
 */
function getFileMtime(file) {
	if (!file || typeof file !== 'object') {
		return null
	}
	for (const field of TIMESTAMP_FIELDS) {
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
 * Extract the normalized display parent folder for a file path.
 *
 * @param {string|null|undefined} rawPath Raw file path.
 * @return {string} Normalized parent folder path, or empty string when invalid.
 */
export function getNormalizedParentFolder(rawPath) {
	if (typeof rawPath !== 'string' || !rawPath.trim()) {
		return ''
	}
	const displayPath = normalizePathForDiff(rawPath).replace(/\\/g, '/').replace(/\/+/g, '/')
	if (!displayPath) {
		return ''
	}
	const trimmed = displayPath.length > 1 ? displayPath.replace(/\/+$/, '') : displayPath
	const slashIndex = trimmed.lastIndexOf('/')
	if (slashIndex <= 0) {
		return '/'
	}
	return trimmed.slice(0, slashIndex)
}

/**
 * Derive a readable group label from a duplicate group.
 *
 * @param {object} group Duplicate group object.
 * @return {string} Group display label.
 */
function getGroupDisplayName(group) {
	if (!group || typeof group !== 'object') {
		return 'Duplicate group'
	}
	const files = Array.isArray(group.files) ? group.files : []
	for (const file of files) {
		if (file && typeof file.path === 'string' && file.path.trim()) {
			const clean = file.path.replace(/\\/g, '/')
			const idx = clean.lastIndexOf('/')
			const base = idx >= 0 ? clean.slice(idx + 1) : clean
			if (base) {
				return base
			}
		}
	}
	if (typeof group.hash === 'string' && group.hash) {
		return group.hash.slice(0, 8)
	}
	return 'Duplicate group'
}

/**
 * Determine whether a file entry is blocked from deletion by origin protection or lock state.
 *
 * @param {object} file Duplicate file entry.
 * @return {boolean} True when file cannot be deleted.
 */
function isFileBlockedFromDelete(file) {
	if (!file || typeof file !== 'object') {
		return true
	}
	return Boolean(file.isInOriginFolder || file.isLocked || file.locked)
}

/**
 * Compute average/oldest mtime for a list of files.
 *
 * @param {Array<object>} files File entries.
 * @return {number|null} Oldest finite timestamp or null.
 */
function getOldestMtime(files) {
	let oldest = null
	for (const file of files) {
		const mtime = getFileMtime(file)
		if (mtime !== null && (oldest === null || mtime < oldest)) {
			oldest = mtime
		}
	}
	return oldest
}

/**
 * Determine if a folder path matches the search query (case-insensitive substring).
 *
 * @param {string} leftFolder Left folder path.
 * @param {string} rightFolder Right folder path.
 * @param {string} searchQuery Raw search query.
 * @return {boolean} True when pair matches query.
 */
function matchesPairSearch(leftFolder, rightFolder, searchQuery) {
	if (typeof searchQuery !== 'string' || !searchQuery.trim()) {
		return true
	}
	const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
	const combined = `${leftFolder.toLowerCase()} ${rightFolder.toLowerCase()}`
	return tokens.every(token => combined.includes(token))
}

/**
 * Build the ranked Directory Folder Pair Overlap Matrix from duplicate groups.
 *
 * @param {Array<object>} duplicates Duplicate group objects.
 * @param {object} [options] Matrix computation options.
 * @param {boolean} [options.includeAcknowledged=false] Whether to include acknowledged groups.
 * @param {number} [options.minSharedGroups=1] Minimum shared duplicate groups per pair.
 * @param {string} [options.sortBy='reclaimable_desc'] Sort mode.
 * @param {string} [options.searchQuery=''] Folder path search filter.
 * @param {boolean} [options.onlyProtectedPairs=false] Only return pairs involving a protected folder.
 * @return {object} Structured folder pair matrix result with pairs, summary, and folderIndex.
 */
export function buildFolderPairMatrix(duplicates, options = {}) {
	const safeDuplicates = Array.isArray(duplicates) ? duplicates : []
	const includeAcknowledged = Boolean(options.includeAcknowledged)
	const rawMinShared = Number(options.minSharedGroups)
	const minSharedGroups = Number.isFinite(rawMinShared) && rawMinShared >= 1
		? Math.floor(rawMinShared)
		: 1
	const sortBy = FOLDER_PAIR_SORT_MODES.includes(options.sortBy)
		? options.sortBy
		: 'reclaimable_desc'
	const searchQuery = typeof options.searchQuery === 'string' ? options.searchQuery : ''
	const onlyProtectedPairs = Boolean(options.onlyProtectedPairs)

	const folderStatsMap = new Map()
	const pairMap = new Map()
	let evaluatedGroupCount = 0
	let skippedAcknowledgedCount = 0

	const ensureFolderStat = folderPath => {
		if (!folderStatsMap.has(folderPath)) {
			folderStatsMap.set(folderPath, {
				path: folderPath,
				groupKeys: new Set(),
				fileCount: 0,
				totalBytes: 0,
				protectedFileCount: 0,
			})
		}
		return folderStatsMap.get(folderPath)
	}

	safeDuplicates.forEach((group, groupIndex) => {
		if (!group || typeof group !== 'object' || !Array.isArray(group.files) || group.files.length < 2) {
			return
		}
		if (!includeAcknowledged && group.acknowledged) {
			skippedAcknowledgedCount += 1
			return
		}

		evaluatedGroupCount += 1
		const groupKey = group.id !== undefined && group.id !== null && group.id !== ''
			? `id:${group.id}`
			: (group.hash ? `hash:${group.hash}` : `idx:${groupIndex}`)
		const groupName = getGroupDisplayName(group)
		const reclaimInfo = computeGroupReclaimableInfo(group)
		const unitSize = reclaimInfo.unitSize

		const filesByFolder = new Map()
		for (const file of group.files) {
			if (!file || typeof file !== 'object' || typeof file.path !== 'string') {
				continue
			}
			const folderPath = getNormalizedParentFolder(file.path)
			if (!folderPath) {
				continue
			}
			if (!filesByFolder.has(folderPath)) {
				filesByFolder.set(folderPath, [])
			}
			filesByFolder.get(folderPath).push(file)

			const fStat = ensureFolderStat(folderPath)
			fStat.groupKeys.add(groupKey)
			fStat.fileCount += 1
			fStat.totalBytes += Number(file.size) > 0 ? Number(file.size) : unitSize
			if (file.isInOriginFolder) {
				fStat.protectedFileCount += 1
			}
		}

		const foldersInGroup = Array.from(filesByFolder.keys()).sort((a, b) => a.localeCompare(b))
		if (foldersInGroup.length < 2) {
			return
		}

		for (let i = 0; i < foldersInGroup.length; i += 1) {
			for (let j = i + 1; j < foldersInGroup.length; j += 1) {
				const leftFolder = foldersInGroup[i]
				const rightFolder = foldersInGroup[j]
				const pairKey = `${leftFolder}\u0000${rightFolder}`

				if (!pairMap.has(pairKey)) {
					pairMap.set(pairKey, {
						pairKey,
						pairId: `${leftFolder} <-> ${rightFolder}`,
						leftFolder,
						rightFolder,
						sharedGroups: [],
						sharedUnitBytes: 0,
						cleanRightBytes: 0,
						cleanRightCount: 0,
						cleanLeftBytes: 0,
						cleanLeftCount: 0,
						leftProtectedFiles: 0,
						rightProtectedFiles: 0,
						leftOlderWins: 0,
						rightOlderWins: 0,
					})
				}

				const pair = pairMap.get(pairKey)
				const leftFiles = filesByFolder.get(leftFolder) || []
				const rightFiles = filesByFolder.get(rightFolder) || []

				let leftDeletableCount = 0
				let leftDeletableBytes = 0
				let leftProtectedCount = 0
				for (const file of leftFiles) {
					if (file.isInOriginFolder) {
						leftProtectedCount += 1
					}
					if (!isFileBlockedFromDelete(file)) {
						leftDeletableCount += 1
						leftDeletableBytes += Number(file.size) > 0 ? Number(file.size) : unitSize
					}
				}

				let rightDeletableCount = 0
				let rightDeletableBytes = 0
				let rightProtectedCount = 0
				for (const file of rightFiles) {
					if (file.isInOriginFolder) {
						rightProtectedCount += 1
					}
					if (!isFileBlockedFromDelete(file)) {
						rightDeletableCount += 1
						rightDeletableBytes += Number(file.size) > 0 ? Number(file.size) : unitSize
					}
				}

				const leftOldestMtime = getOldestMtime(leftFiles)
				const rightOldestMtime = getOldestMtime(rightFiles)
				if (leftOldestMtime !== null && rightOldestMtime !== null) {
					if (leftOldestMtime < rightOldestMtime) {
						pair.leftOlderWins += 1
					} else if (rightOldestMtime < leftOldestMtime) {
						pair.rightOlderWins += 1
					}
				}

				const outsideFilesCount = Math.max(0, group.files.length - leftFiles.length - rightFiles.length)

				pair.sharedUnitBytes += unitSize
				pair.cleanRightBytes += rightDeletableBytes
				pair.cleanRightCount += rightDeletableCount
				pair.cleanLeftBytes += leftDeletableBytes
				pair.cleanLeftCount += leftDeletableCount
				pair.leftProtectedFiles += leftProtectedCount
				pair.rightProtectedFiles += rightProtectedCount

				pair.sharedGroups.push({
					groupKey,
					groupId: group.id ?? null,
					groupHash: group.hash || '',
					groupName,
					unitSize,
					unitSizeFormatted: formatBytes(unitSize),
					acknowledged: Boolean(group.acknowledged),
					totalCopiesInGroup: group.files.length,
					outsideFilesCount,
					leftFiles,
					rightFiles,
					leftDeletableCount,
					leftDeletableBytes,
					rightDeletableCount,
					rightDeletableBytes,
					leftProtectedCount,
					rightProtectedCount,
					leftOldestMtime,
					rightOldestMtime,
					leftModifiedLabel: leftFiles[0] ? formatFileModifiedTime(leftFiles[0]) : '',
					rightModifiedLabel: rightFiles[0] ? formatFileModifiedTime(rightFiles[0]) : '',
					rawGroup: group,
				})
			}
		}
	})

	const allPairs = Array.from(pairMap.values()).map(pair => {
		const leftFolderStat = folderStatsMap.get(pair.leftFolder)
		const rightFolderStat = folderStatsMap.get(pair.rightFolder)
		const leftTotalGroups = leftFolderStat ? leftFolderStat.groupKeys.size : pair.sharedGroups.length
		const rightTotalGroups = rightFolderStat ? rightFolderStat.groupKeys.size : pair.sharedGroups.length
		const sharedGroupCount = pair.sharedGroups.length

		const containmentPercent = Math.min(
			100,
			Math.round((sharedGroupCount / Math.max(1, Math.min(leftTotalGroups, rightTotalGroups))) * 100)
		)
		const unionCount = Math.max(1, leftTotalGroups + rightTotalGroups - sharedGroupCount)
		const jaccardPercent = Math.min(100, Math.round((sharedGroupCount / unionCount) * 100))

		let mirrorKind = 'partial_overlap'
		if (sharedGroupCount === leftTotalGroups && sharedGroupCount === rightTotalGroups) {
			mirrorKind = 'exact_mirror'
		} else if (containmentPercent === 100) {
			mirrorKind = 'subset_mirror'
		}

		const leftHasProtected = pair.leftProtectedFiles > 0
		const rightHasProtected = pair.rightProtectedFiles > 0

		let recommendedKeepSide = 'left'
		let recommendationReason = 'shorter_path'
		if (leftHasProtected && !rightHasProtected) {
			recommendedKeepSide = 'left'
			recommendationReason = 'protected_origin'
		} else if (rightHasProtected && !leftHasProtected) {
			recommendedKeepSide = 'right'
			recommendationReason = 'protected_origin'
		} else if (pair.cleanRightBytes !== pair.cleanLeftBytes) {
			recommendedKeepSide = pair.cleanRightBytes >= pair.cleanLeftBytes ? 'left' : 'right'
			recommendationReason = 'max_reclaimable'
		} else if (pair.leftOlderWins !== pair.rightOlderWins) {
			recommendedKeepSide = pair.leftOlderWins > pair.rightOlderWins ? 'left' : 'right'
			recommendationReason = 'older_copies'
		} else if (pair.rightFolder.length < pair.leftFolder.length) {
			recommendedKeepSide = 'right'
			recommendationReason = 'shorter_path'
		}

		const maxReclaimableBytes = Math.max(pair.cleanRightBytes, pair.cleanLeftBytes)
		const totalSharedFiles = pair.sharedGroups.reduce(
			(sum, row) => sum + row.leftFiles.length + row.rightFiles.length,
			0
		)

		const sortedRows = [...pair.sharedGroups].sort((a, b) => {
			if (b.unitSize !== a.unitSize) {
				return b.unitSize - a.unitSize
			}
			return a.groupName.localeCompare(b.groupName)
		})

		return {
			pairKey: pair.pairKey,
			pairId: pair.pairId,
			leftFolder: pair.leftFolder,
			rightFolder: pair.rightFolder,
			leftTotalGroups,
			rightTotalGroups,
			sharedGroupCount,
			totalSharedFiles,
			sharedUnitBytes: pair.sharedUnitBytes,
			sharedUnitFormatted: formatBytes(pair.sharedUnitBytes),
			cleanRightBytes: pair.cleanRightBytes,
			cleanRightFormatted: formatBytes(pair.cleanRightBytes),
			cleanRightCount: pair.cleanRightCount,
			cleanLeftBytes: pair.cleanLeftBytes,
			cleanLeftFormatted: formatBytes(pair.cleanLeftBytes),
			cleanLeftCount: pair.cleanLeftCount,
			maxReclaimableBytes,
			maxReclaimableFormatted: formatBytes(maxReclaimableBytes),
			containmentPercent,
			jaccardPercent,
			mirrorKind,
			leftHasProtected,
			rightHasProtected,
			hasProtectedSide: leftHasProtected || rightHasProtected,
			leftProtectedFiles: pair.leftProtectedFiles,
			rightProtectedFiles: pair.rightProtectedFiles,
			recommendedKeepSide,
			recommendationReason,
			sharedGroups: sortedRows,
		}
	})

	const filteredPairs = allPairs.filter(pair => {
		if (pair.sharedGroupCount < minSharedGroups) {
			return false
		}
		if (onlyProtectedPairs && !pair.hasProtectedSide) {
			return false
		}
		if (!matchesPairSearch(pair.leftFolder, pair.rightFolder, searchQuery)) {
			return false
		}
		return true
	})

	filteredPairs.sort((a, b) => {
		if (sortBy === 'files_desc') {
			if (b.sharedGroupCount !== a.sharedGroupCount) {
				return b.sharedGroupCount - a.sharedGroupCount
			}
			return b.maxReclaimableBytes - a.maxReclaimableBytes
		}
		if (sortBy === 'overlap_desc') {
			if (b.containmentPercent !== a.containmentPercent) {
				return b.containmentPercent - a.containmentPercent
			}
			if (b.jaccardPercent !== a.jaccardPercent) {
				return b.jaccardPercent - a.jaccardPercent
			}
			return b.maxReclaimableBytes - a.maxReclaimableBytes
		}
		if (sortBy === 'name_asc') {
			return a.pairId.localeCompare(b.pairId)
		}
		if (b.maxReclaimableBytes !== a.maxReclaimableBytes) {
			return b.maxReclaimableBytes - a.maxReclaimableBytes
		}
		if (b.sharedGroupCount !== a.sharedGroupCount) {
			return b.sharedGroupCount - a.sharedGroupCount
		}
		return a.pairId.localeCompare(b.pairId)
	})

	const mirrorPairCount = filteredPairs.filter(
		pair => pair.mirrorKind === 'exact_mirror' || pair.mirrorKind === 'subset_mirror'
	).length
	const totalSharedRows = filteredPairs.reduce((sum, pair) => sum + pair.sharedGroupCount, 0)
	const bestPairReclaimableBytes = filteredPairs.reduce(
		(max, pair) => Math.max(max, pair.maxReclaimableBytes),
		0
	)
	const uniqueFoldersInPairs = new Set()
	filteredPairs.forEach(pair => {
		uniqueFoldersInPairs.add(pair.leftFolder)
		uniqueFoldersInPairs.add(pair.rightFolder)
	})

	return {
		pairs: filteredPairs,
		totalUnfilteredPairs: allPairs.length,
		summary: {
			pairCount: filteredPairs.length,
			mirrorPairCount,
			folderCount: uniqueFoldersInPairs.size,
			totalSharedRows,
			bestPairReclaimableBytes,
			bestPairReclaimableFormatted: formatBytes(bestPairReclaimableBytes),
			evaluatedGroupCount,
			skippedAcknowledgedCount,
		},
	}
}

/**
 * Build an actionable, safety-verified deletion plan for a selected folder pair.
 * Never deletes protected origin files or the last remaining copy of any group.
 *
 * @param {object|null|undefined} pair Pair entry from buildFolderPairMatrix.
 * @param {object} [options] Plan options.
 * @param {'auto'|'left'|'right'} [options.keepSide='auto'] Which folder side to preserve.
 * @param {Array<string|number>|Set<string|number>} [options.excludedFileKeys] Unchecked file selection keys.
 * @return {object} Detailed folder pair cleanup plan.
 */
export function buildFolderPairCleanupPlan(pair, options = {}) {
	if (!pair || typeof pair !== 'object' || !Array.isArray(pair.sharedGroups)) {
		return {
			pairKey: '',
			keepSide: 'left',
			cleanSide: 'right',
			keptFolder: '',
			cleanedFolder: '',
			rows: [],
			deleteTargets: [],
			summary: {
				rowCount: 0,
				deleteCount: 0,
				keptInPairCount: 0,
				protectedSkippedCount: 0,
				reclaimableBytes: 0,
				reclaimableFormatted: '0 B',
			},
		}
	}

	const rawSide = FOLDER_PAIR_KEEP_SIDES.includes(options.keepSide) ? options.keepSide : 'auto'
	const effectiveKeepSide = rawSide === 'auto'
		? (pair.recommendedKeepSide === 'right' ? 'right' : 'left')
		: rawSide
	const cleanSide = effectiveKeepSide === 'left' ? 'right' : 'left'
	const keptFolder = effectiveKeepSide === 'left' ? pair.leftFolder : pair.rightFolder
	const cleanedFolder = cleanSide === 'left' ? pair.leftFolder : pair.rightFolder

	const excludedSet = new Set(
		Array.from(options.excludedFileKeys || []).map(key => String(key))
	)

	const deleteTargets = []
	let keptInPairCount = 0
	let protectedSkippedCount = 0
	let reclaimableBytes = 0

	const rows = pair.sharedGroups.map(groupRow => {
		const keptSideFiles = effectiveKeepSide === 'left' ? groupRow.leftFiles : groupRow.rightFiles
		const cleanedSideFiles = cleanSide === 'left' ? groupRow.leftFiles : groupRow.rightFiles
		const totalGroupFiles = Number(groupRow.totalCopiesInGroup) || (keptSideFiles.length + cleanedSideFiles.length)

		let markedInGroupCount = 0
		const maxAllowedDeletions = Math.max(0, totalGroupFiles - 1)

		const evaluateSideFiles = (files, side) => files.map(file => {
			const selectionKey = String(getFileSelectionKey(file) ?? '')
			const blocked = isFileBlockedFromDelete(file)
			const isKeptSide = side === effectiveKeepSide

			if (isKeptSide) {
				keptInPairCount += 1
				return {
					file,
					selectionKey,
					side,
					isProtected: Boolean(file && file.isInOriginFolder),
					isLocked: Boolean(file && (file.isLocked || file.locked)),
					canToggle: false,
					status: file && file.isInOriginFolder ? 'protected_origin' : 'kept_reference',
				}
			}

			if (blocked) {
				protectedSkippedCount += 1
				return {
					file,
					selectionKey,
					side,
					isProtected: Boolean(file && file.isInOriginFolder),
					isLocked: Boolean(file && (file.isLocked || file.locked)),
					canToggle: false,
					status: file && file.isInOriginFolder ? 'protected_origin' : 'locked_file',
				}
			}

			const isExcludedByUser = selectionKey && excludedSet.has(selectionKey)
			const canDeleteSafely = markedInGroupCount < maxAllowedDeletions
			if (!isExcludedByUser && canDeleteSafely) {
				markedInGroupCount += 1
				const fileSize = Number(file.size) > 0 ? Number(file.size) : groupRow.unitSize
				reclaimableBytes += fileSize
				deleteTargets.push({
					path: file.path,
					nodeId: file.nodeId,
					id: file.id,
					fileHash: groupRow.groupHash || file.fileHash || '',
					size: fileSize,
					mimetype: file.mimetype || 'application/octet-stream',
					groupKey: groupRow.groupKey,
				})
				return {
					file,
					selectionKey,
					side,
					isProtected: false,
					isLocked: false,
					canToggle: true,
					marked: true,
					status: 'marked_delete',
				}
			}

			return {
				file,
				selectionKey,
				side,
				isProtected: false,
				isLocked: false,
				canToggle: true,
				marked: false,
				status: isExcludedByUser ? 'user_kept' : 'surviving_copy_guard',
			}
		})

		const leftEntries = evaluateSideFiles(groupRow.leftFiles, 'left')
		const rightEntries = evaluateSideFiles(groupRow.rightFiles, 'right')

		return {
			...groupRow,
			leftEntries,
			rightEntries,
			markedInGroupCount,
		}
	})

	// Delete image files before paired Live Photo video files (.mov/.mp4/.m4v)
	deleteTargets.sort((a, b) => {
		const isVideoA = /\.(mov|mp4|m4v)$/i.test(String(a.path || '')) ? 1 : 0
		const isVideoB = /\.(mov|mp4|m4v)$/i.test(String(b.path || '')) ? 1 : 0
		if (isVideoA !== isVideoB) {
			return isVideoA - isVideoB
		}
		return String(a.path || '').localeCompare(String(b.path || ''))
	})

	return {
		pairKey: pair.pairKey,
		keepSide: effectiveKeepSide,
		cleanSide,
		keptFolder,
		cleanedFolder,
		rows,
		deleteTargets,
		summary: {
			rowCount: rows.length,
			deleteCount: deleteTargets.length,
			keptInPairCount,
			protectedSkippedCount,
			reclaimableBytes,
			reclaimableFormatted: formatBytes(reclaimableBytes),
		},
	}
}

/**
 * Build a CWE-1236-safe RFC 4180 CSV export of the folder pair matrix.
 *
 * @param {object} matrixResult Result from buildFolderPairMatrix.
 * @return {string} CSV document string.
 */
export function buildFolderPairMatrixCsv(matrixResult) {
	const headers = [
		'Left Folder',
		'Right Folder',
		'Mirror Kind',
		'Containment %',
		'Jaccard %',
		'Shared Groups',
		'Recommended Keep Side',
		'Clean Right Files',
		'Clean Right Bytes',
		'Clean Left Files',
		'Clean Left Bytes',
		'Max Reclaimable Bytes',
		'Left Protected Files',
		'Right Protected Files',
	]
	const rows = [headers.map(escapeCsvCell).join(',')]
	const pairs = Array.isArray(matrixResult?.pairs) ? matrixResult.pairs : []

	for (const pair of pairs) {
		rows.push([
			pair.leftFolder,
			pair.rightFolder,
			pair.mirrorKind,
			pair.containmentPercent,
			pair.jaccardPercent,
			pair.sharedGroupCount,
			pair.recommendedKeepSide,
			pair.cleanRightCount,
			pair.cleanRightBytes,
			pair.cleanLeftCount,
			pair.cleanLeftBytes,
			pair.maxReclaimableBytes,
			pair.leftProtectedFiles,
			pair.rightProtectedFiles,
		].map(escapeCsvCell).join(','))
	}

	return rows.join('\r\n')
}

/**
 * Build a structured JSON export of the folder pair matrix.
 *
 * @param {object} matrixResult Result from buildFolderPairMatrix.
 * @param {object} [meta] Optional export metadata.
 * @return {string} Formatted JSON string.
 */
export function buildFolderPairMatrixJson(matrixResult, meta = {}) {
	const pairs = Array.isArray(matrixResult?.pairs) ? matrixResult.pairs : []
	return JSON.stringify({
		schema: FOLDER_PAIR_SCHEMA,
		exportedAt: typeof meta.exportedAt === 'string' ? meta.exportedAt : new Date().toISOString(),
		scope: meta.scope || 'filtered',
		summary: matrixResult?.summary || {},
		pairs: pairs.map(pair => ({
			leftFolder: pair.leftFolder,
			rightFolder: pair.rightFolder,
			mirrorKind: pair.mirrorKind,
			containmentPercent: pair.containmentPercent,
			jaccardPercent: pair.jaccardPercent,
			sharedGroupCount: pair.sharedGroupCount,
			recommendedKeepSide: pair.recommendedKeepSide,
			recommendationReason: pair.recommendationReason,
			cleanRightCount: pair.cleanRightCount,
			cleanRightBytes: pair.cleanRightBytes,
			cleanLeftCount: pair.cleanLeftCount,
			cleanLeftBytes: pair.cleanLeftBytes,
			maxReclaimableBytes: pair.maxReclaimableBytes,
			groups: pair.sharedGroups.map(row => ({
				groupId: row.groupId,
				groupHash: row.groupHash,
				groupName: row.groupName,
				unitSize: row.unitSize,
				leftPaths: row.leftFiles.map(f => f.path),
				rightPaths: row.rightFiles.map(f => f.path),
			})),
		})),
	}, null, 2)
}
