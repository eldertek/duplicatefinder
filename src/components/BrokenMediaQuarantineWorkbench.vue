<template>
	<section
		class="broken-quarantine-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Broken, Zero-Byte, Truncated Media & Corrupted Header Quarantine Workbench')">
		<header class="quarantine-wb__toolbar">
			<div class="quarantine-wb__title-group">
				<h3 class="quarantine-wb__title">
					{{ t('duplicatefinder', 'Broken Media & Corrupted Header Quarantine') }}
				</h3>
				<span
					class="quarantine-wb__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{damaged} damaged / {quarantined} quarantined ({size})', {
						damaged: catalog.summary.damagedCount,
						quarantined: catalog.summary.quarantinedCount,
						size: catalog.summary.safeReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="quarantine-wb__toolbar-actions">
				<button
					type="button"
					class="quarantine-wb__tool-btn"
					:disabled="catalog.allItems.length === 0 || batchProbing || isDeleting"
					@click="probeVisibleItems">
					<span>{{ batchProbing
						? t('duplicatefinder', 'Probing headers...')
						: t('duplicatefinder', 'Probe headers & tails') }}</span>
				</button>
				<button
					type="button"
					class="quarantine-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="quarantine-wb__tool-btn"
					:disabled="catalog.items.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="quarantine-wb__tool-btn is-close"
					aria-keyshortcuts="8"
					:title="t('duplicatefinder', 'Hide broken media quarantine workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide quarantine') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="quarantine-wb__empty">
			<p class="quarantine-wb__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="quarantine-wb__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect zero-byte files, truncated JPEG/PNG/PDF/ZIP/MP4 tails, HTML error masquerades, and corrupted binary headers.') }}
			</p>
			<button
				type="button"
				class="quarantine-wb__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="quarantine-wb__controls">
				<div class="quarantine-wb__control-row">
					<span class="quarantine-wb__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="quarantine-wb__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Quarantine inspection scope')">
						<button
							type="button"
							class="quarantine-wb__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="quarantine-wb__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="quarantine-wb__field">
						<span class="quarantine-wb__control-label">{{ t('duplicatefinder', 'Sort by') }}</span>
						<select
							v-model="sortBy"
							class="quarantine-wb__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort quarantine findings')">
							<option value="severity_desc">{{ t('duplicatefinder', 'Severity (critical first)') }}</option>
							<option value="size_desc">{{ t('duplicatefinder', 'Size (largest first)') }}</option>
							<option value="integrity_asc">{{ t('duplicatefinder', 'Integrity score (lowest first)') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Filename (A to Z)') }}</option>
						</select>
					</label>

					<label class="quarantine-wb__field is-grow">
						<span class="quarantine-wb__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="quarantine-wb__search-input"
							:placeholder="t('duplicatefinder', 'Search filename, path, or signature...')"
							:aria-label="t('duplicatefinder', 'Search quarantine findings')"
							:disabled="isDeleting">
					</label>

					<button
						v-if="hasActiveFilters"
						type="button"
						class="quarantine-wb__mini-btn"
						:disabled="isDeleting"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>

				<div class="quarantine-wb__kpis">
					<div class="quarantine-wb__kpi">
						<span class="quarantine-wb__kpi-label">{{ t('duplicatefinder', 'Zero-byte & stubs') }}</span>
						<strong class="quarantine-wb__kpi-value">{{ catalog.summary.zeroByteCount }}</strong>
					</div>
					<div class="quarantine-wb__kpi">
						<span class="quarantine-wb__kpi-label">{{ t('duplicatefinder', 'Corrupted headers') }}</span>
						<strong class="quarantine-wb__kpi-value">{{ catalog.summary.corruptedHeaderCount }}</strong>
					</div>
					<div class="quarantine-wb__kpi">
						<span class="quarantine-wb__kpi-label">{{ t('duplicatefinder', 'Truncated tails') }}</span>
						<strong class="quarantine-wb__kpi-value">{{ catalog.summary.truncatedTailCount }}</strong>
					</div>
					<div class="quarantine-wb__kpi">
						<span class="quarantine-wb__kpi-label">{{ t('duplicatefinder', 'Quarantine vault') }}</span>
						<strong class="quarantine-wb__kpi-value">
							{{ catalog.summary.quarantinedCount }} ({{ catalog.summary.quarantinedBytesFormatted }})
						</strong>
					</div>
				</div>

				<div
					class="quarantine-wb__filter-pills"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter by structural integrity verdict')">
					<button
						v-for="pill in filterOptions"
						:key="pill.id"
						type="button"
						class="quarantine-wb__pill-btn"
						:class="{ 'is-active': filterMode === pill.id }"
						:aria-pressed="filterMode === pill.id ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="filterMode = pill.id">
						<span>{{ pill.label }}</span>
					</button>
				</div>
			</div>

			<p
				v-if="statusNotice"
				class="quarantine-wb__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</p>

			<div v-if="catalog.items.length === 0" class="quarantine-wb__filtered-empty">
				<p>{{ t('duplicatefinder', 'No files match the active quarantine filter.') }}</p>
				<button
					type="button"
					class="quarantine-wb__mini-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div v-else class="quarantine-wb__split">
				<div
					class="quarantine-wb__roster"
					role="list"
					:aria-label="t('duplicatefinder', 'Integrity findings and quarantined files')">
					<article
						v-for="item in catalog.items"
						:key="item.key"
						role="listitem"
						class="quarantine-wb__item-card"
						:class="{
							'is-active': activeItem && activeItem.key === item.key,
							'is-selected': selectedDeleteKeys.includes(item.key),
							'is-quarantined': item.isQuarantined,
						}">
						<div class="quarantine-wb__item-top">
							<label class="quarantine-wb__check-label">
								<input
									type="checkbox"
									class="quarantine-wb__checkbox"
									:checked="selectedDeleteKeys.includes(item.key)"
									:disabled="!item.deletable || isDeleting"
									:aria-label="t('duplicatefinder', 'Select {name} for deletion', { name: item.name })"
									@change="toggleFileSelection(item.key)">
							</label>

							<button
								type="button"
								class="quarantine-wb__item-select-btn"
								:aria-pressed="activeItem && activeItem.key === item.key ? 'true' : 'false'"
								@click="selectItem(item)">
								<span class="quarantine-wb__item-head">
									<strong class="quarantine-wb__item-name">{{ item.name }}</strong>
									<span class="quarantine-wb__item-size">{{ item.sizeFormatted }}</span>
								</span>
								<span class="quarantine-wb__item-path">{{ item.path || item.folder }}</span>
								<span class="quarantine-wb__item-badges">
									<span
										class="quarantine-wb__badge"
										:class="'is-sev-' + item.integrity.severity">
										{{ formatVerdictLabel(item.integrity.verdict) }}
									</span>
									<span v-if="item.isQuarantined" class="quarantine-wb__badge is-vault">
										{{ t('duplicatefinder', 'Quarantined') }}
									</span>
									<span
										v-if="item.isProtected"
										class="quarantine-wb__badge is-protected">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
									<span
										v-else-if="item.hasIntactSurvivor"
										class="quarantine-wb__badge is-safe">
										{{ t('duplicatefinder', 'Intact copy exists') }}
									</span>
									<span
										v-else
										class="quarantine-wb__badge is-last-copy">
										{{ t('duplicatefinder', 'No healthy sibling') }}
									</span>
								</span>
							</button>
						</div>

						<div class="quarantine-wb__item-actions">
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								:disabled="probingKey === item.key || isDeleting"
								@click="probeSingleItem(item)">
								<span>{{ probingKey === item.key ? t('duplicatefinder', 'Probing...') : t('duplicatefinder', 'Probe') }}</span>
							</button>
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								:disabled="isDeleting"
								@click="toggleQuarantine(item)">
								<span>{{ item.isQuarantined
									? t('duplicatefinder', 'Release')
									: t('duplicatefinder', 'Quarantine') }}</span>
							</button>
						</div>
					</article>
				</div>

				<div v-if="activeItem" class="quarantine-wb__inspector">
					<header class="quarantine-wb__inspector-header">
						<div class="quarantine-wb__inspector-title-wrap">
							<h4 class="quarantine-wb__inspector-title">
								{{ activeItem.name }}
							</h4>
							<p class="quarantine-wb__inspector-sub">
								{{ activeItem.path || activeItem.folder }}
							</p>
						</div>
						<div class="quarantine-wb__inspector-actions">
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								:disabled="probingKey === activeItem.key || isDeleting"
								@click="probeSingleItem(activeItem)">
								<span>{{ probingKey === activeItem.key
									? t('duplicatefinder', 'Probing...')
									: t('duplicatefinder', 'Probe header & tail') }}</span>
							</button>
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								:disabled="isDeleting"
								@click="toggleQuarantine(activeItem)">
								<span>{{ activeItem.isQuarantined
									? t('duplicatefinder', 'Release from vault')
									: t('duplicatefinder', 'Stage to Quarantine Vault') }}</span>
							</button>
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								@click="focusInMainView(activeItem)">
								<span>{{ t('duplicatefinder', 'Focus in list') }}</span>
							</button>
							<button
								type="button"
								class="quarantine-wb__mini-btn"
								@click="openSideBySideCompare(activeItem)">
								<span>{{ t('duplicatefinder', 'Side-by-side compare') }}</span>
							</button>
						</div>
					</header>

					<div class="quarantine-wb__telemetry-grid">
						<div class="quarantine-wb__metric-box">
							<span class="quarantine-wb__metric-label">{{ t('duplicatefinder', 'Verdict') }}</span>
							<strong class="quarantine-wb__metric-value">{{ formatVerdictLabel(activeItem.integrity.verdict) }}</strong>
							<span class="quarantine-wb__metric-sub">{{ activeItem.integrity.detail }}</span>
						</div>
						<div class="quarantine-wb__metric-box">
							<span class="quarantine-wb__metric-label">{{ t('duplicatefinder', 'Observed vs Expected') }}</span>
							<strong class="quarantine-wb__metric-value">{{ activeItem.integrity.detectedSignature }}</strong>
							<span class="quarantine-wb__metric-sub">
								{{ t('duplicatefinder', 'Expected: {expected}', { expected: activeItem.integrity.expectedSignature }) }}
							</span>
						</div>
						<div class="quarantine-wb__metric-box">
							<span class="quarantine-wb__metric-label">{{ t('duplicatefinder', 'Integrity Score') }}</span>
							<strong class="quarantine-wb__metric-value">
								{{ activeItem.integrity.integrityScore === null ? '--' : activeItem.integrity.integrityScore + '%' }}
							</strong>
							<div
								class="quarantine-wb__meter-track"
								role="progressbar"
								:aria-valuenow="activeItem.integrity.integrityScore === null ? 0 : activeItem.integrity.integrityScore"
								aria-valuemin="0"
								aria-valuemax="100">
								<div
									class="quarantine-wb__meter-fill"
									:class="'is-sev-' + activeItem.integrity.severity"
									:style="{ width: (activeItem.integrity.integrityScore === null ? 0 : activeItem.integrity.integrityScore) + '%' }" />
							</div>
						</div>
					</div>

					<div class="quarantine-wb__hex-grid">
						<div class="quarantine-wb__hex-card">
							<h5 class="quarantine-wb__sub-title">
								{{ t('duplicatefinder', 'Header Hex / ASCII (First 48 bytes)') }}
							</h5>
							<pre class="quarantine-wb__hex-pre">{{ activeItem.integrity.headerHexPreview }}</pre>
						</div>
						<div class="quarantine-wb__hex-card">
							<h5 class="quarantine-wb__sub-title">
								{{ t('duplicatefinder', 'Tail / EOF Hex / ASCII (Last 32 bytes)') }}
							</h5>
							<pre class="quarantine-wb__hex-pre">{{ activeItem.integrity.tailHexPreview }}</pre>
						</div>
					</div>

					<div class="quarantine-wb__siblings-card">
						<h5 class="quarantine-wb__sub-title">
							{{ t('duplicatefinder', 'Recovery Guard & Group Siblings ({count})', { count: activeItem.siblings.length }) }}
						</h5>
						<ul class="quarantine-wb__siblings-list">
							<li
								v-for="sib in activeItem.siblings"
								:key="sib.key"
								class="quarantine-wb__sibling-row"
								:class="{ 'is-current': sib.isCurrent }">
								<span class="quarantine-wb__sibling-name">{{ sib.path || sib.name }}</span>
								<span class="quarantine-wb__sibling-meta">
									<span>{{ sib.sizeFormatted }}</span>
									<span
										class="quarantine-wb__badge"
										:class="sib.isDamaged ? 'is-sev-high' : 'is-safe'">
										{{ sib.isDamaged ? formatVerdictLabel(sib.verdict) : t('duplicatefinder', 'Healthy copy') }}
									</span>
									<span v-if="sib.isProtected" class="quarantine-wb__badge is-protected">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
								</span>
							</li>
						</ul>
					</div>
				</div>
			</div>

			<footer class="quarantine-wb__bulk-bar">
				<div class="quarantine-wb__bulk-summary">
					<strong>{{ t('duplicatefinder', '{count} files selected ({size})', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}</strong>
					<label class="quarantine-wb__guard-toggle">
						<input
							v-model="allowLastCopyDamaged"
							type="checkbox"
							class="quarantine-wb__checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Allow last-copy deletion for confirmed damaged / 0-byte files') }}</span>
					</label>
				</div>
				<div class="quarantine-wb__bulk-actions">
					<button
						type="button"
						class="quarantine-wb__tool-btn"
						:disabled="isDeleting"
						@click="selectSafeDamaged">
						<span>{{ t('duplicatefinder', 'Select safe damaged') }}</span>
					</button>
					<button
						type="button"
						class="quarantine-wb__tool-btn"
						:disabled="isDeleting || catalog.summary.damagedCount === 0"
						@click="stageAllDamagedToVault">
						<span>{{ t('duplicatefinder', 'Stage damaged to vault') }}</span>
					</button>
					<button
						type="button"
						class="quarantine-wb__tool-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="clearSelection">
						<span>{{ t('duplicatefinder', 'Clear selection') }}</span>
					</button>
					<button
						type="button"
						class="quarantine-wb__danger-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="openDeleteDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Delete selected') }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="quarantineDeleteDialog"
			class="quarantine-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm broken media deletion')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="quarantine-confirm-dialog__content">
				<h4 class="quarantine-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Broken / Corrupted File Deletion') }}
				</h4>
				<p class="quarantine-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to delete {count} files ({size}) from Nextcloud storage.', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}
				</p>
				<p v-if="selectedNoSurvivorCount > 0" class="quarantine-confirm-dialog__warning">
					{{ t('duplicatefinder', 'Warning: {count} selected files have no healthy sibling copy in their duplicate group.', {
						count: selectedNoSurvivorCount,
					}) }}
				</p>
				<div class="quarantine-confirm-dialog__actions">
					<button
						type="button"
						class="quarantine-wb__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="quarantine-wb__danger-btn"
						:disabled="isDeleting"
						@click="confirmBatchDelete">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Confirm delete') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import {
	buildQuarantineCatalog,
	exportQuarantineCsv,
	exportQuarantineManifestJson,
	inspectFileStructuralIntegrity,
	loadQuarantineVault,
	MAX_HEADER_PROBE_BYTES,
	MAX_TAIL_PROBE_BYTES,
	resolveQuarantineFileKey,
	saveQuarantineVault,
	selectSafeDamagedKeys,
} from '../tools/brokenMediaQuarantine'
import { formatBytes } from '../tools/duplicateStats'
import { sanitizeContentUrl } from '../tools/mediaContentInspector'
import { normalizeItemPath } from '../tools/utils'

export default {
	name: 'BrokenMediaQuarantineWorkbench',
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
		return {
			scope: 'filtered',
			filterMode: 'all',
			sortBy: 'severity_desc',
			searchQuery: '',
			selectedItemKey: '',
			probeByKey: {},
			quarantineVault: loadQuarantineVault(),
			selectedDeleteKeys: [],
			allowLastCopyDamaged: false,
			probingKey: '',
			batchProbing: false,
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
			return this.filterMode !== 'all'
				|| this.sortBy !== 'severity_desc'
				|| this.searchQuery.trim() !== ''
		},
		catalog() {
			return buildQuarantineCatalog(this.activeDuplicates, {
				probeByKey: this.probeByKey,
				quarantineVault: this.quarantineVault,
				filter: this.filterMode,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		filterOptions() {
			const s = this.catalog.summary
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: s.totalInspected }) },
				{ id: 'damaged', label: this.t('duplicatefinder', 'All damaged ({count})', { count: s.damagedCount }) },
				{ id: 'zero-byte', label: this.t('duplicatefinder', 'Zero-byte ({count})', { count: s.zeroByteCount }) },
				{ id: 'corrupted-header', label: this.t('duplicatefinder', 'Corrupted header ({count})', { count: s.corruptedHeaderCount }) },
				{ id: 'truncated-tail', label: this.t('duplicatefinder', 'Truncated tail ({count})', { count: s.truncatedTailCount }) },
				{ id: 'incomplete-transfer', label: this.t('duplicatefinder', 'Incomplete ({count})', { count: s.incompleteCount }) },
				{ id: 'quarantined', label: this.t('duplicatefinder', 'Quarantined ({count})', { count: s.quarantinedCount }) },
				{ id: 'healthy', label: this.t('duplicatefinder', 'Healthy ({count})', { count: s.healthyCount }) },
			]
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
		selectedNoSurvivorCount() {
			return this.selectedDeleteItems.filter(item => !item.hasIntactSurvivor).length
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
		formatVerdictLabel(verdict) {
			const labels = {
				'zero-byte': this.t('duplicatefinder', 'Zero-byte / stub'),
				'corrupted-header': this.t('duplicatefinder', 'Corrupted header'),
				'html-masquerade': this.t('duplicatefinder', 'HTML/text masquerade'),
				'dead-fill': this.t('duplicatefinder', 'Dead-fill block'),
				'truncated-tail': this.t('duplicatefinder', 'Truncated tail'),
				'incomplete-transfer': this.t('duplicatefinder', 'Incomplete transfer'),
				'healthy-verified': this.t('duplicatefinder', 'Healthy verified'),
				unprobed: this.t('duplicatefinder', 'Awaiting probe'),
			}
			return labels[verdict] || verdict
		},
		resetFilters() {
			this.filterMode = 'all'
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
		selectSafeDamaged() {
			const keys = selectSafeDamagedKeys(this.catalog, {
				includeDamagedOnly: this.allowLastCopyDamaged,
			})
			this.selectedDeleteKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} damaged files for cleanup.', {
				count: keys.length,
			})
		},
		clearSelection() {
			this.selectedDeleteKeys = []
		},
		toggleQuarantine(item) {
			if (!item || !item.key) {
				return
			}
			const next = { ...this.quarantineVault }
			if (next[item.key]) {
				delete next[item.key]
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Released {name} from quarantine vault.', {
					name: item.name,
				})
			} else {
				next[item.key] = {
					quarantinedAt: new Date().toISOString(),
					reason: item.integrity.detectedSignature || item.integrity.verdict,
				}
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Staged {name} in quarantine vault.', {
					name: item.name,
				})
			}
			this.quarantineVault = next
			saveQuarantineVault(next)
		},
		stageAllDamagedToVault() {
			const next = { ...this.quarantineVault }
			let added = 0
			const now = new Date().toISOString()
			for (const item of this.catalog.allItems) {
				if (item.isDamaged && !next[item.key]) {
					next[item.key] = {
						quarantinedAt: now,
						reason: item.integrity.detectedSignature || item.integrity.verdict,
					}
					added += 1
				}
			}
			this.quarantineVault = next
			saveQuarantineVault(next)
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Staged {count} damaged files into quarantine vault.', {
				count: added,
			})
		},
		resolveFileFetchUrl(file) {
			if (!file || typeof file !== 'object') {
				return ''
			}
			if (typeof file.downloadUrl === 'string') {
				const safe = sanitizeContentUrl(file.downloadUrl)
				if (safe) {
					return safe
				}
			}
			const relPath = typeof file.path === 'string' ? normalizeItemPath(file.path) : ''
			const uid = typeof window !== 'undefined' && window.OC && typeof window.OC.getCurrentUser === 'function'
				? window.OC.getCurrentUser()?.uid
				: ''
			if (relPath && uid && typeof window !== 'undefined' && window.OC && typeof window.OC.linkToRemoteBase === 'function') {
				const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/')
				return sanitizeContentUrl(window.OC.linkToRemoteBase(`dav/files/${encodeURIComponent(uid)}${encoded}`))
			}
			return ''
		},
		async probeSingleItem(item) {
			if (!item || !item.file) {
				return null
			}
			const key = String(resolveQuarantineFileKey(item.file) ?? item.key)
			if (item.size === 0) {
				const zeroReport = inspectFileStructuralIntegrity(new Uint8Array(0), new Uint8Array(0), item.file)
				this.$set(this.probeByKey, key, zeroReport)
				return zeroReport
			}
			const url = this.resolveFileFetchUrl(item.file)
			if (!url || typeof fetch !== 'function') {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Binary probe URL unavailable for {name}.', {
					name: item.name,
				})
				return null
			}
			this.probingKey = key
			try {
				const headResp = await fetch(url, {
					method: 'GET',
					credentials: 'same-origin',
					headers: {
						Range: `bytes=0-${MAX_HEADER_PROBE_BYTES - 1}`,
					},
				})
				if (!headResp.ok) {
					throw new Error(`HTTP ${headResp.status}`)
				}
				const headBytes = new Uint8Array(await headResp.arrayBuffer())
				let tailBytes = new Uint8Array(0)
				if (item.size > MAX_HEADER_PROBE_BYTES) {
					const tailStart = Math.max(0, item.size - MAX_TAIL_PROBE_BYTES)
					try {
						const tailResp = await fetch(url, {
							method: 'GET',
							credentials: 'same-origin',
							headers: {
								Range: `bytes=${tailStart}-${item.size - 1}`,
							},
						})
						if (tailResp.ok) {
							tailBytes = new Uint8Array(await tailResp.arrayBuffer())
						}
					} catch (tailError) {
						tailBytes = new Uint8Array(0)
					}
				} else {
					tailBytes = headBytes
				}

				const report = inspectFileStructuralIntegrity(headBytes, tailBytes, item.file)
				this.$set(this.probeByKey, key, report)
				return report
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not probe binary header & tail for {name}.', {
					name: item.name,
				})
				return null
			} finally {
				if (this.probingKey === key) {
					this.probingKey = ''
				}
			}
		},
		async probeVisibleItems() {
			if (this.batchProbing || this.catalog.items.length === 0) {
				return
			}
			this.batchProbing = true
			let probed = 0
			try {
				for (const item of this.catalog.items.slice(0, 12)) {
					const res = await this.probeSingleItem(item)
					if (res) {
						probed += 1
					}
				}
				if (probed > 0) {
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Probed headers & tails for {count} files.', {
						count: probed,
					})
				}
			} finally {
				this.batchProbing = false
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
			const dialog = this.$refs.quarantineDeleteDialog
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
			const dialog = this.$refs.quarantineDeleteDialog
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
			if (event && event.target === this.$refs.quarantineDeleteDialog && !this.isDeleting) {
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
				const filesPayload = this.selectedDeleteItems.map(item => ({
					id: item.file.id,
					nodeId: item.file.nodeId || item.file.id,
					path: item.path,
					name: item.name,
					size: item.size,
					fileHash: item.groupHash || item.file.fileHash || '',
				}))
				const result = await deleteFiles(filesPayload, {
					allowLastCopy: this.allowLastCopyDamaged,
				})
				const deletedSuccess = Array.isArray(result?.success) ? result.success : filesPayload
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds)
					? result.deletedNodeIds
					: deletedSuccess.map(f => f.nodeId || f.id).filter(Boolean)
				const bytesReclaimed = deletedSuccess.reduce((sum, f) => sum + (Number(f.size) || 0), 0)

				const nextVault = { ...this.quarantineVault }
				for (const deleted of deletedSuccess) {
					const dKey = resolveQuarantineFileKey(deleted)
					if (dKey && nextVault[dKey]) {
						delete nextVault[dKey]
					}
				}
				this.quarantineVault = nextVault
				saveQuarantineVault(nextVault)

				this.selectedDeleteKeys = []
				this.closeDeleteDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Deleted {count} broken/quarantined files ({size} reclaimed).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('quarantine-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: 1,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeDeleteDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not delete selected quarantined files.')
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
			const json = exportQuarantineManifestJson(this.catalog)
			this.triggerDownload('duplicatefinder-quarantine-manifest.json', json, 'application/json;charset=utf-8')
		},
		exportAuditCsv() {
			const csv = exportQuarantineCsv(this.catalog)
			this.triggerDownload('duplicatefinder-quarantine-audit.csv', csv, 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style lang="scss" scoped>
.broken-quarantine-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-block: 12px 18px;
	margin-inline: 0;
	padding-block: 16px;
	padding-inline: 18px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.quarantine-wb__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.quarantine-wb__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.quarantine-wb__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.quarantine-wb__status-badge {
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
}

.quarantine-wb__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.quarantine-wb__tool-btn,
.quarantine-wb__seg-btn,
.quarantine-wb__pill-btn,
.quarantine-wb__mini-btn,
.quarantine-wb__primary-btn,
.quarantine-wb__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.quarantine-wb__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.quarantine-wb__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
}

.quarantine-wb__tool-btn:focus-visible,
.quarantine-wb__seg-btn:focus-visible,
.quarantine-wb__pill-btn:focus-visible,
.quarantine-wb__mini-btn:focus-visible,
.quarantine-wb__primary-btn:focus-visible,
.quarantine-wb__danger-btn:focus-visible,
.quarantine-wb__select:focus-visible,
.quarantine-wb__search-input:focus-visible,
.quarantine-wb__checkbox:focus-visible,
.quarantine-wb__item-select-btn:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.quarantine-wb__seg-btn.is-active,
.quarantine-wb__pill-btn.is-active {
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.14));
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.quarantine-wb__tool-btn:disabled,
.quarantine-wb__seg-btn:disabled,
.quarantine-wb__pill-btn:disabled,
.quarantine-wb__mini-btn:disabled,
.quarantine-wb__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.quarantine-wb__empty,
.quarantine-wb__filtered-empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	border: 1px dashed var(--color-border);
}

