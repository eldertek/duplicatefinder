<template>
	<section
		class="ops-schedule-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Automated Deduplication Schedule and Systemd/Cron Generator')">
		<header class="osw__toolbar">
			<div class="osw__title-group">
				<h3 class="osw__title">
					{{ t('duplicatefinder', 'Automated Deduplication Schedule & Systemd / Cron Generator') }}
				</h3>
				<span
					class="osw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{cron} / {dur} est. / {pass} pass {warn} warn {block} block', {
						cron: plan.scheduleMeta.cronExpression,
						dur: plan.summary.estimatedFullScanFormatted,
						pass: plan.summary.preflightPassCount,
						warn: plan.summary.preflightWarnCount,
						block: plan.summary.preflightBlockCount,
					}) }}
				</span>
			</div>

			<div class="osw__toolbar-actions">
				<button
					type="button"
					class="osw__tool-btn is-primary-outline"
					@click="exportInstallBundle">
					<span>{{ t('duplicatefinder', 'Export Bundle (.sh)') }}</span>
				</button>
				<button
					type="button"
					class="osw__tool-btn"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="osw__tool-btn"
					:disabled="plan.lanes.length === 0"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="osw__tool-btn is-close"
					aria-keyshortcuts="@"
					:title="t('duplicatefinder', 'Hide automated schedule generator')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Schedule') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="osw__empty-banner"
			role="note">
			<div class="osw__empty-text">
				<p class="osw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; generating baseline systemd/cron units') }}
				</p>
				<p class="osw__empty-hint">
					{{ t('duplicatefinder', 'Run a storage scan to populate per-user/groupfolder sharded lanes, runtime estimates, and SLA reclaim projections.') }}
				</p>
			</div>
			<button
				type="button"
				class="osw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="osw__controls">
			<div class="osw__control-row">
				<span class="osw__control-label">{{ t('duplicatefinder', 'Preset') }}</span>
				<div
					class="osw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Schedule presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="osw__seg-btn"
						:class="{ 'is-active': config.presetId === preset.id }"
						:aria-pressed="config.presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="!sourcePoolEmpty"
				class="osw__control-row">
				<span class="osw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
				<div
					class="osw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
					<button
						type="button"
						class="osw__seg-btn"
						:class="{ 'is-active': scope === 'filtered' }"
						:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
						@click="scope = 'filtered'">
						<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
					</button>
					<button
						type="button"
						class="osw__seg-btn"
						:class="{ 'is-active': scope === 'all' }"
						:aria-pressed="scope === 'all' ? 'true' : 'false'"
						@click="scope = 'all'">
						<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
					</button>
				</div>

				<span class="osw__control-label">{{ t('duplicatefinder', 'Guards') }}</span>
				<div
					class="osw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Safety preflight guards')">
					<button
						type="button"
						class="osw__seg-btn"
						:class="{ 'is-active': config.useFlock }"
						:aria-pressed="config.useFlock ? 'true' : 'false'"
						@click="config.useFlock = !config.useFlock">
						<span>{{ config.useFlock ? t('duplicatefinder', 'flock: ON') : t('duplicatefinder', 'flock: OFF') }}</span>
					</button>
					<button
						type="button"
						class="osw__seg-btn"
						:class="{ 'is-active': config.requireMaintenanceOff }"
						:aria-pressed="config.requireMaintenanceOff ? 'true' : 'false'"
						@click="config.requireMaintenanceOff = !config.requireMaintenanceOff">
						<span>{{ config.requireMaintenanceOff ? t('duplicatefinder', 'Maintenance Guard: ON') : t('duplicatefinder', 'Maintenance Guard: OFF') }}</span>
					</button>
				</div>
			</div>

			<div class="osw__control-row osw__inputs-row">
				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Frequency') }}</span>
					<select
						v-model="config.frequency"
						class="osw__select">
						<option
							v-for="freq in frequencyOptions"
							:key="freq.id"
							:value="freq.id">
							{{ freq.label }}
						</option>
					</select>
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Run Time (HH:MM)') }}</span>
					<input
						v-model="config.runTime"
						type="text"
						class="osw__input osw__short-input"
						:placeholder="t('duplicatefinder', '02:15')">
				</label>

				<label
					v-if="config.frequency === 'custom'"
					class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', '5-Field Cron') }}</span>
					<input
						v-model="config.customCron"
						type="text"
						class="osw__input osw__med-input"
						:placeholder="t('duplicatefinder', '15 2 * * *')">
				</label>

				<label
					v-if="config.frequency === 'custom'"
					class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Systemd OnCalendar') }}</span>
					<input
						v-model="config.customOnCalendar"
						type="text"
						class="osw__input osw__med-input"
						:placeholder="t('duplicatefinder', '*-*-* 02:15:00')">
				</label>

				<label class="osw__field osw__wide-field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'OCC Workflow') }}</span>
					<select
						v-model="config.occWorkflow"
						class="osw__select">
						<option
							v-for="wf in workflowOptions"
							:key="wf.id"
							:value="wf.id">
							{{ wf.label }}
						</option>
					</select>
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Storage Tier') }}</span>
					<select
						v-model="config.storageTier"
						class="osw__select">
						<option
							v-for="tier in storageTierOptions"
							:key="tier.id"
							:value="tier.id">
							{{ tier.label }}
						</option>
					</select>
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'ionice Class') }}</span>
					<select
						v-model="config.ioClass"
						class="osw__select">
						<option
							v-for="io in ioClassOptions"
							:key="io.id"
							:value="io.id">
							{{ io.label }}
						</option>
					</select>
				</label>
			</div>

			<div class="osw__control-row osw__inputs-row">
				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Nice (0-19)') }}</span>
					<input
						v-model="niceInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Process nice priority level')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'MemoryHigh (MiB)') }}</span>
					<input
						v-model="memoryHighInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Systemd MemoryHigh in MiB')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'MemoryMax (MiB)') }}</span>
					<input
						v-model="memoryMaxInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Systemd MemoryMax in MiB')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'CPUQuota (%)') }}</span>
					<input
						v-model="cpuQuotaInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Systemd CPUQuota percentage')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Window (min)') }}</span>
					<input
						v-model="windowMinutesInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Maintenance window in minutes')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'SLA Goal (%)') }}</span>
					<input
						v-model="slaTargetPctInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Target SLA reclaim percentage')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Max Groups/Run') }}</span>
					<input
						v-model="maxGroupsInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Maximum duplicate groups per run')">
				</label>

				<label class="osw__field">
					<span class="osw__field-label">{{ t('duplicatefinder', 'Min Disk Free (%)') }}</span>
					<input
						v-model="minFreeDiskInput"
						type="text"
						inputmode="numeric"
						class="osw__input osw__num-input"
						:aria-label="t('duplicatefinder', 'Minimum free disk percentage preflight check')">
				</label>
			</div>

			<details class="osw__paths-box">
				<summary class="osw__paths-summary">
					<span>{{ t('duplicatefinder', 'Host Paths, Lockfile, Loadavg & Min-Size Threshold ({service}.service)', { service: plan.config.serviceName }) }}</span>
				</summary>
				<div class="osw__paths-grid">
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Unit / Service Name') }}</span>
						<input
							v-model="config.serviceName"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Nextcloud Root') }}</span>
						<input
							v-model="config.nextcloudRoot"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'PHP Binary') }}</span>
						<input
							v-model="config.phpBin"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'OCC System User') }}</span>
						<input
							v-model="config.occUser"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'flock Lock File') }}</span>
						<input
							v-model="config.lockFile"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Log File') }}</span>
						<input
							v-model="config.logFile"
							type="text"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Max 1m Loadavg') }}</span>
						<input
							v-model="maxLoadAvgInput"
							type="text"
							inputmode="decimal"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Min File Size (MiB)') }}</span>
						<input
							v-model="minSizeMbInput"
							type="text"
							inputmode="numeric"
							class="osw__input">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'flock Wait (s, 0=skip)') }}</span>
						<input
							v-model="flockTimeoutInput"
							type="text"
							inputmode="numeric"
							class="osw__input">
					</label>
				</div>
			</details>
		</div>

		<div
			v-if="statusNotice"
			class="osw__notice"
			:class="`is-${statusNoticeType}`"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="osw__summary-deck">
			<article class="osw__kpi-card">
				<span class="osw__kpi-label">{{ t('duplicatefinder', 'Target Reclaim Scope') }}</span>
				<strong class="osw__kpi-val">{{ plan.summary.totalReclaimableFormatted }}</strong>
				<span class="osw__kpi-sub">
					{{ t('duplicatefinder', '{scope} / {groups} group(s) / {files} file(s)', {
						scope: plan.summary.activeLaneLabel,
						groups: plan.summary.totalGroups,
						files: plan.summary.totalFiles,
					}) }}
				</span>
			</article>

			<article
				class="osw__kpi-card"
				:class="{ 'is-warn': !plan.summary.fitsInWindow && plan.summary.totalGroups > 0 }">
				<span class="osw__kpi-label">{{ t('duplicatefinder', 'Window Fit & Throughput') }}</span>
				<strong class="osw__kpi-val">{{ plan.summary.estimatedFullScanFormatted }}</strong>
				<span class="osw__kpi-sub">
					{{ t('duplicatefinder', '{pct}% of {win}m window @ {rate} MiB/s', {
						pct: plan.summary.windowUtilizationPct,
						win: plan.summary.windowMinutes,
						rate: plan.summary.effectiveThroughputMbPerSec,
					}) }}
				</span>
			</article>

			<article class="osw__kpi-card is-highlight">
				<span class="osw__kpi-label">{{ t('duplicatefinder', 'SLA Reclaim Horizon') }}</span>
				<strong class="osw__kpi-val">{{ plan.summary.slaTargetFormatted }}</strong>
				<span class="osw__kpi-sub">
					{{ t('duplicatefinder', '{pct}% SLA in {cycles} run(s) (~{days} day(s))', {
						pct: plan.summary.slaTargetPct,
						cycles: plan.summary.cyclesToReachSla,
						days: plan.summary.daysToReachSla,
					}) }}
				</span>
			</article>

			<article
				class="osw__kpi-card"
				:class="{ 'is-danger': plan.summary.preflightBlockCount > 0, 'is-warn': plan.summary.preflightBlockCount === 0 && plan.summary.preflightWarnCount > 0 }">
				<span class="osw__kpi-label">{{ t('duplicatefinder', 'Preflight Health') }}</span>
				<strong class="osw__kpi-val">
					{{ plan.summary.preflightBlockCount > 0
						? t('duplicatefinder', '{count} blocker(s)', { count: plan.summary.preflightBlockCount })
						: (plan.summary.preflightWarnCount > 0
							? t('duplicatefinder', '{count} warning(s)', { count: plan.summary.preflightWarnCount })
							: t('duplicatefinder', 'All guards pass')) }}
				</strong>
				<span class="osw__kpi-sub">
					{{ t('duplicatefinder', '{pass} pass / {warn} warn / {block} block', {
						pass: plan.summary.preflightPassCount,
						warn: plan.summary.preflightWarnCount,
						block: plan.summary.preflightBlockCount,
					}) }}
				</span>
			</article>
		</div>

		<div class="osw__preflight-grid">
			<article
				v-for="check in plan.preflightChecks"
				:key="check.id"
				class="osw__preflight-card"
				:class="`is-${check.status}`">
				<div class="osw__preflight-top">
					<span
						class="osw__status-pill"
						:class="`is-${check.status}`">
						{{ check.status.toUpperCase() }}
					</span>
					<strong class="osw__preflight-title">{{ check.title }}</strong>
				</div>
				<p class="osw__preflight-detail">
					{{ check.detail }}
				</p>
				<p
					v-if="check.remediation"
					class="osw__preflight-fix">
					{{ check.remediation }}
				</p>
			</article>
		</div>

		<div class="osw__workspace">
			<div class="osw__lanes-column">
				<div class="osw__lanes-toolbar">
					<label class="osw__field osw__search-field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Filter Lanes') }}</span>
						<input
							v-model="config.searchQuery"
							type="search"
							class="osw__input"
							:placeholder="t('duplicatefinder', 'Filter user, groupfolder, or mount...')">
					</label>
					<label class="osw__field">
						<span class="osw__field-label">{{ t('duplicatefinder', 'Sort Lanes') }}</span>
						<select
							v-model="config.laneSortMode"
							class="osw__select">
							<option value="waste_desc">{{ t('duplicatefinder', 'Largest Waste') }}</option>
							<option value="runtime_desc">{{ t('duplicatefinder', 'Longest Runtime') }}</option>
							<option value="groups_desc">{{ t('duplicatefinder', 'Most Groups') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Lane Name A-Z') }}</option>
						</select>
					</label>
				</div>

				<div
					class="osw__lane-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Sharded schedule lanes')">
					<button
						type="button"
						class="osw__lane-card"
						:class="{ 'is-selected': config.targetLaneId === 'all' }"
						:aria-current="config.targetLaneId === 'all' ? 'true' : 'false'"
						@click="config.targetLaneId = 'all'">
						<div class="osw__lane-top">
							<span class="osw__lane-type">{{ t('duplicatefinder', 'GLOBAL') }}</span>
							<span class="osw__lane-waste">{{ plan.summary.totalReclaimableFormatted }}</span>
						</div>
						<div class="osw__lane-name">
							{{ t('duplicatefinder', 'All Nextcloud Storage Scopes') }}
						</div>
						<div class="osw__lane-meta">
							<span>{{ t('duplicatefinder', '{count} lane(s)', { count: plan.allLanes.length }) }}</span>
							<span>{{ plan.scheduleMeta.scheduleLabel }}</span>
						</div>
					</button>

					<button
						v-for="lane in visibleLanes"
						:key="lane.laneId"
						type="button"
						class="osw__lane-card"
						:class="{
							'is-selected': config.targetLaneId === lane.laneId,
							'is-over-window': lane.exceedsWindow,
						}"
						:aria-current="config.targetLaneId === lane.laneId ? 'true' : 'false'"
						@click="config.targetLaneId = lane.laneId">
						<div class="osw__lane-top">
							<span class="osw__lane-type">{{ formatLaneType(lane.laneType) }}</span>
							<span class="osw__lane-waste">{{ lane.reclaimableFormatted }} ({{ lane.wasteSharePct }}%)</span>
						</div>
						<div class="osw__lane-name">
							{{ lane.laneLabel }}
						</div>
						<div class="osw__lane-cmd">
							{{ lane.occScopeFlag || t('duplicatefinder', 'All paths') }}
						</div>
						<div class="osw__lane-meta">
							<span>{{ t('duplicatefinder', '{groups} grp / {files} files', { groups: lane.groupCount, files: lane.fileCount }) }}</span>
							<span>{{ lane.estimatedScanFormatted }} {{ lane.exceedsWindow ? t('duplicatefinder', '(exceeds window)') : '' }}</span>
						</div>
					</button>

					<div
						v-if="plan.lanes.length > visibleLimit"
						class="osw__load-more-wrap">
						<button
							type="button"
							class="osw__tool-btn"
							@click="visibleLimit += 20">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: plan.lanes.length - visibleLimit }) }}</span>
						</button>
					</div>
				</div>
			</div>

			<div
				class="osw__artifacts-panel"
				role="region"
				:aria-label="t('duplicatefinder', 'Generated systemd, cron, and runner artifacts')">
				<div class="osw__artifacts-header">
					<div
						class="osw__segments"
						role="tablist"
						:aria-label="t('duplicatefinder', 'Generated artifact tabs')">
						<button
							v-for="tab in artifactTabs"
							:key="tab.id"
							type="button"
							role="tab"
							class="osw__seg-btn"
							:class="{ 'is-active': activeArtifactTab === tab.id }"
							:aria-selected="activeArtifactTab === tab.id ? 'true' : 'false'"
							@click="activeArtifactTab = tab.id">
							<span>{{ tab.label }}</span>
						</button>
					</div>

					<div class="osw__artifact-actions">
						<button
							type="button"
							class="osw__tool-btn"
							@click="copyActiveArtifact">
							<span>{{ t('duplicatefinder', 'Copy Artifact') }}</span>
						</button>
						<button
							type="button"
							class="osw__tool-btn"
							@click="downloadActiveArtifact">
							<span>{{ t('duplicatefinder', 'Download File') }}</span>
						</button>
					</div>
				</div>

				<div class="osw__artifact-meta">
					<span class="osw__artifact-path">{{ activeArtifactMeta.path }}</span>
					<span class="osw__artifact-hint">{{ activeArtifactMeta.hint }}</span>
				</div>

				<pre class="osw__code-pre"><code>{{ activeArtifactContent }}</code></pre>

				<div
					v-if="selectedLane && selectedLane.rawGroup"
					class="osw__lane-inspector">
					<div class="osw__lane-inspector-info">
						<strong>{{ t('duplicatefinder', 'Selected Lane Top Cluster: {lane}', { lane: selectedLane.laneLabel }) }}</strong>
						<span>{{ selectedLane.recommendedCommand }}</span>
					</div>
					<div class="osw__lane-inspector-actions">
						<button
							type="button"
							class="osw__tool-btn"
							@click="$emit('select-duplicate', selectedLane.rawGroup)">
							<span>{{ t('duplicatefinder', 'Inspect Top Group') }}</span>
						</button>
						<button
							v-if="selectedLane.rawGroup.files && selectedLane.rawGroup.files.length > 1"
							type="button"
							class="osw__tool-btn"
							@click="$emit('compare-duplicate', selectedLane.rawGroup)">
							<span>{{ t('duplicatefinder', 'Compare') }}</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	DEFAULT_SCHEDULE_CONFIG,
	IO_CLASS_PROFILES,
	OCC_WORKFLOWS,
	SCHEDULE_FREQUENCIES,
	SCHEDULE_PRESETS,
	STORAGE_TIER_PROFILES,
	buildCronAndRunnerScript,
	buildInstallBundleScript,
	buildOpsScheduleAuditCsv,
	buildOpsScheduleAuditJson,
	buildOpsSchedulePlan,
	buildSystemdServiceUnit,
	buildSystemdTimerUnit,
} from '../tools/opsScheduleGenerator'

