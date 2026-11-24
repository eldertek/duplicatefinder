<template>
	<section
		class="ransomware-canary-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Ransomware Canary, Extension Drift and Mass-Entropy Anomaly Guard')">
		<header class="rcw__toolbar">
			<div class="rcw__title-group">
				<h3 class="rcw__title">
					{{ t('duplicatefinder', 'Ransomware Canary, Extension Drift & Mass-Entropy Guard') }}
				</h3>
				<span
					class="rcw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{incident} / {quarantined} quarantined / {survivors} survivors shielded / {bursts} burst waves', {
						incident: analysis.policy.incidentId,
						quarantined: analysis.summary.quarantinedGroupsCount + analysis.summary.holdAllGroupsCount,
						survivors: analysis.summary.protectedCleanSurvivorsCount,
						bursts: analysis.summary.burstWindowCount,
					}) }}
				</span>
			</div>

			<div class="rcw__toolbar-actions">
				<button
					type="button"
					class="rcw__tool-btn is-primary-outline"
					@click="exportIncidentJson">
					<span>{{ t('duplicatefinder', 'Export Incident JSON') }}</span>
				</button>
				<button
					type="button"
					class="rcw__tool-btn"
					:disabled="analysis.groups.length === 0"
					@click="exportAnomalyCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="rcw__tool-btn"
					@click="copyContainmentScript">
					<span>{{ t('duplicatefinder', 'Copy occ Containment Script') }}</span>
				</button>
				<button
					type="button"
					class="rcw__tool-btn is-close"
					aria-keyshortcuts="*"
					:title="t('duplicatefinder', 'Hide ransomware canary and extension drift guard')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Canary Guard') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="rcw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="rcw__empty-banner"
			role="note">
			<div class="rcw__empty-text">
				<p class="rcw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; arm canary thresholds and drift rules before scanning') }}
				</p>
				<p class="rcw__empty-hint">
					{{ t('duplicatefinder', 'Configure your Incident ID, entropy threshold, and burst-wave window now, then run a scan to shield clean originals from bulk deletion.') }}
				</p>
			</div>
			<button
				type="button"
				class="rcw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="rcw__controls">
			<div class="rcw__control-row">
				<span class="rcw__control-label">{{ t('duplicatefinder', 'Shield Preset') }}</span>
				<div
					class="rcw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Ransomware guard presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="rcw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="!sourcePoolEmpty"
				class="rcw__control-row">
				<span class="rcw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
				<div
					class="rcw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
					<button
						type="button"
						class="rcw__seg-btn"
						:class="{ 'is-active': scope === 'filtered' }"
						:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
						@click="scope = 'filtered'">
						<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
					</button>
					<button
						type="button"
						class="rcw__seg-btn"
						:class="{ 'is-active': scope === 'all' }"
						:aria-pressed="scope === 'all' ? 'true' : 'false'"
						@click="scope = 'all'">
						<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
					</button>
				</div>

				<button
					type="button"
					class="rcw__seg-btn"
					:class="{ 'is-active': quarantineBulkDelete }"
					:aria-pressed="quarantineBulkDelete ? 'true' : 'false'"
					@click="quarantineBulkDelete = !quarantineBulkDelete">
					<span>{{ quarantineBulkDelete ? t('duplicatefinder', 'Survivor Quarantine Gate: ON') : t('duplicatefinder', 'Survivor Quarantine Gate: OFF') }}</span>
				</button>
			</div>

			<div class="rcw__control-row rcw__inputs-row">
				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Incident ID') }}</span>
					<input
						v-model="incidentIdInput"
						type="text"
						class="rcw__input rcw__med-input"
						:placeholder="t('duplicatefinder', 'INC-2026-001')">
				</label>

				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Entropy Floor (bits/B)') }}</span>
					<input
						v-model="entropyThresholdInput"
						type="number"
						step="0.05"
						min="6.5"
						max="8.0"
						class="rcw__input rcw__num-input">
				</label>

				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Burst Window (min)') }}</span>
					<input
						v-model="burstWindowInput"
						type="number"
						min="1"
						max="1440"
						class="rcw__input rcw__num-input">
				</label>

				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Burst Min Files') }}</span>
					<input
						v-model="burstMinFilesInput"
						type="number"
						min="2"
						max="100"
						class="rcw__input rcw__num-input">
				</label>

				<label class="rcw__field rcw__wide-field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Custom Canary / Suffix Pattern') }}</span>
					<input
						v-model="customPatternInput"
						type="text"
						class="rcw__input"
						:placeholder="t('duplicatefinder', 'e.g. canary|\\.vaultcrypt$')">
				</label>
			</div>
		</div>

		<div class="rcw__summary-deck">
			<div class="rcw__kpi-card is-danger">
				<span class="rcw__kpi-label">{{ t('duplicatefinder', 'Quarantined Groups') }}</span>
				<strong class="rcw__kpi-val">
					{{ analysis.summary.quarantinedGroupsCount + analysis.summary.holdAllGroupsCount }} / {{ analysis.summary.totalGroups }}
				</strong>
				<span class="rcw__kpi-sub">
					{{ t('duplicatefinder', '{critical} critical / {high} high / {volume} held', {
						critical: analysis.summary.criticalCount,
						high: analysis.summary.highCount,
						volume: analysis.summary.quarantinedBytesFormatted,
					}) }}
				</span>
			</div>

			<div class="rcw__kpi-card is-warn">
				<span class="rcw__kpi-label">{{ t('duplicatefinder', 'Extension Drift & Entropy') }}</span>
				<strong class="rcw__kpi-val">
					{{ analysis.summary.extensionDriftCount }} / {{ analysis.summary.entropyAnomalyCount }}
				</strong>
				<span class="rcw__kpi-sub">
					{{ t('duplicatefinder', '{drift} drifted pairs / {entropy} entropy spikes', {
						drift: analysis.summary.extensionDriftCount,
						entropy: analysis.summary.entropyAnomalyCount,
					}) }}
				</span>
			</div>

			<div class="rcw__kpi-card is-warn">
				<span class="rcw__kpi-label">{{ t('duplicatefinder', 'Canary & Ransom Notes') }}</span>
				<strong class="rcw__kpi-val">
					{{ analysis.summary.canaryTripwireCount }} / {{ analysis.summary.ransomNoteCount }}
				</strong>
				<span class="rcw__kpi-sub">
					{{ t('duplicatefinder', '{windows} burst wave(s) detected', { windows: analysis.summary.burstWindowCount }) }}
				</span>
			</div>

			<div class="rcw__kpi-card is-highlight">
				<span class="rcw__kpi-label">{{ t('duplicatefinder', 'Clean Survivors Shielded') }}</span>
				<strong class="rcw__kpi-val">{{ analysis.summary.protectedCleanSurvivorsCount }}</strong>
				<span class="rcw__kpi-sub">
					{{ t('duplicatefinder', '{verified} admin-verified / {reclaim} safe reclaimable', {
						verified: analysis.summary.verifiedSafeCount,
						reclaim: analysis.summary.safeReclaimableBytesFormatted,
					}) }}
				</span>
			</div>
		</div>

		<div
			v-if="analysis.burstWindows.length > 0"
			class="rcw__burst-banner"
			role="alert">
			<strong>{{ t('duplicatefinder', 'Active Encryption Burst-Wave Alert:') }}</strong>
			<span>
				{{ t('duplicatefinder', '{count} synchronized mutation window(s) affecting {custodians}', {
					count: analysis.burstWindows.length,
					custodians: analysis.burstWindows.flatMap(w => w.custodians).filter((v, i, a) => a.indexOf(v) === i).join(', '),
				}) }}
			</span>
		</div>

		<div class="rcw__filter-bar">
			<div
				class="rcw__segments"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by anomaly category')">
				<button
					v-for="mode in filterModes"
					:key="mode.id"
					type="button"
					class="rcw__seg-btn"
					:class="{ 'is-active': filterMode === mode.id }"
					:aria-pressed="filterMode === mode.id ? 'true' : 'false'"
					@click="filterMode = mode.id">
					<span>{{ mode.label }}</span>
				</button>
			</div>

			<div class="rcw__filter-inputs">
				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Severity') }}</span>
					<select
						v-model="severityFilter"
						class="rcw__select">
						<option
							v-for="item in severityFilters"
							:key="item.id"
							:value="item.id">
							{{ item.label }}
						</option>
					</select>
				</label>

				<label class="rcw__field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Sort by') }}</span>
					<select
						v-model="sortMode"
						class="rcw__select">
						<option
							v-for="item in sortModes"
							:key="item.id"
							:value="item.id">
							{{ item.label }}
						</option>
					</select>
				</label>

				<label class="rcw__field rcw__search-field">
					<span class="rcw__field-label">{{ t('duplicatefinder', 'Search path, custodian, hash, or signal') }}</span>
					<input
						v-model="searchQuery"
						type="search"
						class="rcw__input"
						:placeholder="t('duplicatefinder', 'Filter .locked, canary, user, hash...')">
				</label>
			</div>
		</div>

		<div class="rcw__workspace">
			<div class="rcw__list-col">
				<div
					v-if="visibleGroups.length === 0"
					class="rcw__empty-list">
					{{ t('duplicatefinder', 'No duplicate groups match the current ransomware canary filter.') }}
				</div>

				<button
					v-for="group in visibleGroups"
					:key="group.groupKey"
					type="button"
					class="rcw__group-card"
					:class="[
						{ 'is-selected': selectedGroup && selectedGroup.groupKey === group.groupKey },
						'is-sev-' + group.severity,
					]"
					@click="selectedGroupKey = group.groupKey">
					<div class="rcw__group-top">
						<span
							class="rcw__status-pill"
							:class="'is-' + group.quarantineStatus">
							{{ group.quarantineStatusLabel }}
						</span>
						<span class="rcw__risk-pill">
							{{ t('duplicatefinder', 'Risk {score}', { score: group.riskScore }) }}
						</span>
					</div>

					<div class="rcw__group-title">
						{{ group.title }}
					</div>

					<div class="rcw__group-meta">
						<span>{{ group.severityLabel }}</span>
						<span>{{ group.primaryCustodian }}</span>
						<span>{{ t('duplicatefinder', '{clean} clean / {suspect} suspect', { clean: group.cleanCount, suspect: group.suspiciousCount }) }}</span>
						<span>{{ group.totalBytesFormatted }}</span>
					</div>

					<div
						v-if="group.findings.length > 0"
						class="rcw__group-signals">
						{{ group.findings.map(formatSignalLabel).join(' / ') }}
					</div>
				</button>

				<div
					v-if="analysis.filteredGroups.length > visibleLimit"
					class="rcw__load-more-wrap">
					<button
						type="button"
						class="rcw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: analysis.filteredGroups.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedGroup"
				class="rcw__inspector-col">
				<header class="rcw__inspector-header">
					<div class="rcw__inspector-title-wrap">
						<h4 class="rcw__inspector-title">
							{{ selectedGroup.title }}
						</h4>
						<span class="rcw__inspector-sub">
							{{ selectedGroup.hash || selectedGroup.groupKey }}
						</span>
					</div>

					<div class="rcw__inspector-actions">
						<button
							type="button"
							class="rcw__tool-btn"
							@click="$emit('select-duplicate', selectedGroup.rawGroup)">
							<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
						</button>
						<button
							type="button"
							class="rcw__tool-btn"
							@click="$emit('compare-duplicate', selectedGroup.rawGroup)">
							<span>{{ t('duplicatefinder', 'Compare copies') }}</span>
						</button>
					</div>
				</header>

				<div class="rcw__forensic-meta">
					<div class="rcw__meta-item">
						<span class="rcw__meta-label">{{ t('duplicatefinder', 'Quarantine Status') }}</span>
						<strong>{{ selectedGroup.quarantineStatusLabel }}</strong>
					</div>
					<div class="rcw__meta-item">
						<span class="rcw__meta-label">{{ t('duplicatefinder', 'Risk & Severity') }}</span>
						<strong>{{ selectedGroup.severityLabel }} ({{ selectedGroup.riskScore }} / 100)</strong>
					</div>
					<div class="rcw__meta-item">
						<span class="rcw__meta-label">{{ t('duplicatefinder', 'Protected Clean Survivor') }}</span>
						<span class="rcw__mono-text">
							{{ selectedGroup.cleanSurvivorProtected ? selectedGroup.survivorPath : t('duplicatefinder', 'No unverified quarantine lock') }}
						</span>
					</div>
					<div class="rcw__meta-item">
						<span class="rcw__meta-label">{{ t('duplicatefinder', 'Peak Entropy / Custodian') }}</span>
						<span>
							{{ selectedGroup.maxEntropyBits !== null ? selectedGroup.maxEntropyBits.toFixed(2) + ' bits/B' : t('duplicatefinder', 'Not reported') }}
							/ {{ selectedGroup.primaryCustodian }}
						</span>
					</div>
				</div>

				<div
					v-if="selectedGroup.diagnoses.length > 0"
					class="rcw__diagnosis-box">
					<div class="rcw__panel-heading">
						{{ t('duplicatefinder', 'Forensic Anomaly Signals') }}
					</div>
					<ul class="rcw__diagnosis-list">
						<li
							v-for="(diag, dIdx) in selectedGroup.diagnoses"
							:key="dIdx">
							{{ diag }}
						</li>
					</ul>
				</div>

				<div class="rcw__verification-panel">
					<div class="rcw__panel-heading">
						{{ t('duplicatefinder', 'Admin Verification & Quarantine Gate') }}
					</div>
					<p class="rcw__panel-hint">
						{{ selectedGroup.bulkDeleteBlocked
							? t('duplicatefinder', 'Bulk deletion of the clean survivor is quarantined until an administrator logs forensic verification.')
							: t('duplicatefinder', 'This group is cleared or clean; you may lock it back into incident quarantine at any time.') }}
					</p>

					<div class="rcw__verification-grid">
						<label class="rcw__field">
							<span class="rcw__field-label">{{ t('duplicatefinder', 'Admin Verifier ID') }}</span>
							<input
								v-model="verifierIdInput"
								type="text"
								class="rcw__input rcw__short-input"
								:placeholder="t('duplicatefinder', 'sec-admin')">
						</label>

						<label class="rcw__field rcw__wide-field">
							<span class="rcw__field-label">{{ t('duplicatefinder', 'Forensic Verification Note') }}</span>
							<input
								v-model="verificationReasonInput"
								type="text"
								class="rcw__input"
								:placeholder="t('duplicatefinder', 'Verified clean original matches backup checksum')">
						</label>

						<button
							type="button"
							class="rcw__primary-btn"
							@click="verifySelectedGroup">
							<span>{{ t('duplicatefinder', 'Verify & Release Quarantine') }}</span>
						</button>

						<button
							v-if="!selectedGroup.manualLock"
							type="button"
							class="rcw__tool-btn is-danger-outline"
							@click="lockSelectedInQuarantine">
							<span>{{ t('duplicatefinder', 'Lock in Quarantine') }}</span>
						</button>

						<button
							v-else
							type="button"
							class="rcw__tool-btn"
							@click="unlockManualQuarantine">
							<span>{{ t('duplicatefinder', 'Clear Manual Lock') }}</span>
						</button>
					</div>

					<div
						v-if="selectedGroup.verifiedEntry"
						class="rcw__verified-banner">
						{{ t('duplicatefinder', 'Verified safe by {admin}: {reason}', {
							admin: selectedGroup.verifiedEntry.verifiedBy,
							reason: selectedGroup.verifiedEntry.reason,
						}) }}
					</div>
				</div>

				<div class="rcw__copies-list">
					<div class="rcw__panel-heading">
						{{ t('duplicatefinder', 'Copies & Survivor Shield Matrix ({count})', { count: selectedGroup.files.length }) }}
					</div>

					<div
						v-for="file in selectedGroup.files"
						:key="file.selectionKey"
						class="rcw__copy-card"
						:class="{
							'is-survivor': file.isProtectedSurvivor && file.fileRole === 'clean_candidate',
							'is-suspect': file.fileRole !== 'clean_candidate',
						}">
						<div class="rcw__copy-top">
							<span class="rcw__copy-path">{{ file.normalizedPath }}</span>
							<div class="rcw__copy-badges">
								<span
									v-if="file.isProtectedSurvivor && file.fileRole === 'clean_candidate'"
									class="rcw__copy-badge is-keep">
									{{ selectedGroup.bulkDeleteBlocked ? t('duplicatefinder', 'PROTECTED CLEAN SURVIVOR') : t('duplicatefinder', 'CLEAN SURVIVOR') }}
								</span>
								<span
									v-else-if="file.fileRole === 'canary_tripwire'"
									class="rcw__copy-badge is-danger">
									{{ t('duplicatefinder', 'CANARY TRIPWIRE') }}
								</span>
								<span
									v-else-if="file.fileRole === 'ransom_note'"
									class="rcw__copy-badge is-danger">
									{{ t('duplicatefinder', 'RANSOM NOTE') }}
								</span>
								<span
									v-else-if="file.fileRole === 'suspicious_encrypted'"
									class="rcw__copy-badge is-warn">
									{{ t('duplicatefinder', 'MUTATED / ENCRYPTED') }}
								</span>
								<span
									v-else
									class="rcw__copy-badge is-clean">
									{{ t('duplicatefinder', 'CLEAN COPY') }}
								</span>
							</div>
						</div>

						<div class="rcw__copy-meta">
							<span>{{ file.custodian }}</span>
							<span>{{ file.sizeFormatted }}</span>
							<span v-if="file.mtimeFormatted">{{ file.mtimeFormatted }}</span>
							<span v-if="file.entropyBits !== null">{{ file.entropyBits.toFixed(2) }} bits/B</span>
							<span v-if="file.signals.length > 0">{{ file.signals.map(formatSignalLabel).join(', ') }}</span>
						</div>
					</div>
				</div>

				<details class="rcw__script-box">
					<summary class="rcw__script-summary">
						{{ t('duplicatefinder', 'Non-Destructive Nextcloud occ Containment & Forensic Preservation Script') }}
					</summary>
					<div class="rcw__script-content">
						<pre class="rcw__code-pre"><code>{{ containmentScript }}</code></pre>
						<button
							type="button"
							class="rcw__tool-btn"
							@click="copyContainmentScript">
							<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
						</button>
					</div>
				</details>

				<details
					v-if="analysis.verificationLog.length > 0"
					class="rcw__script-box">
					<summary class="rcw__script-summary">
						{{ t('duplicatefinder', 'Admin Verification Clearance Log ({count})', { count: analysis.verificationLog.length }) }}
					</summary>
					<div class="rcw__audit-entries">
						<div
							v-for="entry in analysis.verificationLog"
							:key="entry.groupKey"
							class="rcw__audit-entry">
							<strong>{{ entry.incidentId }} / {{ entry.groupKey }}</strong>
							<span>{{ entry.verifiedBy }}: {{ entry.reason }}</span>
						</div>
					</div>
				</details>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	RANSOMWARE_CANARY_PRESETS,
	GUARD_FILTER_MODES,
	GUARD_SEVERITY_FILTERS,
	GUARD_SORT_MODES,
	sanitizeIncidentId,
	normalizeVerifiedRegistry,
	normalizeQuarantineRegistry,
	validateVerificationInput,
	evaluateRansomwareCanaryGuard,
	buildRansomwareContainmentScript,
	exportRansomwareGuardJson,
	exportRansomwareGuardCsv,
} from '../tools/ransomwareCanaryGuard'

