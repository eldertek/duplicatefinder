/**
 * Pure WizTree / TreeSize Pro-inspired squarified treemap builder and layout engine
 * for interactive click-to-zoom duplicate storage triage.
 */

import { classifyFileCategory } from './duplicateFilters'
import { normalizePathForDiff } from './duplicatePathDiff'
import { computeGroupReclaimableInfo } from './duplicateStats'

export const TREEMAP_CATEGORIES = Object.freeze([
	'images',
	'videos',
	'audio',
	'documents',
	'archives',
	'other',
])

/**
 * Resolve a stable group key for a duplicate group object.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @param {number} fallbackIndex - Fallback index when id and hash are absent.
 * @return {string} Deterministic group key.
 */
export function getTreemapGroupKey(duplicate, fallbackIndex = 0) {
	if (!duplicate || typeof duplicate !== 'object') {
		return `group-${fallbackIndex}`
	}
	if (duplicate.id !== null && duplicate.id !== undefined && String(duplicate.id) !== '') {
		return `id:${String(duplicate.id)}`
	}
	if (typeof duplicate.hash === 'string' && duplicate.hash.trim() !== '') {
		return `hash:${duplicate.hash.trim()}`
	}
	return `idx:${fallbackIndex}`
}

/**
 * Derive a clean display name for a duplicate group.
 *
 * @param {object|null|undefined} duplicate - Duplicate group object.
 * @return {string} Display title.
 */
export function getTreemapGroupTitle(duplicate) {
	if (!duplicate || typeof duplicate !== 'object') {
		return ''
	}
	const files = Array.isArray(duplicate.files) ? duplicate.files : []
	const names = files
		.map(file => {
			if (!file || typeof file.path !== 'string') {
				return ''
			}
			const normalized = normalizePathForDiff(file.path) || file.path
			const lastSlash = normalized.lastIndexOf('/')
			return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized
		})
		.filter(Boolean)

	if (names.length > 0 && names.every(name => name === names[0])) {
		return names[0]
	}
	if (typeof duplicate.hash === 'string' && duplicate.hash.trim()) {
		return duplicate.hash.trim().slice(0, 8)
	}
	return names[0] || String(duplicate.id ?? 'Duplicate')
}

/**
 * Split a normalized file path into parent folder path, folder segments, and filename.
 *
 * @param {string|null|undefined} rawPath - File path.
 * @return {{ folderPath: string, segments: string[], fileName: string }} Parsed path info.
 */
function parseTreemapFilePath(rawPath) {
	const normalized = normalizePathForDiff(rawPath)
	if (!normalized) {
		return {
			folderPath: '/',
			segments: [],
			fileName: '',
		}
	}

	const cleaned = normalized.startsWith('/') ? normalized : `/${normalized}`
	const lastSlash = cleaned.lastIndexOf('/')
	const fileName = lastSlash >= 0 ? cleaned.slice(lastSlash + 1) : cleaned
	const rawDir = lastSlash > 0 ? cleaned.slice(0, lastSlash) : '/'
	const segments = rawDir === '/'
		? []
		: rawDir.slice(1).split('/').filter(Boolean)
	const folderPath = segments.length > 0 ? `/${segments.join('/')}` : '/'

	return {
		folderPath,
		segments,
		fileName,
	}
}

/**
 * Create an empty mutable folder node.
 *
 * @param {string} name - Folder display name.
 * @param {string} path - Full normalized folder path.
 * @param {number} depth - Tree depth from root.
 * @return {object} Mutable folder node.
 */
function createFolderNode(name, path, depth) {
	return {
		kind: 'folder',
		id: `folder:${path}`,
		name,
		path,
		depth,
		reclaimableBytes: 0,
		groupCount: 0,
		copyCount: 0,
		category: 'other',
		categoryBytes: {},
		groupKeys: new Set(),
		folderMap: new Map(),
		leafMap: new Map(),
		children: [],
	}
}

/**
 * Pick the dominant category from a category-to-bytes map.
 *
 * @param {object} categoryBytes - Map of category to byte count.
 * @return {string} Dominant category key.
 */
