<template>
	<section
		class="orbital-spacecraft-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Orbital Spaceflight, CCSDS and Satellite Telemetry Vault Auditor')">
		<header class="osv__toolbar">
			<div class="osv__title-group">
				<h3 class="osv__title">
					{{ t('duplicatefinder', 'Orbital Spaceflight & CCSDS Vault Auditor') }}
				</h3>
				<span
					class="osv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {ccsds} ccsds-tle, {masters} raw-cadu, {hold} flight-hold, {exports} ephem-export, {scratch} pass-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						ccsds: analysis.summary.totalCcsdsFlightClusters,
						masters: analysis.summary.totalRawTelemetryMasterClusters,
						hold: analysis.summary.totalMissionHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalPassScratchClusters,
					}) }}
				</span>
			</div>

			<div class="osv__toolbar-actions">
				<button
					type="button"
					class="osv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="osv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="osv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="osv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="osv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+O"
					:title="t('duplicatefinder', 'Hide Orbital Spaceflight, CCSDS and Satellite Telemetry Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Orbital & CCSDS') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="osv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="osv__kpis">
			<div class="osv__kpi">
				<span class="osv__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="osv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="osv__kpi">
				<span class="osv__kpi-label">{{ t('duplicatefinder', 'Conserved CCSDS, Raw CADU & Holds') }}</span>
				<strong class="osv__kpi-val is-warn">
					{{ analysis.summary.totalCcsdsFlightClusters }} {{ t('duplicatefinder', 'ccsds/tle') }} / {{ analysis.summary.totalRawTelemetryMasterClusters }} {{ t('duplicatefinder', 'raw-cadu') }} / {{ analysis.summary.totalMissionHoldClusters }} {{ t('duplicatefinder', 'flight-hold') }}
				</strong>
			</div>
			<div class="osv__kpi">
				<span class="osv__kpi-label">{{ t('duplicatefinder', 'Redundant Ephem & Pass Scratch') }}</span>
				<strong class="osv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'ephem/plots') }} / {{ analysis.summary.totalPassScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="osv__kpi">
				<span class="osv__kpi-label">{{ t('duplicatefinder', 'Orbital & Telemetry Duplicate Footprint') }}</span>
				<strong class="osv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="osv__empty-banner"
			role="note">
			<div class="osv__empty-text">
				<p class="osv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure CCSDS/TLE, Raw CADU/L0, and Flight-Ops Hold shields before scanning') }}
				</p>
				<p class="osv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit CCSDS NDM/XTCE/TLE baselines, ITAR/conjunction holds, raw CADU/VCDU/TLM/L0 masters, CZML/CSV exports, and GMAT/STK pass scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="osv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="osv__controls">
			<div class="osv__control-row">
				<span class="osv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="osv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Orbital spaceflight and CCSDS vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="osv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="osv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="osv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="osv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="osv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="osv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="osv__seg-btn"
					:class="{ 'is-active': protectCcsdsAndFlightDynamics }"
					:aria-pressed="protectCcsdsAndFlightDynamics ? 'true' : 'false'"
					@click="protectCcsdsAndFlightDynamics = !protectCcsdsAndFlightDynamics">
					<span>{{ protectCcsdsAndFlightDynamics ? t('duplicatefinder', 'Shield CCSDS / TLE / SP3: ON') : t('duplicatefinder', 'Shield CCSDS / TLE / SP3: OFF') }}</span>
				</button>

				<button
					type="button"
					class="osv__seg-btn"
					:class="{ 'is-active': protectRawTelemetryMasters }"
					:aria-pressed="protectRawTelemetryMasters ? 'true' : 'false'"
					@click="protectRawTelemetryMasters = !protectRawTelemetryMasters">
					<span>{{ protectRawTelemetryMasters ? t('duplicatefinder', 'Shield CADU / TLM / L0: ON') : t('duplicatefinder', 'Shield CADU / TLM / L0: OFF') }}</span>
				</button>

				<button
					type="button"
					class="osv__seg-btn"
					:class="{ 'is-active': protectMissionFlightHolds }"
					:aria-pressed="protectMissionFlightHolds ? 'true' : 'false'"
					@click="protectMissionFlightHolds = !protectMissionFlightHolds">
					<span>{{ protectMissionFlightHolds ? t('duplicatefinder', 'Shield ITAR / Flight Holds: ON') : t('duplicatefinder', 'Shield ITAR / Flight Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="osv__seg-btn"
					:class="{ 'is-active': requireOrbitalAnchorForPrune }"
					:aria-pressed="requireOrbitalAnchorForPrune ? 'true' : 'false'"
					@click="requireOrbitalAnchorForPrune = !requireOrbitalAnchorForPrune">
					<span>{{ requireOrbitalAnchorForPrune ? t('duplicatefinder', 'Require CADU / CCSDS Anchor: ON') : t('duplicatefinder', 'Require CADU / CCSDS Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="osv__control-row osv__inputs-row">
				<label class="osv__field">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="osv__input">
						<option value="prune-exports-and-pass-scratch">{{ t('duplicatefinder', 'Prune Redundant Ephem & Scratch') }}</option>
						<option value="hardlink-immutable-cadu-and-l0">{{ t('duplicatefinder', 'Hardlink Immutable CADU/L0 (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-pass-scratch">{{ t('duplicatefinder', 'Quarantine Ephem & Pass Scratch') }}</option>
					</select>
				</label>

				<label class="osv__field">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="osv__input">
						<option value="ccsds-raw-telemetry-first">{{ t('duplicatefinder', 'CCSDS/TLE & Raw CADU/L0 first') }}</option>
						<option value="oldest-pass-first">{{ t('duplicatefinder', 'Oldest downlink pass first') }}</option>
						<option value="newest-ephem-first">{{ t('duplicatefinder', 'Newest ephemeris solution first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="osv__field">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Pass Grace (d)') }}</span>
					<input
						v-model="keepRecentPassDaysInput"
						type="number"
						min="0"
						step="1"
						class="osv__input osv__num-input">
				</label>

				<label class="osv__field">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="osv__input osv__num-input">
				</label>

				<label class="osv__field osv__field-grow">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Filter Pass, CADU, TLM, L0, CCSDS, TLE, SP3 or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="osv__input"
						:placeholder="t('duplicatefinder', 'e.g. cadu, vcdu, oem, cdm, tle, sp3, l0, czml, gmat_tmp')">
				</label>

				<label class="osv__field">
					<span class="osv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="osv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="osv__control-row">
				<span class="osv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="osv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Orbital spaceflight and CCSDS artifact family filter')">
					<button
						type="button"
						class="osv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="osv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="osv__control-row">
				<span class="osv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="osv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Orbital spaceflight governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="osv__seg-btn"
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
			class="osv__empty-filter"
			role="note">
			<p class="osv__empty-title">
				{{ t('duplicatefinder', 'No CCSDS baselines, TLE catalogs, raw CADU/TLM/L0 masters, ephemeris exports, or GMAT/STK scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="osv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="osv__workspace">
			<div
				class="osv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Orbital Spaceflight and CCSDS vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="osv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="osv__cluster-top">
						<strong class="osv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="osv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="osv__cluster-meta">
						<span
							v-if="cluster.orbitalToolchain"
							class="osv__tag">{{ cluster.orbitalToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="osv__tag">{{ cluster.workflowStage }}</span>
						<span class="osv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="osv__cluster-badges">
						<span
							v-if="cluster.hasRedundantOrbitalExport"
							class="osv__badge is-redundant">
							{{ cluster.hasOrbitalMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedMissionHold"
							class="osv__badge is-keep">
							{{ t('duplicatefinder', 'ITAR / Flight-Ops Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCcsdsFlight"
							class="osv__badge is-keep">
							{{ t('duplicatefinder', 'CCSDS / TLE Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawTelemetryMaster"
							class="osv__badge is-consolidate">
							{{ t('duplicatefinder', 'Raw CADU / L0 Conserved') }}
						</span>
						<span
							v-if="cluster.hasPassScratchIntermediate"
							class="osv__badge is-warn">
							{{ t('duplicatefinder', 'GMAT / STK / Pass Scratch') }}
						</span>
					</div>
					<div class="osv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="osv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="osv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="osv__inspector">
				<header class="osv__inspector-head">
					<div class="osv__inspector-title-wrap">
						<h4 class="osv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="osv__inspector-sub">
							{{ selectedCluster.orbitalToolchain || selectedCluster.passStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="osv__inspector-actions">
						<button
							type="button"
							class="osv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="osv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="osv__lineage-grid">
					<div class="osv__lineage-item">
						<span class="osv__lineage-label">{{ t('duplicatefinder', 'Pass Stem & Orbital Toolchain') }}</span>
						<strong class="osv__lineage-val">{{ selectedCluster.orbitalToolchain ? `${selectedCluster.orbitalToolchain} / ` : '' }}{{ selectedCluster.passStem }} ({{ selectedCluster.orbitalAnchorKey }})</strong>
					</div>
					<div class="osv__lineage-item">
						<span class="osv__lineage-label">{{ t('duplicatefinder', 'CCSDS, TLE & Flight-Ops Governance') }}</span>
						<strong class="osv__lineage-val">
							{{ selectedCluster.hasProtectedMissionHold ? t('duplicatefinder', 'ITAR, ECSS or Conjunction Hold Shielded') : (selectedCluster.hasProtectedCcsdsFlight ? t('duplicatefinder', 'CCSDS NDM, XTCE/MIB or TLE Baseline Shielded') : (selectedCluster.hasProtectedRawTelemetryMaster ? t('duplicatefinder', 'Raw CADU, VCDU, TLM, L0 or Baseband IQ Shielded') : t('duplicatefinder', 'GMAT/STK Scratch or Derived Ephemeris Export'))) }}
						</strong>
					</div>
					<div class="osv__lineage-item">
						<span class="osv__lineage-label">{{ t('duplicatefinder', 'Raw Telemetry / CCSDS Master Anchor') }}</span>
						<strong class="osv__lineage-val">
							{{ selectedCluster.hasOrbitalMasterAnchor ? t('duplicatefinder', 'Verified Raw CADU, TLM, L0 or CCSDS Anchor Found') : t('duplicatefinder', 'No Raw Telemetry or CCSDS Anchor Detected') }}
						</strong>
					</div>
					<div class="osv__lineage-item">
						<span class="osv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="osv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="osv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="osv__member-card">
						<div class="osv__member-top">
							<code class="osv__member-path">{{ member.normalized }}</code>
							<div class="osv__member-pills">
								<span
									v-if="member.isRedundantOrbitalExportMember"
									class="osv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="osv__pill is-warn">
									{{ t('duplicatefinder', 'PASS / FDO SCRATCH') }}
								</span>
								<span
									class="osv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.orbitalTag"
									class="osv__pill is-consolidate">
									{{ member.orbitalTag }}
								</span>
								<span
									class="osv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="osv__member-bottom">
							<div class="osv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="osv__member-actions">
								<button
									type="button"
									class="osv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantOrbitalExportMember) && !(member.isProtectedMissionFlightHold && protectMissionFlightHolds) && !(member.isProtectedCcsdsFlightDynamics && protectCcsdsAndFlightDynamics) && !(member.isProtectedRawTelemetryMaster && protectRawTelemetryMasters)"
									class="osv__override-field">
									<span class="osv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="osv__override-select"
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

				<div class="osv__code-panels">
					<div class="osv__code-box">
						<div class="osv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="osv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="osv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="osv__code-box">
						<div class="osv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="osv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="osv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	ORBITAL_SPACECRAFT_PRESETS,
	auditOrbitalSpacecraftVault,
	buildOrbitalSpacecraftCsvReport,
	buildOrbitalSpacecraftJsonManifest,
	buildOrbitalSpacecraftRemediationScript,
	buildOrbitalSpacecraftSyncExcludeList,
} from '../tools/orbitalSpacecraftVaultAuditor'

export default {
	name: 'OrbitalSpacecraftVaultWorkbench',
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
			presetId: 'all-orbital-spacecraft-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-pass-scratch',
			survivorRule: 'ccsds-raw-telemetry-first',
			protectCcsdsAndFlightDynamics: true,
			protectRawTelemetryMasters: true,
			protectMissionFlightHolds: true,
			requireOrbitalAnchorForPrune: true,
			keepRecentPassDaysInput: '0',
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
			return ORBITAL_SPACECRAFT_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'orbital-export-redundant', label: this.t('duplicatefinder', 'Ephem / Plot Exports') },
				{ id: 'pass-scratch-intermediate', label: this.t('duplicatefinder', 'Pass / FDO Scratch') },
				{ id: 'ccsds-flight-protected', label: this.t('duplicatefinder', 'CCSDS / TLE / SP3') },
				{ id: 'raw-telemetry-protected', label: this.t('duplicatefinder', 'Raw CADU / TLM / L0') },
				{ id: 'mission-hold-protected', label: this.t('duplicatefinder', 'ITAR / Flight Hold') },
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
		parsedKeepRecentPassDays() {
			const trimmed = String(this.keepRecentPassDaysInput ?? '').trim()
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
			return auditOrbitalSpacecraftVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCcsdsAndFlightDynamics: this.protectCcsdsAndFlightDynamics,
				protectRawTelemetryMasters: this.protectRawTelemetryMasters,
				protectMissionFlightHolds: this.protectMissionFlightHolds,
				requireOrbitalAnchorForPrune: this.requireOrbitalAnchorForPrune,
				keepRecentPassDays: this.parsedKeepRecentPassDays,
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
			return buildOrbitalSpacecraftRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildOrbitalSpacecraftSyncExcludeList()
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
			const preset = ORBITAL_SPACECRAFT_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCcsdsAndFlightDynamics = preset.protectCcsdsAndFlightDynamics
			this.protectRawTelemetryMasters = preset.protectRawTelemetryMasters
			this.protectMissionFlightHolds = preset.protectMissionFlightHolds
			this.requireOrbitalAnchorForPrune = preset.requireOrbitalAnchorForPrune
			this.keepRecentPassDaysInput = String(preset.keepRecentPassDays)
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
				'ccsds-flight-protected': this.t('duplicatefinder', 'CCSDS / TLE'),
				'raw-telemetry-protected': this.t('duplicatefinder', 'Raw CADU / L0'),
				'mission-hold-protected': this.t('duplicatefinder', 'ITAR / Flight Hold'),
				'orbital-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'pass-scratch-intermediate': this.t('duplicatefinder', 'Pass / FDO Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'orbital-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'ccsds-flight-protected' || verdict === 'mission-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-telemetry-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'pass-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantOrbitalExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-pass-scratch' && (member.isRedundantOrbitalExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Orbital Spaceflight or CCSDS vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Orbital & CCSDS remediation script to clipboard.'))
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
			const csv = buildOrbitalSpacecraftCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-orbital-spacecraft-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Orbital & CCSDS Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildOrbitalSpacecraftJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-orbital-spacecraft-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Orbital & CCSDS Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.orbital-spacecraft-vault-workbench {
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

.osv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.osv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.osv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.osv__status-badge {
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

.osv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.osv__tool-btn,
.osv__seg-btn,
.osv__primary-btn,
.osv__load-more-btn,
.osv__mini-btn {
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

.osv__tool-btn.is-primary-outline,
.osv__primary-btn {
	border-color: var(--color-primary-element);
}

.osv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.osv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.osv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.osv__tool-btn:focus-visible,
.osv__seg-btn:focus-visible,
.osv__primary-btn:focus-visible,
.osv__load-more-btn:focus-visible,
.osv__mini-btn:focus-visible,
.osv__cluster-card:focus-visible,
.osv__input:focus-visible,
.osv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.osv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.osv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.osv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.osv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.osv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.osv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.osv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.osv__empty-banner,
.osv__empty-filter {
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

.osv__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.osv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.osv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.osv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.osv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.osv__inputs-row {
	align-items: flex-end;
}

.osv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.osv__field-grow {
	flex: 1 1 220px;
}

.osv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osv__input,
.osv__override-select {
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

.osv__num-input {
	inline-size: 96px;
}

.osv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.osv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.osv__cluster-card {
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

.osv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.osv__cluster-top,
.osv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.osv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.osv__cluster-meta,
.osv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.osv__tag {
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

.osv__badge,
.osv__pill {
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

.osv__pill.is-keep,
.osv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.osv__pill.is-redundant,
.osv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.osv__pill.is-consolidate,
.osv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.osv__pill.is-warn,
.osv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.osv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.osv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.osv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.osv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.osv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.osv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.osv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.osv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.osv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.osv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.osv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.osv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.osv__member-top,
.osv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.osv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.osv__member-pills,
.osv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.osv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.osv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.osv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.osv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.osv__pre {
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

.osv__sr-only {
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
	.osv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.osv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.osv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.osv__kpis,
	.osv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.osv__num-input {
		inline-size: 100%;
	}

	.osv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.osv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.osv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.osv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.orbital-spacecraft-vault-workbench {
		padding: 10px;
	}

	.osv__kpis,
	.osv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.osv__num-input {
		inline-size: 100%;
	}

	.osv__field {
		flex: 1 1 100%;
	}
}
</style>
