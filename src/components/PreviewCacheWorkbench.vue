<template>
	<section
		class="preview-cache-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Orphaned Nextcloud Preview & Cache Reclaim Analyzer')">
		<header class="pcw__toolbar">
			<div class="pcw__title-group">
				<h3 class="pcw__title">
					{{ t('duplicatefinder', 'Orphaned Nextcloud Preview & Cache Reclaim Analyzer') }}
				</h3>
				<span
					class="pcw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{artifacts} cache artifacts across {groups} groups ({reclaim} safe reclaim, {orphans} orphaned)', {
						artifacts: report.summary.totalCacheArtifactsCount,
						groups: report.summary.matchedGroupsCount,
						reclaim: report.summary.reclaimableBytesFormatted,
						orphans: report.summary.orphanedPreviewCount,
					}) }}
				</span>
			</div>

			<div class="pcw__toolbar-actions">
				<button
					type="button"
					class="pcw__tool-btn"
					:disabled="activeReclaimPlan.safeCount === 0 || isDeleting"
					@click="exportCleanupScript">
					<span>{{ t('duplicatefinder', 'Export OCC / Shell Script') }}</span>
				</button>
				<button
					type="button"
					class="pcw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="pcw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportCsvReport">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="pcw__tool-btn is-close"
					aria-keyshortcuts="["
					:title="t('duplicatefinder', 'Hide orphaned Nextcloud preview and cache analyzer')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide cache analyzer') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="pcw__empty">
			<p class="pcw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="pcw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect Nextcloud preview pyramids (appdata_*/preview), OS thumbnail caches, trashbin/version copies, and orphaned preview artifacts.') }}
			</p>
			<button
				type="button"
				class="pcw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="pcw__controls">
				<div class="pcw__control-row">
					<span class="pcw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="pcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Preview cache analysis scope')">
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="pcw__control-label">{{ t('duplicatefinder', 'Category') }}</span>
					<div
						class="pcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by cache artifact category')">
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': categoryFilter === 'all' }"
							:aria-pressed="categoryFilter === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = 'all'">
							<span>{{ t('duplicatefinder', 'All') }}</span>
						</button>
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': categoryFilter === 'nextcloud_preview' }"
							:aria-pressed="categoryFilter === 'nextcloud_preview' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = 'nextcloud_preview'">
							<span>{{ t('duplicatefinder', 'NC Previews') }}</span>
						</button>
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': categoryFilter === 'os_thumbnail' }"
							:aria-pressed="categoryFilter === 'os_thumbnail' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = 'os_thumbnail'">
							<span>{{ t('duplicatefinder', 'OS Thumbnails') }}</span>
						</button>
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': categoryFilter === 'nextcloud_versions_trash' }"
							:aria-pressed="categoryFilter === 'nextcloud_versions_trash' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = 'nextcloud_versions_trash'">
							<span>{{ t('duplicatefinder', 'Versions & Trash') }}</span>
						</button>
						<button
							type="button"
							class="pcw__seg-btn"
							:class="{ 'is-active': categoryFilter === 'sync_temp_cache' }"
							:aria-pressed="categoryFilter === 'sync_temp_cache' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = 'sync_temp_cache'">
							<span>{{ t('duplicatefinder', 'Sync & Temp') }}</span>
						</button>
					</div>
				</div>

				<div class="pcw__control-row">
					<button
						type="button"
						class="pcw__seg-btn"
						:class="{ 'is-active': orphanOnly }"
						:aria-pressed="orphanOnly ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="orphanOnly = !orphanOnly">
						<span>{{ t('duplicatefinder', 'Orphaned previews only') }}</span>
					</button>

					<label class="pcw__field">
						<span class="pcw__control-label">{{ t('duplicatefinder', 'Min preview px') }}</span>
						<select
							v-model.number="minPreviewDimension"
							class="pcw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Minimum preview dimension in pixels')">
							<option :value="0">{{ t('duplicatefinder', 'Any dimension') }}</option>
							<option :value="256">{{ t('duplicatefinder', '>= 256 px') }}</option>
							<option :value="512">{{ t('duplicatefinder', '>= 512 px') }}</option>
							<option :value="1024">{{ t('duplicatefinder', '>= 1024 px (HiDPI)') }}</option>
							<option :value="2048">{{ t('duplicatefinder', '>= 2048 px (Ultra)') }}</option>
						</select>
					</label>

					<label class="pcw__field">
						<span class="pcw__control-label">{{ t('duplicatefinder', 'Stale days') }}</span>
						<input
							v-model="staleDaysInput"
							type="number"
							min="0"
							step="1"
							class="pcw__num-input"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Age threshold in days for stale cache tagging')">
					</label>

					<label class="pcw__field">
						<span class="pcw__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortMode"
							class="pcw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort cache groups')">
							<option value="reclaim_desc">{{ t('duplicatefinder', 'Highest reclaimable') }}</option>
							<option value="count_desc">{{ t('duplicatefinder', 'Most cache artifacts') }}</option>
							<option value="largest_file_desc">{{ t('duplicatefinder', 'Largest single artifact') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename A to Z') }}</option>
						</select>
					</label>

					<label class="pcw__field pcw__field--grow">
						<span class="pcw__control-label">{{ t('duplicatefinder', 'Search') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="pcw__search-input"
							:placeholder="t('duplicatefinder', 'Filter path, fileId, hash, or appdata...')"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Search preview and cache artifacts')">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="pcw__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="pcw__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				<span>{{ statusNotice }}</span>
			</div>

			<div class="pcw__kpis">
				<article class="pcw__kpi-card">
					<span class="pcw__kpi-label">{{ t('duplicatefinder', 'Cache Footprint') }}</span>
					<strong class="pcw__kpi-value">{{ report.summary.totalCacheBytesFormatted }}</strong>
					<span class="pcw__kpi-sub">
						{{ t('duplicatefinder', '{count} cache artifacts across {groups} groups', {
							count: report.summary.totalCacheArtifactsCount,
							groups: report.summary.matchedGroupsCount,
						}) }}
					</span>
				</article>

				<article class="pcw__kpi-card">
					<span class="pcw__kpi-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
					<strong class="pcw__kpi-value">{{ activeReclaimPlan.reclaimableBytesFormatted }}</strong>
					<span class="pcw__kpi-sub">
						{{ t('duplicatefinder', '{count} redundant cache copies queued', {
							count: activeReclaimPlan.safeCount,
						}) }}
					</span>
				</article>

				<article class="pcw__kpi-card">
					<span class="pcw__kpi-label">{{ t('duplicatefinder', 'Orphaned Previews') }}</span>
					<strong class="pcw__kpi-value">{{ report.summary.orphanedPreviewBytesFormatted }}</strong>
					<span class="pcw__kpi-sub">
						{{ t('duplicatefinder', '{count} missing parent source fileId', {
							count: report.summary.orphanedPreviewCount,
						}) }}
					</span>
				</article>

				<article class="pcw__kpi-card">
					<span class="pcw__kpi-label">{{ t('duplicatefinder', 'HiDPI & Regenerable') }}</span>
					<strong class="pcw__kpi-value">{{ report.summary.hidpiPreviewBytesFormatted }}</strong>
					<span class="pcw__kpi-sub">
						{{ t('duplicatefinder', '{hidpi} HiDPI (>1024px) | {pct}% regenerable', {
							hidpi: report.summary.hidpiPreviewCount,
							pct: report.summary.regenerablePercent,
						}) }}
					</span>
				</article>
			</div>

			<div v-if="report.groups.length === 0" class="pcw__empty-matches">
				<p class="pcw__empty-title">
					{{ t('duplicatefinder', 'No Nextcloud preview, thumbnail, or cache duplicates detected in this scope') }}
				</p>
				<p class="pcw__empty-hint">
					{{ t('duplicatefinder', 'All inspected groups appear to contain active user files. Switch scope or lower minimum preview dimension if needed.') }}
				</p>
				<button
					v-if="scope === 'filtered' && allCount > filteredCount"
					type="button"
					class="pcw__mini-btn"
					@click="scope = 'all'">
					<span>{{ t('duplicatefinder', 'Inspect all loaded ({count})', { count: allCount }) }}</span>
				</button>
			</div>

			<template v-else>
				<div class="pcw__analytics-grid">
					<section
						class="pcw__panel"
						:aria-label="t('duplicatefinder', 'Cache artifact category breakdown')">
						<div class="pcw__panel-head">
							<h4 class="pcw__panel-title">
								{{ t('duplicatefinder', 'Cache Category Breakdown') }}
							</h4>
							<span class="pcw__panel-meta">
								{{ t('duplicatefinder', 'Click a category to filter') }}
							</span>
						</div>

						<ul class="pcw__cat-list">
							<li
								v-for="cat in report.categoryBreakdown"
								:key="cat.category"
								class="pcw__cat-item">
								<button
									type="button"
									class="pcw__cat-btn"
									:class="{ 'is-active': categoryFilter === cat.category }"
									:aria-pressed="categoryFilter === cat.category ? 'true' : 'false'"
									:disabled="cat.artifactCount === 0 || isDeleting"
									@click="toggleCategoryFilter(cat.category)">
									<div class="pcw__cat-top">
										<span class="pcw__cat-name">{{ cat.label }}</span>
										<span class="pcw__cat-stats">
											{{ cat.totalBytesFormatted }} ({{ cat.artifactCount }})
										</span>
									</div>
									<div class="pcw__bar-track">
										<div
											class="pcw__bar-fill"
											:style="{ width: `${Math.max(cat.sharePercent, cat.artifactCount > 0 ? 4 : 0)}%` }" />
									</div>
									<div class="pcw__cat-foot">
										<span>{{ cat.sharePercent }}% {{ t('duplicatefinder', 'of cache') }}</span>
										<span v-if="cat.orphanedCount > 0" class="pcw__orphan-tag">
											{{ t('duplicatefinder', '{count} orphaned', { count: cat.orphanedCount }) }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<section
						class="pcw__panel"
						:aria-label="t('duplicatefinder', 'Preview pyramid dimension tiers and appdata instances')">
						<div class="pcw__panel-head">
							<h4 class="pcw__panel-title">
								{{ t('duplicatefinder', 'Preview Pyramid Tiers & Appdata Roots') }}
							</h4>
							<span class="pcw__panel-meta">
								{{ t('duplicatefinder', 'php occ preview:cleanup') }}
							</span>
						</div>

						<div class="pcw__tier-grid">
							<div
								v-for="bucket in report.dimensionBuckets"
								:key="bucket.tier"
								class="pcw__tier-box">
								<span class="pcw__tier-label">{{ bucket.label }}</span>
								<strong class="pcw__tier-val">{{ bucket.totalBytesFormatted }}</strong>
								<span class="pcw__tier-count">
									{{ t('duplicatefinder', '{count} previews', { count: bucket.count }) }}
								</span>
							</div>
						</div>

						<div v-if="report.instanceBuckets.length > 0" class="pcw__instances">
							<span class="pcw__control-label">{{ t('duplicatefinder', 'Detected appdata instances:') }}</span>
							<div class="pcw__instance-chips">
								<button
									v-for="inst in report.instanceBuckets"
									:key="inst.instanceId"
									type="button"
									class="pcw__chip-btn"
									:class="{ 'is-active': instanceFilter === inst.instanceId }"
									:aria-pressed="instanceFilter === inst.instanceId ? 'true' : 'false'"
									:disabled="isDeleting"
									@click="toggleInstanceFilter(inst.instanceId)">
									<span>appdata_{{ inst.instanceId }} ({{ inst.totalBytesFormatted }})</span>
								</button>
							</div>
						</div>
					</section>
				</div>

				<div class="pcw__split">
					<section
						class="pcw__group-list-panel"
						:aria-label="t('duplicatefinder', 'Filtered cache duplicate groups')">
						<div class="pcw__panel-head">
							<h4 class="pcw__panel-title">
								{{ t('duplicatefinder', 'Cache Groups ({count})', { count: filteredGroups.length }) }}
							</h4>
						</div>

						<div v-if="filteredGroups.length === 0" class="pcw__empty-sub">
							<p>{{ t('duplicatefinder', 'No cache groups match the active filters.') }}</p>
							<button
								type="button"
								class="pcw__mini-btn"
								@click="resetFilters">
								<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
							</button>
						</div>

						<ul v-else class="pcw__group-list">
							<li
								v-for="group in filteredGroups"
								:key="group.groupKey"
								class="pcw__group-item">
								<button
									type="button"
									class="pcw__group-btn"
									:class="{ 'is-selected': activeGroup && activeGroup.groupKey === group.groupKey }"
									:aria-pressed="activeGroup && activeGroup.groupKey === group.groupKey ? 'true' : 'false'"
									@click="selectedGroupKey = group.groupKey">
									<div class="pcw__group-top">
										<strong class="pcw__group-name">{{ group.displayName }}</strong>
										<span class="pcw__group-reclaim">{{ group.reclaimableBytesFormatted }}</span>
									</div>
									<div class="pcw__group-meta">
										<span class="pcw__badge is-cat">{{ group.dominantCategoryLabel }}</span>
										<span v-if="group.orphanedCount > 0" class="pcw__badge is-danger">
											{{ t('duplicatefinder', '{count} orphaned', { count: group.orphanedCount }) }}
										</span>
										<span v-if="group.maxPreviewDimension > 0" class="pcw__badge is-info">
											{{ group.maxPreviewDimension }}px
										</span>
										<span v-if="group.hasProtectedOrigin" class="pcw__badge is-protected">
											{{ t('duplicatefinder', 'Protected') }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<aside
						v-if="activeGroup"
						class="pcw__detail-panel"
						:aria-label="t('duplicatefinder', 'Selected cache group artifact breakdown')">
						<div class="pcw__detail-head">
							<div>
								<h4 class="pcw__detail-title">
									{{ activeGroup.displayName }}
								</h4>
								<p class="pcw__detail-subtitle">
									{{ t('duplicatefinder', '{total} copies ({cache} cache artifacts, {reclaim} safe reclaimable)', {
										total: activeGroup.fileCount,
										cache: activeGroup.cacheArtifactCount,
										reclaim: activeGroup.reclaimableBytesFormatted,
									}) }}
								</p>
							</div>
							<div class="pcw__detail-actions">
								<button
									type="button"
									class="pcw__mini-btn"
									@click="$emit('select-duplicate', activeGroup.duplicateRef)">
									<span>{{ t('duplicatefinder', 'Focus group') }}</span>
								</button>
								<button
									type="button"
									class="pcw__mini-btn"
									@click="$emit('compare-duplicate', activeGroup.duplicateRef)">
									<span>{{ t('duplicatefinder', 'Compare') }}</span>
								</button>
							</div>
						</div>

						<ul class="pcw__file-list">
							<li
								v-for="entry in activeGroup.files"
								:key="`${activeGroup.groupKey}-${entry.selectionKey}-${entry.fileIndex}`"
								class="pcw__file-row">
								<div class="pcw__file-main">
									<span class="pcw__file-path">{{ entry.normalizedPath }}</span>
									<span class="pcw__file-sub">
										{{ entry.sizeFormatted }}
										<template v-if="entry.previewMeta && entry.previewMeta.dimensionLabel !== 'unknown'">
											| {{ entry.previewMeta.dimensionLabel }}
										</template>
										<template v-if="entry.previewMeta && entry.previewMeta.previewFileId">
											| fileId: {{ entry.previewMeta.previewFileId }}
										</template>
										<template v-if="entry.ageDays !== null">
											| {{ entry.ageDays }}d
										</template>
									</span>
									<span class="pcw__file-reason">{{ entry.reason }}</span>
								</div>
								<div class="pcw__file-badges">
									<span
										class="pcw__badge"
										:class="statusBadgeClass(entry)">
										{{ formatEntryBadge(entry) }}
									</span>
									<span v-if="entry.isProtected" class="pcw__badge is-protected">
										{{ t('duplicatefinder', 'Protected Origin') }}
									</span>
									<span v-if="entry.isLocked" class="pcw__badge is-warn">
										{{ t('duplicatefinder', 'Locked') }}
									</span>
								</div>
							</li>
						</ul>
					</aside>
				</div>
			</template>

			<footer class="pcw__bulk-bar">
				<div class="pcw__bulk-summary">
					<span>
						{{ t('duplicatefinder', 'Safe reclaim plan: {count} redundant cache copies ({size})', {
							count: activeReclaimPlan.safeCount,
							size: activeReclaimPlan.reclaimableBytesFormatted,
						}) }}
					</span>
					<span class="pcw__bulk-note">
						{{ t('duplicatefinder', 'Preserved: {survivors} group survivors, {origins} protected origins, {locked} locked.', {
							survivors: activeReclaimPlan.skippedSurvivorCount,
							origins: activeReclaimPlan.skippedProtectedCount,
							locked: activeReclaimPlan.skippedLockedCount,
						}) }}
					</span>
				</div>
				<div class="pcw__bulk-actions">
					<button
						type="button"
						class="pcw__danger-btn"
						:disabled="activeReclaimPlan.safeCount === 0 || isDeleting"
						@click="openReclaimDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Reclaiming...')
							: t('duplicatefinder', 'Reclaim safe cache copies') }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="previewReclaimDialog"
			class="pcw-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe preview and cache reclaim')"
			@close="onReclaimDialogClose"
			@click="onReclaimDialogBackdropClick">
			<div class="pcw-confirm-dialog__content">
				<h4 class="pcw-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Safe Preview & Cache Reclaim') }}
				</h4>
				<p class="pcw-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to remove {count} redundant preview/thumbnail/cache copies ({size}). All active source files, protected origins, locked files, and at least one surviving copy per group remain intact.', {
						count: activeReclaimPlan.safeCount,
						size: activeReclaimPlan.reclaimableBytesFormatted,
					}) }}
				</p>
				<div class="pcw-confirm-dialog__actions">
					<button
						type="button"
						class="pcw__tool-btn"
						:disabled="isDeleting"
						@click="closeReclaimDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="pcw__danger-btn"
						:disabled="isDeleting || activeReclaimPlan.safeCount === 0"
						@click="confirmSafeReclaim">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Reclaiming...')
							: t('duplicatefinder', 'Confirm Reclaim') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { formatBytes } from '../tools/duplicateStats'
import {
	buildPreviewCacheReclaimPlan,
	buildPreviewCacheReport,
	exportPreviewCacheCsv,
	exportPreviewCacheJson,
	filterPreviewCacheGroups,
	generatePreviewCleanupScript,
} from '../tools/previewCacheReclaim'

export default {
	name: 'PreviewCacheWorkbench',
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
	},
	data() {
		return {
			scope: 'all',
			categoryFilter: 'all',
			orphanOnly: false,
			minPreviewDimension: 0,
			staleDaysInput: '30',
			instanceFilter: '',
			sortMode: 'reclaim_desc',
			searchQuery: '',
			selectedGroupKey: '',
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
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
			return this.filteredCount === 0 && this.allCount === 0
		},
		sourceDuplicates() {
			if (this.scope === 'filtered') {
				return Array.isArray(this.duplicates) ? this.duplicates : []
			}
			if (Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		parsedStaleDays() {
			const val = Number(this.staleDaysInput)
			return Number.isFinite(val) && val >= 0 ? Math.floor(val) : 30
		},
		report() {
			return buildPreviewCacheReport(this.sourceDuplicates, {
				staleDays: this.parsedStaleDays,
			})
		},
		filteredGroups() {
			return filterPreviewCacheGroups(this.report.groups, {
				categoryFilter: this.categoryFilter,
				orphanOnly: this.orphanOnly,
				minPreviewDimension: this.minPreviewDimension,
				instanceFilter: this.instanceFilter,
				searchQuery: this.searchQuery,
				sortMode: this.sortMode,
			})
		},
		activeGroup() {
			if (this.filteredGroups.length === 0) {
				return null
			}
			if (this.selectedGroupKey) {
				const found = this.filteredGroups.find(g => g.groupKey === this.selectedGroupKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = this.filteredGroups.find(g => String(g.id) === String(this.currentDuplicateId))
				if (byCurrent) {
					return byCurrent
				}
			}
			return this.filteredGroups[0]
		},
		activeReclaimPlan() {
			return buildPreviewCacheReclaimPlan(this.filteredGroups, {
				categoryFilter: this.categoryFilter,
				orphanOnly: this.orphanOnly,
			})
		},
		hasActiveFilters() {
			return this.categoryFilter !== 'all'
				|| this.orphanOnly
				|| this.minPreviewDimension > 0
				|| this.instanceFilter !== ''
				|| this.searchQuery.trim() !== ''
		},
	},
	methods: {
		toggleCategoryFilter(category) {
			this.categoryFilter = this.categoryFilter === category ? 'all' : category
		},
		toggleInstanceFilter(instanceId) {
			this.instanceFilter = this.instanceFilter === instanceId ? '' : instanceId
		},
		resetFilters() {
			this.categoryFilter = 'all'
			this.orphanOnly = false
			this.minPreviewDimension = 0
			this.instanceFilter = ''
			this.searchQuery = ''
			this.sortMode = 'reclaim_desc'
		},
		statusBadgeClass(entry) {
			if (!entry.isCacheArtifact) {
				return 'is-safe'
			}
			if (entry.isOrphaned) {
				return 'is-danger'
			}
			if (entry.isStale) {
				return 'is-warn'
			}
			return 'is-info'
		},
		formatEntryBadge(entry) {
			if (!entry.isCacheArtifact) {
				return this.t('duplicatefinder', 'Active source')
			}
			if (entry.isOrphaned) {
				return this.t('duplicatefinder', 'Orphaned preview')
			}
			if (entry.isStale) {
				return this.t('duplicatefinder', 'Stale cache')
			}
			return entry.categoryLabel
		},
		openReclaimDialog() {
			if (this.activeReclaimPlan.safeCount === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.previewReclaimDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			}
		},
		closeReclaimDialog() {
			const dialog = this.$refs.previewReclaimDialog
			if (dialog && typeof dialog.close === 'function' && dialog.open) {
				dialog.close()
			}
		},
		onReclaimDialogClose() {
			// Native dialog close handler
		},
		onReclaimDialogBackdropClick(event) {
			if (event && event.target === this.$refs.previewReclaimDialog) {
				this.closeReclaimDialog()
			}
		},
		async confirmSafeReclaim() {
			const safeFiles = this.activeReclaimPlan.safeFiles
			if (!Array.isArray(safeFiles) || safeFiles.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const payload = safeFiles.map(file => ({
					id: file.id,
					nodeId: file.nodeId || file.id,
					path: file.path,
					name: file.name,
					size: Number(file.size) || 0,
					fileHash: file.fileHash || '',
				}))
				const result = await deleteFiles(payload)
				const deletedSuccess = Array.isArray(result?.success) ? result.success : payload
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds)
					? result.deletedNodeIds
					: deletedSuccess.map(f => f.nodeId || f.id).filter(Boolean)
				const bytesReclaimed = deletedSuccess.reduce((sum, f) => sum + (Number(f.size) || 0), 0)

				this.closeReclaimDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Reclaimed {count} redundant cache copies ({size}).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('preview-cache-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: this.filteredGroups.length,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeReclaimDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not reclaim selected cache copies.')
			} finally {
				this.isDeleting = false
			}
		},
		triggerDownload(filename, content, mimeType) {
			if (typeof document === 'undefined' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return
			}
			const blob = new Blob([content], { type: mimeType })
			const href = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = href
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			setTimeout(() => {
				URL.revokeObjectURL(href)
			}, 1000)
		},
		exportCleanupScript() {
			const script = generatePreviewCleanupScript(this.activeReclaimPlan, this.report)
			this.triggerDownload('duplicatefinder-preview-cache-cleanup.sh', script, 'text/x-shellscript;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported dry-run POSIX cleanup & OCC maintenance script.')
		},
		exportJsonReport() {
			const json = exportPreviewCacheJson(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-preview-cache-audit.json', json, 'application/json;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported preview & cache audit JSON report.')
		},
		exportCsvReport() {
			const csv = exportPreviewCacheCsv(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-preview-cache-audit.csv', csv, 'text/csv;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe preview & cache audit CSV.')
		},
	},
}
</script>

<style scoped>
.preview-cache-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding-block: 16px;
	padding-inline: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	max-inline-size: 100%;
	min-inline-size: 0;
	box-sizing: border-box;
}

.pcw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.pcw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.pcw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.pcw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.pcw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.pcw__tool-btn,
.pcw__seg-btn,
.pcw__mini-btn,
.pcw__chip-btn,
.pcw__primary-btn,
.pcw__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 500;
	cursor: pointer;
}

.pcw__tool-btn:hover:not(:disabled),
.pcw__seg-btn:hover:not(:disabled),
.pcw__mini-btn:hover:not(:disabled),
.pcw__chip-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.pcw__seg-btn.is-active,
.pcw__chip-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-weight: 600;
}

.pcw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
	font-weight: 600;
}

