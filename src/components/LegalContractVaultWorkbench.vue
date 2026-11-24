<template>
	<section
		class="legal-contract-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Legal, Compliance and Signed Contract Vault Auditor')">
		<header class="lcv__toolbar">
			<div class="lcv__title-group">
				<h3 class="lcv__title">
					{{ t('duplicatefinder', 'Legal, Compliance & Signed Contract Vault Auditor') }}
				</h3>
				<span
					class="lcv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {countersigned} countersigned & {legalHold} legal-hold/PAdES guards', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						countersigned: analysis.summary.totalCountersignedClusters,
						legalHold: analysis.summary.totalLegalHoldPadesClusters,
					}) }}
				</span>
			</div>

			<div class="lcv__toolbar-actions">
				<button
					type="button"
					class="lcv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="lcv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="lcv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="lcv__tool-btn is-close"
					aria-keyshortcuts="F9"
					:title="t('duplicatefinder', 'Hide Legal, Compliance and Signed Contract Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Legal Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="lcv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="lcv__kpis">
			<div class="lcv__kpi">
				<span class="lcv__kpi-label">{{ t('duplicatefinder', 'Safe Legal Vault Reclaim') }}</span>
				<strong class="lcv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="lcv__kpi">
				<span class="lcv__kpi-label">{{ t('duplicatefinder', 'Countersigned & Legal-Hold/PAdES Guards') }}</span>
				<strong class="lcv__kpi-val is-warn">
					{{ analysis.summary.totalCountersignedClusters }} {{ t('duplicatefinder', 'signed') }} / {{ analysis.summary.totalLegalHoldPadesClusters }} {{ t('duplicatefinder', 'hold/PAdES') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="lcv__kpi">
				<span class="lcv__kpi-label">{{ t('duplicatefinder', 'Matters / Redlines / Exhibits') }}</span>
				<strong class="lcv__kpi-val">
					{{ analysis.summary.distinctMattersCount }} {{ t('duplicatefinder', 'matters') }} / {{ analysis.summary.totalRedlineDraftClusters }} {{ t('duplicatefinder', 'redlines') }} / {{ analysis.summary.totalScannedExhibitClusters }} {{ t('duplicatefinder', 'scans') }}
				</strong>
			</div>
			<div class="lcv__kpi">
				<span class="lcv__kpi-label">{{ t('duplicatefinder', 'Raw Contract Footprint') }}</span>
				<strong class="lcv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="lcv__empty-banner"
			role="note">
			<div class="lcv__empty-text">
				<p class="lcv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure countersigned, legal-hold, and PAdES guards before scanning') }}
				</p>
				<p class="lcv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit executed contracts (.pdf signed/countersigned/docusign/yousign, .p7s/.p7m PAdES/CAdES), redline & Word/ODT draft revisions (.docx/.odt, _v1/_redline/_trackchanges/_clean), compliance & evidence bundles (.zip/.tar audit packs, KYC/RIB/KBIS scans), and duplicate scanned attachments (scan_, IMG_, exhibit PDFs).') }}
				</p>
			</div>
			<button
				type="button"
				class="lcv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="lcv__controls">
			<div class="lcv__control-row">
				<span class="lcv__control-label">{{ t('duplicatefinder', 'Legal Preset') }}</span>
				<div
					class="lcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Legal, compliance and signed contract vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="lcv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="lcv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="lcv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="lcv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="lcv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="lcv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="lcv__seg-btn"
					:class="{ 'is-active': protectCountersignedOriginals }"
					:aria-pressed="protectCountersignedOriginals ? 'true' : 'false'"
					@click="protectCountersignedOriginals = !protectCountersignedOriginals">
					<span>{{ protectCountersignedOriginals ? t('duplicatefinder', 'Shield Countersigned Originals: ON') : t('duplicatefinder', 'Shield Countersigned Originals: OFF') }}</span>
				</button>

				<button
					type="button"
					class="lcv__seg-btn"
					:class="{ 'is-active': protectLegalHoldPades }"
					:aria-pressed="protectLegalHoldPades ? 'true' : 'false'"
					@click="protectLegalHoldPades = !protectLegalHoldPades">
					<span>{{ protectLegalHoldPades ? t('duplicatefinder', 'Shield Legal Hold & PAdES: ON') : t('duplicatefinder', 'Shield Legal Hold & PAdES: OFF') }}</span>
				</button>
			</div>

			<div class="lcv__control-row lcv__inputs-row">
				<label class="lcv__field">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="lcv__input">
						<option value="prune-drafts-and-duplicate-scans">{{ t('duplicatefinder', 'Prune Redlines & Duplicate Scans') }}</option>
						<option value="consolidate-contract-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Vault Copies') }}</option>
						<option value="prune-redlines-and-scans-only">{{ t('duplicatefinder', 'Prune Redlines & Scanned Exhibits Only') }}</option>
					</select>
				</label>

				<label class="lcv__field">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="lcv__input">
						<option value="countersigned-pades-first">{{ t('duplicatefinder', 'Countersigned / Legal-Hold / PAdES first') }}</option>
						<option value="latest-revision-first">{{ t('duplicatefinder', 'Latest Draft / Redline Revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="lcv__field">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Stale Draft (d)') }}</span>
					<input
						v-model="staleDraftDaysInput"
						type="number"
						min="0"
						step="1"
						class="lcv__input lcv__num-input">
				</label>

				<label class="lcv__field">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="lcv__input lcv__num-input">
				</label>

				<label class="lcv__field lcv__field-grow">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Filter Counterparty, Contract ID, State or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="lcv__input"
						:placeholder="t('duplicatefinder', 'e.g. MSA-2026, docusign, .p7s, redline, kbis, scan_')">
				</label>

				<label class="lcv__field lcv__field-grow">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="lcv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="lcv__field">
					<span class="lcv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="lcv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Legal hold & PAdES risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Document name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="lcv__control-row">
				<span class="lcv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="lcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Legal contract vault family filter')">
					<button
						type="button"
						class="lcv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="lcv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="lcv__control-row">
				<span class="lcv__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="lcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Legal contract vault verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="lcv__seg-btn"
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
			class="lcv__empty-filter"
			role="note">
			<p class="lcv__empty-title">
				{{ t('duplicatefinder', 'No signed contracts, redline drafts, compliance bundles or scanned exhibit duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="lcv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="lcv__workspace">
			<div
				class="lcv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited legal, compliance and signed contract clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="lcv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="lcv__cluster-top">
						<strong class="lcv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="lcv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="lcv__cluster-meta">
						<span class="lcv__tag">{{ cluster.counterpartyMatter }}</span>
						<span class="lcv__tag">{{ cluster.contractId }}</span>
						<span class="lcv__tag">{{ cluster.executionState }}</span>
					</div>
					<div class="lcv__cluster-badges">
						<span
							v-if="cluster.hasLegalHold"
							class="lcv__badge is-danger">
							{{ t('duplicatefinder', 'Legal Hold') }}
						</span>
						<span
							v-if="cluster.hasPadesSignature"
							class="lcv__badge is-keep">
							{{ t('duplicatefinder', 'PAdES/CAdES') }}
						</span>
						<span
							v-if="cluster.hasCountersignedOriginal"
							class="lcv__badge is-consolidate">
							{{ t('duplicatefinder', 'Countersigned') }}
						</span>
						<span
							v-if="cluster.family === 'redline-draft-revisions'"
							class="lcv__badge is-warn">
							{{ t('duplicatefinder', 'Redline Draft') }}
						</span>
						<span
							v-if="cluster.family === 'scanned-exhibit-attachments'"
							class="lcv__badge is-warn">
							{{ t('duplicatefinder', 'Scanned Exhibit') }}
						</span>
					</div>
					<div class="lcv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="lcv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="lcv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="lcv__inspector">
				<header class="lcv__inspector-head">
					<div class="lcv__inspector-title-wrap">
						<h4 class="lcv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="lcv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.legalTool }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="lcv__inspector-actions">
						<button
							type="button"
							class="lcv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="lcv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="lcv__lineage-grid">
					<div class="lcv__lineage-item">
						<span class="lcv__lineage-label">{{ t('duplicatefinder', 'Counterparty / Matter') }}</span>
						<strong class="lcv__lineage-val">{{ selectedCluster.counterpartyMatter }} ({{ selectedCluster.revisionLabel }})</strong>
					</div>
					<div class="lcv__lineage-item">
						<span class="lcv__lineage-label">{{ t('duplicatefinder', 'Contract ID & Execution State') }}</span>
						<strong class="lcv__lineage-val">{{ selectedCluster.contractId }} / {{ selectedCluster.executionState }}</strong>
					</div>
					<div class="lcv__lineage-item">
						<span class="lcv__lineage-label">{{ t('duplicatefinder', 'Legal Hold & Signature Protection') }}</span>
						<strong class="lcv__lineage-val">
							{{ selectedCluster.hasLegalHold ? t('duplicatefinder', 'Legal Hold Locked') : (selectedCluster.hasPadesSignature ? t('duplicatefinder', 'PAdES/CAdES Verified') : t('duplicatefinder', 'Standard Legal Artifact')) }}
							|
							{{ selectedCluster.hasCountersignedOriginal ? t('duplicatefinder', 'Countersigned Guard') : selectedCluster.formatBadge }}
						</strong>
					</div>
					<div class="lcv__lineage-item">
						<span class="lcv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="lcv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="lcv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="lcv__member-card">
						<div class="lcv__member-top">
							<code class="lcv__member-path">{{ member.path }}</code>
							<div class="lcv__member-pills">
								<span
									class="lcv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="lcv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="lcv__member-bottom">
							<div class="lcv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="lcv__override-field">
								<span class="lcv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="lcv__override-select"
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

				<div class="lcv__code-panels">
					<div class="lcv__code-box">
						<div class="lcv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="lcv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="lcv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="lcv__code-box">
						<div class="lcv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="lcv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="lcv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	LEGAL_CONTRACT_PRESETS,
	analyzeLegalContractVault,
	buildLegalContractCsvReport,
	buildLegalContractJsonReport,
	buildLegalContractRemediationScript,
	buildLegalContractSyncExcludeSnippet,
} from '../tools/legalContractVaultAuditor'

export default {
	name: 'LegalContractVaultWorkbench',
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
			presetId: 'all-legal-contract-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-drafts-and-duplicate-scans',
			survivorRule: 'countersigned-pades-first',
			protectCountersignedOriginals: true,
			protectLegalHoldPades: true,
			staleDraftDaysInput: '14',
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
			return LEGAL_CONTRACT_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'countersigned', label: this.t('duplicatefinder', 'Countersigned') },
				{ id: 'legal-hold-pades', label: this.t('duplicatefinder', 'Legal Hold / PAdES') },
				{ id: 'redline-draft', label: this.t('duplicatefinder', 'Redline Drafts') },
				{ id: 'compliance-bundle', label: this.t('duplicatefinder', 'Compliance Bundles') },
				{ id: 'scanned-exhibit', label: this.t('duplicatefinder', 'Scanned Exhibits') },
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
			return analyzeLegalContractVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCountersignedOriginals: this.protectCountersignedOriginals,
				protectLegalHoldPades: this.protectLegalHoldPades,
				staleDraftDays: this.parsedStaleDraftDays,
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
			return buildLegalContractRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildLegalContractSyncExcludeSnippet(this.analysis)
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
			const preset = LEGAL_CONTRACT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCountersignedOriginals = preset.protectCountersignedOriginals
			this.protectLegalHoldPades = preset.protectLegalHoldPades
			this.staleDraftDaysInput = String(preset.staleDraftDays)
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
				'draft-reclaimable': this.t('duplicatefinder', 'Stale Redline Draft'),
				'legal-hold-locked': this.t('duplicatefinder', 'Legal Hold Locked'),
				'pades-protected': this.t('duplicatefinder', 'PAdES Protected'),
				'countersigned-protected': this.t('duplicatefinder', 'Countersigned Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'legal-hold-locked' || riskState === 'pades-protected') {
				return 'is-danger'
			}
			if (riskState === 'countersigned-protected' || riskState === 'shielded') {
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
			if (verdict === 'blocked-legal-hold' || verdict === 'blocked-pades-verified') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-legal-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Legal Contract Vault remediation script to clipboard.'))
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
			const csv = buildLegalContractCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-legal-contract-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Legal Contract Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildLegalContractJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-legal-contract-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Legal Contract Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.legal-contract-vault-workbench {
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

.lcv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.lcv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.lcv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.lcv__status-badge {
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

.lcv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.lcv__tool-btn,
.lcv__seg-btn,
.lcv__primary-btn,
.lcv__load-more-btn,
.lcv__mini-btn {
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

.lcv__tool-btn:hover:not(:disabled),
.lcv__seg-btn:hover:not(:disabled),
.lcv__load-more-btn:hover:not(:disabled),
.lcv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.lcv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.lcv__tool-btn.is-primary-outline,
.lcv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.lcv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.lcv__tool-btn:focus-visible,
.lcv__seg-btn:focus-visible,
.lcv__primary-btn:focus-visible,
.lcv__load-more-btn:focus-visible,
.lcv__mini-btn:focus-visible,
.lcv__cluster-card:focus-visible,
.lcv__input:focus-visible,
.lcv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.lcv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.lcv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.lcv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.lcv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.lcv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.lcv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.lcv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.lcv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.lcv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.lcv__empty-banner,
.lcv__empty-filter {
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

.lcv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.lcv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.lcv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.lcv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.lcv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.lcv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.lcv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.lcv__inputs-row {
	align-items: flex-end;
}

.lcv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.lcv__field-grow {
	flex: 1 1 180px;
}

.lcv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.lcv__input,
.lcv__override-select {
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

.lcv__num-input {
	inline-size: 96px;
}

.lcv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.lcv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.lcv__cluster-card {
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

.lcv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.lcv__cluster-top,
.lcv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.lcv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.lcv__cluster-meta,
.lcv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.lcv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.lcv__badge,
.lcv__pill {
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

.lcv__pill.is-keep,
.lcv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.lcv__pill.is-danger,
.lcv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.lcv__pill.is-consolidate,
.lcv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.lcv__pill.is-warn,
.lcv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.lcv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.lcv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.lcv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.lcv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.lcv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.lcv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.lcv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.lcv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.lcv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.lcv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.lcv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.lcv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.lcv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.lcv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.lcv__member-top,
.lcv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.lcv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.lcv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.lcv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.lcv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.lcv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.lcv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.lcv__pre {
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

.lcv__sr-only {
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
	.lcv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.lcv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.lcv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.legal-contract-vault-workbench {
		padding: 10px;
	}

	.lcv__kpis,
	.lcv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.lcv__num-input {
		inline-size: 100%;
	}

	.lcv__field {
		flex: 1 1 100%;
	}
}
</style>
