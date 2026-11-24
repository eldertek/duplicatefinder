<template>
	<section
		class="backup-takeout-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Backup Archive, Cloud Takeout Bundle, Dated Snapshot and Extracted-Folder Twin Auditor')">
		<header class="btow__toolbar">
			<div class="btow__title-group">
				<h3 class="btow__title">
					{{ t('duplicatefinder', 'Backup Archive, Cloud Takeout, Snapshot & Twin Auditor') }}
				</h3>
				<span
					class="btow__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalImmutableVaultClusters,
					}) }}
				</span>
			</div>

			<div class="btow__toolbar-actions">
				<button
					type="button"
					class="btow__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="btow__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="btow__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="btow__tool-btn is-close"
					aria-keyshortcuts=")"
					:title="t('duplicatefinder', 'Hide Backup Archive, Cloud Takeout, Snapshot and Twin Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Backups & Takeout') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="btow__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="btow__empty-banner"
			role="note">
			<div class="btow__empty-text">
				<p class="btow__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Immutable Vault and GFS Latest Anchor guards before scanning') }}
				</p>
				<p class="btow__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Google Takeout / OneDrive / Dropbox / iCloud archives, dated DB and system snapshots (.sql.gz/.dump/.wpress/.tar.enc), archive plus extracted-folder twins, and GFS rotation pools.') }}
				</p>
			</div>
			<button
				type="button"
				class="btow__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="btow__controls">
			<div class="btow__control-row">
				<span class="btow__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="btow__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Backup and takeout audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="btow__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="btow__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="btow__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="btow__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="btow__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="btow__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="btow__seg-btn"
					:class="{ 'is-active': protectImmutableVault }"
					:aria-pressed="protectImmutableVault ? 'true' : 'false'"
					@click="protectImmutableVault = !protectImmutableVault">
					<span>{{ protectImmutableVault ? t('duplicatefinder', 'Immutable / Vault Guard: ON') : t('duplicatefinder', 'Immutable / Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="btow__seg-btn"
					:class="{ 'is-active': protectGfsLatestAnchor }"
					:aria-pressed="protectGfsLatestAnchor ? 'true' : 'false'"
					@click="protectGfsLatestAnchor = !protectGfsLatestAnchor">
					<span>{{ protectGfsLatestAnchor ? t('duplicatefinder', 'GFS Latest Anchor Guard: ON') : t('duplicatefinder', 'GFS Latest Anchor Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="btow__seg-btn"
					:class="{ 'is-active': protectVerifiedUnpacked }"
					:aria-pressed="protectVerifiedUnpacked ? 'true' : 'false'"
					@click="protectVerifiedUnpacked = !protectVerifiedUnpacked">
					<span>{{ protectVerifiedUnpacked ? t('duplicatefinder', 'Unpacked Twin Guard: ON') : t('duplicatefinder', 'Unpacked Twin Guard: OFF') }}</span>
				</button>
			</div>

			<div class="btow__control-row btow__inputs-row">
				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="btow__input">
						<option value="retain-gfs-anchor-prune-expired">{{ t('duplicatefinder', 'Retain GFS Anchor & Prune Expired') }}</option>
						<option value="prune-redundant-zips-when-unpacked-verified">{{ t('duplicatefinder', 'Prune Zips When Unpacked Verified') }}</option>
						<option value="consolidate-cold-archive-vault">{{ t('duplicatefinder', 'Consolidate to Cold-Archive Vault') }}</option>
					</select>
				</label>

				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="btow__input">
						<option value="vault-and-anchor-first">{{ t('duplicatefinder', 'Immutable Vault & GFS Anchor first') }}</option>
						<option value="gfs-newest-first">{{ t('duplicatefinder', 'Newest restore timestamp first') }}</option>
						<option value="unpacked-mirror-first">{{ t('duplicatefinder', 'Verified unpacked mirror first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Keep Recent GFS') }}</span>
					<input
						v-model="keepRecentCountInput"
						type="number"
						min="1"
						step="1"
						class="btow__input btow__num-input">
				</label>

				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Stale Backup (d)') }}</span>
					<input
						v-model="staleBackupDaysInput"
						type="number"
						min="0"
						step="1"
						class="btow__input btow__num-input">
				</label>

				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="btow__input btow__num-input">
				</label>

				<label class="btow__field btow__field-grow">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Filter Archive Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="btow__input"
						:placeholder="t('duplicatefinder', 'e.g. Takeout, pgdump, .wpress, daily-, Cold-Archive')">
				</label>

				<label class="btow__field btow__field-grow">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="btow__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="btow__field">
					<span class="btow__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="btow__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Vault & GFS anchor risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Archive name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="btow__kpis">
			<div class="btow__kpi">
				<span class="btow__kpi-label">{{ t('duplicatefinder', 'Safe Backup Reclaim') }}</span>
				<strong class="btow__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="btow__kpi">
				<span class="btow__kpi-label">{{ t('duplicatefinder', 'Immutable Vault & GFS Anchors') }}</span>
				<strong class="btow__kpi-val is-warn">
					{{ analysis.summary.totalImmutableVaultClusters }} {{ t('duplicatefinder', 'vaulted') }} / {{ analysis.summary.totalGfsAnchorClusters }} {{ t('duplicatefinder', 'GFS anchors') }}
				</strong>
			</div>
			<div class="btow__kpi">
				<span class="btow__kpi-label">{{ t('duplicatefinder', 'Unpacked Twins & Shielded') }}</span>
				<strong class="btow__kpi-val">
					{{ analysis.summary.totalUnpackedTwinClusters }} {{ t('duplicatefinder', 'unpacked twins') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="btow__kpi">
				<span class="btow__kpi-label">{{ t('duplicatefinder', 'Raw Archive Footprint') }}</span>
				<strong class="btow__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="btow__filters-strip">
			<div
				class="btow__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by backup and takeout family')">
				<button
					type="button"
					class="btow__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Backup & Takeout ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="btow__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="btow__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by backup audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="btow__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="btow__empty-banner"
			role="note">
			<div class="btow__empty-text">
				<p class="btow__empty-title">
					{{ t('duplicatefinder', 'No cloud takeout, DB snapshot, unpacked twin, or GFS rotation clusters match the active filters') }}
				</p>
				<p class="btow__empty-hint">
					{{ t('duplicatefinder', 'Adjust the backup family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="btow__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="btow__workstation">
			<div class="btow__list-pane">
				<div class="btow__pane-header">
					<span class="btow__pane-title">
						{{ t('duplicatefinder', 'Backup, Takeout & Snapshot Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="btow__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="btow__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="btow__cluster-top">
							<span class="btow__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="btow__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="btow__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.lineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="btow__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="btow__load-more-wrap">
					<button
						type="button"
						class="btow__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="btow__inspector-pane">
				<header class="btow__inspector-header">
					<div class="btow__inspector-title-wrap">
						<h4 class="btow__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="btow__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.lineageStem }}
						</span>
					</div>

					<div class="btow__inspector-actions">
						<button
							type="button"
							class="btow__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="btow__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-anchor'"
					class="btow__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified GFS Anchor or Extracted Twin:') }}</strong>
					{{ t('duplicatefinder', 'Archives and rotation snapshots are strictly shielded whenever GFS anchor timestamps or extracted-folder twins cannot be verified.') }}
				</div>

				<div
					v-if="selectedCluster.hasImmutableVault"
					class="btow__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Immutable / Cold-Archive Vault Guard:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside Immutable/, Vault/, or Cold-Archive/ directories and latest GFS anchors are strictly shielded by default.') }}
				</div>

				<div class="btow__meta-grid">
					<div class="btow__meta-item">
						<span class="btow__meta-label">{{ t('duplicatefinder', 'Lineage Stem') }}</span>
						<span>{{ selectedCluster.lineageStem }}</span>
					</div>
					<div class="btow__meta-item">
						<span class="btow__meta-label">{{ t('duplicatefinder', 'Backup & GFS Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="btow__meta-item">
						<span class="btow__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="btow__meta-item">
						<span class="btow__meta-label">{{ t('duplicatefinder', 'Canonical Restore Point') }}</span>
						<span class="btow__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="btow__meta-item">
						<span class="btow__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="btow__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="btow__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="btow__member-top">
							<span class="btow__member-name">{{ member.basename }}</span>
							<div class="btow__member-badges">
								<span
									class="btow__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="btow__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="btow__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="btow__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="btow__companion-chips">
							<span class="btow__companion-chip">{{ member.context.lineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="btow__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isImmutableVault"
								class="btow__companion-chip is-warn">
								{{ t('duplicatefinder', 'Immutable / Vault') }}
							</span>
							<span
								v-if="member.context.isGfsLatestAnchor"
								class="btow__companion-chip is-warn">
								{{ t('duplicatefinder', 'GFS Latest Anchor') }}
							</span>
							<span
								v-if="member.context.isVerifiedUnpackedMirror"
								class="btow__companion-chip">
								{{ t('duplicatefinder', 'Verified Unpacked Mirror') }}
							</span>
							<span
								v-if="member.context.isStaleRotationGeneration"
								class="btow__companion-chip">
								{{ t('duplicatefinder', 'Expired GFS Generation') }}
							</span>
						</div>

						<p class="btow__member-note">
							{{ member.note }}
						</p>

						<div class="btow__override-bar">
							<span class="btow__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="btow__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="btow__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="btow__seg-btn"
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
			class="btow__script-box">
			<summary class="btow__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="btow__script-content">
				<div class="btow__script-actions">
					<button
						type="button"
						class="btow__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="btow__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="btow__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="btow__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	BACKUP_TAKEOUT_FAMILY_META,
	BACKUP_TAKEOUT_PRESETS,
	analyzeBackupTakeoutDuplicates,
	buildBackupTakeoutCsvReport,
	buildBackupTakeoutJsonReport,
	buildBackupTakeoutScript,
	buildBackupTakeoutSyncExcludeSnippet,
} from '../tools/backupTakeoutAuditor'

export default {
	name: 'BackupTakeoutWorkbench',
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
			presetId: 'all-backup-takeout-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'retain-gfs-anchor-prune-expired',
			survivorRule: 'vault-and-anchor-first',
			protectImmutableVault: true,
			protectGfsLatestAnchor: true,
			protectVerifiedUnpacked: true,
			keepRecentCountInput: '3',
			staleBackupDaysInput: '30',
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
			return BACKUP_TAKEOUT_PRESETS
		},
		familyOptions() {
			return Object.values(BACKUP_TAKEOUT_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'immutable-vault', label: this.t('duplicatefinder', 'Immutable / Cold Vault') },
				{ id: 'gfs-anchor', label: this.t('duplicatefinder', 'GFS Anchors') },
				{ id: 'unpacked-twins', label: this.t('duplicatefinder', 'Unpacked Twins') },
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
		parsedKeepRecentCount() {
			const trimmed = String(this.keepRecentCountInput ?? '').trim()
			if (!trimmed) {
				return 3
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3
		},
		parsedStaleBackupDays() {
			const trimmed = String(this.staleBackupDaysInput ?? '').trim()
			if (!trimmed) {
				return 30
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30
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
			return analyzeBackupTakeoutDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectImmutableVault: this.protectImmutableVault,
				protectGfsLatestAnchor: this.protectGfsLatestAnchor,
				protectVerifiedUnpacked: this.protectVerifiedUnpacked,
				keepRecentCount: this.parsedKeepRecentCount,
				staleBackupDays: this.parsedStaleBackupDays,
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
			return buildBackupTakeoutScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildBackupTakeoutSyncExcludeSnippet(this.analysis)
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
			const preset = BACKUP_TAKEOUT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectImmutableVault = preset.protectImmutableVault
			this.protectGfsLatestAnchor = preset.protectGfsLatestAnchor
			this.protectVerifiedUnpacked = preset.protectVerifiedUnpacked
			this.keepRecentCountInput = String(preset.keepRecentCount)
			this.staleBackupDaysInput = String(preset.staleBackupDays)
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
				'immutable-vault': this.t('duplicatefinder', 'Vault Guarded'),
				'unverified-anchor': this.t('duplicatefinder', 'Unverified Anchor'),
				'gfs-anchored': this.t('duplicatefinder', 'GFS Anchored'),
				'unpacked-paired': this.t('duplicatefinder', 'Unpacked Paired'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-immutable-vault' || verdict === 'blocked-gfs-latest-anchor') {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-gfs-retention-window'
				|| verdict === 'blocked-unverified-gfs-anchor'
				|| verdict === 'blocked-verified-unpacked'
				|| verdict === 'blocked-unverified-unpacked'
				|| verdict === 'blocked-not-archive'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-vault') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Backup & Takeout remediation script to clipboard.'))
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
			const csv = buildBackupTakeoutCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-backup-takeout-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Backup & Takeout CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildBackupTakeoutJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-backup-takeout-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Backup & Takeout JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.backup-takeout-workbench {
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
}

.btow__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.btow__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.btow__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.btow__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.btow__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.btow__tool-btn,
.btow__seg-btn,
.btow__chip,
.btow__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.btow__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.btow__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.btow__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.btow__seg-btn.is-active,
.btow__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.btow__tool-btn:focus-visible,
.btow__seg-btn:focus-visible,
.btow__chip:focus-visible,
.btow__primary-btn:focus-visible,
.btow__cluster-item:focus-visible,
.btow__input:focus-visible,
.btow__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.btow__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.btow__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.btow__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.btow__empty-banner {
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

.btow__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.btow__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.btow__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.btow__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.btow__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.btow__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.btow__segments,
.btow__chip-group,
.btow__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.btow__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.btow__inputs-row {
	align-items: flex-end;
}

.btow__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.btow__field-grow {
	flex: 1 1 200px;
}

.btow__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.btow__input {
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

.btow__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.btow__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.btow__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.btow__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.btow__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.btow__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.btow__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.btow__kpi-val.is-accent {
	color: #0b4a8b;
}

.btow__kpi-val.is-warn {
	color: #7c4a03;
}

.btow__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.btow__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.btow__list-pane,
.btow__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.btow__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.btow__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.btow__cluster-list,
.btow__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.btow__cluster-item {
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

.btow__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.btow__cluster-top,
.btow__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.btow__cluster-name,
.btow__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.btow__cluster-path,
.btow__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.btow__cluster-meta,
.btow__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.btow__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.btow__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.btow__pill.is-risk-immutable-vault,
.btow__pill.is-risk-unverified-anchor,
.btow__pill.is-risk-shielded,
.btow__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.btow__pill.is-risk-gfs-anchored,
.btow__pill.is-risk-unpacked-paired,
.btow__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.btow__pill.is-risk-reclaimable,
.btow__pill.is-reclaim,
.btow__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.btow__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.btow__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.btow__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.btow__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.btow__inspector-actions,
.btow__override-bar,
.btow__member-badges,
.btow__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.btow__companion-chip {
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

.btow__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.btow__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.btow__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.btow__meta-grid {
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
	.btow__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.btow__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.btow__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.btow__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.btow__member-card {
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

.btow__member-card.is-verdict-keep-canonical-survivor,
.btow__member-card.is-verdict-reclaim-redundant-backup,
.btow__member-card.is-verdict-reclaim-expired-rotation,
.btow__member-card.is-verdict-reclaim-redundant-zip {
	border-inline-start: 4px solid #0f5132;
}

.btow__member-card.is-verdict-consolidate-to-vault {
	border-inline-start: 4px solid #0b4a8b;
}

.btow__member-card.is-verdict-blocked-immutable-vault,
.btow__member-card.is-verdict-blocked-gfs-latest-anchor {
	border-inline-start: 4px solid #842029;
}

.btow__member-card.is-verdict-blocked-gfs-retention-window,
.btow__member-card.is-verdict-blocked-unverified-gfs-anchor,
.btow__member-card.is-verdict-blocked-verified-unpacked,
.btow__member-card.is-verdict-blocked-unverified-unpacked,
.btow__member-card.is-verdict-blocked-not-archive,
.btow__member-card.is-verdict-blocked-manual-shield,
.btow__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.btow__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.btow__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.btow__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.btow__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.btow__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.btow__code-pre {
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

.btow__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
