<template>
	<div class="filter-settings">
		<div class="filter-settings__hero">
			<div class="filter-settings__title-row">
				<FilterOutline :size="20" />
				<h3 class="filter-settings__title">
					{{ t('duplicatefinder', 'Ignore Rules & Whitelist Builder') }}
				</h3>
			</div>
			<p class="filter-settings__subtitle">
				{{ t('duplicatefinder', 'Skip temporary files, specific filename patterns, or false-positive hashes during scans. You can also place a .nodupefinder file inside any folder to exclude it.') }}
			</p>
			<div class="filter-settings__summary-pills">
				<span class="summary-pill">
					{{ t('duplicatefinder', 'Filename patterns ({count})', { count: nameFiltersCount }) }}
				</span>
				<span class="summary-pill">
					{{ t('duplicatefinder', 'Excluded hashes ({count})', { count: hashFiltersCount }) }}
				</span>
			</div>
		</div>

		<div
			class="filter-tabs"
			role="tablist"
			:aria-label="t('duplicatefinder', 'Ignore rule types')">
			<button
				type="button"
				role="tab"
				class="filter-tab-button"
				:class="{ 'is-active': activeTab === 'name' }"
				:aria-selected="activeTab === 'name' ? 'true' : 'false'"
				@click="switchTab('name')">
				<FileOutline :size="18" />
				<span>{{ t('duplicatefinder', 'Filename Patterns') }}</span>
				<span class="filter-tab-count">{{ nameFiltersCount }}</span>
			</button>
			<button
				type="button"
				role="tab"
				class="filter-tab-button"
				:class="{ 'is-active': activeTab === 'hash' }"
				:aria-selected="activeTab === 'hash' ? 'true' : 'false'"
				@click="switchTab('hash')">
				<Fingerprint :size="18" />
				<span>{{ t('duplicatefinder', 'Excluded Hashes') }}</span>
				<span class="filter-tab-count">{{ hashFiltersCount }}</span>
			</button>
		</div>

		<section
			v-if="activeTab === 'name'"
			class="rule-builder-card"
			:aria-label="t('duplicatefinder', 'Pattern rule builder')">
			<div class="presets-block">
				<span class="block-label">{{ t('duplicatefinder', 'Quick ignore presets') }}</span>
				<div class="presets-grid">
					<button
						v-for="preset in presetStates"
						:key="preset.id"
						type="button"
						class="preset-chip"
						:class="{ 'is-added': preset.isAdded }"
						:disabled="preset.isAdded || submitState === 'saving' || loadState === 'loading'"
						:aria-pressed="preset.isAdded ? 'true' : 'false'"
						@click="addPresetRule(preset.value)">
						<Check v-if="preset.isAdded" :size="14" />
						<Plus v-else :size="14" />
						<span class="preset-chip__label">{{ preset.label }}</span>
					</button>
				</div>
			</div>

			<div class="builder-modes-block">
				<span class="block-label">{{ t('duplicatefinder', 'Match mode') }}</span>
				<div
					class="builder-modes-row"
					role="group"
					:aria-label="t('duplicatefinder', 'Pattern match mode')">
					<button
						v-for="modeOption in builderModeOptions"
						:key="modeOption.id"
						type="button"
						class="mode-chip"
						:class="{ 'is-active': builderMode === modeOption.id }"
						:aria-pressed="builderMode === modeOption.id ? 'true' : 'false'"
						@click="builderMode = modeOption.id">
						{{ modeOption.label }}
					</button>
				</div>
			</div>

			<form class="builder-form" @submit.prevent="addCustomRule">
				<div class="builder-input-group">
					<label
						for="ignore-rule-input"
						class="builder-input-label">
						{{ inputLabelText }}
					</label>
					<div class="builder-input-row">
						<input
							id="ignore-rule-input"
							v-model="newRuleInput"
							type="text"
							class="builder-text-input"
							:placeholder="inputPlaceholderText"
							:aria-invalid="shouldShowValidationError ? 'true' : 'false'"
							autocomplete="off"
							@input="hasAttemptedSubmit = false">
						<button
							type="submit"
							class="builder-submit-button primary"
							:disabled="!canSubmitRule">
							<Plus :size="18" />
							<span>
								{{ submitState === 'saving'
									? t('duplicatefinder', 'Saving...')
									: t('duplicatefinder', 'Add Rule') }}
							</span>
						</button>
					</div>
				</div>

				<div
					v-if="draftRuleValue"
					class="draft-preview-row">
					<span class="draft-preview-label">
						{{ t('duplicatefinder', 'Rule preview:') }}
					</span>
					<code class="rule-code">{{ draftRuleValue }}</code>
					<span
						v-if="duplicates.length > 0"
						class="draft-impact-pill"
						:class="{ 'has-matches': draftImpact.groupCount > 0 }">
						{{ t('duplicatefinder', 'Matches {groups} active group(s) ({files} files)', {
							groups: draftImpact.groupCount,
							files: draftImpact.fileCount,
						}) }}
					</span>
				</div>

				<p
					v-if="shouldShowValidationError"
					class="validation-error"
					role="alert">
					{{ localizedValidationError }}
				</p>
			</form>

			<div class="pattern-tester-card">
				<div class="pattern-tester-header">
					<span class="block-label">{{ t('duplicatefinder', 'Live pattern tester') }}</span>
					<span class="tester-match-summary">
						{{ draftRuleValue
							? t('duplicatefinder', '{matched} / {total} sample names matched', {
								matched: testerResult.matchCount,
								total: testerResult.results.length,
							})
							: t('duplicatefinder', 'Enter a pattern above to test against sample filenames.') }}
					</span>
				</div>
				<div class="tester-custom-row">
					<label
						for="pattern-tester-sample-input"
						class="sr-only">
						{{ t('duplicatefinder', 'Test a custom filename') }}
					</label>
					<input
						id="pattern-tester-sample-input"
						v-model="customTestFilename"
						type="text"
						class="tester-sample-input"
						:placeholder="t('duplicatefinder', 'Test a filename (e.g. draft_notes.tmp)')"
						autocomplete="off">
				</div>
				<div class="tester-samples-grid">
					<div
						v-for="item in testerResult.results"
						:key="item.basename"
						class="tester-sample-pill"
						:class="{ 'is-matched': item.matched }">
						<span class="tester-sample-name">{{ item.basename }}</span>
						<span class="tester-sample-badge">
							{{ item.matched
								? t('duplicatefinder', 'Match')
								: t('duplicatefinder', 'Skip') }}
						</span>
					</div>
				</div>
			</div>
		</section>

		<section
			v-else
			class="rule-builder-card"
			:aria-label="t('duplicatefinder', 'Excluded file hash builder')">
			<p class="hash-section-hint">
				{{ t('duplicatefinder', 'Files matching an excluded hash are skipped in future scans. You can also mark any duplicate group as a false positive directly from Duplicate Details.') }}
			</p>
			<form class="builder-form" @submit.prevent="addCustomRule">
				<div class="builder-input-group">
					<label
						for="ignore-hash-input"
						class="builder-input-label">
						{{ t('duplicatefinder', 'File Hash (hexadecimal)') }}
					</label>
					<div class="builder-input-row">
						<input
							id="ignore-hash-input"
							v-model="newRuleInput"
							type="text"
							class="builder-text-input"
							:placeholder="t('duplicatefinder', 'e.g. a1b2c3d4e5f6...')"
							:aria-invalid="shouldShowValidationError ? 'true' : 'false'"
							autocomplete="off"
							@input="hasAttemptedSubmit = false">
						<button
							type="submit"
							class="builder-submit-button primary"
							:disabled="!canSubmitRule">
							<Plus :size="18" />
							<span>
								{{ submitState === 'saving'
									? t('duplicatefinder', 'Saving...')
									: t('duplicatefinder', 'Exclude Hash') }}
							</span>
						</button>
					</div>
				</div>

				<div
					v-if="draftRuleValue && duplicates.length > 0"
					class="draft-preview-row">
					<span
						class="draft-impact-pill"
						:class="{ 'has-matches': draftImpact.groupCount > 0 }">
						{{ t('duplicatefinder', 'Matches {groups} active group(s) ({files} files)', {
							groups: draftImpact.groupCount,
							files: draftImpact.fileCount,
						}) }}
					</span>
				</div>

				<p
					v-if="shouldShowValidationError"
					class="validation-error"
					role="alert">
					{{ localizedValidationError }}
				</p>
			</form>
		</section>

		<div
			v-if="feedbackMessage"
			class="feedback-banner"
			:class="{
				'is-success': feedbackStatus === 'success',
				'is-error': feedbackStatus === 'error',
			}"
			role="status"
			aria-live="polite">
			{{ feedbackMessage }}
		</div>

		<section
			class="rules-list-section"
			:aria-label="t('duplicatefinder', 'Configured ignore rules')">
			<div class="rules-list-header">
				<h4 class="rules-list-title">
					{{ activeTab === 'name'
						? t('duplicatefinder', 'Active filename patterns ({count})', { count: currentFilters.length })
						: t('duplicatefinder', 'Active excluded hashes ({count})', { count: currentFilters.length }) }}
				</h4>
				<div v-if="currentFilters.length > 4" class="rules-search-box">
					<label
						for="rules-search-input"
						class="sr-only">
						{{ t('duplicatefinder', 'Filter configured rules') }}
					</label>
					<input
						id="rules-search-input"
						v-model="ruleSearchQuery"
						type="search"
						class="rules-search-input"
						:placeholder="t('duplicatefinder', 'Filter rules...')">
				</div>
			</div>

			<div
				v-if="loadState === 'loading'"
				class="rules-state-box"
				role="status"
				aria-live="polite">
				<NcLoadingIcon :size="24" />
				<span>{{ t('duplicatefinder', 'Loading ignore rules...') }}</span>
			</div>

			<div
				v-else-if="loadState === 'error'"
				class="rules-state-box is-error"
				role="alert">
				<span>{{ t('duplicatefinder', 'Could not load ignore rules.') }}</span>
				<button type="button" class="retry-rules-button" @click="fetchFilters">
					{{ t('duplicatefinder', 'Retry') }}
				</button>
			</div>

			<div
				v-else-if="currentFilters.length === 0"
				class="rules-state-box is-empty">
				<span>
					{{ activeTab === 'name'
						? t('duplicatefinder', 'No filename ignore rules configured yet. Pick a preset above or build a custom rule.')
						: t('duplicatefinder', 'No excluded hashes configured yet.') }}
				</span>
			</div>

			<div
				v-else-if="visibleFilters.length === 0"
				class="rules-state-box is-empty">
				<span>{{ t('duplicatefinder', 'No ignore rules match your search.') }}</span>
			</div>

			<ul v-else class="filters-list">
				<li
					v-for="filter in visibleFilters"
					:key="filter.id || `${filter.type}-${filter.value}`"
					class="filter-item">
					<div class="filter-item__main">
						<span class="filter-type-icon" aria-hidden="true">
							<Fingerprint v-if="filter.type === 'hash'" :size="16" />
							<FileOutline v-else :size="16" />
						</span>
						<code
							class="filter-value"
							:title="filter.value">
							{{ formatRuleDisplay(filter) }}
						</code>
						<span
							v-if="getRuleMatchCount(filter).groupCount > 0"
							class="rule-impact-badge">
							{{ t('duplicatefinder', '{count} active match(es)', {
								count: getRuleMatchCount(filter).groupCount,
							}) }}
						</span>
					</div>
					<div class="filter-item__actions">
						<button
							type="button"
							class="rule-action-button"
							:class="{ 'is-copied': copiedRuleId === filter.id }"
							:title="t('duplicatefinder', 'Copy rule')"
							:aria-label="t('duplicatefinder', 'Copy rule {value}', { value: filter.value })"
							@click="copyRuleValue(filter)">
							<Check v-if="copiedRuleId === filter.id" :size="16" />
							<ContentCopy v-else :size="16" />
						</button>
						<button
							type="button"
							class="rule-action-button rule-action-button--delete"
							:disabled="isDeletingRule(filter.id)"
							:title="t('duplicatefinder', 'Remove rule')"
							:aria-label="t('duplicatefinder', 'Remove rule {value}', { value: filter.value })"
							@click="removeFilter(filter)">
							<Delete :size="16" />
						</button>
					</div>
				</li>
			</ul>
		</section>
	</div>
