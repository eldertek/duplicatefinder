<template>
	<section
		class="link-simulator"
		role="region"
		:aria-label="t('duplicatefinder', 'Hardlink and Reference Replacement Deduplication Simulator')">
		<header class="link-simulator__toolbar">
			<div class="link-simulator__title-group">
				<h3 class="link-simulator__title">
					{{ t('duplicatefinder', 'Link Deduplication Simulator') }}
				</h3>
				<span
					class="link-simulator__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{ready} links ready across {groups} groups ({size} saved)', {
						ready: simulation.summary.readyOperations,
						groups: simulation.summary.readyGroups + simulation.summary.partialGroups,
						size: simulation.summary.reclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="link-simulator__toolbar-actions">
				<button
					type="button"
					class="link-simulator__tool-btn"
					:disabled="simulation.summary.readyOperations === 0"
					@click="copyExecutionScript">
					<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
				</button>
				<button
					type="button"
					class="link-simulator__tool-btn"
					:disabled="simulation.summary.readyOperations === 0"
					@click="exportShellScript">
					<span>{{ t('duplicatefinder', 'Export .sh') }}</span>
				</button>
				<button
					type="button"
					class="link-simulator__tool-btn"
					:disabled="simulation.groupPlans.length === 0"
					@click="exportJsonPlan">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="link-simulator__tool-btn"
					:disabled="simulation.operations.length === 0"
					@click="exportCsvPlan">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="link-simulator__tool-btn is-close"
					aria-keyshortcuts="l"
					:title="t('duplicatefinder', 'Hide link deduplication simulator')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide simulator') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="link-simulator__empty">
			<p class="link-simulator__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="link-simulator__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to simulate hardlinks, relative symlinks, or CoW reflinks without breaking file paths.') }}
			</p>
			<button
				type="button"
				class="link-simulator__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="link-simulator__controls">
				<div class="link-simulator__control-row">
					<span class="link-simulator__control-label">
						{{ t('duplicatefinder', 'Simulation scope') }}
					</span>
					<div
						class="link-simulator__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Link simulation scope')">
						<button
							type="button"
							class="link-simulator__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="link-simulator__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>
				</div>

				<div class="link-simulator__control-row">
					<span class="link-simulator__control-label">
						{{ t('duplicatefinder', 'Link mode') }}
					</span>
					<div
						class="link-simulator__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Deduplication link mode')">
						<button
							v-for="modeOpt in modeOptions"
							:key="modeOpt.id"
							type="button"
							class="link-simulator__pill-btn"
							:class="{ 'is-active': linkMode === modeOpt.id }"
							:aria-pressed="linkMode === modeOpt.id ? 'true' : 'false'"
							@click="linkMode = modeOpt.id">
							<span>{{ modeOpt.label }}</span>
						</button>
					</div>
					<label class="link-simulator__strategy-field">
						<span class="link-simulator__control-label">
							{{ t('duplicatefinder', 'Master copy') }}
						</span>
						<select
							v-model="masterStrategy"
							class="link-simulator__select"
							:aria-label="t('duplicatefinder', 'Select master copy strategy')">
							<option
								v-for="strat in strategyOptions"
								:key="strat.id"
								:value="strat.id">
								{{ strat.label }}
							</option>
						</select>
					</label>
				</div>

				<p class="link-simulator__mode-hint">
					{{ activeModeHint }}
				</p>

				<div class="link-simulator__kpis">
					<div class="link-simulator__kpi">
						<span class="link-simulator__kpi-label">{{ t('duplicatefinder', 'Blocks reclaimed') }}</span>
						<strong class="link-simulator__kpi-value">{{ simulation.summary.reclaimableFormatted }}</strong>
					</div>
					<div class="link-simulator__kpi">
						<span class="link-simulator__kpi-label">{{ t('duplicatefinder', 'Ready links') }}</span>
						<strong class="link-simulator__kpi-value">{{ simulation.summary.readyOperations }}</strong>
					</div>
					<div class="link-simulator__kpi">
						<span class="link-simulator__kpi-label">{{ t('duplicatefinder', 'Plan efficiency') }}</span>
						<strong class="link-simulator__kpi-value">{{ simulation.summary.efficiencyPercent }}%</strong>
					</div>
					<div class="link-simulator__kpi">
						<span class="link-simulator__kpi-label">{{ t('duplicatefinder', 'Blocked / origin') }}</span>
						<strong class="link-simulator__kpi-value">{{ simulation.summary.blockedOperations + simulation.summary.protectedSkipped }}</strong>
					</div>
				</div>

				<div class="link-simulator__filter-bar">
					<div
						class="link-simulator__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter simulated groups by status')">
						<button
							v-for="bucket in statusOptions"
							:key="bucket.id"
							type="button"
							class="link-simulator__pill-btn"
							:class="{ 'is-active': statusFilter === bucket.id }"
							:aria-pressed="statusFilter === bucket.id ? 'true' : 'false'"
							@click="statusFilter = bucket.id">
							<span>{{ bucket.label }} ({{ bucket.count }})</span>
						</button>
					</div>
					<div class="link-simulator__search-wrap">
						<input
							v-model="query"
							type="search"
							class="link-simulator__search-input"
							:aria-label="t('duplicatefinder', 'Filter link plan by path, scope, or hash')"
							:placeholder="t('duplicatefinder', 'Filter path, scope, or hash...')">
						<button
							type="button"
							class="link-simulator__tool-btn"
							:aria-expanded="scriptPreviewOpen ? 'true' : 'false'"
							:disabled="simulation.groupPlans.length === 0"
							@click="scriptPreviewOpen = !scriptPreviewOpen">
							<span>{{ scriptPreviewOpen
								? t('duplicatefinder', 'Hide script preview')
								: t('duplicatefinder', 'Preview shell plan') }}</span>
						</button>
						<button
							v-if="hasActiveOverridesOrFilters"
							type="button"
							class="link-simulator__tool-btn"
							@click="resetAll">
							<span>{{ t('duplicatefinder', 'Reset plan') }}</span>
						</button>
					</div>
				</div>
			</div>

			<div
				v-if="feedbackMessage"
				class="link-simulator__feedback"
				:class="`is-${feedbackType}`"
				role="status"
				aria-live="polite">
				{{ feedbackMessage }}
			</div>

			<div v-if="scriptPreviewOpen" class="link-simulator__script-drawer">
				<div class="link-simulator__script-header">
					<label class="link-simulator__root-field">
						<span class="link-simulator__control-label">{{ t('duplicatefinder', 'Server data root prefix (optional)') }}</span>
						<input
							v-model="dataRootPrefix"
							type="text"
							class="link-simulator__root-input"
							:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')">
					</label>
					<span class="link-simulator__script-badge">
						{{ t('duplicatefinder', 'Dry-run enabled by default (DRY_RUN=1)') }}
					</span>
				</div>
				<pre class="link-simulator__script-pre"><code>{{ executionScript }}</code></pre>
			</div>

			<div v-if="simulation.groupPlans.length === 0" class="link-simulator__clean">
				<p class="link-simulator__empty-title">
					{{ t('duplicatefinder', 'No multi-copy groups eligible for link simulation') }}
				</p>
			</div>

			<div v-else-if="filteredGroupPlans.length === 0" class="link-simulator__clean">
				<p class="link-simulator__empty-title">
					{{ t('duplicatefinder', 'No simulated groups match your active filter') }}
				</p>
				<button
					type="button"
					class="link-simulator__tool-btn"
					@click="resetFiltersOnly">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<ul v-else class="link-simulator__list">
				<li
					v-for="plan in filteredGroupPlans"
					:key="plan.groupKey"
					class="link-plan-card"
					:class="{
						'is-current': currentDuplicateId !== null && plan.groupId === currentDuplicateId,
						'is-blocked': plan.readyCount === 0
					}">
					<div class="link-plan-card__header">
						<div class="link-plan-card__title-wrap">
							<span class="link-plan-card__status-pill" :class="`is-${plan.status}`">
								{{ formatGroupStatus(plan.status) }}
							</span>
							<strong class="link-plan-card__name">{{ plan.groupName }}</strong>
							<span class="link-plan-card__copies">
								{{ t('duplicatefinder', '{count} copies', { count: plan.filesCount }) }}
							</span>
						</div>
						<div class="link-plan-card__header-actions">
							<span class="link-plan-card__savings">
								{{ t('duplicatefinder', 'Saves {size}', { size: plan.reclaimableFormatted }) }}
							</span>
							<button
								type="button"
								class="link-plan-card__btn"
								@click="$emit('select-duplicate', plan.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
							</button>
							<button
								type="button"
								class="link-plan-card__btn"
								@click="$emit('compare-duplicate', plan.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>

					<div class="link-plan-card__master">
						<div class="link-plan-card__master-meta">
							<span class="link-plan-card__tag is-master">
								{{ t('duplicatefinder', 'MASTER TARGET') }}
							</span>
							<span v-if="plan.master.isProtected" class="link-plan-card__tag is-protected">
								{{ t('duplicatefinder', 'Protected origin') }}
							</span>
							<span class="link-plan-card__scope">{{ plan.master.storageScope }}</span>
							<span class="link-plan-card__size">{{ plan.master.sizeFormatted }}</span>
						</div>
						<div class="link-plan-card__path" :title="plan.master.path">
							{{ plan.master.path }}
						</div>
					</div>

					<ul class="link-plan-card__targets">
						<li
							v-for="target in plan.targets"
							:key="target.token"
							class="link-target-row"
							:class="`is-${target.status}`">
							<div class="link-target-row__top">
								<label class="link-target-row__check-label">
									<input
										type="checkbox"
										class="link-target-row__checkbox"
										:checked="!isTokenExcluded(target.token) && target.status === 'ready'"
										:disabled="target.isProtected || target.isLocked || target.sizeBytes <= 0 || (target.status === 'cross-scope-blocked')"
										:aria-label="t('duplicatefinder', 'Include {path} in link plan', { path: target.path })"
										@change="toggleTargetExclusion(target.token)">
									<span class="link-target-row__status-tag" :class="`is-${target.status}`">
										{{ formatTargetStatus(target) }}
									</span>
								</label>
								<div class="link-target-row__meta">
									<span class="link-plan-card__scope">{{ target.storageScope }}</span>
									<span class="link-plan-card__size">{{ target.sizeFormatted }}</span>
									<button
										v-if="!plan.master.isProtected || target.isProtected"
										type="button"
										class="link-target-row__promote-btn"
										@click="promoteMaster(plan.groupKey, target.fileKey)">
										<span>{{ t('duplicatefinder', 'Set as master') }}</span>
									</button>
								</div>
							</div>
							<div class="link-target-row__path" :title="target.path">
								{{ target.path }}
							</div>
							<div v-if="target.commandPreview" class="link-target-row__cmd">
								<code>{{ target.commandPreview }}</code>
							</div>
							<div v-else-if="target.warnings.length > 0" class="link-target-row__warning">
								{{ formatTargetWarning(target) }}
							</div>
						</li>
					</ul>
				</li>
			</ul>
		</template>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	LINK_MODES,
	MASTER_STRATEGIES,
	buildExecutionShellScript,
	buildLinkPlanCsv,
	buildLinkPlanJson,
	filterSimulatedGroups,
	simulateLinkDeduplication,
} from '../tools/linkDeduplicationSimulator'

