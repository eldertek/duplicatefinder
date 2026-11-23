<template>
	<section
		class="treemap-workspace"
		role="region"
		:aria-label="t('duplicatefinder', 'Interactive duplicate treemap')"
		@keydown.backspace="onCanvasBackspace">
		<header class="treemap-toolbar">
			<div class="treemap-nav-group">
				<button
					v-if="canZoomOut"
					type="button"
					class="treemap-toolbar__button treemap-up-button"
					:title="t('duplicatefinder', 'Zoom out one folder level')"
					:aria-label="t('duplicatefinder', 'Zoom out one folder level')"
					@click="zoomOut">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true">
						<polyline points="15 18 9 12 15 6" />
					</svg>
					<span>{{ t('duplicatefinder', 'Up') }}</span>
				</button>

				<nav
					class="treemap-breadcrumbs"
					:aria-label="t('duplicatefinder', 'Treemap folder path')">
					<template v-for="(crumb, idx) in breadcrumbs">
						<span
							v-if="idx > 0"
							:key="'sep-' + crumb.path"
							class="treemap-breadcrumb-sep"
							aria-hidden="true">/</span>
						<button
							:key="'crumb-' + crumb.path"
							type="button"
							class="treemap-breadcrumb-button"
							:class="{ 'is-current': !activeBucket && idx === breadcrumbs.length - 1 }"
							:aria-current="!activeBucket && idx === breadcrumbs.length - 1 ? 'location' : null"
							@click="zoomToPath(crumb.path)">
							{{ crumb.name }}
						</button>
					</template>
					<template v-if="activeBucket">
						<span class="treemap-breadcrumb-sep" aria-hidden="true">/</span>
						<span class="treemap-breadcrumb-current">{{ activeBucket.name }}</span>
					</template>
				</nav>
			</div>

			<div class="treemap-toolbar__actions">
				<span
					class="treemap-summary-pill"
					role="status"
					aria-live="polite">
					{{ formatSummaryPill(formattedCurrentSize, currentGroupCount) }}
				</span>

				<button
					v-if="canSyncCurrentFolder || isFolderFilterActive"
					type="button"
					class="treemap-toolbar__button treemap-sync-button"
					:class="{ 'is-active': isCurrentFolderSynced }"
					:aria-pressed="isCurrentFolderSynced ? 'true' : 'false'"
					:title="isCurrentFolderSynced
						? t('duplicatefinder', 'Clear treemap folder filter from sidebar list')
						: t('duplicatefinder', 'Filter sidebar list to {path}', { path: activeZoomPath })"
					@click="toggleFolderSync">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="15"
						height="15"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true">
						<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
					</svg>
					<span>
						{{ isCurrentFolderSynced
							? t('duplicatefinder', 'Filtering: {path}', { path: activeZoomPath })
							: t('duplicatefinder', 'Filter list') }}
					</span>
				</button>

				<button
					type="button"
					class="treemap-toolbar__button treemap-close-button"
					aria-keyshortcuts="t"
					:title="t('duplicatefinder', 'Hide treemap')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide treemap') }}</span>
				</button>
			</div>
		</header>

		<div v-if="layout.tiles.length > 0" class="treemap-body">
			<div
				class="treemap-canvas"
				role="group"
				:aria-label="t('duplicatefinder', 'Space map of duplicate folders and groups')">
				<button
					v-for="tile in layout.tiles"
					:key="tile.node.id"
					type="button"
					class="treemap-tile"
					:class="[
						'treemap-tile--' + tile.node.category,
						'treemap-tile--kind-' + tile.node.kind,
						{
							'is-compact': tile.isCompact,
							'is-tiny': tile.isTiny,
							'is-active': isTileDirectlyActive(tile.node),
							'is-containing-active': !isTileDirectlyActive(tile.node) && isTileContainingActive(tile.node),
						},
					]"
					:style="{
						insetInlineStart: tile.x + '%',
						top: tile.y + '%',
						width: tile.width + '%',
						height: tile.height + '%',
					}"
					:title="formatTileLabel(tile)"
					:aria-label="formatTileLabel(tile)"
					:aria-pressed="tile.node.kind === 'group' ? (isTileDirectlyActive(tile.node) ? 'true' : 'false') : null"
					@click="onTileClick(tile.node)">
					<span v-if="!tile.isTiny" class="treemap-tile__inner">
						<span class="treemap-tile__header">
							<span class="treemap-tile__kind-tag" aria-hidden="true">
								{{ tile.node.kind === 'folder' ? 'DIR' : (tile.node.kind === 'bucket' ? '+' : 'DUP') }}
							</span>
							<span class="treemap-tile__name">{{ tile.node.name }}</span>
						</span>
						<span v-if="!tile.isCompact" class="treemap-tile__meta">
							<span class="treemap-tile__size">{{ formatSize(tile.node.reclaimableBytes) }}</span>
							<span class="treemap-tile__share">{{ tile.sharePct }}%</span>
							<span v-if="tile.node.kind !== 'group'" class="treemap-tile__groups">
								{{ formatGroupCount(tile.node.groupCount) }}
							</span>
							<span v-else class="treemap-tile__groups">
								{{ formatCopyCount(tile.node.totalCopies) }}
							</span>
						</span>
					</span>
				</button>
			</div>

			<div class="treemap-footer">
				<div
					v-if="categoryLegendItems.length > 0"
					class="treemap-legend"
					:aria-label="t('duplicatefinder', 'File type breakdown')">
					<span
						v-for="item in categoryLegendItems"
						:key="item.category"
						class="treemap-legend-item">
						<span
							class="treemap-legend-swatch"
							:class="'treemap-tile--' + item.category"
							aria-hidden="true" />
						<span class="treemap-legend-label">{{ item.label }}</span>
						<span class="treemap-legend-size">{{ item.formattedSize }}</span>
					</span>
				</div>

				<div
					class="treemap-ranked-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Items in current treemap view')">
					<button
						v-for="tile in layout.tiles"
						:key="'row-' + tile.node.id"
						type="button"
						role="listitem"
						class="treemap-ranked-item"
						:class="[
							'treemap-tile--' + tile.node.category,
							{
								'is-active': isTileDirectlyActive(tile.node),
								'is-containing-active': !isTileDirectlyActive(tile.node) && isTileContainingActive(tile.node),
							},
						]"
						:aria-label="formatTileLabel(tile)"
						@click="onTileClick(tile.node)">
						<span class="treemap-ranked-item__kind">
							{{ tile.node.kind === 'folder' ? t('duplicatefinder', 'Folder') : (tile.node.kind === 'bucket' ? t('duplicatefinder', 'More') : t('duplicatefinder', 'Group')) }}
						</span>
						<span class="treemap-ranked-item__name">{{ tile.node.name }}</span>
						<span class="treemap-ranked-item__stats">
							{{ formatSize(tile.node.reclaimableBytes) }} ({{ tile.sharePct }}%)
						</span>
					</button>
				</div>
			</div>
		</div>

		<p
			v-else
			class="treemap-empty-state"
			role="status"
			aria-live="polite">
			{{ t('duplicatefinder', 'No duplicate groups match the current filters for treemap visualization.') }}
		</p>
	</section>