export default {
	name: 'OpsScheduleWorkbench',
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
			scope: 'filtered',
			config: { ...DEFAULT_SCHEDULE_CONFIG },
			niceInput: String(DEFAULT_SCHEDULE_CONFIG.niceLevel),
			memoryHighInput: String(DEFAULT_SCHEDULE_CONFIG.memoryHighMb),
			memoryMaxInput: String(DEFAULT_SCHEDULE_CONFIG.memoryMaxMb),
			cpuQuotaInput: String(DEFAULT_SCHEDULE_CONFIG.cpuQuotaPct),
			windowMinutesInput: String(DEFAULT_SCHEDULE_CONFIG.windowMinutes),
			slaTargetPctInput: String(DEFAULT_SCHEDULE_CONFIG.slaTargetPct),
			maxGroupsInput: String(DEFAULT_SCHEDULE_CONFIG.maxGroupsPerRun),
			minFreeDiskInput: String(DEFAULT_SCHEDULE_CONFIG.minFreeDiskPct),
			maxLoadAvgInput: String(DEFAULT_SCHEDULE_CONFIG.maxLoadAvg),
			minSizeMbInput: String(DEFAULT_SCHEDULE_CONFIG.minSizeFilterMb),
			flockTimeoutInput: String(DEFAULT_SCHEDULE_CONFIG.flockTimeoutSec),
			activeArtifactTab: 'service',
			visibleLimit: 20,
			statusNotice: '',
			statusNoticeType: 'info',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		sourceDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		presets() {
			return SCHEDULE_PRESETS
		},
		frequencyOptions() {
			return SCHEDULE_FREQUENCIES
		},
		workflowOptions() {
			return Object.values(OCC_WORKFLOWS)
		},
		storageTierOptions() {
			return Object.values(STORAGE_TIER_PROFILES)
		},
		ioClassOptions() {
			return Object.values(IO_CLASS_PROFILES)
		},
		effectiveConfig() {
			return {
				...this.config,
				niceLevel: this.parseNumberField(this.niceInput, DEFAULT_SCHEDULE_CONFIG.niceLevel),
				memoryHighMb: this.parseNumberField(this.memoryHighInput, DEFAULT_SCHEDULE_CONFIG.memoryHighMb),
				memoryMaxMb: this.parseNumberField(this.memoryMaxInput, DEFAULT_SCHEDULE_CONFIG.memoryMaxMb),
				cpuQuotaPct: this.parseNumberField(this.cpuQuotaInput, DEFAULT_SCHEDULE_CONFIG.cpuQuotaPct),
				windowMinutes: this.parseNumberField(this.windowMinutesInput, DEFAULT_SCHEDULE_CONFIG.windowMinutes),
				slaTargetPct: this.parseNumberField(this.slaTargetPctInput, DEFAULT_SCHEDULE_CONFIG.slaTargetPct),
				maxGroupsPerRun: this.parseNumberField(this.maxGroupsInput, DEFAULT_SCHEDULE_CONFIG.maxGroupsPerRun),
				minFreeDiskPct: this.parseNumberField(this.minFreeDiskInput, DEFAULT_SCHEDULE_CONFIG.minFreeDiskPct),
				maxLoadAvg: this.parseNumberField(this.maxLoadAvgInput, DEFAULT_SCHEDULE_CONFIG.maxLoadAvg),
				minSizeFilterMb: this.parseNumberField(this.minSizeMbInput, DEFAULT_SCHEDULE_CONFIG.minSizeFilterMb),
				flockTimeoutSec: this.parseNumberField(this.flockTimeoutInput, DEFAULT_SCHEDULE_CONFIG.flockTimeoutSec),
			}
		},
		plan() {
			return buildOpsSchedulePlan(this.sourceDuplicates, this.effectiveConfig)
		},
		visibleLanes() {
			return this.plan.lanes.slice(0, this.visibleLimit)
		},
		selectedLane() {
			if (this.config.targetLaneId === 'all') {
				return null
			}
			return this.plan.allLanes.find(l => l.laneId === this.config.targetLaneId) || null
		},
		serviceUnitContent() {
			return buildSystemdServiceUnit(this.plan)
		},
		timerUnitContent() {
			return buildSystemdTimerUnit(this.plan)
		},
		cronArtifacts() {
			return buildCronAndRunnerScript(this.plan)
		},
		installBundleContent() {
			return buildInstallBundleScript(this.plan)
		},
		artifactTabs() {
			return [
				{ id: 'service', label: this.t('duplicatefinder', 'systemd .service') },
				{ id: 'timer', label: this.t('duplicatefinder', 'systemd .timer') },
				{ id: 'runner', label: this.t('duplicatefinder', 'runner.sh (flock/ionice)') },
				{ id: 'cron', label: this.t('duplicatefinder', '/etc/cron.d') },
			]
		},
		activeArtifactMeta() {
			const name = this.plan.config.serviceName
			if (this.activeArtifactTab === 'timer') {
				return {
					filename: `${name}.timer`,
					path: `/etc/systemd/system/${name}.timer`,
					mime: 'text/plain;charset=utf-8',
					hint: this.t('duplicatefinder', 'Persistent timer with RandomizedDelaySec={min}m', { min: this.plan.config.randomizedDelayMin }),
				}
			}
			if (this.activeArtifactTab === 'runner') {
				return {
					filename: `${name}-runner.sh`,
					path: `/usr/local/sbin/${name}-runner.sh`,
					mime: 'text/x-shellscript;charset=utf-8',
					hint: this.t('duplicatefinder', 'Defaults to DRY_RUN=1; verifies disk headroom, loadavg, and maintenance:mode'),
				}
			}
			if (this.activeArtifactTab === 'cron') {
				return {
					filename: `${name}.cron`,
					path: `/etc/cron.d/${name}`,
					mime: 'text/plain;charset=utf-8',
					hint: this.t('duplicatefinder', 'Standalone cron fallback wrapping flock + ionice + nice'),
				}
			}
			return {
				filename: `${name}.service`,
				path: `/etc/systemd/system/${name}.service`,
				mime: 'text/plain;charset=utf-8',
				hint: this.t('duplicatefinder', 'Systemd oneshot with MemoryHigh={high}M, MemoryMax={max}M, CPUQuota={cpu}%', {
					high: this.plan.config.memoryHighMb,
					max: this.plan.config.memoryMaxMb,
					cpu: this.plan.config.cpuQuotaPct,
				}),
			}
		},
		activeArtifactContent() {
			if (this.activeArtifactTab === 'timer') {
				return this.timerUnitContent
			}
			if (this.activeArtifactTab === 'runner') {
				return this.cronArtifacts.runnerScript
			}
			if (this.activeArtifactTab === 'cron') {
				return this.cronArtifacts.cronLine
			}
			return this.serviceUnitContent
		},
	},
	watch: {
		'config.searchQuery'() {
			this.visibleLimit = 20
		},
		'config.laneSortMode'() {
			this.visibleLimit = 20
		},
	},
	methods: {
		parseNumberField(raw, fallback) {
			const trimmed = String(raw ?? '').trim()
			if (!trimmed) {
				return fallback
			}
			const numeric = Number(trimmed)
			return Number.isFinite(numeric) ? numeric : fallback
		},
		applyPreset(presetId) {
			const preset = SCHEDULE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.config = {
				...this.config,
				presetId: preset.id,
				...preset.config,
			}
			this.niceInput = String(preset.config.niceLevel)
			this.memoryHighInput = String(preset.config.memoryHighMb)
			this.memoryMaxInput = String(preset.config.memoryMaxMb)
			this.cpuQuotaInput = String(preset.config.cpuQuotaPct)
			this.windowMinutesInput = String(preset.config.windowMinutes)
			this.minFreeDiskInput = String(preset.config.minFreeDiskPct)
			this.maxLoadAvgInput = String(preset.config.maxLoadAvg)
			this.flockTimeoutInput = String(preset.config.flockTimeoutSec)
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Applied "{name}" operations preset.', { name: preset.name })
		},
		formatLaneType(type) {
			if (type === 'group_folder') {
				return this.t('duplicatefinder', 'GROUPFOLDER')
			}
			if (type === 'external_mount') {
				return this.t('duplicatefinder', 'EXTERNAL')
			}
			if (type === 'user_home') {
				return this.t('duplicatefinder', 'USER HOME')
			}
			return this.t('duplicatefinder', 'ROOT')
		},
		triggerDownload(content, mimeType, filename) {
			const blob = new Blob([content], { type: mimeType })
			const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
				? URL.createObjectURL(blob)
				: ''
			if (!url) {
				return false
			}
			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			if (typeof URL.revokeObjectURL === 'function') {
				setTimeout(() => URL.revokeObjectURL(url), 1000)
			}
			return true
		},
		async copyActiveArtifact() {
			const ok = await copyTextSafely(this.activeArtifactContent)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied {file} to clipboard.', { file: this.activeArtifactMeta.filename })
				: this.t('duplicatefinder', 'Could not copy artifact to clipboard.')
		},
		downloadActiveArtifact() {
			this.triggerDownload(this.activeArtifactContent, this.activeArtifactMeta.mime, this.activeArtifactMeta.filename)
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Downloaded {file}.', { file: this.activeArtifactMeta.filename })
		},
		exportInstallBundle() {
			const filename = `${this.plan.config.serviceName}-install.sh`
			this.triggerDownload(this.installBundleContent, 'text/x-shellscript;charset=utf-8', filename)
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported DRY_RUN=1 systemd + cron installation bundle ({file}).', { file: filename })
		},
		exportJsonReport() {
			const payload = JSON.stringify(buildOpsScheduleAuditJson(this.plan), null, 2)
			this.triggerDownload(payload, 'application/json;charset=utf-8', `${this.plan.config.serviceName}-schedule-audit.json`)
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported ops schedule JSON audit & unit manifest.')
		},
		exportCsvLedger() {
			const csv = buildOpsScheduleAuditCsv(this.plan)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', `${this.plan.config.serviceName}-lanes-sla.csv`)
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe schedule lane SLA CSV ledger.')
		},
	},
}
</script>