function resolveDominantCategory(categoryBytes) {
	let bestCategory = 'other'
	let bestBytes = -1
	for (const category of TREEMAP_CATEGORIES) {
		const value = Number(categoryBytes[category]) || 0
		if (value > bestBytes) {
			bestBytes = value
			bestCategory = category
		}
	}
	return bestBytes > 0 ? bestCategory : 'other'
}

/**
 * Merge category byte counts from source into target.
 *
 * @param {object} target - Target categoryBytes map.
 * @param {object} source - Source categoryBytes map.
 */
function mergeCategoryBytes(target, source) {
	if (!source || typeof source !== 'object') {
		return
	}
	for (const [category, bytes] of Object.entries(source)) {
		const numeric = Number(bytes) || 0
		if (numeric > 0) {
			target[category] = (target[category] || 0) + numeric
		}
	}
}

/**
 * Finalize a mutable folder tree bottom-up, compressing single-child folder chains
 * below the root and sorting children deterministically by reclaimable space.
 *
 * @param {object} node - Mutable folder node.
 * @param {boolean} isRoot - Whether this node is the root node.
 * @return {object} Finalized immutable-ready folder node.
 */
function finalizeFolderNode(node, isRoot = false) {
	const finalizedFolders = []
	for (const childFolder of node.folderMap.values()) {
		finalizedFolders.push(finalizeFolderNode(childFolder, false))
	}

	const finalizedLeaves = []
	for (const leaf of node.leafMap.values()) {
		finalizedLeaves.push({
			...leaf,
			groupKeys: [leaf.groupKey],
		})
	}

	const children = [...finalizedFolders, ...finalizedLeaves]
	children.sort((a, b) => {
		if (b.reclaimableBytes !== a.reclaimableBytes) {
			return b.reclaimableBytes - a.reclaimableBytes
		}
		if (b.groupCount !== a.groupCount) {
			return b.groupCount - a.groupCount
		}
		return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)
	})

	let totalBytes = 0
	let totalCopies = 0
	const groupKeys = new Set()
	const categoryBytes = {}

	for (const child of children) {
		totalBytes += child.reclaimableBytes
		totalCopies += child.copyCount
		if (Array.isArray(child.groupKeys)) {
			for (const key of child.groupKeys) {
				groupKeys.add(key)
			}
		}
		mergeCategoryBytes(categoryBytes, child.categoryBytes)
	}

	let result = {
		kind: 'folder',
		id: node.id,
		name: node.name,
		path: node.path,
		depth: node.depth,
		reclaimableBytes: totalBytes,
		groupCount: groupKeys.size,
		copyCount: totalCopies,
		category: resolveDominantCategory(categoryBytes),
		categoryBytes,
		groupKeys: Array.from(groupKeys),
		children,
	}

	// Collapse single-child folder chains below root so users never click through empty wrappers
	if (!isRoot && result.children.length === 1 && result.children[0].kind === 'folder') {
		const onlyChild = result.children[0]
		result = {
			...onlyChild,
			name: `${result.name}/${onlyChild.name}`,
			depth: result.depth,
		}
	}

	return result
}

/**
 * Build a hierarchical duplicate storage treemap tree from filtered duplicate groups.
 * Reclaimable bytes per group are distributed without inflation across deletable copies
 * (or all copies when all copies are protected), so total tree bytes match exact reclaimable space.
 *
 * @param {Array<object>|null|undefined} duplicates - Filtered duplicate groups.
 * @param {object} [options] - Optional configuration.
 * @param {string} [options.rootLabel='All duplicates'] - Display label for root node.
 * @return {object} Root treemap folder node.
 */
