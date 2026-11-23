<template>
	<section
		class="backup-drift-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Backup Snapshot & Mirror-Tree Drift Synchronizer')">
		<header class="bdw__toolbar">
			<div class="bdw__title-group">
				<h3 class="bdw__title">
					{{ t('duplicatefinder', 'Backup Snapshot & Mirror-Tree Drift Synchronizer') }}
				</h3>
				<span
					class="bdw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{groups} drift groups ({reclaim} safe snapshot prune, {drift} newer-in-snapshot alerts)', {
						groups: report.summary.auditedGroupsCount,
						reclaim: report.summary.safePruneBytesFormatted,
						drift: report.summary.newerInSnapshotCount,
					}) }}
				</span>
			</div>

			<div class="bdw__toolbar-actions">
				<button
					type="button"
					class="bdw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportSyncPruneScript">
					<span>{{ t('duplicatefinder', 'Export Sync & Prune Script') }}</span>
				</button>
				<button
					type="button"
					class="bdw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportOccChecklist">
					<span>{{ t('duplicatefinder', 'Export OCC Checklist') }}</span>
				</button>
				<button
					type="button"
					class="bdw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="bdw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportCsvReport">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="bdw__tool-btn is-close"
					aria-keyshortcuts="\"
					:title="t('duplicatefinder', 'Hide backup snapshot and mirror-tree drift synchronizer')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide backup drift') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="bdw__empty">
			<p class="bdw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="bdw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to detect dated backup snapshots, mirror replicas, client exports, and newer-in-snapshot drift before pruning.') }}
			</p>
			<button
				type="button"
				class="bdw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="bdw__controls">
				<div class="bdw__control-row">
					<span class="bdw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="bdw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Snapshot audit source scope')">
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="bdw__control-label">{{ t('duplicatefinder', 'Findings') }}</span>
					<div
						class="bdw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by snapshot drift finding')">
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': findingFilter === 'all' }"
							:aria-pressed="findingFilter === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'all'">
							<span>{{ t('duplicatefinder', 'All') }}</span>
						</button>
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': findingFilter === 'safe_mirror_prune' }"
							:aria-pressed="findingFilter === 'safe_mirror_prune' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'safe_mirror_prune'">
							<span>{{ t('duplicatefinder', 'Safe Mirror Prune') }}</span>
						</button>
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': findingFilter === 'newer_in_snapshot' }"
							:aria-pressed="findingFilter === 'newer_in_snapshot' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'newer_in_snapshot'">
							<span>{{ t('duplicatefinder', 'Newer-in-Snapshot Drift') }}</span>
						</button>
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': findingFilter === 'multi_gen_snapshots' }"
							:aria-pressed="findingFilter === 'multi_gen_snapshots' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'multi_gen_snapshots'">
							<span>{{ t('duplicatefinder', 'Multi-Gen Snapshots') }}</span>
						</button>
						<button
							type="button"
							class="bdw__seg-btn"
							:class="{ 'is-active': findingFilter === 'protected_overlap' }"
							:aria-pressed="findingFilter === 'protected_overlap' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'protected_overlap'">
							<span>{{ t('duplicatefinder', 'Protected / Read-only') }}</span>
						</button>
					</div>
				</div>

				<div class="bdw__control-row">
					<label class="bdw__field">
						<span class="bdw__control-label">{{ t('duplicatefinder', 'Canonical Rule') }}</span>
						<select
							v-model="canonicalStrategy"
							class="bdw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Canonical master election strategy')">
							<option value="live_then_newest">{{ t('duplicatefinder', 'Live tree + newest') }}</option>
							<option value="origin_then_newest">{{ t('duplicatefinder', 'Origin / read-only + newest') }}</option>
							<option value="newest_snapshot">{{ t('duplicatefinder', 'Newest timestamp anywhere') }}</option>
							<option value="shortest_live_path">{{ t('duplicatefinder', 'Shortest live path') }}</option>
						</select>
					</label>

					<label class="bdw__field">
						<span class="bdw__control-label">{{ t('duplicatefinder', 'Root Kind') }}</span>
						<select
							v-model="rootKindFilter"
							class="bdw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter by snapshot root classification')">
							<option value="all">{{ t('duplicatefinder', 'All root kinds') }}</option>
							<option value="snapshot_dated">{{ t('duplicatefinder', 'Dated Snapshots') }}</option>
							<option value="mirror_replica">{{ t('duplicatefinder', 'Mirror / Replicas') }}</option>
							<option value="client_export">{{ t('duplicatefinder', 'Client Exports') }}</option>
							<option value="version_shadow">{{ t('duplicatefinder', 'Version Shadows') }}</option>
							<option value="canonical_live">{{ t('duplicatefinder', 'Canonical Live Trees') }}</option>
						</select>
					</label>

					<label class="bdw__field">
						<span class="bdw__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortMode"
							class="bdw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort backup drift groups')">
							<option value="reclaim_desc">{{ t('duplicatefinder', 'Largest safe prune') }}</option>
							<option value="drift_risk_desc">{{ t('duplicatefinder', 'Highest drift risk') }}</option>
							<option value="generations_desc">{{ t('duplicatefinder', 'Most snapshot generations') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="bdw__field bdw__field--grow">
						<span class="bdw__control-label">{{ t('duplicatefinder', 'Search') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="bdw__search-input"
							:disabled="isDeleting"
							:placeholder="t('duplicatefinder', 'Filter snapshot path, date (YYYY-MM-DD), canonical root...')"
							:aria-label="t('duplicatefinder', 'Search backup snapshot drift groups')">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="bdw__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="bdw__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="bdw__kpis">
				<div class="bdw__kpi-card">
					<span class="bdw__kpi-label">{{ t('duplicatefinder', 'Snapshot & Drift Groups') }}</span>
					<strong class="bdw__kpi-value">{{ report.summary.auditedGroupsCount }}</strong>
					<span class="bdw__kpi-sub">
						{{ t('duplicatefinder', '{multi} multi-generation snapshot clusters', {
							multi: report.summary.multiGenGroupsCount,
						}) }}
					</span>
				</div>

				<div class="bdw__kpi-card">
					<span class="bdw__kpi-label">{{ t('duplicatefinder', 'Snapshot / Mirror Roots') }}</span>
					<strong class="bdw__kpi-value">{{ report.summary.backupRootsCount }}</strong>
					<span class="bdw__kpi-sub">
						{{ t('duplicatefinder', '{exact} 100% redundant mirror roots', {
							exact: report.summary.exactMirrorRootsCount,
						}) }}
					</span>
				</div>

				<div class="bdw__kpi-card">
					<span class="bdw__kpi-label">{{ t('duplicatefinder', 'Newer-in-Snapshot Alerts') }}</span>
					<strong class="bdw__kpi-value">{{ report.summary.newerInSnapshotCount }}</strong>
					<span class="bdw__kpi-sub">
						{{ t('duplicatefinder', '{size} requires sync-back before prune', {
							size: report.summary.newerInSnapshotBytesFormatted,
						}) }}
					</span>
				</div>

				<div class="bdw__kpi-card">
					<span class="bdw__kpi-label">{{ t('duplicatefinder', 'Safe Snapshot Reclaim') }}</span>
					<strong class="bdw__kpi-value">{{ report.summary.safePruneBytesFormatted }}</strong>
					<span class="bdw__kpi-sub">
						{{ t('duplicatefinder', '{safe} redundant copies | {protected} protected', {
							safe: report.summary.safePruneCount,
							protected: report.summary.protectedCount,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="report.groups.length === 0"
				class="bdw__empty">
				<p class="bdw__empty-title">
					{{ t('duplicatefinder', 'No backup snapshots, mirror trees, or archive shadows detected in current scope') }}
				</p>
				<p class="bdw__empty-hint">
					{{ t('duplicatefinder', 'All {count} scanned groups reside inside canonical live folders without dated snapshots, mirror replicas, or client export trees.', {
						count: report.summary.totalScannedGroupsCount,
					}) }}
				</p>
			</div>

			<template v-else>
				<div class="bdw__analytics-grid">
					<section
						class="bdw__panel"
						:aria-label="t('duplicatefinder', 'Snapshot and mirror root registry')">
						<div class="bdw__panel-head">
							<h4 class="bdw__panel-title">
								{{ t('duplicatefinder', 'Snapshot & Mirror Root Registry') }}
							</h4>
							<span class="bdw__panel-meta">
								{{ t('duplicatefinder', 'Click a root to filter') }}
							</span>
						</div>
						<ul class="bdw__root-list">
							<li
								v-for="root in report.snapshotRoots"
								:key="root.rootKey"
								class="bdw__root-item">
								<button
									type="button"
									class="bdw__root-btn"
									:class="{
										'is-active': rootKeyFilter === root.rootKey,
										'is-drift': root.newerInSnapshotFiles > 0,
									}"
									:aria-pressed="rootKeyFilter === root.rootKey ? 'true' : 'false'"
									:disabled="isDeleting"
									@click="toggleRootFilter(root.rootKey)">
									<div class="bdw__root-top">
										<span class="bdw__root-name">
											{{ root.rootLabel }}
											<template v-if="root.snapshotDate">
												({{ root.snapshotDate }})
											</template>
										</span>
										<span class="bdw__root-stats">
											{{ root.safePruneBytesFormatted }}
										</span>
									</div>
									<div class="bdw__bar-track">
										<div
											class="bdw__bar-fill"
											:style="{ width: `${Math.max(4, root.redundancyPercent)}%` }" />
									</div>
									<div class="bdw__root-foot">
										<span>{{ root.rootKindLabel }} | {{ root.driftStatusLabel }} ({{ root.redundancyPercent }}%)</span>
										<span
											v-if="root.newerInSnapshotFiles > 0"
											class="bdw__warn-tag">
											{{ t('duplicatefinder', '{count} newer drift', { count: root.newerInSnapshotFiles }) }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<section
						class="bdw__panel"
						:aria-label="t('duplicatefinder', 'Root classification and reconcile queue')">
						<div class="bdw__panel-head">
							<h4 class="bdw__panel-title">
								{{ t('duplicatefinder', 'Tree Classification & Sync-Back Queue') }}
							</h4>
							<span class="bdw__panel-meta">
								{{ t('duplicatefinder', '{count} sync-back items', { count: activePrunePlan.reconcileCount }) }}
							</span>
						</div>
						<ul class="bdw__kind-list">
							<li
								v-for="item in activeRootKinds"
								:key="item.rootKind"
								class="bdw__kind-item">
								<button
									type="button"
									class="bdw__root-btn"
									:class="{ 'is-active': rootKindFilter === item.rootKind }"
									:aria-pressed="rootKindFilter === item.rootKind ? 'true' : 'false'"
									:disabled="isDeleting"
									@click="toggleRootKindFilter(item.rootKind)">
									<div class="bdw__root-top">
										<span class="bdw__root-name">{{ item.label }}</span>
										<span class="bdw__root-stats">{{ item.copyCount }} ({{ item.totalBytesFormatted }})</span>
									</div>
									<div class="bdw__bar-track">
										<div
											class="bdw__bar-fill"
											:style="{ width: `${Math.max(4, item.sharePercent)}%` }" />
									</div>
									<div class="bdw__root-foot">
										<span>{{ t('duplicatefinder', '{pct}% of audited copies', { pct: item.sharePercent }) }}</span>
										<span v-if="item.safePruneCount > 0">
											{{ t('duplicatefinder', '{size} prunable', { size: item.safePruneBytesFormatted }) }}
										</span>
									</div>
								</button>
							</li>
						</ul>
						<div
							v-if="activePrunePlan.reconcileItems.length > 0"
							class="bdw__reconcile-box">
							<p class="bdw__reconcile-title">
								{{ t('duplicatefinder', 'Newer-in-Snapshot Reconcile Queue (protected from auto-prune)') }}
							</p>
							<ul class="bdw__reconcile-list">
								<li
									v-for="rec in activePrunePlan.reconcileItems.slice(0, 5)"
									:key="`${rec.groupKey}-${rec.selectionKey}`"
									class="bdw__reconcile-row">
									<span class="bdw__reconcile-path">{{ rec.sourcePath }}</span>
									<span class="bdw__warn-tag">{{ rec.driftLabel }} ({{ rec.sizeFormatted }})</span>
								</li>
							</ul>
						</div>
					</section>
				</div>

				<div
					v-if="filteredGroups.length === 0"
					class="bdw__empty-matches">
					<p class="bdw__empty-title">
						{{ t('duplicatefinder', 'No backup drift groups match your active filters') }}
					</p>
					<button
						type="button"
						class="bdw__mini-btn"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Clear filters') }}</span>
					</button>
				</div>

				<div
					v-else
					class="bdw__split">
					<section
						class="bdw__group-list-panel"
						:aria-label="t('duplicatefinder', 'Audited backup drift groups')">
						<div class="bdw__panel-head">
							<h4 class="bdw__panel-title">
								{{ t('duplicatefinder', 'Drift Groups ({count})', { count: filteredGroups.length }) }}
							</h4>
						</div>
						<ul class="bdw__group-list">
							<li
								v-for="group in filteredGroups"
								:key="group.groupKey"
								class="bdw__group-item">
								<button
									type="button"
									class="bdw__group-btn"
									:class="{ 'is-selected': activeGroup && activeGroup.groupKey === group.groupKey }"
									:aria-pressed="activeGroup && activeGroup.groupKey === group.groupKey ? 'true' : 'false'"
									@click="selectedGroupKey = group.groupKey">
									<div class="bdw__group-top">
										<span class="bdw__group-name">{{ group.primaryName }}</span>
										<span class="bdw__group-reclaim">{{ group.safePruneBytesFormatted }}</span>
									</div>
									<div class="bdw__group-meta">
										<span
											class="bdw__badge"
											:class="severityBadgeClass(group.severity)">
											{{ formatSeverityLabel(group.severity) }}
										</span>
										<span class="bdw__badge">
											{{ t('duplicatefinder', '{copies} copies / {gens} gens', {
												copies: group.copyCount,
												gens: group.generationCount,
											}) }}
										</span>
										<span
											v-for="tag in group.findingTags"
											:key="`${group.groupKey}-${tag}`"
											class="bdw__badge is-finding">
											{{ tag }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<section
						v-if="activeGroup"
						class="bdw__detail-panel"
						:aria-label="t('duplicatefinder', 'Backup snapshot drift forensic inspector')">
						<div class="bdw__detail-head">
							<div>
								<h4 class="bdw__detail-title">
									{{ activeGroup.primaryName }}
								</h4>
								<p class="bdw__detail-subtitle">
									{{ t('duplicatefinder', 'Canonical master ({kind}): {path}', {
										kind: activeGroup.canonicalMasterKind,
										path: activeGroup.canonicalMasterPath,
									}) }}
								</p>
							</div>
							<div class="bdw__detail-actions">
								<button
									type="button"
									class="bdw__mini-btn"
									@click="$emit('select-duplicate', activeGroup)">
									<span>{{ t('duplicatefinder', 'Inspect in Main View') }}</span>
								</button>
								<button
									type="button"
									class="bdw__mini-btn"
									@click="$emit('compare-duplicate', activeGroup)">
									<span>{{ t('duplicatefinder', 'Open Compare View') }}</span>
								</button>
							</div>
						</div>

						<ul class="bdw__diagnoses">
							<li
								v-for="(diag, dIdx) in activeGroup.diagnoses"
								:key="`${activeGroup.groupKey}-diag-${dIdx}`"
								class="bdw__diagnosis-item">
								{{ diag }}
							</li>
						</ul>

						<ul class="bdw__file-list">
							<li
								v-for="entry in activeGroup.entries"
								:key="`${activeGroup.groupKey}-${entry.selectionKey}`"
								class="bdw__file-row">
								<div class="bdw__file-main">
									<span class="bdw__file-path">{{ entry.path }}</span>
									<span class="bdw__file-sub">
										{{ entry.sizeFormatted }} | {{ entry.rootInfo.rootLabel }}
										<template v-if="entry.rootInfo.snapshotDate">
											| {{ t('duplicatefinder', 'Snapshot {date}', { date: entry.rootInfo.snapshotDate }) }}
										</template>
										<template v-if="entry.mtimeFormatted">
											| {{ entry.mtimeFormatted }}
										</template>
									</span>
									<span class="bdw__file-reason">{{ entry.driftLabel }}</span>
								</div>
								<div class="bdw__file-badges">
									<span class="bdw__badge">
										{{ entry.rootInfo.rootKindLabel }}
									</span>
									<span
										class="bdw__badge"
										:class="dispositionBadgeClass(entry)">
										{{ entry.dispositionLabel }}
									</span>
								</div>
							</li>
						</ul>
					</section>
				</div>

				<footer class="bdw__bulk-bar">
					<div class="bdw__bulk-summary">
						<span>
							{{ t('duplicatefinder', 'Safe Mirror Prune Plan: {count} redundant snapshot copies ({size})', {
								count: activePrunePlan.safeCount,
								size: activePrunePlan.safeBytesFormatted,
							}) }}
						</span>
						<span class="bdw__bulk-note">
							{{ t('duplicatefinder', '{reconcile} newer-in-snapshot drift copies & {protected} protected copies preserved.', {
								reconcile: activePrunePlan.reconcileCount,
								protected: activePrunePlan.protectedSkippedCount,
							}) }}
						</span>
					</div>
					<div class="bdw__bulk-actions">
						<button
							type="button"
							class="bdw__danger-btn"
							:disabled="activePrunePlan.safeCount === 0 || isDeleting"
							@click="openPruneDialog">
							<span>
								{{ isDeleting
									? t('duplicatefinder', 'Pruning...')
									: t('duplicatefinder', 'Prune Safe Snapshot Copies ({count})', { count: activePrunePlan.safeCount }) }}
							</span>
						</button>
					</div>
				</footer>
			</template>
		</template>

		<dialog
			ref="backupDriftPruneDialog"
			class="bdw-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe backup snapshot prune')"
			@close="onPruneDialogClose"
			@click="onPruneDialogBackdropClick">
			<div class="bdw-confirm-dialog__content">
				<h4 class="bdw-confirm-dialog__title">
					{{ t('duplicatefinder', 'Prune verified redundant snapshot copies?') }}
				</h4>
				<p class="bdw-confirm-dialog__body">
					{{ t('duplicatefinder', 'This deletes {count} redundant snapshot copies ({size}) across {groups} drift groups. Canonical masters, protected origins, read-only mounts, and {reconcile} newer-in-snapshot drift copies are preserved.', {
						count: activePrunePlan.safeCount,
						size: activePrunePlan.safeBytesFormatted,
						groups: activePrunePlan.groupsImpacted,
						reconcile: activePrunePlan.reconcileCount,
					}) }}
				</p>
				<div class="bdw-confirm-dialog__actions">
					<button
						type="button"
						class="bdw__mini-btn"
						:disabled="isDeleting"
						@click="closePruneDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="bdw__danger-btn"
						:disabled="isDeleting"
						@click="confirmSafePrune">
						<span>{{ t('duplicatefinder', 'Confirm safe prune') }}</span>
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
	buildBackupDriftReport,
	buildBackupPrunePlan,
	exportBackupDriftCsv,
	exportBackupDriftJson,
	filterBackupDriftGroups,
	generateBackupConsolidateScript,
	generateOccMaintenanceChecklist,
} from '../tools/backupSnapshotSynchronizer'

export default {
	name: 'BackupDriftWorkbench',
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
			canonicalStrategy: 'live_then_newest',
			findingFilter: 'all',
			rootKindFilter: 'all',
			rootKeyFilter: '',
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
		report() {
			return buildBackupDriftReport(this.sourceDuplicates, {
				canonicalStrategy: this.canonicalStrategy,
			})
		},
		activeRootKinds() {
			return this.report.rootKindDistribution.filter(item => item.copyCount > 0)
		},
		filteredGroups() {
			return filterBackupDriftGroups(this.report.groups, {
				findingFilter: this.findingFilter,
				rootKindFilter: this.rootKindFilter,
				rootKeyFilter: this.rootKeyFilter,
				searchQuery: this.searchQuery,
				sortMode: this.sortMode,
			})
		},
		activeGroup() {
			if (this.filteredGroups.length === 0) {
				return null
			}
			const matched = this.filteredGroups.find(item => item.groupKey === this.selectedGroupKey)
			return matched || this.filteredGroups[0]
		},
		activePrunePlan() {
			return buildBackupPrunePlan(this.filteredGroups)
		},
		hasActiveFilters() {
			return this.findingFilter !== 'all'
				|| this.rootKindFilter !== 'all'
				|| this.rootKeyFilter !== ''
				|| this.searchQuery.trim() !== ''
				|| this.sortMode !== 'reclaim_desc'
				|| this.canonicalStrategy !== 'live_then_newest'
		},
	},
	watch: {
		filteredGroups: {
			immediate: true,
			handler(list) {
				if (!Array.isArray(list) || list.length === 0) {
					this.selectedGroupKey = ''
					return
				}
				if (!list.some(item => item.groupKey === this.selectedGroupKey)) {
					if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
						const byId = list.find(item => item.id === this.currentDuplicateId)
						if (byId) {
							this.selectedGroupKey = byId.groupKey
							return
						}
					}
					this.selectedGroupKey = list[0].groupKey
				}
			},
		},
	},
	methods: {
		toggleRootFilter(rootKey) {
			this.rootKeyFilter = this.rootKeyFilter === rootKey ? '' : rootKey
		},
		toggleRootKindFilter(rootKind) {
			this.rootKindFilter = this.rootKindFilter === rootKind ? 'all' : rootKind
		},
		resetFilters() {
			this.canonicalStrategy = 'live_then_newest'
			this.findingFilter = 'all'
			this.rootKindFilter = 'all'
			this.rootKeyFilter = ''
			this.sortMode = 'reclaim_desc'
			this.searchQuery = ''
		},
		severityBadgeClass(severity) {
			if (severity === 'critical') {
				return 'is-danger'
			}
			if (severity === 'high') {
				return 'is-warn'
			}
			if (severity === 'medium') {
				return 'is-info'
			}
			return 'is-safe'
		},
		formatSeverityLabel(severity) {
			const labels = {
				critical: this.t('duplicatefinder', 'Critical'),
				high: this.t('duplicatefinder', 'High'),
				medium: this.t('duplicatefinder', 'Medium'),
				low: this.t('duplicatefinder', 'Low'),
			}
			return labels[severity] || labels.low
		},
		dispositionBadgeClass(entry) {
			if (!entry) {
				return ''
			}
			if (entry.disposition === 'keep_canonical') {
				return 'is-safe'
			}
			if (entry.disposition === 'keep_drift_newer') {
				return 'is-danger'
			}
			if (entry.disposition === 'prune_safe_mirror') {
				return 'is-warn'
			}
			return 'is-info'
		},
		triggerDownload(content, mimeType, filename) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
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
		exportSyncPruneScript() {
			const script = generateBackupConsolidateScript(this.report, this.activePrunePlan)
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'nextcloud-backup-drift-sync-prune.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported dry-run-first snapshot sync and prune script with rollback manifest.')
		},
		exportOccChecklist() {
			const checklist = generateOccMaintenanceChecklist(this.report, this.activePrunePlan)
			this.triggerDownload(checklist, 'text/plain;charset=utf-8', 'nextcloud-backup-drift-occ-checklist.txt')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported scoped Nextcloud OCC maintenance checklist.')
		},
		exportJsonReport() {
			const json = exportBackupDriftJson(this.report, this.activePrunePlan)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-backup-drift-report.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported backup snapshot drift JSON manifest.')
		},
		exportCsvReport() {
			const csv = exportBackupDriftCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-backup-drift-audit.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported backup snapshot drift CSV audit.')
		},
		openPruneDialog() {
			if (this.activePrunePlan.safeCount === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.backupDriftPruneDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closePruneDialog() {
			const dialog = this.$refs.backupDriftPruneDialog
			if (dialog && typeof dialog.close === 'function') {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
		},
		onPruneDialogClose() {
			// Native close event handler
		},
		onPruneDialogBackdropClick(event) {
			const dialog = this.$refs.backupDriftPruneDialog
			if (dialog && event && event.target === dialog) {
				this.closePruneDialog()
			}
		},
		async confirmSafePrune() {
			const plan = this.activePrunePlan
			if (plan.safeCount === 0 || this.isDeleting) {
				this.closePruneDialog()
				return
			}

			this.isDeleting = true
			this.statusNotice = ''
			try {
				const filesToDelete = plan.pruneItems.map(item => item.file)
				const response = await deleteFiles(filesToDelete)
				const deletedIds = Array.isArray(response && response.deleted) ? response.deleted : []
				const failedIds = Array.isArray(response && response.failed) ? response.failed : []
				const deletedCount = deletedIds.length > 0 ? deletedIds.length : (failedIds.length === 0 ? plan.safeCount : 0)

				const deletedSet = new Set(deletedIds)
				const reclaimedBytes = deletedIds.length > 0
					? plan.pruneItems
						.filter(item => deletedSet.has(item.file.id) || deletedSet.has(item.selectionKey))
						.reduce((sum, item) => sum + item.size, 0)
					: (failedIds.length === 0 ? plan.safeBytes : 0)

				this.$emit('backup-drift-delete-completed', {
					deletedIds,
					deletedKeys: plan.pruneItems.map(item => item.selectionKey),
					reclaimedBytes,
					ruleLabel: this.t('duplicatefinder', 'Backup Snapshot Mirror Prune'),
				})

				this.statusNoticeType = failedIds.length > 0 ? 'error' : 'info'
				this.statusNotice = failedIds.length > 0
					? this.t('duplicatefinder', 'Pruned {deleted} snapshot copies ({size}), {failed} failed.', {
						deleted: deletedCount,
						size: formatBytes(reclaimedBytes),
						failed: failedIds.length,
					})
					: this.t('duplicatefinder', 'Pruned {deleted} redundant snapshot copies ({size} reclaimed). Canonical masters and newer drift copies preserved.', {
						deleted: deletedCount,
						size: formatBytes(reclaimedBytes),
					})
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Failed to prune snapshot copies: {message}', {
					message: error && error.message ? error.message : String(error),
				})
			} finally {
				this.isDeleting = false
				this.closePruneDialog()
			}
		},
	},
}
</script>

<style scoped>
.backup-drift-workbench {
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

.bdw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.bdw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.bdw__title {
	margin: 0;
	font-size: 1.08rem;
	font-weight: 700;
}

.bdw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: var(--border-radius-pill, 999px);
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
}

.bdw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bdw__tool-btn,
.bdw__seg-btn,
.bdw__mini-btn,
.bdw__primary-btn,
.bdw__danger-btn {
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
	max-inline-size: 100%;
	text-align: center;
}

.bdw__tool-btn:hover:not(:disabled),
.bdw__seg-btn:hover:not(:disabled),
.bdw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.bdw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-weight: 600;
}

.bdw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
	font-weight: 600;
}

.bdw__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
	font-weight: 600;
}

.bdw__danger-btn:hover:not(:disabled) {
	background-color: #a61b1b;
	border-color: #a61b1b;
}

.bdw__tool-btn:disabled,
.bdw__seg-btn:disabled,
.bdw__mini-btn:disabled,
.bdw__primary-btn:disabled,
.bdw__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.bdw__tool-btn:focus-visible,
.bdw__seg-btn:focus-visible,
.bdw__mini-btn:focus-visible,
.bdw__primary-btn:focus-visible,
.bdw__danger-btn:focus-visible,
.bdw__select:focus-visible,
.bdw__search-input:focus-visible,
.bdw__root-btn:focus-visible,
.bdw__group-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.bdw__empty,
.bdw__empty-matches {
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

.bdw__empty-title {
	margin: 0;
	font-weight: 600;
}

.bdw__empty-hint {
	margin: 0;
	font-size: 0.86rem;
	color: var(--color-text-maxcontrast);
}

.bdw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.bdw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.bdw__control-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.bdw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.bdw__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.bdw__field--grow {
	flex: 1 1 200px;
}

.bdw__select,
.bdw__search-input {
	min-block-size: 36px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	box-sizing: border-box;
	max-inline-size: 100%;
}

.bdw__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.bdw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-size: 0.85rem;
}

.bdw__notice.is-error {
	border-color: #c62828;
	background-color: rgba(198, 40, 40, 0.12);
}

.bdw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.bdw__kpi-card {
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

.bdw__kpi-label {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.bdw__kpi-value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.bdw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.bdw__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.bdw__panel,
.bdw__group-list-panel,
.bdw__detail-panel {
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

.bdw__panel-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.bdw__panel-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
}

.bdw__panel-meta {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.bdw__root-list,
.bdw__kind-list,
.bdw__group-list,
.bdw__file-list,
.bdw__reconcile-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.bdw__root-list {
	max-block-size: 280px;
	overflow-y: auto;
}

.bdw__root-btn,
.bdw__group-btn {
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

.bdw__root-btn:hover:not(:disabled),
.bdw__group-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.bdw__root-btn.is-active,
.bdw__group-btn.is-selected {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
}

.bdw__root-btn.is-drift {
	border-color: #d97706;
}

.bdw__root-top,
.bdw__root-foot,
.bdw__group-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.83rem;
}

.bdw__root-name,
.bdw__group-name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.bdw__root-stats,
.bdw__group-reclaim {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	flex-shrink: 0;
}

.bdw__bar-track {
	inline-size: 100%;
	block-size: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark, rgba(128, 128, 128, 0.2));
	overflow: hidden;
}

.bdw__bar-fill {
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element);
}

.bdw__warn-tag {
	color: #b45309;
	font-weight: 600;
	font-size: 0.78rem;
}

.bdw__reconcile-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid #d97706;
	background-color: rgba(217, 119, 6, 0.08);
}

.bdw__reconcile-title {
	margin: 0;
	font-size: 0.8rem;
	font-weight: 700;
}

.bdw__reconcile-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.78rem;
}

.bdw__reconcile-path {
	font-weight: 500;
	word-break: break-all;
}

.bdw__split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
	gap: 12px;
}

.bdw__group-list {
	max-block-size: 380px;
	overflow-y: auto;
}

.bdw__group-meta,
.bdw__file-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.bdw__detail-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.bdw__detail-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.bdw__detail-subtitle {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	word-break: break-all;
}

.bdw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.bdw__diagnoses {
	margin: 0;
	padding-block: 8px;
	padding-inline: 24px 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.8rem;
	line-height: 1.45;
}

.bdw__diagnosis-item + .bdw__diagnosis-item {
	margin-block-start: 4px;
}

.bdw__file-list {
	max-block-size: 320px;
	overflow-y: auto;
}

.bdw__file-row {
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

.bdw__file-main {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
	flex: 1 1 220px;
}

.bdw__file-path {
	font-size: 0.82rem;
	font-weight: 600;
	word-break: break-all;
}

.bdw__file-sub,
.bdw__file-reason {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.bdw__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	font-size: 0.72rem;
	font-weight: 600;
}

.bdw__badge.is-safe {
	border-color: #2e7d32;
	color: #2e7d32;
}

.bdw__badge.is-info {
	border-color: #0277bd;
	color: #0277bd;
}

.bdw__badge.is-warn {
	border-color: #d97706;
	color: #b45309;
}

.bdw__badge.is-danger {
	border-color: #b71c1c;
	color: #b71c1c;
}

.bdw__badge.is-finding {
	background-color: var(--color-background-hover);
}

.bdw__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.bdw__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.86rem;
	font-weight: 600;
}

.bdw__bulk-note {
	font-weight: 400;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.bdw__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.bdw-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.bdw-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.bdw-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.bdw-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.bdw-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.bdw-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.bdw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.bdw__analytics-grid,
	.bdw__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.backup-drift-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.bdw__tool-btn,
	.bdw__seg-btn,
	.bdw__mini-btn,
	.bdw__primary-btn,
	.bdw__danger-btn,
	.bdw__select,
	.bdw__search-input,
	.bdw__root-btn,
	.bdw__group-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.bdw__field {
		flex: 1 1 100%;
	}

	.bdw__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.bdw__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
