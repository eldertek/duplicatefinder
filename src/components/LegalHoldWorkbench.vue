<template>
	<section
		class="legal-hold-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Compliance Legal Hold, Evidence Freeze and E-Discovery Guard')">
		<header class="lhw__toolbar">
			<div class="lhw__title-group">
				<h3 class="lhw__title">
					{{ t('duplicatefinder', 'Compliance Legal Hold, Evidence Freeze & E-Discovery Guard') }}
				</h3>
				<span
					class="lhw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{matter} / {protected} held / {frozen} frozen / {reclaimable} releasable', {
						matter: analysis.policy.matterId,
						protected: analysis.summary.protectedGroupsCount,
						frozen: analysis.summary.hardFrozenCount,
						reclaimable: analysis.summary.safeReclaimableBytesFormatted,
					}) }}
				</span>
			</div>

			<div class="lhw__toolbar-actions">
				<button
					type="button"
					class="lhw__tool-btn is-primary-outline"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export Manifest JSON') }}</span>
				</button>
				<button
					type="button"
					class="lhw__tool-btn"
					:disabled="analysis.groups.length === 0"
					@click="exportCustodyCsv">
					<span>{{ t('duplicatefinder', 'Export Custody CSV') }}</span>
				</button>
				<button
					type="button"
					class="lhw__tool-btn"
					@click="copyOccHoldScript">
					<span>{{ t('duplicatefinder', 'Copy occ Hold Script') }}</span>
				</button>
				<button
					type="button"
					class="lhw__tool-btn is-close"
					aria-keyshortcuts="!"
					:title="t('duplicatefinder', 'Hide legal hold and evidence freeze guard')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Legal Hold') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="lhw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="lhw__empty-banner"
			role="note">
			<div class="lhw__empty-text">
				<p class="lhw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure legal matter policies before scanning') }}
				</p>
				<p class="lhw__empty-hint">
					{{ t('duplicatefinder', 'Define your Matter ID, statutory domains, and freeze rules now, then run a scan to lock financial, contract, GDPR, and regulatory duplicates.') }}
				</p>
			</div>
			<button
				type="button"
				class="lhw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="lhw__controls">
			<div class="lhw__control-row">
				<span class="lhw__control-label">{{ t('duplicatefinder', 'Preset') }}</span>
				<div
					class="lhw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Legal hold presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="lhw__seg-btn"
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
				class="lhw__control-row">
				<span class="lhw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
				<div
					class="lhw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
					<button
						type="button"
						class="lhw__seg-btn"
						:class="{ 'is-active': scope === 'filtered' }"
						:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
						@click="scope = 'filtered'">
						<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
					</button>
					<button
						type="button"
						class="lhw__seg-btn"
						:class="{ 'is-active': scope === 'all' }"
						:aria-pressed="scope === 'all' ? 'true' : 'false'"
						@click="scope = 'all'">
						<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
					</button>
				</div>

				<button
					type="button"
					class="lhw__seg-btn"
					:class="{ 'is-active': blockBulkAutoSelect }"
					:aria-pressed="blockBulkAutoSelect ? 'true' : 'false'"
					@click="blockBulkAutoSelect = !blockBulkAutoSelect">
					<span>{{ blockBulkAutoSelect ? t('duplicatefinder', 'Bulk Hold Guard: ON') : t('duplicatefinder', 'Bulk Hold Guard: OFF') }}</span>
				</button>
			</div>

			<div class="lhw__control-row">
				<span class="lhw__control-label">{{ t('duplicatefinder', 'Domains') }}</span>
				<div
					class="lhw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Compliance hold domains')">
					<button
						v-for="domain in domainDefinitions"
						:key="domain.id"
						type="button"
						class="lhw__seg-btn"
						:class="{ 'is-active': enabledDomains.includes(domain.id) }"
						:aria-pressed="enabledDomains.includes(domain.id) ? 'true' : 'false'"
						:title="domain.description"
						@click="toggleDomain(domain.id)">
						<span>{{ domain.label }}</span>
					</button>
				</div>
			</div>

			<div class="lhw__control-row lhw__inputs-row">
				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Matter ID') }}</span>
					<input
						v-model="matterIdInput"
						type="text"
						class="lhw__input lhw__med-input"
						:placeholder="t('duplicatefinder', 'MATTER-2026-001')">
				</label>

				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Custody Keep Rule') }}</span>
					<select
						v-model="keepRule"
						class="lhw__select">
						<option
							v-for="strategy in keepStrategies"
							:key="strategy.id"
							:value="strategy.id">
							{{ strategy.label }}
						</option>
					</select>
				</label>

				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Preferred Custodian') }}</span>
					<input
						v-model="preferredCustodianInput"
						type="text"
						class="lhw__input lhw__short-input"
						:placeholder="t('duplicatefinder', 'legal-vault')">
				</label>

				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Retention Floor (days)') }}</span>
					<input
						v-model="minRetentionDaysInput"
						type="number"
						min="1"
						max="36500"
						class="lhw__input lhw__num-input">
				</label>

				<label class="lhw__field lhw__wide-field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Custom Matter Pattern (regex/path)') }}</span>
					<input
						v-model="customPatternInput"
						type="text"
						class="lhw__input"
						:placeholder="t('duplicatefinder', 'e.g. /case-409/|msa-2026')">
				</label>
			</div>
		</div>

		<div class="lhw__summary-deck">
			<div class="lhw__kpi-card is-warn">
				<span class="lhw__kpi-label">{{ t('duplicatefinder', 'Protected Groups') }}</span>
				<strong class="lhw__kpi-val">{{ analysis.summary.protectedGroupsCount }} / {{ analysis.summary.totalGroups }}</strong>
				<span class="lhw__kpi-sub">
					{{ t('duplicatefinder', '{copies} duplicate copies blocked from bulk delete', { copies: analysis.summary.blockedCopiesCount }) }}
				</span>
			</div>

			<div class="lhw__kpi-card is-danger">
				<span class="lhw__kpi-label">{{ t('duplicatefinder', 'Frozen Evidence Volume') }}</span>
				<strong class="lhw__kpi-val">{{ analysis.summary.protectedBytesFormatted }}</strong>
				<span class="lhw__kpi-sub">
					{{ t('duplicatefinder', '{count} policy-held / {frozen} immutable locks', {
						count: analysis.summary.policyProtectedCount,
						frozen: analysis.summary.hardFrozenCount,
					}) }}
				</span>
			</div>

			<div class="lhw__kpi-card">
				<span class="lhw__kpi-label">{{ t('duplicatefinder', 'Override Audit Trail') }}</span>
				<strong class="lhw__kpi-val">{{ analysis.overrideAuditLog.length }}</strong>
				<span class="lhw__kpi-sub">
					{{ t('duplicatefinder', '{count} group(s) released via logged counsel override', { count: analysis.summary.overrideLoggedCount }) }}
				</span>
			</div>

			<div class="lhw__kpi-card is-highlight">
				<span class="lhw__kpi-label">{{ t('duplicatefinder', 'Safe Releasable Waste') }}</span>
				<strong class="lhw__kpi-val">{{ analysis.summary.safeReclaimableBytesFormatted }}</strong>
				<span class="lhw__kpi-sub">
					{{ t('duplicatefinder', '{groups} groups / {copies} non-held copies', {
						groups: analysis.summary.releasableGroupsCount,
						copies: analysis.summary.releasableCopiesCount,
					}) }}
				</span>
			</div>
		</div>

		<div class="lhw__filter-bar">
			<div
				class="lhw__segments"
				role="tablist"
				:aria-label="t('duplicatefinder', 'Filter duplicate groups by legal hold status')">
				<button
					v-for="mode in filterModes"
					:key="mode.id"
					type="button"
					role="tab"
					class="lhw__seg-btn"
					:class="{ 'is-active': filterMode === mode.id }"
					:aria-selected="filterMode === mode.id ? 'true' : 'false'"
					@click="filterMode = mode.id">
					<span>{{ mode.label }}</span>
				</button>
			</div>

			<div class="lhw__filter-inputs">
				<label class="lhw__field lhw__search-field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Search path, hash, or custody ID') }}</span>
					<input
						v-model="searchQuery"
						type="search"
						class="lhw__input"
						:placeholder="t('duplicatefinder', 'Filter by filename, matter, custodian...')">
				</label>

				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Domain Filter') }}</span>
					<select
						v-model="domainFilter"
						class="lhw__select">
						<option value="all">{{ t('duplicatefinder', 'All domains') }}</option>
						<option
							v-for="domain in domainDefinitions"
							:key="domain.id"
							:value="domain.id">
							{{ domain.label }} ({{ analysis.summary.domainCounts[domain.id] || 0 }})
						</option>
					</select>
				</label>

				<label class="lhw__field">
					<span class="lhw__field-label">{{ t('duplicatefinder', 'Sort By') }}</span>
					<select
						v-model="sortMode"
						class="lhw__select">
						<option
							v-for="sortOpt in sortModes"
							:key="sortOpt.id"
							:value="sortOpt.id">
							{{ sortOpt.label }}
						</option>
					</select>
				</label>

				<button
					v-if="analysis.summary.policyProtectedCount > 0"
					type="button"
					class="lhw__tool-btn"
					@click="freezeAllPolicyMatched">
					<span>{{ t('duplicatefinder', 'Lock All Policy Matches') }}</span>
				</button>
			</div>
		</div>

		<div class="lhw__workspace">
			<div class="lhw__list-col">
				<div
					v-if="visibleGroups.length === 0"
					class="lhw__empty-list">
					{{ t('duplicatefinder', 'No duplicate groups match the current legal hold filter.') }}
				</div>

				<button
					v-for="group in visibleGroups"
					:key="group.groupKey"
					type="button"
					class="lhw__group-card"
					:class="{
						'is-selected': selectedGroup && selectedGroup.groupKey === group.groupKey,
						'is-frozen': group.status === 'frozen-immutable',
						'is-protected': group.status === 'policy-protected',
					}"
					@click="selectedGroupKey = group.groupKey">
					<div class="lhw__group-top">
						<span
							class="lhw__status-pill"
							:class="'is-' + group.status">
							{{ group.statusLabel }}
						</span>
						<span class="lhw__group-bytes">{{ group.isProtected ? group.protectedBytesFormatted : group.wasteBytesFormatted }}</span>
					</div>
					<div class="lhw__group-title">
						{{ group.title }}
					</div>
					<div class="lhw__group-meta">
						<span>{{ group.primaryDomainLabel }}</span>
						<span>{{ group.primaryCustodian }}</span>
						<span>{{ t('duplicatefinder', '{count} copies', { count: group.copyCount }) }}</span>
					</div>
					<div class="lhw__group-digest">
						{{ group.custodyFingerprint }}
					</div>
				</button>

				<div
					v-if="analysis.filteredGroups.length > visibleLimit"
					class="lhw__load-more-wrap">
					<button
						type="button"
						class="lhw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: analysis.filteredGroups.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedGroup"
				class="lhw__inspector-col"
				role="region"
				:aria-label="t('duplicatefinder', 'Selected group custody chain and freeze controls')">
				<div class="lhw__inspector-header">
					<div class="lhw__inspector-title-wrap">
						<h4 class="lhw__inspector-title">
							{{ selectedGroup.title }}
						</h4>
						<span class="lhw__inspector-sub">
							{{ selectedGroup.matterId }} / {{ selectedGroup.custodyFingerprint }}
						</span>
					</div>
					<div class="lhw__inspector-actions">
						<button
							type="button"
							class="lhw__tool-btn"
							@click="$emit('select-duplicate', selectedGroup.rawGroup)">
							<span>{{ t('duplicatefinder', 'Focus in List') }}</span>
						</button>
						<button
							v-if="selectedGroup.copyCount > 1"
							type="button"
							class="lhw__tool-btn"
							@click="$emit('compare-duplicate', selectedGroup.rawGroup)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</div>

				<div class="lhw__custody-meta">
					<div class="lhw__meta-item">
						<span class="lhw__meta-label">{{ t('duplicatefinder', 'Evidence Status') }}</span>
						<strong>{{ selectedGroup.statusLabel }}</strong>
					</div>
					<div class="lhw__meta-item">
						<span class="lhw__meta-label">{{ t('duplicatefinder', 'Keep Candidate') }}</span>
						<span class="lhw__mono-text">{{ selectedGroup.survivorPath }}</span>
					</div>
					<div class="lhw__meta-item">
						<span class="lhw__meta-label">{{ t('duplicatefinder', 'Custodians') }}</span>
						<span>{{ selectedGroup.custodians.join(', ') }}</span>
					</div>
					<div class="lhw__meta-item">
						<span class="lhw__meta-label">{{ t('duplicatefinder', 'Compliance Signals') }}</span>
						<span>{{ selectedGroup.matchedSignals.length > 0 ? selectedGroup.matchedSignals.join('; ') : t('duplicatefinder', 'None detected') }}</span>
					</div>
				</div>

				<div class="lhw__freeze-panel">
					<div class="lhw__panel-heading">
						{{ t('duplicatefinder', 'Immutable Evidence Freeze Lock') }}
					</div>
					<div class="lhw__freeze-row">
						<label class="lhw__field lhw__wide-field">
							<span class="lhw__field-label">{{ t('duplicatefinder', 'Hold Reason / Case Reference') }}</span>
							<input
								v-model="freezeReasonInput"
								type="text"
								class="lhw__input"
								:placeholder="t('duplicatefinder', 'e.g. Regulatory audit subpoena #2026-88')">
						</label>
						<button
							v-if="!selectedGroup.isHardImmutable"
							type="button"
							class="lhw__primary-btn"
							@click="freezeSelectedGroup">
							<span>{{ t('duplicatefinder', 'Freeze Immutable Evidence') }}</span>
						</button>
						<button
							v-else
							type="button"
							class="lhw__tool-btn is-danger-outline"
							@click="unfreezeSelectedGroup">
							<span>{{ t('duplicatefinder', 'Unfreeze Evidence Lock') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedGroup.isPolicyMatch || selectedGroup.overrideEntry"
					class="lhw__override-panel">
					<div class="lhw__panel-heading">
						{{ t('duplicatefinder', 'Counsel Exception Override Log') }}
					</div>
					<p class="lhw__panel-hint">
						{{ selectedGroup.isHardImmutable
							? t('duplicatefinder', 'Hard-immutable freeze lock active. Unfreeze lock before logging a counsel override.')
							: t('duplicatefinder', 'Release a non-immutable policy-held group for deduplication by logging an approver ID and justification (>= 8 chars).') }}
					</p>
					<div class="lhw__override-grid">
						<label class="lhw__field">
							<span class="lhw__field-label">{{ t('duplicatefinder', 'Approver / Counsel ID') }}</span>
							<input
								v-model="overrideApproverInput"
								type="text"
								class="lhw__input"
								:disabled="selectedGroup.isHardImmutable"
								:placeholder="t('duplicatefinder', 'counsel-01')">
						</label>
						<label class="lhw__field lhw__wide-field">
							<span class="lhw__field-label">{{ t('duplicatefinder', 'Override Justification') }}</span>
							<input
								v-model="overrideReasonInput"
								type="text"
								class="lhw__input"
								:disabled="selectedGroup.isHardImmutable"
								:placeholder="t('duplicatefinder', 'Superseded draft cleared by legal review')">
						</label>
						<button
							type="button"
							class="lhw__tool-btn"
							:disabled="selectedGroup.isHardImmutable"
							@click="submitExceptionOverride">
							<span>{{ t('duplicatefinder', 'Log Exception Override') }}</span>
						</button>
					</div>
				</div>

				<div class="lhw__copies-list">
					<div class="lhw__panel-heading">
						{{ t('duplicatefinder', 'Custody Copy Breakdown ({count})', { count: selectedGroup.files.length }) }}
					</div>
					<div
						v-for="file in selectedGroup.files"
						:key="file.selectionKey || file.normalizedPath"
						class="lhw__copy-card"
						:class="{ 'is-survivor': file.isSurvivor }">
						<div class="lhw__copy-top">
							<span class="lhw__copy-path">{{ file.normalizedPath }}</span>
							<span class="lhw__copy-badges">
								<span
									v-if="file.isSurvivor"
									class="lhw__copy-badge is-keep">
									{{ t('duplicatefinder', 'Keep Anchor') }}
								</span>
								<span
									v-else-if="selectedGroup.isProtected"
									class="lhw__copy-badge is-held">
									{{ t('duplicatefinder', 'Hold Protected') }}
								</span>
								<span
									v-else
									class="lhw__copy-badge is-release">
									{{ t('duplicatefinder', 'Releasable') }}
								</span>
								<span
									v-if="file.isSignedArtifact"
									class="lhw__copy-badge is-signed">
									{{ t('duplicatefinder', 'Signed') }}
								</span>
							</span>
						</div>
						<div class="lhw__copy-meta">
							<span>{{ t('duplicatefinder', 'Custodian: {name}', { name: file.custodian }) }}</span>
							<span>{{ file.sizeFormatted }}</span>
							<span v-if="file.modifiedFormatted">{{ file.modifiedFormatted }}</span>
						</div>
					</div>
				</div>

				<details class="lhw__script-box">
					<summary class="lhw__script-summary">
						{{ t('duplicatefinder', 'Nextcloud occ Hold Script & Override Audit Trail ({count})', { count: analysis.overrideAuditLog.length }) }}
					</summary>
					<div class="lhw__script-content">
						<pre class="lhw__code-pre"><code>{{ occHoldScript }}</code></pre>
						<div
							v-if="analysis.overrideAuditLog.length > 0"
							class="lhw__audit-entries">
							<div
								v-for="entry in analysis.overrideAuditLog"
								:key="entry.id"
								class="lhw__audit-entry">
								<strong>{{ entry.matterId }} / {{ entry.approverId }}</strong>
								<span>{{ entry.reason }}</span>
								<span class="lhw__mono-text">{{ entry.timestampIso }} ({{ entry.groupKey }})</span>
							</div>
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
	HOLD_FILTER_MODES,
	HOLD_KEEP_STRATEGIES,
	HOLD_SORT_MODES,
	LEGAL_HOLD_DOMAINS,
	LEGAL_HOLD_PRESETS,
	buildLegalHoldOccScript,
	evaluateLegalHoldGuard,
	exportLegalHoldCustodyCsv,
	exportLegalHoldManifestJson,
	normalizeFreezeRegistry,
	normalizeOverrideLog,
	sanitizeMatterId,
	validateExceptionOverrideInput,
} from '../tools/legalHoldGuard'

const FREEZE_STORAGE_KEY = 'duplicatefinder.legalHold.freezeRegistry.v1'
const OVERRIDE_STORAGE_KEY = 'duplicatefinder.legalHold.overrideAuditLog.v1'

export default {
	name: 'LegalHoldWorkbench',
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
			presetId: 'litigation-hold',
			matterIdInput: 'MATTER-2026-001',
			enabledDomains: [...LEGAL_HOLD_PRESETS[0].enabledDomains],
			keepRule: LEGAL_HOLD_PRESETS[0].keepRule,
			preferredCustodianInput: '',
			minRetentionDaysInput: String(LEGAL_HOLD_PRESETS[0].minRetentionDays),
			customPatternInput: '',
			blockBulkAutoSelect: true,
			filterMode: 'all',
			domainFilter: 'all',
			sortMode: 'protected-bytes',
			searchQuery: '',
			visibleLimit: 25,
			selectedGroupKey: '',
			freezeReasonInput: '',
			overrideApproverInput: '',
			overrideReasonInput: '',
			freezeRegistry: this.loadStoredFreezeRegistry(),
			overrideAuditLog: this.loadStoredOverrideLog(),
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
			return LEGAL_HOLD_PRESETS
		},
		domainDefinitions() {
			return LEGAL_HOLD_DOMAINS
		},
		keepStrategies() {
			return HOLD_KEEP_STRATEGIES
		},
		filterModes() {
			return HOLD_FILTER_MODES
		},
		sortModes() {
			return HOLD_SORT_MODES
		},
		parsedRetentionDays() {
			const parsed = Number(this.minRetentionDaysInput)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 3650
		},
		analysis() {
			return evaluateLegalHoldGuard(this.sourceDuplicates, {
				presetId: this.presetId,
				matterId: this.matterIdInput,
				enabledDomains: this.enabledDomains,
				keepRule: this.keepRule,
				preferredCustodian: this.preferredCustodianInput,
				customPattern: this.customPatternInput,
				minRetentionDays: this.parsedRetentionDays,
				blockBulkAutoSelect: this.blockBulkAutoSelect,
				filterMode: this.filterMode,
				domainFilter: this.domainFilter,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				freezeRegistry: this.freezeRegistry,
				overrideLog: this.overrideAuditLog,
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
		occHoldScript() {
			return buildLegalHoldOccScript(this.analysis)
		},
	},
	methods: {
		loadStoredFreezeRegistry() {
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					const raw = window.localStorage.getItem(FREEZE_STORAGE_KEY)
					if (raw) {
						return normalizeFreezeRegistry(JSON.parse(raw))
					}
				}
			} catch (error) {
				// Ignore storage parsing issues in restricted environments.
			}
			return {}
		},
		loadStoredOverrideLog() {
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					const raw = window.localStorage.getItem(OVERRIDE_STORAGE_KEY)
					if (raw) {
						return normalizeOverrideLog(JSON.parse(raw))
					}
				}
			} catch (error) {
				// Ignore storage parsing issues in restricted environments.
			}
			return []
		},
		persistFreezeRegistry(nextRegistry) {
			this.freezeRegistry = nextRegistry
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(FREEZE_STORAGE_KEY, JSON.stringify(nextRegistry))
				}
			} catch (error) {
				// Ignore quota errors in restricted environments.
			}
		},
		persistOverrideLog(nextLog) {
			this.overrideAuditLog = nextLog
			try {
				if (typeof window !== 'undefined' && window.localStorage) {
					window.localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify(nextLog))
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
			const preset = LEGAL_HOLD_PRESETS.find(item => item.id === nextPresetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.enabledDomains = [...preset.enabledDomains]
			this.keepRule = preset.keepRule
			this.minRetentionDaysInput = String(preset.minRetentionDays)
			this.blockBulkAutoSelect = preset.blockBulkAutoSelect
			this.setNotice(this.t('duplicatefinder', 'Applied legal hold preset: {name}', { name: preset.name }))
		},
		toggleDomain(domainId) {
			if (this.enabledDomains.includes(domainId)) {
				this.enabledDomains = this.enabledDomains.filter(item => item !== domainId)
			} else {
				this.enabledDomains = [...this.enabledDomains, domainId]
			}
		},
		freezeSelectedGroup() {
			if (!this.selectedGroup) {
				return
			}
			const nextRegistry = {
				...this.freezeRegistry,
				[this.selectedGroup.groupKey]: {
					groupKey: this.selectedGroup.groupKey,
					matterId: sanitizeMatterId(this.matterIdInput),
					custodian: this.selectedGroup.primaryCustodian,
					holdReason: (this.freezeReasonInput || '').trim() || 'Immutable legal evidence freeze',
					frozenBy: 'compliance-officer',
					frozenAtIso: new Date().toISOString(),
					immutable: true,
				},
			}
			this.persistFreezeRegistry(nextRegistry)
			this.freezeReasonInput = ''
			this.setNotice(this.t('duplicatefinder', 'Frozen immutable evidence lock on {title}', { title: this.selectedGroup.title }))
		},
		unfreezeSelectedGroup() {
			if (!this.selectedGroup) {
				return
			}
			const nextRegistry = { ...this.freezeRegistry }
			delete nextRegistry[this.selectedGroup.groupKey]
			this.persistFreezeRegistry(nextRegistry)
			this.setNotice(this.t('duplicatefinder', 'Released immutable evidence lock on {title}', { title: this.selectedGroup.title }))
		},
		freezeAllPolicyMatched() {
			const nextRegistry = { ...this.freezeRegistry }
			const matterId = sanitizeMatterId(this.matterIdInput)
			let added = 0
			for (const group of this.analysis.groups) {
				if (group.isPolicyMatch && !nextRegistry[group.groupKey]) {
					nextRegistry[group.groupKey] = {
						groupKey: group.groupKey,
						matterId,
						custodian: group.primaryCustodian,
						holdReason: `Bulk policy freeze (${matterId})`,
						frozenBy: 'compliance-officer',
						frozenAtIso: new Date().toISOString(),
						immutable: true,
					}
					added += 1
				}
			}
			this.persistFreezeRegistry(nextRegistry)
			this.setNotice(this.t('duplicatefinder', 'Locked {count} policy-matched group(s) as immutable evidence', { count: added }))
		},
		submitExceptionOverride() {
			if (!this.selectedGroup) {
				return
			}
			const validation = validateExceptionOverrideInput({
				approverId: this.overrideApproverInput,
				reason: this.overrideReasonInput,
				isHardImmutable: this.selectedGroup.isHardImmutable,
			})
			if (!validation.valid) {
				this.setNotice(validation.errors[0], 'error')
				return
			}
			const entry = {
				id: `ovr-${Date.now()}-${this.overrideAuditLog.length + 1}`,
				groupKey: this.selectedGroup.groupKey,
				groupId: this.selectedGroup.groupId,
				hash: this.selectedGroup.hash,
				matterId: sanitizeMatterId(this.matterIdInput),
				approverId: validation.approverId,
				reason: validation.reason,
				timestampIso: new Date().toISOString(),
				affectedPaths: this.selectedGroup.files.map(file => file.normalizedPath),
			}
			this.persistOverrideLog([...this.overrideAuditLog, entry])
			this.overrideReasonInput = ''
			this.setNotice(this.t('duplicatefinder', 'Logged counsel exception override by {approver}', { approver: validation.approverId }))
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
		exportManifestJson() {
			const json = exportLegalHoldManifestJson(this.analysis)
			const matter = this.analysis.policy.matterId.toLowerCase()
			this.downloadTextFile(`legal-hold-manifest-${matter}.json`, json, 'application/json;charset=utf-8')
			this.setNotice(this.t('duplicatefinder', 'Exported e-discovery hold manifest JSON'))
		},
		exportCustodyCsv() {
			const csv = exportLegalHoldCustodyCsv(this.analysis)
			const matter = this.analysis.policy.matterId.toLowerCase()
			this.downloadTextFile(`legal-hold-custody-${matter}.csv`, csv, 'text/csv;charset=utf-8')
			this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236 custody ledger CSV'))
		},
		async copyOccHoldScript() {
			const copied = await copyTextSafely(this.occHoldScript)
			if (copied) {
				this.setNotice(this.t('duplicatefinder', 'Copied Nextcloud occ legal hold script to clipboard'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the occ script panel below to copy manually'), 'error')
			}
		},
	},
}
</script>

<style scoped>
.legal-hold-workbench {
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

.lhw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.lhw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.lhw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.lhw__status-badge {
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

.lhw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.lhw__tool-btn,
.lhw__seg-btn,
.lhw__primary-btn {
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

.lhw__tool-btn:focus-visible,
.lhw__seg-btn:focus-visible,
.lhw__primary-btn:focus-visible,
.lhw__input:focus-visible,
.lhw__select:focus-visible,
.lhw__group-card:focus-visible,
.lhw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #00679e);
	outline-offset: 2px;
}

.lhw__tool-btn:disabled,
.lhw__seg-btn:disabled {
	opacity: 0.48;
	cursor: not-allowed;
}

.lhw__seg-btn.is-active,
.lhw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.lhw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.lhw__tool-btn.is-danger-outline {
	border-color: #b42318;
	background-color: #fdecea;
	color: #842029;
}

.lhw__notice {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	font-weight: 600;
	font-size: 0.86rem;
}

.lhw__notice.is-success {
	border-color: #1c7c45;
	background-color: #e9f7ef;
	color: #0f5132;
}

.lhw__notice.is-error {
	border-color: #b42318;
	background-color: #fdecea;
	color: #7a1c15;
}

.lhw__empty-banner {
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

.lhw__empty-text {
	min-inline-size: 0;
	flex: 1 1 260px;
}

.lhw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.92rem;
}

.lhw__empty-hint {
	margin: 4px 0 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.84rem;
	max-inline-size: 68ch;
}

.lhw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.lhw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.lhw__inputs-row {
	align-items: flex-end;
}

.lhw__control-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.lhw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.lhw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.lhw__wide-field {
	flex: 1 1 220px;
}

.lhw__search-field {
	flex: 1 1 200px;
}

.lhw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.lhw__input,
.lhw__select {
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

.lhw__num-input {
	inline-size: 112px;
}

.lhw__short-input {
	inline-size: 140px;
}

.lhw__med-input {
	inline-size: 170px;
}

.lhw__summary-deck {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 640px) {
	.lhw__summary-deck {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1080px) {
	.lhw__summary-deck {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.lhw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.lhw__kpi-card.is-highlight {
	border-color: #9dd6b4;
	background-color: #e7f6ec;
	color: #0f5132;
}

.lhw__kpi-card.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.lhw__kpi-card.is-danger {
	border-color: #f1aeb5;
	background-color: #fdecea;
	color: #842029;
}

.lhw__kpi-label {
	font-size: 0.78rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.lhw__kpi-card.is-highlight .lhw__kpi-label,
.lhw__kpi-card.is-highlight .lhw__kpi-sub {
	color: #0f5132;
}

.lhw__kpi-card.is-warn .lhw__kpi-label,
.lhw__kpi-card.is-warn .lhw__kpi-sub {
	color: #7c4a03;
}

.lhw__kpi-card.is-danger .lhw__kpi-label,
.lhw__kpi-card.is-danger .lhw__kpi-sub {
	color: #842029;
}

.lhw__kpi-val {
	font-size: 1.12rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.lhw__kpi-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.lhw__filter-bar {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.lhw__filter-inputs {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
}

.lhw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.lhw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.lhw__list-col {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.lhw__empty-list {
	padding: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	color: var(--color-text-maxcontrast);
	text-align: center;
}

.lhw__group-card {
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

.lhw__group-card:hover {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.lhw__group-card.is-selected {
	border-color: var(--color-primary-element);
	box-shadow: inset 3px 0 0 var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.lhw__group-card.is-frozen {
	border-inline-end: 3px solid #b42318;
}

.lhw__group-card.is-protected {
	border-inline-end: 3px solid #b45309;
}

.lhw__group-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
}

.lhw__status-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.lhw__status-pill.is-frozen-immutable {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.lhw__status-pill.is-policy-protected {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.lhw__status-pill.is-override-logged {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.lhw__status-pill.is-releasable {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.lhw__group-bytes {
	font-weight: 700;
}

.lhw__group-title {
	font-weight: 700;
	font-size: 0.92rem;
	overflow-wrap: anywhere;
}

.lhw__group-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.lhw__group-digest {
	font-family: monospace;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.lhw__inspector-col {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.lhw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.lhw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.lhw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.lhw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.lhw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.lhw__custody-meta {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.lhw__custody-meta {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.lhw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.lhw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.lhw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.lhw__freeze-panel,
.lhw__override-panel,
.lhw__copies-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.lhw__panel-heading {
	font-size: 0.86rem;
	font-weight: 700;
}

.lhw__panel-hint {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.lhw__freeze-row,
.lhw__override-grid {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 8px;
}

.lhw__copy-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.lhw__copy-card.is-survivor {
	border-color: #9dd6b4;
	background-color: #f3fbf6;
}

.lhw__copy-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.lhw__copy-path {
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.lhw__copy-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.lhw__copy-badge {
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.lhw__copy-badge.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.lhw__copy-badge.is-held {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.lhw__copy-badge.is-release {
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.lhw__copy-badge.is-signed {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.lhw__copy-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.lhw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.lhw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.lhw__script-content {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block-start: 8px;
}

.lhw__code-pre {
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

.lhw__audit-entries {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.lhw__audit-entry {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-size: 0.8rem;
}

.lhw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
