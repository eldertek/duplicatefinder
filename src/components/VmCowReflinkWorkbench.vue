<template>
	<section
		class="vm-cow-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'VM Disk, Database Dump and Heavy Container Image CoW Reflink Auditor')">
		<header class="vcw__toolbar">
			<div class="vcw__title-group">
				<h3 class="vcw__title">
					{{ t('duplicatefinder', 'VM Disk, Database Dump & Container Image CoW Reflink Auditor') }}
				</h3>
				<span
					class="vcw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{groups} workload groups / {cow} CoW reflink savings / {locked} active locks shielded', {
						groups: analysis.summary.totalGroupsCount,
						cow: analysis.summary.formattedCowReflinkNetSavingsBytes,
						locked: analysis.summary.activeLockedFilesCount,
					}) }}
				</span>
			</div>

			<div class="vcw__toolbar-actions">
				<button
					type="button"
					class="vcw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="vcw__tool-btn"
					:disabled="analysis.groups.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="vcw__tool-btn"
					@click="copyReflinkScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="vcw__tool-btn is-close"
					aria-keyshortcuts="$"
					:title="t('duplicatefinder', 'Hide VM disk, database dump and container image CoW reflink auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide VM / CoW Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="vcw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="vcw__empty-banner"
			role="note">
			<div class="vcw__empty-text">
				<p class="vcw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CoW reflink presets before scanning') }}
				</p>
				<p class="vcw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate qcow2/vmdk/vdi/ova/iso images, sqlite/sql/dump backups, and container tarballs while shielding live hypervisors and WAL-locked databases.') }}
				</p>
			</div>
			<button
				type="button"
				class="vcw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="vcw__controls">
			<div class="vcw__control-row">
				<span class="vcw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="vcw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'VM and CoW reflink presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="vcw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="vcw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="vcw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="vcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="vcw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="vcw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="vcw__seg-btn"
					:class="{ 'is-active': protectActiveLocks }"
					:aria-pressed="protectActiveLocks ? 'true' : 'false'"
					@click="protectActiveLocks = !protectActiveLocks">
					<span>{{ protectActiveLocks ? t('duplicatefinder', 'Active / WAL Locks: SHIELDED') : t('duplicatefinder', 'Active / WAL Locks: UNGUARDED') }}</span>
				</button>

				<button
					type="button"
					class="vcw__seg-btn"
					:class="{ 'is-active': protectBackingChains }"
					:aria-pressed="protectBackingChains ? 'true' : 'false'"
					@click="protectBackingChains = !protectBackingChains">
					<span>{{ protectBackingChains ? t('duplicatefinder', 'QCOW2 Backing Chains: GUARDED') : t('duplicatefinder', 'QCOW2 Backing Chains: ALLOW') }}</span>
				</button>
			</div>

			<div class="vcw__control-row vcw__inputs-row">
				<label class="vcw__field">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'CoW Filesystem Backend') }}</span>
					<select v-model="backendId" class="vcw__input">
						<option
							v-for="backendItem in backendOptions"
							:key="backendItem.id"
							:value="backendItem.id">
							{{ backendItem.label }}
						</option>
					</select>
				</label>

				<label class="vcw__field">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="vcw__input">
						<option value="cow-reflink">{{ t('duplicatefinder', 'CoW Reflink (keep all paths)') }}</option>
						<option value="full-dedup">{{ t('duplicatefinder', 'Full cold copy purge') }}</option>
					</select>
				</label>

				<label class="vcw__field">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="vcw__input">
						<option value="cold-golden-first">{{ t('duplicatefinder', 'Golden template / origin first') }}</option>
						<option value="active-primary-first">{{ t('duplicatefinder', 'Active live hypervisor/DB first') }}</option>
						<option value="oldest-mtime">{{ t('duplicatefinder', 'Oldest modified image') }}</option>
						<option value="newest-mtime">{{ t('duplicatefinder', 'Newest snapshot') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="vcw__field">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="vcw__input vcw__num-input">
				</label>

				<label class="vcw__field vcw__field-grow">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Filter Image, DB or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="vcw__input"
						:placeholder="t('duplicatefinder', 'e.g. qcow2, prod-db, rootfs, /Backups')">
				</label>

				<label class="vcw__field vcw__field-grow">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="vcw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="vcw__field">
					<span class="vcw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="vcw__input">
						<option value="cow_savings_desc">{{ t('duplicatefinder', 'Active strategy savings') }}</option>
						<option value="raw_waste_desc">{{ t('duplicatefinder', 'Raw duplicate waste') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Lock & chain risk first') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Filename (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="vcw__kpis">
			<div class="vcw__kpi">
				<span class="vcw__kpi-label">{{ t('duplicatefinder', 'Raw Duplicate Footprint') }}</span>
				<strong class="vcw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.totalGroupsCount }} {{ t('duplicatefinder', 'groups') }})
				</strong>
			</div>
			<div class="vcw__kpi">
				<span class="vcw__kpi-label">{{ t('duplicatefinder', 'CoW Reflink Net Savings') }}</span>
				<strong class="vcw__kpi-val is-accent">
					{{ analysis.summary.formattedCowReflinkNetSavingsBytes }} ({{ analysis.summary.cowEligibleCopiesCount }} {{ t('duplicatefinder', 'clones') }})
				</strong>
			</div>
			<div class="vcw__kpi">
				<span class="vcw__kpi-label">{{ t('duplicatefinder', 'Full Cold Purge Potential') }}</span>
				<strong class="vcw__kpi-val">
					{{ analysis.summary.formattedFullDedupNetSavingsBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
			<div class="vcw__kpi">
				<span class="vcw__kpi-label">{{ t('duplicatefinder', 'Active / Backing Shielded') }}</span>
				<strong class="vcw__kpi-val is-warn">
					{{ analysis.summary.formattedProtectedActiveBytes }} ({{ analysis.summary.activeLockedFilesCount }} {{ t('duplicatefinder', 'locks') }} / {{ analysis.summary.backingChainFilesCount }} {{ t('duplicatefinder', 'chains') }})
				</strong>
			</div>
		</div>

		<div
			v-if="analysis.summary.totalGroupsCount > 0"
			class="vcw__filters-strip">
			<div
				class="vcw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by workload family')">
				<button
					v-for="fam in familyOptions"
					:key="fam.id"
					type="button"
					class="vcw__chip"
					:class="{ 'is-active': familyFilter === fam.id }"
					:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
					@click="familyFilter = fam.id">
					<span>{{ fam.label }}</span>
				</button>
			</div>

			<div
				class="vcw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by safety state')">
				<button
					v-for="item in safetyOptions"
					:key="item.id"
					type="button"
					class="vcw__chip"
					:class="{ 'is-active': safetyFilter === item.id }"
					:aria-pressed="safetyFilter === item.id ? 'true' : 'false'"
					@click="safetyFilter = item.id">
					<span>{{ item.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.summary.totalGroupsCount === 0"
			class="vcw__empty-banner"
			role="note">
			<div class="vcw__empty-text">
				<p class="vcw__empty-title">
					{{ t('duplicatefinder', 'No VM disks, database files/dumps, or heavy container images detected above {minMb} MiB', { minMb: parsedMinSizeMb }) }}
				</p>
				<p class="vcw__empty-hint">
					{{ t('duplicatefinder', 'Lower Min Size (MiB) to 0 to inspect smaller SQLite databases or SQL dumps, or switch Scope to All loaded.') }}
				</p>
			</div>
			<button
				v-if="parsedMinSizeMb > 0"
				type="button"
				class="vcw__primary-btn"
				@click="minSizeMbInput = '0'">
				<span>{{ t('duplicatefinder', 'Include small DBs (0 MiB)') }}</span>
			</button>
		</div>

		<div
			v-else-if="analysis.summary.totalGroupsCount > 0 && analysis.groups.length === 0"
			class="vcw__empty-banner"
			role="note">
			<div class="vcw__empty-text">
				<p class="vcw__empty-title">
					{{ t('duplicatefinder', 'No VM, database, or container groups match your active filters') }}
				</p>
			</div>
			<button
				type="button"
				class="vcw__primary-btn"
				@click="resetViewFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-else-if="analysis.groups.length > 0"
			class="vcw__workstation">
			<div class="vcw__list-pane">
				<div class="vcw__pane-header">
					<span class="vcw__pane-title">
						{{ t('duplicatefinder', 'Audited Workload Groups ({shown} of {total})', {
							shown: visibleGroups.length,
							total: analysis.groups.length,
						}) }}
					</span>
				</div>

				<div class="vcw__group-list">
					<button
						v-for="group in visibleGroups"
						:key="group.groupKey"
						type="button"
						class="vcw__group-item"
						:class="{ 'is-selected': selectedGroup && selectedGroup.groupKey === group.groupKey }"
						@click="selectedGroupKey = group.groupKey">
						<div class="vcw__group-top">
							<span class="vcw__group-name">{{ group.displayName }}</span>
							<span
								class="vcw__pill"
								:class="'is-risk-' + group.groupRiskState">
								{{ riskLabel(group.groupRiskState) }}
							</span>
						</div>
						<div class="vcw__group-path">
							{{ group.survivor.normalizedPath }}
						</div>
						<div class="vcw__group-meta">
							<span>{{ familyShortLabel(group.family) }} (.{{ group.extension || 'bin' }})</span>
							<span>{{ group.totalCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ t('duplicatefinder', 'CoW:') }} {{ group.formattedCowSavingsBytes }}</span>
							<span>{{ t('duplicatefinder', 'Cold purge:') }} {{ group.formattedFullDedupSavingsBytes }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="hasMoreGroups"
					class="vcw__load-more-wrap">
					<button
						type="button"
						class="vcw__tool-btn"
						@click="visibleLimit += 40">
						<span>{{ t('duplicatefinder', 'Show more groups') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedGroup"
				class="vcw__inspector-pane">
				<div class="vcw__inspector-header">
					<div class="vcw__inspector-title-wrap">
						<h4 class="vcw__inspector-title">
							{{ selectedGroup.displayName }}
						</h4>
						<span class="vcw__inspector-sub">
							{{ familyShortLabel(selectedGroup.family) }} / {{ selectedGroup.survivor.normalizedPath }}
						</span>
					</div>
					<div class="vcw__inspector-actions">
						<button
							type="button"
							class="vcw__tool-btn"
							@click="emitSelectGroup(selectedGroup)">
							<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
						</button>
						<button
							type="button"
							class="vcw__tool-btn"
							@click="emitCompareGroup(selectedGroup)">
							<span>{{ t('duplicatefinder', 'Compare copies') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedGroup.activeLockedCount > 0"
					class="vcw__guard-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'ACTIVE HYPERVISOR / WAL-LOCKED DB GUARD:') }}</strong>
					{{ t('duplicatefinder', '{count} copy/copies show active VM runtime, container overlay, or SQLite WAL/SHM/LCK companions and are shielded from in-place replacement.', { count: selectedGroup.activeLockedCount }) }}
				</div>

				<div
					v-if="selectedGroup.backingChainCount > 0"
					class="vcw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'BACKING-CHAIN / DELTA RISK:') }}</strong>
					{{ t('duplicatefinder', 'Verify snapshot parent dependencies with qemu-img info before moving or purging overlay images.') }}
				</div>

				<div
					v-if="selectedGroup.sparseNocowCount > 0"
					class="vcw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'SPARSE / NOCOW NOTICE:') }}</strong>
					{{ t('duplicatefinder', 'Potential sparse inflation of {risk} if copied without --sparse=always; Btrfs chattr +C (NOCOW) disables reflink.', { risk: selectedGroup.formattedSparseInflationRiskBytes }) }}
				</div>

				<div class="vcw__meta-grid">
					<div class="vcw__meta-item">
						<span class="vcw__meta-label">{{ t('duplicatefinder', 'Golden Survivor') }}</span>
						<span class="vcw__mono-text">{{ selectedGroup.survivor.normalizedPath }}</span>
					</div>
					<div class="vcw__meta-item">
						<span class="vcw__meta-label">{{ t('duplicatefinder', 'CoW Reflink vs Full Dedup') }}</span>
						<span>
							{{ selectedGroup.formattedCowSavingsBytes }} {{ t('duplicatefinder', 'CoW net') }} / {{ selectedGroup.formattedFullDedupSavingsBytes }} {{ t('duplicatefinder', 'cold purge') }}
						</span>
					</div>
					<div class="vcw__meta-item">
						<span class="vcw__meta-label">{{ t('duplicatefinder', 'Extent Metadata Overhead') }}</span>
						<span>{{ selectedGroup.formattedCowOverheadBytes }}</span>
					</div>
					<div class="vcw__meta-item">
						<span class="vcw__meta-label">{{ t('duplicatefinder', 'Sparse Inflation Shielded') }}</span>
						<span>{{ selectedGroup.formattedSparseInflationRiskBytes }}</span>
					</div>
				</div>

				<div class="vcw__override-bar">
					<span class="vcw__control-label">{{ t('duplicatefinder', 'Group Override') }}</span>
					<button
						type="button"
						class="vcw__seg-btn"
						:class="{ 'is-active': !selectedGroup.groupOverride }"
						:aria-pressed="!selectedGroup.groupOverride ? 'true' : 'false'"
						@click="setGroupOverride(selectedGroup.groupKey, '')">
						<span>{{ t('duplicatefinder', 'Policy Default') }}</span>
					</button>
					<button
						type="button"
						class="vcw__seg-btn"
						:class="{ 'is-active': selectedGroup.groupOverride === 'cow-reflink' }"
						:aria-pressed="selectedGroup.groupOverride === 'cow-reflink' ? 'true' : 'false'"
						@click="setGroupOverride(selectedGroup.groupKey, 'cow-reflink')">
						<span>{{ t('duplicatefinder', 'Force CoW Reflink') }}</span>
					</button>
					<button
						type="button"
						class="vcw__seg-btn"
						:class="{ 'is-active': selectedGroup.groupOverride === 'full-dedup' }"
						:aria-pressed="selectedGroup.groupOverride === 'full-dedup' ? 'true' : 'false'"
						@click="setGroupOverride(selectedGroup.groupKey, 'full-dedup')">
						<span>{{ t('duplicatefinder', 'Force Cold Purge') }}</span>
					</button>
					<button
						type="button"
						class="vcw__seg-btn"
						:class="{ 'is-active': selectedGroup.groupOverride === 'protect' }"
						:aria-pressed="selectedGroup.groupOverride === 'protect' ? 'true' : 'false'"
						@click="setGroupOverride(selectedGroup.groupKey, 'protect')">
						<span>{{ t('duplicatefinder', 'Protect Group') }}</span>
					</button>
				</div>

				<div class="vcw__member-list">
					<div
						v-for="member in selectedGroup.members"
						:key="member.selectionKey + '::' + member.normalizedPath"
						class="vcw__member-card"
						:class="'is-verdict-' + member.verdict">
						<div class="vcw__member-top">
							<span class="vcw__member-name">{{ member.basename }}</span>
							<div class="vcw__member-badges">
								<span
									class="vcw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ verdictLabel(member.verdict) }}
								</span>
								<span
									v-if="member.isSparseImage"
									class="vcw__pill is-neutral">
									{{ t('duplicatefinder', 'Sparse') }}
								</span>
								<span
									v-if="member.origin"
									class="vcw__pill is-keep">
									{{ t('duplicatefinder', 'Origin') }}
								</span>
							</div>
						</div>
						<div class="vcw__member-path">
							{{ member.normalizedPath }}
						</div>
						<div class="vcw__member-meta">
							<span>{{ formatSize(member.sizeBytes) }}</span>
							<span v-if="member.cowSavingsBytes > 0">
								{{ t('duplicatefinder', 'CoW saves') }} {{ formatSize(member.cowSavingsBytes) }}
							</span>
							<span v-if="member.fullDedupSavingsBytes > 0">
								{{ t('duplicatefinder', 'Purge saves') }} {{ formatSize(member.fullDedupSavingsBytes) }}
							</span>
						</div>
						<p class="vcw__member-note">
							{{ member.verdictReason }}
						</p>
					</div>
				</div>

				<details class="vcw__script-box">
					<summary class="vcw__script-summary">
						{{ t('duplicatefinder', 'DRY_RUN=1 CoW Reflink & Cold Snapshot Execution Script ({backend})', { backend: analysis.backend.shortLabel }) }}
					</summary>
					<div class="vcw__script-content">
						<div class="vcw__script-actions">
							<button
								type="button"
								class="vcw__tool-btn"
								@click="copyReflinkScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="vcw__code-pre"><code>{{ generatedReflinkScript }}</code></pre>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	VM_COW_BACKENDS,
	VM_COW_PRESETS,
	analyzeVmCowReflink,
	buildVmCowCsvReport,
	buildVmCowJsonReport,
	buildVmCowReflinkScript,
	getVmCowPreset,
} from '../tools/vmCowReflinkAuditor'

export default {
	name: 'VmCowReflinkWorkbench',
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
		const defaultPreset = getVmCowPreset('cow-reflink-safe')
		return {
			presets: VM_COW_PRESETS,
			backendOptions: Object.values(VM_COW_BACKENDS),
			presetId: defaultPreset.id,
			scope: 'filtered',
			backendId: defaultPreset.backendId,
			strategy: defaultPreset.strategy,
			survivorRule: defaultPreset.survivorRule,
			protectActiveLocks: defaultPreset.protectActiveLocks,
			protectBackingChains: defaultPreset.protectBackingChains,
			minSizeMbInput: '1',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'cow_savings_desc',
			familyFilter: 'all',
			safetyFilter: 'all',
			groupOverrides: {},
			selectedGroupKey: null,
			visibleLimit: 40,
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
		},
		analysis() {
			return analyzeVmCowReflink(this.activePool, {
				backendId: this.backendId,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectActiveLocks: this.protectActiveLocks,
				protectBackingChains: this.protectBackingChains,
				minSizeBytes: Math.round(this.parsedMinSizeMb * 1024 * 1024),
				searchQuery: this.searchQueryInput,
				sortMode: this.sortMode,
				familyFilter: this.familyFilter,
				safetyFilter: this.safetyFilter,
				groupOverrides: this.groupOverrides,
			})
		},
		familyOptions() {
			const stats = this.analysis.summary.familyStats || {}
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Workloads ({count})', { count: this.analysis.summary.totalGroupsCount }) },
				{ id: 'vm-disk', label: this.t('duplicatefinder', 'VM Disks ({count})', { count: stats['vm-disk']?.count || 0 }) },
				{ id: 'database-file', label: this.t('duplicatefinder', 'Live DBs ({count})', { count: stats['database-file']?.count || 0 }) },
				{ id: 'database-dump', label: this.t('duplicatefinder', 'DB Dumps ({count})', { count: stats['database-dump']?.count || 0 }) },
				{ id: 'container-image', label: this.t('duplicatefinder', 'Containers ({count})', { count: stats['container-image']?.count || 0 }) },
			]
		},
		safetyOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All States') },
				{ id: 'cow-eligible', label: this.t('duplicatefinder', 'CoW Eligible') },
				{ id: 'cold-reclaimable', label: this.t('duplicatefinder', 'Cold Reclaimable') },
				{ id: 'active-locked', label: this.t('duplicatefinder', 'Active / WAL Locked ({count})', { count: this.analysis.summary.activeLockedFilesCount }) },
				{ id: 'backing-chain-risk', label: this.t('duplicatefinder', 'Backing Chains ({count})', { count: this.analysis.summary.backingChainFilesCount }) },
				{ id: 'nocow-sparse-trap', label: this.t('duplicatefinder', 'Sparse / NOCOW ({count})', { count: this.analysis.summary.sparseNocowFilesCount }) },
			]
		},
		visibleGroups() {
			return this.analysis.groups.slice(0, this.visibleLimit)
		},
		hasMoreGroups() {
			return this.analysis.groups.length > this.visibleLimit
		},
		selectedGroup() {
			if (this.analysis.groups.length === 0) {
				return null
			}
			if (this.selectedGroupKey) {
				const found = this.analysis.groups.find(g => g.groupKey === this.selectedGroupKey)
				if (found) {
					return found
				}
			}
			return this.analysis.groups[0]
		},
		generatedReflinkScript() {
			return buildVmCowReflinkScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
	},
	watch: {
		currentDuplicateId(newId) {
			if (newId === null || newId === undefined) {
				return
			}
			const match = this.analysis.groups.find(g => g.primaryGroupId === newId)
			if (match) {
				this.selectedGroupKey = match.groupKey
			}
		},
	},
	methods: {
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		applyPreset(presetId) {
			const preset = getVmCowPreset(presetId)
			this.presetId = preset.id
			this.backendId = preset.backendId
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectActiveLocks = preset.protectActiveLocks
			this.protectBackingChains = preset.protectBackingChains
			this.minSizeMbInput = String(Math.round((preset.minSizeBytes || 0) / (1024 * 1024)))
			this.visibleLimit = 40
		},
		resetViewFilters() {
			this.familyFilter = 'all'
			this.safetyFilter = 'all'
			this.searchQueryInput = ''
			this.minSizeMbInput = '0'
		},
		setGroupOverride(groupKey, mode) {
			const next = { ...this.groupOverrides }
			if (!mode) {
				delete next[groupKey]
			} else {
				next[groupKey] = mode
			}
			this.groupOverrides = next
		},
		familyShortLabel(family) {
			if (family === 'vm-disk') {
				return this.t('duplicatefinder', 'VM Disk')
			}
			if (family === 'database-file') {
				return this.t('duplicatefinder', 'Database File')
			}
			if (family === 'database-dump') {
				return this.t('duplicatefinder', 'DB Dump')
			}
			return this.t('duplicatefinder', 'Container Image')
		},
		riskLabel(riskState) {
			if (riskState === 'active-locked') {
				return this.t('duplicatefinder', 'ACTIVE / LOCKED')
			}
			if (riskState === 'backing-chain-risk') {
				return this.t('duplicatefinder', 'BACKING CHAIN')
			}
			if (riskState === 'nocow-sparse-trap') {
				return this.t('duplicatefinder', 'SPARSE / NOCOW')
			}
			if (riskState === 'cold-reclaimable') {
				return this.t('duplicatefinder', 'COLD RECLAIM')
			}
			return this.t('duplicatefinder', 'COW READY')
		},
		verdictLabel(verdict) {
			if (verdict === 'golden-survivor') {
				return this.t('duplicatefinder', 'GOLDEN SURVIVOR')
			}
			if (verdict === 'cow-reflink-ready') {
				return this.t('duplicatefinder', 'COW REFLINK READY')
			}
			if (verdict === 'cold-purge-ready' || verdict === 'cold-purge-only') {
				return this.t('duplicatefinder', 'COLD PURGE READY')
			}
			if (verdict === 'hardlink-immutable-ready') {
				return this.t('duplicatefinder', 'READ-ONLY HARDLINK')
			}
			if (verdict === 'blocked-active-lock') {
				return this.t('duplicatefinder', 'BLOCKED: ACTIVE LOCK')
			}
			if (verdict === 'blocked-backing-chain') {
				return this.t('duplicatefinder', 'GUARDED: BACKING CHAIN')
			}
			if (verdict === 'blocked-nocow') {
				return this.t('duplicatefinder', 'BLOCKED: NOCOW (+C)')
			}
			if (verdict === 'blocked-mutable-hardlink') {
				return this.t('duplicatefinder', 'BLOCKED: MUTABLE DISK')
			}
			return this.t('duplicatefinder', 'PROTECTED')
		},
		verdictPillClass(verdict) {
			if (verdict === 'golden-survivor') {
				return 'is-keep'
			}
			if (verdict === 'cow-reflink-ready' || verdict === 'hardlink-immutable-ready') {
				return 'is-cow'
			}
			if (verdict === 'cold-purge-ready' || verdict === 'cold-purge-only') {
				return 'is-cold'
			}
			if (verdict === 'blocked-active-lock' || verdict === 'blocked-mutable-hardlink') {
				return 'is-danger'
			}
			return 'is-warn'
		},
		resolveDuplicateGroup(auditedGroup) {
			if (!auditedGroup) {
				return null
			}
			const pool = Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates
				: this.duplicates
			if (!Array.isArray(pool)) {
				return null
			}
			if (auditedGroup.primaryGroupId !== null && auditedGroup.primaryGroupId !== undefined) {
				const found = pool.find(item => item && item.id === auditedGroup.primaryGroupId)
				if (found) {
					return found
				}
			}
			const targetPath = auditedGroup.survivor ? auditedGroup.survivor.normalizedPath : ''
			return pool.find(item => item && Array.isArray(item.files) && item.files.some(f => f && f.path && f.path.includes(targetPath))) || null
		},
		emitSelectGroup(auditedGroup) {
			const group = this.resolveDuplicateGroup(auditedGroup)
			if (group) {
				this.$emit('select-duplicate', group)
			}
		},
		emitCompareGroup(auditedGroup) {
			const group = this.resolveDuplicateGroup(auditedGroup)
			if (group) {
				this.$emit('compare-duplicate', group)
			}
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		async copyReflinkScript() {
			const ok = await copyTextSafely(this.generatedReflinkScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 CoW reflink and cold snapshot script to clipboard.'), 'success')
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the script preview below to copy manually.'), 'error')
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const objectUrl = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = objectUrl
			anchor.download = filename
			document.body.appendChild(anchor)
			anchor.click()
			anchor.remove()
			URL.revokeObjectURL(objectUrl)
			return true
		},
		exportAuditCsv() {
			const csv = buildVmCowCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-vm-cow-reflink.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe CSV audit of VM, DB, and container workloads.'), 'success')
			}
		},
		exportAuditJson() {
			const json = buildVmCowJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-vm-cow-reflink.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported JSON audit manifest of CoW reflink savings.'), 'success')
			}
		},
	},
}
</script>

<style scoped>
.vm-cow-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.vcw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.vcw__title-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.vcw__title {
	margin: 0;
	font-size: 1.08rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.vcw__status-badge {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vcw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vcw__tool-btn,
.vcw__primary-btn,
.vcw__seg-btn,
.vcw__chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.vcw__tool-btn:hover:not(:disabled),
.vcw__seg-btn:hover:not(:disabled),
.vcw__chip:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.vcw__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.vcw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: #ffffff;
}

.vcw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.vcw__seg-btn.is-active,
.vcw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.vcw__tool-btn:focus-visible,
.vcw__primary-btn:focus-visible,
.vcw__seg-btn:focus-visible,
.vcw__chip:focus-visible,
.vcw__group-item:focus-visible,
.vcw__input:focus-visible,
.vcw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.vcw__notice {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.85rem;
	font-weight: 600;
}

.vcw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border: 1px solid #9dd6b4;
}

.vcw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border: 1px solid #f1aeb5;
}

.vcw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.vcw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-inline-size: 68ch;
}

.vcw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.vcw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.vcw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.vcw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vcw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vcw__segments,
.vcw__chip-group,
.vcw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.vcw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.vcw__inputs-row {
	align-items: flex-end;
}

.vcw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.vcw__field-grow {
	flex: 1 1 200px;
}

.vcw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vcw__input {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.vcw__num-input {
	inline-size: 110px;
}

.vcw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.vcw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.vcw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.vcw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vcw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.vcw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vcw__kpi-val.is-accent {
	color: var(--color-primary-element-text, #006aa3);
}

.vcw__kpi-val.is-warn {
	color: #7c4a03;
}

.vcw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.vcw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.vcw__list-pane,
.vcw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vcw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vcw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.vcw__group-list,
.vcw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.vcw__group-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.vcw__group-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.vcw__group-top,
.vcw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vcw__group-name,
.vcw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.vcw__group-path,
.vcw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vcw__group-meta,
.vcw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.vcw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.vcw__pill.is-risk-active-locked,
.vcw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.vcw__pill.is-risk-backing-chain-risk,
.vcw__pill.is-risk-nocow-sparse-trap,
.vcw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.vcw__pill.is-risk-cow-eligible,
.vcw__pill.is-cow {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.vcw__pill.is-risk-cold-reclaimable,
.vcw__pill.is-cold,
.vcw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.vcw__pill.is-neutral {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	border-color: var(--color-border-dark, var(--color-border));
}

.vcw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.vcw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.vcw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vcw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vcw__inspector-actions,
.vcw__override-bar,
.vcw__member-badges {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vcw__guard-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f1aeb5;
	background-color: #fdecea;
	color: #842029;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vcw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vcw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vcw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.vcw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.vcw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.vcw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.vcw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.vcw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.vcw__member-card.is-verdict-golden-survivor {
	border-inline-start: 4px solid #0f5132;
}

.vcw__member-card.is-verdict-cow-reflink-ready,
.vcw__member-card.is-verdict-hardlink-immutable-ready {
	border-inline-start: 4px solid #0b4a8b;
}

.vcw__member-card.is-verdict-cold-purge-ready,
.vcw__member-card.is-verdict-cold-purge-only {
	border-inline-start: 4px solid #0f5132;
}

.vcw__member-card.is-verdict-blocked-active-lock,
.vcw__member-card.is-verdict-blocked-mutable-hardlink {
	border-inline-start: 4px solid #842029;
}

.vcw__member-card.is-verdict-blocked-backing-chain,
.vcw__member-card.is-verdict-blocked-nocow {
	border-inline-start: 4px solid #7c4a03;
}

.vcw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.vcw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.vcw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.vcw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.vcw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vcw__code-pre {
	margin: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-x: auto;
	max-block-size: 280px;
}

.vcw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
