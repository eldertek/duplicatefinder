<template>
	<section
		class="retention-age-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Retention Age, Cold-Storage & Stale Artifact Pruner Workbench')">
		<header class="retention-wb__toolbar">
			<div class="retention-wb__title-group">
				<h3 class="retention-wb__title">
					{{ t('duplicatefinder', 'Retention Age & Cold-Storage Pruner') }}
				</h3>
				<span
					class="retention-wb__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} stale candidates ({size}) at {days}d cutoff', {
						count: catalog.summary.staleCandidateCount,
						size: catalog.summary.staleCandidateBytesFormatted,
						days: catalog.summary.retentionDays,
					}) }}
				</span>
			</div>

			<div class="retention-wb__toolbar-actions">
				<button
					type="button"
					class="retention-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="retention-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="retention-wb__tool-btn is-close"
					aria-keyshortcuts="9"
					:title="t('duplicatefinder', 'Hide retention age and cold-storage pruner workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide retention') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="retention-wb__empty">
			<p class="retention-wb__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="retention-wb__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to analyze file age tiers, cold-storage folders, stale installers, build caches, and redundant old copies.') }}
			</p>
			<button
				type="button"
				class="retention-wb__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="retention-wb__controls">
				<div class="retention-wb__control-row">
					<span class="retention-wb__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="retention-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Retention inspection scope')">
						<button
							type="button"
							class="retention-wb__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="retention-wb__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="retention-wb__field">
						<span class="retention-wb__control-label">{{ t('duplicatefinder', 'Policy') }}</span>
						<select
							v-model="policyMode"
							class="retention-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Retention pruning policy mode')">
							<option value="stale-redundant">{{ t('duplicatefinder', 'Redundant older copies') }}</option>
							<option value="stale-artifacts">{{ t('duplicatefinder', 'Stale installers, caches & backups') }}</option>
							<option value="cold-archives">{{ t('duplicatefinder', 'Cold archive copies (1y+)') }}</option>
						</select>
					</label>

					<label class="retention-wb__field">
						<span class="retention-wb__control-label">{{ t('duplicatefinder', 'Sort by') }}</span>
						<select
							v-model="sortBy"
							class="retention-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort retention candidates')">
							<option value="roi_desc">{{ t('duplicatefinder', 'Cold-Storage ROI (highest first)') }}</option>
							<option value="age_desc">{{ t('duplicatefinder', 'File age (oldest first)') }}</option>
							<option value="size_desc">{{ t('duplicatefinder', 'Size (largest first)') }}</option>
							<option value="group_span_desc">{{ t('duplicatefinder', 'Group age span (widest first)') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="retention-wb__field is-grow">
						<span class="retention-wb__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="retention-wb__search-input"
							:placeholder="t('duplicatefinder', 'Search filename, folder, or artifact...')"
							:aria-label="t('duplicatefinder', 'Search retention findings')"
							:disabled="isDeleting">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="retention-wb__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>

				<div class="retention-wb__cutoff-row">
					<span class="retention-wb__control-label">
						{{ t('duplicatefinder', 'Retention cutoff') }}
					</span>
					<div
						class="retention-wb__preset-group"
						role="group"
						:aria-label="t('duplicatefinder', 'Retention day presets')">
						<button
							v-for="preset in retentionPresetOptions"
							:key="preset.days"
							type="button"
							class="retention-wb__pill-btn"
							:class="{ 'is-active': Number(retentionDays) === preset.days }"
							:aria-pressed="Number(retentionDays) === preset.days ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="applyPresetDays(preset.days)">
							<span>{{ preset.label }}</span>
						</button>
					</div>
					<label class="retention-wb__days-field">
						<span class="retention-wb__control-label">{{ t('duplicatefinder', 'Custom days') }}</span>
						<input
							:value="retentionDaysDraft"
							type="text"
							inputmode="numeric"
							class="retention-wb__days-input"
							:aria-label="t('duplicatefinder', 'Custom retention threshold in days')"
							:disabled="isDeleting"
							@input="onRetentionDaysInput"
							@blur="commitRetentionDaysDraft">
					</label>
				</div>

				<div class="retention-wb__kpis">
					<div class="retention-wb__kpi">
						<span class="retention-wb__kpi-label">{{ t('duplicatefinder', 'Prune candidates') }}</span>
						<strong class="retention-wb__kpi-value">
							{{ catalog.summary.staleCandidateCount }} ({{ catalog.summary.staleCandidateBytesFormatted }})
						</strong>
					</div>
					<div class="retention-wb__kpi">
						<span class="retention-wb__kpi-label">{{ t('duplicatefinder', 'Cold storage (1y+)') }}</span>
						<strong class="retention-wb__kpi-value">
							{{ catalog.summary.coldFileCount }} ({{ catalog.summary.coldBytesFormatted }})
						</strong>
					</div>
					<div class="retention-wb__kpi">
						<span class="retention-wb__kpi-label">{{ t('duplicatefinder', 'Installers & ISOs') }}</span>
						<strong class="retention-wb__kpi-value">
							{{ catalog.summary.installerCount }} ({{ catalog.summary.installerBytesFormatted }})
						</strong>
					</div>
					<div class="retention-wb__kpi">
						<span class="retention-wb__kpi-label">{{ t('duplicatefinder', 'Caches & backups') }}</span>
						<strong class="retention-wb__kpi-value">
							{{ catalog.summary.cacheCount + catalog.summary.backupCount }} ({{ cachesAndBackupsFormatted }})
						</strong>
					</div>
				</div>

				<div class="retention-wb__analytics-grid">
					<div class="retention-wb__panel-card">
						<div class="retention-wb__panel-head">
							<h4 class="retention-wb__sub-title">
								{{ t('duplicatefinder', 'File Age Distribution (Click tier to filter)') }}
							</h4>
							<button
								v-if="ageTierFilter !== 'all'"
								type="button"
								class="retention-wb__mini-btn"
								@click="ageTierFilter = 'all'">
								<span>{{ t('duplicatefinder', 'All ages') }}</span>
							</button>
						</div>
						<div
							class="retention-wb__tier-bars"
							role="group"
							:aria-label="t('duplicatefinder', 'Age distribution breakdown')">
							<button
								v-for="tier in catalog.ageDistribution"
								:key="tier.id"
								type="button"
								class="retention-wb__tier-btn"
								:class="{
									'is-active': ageTierFilter === tier.id,
									'is-empty': tier.count === 0,
								}"
								:aria-pressed="ageTierFilter === tier.id ? 'true' : 'false'"
								:disabled="tier.count === 0 && ageTierFilter !== tier.id"
								@click="toggleAgeTierFilter(tier.id)">
								<span class="retention-wb__tier-top">
									<span class="retention-wb__tier-name">{{ formatAgeTierLabel(tier.id) }}</span>
									<span class="retention-wb__tier-meta">
										{{ tier.count }} / {{ tier.bytesFormatted }} ({{ tier.sharePct }}%)
									</span>
								</span>
								<span class="retention-wb__tier-track" aria-hidden="true">
									<span
										class="retention-wb__tier-fill"
										:class="'is-sev-' + tier.severity"
										:style="{ width: Math.max(tier.count > 0 ? 4 : 0, tier.sharePct) + '%' }" />
								</span>
							</button>
						</div>
					</div>

					<div class="retention-wb__panel-card">
						<div class="retention-wb__panel-head">
							<h4 class="retention-wb__sub-title">
								{{ t('duplicatefinder', 'Cold-Storage Folder Hotspots') }}
							</h4>
							<button
								v-if="folderFilter"
								type="button"
								class="retention-wb__mini-btn"
								@click="folderFilter = ''">
								<span>{{ t('duplicatefinder', 'All folders') }}</span>
							</button>
						</div>
						<p v-if="catalog.folderLeaderboard.length === 0" class="retention-wb__muted-note">
							{{ t('duplicatefinder', 'No folder hotspots computed yet.') }}
						</p>
						<div
							v-else
							class="retention-wb__folder-list"
							role="group"
							:aria-label="t('duplicatefinder', 'Cold-storage folder hotspots')">
							<button
								v-for="folder in catalog.folderLeaderboard"
								:key="folder.folder"
								type="button"
								class="retention-wb__folder-btn"
								:class="{ 'is-active': folderFilter === folder.folder }"
								:aria-pressed="folderFilter === folder.folder ? 'true' : 'false'"
								@click="toggleFolderFilter(folder.folder)">
								<span class="retention-wb__folder-path">{{ folder.folder }}</span>
								<span class="retention-wb__folder-stats">
									{{ t('duplicatefinder', '{stale} stale / oldest {age}', {
										stale: folder.staleBytesFormatted,
										age: folder.oldestAgeFormatted,
									}) }}
								</span>
							</button>
						</div>
					</div>
				</div>

				<div
					class="retention-wb__filter-pills"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter by retention verdict or artifact kind')">
					<button
						v-for="pill in filterOptions"
						:key="pill.id"
						type="button"
						class="retention-wb__pill-btn"
						:class="{ 'is-active': filterMode === pill.id }"
						:aria-pressed="filterMode === pill.id ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="filterMode = pill.id">
						<span>{{ pill.label }}</span>
					</button>
				</div>
			</div>

			<p
				v-if="statusNotice"
				class="retention-wb__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</p>

			<div v-if="catalog.items.length === 0" class="retention-wb__filtered-empty">
				<p>{{ t('duplicatefinder', 'No files match the active retention policy filter.') }}</p>
				<button
					type="button"
					class="retention-wb__mini-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div v-else class="retention-wb__split">
				<div
					class="retention-wb__roster"
					role="list"
					:aria-label="t('duplicatefinder', 'Retention candidates and aged copies')">
					<article
						v-for="item in catalog.items"
						:key="item.key"
						role="listitem"
						class="retention-wb__item-card"
						:class="{
							'is-active': activeItem && activeItem.key === item.key,
							'is-selected': selectedDeleteKeys.includes(item.key),
						}">
						<div class="retention-wb__item-top">
							<label class="retention-wb__check-label">
								<input
									type="checkbox"
									class="retention-wb__checkbox"
									:checked="selectedDeleteKeys.includes(item.key)"
									:disabled="!item.deletable || isDeleting"
									:aria-label="t('duplicatefinder', 'Select {name} for retention pruning', { name: item.name })"
									@change="toggleFileSelection(item.key)">
							</label>

							<button
								type="button"
								class="retention-wb__item-select-btn"
								:aria-pressed="activeItem && activeItem.key === item.key ? 'true' : 'false'"
								@click="selectItem(item)">
								<span class="retention-wb__item-head">
									<strong class="retention-wb__item-name">{{ item.name }}</strong>
									<span class="retention-wb__item-size">{{ item.sizeFormatted }}</span>
								</span>
								<span class="retention-wb__item-path">{{ item.path || item.folder }}</span>
								<span class="retention-wb__item-badges">
									<span
										class="retention-wb__badge"
										:class="'is-sev-' + item.ageTier.severity">
										{{ formatAgeTierLabel(item.ageTier.id) }} ({{ item.ageFormatted }})
									</span>
									<span
										v-if="item.artifact.kind !== 'standard'"
										class="retention-wb__badge is-artifact">
										{{ formatArtifactKindLabel(item.artifact.kind) }}
									</span>
									<span
										class="retention-wb__badge"
										:class="verdictBadgeClass(item)">
										{{ formatVerdictLabel(item.verdict) }}
									</span>
									<span class="retention-wb__badge is-roi">
										{{ t('duplicatefinder', 'ROI {score}', { score: item.coldRoiScore }) }}
									</span>
								</span>
							</button>
						</div>
					</article>
				</div>

				<div v-if="activeItem" class="retention-wb__inspector">
					<header class="retention-wb__inspector-header">
						<div class="retention-wb__inspector-title-wrap">
							<h4 class="retention-wb__inspector-title">
								{{ activeItem.name }}
							</h4>
							<p class="retention-wb__inspector-sub">
								{{ activeItem.path || activeItem.folder }}
							</p>
						</div>
						<div class="retention-wb__inspector-actions">
							<button
								type="button"
								class="retention-wb__mini-btn"
								@click="focusInMainView(activeItem)">
								<span>{{ t('duplicatefinder', 'Focus in list') }}</span>
							</button>
							<button
								type="button"
								class="retention-wb__mini-btn"
								@click="openSideBySideCompare(activeItem)">
								<span>{{ t('duplicatefinder', 'Side-by-side compare') }}</span>
							</button>
						</div>
					</header>

					<div class="retention-wb__telemetry-grid">
						<div class="retention-wb__metric-box">
							<span class="retention-wb__metric-label">{{ t('duplicatefinder', 'Retention verdict') }}</span>
							<strong class="retention-wb__metric-value">{{ formatVerdictLabel(activeItem.verdict) }}</strong>
							<span class="retention-wb__metric-sub">{{ activeItem.verdictReason }}</span>
						</div>
						<div class="retention-wb__metric-box">
							<span class="retention-wb__metric-label">{{ t('duplicatefinder', 'Age & last modified') }}</span>
							<strong class="retention-wb__metric-value">{{ activeItem.ageFormatted }}</strong>
							<span class="retention-wb__metric-sub">
								{{ activeItem.mtimeIso || t('duplicatefinder', 'Timestamp unavailable') }}
							</span>
						</div>
						<div class="retention-wb__metric-box">
							<span class="retention-wb__metric-label">{{ t('duplicatefinder', 'Cold-Storage ROI') }}</span>
							<strong class="retention-wb__metric-value">{{ activeItem.coldRoiScore }}/100</strong>
							<div
								class="retention-wb__meter-track"
								role="progressbar"
								:aria-valuenow="activeItem.coldRoiScore"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="retention-wb__meter-fill"
									:class="'is-sev-' + activeItem.ageTier.severity"
									:style="{ width: activeItem.coldRoiScore + '%' }" />
							</div>
						</div>
					</div>

					<div class="retention-wb__siblings-card">
						<h5 class="retention-wb__sub-title">
							{{ t('duplicatefinder', 'Group Age Lineage ({count} copies, {span}d span)', {
								count: activeItem.siblings.length,
								span: activeItem.groupSpanDays,
							}) }}
						</h5>
						<ul class="retention-wb__siblings-list">
							<li
								v-for="sib in activeItem.siblings"
								:key="sib.key"
								class="retention-wb__sibling-row"
								:class="{ 'is-current': sib.isCurrent }">
								<span class="retention-wb__sibling-name">{{ sib.path || sib.name }}</span>
								<span class="retention-wb__sibling-meta">
									<span>{{ sib.sizeFormatted }}</span>
									<span>{{ sib.ageFormatted }}</span>
									<span
										v-if="sib.isNewestInGroup"
										class="retention-wb__badge is-safe">
										{{ t('duplicatefinder', 'Newest') }}
									</span>
									<span
										v-if="sib.isProtected"
										class="retention-wb__badge is-protected">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
									<span
										v-else-if="sib.pruneRecommended"
										class="retention-wb__badge is-prune">
										{{ t('duplicatefinder', 'Prune') }}
									</span>
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>

			<footer class="retention-wb__bulk-bar">
				<div class="retention-wb__bulk-summary">
					<strong>{{ t('duplicatefinder', '{count} files selected ({size})', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}</strong>
					<label class="retention-wb__guard-toggle">
						<input
							v-model="allowLastCopyArtifact"
							type="checkbox"
							class="retention-wb__checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Allow last-copy pruning for stale installers, caches & backups') }}</span>
					</label>
				</div>
				<div class="retention-wb__bulk-actions">
					<button
						type="button"
						class="retention-wb__tool-btn"
						:disabled="isDeleting || catalog.summary.staleCandidateCount === 0"
						@click="selectPolicyCandidates">
						<span>{{ t('duplicatefinder', 'Select policy candidates') }}</span>
					</button>
					<button
						type="button"
						class="retention-wb__tool-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="clearSelection">
						<span>{{ t('duplicatefinder', 'Clear selection') }}</span>
					</button>
					<button
						type="button"
						class="retention-wb__danger-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="openDeleteDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Pruning...')
							: t('duplicatefinder', 'Prune selected') }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="retentionDeleteDialog"
			class="retention-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm retention pruning deletion')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="retention-confirm-dialog__content">
				<h4 class="retention-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Retention & Cold-Storage Pruning') }}
				</h4>
				<p class="retention-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to delete {count} stale or cold duplicate files ({size}) from Nextcloud storage.', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}
				</p>
				<p v-if="selectedLastCopyCount > 0" class="retention-confirm-dialog__warning">
					{{ t('duplicatefinder', 'Warning: {count} selected disposable artifacts have no surviving sibling in their group.', {
						count: selectedLastCopyCount,
					}) }}
				</p>
				<div class="retention-confirm-dialog__actions">
					<button
						type="button"
						class="retention-wb__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="retention-wb__danger-btn"
						:disabled="isDeleting"
						@click="confirmBatchDelete">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Pruning...')
							: t('duplicatefinder', 'Confirm prune') }}</span>
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
	buildRetentionCatalog,
	DEFAULT_RETENTION_DAYS,
	exportRetentionCsv,
	exportRetentionManifestJson,
	loadRetentionPreferences,
	normalizeRetentionDays,
	RETENTION_PRESET_DAYS,
	saveRetentionPreferences,
	selectPolicyPruneKeys,
} from '../tools/retentionAgePruner'

