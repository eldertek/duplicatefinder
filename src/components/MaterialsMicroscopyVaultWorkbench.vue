<template>
	<section
		class="materials-microscopy-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Materials Science, Electron Microscopy and Diffraction Vault Auditor')">
		<header class="mmv__toolbar">
			<div class="mmv__title-group">
				<h3 class="mmv__title">
					{{ t('duplicatefinder', 'Materials Science, Electron Microscopy & Diffraction Vault Auditor') }}
				</h3>
				<span
					class="mmv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {std} cif-cal, {masters} em-xrd, {hold} facility-hold, {figs} figure-export, {scratch} recon-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						std: analysis.summary.totalCifCalStdClusters,
						masters: analysis.summary.totalRawEmMasterClusters,
						hold: analysis.summary.totalFacilityHoldClusters,
						figs: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalEmScratchClusters,
					}) }}
				</span>
			</div>

			<div class="mmv__toolbar-actions">
				<button
					type="button"
					class="mmv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mmv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mmv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mmv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="mmv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+K"
					:title="t('duplicatefinder', 'Hide Materials Science, Electron Microscopy and Diffraction Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Materials & EM Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mmv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mmv__kpis">
			<div class="mmv__kpi">
				<span class="mmv__kpi-label">{{ t('duplicatefinder', 'Safe Figure & Scratch Reclaim') }}</span>
				<strong class="mmv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mmv__kpi">
				<span class="mmv__kpi-label">{{ t('duplicatefinder', 'Conserved CIF/Cal, Raw EM/XRD & Facility Holds') }}</span>
				<strong class="mmv__kpi-val is-warn">
					{{ analysis.summary.totalCifCalStdClusters }} {{ t('duplicatefinder', 'cif/cal') }} / {{ analysis.summary.totalRawEmMasterClusters }} {{ t('duplicatefinder', 'em/xrd') }} / {{ analysis.summary.totalFacilityHoldClusters }} {{ t('duplicatefinder', 'hold') }}
				</strong>
			</div>
			<div class="mmv__kpi">
				<span class="mmv__kpi-label">{{ t('duplicatefinder', 'Redundant Figures & Cryo-EM/4D-STEM Scratch') }}</span>
				<strong class="mmv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'fig-export') }} / {{ analysis.summary.totalEmScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mmv__kpi">
				<span class="mmv__kpi-label">{{ t('duplicatefinder', 'Raw Materials & EM Duplicate Footprint') }}</span>
				<strong class="mmv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mmv__empty-banner"
			role="note">
			<div class="mmv__empty-text">
				<p class="mmv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CIF/Calibration, Raw EM/XRD, and Facility Hold shields before scanning') }}
				</p>
				<p class="mmv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit CIF/VASP/LAMMPS decks, detector calibrations, ICSD/COD/EMPIAR holds, DM4/MRC/EMD/OH5/RASX masters, scale-bar figures, and RELION/py4DSTEM scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="mmv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mmv__controls">
			<div class="mmv__control-row">
				<span class="mmv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="mmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Materials and electron microscopy vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mmv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mmv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mmv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mmv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mmv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mmv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mmv__seg-btn"
					:class="{ 'is-active': protectCifAndCalibrationStandards }"
					:aria-pressed="protectCifAndCalibrationStandards ? 'true' : 'false'"
					@click="protectCifAndCalibrationStandards = !protectCifAndCalibrationStandards">
					<span>{{ protectCifAndCalibrationStandards ? t('duplicatefinder', 'Shield CIF / Cal / VASP: ON') : t('duplicatefinder', 'Shield CIF / Cal / VASP: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mmv__seg-btn"
					:class="{ 'is-active': protectRawEmDiffractionMasters }"
					:aria-pressed="protectRawEmDiffractionMasters ? 'true' : 'false'"
					@click="protectRawEmDiffractionMasters = !protectRawEmDiffractionMasters">
					<span>{{ protectRawEmDiffractionMasters ? t('duplicatefinder', 'Shield Raw EM / XRD: ON') : t('duplicatefinder', 'Shield Raw EM / XRD: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mmv__seg-btn"
					:class="{ 'is-active': protectFacilityArchiveHolds }"
					:aria-pressed="protectFacilityArchiveHolds ? 'true' : 'false'"
					@click="protectFacilityArchiveHolds = !protectFacilityArchiveHolds">
					<span>{{ protectFacilityArchiveHolds ? t('duplicatefinder', 'Shield ICSD / EMPIAR Holds: ON') : t('duplicatefinder', 'Shield ICSD / EMPIAR Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mmv__seg-btn"
					:class="{ 'is-active': requireMaterialsAnchorForPrune }"
					:aria-pressed="requireMaterialsAnchorForPrune ? 'true' : 'false'"
					@click="requireMaterialsAnchorForPrune = !requireMaterialsAnchorForPrune">
					<span>{{ requireMaterialsAnchorForPrune ? t('duplicatefinder', 'Require EM/XRD Anchor: ON') : t('duplicatefinder', 'Require EM/XRD Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="mmv__control-row mmv__inputs-row">
				<label class="mmv__field">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mmv__input">
						<option value="prune-exports-and-em-scratch">{{ t('duplicatefinder', 'Prune Redundant Figures & Scratch') }}</option>
						<option value="hardlink-immutable-raw-em-and-xrd">{{ t('duplicatefinder', 'Hardlink Immutable Raw EM/XRD (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-em-scratch">{{ t('duplicatefinder', 'Quarantine EM Figures & Recon Scratch') }}</option>
					</select>
				</label>

				<label class="mmv__field">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mmv__input">
						<option value="cif-raw-em-master-first">{{ t('duplicatefinder', 'CIF/Cal, Raw EM & XRD first') }}</option>
						<option value="oldest-acquisition-first">{{ t('duplicatefinder', 'Oldest acquisition first') }}</option>
						<option value="newest-reconstruction-first">{{ t('duplicatefinder', 'Newest reconstruction first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="mmv__field">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Job Grace (d)') }}</span>
					<input
						v-model="keepRecentJobDaysInput"
						type="number"
						min="0"
						step="1"
						class="mmv__input mmv__num-input">
				</label>

				<label class="mmv__field">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="mmv__input mmv__num-input">
				</label>

				<label class="mmv__field mmv__field-grow">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Filter Specimen, DM4, MRC, EBSD, XRD or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mmv__input"
						:placeholder="t('duplicatefinder', 'e.g. dm4, mrc, cif, poscar, oh5, rasx, relion_scratch, empiar')">
				</label>

				<label class="mmv__field">
					<span class="mmv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mmv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Figure export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mmv__control-row">
				<span class="mmv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="mmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Materials and electron microscopy artifact family filter')">
					<button
						type="button"
						class="mmv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mmv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mmv__control-row">
				<span class="mmv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="mmv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Materials and electron microscopy governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mmv__seg-btn"
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
			class="mmv__empty-filter"
			role="note">
			<p class="mmv__empty-title">
				{{ t('duplicatefinder', 'No CIF/calibration standards, raw EM/XRD masters, scale-bar figures, or RELION/py4DSTEM scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="mmv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mmv__workspace">
			<div
				class="mmv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Materials Science, Electron Microscopy and Diffraction vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="mmv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="mmv__cluster-top">
						<strong class="mmv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="mmv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="mmv__cluster-meta">
						<span
							v-if="cluster.materialsToolchain"
							class="mmv__tag">{{ cluster.materialsToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="mmv__tag">{{ cluster.workflowStage }}</span>
						<span class="mmv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="mmv__cluster-badges">
						<span
							v-if="cluster.hasRedundantEmExport"
							class="mmv__badge is-redundant">
							{{ cluster.hasMaterialsMasterAnchor
								? t('duplicatefinder', 'Redundant Figure (EM/XRD Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Figure (No EM/XRD Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedFacilityHold"
							class="mmv__badge is-keep">
							{{ t('duplicatefinder', 'Facility Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCifCalStandard"
							class="mmv__badge is-keep">
							{{ t('duplicatefinder', 'CIF / Calibration Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawEmMaster"
							class="mmv__badge is-consolidate">
							{{ t('duplicatefinder', 'Raw EM / XRD Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasEmScratchIntermediate"
							class="mmv__badge is-warn">
							{{ t('duplicatefinder', 'Cryo-EM / 4D-STEM Scratch') }}
						</span>
					</div>
					<div class="mmv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mmv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mmv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mmv__inspector">
				<header class="mmv__inspector-head">
					<div class="mmv__inspector-title-wrap">
						<h4 class="mmv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="mmv__inspector-sub">
							{{ selectedCluster.materialsToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="mmv__inspector-actions">
						<button
							type="button"
							class="mmv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mmv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mmv__lineage-grid">
					<div class="mmv__lineage-item">
						<span class="mmv__lineage-label">{{ t('duplicatefinder', 'Specimen / Beamline & Toolchain') }}</span>
						<strong class="mmv__lineage-val">{{ selectedCluster.materialsToolchain ? `${selectedCluster.materialsToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.materialsAnchorKey }})</strong>
					</div>
					<div class="mmv__lineage-item">
						<span class="mmv__lineage-label">{{ t('duplicatefinder', 'CIF / Calibration & Hold Governance') }}</span>
						<strong class="mmv__lineage-val">
							{{ selectedCluster.hasProtectedFacilityHold ? t('duplicatefinder', 'ICSD / COD / EMPIAR / Beamline Hold Shielded') : (selectedCluster.hasProtectedCifCalStandard ? t('duplicatefinder', 'CIF, VASP/LAMMPS & Detector Calibration Shielded') : (selectedCluster.hasProtectedRawEmMaster ? t('duplicatefinder', 'Raw TEM/Cryo-EM, EBSD & XRD Master Shielded') : t('duplicatefinder', 'Cryo-EM/4D-STEM Scratch or Figure Export'))) }}
						</strong>
					</div>
					<div class="mmv__lineage-item">
						<span class="mmv__lineage-label">{{ t('duplicatefinder', 'Raw EM / Diffraction Master Anchor') }}</span>
						<strong class="mmv__lineage-val">
							{{ selectedCluster.hasMaterialsMasterAnchor ? t('duplicatefinder', 'Verified Raw EM, Diffraction or CIF Anchor Found') : t('duplicatefinder', 'No Raw EM, Diffraction or CIF Anchor Detected') }}
						</strong>
					</div>
					<div class="mmv__lineage-item">
						<span class="mmv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mmv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="mmv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="mmv__member-card">
						<div class="mmv__member-top">
							<code class="mmv__member-path">{{ member.normalized }}</code>
							<div class="mmv__member-pills">
								<span
									v-if="member.isRedundantEmExportMember"
									class="mmv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT FIGURE (EM/XRD EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="mmv__pill is-warn">
									{{ t('duplicatefinder', 'RECON SCRATCH') }}
								</span>
								<span
									class="mmv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.materialsTag"
									class="mmv__pill is-consolidate">
									{{ member.materialsTag }}
								</span>
								<span
									class="mmv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="mmv__member-bottom">
							<div class="mmv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="mmv__member-actions">
								<button
									type="button"
									class="mmv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantEmExportMember) && !(member.isProtectedFacilityArchiveHold && protectFacilityArchiveHolds) && !(member.isProtectedCifCalibrationStandard && protectCifAndCalibrationStandards) && !(member.isProtectedRawEmDiffractionMaster && protectRawEmDiffractionMasters)"
									class="mmv__override-field">
									<span class="mmv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="mmv__override-select"
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

				<div class="mmv__code-panels">
					<div class="mmv__code-box">
						<div class="mmv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mmv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mmv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mmv__code-box">
						<div class="mmv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mmv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mmv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	MATERIALS_MICROSCOPY_PRESETS,
	auditMaterialsMicroscopyVault,
	buildMaterialsMicroscopyCsvReport,
	buildMaterialsMicroscopyJsonManifest,
	buildMaterialsMicroscopyRemediationScript,
	buildMaterialsMicroscopySyncExcludeList,
} from '../tools/materialsMicroscopyVaultAuditor'

export default {
	name: 'MaterialsMicroscopyVaultWorkbench',
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
			presetId: 'all-materials-microscopy-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-em-scratch',
			survivorRule: 'cif-raw-em-master-first',
			protectCifAndCalibrationStandards: true,
			protectRawEmDiffractionMasters: true,
			protectFacilityArchiveHolds: true,
			requireMaterialsAnchorForPrune: true,
			keepRecentJobDaysInput: '0',
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
			return MATERIALS_MICROSCOPY_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'em-export-redundant', label: this.t('duplicatefinder', 'Figures / CSV') },
				{ id: 'em-scratch-intermediate', label: this.t('duplicatefinder', 'Recon Scratch') },
				{ id: 'cif-cal-std-protected', label: this.t('duplicatefinder', 'CIF / Cal / VASP') },
				{ id: 'raw-em-diffraction-protected', label: this.t('duplicatefinder', 'Raw EM / XRD') },
				{ id: 'facility-hold-protected', label: this.t('duplicatefinder', 'Facility Hold') },
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
		parsedKeepRecentJobDays() {
			const trimmed = String(this.keepRecentJobDaysInput ?? '').trim()
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
			return auditMaterialsMicroscopyVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCifAndCalibrationStandards: this.protectCifAndCalibrationStandards,
				protectRawEmDiffractionMasters: this.protectRawEmDiffractionMasters,
				protectFacilityArchiveHolds: this.protectFacilityArchiveHolds,
				requireMaterialsAnchorForPrune: this.requireMaterialsAnchorForPrune,
				keepRecentJobDays: this.parsedKeepRecentJobDays,
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
			return buildMaterialsMicroscopyRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildMaterialsMicroscopySyncExcludeList()
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
			const preset = MATERIALS_MICROSCOPY_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCifAndCalibrationStandards = preset.protectCifAndCalibrationStandards
			this.protectRawEmDiffractionMasters = preset.protectRawEmDiffractionMasters
			this.protectFacilityArchiveHolds = preset.protectFacilityArchiveHolds
			this.requireMaterialsAnchorForPrune = preset.requireMaterialsAnchorForPrune
			this.keepRecentJobDaysInput = String(preset.keepRecentJobDays)
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
				'cif-cal-std-protected': this.t('duplicatefinder', 'CIF / Calibration'),
				'raw-em-diffraction-protected': this.t('duplicatefinder', 'Raw EM / XRD'),
				'facility-hold-protected': this.t('duplicatefinder', 'Facility Hold'),
				'em-export-redundant': this.t('duplicatefinder', 'Redundant Figure'),
				'em-scratch-intermediate': this.t('duplicatefinder', 'Recon Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'em-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'cif-cal-std-protected' || verdict === 'facility-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-em-diffraction-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'em-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantEmExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-em-scratch' && (member.isRedundantEmExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Materials or EM vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Materials & EM remediation script to clipboard.'))
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
			const csv = buildMaterialsMicroscopyCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-materials-microscopy-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Materials & EM Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMaterialsMicroscopyJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-materials-microscopy-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Materials & EM Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.materials-microscopy-vault-workbench {
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

.mmv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mmv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mmv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mmv__status-badge {
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

.mmv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mmv__tool-btn,
.mmv__seg-btn,
.mmv__primary-btn,
.mmv__load-more-btn,
.mmv__mini-btn {
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

.mmv__tool-btn.is-primary-outline,
.mmv__primary-btn {
	border-color: var(--color-primary-element);
}

.mmv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.mmv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mmv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.mmv__tool-btn:focus-visible,
.mmv__seg-btn:focus-visible,
.mmv__primary-btn:focus-visible,
.mmv__load-more-btn:focus-visible,
.mmv__mini-btn:focus-visible,
.mmv__cluster-card:focus-visible,
.mmv__input:focus-visible,
.mmv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mmv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.mmv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.mmv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.mmv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mmv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mmv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mmv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mmv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.mmv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.mmv__empty-banner,
.mmv__empty-filter {
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

.mmv__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.mmv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.mmv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mmv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.mmv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.mmv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.mmv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.mmv__inputs-row {
	align-items: flex-end;
}

.mmv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.mmv__field-grow {
	flex: 1 1 220px;
}

.mmv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mmv__input,
.mmv__override-select {
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

.mmv__num-input {
	inline-size: 96px;
}

.mmv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mmv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mmv__cluster-card {
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

.mmv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mmv__cluster-top,
.mmv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mmv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mmv__cluster-meta,
.mmv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.mmv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.mmv__badge,
.mmv__pill {
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

.mmv__pill.is-keep,
.mmv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mmv__pill.is-redundant,
.mmv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.mmv__pill.is-consolidate,
.mmv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mmv__pill.is-warn,
.mmv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mmv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.mmv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mmv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mmv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.mmv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mmv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mmv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mmv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mmv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.mmv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mmv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.mmv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mmv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mmv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mmv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mmv__member-top,
.mmv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mmv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mmv__member-pills,
.mmv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.mmv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.mmv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mmv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mmv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.mmv__pre {
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

.mmv__sr-only {
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
	.mmv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mmv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mmv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.mmv__kpis,
	.mmv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mmv__num-input {
		inline-size: 100%;
	}

	.mmv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.mmv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mmv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mmv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.materials-microscopy-vault-workbench {
		padding: 10px;
	}

	.mmv__kpis,
	.mmv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mmv__num-input {
		inline-size: 100%;
	}

	.mmv__field {
		flex: 1 1 100%;
	}
}
</style>