</template>

<script>
import { NcLoadingIcon } from '@nextcloud/vue'
import Check from 'vue-material-design-icons/Check'
import ContentCopy from 'vue-material-design-icons/ContentCopy'
import Delete from 'vue-material-design-icons/Delete'
import FileOutline from 'vue-material-design-icons/FileOutline'
import FilterOutline from 'vue-material-design-icons/FilterOutline'
import Fingerprint from 'vue-material-design-icons/Fingerprint'
import Plus from 'vue-material-design-icons/Plus'
import { deleteFilter, loadFilters, saveFilter } from '@/tools/api'
import { copyTextSafely } from '@/tools/clipboardHelper'
import { formatShortHash } from '@/tools/duplicateHashHelper'
import {
	DEFAULT_PATTERN_TEST_SAMPLES,
	IGNORE_PATTERN_PRESETS,
	buildPatternFromBuilder,
	countMatchingDuplicatesForRule,
	evaluatePatternTester,
	extractFileBasename,
	validateIgnoreRule,
} from '@/tools/ignoreRulesHelper'

export default {
	name: 'FilterSettings',
	components: {
		NcLoadingIcon,
		Check,
		ContentCopy,
		Delete,
		FileOutline,
		FilterOutline,
		Fingerprint,
		Plus,
	},
	props: {
		duplicates: {
			type: Array,
			default: () => [],
		},
	},
	data() {
		return {
			activeTab: 'name',
			builderMode: 'exact',
			newRuleInput: '',
			customTestFilename: '',
			ruleSearchQuery: '',
			filters: [],
			loadState: 'loading',
			submitState: 'idle',
			deletingIds: [],
			hasAttemptedSubmit: false,
			feedbackStatus: 'idle',
			feedbackMessage: '',
			feedbackTimer: null,
			copiedRuleId: null,
			copyTimer: null,
		}
	},
	computed: {
		builderModeOptions() {
			return [
				{ id: 'exact', label: this.t('duplicatefinder', 'Custom glob') },
				{ id: 'extension', label: this.t('duplicatefinder', 'Extension (*.ext)') },
				{ id: 'prefix', label: this.t('duplicatefinder', 'Starts with (prefix*)') },
				{ id: 'contains', label: this.t('duplicatefinder', 'Contains (*text*)') },
			]
		},
		nameFilters() {
			return this.filters.filter(filter => filter && filter.type === 'name')
		},
		hashFilters() {
			return this.filters.filter(filter => filter && filter.type === 'hash')
		},
		nameFiltersCount() {
			return this.nameFilters.length
		},
		hashFiltersCount() {
			return this.hashFilters.length
		},
		currentFilters() {
			return this.activeTab === 'hash' ? this.hashFilters : this.nameFilters
		},
		visibleFilters() {
			const query = typeof this.ruleSearchQuery === 'string'
				? this.ruleSearchQuery.trim().toLowerCase()
				: ''
			if (!query) {
				return this.currentFilters
			}
			return this.currentFilters.filter(
				filter => typeof filter.value === 'string' && filter.value.toLowerCase().includes(query),
			)
		},
		presetStates() {
			const existingNames = new Set(
				this.nameFilters
					.map(filter => (typeof filter.value === 'string' ? filter.value.trim() : ''))
					.filter(Boolean),
			)
			return IGNORE_PATTERN_PRESETS.map(preset => ({
				...preset,
				isAdded: existingNames.has(preset.value),
			}))
		},
		draftRuleValue() {
			if (this.activeTab === 'hash') {
				return typeof this.newRuleInput === 'string' ? this.newRuleInput.trim() : ''
			}
			return buildPatternFromBuilder(this.builderMode, this.newRuleInput)
		},
		draftValidation() {
			return validateIgnoreRule(this.activeTab, this.draftRuleValue, this.filters)
		},
		shouldShowValidationError() {
			const hasRawInput = typeof this.newRuleInput === 'string' && this.newRuleInput.trim().length > 0
			if (!hasRawInput && !this.hasAttemptedSubmit) {
				return false
			}
			return !this.draftValidation.valid
		},
		localizedValidationError() {
			switch (this.draftValidation.errorCode) {
			case 'EMPTY':
				return this.t('duplicatefinder', 'Please enter a rule value.')
			case 'TOO_LONG':
				return this.t('duplicatefinder', 'Rule value exceeds maximum length of 255 characters.')
			case 'CONTAINS_PATH_SEPARATOR':
				return this.t('duplicatefinder', 'Filename patterns match file names only, not folder paths. Use Excluded Folders for paths.')
			case 'INVALID_HASH':
				return this.t('duplicatefinder', 'Hash must be an 8 to 128 character hexadecimal digest.')
			case 'DUPLICATE':
				return this.t('duplicatefinder', 'This ignore rule already exists.')
			default:
				return this.draftValidation.errorMessage || ''
			}
		},
		canSubmitRule() {
			return this.submitState !== 'saving'
				&& this.loadState !== 'loading'
				&& this.draftValidation.valid
		},
		inputLabelText() {
			if (this.activeTab === 'hash') {
				return this.t('duplicatefinder', 'File Hash')
			}
			switch (this.builderMode) {
			case 'extension':
				return this.t('duplicatefinder', 'File extension to ignore')
			case 'prefix':
				return this.t('duplicatefinder', 'Filename prefix to ignore')
			case 'contains':
				return this.t('duplicatefinder', 'Substring inside filename')
			default:
				return this.t('duplicatefinder', 'Filename glob pattern')
			}
		},
		inputPlaceholderText() {
			if (this.activeTab === 'hash') {
				return this.t('duplicatefinder', 'e.g. a1b2c3d4e5f6...')
			}
			switch (this.builderMode) {
			case 'extension':
				return this.t('duplicatefinder', 'e.g. tmp or .bak')
			case 'prefix':
				return this.t('duplicatefinder', 'e.g. backup_ or ~$')
			case 'contains':
				return this.t('duplicatefinder', 'e.g. cache or conflict')
			default:
				return this.t('duplicatefinder', 'e.g. *.tmp or backup_*')
			}
		},
		draftImpact() {
			if (!this.draftValidation.valid || !Array.isArray(this.duplicates) || this.duplicates.length === 0) {
				return { groupCount: 0, fileCount: 0 }
			}
			return countMatchingDuplicatesForRule(
				{ type: this.activeTab, value: this.draftValidation.normalizedValue },
				this.duplicates,
			)
		},
		testerSamples() {
			const samples = []
			const customSample = extractFileBasename(this.customTestFilename)
			if (customSample) {
				samples.push(customSample)
			}
			if (Array.isArray(this.duplicates)) {
				let addedFromDuplicates = 0
				for (const group of this.duplicates) {
					if (!group || !Array.isArray(group.files)) {
						continue
					}
					for (const file of group.files) {
						const name = extractFileBasename(file && (file.path || file.name))
						if (name && !samples.includes(name)) {
							samples.push(name)
							addedFromDuplicates += 1
						}
						if (addedFromDuplicates >= 6) {
							break
						}
					}
					if (addedFromDuplicates >= 6) {
						break
					}
				}
			}
			for (const fallbackSample of DEFAULT_PATTERN_TEST_SAMPLES) {
				if (!samples.includes(fallbackSample)) {
					samples.push(fallbackSample)
				}
			}
			return samples.slice(0, 10)
		},
		testerResult() {
			return evaluatePatternTester(this.draftRuleValue, this.testerSamples)
		},
	},
	mounted() {
		this.fetchFilters()
	},
	beforeDestroy() {
		this.clearTimers()
	},
	methods: {
		clearTimers() {
			if (this.feedbackTimer) {
				clearTimeout(this.feedbackTimer)
				this.feedbackTimer = null
			}
			if (this.copyTimer) {
				clearTimeout(this.copyTimer)
				this.copyTimer = null
			}
		},
		showFeedback(status, message) {
			if (this.feedbackTimer) {
				clearTimeout(this.feedbackTimer)
				this.feedbackTimer = null
			}
			this.feedbackStatus = status
			this.feedbackMessage = message
			this.feedbackTimer = setTimeout(() => {
				this.feedbackStatus = 'idle'
				this.feedbackMessage = ''
				this.feedbackTimer = null
			}, 3500)
		},
		switchTab(tab) {
			if (tab !== 'name' && tab !== 'hash') {
				return
			}
			this.activeTab = tab
			this.newRuleInput = ''
			this.ruleSearchQuery = ''
			this.hasAttemptedSubmit = false
		},
		formatRuleDisplay(filter) {
			if (!filter || typeof filter.value !== 'string') {
				return ''
			}
			if (filter.type === 'hash') {
				const shortHash = formatShortHash(filter.value, 16)
				return shortHash ? `${shortHash}...` : filter.value
			}
			return filter.value
		},
		getRuleMatchCount(filter) {
			return countMatchingDuplicatesForRule(filter, this.duplicates)
		},
		isDeletingRule(ruleId) {
			return this.deletingIds.includes(ruleId)
		},
		async fetchFilters() {
			this.loadState = 'loading'
			try {
				const loaded = await loadFilters()
				this.filters = Array.isArray(loaded) ? loaded : []
				this.loadState = 'ready'
			} catch (error) {
				console.error('Error loading filters:', error)
				this.loadState = 'error'
			}
		},
		async persistRule(type, value) {
			if (this.submitState === 'saving') {
				return false
			}
			const validation = validateIgnoreRule(type, value, this.filters)
			if (!validation.valid) {
				this.hasAttemptedSubmit = true
				return false
			}

			this.submitState = 'saving'
			try {
				const saved = await saveFilter({
					type,
					value: validation.normalizedValue,
				})
				if (saved && typeof saved === 'object' && saved.value) {
					this.filters = [saved, ...this.filters]
				} else {
					await this.fetchFilters()
				}
				this.$emit('filters-changed')
				this.showFeedback(
					'success',
					this.t('duplicatefinder', 'Rule "{rule}" added to ignore list.', {
						rule: validation.normalizedValue,
					}),
				)
				return true
			} catch (error) {
				console.error('Error adding filter:', error)
				this.showFeedback('error', this.t('duplicatefinder', 'Failed to save ignore rule.'))
				return false
			} finally {
				this.submitState = 'idle'
			}
		},
		async addCustomRule() {
			this.hasAttemptedSubmit = true
			const ok = await this.persistRule(this.activeTab, this.draftRuleValue)
			if (ok) {
				this.newRuleInput = ''
				this.hasAttemptedSubmit = false
			}
		},
		async addPresetRule(presetValue) {
			await this.persistRule('name', presetValue)
		},
		async removeFilter(filter) {
			if (!filter || filter.id === undefined || filter.id === null || this.isDeletingRule(filter.id)) {
				return false
			}
			this.deletingIds = [...this.deletingIds, filter.id]
			try {
				await deleteFilter(filter.id)
				this.filters = this.filters.filter(item => item && item.id !== filter.id)
				this.$emit('filters-changed')
				this.showFeedback(
					'success',
					this.t('duplicatefinder', 'Rule "{rule}" removed.', { rule: filter.value }),
				)
				return true
			} catch (error) {
				console.error('Error removing filter:', error)
				this.showFeedback('error', this.t('duplicatefinder', 'Failed to remove ignore rule.'))
				return false
			} finally {
				this.deletingIds = this.deletingIds.filter(id => id !== filter.id)
			}
		},
		async copyRuleValue(filter) {
			if (!filter || typeof filter.value !== 'string' || !filter.value) {
				return false
			}
			const copied = await copyTextSafely(filter.value)
			if (copied) {
				if (this.copyTimer) {
					clearTimeout(this.copyTimer)
				}
				this.copiedRuleId = filter.id
				this.copyTimer = setTimeout(() => {
					this.copiedRuleId = null
					this.copyTimer = null
				}, 2000)
			}
			return copied
		},
	},
}
</script>