export default {
	name: 'LinkDeduplicationSimulator',
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
			linkMode: LINK_MODES[0],
			masterStrategy: MASTER_STRATEGIES[0],
			statusFilter: 'all',
			query: '',
			manualMasters: {},
			excludedTokens: [],
			scriptPreviewOpen: false,
			dataRootPrefix: '',
			feedbackMessage: '',
			feedbackType: 'info',
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			const loaded = Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
			return loaded > 0 ? loaded : this.filteredCount
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		activeGroups() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		simulation() {
			return simulateLinkDeduplication(this.activeGroups, {
				mode: this.linkMode,
				strategy: this.masterStrategy,
				manualMasters: this.manualMasters,
				excludedTokens: this.excludedTokens,
			})
		},
		modeOptions() {
			return [
				{ id: 'hardlink', label: this.t('duplicatefinder', 'Hardlink (ln)') },
				{ id: 'symlink', label: this.t('duplicatefinder', 'Relative Symlink') },
				{ id: 'reflink', label: this.t('duplicatefinder', 'CoW Reflink') },
				{ id: 'hybrid', label: this.t('duplicatefinder', 'Hybrid Safe') },
			]
		},
		strategyOptions() {
			return [
				{ id: 'origin_first', label: this.t('duplicatefinder', 'Protected Origin > Oldest') },
				{ id: 'oldest', label: this.t('duplicatefinder', 'Oldest modified') },
				{ id: 'newest', label: this.t('duplicatefinder', 'Newest modified') },
				{ id: 'shortest_path', label: this.t('duplicatefinder', 'Shortest path') },
				{ id: 'deepest_path', label: this.t('duplicatefinder', 'Deepest path') },
			]
		},
		activeModeHint() {
			const hints = {
				hardlink: this.t('duplicatefinder', 'Hardlinks share identical disk blocks within the same storage scope without deleting any path.'),
				symlink: this.t('duplicatefinder', 'Relative symlinks keep all paths working even across different storage mounts or user roots.'),
				reflink: this.t('duplicatefinder', 'Copy-on-Write reflinks deduplicate blocks on Btrfs/XFS while allowing independent future edits.'),
				hybrid: this.t('duplicatefinder', 'Hybrid mode creates hardlinks inside the same storage scope and relative symlinks across boundaries.'),
			}
			return hints[this.linkMode] || hints.hardlink
		},
		statusOptions() {
			const plans = this.simulation.groupPlans
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All'), count: plans.length },
				{ id: 'ready', label: this.t('duplicatefinder', 'Ready'), count: plans.filter(p => p.readyCount > 0).length },
				{ id: 'warnings', label: this.t('duplicatefinder', 'Warnings'), count: plans.filter(p => p.blockedCount > 0 || p.targets.some(t => t.warnings.length > 0)).length },
				{ id: 'protected', label: this.t('duplicatefinder', 'Protected'), count: plans.filter(p => p.master.isProtected || p.protectedCount > 0).length },
			]
		},
		filteredGroupPlans() {
			return filterSimulatedGroups(this.simulation.groupPlans, {
				statusFilter: this.statusFilter,
				query: this.query,
			})
		},
		executionScript() {
			return buildExecutionShellScript(this.simulation, {
				dataRoot: this.dataRootPrefix,
			})
		},
		hasActiveOverridesOrFilters() {
			return this.statusFilter !== 'all'
				|| this.query.trim() !== ''
				|| Object.keys(this.manualMasters).length > 0
				|| this.excludedTokens.length > 0
		},
	},
	methods: {
		isTokenExcluded(token) {
			return this.excludedTokens.includes(token)
		},
		toggleTargetExclusion(token) {
			if (!token) {
				return
			}
			if (this.excludedTokens.includes(token)) {
				this.excludedTokens = this.excludedTokens.filter(t => t !== token)
			} else {
				this.excludedTokens = [...this.excludedTokens, token]
			}
		},
		promoteMaster(groupKey, fileKey) {
			if (!groupKey || fileKey === null || fileKey === undefined) {
				return
			}
			this.manualMasters = {
				...this.manualMasters,
				[groupKey]: fileKey,
			}
			this.feedbackType = 'info'
			this.feedbackMessage = this.t('duplicatefinder', 'Updated master target for selected group.')
		},
		resetFiltersOnly() {
			this.statusFilter = 'all'
			this.query = ''
		},
		resetAll() {
			this.resetFiltersOnly()
			this.manualMasters = {}
			this.excludedTokens = []
			this.feedbackMessage = ''
		},
		formatGroupStatus(status) {
			if (status === 'ready') {
				return this.t('duplicatefinder', 'Ready')
			}
			if (status === 'partial') {
				return this.t('duplicatefinder', 'Partial')
			}
			return this.t('duplicatefinder', 'Blocked')
		},
		formatTargetStatus(target) {
			if (target.status === 'ready') {
				if (target.effectiveAction === 'symlink') {
					return this.t('duplicatefinder', 'Symlink ready')
				}
				if (target.effectiveAction === 'reflink') {
					return this.t('duplicatefinder', 'Reflink ready')
				}
				return this.t('duplicatefinder', 'Hardlink ready')
			}
			if (target.status === 'protected-origin') {
				return this.t('duplicatefinder', 'Protected origin')
			}
			if (target.status === 'cross-scope-blocked') {
				return this.t('duplicatefinder', 'Cross-scope blocked')
			}
			if (target.status === 'zero-byte-skipped') {
				return this.t('duplicatefinder', 'Zero-byte skipped')
			}
			if (target.status === 'locked-file') {
				return this.t('duplicatefinder', 'Locked file')
			}
			if (target.status === 'excluded') {
				return this.t('duplicatefinder', 'Excluded')
			}
			return this.t('duplicatefinder', 'Skipped')
		},
		formatTargetWarning(target) {
			if (target.warnings.includes('protected-origin')) {
				return this.t('duplicatefinder', 'Protected origin files are never unlinked or replaced.')
			}
			if (target.warnings.includes('cross-storage-scope')) {
				return this.t('duplicatefinder', 'Different storage scope or owner from master. Switch to Relative Symlink or Hybrid Safe.')
			}
			if (target.warnings.includes('zero-byte-no-savings')) {
				return this.t('duplicatefinder', 'Zero-byte files allocate 0 storage blocks and are skipped.')
			}
			if (target.warnings.includes('file-locked')) {
				return this.t('duplicatefinder', 'File is currently locked and cannot be replaced.')
			}
			if (target.status === 'excluded') {
				return this.t('duplicatefinder', 'Excluded manually from this execution plan.')
			}
			return ''
		},
		async copyExecutionScript() {
			try {
				const copied = await copyTextSafely(this.executionScript)
				if (copied) {
					this.feedbackType = 'success'
					this.feedbackMessage = this.t('duplicatefinder', 'Dry-run execution script copied to clipboard.')
				} else {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t('duplicatefinder', 'Clipboard unavailable. Use Export .sh instead.')
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Failed to copy script to clipboard.')
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || !window.URL || typeof window.URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = window.URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = filename
			link.style.display = 'none'
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			window.URL.revokeObjectURL(url)
			return true
		},
		exportShellScript() {
			const ok = this.triggerDownload(this.executionScript, 'duplicatefinder-link-plan.sh', 'text/x-shellscript;charset=utf-8')
			if (ok) {
				this.feedbackType = 'success'
				this.feedbackMessage = this.t('duplicatefinder', 'Exported dry-run shell script (.sh).')
			}
		},
		exportJsonPlan() {
			const json = buildLinkPlanJson(this.simulation)
			const ok = this.triggerDownload(json, 'duplicatefinder-link-plan.json', 'application/json;charset=utf-8')
			if (ok) {
				this.feedbackType = 'success'
				this.feedbackMessage = this.t('duplicatefinder', 'Exported JSON link simulation plan.')
			}
		},
		exportCsvPlan() {
			const csv = buildLinkPlanCsv(this.simulation)
			const ok = this.triggerDownload(csv, 'duplicatefinder-link-plan.csv', 'text/csv;charset=utf-8')
			if (ok) {
				this.feedbackType = 'success'
				this.feedbackMessage = this.t('duplicatefinder', 'Exported CSV link simulation audit.')
			}
		},
	},
}
</script>

<style scoped>
.link-simulator {
	margin-block: 12px 16px;
	margin-inline: 16px;
	padding-block: 14px;
	padding-inline: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	max-inline-size: 100%;
	overflow-x: hidden;
}

.link-simulator__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-end: 12px;
}