.pcw__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
	font-weight: 600;
}

.pcw__danger-btn:hover:not(:disabled) {
	background-color: #a61b1b;
	border-color: #a61b1b;
}

.pcw__tool-btn:disabled,
.pcw__seg-btn:disabled,
.pcw__mini-btn:disabled,
.pcw__chip-btn:disabled,
.pcw__primary-btn:disabled,
.pcw__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.pcw__tool-btn:focus-visible,
.pcw__seg-btn:focus-visible,
.pcw__mini-btn:focus-visible,
.pcw__chip-btn:focus-visible,
.pcw__primary-btn:focus-visible,
.pcw__danger-btn:focus-visible,
.pcw__select:focus-visible,
.pcw__num-input:focus-visible,
.pcw__search-input:focus-visible,
.pcw__cat-btn:focus-visible,
.pcw__group-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.pcw__empty,
.pcw__empty-matches,
.pcw__empty-sub {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border-radius: var(--border-radius, 4px);
	border: 1px dashed var(--color-border);
	background-color: var(--color-background-hover);
}

.pcw__empty-title {
	margin: 0;
	font-weight: 600;
}

.pcw__empty-hint {
	margin: 0;
	font-size: 0.86rem;
	color: var(--color-text-maxcontrast);
}

.pcw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.pcw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.pcw__control-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.pcw__segments,
.pcw__instance-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.pcw__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.pcw__field--grow {
	flex: 1 1 200px;
}

