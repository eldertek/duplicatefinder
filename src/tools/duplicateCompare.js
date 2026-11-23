/**
 * Pure Beyond Compare-inspired side-by-side comparison helpers
 * for inspecting two copies in a duplicate group.
 */

import { formatFileModifiedTime, normalizePathForDiff } from './duplicatePathDiff'

/**
 * Checks whether a MIME type supports visual image/video preview generation.
 *
 * @param {string|null|undefined} mimetype - File MIME type string.
 * @return {boolean} True for image/* or video/* MIME types.
 */
export function isVisualPreviewableMimetype(mimetype) {
	if (typeof mimetype !== 'string' || !mimetype.trim()) {
		return false
	}
	const primaryType = mimetype.trim().toLowerCase().split('/')[0]
	return primaryType === 'image' || primaryType === 'video'
}

/**
 * Extract normalized display metadata for a duplicate file entry.
 *
 * @param {object|null|undefined} file - Duplicate file object.
 * @param {object} [options] - Formatting options.
 * @param {Function} [options.formatSize] - Optional size formatter `(bytes) => string`.
 * @return {object} Normalized display metadata.
 */
export function extractFileDisplayMeta(file, options = {}) {
	if (!file || typeof file !== 'object') {
		return {
			normalizedPath: '',
			fileName: '',
			folder: '',
			sizeBytes: 0,
			formattedSize: typeof options.formatSize === 'function' ? options.formatSize(0) : '0 B',
			modifiedAt: '',
			mimetype: '',
			isProtected: false,
			isLivePhotoVideoMissing: false,
		}
	}

	const rawPath = typeof file.path === 'string' ? file.path.trim() : ''
	const normalizedPath = normalizePathForDiff(rawPath) || rawPath
	const lastSlashIndex = normalizedPath.lastIndexOf('/')
	const fileName = lastSlashIndex >= 0
		? normalizedPath.slice(lastSlashIndex + 1)
		: normalizedPath
	const folder = lastSlashIndex > 0
		? normalizedPath.slice(0, lastSlashIndex)
		: (lastSlashIndex === 0 ? '/' : '')

	const rawSize = Number(file.size)
	const sizeBytes = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 0
	const formattedSize = typeof options.formatSize === 'function'
		? options.formatSize(sizeBytes)
		: `${sizeBytes} B`

	const modifiedAt = formatFileModifiedTime(file)
	const mimetype = typeof file.mimetype === 'string' ? file.mimetype.trim() : ''

	return {
		normalizedPath,
		fileName,
		folder,
		sizeBytes,
		formattedSize,
		modifiedAt,
		mimetype,
		isProtected: Boolean(file.isInOriginFolder),
		isLivePhotoVideoMissing: Boolean(file.isLivePhotoVideoMissing),
	}
}

/**
 * Pick smart default Left (reference/keep) and Right (candidate/duplicate)
 * indices for side-by-side comparison.
 *
 * @param {Array<object>|null|undefined} files - Duplicate group file entries.
 * @param {object} [options] - Selection context options.
 * @param {Function} [options.isSelected] - Predicate `(file, index) => boolean` for deletion selection.
 * @return {{ leftIndex: number, rightIndex: number }} Deterministic pair of indices.
 */
export function pickDefaultComparisonPair(files, options = {}) {
	if (!Array.isArray(files) || files.length <= 1) {
		return { leftIndex: 0, rightIndex: 0 }
	}

	const isSelected = typeof options.isSelected === 'function'
		? options.isSelected
		: () => false

	let leftIndex = files.findIndex(file => Boolean(file && file.isInOriginFolder))
	if (leftIndex === -1) {
		leftIndex = files.findIndex((file, idx) => Boolean(file) && !isSelected(file, idx))
	}
	if (leftIndex === -1) {
		leftIndex = 0
	}

	let rightIndex = files.findIndex(
		(file, idx) => idx !== leftIndex && Boolean(file) && isSelected(file, idx),
	)
	if (rightIndex === -1) {
		rightIndex = files.findIndex(
			(file, idx) => idx !== leftIndex && Boolean(file) && !file.isInOriginFolder,
		)
	}
	if (rightIndex === -1) {
		rightIndex = leftIndex === 0 ? 1 : 0
	}

	return { leftIndex, rightIndex }
}

