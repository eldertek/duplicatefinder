<template>
	<section
		class="dev-tree-reclaimer-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Dev Workspace and Dependency Bloat Whole-Tree Reclaimer')">
		<header class="dtw__toolbar">
			<div class="dtw__title-group">
				<h3 class="dtw__title">
					{{ t('duplicatefinder', 'Dev Workspace & Dependency Bloat Whole-Tree Reclaimer') }}
				</h3>
				<span
					class="dtw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{purgeable} trees purgeable ({size}) / {guarded} files cherry-pick guarded / {gitCount} git GC', {
						purgeable: analysis.summary.purgeableTreesCount,
						size: analysis.summary.formattedReclaimableBytes,
						guarded: analysis.summary.cherryPickBlockedFilesCount,
						gitCount: analysis.summary.gitGcTreesCount,
					}) }}
				</span>
			</div>

			<div class="dtw__toolbar-actions">
				<button
					type="button"
					class="dtw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="dtw__tool-btn"
					:disabled="analysis.trees.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="dtw__tool-btn"
					@click="copyReclaimScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="dtw__tool-btn is-close"
					aria-keyshortcuts="^"
					:title="t('duplicatefinder', 'Hide dev workspace and dependency bloat whole-tree reclaimer')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Dev Trees') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="dtw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="dtw__empty-banner"
			role="note">
			<div class="dtw__empty-text">
				<p class="dtw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure dev-tree presets and .sync-exclude rules before scanning') }}
				</p>
				<p class="dtw__empty-hint">
					{{ t('duplicatefinder', 'Run a duplicate scan to roll up node_modules, vendor, .venv, target, and .git/objects bloat by workspace root without breaking source code.') }}
				</p>
			</div>
			<button
				type="button"
				class="dtw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="dtw__controls">
			<div class="dtw__control-row">
				<span class="dtw__control-label">{{ t('duplicatefinder', 'Reclaim Preset') }}</span>
				<div
					class="dtw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Dev tree reclaim presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="dtw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="dtw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="dtw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="dtw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="dtw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="dtw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="dtw__seg-btn"
					:class="{ 'is-active': includeBuildOutputs }"
					:aria-pressed="includeBuildOutputs ? 'true' : 'false'"
					@click="includeBuildOutputs = !includeBuildOutputs">
					<span>{{ includeBuildOutputs ? t('duplicatefinder', 'Build Outputs (dist/target/.next): INCLUDED') : t('duplicatefinder', 'Build Outputs (dist/target/.next): SHIELDED') }}</span>
				</button>
			</div>

			<div class="dtw__control-row dtw__inputs-row">
				<label class="dtw__field">
					<span class="dtw__field-label">{{ t('duplicatefinder', 'Min Stale Days') }}</span>
					<input
						v-model="minStaleDaysInput"
						type="number"
						min="0"
						max="3650"
						step="1"
						class="dtw__input dtw__num-input">
				</label>

				<label class="dtw__field dtw__field-grow">
					<span class="dtw__field-label">{{ t('duplicatefinder', 'Search Workspace / Package') }}</span>
					<input
						v-model="workspaceFilterInput"
						type="search"
						class="dtw__input"
						:placeholder="t('duplicatefinder', 'e.g. legacy-app, lodash, symfony, .venv')">
				</label>

				<label class="dtw__field dtw__field-grow">
					<span class="dtw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="dtw__input"
						:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')">
				</label>

				<label class="dtw__field">
					<span class="dtw__field-label">{{ t('duplicatefinder', 'Sort Trees') }}</span>
					<select
						v-model="sortMode"
						class="dtw__input">
						<option value="reclaim_desc">
							{{ t('duplicatefinder', 'Reclaimable bytes (high to low)') }}
						</option>
						<option value="files_desc">
							{{ t('duplicatefinder', 'Duplicate file hits (high to low)') }}
						</option>
						<option value="age_desc">
							{{ t('duplicatefinder', 'Stalest trees first') }}
						</option>
						<option value="name_asc">
							{{ t('duplicatefinder', 'Path (A to Z)') }}
						</option>
					</select>
				</label>
			</div>
		</div>

		<div class="dtw__kpis">
			<div class="dtw__kpi">
				<span class="dtw__kpi-label">{{ t('duplicatefinder', 'Purgeable Dev Trees') }}</span>
				<strong class="dtw__kpi-val is-accent">
					{{ analysis.summary.purgeableTreesCount }} / {{ analysis.summary.totalTreesCount }}
				</strong>
			</div>
			<div class="dtw__kpi">
				<span class="dtw__kpi-label">{{ t('duplicatefinder', 'Estimated Whole-Tree Reclaim') }}</span>
				<strong class="dtw__kpi-val">
					{{ analysis.summary.formattedReclaimableBytes }}
				</strong>
			</div>
			<div class="dtw__kpi">
				<span class="dtw__kpi-label">{{ t('duplicatefinder', 'Cherry-Pick Guarded Files') }}</span>
				<strong class="dtw__kpi-val">
					{{ analysis.summary.cherryPickBlockedFilesCount }}
				</strong>
			</div>
			<div class="dtw__kpi">
				<span class="dtw__kpi-label">{{ t('duplicatefinder', 'Primary / Shielded / Git GC') }}</span>
				<strong class="dtw__kpi-val">
					{{ analysis.summary.keepPrimaryTreesCount }} / {{ analysis.summary.protectedTreesCount }} / {{ analysis.summary.gitGcTreesCount }}
				</strong>
			</div>
		</div>

		<div
			v-if="analysis.summary.ecosystemBreakdown.length > 0"
			class="dtw__eco-strip"
			role="group"
			:aria-label="t('duplicatefinder', 'Filter by ecosystem')">
			<button
				type="button"
				class="dtw__eco-chip"
				:class="{ 'is-active': ecosystemFilter === 'all' }"
				:aria-pressed="ecosystemFilter === 'all' ? 'true' : 'false'"
				@click="ecosystemFilter = 'all'">
				<span>{{ t('duplicatefinder', 'All Ecosystems ({count})', { count: analysis.summary.totalTreesCount }) }}</span>
			</button>
			<button
				v-for="eco in analysis.summary.ecosystemBreakdown"
				:key="eco.ecosystemId"
				type="button"
				class="dtw__eco-chip"
				:class="{ 'is-active': ecosystemFilter === eco.ecosystemId }"
				:aria-pressed="ecosystemFilter === eco.ecosystemId ? 'true' : 'false'"
				@click="ecosystemFilter = eco.ecosystemId">
				<span>{{ eco.ecosystemLabel }} ({{ eco.treeCount }})</span>
			</button>
		</div>

		<div
			class="dtw__action-strip"
			role="group"
			:aria-label="t('duplicatefinder', 'Filter by recommended action')">
			<button
				v-for="opt in actionFilterOptions"
				:key="opt.id"
				type="button"
				class="dtw__seg-btn"
				:class="{ 'is-active': actionFilter === opt.id }"
				:aria-pressed="actionFilter === opt.id ? 'true' : 'false'"
				@click="actionFilter = opt.id">
				<span>{{ opt.label }}</span>
			</button>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.summary.totalTreesCount === 0"
			class="dtw__empty-banner"
			role="note">
			<div class="dtw__empty-text">
				<p class="dtw__empty-title">
					{{ t('duplicatefinder', 'No duplicated dependency or build artifact trees found in this view') }}
				</p>
				<p class="dtw__empty-hint">
					{{ t('duplicatefinder', 'None of the loaded duplicate paths sit inside node_modules, vendor, .venv, target, .git/objects, or build caches.') }}
				</p>
			</div>
		</div>

		<div
			v-else-if="analysis.trees.length > 0"
			class="dtw__workstation">
			<div class="dtw__list-pane">
				<div class="dtw__pane-header">
					<span class="dtw__pane-title">
						{{ t('duplicatefinder', 'Rolled-Up Workspace Trees ({count})', { count: analysis.trees.length }) }}
					</span>
				</div>

				<div class="dtw__tree-list">
					<button
						v-for="tree in visibleTrees"
						:key="tree.treeRootPath"
						type="button"
						class="dtw__tree-item"
						:class="{ 'is-selected': selectedTree && selectedTree.treeRootPath === tree.treeRootPath }"
						@click="selectedTreePath = tree.treeRootPath">
						<div class="dtw__tree-top">
							<span class="dtw__tree-name">{{ tree.workspaceName }}/{{ tree.markerSegment }}</span>
							<span
								class="dtw__action-pill"
								:class="actionBadgeClass(tree.recommendedAction)">
								{{ actionShortLabel(tree.recommendedAction) }}
							</span>
						</div>
						<div class="dtw__tree-path">
							{{ tree.displayTreePath }}
						</div>
						<div class="dtw__tree-meta">
							<span>{{ tree.ecosystemLabel }}</span>
							<span>{{ tree.duplicateFileCount }} {{ t('duplicatefinder', 'dup files') }}</span>
							<span>{{ tree.formattedBytes }}</span>
							<span v-if="tree.ageDays !== null">{{ tree.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="hasMoreTrees"
					class="dtw__load-more-wrap">
					<button
						type="button"
						class="dtw__tool-btn"
						@click="visibleLimit += 40">
						<span>{{ t('duplicatefinder', 'Show more trees ({remaining} remaining)', { remaining: analysis.trees.length - visibleTrees.length }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedTree"
				class="dtw__inspector-pane">
				<div class="dtw__inspector-header">
					<div class="dtw__inspector-title-wrap">
						<h4 class="dtw__inspector-title">
							{{ selectedTree.workspaceName }} / {{ selectedTree.markerSegment }}
						</h4>
						<span class="dtw__inspector-sub">{{ selectedTree.displayTreePath }}</span>
					</div>
					<div class="dtw__inspector-actions">
						<button
							v-if="selectedTree.primaryDuplicate"
							type="button"
							class="dtw__tool-btn"
							@click="$emit('select-duplicate', selectedTree.primaryDuplicate)">
							<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
						</button>
						<button
							v-if="selectedTree.primaryDuplicate"
							type="button"
							class="dtw__tool-btn"
							@click="$emit('compare-duplicate', selectedTree.primaryDuplicate)">
							<span>{{ t('duplicatefinder', 'Compare copies') }}</span>
						</button>
					</div>
				</div>

				<div
					class="dtw__guard-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'NO SINGLE-FILE CHERRY-PICK GUARD:') }}</strong>
					{{ t('duplicatefinder', 'Deleting individual duplicate files inside {marker} breaks dependency resolution. Reclaim the entire {tree} directory or shield it from sync.', {
						marker: selectedTree.markerSegment,
						tree: selectedTree.displayTreePath,
					}) }}
				</div>

				<div
					v-if="selectedTree.hasSourceOverlapInGroups"
					class="dtw__source-shield-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'SOURCE & MANIFEST SHIELD:') }}</strong>
					{{ t('duplicatefinder', 'One or more duplicate groups in this tree also match source files or manifests outside the artifact folder; non-artifact copies stay shielded.') }}
				</div>

				<div class="dtw__meta-grid">
					<div class="dtw__meta-item">
						<span class="dtw__meta-label">{{ t('duplicatefinder', 'Recommended Policy') }}</span>
						<span>{{ selectedTree.actionLabel }}</span>
					</div>
					<div class="dtw__meta-item">
						<span class="dtw__meta-label">{{ t('duplicatefinder', 'Observed Duplicate Payload') }}</span>
						<span>{{ selectedTree.formattedBytes }} ({{ selectedTree.duplicateFileCount }} {{ t('duplicatefinder', 'files') }})</span>
					</div>
					<div class="dtw__meta-item">
						<span class="dtw__meta-label">{{ t('duplicatefinder', 'Rehydrate Command') }}</span>
						<code class="dtw__mono-text">{{ selectedTree.rehydrateCommand }}</code>
					</div>
					<div class="dtw__meta-item">
						<span class="dtw__meta-label">{{ t('duplicatefinder', 'Nextcloud occ Scan Path') }}</span>
						<code class="dtw__mono-text">{{ selectedTree.occScanPath }}</code>
					</div>
				</div>

				<p class="dtw__safety-reason">
					{{ selectedTree.safetyReason }}
				</p>

				<div
					v-if="!selectedTree.isImmutableGitObject"
					class="dtw__override-bar">
					<span class="dtw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
					<button
						type="button"
						class="dtw__seg-btn"
						:class="{ 'is-active': selectedTree.override === 'approved-purge' }"
						@click="setTreeOverride(selectedTree.treeRootPath, 'approved-purge')">
						<span>{{ t('duplicatefinder', 'Approve Whole-Tree Purge') }}</span>
					</button>
					<button
						type="button"
						class="dtw__seg-btn"
						:class="{ 'is-active': selectedTree.override === 'shielded' }"
						@click="setTreeOverride(selectedTree.treeRootPath, 'shielded')">
						<span>{{ t('duplicatefinder', 'Shield Workspace') }}</span>
					</button>
					<button
						v-if="selectedTree.override"
						type="button"
						class="dtw__seg-btn"
						@click="setTreeOverride(selectedTree.treeRootPath, null)">
						<span>{{ t('duplicatefinder', 'Reset Auto') }}</span>
					</button>
				</div>

				<div
					v-if="selectedTree.topPackages.length > 0"
					class="dtw__panel-box">
					<div class="dtw__panel-heading">
						{{ t('duplicatefinder', 'Top Duplicated Packages in Tree ({count} unique)', { count: selectedTree.uniquePackageCount }) }}
					</div>
					<div class="dtw__pkg-grid">
						<div
							v-for="pkg in selectedTree.topPackages"
							:key="pkg.name"
							class="dtw__pkg-chip">
							<span class="dtw__pkg-name">{{ pkg.name }}</span>
							<span class="dtw__pkg-meta">{{ pkg.files }} {{ t('duplicatefinder', 'files') }} / {{ formatSize(pkg.bytes) }}</span>
						</div>
					</div>
				</div>

				<div
					v-if="selectedTree.sampleFiles.length > 0"
					class="dtw__panel-box">
					<div class="dtw__panel-heading">
						{{ t('duplicatefinder', 'Sample Nested Duplicate Hits') }}
					</div>
					<div class="dtw__sample-list">
						<div
							v-for="sample in selectedTree.sampleFiles"
							:key="sample.key || sample.path"
							class="dtw__sample-item">
							<code class="dtw__mono-text">{{ sample.relativeInsideTree || sample.displayPath }}</code>
							<span class="dtw__sample-meta">{{ formatSize(sample.size) }}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div
			v-else-if="analysis.summary.totalTreesCount > 0"
			class="dtw__empty-banner"
			role="note">
			<div class="dtw__empty-text">
				<p class="dtw__empty-title">
					{{ t('duplicatefinder', 'No dev trees match your current filter criteria') }}
				</p>
				<p class="dtw__empty-hint">
					{{ t('duplicatefinder', 'Clear the search box or switch Ecosystem / Action filters to inspect detected workspace trees.') }}
				</p>
			</div>
			<button
				type="button"
				class="dtw__tool-btn"
				@click="resetViewFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<details class="dtw__script-box">
			<summary class="dtw__script-summary">
				{{ t('duplicatefinder', 'DRY_RUN=1 Whole-Tree Reclaim & occ files:scan Script Preview') }}
			</summary>
			<div class="dtw__script-content">
				<div class="dtw__script-actions">
					<button
						type="button"
						class="dtw__tool-btn"
						@click="copyReclaimScript">
						<span>{{ t('duplicatefinder', 'Copy Bash Script') }}</span>
					</button>
				</div>
				<pre class="dtw__code-pre">{{ generatedReclaimScript }}</pre>
			</div>
		</details>

		<details class="dtw__script-box">
			<summary class="dtw__script-summary">
				{{ t('duplicatefinder', 'Nextcloud Desktop .sync-exclude.lst / .ncignore Rules') }}
			</summary>
			<div class="dtw__script-content">
				<div class="dtw__script-actions">
					<button
						type="button"
						class="dtw__tool-btn"
						@click="copySyncExcludeRules">
						<span>{{ t('duplicatefinder', 'Copy Exclude Patterns') }}</span>
					</button>
				</div>
				<pre class="dtw__code-pre">{{ generatedSyncExcludeRules }}</pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	DEV_TREE_PRESETS,
	analyzeDevTreeDuplicates,
	buildDevTreeCsvReport,
	buildDevTreeJsonReport,
	buildDevTreeReclaimScript,
	buildNextcloudSyncExcludeRules,
	getDevTreePreset,
} from '../tools/devTreeReclaimer'

export default {
	name: 'DevTreeReclaimerWorkbench',
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
			type: [String, Number],
			default: null,
		},
	},
	data() {
		const initialPreset = getDevTreePreset('safe-whole-tree')
		return {
			presets: DEV_TREE_PRESETS,
			presetId: initialPreset.id,
			scope: 'all',
			includeBuildOutputs: initialPreset.includeBuildOutputs,
			minStaleDaysInput: String(initialPreset.minStaleDays),
			workspaceFilterInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			ecosystemFilter: 'all',
			actionFilter: 'all',
			sortMode: 'reclaim_desc',
			approvedTreeOverrides: {},
			selectedTreePath: '',
			visibleLimit: 40,
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeSourceDuplicates() {
			if (this.scope === 'filtered' && this.filteredSourceCount > 0) {
				return this.duplicates
			}
			if (this.allSourceCount > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedMinStaleDays() {
			const trimmed = String(this.minStaleDaysInput === undefined || this.minStaleDaysInput === null ? '' : this.minStaleDaysInput).trim()
			if (!trimmed) {
				return getDevTreePreset(this.presetId).minStaleDays
			}
			const parsed = Number(trimmed)
			if (!Number.isFinite(parsed)) {
				return getDevTreePreset(this.presetId).minStaleDays
			}
			return Math.min(3650, Math.max(0, parsed))
		},
		analysis() {
			return analyzeDevTreeDuplicates(this.activeSourceDuplicates, {
				presetId: this.presetId,
				minStaleDays: this.parsedMinStaleDays,
				includeBuildOutputs: this.includeBuildOutputs,
				workspaceFilter: this.workspaceFilterInput,
				ecosystemFilter: this.ecosystemFilter,
				actionFilter: this.actionFilter,
				sortMode: this.sortMode,
				approvedTreeOverrides: this.approvedTreeOverrides,
			})
		},
		visibleTrees() {
			return this.analysis.trees.slice(0, this.visibleLimit)
		},
		hasMoreTrees() {
			return this.analysis.trees.length > this.visibleTrees.length
		},
		selectedTree() {
			const trees = this.analysis.trees
			if (!Array.isArray(trees) || trees.length === 0) {
				return null
			}
			if (this.selectedTreePath) {
				const found = trees.find(tree => tree.treeRootPath === this.selectedTreePath)
				if (found) {
					return found
				}
			}
			return trees[0]
		},
		actionFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Actions') },
				{ id: 'purge-tree', label: this.t('duplicatefinder', 'Purge Whole Tree') },
				{ id: 'git-gc-only', label: this.t('duplicatefinder', 'Git GC Only') },
				{ id: 'keep-primary', label: this.t('duplicatefinder', 'Keep Primary') },
				{ id: 'protected-shield', label: this.t('duplicatefinder', 'Shielded') },
			]
		},
		generatedReclaimScript() {
			return buildDevTreeReclaimScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExcludeRules() {
			return buildNextcloudSyncExcludeRules(this.analysis)
		},
	},
	watch: {
		'analysis.trees'(trees) {
			if (!Array.isArray(trees) || trees.length === 0) {
				return
			}
			if (!this.selectedTreePath || !trees.some(item => item.treeRootPath === this.selectedTreePath)) {
				this.selectedTreePath = trees[0].treeRootPath
			}
		},
	},
	methods: {
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		applyPreset(id) {
			const preset = getDevTreePreset(id)
			this.presetId = preset.id
			this.minStaleDaysInput = String(preset.minStaleDays)
			this.includeBuildOutputs = preset.includeBuildOutputs
			this.setNotice(this.t('duplicatefinder', 'Applied preset: {name}', { name: preset.name }), 'success')
		},
		setTreeOverride(treePath, mode) {
			const nextOverrides = { ...this.approvedTreeOverrides }
			if (!mode) {
				delete nextOverrides[treePath]
			} else {
				nextOverrides[treePath] = mode
			}
			this.approvedTreeOverrides = nextOverrides
		},
		resetViewFilters() {
			this.workspaceFilterInput = ''
			this.ecosystemFilter = 'all'
			this.actionFilter = 'all'
		},
		actionShortLabel(action) {
			if (action === 'purge-tree') {
				return this.t('duplicatefinder', 'PURGE TREE')
			}
			if (action === 'git-gc-only') {
				return this.t('duplicatefinder', 'GIT GC ONLY')
			}
			if (action === 'protected-shield') {
				return this.t('duplicatefinder', 'SHIELDED')
			}
			return this.t('duplicatefinder', 'KEEP PRIMARY')
		},
		actionBadgeClass(action) {
			if (action === 'purge-tree') {
				return 'is-purge'
			}
			if (action === 'git-gc-only') {
				return 'is-warn'
			}
			if (action === 'protected-shield') {
				return 'is-shield'
			}
			return 'is-keep'
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		async copyReclaimScript() {
			const ok = await copyTextSafely(this.generatedReclaimScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 whole-tree reclaim + occ script to clipboard.'), 'success')
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the script preview below to copy manually.'), 'error')
			}
		},
		async copySyncExcludeRules() {
			const ok = await copyTextSafely(this.generatedSyncExcludeRules)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied Nextcloud .sync-exclude.lst rules to clipboard.'), 'success')
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the rules preview below to copy manually.'), 'error')
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
			document.body.appendChild(anchor)
			anchor.click()
			anchor.remove()
			URL.revokeObjectURL(objectUrl)
			return true
		},
		exportAuditCsv() {
			const csv = buildDevTreeCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-dev-trees.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe CSV audit of rolled-up dev trees.'), 'success')
			}
		},
		exportAuditJson() {
			const json = buildDevTreeJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-dev-trees.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported JSON audit of rolled-up dev trees.'), 'success')
			}
		},
	},
}
</script>

<style scoped>
.dev-tree-reclaimer-workbench {
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
	min-inline-size: 0;
	max-inline-size: 100%;
}

.dtw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.dtw__title-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dtw__title {
	margin: 0;
	font-size: 1.08rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.dtw__status-badge {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dtw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dtw__tool-btn,
.dtw__primary-btn,
.dtw__seg-btn,
.dtw__eco-chip {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.dtw__tool-btn:hover:not(:disabled),
.dtw__seg-btn:hover:not(:disabled),
.dtw__eco-chip:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.dtw__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.dtw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: #ffffff;
}

.dtw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.dtw__seg-btn.is-active,
.dtw__eco-chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.dtw__tool-btn:focus-visible,
.dtw__primary-btn:focus-visible,
.dtw__seg-btn:focus-visible,
.dtw__eco-chip:focus-visible,
.dtw__tree-item:focus-visible,
.dtw__input:focus-visible,
.dtw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.dtw__notice {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.85rem;
	font-weight: 600;
}

.dtw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border: 1px solid #9dd6b4;
}

.dtw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border: 1px solid #f1aeb5;
}

.dtw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.dtw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-inline-size: 68ch;
}

.dtw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.dtw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.dtw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.dtw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dtw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dtw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.dtw__inputs-row {
	align-items: flex-end;
}

.dtw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.dtw__field-grow {
	flex: 1 1 200px;
}

.dtw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.dtw__input {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.dtw__num-input {
	inline-size: 110px;
}

.dtw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.dtw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.dtw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.dtw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dtw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.dtw__kpi-val {
	font-size: 1.05rem;
	font-weight: 700;
}

.dtw__kpi-val.is-accent {
	color: var(--color-primary-element-text, #006aa3);
}

.dtw__eco-strip,
.dtw__action-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.dtw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.dtw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		align-items: start;
	}
}

.dtw__list-pane,
.dtw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dtw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dtw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.dtw__tree-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.dtw__tree-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.dtw__tree-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.dtw__tree-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.dtw__tree-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.dtw__tree-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dtw__tree-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dtw__action-pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.dtw__action-pill.is-purge {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.dtw__action-pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.dtw__action-pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.dtw__action-pill.is-shield {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.dtw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.dtw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.dtw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dtw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.dtw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dtw__guard-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dtw__source-shield-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.dtw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.dtw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.dtw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.dtw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.dtw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.dtw__safety-reason {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.dtw__override-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.dtw__panel-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.dtw__panel-heading {
	font-size: 0.85rem;
	font-weight: 700;
}

.dtw__pkg-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 6px;
}

@media (min-width: 560px) {
	.dtw__pkg-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.dtw__pkg-chip {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.dtw__pkg-name {
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.dtw__pkg-meta {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.dtw__sample-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.dtw__sample-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.dtw__sample-meta {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.dtw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.dtw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.dtw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.dtw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.dtw__code-pre {
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

.dtw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
