<template>
	<section
		class="automation-rulebook-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Zero-Touch Scheduled Retention Rulebook & Policy Simulator')">
		<header class="arw__toolbar">
			<div class="arw__title-group">
				<h3 class="arw__title">
					{{ t('duplicatefinder', 'Zero-Touch Retention Rulebook & Policy Simulator') }}
				</h3>
				<span
					class="arw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} Cycle-1 actions ({now} now, {horizon} over {cycles} cycles)', {
						count: report.summary.cycle1ActedCount,
						now: report.summary.cycle1ReclaimFormatted,
						horizon: report.summary.horizonReclaimFormatted,
						cycles: report.summary.horizonCycles,
					}) }}
				</span>
			</div>

			<div class="arw__toolbar-actions">
				<button
					type="button"
					class="arw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportOccRunbook">
					<span>{{ t('duplicatefinder', 'Export OCC Runbook') }}</span>
				</button>
				<button
					type="button"
					class="arw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportRollbackScript">
					<span>{{ t('duplicatefinder', 'Export Rollback Script') }}</span>
				</button>
				<button
					type="button"
					class="arw__tool-btn"
					:disabled="isDeleting"
					@click="exportJsonPolicy">
					<span>{{ t('duplicatefinder', 'Export Policy JSON') }}</span>
				</button>
				<button
					type="button"
					class="arw__tool-btn"
					:disabled="isDeleting"
					@click="openImportDialog">
					<span>{{ t('duplicatefinder', 'Import Policy JSON') }}</span>
				</button>
				<button
					type="button"
					class="arw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvReport">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="arw__tool-btn is-close"
					aria-keyshortcuts=";"
					:title="t('duplicatefinder', 'Hide zero-touch retention automation rulebook')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Rulebook') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="arw__empty">
			<p class="arw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="arw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to simulate scheduled retention rules, blast-radius caps, OCC runbooks, and reversible quarantine rollbacks.') }}
			</p>
			<button
				type="button"
				class="arw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="arw__controls">
				<div class="arw__control-row">
					<span class="arw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="arw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Policy simulation duplicate scope')">
						<button
							type="button"
							class="arw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="arw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="arw__control-label">{{ t('duplicatefinder', 'Policy Preset') }}</span>
					<div
						class="arw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Rulebook preset templates')">
						<button
							v-for="preset in presets"
							:key="preset.id"
							type="button"
							class="arw__seg-btn"
							:class="{ 'is-active': rulebook.presetId === preset.id }"
							:aria-pressed="rulebook.presetId === preset.id ? 'true' : 'false'"
							:title="preset.description"
							:disabled="isDeleting"
							@click="applyPreset(preset.id)">
							<span>{{ preset.name }}</span>
						</button>
					</div>
				</div>

				<div class="arw__control-row">
					<span class="arw__control-label">{{ t('duplicatefinder', 'Schedule (Cron UTC)') }}</span>
					<div
						class="arw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Cron schedule presets')">
						<button
							v-for="cron in cronPresets"
							:key="cron.id"
							type="button"
							class="arw__seg-btn"
							:class="{ 'is-active': rulebook.cronExpression === cron.expression }"
							:aria-pressed="rulebook.cronExpression === cron.expression ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="setCronExpression(cron.expression)">
							<span>{{ cron.label }}</span>
						</button>
					</div>

					<label class="arw__field">
						<span class="arw__field-label">{{ t('duplicatefinder', 'Custom 5-field cron') }}</span>
						<input
							:value="cronInput"
							type="text"
							class="arw__text-input"
							placeholder="0 3 * * 0"
							:aria-label="t('duplicatefinder', 'Custom 5-field cron expression')"
							:disabled="isDeleting"
							@input="onCronInput($event.target.value)">
					</label>

					<span class="arw__control-label">{{ t('duplicatefinder', 'Horizon') }}</span>
					<div
						class="arw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Simulation horizon cycles')">
						<button
							v-for="cyclesOption in horizonOptions"
							:key="cyclesOption"
							type="button"
							class="arw__seg-btn"
							:class="{ 'is-active': rulebook.horizonCycles === cyclesOption }"
							:aria-pressed="rulebook.horizonCycles === cyclesOption ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="setHorizonCycles(cyclesOption)">
							<span>{{ t('duplicatefinder', '{count} cycles', { count: cyclesOption }) }}</span>
						</button>
					</div>
				</div>

				<div class="arw__cron-status">
					<span
						v-if="report.cronValidation.valid"
						class="arw__cron-pill is-valid">
						{{ t('duplicatefinder', 'Valid cron (~{days}d cadence). Next run: {next}', {
							days: report.cronValidation.intervalDays,
							next: formatIsoShort(report.cronValidation.nextRuns[0] ? report.cronValidation.nextRuns[0].iso : ''),
						}) }}
					</span>
					<span
						v-else
						class="arw__cron-pill is-invalid"
						role="alert">
						{{ report.cronValidation.error }}
					</span>
				</div>

				<div class="arw__safeguards-bar">
					<label class="arw__field">
						<span class="arw__field-label">{{ t('duplicatefinder', 'Blast-radius cap (files/run)') }}</span>
						<input
							:value="blastRadiusInput"
							type="number"
							min="1"
							max="5000"
							class="arw__num-input"
							:disabled="isDeleting"
							@input="onBlastRadiusInput($event.target.value)">
					</label>

					<label class="arw__field">
						<span class="arw__field-label">{{ t('duplicatefinder', 'Grace period (days)') }}</span>
						<input
							:value="gracePeriodInput"
							type="number"
							min="0"
							max="3650"
							class="arw__num-input"
							:disabled="isDeleting"
							@input="onGracePeriodInput($event.target.value)">
					</label>

					<label class="arw__field">
						<span class="arw__field-label">{{ t('duplicatefinder', 'Conflict mode') }}</span>
						<select
							:value="rulebook.safeguards.conflictMode"
							class="arw__select"
							:disabled="isDeleting"
							@change="setConflictMode($event.target.value)">
							<option value="strictest-safeguard">
								{{ t('duplicatefinder', 'Strictest safeguard wins') }}
							</option>
							<option value="first-match-wins">
								{{ t('duplicatefinder', 'First priority match wins') }}
							</option>
						</select>
					</label>

					<label class="arw__check-label">
						<input
							type="checkbox"
							:checked="rulebook.safeguards.protectOriginFolders"
							:disabled="isDeleting"
							@change="toggleSafeguard('protectOriginFolders', $event.target.checked)">
						<span>{{ t('duplicatefinder', 'Protect Origin folders') }}</span>
					</label>

					<label class="arw__check-label">
						<input
							type="checkbox"
							:checked="rulebook.safeguards.protectSharedMounts"
							:disabled="isDeleting"
							@change="toggleSafeguard('protectSharedMounts', $event.target.checked)">
						<span>{{ t('duplicatefinder', 'Protect Shares & Mounts') }}</span>
					</label>

					<label class="arw__check-label">
						<input
							type="checkbox"
							:checked="rulebook.safeguards.requireLastCopyGuard"
							:disabled="isDeleting"
							@change="toggleSafeguard('requireLastCopyGuard', $event.target.checked)">
						<span>{{ t('duplicatefinder', 'Last-copy guard') }}</span>
					</label>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="arw__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="arw__kpis">
				<div class="arw__kpi-card">
					<span class="arw__kpi-label">{{ t('duplicatefinder', 'Cycle 1 Ready') }}</span>
					<strong class="arw__kpi-value">{{ report.summary.cycle1ReclaimFormatted }}</strong>
					<span class="arw__kpi-sub">
						{{ t('duplicatefinder', '{count} files in {groups} groups', {
							count: report.summary.cycle1ActedCount,
							groups: report.summary.eligibleGroupsCount,
						}) }}
					</span>
				</div>
				<div class="arw__kpi-card">
					<span class="arw__kpi-label">
						{{ t('duplicatefinder', '{cycles}-Cycle Projection', { cycles: report.summary.horizonCycles }) }}
					</span>
					<strong class="arw__kpi-value">{{ report.summary.horizonReclaimFormatted }}</strong>
					<span class="arw__kpi-sub">
						{{ t('duplicatefinder', '{count} total projected files', { count: report.summary.horizonActedCount }) }}
					</span>
				</div>
				<div class="arw__kpi-card">
					<span class="arw__kpi-label">{{ t('duplicatefinder', 'Guardrail Protected') }}</span>
					<strong class="arw__kpi-value">{{ report.summary.blockedBytesFormatted }}</strong>
					<span class="arw__kpi-sub">
						{{ t('duplicatefinder', '{count} files spared by safety rules', { count: report.summary.blockedCount }) }}
					</span>
				</div>
				<div class="arw__kpi-card">
					<span class="arw__kpi-label">{{ t('duplicatefinder', 'Action Mix') }}</span>
					<strong class="arw__kpi-value">
						{{ report.summary.quarantineCount }}Q / {{ report.summary.trashbinCount }}T / {{ report.summary.linkReplaceCount }}L
					</strong>
					<span class="arw__kpi-sub">
						{{ t('duplicatefinder', '{caps} cycle cap triggers', { caps: report.summary.blastRadiusCapsTriggered }) }}
					</span>
				</div>
			</div>

			<div class="arw__analytics-grid">
				<div class="arw__panel">
					<div class="arw__panel-header">
						<h4 class="arw__panel-title">
							{{ t('duplicatefinder', 'Multi-Cycle Retention Projection') }}
						</h4>
						<span class="arw__panel-hint">
							{{ t('duplicatefinder', 'Cumulative storage saved across cron runs') }}
						</span>
					</div>
					<ul class="arw__cycle-list">
						<li
							v-for="cycle in report.cycles"
							:key="cycle.cycle"
							class="arw__cycle-row">
							<div class="arw__cycle-meta">
								<span class="arw__cycle-label">{{ cycle.label }}</span>
								<span class="arw__cycle-date">{{ formatIsoShort(cycle.scheduledAtIso) }}</span>
								<span
									v-if="cycle.capReached"
									class="arw__badge is-warn">
									{{ t('duplicatefinder', 'CAP HIT') }}
								</span>
							</div>
							<div class="arw__bar-track">
								<div
									class="arw__bar-fill"
									:style="{ inlineSize: computeCycleBarWidth(cycle.cumulativeBytes) }" />
							</div>
							<div class="arw__cycle-stats">
								<span>{{ t('duplicatefinder', '{count} files (+{step})', { count: cycle.actedCount, step: cycle.reclaimBytesFormatted }) }}</span>
								<strong>{{ cycle.cumulativeBytesFormatted }}</strong>
							</div>
						</li>
					</ul>

					<div
						v-if="report.guardrailBreakdown.length > 0"
						class="arw__guardrail-box">
						<h5 class="arw__sub-title">
							{{ t('duplicatefinder', 'Guardrail Protection Breakdown') }}
						</h5>
						<div class="arw__guardrail-pills">
							<span
								v-for="guard in report.guardrailBreakdown"
								:key="guard.reason"
								class="arw__guardrail-pill">
								{{ guard.label }}: {{ guard.count }} ({{ guard.bytesFormatted }})
							</span>
						</div>
					</div>
				</div>

				<div class="arw__panel">
					<div class="arw__panel-header">
						<h4 class="arw__panel-title">
							{{ t('duplicatefinder', 'Rulebook Priority Pipeline ({count} rules)', { count: rulebook.rules.length }) }}
						</h4>
						<button
							type="button"
							class="arw__mini-btn"
							:disabled="isDeleting || rulebook.rules.length >= maxRules"
							@click="addRuleOpen = !addRuleOpen">
							<span>{{ addRuleOpen ? t('duplicatefinder', 'Cancel') : t('duplicatefinder', '+ Add Rule') }}</span>
						</button>
					</div>

					<form
						v-if="addRuleOpen"
						class="arw__rule-form"
						@submit.prevent="submitNewRule">
						<div class="arw__rule-form-grid">
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Rule name') }}</span>
								<input
									v-model="draftRule.name"
									type="text"
									required
									class="arw__text-input"
									placeholder="Prune old staging builds">
							</label>
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Action mode') }}</span>
								<select
									v-model="draftRule.actionMode"
									class="arw__select">
									<option value="quarantine-stage">
										{{ t('duplicatefinder', 'Quarantine Stage') }}
									</option>
									<option value="trashbin-prune">
										{{ t('duplicatefinder', 'Trashbin Prune') }}
									</option>
									<option value="link-replace">
										{{ t('duplicatefinder', 'Link Replace') }}
									</option>
								</select>
							</label>
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Path regex (case-insensitive)') }}</span>
								<input
									v-model="draftRule.pathRegex"
									type="text"
									required
									class="arw__text-input"
									placeholder="/(tmp|staging)/">
							</label>
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Min age (days)') }}</span>
								<input
									v-model="draftRule.minAgeDays"
									type="number"
									min="0"
									max="3650"
									class="arw__num-input">
							</label>
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Min size (MB)') }}</span>
								<input
									v-model="draftRule.minSizeMb"
									type="number"
									min="0"
									step="0.1"
									class="arw__num-input">
							</label>
							<label class="arw__field">
								<span class="arw__field-label">{{ t('duplicatefinder', 'Keep survivor strategy') }}</span>
								<select
									v-model="draftRule.keepStrategy"
									class="arw__select">
									<option value="origin-first">
										{{ t('duplicatefinder', 'Origin folder first') }}
									</option>
									<option value="oldest">
										{{ t('duplicatefinder', 'Oldest copy') }}
									</option>
									<option value="newest">
										{{ t('duplicatefinder', 'Newest copy') }}
									</option>
									<option value="shortest-path">
										{{ t('duplicatefinder', 'Shortest path') }}
									</option>
								</select>
							</label>
						</div>
						<p
							v-if="draftRuleError"
							class="arw__form-error"
							role="alert">
							{{ draftRuleError }}
						</p>
						<div class="arw__rule-form-actions">
							<button
								type="submit"
								class="arw__primary-btn">
								<span>{{ t('duplicatefinder', 'Save Rule to Pipeline') }}</span>
							</button>
						</div>
					</form>

					<ul class="arw__rule-list">
						<li
							v-for="(rule, index) in rulebook.rules"
							:key="rule.id"
							class="arw__rule-item"
							:class="{ 'is-disabled': !rule.enabled }">
							<div class="arw__rule-main">
								<label class="arw__check-label">
									<input
										type="checkbox"
										:checked="rule.enabled"
										:disabled="isDeleting"
										@change="toggleRuleEnabled(index, $event.target.checked)">
									<strong class="arw__rule-name">{{ index + 1 }}. {{ rule.name }}</strong>
								</label>
								<div class="arw__rule-meta">
									<span class="arw__badge">{{ formatActionLabel(rule.actionMode) }}</span>
									<code class="arw__regex-code">{{ rule.pathRegex }}</code>
									<span>&gt;= {{ rule.minAgeDays }}d</span>
									<span v-if="rule.minSizeBytes > 0">&gt;= {{ formatRuleSize(rule.minSizeBytes) }}</span>
									<span
										v-if="getRuleStat(rule.id) && !getRuleStat(rule.id).regexValid"
										class="arw__badge is-warn">
										{{ t('duplicatefinder', 'Invalid regex') }}
									</span>
									<span
										v-else-if="getRuleStat(rule.id)"
										class="arw__badge is-ok">
										{{ t('duplicatefinder', 'C1: {c1} | Horizon: {hz} ({bytes})', {
											c1: getRuleStat(rule.id).cycle1Matches,
											hz: getRuleStat(rule.id).horizonMatches,
											bytes: getRuleStat(rule.id).horizonBytesFormatted,
										}) }}
									</span>
								</div>
							</div>
							<div class="arw__rule-actions">
								<button
									type="button"
									class="arw__mini-btn"
									:disabled="index === 0 || isDeleting"
									:aria-label="t('duplicatefinder', 'Move rule up')"
									@click="moveRule(index, -1)">
									<span>&uarr;</span>
								</button>
								<button
									type="button"
									class="arw__mini-btn"
									:disabled="index === rulebook.rules.length - 1 || isDeleting"
									:aria-label="t('duplicatefinder', 'Move rule down')"
									@click="moveRule(index, 1)">
									<span>&darr;</span>
								</button>
								<button
									type="button"
									class="arw__mini-btn"
									:disabled="rulebook.rules.length <= 1 || isDeleting"
									:aria-label="t('duplicatefinder', 'Remove rule')"
									@click="removeRule(index)">
									<span>&times;</span>
								</button>
							</div>
						</li>
					</ul>
				</div>
			</div>

			<div class="arw__queue-header">
				<div
					class="arw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter simulated file queue')">
					<button
						v-for="mode in filterModes"
						:key="mode.id"
						type="button"
						class="arw__seg-btn"
						:class="{ 'is-active': filterMode === mode.id }"
						:aria-pressed="filterMode === mode.id ? 'true' : 'false'"
						@click="filterMode = mode.id">
						<span>{{ mode.label }}</span>
					</button>
				</div>

				<div class="arw__queue-tools">
					<input
						v-model="searchQuery"
						type="search"
						class="arw__search-input"
						:placeholder="t('duplicatefinder', 'Search path, rule, hash...')"
						:aria-label="t('duplicatefinder', 'Search simulated queue')">
					<select
						v-model="sortBy"
						class="arw__select"
						:aria-label="t('duplicatefinder', 'Sort simulated queue')">
						<option value="reclaim_desc">
							{{ t('duplicatefinder', 'Largest bytes first') }}
						</option>
						<option value="cycle_asc">
							{{ t('duplicatefinder', 'Earliest cycle first') }}
						</option>
						<option value="age_desc">
							{{ t('duplicatefinder', 'Oldest age first') }}
						</option>
						<option value="priority_asc">
							{{ t('duplicatefinder', 'Rule priority') }}
						</option>
						<option value="name_asc">
							{{ t('duplicatefinder', 'Filename A-Z') }}
						</option>
					</select>
				</div>
			</div>

			<div
				v-if="report.items.length === 0"
				class="arw__empty-list">
				{{ t('duplicatefinder', 'No duplicate files match the current simulation filter or search.') }}
			</div>

			<ul
				v-else
				class="arw__queue-list">
				<li
					v-for="item in visibleQueueItems"
					:key="item.selectionKey"
					class="arw__queue-item"
					:class="{ 'is-blocked': item.status === 'blocked' }">
					<div class="arw__queue-info">
						<div class="arw__queue-top">
							<strong class="arw__file-name">{{ item.fileName }}</strong>
							<span
								class="arw__badge"
								:class="statusBadgeClass(item)">
								{{ formatItemStatus(item) }}
							</span>
							<span class="arw__badge">{{ item.sizeFormatted }}</span>
							<span
								v-if="item.baseAgeDays !== null"
								class="arw__badge">
								{{ t('duplicatefinder', '{days}d old', { days: item.baseAgeDays }) }}
							</span>
						</div>
						<div class="arw__file-path">
							{{ item.path }}
						</div>
						<div class="arw__queue-meta">
							<span v-if="item.status !== 'blocked'">
								{{ t('duplicatefinder', 'Rule: {rule} ({mode})', { rule: item.matchedRuleName, mode: item.actionModeLabel }) }}
							</span>
							<span v-else>
								{{ t('duplicatefinder', 'Blocked: {reason}', { reason: item.blockedReasonLabel }) }}
							</span>
							<span v-if="item.survivorPath">
								{{ t('duplicatefinder', 'Survivor: {path}', { path: item.survivorPath }) }}
							</span>
						</div>
					</div>
					<div class="arw__queue-actions">
						<button
							type="button"
							class="arw__mini-btn"
							@click="$emit('select-duplicate', item.duplicate)">
							<span>{{ t('duplicatefinder', 'Inspect') }}</span>
						</button>
						<button
							type="button"
							class="arw__mini-btn"
							@click="$emit('compare-duplicate', item.duplicate)">
							<span>{{ t('duplicatefinder', 'Compare') }}</span>
						</button>
					</div>
				</li>
			</ul>

			<div
				v-if="report.items.length > visibleLimit"
				class="arw__load-more">
				<button
					type="button"
					class="arw__tool-btn"
					@click="visibleLimit += 40">
					<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: report.items.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div class="arw__bulk-bar">
				<div class="arw__bulk-summary">
					<span>
						{{ t('duplicatefinder', 'Cycle 1 Executable Cleanup: {count} files ({size})', {
							count: executableCycle1Items.length,
							size: executableCycle1BytesFormatted,
						}) }}
					</span>
					<span class="arw__bulk-note">
						{{ t('duplicatefinder', 'Last-copy guard active: canonical survivors are never deleted.') }}
					</span>
				</div>
				<div class="arw__bulk-actions">
					<button
						type="button"
						class="arw__danger-btn"
						:disabled="executableCycle1Items.length === 0 || isDeleting"
						@click="openExecuteDialog">
						<span>{{ t('duplicatefinder', 'Execute Cycle 1 Cleanup ({count})', { count: executableCycle1Items.length }) }}</span>
					</button>
				</div>
			</div>
		</template>

		<dialog
			ref="executeDialog"
			class="arw-dialog"
			:aria-label="t('duplicatefinder', 'Confirm Cycle 1 retention cleanup')"
			@close="onDialogClose"
			@click="onExecuteDialogBackdropClick">
			<div class="arw-dialog__content">
				<h4 class="arw-dialog__title">
					{{ t('duplicatefinder', 'Confirm Cycle 1 Automated Cleanup') }}
				</h4>
				<p class="arw-dialog__body">
					{{ t('duplicatefinder', 'Delete {count} policy-matched duplicate copies and reclaim {size}? Canonical survivors and Origin-protected files remain untouched.', {
						count: executableCycle1Items.length,
						size: executableCycle1BytesFormatted,
					}) }}
				</p>
				<div class="arw-dialog__actions">
					<button
						type="button"
						class="arw__tool-btn"
						:disabled="isDeleting"
						@click="closeExecuteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="arw__danger-btn"
						:disabled="isDeleting"
						@click="confirmCycle1Execution">
						<span>{{ isDeleting ? t('duplicatefinder', 'Executing...') : t('duplicatefinder', 'Confirm Delete') }}</span>
					</button>
				</div>
			</div>
		</dialog>

		<dialog
			ref="importDialog"
			class="arw-dialog"
			:aria-label="t('duplicatefinder', 'Import rulebook JSON')"
			@close="onDialogClose"
			@click="onImportDialogBackdropClick">
			<div class="arw-dialog__content">
				<h4 class="arw-dialog__title">
					{{ t('duplicatefinder', 'Import Rulebook Policy JSON') }}
				</h4>
				<textarea
					v-model="importJsonText"
					rows="8"
					class="arw__textarea"
					:placeholder="t('duplicatefinder', 'Paste duplicatefinder.automation-rulebook.v1 JSON here...')"
					:aria-label="t('duplicatefinder', 'Rulebook JSON payload')" />
				<p
					v-if="importError"
					class="arw__form-error"
					role="alert">
					{{ importError }}
				</p>
				<div class="arw-dialog__actions">
					<button
						type="button"
						class="arw__tool-btn"
						@click="closeImportDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="arw__primary-btn"
						@click="applyImportedJson">
						<span>{{ t('duplicatefinder', 'Apply Policy') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { formatBytes } from '../tools/duplicateStats'
import {
	CRON_PRESETS,
	HORIZON_CYCLE_OPTIONS,
	MAX_BLAST_RADIUS_CAP,
	MAX_GRACE_PERIOD_DAYS,
	MAX_RULEBOOK_RULES,
	RULEBOOK_PRESETS,
	compileSafeRuleRegex,
	createRulebookFromPreset,
	exportRulebookJson,
	exportSimulationCsv,
	generateNextcloudOccRunbook,
	generateRollbackQuarantineScript,
	loadAutomationRulebook,
	normalizeRuleEntry,
	normalizeRulebookConfig,
	parseRulebookConfigJson,
	saveAutomationRulebook,
	simulateRulebookPolicy,
} from '../tools/automationRulebookSimulator'

export default {
	name: 'AutomationRulebookWorkbench',
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
		const initialRulebook = loadAutomationRulebook()
		return {
			scope: 'filtered',
			rulebook: initialRulebook,
			cronInput: initialRulebook.cronExpression,
			blastRadiusInput: String(initialRulebook.safeguards.blastRadiusCap),
			gracePeriodInput: String(initialRulebook.safeguards.gracePeriodDays),
			filterMode: 'all',
			searchQuery: '',
			sortBy: 'reclaim_desc',
			visibleLimit: 40,
			addRuleOpen: false,
			draftRule: {
				name: '',
				actionMode: 'quarantine-stage',
				pathRegex: '',
				minAgeDays: '14',
				minSizeMb: '0',
				keepStrategy: 'origin-first',
			},
			draftRuleError: '',
			importJsonText: '',
			importError: '',
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
		}
	},
	computed: {
		presets() {
			return RULEBOOK_PRESETS
		},
		cronPresets() {
			return CRON_PRESETS
		},
		horizonOptions() {
			return HORIZON_CYCLE_OPTIONS
		},
		maxRules() {
			return MAX_RULEBOOK_RULES
		},
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeSourceDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		report() {
			return simulateRulebookPolicy(this.activeSourceDuplicates, this.rulebook, {
				searchQuery: this.searchQuery,
				filterMode: this.filterMode,
				sortBy: this.sortBy,
			})
		},
		maxCumulativeBytes() {
			const cycles = this.report && Array.isArray(this.report.cycles) ? this.report.cycles : []
			return cycles.reduce((max, item) => Math.max(max, item.cumulativeBytes || 0), 0)
		},
		visibleQueueItems() {
			const items = this.report && Array.isArray(this.report.items) ? this.report.items : []
			return items.slice(0, this.visibleLimit)
		},
		executableCycle1Items() {
			const items = this.report && Array.isArray(this.report.cycle1Items) ? this.report.cycle1Items : []
			return items.filter(item => item.actionMode === 'trashbin-prune' || item.actionMode === 'quarantine-stage')
		},
		executableCycle1BytesFormatted() {
			const total = this.executableCycle1Items.reduce((sum, item) => sum + item.size, 0)
			return formatBytes(total)
		},
		filterModes() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'cycle-1', label: this.t('duplicatefinder', 'Cycle 1 Ready') },
				{ id: 'future-cycle', label: this.t('duplicatefinder', 'Future Cycles') },
				{ id: 'blocked', label: this.t('duplicatefinder', 'Blocked') },
				{ id: 'quarantine-stage', label: this.t('duplicatefinder', 'Quarantine') },
				{ id: 'trashbin-prune', label: this.t('duplicatefinder', 'Trashbin') },
				{ id: 'link-replace', label: this.t('duplicatefinder', 'Link Replace') },
			]
		},
	},
	watch: {
		rulebook: {
			deep: true,
			handler(nextVal) {
				saveAutomationRulebook(nextVal)
			},
		},
	},
	methods: {
		applyPreset(presetId) {
			const next = createRulebookFromPreset(presetId)
			this.rulebook = next
			this.cronInput = next.cronExpression
			this.blastRadiusInput = String(next.safeguards.blastRadiusCap)
			this.gracePeriodInput = String(next.safeguards.gracePeriodDays)
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Loaded rulebook preset.')
		},
		setCronExpression(expr) {
			this.cronInput = expr
			this.rulebook = normalizeRulebookConfig({
				...this.rulebook,
				cronExpression: expr,
			})
		},
		onCronInput(rawValue) {
			this.cronInput = rawValue
			const trimmed = typeof rawValue === 'string' ? rawValue.trim() : ''
			if (trimmed) {
				this.rulebook = {
					...this.rulebook,
					cronExpression: trimmed,
				}
			}
		},
		setHorizonCycles(cycles) {
			this.rulebook = normalizeRulebookConfig({
				...this.rulebook,
				horizonCycles: cycles,
			})
		},
		onBlastRadiusInput(rawValue) {
			this.blastRadiusInput = rawValue
			const parsed = Number(rawValue)
			if (Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_BLAST_RADIUS_CAP) {
				this.rulebook = {
					...this.rulebook,
					safeguards: {
						...this.rulebook.safeguards,
						blastRadiusCap: Math.round(parsed),
					},
				}
			}
		},
		onGracePeriodInput(rawValue) {
			this.gracePeriodInput = rawValue
			const parsed = Number(rawValue)
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_GRACE_PERIOD_DAYS) {
				this.rulebook = {
					...this.rulebook,
					safeguards: {
						...this.rulebook.safeguards,
						gracePeriodDays: Math.round(parsed),
					},
				}
			}
		},
		setConflictMode(mode) {
			this.rulebook = normalizeRulebookConfig({
				...this.rulebook,
				safeguards: {
					...this.rulebook.safeguards,
					conflictMode: mode,
				},
			})
		},
		toggleSafeguard(key, value) {
			this.rulebook = normalizeRulebookConfig({
				...this.rulebook,
				safeguards: {
					...this.rulebook.safeguards,
					[key]: Boolean(value),
				},
			})
		},
		toggleRuleEnabled(index, enabled) {
			const rules = this.rulebook.rules.map((rule, idx) => (idx === index ? { ...rule, enabled: Boolean(enabled) } : rule))
			this.rulebook = { ...this.rulebook, rules }
		},
		moveRule(index, delta) {
			const target = index + delta
			if (target < 0 || target >= this.rulebook.rules.length) {
				return
			}
			const rules = [...this.rulebook.rules]
			const [moved] = rules.splice(index, 1)
			rules.splice(target, 0, moved)
			this.rulebook = { ...this.rulebook, rules }
		},
		removeRule(index) {
			if (this.rulebook.rules.length <= 1) {
				return
			}
			const rules = this.rulebook.rules.filter((_, idx) => idx !== index)
			this.rulebook = { ...this.rulebook, rules }
		},
		submitNewRule() {
			this.draftRuleError = ''
			const compiled = compileSafeRuleRegex(this.draftRule.pathRegex)
			if (!compiled.ok) {
				this.draftRuleError = compiled.error
				return
			}
			const minSizeBytes = Math.max(0, Math.round((Number(this.draftRule.minSizeMb) || 0) * 1024 * 1024))
			const newRule = normalizeRuleEntry({
				id: `custom-${Date.now()}`,
				name: this.draftRule.name.trim() || 'Custom rule',
				enabled: true,
				actionMode: this.draftRule.actionMode,
				pathRegex: this.draftRule.pathRegex.trim(),
				minAgeDays: Number(this.draftRule.minAgeDays),
				minSizeBytes,
				keepStrategy: this.draftRule.keepStrategy,
			}, this.rulebook.rules.length)

			this.rulebook = normalizeRulebookConfig({
				...this.rulebook,
				rules: [...this.rulebook.rules, newRule],
			})
			this.addRuleOpen = false
			this.draftRule = {
				name: '',
				actionMode: 'quarantine-stage',
				pathRegex: '',
				minAgeDays: '14',
				minSizeMb: '0',
				keepStrategy: 'origin-first',
			}
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Added automation rule "{name}".', { name: newRule.name })
		},
		getRuleStat(ruleId) {
			const list = this.report && Array.isArray(this.report.ruleBreakdown) ? this.report.ruleBreakdown : []
			return list.find(item => item.ruleId === ruleId) || null
		},
		computeCycleBarWidth(cumulativeBytes) {
			if (!this.maxCumulativeBytes || cumulativeBytes <= 0) {
				return '0%'
			}
			const pct = Math.max(4, Math.min(100, Math.round((cumulativeBytes / this.maxCumulativeBytes) * 100)))
			return `${pct}%`
		},
		formatIsoShort(iso) {
			if (!iso || typeof iso !== 'string') {
				return ''
			}
			return iso.slice(0, 16).replace('T', ' ')
		},
		formatActionLabel(mode) {
			const map = {
				'quarantine-stage': this.t('duplicatefinder', 'Quarantine'),
				'trashbin-prune': this.t('duplicatefinder', 'Trashbin'),
				'link-replace': this.t('duplicatefinder', 'Link Replace'),
			}
			return map[mode] || mode
		},
		formatRuleSize(bytes) {
			return formatBytes(bytes)
		},
		formatItemStatus(item) {
			if (item.status === 'cycle-1') {
				return this.t('duplicatefinder', 'Cycle 1 Ready')
			}
			if (item.status === 'future-cycle') {
				return this.t('duplicatefinder', 'Cycle {cycle}', { cycle: item.scheduledCycle })
			}
			return this.t('duplicatefinder', 'Blocked')
		},
		statusBadgeClass(item) {
			if (item.status === 'cycle-1') {
				return 'is-ok'
			}
			if (item.status === 'future-cycle') {
				return 'is-info'
			}
			return 'is-warn'
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
		exportOccRunbook() {
			const script = generateNextcloudOccRunbook(this.report, this.rulebook)
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'nextcloud-duplicatefinder-occ-runbook.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported Nextcloud OCC automation runbook script.')
		},
		exportRollbackScript() {
			const script = generateRollbackQuarantineScript(this.report, this.rulebook)
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'nextcloud-duplicatefinder-quarantine-rollback.sh')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported reversible quarantine and rollback script.')
		},
		exportJsonPolicy() {
			const json = exportRulebookJson(this.report, this.rulebook)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-automation-rulebook.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported automation rulebook JSON policy and simulation report.')
		},
		exportCsvReport() {
			const csv = exportSimulationCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-automation-simulation.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported automation simulation CSV report.')
		},
		openImportDialog() {
			this.importError = ''
			this.importJsonText = ''
			const dialog = this.$refs.importDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closeImportDialog() {
			const dialog = this.$refs.importDialog
			if (dialog && typeof dialog.close === 'function') {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
		},
		onImportDialogBackdropClick(event) {
			const dialog = this.$refs.importDialog
			if (dialog && event && event.target === dialog) {
				this.closeImportDialog()
			}
		},
		applyImportedJson() {
			const parsed = parseRulebookConfigJson(this.importJsonText)
			if (!parsed.ok || !parsed.rulebook) {
				this.importError = parsed.error
				return
			}
			this.rulebook = parsed.rulebook
			this.cronInput = parsed.rulebook.cronExpression
			this.blastRadiusInput = String(parsed.rulebook.safeguards.blastRadiusCap)
			this.gracePeriodInput = String(parsed.rulebook.safeguards.gracePeriodDays)
			this.importError = ''
			this.closeImportDialog()
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Imported rulebook policy ({count} rules).', { count: parsed.rulebook.rules.length })
		},
		openExecuteDialog() {
			if (this.executableCycle1Items.length === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.executeDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closeExecuteDialog() {
			const dialog = this.$refs.executeDialog
			if (dialog && typeof dialog.close === 'function') {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
		},
		onExecuteDialogBackdropClick(event) {
			const dialog = this.$refs.executeDialog
			if (dialog && event && event.target === dialog) {
				this.closeExecuteDialog()
			}
		},
		onDialogClose() {
			// Native close event hook
		},
		async confirmCycle1Execution() {
			const items = this.executableCycle1Items
			if (items.length === 0 || this.isDeleting) {
				this.closeExecuteDialog()
				return
			}

			this.isDeleting = true
			this.statusNotice = ''
			try {
				const filesToDelete = items.map(item => item.file)
				const response = await deleteFiles(filesToDelete)
				const deletedIds = Array.isArray(response && response.deleted) ? response.deleted : []
				const failedIds = Array.isArray(response && response.failed) ? response.failed : []
				const deletedCount = deletedIds.length > 0 ? deletedIds.length : (failedIds.length === 0 ? items.length : 0)

				const deletedSet = new Set(deletedIds)
				const reclaimedBytes = deletedIds.length > 0
					? items
						.filter(item => deletedSet.has(item.file.id) || deletedSet.has(item.selectionKey))
						.reduce((sum, item) => sum + item.size, 0)
					: (failedIds.length === 0 ? items.reduce((sum, item) => sum + item.size, 0) : 0)

				this.$emit('automation-delete-completed', {
					deletedIds,
					deletedKeys: items.map(item => item.selectionKey),
					reclaimedBytes,
					ruleLabel: this.t('duplicatefinder', 'Zero-Touch Retention Rulebook Cycle 1'),
				})

				this.statusNoticeType = failedIds.length > 0 ? 'error' : 'info'
				this.statusNotice = failedIds.length > 0
					? this.t('duplicatefinder', 'Executed {deleted} Cycle-1 actions ({size}), {failed} failed.', {
						deleted: deletedCount,
						size: formatBytes(reclaimedBytes),
						failed: failedIds.length,
					})
					: this.t('duplicatefinder', 'Executed {deleted} Cycle-1 retention actions ({size} reclaimed). Canonical survivors preserved.', {
						deleted: deletedCount,
						size: formatBytes(reclaimedBytes),
					})
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Failed to execute Cycle-1 actions: {message}', {
					message: error && error.message ? error.message : String(error),
				})
			} finally {
				this.isDeleting = false
				this.closeExecuteDialog()
			}
		},
	},
}
</script>

<style scoped>
.automation-rulebook-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding-block: 16px;
	padding-inline: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	max-inline-size: 100%;
	overflow-x: hidden;
}