/**
 * Clamp comparison indices to valid bounds and keep sides distinct when possible.
 *
 * @param {Array<object>|null|undefined} files - Current duplicate group files.
 * @param {number} leftIndex - Requested left index.
 * @param {number} rightIndex - Requested right index.
 * @return {{ leftIndex: number, rightIndex: number }} Safe bounded indices.
 */
export function clampComparisonPair(files, leftIndex, rightIndex) {
	if (!Array.isArray(files) || files.length <= 1) {
		return { leftIndex: 0, rightIndex: 0 }
	}

	const maxIndex = files.length - 1
	const safeLeft = Number.isInteger(leftIndex)
		? Math.min(maxIndex, Math.max(0, leftIndex))
		: 0
	let safeRight = Number.isInteger(rightIndex)
		? Math.min(maxIndex, Math.max(0, rightIndex))
		: (safeLeft === 0 ? 1 : 0)

	if (safeRight === safeLeft) {
		safeRight = safeLeft === 0 ? 1 : 0
	}

	return {
		leftIndex: safeLeft,
		rightIndex: safeRight,
	}
}

/**
 * Compute structured Beyond Compare-style metadata diff rows between two copies.
 *
 * @param {object|null|undefined} leftFile - Reference (left) file entry.
 * @param {object|null|undefined} rightFile - Candidate (right) file entry.
 * @param {object} [options] - Formatting and status options.
 * @param {Function} [options.formatSize] - Optional size formatter.
 * @param {string} [options.leftStatus] - Resolved status label for left file.
 * @param {string} [options.rightStatus] - Resolved status label for right file.
 * @param {string} [options.unavailableLabel] - Fallback label when one side lacks a value.
 * @return {{ rows: Array<{ key: string, leftValue: string, rightValue: string, isDiff: boolean }>, diffCount: number }}
 */
export function computeSideBySideDiffRows(leftFile, rightFile, options = {}) {
	if (!leftFile && !rightFile) {
		return { rows: [], diffCount: 0 }
	}

	const formatSize = typeof options.formatSize === 'function' ? options.formatSize : undefined
	const unavailableLabel = typeof options.unavailableLabel === 'string' && options.unavailableLabel
		? options.unavailableLabel
		: 'Unavailable'

	const leftMeta = extractFileDisplayMeta(leftFile, { formatSize })
	const rightMeta = extractFileDisplayMeta(rightFile, { formatSize })

	const rows = [
		{
			key: 'fileName',
			leftValue: leftMeta.fileName || unavailableLabel,
			rightValue: rightMeta.fileName || unavailableLabel,
			isDiff: leftMeta.fileName !== rightMeta.fileName,
		},
		{
			key: 'folder',
			leftValue: leftMeta.folder || unavailableLabel,
			rightValue: rightMeta.folder || unavailableLabel,
			isDiff: leftMeta.folder !== rightMeta.folder,
		},
		{
			key: 'size',
			leftValue: leftMeta.formattedSize,
			rightValue: rightMeta.formattedSize,
			isDiff: leftMeta.sizeBytes !== rightMeta.sizeBytes || leftMeta.formattedSize !== rightMeta.formattedSize,
		},
	]

	if (leftMeta.modifiedAt || rightMeta.modifiedAt) {
		rows.push({
			key: 'modifiedAt',
			leftValue: leftMeta.modifiedAt || unavailableLabel,
			rightValue: rightMeta.modifiedAt || unavailableLabel,
			isDiff: leftMeta.modifiedAt !== rightMeta.modifiedAt,
		})
	}

	if (leftMeta.mimetype || rightMeta.mimetype) {
		rows.push({
			key: 'mimetype',
			leftValue: leftMeta.mimetype || unavailableLabel,
			rightValue: rightMeta.mimetype || unavailableLabel,
			isDiff: leftMeta.mimetype !== rightMeta.mimetype,
		})
	}

	const leftStatus = typeof options.leftStatus === 'string' ? options.leftStatus.trim() : ''
	const rightStatus = typeof options.rightStatus === 'string' ? options.rightStatus.trim() : ''
	if (leftStatus || rightStatus) {
		rows.push({
			key: 'status',
			leftValue: leftStatus || unavailableLabel,
			rightValue: rightStatus || unavailableLabel,
			isDiff: leftStatus !== rightStatus,
		})
	}

	const diffCount = rows.reduce((total, row) => total + (row.isDiff ? 1 : 0), 0)

	return {
		rows,
		diffCount,
	}
}
