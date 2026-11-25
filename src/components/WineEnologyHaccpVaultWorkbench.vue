<template>
	<section
		class="wine-enology-haccp-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Wine Enology, Brewery Fermentation and Food-Safety HACCP Vault Auditor')">
		<header class="weh__toolbar">
			<div class="weh__title-group">
				<h3 class="weh__title">
					{{ t('duplicatefinder', 'Wine Enology, Brewery Fermentation & HACCP Vault Auditor') }}
				</h3>
				<span
					class="weh__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {reg} haccp-ttb, {masters} cellar-lab, {hold} recall-hold, {exports} enology-export, {scratch} cellar-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						reg: analysis.summary.totalRegulatoryHaccpClusters,
						masters: analysis.summary.totalEnologyMasterClusters,
						hold: analysis.summary.totalRecallHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalScratchClusters,
					}) }}
				</span>
			</div>

			<div class="weh__toolbar-actions">
				<button
					type="button"
					class="weh__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="weh__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="weh__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="weh__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="weh__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+W"
					:title="t('duplicatefinder', 'Hide Wine Enology, Brewery Fermentation and Food-Safety HACCP Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Wine & HACCP') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="weh__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="weh__kpis">
			<div class="weh__kpi">
				<span class="weh__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="weh__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="weh__kpi">
				<span class="weh__kpi-label">{{ t('duplicatefinder', 'Conserved HACCP, Masters & Holds') }}</span>
				<strong class="weh__kpi-val is-warn">
					{{ analysis.summary.totalRegulatoryHaccpClusters }} {{ t('duplicatefinder', 'haccp/ttb') }} / {{ analysis.summary.totalEnologyMasterClusters }} {{ t('duplicatefinder', 'cellar/lab') }} / {{ analysis.summary.totalRecallHoldClusters }} {{ t('duplicatefinder', 'recall-hold') }}
				</strong>
			</div>
			<div class="weh__kpi">
				<span class="weh__kpi-label">{{ t('duplicatefinder', 'Derived Exports & Cellar Scratch') }}</span>
				<strong class="weh__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'enology-export') }} / {{ analysis.summary.totalScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="weh__kpi">
				<span class="weh__kpi-label">{{ t('duplicatefinder', 'Wine & HACCP Duplicate Footprint') }}</span>
				<strong class="weh__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="weh__empty-banner"
			role="note">
			<div class="weh__empty-text">
				<p class="weh__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure HACCP/TTB/OIV, Cellar/Brewhouse/Lab Master, and Recall Hold shields before scanning') }}
				</p>
				<p class="weh__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit FSMA 204 recall holds, TTB excise manifests, OIV VI-1 records, Cellar Brix/Plato telemetry, FTIR/HPLC masters, and viewer scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="weh__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="weh__controls">
			<div class="weh__control-row">
				<span class="weh__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="weh__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Wine Enology, Brewery and HACCP vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="weh__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="weh__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="weh__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="weh__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="weh__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="weh__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="weh__seg-btn"
					:class="{ 'is-active': protectRegulatoryAndHaccpHolds }"
					:aria-pressed="protectRegulatoryAndHaccpHolds ? 'true' : 'false'"
					@click="protectRegulatoryAndHaccpHolds = !protectRegulatoryAndHaccpHolds">
					<span>{{ protectRegulatoryAndHaccpHolds ? t('duplicatefinder', 'Shield HACCP / TTB / OIV: ON') : t('duplicatefinder', 'Shield HACCP / TTB / OIV: OFF') }}</span>
				</button>

				<button
					type="button"
					class="weh__seg-btn"
					:class="{ 'is-active': protectEnologyMasters }"
					:aria-pressed="protectEnologyMasters ? 'true' : 'false'"
					@click="protectEnologyMasters = !protectEnologyMasters">
					<span>{{ protectEnologyMasters ? t('duplicatefinder', 'Shield Cellar / Lab Masters: ON') : t('duplicatefinder', 'Shield Cellar / Lab Masters: OFF') }}</span>
				</button>

				<button
					type="button"
					class="weh__seg-btn"
					:class="{ 'is-active': protectRecallQuarantineHolds }"
					:aria-pressed="protectRecallQuarantineHolds ? 'true' : 'false'"
					@click="protectRecallQuarantineHolds = !protectRecallQuarantineHolds">
					<span>{{ protectRecallQuarantineHolds ? t('duplicatefinder', 'Shield Recall Holds: ON') : t('duplicatefinder', 'Shield Recall Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="weh__seg-btn"
					:class="{ 'is-active': requireEnologyMasterAnchorForPrune }"
					:aria-pressed="requireEnologyMasterAnchorForPrune ? 'true' : 'false'"
					@click="requireEnologyMasterAnchorForPrune = !requireEnologyMasterAnchorForPrune">
					<span>{{ requireEnologyMasterAnchorForPrune ? t('duplicatefinder', 'Require Enology Anchor: ON') : t('duplicatefinder', 'Require Enology Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="weh__control-row weh__inputs-row">
				<label class="weh__field">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="weh__input">
						<option value="prune-exports-and-cellar-scratch">{{ t('duplicatefinder', 'Prune Exports & Cellar/Lab Scratch') }}</option>
						<option value="hardlink-immutable-enology-masters">{{ t('duplicatefinder', 'Hardlink Immutable Cellar/FTIR/HPLC (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-cellar-scratch">{{ t('duplicatefinder', 'Quarantine Exports & Cellar/Lab Scratch') }}</option>
					</select>
				</label>

				<label class="weh__field">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="weh__input">
						<option value="haccp-enology-master-first">{{ t('duplicatefinder', 'HACCP/TTB & Cellar/Lab masters first') }}</option>
						<option value="oldest-vintage-capture-first">{{ t('duplicatefinder', 'Oldest vintage/fermentation capture first') }}</option>
						<option value="newest-lot-run-first">{{ t('duplicatefinder', 'Newest lot run first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="weh__field">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Scratch Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="weh__input weh__num-input">
				</label>

				<label class="weh__field">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="weh__input weh__num-input">
				</label>

				<label class="weh__field weh__field-grow">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Filter Cellar, Brewhouse, FTIR, HACCP or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="weh__input"
						:placeholder="t('duplicatefinder', 'e.g. ferm, brix, plato, ftir, hplc, haccp, ttb, oiv, recall, cellar_scada_tmp')">
				</label>

				<label class="weh__field">
					<span class="weh__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="weh__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="weh__control-row">
				<span class="weh__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="weh__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Wine Enology, Brewery and HACCP artifact family filter')">
					<button
						type="button"
						class="weh__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="weh__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="weh__control-row">
				<span class="weh__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="weh__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Wine Enology, Brewery and HACCP governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="weh__seg-btn"
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
			class="weh__empty-filter"
			role="note">
			<p class="weh__empty-title">
				{{ t('duplicatefinder', 'No HACCP/TTB/OIV records, recall holds, Cellar/Brewhouse/Lab masters, derived exports, or scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="weh__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="weh__workspace">
			<div
				class="weh__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Wine Enology, Brewery Fermentation and HACCP vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="weh__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="weh__cluster-top">
						<strong class="weh__cluster-name">{{ cluster.name }}</strong>
						<span
							class="weh__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="weh__cluster-meta">
						<span
							v-if="cluster.enologyToolchain"
							class="weh__tag">{{ cluster.enologyToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="weh__tag">{{ cluster.workflowStage }}</span>
						<span class="weh__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="weh__cluster-badges">
						<span
							v-if="cluster.hasRedundantEnologyExport"
							class="weh__badge is-redundant">
							{{ cluster.hasEnologyMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedRecallHold"
							class="weh__badge is-keep">
							{{ t('duplicatefinder', 'Recall Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRegulatoryHaccp"
							class="weh__badge is-keep">
							{{ t('duplicatefinder', 'HACCP / TTB Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedEnologyMaster"
							class="weh__badge is-consolidate">
							{{ t('duplicatefinder', 'Cellar / Lab Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasCellarLabScratch"
							class="weh__badge is-warn">
							{{ t('duplicatefinder', 'Cellar / Lab Scratch') }}
						</span>
					</div>
					<div class="weh__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="weh__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="weh__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="weh__inspector">
				<header class="weh__inspector-head">
					<div class="weh__inspector-title-wrap">
						<h4 class="weh__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="weh__inspector-sub">
							{{ selectedCluster.enologyToolchain || selectedCluster.wineStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="weh__inspector-actions">
						<button
							type="button"
							class="weh__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="weh__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="weh__lineage-grid">
					<div class="weh__lineage-item">
						<span class="weh__lineage-label">{{ t('duplicatefinder', 'Lot Stem & Enology Toolchain') }}</span>
						<strong class="weh__lineage-val">{{ selectedCluster.enologyToolchain ? `${selectedCluster.enologyToolchain} / ` : '' }}{{ selectedCluster.wineStem }} ({{ selectedCluster.wineAnchorKey }})</strong>
					</div>
					<div class="weh__lineage-item">
						<span class="weh__lineage-label">{{ t('duplicatefinder', 'Food-Safety, Excise & Master Governance') }}</span>
						<strong class="weh__lineage-val">
							{{ selectedCluster.hasProtectedRecallHold ? t('duplicatefinder', 'FSMA 204, Allergen, or TCA Recall Quarantine Hold Shielded') : (selectedCluster.hasProtectedRegulatoryHaccp ? t('duplicatefinder', 'HACCP CCP, TTB Excise, or OIV VI-1 Baseline Shielded') : (selectedCluster.hasProtectedEnologyMaster ? t('duplicatefinder', 'Verified Cellar, Brewhouse, or FTIR/HPLC Master Shielded') : t('duplicatefinder', 'Cellar/Lab Scratch or Derived Tasting/Brix Export'))) }}
						</strong>
					</div>
					<div class="weh__lineage-item">
						<span class="weh__lineage-label">{{ t('duplicatefinder', 'Cellar / Brewhouse / Lab Anchor') }}</span>
						<strong class="weh__lineage-val">
							{{ selectedCluster.hasEnologyMasterAnchor ? t('duplicatefinder', 'Verified Cellar, Brewhouse, or Lab Master Anchor Found') : t('duplicatefinder', 'No Enology or Lab Master Anchor Detected') }}
						</strong>
					</div>
					<div class="weh__lineage-item">
						<span class="weh__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="weh__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="weh__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="weh__member-card">
						<div class="weh__member-top">
							<code class="weh__member-path">{{ member.normalized }}</code>
							<div class="weh__member-pills">
								<span
									v-if="member.isRedundantEnologyExportMember"
									class="weh__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="weh__pill is-warn">
									{{ t('duplicatefinder', 'CELLAR / LAB SCRATCH') }}
								</span>
								<span
									class="weh__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.wineTag"
									class="weh__pill is-consolidate">
									{{ member.wineTag }}
								</span>
								<span
									class="weh__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="weh__member-bottom">
							<div class="weh__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="weh__member-actions">
								<button
									type="button"
									class="weh__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantEnologyExportMember) && !(member.isProtectedRecallHold && protectRecallQuarantineHolds) && !(member.isProtectedRegulatoryHaccp && protectRegulatoryAndHaccpHolds) && !(member.isProtectedEnologyMaster && protectEnologyMasters)"
									class="weh__override-field">
									<span class="weh__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="weh__override-select"
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

				<div class="weh__code-panels">
					<div class="weh__code-box">
						<div class="weh__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="weh__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="weh__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="weh__code-box">
						<div class="weh__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="weh__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="weh__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	WINE_ENOLOGY_HACCP_PRESETS,
	auditWineEnologyHaccpVault,
	buildWineEnologyHaccpCsvReport,
	buildWineEnologyHaccpJsonManifest,
	buildWineEnologyHaccpRemediationScript,
	buildWineEnologyHaccpSyncExcludeList,
} from '../tools/wineEnologyHaccpVaultAuditor'

export default {
	name: 'WineEnologyHaccpVaultWorkbench',
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
			presetId: 'all-wine-enology-haccp-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-cellar-scratch',
			survivorRule: 'haccp-enology-master-first',
			protectRegulatoryAndHaccpHolds: true,
			protectEnologyMasters: true,
			protectRecallQuarantineHolds: true,
			requireEnologyMasterAnchorForPrune: true,
			keepRecentRunDaysInput: '0',
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
			return WINE_ENOLOGY_HACCP_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'enology-export-redundant', label: this.t('duplicatefinder', 'Tasting / Lab Exports') },
				{ id: 'cellar-ferm-scratch', label: this.t('duplicatefinder', 'Cellar / Lab Scratch') },
				{ id: 'wine-haccp-regulatory-protected', label: this.t('duplicatefinder', 'HACCP / TTB / OIV') },
				{ id: 'enology-fermentation-master-protected', label: this.t('duplicatefinder', 'Cellar / Lab Masters') },
				{ id: 'recall-quarantine-hold-protected', label: this.t('duplicatefinder', 'Recall Hold') },
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
		parsedKeepRecentRunDays() {
			const trimmed = String(this.keepRecentRunDaysInput ?? '').trim()
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
			return auditWineEnologyHaccpVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectRegulatoryAndHaccpHolds: this.protectRegulatoryAndHaccpHolds,
				protectEnologyMasters: this.protectEnologyMasters,
				protectRecallQuarantineHolds: this.protectRecallQuarantineHolds,
				requireEnologyMasterAnchorForPrune: this.requireEnologyMasterAnchorForPrune,
				keepRecentRunDays: this.parsedKeepRecentRunDays,
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
			return buildWineEnologyHaccpRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildWineEnologyHaccpSyncExcludeList()
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
			const preset = WINE_ENOLOGY_HACCP_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectRegulatoryAndHaccpHolds = preset.protectRegulatoryAndHaccpHolds
			this.protectEnologyMasters = preset.protectEnologyMasters
			this.protectRecallQuarantineHolds = preset.protectRecallQuarantineHolds
			this.requireEnologyMasterAnchorForPrune = preset.requireEnologyMasterAnchorForPrune
			this.keepRecentRunDaysInput = String(preset.keepRecentRunDays)
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
				'wine-haccp-regulatory-protected': this.t('duplicatefinder', 'HACCP / TTB / OIV'),
				'enology-fermentation-master-protected': this.t('duplicatefinder', 'Cellar / Lab Master'),
				'recall-quarantine-hold-protected': this.t('duplicatefinder', 'Recall Hold'),
				'enology-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'cellar-ferm-scratch': this.t('duplicatefinder', 'Cellar / Lab Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'enology-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'wine-haccp-regulatory-protected' || verdict === 'recall-quarantine-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'enology-fermentation-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'cellar-ferm-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantEnologyExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-cellar-scratch' && (member.isRedundantEnologyExport || member.isScratchPath))
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
			return cluster.sourceGroup
				|| cluster.group
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
				this.setNotice(this.t('duplicatefinder', 'Copied Wine Enology, Brewery or HACCP vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Wine Enology, Brewery & HACCP remediation script to clipboard.'))
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
			const csv = buildWineEnologyHaccpCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-wine-enology-haccp-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Wine Enology, Brewery & HACCP Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildWineEnologyHaccpJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-wine-enology-haccp-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Wine Enology, Brewery & HACCP Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.wine-enology-haccp-vault-workbench {
	container-type: inline-size;
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

.weh__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.weh__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.weh__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.weh__status-badge {
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

.weh__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.weh__tool-btn,
.weh__seg-btn,
.weh__primary-btn,
.weh__load-more-btn,
.weh__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	max-inline-size: 100%;
	text-align: center;
	overflow-wrap: anywhere;
}

.weh__tool-btn.is-primary-outline,
.weh__primary-btn {
	border-color: var(--color-primary-element);
}

.weh__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.weh__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.weh__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.weh__tool-btn:focus-visible,
.weh__seg-btn:focus-visible,
.weh__primary-btn:focus-visible,
.weh__load-more-btn:focus-visible,
.weh__mini-btn:focus-visible,
.weh__cluster-card:focus-visible,
.weh__input:focus-visible,
.weh__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.weh__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.weh__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.weh__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.weh__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.weh__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.weh__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.weh__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.weh__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.weh__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.weh__empty-banner,
.weh__empty-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.weh__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.weh__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.weh__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.weh__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.weh__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.weh__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.weh__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.weh__inputs-row {
	align-items: flex-end;
}

.weh__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.weh__field-grow {
	flex: 1 1 220px;
}

.weh__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.weh__input,
.weh__override-select {
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
	min-inline-size: 0;
}

.weh__num-input {
	inline-size: 96px;
}

.weh__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.weh__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.weh__cluster-card {
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

.weh__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.weh__cluster-top,
.weh__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.weh__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.weh__cluster-meta,
.weh__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.weh__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.weh__badge,
.weh__pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.weh__pill.is-keep,
.weh__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.weh__pill.is-redundant,
.weh__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.weh__pill.is-consolidate,
.weh__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.weh__pill.is-warn,
.weh__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.weh__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.weh__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.weh__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.weh__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.weh__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.weh__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.weh__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.weh__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.weh__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.weh__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.weh__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.weh__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.weh__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.weh__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.weh__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.weh__member-top,
.weh__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.weh__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.weh__member-pills,
.weh__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.weh__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.weh__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.weh__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.weh__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.weh__pre {
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

.weh__sr-only {
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

@container (max-width: 1020px) {
	.weh__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.weh__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.weh__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.weh__kpis,
	.weh__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.weh__num-input {
		inline-size: 100%;
	}

	.weh__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.weh__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.weh__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.weh__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.wine-enology-haccp-vault-workbench {
		padding: 10px;
	}

	.weh__kpis,
	.weh__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.weh__num-input {
		inline-size: 100%;
	}

	.weh__field {
		flex: 1 1 100%;
	}
}
</style>