.link-simulator__title-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.link-simulator__title {
	margin-block: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.link-simulator__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.link-simulator__toolbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.link-simulator__tool-btn,
.link-simulator__pill-btn,
.link-simulator__primary-btn,
.link-plan-card__btn,
.link-target-row__promote-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-pill, 999px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.link-simulator__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.link-simulator__pill-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.link-simulator__tool-btn:hover:not(:disabled),
.link-simulator__pill-btn:hover:not(:disabled),
.link-plan-card__btn:hover:not(:disabled),
.link-target-row__promote-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.link-simulator__tool-btn:disabled,
.link-simulator__pill-btn:disabled,
.link-simulator__primary-btn:disabled,
.link-plan-card__btn:disabled,
.link-target-row__promote-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.link-simulator__tool-btn:focus-visible,
.link-simulator__pill-btn:focus-visible,
.link-simulator__primary-btn:focus-visible,
.link-simulator__select:focus-visible,
.link-simulator__search-input:focus-visible,
.link-simulator__root-input:focus-visible,
.link-plan-card__btn:focus-visible,
.link-target-row__promote-btn:focus-visible,
.link-target-row__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.link-simulator__empty,
.link-simulator__clean {
	padding-block: 20px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.link-simulator__empty-title {
	margin-block: 0 6px;
	font-weight: 700;
}

.link-simulator__empty-hint {
	margin-block: 0 14px;
	color: var(--color-text-maxcontrast);
	font-size: 0.9rem;
}

.link-simulator__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-block-end: 12px;
}

.link-simulator__control-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.link-simulator__control-label {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.link-simulator__pills {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.link-simulator__strategy-field {
	display: inline-flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.link-simulator__select {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
}

.link-simulator__mode-hint {
	margin-block: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.link-simulator__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
}

.link-simulator__kpi {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.link-simulator__kpi-label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.link-simulator__kpi-value {
	font-size: 1rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.link-simulator__filter-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
}

.link-simulator__search-wrap {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	flex: 1 1 260px;
	min-inline-size: 0;
}

.link-simulator__search-input,
.link-simulator__root-input {
	flex: 1 1 180px;
	min-inline-size: 0;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	box-sizing: border-box;
}

.link-simulator__feedback {
	margin-block-end: 12px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border-inline-start: 3px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-background-hover);
	font-size: 0.88rem;
}

.link-simulator__feedback.is-success {
	border-inline-start-color: #2e7d32;
}

.link-simulator__feedback.is-error {
	border-inline-start-color: #d32f2f;
}

.link-simulator__script-drawer {
	margin-block-end: 12px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.link-simulator__script-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 8px;
}

.link-simulator__root-field {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	flex: 1 1 260px;
}

.link-simulator__script-badge {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.link-simulator__script-pre {
	margin-block: 0;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	font-size: 0.78rem;
	line-height: 1.45;
	max-block-size: 220px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.link-simulator__list {
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

.link-plan-card {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.link-plan-card.is-current {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.link-plan-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 8px;
}

.link-plan-card__title-wrap,
.link-plan-card__header-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.link-plan-card__status-pill,
.link-plan-card__tag,
.link-target-row__status-tag {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.75rem;
	font-weight: 700;
	background-color: var(--color-background-dark);
	color: var(--color-main-text);
}

.link-plan-card__status-pill.is-ready,
.link-target-row__status-tag.is-ready {
	background-color: #e8f5e9;
	color: #1b5e20;
}

.link-plan-card__status-pill.is-partial {
	background-color: #fff3e0;
	color: #e65100;
}

.link-plan-card__status-pill.is-blocked,
.link-target-row__status-tag.is-cross-scope-blocked,
.link-target-row__status-tag.is-locked-file {
	background-color: #ffebee;
	color: #b71c1c;
}

.link-plan-card__tag.is-master {
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.link-plan-card__tag.is-protected,
.link-target-row__status-tag.is-protected-origin {
	background-color: #e3f2fd;
	color: #0d47a1;
}

.link-plan-card__copies,
.link-plan-card__scope,
.link-plan-card__size,
.link-plan-card__savings {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.link-plan-card__master {
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	margin-block-end: 8px;
}

.link-plan-card__master-meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 4px;
}

.link-plan-card__path,
.link-target-row__path {
	font-size: 0.88rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.link-plan-card__targets {
	list-style: none;
	margin-block: 0;
	margin-inline: 0;
	padding-block: 0;
	padding-inline: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.link-target-row {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.link-target-row__top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 4px;
}

.link-target-row__check-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}

.link-target-row__checkbox {
	inline-size: 18px;
	block-size: 18px;
	margin-block: 0;
	margin-inline: 0;
}

.link-target-row__meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.link-target-row__cmd {
	margin-block-start: 4px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.link-target-row__warning {
	margin-block-start: 4px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

@media (max-width: 768px) {
	.link-simulator {
		margin-inline: 8px;
		padding-inline: 12px;
	}

	.link-simulator__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.link-simulator__tool-btn,
	.link-simulator__pill-btn,
	.link-simulator__primary-btn,
	.link-simulator__select,
	.link-simulator__search-input,
	.link-simulator__root-input,
	.link-plan-card__btn,
	.link-target-row__promote-btn {
		min-block-size: 44px;
		min-height: 44px;
	}
}
</style>