.quarantine-wb__empty-title {
	margin: 0;
	font-weight: 700;
}

.quarantine-wb__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.quarantine-wb__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.quarantine-wb__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.quarantine-wb__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.quarantine-wb__segments,
.quarantine-wb__filter-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.quarantine-wb__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.quarantine-wb__field.is-grow {
	flex: 1 1 220px;
}

.quarantine-wb__select,
.quarantine-wb__search-input {
	min-block-size: 36px;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	min-inline-size: 0;
}

.quarantine-wb__search-input {
	inline-size: 100%;
}

.quarantine-wb__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.quarantine-wb__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.quarantine-wb__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.quarantine-wb__kpi-value {
	font-size: 1rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.quarantine-wb__notice {
	margin: 0;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.1));
	font-size: 0.86rem;
	font-weight: 600;
}

.quarantine-wb__notice.is-error {
	border-color: #c62828;
	background-color: rgba(198, 40, 40, 0.1);
	color: #b71c1c;
}

.quarantine-wb__split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
	gap: 14px;
	align-items: start;
}

.quarantine-wb__roster {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 560px;
	overflow-y: auto;
	min-inline-size: 0;
}

.quarantine-wb__item-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.quarantine-wb__item-card.is-active {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.08));
}

.quarantine-wb__item-card.is-quarantined {
	border-inline-start: 4px solid #b45309;
}

