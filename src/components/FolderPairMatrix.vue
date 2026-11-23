<template>
	<section
		class="folder-matrix"
		role="region"
		:aria-label="t('duplicatefinder', 'Directory Folder Pair Overlap Matrix')">
		<header class="folder-matrix__toolbar">
			<div class="folder-matrix__title-group">
				<h3 class="folder-matrix__title">
					{{ t('duplicatefinder', 'Directory Folder Pair Matrix') }}
				</h3>
				<span
					class="folder-matrix__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{pairs} folder pairs, {size} max reclaimable', {
						pairs: matrix.summary.pairCount,
						size: matrix.summary.bestPairReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="folder-matrix__toolbar-actions">
				<button
					type="button"
					class="folder-matrix__tool-btn"
					:disabled="matrix.pairs.length === 0 || isExecuting"
					@click="exportMatrixCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="folder-matrix__tool-btn"
					:disabled="matrix.pairs.length === 0 || isExecuting"
					@click="exportMatrixJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="folder-matrix__tool-btn is-close"
					aria-keyshortcuts="d"
					:title="t('duplicatefinder', 'Hide directory folder pair matrix')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide matrix') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="folder-matrix__empty">
			<p class="folder-matrix__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="folder-matrix__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to discover mirrored directories and side-by-side folder overlap.') }}
			</p>
			<button
				type="button"
				class="folder-matrix__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="folder-matrix__controls">
				<div class="folder-matrix__control-row">
					<span class="folder-matrix__control-label">
						{{ t('duplicatefinder', 'Matrix scope') }}
					</span>
					<div
						class="folder-matrix__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Folder pair matrix scope')">
						<button
							type="button"
							class="folder-matrix__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="folder-matrix__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="folder-matrix__select-field">
						<span class="folder-matrix__control-label">{{ t('duplicatefinder', 'Min shared') }}</span>
						<select
							v-model.number="minSharedGroups"
							class="folder-matrix__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Minimum shared duplicate files')">
							<option :value="1">
								{{ t('duplicatefinder', '1+ shared files') }}
							</option>
							<option :value="2">
								{{ t('duplicatefinder', '2+ shared files') }}
							</option>
							<option :value="3">
								{{ t('duplicatefinder', '3+ shared files') }}
							</option>
							<option :value="5">
								{{ t('duplicatefinder', '5+ shared files') }}
							</option>
						</select>
					</label>

					<label class="folder-matrix__select-field">
						<span class="folder-matrix__control-label">{{ t('duplicatefinder', 'Sort pairs') }}</span>
						<select
							v-model="sortBy"
							class="folder-matrix__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Sort folder pairs')">
							<option value="reclaimable_desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="files_desc">
								{{ t('duplicatefinder', 'Most shared files') }}
							</option>
							<option value="overlap_desc">
								{{ t('duplicatefinder', 'Highest overlap %') }}
							</option>
							<option value="name_asc">
								{{ t('duplicatefinder', 'Folder path A-Z') }}
							</option>
						</select>
					</label>
				</div>

				<div class="folder-matrix__filter-bar">
					<div class="folder-matrix__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="folder-matrix__search-input"
							:disabled="isExecuting"
							:placeholder="t('duplicatefinder', 'Filter folder pairs by path...')"
							:aria-label="t('duplicatefinder', 'Filter folder pairs by path')">
					</div>

					<div class="folder-matrix__filter-toggles">
						<button
							type="button"
							class="folder-matrix__toggle-chip"
							:class="{ 'is-active': onlyProtectedPairs }"
							:aria-pressed="onlyProtectedPairs ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="onlyProtectedPairs = !onlyProtectedPairs">
							<span>{{ t('duplicatefinder', 'Protected origins only') }}</span>
						</button>
						<button
							type="button"
							class="folder-matrix__toggle-chip"
							:class="{ 'is-active': includeAcknowledged }"
							:aria-pressed="includeAcknowledged ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="includeAcknowledged = !includeAcknowledged">
							<span>{{ t('duplicatefinder', 'Include acknowledged') }}</span>
						</button>
					</div>
				</div>

				<div class="folder-matrix__kpis">
					<div class="folder-matrix__kpi">
						<span class="folder-matrix__kpi-label">{{ t('duplicatefinder', 'Folder pairs') }}</span>
						<strong class="folder-matrix__kpi-value">{{ matrix.summary.pairCount }}</strong>
					</div>
					<div class="folder-matrix__kpi">
						<span class="folder-matrix__kpi-label">{{ t('duplicatefinder', 'Mirrored folders') }}</span>
						<strong class="folder-matrix__kpi-value">{{ matrix.summary.mirrorPairCount }}</strong>
					</div>
					<div class="folder-matrix__kpi">
						<span class="folder-matrix__kpi-label">{{ t('duplicatefinder', 'Shared group links') }}</span>
						<strong class="folder-matrix__kpi-value">{{ matrix.summary.totalSharedRows }}</strong>
					</div>
					<div class="folder-matrix__kpi">
						<span class="folder-matrix__kpi-label">{{ t('duplicatefinder', 'Best pair savings') }}</span>
						<strong class="folder-matrix__kpi-value">{{ matrix.summary.bestPairReclaimableFormatted }}</strong>
					</div>
				</div>
			</div>

			<div
				v-if="feedbackMessage"
				class="folder-matrix__feedback"
				:class="'is-' + feedbackType"
				role="status"
				aria-live="polite">
				<span>{{ feedbackMessage }}</span>
			</div>

			<div v-if="matrix.pairs.length === 0" class="folder-matrix__empty">
				<p class="folder-matrix__empty-title">
					{{ t('duplicatefinder', 'No folder pairs match the current criteria') }}
				</p>
				<p class="folder-matrix__empty-hint">
					{{ t('duplicatefinder', 'Lower the minimum shared files threshold, clear the path filter, or switch to All loaded groups.') }}
				</p>
				<button
					v-if="hasActiveFilters"
					type="button"
					class="folder-matrix__tool-btn"
					@click="resetMatrixFilters">
					<span>{{ t('duplicatefinder', 'Reset matrix filters') }}</span>
				</button>
			</div>

			<div v-else class="folder-matrix__workbench">
				<aside
					class="folder-matrix__pairs-rail"
					:aria-label="t('duplicatefinder', 'Ranked folder pairs')">
					<ul class="folder-matrix__pair-list">
						<li
							v-for="pair in matrix.pairs"
							:key="pair.pairKey"
							class="folder-pair-item">
							<button
								type="button"
								class="folder-pair-card"
								:class="{ 'is-selected': selectedPair && selectedPair.pairKey === pair.pairKey }"
								:aria-current="selectedPair && selectedPair.pairKey === pair.pairKey ? 'true' : null"
								@click="selectPair(pair.pairKey)">
								<div class="folder-pair-card__top">
									<span
										class="folder-pair-card__mirror-pill"
										:class="'is-' + pair.mirrorKind">
										{{ formatMirrorLabel(pair) }}
									</span>
									<span
										v-if="pair.hasProtectedSide"
										class="folder-pair-card__protected-pill">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
									<span class="folder-pair-card__savings">
										{{ pair.maxReclaimableFormatted }}
									</span>
								</div>

								<div class="folder-pair-card__paths">
									<span class="folder-pair-card__path" :title="pair.leftFolder">
										A: {{ pair.leftFolder }}
									</span>
									<span class="folder-pair-card__path" :title="pair.rightFolder">
										B: {{ pair.rightFolder }}
									</span>
								</div>

								<div class="folder-pair-card__bar" aria-hidden="true">
									<div
										class="folder-pair-card__bar-fill"
										:style="{ width: pair.containmentPercent + '%' }" />
								</div>

								<div class="folder-pair-card__meta">
									<span>
										{{ t('duplicatefinder', '{count} shared groups', { count: pair.sharedGroupCount }) }}
									</span>
									<span>
										{{ t('duplicatefinder', '{overlap}% overlap', { overlap: pair.containmentPercent }) }}
									</span>
								</div>
							</button>
						</li>
					</ul>
				</aside>

				<div
					v-if="selectedPair && activePlan"
					class="folder-matrix__diff-pane"
					role="region"
					:aria-label="t('duplicatefinder', 'Side-by-side folder pair comparison')">
					<header class="folder-diff-header">
						<div class="folder-diff-header__sides">
							<div
								class="folder-side-box"
								:class="{
									'is-kept': activePlan.keepSide === 'left',
									'is-cleaned': activePlan.cleanSide === 'left',
									'is-protected': selectedPair.leftHasProtected,
								}">
								<div class="folder-side-box__top">
									<span class="folder-side-box__badge">
										{{ activePlan.keepSide === 'left'
											? t('duplicatefinder', 'Folder A (Keep)')
											: t('duplicatefinder', 'Folder A (Clean)') }}
									</span>
									<span
										v-if="selectedPair.leftHasProtected"
										class="folder-side-box__origin-tag">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
								</div>
								<strong class="folder-side-box__path" :title="selectedPair.leftFolder">
									{{ selectedPair.leftFolder }}
								</strong>
								<div class="folder-side-box__actions">
									<button
										type="button"
										class="folder-side-box__btn"
										:class="{ 'is-active': activePlan.keepSide === 'left' }"
										:aria-pressed="activePlan.keepSide === 'left' ? 'true' : 'false'"
										:disabled="isExecuting"
										@click="setKeepSide('left')">
										<span>{{ t('duplicatefinder', 'Keep A') }}</span>
									</button>
									<button
										type="button"
										class="folder-side-box__btn"
										:disabled="isExecuting"
										@click="$emit('sync-folder-filter', selectedPair.leftFolder)">
										<span>{{ t('duplicatefinder', 'Filter sidebar') }}</span>
									</button>
								</div>
							</div>

							<div
								class="folder-side-box"
								:class="{
									'is-kept': activePlan.keepSide === 'right',
									'is-cleaned': activePlan.cleanSide === 'right',
									'is-protected': selectedPair.rightHasProtected,
								}">
								<div class="folder-side-box__top">
									<span class="folder-side-box__badge">
										{{ activePlan.keepSide === 'right'
											? t('duplicatefinder', 'Folder B (Keep)')
											: t('duplicatefinder', 'Folder B (Clean)') }}
									</span>
									<span
										v-if="selectedPair.rightHasProtected"
										class="folder-side-box__origin-tag">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
								</div>
								<strong class="folder-side-box__path" :title="selectedPair.rightFolder">
									{{ selectedPair.rightFolder }}
								</strong>
								<div class="folder-side-box__actions">
									<button
										type="button"
										class="folder-side-box__btn"
										:class="{ 'is-active': activePlan.keepSide === 'right' }"
										:aria-pressed="activePlan.keepSide === 'right' ? 'true' : 'false'"
										:disabled="isExecuting"
										@click="setKeepSide('right')">
										<span>{{ t('duplicatefinder', 'Keep B') }}</span>
									</button>
									<button
										type="button"
										class="folder-side-box__btn"
										:disabled="isExecuting"
										@click="$emit('sync-folder-filter', selectedPair.rightFolder)">
										<span>{{ t('duplicatefinder', 'Filter sidebar') }}</span>
									</button>
								</div>
							</div>
						</div>

						<div class="folder-diff-header__execution">
							<div class="folder-diff-header__plan-summary">
								<span>
									{{ t('duplicatefinder', 'Recommendation: {reason}', {
										reason: formatRecommendationReason(selectedPair.recommendationReason),
									}) }}
								</span>
								<strong v-if="activePlan.summary.deleteCount > 0">
									{{ t('duplicatefinder', '{count} files marked ({size} freed)', {
										count: activePlan.summary.deleteCount,
										size: activePlan.summary.reclaimableFormatted,
									}) }}
								</strong>
								<span v-else>
									{{ t('duplicatefinder', 'No deletable copies on cleaned side') }}
								</span>
							</div>

							<div class="folder-diff-header__cta-group">
								<button
									type="button"
									class="folder-matrix__tool-btn"
									:disabled="isExecuting"
									@click="flipKeepSide">
									<span>{{ t('duplicatefinder', 'Swap Keep A/B') }}</span>
								</button>
								<button
									type="button"
									class="folder-matrix__danger-btn"
									:disabled="activePlan.summary.deleteCount === 0 || isExecuting"
									@click="openDeleteDialog">
									<span>
										{{ isExecuting
											? t('duplicatefinder', 'Deleting...')
											: t('duplicatefinder', 'Clean {count} files ({size})', {
												count: activePlan.summary.deleteCount,
												size: activePlan.summary.reclaimableFormatted,
											}) }}
									</span>
								</button>
							</div>
						</div>
					</header>

					<ul class="folder-diff-rows">
						<li
							v-for="row in activePlan.rows"
							:key="row.groupKey"
							class="folder-diff-row"
							:class="{ 'is-current': currentDuplicateId && row.groupId === currentDuplicateId }">
							<div class="folder-diff-row__header">
								<div class="folder-diff-row__identity">
									<strong class="folder-diff-row__name">{{ row.groupName }}</strong>
									<span class="folder-diff-row__size">{{ row.unitSizeFormatted }}</span>
									<span
										v-if="row.outsideFilesCount > 0"
										class="folder-diff-row__outside">
										{{ t('duplicatefinder', '+{count} outside pair', { count: row.outsideFilesCount }) }}
									</span>
								</div>
								<div class="folder-diff-row__actions">
									<button
										type="button"
										class="folder-diff-row__btn"
										@click="$emit('select-duplicate', row.rawGroup)">
										<span>{{ t('duplicatefinder', 'Inspect') }}</span>
									</button>
									<button
										type="button"
										class="folder-diff-row__btn is-compare"
										@click="$emit('compare-duplicate', row.rawGroup)">
										<span>{{ t('duplicatefinder', 'Compare') }}</span>
									</button>
								</div>
							</div>

							<div class="folder-diff-row__columns">
								<div
									class="folder-diff-cell"
									:class="{ 'is-kept-side': activePlan.keepSide === 'left' }">
									<div
										v-for="entry in row.leftEntries"
										:key="'L-' + entry.selectionKey"
										class="folder-diff-entry"
										:class="'is-' + entry.status">
										<label
											v-if="entry.canToggle"
											class="folder-diff-entry__check">
											<input
												type="checkbox"
												class="folder-diff-entry__checkbox"
												:checked="entry.marked"
												:disabled="isExecuting"
												:aria-label="t('duplicatefinder', 'Delete {path}', { path: displayPath(entry.file) })"
												@change="toggleFileExclusion(entry.selectionKey)">
											<span class="folder-diff-entry__path" :title="displayPath(entry.file)">
												{{ displayBaseName(entry.file) }}
											</span>
										</label>
										<div v-else class="folder-diff-entry__static">
											<span class="folder-diff-entry__path" :title="displayPath(entry.file)">
												{{ displayBaseName(entry.file) }}
											</span>
										</div>
										<div class="folder-diff-entry__meta">
											<span
												class="folder-diff-entry__status"
												:class="'is-' + entry.status">
												{{ formatEntryStatus(entry.status) }}
											</span>
											<span v-if="row.leftModifiedLabel" class="folder-diff-entry__mtime">
												{{ row.leftModifiedLabel }}
											</span>
										</div>
									</div>
								</div>

								<div
									class="folder-diff-cell"
									:class="{ 'is-kept-side': activePlan.keepSide === 'right' }">
									<div
										v-for="entry in row.rightEntries"
										:key="'R-' + entry.selectionKey"
										class="folder-diff-entry"
										:class="'is-' + entry.status">
										<label
											v-if="entry.canToggle"
											class="folder-diff-entry__check">
											<input
												type="checkbox"
												class="folder-diff-entry__checkbox"
												:checked="entry.marked"
												:disabled="isExecuting"
												:aria-label="t('duplicatefinder', 'Delete {path}', { path: displayPath(entry.file) })"
												@change="toggleFileExclusion(entry.selectionKey)">
											<span class="folder-diff-entry__path" :title="displayPath(entry.file)">
												{{ displayBaseName(entry.file) }}
											</span>
										</label>
										<div v-else class="folder-diff-entry__static">
											<span class="folder-diff-entry__path" :title="displayPath(entry.file)">
												{{ displayBaseName(entry.file) }}
											</span>
										</div>
										<div class="folder-diff-entry__meta">
											<span
												class="folder-diff-entry__status"
												:class="'is-' + entry.status">
												{{ formatEntryStatus(entry.status) }}
											</span>
											<span v-if="row.rightModifiedLabel" class="folder-diff-entry__mtime">
												{{ row.rightModifiedLabel }}
											</span>
										</div>
									</div>
								</div>
							</div>
						</li>
					</ul>
				</div>
			</div>
		</template>

		<dialog
			v-if="showDeleteDialog && activePlan"
			ref="pairDeleteDialog"
			class="folder-matrix-dialog"
			role="alertdialog"
			aria-modal="true"
			aria-labelledby="folder-pair-delete-title"
			aria-describedby="folder-pair-delete-desc"
			@cancel.prevent="closeDeleteDialog"
			@keydown.esc.prevent.stop="closeDeleteDialog"
			@click.self="closeDeleteDialog">
			<div class="folder-matrix-dialog__surface">
				<h4 id="folder-pair-delete-title" class="folder-matrix-dialog__title">
					{{ t('duplicatefinder', 'Confirm folder pair cleanup') }}
				</h4>
				<p id="folder-pair-delete-desc" class="folder-matrix-dialog__desc">
					{{ t('duplicatefinder', 'Delete {count} duplicate files from {cleaned} while keeping copies safe in {kept}?', {
						count: activePlan.summary.deleteCount,
						cleaned: activePlan.cleanedFolder,
						kept: activePlan.keptFolder,
					}) }}
				</p>
				<dl class="folder-matrix-dialog__stats">
					<div class="folder-matrix-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Files to delete') }}</dt>
						<dd>{{ activePlan.summary.deleteCount }}</dd>
					</div>
					<div class="folder-matrix-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Kept in anchor folder') }}</dt>
						<dd>{{ activePlan.summary.keptInPairCount }}</dd>
					</div>
					<div class="folder-matrix-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Space freed') }}</dt>
						<dd>{{ activePlan.summary.reclaimableFormatted }}</dd>
					</div>
				</dl>
				<p
					v-if="activePlan.summary.protectedSkippedCount > 0"
					class="folder-matrix-dialog__note">
					{{ t('duplicatefinder', '{count} protected or locked file(s) on the cleaned side will remain untouched.', {
						count: activePlan.summary.protectedSkippedCount,
					}) }}
				</p>
				<div class="folder-matrix-dialog__actions">
					<button
						type="button"
						class="folder-matrix-dialog__btn is-cancel"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="folder-matrix-dialog__btn is-danger"
						@click="executePairCleanup">
						<span>{{ t('duplicatefinder', 'Delete {count} files', { count: activePlan.summary.deleteCount }) }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { normalizePathForDiff } from '../tools/duplicatePathDiff'
import {
	buildFolderPairCleanupPlan,
	buildFolderPairMatrix,
	buildFolderPairMatrixCsv,
	buildFolderPairMatrixJson,
} from '../tools/folderPairMatrix'

export default {
	name: 'FolderPairMatrix',
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
			minSharedGroups: 1,
			sortBy: 'reclaimable_desc',
			searchQuery: '',
			onlyProtectedPairs: false,
			includeAcknowledged: false,
			selectedPairKey: '',
			keepSideByPair: {},
			excludedFileKeysByPair: {},
			isExecuting: false,
			feedbackMessage: '',
			feedbackType: 'info',
			showDeleteDialog: false,
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredCount
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		hasActiveFilters() {
			return Boolean(
				this.minSharedGroups > 1
				|| this.searchQuery.trim()
				|| this.onlyProtectedPairs
				|| !this.includeAcknowledged
				|| this.scope === 'filtered'
			)
		},
		matrix() {
			return buildFolderPairMatrix(this.activePool, {
				includeAcknowledged: this.includeAcknowledged,
				minSharedGroups: this.minSharedGroups,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
				onlyProtectedPairs: this.onlyProtectedPairs,
			})
		},
		selectedPair() {
			const pairs = this.matrix.pairs
			if (!Array.isArray(pairs) || pairs.length === 0) {
				return null
			}
			const found = pairs.find(pair => pair.pairKey === this.selectedPairKey)
			return found || pairs[0]
		},
		activePlan() {
			if (!this.selectedPair) {
				return null
			}
			const pairKey = this.selectedPair.pairKey
			const keepSide = this.keepSideByPair[pairKey] || 'auto'
			const excludedKeys = this.excludedFileKeysByPair[pairKey] || []
			return buildFolderPairCleanupPlan(this.selectedPair, {
				keepSide,
				excludedFileKeys: excludedKeys,
			})
		},
	},
	watch: {
		'matrix.pairs': {
			immediate: true,
			handler(pairs) {
				if (!Array.isArray(pairs) || pairs.length === 0) {
					this.selectedPairKey = ''
					return
				}
				if (!pairs.some(pair => pair.pairKey === this.selectedPairKey)) {
					this.selectedPairKey = pairs[0].pairKey
				}
			},
		},
	},
	methods: {
		displayPath(file) {
			if (!file || typeof file.path !== 'string') {
				return ''
			}
			return normalizePathForDiff(file.path) || file.path
		},
		displayBaseName(file) {
			const normalized = this.displayPath(file)
			if (!normalized) {
				return ''
			}
			const idx = normalized.lastIndexOf('/')
			return idx >= 0 ? normalized.slice(idx + 1) : normalized
		},
		formatMirrorLabel(pair) {
			if (pair.mirrorKind === 'exact_mirror') {
				return this.t('duplicatefinder', '100% mirror')
			}
			if (pair.mirrorKind === 'subset_mirror') {
				return this.t('duplicatefinder', 'Subset mirror')
			}
			return this.t('duplicatefinder', 'Partial overlap')
		},
		formatRecommendationReason(reason) {
			switch (reason) {
			case 'protected_origin':
				return this.t('duplicatefinder', 'Protected origin folder')
			case 'max_reclaimable':
				return this.t('duplicatefinder', 'Reclaims maximum storage')
			case 'older_copies':
				return this.t('duplicatefinder', 'Preserves older originals')
			default:
				return this.t('duplicatefinder', 'Shorter canonical path')
			}
		},
		formatEntryStatus(status) {
			switch (status) {
			case 'protected_origin':
				return this.t('duplicatefinder', 'Protected origin')
			case 'locked_file':
				return this.t('duplicatefinder', 'Locked')
			case 'kept_reference':
				return this.t('duplicatefinder', 'Kept')
			case 'marked_delete':
				return this.t('duplicatefinder', 'Delete')
			case 'user_kept':
				return this.t('duplicatefinder', 'Unchecked')
			default:
				return this.t('duplicatefinder', 'Safety kept')
			}
		},
		selectPair(pairKey) {
			this.selectedPairKey = pairKey
			this.feedbackMessage = ''
		},
		setKeepSide(side) {
			if (!this.selectedPair) {
				return
			}
			this.$set(this.keepSideByPair, this.selectedPair.pairKey, side)
		},
		flipKeepSide() {
			if (!this.activePlan) {
				return
			}
			const nextSide = this.activePlan.keepSide === 'left' ? 'right' : 'left'
			this.setKeepSide(nextSide)
		},
		toggleFileExclusion(selectionKey) {
			if (!this.selectedPair || !selectionKey) {
				return
			}
			const pairKey = this.selectedPair.pairKey
			const current = Array.isArray(this.excludedFileKeysByPair[pairKey])
				? [...this.excludedFileKeysByPair[pairKey]]
				: []
			const idx = current.indexOf(selectionKey)
			if (idx >= 0) {
				current.splice(idx, 1)
			} else {
				current.push(selectionKey)
			}
			this.$set(this.excludedFileKeysByPair, pairKey, current)
		},
		resetMatrixFilters() {
			this.minSharedGroups = 1
			this.searchQuery = ''
			this.onlyProtectedPairs = false
			this.includeAcknowledged = true
			this.scope = 'all'
		},
		openDeleteDialog() {
			if (!this.activePlan || this.activePlan.summary.deleteCount === 0 || this.isExecuting) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			this.showDeleteDialog = true
			this.$nextTick(() => {
				const dialog = this.$refs.pairDeleteDialog
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
		closeDeleteDialog() {
			this.showDeleteDialog = false
			const dialog = this.$refs.pairDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function' && dialog.open) {
					dialog.close()
				} else {
					dialog.removeAttribute('open')
				}
			}
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function' && prev.isConnected) {
				prev.focus()
			}
		},
		async executePairCleanup() {
			if (!this.activePlan || this.activePlan.summary.deleteCount === 0 || this.isExecuting) {
				return
			}
			const planSnapshot = this.activePlan
			const targets = [...planSnapshot.deleteTargets]
			this.closeDeleteDialog()
			this.isExecuting = true
			this.feedbackMessage = ''

			try {
				const result = await deleteFiles(targets)
				const deletedFiles = Array.isArray(result?.success) ? result.success : []
				const errorFiles = Array.isArray(result?.errors) ? result.errors : []
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds) ? result.deletedNodeIds : []

				if (deletedFiles.length > 0) {
					const bytesReclaimed = deletedFiles.reduce(
						(sum, file) => sum + (Number(file && file.size) > 0 ? Math.floor(Number(file.size)) : 0),
						0
					)
					const groupsResolved = new Set(
						deletedFiles.map(file => file && (file.groupKey || file.fileHash)).filter(Boolean)
					).size

					this.$emit('folder-pair-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved,
						sampleLabel: planSnapshot.cleanedFolder,
					})
				}

				if (errorFiles.length === 0) {
					this.feedbackType = 'success'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Cleaned {count} duplicate files from {folder}.',
						{
							count: deletedFiles.length,
							folder: planSnapshot.cleanedFolder,
						}
					)
				} else {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Deleted {deleted} file(s); {failed} file(s) could not be deleted.',
						{
							deleted: deletedFiles.length,
							failed: errorFiles.length,
						}
					)
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Folder pair cleanup failed.')
			} finally {
				this.isExecuting = false
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
				return false
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
			if (typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(url)
			}
			return true
		},
		exportMatrixCsv() {
			if (this.matrix.pairs.length === 0) {
				return
			}
			const csv = buildFolderPairMatrixCsv(this.matrix)
			this.triggerDownload(csv, 'duplicatefinder-folder-pairs.csv', 'text/csv;charset=utf-8')
		},
		exportMatrixJson() {
			if (this.matrix.pairs.length === 0) {
				return
			}
			const json = buildFolderPairMatrixJson(this.matrix, { scope: this.scope })
			this.triggerDownload(json, 'duplicatefinder-folder-pairs.json', 'application/json;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.folder-matrix {
	margin-block: 12px 16px;
	margin-inline: 16px;
	padding-block: 14px;
	padding-inline: 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.folder-matrix__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-end: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.folder-matrix__title-group,
.folder-matrix__toolbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.folder-matrix__title {
	margin-block: 0;
	font-size: 1.02rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.folder-matrix__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--color-main-text);
}

.folder-matrix__tool-btn,
.folder-matrix__pill-btn,
.folder-matrix__toggle-chip,
.folder-matrix__primary-btn,
.folder-matrix__danger-btn,
.folder-side-box__btn,
.folder-diff-row__btn,
.folder-matrix-dialog__btn {
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
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
}

.folder-matrix__primary-btn {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element, #0082c9);
	color: #ffffff;
}

.folder-matrix__danger-btn,
.folder-matrix-dialog__btn.is-danger {
	border-color: #c62828;
	background-color: #c62828;
	color: #ffffff;
}

.folder-matrix__pill-btn.is-active,
.folder-matrix__toggle-chip.is-active,
.folder-side-box__btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.folder-matrix__tool-btn:hover:not(:disabled),
.folder-matrix__pill-btn:hover:not(:disabled),
.folder-matrix__toggle-chip:hover:not(:disabled),
.folder-side-box__btn:hover:not(:disabled),
.folder-diff-row__btn:hover:not(:disabled),
.folder-matrix-dialog__btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.folder-matrix__tool-btn:focus-visible,
.folder-matrix__pill-btn:focus-visible,
.folder-matrix__toggle-chip:focus-visible,
.folder-matrix__primary-btn:focus-visible,
.folder-matrix__danger-btn:focus-visible,
.folder-side-box__btn:focus-visible,
.folder-diff-row__btn:focus-visible,
.folder-pair-card:focus-visible,
.folder-matrix__select:focus-visible,
.folder-matrix__search-input:focus-visible,
.folder-diff-entry__checkbox:focus-visible,
.folder-matrix-dialog__btn:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.folder-matrix__tool-btn:disabled,
.folder-matrix__pill-btn:disabled,
.folder-matrix__toggle-chip:disabled,
.folder-matrix__primary-btn:disabled,
.folder-matrix__danger-btn:disabled,
.folder-side-box__btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.folder-matrix__empty {
	padding-block: 24px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.folder-matrix__empty-title {
	margin-block: 0 6px;
	font-weight: 700;
}

.folder-matrix__empty-hint {
	margin-block: 0 14px;
	color: var(--color-text-maxcontrast);
	font-size: 0.9rem;
}

.folder-matrix__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-block-end: 12px;
}

.folder-matrix__control-row,
.folder-matrix__filter-bar {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.folder-matrix__control-label {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.folder-matrix__pills,
.folder-matrix__filter-toggles {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.folder-matrix__select-field {
	display: inline-flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.folder-matrix__select,
.folder-matrix__search-input {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
}

.folder-matrix__search-wrap {
	flex: 1 1 220px;
	min-inline-size: 0;
}

.folder-matrix__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.folder-matrix__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
}

.folder-matrix__kpi {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.folder-matrix__kpi-label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.folder-matrix__kpi-value {
	font-size: 1rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.folder-matrix__feedback {
	margin-block-end: 12px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border-inline-start: 3px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-background-hover);
	font-size: 0.88rem;
}

.folder-matrix__feedback.is-success {
	border-inline-start-color: #2e7d32;
}

.folder-matrix__feedback.is-error {
	border-inline-start-color: #c62828;
}

.folder-matrix__workbench {
	display: grid;
	grid-template-columns: minmax(280px, 350px) minmax(0, 1fr);
	gap: 12px;
	align-items: start;
	min-inline-size: 0;
}

.folder-matrix__pairs-rail {
	min-inline-size: 0;
	max-block-size: 560px;
	overflow-y: auto;
}

.folder-matrix__pair-list {
	list-style: none;
	margin-block: 0;
	margin-inline: 0;
	padding-block: 0;
	padding-inline: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.folder-pair-card {
	inline-size: 100%;
	text-align: start;
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	box-sizing: border-box;
	transition: border-color 0.15s ease, background-color 0.15s ease;
}

.folder-pair-card:hover {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.folder-pair-card.is-selected {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
}

.folder-pair-card__top,
.folder-pair-card__meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 6px;
}

.folder-pair-card__mirror-pill,
.folder-pair-card__protected-pill,
.folder-side-box__origin-tag,
.folder-diff-entry__status {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	background-color: var(--color-background-dark);
	color: var(--color-main-text);
}

.folder-pair-card__mirror-pill.is-exact_mirror,
.folder-pair-card__mirror-pill.is-subset_mirror {
	background-color: #e8f5e9;
	color: #1b5e20;
}

.folder-pair-card__protected-pill,
.folder-side-box__origin-tag,
.folder-diff-entry__status.is-protected_origin {
	background-color: #e3f2fd;
	color: #0d47a1;
}

.folder-diff-entry__status.is-kept_reference {
	background-color: #e8f5e9;
	color: #1b5e20;
}

.folder-diff-entry__status.is-marked_delete {
	background-color: #ffebee;
	color: #b71c1c;
}

.folder-pair-card__savings {
	font-size: 0.85rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.folder-pair-card__paths {
	display: flex;
	flex-direction: column;
	gap: 3px;
	min-inline-size: 0;
}

.folder-pair-card__path {
	font-size: 0.82rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.folder-pair-card__bar {
	inline-size: 100%;
	block-size: 6px;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.folder-pair-card__bar-fill {
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
}

.folder-pair-card__meta {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.folder-matrix__diff-pane {
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.folder-diff-header {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.folder-diff-header__sides {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.folder-side-box {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-inline-size: 0;
}

.folder-side-box.is-kept {
	border-inline-start: 3px solid #2e7d32;
}

.folder-side-box.is-cleaned {
	border-inline-start: 3px solid #c62828;
}

.folder-side-box__top,
.folder-side-box__actions,
.folder-diff-header__execution,
.folder-diff-header__cta-group,
.folder-diff-row__header,
.folder-diff-row__identity,
.folder-diff-row__actions {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 6px;
}

.folder-side-box__badge {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.folder-side-box__path {
	font-size: 0.86rem;
	overflow-wrap: anywhere;
}

.folder-diff-header__plan-summary {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
}

.folder-diff-rows {
	list-style: none;
	margin-block: 0;
	margin-inline: 0;
	padding-block: 0;
	padding-inline: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 420px;
	overflow-y: auto;
}

.folder-diff-row {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.folder-diff-row.is-current {
	border-color: var(--color-primary-element);
}

.folder-diff-row__header {
	margin-block-end: 8px;
}

.folder-diff-row__name {
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.folder-diff-row__size,
.folder-diff-row__outside {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.folder-diff-row__columns {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.folder-diff-cell {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.folder-diff-entry {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.folder-diff-entry__check {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	min-inline-size: 0;
}

.folder-diff-entry__checkbox {
	inline-size: 18px;
	block-size: 18px;
	flex-shrink: 0;
	margin-block: 0;
	margin-inline: 0;
}

.folder-diff-entry__path {
	font-size: 0.84rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.folder-diff-entry__meta {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.folder-diff-entry__mtime {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.folder-matrix-dialog {
	padding-block: 0;
	padding-inline: 0;
	border: none;
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	max-inline-size: min(460px, calc(100vw - 32px));
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.folder-matrix-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.folder-matrix-dialog__surface {
	padding-block: 18px;
	padding-inline: 20px;
}

.folder-matrix-dialog__title {
	margin-block: 0 8px;
	font-size: 1.05rem;
	font-weight: 700;
}

.folder-matrix-dialog__desc,
.folder-matrix-dialog__note {
	margin-block: 0 12px;
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.folder-matrix-dialog__stats {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
	margin-block: 0 14px;
}

.folder-matrix-dialog__stat {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.folder-matrix-dialog__stat dt {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.folder-matrix-dialog__stat dd {
	margin-inline-start: 0;
	font-size: 0.95rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.folder-matrix-dialog__actions {
	display: flex;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 960px) {
	.folder-matrix__workbench {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.folder-matrix {
		margin-inline: 8px;
		padding-inline: 12px;
	}

	.folder-matrix__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.folder-diff-header__sides,
	.folder-diff-row__columns,
	.folder-matrix-dialog__stats {
		grid-template-columns: minmax(0, 1fr);
	}

	.folder-matrix__tool-btn,
	.folder-matrix__pill-btn,
	.folder-matrix__toggle-chip,
	.folder-matrix__primary-btn,
	.folder-matrix__danger-btn,
	.folder-matrix__select,
	.folder-matrix__search-input,
	.folder-side-box__btn,
	.folder-diff-row__btn,
	.folder-matrix-dialog__btn {
		min-block-size: 44px;
		min-height: 44px;
	}
}
</style>
