<template>
	<section
		class="mocap-biomechanics-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Motion Capture, Biomechanics and Optical Tracking Vault Auditor')">
		<header class="mbv__toolbar">
			<div class="mbv__title-group">
				<h3 class="mbv__title">
					{{ t('duplicatefinder', 'Motion Capture & Biomechanics Vault Auditor') }}
				</h3>
				<span
					class="mbv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {cal} cal-rig, {masters} raw-mocap, {hold} irb-hold, {retargets} retargets, {scratch} solver-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						cal: analysis.summary.totalCalRigStdClusters,
						masters: analysis.summary.totalRawMocapMasterClusters,
						hold: analysis.summary.totalEthicsHoldClusters,
						retargets: analysis.summary.totalRedundantRetargetClusters,
						scratch: analysis.summary.totalSolverScratchClusters,
					}) }}
				</span>
			</div>

			<div class="mbv__toolbar-actions">
				<button
					type="button"
					class="mbv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+M"
					:title="t('duplicatefinder', 'Hide Motion Capture and Biomechanics Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Mocap & Biomechanics') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mbv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mbv__kpis">
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Safe Retarget & Solver Reclaim') }}</span>
				<strong class="mbv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Conserved Cal/Rigs, Raw C3D & Holds') }}</span>
				<strong class="mbv__kpi-val is-warn">
					{{ analysis.summary.totalCalRigStdClusters }} {{ t('duplicatefinder', 'cal/rig') }} / {{ analysis.summary.totalRawMocapMasterClusters }} {{ t('duplicatefinder', 'raw-mocap') }} / {{ analysis.summary.totalEthicsHoldClusters }} {{ t('duplicatefinder', 'hold') }}
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Redundant Retargets & Solver Scratch') }}</span>
				<strong class="mbv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantRetargetClusters }} {{ t('duplicatefinder', 'retargets') }} / {{ analysis.summary.totalSolverScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Raw Mocap & Capture Duplicate Footprint') }}</span>
				<strong class="mbv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mbv__empty-banner"
			role="note">
			<div class="mbv__empty-text">
				<p class="mbv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Wand Cal/Rig, Raw C3D/X2D/TAK, and IRB Hold shields before scanning') }}
				</p>
				<p class="mbv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit wand calibrations, VSK/OSIM skeletal rigs, IRB/clinical-gait holds, C3D/X2D/TAK/QTM/MVN masters, retargeted FBX/BVH exports, and Vicon/Motive scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="mbv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mbv__controls">
			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mocap and biomechanics vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mbv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mbv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mbv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mbv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mbv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectCalibrationsAndRigs }"
					:aria-pressed="protectCalibrationsAndRigs ? 'true' : 'false'"
					@click="protectCalibrationsAndRigs = !protectCalibrationsAndRigs">
					<span>{{ protectCalibrationsAndRigs ? t('duplicatefinder', 'Shield Wand Cal / Rigs: ON') : t('duplicatefinder', 'Shield Wand Cal / Rigs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectRawMocapMasters }"
					:aria-pressed="protectRawMocapMasters ? 'true' : 'false'"
					@click="protectRawMocapMasters = !protectRawMocapMasters">
					<span>{{ protectRawMocapMasters ? t('duplicatefinder', 'Shield C3D / X2D / TAK / MVN: ON') : t('duplicatefinder', 'Shield C3D / X2D / TAK / MVN: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectEthicsArchiveHolds }"
					:aria-pressed="protectEthicsArchiveHolds ? 'true' : 'false'"
					@click="protectEthicsArchiveHolds = !protectEthicsArchiveHolds">
					<span>{{ protectEthicsArchiveHolds ? t('duplicatefinder', 'Shield IRB / Gait Holds: ON') : t('duplicatefinder', 'Shield IRB / Gait Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': requireMocapAnchorForPrune }"
					:aria-pressed="requireMocapAnchorForPrune ? 'true' : 'false'"
					@click="requireMocapAnchorForPrune = !requireMocapAnchorForPrune">
					<span>{{ requireMocapAnchorForPrune ? t('duplicatefinder', 'Require C3D / Mocap Anchor: ON') : t('duplicatefinder', 'Require C3D / Mocap Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="mbv__control-row mbv__inputs-row">
				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mbv__input">
						<option value="prune-retargets-and-solver-scratch">{{ t('duplicatefinder', 'Prune Redundant Retargets & Scratch') }}</option>
						<option value="hardlink-immutable-c3d-x2d-and-tak">{{ t('duplicatefinder', 'Hardlink Immutable C3D/X2D/TAK (Block Mutable)') }}</option>
						<option value="quarantine-retargets-and-solver-scratch">{{ t('duplicatefinder', 'Quarantine Retarget Exports & Solver Scratch') }}</option>
					</select>
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mbv__input">
						<option value="cal-raw-mocap-master-first">{{ t('duplicatefinder', 'Cal/Rigs, Raw C3D/X2D & TAK first') }}</option>
						<option value="oldest-session-first">{{ t('duplicatefinder', 'Oldest capture session first') }}</option>
						<option value="newest-solve-first">{{ t('duplicatefinder', 'Newest solve first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Session Grace (d)') }}</span>
					<input
						v-model="keepRecentSessionDaysInput"
						type="number"
						min="0"
						step="1"
						class="mbv__input mbv__num-input">
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="mbv__input mbv__num-input">
				</label>

				<label class="mbv__field mbv__field-grow">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Filter Take, C3D, X2D, TAK, QTM, MVN or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mbv__input"
						:placeholder="t('duplicatefinder', 'e.g. c3d, x2d, tak, qtm, mvn, xcp, vsk, fbx, vicon_tmp, motive_cache')">
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mbv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Retarget & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mocap and biomechanics artifact family filter')">
					<button
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mocap and biomechanics governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mbv__seg-btn"
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
			class="mbv__empty-filter"
			role="note">
			<p class="mbv__empty-title">
				{{ t('duplicatefinder', 'No wand calibrations, raw C3D/X2D/TAK/QTM/MVN masters, retargeted FBX/BVH exports, or Vicon/Motive scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="mbv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mbv__workspace">
			<div
				class="mbv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Motion Capture and Biomechanics vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="mbv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="mbv__cluster-top">
						<strong class="mbv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="mbv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="mbv__cluster-meta">
						<span
							v-if="cluster.mocapToolchain"
							class="mbv__tag">{{ cluster.mocapToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="mbv__tag">{{ cluster.workflowStage }}</span>
						<span class="mbv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="mbv__cluster-badges">
						<span
							v-if="cluster.hasRedundantMocapRetarget"
							class="mbv__badge is-redundant">
							{{ cluster.hasMocapMasterAnchor
								? t('duplicatefinder', 'Redundant Retarget (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Retarget (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedEthicsHold"
							class="mbv__badge is-keep">
							{{ t('duplicatefinder', 'IRB / Gait Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCalRigBaseline"
							class="mbv__badge is-keep">
							{{ t('duplicatefinder', 'Wand Cal / Rig Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawMocapMaster"
							class="mbv__badge is-consolidate">
							{{ t('duplicatefinder', 'Raw Mocap / C3D Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasSolverScratchIntermediate"
							class="mbv__badge is-warn">
							{{ t('duplicatefinder', 'Solver / Retake Scratch') }}
						</span>
					</div>
					<div class="mbv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mbv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mbv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mbv__inspector">
				<header class="mbv__inspector-head">
					<div class="mbv__inspector-title-wrap">
						<h4 class="mbv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="mbv__inspector-sub">
							{{ selectedCluster.mocapToolchain || selectedCluster.takeStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="mbv__inspector-actions">
						<button
							type="button"
							class="mbv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mbv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mbv__lineage-grid">
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Capture Take & Optical/IMU Toolchain') }}</span>
						<strong class="mbv__lineage-val">{{ selectedCluster.mocapToolchain ? `${selectedCluster.mocapToolchain} / ` : '' }}{{ selectedCluster.takeStem }} ({{ selectedCluster.mocapAnchorKey }})</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Calibration, Rig & Ethics Hold Governance') }}</span>
						<strong class="mbv__lineage-val">
							{{ selectedCluster.hasProtectedEthicsHold ? t('duplicatefinder', 'IRB, Clinical-Gait or NDA Hold Shielded') : (selectedCluster.hasProtectedCalRigBaseline ? t('duplicatefinder', 'Wand Calibration, Rig & Force-Plate Matrix Shielded') : (selectedCluster.hasProtectedRawMocapMaster ? t('duplicatefinder', 'Raw C3D, X2D, TAK, QTM & MVN Master Shielded') : t('duplicatefinder', 'Solver Scratch or Retargeted FBX/BVH Export'))) }}
						</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Raw Mocap / C3D Master Anchor') }}</span>
						<strong class="mbv__lineage-val">
							{{ selectedCluster.hasMocapMasterAnchor ? t('duplicatefinder', 'Verified Raw C3D, X2D, TAK, QTM or MVN Anchor Found') : t('duplicatefinder', 'No Raw Mocap or Biomechanics Anchor Detected') }}
						</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mbv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="mbv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="mbv__member-card">
						<div class="mbv__member-top">
							<code class="mbv__member-path">{{ member.normalized }}</code>
							<div class="mbv__member-pills">
								<span
									v-if="member.isRedundantMocapRetargetMember"
									class="mbv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT RETARGET (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="mbv__pill is-warn">
									{{ t('duplicatefinder', 'SOLVER SCRATCH') }}
								</span>
								<span
									class="mbv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.mocapTag"
									class="mbv__pill is-consolidate">
									{{ member.mocapTag }}
								</span>
								<span
									class="mbv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="mbv__member-bottom">
							<div class="mbv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="mbv__member-actions">
								<button
									type="button"
									class="mbv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantMocapRetargetMember) && !(member.isProtectedEthicsArchiveHold && protectEthicsArchiveHolds) && !(member.isProtectedCalibrationRigBaseline && protectCalibrationsAndRigs) && !(member.isProtectedRawMocapMaster && protectRawMocapMasters)"
									class="mbv__override-field">
									<span class="mbv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="mbv__override-select"
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

				<div class="mbv__code-panels">
					<div class="mbv__code-box">
						<div class="mbv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mbv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mbv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mbv__code-box">
						<div class="mbv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mbv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mbv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	MOCAP_BIOMECHANICS_PRESETS,
	auditMocapBiomechanicsVault,
	buildMocapBiomechanicsCsvReport,
	buildMocapBiomechanicsJsonManifest,
	buildMocapBiomechanicsRemediationScript,
	buildMocapBiomechanicsSyncExcludeList,
} from '../tools/mocapBiomechanicsVaultAuditor'

export default {
	name: 'MocapBiomechanicsVaultWorkbench',
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
			presetId: 'all-mocap-biomechanics-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-retargets-and-solver-scratch',
			survivorRule: 'cal-raw-mocap-master-first',
			protectCalibrationsAndRigs: true,
			protectRawMocapMasters: true,
			protectEthicsArchiveHolds: true,
			requireMocapAnchorForPrune: true,
			keepRecentSessionDaysInput: '0',
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
			return MOCAP_BIOMECHANICS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'mocap-retarget-redundant', label: this.t('duplicatefinder', 'Retargets / Previews') },
				{ id: 'solver-scratch-intermediate', label: this.t('duplicatefinder', 'Solver Scratch') },
				{ id: 'cal-rig-std-protected', label: this.t('duplicatefinder', 'Wand Cal / Rigs') },
				{ id: 'raw-mocap-master-protected', label: this.t('duplicatefinder', 'Raw C3D / X2D / TAK') },
				{ id: 'ethics-hold-protected', label: this.t('duplicatefinder', 'IRB / Gait Hold') },
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
		parsedKeepRecentSessionDays() {
			const trimmed = String(this.keepRecentSessionDaysInput ?? '').trim()
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
			return auditMocapBiomechanicsVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCalibrationsAndRigs: this.protectCalibrationsAndRigs,
				protectRawMocapMasters: this.protectRawMocapMasters,
				protectEthicsArchiveHolds: this.protectEthicsArchiveHolds,
				requireMocapAnchorForPrune: this.requireMocapAnchorForPrune,
				keepRecentSessionDays: this.parsedKeepRecentSessionDays,
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
			return buildMocapBiomechanicsRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildMocapBiomechanicsSyncExcludeList()
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
			const preset = MOCAP_BIOMECHANICS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCalibrationsAndRigs = preset.protectCalibrationsAndRigs
			this.protectRawMocapMasters = preset.protectRawMocapMasters
			this.protectEthicsArchiveHolds = preset.protectEthicsArchiveHolds
			this.requireMocapAnchorForPrune = preset.requireMocapAnchorForPrune
			this.keepRecentSessionDaysInput = String(preset.keepRecentSessionDays)
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
				'cal-rig-std-protected': this.t('duplicatefinder', 'Wand Cal / Rig'),
				'raw-mocap-master-protected': this.t('duplicatefinder', 'Raw Mocap / C3D'),
				'ethics-hold-protected': this.t('duplicatefinder', 'IRB / Gait Hold'),
				'mocap-retarget-redundant': this.t('duplicatefinder', 'Redundant Retarget'),
				'solver-scratch-intermediate': this.t('duplicatefinder', 'Solver Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'mocap-retarget-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'cal-rig-std-protected' || verdict === 'ethics-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-mocap-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'solver-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantMocapRetargetMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-retargets-and-solver-scratch' && (member.isRedundantMocapRetarget || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Mocap or Biomechanics vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Mocap & Biomechanics remediation script to clipboard.'))
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
			const csv = buildMocapBiomechanicsCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-mocap-biomechanics-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Mocap & Biomechanics Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMocapBiomechanicsJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-mocap-biomechanics-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Mocap & Biomechanics Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.mocap-biomechanics-vault-workbench {
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

.mbv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.mbv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mbv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mbv__status-badge {
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

.mbv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mbv__tool-btn,
.mbv__seg-btn,
.mbv__primary-btn,
.mbv__load-more-btn,
.mbv__mini-btn {
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

.mbv__tool-btn.is-primary-outline,
.mbv__primary-btn {
	border-color: var(--color-primary-element);
}

.mbv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.mbv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mbv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.mbv__tool-btn:focus-visible,
.mbv__seg-btn:focus-visible,
.mbv__primary-btn:focus-visible,
.mbv__load-more-btn:focus-visible,
.mbv__mini-btn:focus-visible,
.mbv__cluster-card:focus-visible,
.mbv__input:focus-visible,
.mbv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mbv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.mbv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.mbv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mbv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mbv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mbv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mbv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.mbv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.mbv__empty-banner,
.mbv__empty-filter {
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

.mbv__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mbv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.mbv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mbv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.mbv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mbv__inputs-row {
	align-items: flex-end;
}

.mbv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mbv__field-grow {
	flex: 1 1 220px;
}

.mbv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__input,
.mbv__override-select {
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

.mbv__num-input {
	inline-size: 96px;
}

.mbv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mbv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mbv__cluster-card {
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

.mbv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mbv__cluster-top,
.mbv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.mbv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mbv__cluster-meta,
.mbv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.mbv__tag {
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

.mbv__badge,
.mbv__pill {
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

.mbv__pill.is-keep,
.mbv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mbv__pill.is-redundant,
.mbv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.mbv__pill.is-consolidate,
.mbv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mbv__pill.is-warn,
.mbv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mbv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.mbv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mbv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mbv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.mbv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mbv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mbv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.mbv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mbv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mbv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__member-top,
.mbv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mbv__member-pills,
.mbv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mbv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.mbv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mbv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.mbv__pre {
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

.mbv__sr-only {
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
	.mbv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mbv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.mbv__kpis,
	.mbv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__num-input {
		inline-size: 100%;
	}

	.mbv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.mbv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mbv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.mocap-biomechanics-vault-workbench {
		padding: 10px;
	}

	.mbv__kpis,
	.mbv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__num-input {
		inline-size: 100%;
	}

	.mbv__field {
		flex: 1 1 100%;
	}
}
</style>
