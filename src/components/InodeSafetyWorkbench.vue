<template>
	<section
		class="inode-safety-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Cross-Volume Inode, Hardlink-Alias and Storage-Backend Safety Verifier')">
		<header class="isw__toolbar">
			<div class="isw__title-group">
				<h3 class="isw__title">
					{{ t('duplicatefinder', 'Inode Topology & Storage-Backend Safety Verifier') }}
				</h3>
				<span
					class="isw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{trueSize} true physical / {phantomSize} phantom / {groups} groups', {
						trueSize: report.summary.truePhysicalReclaimableFormatted,
						phantomSize: report.summary.phantomSavingsFormatted,
						groups: report.summary.totalGroups,
					}) }}
				</span>
			</div>

			<div class="isw__toolbar-actions">
				<button
					type="button"
					class="isw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportStatProbe">
					<span>{{ t('duplicatefinder', 'Export stat Probe') }}</span>
				</button>
				<button
					type="button"
					class="isw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportOccPlan">
					<span>{{ t('duplicatefinder', 'Export OCC Plan') }}</span>
				</button>
				<button
					type="button"
					class="isw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="isw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="isw__tool-btn is-close"
					aria-keyshortcuts="'"
					:title="t('duplicatefinder', 'Hide inode safety verifier')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Inodes') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="isw__empty">
			<p class="isw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="isw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to verify POSIX device/inode boundaries, hardlink aliases, external nlink traps, and object-store constraints.') }}
			</p>
			<button
				type="button"
				class="isw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="isw__controls">
				<div class="isw__control-row">
					<span class="isw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="isw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Inode audit scope')">
						<button
							type="button"
							class="isw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="isw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>

					<span class="isw__control-label">{{ t('duplicatefinder', 'Intent') }}</span>
					<div
						class="isw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Remediation intent')">
						<button
							v-for="opt in intentOptions"
							:key="opt.id"
							type="button"
							class="isw__seg-btn"
							:class="{ 'is-active': intent === opt.id }"
							:aria-pressed="intent === opt.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="intent = opt.id">
							<span>{{ opt.label }}</span>
						</button>
					</div>
				</div>

				<div class="isw__control-row">
					<span class="isw__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
					<div
						class="isw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by inode verdict')">
						<button
							v-for="vf in verdictOptions"
							:key="vf.id"
							type="button"
							class="isw__seg-btn"
							:class="{ 'is-active': verdictFilter === vf.id }"
							:aria-pressed="verdictFilter === vf.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="verdictFilter = vf.id">
							<span>{{ vf.label }} ({{ report.summary.categoryCounts[vf.id] || 0 }})</span>
						</button>
					</div>
				</div>

				<div class="isw__filters-grid">
					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Filesystem profile') }}</span>
						<select
							v-model="filesystemOverride"
							class="isw__select"
							:disabled="isDeleting">
							<option
								v-for="fs in filesystemOptions"
								:key="fs.id"
								:value="fs.id">
								{{ fs.label }}
							</option>
						</select>
					</label>

					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Survivor rule') }}</span>
						<select
							v-model="strategy"
							class="isw__select"
							:disabled="isDeleting">
							<option
								v-for="st in strategyOptions"
								:key="st.id"
								:value="st.id">
								{{ st.label }}
							</option>
						</select>
					</label>

					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Search path, device or inode') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="isw__text-input"
							:placeholder="t('duplicatefinder', 'Filter by path, dev, inode, fs...')"
							:disabled="isDeleting">
					</label>

					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Min true savings (KB)') }}</span>
						<input
							v-model="minReclaimKbInput"
							type="number"
							min="0"
							step="1"
							inputmode="numeric"
							class="isw__text-input"
							:placeholder="t('duplicatefinder', '0')"
							:disabled="isDeleting">
					</label>

					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Sort groups') }}</span>
						<select
							v-model="sortMode"
							class="isw__select"
							:disabled="isDeleting">
							<option value="true_reclaim_desc">
								{{ t('duplicatefinder', 'True physical savings (largest)') }}
							</option>
							<option value="phantom_delta_desc">
								{{ t('duplicatefinder', 'Phantom savings delta (largest)') }}
							</option>
							<option value="risk_desc">
								{{ t('duplicatefinder', 'Trap severity (highest first)') }}
							</option>
							<option value="name_asc">
								{{ t('duplicatefinder', 'Filename (A to Z)') }}
							</option>
						</select>
					</label>

					<label class="isw__field">
						<span class="isw__field-label">{{ t('duplicatefinder', 'Nextcloud data root') }}</span>
						<input
							v-model="dataRootInput"
							type="text"
							class="isw__text-input"
							:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')"
							:disabled="isDeleting">
					</label>
				</div>
			</div>

			<div
				class="isw__summary-grid"
				role="region"
				:aria-label="t('duplicatefinder', 'Physical block accounting summary')">
				<div class="isw__kpi-card is-safe">
					<span class="isw__kpi-label">{{ t('duplicatefinder', 'True Physical Reclaim') }}</span>
					<strong class="isw__kpi-value">{{ report.summary.truePhysicalReclaimableFormatted }}</strong>
					<span class="isw__kpi-sub">
						{{ t('duplicatefinder', '{count} verified safe copies', { count: report.summary.safeReclaimCopyCount }) }}
					</span>
				</div>
				<div class="isw__kpi-card is-warn">
					<span class="isw__kpi-label">{{ t('duplicatefinder', 'Phantom Alias / nlink Delta') }}</span>
					<strong class="isw__kpi-value">{{ report.summary.phantomSavingsFormatted }}</strong>
					<span class="isw__kpi-sub">
						{{ t('duplicatefinder', 'Apparent: {size}', { size: report.summary.apparentReclaimableFormatted }) }}
					</span>
				</div>
				<div class="isw__kpi-card is-danger">
					<span class="isw__kpi-label">{{ t('duplicatefinder', 'Hardlink & nlink Traps') }}</span>
					<strong class="isw__kpi-value">
						{{ (report.summary.categoryCounts['already-hardlinked'] || 0) + (report.summary.categoryCounts['external-nlink-trap'] || 0) }}
					</strong>
					<span class="isw__kpi-sub">
						{{ t('duplicatefinder', '{aliases} aliases / {traps} external nlink', {
							aliases: report.summary.categoryCounts['already-hardlinked'] || 0,
							traps: report.summary.categoryCounts['external-nlink-trap'] || 0,
						}) }}
					</span>
				</div>
				<div class="isw__kpi-card">
					<span class="isw__kpi-label">{{ t('duplicatefinder', 'EXDEV / Backend Alerts') }}</span>
					<strong class="isw__kpi-value">
						{{ (report.summary.categoryCounts['cross-device-exdev'] || 0) + (report.summary.categoryCounts['backend-blocked'] || 0) }}
					</strong>
					<span class="isw__kpi-sub">
						{{ t('duplicatefinder', '{exdev} cross-dev / {backend} backend', {
							exdev: report.summary.categoryCounts['cross-device-exdev'] || 0,
							backend: report.summary.categoryCounts['backend-blocked'] || 0,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="isw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div
				v-if="globalSafeSelection.files.length > 0"
				class="isw__global-bar">
				<span class="isw__global-bar-text">
					{{ t('duplicatefinder', '{count} inode-verified copies across {groups} groups safe to reclaim ({size})', {
						count: globalSafeSelection.files.length,
						groups: globalSafeSelection.groupCount,
						size: globalSafeSelection.totalFormatted,
					}) }}
				</span>
				<button
					type="button"
					class="isw__primary-btn is-danger"
					:disabled="isDeleting"
					@click="openBatchDeleteDialog(null)">
					<span>{{ t('duplicatefinder', 'Delete {count} Verified Copies', { count: globalSafeSelection.files.length }) }}</span>
				</button>
			</div>

			<div
				v-if="filteredItems.length === 0"
				class="isw__no-matches">
				<p>{{ t('duplicatefinder', 'No duplicate groups match the current inode safety filters.') }}</p>
				<button
					type="button"
					class="isw__tool-btn"
					@click="resetWorkbenchFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div
				v-else
				class="isw__workspace">
				<div
					class="isw__group-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Audited duplicate groups')">
					<article
						v-for="item in visibleItems"
						:key="item.groupKey"
						role="listitem"
						class="isw__group-card"
						:class="[
							`is-verdict-${item.primaryVerdict}`,
							{ 'is-active': activeItem && activeItem.groupKey === item.groupKey },
						]">
						<div class="isw__group-top">
							<span
								class="isw__verdict-pill"
								:class="`is-${item.primaryVerdict}`">
								{{ formatVerdict(item.primaryVerdict) }}
							</span>
							<span class="isw__group-stats">
								{{ item.truePhysicalReclaimableFormatted }}
								<template v-if="item.phantomDeltaBytes > 0">
									({{ t('duplicatefinder', '{delta} phantom', { delta: item.phantomDeltaFormatted }) }})
								</template>
							</span>
						</div>

						<div class="isw__group-name">
							{{ item.title }}
						</div>

						<div class="isw__group-sub">
							{{ t('duplicatefinder', '{copies} copies / {clusters} inodes / {devices} devices', {
								copies: item.copyCount,
								clusters: item.clusterCount,
								devices: item.deviceCount,
							}) }}
						</div>

						<div class="isw__group-actions">
							<button
								type="button"
								class="isw__mini-btn"
								:class="{ 'is-active': activeItem && activeItem.groupKey === item.groupKey }"
								:aria-pressed="activeItem && activeItem.groupKey === item.groupKey ? 'true' : 'false'"
								@click="selectedGroupKey = item.groupKey">
								<span>{{ t('duplicatefinder', 'Inode Map') }}</span>
							</button>
							<button
								type="button"
								class="isw__mini-btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="isw__mini-btn"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</article>

					<div
						v-if="filteredItems.length > visibleLimit"
						class="isw__load-more-wrap">
						<button
							type="button"
							class="isw__tool-btn"
							@click="visibleLimit += 25">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', {
								remaining: filteredItems.length - visibleLimit,
							}) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="activeItem"
					class="isw__inspector"
					role="region"
					:aria-label="t('duplicatefinder', 'Selected group inode cluster detail')">
					<header class="isw__inspector-header">
						<div class="isw__inspector-title-wrap">
							<h4 class="isw__inspector-title">
								{{ activeItem.title }}
							</h4>
							<span class="isw__inspector-meta">
								{{ t('duplicatefinder', 'True savings: {trueSize} | Apparent: {apparentSize} | Phantom: {phantomSize}', {
									trueSize: activeItem.truePhysicalReclaimableFormatted,
									apparentSize: activeItem.apparentReclaimableFormatted,
									phantomSize: activeItem.phantomDeltaFormatted,
								}) }}
							</span>
						</div>
						<button
							v-if="activeItem.safeReclaimCount > 0"
							type="button"
							class="isw__mini-btn is-danger-outline"
							:disabled="isDeleting"
							@click="openBatchDeleteDialog(activeItem.groupKey)">
							<span>{{ t('duplicatefinder', 'Delete {count} Safe', { count: activeItem.safeReclaimCount }) }}</span>
						</button>
					</header>

					<div class="isw__copies-list">
						<div
							v-for="copy in activeItem.copies"
							:key="copy.selectionKey"
							class="isw__copy-card"
							:class="`is-copy-${copy.copyVerdict}`">
							<div class="isw__copy-header">
								<span
									class="isw__verdict-pill"
									:class="`is-${copy.copyVerdict}`">
									{{ formatCopyVerdict(copy.copyVerdict) }}
								</span>
								<span class="isw__copy-bytes">
									{{ copy.physicalUnitFormatted }}
									<template v-if="copy.isSparse">
										({{ t('duplicatefinder', 'logical {logical}', { logical: copy.logicalFormatted }) }})
									</template>
								</span>
							</div>

							<div class="isw__copy-path">
								{{ copy.displayPath }}
							</div>

							<div class="isw__telemetry-tags">
								<span class="isw__tag">{{ copy.deviceKey }}</span>
								<span class="isw__tag">
									{{ copy.inodeKnown ? `ino #${copy.inodeNumber}` : t('duplicatefinder', 'ino: inferred') }}
								</span>
								<span class="isw__tag">nlink={{ copy.nlink }}</span>
								<span class="isw__tag">{{ copy.backendProfile.label }}</span>
								<span
									v-if="copy.isEncrypted"
									class="isw__tag is-warn">
									{{ copy.encryptionMode || 'encrypted' }}
								</span>
							</div>

							<p class="isw__copy-reason">
								{{ copy.copyReason }}
							</p>

							<div
								v-if="!copy.isSurvivor"
								class="isw__copy-actions">
								<button
									type="button"
									class="isw__mini-btn"
									:disabled="isDeleting"
									@click="promoteSurvivor(activeItem.groupKey, copy.selectionKey)">
									<span>{{ t('duplicatefinder', 'Promote Survivor') }}</span>
								</button>
							</div>
						</div>
					</div>

					<div class="isw__script-panel">
						<div class="isw__script-header">
							<strong>{{ t('duplicatefinder', 'Read-only stat probe & OCC companion') }}</strong>
							<div class="isw__script-actions">
								<button
									type="button"
									class="isw__mini-btn"
									@click="copyGroupStatProbe">
									<span>{{ t('duplicatefinder', 'Copy stat Probe') }}</span>
								</button>
								<button
									type="button"
									class="isw__mini-btn"
									@click="copyGroupOccPlan">
									<span>{{ t('duplicatefinder', 'Copy OCC Plan') }}</span>
								</button>
							</div>
						</div>
						<pre class="isw__code-preview">{{ activeGroupProbePreview }}</pre>
					</div>
				</div>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="isw__dialog"
			:aria-labelledby="dialogTitleId"
			@cancel.prevent="closeConfirmDialog"
			@click="onDialogBackdropClick">
			<div class="isw__dialog-inner">
				<h4
					:id="dialogTitleId"
					class="isw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Inode-Verified Deletion') }}
				</h4>
				<p class="isw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} verified independent copies across {groups} groups to reclaim {size} of physical disk space? Hardlink aliases, external nlink traps, and Origin files are excluded.', {
						count: pendingSelection.files.length,
						groups: pendingSelection.groupCount,
						size: pendingSelection.totalFormatted,
					}) }}
				</p>
				<div class="isw__dialog-actions">
					<button
						type="button"
						class="isw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="isw__primary-btn is-danger"
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
	analyzeInodeSafety,
	buildInodeOccPlanScript,
	buildInodeSafeSelection,
	buildInodeSafetyCsv,
	buildInodeSafetyJson,
	buildInodeStatProbeScript,
	filterAndSortInodeItems,
} from '../tools/inodeSafetyVerifier'

