<template>
	<section
		class="railway-signaling-telemetry-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Railway, ETCS/CBTC Signaling, Wayside Diagnostics and Rolling Stock Telemetry Vault Auditor')">
		<header class="rst__toolbar">
			<div class="rst__title-group">
				<h3 class="rst__title">
					{{ t('duplicatefinder', 'Railway, ETCS Signaling & Rolling Stock Telemetry Vault Auditor') }}
				</h3>
				<span
					class="rst__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {etcs} etcs-ixl, {masters} otmr-railml, {hold} sil4-hold, {exports} kpi-export, {scratch} wayside-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						etcs: analysis.summary.totalEtcsIxlClusters,
						masters: analysis.summary.totalTelemetryMasterClusters,
						hold: analysis.summary.totalSil4HoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalSimScratchClusters,
					}) }}
				</span>
			</div>

			<div class="rst__toolbar-actions">
				<button
					type="button"
					class="rst__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="rst__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="rst__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="rst__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="rst__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+R"
					:title="t('duplicatefinder', 'Hide Railway, ETCS/CBTC Signaling, Wayside Diagnostics and Rolling Stock Telemetry Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Railway & ETCS') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="rst__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="rst__kpis">
			<div class="rst__kpi">
				<span class="rst__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="rst__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="rst__kpi">
				<span class="rst__kpi-label">{{ t('duplicatefinder', 'Conserved ETCS, OTMR & SIL-4 Holds') }}</span>
				<strong class="rst__kpi-val is-warn">
					{{ analysis.summary.totalEtcsIxlClusters }} {{ t('duplicatefinder', 'etcs/ixl') }} / {{ analysis.summary.totalTelemetryMasterClusters }} {{ t('duplicatefinder', 'otmr/railml') }} / {{ analysis.summary.totalSil4HoldClusters }} {{ t('duplicatefinder', 'sil4-hold') }}
				</strong>
			</div>
			<div class="rst__kpi">
				<span class="rst__kpi-label">{{ t('duplicatefinder', 'Redundant KPIs & Wayside Scratch') }}</span>
				<strong class="rst__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'kpi/plots') }} / {{ analysis.summary.totalSimScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="rst__kpi">
				<span class="rst__kpi-label">{{ t('duplicatefinder', 'Railway & ETCS Duplicate Footprint') }}</span>
				<strong class="rst__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="rst__empty-banner"
			role="note">
			<div class="rst__empty-text">
				<p class="rst__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure ETCS/IXL, OTMR/RailML, and SIL-4 Hold shields before scanning') }}
				</p>
				<p class="rst__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Eurobalise/RBC/IXL baselines, SIL-4/ERA homologation holds, JRU/OTMR/RailML/TCMS masters, track geometry KPI exports, and OpenTrack/wayside scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="rst__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="rst__controls">
			<div class="rst__control-row">
				<span class="rst__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="rst__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Railway signaling and rolling stock telemetry vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="rst__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="rst__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="rst__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="rst__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="rst__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="rst__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="rst__seg-btn"
					:class="{ 'is-active': protectEtcsAndInterlocking }"
					:aria-pressed="protectEtcsAndInterlocking ? 'true' : 'false'"
					@click="protectEtcsAndInterlocking = !protectEtcsAndInterlocking">
					<span>{{ protectEtcsAndInterlocking ? t('duplicatefinder', 'Shield ETCS / IXL / JRU: ON') : t('duplicatefinder', 'Shield ETCS / IXL / JRU: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rst__seg-btn"
					:class="{ 'is-active': protectTelemetryAndRailmlMasters }"
					:aria-pressed="protectTelemetryAndRailmlMasters ? 'true' : 'false'"
					@click="protectTelemetryAndRailmlMasters = !protectTelemetryAndRailmlMasters">
					<span>{{ protectTelemetryAndRailmlMasters ? t('duplicatefinder', 'Shield RailML / OTMR / TCMS: ON') : t('duplicatefinder', 'Shield RailML / OTMR / TCMS: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rst__seg-btn"
					:class="{ 'is-active': protectSil4SafetyHolds }"
					:aria-pressed="protectSil4SafetyHolds ? 'true' : 'false'"
					@click="protectSil4SafetyHolds = !protectSil4SafetyHolds">
					<span>{{ protectSil4SafetyHolds ? t('duplicatefinder', 'Shield SIL-4 / ERA Holds: ON') : t('duplicatefinder', 'Shield SIL-4 / ERA Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rst__seg-btn"
					:class="{ 'is-active': requireRailwayAnchorForPrune }"
					:aria-pressed="requireRailwayAnchorForPrune ? 'true' : 'false'"
					@click="requireRailwayAnchorForPrune = !requireRailwayAnchorForPrune">
					<span>{{ requireRailwayAnchorForPrune ? t('duplicatefinder', 'Require JRU / RailML Anchor: ON') : t('duplicatefinder', 'Require JRU / RailML Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="rst__control-row rst__inputs-row">
				<label class="rst__field">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="rst__input">
						<option value="prune-exports-and-wayside-scratch">{{ t('duplicatefinder', 'Prune Redundant KPIs & Scratch') }}</option>
						<option value="hardlink-immutable-otmr-and-hdf5">{{ t('duplicatefinder', 'Hardlink Immutable OTMR/MDF4 (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-wayside-scratch">{{ t('duplicatefinder', 'Quarantine KPIs & Wayside Scratch') }}</option>
					</select>
				</label>

				<label class="rst__field">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="rst__input">
						<option value="railway-etcs-otmr-first">{{ t('duplicatefinder', 'ETCS/IXL & OTMR/RailML first') }}</option>
						<option value="oldest-jru-run-first">{{ t('duplicatefinder', 'Oldest JRU/OTMR capture first') }}</option>
						<option value="newest-sim-pass-first">{{ t('duplicatefinder', 'Newest sim/diagnostic pass first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="rst__field">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Diagnostic Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="rst__input rst__num-input">
				</label>

				<label class="rst__field">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="rst__input rst__num-input">
				</label>

				<label class="rst__field rst__field-grow">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Filter ETCS, IXL, JRU, RailML, OTMR, TCMS or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="rst__input"
						:placeholder="t('duplicatefinder', 'e.g. etcs, ixl, jru, railml, otmr, trdp, tgeo, opentrack_cache')">
				</label>

				<label class="rst__field">
					<span class="rst__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="rst__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="rst__control-row">
				<span class="rst__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="rst__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Railway signaling and telemetry artifact family filter')">
					<button
						type="button"
						class="rst__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="rst__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="rst__control-row">
				<span class="rst__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="rst__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Railway signaling governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="rst__seg-btn"
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
			class="rst__empty-filter"
			role="note">
			<p class="rst__empty-title">
				{{ t('duplicatefinder', 'No ETCS/IXL baselines, SIL-4 holds, RailML/OTMR/TCMS masters, track KPI exports, or OpenTrack/wayside scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="rst__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="rst__workspace">
			<div
				class="rst__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Railway, ETCS Signaling and Rolling Stock Telemetry vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="rst__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="rst__cluster-top">
						<strong class="rst__cluster-name">{{ cluster.name }}</strong>
						<span
							class="rst__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="rst__cluster-meta">
						<span
							v-if="cluster.railwayToolchain"
							class="rst__tag">{{ cluster.railwayToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="rst__tag">{{ cluster.workflowStage }}</span>
						<span class="rst__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="rst__cluster-badges">
						<span
							v-if="cluster.hasRedundantRailwayExport"
							class="rst__badge is-redundant">
							{{ cluster.hasRailwayMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedSil4Hold"
							class="rst__badge is-keep">
							{{ t('duplicatefinder', 'SIL-4 / ERA Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedEtcsInterlocking"
							class="rst__badge is-keep">
							{{ t('duplicatefinder', 'ETCS / IXL / JRU Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedTelemetryRailmlMaster"
							class="rst__badge is-consolidate">
							{{ t('duplicatefinder', 'RailML / OTMR Conserved') }}
						</span>
						<span
							v-if="cluster.hasSimWaysideScratch"
							class="rst__badge is-warn">
							{{ t('duplicatefinder', 'OpenTrack / Wayside Scratch') }}
						</span>
					</div>
					<div class="rst__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="rst__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="rst__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="rst__inspector">
				<header class="rst__inspector-head">
					<div class="rst__inspector-title-wrap">
						<h4 class="rst__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="rst__inspector-sub">
							{{ selectedCluster.railwayToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="rst__inspector-actions">
						<button
							type="button"
							class="rst__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="rst__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="rst__lineage-grid">
					<div class="rst__lineage-item">
						<span class="rst__lineage-label">{{ t('duplicatefinder', 'Corridor Stem & Railway Toolchain') }}</span>
						<strong class="rst__lineage-val">{{ selectedCluster.railwayToolchain ? `${selectedCluster.railwayToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.railwayAnchorKey }})</strong>
					</div>
					<div class="rst__lineage-item">
						<span class="rst__lineage-label">{{ t('duplicatefinder', 'ETCS, Telemetry & Hold Governance') }}</span>
						<strong class="rst__lineage-val">
							{{ selectedCluster.hasProtectedSil4Hold ? t('duplicatefinder', 'SIL-4, ERA Homologation or Incident Hold Shielded') : (selectedCluster.hasProtectedEtcsInterlocking ? t('duplicatefinder', 'Eurobalise, RBC/IXL or JRU Baseline Shielded') : (selectedCluster.hasProtectedTelemetryRailmlMaster ? t('duplicatefinder', 'RailML, EULYNX, OTMR, Track Geometry or TCMS Master Shielded') : t('duplicatefinder', 'OpenTrack/Wayside Scratch or Derived Track KPI Export'))) }}
						</strong>
					</div>
					<div class="rst__lineage-item">
						<span class="rst__lineage-label">{{ t('duplicatefinder', 'ETCS / JRU / RailML Anchor') }}</span>
						<strong class="rst__lineage-val">
							{{ selectedCluster.hasRailwayMasterAnchor ? t('duplicatefinder', 'Verified ETCS, IXL, JRU, RailML or OTMR Anchor Found') : t('duplicatefinder', 'No ETCS, JRU or RailML Anchor Detected') }}
						</strong>
					</div>
					<div class="rst__lineage-item">
						<span class="rst__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="rst__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="rst__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="rst__member-card">
						<div class="rst__member-top">
							<code class="rst__member-path">{{ member.normalized }}</code>
							<div class="rst__member-pills">
								<span
									v-if="member.isRedundantRailwayExportMember"
									class="rst__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="rst__pill is-warn">
									{{ t('duplicatefinder', 'SIM / WAYSIDE SCRATCH') }}
								</span>
								<span
									class="rst__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.railwayTag"
									class="rst__pill is-consolidate">
									{{ member.railwayTag }}
								</span>
								<span
									class="rst__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="rst__member-bottom">
							<div class="rst__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="rst__member-actions">
								<button
									type="button"
									class="rst__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantRailwayExportMember) && !(member.isProtectedSil4Hold && protectSil4SafetyHolds) && !(member.isProtectedEtcsInterlocking && protectEtcsAndInterlocking) && !(member.isProtectedTelemetryRailmlMaster && protectTelemetryAndRailmlMasters)"
									class="rst__override-field">
									<span class="rst__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="rst__override-select"
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

				<div class="rst__code-panels">
					<div class="rst__code-box">
						<div class="rst__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="rst__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="rst__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="rst__code-box">
						<div class="rst__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="rst__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="rst__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	RAILWAY_SIGNALING_PRESETS,
	auditRailwaySignalingVault,
	buildRailwaySignalingCsvReport,
	buildRailwaySignalingJsonManifest,
	buildRailwaySignalingRemediationScript,
	buildRailwaySignalingSyncExcludeList,
} from '../tools/railwaySignalingTelemetryVaultAuditor'

export default {
	name: 'RailwaySignalingTelemetryVaultWorkbench',
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
			presetId: 'all-railway-signaling-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-wayside-scratch',
			survivorRule: 'railway-etcs-otmr-first',
			protectEtcsAndInterlocking: true,
			protectTelemetryAndRailmlMasters: true,
			protectSil4SafetyHolds: true,
			requireRailwayAnchorForPrune: true,
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
			return RAILWAY_SIGNALING_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'railway-export-redundant', label: this.t('duplicatefinder', 'KPIs / Plots') },
				{ id: 'sim-wayside-scratch', label: this.t('duplicatefinder', 'OpenTrack / Scratch') },
				{ id: 'railway-etcs-ixl-protected', label: this.t('duplicatefinder', 'ETCS / IXL / JRU') },
				{ id: 'otmr-railml-master-protected', label: this.t('duplicatefinder', 'RailML / OTMR / TCMS') },
				{ id: 'sil4-safety-hold-protected', label: this.t('duplicatefinder', 'SIL-4 / ERA Hold') },
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
			return auditRailwaySignalingVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectEtcsAndInterlocking: this.protectEtcsAndInterlocking,
				protectTelemetryAndRailmlMasters: this.protectTelemetryAndRailmlMasters,
				protectSil4SafetyHolds: this.protectSil4SafetyHolds,
				requireRailwayAnchorForPrune: this.requireRailwayAnchorForPrune,
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
			return buildRailwaySignalingRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildRailwaySignalingSyncExcludeList()
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
			const preset = RAILWAY_SIGNALING_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectEtcsAndInterlocking = preset.protectEtcsAndInterlocking
			this.protectTelemetryAndRailmlMasters = preset.protectTelemetryAndRailmlMasters
			this.protectSil4SafetyHolds = preset.protectSil4SafetyHolds
			this.requireRailwayAnchorForPrune = preset.requireRailwayAnchorForPrune
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
				'railway-etcs-ixl-protected': this.t('duplicatefinder', 'ETCS / IXL / JRU'),
				'otmr-railml-master-protected': this.t('duplicatefinder', 'RailML / OTMR'),
				'sil4-safety-hold-protected': this.t('duplicatefinder', 'SIL-4 / ERA Hold'),
				'railway-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'sim-wayside-scratch': this.t('duplicatefinder', 'Wayside Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'railway-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'railway-etcs-ixl-protected' || verdict === 'sil4-safety-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'otmr-railml-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'sim-wayside-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantRailwayExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-wayside-scratch' && (member.isRedundantRailwayExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Railway or ETCS Signaling vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Railway & ETCS remediation script to clipboard.'))
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
			const csv = buildRailwaySignalingCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-railway-signaling-telemetry-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Railway & ETCS Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildRailwaySignalingJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-railway-signaling-telemetry-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Railway & ETCS Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.railway-signaling-telemetry-vault-workbench {
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

.rst__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.rst__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.rst__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.rst__status-badge {
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

.rst__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.rst__tool-btn,
.rst__seg-btn,
.rst__primary-btn,
.rst__load-more-btn,
.rst__mini-btn {
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

.rst__tool-btn.is-primary-outline,
.rst__primary-btn {
	border-color: var(--color-primary-element);
}

.rst__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.rst__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rst__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.rst__tool-btn:focus-visible,
.rst__seg-btn:focus-visible,
.rst__primary-btn:focus-visible,
.rst__load-more-btn:focus-visible,
.rst__mini-btn:focus-visible,
.rst__cluster-card:focus-visible,
.rst__input:focus-visible,
.rst__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.rst__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.rst__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.rst__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.rst__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rst__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rst__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rst__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.rst__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.rst__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.rst__empty-banner,
.rst__empty-filter {
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

.rst__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.rst__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.rst__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rst__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rst__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.rst__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.rst__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.rst__inputs-row {
	align-items: flex-end;
}

.rst__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.rst__field-grow {
	flex: 1 1 220px;
}

.rst__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rst__input,
.rst__override-select {
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

.rst__num-input {
	inline-size: 96px;
}

.rst__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.rst__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.rst__cluster-card {
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

.rst__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.rst__cluster-top,
.rst__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.rst__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.rst__cluster-meta,
.rst__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.rst__tag {
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

.rst__badge,
.rst__pill {
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

.rst__pill.is-keep,
.rst__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.rst__pill.is-redundant,
.rst__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.rst__pill.is-consolidate,
.rst__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.rst__pill.is-warn,
.rst__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.rst__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.rst__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.rst__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rst__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.rst__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.rst__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rst__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rst__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.rst__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.rst__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rst__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rst__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.rst__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.rst__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.rst__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rst__member-top,
.rst__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.rst__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.rst__member-pills,
.rst__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.rst__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.rst__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.rst__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rst__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.rst__pre {
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

.rst__sr-only {
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
	.rst__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.rst__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.rst__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.rst__kpis,
	.rst__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.rst__num-input {
		inline-size: 100%;
	}

	.rst__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.rst__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.rst__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.rst__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.railway-signaling-telemetry-vault-workbench {
		padding: 10px;
	}

	.rst__kpis,
	.rst__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.rst__num-input {
		inline-size: 100%;
	}

	.rst__field {
		flex: 1 1 100%;
	}
}
</style>
