<template>
	<section
		class="filename-collision-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Filename Normalization & Locale/Unicode Collision Inspector')">
		<header class="collision-wb__toolbar">
			<div class="collision-wb__title-group">
				<h3 class="collision-wb__title">
					{{ t('duplicatefinder', 'Filename Normalization & Unicode Collision Inspector') }}
				</h3>
				<span
					class="collision-wb__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{flagged} flagged in {clusters} clusters ({reclaimable} safe to prune)', {
						flagged: catalog.summary.flaggedFiles,
						clusters: catalog.summary.clusterCount,
						reclaimable: catalog.summary.pruneCandidateBytesFormatted,
					}) }}
				</span>
			</div>

			<div class="collision-wb__toolbar-actions">
				<button
					type="button"
					class="collision-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="collision-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="collision-wb__tool-btn is-close"
					aria-keyshortcuts="="
					:title="t('duplicatefinder', 'Hide filename normalization and Unicode collision inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide collisions') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="collision-wb__empty">
			<p class="collision-wb__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="collision-wb__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect Unicode NFC/NFD normalization mismatches, case-fold clashes, invisible/BiDi characters, Windows portability hazards, and copy suffixes.') }}
			</p>
			<button
				type="button"
				class="collision-wb__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="collision-wb__controls">
				<div class="collision-wb__control-row">
					<span class="collision-wb__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="collision-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Collision inspection scope')">
						<button
							type="button"
							class="collision-wb__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="collision-wb__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="collision-wb__control-label">
						{{ t('duplicatefinder', 'Normalization') }}
					</span>
					<div
						class="collision-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filename canonicalization mode')">
						<button
							type="button"
							class="collision-wb__seg-btn"
							:class="{ 'is-active': normalizationMode === 'strict' }"
							:aria-pressed="normalizationMode === 'strict' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="normalizationMode = 'strict'">
							<span>{{ t('duplicatefinder', 'Strict (NFC/NFKC + Case)') }}</span>
						</button>
						<button
							type="button"
							class="collision-wb__seg-btn"
							:class="{ 'is-active': normalizationMode === 'aggressive' }"
							:aria-pressed="normalizationMode === 'aggressive' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="normalizationMode = 'aggressive'">
							<span>{{ t('duplicatefinder', 'Aggressive (Fold + Copy)') }}</span>
						</button>
					</div>

					<label class="collision-wb__field">
						<span class="collision-wb__control-label">{{ t('duplicatefinder', 'Sort by') }}</span>
						<select
							v-model="sortBy"
							class="collision-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort filename collision findings')">
							<option value="severity_desc">{{ t('duplicatefinder', 'Collision severity (highest first)') }}</option>
							<option value="size_desc">{{ t('duplicatefinder', 'Size (largest first)') }}</option>
							<option value="divergence_desc">{{ t('duplicatefinder', 'Unicode divergence (most marks)') }}</option>
							<option value="folder_risk_desc">{{ t('duplicatefinder', 'Same-folder peer risk') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="collision-wb__field is-grow">
						<span class="collision-wb__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="collision-wb__search-input"
							:placeholder="t('duplicatefinder', 'Search filename, U+200B, folder, or canonical key...')"
							:aria-label="t('duplicatefinder', 'Search filename collision findings')"
							:disabled="isDeleting">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="collision-wb__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>

				<div class="collision-wb__kpis">
					<div class="collision-wb__kpi">
						<span class="collision-wb__kpi-label">{{ t('duplicatefinder', 'Same-folder clashes') }}</span>
						<strong class="collision-wb__kpi-value">
							{{ catalog.summary.sameFolderCollisionCount }}
						</strong>
					</div>
					<div class="collision-wb__kpi">
						<span class="collision-wb__kpi-label">{{ t('duplicatefinder', 'Unicode & invisible chars') }}</span>
						<strong class="collision-wb__kpi-value">
							{{ catalog.summary.unicodeDivergenceCount }} / {{ catalog.summary.invisibleCharCount }}
						</strong>
					</div>
					<div class="collision-wb__kpi">
						<span class="collision-wb__kpi-label">{{ t('duplicatefinder', 'Case & cross-OS hazards') }}</span>
						<strong class="collision-wb__kpi-value">
							{{ catalog.summary.caseClashCount }} / {{ catalog.summary.crossOsHazardCount }}
						</strong>
					</div>
					<div class="collision-wb__kpi">
						<span class="collision-wb__kpi-label">{{ t('duplicatefinder', 'Safe prune candidates') }}</span>
						<strong class="collision-wb__kpi-value">
							{{ catalog.summary.pruneCandidateCount }} ({{ catalog.summary.pruneCandidateBytesFormatted }})
						</strong>
					</div>
				</div>

				<div class="collision-wb__analytics-grid">
					<div class="collision-wb__panel-card">
						<div class="collision-wb__panel-head">
							<h4 class="collision-wb__sub-title">
								{{ t('duplicatefinder', 'Collision Categories (Click to filter)') }}
							</h4>
							<button
								v-if="categoryFilter !== 'all'"
								type="button"
								class="collision-wb__mini-btn"
								@click="categoryFilter = 'all'">
								<span>{{ t('duplicatefinder', 'All categories') }}</span>
							</button>
						</div>
						<div
							class="collision-wb__category-bars"
							role="group"
							:aria-label="t('duplicatefinder', 'Collision category breakdown')">
							<button
								v-for="cat in catalog.categoryBreakdown"
								:key="cat.id"
								type="button"
								class="collision-wb__cat-btn"
								:class="{ 'is-active': categoryFilter === cat.id }"
								:aria-pressed="categoryFilter === cat.id ? 'true' : 'false'"
								:disabled="cat.count === 0 && categoryFilter !== cat.id"
								@click="toggleCategoryFilter(cat.id)">
								<span class="collision-wb__cat-head">
									<span>{{ formatCategoryLabel(cat.id) }}</span>
									<span>{{ cat.count }} ({{ cat.bytesFormatted }})</span>
								</span>
								<span class="collision-wb__cat-track" aria-hidden="true">
									<span
										class="collision-wb__cat-fill"
										:style="{ inlineSize: `${Math.max(cat.count > 0 ? 6 : 0, cat.sharePct)}%` }" />
								</span>
							</button>
						</div>
					</div>

					<div class="collision-wb__panel-card">
						<div class="collision-wb__panel-head">
							<h4 class="collision-wb__sub-title">
								{{ t('duplicatefinder', 'Hotspot Folders (Click to filter)') }}
							</h4>
							<button
								v-if="folderFilter"
								type="button"
								class="collision-wb__mini-btn"
								@click="folderFilter = ''">
								<span>{{ t('duplicatefinder', 'All folders') }}</span>
							</button>
						</div>
						<div v-if="catalog.folderLeaderboard.length === 0" class="collision-wb__panel-empty">
							{{ t('duplicatefinder', 'No filename normalization issues detected in current scope.') }}
						</div>
						<ul v-else class="collision-wb__folder-list">
							<li
								v-for="entry in catalog.folderLeaderboard"
								:key="entry.folder"
								class="collision-wb__folder-item">
								<button
									type="button"
									class="collision-wb__folder-btn"
									:class="{ 'is-active': folderFilter === entry.folder }"
									:aria-pressed="folderFilter === entry.folder ? 'true' : 'false'"
									@click="toggleFolderFilter(entry.folder)">
									<span class="collision-wb__folder-path">{{ entry.folder }}</span>
									<span class="collision-wb__folder-meta">
										{{ t('duplicatefinder', '{issues} issues · {clashes} folder clashes · {reclaim} safe prune', {
											issues: entry.issueCount,
											clashes: entry.sameFolderRisks,
											reclaim: entry.pruneBytesFormatted,
										}) }}
									</span>
								</button>
							</li>
						</ul>
					</div>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="collision-wb__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div v-if="catalog.items.length === 0" class="collision-wb__empty-filtered">
				<p v-if="catalog.summary.flaggedFiles === 0">
					{{ t('duplicatefinder', 'All {count} scanned filenames in this scope are clean NFC/ASCII with zero Unicode or cross-OS collisions.', {
						count: catalog.summary.totalFiles,
					}) }}
				</p>
				<p v-else>
					{{ t('duplicatefinder', 'No filename collision findings match the active filters.') }}
				</p>
				<button
					v-if="hasActiveFilters"
					type="button"
					class="collision-wb__mini-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Clear filters') }}</span>
				</button>
			</div>

			<div v-else class="collision-wb__split">
				<div
					class="collision-wb__list"
					role="list"
					:aria-label="t('duplicatefinder', 'Flagged filename collision items')">
					<div
						v-for="item in catalog.items"
						:key="item.key"
						class="collision-wb__item"
						:class="{
							'is-selected-row': activeItem && activeItem.key === item.key,
							'is-checked': selectedDeleteKeys.includes(item.key),
						}"
						role="listitem">
						<label class="collision-wb__check-label">
							<input
								type="checkbox"
								class="collision-wb__checkbox"
								:checked="selectedDeleteKeys.includes(item.key)"
								:disabled="!item.deletable || isDeleting"
								:aria-label="t('duplicatefinder', 'Select {name} for safe pruning', { name: item.name })"
								@change="toggleFileSelection(item.key)">
						</label>

						<button
							type="button"
							class="collision-wb__item-main"
							:aria-current="activeItem && activeItem.key === item.key ? 'true' : 'false'"
							@click="selectItem(item)">
							<span class="collision-wb__item-top">
								<span class="collision-wb__item-name">{{ item.name }}</span>
								<span class="collision-wb__item-size">{{ item.sizeFormatted }}</span>
							</span>
							<span class="collision-wb__item-path">{{ item.path }}</span>
							<span class="collision-wb__item-badges">
								<span
									class="collision-wb__badge"
									:class="`is-severity-${item.severity}`">
									{{ formatSeverityLabel(item.severity) }}
								</span>
								<span class="collision-wb__badge is-unicode">
									{{ item.unicodeForm.toUpperCase() }}
								</span>
								<span
									v-if="item.hasSameFolderCollision"
									class="collision-wb__badge is-clash">
									{{ t('duplicatefinder', 'Same-folder clash') }}
								</span>
								<span
									v-if="item.invisibleChars.length > 0"
									class="collision-wb__badge is-invisible">
									{{ t('duplicatefinder', '{count} invisible/BiDi', { count: item.invisibleChars.length }) }}
								</span>
								<span
									v-if="item.crossOs.hasHazard"
									class="collision-wb__badge is-hazard">
									{{ t('duplicatefinder', 'Cross-OS hazard') }}
								</span>
								<span
									v-if="item.copySuffix.hasCopySuffix"
									class="collision-wb__badge is-neutral">
									{{ t('duplicatefinder', 'Copy suffix') }}
								</span>
								<span
									class="collision-wb__badge"
									:class="verdictBadgeClass(item)">
									{{ formatVerdictLabel(item.verdict) }}
								</span>
							</span>
						</button>
					</div>
				</div>

				<aside
					v-if="activeItem"
					class="collision-wb__detail"
					:aria-label="t('duplicatefinder', 'Selected filename normalization telemetry')">
					<div class="collision-wb__detail-head">
						<div>
							<h4 class="collision-wb__detail-title">
								{{ activeItem.name }}
							</h4>
							<p class="collision-wb__detail-path">
								{{ activeItem.path }}
							</p>
						</div>
						<div class="collision-wb__detail-actions">
							<button
								type="button"
								class="collision-wb__mini-btn"
								@click="focusInMainView(activeItem)">
								<span>{{ t('duplicatefinder', 'Locate group') }}</span>
							</button>
							<button
								type="button"
								class="collision-wb__mini-btn"
								@click="openSideBySideCompare(activeItem)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>

					<p class="collision-wb__verdict-box">
						{{ activeItem.verdictReason }}
					</p>

					<div class="collision-wb__rename-card">
						<div class="collision-wb__rename-head">
							<h5 class="collision-wb__sub-title">
								{{ t('duplicatefinder', 'Canonical Rename Suggestion') }}
							</h5>
							<button
								type="button"
								class="collision-wb__mini-btn"
								@click="copySuggestedName(activeItem)">
								<span>{{ t('duplicatefinder', 'Copy canonical name') }}</span>
							</button>
						</div>
						<div class="collision-wb__diff-pair">
							<div class="collision-wb__diff-row">
								<span class="collision-wb__diff-tag">{{ t('duplicatefinder', 'Raw') }}</span>
								<code class="collision-wb__code">{{ activeItem.name }}</code>
							</div>
							<div class="collision-wb__diff-row">
								<span class="collision-wb__diff-tag is-clean">{{ t('duplicatefinder', 'NFC Safe') }}</span>
								<code class="collision-wb__code">{{ activeItem.suggestedName }}</code>
							</div>
							<div class="collision-wb__diff-row">
								<span class="collision-wb__diff-tag">{{ t('duplicatefinder', 'Key') }}</span>
								<code class="collision-wb__code">{{ activeItem.canonicalKey }}</code>
							</div>
						</div>
						<ul v-if="activeItem.renameReasons.length > 0" class="collision-wb__reason-list">
							<li v-for="(reason, idx) in activeItem.renameReasons" :key="idx">
								{{ reason }}
							</li>
						</ul>
					</div>

					<div class="collision-wb__telemetry-grid">
						<div class="collision-wb__metric-card">
							<span class="collision-wb__metric-label">{{ t('duplicatefinder', 'Unicode form') }}</span>
							<strong class="collision-wb__metric-value">{{ activeItem.unicodeForm.toUpperCase() }}</strong>
							<span class="collision-wb__metric-sub">
								{{ t('duplicatefinder', '{nonAscii} non-ASCII, {marks} combining marks', {
									nonAscii: activeItem.codepointInfo.nonAsciiCount,
									marks: activeItem.codepointInfo.combiningCount,
								}) }}
							</span>
						</div>
						<div class="collision-wb__metric-card">
							<span class="collision-wb__metric-label">{{ t('duplicatefinder', 'Severity & size') }}</span>
							<strong class="collision-wb__metric-value">{{ formatSeverityLabel(activeItem.severity) }} ({{ activeItem.severityScore }}/100)</strong>
							<span class="collision-wb__metric-sub">
								{{ activeItem.sizeFormatted }} · {{ activeItem.mtimeFormatted || t('duplicatefinder', 'Unknown mtime') }}
							</span>
						</div>
					</div>

					<div
						v-if="activeItem.codepointInfo.tokens.length > 0"
						class="collision-wb__sub-card">
						<h5 class="collision-wb__sub-title">
							{{ t('duplicatefinder', 'Notable Unicode & Invisible Codepoints') }}
						</h5>
						<div class="collision-wb__token-grid">
							<span
								v-for="(token, idx) in activeItem.codepointInfo.tokens"
								:key="`${token.codePointHex}-${idx}`"
								class="collision-wb__token-pill"
								:class="`is-kind-${token.kind}`">
								<code>{{ token.codePointHex }}</code>
								<span>{{ token.displayChar }}</span>
								<span class="collision-wb__token-name">{{ token.label }}</span>
							</span>
						</div>
					</div>

					<div
						v-if="activeItem.crossOs.hazards.length > 0"
						class="collision-wb__sub-card">
						<h5 class="collision-wb__sub-title">
							{{ t('duplicatefinder', 'Cross-OS & Nextcloud Sync Hazards') }}
						</h5>
						<ul class="collision-wb__hazard-list">
							<li
								v-for="hazard in activeItem.crossOs.hazards"
								:key="hazard.id">
								<strong>{{ formatSeverityLabel(hazard.severity) }}:</strong> {{ hazard.label }}
							</li>
						</ul>
					</div>

					<div class="collision-wb__sub-card">
						<h5 class="collision-wb__sub-title">
							{{ t('duplicatefinder', 'Colliding Peers ({count})', { count: activeItem.peers.length }) }}
						</h5>
						<div v-if="activeItem.peers.length === 0" class="collision-wb__panel-empty">
							{{ t('duplicatefinder', 'Isolated filename defect (no colliding sibling in current scope).') }}
						</div>
						<ul v-else class="collision-wb__peers-list">
							<li
								v-for="peer in activeItem.peers"
								:key="peer.key"
								class="collision-wb__peer-row">
								<span class="collision-wb__peer-name">{{ peer.name }}</span>
								<span class="collision-wb__peer-meta">
									<span class="collision-wb__badge is-unicode">{{ peer.unicodeForm.toUpperCase() }}</span>
									<span v-if="peer.sameFolder" class="collision-wb__badge is-clash">
										{{ t('duplicatefinder', 'Same folder') }}
									</span>
									<span v-if="peer.isCanonicalKeeper" class="collision-wb__badge is-safe">
										{{ t('duplicatefinder', 'Canonical keeper') }}
									</span>
									<span v-if="peer.isProtected" class="collision-wb__badge is-protected">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
									<span>{{ peer.folder }}</span>
								</span>
							</li>
						</ul>
					</div>
				</aside>
			</div>

			<footer class="collision-wb__bulk-bar">
				<div class="collision-wb__bulk-summary">
					<span>
						{{ t('duplicatefinder', '{count} selected ({size})', {
							count: selectedDeleteItems.length,
							size: selectedDeleteSizeFormatted,
						}) }}
					</span>
				</div>

				<div class="collision-wb__bulk-actions">
					<button
						type="button"
						class="collision-wb__tool-btn"
						:disabled="isDeleting || catalog.summary.pruneCandidateCount === 0"
						@click="selectSafeNonCanonical">
						<span>{{ t('duplicatefinder', 'Select safe non-canonical') }}</span>
					</button>
					<button
						type="button"
						class="collision-wb__tool-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="clearSelection">
						<span>{{ t('duplicatefinder', 'Clear selection') }}</span>
					</button>
					<button
						type="button"
						class="collision-wb__danger-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="openDeleteDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Pruning...')
							: t('duplicatefinder', 'Prune selected') }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="collisionDeleteDialog"
			class="collision-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm non-canonical duplicate pruning')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="collision-confirm-dialog__content">
				<h4 class="collision-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Non-Canonical Duplicate Pruning') }}
				</h4>
				<p class="collision-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to delete {count} non-canonical duplicate copies ({size}) while preserving each group canonical keeper.', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}
				</p>
				<div class="collision-confirm-dialog__actions">
					<button
						type="button"
						class="collision-wb__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="collision-wb__danger-btn"
						:disabled="isDeleting"
						@click="confirmBatchDelete">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Pruning...')
							: t('duplicatefinder', 'Confirm prune') }}</span>
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
	buildFilenameCollisionCatalog,
	exportFilenameCollisionCsv,
	exportFilenameCollisionManifestJson,
	loadFilenameCollisionPreferences,
	saveFilenameCollisionPreferences,
	selectSafeNonCanonicalKeys,
} from '../tools/filenameCollisionInspector'