const VERIFIED_STORAGE_KEY = 'duplicatefinder.ransomwareGuard.verifiedRegistry.v1'
const QUARANTINE_STORAGE_KEY = 'duplicatefinder.ransomwareGuard.quarantineRegistry.v1'

const SIGNAL_LABELS = Object.freeze({
	canary_tripwire: 'Canary Tripwire',
	ransom_note: 'Ransom Note',
	extension_drift: 'Extension Drift',
	ransomware_extension: 'Ransomware Suffix',
	double_extension_drift: 'Double-Extension Drift',
	high_entropy_anomaly: 'High-Entropy Spike',
	mime_mismatch: 'MIME Mismatch',
	mime_extension_mismatch: 'MIME Mismatch',
	burst_wave: 'Burst Wave',
	manual_quarantine: 'Manual Quarantine',
})

export default {
	name: 'RansomwareCanaryWorkbench',
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
			presetId: RANSOMWARE_CANARY_PRESETS[0].id,
			incidentIdInput: 'INC-2026-001',
			entropyThresholdInput: String(RANSOMWARE_CANARY_PRESETS[0].entropyThreshold),
			burstWindowInput: String(RANSOMWARE_CANARY_PRESETS[0].burstWindowMinutes),
			burstMinFilesInput: String(RANSOMWARE_CANARY_PRESETS[0].burstMinFiles),
			customPatternInput: '',
			quarantineBulkDelete: true,
			filterMode: 'all',
			severityFilter: 'all',
			sortMode: 'risk-score',
			searchQuery: '',
			visibleLimit: 25,
			selectedGroupKey: '',
			verifierIdInput: '',
			verificationReasonInput: '',
			verifiedRegistry: this.loadStoredVerifiedRegistry(),
			quarantineRegistry: this.loadStoredQuarantineRegistry(),
			statusNotice: '',
			statusNoticeType: 'success',
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
			return RANSOMWARE_CANARY_PRESETS
		},
		filterModes() {
			return GUARD_FILTER_MODES
		},
		severityFilters() {
			return GUARD_SEVERITY_FILTERS
		},
		sortModes() {
			return GUARD_SORT_MODES
		},
		parsedEntropyThreshold() {
			const parsed = Number(this.entropyThresholdInput)
			return Number.isFinite(parsed) && parsed >= 6.5 && parsed <= 8 ? parsed : 7.85
		},
		parsedBurstWindow() {
			const parsed = Number(this.burstWindowInput)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 15
		},
		parsedBurstMinFiles() {
			const parsed = Number(this.burstMinFilesInput)
			return Number.isFinite(parsed) && parsed >= 2 ? parsed : 3
		},
		analysis() {
			return evaluateRansomwareCanaryGuard(this.sourceDuplicates, {
				presetId: this.presetId,
				incidentId: this.incidentIdInput,
				entropyThreshold: this.parsedEntropyThreshold,
				burstWindowMinutes: this.parsedBurstWindow,
				burstMinFiles: this.parsedBurstMinFiles,
				quarantineBulkDelete: this.quarantineBulkDelete,
				customPattern: this.customPatternInput,
				filterMode: this.filterMode,
				severityFilter: this.severityFilter,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				verifiedRegistry: this.verifiedRegistry,
				quarantineRegistry: this.quarantineRegistry,
			})
		},
		visibleGroups() {
			return this.analysis.filteredGroups.slice(0, this.visibleLimit)
		},
		selectedGroup() {
			if (this.analysis.filteredGroups.length === 0) {
				return null
			}
			return this.analysis.filteredGroups.find(item => item.groupKey === this.selectedGroupKey)
				|| this.analysis.filteredGroups[0]
		},
		containmentScript() {
			return buildRansomwareContainmentScript(this.analysis)
		},
	},
	methods: {
		formatSignalLabel(signal) {
			return SIGNAL_LABELS[signal] || signal
		},
		loadStoredVerifiedRegistry() {
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					const raw = window.localStorage.getItem(VERIFIED_STORAGE_KEY)
					if (raw) {
						return normalizeVerifiedRegistry(JSON.parse(raw))
					}
				}
			} catch (error) {
				// Ignore storage parsing errors in restricted environments.
			}
			return {}
		},
		loadStoredQuarantineRegistry() {
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					const raw = window.localStorage.getItem(QUARANTINE_STORAGE_KEY)
					if (raw) {
						return normalizeQuarantineRegistry(JSON.parse(raw))
					}
				}
			} catch (error) {
				// Ignore storage parsing errors in restricted environments.
			}
			return {}
		},
		persistVerifiedRegistry(nextRegistry) {
			this.verifiedRegistry = nextRegistry
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(VERIFIED_STORAGE_KEY, JSON.stringify(nextRegistry))
				}
			} catch (error) {
				// Ignore quota errors in restricted environments.
			}
		},
		persistQuarantineRegistry(nextRegistry) {
			this.quarantineRegistry = nextRegistry
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(nextRegistry))
				}
			} catch (error) {
				// Ignore quota errors in restricted environments.
			}
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		applyPreset(nextPresetId) {
			const preset = RANSOMWARE_CANARY_PRESETS.find(item => item.id === nextPresetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.entropyThresholdInput = String(preset.entropyThreshold)
			this.burstWindowInput = String(preset.burstWindowMinutes)
			this.burstMinFilesInput = String(preset.burstMinFiles)
			this.quarantineBulkDelete = preset.quarantineBulkDelete
			this.setNotice(this.t('duplicatefinder', 'Applied canary guard preset: {name}', { name: preset.name }))
		},
		verifySelectedGroup() {
			if (!this.selectedGroup) {
				return
			}
			const validation = validateVerificationInput({
				verifierId: this.verifierIdInput,
				reason: this.verificationReasonInput,
			})
			if (!validation.valid) {
				this.setNotice(validation.errors[0], 'error')
				return
			}
			const nextQuarantine = { ...this.quarantineRegistry }
			delete nextQuarantine[this.selectedGroup.groupKey]
			this.persistQuarantineRegistry(nextQuarantine)

			const nextVerified = {
				...this.verifiedRegistry,
				[this.selectedGroup.groupKey]: {
					groupKey: this.selectedGroup.groupKey,
					incidentId: sanitizeIncidentId(this.incidentIdInput),
					verifiedBy: validation.verifierId,
					reason: validation.reason,
					verifiedAtIso: new Date().toISOString(),
				},
			}
			this.persistVerifiedRegistry(nextVerified)
			this.verificationReasonInput = ''
			this.setNotice(this.t('duplicatefinder', 'Verified safe and released quarantine for {title}', { title: this.selectedGroup.title }))
		},
		lockSelectedInQuarantine() {
			if (!this.selectedGroup) {
				return
			}
			const nextVerified = { ...this.verifiedRegistry }
			delete nextVerified[this.selectedGroup.groupKey]
			this.persistVerifiedRegistry(nextVerified)

			const nextQuarantine = {
				...this.quarantineRegistry,
				[this.selectedGroup.groupKey]: {
					groupKey: this.selectedGroup.groupKey,
					incidentId: sanitizeIncidentId(this.incidentIdInput),
					lockedBy: (this.verifierIdInput || '').trim() || 'sec-admin',
					reason: (this.verificationReasonInput || '').trim() || 'Manual incident quarantine lock',
					lockedAtIso: new Date().toISOString(),
				},
			}
			this.persistQuarantineRegistry(nextQuarantine)
			this.setNotice(this.t('duplicatefinder', 'Locked {title} inside incident quarantine', { title: this.selectedGroup.title }))
		},
		unlockManualQuarantine() {
			if (!this.selectedGroup) {
				return
			}
			const nextQuarantine = { ...this.quarantineRegistry }
			delete nextQuarantine[this.selectedGroup.groupKey]
			this.persistQuarantineRegistry(nextQuarantine)
			this.setNotice(this.t('duplicatefinder', 'Cleared manual quarantine lock on {title}', { title: this.selectedGroup.title }))
		},
		downloadTextFile(filename, content, mimeType) {
			if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
				return
			}
			const blob = new Blob([content], { type: mimeType })
			const href = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = href
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			URL.revokeObjectURL(href)
		},
		exportIncidentJson() {
			const json = exportRansomwareGuardJson(this.analysis)
			const incident = this.analysis.policy.incidentId.toLowerCase()
			this.downloadTextFile(`ransomware-canary-report-${incident}.json`, json, 'application/json;charset=utf-8')
			this.setNotice(this.t('duplicatefinder', 'Exported ransomware canary guard report JSON'))
		},
		exportAnomalyCsv() {
			const csv = exportRansomwareGuardCsv(this.analysis)
			const incident = this.analysis.policy.incidentId.toLowerCase()
			this.downloadTextFile(`ransomware-canary-ledger-${incident}.csv`, csv, 'text/csv;charset=utf-8')
			this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236 ransomware canary ledger CSV'))
		},
		async copyContainmentScript() {
			const copied = await copyTextSafely(this.containmentScript)
			if (copied) {
				this.setNotice(this.t('duplicatefinder', 'Copied Nextcloud occ containment script to clipboard'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the occ script panel below to copy manually'), 'error')
			}
		},
	},
}
</script>

