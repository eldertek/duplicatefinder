<template>
	<div
		class="compare-workspace"
		role="region"
		:aria-label="t('duplicatefinder', 'Side-by-side comparison')">
		<div class="compare-toolbar">
			<div
				class="compare-diff-summary"
				role="status"
				aria-live="polite">
				<span
					v-if="diffResult.diffCount === 0"
					class="compare-diff-badge is-identical">
					{{ t('duplicatefinder', 'Identical metadata across both copies') }}
				</span>
				<span
					v-else
					class="compare-diff-badge is-different">
					{{ t('duplicatefinder', '{count} metadata difference(s) between copies', { count: diffResult.diffCount }) }}
				</span>
			</div>
			<div class="compare-toolbar__actions">
				<button
					type="button"
					class="compare-toolbar__button compare-swap-button"
					:disabled="files.length < 2"
					@click="swapSides">
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
						<polyline points="16 3 21 3 21 8" />
						<line
							x1="4"
							y1="20"
							x2="21"
							y2="3" />
						<polyline points="21 16 21 21 16 21" />
						<line
							x1="15"
							y1="15"
							x2="21"
							y2="21" />
						<line
							x1="4"
							y1="4"
							x2="9"
							y2="9" />
					</svg>
					<span>{{ t('duplicatefinder', 'Swap sides') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-close-button"
					aria-keyshortcuts="v"
					@click="$emit('close-compare')">
					<span>{{ t('duplicatefinder', 'List view') }}</span>
				</button>
			</div>
		</div>

		<div class="compare-panes-grid">
			<section
				v-for="pane in panes"
				:key="pane.side"
				class="compare-pane"
				:class="[
					'compare-pane--' + pane.side,
					{
						'is-selected': pane.isSelected,
						'is-keeping': hasActiveSelection && !pane.isSelected && !pane.isProtected,
						'is-protected': pane.isProtected,
					},
				]"
				:aria-label="pane.sideLabel">
				<header class="compare-pane__header">
					<div class="compare-pane__selector">
						<label
							:for="'compare-select-' + pane.side"
							class="compare-pane__role-label">
							{{ pane.sideLabel }}
						</label>
						<select
							:id="'compare-select-' + pane.side"
							class="compare-pane__select"
							:value="pane.index"
							@change="onSelectPaneIndex(pane.side, $event)">
							<option
								v-for="(optionFile, optionIdx) in files"
								:key="getFileKey(optionFile)"
								:value="optionIdx">
								{{ formatOptionLabel(optionFile, optionIdx) }}
							</option>
						</select>
					</div>
					<span
						class="compare-pane__status-badge"
						:class="'is-' + pane.statusKind">
						{{ pane.statusLabel }}
					</span>
				</header>

				<div class="compare-pane__preview">
					<img
						v-if="!previewErrors[pane.key] && pane.previewUrl"
						class="compare-pane__image"
						:src="pane.previewUrl"
						:alt="pane.meta.fileName || pane.meta.normalizedPath"
						loading="lazy"
						@error="markPreviewError(pane.key)">
					<div
						v-else
						class="compare-pane__preview-fallback">
						<span class="compare-pane__preview-mime">{{ pane.meta.mimetype || t('duplicatefinder', 'File') }}</span>
					</div>
				</div>

				<div class="compare-pane__identity">
					<div class="compare-pane__filename-row">
						<strong class="compare-pane__filename">{{ pane.meta.fileName || pane.meta.normalizedPath }}</strong>
					</div>
					<div
						v-if="pane.badges"
						class="compare-pane__badges">
						<span
							v-if="pane.badges.isProtectedOrigin"
							class="metadata-badge metadata-badge--protected">
							{{ t('duplicatefinder', 'Protected origin') }}
						</span>
						<span
							v-if="pane.badges.isOldest"
							class="metadata-badge metadata-badge--oldest">
							{{ t('duplicatefinder', 'Oldest') }}
						</span>
						<span
							v-if="pane.badges.isNewest"
							class="metadata-badge metadata-badge--newest">
							{{ t('duplicatefinder', 'Newest') }}
						</span>
						<span
							v-if="pane.badges.isShortestPath"
							class="metadata-badge metadata-badge--shortest">
							{{ t('duplicatefinder', 'Shortest path') }}
						</span>
					</div>
				</div>

				<div class="compare-pane__path-box">
					<p
						class="compare-pane__path"
						:title="pane.meta.normalizedPath">
						<template v-if="pane.pathSegments.length > 0">
							<span
								v-for="(segment, segIdx) in pane.pathSegments"
								:key="segIdx"
								class="file-path-segment"
								:class="'file-path-segment--' + segment.kind">{{ segment.text }}</span>
						</template>
						<template v-else>
							{{ pane.meta.normalizedPath }}
						</template>
					</p>
					<div class="compare-pane__path-actions">
						<button
							type="button"
							class="compare-pane__mini-button compare-copy-path-button"
							:class="{
								'is-copied': copyStates[pane.side] === 'copied',
								'is-error': copyStates[pane.side] === 'error',
							}"
							:disabled="!pane.meta.normalizedPath"
							@click="copyPanePath(pane.side, pane.meta.normalizedPath)">
							{{ t('duplicatefinder', 'Copy path') }}
						</button>
						<button
							type="button"
							class="compare-pane__mini-button compare-open-file-button"
							@click="openFile(pane.file)">
							{{ t('duplicatefinder', 'Open File') }}
						</button>
						<button
							type="button"
							class="compare-pane__mini-button compare-open-folder-button"
							@click="openFolder(pane.file)">
							{{ t('duplicatefinder', 'Open Folder') }}
						</button>
						<span
							class="compare-pane__copy-status"
							:class="{ 'is-visible': Boolean(copyMessages[pane.side]) }"
							role="status"
							aria-live="polite">
							{{ copyMessages[pane.side] }}
						</span>
					</div>
				</div>

				<dl class="compare-pane__diff-list">
					<div
						v-for="row in diffResult.rows"
						:key="row.key"
						class="compare-diff-row"
						:class="{ 'is-diff': row.isDiff }">
						<dt class="compare-diff-row__label">
							<span>{{ getDiffRowLabel(row.key) }}</span>
							<span
								v-if="row.isDiff"
								class="compare-diff-row__badge">
								{{ t('duplicatefinder', 'Diff') }}
							</span>
						</dt>
						<dd class="compare-diff-row__value">
							{{ pane.side === 'left' ? row.leftValue : row.rightValue }}
						</dd>
					</div>
				</dl>

				<footer class="compare-pane__footer">
					<button
						v-if="!pane.isProtected"
						type="button"
						class="compare-pane__triage-button"
						:class="{ 'is-marked-delete': pane.isSelected }"
						:aria-pressed="pane.isSelected ? 'true' : 'false'"
						@click="$emit('toggle-file-selection', pane.file)">
						{{ pane.isSelected
							? t('duplicatefinder', 'Keep this copy')
							: t('duplicatefinder', 'Mark for deletion') }}
					</button>
					<span
						v-else
						class="compare-pane__protected-note">
						{{ t('duplicatefinder', 'Protected origin copy cannot be deleted') }}
					</span>
				</footer>
			</section>
		</div>
	</div>