export default {
	name: 'FilenameCollisionWorkbench',
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
		const prefs = loadFilenameCollisionPreferences()
		return {
			scope: 'filtered',
			normalizationMode: prefs.mode || 'strict',
			categoryFilter: 'all',
			folderFilter: '',
			sortBy: 'severity_desc',
			searchQuery: '',
			selectedItemKey: '',
			selectedDeleteKeys: [],
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeDuplicates() {
			return this.scope === 'all' ? this.allDuplicates : this.duplicates
		},
		hasActiveFilters() {
			return this.categoryFilter !== 'all'
				|| this.folderFilter !== ''
				|| this.sortBy !== 'severity_desc'
				|| this.searchQuery.trim() !== ''
		},
		catalog() {
			return buildFilenameCollisionCatalog(this.activeDuplicates, {
				mode: this.normalizationMode,
				category: this.categoryFilter,
				folderFilter: this.folderFilter,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		itemByKeyMap() {
			const map = new Map()
			for (const item of this.catalog.allItems) {
				map.set(item.key, item)
			}
			return map
		},
		activeItem() {
			if (this.catalog.items.length === 0) {
				return null
			}
			const found = this.catalog.items.find(item => item.key === this.selectedItemKey)
			return found || this.catalog.items[0]
		},
		selectedDeleteItems() {
			const out = []
			for (const key of this.selectedDeleteKeys) {
				const item = this.itemByKeyMap.get(key)
				if (item && item.deletable) {
					out.push(item)
				}
			}
			return out
		},
		selectedDeleteSizeFormatted() {
			const bytes = this.selectedDeleteItems.reduce((sum, item) => sum + item.size, 0)
			return formatBytes(bytes)
		},
	},
	watch: {
		catalog: {
			immediate: true,
			handler(nextCatalog) {
				if (!nextCatalog || !Array.isArray(nextCatalog.items) || nextCatalog.items.length === 0) {
					this.selectedItemKey = ''
					return
				}
				const exists = nextCatalog.items.some(item => item.key === this.selectedItemKey)
				if (!exists) {
					this.selectedItemKey = nextCatalog.items[0].key
				}
			},
		},
		normalizationMode(nextMode) {
			saveFilenameCollisionPreferences({ mode: nextMode })
		},
	},
	methods: {
		t(app, text, vars) {
			if (typeof window !== 'undefined' && typeof window.t === 'function') {
				return window.t(app, text, vars)
			}
			if (!vars || typeof vars !== 'object') {
				return text
			}
			return text.replace(/\{(\w+)\}/g, (match, key) => (
				Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
			))
		},
		toggleCategoryFilter(catId) {
			this.categoryFilter = this.categoryFilter === catId ? 'all' : catId
		},
		toggleFolderFilter(folderPath) {
			this.folderFilter = this.folderFilter === folderPath ? '' : folderPath
		},
		formatCategoryLabel(catId) {
			const labels = {
				'same-folder-collision': this.t('duplicatefinder', 'Same-folder collisions'),
				'invisible-chars': this.t('duplicatefinder', 'Invisible / BiDi chars'),
				'unicode-form': this.t('duplicatefinder', 'Unicode NFC/NFD/NFKC'),
				'case-clash': this.t('duplicatefinder', 'Case-fold clashes'),
				'cross-os-hazard': this.t('duplicatefinder', 'Cross-OS / Windows hazards'),
				'copy-suffix': this.t('duplicatefinder', 'Copy-suffix clutter'),
			}
			return labels[catId] || catId
		},
		formatSeverityLabel(severity) {
			const labels = {
				critical: this.t('duplicatefinder', 'Critical'),
				warning: this.t('duplicatefinder', 'Warning'),
				caution: this.t('duplicatefinder', 'Caution'),
				info: this.t('duplicatefinder', 'Info'),
			}
			return labels[severity] || severity
		},
		formatVerdictLabel(verdict) {
			const labels = {
				'prune-non-canonical': this.t('duplicatefinder', 'Safe prune'),
				'rename-recommended': this.t('duplicatefinder', 'Rename recommended'),
				'protected-keep': this.t('duplicatefinder', 'Protected'),
				'keep-canonical': this.t('duplicatefinder', 'Canonical keeper'),
			}
			return labels[verdict] || verdict
		},
		verdictBadgeClass(item) {
			if (item.pruneRecommended) {
				return 'is-prune'
			}
			if (item.isInOriginFolder || item.isLocked) {
				return 'is-protected'
			}
			if (item.verdict === 'keep-canonical') {
				return 'is-safe'
			}
			return 'is-neutral'
		},
		resetFilters() {
			this.categoryFilter = 'all'
			this.folderFilter = ''
			this.sortBy = 'severity_desc'
			this.searchQuery = ''
		},
		selectItem(item) {
			if (item && item.key) {
				this.selectedItemKey = item.key
			}
		},
		toggleFileSelection(fileKey) {
			if (!this.itemByKeyMap.has(fileKey)) {
				return
			}
			if (this.selectedDeleteKeys.includes(fileKey)) {
				this.selectedDeleteKeys = this.selectedDeleteKeys.filter(k => k !== fileKey)
			} else {
				this.selectedDeleteKeys = [...this.selectedDeleteKeys, fileKey]
			}
		},
		selectSafeNonCanonical() {
			const keys = selectSafeNonCanonicalKeys(this.catalog)
			this.selectedDeleteKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} safe non-canonical duplicate copies.', {
				count: keys.length,
			})
		},
		clearSelection() {
			this.selectedDeleteKeys = []
		},
		async copySuggestedName(item) {
			if (!item || !item.suggestedName) {
				return
			}
			try {
				if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
					await navigator.clipboard.writeText(item.suggestedName)
				}
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Copied canonical filename "{name}" to clipboard.', {
					name: item.suggestedName,
				})
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Clipboard unavailable; copy canonical name manually.')
			}
		},
		focusInMainView(item) {
			if (!item) {
				return
			}
			const match = this.activeDuplicates.find(group => group && (group.id === item.groupId || group.hash === item.groupHash))
			if (match) {
				this.$emit('select-duplicate', match)
			}
		},
		openSideBySideCompare(item) {
			if (!item) {
				return
			}
			const match = this.activeDuplicates.find(group => group && (group.id === item.groupId || group.hash === item.groupHash))
			if (match) {
				this.$emit('compare-duplicate', match)
			}
		},
		openDeleteDialog() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.collisionDeleteDialog
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
		},
		closeDeleteDialog() {
			const dialog = this.$refs.collisionDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function') {
					if (dialog.open) {
						dialog.close()
					}
				} else {
					dialog.removeAttribute('open')
				}
			}
			this.restoreFocusAfterDialog()
		},
		onDeleteDialogClose() {
			this.restoreFocusAfterDialog()
		},
		onDeleteDialogBackdropClick(event) {
			if (event && event.target === this.$refs.collisionDeleteDialog && !this.isDeleting) {
				this.closeDeleteDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function') {
				prev.focus()
			}
		},
		async confirmBatchDelete() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const filesPayload = this.selectedDeleteItems.map(item => {
					const raw = item.rawFile || {}
					return {
						id: raw.id ?? item.fileId,
						nodeId: raw.nodeId || raw.id || item.nodeId,
						path: raw.path || item.path,
						name: item.name,
						size: item.size,
						fileHash: item.groupHash || raw.fileHash || '',
					}
				})
				const result = await deleteFiles(filesPayload)
				const deletedSuccess = Array.isArray(result?.success) ? result.success : filesPayload
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds)
					? result.deletedNodeIds
					: deletedSuccess.map(f => f.nodeId || f.id).filter(Boolean)
				const bytesReclaimed = deletedSuccess.reduce((sum, f) => sum + (Number(f.size) || 0), 0)

				this.selectedDeleteKeys = []
				this.closeDeleteDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Pruned {count} non-canonical duplicate copies ({size} reclaimed).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('collision-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: 1,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeDeleteDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not prune selected non-canonical duplicates.')
			} finally {
				this.isDeleting = false
			}
		},
		triggerDownload(filename, content, mimeType) {
			if (typeof document === 'undefined' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
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
			setTimeout(() => {
				URL.revokeObjectURL(href)
			}, 1000)
		},
		exportManifestJson() {
			const json = exportFilenameCollisionManifestJson(this.catalog)
			this.triggerDownload('duplicatefinder-filename-collisions.json', json, 'application/json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported filename collision JSON manifest.')
		},
		exportAuditCsv() {
			const csv = exportFilenameCollisionCsv(this.catalog)
			this.triggerDownload('duplicatefinder-filename-collisions.csv', csv, 'text/csv;charset=utf-8')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported filename collision CSV audit.')
		},
	},
}
</script>