<style scoped>
.ops-schedule-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.osw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.osw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.osw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.osw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.osw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.osw__tool-btn,
.osw__seg-btn,
.osw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
}

.osw__tool-btn:hover:not(:disabled),
.osw__seg-btn:hover:not(:disabled),
.osw__primary-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.osw__tool-btn:focus-visible,
.osw__seg-btn:focus-visible,
.osw__primary-btn:focus-visible,
.osw__input:focus-visible,
.osw__select:focus-visible,
.osw__lane-card:focus-visible,
.osw__paths-summary:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.osw__tool-btn:disabled,
.osw__seg-btn:disabled,
.osw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.osw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.osw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element);
}

.osw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.osw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.osw__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.osw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.92rem;
}

.osw__empty-hint {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.84rem;
	max-inline-size: 68ch;
}

.osw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.osw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.osw__inputs-row {
	align-items: flex-end;
}

.osw__control-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.osw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.osw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.osw__wide-field {
	flex: 1 1 230px;
}

.osw__search-field {
	flex: 1 1 180px;
}

.osw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.osw__input,
.osw__select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.osw__num-input {
	inline-size: 98px;
}

.osw__short-input {
	inline-size: 112px;
}

.osw__med-input {
	inline-size: 170px;
}

.osw__paths-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.osw__paths-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.88rem;
	cursor: pointer;
}

