<template>
	<section
		class="footprint-analyzer"
		role="region"
		:aria-label="t('duplicatefinder', 'Storage Footprint and Extension Analyzer')">
		<header class="footprint-analyzer__toolbar">
			<div class="footprint-analyzer__title-group">
				<h3 class="footprint-analyzer__title">
					{{ t('duplicatefinder', 'Storage Footprint & Extension Analyzer') }}
				</h3>
				<span
					class="footprint-analyzer__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{extensions} extensions, {size} reclaimable', {
						extensions: report.summary.uniqueExtensionsCount,
						size: report.summary.reclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="footprint-analyzer__toolbar-actions">
				<button
					type="button"
					class="footprint-analyzer__tool-btn"
					:disabled="report.extensions.length === 0"
					@click="exportCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="footprint-analyzer__tool-btn"
					:disabled="report.extensions.length === 0"
					@click="exportJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="footprint-analyzer__tool-btn is-close"
					aria-keyshortcuts="z"
					:title="t('duplicatefinder', 'Hide storage footprint analyzer')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide footprint') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="footprint-analyzer__empty">
			<p class="footprint-analyzer__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="footprint-analyzer__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect duplicate footprint by file extension, media type, and size tier.') }}
			</p>
			<button
				type="button"
				class="footprint-analyzer__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="footprint-analyzer__controls">
				<div class="footprint-analyzer__control-row">
					<span class="footprint-analyzer__control-label">
						{{ t('duplicatefinder', 'Analyzer scope') }}
					</span>
					<div
						class="footprint-analyzer__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Footprint analyzer scope')">
						<button
							type="button"
							class="footprint-analyzer__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="footprint-analyzer__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="footprint-analyzer__select-field">
						<span class="footprint-analyzer__control-label">{{ t('duplicatefinder', 'Sort extensions') }}</span>
						<select
							v-model="sortBy"
							class="footprint-analyzer__select"
							:aria-label="t('duplicatefinder', 'Sort extensions')">
							<option value="reclaimable_desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="total_desc">
								{{ t('duplicatefinder', 'Largest total footprint') }}
							</option>
							<option value="groups_desc">
								{{ t('duplicatefinder', 'Most duplicate groups') }}
							</option>
							<option value="files_desc">
								{{ t('duplicatefinder', 'Most file copies') }}
							</option>
							<option value="ext_asc">
								{{ t('duplicatefinder', 'Extension A-Z') }}
							</option>
						</select>
					</label>
				</div>

				<div class="footprint-analyzer__filter-bar">
					<div class="footprint-analyzer__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="footprint-analyzer__search-input"
							:placeholder="t('duplicatefinder', 'Filter extensions or filenames (e.g. .mp4, backup)...')"
							:aria-label="t('duplicatefinder', 'Filter extensions or filenames')"
							@keydown.esc="searchQuery = ''">
					</div>

					<div class="footprint-analyzer__filter-toggles">
						<button
							type="button"
							class="footprint-analyzer__toggle-chip"
							:class="{ 'is-active': includeAcknowledged }"
							:aria-pressed="includeAcknowledged ? 'true' : 'false'"
							@click="includeAcknowledged = !includeAcknowledged">
							<span>{{ t('duplicatefinder', 'Include acknowledged') }}</span>
						</button>
						<button
							v-if="hasLocalFilters"
							type="button"
							class="footprint-analyzer__toggle-chip"
							@click="resetLocalFilters">
							<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
						</button>
						<button
							v-if="syncedExtensionFilter"
							type="button"
							class="footprint-analyzer__toggle-chip is-active"
							:aria-pressed="'true'"
							@click="$emit('sync-extension-filter', '')">
							<span>{{ t('duplicatefinder', 'Clear sidebar: {ext}', { ext: syncedExtensionFilter }) }}</span>
						</button>
					</div>
				</div>

				<div class="footprint-analyzer__kpis">
					<div class="footprint-analyzer__kpi is-highlight">
						<span class="footprint-analyzer__kpi-label">{{ t('duplicatefinder', 'Reclaimable waste') }}</span>
						<strong class="footprint-analyzer__kpi-value">{{ report.summary.reclaimableFormatted }}</strong>
						<span class="footprint-analyzer__kpi-meta">
							{{ t('duplicatefinder', '{pct}% of total duplicate footprint', { pct: report.summary.wastedRatioPct }) }}
						</span>
					</div>
					<div class="footprint-analyzer__kpi">
						<span class="footprint-analyzer__kpi-label">{{ t('duplicatefinder', 'Total duplicate footprint') }}</span>
						<strong class="footprint-analyzer__kpi-value">{{ report.summary.totalFootprintFormatted }}</strong>
						<span class="footprint-analyzer__kpi-meta">
							{{ t('duplicatefinder', '{files} copies across {groups} groups', {
								files: report.summary.totalFiles,
								groups: report.summary.totalGroups,
							}) }}
						</span>
					</div>
					<div class="footprint-analyzer__kpi">
						<span class="footprint-analyzer__kpi-label">{{ t('duplicatefinder', 'Redundant copies') }}</span>
						<strong class="footprint-analyzer__kpi-value">{{ report.summary.redundantFiles }}</strong>
						<span class="footprint-analyzer__kpi-meta">
							{{ t('duplicatefinder', '{protected} protected origin copies', { protected: report.summary.protectedFiles }) }}
						</span>
					</div>
					<div class="footprint-analyzer__kpi">
						<span class="footprint-analyzer__kpi-label">{{ t('duplicatefinder', 'Top space offender') }}</span>
						<strong class="footprint-analyzer__kpi-value">
							{{ report.summary.topExtension ? report.summary.topExtension.ext : '-' }}
						</strong>
						<span class="footprint-analyzer__kpi-meta">
							{{ report.summary.topExtension
								? t('duplicatefinder', '{size} ({pct}%)', {
									size: report.summary.topExtension.reclaimableFormatted,
									pct: report.summary.topExtension.sharePct,
								})
								: t('duplicatefinder', 'No matching extensions') }}
						</span>
					</div>
				</div>
			</div>

			<div
				v-if="visibleCategories.length > 0"
				class="footprint-analyzer__section"
				role="region"
				:aria-label="t('duplicatefinder', 'Media type footprint distribution')">
				<div class="footprint-analyzer__section-header">
					<h4 class="footprint-analyzer__section-title">
						{{ t('duplicatefinder', 'Media type breakdown') }}
					</h4>
					<span class="footprint-analyzer__section-hint">
						{{ t('duplicatefinder', 'Select a category to focus extension breakdown') }}
					</span>
				</div>

				<div
					v-if="nonEmptyCategories.length > 0"
					class="footprint-stacked-bar"
					role="group"
					:aria-label="t('duplicatefinder', 'Proportional reclaimable space by media type')">
					<button
						v-for="cat in nonEmptyCategories"
						:key="'bar-' + cat.category"
						type="button"
						class="footprint-stacked-bar__segment"
						:class="[
							'is-cat-' + cat.category,
							{ 'is-selected': categoryFilter === cat.category },
						]"
						:style="{ flexGrow: Math.max(cat.sharePct, 2) }"
						:aria-pressed="categoryFilter === cat.category ? 'true' : 'false'"
						:title="t('duplicatefinder', '{label}: {size} ({pct}%)', {
							label: formatCategoryLabel(cat.category),
							size: cat.reclaimableFormatted,
							pct: cat.sharePct,
						})"
						:aria-label="t('duplicatefinder', '{label}: {size} ({pct}%)', {
							label: formatCategoryLabel(cat.category),
							size: cat.reclaimableFormatted,
							pct: cat.sharePct,
						})"
						@click="toggleCategoryFilter(cat.category)">
						<span v-if="cat.sharePct >= 10" class="footprint-stacked-bar__label">
							{{ formatCategoryLabel(cat.category) }} {{ cat.sharePct }}%
						</span>
					</button>
				</div>

				<div
					class="footprint-category-chips"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter extensions by media category')">
					<button
						type="button"
						class="footprint-category-chip"
						:class="{ 'is-active': categoryFilter === 'all' }"
						:aria-pressed="categoryFilter === 'all' ? 'true' : 'false'"
						@click="categoryFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All types') }}</span>
						<span class="footprint-category-chip__meta">({{ report.scopeSummary.totalGroups }})</span>
					</button>
					<button
						v-for="cat in visibleCategories"
						:key="'chip-' + cat.category"
						type="button"
						class="footprint-category-chip"
						:class="[
							'is-cat-' + cat.category,
							{ 'is-active': categoryFilter === cat.category },
						]"
						:aria-pressed="categoryFilter === cat.category ? 'true' : 'false'"
						@click="toggleCategoryFilter(cat.category)">
						<span class="footprint-category-chip__swatch" :class="'is-cat-' + cat.category" aria-hidden="true" />
						<span>{{ formatCategoryLabel(cat.category) }}</span>
						<span class="footprint-category-chip__meta">
							{{ cat.reclaimableFormatted }} ({{ cat.sharePct }}%)
						</span>
					</button>
				</div>
			</div>

			<div
				v-if="visibleSizeTiers.length > 0"
				class="footprint-analyzer__section"
				role="region"
				:aria-label="t('duplicatefinder', 'File size tier distribution')">
				<div class="footprint-analyzer__section-header">
					<h4 class="footprint-analyzer__section-title">
						{{ t('duplicatefinder', 'File size tiers') }}
					</h4>
					<span class="footprint-analyzer__section-hint">
						{{ t('duplicatefinder', 'Click a tier to isolate small vs massive duplicates') }}
					</span>
				</div>
				<div
					class="footprint-tier-grid"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter by file size tier')">
					<button
						v-for="tier in visibleSizeTiers"
						:key="tier.id"
						type="button"
						class="footprint-tier-card"
						:class="{ 'is-active': sizeTierFilter === tier.id }"
						:aria-pressed="sizeTierFilter === tier.id ? 'true' : 'false'"
						@click="toggleSizeTierFilter(tier.id)">
						<span class="footprint-tier-card__title">{{ formatSizeTierLabel(tier.id) }}</span>
						<strong class="footprint-tier-card__size">{{ tier.reclaimableFormatted }}</strong>
						<span class="footprint-tier-card__meta">
							{{ t('duplicatefinder', '{groups} groups, {pct}%', {
								groups: tier.groupCount,
								pct: tier.sharePct,
							}) }}
						</span>
					</button>
				</div>
			</div>

			<div
				v-if="report.extensions.length === 0"
				class="footprint-analyzer__filtered-empty"
				role="status"
				aria-live="polite">
				<p class="footprint-analyzer__empty-title">
					{{ t('duplicatefinder', 'No extensions match the active filters') }}
				</p>
				<p class="footprint-analyzer__empty-hint">
					{{ t('duplicatefinder', 'Try clearing the search query or selecting All types.') }}
				</p>
				<button
					type="button"
					class="footprint-analyzer__tool-btn"
					@click="resetLocalFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div v-else class="footprint-analyzer__workspace">
				<div class="footprint-ext-list" role="list" :aria-label="t('duplicatefinder', 'Duplicate extensions ranked by storage impact')">
					<div
						v-for="item in report.extensions"
						:key="item.ext"
						class="footprint-ext-row"
						:class="{ 'is-synced': isExtensionSynced(item.ext) }"
						role="listitem">
						<div class="footprint-ext-row__identity">
							<span class="footprint-ext-badge" :class="'is-cat-' + item.category">
								{{ item.ext }}
							</span>
							<div class="footprint-ext-row__details">
								<span class="footprint-ext-row__cat">{{ formatCategoryLabel(item.category) }}</span>
								<span class="footprint-ext-row__folder" :title="item.topFolder">
									{{ t('duplicatefinder', 'Top folder: {folder}', { folder: item.topFolder }) }}
								</span>
							</div>
						</div>

						<div class="footprint-ext-row__bar-col">
							<div class="footprint-ext-row__stats-top">
								<strong class="footprint-ext-row__reclaimable">{{ item.reclaimableFormatted }}</strong>
								<span class="footprint-ext-row__share">{{ item.sharePct }}%</span>
							</div>
							<div class="footprint-ext-bar-track" aria-hidden="true">
								<div
									class="footprint-ext-bar-fill"
									:class="'is-cat-' + item.category"
									:style="{ width: item.maxBarPct + '%' }" />
							</div>
							<div class="footprint-ext-row__stats-sub">
								<span>
									{{ t('duplicatefinder', '{groups} groups', { groups: item.groupCount }) }}
								</span>
								<span>
									{{ t('duplicatefinder', '{redundant} extra / {total} copies', {
										redundant: item.redundantFiles,
										total: item.fileCount,
									}) }}
								</span>
								<span>
									{{ t('duplicatefinder', 'Total: {size}', { size: item.totalFootprintFormatted }) }}
								</span>
								<span v-if="item.protectedFiles > 0" class="footprint-ext-row__protected">
									{{ t('duplicatefinder', '{count} protected', { count: item.protectedFiles }) }}
								</span>
							</div>
						</div>

						<div class="footprint-ext-row__actions">
							<button
								type="button"
								class="footprint-ext-action-btn"
								:class="{ 'is-active': isExtensionSynced(item.ext) }"
								:aria-pressed="isExtensionSynced(item.ext) ? 'true' : 'false'"
								:aria-label="isExtensionSynced(item.ext)
									? t('duplicatefinder', 'Clear sidebar filter for {ext}', { ext: item.ext })
									: t('duplicatefinder', 'Filter sidebar to {ext}', { ext: item.ext })"
								@click="toggleExtensionSidebarSync(item.ext)">
								<span>
									{{ isExtensionSynced(item.ext)
										? t('duplicatefinder', 'Filtered')
										: t('duplicatefinder', 'Filter list') }}
								</span>
							</button>
							<button
								v-if="item.largestGroup && item.largestGroup.duplicate"
								type="button"
								class="footprint-ext-action-btn"
								:aria-label="t('duplicatefinder', 'Inspect largest {ext} group ({name})', {
									ext: item.ext,
									name: item.largestGroup.name,
								})"
								@click="$emit('select-duplicate', item.largestGroup.duplicate)">
								<span>{{ t('duplicatefinder', 'Inspect largest') }}</span>
							</button>
							<button
								v-if="item.largestGroup && item.largestGroup.duplicate"
								type="button"
								class="footprint-ext-action-btn"
								:aria-label="t('duplicatefinder', 'Compare largest {ext} group ({name})', {
									ext: item.ext,
									name: item.largestGroup.name,
								})"
								@click="$emit('compare-duplicate', item.largestGroup.duplicate)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>
				</div>

				<div
					v-if="report.topOffenders.length > 0"
					class="footprint-offenders"
					role="region"
					:aria-label="t('duplicatefinder', 'Largest duplicate groups in current footprint')">
					<h4 class="footprint-analyzer__section-title">
						{{ t('duplicatefinder', 'Top reclaimable groups') }}
					</h4>
					<div class="footprint-offenders__list" role="list">
						<button
							v-for="offender in report.topOffenders"
							:key="'off-' + String(offender.id || offender.hash)"
							type="button"
							role="listitem"
							class="footprint-offender-item"
							:class="{ 'is-current': isCurrentGroup(offender.duplicate) }"
							@click="$emit('select-duplicate', offender.duplicate)">
							<span class="footprint-offender-item__ext" :class="'is-cat-' + offender.category">
								{{ offender.ext }}
							</span>
							<span class="footprint-offender-item__name">{{ offender.name }}</span>
							<span class="footprint-offender-item__copies">
								{{ t('duplicatefinder', '{count} copies', { count: offender.copies }) }}
							</span>
							<strong class="footprint-offender-item__size">
								{{ offender.reclaimableFormatted }}
							</strong>
						</button>
					</div>
				</div>
			</div>

			<p
				v-if="feedbackMessage"
				class="footprint-analyzer__feedback"
				role="status"
				aria-live="polite">
				{{ feedbackMessage }}
			</p>
		</template>
	</section>