.arw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.arw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.arw__title {
	margin: 0;
	font-size: 1.08rem;
	font-weight: 700;
}

.arw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: var(--border-radius-pill, 999px);
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
}

.arw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.arw__tool-btn,
.arw__seg-btn,
.arw__mini-btn,
.arw__primary-btn,
.arw__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 500;
	cursor: pointer;
	max-inline-size: 100%;
	text-align: center;
}

.arw__tool-btn:hover:not(:disabled),
.arw__seg-btn:hover:not(:disabled),
.arw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.arw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-weight: 600;
}

.arw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
	font-weight: 600;
}

.arw__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
	font-weight: 600;
}

.arw__tool-btn:disabled,
.arw__seg-btn:disabled,
.arw__mini-btn:disabled,
.arw__primary-btn:disabled,
.arw__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.arw__tool-btn:focus-visible,
.arw__seg-btn:focus-visible,
.arw__mini-btn:focus-visible,
.arw__primary-btn:focus-visible,
.arw__danger-btn:focus-visible,
.arw__text-input:focus-visible,
.arw__num-input:focus-visible,
.arw__select:focus-visible,
.arw__search-input:focus-visible,
.arw__textarea:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.arw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
}

.arw__control-row,
.arw__safeguards-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.arw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.arw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.arw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.arw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.arw__text-input,
.arw__num-input,
.arw__select,
.arw__search-input,
.arw__textarea {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	box-sizing: border-box;
	max-inline-size: 100%;
}

