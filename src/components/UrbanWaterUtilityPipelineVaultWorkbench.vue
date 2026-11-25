<template>
	<section
		class="urban-water-utility-pipeline-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Urban Water Utility, Hydraulic Network and Pipeline Telemetry Vault Auditor')">
		<header class="uwp__toolbar">
			<div class="uwp__title-group">
				<h3 class="uwp__title">
					{{ t('duplicatefinder', 'Urban Water Utility, Hydraulic & Pipeline Vault Auditor') }}
				</h3>
				<span
					class="uwp__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {comp} epa-epanet, {masters} ami-ili, {hold} integrity-hold, {exports} utility-export, {scratch} solver-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						comp: analysis.summary.totalComplianceModelClusters,
						masters: analysis.summary.totalTelemetryMasterClusters,
						hold: analysis.summary.totalSafetyHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalSolverScratchClusters,
					}) }}
				</span>
			</div>

			<div class="uwp__toolbar-actions">
				<button
					type="button"
					class="uwp__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="uwp__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="uwp__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="uwp__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="uwp__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+U"
					:title="t('duplicatefinder', 'Hide Urban Water Utility, Hydraulic Network and Pipeline Telemetry Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Water & Pipeline') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="uwp__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="uwp__kpis">
			<div class="uwp__kpi">
				<span class="uwp__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="uwp__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="uwp__kpi">
				<span class="uwp__kpi-label">{{ t('duplicatefinder', 'Conserved EPA, Masters & Holds') }}</span>
				<strong class="uwp__kpi-val is-warn">
					{{ analysis.summary.totalComplianceModelClusters }} {{ t('duplicatefinder', 'epa/epanet') }} / {{ analysis.summary.totalTelemetryMasterClusters }} {{ t('duplicatefinder', 'ami/ili') }} / {{ analysis.summary.totalSafetyHoldClusters }} {{ t('duplicatefinder', 'integrity-hold') }}
				</strong>
			</div>
			<div class="uwp__kpi">
				<span class="uwp__kpi-label">{{ t('duplicatefinder', 'Derived Exports & Solver Scratch') }}</span>
				<strong class="uwp__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'flow/gis') }} / {{ analysis.summary.totalSolverScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="uwp__kpi">
				<span class="uwp__kpi-label">{{ t('duplicatefinder', 'Water & Pipeline Duplicate Footprint') }}</span>
				<strong class="uwp__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="uwp__empty-banner"
			role="note">
			<div class="uwp__empty-text">
				<p class="uwp__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure EPA/EPANET, AMI/ILI Master, and Pipeline Integrity shields before scanning') }}
				</p>
				<p class="uwp__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit PHMSA/SDWA regulatory holds, EPANET/SWMM/InfoWorks models, AMI/DLMS/ILI/leak masters, flow/GIS exports, and solver scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="uwp__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="uwp__controls">
			<div class="uwp__control-row">
				<span class="uwp__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="uwp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Urban Water and Pipeline vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="uwp__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="uwp__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="uwp__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="uwp__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="uwp__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="uwp__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="uwp__seg-btn"
					:class="{ 'is-active': protectComplianceAndEpanetModels }"
					:aria-pressed="protectComplianceAndEpanetModels ? 'true' : 'false'"
					@click="protectComplianceAndEpanetModels = !protectComplianceAndEpanetModels">
					<span>{{ protectComplianceAndEpanetModels ? t('duplicatefinder', 'Shield EPA / EPANET / SWMM: ON') : t('duplicatefinder', 'Shield EPA / EPANET / SWMM: OFF') }}</span>
				</button>

				<button
					type="button"
					class="uwp__seg-btn"
					:class="{ 'is-active': protectAmiAndPipelineMasters }"
					:aria-pressed="protectAmiAndPipelineMasters ? 'true' : 'false'"
					@click="protectAmiAndPipelineMasters = !protectAmiAndPipelineMasters">
					<span>{{ protectAmiAndPipelineMasters ? t('duplicatefinder', 'Shield AMI / Leak / ILI: ON') : t('duplicatefinder', 'Shield AMI / Leak / ILI: OFF') }}</span>
				</button>

				<button
					type="button"
					class="uwp__seg-btn"
					:class="{ 'is-active': protectPipelineSafetyHolds }"
					:aria-pressed="protectPipelineSafetyHolds ? 'true' : 'false'"
					@click="protectPipelineSafetyHolds = !protectPipelineSafetyHolds">
					<span>{{ protectPipelineSafetyHolds ? t('duplicatefinder', 'Shield Pipeline Holds: ON') : t('duplicatefinder', 'Shield Pipeline Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="uwp__seg-btn"
					:class="{ 'is-active': requireUtilityAnchorForPrune }"
					:aria-pressed="requireUtilityAnchorForPrune ? 'true' : 'false'"
					@click="requireUtilityAnchorForPrune = !requireUtilityAnchorForPrune">
					<span>{{ requireUtilityAnchorForPrune ? t('duplicatefinder', 'Require Water / ILI Anchor: ON') : t('duplicatefinder', 'Require Water / ILI Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="uwp__control-row uwp__inputs-row">
				<label class="uwp__field">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="uwp__input">
						<option value="prune-exports-and-utility-scratch">{{ t('duplicatefinder', 'Prune Exports & Solver Scratch') }}</option>
						<option value="hardlink-immutable-ami-and-ili">{{ t('duplicatefinder', 'Hardlink Immutable AMI/ILI/DNP3 (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-utility-scratch">{{ t('duplicatefinder', 'Quarantine Exports & Solver Scratch') }}</option>
					</select>
				</label>

				<label class="uwp__field">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="uwp__input">
						<option value="regulatory-epanet-master-first">{{ t('duplicatefinder', 'EPA/EPANET & AMI/ILI masters first') }}</option>
						<option value="oldest-telemetry-capture-first">{{ t('duplicatefinder', 'Oldest telemetry capture first') }}</option>
						<option value="newest-calibration-run-first">{{ t('duplicatefinder', 'Newest calibration run first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="uwp__field">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Solver Run Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="uwp__input uwp__num-input">
				</label>

				<label class="uwp__field">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="uwp__input uwp__num-input">
				</label>

				<label class="uwp__field uwp__field-grow">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Filter EPANET, AMI, ILI, Leak or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="uwp__input"
						:placeholder="t('duplicatefinder', 'e.g. epanet, swmm, sdwis, ami, dlms, ili, mfl, cor, epanet_tmp, ami_spool')">
				</label>

				<label class="uwp__field">
					<span class="uwp__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="uwp__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="uwp__control-row">
				<span class="uwp__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="uwp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Urban Water and Pipeline artifact family filter')">
					<button
						type="button"
						class="uwp__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="uwp__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="uwp__control-row">
				<span class="uwp__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="uwp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Urban Water and Pipeline governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="uwp__seg-btn"
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
			class="uwp__empty-filter"
			role="note">
			<p class="uwp__empty-title">
				{{ t('duplicatefinder', 'No EPA/EPANET models, integrity holds, AMI/ILI/leak masters, utility exports, or solver scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="uwp__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="uwp__workspace">
			<div
				class="uwp__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Urban Water Utility, Hydraulic and Pipeline vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="uwp__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="uwp__cluster-top">
						<strong class="uwp__cluster-name">{{ cluster.name }}</strong>
						<span
							class="uwp__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="uwp__cluster-meta">
						<span
							v-if="cluster.utilityToolchain"
							class="uwp__tag">{{ cluster.utilityToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="uwp__tag">{{ cluster.workflowStage }}</span>
						<span class="uwp__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="uwp__cluster-badges">
						<span
							v-if="cluster.hasRedundantUtilityExport"
							class="uwp__badge is-redundant">
							{{ cluster.hasUtilityMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedSafetyHold"
							class="uwp__badge is-keep">
							{{ t('duplicatefinder', 'Pipeline Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedComplianceModel"
							class="uwp__badge is-keep">
							{{ t('duplicatefinder', 'EPA / EPANET Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedTelemetryMaster"
							class="uwp__badge is-consolidate">
							{{ t('duplicatefinder', 'AMI / Leak / ILI Conserved') }}
						</span>
						<span
							v-if="cluster.hasHydraulicSolverScratch"
							class="uwp__badge is-warn">
							{{ t('duplicatefinder', 'EPANET / AMI Scratch') }}
						</span>
					</div>
					<div class="uwp__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="uwp__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="uwp__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="uwp__inspector">
				<header class="uwp__inspector-head">
					<div class="uwp__inspector-title-wrap">
						<h4 class="uwp__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="uwp__inspector-sub">
							{{ selectedCluster.utilityToolchain || selectedCluster.pipelineStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="uwp__inspector-actions">
						<button
							type="button"
							class="uwp__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="uwp__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="uwp__lineage-grid">
					<div class="uwp__lineage-item">
						<span class="uwp__lineage-label">{{ t('duplicatefinder', 'Zone Stem & Utility Toolchain') }}</span>
						<strong class="uwp__lineage-val">{{ selectedCluster.utilityToolchain ? `${selectedCluster.utilityToolchain} / ` : '' }}{{ selectedCluster.pipelineStem }} ({{ selectedCluster.utilityAnchorKey }})</strong>
					</div>
					<div class="uwp__lineage-item">
						<span class="uwp__lineage-label">{{ t('duplicatefinder', 'Compliance, Model & Hold Governance') }}</span>
						<strong class="uwp__lineage-val">
							{{ selectedCluster.hasProtectedSafetyHold ? t('duplicatefinder', 'PHMSA Integrity, EPA Consent Decree or SDWA Hold Shielded') : (selectedCluster.hasProtectedComplianceModel ? t('duplicatefinder', 'EPA SDWIS/NPDES Submittal or EPANET/SWMM Model Shielded') : (selectedCluster.hasProtectedTelemetryMaster ? t('duplicatefinder', 'Verified AMI/DLMS, Acoustic Leak, ILI or DNP3 Master Shielded') : t('duplicatefinder', 'EPANET/SWMM/AMI Scratch or Derived Utility Export'))) }}
						</strong>
					</div>
					<div class="uwp__lineage-item">
						<span class="uwp__lineage-label">{{ t('duplicatefinder', 'Water / AMI / ILI Master Anchor') }}</span>
						<strong class="uwp__lineage-val">
							{{ selectedCluster.hasUtilityMasterAnchor ? t('duplicatefinder', 'Verified EPANET, AMI, Acoustic Leak or ILI Anchor Found') : t('duplicatefinder', 'No Water Utility or Pipeline Anchor Detected') }}
						</strong>
					</div>
					<div class="uwp__lineage-item">
						<span class="uwp__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="uwp__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="uwp__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="uwp__member-card">
						<div class="uwp__member-top">
							<code class="uwp__member-path">{{ member.normalized }}</code>
							<div class="uwp__member-pills">
								<span
									v-if="member.isRedundantUtilityExportMember"
									class="uwp__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="uwp__pill is-warn">
									{{ t('duplicatefinder', 'SOLVER / AMI SCRATCH') }}
								</span>
								<span
									class="uwp__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.utilityTag"
									class="uwp__pill is-consolidate">
									{{ member.utilityTag }}
								</span>
								<span
									class="uwp__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="uwp__member-bottom">
							<div class="uwp__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="uwp__member-actions">
								<button
									type="button"
									class="uwp__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantUtilityExportMember) && !(member.isProtectedSafetyHold && protectPipelineSafetyHolds) && !(member.isProtectedComplianceModel && protectComplianceAndEpanetModels) && !(member.isProtectedTelemetryMaster && protectAmiAndPipelineMasters)"
									class="uwp__override-field">
									<span class="uwp__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="uwp__override-select"
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

				<div class="uwp__code-panels">
					<div class="uwp__code-box">
						<div class="uwp__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="uwp__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="uwp__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="uwp__code-box">
						<div class="uwp__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="uwp__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="uwp__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	URBAN_WATER_UTILITY_PIPELINE_PRESETS,
	auditUrbanWaterUtilityPipelineVault,
	buildUrbanWaterUtilityPipelineCsvReport,
	buildUrbanWaterUtilityPipelineJsonManifest,
	buildUrbanWaterUtilityPipelineRemediationScript,
	buildUrbanWaterUtilityPipelineSyncExcludeList,
} from '../tools/urbanWaterUtilityPipelineVaultAuditor'

export default {
	name: 'UrbanWaterUtilityPipelineVaultWorkbench',
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
			presetId: 'all-urban-water-utility-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-utility-scratch',
			survivorRule: 'regulatory-epanet-master-first',
			protectComplianceAndEpanetModels: true,
			protectAmiAndPipelineMasters: true,
			protectPipelineSafetyHolds: true,
			requireUtilityAnchorForPrune: true,
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
			return URBAN_WATER_UTILITY_PIPELINE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'utility-export-redundant', label: this.t('duplicatefinder', 'Flow / GIS Exports') },
				{ id: 'hydraulic-solver-scratch', label: this.t('duplicatefinder', 'EPANET / AMI Scratch') },
				{ id: 'water-regulatory-epanet-protected', label: this.t('duplicatefinder', 'EPA / EPANET') },
				{ id: 'ami-pipeline-master-protected', label: this.t('duplicatefinder', 'AMI / Leak / ILI') },
				{ id: 'pipeline-safety-hold-protected', label: this.t('duplicatefinder', 'Pipeline Hold') },
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
			return auditUrbanWaterUtilityPipelineVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectComplianceAndEpanetModels: this.protectComplianceAndEpanetModels,
				protectAmiAndPipelineMasters: this.protectAmiAndPipelineMasters,
				protectPipelineSafetyHolds: this.protectPipelineSafetyHolds,
				requireUtilityAnchorForPrune: this.requireUtilityAnchorForPrune,
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
			return buildUrbanWaterUtilityPipelineRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildUrbanWaterUtilityPipelineSyncExcludeList()
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
			const preset = URBAN_WATER_UTILITY_PIPELINE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectComplianceAndEpanetModels = preset.protectComplianceAndEpanetModels
			this.protectAmiAndPipelineMasters = preset.protectAmiAndPipelineMasters
			this.protectPipelineSafetyHolds = preset.protectPipelineSafetyHolds
			this.requireUtilityAnchorForPrune = preset.requireUtilityAnchorForPrune
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
				'water-regulatory-epanet-protected': this.t('duplicatefinder', 'EPA / EPANET'),
				'ami-pipeline-master-protected': this.t('duplicatefinder', 'AMI / Leak / ILI'),
				'pipeline-safety-hold-protected': this.t('duplicatefinder', 'Pipeline Hold'),
				'utility-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'hydraulic-solver-scratch': this.t('duplicatefinder', 'Solver / AMI Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'utility-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'water-regulatory-epanet-protected' || verdict === 'pipeline-safety-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'ami-pipeline-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'hydraulic-solver-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantUtilityExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-utility-scratch' && (member.isRedundantUtilityExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Urban Water or Pipeline vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Urban Water & Pipeline remediation script to clipboard.'))
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
			const csv = buildUrbanWaterUtilityPipelineCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-urban-water-utility-pipeline-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Urban Water & Pipeline Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildUrbanWaterUtilityPipelineJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-urban-water-utility-pipeline-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Urban Water & Pipeline Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.urban-water-utility-pipeline-vault-workbench {
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

.uwp__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.uwp__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.uwp__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.uwp__status-badge {
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

.uwp__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.uwp__tool-btn,
.uwp__seg-btn,
.uwp__primary-btn,
.uwp__load-more-btn,
.uwp__mini-btn {
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

.uwp__tool-btn.is-primary-outline,
.uwp__primary-btn {
	border-color: var(--color-primary-element);
}

.uwp__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.uwp__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.uwp__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.uwp__tool-btn:focus-visible,
.uwp__seg-btn:focus-visible,
.uwp__primary-btn:focus-visible,
.uwp__load-more-btn:focus-visible,
.uwp__mini-btn:focus-visible,
.uwp__cluster-card:focus-visible,
.uwp__input:focus-visible,
.uwp__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.uwp__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.uwp__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.uwp__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.uwp__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.uwp__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.uwp__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.uwp__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.uwp__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.uwp__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.uwp__empty-banner,
.uwp__empty-filter {
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

.uwp__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.uwp__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.uwp__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.uwp__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.uwp__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.uwp__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.uwp__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.uwp__inputs-row {
	align-items: flex-end;
}

.uwp__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.uwp__field-grow {
	flex: 1 1 220px;
}

.uwp__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.uwp__input,
.uwp__override-select {
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

.uwp__num-input {
	inline-size: 96px;
}

.uwp__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.uwp__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.uwp__cluster-card {
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

.uwp__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.uwp__cluster-top,
.uwp__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.uwp__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.uwp__cluster-meta,
.uwp__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.uwp__tag {
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

.uwp__badge,
.uwp__pill {
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

.uwp__pill.is-keep,
.uwp__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.uwp__pill.is-redundant,
.uwp__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.uwp__pill.is-consolidate,
.uwp__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.uwp__pill.is-warn,
.uwp__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.uwp__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.uwp__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.uwp__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.uwp__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.uwp__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.uwp__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.uwp__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.uwp__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.uwp__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.uwp__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.uwp__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.uwp__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.uwp__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.uwp__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.uwp__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.uwp__member-top,
.uwp__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.uwp__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.uwp__member-pills,
.uwp__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.uwp__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.uwp__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.uwp__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.uwp__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.uwp__pre {
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

.uwp__sr-only {
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
	.uwp__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.uwp__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.uwp__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.uwp__kpis,
	.uwp__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.uwp__num-input {
		inline-size: 100%;
	}

	.uwp__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.uwp__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.uwp__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.uwp__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.urban-water-utility-pipeline-vault-workbench {
		padding: 10px;
	}

	.uwp__kpis,
	.uwp__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.uwp__num-input {
		inline-size: 100%;
	}

	.uwp__field {
		flex: 1 1 100%;
	}
}
</style>