export function buildDuplicateTreemapTree(duplicates, options = {}) {
	const rootLabel = typeof options.rootLabel === 'string' && options.rootLabel.trim()
		? options.rootLabel.trim()
		: 'All duplicates'
	const root = createFolderNode(rootLabel, '/', 0)

	if (!Array.isArray(duplicates) || duplicates.length === 0) {
		return finalizeFolderNode(root, true)
	}

	for (let groupIdx = 0; groupIdx < duplicates.length; groupIdx++) {
		const duplicate = duplicates[groupIdx]
		if (!duplicate || typeof duplicate !== 'object') {
			continue
		}
		const files = Array.isArray(duplicate.files)
			? duplicate.files.filter(file => file && typeof file === 'object')
			: []
		if (files.length <= 1) {
			continue
		}

		const info = computeGroupReclaimableInfo(duplicate)
		if (!info.valid) {
			continue
		}

		const groupKey = getTreemapGroupKey(duplicate, groupIdx)
		const groupTitle = getTreemapGroupTitle(duplicate)
		const deletableFiles = files.filter(file => !file.isInOriginFolder)
		const attributionTargets = deletableFiles.length > 0 ? deletableFiles : files
		const targetCount = attributionTargets.length
		const baseShare = Math.floor(info.reclaimableBytes / targetCount)
		const remainder = info.reclaimableBytes % targetCount

		for (let i = 0; i < targetCount; i++) {
			const file = attributionTargets[i]
			const shareBytes = baseShare + (i < remainder ? 1 : 0)
			const { folderPath, segments } = parseTreemapFilePath(file.path)
			const fileCategory = classifyFileCategory(file)

			let cursor = root
			let currentPath = ''
			for (let segIdx = 0; segIdx < segments.length; segIdx++) {
				const segment = segments[segIdx]
				currentPath += `/${segment}`
				if (!cursor.folderMap.has(segment)) {
					cursor.folderMap.set(segment, createFolderNode(segment, currentPath, segIdx + 1))
				}
				cursor = cursor.folderMap.get(segment)
			}

			const leafKey = `${groupKey}@${folderPath}`
			if (!cursor.leafMap.has(leafKey)) {
				cursor.leafMap.set(leafKey, {
					kind: 'group',
					id: `group:${leafKey}`,
					groupKey,
					groupId: duplicate.id ?? null,
					hash: typeof duplicate.hash === 'string' ? duplicate.hash : '',
					name: groupTitle,
					path: folderPath,
					folderPath,
					reclaimableBytes: 0,
					unitSize: info.unitSize,
					totalCopies: info.count,
					copyCount: 0,
					hasProtectedOrigin: files.some(entry => Boolean(entry && entry.isInOriginFolder)),
					acknowledged: Boolean(duplicate.acknowledged),
					category: fileCategory,
					categoryBytes: {},
					duplicate,
				})
			}

			const leaf = cursor.leafMap.get(leafKey)
			leaf.reclaimableBytes += shareBytes
			leaf.copyCount += 1
			if (shareBytes > 0) {
				leaf.categoryBytes[fileCategory] = (leaf.categoryBytes[fileCategory] || 0) + shareBytes
				leaf.category = resolveDominantCategory(leaf.categoryBytes)
			}
		}
	}

	return finalizeFolderNode(root, true)
}

/**
 * Find a folder node inside the treemap tree by its normalized path.
 * Falls back to root when the path does not exist.
 *
 * @param {object|null|undefined} root - Root treemap node.
 * @param {string|null|undefined} targetPath - Target folder path (e.g. '/Photos/2023').
 * @return {object|null} Matching folder node or root.
 */
export function findTreemapNodeByPath(root, targetPath) {
	if (!root || typeof root !== 'object') {
		return null
	}
	const normalized = typeof targetPath === 'string' ? targetPath.trim() : '/'
	if (!normalized || normalized === '/' || root.path === normalized) {
		return root
	}

	const queue = [root]
	while (queue.length > 0) {
		const current = queue.shift()
		if (current.kind === 'folder' && current.path === normalized) {
			return current
		}
		if (Array.isArray(current.children)) {
			for (const child of current.children) {
				if (child && child.kind === 'folder') {
					if (child.path === normalized) {
						return child
					}
					if (normalized.startsWith(`${child.path}/`)) {
						queue.push(child)
					}
				}
			}
		}
	}

	return root
}

/**
 * Build breadcrumb steps from root down to the active folder node.
 *
 * @param {object|null|undefined} root - Root treemap node.
 * @param {object|null|undefined} activeNode - Current zoomed folder node.
 * @return {Array<{ name: string, path: string }>} Ordered breadcrumb items.
 */
