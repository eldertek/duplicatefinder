<template>
	<section
		class="recovery-safety-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Recovery Safety Manifest and Share-Impact Risk Audit')">
		<header class="recovery-safety__toolbar">
			<div class="recovery-safety__title-group">
				<h3 class="recovery-safety__title">
					{{ t('duplicatefinder', 'Recovery Safety & Share-Impact Audit') }}
				</h3>
				<span
					class="recovery-safety__badge"
					:class="'is-' + report.summary.overallRiskTier"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{highRisk} high-risk, {safeSize} safe to clean', {
						highRisk: report.summary.highAndCriticalCount,
						safeSize: report.summary.safeReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="recovery-safety__toolbar-actions">
				<button
					type="button"
					class="recovery-safety__tool-btn"
					:disabled="report.groups.length === 0 || isExecuting"
					@click="exportRestoreScript">
					<span>{{ t('duplicatefinder', 'Download restore-from-trash.sh') }}</span>
				</button>
				<button
					type="button"
					class="recovery-safety__tool-btn"
					:disabled="report.groups.length === 0 || isExecuting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export Manifest JSON') }}</span>
				</button>
				<button
					type="button"
					class="recovery-safety__tool-btn"
					:disabled="report.groups.length === 0 || isExecuting"
					@click="exportRiskCsv">
					<span>{{ t('duplicatefinder', 'Export Risk CSV') }}</span>
				</button>
				<button
					type="button"
					class="recovery-safety__tool-btn is-close"
					aria-keyshortcuts="q"
					:title="t('duplicatefinder', 'Hide recovery safety audit')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide audit') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="recovery-safety__empty">
			<p class="recovery-safety__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="recovery-safety__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to audit share-link hazards, recently modified copies, sensitive folders, and generate recovery manifests.') }}
			</p>
			<button
				type="button"
				class="recovery-safety__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="recovery-safety__controls">
				<div class="recovery-safety__control-row">
					<span class="recovery-safety__control-label">
						{{ t('duplicatefinder', 'Audit scope') }}
					</span>
					<div
						class="recovery-safety__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Audit scope')">
						<button
							type="button"
							class="recovery-safety__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="recovery-safety__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="recovery-safety__select-field">
						<span class="recovery-safety__control-label">{{ t('duplicatefinder', 'Keep survivor') }}</span>
						<select
							v-model="keepStrategy"
							class="recovery-safety__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Keep survivor strategy')">
							<option value="oldest">
								{{ t('duplicatefinder', 'Oldest copy') }}
							</option>
							<option value="newest">
								{{ t('duplicatefinder', 'Newest copy') }}
							</option>
							<option value="shortest_path">
								{{ t('duplicatefinder', 'Shortest path') }}
							</option>
							<option value="protected_first">
								{{ t('duplicatefinder', 'Protected origin first') }}
							</option>
						</select>
					</label>

					<label class="recovery-safety__select-field">
						<span class="recovery-safety__control-label">{{ t('duplicatefinder', 'Recent window') }}</span>
						<select
							v-model.number="recentWindowDays"
							class="recovery-safety__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Recent modification window')">
							<option
								v-for="days in recentWindowOptions"
								:key="days"
								:value="days">
								{{ t('duplicatefinder', '{days} days', { days }) }}
							</option>
						</select>
					</label>

					<label class="recovery-safety__select-field">
						<span class="recovery-safety__control-label">{{ t('duplicatefinder', 'Sort groups') }}</span>
						<select
							v-model="sortBy"
							class="recovery-safety__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Sort audited groups')">
							<option value="risk-desc">
								{{ t('duplicatefinder', 'Highest risk score') }}
							</option>
							<option value="reclaimable-desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="recent-first">
								{{ t('duplicatefinder', 'Most recently modified') }}
							</option>
							<option value="copies-desc">
								{{ t('duplicatefinder', 'Most copies') }}
							</option>
						</select>
					</label>
				</div>

				<div class="recovery-safety__filter-row">
					<div
						class="recovery-safety__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter groups by risk')">
						<button
							v-for="option in riskFilterOptions"
							:key="option.id"
							type="button"
							class="recovery-safety__seg-btn"
							:class="{ 'is-active': riskFilter === option.id }"
							:aria-pressed="riskFilter === option.id ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="riskFilter = option.id">
							<span>{{ option.label }}</span>
						</button>
					</div>

					<div class="recovery-safety__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="recovery-safety__search-input"
							:disabled="isExecuting"
							:placeholder="t('duplicatefinder', 'Filter by path, reason, or hash...')"
							:aria-label="t('duplicatefinder', 'Filter audited groups by path, reason, or hash')">
					</div>
				</div>
			</div>

			<dl class="recovery-safety__kpis">
				<div class="recovery-safety__kpi-card">
					<dt class="recovery-safety__kpi-label">
						{{ t('duplicatefinder', 'Mean Risk Index') }}
					</dt>
					<dd class="recovery-safety__kpi-value">
						{{ report.summary.overallRiskScore }} / 100
					</dd>
					<dd class="recovery-safety__kpi-meta">
						{{ t('duplicatefinder', '{critical} critical, {high} high, {low} low', {
							critical: report.summary.tierCounts.critical,
							high: report.summary.tierCounts.high,
							low: report.summary.tierCounts.low,
						}) }}
					</dd>
				</div>

				<div class="recovery-safety__kpi-card">
					<dt class="recovery-safety__kpi-label">
						{{ t('duplicatefinder', 'Share-Impact Targets') }}
					</dt>
					<dd class="recovery-safety__kpi-value">
						{{ report.summary.shareImpactFilesCount }}
					</dd>
					<dd class="recovery-safety__kpi-meta">
						{{ t('duplicatefinder', '{publicCount} public links at risk', {
							publicCount: report.summary.publicLinkRiskCount,
						}) }}
					</dd>
				</div>

				<div class="recovery-safety__kpi-card">
					<dt class="recovery-safety__kpi-label">
						{{ t('duplicatefinder', 'Recent & Sensitive') }}
					</dt>
					<dd class="recovery-safety__kpi-value">
						{{ report.summary.recentFilesCount }} / {{ report.summary.sensitiveFilesCount }}
					</dd>
					<dd class="recovery-safety__kpi-meta">
						{{ t('duplicatefinder', 'Modified under {days}d / sensitive paths', {
							days: report.recentWindowDays,
						}) }}
					</dd>
				</div>

				<div class="recovery-safety__kpi-card">
					<dt class="recovery-safety__kpi-label">
						{{ t('duplicatefinder', 'Safe vs Held Space') }}
					</dt>
					<dd class="recovery-safety__kpi-value">
						{{ report.summary.safeReclaimableFormatted }}
					</dd>
					<dd class="recovery-safety__kpi-meta">
						{{ t('duplicatefinder', '{held} held in high-risk groups', {
							held: report.summary.highRiskHeldFormatted,
						}) }}
					</dd>
				</div>
			</dl>

			<div
				v-if="report.summary.totalGroups > 0"
				class="recovery-safety__distribution"
				:aria-label="t('duplicatefinder', 'Risk tier distribution bar')">
				<div class="recovery-safety__distribution-bar">
					<span
						v-if="tierPercentages.critical > 0"
						class="recovery-safety__dist-seg is-critical"
						:style="{ width: tierPercentages.critical + '%' }"
						:title="t('duplicatefinder', 'Critical: {count}', { count: report.summary.tierCounts.critical })" />
					<span
						v-if="tierPercentages.high > 0"
						class="recovery-safety__dist-seg is-high"
						:style="{ width: tierPercentages.high + '%' }"
						:title="t('duplicatefinder', 'High: {count}', { count: report.summary.tierCounts.high })" />
					<span
						v-if="tierPercentages.medium > 0"
						class="recovery-safety__dist-seg is-medium"
						:style="{ width: tierPercentages.medium + '%' }"
						:title="t('duplicatefinder', 'Medium: {count}', { count: report.summary.tierCounts.medium })" />
					<span
						v-if="tierPercentages.low > 0"
						class="recovery-safety__dist-seg is-low"
						:style="{ width: tierPercentages.low + '%' }"
						:title="t('duplicatefinder', 'Low: {count}', { count: report.summary.tierCounts.low })" />
				</div>
			</div>

			<div class="recovery-safety__script-drawer">
				<div class="recovery-safety__script-bar">
					<label class="recovery-safety__gate-label">
						<input
							v-model="requireRecoveryKitBeforeDelete"
							type="checkbox"
							class="recovery-safety__checkbox"
							:disabled="isExecuting">
						<span>{{ t('duplicatefinder', 'Require recovery manifest or restore script download before batch cleanup') }}</span>
					</label>

					<div class="recovery-safety__script-actions">
						<span
							v-if="recoveryKitExported"
							class="recovery-safety__kit-ready">
							{{ t('duplicatefinder', 'Recovery kit ready') }}
						</span>
						<button
							type="button"
							class="recovery-safety__tool-btn"
							:aria-expanded="scriptPreviewOpen ? 'true' : 'false'"
							@click="scriptPreviewOpen = !scriptPreviewOpen">
							<span>{{ scriptPreviewOpen
								? t('duplicatefinder', 'Hide restore script')
								: t('duplicatefinder', 'Preview restore-from-trash.sh') }}</span>
						</button>
					</div>
				</div>

				<div v-if="scriptPreviewOpen" class="recovery-safety__script-panel">
					<div class="recovery-safety__script-panel-header">
						<code class="recovery-safety__script-filename">restore-from-trash.sh</code>
						<div class="recovery-safety__script-panel-btns">
							<button
								type="button"
								class="recovery-safety__tool-btn"
								@click="copyRestoreScript">
								<span>{{ scriptCopyState === 'copied'
									? t('duplicatefinder', 'Copied')
									: t('duplicatefinder', 'Copy script') }}</span>
							</button>
							<button
								type="button"
								class="recovery-safety__tool-btn"
								:disabled="report.groups.length === 0"
								@click="exportRestoreScript">
								<span>{{ t('duplicatefinder', 'Download .sh') }}</span>
							</button>
						</div>
					</div>
					<pre class="recovery-safety__script-code"><code>{{ restoreScriptText }}</code></pre>
				</div>
			</div>

			<div
				v-if="feedbackMessage"
				class="recovery-safety__feedback"
				:class="'is-' + feedbackType"
				role="status"
				aria-live="polite">
				{{ feedbackMessage }}
			</div>

			<div class="recovery-safety__selection-bar">
				<div class="recovery-safety__selection-actions">
					<button
						type="button"
						class="recovery-safety__tool-btn"
						:disabled="isExecuting || safeLowRiskGroupKeys.length === 0"
						@click="selectSafeLowRiskGroups">
						<span>{{ t('duplicatefinder', 'Select safe low-risk ({count})', { count: safeLowRiskGroupKeys.length }) }}</span>
					</button>
					<button
						type="button"
						class="recovery-safety__tool-btn"
						:disabled="isExecuting || selectableGroupKeys.length === 0"
						@click="selectAllVisibleGroups">
						<span>{{ t('duplicatefinder', 'Select visible') }}</span>
					</button>
					<button
						type="button"
						class="recovery-safety__tool-btn"
						:disabled="isExecuting || selectedGroupKeys.length === 0"
						@click="clearSelection">
						<span>{{ t('duplicatefinder', 'Clear') }}</span>
					</button>
					<button
						type="button"
						class="recovery-safety__tool-btn"
						:disabled="isExecuting || selectedUnacknowledgedGroups.length === 0"
						@click="acknowledgeSelectedGroups">
						<span>{{ t('duplicatefinder', 'Acknowledge selected ({count})', { count: selectedUnacknowledgedGroups.length }) }}</span>
					</button>
				</div>

				<div class="recovery-safety__execute-wrap">
					<span class="recovery-safety__selection-stat">
						{{ t('duplicatefinder', '{count} files queued ({size})', {
							count: selectedCandidateCount,
							size: selectedReclaimableFormatted,
						}) }}
					</span>
					<button
						v-if="!confirmingBatchDelete"
						type="button"
						class="recovery-safety__danger-btn"
						:disabled="isExecuting || selectedCandidateCount === 0 || isDeleteBlockedByGate"
						:title="isDeleteBlockedByGate
							? t('duplicatefinder', 'Download restore-from-trash.sh or Manifest JSON first to unlock safe batch deletion')
							: t('duplicatefinder', 'Delete queued redundant copies to Nextcloud trashbin')"
						@click="confirmingBatchDelete = true">
						<span>{{ t('duplicatefinder', 'Clean queued copies') }}</span>
					</button>
					<div
						v-else
						class="recovery-safety__confirm-group"
						role="group"
						:aria-label="t('duplicatefinder', 'Confirm safe batch deletion')">
						<button
							type="button"
							class="recovery-safety__danger-btn"
							:disabled="isExecuting"
							@click="executeBatchDelete">
							<span>{{ isExecuting
								? t('duplicatefinder', 'Cleaning...')
								: t('duplicatefinder', 'Confirm delete {count}', { count: selectedCandidateCount }) }}</span>
						</button>
						<button
							type="button"
							class="recovery-safety__tool-btn"
							:disabled="isExecuting"
							@click="confirmingBatchDelete = false">
							<span>{{ t('duplicatefinder', 'Cancel') }}</span>
						</button>
					</div>
				</div>
			</div>

			<div v-if="report.groups.length === 0" class="recovery-safety__empty is-compact">
				<p class="recovery-safety__empty-title">
					{{ t('duplicatefinder', 'No duplicate groups match your current risk filters') }}
				</p>
				<p class="recovery-safety__empty-hint">
					{{ t('duplicatefinder', 'Reset the risk filter or search query, or switch to All loaded groups.') }}
				</p>
				<button
					type="button"
					class="recovery-safety__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<ul v-else class="recovery-safety__list">
				<li
					v-for="group in report.groups"
					:key="getGroupKey(group)"
					class="recovery-group-card"
					:class="[
						'is-' + group.riskTier,
						{
							'is-selected': selectedGroupKeySet.has(getGroupKey(group)),
							'is-current': currentDuplicateId && group.groupId === currentDuplicateId,
						},
					]">
					<div class="recovery-group-card__header">
						<label class="recovery-group-card__select-label">
							<input
								type="checkbox"
								class="recovery-safety__checkbox"
								:checked="selectedGroupKeySet.has(getGroupKey(group))"
								:disabled="isExecuting || !group.hasDeletableTargets"
								:aria-label="t('duplicatefinder', 'Select group {name} for safe cleanup', { name: group.displayName })"
								@change="toggleGroupSelection(getGroupKey(group))">
							<span class="recovery-group-card__title">{{ group.displayName }}</span>
						</label>

						<div class="recovery-group-card__meta">
							<span
								class="recovery-group-card__tier"
								:class="'is-' + group.riskTier">
								{{ formatRiskTierLabel(group.riskTier) }} {{ group.riskScore }}/100
							</span>
							<span class="recovery-group-card__size">
								{{ group.reclaimableFormatted }}
							</span>
							<button
								type="button"
								class="recovery-safety__mini-btn"
								@click="$emit('select-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="recovery-safety__mini-btn"
								@click="$emit('compare-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>

					<div class="recovery-group-card__meter" aria-hidden="true">
						<span
							class="recovery-group-card__meter-fill"
							:class="'is-' + group.riskTier"
							:style="{ width: Math.max(4, group.riskScore) + '%' }" />
					</div>

					<div class="recovery-group-card__reasons">
						<span
							v-for="reason in group.riskReasons"
							:key="reason"
							class="recovery-group-card__reason-tag"
							:class="{
								'is-share': reason.includes('Share') || reason.includes('Public') || reason.includes('link'),
								'is-recent': reason.includes('Modified'),
								'is-sensitive': reason.includes('Sensitive'),
							}">
							{{ reason }}
						</span>
					</div>

					<div class="recovery-group-card__copies">
						<div class="recovery-group-card__column">
							<div class="recovery-group-card__col-title is-keep">
								{{ t('duplicatefinder', 'Keep survivor ({count})', { count: group.survivors.length }) }}
							</div>
							<div
								v-for="entry in group.survivors"
								:key="entry.normalizedPath + ':' + (entry.id || entry.nodeId || 'keep')"
								class="recovery-group-card__file-row">
								<span class="recovery-group-card__path" :title="entry.normalizedPath">
									{{ entry.normalizedPath }}
								</span>
								<span class="recovery-group-card__file-meta">
									{{ entry.formattedSize }}
									<template v-if="entry.formattedMtime">
										| {{ entry.formattedMtime }}
									</template>
									<template v-if="entry.isProtected">
										| {{ t('duplicatefinder', 'Protected') }}
									</template>
								</span>
							</div>
						</div>

						<div class="recovery-group-card__column">
							<div class="recovery-group-card__col-title is-delete">
								{{ t('duplicatefinder', 'Queued for trash ({count})', { count: group.deletionCandidates.length }) }}
							</div>
							<div
								v-if="group.deletionCandidates.length === 0"
								class="recovery-group-card__file-empty">
								{{ t('duplicatefinder', 'No deletable copies (protected origin preserved).') }}
							</div>
							<div
								v-for="entry in group.deletionCandidates"
								:key="entry.normalizedPath + ':' + (entry.id || entry.nodeId || 'del')"
								class="recovery-group-card__file-row is-target">
								<span class="recovery-group-card__path" :title="entry.normalizedPath">
									{{ entry.normalizedPath }}
								</span>
								<span class="recovery-group-card__file-meta">
									{{ entry.formattedSize }}
									<template v-if="entry.formattedMtime">
										| {{ entry.formattedMtime }}
									</template>
									<template v-if="entry.hasShareRisk">
										| {{ t('duplicatefinder', 'Shared') }}
									</template>
									<template v-if="entry.hasSensitiveRisk">
										| {{ t('duplicatefinder', 'Sensitive') }}
									</template>
								</span>
							</div>
						</div>
					</div>
				</li>
			</ul>
		</template>
	</section>