</template>

<script>
import {
	buildStorageFootprintReport,
	exportFootprintCsv,
	exportFootprintJson,
} from '../tools/storageFootprintAnalyzer'

export default {
	name: 'StorageFootprintAnalyzer',
	props: {
		duplicates: {
			type: Array,
			default: () => [],
		},
		allDuplicates: {
			type: Array,
			default: () => [],
		},
		currentDuplicateId: {
			type: [Number, String],
			default: null,
		},
		syncedExtensionFilter: {
			type: String,
			default: '',
		},
	},
	data() {
		return {
			scope: 'all',
			includeAcknowledged: true,
			categoryFilter: 'all',
			sizeTierFilter: 'all',
			searchQuery: '',
			sortBy: 'reclaimable_desc',
			feedbackMessage: '',
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		sourcePoolEmpty() {
			return this.allCount === 0 && this.filteredCount === 0
		},
		activeSourcePool() {
			if (this.scope === 'filtered') {
				return Array.isArray(this.duplicates) ? this.duplicates : []
			}
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates
				: (Array.isArray(this.duplicates) ? this.duplicates : [])
		},
		report() {
			return buildStorageFootprintReport(this.activeSourcePool, {
				includeAcknowledged: this.includeAcknowledged,
				categoryFilter: this.categoryFilter,
				sizeTierFilter: this.sizeTierFilter,
				searchQuery: this.searchQuery,
				sortBy: this.sortBy,
			})
		},
		visibleCategories() {
			return this.report.categories.filter(item => item.groupCount > 0)
		},
		nonEmptyCategories() {
			return this.visibleCategories.filter(item => item.reclaimableBytes > 0)
		},
		visibleSizeTiers() {
			return this.report.sizeTiers.filter(item => item.groupCount > 0)
		},
		hasLocalFilters() {
			return this.categoryFilter !== 'all'
				|| this.sizeTierFilter !== 'all'
				|| this.searchQuery.trim() !== ''
				|| !this.includeAcknowledged
		},
	},
	methods: {
		formatCategoryLabel(category) {
			switch (category) {
			case 'images':
				return this.t('duplicatefinder', 'Images')
			case 'videos':
				return this.t('duplicatefinder', 'Videos')
			case 'audio':
				return this.t('duplicatefinder', 'Audio')
			case 'documents':
				return this.t('duplicatefinder', 'Documents')
			case 'archives':
				return this.t('duplicatefinder', 'Archives')
			default:
				return this.t('duplicatefinder', 'Other')
			}
		},
		formatSizeTierLabel(tierId) {
			switch (tierId) {
			case 'tiny':
				return this.t('duplicatefinder', '< 100 KB')
			case 'small':
				return this.t('duplicatefinder', '100 KB - 1 MB')
			case 'medium':
				return this.t('duplicatefinder', '1 MB - 10 MB')
			case 'large':
				return this.t('duplicatefinder', '10 MB - 100 MB')
			case 'huge':
				return this.t('duplicatefinder', '>= 100 MB')
			default:
				return tierId
			}
		},
		toggleCategoryFilter(category) {
			this.categoryFilter = this.categoryFilter === category ? 'all' : category
		},
		toggleSizeTierFilter(tierId) {
			this.sizeTierFilter = this.sizeTierFilter === tierId ? 'all' : tierId
		},
		resetLocalFilters() {
			this.categoryFilter = 'all'
			this.sizeTierFilter = 'all'
			this.searchQuery = ''
			this.includeAcknowledged = true
		},
		isExtensionSynced(ext) {
			if (typeof this.syncedExtensionFilter !== 'string' || !this.syncedExtensionFilter.trim()) {
				return false
			}
			return this.syncedExtensionFilter.trim().toLowerCase() === String(ext || '').trim().toLowerCase()
		},
		toggleExtensionSidebarSync(ext) {
			const nextExt = this.isExtensionSynced(ext) ? '' : ext
			this.$emit('sync-extension-filter', nextExt)
		},
		isCurrentGroup(duplicate) {
			if (!duplicate || this.currentDuplicateId === null || this.currentDuplicateId === undefined) {
				return false
			}
			return duplicate.id === this.currentDuplicateId
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : ''
			if (!url) {
				return false
			}
			const link = document.createElement('a')
			link.href = url
			link.download = filename
			link.style.display = 'none'
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			if (typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(url)
			}
			return true
		},
		exportCsv() {
			if (this.report.extensions.length === 0) {
				return
			}
			const csv = exportFootprintCsv(this.report)
			if (this.triggerDownload(csv, 'storage-footprint-extensions.csv', 'text/csv;charset=utf-8;')) {
				this.feedbackMessage = this.t('duplicatefinder', 'Exported extension footprint CSV.')
			}
		},
		exportJson() {
			if (this.report.extensions.length === 0) {
				return
			}
			const json = exportFootprintJson(this.report)
			if (this.triggerDownload(json, 'storage-footprint-extensions.json', 'application/json;charset=utf-8;')) {
				this.feedbackMessage = this.t('duplicatefinder', 'Exported extension footprint JSON.')
			}
		},
	},
}
</script>

<style scoped>
.footprint-analyzer {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin: 12px 16px 4px;
	padding: 14px 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-width: 0;
}

.footprint-analyzer__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.footprint-analyzer__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.footprint-analyzer__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-analyzer__badge {
	display: inline-flex;
	align-items: center;
	padding: 3px 10px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	border: 1px solid var(--color-border-dark, var(--color-border));
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-weight: 600;
}

.footprint-analyzer__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.footprint-analyzer__tool-btn,
.footprint-analyzer__pill-btn,
.footprint-analyzer__toggle-chip,
.footprint-analyzer__primary-btn,
.footprint-category-chip,
.footprint-tier-card,
.footprint-ext-action-btn,
.footprint-offender-item,
.footprint-stacked-bar__segment {
	font: inherit;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.footprint-analyzer__tool-btn,
.footprint-analyzer__pill-btn,
.footprint-analyzer__toggle-chip,
.footprint-ext-action-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 32px;
	padding: 5px 11px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
}

.footprint-analyzer__tool-btn:hover:not(:disabled),
.footprint-analyzer__pill-btn:hover:not(:disabled),
.footprint-analyzer__toggle-chip:hover:not(:disabled),
.footprint-ext-action-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.footprint-analyzer__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.footprint-analyzer__pill-btn.is-active,
.footprint-analyzer__toggle-chip.is-active,
.footprint-ext-action-btn.is-active,
.footprint-category-chip.is-active,
.footprint-tier-card.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.footprint-analyzer__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 38px;
	padding: 8px 16px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
	font-weight: 600;
	font-size: 0.9rem;
}

