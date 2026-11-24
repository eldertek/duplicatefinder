<template>
	<section
		class="design-publishing-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Creative Design Package, Print Proof and Typography Font Archive Auditor')">
		<header class="dpv__toolbar">
			<div class="dpv__title-group">
				<h3 class="dpv__title">
					{{ t('duplicatefinder', 'Creative Design Package, Print Proof & Font Archive Auditor') }}
				</h3>
				<span
					class="dpv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {anchors} master & font anchors', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						anchors: analysis.summary.totalMasterAnchorClusters,
					}) }}
				</span>
			</div>

			<div class="dpv__toolbar-actions">
				<button
					type="button"
					class="dpv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dpv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dpv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dpv__tool-btn is-close"
					aria-keyshortcuts="Shift+F"
					:title="t('duplicatefinder', 'Hide Creative Design Package, Print Proof and Typography Font Archive Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Print & Font Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dpv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="dpv__kpis">
			<div class="dpv__kpi">
				<span class="dpv__kpi-label">{{ t('duplicatefinder', 'Safe Studio Reclaim') }}</span>
				<strong class="dpv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="dpv__kpi">
				<span class="dpv__kpi-label">{{ t('duplicatefinder', 'Master & Font Anchors') }}</span>
				<strong class="dpv__kpi-val is-warn">
					{{ analysis.summary.totalMasterAnchorClusters }} {{ t('duplicatefinder', 'anchored') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="dpv__kpi">
				<span class="dpv__kpi-label">{{ t('duplicatefinder', 'Proofs, Fonts/Links & Caches') }}</span>
				<strong class="dpv__kpi-val">
					{{ analysis.summary.totalPrintProofClusters }} {{ t('duplicatefinder', 'proofs') }} / {{ analysis.summary.totalPackagedCloneClusters }} {{ t('duplicatefinder', 'pkgs') }} / {{ analysis.summary.totalRecoveryCacheClusters }} {{ t('duplicatefinder', 'locks') }}
				</strong>
			</div>
			<div class="dpv__kpi">
				<span class="dpv__kpi-label">{{ t('duplicatefinder', 'Raw Creative Footprint') }}</span>
				<strong class="dpv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dpv__empty-banner"
			role="note">
			<div class="dpv__empty-text">
				<p class="dpv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure master layout and font library guards before scanning') }}
				</p>
				<p class="dpv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit master layouts (*.psd/*.psb/*.ai/*.indd/*.fig/*.sketch/*.af*), print/BAT PDFs (*_PRINT_CMYK/_X1a/_BLEED/_BAT_v*/_web_preview.pdf/*.eps), packaged fonts & Links/* clones against _FontVault/ / _SharedAssets/, and stale locks (*.idlk, InDesign Recovery/, Photoshop Temp*, .BridgeCache*, _thumb_cache.*).') }}
				</p>
			</div>
			<button
				type="button"
				class="dpv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dpv__controls">
			<div class="dpv__control-row">
				<span class="dpv__control-label">{{ t('duplicatefinder', 'Preflight Preset') }}</span>
				<div
					class="dpv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Design and print vault preflight presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dpv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dpv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dpv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dpv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dpv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dpv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dpv__seg-btn"
					:class="{ 'is-active': protectMasterSources }"
					:aria-pressed="protectMasterSources ? 'true' : 'false'"
					@click="protectMasterSources = !protectMasterSources">
					<span>{{ protectMasterSources ? t('duplicatefinder', 'Master Layout Source Guard: ON') : t('duplicatefinder', 'Master Layout Source Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dpv__seg-btn"
					:class="{ 'is-active': protectFontLibraryAnchor }"
					:aria-pressed="protectFontLibraryAnchor ? 'true' : 'false'"
					@click="protectFontLibraryAnchor = !protectFontLibraryAnchor">
					<span>{{ protectFontLibraryAnchor ? t('duplicatefinder', 'Font Vault Anchor Guard: ON') : t('duplicatefinder', 'Font Vault Anchor Guard: OFF') }}</span>
				</button>
			</div>

			<div class="dpv__control-row dpv__inputs-row">
				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="dpv__input">
						<option value="consolidate-packaged-fonts-and-links">{{ t('duplicatefinder', 'Consolidate Packaged Fonts & Links') }}</option>
						<option value="prune-superseded-proof-pdfs">{{ t('duplicatefinder', 'Prune Superseded Proof PDFs') }}</option>
						<option value="prune-stale-creative-locks-and-caches">{{ t('duplicatefinder', 'Prune Stale Creative Locks & Caches') }}</option>
					</select>
				</label>

				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="dpv__input">
						<option value="master-and-font-vault-first">{{ t('duplicatefinder', '01_Master & _FontVault first') }}</option>
						<option value="newest-proof-version-first">{{ t('duplicatefinder', 'Newest BAT / version first') }}</option>
						<option value="print-cmyk-x1a-first">{{ t('duplicatefinder', 'Print CMYK / PDF/X-1a first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Keep BAT Versions') }}</span>
					<input
						v-model="keepBatVersionsInput"
						type="number"
						min="0"
						step="1"
						class="dpv__input dpv__num-input">
				</label>

				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Stale Locks (d)') }}</span>
					<input
						v-model="staleRecoveryDaysInput"
						type="number"
						min="0"
						step="1"
						class="dpv__input dpv__num-input">
				</label>

				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="dpv__input dpv__num-input">
				</label>

				<label class="dpv__field dpv__field-grow">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Filter Design Stem, Proof Flavor or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="dpv__input"
						:placeholder="t('duplicatefinder', 'e.g. _FontVault, _PRINT_CMYK, Document fonts, .idlk')">
				</label>

				<label class="dpv__field dpv__field-grow">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="dpv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="dpv__field">
					<span class="dpv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="dpv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & proof risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="dpv__filters-strip">
			<div
				class="dpv__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by creative design or publishing family')">
				<button
					type="button"
					class="dpv__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Creative Assets ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="dpv__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="dpv__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by design vault audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="dpv__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="dpv__empty-banner"
			role="note">
			<div class="dpv__empty-text">
				<p class="dpv__empty-title">
					{{ t('duplicatefinder', 'No master layouts, print proofs, packaged fonts, or creative caches match the active filters') }}
				</p>
				<p class="dpv__empty-hint">
					{{ t('duplicatefinder', 'Adjust the family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="dpv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="dpv__workstation">
			<div class="dpv__list-pane">
				<div class="dpv__pane-header">
					<span class="dpv__pane-title">
						{{ t('duplicatefinder', 'Design & Print Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="dpv__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="dpv__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="dpv__cluster-top">
							<span class="dpv__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="dpv__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="dpv__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.designLineageStem }}</span>
							<span v-if="cluster.proofFlavor !== 'none'">{{ cluster.proofFlavor }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span class="dpv__num-cell">{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="dpv__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="dpv__load-more-wrap">
					<button
						type="button"
						class="dpv__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="dpv__inspector-pane">
				<header class="dpv__inspector-header">
					<div class="dpv__inspector-title-wrap">
						<h4 class="dpv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="dpv__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'asset' }} / {{ selectedCluster.designLineageStem }}
						</span>
					</div>

					<div class="dpv__inspector-actions">
						<button
							type="button"
							class="dpv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="dpv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasUnverifiedDesignMaster"
					class="dpv__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified Design Master Guard:') }}</strong>
					{{ t('duplicatefinder', 'Pruning of print/BAT PDFs and EPS proofs is blocked whenever no editable master source (*.psd, *.psb, *.ai, *.indd, *.fig, *.sketch, *.af*) matching this design lineage stem is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasMasterSource || selectedCluster.hasFontLibraryAnchor"
					class="dpv__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Studio Master & Font Vault Guard:') }}</strong>
					{{ t('duplicatefinder', 'Editable master layout sources and canonical _FontVault/ / _SharedAssets/ anchors are protected by default; campaign Document fonts/* and Links/* duplicates are consolidated via hardlink to preserve package resolution.') }}
				</div>

				<div class="dpv__meta-grid">
					<div class="dpv__meta-item">
						<span class="dpv__meta-label">{{ t('duplicatefinder', 'Design Lineage Stem') }}</span>
						<span>{{ selectedCluster.designLineageStem }}</span>
					</div>
					<div class="dpv__meta-item">
						<span class="dpv__meta-label">{{ t('duplicatefinder', 'Proof Flavor & Preflight Tags') }}</span>
						<span>{{ selectedCluster.proofFlavor }} / {{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="dpv__meta-item">
						<span class="dpv__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="dpv__meta-item">
						<span class="dpv__meta-label">{{ t('duplicatefinder', 'Canonical Studio Anchor') }}</span>
						<span class="dpv__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="dpv__meta-item">
						<span class="dpv__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span class="dpv__num-cell">{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="dpv__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="dpv__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="dpv__member-top">
							<span class="dpv__member-name">{{ member.basename }}</span>
							<div class="dpv__member-badges">
								<span
									class="dpv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="dpv__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="dpv__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="dpv__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span class="dpv__num-cell">{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null" class="dpv__num-cell">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="dpv__companion-chips">
							<span class="dpv__companion-chip">{{ member.context.designLineageStem }}</span>
							<span
								v-if="member.context.proofFlavor !== 'none'"
								class="dpv__companion-chip">
								{{ member.context.proofFlavor }}
							</span>
							<span
								v-if="member.context.batVersion !== null"
								class="dpv__companion-chip">
								BAT v{{ member.context.batVersion }}
							</span>
							<span
								v-if="member.context.isMasterLayoutSource"
								class="dpv__companion-chip is-warn">
								{{ t('duplicatefinder', 'Editable Master Source') }}
							</span>
							<span
								v-if="member.context.isFontLibraryAnchor"
								class="dpv__companion-chip is-warn">
								{{ t('duplicatefinder', 'Font / Shared Vault Anchor') }}
							</span>
							<span
								v-if="member.context.isPrintAndWebExportProof"
								class="dpv__companion-chip">
								{{ member.context.hasVerifiedDesignMaster ? t('duplicatefinder', 'Master Source Verified') : t('duplicatefinder', 'Missing Master Source') }}
							</span>
							<span
								v-if="member.context.isRecoveryOrPreviewCache"
								class="dpv__companion-chip">
								{{ member.context.isStaleRecoveryCache ? t('duplicatefinder', 'Stale Lock / Cache') : t('duplicatefinder', 'Active Lock / Fresh Cache') }}
							</span>
						</div>

						<p class="dpv__member-note">
							{{ member.note }}
						</p>

						<div class="dpv__override-bar">
							<span class="dpv__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="dpv__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="dpv__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="dpv__seg-btn"
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
			class="dpv__script-box">
			<summary class="dpv__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="dpv__script-content">
				<div class="dpv__script-actions">
					<button
						type="button"
						class="dpv__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="dpv__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="dpv__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="dpv__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	DESIGN_PUBLISHING_FAMILY_META,
	DESIGN_PUBLISHING_PRESETS,
	analyzeDesignPublishingDuplicates,
	buildDesignPublishingCsvReport,
	buildDesignPublishingJsonReport,
	buildDesignPublishingScript,
	buildDesignPublishingSyncExcludeSnippet,
} from '../tools/designPublishingVaultAuditor'

export default {
	name: 'DesignPublishingVaultWorkbench',
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
			presetId: 'all-design-publishing-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-packaged-fonts-and-links',
			survivorRule: 'master-and-font-vault-first',
			protectMasterSources: true,
			protectFontLibraryAnchor: true,
			keepBatVersionsInput: '1',
			staleRecoveryDaysInput: '3',
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
			return DESIGN_PUBLISHING_PRESETS
		},
		familyOptions() {
			return Object.values(DESIGN_PUBLISHING_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'master-source', label: this.t('duplicatefinder', 'Master Layout Sources') },
				{ id: 'font-library-anchor', label: this.t('duplicatefinder', 'Font / Shared Vault Anchors') },
				{ id: 'print-proof', label: this.t('duplicatefinder', 'Print & BAT Proofs') },
				{ id: 'unverified-master', label: this.t('duplicatefinder', 'Unverified Master Guard') },
				{ id: 'recovery-cache', label: this.t('duplicatefinder', 'Locks & Caches') },
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
		parsedKeepBatVersions() {
			const trimmed = String(this.keepBatVersionsInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
		},
		parsedStaleRecoveryDays() {
			const trimmed = String(this.staleRecoveryDaysInput ?? '').trim()
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
			return analyzeDesignPublishingDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectMasterSources: this.protectMasterSources,
				protectFontLibraryAnchor: this.protectFontLibraryAnchor,
				keepBatVersions: this.parsedKeepBatVersions,
				staleRecoveryDays: this.parsedStaleRecoveryDays,
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
			return buildDesignPublishingScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildDesignPublishingSyncExcludeSnippet(this.analysis)
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
			const preset = DESIGN_PUBLISHING_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectMasterSources = preset.protectMasterSources
			this.protectFontLibraryAnchor = preset.protectFontLibraryAnchor
			this.keepBatVersionsInput = String(preset.keepBatVersions)
			this.staleRecoveryDaysInput = String(preset.staleRecoveryDays)
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
				consolidatable: this.t('duplicatefinder', 'Hardlink Consolidatable'),
				'master-protected': this.t('duplicatefinder', 'Master Protected'),
				'font-vault-anchor': this.t('duplicatefinder', 'Font Vault Anchor'),
				'unverified-design-master': this.t('duplicatefinder', 'Unverified Master Guard'),
				'design-master-verified': this.t('duplicatefinder', 'Design Master Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-master-layout-source'
				|| verdict === 'blocked-font-library-anchor'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-design-master'
				|| verdict === 'blocked-active-creative-lock'
				|| verdict === 'blocked-recent-bat-proof'
				|| verdict === 'blocked-strategy-scope'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (
				verdict === 'consolidate-to-font-vault'
				|| verdict === 'consolidate-to-studio-anchor'
			) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Design & Print Vault remediation script to clipboard.'))
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
			const csv = buildDesignPublishingCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-design-publishing-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Design & Print Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDesignPublishingJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-design-publishing-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Design & Print Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.design-publishing-vault-workbench {
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

.dpv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.dpv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.dpv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dpv__status-badge {
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

.dpv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dpv__tool-btn,
.dpv__seg-btn,
.dpv__chip,
.dpv__primary-btn {
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

.dpv__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.dpv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dpv__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.dpv__seg-btn.is-active,
.dpv__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dpv__tool-btn:focus-visible,
.dpv__seg-btn:focus-visible,
.dpv__chip:focus-visible,
.dpv__primary-btn:focus-visible,
.dpv__cluster-item:focus-visible,
.dpv__input:focus-visible,
.dpv__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.dpv__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.dpv__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.dpv__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.dpv__empty-banner {
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

.dpv__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.dpv__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.dpv__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.dpv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.dpv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dpv__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dpv__segments,
.dpv__chip-group,
.dpv__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.dpv__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.dpv__inputs-row {
	align-items: flex-end;
}

.dpv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dpv__field-grow {
	flex: 1 1 200px;
}

.dpv__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dpv__input {
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

.dpv__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
	font-variant-numeric: tabular-nums;
}

.dpv__num-cell {
	font-variant-numeric: tabular-nums;
}

.dpv__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 560px) {
	.dpv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.dpv__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.dpv__kpi {
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

.dpv__kpi-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.dpv__kpi-val {
	font-size: 0.98rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.dpv__kpi-val.is-accent {
	color: #0b4a8b;
}

.dpv__kpi-val.is-warn {
	color: #7c4a03;
}

.dpv__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 12px;
}

@media (min-width: 1080px) {
	.dpv__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.dpv__list-pane,
.dpv__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dpv__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.dpv__pane-title {
	font-size: 0.86rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

.dpv__cluster-list,
.dpv__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dpv__cluster-item {
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

.dpv__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.dpv__cluster-top,
.dpv__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dpv__cluster-name,
.dpv__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.dpv__cluster-path,
.dpv__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dpv__cluster-meta,
.dpv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dpv__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.dpv__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.dpv__pill.is-risk-master-protected,
.dpv__pill.is-risk-unverified-design-master,
.dpv__pill.is-risk-shielded,
.dpv__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.dpv__pill.is-risk-font-vault-anchor,
.dpv__pill.is-risk-consolidatable,
.dpv__pill.is-risk-design-master-verified,
.dpv__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.dpv__pill.is-risk-reclaimable,
.dpv__pill.is-reclaim,
.dpv__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.dpv__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.dpv__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.dpv__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dpv__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dpv__inspector-actions,
.dpv__override-bar,
.dpv__member-badges,
.dpv__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dpv__companion-chip {
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

.dpv__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.dpv__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dpv__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dpv__meta-grid {
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
	.dpv__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.dpv__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.dpv__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.dpv__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.dpv__member-card {
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

.dpv__member-card.is-verdict-keep-canonical-survivor,
.dpv__member-card.is-verdict-reclaim-superseded-proof-pdf,
.dpv__member-card.is-verdict-reclaim-stale-creative-cache {
	border-inline-start: 4px solid #0f5132;
}

.dpv__member-card.is-verdict-consolidate-to-font-vault,
.dpv__member-card.is-verdict-consolidate-to-studio-anchor {
	border-inline-start: 4px solid #0b4a8b;
}

.dpv__member-card.is-verdict-blocked-master-layout-source,
.dpv__member-card.is-verdict-blocked-font-library-anchor {
	border-inline-start: 4px solid #842029;
}

.dpv__member-card.is-verdict-blocked-unverified-design-master,
.dpv__member-card.is-verdict-blocked-active-creative-lock,
.dpv__member-card.is-verdict-blocked-recent-bat-proof,
.dpv__member-card.is-verdict-blocked-strategy-scope,
.dpv__member-card.is-verdict-blocked-manual-shield,
.dpv__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.dpv__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.dpv__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.dpv__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	padding-block: 6px;
	font-weight: 700;
	font-size: 0.86rem;
	line-height: 1.4;
	cursor: pointer;
}

.dpv__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.dpv__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dpv__code-pre {
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

.dpv__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