export default {
	name: 'RetentionAgeWorkbench',
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
			type: [String, Number],
			default: null,
		},
	},
	data() {
		const prefs = loadRetentionPreferences()
		return {
			scope: 'filtered',
			policyMode: prefs.policyMode || 'stale-redundant',
			retentionDays: prefs.retentionDays || DEFAULT_RETENTION_DAYS,
			retentionDaysDraft: String(prefs.retentionDays || DEFAULT_RETENTION_DAYS),
			filterMode: 'all',
			ageTierFilter: 'all',
			folderFilter: '',
			sortBy: 'roi_desc',
			searchQuery: '',
			selectedItemKey: '',
			selectedDeleteKeys: [],
			allowLastCopyArtifact: false,
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeDuplicates() {
			return this.scope === 'all' ? this.allDuplicates : this.duplicates
		},
		retentionPresetOptions() {
			return RETENTION_PRESET_DAYS.map(days => ({
				days,
				label: days >= 365
					? this.t('duplicatefinder', '{years}y', { years: Math.round(days / 365) })
					: this.t('duplicatefinder', '{days}d', { days }),
			}))
		},
		hasActiveFilters() {
			return this.filterMode !== 'all'
				|| this.ageTierFilter !== 'all'
				|| this.folderFilter !== ''
				|| this.sortBy !== 'roi_desc'
				|| this.searchQuery.trim() !== ''
		},
		catalog() {
			return buildRetentionCatalog(this.activeDuplicates, {
				retentionDays: this.retentionDays,
				policyMode: this.policyMode,
				allowLastCopyArtifact: this.allowLastCopyArtifact,
				filter: this.filterMode,
				ageTierFilter: this.ageTierFilter,
				folderFilter: this.folderFilter,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		cachesAndBackupsFormatted() {
			const total = (this.catalog.summary.cacheBytes || 0) + (this.catalog.summary.backupBytes || 0)
			return formatBytes(total)
		},
		filterOptions() {
			const s = this.catalog.summary
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: s.totalFiles }) },
				{ id: 'prune-recommended', label: this.t('duplicatefinder', 'Prune candidates ({count})', { count: s.staleCandidateCount }) },
				{ id: 'cold-plus', label: this.t('duplicatefinder', 'Cold 1y+ ({count})', { count: s.coldFileCount }) },
				{ id: 'stale-installers', label: this.t('duplicatefinder', 'Installers & ISOs ({count})', { count: s.installerCount }) },
				{ id: 'build-caches', label: this.t('duplicatefinder', 'Build caches ({count})', { count: s.cacheCount }) },
				{ id: 'stale-backups', label: this.t('duplicatefinder', 'Backups ({count})', { count: s.backupCount }) },
				{ id: 'protected', label: this.t('duplicatefinder', 'Protected / Survivors') },
				{ id: 'unknown-age', label: this.t('duplicatefinder', 'Unknown age ({count})', { count: s.unknownAgeCount }) },
			]
		},
		itemByKeyMap() {
			const map = new Map()
			for (const item of this.catalog.allItems) {
				map.set(item.key, item)
			}
			return map
		},
		activeItem() {
			if (this.catalog.items.length === 0) {
				return null
			}
			const found = this.catalog.items.find(item => item.key === this.selectedItemKey)
			return found || this.catalog.items[0]
		},
		selectedDeleteItems() {
			const out = []
			for (const key of this.selectedDeleteKeys) {
				const item = this.itemByKeyMap.get(key)
				if (item && item.deletable) {
					out.push(item)
				}
			}
			return out
		},
		selectedDeleteSizeFormatted() {
			const bytes = this.selectedDeleteItems.reduce((sum, item) => sum + item.size, 0)
			return formatBytes(bytes)
		},
		selectedLastCopyCount() {
			return this.selectedDeleteItems.filter(item => !item.hasProtectedSurvivor && item.groupFileCount <= 1).length
		},
	},
	watch: {
		catalog: {
			immediate: true,
			handler(nextCatalog) {
				if (!nextCatalog || !Array.isArray(nextCatalog.items) || nextCatalog.items.length === 0) {
					this.selectedItemKey = ''
					return
				}
				const exists = nextCatalog.items.some(item => item.key === this.selectedItemKey)
				if (!exists) {
					this.selectedItemKey = nextCatalog.items[0].key
				}
			},
		},
		policyMode() {
			this.persistPreferences()
		},
		retentionDays() {
			this.persistPreferences()
		},
	},
	methods: {
		t(app, text, vars) {
			if (typeof window !== 'undefined' && typeof window.t === 'function') {
				return window.t(app, text, vars)
			}
			if (!vars || typeof vars !== 'object') {
				return text
			}
			return text.replace(/\{(\w+)\}/g, (match, key) => (
				Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
			))
		},
		persistPreferences() {
			saveRetentionPreferences({
				retentionDays: this.retentionDays,
				policyMode: this.policyMode,
			})
		},
		applyPresetDays(days) {
			const normalized = normalizeRetentionDays(days)
			this.retentionDays = normalized
			this.retentionDaysDraft = String(normalized)
		},
		onRetentionDaysInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			// Never clamp or overwrite the user's draft mid-keystroke
			this.retentionDaysDraft = raw
			if (/^\d+$/.test(raw.trim())) {
				const parsed = Number(raw.trim())
				if (parsed >= 1 && parsed <= 36500) {
					this.retentionDays = parsed
				}
			}
		},
		commitRetentionDaysDraft() {
			const normalized = normalizeRetentionDays(this.retentionDaysDraft)
			this.retentionDays = normalized
			this.retentionDaysDraft = String(normalized)
		},
		toggleAgeTierFilter(tierId) {
			this.ageTierFilter = this.ageTierFilter === tierId ? 'all' : tierId
		},
		toggleFolderFilter(folderPath) {
			this.folderFilter = this.folderFilter === folderPath ? '' : folderPath
		},
		formatAgeTierLabel(tierId) {
			const labels = {
				fresh: this.t('duplicatefinder', 'Fresh (<7d)'),
				recent: this.t('duplicatefinder', 'Recent (7-30d)'),
				quarter: this.t('duplicatefinder', 'Quarter (30-90d)'),
				aging: this.t('duplicatefinder', 'Aging (90d-1y)'),
				cold: this.t('duplicatefinder', 'Cold (1-3y)'),
				ancient: this.t('duplicatefinder', 'Ancient (3y+)'),
				unknown: this.t('duplicatefinder', 'Unknown age'),
			}
			return labels[tierId] || tierId
		},
		formatArtifactKindLabel(kind) {
			const labels = {
				'installer-image': this.t('duplicatefinder', 'Installer / ISO'),
				'build-cache': this.t('duplicatefinder', 'Build cache'),
				'backup-snapshot': this.t('duplicatefinder', 'Backup / Dump'),
			}
			return labels[kind] || kind
		},
		formatVerdictLabel(verdict) {
			const labels = {
				'prune-recommended': this.t('duplicatefinder', 'Prune recommended'),
				'protected-origin': this.t('duplicatefinder', 'Protected origin'),
				'protected-locked': this.t('duplicatefinder', 'Locked'),
				'keep-newest': this.t('duplicatefinder', 'Keep newest'),
				'keep-survivor': this.t('duplicatefinder', 'Keep survivor'),
				'below-threshold': this.t('duplicatefinder', 'Within cutoff'),
				'unknown-age': this.t('duplicatefinder', 'Unknown age'),
			}
			return labels[verdict] || verdict
		},
		verdictBadgeClass(item) {
			if (item.pruneRecommended) {
				return 'is-prune'
			}
			if (item.isProtectedOrigin || item.isLocked) {
				return 'is-protected'
			}
			if (item.verdict === 'keep-newest' || item.verdict === 'keep-survivor') {
				return 'is-safe'
			}
			return 'is-neutral'
		},
		resetFilters() {
			this.filterMode = 'all'
			this.ageTierFilter = 'all'
			this.folderFilter = ''
			this.sortBy = 'roi_desc'
			this.searchQuery = ''
		},
		selectItem(item) {
			if (item && item.key) {
				this.selectedItemKey = item.key
			}
		},
		toggleFileSelection(fileKey) {
			if (!this.itemByKeyMap.has(fileKey)) {
				return
			}
			if (this.selectedDeleteKeys.includes(fileKey)) {
				this.selectedDeleteKeys = this.selectedDeleteKeys.filter(k => k !== fileKey)
			} else {
				this.selectedDeleteKeys = [...this.selectedDeleteKeys, fileKey]
			}
		},
		selectPolicyCandidates() {
			const keys = selectPolicyPruneKeys(this.catalog)
			this.selectedDeleteKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} stale retention candidates.', {
				count: keys.length,
			})
		},
		clearSelection() {
			this.selectedDeleteKeys = []
		},
		focusInMainView(item) {
			if (!item) {
				return
			}
			const match = this.activeDuplicates.find(group => group && (group.id === item.groupId || group.hash === item.groupHash))
			if (match) {
				this.$emit('select-duplicate', match)
			}
		},
		openSideBySideCompare(item) {
			if (!item) {
				return
			}
			const match = this.activeDuplicates.find(group => group && (group.id === item.groupId || group.hash === item.groupHash))
			if (match) {
				this.$emit('compare-duplicate', match)
			}
		},
		openDeleteDialog() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.retentionDeleteDialog
			if (!dialog) {
				return
			}
			if (typeof dialog.showModal === 'function') {
				if (!dialog.open) {
					dialog.showModal()
				}
			} else {
				dialog.setAttribute('open', '')
			}
		},
		closeDeleteDialog() {
			const dialog = this.$refs.retentionDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function') {
					if (dialog.open) {
						dialog.close()
					}
				} else {
					dialog.removeAttribute('open')
				}
			}
			this.restoreFocusAfterDialog()
		},
		onDeleteDialogClose() {
			this.restoreFocusAfterDialog()
		},
		onDeleteDialogBackdropClick(event) {
			if (event && event.target === this.$refs.retentionDeleteDialog && !this.isDeleting) {
				this.closeDeleteDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function') {
				prev.focus()
			}
		},
		async confirmBatchDelete() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const filesPayload = this.selectedDeleteItems.map(item => ({
					id: item.file.id,
					nodeId: item.file.nodeId || item.file.id,
					path: item.file.path || item.path,
					name: item.name,
					size: item.size,
					fileHash: item.groupHash || item.file.fileHash || '',
				}))
				const result = await deleteFiles(filesPayload, {
					allowLastCopy: this.allowLastCopyArtifact,
				})
				const deletedSuccess = Array.isArray(result?.success) ? result.success : filesPayload
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds)
					? result.deletedNodeIds
					: deletedSuccess.map(f => f.nodeId || f.id).filter(Boolean)
				const bytesReclaimed = deletedSuccess.reduce((sum, f) => sum + (Number(f.size) || 0), 0)

				this.selectedDeleteKeys = []
				this.closeDeleteDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Pruned {count} stale/cold files ({size} reclaimed).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('retention-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: 1,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeDeleteDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not prune selected retention candidates.')
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
		exportManifestJson() {
			const json = exportRetentionManifestJson(this.catalog)
			this.triggerDownload('duplicatefinder-retention-audit.json', json, 'application/json;charset=utf-8')
		},
		exportAuditCsv() {
			const csv = exportRetentionCsv(this.catalog)
			this.triggerDownload('duplicatefinder-retention-audit.csv', csv, 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style lang="scss" scoped>
.retention-age-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-block: 12px 18px;
	margin-inline: 0;
	padding-block: 16px;
	padding-inline: 18px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.retention-wb__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.retention-wb__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.retention-wb__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.retention-wb__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.retention-wb__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.retention-wb__tool-btn,
.retention-wb__seg-btn,
.retention-wb__pill-btn,
.retention-wb__mini-btn,
.retention-wb__primary-btn,
.retention-wb__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	padding-block: 6px;
	padding-inline: 12px;
	min-block-size: 34px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.retention-wb__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.retention-wb__danger-btn {
	background-color: #b91c1c;
	border-color: #b91c1c;
	color: #ffffff;
}

.retention-wb__seg-btn.is-active,
.retention-wb__pill-btn.is-active,
.retention-wb__tier-btn.is-active,
.retention-wb__folder-btn.is-active {
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.14));
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-main-text);
}