</template>

<script>
// eslint-disable-next-line node/no-unpublished-import
import { generateUrl } from '@nextcloud/router'
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	clampComparisonPair,
	computeSideBySideDiffRows,
	extractFileDisplayMeta,
	pickDefaultComparisonPair,
} from '../tools/duplicateCompare'
import { formatBytes } from '../tools/duplicateStats'
import { fileKey, getParentFolderPath, getPreviewImage, isSameFile } from '../tools/utils'

export default {
	name: 'DuplicateCompareView',
	props: {
		files: {
			type: Array,
			required: true,
		},
		selectedFiles: {
			type: Array,
			default: () => [],
		},
		pathSegmentsByIndex: {
			type: Array,
			default: () => [],
		},
		metadataBadgesByIndex: {
			type: Array,
			default: () => [],
		},
	},
	data() {
		return {
			leftIndex: 0,
			rightIndex: 1,
			previewErrors: {},
			copyStates: {
				left: 'idle',
				right: 'idle',
			},
			copyMessages: {
				left: '',
				right: '',
			},
			copyTimers: {
				left: null,
				right: null,
			},
		}
	},
	computed: {
		hasActiveSelection() {
			return Array.isArray(this.selectedFiles) && this.selectedFiles.length > 0
		},
		boundedPair() {
			return clampComparisonPair(this.files, this.leftIndex, this.rightIndex)
		},
		leftFile() {
			return this.files[this.boundedPair.leftIndex] || null
		},
		rightFile() {
			return this.files[this.boundedPair.rightIndex] || null
		},
		diffResult() {
			const leftStatus = this.resolveStatus(this.leftFile, this.boundedPair.leftIndex).label
			const rightStatus = this.resolveStatus(this.rightFile, this.boundedPair.rightIndex).label
			return computeSideBySideDiffRows(this.leftFile, this.rightFile, {
				formatSize: bytes => this.formatSize(bytes),
				leftStatus,
				rightStatus,
				unavailableLabel: this.t('duplicatefinder', 'Unavailable'),
			})
		},
		panes() {
			return [
				this.buildPane('left', this.boundedPair.leftIndex, this.t('duplicatefinder', 'Left copy (Reference)')),
				this.buildPane('right', this.boundedPair.rightIndex, this.t('duplicatefinder', 'Right copy (Compare)')),
			].filter(Boolean)
		},
	},
	watch: {
		files: {
			immediate: true,
			handler(nextFiles, prevFiles) {
				if (!Array.isArray(nextFiles) || nextFiles.length === 0) {
					this.leftIndex = 0
					this.rightIndex = 0
					return
				}
				if (!prevFiles || nextFiles !== prevFiles) {
					this.previewErrors = {}
					const pair = pickDefaultComparisonPair(nextFiles, {
						isSelected: file => this.isFileSelected(file),
					})
					this.leftIndex = pair.leftIndex
					this.rightIndex = pair.rightIndex
				} else {
					const clamped = clampComparisonPair(nextFiles, this.leftIndex, this.rightIndex)
					this.leftIndex = clamped.leftIndex
					this.rightIndex = clamped.rightIndex
				}
				this.$nextTick(() => {
					this.syncSelectElements()
				})
			},
		},
	},
	beforeDestroy() {
		this.clearCopyTimer('left')
		this.clearCopyTimer('right')
	},
	methods: {
		syncSelectElements() {
			if (!this.$el || typeof this.$el.querySelector !== 'function') {
				return
			}
			const leftSelect = this.$el.querySelector('#compare-select-left')
			const rightSelect = this.$el.querySelector('#compare-select-right')
			if (leftSelect) {
				leftSelect.value = String(this.boundedPair.leftIndex)
			}
			if (rightSelect) {
				rightSelect.value = String(this.boundedPair.rightIndex)
			}
		},
		getFileKey(file) {
			return fileKey(file)
		},
		isFileSelected(file) {
			if (!file || !Array.isArray(this.selectedFiles)) {
				return false
			}
			return this.selectedFiles.some(selected => isSameFile(selected, file))
		},
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		resolveStatus(file, index) {
			if (!file) {
				return { kind: 'duplicate', label: '' }
			}
			if (file.isInOriginFolder) {
				return { kind: 'protected', label: this.t('duplicatefinder', 'Protected') }
			}
			if (this.hasActiveSelection) {
				return this.isFileSelected(file)
					? { kind: 'will-delete', label: this.t('duplicatefinder', 'Will delete') }
					: { kind: 'keeping', label: this.t('duplicatefinder', 'Keeping') }
			}
			return index === 0
				? { kind: 'original', label: this.t('duplicatefinder', 'Original') }
				: { kind: 'duplicate', label: this.t('duplicatefinder', 'Duplicate') }
		},
		buildPane(side, index, sideLabel) {
			const file = this.files[index]
			if (!file) {
				return null
			}
			const meta = extractFileDisplayMeta(file, { formatSize: bytes => this.formatSize(bytes) })
			const status = this.resolveStatus(file, index)
			return {
				side,
				sideLabel,
				index,
				file,
				key: `${side}-${this.getFileKey(file)}`,
				meta,
				isProtected: Boolean(file.isInOriginFolder),
				isSelected: this.isFileSelected(file),
				statusKind: status.kind,
				statusLabel: status.label,
				previewUrl: getPreviewImage(file),
				badges: this.metadataBadgesByIndex[index] || null,
				pathSegments: Array.isArray(this.pathSegmentsByIndex[index]) ? this.pathSegmentsByIndex[index] : [],
			}
		},
		formatOptionLabel(file, index) {
			const meta = extractFileDisplayMeta(file)
			const shortPath = meta.normalizedPath || meta.fileName || ''
			return `${this.t('duplicatefinder', 'File')} ${index + 1}: ${shortPath}`
		},
		getDiffRowLabel(key) {
			const labels = {
				fileName: this.t('duplicatefinder', 'Filename'),
				folder: this.t('duplicatefinder', 'Folder'),
				size: this.t('duplicatefinder', 'Size'),
				modifiedAt: this.t('duplicatefinder', 'Modified'),
				mimetype: this.t('duplicatefinder', 'Type'),
				status: this.t('duplicatefinder', 'Status'),
			}
			return labels[key] || key
		},
		onSelectPaneIndex(side, event) {
			const nextIndex = Number(event && event.target ? event.target.value : -1)
			if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= this.files.length) {
				return
			}
			if (side === 'left') {
				if (nextIndex === this.boundedPair.rightIndex && this.files.length > 1) {
					this.rightIndex = this.boundedPair.leftIndex
				}
				this.leftIndex = nextIndex
				return
			}
			if (nextIndex === this.boundedPair.leftIndex && this.files.length > 1) {
				this.leftIndex = this.boundedPair.rightIndex
			}
			this.rightIndex = nextIndex
		},
		swapSides() {
			const prevLeft = this.boundedPair.leftIndex
			const prevRight = this.boundedPair.rightIndex
			this.leftIndex = prevRight
			this.rightIndex = prevLeft
		},
		markPreviewError(paneKey) {
			this.$set(this.previewErrors, paneKey, true)
		},
		clearCopyTimer(side) {
			if (this.copyTimers[side]) {
				clearTimeout(this.copyTimers[side])
				this.copyTimers[side] = null
			}
		},
		async copyPanePath(side, path) {
			if (!path) {
				return false
			}
			this.clearCopyTimer(side)
			this.$set(this.copyStates, side, 'idle')
			this.$set(this.copyMessages, side, '')
			const copied = await copyTextSafely(path)
			if (copied) {
				this.$set(this.copyStates, side, 'copied')
				this.$set(this.copyMessages, side, this.t('duplicatefinder', 'Copied'))
			} else {
				this.$set(this.copyStates, side, 'error')
				this.$set(this.copyMessages, side, this.t('duplicatefinder', 'Copy failed'))
			}
			this.copyTimers[side] = setTimeout(() => {
				this.$set(this.copyStates, side, 'idle')
				this.$set(this.copyMessages, side, '')
				this.copyTimers[side] = null
			}, 2000)
			return copied
		},
		openFile(file) {
			if (!file || !file.nodeId || !file.path) {
				return
			}
			const url = generateUrl(`/apps/files/files/${file.nodeId}?dir={dir}&openfile=true`, {
				dir: getParentFolderPath(file.path),
			})
			window.open(url, '_blank', 'noopener')
		},
		openFolder(file) {
			if (!file || !file.path) {
				return
			}
			const url = generateUrl('/apps/files/files?dir={dir}', {
				dir: getParentFolderPath(file.path),
			})
			window.open(url, '_blank', 'noopener')
		},
	},
}
</script>

