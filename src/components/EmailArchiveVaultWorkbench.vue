<template>
	<section
		class="email-archive-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Email Archive, Mailbox Export and Attachment Vault Auditor')">
		<header class="eav__toolbar">
			<div class="eav__title-group">
				<h3 class="eav__title">
					{{ t('duplicatefinder', 'Email Archive, Mailbox Export & Attachment Vault Auditor') }}
				</h3>
				<span
					class="eav__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {holds} legal-hold & primary anchors', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						holds: analysis.summary.totalLegalHoldClusters + analysis.summary.totalPrimaryArchiveAnchors,
					}) }}
				</span>
			</div>

			<div class="eav__toolbar-actions">
				<button
					type="button"
					class="eav__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="eav__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="eav__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="eav__tool-btn is-close"
					aria-keyshortcuts="Shift+H"
					:title="t('duplicatefinder', 'Hide Email Archive, Mailbox Export and Attachment Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Email Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="eav__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="eav__kpis">
			<div class="eav__kpi">
				<span class="eav__kpi-label">{{ t('duplicatefinder', 'Safe Mailbox Reclaim') }}</span>
				<strong class="eav__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="eav__kpi">
				<span class="eav__kpi-label">{{ t('duplicatefinder', 'Legal-Hold & Primary Anchors') }}</span>
				<strong class="eav__kpi-val is-warn">
					{{ analysis.summary.totalLegalHoldClusters }} {{ t('duplicatefinder', 'legal-hold') }} / {{ analysis.summary.totalPrimaryArchiveAnchors }} {{ t('duplicatefinder', 'primary') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="eav__kpi">
				<span class="eav__kpi-label">{{ t('duplicatefinder', 'Accounts / Snapshots / Attachments') }}</span>
				<strong class="eav__kpi-val">
					{{ analysis.summary.distinctAccountsCount }} {{ t('duplicatefinder', 'accounts') }} / {{ analysis.summary.totalSnapshotClusters }} {{ t('duplicatefinder', 'snapshots') }} / {{ analysis.summary.totalAttachmentClusters }} {{ t('duplicatefinder', 'attachments') }}
				</strong>
			</div>
			<div class="eav__kpi">
				<span class="eav__kpi-label">{{ t('duplicatefinder', 'Raw Archive Footprint') }}</span>
				<strong class="eav__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="eav__empty-banner"
			role="note">
			<div class="eav__empty-text">
				<p class="eav__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure legal-hold and primary mailbox guards before scanning') }}
				</p>
				<p class="eav__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate mailbox archives (.mbox/.pst/.ost), individual messages (.eml/.msg/.emlx), IMAP/Thunderbird/Apple Mail snapshots (.msf/.wdseml/.sbd), and mirrored email attachment dumps grouped by account, period, and subject.') }}
				</p>
			</div>
			<button
				type="button"
				class="eav__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="eav__controls">
			<div class="eav__control-row">
				<span class="eav__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="eav__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Email archive and attachment audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="eav__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="eav__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="eav__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="eav__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="eav__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="eav__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="eav__seg-btn"
					:class="{ 'is-active': protectLegalHold }"
					:aria-pressed="protectLegalHold ? 'true' : 'false'"
					@click="protectLegalHold = !protectLegalHold">
					<span>{{ protectLegalHold ? t('duplicatefinder', 'Protect Legal Hold: ON') : t('duplicatefinder', 'Protect Legal Hold: OFF') }}</span>
				</button>

				<button
					type="button"
					class="eav__seg-btn"
					:class="{ 'is-active': protectLatestPrimaryArchive }"
					:aria-pressed="protectLatestPrimaryArchive ? 'true' : 'false'"
					@click="protectLatestPrimaryArchive = !protectLatestPrimaryArchive">
					<span>{{ protectLatestPrimaryArchive ? t('duplicatefinder', 'Protect Latest Primary Archive: ON') : t('duplicatefinder', 'Protect Latest Primary Archive: OFF') }}</span>
				</button>
			</div>

			<div class="eav__control-row eav__inputs-row">
				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="eav__input">
						<option value="prune-stale-exports-and-mirror-attachments">{{ t('duplicatefinder', 'Prune Stale Exports & Mirror Attachments') }}</option>
						<option value="consolidate-mailbox-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Mailbox Vault') }}</option>
						<option value="prune-mail-client-indexes-and-attachment-dumps">{{ t('duplicatefinder', 'Prune Mail Indexes & Attachment Dumps') }}</option>
					</select>
				</label>

				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="eav__input">
						<option value="legal-hold-and-primary-vault-first">{{ t('duplicatefinder', 'Legal Hold & Primary Vault first') }}</option>
						<option value="latest-period-first">{{ t('duplicatefinder', 'Latest Period first') }}</option>
						<option value="archive-container-first">{{ t('duplicatefinder', 'Archive Container (.mbox/.pst) first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Keep Archive Periods') }}</span>
					<input
						v-model="keepPreviousPeriodsInput"
						type="number"
						min="0"
						step="1"
						class="eav__input eav__num-input">
				</label>

				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Stale Snapshot (d)') }}</span>
					<input
						v-model="staleSnapshotDaysInput"
						type="number"
						min="0"
						step="1"
						class="eav__input eav__num-input">
				</label>

				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="eav__input eav__num-input">
				</label>

				<label class="eav__field eav__field-grow">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Filter Account, Period, Subject or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="eav__input"
						:placeholder="t('duplicatefinder', 'e.g. legal@acme.eu, 2025, .mbox, .pst, .msf, attachments')">
				</label>

				<label class="eav__field eav__field-grow">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="eav__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="eav__field">
					<span class="eav__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="eav__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Legal-hold & vault risk') }}</option>
						<option value="period_desc">{{ t('duplicatefinder', 'Newest period') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Archive name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="eav__control-row">
				<span class="eav__control-label">{{ t('duplicatefinder', 'Archive Family') }}</span>
				<div
					class="eav__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Email archive family filter')">
					<button
						type="button"
						class="eav__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="eav__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="eav__control-row">
				<span class="eav__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="eav__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Email archive verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="eav__seg-btn"
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
			class="eav__empty-filter"
			role="note">
			<p class="eav__empty-title">
				{{ t('duplicatefinder', 'No email archive, message, snapshot or attachment duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="eav__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="eav__workspace">
			<div
				class="eav__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited email archive clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="eav__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="eav__cluster-top">
						<strong class="eav__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="eav__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="eav__cluster-meta">
						<span class="eav__tag">{{ cluster.account }}</span>
						<span class="eav__tag">{{ cluster.periodLabel }}</span>
						<span class="eav__tag">{{ cluster.client }}</span>
						<span class="eav__tag">{{ cluster.formatBadge }}</span>
					</div>
					<div class="eav__cluster-badges">
						<span
							v-if="cluster.isLegalHold"
							class="eav__badge is-danger">
							{{ t('duplicatefinder', 'Legal Hold') }}
						</span>
						<span
							v-if="cluster.isLatestPrimaryArchive"
							class="eav__badge is-keep">
							{{ t('duplicatefinder', 'Latest Primary Anchor') }}
						</span>
						<span
							v-if="cluster.family === 'mail-client-backup-snapshots'"
							class="eav__badge is-warn">
							{{ t('duplicatefinder', 'Mail Snapshot') }}
						</span>
						<span
							v-if="cluster.family === 'mirrored-email-attachments'"
							class="eav__badge is-consolidate">
							{{ t('duplicatefinder', 'Attachment Dump') }}
						</span>
					</div>
					<div class="eav__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="eav__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="eav__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="eav__inspector">
				<header class="eav__inspector-head">
					<div class="eav__inspector-title-wrap">
						<h4 class="eav__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="eav__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.client }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="eav__inspector-actions">
						<button
							type="button"
							class="eav__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="eav__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="eav__lineage-grid">
					<div class="eav__lineage-item">
						<span class="eav__lineage-label">{{ t('duplicatefinder', 'Account & Period') }}</span>
						<strong class="eav__lineage-val">{{ selectedCluster.account }} ({{ selectedCluster.periodLabel }})</strong>
					</div>
					<div class="eav__lineage-item">
						<span class="eav__lineage-label">{{ t('duplicatefinder', 'Subject / Attachment Signature') }}</span>
						<strong class="eav__lineage-val">{{ selectedCluster.subjectSignature }}</strong>
					</div>
					<div class="eav__lineage-item">
						<span class="eav__lineage-label">{{ t('duplicatefinder', 'Compliance & Retention') }}</span>
						<strong class="eav__lineage-val">
							{{ selectedCluster.isLegalHold ? t('duplicatefinder', 'Legal Hold Active') : t('duplicatefinder', 'Standard Retention') }}
							|
							{{ selectedCluster.isLatestPrimaryArchive ? t('duplicatefinder', 'Primary Archive Anchor') : selectedCluster.formatBadge }}
						</strong>
					</div>
					<div class="eav__lineage-item">
						<span class="eav__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="eav__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="eav__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="eav__member-card">
						<div class="eav__member-top">
							<code class="eav__member-path">{{ member.path }}</code>
							<div class="eav__member-pills">
								<span
									class="eav__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="eav__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="eav__member-bottom">
							<div class="eav__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="eav__override-field">
								<span class="eav__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="eav__override-select"
									:value="getMemberOverride(member.selectionKey)"
									@change="setMemberOverride(member.selectionKey, $event.target.value)">
									<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
									<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
									<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
								</select>
							</label>
						</div>
					</div>
				</div>

				<div class="eav__code-panels">
					<div class="eav__code-box">
						<div class="eav__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="eav__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="eav__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="eav__code-box">
						<div class="eav__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="eav__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="eav__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	EMAIL_ARCHIVE_PRESETS,
	analyzeEmailArchiveVault,
	buildEmailArchiveCsvReport,
	buildEmailArchiveJsonReport,
	buildEmailArchiveRemediationScript,
	buildEmailArchiveSyncExcludeSnippet,
} from '../tools/emailArchiveVaultAuditor'

export default {
	name: 'EmailArchiveVaultWorkbench',
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
			presetId: 'all-email-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-stale-exports-and-mirror-attachments',
			survivorRule: 'legal-hold-and-primary-vault-first',
			protectLegalHold: true,
			protectLatestPrimaryArchive: true,
			keepPreviousPeriodsInput: '1',
			staleSnapshotDaysInput: '30',
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
			return EMAIL_ARCHIVE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'legal-hold', label: this.t('duplicatefinder', 'Legal Hold') },
				{ id: 'primary-anchor', label: this.t('duplicatefinder', 'Primary Anchor') },
				{ id: 'snapshot-index', label: this.t('duplicatefinder', 'Mail Snapshots') },
				{ id: 'attachment-dump', label: this.t('duplicatefinder', 'Attachment Dumps') },
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
		parsedKeepPreviousPeriods() {
			const trimmed = String(this.keepPreviousPeriodsInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
		},
		parsedStaleSnapshotDays() {
			const trimmed = String(this.staleSnapshotDaysInput ?? '').trim()
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
			return analyzeEmailArchiveVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLegalHold: this.protectLegalHold,
				protectLatestPrimaryArchive: this.protectLatestPrimaryArchive,
				keepPreviousArchivePeriods: this.parsedKeepPreviousPeriods,
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
			return buildEmailArchiveRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildEmailArchiveSyncExcludeSnippet(this.analysis)
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
			const preset = EMAIL_ARCHIVE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLegalHold = preset.protectLegalHold
			this.protectLatestPrimaryArchive = preset.protectLatestPrimaryArchive
			this.keepPreviousPeriodsInput = String(preset.keepPreviousArchivePeriods)
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
			if (this.selectedCluster && !this.selectedClusterKey) {
				this.selectedClusterKey = this.selectedCluster.groupKey
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'snapshot-reclaimable': this.t('duplicatefinder', 'Stale Snapshot'),
				'attachment-reclaimable': this.t('duplicatefinder', 'Attachment Dump'),
				'legal-hold-protected': this.t('duplicatefinder', 'Legal Hold Protected'),
				'primary-archive-protected': this.t('duplicatefinder', 'Primary Archive Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'legal-hold-protected' || riskState === 'primary-archive-protected') {
				return 'is-danger'
			}
			if (riskState === 'shielded') {
				return 'is-warn'
			}
			if (riskState === 'consolidatable') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-legal-hold' || verdict === 'blocked-latest-primary-archive') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-mirror') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 80) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Email Archive Vault remediation script to clipboard.'))
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
			const csv = buildEmailArchiveCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-email-archive-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Email Archive Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildEmailArchiveJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-email-archive-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Email Archive Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.email-archive-vault-workbench {
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

.eav__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.eav__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.eav__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.eav__status-badge {
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

.eav__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.eav__tool-btn,
.eav__seg-btn,
.eav__primary-btn,
.eav__load-more-btn,
.eav__mini-btn {
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

.eav__tool-btn:hover:not(:disabled),
.eav__seg-btn:hover:not(:disabled),
.eav__load-more-btn:hover:not(:disabled),
.eav__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.eav__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.eav__tool-btn.is-primary-outline,
.eav__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.eav__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.eav__tool-btn:focus-visible,
.eav__seg-btn:focus-visible,
.eav__primary-btn:focus-visible,
.eav__load-more-btn:focus-visible,
.eav__mini-btn:focus-visible,
.eav__cluster-card:focus-visible,
.eav__input:focus-visible,
.eav__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.eav__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.eav__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.eav__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.eav__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.eav__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.eav__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.eav__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.eav__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.eav__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.eav__empty-banner,
.eav__empty-filter {
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

.eav__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.eav__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.eav__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.eav__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.eav__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.eav__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.eav__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.eav__inputs-row {
	align-items: flex-end;
}

.eav__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.eav__field-grow {
	flex: 1 1 180px;
}

.eav__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.eav__input,
.eav__override-select {
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

.eav__num-input {
	inline-size: 96px;
}

.eav__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.eav__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.eav__cluster-card {
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

.eav__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.eav__cluster-top,
.eav__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.eav__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.eav__cluster-meta,
.eav__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.eav__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.eav__badge,
.eav__pill {
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

.eav__pill.is-keep,
.eav__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.eav__pill.is-danger,
.eav__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.eav__pill.is-consolidate,
.eav__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.eav__pill.is-warn,
.eav__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.eav__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.eav__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.eav__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.eav__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.eav__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.eav__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.eav__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.eav__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.eav__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.eav__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.eav__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.eav__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.eav__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.eav__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.eav__member-top,
.eav__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.eav__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.eav__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.eav__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.eav__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.eav__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.eav__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.eav__pre {
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

.eav__sr-only {
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
	.eav__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.eav__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.eav__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.email-archive-vault-workbench {
		padding: 10px;
	}

	.eav__kpis,
	.eav__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.eav__num-input {
		inline-size: 100%;
	}

	.eav__field {
		flex: 1 1 100%;
	}
}
</style>