</template>

<script>
import { formatBytes } from '../tools/duplicateStats'
import {
	TREEMAP_CATEGORIES,
	buildDuplicateTreemapTree,
	buildTreemapBreadcrumbs,
	computeSquarifiedTreemapLayout,
	findTreemapNodeByPath,
	treemapNodeContainsDuplicate,
} from '../tools/duplicateTreemap'

export default {
	name: 'DuplicateTreemap',
	props: {
		duplicates: {
			type: Array,
			default: () => [],
		},
		currentDuplicateId: {
			type: [Number, String],
			default: null,
		},
		currentDuplicateHash: {
			type: String,
			default: '',
		},
		syncedFolderFilter: {
			type: String,
			default: '',
		},
	},
	data() {
		return {
			zoomPath: '/',
			activeBucket: null,
		}
	},
	computed: {
		treeRoot() {
			return buildDuplicateTreemapTree(this.duplicates, {
				rootLabel: this.t('duplicatefinder', 'All duplicates'),
			})
		},
		activeNode() {
			return findTreemapNodeByPath(this.treeRoot, this.zoomPath) || this.treeRoot
		},
		activeZoomPath() {
			return this.activeNode && this.activeNode.path ? this.activeNode.path : '/'
		},
		breadcrumbs() {
			return buildTreemapBreadcrumbs(this.treeRoot, this.activeNode)
		},
		displayedNodes() {
			if (this.activeBucket && Array.isArray(this.activeBucket.items)) {
				return this.activeBucket.items
			}
			return this.activeNode && Array.isArray(this.activeNode.children)
				? this.activeNode.children
				: []
		},
		layout() {
			return computeSquarifiedTreemapLayout(this.displayedNodes, {
				aspect: 1.8,
				maxTiles: 16,
				otherLabel: this.t('duplicatefinder', 'Other'),
			})
		},
		canZoomOut() {
			return Boolean(this.activeBucket) || this.activeZoomPath !== '/'
		},
		canSyncCurrentFolder() {
			return this.activeZoomPath !== '/'
		},
		isFolderFilterActive() {
			return typeof this.syncedFolderFilter === 'string' && this.syncedFolderFilter.trim() !== ''
		},
		isCurrentFolderSynced() {
			if (!this.canSyncCurrentFolder || !this.isFolderFilterActive) {
				return false
			}
			return this.syncedFolderFilter.trim().toLowerCase() === this.activeZoomPath.toLowerCase()
		},
		currentReclaimableBytes() {
			if (this.activeBucket) {
				return Number(this.activeBucket.reclaimableBytes) || 0
			}
			return this.activeNode ? Number(this.activeNode.reclaimableBytes) || 0 : 0
		},
		currentGroupCount() {
			if (this.activeBucket) {
				return Number(this.activeBucket.groupCount) || 0
			}
			return this.activeNode ? Number(this.activeNode.groupCount) || 0 : 0
		},
		formattedCurrentSize() {
			return formatBytes(this.currentReclaimableBytes)
		},
		categoryLegendItems() {
			const sourceMap = this.activeBucket
				? (this.activeBucket.categoryBytes || {})
				: ((this.activeNode && this.activeNode.categoryBytes) || {})
			const labels = {
				images: this.t('duplicatefinder', 'Images'),
				videos: this.t('duplicatefinder', 'Videos'),
				audio: this.t('duplicatefinder', 'Audio'),
				documents: this.t('duplicatefinder', 'Documents'),
				archives: this.t('duplicatefinder', 'Archives'),
				other: this.t('duplicatefinder', 'Other'),
			}
			return TREEMAP_CATEGORIES
				.map(category => ({
					category,
					bytes: Number(sourceMap[category]) || 0,
					label: labels[category] || category,
					formattedSize: formatBytes(Number(sourceMap[category]) || 0),
				}))
				.filter(item => item.bytes > 0)
		},
	},
	watch: {
		treeRoot() {
			const resolved = findTreemapNodeByPath(this.treeRoot, this.zoomPath)
			if (!resolved || resolved.path !== this.zoomPath) {
				this.zoomPath = resolved ? resolved.path : '/'
			}
			this.activeBucket = null
		},
	},
	methods: {
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		formatGroupCount(count) {
			return count === 1
				? this.t('duplicatefinder', '{count} group', { count })
				: this.t('duplicatefinder', '{count} groups', { count })
		},
		formatCopyCount(count) {
			return count === 1
				? this.t('duplicatefinder', '{count} copy', { count })
				: this.t('duplicatefinder', '{count} copies', { count })
		},
		formatSummaryPill(sizeText, groupCount) {
			return groupCount === 1
				? this.t('duplicatefinder', '{size} reclaimable ({groups} group)', { size: sizeText, groups: groupCount })
				: this.t('duplicatefinder', '{size} reclaimable ({groups} groups)', { size: sizeText, groups: groupCount })
		},
		isTileDirectlyActive(node) {
			return Boolean(
				node
				&& node.kind === 'group'
				&& treemapNodeContainsDuplicate(node, this.currentDuplicateId, this.currentDuplicateHash),
			)
		},
		isTileContainingActive(node) {
			return Boolean(
				node
				&& node.kind !== 'group'
				&& treemapNodeContainsDuplicate(node, this.currentDuplicateId, this.currentDuplicateHash),
			)
		},
		formatTileLabel(tile) {
			if (!tile || !tile.node) {
				return ''
			}
			const node = tile.node
			const sizeText = this.formatSize(node.reclaimableBytes)
			if (node.kind === 'folder') {
				return this.t('duplicatefinder', '{name}: {size} reclaimable ({pct}%), {groups} groups. Click to zoom in.', {
					name: node.name,
					size: sizeText,
					pct: tile.sharePct,
					groups: node.groupCount,
				})
			}
			if (node.kind === 'bucket') {
				return this.t('duplicatefinder', '{name}: {size} reclaimable ({pct}%), {groups} groups. Click to expand.', {
					name: node.name,
					size: sizeText,
					pct: tile.sharePct,
					groups: node.groupCount,
				})
			}
			return this.t('duplicatefinder', '{name}: {size} reclaimable ({pct}%), {copies} copies. Click to inspect.', {
				name: node.name,
				size: sizeText,
				pct: tile.sharePct,
				copies: node.totalCopies,
			})
		},
		onTileClick(node) {
			if (!node) {
				return
			}
			if (node.kind === 'folder') {
				this.activeBucket = null
				this.zoomPath = node.path || '/'
				return
			}
			if (node.kind === 'bucket') {
				this.activeBucket = node
				return
			}
			if (node.kind === 'group' && node.duplicate) {
				this.$emit('select-duplicate', node.duplicate)
			}
		},
		zoomToPath(path) {
			this.activeBucket = null
			const target = typeof path === 'string' && path.trim() ? path.trim() : '/'
			this.zoomPath = target
			if (target === '/' && this.isFolderFilterActive) {
				this.$emit('sync-folder-filter', '')
			}
		},
		zoomOut() {
			if (this.activeBucket) {
				this.activeBucket = null
				return
			}
			if (this.breadcrumbs.length > 1) {
				const parent = this.breadcrumbs[this.breadcrumbs.length - 2]
				this.zoomToPath(parent.path)
				return
			}
			this.zoomToPath('/')
		},
		onCanvasBackspace(event) {
			if (!this.canZoomOut) {
				return
			}
			if (event && typeof event.preventDefault === 'function') {
				event.preventDefault()
			}
			this.zoomOut()
		},
		toggleFolderSync() {
			if (this.isCurrentFolderSynced) {
				this.$emit('sync-folder-filter', '')
				return
			}
			if (this.canSyncCurrentFolder) {
				this.$emit('sync-folder-filter', this.activeZoomPath)
			} else if (this.isFolderFilterActive) {
				this.$emit('sync-folder-filter', '')
			}
		},
	},
}
</script>

