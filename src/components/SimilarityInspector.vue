<template>
	<section
		class="similarity-workspace"
		role="region"
		:aria-label="t('duplicatefinder', 'Similarity threshold and fuzzy match inspector')">
		<header class="similarity-toolbar">
			<div class="similarity-toolbar__title-group">
				<h3 class="similarity-toolbar__title">
					{{ t('duplicatefinder', 'Similarity & Fuzzy Match Inspector') }}
				</h3>
				<span
					class="similarity-toolbar__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters ({linked} groups linked)', {
						clusters: analysis.impact.clusterCount,
						linked: analysis.impact.linkedGroupCount,
					}) }}
				</span>
			</div>

			<div class="similarity-toolbar__actions">
				<button
					type="button"
					class="similarity-toolbar__button similarity-reset-button"
					:disabled="isDefaultState"
					@click="resetControls">
					<span>{{ t('duplicatefinder', 'Reset inspector') }}</span>
				</button>
				<button
					type="button"
					class="similarity-toolbar__button similarity-close-button"
					aria-keyshortcuts="f"
					:title="t('duplicatefinder', 'Hide similarity inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide similarity') }}</span>
				</button>
			</div>
		</header>

		<div v-if="duplicates.length === 0" class="similarity-empty-state">
			<p class="similarity-empty-state__title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="similarity-empty-state__hint">
				{{ t('duplicatefinder', 'Run a scan to evaluate fuzzy filename, token, path, and size similarity across duplicate groups.') }}
			</p>
			<button
				type="button"
				class="similarity-primary-button"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="similarity-controls-ribbon">
				<div class="similarity-control-block">
					<span class="similarity-control-label">
						{{ t('duplicatefinder', 'Match mode') }}
					</span>
					<div
						class="similarity-mode-group"
						role="group"
						:aria-label="t('duplicatefinder', 'Fuzzy match mode')">
						<button
							v-for="modeItem in modeOptions"
							:key="modeItem.id"
							type="button"
							class="similarity-mode-button"
							:class="{ 'is-active': mode === modeItem.id }"
							:aria-pressed="mode === modeItem.id ? 'true' : 'false'"
							@click="mode = modeItem.id">
							<span>{{ modeItem.label }}</span>
						</button>
					</div>
				</div>

				<div class="similarity-control-block similarity-threshold-block">
					<div class="similarity-threshold-header">
						<label
							for="similarity-threshold-range"
							class="similarity-control-label">
							{{ t('duplicatefinder', 'Similarity threshold: {value}%', { value: threshold }) }}
						</label>
						<div class="similarity-presets-row">
							<button
								v-for="preset in presetOptions"
								:key="preset.id"
								type="button"
								class="similarity-preset-chip"
								:class="{ 'is-active': threshold === preset.threshold }"
								:aria-pressed="threshold === preset.threshold ? 'true' : 'false'"
								@click="setThresholdPreset(preset.threshold)">
								<span>{{ preset.label }}</span>
							</button>
						</div>
					</div>
					<div class="similarity-threshold-inputs">
						<input
							id="similarity-threshold-range"
							v-model.number="threshold"
							type="range"
							min="50"
							max="100"
							step="1"
							class="similarity-range-slider"
							:aria-label="t('duplicatefinder', 'Similarity threshold percentage')"
							@input="syncDraftThresholdFromSlider">
						<div class="similarity-numeric-wrap">
							<label
								for="similarity-threshold-number"
								class="sr-only">
								{{ t('duplicatefinder', 'Threshold numeric percentage') }}
							</label>
							<input
								id="similarity-threshold-number"
								v-model="thresholdDraft"
								type="number"
								min="50"
								max="100"
								step="1"
								class="similarity-number-input"
								@input="onThresholdNumberInput"
								@blur="commitThresholdDraft"
								@keyup.enter="commitThresholdDraft">
							<span class="similarity-number-unit" aria-hidden="true">%</span>
						</div>
					</div>
				</div>

				<div class="similarity-control-block similarity-filters-block">
					<div class="similarity-toggles-row">
						<button
							type="button"
							class="similarity-toggle-chip"
							:class="{ 'is-active': ignoreCopySuffixes }"
							:aria-pressed="ignoreCopySuffixes ? 'true' : 'false'"
							@click="ignoreCopySuffixes = !ignoreCopySuffixes">
							<span>{{ t('duplicatefinder', 'Ignore copy suffixes') }}</span>
						</button>
						<button
							type="button"
							class="similarity-toggle-chip"
							:class="{ 'is-active': sameCategoryOnly }"
							:aria-pressed="sameCategoryOnly ? 'true' : 'false'"
							@click="sameCategoryOnly = !sameCategoryOnly">
							<span>{{ t('duplicatefinder', 'Same media type only') }}</span>
						</button>
					</div>

					<div class="similarity-search-row">
						<label
							for="similarity-search-input"
							class="sr-only">
							{{ t('duplicatefinder', 'Filter groups by filename or path') }}
						</label>
						<input
							id="similarity-search-input"
							v-model="searchQuery"
							type="search"
							class="similarity-search-input"
							:placeholder="t('duplicatefinder', 'Filter by filename, folder, or hash...')"
							autocomplete="off">
					</div>
				</div>

				<div
					class="similarity-category-row"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter by file category')">
					<button
						v-for="cat in categoryOptions"
						:key="cat.id"
						type="button"
						class="similarity-category-chip"
						:class="{ 'is-active': categoryFilter === cat.id }"
						:aria-pressed="categoryFilter === cat.id ? 'true' : 'false'"
						@click="categoryFilter = cat.id">
						<span>{{ cat.label }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="analysis.impact.truncated"
				class="similarity-notice-banner"
				role="status"
				aria-live="polite">
				{{ t('duplicatefinder', 'Showing pairwise clustering for the first {evaluated} of {total} filtered groups to preserve interactive responsiveness.', {
					evaluated: analysis.impact.evaluatedGroupCount,
					total: analysis.impact.totalGroupCount,
				}) }}
			</div>

			<dl
				class="similarity-kpi-grid"
				:aria-label="t('duplicatefinder', 'Live preview of group merge impact')">
				<div class="similarity-kpi-card">
					<dt class="similarity-kpi-card__label">
						{{ t('duplicatefinder', 'Merge clusters') }}
					</dt>
					<dd class="similarity-kpi-card__value">
						{{ analysis.impact.clusterCount }}
					</dd>
					<dd class="similarity-kpi-card__meta">
						{{ t('duplicatefinder', '{linked} of {total} groups linked', {
							linked: analysis.impact.linkedGroupCount,
							total: analysis.impact.evaluatedGroupCount,
						}) }}
					</dd>
				</div>

				<div class="similarity-kpi-card">
					<dt class="similarity-kpi-card__label">
						{{ t('duplicatefinder', 'Review consolidation') }}
					</dt>
					<dd class="similarity-kpi-card__value">
						{{ t('duplicatefinder', '{before} -> {after}', {
							before: analysis.impact.evaluatedGroupCount,
							after: analysis.impact.reducedEffectiveCount,
						}) }}
					</dd>
					<dd class="similarity-kpi-card__meta">
						{{ t('duplicatefinder', '-{percent}% group fragmentation', {
							percent: analysis.impact.fragmentationReductionPercent,
						}) }}
					</dd>
				</div>

				<div class="similarity-kpi-card is-highlight">
					<dt class="similarity-kpi-card__label">
						{{ t('duplicatefinder', 'Projected merge savings') }}
					</dt>
					<dd class="similarity-kpi-card__value">
						{{ analysis.impact.mergedReclaimableFormatted }}
					</dd>
					<dd class="similarity-kpi-card__meta">
						{{ t('duplicatefinder', '+{extra} beyond exact hashes', {
							extra: analysis.impact.additionalMergeGainFormatted,
						}) }}
					</dd>
				</div>

				<div class="similarity-kpi-card">
					<dt class="similarity-kpi-card__label">
						{{ t('duplicatefinder', 'Confidence tiers') }}
					</dt>
					<dd class="similarity-kpi-card__tiers">
						<span class="tier-pill is-exact">
							{{ t('duplicatefinder', 'Exact: {count}', { count: analysis.impact.confidenceCounts.exact }) }}
						</span>
						<span class="tier-pill is-high">
							{{ t('duplicatefinder', '90%+: {count}', { count: analysis.impact.confidenceCounts.high }) }}
						</span>
						<span class="tier-pill is-moderate">
							{{ t('duplicatefinder', '75%+: {count}', { count: analysis.impact.confidenceCounts.moderate }) }}
						</span>
						<span class="tier-pill is-fuzzy">
							{{ t('duplicatefinder', 'Fuzzy: {count}', { count: analysis.impact.confidenceCounts.fuzzy }) }}
						</span>
					</dd>
				</div>
			</dl>

			<div
				v-if="intraGroupSummary"
				class="similarity-active-group-strip"
				role="region"
				:aria-label="t('duplicatefinder', 'Active group filename consistency')">
				<div class="similarity-active-group-strip__text">
					<strong>{{ t('duplicatefinder', 'Active group naming:') }}</strong>
					<span>
						{{ intraGroupSummary.hasRenamedCopies
							? (intraGroupSummary.minNameSimilarity === 100
								? t('duplicatefinder', '{count} filename variants share the same normalized stem (100% match). Recommended anchor: {anchor}', {
									count: intraGroupSummary.fileCount,
									anchor: intraGroupSummary.anchorFileName,
								})
								: t('duplicatefinder', '{count} copies with renamed filenames ({min}% min, {avg}% avg name similarity). Recommended anchor: {anchor}', {
									count: intraGroupSummary.fileCount,
									min: intraGroupSummary.minNameSimilarity,
									avg: intraGroupSummary.avgNameSimilarity,
									anchor: intraGroupSummary.anchorFileName,
								}))
							: t('duplicatefinder', 'All {count} copies share identical normalized filenames (100% name match).', {
								count: intraGroupSummary.fileCount,
							}) }}
					</span>
				</div>
			</div>

			<div
				v-if="analysis.clusters.length === 0"
				class="similarity-no-matches"
				role="status"
				aria-live="polite">
				<p class="similarity-no-matches__title">
					{{ t('duplicatefinder', 'No cross-group merge clusters at {threshold}% threshold', { threshold }) }}
				</p>
				<p class="similarity-no-matches__hint">
					{{ t('duplicatefinder', 'Your loaded duplicate groups have distinct names and paths at this sensitivity. Lower the threshold or switch to Token Overlap or Path + Size mode to uncover near-identical variants.') }}
				</p>
				<div class="similarity-no-matches__actions">
					<button
						v-if="threshold > 60"
						type="button"
						class="similarity-secondary-button"
						@click="setThresholdPreset(60)">
						<span>{{ t('duplicatefinder', 'Lower threshold to 60%') }}</span>
					</button>
					<button
						v-if="!isDefaultState"
						type="button"
						class="similarity-secondary-button"
						@click="resetControls">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>
			</div>

			<div v-else class="similarity-clusters-list">
				<article
					v-for="cluster in analysis.clusters"
					:key="cluster.clusterId"
					class="similarity-cluster-card"
					:class="'is-tier-' + cluster.confidenceTier">
					<header class="similarity-cluster-card__header">
						<div class="similarity-cluster-card__title-wrap">
							<span
								class="similarity-confidence-badge"
								:class="'is-' + cluster.confidenceTier">
								{{ formatConfidenceLabel(cluster.confidenceTier) }} ({{ cluster.avgPairScore }}%)
							</span>
							<h4 class="similarity-cluster-card__title">
								{{ cluster.label }}
							</h4>
						</div>
						<div class="similarity-cluster-card__stats">
							<span class="cluster-stat-pill">
								{{ t('duplicatefinder', '{groups} groups / {files} files', {
									groups: cluster.groupCount,
									files: cluster.totalFiles,
								}) }}
							</span>
							<span class="cluster-stat-pill is-savings">
								{{ t('duplicatefinder', 'Merge savings: {merged} (+{extra})', {
									merged: cluster.mergedReclaimableFormatted,
									extra: cluster.additionalMergeGainFormatted,
								}) }}
							</span>
						</div>
					</header>

					<div class="similarity-signals-grid">
						<div class="similarity-signal-meter">
							<div class="similarity-signal-meter__head">
								<span>{{ t('duplicatefinder', 'Name Levenshtein') }}</span>
								<strong>{{ cluster.avgSignals.nameLevenshtein }}%</strong>
							</div>
							<div
								class="similarity-signal-meter__track"
								role="progressbar"
								:aria-valuenow="cluster.avgSignals.nameLevenshtein"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="similarity-signal-meter__fill"
									:style="{ width: cluster.avgSignals.nameLevenshtein + '%' }" />
							</div>
						</div>

						<div class="similarity-signal-meter">
							<div class="similarity-signal-meter__head">
								<span>{{ t('duplicatefinder', 'Token Overlap') }}</span>
								<strong>{{ cluster.avgSignals.tokenOverlap }}%</strong>
							</div>
							<div
								class="similarity-signal-meter__track"
								role="progressbar"
								:aria-valuenow="cluster.avgSignals.tokenOverlap"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="similarity-signal-meter__fill"
									:style="{ width: cluster.avgSignals.tokenOverlap + '%' }" />
							</div>
						</div>

						<div class="similarity-signal-meter">
							<div class="similarity-signal-meter__head">
								<span>{{ t('duplicatefinder', 'Size Proximity') }}</span>
								<strong>{{ cluster.avgSignals.sizeProximity }}%</strong>
							</div>
							<div
								class="similarity-signal-meter__track"
								role="progressbar"
								:aria-valuenow="cluster.avgSignals.sizeProximity"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="similarity-signal-meter__fill"
									:style="{ width: cluster.avgSignals.sizeProximity + '%' }" />
							</div>
						</div>

						<div class="similarity-signal-meter">
							<div class="similarity-signal-meter__head">
								<span>{{ t('duplicatefinder', 'Path Proximity') }}</span>
								<strong>{{ cluster.avgSignals.pathProximity }}%</strong>
							</div>
							<div
								class="similarity-signal-meter__track"
								role="progressbar"
								:aria-valuenow="cluster.avgSignals.pathProximity"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="similarity-signal-meter__fill"
									:style="{ width: cluster.avgSignals.pathProximity + '%' }" />
							</div>
						</div>
					</div>

					<div class="similarity-anchor-box">
						<span class="similarity-anchor-box__badge">
							{{ t('duplicatefinder', 'Recommended anchor ({reason})', {
								reason: formatAnchorReason(cluster.anchorFile.reason),
							}) }}
						</span>
						<span class="similarity-anchor-box__path" :title="cluster.anchorFile.normalizedPath">
							{{ cluster.anchorFile.normalizedPath }}
						</span>
						<span class="similarity-anchor-box__size">
							{{ cluster.anchorFile.sizeFormatted }}
						</span>
					</div>

					<div class="similarity-members-list">
						<div
							v-for="member in cluster.members"
							:key="cluster.clusterId + '-' + member.id"
							class="similarity-member-row"
							:class="{
								'is-current': currentDuplicate && String(currentDuplicate.id) === String(member.id),
								'is-anchor': member.isAnchorGroup,
							}">
							<div class="similarity-member-row__info">
								<div class="similarity-member-row__title-line">
									<span class="similarity-member-row__name">{{ member.fileName }}</span>
									<span v-if="member.isAnchorGroup" class="similarity-member-tag is-anchor">
										{{ t('duplicatefinder', 'Anchor group') }}
									</span>
									<span v-if="member.hasProtectedOrigin" class="similarity-member-tag is-protected">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
									<span v-if="member.acknowledged" class="similarity-member-tag is-acknowledged">
										{{ t('duplicatefinder', 'Acknowledged') }}
									</span>
								</div>
								<div class="similarity-member-row__meta">
									<span :title="member.normalizedPath">{{ member.folder || '/' }}</span>
									<span>{{ t('duplicatefinder', '{count} copies ({size})', { count: member.fileCount, size: member.unitSizeFormatted }) }}</span>
								</div>
							</div>
							<div class="similarity-member-row__actions">
								<button
									type="button"
									class="similarity-member-button"
									@click="$emit('select-duplicate', member.group)">
									<span>{{ t('duplicatefinder', 'Inspect') }}</span>
								</button>
								<button
									type="button"
									class="similarity-member-button is-compare"
									@click="$emit('compare-duplicate', member.group)">
									<span>{{ t('duplicatefinder', 'Compare') }}</span>
								</button>
							</div>
						</div>
					</div>
				</article>
			</div>
		</template>
	</section>