.arw__num-input {
	inline-size: 110px;
}

.arw__check-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.83rem;
	font-weight: 500;
	cursor: pointer;
}

.arw__cron-status {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.arw__cron-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: var(--border-radius-pill, 999px);
	font-size: 0.8rem;
	font-weight: 600;
}

.arw__cron-pill.is-valid {
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
}

.arw__cron-pill.is-invalid {
	background-color: #ffebee;
	border: 1px solid #c62828;
	color: #b71c1c;
}

.arw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	font-size: 0.85rem;
	font-weight: 600;
}

.arw__notice.is-error {
	border-color: #c62828;
	background-color: #ffebee;
	color: #b71c1c;
}

.arw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.arw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.arw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.arw__kpi-value {
	font-size: 1.12rem;
	font-weight: 700;
}

.arw__kpi-sub {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.arw__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.arw__panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.arw__panel-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.arw__panel-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
}

.arw__panel-hint {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.arw__cycle-list,
.arw__rule-list,
.arw__queue-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.arw__cycle-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
}

.arw__cycle-meta,
.arw__cycle-stats {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.81rem;
}

.arw__cycle-label {
	font-weight: 700;
}

.arw__cycle-date {
	color: var(--color-text-maxcontrast);
}

.arw__bar-track {
	block-size: 8px;
	inline-size: 100%;
	border-radius: 999px;
	background-color: var(--color-border);
	overflow: hidden;
}

