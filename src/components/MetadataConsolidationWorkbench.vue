<template>
	<section
		class="metadata-consolidation-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Metadata, Tag, Favorite & Share Consolidation Workbench')">
		<header class="mcw__toolbar">
			<div class="mcw__title-group">
				<h3 class="mcw__title">
					{{ t('duplicatefinder', 'Metadata, Tag, Favorite & Share Consolidation') }}
				</h3>
				<span
					class="mcw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{ready} safe ready ({safeSize}) / {pending} pending migrations', {
						ready: report.summary.safeCandidateCount,
						safeSize: report.summary.safeNowFormatted,
						pending: report.summary.pendingMigrationsCount,
					}) }}
				</span>
			</div>

			<div class="mcw__toolbar-actions">
				<button
					type="button"
					class="mcw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportMigrationScript">
					<span>{{ t('duplicatefinder', 'Export Runbook (.sh)') }}</span>
				</button>
				<button
					type="button"
					class="mcw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export Manifest JSON') }}</span>
				</button>
				<button
					type="button"
					class="mcw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvAudit">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="mcw__tool-btn is-close"
					aria-keyshortcuts=","
					:title="t('duplicatefinder', 'Hide metadata consolidation workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Consolidation') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="mcw__empty">
			<p class="mcw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="mcw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect diverged Nextcloud tags, favorites, comments, file versions, and active share links across duplicate copies.') }}
			</p>
			<button
				type="button"
				class="mcw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="mcw__controls">
				<div class="mcw__control-row">
					<span class="mcw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Consolidation duplicate scope')">
						<button
							type="button"
							class="mcw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="mcw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="mcw__control-label">{{ t('duplicatefinder', 'Survivor Strategy') }}</span>
					<div
						class="mcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Survivor priority strategy')">
						<button
							v-for="opt in strategyOptions"
							:key="opt.id"
							type="button"
							class="mcw__seg-btn"
							:class="{ 'is-active': strategy === opt.id }"
							:aria-pressed="strategy === opt.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="strategy = opt.id">
							<span>{{ opt.label }}</span>
						</button>
					</div>
				</div>

				<div class="mcw__control-row">
					<span class="mcw__control-label">{{ t('duplicatefinder', 'Category') }}</span>
					<div
						class="mcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Metadata divergence categories')">
						<button
							v-for="cat in categoryOptions"
							:key="cat.id"
							type="button"
							class="mcw__seg-btn"
							:class="{ 'is-active': category === cat.id }"
							:aria-pressed="category === cat.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="category = cat.id">
							<span>{{ cat.label }} ({{ report.summary.categoryCounts[cat.id] || 0 }})</span>
						</button>
					</div>
				</div>

				<div class="mcw__filters-bar">
					<label class="mcw__field">
						<span class="mcw__field-label">{{ t('duplicatefinder', 'Filter path, tag or owner') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="mcw__text-input"
							:placeholder="t('duplicatefinder', 'Search path, tag, owner...')"
							:disabled="isDeleting">
					</label>

					<label class="mcw__field">
						<span class="mcw__field-label">{{ t('duplicatefinder', 'Sort groups') }}</span>
						<select
							v-model="sortMode"
							class="mcw__select"
							:disabled="isDeleting">
							<option value="risk_desc">
								{{ t('duplicatefinder', 'Metadata risk (highest first)') }}
							</option>
							<option value="reclaim_desc">
								{{ t('duplicatefinder', 'Reclaimable size (largest first)') }}
							</option>
							<option value="divergence_desc">
								{{ t('duplicatefinder', 'Divergence count (most first)') }}
							</option>
							<option value="name_asc">
								{{ t('duplicatefinder', 'Filename (A to Z)') }}
							</option>
						</select>
					</label>

					<label class="mcw__check-label">
						<input
							v-model="protectSharedCopies"
							type="checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Block active shares') }}</span>
					</label>

					<label class="mcw__check-label">
						<input
							v-model="protectFavorites"
							type="checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Hold unmerged favorites') }}</span>
					</label>

					<label class="mcw__check-label">
						<input
							v-model="requireTagMerge"
							type="checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Require tag merge') }}</span>
					</label>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="mcw__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="mcw__kpis">
				<div class="mcw__kpi-card">
					<span class="mcw__kpi-label">{{ t('duplicatefinder', 'Safe Reclaim Ready') }}</span>
					<strong class="mcw__kpi-value">{{ report.summary.safeNowFormatted }}</strong>
					<span class="mcw__kpi-sub">
						{{ t('duplicatefinder', '{count} copies with zero metadata loss', { count: report.summary.safeCandidateCount }) }}
					</span>
				</div>
				<div class="mcw__kpi-card">
					<span class="mcw__kpi-label">{{ t('duplicatefinder', 'Protected / Held') }}</span>
					<strong class="mcw__kpi-value">{{ report.summary.blockedBytesFormatted }}</strong>
					<span class="mcw__kpi-sub">
						{{ t('duplicatefinder', '{shares} share-locked, {migrate} need merge', {
							shares: report.summary.blockedCandidateCount,
							migrate: report.summary.migrateCandidateCount,
						}) }}
					</span>
				</div>
				<div class="mcw__kpi-card">
					<span class="mcw__kpi-label">{{ t('duplicatefinder', 'Pending Migrations') }}</span>
					<strong class="mcw__kpi-value">{{ report.summary.pendingMigrationsCount }}</strong>
					<span class="mcw__kpi-sub">
						{{ t('duplicatefinder', 'Tags, favorites, shares & comments') }}
					</span>
				</div>
				<div class="mcw__kpi-card">
					<span class="mcw__kpi-label">{{ t('duplicatefinder', 'Clean Groups') }}</span>
					<strong class="mcw__kpi-value">
						{{ report.summary.cleanGroupsCount }} / {{ report.summary.totalGroups }}
					</strong>
					<span class="mcw__kpi-sub">
						{{ t('duplicatefinder', 'Total reclaimable: {size}', { size: report.summary.totalReclaimableFormatted }) }}
					</span>
				</div>
			</div>

			<div class="mcw__batch-bar">
				<span class="mcw__batch-summary">
					{{ t('duplicatefinder', 'Showing {shown} of {total} filtered groups', {
						shown: visibleGroups.length,
						total: report.items.length,
					}) }}
				</span>
				<div class="mcw__batch-actions">
					<button
						type="button"
						class="mcw__primary-btn"
						:disabled="globalSafeSelection.files.length === 0 || isDeleting"
						@click="openBatchDeleteDialog(null)">
						<span>{{ t('duplicatefinder', 'Delete {count} Safe Copies ({size})', {
							count: globalSafeSelection.files.length,
							size: globalSafeSelection.totalBytesFormatted,
						}) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="visibleGroups.length === 0"
				class="mcw__no-matches">
				{{ t('duplicatefinder', 'No duplicate groups match the current metadata category or search filter.') }}
			</div>

			<div
				v-else
				class="mcw__groups-list">
				<article
					v-for="group in visibleGroups"
					:key="group.groupKey"
					class="mcw__group-card"
					:class="{
						'is-active-group': currentDuplicateId !== null && String(currentDuplicateId) === String(group.groupId),
						'is-acknowledged': group.isGroupAcknowledged,
					}">
					<header class="mcw__group-header">
						<div class="mcw__group-title-wrap">
							<span
								class="mcw__risk-badge"
								:class="`is-${group.riskTier}`">
								{{ formatRiskTier(group.riskTier) }}
							</span>
							<h4 class="mcw__group-title">
								{{ group.title }}
							</h4>
							<span class="mcw__group-meta">
								{{ t('duplicatefinder', '{count} copies | {reclaim} reclaimable ({safe} safe now)', {
									count: group.copiesCount,
									reclaim: group.reclaimableFormatted,
									safe: group.safeNowFormatted,
								}) }}
							</span>
						</div>

						<div class="mcw__group-actions">
							<button
								type="button"
								class="mcw__mini-btn"
								:disabled="isDeleting"
								@click="$emit('select-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Focus') }}</span>
							</button>
							<button
								type="button"
								class="mcw__mini-btn"
								:disabled="isDeleting"
								@click="$emit('compare-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
							<button
								v-if="group.migrationActions.length > 0"
								type="button"
								class="mcw__mini-btn"
								:class="{ 'is-verified': group.isGroupAcknowledged }"
								:aria-pressed="group.isGroupAcknowledged ? 'true' : 'false'"
								:disabled="isDeleting"
								@click="toggleGroupAcknowledged(group.groupKey)">
								<span>{{ group.isGroupAcknowledged
									? t('duplicatefinder', 'Migration Verified')
									: t('duplicatefinder', 'Mark Migrated') }}</span>
							</button>
							<button
								v-if="countSafeInGroup(group) > 0"
								type="button"
								class="mcw__mini-btn is-danger"
								:disabled="isDeleting"
								@click="openBatchDeleteDialog(group.groupKey)">
								<span>{{ t('duplicatefinder', 'Delete Safe ({count})', { count: countSafeInGroup(group) }) }}</span>
							</button>
						</div>
					</header>

					<div
						v-if="group.migrationActions.length > 0 && !group.isGroupAcknowledged"
						class="mcw__migration-box">
						<strong class="mcw__migration-heading">
							{{ t('duplicatefinder', 'Pre-Deletion Metadata Consolidation Checklist:') }}
						</strong>
						<ul class="mcw__migration-list">
							<li
								v-for="action in group.migrationActions"
								:key="action.id"
								class="mcw__migration-item"
								:class="`is-${action.severity}`">
								{{ action.summary }}
							</li>
						</ul>
					</div>

					<div class="mcw__copies-grid">
						<div class="mcw__copy-card is-survivor">
							<div class="mcw__copy-top">
								<span class="mcw__role-pill is-survivor">
									{{ t('duplicatefinder', 'Canonical Survivor (Score {score})', { score: group.survivor.meta.richnessScore }) }}
								</span>
								<span class="mcw__copy-size">{{ group.survivor.formattedSize }}</span>
							</div>
							<div class="mcw__copy-path">
								{{ group.survivor.meta.path }}
							</div>
							<div class="mcw__copy-badges">
								<span
									v-if="group.survivor.meta.isInOriginFolder"
									class="mcw__meta-pill is-origin">
									{{ t('duplicatefinder', 'Origin Folder') }}
								</span>
								<span
									v-if="group.survivor.meta.isFavorite"
									class="mcw__meta-pill is-favorite">
									{{ t('duplicatefinder', 'Favorite') }}
								</span>
								<span
									v-if="group.survivor.meta.shareCount > 0"
									class="mcw__meta-pill is-share">
									{{ t('duplicatefinder', '{count} share(s)', { count: group.survivor.meta.shareCount }) }}
								</span>
								<span
									v-for="tag in group.survivor.meta.tags"
									:key="`surv-tag-${tag}`"
									class="mcw__meta-pill is-tag">
									#{{ tag }}
								</span>
								<span
									v-if="group.survivor.meta.commentsCount > 0"
									class="mcw__meta-pill">
									{{ t('duplicatefinder', '{count} comment(s)', { count: group.survivor.meta.commentsCount }) }}
								</span>
								<span
									v-if="group.survivor.meta.versionsCount > 0"
									class="mcw__meta-pill">
									{{ t('duplicatefinder', '{count} version(s)', { count: group.survivor.meta.versionsCount }) }}
								</span>
							</div>
						</div>

						<div
							v-for="cand in group.candidates"
							:key="cand.selectionKey"
							class="mcw__copy-card"
							:class="`is-${cand.copyStatus}`">
							<div class="mcw__copy-top">
								<span
									class="mcw__role-pill"
									:class="`is-${cand.copyStatus}`">
									{{ formatCopyStatus(cand.copyStatus) }}
								</span>
								<span class="mcw__copy-size">{{ cand.formattedSize }}</span>
							</div>
							<div class="mcw__copy-path">
								{{ cand.meta.path }}
							</div>
							<div class="mcw__copy-badges">
								<span
									v-if="cand.hasUnmergedFavorite"
									class="mcw__meta-pill is-warn">
									{{ t('duplicatefinder', 'Unmerged Favorite') }}
								</span>
								<span
									v-if="cand.meta.shareCount > 0"
									class="mcw__meta-pill is-critical">
									{{ t('duplicatefinder', '{count} active share(s)', { count: cand.meta.shareCount }) }}
								</span>
								<span
									v-for="tag in cand.missingTagsFromSurvivor"
									:key="`cand-missing-${cand.selectionKey}-${tag}`"
									class="mcw__meta-pill is-warn">
									+ #{{ tag }}
								</span>
								<span
									v-if="cand.meta.commentsCount > 0"
									class="mcw__meta-pill is-warn">
									{{ t('duplicatefinder', '{count} comment(s)', { count: cand.meta.commentsCount }) }}
								</span>
								<span
									v-if="cand.meta.versionsCount > 0"
									class="mcw__meta-pill is-warn">
									{{ t('duplicatefinder', '{count} version(s)', { count: cand.meta.versionsCount }) }}
								</span>
								<span
									v-if="cand.blockReasons.length === 0 && cand.meta.tags.length === 0 && !cand.meta.isFavorite && cand.meta.shareCount === 0"
									class="mcw__meta-pill">
									{{ t('duplicatefinder', 'Zero collaborative metadata') }}
								</span>
							</div>
						</div>
					</div>
				</article>
			</div>

			<div
				v-if="report.items.length > visibleLimit"
				class="mcw__load-more-wrap">
				<button
					type="button"
					class="mcw__tool-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more groups ({remaining} remaining)', {
						remaining: report.items.length - visibleLimit,
					}) }}</span>
				</button>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="mcw__dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe consolidated copy deletion')"
			@click="onDialogBackdropClick"
			@close="pendingGroupKey = null">
			<div class="mcw__dialog-inner">
				<h4 class="mcw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Safe Duplicate Deletion') }}
				</h4>
				<p class="mcw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} verified safe duplicate copy/copies ({size})? Canonical survivors and any share-locked or unmerged copies remain untouched.', {
						count: pendingSelection.files.length,
						size: pendingSelection.totalBytesFormatted,
					}) }}
				</p>
				<div class="mcw__dialog-actions">
					<button
						type="button"
						class="mcw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="mcw__primary-btn is-danger"
						:disabled="isDeleting || pendingSelection.files.length === 0"
						@click="confirmSafeDeletion">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Delete {count} Safe Copies', { count: pendingSelection.files.length }) }}</span>
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
	analyzeMetadataConsolidation,
	buildConsolidationCsv,
	buildConsolidationManifestJson,
	buildWebdavMigrationScript,
	collectConsolidationDeleteSelection,
} from '../tools/metadataConsolidationPlanner'

