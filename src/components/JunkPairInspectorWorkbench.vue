<template>
	<section
		class="junk-pair-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Zero-Byte, Truncated Partial and AppleDouble Junk Pair Inspector')">
		<header class="jpw__toolbar">
			<div class="jpw__title-group">
				<h3 class="jpw__title">
					{{ t('duplicatefinder', 'Zero-Byte, Partial & AppleDouble Junk Pair Inspector') }}
				</h3>
				<span
					class="jpw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{size} safe purge / {purge} junk / {quarantine} quarantined', {
						size: report.summary.safePurgeFormatted,
						purge: report.summary.safePurgeCount,
						quarantine: report.summary.quarantineCount,
					}) }}
				</span>
			</div>

			<div class="jpw__toolbar-actions">
				<button
					type="button"
					class="jpw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportPurgeScript">
					<span>{{ t('duplicatefinder', 'Export Purge Script') }}</span>
				</button>
				<button
					type="button"
					class="jpw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="jpw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="jpw__tool-btn is-close"
					aria-keyshortcuts="~"
					:title="t('duplicatefinder', 'Hide junk pair inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Junk Pairs') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="jpw__empty">
			<p class="jpw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="jpw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect aborted .part/.crdownload/.tmp uploads, macOS ._* AppleDouble forks, .DS_Store/Thumbs.db clutter, and zero-byte pairs.') }}
			</p>
			<button
				type="button"
				class="jpw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="jpw__controls">
				<div class="jpw__control-row">
					<span class="jpw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="jpw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Inspection scope')">
						<button
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>

					<span class="jpw__control-label">{{ t('duplicatefinder', 'Guardrails') }}</span>
					<div
						class="jpw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Quarantine guardrail switches')">
						<button
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': protectUnpairedPartials }"
							:aria-pressed="protectUnpairedPartials ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="protectUnpairedPartials = !protectUnpairedPartials">
							<span>{{ t('duplicatefinder', 'Guard unpaired .part') }}</span>
						</button>
						<button
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': protectOrphanedAppleDouble }"
							:aria-pressed="protectOrphanedAppleDouble ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="protectOrphanedAppleDouble = !protectOrphanedAppleDouble">
							<span>{{ t('duplicatefinder', 'Guard orphaned ._*') }}</span>
						</button>
						<button
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': protectIntentionalMarkers }"
							:aria-pressed="protectIntentionalMarkers ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="protectIntentionalMarkers = !protectIntentionalMarkers">
							<span>{{ t('duplicatefinder', 'Preserve .gitkeep / markers') }}</span>
						</button>
					</div>
				</div>

				<div class="jpw__control-row">
					<span class="jpw__control-label">{{ t('duplicatefinder', 'Category') }}</span>
					<div
						class="jpw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter by junk category')">
						<button
							v-for="opt in categoryOptions"
							:key="opt.id"
							type="button"
							class="jpw__seg-btn"
							:class="{ 'is-active': categoryFilter === opt.id }"
							:aria-pressed="categoryFilter === opt.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="categoryFilter = opt.id">
							<span>{{ opt.label }} ({{ report.summary.categoryCounts[opt.id] || 0 }})</span>
						</button>
					</div>
				</div>

				<div class="jpw__filters-grid">
					<label class="jpw__field">
						<span class="jpw__field-label">{{ t('duplicatefinder', 'Pairing state') }}</span>
						<select
							v-model="pairingFilter"
							class="jpw__select"
							:disabled="isDeleting">
							<option value="all">{{ t('duplicatefinder', 'All junk states') }}</option>
							<option value="safe-purge">{{ t('duplicatefinder', 'Safe purge ready') }}</option>
							<option value="quarantine-only">{{ t('duplicatefinder', 'Quarantine & protected only') }}</option>
						</select>
					</label>

					<label class="jpw__field">
						<span class="jpw__field-label">{{ t('duplicatefinder', 'Sort by') }}</span>
						<select
							v-model="sortMode"
							class="jpw__select"
							:disabled="isDeleting">
							<option value="severity_desc">{{ t('duplicatefinder', 'Highest severity first') }}</option>
							<option value="reclaim_desc">{{ t('duplicatefinder', 'Most reclaimable bytes') }}</option>
							<option value="size_desc">{{ t('duplicatefinder', 'Largest file size') }}</option>
							<option value="path_asc">{{ t('duplicatefinder', 'Path A to Z') }}</option>
						</select>
					</label>

					<label class="jpw__field">
						<span class="jpw__field-label">{{ t('duplicatefinder', 'Filter path, companion or reason') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="jpw__text-input"
							:disabled="isDeleting"
							:placeholder="t('duplicatefinder', 'e.g. .part, ._, DS_Store, alice')">
					</label>

					<label class="jpw__field">
						<span class="jpw__field-label">{{ t('duplicatefinder', 'Min group max size (KB)') }}</span>
						<input
							v-model="minSizeKbInput"
							type="text"
							inputmode="numeric"
							class="jpw__text-input"
							:disabled="isDeleting"
							:placeholder="t('duplicatefinder', '0')">
					</label>

					<label class="jpw__field">
						<span class="jpw__field-label">{{ t('duplicatefinder', 'Nextcloud data root (scripts)') }}</span>
						<input
							v-model="dataRootInput"
							type="text"
							class="jpw__text-input"
							:disabled="isDeleting"
							placeholder="/var/www/nextcloud/data">
					</label>
				</div>
			</div>

			<div class="jpw__summary-grid">
				<div class="jpw__kpi-card is-safe">
					<span class="jpw__kpi-label">{{ t('duplicatefinder', 'Safe Purge Ready') }}</span>
					<strong class="jpw__kpi-value">{{ report.summary.safePurgeFormatted }}</strong>
					<span class="jpw__kpi-sub">
						{{ t('duplicatefinder', '{count} verified paired junk file(s)', { count: report.summary.safePurgeCount }) }}
					</span>
				</div>
				<div class="jpw__kpi-card is-warn">
					<span class="jpw__kpi-label">{{ t('duplicatefinder', 'Quarantine Guarded') }}</span>
					<strong class="jpw__kpi-value">{{ report.summary.quarantineCount }}</strong>
					<span class="jpw__kpi-sub">
						{{ t('duplicatefinder', '{size} unpaired partials or orphaned forks held', { size: report.summary.quarantineFormatted }) }}
					</span>
				</div>
				<div class="jpw__kpi-card is-danger">
					<span class="jpw__kpi-label">{{ t('duplicatefinder', 'Partial & Chunk Fragments') }}</span>
					<strong class="jpw__kpi-value">{{ report.summary.partialFragmentCount }}</strong>
					<span class="jpw__kpi-sub">
						{{ t('duplicatefinder', '.part / .crdownload / .tmp / .ocTransferId') }}
					</span>
				</div>
				<div class="jpw__kpi-card">
					<span class="jpw__kpi-label">{{ t('duplicatefinder', 'AppleDouble, OS & Zero-Byte') }}</span>
					<strong class="jpw__kpi-value">
						{{ report.summary.appleDoubleOsCount + report.summary.zeroByteCount }}
					</strong>
					<span class="jpw__kpi-sub">
						{{ t('duplicatefinder', '{os} OS/._* + {zero} zero-byte ({markers} markers kept)', {
							os: report.summary.appleDoubleOsCount,
							zero: report.summary.zeroByteCount,
							markers: report.summary.intentionalMarkerCount,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="jpw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div
				v-if="globalSafeSelection.files.length > 0"
				class="jpw__global-bar">
				<span class="jpw__global-bar-text">
					{{ t('duplicatefinder', '{count} paired junk file(s) ({size}) cleared for safe purge ({skipped} quarantined/protected kept).', {
						count: globalSafeSelection.files.length,
						size: globalSafeSelection.totalFormatted,
						skipped: globalSafeSelection.skippedProtectedCount,
					}) }}
				</span>
				<button
					type="button"
					class="jpw__primary-btn is-danger"
					:disabled="isDeleting"
					@click="openBatchDeleteDialog(null)">
					<span>{{ t('duplicatefinder', 'Purge {count} Safe Junk Files', { count: globalSafeSelection.files.length }) }}</span>
				</button>
			</div>

			<div
				v-if="report.items.length === 0"
				class="jpw__no-matches">
				<p>{{ t('duplicatefinder', 'No junk pairs or zero-byte fragments match the active filters.') }}</p>
				<button
					type="button"
					class="jpw__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
				</button>
			</div>

			<div
				v-else
				class="jpw__workspace">
				<div
					class="jpw__group-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Junk pair audit groups')">
					<button
						v-for="item in visibleItems"
						:key="item.groupKey"
						type="button"
						class="jpw__group-card"
						:class="[
							`is-verdict-${item.topVerdict}`,
							{ 'is-selected': activeItem && activeItem.groupKey === item.groupKey },
						]"
						:aria-current="activeItem && activeItem.groupKey === item.groupKey ? 'true' : 'false'"
						@click="selectedGroupKey = item.groupKey">
						<div class="jpw__group-card-top">
							<span
								class="jpw__verdict-pill"
								:class="`is-${item.topVerdict}`">
								{{ formatTopVerdict(item.topVerdict) }}
							</span>
							<span class="jpw__group-size">{{ item.safePurgeFormatted }}</span>
						</div>
						<div class="jpw__group-name">
							{{ item.primaryName }}
						</div>
						<div class="jpw__group-path">
							{{ item.primaryPath }}
						</div>
						<div class="jpw__group-meta">
							<span>{{ t('duplicatefinder', '{count} junk item(s)', { count: item.junkEntries.length }) }}</span>
							<span>{{ t('duplicatefinder', '{safe} purgeable / {held} held', {
								safe: item.safePurgeEntries.length,
								held: item.quarantineEntries.length + item.protectedEntries.length,
							}) }}</span>
						</div>
					</button>

					<div
						v-if="report.items.length > visibleLimit"
						class="jpw__load-more-wrap">
						<button
							type="button"
							class="jpw__tool-btn"
							@click="visibleLimit += 20">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: report.items.length - visibleLimit }) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="activeItem"
					class="jpw__detail-panel"
					role="region"
					:aria-label="t('duplicatefinder', 'Selected junk pair audit detail')">
					<div class="jpw__detail-header">
						<div class="jpw__detail-heading">
							<h4 class="jpw__detail-title">
								{{ activeItem.primaryName }}
							</h4>
							<p class="jpw__detail-sub">
								{{ t('duplicatefinder', 'Group #{id}: {safe} safe purge ({safeBytes}), {quarantine} quarantined, {healthy} healthy survivor(s)', {
									id: activeItem.groupId,
									safe: activeItem.safePurgeEntries.length,
									safeBytes: activeItem.safePurgeFormatted,
									quarantine: activeItem.quarantineEntries.length,
									healthy: activeItem.healthyEntries.length,
								}) }}
							</p>
						</div>
						<div class="jpw__detail-actions">
							<button
								type="button"
								class="jpw__tool-btn"
								:disabled="isDeleting"
								@click="$emit('select-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="jpw__tool-btn"
								:disabled="isDeleting"
								@click="$emit('compare-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
							<button
								v-if="activeItem.safePurgeEntries.length > 0"
								type="button"
								class="jpw__primary-btn is-danger"
								:disabled="isDeleting"
								@click="openBatchDeleteDialog(activeItem.groupKey)">
								<span>{{ t('duplicatefinder', 'Purge {count} Safe', { count: activeItem.safePurgeEntries.length }) }}</span>
							</button>
						</div>
					</div>

					<div class="jpw__entries-list">
						<article
							v-for="entry in activeItem.entries"
							:key="entry.selectionKey"
							class="jpw__entry-card"
							:class="`is-verdict-${entry.decision.actionVerdict}`">
							<div class="jpw__entry-top">
								<div class="jpw__entry-badges">
									<span
										class="jpw__verdict-pill"
										:class="`is-${entry.decision.actionVerdict}`">
										{{ entry.decision.verdictLabel }}
									</span>
									<span class="jpw__kind-pill">
										{{ entry.classification.label }}
									</span>
								</div>
								<span class="jpw__entry-size">{{ entry.sizeFormatted }}</span>
							</div>

							<div class="jpw__entry-path">
								{{ entry.normalizedPath }}
							</div>

							<div class="jpw__telemetry-tags">
								<span class="jpw__tag">{{ t('duplicatefinder', 'Owner: {owner}', { owner: entry.owner }) }}</span>
								<span class="jpw__tag">{{ entry.pairing.pairingLabel }}</span>
								<span
									v-if="entry.classification.appleMagic"
									class="jpw__tag is-warn">
									{{ t('duplicatefinder', 'Magic 0x00051607') }}
								</span>
								<span
									v-if="entry.protection.protectedOrigin"
									class="jpw__tag is-danger">
									{{ t('duplicatefinder', 'Origin Protected') }}
								</span>
								<span
									v-if="entry.protection.locked"
									class="jpw__tag is-danger">
									{{ t('duplicatefinder', 'Locked') }}
								</span>
								<span
									v-if="entry.protection.readOnly"
									class="jpw__tag is-warn">
									{{ t('duplicatefinder', 'Read-Only') }}
								</span>
							</div>

							<div
								v-if="entry.pairing.companionEntry"
								class="jpw__companion-box">
								<strong>{{ t('duplicatefinder', 'Companion match:') }}</strong>
								<span>{{ entry.pairing.companionEntry.normalizedPath }} ({{ entry.pairing.companionEntry.sizeFormatted }})</span>
							</div>

							<p class="jpw__entry-reason">
								{{ entry.decision.reason }}
							</p>
						</article>
					</div>

					<div class="jpw__script-panel">
						<div class="jpw__script-header">
							<strong>{{ t('duplicatefinder', 'Dry-Run POSIX Quarantine & OCC Rescan Script') }}</strong>
							<button
								type="button"
								class="jpw__tool-btn"
								:disabled="isDeleting"
								@click="copyActiveScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="jpw__code-preview">{{ activePurgeScript }}</pre>
					</div>
				</div>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="jpw__dialog"
			:aria-label="t('duplicatefinder', 'Confirm safe junk pair purge')"
			@click="onDialogBackdropClick">
			<div class="jpw__dialog-inner">
				<h4 class="jpw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Safe Junk Purge') }}
				</h4>
				<p class="jpw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} verified paired junk file(s) ({size})? Intentional markers (.gitkeep, __init__.py), Origin folders, locked files, and unpaired partials/forks ({skipped}) are excluded.', {
						count: pendingSelection.files.length,
						size: pendingSelection.totalFormatted,
						skipped: pendingSelection.skippedProtectedCount,
					}) }}
				</p>
				<div class="jpw__dialog-actions">
					<button
						type="button"
						class="jpw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="jpw__primary-btn is-danger"
						:disabled="isDeleting"
						@click="confirmSafePurge">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Purging...')
							: t('duplicatefinder', 'Purge {count} Junk Files', { count: pendingSelection.files.length }) }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	analyzeJunkPairs,
	buildJunkPairJsonReport,
	buildJunkQuarantineCsv,
	buildJunkSafePurgeScript,
	collectSafeJunkPurgeSelection,
} from '../tools/junkPairInspector'