.quarantine-wb__item-top {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: 8px;
	align-items: start;
}

.quarantine-wb__check-label {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding-block-start: 2px;
}

.quarantine-wb__checkbox {
	inline-size: 18px;
	block-size: 18px;
	cursor: pointer;
}

.quarantine-wb__item-select-btn {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 0;
	border: none;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.quarantine-wb__item-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
	inline-size: 100%;
	min-inline-size: 0;
}

.quarantine-wb__item-name {
	font-size: 0.9rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.quarantine-wb__item-size {
	font-size: 0.78rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	flex-shrink: 0;
}

.quarantine-wb__item-path {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.quarantine-wb__item-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.quarantine-wb__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.quarantine-wb__badge.is-sev-critical {
	border-color: #b71c1c;
	color: #b71c1c;
}

.quarantine-wb__badge.is-sev-high {
	border-color: #c2410c;
	color: #9a3412;
}

.quarantine-wb__badge.is-sev-medium {
	border-color: #b45309;
	color: #92400e;
}

.quarantine-wb__badge.is-sev-info {
	border-color: var(--color-border-dark, var(--color-border));
	color: var(--color-text-maxcontrast);
}

.quarantine-wb__badge.is-sev-ok,
.quarantine-wb__badge.is-safe {
	border-color: #15803d;
	color: #15803d;
}

.quarantine-wb__badge.is-vault {
	border-color: #b45309;
	background-color: rgba(180, 83, 9, 0.12);
	color: #92400e;
}

.quarantine-wb__badge.is-protected {
	border-color: #1d4ed8;
	color: #1e40af;
}

.quarantine-wb__badge.is-last-copy {
	border-color: #9333ea;
	color: #7e22ce;
}

.quarantine-wb__item-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.quarantine-wb__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.quarantine-wb__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.quarantine-wb__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.quarantine-wb__inspector-title {
	margin: 0 0 4px;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.quarantine-wb__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.quarantine-wb__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.quarantine-wb__telemetry-grid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.quarantine-wb__metric-box {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.quarantine-wb__metric-label {
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.quarantine-wb__metric-value {
	font-size: 0.9rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.quarantine-wb__metric-sub {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.quarantine-wb__meter-track {
	inline-size: 100%;
	block-size: 8px;
	border-radius: 999px;
	background-color: var(--color-background-dark, var(--color-background-hover));
	overflow: hidden;
}

.quarantine-wb__meter-fill {
	block-size: 100%;
	border-radius: 999px;
	background-color: var(--color-primary-element, #0082c9);
	transition: width 0.2s ease;
}

.quarantine-wb__meter-fill.is-sev-critical {
	background-color: #c62828;
}

.quarantine-wb__meter-fill.is-sev-high {
	background-color: #d97706;
}

.quarantine-wb__meter-fill.is-sev-ok {
	background-color: #15803d;
}

.quarantine-wb__hex-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.quarantine-wb__hex-card,
.quarantine-wb__siblings-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.quarantine-wb__sub-title {
	margin: 0;
	font-size: 0.82rem;
	font-weight: 700;
}

.quarantine-wb__hex-pre {
	margin: 0;
	padding-block: 8px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.74rem;
	line-height: 1.45;
	max-inline-size: 100%;
	overflow-x: auto;
	box-sizing: border-box;
}

.quarantine-wb__siblings-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.quarantine-wb__sibling-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	font-size: 0.8rem;
}

.quarantine-wb__sibling-row.is-current {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.08));
}

.quarantine-wb__sibling-name {
	font-weight: 600;
	overflow-wrap: anywhere;
}

.quarantine-wb__sibling-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.quarantine-wb__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.quarantine-wb__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
	font-size: 0.88rem;
}

.quarantine-wb__guard-toggle {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	cursor: pointer;
}

.quarantine-wb__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.quarantine-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.quarantine-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.quarantine-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.quarantine-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.quarantine-confirm-dialog__body,
.quarantine-confirm-dialog__warning {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.quarantine-confirm-dialog__warning {
	color: #b45309;
	font-weight: 600;
}

.quarantine-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.quarantine-wb__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.quarantine-wb__split,
	.quarantine-wb__telemetry-grid,
	.quarantine-wb__hex-grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.broken-quarantine-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.quarantine-wb__tool-btn,
	.quarantine-wb__seg-btn,
	.quarantine-wb__pill-btn,
	.quarantine-wb__mini-btn,
	.quarantine-wb__primary-btn,
	.quarantine-wb__danger-btn,
	.quarantine-wb__select,
	.quarantine-wb__search-input,
	.quarantine-wb__check-label,
	.quarantine-wb__guard-toggle {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.quarantine-wb__field {
		flex: 1 1 100%;
	}

	.quarantine-wb__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.quarantine-wb__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
