<template>
	<section
		class="log-telemetry-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Log Rotation, Telemetry Dump and Stale Cache Explosion Auditor')">
		<header class="ltw__toolbar">
			<div class="ltw__title-group">
				<h3 class="ltw__title">
					{{ t('duplicatefinder', 'Log Rotation, Telemetry Dump & Stale Cache Explosion Auditor') }}
				</h3>
				<span
					class="ltw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {guarded} live-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						guarded: analysis.summary.totalLiveGuardedClusters,
					}) }}
				</span>
			</div>

			<div class="ltw__toolbar-actions">
				<button
					type="button"
					class="ltw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ltw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ltw__tool-btn"
					@click="copyConsolidationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ltw__tool-btn is-close"
					aria-keyshortcuts="|"
					:title="t('duplicatefinder', 'Hide log rotation, telemetry dump and stale cache auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Log & Cache Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ltw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ltw__empty-banner"
			role="note">
			<div class="ltw__empty-text">
				<p class="ltw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure live log and forensic guards before scanning') }}
				</p>
				<p class="ltw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicated rotated logs (.log.N/.gz/.zst), heap & core dumps (.hprof/.dmp/.core), browser/IDE cache shards, and packet telemetry while protecting live today logs.') }}
				</p>
			</div>
			<button
				type="button"
				class="ltw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ltw__controls">
			<div class="ltw__control-row">
				<span class="ltw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="ltw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Log and telemetry audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ltw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ltw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ltw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ltw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ltw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ltw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ltw__seg-btn"
					:class="{ 'is-active': protectActiveLogs }"
					:aria-pressed="protectActiveLogs ? 'true' : 'false'"
					@click="protectActiveLogs = !protectActiveLogs">
					<span>{{ protectActiveLogs ? t('duplicatefinder', 'Live Today Log Guard: ON') : t('duplicatefinder', 'Live Today Log Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ltw__seg-btn"
					:class="{ 'is-active': protectForensicDumps }"
					:aria-pressed="protectForensicDumps ? 'true' : 'false'"
					@click="protectForensicDumps = !protectForensicDumps">
					<span>{{ protectForensicDumps ? t('duplicatefinder', 'Forensic Crash Guard: ON') : t('duplicatefinder', 'Forensic Crash Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ltw__seg-btn"
					:class="{ 'is-active': protectCompressedRotated }"
					:aria-pressed="protectCompressedRotated ? 'true' : 'false'"
					@click="protectCompressedRotated = !protectCompressedRotated">
					<span>{{ protectCompressedRotated ? t('duplicatefinder', 'Keep Compressed .gz/.zst: ON') : t('duplicatefinder', 'Keep Compressed .gz/.zst: OFF') }}</span>
				</button>
			</div>

			<div class="ltw__control-row ltw__inputs-row">
				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="ltw__input">
						<option value="consolidate-purge">{{ t('duplicatefinder', 'Consolidate & Purge Redundant Copies') }}</option>
						<option value="hardlink-preserve">{{ t('duplicatefinder', 'Hardlink / Reflink (preserve forensic & shard paths)') }}</option>
					</select>
				</label>

				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ltw__input">
						<option value="active-or-newest-first">{{ t('duplicatefinder', 'Active live / newest first') }}</option>
						<option value="compressed-or-canonical-first">{{ t('duplicatefinder', 'Compressed rotated / canonical node first') }}</option>
						<option value="forensic-vault-first">{{ t('duplicatefinder', 'Forensic / incident vault first') }}</option>
						<option value="oldest-mtime">{{ t('duplicatefinder', 'Oldest rotation timestamp') }}</option>
						<option value="newest-mtime">{{ t('duplicatefinder', 'Newest modified artifact') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Live Guard (h)') }}</span>
					<input
						v-model="liveGuardHoursInput"
						type="number"
						min="0"
						step="1"
						class="ltw__input ltw__num-input">
				</label>

				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleAfterDaysInput"
						type="number"
						min="0"
						step="1"
						class="ltw__input ltw__num-input">
				</label>

				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="ltw__input ltw__num-input">
				</label>

				<label class="ltw__field ltw__field-grow">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Filter Log, Dump, Cache or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ltw__input"
						:placeholder="t('duplicatefinder', 'e.g. .log.gz, .hprof, .dmp, Cache_Data, /var/log')">
				</label>

				<label class="ltw__field ltw__field-grow">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="ltw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="ltw__field">
					<span class="ltw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ltw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Live & forensic risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="ltw__kpis">
			<div class="ltw__kpi">
				<span class="ltw__kpi-label">{{ t('duplicatefinder', 'Safe Log & Cache Reclaim') }}</span>
				<strong class="ltw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ltw__kpi">
				<span class="ltw__kpi-label">{{ t('duplicatefinder', 'Live & Forensic Shields') }}</span>
				<strong class="ltw__kpi-val is-warn">
					{{ analysis.summary.totalLiveGuardedClusters }} {{ t('duplicatefinder', 'live') }} / {{ analysis.summary.totalForensicClusters }} {{ t('duplicatefinder', 'forensic') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="ltw__kpi">
				<span class="ltw__kpi-label">{{ t('duplicatefinder', 'Uncompressed Rotated Logs') }}</span>
				<strong class="ltw__kpi-val">
					{{ analysis.summary.totalUncompressedRotatedCount }} {{ t('duplicatefinder', 'files') }}
				</strong>
			</div>
			<div class="ltw__kpi">
				<span class="ltw__kpi-label">{{ t('duplicatefinder', 'Raw Telemetry Footprint') }}</span>
				<strong class="ltw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="ltw__filters-strip">
			<div
				class="ltw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by log and telemetry family')">
				<button
					type="button"
					class="ltw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="ltw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="ltw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="ltw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="ltw__empty-banner"
			role="note">
			<div class="ltw__empty-text">
				<p class="ltw__empty-title">
					{{ t('duplicatefinder', 'No rotated logs, telemetry dumps, or cache shards match the active filters') }}
				</p>
				<p class="ltw__empty-hint">
					{{ t('duplicatefinder', 'Lower the minimum cluster size threshold, clear the search query, or switch to All Artifacts.') }}
				</p>
			</div>
			<button
				type="button"
				class="ltw__primary-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ltw__workstation">
			<div class="ltw__list-pane">
				<div class="ltw__pane-header">
					<span class="ltw__pane-title">
						{{ t('duplicatefinder', 'Telemetry & Cache Clusters ({shown}/{total})', { shown: visibleClusters.length, total: analysis.clusters.length }) }}
					</span>
				</div>

				<div
					class="ltw__cluster-list"
					role="listbox"
					:aria-label="t('duplicatefinder', 'Audited log, telemetry dump, and cache shard clusters')">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						role="option"
						class="ltw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						:aria-selected="selectedCluster && selectedCluster.groupKey === cluster.groupKey ? 'true' : 'false'"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="ltw__cluster-top">
							<span class="ltw__cluster-name">
								{{ cluster.basename }}
							</span>
							<span
								class="ltw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="ltw__cluster-path">
							{{ cluster.tierLabel }} | {{ cluster.survivor.context.dirPath }}
						</div>
						<div class="ltw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ t('duplicatefinder', 'Reclaim:') }} {{ cluster.formattedReclaimableBytes }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleClusters.length"
					class="ltw__load-more-wrap">
					<button
						type="button"
						class="ltw__seg-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleClusters.length }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="ltw__inspector-pane">
				<div class="ltw__inspector-header">
					<div class="ltw__inspector-title-wrap">
						<h4 class="ltw__inspector-title">
							{{ selectedCluster.basename }}
						</h4>
						<span class="ltw__inspector-sub">
							{{ selectedCluster.tierLabel }} | {{ selectedCluster.familyLabel }}
						</span>
					</div>
					<div class="ltw__inspector-actions">
						<button
							type="button"
							class="ltw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Jump to Group') }}</span>
						</button>
						<button
							type="button"
							class="ltw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Side-by-Side') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedCluster.hasActiveLiveMember"
					class="ltw__warn-banner"
					role="note">
					{{ t('duplicatefinder', 'Live Today Log Guard active: unrotated or current-day service logs are shielded against unlink/truncation while stale mirrors are consolidated.') }}
				</div>

				<div
					v-else-if="selectedCluster.hasForensicMember"
					class="ltw__info-banner"
					role="note">
					{{ t('duplicatefinder', 'Forensic Crash Guard active: heap/core dumps in incident vaults or within the post-mortem window are shielded; switch Strategy to Hardlink to deduplicate bytes safely.') }}
				</div>

				<div class="ltw__meta-grid">
					<div class="ltw__meta-item">
						<span class="ltw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="ltw__mono-text">{{ selectedCluster.survivor.normalizedPath }}</span>
					</div>
					<div class="ltw__meta-item">
						<span class="ltw__meta-label">{{ t('duplicatefinder', 'Compression / Rotation') }}</span>
						<span>{{ selectedCluster.compression }} ({{ selectedCluster.survivor.context.rotationSiblingsCount }} {{ t('duplicatefinder', 'sibling files') }})</span>
					</div>
					<div class="ltw__meta-item">
						<span class="ltw__meta-label">{{ t('duplicatefinder', 'Single Artifact / Raw Duplicate') }}</span>
						<span>{{ selectedCluster.formattedSingleSize }} / {{ selectedCluster.formattedReclaimableBytes }} {{ t('duplicatefinder', 'reclaimable') }}</span>
					</div>
					<div class="ltw__meta-item">
						<span class="ltw__meta-label">{{ t('duplicatefinder', 'Shielded / Uncompressed Rotated') }}</span>
						<span>{{ selectedCluster.shieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }} / {{ selectedCluster.uncompressedRotatedCount }} {{ t('duplicatefinder', 'uncompressed') }}</span>
					</div>
				</div>

				<div class="ltw__member-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="ltw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="ltw__member-top">
							<span class="ltw__member-name">{{ member.basename }}</span>
							<div class="ltw__member-badges">
								<span
									class="ltw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="ltw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="ltw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="ltw__member-meta">
							<span>{{ t('duplicatefinder', 'Size:') }} {{ member.formattedSize }}</span>
							<span>{{ t('duplicatefinder', 'Age:') }} {{ member.context.ageHours !== null ? `${member.context.ageHours}h` : t('duplicatefinder', 'Unknown') }}</span>
							<span>{{ t('duplicatefinder', 'Modified:') }} {{ member.formattedMtime || t('duplicatefinder', 'Unknown') }}</span>
						</div>

						<div
							v-if="member.context.isActiveLiveLog || member.context.isForensicProtected || member.context.uncompressedRotatedRisk || member.context.isStaleCache"
							class="ltw__companion-chips">
							<span
								v-if="member.context.isActiveLiveLog"
								class="ltw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Active Live Log') }}
							</span>
							<span
								v-if="member.context.isForensicProtected"
								class="ltw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Forensic Vault / Recent Crash') }}
							</span>
							<span
								v-if="member.context.uncompressedRotatedRisk"
								class="ltw__companion-chip">
								{{ t('duplicatefinder', 'Uncompressed Rotated Log') }}
							</span>
							<span
								v-if="member.context.isStaleCache"
								class="ltw__companion-chip">
								{{ t('duplicatefinder', 'Stale Cache Shard') }}
							</span>
						</div>

						<p class="ltw__member-note">
							{{ member.verdictReason }}
						</p>

						<div
							v-if="member.role !== 'survivor'"
							class="ltw__override-bar">
							<button
								type="button"
								class="ltw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="ltw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'shield' }"
								@click="setMemberOverride(member.selectionKey, 'shield')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="ltw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'exclude' }"
								@click="setMemberOverride(member.selectionKey, 'exclude')">
								<span>{{ t('duplicatefinder', 'Exclude') }}</span>
							</button>
						</div>
					</div>
				</div>

				<details class="ltw__script-box">
					<summary class="ltw__script-summary">
						{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Log & Cache Consolidation & occ files:scan Script') }}
					</summary>
					<div class="ltw__script-content">
						<div class="ltw__script-actions">
							<button
								type="button"
								class="ltw__tool-btn"
								@click="copyConsolidationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ltw__code-pre"><code>{{ generatedScript }}</code></pre>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	LOG_TELEMETRY_FAMILY_META,
	LOG_TELEMETRY_PRESETS,
	analyzeLogTelemetryDuplicates,
	buildLogTelemetryCsvReport,
	buildLogTelemetryJsonReport,
	buildLogTelemetryScript,
} from '../tools/logTelemetryAuditor'

export default {
	name: 'LogTelemetryWorkbench',
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
			presetId: 'all-telemetry-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-purge',
			survivorRule: 'active-or-newest-first',
			protectActiveLogs: true,
			protectForensicDumps: true,
			protectCompressedRotated: false,
			liveGuardHoursInput: '24',
			staleAfterDaysInput: '7',
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
			return LOG_TELEMETRY_PRESETS
		},
		familyOptions() {
			return Object.values(LOG_TELEMETRY_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'live-guarded', label: this.t('duplicatefinder', 'Live Today Log Guard') },
				{ id: 'forensic-guarded', label: this.t('duplicatefinder', 'Forensic Crash Guard') },
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
		parsedLiveGuardHours() {
			const trimmed = String(this.liveGuardHoursInput ?? '').trim()
			if (!trimmed) {
				return 24
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 24
		},
		parsedStaleAfterDays() {
			const trimmed = String(this.staleAfterDaysInput ?? '').trim()
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
		forceKeepKeys() {
			return Object.keys(this.memberOverrides).filter(k => this.memberOverrides[k] === 'shield')
		},
		excludeKeys() {
			return Object.keys(this.memberOverrides).filter(k => this.memberOverrides[k] === 'exclude')
		},
		analysis() {
			return analyzeLogTelemetryDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectActiveLogs: this.protectActiveLogs,
				protectForensicDumps: this.protectForensicDumps,
				protectCompressedRotated: this.protectCompressedRotated,
				liveGuardHours: this.parsedLiveGuardHours,
				staleAfterDays: this.parsedStaleAfterDays,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				forceKeepKeys: this.forceKeepKeys,
				excludeKeys: this.excludeKeys,
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
			return buildLogTelemetryScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
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
			const preset = LOG_TELEMETRY_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectActiveLogs = preset.protectActiveLogs
			this.protectForensicDumps = preset.protectForensicDumps
			this.protectCompressedRotated = preset.protectCompressedRotated
			this.liveGuardHoursInput = String(preset.liveGuardHours)
			this.staleAfterDaysInput = String(preset.staleAfterDays)
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
				'live-guarded': this.t('duplicatefinder', 'Live Log Guarded'),
				'forensic-guarded': this.t('duplicatefinder', 'Forensic Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-anchor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-active-live-log' || verdict === 'blocked-forensic-dump') {
				return 'is-danger'
			}
			if (verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-telemetry-copy') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 40) {
				return 'is-hardlink'
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
		async copyConsolidationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 log and cache consolidation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
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
			const csv = buildLogTelemetryCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-log-telemetry-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe log and telemetry CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildLogTelemetryJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-log-telemetry-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported log and telemetry JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.log-telemetry-workbench {
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

.ltw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ltw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ltw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ltw__status-badge {
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

.ltw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ltw__tool-btn,
.ltw__seg-btn,
.ltw__chip,
.ltw__primary-btn {
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

.ltw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.ltw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ltw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.ltw__seg-btn.is-active,
.ltw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ltw__tool-btn:focus-visible,
.ltw__seg-btn:focus-visible,
.ltw__chip:focus-visible,
.ltw__primary-btn:focus-visible,
.ltw__cluster-item:focus-visible,
.ltw__input:focus-visible,
.ltw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.ltw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ltw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ltw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ltw__empty-banner {
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

.ltw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.ltw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.ltw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.ltw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.ltw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ltw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ltw__segments,
.ltw__chip-group,
.ltw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.ltw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.ltw__inputs-row {
	align-items: flex-end;
}

.ltw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ltw__field-grow {
	flex: 1 1 200px;
}

.ltw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ltw__input {
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

.ltw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.ltw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.ltw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.ltw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.ltw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ltw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.ltw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ltw__kpi-val.is-accent {
	color: #0b4a8b;
}

.ltw__kpi-val.is-warn {
	color: #7c4a03;
}

.ltw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.ltw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.ltw__list-pane,
.ltw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ltw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ltw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.ltw__cluster-list,
.ltw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.ltw__cluster-item {
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

.ltw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.ltw__cluster-top,
.ltw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ltw__cluster-name,
.ltw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.ltw__cluster-path,
.ltw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ltw__cluster-meta,
.ltw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ltw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.ltw__pill.is-risk-live-guarded,
.ltw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ltw__pill.is-risk-forensic-guarded,
.ltw__pill.is-risk-shielded,
.ltw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ltw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.ltw__pill.is-risk-reclaimable,
.ltw__pill.is-reclaim,
.ltw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ltw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.ltw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.ltw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ltw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ltw__inspector-actions,
.ltw__override-bar,
.ltw__member-badges,
.ltw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ltw__companion-chip {
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

.ltw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ltw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ltw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ltw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.ltw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.ltw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.ltw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.ltw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.ltw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ltw__member-card.is-verdict-keep-canonical-anchor,
.ltw__member-card.is-verdict-reclaim-stale-duplicate {
	border-inline-start: 4px solid #0f5132;
}

.ltw__member-card.is-verdict-hardlink-telemetry-copy {
	border-inline-start: 4px solid #0b4a8b;
}

.ltw__member-card.is-verdict-blocked-active-live-log,
.ltw__member-card.is-verdict-blocked-forensic-dump {
	border-inline-start: 4px solid #842029;
}

.ltw__member-card.is-verdict-blocked-manual-shield,
.ltw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.ltw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.ltw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.ltw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.ltw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.ltw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ltw__code-pre {
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

.ltw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