.arw__bar-fill {
	block-size: 100%;
	background-color: var(--color-primary-element);
	border-radius: 999px;
}

.arw__guardrail-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block-start: 8px;
	border-block-start: 1px solid var(--color-border);
}

.arw__sub-title {
	margin: 0;
	font-size: 0.84rem;
	font-weight: 700;
}

.arw__guardrail-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.arw__guardrail-pill,
.arw__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: var(--border-radius-pill, 999px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.76rem;
	font-weight: 600;
}

.arw__badge.is-ok {
	border-color: #2e7d32;
	color: #1b5e20;
	background-color: #e8f5e9;
}

.arw__badge.is-info {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.arw__badge.is-warn {
	border-color: #e65100;
	color: #bf360c;
	background-color: #fff3e0;
}

.arw__rule-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px dashed var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.arw__rule-form-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.arw__rule-form-actions {
	display: flex;
	justify-content: flex-end;
}

.arw__form-error {
	margin: 0;
	font-size: 0.82rem;
	font-weight: 600;
	color: #b71c1c;
}

.arw__rule-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
}

.arw__rule-item.is-disabled {
	opacity: 0.6;
}

.arw__rule-main {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-inline-size: 0;
	flex: 1 1 220px;
}

.arw__rule-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 0.78rem;
}

