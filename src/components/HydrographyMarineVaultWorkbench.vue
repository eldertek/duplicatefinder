<template>
	<section
		class="hydrography-marine-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Marine Hydrography, Multibeam Sonar and Subsea ROV Vault Auditor')">
		<header class="hmv__toolbar">
			<div class="hmv__title-group">
				<h3 class="hmv__title">
					{{ t('duplicatefinder', 'Marine Hydrography, Multibeam Sonar & Subsea ROV Vault Auditor') }}
				</h3>
				<span
					class="hmv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {std} iho-bag, {masters} mbes-rov, {reg} offshore-hold, {xyz} xyz-grid, {scratch} hydro-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						std: analysis.summary.totalHydroStdClusters,
						masters: analysis.summary.totalSonarRovMasterClusters,
						reg: analysis.summary.totalOffshoreRegulatoryClusters,
						xyz: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalHydroScratchClusters,
					}) }}
				</span>
			</div>

			<div class="hmv__toolbar-actions">
				<button
					type="button"
					class="hmv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="hmv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="hmv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="hmv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="hmv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+H"
					:title="t('duplicatefinder', 'Hide Marine Hydrography, Multibeam Sonar and Subsea ROV Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Hydro & ROV Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="hmv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="hmv__kpis">
			<div class="hmv__kpi">
				<span class="hmv__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="hmv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="hmv__kpi">
				<span class="hmv__kpi-label">{{ t('duplicatefinder', 'Conserved IHO/BAG, Sonar/ROV & Offshore') }}</span>
				<strong class="hmv__kpi-val is-warn">
					{{ analysis.summary.totalHydroStdClusters }} {{ t('duplicatefinder', 'iho/bag') }} / {{ analysis.summary.totalSonarRovMasterClusters }} {{ t('duplicatefinder', 'mbes/rov') }} / {{ analysis.summary.totalOffshoreRegulatoryClusters }} {{ t('duplicatefinder', 'offshore') }}
				</strong>
			</div>
			<div class="hmv__kpi">
				<span class="hmv__kpi-label">{{ t('duplicatefinder', 'Redundant XYZ/Grid & Qimera Scratch') }}</span>
				<strong class="hmv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'xyz-export') }} / {{ analysis.summary.totalHydroScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="hmv__kpi">
				<span class="hmv__kpi-label">{{ t('duplicatefinder', 'Raw Hydrography & ROV Duplicate Footprint') }}</span>
				<strong class="hmv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="hmv__empty-banner"
			role="note">
			<div class="hmv__empty-text">
				<p class="hmv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure IHO S-57/S-100, MBES/ROV, and offshore regulatory shields before scanning') }}
				</p>
				<p class="hmv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit IHO S-57/S-100 charts, BAG/CSAR grids, Kongsberg KMALL/ALL, Reson S7K, EdgeTech JSF, Applanix SBET, ROV HD masters, XYZ exports, and Qimera/CARIS scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="hmv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="hmv__controls">
			<div class="hmv__control-row">
				<span class="hmv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="hmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Hydrography and ROV vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="hmv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="hmv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="hmv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="hmv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="hmv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="hmv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="hmv__seg-btn"
					:class="{ 'is-active': protectHydroStandardsAndCharts }"
					:aria-pressed="protectHydroStandardsAndCharts ? 'true' : 'false'"
					@click="protectHydroStandardsAndCharts = !protectHydroStandardsAndCharts">
					<span>{{ protectHydroStandardsAndCharts ? t('duplicatefinder', 'Shield IHO S-57 / BAG: ON') : t('duplicatefinder', 'Shield IHO S-57 / BAG: OFF') }}</span>
				</button>

				<button
					type="button"
					class="hmv__seg-btn"
					:class="{ 'is-active': protectSonarRovMasterAnchors }"
					:aria-pressed="protectSonarRovMasterAnchors ? 'true' : 'false'"
					@click="protectSonarRovMasterAnchors = !protectSonarRovMasterAnchors">
					<span>{{ protectSonarRovMasterAnchors ? t('duplicatefinder', 'Shield KMALL / S7K / ROV: ON') : t('duplicatefinder', 'Shield KMALL / S7K / ROV: OFF') }}</span>
				</button>

				<button
					type="button"
					class="hmv__seg-btn"
					:class="{ 'is-active': protectOffshoreRegulatoryEvidence }"
					:aria-pressed="protectOffshoreRegulatoryEvidence ? 'true' : 'false'"
					@click="protectOffshoreRegulatoryEvidence = !protectOffshoreRegulatoryEvidence">
					<span>{{ protectOffshoreRegulatoryEvidence ? t('duplicatefinder', 'Shield Offshore / UXO: ON') : t('duplicatefinder', 'Shield Offshore / UXO: OFF') }}</span>
				</button>

				<button
					type="button"
					class="hmv__seg-btn"
					:class="{ 'is-active': requireHydroAnchorForPrune }"
					:aria-pressed="requireHydroAnchorForPrune ? 'true' : 'false'"
					@click="requireHydroAnchorForPrune = !requireHydroAnchorForPrune">
					<span>{{ requireHydroAnchorForPrune ? t('duplicatefinder', 'Require MBES/BAG Anchor: ON') : t('duplicatefinder', 'Require MBES/BAG Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="hmv__control-row hmv__inputs-row">
				<label class="hmv__field">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="hmv__input">
						<option value="prune-exports-and-hydro-scratch">{{ t('duplicatefinder', 'Prune Redundant .xyz/.csv & Scratch') }}</option>
						<option value="hardlink-immutable-sonar-and-bag">{{ t('duplicatefinder', 'Hardlink Immutable KMALL/BAG (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-hydro-scratch">{{ t('duplicatefinder', 'Quarantine Hydro Exports & Processing Scratch') }}</option>
					</select>
				</label>

				<label class="hmv__field">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="hmv__input">
						<option value="iho-bag-sonar-first">{{ t('duplicatefinder', 'IHO, BAG & Sonar Master first') }}</option>
						<option value="oldest-survey-line-first">{{ t('duplicatefinder', 'Oldest survey line acquisition first') }}</option>
						<option value="newest-processing-first">{{ t('duplicatefinder', 'Newest processed grid first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="hmv__field">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Cruise Grace (d)') }}</span>
					<input
						v-model="keepRecentSurveyDaysInput"
						type="number"
						min="0"
						step="1"
						class="hmv__input hmv__num-input">
				</label>

				<label class="hmv__field">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="hmv__input hmv__num-input">
				</label>

				<label class="hmv__field hmv__field-grow">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Filter Survey Line, Sonar, ROV Dive or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="hmv__input"
						:placeholder="t('duplicatefinder', 'e.g. kmall, s7k, xtf, bag, s57, sbet, rov, qimera')">
				</label>

				<label class="hmv__field">
					<span class="hmv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="hmv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'XYZ export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="hmv__control-row">
				<span class="hmv__control-label">{{ t('duplicatefinder', 'Hydro Family') }}</span>
				<div
					class="hmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Hydrography and ROV artifact family filter')">
					<button
						type="button"
						class="hmv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="hmv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="hmv__control-row">
				<span class="hmv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="hmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Hydrography and ROV governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="hmv__seg-btn"
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
			class="hmv__empty-filter"
			role="note">
			<p class="hmv__empty-title">
				{{ t('duplicatefinder', 'No IHO charts, BAG grids, sonar masters, ROV dives, XYZ exports, or processing scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="hmv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="hmv__workspace">
			<div
				class="hmv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Marine Hydrography, Multibeam Sonar and Subsea ROV vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="hmv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="hmv__cluster-top">
						<strong class="hmv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="hmv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="hmv__cluster-meta">
						<span
							v-if="cluster.hydroToolchain"
							class="hmv__tag">{{ cluster.hydroToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="hmv__tag">{{ cluster.workflowStage }}</span>
						<span class="hmv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="hmv__cluster-badges">
						<span
							v-if="cluster.hasRedundantHydroExport"
							class="hmv__badge is-redundant">
							{{ cluster.hasHydroMasterAnchor
								? t('duplicatefinder', 'Redundant Export (MBES/BAG Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No MBES/BAG Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedOffshoreRegulatory"
							class="hmv__badge is-keep">
							{{ t('duplicatefinder', 'Offshore / UXO Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedHydroStandard"
							class="hmv__badge is-keep">
							{{ t('duplicatefinder', 'IHO S-57 / BAG Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedSonarRovMaster"
							class="hmv__badge is-consolidate">
							{{ t('duplicatefinder', 'MBES / SBET / ROV Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasHydroScratchIntermediate"
							class="hmv__badge is-warn">
							{{ t('duplicatefinder', 'Qimera / CARIS / ROV Scratch') }}
						</span>
					</div>
					<div class="hmv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="hmv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="hmv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="hmv__inspector">
				<header class="hmv__inspector-head">
					<div class="hmv__inspector-title-wrap">
						<h4 class="hmv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="hmv__inspector-sub">
							{{ selectedCluster.hydroToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="hmv__inspector-actions">
						<button
							type="button"
							class="hmv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="hmv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="hmv__lineage-grid">
					<div class="hmv__lineage-item">
						<span class="hmv__lineage-label">{{ t('duplicatefinder', 'Hydrography / ROV Lineage & Toolchain') }}</span>
						<strong class="hmv__lineage-val">{{ selectedCluster.hydroToolchain ? `${selectedCluster.hydroToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.hydroAnchorKey }})</strong>
					</div>
					<div class="hmv__lineage-item">
						<span class="hmv__lineage-label">{{ t('duplicatefinder', 'IHO S-57 / S-100 & Offshore Governance') }}</span>
						<strong class="hmv__lineage-val">
							{{ selectedCluster.hasProtectedOffshoreRegulatory ? t('duplicatefinder', 'NOAA / UKHO / IMCA / BOEM Offshore Hold Shielded') : (selectedCluster.hasProtectedHydroStandard ? t('duplicatefinder', 'IHO S-57/S-100 ENC & BAG/CSAR Baseline Shielded') : (selectedCluster.hasProtectedSonarRovMaster ? t('duplicatefinder', 'Multibeam, Sidescan, SBET & ROV Master Shielded') : t('duplicatefinder', 'Processing Scratch or XYZ/Grid Export Artifact'))) }}
						</strong>
					</div>
					<div class="hmv__lineage-item">
						<span class="hmv__lineage-label">{{ t('duplicatefinder', 'KMALL / S7K / BAG / ROV Anchor') }}</span>
						<strong class="hmv__lineage-val">
							{{ selectedCluster.hasHydroMasterAnchor ? t('duplicatefinder', 'Verified MBES, BAG/CSAR, S-57 or ROV Anchor Found') : t('duplicatefinder', 'No MBES, BAG/CSAR, S-57 or ROV Anchor Detected') }}
						</strong>
					</div>
					<div class="hmv__lineage-item">
						<span class="hmv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="hmv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="hmv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="hmv__member-card">
						<div class="hmv__member-top">
							<code class="hmv__member-path">{{ member.normalized }}</code>
							<div class="hmv__member-pills">
								<span
									v-if="member.isRedundantHydroExportMember"
									class="hmv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MBES/BAG EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="hmv__pill is-warn">
									{{ t('duplicatefinder', 'HYDRO SCRATCH') }}
								</span>
								<span
									class="hmv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.hydroTag"
									class="hmv__pill is-consolidate">
									{{ member.hydroTag }}
								</span>
								<span
									class="hmv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="hmv__member-bottom">
							<div class="hmv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="hmv__member-actions">
								<button
									type="button"
									class="hmv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantHydroExportMember) && !(member.isProtectedOffshoreRegulatory && protectOffshoreRegulatoryEvidence) && !(member.isProtectedHydroStandard && protectHydroStandardsAndCharts) && !(member.isProtectedSonarRovMaster && protectSonarRovMasterAnchors)"
									class="hmv__override-field">
									<span class="hmv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="hmv__override-select"
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

				<div class="hmv__code-panels">
					<div class="hmv__code-box">
						<div class="hmv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="hmv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="hmv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="hmv__code-box">
						<div class="hmv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="hmv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="hmv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	HYDROGRAPHY_MARINE_PRESETS,
	auditHydrographyMarineVault,
	buildHydrographyMarineCsvReport,
	buildHydrographyMarineJsonManifest,
	buildHydrographyMarineRemediationScript,
	buildHydrographyMarineSyncExcludeList,
} from '../tools/hydrographyMarineVaultAuditor'

export default {
	name: 'HydrographyMarineVaultWorkbench',
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
			presetId: 'all-hydrography-marine-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-hydro-scratch',
			survivorRule: 'iho-bag-sonar-first',
			protectHydroStandardsAndCharts: true,
			protectSonarRovMasterAnchors: true,
			protectOffshoreRegulatoryEvidence: true,
			requireHydroAnchorForPrune: true,
			keepRecentSurveyDaysInput: '0',
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
			return HYDROGRAPHY_MARINE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'hydro-export-redundant', label: this.t('duplicatefinder', 'XYZ / CSV / Grid') },
				{ id: 'hydro-scratch-intermediate', label: this.t('duplicatefinder', 'Hydro Scratch') },
				{ id: 'hydro-std-protected', label: this.t('duplicatefinder', 'IHO S-57 & BAG') },
				{ id: 'sonar-rov-master-protected', label: this.t('duplicatefinder', 'MBES / SBET / ROV') },
				{ id: 'offshore-regulatory-protected', label: this.t('duplicatefinder', 'Offshore / UXO Hold') },
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
		parsedKeepRecentSurveyDays() {
			const trimmed = String(this.keepRecentSurveyDaysInput ?? '').trim()
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
			return auditHydrographyMarineVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectHydroStandardsAndCharts: this.protectHydroStandardsAndCharts,
				protectSonarRovMasterAnchors: this.protectSonarRovMasterAnchors,
				protectOffshoreRegulatoryEvidence: this.protectOffshoreRegulatoryEvidence,
				requireHydroAnchorForPrune: this.requireHydroAnchorForPrune,
				keepRecentSurveyDays: this.parsedKeepRecentSurveyDays,
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
			return buildHydrographyMarineRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildHydrographyMarineSyncExcludeList()
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
			const preset = HYDROGRAPHY_MARINE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectHydroStandardsAndCharts = preset.protectHydroStandardsAndCharts
			this.protectSonarRovMasterAnchors = preset.protectSonarRovMasterAnchors
			this.protectOffshoreRegulatoryEvidence = preset.protectOffshoreRegulatoryEvidence
			this.requireHydroAnchorForPrune = preset.requireHydroAnchorForPrune
			this.keepRecentSurveyDaysInput = String(preset.keepRecentSurveyDays)
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
				'hydro-std-protected': this.t('duplicatefinder', 'IHO S-57 & BAG'),
				'sonar-rov-master-protected': this.t('duplicatefinder', 'MBES / SBET / ROV'),
				'offshore-regulatory-protected': this.t('duplicatefinder', 'Offshore / UXO Hold'),
				'hydro-export-redundant': this.t('duplicatefinder', 'Redundant XYZ/Grid'),
				'hydro-scratch-intermediate': this.t('duplicatefinder', 'Hydro Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'hydro-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'hydro-std-protected' || verdict === 'offshore-regulatory-protected') {
				return 'is-keep'
			}
			if (verdict === 'sonar-rov-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'hydro-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantHydroExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-hydro-scratch' && (member.isRedundantHydroExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Hydrography or ROV vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Hydrography & ROV remediation script to clipboard.'))
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
			const csv = buildHydrographyMarineCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-hydrography-marine-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Hydrography & ROV Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildHydrographyMarineJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-hydrography-marine-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Hydrography & ROV Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.hydrography-marine-vault-workbench {
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

.hmv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.hmv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.hmv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.hmv__status-badge {
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

.hmv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.hmv__tool-btn,
.hmv__seg-btn,
.hmv__primary-btn,
.hmv__load-more-btn,
.hmv__mini-btn {
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
}

.hmv__tool-btn.is-primary-outline,
.hmv__primary-btn {
	border-color: var(--color-primary-element);
}

.hmv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.hmv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.hmv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.hmv__tool-btn:focus-visible,
.hmv__seg-btn:focus-visible,
.hmv__primary-btn:focus-visible,
.hmv__load-more-btn:focus-visible,
.hmv__mini-btn:focus-visible,
.hmv__cluster-card:focus-visible,
.hmv__input:focus-visible,
.hmv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.hmv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.hmv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.hmv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.hmv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.hmv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.hmv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.hmv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.hmv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.hmv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.hmv__empty-banner,
.hmv__empty-filter {
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

.hmv__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.hmv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.hmv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.hmv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.hmv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.hmv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.hmv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.hmv__inputs-row {
	align-items: flex-end;
}

.hmv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.hmv__field-grow {
	flex: 1 1 220px;
}

.hmv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.hmv__input,
.hmv__override-select {
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

.hmv__num-input {
	inline-size: 96px;
}

.hmv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.hmv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.hmv__cluster-card {
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

.hmv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.hmv__cluster-top,
.hmv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.hmv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.hmv__cluster-meta,
.hmv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.hmv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.hmv__badge,
.hmv__pill {
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

.hmv__pill.is-keep,
.hmv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.hmv__pill.is-redundant,
.hmv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.hmv__pill.is-consolidate,
.hmv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.hmv__pill.is-warn,
.hmv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.hmv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.hmv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.hmv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.hmv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.hmv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.hmv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.hmv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.hmv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.hmv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.hmv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.hmv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.hmv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.hmv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.hmv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.hmv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.hmv__member-top,
.hmv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.hmv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.hmv__member-pills,
.hmv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.hmv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.hmv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.hmv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.hmv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.hmv__pre {
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

.hmv__sr-only {
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
	.hmv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.hmv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.hmv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.hmv__kpis,
	.hmv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.hmv__num-input {
		inline-size: 100%;
	}

	.hmv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.hmv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.hmv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.hmv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.hydrography-marine-vault-workbench {
		padding: 10px;
	}

	.hmv__kpis,
	.hmv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.hmv__num-input {
		inline-size: 100%;
	}

	.hmv__field {
		flex: 1 1 100%;
	}
}
</style>