<style scoped>
.ransomware-canary-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	max-inline-size: 100%;
	min-inline-size: 0;
}

.rcw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.rcw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.rcw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.rcw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
}

.rcw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rcw__tool-btn,
.rcw__seg-btn,
.rcw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.rcw__tool-btn:focus-visible,
.rcw__seg-btn:focus-visible,
.rcw__primary-btn:focus-visible,
.rcw__input:focus-visible,
.rcw__select:focus-visible,
.rcw__group-card:focus-visible,
.rcw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #00679e);
	outline-offset: 2px;
}

.rcw__tool-btn:disabled,
.rcw__seg-btn:disabled {
	opacity: 0.48;
	cursor: not-allowed;
}

.rcw__seg-btn.is-active,
.rcw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rcw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.rcw__tool-btn.is-danger-outline {
	border-color: #b42318;
	background-color: #fdecea;
	color: #842029;
}

.rcw__notice {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	font-weight: 600;
	font-size: 0.86rem;
}

.rcw__notice.is-success {
	border-color: #1c7c45;
	background-color: #e9f7ef;
	color: #0f5132;
}

.rcw__notice.is-error {
	border-color: #b42318;
	background-color: #fdecea;
	color: #7a1c15;
}

.rcw__empty-banner {
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

.rcw__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.rcw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.92rem;
}

