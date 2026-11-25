<template>
	<section
		class="neuroscience-electrophys-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Neuroscience, Electrophysiology and BIDS Vault Auditor')">
		<header class="nev__toolbar">
			<div class="nev__title-group">
				<h3 class="nev__title">
					{{ t('duplicatefinder', 'Neuroscience & Electrophysiology Vault Auditor') }}
				</h3>
				<span
					class="nev__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {bids} bids-montage, {masters} raw-ephys, {hold} irb-hold, {deriv} epochs-ica, {scratch} daq-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						bids: analysis.summary.totalBidsMontageClusters,
						masters: analysis.summary.totalRawElectrophysMasterClusters,
						hold: analysis.summary.totalIrbHoldClusters,
						deriv: analysis.summary.totalRedundantDerivativeClusters,
						scratch: analysis.summary.totalDaqScratchClusters,
					}) }}
				</span>
			</div>

			<div class="nev__toolbar-actions">
				<button
					type="button"
					class="nev__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="nev__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="nev__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="nev__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="nev__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+N"
					:title="t('duplicatefinder', 'Hide Neuroscience, Electrophysiology and BIDS Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Neuro & BIDS') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="nev__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="nev__kpis">
			<div class="nev__kpi">
				<span class="nev__kpi-label">{{ t('duplicatefinder', 'Safe Derivative & Scratch Reclaim') }}</span>
				<strong class="nev__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="nev__kpi">
				<span class="nev__kpi-label">{{ t('duplicatefinder', 'Conserved BIDS, Raw NWB/EDF & Holds') }}</span>
				<strong class="nev__kpi-val is-warn">
					{{ analysis.summary.totalBidsMontageClusters }} {{ t('duplicatefinder', 'bids/montage') }} / {{ analysis.summary.totalRawElectrophysMasterClusters }} {{ t('duplicatefinder', 'raw-ephys') }} / {{ analysis.summary.totalIrbHoldClusters }} {{ t('duplicatefinder', 'irb-hold') }}
				</strong>
			</div>
			<div class="nev__kpi">
				<span class="nev__kpi-label">{{ t('duplicatefinder', 'Redundant Epochs/ICA & DAQ Scratch') }}</span>
				<strong class="nev__kpi-val is-danger">
					{{ analysis.summary.totalRedundantDerivativeClusters }} {{ t('duplicatefinder', 'epochs/ica') }} / {{ analysis.summary.totalDaqScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="nev__kpi">
				<span class="nev__kpi-label">{{ t('duplicatefinder', 'Neuro & Electrophys Duplicate Footprint') }}</span>
				<strong class="nev__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="nev__empty-banner"
			role="note">
			<div class="nev__empty-text">
				<p class="nev__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure BIDS/Montage, Raw NWB/EDF/FIF/NS5, and IRB Hold shields before scanning') }}
				</p>
				<p class="nev__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit BIDS sidecars, digitizer montages, IRB/clinical-EEG holds, raw NWB/EDF/BDF/FIF/ABF/NS5/XDF masters, MNE epochs/ICA exports, and Kilosort scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="nev__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="nev__controls">
			<div class="nev__control-row">
				<span class="nev__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="nev__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Neuroscience and electrophysiology vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="nev__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="nev__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="nev__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="nev__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="nev__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="nev__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="nev__seg-btn"
					:class="{ 'is-active': protectBidsAndMontages }"
					:aria-pressed="protectBidsAndMontages ? 'true' : 'false'"
					@click="protectBidsAndMontages = !protectBidsAndMontages">
					<span>{{ protectBidsAndMontages ? t('duplicatefinder', 'Shield BIDS / Montages: ON') : t('duplicatefinder', 'Shield BIDS / Montages: OFF') }}</span>
				</button>

				<button
					type="button"
					class="nev__seg-btn"
					:class="{ 'is-active': protectRawElectrophysMasters }"
					:aria-pressed="protectRawElectrophysMasters ? 'true' : 'false'"
					@click="protectRawElectrophysMasters = !protectRawElectrophysMasters">
					<span>{{ protectRawElectrophysMasters ? t('duplicatefinder', 'Shield NWB / EDF / FIF / NS5: ON') : t('duplicatefinder', 'Shield NWB / EDF / FIF / NS5: OFF') }}</span>
				</button>

				<button
					type="button"
					class="nev__seg-btn"
					:class="{ 'is-active': protectIrbClinicalHolds }"
					:aria-pressed="protectIrbClinicalHolds ? 'true' : 'false'"
					@click="protectIrbClinicalHolds = !protectIrbClinicalHolds">
					<span>{{ protectIrbClinicalHolds ? t('duplicatefinder', 'Shield IRB / Clinical EEG Holds: ON') : t('duplicatefinder', 'Shield IRB / Clinical EEG Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="nev__seg-btn"
					:class="{ 'is-active': requireNeuroAnchorForPrune }"
					:aria-pressed="requireNeuroAnchorForPrune ? 'true' : 'false'"
					@click="requireNeuroAnchorForPrune = !requireNeuroAnchorForPrune">
					<span>{{ requireNeuroAnchorForPrune ? t('duplicatefinder', 'Require Raw / BIDS Anchor: ON') : t('duplicatefinder', 'Require Raw / BIDS Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="nev__control-row nev__inputs-row">
				<label class="nev__field">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="nev__input">
						<option value="prune-derivatives-and-daq-scratch">{{ t('duplicatefinder', 'Prune Redundant Epochs/ICA & Scratch') }}</option>
						<option value="hardlink-immutable-nwb-edf-and-ns5">{{ t('duplicatefinder', 'Hardlink Immutable NWB/EDF/NS5 (Block Mutable)') }}</option>
						<option value="quarantine-derivatives-and-daq-scratch">{{ t('duplicatefinder', 'Quarantine Epochs/ICA & DAQ Scratch') }}</option>
					</select>
				</label>

				<label class="nev__field">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="nev__input">
						<option value="bids-raw-electrophys-first">{{ t('duplicatefinder', 'BIDS/Montages & Raw NWB/EDF/NS5 first') }}</option>
						<option value="oldest-recording-first">{{ t('duplicatefinder', 'Oldest recording session first') }}</option>
						<option value="newest-sort-first">{{ t('duplicatefinder', 'Newest spike sort first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="nev__field">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Session Grace (d)') }}</span>
					<input
						v-model="keepRecentRecordingDaysInput"
						type="number"
						min="0"
						step="1"
						class="nev__input nev__num-input">
				</label>

				<label class="nev__field">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="nev__input nev__num-input">
				</label>

				<label class="nev__field nev__field-grow">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Filter Recording, NWB, EDF, FIF, ABF, NS5, BIDS or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="nev__input"
						:placeholder="t('duplicatefinder', 'e.g. nwb, edf, bdf, fif, abf, ns5, xdf, vhdr, bids, kilosort_tmp')">
				</label>

				<label class="nev__field">
					<span class="nev__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="nev__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Derivative & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="nev__control-row">
				<span class="nev__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="nev__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Neuroscience and electrophysiology artifact family filter')">
					<button
						type="button"
						class="nev__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="nev__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="nev__control-row">
				<span class="nev__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="nev__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Neuroscience and electrophysiology governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="nev__seg-btn"
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
			class="nev__empty-filter"
			role="note">
			<p class="nev__empty-title">
				{{ t('duplicatefinder', 'No BIDS sidecars, montages, raw NWB/EDF/FIF/NS5 masters, epochs/ICA exports, or Kilosort/DAQ scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="nev__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="nev__workspace">
			<div
				class="nev__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Neuroscience and Electrophysiology vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="nev__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="nev__cluster-top">
						<strong class="nev__cluster-name">{{ cluster.name }}</strong>
						<span
							class="nev__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="nev__cluster-meta">
						<span
							v-if="cluster.neuroToolchain"
							class="nev__tag">{{ cluster.neuroToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="nev__tag">{{ cluster.workflowStage }}</span>
						<span class="nev__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="nev__cluster-badges">
						<span
							v-if="cluster.hasRedundantNeuroDerivative"
							class="nev__badge is-redundant">
							{{ cluster.hasNeuroMasterAnchor
								? t('duplicatefinder', 'Redundant Derivative (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Derivative (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedIrbHold"
							class="nev__badge is-keep">
							{{ t('duplicatefinder', 'IRB / Clinical Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedBidsMontage"
							class="nev__badge is-keep">
							{{ t('duplicatefinder', 'BIDS / Montage Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawElectrophysMaster"
							class="nev__badge is-consolidate">
							{{ t('duplicatefinder', 'Raw Electrophys Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasDaqScratchIntermediate"
							class="nev__badge is-warn">
							{{ t('duplicatefinder', 'Kilosort / DAQ Scratch') }}
						</span>
					</div>
					<div class="nev__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="nev__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="nev__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="nev__inspector">
				<header class="nev__inspector-head">
					<div class="nev__inspector-title-wrap">
						<h4 class="nev__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="nev__inspector-sub">
							{{ selectedCluster.neuroToolchain || selectedCluster.recordingStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="nev__inspector-actions">
						<button
							type="button"
							class="nev__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="nev__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="nev__lineage-grid">
					<div class="nev__lineage-item">
						<span class="nev__lineage-label">{{ t('duplicatefinder', 'Recording Session & Electrophys Toolchain') }}</span>
						<strong class="nev__lineage-val">{{ selectedCluster.neuroToolchain ? `${selectedCluster.neuroToolchain} / ` : '' }}{{ selectedCluster.recordingStem }} ({{ selectedCluster.neuroAnchorKey }})</strong>
					</div>
					<div class="nev__lineage-item">
						<span class="nev__lineage-label">{{ t('duplicatefinder', 'BIDS, Montage & IRB Hold Governance') }}</span>
						<strong class="nev__lineage-val">
							{{ selectedCluster.hasProtectedIrbHold ? t('duplicatefinder', 'IRB, HIPAA or Clinical-EEG Hold Shielded') : (selectedCluster.hasProtectedBidsMontage ? t('duplicatefinder', 'BIDS Sidecar, Montage or Probe Map Shielded') : (selectedCluster.hasProtectedRawElectrophysMaster ? t('duplicatefinder', 'Raw NWB, EDF, FIF, ABF or NS5 Master Shielded') : t('duplicatefinder', 'Kilosort Scratch or Derived Epoch/ICA Export'))) }}
						</strong>
					</div>
					<div class="nev__lineage-item">
						<span class="nev__lineage-label">{{ t('duplicatefinder', 'Raw Electrophysiology / BIDS Master Anchor') }}</span>
						<strong class="nev__lineage-val">
							{{ selectedCluster.hasNeuroMasterAnchor ? t('duplicatefinder', 'Verified Raw NWB, EDF, FIF, ABF, NS5 or BIDS Anchor Found') : t('duplicatefinder', 'No Raw Electrophysiology or BIDS Anchor Detected') }}
						</strong>
					</div>
					<div class="nev__lineage-item">
						<span class="nev__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="nev__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="nev__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="nev__member-card">
						<div class="nev__member-top">
							<code class="nev__member-path">{{ member.normalized }}</code>
							<div class="nev__member-pills">
								<span
									v-if="member.isRedundantNeuroDerivativeMember"
									class="nev__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT DERIVATIVE (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="nev__pill is-warn">
									{{ t('duplicatefinder', 'DAQ / SORT SCRATCH') }}
								</span>
								<span
									class="nev__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.neuroTag"
									class="nev__pill is-consolidate">
									{{ member.neuroTag }}
								</span>
								<span
									class="nev__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="nev__member-bottom">
							<div class="nev__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="nev__member-actions">
								<button
									type="button"
									class="nev__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantNeuroDerivativeMember) && !(member.isProtectedIrbClinicalHold && protectIrbClinicalHolds) && !(member.isProtectedBidsMontage && protectBidsAndMontages) && !(member.isProtectedRawElectrophysMaster && protectRawElectrophysMasters)"
									class="nev__override-field">
									<span class="nev__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="nev__override-select"
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

				<div class="nev__code-panels">
					<div class="nev__code-box">
						<div class="nev__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="nev__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="nev__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="nev__code-box">
						<div class="nev__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="nev__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="nev__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	NEURO_ELECTROPHYS_PRESETS,
	auditNeuroscienceElectrophysVault,
	buildNeuroscienceElectrophysCsvReport,
	buildNeuroscienceElectrophysJsonManifest,
	buildNeuroscienceElectrophysRemediationScript,
	buildNeuroscienceElectrophysSyncExcludeList,
} from '../tools/neuroscienceElectrophysVaultAuditor'

export default {
	name: 'NeuroscienceElectrophysVaultWorkbench',
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
			presetId: 'all-neuro-electrophys-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-derivatives-and-daq-scratch',
			survivorRule: 'bids-raw-electrophys-first',
			protectBidsAndMontages: true,
			protectRawElectrophysMasters: true,
			protectIrbClinicalHolds: true,
			requireNeuroAnchorForPrune: true,
			keepRecentRecordingDaysInput: '0',
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
			return NEURO_ELECTROPHYS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'neuro-derivative-redundant', label: this.t('duplicatefinder', 'Epochs / ICA Exports') },
				{ id: 'daq-scratch-intermediate', label: this.t('duplicatefinder', 'DAQ / Sort Scratch') },
				{ id: 'bids-montage-protected', label: this.t('duplicatefinder', 'BIDS / Montages') },
				{ id: 'raw-electrophys-protected', label: this.t('duplicatefinder', 'Raw NWB / EDF / FIF / NS5') },
				{ id: 'irb-hold-protected', label: this.t('duplicatefinder', 'IRB / Clinical Hold') },
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
		parsedKeepRecentRecordingDays() {
			const trimmed = String(this.keepRecentRecordingDaysInput ?? '').trim()
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
			return auditNeuroscienceElectrophysVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectBidsAndMontages: this.protectBidsAndMontages,
				protectRawElectrophysMasters: this.protectRawElectrophysMasters,
				protectIrbClinicalHolds: this.protectIrbClinicalHolds,
				requireNeuroAnchorForPrune: this.requireNeuroAnchorForPrune,
				keepRecentRecordingDays: this.parsedKeepRecentRecordingDays,
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
			return buildNeuroscienceElectrophysRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildNeuroscienceElectrophysSyncExcludeList()
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
			const preset = NEURO_ELECTROPHYS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectBidsAndMontages = preset.protectBidsAndMontages
			this.protectRawElectrophysMasters = preset.protectRawElectrophysMasters
			this.protectIrbClinicalHolds = preset.protectIrbClinicalHolds
			this.requireNeuroAnchorForPrune = preset.requireNeuroAnchorForPrune
			this.keepRecentRecordingDaysInput = String(preset.keepRecentRecordingDays)
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
				'bids-montage-protected': this.t('duplicatefinder', 'BIDS / Montage'),
				'raw-electrophys-protected': this.t('duplicatefinder', 'Raw NWB / EDF / FIF'),
				'irb-hold-protected': this.t('duplicatefinder', 'IRB / Clinical Hold'),
				'neuro-derivative-redundant': this.t('duplicatefinder', 'Redundant Epoch / ICA'),
				'daq-scratch-intermediate': this.t('duplicatefinder', 'DAQ / Sort Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'neuro-derivative-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'bids-montage-protected' || verdict === 'irb-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-electrophys-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'daq-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantNeuroDerivativeMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-derivatives-and-daq-scratch' && (member.isRedundantNeuroDerivative || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Neuroscience or Electrophysiology vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Neuroscience & BIDS remediation script to clipboard.'))
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
			const csv = buildNeuroscienceElectrophysCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-neuroscience-electrophys-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Neuroscience & BIDS Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildNeuroscienceElectrophysJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-neuroscience-electrophys-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Neuroscience & BIDS Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.neuroscience-electrophys-vault-workbench {
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

.nev__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.nev__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.nev__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.nev__status-badge {
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

.nev__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.nev__tool-btn,
.nev__seg-btn,
.nev__primary-btn,
.nev__load-more-btn,
.nev__mini-btn {
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

.nev__tool-btn.is-primary-outline,
.nev__primary-btn {
	border-color: var(--color-primary-element);
}

.nev__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.nev__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.nev__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.nev__tool-btn:focus-visible,
.nev__seg-btn:focus-visible,
.nev__primary-btn:focus-visible,
.nev__load-more-btn:focus-visible,
.nev__mini-btn:focus-visible,
.nev__cluster-card:focus-visible,
.nev__input:focus-visible,
.nev__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.nev__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.nev__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.nev__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.nev__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.nev__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.nev__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.nev__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.nev__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.nev__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.nev__empty-banner,
.nev__empty-filter {
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

.nev__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.nev__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.nev__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.nev__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.nev__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.nev__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.nev__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.nev__inputs-row {
	align-items: flex-end;
}

.nev__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.nev__field-grow {
	flex: 1 1 220px;
}

.nev__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.nev__input,
.nev__override-select {
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

.nev__num-input {
	inline-size: 96px;
}

.nev__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.nev__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.nev__cluster-card {
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

.nev__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.nev__cluster-top,
.nev__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.nev__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.nev__cluster-meta,
.nev__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.nev__tag {
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

.nev__badge,
.nev__pill {
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

.nev__pill.is-keep,
.nev__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.nev__pill.is-redundant,
.nev__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.nev__pill.is-consolidate,
.nev__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.nev__pill.is-warn,
.nev__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.nev__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.nev__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.nev__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.nev__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.nev__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.nev__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.nev__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.nev__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.nev__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.nev__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.nev__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.nev__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.nev__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.nev__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.nev__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.nev__member-top,
.nev__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.nev__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.nev__member-pills,
.nev__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.nev__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.nev__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.nev__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.nev__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.nev__pre {
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

.nev__sr-only {
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
	.nev__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.nev__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.nev__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.nev__kpis,
	.nev__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.nev__num-input {
		inline-size: 100%;
	}

	.nev__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.nev__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.nev__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.nev__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.neuroscience-electrophys-vault-workbench {
		padding: 10px;
	}

	.nev__kpis,
	.nev__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.nev__num-input {
		inline-size: 100%;
	}

	.nev__field {
		flex: 1 1 100%;
	}
}
</style>