<style scoped>
.filename-collision-workbench {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
	margin-block-end: 16px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	max-inline-size: 100%;
	box-sizing: border-box;
	overflow-x: hidden;
}

.collision-wb__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.collision-wb__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.collision-wb__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.collision-wb__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
	font-size: 0.82rem;
	font-weight: 600;
}

.collision-wb__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.collision-wb__tool-btn,
.collision-wb__seg-btn,
.collision-wb__mini-btn,
.collision-wb__primary-btn,
.collision-wb__danger-btn {
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
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
}

.collision-wb__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.collision-wb__danger-btn {
	background-color: var(--color-error, #d32f2f);
	border-color: var(--color-error, #d32f2f);
	color: #ffffff;
}

.collision-wb__tool-btn:disabled,
.collision-wb__seg-btn:disabled,
.collision-wb__mini-btn:disabled,
.collision-wb__danger-btn:disabled,
.collision-wb__cat-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.collision-wb__tool-btn:focus-visible,
.collision-wb__seg-btn:focus-visible,
.collision-wb__mini-btn:focus-visible,
.collision-wb__primary-btn:focus-visible,
.collision-wb__danger-btn:focus-visible,
.collision-wb__select:focus-visible,
.collision-wb__search-input:focus-visible,
.collision-wb__cat-btn:focus-visible,
.collision-wb__folder-btn:focus-visible,
.collision-wb__item-main:focus-visible,
.collision-wb__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.collision-wb__empty,
.collision-wb__empty-filtered {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	border: 1px dashed var(--color-border);
}

.collision-wb__empty-title {
	margin: 0;
	font-weight: 700;
}

.collision-wb__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.9rem;
}

.collision-wb__controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.collision-wb__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.collision-wb__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.collision-wb__segments {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 4px;
}

.collision-wb__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.collision-wb__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.collision-wb__field.is-grow {
	flex: 1 1 220px;
}

.collision-wb__select,
.collision-wb__search-input {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	min-inline-size: 0;
	box-sizing: border-box;
}

.collision-wb__search-input {
	flex: 1 1 auto;
	inline-size: 100%;
}

.collision-wb__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.collision-wb__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.collision-wb__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.collision-wb__kpi-value {
	font-size: 0.95rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.collision-wb__analytics-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 12px;
}

.collision-wb__panel-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.collision-wb__panel-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.collision-wb__sub-title {
	margin: 0;
	font-size: 0.85rem;
	font-weight: 700;
}

.collision-wb__category-bars {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.collision-wb__cat-btn {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: transparent;
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
}

.collision-wb__cat-btn.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.collision-wb__cat-head {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
	font-weight: 600;
}

.collision-wb__cat-track {
	display: block;
	block-size: 6px;
	inline-size: 100%;
	border-radius: 999px;
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.collision-wb__cat-fill {
	display: block;
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
}

.collision-wb__folder-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.collision-wb__folder-btn {
	display: flex;
	flex-direction: column;
	gap: 2px;
	inline-size: 100%;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: transparent;
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
}

.collision-wb__folder-btn.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.collision-wb__folder-path {
	font-size: 0.82rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.collision-wb__folder-meta,
.collision-wb__panel-empty {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.collision-wb__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.85rem;
	font-weight: 600;
}

.collision-wb__notice.is-error {
	border-color: var(--color-error, #d32f2f);
	color: var(--color-error, #d32f2f);
}

.collision-wb__split {
	display: grid;
	grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
	gap: 12px;
	align-items: start;
}

.collision-wb__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 480px;
	overflow-y: auto;
	padding-inline-end: 2px;
}

.collision-wb__item {
	display: flex;
	align-items: stretch;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.collision-wb__item.is-selected-row {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.08));
}

.collision-wb__check-label {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 28px;
}

.collision-wb__checkbox {
	inline-size: 18px;
	block-size: 18px;
	cursor: pointer;
}

.collision-wb__item-main {
	flex: 1 1 auto;
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0;
	border: none;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.collision-wb__item-top {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	align-items: baseline;
}

.collision-wb__item-name {
	font-weight: 700;
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.collision-wb__item-size {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	flex-shrink: 0;
}

.collision-wb__item-path {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.collision-wb__item-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.collision-wb__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.collision-wb__badge.is-severity-critical,
.collision-wb__badge.is-clash,
.collision-wb__badge.is-invisible {
	border-color: #d32f2f;
	color: #b71c1c;
	background-color: rgba(211, 47, 47, 0.1);
}

.collision-wb__badge.is-severity-warning,
.collision-wb__badge.is-hazard,
.collision-wb__badge.is-prune {
	border-color: #b45309;
	color: #92400e;
	background-color: rgba(245, 158, 11, 0.14);
}

.collision-wb__badge.is-unicode {
	border-color: #0284c7;
	color: #0369a1;
	background-color: rgba(2, 132, 199, 0.1);
}

.collision-wb__badge.is-safe,
.collision-wb__badge.is-protected {
	border-color: #15803d;
	color: #166534;
	background-color: rgba(22, 163, 74, 0.12);
}

.collision-wb__detail {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.collision-wb__detail-head {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
}

.collision-wb__detail-title {
	margin: 0;
	font-size: 0.95rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.collision-wb__detail-path {
	margin: 2px 0 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.collision-wb__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.collision-wb__verdict-box {
	margin: 0;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	font-size: 0.84rem;
}

.collision-wb__rename-card,
.collision-wb__sub-card,
.collision-wb__metric-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.collision-wb__rename-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.collision-wb__diff-pair {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.collision-wb__diff-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.collision-wb__diff-tag {
	display: inline-flex;
	min-inline-size: 64px;
	font-size: 0.74rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.collision-wb__diff-tag.is-clean {
	color: #166534;
}

.collision-wb__code {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.collision-wb__reason-list,
.collision-wb__hazard-list {
	margin: 0;
	padding-inline-start: 18px;
	font-size: 0.8rem;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.collision-wb__telemetry-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.collision-wb__metric-label {
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.collision-wb__metric-value {
	font-size: 0.88rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.collision-wb__metric-sub {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.collision-wb__token-grid {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.collision-wb__token-pill {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.75rem;
}

.collision-wb__token-pill.is-kind-invisible,
.collision-wb__token-pill.is-kind-bidi,
.collision-wb__token-pill.is-kind-control {
	border-color: #d32f2f;
}

.collision-wb__token-name {
	color: var(--color-text-maxcontrast);
}

.collision-wb__peers-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.collision-wb__peer-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.8rem;
}

.collision-wb__peer-name {
	font-weight: 600;
	overflow-wrap: anywhere;
}

.collision-wb__peer-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.collision-wb__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.collision-wb__bulk-summary {
	font-size: 0.88rem;
	font-weight: 600;
}

.collision-wb__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.collision-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.collision-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.collision-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.collision-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.collision-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.collision-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.collision-wb__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.collision-wb__analytics-grid,
	.collision-wb__split,
	.collision-wb__telemetry-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.filename-collision-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.collision-wb__tool-btn,
	.collision-wb__seg-btn,
	.collision-wb__mini-btn,
	.collision-wb__primary-btn,
	.collision-wb__danger-btn,
	.collision-wb__select,
	.collision-wb__search-input,
	.collision-wb__check-label,
	.collision-wb__cat-btn,
	.collision-wb__folder-btn {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.collision-wb__field {
		flex: 1 1 100%;
	}

	.collision-wb__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.collision-wb__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
