<template>
	<NcAppNavigationItem
		:name="getDisplayName"
		:title="getFullPathsTitle"
		:class="['duplicate-list-item', { 'is-active': isActive, 'has-protected-origin': itemMetrics.hasProtectedOrigin }]"
		@click="handleClick">
		<template #icon>
			<div class="nav-thumbnail" :style="thumbnailStyle" />
		</template>
		<template #extra>
			<div class="duplicate-item-meta">
				<div class="duplicate-item-stats">
					<span
						v-if="itemMetrics.hasProtectedOrigin"
						class="duplicate-protected-badge"
						:title="t('duplicatefinder', 'Contains protected origin')"
						:aria-label="t('duplicatefinder', 'Contains protected origin')">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true">
							<rect x="3"
								y="11"
								width="18"
								height="10"
								rx="2"
								ry="2" />
							<path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
						</svg>
					</span>
					<span
						v-if="itemMetrics.copyCount > 1"
						class="duplicate-copy-count"
						:title="reclaimableTooltip">
						{{ itemMetrics.copyCount }}x
					</span>
					<div class="file-size" :title="reclaimableTooltip">
						{{ getFormattedSize }}
					</div>
				</div>
				<div
					v-if="itemMetrics.wastePercent > 0"
					class="duplicate-waste-track"
					aria-hidden="true">
					<div
						class="duplicate-waste-fill"
						:style="{ width: `${itemMetrics.wastePercent}%` }" />
				</div>
			</div>
		</template>
	</NcAppNavigationItem>
</template>

<script>
import { NcAppNavigationItem } from '@nextcloud/vue'
import { computeListItemMetrics } from '@/tools/duplicateStats'
import { getFormattedSizeOfCurrentDuplicate, normalizeItemPath } from '@/tools/utils'

export default {
	components: { NcAppNavigationItem },
	props: {
		duplicate: Object,
		isActive: Boolean,
		maxReclaimableBytes: {
			type: Number,
			default: 0,
		},
	},
	computed: {
		itemMetrics() {
			return computeListItemMetrics(this.duplicate, this.maxReclaimableBytes)
		},
		reclaimableTooltip() {
			if (this.itemMetrics.copyCount <= 1) {
				return ''
			}
			return this.t('duplicatefinder', '{count} copies ({reclaimable} reclaimable)', {
				count: this.itemMetrics.copyCount,
				reclaimable: this.itemMetrics.reclaimableFormatted,
			})
		},
		thumbnailStyle() {
			const firstFile = this.duplicate && Array.isArray(this.duplicate.files)
				? this.duplicate.files[0]
				: null
			if (!firstFile) {
				return {}
			}
			return {
				backgroundImage: 'url(' + this.getPreviewImage(firstFile) + ')',
			}
		},
		getDisplayName() {
			// Get all filenames from the duplicate files
			const filenames = this.duplicate.files.map(file => {
				const pathParts = file.path.split('/')
				return pathParts[pathParts.length - 1]
			})

			// Check if all filenames are the same
			const allSameFilename = filenames.every(name => name === filenames[0])

			// If all files have the same name, return that name
			// Otherwise return a shortened version of the hash
			return allSameFilename ? filenames[0] : this.duplicate.hash.substring(0, 8)
		},
		getFullPathsTitle() {
			if (!this.duplicate || !Array.isArray(this.duplicate.files) || this.duplicate.files.length === 0) {
				return this.getDisplayName
			}
			const paths = this.duplicate.files
				.map(file => (typeof normalizeItemPath === 'function' ? normalizeItemPath(file.path) : file.path) || file.path)
				.filter(Boolean)
			return paths.length > 0 ? paths.join('\n') : this.getDisplayName
		},
		getFormattedSize() {
			return getFormattedSizeOfCurrentDuplicate(this.duplicate)
		},
	},
	methods: {
		handleClick(event) {
			if (event && typeof event.preventDefault === 'function') {
				event.preventDefault()
			}
			this.$emit('duplicate-selected', this.duplicate)
		},
		getPreviewImage(item) {
			// Function to normalize the item path
			const normalizeItemPath = (path) => {
				const match = path.match(/\/([^/]*)\/files(\/.*)/)
				return match ? match[2] : '' // Return the normalized path or an empty string if not match
			}
			// Check if the item is either an image or a video
			const isImageOrVideo = ['image', 'video'].includes(item.mimetype.split('/')[0])
			const normalizedPath = normalizeItemPath(item.path) // Normalize the item path

			if (isImageOrVideo && normalizedPath) {
				// Construct query parameters for generating the preview
				const query = new URLSearchParams({
					file: normalizedPath,
					fileId: item.nodeId,
					x: 500,
					y: 500,
					forceIcon: 0,
				})
				// Return the full URL to the preview image
				return OC.generateUrl('/core/preview.png?') + query.toString()
			} else {
				// For non-image/video files, return the URL to the mimetype icon
				return OC.MimeType.getIconUrl(item.mimetype)
			}
		},
	},
}
</script>

