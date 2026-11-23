<template>
	<section
		class="reclamation-workspace"
		role="region"
		:aria-label="t('duplicatefinder', 'Scan history and space reclamation timeline')">
		<header class="reclamation-toolbar">
			<div class="reclamation-toolbar__title-group">
				<h3 class="reclamation-toolbar__title">
					{{ t('duplicatefinder', 'Space reclamation timeline') }}
				</h3>
				<span
					class="reclamation-toolbar__count-pill"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} events', { count: totalEntryCount }) }}
				</span>
			</div>

			<div class="reclamation-toolbar__actions">
				<div
					class="reclamation-filter-group"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter timeline events')">
					<button
						v-for="option in filterOptions"
						:key="option.id"
						type="button"
						class="reclamation-filter-button"
						:class="{ 'is-active': activeFilter === option.id }"
						:aria-pressed="activeFilter === option.id ? 'true' : 'false'"
						@click="activeFilter = option.id">
						{{ option.label }}
					</button>
				</div>

				<button
					type="button"
					class="reclamation-toolbar__button reclamation-export-button"
					:disabled="totalEntryCount === 0 && summary.remainingReclaimableBytes === 0"
					@click="exportHistory">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>

				<template v-if="totalEntryCount > 0">
					<button
						v-if="!confirmingClear"
						type="button"
						class="reclamation-toolbar__button reclamation-clear-button"
						@click="confirmingClear = true">
						<span>{{ t('duplicatefinder', 'Clear history') }}</span>
					</button>
					<div
						v-else
						class="reclamation-clear-confirm"
						role="group"
						:aria-label="t('duplicatefinder', 'Confirm clearing history')">
						<button
							type="button"
							class="reclamation-toolbar__button reclamation-clear-confirm__yes"
							@click="confirmClearHistory">
							<span>{{ t('duplicatefinder', 'Confirm clear') }}</span>
						</button>
						<button
							type="button"
							class="reclamation-toolbar__button reclamation-clear-confirm__cancel"
							@click="confirmingClear = false">
							<span>{{ t('duplicatefinder', 'Cancel') }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="reclamation-toolbar__button reclamation-close-button"
					aria-keyshortcuts="h"
					:title="t('duplicatefinder', 'Hide history')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide history') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="exportMessage"
			class="reclamation-export-status"
			:class="{ 'is-error': exportStatus === 'error' }"
			role="status"
			aria-live="polite">
			{{ exportMessage }}
		</div>

		<dl class="reclamation-kpi-grid">
			<div class="reclamation-kpi-card is-reclaimed">
				<dt class="reclamation-kpi-card__label">
					{{ t('duplicatefinder', 'Space reclaimed') }}
				</dt>
				<dd class="reclamation-kpi-card__value">
					{{ summary.totalReclaimedFormatted }}
				</dd>
				<dd class="reclamation-kpi-card__meta">
					{{ t('duplicatefinder', '{files} files cleaned, {groups} groups resolved', {
						files: summary.totalFilesDeleted,
						groups: summary.totalGroupsResolved,
					}) }}
				</dd>
			</div>

			<div class="reclamation-kpi-card is-remaining">
				<dt class="reclamation-kpi-card__label">
					{{ t('duplicatefinder', 'Remaining waste') }}
				</dt>
				<dd class="reclamation-kpi-card__value">
					{{ summary.remainingReclaimableFormatted }}
				</dd>
				<dd class="reclamation-kpi-card__meta">
					{{ t('duplicatefinder', '{groups} groups ({copies} redundant)', {
						groups: backlogGroupCount,
						copies: backlogRedundantCopies,
					}) }}
				</dd>
			</div>

			<div class="reclamation-kpi-card is-progress">
				<dt class="reclamation-kpi-card__label">
					{{ t('duplicatefinder', 'Cleanup ratio') }}
				</dt>
				<dd class="reclamation-kpi-card__value">
					{{ summary.reclaimedPercent }}%
				</dd>
				<dd class="reclamation-kpi-card__meta">
					{{ t('duplicatefinder', 'of {total} tracked waste', {
						total: summary.totalTrackedFormatted,
					}) }}
				</dd>
			</div>

			<div
				class="reclamation-kpi-card is-delta"
				:class="'is-direction-' + summary.lastScanDeltaDirection">
				<dt class="reclamation-kpi-card__label">
					{{ t('duplicatefinder', 'Last scan delta') }}
				</dt>
				<dd class="reclamation-kpi-card__value">
					{{ lastScanDeltaLabel }}
				</dd>
				<dd class="reclamation-kpi-card__meta">
					{{ t('duplicatefinder', '{scans} scan snapshots logged', {
						scans: summary.scanCount,
					}) }}
				</dd>
			</div>
		</dl>

		<div class="reclamation-analytics-grid">
			<div class="reclamation-meter-card">
				<div class="reclamation-meter-card__header">
					<span class="reclamation-meter-card__title">
						{{ t('duplicatefinder', 'Reclaimed vs remaining duplicate waste') }}
					</span>
					<span class="reclamation-meter-card__figures">
						{{ summary.totalReclaimedFormatted }} / {{ summary.totalTrackedFormatted }}
					</span>
				</div>
				<div
					class="reclamation-meter-track"
					role="progressbar"
					:aria-label="t('duplicatefinder', 'Space reclamation progress')"
					:aria-valuenow="summary.reclaimedPercent"
					aria-valuemin="0"
					aria-valuemax="100">
					<div
						class="reclamation-meter-fill"
						:style="{ width: summary.reclaimedPercent + '%' }" />
				</div>
				<div class="reclamation-meter-legend">
					<span class="reclamation-meter-legend__item is-reclaimed">
						{{ t('duplicatefinder', 'Reclaimed: {size} ({pct}%)', {
							size: summary.totalReclaimedFormatted,
							pct: summary.reclaimedPercent,
						}) }}
					</span>
					<span class="reclamation-meter-legend__item is-remaining">
						{{ t('duplicatefinder', 'Remaining: {size}', {
							size: summary.remainingReclaimableFormatted,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="categoryBreakdown.length > 0"
				class="reclamation-categories-card">
				<div class="reclamation-categories-card__header">
					<span class="reclamation-categories-card__title">
						{{ t('duplicatefinder', 'Remaining waste by category') }}
					</span>
				</div>
				<ul class="reclamation-category-bars">
					<li
						v-for="item in categoryBreakdown"
						:key="item.category"
						class="reclamation-category-bar">
						<div class="reclamation-category-bar__top">
							<span class="reclamation-category-bar__label">
								{{ formatCategoryLabel(item.category) }}
							</span>
							<span class="reclamation-category-bar__stats">
								{{ item.reclaimableFormatted }} ({{ item.sharePct }}%)
							</span>
						</div>
						<div
							class="reclamation-category-bar__track"
							aria-hidden="true">
							<div
								class="reclamation-category-bar__fill"
								:class="'is-category-' + item.category"
								:style="{ width: item.sharePct + '%' }" />
						</div>
					</li>
				</ul>
			</div>
		</div>

		<div class="reclamation-timeline-card">
			<div
				v-if="totalEntryCount === 0"
				class="reclamation-empty-state"
				role="status"
				aria-live="polite">
				<p class="reclamation-empty-state__message">
					{{ t('duplicatefinder', 'No scan or cleanup history recorded yet. Run a scan or delete duplicate copies to build your space reclamation timeline.') }}
				</p>
			</div>

			<div
				v-else-if="visibleEntries.length === 0"
				class="reclamation-empty-state"
				role="status"
				aria-live="polite">
				<p class="reclamation-empty-state__message">
					{{ t('duplicatefinder', 'No timeline events match the current filter.') }}
				</p>
				<button
					type="button"
					class="reclamation-empty-state__reset"
					@click="activeFilter = 'all'">
					{{ t('duplicatefinder', 'Show all events') }}
				</button>
			</div>

			<ol
				v-else
				class="reclamation-timeline-list"
				:aria-label="t('duplicatefinder', 'Scan and cleanup history events')">
				<li
					v-for="entry in visibleEntries"
					:key="entry.id"
					class="reclamation-timeline-item"
					:class="'is-' + entry.kind">
					<div class="reclamation-timeline-item__badges">
						<span
							class="reclamation-entry-kind-badge"
							:class="'is-' + entry.kind">
							{{ entry.kind === 'cleanup'
								? t('duplicatefinder', 'Cleanup')
								: t('duplicatefinder', 'Scan') }}
						</span>
						<span class="reclamation-entry-source-badge">
							{{ formatEntrySource(entry) }}
						</span>
					</div>

					<div class="reclamation-timeline-item__body">
						<div class="reclamation-timeline-item__headline">
							<template v-if="entry.kind === 'cleanup'">
								<strong class="reclamation-timeline-item__primary">
									{{ t('duplicatefinder', '+{size} reclaimed', {
										size: formatEntryBytes(entry.bytesReclaimed),
									}) }}
								</strong>
								<span class="reclamation-timeline-item__secondary">
									{{ t('duplicatefinder', '{files} file(s) removed', {
										files: entry.filesDeleted,
									}) }}
								</span>
								<span
									v-if="entry.groupsResolved > 0"
									class="reclamation-timeline-item__secondary">
									{{ t('duplicatefinder', '{groups} group(s) resolved', {
										groups: entry.groupsResolved,
									}) }}
								</span>
							</template>
							<template v-else>
								<strong class="reclamation-timeline-item__primary">
									{{ t('duplicatefinder', '{groups} groups, {size} reclaimable', {
										groups: entry.groupCount,
										size: formatEntryBytes(entry.reclaimableBytes),
									}) }}
								</strong>
								<span
									v-if="entry.deltaBytes !== null"
									class="reclamation-delta-pill"
									:class="getDeltaPillClass(entry.deltaBytes)">
									{{ formatSignedDelta(entry.deltaBytes) }}
								</span>
								<span
									v-if="entry.scannedFiles > 0"
									class="reclamation-timeline-item__secondary">
									{{ t('duplicatefinder', '{count} files scanned', {
										count: entry.scannedFiles,
									}) }}
								</span>
							</template>
						</div>

						<p
							v-if="entry.sampleLabel"
							class="reclamation-timeline-item__sample"
							:title="entry.sampleLabel">
							{{ entry.sampleLabel }}
						</p>
					</div>

					<time
						class="reclamation-timeline-item__time"
						:datetime="formatIsoDate(entry.timestamp)"
						:title="formatIsoDate(entry.timestamp)">
						{{ formatDisplayTimestamp(entry.timestamp) }}
					</time>
				</li>
			</ol>
		</div>
	</section>
</template>

<script>
import { formatBytes } from '../tools/duplicateStats'
import {
	computeReclamationSummary,
	downloadReclamationHistoryJson,
	filterHistoryEntries,
	formatSignedBytesDelta,
} from '../tools/reclamationHistory'

export default {
	name: 'SpaceReclamationTimeline',
	props: {
		historyState: {
			type: Object,
			required: true,
		},
		currentBacklog: {
			type: Object,
			required: true,
		},
	},
	data() {
		return {
			activeFilter: 'all',
			confirmingClear: false,
			exportStatus: 'idle',
			exportMessage: '',
			exportTimer: null,
		}
	},
	computed: {
		filterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'cleanup', label: this.t('duplicatefinder', 'Cleanups') },
				{ id: 'scan', label: this.t('duplicatefinder', 'Scans') },
			]
		},
		entries() {
			return this.historyState && Array.isArray(this.historyState.entries)
				? this.historyState.entries
				: []
		},
		totalEntryCount() {
			return this.entries.length
		},
		visibleEntries() {
			return filterHistoryEntries(this.entries, this.activeFilter)
		},
		summary() {
			return computeReclamationSummary(this.historyState, this.currentBacklog)
		},
		backlogGroupCount() {
			return this.currentBacklog && Number.isFinite(Number(this.currentBacklog.groupCount))
				? Number(this.currentBacklog.groupCount)
				: 0
		},
		backlogRedundantCopies() {
			return this.currentBacklog && Number.isFinite(Number(this.currentBacklog.redundantCopies))
				? Number(this.currentBacklog.redundantCopies)
				: 0
		},
		categoryBreakdown() {
			return this.currentBacklog && Array.isArray(this.currentBacklog.categoryBreakdown)
				? this.currentBacklog.categoryBreakdown
				: []
		},
		lastScanDeltaLabel() {
			if (this.summary.lastScanDeltaBytes === null) {
				return this.summary.scanCount > 0
					? this.t('duplicatefinder', 'Baseline')
					: this.t('duplicatefinder', 'No scan yet')
			}
			return this.summary.lastScanDeltaFormatted || '0 B'
		},
	},
	beforeDestroy() {
		if (this.exportTimer) {
			clearTimeout(this.exportTimer)
			this.exportTimer = null
		}
	},
	methods: {
		formatEntryBytes(bytes) {
			return formatBytes(bytes)
		},
		formatSignedDelta(deltaBytes) {
			return formatSignedBytesDelta(deltaBytes)
		},
		getDeltaPillClass(deltaBytes) {
			if (deltaBytes < 0) {
				return 'is-improved'
			}
			if (deltaBytes > 0) {
				return 'is-increased'
			}
			return 'is-unchanged'
		},
		formatCategoryLabel(category) {
			const labels = {
				images: this.t('duplicatefinder', 'Images'),
				videos: this.t('duplicatefinder', 'Videos'),
				audio: this.t('duplicatefinder', 'Audio'),
				documents: this.t('duplicatefinder', 'Documents'),
				archives: this.t('duplicatefinder', 'Archives'),
				other: this.t('duplicatefinder', 'Other'),
			}
			return labels[category] || category
		},
		formatEntrySource(entry) {
			if (!entry) {
				return ''
			}
			if (entry.kind === 'cleanup') {
				const sourceLabels = {
					single: this.t('duplicatefinder', 'Single copy'),
					group: this.t('duplicatefinder', 'Group cleanup'),
					bulk: this.t('duplicatefinder', 'Bulk delete'),
					folder: this.t('duplicatefinder', 'Folder cleanup'),
				}
				return sourceLabels[entry.source] || this.t('duplicatefinder', 'Cleanup')
			}
			const triggerLabels = {
				manual: this.t('duplicatefinder', 'Manual scan'),
				sync: this.t('duplicatefinder', 'Scan sync'),
				baseline: this.t('duplicatefinder', 'Session baseline'),
			}
			return triggerLabels[entry.trigger] || this.t('duplicatefinder', 'Scan')
		},
		formatIsoDate(timestamp) {
			const ms = Number(timestamp)
			if (!Number.isFinite(ms) || ms <= 0) {
				return ''
			}
			try {
				return new Date(ms).toISOString()
			} catch (error) {
				return ''
			}
		},
		formatDisplayTimestamp(timestamp) {
			const ms = Number(timestamp)
			if (!Number.isFinite(ms) || ms <= 0) {
				return ''
			}
			try {
				const date = new Date(ms)
				if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
					return new Intl.DateTimeFormat(undefined, {
						month: 'short',
						day: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
					}).format(date)
				}
				return date.toISOString().slice(0, 16).replace('T', ' ')
			} catch (error) {
				return ''
			}
		},
		confirmClearHistory() {
			this.confirmingClear = false
			this.$emit('clear-history')
		},
		exportHistory() {
			if (this.exportTimer) {
				clearTimeout(this.exportTimer)
				this.exportTimer = null
			}
			const ok = downloadReclamationHistoryJson(this.historyState, this.currentBacklog)
			if (ok) {
				this.exportStatus = 'exported'
				this.exportMessage = this.t('duplicatefinder', 'Timeline exported as JSON')
			} else {
				this.exportStatus = 'error'
				this.exportMessage = this.t('duplicatefinder', 'Could not export timeline')
			}
			this.exportTimer = setTimeout(() => {
				this.exportStatus = 'idle'
				this.exportMessage = ''
				this.exportTimer = null
			}, 2500)
			return ok
		},
	},
}
</script>

<style scoped>
.reclamation-workspace {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin: 16px 20px 0;
	padding: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	box-sizing: border-box;
	min-width: 0;
}

.reclamation-toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
}