</template>

<script>
import {
	analyzeSimilarityClusters,
	clampSimilarityThreshold,
	computeIntraGroupSimilarity,
	DEFAULT_SIMILARITY_MODE,
	DEFAULT_SIMILARITY_THRESHOLD,
	SIMILARITY_PRESETS,
} from '../tools/similarityInspector'

export default {
	name: 'SimilarityInspector',
	props: {
		duplicates: {
			type: Array,
			default: () => [],
		},
		currentDuplicate: {
			type: Object,
			default: null,
		},
	},
	data() {
		return {
			mode: DEFAULT_SIMILARITY_MODE,
			threshold: DEFAULT_SIMILARITY_THRESHOLD,
			thresholdDraft: String(DEFAULT_SIMILARITY_THRESHOLD),
			ignoreCopySuffixes: true,
			sameCategoryOnly: false,
			categoryFilter: 'all',
			searchQuery: '',
		}
	},
	computed: {
		modeOptions() {
			return [
				{ id: 'hybrid', label: this.t('duplicatefinder', 'Hybrid') },
				{ id: 'levenshtein', label: this.t('duplicatefinder', 'Name Levenshtein') },
				{ id: 'token', label: this.t('duplicatefinder', 'Token Overlap') },
				{ id: 'path-size', label: this.t('duplicatefinder', 'Path + Size') },
			]
		},
		presetOptions() {
			const labels = {
				strict: this.t('duplicatefinder', '90% Strict'),
				balanced: this.t('duplicatefinder', '75% Balanced'),
				broad: this.t('duplicatefinder', '60% Broad'),
			}
			return SIMILARITY_PRESETS.map(preset => ({
				id: preset.id,
				threshold: preset.threshold,
				label: labels[preset.id] || `${preset.threshold}%`,
			}))
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All types') },
				{ id: 'images', label: this.t('duplicatefinder', 'Images') },
				{ id: 'videos', label: this.t('duplicatefinder', 'Videos') },
				{ id: 'audio', label: this.t('duplicatefinder', 'Audio') },
				{ id: 'documents', label: this.t('duplicatefinder', 'Documents') },
				{ id: 'archives', label: this.t('duplicatefinder', 'Archives') },
			]
		},
		isDefaultState() {
			return this.mode === DEFAULT_SIMILARITY_MODE
				&& this.threshold === DEFAULT_SIMILARITY_THRESHOLD
				&& this.ignoreCopySuffixes === true
				&& this.sameCategoryOnly === false
				&& this.categoryFilter === 'all'
				&& this.searchQuery === ''
		},
		analysis() {
			return analyzeSimilarityClusters(this.duplicates, {
				mode: this.mode,
				threshold: this.threshold,
				ignoreCopySuffixes: this.ignoreCopySuffixes,
				sameCategoryOnly: this.sameCategoryOnly,
				categoryFilter: this.categoryFilter,
				searchQuery: this.searchQuery,
			})
		},
		intraGroupSummary() {
			return computeIntraGroupSimilarity(this.currentDuplicate, {
				ignoreCopySuffixes: this.ignoreCopySuffixes,
			})
		},
	},
	methods: {
		syncDraftThresholdFromSlider() {
			this.thresholdDraft = String(this.threshold)
		},
		onThresholdNumberInput() {
			const raw = String(this.thresholdDraft || '').trim()
			if (raw === '') {
				return
			}
			const parsed = Number(raw)
			if (Number.isFinite(parsed) && parsed >= 50 && parsed <= 100) {
				this.threshold = Math.round(parsed)
			}
		},
		commitThresholdDraft() {
			const raw = String(this.thresholdDraft || '').trim()
			if (raw === '') {
				this.thresholdDraft = String(this.threshold)
				return
			}
			const clamped = clampSimilarityThreshold(raw)
			this.threshold = clamped
			this.thresholdDraft = String(clamped)
		},
		setThresholdPreset(value) {
			const clamped = clampSimilarityThreshold(value)
			this.threshold = clamped
			this.thresholdDraft = String(clamped)
		},
		resetControls() {
			this.mode = DEFAULT_SIMILARITY_MODE
			this.threshold = DEFAULT_SIMILARITY_THRESHOLD
			this.thresholdDraft = String(DEFAULT_SIMILARITY_THRESHOLD)
			this.ignoreCopySuffixes = true
			this.sameCategoryOnly = false
			this.categoryFilter = 'all'
			this.searchQuery = ''
		},
		formatConfidenceLabel(tier) {
			if (tier === 'exact') {
				return this.t('duplicatefinder', 'Exact Hash')
			}
			if (tier === 'high') {
				return this.t('duplicatefinder', 'High Match')
			}
			if (tier === 'moderate') {
				return this.t('duplicatefinder', 'Moderate Match')
			}
			return this.t('duplicatefinder', 'Fuzzy Match')
		},
		formatAnchorReason(reason) {
			if (reason === 'protected') {
				return this.t('duplicatefinder', 'Protected origin')
			}
			if (reason === 'oldest') {
				return this.t('duplicatefinder', 'Oldest copy')
			}
			if (reason === 'largest') {
				return this.t('duplicatefinder', 'Largest copy')
			}
			return this.t('duplicatefinder', 'Shortest path')
		},
	},
}
</script>

