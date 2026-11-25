<template>
	<section
		class="yacht-racing-foiling-nmea-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Yacht Racing, Foil Hydrodynamics and Maritime NMEA/VDR Telemetry Vault Auditor')">
		<header class="yrn__toolbar">
			<div class="yrn__title-group">
				<h3 class="yrn__title">
					{{ t('duplicatefinder', 'Yacht Racing, Foil Hydrodynamics & Maritime NMEA/VDR Vault Auditor') }}
				</h3>
				<span
					class="yrn__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {cls} class-vdr, {masters} nmea-foil, {hold} protest-hold, {exports} yacht-export, {scratch} nav-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						cls: analysis.summary.totalClassVdrClusters,
						masters: analysis.summary.totalNmeaFoilMasterClusters,
						hold: analysis.summary.totalProtestHoldClusters,
						exports: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalScratchClusters,
					}) }}
				</span>
			</div>

			<div class="yrn__toolbar-actions">
				<button
					type="button"
					class="yrn__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="yrn__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="yrn__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="yrn__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="yrn__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+Y"
					:title="t('duplicatefinder', 'Hide Yacht Racing, Foil Hydrodynamics and Maritime NMEA/VDR Telemetry Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Yacht & NMEA/VDR') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="yrn__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="yrn__kpis">
			<div class="yrn__kpi">
				<span class="yrn__kpi-label">{{ t('duplicatefinder', 'Safe Replay & Nav Scratch Reclaim') }}</span>
				<strong class="yrn__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="yrn__kpi">
				<span class="yrn__kpi-label">{{ t('duplicatefinder', 'Conserved Class Rules, VDR & Holds') }}</span>
				<strong class="yrn__kpi-val is-warn">
					{{ analysis.summary.totalClassVdrClusters }} {{ t('duplicatefinder', 'orc/vdr') }} / {{ analysis.summary.totalNmeaFoilMasterClusters }} {{ t('duplicatefinder', 'nmea/foil') }} / {{ analysis.summary.totalProtestHoldClusters }} {{ t('duplicatefinder', 'protest-hold') }}
				</strong>
			</div>
			<div class="yrn__kpi">
				<span class="yrn__kpi-label">{{ t('duplicatefinder', 'Derived Replays & Nav Scratch') }}</span>
				<strong class="yrn__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'replay/gpx') }} / {{ analysis.summary.totalScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="yrn__kpi">
				<span class="yrn__kpi-label">{{ t('duplicatefinder', 'Yacht & NMEA/VDR Duplicate Footprint') }}</span>
				<strong class="yrn__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="yrn__empty-banner"
			role="note">
			<div class="yrn__empty-text">
				<p class="yrn__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure ORC/IRC & IMO VDR, NMEA/Foil/VPP Master, and Protest Hold shields before scanning') }}
				</p>
				<p class="yrn__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Jury protest/VDR holds, ORC/IRC hull certificates, NMEA 0183/2000 PGN logs, hydrofoil DAQ/CFD masters, VPP polars, GRIB2 weather, and nav-suite scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="yrn__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="yrn__controls">
			<div class="yrn__control-row">
				<span class="yrn__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="yrn__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Yacht Racing, Foil Hydrodynamics and Maritime NMEA/VDR vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="yrn__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="yrn__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="yrn__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="yrn__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="yrn__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="yrn__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="yrn__seg-btn"
					:class="{ 'is-active': protectClassRulesAndVdrBaselines }"
					:aria-pressed="protectClassRulesAndVdrBaselines ? 'true' : 'false'"
					@click="protectClassRulesAndVdrBaselines = !protectClassRulesAndVdrBaselines">
					<span>{{ protectClassRulesAndVdrBaselines ? t('duplicatefinder', 'Shield ORC / IMO VDR: ON') : t('duplicatefinder', 'Shield ORC / IMO VDR: OFF') }}</span>
				</button>

				<button
					type="button"
					class="yrn__seg-btn"
					:class="{ 'is-active': protectNmeaFoilHydroMasters }"
					:aria-pressed="protectNmeaFoilHydroMasters ? 'true' : 'false'"
					@click="protectNmeaFoilHydroMasters = !protectNmeaFoilHydroMasters">
					<span>{{ protectNmeaFoilHydroMasters ? t('duplicatefinder', 'Shield NMEA / Foil Masters: ON') : t('duplicatefinder', 'Shield NMEA / Foil Masters: OFF') }}</span>
				</button>

				<button
					type="button"
					class="yrn__seg-btn"
					:class="{ 'is-active': protectProtestAndSafetyHolds }"
					:aria-pressed="protectProtestAndSafetyHolds ? 'true' : 'false'"
					@click="protectProtestAndSafetyHolds = !protectProtestAndSafetyHolds">
					<span>{{ protectProtestAndSafetyHolds ? t('duplicatefinder', 'Shield Protest / Safety Holds: ON') : t('duplicatefinder', 'Shield Protest / Safety Holds: OFF') }}</span>
				</button>

				<button
					type="button"
					class="yrn__seg-btn"
					:class="{ 'is-active': requireYachtMasterAnchorForPrune }"
					:aria-pressed="requireYachtMasterAnchorForPrune ? 'true' : 'false'"
					@click="requireYachtMasterAnchorForPrune = !requireYachtMasterAnchorForPrune">
					<span>{{ requireYachtMasterAnchorForPrune ? t('duplicatefinder', 'Require Master Anchor: ON') : t('duplicatefinder', 'Require Master Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="yrn__control-row yrn__inputs-row">
				<label class="yrn__field">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="yrn__input">
						<option value="prune-exports-and-yacht-scratch">{{ t('duplicatefinder', 'Prune Replays & Nav/Telemetry Scratch') }}</option>
						<option value="hardlink-immutable-yacht-masters">{{ t('duplicatefinder', 'Hardlink Immutable NMEA/Foil (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-yacht-scratch">{{ t('duplicatefinder', 'Quarantine Replays & Nav/Telemetry Scratch') }}</option>
					</select>
				</label>

				<label class="yrn__field">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="yrn__input">
						<option value="yacht-vdr-nmea-master-first">{{ t('duplicatefinder', 'Class/VDR & NMEA/Foil masters first') }}</option>
						<option value="oldest-regatta-leg-first">{{ t('duplicatefinder', 'Oldest regatta leg/session first') }}</option>
						<option value="newest-foil-run-first">{{ t('duplicatefinder', 'Newest foil/DAQ run first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="yrn__field">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Scratch Grace (d)') }}</span>
					<input
						v-model="keepRecentRunDaysInput"
						type="number"
						min="0"
						step="1"
						class="yrn__input yrn__num-input">
				</label>

				<label class="yrn__field">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="yrn__input yrn__num-input">
				</label>

				<label class="yrn__field yrn__field-grow">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Filter NMEA, Foil, VDR, ORC/IRC or Scratch') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="yrn__input"
						:placeholder="t('duplicatefinder', 'e.g. nmea, n2k, foil, vdr, orc, grib2, expedition_cache, polar')">
				</label>

				<label class="yrn__field">
					<span class="yrn__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="yrn__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Replay & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="yrn__control-row">
				<span class="yrn__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="yrn__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Yacht Racing, Foiling and Maritime NMEA/VDR artifact family filter')">
					<button
						type="button"
						class="yrn__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="yrn__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="yrn__control-row">
				<span class="yrn__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="yrn__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Yacht Racing, Foiling and NMEA/VDR governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="yrn__seg-btn"
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
			class="yrn__empty-filter"
			role="note">
			<p class="yrn__empty-title">
				{{ t('duplicatefinder', 'No ORC/IRC class rules, IMO VDR packages, protest holds, NMEA/Foil masters, race replays, or nav scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="yrn__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="yrn__workspace">
			<div
				class="yrn__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Yacht Racing, Foiling and Maritime NMEA/VDR vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="yrn__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="yrn__cluster-top">
						<strong class="yrn__cluster-name">{{ cluster.name }}</strong>
						<span
							class="yrn__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="yrn__cluster-meta">
						<span
							v-if="cluster.maritimeToolchain"
							class="yrn__tag">{{ cluster.maritimeToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="yrn__tag">{{ cluster.workflowStage }}</span>
						<span class="yrn__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="yrn__cluster-badges">
						<span
							v-if="cluster.hasRedundantYachtExport"
							class="yrn__badge is-redundant">
							{{ cluster.hasYachtMasterAnchor
								? t('duplicatefinder', 'Redundant Export (Master Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No Master Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedProtestHold"
							class="yrn__badge is-keep">
							{{ t('duplicatefinder', 'Protest / Safety Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedClassOrVdr"
							class="yrn__badge is-keep">
							{{ t('duplicatefinder', 'ORC / IMO VDR Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedNmeaFoilMaster"
							class="yrn__badge is-consolidate">
							{{ t('duplicatefinder', 'NMEA / Foil Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasYachtNavScratch"
							class="yrn__badge is-warn">
							{{ t('duplicatefinder', 'Nav / Telemetry Scratch') }}
						</span>
					</div>
					<div class="yrn__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="yrn__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="yrn__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="yrn__inspector">
				<header class="yrn__inspector-head">
					<div class="yrn__inspector-title-wrap">
						<h4 class="yrn__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="yrn__inspector-sub">
							{{ selectedCluster.maritimeToolchain || selectedCluster.yachtStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="yrn__inspector-actions">
						<button
							type="button"
							class="yrn__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="yrn__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="yrn__lineage-grid">
					<div class="yrn__lineage-item">
						<span class="yrn__lineage-label">{{ t('duplicatefinder', 'Voyage Stem & Maritime Toolchain') }}</span>
						<strong class="yrn__lineage-val">{{ selectedCluster.maritimeToolchain ? `${selectedCluster.maritimeToolchain} / ` : '' }}{{ selectedCluster.yachtStem }} ({{ selectedCluster.yachtAnchorKey }})</strong>
					</div>
					<div class="yrn__lineage-item">
						<span class="yrn__lineage-label">{{ t('duplicatefinder', 'Class Rule, VDR & Telemetry Governance') }}</span>
						<strong class="yrn__lineage-val">
							{{ selectedCluster.hasProtectedProtestHold ? t('duplicatefinder', 'Jury Protest, Casualty, or VDR Safety Hold Shielded') : (selectedCluster.hasProtectedClassOrVdr ? t('duplicatefinder', 'ORC/IRC Hull Rule or IMO VDR Baseline Shielded') : (selectedCluster.hasProtectedNmeaFoilMaster ? t('duplicatefinder', 'Verified NMEA, Foil DAQ, VPP, or GRIB2 Master Shielded') : t('duplicatefinder', 'Nav-Suite Scratch or Derived Replay/GPX Export'))) }}
						</strong>
					</div>
					<div class="yrn__lineage-item">
						<span class="yrn__lineage-label">{{ t('duplicatefinder', 'NMEA / Foil / VPP Master Anchor') }}</span>
						<strong class="yrn__lineage-val">
							{{ selectedCluster.hasYachtMasterAnchor ? t('duplicatefinder', 'Verified NMEA, Foil DAQ, VPP, or VDR Anchor Found') : t('duplicatefinder', 'No Yacht Telemetry or VDR Master Anchor Detected') }}
						</strong>
					</div>
					<div class="yrn__lineage-item">
						<span class="yrn__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="yrn__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="yrn__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="yrn__member-card">
						<div class="yrn__member-top">
							<code class="yrn__member-path">{{ member.normalized }}</code>
							<div class="yrn__member-pills">
								<span
									v-if="member.isRedundantYachtExportMember"
									class="yrn__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (MASTER EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="yrn__pill is-warn">
									{{ t('duplicatefinder', 'NAV / SIM SCRATCH') }}
								</span>
								<span
									class="yrn__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.yachtTag"
									class="yrn__pill is-consolidate">
									{{ member.yachtTag }}
								</span>
								<span
									class="yrn__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="yrn__member-bottom">
							<div class="yrn__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="yrn__member-actions">
								<button
									type="button"
									class="yrn__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantYachtExportMember) && !(member.isProtectedProtestHold && protectProtestAndSafetyHolds) && !(member.isProtectedClassOrVdr && protectClassRulesAndVdrBaselines) && !(member.isProtectedNmeaFoilMaster && protectNmeaFoilHydroMasters)"
									class="yrn__override-field">
									<span class="yrn__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="yrn__override-select"
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

				<div class="yrn__code-panels">
					<div class="yrn__code-box">
						<div class="yrn__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="yrn__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="yrn__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="yrn__code-box">
						<div class="yrn__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="yrn__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="yrn__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	YACHT_RACING_FOILING_NMEA_PRESETS,
	auditYachtRacingFoilingNmeaVault,
	buildYachtRacingFoilingNmeaCsvReport,
	buildYachtRacingFoilingNmeaJsonManifest,
	buildYachtRacingFoilingNmeaRemediationScript,
	buildYachtRacingFoilingNmeaSyncExcludeList,
} from '../tools/yachtRacingFoilingNmeaVaultAuditor'

export default {
	name: 'YachtRacingFoilingNmeaVaultWorkbench',
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
			presetId: 'all-yacht-racing-nmea-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-yacht-scratch',
			survivorRule: 'yacht-vdr-nmea-master-first',
			protectClassRulesAndVdrBaselines: true,
			protectNmeaFoilHydroMasters: true,
			protectProtestAndSafetyHolds: true,
			requireYachtMasterAnchorForPrune: true,
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
			return YACHT_RACING_FOILING_NMEA_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'yacht-export-redundant', label: this.t('duplicatefinder', 'Replays / GPX / CSV') },
				{ id: 'yacht-nav-scratch', label: this.t('duplicatefinder', 'Nav / Sim Scratch') },
				{ id: 'yacht-class-vdr-protected', label: this.t('duplicatefinder', 'ORC / IMO VDR') },
				{ id: 'yacht-nmea-foil-master-protected', label: this.t('duplicatefinder', 'NMEA / Foil Masters') },
				{ id: 'yacht-protest-hold-protected', label: this.t('duplicatefinder', 'Protest Hold') },
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
			return auditYachtRacingFoilingNmeaVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectClassRulesAndVdrBaselines: this.protectClassRulesAndVdrBaselines,
				protectNmeaFoilHydroMasters: this.protectNmeaFoilHydroMasters,
				protectProtestAndSafetyHolds: this.protectProtestAndSafetyHolds,
				requireYachtMasterAnchorForPrune: this.requireYachtMasterAnchorForPrune,
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
			return buildYachtRacingFoilingNmeaRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildYachtRacingFoilingNmeaSyncExcludeList()
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
			const preset = YACHT_RACING_FOILING_NMEA_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectClassRulesAndVdrBaselines = preset.protectClassRulesAndVdrBaselines
			this.protectNmeaFoilHydroMasters = preset.protectNmeaFoilHydroMasters
			this.protectProtestAndSafetyHolds = preset.protectProtestAndSafetyHolds
			this.requireYachtMasterAnchorForPrune = preset.requireYachtMasterAnchorForPrune
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
				'yacht-class-vdr-protected': this.t('duplicatefinder', 'ORC / IMO VDR'),
				'yacht-nmea-foil-master-protected': this.t('duplicatefinder', 'NMEA / Foil Master'),
				'yacht-protest-hold-protected': this.t('duplicatefinder', 'Protest Hold'),
				'yacht-export-redundant': this.t('duplicatefinder', 'Redundant Export'),
				'yacht-nav-scratch': this.t('duplicatefinder', 'Nav / Sim Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'yacht-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'yacht-class-vdr-protected' || verdict === 'yacht-protest-hold-protected') {
				return 'is-keep'
			}
			if (verdict === 'yacht-nmea-foil-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'yacht-nav-scratch') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantYachtExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-yacht-scratch' && (member.isRedundantYachtExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Yacht Racing, Foiling or NMEA/VDR vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Yacht Racing, Foiling & NMEA/VDR remediation script to clipboard.'))
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
			const csv = buildYachtRacingFoilingNmeaCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-yacht-racing-foiling-nmea-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Yacht Racing, Foiling & NMEA/VDR Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildYachtRacingFoilingNmeaJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-yacht-racing-foiling-nmea-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Yacht Racing, Foiling & NMEA/VDR Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.yacht-racing-foiling-nmea-vault-workbench {
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

.yrn__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.yrn__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.yrn__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.yrn__status-badge {
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

.yrn__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.yrn__tool-btn,
.yrn__seg-btn,
.yrn__primary-btn,
.yrn__load-more-btn,
.yrn__mini-btn {
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

.yrn__tool-btn.is-primary-outline,
.yrn__primary-btn {
	border-color: var(--color-primary-element);
}

.yrn__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.yrn__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.yrn__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.yrn__tool-btn:focus-visible,
.yrn__seg-btn:focus-visible,
.yrn__primary-btn:focus-visible,
.yrn__load-more-btn:focus-visible,
.yrn__mini-btn:focus-visible,
.yrn__cluster-card:focus-visible,
.yrn__input:focus-visible,
.yrn__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.yrn__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	overflow-wrap: anywhere;
}

.yrn__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.yrn__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.yrn__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.yrn__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.yrn__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.yrn__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.yrn__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.yrn__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.yrn__empty-banner,
.yrn__empty-filter {
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

.yrn__empty-text {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.yrn__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.yrn__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.yrn__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.yrn__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.yrn__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.yrn__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.yrn__inputs-row {
	align-items: flex-end;
}

.yrn__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.yrn__field-grow {
	flex: 1 1 220px;
}

.yrn__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.yrn__input,
.yrn__override-select {
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

.yrn__num-input {
	inline-size: 96px;
}

.yrn__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.yrn__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.yrn__cluster-card {
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

.yrn__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.yrn__cluster-top,
.yrn__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.yrn__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.yrn__cluster-meta,
.yrn__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
	min-inline-size: 0;
}

.yrn__tag {
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

.yrn__badge,
.yrn__pill {
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

.yrn__pill.is-keep,
.yrn__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.yrn__pill.is-redundant,
.yrn__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.yrn__pill.is-consolidate,
.yrn__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.yrn__pill.is-warn,
.yrn__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.yrn__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.yrn__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.yrn__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.yrn__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.yrn__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 200px;
}

.yrn__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.yrn__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.yrn__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.yrn__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	min-inline-size: 0;
}

.yrn__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.yrn__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.yrn__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.yrn__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.yrn__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.yrn__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.yrn__member-top,
.yrn__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.yrn__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.yrn__member-pills,
.yrn__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.yrn__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.yrn__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.yrn__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.yrn__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
	min-inline-size: 0;
}

.yrn__pre {
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

.yrn__sr-only {
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
	.yrn__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.yrn__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.yrn__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.yrn__kpis,
	.yrn__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.yrn__num-input {
		inline-size: 100%;
	}

	.yrn__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.yrn__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.yrn__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.yrn__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.yacht-racing-foiling-nmea-vault-workbench {
		padding: 10px;
	}

	.yrn__kpis,
	.yrn__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.yrn__num-input {
		inline-size: 100%;
	}

	.yrn__field {
		flex: 1 1 100%;
	}
}
</style>