</template>

<script>
import { acknowledgeDuplicate, deleteFiles } from '../tools/api'
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	DEFAULT_RECENT_WINDOW_DAYS,
	RECENT_WINDOW_OPTIONS,
	buildRecoveryManifestJson,
	buildRecoverySafetyReport,
	buildRestoreFromTrashScript,
	buildRiskAuditCsv,
} from '../tools/recoverySafetyAudit'

/**
 * Trigger a client-side file download from an in-memory text payload.
 *
 * @param {string} content - Text payload to save.
 * @param {string} filename - Suggested file name.
 * @param {string} mimeType - Content MIME type.
 * @return {boolean} True when triggered in a browser environment.
 */
function triggerTextDownload(content, filename, mimeType) {
	if (
		typeof document === 'undefined'
		|| typeof Blob === 'undefined'
		|| typeof URL === 'undefined'
		|| typeof URL.createObjectURL !== 'function'
	) {
		return false
	}
	const blob = new Blob([content], { type: mimeType })
	const url = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = url
	link.setAttribute('download', filename)
	link.style.display = 'none'
	document.body.appendChild(link)
	try {
		link.click()
	} finally {
		document.body.removeChild(link)
		if (typeof URL.revokeObjectURL === 'function') {
			URL.revokeObjectURL(url)
		}
	}
	return true
}

