<template>
	<section
		class="shadow-reclaim-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Nextcloud Versions, Trashbin and Appdata Shadow-Duplicate Reclaimer')">
		<header class="srw__toolbar">
			<div class="srw__title-group">
				<h3 class="srw__title">
					{{ t('duplicatefinder', 'Versions, Trashbin & Appdata Shadow Reclaimer') }}
				</h3>
				<span
					class="srw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{size} reclaimable / {shadows} shadow files / {users} users', {
						size: report.summary.totalShadowReclaimableFormatted,
						shadows: report.summary.safeReclaimShadowCount,
						users: report.summary.allDetectedUsers.length,
					}) }}
				</span>
			</div>

			<div class="srw__toolbar-actions">
				<button
					type="button"
					class="srw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportProbeScript">
					<span>{{ t('duplicatefinder', 'Export Probe') }}</span>
				</button>
				<button
					type="button"
					class="srw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportOccCleanupScript">
					<span>{{ t('duplicatefinder', 'Export OCC Cleanup') }}</span>
				</button>
				<button
					type="button"
					class="srw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="srw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="srw__tool-btn is-close"
					aria-keyshortcuts="`"
					:title="t('duplicatefinder', 'Hide shadow duplicate reclaimer')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Shadow') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="srw__empty">
			<p class="srw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="srw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to correlate duplicates across Nextcloud files_versions, files_trashbin, and appdata_* shadow trees.') }}
			</p>
			<button
				type="button"
				class="srw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="srw__controls">
				<div class="srw__control-row">
					<span class="srw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="srw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Shadow audit scope')">
						<button
							type="button"
							class="srw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="srw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>

					<span class="srw__control-label">{{ t('duplicatefinder', 'Safety') }}</span>
					<div
						class="srw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Shadow safety switches')">
						<button
							type="button"
							class="srw__seg-btn"
							:class="{ 'is-active': includeAppdata }"
							:aria-pressed="includeAppdata ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="includeAppdata = !includeAppdata">
							<span>{{ t('duplicatefinder', 'Include appdata_*') }}</span>
						</button>
						<button
							type="button"
							class="srw__seg-btn"
							:class="{ 'is-active': protectLastShadowAnchor }"
							:aria-pressed="protectLastShadowAnchor ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="protectLastShadowAnchor = !protectLastShadowAnchor">
							<span>{{ t('duplicatefinder', 'Protect shadow-only anchor') }}</span>
						</button>
					</div>
				</div>

				<div class="srw__control-row">
					<span class="srw__control-label">{{ t('duplicatefinder', 'Shadow class') }}</span>
					<div
						class="srw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by Nextcloud shadow class')">
						<button
							v-for="opt in shadowFilterOptions"
							:key="opt.id"
							type="button"
							class="srw__seg-btn"
							:class="{ 'is-active': shadowFilter === opt.id }"
							:aria-pressed="shadowFilter === opt.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="shadowFilter = opt.id">
							<span>{{ opt.label }} ({{ report.summary.categoryCounts[opt.id] || 0 }})</span>
						</button>
					</div>
				</div>

				<div class="srw__filters-grid">
					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Nextcloud user') }}</span>
						<select
							v-model="userFilter"
							class="srw__select"
							:disabled="isDeleting">
							<option value="all">
								{{ t('duplicatefinder', 'All users ({count})', { count: report.summary.allDetectedUsers.length }) }}
							</option>
							<option
								v-for="uid in report.summary.allDetectedUsers"
								:key="uid"
								:value="uid">
								@{{ uid }}
							</option>
						</select>
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Survivor rule') }}</span>
						<select
							v-model="strategy"
							class="srw__select"
							:disabled="isDeleting">
							<option
								v-for="st in strategyOptions"
								:key="st.id"
								:value="st.id">
								{{ st.label }}
							</option>
						</select>
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Retention grace (min age days)') }}</span>
						<input
							v-model="minAgeDaysInput"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							class="srw__text-input"
							:placeholder="t('duplicatefinder', '0')"
							:disabled="isDeleting">
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Min shadow reclaim (KB)') }}</span>
						<input
							v-model="minReclaimKbInput"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							class="srw__text-input"
							:placeholder="t('duplicatefinder', '0')"
							:disabled="isDeleting">
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Search path, user or appdata') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="srw__text-input"
							:placeholder="t('duplicatefinder', 'Filter by user, .v/.d, appdata...')"
							:disabled="isDeleting">
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Sort groups') }}</span>
						<select
							v-model="sortMode"
							class="srw__select"
							:disabled="isDeleting">
							<option value="shadow_reclaim_desc">
								{{ t('duplicatefinder', 'Shadow reclaimable (largest)') }}
							</option>
							<option value="shadow_count_desc">
								{{ t('duplicatefinder', 'Shadow artifact count (most)') }}
							</option>
							<option value="age_desc">
								{{ t('duplicatefinder', 'Oldest shadow age first') }}
							</option>
							<option value="name_asc">
								{{ t('duplicatefinder', 'Filename (A to Z)') }}
							</option>
						</select>
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'OCC cleanup mode') }}</span>
						<select
							v-model="occMode"
							class="srw__select"
							:disabled="isDeleting">
							<option value="per_user_cleanup">
								{{ t('duplicatefinder', 'Per-user occ cleanup') }}
							</option>
							<option value="all_users_cleanup">
								{{ t('duplicatefinder', 'Global --all-users cleanup') }}
							</option>
							<option value="targeted_path_purge">
								{{ t('duplicatefinder', 'Targeted shadow path purge') }}
							</option>
						</select>
					</label>

					<label class="srw__field">
						<span class="srw__field-label">{{ t('duplicatefinder', 'Nextcloud data root') }}</span>
						<input
							v-model="dataRootInput"
							type="text"
							class="srw__text-input"
							:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')"
							:disabled="isDeleting">
					</label>
				</div>
			</div>

			<div
				class="srw__summary-grid"
				role="region"
				:aria-label="t('duplicatefinder', 'Shadow reclaim footprint summary')">
				<div class="srw__kpi-card is-safe">
					<span class="srw__kpi-label">{{ t('duplicatefinder', 'Safe Shadow Reclaim') }}</span>
					<strong class="srw__kpi-value">{{ report.summary.totalShadowReclaimableFormatted }}</strong>
					<span class="srw__kpi-sub">
						{{ t('duplicatefinder', '{count} copies across {groups} groups', {
							count: report.summary.safeReclaimShadowCount,
							groups: report.summary.totalGroups,
						}) }}
					</span>
				</div>
				<div class="srw__kpi-card is-warn">
					<span class="srw__kpi-label">{{ t('duplicatefinder', 'Versions & Trashbin') }}</span>
					<strong class="srw__kpi-value">{{ report.summary.versionsReclaimableFormatted }}</strong>
					<span class="srw__kpi-sub">
						{{ t('duplicatefinder', 'Trashbin: {trash}', {
							trash: report.summary.trashbinReclaimableFormatted,
						}) }}
					</span>
				</div>
				<div class="srw__kpi-card">
					<span class="srw__kpi-label">{{ t('duplicatefinder', 'Appdata & Cross-User') }}</span>
					<strong class="srw__kpi-value">{{ report.summary.appdataReclaimableFormatted }}</strong>
					<span class="srw__kpi-sub">
						{{ t('duplicatefinder', '{cross} cross-user shadow groups', {
							cross: report.summary.crossUserShadowGroups,
						}) }}
					</span>
				</div>
				<div class="srw__kpi-card is-danger">
					<span class="srw__kpi-label">{{ t('duplicatefinder', 'Shadow-Only & Held') }}</span>
					<strong class="srw__kpi-value">{{ report.summary.shadowOnlyGroups }}</strong>
					<span class="srw__kpi-sub">
						{{ t('duplicatefinder', '{held} copies held by retention grace', {
							held: report.summary.retentionHeldCount,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="report.userBreakdown.length > 0"
				class="srw__user-strip"
				role="region"
				:aria-label="t('duplicatefinder', 'Per-user shadow reclaim breakdown')">
				<span class="srw__control-label">{{ t('duplicatefinder', 'Per-user OCC targets') }}</span>
				<div class="srw__user-chips">
					<button
						v-for="ub in report.userBreakdown"
						:key="ub.userId"
						type="button"
						class="srw__seg-btn"
						:class="{ 'is-active': !ub.isSystemBucket && userFilter === ub.userId }"
						:disabled="ub.isSystemBucket || isDeleting"
						@click="!ub.isSystemBucket && toggleUserChip(ub.userId)">
						<span>
							{{ ub.isSystemBucket ? ub.userId : `@${ub.userId}` }}: {{ ub.totalReclaimFormatted }}
							({{ ub.versionsCount }}v / {{ ub.trashbinCount }}t / {{ ub.appdataCount }}a)
						</span>
					</button>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="srw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div
				v-if="globalSafeSelection.files.length > 0"
				class="srw__global-bar">
				<span class="srw__global-bar-text">
					{{ t('duplicatefinder', '{count} verified shadow duplicates across {groups} groups ready to reclaim ({size})', {
						count: globalSafeSelection.files.length,
						groups: globalSafeSelection.groupCount,
						size: globalSafeSelection.totalFormatted,
					}) }}
				</span>
				<button
					type="button"
					class="srw__primary-btn is-danger"
					:disabled="isDeleting"
					@click="openBatchDeleteDialog(null)">
					<span>{{ t('duplicatefinder', 'Delete {count} Safe Shadows', { count: globalSafeSelection.files.length }) }}</span>
				</button>
			</div>

			<div
				v-if="report.items.length === 0"
				class="srw__no-matches">
				<p>{{ t('duplicatefinder', 'No Nextcloud files_versions, files_trashbin, or appdata_* shadow duplicates detected in this scope.') }}</p>
				<button
					v-if="scope === 'filtered' && allSourceCount > filteredSourceCount"
					type="button"
					class="srw__tool-btn"
					@click="scope = 'all'">
					<span>{{ t('duplicatefinder', 'Switch to All loaded ({count})', { count: allSourceCount }) }}</span>
				</button>
			</div>

			<div
				v-else-if="filteredItems.length === 0"
				class="srw__no-matches">
				<p>{{ t('duplicatefinder', 'No shadow duplicate groups match the current filters.') }}</p>
				<button
					type="button"
					class="srw__tool-btn"
					@click="resetWorkbenchFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div
				v-else
				class="srw__workspace">
				<div
					class="srw__group-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Shadow duplicate groups')">
					<article
						v-for="item in visibleItems"
						:key="item.groupKey"
						role="listitem"
						class="srw__group-card"
						:class="[
							`is-category-${item.primaryCategory}`,
							{ 'is-active': activeItem && activeItem.groupKey === item.groupKey },
						]">
						<div class="srw__group-top">
							<span
								class="srw__verdict-pill"
								:class="`is-${item.primaryCategory}`">
								{{ formatCategory(item.primaryCategory) }}
							</span>
							<span class="srw__group-stats">
								{{ item.shadowReclaimableFormatted }}
							</span>
						</div>

						<div class="srw__group-name">
							{{ item.title }}
						</div>

						<div class="srw__group-sub">
							{{ t('duplicatefinder', '{live} live / {versions} versions / {trash} trash / {appdata} appdata', {
								live: item.liveCount,
								versions: item.versionsCount,
								trash: item.trashbinCount,
								appdata: item.appdataCount,
							}) }}
						</div>

						<div class="srw__telemetry-tags">
							<span
								v-if="item.isShadowOnlyGroup"
								class="srw__tag is-danger">
								{{ t('duplicatefinder', 'Shadow-only group') }}
							</span>
							<span
								v-if="item.isCrossUserShadow"
								class="srw__tag is-warn">
								{{ t('duplicatefinder', 'Cross-user shadow') }}
							</span>
							<span
								v-if="item.oldestShadowAgeDays > 0"
								class="srw__tag">
								{{ t('duplicatefinder', '{days}d max age', { days: item.oldestShadowAgeDays }) }}
							</span>
						</div>

						<div class="srw__group-actions">
							<button
								type="button"
								class="srw__mini-btn"
								:class="{ 'is-active': activeItem && activeItem.groupKey === item.groupKey }"
								:aria-pressed="activeItem && activeItem.groupKey === item.groupKey ? 'true' : 'false'"
								@click="selectedGroupKey = item.groupKey">
								<span>{{ t('duplicatefinder', 'Shadow Map') }}</span>
							</button>
							<button
								type="button"
								class="srw__mini-btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="srw__mini-btn"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</article>

					<div
						v-if="filteredItems.length > visibleLimit"
						class="srw__load-more-wrap">
						<button
							type="button"
							class="srw__tool-btn"
							@click="visibleLimit += 25">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', {
								remaining: filteredItems.length - visibleLimit,
							}) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="activeItem"
					class="srw__inspector"
					role="region"
					:aria-label="t('duplicatefinder', 'Selected shadow group detail')">
					<header class="srw__inspector-header">
						<div class="srw__inspector-title-wrap">
							<h4 class="srw__inspector-title">
								{{ activeItem.title }}
							</h4>
							<span class="srw__inspector-meta">
								{{ t('duplicatefinder', 'Logical path: {path}', {
									path: activeItem.logicalOriginalPath || activeItem.title,
								}) }}
							</span>
						</div>
						<button
							v-if="activeItem.safeReclaimCount > 0"
							type="button"
							class="srw__mini-btn is-danger-outline"
							:disabled="isDeleting"
							@click="openBatchDeleteDialog(activeItem.groupKey)">
							<span>{{ t('duplicatefinder', 'Delete {count} Safe Shadows', { count: activeItem.safeReclaimCount }) }}</span>
						</button>
					</header>

					<div class="srw__copies-list">
						<div
							v-for="copy in activeItem.copies"
							:key="copy.selectionKey"
							class="srw__copy-card"
							:class="`is-status-${copy.copyStatus}`">
							<div class="srw__copy-header">
								<span
									class="srw__verdict-pill"
									:class="`is-${copy.copyStatus}`">
									{{ formatCopyStatus(copy.copyStatus) }}
								</span>
								<span class="srw__copy-bytes">
									{{ copy.sizeFormatted }}
								</span>
							</div>

							<div class="srw__copy-path">
								{{ copy.displayPath }}
							</div>

							<div class="srw__telemetry-tags">
								<span class="srw__tag">{{ formatShadowType(copy.shadowType) }}</span>
								<span
									v-if="copy.userId"
									class="srw__tag">
									@{{ copy.userId }}
								</span>
								<span
									v-if="copy.instanceId"
									class="srw__tag">
									appdata_{{ copy.instanceId }}/{{ copy.appdataScope }}
								</span>
								<span
									v-if="copy.epochTimestampSec"
									class="srw__tag">
									epoch={{ copy.epochTimestampSec }}
								</span>
								<span
									v-if="copy.ageDays !== null"
									class="srw__tag">
									{{ t('duplicatefinder', '{days}d old', { days: copy.ageDays }) }}
								</span>
							</div>

							<p class="srw__copy-reason">
								{{ copy.copyReason }}
							</p>

							<div
								v-if="!copy.isSurvivor"
								class="srw__copy-actions">
								<button
									type="button"
									class="srw__mini-btn"
									:disabled="isDeleting"
									@click="promoteSurvivor(activeItem.groupKey, copy.selectionKey)">
									<span>{{ t('duplicatefinder', 'Promote Survivor') }}</span>
								</button>
							</div>
						</div>
					</div>

					<div class="srw__script-panel">
						<div class="srw__script-header">
							<strong>{{ t('duplicatefinder', 'Dry-run OCC cleanup & diagnostic probe') }}</strong>
							<div class="srw__script-actions">
								<button
									type="button"
									class="srw__mini-btn"
									@click="copyGroupProbe">
									<span>{{ t('duplicatefinder', 'Copy Probe') }}</span>
								</button>
								<button
									type="button"
									class="srw__mini-btn"
									@click="copyGroupOccPlan">
									<span>{{ t('duplicatefinder', 'Copy OCC Plan') }}</span>
								</button>
							</div>
						</div>
						<pre class="srw__code-preview">{{ activeGroupOccPreview }}</pre>
					</div>
				</div>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="srw__dialog"
			:aria-labelledby="dialogTitleId"
			@cancel.prevent="closeConfirmDialog"
			@click="onDialogBackdropClick">
			<div class="srw__dialog-inner">
				<h4
					:id="dialogTitleId"
					class="srw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Shadow-Duplicate Deletion') }}
				</h4>
				<p class="srw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} verified shadow copies across {groups} groups to reclaim {size}? Live survivors, Origin files, locked files, and retention-held shadows are excluded.', {
						count: pendingSelection.files.length,
						groups: pendingSelection.groupCount,
						size: pendingSelection.totalFormatted,
					}) }}
				</p>
				<div class="srw__dialog-actions">
					<button
						type="button"
						class="srw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="srw__primary-btn is-danger"
						:disabled="isDeleting"
						@click="confirmSafeDeletion">
						<span>{{ isDeleting ? t('duplicatefinder', 'Deleting...') : t('duplicatefinder', 'Confirm Delete') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	analyzeShadowDuplicates,
	buildShadowOccCleanupScript,
	buildShadowProbeScript,
	buildShadowReclaimCsv,
	buildShadowReclaimJson,
	buildShadowSafeSelection,
	filterAndSortShadowItems,
} from '../tools/shadowReclaimAnalyzer'

export default {
	name: 'ShadowReclaimWorkbench',
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
			scope: 'filtered',
			shadowFilter: 'all',
			userFilter: 'all',
			strategy: 'live_first',
			minAgeDaysInput: '',
			minReclaimKbInput: '',
			searchQuery: '',
			sortMode: 'shadow_reclaim_desc',
			occMode: 'per_user_cleanup',
			dataRootInput: '/var/www/nextcloud/data',
			includeAppdata: true,
			protectLastShadowAnchor: true,
			manualSurvivors: {},
			selectedGroupKey: null,
			visibleLimit: 25,
			isDeleting: false,
			pendingGroupKey: null,
			statusNotice: '',
			statusNoticeType: 'info',
			dialogTitleId: 'srw-confirm-dialog-title',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeSourceGroups() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		shadowFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'files_versions', label: this.t('duplicatefinder', 'Versions') },
				{ id: 'files_trashbin', label: this.t('duplicatefinder', 'Trashbin') },
				{ id: 'appdata', label: this.t('duplicatefinder', 'Appdata') },
				{ id: 'shadow_only', label: this.t('duplicatefinder', 'Shadow-Only') },
				{ id: 'live_backed', label: this.t('duplicatefinder', 'Live-Backed') },
			]
		},
		strategyOptions() {
			return [
				{ id: 'live_first', label: this.t('duplicatefinder', 'Active live file first') },
				{ id: 'oldest', label: this.t('duplicatefinder', 'Oldest modified') },
				{ id: 'newest', label: this.t('duplicatefinder', 'Newest modified') },
				{ id: 'shortest_path', label: this.t('duplicatefinder', 'Shortest path') },
			]
		},
		minShadowAgeDays() {
			const trimmed = typeof this.minAgeDaysInput === 'string'
				? this.minAgeDaysInput.trim()
				: String(this.minAgeDaysInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const days = Number(trimmed)
			return Number.isFinite(days) && days > 0 ? Math.floor(days) : 0
		},
		minShadowReclaimBytes() {
			const trimmed = typeof this.minReclaimKbInput === 'string'
				? this.minReclaimKbInput.trim()
				: String(this.minReclaimKbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const kb = Number(trimmed)
			return Number.isFinite(kb) && kb > 0 ? Math.round(kb * 1024) : 0
		},
		report() {
			return analyzeShadowDuplicates(this.activeSourceGroups, {
				strategy: this.strategy,
				minShadowAgeDays: this.minShadowAgeDays,
				includeAppdata: this.includeAppdata,
				protectLastShadowAnchor: this.protectLastShadowAnchor,
				manualSurvivors: this.manualSurvivors,
			})
		},
		filteredItems() {
			return filterAndSortShadowItems(this.report.items, {
				shadowFilter: this.shadowFilter,
				userFilter: this.userFilter,
				searchQuery: this.searchQuery,
				minShadowReclaimBytes: this.minShadowReclaimBytes,
				sortMode: this.sortMode,
			})
		},
		visibleItems() {
			return this.filteredItems.slice(0, this.visibleLimit)
		},
		activeItem() {
			if (this.filteredItems.length === 0) {
				return null
			}
			if (this.selectedGroupKey) {
				const found = this.filteredItems.find(item => item.groupKey === this.selectedGroupKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const current = this.filteredItems.find(item => item.groupId === this.currentDuplicateId)
				if (current) {
					return current
				}
			}
			return this.filteredItems[0] || null
		},
		activeGroupOccPreview() {
			if (!this.activeItem) {
				return ''
			}
			return buildShadowOccCleanupScript(this.report, {
				dataRoot: this.dataRootInput,
				occMode: this.occMode,
				targetGroupKey: this.activeItem.groupKey,
			})
		},
		globalSafeSelection() {
			return buildShadowSafeSelection(this.report, null)
		},
		pendingSelection() {
			return buildShadowSafeSelection(this.report, this.pendingGroupKey)
		},
	},
	methods: {
		formatCategory(category) {
			const labels = {
				files_versions: this.t('duplicatefinder', 'files_versions'),
				files_trashbin: this.t('duplicatefinder', 'files_trashbin'),
				appdata: this.t('duplicatefinder', 'appdata_*'),
				mixed_shadow: this.t('duplicatefinder', 'Mixed Shadow'),
				live_only: this.t('duplicatefinder', 'Live Files'),
			}
			return labels[category] || category
		},
		formatShadowType(shadowType) {
			const labels = {
				live_file: this.t('duplicatefinder', 'Live User File'),
				files_versions: this.t('duplicatefinder', 'files_versions'),
				files_trashbin: this.t('duplicatefinder', 'files_trashbin'),
				appdata: this.t('duplicatefinder', 'appdata_*'),
			}
			return labels[shadowType] || shadowType
		},
		formatCopyStatus(status) {
			const labels = {
				survivor: this.t('duplicatefinder', 'Survivor Anchor'),
				'protected-origin': this.t('duplicatefinder', 'Origin Protected'),
				'locked-file': this.t('duplicatefinder', 'Locked'),
				'retention-hold': this.t('duplicatefinder', 'Retention Hold'),
				'shadow-reclaimable': this.t('duplicatefinder', 'Safe Shadow Reclaim'),
				'live-redundant': this.t('duplicatefinder', 'Live Copy'),
			}
			return labels[status] || status
		},
		toggleUserChip(userId) {
			this.userFilter = this.userFilter === userId ? 'all' : userId
		},
		promoteSurvivor(groupKey, selectionKey) {
			this.$set(this.manualSurvivors, groupKey, selectionKey)
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Updated survivor anchor for shadow reclaim calculations.')
		},
		resetWorkbenchFilters() {
			this.shadowFilter = 'all'
			this.userFilter = 'all'
			this.searchQuery = ''
			this.minAgeDaysInput = ''
			this.minReclaimKbInput = ''
		},
		triggerDownload(content, mimeType, filename) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
			if (!url) {
				return false
			}
			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			if (typeof URL.revokeObjectURL === 'function') {
				setTimeout(() => URL.revokeObjectURL(url), 1000)
			}
			return true
		},
		exportProbeScript() {
			const script = buildShadowProbeScript(this.report, {
				dataRoot: this.dataRootInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-shadow-probe.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported read-only Nextcloud shadow tree diagnostic script.')
		},
		exportOccCleanupScript() {
			const script = buildShadowOccCleanupScript(this.report, {
				dataRoot: this.dataRootInput,
				occMode: this.occMode,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-shadow-occ-cleanup.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported DRY_RUN=1 Nextcloud OCC shadow cleanup script.')
		},
		exportJsonReport() {
			const json = buildShadowReclaimJson(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-shadow-reclaim.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported shadow reclaim audit JSON report.')
		},
		exportCsvLedger() {
			const csv = buildShadowReclaimCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-shadow-reclaim.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported shadow reclaim audit CSV ledger.')
		},
		async copyGroupProbe() {
			if (!this.activeItem) {
				return
			}
			const script = buildShadowProbeScript(this.report, {
				dataRoot: this.dataRootInput,
				targetGroupKey: this.activeItem.groupKey,
			})
			const ok = await copyTextSafely(script)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied read-only shadow probe for active group.')
				: this.t('duplicatefinder', 'Could not copy shadow probe to clipboard.')
		},
		async copyGroupOccPlan() {
			if (!this.activeItem) {
				return
			}
			const script = buildShadowOccCleanupScript(this.report, {
				dataRoot: this.dataRootInput,
				occMode: this.occMode,
				targetGroupKey: this.activeItem.groupKey,
			})
			const ok = await copyTextSafely(script)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied DRY_RUN=1 OCC shadow plan for active group.')
				: this.t('duplicatefinder', 'Could not copy OCC shadow plan to clipboard.')
		},
		openBatchDeleteDialog(groupKey) {
			this.pendingGroupKey = groupKey || null
			if (this.pendingSelection.files.length === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closeConfirmDialog() {
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.close === 'function') {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
			this.pendingGroupKey = null
		},
		onDialogBackdropClick(event) {
			const dialog = this.$refs.confirmDialog
			if (dialog && event && event.target === dialog) {
				this.closeConfirmDialog()
			}
		},
		async confirmSafeDeletion() {
			const selection = this.pendingSelection
			if (selection.files.length === 0 || this.isDeleting) {
				this.closeConfirmDialog()
				return
			}
			this.isDeleting = true
			this.statusNotice = ''
			try {
				const response = await deleteFiles(selection.files)
				const deletedIds = Array.isArray(response && response.deleted) ? response.deleted : []
				const failedIds = Array.isArray(response && response.failed) ? response.failed : []
				const deletedCount = deletedIds.length > 0
					? deletedIds.length
					: Math.max(0, selection.files.length - failedIds.length)

				if (failedIds.length > 0 && deletedCount === 0) {
					this.statusNoticeType = 'error'
					this.statusNotice = this.t('duplicatefinder', 'Could not delete the selected shadow duplicates.')
				} else {
					this.statusNoticeType = 'success'
					this.statusNotice = this.t('duplicatefinder', 'Deleted {count} verified shadow copies.', { count: deletedCount })
					this.$emit('shadow-delete-completed', {
						deletedFiles: selection.files,
						deletedCount,
						failedCount: failedIds.length,
						reclaimedBytes: selection.totalBytes,
						source: 'shadow-reclaim-workbench',
					})
				}
			} catch (_error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Shadow duplicate deletion failed.')
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.shadow-reclaim-workbench {
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
	box-sizing: border-box;
	max-inline-size: 100%;
	overflow-x: hidden;
}

.shadow-reclaim-workbench *,
.shadow-reclaim-workbench *::before,
.shadow-reclaim-workbench *::after {
	box-sizing: border-box;
}

.srw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.srw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.srw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.srw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.srw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.srw__tool-btn,
.srw__seg-btn,
.srw__mini-btn,
.srw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.srw__tool-btn:hover:not(:disabled),
.srw__seg-btn:hover:not(:disabled),
.srw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
}

.srw__tool-btn:focus-visible,
.srw__seg-btn:focus-visible,
.srw__mini-btn:focus-visible,
.srw__primary-btn:focus-visible,
.srw__text-input:focus-visible,
.srw__select:focus-visible {
	outline: 2px solid var(--color-primary-element, #006aa3);
	outline-offset: 2px;
}

.srw__tool-btn:disabled,
.srw__seg-btn:disabled,
.srw__mini-btn:disabled,
.srw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.srw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #006aa3);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.srw__seg-btn.is-active,
.srw__mini-btn.is-active {
	background-color: var(--color-primary-element-light, var(--color-background-hover));
	border-color: var(--color-primary-element, #006aa3);
}

.srw__primary-btn {
	background-color: var(--color-primary-element, #006aa3);
	border-color: var(--color-primary-element, #006aa3);
	color: var(--color-primary-text, #fff);
}

.srw__primary-btn.is-danger {
	background-color: #b91c1c;
	border-color: #b91c1c;
	color: #fff;
}

.srw__mini-btn.is-danger-outline {
	border-color: #b91c1c;
	color: #b91c1c;
}

.srw__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.srw__empty-title {
	margin: 0;
	font-weight: 700;
}

.srw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.srw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.srw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.srw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.srw__segments,
.srw__user-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srw__user-strip {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.srw__filters-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.srw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.srw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.srw__text-input,
.srw__select {
	min-block-size: 44px;
	inline-size: 100%;
	min-inline-size: 0;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
}

.srw__summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.srw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.srw__kpi-card.is-safe {
	border-inline-start: 4px solid #198754;
}

.srw__kpi-card.is-warn {
	border-inline-start: 4px solid #b45309;
}

.srw__kpi-card.is-danger {
	border-inline-start: 4px solid #b91c1c;
}

.srw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.srw__kpi-value {
	font-size: 1.12rem;
	font-weight: 700;
}

.srw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.srw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
}

.srw__notice.is-success {
	border-color: #198754;
	background-color: var(--color-background-hover);
}

.srw__notice.is-error {
	border-color: #b91c1c;
	color: #b91c1c;
	background-color: var(--color-background-hover);
}

.srw__global-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.srw__global-bar-text {
	font-size: 0.88rem;
	font-weight: 600;
}

.srw__no-matches {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding-block: 18px;
	padding-inline: 14px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.srw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.srw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.srw__group-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-inline-size: 0;
}

.srw__group-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srw__group-card.is-active {
	border-color: var(--color-primary-element, #006aa3);
	box-shadow: 0 0 0 1px var(--color-primary-element, #006aa3);
}

.srw__group-card.is-category-files_versions {
	border-inline-start: 4px solid #006aa3;
}

.srw__group-card.is-category-files_trashbin {
	border-inline-start: 4px solid #b45309;
}

.srw__group-card.is-category-appdata,
.srw__group-card.is-category-mixed_shadow {
	border-inline-start: 4px solid #b91c1c;
}

.srw__group-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.srw__group-stats {
	font-size: 0.82rem;
	font-weight: 700;
}

.srw__group-name {
	font-size: 0.95rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.srw__group-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.srw__group-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srw__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 14px;
	padding-inline: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.srw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.srw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.srw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.srw__inspector-meta {
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.srw__copies-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.srw__copy-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srw__copy-card.is-status-survivor,
.srw__copy-card.is-status-shadow-reclaimable {
	border-inline-start: 4px solid #198754;
}

.srw__copy-card.is-status-retention-hold,
.srw__copy-card.is-status-live-redundant {
	border-inline-start: 4px solid #b45309;
}

.srw__copy-card.is-status-protected-origin,
.srw__copy-card.is-status-locked-file {
	border-inline-start: 4px solid #b91c1c;
}

.srw__copy-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.srw__copy-bytes {
	font-size: 0.82rem;
	font-weight: 700;
}

.srw__copy-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.srw__telemetry-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srw__tag,
.srw__verdict-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.74rem;
	font-weight: 700;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.srw__tag.is-danger,
.srw__verdict-pill.is-protected-origin,
.srw__verdict-pill.is-locked-file,
.srw__verdict-pill.is-appdata {
	border-color: #b91c1c;
	color: #b91c1c;
}

.srw__tag.is-warn,
.srw__verdict-pill.is-files_trashbin,
.srw__verdict-pill.is-retention-hold,
.srw__verdict-pill.is-mixed_shadow {
	border-color: #b45309;
	color: #92400e;
}

.srw__verdict-pill.is-files_versions {
	border-color: #006aa3;
	color: #005582;
}

.srw__verdict-pill.is-survivor,
.srw__verdict-pill.is-shadow-reclaimable {
	border-color: #198754;
	color: #146c43;
}

.srw__copy-reason {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.srw__copy-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srw__script-panel {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.srw__script-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.srw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.srw__code-preview {
	margin: 0;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.76rem;
	line-height: 1.45;
	max-block-size: 200px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.srw__load-more-wrap {
	display: flex;
	justify-content: center;
}

.srw__dialog {
	max-inline-size: min(92vw, 480px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.srw__dialog-inner {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 18px;
	padding-inline: 18px;
}

.srw__dialog-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.srw__dialog-body {
	margin: 0;
	font-size: 0.9rem;
}

.srw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
