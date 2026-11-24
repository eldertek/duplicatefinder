<template>
	<section
		class="workbook-drift-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Spreadsheet, BI Report and Financial Workbook Version-Drift Auditor')">
		<header class="wdw__toolbar">
			<div class="wdw__title-group">
				<h3 class="wdw__title">
					{{ t('duplicatefinder', 'Spreadsheet, BI Report & Financial Workbook Version-Drift Auditor') }}
				</h3>
				<span
					class="wdw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {guarded} finance-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						guarded: analysis.summary.totalFinanceVaultClusters,
					}) }}
				</span>
			</div>

			<div class="wdw__toolbar-actions">
				<button
					type="button"
					class="wdw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="wdw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="wdw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="wdw__tool-btn is-close"
					aria-keyshortcuts=">"
					:title="t('duplicatefinder', 'Hide spreadsheet, BI report and financial workbook version-drift auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Workbook Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="wdw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="wdw__empty-banner"
			role="note">
			<div class="wdw__empty-text">
				<p class="wdw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Finance Vault and Macro guards before scanning') }}
				</p>
				<p class="wdw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicated spreadsheets (.xlsx/.ods/.csv), macro workbooks (.xlsm/.xlsb), BI dashboards (.pbix/.twbx/.qvw), and Parquet or ledger exports while shielding Finance, Audit, and Board vaults.') }}
				</p>
			</div>
			<button
				type="button"
				class="wdw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="wdw__controls">
			<div class="wdw__control-row">
				<span class="wdw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="wdw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Workbook drift audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="wdw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="wdw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="wdw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="wdw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="wdw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="wdw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="wdw__seg-btn"
					:class="{ 'is-active': protectFinanceVaults }"
					:aria-pressed="protectFinanceVaults ? 'true' : 'false'"
					@click="protectFinanceVaults = !protectFinanceVaults">
					<span>{{ protectFinanceVaults ? t('duplicatefinder', 'Finance Vault Guard: ON') : t('duplicatefinder', 'Finance Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="wdw__seg-btn"
					:class="{ 'is-active': protectMacroWorkbooks }"
					:aria-pressed="protectMacroWorkbooks ? 'true' : 'false'"
					@click="protectMacroWorkbooks = !protectMacroWorkbooks">
					<span>{{ protectMacroWorkbooks ? t('duplicatefinder', 'Macro/VBA Guard: ON') : t('duplicatefinder', 'Macro/VBA Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="wdw__seg-btn"
					:class="{ 'is-active': protectBiModels }"
					:aria-pressed="protectBiModels ? 'true' : 'false'"
					@click="protectBiModels = !protectBiModels">
					<span>{{ protectBiModels ? t('duplicatefinder', 'BI Master Guard: ON') : t('duplicatefinder', 'BI Master Guard: OFF') }}</span>
				</button>
			</div>

			<div class="wdw__control-row wdw__inputs-row">
				<label class="wdw__field">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Action Strategy') }}</span>
					<select v-model="strategy" class="wdw__input">
						<option value="consolidate-vault">{{ t('duplicatefinder', 'Consolidate & Purge Drift Copies') }}</option>
						<option value="hardlink-vault">{{ t('duplicatefinder', 'Hardlink Mirrors (POSIX ln -f)') }}</option>
						<option value="keep-final-only">{{ t('duplicatefinder', 'Keep FINAL / Purge Drafts & Copies') }}</option>
					</select>
				</label>

				<label class="wdw__field">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="wdw__input">
						<option value="finance-vault-first">{{ t('duplicatefinder', 'Finance/Audit vault first') }}</option>
						<option value="highest-version-final">{{ t('duplicatefinder', 'Highest FINAL / version rank') }}</option>
						<option value="newest-approved">{{ t('duplicatefinder', 'Newest modified copy') }}</option>
						<option value="oldest-canonical">{{ t('duplicatefinder', 'Oldest canonical copy') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="wdw__field">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Stale Drift (d)') }}</span>
					<input
						v-model="staleDraftDaysInput"
						type="number"
						min="0"
						step="1"
						class="wdw__input wdw__num-input">
				</label>

				<label class="wdw__field">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="wdw__input wdw__num-input">
				</label>

				<label class="wdw__field wdw__field-grow">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Filter Workbook, Fiscal Period or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="wdw__input"
						:placeholder="t('duplicatefinder', 'e.g. .xlsx, .xlsm, .pbix, Q4, FY2025, FINAL, /finance')">
				</label>

				<label class="wdw__field wdw__field-grow">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="wdw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="wdw__field">
					<span class="wdw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="wdw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Finance & macro risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Workbook name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="wdw__kpis">
			<div class="wdw__kpi">
				<span class="wdw__kpi-label">{{ t('duplicatefinder', 'Safe Workbook & BI Reclaim') }}</span>
				<strong class="wdw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="wdw__kpi">
				<span class="wdw__kpi-label">{{ t('duplicatefinder', 'Finance & Macro Shields') }}</span>
				<strong class="wdw__kpi-val is-warn">
					{{ analysis.summary.totalFinanceVaultClusters }} {{ t('duplicatefinder', 'vaults') }} / {{ analysis.summary.totalMacroClusters }} {{ t('duplicatefinder', 'macro') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="wdw__kpi">
				<span class="wdw__kpi-label">{{ t('duplicatefinder', 'Version-Drift Forks') }}</span>
				<strong class="wdw__kpi-val">
					{{ analysis.summary.totalDriftForkCopiesCount }} {{ t('duplicatefinder', 'drift copies') }}
				</strong>
			</div>
			<div class="wdw__kpi">
				<span class="wdw__kpi-label">{{ t('duplicatefinder', 'Raw Workbook Footprint') }}</span>
				<strong class="wdw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="wdw__filters-strip">
			<div
				class="wdw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by workbook artifact family')">
				<button
					type="button"
					class="wdw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Workbooks ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="wdw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="wdw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by workbook audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="wdw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="wdw__empty-banner"
			role="note">
			<div class="wdw__empty-text">
				<p class="wdw__empty-title">
					{{ t('duplicatefinder', 'No spreadsheet, macro workbook, BI report, or ledger duplicate clusters match the active filters') }}
				</p>
				<p class="wdw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="wdw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="wdw__workstation">
			<div class="wdw__list-pane">
				<div class="wdw__pane-header">
					<span class="wdw__pane-title">
						{{ t('duplicatefinder', 'Workbook & BI Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="wdw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="wdw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="wdw__cluster-top">
							<span class="wdw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="wdw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="wdw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span v-if="cluster.fiscalSummary !== 'unscheduled'">{{ cluster.fiscalSummary }}</span>
							<span v-if="cluster.versionSummary !== 'unversioned'">{{ cluster.versionSummary }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="wdw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="wdw__load-more-wrap">
					<button
						type="button"
						class="wdw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="wdw__inspector-pane">
				<header class="wdw__inspector-header">
					<div class="wdw__inspector-title-wrap">
						<h4 class="wdw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="wdw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.lineageStem }}
						</span>
					</div>

					<div class="wdw__inspector-actions">
						<button
							type="button"
							class="wdw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="wdw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasFinanceVaultCopy || selectedCluster.hasMacroCopy"
					class="wdw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Finance Vault & Macro/VBA Protection Active:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside Finance/Audit/Treasury/Board vaults or macro-enabled workbooks (.xlsm/.xlsb) are shielded against accidental deletion unless overridden or switched to Hardlink Mirrors.') }}
				</div>

				<div
					v-if="selectedCluster.hasDriftForkCopy"
					class="wdw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Version-Drift Forks Detected:') }}</strong>
					{{ t('duplicatefinder', 'This cluster contains "Copy of", "Copie de", working-draft, or FINAL_vN filename drift. Canonical survivor anchoring preserves the authoritative vault copy.') }}
				</div>

				<div class="wdw__meta-grid">
					<div class="wdw__meta-item">
						<span class="wdw__meta-label">{{ t('duplicatefinder', 'Fiscal Period & Lineage Stem') }}</span>
						<span>{{ selectedCluster.fiscalSummary }} / {{ selectedCluster.lineageStem }}</span>
					</div>
					<div class="wdw__meta-item">
						<span class="wdw__meta-label">{{ t('duplicatefinder', 'Version & Drift Signals') }}</span>
						<span>{{ selectedCluster.versionSummary }} ({{ selectedCluster.driftSummary }})</span>
					</div>
					<div class="wdw__meta-item">
						<span class="wdw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="wdw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="wdw__meta-item">
						<span class="wdw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="wdw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="wdw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="wdw__member-top">
							<span class="wdw__member-name">{{ member.basename }}</span>
							<div class="wdw__member-badges">
								<span
									class="wdw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="wdw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="wdw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="wdw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="wdw__companion-chips">
							<span class="wdw__companion-chip">{{ member.context.fiscalPeriod }}</span>
							<span class="wdw__companion-chip">{{ member.context.versionTag }}</span>
							<span
								v-if="member.context.isFinanceVault"
								class="wdw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Finance Vault') }}
							</span>
							<span
								v-if="member.context.isMacroEnabled"
								class="wdw__companion-chip is-warn">
								{{ t('duplicatefinder', 'VBA Macro') }}
							</span>
							<span
								v-if="member.context.isCopyFork || member.context.isWorkingDraft"
								class="wdw__companion-chip">
								{{ member.context.driftStatus }}
							</span>
							<span
								v-if="member.context.isBiPublishedHub"
								class="wdw__companion-chip">
								{{ t('duplicatefinder', 'BI Published Hub') }}
							</span>
						</div>

						<p class="wdw__member-note">
							{{ member.note }}
						</p>

						<div class="wdw__override-bar">
							<span class="wdw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="wdw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="wdw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="wdw__seg-btn"
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
			class="wdw__script-box">
			<summary class="wdw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="wdw__script-content">
				<div class="wdw__script-actions">
					<button
						type="button"
						class="wdw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="wdw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="wdw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="wdw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	WORKBOOK_FAMILY_META,
	WORKBOOK_PRESETS,
	analyzeWorkbookDriftDuplicates,
	buildWorkbookDriftCsvReport,
	buildWorkbookDriftJsonReport,
	buildWorkbookDriftScript,
	buildWorkbookSyncExcludeSnippet,
} from '../tools/workbookDriftAuditor'

export default {
	name: 'WorkbookDriftWorkbench',
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
			presetId: 'all-finance-bi-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-vault',
			survivorRule: 'finance-vault-first',
			protectFinanceVaults: true,
			protectMacroWorkbooks: true,
			protectBiModels: true,
			staleDraftDaysInput: '30',
			minSizeKbInput: '0',
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
			return WORKBOOK_PRESETS
		},
		familyOptions() {
			return Object.values(WORKBOOK_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'finance-guarded', label: this.t('duplicatefinder', 'Finance Vault Guard') },
				{ id: 'macro-guarded', label: this.t('duplicatefinder', 'Macro/VBA Guard') },
				{ id: 'drift-forks', label: this.t('duplicatefinder', 'Version-Drift Forks') },
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
		parsedStaleDraftDays() {
			const trimmed = String(this.staleDraftDaysInput ?? '').trim()
			if (!trimmed) {
				return 30
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30
		},
		parsedMinSizeKb() {
			const trimmed = String(this.minSizeKbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeWorkbookDriftDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectFinanceVaults: this.protectFinanceVaults,
				protectMacroWorkbooks: this.protectMacroWorkbooks,
				protectBiModels: this.protectBiModels,
				staleDraftDays: this.parsedStaleDraftDays,
				minSizeKb: this.parsedMinSizeKb,
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
			return buildWorkbookDriftScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildWorkbookSyncExcludeSnippet(this.analysis)
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
			const preset = WORKBOOK_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectFinanceVaults = preset.protectFinanceVaults
			this.protectMacroWorkbooks = preset.protectMacroWorkbooks
			this.protectBiModels = preset.protectBiModels
			this.staleDraftDaysInput = String(preset.staleDraftDays)
			this.minSizeKbInput = String(preset.minSizeKb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeKbInput = '0'
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
				'finance-guarded': this.t('duplicatefinder', 'Finance Guarded'),
				'macro-guarded': this.t('duplicatefinder', 'Macro/VBA Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-finance-vault' || verdict === 'blocked-macro-workbook') {
				return 'is-danger'
			}
			if (verdict === 'blocked-bi-master' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-workbook-mirror') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 45) {
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
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 workbook and BI drift consolidation script to clipboard.'))
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
			const csv = buildWorkbookDriftCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-workbook-drift-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe workbook drift CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildWorkbookDriftJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-workbook-drift-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported workbook drift JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.workbook-drift-workbench {
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

.wdw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.wdw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.wdw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.wdw__status-badge {
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

.wdw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.wdw__tool-btn,
.wdw__seg-btn,
.wdw__chip,
.wdw__primary-btn {
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

.wdw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.wdw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.wdw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.wdw__seg-btn.is-active,
.wdw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.wdw__tool-btn:focus-visible,
.wdw__seg-btn:focus-visible,
.wdw__chip:focus-visible,
.wdw__primary-btn:focus-visible,
.wdw__cluster-item:focus-visible,
.wdw__input:focus-visible,
.wdw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.wdw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.wdw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.wdw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.wdw__empty-banner {
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

.wdw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.wdw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.wdw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.wdw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.wdw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.wdw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.wdw__segments,
.wdw__chip-group,
.wdw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wdw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.wdw__inputs-row {
	align-items: flex-end;
}

.wdw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.wdw__field-grow {
	flex: 1 1 200px;
}

.wdw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.wdw__input {
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

.wdw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.wdw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.wdw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.wdw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.wdw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.wdw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.wdw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.wdw__kpi-val.is-accent {
	color: #0b4a8b;
}

.wdw__kpi-val.is-warn {
	color: #7c4a03;
}

.wdw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.wdw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.wdw__list-pane,
.wdw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.wdw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wdw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.wdw__cluster-list,
.wdw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wdw__cluster-item {
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

.wdw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.wdw__cluster-top,
.wdw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wdw__cluster-name,
.wdw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.wdw__cluster-path,
.wdw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.wdw__cluster-meta,
.wdw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.wdw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.wdw__pill.is-risk-macro-guarded,
.wdw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.wdw__pill.is-risk-finance-guarded,
.wdw__pill.is-risk-shielded,
.wdw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.wdw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.wdw__pill.is-risk-reclaimable,
.wdw__pill.is-reclaim,
.wdw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.wdw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wdw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.wdw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.wdw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.wdw__inspector-actions,
.wdw__override-bar,
.wdw__member-badges,
.wdw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.wdw__companion-chip {
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

.wdw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.wdw__warn-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.wdw__info-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.wdw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.wdw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.wdw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.wdw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.wdw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.wdw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.wdw__member-card.is-verdict-keep-canonical-survivor,
.wdw__member-card.is-verdict-reclaim-drift-copy,
.wdw__member-card.is-verdict-reclaim-stale-export {
	border-inline-start: 4px solid #0f5132;
}

.wdw__member-card.is-verdict-hardlink-workbook-mirror {
	border-inline-start: 4px solid #0b4a8b;
}

.wdw__member-card.is-verdict-blocked-finance-vault,
.wdw__member-card.is-verdict-blocked-macro-workbook {
	border-inline-start: 4px solid #842029;
}

.wdw__member-card.is-verdict-blocked-bi-master,
.wdw__member-card.is-verdict-blocked-manual-shield,
.wdw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.wdw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.wdw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.wdw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.wdw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.wdw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.wdw__code-pre {
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

.wdw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