<style scoped>
.filter-settings {
	padding-block: 16px;
	padding-inline: 20px;
	display: flex;
	flex-direction: column;
	gap: 16px;
	box-sizing: border-box;
	inline-size: 100%;
	max-inline-size: 100%;
	min-inline-size: 0;
}

.filter-settings *,
.filter-settings *::before,
.filter-settings *::after {
	box-sizing: border-box;
}

.filter-settings__hero {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.filter-settings__title-row {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--color-main-text);
}

.filter-settings__title-row :deep(svg) {
	color: var(--color-primary-element, #0082c9);
	flex-shrink: 0;
}

.filter-settings__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.filter-settings__subtitle {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
	line-height: 1.45;
	max-inline-size: 68ch;
}

.filter-settings__summary-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.summary-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.filter-tabs {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.filter-tab-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 8px;
	min-block-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.filter-tab-button:hover {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element, #0082c9);
}

.filter-tab-button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.filter-tab-button.is-active {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.filter-tab-count {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 22px;
	padding-block: 1px;
	padding-inline: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	font-size: 0.76rem;
	font-variant-numeric: tabular-nums;
}

.rule-builder-card,
.rules-list-section {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding-block: 14px;
	padding-inline: 16px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.block-label {
	display: block;
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	margin-block-end: 6px;
}

.presets-grid,
.builder-modes-row {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.preset-chip,
.mode-chip {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	min-block-size: 44px;
	max-inline-size: 100%;
	padding-block: 6px;
	padding-inline: 11px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.82rem;
	font-weight: 600;
	text-align: start;
	overflow-wrap: anywhere;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.preset-chip:hover:not(:disabled),
.mode-chip:hover:not(:disabled) {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-background-dark);
}

.preset-chip:focus-visible,
.mode-chip:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.preset-chip.is-added {
	border-color: rgba(46, 125, 50, 0.5);
	background-color: rgba(46, 125, 50, 0.12);
	color: var(--color-main-text);
	cursor: default;
}

.mode-chip.is-active {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.builder-form {
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.builder-input-group {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.builder-input-label {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.builder-input-row {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: stretch;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.builder-text-input,
.tester-sample-input,
.rules-search-input {
	flex: 1 1 180px;
	min-inline-size: 0;
	max-inline-size: 100%;
	min-block-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.9rem;
	box-sizing: border-box;
}

.builder-text-input:focus-visible,
.tester-sample-input:focus-visible,
.rules-search-input:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.builder-submit-button,
.retry-rules-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	max-inline-size: 100%;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
	flex-shrink: 0;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.builder-submit-button:hover:not(:disabled),
.retry-rules-button:hover:not(:disabled) {
	background-color: var(--color-primary-element-hover, #006aa3);
	border-color: var(--color-primary-element-hover, #006aa3);
}

.builder-submit-button:focus-visible,
.retry-rules-button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.builder-submit-button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.retry-rules-button {
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	border-color: var(--color-border-maxcontrast, var(--color-border-dark));
}

.draft-preview-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.draft-preview-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.rule-code {
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 6px;
	background-color: var(--color-background-dark);
	color: var(--color-main-text);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.draft-impact-pill {
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.draft-impact-pill.has-matches {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.validation-error {
	margin: 0;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	border-inline-start: 3px solid #d32f2f;
	background-color: rgba(211, 47, 47, 0.1);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
}

.pattern-tester-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.pattern-tester-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.pattern-tester-header .block-label {
	margin-block-end: 0;
}

.tester-match-summary {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.tester-custom-row {
	display: flex;
}

.tester-samples-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
	gap: 8px;
}

.tester-sample-pill {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.8rem;
	min-inline-size: 0;
}

.tester-sample-pill.is-matched {
	border-color: rgba(46, 125, 50, 0.55);
	background-color: rgba(46, 125, 50, 0.12);
}

.tester-sample-name {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.tester-sample-badge {
	flex-shrink: 0;
	font-size: 0.72rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.tester-sample-pill.is-matched .tester-sample-badge {
	color: #2e7d32;
}

.hash-section-hint {
	margin: 0;
	font-size: 0.86rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.feedback-banner {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	font-size: 0.86rem;
	font-weight: 600;
}

.feedback-banner.is-success {
	border-color: rgba(46, 125, 50, 0.5);
	background-color: rgba(46, 125, 50, 0.12);
	color: var(--color-main-text);
}

.feedback-banner.is-error {
	border-color: rgba(211, 47, 47, 0.5);
	background-color: rgba(211, 47, 47, 0.12);
	color: var(--color-main-text);
}

.rules-list-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.rules-list-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.rules-search-box {
	flex: 0 1 240px;
	min-inline-size: 0;
	display: flex;
}

.rules-state-box {
	display: flex;
	align-items: center;
	justify-content: center;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 18px;
	padding-inline: 14px;
	border-radius: 8px;
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
	text-align: center;
}

.rules-state-box.is-error {
	border: 1px solid rgba(211, 47, 47, 0.4);
	background-color: rgba(211, 47, 47, 0.08);
	color: var(--color-main-text);
}

.filters-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.filter-item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.filter-item__main {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	flex: 1 1 200px;
	min-inline-size: 0;
}

.filter-type-icon {
	display: inline-flex;
	align-items: center;
	color: var(--color-primary-element, #0082c9);
	flex-shrink: 0;
}

.filter-value {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.88rem;
	font-weight: 600;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.rule-impact-badge {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	background-color: var(--color-primary-element-light, #e5eff5);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 0.76rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.filter-item__actions {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	flex-shrink: 0;
}

.rule-action-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding: 6px;
	border-radius: 8px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.rule-action-button:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.rule-action-button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.rule-action-button.is-copied {
	border-color: rgba(46, 125, 50, 0.55);
	color: #2e7d32;
}

.rule-action-button--delete:hover:not(:disabled) {
	border-color: #d32f2f;
	color: #d32f2f;
}

.rule-action-button:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.sr-only {
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

@media (max-width: 600px) {
	.filter-settings {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.rule-builder-card,
	.rules-list-section {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.tester-samples-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.builder-submit-button {
		inline-size: 100%;
	}
}
</style>
