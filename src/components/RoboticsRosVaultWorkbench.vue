<template>
	<section
		class="robotics-ros-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Robotics, Autonomous Systems, ROS2 Bags and LiDAR Point Cloud Vault Auditor')">
		<header class="rrv__toolbar">
			<div class="rrv__title-group">
				<h3 class="rrv__title">
					{{ t('duplicatefinder', 'Robotics, Autonomous Systems, ROS2 Bags & LiDAR Point Cloud Vault Auditor') }}
				</h3>
				<span
					class="rrv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {kinematics} urdf+calib, {bags} mcap.zst+bag, {lidar} laz+e57, {raw} bag+las-dup, {scratch} sim-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						kinematics: analysis.summary.totalKinematicsClusters,
						bags: analysis.summary.totalCompressedRosbagClusters,
						lidar: analysis.summary.totalLidarClusters,
						raw: analysis.summary.totalRedundantBagLasClusters,
						scratch: analysis.summary.totalSimScratchClusters,
					}) }}
				</span>
			</div>

			<div class="rrv__toolbar-actions">
				<button
					type="button"
					class="rrv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="rrv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="rrv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="rrv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="rrv__tool-btn is-close"
					aria-keyshortcuts="Shift+F12"
					:title="t('duplicatefinder', 'Hide Robotics, Autonomous Systems, ROS2 Bags and LiDAR Point Cloud Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Robotics & ROS2 Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="rrv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="rrv__kpis">
			<div class="rrv__kpi">
				<span class="rrv__kpi-label">{{ t('duplicatefinder', 'Safe Telemetry & Sim Scratch Reclaim') }}</span>
				<strong class="rrv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="rrv__kpi">
				<span class="rrv__kpi-label">{{ t('duplicatefinder', 'Conserved URDF, MCAP.ZST & LAZ Vaults') }}</span>
				<strong class="rrv__kpi-val is-warn">
					{{ analysis.summary.totalKinematicsClusters }} {{ t('duplicatefinder', 'urdf/calib') }} / {{ analysis.summary.totalCompressedRosbagClusters }} {{ t('duplicatefinder', 'mcap.zst/bag') }} / {{ analysis.summary.totalLidarClusters }} {{ t('duplicatefinder', 'laz/e57') }}
				</strong>
			</div>
			<div class="rrv__kpi">
				<span class="rrv__kpi-label">{{ t('duplicatefinder', 'Redundant .bag/.las & Colcon Scratch') }}</span>
				<strong class="rrv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantBagLasClusters }} {{ t('duplicatefinder', 'bag/las-dup') }} / {{ analysis.summary.totalSimScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="rrv__kpi">
				<span class="rrv__kpi-label">{{ t('duplicatefinder', 'Raw Robotics Duplicate Footprint') }}</span>
				<strong class="rrv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="rrv__empty-banner"
			role="note">
			<div class="rrv__empty-text">
				<p class="rrv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure URDF/calibration, MCAP.ZST, and LAZ shields before scanning') }}
				</p>
				<p class="rrv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit robot kinematics (.urdf, .xacro, .srdf, extrinsics .yaml), ROS2 telemetry (.mcap, .mcap.zst, .bag, .bag.lz4, .db3), LiDAR point clouds (.laz, .las, .pcd, .e57), and Colcon/Gazebo/Isaac scratch (colcon_build/, gazebo_cache/, slam_tmp/).') }}
				</p>
			</div>
			<button
				type="button"
				class="rrv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="rrv__controls">
			<div class="rrv__control-row">
				<span class="rrv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="rrv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Robotics and ROS2 vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="rrv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="rrv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="rrv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="rrv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="rrv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="rrv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="rrv__seg-btn"
					:class="{ 'is-active': protectKinematicsAndCalibration }"
					:aria-pressed="protectKinematicsAndCalibration ? 'true' : 'false'"
					@click="protectKinematicsAndCalibration = !protectKinematicsAndCalibration">
					<span>{{ protectKinematicsAndCalibration ? t('duplicatefinder', 'Shield .urdf/calib: ON') : t('duplicatefinder', 'Shield .urdf/calib: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rrv__seg-btn"
					:class="{ 'is-active': protectCompressedRosbags }"
					:aria-pressed="protectCompressedRosbags ? 'true' : 'false'"
					@click="protectCompressedRosbags = !protectCompressedRosbags">
					<span>{{ protectCompressedRosbags ? t('duplicatefinder', 'Shield .mcap.zst/.bag.lz4: ON') : t('duplicatefinder', 'Shield .mcap.zst/.bag.lz4: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rrv__seg-btn"
					:class="{ 'is-active': protectCanonicalLidarCaptures }"
					:aria-pressed="protectCanonicalLidarCaptures ? 'true' : 'false'"
					@click="protectCanonicalLidarCaptures = !protectCanonicalLidarCaptures">
					<span>{{ protectCanonicalLidarCaptures ? t('duplicatefinder', 'Shield .laz/.e57/.pcd: ON') : t('duplicatefinder', 'Shield .laz/.e57/.pcd: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rrv__seg-btn"
					:class="{ 'is-active': requireCompressedAnchorForPrune }"
					:aria-pressed="requireCompressedAnchorForPrune ? 'true' : 'false'"
					@click="requireCompressedAnchorForPrune = !requireCompressedAnchorForPrune">
					<span>{{ requireCompressedAnchorForPrune ? t('duplicatefinder', 'Require .zst/.laz Anchor: ON') : t('duplicatefinder', 'Require .zst/.laz Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="rrv__control-row rrv__inputs-row">
				<label class="rrv__field">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="rrv__input">
						<option value="prune-uncompressed-bags-and-sim-scratch">{{ t('duplicatefinder', 'Prune Redundant .bag/.las & Sim Scratch') }}</option>
						<option value="hardlink-immutable-bags-and-lidar">{{ t('duplicatefinder', 'Hardlink Immutable .mcap.zst/.laz (Block Mutable)') }}</option>
						<option value="quarantine-uncompressed-bags-and-scratch">{{ t('duplicatefinder', 'Quarantine Uncompressed .bag/.las & Scratch') }}</option>
					</select>
				</label>

				<label class="rrv__field">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="rrv__input">
						<option value="mission-vault-archive-first">{{ t('duplicatefinder', 'Archived URDF, MCAP.ZST & LAZ first') }}</option>
						<option value="oldest-mission-first">{{ t('duplicatefinder', 'Oldest mission mtime first') }}</option>
						<option value="newest-calibration-first">{{ t('duplicatefinder', 'Newest calibration revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="rrv__field">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Mission Grace (d)') }}</span>
					<input
						v-model="keepRecentMissionDaysInput"
						type="number"
						min="0"
						step="1"
						class="rrv__input rrv__num-input">
				</label>

				<label class="rrv__field">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="rrv__input rrv__num-input">
				</label>

				<label class="rrv__field rrv__field-grow">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Filter Mission, Middleware Platform, Telemetry Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="rrv__input"
						:placeholder="t('duplicatefinder', 'e.g. urdf, mcap.zst, rosbag, lidar, laz, gazebo, colcon')">
				</label>

				<label class="rrv__field">
					<span class="rrv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="rrv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Redundant .bag/.las & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="rrv__control-row">
				<span class="rrv__control-label">{{ t('duplicatefinder', 'Robotics Family') }}</span>
				<div
					class="rrv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Robotics and ROS2 artifact family filter')">
					<button
						type="button"
						class="rrv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="rrv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="rrv__control-row">
				<span class="rrv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="rrv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Robotics governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="rrv__seg-btn"
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
			class="rrv__empty-filter"
			role="note">
			<p class="rrv__empty-title">
				{{ t('duplicatefinder', 'No robot kinematics, ROS2 bags, LiDAR point clouds, or Colcon scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="rrv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="rrv__workspace">
			<div
				class="rrv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Robotics and ROS2 vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="rrv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="rrv__cluster-top">
						<strong class="rrv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="rrv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="rrv__cluster-meta">
						<span
							v-if="cluster.roboticsPlatform"
							class="rrv__tag">{{ cluster.roboticsPlatform }}</span>
						<span
							v-if="cluster.pipelineStage"
							class="rrv__tag">{{ cluster.pipelineStage }}</span>
						<span class="rrv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="rrv__cluster-badges">
						<span
							v-if="cluster.hasRedundantUncompressedBagOrLas"
							class="rrv__badge is-redundant">
							{{ (cluster.hasCompressedBagAnchor || cluster.hasCompressedLidarAnchor)
								? t('duplicatefinder', 'Redundant Uncompressed (Archive Anchor Exists)')
								: t('duplicatefinder', 'Uncompressed .bag/.las (No Archive Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedKinematicsCalibration"
							class="rrv__badge is-keep">
							{{ t('duplicatefinder', 'URDF / Calibration Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCompressedRosbag"
							class="rrv__badge is-keep">
							{{ t('duplicatefinder', 'MCAP.ZST / BAG.LZ4 Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedLidarCapture"
							class="rrv__badge is-consolidate">
							{{ t('duplicatefinder', 'LAZ / E57 / PCD Conserved') }}
						</span>
						<span
							v-if="cluster.hasSimScratchIntermediate"
							class="rrv__badge is-warn">
							{{ t('duplicatefinder', 'Colcon / Gazebo / SLAM Scratch') }}
						</span>
					</div>
					<div class="rrv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="rrv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="rrv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="rrv__inspector">
				<header class="rrv__inspector-head">
					<div class="rrv__inspector-title-wrap">
						<h4 class="rrv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="rrv__inspector-sub">
							{{ selectedCluster.roboticsPlatform || selectedCluster.lineageStem }} | {{ selectedCluster.pipelineStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="rrv__inspector-actions">
						<button
							type="button"
							class="rrv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="rrv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="rrv__lineage-grid">
					<div class="rrv__lineage-item">
						<span class="rrv__lineage-label">{{ t('duplicatefinder', 'Mission Lineage & Robotics Stack') }}</span>
						<strong class="rrv__lineage-val">{{ selectedCluster.roboticsPlatform ? `${selectedCluster.roboticsPlatform} / ` : '' }}{{ selectedCluster.lineageStem }} ({{ selectedCluster.missionAnchorKey }})</strong>
					</div>
					<div class="rrv__lineage-item">
						<span class="rrv__lineage-label">{{ t('duplicatefinder', 'Mission Shield & Vault Governance') }}</span>
						<strong class="rrv__lineage-val">
							{{ selectedCluster.hasProtectedKinematicsCalibration ? t('duplicatefinder', 'URDF / Extrinsics Calibration Shielded') : (selectedCluster.hasProtectedCompressedRosbag ? t('duplicatefinder', 'MCAP.ZST / BAG.LZ4 Archive Shielded') : (selectedCluster.hasProtectedLidarCapture ? t('duplicatefinder', 'LAZ / E57 / PCD Capture Shielded') : t('duplicatefinder', 'Colcon or Simulation Scratch Artifact'))) }}
						</strong>
					</div>
					<div class="rrv__lineage-item">
						<span class="rrv__lineage-label">{{ t('duplicatefinder', 'Compressed Telemetry / LAZ Anchor') }}</span>
						<strong class="rrv__lineage-val">
							{{ (selectedCluster.hasCompressedBagAnchor || selectedCluster.hasCompressedLidarAnchor) ? t('duplicatefinder', 'Verified .mcap.zst / .bag.lz4 / .laz Anchor Found') : t('duplicatefinder', 'No Compressed Telemetry or LAZ Anchor Detected') }}
						</strong>
					</div>
					<div class="rrv__lineage-item">
						<span class="rrv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="rrv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="rrv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="rrv__member-card">
						<div class="rrv__member-top">
							<code class="rrv__member-path">{{ member.normalized }}</code>
							<div class="rrv__member-pills">
								<span
									v-if="member.isRedundantBagMember"
									class="rrv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT .BAG/.DB3 (ARCHIVE EXISTS)') }}
								</span>
								<span
									v-if="member.isRedundantLasMember"
									class="rrv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT .LAS (LAZ EXISTS)') }}
								</span>
								<span
									v-if="member.isSimBuildScratchPath"
									class="rrv__pill is-warn">
									{{ t('duplicatefinder', 'COLCON / GAZEBO SCRATCH') }}
								</span>
								<span
									class="rrv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.roboticsTag"
									class="rrv__pill is-consolidate">
									{{ member.roboticsTag }}
								</span>
								<span
									class="rrv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="rrv__member-bottom">
							<div class="rrv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="rrv__member-actions">
								<button
									type="button"
									class="rrv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isProtectedKinematicsCalibration && protectKinematicsAndCalibration) && !(member.isProtectedCompressedRosbag && protectCompressedRosbags) && !(member.isProtectedLidarCapture && protectCanonicalLidarCaptures)"
									class="rrv__override-field">
									<span class="rrv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="rrv__override-select"
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

				<div class="rrv__code-panels">
					<div class="rrv__code-box">
						<div class="rrv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="rrv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="rrv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="rrv__code-box">
						<div class="rrv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="rrv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="rrv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	ROBOTICS_ROS_PRESETS,
	auditRoboticsRosVault,
	buildRoboticsRosCsvReport,
	buildRoboticsRosJsonManifest,
	buildRoboticsRosRemediationScript,
	buildRoboticsRosSyncExcludeList,
} from '../tools/roboticsRosVaultAuditor'

export default {
	name: 'RoboticsRosVaultWorkbench',
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
			presetId: 'all-robotics-ros-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-uncompressed-bags-and-sim-scratch',
			survivorRule: 'mission-vault-archive-first',
			protectKinematicsAndCalibration: true,
			protectCompressedRosbags: true,
			protectCanonicalLidarCaptures: true,
			requireCompressedAnchorForPrune: true,
			keepRecentMissionDaysInput: '0',
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
			return ROBOTICS_ROS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'uncompressed-bag-las-redundant', label: this.t('duplicatefinder', 'Redundant .bag/.las') },
				{ id: 'colcon-sim-scratch-intermediate', label: this.t('duplicatefinder', 'Colcon/Sim Scratch') },
				{ id: 'kinematics-calibration-protected', label: this.t('duplicatefinder', 'URDF / Calib') },
				{ id: 'compressed-rosbag-protected', label: this.t('duplicatefinder', 'MCAP.ZST / BAG.LZ4') },
				{ id: 'lidar-pointcloud-protected', label: this.t('duplicatefinder', 'LAZ / E57 / PCD') },
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
		parsedKeepRecentMissionDays() {
			const trimmed = String(this.keepRecentMissionDaysInput ?? '').trim()
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
			return auditRoboticsRosVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectKinematicsAndCalibration: this.protectKinematicsAndCalibration,
				protectCompressedRosbags: this.protectCompressedRosbags,
				protectCanonicalLidarCaptures: this.protectCanonicalLidarCaptures,
				requireCompressedAnchorForPrune: this.requireCompressedAnchorForPrune,
				keepRecentMissionDays: this.parsedKeepRecentMissionDays,
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
			return buildRoboticsRosRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildRoboticsRosSyncExcludeList()
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
			const preset = ROBOTICS_ROS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectKinematicsAndCalibration = preset.protectKinematicsAndCalibration
			this.protectCompressedRosbags = preset.protectCompressedRosbags
			this.protectCanonicalLidarCaptures = preset.protectCanonicalLidarCaptures
			this.requireCompressedAnchorForPrune = preset.requireCompressedAnchorForPrune
			this.keepRecentMissionDaysInput = String(preset.keepRecentMissionDays)
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
				'kinematics-calibration-protected': this.t('duplicatefinder', 'URDF / Calib'),
				'compressed-rosbag-protected': this.t('duplicatefinder', 'MCAP.ZST / BAG.LZ4'),
				'lidar-pointcloud-protected': this.t('duplicatefinder', 'LAZ / E57 / PCD'),
				'uncompressed-bag-las-redundant': this.t('duplicatefinder', 'Redundant .bag/.las'),
				'colcon-sim-scratch-intermediate': this.t('duplicatefinder', 'Colcon/Sim Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'uncompressed-bag-las-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'kinematics-calibration-protected' || verdict === 'compressed-rosbag-protected') {
				return 'is-keep'
			}
			if (verdict === 'lidar-pointcloud-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'colcon-sim-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantUncompressedMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-uncompressed-bags-and-scratch' && (member.isUncompressedRosbagFile || member.isUncompressedLasFile || member.isSimBuildScratchPath))
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
			return cluster.group
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
				this.setNotice(this.t('duplicatefinder', 'Copied Robotics or ROS2 vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Robotics & ROS2 remediation script to clipboard.'))
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
			const csv = buildRoboticsRosCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-robotics-ros-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Robotics & ROS2 Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildRoboticsRosJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-robotics-ros-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Robotics & ROS2 Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.robotics-ros-vault-workbench {
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

.rrv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.rrv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.rrv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.rrv__status-badge {
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

.rrv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rrv__tool-btn,
.rrv__seg-btn,
.rrv__primary-btn,
.rrv__load-more-btn,
.rrv__mini-btn {
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

.rrv__tool-btn:hover:not(:disabled),
.rrv__seg-btn:hover:not(:disabled),
.rrv__load-more-btn:hover:not(:disabled),
.rrv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.rrv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.rrv__tool-btn.is-primary-outline,
.rrv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rrv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.rrv__tool-btn:focus-visible,
.rrv__seg-btn:focus-visible,
.rrv__primary-btn:focus-visible,
.rrv__load-more-btn:focus-visible,
.rrv__mini-btn:focus-visible,
.rrv__cluster-card:focus-visible,
.rrv__input:focus-visible,
.rrv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.rrv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.rrv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.rrv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.rrv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.rrv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rrv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.rrv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rrv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.rrv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.rrv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.rrv__empty-banner,
.rrv__empty-filter {
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

.rrv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.rrv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.rrv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.rrv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.rrv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.rrv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.rrv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.rrv__inputs-row {
	align-items: flex-end;
}

.rrv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.rrv__field-grow {
	flex: 1 1 180px;
}

.rrv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.rrv__input,
.rrv__override-select {
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

.rrv__num-input {
	inline-size: 96px;
}

.rrv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.rrv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.rrv__cluster-card {
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

.rrv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.rrv__cluster-top,
.rrv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.rrv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.rrv__cluster-meta,
.rrv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.rrv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.rrv__badge,
.rrv__pill {
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

.rrv__pill.is-keep,
.rrv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.rrv__pill.is-redundant,
.rrv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.rrv__pill.is-consolidate,
.rrv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.rrv__pill.is-warn,
.rrv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.rrv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.rrv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.rrv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rrv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.rrv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.rrv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rrv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rrv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rrv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.rrv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rrv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.rrv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.rrv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.rrv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.rrv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rrv__member-top,
.rrv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rrv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.rrv__member-pills,
.rrv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.rrv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.rrv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.rrv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rrv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.rrv__pre {
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

.rrv__sr-only {
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
	.rrv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.rrv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.rrv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.robotics-ros-vault-workbench {
		padding: 10px;
	}

	.rrv__kpis,
	.rrv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.rrv__num-input {
		inline-size: 100%;
	}

	.rrv__field {
		flex: 1 1 100%;
	}
}
</style>