.footprint-analyzer__empty,
.footprint-analyzer__filtered-empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding: 18px;
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	border: 1px dashed var(--color-border-dark, var(--color-border));
}

.footprint-analyzer__empty-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-analyzer__empty-hint {
	margin: 0;
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
	max-width: 65ch;
}

.footprint-analyzer__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.footprint-analyzer__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.footprint-analyzer__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.footprint-analyzer__pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.footprint-analyzer__select-field {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	margin-inline-start: auto;
}

.footprint-analyzer__select,
.footprint-analyzer__search-input {
	min-block-size: 34px;
	padding: 6px 10px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font: inherit;
	font-size: 0.86rem;
	box-sizing: border-box;
}

.footprint-analyzer__filter-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.footprint-analyzer__search-wrap {
	flex: 1 1 240px;
	min-width: 0;
}

.footprint-analyzer__search-input {
	width: 100%;
}

.footprint-analyzer__filter-toggles {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.footprint-analyzer__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.footprint-analyzer__kpi {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding: 10px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	min-width: 0;
}

.footprint-analyzer__kpi.is-highlight {
	border-inline-start: 3px solid var(--color-primary-element, #0082c9);
}

.footprint-analyzer__kpi-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.footprint-analyzer__kpi-value {
	font-size: 1.08rem;
	font-weight: 700;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.footprint-analyzer__kpi-meta {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.footprint-analyzer__section {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.footprint-analyzer__section-header {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
}

.footprint-analyzer__section-title {
	margin: 0;
	font-size: 0.9rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-analyzer__section-hint {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.footprint-stacked-bar {
	display: flex;
	width: 100%;
	min-block-size: 28px;
	border-radius: var(--border-radius-large, 8px);
	overflow: hidden;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-dark);
}

.footprint-stacked-bar__segment {
	display: flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 8px;
	min-block-size: 28px;
	padding: 0 6px;
	border: none;
	border-inline-end: 1px solid var(--color-main-background);
	color: #ffffff;
	font-size: 0.74rem;
	font-weight: 700;
	white-space: nowrap;
	overflow: hidden;
}

.footprint-stacked-bar__segment:last-child {
	border-inline-end: none;
}

.footprint-stacked-bar__segment.is-selected {
	box-shadow: inset 0 0 0 2px #ffffff;
}

.footprint-stacked-bar__label {
	overflow: hidden;
	text-overflow: ellipsis;
}

.is-cat-images {
	background-color: #1b6ca8;
	color: #ffffff;
}

.is-cat-videos {
	background-color: #8e3b46;
	color: #ffffff;
}

.is-cat-audio {
	background-color: #2f7d5b;
	color: #ffffff;
}

.is-cat-documents {
	background-color: #9a5b13;
	color: #ffffff;
}

.is-cat-archives {
	background-color: #5a4b81;
	color: #ffffff;
}

.is-cat-other {
	background-color: #54606d;
	color: #ffffff;
}

.footprint-category-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.footprint-category-chip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-block-size: 30px;
	padding: 4px 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
}

.footprint-category-chip.is-cat-images,
.footprint-category-chip.is-cat-videos,
.footprint-category-chip.is-cat-audio,
.footprint-category-chip.is-cat-documents,
.footprint-category-chip.is-cat-archives,
.footprint-category-chip.is-cat-other {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.footprint-category-chip.is-active {
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.footprint-category-chip__swatch {
	width: 10px;
	height: 10px;
	border-radius: 3px;
	flex-shrink: 0;
}

.footprint-category-chip__meta {
	color: var(--color-text-maxcontrast);
	font-weight: 500;
}

.footprint-tier-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
	gap: 8px;
}

.footprint-tier-card {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	padding: 8px 10px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	text-align: start;
	min-width: 0;
}

.footprint-tier-card__title {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.footprint-tier-card__size {
	font-size: 0.96rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-tier-card__meta {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.footprint-analyzer__workspace {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
}

.footprint-ext-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 360px;
	overflow-y: auto;
	min-width: 0;
}

.footprint-ext-row {
	display: grid;
	grid-template-columns: minmax(140px, 1.1fr) minmax(220px, 2fr) auto;
	align-items: center;
	gap: 12px;
	padding: 10px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	min-width: 0;
}

.footprint-ext-row.is-synced {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.footprint-ext-row__identity {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.footprint-ext-badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 54px;
	padding: 4px 8px;
	border-radius: 6px;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.8rem;
	font-weight: 700;
	flex-shrink: 0;
}

.footprint-ext-row__details {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.footprint-ext-row__cat {
	font-size: 0.84rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-ext-row__folder {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.footprint-ext-row__bar-col {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
}

.footprint-ext-row__stats-top {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
}

.footprint-ext-row__reclaimable {
	font-size: 0.92rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.footprint-ext-row__share {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.footprint-ext-bar-track {
	width: 100%;
	height: 8px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.footprint-ext-bar-fill {
	height: 100%;
	border-radius: 999px;
}

.footprint-ext-row__stats-sub {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.footprint-ext-row__protected {
	color: var(--color-primary-element, #0082c9);
	font-weight: 600;
}

.footprint-ext-row__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.footprint-offenders {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.footprint-offenders__list {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 8px;
}

.footprint-offender-item {
	display: flex;
	align-items: center;
	gap: 8px;
	min-block-size: 38px;
	padding: 7px 10px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	text-align: start;
	min-width: 0;
}

.footprint-offender-item:hover {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.footprint-offender-item.is-current {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
}

.footprint-offender-item__ext {
	padding: 2px 6px;
	border-radius: 4px;
	font-size: 0.74rem;
	font-weight: 700;
	flex-shrink: 0;
}

.footprint-offender-item__name {
	flex: 1 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.83rem;
	font-weight: 600;
}

.footprint-offender-item__copies {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
}

.footprint-offender-item__size {
	font-size: 0.83rem;
	font-weight: 700;
	white-space: nowrap;
}

.footprint-analyzer__feedback {
	margin: 0;
	padding: 8px 12px;
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-primary-element-light);
	border: 1px solid var(--color-primary-element, #0082c9);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
}

.footprint-analyzer__tool-btn:focus-visible,
.footprint-analyzer__pill-btn:focus-visible,
.footprint-analyzer__toggle-chip:focus-visible,
.footprint-analyzer__primary-btn:focus-visible,
.footprint-analyzer__select:focus-visible,
.footprint-analyzer__search-input:focus-visible,
.footprint-category-chip:focus-visible,
.footprint-tier-card:focus-visible,
.footprint-ext-action-btn:focus-visible,
.footprint-offender-item:focus-visible,
.footprint-stacked-bar__segment:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

@media (max-width: 960px) {
	.footprint-analyzer__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.footprint-ext-row {
		grid-template-columns: minmax(0, 1fr);
		gap: 8px;
	}
}

@media (max-width: 768px) {
	.footprint-analyzer {
		margin: 8px 10px 4px;
		padding: 12px;
	}

	.footprint-analyzer__select-field {
		margin-inline-start: 0;
		width: 100%;
		justify-content: space-between;
	}

	.footprint-analyzer__kpis {
		grid-template-columns: minmax(0, 1fr);
	}

	.footprint-analyzer__tool-btn,
	.footprint-analyzer__pill-btn,
	.footprint-analyzer__toggle-chip,
	.footprint-analyzer__primary-btn,
	.footprint-analyzer__select,
	.footprint-analyzer__search-input,
	.footprint-category-chip,
	.footprint-tier-card,
	.footprint-ext-action-btn,
	.footprint-offender-item,
	.footprint-stacked-bar__segment {
		min-block-size: 44px;
	}
}
</style>
