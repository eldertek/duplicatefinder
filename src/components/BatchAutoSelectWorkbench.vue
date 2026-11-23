<template>
	<section
		class="batch-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Batch Auto-Select Rules and Reference Anchor Triage')">
		<header class="batch-workbench__toolbar">
			<div class="batch-workbench__title-group">
				<h3 class="batch-workbench__title">
					{{ t('duplicatefinder', 'Batch Auto-Select Rules') }}
				</h3>
				<span
					class="batch-workbench__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{groups} groups, {files} marked ({size})', {
						groups: plan.summary.matchedGroupCount,
						files: plan.summary.markedFileCount,
						size: plan.summary.reclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="batch-workbench__toolbar-actions">
				<button
					type="button"
					class="batch-workbench__tool-btn"
					:disabled="isDefaultState || isExecuting"
					@click="resetRules">
					<span>{{ t('duplicatefinder', 'Reset rules') }}</span>
				</button>
				<button
					type="button"
					class="batch-workbench__tool-btn is-close"
					aria-keyshortcuts="w"
					:title="t('duplicatefinder', 'Hide batch auto-select rules')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide batch rules') }}</span>
				</button>
			</div>
		</header>

		<div v-if="allDuplicates.length === 0" class="batch-workbench__empty">
			<p class="batch-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="batch-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to apply cross-group smart keep rules and safely batch-clean redundant copies.') }}
			</p>
			<button
				type="button"
				class="batch-workbench__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="batch-workbench__controls">
				<div class="batch-workbench__control-group">
					<span class="batch-workbench__control-label">
						{{ t('duplicatefinder', 'Keep & selection rule') }}
					</span>
					<div
						class="batch-workbench__rule-pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Automated batch selection rule')">
						<button
							v-for="ruleOption in ruleOptions"
							:key="ruleOption.id"
							type="button"
							class="batch-workbench__pill-btn"
							:class="{ 'is-active': rule === ruleOption.id }"
							:aria-pressed="rule === ruleOption.id ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="setRule(ruleOption.id)">
							<span>{{ ruleOption.label }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="rule === 'keep_preferred_folder'"
					class="batch-workbench__control-group batch-workbench__conditional-box">
					<label
						for="batch-preferred-folder-input"
						class="batch-workbench__control-label">
						{{ t('duplicatefinder', 'Preferred Reference Folder (keep copies inside this path)') }}
					</label>
					<div class="batch-workbench__input-row">
						<input
							id="batch-preferred-folder-input"
							v-model="preferredFolder"
							type="text"
							class="batch-workbench__text-input"
							:disabled="isExecuting"
							:placeholder="t('duplicatefinder', 'e.g. /Photos or /Origin')">
						<button
							type="button"
							class="batch-workbench__toggle-chip"
							:class="{ 'is-active': !requireFolderMatch }"
							:aria-pressed="!requireFolderMatch ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="requireFolderMatch = !requireFolderMatch">
							<span>{{ requireFolderMatch
								? t('duplicatefinder', 'Only groups matching folder')
								: t('duplicatefinder', 'Fallback to oldest if absent') }}</span>
						</button>
					</div>
					<div
						v-if="plan.availableFolders.length > 0"
						class="batch-workbench__chips-row"
						role="group"
						:aria-label="t('duplicatefinder', 'Detected folders')">
						<button
							v-for="item in plan.availableFolders"
							:key="item.folder"
							type="button"
							class="batch-workbench__quick-chip"
							:class="{ 'is-active': preferredFolder === item.folder }"
							:disabled="isExecuting"
							@click="preferredFolder = item.folder">
							<span>{{ item.folder }} ({{ item.groupCount }})</span>
						</button>
					</div>
				</div>

				<div
					v-if="rule === 'mark_pattern_matches'"
					class="batch-workbench__control-group batch-workbench__conditional-box">
					<label
						for="batch-pattern-input"
						class="batch-workbench__control-label">
						{{ t('duplicatefinder', 'Mark copies matching path or filename pattern (glob or /regex/)') }}
					</label>
					<div class="batch-workbench__input-row">
						<input
							id="batch-pattern-input"
							v-model="pattern"
							type="text"
							class="batch-workbench__text-input"
							:class="{ 'is-invalid': Boolean(patternError) }"
							:disabled="isExecuting"
							:placeholder="t('duplicatefinder', 'e.g. * (1)*, */Downloads/*, or /_copy\\./i')">
					</div>
					<p
						v-if="patternError"
						class="batch-workbench__validation-error"
						role="alert">
						{{ patternError }}
					</p>
					<div
						class="batch-workbench__chips-row"
						role="group"
						:aria-label="t('duplicatefinder', 'Pattern presets')">
						<button
							v-for="preset in patternPresets"
							:key="preset.id"
							type="button"
							class="batch-workbench__quick-chip"
							:class="{ 'is-active': pattern === preset.pattern }"
							:disabled="isExecuting"
							@click="pattern = preset.pattern">
							<span>{{ preset.label }}</span>
						</button>
					</div>
				</div>

				<div class="batch-workbench__scope-row">
					<div
						class="batch-workbench__scope-group"
						role="group"
						:aria-label="t('duplicatefinder', 'Batch evaluation scope')">
						<button
							type="button"
							class="batch-workbench__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Filtered groups ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="batch-workbench__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allDuplicates.length }) }}</span>
						</button>
					</div>

					<div class="batch-workbench__options-group">
						<button
							type="button"
							class="batch-workbench__toggle-chip"
							:class="{ 'is-active': includeAcknowledged }"
							:aria-pressed="includeAcknowledged ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="includeAcknowledged = !includeAcknowledged">
							<span>{{ t('duplicatefinder', 'Include acknowledged') }}</span>
						</button>
						<button
							v-if="hasManualOverrides"
							type="button"
							class="batch-workbench__toggle-chip"
							:disabled="isExecuting"
							@click="clearManualOverrides">
							<span>{{ t('duplicatefinder', 'Clear manual overrides') }}</span>
						</button>
					</div>
				</div>
			</div>

			<div class="batch-workbench__kpi-grid">
				<div class="batch-workbench__kpi-card is-highlight">
					<div class="batch-workbench__kpi-label">
						{{ t('duplicatefinder', 'Groups matched') }}
					</div>
					<p class="batch-workbench__kpi-value">
						{{ plan.summary.matchedGroupCount }} / {{ plan.summary.totalGroupsEvaluated }}
					</p>
					<p class="batch-workbench__kpi-meta">
						{{ t('duplicatefinder', '{protected} protected-only, {ack} ack skipped', {
							protected: plan.summary.protectedOnlyGroupCount,
							ack: plan.summary.skippedAcknowledgedCount,
						}) }}
					</p>
				</div>

				<div class="batch-workbench__kpi-card">
					<div class="batch-workbench__kpi-label">
						{{ t('duplicatefinder', 'Marked for cleanup') }}
					</div>
					<p class="batch-workbench__kpi-value">
						{{ plan.summary.markedFileCount }}
					</p>
					<p class="batch-workbench__kpi-meta">
						{{ t('duplicatefinder', 'Protected origin files always skipped') }}
					</p>
				</div>

				<div class="batch-workbench__kpi-card">
					<div class="batch-workbench__kpi-label">
						{{ t('duplicatefinder', 'Copies kept safe') }}
					</div>
					<p class="batch-workbench__kpi-value">
						{{ plan.summary.keptFileCount }}
					</p>
					<p class="batch-workbench__kpi-meta">
						{{ t('duplicatefinder', 'At least 1 reference anchor per group') }}
					</p>
				</div>

				<div class="batch-workbench__kpi-card is-highlight">
					<div class="batch-workbench__kpi-label">
						{{ t('duplicatefinder', 'Space reclaimable') }}
					</div>
					<p class="batch-workbench__kpi-value">
						{{ plan.summary.reclaimableFormatted }}
					</p>
					<p class="batch-workbench__kpi-meta">
						{{ t('duplicatefinder', 'Live dry-run impact estimate') }}
					</p>
				</div>
			</div>

			<div
				class="batch-workbench__action-bar"
				role="region"
				:aria-label="t('duplicatefinder', 'Batch actions')">
				<div class="batch-workbench__action-summary" role="status" aria-live="polite">
					<span v-if="isExecuting">
						{{ executionProgressText }}
					</span>
					<span v-else-if="plan.summary.markedFileCount > 0">
						{{ t('duplicatefinder', 'Ready: {files} copies across {groups} groups ({size})', {
							files: plan.summary.markedFileCount,
							groups: plan.summary.matchedGroupCount,
							size: plan.summary.reclaimableFormatted,
						}) }}
					</span>
					<span v-else>
						{{ t('duplicatefinder', 'No files currently marked for deletion under this rule.') }}
					</span>
				</div>
				<div class="batch-workbench__action-buttons">
					<button
						type="button"
						class="batch-workbench__danger-btn"
						:disabled="isExecuting || plan.summary.markedFileCount === 0"
						@click="openBatchDeleteDialog">
						<span>{{ t('duplicatefinder', 'Delete marked ({count})', { count: plan.summary.markedFileCount }) }}</span>
					</button>
					<button
						type="button"
						class="batch-workbench__secondary-btn"
						:disabled="isExecuting || unacknowledgedMatchedGroups.length === 0"
						@click="acknowledgeMatchedGroups">
						<span>{{ t('duplicatefinder', 'Acknowledge matched ({count})', { count: unacknowledgedMatchedGroups.length }) }}</span>
					</button>
					<button
						type="button"
						class="batch-workbench__secondary-btn"
						:disabled="isExecuting || plan.summary.markedFileCount === 0"
						@click="exportPlanJson">
						<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
					</button>
					<button
						type="button"
						class="batch-workbench__secondary-btn"
						:disabled="isExecuting || plan.summary.markedFileCount === 0"
						@click="exportPlanCsv">
						<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="feedbackMessage"
				class="batch-workbench__feedback"
				:class="{ 'is-error': feedbackType === 'error', 'is-success': feedbackType === 'success' }"
				:role="feedbackType === 'error' ? 'alert' : 'status'"
				aria-live="polite">
				<span class="batch-workbench__feedback-text">{{ feedbackMessage }}</span>
				<button
					type="button"
					class="batch-workbench__feedback-dismiss"
					:aria-label="t('duplicatefinder', 'Dismiss notification')"
					@click="feedbackMessage = ''">
					×
				</button>
			</div>

			<div
				v-if="plan.groups.length === 0 || (plan.summary.markedFileCount === 0 && !showUnmatchedGroups)"
				class="batch-workbench__no-matches"
				role="status"
				aria-live="polite">
				<p class="batch-workbench__no-matches-title">
					{{ t('duplicatefinder', 'No groups matched for batch selection') }}
				</p>
				<p class="batch-workbench__no-matches-hint">
					{{ noMatchHintText }}
				</p>
				<div class="batch-workbench__no-matches-actions">
					<button
						v-if="plan.groups.length > 0"
						type="button"
						class="batch-workbench__secondary-btn"
						@click="showUnmatchedGroups = true">
						<span>{{ t('duplicatefinder', 'Show skipped/protected groups ({count})', { count: plan.groups.length }) }}</span>
					</button>
					<button
						v-if="!isDefaultState"
						type="button"
						class="batch-workbench__secondary-btn"
						@click="resetRules">
						<span>{{ t('duplicatefinder', 'Reset rules') }}</span>
					</button>
				</div>
			</div>

			<div v-else class="batch-workbench__groups-list">
				<div
					v-if="unmatchedGroupCount > 0"
					class="batch-workbench__list-filter-bar">
					<button
						type="button"
						class="batch-workbench__toggle-chip"
						:class="{ 'is-active': showUnmatchedGroups }"
						:aria-pressed="showUnmatchedGroups ? 'true' : 'false'"
						@click="showUnmatchedGroups = !showUnmatchedGroups">
						<span>{{ showUnmatchedGroups
							? t('duplicatefinder', 'Hide skipped/protected groups ({count})', { count: unmatchedGroupCount })
							: t('duplicatefinder', 'Show skipped/protected groups ({count})', { count: unmatchedGroupCount }) }}</span>
					</button>
				</div>

				<article
					v-for="entry in visiblePlanEntries"
					:key="entry.groupKey"
					class="batch-group-card"
					:class="{
						'is-active-group': currentDuplicateId && entry.groupId === currentDuplicateId,
						'is-protected-only': entry.status === 'protected_only',
						'is-skipped': entry.status === 'skipped_acknowledged' || entry.status === 'no_rule_match',
					}">
					<header class="batch-group-card__header">
						<div class="batch-group-card__title-wrap">
							<span
								class="batch-group-card__status-pill"
								:class="'is-' + entry.status">
								{{ formatEntryStatusLabel(entry) }}
							</span>
							<h4 class="batch-group-card__title">
								{{ entry.groupName }}
							</h4>
							<span class="batch-group-card__meta">
								{{ t('duplicatefinder', '{total} copies, {reclaimable} reclaimable', {
									total: entry.totalFiles,
									reclaimable: formatSize(entry.groupReclaimableBytes),
								}) }}
							</span>
						</div>
						<div class="batch-group-card__header-actions">
							<button
								v-if="hasGroupManualOverride(entry.groupKey)"
								type="button"
								class="batch-group-card__btn"
								:disabled="isExecuting"
								@click="resetGroupOverride(entry.groupKey)">
								<span>{{ t('duplicatefinder', 'Reset group') }}</span>
							</button>
							<button
								type="button"
								class="batch-group-card__btn"
								@click="$emit('select-duplicate', entry.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="batch-group-card__btn is-compare"
								@click="$emit('compare-duplicate', entry.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</header>

					<div class="batch-group-card__files">
						<div
							v-for="file in entry.allFiles"
							:key="getFileKey(file)"
							class="batch-file-row"
							:class="{
								'is-anchor': isAnchorFile(entry, file),
								'is-marked': isMarkedFile(entry, file),
								'is-protected': Boolean(file.isInOriginFolder),
							}">
							<div class="batch-file-row__leading">
								<input
									v-if="!file.isInOriginFolder && !isAnchorFile(entry, file)"
									type="checkbox"
									class="batch-file-row__checkbox"
									:checked="isMarkedFile(entry, file)"
									:disabled="isExecuting"
									:aria-label="t('duplicatefinder', 'Mark {path} for deletion', { path: displayFilePath(file) })"
									@change="toggleFileMarked(entry, file)">
								<span
									v-else
									class="batch-file-row__lock-indicator"
									:title="file.isInOriginFolder
										? t('duplicatefinder', 'Protected origin folder')
										: t('duplicatefinder', 'Kept reference anchor')"
									aria-hidden="true">
									●
								</span>
							</div>

							<div class="batch-file-row__body">
								<div class="batch-file-row__path-line">
									<span class="batch-file-row__path" :title="displayFilePath(file)">
										{{ displayFilePath(file) }}
									</span>
									<span
										v-if="file.isInOriginFolder"
										class="batch-file-row__tag is-protected">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
									<span
										v-else-if="isAnchorFile(entry, file)"
										class="batch-file-row__tag is-anchor">
										{{ t('duplicatefinder', 'Kept Reference ({reason})', {
											reason: formatAnchorReason(entry.anchorReason),
										}) }}
									</span>
									<span
										v-else-if="isMarkedFile(entry, file)"
										class="batch-file-row__tag is-marked">
										{{ t('duplicatefinder', 'Marked for delete') }}
									</span>
									<span
										v-else
										class="batch-file-row__tag is-kept">
										{{ t('duplicatefinder', 'Kept') }}
									</span>
								</div>
								<div class="batch-file-row__meta">
									<span>{{ formatSize(Number(file.size) || 0) }}</span>
									<span v-if="formatModified(file)">{{ formatModified(file) }}</span>
								</div>
							</div>

							<div class="batch-file-row__actions">
								<button
									v-if="!file.isInOriginFolder && !isAnchorFile(entry, file) && entry.status !== 'protected_only'"
									type="button"
									class="batch-file-row__promote-btn"
									:disabled="isExecuting"
									:title="t('duplicatefinder', 'Promote this copy to the kept reference anchor')"
									@click="promoteToReference(entry, file)">
									<span>{{ t('duplicatefinder', 'Make Reference') }}</span>
								</button>
							</div>
						</div>
					</div>
				</article>
			</div>
		</template>

		<dialog
			v-if="showDeleteDialog"
			ref="batchDeleteDialog"
			class="batch-confirm-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="batch-delete-dialog-title"
			aria-describedby="batch-delete-dialog-desc"
			@cancel.prevent="closeBatchDeleteDialog"
			@keydown.esc.prevent.stop="closeBatchDeleteDialog"
			@click.self="closeBatchDeleteDialog">
			<div class="batch-confirm-dialog__surface">
				<h4 id="batch-delete-dialog-title" class="batch-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm batch deletion') }}
				</h4>
				<p id="batch-delete-dialog-desc" class="batch-confirm-dialog__desc">
					{{ t('duplicatefinder', 'Permanently delete {files} redundant copies across {groups} duplicate groups? At least one reference copy will remain safe in every group.', {
						files: plan.summary.markedFileCount,
						groups: plan.summary.matchedGroupCount,
					}) }}
				</p>
				<dl class="batch-confirm-dialog__stats">
					<div class="batch-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Files to delete') }}</dt>
						<dd>{{ plan.summary.markedFileCount }}</dd>
					</div>
					<div class="batch-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Copies kept safe') }}</dt>
						<dd>{{ plan.summary.keptFileCount }}</dd>
					</div>
					<div class="batch-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Space freed') }}</dt>
						<dd>{{ plan.summary.reclaimableFormatted }}</dd>
					</div>
				</dl>
				<div class="batch-confirm-dialog__actions">
					<button
						type="button"
						class="batch-confirm-dialog__btn is-cancel"
						@click="closeBatchDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="batch-confirm-dialog__btn is-danger"
						@click="executeBatchDelete">
						<span>{{ t('duplicatefinder', 'Delete {count} files', { count: plan.summary.markedFileCount }) }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { acknowledgeDuplicate, deleteFiles } from '../tools/api'
import {
	BATCH_PATTERN_PRESETS,
	buildBatchAutoSelectPlan,
	buildBatchPlanCsv,
	buildBatchPlanJson,
} from '../tools/batchAutoSelect'
import { formatFileModifiedTime, normalizePathForDiff } from '../tools/duplicatePathDiff'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { formatBytes } from '../tools/duplicateStats'

export default {
	name: 'BatchAutoSelectWorkbench',
	props: {
		filteredDuplicates: {
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
			rule: 'keep_oldest',
			scope: 'filtered',
			preferredFolder: '',
			requireFolderMatch: true,
			pattern: '* (1)*',
			includeAcknowledged: false,
			manualAnchorsByGroup: {},
			excludedFileKeysByGroup: {},
			showUnmatchedGroups: false,
			isExecuting: false,
			executionProgressText: '',
			feedbackMessage: '',
			feedbackType: 'info',
			showDeleteDialog: false,
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		ruleOptions() {
			return [
				{ id: 'keep_oldest', label: this.t('duplicatefinder', 'Keep oldest') },
				{ id: 'keep_newest', label: this.t('duplicatefinder', 'Keep newest') },
				{ id: 'keep_shortest_path', label: this.t('duplicatefinder', 'Keep shortest path') },
				{ id: 'keep_deepest_path', label: this.t('duplicatefinder', 'Keep deepest path') },
				{ id: 'keep_preferred_folder', label: this.t('duplicatefinder', 'Keep preferred folder') },
				{ id: 'mark_pattern_matches', label: this.t('duplicatefinder', 'Mark by path/name pattern') },
			]
		},
		patternPresets() {
			return BATCH_PATTERN_PRESETS
		},
		filteredCount() {
			return Array.isArray(this.filteredDuplicates) ? this.filteredDuplicates.length : 0
		},
		sourceGroups() {
			if (this.scope === 'all') {
				return Array.isArray(this.allDuplicates) ? this.allDuplicates : []
			}
			if (Array.isArray(this.filteredDuplicates) && this.filteredDuplicates.length > 0) {
				return this.filteredDuplicates
			}
			return Array.isArray(this.filteredDuplicates) ? this.filteredDuplicates : []
		},
		plan() {
			return buildBatchAutoSelectPlan(this.sourceGroups, {
				rule: this.rule,
				preferredFolder: this.preferredFolder,
				requireFolderMatch: this.requireFolderMatch,
				pattern: this.pattern,
				includeAcknowledged: this.includeAcknowledged,
				manualAnchorsByGroup: this.manualAnchorsByGroup,
				excludedFileKeysByGroup: this.excludedFileKeysByGroup,
			})
		},
		patternError() {
			if (this.rule !== 'mark_pattern_matches') {
				return ''
			}
			return this.plan.patternValidation && this.plan.patternValidation.error
				? this.plan.patternValidation.error
				: ''
		},
		hasManualOverrides() {
			return Object.keys(this.manualAnchorsByGroup).length > 0
				|| Object.keys(this.excludedFileKeysByGroup).length > 0
		},
		isDefaultState() {
			return this.rule === 'keep_oldest'
				&& this.scope === 'filtered'
				&& !this.preferredFolder
				&& this.requireFolderMatch === true
				&& this.pattern === '* (1)*'
				&& this.includeAcknowledged === false
				&& !this.hasManualOverrides
		},
		visiblePlanEntries() {
			if (this.showUnmatchedGroups) {
				return this.plan.groups
			}
			return this.plan.groups.filter(entry => entry.markedFiles.length > 0 || this.hasGroupManualOverride(entry.groupKey))
		},
		unmatchedGroupCount() {
			return this.plan.groups.filter(entry => entry.markedFiles.length === 0 && !this.hasGroupManualOverride(entry.groupKey)).length
		},
		unacknowledgedMatchedGroups() {
			return this.plan.groups.filter(entry => !entry.acknowledged && entry.markedFiles.length > 0)
		},
		noMatchHintText() {
			if (this.rule === 'keep_preferred_folder' && !this.preferredFolder.trim()) {
				return this.t('duplicatefinder', 'Choose one of the detected folder chips or type a reference folder prefix to keep copies inside it.')
			}
			if (this.rule === 'mark_pattern_matches' && this.patternError) {
				return this.patternError
			}
			if (this.rule === 'mark_pattern_matches') {
				return this.t('duplicatefinder', 'No redundant copies matched that pattern. Try a preset like *copy* or switch to a Keep rule.')
			}
			return this.t('duplicatefinder', 'All evaluated groups are either protected-only, already acknowledged, or excluded by your current filter scope.')
		},
	},
	methods: {
		setRule(ruleId) {
			this.rule = ruleId
			this.feedbackMessage = ''
		},
		resetRules() {
			this.rule = 'keep_oldest'
			this.scope = 'filtered'
			this.preferredFolder = ''
			this.requireFolderMatch = true
			this.pattern = '* (1)*'
			this.includeAcknowledged = false
			this.manualAnchorsByGroup = {}
			this.excludedFileKeysByGroup = {}
			this.showUnmatchedGroups = false
			this.feedbackMessage = ''
		},
		clearManualOverrides() {
			this.manualAnchorsByGroup = {}
			this.excludedFileKeysByGroup = {}
		},
		hasGroupManualOverride(groupKey) {
			if (!groupKey) {
				return false
			}
			return Boolean(this.manualAnchorsByGroup[groupKey])
				|| (Array.isArray(this.excludedFileKeysByGroup[groupKey]) && this.excludedFileKeysByGroup[groupKey].length > 0)
		},
		resetGroupOverride(groupKey) {
			if (!groupKey) {
				return
			}
			if (this.manualAnchorsByGroup[groupKey]) {
				this.$delete(this.manualAnchorsByGroup, groupKey)
			}
			if (this.excludedFileKeysByGroup[groupKey]) {
				this.$delete(this.excludedFileKeysByGroup, groupKey)
			}
		},
		getFileKey(file) {
			return String(getFileSelectionKey(file) ?? '')
		},
		displayFilePath(file) {
			return normalizePathForDiff(file && file.path ? file.path : '')
		},
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		formatModified(file) {
			return formatFileModifiedTime(file)
		},
		isAnchorFile(entry, file) {
			return Boolean(entry && entry.anchorKey && this.getFileKey(file) === entry.anchorKey)
		},
		isMarkedFile(entry, file) {
			const key = this.getFileKey(file)
			return Boolean(entry && Array.isArray(entry.markedFiles) && entry.markedFiles.some(item => this.getFileKey(item) === key))
		},
		promoteToReference(entry, file) {
			if (!entry || !entry.groupKey || !file || file.isInOriginFolder) {
				return
			}
			const key = this.getFileKey(file)
			if (!key) {
				return
			}
			this.$set(this.manualAnchorsByGroup, entry.groupKey, key)
			const existingExcluded = Array.isArray(this.excludedFileKeysByGroup[entry.groupKey])
				? this.excludedFileKeysByGroup[entry.groupKey]
				: []
			if (existingExcluded.includes(key)) {
				const filtered = existingExcluded.filter(item => item !== key)
				if (filtered.length > 0) {
					this.$set(this.excludedFileKeysByGroup, entry.groupKey, filtered)
				} else {
					this.$delete(this.excludedFileKeysByGroup, entry.groupKey)
				}
			}
		},
		toggleFileMarked(entry, file) {
			if (!entry || !entry.groupKey || !file || file.isInOriginFolder) {
				return
			}
			const key = this.getFileKey(file)
			if (!key) {
				return
			}
			const currentExcluded = Array.isArray(this.excludedFileKeysByGroup[entry.groupKey])
				? [...this.excludedFileKeysByGroup[entry.groupKey]]
				: []
			if (this.isMarkedFile(entry, file)) {
				if (!currentExcluded.includes(key)) {
					currentExcluded.push(key)
				}
			} else {
				const idx = currentExcluded.indexOf(key)
				if (idx !== -1) {
					currentExcluded.splice(idx, 1)
				}
			}
			if (currentExcluded.length > 0) {
				this.$set(this.excludedFileKeysByGroup, entry.groupKey, currentExcluded)
			} else {
				this.$delete(this.excludedFileKeysByGroup, entry.groupKey)
			}
		},
		formatEntryStatusLabel(entry) {
			if (entry.status === 'protected_only') {
				return this.t('duplicatefinder', 'All protected')
			}
			if (entry.status === 'skipped_acknowledged') {
				return this.t('duplicatefinder', 'Acknowledged skipped')
			}
			if (entry.markedFiles.length === 0) {
				return this.t('duplicatefinder', 'No selection')
			}
			return this.t('duplicatefinder', '{count} marked', { count: entry.markedFiles.length })
		},
		formatAnchorReason(reason) {
			const labels = {
				protected: this.t('duplicatefinder', 'Protected origin'),
				manual: this.t('duplicatefinder', 'Manual reference'),
				oldest: this.t('duplicatefinder', 'Oldest'),
				newest: this.t('duplicatefinder', 'Newest'),
				shortest_path: this.t('duplicatefinder', 'Shortest path'),
				deepest_path: this.t('duplicatefinder', 'Deepest path'),
				preferred_folder: this.t('duplicatefinder', 'Preferred folder'),
				oldest_fallback: this.t('duplicatefinder', 'Oldest fallback'),
				pattern_preserved: this.t('duplicatefinder', 'Non-matching anchor'),
			}
			return labels[reason] || this.t('duplicatefinder', 'Reference')
		},
		openBatchDeleteDialog() {
			if (this.isExecuting || this.plan.summary.markedFileCount === 0) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			this.showDeleteDialog = true
			this.$nextTick(() => {
				const dialog = this.$refs.batchDeleteDialog
				if (!dialog) {
					return
				}
				if (typeof dialog.showModal === 'function') {
					if (!dialog.open) {
						dialog.showModal()
					}
				} else {
					dialog.setAttribute('open', '')
				}
			})
		},
		closeBatchDeleteDialog() {
			this.showDeleteDialog = false
			const dialog = this.$refs.batchDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function' && dialog.open) {
					dialog.close()
				} else {
					dialog.removeAttribute('open')
				}
			}
			const previous = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (previous && typeof previous.focus === 'function' && previous.isConnected) {
				previous.focus()
			}
		},
		async executeBatchDelete() {
			const snapshotGroups = this.plan.groups.filter(entry => entry.markedFiles.length > 0)
			this.closeBatchDeleteDialog()
			if (snapshotGroups.length === 0) {
				return
			}

			const payloadFiles = []
			const groupLookupByFileKey = new Map()
			for (const entry of snapshotGroups) {
				for (const file of entry.markedFiles) {
					if (file.isInOriginFolder) {
						continue
					}
					const key = this.getFileKey(file)
					const wrapped = {
						...file,
						fileHash: file.fileHash || entry.hash || '',
					}
					payloadFiles.push(wrapped)
					groupLookupByFileKey.set(key, {
						entry,
						originalFile: file,
					})
				}
			}

			if (payloadFiles.length === 0) {
				return
			}

			this.isExecuting = true
			this.feedbackMessage = ''
			this.executionProgressText = this.t('duplicatefinder', 'Deleting {count} marked copies...', {
				count: payloadFiles.length,
			})

			try {
				const { success = [], errors = [], deletedNodeIds = [] } = await deleteFiles(payloadFiles, {
					allowLastCopy: false,
				})

				const successKeys = new Set(success.map(file => this.getFileKey(file)))
				const deletedNodeIdSet = new Set(deletedNodeIds.map(Number))
				const deletedByGroupKey = new Map()
				let bytesReclaimed = 0
				let sampleLabel = ''

				for (const [key, meta] of groupLookupByFileKey.entries()) {
					const nodeId = meta.originalFile && meta.originalFile.nodeId !== undefined
						? Number(meta.originalFile.nodeId)
						: null
					if (successKeys.has(key) || (nodeId !== null && deletedNodeIdSet.has(nodeId))) {
						bytesReclaimed += Number(meta.originalFile.size) > 0 ? Math.floor(Number(meta.originalFile.size)) : 0
						if (!sampleLabel) {
							sampleLabel = meta.entry.groupName
						}
						if (!deletedByGroupKey.has(meta.entry.groupKey)) {
							deletedByGroupKey.set(meta.entry.groupKey, {
								entry: meta.entry,
								files: [],
							})
						}
						deletedByGroupKey.get(meta.entry.groupKey).files.push(meta.originalFile)
					}
				}

				const deletedFiles = []
				const resolvedGroupIds = []
				for (const { entry, files } of deletedByGroupKey.values()) {
					deletedFiles.push(...files)
					if (entry.allFiles.length - files.length <= 1 && entry.groupId !== null) {
						resolvedGroupIds.push(entry.groupId)
					}
				}

				if (deletedFiles.length > 0) {
					this.$emit('batch-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						resolvedGroupIds,
						bytesReclaimed,
						groupsResolved: resolvedGroupIds.length,
						sampleLabel,
					})
				}

				if (errors.length > 0) {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Deleted {deleted} file(s), but {failed} file(s) could not be deleted (protected, locked, or missing).',
						{
							deleted: deletedFiles.length,
							failed: errors.length,
						}
					)
				} else {
					this.feedbackType = 'success'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Batch cleanup completed: {deleted} redundant file(s) removed ({size} freed).',
						{
							deleted: deletedFiles.length,
							size: formatBytes(bytesReclaimed),
						}
					)
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Batch deletion failed. Please try again.')
			} finally {
				this.isExecuting = false
				this.executionProgressText = ''
			}
		},
		async acknowledgeMatchedGroups() {
			const targets = this.unacknowledgedMatchedGroups.filter(entry => Boolean(entry.hash))
			if (this.isExecuting || targets.length === 0) {
				return
			}
			this.isExecuting = true
			this.feedbackMessage = ''
			this.executionProgressText = this.t('duplicatefinder', 'Acknowledging {count} groups...', {
				count: targets.length,
			})

			const acknowledgedGroups = []
			let failedCount = 0
			try {
				for (const entry of targets) {
					try {
						await acknowledgeDuplicate(entry.hash)
						acknowledgedGroups.push(entry.rawGroup)
					} catch (error) {
						failedCount += 1
					}
				}
				if (acknowledgedGroups.length > 0) {
					this.$emit('batch-acknowledge-completed', {
						groups: acknowledgedGroups,
					})
				}
				if (failedCount > 0) {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Acknowledged {done} group(s), failed on {failed} group(s).',
						{ done: acknowledgedGroups.length, failed: failedCount }
					)
				} else {
					this.feedbackType = 'success'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Acknowledged {count} matched group(s).',
						{ count: acknowledgedGroups.length }
					)
				}
			} finally {
				this.isExecuting = false
				this.executionProgressText = ''
			}
		},
		triggerDownload(content, mimeType, filename) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.download = filename
			document.body.appendChild(link)
			link.click()
			document.body.removeChild(link)
			URL.revokeObjectURL(url)
		},
		exportPlanJson() {
			const json = buildBatchPlanJson(this.plan, { scope: this.scope })
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-batch-plan.json')
		},
		exportPlanCsv() {
			const csv = buildBatchPlanCsv(this.plan)
			this.triggerDownload(csv, 'text/csv;charset=utf-8', 'duplicatefinder-batch-plan.csv')
		},
	},
}
</script>