.reclamation-toolbar__title-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-width: 0;
}

.reclamation-toolbar__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.reclamation-toolbar__count-pill {
	display: inline-flex;
	align-items: center;
	padding: 3px 9px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
	font-size: 0.78rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.reclamation-toolbar__actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.reclamation-filter-group {
	display: inline-flex;
	align-items: center;
	padding: 2px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
}

.reclamation-filter-button {
	min-height: 30px;
	padding: 4px 10px;
	border: 1px solid transparent;
	border-radius: var(--border-radius, 6px);
	background: transparent;
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.reclamation-filter-button.is-active {
	background-color: var(--color-main-background);
	border-color: var(--color-border);
	color: var(--color-main-text);
}

.reclamation-toolbar__button,
.reclamation-empty-state__reset {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-height: 34px;
	padding: 6px 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.reclamation-clear-confirm {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.reclamation-clear-confirm__yes {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
}

.reclamation-toolbar__button:hover:not(:disabled),
.reclamation-toolbar__button:focus-visible:not(:disabled),
.reclamation-filter-button:hover:not(:disabled),
.reclamation-filter-button:focus-visible:not(:disabled),
.reclamation-empty-state__reset:hover:not(:disabled),
.reclamation-empty-state__reset:focus-visible:not(:disabled) {
	border-color: var(--color-primary-element, #0082c9);
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 1px;
}

.reclamation-toolbar__button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.reclamation-export-status {
	padding: 6px 10px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
}

.reclamation-export-status.is-error {
	color: #c62828;
}

.reclamation-kpi-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 10px;
	margin: 0;
}

.reclamation-kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	box-sizing: border-box;
}

.reclamation-kpi-card__label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.reclamation-kpi-card__value {
	margin: 0;
	font-size: 1.25rem;
	font-weight: 700;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.reclamation-kpi-card.is-reclaimed .reclamation-kpi-card__value,
.reclamation-kpi-card.is-direction-improved .reclamation-kpi-card__value {
	color: #1b7f42;
}

.reclamation-kpi-card.is-direction-increased .reclamation-kpi-card__value {
	color: #b45309;
}

.reclamation-kpi-card__meta {
	margin: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.reclamation-analytics-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 12px;
}

.reclamation-meter-card,
.reclamation-categories-card,
.reclamation-timeline-card {
	min-width: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.reclamation-meter-card__header,
.reclamation-categories-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-bottom: 10px;
}

.reclamation-meter-card__title,
.reclamation-categories-card__title {
	font-size: 0.86rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.reclamation-meter-card__figures {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.reclamation-meter-track {
	width: 100%;
	height: 10px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.reclamation-meter-fill {
	height: 100%;
	border-radius: 999px;
	background-color: #1b7f42;
	transition: width 0.2s ease;
}

.reclamation-meter-legend {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.reclamation-meter-legend__item.is-reclaimed {
	color: #1b7f42;
	font-weight: 600;
}

.reclamation-category-bars {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.reclamation-category-bar__top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
	margin-bottom: 3px;
}

.reclamation-category-bar__label {
	font-weight: 600;
	color: var(--color-main-text);
}

.reclamation-category-bar__stats {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.reclamation-category-bar__track {
	width: 100%;
	height: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.reclamation-category-bar__fill {
	height: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
}

.reclamation-category-bar__fill.is-category-videos {
	background-color: #6d28d9;
}

.reclamation-category-bar__fill.is-category-audio {
	background-color: #0e7490;
}

.reclamation-category-bar__fill.is-category-documents {
	background-color: #1d4ed8;
}

.reclamation-category-bar__fill.is-category-archives {
	background-color: #b45309;
}

.reclamation-category-bar__fill.is-category-other {
	background-color: #4b5563;
}

.reclamation-empty-state {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 10px;
	padding: 8px 4px;
}

.reclamation-empty-state__message {
	margin: 0;
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
}

.reclamation-timeline-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
	max-height: 280px;
	overflow-y: auto;
}

.reclamation-timeline-item {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 12px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-inline-start-width: 3px;
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	box-sizing: border-box;
}

.reclamation-timeline-item.is-cleanup {
	border-inline-start-color: #1b7f42;
}

.reclamation-timeline-item.is-scan {
	border-inline-start-color: var(--color-primary-element, #0082c9);
}

.reclamation-timeline-item__badges {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.reclamation-entry-kind-badge,
.reclamation-entry-source-badge,
.reclamation-delta-pill {
	display: inline-flex;
	align-items: center;
	padding: 2px 8px;
	border-radius: 999px;
	font-size: 0.75rem;
	font-weight: 700;
	white-space: nowrap;
}

.reclamation-entry-kind-badge.is-cleanup {
	background-color: rgba(27, 127, 66, 0.14);
	color: #1b7f42;
}

.reclamation-entry-kind-badge.is-scan {
	background-color: rgba(0, 130, 201, 0.14);
	color: var(--color-primary-element, #0082c9);
}

.reclamation-entry-source-badge {
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.reclamation-delta-pill.is-improved {
	background-color: rgba(27, 127, 66, 0.14);
	color: #1b7f42;
}

.reclamation-delta-pill.is-increased {
	background-color: rgba(180, 83, 9, 0.14);
	color: #b45309;
}

.reclamation-delta-pill.is-unchanged {
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
}

.reclamation-timeline-item__body {
	min-width: 0;
}

.reclamation-timeline-item__headline {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.reclamation-timeline-item__primary {
	font-size: 0.9rem;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
}

.reclamation-timeline-item__secondary {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.reclamation-timeline-item__sample {
	margin: 2px 0 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.reclamation-timeline-item__time {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

@media (max-width: 768px) {
	.reclamation-workspace {
		margin: 12px 12px 0;
		padding: 12px;
	}

	.reclamation-filter-button,
	.reclamation-toolbar__button,
	.reclamation-empty-state__reset {
		min-height: 44px;
	}

	.reclamation-timeline-item {
		grid-template-columns: minmax(0, 1fr);
		gap: 6px;
	}
}

@media (max-width: 420px) {
	.reclamation-kpi-grid,
	.reclamation-analytics-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