.rcw__empty-hint {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.84rem;
	max-inline-size: 68ch;
}

.rcw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.rcw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.rcw__inputs-row {
	align-items: flex-end;
}

.rcw__control-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.rcw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rcw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.rcw__wide-field {
	flex: 1 1 220px;
}

.rcw__search-field {
	flex: 1 1 200px;
}

.rcw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.rcw__input,
.rcw__select {
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

.rcw__num-input {
	inline-size: 112px;
}

.rcw__short-input {
	inline-size: 140px;
}

.rcw__med-input {
	inline-size: 170px;
}

.rcw__summary-deck {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 640px) {
	.rcw__summary-deck {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1080px) {
	.rcw__summary-deck {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.rcw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rcw__kpi-card.is-highlight {
	border-color: #9dd6b4;
	background-color: #e7f6ec;
	color: #0f5132;
}

.rcw__kpi-card.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.rcw__kpi-card.is-danger {
	border-color: #f1aeb5;
	background-color: #fdecea;
	color: #842029;
}

.rcw__kpi-label {
	font-size: 0.78rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.rcw__kpi-card.is-highlight .rcw__kpi-label,
.rcw__kpi-card.is-highlight .rcw__kpi-sub {
	color: #0f5132;
}

.rcw__kpi-card.is-warn .rcw__kpi-label,
.rcw__kpi-card.is-warn .rcw__kpi-sub {
	color: #7c4a03;
}

.rcw__kpi-card.is-danger .rcw__kpi-label,
.rcw__kpi-card.is-danger .rcw__kpi-sub {
	color: #842029;
}

.rcw__kpi-val {
	font-size: 1.12rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rcw__kpi-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rcw__burst-banner {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 10px 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f1aeb5;
	background-color: #fdecea;
	color: #842029;
	font-size: 0.86rem;
}

.rcw__filter-bar {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.rcw__filter-inputs {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
}

.rcw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.rcw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.rcw__list-col {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.rcw__empty-list {
	padding: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	color: var(--color-text-maxcontrast);
	text-align: center;
}

.rcw__group-card {
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

.rcw__group-card:hover {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.rcw__group-card.is-selected {
	border-color: var(--color-primary-element);
	box-shadow: inset 3px 0 0 var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rcw__group-card.is-sev-critical {
	border-inline-end: 3px solid #b42318;
}

.rcw__group-card.is-sev-high {
	border-inline-end: 3px solid #b45309;
}

.rcw__group-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
}

.rcw__status-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.rcw__status-pill.is-quarantined,
.rcw__status-pill.is-hold-all {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.rcw__status-pill.is-verified-safe {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.rcw__status-pill.is-clean {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.rcw__risk-pill {
	font-weight: 700;
}

.rcw__group-title {
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.rcw__group-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.rcw__group-signals {
	font-family: monospace;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rcw__inspector-col {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rcw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.rcw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.rcw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rcw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rcw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rcw__forensic-meta {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.rcw__forensic-meta {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.rcw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.rcw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.rcw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.rcw__diagnosis-box,
.rcw__verification-panel,
.rcw__copies-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.rcw__diagnosis-list {
	margin: 0;
	padding-inline-start: 18px;
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.84rem;
}

.rcw__panel-heading {
	font-size: 0.86rem;
	font-weight: 700;
}

.rcw__panel-hint {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.rcw__verification-grid {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px;
}

.rcw__verified-banner {
	padding: 8px 10px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.82rem;
	font-weight: 600;
}

.rcw__copy-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rcw__copy-card.is-survivor {
	border-color: #9dd6b4;
	background-color: #f3fbf6;
}

.rcw__copy-card.is-suspect {
	border-color: #f1aeb5;
	background-color: #fff6f6;
}

.rcw__copy-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rcw__copy-path {
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.rcw__copy-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.rcw__copy-badge {
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.rcw__copy-badge.is-keep,
.rcw__copy-badge.is-clean {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.rcw__copy-badge.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.rcw__copy-badge.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.rcw__copy-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.rcw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.rcw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.rcw__script-content {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block-start: 8px;
}

.rcw__code-pre {
	margin: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-x: auto;
	max-block-size: 280px;
}

.rcw__audit-entries {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.rcw__audit-entry {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-size: 0.8rem;
}

.rcw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
