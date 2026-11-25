<template>
	<section
		class="meteorology-climate-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Meteorology, Weather Radar, NetCDF and Climate Model Vault Auditor')">
		<header class="mcv__toolbar">
			<div class="mcv__title-group">
				<h3 class="mcv__title">
					{{ t('duplicatefinder', 'Meteorology, Weather Radar, NetCDF & Climate Model Vault Auditor') }}
				</h3>
				<span
					class="mcv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {std} cf-wmo, {masters} radar-nc-grib, {archive} archive-hold, {plots} quicklook-export, {scratch} wrf-cdo-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						std: analysis.summary.totalCfWmoStdClusters,
						masters: analysis.summary.totalRawMeteoMasterClusters,
						archive: analysis.summary.totalWmoArchiveHoldClusters,
						plots: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalMeteoScratchClusters,
					}) }}
				</span>
			</div>

			<div class="mcv__toolbar-actions">
				<button
					type="button"
					class="mcv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mcv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mcv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mcv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="mcv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+J"
					:title="t('duplicatefinder', 'Hide Meteorology, Weather Radar, NetCDF and Climate Model Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Meteo & Climate Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mcv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mcv__kpis">
			<div class="mcv__kpi">
				<span class="mcv__kpi-label">{{ t('duplicatefinder', 'Safe Quicklook & Scratch Reclaim') }}</span>
				<strong class="mcv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mcv__kpi">
				<span class="mcv__kpi-label">{{ t('duplicatefinder', 'Conserved CF/WMO, Radar/NetCDF & Archive') }}</span>
				<strong class="mcv__kpi-val is-warn">
					{{ analysis.summary.totalCfWmoStdClusters }} {{ t('duplicatefinder', 'cf/wmo') }} / {{ analysis.summary.totalRawMeteoMasterClusters }} {{ t('duplicatefinder', 'nc/grib/radar') }} / {{ analysis.summary.totalWmoArchiveHoldClusters }} {{ t('duplicatefinder', 'archive') }}
				</strong>
			</div>
			<div class="mcv__kpi">
				<span class="mcv__kpi-label">{{ t('duplicatefinder', 'Redundant Plots & WRF/CDO Scratch') }}</span>
				<strong class="mcv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'plot-export') }} / {{ analysis.summary.totalMeteoScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mcv__kpi">
				<span class="mcv__kpi-label">{{ t('duplicatefinder', 'Raw Meteorology & Climate Duplicate Footprint') }}</span>
				<strong class="mcv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mcv__empty-banner"
			role="note">
			<div class="mcv__empty-text">
				<p class="mcv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CF/WMO, NetCDF/GRIB2/Radar, and Archive Hold shields before scanning') }}
				</p>
				<p class="mcv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit CF/CMOR tables, WMO BUFR/SYNOP bulletins, ERA5/CMIP6/NOAA holds, NetCDF/GRIB2/WRF/NEXRAD masters, Skew-T/radar quicklooks, and WRF/CDO/Dask scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="mcv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mcv__controls">
			<div class="mcv__control-row">
				<span class="mcv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="mcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Meteorology and climate vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mcv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mcv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mcv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mcv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mcv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mcv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mcv__seg-btn"
					:class="{ 'is-active': protectCfWmoStandards }"
					:aria-pressed="protectCfWmoStandards ? 'true' : 'false'"
					@click="protectCfWmoStandards = !protectCfWmoStandards">
					<span>{{ protectCfWmoStandards ? t('duplicatefinder', 'Shield CF / WMO / Namelist: ON') : t('duplicatefinder', 'Shield CF / WMO / Namelist: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcv__seg-btn"
					:class="{ 'is-active': protectRawRadarNetcdfGribMasters }"
					:aria-pressed="protectRawRadarNetcdfGribMasters ? 'true' : 'false'"
					@click="protectRawRadarNetcdfGribMasters = !protectRawRadarNetcdfGribMasters">
					<span>{{ protectRawRadarNetcdfGribMasters ? t('duplicatefinder', 'Shield NetCDF / GRIB2 / Radar: ON') : t('duplicatefinder', 'Shield NetCDF / GRIB2 / Radar: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcv__seg-btn"
					:class="{ 'is-active': protectWmoArchiveHolds }"
					:aria-pressed="protectWmoArchiveHolds ? 'true' : 'false'"
					@click="protectWmoArchiveHolds = !protectWmoArchiveHolds">
					<span>{{ protectWmoArchiveHolds ? t('duplicatefinder', 'Shield ERA5 / CMIP6 / NOAA: ON') : t('duplicatefinder', 'Shield ERA5 / CMIP6 / NOAA: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mcv__seg-btn"
					:class="{ 'is-active': requireMeteoAnchorForPrune }"
					:aria-pressed="requireMeteoAnchorForPrune ? 'true' : 'false'"
					@click="requireMeteoAnchorForPrune = !requireMeteoAnchorForPrune">
					<span>{{ requireMeteoAnchorForPrune ? t('duplicatefinder', 'Require NC/GRIB Anchor: ON') : t('duplicatefinder', 'Require NC/GRIB Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="mcv__control-row mcv__inputs-row">
				<label class="mcv__field">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mcv__input">
						<option value="prune-exports-and-meteo-scratch">{{ t('duplicatefinder', 'Prune Redundant Plots & Scratch') }}</option>
						<option value="hardlink-immutable-nc-and-grib">{{ t('duplicatefinder', 'Hardlink Immutable NetCDF/GRIB2 (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-meteo-scratch">{{ t('duplicatefinder', 'Quarantine Meteo Plots & WRF Scratch') }}</option>
					</select>
				</label>

				<label class="mcv__field">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mcv__input">
						<option value="cf-netcdf-master-first">{{ t('duplicatefinder', 'CF/WMO, NetCDF & Radar first') }}</option>
						<option value="oldest-observation-first">{{ t('duplicatefinder', 'Oldest synoptic observation first') }}</option>
						<option value="newest-forecast-run-first">{{ t('duplicatefinder', 'Newest forecast run first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="mcv__field">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Run Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="mcv__input mcv__num-input">
				</label>

				<label class="mcv__field">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="mcv__input mcv__num-input">
				</label>

				<label class="mcv__field mcv__field-grow">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Filter Run, NetCDF, GRIB2, Radar or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mcv__input"
						:placeholder="t('duplicatefinder', 'e.g. nc4, grib2, ar2v, cfradial, wrfout, era5, cmip6, cdo_tmp')">
				</label>

				<label class="mcv__field">
					<span class="mcv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mcv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Plot export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mcv__control-row">
				<span class="mcv__control-label">{{ t('duplicatefinder', 'Meteo Family') }}</span>
				<div
					class="mcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Meteorology and climate artifact family filter')">
					<button
						type="button"
						class="mcv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mcv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mcv__control-row">
				<span class="mcv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="mcv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Meteorology and climate governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mcv__seg-btn"
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
			class="mcv__empty-filter"
			role="note">
			<p class="mcv__empty-title">
				{{ t('duplicatefinder', 'No CF/WMO standards, NetCDF/GRIB2/Radar masters, quicklook plots, or WRF/CDO scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="mcv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mcv__workspace">
			<div
				class="mcv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Meteorology, Weather Radar, NetCDF and Climate Model vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="mcv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="mcv__cluster-top">
						<strong class="mcv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="mcv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="mcv__cluster-meta">
						<span
							v-if="cluster.meteoToolchain"
							class="mcv__tag">{{ cluster.meteoToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="mcv__tag">{{ cluster.workflowStage }}</span>
						<span class="mcv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="mcv__cluster-badges">
						<span
							v-if="cluster.hasRedundantMeteoExport"
							class="mcv__badge is-redundant">
							{{ cluster.hasMeteoMasterAnchor
								? t('duplicatefinder', 'Redundant Export (NC/GRIB Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No NC/GRIB Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedWmoArchiveHold"
							class="mcv__badge is-keep">
							{{ t('duplicatefinder', 'Archive Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCfWmoStandard"
							class="mcv__badge is-keep">
							{{ t('duplicatefinder', 'CF / WMO / Namelist Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawMeteoMaster"
							class="mcv__badge is-consolidate">
							{{ t('duplicatefinder', 'NetCDF / GRIB2 / Radar Conserved') }}
						</span>
						<span
							v-if="cluster.hasMeteoScratchIntermediate"
							class="mcv__badge is-warn">
							{{ t('duplicatefinder', 'WRF / CDO / Radar Scratch') }}
						</span>
					</div>
					<div class="mcv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mcv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mcv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mcv__inspector">
				<header class="mcv__inspector-head">
					<div class="mcv__inspector-title-wrap">
						<h4 class="mcv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="mcv__inspector-sub">
							{{ selectedCluster.meteoToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="mcv__inspector-actions">
						<button
							type="button"
							class="mcv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mcv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mcv__lineage-grid">
					<div class="mcv__lineage-item">
						<span class="mcv__lineage-label">{{ t('duplicatefinder', 'Model Run / Station & Toolchain') }}</span>
						<strong class="mcv__lineage-val">{{ selectedCluster.meteoToolchain ? `${selectedCluster.meteoToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.meteoAnchorKey }})</strong>
					</div>
					<div class="mcv__lineage-item">
						<span class="mcv__lineage-label">{{ t('duplicatefinder', 'CF / WMO & Archive Governance') }}</span>
						<strong class="mcv__lineage-val">
							{{ selectedCluster.hasProtectedWmoArchiveHold ? t('duplicatefinder', 'ECMWF ERA5 / CMIP6 / EUMETSAT / NOAA Hold Shielded') : (selectedCluster.hasProtectedCfWmoStandard ? t('duplicatefinder', 'CF/CMOR, WMO BUFR, WRF Namelist & Calibration Shielded') : (selectedCluster.hasProtectedRawMeteoMaster ? t('duplicatefinder', 'Raw NetCDF, GRIB2, WRF Output & Radar Master Shielded') : t('duplicatefinder', 'WRF/CDO/Dask Scratch or Quicklook Export Artifact'))) }}
						</strong>
					</div>
					<div class="mcv__lineage-item">
						<span class="mcv__lineage-label">{{ t('duplicatefinder', 'NetCDF / GRIB2 / WRF / Radar Anchor') }}</span>
						<strong class="mcv__lineage-val">
							{{ selectedCluster.hasMeteoMasterAnchor ? t('duplicatefinder', 'Verified NetCDF, GRIB2, WRF or Radar Anchor Found') : t('duplicatefinder', 'No NetCDF, GRIB2, WRF or Radar Anchor Detected') }}
						</strong>
					</div>
					<div class="mcv__lineage-item">
						<span class="mcv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mcv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="mcv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="mcv__member-card">
						<div class="mcv__member-top">
							<code class="mcv__member-path">{{ member.normalized }}</code>
							<div class="mcv__member-pills">
								<span
									v-if="member.isRedundantMeteoExportMember"
									class="mcv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (NC/GRIB EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="mcv__pill is-warn">
									{{ t('duplicatefinder', 'METEO SCRATCH') }}
								</span>
								<span
									class="mcv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.meteoTag"
									class="mcv__pill is-consolidate">
									{{ member.meteoTag }}
								</span>
								<span
									class="mcv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="mcv__member-bottom">
							<div class="mcv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="mcv__member-actions">
								<button
									type="button"
									class="mcv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantMeteoExportMember) && !(member.isProtectedWmoArchiveHold && protectWmoArchiveHolds) && !(member.isProtectedCfWmoStandard && protectCfWmoStandards) && !(member.isProtectedRawMeteoMaster && protectRawRadarNetcdfGribMasters)"
									class="mcv__override-field">
									<span class="mcv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="mcv__override-select"
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

				<div class="mcv__code-panels">
					<div class="mcv__code-box">
						<div class="mcv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mcv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mcv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mcv__code-box">
						<div class="mcv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mcv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mcv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	METEOROLOGY_CLIMATE_PRESETS,
	auditMeteorologyClimateVault,
	buildMeteorologyClimateCsvReport,
	buildMeteorologyClimateJsonManifest,
	buildMeteorologyClimateRemediationScript,
	buildMeteorologyClimateSyncExcludeList,
} from '../tools/meteorologyClimateVaultAuditor'

export default {
	name: 'MeteorologyClimateVaultWorkbench',
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
			presetId: 'all-meteorology-climate-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-meteo-scratch',
			survivorRule: 'cf-netcdf-master-first',
			protectCfWmoStandards: true,
			protectRawRadarNetcdfGribMasters: true,
			protectWmoArchiveHolds: true,
			requireMeteoAnchorForPrune: true,
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
			return METEOROLOGY_CLIMATE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'meteo-export-redundant', label: this.t('duplicatefinder', 'Quicklooks / CSV') },
				{ id: 'meteo-scratch-intermediate', label: this.t('duplicatefinder', 'WRF / CDO Scratch') },
				{ id: 'meteo-std-protected', label: this.t('duplicatefinder', 'CF / WMO / Namelist') },
				{ id: 'raw-radar-netcdf-protected', label: this.t('duplicatefinder', 'NetCDF / GRIB2 / Radar') },
				{ id: 'wmo-archive-embargo-protected', label: this.t('duplicatefinder', 'Archive Hold') },
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
			return auditMeteorologyClimateVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCfWmoStandards: this.protectCfWmoStandards,
				protectRawRadarNetcdfGribMasters: this.protectRawRadarNetcdfGribMasters,
				protectWmoArchiveHolds: this.protectWmoArchiveHolds,
				requireMeteoAnchorForPrune: this.requireMeteoAnchorForPrune,
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
			return buildMeteorologyClimateRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildMeteorologyClimateSyncExcludeList()
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
			const preset = METEOROLOGY_CLIMATE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCfWmoStandards = preset.protectCfWmoStandards
			this.protectRawRadarNetcdfGribMasters = preset.protectRawRadarNetcdfGribMasters
			this.protectWmoArchiveHolds = preset.protectWmoArchiveHolds
			this.requireMeteoAnchorForPrune = preset.requireMeteoAnchorForPrune
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
				'meteo-std-protected': this.t('duplicatefinder', 'CF / WMO & Namelist'),
				'raw-radar-netcdf-protected': this.t('duplicatefinder', 'NetCDF / GRIB2 / Radar'),
				'wmo-archive-embargo-protected': this.t('duplicatefinder', 'Archive Hold'),
				'meteo-export-redundant': this.t('duplicatefinder', 'Redundant Plot'),
				'meteo-scratch-intermediate': this.t('duplicatefinder', 'WRF / CDO Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'meteo-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'meteo-std-protected' || verdict === 'wmo-archive-embargo-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-radar-netcdf-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'meteo-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantMeteoExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-meteo-scratch' && (member.isRedundantMeteoExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Meteorology or Climate vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Meteorology & Climate remediation script to clipboard.'))
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
			const csv = buildMeteorologyClimateCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-meteorology-climate-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Meteorology & Climate Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMeteorologyClimateJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-meteorology-climate-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Meteorology & Climate Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.meteorology-climate-vault-workbench {
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

.mcv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mcv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mcv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mcv__status-badge {
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

.mcv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mcv__tool-btn,
.mcv__seg-btn,
.mcv__primary-btn,
.mcv__load-more-btn,
.mcv__mini-btn {
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

.mcv__tool-btn.is-primary-outline,
.mcv__primary-btn {
	border-color: var(--color-primary-element);
}

.mcv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.mcv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mcv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.mcv__tool-btn:focus-visible,
.mcv__seg-btn:focus-visible,
.mcv__primary-btn:focus-visible,
.mcv__load-more-btn:focus-visible,
.mcv__mini-btn:focus-visible,
.mcv__cluster-card:focus-visible,
.mcv__input:focus-visible,
.mcv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mcv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.mcv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.mcv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.mcv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mcv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mcv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mcv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mcv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.mcv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.mcv__empty-banner,
.mcv__empty-filter {
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

.mcv__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.mcv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.mcv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mcv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.mcv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.mcv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.mcv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.mcv__inputs-row {
	align-items: flex-end;
}

.mcv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mcv__field-grow {
	flex: 1 1 220px;
}

.mcv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mcv__input,
.mcv__override-select {
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

.mcv__num-input {
	inline-size: 96px;
}

.mcv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mcv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mcv__cluster-card {
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

.mcv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mcv__cluster-top,
.mcv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mcv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mcv__cluster-meta,
.mcv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.mcv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.mcv__badge,
.mcv__pill {
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

.mcv__pill.is-keep,
.mcv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mcv__pill.is-redundant,
.mcv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.mcv__pill.is-consolidate,
.mcv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mcv__pill.is-warn,
.mcv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mcv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.mcv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mcv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mcv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.mcv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mcv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mcv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mcv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mcv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.mcv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.mcv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mcv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mcv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mcv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcv__member-top,
.mcv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mcv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mcv__member-pills,
.mcv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.mcv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.mcv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mcv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mcv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.mcv__pre {
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

.mcv__sr-only {
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
	.mcv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mcv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.mcv__kpis,
	.mcv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcv__num-input {
		inline-size: 100%;
	}

	.mcv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.mcv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mcv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.meteorology-climate-vault-workbench {
		padding: 10px;
	}

	.mcv__kpis,
	.mcv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mcv__num-input {
		inline-size: 100%;
	}

	.mcv__field {
		flex: 1 1 100%;
	}
}
</style>
