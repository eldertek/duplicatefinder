<template>
	<section
		class="mailbox-archive-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Email Archive, Mailbox Dump and Extracted Attachment Redundancy Auditor')">
		<header class="maw__toolbar">
			<div class="maw__title-group">
				<h3 class="maw__title">
					{{ t('duplicatefinder', 'Email Archive, Mailbox Dump & Extracted Attachment Redundancy Auditor') }}
				</h3>
				<span
					class="maw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {legal} legal-hold', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						legal: analysis.summary.totalLegalHoldClusters,
					}) }}
				</span>
			</div>

			<div class="maw__toolbar-actions">
				<button
					type="button"
					class="maw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="maw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="maw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="maw__tool-btn is-close"
					aria-keyshortcuts="<"
					:title="t('duplicatefinder', 'Hide email archive, mailbox dump and extracted attachment redundancy auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Mail Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="maw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="maw__empty-banner"
			role="note">
			<div class="maw__empty-text">
				<p class="maw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Legal Hold and Active .ost/.pst guards before scanning') }}
				</p>
				<p class="maw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicated mailbox containers (.pst/.ost/.mbox/.olm/.nsf), individual messages (.eml/.emlx/.msg), calendar/contact files (.ics/.vcf), and extracted email attachments while strictly guarding Legal Hold/eDiscovery vaults.') }}
				</p>
			</div>
			<button
				type="button"
				class="maw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="maw__controls">
			<div class="maw__control-row">
				<span class="maw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="maw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mailbox archive audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="maw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="maw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="maw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="maw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="maw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="maw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="maw__seg-btn"
					:class="{ 'is-active': protectLegalHoldVaults }"
					:aria-pressed="protectLegalHoldVaults ? 'true' : 'false'"
					@click="protectLegalHoldVaults = !protectLegalHoldVaults">
					<span>{{ protectLegalHoldVaults ? t('duplicatefinder', 'Legal Hold / eDiscovery Guard: ON') : t('duplicatefinder', 'Legal Hold / eDiscovery Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="maw__seg-btn"
					:class="{ 'is-active': protectActiveMailStores }"
					:aria-pressed="protectActiveMailStores ? 'true' : 'false'"
					@click="protectActiveMailStores = !protectActiveMailStores">
					<span>{{ protectActiveMailStores ? t('duplicatefinder', 'Active .ost/.pst Store Guard: ON') : t('duplicatefinder', 'Active .ost/.pst Store Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="maw__seg-btn"
					:class="{ 'is-active': protectSharedMailboxArchives }"
					:aria-pressed="protectSharedMailboxArchives ? 'true' : 'false'"
					@click="protectSharedMailboxArchives = !protectSharedMailboxArchives">
					<span>{{ protectSharedMailboxArchives ? t('duplicatefinder', 'Shared Mailbox Guard: ON') : t('duplicatefinder', 'Shared Mailbox Guard: OFF') }}</span>
				</button>
			</div>

			<div class="maw__control-row maw__inputs-row">
				<label class="maw__field">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="maw__input">
						<option value="consolidate-archive-vault">{{ t('duplicatefinder', 'Consolidate to Archive Vault') }}</option>
						<option value="hardlink-attachments-to-project">{{ t('duplicatefinder', 'Hardlink Attachments to Project (POSIX ln -f)') }}</option>
						<option value="prune-stale-mbox-exports">{{ t('duplicatefinder', 'Prune Stale MBOX / Takeout Exports') }}</option>
					</select>
				</label>

				<label class="maw__field">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="maw__input">
						<option value="vault-authority-first">{{ t('duplicatefinder', 'Legal Hold / Shared Vault first') }}</option>
						<option value="project-path-first">{{ t('duplicatefinder', 'Canonical Project path first') }}</option>
						<option value="newest-archive">{{ t('duplicatefinder', 'Newest archive copy') }}</option>
						<option value="oldest-canonical">{{ t('duplicatefinder', 'Oldest canonical copy') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="maw__field">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Stale Export (d)') }}</span>
					<input
						v-model="staleExportDaysInput"
						type="number"
						min="0"
						step="1"
						class="maw__input maw__num-input">
				</label>

				<label class="maw__field">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="maw__input maw__num-input">
				</label>

				<label class="maw__field maw__field-grow">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Filter Mailbox, Attachment or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="maw__input"
						:placeholder="t('duplicatefinder', 'e.g. .pst, .mbox, .eml, .ics, Takeout, Mail Downloads, legal-hold')">
				</label>

				<label class="maw__field maw__field-grow">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="maw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="maw__field">
					<span class="maw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="maw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Compliance & mailstore risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Archive name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="maw__kpis">
			<div class="maw__kpi">
				<span class="maw__kpi-label">{{ t('duplicatefinder', 'Safe Mail & Attachment Reclaim') }}</span>
				<strong class="maw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="maw__kpi">
				<span class="maw__kpi-label">{{ t('duplicatefinder', 'Legal Hold & Active Stores') }}</span>
				<strong class="maw__kpi-val is-warn">
					{{ analysis.summary.totalLegalHoldClusters }} {{ t('duplicatefinder', 'legal-hold') }} / {{ analysis.summary.totalActiveMailStoreClusters }} {{ t('duplicatefinder', 'active .ost/.pst') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="maw__kpi">
				<span class="maw__kpi-label">{{ t('duplicatefinder', 'Extracted Attachment Redundancy') }}</span>
				<strong class="maw__kpi-val">
					{{ analysis.summary.totalExtractedAttachmentsCount }} {{ t('duplicatefinder', 'attachment copies') }}
				</strong>
			</div>
			<div class="maw__kpi">
				<span class="maw__kpi-label">{{ t('duplicatefinder', 'Raw Mailbox Footprint') }}</span>
				<strong class="maw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="maw__filters-strip">
			<div
				class="maw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by email archive artifact family')">
				<button
					type="button"
					class="maw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Mail Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="maw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="maw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by mailbox audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="maw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="maw__empty-banner"
			role="note">
			<div class="maw__empty-text">
				<p class="maw__empty-title">
					{{ t('duplicatefinder', 'No mailbox container, message, calendar, or extracted attachment clusters match the active filters') }}
				</p>
				<p class="maw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="maw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="maw__workstation">
			<div class="maw__list-pane">
				<div class="maw__pane-header">
					<span class="maw__pane-title">
						{{ t('duplicatefinder', 'Mailbox & Attachment Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="maw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="maw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="maw__cluster-top">
							<span class="maw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="maw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="maw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.tierLabel }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="maw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="maw__load-more-wrap">
					<button
						type="button"
						class="maw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="maw__inspector-pane">
				<header class="maw__inspector-header">
					<div class="maw__inspector-title-wrap">
						<h4 class="maw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="maw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.normalizedStem }}
						</span>
					</div>

					<div class="maw__inspector-actions">
						<button
							type="button"
							class="maw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="maw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasLegalHoldVault || selectedCluster.hasActiveMailStore"
					class="maw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Legal Hold & Active Store Protection Active:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside Legal Hold / eDiscovery / Compliance vaults or unconsolidated .ost/.pst stores are strictly shielded from automated deletion unless explicitly overridden by an operator.') }}
				</div>

				<div
					v-if="selectedCluster.hasExtractedAttachment || selectedCluster.hasTakeoutExport"
					class="maw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Extracted Attachment or Takeout Redundancy:') }}</strong>
					{{ t('duplicatefinder', 'Identical copies found inside Mail Downloads, Attachments, Takeout/Mail, or Re:/Fwd: subject chains. Switch strategy to Hardlink Attachments to Project to preserve paths at zero disk cost.') }}
				</div>

				<div class="maw__meta-grid">
					<div class="maw__meta-item">
						<span class="maw__meta-label">{{ t('duplicatefinder', 'Normalized Attachment Stem') }}</span>
						<span>{{ selectedCluster.normalizedStem }}</span>
					</div>
					<div class="maw__meta-item">
						<span class="maw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="maw__meta-item">
						<span class="maw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="maw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="maw__meta-item">
						<span class="maw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="maw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="maw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="maw__member-top">
							<span class="maw__member-name">{{ member.basename }}</span>
							<div class="maw__member-badges">
								<span
									class="maw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="maw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="maw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="maw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="maw__companion-chips">
							<span class="maw__companion-chip">{{ member.context.normalizedStem }}</span>
							<span
								v-if="member.context.isLegalHoldVault"
								class="maw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Legal Hold / eDiscovery') }}
							</span>
							<span
								v-if="member.context.isActiveMailStore"
								class="maw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Active .ost/.pst Store') }}
							</span>
							<span
								v-if="member.context.isSharedMailboxArchive"
								class="maw__companion-chip">
								{{ t('duplicatefinder', 'Shared Mailbox Vault') }}
							</span>
							<span
								v-if="member.context.isTakeoutExportDump"
								class="maw__companion-chip">
								{{ t('duplicatefinder', 'Takeout / Export Dump') }}
							</span>
							<span
								v-if="member.context.isExtractedAttachmentLocation"
								class="maw__companion-chip">
								{{ t('duplicatefinder', 'Extracted Attachment Folder') }}
							</span>
							<span
								v-if="member.context.hasMailForwardPrefix"
								class="maw__companion-chip">
								{{ t('duplicatefinder', 'Re:/Fwd: Prefix Copy') }}
							</span>
						</div>

						<p class="maw__member-note">
							{{ member.note }}
						</p>

						<div class="maw__override-bar">
							<span class="maw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="maw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="maw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="maw__seg-btn"
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
			class="maw__script-box">
			<summary class="maw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="maw__script-content">
				<div class="maw__script-actions">
					<button
						type="button"
						class="maw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="maw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="maw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="maw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	MAILBOX_FAMILY_META,
	MAILBOX_PRESETS,
	analyzeMailboxArchiveDuplicates,
	buildMailboxArchiveCsvReport,
	buildMailboxArchiveJsonReport,
	buildMailboxArchiveScript,
	buildMailboxSyncExcludeSnippet,
} from '../tools/mailboxArchiveAuditor'

export default {
	name: 'MailboxArchiveWorkbench',
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
			presetId: 'all-mail-compliance-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-archive-vault',
			survivorRule: 'vault-authority-first',
			protectLegalHoldVaults: true,
			protectActiveMailStores: true,
			protectSharedMailboxArchives: true,
			staleExportDaysInput: '30',
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
			return MAILBOX_PRESETS
		},
		familyOptions() {
			return Object.values(MAILBOX_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'legal-hold', label: this.t('duplicatefinder', 'Legal Hold / eDiscovery') },
				{ id: 'active-mailstores', label: this.t('duplicatefinder', 'Active .ost/.pst Stores') },
				{ id: 'takeout-exports', label: this.t('duplicatefinder', 'Takeout & Extracted Attachments') },
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
		parsedStaleExportDays() {
			const trimmed = String(this.staleExportDaysInput ?? '').trim()
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
			return analyzeMailboxArchiveDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLegalHoldVaults: this.protectLegalHoldVaults,
				protectActiveMailStores: this.protectActiveMailStores,
				protectSharedMailboxArchives: this.protectSharedMailboxArchives,
				staleExportDays: this.parsedStaleExportDays,
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
			return buildMailboxArchiveScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildMailboxSyncExcludeSnippet(this.analysis)
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
			const preset = MAILBOX_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLegalHoldVaults = preset.protectLegalHoldVaults
			this.protectActiveMailStores = preset.protectActiveMailStores
			this.protectSharedMailboxArchives = preset.protectSharedMailboxArchives
			this.staleExportDaysInput = String(preset.staleExportDays)
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
				'legal-hold': this.t('duplicatefinder', 'Legal Hold Guarded'),
				'active-mailstore': this.t('duplicatefinder', 'Active Store Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-legal-hold-vault' || verdict === 'blocked-active-mailstore') {
				return 'is-danger'
			}
			if (verdict === 'blocked-shared-mailbox' || verdict === 'blocked-not-stale-export' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-attachment-to-project') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 50) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 mailbox archive and attachment consolidation script to clipboard.'))
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
			const csv = buildMailboxArchiveCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-mailbox-archive-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe mailbox archive CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMailboxArchiveJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-mailbox-archive-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported mailbox archive JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.mailbox-archive-workbench {
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

.maw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.maw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.maw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.maw__status-badge {
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

.maw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.maw__tool-btn,
.maw__seg-btn,
.maw__chip,
.maw__primary-btn {
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

.maw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.maw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.maw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.maw__seg-btn.is-active,
.maw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.maw__tool-btn:focus-visible,
.maw__seg-btn:focus-visible,
.maw__chip:focus-visible,
.maw__primary-btn:focus-visible,
.maw__cluster-item:focus-visible,
.maw__input:focus-visible,
.maw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.maw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.maw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.maw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.maw__empty-banner {
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

.maw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.maw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.maw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.maw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.maw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.maw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.maw__segments,
.maw__chip-group,
.maw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.maw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.maw__inputs-row {
	align-items: flex-end;
}

.maw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.maw__field-grow {
	flex: 1 1 200px;
}

.maw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.maw__input {
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

.maw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.maw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.maw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.maw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.maw__kpi {
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

.maw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.maw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.maw__kpi-val.is-accent {
	color: #0b4a8b;
}

.maw__kpi-val.is-warn {
	color: #7c4a03;
}

.maw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.maw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.maw__list-pane,
.maw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.maw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.maw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.maw__cluster-list,
.maw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.maw__cluster-item {
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

.maw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.maw__cluster-top,
.maw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.maw__cluster-name,
.maw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.maw__cluster-path,
.maw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.maw__cluster-meta,
.maw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.maw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.maw__pill.is-risk-legal-hold,
.maw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.maw__pill.is-risk-active-mailstore,
.maw__pill.is-risk-shielded,
.maw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.maw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.maw__pill.is-risk-reclaimable,
.maw__pill.is-reclaim,
.maw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.maw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.maw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.maw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.maw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.maw__inspector-actions,
.maw__override-bar,
.maw__member-badges,
.maw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.maw__companion-chip {
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

.maw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.maw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.maw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.maw__meta-grid {
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
	.maw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.maw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.maw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.maw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.maw__member-card {
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

.maw__member-card.is-verdict-keep-canonical-survivor,
.maw__member-card.is-verdict-reclaim-mailbox-copy,
.maw__member-card.is-verdict-reclaim-stale-export {
	border-inline-start: 4px solid #0f5132;
}

.maw__member-card.is-verdict-hardlink-attachment-to-project {
	border-inline-start: 4px solid #0b4a8b;
}

.maw__member-card.is-verdict-blocked-legal-hold-vault,
.maw__member-card.is-verdict-blocked-active-mailstore {
	border-inline-start: 4px solid #842029;
}

.maw__member-card.is-verdict-blocked-shared-mailbox,
.maw__member-card.is-verdict-blocked-not-stale-export,
.maw__member-card.is-verdict-blocked-manual-shield,
.maw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.maw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.maw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.maw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.maw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.maw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.maw__code-pre {
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

.maw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