export function buildTreemapBreadcrumbs(root, activeNode) {
	if (!root || typeof root !== 'object') {
		return []
	}
	const trail = [{ name: root.name, path: root.path }]
	if (!activeNode || activeNode.path === root.path) {
		return trail
	}

	let cursor = root
	const targetPath = activeNode.path
	while (cursor && Array.isArray(cursor.children)) {
		const nextChild = cursor.children.find(child => (
			child
			&& child.kind === 'folder'
			&& (child.path === targetPath || targetPath.startsWith(`${child.path}/`))
		))
		if (!nextChild) {
			break
		}
		trail.push({ name: nextChild.name, path: nextChild.path })
		if (nextChild.path === targetPath) {
			break
		}
		cursor = nextChild
	}

	return trail
}

/**
 * Check whether a treemap node (folder, bucket, or group leaf) represents or contains
 * the currently selected duplicate group.
 *
 * @param {object|null|undefined} node - Treemap node.
 * @param {string|number|null|undefined} currentDuplicateId - Active duplicate group id.
 * @param {string|null|undefined} currentDuplicateHash - Optional active duplicate group hash.
 * @return {boolean} True when node matches or contains the active duplicate group.
 */
export function treemapNodeContainsDuplicate(node, currentDuplicateId, currentDuplicateHash = '') {
	if (!node || typeof node !== 'object') {
		return false
	}
	const hasId = currentDuplicateId !== null && currentDuplicateId !== undefined && currentDuplicateId !== ''
	const hasHash = typeof currentDuplicateHash === 'string' && currentDuplicateHash.trim() !== ''
	if (!hasId && !hasHash) {
		return false
	}

	if (node.kind === 'group') {
		if (hasId && node.groupId === currentDuplicateId) {
			return true
		}
		if (hasHash && node.hash === currentDuplicateHash.trim()) {
			return true
		}
		return false
	}

	if (node.kind === 'bucket' && Array.isArray(node.items)) {
		return node.items.some(item => treemapNodeContainsDuplicate(item, currentDuplicateId, currentDuplicateHash))
	}

	if (Array.isArray(node.groupKeys)) {
		if (hasId && node.groupKeys.includes(`id:${String(currentDuplicateId)}`)) {
			return true
		}
		if (hasHash && node.groupKeys.includes(`hash:${currentDuplicateHash.trim()}`)) {
			return true
		}
	}

	if (Array.isArray(node.children)) {
		return node.children.some(child => treemapNodeContainsDuplicate(child, currentDuplicateId, currentDuplicateHash))
	}

	return false
}

/**
 * Compute worst aspect ratio of a squarified treemap row along shorter side `shortSide`.
 *
 * @param {Array<number>} rowWeights - Scaled weights in the candidate row.
 * @param {number} shortSide - Length of the shorter side of the remaining rectangle.
 * @return {number} Worst aspect ratio (>= 1).
 */
function worstAspectRatio(rowWeights, shortSide) {
	if (!rowWeights.length || shortSide <= 0) {
		return Number.POSITIVE_INFINITY
	}
	let sum = 0
	let maxVal = 0
	let minVal = Number.POSITIVE_INFINITY
	for (const value of rowWeights) {
		sum += value
		if (value > maxVal) {
			maxVal = value
		}
		if (value < minVal) {
			minVal = value
		}
	}
	if (sum <= 0 || minVal <= 0) {
		return Number.POSITIVE_INFINITY
	}
	const sideSquared = shortSide * shortSide
	const sumSquared = sum * sum
	return Math.max((sideSquared * maxVal) / sumSquared, sumSquared / (sideSquared * minVal))
}

/**
 * Lay out one finalized row into rectangle `rect` and shrink `rect` to the remaining region.
 *
 * @param {Array<{ node: object, scaledArea: number }>} rowItems - Items in the row.
 * @param {{ x: number, y: number, width: number, height: number }} rect - Remaining layout bounds.
 * @param {Array<object>} out - Output array receiving positioned items.
 */
