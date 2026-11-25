<template>
	<section
		class="particle-physics-hep-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Particle Physics, HEP Detector and Synchrotron Beamline Vault Auditor')">
		<header class="pph__toolbar">
			<div class="pph__title-group">
				<h3 class="pph__title">
					{{ t('duplicatefinder', 'Particle Physics & HEP Beamline Vault Auditor') }}
				</h3>
				<span
					class="pph__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {calib} calib-gdml, {masters} root-nxs, {hold} safety-hold, {exports} ntuple-export, {scratch} sim-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						calib: analysis.summary.totalCalibClusters,
						masters: analysis.summary.totalRootMasterClusters,
						hold: analysis.summary.totalSafetyHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalSimScratchClusters,
					}) }}
				</span>
			</div>

			<div class="pph__toolbar-actions">
				<button
					type="button"
					class="pph__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="pph__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="pph__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="pph__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="pph__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+P"
					:title="t('duplicatefinder', 'Hide Particle Physics, HEP Detector and Synchrotron Beamline Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Particle & HEP') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="pph__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="pph__kpis">
			<div class="pph__kpi">
				<span class="pph__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="pph__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="pph__kpi">
				<span class="pph__kpi-label">{{ t('duplicatefinder', 'Conserved GDML, ROOT & Safety Holds') }}</span>
				<strong class="pph__kpi-val is-warn">
					{{ analysis.summary.totalCalibClusters }} {{ t('duplicatefinder', 'calib/gdml') }} / {{ analysis.summary.totalRootMasterClusters }} {{ t('duplicatefinder', 'root/nxs') }} / {{ analysis.summary.totalSafetyHoldClusters }} {{ t('duplicatefinder', 'safety-hold') }}
				</strong>
			</div>
			<div class="pph__kpi">
				<span class="pph__kpi-label">{{ t('duplicatefinder', 'Redundant N-Tuples & Sim Scratch') }}</span>
				<strong class="pph__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'ntuple/plots') }} / {{ analysis.summary.totalSimScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="pph__kpi">
				<span class="pph__kpi-label">{{ t('duplicatefinder', 'HEP & Beamline Duplicate Footprint') }}</span>
				<strong class="pph__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="pph__empty-banner"
			role="note">
			<div class="pph__empty-text">
				<p class="pph__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure GDML/Calibration, ROOT/NeXus, and Beam-Safety Hold shields before scanning') }}
				</p>
				<p class="pph__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit GDML detector geometries, EPICS/Tango logs, radiation/unblind holds, ROOT/NeXus/LHE/CBF masters, N-tuple CSV exports, and GEANT4/CMSSW scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="pph__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="pph__controls">
			<div class="pph__control-row">
				<span class="pph__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="pph__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Particle physics and HEP beamline vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="pph__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="pph__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="pph__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="pph__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="pph__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="pph__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="pph__seg-btn"
					:class="{ 'is-active': protectCalibrationAndGeometry }"
					:aria-pressed="protectCalibrationAndGeometry ? 'true' : 'false'"
					@click="protectCalibrationAndGeometry = !protectCalibrationAndGeometry">
					<span>{{ protectCalibrationAndGeometry ? t('duplicatefinder', 'Shield GDML / Calib / EPICS: ON') : t('duplicatefinder', 'Shield GDML / Calib / EPICS: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pph__seg-btn"
					:class="{ 'is-active': protectRootAndBeamlineMasters }"
					:aria-pressed="protectRootAndBeamlineMasters ? 'true' : 'false'"
					@click="protectRootAndBeamlineMasters = !protectRootAndBeamlineMasters">
					<span>{{ protectRootAndBeamlineMasters ? t('duplicatefinder', 'Shield ROOT / NeXus / LHE: ON') : t('duplicatefinder', 'Shield ROOT / NeXus / LHE: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pph__seg-btn"
					:class="{ 'is-active': protectBeamSafetyHolds }"
					:aria-pressed="protectBeamSafetyHolds ? 'true' : 'false'"
					@click="protectBeamSafetyHolds = !protectBeamSafetyHolds">
					<span>{{ protectBeamSafetyHolds ? t('duplicatefinder', 'Shield Safety / Unblind Holds: ON') : t('duplicatefinder', 'Shield Safety / Unblind Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pph__seg-btn"
					:class="{ 'is-active': requireHepAnchorForPrune }"
					:aria-pressed="requireHepAnchorForPrune ? 'true' : 'false'"
					@click="requireHepAnchorForPrune = !requireHepAnchorForPrune">
					<span>{{ requireHepAnchorForPrune ? t('duplicatefinder', 'Require ROOT / NeXus Anchor: ON') : t('duplicatefinder', 'Require ROOT / NeXus Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="pph__control-row pph__inputs-row">
				<label class="pph__field">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="pph__input">
						<option value="prune-exports-and-beam-scratch">{{ t('duplicatefinder', 'Prune Redundant N-Tuples & Scratch') }}</option>
						<option value="hardlink-immutable-root-and-nxs">{{ t('duplicatefinder', 'Hardlink Immutable ROOT/NeXus (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-beam-scratch">{{ t('duplicatefinder', 'Quarantine N-Tuples & Recon Scratch') }}</option>
					</select>
				</label>

				<label class="pph__field">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="pph__input">
						<option value="hep-calibration-root-first">{{ t('duplicatefinder', 'GDML/Calib & ROOT/NeXus first') }}</option>
						<option value="oldest-beam-run-first">{{ t('duplicatefinder', 'Oldest beamline run first') }}</option>
						<option value="newest-recon-first">{{ t('duplicatefinder', 'Newest reconstruction pass first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="pph__field">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Run Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="pph__input pph__num-input">
				</label>

				<label class="pph__field">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="pph__input pph__num-input">
				</label>

				<label class="pph__field pph__field-grow">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Filter Run, ROOT, NeXus, LHE, CBF, GDML, EPICS or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="pph__input"
						:placeholder="t('duplicatefinder', 'e.g. root, nxs, gdml, lhe, hepmc, cbf, epics, geant4_tmp')">
				</label>

				<label class="pph__field">
					<span class="pph__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="pph__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="pph__control-row">
				<span class="pph__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="pph__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Particle physics and HEP artifact family filter')">
					<button
						type="button"
						class="pph__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="pph__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="pph__control-row">
				<span class="pph__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="pph__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Particle physics governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="pph__seg-btn"
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
			class="pph__empty-filter"
			role="note">
			<p class="pph__empty-title">
				{{ t('duplicatefinder', 'No GDML geometries, calibration logs, ROOT/NeXus/Event masters, N-tuple exports, or GEANT4/CMSSW scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="pph__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="pph__workspace">
			<div
				class="pph__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Particle Physics and HEP Beamline vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="pph__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="pph__cluster-top">
						<strong class="pph__cluster-name">{{ cluster.name }}</strong>
						<span
							class="pph__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="pph__cluster-meta">
						<span
							v-if="cluster.hepToolchain"
							class="pph__tag">{{ cluster.hepToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="pph__tag">{{ cluster.workflowStage }}</span>
						<span class="pph__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="pph__cluster-badges">
						<span
							v-if="cluster.hasRedundantHepExport"
							class="pph__badge is-redundant">
							{{ cluster.hasHepMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedBeamSafetyHold"
							class="pph__badge is-keep">
							{{ t('duplicatefinder', 'Safety / Unblind Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCalibration"
							class="pph__badge is-keep">
							{{ t('duplicatefinder', 'GDML / Calib Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRootMaster"
							class="pph__badge is-consolidate">
							{{ t('duplicatefinder', 'ROOT / NeXus Conserved') }}
						</span>
						<span
							v-if="cluster.hasSimReconScratch"
							class="pph__badge is-warn">
							{{ t('duplicatefinder', 'GEANT4 / CMSSW / Recon Scratch') }}
						</span>
					</div>
					<div class="pph__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="pph__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="pph__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="pph__inspector">
				<header class="pph__inspector-head">
					<div class="pph__inspector-title-wrap">
						<h4 class="pph__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="pph__inspector-sub">
							{{ selectedCluster.hepToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="pph__inspector-actions">
						<button
							type="button"
							class="pph__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="pph__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="pph__lineage-grid">
					<div class="pph__lineage-item">
						<span class="pph__lineage-label">{{ t('duplicatefinder', 'Run Stem & HEP Toolchain') }}</span>
						<strong class="pph__lineage-val">{{ selectedCluster.hepToolchain ? `${selectedCluster.hepToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.hepAnchorKey }})</strong>
					</div>
					<div class="pph__lineage-item">
						<span class="pph__lineage-label">{{ t('duplicatefinder', 'GDML, Calibration & Safety Governance') }}</span>
						<strong class="pph__lineage-val">
							{{ selectedCluster.hasProtectedBeamSafetyHold ? t('duplicatefinder', 'Radiation, Interlock or Unblind Hold Shielded') : (selectedCluster.hasProtectedCalibration ? t('duplicatefinder', 'GDML Geometry, EPICS Log or Calibration DB Shielded') : (selectedCluster.hasProtectedRootMaster ? t('duplicatefinder', 'ROOT, NeXus, LHE/HepMC or CBF/EDF Master Shielded') : t('duplicatefinder', 'GEANT4/CMSSW Scratch or Derived N-Tuple Export'))) }}
						</strong>
					</div>
					<div class="pph__lineage-item">
						<span class="pph__lineage-label">{{ t('duplicatefinder', 'ROOT / NeXus / Event Master Anchor') }}</span>
						<strong class="pph__lineage-val">
							{{ selectedCluster.hasHepMasterAnchor ? t('duplicatefinder', 'Verified ROOT, NeXus, LHE or Calibration Anchor Found') : t('duplicatefinder', 'No ROOT, NeXus or Calibration Anchor Detected') }}
						</strong>
					</div>
					<div class="pph__lineage-item">
						<span class="pph__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="pph__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="pph__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="pph__member-card">
						<div class="pph__member-top">
							<code class="pph__member-path">{{ member.normalized }}</code>
							<div class="pph__member-pills">
								<span
									v-if="member.isRedundantHepExportMember"
									class="pph__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="pph__pill is-warn">
									{{ t('duplicatefinder', 'SIM / RECON SCRATCH') }}
								</span>
								<span
									class="pph__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.hepTag"
									class="pph__pill is-consolidate">
									{{ member.hepTag }}
								</span>
								<span
									class="pph__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="pph__member-bottom">
							<div class="pph__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="pph__member-actions">
								<button
									type="button"
									class="pph__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantHepExportMember) && !(member.isProtectedBeamSafetyHold && protectBeamSafetyHolds) && !(member.isProtectedCalibrationGeometry && protectCalibrationAndGeometry) && !(member.isProtectedRootBeamlineMaster && protectRootAndBeamlineMasters)"
									class="pph__override-field">
									<span class="pph__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="pph__override-select"
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

				<div class="pph__code-panels">
					<div class="pph__code-box">
						<div class="pph__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="pph__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="pph__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="pph__code-box">
						<div class="pph__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="pph__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="pph__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	PARTICLE_PHYSICS_HEP_PRESETS,
	auditParticlePhysicsHepVault,
	buildParticlePhysicsHepCsvReport,
	buildParticlePhysicsHepJsonManifest,
	buildParticlePhysicsHepRemediationScript,
	buildParticlePhysicsHepSyncExcludeList,
} from '../tools/particlePhysicsHepVaultAuditor'

export default {
	name: 'ParticlePhysicsHepVaultWorkbench',
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
			presetId: 'all-particle-physics-hep-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-beam-scratch',
			survivorRule: 'hep-calibration-root-first',
			protectCalibrationAndGeometry: true,
			protectRootAndBeamlineMasters: true,
			protectBeamSafetyHolds: true,
			requireHepAnchorForPrune: true,
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
			return PARTICLE_PHYSICS_HEP_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'hep-export-redundant', label: this.t('duplicatefinder', 'N-Tuple / Plot Exports') },
				{ id: 'sim-recon-scratch', label: this.t('duplicatefinder', 'GEANT4 / Recon Scratch') },
				{ id: 'hep-calibration-protected', label: this.t('duplicatefinder', 'GDML / Calib / EPICS') },
				{ id: 'root-beamline-protected', label: this.t('duplicatefinder', 'ROOT / NeXus / LHE') },
				{ id: 'beam-safety-hold-protected', label: this.t('duplicatefinder', 'Safety / Unblind Hold') },
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
			return auditParticlePhysicsHepVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCalibrationAndGeometry: this.protectCalibrationAndGeometry,
				protectRootAndBeamlineMasters: this.protectRootAndBeamlineMasters,
				protectBeamSafetyHolds: this.protectBeamSafetyHolds,
				requireHepAnchorForPrune: this.requireHepAnchorForPrune,
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
			return buildParticlePhysicsHepRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildParticlePhysicsHepSyncExcludeList()
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
			const preset = PARTICLE_PHYSICS_HEP_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCalibrationAndGeometry = preset.protectCalibrationAndGeometry
			this.protectRootAndBeamlineMasters = preset.protectRootAndBeamlineMasters
			this.protectBeamSafetyHolds = preset.protectBeamSafetyHolds
			this.requireHepAnchorForPrune = preset.requireHepAnchorForPrune
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
				'hep-calibration-protected': this.t('duplicatefinder', 'GDML / Calib'),
				'root-beamline-protected': this.t('duplicatefinder', 'ROOT / NeXus'),
				'beam-safety-hold-protected': this.t('duplicatefinder', 'Safety / Unblind Hold'),
				'hep-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'sim-recon-scratch': this.t('duplicatefinder', 'Sim / Recon Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'hep-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'hep-calibration-protected' || verdict === 'beam-safety-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'root-beamline-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'sim-recon-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantHepExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-beam-scratch' && (member.isRedundantHepExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Particle Physics or HEP Beamline vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Particle Physics & HEP remediation script to clipboard.'))
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
			const csv = buildParticlePhysicsHepCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-particle-physics-hep-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Particle Physics & HEP Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildParticlePhysicsHepJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-particle-physics-hep-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Particle Physics & HEP Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.particle-physics-hep-vault-workbench {
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

.pph__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.pph__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.pph__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.pph__status-badge {
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

.pph__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.pph__tool-btn,
.pph__seg-btn,
.pph__primary-btn,
.pph__load-more-btn,
.pph__mini-btn {
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

.pph__tool-btn.is-primary-outline,
.pph__primary-btn {
	border-color: var(--color-primary-element);
}

.pph__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.pph__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.pph__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.pph__tool-btn:focus-visible,
.pph__seg-btn:focus-visible,
.pph__primary-btn:focus-visible,
.pph__load-more-btn:focus-visible,
.pph__mini-btn:focus-visible,
.pph__cluster-card:focus-visible,
.pph__input:focus-visible,
.pph__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.pph__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.pph__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.pph__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.pph__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pph__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pph__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.pph__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.pph__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.pph__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.pph__empty-banner,
.pph__empty-filter {
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

.pph__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.pph__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.pph__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pph__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pph__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.pph__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.pph__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.pph__inputs-row {
	align-items: flex-end;
}

.pph__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.pph__field-grow {
	flex: 1 1 220px;
}

.pph__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pph__input,
.pph__override-select {
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

.pph__num-input {
	inline-size: 96px;
}

.pph__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.pph__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.pph__cluster-card {
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

.pph__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.pph__cluster-top,
.pph__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.pph__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.pph__cluster-meta,
.pph__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.pph__tag {
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

.pph__badge,
.pph__pill {
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

.pph__pill.is-keep,
.pph__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.pph__pill.is-redundant,
.pph__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.pph__pill.is-consolidate,
.pph__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.pph__pill.is-warn,
.pph__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.pph__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.pph__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.pph__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pph__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.pph__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.pph__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.pph__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pph__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.pph__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.pph__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pph__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pph__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.pph__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.pph__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.pph__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pph__member-top,
.pph__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.pph__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.pph__member-pills,
.pph__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.pph__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.pph__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.pph__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pph__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.pph__pre {
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

.pph__sr-only {
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
	.pph__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.pph__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.pph__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.pph__kpis,
	.pph__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.pph__num-input {
		inline-size: 100%;
	}

	.pph__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.pph__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.pph__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.pph__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.particle-physics-hep-vault-workbench {
		padding: 10px;
	}

	.pph__kpis,
	.pph__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.pph__num-input {
		inline-size: 100%;
	}

	.pph__field {
		flex: 1 1 100%;
	}
}
</style>
