<template>
	<section
		class="hygiene-inspector"
		role="region"
		:aria-label="t('duplicatefinder', 'File Hygiene and Bad-Extension Inspector')">
		<header class="hygiene-inspector__toolbar">
			<div class="hygiene-inspector__title-group">
				<h3 class="hygiene-inspector__title">
					{{ t('duplicatefinder', 'File Hygiene Inspector') }}
				</h3>
				<span
					class="hygiene-inspector__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{findings} findings across {groups} groups ({size})', {
						findings: analysis.summary.totalFindings,
						groups: analysis.summary.affectedGroupCount,
						size: analysis.summary.safeReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="hygiene-inspector__toolbar-actions">
				<button
					type="button"
					class="hygiene-inspector__tool-btn"
					:disabled="analysis.findings.length === 0 || isExecuting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="hygiene-inspector__tool-btn"
					:disabled="analysis.findings.length === 0 || isExecuting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="hygiene-inspector__tool-btn is-close"
					aria-keyshortcuts="i"
					:title="t('duplicatefinder', 'Hide file hygiene inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide hygiene') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="hygiene-inspector__empty">
			<p class="hygiene-inspector__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="hygiene-inspector__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to detect extension mismatches, zero-byte duplicates, and Nextcloud sync conflict clutter.') }}
			</p>
			<button
				type="button"
				class="hygiene-inspector__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="hygiene-inspector__controls">
				<div class="hygiene-inspector__scope-row">
					<span class="hygiene-inspector__control-label">
						{{ t('duplicatefinder', 'Scan scope') }}
					</span>
					<div
						class="hygiene-inspector__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Hygiene inspection scope')">
						<button
							type="button"
							class="hygiene-inspector__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="hygiene-inspector__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>
				</div>

				<div class="hygiene-inspector__kpis">
					<div class="hygiene-inspector__kpi">
						<span class="hygiene-inspector__kpi-label">{{ t('duplicatefinder', 'Bad extensions') }}</span>
						<strong class="hygiene-inspector__kpi-value">{{ analysis.summary.byCategory['bad-extension'] }}</strong>
					</div>
					<div class="hygiene-inspector__kpi">
						<span class="hygiene-inspector__kpi-label">{{ t('duplicatefinder', 'Zero-byte & stubs') }}</span>
						<strong class="hygiene-inspector__kpi-value">{{ analysis.summary.byCategory['zero-byte'] }}</strong>
					</div>
					<div class="hygiene-inspector__kpi">
						<span class="hygiene-inspector__kpi-label">{{ t('duplicatefinder', 'Sync conflicts & junk') }}</span>
						<strong class="hygiene-inspector__kpi-value">{{ analysis.summary.byCategory['sync-conflict'] }}</strong>
					</div>
					<div class="hygiene-inspector__kpi">
						<span class="hygiene-inspector__kpi-label">{{ t('duplicatefinder', 'Safe reclaimable') }}</span>
						<strong class="hygiene-inspector__kpi-value">{{ analysis.summary.safeReclaimableFormatted }}</strong>
					</div>
				</div>

				<div class="hygiene-inspector__filter-bar">
					<div
						class="hygiene-inspector__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter findings by category')">
						<button
							v-for="cat in categoryOptions"
							:key="cat.id"
							type="button"
							class="hygiene-inspector__pill-btn"
							:class="{ 'is-active': category === cat.id }"
							:aria-pressed="category === cat.id ? 'true' : 'false'"
							@click="category = cat.id">
							<span>{{ cat.label }} ({{ cat.count }})</span>
						</button>
					</div>
					<div class="hygiene-inspector__search-wrap">
						<input
							v-model="query"
							type="search"
							class="hygiene-inspector__search-input"
							:aria-label="t('duplicatefinder', 'Filter hygiene findings by path, MIME, or extension')"
							:placeholder="t('duplicatefinder', 'Filter path, MIME, or .ext...')">
						<button
							v-if="hasActiveFilters"
							type="button"
							class="hygiene-inspector__tool-btn"
							@click="resetFilters">
							<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
						</button>
					</div>
				</div>
			</div>

			<div
				v-if="feedbackMessage"
				class="hygiene-inspector__feedback"
				:class="`is-${feedbackType}`"
				role="status"
				aria-live="polite">
				{{ feedbackMessage }}
			</div>

			<div v-if="analysis.findings.length === 0" class="hygiene-inspector__clean">
				<p class="hygiene-inspector__empty-title">
					{{ t('duplicatefinder', 'No hygiene anomalies detected in this scope') }}
				</p>
				<p class="hygiene-inspector__empty-hint">
					{{ t('duplicatefinder', 'All loaded duplicate copies have consistent extensions, non-empty sizes, and clean filenames.') }}
				</p>
			</div>

			<div v-else-if="filteredFindings.length === 0" class="hygiene-inspector__clean">
				<p class="hygiene-inspector__empty-title">
					{{ t('duplicatefinder', 'No findings match your active filters') }}
				</p>
				<button
					type="button"
					class="hygiene-inspector__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<template v-else>
				<div class="hygiene-inspector__selection-bar">
					<div class="hygiene-inspector__selection-actions">
						<button
							type="button"
							class="hygiene-inspector__tool-btn"
							:disabled="isExecuting || safeCandidateCount === 0"
							@click="selectSafeClutter">
							<span>{{ t('duplicatefinder', 'Select safe clutter ({count})', { count: safeCandidateCount }) }}</span>
						</button>
						<button
							type="button"
							class="hygiene-inspector__tool-btn"
							:disabled="isExecuting || selectedTokens.length === 0"
							@click="clearSelection">
							<span>{{ t('duplicatefinder', 'Clear selection') }}</span>
						</button>
					</div>
					<div class="hygiene-inspector__cleanup-summary">
						<span class="hygiene-inspector__cleanup-stat">
							{{ t('duplicatefinder', '{count} selected ({size}) - at least 1 copy preserved per group', {
								count: cleanupPlan.selectedCount,
								size: cleanupPlan.reclaimableFormatted,
							}) }}
						</span>
						<button
							type="button"
							class="hygiene-inspector__danger-btn"
							:disabled="isExecuting || cleanupPlan.selectedCount === 0"
							@click="openDeleteDialog">
							<span>{{ t('duplicatefinder', 'Clean selected ({count})', { count: cleanupPlan.selectedCount }) }}</span>
						</button>
					</div>
				</div>

				<ul class="hygiene-inspector__list">
					<li
						v-for="item in filteredFindings"
						:key="item.id"
						class="hygiene-card"
						:class="{
							'is-current': currentDuplicateId !== null && item.groupId === currentDuplicateId,
							'is-selected': isTokenSelected(item)
						}">
						<div class="hygiene-card__top">
							<label class="hygiene-card__select-label">
								<input
									type="checkbox"
									class="hygiene-card__checkbox"
									:checked="isTokenSelected(item)"
									:disabled="!item.canSafelyDelete || item.isProtected || isExecuting"
									:aria-label="t('duplicatefinder', 'Select {path} for safe hygiene cleanup', { path: item.filePath || item.filename })"
									@change="toggleToken(item)">
								<span class="hygiene-card__category" :class="`is-${item.category}`">
									{{ formatCategoryLabel(item.category) }}
								</span>
							</label>
							<div class="hygiene-card__badges">
								<span
									v-if="item.isProtected"
									class="hygiene-card__tag is-protected">
									{{ t('duplicatefinder', 'Protected origin') }}
								</span>
								<span
									v-else-if="item.groupFileCount <= 1"
									class="hygiene-card__tag is-guarded">
									{{ t('duplicatefinder', 'Only copy') }}
								</span>
								<span
									v-if="item.suggestedExtension"
									class="hygiene-card__tag is-suggestion">
									{{ t('duplicatefinder', 'Expected .{ext}', { ext: item.suggestedExtension }) }}
								</span>
								<span class="hygiene-card__size">{{ item.sizeFormatted }}</span>
							</div>
						</div>

						<div class="hygiene-card__path" :title="item.filePath">
							{{ item.filePath || item.filename }}
						</div>

						<div class="hygiene-card__meta">
							<span class="hygiene-card__reason">{{ item.reason }}</span>
							<span v-if="item.declaredMime" class="hygiene-card__mime">{{ item.declaredMime }}</span>
							<span class="hygiene-card__group">{{ t('duplicatefinder', 'Group: {name} ({count} copies)', { name: item.groupName, count: item.groupFileCount }) }}</span>
						</div>

						<div
							v-if="headerResultsById[item.id]"
							class="hygiene-card__header-status"
							:class="`is-${headerResultsById[item.id].status}`"
							role="status">
							{{ headerResultsById[item.id].detail }}
						</div>

						<div class="hygiene-card__actions">
							<button
								type="button"
								class="hygiene-card__btn"
								:disabled="headerLoadingId === item.id"
								@click="verifyFileHeader(item)">
								<span>{{ headerLoadingId === item.id
									? t('duplicatefinder', 'Checking...')
									: t('duplicatefinder', 'Verify header') }}</span>
							</button>
							<button
								type="button"
								class="hygiene-card__btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
							</button>
							<button
								type="button"
								class="hygiene-card__btn"
								:disabled="!item.rawGroup || !Array.isArray(item.rawGroup.files) || item.rawGroup.files.length < 2"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</li>
				</ul>
			</template>
		</template>

		<dialog
			ref="hygieneDeleteDialog"
			class="hygiene-confirm-dialog"
			:aria-labelledby="'hygiene-confirm-title'"
			@cancel.prevent="closeDeleteDialog">
			<div class="hygiene-confirm-dialog__surface">
				<h4 id="hygiene-confirm-title" class="hygiene-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm Safe Hygiene Cleanup') }}
				</h4>
				<p class="hygiene-confirm-dialog__desc">
					{{ t('duplicatefinder', 'Only redundant clutter copies outside protected origin folders will be moved to Trash. At least one surviving copy remains in every duplicate group.') }}
				</p>
				<dl class="hygiene-confirm-dialog__stats">
					<div class="hygiene-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Copies marked') }}</dt>
						<dd>{{ cleanupPlan.selectedCount }}</dd>
					</div>
					<div class="hygiene-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Groups affected') }}</dt>
						<dd>{{ cleanupPlan.affectedGroupCount }}</dd>
					</div>
					<div class="hygiene-confirm-dialog__stat">
						<dt>{{ t('duplicatefinder', 'Space freed') }}</dt>
						<dd>{{ cleanupPlan.reclaimableFormatted }}</dd>
					</div>
				</dl>
				<div class="hygiene-confirm-dialog__actions">
					<button
						type="button"
						class="hygiene-confirm-dialog__btn"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="hygiene-confirm-dialog__btn is-danger"
						@click="executeCleanup">
						<span>{{ t('duplicatefinder', 'Delete {count} copies', { count: cleanupPlan.selectedCount }) }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { formatBytes } from '../tools/duplicateStats'
import { normalizeItemPath } from '../tools/utils'
import {
	analyzeFileHygiene,
	buildHygieneAuditCsv,
	buildHygieneAuditJson,
	buildHygieneCleanupPlan,
	filterHygieneFindings,
	inspectMagicBytes,
	pickSafeHygieneSelectionKeys,
} from '../tools/fileHygieneInspector'

export default {
	name: 'FileHygieneInspector',
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
			category: 'all',
			query: '',
			selectedTokens: [],
			isExecuting: false,
			feedbackMessage: '',
			feedbackType: 'info',
			headerResultsById: {},
			headerLoadingId: '',
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		sourceGroups() {
			if (this.scope === 'all') {
				return Array.isArray(this.allDuplicates) ? this.allDuplicates : []
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		analysis() {
			return analyzeFileHygiene(this.sourceGroups)
		},
		categoryOptions() {
			const counts = this.analysis.summary.byCategory
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All'), count: this.analysis.summary.totalFindings },
				{ id: 'bad-extension', label: this.t('duplicatefinder', 'Bad Extension'), count: counts['bad-extension'] || 0 },
				{ id: 'zero-byte', label: this.t('duplicatefinder', 'Zero-Byte'), count: counts['zero-byte'] || 0 },
				{ id: 'sync-conflict', label: this.t('duplicatefinder', 'Sync Conflict & Junk'), count: counts['sync-conflict'] || 0 },
				{ id: 'mixed-extension-group', label: this.t('duplicatefinder', 'Ext Divergence'), count: counts['mixed-extension-group'] || 0 },
			]
		},
		hasActiveFilters() {
			return this.category !== 'all' || this.query.trim() !== ''
		},
		filteredFindings() {
			return filterHygieneFindings(this.analysis.findings, {
				category: this.category,
				query: this.query,
			})
		},
		safeCandidateTokens() {
			return pickSafeHygieneSelectionKeys(this.analysis.findings)
		},
		safeCandidateCount() {
			return this.safeCandidateTokens.length
		},
		cleanupPlan() {
			return buildHygieneCleanupPlan(this.analysis.findings, this.selectedTokens)
		},
	},
	methods: {
		getToken(item) {
			return `${item.groupKey}::${item.fileKey}`
		},
		isTokenSelected(item) {
			return this.selectedTokens.includes(this.getToken(item))
		},
		toggleToken(item) {
			if (!item || !item.canSafelyDelete || item.isProtected) {
				return
			}
			const token = this.getToken(item)
			const idx = this.selectedTokens.indexOf(token)
			if (idx !== -1) {
				this.selectedTokens.splice(idx, 1)
				return
			}
			const candidatePlan = buildHygieneCleanupPlan(this.analysis.findings, [...this.selectedTokens, token])
			if (candidatePlan.skippedLastCopyCount > 0 && candidatePlan.selectedCount === this.cleanupPlan.selectedCount) {
				this.feedbackType = 'info'
				this.feedbackMessage = this.t('duplicatefinder', 'Kept at least one surviving copy in this group for safety.')
				return
			}
			this.selectedTokens.push(token)
		},
		selectSafeClutter() {
			this.selectedTokens = [...this.safeCandidateTokens]
			this.feedbackMessage = ''
		},
		clearSelection() {
			this.selectedTokens = []
			this.feedbackMessage = ''
		},
		resetFilters() {
			this.category = 'all'
			this.query = ''
		},
		formatCategoryLabel(category) {
			const labels = {
				'bad-extension': this.t('duplicatefinder', 'Bad Extension'),
				'zero-byte': this.t('duplicatefinder', 'Zero-Byte / Stub'),
				'sync-conflict': this.t('duplicatefinder', 'Sync Conflict & Junk'),
				'mixed-extension-group': this.t('duplicatefinder', 'Extension Divergence'),
			}
			return labels[category] || category
		},
		resolveHeaderInspectionUrl(file) {
			if (!file || typeof file !== 'object') {
				return ''
			}
			if (typeof file.downloadUrl === 'string' && /^https?:\/\//i.test(file.downloadUrl)) {
				return file.downloadUrl
			}
			const relPath = typeof file.path === 'string' ? normalizeItemPath(file.path) : ''
			const uid = typeof window !== 'undefined' && window.OC && typeof window.OC.getCurrentUser === 'function'
				? window.OC.getCurrentUser()?.uid
				: ''
			if (relPath && uid && typeof window !== 'undefined' && window.OC && typeof window.OC.linkToRemoteBase === 'function') {
				const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/')
				return window.OC.linkToRemoteBase(`dav/files/${encodeURIComponent(uid)}${encoded}`)
			}
			return ''
		},
		async verifyFileHeader(item) {
			if (!item || !item.file || this.headerLoadingId === item.id) {
				return
			}
			const url = this.resolveHeaderInspectionUrl(item.file)
			if (!url || typeof fetch !== 'function') {
				this.$set(this.headerResultsById, item.id, {
					status: 'unknown',
					detail: this.t('duplicatefinder', 'Direct WebDAV header range unavailable in this view.'),
				})
				return
			}
			this.headerLoadingId = item.id
			try {
				const response = await fetch(url, {
					headers: { Range: 'bytes=0-63' },
				})
				if (!response || !response.ok || typeof response.arrayBuffer !== 'function') {
					this.$set(this.headerResultsById, item.id, {
						status: 'unknown',
						detail: this.t('duplicatefinder', 'Could not read remote file header.'),
					})
					return
				}
				const buffer = await response.arrayBuffer()
				const result = inspectMagicBytes(buffer, item.declaredMime, item.filePath)
				this.$set(this.headerResultsById, item.id, result)
			} catch (error) {
				this.$set(this.headerResultsById, item.id, {
					status: 'unknown',
					detail: this.t('duplicatefinder', 'Header verification failed (network or permission error).'),
				})
			} finally {
				this.headerLoadingId = ''
			}
		},
		openDeleteDialog() {
			if (this.isExecuting || this.cleanupPlan.selectedCount === 0) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.hygieneDeleteDialog
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
			const dialog = this.$refs.hygieneDeleteDialog
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
		async executeCleanup() {
			const planSnapshot = this.cleanupPlan
			this.closeDeleteDialog()
			if (planSnapshot.selectedFiles.length === 0) {
				return
			}
			this.isExecuting = true
			this.feedbackMessage = ''
			try {
				const { success = [], errors = [], deletedNodeIds = [] } = await deleteFiles(planSnapshot.selectedFiles, {
					allowLastCopy: false,
				})
				const deletedFiles = success.length > 0 ? success : []
				let bytesReclaimed = 0
				for (const entry of planSnapshot.selectedEntries) {
					const matched = deletedFiles.some(item => item && (item.id === entry.file.id || item.path === entry.filePath))
					if (matched) {
						bytesReclaimed += entry.sizeBytes
					}
				}
				if (deletedFiles.length > 0) {
					this.$emit('hygiene-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved: 0,
						sampleLabel: planSnapshot.selectedEntries[0] ? planSnapshot.selectedEntries[0].groupName : '',
					})
					this.selectedTokens = []
				}
				if (errors.length > 0) {
					this.feedbackType = 'error'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Removed {deleted} clutter file(s), {failed} failed (locked, missing, or protected).',
						{ deleted: deletedFiles.length, failed: errors.length }
					)
				} else {
					this.feedbackType = 'success'
					this.feedbackMessage = this.t(
						'duplicatefinder',
						'Hygiene cleanup completed: {deleted} file(s) removed ({size} freed).',
						{ deleted: deletedFiles.length, size: formatBytes(bytesReclaimed) }
					)
				}
			} catch (error) {
				this.feedbackType = 'error'
				this.feedbackMessage = this.t('duplicatefinder', 'Hygiene cleanup failed. Please try again.')
			} finally {
				this.isExecuting = false
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
			link.setAttribute('download', filename)
			link.style.display = 'none'
			document.body.appendChild(link)
			try {
				link.click()
			} finally {
				document.body.removeChild(link)
				if (typeof URL.revokeObjectURL === 'function') {
					URL.revokeObjectURL(url)
				}
			}
		},
		exportAuditCsv() {
			const csv = buildHygieneAuditCsv(this.filteredFindings)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8;', 'duplicatefinder-hygiene-audit.csv')
		},
		exportAuditJson() {
			const json = buildHygieneAuditJson(this.analysis)
			this.triggerDownload(json, 'application/json;charset=utf-8;', 'duplicatefinder-hygiene-audit.json')
		},
	},
}
</script>

<style scoped>
.hygiene-inspector {
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

.hygiene-inspector__toolbar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	margin-block-end: 14px;
}

.hygiene-inspector__title-group {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
	min-inline-size: 0;
}

.hygiene-inspector__title {
	margin-block: 0;
	margin-inline: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.hygiene-inspector__badge {
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

.hygiene-inspector__toolbar-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.hygiene-inspector__tool-btn,
.hygiene-inspector__pill-btn,
.hygiene-inspector__primary-btn,
.hygiene-inspector__danger-btn,
.hygiene-card__btn,
.hygiene-confirm-dialog__btn {
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
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.hygiene-inspector__tool-btn:focus-visible,
.hygiene-inspector__pill-btn:focus-visible,
.hygiene-inspector__primary-btn:focus-visible,
.hygiene-inspector__danger-btn:focus-visible,
.hygiene-card__btn:focus-visible,
.hygiene-confirm-dialog__btn:focus-visible,
.hygiene-inspector__search-input:focus-visible,
.hygiene-card__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.hygiene-inspector__pill-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.hygiene-inspector__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.hygiene-inspector__danger-btn,
.hygiene-confirm-dialog__btn.is-danger {
	background-color: #d32f2f;
	border-color: #d32f2f;
	color: #ffffff;
}

.hygiene-inspector__danger-btn:hover:not(:disabled),
.hygiene-confirm-dialog__btn.is-danger:hover:not(:disabled) {
	background-color: #b71c1c;
	border-color: #b71c1c;
}

.hygiene-inspector button:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.hygiene-inspector__empty,
.hygiene-inspector__clean {
	padding-block: 22px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.hygiene-inspector__empty-title {
	margin-block: 0 6px;
	font-weight: 700;
	font-size: 0.98rem;
}

.hygiene-inspector__empty-hint {
	margin-block: 0 12px;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.hygiene-inspector__controls {
	display: flex;
	flex-direction: column;
	gap: 12px;
	margin-block-end: 14px;
}

.hygiene-inspector__scope-row {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 10px;
}

.hygiene-inspector__control-label {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.hygiene-inspector__pills {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.hygiene-inspector__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
}

.hygiene-inspector__kpi {
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

.hygiene-inspector__kpi-label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.hygiene-inspector__kpi-value {
	font-size: 1rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.hygiene-inspector__filter-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
}

.hygiene-inspector__search-wrap {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	flex: 1 1 240px;
	min-inline-size: 0;
}

.hygiene-inspector__search-input {
	flex: 1 1 180px;
	min-inline-size: 0;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	box-sizing: border-box;
}

.hygiene-inspector__feedback {
	margin-block-end: 12px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border-inline-start: 3px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-background-hover);
	font-size: 0.88rem;
}

.hygiene-inspector__feedback.is-success {
	border-inline-start-color: #2e7d32;
}

.hygiene-inspector__feedback.is-error {
	border-inline-start-color: #d32f2f;
}

.hygiene-inspector__selection-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	margin-block-end: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.hygiene-inspector__selection-actions,
.hygiene-inspector__cleanup-summary {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.hygiene-inspector__cleanup-stat {
	font-size: 0.84rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.hygiene-inspector__list {
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

.hygiene-card {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.hygiene-card.is-current {
	border-color: var(--color-primary-element, #0082c9);
}

.hygiene-card.is-selected {
	background-color: var(--color-background-hover);
}

.hygiene-card__top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	margin-block-end: 6px;
}

.hygiene-card__select-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
}

.hygiene-card__checkbox {
	inline-size: 18px;
	block-size: 18px;
	margin-block: 0;
	margin-inline: 0;
	accent-color: var(--color-primary-element, #0082c9);
}

.hygiene-card__category,
.hygiene-card__tag {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.hygiene-card__category.is-bad-extension {
	background-color: rgba(230, 81, 0, 0.12);
	border-color: rgba(230, 81, 0, 0.35);
	color: #bf360c;
}

.hygiene-card__category.is-zero-byte {
	background-color: rgba(211, 47, 47, 0.12);
	border-color: rgba(211, 47, 47, 0.35);
	color: #b71c1c;
}

.hygiene-card__category.is-sync-conflict {
	background-color: rgba(2, 136, 209, 0.12);
	border-color: rgba(2, 136, 209, 0.35);
	color: #01579b;
}

.hygiene-card__category.is-mixed-extension-group {
	background-color: rgba(106, 27, 154, 0.1);
	border-color: rgba(106, 27, 154, 0.3);
	color: #4a148c;
}

.hygiene-card__tag.is-protected {
	background-color: rgba(46, 125, 50, 0.12);
	border-color: rgba(46, 125, 50, 0.35);
	color: #1b5e20;
}

.hygiene-card__tag.is-guarded {
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast);
}

.hygiene-card__tag.is-suggestion {
	background-color: rgba(0, 130, 201, 0.12);
	border-color: rgba(0, 130, 201, 0.35);
	color: #01579b;
}

.hygiene-card__badges {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
}

.hygiene-card__size {
	font-size: 0.8rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
}

.hygiene-card__path {
	font-size: 0.9rem;
	font-weight: 600;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
	margin-block-end: 4px;
}

.hygiene-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	margin-block-end: 8px;
}

.hygiene-card__header-status {
	margin-block-end: 8px;
	padding-block: 4px;
	padding-inline: 8px;
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-size: 0.8rem;
	font-weight: 600;
}

.hygiene-card__header-status.is-verified {
	color: #1b5e20;
}

.hygiene-card__header-status.is-header-mismatch,
.hygiene-card__header-status.is-empty {
	color: #b71c1c;
}

.hygiene-card__actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 8px;
}

.hygiene-confirm-dialog {
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

.hygiene-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.hygiene-confirm-dialog__surface {
	padding-block: 18px;
	padding-inline: 20px;
}

.hygiene-confirm-dialog__title {
	margin-block: 0 8px;
	font-size: 1.05rem;
	font-weight: 700;
}

.hygiene-confirm-dialog__desc {
	margin-block: 0 14px;
	font-size: 0.9rem;
	line-height: 1.45;
	color: var(--color-text-maxcontrast);
}

.hygiene-confirm-dialog__stats {
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

.hygiene-confirm-dialog__stat dt {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.hygiene-confirm-dialog__stat dd {
	margin-inline-start: 0;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.hygiene-confirm-dialog__actions {
	display: flex;
	justify-content: flex-end;
	flex-wrap: wrap;
	gap: 8px;
}

@media (max-width: 768px) {
	.hygiene-inspector {
		margin-inline: 8px;
		padding-inline: 12px;
	}

	.hygiene-inspector__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.hygiene-inspector__tool-btn,
	.hygiene-inspector__pill-btn,
	.hygiene-inspector__primary-btn,
	.hygiene-inspector__danger-btn,
	.hygiene-card__btn,
	.hygiene-confirm-dialog__btn,
	.hygiene-inspector__search-input {
		min-block-size: 44px;
	}

	.hygiene-confirm-dialog__stats {
		grid-template-columns: 1fr;
	}
}
</style>