function commitSquarifyRow(rowItems, rect, out) {
	const rowSum = rowItems.reduce((acc, item) => acc + item.scaledArea, 0)
	if (rowSum <= 0 || rect.width <= 0 || rect.height <= 0) {
		return
	}

	const horizontalRow = rect.width >= rect.height
	if (horizontalRow) {
		const rowWidth = Math.min(rect.width, rowSum / rect.height)
		let cursorY = rect.y
		for (let i = 0; i < rowItems.length; i++) {
			const item = rowItems[i]
			const itemHeight = i === rowItems.length - 1
				? Math.max(0, (rect.y + rect.height) - cursorY)
				: (rowWidth > 0 ? item.scaledArea / rowWidth : 0)
			out.push({
				node: item.node,
				x: rect.x,
				y: cursorY,
				width: rowWidth,
				height: itemHeight,
			})
			cursorY += itemHeight
		}
		rect.x += rowWidth
		rect.width = Math.max(0, rect.width - rowWidth)
	} else {
		const rowHeight = Math.min(rect.height, rowSum / rect.width)
		let cursorX = rect.x
		for (let i = 0; i < rowItems.length; i++) {
			const item = rowItems[i]
			const itemWidth = i === rowItems.length - 1
				? Math.max(0, (rect.x + rect.width) - cursorX)
				: (rowHeight > 0 ? item.scaledArea / rowHeight : 0)
			out.push({
				node: item.node,
				x: cursorX,
				y: rect.y,
				width: itemWidth,
				height: rowHeight,
			})
			cursorX += itemWidth
		}
		rect.y += rowHeight
		rect.height = Math.max(0, rect.height - rowHeight)
	}
}

/**
 * Aggregate tail nodes beyond `maxTiles` into a drillable `"Other"` bucket node
 * so treemap tiles remain legible and touch-friendly on narrow viewports.
 *
 * @param {Array<object>} sortedNodes - Descending sorted nodes.
 * @param {number} maxTiles - Maximum visible tiles before bucketing.
 * @param {string} otherLabel - Label for aggregated tail bucket.
 * @return {Array<object>} Visible nodes including optional bucket.
 */
function bucketTailNodes(sortedNodes, maxTiles, otherLabel) {
	const limit = Number.isInteger(maxTiles) && maxTiles >= 2 ? maxTiles : 16
	if (sortedNodes.length <= limit) {
		return sortedNodes
	}

	const head = sortedNodes.slice(0, limit - 1)
	const tail = sortedNodes.slice(limit - 1)
	let tailBytes = 0
	let tailCopies = 0
	const tailGroupKeys = new Set()
	const tailCategoryBytes = {}

	for (const item of tail) {
		tailBytes += Number(item.reclaimableBytes) || 0
		tailCopies += Number(item.copyCount) || 0
		if (Array.isArray(item.groupKeys)) {
			for (const key of item.groupKeys) {
				tailGroupKeys.add(key)
			}
		}
		mergeCategoryBytes(tailCategoryBytes, item.categoryBytes)
	}

	const bucketNode = {
		kind: 'bucket',
		id: `bucket:other:${tail.length}`,
		name: otherLabel,
		path: '',
		reclaimableBytes: tailBytes,
		groupCount: tailGroupKeys.size > 0 ? tailGroupKeys.size : tail.length,
		copyCount: tailCopies,
		category: resolveDominantCategory(tailCategoryBytes),
		categoryBytes: tailCategoryBytes,
		groupKeys: Array.from(tailGroupKeys),
		items: tail,
	}

	return [...head, bucketNode]
}

/**
 * Compute responsive percentage-based Bruls-Huizing-van Wijk squarified treemap tiles.
 *
 * @param {Array<object>|null|undefined} nodes - Sibling treemap nodes at current zoom level.
 * @param {object} [options] - Layout options.
 * @param {number} [options.aspect=1.8] - Container width/height ratio for square tile optimization.
 * @param {number} [options.maxTiles=16] - Maximum tiles before grouping tail items into an Other bucket.
 * @param {string} [options.otherLabel='Other'] - Label for aggregated tail bucket.
 * @return {{ tiles: Array<{ node: object, x: number, y: number, width: number, height: number, sharePct: number, isCompact: boolean, isTiny: boolean }>, totalBytes: number }} Layout result.
 */