.pcw__select,
.pcw__num-input,
.pcw__search-input {
	min-block-size: 36px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	box-sizing: border-box;
}

.pcw__num-input {
	inline-size: 80px;
}

.pcw__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.pcw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-size: 0.85rem;
}

.pcw__notice.is-error {
	border-color: #c62828;
	background-color: rgba(198, 40, 40, 0.12);
}

.pcw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.pcw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pcw__kpi-label {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.pcw__kpi-value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.pcw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.pcw__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.pcw__panel,
.pcw__group-list-panel,
.pcw__detail-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pcw__panel-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.pcw__panel-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
}

.pcw__panel-meta {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.pcw__cat-list,
.pcw__group-list,
.pcw__file-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.pcw__cat-btn,
.pcw__group-btn {
	inline-size: 100%;
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
}

.pcw__cat-btn:hover:not(:disabled),
.pcw__group-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.pcw__cat-btn.is-active,
.pcw__group-btn.is-selected {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
}

.pcw__cat-top,
.pcw__cat-foot,
.pcw__group-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.83rem;
}

.pcw__cat-name,
.pcw__group-name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pcw__cat-stats,
.pcw__group-reclaim {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	flex-shrink: 0;
}

.pcw__bar-track {
	inline-size: 100%;
	block-size: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark, rgba(128, 128, 128, 0.2));
	overflow: hidden;
}

