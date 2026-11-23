<template>
	<section
		class="rule-profiles-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Cleanup Rule Profiles, Regex Exclusions and Batch Audit Workbench')">
		<header class="rule-workbench__toolbar">
			<div class="rule-workbench__title-group">
				<h3 class="rule-workbench__title">
					{{ t('duplicatefinder', 'Rule Profiles & Batch Audit') }}
				</h3>
				<span
					class="rule-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{marked} marked ({size}), {shielded} shielded', {
						marked: plan.summary.markedCount,
						size: plan.summary.markedFormatted,
						shielded: plan.summary.shieldedCount,
					}) }}
				</span>
			</div>

			<div class="rule-workbench__toolbar-actions">
				<button
					type="button"
					class="rule-workbench__tool-btn"
					:disabled="isExecuting"
					@click="saveCurrentAsCustomProfile">
					<span>{{ isEditingCustomProfile
						? t('duplicatefinder', 'Update profile')
						: t('duplicatefinder', 'Save as profile') }}</span>
				</button>
				<button
					type="button"
					class="rule-workbench__tool-btn"
					:disabled="isExecuting"
					@click="exportActiveProfileJson">
					<span>{{ t('duplicatefinder', 'Export profile') }}</span>
				</button>
				<button
					type="button"
					class="rule-workbench__tool-btn"
					:aria-expanded="importPanelOpen ? 'true' : 'false'"
					:disabled="isExecuting"
					@click="importPanelOpen = !importPanelOpen">
					<span>{{ t('duplicatefinder', 'Import profile') }}</span>
				</button>
				<button
					type="button"
					class="rule-workbench__tool-btn"
					:disabled="allDuplicates.length === 0 || isExecuting"
					@click="recordDryRunSnapshot">
					<span>{{ t('duplicatefinder', 'Save dry-run') }}</span>
				</button>
				<button
					type="button"
					class="rule-workbench__tool-btn is-close"
					aria-keyshortcuts="5"
					:title="t('duplicatefinder', 'Hide rule profiles and audit workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide rules') }}</span>
				</button>
			</div>
		</header>

		<div v-if="importPanelOpen" class="rule-workbench__import-panel">
			<label for="rule-profile-import-textarea" class="rule-workbench__field-label">
				{{ t('duplicatefinder', 'Paste exported rule profile JSON') }}
			</label>
			<textarea
				id="rule-profile-import-textarea"
				v-model="importJsonText"
				rows="4"
				class="rule-workbench__textarea"
				:placeholder="t('duplicatefinder', '{ &quot;schema&quot;: &quot;duplicatefinder.rule-profile.v1&quot;, ... }')" />
			<div class="rule-workbench__import-actions">
				<button
					type="button"
					class="rule-workbench__primary-btn"
					:disabled="!importJsonText.trim()"
					@click="applyImportedProfile">
					<span>{{ t('duplicatefinder', 'Load imported profile') }}</span>
				</button>
				<button
					type="button"
					class="rule-workbench__tool-btn"
					@click="importPanelOpen = false">
					<span>{{ t('duplicatefinder', 'Cancel') }}</span>
				</button>
			</div>
			<p
				v-if="importError"
				class="rule-workbench__error-text"
				role="alert">
				{{ importError }}
			</p>
		</div>

		<div
			v-if="statusNotice"
			class="rule-workbench__notice"
			role="status"
			aria-live="polite">
			<span>{{ statusNotice }}</span>
			<button
				type="button"
				class="rule-workbench__mini-btn"
				@click="statusNotice = ''">
				{{ t('duplicatefinder', 'Dismiss') }}
			</button>
		</div>

		<div
			v-if="plan.invalidRules.length > 0 || plan.summary.batchCapError"
			class="rule-workbench__alert"
			role="alert">
			<p v-if="plan.summary.batchCapError" class="rule-workbench__alert-line">
				{{ plan.summary.batchCapError }}
			</p>
			<p
				v-for="errRule in plan.invalidRules"
				:key="errRule.id"
				class="rule-workbench__alert-line">
				{{ t('duplicatefinder', 'Invalid regex in {label}: {error}', {
					label: errRule.label,
					error: errRule.error,
				}) }}
			</p>
		</div>

		<div class="rule-workbench__kpis">
			<div class="rule-kpi-card">
				<span class="rule-kpi-card__label">{{ t('duplicatefinder', 'Groups targeted') }}</span>
				<strong class="rule-kpi-card__value">{{ plan.summary.groupsWithCleanup }} / {{ plan.summary.totalGroups }}</strong>
				<span class="rule-kpi-card__sub">
					{{ t('duplicatefinder', '{skipped} skipped by safety guards', { skipped: plan.summary.skippedGroups }) }}
				</span>
			</div>
			<div class="rule-kpi-card">
				<span class="rule-kpi-card__label">{{ t('duplicatefinder', 'Marked for cleanup') }}</span>
				<strong class="rule-kpi-card__value">{{ plan.summary.markedCount }}</strong>
				<span class="rule-kpi-card__sub">
					{{ t('duplicatefinder', '{size} reclaimable ({deferred} capped)', {
						size: plan.summary.markedFormatted,
						deferred: plan.summary.deferredCount,
					}) }}
				</span>
			</div>
			<div class="rule-kpi-card">
				<span class="rule-kpi-card__label">{{ t('duplicatefinder', 'Shielded copies') }}</span>
				<strong class="rule-kpi-card__value">{{ plan.summary.shieldedCount }}</strong>
				<span class="rule-kpi-card__sub">
					{{ t('duplicatefinder', '{size} protected ({rules} regex rules)', {
						size: plan.summary.shieldedFormatted,
						rules: plan.exclusionCount,
					}) }}
				</span>
			</div>
			<div class="rule-kpi-card">
				<span class="rule-kpi-card__label">{{ t('duplicatefinder', 'Audit log history') }}</span>
				<strong class="rule-kpi-card__value">{{ auditSummary.runCount }}</strong>
				<span class="rule-kpi-card__sub">
					{{ t('duplicatefinder', '{size} reclaimed across runs', { size: auditSummary.totalReclaimedFormatted }) }}
				</span>
			</div>
		</div>

		<div
			class="rule-workbench__tabs"
			role="tablist"
			:aria-label="t('duplicatefinder', 'Rule workbench sections')">
			<button
				id="rule-tab-profiles"
				type="button"
				role="tab"
				class="rule-workbench__tab-btn"
				:class="{ 'is-active': activeTab === 'profiles' }"
				:aria-selected="activeTab === 'profiles' ? 'true' : 'false'"
				aria-controls="rule-panel-profiles"
				@click="activeTab = 'profiles'">
				<span>{{ t('duplicatefinder', 'Rule Profile & Dry-Run') }}</span>
			</button>
			<button
				id="rule-tab-exclusions"
				type="button"
				role="tab"
				class="rule-workbench__tab-btn"
				:class="{ 'is-active': activeTab === 'exclusions' }"
				:aria-selected="activeTab === 'exclusions' ? 'true' : 'false'"
				aria-controls="rule-panel-exclusions"
				@click="activeTab = 'exclusions'">
				<span>{{ t('duplicatefinder', 'Regex Exclusions ({count})', { count: exclusionReport.matchedCount }) }}</span>
			</button>
			<button
				id="rule-tab-audit"
				type="button"
				role="tab"
				class="rule-workbench__tab-btn"
				:class="{ 'is-active': activeTab === 'audit' }"
				:aria-selected="activeTab === 'audit' ? 'true' : 'false'"
				aria-controls="rule-panel-audit"
				@click="activeTab = 'audit'">
				<span>{{ t('duplicatefinder', 'Batch Audit Log ({count})', { count: auditLog.length }) }}</span>
			</button>
		</div>

		<!-- TAB 1: RULE PROFILE & DRY-RUN -->
		<div
			v-if="activeTab === 'profiles'"
			id="rule-panel-profiles"
			role="tabpanel"
			aria-labelledby="rule-tab-profiles"
			class="rule-workbench__panel">
			<div v-if="allDuplicates.length === 0" class="rule-workbench__empty">
				<p class="rule-workbench__empty-title">
					{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
				</p>
				<p class="rule-workbench__empty-hint">
					{{ t('duplicatefinder', 'Run a storage scan to test cleanup rule profiles, regex exclusions, and deterministic dry-run batches.') }}
				</p>
				<button
					type="button"
					class="rule-workbench__primary-btn"
					@click="$emit('start-scan')">
					<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
				</button>
			</div>

			<template v-else>
				<div class="rule-workbench__profile-bar">
					<div class="rule-workbench__profile-pills" role="group" :aria-label="t('duplicatefinder', 'Saved cleanup profiles')">
						<button
							v-for="profileItem in allProfiles"
							:key="profileItem.id"
							type="button"
							class="rule-workbench__pill-btn"
							:class="{ 'is-active': activeProfile.id === profileItem.id }"
							:aria-pressed="activeProfile.id === profileItem.id ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="selectProfile(profileItem)">
							<span>{{ profileItem.name }}</span>
							<span v-if="!profileItem.builtin" class="rule-workbench__pill-tag">{{ t('duplicatefinder', 'Custom') }}</span>
						</button>
					</div>
					<button
						v-if="isEditingCustomProfile"
						type="button"
						class="rule-workbench__danger-outline-btn"
						:disabled="isExecuting"
						@click="deleteActiveCustomProfile">
						<span>{{ t('duplicatefinder', 'Delete custom profile') }}</span>
					</button>
				</div>

				<div class="rule-workbench__editor-grid">
					<div class="rule-editor-card">
						<h4 class="rule-editor-card__title">
							{{ t('duplicatefinder', 'Profile policy & regex path weights') }}
						</h4>
						<div class="rule-editor-card__fields">
							<div class="rule-field">
								<label for="rule-profile-name" class="rule-workbench__field-label">
									{{ t('duplicatefinder', 'Profile name') }}
								</label>
								<input
									id="rule-profile-name"
									v-model="draftProfile.name"
									type="text"
									class="rule-workbench__input"
									:disabled="isExecuting">
							</div>

							<div class="rule-field-row">
								<div class="rule-field">
									<label for="rule-scope-select" class="rule-workbench__field-label">
										{{ t('duplicatefinder', 'Evaluation scope') }}
									</label>
									<select
										id="rule-scope-select"
										v-model="draftProfile.scope"
										class="rule-workbench__select"
										:disabled="isExecuting">
										<option value="filtered">
											{{ t('duplicatefinder', 'Filtered view ({count} groups)', { count: duplicates.length }) }}
										</option>
										<option value="all">
											{{ t('duplicatefinder', 'All loaded ({count} groups)', { count: allDuplicates.length }) }}
										</option>
									</select>
								</div>

								<div class="rule-field">
									<label for="rule-max-batch-input" class="rule-workbench__field-label">
										{{ t('duplicatefinder', 'Max files per batch (optional)') }}
									</label>
									<input
										id="rule-max-batch-input"
										v-model="maxBatchInput"
										type="text"
										inputmode="numeric"
										class="rule-workbench__input"
										:disabled="isExecuting"
										:placeholder="t('duplicatefinder', 'Unlimited')">
								</div>
							</div>

							<div class="rule-field">
								<label for="rule-preferred-regex" class="rule-workbench__field-label">
									{{ t('duplicatefinder', 'Preferred keep path regex (boosts survivor score)') }}
								</label>
								<div class="rule-field-inline">
									<input
										id="rule-preferred-regex"
										v-model="draftProfile.preferredRegex"
										type="text"
										class="rule-workbench__input"
										:disabled="isExecuting"
										:placeholder="t('duplicatefinder', 'e.g. (^|/)(Photos|Originals)(/|$)')">
									<input
										v-model="draftProfile.preferredFlags"
										type="text"
										maxlength="3"
										class="rule-workbench__flag-input"
										:aria-label="t('duplicatefinder', 'Preferred regex flags')"
										:disabled="isExecuting">
								</div>
							</div>

							<div class="rule-field">
								<label for="rule-demoted-regex" class="rule-workbench__field-label">
									{{ t('duplicatefinder', 'Target cleanup path regex (demotes copies)') }}
								</label>
								<div class="rule-field-inline">
									<input
										id="rule-demoted-regex"
										v-model="draftProfile.demotedRegex"
										type="text"
										class="rule-workbench__input"
										:disabled="isExecuting"
										:placeholder="t('duplicatefinder', 'e.g. (^|/)(Downloads|Temp)(/|$)')">
									<input
										v-model="draftProfile.demotedFlags"
										type="text"
										maxlength="3"
										class="rule-workbench__flag-input"
										:aria-label="t('duplicatefinder', 'Target cleanup regex flags')"
										:disabled="isExecuting">
								</div>
							</div>

							<div class="rule-toggles">
								<label class="rule-workbench__checkbox-label">
									<input
										v-model="draftProfile.neverTouchOrigins"
										type="checkbox"
										:disabled="isExecuting">
									<span>{{ t('duplicatefinder', 'Always shield Origin Folders') }}</span>
								</label>
								<label class="rule-workbench__checkbox-label">
									<input
										v-model="draftProfile.skipSharedRisk"
										type="checkbox"
										:disabled="isExecuting">
									<span>{{ t('duplicatefinder', 'Shield actively shared files') }}</span>
								</label>
							</div>
						</div>
					</div>

					<div class="rule-editor-card">
						<h4 class="rule-editor-card__title">
							{{ t('duplicatefinder', 'Tie-breaker priority stack (top to bottom)') }}
						</h4>
						<ol class="rule-tiebreaker-list">
							<li
								v-for="(criterionId, idx) in draftProfile.tieBreakers"
								:key="criterionId"
								class="rule-tiebreaker-item">
								<div class="rule-tiebreaker-item__info">
									<span class="rule-tiebreaker-item__rank">#{{ idx + 1 }}</span>
									<span class="rule-tiebreaker-item__label">{{ getCriterionLabel(criterionId) }}</span>
								</div>
								<div class="rule-tiebreaker-item__actions">
									<button
										type="button"
										class="rule-workbench__mini-btn"
										:disabled="idx === 0 || isExecuting"
										:aria-label="t('duplicatefinder', 'Move {label} up', { label: getCriterionLabel(criterionId) })"
										@click="moveCriterion(idx, -1)">
										{{ t('duplicatefinder', 'Up') }}
									</button>
									<button
										type="button"
										class="rule-workbench__mini-btn"
										:disabled="idx === draftProfile.tieBreakers.length - 1 || isExecuting"
										:aria-label="t('duplicatefinder', 'Move {label} down', { label: getCriterionLabel(criterionId) })"
										@click="moveCriterion(idx, 1)">
										{{ t('duplicatefinder', 'Down') }}
									</button>
									<button
										type="button"
										class="rule-workbench__mini-btn"
										:disabled="draftProfile.tieBreakers.length <= 1 || isExecuting"
										:aria-label="t('duplicatefinder', 'Remove {label}', { label: getCriterionLabel(criterionId) })"
										@click="removeCriterion(criterionId)">
										{{ t('duplicatefinder', 'Remove') }}
									</button>
								</div>
							</li>
						</ol>

						<div v-if="unusedCriteria.length > 0" class="rule-tiebreaker-add">
							<label for="rule-add-criterion" class="rule-workbench__field-label">
								{{ t('duplicatefinder', 'Add tie-breaker criterion') }}
							</label>
							<div class="rule-field-inline">
								<select
									id="rule-add-criterion"
									v-model="criterionToAdd"
									class="rule-workbench__select"
									:disabled="isExecuting">
									<option
										v-for="item in unusedCriteria"
										:key="item.id"
										:value="item.id">
										{{ item.label }}
									</option>
								</select>
								<button
									type="button"
									class="rule-workbench__tool-btn"
									:disabled="!criterionToAdd || isExecuting"
									@click="addCriterion">
									<span>{{ t('duplicatefinder', 'Add') }}</span>
								</button>
							</div>
						</div>
					</div>
				</div>

				<div class="rule-workbench__dryrun-controls">
					<div class="rule-workbench__filter-group">
						<button
							type="button"
							class="rule-workbench__seg-btn"
							:class="{ 'is-active': decisionFilter === 'all' }"
							@click="decisionFilter = 'all'">
							{{ t('duplicatefinder', 'All groups ({count})', { count: plan.groups.length }) }}
						</button>
						<button
							type="button"
							class="rule-workbench__seg-btn"
							:class="{ 'is-active': decisionFilter === 'cleanup' }"
							@click="decisionFilter = 'cleanup'">
							{{ t('duplicatefinder', 'Cleanup ready ({count})', { count: plan.summary.groupsWithCleanup }) }}
						</button>
						<button
							type="button"
							class="rule-workbench__seg-btn"
							:class="{ 'is-active': decisionFilter === 'shielded' }"
							@click="decisionFilter = 'shielded'">
							{{ t('duplicatefinder', 'Has shielded ({count})', { count: shieldedGroupsCount }) }}
						</button>
					</div>

					<input
						v-model="decisionQuery"
						type="search"
						class="rule-workbench__search-input"
						:aria-label="t('duplicatefinder', 'Filter simulated group paths')"
						:placeholder="t('duplicatefinder', 'Filter group paths or hashes...')">
				</div>

				<div v-if="filteredDecisions.length === 0" class="rule-workbench__empty">
					<p class="rule-workbench__empty-title">
						{{ t('duplicatefinder', 'No groups match your dry-run filter') }}
					</p>
					<button
						type="button"
						class="rule-workbench__tool-btn"
						@click="resetDryRunFilters">
						<span>{{ t('duplicatefinder', 'Reset workbench filters') }}</span>
					</button>
				</div>

				<div v-else class="rule-decision-list">
					<article
						v-for="group in visibleDecisions"
						:key="group.groupId"
						class="rule-decision-card"
						:class="{ 'is-current': group.groupId === currentDuplicateId }">
						<header class="rule-decision-card__header">
							<div class="rule-decision-card__meta">
								<span class="rule-decision-card__hash">#{{ group.hash ? group.hash.slice(0, 10) : group.groupId }}</span>
								<span class="rule-decision-card__summary">
									{{ t('duplicatefinder', '{marked} to delete ({size}), {shielded} shielded', {
										marked: group.markedEntries.length,
										size: group.reclaimableFormatted,
										shielded: group.shieldedEntries.length,
									}) }}
								</span>
							</div>
							<div class="rule-decision-card__actions">
								<button
									type="button"
									class="rule-workbench__mini-btn"
									@click="emitSelectGroup(group.groupId)">
									<span>{{ t('duplicatefinder', 'Inspect') }}</span>
								</button>
								<button
									type="button"
									class="rule-workbench__mini-btn"
									@click="emitCompareGroup(group.groupId)">
									<span>{{ t('duplicatefinder', 'Compare') }}</span>
								</button>
							</div>
						</header>

						<ul class="rule-decision-card__files">
							<li
								v-for="entry in group.entries"
								:key="entry.key"
								class="rule-file-row"
								:class="'is-' + entry.role">
								<div class="rule-file-row__main">
									<span class="rule-file-row__badge">
										{{ formatRoleLabel(entry.role) }}
									</span>
									<span class="rule-file-row__path">{{ entry.displayPath }}</span>
									<span class="rule-file-row__size">{{ entry.sizeFormatted }}</span>
								</div>
								<div class="rule-file-row__sub">
									<span class="rule-file-row__score">
										{{ t('duplicatefinder', 'Score {score}', { score: entry.score }) }}
									</span>
									<span v-if="entry.shieldReason" class="rule-file-row__reason">
										{{ entry.shieldReason }}
									</span>
									<span v-else-if="entry.reasons.length > 0" class="rule-file-row__reason">
										{{ entry.reasons.join(' / ') }}
									</span>
									<div class="rule-file-row__btns">
										<button
											v-if="entry.role !== 'survivor'"
											type="button"
											class="rule-workbench__mini-btn"
											:disabled="isExecuting"
											@click="promoteSurvivor(group.groupId, entry.key)">
											<span>{{ t('duplicatefinder', 'Keep this') }}</span>
										</button>
										<button
											v-if="entry.role !== 'survivor'"
											type="button"
											class="rule-workbench__mini-btn"
											:disabled="isExecuting"
											@click="toggleManualShield(entry.key)">
											<span>{{ excludedKeySet.has(entry.key)
												? t('duplicatefinder', 'Unshield')
												: t('duplicatefinder', 'Shield') }}</span>
										</button>
									</div>
								</div>
							</li>
						</ul>
					</article>

					<div v-if="filteredDecisions.length > visibleDecisionLimit" class="rule-workbench__load-more">
						<button
							type="button"
							class="rule-workbench__tool-btn"
							@click="visibleDecisionLimit += 25">
							<span>{{ t('duplicatefinder', 'Show more groups ({remaining} left)', {
								remaining: filteredDecisions.length - visibleDecisionLimit,
							}) }}</span>
						</button>
					</div>
				</div>

				<footer class="rule-workbench__execute-bar">
					<div class="rule-workbench__execute-summary">
						<strong>
							{{ t('duplicatefinder', 'Ready to delete {count} files ({size})', {
								count: plan.summary.markedCount,
								size: plan.summary.markedFormatted,
							}) }}
						</strong>
						<span v-if="isExecuting" class="rule-workbench__progress">
							{{ t('duplicatefinder', 'Executing cleanup ({done}/{total})...', {
								done: executionDone,
								total: executionTotal,
							}) }}
						</span>
					</div>
					<div class="rule-workbench__execute-actions">
						<button
							type="button"
							class="rule-workbench__tool-btn"
							:disabled="Object.keys(promotedByGroup).length === 0 && excludedFileKeys.length === 0"
							@click="clearManualOverrides">
							<span>{{ t('duplicatefinder', 'Reset overrides') }}</span>
						</button>
						<button
							type="button"
							class="rule-workbench__danger-btn"
							:disabled="plan.summary.markedCount === 0 || isExecuting || plan.summary.invalidRuleCount > 0 || Boolean(plan.summary.batchCapError)"
							@click="openExecuteConfirmDialog">
							<span>{{ t('duplicatefinder', 'Execute batch ({count})', { count: plan.summary.markedCount }) }}</span>
						</button>
					</div>
				</footer>
			</template>
		</div>

		<!-- TAB 2: REGEX EXCLUSIONS & LIVE TESTER -->
		<div
			v-if="activeTab === 'exclusions'"
			id="rule-panel-exclusions"
			role="tabpanel"
			aria-labelledby="rule-tab-exclusions"
			class="rule-workbench__panel">
			<div class="rule-exclusions__presets">
				<h4 class="rule-editor-card__title">
					{{ t('duplicatefinder', 'Built-in Regex Exclusion Presets (shielded from cleanup)') }}
				</h4>
				<div class="rule-preset-grid">
					<label
						v-for="preset in exclusionPresets"
						:key="preset.id"
						class="rule-preset-card"
						:class="{ 'is-active': draftProfile.activeExclusionPresets.includes(preset.id) }">
						<input
							type="checkbox"
							:checked="draftProfile.activeExclusionPresets.includes(preset.id)"
							:disabled="isExecuting"
							@change="toggleExclusionPreset(preset.id)">
						<div class="rule-preset-card__body">
							<strong class="rule-preset-card__title">{{ preset.label }}</strong>
							<code class="rule-preset-card__pattern">/{{ preset.pattern }}/{{ preset.flags }}</code>
							<span class="rule-preset-card__count">
								{{ t('duplicatefinder', '{count} files matched', {
									count: exclusionReport.perRuleCounts[preset.id] || 0,
								}) }}
							</span>
						</div>
					</label>
				</div>
			</div>

			<div class="rule-exclusions__custom">
				<h4 class="rule-editor-card__title">
					{{ t('duplicatefinder', 'Custom Regex Exclusion Rules & Live Path Tester') }}
				</h4>
				<div class="rule-custom-builder">
					<div class="rule-field">
						<label for="custom-excl-label" class="rule-workbench__field-label">
							{{ t('duplicatefinder', 'Rule label') }}
						</label>
						<input
							id="custom-excl-label"
							v-model="newExclusionLabel"
							type="text"
							class="rule-workbench__input"
							:placeholder="t('duplicatefinder', 'e.g. Shield accounting PDFs')">
					</div>
					<div class="rule-field">
						<label for="custom-excl-pattern" class="rule-workbench__field-label">
							{{ t('duplicatefinder', 'Regex pattern') }}
						</label>
						<div class="rule-field-inline">
							<input
								id="custom-excl-pattern"
								v-model="newExclusionPattern"
								type="text"
								class="rule-workbench__input"
								:placeholder="t('duplicatefinder', 'e.g. /Accounting/.*\\.pdf$')">
							<input
								v-model="newExclusionFlags"
								type="text"
								maxlength="3"
								class="rule-workbench__flag-input"
								:aria-label="t('duplicatefinder', 'Custom exclusion flags')">
							<button
								type="button"
								class="rule-workbench__primary-btn"
								:disabled="!newExclusionPattern.trim() || Boolean(liveTesterCompile.error)"
								@click="addCustomExclusion">
								<span>{{ t('duplicatefinder', 'Add rule') }}</span>
							</button>
						</div>
					</div>
				</div>

				<p
					v-if="liveTesterCompile.error"
					class="rule-workbench__error-text"
					role="alert">
					{{ liveTesterCompile.error }}
				</p>

				<div v-if="liveTesterPreview.length > 0" class="rule-live-tester">
					<p class="rule-live-tester__heading">
						{{ t('duplicatefinder', 'Live tester matches ({count} paths in loaded groups)', { count: liveTesterPreview.length }) }}
					</p>
					<ul class="rule-live-tester__list">
						<li
							v-for="sample in liveTesterPreview.slice(0, 12)"
							:key="sample.key"
							class="rule-live-tester__item">
							<span class="rule-live-tester__path">
								<template v-for="(seg, segIdx) in sample.segments">
									<mark v-if="seg.matched" :key="segIdx" class="rule-match-mark">{{ seg.text }}</mark>
									<span v-else :key="segIdx">{{ seg.text }}</span>
								</template>
							</span>
						</li>
					</ul>
				</div>

				<ul v-if="draftProfile.customExclusions.length > 0" class="rule-custom-list">
					<li
						v-for="rule in draftProfile.customExclusions"
						:key="rule.id"
						class="rule-custom-item">
						<label class="rule-workbench__checkbox-label">
							<input
								v-model="rule.enabled"
								type="checkbox">
							<span>{{ rule.label }}</span>
						</label>
						<code class="rule-custom-item__pattern">/{{ rule.pattern }}/{{ rule.flags }}</code>
						<span class="rule-custom-item__count">
							{{ t('duplicatefinder', '{count} matches', { count: exclusionReport.perRuleCounts[rule.id] || 0 }) }}
						</span>
						<button
							type="button"
							class="rule-workbench__mini-btn"
							@click="removeCustomExclusion(rule.id)">
							<span>{{ t('duplicatefinder', 'Remove') }}</span>
						</button>
					</li>
				</ul>
			</div>

			<div class="rule-exclusions__matches">
				<h4 class="rule-editor-card__title">
					{{ t('duplicatefinder', 'Currently Shielded Files ({count}, {size})', {
						count: exclusionReport.matchedCount,
						size: exclusionReport.shieldedFormatted,
					}) }}
				</h4>
				<p v-if="exclusionReport.matchedCount === 0" class="rule-workbench__empty-hint">
					{{ t('duplicatefinder', 'No files in the current scope match your active exclusion regexes.') }}
				</p>
				<ul v-else class="rule-shielded-list">
					<li
						v-for="item in exclusionReport.matchedFiles.slice(0, 40)"
						:key="item.key"
						class="rule-shielded-item">
						<div class="rule-shielded-item__path">
							<template v-for="(seg, segIdx) in item.segments">
								<mark v-if="seg.matched" :key="segIdx" class="rule-match-mark">{{ seg.text }}</mark>
								<span v-else :key="segIdx">{{ seg.text }}</span>
							</template>
						</div>
						<div class="rule-shielded-item__meta">
							<span class="rule-shielded-item__rule">{{ item.ruleLabel }}</span>
							<span class="rule-shielded-item__size">{{ item.sizeFormatted }}</span>
						</div>
					</li>
				</ul>
			</div>
		</div>

		<!-- TAB 3: BATCH AUDIT & RESTORE LOG -->
		<div
			v-if="activeTab === 'audit'"
			id="rule-panel-audit"
			role="tabpanel"
			aria-labelledby="rule-tab-audit"
			class="rule-workbench__panel">
			<div class="rule-audit__toolbar">
				<div class="rule-workbench__filter-group">
					<button
						v-for="statusOpt in auditStatusFilters"
						:key="statusOpt.id"
						type="button"
						class="rule-workbench__seg-btn"
						:class="{ 'is-active': auditFilter === statusOpt.id }"
						@click="auditFilter = statusOpt.id">
						<span>{{ statusOpt.label }}</span>
					</button>
				</div>
				<div class="rule-audit__actions">
					<button
						type="button"
						class="rule-workbench__tool-btn"
						:disabled="auditLog.length === 0"
						@click="downloadAuditCsv">
						<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
					</button>
					<button
						type="button"
						class="rule-workbench__tool-btn"
						:disabled="auditLog.length === 0"
						@click="downloadAuditJson">
						<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
					</button>
					<button
						type="button"
						class="rule-workbench__danger-outline-btn"
						:disabled="auditLog.length === 0"
						@click="clearAuditHistory">
						<span>{{ t('duplicatefinder', 'Clear log') }}</span>
					</button>
				</div>
			</div>

			<div v-if="filteredAuditEntries.length === 0" class="rule-workbench__empty">
				<p class="rule-workbench__empty-title">
					{{ t('duplicatefinder', 'No batch audit entries recorded yet') }}
				</p>
				<p class="rule-workbench__empty-hint">
					{{ t('duplicatefinder', 'Save a dry-run snapshot or execute a rule batch to create an auditable cleanup & Trashbin restore trail.') }}
				</p>
			</div>

			<div v-else class="rule-audit__list">
				<article
					v-for="entry in filteredAuditEntries"
					:key="entry.id"
					class="rule-audit-card">
					<header class="rule-audit-card__header">
						<div class="rule-audit-card__meta">
							<span class="rule-audit-card__status" :class="'is-' + entry.status">{{ entry.status }}</span>
							<strong class="rule-audit-card__profile">{{ entry.profileName }}</strong>
							<span class="rule-audit-card__time">{{ formatAuditTimestamp(entry.timestamp) }}</span>
						</div>
						<div class="rule-audit-card__actions">
							<button
								type="button"
								class="rule-workbench__mini-btn"
								@click="downloadEntryRestoreScript(entry)">
								<span>{{ t('duplicatefinder', 'Restore script') }}</span>
							</button>
							<button
								v-if="entry.status !== 'restored'"
								type="button"
								class="rule-workbench__mini-btn"
								@click="markAuditStatus(entry.id, 'restored')">
								<span>{{ t('duplicatefinder', 'Mark restored') }}</span>
							</button>
							<button
								type="button"
								class="rule-workbench__mini-btn"
								:aria-expanded="expandedAuditId === entry.id ? 'true' : 'false'"
								@click="toggleAuditExpand(entry.id)">
								<span>{{ expandedAuditId === entry.id
									? t('duplicatefinder', 'Hide manifest')
									: t('duplicatefinder', 'Inspect ({count})', { count: entry.items.length }) }}</span>
							</button>
						</div>
					</header>
					<p class="rule-audit-card__stats">
						{{ t('duplicatefinder', 'Deleted: {deleted}, Failed: {failed}, Shielded: {shielded}, Reclaimed: {size}', {
							deleted: entry.deletedCount,
							failed: entry.failedCount,
							shielded: entry.shieldedCount,
							size: entry.bytesReclaimedFormatted,
						}) }}
					</p>
					<ul v-if="expandedAuditId === entry.id" class="rule-audit-card__items">
						<li
							v-for="(item, itemIdx) in entry.items"
							:key="item.path + ':' + itemIdx"
							class="rule-audit-item">
							<span class="rule-audit-item__outcome" :class="'is-' + item.outcome">{{ item.outcome }}</span>
							<span class="rule-audit-item__path">{{ item.path }}</span>
							<span v-if="item.survivorPath" class="rule-audit-item__survivor">
								{{ t('duplicatefinder', 'Kept: {path}', { path: item.survivorPath }) }}
							</span>
						</li>
					</ul>
				</article>
			</div>
		</div>

		<dialog
			ref="confirmDialog"
			class="rule-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm Rule Batch Execution')"
			@close="onConfirmDialogClose">
			<div class="rule-confirm-dialog__content">
				<h4 class="rule-confirm-dialog__title">
					{{ t('duplicatefinder', 'Execute rule profile batch?') }}
				</h4>
				<p class="rule-confirm-dialog__body">
					{{ t('duplicatefinder', 'Profile "{profile}" will move {count} duplicate files ({size}) to Nextcloud Trashbin while preserving 1 survivor per group and {shielded} shielded files.', {
						profile: activeProfile.name,
						count: plan.summary.markedCount,
						size: plan.summary.markedFormatted,
						shielded: plan.summary.shieldedCount,
					}) }}
				</p>
				<div class="rule-confirm-dialog__actions">
					<button
						type="button"
						class="rule-workbench__tool-btn"
						@click="closeExecuteConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="rule-workbench__danger-btn"
						@click="confirmAndExecuteBatch">
						<span>{{ t('duplicatefinder', 'Confirm cleanup') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { formatBytes } from '../tools/duplicateStats'
import { normalizePathForDiff } from '../tools/duplicatePathDiff'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import {
	BUILTIN_RULE_PROFILES,
	REGEX_EXCLUSION_PRESETS,
	TIE_BREAKER_CRITERIA,
	appendRuleAuditEntry,
	buildRegexMatchSegments,
	buildTrashbinRestorePlan,
	clearRuleAuditLog,
	compileSafeRegex,
	evaluateRegexExclusions,
	evaluateRuleProfilePlan,
	exportAuditLogCsv,
	exportAuditLogJson,
	exportRuleProfileJson,
	loadCustomRuleProfiles,
	loadRuleAuditLog,
	parseImportedRuleProfile,
	sanitizeRuleProfile,
	saveCustomRuleProfiles,
	updateAuditEntryStatus,
} from '../tools/ruleProfilesEngine'

/**
 * Create a mutable deep copy of a rule profile for interactive editing.
 *
 * @param {object} profile Source profile.
 * @return {object} Cloned profile.
 */
function cloneProfile(profile) {
	const clean = sanitizeRuleProfile(profile)
	return {
		...clean,
		tieBreakers: [...clean.tieBreakers],
		activeExclusionPresets: [...clean.activeExclusionPresets],
		customExclusions: clean.customExclusions.map(item => ({ ...item })),
	}
}

export default {
	name: 'RuleProfilesWorkbench',
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
		const customProfiles = loadCustomRuleProfiles()
		const initialProfile = cloneProfile(BUILTIN_RULE_PROFILES[0])
		return {
			activeTab: 'profiles',
			customProfiles,
			draftProfile: initialProfile,
			maxBatchInput: initialProfile.maxFilesPerBatch !== null ? String(initialProfile.maxFilesPerBatch) : '',
			criterionToAdd: '',
			promotedByGroup: {},
			excludedFileKeys: [],
			decisionFilter: 'all',
			decisionQuery: '',
			visibleDecisionLimit: 25,
			newExclusionLabel: '',
			newExclusionPattern: '',
			newExclusionFlags: 'i',
			importPanelOpen: false,
			importJsonText: '',
			importError: '',
			statusNotice: '',
			auditLog: loadRuleAuditLog(),
			auditFilter: 'all',
			expandedAuditId: '',
			isExecuting: false,
			executionDone: 0,
			executionTotal: 0,
		}
	},
	computed: {
		exclusionPresets() {
			return REGEX_EXCLUSION_PRESETS
		},
		allProfiles() {
			return [...BUILTIN_RULE_PROFILES, ...this.customProfiles]
		},
		activeProfile() {
			return sanitizeRuleProfile(this.draftProfile)
		},
		isEditingCustomProfile() {
			return !this.draftProfile.builtin && this.customProfiles.some(item => item.id === this.draftProfile.id)
		},
		scopedDuplicates() {
			return this.draftProfile.scope === 'all' ? this.allDuplicates : this.duplicates
		},
		excludedKeySet() {
			return new Set(this.excludedFileKeys)
		},
		plan() {
			return evaluateRuleProfilePlan(this.scopedDuplicates, this.draftProfile, {
				promotedByGroup: this.promotedByGroup,
				excludedFileKeys: this.excludedKeySet,
				maxBatchOverride: this.maxBatchInput,
			})
		},
		exclusionReport() {
			return evaluateRegexExclusions(this.scopedDuplicates, this.draftProfile)
		},
		liveTesterCompile() {
			return compileSafeRegex(this.newExclusionPattern, this.newExclusionFlags)
		},
		liveTesterPreview() {
			if (!this.liveTesterCompile.regex) {
				return []
			}
			const regex = this.liveTesterCompile.regex
			const matches = []
			const seen = new Set()
			for (const group of this.scopedDuplicates) {
				if (!group || !Array.isArray(group.files)) {
					continue
				}
				for (const file of group.files) {
					if (!file || typeof file.path !== 'string') {
						continue
					}
					const displayPath = normalizePathForDiff(file.path)
					if (!regex.test(displayPath) && !regex.test(file.path)) {
						continue
					}
					const key = getFileSelectionKey(file)
					if (seen.has(key)) {
						continue
					}
					seen.add(key)
					matches.push({
						key,
						segments: buildRegexMatchSegments(displayPath, regex),
					})
					if (matches.length >= 25) {
						return matches
					}
				}
			}
			return matches
		},
		unusedCriteria() {
			const active = new Set(this.draftProfile.tieBreakers)
			return TIE_BREAKER_CRITERIA.filter(item => !active.has(item.id))
		},
		shieldedGroupsCount() {
			return this.plan.groups.filter(group => group.shieldedEntries.length > 0).length
		},
		filteredDecisions() {
			const query = this.decisionQuery.trim().toLowerCase()
			return this.plan.groups.filter(group => {
				if (this.decisionFilter === 'cleanup' && group.markedEntries.length === 0) {
					return false
				}
				if (this.decisionFilter === 'shielded' && group.shieldedEntries.length === 0) {
					return false
				}
				if (!query) {
					return true
				}
				if (String(group.hash || '').toLowerCase().includes(query)) {
					return true
				}
				return group.entries.some(entry => entry.displayPath.toLowerCase().includes(query))
			})
		},
		visibleDecisions() {
			return this.filteredDecisions.slice(0, this.visibleDecisionLimit)
		},
		auditSummary() {
			const totalReclaimed = this.auditLog.reduce((sum, entry) => sum + (entry.bytesReclaimed || 0), 0)
			return {
				runCount: this.auditLog.length,
				totalReclaimed,
				totalReclaimedFormatted: formatBytes(totalReclaimed),
			}
		},
		auditStatusFilters() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: this.auditLog.length }) },
				{ id: 'completed', label: this.t('duplicatefinder', 'Completed') },
				{ id: 'dry-run', label: this.t('duplicatefinder', 'Dry-run') },
				{ id: 'restored', label: this.t('duplicatefinder', 'Restored') },
			]
		},
		filteredAuditEntries() {
			if (this.auditFilter === 'all') {
				return this.auditLog
			}
			return this.auditLog.filter(entry => entry.status === this.auditFilter)
		},
	},
	watch: {
		unusedCriteria: {
			immediate: true,
			handler(list) {
				if (list.length > 0 && !list.some(item => item.id === this.criterionToAdd)) {
					this.criterionToAdd = list[0].id
				} else if (list.length === 0) {
					this.criterionToAdd = ''
				}
			},
		},
	},
	methods: {
		getCriterionLabel(criterionId) {
			const found = TIE_BREAKER_CRITERIA.find(item => item.id === criterionId)
			return found ? found.label : criterionId
		},
		formatRoleLabel(role) {
			if (role === 'survivor') {
				return this.t('duplicatefinder', 'KEEP')
			}
			if (role === 'shielded') {
				return this.t('duplicatefinder', 'SHIELDED')
			}
			if (role === 'deferred') {
				return this.t('duplicatefinder', 'CAPPED')
			}
			return this.t('duplicatefinder', 'DELETE')
		},
		formatAuditTimestamp(ts) {
			try {
				return new Date(ts).toLocaleString()
			} catch (error) {
				return String(ts)
			}
		},
		selectProfile(profile) {
			this.draftProfile = cloneProfile(profile)
			this.maxBatchInput = this.draftProfile.maxFilesPerBatch !== null
				? String(this.draftProfile.maxFilesPerBatch)
				: ''
			this.clearManualOverrides()
			this.statusNotice = this.t('duplicatefinder', 'Loaded profile "{name}".', { name: this.draftProfile.name })
		},
		saveCurrentAsCustomProfile() {
			const batchParsed = this.maxBatchInput.trim() ? Number(this.maxBatchInput.trim()) : null
			const candidate = sanitizeRuleProfile({
				...this.draftProfile,
				id: this.isEditingCustomProfile ? this.draftProfile.id : `custom-${Date.now()}`,
				builtin: false,
				maxFilesPerBatch: Number.isInteger(batchParsed) && batchParsed > 0 ? batchParsed : null,
			})
			const remaining = this.customProfiles.filter(item => item.id !== candidate.id)
			this.customProfiles = saveCustomRuleProfiles([candidate, ...remaining])
			this.draftProfile = cloneProfile(candidate)
			this.statusNotice = this.t('duplicatefinder', 'Saved profile "{name}".', { name: candidate.name })
		},
		deleteActiveCustomProfile() {
			if (!this.isEditingCustomProfile) {
				return
			}
			const deletedName = this.draftProfile.name
			const nextCustom = this.customProfiles.filter(item => item.id !== this.draftProfile.id)
			this.customProfiles = saveCustomRuleProfiles(nextCustom)
			this.selectProfile(BUILTIN_RULE_PROFILES[0])
			this.statusNotice = this.t('duplicatefinder', 'Deleted custom profile "{name}".', { name: deletedName })
		},
		exportActiveProfileJson() {
			const payload = exportRuleProfileJson(this.activeProfile)
			this.triggerDownload(`${this.activeProfile.id || 'rule-profile'}.json`, payload, 'application/json')
		},
		applyImportedProfile() {
			this.importError = ''
			const result = parseImportedRuleProfile(this.importJsonText)
			if (!result.ok || !result.profile) {
				this.importError = result.error || this.t('duplicatefinder', 'Invalid profile JSON.')
				return
			}
			this.customProfiles = saveCustomRuleProfiles([result.profile, ...this.customProfiles])
			this.selectProfile(result.profile)
			this.importPanelOpen = false
			this.importJsonText = ''
			this.statusNotice = this.t('duplicatefinder', 'Imported profile "{name}".', { name: result.profile.name })
		},
		moveCriterion(index, delta) {
			const targetIndex = index + delta
			if (targetIndex < 0 || targetIndex >= this.draftProfile.tieBreakers.length) {
				return
			}
			const next = [...this.draftProfile.tieBreakers]
			const [moved] = next.splice(index, 1)
			next.splice(targetIndex, 0, moved)
			this.draftProfile.tieBreakers = next
		},
		removeCriterion(criterionId) {
			if (this.draftProfile.tieBreakers.length <= 1) {
				return
			}
			this.draftProfile.tieBreakers = this.draftProfile.tieBreakers.filter(id => id !== criterionId)
		},
		addCriterion() {
			if (!this.criterionToAdd || this.draftProfile.tieBreakers.includes(this.criterionToAdd)) {
				return
			}
			this.draftProfile.tieBreakers = [...this.draftProfile.tieBreakers, this.criterionToAdd]
		},
		toggleExclusionPreset(presetId) {
			const exists = this.draftProfile.activeExclusionPresets.includes(presetId)
			if (exists) {
				this.draftProfile.activeExclusionPresets = this.draftProfile.activeExclusionPresets.filter(id => id !== presetId)
			} else {
				this.draftProfile.activeExclusionPresets = [...this.draftProfile.activeExclusionPresets, presetId]
			}
		},
		addCustomExclusion() {
			const pattern = this.newExclusionPattern.trim()
			if (!pattern || this.liveTesterCompile.error) {
				return
			}
			const label = this.newExclusionLabel.trim() || pattern
			this.draftProfile.customExclusions = [
				...this.draftProfile.customExclusions,
				{
					id: `custom-excl-${Date.now()}`,
					label,
					pattern,
					flags: this.liveTesterCompile.flags,
					enabled: true,
				},
			]
			this.newExclusionLabel = ''
			this.newExclusionPattern = ''
		},
		removeCustomExclusion(ruleId) {
			this.draftProfile.customExclusions = this.draftProfile.customExclusions.filter(rule => rule.id !== ruleId)
		},
		promoteSurvivor(groupId, fileKey) {
			this.$set(this.promotedByGroup, groupId, fileKey)
		},
		toggleManualShield(fileKey) {
			if (this.excludedKeySet.has(fileKey)) {
				this.excludedFileKeys = this.excludedFileKeys.filter(key => key !== fileKey)
			} else {
				this.excludedFileKeys = [...this.excludedFileKeys, fileKey]
			}
		},
		clearManualOverrides() {
			this.promotedByGroup = {}
			this.excludedFileKeys = []
		},
		resetDryRunFilters() {
			this.decisionFilter = 'all'
			this.decisionQuery = ''
			this.visibleDecisionLimit = 25
		},
		emitSelectGroup(groupId) {
			const found = this.allDuplicates.find(group => group && group.id === groupId)
			if (found) {
				this.$emit('select-duplicate', found)
			}
		},
		emitCompareGroup(groupId) {
			const found = this.allDuplicates.find(group => group && group.id === groupId)
			if (found) {
				this.$emit('compare-duplicate', found)
			}
		},
		recordDryRunSnapshot() {
			const entry = {
				id: `dryrun-${Date.now()}`,
				timestamp: Date.now(),
				status: 'dry-run',
				profileId: this.activeProfile.id,
				profileName: this.activeProfile.name,
				deletedCount: 0,
				failedCount: 0,
				shieldedCount: this.plan.summary.shieldedCount,
				bytesReclaimed: this.plan.summary.markedBytes,
				items: this.plan.markedFiles.slice(0, 100).map(file => ({
					path: file.path,
					survivorPath: file._survivorPath || '',
					size: Number(file.size) || 0,
					nodeId: file.nodeId || null,
					outcome: 'planned',
				})),
			}
			this.auditLog = appendRuleAuditEntry(entry)
			this.statusNotice = this.t('duplicatefinder', 'Recorded dry-run snapshot ({count} files planned).', {
				count: this.plan.summary.markedCount,
			})
		},
		openExecuteConfirmDialog() {
			if (this.plan.summary.markedCount === 0 || this.isExecuting) {
				return
			}
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closeExecuteConfirmDialog() {
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.close === 'function' && dialog.open) {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
		},
		onConfirmDialogClose() {
			// Native dialog ESC or close cleanup hook
		},
		async confirmAndExecuteBatch() {
			this.closeExecuteConfirmDialog()
			const targetFiles = [...this.plan.markedFiles]
			if (targetFiles.length === 0 || this.isExecuting) {
				return
			}

			this.isExecuting = true
			this.executionDone = 0
			this.executionTotal = targetFiles.length

			const deletedFiles = []
			const failedFiles = []
			const deletedNodeIds = new Set()

			try {
				for (const file of targetFiles) {
					const response = await deleteFiles([file], { deletedNodeIds })
					if (response && Array.isArray(response.success) && response.success.length > 0) {
						deletedFiles.push(...response.success)
					} else {
						failedFiles.push(file)
					}
					this.executionDone += 1
				}

				const bytesReclaimed = deletedFiles.reduce(
					(sum, file) => sum + (Number(file && file.size) > 0 ? Number(file.size) : 0),
					0
				)
				const entryStatus = failedFiles.length > 0 && deletedFiles.length > 0
					? 'partial'
					: (failedFiles.length > 0 ? 'partial' : 'completed')

				this.auditLog = appendRuleAuditEntry({
					id: `batch-${Date.now()}`,
					timestamp: Date.now(),
					status: entryStatus,
					profileId: this.activeProfile.id,
					profileName: this.activeProfile.name,
					deletedCount: deletedFiles.length,
					failedCount: failedFiles.length,
					shieldedCount: this.plan.summary.shieldedCount,
					bytesReclaimed,
					items: [
						...deletedFiles.map(file => ({
							path: file.path,
							survivorPath: file._survivorPath || '',
							size: Number(file.size) || 0,
							nodeId: file.nodeId || null,
							outcome: 'deleted',
						})),
						...failedFiles.map(file => ({
							path: file.path,
							survivorPath: file._survivorPath || '',
							size: Number(file.size) || 0,
							nodeId: file.nodeId || null,
							outcome: 'failed',
						})),
					],
				})

				if (deletedFiles.length > 0) {
					this.$emit('rule-delete-completed', {
						deletedFiles,
						deletedNodeIds: Array.from(deletedNodeIds),
						bytesReclaimed,
						groupsResolved: this.plan.summary.groupsWithCleanup,
						sampleLabel: deletedFiles[0].path || '',
					})
				}

				this.statusNotice = this.t('duplicatefinder', 'Batch finished: {deleted} deleted, {failed} failed ({size} reclaimed).', {
					deleted: deletedFiles.length,
					failed: failedFiles.length,
					size: formatBytes(bytesReclaimed),
				})
			} finally {
				this.isExecuting = false
			}
		},
		toggleAuditExpand(entryId) {
			this.expandedAuditId = this.expandedAuditId === entryId ? '' : entryId
		},
		markAuditStatus(entryId, status) {
			this.auditLog = updateAuditEntryStatus(entryId, status)
		},
		downloadEntryRestoreScript(entry) {
			const script = buildTrashbinRestorePlan(entry)
			this.triggerDownload(`restore-plan-${entry.id}.sh`, script, 'text/x-shellscript')
		},
		downloadAuditCsv() {
			this.triggerDownload('duplicatefinder-rule-audit.csv', exportAuditLogCsv(this.auditLog), 'text/csv;charset=utf-8')
		},
		downloadAuditJson() {
			this.triggerDownload('duplicatefinder-rule-audit.json', exportAuditLogJson(this.auditLog), 'application/json')
		},
		clearAuditHistory() {
			this.auditLog = clearRuleAuditLog()
			this.expandedAuditId = ''
		},
		triggerDownload(filename, content, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = url
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			URL.revokeObjectURL(url)
		},
	},
}
</script>