export default {
	name: 'JunkPairInspectorWorkbench',
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
			categoryFilter: 'all',
			pairingFilter: 'all',
			sortMode: 'severity_desc',
			searchQuery: '',
			minSizeKbInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			protectUnpairedPartials: true,
			protectOrphanedAppleDouble: true,
			protectIntentionalMarkers: true,
			selectedGroupKey: null,
			pendingGroupKey: null,
			visibleLimit: 20,
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		sourceDuplicates() {
			if (this.scope === 'all' && this.allSourceCount > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedMinSizeBytes() {
			const trimmed = String(this.minSizeKbInput || '').trim()
			if (!trimmed) {
				return 0
			}
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return 0
			}
			return Math.floor(numeric * 1024)
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'partial-fragment', label: this.t('duplicatefinder', 'Partials') },
				{ id: 'appledouble-os', label: this.t('duplicatefinder', 'AppleDouble & OS') },
				{ id: 'zero-byte', label: this.t('duplicatefinder', 'Zero-Byte') },
				{ id: 'intentional-marker', label: this.t('duplicatefinder', 'Markers') },
				{ id: 'quarantine-guarded', label: this.t('duplicatefinder', 'Quarantined') },
			]
		},
		report() {
			return analyzeJunkPairs(this.sourceDuplicates, {
				categoryFilter: this.categoryFilter,
				pairingFilter: this.pairingFilter,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				minSizeBytes: this.parsedMinSizeBytes,
				protectUnpairedPartials: this.protectUnpairedPartials,
				protectOrphanedAppleDouble: this.protectOrphanedAppleDouble,
				protectIntentionalMarkers: this.protectIntentionalMarkers,
			})
		},
		visibleItems() {
			return this.report.items.slice(0, this.visibleLimit)
		},
		activeItem() {
			const items = this.report.items
			if (items.length === 0) {
				return null
			}
			if (this.selectedGroupKey) {
				const found = items.find(item => item.groupKey === this.selectedGroupKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const matched = items.find(item => item.groupId === this.currentDuplicateId)
				if (matched) {
					return matched
				}
			}
			return items[0]
		},
		globalSafeSelection() {
			return collectSafeJunkPurgeSelection(this.report)
		},
		pendingSelection() {
			return collectSafeJunkPurgeSelection(this.report, {
				targetGroupKey: this.pendingGroupKey,
			})
		},
		activePurgeScript() {
			if (!this.activeItem) {
				return ''
			}
			return buildJunkSafePurgeScript(this.report, {
				dataRoot: this.dataRootInput,
				targetGroupKey: this.activeItem.groupKey,
			})
		},
	},
	methods: {
		formatTopVerdict(verdict) {
			const map = {
				'safe-purge': this.t('duplicatefinder', 'Safe Purge'),
				'quarantine-review': this.t('duplicatefinder', 'Quarantine'),
				'protected-hold': this.t('duplicatefinder', 'Protected'),
				healthy: this.t('duplicatefinder', 'Healthy'),
			}
			return map[verdict] || verdict
		},
		resetFilters() {
			this.categoryFilter = 'all'
			this.pairingFilter = 'all'
			this.searchQuery = ''
			this.minSizeKbInput = ''
			this.sortMode = 'severity_desc'
			this.visibleLimit = 20
		},
		triggerDownload(content, mimeType, filename) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
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
		exportPurgeScript() {
			const script = buildJunkSafePurgeScript(this.report, {
				dataRoot: this.dataRootInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-junk-safe-purge.sh')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported DRY_RUN=1 POSIX quarantine and OCC purge script.')
		},
		exportJsonReport() {
			const json = buildJunkPairJsonReport(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-junk-pair-audit.json')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported junk pair JSON audit certificate.')
		},
		exportCsvLedger() {
			const csv = buildJunkQuarantineCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-junk-pair-ledger.csv')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe junk pair CSV ledger.')
		},
		async copyActiveScript() {
			if (!this.activePurgeScript) {
				return
			}
			const ok = await copyTextSafely(this.activePurgeScript)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied DRY_RUN=1 quarantine script for active group.')
				: this.t('duplicatefinder', 'Could not copy quarantine script to clipboard.')
		},
		openBatchDeleteDialog(groupKey) {
			this.pendingGroupKey = groupKey || null
			if (this.pendingSelection.files.length === 0 || this.isDeleting) {
				return
			}
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.showModal === 'function') {
				dialog.showModal()
			} else if (dialog && typeof dialog.setAttribute === 'function') {
				dialog.setAttribute('open', '')
			}
		},
		closeConfirmDialog() {
			const dialog = this.$refs.confirmDialog
			if (dialog && typeof dialog.close === 'function') {
				dialog.close()
			} else if (dialog && typeof dialog.removeAttribute === 'function') {
				dialog.removeAttribute('open')
			}
			this.pendingGroupKey = null
		},
		onDialogBackdropClick(event) {
			const dialog = this.$refs.confirmDialog
			if (dialog && event && event.target === dialog) {
				this.closeConfirmDialog()
			}
		},
		async confirmSafePurge() {
			const selection = this.pendingSelection
			if (selection.files.length === 0 || this.isDeleting) {
				this.closeConfirmDialog()
				return
			}
			this.isDeleting = true
			this.statusNotice = ''
			try {
				const response = await deleteFiles(selection.files)
				const deletedList = Array.isArray(response && response.success)
					? response.success
					: (Array.isArray(response && response.deleted) ? response.deleted : [])
				const failedList = Array.isArray(response && response.errors)
					? response.errors
					: (Array.isArray(response && response.failed) ? response.failed : [])
				const deletedFiles = (deletedList.length > 0 && typeof deletedList[0] === 'object')
					? deletedList
					: selection.files.filter(file => !failedList.includes(file) && !failedList.includes(file.id))
				const deletedCount = deletedList.length > 0
					? deletedList.length
					: Math.max(0, selection.files.length - failedList.length)

				if (failedList.length > 0 && deletedCount === 0) {
					this.statusNoticeType = 'error'
					this.statusNotice = this.t('duplicatefinder', 'Could not purge the selected junk files.')
				} else {
					this.statusNoticeType = 'success'
					this.statusNotice = this.t('duplicatefinder', 'Purged {count} verified paired junk file(s).', { count: deletedCount })
					this.$emit('junk-pair-delete-completed', {
						deletedFiles,
						deletedNodeIds: Array.isArray(response && response.deletedNodeIds) ? response.deletedNodeIds : [],
						deletedCount,
						failedCount: failedList.length,
						bytesReclaimed: selection.totalBytes,
						source: 'junk-pair-inspector',
					})
				}
			} catch (_error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Safe junk pair purge failed.')
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.junk-pair-workbench {
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

.junk-pair-workbench *,
.junk-pair-workbench *::before,
.junk-pair-workbench *::after {
	box-sizing: border-box;
}

.jpw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.jpw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.jpw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.jpw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.jpw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.jpw__tool-btn,
.jpw__primary-btn,
.jpw__seg-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.jpw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.jpw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.jpw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.jpw__primary-btn.is-danger {
	background-color: #b91c1c;
	border-color: #b91c1c;
	color: #ffffff;
}

.jpw__tool-btn:hover:not(:disabled),
.jpw__seg-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.jpw__primary-btn:hover:not(:disabled) {
	filter: brightness(0.94);
}

.jpw__tool-btn:disabled,
.jpw__primary-btn:disabled,
.jpw__seg-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.jpw__tool-btn:focus-visible,
.jpw__primary-btn:focus-visible,
.jpw__seg-btn:focus-visible,
.jpw__group-card:focus-visible,
.jpw__text-input:focus-visible,
.jpw__select:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.jpw__empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 10px;
	padding-block: 24px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.jpw__empty-title {
	margin: 0;
	font-weight: 700;
}

.jpw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	max-inline-size: 65ch;
}

.jpw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.jpw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.jpw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.jpw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.jpw__filters-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.jpw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.jpw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.jpw__text-input,
.jpw__select {
	min-block-size: 44px;
	inline-size: 100%;
	min-inline-size: 0;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
}

.jpw__summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
	gap: 10px;
}

.jpw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.jpw__kpi-card.is-safe {
	border-inline-start: 4px solid #146c43;
}

.jpw__kpi-card.is-warn {
	border-inline-start: 4px solid #92400e;
}

.jpw__kpi-card.is-danger {
	border-inline-start: 4px solid #b91c1c;
}

.jpw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.jpw__kpi-value {
	font-size: 1.12rem;
	font-weight: 700;
}

.jpw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.jpw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
}

