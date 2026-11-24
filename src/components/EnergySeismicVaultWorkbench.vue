<template>
	<section
		class="energy-seismic-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Energy, Seismic SEG-Y, Well-Log and Reservoir Simulation Vault Auditor')">
		<header class="esv__toolbar">
			<div class="esv__title-group">
				<h3 class="esv__title">
					{{ t('duplicatefinder', 'Energy, Seismic SEG-Y, Well-Log & Reservoir Simulation Vault Auditor') }}
				</h3>
				<span
					class="esv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {osdu} osdu-welllog, {segy} segy-reservoir, {reg} bsee-ccus, {ascii} ascii-csv, {scratch} sim-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						osdu: analysis.summary.totalWellLogOsduClusters,
						segy: analysis.summary.totalSeismicReservoirClusters,
						reg: analysis.summary.totalRegulatoryWellClusters,
						ascii: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalSimScratchClusters,
					}) }}
				</span>
			</div>

			<div class="esv__toolbar-actions">
				<button
					type="button"
					class="esv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="esv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="esv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="esv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="esv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+E"
					:title="t('duplicatefinder', 'Hide Energy, Seismic SEG-Y, Well-Log and Reservoir Simulation Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Energy & Seismic Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="esv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="esv__kpis">
			<div class="esv__kpi">
				<span class="esv__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="esv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="esv__kpi">
				<span class="esv__kpi-label">{{ t('duplicatefinder', 'Conserved OSDU, SEG-Y & CCUS/BSEE') }}</span>
				<strong class="esv__kpi-val is-warn">
					{{ analysis.summary.totalWellLogOsduClusters }} {{ t('duplicatefinder', 'osdu/las') }} / {{ analysis.summary.totalSeismicReservoirClusters }} {{ t('duplicatefinder', 'segy/sim') }} / {{ analysis.summary.totalRegulatoryWellClusters }} {{ t('duplicatefinder', 'bsee/ccus') }}
				</strong>
			</div>
			<div class="esv__kpi">
				<span class="esv__kpi-label">{{ t('duplicatefinder', 'Redundant ASCII/CSV & Sim Scratch') }}</span>
				<strong class="esv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'ascii-export') }} / {{ analysis.summary.totalSimScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="esv__kpi">
				<span class="esv__kpi-label">{{ t('duplicatefinder', 'Raw Energy & Seismic Duplicate Footprint') }}</span>
				<strong class="esv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="esv__empty-banner"
			role="note">
			<div class="esv__empty-text">
				<p class="esv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure OSDU, well-log, and SEG-Y/reservoir shields before scanning') }}
				</p>
				<p class="esv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit well-log & Energistics masters (.las, .dlis, .witsml, .resqml), SEG-Y/OpenZGY/VDS seismic volumes, ECLIPSE/tNavigator/CMG reservoir decks (.egrid, .unrst, .pet), ASCII/XYZ/RSM exports, and simulator scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="esv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="esv__controls">
			<div class="esv__control-row">
				<span class="esv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="esv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Energy and Seismic vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="esv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="esv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="esv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="esv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="esv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="esv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="esv__seg-btn"
					:class="{ 'is-active': protectWellLogAndOsdu }"
					:aria-pressed="protectWellLogAndOsdu ? 'true' : 'false'"
					@click="protectWellLogAndOsdu = !protectWellLogAndOsdu">
					<span>{{ protectWellLogAndOsdu ? t('duplicatefinder', 'Shield OSDU/.las/.dlis: ON') : t('duplicatefinder', 'Shield OSDU/.las/.dlis: OFF') }}</span>
				</button>

				<button
					type="button"
					class="esv__seg-btn"
					:class="{ 'is-active': protectSeismicReservoirAnchors }"
					:aria-pressed="protectSeismicReservoirAnchors ? 'true' : 'false'"
					@click="protectSeismicReservoirAnchors = !protectSeismicReservoirAnchors">
					<span>{{ protectSeismicReservoirAnchors ? t('duplicatefinder', 'Shield SEG-Y/ZGY/ECLIPSE: ON') : t('duplicatefinder', 'Shield SEG-Y/ZGY/ECLIPSE: OFF') }}</span>
				</button>

				<button
					type="button"
					class="esv__seg-btn"
					:class="{ 'is-active': protectRegulatoryWellEvidence }"
					:aria-pressed="protectRegulatoryWellEvidence ? 'true' : 'false'"
					@click="protectRegulatoryWellEvidence = !protectRegulatoryWellEvidence">
					<span>{{ protectRegulatoryWellEvidence ? t('duplicatefinder', 'Shield BSEE/CCUS Holds: ON') : t('duplicatefinder', 'Shield BSEE/CCUS Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="esv__seg-btn"
					:class="{ 'is-active': requireSeismicAnchorForPrune }"
					:aria-pressed="requireSeismicAnchorForPrune ? 'true' : 'false'"
					@click="requireSeismicAnchorForPrune = !requireSeismicAnchorForPrune">
					<span>{{ requireSeismicAnchorForPrune ? t('duplicatefinder', 'Require SEG-Y/DLIS Anchor: ON') : t('duplicatefinder', 'Require SEG-Y/DLIS Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="esv__control-row esv__inputs-row">
				<label class="esv__field">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="esv__input">
						<option value="prune-exports-and-sim-scratch">{{ t('duplicatefinder', 'Prune Redundant .csv/.xyz/.rsm & Scratch') }}</option>
						<option value="hardlink-immutable-seismic-and-unrst">{{ t('duplicatefinder', 'Hardlink Immutable SEG-Y/ZGY/UNRST (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-sim-scratch">{{ t('duplicatefinder', 'Quarantine ASCII Exports & Scratch') }}</option>
					</select>
				</label>

				<label class="esv__field">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="esv__input">
						<option value="osdu-segy-first">{{ t('duplicatefinder', 'OSDU, Well-Log & SEG-Y first') }}</option>
						<option value="oldest-survey-first">{{ t('duplicatefinder', 'Oldest survey acquisition first') }}</option>
						<option value="newest-deck-revision-first">{{ t('duplicatefinder', 'Newest reservoir deck revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="esv__field">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Processing Grace (d)') }}</span>
					<input
						v-model="keepRecentSurveyDaysInput"
						type="number"
						min="0"
						step="1"
						class="esv__input esv__num-input">
				</label>

				<label class="esv__field">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="esv__input esv__num-input">
				</label>

				<label class="esv__field esv__field-grow">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Filter Survey, Well, Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="esv__input"
						:placeholder="t('duplicatefinder', 'e.g. segy, zgy, dlis, las, eclipse, petrel, osdu, ccus')">
				</label>

				<label class="esv__field">
					<span class="esv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="esv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'ASCII export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="esv__control-row">
				<span class="esv__control-label">{{ t('duplicatefinder', 'Subsurface Family') }}</span>
				<div
					class="esv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Energy and Seismic artifact family filter')">
					<button
						type="button"
						class="esv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="esv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="esv__control-row">
				<span class="esv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="esv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Energy and Seismic governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="esv__seg-btn"
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
			class="esv__empty-filter"
			role="note">
			<p class="esv__empty-title">
				{{ t('duplicatefinder', 'No OSDU/well-log masters, SEG-Y/OpenZGY volumes, reservoir decks, ASCII exports, or simulator scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="esv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="esv__workspace">
			<div
				class="esv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Energy, Seismic SEG-Y, Well-Log and Reservoir Simulation vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="esv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="esv__cluster-top">
						<strong class="esv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="esv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="esv__cluster-meta">
						<span
							v-if="cluster.subsurfaceToolchain"
							class="esv__tag">{{ cluster.subsurfaceToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="esv__tag">{{ cluster.workflowStage }}</span>
						<span class="esv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="esv__cluster-badges">
						<span
							v-if="cluster.hasRedundantAsciiExport"
							class="esv__badge is-redundant">
							{{ cluster.hasSeismicReservoirAnchor
								? t('duplicatefinder', 'Redundant Export (SEG-Y/ECLIPSE Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No SEG-Y/ECLIPSE Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedRegulatoryWell"
							class="esv__badge is-keep">
							{{ t('duplicatefinder', 'BSEE / CCUS Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedWellLogOsdu"
							class="esv__badge is-keep">
							{{ t('duplicatefinder', 'OSDU / Well-Log Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedSeismicReservoir"
							class="esv__badge is-consolidate">
							{{ t('duplicatefinder', 'SEG-Y / OpenZGY / Reservoir Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasSimScratchIntermediate"
							class="esv__badge is-warn">
							{{ t('duplicatefinder', 'Simulator / Processing Scratch') }}
						</span>
					</div>
					<div class="esv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="esv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="esv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="esv__inspector">
				<header class="esv__inspector-head">
					<div class="esv__inspector-title-wrap">
						<h4 class="esv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="esv__inspector-sub">
							{{ selectedCluster.subsurfaceToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="esv__inspector-actions">
						<button
							type="button"
							class="esv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="esv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="esv__lineage-grid">
					<div class="esv__lineage-item">
						<span class="esv__lineage-label">{{ t('duplicatefinder', 'Subsurface Lineage & Toolchain') }}</span>
						<strong class="esv__lineage-val">{{ selectedCluster.subsurfaceToolchain ? `${selectedCluster.subsurfaceToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.seismicAnchorKey }})</strong>
					</div>
					<div class="esv__lineage-item">
						<span class="esv__lineage-label">{{ t('duplicatefinder', 'OSDU, Well-Log & BSEE/CCUS Governance') }}</span>
						<strong class="esv__lineage-val">
							{{ selectedCluster.hasProtectedRegulatoryWell ? t('duplicatefinder', 'BSEE / NSTA Well-Integrity & CCUS Permit Hold Shielded') : (selectedCluster.hasProtectedWellLogOsdu ? t('duplicatefinder', 'OSDU Manifest, WITSML/RESQML & Well-Log Master Shielded') : (selectedCluster.hasProtectedSeismicReservoir ? t('duplicatefinder', 'SEG-Y, OpenZGY, VDS & Reservoir Deck Master Shielded') : t('duplicatefinder', 'Simulator Scratch or ASCII Export Artifact'))) }}
						</strong>
					</div>
					<div class="esv__lineage-item">
						<span class="esv__lineage-label">{{ t('duplicatefinder', 'SEG-Y / OpenZGY / DLIS / ECLIPSE Anchor') }}</span>
						<strong class="esv__lineage-val">
							{{ selectedCluster.hasSeismicReservoirAnchor ? t('duplicatefinder', 'Verified SEG-Y, OpenZGY, DLIS or Reservoir Anchor Found') : t('duplicatefinder', 'No SEG-Y, OpenZGY, DLIS or Reservoir Anchor Detected') }}
						</strong>
					</div>
					<div class="esv__lineage-item">
						<span class="esv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="esv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="esv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="esv__member-card">
						<div class="esv__member-top">
							<code class="esv__member-path">{{ member.normalized }}</code>
							<div class="esv__member-pills">
								<span
									v-if="member.isRedundantAsciiExportMember"
									class="esv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (SEG-Y/ECLIPSE EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="esv__pill is-warn">
									{{ t('duplicatefinder', 'SIM SCRATCH') }}
								</span>
								<span
									class="esv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.energyTag"
									class="esv__pill is-consolidate">
									{{ member.energyTag }}
								</span>
								<span
									class="esv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="esv__member-bottom">
							<div class="esv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="esv__member-actions">
								<button
									type="button"
									class="esv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantAsciiExportMember) && !(member.isProtectedRegulatoryWell && protectRegulatoryWellEvidence) && !(member.isProtectedWellLogOsdu && protectWellLogAndOsdu) && !(member.isProtectedSeismicReservoir && protectSeismicReservoirAnchors)"
									class="esv__override-field">
									<span class="esv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="esv__override-select"
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

				<div class="esv__code-panels">
					<div class="esv__code-box">
						<div class="esv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="esv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="esv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="esv__code-box">
						<div class="esv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="esv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="esv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	ENERGY_SEISMIC_PRESETS,
	auditEnergySeismicVault,
	buildEnergySeismicCsvReport,
	buildEnergySeismicJsonManifest,
	buildEnergySeismicRemediationScript,
	buildEnergySeismicSyncExcludeList,
} from '../tools/energySeismicVaultAuditor'

export default {
	name: 'EnergySeismicVaultWorkbench',
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
			presetId: 'all-energy-seismic-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-sim-scratch',
			survivorRule: 'osdu-segy-first',
			protectWellLogAndOsdu: true,
			protectSeismicReservoirAnchors: true,
			protectRegulatoryWellEvidence: true,
			requireSeismicAnchorForPrune: true,
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
			return ENERGY_SEISMIC_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'ascii-export-redundant', label: this.t('duplicatefinder', 'ASCII / XYZ / RSM') },
				{ id: 'sim-scratch-intermediate', label: this.t('duplicatefinder', 'Sim Scratch') },
				{ id: 'osdu-welllog-protected', label: this.t('duplicatefinder', 'OSDU & Well-Log') },
				{ id: 'seismic-reservoir-protected', label: this.t('duplicatefinder', 'SEG-Y / Reservoir') },
				{ id: 'regulatory-ccus-protected', label: this.t('duplicatefinder', 'BSEE / CCUS') },
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
			return auditEnergySeismicVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectWellLogAndOsdu: this.protectWellLogAndOsdu,
				protectSeismicReservoirAnchors: this.protectSeismicReservoirAnchors,
				protectRegulatoryWellEvidence: this.protectRegulatoryWellEvidence,
				requireSeismicAnchorForPrune: this.requireSeismicAnchorForPrune,
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
			return buildEnergySeismicRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildEnergySeismicSyncExcludeList()
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
			const preset = ENERGY_SEISMIC_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectWellLogAndOsdu = preset.protectWellLogAndOsdu
			this.protectSeismicReservoirAnchors = preset.protectSeismicReservoirAnchors
			this.protectRegulatoryWellEvidence = preset.protectRegulatoryWellEvidence
			this.requireSeismicAnchorForPrune = preset.requireSeismicAnchorForPrune
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
				'osdu-welllog-protected': this.t('duplicatefinder', 'OSDU & Well-Log'),
				'seismic-reservoir-protected': this.t('duplicatefinder', 'SEG-Y / Reservoir'),
				'regulatory-ccus-protected': this.t('duplicatefinder', 'BSEE / CCUS'),
				'ascii-export-redundant': this.t('duplicatefinder', 'Redundant ASCII Export'),
				'sim-scratch-intermediate': this.t('duplicatefinder', 'Sim Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'ascii-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'osdu-welllog-protected' || verdict === 'regulatory-ccus-protected') {
				return 'is-keep'
			}
			if (verdict === 'seismic-reservoir-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'sim-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantAsciiExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-sim-scratch' && (member.isRedundantAsciiExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Energy or Seismic vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Energy & Seismic remediation script to clipboard.'))
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
			const csv = buildEnergySeismicCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-energy-seismic-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Energy & Seismic Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildEnergySeismicJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-energy-seismic-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Energy & Seismic Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.energy-seismic-vault-workbench {
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

.esv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.esv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.esv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.esv__status-badge {
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

.esv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.esv__tool-btn,
.esv__seg-btn,
.esv__primary-btn,
.esv__load-more-btn,
.esv__mini-btn {
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

.esv__tool-btn:hover:not(:disabled),
.esv__seg-btn:hover:not(:disabled),
.esv__load-more-btn:hover:not(:disabled),
.esv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.esv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.esv__tool-btn.is-primary-outline,
.esv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.esv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.esv__tool-btn:focus-visible,
.esv__seg-btn:focus-visible,
.esv__primary-btn:focus-visible,
.esv__load-more-btn:focus-visible,
.esv__mini-btn:focus-visible,
.esv__cluster-card:focus-visible,
.esv__input:focus-visible,
.esv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.esv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.esv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.esv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.esv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.esv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.esv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.esv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.esv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.esv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.esv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.esv__empty-banner,
.esv__empty-filter {
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

.esv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.esv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.esv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.esv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.esv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.esv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.esv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.esv__inputs-row {
	align-items: flex-end;
}

.esv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.esv__field-grow {
	flex: 1 1 180px;
}

.esv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.esv__input,
.esv__override-select {
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

.esv__num-input {
	inline-size: 96px;
}

.esv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.esv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.esv__cluster-card {
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

.esv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.esv__cluster-top,
.esv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.esv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.esv__cluster-meta,
.esv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.esv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.esv__badge,
.esv__pill {
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

.esv__pill.is-keep,
.esv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.esv__pill.is-redundant,
.esv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.esv__pill.is-consolidate,
.esv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.esv__pill.is-warn,
.esv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.esv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.esv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.esv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.esv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.esv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.esv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.esv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.esv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.esv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.esv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.esv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.esv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.esv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.esv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.esv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.esv__member-top,
.esv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.esv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.esv__member-pills,
.esv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.esv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.esv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.esv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.esv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.esv__pre {
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

.esv__sr-only {
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
	.esv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.esv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.esv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.energy-seismic-vault-workbench {
		padding: 10px;
	}

	.esv__kpis,
	.esv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.esv__num-input {
		inline-size: 100%;
	}

	.esv__field {
		flex: 1 1 100%;
	}
}
</style>