.retention-wb__tool-btn:disabled,
.retention-wb__seg-btn:disabled,
.retention-wb__pill-btn:disabled,
.retention-wb__mini-btn:disabled,
.retention-wb__primary-btn:disabled,
.retention-wb__danger-btn:disabled,
.retention-wb__tier-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.retention-wb__tool-btn:focus-visible,
.retention-wb__seg-btn:focus-visible,
.retention-wb__pill-btn:focus-visible,
.retention-wb__mini-btn:focus-visible,
.retention-wb__primary-btn:focus-visible,
.retention-wb__danger-btn:focus-visible,
.retention-wb__select:focus-visible,
.retention-wb__search-input:focus-visible,
.retention-wb__days-input:focus-visible,
.retention-wb__checkbox:focus-visible,
.retention-wb__item-select-btn:focus-visible,
.retention-wb__tier-btn:focus-visible,
.retention-wb__folder-btn:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.retention-wb__empty,
.retention-wb__filtered-empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 18px;
	padding-inline: 16px;
	border-radius: var(--border-radius, 4px);
	border: 1px dashed var(--color-border);
	background-color: var(--color-background-hover);
}

.retention-wb__empty-title {
	margin: 0;
	font-weight: 700;
}

.retention-wb__empty-hint,
.retention-wb__muted-note {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.retention-wb__controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.retention-wb__control-row,
.retention-wb__cutoff-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.retention-wb__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.retention-wb__segments,
.retention-wb__preset-group {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.retention-wb__field,
.retention-wb__days-field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.retention-wb__field.is-grow {
	flex: 1 1 220px;
}

.retention-wb__select,
.retention-wb__search-input,
.retention-wb__days-input {
	min-block-size: 34px;
	padding-block: 5px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	box-sizing: border-box;
	min-inline-size: 0;
}

.retention-wb__search-input {
	inline-size: 100%;
}

.retention-wb__days-input {
	inline-size: 82px;
	font-variant-numeric: tabular-nums;
}

.retention-wb__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.retention-wb__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.retention-wb__kpi-label {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.retention-wb__kpi-value {
	font-size: 0.94rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.retention-wb__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.retention-wb__panel-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.retention-wb__panel-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.retention-wb__sub-title {
	margin: 0;
	font-size: 0.84rem;
	font-weight: 700;
}

.retention-wb__tier-bars,
.retention-wb__folder-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.retention-wb__tier-btn,
.retention-wb__folder-btn {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.retention-wb__tier-btn.is-empty {
	opacity: 0.5;
}

.retention-wb__tier-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.78rem;
}

.retention-wb__tier-name {
	font-weight: 700;
}

.retention-wb__tier-meta {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.retention-wb__tier-track,
.retention-wb__meter-track {
	inline-size: 100%;
	block-size: 7px;
	border-radius: 999px;
	background-color: var(--color-background-dark, var(--color-background-hover));
	overflow: hidden;
}

.retention-wb__tier-fill,
.retention-wb__meter-fill {
	display: block;
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
	transition: width 0.2s ease;
}

.retention-wb__tier-fill.is-sev-ok,
.retention-wb__meter-fill.is-sev-ok {
	background-color: #15803d;
}

.retention-wb__tier-fill.is-sev-medium,
.retention-wb__meter-fill.is-sev-medium {
	background-color: #b45309;
}

.retention-wb__tier-fill.is-sev-high,
.retention-wb__meter-fill.is-sev-high {
	background-color: #c2410c;
}

.retention-wb__tier-fill.is-sev-critical,
.retention-wb__meter-fill.is-sev-critical {
	background-color: #b91c1c;
}

.retention-wb__folder-btn {
	flex-direction: row;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.retention-wb__folder-path {
	font-size: 0.8rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.retention-wb__folder-stats {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.retention-wb__filter-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.retention-wb__notice {
	margin: 0;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.1));
	font-size: 0.85rem;
	font-weight: 600;
}

.retention-wb__notice.is-error {
	border-color: #b91c1c;
	background-color: rgba(185, 28, 28, 0.1);
	color: #991b1b;
}

.retention-wb__split {
	display: grid;
	grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.25fr);
	gap: 14px;
	align-items: start;
}

.retention-wb__roster {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 520px;
	overflow-y: auto;
	padding-inline-end: 2px;
	min-inline-size: 0;
}

.retention-wb__item-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.retention-wb__item-card.is-active {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.08));
}

.retention-wb__item-card.is-selected {
	box-shadow: inset 3px 0 0 #b91c1c;
}

.retention-wb__item-top {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	min-inline-size: 0;
}

.retention-wb__check-label {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 28px;
	min-inline-size: 28px;
	cursor: pointer;
}

.retention-wb__item-select-btn {
	flex: 1 1 auto;
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0;
	border: 0;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.retention-wb__item-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
}

.retention-wb__item-name {
	font-size: 0.88rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.retention-wb__item-size {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.retention-wb__item-path {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.retention-wb__item-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.retention-wb__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.72rem;
	font-weight: 600;
}

.retention-wb__badge.is-sev-critical,
.retention-wb__badge.is-prune {
	border-color: #b91c1c;
	color: #991b1b;
}

.retention-wb__badge.is-sev-high,
.retention-wb__badge.is-sev-medium {
	border-color: #b45309;
	color: #92400e;
}

.retention-wb__badge.is-sev-ok,
.retention-wb__badge.is-safe {
	border-color: #15803d;
	color: #166534;
}

.retention-wb__badge.is-protected {
	border-color: #1d4ed8;
	color: #1e40af;
}

.retention-wb__badge.is-artifact {
	border-color: #7c3aed;
	color: #6d28d9;
}

.retention-wb__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.retention-wb__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.retention-wb__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.retention-wb__inspector-title {
	margin: 0 0 4px;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.retention-wb__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.retention-wb__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.retention-wb__telemetry-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.retention-wb__metric-box {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.retention-wb__metric-label {
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.retention-wb__metric-value {
	font-size: 0.9rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.retention-wb__metric-sub {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.retention-wb__siblings-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.retention-wb__siblings-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.retention-wb__sibling-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	font-size: 0.8rem;
}

.retention-wb__sibling-row.is-current {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.08));
}

.retention-wb__sibling-name {
	font-weight: 600;
	overflow-wrap: anywhere;
}

.retention-wb__sibling-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.retention-wb__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.retention-wb__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	font-size: 0.88rem;
}

.retention-wb__guard-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	cursor: pointer;
}

.retention-wb__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.retention-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.retention-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.retention-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.retention-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.retention-confirm-dialog__body,
.retention-confirm-dialog__warning {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.retention-confirm-dialog__warning {
	color: #b45309;
	font-weight: 600;
}

.retention-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.retention-wb__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.retention-wb__analytics-grid,
	.retention-wb__split,
	.retention-wb__telemetry-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.retention-age-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.retention-wb__tool-btn,
	.retention-wb__seg-btn,
	.retention-wb__pill-btn,
	.retention-wb__mini-btn,
	.retention-wb__primary-btn,
	.retention-wb__danger-btn,
	.retention-wb__select,
	.retention-wb__search-input,
	.retention-wb__days-input,
	.retention-wb__check-label,
	.retention-wb__guard-toggle,
	.retention-wb__tier-btn,
	.retention-wb__folder-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.retention-wb__field {
		flex: 1 1 100%;
	}

	.retention-wb__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.retention-wb__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