.pcw__bar-fill {
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element);
}

.pcw__orphan-tag {
	color: #b71c1c;
	font-weight: 600;
}

.pcw__tier-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.pcw__tier-box {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.pcw__tier-label,
.pcw__tier-count {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.pcw__tier-val {
	font-size: 0.96rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.pcw__instances {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.pcw__split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
	gap: 12px;
}

.pcw__group-list {
	max-block-size: 360px;
	overflow-y: auto;
}

.pcw__group-meta,
.pcw__file-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.pcw__detail-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.pcw__detail-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.pcw__detail-subtitle {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.pcw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.pcw__file-list {
	max-block-size: 320px;
	overflow-y: auto;
}

.pcw__file-row {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.pcw__file-main {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
	flex: 1 1 220px;
}

.pcw__file-path {
	font-size: 0.82rem;
	font-weight: 600;
	word-break: break-all;
}

.pcw__file-sub,
.pcw__file-reason {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.pcw__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	font-size: 0.72rem;
	font-weight: 600;
}

.pcw__badge.is-safe {
	border-color: #2e7d32;
	color: #2e7d32;
}

.pcw__badge.is-protected,
.pcw__badge.is-info {
	border-color: #0277bd;
	color: #0277bd;
}

.pcw__badge.is-warn {
	border-color: #d97706;
	color: #b45309;
}

.pcw__badge.is-danger {
	border-color: #b71c1c;
	color: #b71c1c;
}

.pcw__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.pcw__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.86rem;
	font-weight: 600;
}

.pcw__bulk-note {
	font-weight: 400;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.pcw__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.pcw-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.pcw-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.pcw-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.pcw-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.pcw-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.pcw-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.pcw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.pcw__analytics-grid,
	.pcw__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.preview-cache-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.pcw__tool-btn,
	.pcw__seg-btn,
	.pcw__mini-btn,
	.pcw__chip-btn,
	.pcw__primary-btn,
	.pcw__danger-btn,
	.pcw__select,
	.pcw__num-input,
	.pcw__search-input,
	.pcw__cat-btn,
	.pcw__group-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.pcw__field {
		flex: 1 1 100%;
	}

	.pcw__select,
	.pcw__num-input {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.pcw__kpis,
	.pcw__tier-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