<style scoped>
.is-active {
    border-radius: var(--border-radius-element, var(--border-radius-pill));
}

.is-active :deep(.app-navigation-entry) {
    background-color: var(--color-primary-element-light) !important;
}

.is-active :deep(.app-navigation-entry:hover),
.is-active :deep(.app-navigation-entry:focus-within) {
    background-color: var(--color-primary-element-light-hover, var(--color-background-hover)) !important;
}

.is-active :deep(.app-navigation-entry .app-navigation-entry-link) {
    color: var(--color-primary-element-light-text, var(--color-main-text)) !important;
    font-weight: 600;
}

:deep(.app-navigation-entry .app-navigation-entry-link:focus-visible) {
    outline: 2px solid var(--color-primary-element, #0082c9);
    outline-offset: -2px;
}

.is-active .file-size {
    color: var(--color-primary-element-light-text, var(--color-text-maxcontrast));
    font-weight: 600;
}

.is-active .duplicate-copy-count {
    background-color: var(--color-main-background);
    border-color: var(--color-primary-element, #0082c9);
    color: var(--color-primary-element-light-text, var(--color-main-text));
}

.is-active .duplicate-protected-badge {
    color: var(--color-primary-element-light-text, var(--color-main-text));
}

.is-active .duplicate-waste-fill {
    background-color: var(--color-primary-element-light-text, var(--color-primary-element, #0082c9));
}

.nav-thumbnail {
    width: 20px;
    height: 20px;
    background-size: cover;
    background-position: center;
    border-radius: 4px;
    display: inline-block;
    margin-inline-end: 8px;
}

.duplicate-item-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    min-inline-size: 0;
    max-inline-size: 100%;
    margin-inline-start: 6px;
}

.duplicate-item-stats {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    max-inline-size: 100%;
}

.duplicate-protected-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--color-primary-element, #0082c9);
    flex-shrink: 0;
}

.duplicate-protected-badge svg {
    display: block;
    pointer-events: none;
}

.duplicate-copy-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-block: 1px;
    padding-inline: 5px;
    border-radius: 999px;
    border: 1px solid var(--color-border-dark, var(--color-border));
    background-color: var(--color-background-dark);
    color: var(--color-main-text);
    font-size: 0.72rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.25;
    white-space: nowrap;
}

.file-size {
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-maxcontrast);
    white-space: nowrap;
    margin-inline-start: 2px;
}

.duplicate-waste-track {
    inline-size: 100%;
    min-inline-size: 48px;
    block-size: 3px;
    border-radius: 999px;
    background-color: var(--color-background-dark);
    overflow: hidden;
}

.duplicate-waste-fill {
    block-size: 100%;
    min-inline-size: 4px;
    border-radius: 999px;
    background-color: var(--color-primary-element, #0082c9);
    transition: inline-size 0.15s ease;
}
</style>
