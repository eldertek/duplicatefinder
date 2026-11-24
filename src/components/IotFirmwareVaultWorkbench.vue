<template>
	<section
		class="iot-firmware-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'IoT Firmware, Embedded ROM and Hardware Lab Vault Auditor')">
		<header class="ifv__toolbar">
			<div class="ifv__title-group">
				<h3 class="ifv__title">
					{{ t('duplicatefinder', 'IoT Firmware, Embedded ROM & Hardware Lab Vault Auditor') }}
				</h3>
				<span
					class="ifv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {signed} signed, {eda} EDA, {calib} calib, {debug} debug', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						signed: analysis.summary.totalSignedReleaseClusters,
						eda: analysis.summary.totalEdaSourceClusters,
						calib: analysis.summary.totalCalibrationLabClusters,
						debug: analysis.summary.totalDebugBuildClusters,
					}) }}
				</span>
			</div>

			<div class="ifv__toolbar-actions">
				<button
					type="button"
					class="ifv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ifv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ifv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ifv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="ifv__tool-btn is-close"
					aria-keyshortcuts="Shift+F4"
					:title="t('duplicatefinder', 'Hide IoT Firmware, Embedded ROM and Hardware Lab Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide IoT & Firmware Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ifv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ifv__kpis">
			<div class="ifv__kpi">
				<span class="ifv__kpi-label">{{ t('duplicatefinder', 'Safe Debug & Scratch Reclaim') }}</span>
				<strong class="ifv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ifv__kpi">
				<span class="ifv__kpi-label">{{ t('duplicatefinder', 'Conserved Hardware & Release Vault') }}</span>
				<strong class="ifv__kpi-val is-warn">
					{{ analysis.summary.totalSignedReleaseClusters }} {{ t('duplicatefinder', 'signed') }} / {{ analysis.summary.totalEdaSourceClusters }} {{ t('duplicatefinder', 'EDA') }} / {{ analysis.summary.totalCalibrationLabClusters }} {{ t('duplicatefinder', 'calib') }}
				</strong>
			</div>
			<div class="ifv__kpi">
				<span class="ifv__kpi-label">{{ t('duplicatefinder', 'Intermediate Builds & Scratch') }}</span>
				<strong class="ifv__kpi-val">
					{{ analysis.summary.totalDebugBuildClusters }} {{ t('duplicatefinder', 'debug builds') }} / {{ analysis.summary.totalScratchBackupClusters }} {{ t('duplicatefinder', 'scratch/bak') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ifv__kpi">
				<span class="ifv__kpi-label">{{ t('duplicatefinder', 'Raw Embedded Footprint') }}</span>
				<strong class="ifv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ifv__empty-banner"
			role="note">
			<div class="ifv__empty-text">
				<p class="ifv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure KiCad/Altium source, signed release, and calibration lab shields before scanning') }}
				</p>
				<p class="ifv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit firmware ROMs (.bin, .hex, .elf, .uf2, .dfu, .img, .srec), KiCad/Altium sources (.kicad_sch, .kicad_pcb, .schdoc, .pcbdoc), Gerbers/BOMs (.gbr, .drl, .zip), and lab captures (.sr, .sal, .vcd, .csv).') }}
				</p>
			</div>
			<button
				type="button"
				class="ifv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ifv__controls">
			<div class="ifv__control-row">
				<span class="ifv__control-label">{{ t('duplicatefinder', 'Lab Preset') }}</span>
				<div
					class="ifv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'IoT firmware and hardware lab presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ifv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ifv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ifv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ifv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ifv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ifv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ifv__seg-btn"
					:class="{ 'is-active': protectSignedReleases }"
					:aria-pressed="protectSignedReleases ? 'true' : 'false'"
					@click="protectSignedReleases = !protectSignedReleases">
					<span>{{ protectSignedReleases ? t('duplicatefinder', 'Shield Signed Releases: ON') : t('duplicatefinder', 'Shield Signed Releases: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ifv__seg-btn"
					:class="{ 'is-active': protectEdaSources }"
					:aria-pressed="protectEdaSources ? 'true' : 'false'"
					@click="protectEdaSources = !protectEdaSources">
					<span>{{ protectEdaSources ? t('duplicatefinder', 'Shield KiCad/Altium: ON') : t('duplicatefinder', 'Shield KiCad/Altium: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ifv__seg-btn"
					:class="{ 'is-active': protectCalibrationLabs }"
					:aria-pressed="protectCalibrationLabs ? 'true' : 'false'"
					@click="protectCalibrationLabs = !protectCalibrationLabs">
					<span>{{ protectCalibrationLabs ? t('duplicatefinder', 'Shield Calibration Labs: ON') : t('duplicatefinder', 'Shield Calibration Labs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ifv__seg-btn"
					:class="{ 'is-active': requireVerifiedReleaseAnchor }"
					:aria-pressed="requireVerifiedReleaseAnchor ? 'true' : 'false'"
					@click="requireVerifiedReleaseAnchor = !requireVerifiedReleaseAnchor">
					<span>{{ requireVerifiedReleaseAnchor ? t('duplicatefinder', 'Require Release Anchor: ON') : t('duplicatefinder', 'Require Release Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="ifv__control-row ifv__inputs-row">
				<label class="ifv__field">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ifv__input">
						<option value="prune-debug-and-scratch">{{ t('duplicatefinder', 'Prune Debug & Scratch (Keep Signed, EDA & Calib)') }}</option>
						<option value="hardlink-immutable-releases">{{ t('duplicatefinder', 'Hardlink Immutable ROMs/Zips (Block EDA & CSV)') }}</option>
						<option value="quarantine-debug-and-captures">{{ t('duplicatefinder', 'Quarantine Debug Builds & Scratch Captures Only') }}</option>
					</select>
				</label>

				<label class="ifv__field">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ifv__input">
						<option value="signed-release-and-source-first">{{ t('duplicatefinder', 'Signed Releases, KiCad/Altium & Calib first') }}</option>
						<option value="oldest-golden-first">{{ t('duplicatefinder', 'Oldest golden vault mtime first') }}</option>
						<option value="newest-verified-release">{{ t('duplicatefinder', 'Newest verified release mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="ifv__field">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Build Grace (d)') }}</span>
					<input
						v-model="keepRecentBuildDaysInput"
						type="number"
						min="0"
						step="1"
						class="ifv__input ifv__num-input">
				</label>

				<label class="ifv__field">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ifv__input ifv__num-input">
				</label>

				<label class="ifv__field ifv__field-grow">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Filter MCU, Version, Firmware, KiCad/Altium or Lab Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ifv__input"
						:placeholder="t('duplicatefinder', 'e.g. STM32, ESP32, v1.4.2, kicad_pcb, gerber, saleae, debug')">
				</label>

				<label class="ifv__field">
					<span class="ifv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ifv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Hardware vault priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="ifv__control-row">
				<span class="ifv__control-label">{{ t('duplicatefinder', 'Hardware Family') }}</span>
				<div
					class="ifv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'IoT firmware and hardware lab family filter')">
					<button
						type="button"
						class="ifv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="ifv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="ifv__control-row">
				<span class="ifv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="ifv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Hardware and firmware governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="ifv__seg-btn"
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
			class="ifv__empty-filter"
			role="note">
			<p class="ifv__empty-title">
				{{ t('duplicatefinder', 'No firmware images, KiCad/Altium sources, Gerbers/BOMs, or lab captures match the active filters.') }}
			</p>
			<button
				type="button"
				class="ifv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ifv__workspace">
			<div
				class="ifv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited IoT Firmware, Embedded ROM and Hardware Lab clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="ifv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="ifv__cluster-top">
						<strong class="ifv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="ifv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="ifv__cluster-meta">
						<span
							v-if="cluster.targetMcu"
							class="ifv__tag">{{ cluster.targetMcu }}</span>
						<span
							v-if="cluster.firmwareVersion"
							class="ifv__tag">{{ cluster.firmwareVersion }}</span>
						<span class="ifv__tag">{{ cluster.hardwareLineageStem || cluster.name }}</span>
						<span class="ifv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="ifv__cluster-badges">
						<span
							v-if="cluster.hasSignedRelease"
							class="ifv__badge is-danger">
							{{ t('duplicatefinder', 'Signed Production Release') }}
						</span>
						<span
							v-if="cluster.hasEdaSource"
							class="ifv__badge is-keep">
							{{ t('duplicatefinder', 'KiCad / Altium Source') }}
						</span>
						<span
							v-if="cluster.hasCalibrationLab"
							class="ifv__badge is-keep">
							{{ t('duplicatefinder', 'Calibration Lab Golden') }}
						</span>
						<span
							v-if="cluster.hasIntermediateDebugBuild"
							class="ifv__badge is-consolidate">
							{{ t('duplicatefinder', 'Intermediate / Debug Build') }}
						</span>
						<span
							v-if="cluster.hasScratchCaptureOrBackup"
							class="ifv__badge is-warn">
							{{ t('duplicatefinder', 'Scratch / Autosave Backup') }}
						</span>
					</div>
					<div class="ifv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="ifv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="ifv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="ifv__inspector">
				<header class="ifv__inspector-head">
					<div class="ifv__inspector-title-wrap">
						<h4 class="ifv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="ifv__inspector-sub">
							{{ selectedCluster.targetMcu || selectedCluster.hardwareLineageStem }} | {{ selectedCluster.firmwareVersion || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="ifv__inspector-actions">
						<button
							type="button"
							class="ifv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="ifv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="ifv__lineage-grid">
					<div class="ifv__lineage-item">
						<span class="ifv__lineage-label">{{ t('duplicatefinder', 'Target MCU & Hardware Lineage') }}</span>
						<strong class="ifv__lineage-val">{{ selectedCluster.targetMcu ? `${selectedCluster.targetMcu} / ` : '' }}{{ selectedCluster.firmwareVersion ? `${selectedCluster.firmwareVersion} / ` : '' }}{{ selectedCluster.hardwareLineageStem }}</strong>
					</div>
					<div class="ifv__lineage-item">
						<span class="ifv__lineage-label">{{ t('duplicatefinder', 'Hardware Lab Conservation') }}</span>
						<strong class="ifv__lineage-val">
							{{ selectedCluster.hasSignedRelease ? t('duplicatefinder', 'Signed Production Release Shielded') : (selectedCluster.hasEdaSource ? t('duplicatefinder', 'KiCad / Altium Source Shielded') : (selectedCluster.hasCalibrationLab ? t('duplicatefinder', 'Calibration Lab Golden Shielded') : t('duplicatefinder', 'Intermediate Debug / Lab Scratch'))) }}
						</strong>
					</div>
					<div class="ifv__lineage-item">
						<span class="ifv__lineage-label">{{ t('duplicatefinder', 'Release Anchor & Provenance Tags') }}</span>
						<strong class="ifv__lineage-val">
							{{ selectedCluster.hasVerifiedReleaseAnchor ? t('duplicatefinder', 'Verified Release/Source Anchor') : t('duplicatefinder', 'No Release Anchor') }} | {{ selectedCluster.buildTags.length > 0 ? selectedCluster.buildTags.join(', ') : t('duplicatefinder', 'Standard hardware artifact') }}
						</strong>
					</div>
					<div class="ifv__lineage-item">
						<span class="ifv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="ifv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="ifv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="ifv__member-card">
						<div class="ifv__member-top">
							<code class="ifv__member-path">{{ member.normalized }}</code>
							<div class="ifv__member-pills">
								<span
									class="ifv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.buildTag"
									class="ifv__pill is-consolidate">
									{{ member.buildTag }}
								</span>
								<span
									class="ifv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="ifv__member-bottom">
							<div class="ifv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.hardwareRole }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="ifv__member-actions">
								<button
									type="button"
									class="ifv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isSignedRelease && protectSignedReleases) && !(member.isEdaSource && protectEdaSources) && !(member.isCalibrationLab && protectCalibrationLabs)"
									class="ifv__override-field">
									<span class="ifv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="ifv__override-select"
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

				<div class="ifv__code-panels">
					<div class="ifv__code-box">
						<div class="ifv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="ifv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ifv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="ifv__code-box">
						<div class="ifv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="ifv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="ifv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	IOT_FIRMWARE_PRESETS,
	auditIotFirmwareVault,
	buildIotFirmwareCsvReport,
	buildIotFirmwareJsonManifest,
	buildIotFirmwareRemediationScript,
	buildIotFirmwareSyncExcludeList,
} from '../tools/iotFirmwareVaultAuditor'

export default {
	name: 'IotFirmwareVaultWorkbench',
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
			presetId: 'all-iot-firmware-lab-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-debug-and-scratch',
			survivorRule: 'signed-release-and-source-first',
			protectSignedReleases: true,
			protectEdaSources: true,
			protectCalibrationLabs: true,
			requireVerifiedReleaseAnchor: true,
			keepRecentBuildDaysInput: '0',
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
			return IOT_FIRMWARE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'signed-release-protected', label: this.t('duplicatefinder', 'Signed Release') },
				{ id: 'eda-source-protected', label: this.t('duplicatefinder', 'KiCad / Altium') },
				{ id: 'calibration-lab-protected', label: this.t('duplicatefinder', 'Calibration Lab') },
				{ id: 'intermediate-debug-build', label: this.t('duplicatefinder', 'Debug Build') },
				{ id: 'scratch-capture-or-backup', label: this.t('duplicatefinder', 'Scratch / Backup') },
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
		parsedKeepRecentBuildDays() {
			const trimmed = String(this.keepRecentBuildDaysInput ?? '').trim()
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
			return auditIotFirmwareVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectSignedReleases: this.protectSignedReleases,
				protectEdaSources: this.protectEdaSources,
				protectCalibrationLabs: this.protectCalibrationLabs,
				requireVerifiedReleaseAnchor: this.requireVerifiedReleaseAnchor,
				keepRecentBuildDays: this.parsedKeepRecentBuildDays,
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
			return buildIotFirmwareRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildIotFirmwareSyncExcludeList()
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
			const preset = IOT_FIRMWARE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectSignedReleases = preset.protectSignedReleases
			this.protectEdaSources = preset.protectEdaSources
			this.protectCalibrationLabs = preset.protectCalibrationLabs
			this.requireVerifiedReleaseAnchor = preset.requireVerifiedReleaseAnchor
			this.keepRecentBuildDaysInput = String(preset.keepRecentBuildDays)
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
				'signed-release-protected': this.t('duplicatefinder', 'Signed Release'),
				'eda-source-protected': this.t('duplicatefinder', 'KiCad / Altium'),
				'calibration-lab-protected': this.t('duplicatefinder', 'Calibration Lab'),
				'intermediate-debug-build': this.t('duplicatefinder', 'Debug Build'),
				'scratch-capture-or-backup': this.t('duplicatefinder', 'Scratch / Backup'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'signed-release-protected') {
				return 'is-danger'
			}
			if (verdict === 'eda-source-protected' || verdict === 'calibration-lab-protected') {
				return 'is-keep'
			}
			if (verdict === 'intermediate-debug-build') {
				return 'is-consolidate'
			}
			if (verdict === 'scratch-capture-or-backup') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return this.strategy === 'quarantine-debug-and-captures'
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
				this.setNotice(this.t('duplicatefinder', 'Copied hardware or firmware file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 IoT Firmware & Lab remediation script to clipboard.'))
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
			const csv = buildIotFirmwareCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-iot-firmware-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe IoT Firmware & Lab Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildIotFirmwareJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-iot-firmware-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported IoT Firmware & Lab Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.iot-firmware-vault-workbench {
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

.ifv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ifv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ifv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ifv__status-badge {
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

.ifv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ifv__tool-btn,
.ifv__seg-btn,
.ifv__primary-btn,
.ifv__load-more-btn,
.ifv__mini-btn {
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

.ifv__tool-btn:hover:not(:disabled),
.ifv__seg-btn:hover:not(:disabled),
.ifv__load-more-btn:hover:not(:disabled),
.ifv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.ifv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ifv__tool-btn.is-primary-outline,
.ifv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ifv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ifv__tool-btn:focus-visible,
.ifv__seg-btn:focus-visible,
.ifv__primary-btn:focus-visible,
.ifv__load-more-btn:focus-visible,
.ifv__mini-btn:focus-visible,
.ifv__cluster-card:focus-visible,
.ifv__input:focus-visible,
.ifv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ifv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ifv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.ifv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.ifv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.ifv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ifv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ifv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ifv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.ifv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.ifv__empty-banner,
.ifv__empty-filter {
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

.ifv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.ifv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.ifv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.ifv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.ifv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.ifv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.ifv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.ifv__inputs-row {
	align-items: flex-end;
}

.ifv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ifv__field-grow {
	flex: 1 1 180px;
}

.ifv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ifv__input,
.ifv__override-select {
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

.ifv__num-input {
	inline-size: 96px;
}

.ifv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.ifv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.ifv__cluster-card {
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

.ifv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.ifv__cluster-top,
.ifv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.ifv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.ifv__cluster-meta,
.ifv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.ifv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.ifv__badge,
.ifv__pill {
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

.ifv__pill.is-keep,
.ifv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.ifv__pill.is-danger,
.ifv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.ifv__pill.is-consolidate,
.ifv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.ifv__pill.is-warn,
.ifv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.ifv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.ifv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.ifv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ifv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.ifv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.ifv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ifv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ifv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ifv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.ifv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ifv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.ifv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.ifv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.ifv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ifv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ifv__member-top,
.ifv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ifv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.ifv__member-pills,
.ifv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.ifv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.ifv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.ifv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ifv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ifv__pre {
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

.ifv__sr-only {
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
	.ifv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.ifv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.ifv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.iot-firmware-vault-workbench {
		padding: 10px;
	}

	.ifv__kpis,
	.ifv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.ifv__num-input {
		inline-size: 100%;
	}

	.ifv__field {
		flex: 1 1 100%;
	}
}
</style>
