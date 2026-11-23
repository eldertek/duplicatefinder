<template>
	<section
		class="quota-attribution-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Multi-Root Cross-User Quota Attribution & Chargeback Heatmap')">
		<header class="quota-wb__toolbar">
			<div class="quota-wb__title-group">
				<h3 class="quota-wb__title">
					{{ t('duplicatefinder', 'Multi-Root Cross-User Quota Attribution & Chargeback Heatmap') }}
				</h3>
				<span
					class="quota-wb__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{owners} owners across {roots} roots ({waste} attributed, {charge}/mo)', {
						owners: report.summary.ownerCount,
						roots: report.summary.rootCount,
						waste: report.summary.totalAttributedBytesFormatted,
						charge: report.summary.estimatedMonthlyChargeFormatted,
					}) }}
				</span>
			</div>

			<div class="quota-wb__toolbar-actions">
				<button
					type="button"
					class="quota-wb__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="quota-wb__tool-btn"
					:disabled="report.groups.length === 0 || isDeleting"
					@click="exportCsvReport">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="quota-wb__tool-btn is-close"
					aria-keyshortcuts="-"
					:title="t('duplicatefinder', 'Hide multi-root cross-user quota attribution workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide quota heatmap') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="quota-wb__empty">
			<p class="quota-wb__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="quota-wb__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to attribute duplicate waste across user homes, group folders, external mounts, and shared storage roots.') }}
			</p>
			<button
				type="button"
				class="quota-wb__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="quota-wb__controls">
				<div class="quota-wb__control-row">
					<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="quota-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Quota attribution scope')">
						<button
							type="button"
							class="quota-wb__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="quota-wb__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Roots') }}</span>
					<div
						class="quota-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Storage root granularity')">
						<button
							type="button"
							class="quota-wb__seg-btn"
							:class="{ 'is-active': rootGranularity === 'mount' }"
							:aria-pressed="rootGranularity === 'mount' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="rootGranularity = 'mount'">
							<span>{{ t('duplicatefinder', 'User & Mount Roots') }}</span>
						</button>
						<button
							type="button"
							class="quota-wb__seg-btn"
							:class="{ 'is-active': rootGranularity === 'top_folder' }"
							:aria-pressed="rootGranularity === 'top_folder' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="rootGranularity = 'top_folder'">
							<span>{{ t('duplicatefinder', 'Top-Level Folders') }}</span>
						</button>
					</div>

					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Policy') }}</span>
						<select
							v-model="policy"
							class="quota-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Chargeback attribution policy')">
							<option value="surplus_extra">{{ t('duplicatefinder', 'Extra-copy waste') }}</option>
							<option value="equal_split">{{ t('duplicatefinder', 'Equal split across copies') }}</option>
							<option value="gross_footprint">{{ t('duplicatefinder', 'Gross duplicated footprint') }}</option>
						</select>
					</label>

					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Keeper') }}</span>
						<select
							v-model="keeperStrategy"
							class="quota-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Canonical keeper tie-breaker')">
							<option value="origin_first">{{ t('duplicatefinder', 'Protected origin first') }}</option>
							<option value="oldest">{{ t('duplicatefinder', 'Oldest file') }}</option>
							<option value="newest">{{ t('duplicatefinder', 'Newest file') }}</option>
							<option value="shortest_path">{{ t('duplicatefinder', 'Shortest path') }}</option>
						</select>
					</label>
				</div>

				<div class="quota-wb__control-row">
					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Rate / GiB / mo') }}</span>
						<input
							v-model="costRateInput"
							type="number"
							step="0.005"
							min="0"
							class="quota-wb__num-input"
							:aria-label="t('duplicatefinder', 'Monthly storage chargeback rate per GiB')"
							:disabled="isDeleting">
					</label>

					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Currency') }}</span>
						<select
							v-model="currency"
							class="quota-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Chargeback currency')">
							<option value="EUR">EUR</option>
							<option value="USD">USD</option>
							<option value="GBP">GBP</option>
						</select>
					</label>

					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Alert quota (MiB)') }}</span>
						<input
							v-model="quotaThresholdInput"
							type="number"
							step="10"
							min="1"
							class="quota-wb__num-input"
							:aria-label="t('duplicatefinder', 'Duplicate waste quota threshold in MiB')"
							:disabled="isDeleting">
					</label>

					<label class="quota-wb__field">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortBy"
							class="quota-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort attributed groups')">
							<option value="attributed_desc">{{ t('duplicatefinder', 'Attributed waste (highest)') }}</option>
							<option value="gross_desc">{{ t('duplicatefinder', 'Gross footprint (highest)') }}</option>
							<option value="owners_desc">{{ t('duplicatefinder', 'Cross-user spread') }}</option>
							<option value="copies_desc">{{ t('duplicatefinder', 'Copy count') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="quota-wb__field is-grow">
						<span class="quota-wb__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="quota-wb__search-input"
							:placeholder="t('duplicatefinder', 'Search owner, root, path, filename, or hash...')"
							:aria-label="t('duplicatefinder', 'Filter quota attribution groups')"
							:disabled="isDeleting">
					</label>

					<button
						type="button"
						class="quota-wb__seg-btn"
						:class="{ 'is-active': crossUserOnly }"
						:aria-pressed="crossUserOnly ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="crossUserOnly = !crossUserOnly">
						<span>{{ t('duplicatefinder', 'Cross-user only') }}</span>
					</button>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="quota-wb__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="quota-wb__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="quota-wb__kpis">
				<div class="quota-wb__kpi">
					<span class="quota-wb__kpi-label">{{ t('duplicatefinder', 'Attributed waste & showback') }}</span>
					<strong class="quota-wb__kpi-value">
						{{ report.summary.totalAttributedBytesFormatted }} ({{ report.summary.estimatedMonthlyChargeFormatted }}/mo)
					</strong>
				</div>
				<div class="quota-wb__kpi">
					<span class="quota-wb__kpi-label">{{ t('duplicatefinder', 'Cross-user / cross-root groups') }}</span>
					<strong class="quota-wb__kpi-value">
						{{ report.summary.crossUserGroupCount }} / {{ report.summary.crossRootGroupCount }}
					</strong>
				</div>
				<div class="quota-wb__kpi">
					<span class="quota-wb__kpi-label">{{ t('duplicatefinder', 'Owners above waste quota') }}</span>
					<strong class="quota-wb__kpi-value">
						{{ report.summary.overQuotaOwnerCount }} / {{ report.summary.ownerCount }}
					</strong>
				</div>
				<div class="quota-wb__kpi">
					<span class="quota-wb__kpi-label">{{ t('duplicatefinder', 'Safe recoverable savings') }}</span>
					<strong class="quota-wb__kpi-value">
						{{ activePrunePlan.reclaimableBytesFormatted }} ({{ activePrunePlan.estimatedMonthlySavingsFormatted }}/mo)
					</strong>
				</div>
			</div>

			<div class="quota-wb__panel-card">
				<div class="quota-wb__panel-head">
					<div>
						<h4 class="quota-wb__sub-title">
							{{ t('duplicatefinder', 'Owner x Storage Root Chargeback Heatmap (Click cell to isolate)') }}
						</h4>
						<p class="quota-wb__sub-hint">
							{{ t('duplicatefinder', 'Color intensity reflects attributed duplicate waste per owner and storage root.') }}
						</p>
					</div>
					<div class="quota-wb__legend" aria-hidden="true">
						<span class="quota-wb__legend-chip is-heat-low">{{ t('duplicatefinder', 'Low') }}</span>
						<span class="quota-wb__legend-chip is-heat-medium">{{ t('duplicatefinder', 'Medium') }}</span>
						<span class="quota-wb__legend-chip is-heat-high">{{ t('duplicatefinder', 'High') }}</span>
						<span class="quota-wb__legend-chip is-heat-critical">{{ t('duplicatefinder', 'Critical') }}</span>
					</div>
				</div>

				<div v-if="report.heatmap.rows.length === 0" class="quota-wb__panel-empty">
					{{ t('duplicatefinder', 'No multi-root attribution cells available in current scope.') }}
				</div>
				<div v-else class="quota-wb__matrix-scroll">
					<table class="quota-wb__matrix">
						<thead>
							<tr>
								<th scope="col" class="quota-wb__matrix-corner">
									{{ t('duplicatefinder', 'Owner / Root') }}
								</th>
								<th
									v-for="col in report.heatmap.roots"
									:key="col.rootKey"
									scope="col"
									class="quota-wb__matrix-col-head">
									<button
										type="button"
										class="quota-wb__axis-btn"
										:class="{ 'is-active': rootFilter === col.rootKey && !ownerFilter }"
										:aria-pressed="rootFilter === col.rootKey ? 'true' : 'false'"
										@click="toggleRootFilter(col.rootKey)">
										<span>{{ col.rootLabel }}</span>
									</button>
								</th>
								<th scope="col" class="quota-wb__matrix-total-head">
									{{ t('duplicatefinder', 'Owner Total') }}
								</th>
							</tr>
						</thead>
						<tbody>
							<tr v-for="row in report.heatmap.rows" :key="row.owner">
								<th scope="row" class="quota-wb__matrix-row-head">
									<button
										type="button"
										class="quota-wb__axis-btn"
										:class="{ 'is-active': ownerFilter === row.owner && !rootFilter }"
										:aria-pressed="ownerFilter === row.owner ? 'true' : 'false'"
										@click="toggleOwnerFilter(row.owner)">
										<span class="quota-wb__owner-name">{{ row.owner }}</span>
										<span
											v-if="row.ownerSummary.overQuota"
											class="quota-wb__quota-flag">
											{{ t('duplicatefinder', 'Over quota') }}
										</span>
									</button>
								</th>
								<td
									v-for="cell in row.cells"
									:key="cell.cellKey"
									class="quota-wb__matrix-td">
									<button
										v-if="cell.fileCount > 0"
										type="button"
										class="quota-wb__heat-cell"
										:class="[
											`is-heat-${cell.heatTier}`,
											{ 'is-active': ownerFilter === cell.owner && rootFilter === cell.rootKey },
										]"
										:aria-pressed="ownerFilter === cell.owner && rootFilter === cell.rootKey ? 'true' : 'false'"
										:title="`${cell.owner} @ ${cell.rootLabel}: ${cell.attributedBytesFormatted} (${cell.fileCount} files)`"
										@click="toggleCellFilter(cell)">
										<span class="quota-wb__cell-bytes">{{ cell.attributedBytesFormatted }}</span>
										<span class="quota-wb__cell-meta">
											{{ cell.fileCount }}f
											<template v-if="cell.crossUserOverlapCount > 0">
												| {{ cell.crossUserOverlapCount }}x
											</template>
										</span>
									</button>
									<span v-else class="quota-wb__heat-empty" aria-hidden="true">-</span>
								</td>
								<td class="quota-wb__matrix-row-total">
									<strong>{{ row.ownerSummary.attributedBytesFormatted }}</strong>
									<span>{{ row.ownerSummary.estimatedMonthlyChargeFormatted }}</span>
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			</div>

			<div class="quota-wb__analytics-grid">
				<div class="quota-wb__panel-card">
					<div class="quota-wb__panel-head">
						<h4 class="quota-wb__sub-title">
							{{ t('duplicatefinder', 'Owner Chargeback & Quota Ledger') }}
						</h4>
						<button
							v-if="ownerFilter"
							type="button"
							class="quota-wb__mini-btn"
							@click="ownerFilter = ''">
							<span>{{ t('duplicatefinder', 'All owners') }}</span>
						</button>
					</div>
					<div v-if="report.owners.length === 0" class="quota-wb__panel-empty">
						{{ t('duplicatefinder', 'No owners detected.') }}
					</div>
					<ul v-else class="quota-wb__ledger-list">
						<li v-for="owner in report.owners" :key="owner.owner">
							<button
								type="button"
								class="quota-wb__ledger-btn"
								:class="{ 'is-active': ownerFilter === owner.owner }"
								:aria-pressed="ownerFilter === owner.owner ? 'true' : 'false'"
								@click="toggleOwnerFilter(owner.owner)">
								<span class="quota-wb__ledger-head">
									<span class="quota-wb__owner-title">
										<strong>{{ owner.owner }}</strong>
										<span
											v-if="owner.overQuota"
											class="quota-wb__badge is-danger">
											{{ t('duplicatefinder', 'Over quota ({pct}%)', { pct: owner.quotaUtilizationPct }) }}
										</span>
										<span v-else class="quota-wb__badge is-neutral">
											{{ owner.quotaUtilizationPct }}%
										</span>
									</span>
									<span>{{ owner.attributedBytesFormatted }} | {{ owner.estimatedMonthlyChargeFormatted }}/mo</span>
								</span>
								<span class="quota-wb__bar-track" aria-hidden="true">
									<span
										class="quota-wb__bar-fill"
										:class="{ 'is-over': owner.overQuota }"
										:style="{ inlineSize: `${Math.min(100, Math.max(owner.attributedBytes > 0 ? 4 : 0, owner.quotaUtilizationPct))}%` }" />
								</span>
								<span class="quota-wb__ledger-sub">
									{{ t('duplicatefinder', '{groups} groups, {files} copies ({safe} safe to prune: {safeBytes})', {
										groups: owner.groupCount,
										files: owner.fileCount,
										safe: owner.safePruneCount,
										safeBytes: owner.safePruneBytesFormatted,
									}) }}
								</span>
							</button>
						</li>
					</ul>
				</div>

				<div class="quota-wb__panel-card">
					<div class="quota-wb__panel-head">
						<h4 class="quota-wb__sub-title">
							{{ t('duplicatefinder', 'Cross-User Shared Payload Pairs') }}
						</h4>
						<button
							v-if="pairKeyFilter"
							type="button"
							class="quota-wb__mini-btn"
							@click="pairKeyFilter = ''">
							<span>{{ t('duplicatefinder', 'All pairs') }}</span>
						</button>
					</div>
					<div v-if="report.crossUserPairs.length === 0" class="quota-wb__panel-empty">
						{{ t('duplicatefinder', 'No cross-user duplicate overlaps in current scope.') }}
					</div>
					<ul v-else class="quota-wb__pair-list">
						<li v-for="pair in report.crossUserPairs" :key="pair.pairKey">
							<button
								type="button"
								class="quota-wb__pair-btn"
								:class="{ 'is-active': pairKeyFilter === pair.pairKey }"
								:aria-pressed="pairKeyFilter === pair.pairKey ? 'true' : 'false'"
								@click="togglePairFilter(pair.pairKey)">
								<span class="quota-wb__pair-title">
									<strong>{{ pair.ownerA }}</strong> &lt;-&gt; <strong>{{ pair.ownerB }}</strong>
								</span>
								<span class="quota-wb__pair-meta">
									{{ t('duplicatefinder', '{groups} shared groups, {bytes} reclaimable ({charge}/mo)', {
										groups: pair.sharedGroupCount,
										bytes: pair.reclaimableBytesFormatted,
										charge: pair.estimatedMonthlyChargeFormatted,
									}) }}
								</span>
							</button>
						</li>
					</ul>
				</div>
			</div>

			<div class="quota-wb__split">
				<div class="quota-wb__list-pane">
					<div class="quota-wb__pane-head">
						<h4 class="quota-wb__sub-title">
							{{ t('duplicatefinder', 'Attributed Duplicate Groups ({count})', { count: filteredGroups.length }) }}
						</h4>
					</div>
					<div v-if="filteredGroups.length === 0" class="quota-wb__panel-empty">
						{{ t('duplicatefinder', 'No duplicate groups match the active attribution filters.') }}
					</div>
					<ul v-else class="quota-wb__group-list">
						<li
							v-for="group in filteredGroups"
							:key="group.groupKey"
							class="quota-wb__group-item">
							<button
								type="button"
								class="quota-wb__group-btn"
								:class="{ 'is-active': activeGroup && activeGroup.groupKey === group.groupKey }"
								@click="selectedGroupKey = group.groupKey">
								<span class="quota-wb__group-head">
									<span class="quota-wb__group-name">{{ group.displayName }}</span>
									<strong>{{ group.attributedBytesFormatted }}</strong>
								</span>
								<span class="quota-wb__group-meta">
									<span
										v-if="group.isCrossUser"
										class="quota-wb__badge is-warn">
										{{ t('duplicatefinder', 'Cross-user ({count})', { count: group.ownerCount }) }}
									</span>
									<span
										v-if="group.hasProtectedOrigin"
										class="quota-wb__badge is-safe">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
									<span>{{ group.owners.join(', ') }}</span>
									<span>{{ group.estimatedMonthlyChargeFormatted }}/mo</span>
								</span>
							</button>
						</li>
					</ul>
				</div>

				<aside
					v-if="activeGroup"
					class="quota-wb__detail-pane"
					:aria-label="t('duplicatefinder', 'Selected group quota attribution breakdown')">
					<div class="quota-wb__detail-head">
						<div>
							<h4 class="quota-wb__detail-title">
								{{ activeGroup.displayName }}
							</h4>
							<p class="quota-wb__detail-subtitle">
								{{ t('duplicatefinder', '{copies} copies across {owners} owners and {roots} roots', {
									copies: activeGroup.fileCount,
									owners: activeGroup.ownerCount,
									roots: activeGroup.rootCount,
								}) }}
							</p>
						</div>
						<div class="quota-wb__detail-actions">
							<button
								type="button"
								class="quota-wb__mini-btn"
								@click="$emit('select-duplicate', activeGroup.duplicateRef)">
								<span>{{ t('duplicatefinder', 'Focus group') }}</span>
							</button>
							<button
								type="button"
								class="quota-wb__mini-btn"
								@click="$emit('compare-duplicate', activeGroup.duplicateRef)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>

					<div class="quota-wb__copy-list-wrap">
						<ul class="quota-wb__copy-list">
							<li
								v-for="entry in activeGroup.files"
								:key="`${activeGroup.groupKey}-${entry.fileIndex}`"
								class="quota-wb__copy-row">
								<div class="quota-wb__copy-main">
									<span class="quota-wb__copy-path">{{ entry.normalizedPath }}</span>
									<span class="quota-wb__copy-sub">
										{{ entry.owner }} | {{ entry.rootLabel }} | {{ entry.sizeFormatted }}
									</span>
								</div>
								<div class="quota-wb__copy-right">
									<span
										class="quota-wb__badge"
										:class="roleBadgeClass(entry.role)">
										{{ formatRoleLabel(entry.role) }}
									</span>
									<strong class="quota-wb__copy-charge">
										{{ entry.attributedBytesFormatted }} ({{ entry.estimatedMonthlyChargeFormatted }})
									</strong>
								</div>
							</li>
						</ul>
					</div>
				</aside>
			</div>

			<footer class="quota-wb__bulk-bar">
				<div class="quota-wb__bulk-summary">
					<span>
						{{ t('duplicatefinder', 'Safe prune scope: {count} redundant copies ({size}, {savings}/mo savings)', {
							count: activePrunePlan.safeCount,
							size: activePrunePlan.reclaimableBytesFormatted,
							savings: activePrunePlan.estimatedMonthlySavingsFormatted,
						}) }}
					</span>
					<span
						v-if="activePrunePlan.skippedProtectedCount > 0"
						class="quota-wb__bulk-note">
						{{ t('duplicatefinder', '{count} protected origin copies preserved.', {
							count: activePrunePlan.skippedProtectedCount,
						}) }}
					</span>
				</div>
				<div class="quota-wb__bulk-actions">
					<button
						type="button"
						class="quota-wb__danger-btn"
						:disabled="activePrunePlan.safeCount === 0 || isDeleting"
						@click="openPruneDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Pruning...')
							: t('duplicatefinder', 'Prune safe redundant copies') }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="quotaPruneDialog"
			class="quota-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe multi-root duplicate pruning')"
			@close="onPruneDialogClose"
			@click="onPruneDialogBackdropClick">
			<div class="quota-confirm-dialog__content">
				<h4 class="quota-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Safe Quota Prune Plan') }}
				</h4>
				<p class="quota-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to remove {count} redundant duplicate copies ({size}, saving {savings}/mo). All protected origins and at least one surviving copy per group remain intact.', {
						count: activePrunePlan.safeCount,
						size: activePrunePlan.reclaimableBytesFormatted,
						savings: activePrunePlan.estimatedMonthlySavingsFormatted,
					}) }}
				</p>
				<div class="quota-confirm-dialog__actions">
					<button
						type="button"
						class="quota-wb__tool-btn"
						:disabled="isDeleting"
						@click="closePruneDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="quota-wb__danger-btn"
						:disabled="isDeleting"
						@click="confirmSafePrune">
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
	buildQuotaAttributionReport,
	buildQuotaPrunePlan,
	exportQuotaAttributionCsv,
	exportQuotaAttributionJson,
	filterQuotaAttributionGroups,
} from '../tools/quotaAttributionHeatmap'

