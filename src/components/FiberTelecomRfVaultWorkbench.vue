<template>
	<section
		class="fiber-telecom-rf-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter and 5G Baseband IQ Vault Auditor')">
		<header class="ftrf__toolbar">
			<div class="ftrf__title-group">
				<h3 class="ftrf__title">
					{{ t('duplicatefinder', 'Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter & 5G Baseband IQ Vault Auditor') }}
				</h3>
				<span
					class="ftrf__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {cal} cal-iso17025, {masters} otdr-s2p-iq, {reg} fcc-etsi, {csv} csv-mat, {scratch} rf-scratch', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						cal: analysis.summary.totalCalibrationClusters,
						masters: analysis.summary.totalFiberRfMasterClusters,
						reg: analysis.summary.totalRegulatoryRfClusters,
						csv: analysis.summary.totalRedundantExportClusters,
						scratch: analysis.summary.totalRfScratchClusters,
					}) }}
				</span>
			</div>

			<div class="ftrf__toolbar-actions">
				<button
					type="button"
					class="ftrf__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ftrf__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ftrf__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ftrf__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="ftrf__tool-btn is-close"
					aria-keyshortcuts="Alt+Shift+F"
					:title="t('duplicatefinder', 'Hide Fiber-Optic, Telecom RF Spectrum, VNA S-Parameter and 5G Baseband IQ Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Fiber & RF Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ftrf__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ftrf__kpis">
			<div class="ftrf__kpi">
				<span class="ftrf__kpi-label">{{ t('duplicatefinder', 'Safe Export & Scratch Reclaim') }}</span>
				<strong class="ftrf__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ftrf__kpi">
				<span class="ftrf__kpi-label">{{ t('duplicatefinder', 'Conserved Cal, OTDR/IQ & FCC/ETSI') }}</span>
				<strong class="ftrf__kpi-val is-warn">
					{{ analysis.summary.totalCalibrationClusters }} {{ t('duplicatefinder', 'cal/iso') }} / {{ analysis.summary.totalFiberRfMasterClusters }} {{ t('duplicatefinder', 'sor/s2p/iq') }} / {{ analysis.summary.totalRegulatoryRfClusters }} {{ t('duplicatefinder', 'fcc/etsi') }}
				</strong>
			</div>
			<div class="ftrf__kpi">
				<span class="ftrf__kpi-label">{{ t('duplicatefinder', 'Redundant CSV/MAT & Lab Scratch') }}</span>
				<strong class="ftrf__kpi-val is-danger">
					{{ analysis.summary.totalRedundantExportClusters }} {{ t('duplicatefinder', 'csv-export') }} / {{ analysis.summary.totalRfScratchClusters }} {{ t('duplicatefinder', 'scratch') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ftrf__kpi">
				<span class="ftrf__kpi-label">{{ t('duplicatefinder', 'Raw Fiber & RF Duplicate Footprint') }}</span>
				<strong class="ftrf__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ftrf__empty-banner"
			role="note">
			<div class="ftrf__empty-text">
				<p class="ftrf__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure VNA calibration, OTDR, and Touchstone/IQ shields before scanning') }}
				</p>
				<p class="ftrf__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit VNA cal kits (.cal, .ckit, .csa), Telcordia OTDR traces (.sor, .trc), Touchstone S-parameters (.s1p-.s8p), SigMF/5G baseband IQ captures, CSV/MAT exports, and solver scratch.') }}
				</p>
			</div>
			<button
				type="button"
				class="ftrf__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ftrf__controls">
			<div class="ftrf__control-row">
				<span class="ftrf__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="ftrf__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Fiber and RF vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ftrf__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ftrf__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ftrf__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ftrf__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ftrf__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ftrf__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ftrf__seg-btn"
					:class="{ 'is-active': protectCalibrationAndCompliance }"
					:aria-pressed="protectCalibrationAndCompliance ? 'true' : 'false'"
					@click="protectCalibrationAndCompliance = !protectCalibrationAndCompliance">
					<span>{{ protectCalibrationAndCompliance ? t('duplicatefinder', 'Shield Cal Kits / ISO-17025: ON') : t('duplicatefinder', 'Shield Cal Kits / ISO-17025: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftrf__seg-btn"
					:class="{ 'is-active': protectFiberRfMasterAnchors }"
					:aria-pressed="protectFiberRfMasterAnchors ? 'true' : 'false'"
					@click="protectFiberRfMasterAnchors = !protectFiberRfMasterAnchors">
					<span>{{ protectFiberRfMasterAnchors ? t('duplicatefinder', 'Shield .sor / .s2p / IQ: ON') : t('duplicatefinder', 'Shield .sor / .s2p / IQ: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftrf__seg-btn"
					:class="{ 'is-active': protectRegulatoryRfEvidence }"
					:aria-pressed="protectRegulatoryRfEvidence ? 'true' : 'false'"
					@click="protectRegulatoryRfEvidence = !protectRegulatoryRfEvidence">
					<span>{{ protectRegulatoryRfEvidence ? t('duplicatefinder', 'Shield FCC / ETSI / 3GPP: ON') : t('duplicatefinder', 'Shield FCC / ETSI / 3GPP: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ftrf__seg-btn"
					:class="{ 'is-active': requireFiberRfAnchorForPrune }"
					:aria-pressed="requireFiberRfAnchorForPrune ? 'true' : 'false'"
					@click="requireFiberRfAnchorForPrune = !requireFiberRfAnchorForPrune">
					<span>{{ requireFiberRfAnchorForPrune ? t('duplicatefinder', 'Require .sor/.s2p/IQ Anchor: ON') : t('duplicatefinder', 'Require .sor/.s2p/IQ Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="ftrf__control-row ftrf__inputs-row">
				<label class="ftrf__field">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ftrf__input">
						<option value="prune-exports-and-rf-scratch">{{ t('duplicatefinder', 'Prune Redundant .csv/.mat/.txt & Scratch') }}</option>
						<option value="hardlink-immutable-iq-and-sor">{{ t('duplicatefinder', 'Hardlink Immutable .sor/.s2p/IQ (Block Mutable)') }}</option>
						<option value="quarantine-exports-and-rf-scratch">{{ t('duplicatefinder', 'Quarantine RF Exports & Lab Scratch') }}</option>
					</select>
				</label>

				<label class="ftrf__field">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ftrf__input">
						<option value="cal-sor-iq-first">{{ t('duplicatefinder', 'Cal Kit, OTDR & Touchstone/IQ first') }}</option>
						<option value="oldest-capture-first">{{ t('duplicatefinder', 'Oldest lab capture first') }}</option>
						<option value="newest-sweep-revision-first">{{ t('duplicatefinder', 'Newest sweep revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="ftrf__field">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Capture Grace (d)') }}</span>
					<input
						v-model="keepRecentCaptureDaysInput"
						type="number"
						min="0"
						step="1"
						class="ftrf__input ftrf__num-input">
				</label>

				<label class="ftrf__field">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ftrf__input ftrf__num-input">
				</label>

				<label class="ftrf__field ftrf__field-grow">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Filter Span, Carrier, Format or Scratch Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ftrf__input"
						:placeholder="t('duplicatefinder', 'e.g. sor, s2p, sigmf, iq, hfss, keysight, iso17025, fcc')">
				</label>

				<label class="ftrf__field">
					<span class="ftrf__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ftrf__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'CSV export & scratch priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="ftrf__control-row">
				<span class="ftrf__control-label">{{ t('duplicatefinder', 'RF & Fiber Family') }}</span>
				<div
					class="ftrf__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Fiber and RF artifact family filter')">
					<button
						type="button"
						class="ftrf__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="ftrf__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="ftrf__control-row">
				<span class="ftrf__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="ftrf__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Fiber and RF governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="ftrf__seg-btn"
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
			class="ftrf__empty-filter"
			role="note">
			<p class="ftrf__empty-title">
				{{ t('duplicatefinder', 'No VNA calibration kits, OTDR traces, Touchstone S-parameters, IQ captures, CSV exports, or RF scratch match the active filters.') }}
			</p>
			<button
				type="button"
				class="ftrf__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ftrf__workspace">
			<div
				class="ftrf__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Fiber-Optic, Telecom RF, Touchstone and Baseband IQ vault clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="ftrf__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="ftrf__cluster-top">
						<strong class="ftrf__cluster-name">{{ cluster.name }}</strong>
						<span
							class="ftrf__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="ftrf__cluster-meta">
						<span
							v-if="cluster.rfToolchain"
							class="ftrf__tag">{{ cluster.rfToolchain }}</span>
						<span
							v-if="cluster.workflowStage"
							class="ftrf__tag">{{ cluster.workflowStage }}</span>
						<span class="ftrf__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="ftrf__cluster-badges">
						<span
							v-if="cluster.hasRedundantRfExport"
							class="ftrf__badge is-redundant">
							{{ cluster.hasFiberRfMasterAnchor
								? t('duplicatefinder', 'Redundant Export (.sor/.s2p/IQ Anchor Exists)')
								: t('duplicatefinder', 'Unanchored Export (No .sor/.s2p/IQ Anchor)') }}
						</span>
						<span
							v-if="cluster.hasProtectedRegulatoryRf"
							class="ftrf__badge is-keep">
							{{ t('duplicatefinder', 'FCC / ETSI / 3GPP Hold Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedCalStd"
							class="ftrf__badge is-keep">
							{{ t('duplicatefinder', 'VNA Cal Kit / ISO-17025 Conserved') }}
						</span>
						<span
							v-if="cluster.hasProtectedFiberRfMaster"
							class="ftrf__badge is-consolidate">
							{{ t('duplicatefinder', 'OTDR / Touchstone / IQ Master Conserved') }}
						</span>
						<span
							v-if="cluster.hasRfScratchIntermediate"
							class="ftrf__badge is-warn">
							{{ t('duplicatefinder', 'VNA / SDR / EM Solver Scratch') }}
						</span>
					</div>
					<div class="ftrf__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="ftrf__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="ftrf__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="ftrf__inspector">
				<header class="ftrf__inspector-head">
					<div class="ftrf__inspector-title-wrap">
						<h4 class="ftrf__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="ftrf__inspector-sub">
							{{ selectedCluster.rfToolchain || selectedCluster.runStem }} | {{ selectedCluster.workflowStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="ftrf__inspector-actions">
						<button
							type="button"
							class="ftrf__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="ftrf__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="ftrf__lineage-grid">
					<div class="ftrf__lineage-item">
						<span class="ftrf__lineage-label">{{ t('duplicatefinder', 'RF / Fiber Lineage & Toolchain') }}</span>
						<strong class="ftrf__lineage-val">{{ selectedCluster.rfToolchain ? `${selectedCluster.rfToolchain} / ` : '' }}{{ selectedCluster.runStem }} ({{ selectedCluster.rfAnchorKey }})</strong>
					</div>
					<div class="ftrf__lineage-item">
						<span class="ftrf__lineage-label">{{ t('duplicatefinder', 'Cal Kit, ISO-17025 & FCC/ETSI Governance') }}</span>
						<strong class="ftrf__lineage-val">
							{{ selectedCluster.hasProtectedRegulatoryRf ? t('duplicatefinder', 'FCC / ETSI / 3GPP / SAR Type-Approval Hold Shielded') : (selectedCluster.hasProtectedCalStd ? t('duplicatefinder', 'VNA Calibration Kit & ISO-17025 Baseline Shielded') : (selectedCluster.hasProtectedFiberRfMaster ? t('duplicatefinder', 'OTDR (.sor), Touchstone (.s2p) & IQ Master Shielded') : t('duplicatefinder', 'RF Solver Scratch or CSV/MAT Export Artifact'))) }}
						</strong>
					</div>
					<div class="ftrf__lineage-item">
						<span class="ftrf__lineage-label">{{ t('duplicatefinder', 'OTDR / Touchstone / SigMF / IQ Anchor') }}</span>
						<strong class="ftrf__lineage-val">
							{{ selectedCluster.hasFiberRfMasterAnchor ? t('duplicatefinder', 'Verified OTDR, Touchstone, SigMF or IQ Anchor Found') : t('duplicatefinder', 'No OTDR, Touchstone, SigMF or IQ Anchor Detected') }}
						</strong>
					</div>
					<div class="ftrf__lineage-item">
						<span class="ftrf__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="ftrf__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="ftrf__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="ftrf__member-card">
						<div class="ftrf__member-top">
							<code class="ftrf__member-path">{{ member.normalized }}</code>
							<div class="ftrf__member-pills">
								<span
									v-if="member.isRedundantRfExportMember"
									class="ftrf__pill is-redundant">
									{{ t('duplicatefinder', 'REDUNDANT EXPORT (.sor/.s2p/IQ EXISTS)') }}
								</span>
								<span
									v-if="member.isScratchPath"
									class="ftrf__pill is-warn">
									{{ t('duplicatefinder', 'RF SCRATCH') }}
								</span>
								<span
									class="ftrf__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.rfTag"
									class="ftrf__pill is-consolidate">
									{{ member.rfTag }}
								</span>
								<span
									class="ftrf__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="ftrf__member-bottom">
							<div class="ftrf__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.redundancyReason">{{ member.redundancyReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="ftrf__member-actions">
								<button
									type="button"
									class="ftrf__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="(!member.isSurvivor || member.isRedundantRfExportMember) && !(member.isProtectedRegulatoryRf && protectRegulatoryRfEvidence) && !(member.isProtectedCalStd && protectCalibrationAndCompliance) && !(member.isProtectedFiberRfMaster && protectFiberRfMasterAnchors)"
									class="ftrf__override-field">
									<span class="ftrf__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="ftrf__override-select"
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

				<div class="ftrf__code-panels">
					<div class="ftrf__code-box">
						<div class="ftrf__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="ftrf__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ftrf__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="ftrf__code-box">
						<div class="ftrf__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="ftrf__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="ftrf__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	FIBER_TELECOM_RF_PRESETS,
	auditFiberTelecomRfVault,
	buildFiberTelecomRfCsvReport,
	buildFiberTelecomRfJsonManifest,
	buildFiberTelecomRfRemediationScript,
	buildFiberTelecomRfSyncExcludeList,
} from '../tools/fiberTelecomRfVaultAuditor'

export default {
	name: 'FiberTelecomRfVaultWorkbench',
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
			presetId: 'all-fiber-telecom-rf-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-exports-and-rf-scratch',
			survivorRule: 'cal-sor-iq-first',
			protectCalibrationAndCompliance: true,
			protectFiberRfMasterAnchors: true,
			protectRegulatoryRfEvidence: true,
			requireFiberRfAnchorForPrune: true,
			keepRecentCaptureDaysInput: '0',
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
			return FIBER_TELECOM_RF_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'rf-export-redundant', label: this.t('duplicatefinder', 'CSV / MAT / PRN') },
				{ id: 'rf-scratch-intermediate', label: this.t('duplicatefinder', 'RF Scratch') },
				{ id: 'calibration-std-protected', label: this.t('duplicatefinder', 'Cal Kits & ISO-17025') },
				{ id: 'fiber-rf-master-protected', label: this.t('duplicatefinder', 'OTDR / S2P / IQ') },
				{ id: 'regulatory-rf-protected', label: this.t('duplicatefinder', 'FCC / ETSI / 3GPP') },
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
		parsedKeepRecentCaptureDays() {
			const trimmed = String(this.keepRecentCaptureDaysInput ?? '').trim()
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
			return auditFiberTelecomRfVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCalibrationAndCompliance: this.protectCalibrationAndCompliance,
				protectFiberRfMasterAnchors: this.protectFiberRfMasterAnchors,
				protectRegulatoryRfEvidence: this.protectRegulatoryRfEvidence,
				requireFiberRfAnchorForPrune: this.requireFiberRfAnchorForPrune,
				keepRecentCaptureDays: this.parsedKeepRecentCaptureDays,
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
			return buildFiberTelecomRfRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildFiberTelecomRfSyncExcludeList()
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
			const preset = FIBER_TELECOM_RF_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCalibrationAndCompliance = preset.protectCalibrationAndCompliance
			this.protectFiberRfMasterAnchors = preset.protectFiberRfMasterAnchors
			this.protectRegulatoryRfEvidence = preset.protectRegulatoryRfEvidence
			this.requireFiberRfAnchorForPrune = preset.requireFiberRfAnchorForPrune
			this.keepRecentCaptureDaysInput = String(preset.keepRecentCaptureDays)
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
				'calibration-std-protected': this.t('duplicatefinder', 'Cal Kits & ISO-17025'),
				'fiber-rf-master-protected': this.t('duplicatefinder', 'OTDR / S2P / IQ'),
				'regulatory-rf-protected': this.t('duplicatefinder', 'FCC / ETSI / 3GPP'),
				'rf-export-redundant': this.t('duplicatefinder', 'Redundant CSV/MAT'),
				'rf-scratch-intermediate': this.t('duplicatefinder', 'RF Scratch'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'rf-export-redundant') {
				return 'is-redundant'
			}
			if (verdict === 'calibration-std-protected' || verdict === 'regulatory-rf-protected') {
				return 'is-keep'
			}
			if (verdict === 'fiber-rf-master-protected') {
				return 'is-consolidate'
			}
			if (verdict === 'rf-scratch-intermediate') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.isRedundantRfExportMember ? 'is-redundant' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-exports-and-rf-scratch' && (member.isRedundantRfExport || member.isScratchPath))
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
				this.setNotice(this.t('duplicatefinder', 'Copied Fiber or RF vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Fiber & RF remediation script to clipboard.'))
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
			const csv = buildFiberTelecomRfCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-fiber-telecom-rf-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Fiber & RF Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildFiberTelecomRfJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-fiber-telecom-rf-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Fiber & RF Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.fiber-telecom-rf-vault-workbench {
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

.ftrf__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ftrf__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ftrf__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ftrf__status-badge {
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

.ftrf__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ftrf__tool-btn,
.ftrf__seg-btn,
.ftrf__primary-btn,
.ftrf__load-more-btn,
.ftrf__mini-btn {
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

.ftrf__tool-btn:hover:not(:disabled),
.ftrf__seg-btn:hover:not(:disabled),
.ftrf__load-more-btn:hover:not(:disabled),
.ftrf__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.ftrf__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ftrf__tool-btn.is-primary-outline,
.ftrf__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ftrf__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ftrf__tool-btn:focus-visible,
.ftrf__seg-btn:focus-visible,
.ftrf__primary-btn:focus-visible,
.ftrf__load-more-btn:focus-visible,
.ftrf__mini-btn:focus-visible,
.ftrf__cluster-card:focus-visible,
.ftrf__input:focus-visible,
.ftrf__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ftrf__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ftrf__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.ftrf__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.ftrf__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.ftrf__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ftrf__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ftrf__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ftrf__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.ftrf__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.ftrf__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.ftrf__empty-banner,
.ftrf__empty-filter {
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

.ftrf__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.ftrf__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.ftrf__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.ftrf__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.ftrf__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.ftrf__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.ftrf__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.ftrf__inputs-row {
	align-items: flex-end;
}

.ftrf__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ftrf__field-grow {
	flex: 1 1 180px;
}

.ftrf__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ftrf__input,
.ftrf__override-select {
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

.ftrf__num-input {
	inline-size: 96px;
}

.ftrf__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.ftrf__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.ftrf__cluster-card {
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

.ftrf__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.ftrf__cluster-top,
.ftrf__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.ftrf__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.ftrf__cluster-meta,
.ftrf__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.ftrf__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.ftrf__badge,
.ftrf__pill {
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

.ftrf__pill.is-keep,
.ftrf__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.ftrf__pill.is-redundant,
.ftrf__badge.is-redundant {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.ftrf__pill.is-consolidate,
.ftrf__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.ftrf__pill.is-warn,
.ftrf__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.ftrf__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.ftrf__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.ftrf__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ftrf__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.ftrf__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.ftrf__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ftrf__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ftrf__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ftrf__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.ftrf__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftrf__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.ftrf__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.ftrf__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.ftrf__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ftrf__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftrf__member-top,
.ftrf__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ftrf__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.ftrf__member-pills,
.ftrf__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.ftrf__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.ftrf__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.ftrf__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ftrf__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ftrf__pre {
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

.ftrf__sr-only {
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
	.ftrf__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.ftrf__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.ftrf__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.fiber-telecom-rf-vault-workbench {
		padding: 10px;
	}

	.ftrf__kpis,
	.ftrf__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.ftrf__num-input {
		inline-size: 100%;
	}

	.ftrf__field {
		flex: 1 1 100%;
	}
}
</style>
