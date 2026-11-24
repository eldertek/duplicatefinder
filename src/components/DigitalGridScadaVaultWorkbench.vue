<template>
	<section
		class="digital-grid-scada-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Digital Grid, Substation SCADA, Protection Relay and Synchrophasor Vault Auditor')">
		<header class="dgs__toolbar">
			<div class="dgs__title-group">
				<h3 class="dgs__title">
					{{ t('duplicatefinder', 'Digital Grid, Substation SCADA & Synchrophasor Vault Auditor') }}
				</h3>
				<span
					class="dgs__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {cip} nerc-scl, {comtrade} comtrade-pmu, {fault} prc-002, {raw} csv-pl4, {scratch} solver-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						cip: analysis.summary.totalNercCipSclClusters,
						comtrade: analysis.summary.totalComtradePmuClusters,
						fault: analysis.summary.totalFaultEvidenceClusters,
						raw: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalGridScratchClusters,
					}) }}
				</span>
			</div>

			<div class="dgs__toolbar-actions">
				<button
					type="button"
					class="dgs__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dgs__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dgs__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dgs__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="dgs__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+D"
					:title="t('duplicatefinder', 'Hide Digital Grid, Substation SCADA, Protection Relay and Synchrophasor Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Digital Grid Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dgs__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="dgs__kpis">
			<div class="dgs__kpi">
				<span class="dgs__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="dgs__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="dgs__kpi">
				<span class="dgs__kpi-label">{{ t('duplicatefinder', 'Conserved NERC CIP, COMTRADE & PRC-002') }}</span>
				<strong class="dgs__kpi-val is-warn">
					{{ analysis.summary.totalNercCipSclClusters }} {{ t('duplicatefinder', 'nerc/scl') }} / {{ analysis.summary.totalComtradePmuClusters }} {{ t('duplicatefinder', 'comtrade/pmu') }} / {{ analysis.summary.totalFaultEvidenceClusters }} {{ t('duplicatefinder', 'prc-002') }}
				</strong>
			</div>
			<div class="dgs__kpi">
				<span class="dgs__kpi-label">{{ t('duplicatefinder', 'Redundant CSV/PL4 & Solver Scratch') }}</span>
				<strong class="dgs__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'scada-export') }} / {{ analysis.summary.totalGridScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="dgs__kpi">
				<span class="dgs__kpi-label">{{ t('duplicatefinder', 'Raw Digital Grid Duplicate Footprint') }}</span>
				<strong class="dgs__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dgs__empty-banner"
			role="note">
			<div class="dgs__empty-text">
				<p class="dgs__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure NERC CIP, IEC 61850 SCL, and COMTRADE/PMU shields before scanning') }}
				</p>
				<p class="dgs__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit IEC 61850 SCL & relay settings (.scd, .cid, .icd, .rdb, .rio), COMTRADE/PQDIF/PMU & PSS/E/PowerFactory/PSCAD masters (.cff, .cfg/.dat, .pqdif, .pmu, .raw, .pfd, .pscx), SCADA CSV/PL4 exports, and solver scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="dgs__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dgs__controls">
			<div class="dgs__control-row">
				<span class="dgs__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="dgs__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Digital Grid and Substation SCADA vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dgs__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dgs__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dgs__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dgs__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dgs__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dgs__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dgs__seg-btn"
					:class="{ 'is-active': protectNercCipAndScl }"
					:aria-pressed="protectNercCipAndScl ? 'true' : 'false'"
					@click="protectNercCipAndScl = !protectNercCipAndScl">
					<span>{{ protectNercCipAndScl ? t('duplicatefinder', 'Shield NERC CIP/.scd: ON') : t('duplicatefinder', 'Shield NERC CIP/.scd: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dgs__seg-btn"
					:class="{ 'is-active': protectComtradePmuAnchors }"
					:aria-pressed="protectComtradePmuAnchors ? 'true' : 'false'"
					@click="protectComtradePmuAnchors = !protectComtradePmuAnchors">
					<span>{{ protectComtradePmuAnchors ? t('duplicatefinder', 'Shield COMTRADE/PMU: ON') : t('duplicatefinder', 'Shield COMTRADE/PMU: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dgs__seg-btn"
					:class="{ 'is-active': protectFaultEvidence }"
					:aria-pressed="protectFaultEvidence ? 'true' : 'false'"
					@click="protectFaultEvidence = !protectFaultEvidence">
					<span>{{ protectFaultEvidence ? t('duplicatefinder', 'Shield PRC-002 Faults: ON') : t('duplicatefinder', 'Shield PRC-002 Faults: OFF') }}</span>
				</button>

				<button
					type="button"
					class="dgs__seg-btn"
					:class="{ 'is-active': requireComtradeAnchorForPrune }"
					:aria-pressed="requireComtradeAnchorForPrune ? 'true' : 'false'"
					@click="requireComtradeAnchorForPrune = !requireComtradeAnchorForPrune">
					<span>{{ requireComtradeAnchorForPrune ? t('duplicatefinder', 'Require COMTRADE/PMU Anchor: ON') : t('duplicatefinder', 'Require COMTRADE/PMU Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="dgs__control-row dgs__inputs-row">
				<label class="dgs__field">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="dgs__input">
						<option value="prune-exports-and-grid-scratch">{{ t('duplicatefinder', 'Prune Redundant .csv/.pl4 & Scratch') }}</option>
						<option value="hardlink-immutable-comtrade-and-pmu">{{ t('duplicatefinder', 'Hardlink Immutable COMTRADE/PMU (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-grid-scratch">{{ t('duplicatefinder', 'Quarantine SCADA Exports & Scratch') }}</option>
					</select>
				</label>

				<label class="dgs__field">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="dgs__input">
						<option value="scl-comtrade-first">{{ t('duplicatefinder', 'NERC CIP, SCL & COMTRADE first') }}</option>
						<option value="oldest-disturbance-first">{{ t('duplicatefinder', 'Oldest fault capture first') }}</option>
						<option value="newest-relay-revision-first">{{ t('duplicatefinder', 'Newest relay revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="dgs__field">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Event Grace (d)') }}</span>
					<input
						v-model="keepRecentGridEventDaysInput"
						type="number"
						min="0"
						step="1"
						class="dgs__input dgs__num-input">
				</label>

				<label class="dgs__field">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="dgs__input dgs__num-input">
				</label>

				<label class="dgs__field dgs__field-grow">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Filter Substation, Relay, Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="dgs__input"
						:placeholder="t('duplicatefinder', 'e.g. comtrade, scd, pmu, pqdif, psse, pscad, powerfactory, prc-002')">
				</label>

				<label class="dgs__field">
					<span class="dgs__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="dgs__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'SCADA export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="dgs__control-row">
				<span class="dgs__control-label">{{ t('duplicatefinder', 'Grid Family') }}</span>
				<div
					class="dgs__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Digital Grid and Substation SCADA artifact family filter')">
					<button
						type="button"
						class="dgs__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="dgs__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="dgs__control-row">
				<span class="dgs__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="dgs__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Digital Grid governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="dgs__seg-btn"
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
			class="dgs__empty-filter"
			role="note">
			<p class="dgs__empty-title">
				{{ t('duplicatefinder', 'No NERC CIP records, IEC 61850 SCL configs, COMTRADE/PMU masters, SCADA exports, or solver scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="dgs__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="dgs__workspace">
			<div
				class="dgs__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Digital Grid, Substation SCADA and Synchrophasor vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="dgs__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="dgs__cluster-top">
						<strong class="dgs__cluster-name">{{ cluster.name }}</strong>
						<span
							class="dgs__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="dgs__cluster-meta">
						<span
							v-if="cluster.gridToolchain"
							class="dgs__tag">{{ cluster.gridToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="dgs__tag">{{ cluster.workflowStage }}</span>
						<span class="dgs__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="dgs__cluster-badges">
						<span
							v-if="cluster.hasRedundantScadaExport"
							class="dgs__badge is-redundant">
							{{ cluster.hasComtradePmuAnchor
								? t('duplicatefinder', 'Redundant Export (COMTRADE/PMU Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No COMTRADE/PMU Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedFaultEvidence"
							class="dgs__badge is-keep">
							{{ t('duplicatefinder', 'PRC-002 Fault Evidence Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedNercCipScl"
							class="dgs__badge is-keep">
							{{ t('duplicatefinder', 'NERC CIP / IEC 61850 SCL Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedComtradePmu"
							class="dgs__badge is-consolidate">
							{{ t('duplicatefinder', 'COMTRADE / PMU / Grid Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasGridScratchIntermediate"
							class="dgs__badge is-warn">
							{{ t('duplicatefinder', 'Solver / Historian Scratch') }}
						</span>
					</div>
					<div class="dgs__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="dgs__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="dgs__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="dgs__inspector">
				<header class="dgs__inspector-head">
					<div class="dgs__inspector-title-wrap">
						<h4 class="dgs__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="dgs__inspector-sub">
							{{ selectedCluster.gridToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="dgs__inspector-actions">
						<button
							type="button"
							class="dgs__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="dgs__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="dgs__lineage-grid">
					<div class="dgs__lineage-item">
						<span class="dgs__lineage-label">{{ t('duplicatefinder', 'Grid Lineage & Substation Toolchain') }}</span>
						<strong class="dgs__lineage-val">{{ selectedCluster.gridToolchain ? `${selectedCluster.gridToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.gridAnchorKey }})</strong>
					</div>
					<div class="dgs__lineage-item">
						<span class="dgs__lineage-label">{{ t('duplicatefinder', 'NERC CIP & IEC 61850 Governance') }}</span>
						<strong class="dgs__lineage-val">
							{{ selectedCluster.hasProtectedFaultEvidence ? t('duplicatefinder', 'PRC-002 Disturbance & Breaker Trip Evidence Shielded') : (selectedCluster.hasProtectedNercCipScl ? t('duplicatefinder', 'NERC CIP Baseline, IEC 61850 SCL & Relay Config Shielded') : (selectedCluster.hasProtectedComtradePmu ? t('duplicatefinder', 'COMTRADE, PMU Synchrophasor & Grid Model Master Shielded') : t('duplicatefinder', 'Solver Scratch or SCADA Export Artifact'))) }}
						</strong>
					</div>
					<div class="dgs__lineage-item">
						<span class="dgs__lineage-label">{{ t('duplicatefinder', 'COMTRADE / PMU / Grid Model Anchor') }}</span>
						<strong class="dgs__lineage-val">
							{{ selectedCluster.hasComtradePmuAnchor ? t('duplicatefinder', 'Verified COMTRADE, PQDIF, PMU or Grid Model Anchor Found') : t('duplicatefinder', 'No COMTRADE, PMU or Grid Model Anchor Detected') }}
						</strong>
					</div>
					<div class="dgs__lineage-item">
						<span class="dgs__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="dgs__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="dgs__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="dgs__member-card">
						<div class="dgs__member-top">
							<code class="dgs__member-path">{{ member.normalized }}</code>
							<div class="dgs__member-pills">
								<span
									v-if="member.isRedundantScadaExportMember"
									class="dgs__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (COMTRADE/PMU EXISTS)') }}
								</span>
								<span
									v-if="member.isGridScratchPath"
									class="dgs__pill is-warn">
									{{ t('duplicatefinder', 'SOLVER SCRATCH') }}
								</span>
								<span
									class="dgs__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.gridTag"
									class="dgs__pill is-consolidate">
									{{ member.gridTag }}
								</span>
								<span
									class="dgs__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="dgs__member-bottom">
							<div class="dgs__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="dgs__member-actions">
								<button
									type="button"
									class="dgs__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantScadaExportMember) && !(member.isProtectedFaultEvidence && protectFaultEvidence) && !(member.isProtectedNercCipScl && protectNercCipAndScl) && !(member.isProtectedComtradePmu && protectComtradePmuAnchors)"
									class="dgs__override-field">
									<span class="dgs__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="dgs__override-select"
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

				<div class="dgs__code-panels">
					<div class="dgs__code-box">
						<div class="dgs__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="dgs__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="dgs__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="dgs__code-box">
						<div class="dgs__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="dgs__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="dgs__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	DIGITAL_GRID_SCADA_PRESETS,
	auditDigitalGridScadaVault,
	buildDigitalGridScadaCsvReport,
	buildDigitalGridScadaJsonManifest,
	buildDigitalGridScadaRemediationScript,
	buildDigitalGridScadaSyncExcludeList,
} from '../tools/digitalGridScadaVaultAuditor'

export default {
	name: 'DigitalGridScadaVaultWorkbench',
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
			presetId: 'all-digital-grid-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-grid-scratch',
			survivorRule: 'scl-comtrade-first',
			protectNercCipAndScl: true,
			protectComtradePmuAnchors: true,
			protectFaultEvidence: true,
			requireComtradeAnchorForPrune: true,
			keepRecentGridEventDaysInput: '0',
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
			return DIGITAL_GRID_SCADA_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'scada-export-redundant', label: this.t('duplicatefinder', 'SCADA CSV / PL4') },
				{ id: 'grid-scratch-intermediate', label: this.t('duplicatefinder', 'Solver Scratch') },
				{ id: 'nerc-cip-scl-protected', label: this.t('duplicatefinder', 'NERC CIP & SCL') },
				{ id: 'comtrade-pmu-protected', label: this.t('duplicatefinder', 'COMTRADE / PMU') },
				{ id: 'fault-evidence-protected', label: this.t('duplicatefinder', 'PRC-002 Faults') },
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
		parsedKeepRecentGridEventDays() {
			const trimmed = String(this.keepRecentGridEventDaysInput ?? '').trim()
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
			return auditDigitalGridScadaVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectNercCipAndScl: this.protectNercCipAndScl,
				protectComtradePmuAnchors: this.protectComtradePmuAnchors,
				protectFaultEvidence: this.protectFaultEvidence,
				requireComtradeAnchorForPrune: this.requireComtradeAnchorForPrune,
				keepRecentGridEventDays: this.parsedKeepRecentGridEventDays,
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
			return buildDigitalGridScadaRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildDigitalGridScadaSyncExcludeList()
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
			const preset = DIGITAL_GRID_SCADA_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectNercCipAndScl = preset.protectNercCipAndScl
			this.protectComtradePmuAnchors = preset.protectComtradePmuAnchors
			this.protectFaultEvidence = preset.protectFaultEvidence
			this.requireComtradeAnchorForPrune = preset.requireComtradeAnchorForPrune
			this.keepRecentGridEventDaysInput = String(preset.keepRecentGridEventDays)
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
				'nerc-cip-scl-protected': this.t('duplicatefinder', 'NERC CIP & SCL'),
				'comtrade-pmu-protected': this.t('duplicatefinder', 'COMTRADE / PMU'),
				'fault-evidence-protected': this.t('duplicatefinder', 'PRC-002 Faults'),
				'scada-export-redundant': this.t('duplicatefinder', 'Redundant SCADA Export'),
				'grid-scratch-intermediate': this.t('duplicatefinder', 'Solver Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'scada-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'nerc-cip-scl-protected' || verdict === 'fault-evidence-protected') {
				return 'is-keep'
			}
			if (verdict === 'comtrade-pmu-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'grid-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantScadaExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-grid-scratch' && (member.isRedundantScadaExport || member.isGridScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Digital Grid or SCADA vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Digital Grid & SCADA remediation script to clipboard.'))
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
			const csv = buildDigitalGridScadaCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-digital-grid-scada-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Digital Grid & SCADA Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildDigitalGridScadaJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-digital-grid-scada-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Digital Grid & SCADA Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.digital-grid-scada-vault-workbench {
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

.dgs__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.dgs__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.dgs__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dgs__status-badge {
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

.dgs__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dgs__tool-btn,
.dgs__seg-btn,
.dgs__primary-btn,
.dgs__load-more-btn,
.dgs__mini-btn {
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

.dgs__tool-btn:hover:not(:disabled),
.dgs__seg-btn:hover:not(:disabled),
.dgs__load-more-btn:hover:not(:disabled),
.dgs__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.dgs__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.dgs__tool-btn.is-primary-outline,
.dgs__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dgs__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.dgs__tool-btn:focus-visible,
.dgs__seg-btn:focus-visible,
.dgs__primary-btn:focus-visible,
.dgs__load-more-btn:focus-visible,
.dgs__mini-btn:focus-visible,
.dgs__cluster-card:focus-visible,
.dgs__input:focus-visible,
.dgs__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.dgs__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.dgs__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.dgs__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.dgs__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.dgs__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dgs__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dgs__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dgs__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.dgs__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.dgs__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.dgs__empty-banner,
.dgs__empty-filter {
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

.dgs__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.dgs__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.dgs__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.dgs__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.dgs__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.dgs__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.dgs__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.dgs__inputs-row {
	align-items: flex-end;
}

.dgs__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dgs__field-grow {
	flex: 1 1 180px;
}

.dgs__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.dgs__input,
.dgs__override-select {
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

.dgs__num-input {
	inline-size: 96px;
}

.dgs__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.dgs__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.dgs__cluster-card {
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

.dgs__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.dgs__cluster-top,
.dgs__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.dgs__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.dgs__cluster-meta,
.dgs__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.dgs__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.dgs__badge,
.dgs__pill {
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

.dgs__pill.is-keep,
.dgs__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.dgs__pill.is-redundant,
.dgs__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.dgs__pill.is-consolidate,
.dgs__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.dgs__pill.is-warn,
.dgs__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.dgs__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.dgs__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.dgs__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dgs__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.dgs__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.dgs__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dgs__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dgs__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dgs__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.dgs__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dgs__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.dgs__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.dgs__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.dgs__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.dgs__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dgs__member-top,
.dgs__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dgs__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.dgs__member-pills,
.dgs__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.dgs__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.dgs__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.dgs__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.dgs__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.dgs__pre {
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

.dgs__sr-only {
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
	.dgs__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.dgs__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.dgs__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.digital-grid-scada-vault-workbench {
		padding: 10px;
	}

	.dgs__kpis,
	.dgs__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.dgs__num-input {
		inline-size: 100%;
	}

	.dgs__field {
		flex: 1 1 100%;
	}
}
</style>