export default {
	name: 'QuotaAttributionWorkbench',
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
		return {
			scope: 'filtered',
			rootGranularity: 'mount',
			policy: 'surplus_extra',
			keeperStrategy: 'origin_first',
			costRateInput: '0.025',
			currency: 'EUR',
			quotaThresholdInput: '100',
			sortBy: 'attributed_desc',
			searchQuery: '',
			crossUserOnly: false,
			ownerFilter: '',
			rootFilter: '',
			pairKeyFilter: '',
			selectedGroupKey: '',
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
		parsedCostRate() {
			const val = Number(this.costRateInput)
			return Number.isFinite(val) && val >= 0 ? val : 0.025
		},
		parsedQuotaThresholdMb() {
			const val = Number(this.quotaThresholdInput)
			return Number.isFinite(val) && val >= 1 ? val : 100
		},
		report() {
			return buildQuotaAttributionReport(this.activeDuplicates, {
				policy: this.policy,
				rootGranularity: this.rootGranularity,
				keeperStrategy: this.keeperStrategy,
				costPerGbMonth: this.parsedCostRate,
				currency: this.currency,
				quotaThresholdMb: this.parsedQuotaThresholdMb,
			})
		},
		overQuotaOwnersSet() {
			return new Set(this.report.owners.filter(o => o.overQuota).map(o => o.owner))
		},
		filteredGroups() {
			return filterQuotaAttributionGroups(this.report.groups, {
				ownerFilter: this.ownerFilter,
				rootFilter: this.rootFilter,
				pairKeyFilter: this.pairKeyFilter,
				crossUserOnly: this.crossUserOnly,
				overQuotaOwners: this.overQuotaOwnersSet,
				searchQuery: this.searchQuery,
				sortBy: this.sortBy,
			})
		},
		activeGroup() {
			if (this.filteredGroups.length === 0) {
				return null
			}
			const found = this.filteredGroups.find(g => g.groupKey === this.selectedGroupKey)
			return found || this.filteredGroups[0]
		},
		activePrunePlan() {
			return buildQuotaPrunePlan(this.filteredGroups, {
				ownerFilter: this.ownerFilter,
				rootFilter: this.rootFilter,
				costPerGbMonth: this.parsedCostRate,
				currency: this.currency,
			})
		},
		hasActiveFilters() {
			return this.ownerFilter !== ''
				|| this.rootFilter !== ''
				|| this.pairKeyFilter !== ''
				|| this.crossUserOnly
				|| this.searchQuery.trim() !== ''
				|| this.sortBy !== 'attributed_desc'
		},
	},
	watch: {
		filteredGroups: {
			immediate: true,
			handler(nextGroups) {
				if (!Array.isArray(nextGroups) || nextGroups.length === 0) {
					this.selectedGroupKey = ''
					return
				}
				const exists = nextGroups.some(g => g.groupKey === this.selectedGroupKey)
				if (!exists) {
					this.selectedGroupKey = nextGroups[0].groupKey
				}
			},
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
		toggleOwnerFilter(owner) {
			this.pairKeyFilter = ''
			if (this.ownerFilter === owner && this.rootFilter === '') {
				this.ownerFilter = ''
			} else {
				this.ownerFilter = owner
				this.rootFilter = ''
			}
		},
		toggleRootFilter(rootKey) {
			this.pairKeyFilter = ''
			if (this.rootFilter === rootKey && this.ownerFilter === '') {
				this.rootFilter = ''
			} else {
				this.rootFilter = rootKey
				this.ownerFilter = ''
			}
		},
		toggleCellFilter(cell) {
			if (!cell) {
				return
			}
			this.pairKeyFilter = ''
			if (this.ownerFilter === cell.owner && this.rootFilter === cell.rootKey) {
				this.ownerFilter = ''
				this.rootFilter = ''
			} else {
				this.ownerFilter = cell.owner
				this.rootFilter = cell.rootKey
			}
		},
		togglePairFilter(pairKey) {
			this.ownerFilter = ''
			this.rootFilter = ''
			this.pairKeyFilter = this.pairKeyFilter === pairKey ? '' : pairKey
		},
		resetFilters() {
			this.ownerFilter = ''
			this.rootFilter = ''
			this.pairKeyFilter = ''
			this.crossUserOnly = false
			this.searchQuery = ''
			this.sortBy = 'attributed_desc'
		},
		formatRoleLabel(role) {
			const labels = {
				keeper: this.t('duplicatefinder', 'Canonical keeper'),
				protected: this.t('duplicatefinder', 'Protected origin'),
				redundant: this.t('duplicatefinder', 'Redundant copy'),
			}
			return labels[role] || role
		},
		roleBadgeClass(role) {
			if (role === 'keeper') {
				return 'is-safe'
			}
			if (role === 'protected') {
				return 'is-protected'
			}
			return 'is-warn'
		},
		openPruneDialog() {
			if (this.activePrunePlan.safeCount === 0 || this.isDeleting) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.quotaPruneDialog
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
		closePruneDialog() {
			const dialog = this.$refs.quotaPruneDialog
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
		onPruneDialogClose() {
			this.restoreFocusAfterDialog()
		},
		onPruneDialogBackdropClick(event) {
			if (event && event.target === this.$refs.quotaPruneDialog && !this.isDeleting) {
				this.closePruneDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function') {
				prev.focus()
			}
		},
		async confirmSafePrune() {
			const safeFiles = this.activePrunePlan.safeFiles
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

				this.closePruneDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Pruned {count} redundant copies ({size} reclaimed).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('quota-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: this.filteredGroups.length,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closePruneDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not prune safe redundant copies.')
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
		exportJsonReport() {
			const json = exportQuotaAttributionJson(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-quota-chargeback.json', json, 'application/json;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported quota attribution JSON report.')
		},
		exportCsvReport() {
			const csv = exportQuotaAttributionCsv(this.report, this.filteredGroups)
			this.triggerDownload('duplicatefinder-quota-chargeback.csv', csv, 'text/csv;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe quota attribution CSV.')
		},
	},
}
</script>

<style scoped>
.quota-attribution-workbench {
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

.quota-wb__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.quota-wb__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.quota-wb__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.quota-wb__status-badge {
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

.quota-wb__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.quota-wb__tool-btn,
.quota-wb__seg-btn,
.quota-wb__mini-btn,
.quota-wb__primary-btn,
.quota-wb__danger-btn {
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
	font-size: 0.85rem;
	font-weight: 500;
	cursor: pointer;
}

.quota-wb__tool-btn:hover:not(:disabled),
.quota-wb__seg-btn:hover:not(:disabled),
.quota-wb__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.quota-wb__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-weight: 600;
}

.quota-wb__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.quota-wb__danger-btn {
	background-color: #b71c1c;
	border-color: #b71c1c;
	color: #fff;
}

.quota-wb__tool-btn:disabled,
.quota-wb__seg-btn:disabled,
.quota-wb__mini-btn:disabled,
.quota-wb__danger-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.quota-wb__tool-btn:focus-visible,
.quota-wb__seg-btn:focus-visible,
.quota-wb__mini-btn:focus-visible,
.quota-wb__primary-btn:focus-visible,
.quota-wb__danger-btn:focus-visible,
.quota-wb__axis-btn:focus-visible,
.quota-wb__heat-cell:focus-visible,
.quota-wb__ledger-btn:focus-visible,
.quota-wb__pair-btn:focus-visible,
.quota-wb__group-btn:focus-visible,
.quota-wb__select:focus-visible,
.quota-wb__num-input:focus-visible,
.quota-wb__search-input:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.quota-wb__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 18px;
	padding-inline: 18px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.quota-wb__empty-title {
	margin: 0;
	font-weight: 700;
}

.quota-wb__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.quota-wb__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.quota-wb__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.quota-wb__control-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.quota-wb__segments {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}

.quota-wb__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.quota-wb__field.is-grow {
	flex: 1 1 200px;
	min-inline-size: 0;
}

.quota-wb__select,
.quota-wb__num-input,
.quota-wb__search-input {
	min-block-size: 36px;
	padding-block: 5px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	max-inline-size: 100%;
}

.quota-wb__num-input {
	inline-size: 82px;
}

.quota-wb__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.quota-wb__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-size: 0.85rem;
}

.quota-wb__notice.is-error {
	border-color: #c62828;
	background-color: rgba(198, 40, 40, 0.12);
}

.quota-wb__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.quota-wb__kpi {
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

.quota-wb__kpi-label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__kpi-value {
	font-size: 0.96rem;
	overflow-wrap: anywhere;
}

.quota-wb__panel-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.quota-wb__panel-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.quota-wb__sub-title {
	margin: 0;
	font-size: 0.9rem;
	font-weight: 700;
}

.quota-wb__sub-hint {
	margin: 2px 0 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__panel-empty {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	padding-block: 8px;
}

.quota-wb__legend {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.quota-wb__legend-chip {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	font-size: 0.74rem;
	font-weight: 600;
}

.quota-wb__matrix-scroll {
	inline-size: 100%;
	max-inline-size: 100%;
	overflow-x: auto;
}

.quota-wb__matrix {
	inline-size: 100%;
	border-collapse: separate;
	border-spacing: 4px;
	font-size: 0.8rem;
}

.quota-wb__matrix-corner,
.quota-wb__matrix-col-head,
.quota-wb__matrix-total-head,
.quota-wb__matrix-row-head {
	text-align: start;
	vertical-align: middle;
}

.quota-wb__axis-btn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-block-size: 34px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.78rem;
	font-weight: 600;
	cursor: pointer;
	white-space: nowrap;
}

.quota-wb__axis-btn.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.quota-wb__quota-flag {
	padding-block: 1px;
	padding-inline: 5px;
	border-radius: var(--border-radius-pill, 999px);
	background-color: #b71c1c;
	color: #fff;
	font-size: 0.68rem;
}

.quota-wb__matrix-td {
	min-inline-size: 96px;
}

.quota-wb__heat-cell {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 2px;
	inline-size: 100%;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
	cursor: pointer;
	text-align: start;
}

.quota-wb__heat-cell.is-active {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 1px;
}

.is-heat-low {
	background-color: rgba(0, 130, 201, 0.12);
}

.is-heat-medium {
	background-color: rgba(245, 158, 11, 0.22);
}

.is-heat-high {
	background-color: rgba(234, 88, 12, 0.28);
}

.is-heat-critical {
	background-color: rgba(183, 28, 28, 0.28);
	border-color: #b71c1c;
}

.quota-wb__cell-bytes {
	font-weight: 700;
	font-size: 0.8rem;
}

.quota-wb__cell-meta {
	font-size: 0.72rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__heat-empty {
	display: flex;
	align-items: center;
	justify-content: center;
	min-block-size: 40px;
	color: var(--color-text-maxcontrast);
}

.quota-wb__matrix-row-total {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-inline: 8px;
	white-space: nowrap;
	font-size: 0.78rem;
}

.quota-wb__analytics-grid,
.quota-wb__split {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.quota-wb__ledger-list,
.quota-wb__pair-list,
.quota-wb__group-list,
.quota-wb__copy-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.quota-wb__ledger-btn,
.quota-wb__pair-btn,
.quota-wb__group-btn {
	display: flex;
	flex-direction: column;
	gap: 5px;
	inline-size: 100%;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
}

.quota-wb__ledger-btn.is-active,
.quota-wb__pair-btn.is-active,
.quota-wb__group-btn.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.quota-wb__ledger-head,
.quota-wb__group-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.84rem;
}

.quota-wb__owner-title {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.quota-wb__bar-track {
	display: block;
	inline-size: 100%;
	block-size: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.quota-wb__bar-fill {
	display: block;
	block-size: 100%;
	background-color: var(--color-primary-element);
}

.quota-wb__bar-fill.is-over {
	background-color: #c62828;
}

.quota-wb__ledger-sub,
.quota-wb__pair-meta,
.quota-wb__group-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__pair-title,
.quota-wb__group-name {
	font-size: 0.85rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.quota-wb__list-pane,
.quota-wb__detail-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.quota-wb__pane-head,
.quota-wb__detail-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.quota-wb__detail-title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.quota-wb__detail-subtitle {
	margin: 2px 0 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.quota-wb__copy-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.quota-wb__copy-main {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.quota-wb__copy-path {
	font-size: 0.82rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.quota-wb__copy-sub {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.quota-wb__copy-right {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	gap: 4px;
}

.quota-wb__copy-charge {
	font-size: 0.78rem;
}

.quota-wb__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	font-size: 0.72rem;
	font-weight: 600;
}

.quota-wb__badge.is-safe {
	border-color: #2e7d32;
	color: #2e7d32;
}

.quota-wb__badge.is-protected {
	border-color: #0277bd;
	color: #0277bd;
}

.quota-wb__badge.is-warn {
	border-color: #d97706;
	color: #b45309;
}

.quota-wb__badge.is-danger {
	border-color: #b71c1c;
	color: #b71c1c;
}

.quota-wb__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.quota-wb__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.86rem;
	font-weight: 600;
}

.quota-wb__bulk-note {
	font-weight: 400;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.quota-wb__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.quota-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.quota-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.quota-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.quota-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.quota-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.quota-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.quota-wb__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.quota-wb__analytics-grid,
	.quota-wb__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.quota-attribution-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.quota-wb__tool-btn,
	.quota-wb__seg-btn,
	.quota-wb__mini-btn,
	.quota-wb__primary-btn,
	.quota-wb__danger-btn,
	.quota-wb__select,
	.quota-wb__num-input,
	.quota-wb__search-input,
	.quota-wb__axis-btn,
	.quota-wb__heat-cell,
	.quota-wb__ledger-btn,
	.quota-wb__pair-btn,
	.quota-wb__group-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.quota-wb__field {
		flex: 1 1 100%;
	}

	.quota-wb__select,
	.quota-wb__num-input {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.quota-wb__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