<style scoped>
.similarity-workspace {
	margin: 16px 20px 0;
	padding: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	min-width: 0;
	box-sizing: border-box;
}

.similarity-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 14px;
}

.similarity-toolbar__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.similarity-toolbar__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.similarity-toolbar__badge {
	display: inline-flex;
	align-items: center;
	padding: 3px 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.similarity-toolbar__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.similarity-toolbar__button,
.similarity-primary-button,
.similarity-secondary-button,
.similarity-mode-button,
.similarity-preset-chip,
.similarity-toggle-chip,
.similarity-category-chip,
.similarity-member-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 36px;
	padding: 6px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	line-height: 1.25;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.similarity-primary-button {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.similarity-toolbar__button:hover:not(:disabled),
.similarity-secondary-button:hover:not(:disabled),
.similarity-mode-button:hover:not(:disabled),
.similarity-preset-chip:hover:not(:disabled),
.similarity-toggle-chip:hover:not(:disabled),
.similarity-category-chip:hover:not(:disabled),
.similarity-member-button:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.similarity-mode-button.is-active,
.similarity-preset-chip.is-active,
.similarity-toggle-chip.is-active,
.similarity-category-chip.is-active,
.similarity-member-button.is-compare {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.similarity-toolbar__button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.similarity-controls-ribbon {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 12px;
	padding: 12px;
	margin-bottom: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
}

.similarity-control-block {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.similarity-control-label {
	font-size: 0.84rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.similarity-mode-group,
.similarity-presets-row,
.similarity-toggles-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.similarity-threshold-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.similarity-preset-chip,
.similarity-toggle-chip,
.similarity-category-chip {
	min-height: 32px;
	padding: 4px 10px;
	font-size: 0.8rem;
}

.similarity-threshold-inputs {
	display: flex;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.similarity-range-slider {
	flex: 1 1 auto;
	min-width: 0;
	accent-color: var(--color-primary-element, #0082c9);
	cursor: pointer;
}

.similarity-numeric-wrap {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex-shrink: 0;
}

.similarity-number-input {
	width: 64px;
	min-height: 36px;
	padding: 4px 8px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	box-sizing: border-box;
}

.similarity-number-unit {
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.similarity-search-row {
	min-width: 0;
}

.similarity-search-input {
	width: 100%;
	min-height: 36px;
	padding: 6px 10px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
}

.similarity-category-row {
	grid-column: 1 / -1;
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding-top: 8px;
	border-top: 1px solid var(--color-border);
}

.similarity-notice-banner {
	padding: 10px 12px;
	margin-bottom: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast);
	font-size: 0.85rem;
}

.similarity-kpi-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
	gap: 10px;
	margin: 0 0 14px;
}

.similarity-kpi-card {
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	min-width: 0;
}

.similarity-kpi-card.is-highlight {
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
}

.similarity-kpi-card__label {
	font-size: 0.78rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
	margin-bottom: 4px;
}

.similarity-kpi-card__value {
	margin: 0;
	font-size: 1.2rem;
	font-weight: 700;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
}

.similarity-kpi-card__meta {
	margin: 4px 0 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.similarity-kpi-card__tiers {
	margin: 4px 0 0;
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.tier-pill {
	display: inline-flex;
	align-items: center;
	padding: 2px 7px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 600;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
}

.similarity-active-group-strip {
	padding: 10px 12px;
	margin-bottom: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-main-background);
	font-size: 0.86rem;
	overflow-wrap: anywhere;
}

.similarity-active-group-strip__text {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: baseline;
}

.similarity-empty-state,
.similarity-no-matches {
	padding: 20px 16px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	text-align: center;
}

.similarity-empty-state__title,
.similarity-no-matches__title {
	margin: 0 0 6px;
	font-weight: 700;
	font-size: 0.98rem;
	color: var(--color-main-text);
}

.similarity-empty-state__hint,
.similarity-no-matches__hint {
	margin: 0 auto 12px;
	max-width: 62ch;
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
}

.similarity-no-matches__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.similarity-clusters-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.similarity-cluster-card {
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	min-width: 0;
}

.similarity-cluster-card__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 10px;
}

.similarity-cluster-card__title-wrap {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.similarity-confidence-badge {
	display: inline-flex;
	align-items: center;
	padding: 3px 9px;
	border-radius: 999px;
	font-size: 0.78rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.similarity-confidence-badge.is-exact,
.similarity-confidence-badge.is-high {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.similarity-cluster-card__title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.similarity-cluster-card__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.cluster-stat-pill {
	display: inline-flex;
	align-items: center;
	padding: 3px 9px;
	border-radius: 999px;
	font-size: 0.8rem;
	font-weight: 600;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
}

.similarity-signals-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 10px;
	margin-bottom: 10px;
}

.similarity-signal-meter__head {
	display: flex;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.78rem;
	margin-bottom: 4px;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.similarity-signal-meter__head strong {
	color: var(--color-main-text);
}

.similarity-signal-meter__track {
	height: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.similarity-signal-meter__fill {
	height: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
	transition: width 0.15s ease;
}

.similarity-anchor-box {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	margin-bottom: 10px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.83rem;
}

.similarity-anchor-box__badge {
	font-weight: 700;
	color: var(--color-main-text);
}

.similarity-anchor-box__path {
	flex: 1 1 200px;
	min-width: 0;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.similarity-anchor-box__size {
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--color-main-text);
}

.similarity-members-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.similarity-member-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.similarity-member-row.is-current {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-background-hover);
}

.similarity-member-row__info {
	flex: 1 1 220px;
	min-width: 0;
}

.similarity-member-row__title-line {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-bottom: 2px;
}

.similarity-member-row__name {
	font-weight: 600;
	font-size: 0.88rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.similarity-member-tag {
	display: inline-flex;
	align-items: center;
	padding: 1px 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 600;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
}

.similarity-member-tag.is-anchor {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-main-text);
}

.similarity-member-row__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.similarity-member-row__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.similarity-toolbar__button:focus-visible,
.similarity-primary-button:focus-visible,
.similarity-secondary-button:focus-visible,
.similarity-mode-button:focus-visible,
.similarity-preset-chip:focus-visible,
.similarity-toggle-chip:focus-visible,
.similarity-category-chip:focus-visible,
.similarity-member-button:focus-visible,
.similarity-range-slider:focus-visible,
.similarity-number-input:focus-visible,
.similarity-search-input:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 768px) {
	.similarity-workspace {
		margin: 12px 12px 0;
		padding: 12px;
	}

	.similarity-toolbar__button,
	.similarity-primary-button,
	.similarity-secondary-button,
	.similarity-mode-button,
	.similarity-preset-chip,
	.similarity-toggle-chip,
	.similarity-category-chip,
	.similarity-member-button,
	.similarity-number-input,
	.similarity-search-input {
		min-height: 44px;
	}

	.similarity-controls-ribbon {
		grid-template-columns: minmax(0, 1fr);
	}

	.similarity-kpi-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.similarity-member-row__actions {
		width: 100%;
	}

	.similarity-member-button {
		flex: 1 1 auto;
	}
}
</style>