.jpw__notice.is-success {
	border-color: #146c43;
	color: #146c43;
	background-color: var(--color-background-hover);
}

.jpw__notice.is-error {
	border-color: #b91c1c;
	color: #b91c1c;
	background-color: var(--color-background-hover);
}

.jpw__global-bar {
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

.jpw__global-bar-text {
	font-size: 0.88rem;
	font-weight: 600;
}

.jpw__no-matches {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 10px;
	padding-block: 18px;
	padding-inline: 14px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.jpw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.jpw__workspace {
		grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.38fr);
	}
}

.jpw__group-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.jpw__group-card {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	text-align: start;
	gap: 5px;
	min-block-size: 44px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	min-inline-size: 0;
}

.jpw__group-card.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.jpw__group-card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.jpw__group-size {
	font-size: 0.82rem;
	font-weight: 700;
}

.jpw__group-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.jpw__group-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.jpw__group-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 6px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.jpw__detail-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.jpw__detail-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.jpw__detail-heading {
	min-inline-size: 0;
}

.jpw__detail-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.jpw__detail-sub {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.jpw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.jpw__entries-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.jpw__entry-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.jpw__entry-card.is-verdict-safe-purge {
	border-inline-start: 4px solid #146c43;
}

.jpw__entry-card.is-verdict-quarantine-review {
	border-inline-start: 4px solid #92400e;
}

.jpw__entry-card.is-verdict-protected-hold {
	border-inline-start: 4px solid #005582;
}

.jpw__entry-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.jpw__entry-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.jpw__entry-size {
	font-size: 0.82rem;
	font-weight: 700;
}

.jpw__entry-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.jpw__telemetry-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.jpw__tag,
.jpw__verdict-pill,
.jpw__kind-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.74rem;
	font-weight: 700;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.jpw__tag.is-danger {
	border-color: #b91c1c;
	color: #b91c1c;
}

.jpw__tag.is-warn,
.jpw__verdict-pill.is-quarantine-review {
	border-color: #92400e;
	color: #92400e;
}

.jpw__verdict-pill.is-protected-hold {
	border-color: #005582;
	color: #005582;
}

.jpw__verdict-pill.is-safe-purge,
.jpw__verdict-pill.is-healthy {
	border-color: #146c43;
	color: #146c43;
}

.jpw__companion-box {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.jpw__entry-reason {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.jpw__script-panel {
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

.jpw__script-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.jpw__code-preview {
	margin: 0;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.76rem;
	line-height: 1.45;
	max-block-size: 200px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.jpw__load-more-wrap {
	display: flex;
	justify-content: center;
}

.jpw__dialog {
	max-inline-size: min(92vw, 480px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.jpw__dialog-inner {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 18px;
	padding-inline: 18px;
}

.jpw__dialog-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.jpw__dialog-body {
	margin: 0;
	font-size: 0.9rem;
}

.jpw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