export default {
	name: 'MetadataConsolidationWorkbench',
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
			strategy: 'metadata_richness',
			category: 'all',
			sortMode: 'risk_desc',
			searchQuery: '',
			protectSharedCopies: true,
			protectFavorites: true,
			requireTagMerge: true,
			acknowledgedGroupKeys: [],
			visibleLimit: 25,
			pendingGroupKey: null,
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
		activeSourceDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		strategyOptions() {
			return [
				{ id: 'metadata_richness', label: this.t('duplicatefinder', 'Metadata Richness') },
				{ id: 'origin_and_shares', label: this.t('duplicatefinder', 'Origin & Shares') },
				{ id: 'preserve_oldest', label: this.t('duplicatefinder', 'Oldest') },
				{ id: 'preserve_newest', label: this.t('duplicatefinder', 'Newest') },
				{ id: 'shortest_path', label: this.t('duplicatefinder', 'Shortest Path') },
			]
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'unmigrated-shares', label: this.t('duplicatefinder', 'Unmigrated Shares') },
				{ id: 'favorite-split', label: this.t('duplicatefinder', 'Favorite Split') },
				{ id: 'tag-divergence', label: this.t('duplicatefinder', 'Tag Divergence') },
				{ id: 'comment-version-loss', label: this.t('duplicatefinder', 'Comments / Versions') },
				{ id: 'clean-ready', label: this.t('duplicatefinder', 'Clean Ready') },
			]
		},
		report() {
			return analyzeMetadataConsolidation(this.activeSourceDuplicates, {
				strategy: this.strategy,
				category: this.category,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				protectSharedCopies: this.protectSharedCopies,
				protectFavorites: this.protectFavorites,
				requireTagMerge: this.requireTagMerge,
				acknowledgedGroupKeys: this.acknowledgedGroupKeys,
			})
		},
		visibleGroups() {
			return this.report.items.slice(0, this.visibleLimit)
		},
		globalSafeSelection() {
			return collectConsolidationDeleteSelection(this.report)
		},
		pendingSelection() {
			return collectConsolidationDeleteSelection(this.report, {
				groupKey: this.pendingGroupKey,
			})
		},
	},
	methods: {
		formatRiskTier(tier) {
			const map = {
				critical: this.t('duplicatefinder', 'Critical'),
				high: this.t('duplicatefinder', 'High'),
				medium: this.t('duplicatefinder', 'Medium'),
				low: this.t('duplicatefinder', 'Clean'),
			}
			return map[tier] || tier
		},
		formatCopyStatus(status) {
			const map = {
				'safe-to-delete': this.t('duplicatefinder', 'Safe to Delete'),
				'migrate-before-delete': this.t('duplicatefinder', 'Migrate Metadata First'),
				'blocked-active-share': this.t('duplicatefinder', 'Share-Locked'),
			}
			return map[status] || status
		},
		countSafeInGroup(group) {
			if (!group || !Array.isArray(group.candidates)) {
				return 0
			}
			return group.candidates.filter(c => c.copyStatus === 'safe-to-delete').length
		},
		toggleGroupAcknowledged(groupKey) {
			if (this.acknowledgedGroupKeys.includes(groupKey)) {
				this.acknowledgedGroupKeys = this.acknowledgedGroupKeys.filter(k => k !== groupKey)
			} else {
				this.acknowledgedGroupKeys = [...this.acknowledgedGroupKeys, groupKey]
			}
		},
		triggerDownload(content, mimeType, filename) {
			const blob = new Blob([content], { type: mimeType })
			const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
				? URL.createObjectURL(blob)
				: ''
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
		exportMigrationScript() {
			const script = buildWebdavMigrationScript(this.report)
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'nextcloud-metadata-consolidation-runbook.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported WebDAV/OCC metadata consolidation runbook.')
		},
		exportManifestJson() {
			const json = buildConsolidationManifestJson(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-metadata-consolidation.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported metadata consolidation JSON manifest.')
		},
		exportCsvAudit() {
			const csv = buildConsolidationCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-metadata-consolidation.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported metadata consolidation CSV audit.')
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
					: (failedIds.length === 0 ? selection.files.length : 0)
				const reclaimedBytes = failedIds.length === 0 ? selection.totalBytes : 0

				this.$emit('consolidation-delete-completed', {
					deletedIds,
					deletedKeys: selection.selectionKeys,
					reclaimedBytes,
					ruleLabel: this.t('duplicatefinder', 'Metadata Consolidation Safe Cleanup'),
				})

				this.statusNoticeType = failedIds.length > 0 ? 'error' : 'info'
				this.statusNotice = failedIds.length > 0
					? this.t('duplicatefinder', 'Deleted {deleted} safe copies, {failed} failed.', {
						deleted: deletedCount,
						failed: failedIds.length,
					})
					: this.t('duplicatefinder', 'Deleted {deleted} safe copies ({size} reclaimed) with zero collaborative metadata loss.', {
						deleted: deletedCount,
						size: formatBytes(reclaimedBytes),
					})
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Failed to delete safe copies: {message}', {
					message: error && error.message ? error.message : String(error),
				})
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.metadata-consolidation-workbench {
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

.mcw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.mcw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mcw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.mcw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 0.85rem;
	font-weight: 600;
}

.mcw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mcw__tool-btn,
.mcw__primary-btn,
.mcw__seg-btn,
.mcw__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.mcw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.mcw__primary-btn.is-danger,
.mcw__mini-btn.is-danger {
	background-color: var(--color-error, #e9322d);
	border-color: var(--color-error, #e9322d);
	color: #fff;
}

.mcw__seg-btn.is-active,
.mcw__mini-btn.is-verified {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mcw__tool-btn:focus-visible,
.mcw__primary-btn:focus-visible,
.mcw__seg-btn:focus-visible,
.mcw__mini-btn:focus-visible,
.mcw__text-input:focus-visible,
.mcw__select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mcw__tool-btn:disabled,
.mcw__primary-btn:disabled,
.mcw__seg-btn:disabled,
.mcw__mini-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mcw__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 18px;
	padding-inline: 18px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius-large, 8px);
}

.mcw__empty-title {
	margin: 0;
	font-weight: 700;
}

.mcw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.mcw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.mcw__control-row,
.mcw__filters-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.mcw__control-label,
.mcw__field-label {
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mcw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mcw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 180px;
	flex: 1 1 200px;
}

.mcw__text-input,
.mcw__select {
	min-block-size: 44px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	inline-size: 100%;
}

.mcw__check-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-block-size: 44px;
	padding-inline: 6px;
	font-size: 0.88rem;
	cursor: pointer;
}

.mcw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-weight: 600;
}