.arw__regex-code {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 3px;
	background-color: var(--color-background-hover);
	font-size: 0.76rem;
	word-break: break-all;
}

.arw__rule-actions {
	display: flex;
	gap: 4px;
}

.arw__queue-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.arw__queue-tools {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.arw__queue-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.arw__queue-item.is-blocked {
	background-color: var(--color-background-hover);
}

.arw__queue-info {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	flex: 1 1 260px;
}

.arw__queue-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.arw__file-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.arw__file-path {
	font-size: 0.79rem;
	color: var(--color-text-maxcontrast);
	word-break: break-all;
}

.arw__queue-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
	font-size: 0.78rem;
}

.arw__queue-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.arw__empty,
.arw__empty-list {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 8px;
	padding-block: 24px;
	padding-inline: 16px;
	text-align: center;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.arw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.96rem;
}

.arw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 560px;
}

.arw__load-more {
	display: flex;
	justify-content: center;
}

.arw__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.arw__bulk-summary {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.86rem;
	font-weight: 600;
}

.arw__bulk-note {
	font-weight: 400;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.arw__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.arw-dialog {
	max-inline-size: 480px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.arw-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.arw-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.arw-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.arw-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.arw-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.arw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.arw__analytics-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.automation-rulebook-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.arw__tool-btn,
	.arw__seg-btn,
	.arw__mini-btn,
	.arw__primary-btn,
	.arw__danger-btn,
	.arw__select,
	.arw__search-input,
	.arw__text-input,
	.arw__num-input {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.arw__field,
	.arw__rule-form-grid {
		grid-template-columns: minmax(0, 1fr);
		flex: 1 1 100%;
	}

	.arw__num-input,
	.arw__text-input,
	.arw__search-input,
	.arw__select {
		inline-size: 100%;
	}
}

@media (max-width: 520px) {
	.arw__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