<style scoped>
.compare-workspace {
	display: flex;
	flex-direction: column;
	gap: 14px;
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.compare-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	box-sizing: border-box;
}

.compare-diff-summary {
	display: flex;
	align-items: center;
	min-inline-size: 0;
}

.compare-diff-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.82rem;
	font-weight: 600;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.compare-diff-badge.is-identical {
	background-color: rgba(46, 125, 50, 0.14);
	border: 1px solid rgba(46, 125, 50, 0.48);
	color: var(--color-main-text);
}

.compare-diff-badge.is-different {
	background-color: rgba(217, 119, 6, 0.14);
	border: 1px solid rgba(217, 119, 6, 0.48);
	color: var(--color-main-text);
}

.compare-toolbar__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-toolbar__button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.compare-toolbar__button svg {
	display: block;
	flex-shrink: 0;
	pointer-events: none;
}

.compare-toolbar__button:hover:not(:disabled),
.compare-toolbar__button:focus-visible:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-toolbar__button:focus-visible,
.compare-pane__select:focus-visible,
.compare-pane__mini-button:focus-visible,
.compare-pane__triage-button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.compare-panes-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.compare-pane {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
	padding: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-pane.is-selected {
	border-inline-start: 4px solid #d32f2f;
}

.compare-pane.is-keeping {
	border-inline-start: 4px solid var(--color-element-success, #2e7d32);
}

.compare-pane.is-protected {
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
}

.compare-pane__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 10px;
}

.compare-pane__selector {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1 1 180px;
	min-inline-size: 0;
}

.compare-pane__role-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.compare-pane__select {
	inline-size: 100%;
	max-inline-size: 100%;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	box-sizing: border-box;
}

.compare-pane__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.8rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.compare-pane__status-badge.is-will-delete {
	background-color: rgba(211, 47, 47, 0.14);
	border-color: rgba(211, 47, 47, 0.48);
}

.compare-pane__status-badge.is-keeping,
.compare-pane__status-badge.is-original {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.compare-pane__status-badge.is-protected {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-pane__preview {
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: 100%;
	min-block-size: 170px;
	max-block-size: 240px;
	padding: 8px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-dark);
	overflow: hidden;
	box-sizing: border-box;
}

.compare-pane__image {
	display: block;
	max-inline-size: 100%;
	max-block-size: 220px;
	object-fit: contain;
	border-radius: 4px;
}

.compare-pane__preview-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	color: var(--color-text-maxcontrast);
	font-size: 0.86rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.compare-pane__identity {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-inline-size: 0;
}

.compare-pane__filename {
	display: block;
	font-size: 0.96rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.compare-pane__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.metadata-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.76rem;
	font-weight: 600;
	line-height: 1.35;
}

.metadata-badge--protected {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #00679e);
}

.metadata-badge--oldest {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.metadata-badge--newest {
	background-color: rgba(2, 119, 189, 0.14);
	border-color: rgba(2, 119, 189, 0.45);
}

.metadata-badge--shortest {
	background-color: rgba(217, 119, 6, 0.14);
	border-color: rgba(217, 119, 6, 0.48);
}

.compare-pane__path-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.compare-pane__path {
	margin: 0;
	font-size: 0.84rem;
	line-height: 1.45;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.file-path-segment--common {
	color: var(--color-text-maxcontrast);
}

.file-path-segment--diff {
	color: var(--color-main-text);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.14));
	font-weight: 600;
	border-radius: 3px;
	padding-inline: 2px;
}

.file-path-segment--filename {
	color: var(--color-main-text);
	font-weight: 500;
}

.compare-pane__path-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-pane__mini-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.compare-pane__mini-button:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-pane__copy-status {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.compare-pane__diff-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
}

.compare-diff-row {
	display: grid;
	grid-template-columns: minmax(90px, 120px) minmax(0, 1fr);
	gap: 8px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-diff-row.is-diff {
	border-color: rgba(217, 119, 6, 0.52);
	border-inline-start: 3px solid #d97706;
	background-color: rgba(217, 119, 6, 0.08);
}

.compare-diff-row__label {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px;
	margin: 0;
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.compare-diff-row__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 1px;
	padding-inline: 5px;
	border-radius: 999px;
	background-color: rgba(217, 119, 6, 0.18);
	color: var(--color-main-text);
	font-size: 0.7rem;
	font-weight: 700;
}

.compare-diff-row__value {
	margin: 0;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.compare-pane__footer {
	margin-block-start: auto;
	padding-block-start: 4px;
}

.compare-pane__triage-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 100%;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: 8px;
	border: 1px solid #d32f2f;
	background-color: rgba(211, 47, 47, 0.1);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.compare-pane__triage-button.is-marked-delete {
	border-color: var(--color-element-success, #2e7d32);
	background-color: rgba(46, 125, 50, 0.14);
}

.compare-pane__triage-button:hover {
	background-color: var(--color-background-dark);
}

.compare-pane__protected-note {
	display: inline-flex;
	align-items: center;
	min-block-size: 44px;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

@media (max-width: 800px) {
	.compare-panes-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.compare-diff-row {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