<style scoped>
.treemap-workspace {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-block: 14px;
	margin-inline: 20px;
	padding-block: 14px;
	padding-inline: 16px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
	max-inline-size: calc(100% - 40px);
}

.treemap-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.treemap-nav-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.treemap-breadcrumbs {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	min-inline-size: 0;
}

.treemap-breadcrumb-sep {
	color: var(--color-text-maxcontrast);
	font-size: 0.85rem;
	user-select: none;
}

.treemap-breadcrumb-button,
.treemap-breadcrumb-current {
	display: inline-flex;
	align-items: center;
	min-block-size: 32px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	line-height: 1.25;
	color: var(--color-main-text);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.treemap-breadcrumb-button {
	border: 1px solid transparent;
	background-color: transparent;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.treemap-breadcrumb-button:hover {
	background-color: var(--color-background-hover);
	border-color: var(--color-border);
}

.treemap-breadcrumb-button.is-current,
.treemap-breadcrumb-current {
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border-dark, var(--color-border));
}

.treemap-toolbar__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.treemap-summary-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 5px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.treemap-toolbar__button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 34px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.2;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.treemap-toolbar__button:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.treemap-toolbar__button.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.treemap-body {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
}

.treemap-canvas {
	position: relative;
	inline-size: 100%;
	block-size: clamp(240px, 34vw, 360px);
	border-radius: var(--border-radius, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-dark);
	overflow: hidden;
	box-sizing: border-box;
}

.treemap-tile {
	position: absolute;
	display: flex;
	align-items: flex-start;
	justify-content: flex-start;
	padding-block: 6px;
	padding-inline: 8px;
	margin: 0;
	border: 1px solid var(--color-main-background, #ffffff);
	border-radius: 0;
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	overflow: hidden;
	box-sizing: border-box;
	transition: filter 0.12s ease, box-shadow 0.12s ease;
}

.treemap-tile:hover {
	filter: brightness(0.95);
	z-index: 2;
}

.treemap-tile:focus-visible,
.treemap-toolbar__button:focus-visible,
.treemap-breadcrumb-button:focus-visible,
.treemap-ranked-item:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: -2px;
	z-index: 4;
}

.treemap-tile.is-active,
.treemap-ranked-item.is-active {
	box-shadow: inset 0 0 0 3px var(--color-primary-element, #0082c9);
	z-index: 3;
}

.treemap-tile.is-containing-active,
.treemap-ranked-item.is-containing-active {
	box-shadow: inset 0 0 0 2px var(--color-primary-element, #0082c9);
}

.treemap-tile--images {
	background-color: color-mix(in srgb, #0082c9 18%, var(--color-main-background));
}

.treemap-tile--videos {
	background-color: color-mix(in srgb, #8e44ad 18%, var(--color-main-background));
}

.treemap-tile--audio {
	background-color: color-mix(in srgb, #16a085 18%, var(--color-main-background));
}

.treemap-tile--documents {
	background-color: color-mix(in srgb, #d97706 18%, var(--color-main-background));
}

.treemap-tile--archives {
	background-color: color-mix(in srgb, #c0392b 18%, var(--color-main-background));
}

.treemap-tile--other {
	background-color: color-mix(in srgb, #5c6b7a 18%, var(--color-main-background));
}

.treemap-tile--kind-folder {
	border-block-start: 3px solid var(--color-border-dark, var(--color-text-maxcontrast));
}

.treemap-tile__inner {
	display: flex;
	flex-direction: column;
	gap: 4px;
	inline-size: 100%;
	min-inline-size: 0;
}

.treemap-tile__header {
	display: flex;
	align-items: center;
	gap: 5px;
	min-inline-size: 0;
}

.treemap-tile__kind-tag {
	flex-shrink: 0;
	padding-block: 1px;
	padding-inline: 4px;
	border-radius: 4px;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border-dark, var(--color-border));
	color: var(--color-main-text);
	font-size: 0.65rem;
	font-weight: 700;
	letter-spacing: 0.03em;
}

.treemap-tile__name {
	font-size: 0.82rem;
	font-weight: 600;
	line-height: 1.25;
	color: var(--color-main-text);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	min-inline-size: 0;
}

.treemap-tile__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px 8px;
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast, var(--color-main-text));
	font-variant-numeric: tabular-nums;
}

.treemap-tile__size {
	font-weight: 700;
	color: var(--color-main-text);
}

.treemap-footer {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-inline-size: 0;
}

.treemap-legend {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 14px;
}

.treemap-legend-item {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.8rem;
	color: var(--color-main-text);
}

.treemap-legend-swatch {
	inline-size: 12px;
	block-size: 12px;
	border-radius: 3px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	flex-shrink: 0;
}

.treemap-legend-size {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.treemap-ranked-list {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
	gap: 6px;
}

.treemap-ranked-item {
	display: flex;
	align-items: center;
	gap: 8px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
	font-size: 0.82rem;
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
	box-sizing: border-box;
}

.treemap-ranked-item__kind {
	flex-shrink: 0;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 999px;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	font-size: 0.7rem;
	font-weight: 700;
}

.treemap-ranked-item__name {
	flex: 1 1 auto;
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.treemap-ranked-item__stats {
	flex-shrink: 0;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast, var(--color-main-text));
	font-variant-numeric: tabular-nums;
}

.treemap-empty-state {
	margin: 0;
	padding-block: 16px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast, var(--color-main-text));
	font-size: 0.9rem;
	text-align: center;
}

@media (max-width: 768px) {
	.treemap-workspace {
		margin-block: 10px;
		margin-inline: 12px;
		padding-block: 12px;
		padding-inline: 12px;
		max-inline-size: calc(100% - 24px);
	}

	.treemap-toolbar__button,
	.treemap-breadcrumb-button {
		min-block-size: 44px;
	}

	.treemap-canvas {
		block-size: 260px;
	}
}
</style>
