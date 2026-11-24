<template>
	<section
		class="database-dump-log-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Database Dump, Backup Snapshot and Log Rotation Vault Auditor')">
		<header class="ddl__toolbar">
			<div class="ddl__title-group">
				<h3 class="ddl__title">
					{{ t('duplicatefinder', 'Database Dump, Backup Snapshot & Log Rotation Vault Auditor') }}
				</h3>
				<span
					class="ddl__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {anchors} GFS & sidecar-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						anchors: analysis.summary.totalGfsAnchorClusters,
					}) }}
				</span>
			</div>

			<div class="ddl__toolbar-actions">
				<button
					type="button"
					class="ddl__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ddl__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ddl__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ddl__tool-btn is-close"
					aria-keyshortcuts="Shift+Q"
					:title="t('duplicatefinder', 'Hide Database Dump, Backup Snapshot and Log Rotation Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide DB & Log Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ddl__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ddl__kpis">
			<div class="ddl__kpi">
				<span class="ddl__kpi-label">{{ t('duplicatefinder', 'Safe Datastore Reclaim') }}</span>
				<strong class="ddl__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ddl__kpi">
				<span class="ddl__kpi-label">{{ t('duplicatefinder', 'GFS Anchors & Sidecars') }}</span>
				<strong class="ddl__kpi-val is-warn">
					{{ analysis.summary.totalGfsAnchorClusters }} {{ t('duplicatefinder', 'anchored') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ddl__kpi">
				<span class="ddl__kpi-label">{{ t('duplicatefinder', 'SQL Twins, WAL & Logs') }}</span>
				<strong class="ddl__kpi-val">
					{{ analysis.summary.totalUncompressedTwinClusters }} {{ t('duplicatefinder', 'SQL') }} / {{ analysis.summary.totalWalArtifactClusters }} {{ t('duplicatefinder', 'WAL') }} / {{ analysis.summary.totalRotatedLogClusters }} {{ t('duplicatefinder', 'logs') }}
				</strong>
			</div>
			<div class="ddl__kpi">
				<span class="ddl__kpi-label">{{ t('duplicatefinder', 'Raw Dump & Log Footprint') }}</span>
				<strong class="ddl__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ddl__empty-banner"
			role="note">
			<div class="ddl__empty-text">
				<p class="ddl__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure GFS retention and sidecar guards before scanning') }}
				</p>
				<p class="ddl__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit compressed DB archives (*.sql.zst/.sql.gz/.dump.zst/.pgdump/.bak.gz/.archive.gz + .sha256/.sig), plain SQL twins (*.sql/.dump/.bak/.bson), WAL/lock artifacts (*.sqlite-wal/*.sqlite-shm/*.db-journal/pg_wal/*.ready/ib_logfile*/.dump.part/.sql.tmp), and rotated service logs (access.log.*/error.log.*/nextcloud.log.*/worker-*.log.gz).') }}
				</p>
			</div>
			<button
				type="button"
				class="ddl__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ddl__controls">
			<div class="ddl__control-row">
				<span class="ddl__control-label">{{ t('duplicatefinder', 'DBA Audit Preset') }}</span>
				<div
					class="ddl__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Database dump and log vault audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ddl__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ddl__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ddl__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ddl__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ddl__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ddl__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ddl__seg-btn"
					:class="{ 'is-active': protectGfsAnchor }"
					:aria-pressed="protectGfsAnchor ? 'true' : 'false'"
					@click="protectGfsAnchor = !protectGfsAnchor">
					<span>{{ protectGfsAnchor ? t('duplicatefinder', 'GFS Retention Anchor Guard: ON') : t('duplicatefinder', 'GFS Retention Anchor Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ddl__seg-btn"
					:class="{ 'is-active': protectSidecars }"
					:aria-pressed="protectSidecars ? 'true' : 'false'"
					@click="protectSidecars = !protectSidecars">
					<span>{{ protectSidecars ? t('duplicatefinder', 'SHA-256 / Sig Sidecar Guard: ON') : t('duplicatefinder', 'SHA-256 / Sig Sidecar Guard: OFF') }}</span>
				</button>
			</div>

			<div class="ddl__control-row ddl__inputs-row">
				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ddl__input">
						<option value="apply-gfs-dump-and-log-retention">{{ t('duplicatefinder', 'Apply GFS Dump & Log Retention') }}</option>
						<option value="prune-uncompressed-sql-when-zst-verified">{{ t('duplicatefinder', 'Prune Uncompressed SQL When .zst/.gz Verified') }}</option>
						<option value="prune-stale-wal-and-tmp-artifacts">{{ t('duplicatefinder', 'Prune Stale WAL & Tmp Artifacts') }}</option>
					</select>
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ddl__input">
						<option value="gfs-vault-and-compressed-first">{{ t('duplicatefinder', 'Vault & Compressed Snapshots first') }}</option>
						<option value="newest-snapshot-first">{{ t('duplicatefinder', 'Newest snapshot timestamp first') }}</option>
						<option value="sha256-and-sidecar-first">{{ t('duplicatefinder', 'SHA-256 & Sidecar Anchors first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'GFS Keep Daily') }}</span>
					<input
						v-model="keepDailyInput"
						type="number"
						min="1"
						step="1"
						class="ddl__input ddl__num-input">
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'GFS Keep Weekly') }}</span>
					<input
						v-model="keepWeeklyInput"
						type="number"
						min="0"
						step="1"
						class="ddl__input ddl__num-input">
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Stale WAL (d)') }}</span>
					<input
						v-model="staleWalDaysInput"
						type="number"
						min="0"
						step="1"
						class="ddl__input ddl__num-input">
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="ddl__input ddl__num-input">
				</label>

				<label class="ddl__field ddl__field-grow">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Filter DB Stem, Snapshot Date or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ddl__input"
						:placeholder="t('duplicatefinder', 'e.g. sql.zst, pg_wal, ib_logfile, nextcloud.log, 2026-11')">
				</label>

				<label class="ddl__field ddl__field-grow">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="ddl__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="ddl__field">
					<span class="ddl__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ddl__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'GFS & twin risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="ddl__filters-strip">
			<div
				class="ddl__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by database dump or log artifact family')">
				<button
					type="button"
					class="ddl__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All DB & Log Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="ddl__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="ddl__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by database vault audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="ddl__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="ddl__empty-banner"
			role="note">
			<div class="ddl__empty-text">
				<p class="ddl__empty-title">
					{{ t('duplicatefinder', 'No database dumps, snapshots, WAL artifacts, or rotated logs match the active filters') }}
				</p>
				<p class="ddl__empty-hint">
					{{ t('duplicatefinder', 'Adjust the family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="ddl__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ddl__workstation">
			<div class="ddl__list-pane">
				<div class="ddl__pane-header">
					<span class="ddl__pane-title">
						{{ t('duplicatefinder', 'Database & Log Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="ddl__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="ddl__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="ddl__cluster-top">
							<span class="ddl__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="ddl__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="ddl__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.dbLineageStem }}</span>
							<span v-if="cluster.snapshotDate">{{ cluster.snapshotDate }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span class="ddl__num-cell">{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="ddl__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="ddl__load-more-wrap">
					<button
						type="button"
						class="ddl__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="ddl__inspector-pane">
				<header class="ddl__inspector-header">
					<div class="ddl__inspector-title-wrap">
						<h4 class="ddl__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="ddl__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'log' }} / {{ selectedCluster.dbLineageStem }}
						</span>
					</div>

					<div class="ddl__inspector-actions">
						<button
							type="button"
							class="ddl__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="ddl__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-compressed-twin'"
					class="ddl__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified Compressed Twin Guard:') }}</strong>
					{{ t('duplicatefinder', 'Deletion of plain *.sql, *.dump, *.bak, *.bson, or active database files is blocked whenever no conserved *.sql.zst, *.sql.gz, *.dump.zst, or *.pgdump archive twin matches this stem and snapshot date.') }}
				</div>

				<div
					v-if="selectedCluster.hasGfsAnchor || selectedCluster.hasSidecar"
					class="ddl__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'GFS Retention & Sidecar Integrity Guard:') }}</strong>
					{{ t('duplicatefinder', 'Latest GFS snapshot anchors (keepDaily={daily}, keepWeekly={weekly}) and .sha256/.sig sidecars are strictly protected by default.', {
						daily: analysis.options.keepDaily,
						weekly: analysis.options.keepWeekly,
					}) }}
				</div>

				<div class="ddl__meta-grid">
					<div class="ddl__meta-item">
						<span class="ddl__meta-label">{{ t('duplicatefinder', 'DB / Log Lineage Stem') }}</span>
						<span>{{ selectedCluster.dbLineageStem }}</span>
					</div>
					<div class="ddl__meta-item">
						<span class="ddl__meta-label">{{ t('duplicatefinder', 'Snapshot Date & Tags') }}</span>
						<span>{{ selectedCluster.snapshotDate || '-' }} / {{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="ddl__meta-item">
						<span class="ddl__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="ddl__meta-item">
						<span class="ddl__meta-label">{{ t('duplicatefinder', 'Canonical Vault Anchor') }}</span>
						<span class="ddl__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="ddl__meta-item">
						<span class="ddl__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span class="ddl__num-cell">{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="ddl__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="ddl__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="ddl__member-top">
							<span class="ddl__member-name">{{ member.basename }}</span>
							<div class="ddl__member-badges">
								<span
									class="ddl__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="ddl__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="ddl__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="ddl__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span class="ddl__num-cell">{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null" class="ddl__num-cell">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="ddl__companion-chips">
							<span class="ddl__companion-chip">{{ member.context.dbLineageStem }}</span>
							<span
								v-if="member.context.snapshotDate"
								class="ddl__companion-chip">
								{{ member.context.snapshotDate }}
							</span>
							<span
								v-if="member.context.gfsSlot !== 'none'"
								class="ddl__companion-chip"
								:class="{ 'is-warn': member.context.isLatestGfsAnchor }">
								GFS: {{ member.context.gfsSlot }}
							</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="ddl__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isIntegritySidecar"
								class="ddl__companion-chip is-warn">
								{{ t('duplicatefinder', 'Integrity Sidecar (.sha256/.sig)') }}
							</span>
							<span
								v-if="member.context.isUncompressedPlainSqlTwin"
								class="ddl__companion-chip">
								{{ member.context.hasVerifiedCompressedTwin ? t('duplicatefinder', 'Compressed .zst/.gz Twin Verified') : t('duplicatefinder', 'Missing Compressed .zst/.gz Twin') }}
							</span>
							<span
								v-if="member.context.isWalArtifact"
								class="ddl__companion-chip">
								{{ member.context.isStaleWalArtifact ? t('duplicatefinder', 'Stale WAL / Lock') : t('duplicatefinder', 'Fresh / Active WAL / Lock') }}
							</span>
						</div>

						<p class="ddl__member-note">
							{{ member.note }}
						</p>

						<div class="ddl__override-bar">
							<span class="ddl__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="ddl__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="ddl__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="ddl__seg-btn"
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
			class="ddl__script-box">
			<summary class="ddl__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="ddl__script-content">
				<div class="ddl__script-actions">
					<button
						type="button"
						class="ddl__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="ddl__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="ddl__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="ddl__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	DATABASE_DUMP_LOG_FAMILY_META,
	DATABASE_DUMP_LOG_PRESETS,
	analyzeDatabaseDumpLogDuplicates,
	buildDatabaseDumpLogCsvReport,
	buildDatabaseDumpLogJsonReport,
	buildDatabaseDumpLogScript,
	buildDatabaseDumpLogSyncExcludeSnippet,
} from '../tools/databaseDumpLogAuditor'

export default {
	name: 'DatabaseDumpLogWorkbench',
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
			presetId: 'all-db-log-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'apply-gfs-dump-and-log-retention',
			survivorRule: 'gfs-vault-and-compressed-first',
			protectGfsAnchor: true,
			protectSidecars: true,
			keepDailyInput: '7',
			keepWeeklyInput: '4',
			staleWalDaysInput: '7',
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
			return DATABASE_DUMP_LOG_PRESETS
		},
		familyOptions() {
			return Object.values(DATABASE_DUMP_LOG_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'gfs-anchor', label: this.t('duplicatefinder', 'GFS Retention Anchors') },
				{ id: 'sidecar', label: this.t('duplicatefinder', 'Sidecars (.sha256/.sig)') },
				{ id: 'uncompressed-twin', label: this.t('duplicatefinder', 'Uncompressed SQL Twins') },
				{ id: 'wal-artifact', label: this.t('duplicatefinder', 'WAL / Journal / Locks') },
				{ id: 'rotated-log', label: this.t('duplicatefinder', 'Rotated Service Logs') },
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
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 7
		},
		parsedKeepWeekly() {
			const trimmed = String(this.keepWeeklyInput ?? '').trim()
			if (!trimmed) {
				return 4
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 4
		},
		parsedStaleWalDays() {
			const trimmed = String(this.staleWalDaysInput ?? '').trim()
			if (!trimmed) {
				return 7
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7
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
			return analyzeDatabaseDumpLogDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectGfsAnchor: this.protectGfsAnchor,
				protectSidecars: this.protectSidecars,
				keepDaily: this.parsedKeepDaily,
				keepWeekly: this.parsedKeepWeekly,
				staleWalDays: this.parsedStaleWalDays,
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
			return buildDatabaseDumpLogScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildDatabaseDumpLogSyncExcludeSnippet(this.analysis)
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
			const preset = DATABASE_DUMP_LOG_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectGfsAnchor = preset.protectGfsAnchor
			this.protectSidecars = preset.protectSidecars
			this.keepDailyInput = String(preset.keepDaily)
			this.keepWeeklyInput = String(preset.keepWeekly)
			this.staleWalDaysInput = String(preset.staleWalDays)
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
				'gfs-anchor': this.t('duplicatefinder', 'GFS Anchor Protected'),
				'sidecar-guarded': this.t('duplicatefinder', 'Sidecar Protected'),
				'unverified-compressed-twin': this.t('duplicatefinder', 'Unverified Compressed Twin'),
				'compressed-twin-verified': this.t('duplicatefinder', 'Compressed Twin Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-gfs-retention-anchor'
				|| verdict === 'blocked-sidecar-integrity'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-compressed-twin'
				|| verdict === 'blocked-active-wal-or-lock'
				|| verdict === 'blocked-strategy-scope'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-vault-anchor') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 DB & Log Vault remediation script to clipboard.'))
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
			const csv = buildDatabaseDumpLogCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-database-dump-log-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe DB & Log Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDatabaseDumpLogJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-database-dump-log-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported DB & Log Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.database-dump-log-workbench {
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

.ddl__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ddl__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ddl__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ddl__status-badge {
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

.ddl__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ddl__tool-btn,
.ddl__seg-btn,
.ddl__chip,
.ddl__primary-btn {
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

.ddl__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.ddl__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ddl__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.ddl__seg-btn.is-active,
.ddl__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ddl__tool-btn:focus-visible,
.ddl__seg-btn:focus-visible,
.ddl__chip:focus-visible,
.ddl__primary-btn:focus-visible,
.ddl__cluster-item:focus-visible,
.ddl__input:focus-visible,
.ddl__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.ddl__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ddl__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ddl__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ddl__empty-banner {
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

.ddl__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.ddl__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.ddl__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.ddl__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.ddl__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ddl__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ddl__segments,
.ddl__chip-group,
.ddl__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.ddl__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.ddl__inputs-row {
	align-items: flex-end;
}

.ddl__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ddl__field-grow {
	flex: 1 1 200px;
}

.ddl__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ddl__input {
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

.ddl__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
	font-variant-numeric: tabular-nums;
}

.ddl__num-cell {
	font-variant-numeric: tabular-nums;
}

.ddl__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 560px) {
	.ddl__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.ddl__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.ddl__kpi {
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

.ddl__kpi-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.ddl__kpi-val {
	font-size: 0.98rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.ddl__kpi-val.is-accent {
	color: #0b4a8b;
}

.ddl__kpi-val.is-warn {
	color: #7c4a03;
}

.ddl__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 12px;
}

@media (min-width: 1080px) {
	.ddl__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.ddl__list-pane,
.ddl__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ddl__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.ddl__pane-title {
	font-size: 0.86rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

.ddl__cluster-list,
.ddl__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.ddl__cluster-item {
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

.ddl__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.ddl__cluster-top,
.ddl__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ddl__cluster-name,
.ddl__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.ddl__cluster-path,
.ddl__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ddl__cluster-meta,
.ddl__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ddl__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.ddl__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ddl__pill.is-risk-gfs-anchor,
.ddl__pill.is-risk-unverified-compressed-twin,
.ddl__pill.is-risk-shielded,
.ddl__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ddl__pill.is-risk-sidecar-guarded,
.ddl__pill.is-risk-compressed-twin-verified,
.ddl__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.ddl__pill.is-risk-reclaimable,
.ddl__pill.is-reclaim,
.ddl__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ddl__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.ddl__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.ddl__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ddl__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ddl__inspector-actions,
.ddl__override-bar,
.ddl__member-badges,
.ddl__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ddl__companion-chip {
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

.ddl__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ddl__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ddl__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ddl__meta-grid {
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
	.ddl__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.ddl__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.ddl__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.ddl__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.ddl__member-card {
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

.ddl__member-card.is-verdict-keep-canonical-survivor,
.ddl__member-card.is-verdict-reclaim-uncompressed-sql-twin,
.ddl__member-card.is-verdict-reclaim-stale-wal-artifact,
.ddl__member-card.is-verdict-reclaim-expired-gfs-log {
	border-inline-start: 4px solid #0f5132;
}

.ddl__member-card.is-verdict-consolidate-to-vault-anchor {
	border-inline-start: 4px solid #0b4a8b;
}

.ddl__member-card.is-verdict-blocked-gfs-retention-anchor,
.ddl__member-card.is-verdict-blocked-sidecar-integrity {
	border-inline-start: 4px solid #842029;
}

.ddl__member-card.is-verdict-blocked-unverified-compressed-twin,
.ddl__member-card.is-verdict-blocked-active-wal-or-lock,
.ddl__member-card.is-verdict-blocked-strategy-scope,
.ddl__member-card.is-verdict-blocked-manual-shield,
.ddl__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.ddl__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.ddl__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.ddl__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	padding-block: 6px;
	font-weight: 700;
	font-size: 0.86rem;
	line-height: 1.4;
	cursor: pointer;
}

.ddl__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.ddl__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ddl__code-pre {
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

.ddl__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
