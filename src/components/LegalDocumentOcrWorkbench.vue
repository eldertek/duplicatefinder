<template>
	<section
		class="legal-doc-ocr-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Legal Contract, E-Signature, OCR Dual-Scan and Office-PDF Derivative Auditor')">
		<header class="ldow__toolbar">
			<div class="ldow__title-group">
				<h3 class="ldow__title">
					{{ t('duplicatefinder', 'Legal Contract, E-Signature, OCR Dual-Scan & Office-PDF Auditor') }}
				</h3>
				<span
					class="ldow__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalExecutedVaultClusters,
					}) }}
				</span>
			</div>

			<div class="ldow__toolbar-actions">
				<button
					type="button"
					class="ldow__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ldow__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ldow__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ldow__tool-btn is-close"
					aria-keyshortcuts="("
					:title="t('duplicatefinder', 'Hide Legal Contract, E-Signature, OCR Dual-Scan and Office-PDF Derivative Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Docs & OCR Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ldow__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ldow__empty-banner"
			role="note">
			<div class="ldow__empty-text">
				<p class="ldow__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Executed Legal Vault and Signed Master guards before scanning') }}
				</p>
				<p class="ldow__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit executed contracts (_signed/_executed/CertificateOfCompletion/.p7m/.p7s), OCR dual-scan pairs (_ocr.pdf vs _scan.tiff/_raw.pdf/.djvu), negotiation redlines (_redline/_tracked/_markup/Compare_...), and Office-PDF export twins.') }}
				</p>
			</div>
			<button
				type="button"
				class="ldow__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ldow__controls">
			<div class="ldow__control-row">
				<span class="ldow__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="ldow__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Legal contract and OCR audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ldow__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ldow__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ldow__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ldow__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ldow__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ldow__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ldow__seg-btn"
					:class="{ 'is-active': protectExecutedVault }"
					:aria-pressed="protectExecutedVault ? 'true' : 'false'"
					@click="protectExecutedVault = !protectExecutedVault">
					<span>{{ protectExecutedVault ? t('duplicatefinder', 'Executed Legal Vault Guard: ON') : t('duplicatefinder', 'Executed Legal Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ldow__seg-btn"
					:class="{ 'is-active': protectSignedMasters }"
					:aria-pressed="protectSignedMasters ? 'true' : 'false'"
					@click="protectSignedMasters = !protectSignedMasters">
					<span>{{ protectSignedMasters ? t('duplicatefinder', 'Signed Master Guard: ON') : t('duplicatefinder', 'Signed Master Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ldow__seg-btn"
					:class="{ 'is-active': protectOcrVerified }"
					:aria-pressed="protectOcrVerified ? 'true' : 'false'"
					@click="protectOcrVerified = !protectOcrVerified">
					<span>{{ protectOcrVerified ? t('duplicatefinder', 'OCR-Verified Archive Guard: ON') : t('duplicatefinder', 'OCR-Verified Archive Guard: OFF') }}</span>
				</button>
			</div>

			<div class="ldow__control-row ldow__inputs-row">
				<label class="ldow__field">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ldow__input">
						<option value="consolidate-executed-vault">{{ t('duplicatefinder', 'Consolidate to Executed Legal Vault') }}</option>
						<option value="prune-raw-scan-when-ocr-verified">{{ t('duplicatefinder', 'Prune Raw Scans When OCR Verified') }}</option>
						<option value="hardlink-office-pdf-derivatives">{{ t('duplicatefinder', 'Hardlink Office & PDF Derivatives (POSIX ln -f)') }}</option>
					</select>
				</label>

				<label class="ldow__field">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ldow__input">
						<option value="executed-vault-first">{{ t('duplicatefinder', 'Executed Vault / Signed Master first') }}</option>
						<option value="ocr-verified-first">{{ t('duplicatefinder', 'OCR-Verified searchable PDF first') }}</option>
						<option value="editable-office-first">{{ t('duplicatefinder', 'Editable Office source (.docx/.odt) first') }}</option>
						<option value="newest-version">{{ t('duplicatefinder', 'Newest document version') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="ldow__field">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Stale Draft (d)') }}</span>
					<input
						v-model="staleDraftDaysInput"
						type="number"
						min="0"
						step="1"
						class="ldow__input ldow__num-input">
				</label>

				<label class="ldow__field">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ldow__input ldow__num-input">
				</label>

				<label class="ldow__field ldow__field-grow">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Filter Contract Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ldow__input"
						:placeholder="t('duplicatefinder', 'e.g. _signed, .p7m, _ocr.pdf, _scan.tiff, _redline, .docx')">
				</label>

				<label class="ldow__field ldow__field-grow">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="ldow__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="ldow__field">
					<span class="ldow__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ldow__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Executed vault & scan risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Document name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="ldow__kpis">
			<div class="ldow__kpi">
				<span class="ldow__kpi-label">{{ t('duplicatefinder', 'Safe Document Reclaim') }}</span>
				<strong class="ldow__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ldow__kpi">
				<span class="ldow__kpi-label">{{ t('duplicatefinder', 'Executed Vault & Signed Proofs') }}</span>
				<strong class="ldow__kpi-val is-warn">
					{{ analysis.summary.totalExecutedVaultClusters }} {{ t('duplicatefinder', 'vaulted clusters') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="ldow__kpi">
				<span class="ldow__kpi-label">{{ t('duplicatefinder', 'OCR Dual-Scans & Raw Pool') }}</span>
				<strong class="ldow__kpi-val">
					{{ analysis.summary.totalOcrPairedClusters }} {{ t('duplicatefinder', 'OCR paired') }} / {{ analysis.summary.totalRawScanCopiesCount }} {{ t('duplicatefinder', 'raw scans') }}
				</strong>
			</div>
			<div class="ldow__kpi">
				<span class="ldow__kpi-label">{{ t('duplicatefinder', 'Raw Legal & Doc Footprint') }}</span>
				<strong class="ldow__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="ldow__filters-strip">
			<div
				class="ldow__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by legal and OCR document family')">
				<button
					type="button"
					class="ldow__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Legal & OCR Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="ldow__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="ldow__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by legal audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="ldow__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="ldow__empty-banner"
			role="note">
			<div class="ldow__empty-text">
				<p class="ldow__empty-title">
					{{ t('duplicatefinder', 'No signed contract, OCR dual-scan, redline markup, or Office-PDF clusters match the active filters') }}
				</p>
				<p class="ldow__empty-hint">
					{{ t('duplicatefinder', 'Adjust the document family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="ldow__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ldow__workstation">
			<div class="ldow__list-pane">
				<div class="ldow__pane-header">
					<span class="ldow__pane-title">
						{{ t('duplicatefinder', 'Legal Contract, OCR & Office-PDF Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="ldow__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="ldow__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="ldow__cluster-top">
							<span class="ldow__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="ldow__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="ldow__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.documentLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="ldow__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="ldow__load-more-wrap">
					<button
						type="button"
						class="ldow__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="ldow__inspector-pane">
				<header class="ldow__inspector-header">
					<div class="ldow__inspector-title-wrap">
						<h4 class="ldow__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="ldow__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.documentLineageStem }}
						</span>
					</div>

					<div class="ldow__inspector-actions">
						<button
							type="button"
							class="ldow__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="ldow__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-scan'"
					class="ldow__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Raw Scan Lacks Verified OCR Match:') }}</strong>
					{{ t('duplicatefinder', 'Raw scanner inbox copies (_scan.tiff, _raw.pdf, .djvu) are shielded until a searchable _ocr.pdf or OCR-Archive copy exists for this lineage stem.') }}
				</div>

				<div
					v-if="selectedCluster.hasExecutedVault"
					class="ldow__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Executed / Signed Legal Vault Guard:') }}</strong>
					{{ t('duplicatefinder', 'Executed contracts, DocuSign/Yousign/AdobeSign completions, and .p7m/.p7s cryptographic proofs are strictly shielded by default unless explicitly overridden.') }}
				</div>

				<div class="ldow__meta-grid">
					<div class="ldow__meta-item">
						<span class="ldow__meta-label">{{ t('duplicatefinder', 'Document Lineage Stem') }}</span>
						<span>{{ selectedCluster.documentLineageStem }}</span>
					</div>
					<div class="ldow__meta-item">
						<span class="ldow__meta-label">{{ t('duplicatefinder', 'Signature, OCR & Markup Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="ldow__meta-item">
						<span class="ldow__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="ldow__meta-item">
						<span class="ldow__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="ldow__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="ldow__meta-item">
						<span class="ldow__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="ldow__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="ldow__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="ldow__member-top">
							<span class="ldow__member-name">{{ member.basename }}</span>
							<div class="ldow__member-badges">
								<span
									class="ldow__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="ldow__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="ldow__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="ldow__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="ldow__companion-chips">
							<span class="ldow__companion-chip">{{ member.context.documentLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="ldow__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isExecutedLegalVault"
								class="ldow__companion-chip is-warn">
								{{ t('duplicatefinder', 'Executed Legal Vault') }}
							</span>
							<span
								v-if="member.context.isSignedMaster"
								class="ldow__companion-chip is-warn">
								{{ t('duplicatefinder', 'Signed Master Proof') }}
							</span>
							<span
								v-if="member.context.isOcrVerified"
								class="ldow__companion-chip">
								{{ t('duplicatefinder', 'OCR-Verified Archive') }}
							</span>
							<span
								v-if="member.context.isRawScan"
								class="ldow__companion-chip is-warn">
								{{ t('duplicatefinder', 'Raw Scan') }}
							</span>
							<span
								v-if="member.context.isOfficeSource"
								class="ldow__companion-chip">
								{{ t('duplicatefinder', 'Editable Office Source') }}
							</span>
						</div>

						<p class="ldow__member-note">
							{{ member.note }}
						</p>

						<div class="ldow__override-bar">
							<span class="ldow__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="ldow__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="ldow__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="ldow__seg-btn"
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
			class="ldow__script-box">
			<summary class="ldow__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="ldow__script-content">
				<div class="ldow__script-actions">
					<button
						type="button"
						class="ldow__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="ldow__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="ldow__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="ldow__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	LEGAL_DOC_FAMILY_META,
	LEGAL_DOC_PRESETS,
	analyzeLegalDocumentOcrDuplicates,
	buildLegalDocumentOcrCsvReport,
	buildLegalDocumentOcrJsonReport,
	buildLegalDocumentOcrScript,
	buildLegalDocumentSyncExcludeSnippet,
} from '../tools/legalDocumentOcrAuditor'

export default {
	name: 'LegalDocumentOcrWorkbench',
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
			presetId: 'all-legal-ocr-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-executed-vault',
			survivorRule: 'executed-vault-first',
			protectExecutedVault: true,
			protectSignedMasters: true,
			protectOcrVerified: true,
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
			return LEGAL_DOC_PRESETS
		},
		familyOptions() {
			return Object.values(LEGAL_DOC_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'executed-vault', label: this.t('duplicatefinder', 'Executed Legal Vault') },
				{ id: 'ocr-verified', label: this.t('duplicatefinder', 'OCR-Verified Archive') },
				{ id: 'raw-scans', label: this.t('duplicatefinder', 'Raw Scanner Pool') },
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
			return analyzeLegalDocumentOcrDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectExecutedVault: this.protectExecutedVault,
				protectSignedMasters: this.protectSignedMasters,
				protectOcrVerified: this.protectOcrVerified,
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
			return buildLegalDocumentOcrScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildLegalDocumentSyncExcludeSnippet(this.analysis)
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
			const preset = LEGAL_DOC_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectExecutedVault = preset.protectExecutedVault
			this.protectSignedMasters = preset.protectSignedMasters
			this.protectOcrVerified = preset.protectOcrVerified
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
				'executed-vault': this.t('duplicatefinder', 'Executed Vault Guarded'),
				'unverified-scan': this.t('duplicatefinder', 'Unverified Raw Scan'),
				'ocr-paired': this.t('duplicatefinder', 'OCR Paired'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-executed-vault' || verdict === 'blocked-signed-master') {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-ocr-verified'
				|| verdict === 'blocked-no-ocr-verification'
				|| verdict === 'blocked-not-raw-scan'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'hardlink-office-derivative') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Legal, OCR & Office-PDF consolidation script to clipboard.'))
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
			const csv = buildLegalDocumentOcrCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-legal-document-ocr-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Legal & OCR CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildLegalDocumentOcrJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-legal-document-ocr-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Legal & OCR JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.legal-doc-ocr-workbench {
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

.ldow__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.ldow__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ldow__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ldow__status-badge {
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

.ldow__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ldow__tool-btn,
.ldow__seg-btn,
.ldow__chip,
.ldow__primary-btn {
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

.ldow__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.ldow__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ldow__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.ldow__seg-btn.is-active,
.ldow__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ldow__tool-btn:focus-visible,
.ldow__seg-btn:focus-visible,
.ldow__chip:focus-visible,
.ldow__primary-btn:focus-visible,
.ldow__cluster-item:focus-visible,
.ldow__input:focus-visible,
.ldow__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.ldow__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ldow__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ldow__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ldow__empty-banner {
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

.ldow__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.ldow__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.ldow__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.ldow__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.ldow__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ldow__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ldow__segments,
.ldow__chip-group,
.ldow__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.ldow__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.ldow__inputs-row {
	align-items: flex-end;
}

.ldow__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ldow__field-grow {
	flex: 1 1 200px;
}

.ldow__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.ldow__input {
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

.ldow__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.ldow__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.ldow__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.ldow__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.ldow__kpi {
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

.ldow__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.ldow__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ldow__kpi-val.is-accent {
	color: #0b4a8b;
}

.ldow__kpi-val.is-warn {
	color: #7c4a03;
}

.ldow__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.ldow__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.ldow__list-pane,
.ldow__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ldow__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ldow__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.ldow__cluster-list,
.ldow__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.ldow__cluster-item {
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

.ldow__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.ldow__cluster-top,
.ldow__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ldow__cluster-name,
.ldow__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.ldow__cluster-path,
.ldow__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ldow__cluster-meta,
.ldow__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ldow__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.ldow__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ldow__pill.is-risk-executed-vault,
.ldow__pill.is-risk-unverified-scan,
.ldow__pill.is-risk-shielded,
.ldow__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ldow__pill.is-risk-ocr-paired,
.ldow__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.ldow__pill.is-risk-reclaimable,
.ldow__pill.is-reclaim,
.ldow__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ldow__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.ldow__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.ldow__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ldow__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ldow__inspector-actions,
.ldow__override-bar,
.ldow__member-badges,
.ldow__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ldow__companion-chip {
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

.ldow__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ldow__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ldow__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.ldow__meta-grid {
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
	.ldow__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.ldow__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.ldow__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.ldow__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.ldow__member-card {
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

.ldow__member-card.is-verdict-keep-canonical-survivor,
.ldow__member-card.is-verdict-reclaim-redundant-copy,
.ldow__member-card.is-verdict-reclaim-raw-scan {
	border-inline-start: 4px solid #0f5132;
}

.ldow__member-card.is-verdict-hardlink-office-derivative {
	border-inline-start: 4px solid #0b4a8b;
}

.ldow__member-card.is-verdict-blocked-executed-vault,
.ldow__member-card.is-verdict-blocked-signed-master {
	border-inline-start: 4px solid #842029;
}

.ldow__member-card.is-verdict-blocked-ocr-verified,
.ldow__member-card.is-verdict-blocked-no-ocr-verification,
.ldow__member-card.is-verdict-blocked-not-raw-scan,
.ldow__member-card.is-verdict-blocked-manual-shield,
.ldow__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.ldow__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.ldow__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.ldow__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.ldow__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.ldow__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ldow__code-pre {
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

.ldow__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