export default {
	name: 'RecoverySafetyWorkbench',
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
			keepStrategy: 'oldest',
			recentWindowDays: DEFAULT_RECENT_WINDOW_DAYS,
			riskFilter: 'all',
			sortBy: 'risk-desc',
			searchQuery: '',
			requireRecoveryKitBeforeDelete: true,
			recoveryKitExported: false,
			scriptPreviewOpen: false,
			scriptCopyState: 'idle',
			selectedGroupKeys: [],
			confirmingBatchDelete: false,
			isExecuting: false,
			feedbackMessage: '',
			feedbackType: 'info',
		}
	},
	computed: {
		recentWindowOptions() {
			return RECENT_WINDOW_OPTIONS
		},
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		sourcePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		report() {
			return buildRecoverySafetyReport(this.sourcePool, {
				keepStrategy: this.keepStrategy,
				recentWindowDays: this.recentWindowDays,
				riskFilter: this.riskFilter,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		restoreScriptText() {
			return buildRestoreFromTrashScript(this.report)
		},
		riskFilterOptions() {
			const counts = this.report.summary.tierCounts
			return [
				{
					id: 'all',
					label: this.t('duplicatefinder', 'All ({count})', { count: this.report.summary.totalGroups }),
				},
				{
					id: 'critical-high',
					label: this.t('duplicatefinder', 'Critical & High ({count})', { count: counts.critical + counts.high }),
				},
				{
					id: 'share-impact',
					label: this.t('duplicatefinder', 'Share impact'),
				},
				{
					id: 'recent',
					label: this.t('duplicatefinder', 'Recent (<= {days}d)', { days: this.recentWindowDays }),
				},
				{
					id: 'sensitive',
					label: this.t('duplicatefinder', 'Sensitive'),
				},
				{
					id: 'safe-low',
					label: this.t('duplicatefinder', 'Safe low-risk ({count})', { count: counts.low }),
				},
			]
		},
		tierPercentages() {
			const total = Math.max(1, this.report.summary.totalGroups)
			const counts = this.report.summary.tierCounts
			return {
				critical: Math.round((counts.critical / total) * 100),
				high: Math.round((counts.high / total) * 100),
				medium: Math.round((counts.medium / total) * 100),
				low: Math.round((counts.low / total) * 100),
			}
		},
		selectedGroupKeySet() {
			return new Set(this.selectedGroupKeys)
		},
		selectableGroupKeys() {
			return this.report.groups
				.filter(group => group.hasDeletableTargets)
				.map(group => this.getGroupKey(group))
		},
		safeLowRiskGroupKeys() {
			return this.report.groups
				.filter(group => group.riskTier === 'low' && group.hasDeletableTargets)
				.map(group => this.getGroupKey(group))
		},
		selectedAuditedGroups() {
			const keySet = this.selectedGroupKeySet
			return this.report.groups.filter(group => keySet.has(this.getGroupKey(group)))
		},
		selectedUnacknowledgedGroups() {
			return this.selectedAuditedGroups
				.filter(group => !group.acknowledged)
				.map(group => group.rawGroup)
		},
		selectedDeletionFiles() {
			const files = []
			for (const group of this.selectedAuditedGroups) {
				for (const candidate of group.deletionCandidates) {
					if (candidate && candidate.rawFile && !candidate.isProtected) {
						files.push(candidate.rawFile)
					}
				}
			}
			return files
		},
		selectedCandidateCount() {
			return this.selectedDeletionFiles.length
		},
		selectedReclaimableFormatted() {
			const total = this.selectedAuditedGroups.reduce((sum, group) => sum + group.reclaimableBytes, 0)
			return formatBytes(total)
		},
		isDeleteBlockedByGate() {
			return this.requireRecoveryKitBeforeDelete && !this.recoveryKitExported
		},
	},
	methods: {
		getGroupKey(group) {
			if (group.groupId !== null && group.groupId !== undefined && group.groupId !== '') {
				return `id:${group.groupId}`
			}
			return `hash:${group.hash || group.displayName}`
		},
		formatRiskTierLabel(tier) {
			const labels = {
				critical: this.t('duplicatefinder', 'CRITICAL'),
				high: this.t('duplicatefinder', 'HIGH'),
				medium: this.t('duplicatefinder', 'MEDIUM'),
				low: this.t('duplicatefinder', 'LOW'),
			}
			return labels[tier] || String(tier || '').toUpperCase()
		},
		toggleGroupSelection(groupKey) {
			this.confirmingBatchDelete = false
			if (this.selectedGroupKeySet.has(groupKey)) {
				this.selectedGroupKeys = this.selectedGroupKeys.filter(item => item !== groupKey)
			} else {
				this.selectedGroupKeys = [...this.selectedGroupKeys, groupKey]
			}
		},
		selectSafeLowRiskGroups() {
			this.confirmingBatchDelete = false
			this.selectedGroupKeys = [...this.safeLowRiskGroupKeys]
		},
		selectAllVisibleGroups() {
			this.confirmingBatchDelete = false
			this.selectedGroupKeys = [...this.selectableGroupKeys]
		},
		clearSelection() {
			this.confirmingBatchDelete = false
			this.selectedGroupKeys = []
		},
		resetFilters() {
			this.riskFilter = 'all'
			this.searchQuery = ''
			this.confirmingBatchDelete = false
		},
		exportRestoreScript() {
			const script = buildRestoreFromTrashScript(this.report)
			triggerTextDownload(script, 'restore-from-trash.sh', 'text/x-shellscript;charset=utf-8')
			this.recoveryKitExported = true
			this.feedbackType = 'success'
			this.feedbackMessage = this.t('duplicatefinder', 'Recovery script restore-from-trash.sh downloaded.')
		},
		exportManifestJson() {
			const json = buildRecoveryManifestJson(this.report)
			triggerTextDownload(json, 'recovery-safety-manifest.json', 'application/json;charset=utf-8')
			this.recoveryKitExported = true
			this.feedbackType = 'success'
			this.feedbackMessage = this.t('duplicatefinder', 'Recovery safety manifest JSON exported.')
		},
		exportRiskCsv() {
			const csv = buildRiskAuditCsv(this.report)
			triggerTextDownload(csv, 'recovery-risk-audit.csv', 'text/csv;charset=utf-8')
			this.feedbackType = 'success'
			this.feedbackMessage = this.t('duplicatefinder', 'Risk audit CSV exported.')
		},
		async copyRestoreScript() {
			const ok = await copyTextSafely(this.restoreScriptText)
			this.scriptCopyState = ok ? 'copied' : 'error'
			if (ok) {
				this.recoveryKitExported = true
				this.feedbackType = 'success'
				this.feedbackMessage = this.t('duplicatefinder', 'Recovery script copied to clipboard.')
			} else {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Could not copy recovery script to clipboard.')
			}
		},
		async acknowledgeSelectedGroups() {
			if (this.selectedUnacknowledgedGroups.length === 0 || this.isExecuting) {
				return
			}
			this.isExecuting = true
			const acknowledged = []
			try {
				for (const group of this.selectedUnacknowledgedGroups) {
					if (!group || !group.hash) {
						continue
					}
					await acknowledgeDuplicate(group.hash)
					acknowledged.push(group)
				}
				if (acknowledged.length > 0) {
					this.$emit('recovery-acknowledge-completed', { groups: acknowledged })
					this.feedbackType = 'success'
					this.feedbackMessage = this.t('duplicatefinder', 'Acknowledged {count} audited duplicate groups.', {
						count: acknowledged.length,
					})
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Failed to acknowledge selected groups.')
			} finally {
				this.isExecuting = false
			}
		},
		async executeBatchDelete() {
			if (this.selectedCandidateCount === 0 || this.isDeleteBlockedByGate || this.isExecuting) {
				return
			}
			this.isExecuting = true
			this.confirmingBatchDelete = false
			try {
				const filesToDelete = [...this.selectedDeletionFiles]
				const result = await deleteFiles(filesToDelete)
				const deletedFiles = Array.isArray(result && result.success) ? result.success : []
				const deletedNodeIds = Array.isArray(result && result.deletedNodeIds) ? result.deletedNodeIds : []
				const bytesReclaimed = deletedFiles.reduce((sum, file) => {
					const sz = Number(file && file.size)
					return Number.isFinite(sz) && sz > 0 ? sum + Math.floor(sz) : sum
				}, 0)
				if (deletedFiles.length > 0) {
					this.$emit('recovery-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved: this.selectedAuditedGroups.length,
						sampleLabel: this.selectedAuditedGroups[0] ? this.selectedAuditedGroups[0].displayName : '',
					})
					this.selectedGroupKeys = []
					this.feedbackType = 'success'
					this.feedbackMessage = this.t('duplicatefinder', 'Cleaned {count} copies ({size}) safely.', {
						count: deletedFiles.length,
						size: formatBytes(bytesReclaimed),
					})
				} else {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t('duplicatefinder', 'No files were deleted during safe cleanup.')
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Error while cleaning queued duplicate copies.')
			} finally {
				this.isExecuting = false
			}
		},
	},
}
</script>

<style scoped>
.recovery-safety-workbench {
	margin-block-end: 16px;
	padding-block: 16px;
	padding-inline: 18px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.recovery-safety__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-end: 14px;
}

.recovery-safety__title-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
	min-inline-size: 0;
}

.recovery-safety__title {
	margin-block: 0;
	margin-inline: 0;
	font-size: 1.08rem;
	font-weight: 700;
}

.recovery-safety__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 4px;
	font-size: 0.82rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.recovery-safety__badge.is-critical {
	border-color: rgba(211, 47, 47, 0.45);
	background-color: rgba(211, 47, 47, 0.12);
	color: #b71c1c;
}

.recovery-safety__badge.is-high {
	border-color: rgba(230, 81, 0, 0.45);
	background-color: rgba(230, 81, 0, 0.12);
	color: #bf360c;
}

.recovery-safety__badge.is-low {
	border-color: rgba(46, 125, 50, 0.4);
	background-color: rgba(46, 125, 50, 0.1);
	color: #1b5e20;
}

.recovery-safety__toolbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.recovery-safety__tool-btn,
.recovery-safety__seg-btn,
.recovery-safety__mini-btn,
.recovery-safety__primary-btn,
.recovery-safety__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 34px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.recovery-safety__mini-btn {
	min-block-size: 30px;
	padding-block: 4px;
	padding-inline: 9px;
	font-size: 0.8rem;
}

.recovery-safety__primary-btn {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.recovery-safety__danger-btn {
	border-color: #c62828;
	background-color: #c62828;
	color: #ffffff;
}

.recovery-safety__tool-btn:hover:not(:disabled),
.recovery-safety__seg-btn:hover:not(:disabled),
.recovery-safety__mini-btn:hover:not(:disabled),
.recovery-safety__tool-btn:focus-visible:not(:disabled),
.recovery-safety__seg-btn:focus-visible:not(:disabled),
.recovery-safety__mini-btn:focus-visible:not(:disabled),
.recovery-safety__primary-btn:focus-visible:not(:disabled),
.recovery-safety__danger-btn:focus-visible:not(:disabled) {
	border-color: var(--color-primary-element, #0082c9);
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.recovery-safety__seg-btn.is-active {
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.14));
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.recovery-safety__tool-btn:disabled,
.recovery-safety__seg-btn:disabled,
.recovery-safety__mini-btn:disabled,
.recovery-safety__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.recovery-safety__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-block-end: 14px;
}

.recovery-safety__control-row,
.recovery-safety__filter-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.recovery-safety__control-label {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.recovery-safety__segments {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.recovery-safety__select-field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.recovery-safety__select,
.recovery-safety__search-input {
	min-block-size: 34px;
	padding-block: 5px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
}

.recovery-safety__select:focus-visible,
.recovery-safety__search-input:focus-visible,
.recovery-safety__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.recovery-safety__search-wrap {
	flex: 1 1 220px;
	min-inline-size: 0;
	display: flex;
}

.recovery-safety__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.recovery-safety__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-block: 0 12px;
	margin-inline: 0;
}

.recovery-safety__kpi-card {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.recovery-safety__kpi-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.recovery-safety__kpi-value {
	margin-block: 4px 2px;
	margin-inline: 0;
	font-size: 1.08rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.recovery-safety__kpi-meta {
	margin-block: 0;
	margin-inline: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.recovery-safety__distribution {
	margin-block-end: 12px;
}

.recovery-safety__distribution-bar {
	display: flex;
	block-size: 8px;
	inline-size: 100%;
	border-radius: 4px;
	overflow: hidden;
	background-color: var(--color-background-dark);
}

.recovery-safety__dist-seg.is-critical {
	background-color: #d32f2f;
}

.recovery-safety__dist-seg.is-high {
	background-color: #ef6c00;
}

.recovery-safety__dist-seg.is-medium {
	background-color: #f9a825;
}

.recovery-safety__dist-seg.is-low {
	background-color: #2e7d32;
}

.recovery-safety__script-drawer {
	margin-block-end: 12px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.recovery-safety__script-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
}

.recovery-safety__gate-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
}

.recovery-safety__checkbox {
	inline-size: 18px;
	block-size: 18px;
	margin-block: 0;
	margin-inline: 0;
	accent-color: var(--color-primary-element, #0082c9);
	flex-shrink: 0;
}

.recovery-safety__script-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.recovery-safety__kit-ready {
	font-size: 0.8rem;
	font-weight: 700;
	color: #1b5e20;
}

.recovery-safety__script-panel {
	margin-block-start: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	overflow: hidden;
}

.recovery-safety__script-panel-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border-block-end: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.recovery-safety__script-filename {
	font-size: 0.84rem;
	font-weight: 700;
}

.recovery-safety__script-panel-btns {
	display: flex;
	align-items: center;
	gap: 6px;
}

.recovery-safety__script-code {
	margin-block: 0;
	margin-inline: 0;
	padding-block: 10px;
	padding-inline: 12px;
	max-block-size: 220px;
	overflow: auto;
	font-size: 0.78rem;
	line-height: 1.45;
	white-space: pre;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.recovery-safety__feedback {
	margin-block-end: 12px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border-inline-start: 3px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-background-hover);
	font-size: 0.86rem;
}

.recovery-safety__feedback.is-success {
	border-inline-start-color: #2e7d32;
}

.recovery-safety__feedback.is-error {
	border-inline-start-color: #c62828;
}

.recovery-safety__selection-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	margin-block-end: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.recovery-safety__selection-actions,
.recovery-safety__execute-wrap,
.recovery-safety__confirm-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.recovery-safety__selection-stat {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.recovery-safety__empty {
	padding-block: 24px;
	padding-inline: 16px;
	text-align: center;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.recovery-safety__empty.is-compact {
	padding-block: 18px;
}

.recovery-safety__empty-title {
	margin-block: 0 6px;
	font-weight: 700;
}

.recovery-safety__empty-hint {
	margin-block: 0 12px;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.recovery-safety__list {
	list-style: none;
	margin-block: 0;
	margin-inline: 0;
	padding-block: 0;
	padding-inline: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-block-size: 460px;
	overflow-y: auto;
}

.recovery-group-card {
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-inline-start-width: 4px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.recovery-group-card.is-critical {
	border-inline-start-color: #d32f2f;
}

.recovery-group-card.is-high {
	border-inline-start-color: #ef6c00;
}

.recovery-group-card.is-medium {
	border-inline-start-color: #f9a825;
}

.recovery-group-card.is-low {
	border-inline-start-color: #2e7d32;
}

.recovery-group-card.is-current {
	border-color: var(--color-primary-element, #0082c9);
}

.recovery-group-card.is-selected {
	background-color: var(--color-background-hover);
}

.recovery-group-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 8px;
}

.recovery-group-card__select-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
	cursor: pointer;
}

.recovery-group-card__title {
	font-weight: 700;
	font-size: 0.94rem;
	overflow-wrap: anywhere;
}

.recovery-group-card__meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.recovery-group-card__tier {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 4px;
	font-size: 0.76rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	border: 1px solid var(--color-border);
}

.recovery-group-card__tier.is-critical {
	background-color: rgba(211, 47, 47, 0.12);
	border-color: rgba(211, 47, 47, 0.35);
	color: #b71c1c;
}

.recovery-group-card__tier.is-high {
	background-color: rgba(230, 81, 0, 0.12);
	border-color: rgba(230, 81, 0, 0.35);
	color: #bf360c;
}

.recovery-group-card__tier.is-medium {
	background-color: rgba(249, 168, 37, 0.16);
	border-color: rgba(245, 127, 23, 0.35);
	color: #6d4c00;
}

.recovery-group-card__tier.is-low {
	background-color: rgba(46, 125, 50, 0.12);
	border-color: rgba(46, 125, 50, 0.35);
	color: #1b5e20;
}

.recovery-group-card__size {
	font-size: 0.82rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
}

.recovery-group-card__meter {
	block-size: 4px;
	inline-size: 100%;
	border-radius: 2px;
	background-color: var(--color-background-dark);
	overflow: hidden;
	margin-block-end: 8px;
}

.recovery-group-card__meter-fill {
	display: block;
	block-size: 100%;
}

.recovery-group-card__meter-fill.is-critical {
	background-color: #d32f2f;
}

.recovery-group-card__meter-fill.is-high {
	background-color: #ef6c00;
}

.recovery-group-card__meter-fill.is-medium {
	background-color: #f9a825;
}

.recovery-group-card__meter-fill.is-low {
	background-color: #2e7d32;
}

.recovery-group-card__reasons {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	margin-block-end: 8px;
}

.recovery-group-card__reason-tag {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 4px;
	font-size: 0.76rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.recovery-group-card__reason-tag.is-share {
	border-color: rgba(211, 47, 47, 0.35);
	color: #b71c1c;
}

.recovery-group-card__reason-tag.is-recent {
	border-color: rgba(230, 81, 0, 0.35);
	color: #bf360c;
}

.recovery-group-card__reason-tag.is-sensitive {
	border-color: rgba(106, 27, 154, 0.35);
	color: #4a148c;
}

.recovery-group-card__copies {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.recovery-group-card__column {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.recovery-group-card__col-title {
	font-size: 0.78rem;
	font-weight: 700;
	margin-block-end: 6px;
}

.recovery-group-card__col-title.is-keep {
	color: #1b5e20;
}

.recovery-group-card__col-title.is-delete {
	color: #b71c1c;
}

.recovery-group-card__file-row {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 4px;
	border-block-start: 1px solid var(--color-border);
	min-inline-size: 0;
}

.recovery-group-card__file-row:first-of-type {
	border-block-start: 0;
	padding-block-start: 0;
}

.recovery-group-card__path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.recovery-group-card__file-meta,
.recovery-group-card__file-empty {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

@media (max-width: 960px) {
	.recovery-safety__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.recovery-group-card__copies {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.recovery-safety-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.recovery-safety__kpis {
		grid-template-columns: minmax(0, 1fr);
	}

	.recovery-safety__tool-btn,
	.recovery-safety__seg-btn,
	.recovery-safety__mini-btn,
	.recovery-safety__primary-btn,
	.recovery-safety__danger-btn,
	.recovery-safety__select,
	.recovery-safety__search-input {
		min-block-size: 44px;
	}

	.recovery-safety__checkbox {
		min-inline-size: 22px;
		min-block-size: 22px;
	}

	.recovery-safety__gate-label,
	.recovery-group-card__select-label {
		min-block-size: 44px;
	}
}
</style>