.mcw__notice.is-error {
	border-color: var(--color-error, #e9322d);
	background-color: var(--color-background-dark);
}

.mcw__kpis {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 10px;
}

.mcw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mcw__kpi-label {
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
}

.mcw__kpi-value {
	font-size: 1.1rem;
	font-weight: 700;
}

.mcw__kpi-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.mcw__batch-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.mcw__batch-summary {
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
}

.mcw__groups-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.mcw__group-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 14px;
	padding-inline: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
}

.mcw__group-card.is-active-group {
	border-color: var(--color-primary-element);
}

.mcw__group-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.mcw__group-title-wrap {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.mcw__group-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mcw__group-meta {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mcw__group-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mcw__risk-badge,
.mcw__role-pill,
.mcw__meta-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.mcw__risk-badge.is-critical,
.mcw__role-pill.is-blocked-active-share,
.mcw__meta-pill.is-critical {
	border-color: var(--color-error, #e9322d);
	color: var(--color-error, #e9322d);
}

.mcw__risk-badge.is-high,
.mcw__risk-badge.is-medium,
.mcw__role-pill.is-migrate-before-delete,
.mcw__meta-pill.is-warn {
	border-color: var(--color-warning, #e9a22d);
}

.mcw__risk-badge.is-low,
.mcw__role-pill.is-survivor,
.mcw__role-pill.is-safe-to-delete {
	border-color: var(--color-success, #46ba61);
}

.mcw__migration-box {
	padding-block: 10px;
	padding-inline: 12px;
	border-inline-start: 3px solid var(--color-warning, #e9a22d);
	background-color: var(--color-background-hover);
	border-radius: var(--border-radius, 6px);
}

.mcw__migration-heading {
	display: block;
	font-size: 0.85rem;
	margin-block-end: 4px;
}

.mcw__migration-list {
	margin: 0;
	padding-inline-start: 18px;
	font-size: 0.84rem;
}

.mcw__copies-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
	gap: 10px;
}

.mcw__copy-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	min-inline-size: 0;
}

.mcw__copy-card.is-survivor {
	border-color: var(--color-success, #46ba61);
	background-color: var(--color-background-hover);
}

.mcw__copy-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mcw__copy-size {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mcw__copy-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.mcw__copy-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mcw__no-matches {
	padding-block: 16px;
	padding-inline: 16px;
	text-align: center;
	color: var(--color-text-maxcontrast);
}

.mcw__load-more-wrap {
	display: flex;
	justify-content: center;
}

.mcw__dialog {
	max-inline-size: min(92vw, 480px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.mcw__dialog-inner {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 18px;
	padding-inline: 18px;
}

.mcw__dialog-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.mcw__dialog-body {
	margin: 0;
	font-size: 0.9rem;
}

.mcw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
