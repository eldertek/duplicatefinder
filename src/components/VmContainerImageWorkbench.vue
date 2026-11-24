<template>
	<section
		class="vm-container-image-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'VM, ISO and Container Image Vault Auditor')">
		<header class="vciw__toolbar">
			<div class="vciw__title-group">
				<h3 class="vciw__title">
					{{ t('duplicatefinder', 'VM, ISO & Container Image Vault Auditor') }}
				</h3>
				<span
					class="vciw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} golden-vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalGoldenVaultClusters,
					}) }}
				</span>
			</div>

			<div class="vciw__toolbar-actions">
				<button
					type="button"
					class="vciw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="vciw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="vciw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="vciw__tool-btn is-close"
					aria-keyshortcuts="Shift+I"
					:title="t('duplicatefinder', 'Hide VM, ISO and Container Image Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide VM & ISO Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="vciw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="vciw__kpis">
			<div class="vciw__kpi">
				<span class="vciw__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="vciw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="vciw__kpi">
				<span class="vciw__kpi-label">{{ t('duplicatefinder', 'Golden Vaults & Active VMs') }}</span>
				<strong class="vciw__kpi-val is-warn">
					{{ analysis.summary.totalGoldenVaultClusters }} {{ t('duplicatefinder', 'golden') }} / {{ analysis.summary.totalProtectedVmAndChecksumClusters }} {{ t('duplicatefinder', 'VMs & SHA256') }}
				</strong>
			</div>
			<div class="vciw__kpi">
				<span class="vciw__kpi-label">{{ t('duplicatefinder', 'Container Exports & Deltas') }}</span>
				<strong class="vciw__kpi-val">
					{{ analysis.summary.totalIsoContainerExportClusters }} {{ t('duplicatefinder', 'ISOs/OCI') }} / {{ analysis.summary.totalVmSnapshotDeltaClusters }} {{ t('duplicatefinder', 'deltas') }}
				</strong>
			</div>
			<div class="vciw__kpi">
				<span class="vciw__kpi-label">{{ t('duplicatefinder', 'Raw Vault Footprint') }}</span>
				<strong class="vciw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="vciw__empty-banner"
			role="note">
			<div class="vciw__empty-text">
				<p class="vciw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Golden ISO Vault, Active VM Disk and SHA256SUMS guards before scanning') }}
				</p>
				<p class="vciw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit VM disk images (.qcow2/.vmdk/.vdi/.vhdx/.vhd/.img/.raw/.utm/), installers (.iso/.ova/.ovf/.sha256/SHA256SUMS), OCI/Docker container exports (.oci.tar/image-layer.tar/docker-save-*.tar/.tar.zst), and snapshot/temp caches (*.vmsn/*.vmsd/*.lck/.vagrant/*.vhdx.tmp/*.part).') }}
				</p>
			</div>
			<button
				type="button"
				class="vciw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="vciw__controls">
			<div class="vciw__control-row">
				<span class="vciw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="vciw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'VM and container vault audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="vciw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="vciw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="vciw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="vciw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="vciw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="vciw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="vciw__seg-btn"
					:class="{ 'is-active': protectGoldenIsoVault }"
					:aria-pressed="protectGoldenIsoVault ? 'true' : 'false'"
					@click="protectGoldenIsoVault = !protectGoldenIsoVault">
					<span>{{ protectGoldenIsoVault ? t('duplicatefinder', 'Golden ISO Vault Guard: ON') : t('duplicatefinder', 'Golden ISO Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vciw__seg-btn"
					:class="{ 'is-active': protectActiveVmDisks }"
					:aria-pressed="protectActiveVmDisks ? 'true' : 'false'"
					@click="protectActiveVmDisks = !protectActiveVmDisks">
					<span>{{ protectActiveVmDisks ? t('duplicatefinder', 'Active VM Disk Guard: ON') : t('duplicatefinder', 'Active VM Disk Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vciw__seg-btn"
					:class="{ 'is-active': protectChecksumSidecars }"
					:aria-pressed="protectChecksumSidecars ? 'true' : 'false'"
					@click="protectChecksumSidecars = !protectChecksumSidecars">
					<span>{{ protectChecksumSidecars ? t('duplicatefinder', 'SHA256SUMS Sidecar Guard: ON') : t('duplicatefinder', 'SHA256SUMS Sidecar Guard: OFF') }}</span>
				</button>
			</div>

			<div class="vciw__control-row vciw__inputs-row">
				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="vciw__input">
						<option value="consolidate-golden-isos">{{ t('duplicatefinder', 'Consolidate Golden ISOs & Datastores') }}</option>
						<option value="prune-vm-snapshot-deltas">{{ t('duplicatefinder', 'Prune VM Snapshot Deltas & Locks') }}</option>
						<option value="prune-duplicate-container-tarballs">{{ t('duplicatefinder', 'Prune Verified Container Tarballs') }}</option>
					</select>
				</label>

				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="vciw__input">
						<option value="golden-vault-and-checksum-first">{{ t('duplicatefinder', 'Golden Vault & SHA-256 first') }}</option>
						<option value="active-vm-disk-first">{{ t('duplicatefinder', 'Active VM Disk first') }}</option>
						<option value="checksum-sidecar-first">{{ t('duplicatefinder', 'Checksum Sidecar first') }}</option>
						<option value="newest-build-first">{{ t('duplicatefinder', 'Newest image build first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Keep Snapshots') }}</span>
					<input
						v-model="keepRecentSnapshotsInput"
						type="number"
						min="1"
						step="1"
						class="vciw__input vciw__num-input">
				</label>

				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="vciw__input vciw__num-input">
				</label>

				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="vciw__input vciw__num-input">
				</label>

				<label class="vciw__field vciw__field-grow">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Filter Image Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="vciw__input"
						:placeholder="t('duplicatefinder', 'e.g. qcow2, golden-iso-vault, oci.tar, SHA256SUMS, .vagrant')">
				</label>

				<label class="vciw__field vciw__field-grow">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="vciw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="vciw__field">
					<span class="vciw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="vciw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Vault & VM risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Image asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="vciw__filters-strip">
			<div
				class="vciw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by VM, ISO or container artifact family')">
				<button
					type="button"
					class="vciw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Vault Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="vciw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="vciw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by VM and container audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="vciw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="vciw__empty-banner"
			role="note">
			<div class="vciw__empty-text">
				<p class="vciw__empty-title">
					{{ t('duplicatefinder', 'No VM disk images, ISO/OVA installers, container tarballs, or snapshot caches match the active filters') }}
				</p>
				<p class="vciw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the artifact family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="vciw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="vciw__workstation">
			<div class="vciw__list-pane">
				<div class="vciw__pane-header">
					<span class="vciw__pane-title">
						{{ t('duplicatefinder', 'Datastore, ISO & Container Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="vciw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="vciw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="vciw__cluster-top">
							<span class="vciw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="vciw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="vciw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.imageLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span class="vciw__num-cell">{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="vciw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="vciw__load-more-wrap">
					<button
						type="button"
						class="vciw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="vciw__inspector-pane">
				<header class="vciw__inspector-header">
					<div class="vciw__inspector-title-wrap">
						<h4 class="vciw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="vciw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.imageLineageStem }}
						</span>
					</div>

					<div class="vciw__inspector-actions">
						<button
							type="button"
							class="vciw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="vciw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-image'"
					class="vciw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified Golden Image Guard:') }}</strong>
					{{ t('duplicatefinder', 'Deletion of ISO/OVA installers and OCI/Docker container exports is strictly blocked whenever no verified SHA-256 sidecar (.sha256/SHA256SUMS), golden-iso-vault anchor, or matching size+hash copy is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasGoldenIsoVault || selectedCluster.hasActiveVmDisk || selectedCluster.hasChecksumSidecar"
					class="vciw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Golden Vault, Active VM Disk & Checksum Guard:') }}</strong>
					{{ t('duplicatefinder', 'golden-iso-vault anchors, active VM datastore disks (.qcow2/.vmdk/.vdi/.vhdx/.vhd/.img/.raw/.utm/), and .sha256/SHA256SUMS sidecars are strictly protected by default.') }}
				</div>

				<div class="vciw__meta-grid">
					<div class="vciw__meta-item">
						<span class="vciw__meta-label">{{ t('duplicatefinder', 'Image Lineage Stem') }}</span>
						<span>{{ selectedCluster.imageLineageStem }}</span>
					</div>
					<div class="vciw__meta-item">
						<span class="vciw__meta-label">{{ t('duplicatefinder', 'Format & Artifact Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="vciw__meta-item">
						<span class="vciw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="vciw__meta-item">
						<span class="vciw__meta-label">{{ t('duplicatefinder', 'Canonical Vault Anchor') }}</span>
						<span class="vciw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="vciw__meta-item">
						<span class="vciw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span class="vciw__num-cell">{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="vciw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="vciw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="vciw__member-top">
							<span class="vciw__member-name">{{ member.basename }}</span>
							<div class="vciw__member-badges">
								<span
									class="vciw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="vciw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="vciw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="vciw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span class="vciw__num-cell">{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null" class="vciw__num-cell">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="vciw__companion-chips">
							<span class="vciw__companion-chip">{{ member.context.imageLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="vciw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isGoldenIsoVault"
								class="vciw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Golden ISO Vault') }}
							</span>
							<span
								v-if="member.context.isActiveVmDisk"
								class="vciw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Active VM Disk') }}
							</span>
							<span
								v-if="member.context.isChecksumSidecar"
								class="vciw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Checksum Sidecar') }}
							</span>
							<span
								v-if="member.context.isIsoOrContainerExport"
								class="vciw__companion-chip">
								{{ member.context.hasVerifiedGoldenTwin ? t('duplicatefinder', 'SHA-256 Twin Verified') : t('duplicatefinder', 'Unverified SHA-256 Twin') }}
							</span>
							<span
								v-if="member.context.isVmSnapshotDelta"
								class="vciw__companion-chip">
								{{ member.context.isStaleSnapshotCache ? t('duplicatefinder', 'Stale Snapshot Cache') : t('duplicatefinder', 'Fresh Snapshot Cache') }}
							</span>
						</div>

						<p class="vciw__member-note">
							{{ member.note }}
						</p>

						<div class="vciw__override-bar">
							<span class="vciw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="vciw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="vciw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="vciw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'exclude' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'exclude' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'exclude')">
								<span>{{ t('duplicatefinder', 'Exclude') }}</span>
							</button>
						</div>
					</article>
				</div>
			</div>
		</div>

		<details
			v-if="analysis.clusters.length > 0"
			class="vciw__script-box">
			<summary class="vciw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="vciw__script-content">
				<div class="vciw__script-actions">
					<button
						type="button"
						class="vciw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="vciw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="vciw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="vciw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	VM_CONTAINER_IMAGE_FAMILY_META,
	VM_CONTAINER_IMAGE_PRESETS,
	analyzeVmContainerImageDuplicates,
	buildVmContainerImageCsvReport,
	buildVmContainerImageJsonReport,
	buildVmContainerImageScript,
	buildVmContainerImageSyncExcludeSnippet,
} from '../tools/vmContainerImageAuditor'

export default {
	name: 'VmContainerImageWorkbench',
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
			presetId: 'all-vm-container-image-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-golden-isos',
			survivorRule: 'golden-vault-and-checksum-first',
			protectGoldenIsoVault: true,
			protectActiveVmDisks: true,
			protectChecksumSidecars: true,
			keepRecentSnapshotsInput: '2',
			staleCacheDaysInput: '14',
			minSizeMbInput: '0',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'reclaim_desc',
			selectedClusterKey: '',
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return VM_CONTAINER_IMAGE_PRESETS
		},
		familyOptions() {
			return Object.values(VM_CONTAINER_IMAGE_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'golden-vault', label: this.t('duplicatefinder', 'Golden ISO Vaults') },
				{ id: 'active-vm-disk', label: this.t('duplicatefinder', 'Active VM Disks') },
				{ id: 'checksum-sidecar', label: this.t('duplicatefinder', 'SHA256SUMS Sidecars') },
				{ id: 'iso-container-export', label: this.t('duplicatefinder', 'ISO & Container Exports') },
				{ id: 'vm-snapshot-delta', label: this.t('duplicatefinder', 'Snapshots & Temp Caches') },
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
				return 2
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
		},
		parsedStaleCacheDays() {
			const trimmed = String(this.staleCacheDaysInput ?? '').trim()
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
			return analyzeVmContainerImageDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectGoldenIsoVault: this.protectGoldenIsoVault,
				protectActiveVmDisks: this.protectActiveVmDisks,
				protectChecksumSidecars: this.protectChecksumSidecars,
				keepRecentSnapshots: this.parsedKeepRecentSnapshots,
				staleCacheDays: this.parsedStaleCacheDays,
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
			if (this.selectedClusterKey) {
				const found = clusters.find(c => c.groupKey === this.selectedClusterKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.primaryGroupId === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildVmContainerImageScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildVmContainerImageSyncExcludeSnippet(this.analysis)
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
		applyPreset(presetId) {
			const preset = VM_CONTAINER_IMAGE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectGoldenIsoVault = preset.protectGoldenIsoVault
			this.protectActiveVmDisks = preset.protectActiveVmDisks
			this.protectChecksumSidecars = preset.protectChecksumSidecars
			this.keepRecentSnapshotsInput = String(preset.keepRecentSnapshots)
			this.staleCacheDaysInput = String(preset.staleCacheDays)
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
			if (this.selectedCluster && !this.selectedClusterKey) {
				this.selectedClusterKey = this.selectedCluster.groupKey
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				'golden-vault': this.t('duplicatefinder', 'Golden Vaulted'),
				'active-vm-disk': this.t('duplicatefinder', 'Active VM Disk'),
				'checksum-sidecar': this.t('duplicatefinder', 'SHA256SUMS'),
				'unverified-image': this.t('duplicatefinder', 'SHA-256 Unverified'),
				'sha256-verified': this.t('duplicatefinder', 'SHA-256 Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-golden-iso-vault'
				|| verdict === 'blocked-active-vm-disk'
				|| verdict === 'blocked-checksum-sidecar'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-golden-image'
				|| verdict === 'blocked-not-vm-snapshot'
				|| verdict === 'blocked-not-container-tarball'
				|| verdict === 'blocked-fresh-vm-snapshot'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-golden-vault') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 50) {
				return 'is-consolidate'
			}
			return 'is-warn'
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return this.activePool.find(g => g && g.id === cluster.primaryGroupId)
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
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 VM, ISO & Container Vault remediation script to clipboard.'))
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
			const csv = buildVmContainerImageCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-vm-container-image-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe VM, ISO & Container Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildVmContainerImageJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-vm-container-image-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported VM, ISO & Container Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.vm-container-image-workbench {
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
}

.vciw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.vciw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.vciw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.vciw__status-badge {
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
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.vciw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vciw__tool-btn,
.vciw__seg-btn,
.vciw__chip,
.vciw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 11px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.4;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.vciw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.vciw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.vciw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.vciw__seg-btn.is-active,
.vciw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.vciw__tool-btn:focus-visible,
.vciw__seg-btn:focus-visible,
.vciw__chip:focus-visible,
.vciw__primary-btn:focus-visible,
.vciw__cluster-item:focus-visible,
.vciw__input:focus-visible,
.vciw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.vciw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.vciw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.vciw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.vciw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px dashed var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
}

.vciw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.vciw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.vciw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.vciw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.vciw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vciw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vciw__segments,
.vciw__chip-group,
.vciw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.vciw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.vciw__inputs-row {
	align-items: flex-end;
}

.vciw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.vciw__field-grow {
	flex: 1 1 200px;
}

.vciw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vciw__input {
	min-block-size: 44px;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	line-height: 1.4;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.vciw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
	font-variant-numeric: tabular-nums;
}

.vciw__num-cell {
	font-variant-numeric: tabular-nums;
}

.vciw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 560px) {
	.vciw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.vciw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.vciw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-inline-start: 3px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vciw__kpi-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.vciw__kpi-val {
	font-size: 0.98rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.vciw__kpi-val.is-accent {
	color: #0b4a8b;
}

.vciw__kpi-val.is-warn {
	color: #7c4a03;
}

.vciw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 12px;
}

@media (min-width: 1080px) {
	.vciw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.vciw__list-pane,
.vciw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vciw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.vciw__pane-title {
	font-size: 0.86rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

.vciw__cluster-list,
.vciw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.vciw__cluster-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.vciw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.vciw__cluster-top,
.vciw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vciw__cluster-name,
.vciw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.vciw__cluster-path,
.vciw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vciw__cluster-meta,
.vciw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.vciw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.vciw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.vciw__pill.is-risk-golden-vault,
.vciw__pill.is-risk-unverified-image,
.vciw__pill.is-risk-shielded,
.vciw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.vciw__pill.is-risk-active-vm-disk,
.vciw__pill.is-risk-checksum-sidecar,
.vciw__pill.is-risk-sha256-verified,
.vciw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.vciw__pill.is-risk-reclaimable,
.vciw__pill.is-reclaim,
.vciw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.vciw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.vciw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.vciw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vciw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vciw__inspector-actions,
.vciw__override-bar,
.vciw__member-badges,
.vciw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vciw__companion-chip {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.74rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.vciw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.vciw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vciw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vciw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.vciw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.vciw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.vciw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.vciw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.vciw__member-card {
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

.vciw__member-card.is-verdict-keep-canonical-survivor,
.vciw__member-card.is-verdict-reclaim-vm-snapshot-delta,
.vciw__member-card.is-verdict-reclaim-verified-container-tarball {
	border-inline-start: 4px solid #0f5132;
}

.vciw__member-card.is-verdict-consolidate-to-golden-vault {
	border-inline-start: 4px solid #0b4a8b;
}

.vciw__member-card.is-verdict-blocked-golden-iso-vault,
.vciw__member-card.is-verdict-blocked-active-vm-disk,
.vciw__member-card.is-verdict-blocked-checksum-sidecar {
	border-inline-start: 4px solid #842029;
}

.vciw__member-card.is-verdict-blocked-unverified-golden-image,
.vciw__member-card.is-verdict-blocked-not-vm-snapshot,
.vciw__member-card.is-verdict-blocked-not-container-tarball,
.vciw__member-card.is-verdict-blocked-fresh-vm-snapshot,
.vciw__member-card.is-verdict-blocked-manual-shield,
.vciw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.vciw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.vciw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.vciw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	padding-block: 6px;
	font-weight: 700;
	font-size: 0.86rem;
	line-height: 1.4;
	cursor: pointer;
}

.vciw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.vciw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vciw__code-pre {
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

.vciw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