export function computeSquarifiedTreemapLayout(nodes, options = {}) {
	if (!Array.isArray(nodes) || nodes.length === 0) {
		return { tiles: [], totalBytes: 0 }
	}

	const validNodes = nodes.filter(node => node && typeof node === 'object')
	if (validNodes.length === 0) {
		return { tiles: [], totalBytes: 0 }
	}

	const aspect = Number.isFinite(Number(options.aspect)) && Number(options.aspect) > 0.2
		? Number(options.aspect)
		: 1.8
	const maxTiles = Number.isInteger(options.maxTiles) && options.maxTiles >= 2
		? options.maxTiles
		: 16
	const otherLabel = typeof options.otherLabel === 'string' && options.otherLabel.trim()
		? options.otherLabel.trim()
		: 'Other'

	const totalBytesAll = validNodes.reduce((sum, node) => sum + (Number(node.reclaimableBytes) || 0), 0)
	const weightedNodes = totalBytesAll > 0
		? validNodes.filter(node => (Number(node.reclaimableBytes) || 0) > 0)
		: validNodes

	if (weightedNodes.length === 0) {
		return { tiles: [], totalBytes: 0 }
	}

	const sortedNodes = [...weightedNodes].sort((a, b) => {
		const bytesA = Number(a.reclaimableBytes) || 0
		const bytesB = Number(b.reclaimableBytes) || 0
		if (bytesB !== bytesA) {
			return bytesB - bytesA
		}
		return String(a.name || '') < String(b.name || '') ? -1 : 1
	})

	const displayNodes = bucketTailNodes(sortedNodes, maxTiles, otherLabel)
	const totalWeight = totalBytesAll > 0
		? displayNodes.reduce((sum, node) => sum + (Number(node.reclaimableBytes) || 0), 0)
		: displayNodes.length

	if (totalWeight <= 0) {
		return { tiles: [], totalBytes: 0 }
	}

	const canvasWidth = 100 * aspect
	const canvasHeight = 100
	const totalArea = canvasWidth * canvasHeight

	const items = displayNodes.map(node => {
		const rawWeight = totalBytesAll > 0 ? (Number(node.reclaimableBytes) || 0) : 1
		return {
			node,
			scaledArea: (rawWeight / totalWeight) * totalArea,
		}
	})

	const rect = { x: 0, y: 0, width: canvasWidth, height: canvasHeight }
	const placed = []
	let row = []
	let index = 0

	while (index < items.length) {
		const nextItem = items[index]
		const shortSide = Math.min(rect.width, rect.height)
		if (row.length === 0) {
			row.push(nextItem)
			index += 1
			continue
		}

		const currentWeights = row.map(item => item.scaledArea)
		const candidateWeights = [...currentWeights, nextItem.scaledArea]
		if (worstAspectRatio(candidateWeights, shortSide) <= worstAspectRatio(currentWeights, shortSide)) {
			row.push(nextItem)
			index += 1
		} else {
			commitSquarifyRow(row, rect, placed)
			row = []
		}
	}

	if (row.length > 0) {
		commitSquarifyRow(row, rect, placed)
	}

	const tiles = placed.map(entry => {
		const xPct = Math.max(0, Math.min(100, (entry.x / canvasWidth) * 100))
		const yPct = Math.max(0, Math.min(100, entry.y))
		const wPct = Math.max(0, Math.min(100 - xPct, (entry.width / canvasWidth) * 100))
		const hPct = Math.max(0, Math.min(100 - yPct, entry.height))
		const nodeBytes = Number(entry.node.reclaimableBytes) || 0
		const sharePct = totalBytesAll > 0
			? Math.round((nodeBytes / totalBytesAll) * 1000) / 10
			: Math.round((100 / displayNodes.length) * 10) / 10

		return {
			node: entry.node,
			x: Number(xPct.toFixed(3)),
			y: Number(yPct.toFixed(3)),
			width: Number(wPct.toFixed(3)),
			height: Number(hPct.toFixed(3)),
			sharePct,
			isCompact: wPct < 20 || hPct < 22,
			isTiny: wPct < 9 || hPct < 7,
		}
	})

	return {
		tiles,
		totalBytes: totalBytesAll,
	}
}
