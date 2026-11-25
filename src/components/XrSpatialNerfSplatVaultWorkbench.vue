<template>
	<section
		class="xr-spatial-nerf-splat-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'XR Spatial Computing, Photorealistic NeRF/Gaussian Splatting and Volumetric Video Vault Auditor')">
		<header class="xns__toolbar">
			<div class="xns__title-group">
				<h3 class="xns__title">
					{{ t('duplicatefinder', 'XR Spatial Computing, NeRF/3DGS & Volumetric Video Vault Auditor') }}
				</h3>
				<span
					class="xns__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {cal} openxr-calib, {masters} nerf-3dgs, {hold} safety-hold, {exports} xr-preview, {scratch} xr-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						cal: analysis.summary.totalCalibrationClusters,
						masters: analysis.summary.totalNerfSplatMasterClusters,
						hold: analysis.summary.totalSafetyHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalScratchClusters,
					}) }}
				</span>
			</div>

			<div class="xns__toolbar-actions">
				<button
					type="button"
					class="xns__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="xns__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="xns__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="xns__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="xns__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+X"
					:title="t('duplicatefinder', 'Hide XR Spatial Computing, NeRF/Gaussian Splatting and Volumetric Video Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide XR & NeRF/3DGS') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="xns__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="xns__kpis">
			<div class="xns__kpi">
				<span class="xns__kpi-label">{{ t('duplicatefinder', 'Safe Preview & Scratch Reclaim') }}</span>
				<strong class="xns__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="xns__kpi">
				<span class="xns__kpi-label">{{ t('duplicatefinder', 'Conserved OpenXR, Masters & Holds') }}</span>
				<strong class="xns__kpi-val is-warn">
					{{ analysis.summary.totalCalibrationClusters }} {{ t('duplicatefinder', 'openxr/usdz') }} / {{ analysis.summary.totalNerfSplatMasterClusters }} {{ t('duplicatefinder', 'nerf/3dgs') }} / {{ analysis.summary.totalSafetyHoldClusters }} {{ t('duplicatefinder', 'safety-hold') }}
				</strong>
			</div>
			<div class="xns__kpi">
				<span class="xns__kpi-label">{{ t('duplicatefinder', 'Derived Previews & Splat Scratch') }}</span>
				<strong class="xns__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'xr-preview') }} / {{ analysis.summary.totalScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="xns__kpi">
				<span class="xns__kpi-label">{{ t('duplicatefinder', 'XR & NeRF/3DGS Duplicate Footprint') }}</span>
				<strong class="xns__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="xns__empty-banner"
			role="note">
			<div class="xns__empty-text">
				<p class="xns__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure OpenXR/USDZ Calibration, NeRF/3DGS/Volumetric Master, and Safety Hold shields before scanning') }}
				</p>
				<p class="xns__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit XR safety holds, OpenXR/USDZ calibration baselines, 3D Gaussian Splatting (.splat/.ksplat/.spz), NeRF/COLMAP masters, volumetric captures, and training scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="xns__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="xns__controls">
			<div class="xns__control-row">
				<span class="xns__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="xns__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'XR Spatial, NeRF/3DGS and Volumetric vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="xns__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="xns__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="xns__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="xns__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="xns__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="xns__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="xns__seg-btn"
					:class="{ 'is-active': protectSpatialCalibrationAndSafetyHolds }"
					:aria-pressed="protectSpatialCalibrationAndSafetyHolds ? 'true' : 'false'"
					@click="protectSpatialCalibrationAndSafetyHolds = !protectSpatialCalibrationAndSafetyHolds">
					<span>{{ protectSpatialCalibrationAndSafetyHolds ? t('duplicatefinder', 'Shield OpenXR / USDZ Calib: ON') : t('duplicatefinder', 'Shield OpenXR / USDZ Calib: OFF') }}</span>
				</button>

				<button
					type="button"
					class="xns__seg-btn"
					:class="{ 'is-active': protectNerfSplatVolumetricMasters }"
					:aria-pressed="protectNerfSplatVolumetricMasters ? 'true' : 'false'"
					@click="protectNerfSplatVolumetricMasters = !protectNerfSplatVolumetricMasters">
					<span>{{ protectNerfSplatVolumetricMasters ? t('duplicatefinder', 'Shield NeRF / 3DGS Masters: ON') : t('duplicatefinder', 'Shield NeRF / 3DGS Masters: OFF') }}</span>
				</button>

				<button
					type="button"
					class="xns__seg-btn"
					:class="{ 'is-active': protectSafetyComplianceHolds }"
					:aria-pressed="protectSafetyComplianceHolds ? 'true' : 'false'"
					@click="protectSafetyComplianceHolds = !protectSafetyComplianceHolds">
					<span>{{ protectSafetyComplianceHolds ? t('duplicatefinder', 'Shield XR Safety Holds: ON') : t('duplicatefinder', 'Shield XR Safety Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="xns__seg-btn"
					:class="{ 'is-active': requireXrMasterAnchorForPrune }"
					:aria-pressed="requireXrMasterAnchorForPrune ? 'true' : 'false'"
					@click="requireXrMasterAnchorForPrune = !requireXrMasterAnchorForPrune">
					<span>{{ requireXrMasterAnchorForPrune ? t('duplicatefinder', 'Require XR Master Anchor: ON') : t('duplicatefinder', 'Require XR Master Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="xns__control-row xns__inputs-row">
				<label class="xns__field">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="xns__input">
						<option value="prune-previews-and-xr-scratch">{{ t('duplicatefinder', 'Prune Previews & Training/Runtime Scratch') }}</option>
						<option value="hardlink-immutable-xr-masters">{{ t('duplicatefinder', 'Hardlink Immutable Splat/NeRF/Volcap (Block Mutable)') }}</option>
						<option value="quarantine-previews-and-xr-scratch">{{ t('duplicatefinder', 'Quarantine Previews & Training/Runtime Scratch') }}</option>
					</select>
				</label>

				<label class="xns__field">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="xns__input">
						<option value="xr-calibration-nerf-master-first">{{ t('duplicatefinder', 'OpenXR/Calib & NeRF/3DGS masters first') }}</option>
						<option value="oldest-capture-run-first">{{ t('duplicatefinder', 'Oldest capture/training run first') }}</option>
						<option value="newest-training-ckpt-first">{{ t('duplicatefinder', 'Newest training checkpoint first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="xns__field">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Scratch Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="xns__input xns__num-input">
				</label>

				<label class="xns__field">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="xns__input xns__num-input">
				</label>

				<label class="xns__field xns__field-grow">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Filter OpenXR, NeRF, 3DGS, Volumetric or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="xns__input"
						:placeholder="t('duplicatefinder', 'e.g. splat, ksplat, nerf, colmap, vpcc, usdz, openxr, safety, nerfstudio_cache')">
				</label>

				<label class="xns__field">
					<span class="xns__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="xns__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Preview & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="xns__control-row">
				<span class="xns__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="xns__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'XR Spatial, NeRF/3DGS and Volumetric artifact family filter')">
					<button
						type="button"
						class="xns__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="xns__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="xns__control-row">
				<span class="xns__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="xns__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'XR Spatial, NeRF/3DGS and Volumetric governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="xns__seg-btn"
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
			class="xns__empty-filter"
			role="note">
			<p class="xns__empty-title">
				{{ t('duplicatefinder', 'No OpenXR/USDZ calibrations, safety holds, NeRF/3DGS/Volumetric masters, derived previews, or scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="xns__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="xns__workspace">
			<div
				class="xns__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited XR Spatial, NeRF/3DGS and Volumetric Video vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="xns__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="xns__cluster-top">
						<strong class="xns__cluster-name">{{ cluster.name }}</strong>
						<span
							class="xns__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="xns__cluster-meta">
						<span
							v-if="cluster.xrToolchain"
							class="xns__tag">{{ cluster.xrToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="xns__tag">{{ cluster.workflowStage }}</span>
						<span class="xns__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="xns__cluster-badges">
						<span
							v-if="cluster.hasRedundantXrExport"
							class="xns__badge is-redundant">
							{{ cluster.hasXrMasterAnchor
								? t('duplicatefinder', 'Redundant Preview (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Preview (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedSafetyHold"
							class="xns__badge is-keep">
							{{ t('duplicatefinder', 'XR Safety Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedSpatialCalibration"
							class="xns__badge is-keep">
							{{ t('duplicatefinder', 'OpenXR / Calib Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedNerfSplatMaster"
							class="xns__badge is-consolidate">
							{{ t('duplicatefinder', 'NeRF / 3DGS Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasXrRuntimeScratch"
							class="xns__badge is-warn">
							{{ t('duplicatefinder', 'Training / Runtime Scratch') }}
						</span>
					</div>
					<div class="xns__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="xns__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="xns__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="xns__inspector">
				<header class="xns__inspector-head">
					<div class="xns__inspector-title-wrap">
						<h4 class="xns__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="xns__inspector-sub">
							{{ selectedCluster.xrToolchain || selectedCluster.xrStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="xns__inspector-actions">
						<button
							type="button"
							class="xns__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="xns__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="xns__lineage-grid">
					<div class="xns__lineage-item">
						<span class="xns__lineage-label">{{ t('duplicatefinder', 'Scene Stem & XR Toolchain') }}</span>
						<strong class="xns__lineage-val">{{ selectedCluster.xrToolchain ? `${selectedCluster.xrToolchain} / ` : '' }}{{ selectedCluster.xrStem }} ({{ selectedCluster.xrAnchorKey }})</strong>
					</div>
					<div class="xns__lineage-item">
						<span class="xns__lineage-label">{{ t('duplicatefinder', 'Spatial Calibration, Safety & Master Governance') }}</span>
						<strong class="xns__lineage-val">
							{{ selectedCluster.hasProtectedSafetyHold ? t('duplicatefinder', 'XR Optics, SAR, or Boundary Safety Hold Shielded') : (selectedCluster.hasProtectedSpatialCalibration ? t('duplicatefinder', 'OpenXR, USDZ, or IPD Calibration Baseline Shielded') : (selectedCluster.hasProtectedNerfSplatMaster ? t('duplicatefinder', 'Verified NeRF, 3DGS, COLMAP, or Volumetric Master Shielded') : t('duplicatefinder', 'Training/Runtime Scratch or Derived Turntable/WebXR Preview'))) }}
						</strong>
					</div>
					<div class="xns__lineage-item">
						<span class="xns__lineage-label">{{ t('duplicatefinder', 'NeRF / 3DGS / Volumetric Anchor') }}</span>
						<strong class="xns__lineage-val">
							{{ selectedCluster.hasXrMasterAnchor ? t('duplicatefinder', 'Verified NeRF, 3DGS, Volumetric, or OpenXR Anchor Found') : t('duplicatefinder', 'No XR or NeRF/3DGS Master Anchor Detected') }}
						</strong>
					</div>
					<div class="xns__lineage-item">
						<span class="xns__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="xns__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="xns__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="xns__member-card">
						<div class="xns__member-top">
							<code class="xns__member-path">{{ member.normalized }}</code>
							<div class="xns__member-pills">
								<span
									v-if="member.isRedundantXrExportMember"
									class="xns__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT PREVIEW (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="xns__pill is-warn">
									{{ t('duplicatefinder', 'XR / SPLAT SCRATCH') }}
								</span>
								<span
									class="xns__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.xrTag"
									class="xns__pill is-consolidate">
									{{ member.xrTag }}
								</span>
								<span
									class="xns__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="xns__member-bottom">
							<div class="xns__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="xns__member-actions">
								<button
									type="button"
									class="xns__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantXrExportMember) && !(member.isProtectedSafetyHold && protectSafetyComplianceHolds) && !(member.isProtectedSpatialCalibration && protectSpatialCalibrationAndSafetyHolds) && !(member.isProtectedNerfSplatMaster && protectNerfSplatVolumetricMasters)"
									class="xns__override-field">
									<span class="xns__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="xns__override-select"
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

				<div class="xns__code-panels">
					<div class="xns__code-box">
						<div class="xns__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="xns__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="xns__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="xns__code-box">
						<div class="xns__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="xns__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="xns__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	XR_SPATIAL_NERF_SPLAT_PRESETS,
	auditXrSpatialNerfSplatVault,
	buildXrSpatialNerfSplatCsvReport,
	buildXrSpatialNerfSplatJsonManifest,
	buildXrSpatialNerfSplatRemediationScript,
	buildXrSpatialNerfSplatSyncExcludeList,
} from '../tools/xrSpatialNerfSplatVaultAuditor'

export default {
	name: 'XrSpatialNerfSplatVaultWorkbench',
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
			presetId: 'all-xr-spatial-nerf-splat-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-previews-and-xr-scratch',
			survivorRule: 'xr-calibration-nerf-master-first',
			protectSpatialCalibrationAndSafetyHolds: true,
			protectNerfSplatVolumetricMasters: true,
			protectSafetyComplianceHolds: true,
			requireXrMasterAnchorForPrune: true,
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
			return XR_SPATIAL_NERF_SPLAT_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'xr-preview-redundant', label: this.t('duplicatefinder', 'Turntable / WebXR LODs') },
				{ id: 'xr-runtime-scratch', label: this.t('duplicatefinder', 'Training / Runtime Scratch') },
				{ id: 'xr-spatial-calibration-protected', label: this.t('duplicatefinder', 'OpenXR / USDZ Calib') },
				{ id: 'xr-nerf-splat-master-protected', label: this.t('duplicatefinder', 'NeRF / 3DGS Masters') },
				{ id: 'xr-safety-hold-protected', label: this.t('duplicatefinder', 'Safety Hold') },
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
			return auditXrSpatialNerfSplatVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectSpatialCalibrationAndSafetyHolds: this.protectSpatialCalibrationAndSafetyHolds,
				protectNerfSplatVolumetricMasters: this.protectNerfSplatVolumetricMasters,
				protectSafetyComplianceHolds: this.protectSafetyComplianceHolds,
				requireXrMasterAnchorForPrune: this.requireXrMasterAnchorForPrune,
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
			return buildXrSpatialNerfSplatRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildXrSpatialNerfSplatSyncExcludeList()
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
			const preset = XR_SPATIAL_NERF_SPLAT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectSpatialCalibrationAndSafetyHolds = preset.protectSpatialCalibrationAndSafetyHolds
			this.protectNerfSplatVolumetricMasters = preset.protectNerfSplatVolumetricMasters
			this.protectSafetyComplianceHolds = preset.protectSafetyComplianceHolds
			this.requireXrMasterAnchorForPrune = preset.requireXrMasterAnchorForPrune
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
				'xr-spatial-calibration-protected': this.t('duplicatefinder', 'OpenXR / USDZ Calib'),
				'xr-nerf-splat-master-protected': this.t('duplicatefinder', 'NeRF / 3DGS Master'),
				'xr-safety-hold-protected': this.t('duplicatefinder', 'XR Safety Hold'),
				'xr-preview-redundant': this.t('duplicatefinder', 'Redundant Preview'),
				'xr-runtime-scratch': this.t('duplicatefinder', 'XR / Splat Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'xr-preview-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'xr-spatial-calibration-protected' || verdict === 'xr-safety-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'xr-nerf-splat-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'xr-runtime-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantXrExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-previews-and-xr-scratch' && (member.isRedundantXrExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied XR Spatial, NeRF/3DGS or Volumetric vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 XR Spatial, NeRF/3DGS & Volumetric remediation script to clipboard.'))
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
			const csv = buildXrSpatialNerfSplatCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-xr-spatial-nerf-splat-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe XR Spatial, NeRF/3DGS & Volumetric Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildXrSpatialNerfSplatJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-xr-spatial-nerf-splat-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported XR Spatial, NeRF/3DGS & Volumetric Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.xr-spatial-nerf-splat-vault-workbench {
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

.xns__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.xns__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.xns__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.xns__status-badge {
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

.xns__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.xns__tool-btn,
.xns__seg-btn,
.xns__primary-btn,
.xns__load-more-btn,
.xns__mini-btn {
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

.xns__tool-btn.is-primary-outline,
.xns__primary-btn {
	border-color: var(--color-primary-element);
}

.xns__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.xns__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.xns__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.xns__tool-btn:focus-visible,
.xns__seg-btn:focus-visible,
.xns__primary-btn:focus-visible,
.xns__load-more-btn:focus-visible,
.xns__mini-btn:focus-visible,
.xns__cluster-card:focus-visible,
.xns__input:focus-visible,
.xns__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.xns__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.xns__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.xns__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.xns__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.xns__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.xns__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.xns__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.xns__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.xns__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.xns__empty-banner,
.xns__empty-filter {
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

.xns__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.xns__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.xns__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.xns__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.xns__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.xns__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.xns__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.xns__inputs-row {
	align-items: flex-end;
}

.xns__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.xns__field-grow {
	flex: 1 1 220px;
}

.xns__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.xns__input,
.xns__override-select {
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

.xns__num-input {
	inline-size: 96px;
}

.xns__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.xns__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.xns__cluster-card {
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

.xns__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.xns__cluster-top,
.xns__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.xns__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.xns__cluster-meta,
.xns__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.xns__tag {
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

.xns__badge,
.xns__pill {
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

.xns__pill.is-keep,
.xns__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.xns__pill.is-redundant,
.xns__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.xns__pill.is-consolidate,
.xns__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.xns__pill.is-warn,
.xns__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.xns__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.xns__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.xns__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.xns__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.xns__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.xns__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.xns__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.xns__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.xns__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.xns__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.xns__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.xns__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.xns__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.xns__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.xns__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.xns__member-top,
.xns__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.xns__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.xns__member-pills,
.xns__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.xns__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.xns__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.xns__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.xns__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.xns__pre {
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

.xns__sr-only {
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
	.xns__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.xns__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.xns__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.xns__kpis,
	.xns__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.xns__num-input {
		inline-size: 100%;
	}

	.xns__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.xns__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.xns__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.xns__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.xr-spatial-nerf-splat-vault-workbench {
		padding: 10px;
	}

	.xns__kpis,
	.xns__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.xns__num-input {
		inline-size: 100%;
	}

	.xns__field {
		flex: 1 1 100%;
	}
}
</style>
