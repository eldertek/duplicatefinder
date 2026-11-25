<template>
	<section
		class="astronomy-fits-interferometry-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Astronomy, FITS Astrophotography and Radio Interferometry Vault Auditor')">
		<header class="afv__toolbar">
			<div class="afv__title-group">
				<h3 class="afv__title">
					{{ t('duplicatefinder', 'Astronomy, FITS Astrophotography & Radio Interferometry Vault Auditor') }}
				</h3>
				<span
					class="afv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {std} cal-wcs, {masters} fits-ms, {embargo} observatory-hold, {stretch} stretch-export, {scratch} wbpp-casa-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						std: analysis.summary.totalAstroStdClusters,
						masters: analysis.summary.totalRawAstroMasterClusters,
						embargo: analysis.summary.totalObservatoryEmbargoClusters,
						stretch: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalAstroScratchClusters,
					}) }}
				</span>
			</div>

			<div class="afv__toolbar-actions">
				<button
					type="button"
					class="afv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="afv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="afv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="afv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="afv__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+I"
					:title="t('duplicatefinder', 'Hide Astronomy, FITS Astrophotography and Radio Interferometry Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Astro & FITS Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="afv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="afv__kpis">
			<div class="afv__kpi">
				<span class="afv__kpi-label">{{ t('duplicatefinder', 'Safe Stretch & Scratch Reclaim') }}</span>
				<strong class="afv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="afv__kpi">
				<span class="afv__kpi-label">{{ t('duplicatefinder', 'Conserved Calibrations, Raw FITS/MS & Observatory') }}</span>
				<strong class="afv__kpi-val is-warn">
					{{ analysis.summary.totalAstroStdClusters }} {{ t('duplicatefinder', 'cal/wcs') }} / {{ analysis.summary.totalRawAstroMasterClusters }} {{ t('duplicatefinder', 'fits/ms') }} / {{ analysis.summary.totalObservatoryEmbargoClusters }} {{ t('duplicatefinder', 'observatory') }}
				</strong>
			</div>
			<div class="afv__kpi">
				<span class="afv__kpi-label">{{ t('duplicatefinder', 'Redundant Stretches & WBPP/CASA Scratch') }}</span>
				<strong class="afv__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'stretch-export') }} / {{ analysis.summary.totalAstroScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="afv__kpi">
				<span class="afv__kpi-label">{{ t('duplicatefinder', 'Raw Astronomy & Interferometry Duplicate Footprint') }}</span>
				<strong class="afv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="afv__empty-banner"
			role="note">
			<div class="afv__empty-text">
				<p class="afv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Master Calibration, FITS/MS, and Observatory Embargo shields before scanning') }}
				</p>
				<p class="afv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit MasterDark/Flat/Bias frames, WCS/ASDF/IVOA tables, ESO/ALMA/JWST/NRAO holds, FITS/XISF/SER subframes, CASA MS/UVFITS visibilities, stretched quicklooks, and WBPP/Siril/CASA scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="afv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="afv__controls">
			<div class="afv__control-row">
				<span class="afv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="afv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Astronomy and FITS vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="afv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="afv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="afv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="afv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="afv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="afv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="afv__seg-btn"
					:class="{ 'is-active': protectCalibrationAndWcsStandards }"
					:aria-pressed="protectCalibrationAndWcsStandards ? 'true' : 'false'"
					@click="protectCalibrationAndWcsStandards = !protectCalibrationAndWcsStandards">
					<span>{{ protectCalibrationAndWcsStandards ? t('duplicatefinder', 'Shield MasterCal / WCS: ON') : t('duplicatefinder', 'Shield MasterCal / WCS: OFF') }}</span>
				</button>

				<button
					type="button"
					class="afv__seg-btn"
					:class="{ 'is-active': protectRawSubframeAndInterferometryMasters }"
					:aria-pressed="protectRawSubframeAndInterferometryMasters ? 'true' : 'false'"
					@click="protectRawSubframeAndInterferometryMasters = !protectRawSubframeAndInterferometryMasters">
					<span>{{ protectRawSubframeAndInterferometryMasters ? t('duplicatefinder', 'Shield FITS / XISF / MS: ON') : t('duplicatefinder', 'Shield FITS / XISF / MS: OFF') }}</span>
				</button>

				<button
					type="button"
					class="afv__seg-btn"
					:class="{ 'is-active': protectObservatoryEmbargoEvidence }"
					:aria-pressed="protectObservatoryEmbargoEvidence ? 'true' : 'false'"
					@click="protectObservatoryEmbargoEvidence = !protectObservatoryEmbargoEvidence">
					<span>{{ protectObservatoryEmbargoEvidence ? t('duplicatefinder', 'Shield Observatory Hold: ON') : t('duplicatefinder', 'Shield Observatory Hold: OFF') }}</span>
				</button>

				<button
					type="button"
					class="afv__seg-btn"
					:class="{ 'is-active': requireAstroAnchorForPrune }"
					:aria-pressed="requireAstroAnchorForPrune ? 'true' : 'false'"
					@click="requireAstroAnchorForPrune = !requireAstroAnchorForPrune">
					<span>{{ requireAstroAnchorForPrune ? t('duplicatefinder', 'Require FITS/MS Anchor: ON') : t('duplicatefinder', 'Require FITS/MS Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="afv__control-row afv__inputs-row">
				<label class="afv__field">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="afv__input">
						<option value="prune-exports-and-astro-scratch">{{ t('duplicatefinder', 'Prune Redundant Stretches & Scratch') }}</option>
						<option value="hardlink-immutable-fits-and-ms">{{ t('duplicatefinder', 'Hardlink Immutable FITS/XISF (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-astro-scratch">{{ t('duplicatefinder', 'Quarantine Astro Exports & WBPP Scratch') }}</option>
					</select>
				</label>

				<label class="afv__field">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="afv__input">
						<option value="fits-calibration-master-first">{{ t('duplicatefinder', 'Master Cal, FITS & Visibility first') }}</option>
						<option value="oldest-observation-first">{{ t('duplicatefinder', 'Oldest observation night first') }}</option>
						<option value="newest-reduction-first">{{ t('duplicatefinder', 'Newest reduction stack first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="afv__field">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Run Grace (d)') }}</span>
					<input
						v-model="keepRecentSessionDaysInput"
						type="number"
						min="0"
						step="1"
						class="afv__input afv__num-input">
				</label>

				<label class="afv__field">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="afv__input afv__num-input">
				</label>

				<label class="afv__field afv__field-grow">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Filter Target, FITS/XISF, Radio MS or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="afv__input"
						:placeholder="t('duplicatefinder', 'e.g. fits, xisf, ser, uvfits, oifits, alma, wbpp, siril, casa')">
				</label>

				<label class="afv__field">
					<span class="afv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="afv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Stretch export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="afv__control-row">
				<span class="afv__control-label">{{ t('duplicatefinder', 'Astro Family') }}</span>
				<div
					class="afv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Astronomy and FITS artifact family filter')">
					<button
						type="button"
						class="afv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="afv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="afv__control-row">
				<span class="afv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="afv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Astronomy and FITS governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="afv__seg-btn"
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
			class="afv__empty-filter"
			role="note">
			<p class="afv__empty-title">
				{{ t('duplicatefinder', 'No Master Calibrations, FITS/XISF subframes, radio visibilities, stretched renders, or WBPP/CASA scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="afv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="afv__workspace">
			<div
				class="afv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Astronomy, FITS Astrophotography and Radio Interferometry vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="afv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="afv__cluster-top">
						<strong class="afv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="afv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="afv__cluster-meta">
						<span
							v-if="cluster.astroToolchain"
							class="afv__tag">{{ cluster.astroToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="afv__tag">{{ cluster.workflowStage }}</span>
						<span class="afv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="afv__cluster-badges">
						<span
							v-if="cluster.hasRedundantAstroExport"
							class="afv__badge is-redundant">
							{{ cluster.hasAstroMasterAnchor
								? t('duplicatefinder', 'Redundant Export (FITS/MS Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No FITS/MS Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedObservatoryEmbargo"
							class="afv__badge is-keep">
							{{ t('duplicatefinder', 'Observatory Embargo Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedAstroStandard"
							class="afv__badge is-keep">
							{{ t('duplicatefinder', 'Master Cal / WCS Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedRawAstroMaster"
							class="afv__badge is-consolidate">
							{{ t('duplicatefinder', 'FITS / XISF / MS Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasAstroScratchIntermediate"
							class="afv__badge is-warn">
							{{ t('duplicatefinder', 'WBPP / Siril / CASA Scratch') }}
						</span>
					</div>
					<div class="afv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="afv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="afv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="afv__inspector">
				<header class="afv__inspector-head">
					<div class="afv__inspector-title-wrap">
						<h4 class="afv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="afv__inspector-sub">
							{{ selectedCluster.astroToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="afv__inspector-actions">
						<button
							type="button"
							class="afv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="afv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="afv__lineage-grid">
					<div class="afv__lineage-item">
						<span class="afv__lineage-label">{{ t('duplicatefinder', 'Observation Target & Toolchain') }}</span>
						<strong class="afv__lineage-val">{{ selectedCluster.astroToolchain ? `${selectedCluster.astroToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.astroAnchorKey }})</strong>
					</div>
					<div class="afv__lineage-item">
						<span class="afv__lineage-label">{{ t('duplicatefinder', 'Calibration & Observatory Governance') }}</span>
						<strong class="afv__lineage-val">
							{{ selectedCluster.hasProtectedObservatoryEmbargo ? t('duplicatefinder', 'ESO / ALMA / JWST / NRAO Observatory Hold Shielded') : (selectedCluster.hasProtectedAstroStandard ? t('duplicatefinder', 'MasterDark/Flat/Bias, WCS & IVOA Standard Shielded') : (selectedCluster.hasProtectedRawAstroMaster ? t('duplicatefinder', 'Raw FITS/XISF/SER & Radio Visibility Master Shielded') : t('duplicatefinder', 'WBPP/Siril/CASA Scratch or Stretched Export Artifact'))) }}
						</strong>
					</div>
					<div class="afv__lineage-item">
						<span class="afv__lineage-label">{{ t('duplicatefinder', 'FITS / XISF / SER / MS Anchor') }}</span>
						<strong class="afv__lineage-val">
							{{ selectedCluster.hasAstroMasterAnchor ? t('duplicatefinder', 'Verified FITS, XISF, SER, MS or UVFITS Anchor Found') : t('duplicatefinder', 'No FITS, XISF, SER, MS or UVFITS Anchor Detected') }}
						</strong>
					</div>
					<div class="afv__lineage-item">
						<span class="afv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="afv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="afv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="afv__member-card">
						<div class="afv__member-top">
							<code class="afv__member-path">{{ member.normalized }}</code>
							<div class="afv__member-pills">
								<span
									v-if="member.isRedundantAstroExportMember"
									class="afv__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (FITS/MS EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="afv__pill is-warn">
									{{ t('duplicatefinder', 'ASTRO SCRATCH') }}
								</span>
								<span
									class="afv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.astroTag"
									class="afv__pill is-consolidate">
									{{ member.astroTag }}
								</span>
								<span
									class="afv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="afv__member-bottom">
							<div class="afv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="afv__member-actions">
								<button
									type="button"
									class="afv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantAstroExportMember) && !(member.isProtectedObservatoryEmbargo && protectObservatoryEmbargoEvidence) && !(member.isProtectedAstroStandard && protectCalibrationAndWcsStandards) && !(member.isProtectedRawAstroMaster && protectRawSubframeAndInterferometryMasters)"
									class="afv__override-field">
									<span class="afv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="afv__override-select"
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

				<div class="afv__code-panels">
					<div class="afv__code-box">
						<div class="afv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="afv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="afv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="afv__code-box">
						<div class="afv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="afv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="afv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	ASTRONOMY_FITS_PRESETS,
	auditAstronomyFitsInterferometryVault,
	buildAstronomyFitsCsvReport,
	buildAstronomyFitsJsonManifest,
	buildAstronomyFitsRemediationScript,
	buildAstronomyFitsSyncExcludeList,
} from '../tools/astronomyFitsInterferometryVaultAuditor'

export default {
	name: 'AstronomyFitsInterferometryVaultWorkbench',
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
			presetId: 'all-astronomy-fits-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-astro-scratch',
			survivorRule: 'fits-calibration-master-first',
			protectCalibrationAndWcsStandards: true,
			protectRawSubframeAndInterferometryMasters: true,
			protectObservatoryEmbargoEvidence: true,
			requireAstroAnchorForPrune: true,
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
			return ASTRONOMY_FITS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'astro-export-redundant', label: this.t('duplicatefinder', 'Stretched / Catalog') },
				{ id: 'astro-scratch-intermediate', label: this.t('duplicatefinder', 'WBPP / CASA Scratch') },
				{ id: 'astro-std-protected', label: this.t('duplicatefinder', 'Master Cal & WCS') },
				{ id: 'raw-subframe-interferometry-protected', label: this.t('duplicatefinder', 'FITS / XISF / MS') },
				{ id: 'observatory-embargo-protected', label: this.t('duplicatefinder', 'Observatory Hold') },
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
			return auditAstronomyFitsInterferometryVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCalibrationAndWcsStandards: this.protectCalibrationAndWcsStandards,
				protectRawSubframeAndInterferometryMasters: this.protectRawSubframeAndInterferometryMasters,
				protectObservatoryEmbargoEvidence: this.protectObservatoryEmbargoEvidence,
				requireAstroAnchorForPrune: this.requireAstroAnchorForPrune,
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
			return buildAstronomyFitsRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildAstronomyFitsSyncExcludeList()
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
			const preset = ASTRONOMY_FITS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCalibrationAndWcsStandards = preset.protectCalibrationAndWcsStandards
			this.protectRawSubframeAndInterferometryMasters = preset.protectRawSubframeAndInterferometryMasters
			this.protectObservatoryEmbargoEvidence = preset.protectObservatoryEmbargoEvidence
			this.requireAstroAnchorForPrune = preset.requireAstroAnchorForPrune
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
				'astro-std-protected': this.t('duplicatefinder', 'Master Cal & WCS'),
				'raw-subframe-interferometry-protected': this.t('duplicatefinder', 'FITS / XISF / MS'),
				'observatory-embargo-protected': this.t('duplicatefinder', 'Observatory Hold'),
				'astro-export-redundant': this.t('duplicatefinder', 'Redundant Stretch'),
				'astro-scratch-intermediate': this.t('duplicatefinder', 'WBPP / CASA Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'astro-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'astro-std-protected' || verdict === 'observatory-embargo-protected') {
				return 'is-keep'
			}
			if (verdict === 'raw-subframe-interferometry-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'astro-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantAstroExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-astro-scratch' && (member.isRedundantAstroExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Astronomy or FITS vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Astronomy & FITS remediation script to clipboard.'))
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
			const csv = buildAstronomyFitsCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-astronomy-fits-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Astronomy & FITS Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildAstronomyFitsJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-astronomy-fits-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Astronomy & FITS Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.astronomy-fits-interferometry-vault-workbench {
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

.afv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.afv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.afv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.afv__status-badge {
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

.afv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.afv__tool-btn,
.afv__seg-btn,
.afv__primary-btn,
.afv__load-more-btn,
.afv__mini-btn {
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

.afv__tool-btn.is-primary-outline,
.afv__primary-btn {
	border-color: var(--color-primary-element);
}

.afv__primary-btn {
	background-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.afv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.afv__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.afv__tool-btn:focus-visible,
.afv__seg-btn:focus-visible,
.afv__primary-btn:focus-visible,
.afv__load-more-btn:focus-visible,
.afv__mini-btn:focus-visible,
.afv__cluster-card:focus-visible,
.afv__input:focus-visible,
.afv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.afv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.afv__notice.is-error {
	border-color: var(--color-error, #b91c1c);
}

.afv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.afv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.afv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.afv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.afv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.afv__kpi-val.is-warn {
	color: var(--color-warning, #b45309);
}

.afv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.afv__empty-banner,
.afv__empty-filter {
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

.afv__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.afv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.afv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.afv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.afv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.afv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 92px;
}

.afv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.afv__inputs-row {
	align-items: flex-end;
}

.afv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.afv__field-grow {
	flex: 1 1 220px;
}

.afv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.afv__input,
.afv__override-select {
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

.afv__num-input {
	inline-size: 96px;
}

.afv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.afv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.afv__cluster-card {
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

.afv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.afv__cluster-top,
.afv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.afv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.afv__cluster-meta,
.afv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.afv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.afv__badge,
.afv__pill {
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

.afv__pill.is-keep,
.afv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.afv__pill.is-redundant,
.afv__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.afv__pill.is-consolidate,
.afv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.afv__pill.is-warn,
.afv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.afv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.afv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.afv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.afv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.afv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.afv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.afv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.afv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.afv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.afv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.afv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.afv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.afv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.afv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.afv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.afv__member-top,
.afv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.afv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.afv__member-pills,
.afv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.afv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.afv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.afv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.afv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.afv__pre {
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

.afv__sr-only {
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
	.afv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.afv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.afv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@container (max-width: 560px) {
	.afv__kpis,
	.afv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.afv__num-input {
		inline-size: 100%;
	}

	.afv__field {
		flex: 1 1 100%;
	}
}

@media (max-width: 1120px) {
	.afv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.afv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.afv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.astronomy-fits-interferometry-vault-workbench {
		padding: 10px;
	}

	.afv__kpis,
	.afv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.afv__num-input {
		inline-size: 100%;
	}

	.afv__field {
		flex: 1 1 100%;
	}
}
</style>
