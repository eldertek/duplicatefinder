<template>
	<section
		class="share-mount-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Cross-Share Permission & Orphaned External-Mount Overlap Auditor')">
		<header class="smw__toolbar">
			<div class="smw__title-group">
				<h3 class="smw__title">
					{{ t('duplicatefinder', 'Cross-Share Permission & Orphaned External-Mount Auditor') }}
				</h3>
				<span
					class="smw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{groups} cross-boundary groups ({reclaim} safe reclaim, {orphaned} orphaned mount copies)', {
						groups: report.summary.auditedGroupsCount,
						reclaim: report.summary.safeReclaimableBytesFormatted,
						orphaned: report.summary.orphanedMountCopyCount,
					}) }}
				</span>
			</div>

			<div class="smw__toolbar-actions">
				<button
					type="button"
					class="smw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportRemediationScript">
					<span>{{ t('duplicatefinder', 'Export OCC Audit Script') }}</span>
				</button>
				<button
					type="button"
					class="smw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="smw__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportCsvReport">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="smw__tool-btn is-close"
					aria-keyshortcuts="]"
					:title="t('duplicatefinder', 'Hide cross-share permission and external-mount auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide share & mount auditor') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="smw__empty">
			<p class="smw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="smw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to audit cross-share shadows, Nextcloud CRUD+S permission mismatches, group folder leaks, and orphaned external storage mounts.') }}
			</p>
			<button
				type="button"
				class="smw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="smw__controls">
				<div class="smw__control-row">
					<span class="smw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="smw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Audit source scope')">
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="smw__control-label">{{ t('duplicatefinder', 'Findings') }}</span>
					<div
						class="smw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by share and mount finding')">
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'all' }"
							:aria-pressed="findingFilter === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'all'">
							<span>{{ t('duplicatefinder', 'All') }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'cross_share_shadow' }"
							:aria-pressed="findingFilter === 'cross_share_shadow' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'cross_share_shadow'">
							<span>{{ t('duplicatefinder', 'Cross-Share Shadows') }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'orphaned_external_mount' }"
							:aria-pressed="findingFilter === 'orphaned_external_mount' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'orphaned_external_mount'">
							<span>{{ t('duplicatefinder', 'Orphaned Mounts') }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'permission_asymmetry' }"
							:aria-pressed="findingFilter === 'permission_asymmetry' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'permission_asymmetry'">
							<span>{{ t('duplicatefinder', 'Permission Mismatches') }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'external_mount_egress_dup' }"
							:aria-pressed="findingFilter === 'external_mount_egress_dup' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'external_mount_egress_dup'">
							<span>{{ t('duplicatefinder', 'External Backends') }}</span>
						</button>
						<button
							type="button"
							class="smw__seg-btn"
							:class="{ 'is-active': findingFilter === 'safe_reclaim' }"
							:aria-pressed="findingFilter === 'safe_reclaim' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="findingFilter = 'safe_reclaim'">
							<span>{{ t('duplicatefinder', 'Safe Reclaim Only') }}</span>
						</button>
					</div>
				</div>

				<div class="smw__control-row">
					<label class="smw__field">
						<span class="smw__control-label">{{ t('duplicatefinder', 'Boundary') }}</span>
						<select
							v-model="boundaryFilter"
							class="smw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter by storage boundary')">
							<option value="all">{{ t('duplicatefinder', 'All boundaries') }}</option>
							<option value="user_home">{{ t('duplicatefinder', 'User Homes') }}</option>
							<option value="internal_share">{{ t('duplicatefinder', 'Internal Shares') }}</option>
							<option value="group_folder">{{ t('duplicatefinder', 'Group Folders') }}</option>
							<option value="external_mount">{{ t('duplicatefinder', 'External Mounts') }}</option>
							<option value="federated_share">{{ t('duplicatefinder', 'Federated Shares') }}</option>
							<option value="orphaned_mount">{{ t('duplicatefinder', 'Orphaned Mounts') }}</option>
						</select>
					</label>

					<label class="smw__field">
						<span class="smw__control-label">{{ t('duplicatefinder', 'Severity') }}</span>
						<select
							v-model="severityFilter"
							class="smw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter by audit severity')">
							<option value="all">{{ t('duplicatefinder', 'All severities') }}</option>
							<option value="high_plus">{{ t('duplicatefinder', 'Critical & High') }}</option>
							<option value="critical">{{ t('duplicatefinder', 'Critical only') }}</option>
						</select>
					</label>

					<label class="smw__field">
						<span class="smw__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortMode"
							class="smw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort audited groups')">
							<option value="reclaim_desc">{{ t('duplicatefinder', 'Largest safe reclaim') }}</option>
							<option value="risk_desc">{{ t('duplicatefinder', 'Highest risk score') }}</option>
							<option value="boundaries_desc">{{ t('duplicatefinder', 'Most boundaries crossed') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="smw__field smw__field--grow">
						<span class="smw__control-label">{{ t('duplicatefinder', 'Search') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="smw__search-input"
							:disabled="isDeleting"
							:placeholder="t('duplicatefinder', 'Filter path, mount ID, S3/SMB backend, share owner...')"
							:aria-label="t('duplicatefinder', 'Search audited cross-share and mount copies')">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="smw__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="smw__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="smw__kpis">
				<div class="smw__kpi-card">
					<span class="smw__kpi-label">{{ t('duplicatefinder', 'Cross-Boundary Groups') }}</span>
					<strong class="smw__kpi-value">{{ report.summary.auditedGroupsCount }}</strong>
					<span class="smw__kpi-sub">
						{{ t('duplicatefinder', '{copies} copies across {roots} storage roots', {
							copies: report.summary.totalAuditedCopiesCount,
							roots: report.summary.mountRootsCount,
						}) }}
					</span>
				</div>

				<div class="smw__kpi-card">
					<span class="smw__kpi-label">{{ t('duplicatefinder', 'Cross-Share & Permission Risks') }}</span>
					<strong class="smw__kpi-value">{{ report.summary.crossShareRiskGroupsCount }}</strong>
					<span class="smw__kpi-sub">
						{{ t('duplicatefinder', '{size} overlapping payload', {
							size: report.summary.crossShareRiskBytesFormatted,
						}) }}
					</span>
				</div>

				<div class="smw__kpi-card">
					<span class="smw__kpi-label">{{ t('duplicatefinder', 'Orphaned / Offline Mounts') }}</span>
					<strong class="smw__kpi-value">{{ report.summary.orphanedMountCopyCount }}</strong>
					<span class="smw__kpi-sub">
						{{ t('duplicatefinder', '{roots} orphaned roots ({size})', {
							roots: report.summary.orphanedRootsCount,
							size: report.summary.orphanedMountBytesFormatted,
						}) }}
					</span>
				</div>

				<div class="smw__kpi-card">
					<span class="smw__kpi-label">{{ t('duplicatefinder', 'Safe Shadow Reclaim') }}</span>
					<strong class="smw__kpi-value">{{ report.summary.safeReclaimableBytesFormatted }}</strong>
					<span class="smw__kpi-sub">
						{{ t('duplicatefinder', '{safe} writable shadows | {blocked} blocked', {
							safe: report.summary.safeReclaimableCount,
							blocked: report.summary.blockedCount,
						}) }}
					</span>
				</div>
			</div>

			<div v-if="report.groups.length === 0" class="smw__empty">
				<p class="smw__empty-title">
					{{ t('duplicatefinder', 'No cross-share or external-mount overlaps detected in current scope') }}
				</p>
				<p class="smw__empty-hint">
					{{ t('duplicatefinder', 'All {count} scanned groups stay within a single writable user home without share, group folder, or external mount crossings.', {
						count: report.summary.totalScannedGroupsCount,
					}) }}
				</p>
			</div>

			<template v-else>
				<div class="smw__analytics-grid">
					<section class="smw__panel" :aria-label="t('duplicatefinder', 'Storage boundary breakdown')">
						<div class="smw__panel-head">
							<h4 class="smw__panel-title">
								{{ t('duplicatefinder', 'Boundary Distribution') }}
							</h4>
							<span class="smw__panel-meta">
								{{ t('duplicatefinder', 'Click a boundary to filter') }}
							</span>
						</div>
						<ul class="smw__boundary-list">
							<li
								v-for="item in activeBoundaries"
								:key="item.boundaryType"
								class="smw__boundary-item">
								<button
									type="button"
									class="smw__boundary-btn"
									:class="{ 'is-active': boundaryFilter === item.boundaryType }"
									:aria-pressed="boundaryFilter === item.boundaryType ? 'true' : 'false'"
									:disabled="isDeleting"
									@click="toggleBoundaryFilter(item.boundaryType)">
									<div class="smw__boundary-top">
										<span class="smw__boundary-name">{{ item.label }}</span>
										<span class="smw__boundary-stats">
											{{ item.copyCount }} ({{ item.totalBytesFormatted }})
										</span>
									</div>
									<div class="smw__bar-track">
										<div
											class="smw__bar-fill"
											:style="{ width: `${Math.max(4, item.sharePercent)}%` }" />
									</div>
									<div class="smw__boundary-foot">
										<span>{{ t('duplicatefinder', '{pct}% of audited copies', { pct: item.sharePercent }) }}</span>
										<span v-if="item.blockedCount > 0" class="smw__warn-tag">
											{{ t('duplicatefinder', '{count} blocked/readonly', { count: item.blockedCount }) }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<section class="smw__panel" :aria-label="t('duplicatefinder', 'Mount and share root registry')">
						<div class="smw__panel-head">
							<h4 class="smw__panel-title">
								{{ t('duplicatefinder', 'Mount & Share Root Registry') }}
							</h4>
							<span class="smw__panel-meta">
								{{ t('duplicatefinder', '{count} detected roots', { count: report.mountRegistry.length }) }}
							</span>
						</div>
						<div class="smw__mount-chips">
							<button
								v-for="mount in report.mountRegistry"
								:key="mount.rootKey"
								type="button"
								class="smw__chip-btn"
								:class="{
									'is-active': mountFilter === mount.rootKey,
									'is-orphaned': mount.isOrphaned,
								}"
								:aria-pressed="mountFilter === mount.rootKey ? 'true' : 'false'"
								:disabled="isDeleting"
								@click="toggleMountFilter(mount.rootKey)">
								<span>
									{{ mount.rootLabel }} [{{ mount.backendLabel }} | {{ mount.mountStatus }}] ({{ mount.copyCount }}, {{ mount.totalBytesFormatted }})
								</span>
							</button>
						</div>
					</section>
				</div>

				<div v-if="filteredGroups.length === 0" class="smw__empty-matches">
					<p class="smw__empty-title">
						{{ t('duplicatefinder', 'No audited groups match your active filters') }}
					</p>
					<button
						type="button"
						class="smw__mini-btn"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Clear filters') }}</span>
					</button>
				</div>

				<div v-else class="smw__split">
					<section class="smw__group-list-panel" :aria-label="t('duplicatefinder', 'Audited cross-share groups')">
						<div class="smw__panel-head">
							<h4 class="smw__panel-title">
								{{ t('duplicatefinder', 'Audited Groups ({count})', { count: filteredGroups.length }) }}
							</h4>
						</div>
						<ul class="smw__group-list">
							<li
								v-for="group in filteredGroups"
								:key="group.groupKey"
								class="smw__group-item">
								<button
									type="button"
									class="smw__group-btn"
									:class="{ 'is-selected': activeGroup && activeGroup.groupKey === group.groupKey }"
									:aria-pressed="activeGroup && activeGroup.groupKey === group.groupKey ? 'true' : 'false'"
									@click="selectedGroupKey = group.groupKey">
									<div class="smw__group-top">
										<span class="smw__group-name">{{ group.primaryName }}</span>
										<span class="smw__group-reclaim">{{ group.reclaimableBytesFormatted }}</span>
									</div>
									<div class="smw__group-meta">
										<span class="smw__badge" :class="severityBadgeClass(group.severity)">
											{{ formatSeverityLabel(group.severity) }}
										</span>
										<span class="smw__badge">
											{{ t('duplicatefinder', '{copies} copies / {boundaries} boundaries', {
												copies: group.copyCount,
												boundaries: group.boundaryCount,
											}) }}
										</span>
										<span
											v-for="label in group.findingLabels"
											:key="`${group.groupKey}-${label}`"
											class="smw__badge is-finding">
											{{ label }}
										</span>
									</div>
								</button>
							</li>
						</ul>
					</section>

					<section
						v-if="activeGroup"
						class="smw__detail-panel"
						:aria-label="t('duplicatefinder', 'Share and mount forensic inspector')">
						<div class="smw__detail-head">
							<div>
								<h4 class="smw__detail-title">
									{{ activeGroup.primaryName }}
								</h4>
								<p class="smw__detail-subtitle">
									{{ t('duplicatefinder', 'Canonical master ({boundary}): {path}', {
										boundary: activeGroup.canonicalMasterBoundary,
										path: activeGroup.canonicalMasterPath,
									}) }}
								</p>
							</div>
							<div class="smw__detail-actions">
								<button
									type="button"
									class="smw__mini-btn"
									@click="$emit('select-duplicate', activeGroup)">
									<span>{{ t('duplicatefinder', 'Inspect in Main View') }}</span>
								</button>
								<button
									type="button"
									class="smw__mini-btn"
									@click="$emit('compare-duplicate', activeGroup)">
									<span>{{ t('duplicatefinder', 'Open Compare View') }}</span>
								</button>
							</div>
						</div>

						<ul class="smw__diagnoses">
							<li
								v-for="(diag, dIdx) in activeGroup.diagnoses"
								:key="`${activeGroup.groupKey}-diag-${dIdx}`"
								class="smw__diagnosis-item">
								{{ diag }}
							</li>
						</ul>

						<ul class="smw__file-list">
							<li
								v-for="entry in activeGroup.entries"
								:key="`${activeGroup.groupKey}-${entry.selectionKey}`"
								class="smw__file-row">
								<div class="smw__file-main">
									<span class="smw__file-path">{{ entry.path }}</span>
									<span class="smw__file-sub">
										{{ entry.sizeFormatted }} | {{ entry.boundary.rootLabel }} | {{ entry.boundary.backendLabel }} ({{ entry.boundary.mountStatus }})
									</span>
									<span v-if="entry.boundary.shareOwner || entry.boundary.sharedWith || entry.boundary.mountId" class="smw__file-sub">
										<template v-if="entry.boundary.mountId">
											{{ t('duplicatefinder', 'Mount ID: {id}', { id: entry.boundary.mountId }) }}
										</template>
										<template v-if="entry.boundary.shareOwner">
											{{ t('duplicatefinder', 'Owner: {owner}', { owner: entry.boundary.shareOwner }) }}
										</template>
										<template v-if="entry.boundary.sharedWith">
											{{ t('duplicatefinder', 'Shared with: {target}', { target: entry.boundary.sharedWith }) }}
										</template>
									</span>
									<span class="smw__file-reason">{{ entry.permissions.reason }}</span>
								</div>
								<div class="smw__file-badges">
									<span class="smw__badge">
										{{ entry.boundary.boundaryLabel }}
									</span>
									<span class="smw__badge" :class="permissionBadgeClass(entry)">
										{{ entry.permissions.permissionLabel }} (mask {{ entry.permissions.permissionMask }})
									</span>
									<span class="smw__badge" :class="dispositionBadgeClass(entry)">
										{{ entry.dispositionLabel }}
									</span>
								</div>
							</li>
						</ul>
					</section>
				</div>

				<footer class="smw__bulk-bar">
					<div class="smw__bulk-summary">
						<span>
							{{ t('duplicatefinder', 'Safe Reclaim Plan: {count} writable shadow copies ({size})', {
								count: activeReclaimPlan.safeCount,
								size: activeReclaimPlan.safeBytesFormatted,
							}) }}
						</span>
						<span class="smw__bulk-note">
							{{ t('duplicatefinder', '{blocked} copies blocked by permissions/locks/offline mounts ({orphaned} orphaned).', {
								blocked: activeReclaimPlan.blockedCount,
								orphaned: activeReclaimPlan.orphanedCount,
							}) }}
						</span>
					</div>
					<div class="smw__bulk-actions">
						<button
							type="button"
							class="smw__danger-btn"
							:disabled="activeReclaimPlan.safeCount === 0 || isDeleting"
							@click="openReclaimDialog">
							<span>
								{{ isDeleting
									? t('duplicatefinder', 'Reclaiming...')
									: t('duplicatefinder', 'Reclaim Safe Shadow Copies ({count})', { count: activeReclaimPlan.safeCount }) }}
							</span>
						</button>
					</div>
				</footer>
			</template>
		</template>

		<dialog
			ref="shareMountReclaimDialog"
			class="smw-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe cross-share shadow reclaim')"
			@close="onReclaimDialogClose"
			@click="onReclaimDialogBackdropClick">
			<div class="smw-confirm-dialog__content">
				<h4 class="smw-confirm-dialog__title">
					{{ t('duplicatefinder', 'Reclaim verified writable shadow copies?') }}
				</h4>
				<p class="smw-confirm-dialog__body">
					{{ t('duplicatefinder', 'This deletes {count} writable shadow copies ({size}) across {groups} audited groups. Canonical masters, read-only shares, locked files, protected origins, and {orphaned} orphaned mount copies are preserved.', {
						count: activeReclaimPlan.safeCount,
						size: activeReclaimPlan.safeBytesFormatted,
						groups: activeReclaimPlan.groupsImpacted,
						orphaned: activeReclaimPlan.orphanedCount,
					}) }}
				</p>
				<div class="smw-confirm-dialog__actions">
					<button
						type="button"
						class="smw__mini-btn"
						:disabled="isDeleting"
						@click="closeReclaimDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="smw__danger-btn"
						:disabled="isDeleting"
						@click="confirmSafeReclaim">
						<span>{{ t('duplicatefinder', 'Confirm safe reclaim') }}</span>
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
	buildShareMountAuditReport,
	buildShareMountReclaimPlan,
	exportShareMountCsv,
	exportShareMountJson,
	filterShareMountGroups,
	generateShareMountRemediationScript,
} from '../tools/shareMountOverlapAuditor'

export default {
	name: 'ShareMountAuditorWorkbench',
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
			findingFilter: 'all',
			boundaryFilter: 'all',
			severityFilter: 'all',
			mountFilter: '',
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
			return buildShareMountAuditReport(this.sourceDuplicates)
		},
		activeBoundaries() {
			return this.report.boundaries.filter(item => item.copyCount > 0)
		},
		filteredGroups() {
			return filterShareMountGroups(this.report.groups, {
				findingFilter: this.findingFilter,
				boundaryFilter: this.boundaryFilter,
				severityFilter: this.severityFilter,
				mountFilter: this.mountFilter,
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
			return buildShareMountReclaimPlan(this.filteredGroups, {
				boundaryFilter: this.boundaryFilter,
				mountFilter: this.mountFilter,
			})
		},
		hasActiveFilters() {
			return this.findingFilter !== 'all'
				|| this.boundaryFilter !== 'all'
				|| this.severityFilter !== 'all'
				|| this.mountFilter !== ''
				|| this.searchQuery.trim() !== ''
		},
	},
	methods: {
		toggleBoundaryFilter(boundaryType) {
			this.boundaryFilter = this.boundaryFilter === boundaryType ? 'all' : boundaryType
		},
		toggleMountFilter(rootKey) {
			this.mountFilter = this.mountFilter === rootKey ? '' : rootKey
		},
		resetFilters() {
			this.findingFilter = 'all'
			this.boundaryFilter = 'all'
			this.severityFilter = 'all'
			this.mountFilter = ''
			this.searchQuery = ''
			this.sortMode = 'reclaim_desc'
		},
		severityBadgeClass(severity) {
			if (severity === 'critical') {
				return 'is-danger'
			}
			if (severity === 'high') {
				return 'is-warn'
			}
			return 'is-info'
		},
		formatSeverityLabel(severity) {
			if (severity === 'critical') {
				return this.t('duplicatefinder', 'Critical')
			}
			if (severity === 'high') {
				return this.t('duplicatefinder', 'High')
			}
			if (severity === 'medium') {
				return this.t('duplicatefinder', 'Medium')
			}
			return this.t('duplicatefinder', 'Low')
		},
		permissionBadgeClass(entry) {
			if (entry.permissions.isOrphanedMount) {
				return 'is-danger'
			}
			if (entry.permissions.isReadOnly || entry.permissions.isLocked || entry.permissions.isOriginProtected) {
				return 'is-warn'
			}
			return 'is-safe'
		},
		dispositionBadgeClass(entry) {
			if (entry.disposition === 'canonical_master') {
				return 'is-info'
			}
			if (entry.disposition === 'safe_reclaim') {
				return 'is-safe'
			}
			if (entry.disposition === 'orphaned_blocked') {
				return 'is-danger'
			}
			return 'is-warn'
		},
		openReclaimDialog() {
			if (this.activeReclaimPlan.safeCount === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.shareMountReclaimDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			}
		},
		closeReclaimDialog() {
			const dialog = this.$refs.shareMountReclaimDialog
			if (dialog && typeof dialog.close === 'function' && dialog.open) {
				dialog.close()
			}
		},
		onReclaimDialogClose() {
			// Native dialog close handler
		},
		onReclaimDialogBackdropClick(event) {
			if (event && event.target === this.$refs.shareMountReclaimDialog) {
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
				this.statusNotice = this.t('duplicatefinder', 'Reclaimed {count} writable shadow copies ({size}).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('share-mount-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: this.filteredGroups.length,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeReclaimDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not reclaim selected shadow copies.')
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
		exportRemediationScript() {
			const script = generateShareMountRemediationScript(this.activeReclaimPlan, this.report)
			this.triggerDownload('duplicatefinder-share-mount-audit.sh', script, 'text/x-shellscript;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported dry-run OCC external-mount & share remediation script.')
		},
		exportJsonReport() {
			const json = exportShareMountJson(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-share-mount-audit.json', json, 'application/json;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported cross-share & external-mount JSON report.')
		},
		exportCsvReport() {
			const csv = exportShareMountCsv(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-share-mount-audit.csv', csv, 'text/csv;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe cross-share & external-mount CSV.')
		},
	},
}
</script>

<style scoped>
.share-mount-workbench {
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

.smw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.smw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.smw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.smw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.smw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.smw__tool-btn,
.smw__seg-btn,
.smw__mini-btn,
.smw__chip-btn,
.smw__primary-btn,
.smw__danger-btn {
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

.smw__chip-btn {
	text-align: start;
	overflow-wrap: anywhere;
}

.smw__tool-btn:hover:not(:disabled),
.smw__seg-btn:hover:not(:disabled),
.smw__mini-btn:hover:not(:disabled),
.smw__chip-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.smw__seg-btn.is-active,
.smw__chip-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-weight: 600;
}

.smw__chip-btn.is-orphaned {
	border-color: #b71c1c;
}

.smw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
	font-weight: 600;
}

.smw__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
	font-weight: 600;
}

.smw__danger-btn:hover:not(:disabled) {
	background-color: #a61b1b;
	border-color: #a61b1b;
}

.smw__tool-btn:disabled,
.smw__seg-btn:disabled,
.smw__mini-btn:disabled,
.smw__chip-btn:disabled,
.smw__primary-btn:disabled,
.smw__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.smw__tool-btn:focus-visible,
.smw__seg-btn:focus-visible,
.smw__mini-btn:focus-visible,
.smw__chip-btn:focus-visible,
.smw__primary-btn:focus-visible,
.smw__danger-btn:focus-visible,
.smw__select:focus-visible,
.smw__search-input:focus-visible,
.smw__boundary-btn:focus-visible,
.smw__group-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.smw__empty,
.smw__empty-matches {
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

.smw__empty-title {
	margin: 0;
	font-weight: 600;
}

.smw__empty-hint {
	margin: 0;
	font-size: 0.86rem;
	color: var(--color-text-maxcontrast);
}

.smw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.smw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.smw__control-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.smw__segments,
.smw__mount-chips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.smw__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.smw__field--grow {
	flex: 1 1 200px;
}

.smw__select,
.smw__search-input {
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

.smw__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.smw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-size: 0.85rem;
}

.smw__notice.is-error {
	border-color: #c62828;
	background-color: rgba(198, 40, 40, 0.12);
}

.smw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.smw__kpi-card {
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

.smw__kpi-label {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.smw__kpi-value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.smw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.smw__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.smw__panel,
.smw__group-list-panel,
.smw__detail-panel {
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

.smw__panel-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.smw__panel-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
}

.smw__panel-meta {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.smw__boundary-list,
.smw__group-list,
.smw__file-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.smw__boundary-btn,
.smw__group-btn {
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

.smw__boundary-btn:hover:not(:disabled),
.smw__group-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.smw__boundary-btn.is-active,
.smw__group-btn.is-selected {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
}

.smw__boundary-top,
.smw__boundary-foot,
.smw__group-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.83rem;
}

.smw__boundary-name,
.smw__group-name {
	font-weight: 600;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.smw__boundary-stats,
.smw__group-reclaim {
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	flex-shrink: 0;
}

.smw__bar-track {
	inline-size: 100%;
	block-size: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark, rgba(128, 128, 128, 0.2));
	overflow: hidden;
}

.smw__bar-fill {
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element);
}

.smw__warn-tag {
	color: #b45309;
	font-weight: 600;
}

.smw__mount-chips {
	max-block-size: 240px;
	overflow-y: auto;
	align-content: flex-start;
}

.smw__split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
	gap: 12px;
}

.smw__group-list {
	max-block-size: 380px;
	overflow-y: auto;
}

.smw__group-meta,
.smw__file-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.smw__detail-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.smw__detail-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.smw__detail-subtitle {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	word-break: break-all;
}

.smw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.smw__diagnoses {
	margin: 0;
	padding-block: 8px;
	padding-inline: 24px 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.8rem;
	line-height: 1.45;
}

.smw__diagnosis-item + .smw__diagnosis-item {
	margin-block-start: 4px;
}

.smw__file-list {
	max-block-size: 320px;
	overflow-y: auto;
}

.smw__file-row {
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

.smw__file-main {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
	flex: 1 1 220px;
}

.smw__file-path {
	font-size: 0.82rem;
	font-weight: 600;
	word-break: break-all;
}

.smw__file-sub,
.smw__file-reason {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.smw__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	font-size: 0.72rem;
	font-weight: 600;
}

.smw__badge.is-safe {
	border-color: #2e7d32;
	color: #2e7d32;
}

.smw__badge.is-info {
	border-color: #0277bd;
	color: #0277bd;
}

.smw__badge.is-warn {
	border-color: #d97706;
	color: #b45309;
}

.smw__badge.is-danger {
	border-color: #b71c1c;
	color: #b71c1c;
}

.smw__badge.is-finding {
	background-color: var(--color-background-hover);
}

.smw__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.smw__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.86rem;
	font-weight: 600;
}

.smw__bulk-note {
	font-weight: 400;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.smw__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.smw-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.smw-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.smw-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.smw-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.smw-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.smw-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.smw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.smw__analytics-grid,
	.smw__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.share-mount-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.smw__tool-btn,
	.smw__seg-btn,
	.smw__mini-btn,
	.smw__chip-btn,
	.smw__primary-btn,
	.smw__danger-btn,
	.smw__select,
	.smw__search-input,
	.smw__boundary-btn,
	.smw__group-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.smw__field {
		flex: 1 1 100%;
	}

	.smw__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.smw__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
