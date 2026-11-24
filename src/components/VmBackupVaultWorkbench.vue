<template>
	<section
		class="vm-backup-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Virtualization, VM Disk Images and Container Backup Vault Auditor')">
		<header class="vbvw__toolbar">
			<div class="vbvw__title-group">
				<h3 class="vbvw__title">
					{{ t('duplicatefinder', 'Virtualization, VM Disk Images & Container Backup Vault Auditor') }}
				</h3>
				<span
					class="vbvw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {prod} prod VMs, {bases} parent bases, {orphans} orphan snaps', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						prod: analysis.summary.totalProductionVmClusters,
						bases: analysis.summary.totalParentBaseClusters,
						orphans: analysis.summary.totalOrphanSnapshotClusters,
					}) }}
				</span>
			</div>

			<div class="vbvw__toolbar-actions">
				<button
					type="button"
					class="vbvw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="vbvw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="vbvw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="vbvw__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="vbvw__tool-btn is-close"
					aria-keyshortcuts="F3"
					:title="t('duplicatefinder', 'Hide Virtualization, VM Disk Images and Container Backup Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide VM Backup Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="vbvw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="vbvw__kpis">
			<div class="vbvw__kpi">
				<span class="vbvw__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="vbvw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="vbvw__kpi">
				<span class="vbvw__kpi-label">{{ t('duplicatefinder', 'Prod VMs & Parent Bases') }}</span>
				<strong class="vbvw__kpi-val is-warn">
					{{ analysis.summary.totalProductionVmClusters }} {{ t('duplicatefinder', 'prod') }} / {{ analysis.summary.totalParentBaseClusters }} {{ t('duplicatefinder', 'parent bases') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="vbvw__kpi">
				<span class="vbvw__kpi-label">{{ t('duplicatefinder', 'Snapshots, Docker & ISOs') }}</span>
				<strong class="vbvw__kpi-val">
					{{ analysis.summary.totalOrphanSnapshotClusters }} {{ t('duplicatefinder', 'orphan snaps') }} / {{ analysis.summary.totalDockerExportClusters }} {{ t('duplicatefinder', 'docker-save') }} / {{ analysis.summary.totalRedundantIsoClusters }} {{ t('duplicatefinder', 'ISOs') }}
				</strong>
			</div>
			<div class="vbvw__kpi">
				<span class="vbvw__kpi-label">{{ t('duplicatefinder', 'Raw VM Vault Footprint') }}</span>
				<strong class="vbvw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="vbvw__empty-banner"
			role="note">
			<div class="vbvw__empty-text">
				<p class="vbvw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure production VM and parent base shields before scanning') }}
				</p>
				<p class="vbvw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit VM disk images (.vmdk, .qcow2, .vhdx, .vdi, .ova, .ovf), VM snapshots (-000001.vmdk, .vmsn, .sav, .avhdx) vs base images and linked clones, Docker/OCI docker-save .tar/.tar.gz backups, and redundant .iso/.img installers.') }}
				</p>
			</div>
			<button
				type="button"
				class="vbvw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="vbvw__controls">
			<div class="vbvw__control-row">
				<span class="vbvw__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="vbvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Virtualization and backup vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="vbvw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="vbvw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="vbvw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="vbvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="vbvw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="vbvw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="vbvw__seg-btn"
					:class="{ 'is-active': protectProductionVmImages }"
					:aria-pressed="protectProductionVmImages ? 'true' : 'false'"
					@click="protectProductionVmImages = !protectProductionVmImages">
					<span>{{ protectProductionVmImages ? t('duplicatefinder', 'Shield Prod VMs: ON') : t('duplicatefinder', 'Shield Prod VMs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vbvw__seg-btn"
					:class="{ 'is-active': protectParentBaseImages }"
					:aria-pressed="protectParentBaseImages ? 'true' : 'false'"
					@click="protectParentBaseImages = !protectParentBaseImages">
					<span>{{ protectParentBaseImages ? t('duplicatefinder', 'Shield Parent Bases: ON') : t('duplicatefinder', 'Shield Parent Bases: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vbvw__seg-btn"
					:class="{ 'is-active': protectActiveSnapshots }"
					:aria-pressed="protectActiveSnapshots ? 'true' : 'false'"
					@click="protectActiveSnapshots = !protectActiveSnapshots">
					<span>{{ protectActiveSnapshots ? t('duplicatefinder', 'Shield Active Snapshots: ON') : t('duplicatefinder', 'Shield Active Snapshots: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vbvw__seg-btn"
					:class="{ 'is-active': protectLinkedCloneBases }"
					:aria-pressed="protectLinkedCloneBases ? 'true' : 'false'"
					@click="protectLinkedCloneBases = !protectLinkedCloneBases">
					<span>{{ protectLinkedCloneBases ? t('duplicatefinder', 'Shield Linked-Clone Bases: ON') : t('duplicatefinder', 'Shield Linked-Clone Bases: OFF') }}</span>
				</button>
			</div>

			<div class="vbvw__control-row vbvw__inputs-row">
				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="vbvw__input">
						<option value="prune-orphan-snapshots-keep-prod-bases">{{ t('duplicatefinder', 'Prune Orphan Snapshots & Exports (Keep Prod & Bases)') }}</option>
						<option value="consolidate-backup-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink Immutable ISOs & Container Exports') }}</option>
						<option value="quarantine-orphan-snapshots-only">{{ t('duplicatefinder', 'Quarantine Orphan Snapshots Only') }}</option>
					</select>
				</label>

				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="vbvw__input">
						<option value="production-and-parent-base-first">{{ t('duplicatefinder', 'Production & Parent Base first') }}</option>
						<option value="newest-backup-first">{{ t('duplicatefinder', 'Newest backup mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Keep Snapshots') }}</span>
					<input
						v-model="keepRecentSnapshotsInput"
						type="number"
						min="0"
						step="1"
						class="vbvw__input vbvw__num-input">
				</label>

				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Snap Retention (d)') }}</span>
					<input
						v-model="staleSnapshotDaysInput"
						type="number"
						min="0"
						step="1"
						class="vbvw__input vbvw__num-input">
				</label>

				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="vbvw__input vbvw__num-input">
				</label>

				<label class="vbvw__field vbvw__field-grow">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Filter VM Stem, Snapshot or Export') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="vbvw__input"
						:placeholder="t('duplicatefinder', 'e.g. .vmdk, .qcow2, -000001, .vmsn, .sav, docker-save, .iso')">
				</label>

				<label class="vbvw__field">
					<span class="vbvw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="vbvw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Governance risk priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="vbvw__control-row">
				<span class="vbvw__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="vbvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Virtualization and backup vault family filter')">
					<button
						type="button"
						class="vbvw__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="vbvw__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="vbvw__control-row">
				<span class="vbvw__control-label">{{ t('duplicatefinder', 'Lineage & Tier') }}</span>
				<div
					class="vbvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Virtualization lineage and verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="vbvw__seg-btn"
						:class="{ 'is-active': verdictFilter === opt.id }"
						:aria-pressed="verdictFilter === opt.id ? 'true' : 'false'"
						@click="verdictFilter = opt.id">
						<span>{{ opt.label }}</span>
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="vbvw__empty-filter"
			role="note">
			<p class="vbvw__empty-title">
				{{ t('duplicatefinder', 'No VM disk images, snapshots, linked clones, docker-save exports, or ISOs match the active filters.') }}
			</p>
			<button
				type="button"
				class="vbvw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="vbvw__workspace">
			<div
				class="vbvw__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited VM Disk Images and Container Backup clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="vbvw__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="vbvw__cluster-top">
						<strong class="vbvw__cluster-name">{{ cluster.name }}</strong>
						<span
							class="vbvw__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="vbvw__cluster-meta">
						<span class="vbvw__tag">{{ cluster.vmStem || cluster.name }}</span>
						<span class="vbvw__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="vbvw__cluster-badges">
						<span
							v-if="cluster.hasProductionCopy"
							class="vbvw__badge is-danger">
							{{ t('duplicatefinder', 'Prod VM Protected') }}
						</span>
						<span
							v-if="cluster.hasParentBaseProtection"
							class="vbvw__badge is-keep">
							{{ t('duplicatefinder', 'Parent Base ({count} active)', { count: cluster.activeSnapshotDependentsCount }) }}
						</span>
						<span
							v-if="cluster.orphanSnapshotDependentsCount > 0"
							class="vbvw__badge is-warn">
							{{ t('duplicatefinder', 'Orphan Snaps: {count}', { count: cluster.orphanSnapshotDependentsCount }) }}
						</span>
						<span
							v-if="cluster.linkedCloneCount > 0"
							class="vbvw__badge is-consolidate">
							{{ t('duplicatefinder', 'Linked Clones: {count}', { count: cluster.linkedCloneCount }) }}
						</span>
					</div>
					<div class="vbvw__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="vbvw__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="vbvw__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="vbvw__inspector">
				<header class="vbvw__inspector-head">
					<div class="vbvw__inspector-title-wrap">
						<h4 class="vbvw__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="vbvw__inspector-sub">
							{{ selectedCluster.vmStem || selectedCluster.name }} | {{ selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="vbvw__inspector-actions">
						<button
							type="button"
							class="vbvw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="vbvw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="vbvw__lineage-grid">
					<div class="vbvw__lineage-item">
						<span class="vbvw__lineage-label">{{ t('duplicatefinder', 'VM Stem & Family') }}</span>
						<strong class="vbvw__lineage-val">{{ selectedCluster.vmStem || selectedCluster.name }} ({{ selectedCluster.familyLabel }})</strong>
					</div>
					<div class="vbvw__lineage-item">
						<span class="vbvw__lineage-label">{{ t('duplicatefinder', 'Parent Base & Prod Shield') }}</span>
						<strong class="vbvw__lineage-val">
							{{ selectedCluster.hasProductionCopy ? t('duplicatefinder', 'Prod VM Shielded') : (selectedCluster.hasParentBaseProtection ? t('duplicatefinder', 'Parent Base Shielded') : t('duplicatefinder', 'Non-Production / Standalone')) }}
						</strong>
					</div>
					<div class="vbvw__lineage-item">
						<span class="vbvw__lineage-label">{{ t('duplicatefinder', 'Snapshot & Linked-Clone Graph') }}</span>
						<strong class="vbvw__lineage-val">
							{{ selectedCluster.activeSnapshotDependentsCount }} {{ t('duplicatefinder', 'active') }} / {{ selectedCluster.orphanSnapshotDependentsCount }} {{ t('duplicatefinder', 'orphan') }} / {{ selectedCluster.linkedCloneCount }} {{ t('duplicatefinder', 'linked clones') }}
						</strong>
					</div>
					<div class="vbvw__lineage-item">
						<span class="vbvw__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="vbvw__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="vbvw__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="vbvw__member-card">
						<div class="vbvw__member-top">
							<code class="vbvw__member-path">{{ member.normalized }}</code>
							<div class="vbvw__member-pills">
								<span
									class="vbvw__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									class="vbvw__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="vbvw__member-bottom">
							<div class="vbvw__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
								<span v-else-if="member.orphanReasons && member.orphanReasons.length > 0">{{ member.orphanReasons.join('; ') }}</span>
							</div>
							<div class="vbvw__member-actions">
								<button
									type="button"
									class="vbvw__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isProductionVmImage && protectProductionVmImages) && !(member.isParentOfActiveSnapshots && protectParentBaseImages)"
									class="vbvw__override-field">
									<span class="vbvw__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="vbvw__override-select"
										:value="getMemberOverride(member.key)"
										@change="setMemberOverride(member.key, $event.target.value)">
										<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
										<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
										<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
									</select>
								</label>
							</div>
						</div>
					</div>
				</div>

				<div class="vbvw__code-panels">
					<div class="vbvw__code-box">
						<div class="vbvw__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="vbvw__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="vbvw__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="vbvw__code-box">
						<div class="vbvw__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="vbvw__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="vbvw__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	VM_BACKUP_PRESETS,
	auditVmBackupVault,
	buildVmBackupCsvReport,
	buildVmBackupJsonManifest,
	buildVmBackupRemediationScript,
	buildVmBackupSyncExcludeList,
} from '../tools/vmBackupVaultAuditor'

export default {
	name: 'VmBackupVaultWorkbench',
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
			presetId: 'all-vm-backup-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-orphan-snapshots-keep-prod-bases',
			survivorRule: 'production-and-parent-base-first',
			protectProductionVmImages: true,
			protectParentBaseImages: true,
			protectActiveSnapshots: true,
			protectLinkedCloneBases: true,
			keepRecentSnapshotsInput: '1',
			staleSnapshotDaysInput: '14',
			minSizeMbInput: '0',
			searchQueryInput: '',
			sortMode: 'reclaim_desc',
			selectedClusterId: null,
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return VM_BACKUP_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'production-vm-image', label: this.t('duplicatefinder', 'Prod VMs') },
				{ id: 'parent-base-image', label: this.t('duplicatefinder', 'Parent Bases') },
				{ id: 'active-vm-snapshot', label: this.t('duplicatefinder', 'Active Snapshots') },
				{ id: 'orphan-snapshot-delta', label: this.t('duplicatefinder', 'Orphan Snapshots') },
				{ id: 'redundant-backup-export', label: this.t('duplicatefinder', 'Docker & ISOs') },
				{ id: 'shielded', label: this.t('duplicatefinder', 'Shielded') },
			]
		},
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedKeepRecentSnapshots() {
			const trimmed = String(this.keepRecentSnapshotsInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
		},
		parsedStaleSnapshotDays() {
			const trimmed = String(this.staleSnapshotDaysInput ?? '').trim()
			if (!trimmed) {
				return 14
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14
		},
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return auditVmBackupVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectProductionVmImages: this.protectProductionVmImages,
				protectParentBaseImages: this.protectParentBaseImages,
				protectActiveSnapshots: this.protectActiveSnapshots,
				protectLinkedCloneBases: this.protectLinkedCloneBases,
				keepRecentSnapshots: this.parsedKeepRecentSnapshots,
				staleSnapshotDays: this.parsedStaleSnapshotDays,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				memberOverrides: this.memberOverrides,
			})
		},
		visibleClusters() {
			return this.analysis.clusters.slice(0, this.visibleLimit)
		},
		selectedCluster() {
			const clusters = this.analysis.clusters
			if (!clusters.length) {
				return null
			}
			if (this.selectedClusterId !== null && this.selectedClusterId !== undefined) {
				const found = clusters.find(c => c.id === this.selectedClusterId)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.id === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildVmBackupRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildVmBackupSyncExcludeList()
		},
	},
	methods: {
		t(app, text, vars) {
			if (typeof globalThis.t === 'function') {
				return globalThis.t(app, text, vars)
			}
			if (!vars) {
				return text
			}
			return Object.keys(vars).reduce(
				(acc, key) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(vars[key])),
				text
			)
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		formatMemberSize(size) {
			return formatBytes(size)
		},
		applyPreset(presetId) {
			const preset = VM_BACKUP_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectProductionVmImages = preset.protectProductionVmImages
			this.protectParentBaseImages = preset.protectParentBaseImages
			this.protectActiveSnapshots = preset.protectActiveSnapshots
			this.protectLinkedCloneBases = preset.protectLinkedCloneBases
			this.keepRecentSnapshotsInput = String(preset.keepRecentSnapshots)
			this.staleSnapshotDaysInput = String(preset.staleSnapshotDays)
			this.minSizeMbInput = String(preset.minSizeMb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeMbInput = '0'
			this.searchQueryInput = ''
			this.visibleLimit = 25
		},
		getMemberOverride(selectionKey) {
			return this.memberOverrides[selectionKey] || 'auto'
		},
		setMemberOverride(selectionKey, value) {
			if (this.selectedCluster && this.selectedClusterId === null) {
				this.selectedClusterId = this.selectedCluster.id
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatVerdictLabel(verdict) {
			const map = {
				'production-vm-image': this.t('duplicatefinder', 'Prod VM Protected'),
				'parent-base-image': this.t('duplicatefinder', 'Parent Base Protected'),
				'active-vm-snapshot': this.t('duplicatefinder', 'Active Snapshot'),
				'orphan-snapshot-delta': this.t('duplicatefinder', 'Orphan Snapshot'),
				'redundant-backup-export': this.t('duplicatefinder', 'Redundant Export / ISO'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'production-vm-image') {
				return 'is-danger'
			}
			if (verdict === 'parent-base-image') {
				return 'is-keep'
			}
			if (verdict === 'active-vm-snapshot') {
				return 'is-warn'
			}
			if (verdict === 'orphan-snapshot-delta') {
				return 'is-reclaim'
			}
			return 'is-consolidate'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return member.governanceTier === 'orphan-snapshot-delta'
					? this.t('duplicatefinder', 'QUARANTINE / PRUNE')
					: this.t('duplicatefinder', 'RECLAIM')
			}
			if (member.action === 'hardlink') {
				return this.t('duplicatefinder', 'HARDLINK')
			}
			if (member.isSurvivor) {
				return this.t('duplicatefinder', 'KEEP (SURVIVOR)')
			}
			return member.shielded
				? this.t('duplicatefinder', 'KEEP (SHIELDED)')
				: this.t('duplicatefinder', 'KEEP')
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return cluster.group
				|| this.activePool.find(g => g && g.id === cluster.id)
				|| this.activePool.find(g => g && g.hash && g.hash === cluster.hash)
				|| null
		},
		jumpToDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('select-duplicate', target)
			}
		},
		compareDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('compare-duplicate', target)
			}
		},
		async copyMemberPath(path) {
			const ok = await copyTextSafely(path)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied artifact path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 VM & Container Backup remediation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
			}
		},
		async copySyncExcludeSnippet() {
			const ok = await copyTextSafely(this.generatedSyncExclude)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied .sync-exclude.lst rules to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy .sync-exclude.lst rules to clipboard.'), 'error')
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
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			if (typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(objectUrl)
			}
			return true
		},
		exportAuditCsv() {
			const csv = buildVmBackupCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-vm-backup-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe VM & Container Backup CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildVmBackupJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-vm-backup-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported VM & Container Backup JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.vm-backup-vault-workbench {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
	max-inline-size: 100%;
	overflow-x: clip;
}

.vbvw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.vbvw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.vbvw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.vbvw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 6px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.vbvw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vbvw__tool-btn,
.vbvw__seg-btn,
.vbvw__primary-btn,
.vbvw__load-more-btn,
.vbvw__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	max-inline-size: 100%;
	text-align: center;
}

.vbvw__tool-btn:hover:not(:disabled),
.vbvw__seg-btn:hover:not(:disabled),
.vbvw__load-more-btn:hover:not(:disabled),
.vbvw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.vbvw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.vbvw__tool-btn.is-primary-outline,
.vbvw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.vbvw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.vbvw__tool-btn:focus-visible,
.vbvw__seg-btn:focus-visible,
.vbvw__primary-btn:focus-visible,
.vbvw__load-more-btn:focus-visible,
.vbvw__mini-btn:focus-visible,
.vbvw__cluster-card:focus-visible,
.vbvw__input:focus-visible,
.vbvw__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.vbvw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.vbvw__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.vbvw__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.vbvw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.vbvw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vbvw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.vbvw__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vbvw__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.vbvw__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.vbvw__empty-banner,
.vbvw__empty-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.vbvw__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.vbvw__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.vbvw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.vbvw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.vbvw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.vbvw__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.vbvw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.vbvw__inputs-row {
	align-items: flex-end;
}

.vbvw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.vbvw__field-grow {
	flex: 1 1 180px;
}

.vbvw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.vbvw__input,
.vbvw__override-select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	box-sizing: border-box;
	max-inline-size: 100%;
}

.vbvw__num-input {
	inline-size: 96px;
}

.vbvw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.vbvw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.vbvw__cluster-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.vbvw__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.vbvw__cluster-top,
.vbvw__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.vbvw__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.vbvw__cluster-meta,
.vbvw__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.vbvw__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.vbvw__badge,
.vbvw__pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.vbvw__pill.is-keep,
.vbvw__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.vbvw__pill.is-danger,
.vbvw__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.vbvw__pill.is-consolidate,
.vbvw__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.vbvw__pill.is-warn,
.vbvw__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.vbvw__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.vbvw__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.vbvw__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vbvw__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.vbvw__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.vbvw__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vbvw__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vbvw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vbvw__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.vbvw__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.vbvw__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.vbvw__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.vbvw__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.vbvw__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.vbvw__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.vbvw__member-top,
.vbvw__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vbvw__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.vbvw__member-pills,
.vbvw__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.vbvw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.vbvw__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.vbvw__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.vbvw__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.vbvw__pre {
	margin: 0;
	padding: 8px;
	border-radius: 4px;
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
	max-block-size: 200px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.vbvw__sr-only {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 1120px) {
	.vbvw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.vbvw__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.vbvw__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.vm-backup-vault-workbench {
		padding: 10px;
	}

	.vbvw__kpis,
	.vbvw__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.vbvw__num-input {
		inline-size: 100%;
	}

	.vbvw__field {
		flex: 1 1 100%;
	}
}
</style>
