<template>
	<section
		class="quantum-qubit-pulse-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Quantum Computing, Cryogenic Qubit and Pulse-Control Vault Auditor')">
		<header class="qqp__toolbar">
			<div class="qqp__title-group">
				<h3 class="qqp__title">
					{{ t('duplicatefinder', 'Quantum Computing & Cryogenic Qubit Vault Auditor') }}
				</h3>
				<span
					class="qqp__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {calib} cryo-calib, {masters} qasm-pulse, {hold} qpu-hold, {exports} bloch-export, {scratch} sim-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						calib: analysis.summary.totalCryoCalibClusters,
						masters: analysis.summary.totalCircuitMasterClusters,
						hold: analysis.summary.totalBenchmarkHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalSimScratchClusters,
					}) }}
				</span>
			</div>

			<div class="qqp__toolbar-actions">
				<button
					type="button"
					class="qqp__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="qqp__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="qqp__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="qqp__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="qqp__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+Q"
					:title="t('duplicatefinder', 'Hide Quantum Computing, Cryogenic Qubit and Pulse-Control Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Quantum & Qubit') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="qqp__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="qqp__kpis">
			<div class="qqp__kpi">
				<span class="qqp__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="qqp__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="qqp__kpi">
				<span class="qqp__kpi-label">{{ t('duplicatefinder', 'Conserved Cryo, QASM & QPU Holds') }}</span>
				<strong class="qqp__kpi-val is-warn">
					{{ analysis.summary.totalCryoCalibClusters }} {{ t('duplicatefinder', 'cryo/calib') }} / {{ analysis.summary.totalCircuitMasterClusters }} {{ t('duplicatefinder', 'qasm/pulse') }} / {{ analysis.summary.totalBenchmarkHoldClusters }} {{ t('duplicatefinder', 'qpu-hold') }}
				</strong>
			</div>
			<div class="qqp__kpi">
				<span class="qqp__kpi-label">{{ t('duplicatefinder', 'Redundant Bloch & Compiler Scratch') }}</span>
				<strong class="qqp__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'bloch/plots') }} / {{ analysis.summary.totalSimScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="qqp__kpi">
				<span class="qqp__kpi-label">{{ t('duplicatefinder', 'Quantum & Cryo Duplicate Footprint') }}</span>
				<strong class="qqp__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="qqp__empty-banner"
			role="note">
			<div class="qqp__empty-text">
				<p class="qqp__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Cryo/Calibration, QASM/Pulse, and QPU-Hold shields before scanning') }}
				</p>
				<p class="qqp__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Bluefors cryo telemetry, T1/T2 calibration DBs, QEC/benchmark holds, OpenQASM/QPY/Stim/SeqC masters, Bloch/tomography exports, and Aer/transpiler scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="qqp__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="qqp__controls">
			<div class="qqp__control-row">
				<span class="qqp__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="qqp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Quantum computing and cryogenic vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="qqp__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="qqp__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="qqp__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="qqp__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="qqp__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="qqp__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="qqp__seg-btn"
					:class="{ 'is-active': protectCryoAndCalibration }"
					:aria-pressed="protectCryoAndCalibration ? 'true' : 'false'"
					@click="protectCryoAndCalibration = !protectCryoAndCalibration">
					<span>{{ protectCryoAndCalibration ? t('duplicatefinder', 'Shield Cryo / QCalib / Map: ON') : t('duplicatefinder', 'Shield Cryo / QCalib / Map: OFF') }}</span>
				</button>

				<button
					type="button"
					class="qqp__seg-btn"
					:class="{ 'is-active': protectCircuitAndPulseMasters }"
					:aria-pressed="protectCircuitAndPulseMasters ? 'true' : 'false'"
					@click="protectCircuitAndPulseMasters = !protectCircuitAndPulseMasters">
					<span>{{ protectCircuitAndPulseMasters ? t('duplicatefinder', 'Shield QASM / QPY / Pulse: ON') : t('duplicatefinder', 'Shield QASM / QPY / Pulse: OFF') }}</span>
				</button>

				<button
					type="button"
					class="qqp__seg-btn"
					:class="{ 'is-active': protectQpuBenchmarkHolds }"
					:aria-pressed="protectQpuBenchmarkHolds ? 'true' : 'false'"
					@click="protectQpuBenchmarkHolds = !protectQpuBenchmarkHolds">
					<span>{{ protectQpuBenchmarkHolds ? t('duplicatefinder', 'Shield QPU / Benchmark Holds: ON') : t('duplicatefinder', 'Shield QPU / Benchmark Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="qqp__seg-btn"
					:class="{ 'is-active': requireQuantumAnchorForPrune }"
					:aria-pressed="requireQuantumAnchorForPrune ? 'true' : 'false'"
					@click="requireQuantumAnchorForPrune = !requireQuantumAnchorForPrune">
					<span>{{ requireQuantumAnchorForPrune ? t('duplicatefinder', 'Require QASM / QPY Anchor: ON') : t('duplicatefinder', 'Require QASM / QPY Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="qqp__control-row qqp__inputs-row">
				<label class="qqp__field">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="qqp__input">
						<option value="prune-exports-and-pulse-scratch">{{ t('duplicatefinder', 'Prune Redundant Bloch & Scratch') }}</option>
						<option value="hardlink-immutable-qpy-and-hdf5">{{ t('duplicatefinder', 'Hardlink Immutable QPY/HDF5 (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-pulse-scratch">{{ t('duplicatefinder', 'Quarantine Tomography & Pulse Scratch') }}</option>
					</select>
				</label>

				<label class="qqp__field">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="qqp__input">
						<option value="quantum-calib-qasm-first">{{ t('duplicatefinder', 'Cryo/Calib & QASM/Pulse first') }}</option>
						<option value="oldest-cryo-run-first">{{ t('duplicatefinder', 'Oldest cooldown run first') }}</option>
						<option value="newest-transpile-first">{{ t('duplicatefinder', 'Newest transpiler pass first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="qqp__field">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Cooldown Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="qqp__input qqp__num-input">
				</label>

				<label class="qqp__field">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="qqp__input qqp__num-input">
				</label>

				<label class="qqp__field qqp__field-grow">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Filter QASM, QPY, Stim, SeqC, QUA, Cryo, QCalib or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="qqp__input"
						:placeholder="t('duplicatefinder', 'e.g. qasm, qpy, stim, seqc, qua, cryo, qcalib, aer_tmp')">
				</label>

				<label class="qqp__field">
					<span class="qqp__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="qqp__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="qqp__control-row">
				<span class="qqp__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="qqp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Quantum computing and cryogenic artifact family filter')">
					<button
						type="button"
						class="qqp__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="qqp__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="qqp__control-row">
				<span class="qqp__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="qqp__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Quantum computing governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="qqp__seg-btn"
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
			class="qqp__empty-filter"
			role="note">
			<p class="qqp__empty-title">
				{{ t('duplicatefinder', 'No cryo logs, qubit calibrations, QASM/Pulse/Shot masters, Bloch/tomography exports, or Aer/transpiler scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="qqp__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="qqp__workspace">
			<div
				class="qqp__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Quantum Computing and Cryogenic Qubit vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="qqp__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="qqp__cluster-top">
						<strong class="qqp__cluster-name">{{ cluster.name }}</strong>
						<span
							class="qqp__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="qqp__cluster-meta">
						<span
							v-if="cluster.quantumToolchain"
							class="qqp__tag">{{ cluster.quantumToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="qqp__tag">{{ cluster.workflowStage }}</span>
						<span class="qqp__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="qqp__cluster-badges">
						<span
							v-if="cluster.hasRedundantQuantumExport"
							class="qqp__badge is-redundant">
							{{ cluster.hasQuantumMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedQpuBenchmarkHold"
							class="qqp__badge is-keep">
							{{ t('duplicatefinder', 'QPU / Benchmark Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCryoCalibration"
							class="qqp__badge is-keep">
							{{ t('duplicatefinder', 'Cryo / QCalib Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCircuitPulseMaster"
							class="qqp__badge is-consolidate">
							{{ t('duplicatefinder', 'QASM / Pulse Conserved') }}
						</span>
						<span
							v-if="cluster.hasSimTranspileScratch"
							class="qqp__badge is-warn">
							{{ t('duplicatefinder', 'Aer / Transpiler / Pulse Scratch') }}
						</span>
					</div>
					<div class="qqp__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="qqp__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="qqp__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="qqp__inspector">
				<header class="qqp__inspector-head">
					<div class="qqp__inspector-title-wrap">
						<h4 class="qqp__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="qqp__inspector-sub">
							{{ selectedCluster.quantumToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="qqp__inspector-actions">
						<button
							type="button"
							class="qqp__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="qqp__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="qqp__lineage-grid">
					<div class="qqp__lineage-item">
						<span class="qqp__lineage-label">{{ t('duplicatefinder', 'Run Stem & Quantum Toolchain') }}</span>
						<strong class="qqp__lineage-val">{{ selectedCluster.quantumToolchain ? `${selectedCluster.quantumToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.quantumAnchorKey }})</strong>
					</div>
					<div class="qqp__lineage-item">
						<span class="qqp__lineage-label">{{ t('duplicatefinder', 'Cryo, Calibration & Hold Governance') }}</span>
						<strong class="qqp__lineage-val">
							{{ selectedCluster.hasProtectedQpuBenchmarkHold ? t('duplicatefinder', 'QPU Benchmark, QEC or Calibration-Freeze Hold Shielded') : (selectedCluster.hasProtectedCryoCalibration ? t('duplicatefinder', 'Dilution Cryo Log, QCalib or Wiring Map Shielded') : (selectedCluster.hasProtectedCircuitPulseMaster ? t('duplicatefinder', 'OpenQASM, QPY, Stim, SeqC/QUA or IQ Shot Master Shielded') : t('duplicatefinder', 'Aer/Transpiler Scratch or Derived Tomography Export'))) }}
						</strong>
					</div>
					<div class="qqp__lineage-item">
						<span class="qqp__lineage-label">{{ t('duplicatefinder', 'QASM / Pulse / Calibration Anchor') }}</span>
						<strong class="qqp__lineage-val">
							{{ selectedCluster.hasQuantumMasterAnchor ? t('duplicatefinder', 'Verified QASM, QPY, Stim, SeqC or Calibration Anchor Found') : t('duplicatefinder', 'No QASM, Pulse or Calibration Anchor Detected') }}
						</strong>
					</div>
					<div class="qqp__lineage-item">
						<span class="qqp__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="qqp__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="qqp__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="qqp__member-card">
						<div class="qqp__member-top">
							<code class="qqp__member-path">{{ member.normalized }}</code>
							<div class="qqp__member-pills">
								<span
									v-if="member.isRedundantQuantumExportMember"
									class="qqp__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="qqp__pill is-warn">
									{{ t('duplicatefinder', 'SIM / PULSE SCRATCH') }}
								</span>
								<span
									class="qqp__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.quantumTag"
									class="qqp__pill is-consolidate">
									{{ member.quantumTag }}
								</span>
								<span
									class="qqp__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="qqp__member-bottom">
							<div class="qqp__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="qqp__member-actions">
								<button
									type="button"
									class="qqp__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantQuantumExportMember) && !(member.isProtectedQpuBenchmarkHold && protectQpuBenchmarkHolds) && !(member.isProtectedCryoCalibration && protectCryoAndCalibration) && !(member.isProtectedCircuitPulseMaster && protectCircuitAndPulseMasters)"
									class="qqp__override-field">
									<span class="qqp__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="qqp__override-select"
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

				<div class="qqp__code-panels">
					<div class="qqp__code-box">
						<div class="qqp__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="qqp__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="qqp__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="qqp__code-box">
						<div class="qqp__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="qqp__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="qqp__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	QUANTUM_QUBIT_PULSE_PRESETS,
	auditQuantumQubitPulseVault,
	buildQuantumQubitPulseCsvReport,
	buildQuantumQubitPulseJsonManifest,
	buildQuantumQubitPulseRemediationScript,
	buildQuantumQubitPulseSyncExcludeList,
} from '../tools/quantumQubitPulseVaultAuditor'

export default {
	name: 'QuantumQubitPulseVaultWorkbench',
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
			presetId: 'all-quantum-qubit-pulse-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-pulse-scratch',
			survivorRule: 'quantum-calib-qasm-first',
			protectCryoAndCalibration: true,
			protectCircuitAndPulseMasters: true,
			protectQpuBenchmarkHolds: true,
			requireQuantumAnchorForPrune: true,
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
			return QUANTUM_QUBIT_PULSE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'quantum-export-redundant', label: this.t('duplicatefinder', 'Bloch / Tomography') },
				{ id: 'sim-transpile-scratch', label: this.t('duplicatefinder', 'Aer / Pulse Scratch') },
				{ id: 'quantum-calib-cryo-protected', label: this.t('duplicatefinder', 'Cryo / QCalib / Map') },
				{ id: 'qasm-pulse-master-protected', label: this.t('duplicatefinder', 'QASM / QPY / Pulse') },
				{ id: 'qpu-benchmark-hold-protected', label: this.t('duplicatefinder', 'QPU / Benchmark Hold') },
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
			return auditQuantumQubitPulseVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCryoAndCalibration: this.protectCryoAndCalibration,
				protectCircuitAndPulseMasters: this.protectCircuitAndPulseMasters,
				protectQpuBenchmarkHolds: this.protectQpuBenchmarkHolds,
				requireQuantumAnchorForPrune: this.requireQuantumAnchorForPrune,
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
			return buildQuantumQubitPulseRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildQuantumQubitPulseSyncExcludeList()
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
			const preset = QUANTUM_QUBIT_PULSE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCryoAndCalibration = preset.protectCryoAndCalibration
			this.protectCircuitAndPulseMasters = preset.protectCircuitAndPulseMasters
			this.protectQpuBenchmarkHolds = preset.protectQpuBenchmarkHolds
			this.requireQuantumAnchorForPrune = preset.requireQuantumAnchorForPrune
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
				'quantum-calib-cryo-protected': this.t('duplicatefinder', 'Cryo / QCalib'),
				'qasm-pulse-master-protected': this.t('duplicatefinder', 'QASM / Pulse'),
				'qpu-benchmark-hold-protected': this.t('duplicatefinder', 'QPU / Benchmark Hold'),
				'quantum-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'sim-transpile-scratch': this.t('duplicatefinder', 'Aer / Pulse Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'quantum-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'quantum-calib-cryo-protected' || verdict === 'qpu-benchmark-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'qasm-pulse-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'sim-transpile-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantQuantumExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-pulse-scratch' && (member.isRedundantQuantumExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Quantum or Cryogenic Qubit vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Quantum & Cryo remediation script to clipboard.'))
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
			const csv = buildQuantumQubitPulseCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-quantum-qubit-pulse-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Quantum & Cryo Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildQuantumQubitPulseJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-quantum-qubit-pulse-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Quantum & Cryo Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.quantum-qubit-pulse-vault-workbench {
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

.qqp__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.qqp__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.qqp__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.qqp__status-badge {
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

.qqp__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.qqp__tool-btn,
.qqp__seg-btn,
.qqp__primary-btn,
.qqp__load-more-btn,
.qqp__mini-btn {
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

.qqp__tool-btn.is-primary-outline,
.qqp__primary-btn {
	border-color: var(--color-primary-element);
}

.qqp__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.qqp__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.qqp__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.qqp__tool-btn:focus-visible,
.qqp__seg-btn:focus-visible,
.qqp__primary-btn:focus-visible,
.qqp__load-more-btn:focus-visible,
.qqp__mini-btn:focus-visible,
.qqp__cluster-card:focus-visible,
.qqp__input:focus-visible,
.qqp__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.qqp__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.qqp__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.qqp__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.qqp__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.qqp__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.qqp__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.qqp__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.qqp__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.qqp__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.qqp__empty-banner,
.qqp__empty-filter {
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

.qqp__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.qqp__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.qqp__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.qqp__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.qqp__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.qqp__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.qqp__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.qqp__inputs-row {
	align-items: flex-end;
}

.qqp__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.qqp__field-grow {
	flex: 1 1 220px;
}

.qqp__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.qqp__input,
.qqp__override-select {
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

.qqp__num-input {
	inline-size: 96px;
}

.qqp__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.qqp__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.qqp__cluster-card {
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

.qqp__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.qqp__cluster-top,
.qqp__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.qqp__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.qqp__cluster-meta,
.qqp__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.qqp__tag {
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

.qqp__badge,
.qqp__pill {
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

.qqp__pill.is-keep,
.qqp__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.qqp__pill.is-redundant,
.qqp__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.qqp__pill.is-consolidate,
.qqp__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.qqp__pill.is-warn,
.qqp__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.qqp__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.qqp__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.qqp__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.qqp__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.qqp__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.qqp__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.qqp__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.qqp__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.qqp__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.qqp__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.qqp__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.qqp__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.qqp__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.qqp__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.qqp__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.qqp__member-top,
.qqp__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.qqp__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.qqp__member-pills,
.qqp__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.qqp__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.qqp__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.qqp__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.qqp__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.qqp__pre {
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

.qqp__sr-only {
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
	.qqp__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.qqp__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.qqp__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.qqp__kpis,
	.qqp__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.qqp__num-input {
		inline-size: 100%;
	}

	.qqp__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.qqp__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.qqp__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.qqp__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.quantum-qubit-pulse-vault-workbench {
		padding: 10px;
	}

	.qqp__kpis,
	.qqp__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.qqp__num-input {
		inline-size: 100%;
	}

	.qqp__field {
		flex: 1 1 100%;
	}
}
</style>