<style scoped>
.batch-workbench {
	margin-block: 12px 18px;
	margin-inline: 16px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.batch-workbench__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-end: 14px;
}

.batch-workbench__title-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.batch-workbench__title {
	margin-block: 0;
	margin-inline: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.batch-workbench__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.batch-workbench__toolbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.batch-workbench__tool-btn,
.batch-workbench__pill-btn,
.batch-workbench__toggle-chip,
.batch-workbench__quick-chip,
.batch-workbench__secondary-btn,
.batch-workbench__danger-btn,
.batch-workbench__primary-btn,
.batch-group-card__btn,
.batch-file-row__promote-btn,
.batch-confirm-dialog__btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.batch-workbench__tool-btn:focus-visible,
.batch-workbench__pill-btn:focus-visible,
.batch-workbench__toggle-chip:focus-visible,
.batch-workbench__quick-chip:focus-visible,
.batch-workbench__secondary-btn:focus-visible,
.batch-workbench__danger-btn:focus-visible,
.batch-workbench__primary-btn:focus-visible,
.batch-group-card__btn:focus-visible,
.batch-file-row__promote-btn:focus-visible,
.batch-confirm-dialog__btn:focus-visible,
.batch-workbench__text-input:focus-visible,
.batch-file-row__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.batch-workbench__pill-btn.is-active,
.batch-workbench__toggle-chip.is-active,
.batch-workbench__quick-chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.batch-workbench__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.batch-workbench__danger-btn,
.batch-confirm-dialog__btn.is-danger {
	background-color: #d32f2f;
	border-color: #d32f2f;
	color: #ffffff;
}

.batch-workbench__danger-btn:hover:not(:disabled),
.batch-confirm-dialog__btn.is-danger:hover:not(:disabled) {
	background-color: #b71c1c;
	border-color: #b71c1c;
}

.batch-workbench button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.batch-workbench__empty,
.batch-workbench__no-matches {
	padding-block: 24px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.batch-workbench__empty-title,
.batch-workbench__no-matches-title {
	margin-block: 0 6px;
	font-weight: 700;
	font-size: 1rem;
}

.batch-workbench__empty-hint,
.batch-workbench__no-matches-hint {
	margin-block: 0 14px;
	color: var(--color-text-maxcontrast);
	font-size: 0.9rem;
}

.batch-workbench__no-matches-actions {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	gap: 8px;
}

.batch-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 12px;
	margin-block-end: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.batch-workbench__control-group {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.batch-workbench__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.batch-workbench__rule-pills,
.batch-workbench__chips-row,
.batch-workbench__scope-group,
.batch-workbench__options-group {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.batch-workbench__scope-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	padding-block-start: 8px;
	border-block-start: 1px solid var(--color-border);
}

.batch-workbench__conditional-box {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.batch-workbench__input-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
}

.batch-workbench__text-input {
	flex: 1 1 220px;
	min-inline-size: 0;
	min-block-size: 38px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
}

.batch-workbench__text-input.is-invalid {
	border-color: #d32f2f;
}

.batch-workbench__validation-error {
	margin-block: 0;
	font-size: 0.82rem;
	font-weight: 600;
	color: #c62828;
}

.batch-workbench__kpi-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
	gap: 10px;
	margin-block-end: 14px;
}

.batch-workbench__kpi-card {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.batch-workbench__kpi-card.is-highlight {
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
}

.batch-workbench__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
	margin-block-end: 4px;
}

.batch-workbench__kpi-value {
	margin-block: 0;
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.batch-workbench__kpi-meta {
	margin-block: 4px 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.batch-workbench__action-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	margin-block-end: 14px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.batch-workbench__action-summary {
	font-size: 0.88rem;
	font-weight: 600;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.batch-workbench__action-buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.batch-workbench__feedback {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	margin-block-end: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.88rem;
	font-weight: 600;
}

.batch-workbench__feedback.is-success {
	border-inline-start: 4px solid #2e7d32;
}

.batch-workbench__feedback.is-error {
	border-inline-start: 4px solid #c62828;
}

.batch-workbench__feedback-dismiss {
	min-inline-size: 32px;
	min-block-size: 32px;
	border: none;
	background: transparent;
	color: inherit;
	font-size: 1.1rem;
	cursor: pointer;
}

.batch-workbench__list-filter-bar {
	margin-block-end: 10px;
}

.batch-workbench__groups-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.batch-group-card {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	overflow: hidden;
}

.batch-group-card.is-active-group {
	border-color: var(--color-primary-element, #0082c9);
	box-shadow: 0 0 0 1px var(--color-primary-element, #0082c9);
}

.batch-group-card__header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border-block-end: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.batch-group-card__title-wrap {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.batch-group-card__title {
	margin-block: 0;
	margin-inline: 0;
	font-size: 0.94rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.batch-group-card__meta {
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
}

.batch-group-card__status-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.batch-group-card__status-pill.is-protected_only,
.batch-group-card__status-pill.is-skipped_acknowledged,
.batch-group-card__status-pill.is-no_rule_match {
	background-color: var(--color-background-dark);
	color: var(--color-text-maxcontrast);
}

.batch-group-card__header-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.batch-group-card__files {
	display: flex;
	flex-direction: column;
}

.batch-file-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 8px;
	padding-inline: 12px;
	border-block-end: 1px solid var(--color-border);
	min-inline-size: 0;
}

.batch-file-row:last-child {
	border-block-end: none;
}

.batch-file-row.is-anchor {
	border-inline-start: 4px solid #2e7d32;
	background-color: rgba(46, 125, 50, 0.05);
}

.batch-file-row.is-marked {
	border-inline-start: 4px solid #d32f2f;
	background-color: rgba(211, 47, 47, 0.04);
}

.batch-file-row__leading {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 24px;
}

.batch-file-row__checkbox {
	inline-size: 18px;
	block-size: 18px;
	cursor: pointer;
}

.batch-file-row__lock-indicator {
	color: #2e7d32;
	font-size: 0.9rem;
}

.batch-file-row__body {
	flex: 1 1 200px;
	min-inline-size: 0;
}

.batch-file-row__path-line {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.batch-file-row__path {
	font-size: 0.88rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.batch-file-row__tag {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.batch-file-row__tag.is-anchor,
.batch-file-row__tag.is-protected {
	background-color: rgba(46, 125, 50, 0.12);
	border-color: rgba(46, 125, 50, 0.35);
	color: #1b5e20;
}

.batch-file-row__tag.is-marked {
	background-color: rgba(211, 47, 47, 0.12);
	border-color: rgba(211, 47, 47, 0.35);
	color: #b71c1c;
}

.batch-file-row__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-start: 2px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.batch-file-row__actions {
	display: flex;
	align-items: center;
	flex-shrink: 0;
}

.batch-confirm-dialog {
	margin-block: auto;
	margin-inline: auto;
	padding-block: 0;
	padding-inline: 0;
	inline-size: min(460px, calc(100vw - 24px));
	max-inline-size: calc(100vw - 24px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background, #ffffff);
	color: var(--color-main-text);
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
	box-sizing: border-box;
}

.batch-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.batch-confirm-dialog__surface {
	padding-block: 18px;
	padding-inline: 20px;
}

.batch-confirm-dialog__title {
	margin-block: 0 8px;
	font-size: 1.05rem;
	font-weight: 700;
}

.batch-confirm-dialog__desc {
	margin-block: 0 14px;
	font-size: 0.9rem;
	line-height: 1.45;
	color: var(--color-text-maxcontrast);
}

.batch-confirm-dialog__stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	margin-block: 0 16px;
	margin-inline: 0;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.batch-confirm-dialog__stat dt {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.batch-confirm-dialog__stat dd {
	margin-inline-start: 0;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.batch-confirm-dialog__actions {
	display: flex;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 768px) {
	.batch-workbench {
		margin-inline: 8px;
		padding-inline: 12px;
	}

	.batch-workbench__tool-btn,
	.batch-workbench__pill-btn,
	.batch-workbench__toggle-chip,
	.batch-workbench__quick-chip,
	.batch-workbench__secondary-btn,
	.batch-workbench__danger-btn,
	.batch-workbench__primary-btn,
	.batch-group-card__btn,
	.batch-file-row__promote-btn,
	.batch-confirm-dialog__btn,
	.batch-workbench__text-input {
		min-block-size: 44px;
	}

	.batch-confirm-dialog__stats {
		grid-template-columns: 1fr;
	}
}
</style>