export default {
	name: 'InodeSafetyWorkbench',
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
			intent: 'delete_copies',
			filesystemOverride: 'auto',
			strategy: 'telemetry_anchor',
			verdictFilter: 'all',
			searchQuery: '',
			minReclaimKbInput: '',
			sortMode: 'true_reclaim_desc',
			dataRootInput: '/var/www/nextcloud/data',
			manualSurvivors: {},
			selectedGroupKey: null,
			visibleLimit: 25,
			isDeleting: false,
			pendingGroupKey: null,
			statusNotice: '',
			statusNoticeType: 'info',
			dialogTitleId: 'isw-confirm-dialog-title',
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
		intentOptions() {
			return [
				{ id: 'delete_copies', label: this.t('duplicatefinder', 'Safe Delete') },
				{ id: 'hardlink', label: this.t('duplicatefinder', 'Hardlink (ln)') },
				{ id: 'reflink', label: this.t('duplicatefinder', 'CoW Reflink') },
			]
		},
		filesystemOptions() {
			return [
				{ id: 'auto', label: this.t('duplicatefinder', 'Auto-detect from path/telemetry') },
				{ id: 'ext4', label: this.t('duplicatefinder', 'ext4 (POSIX hardlinks)') },
				{ id: 'xfs', label: this.t('duplicatefinder', 'XFS (CoW reflink + hardlink)') },
				{ id: 'btrfs', label: this.t('duplicatefinder', 'Btrfs (CoW reflink + hardlink)') },
				{ id: 'zfs', label: this.t('duplicatefinder', 'ZFS dataset') },
				{ id: 'nfs', label: this.t('duplicatefinder', 'NFS mount') },
				{ id: 'smb', label: this.t('duplicatefinder', 'SMB / CIFS external mount') },
				{ id: 'objectstore', label: this.t('duplicatefinder', 'S3 / Swift Object Store') },
				{ id: 'fuse', label: this.t('duplicatefinder', 'FUSE / WebDAV / rclone') },
			]
		},
		strategyOptions() {
			return [
				{ id: 'telemetry_anchor', label: this.t('duplicatefinder', 'Telemetry / External nlink first') },
				{ id: 'oldest', label: this.t('duplicatefinder', 'Oldest modified') },
				{ id: 'newest', label: this.t('duplicatefinder', 'Newest modified') },
				{ id: 'shortest_path', label: this.t('duplicatefinder', 'Shortest path') },
			]
		},
		verdictOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'already-hardlinked', label: this.t('duplicatefinder', 'Aliases') },
				{ id: 'external-nlink-trap', label: this.t('duplicatefinder', 'nlink Traps') },
				{ id: 'cross-device-exdev', label: this.t('duplicatefinder', 'Cross-Dev') },
				{ id: 'backend-blocked', label: this.t('duplicatefinder', 'Backend') },
				{ id: 'sparse-anomaly', label: this.t('duplicatefinder', 'Sparse') },
				{ id: 'verified-safe', label: this.t('duplicatefinder', 'Verified Safe') },
			]
		},
		minTrueReclaimBytes() {
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
			return analyzeInodeSafety(this.activeSourceGroups, {
				intent: this.intent,
				filesystemOverride: this.filesystemOverride,
				strategy: this.strategy,
				manualSurvivors: this.manualSurvivors,
			})
		},
		filteredItems() {
			return filterAndSortInodeItems(this.report.items, {
				verdictFilter: this.verdictFilter,
				searchQuery: this.searchQuery,
				minTrueReclaimBytes: this.minTrueReclaimBytes,
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
		activeGroupProbePreview() {
			if (!this.activeItem) {
				return ''
			}
			return buildInodeStatProbeScript(this.report, {
				dataRoot: this.dataRootInput,
				targetGroupKey: this.activeItem.groupKey,
			})
		},
		globalSafeSelection() {
			return buildInodeSafeSelection(this.report, null)
		},
		pendingSelection() {
			return buildInodeSafeSelection(this.report, this.pendingGroupKey)
		},
	},
	methods: {
		formatVerdict(verdict) {
			const labels = {
				'external-nlink-trap': this.t('duplicatefinder', 'External nlink Trap'),
				'already-hardlinked': this.t('duplicatefinder', 'Hardlink Alias (0 B)'),
				'cross-device-exdev': this.t('duplicatefinder', 'Cross-Volume EXDEV'),
				'backend-blocked': this.t('duplicatefinder', 'Backend / Encrypted'),
				'sparse-anomaly': this.t('duplicatefinder', 'Sparse Block'),
				'verified-safe': this.t('duplicatefinder', 'Verified Safe'),
			}
			return labels[verdict] || verdict
		},
		formatCopyVerdict(verdict) {
			const labels = {
				survivor: this.t('duplicatefinder', 'Survivor'),
				'protected-origin': this.t('duplicatefinder', 'Origin Protected'),
				'locked-file': this.t('duplicatefinder', 'Locked'),
				'already-hardlinked': this.t('duplicatefinder', 'Same-Inode Alias'),
				'external-nlink-trap': this.t('duplicatefinder', 'External nlink > N'),
				'cross-device-exdev': this.t('duplicatefinder', 'Cross-Device EXDEV'),
				'backend-blocked': this.t('duplicatefinder', 'Backend Blocked'),
				'sparse-anomaly': this.t('duplicatefinder', 'Sparse File'),
				'verified-safe': this.t('duplicatefinder', 'Safe to Reclaim'),
			}
			return labels[verdict] || verdict
		},
		promoteSurvivor(groupKey, selectionKey) {
			this.$set(this.manualSurvivors, groupKey, selectionKey)
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Updated survivor anchor for inode topology calculations.')
		},
		resetWorkbenchFilters() {
			this.verdictFilter = 'all'
			this.searchQuery = ''
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
		exportStatProbe() {
			const script = buildInodeStatProbeScript(this.report, {
				dataRoot: this.dataRootInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-verify-inodes.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported read-only POSIX stat/samefile inode probe script.')
		},
		exportOccPlan() {
			const script = buildInodeOccPlanScript(this.report, {
				dataRoot: this.dataRootInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-inode-occ-plan.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported dry-run-first remediation and OCC companion script.')
		},
		exportJsonReport() {
			const json = buildInodeSafetyJson(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-inode-safety.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported inode safety audit JSON report.')
		},
		exportCsvLedger() {
			const csv = buildInodeSafetyCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-inode-safety.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported inode safety audit CSV ledger.')
		},
		async copyGroupStatProbe() {
			if (!this.activeItem) {
				return
			}
			const script = buildInodeStatProbeScript(this.report, {
				dataRoot: this.dataRootInput,
				targetGroupKey: this.activeItem.groupKey,
			})
			const ok = await copyTextSafely(script)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied read-only stat probe for active group.')
				: this.t('duplicatefinder', 'Could not copy stat probe to clipboard.')
		},
		async copyGroupOccPlan() {
			if (!this.activeItem) {
				return
			}
			const script = buildInodeOccPlanScript(this.report, {
				dataRoot: this.dataRootInput,
				targetGroupKey: this.activeItem.groupKey,
			})
			const ok = await copyTextSafely(script)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied dry-run remediation and OCC plan for active group.')
				: this.t('duplicatefinder', 'Could not copy OCC plan to clipboard.')
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
					this.statusNotice = this.t('duplicatefinder', 'Could not delete the selected inode-verified copies.')
				} else {
					this.statusNoticeType = 'success'
					this.statusNotice = this.t('duplicatefinder', 'Deleted {count} inode-verified copies.', { count: deletedCount })
					this.$emit('inode-delete-completed', {
						deletedFiles: selection.files,
						deletedCount,
						failedCount: failedIds.length,
						reclaimedBytes: selection.totalBytes,
						source: 'inode-safety-verifier',
					})
				}
			} catch (_error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Inode-verified safe deletion failed.')
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.inode-safety-workbench {
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

.inode-safety-workbench *,
.inode-safety-workbench *::before,
.inode-safety-workbench *::after {
	box-sizing: border-box;
}

.isw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.isw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.isw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.isw__status-badge {
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

.isw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.isw__tool-btn,
.isw__seg-btn,
.isw__mini-btn,
.isw__primary-btn {
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

.isw__tool-btn:hover:not(:disabled),
.isw__seg-btn:hover:not(:disabled),
.isw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
}

.isw__tool-btn:focus-visible,
.isw__seg-btn:focus-visible,
.isw__mini-btn:focus-visible,
.isw__primary-btn:focus-visible,
.isw__text-input:focus-visible,
.isw__select:focus-visible {
	outline: 2px solid var(--color-primary-element, #006aa3);
	outline-offset: 2px;
}

.isw__tool-btn:disabled,
.isw__seg-btn:disabled,
.isw__mini-btn:disabled,
.isw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.isw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #006aa3);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.isw__seg-btn.is-active,
.isw__mini-btn.is-active {
	background-color: var(--color-primary-element-light, var(--color-background-hover));
	border-color: var(--color-primary-element, #006aa3);
}

.isw__primary-btn {
	background-color: var(--color-primary-element, #006aa3);
	border-color: var(--color-primary-element, #006aa3);
	color: var(--color-primary-text, #fff);
}

.isw__primary-btn.is-danger {
	background-color: #b91c1c;
	border-color: #b91c1c;
	color: #fff;
}

.isw__mini-btn.is-danger-outline {
	border-color: #b91c1c;
	color: #b91c1c;
}

.isw__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.isw__empty-title {
	margin: 0;
	font-weight: 700;
}

.isw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.isw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.isw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.isw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.isw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.isw__filters-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.isw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.isw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.isw__text-input,
.isw__select {
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

.isw__summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.isw__kpi-card {
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

.isw__kpi-card.is-safe {
	border-inline-start: 4px solid #198754;
}

.isw__kpi-card.is-warn {
	border-inline-start: 4px solid #b45309;
}

.isw__kpi-card.is-danger {
	border-inline-start: 4px solid #b91c1c;
}

.isw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.isw__kpi-value {
	font-size: 1.12rem;
	font-weight: 700;
}

.isw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.isw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
}

.isw__notice.is-success {
	border-color: #198754;
	background-color: var(--color-background-hover);
}

.isw__notice.is-error {
	border-color: #b91c1c;
	color: #b91c1c;
	background-color: var(--color-background-hover);
}

.isw__global-bar {
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

.isw__global-bar-text {
	font-size: 0.88rem;
	font-weight: 600;
}

.isw__no-matches {
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

.isw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.isw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.isw__group-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-inline-size: 0;
}

.isw__group-card {
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

.isw__group-card.is-active {
	border-color: var(--color-primary-element, #006aa3);
	box-shadow: 0 0 0 1px var(--color-primary-element, #006aa3);
}

.isw__group-card.is-verdict-external-nlink-trap,
.isw__group-card.is-verdict-already-hardlinked {
	border-inline-start: 4px solid #b91c1c;
}

.isw__group-card.is-verdict-cross-device-exdev,
.isw__group-card.is-verdict-backend-blocked,
.isw__group-card.is-verdict-sparse-anomaly {
	border-inline-start: 4px solid #b45309;
}

.isw__group-card.is-verdict-verified-safe {
	border-inline-start: 4px solid #198754;
}

.isw__group-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.isw__group-stats {
	font-size: 0.82rem;
	font-weight: 700;
}

.isw__group-name {
	font-size: 0.95rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.isw__group-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.isw__group-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.isw__inspector {
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

.isw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.isw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.isw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.isw__inspector-meta {
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
}

.isw__copies-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.isw__copy-card {
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

.isw__copy-card.is-copy-survivor,
.isw__copy-card.is-copy-verified-safe {
	border-inline-start: 4px solid #198754;
}

.isw__copy-card.is-copy-already-hardlinked,
.isw__copy-card.is-copy-external-nlink-trap {
	border-inline-start: 4px solid #b91c1c;
}

.isw__copy-card.is-copy-cross-device-exdev,
.isw__copy-card.is-copy-backend-blocked,
.isw__copy-card.is-copy-sparse-anomaly {
	border-inline-start: 4px solid #b45309;
}

.isw__copy-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.isw__copy-bytes {
	font-size: 0.82rem;
	font-weight: 700;
}

.isw__copy-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.isw__telemetry-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.isw__tag,
.isw__verdict-pill {
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

.isw__verdict-pill.is-external-nlink-trap,
.isw__verdict-pill.is-already-hardlinked {
	border-color: #b91c1c;
	color: #b91c1c;
}

.isw__verdict-pill.is-cross-device-exdev,
.isw__verdict-pill.is-backend-blocked,
.isw__verdict-pill.is-sparse-anomaly,
.isw__tag.is-warn {
	border-color: #b45309;
	color: #92400e;
}

.isw__verdict-pill.is-survivor,
.isw__verdict-pill.is-verified-safe {
	border-color: #198754;
	color: #146c43;
}

.isw__copy-reason {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.isw__copy-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.isw__script-panel {
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

.isw__script-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.isw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.isw__code-preview {
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

.isw__load-more-wrap {
	display: flex;
	justify-content: center;
}

.isw__dialog {
	max-inline-size: min(92vw, 480px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.isw__dialog-inner {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 18px;
	padding-inline: 18px;
}

.isw__dialog-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.isw__dialog-body {
	margin: 0;
	font-size: 0.9rem;
}

.isw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
