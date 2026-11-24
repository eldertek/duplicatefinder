<template>
	<section
		class="finance-tax-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Financial, Accounting and Tax Compliance Vault Auditor')">
		<header class="ftv__toolbar">
			<div class="ftv__title-group">
				<h3 class="ftv__title">
					{{ t('duplicatefinder', 'Financial, Accounting & Tax Compliance Vault Auditor') }}
				</h3>
				<span
					class="ftv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {fec} FEC, {signed} signed, {bilans} bilans, {scans} scans/re-exports', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						fec: analysis.summary.totalFecArchiveClusters,
						signed: analysis.summary.totalSignedJustificatifClusters,
						bilans: analysis.summary.totalClosedBilanClusters,
						scans: analysis.summary.totalScannedReexportClusters,
					}) }}
				</span>
			</div>

			<div class="ftv__toolbar-actions">
				<button
					type="button"
					class="ftv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ftv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ftv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ftv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="ftv__tool-btn is-close"
					aria-keyshortcuts="Shift+F6"
					:title="t('duplicatefinder', 'Hide Financial, Accounting and Tax Compliance Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Finance & Tax Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ftv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ftv__kpis">
			<div class="ftv__kpi">
				<span class="ftv__kpi-label">{{ t('duplicatefinder', 'Safe Scan & Re-Export Reclaim') }}</span>
				<strong class="ftv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ftv__kpi">
				<span class="ftv__kpi-label">{{ t('duplicatefinder', 'Conserved 10-Year Fiscal Vault') }}</span>
				<strong class="ftv__kpi-val is-warn">
					{{ analysis.summary.totalFecArchiveClusters }} {{ t('duplicatefinder', 'FEC') }} / {{ analysis.summary.totalSignedJustificatifClusters }} {{ t('duplicatefinder', 'signed') }} / {{ analysis.summary.totalClosedBilanClusters }} {{ t('duplicatefinder', 'bilans') }}
				</strong>
			</div>
			<div class="ftv__kpi">
				<span class="ftv__kpi-label">{{ t('duplicatefinder', 'Scanned & Re-Exported Copies') }}</span>
				<strong class="ftv__kpi-val">
					{{ analysis.summary.totalScannedReexportClusters }} {{ t('duplicatefinder', 'scans/re-exports') }} / {{ analysis.summary.totalStaleExportClusters }} {{ t('duplicatefinder', 'exports') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ftv__kpi">
				<span class="ftv__kpi-label">{{ t('duplicatefinder', 'Raw Compliance Footprint') }}</span>
				<strong class="ftv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ftv__empty-banner"
			role="note">
			<div class="ftv__empty-text">
				<p class="ftv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure FEC, signed justificatif, and closed bilan shields before scanning') }}
				</p>
				<p class="ftv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit FEC exports (.txt, .tsv, .xml), bank statements (.ofx, .qif, .mt940, .camt.xml, .csv), invoices/credit notes/liasses (.pdf), and accounting workbooks (.xlsx, .xlsm, .ods).') }}
				</p>
			</div>
			<button
				type="button"
				class="ftv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ftv__controls">
			<div class="ftv__control-row">
				<span class="ftv__control-label">{{ t('duplicatefinder', 'Compliance Preset') }}</span>
				<div
					class="ftv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Financial and tax compliance presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ftv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ftv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ftv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ftv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ftv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ftv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ftv__seg-btn"
					:class="{ 'is-active': protectFecArchives }"
					:aria-pressed="protectFecArchives ? 'true' : 'false'"
					@click="protectFecArchives = !protectFecArchives">
					<span>{{ protectFecArchives ? t('duplicatefinder', 'Shield FEC Archives: ON') : t('duplicatefinder', 'Shield FEC Archives: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftv__seg-btn"
					:class="{ 'is-active': protectSignedJustificatifs }"
					:aria-pressed="protectSignedJustificatifs ? 'true' : 'false'"
					@click="protectSignedJustificatifs = !protectSignedJustificatifs">
					<span>{{ protectSignedJustificatifs ? t('duplicatefinder', 'Shield Signed Justificatifs: ON') : t('duplicatefinder', 'Shield Signed Justificatifs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftv__seg-btn"
					:class="{ 'is-active': protectClosedBilans }"
					:aria-pressed="protectClosedBilans ? 'true' : 'false'"
					@click="protectClosedBilans = !protectClosedBilans">
					<span>{{ protectClosedBilans ? t('duplicatefinder', 'Shield Closed Bilans: ON') : t('duplicatefinder', 'Shield Closed Bilans: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftv__seg-btn"
					:class="{ 'is-active': requireVerifiedArchiveAnchor }"
					:aria-pressed="requireVerifiedArchiveAnchor ? 'true' : 'false'"
					@click="requireVerifiedArchiveAnchor = !requireVerifiedArchiveAnchor">
					<span>{{ requireVerifiedArchiveAnchor ? t('duplicatefinder', 'Require 10yr Anchor: ON') : t('duplicatefinder', 'Require 10yr Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="ftv__control-row ftv__inputs-row">
				<label class="ftv__field">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ftv__input">
						<option value="prune-scans-and-reexports">{{ t('duplicatefinder', 'Prune Scans & Re-Exports (Keep FEC, Signed & Bilans)') }}</option>
						<option value="hardlink-immutable-archives">{{ t('duplicatefinder', 'Hardlink Immutable PDFs (Block XLSX/XLSM/ODS/CSV)') }}</option>
						<option value="quarantine-scans-and-drafts">{{ t('duplicatefinder', 'Quarantine Scanned Copies & Drafts Only') }}</option>
					</select>
				</label>

				<label class="ftv__field">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ftv__input">
						<option value="archive-signed-fec-first">{{ t('duplicatefinder', 'FEC, Signed Originals & Closed Bilans first') }}</option>
						<option value="oldest-fiscal-original-first">{{ t('duplicatefinder', 'Oldest 10-year fiscal original mtime first') }}</option>
						<option value="newest-closed-first">{{ t('duplicatefinder', 'Newest closed filing mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="ftv__field">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Closing Grace (d)') }}</span>
					<input
						v-model="keepRecentClosingDaysInput"
						type="number"
						min="0"
						step="1"
						class="ftv__input ftv__num-input">
				</label>

				<label class="ftv__field">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ftv__input ftv__num-input">
				</label>

				<label class="ftv__field ftv__field-grow">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Filter SIREN, Fiscal Year, FEC, Invoice or Bank Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ftv__input"
						:placeholder="t('duplicatefinder', 'e.g. FEC, FY2024, Factur-X, mt940, camt, bilan, scan')">
				</label>

				<label class="ftv__field">
					<span class="ftv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ftv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Compliance priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Document filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="ftv__control-row">
				<span class="ftv__control-label">{{ t('duplicatefinder', 'Accounting Family') }}</span>
				<div
					class="ftv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Financial and accounting family filter')">
					<button
						type="button"
						class="ftv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="ftv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="ftv__control-row">
				<span class="ftv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="ftv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Financial and tax compliance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="ftv__seg-btn"
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
			class="ftv__empty-filter"
			role="note">
			<p class="ftv__empty-title">
				{{ t('duplicatefinder', 'No FEC exports, bank statements, invoice/liasse PDFs, or accounting workbooks match the active filters.') }}
			</p>
			<button
				type="button"
				class="ftv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ftv__workspace">
			<div
				class="ftv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Financial, Accounting and Tax Compliance clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="ftv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="ftv__cluster-top">
						<strong class="ftv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="ftv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="ftv__cluster-meta">
						<span
							v-if="cluster.siren"
							class="ftv__tag">SIREN {{ cluster.siren }}</span>
						<span
							v-if="cluster.fiscalYear"
							class="ftv__tag">{{ cluster.fiscalYear }}</span>
						<span class="ftv__tag">{{ cluster.documentStem || cluster.name }}</span>
						<span class="ftv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="ftv__cluster-badges">
						<span
							v-if="cluster.hasFecArchive"
							class="ftv__badge is-danger">
							{{ t('duplicatefinder', 'FEC Statutory Archive') }}
						</span>
						<span
							v-if="cluster.hasSignedJustificatif"
							class="ftv__badge is-keep">
							{{ t('duplicatefinder', 'Signed / 10yr Original') }}
						</span>
						<span
							v-if="cluster.hasClosedBilan"
							class="ftv__badge is-keep">
							{{ t('duplicatefinder', 'Closed Bilan / Liasse') }}
						</span>
						<span
							v-if="cluster.hasScannedOrReexport"
							class="ftv__badge is-consolidate">
							{{ t('duplicatefinder', 'Scan / Re-Export Copy') }}
						</span>
						<span
							v-if="cluster.hasStaleExport"
							class="ftv__badge is-warn">
							{{ t('duplicatefinder', 'Stale Export / Draft') }}
						</span>
					</div>
					<div class="ftv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="ftv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="ftv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="ftv__inspector">
				<header class="ftv__inspector-head">
					<div class="ftv__inspector-title-wrap">
						<h4 class="ftv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="ftv__inspector-sub">
							{{ selectedCluster.siren ? `SIREN ${selectedCluster.siren}` : selectedCluster.documentStem }} | {{ selectedCluster.fiscalYear || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="ftv__inspector-actions">
						<button
							type="button"
							class="ftv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="ftv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="ftv__lineage-grid">
					<div class="ftv__lineage-item">
						<span class="ftv__lineage-label">{{ t('duplicatefinder', 'Fiscal Entity & Document Stem') }}</span>
						<strong class="ftv__lineage-val">{{ selectedCluster.siren ? `SIREN ${selectedCluster.siren} / ` : '' }}{{ selectedCluster.fiscalYear ? `${selectedCluster.fiscalYear} / ` : '' }}{{ selectedCluster.documentStem }}</strong>
					</div>
					<div class="ftv__lineage-item">
						<span class="ftv__lineage-label">{{ t('duplicatefinder', '10-Year Compliance Shield') }}</span>
						<strong class="ftv__lineage-val">
							{{ selectedCluster.hasFecArchive ? t('duplicatefinder', 'FEC Statutory Archive Shielded') : (selectedCluster.hasSignedJustificatif ? t('duplicatefinder', 'Signed / Locked Original Shielded') : (selectedCluster.hasClosedBilan ? t('duplicatefinder', 'Closed Bilan / Liasse Shielded') : t('duplicatefinder', 'Scanned / Re-Exported Copy'))) }}
						</strong>
					</div>
					<div class="ftv__lineage-item">
						<span class="ftv__lineage-label">{{ t('duplicatefinder', 'Archive Anchor & Compliance Tags') }}</span>
						<strong class="ftv__lineage-val">
							{{ selectedCluster.hasVerifiedArchiveAnchor ? t('duplicatefinder', '10yr/Signed Anchor Verified') : t('duplicatefinder', 'No Archive Anchor') }} | {{ selectedCluster.complianceTags.length > 0 ? selectedCluster.complianceTags.join(', ') : t('duplicatefinder', 'Standard fiscal file') }}
						</strong>
					</div>
					<div class="ftv__lineage-item">
						<span class="ftv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="ftv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="ftv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="ftv__member-card">
						<div class="ftv__member-top">
							<code class="ftv__member-path">{{ member.normalized }}</code>
							<div class="ftv__member-pills">
								<span
									class="ftv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.complianceTag"
									class="ftv__pill is-consolidate">
									{{ member.complianceTag }}
								</span>
								<span
									class="ftv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="ftv__member-bottom">
							<div class="ftv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.complianceRole }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="ftv__member-actions">
								<button
									type="button"
									class="ftv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isFecArchive && protectFecArchives) && !(member.isSignedJustificatif && protectSignedJustificatifs) && !(member.isClosedBilan && protectClosedBilans)"
									class="ftv__override-field">
									<span class="ftv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="ftv__override-select"
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

				<div class="ftv__code-panels">
					<div class="ftv__code-box">
						<div class="ftv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="ftv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ftv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="ftv__code-box">
						<div class="ftv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="ftv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="ftv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	FINANCE_TAX_PRESETS,
	auditFinanceTaxVault,
	buildFinanceTaxCsvReport,
	buildFinanceTaxJsonManifest,
	buildFinanceTaxRemediationScript,
	buildFinanceTaxSyncExcludeList,
} from '../tools/financeTaxVaultAuditor'

export default {
	name: 'FinanceTaxVaultWorkbench',
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
			presetId: 'all-finance-tax-compliance-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-scans-and-reexports',
			survivorRule: 'archive-signed-fec-first',
			protectFecArchives: true,
			protectSignedJustificatifs: true,
			protectClosedBilans: true,
			requireVerifiedArchiveAnchor: true,
			keepRecentClosingDaysInput: '0',
			minSizeKbInput: '0',
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
			return FINANCE_TAX_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'fec-archive-protected', label: this.t('duplicatefinder', 'FEC Archive') },
				{ id: 'signed-justificatif-protected', label: this.t('duplicatefinder', 'Signed Original') },
				{ id: 'closed-bilan-protected', label: this.t('duplicatefinder', 'Closed Bilan') },
				{ id: 'scanned-or-reexport-copy', label: this.t('duplicatefinder', 'Scan / Re-Export') },
				{ id: 'stale-accounting-export', label: this.t('duplicatefinder', 'Stale Export') },
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
		parsedKeepRecentClosingDays() {
			const trimmed = String(this.keepRecentClosingDaysInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
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
			return auditFinanceTaxVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectFecArchives: this.protectFecArchives,
				protectSignedJustificatifs: this.protectSignedJustificatifs,
				protectClosedBilans: this.protectClosedBilans,
				requireVerifiedArchiveAnchor: this.requireVerifiedArchiveAnchor,
				keepRecentClosingDays: this.parsedKeepRecentClosingDays,
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
			return buildFinanceTaxRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildFinanceTaxSyncExcludeList()
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
			const preset = FINANCE_TAX_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectFecArchives = preset.protectFecArchives
			this.protectSignedJustificatifs = preset.protectSignedJustificatifs
			this.protectClosedBilans = preset.protectClosedBilans
			this.requireVerifiedArchiveAnchor = preset.requireVerifiedArchiveAnchor
			this.keepRecentClosingDaysInput = String(preset.keepRecentClosingDays)
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
			if (this.selectedCluster && this.selectedClusterId === null) {
				this.selectedClusterId = this.selectedCluster.id
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatVerdictLabel(verdict) {
			const map = {
				'fec-archive-protected': this.t('duplicatefinder', 'FEC Archive'),
				'signed-justificatif-protected': this.t('duplicatefinder', 'Signed Original'),
				'closed-bilan-protected': this.t('duplicatefinder', 'Closed Bilan'),
				'scanned-or-reexport-copy': this.t('duplicatefinder', 'Scan / Re-Export'),
				'stale-accounting-export': this.t('duplicatefinder', 'Stale Export'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'fec-archive-protected') {
				return 'is-danger'
			}
			if (verdict === 'signed-justificatif-protected' || verdict === 'closed-bilan-protected') {
				return 'is-keep'
			}
			if (verdict === 'scanned-or-reexport-copy') {
				return 'is-consolidate'
			}
			if (verdict === 'stale-accounting-export') {
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
				return this.strategy === 'quarantine-scans-and-drafts'
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
				this.setNotice(this.t('duplicatefinder', 'Copied fiscal or accounting file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Finance & Tax remediation script to clipboard.'))
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
			const csv = buildFinanceTaxCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-finance-tax-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Finance & Tax Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildFinanceTaxJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-finance-tax-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Finance & Tax Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.finance-tax-vault-workbench {
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

.ftv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ftv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ftv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ftv__status-badge {
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

.ftv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ftv__tool-btn,
.ftv__seg-btn,
.ftv__primary-btn,
.ftv__load-more-btn,
.ftv__mini-btn {
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

.ftv__tool-btn:hover:not(:disabled),
.ftv__seg-btn:hover:not(:disabled),
.ftv__load-more-btn:hover:not(:disabled),
.ftv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.ftv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ftv__tool-btn.is-primary-outline,
.ftv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ftv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ftv__tool-btn:focus-visible,
.ftv__seg-btn:focus-visible,
.ftv__primary-btn:focus-visible,
.ftv__load-more-btn:focus-visible,
.ftv__mini-btn:focus-visible,
.ftv__cluster-card:focus-visible,
.ftv__input:focus-visible,
.ftv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ftv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ftv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.ftv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.ftv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.ftv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ftv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ftv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ftv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.ftv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.ftv__empty-banner,
.ftv__empty-filter {
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

.ftv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.ftv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.ftv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.ftv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.ftv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.ftv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.ftv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.ftv__inputs-row {
	align-items: flex-end;
}

.ftv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ftv__field-grow {
	flex: 1 1 180px;
}

.ftv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ftv__input,
.ftv__override-select {
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

.ftv__num-input {
	inline-size: 96px;
}

.ftv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.ftv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.ftv__cluster-card {
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

.ftv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.ftv__cluster-top,
.ftv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.ftv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.ftv__cluster-meta,
.ftv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.ftv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.ftv__badge,
.ftv__pill {
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

.ftv__pill.is-keep,
.ftv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.ftv__pill.is-danger,
.ftv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.ftv__pill.is-consolidate,
.ftv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.ftv__pill.is-warn,
.ftv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.ftv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.ftv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.ftv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ftv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.ftv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.ftv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ftv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ftv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ftv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.ftv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.ftv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.ftv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.ftv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ftv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftv__member-top,
.ftv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ftv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.ftv__member-pills,
.ftv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.ftv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.ftv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.ftv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ftv__pre {
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

.ftv__sr-only {
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
	.ftv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.ftv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.ftv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.finance-tax-vault-workbench {
		padding: 10px;
	}

	.ftv__kpis,
	.ftv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.ftv__num-input {
		inline-size: 100%;
	}

	.ftv__field {
		flex: 1 1 100%;
	}
}
</style>