<style scoped>
.rule-profiles-workbench {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-block-end: 16px;
	padding-block: 14px;
	padding-inline: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	min-inline-size: 0;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.rule-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.rule-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.rule-workbench__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.rule-workbench__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	border: 1px solid var(--color-border);
	font-size: 0.78rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.rule-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rule-workbench__tool-btn,
.rule-workbench__seg-btn,
.rule-workbench__mini-btn,
.rule-workbench__primary-btn,
.rule-workbench__danger-btn,
.rule-workbench__danger-outline-btn,
.rule-workbench__pill-btn,
.rule-workbench__tab-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 34px;
	padding-block: 5px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.82rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.rule-workbench__mini-btn {
	min-block-size: 28px;
	padding-block: 3px;
	padding-inline: 8px;
	font-size: 0.76rem;
}

.rule-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.rule-workbench__danger-btn {
	background-color: var(--color-error, #b3261e);
	border-color: var(--color-error, #b3261e);
	color: #ffffff;
}

.rule-workbench__danger-outline-btn {
	border-color: var(--color-error, #b3261e);
	color: var(--color-error, #b3261e);
}

.rule-workbench__tool-btn:hover:not(:disabled),
.rule-workbench__seg-btn:hover:not(:disabled),
.rule-workbench__mini-btn:hover:not(:disabled),
.rule-workbench__pill-btn:hover:not(:disabled),
.rule-workbench__tab-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.rule-workbench__tool-btn:focus-visible,
.rule-workbench__seg-btn:focus-visible,
.rule-workbench__mini-btn:focus-visible,
.rule-workbench__primary-btn:focus-visible,
.rule-workbench__danger-btn:focus-visible,
.rule-workbench__danger-outline-btn:focus-visible,
.rule-workbench__pill-btn:focus-visible,
.rule-workbench__tab-btn:focus-visible,
.rule-workbench__input:focus-visible,
.rule-workbench__flag-input:focus-visible,
.rule-workbench__select:focus-visible,
.rule-workbench__search-input:focus-visible,
.rule-workbench__textarea:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.rule-workbench__tool-btn:disabled,
.rule-workbench__primary-btn:disabled,
.rule-workbench__danger-btn:disabled,
.rule-workbench__danger-outline-btn:disabled,
.rule-workbench__mini-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.rule-workbench__seg-btn.is-active,
.rule-workbench__pill-btn.is-active,
.rule-workbench__tab-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rule-workbench__import-panel,
.rule-editor-card,
.rule-exclusions__presets,
.rule-exclusions__custom,
.rule-exclusions__matches {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rule-workbench__notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-primary-element);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-primary-element-light);
	font-size: 0.84rem;
}

.rule-workbench__alert,
.rule-workbench__error-text {
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-error, #b3261e);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-error, #b3261e);
	font-size: 0.84rem;
	font-weight: 600;
}

.rule-workbench__alert-line {
	margin: 0;
}

.rule-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.rule-kpi-card {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rule-kpi-card__label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.rule-kpi-card__value {
	font-size: 1.08rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.rule-kpi-card__sub {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rule-workbench__tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	border-block-end: 1px solid var(--color-border);
	padding-block-end: 8px;
}

.rule-workbench__panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
}

.rule-workbench__profile-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rule-workbench__profile-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rule-workbench__pill-tag {
	padding-block: 1px;
	padding-inline: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	font-size: 0.7rem;
}

.rule-workbench__editor-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.rule-editor-card__title {
	margin: 0;
	font-size: 0.9rem;
	font-weight: 700;
}

.rule-editor-card__fields {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.rule-field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.rule-field-row {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.rule-field-inline {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.rule-workbench__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.rule-workbench__input,
.rule-workbench__select,
.rule-workbench__search-input,
.rule-workbench__textarea {
	flex: 1 1 160px;
	min-inline-size: 0;
	inline-size: 100%;
	box-sizing: border-box;
	min-block-size: 34px;
	padding-block: 5px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
}

.rule-workbench__flag-input {
	inline-size: 54px;
	box-sizing: border-box;
	min-block-size: 34px;
	padding-block: 5px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-family: monospace;
	font-size: 0.84rem;
	text-align: center;
}

.rule-toggles {
	display: flex;
	flex-wrap: wrap;
	gap: 12px;
}

.rule-workbench__checkbox-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.82rem;
	cursor: pointer;
}

.rule-tiebreaker-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.rule-tiebreaker-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 6px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
}

.rule-tiebreaker-item__info {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.rule-tiebreaker-item__rank {
	font-size: 0.76rem;
	font-weight: 700;
	color: var(--color-primary-element);
	font-variant-numeric: tabular-nums;
}

.rule-tiebreaker-item__label {
	font-size: 0.82rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.rule-tiebreaker-item__actions {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}

.rule-workbench__dryrun-controls,
.rule-audit__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rule-workbench__filter-group,
.rule-audit__actions,
.rule-workbench__import-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rule-workbench__search-input {
	max-inline-size: 280px;
}

.rule-decision-list,
.rule-audit__list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.rule-decision-card,
.rule-audit-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rule-decision-card.is-current {
	border-color: var(--color-primary-element);
}

.rule-decision-card__header,
.rule-audit-card__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rule-decision-card__meta,
.rule-decision-card__actions,
.rule-audit-card__meta,
.rule-audit-card__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.rule-decision-card__hash {
	font-family: monospace;
	font-size: 0.78rem;
	font-weight: 700;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	background-color: var(--color-background-dark);
}

.rule-decision-card__summary,
.rule-audit-card__stats,
.rule-audit-card__time {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	margin: 0;
}

.rule-decision-card__files,
.rule-custom-list,
.rule-shielded-list,
.rule-live-tester__list,
.rule-audit-card__items {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.rule-file-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 6px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
}

.rule-file-row.is-survivor {
	border-inline-start: 4px solid var(--color-success, #2d8a4e);
}

.rule-file-row.is-marked {
	border-inline-start: 4px solid var(--color-error, #b3261e);
}

.rule-file-row.is-shielded {
	border-inline-start: 4px solid var(--color-warning, #b26a00);
}

.rule-file-row__main,
.rule-file-row__sub {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	min-inline-size: 0;
}

.rule-file-row__badge,
.rule-audit-card__status,
.rule-audit-item__outcome {
	padding-block: 1px;
	padding-inline: 6px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	font-size: 0.7rem;
	font-weight: 700;
	text-transform: uppercase;
}

.rule-file-row__path,
.rule-shielded-item__path,
.rule-live-tester__path,
.rule-audit-item__path {
	flex: 1 1 200px;
	min-inline-size: 0;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.rule-file-row__size,
.rule-file-row__score,
.rule-file-row__reason {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.rule-file-row__btns {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}

.rule-workbench__execute-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.rule-workbench__execute-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	font-size: 0.86rem;
}

.rule-workbench__execute-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rule-preset-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.rule-preset-card {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	cursor: pointer;
	min-inline-size: 0;
}

.rule-preset-card.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.rule-preset-card__body {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-inline-size: 0;
}

.rule-preset-card__title {
	font-size: 0.82rem;
}

.rule-preset-card__pattern,
.rule-custom-item__pattern {
	font-size: 0.74rem;
	overflow-wrap: anywhere;
	color: var(--color-text-maxcontrast);
}

.rule-preset-card__count,
.rule-custom-item__count,
.rule-shielded-item__rule,
.rule-shielded-item__size,
.rule-audit-item__survivor {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.rule-custom-builder {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
	gap: 8px;
}

.rule-custom-item,
.rule-shielded-item,
.rule-audit-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
}

.rule-match-mark {
	background-color: var(--color-primary-element-light);
	color: var(--color-main-text);
	font-weight: 700;
	border-radius: 2px;
	padding-inline: 2px;
}

.rule-workbench__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.rule-workbench__empty-title {
	margin: 0;
	font-weight: 700;
}

.rule-workbench__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 65ch;
}

.rule-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.rule-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.rule-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.rule-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.rule-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.rule-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.rule-workbench__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.rule-workbench__editor-grid,
	.rule-preset-grid,
	.rule-custom-builder,
	.rule-field-row {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.rule-profiles-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.rule-workbench__tool-btn,
	.rule-workbench__seg-btn,
	.rule-workbench__mini-btn,
	.rule-workbench__primary-btn,
	.rule-workbench__danger-btn,
	.rule-workbench__danger-outline-btn,
	.rule-workbench__pill-btn,
	.rule-workbench__tab-btn,
	.rule-workbench__input,
	.rule-workbench__flag-input,
	.rule-workbench__select,
	.rule-workbench__search-input,
	.rule-workbench__checkbox-label {
		min-block-size: 44px;
	}

	.rule-workbench__search-input {
		max-inline-size: none;
	}
}

@media (max-width: 520px) {
	.rule-workbench__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