.osw__paths-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
	padding-block-start: 10px;
}

@media (min-width: 640px) {
	.osw__paths-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1080px) {
	.osw__paths-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

.osw__notice {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-weight: 600;
}

.osw__notice.is-success {
	border-color: #1c7c45;
	background-color: #e9f7ef;
	color: #0f5132;
}

.osw__notice.is-error {
	border-color: #b42318;
	background-color: #fdecea;
	color: #7a1c15;
}

.osw__summary-deck {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 640px) {
	.osw__summary-deck {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1080px) {
	.osw__summary-deck {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.osw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osw__kpi-card.is-highlight {
	border-color: #9dd6b4;
	background-color: #e7f6ec;
	color: #0f5132;
}

.osw__kpi-card.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.osw__kpi-card.is-danger {
	border-color: #f1aeb5;
	background-color: #fdecea;
	color: #842029;
}

.osw__kpi-label {
	font-size: 0.78rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.osw__kpi-card.is-highlight .osw__kpi-label,
.osw__kpi-card.is-highlight .osw__kpi-sub {
	color: #0f5132;
}

.osw__kpi-card.is-warn .osw__kpi-label,
.osw__kpi-card.is-warn .osw__kpi-sub {
	color: #7c4a03;
}

.osw__kpi-card.is-danger .osw__kpi-label,
.osw__kpi-card.is-danger .osw__kpi-sub {
	color: #842029;
}

.osw__kpi-val {
	font-size: 1.12rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.osw__kpi-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osw__preflight-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 768px) {
	.osw__preflight-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1200px) {
	.osw__preflight-grid {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
}

.osw__preflight-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osw__preflight-card.is-block {
	border-color: #f1aeb5;
	background-color: #fdecea;
	color: #842029;
}

.osw__preflight-card.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.osw__preflight-top {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.osw__status-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.osw__status-pill.is-pass {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.osw__status-pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.osw__status-pill.is-block {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.osw__preflight-title {
	font-size: 0.86rem;
}

.osw__preflight-detail,
.osw__preflight-fix {
	margin: 0;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.osw__preflight-fix {
	font-weight: 600;
}

.osw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.osw__workspace {
		grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
	}
}

.osw__lanes-column {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-inline-size: 0;
}

.osw__lanes-toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: flex-end;
}

.osw__lane-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.osw__lane-card {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 5px;
	text-align: start;
	min-block-size: 44px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	max-inline-size: 100%;
}

.osw__lane-card:hover {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.osw__lane-card.is-selected {
	border-color: var(--color-primary-element);
	box-shadow: inset 3px 0 0 var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.osw__lane-card.is-over-window {
	border-inline-end: 3px solid #d97706;
}

.osw__lane-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
}

.osw__lane-type {
	font-weight: 700;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.osw__lane-waste {
	font-weight: 700;
}

.osw__lane-name {
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.osw__lane-cmd {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osw__lane-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.osw__artifacts-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.osw__artifacts-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.osw__artifact-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.osw__artifact-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.osw__artifact-path {
	font-family: monospace;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.osw__artifact-hint {
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.osw__code-pre {
	margin: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.8rem;
	line-height: 1.45;
	overflow-x: auto;
	max-block-size: 380px;
}

.osw__lane-inspector {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.osw__lane-inspector-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.osw__lane-inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.osw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
