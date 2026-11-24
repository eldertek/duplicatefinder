<template>
	<section
		class="db-sql-log-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Database Dump, SQL Backup and Telemetry Log Vault Auditor')">
		<header class="dslv__toolbar">
			<div class="dslv__title-group">
				<h3 class="dslv__title">
					{{ t('duplicatefinder', 'Database Dump, SQL Backup & Telemetry Log Vault Auditor') }}
				</h3>
				<span
					class="dslv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {active} active DB+WAL, {gfs} GFS anchors, {compliance} compliance', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						active: analysis.summary.totalActiveDbClusters,
						gfs: analysis.summary.totalGfsAnchorClusters,
						compliance: analysis.summary.totalComplianceClusters,
					}) }}
				</span>
			</div>

			<div class="dslv__toolbar-actions">
				<button
					type="button"
					class="dslv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dslv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dslv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dslv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="dslv__tool-btn is-close"
					aria-keyshortcuts="Shift+F8"
					:title="t('duplicatefinder', 'Hide Database Dump, SQL Backup and Telemetry Log Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide SQL & Telemetry Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dslv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="dslv__kpis">
			<div class="dslv__kpi">
				<span class="dslv__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="dslv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="dslv__kpi">
				<span class="dslv__kpi-label">{{ t('duplicatefinder', 'Active DB+WAL & Compliance') }}</span>
				<strong class="dslv__kpi-val is-warn">
					{{ analysis.summary.totalActiveDbClusters }} {{ t('duplicatefinder', 'active DB/WAL') }} / {{ analysis.summary.totalComplianceClusters }} {{ t('duplicatefinder', 'compliance') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="dslv__kpi">
				<span class="dslv__kpi-label">{{ t('duplicatefinder', 'GFS Anchors & Daily Dumps') }}</span>
				<strong class="dslv__kpi-val">
					{{ analysis.summary.totalGfsAnchorClusters }} {{ t('duplicatefinder', 'GFS/latest') }} / {{ analysis.summary.totalRedundantDailyClusters }} {{ t('duplicatefinder', 'daily') }} / {{ analysis.summary.totalTelemetryClusters }} {{ t('duplicatefinder', 'telemetry') }}
				</strong>
			</div>
			<div class="dslv__kpi">
				<span class="dslv__kpi-label">{{ t('duplicatefinder', 'Raw SQL & Log Footprint') }}</span>
				<strong class="dslv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dslv__empty-banner"
			role="note">
			<div class="dslv__empty-text">
				<p class="dslv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure GFS retention and active DB+WAL shields before scanning') }}
				</p>
				<p class="dslv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit SQL dumps (.sql, .sql.gz, .sql.zst, .dump, .bak), active databases (.sqlite, .db, .wal, .shm), rotated/structured logs (.log, .log.gz, .ndjson), and packet captures (.pcap, .pcapng) with GFS Grandfather-Father-Son protection.') }}
				</p>
			</div>
			<button
				type="button"
				class="dslv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dslv__controls">
			<div class="dslv__control-row">
				<span class="dslv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="dslv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Database and telemetry vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dslv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dslv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dslv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dslv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dslv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dslv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dslv__seg-btn"
					:class="{ 'is-active': protectActiveDatabases }"
					:aria-pressed="protectActiveDatabases ? 'true' : 'false'"
					@click="protectActiveDatabases = !protectActiveDatabases">
					<span>{{ protectActiveDatabases ? t('duplicatefinder', 'Shield Active DB+WAL: ON') : t('duplicatefinder', 'Shield Active DB+WAL: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dslv__seg-btn"
					:class="{ 'is-active': protectLatestHealthyBackup }"
					:aria-pressed="protectLatestHealthyBackup ? 'true' : 'false'"
					@click="protectLatestHealthyBackup = !protectLatestHealthyBackup">
					<span>{{ protectLatestHealthyBackup ? t('duplicatefinder', 'Shield Latest Backup: ON') : t('duplicatefinder', 'Shield Latest Backup: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dslv__seg-btn"
					:class="{ 'is-active': protectGfsSnapshots }"
					:aria-pressed="protectGfsSnapshots ? 'true' : 'false'"
					@click="protectGfsSnapshots = !protectGfsSnapshots">
					<span>{{ protectGfsSnapshots ? t('duplicatefinder', 'Shield GFS Monthly/Annual: ON') : t('duplicatefinder', 'Shield GFS Monthly/Annual: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dslv__seg-btn"
					:class="{ 'is-active': protectComplianceArchives }"
					:aria-pressed="protectComplianceArchives ? 'true' : 'false'"
					@click="protectComplianceArchives = !protectComplianceArchives">
					<span>{{ protectComplianceArchives ? t('duplicatefinder', 'Shield Compliance: ON') : t('duplicatefinder', 'Shield Compliance: OFF') }}</span>
				</button>
			</div>

			<div class="dslv__control-row dslv__inputs-row">
				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="dslv__input">
						<option value="prune-redundant-daily-keep-gfs">{{ t('duplicatefinder', 'Prune Redundant Daily (Keep GFS & Active)') }}</option>
						<option value="hardlink-immutable-archives">{{ t('duplicatefinder', 'Hardlink Immutable Compressed Archives') }}</option>
						<option value="quarantine-redundant-daily-only">{{ t('duplicatefinder', 'Quarantine Redundant Copies Only') }}</option>
					</select>
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="dslv__input">
						<option value="gfs-and-active-vault-first">{{ t('duplicatefinder', 'GFS, Compliance & Active DB first') }}</option>
						<option value="newest-snapshot-first">{{ t('duplicatefinder', 'Newest snapshot mtime first') }}</option>
						<option value="compressed-vault-first">{{ t('duplicatefinder', 'Compressed .zst/.gz vault first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Son Daily (d)') }}</span>
					<input
						v-model="keepDailyInput"
						type="number"
						min="0"
						step="1"
						class="dslv__input dslv__num-input">
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Father Monthly (m)') }}</span>
					<input
						v-model="keepMonthlyInput"
						type="number"
						min="0"
						step="1"
						class="dslv__input dslv__num-input">
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Grandfather Annual (y)') }}</span>
					<input
						v-model="keepAnnualInput"
						type="number"
						min="0"
						step="1"
						class="dslv__input dslv__num-input">
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="dslv__input dslv__num-input">
				</label>

				<label class="dslv__field dslv__field-grow">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Filter DB Stem, Dump or Telemetry') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="dslv__input"
						:placeholder="t('duplicatefinder', 'e.g. .sql.zst, .sqlite, .wal, .ndjson, .pcapng, monthly')">
				</label>

				<label class="dslv__field">
					<span class="dslv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="dslv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Governance risk priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="dslv__control-row">
				<span class="dslv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="dslv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Database and telemetry vault family filter')">
					<button
						type="button"
						class="dslv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="dslv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="dslv__control-row">
				<span class="dslv__control-label">{{ t('duplicatefinder', 'GFS & Tier') }}</span>
				<div
					class="dslv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'GFS retention and governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="dslv__seg-btn"
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
			class="dslv__empty-filter"
			role="note">
			<p class="dslv__empty-title">
				{{ t('duplicatefinder', 'No SQL dumps, active databases, WAL/SHM journals, logs, or PCAP captures match the active filters.') }}
			</p>
			<button
				type="button"
				class="dslv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="dslv__workspace">
			<div
				class="dslv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited SQL Dumps, Active Databases and Telemetry Log clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="dslv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="dslv__cluster-top">
						<strong class="dslv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="dslv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="dslv__cluster-meta">
						<span class="dslv__tag">{{ cluster.dbStem || cluster.name }}</span>
						<span class="dslv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="dslv__cluster-badges">
						<span
							v-if="cluster.hasActiveDbWal"
							class="dslv__badge is-danger">
							{{ t('duplicatefinder', 'Active DB+WAL Protected') }}
						</span>
						<span
							v-if="cluster.hasComplianceArchive"
							class="dslv__badge is-keep">
							{{ t('duplicatefinder', 'Compliance Archive') }}
						</span>
						<span
							v-if="cluster.hasLatestHealthyBackup"
							class="dslv__badge is-keep">
							{{ t('duplicatefinder', 'Latest Healthy Backup') }}
						</span>
						<span
							v-if="cluster.hasGfsMonthlyOrAnnual"
							class="dslv__badge is-consolidate">
							{{ t('duplicatefinder', 'GFS Father/Grandfather') }}
						</span>
					</div>
					<div class="dslv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="dslv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="dslv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="dslv__inspector">
				<header class="dslv__inspector-head">
					<div class="dslv__inspector-title-wrap">
						<h4 class="dslv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="dslv__inspector-sub">
							{{ selectedCluster.dbStem || selectedCluster.name }} | {{ selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="dslv__inspector-actions">
						<button
							type="button"
							class="dslv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="dslv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="dslv__lineage-grid">
					<div class="dslv__lineage-item">
						<span class="dslv__lineage-label">{{ t('duplicatefinder', 'Database / Log Stem') }}</span>
						<strong class="dslv__lineage-val">{{ selectedCluster.dbStem || selectedCluster.name }} ({{ selectedCluster.familyLabel }})</strong>
					</div>
					<div class="dslv__lineage-item">
						<span class="dslv__lineage-label">{{ t('duplicatefinder', 'Active DB & Compliance Shield') }}</span>
						<strong class="dslv__lineage-val">
							{{ selectedCluster.hasActiveDbWal ? t('duplicatefinder', 'Active DB+WAL Shielded') : (selectedCluster.hasComplianceArchive ? t('duplicatefinder', 'Compliance Archive Shielded') : (selectedCluster.hasLatestHealthyBackup ? t('duplicatefinder', 'Latest Backup Anchor') : t('duplicatefinder', 'Standard / Redundant'))) }}
						</strong>
					</div>
					<div class="dslv__lineage-item">
						<span class="dslv__lineage-label">{{ t('duplicatefinder', 'GFS Retention Profile') }}</span>
						<strong class="dslv__lineage-val">
							{{ selectedCluster.gfsAnnualCount }} {{ t('duplicatefinder', 'annual') }} / {{ selectedCluster.gfsMonthlyCount }} {{ t('duplicatefinder', 'monthly') }} / {{ selectedCluster.gfsDailyCount }} {{ t('duplicatefinder', 'daily') }}
						</strong>
					</div>
					<div class="dslv__lineage-item">
						<span class="dslv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="dslv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="dslv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="dslv__member-card">
						<div class="dslv__member-top">
							<code class="dslv__member-path">{{ member.normalized }}</code>
							<div class="dslv__member-pills">
								<span
									class="dslv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.gfsTier && member.gfsTier !== 'none'"
									class="dslv__pill is-consolidate">
									{{ formatGfsLabel(member.gfsTier) }}
								</span>
								<span
									class="dslv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="dslv__member-bottom">
							<div class="dslv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span v-if="member.snapshotDate">{{ t('duplicatefinder', 'Snapshot:') }} {{ member.snapshotDate }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
								<span v-else-if="member.hasCompressedTwin">{{ t('duplicatefinder', 'Verified compressed .zst/.gz twin exists') }}</span>
							</div>
							<div class="dslv__member-actions">
								<button
									type="button"
									class="dslv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isActiveDatabasePair && protectActiveDatabases) && !(member.isCompliancePath && protectComplianceArchives) && !(member.isLatestHealthyBackup && protectLatestHealthyBackup) && !(member.isGfsProtectedTier && protectGfsSnapshots)"
									class="dslv__override-field">
									<span class="dslv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="dslv__override-select"
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

				<div class="dslv__code-panels">
					<div class="dslv__code-box">
						<div class="dslv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="dslv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="dslv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="dslv__code-box">
						<div class="dslv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="dslv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="dslv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	DB_SQL_LOG_PRESETS,
	auditDbSqlLogVault,
	buildDbSqlLogCsvReport,
	buildDbSqlLogJsonManifest,
	buildDbSqlLogRemediationScript,
	buildDbSqlLogSyncExcludeList,
} from '../tools/dbSqlLogVaultAuditor'

export default {
	name: 'DbSqlLogVaultWorkbench',
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
			presetId: 'all-db-sql-log-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-redundant-daily-keep-gfs',
			survivorRule: 'gfs-and-active-vault-first',
			protectActiveDatabases: true,
			protectLatestHealthyBackup: true,
			protectGfsSnapshots: true,
			protectComplianceArchives: true,
			keepDailyInput: '7',
			keepMonthlyInput: '12',
			keepAnnualInput: '3',
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
			return DB_SQL_LOG_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'active-db-wal-protected', label: this.t('duplicatefinder', 'Active DB+WAL') },
				{ id: 'latest-healthy-backup', label: this.t('duplicatefinder', 'Latest Backup') },
				{ id: 'gfs-monthly-annual-snapshot', label: this.t('duplicatefinder', 'GFS Monthly/Annual') },
				{ id: 'compliance-vault-archive', label: this.t('duplicatefinder', 'Compliance') },
				{ id: 'redundant-daily-dump', label: this.t('duplicatefinder', 'Redundant Daily') },
				{ id: 'redundant-telemetry-log', label: this.t('duplicatefinder', 'Redundant Logs') },
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
		parsedKeepDaily() {
			const trimmed = String(this.keepDailyInput ?? '').trim()
			if (!trimmed) {
				return 7
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7
		},
		parsedKeepMonthly() {
			const trimmed = String(this.keepMonthlyInput ?? '').trim()
			if (!trimmed) {
				return 12
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 12
		},
		parsedKeepAnnual() {
			const trimmed = String(this.keepAnnualInput ?? '').trim()
			if (!trimmed) {
				return 3
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3
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
			return auditDbSqlLogVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectActiveDatabases: this.protectActiveDatabases,
				protectLatestHealthyBackup: this.protectLatestHealthyBackup,
				protectGfsSnapshots: this.protectGfsSnapshots,
				protectComplianceArchives: this.protectComplianceArchives,
				keepDaily: this.parsedKeepDaily,
				keepMonthly: this.parsedKeepMonthly,
				keepAnnual: this.parsedKeepAnnual,
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
			return buildDbSqlLogRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildDbSqlLogSyncExcludeList()
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
			const preset = DB_SQL_LOG_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectActiveDatabases = preset.protectActiveDatabases
			this.protectLatestHealthyBackup = preset.protectLatestHealthyBackup
			this.protectGfsSnapshots = preset.protectGfsSnapshots
			this.protectComplianceArchives = preset.protectComplianceArchives
			this.keepDailyInput = String(preset.keepDaily)
			this.keepMonthlyInput = String(preset.keepMonthly)
			this.keepAnnualInput = String(preset.keepAnnual)
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
		formatGfsLabel(gfsTier) {
			const map = {
				'grandfather-annual': this.t('duplicatefinder', 'GFS Grandfather (Annual)'),
				'father-monthly': this.t('duplicatefinder', 'GFS Father (Monthly)'),
				'son-daily': this.t('duplicatefinder', 'GFS Son (Daily)'),
			}
			return map[gfsTier] || gfsTier
		},
		formatVerdictLabel(verdict) {
			const map = {
				'active-db-wal-protected': this.t('duplicatefinder', 'Active DB+WAL'),
				'latest-healthy-backup': this.t('duplicatefinder', 'Latest Backup'),
				'gfs-monthly-annual-snapshot': this.t('duplicatefinder', 'GFS Anchor'),
				'compliance-vault-archive': this.t('duplicatefinder', 'Compliance Archive'),
				'redundant-daily-dump': this.t('duplicatefinder', 'Redundant Daily'),
				'redundant-telemetry-log': this.t('duplicatefinder', 'Redundant Log'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'active-db-wal-protected') {
				return 'is-danger'
			}
			if (verdict === 'compliance-vault-archive' || verdict === 'latest-healthy-backup') {
				return 'is-keep'
			}
			if (verdict === 'gfs-monthly-annual-snapshot') {
				return 'is-consolidate'
			}
			if (verdict === 'redundant-daily-dump') {
				return 'is-reclaim'
			}
			return 'is-warn'
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
				return this.strategy === 'quarantine-redundant-daily-only'
					? this.t('duplicatefinder', 'QUARANTINE')
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 SQL & Telemetry Vault remediation script to clipboard.'))
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
			const csv = buildDbSqlLogCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-db-sql-log-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe SQL & Telemetry Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDbSqlLogJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-db-sql-log-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported SQL & Telemetry Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.db-sql-log-vault-workbench {
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

.dslv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.dslv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.dslv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dslv__status-badge {
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

.dslv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dslv__tool-btn,
.dslv__seg-btn,
.dslv__primary-btn,
.dslv__load-more-btn,
.dslv__mini-btn {
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

.dslv__tool-btn:hover:not(:disabled),
.dslv__seg-btn:hover:not(:disabled),
.dslv__load-more-btn:hover:not(:disabled),
.dslv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.dslv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dslv__tool-btn.is-primary-outline,
.dslv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dslv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.dslv__tool-btn:focus-visible,
.dslv__seg-btn:focus-visible,
.dslv__primary-btn:focus-visible,
.dslv__load-more-btn:focus-visible,
.dslv__mini-btn:focus-visible,
.dslv__cluster-card:focus-visible,
.dslv__input:focus-visible,
.dslv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.dslv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.dslv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.dslv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.dslv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.dslv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dslv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dslv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dslv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.dslv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.dslv__empty-banner,
.dslv__empty-filter {
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

.dslv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.dslv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.dslv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.dslv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.dslv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.dslv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.dslv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.dslv__inputs-row {
	align-items: flex-end;
}

.dslv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dslv__field-grow {
	flex: 1 1 180px;
}

.dslv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.dslv__input,
.dslv__override-select {
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

.dslv__num-input {
	inline-size: 96px;
}

.dslv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.dslv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.dslv__cluster-card {
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

.dslv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.dslv__cluster-top,
.dslv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.dslv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.dslv__cluster-meta,
.dslv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.dslv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.dslv__badge,
.dslv__pill {
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

.dslv__pill.is-keep,
.dslv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.dslv__pill.is-danger,
.dslv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.dslv__pill.is-consolidate,
.dslv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.dslv__pill.is-warn,
.dslv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.dslv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.dslv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.dslv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dslv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.dslv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.dslv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dslv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dslv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dslv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.dslv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dslv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.dslv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.dslv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.dslv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.dslv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dslv__member-top,
.dslv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dslv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.dslv__member-pills,
.dslv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.dslv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.dslv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.dslv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dslv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.dslv__pre {
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

.dslv__sr-only {
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
	.dslv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.dslv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.dslv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.db-sql-log-vault-workbench {
		padding: 10px;
	}

	.dslv__kpis,
	.dslv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.dslv__num-input {
		inline-size: 100%;
	}

	.dslv__field {
		flex: 1 1 100%;
	}
}
</style>
