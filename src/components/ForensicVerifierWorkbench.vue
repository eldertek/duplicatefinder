<template>
	<section
		class="forensic-verifier-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Zero-Touch Duplicate Forensic Diff and Checksum Chain Verifier')">
		<header class="fvw__toolbar">
			<div class="fvw__title-group">
				<h3 class="fvw__title">
					{{ t('duplicatefinder', 'Zero-Touch Forensic Diff & Checksum Chain') }}
				</h3>
				<span
					class="fvw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{cleared} cleared ({clearedSize}) / {blocked} blocked / {pending} pending', {
						cleared: report.summary.clearedGroupCount,
						clearedSize: report.summary.clearedReclaimableFormatted,
						blocked: report.summary.blockedGroupCount,
						pending: report.summary.pendingGroupCount,
					}) }}
				</span>
			</div>

			<div class="fvw__toolbar-actions">
				<button
					type="button"
					class="fvw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty || isDeleting || (visibleGroups.length === 0 && !batchVerifying)"
					@click="batchVerifying ? cancelBatchVerify() : verifyAllVisible()">
					<span>{{ batchVerifying
						? t('duplicatefinder', 'Cancel Verify ({done}/{total})', { done: batchProgressDone, total: batchProgressTotal })
						: t('duplicatefinder', 'Verify Visible') }}</span>
				</button>
				<button
					type="button"
					class="fvw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportSha256Manifest">
					<span>{{ t('duplicatefinder', 'Export .sha256') }}</span>
				</button>
				<button
					type="button"
					class="fvw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportJsonCertificate">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="fvw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="fvw__tool-btn is-close"
					aria-keyshortcuts="."
					:title="t('duplicatefinder', 'Hide forensic checksum chain verifier')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Forensic') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="fvw__empty">
			<p class="fvw__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="fvw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to verify SHA-256 checksum chains, magic headers, and byte-level diffs across duplicate copies before deletion.') }}
			</p>
			<button
				type="button"
				class="fvw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="fvw__controls">
				<div class="fvw__control-row">
					<span class="fvw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="fvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Forensic verification scope')">
						<button
							type="button"
							class="fvw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="fvw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="fvw__control-label">{{ t('duplicatefinder', 'Anchor Strategy') }}</span>
					<div
						class="fvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Forensic anchor selection strategy')">
						<button
							v-for="opt in strategyOptions"
							:key="opt.id"
							type="button"
							class="fvw__seg-btn"
							:class="{ 'is-active': strategy === opt.id }"
							:aria-pressed="strategy === opt.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="strategy = opt.id">
							<span>{{ opt.label }}</span>
						</button>
					</div>
				</div>

				<div class="fvw__control-row">
					<span class="fvw__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
					<div
						class="fvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Forensic verdict filter')">
						<button
							v-for="cat in categoryOptions"
							:key="cat.id"
							type="button"
							class="fvw__seg-btn"
							:class="{ 'is-active': category === cat.id }"
							:aria-pressed="category === cat.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="category = cat.id">
							<span>{{ cat.label }} ({{ report.summary.categoryCounts[cat.id] || 0 }})</span>
						</button>
					</div>
				</div>

				<div class="fvw__filters-bar">
					<label class="fvw__field">
						<span class="fvw__field-label">{{ t('duplicatefinder', 'Search path or hash') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="fvw__text-input"
							:placeholder="t('duplicatefinder', 'Filter by file path, extension, or MD5/SHA...')"
							:disabled="isDeleting">
					</label>

					<label class="fvw__field">
						<span class="fvw__field-label">{{ t('duplicatefinder', 'Sort groups') }}</span>
						<select
							v-model="sortMode"
							class="fvw__select"
							:disabled="isDeleting">
							<option value="risk_desc">
								{{ t('duplicatefinder', 'Forensic risk (highest first)') }}
							</option>
							<option value="reclaim_desc">
								{{ t('duplicatefinder', 'Reclaimable space (largest first)') }}
							</option>
							<option value="copies_desc">
								{{ t('duplicatefinder', 'Most copies first') }}
							</option>
							<option value="name_asc">
								{{ t('duplicatefinder', 'Filename (A to Z)') }}
							</option>
						</select>
					</label>
				</div>

				<div class="fvw__guards-row">
					<label class="fvw__check-label">
						<input
							v-model="strictVerifiedOnly"
							type="checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Require live SHA-256 / window verification before deletion') }}</span>
					</label>
					<label class="fvw__check-label">
						<input
							v-model="blockSignatureMismatch"
							type="checkbox"
							:disabled="isDeleting">
						<span>{{ t('duplicatefinder', 'Block extension vs magic header conflicts') }}</span>
					</label>
				</div>
			</div>

			<div
				class="fvw__summary-grid"
				role="region"
				:aria-label="t('duplicatefinder', 'Forensic audit summary')">
				<div class="fvw__kpi-card">
					<span class="fvw__kpi-label">{{ t('duplicatefinder', 'Total Groups') }}</span>
					<strong class="fvw__kpi-value">{{ report.summary.totalGroups }}</strong>
					<span class="fvw__kpi-sub">{{ report.summary.totalWastedFormatted }}</span>
				</div>
				<div class="fvw__kpi-card is-cleared">
					<span class="fvw__kpi-label">{{ t('duplicatefinder', 'Forensically Cleared') }}</span>
					<strong class="fvw__kpi-value">{{ report.summary.clearedGroupCount }}</strong>
					<span class="fvw__kpi-sub">{{ report.summary.clearedReclaimableFormatted }}</span>
				</div>
				<div class="fvw__kpi-card is-blocked">
					<span class="fvw__kpi-label">{{ t('duplicatefinder', 'Drift / Anomaly Blocked') }}</span>
					<strong class="fvw__kpi-value">{{ report.summary.blockedGroupCount }}</strong>
					<span class="fvw__kpi-sub">{{ t('duplicatefinder', '{count} drifted copies', { count: report.summary.driftFileCount }) }}</span>
				</div>
				<div class="fvw__kpi-card">
					<span class="fvw__kpi-label">{{ t('duplicatefinder', 'Verified Files') }}</span>
					<strong class="fvw__kpi-value">{{ report.summary.verifiedFileCount }}</strong>
					<span class="fvw__kpi-sub">{{ t('duplicatefinder', '{count} pending groups', { count: report.summary.pendingGroupCount }) }}</span>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="fvw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div
				v-if="globalClearedSelection.files.length > 0"
				class="fvw__global-action-bar">
				<span class="fvw__global-action-text">
					{{ t('duplicatefinder', '{count} forensically cleared copies across {groups} groups ready for zero-drift deletion ({size})', {
						count: globalClearedSelection.files.length,
						groups: globalClearedSelection.groupCount,
						size: globalClearedSelection.totalFormatted,
					}) }}
				</span>
				<button
					type="button"
					class="fvw__primary-btn is-danger"
					:disabled="isDeleting"
					@click="openBatchDeleteDialog(null)">
					<span>{{ t('duplicatefinder', 'Delete {count} Cleared Copies', { count: globalClearedSelection.files.length }) }}</span>
				</button>
			</div>

			<div
				v-if="visibleGroups.length === 0"
				class="fvw__no-matches">
				<p>{{ t('duplicatefinder', 'No duplicate groups match the current forensic filter.') }}</p>
			</div>

			<div
				v-else
				class="fvw__groups-list">
				<article
					v-for="group in visibleGroups"
					:key="group.groupKey"
					class="fvw__group-card"
					:class="[
						`is-verdict-${group.verdict}`,
						{ 'is-selected': currentDuplicateId !== null && group.groupId === currentDuplicateId },
					]">
					<header class="fvw__group-header">
						<div class="fvw__group-heading">
							<span
								class="fvw__verdict-badge"
								:class="`is-${group.verdict}`">
								{{ formatVerdict(group.verdict) }}
							</span>
							<span class="fvw__group-title">{{ group.anchor.fileName }}</span>
							<span class="fvw__group-meta">
								{{ group.canonicalSizeFormatted }} / {{ t('duplicatefinder', '{count} copies', { count: group.copyCount }) }} / {{ t('duplicatefinder', '{size} reclaimable', { size: group.reclaimableFormatted }) }}
							</span>
							<span
								v-if="group.recordedHash"
								class="fvw__hash-pill">
								{{ group.hashMeta.algorithm.toUpperCase() }}: {{ group.recordedHash.slice(0, 12) }}...
							</span>
						</div>

						<div class="fvw__group-actions">
							<button
								type="button"
								class="fvw__mini-btn is-verify"
								:disabled="Boolean(loadingByKey[group.groupKey]) || isDeleting"
								@click="verifyGroupLive(group)">
								<span>{{ loadingByKey[group.groupKey]
									? t('duplicatefinder', 'Probing...')
									: t('duplicatefinder', 'Verify Chain') }}</span>
							</button>
							<button
								type="button"
								class="fvw__mini-btn"
								:disabled="isDeleting"
								@click="$emit('select-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="fvw__mini-btn"
								:disabled="isDeleting"
								@click="$emit('compare-duplicate', group.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
							<button
								v-if="countClearedCandidates(group) > 0"
								type="button"
								class="fvw__mini-btn is-danger-outline"
								:disabled="isDeleting"
								@click="openBatchDeleteDialog(group.groupKey)">
								<span>{{ t('duplicatefinder', 'Delete {count} Cleared', { count: countClearedCandidates(group) }) }}</span>
							</button>
						</div>
					</header>

					<div
						v-if="group.firstByteDiff && !group.firstByteDiff.identical"
						class="fvw__diff-box"
						role="region"
						:aria-label="t('duplicatefinder', 'Byte-level forensic divergence window')">
						<div class="fvw__diff-header">
							<strong class="fvw__diff-title">
								{{ t('duplicatefinder', 'Forensic Byte Divergence Detected at Offset 0x{hex} ({offset} B)', {
									hex: group.firstByteDiff.firstDivergenceOffset.toString(16).toUpperCase().padStart(8, '0'),
									offset: group.firstByteDiff.firstDivergenceOffset,
								}) }}
							</strong>
							<span class="fvw__diff-stats">
								{{ t('duplicatefinder', '{bytes} mismatched bytes (size delta {delta} B)', {
									bytes: group.firstByteDiff.mismatchedBytes,
									delta: group.firstByteDiff.sizeDelta,
								}) }}
							</span>
						</div>
						<div class="fvw__diff-window">
							<div class="fvw__diff-row">
								<span class="fvw__diff-tag is-anchor">ANCHOR</span>
								<code class="fvw__diff-hex">{{ group.firstByteDiff.hexA }}</code>
								<code class="fvw__diff-ascii">{{ group.firstByteDiff.asciiA }}</code>
							</div>
							<div class="fvw__diff-row">
								<span class="fvw__diff-tag is-drift">DRIFT</span>
								<code class="fvw__diff-hex">{{ group.firstByteDiff.hexB }}</code>
								<code class="fvw__diff-ascii">{{ group.firstByteDiff.asciiB }}</code>
							</div>
						</div>
					</div>

					<div class="fvw__copies-grid">
						<div
							v-for="copy in group.allCopies"
							:key="copy.selectionKey"
							class="fvw__copy-card"
							:class="{
								'is-anchor': copy.selectionKey === group.anchor.selectionKey,
								'is-drift': copy.copyChainState === 'drift-mismatch' || copy.copyChainState === 'signature-anomaly',
								'is-verified': copy.copyChainState === 'verified-identical' || copy.copyChainState === 'verified-anchor',
							}">
							<div class="fvw__copy-top">
								<span
									class="fvw__role-pill"
									:class="`is-${copy.copyChainState}`">
									{{ copy.selectionKey === group.anchor.selectionKey
										? t('duplicatefinder', 'Anchor ({state})', { state: formatChainState(copy.copyChainState) })
										: formatChainState(copy.copyChainState) }}
								</span>
								<span class="fvw__copy-size">{{ copy.sizeFormatted }}</span>
							</div>

							<div class="fvw__copy-path">
								{{ copy.normalizedPath }}
							</div>

							<div class="fvw__chain-strip">
								<span
									v-for="step in copy.chainSteps"
									:key="step.id"
									class="fvw__chain-step"
									:class="`is-${step.status}`">
									{{ step.label }}
								</span>
							</div>

							<div
								v-if="copy.live && copy.live.liveSha256"
								class="fvw__sha-line">
								<span>SHA-256: {{ copy.live.liveSha256 }}</span>
							</div>
							<div
								v-if="copy.matchInfo && copy.matchInfo.detail"
								class="fvw__match-detail"
								:class="{ 'is-error': !copy.matchInfo.matches }">
								{{ copy.matchInfo.detail }}
							</div>
							<div
								v-if="copy.live && copy.live.fetchError"
								class="fvw__match-detail is-error">
								{{ copy.live.fetchError }}
							</div>
						</div>
					</div>
				</article>
			</div>

			<div
				v-if="report.items.length > visibleLimit"
				class="fvw__load-more-wrap">
				<button
					type="button"
					class="fvw__tool-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: report.items.length - visibleLimit }) }}</span>
				</button>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="fvw__dialog"
			aria-labelledby="fvw-dialog-title"
			@click="onDialogBackdropClick">
			<div class="fvw__dialog-inner">
				<h4
					id="fvw-dialog-title"
					class="fvw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Zero-Drift Deletion') }}
				</h4>
				<p class="fvw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} forensically cleared redundant copies ({size})? Every selected copy passed checksum chain verification against its protected anchor.', {
						count: pendingSelection.files.length,
						size: pendingSelection.totalFormatted,
					}) }}
				</p>
				<div class="fvw__dialog-actions">
					<button
						type="button"
						class="fvw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="fvw__primary-btn is-danger"
						:disabled="isDeleting || pendingSelection.files.length === 0"
						@click="confirmSafeDeletion">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Delete {count} Cleared Copies', { count: pendingSelection.files.length }) }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import { deleteFiles } from '../tools/api'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { normalizeItemPath } from '../tools/utils'
import {
	FORENSIC_MAX_FULL_HASH_BYTES,
	FORENSIC_WINDOW_BYTES,
	analyzeForensicChecksumChain,
	buildForensicAuditCsv,
	buildForensicChecksumManifest,
	buildForensicSha256SumsFile,
	buildLiveVerificationRecord,
	collectForensicClearedSelection,
} from '../tools/forensicChecksumVerifier'

/**
 * Validate a download or WebDAV URL to allow http(s) or relative root paths only.
 *
 * @param {*} rawUrl Candidate URL.
 * @return {string} Sanitized URL or empty string.
 */
function sanitizeContentUrl(rawUrl) {
	if (typeof rawUrl !== 'string') {
		return ''
	}
	const trimmed = rawUrl.trim()
	if (!trimmed) {
		return ''
	}
	if (/^https?:\/\//i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) {
		return trimmed
	}
	return ''
}

export default {
	name: 'ForensicVerifierWorkbench',
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
			strategy: 'verified_anchor',
			category: 'all',
			sortMode: 'risk_desc',
			searchQuery: '',
			strictVerifiedOnly: true,
			blockSignatureMismatch: true,
			liveVerificationsByKey: {},
			loadingByKey: {},
			batchVerifying: false,
			batchProgressDone: 0,
			batchProgressTotal: 0,
			activeAbortController: null,
			visibleLimit: 25,
			pendingGroupKey: null,
			isDeleting: false,
			statusNotice: '',
			statusNoticeType: 'info',
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
		activeSourceDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		strategyOptions() {
			return [
				{ id: 'verified_anchor', label: this.t('duplicatefinder', 'Verified Anchor') },
				{ id: 'oldest', label: this.t('duplicatefinder', 'Oldest') },
				{ id: 'newest', label: this.t('duplicatefinder', 'Newest') },
				{ id: 'shortest_path', label: this.t('duplicatefinder', 'Shortest Path') },
			]
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'drift-detected', label: this.t('duplicatefinder', 'Drift Detected') },
				{ id: 'signature-anomaly', label: this.t('duplicatefinder', 'Signature Anomaly') },
				{ id: 'pending-verify', label: this.t('duplicatefinder', 'Pending Verify') },
				{ id: 'cleared-ready', label: this.t('duplicatefinder', 'Cleared Ready') },
			]
		},
		report() {
			return analyzeForensicChecksumChain(this.activeSourceDuplicates, {
				liveVerificationsByKey: this.liveVerificationsByKey,
				strategy: this.strategy,
				category: this.category,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				strictVerifiedOnly: this.strictVerifiedOnly,
				blockSignatureMismatch: this.blockSignatureMismatch,
			})
		},
		visibleGroups() {
			return this.report.items.slice(0, this.visibleLimit)
		},
		globalClearedSelection() {
			return collectForensicClearedSelection(this.report)
		},
		pendingSelection() {
			return collectForensicClearedSelection(this.report, {
				groupKey: this.pendingGroupKey,
			})
		},
	},
	beforeDestroy() {
		this.cancelBatchVerify()
	},
	methods: {
		formatVerdict(verdict) {
			const map = {
				cleared: this.t('duplicatefinder', 'Cleared'),
				'blocked-drift': this.t('duplicatefinder', 'Drift Blocked'),
				'blocked-anomaly': this.t('duplicatefinder', 'Anomaly Blocked'),
				'needs-live-verify': this.t('duplicatefinder', 'Pending Probe'),
			}
			return map[verdict] || verdict
		},
		formatChainState(state) {
			const map = {
				'verified-anchor': this.t('duplicatefinder', 'Verified'),
				'unverified-anchor': this.t('duplicatefinder', 'Unverified'),
				'verified-identical': this.t('duplicatefinder', 'Verified Identical'),
				'drift-mismatch': this.t('duplicatefinder', 'Drift Mismatch'),
				'signature-anomaly': this.t('duplicatefinder', 'Header Anomaly'),
				'probe-failed': this.t('duplicatefinder', 'Probe Failed'),
				'unverified-pending': this.t('duplicatefinder', 'Pending'),
			}
			return map[state] || state
		},
		countClearedCandidates(group) {
			if (!group || group.verdict !== 'cleared' || !Array.isArray(group.candidates)) {
				return 0
			}
			if (this.strictVerifiedOnly) {
				return group.candidates.filter(c => c.copyChainState === 'verified-identical').length
			}
			return group.candidates.filter(
				c => c.copyChainState !== 'drift-mismatch' && c.copyChainState !== 'signature-anomaly' && c.copyChainState !== 'probe-failed'
			).length
		},
		resolveProbeUrl(file) {
			if (!file || typeof file !== 'object') {
				return ''
			}
			if (typeof file.downloadUrl === 'string') {
				const safe = sanitizeContentUrl(file.downloadUrl)
				if (safe) {
					return safe
				}
			}
			const rawPath = typeof file.path === 'string' ? file.path.trim() : ''
			const extracted = rawPath ? normalizeItemPath(rawPath) : ''
			const relPath = extracted || (rawPath ? (rawPath.startsWith('/') ? rawPath : `/${rawPath}`) : '')
			const uid = typeof window !== 'undefined' && window.OC && typeof window.OC.getCurrentUser === 'function'
				? window.OC.getCurrentUser()?.uid
				: ''
			if (relPath && uid && typeof window !== 'undefined' && window.OC && typeof window.OC.linkToRemoteBase === 'function') {
				const encoded = relPath.split('/').map(seg => encodeURIComponent(seg)).join('/')
				return sanitizeContentUrl(window.OC.linkToRemoteBase(`dav/files/${encodeURIComponent(uid)}${encoded}`))
			}
			return ''
		},
		async probeSingleCopy(copy, signal) {
			const file = copy.raw
			const key = copy.selectionKey || getFileSelectionKey(file, 0)

			if (file && (file.inlineBuffer || file.arrayBuffer)) {
				const buf = file.inlineBuffer || file.arrayBuffer
				const record = await buildLiveVerificationRecord(file, {
					fullBuffer: buf,
					probeMode: 'inline-buffer',
					liveEtag: file.etag || '',
				})
				this.$set(this.liveVerificationsByKey, key, record)
				return record
			}

			const url = this.resolveProbeUrl(file)
			if (!url || typeof fetch !== 'function') {
				const errorRecord = {
					probeMode: 'unavailable',
					liveSha256: '',
					headHash: '',
					midHash: '',
					tailHash: '',
					liveSize: copy.sizeBytes,
					fetchError: this.t('duplicatefinder', 'No read-only WebDAV or download endpoint available for this copy.'),
				}
				this.$set(this.liveVerificationsByKey, key, errorRecord)
				return errorRecord
			}

			const size = Number(copy.sizeBytes) || 0
			try {
				if (size <= FORENSIC_MAX_FULL_HASH_BYTES) {
					const response = await fetch(url, { signal })
					if (!response || !response.ok || typeof response.arrayBuffer !== 'function') {
						throw new Error(`HTTP ${response ? response.status : 'error'}`)
					}
					const buffer = await response.arrayBuffer()
					const contentLengthHeader = response.headers && typeof response.headers.get === 'function'
						? Number(response.headers.get('content-length'))
						: NaN
					const etagHeader = response.headers && typeof response.headers.get === 'function'
						? (response.headers.get('etag') || '')
						: ''
					const record = await buildLiveVerificationRecord(file, {
						fullBuffer: buffer,
						liveSize: Number.isFinite(contentLengthHeader) && contentLengthHeader > 0 ? contentLengthHeader : buffer.byteLength,
						liveEtag: etagHeader,
						probeMode: 'full-sha256',
					})
					this.$set(this.liveVerificationsByKey, key, record)
					return record
				}

				const headRes = await fetch(url, {
					headers: { Range: `bytes=0-${FORENSIC_WINDOW_BYTES - 1}` },
					signal,
				})
				if (!headRes || !headRes.ok || typeof headRes.arrayBuffer !== 'function') {
					throw new Error(`HTTP ${headRes ? headRes.status : 'error'}`)
				}
				const headBuf = await headRes.arrayBuffer()
				const midStart = Math.max(0, Math.floor(size / 2) - 512)
				const midRes = await fetch(url, {
					headers: { Range: `bytes=${midStart}-${Math.min(size - 1, midStart + 1023)}` },
					signal,
				})
				const midBuf = midRes && midRes.ok && typeof midRes.arrayBuffer === 'function'
					? await midRes.arrayBuffer()
					: null
				const tailStart = Math.max(0, size - FORENSIC_WINDOW_BYTES)
				const tailRes = await fetch(url, {
					headers: { Range: `bytes=${tailStart}-${size - 1}` },
					signal,
				})
				const tailBuf = tailRes && tailRes.ok && typeof tailRes.arrayBuffer === 'function'
					? await tailRes.arrayBuffer()
					: null

				const record = await buildLiveVerificationRecord(file, {
					headBuffer: headBuf,
					midBuffer: midBuf,
					tailBuffer: tailBuf,
					liveSize: size,
					probeMode: 'range-window',
				})
				this.$set(this.liveVerificationsByKey, key, record)
				return record
			} catch (error) {
				if (error && error.name === 'AbortError') {
					return null
				}
				const errorRecord = {
					probeMode: 'fetch-error',
					liveSha256: '',
					headHash: '',
					midHash: '',
					tailHash: '',
					liveSize: size,
					fetchError: this.t('duplicatefinder', 'Zero-touch probe failed: {reason}', {
						reason: error && error.message ? error.message : 'network error',
					}),
				}
				this.$set(this.liveVerificationsByKey, key, errorRecord)
				return errorRecord
			}
		},
		async verifyGroupLive(group, options = {}) {
			if (!group || this.loadingByKey[group.groupKey]) {
				return
			}
			const signal = options.signal || undefined
			this.$set(this.loadingByKey, group.groupKey, true)
			try {
				for (const copy of group.allCopies) {
					if (signal && signal.aborted) {
						break
					}
					await this.probeSingleCopy(copy, signal)
				}
			} finally {
				this.$set(this.loadingByKey, group.groupKey, false)
			}
		},
		async verifyAllVisible() {
			const targets = [...this.visibleGroups]
			if (targets.length === 0 || this.batchVerifying) {
				return
			}
			this.batchVerifying = true
			this.batchProgressDone = 0
			this.batchProgressTotal = targets.length
			const controller = typeof AbortController === 'function' ? new AbortController() : null
			this.activeAbortController = controller

			try {
				for (const group of targets) {
					if (controller && controller.signal.aborted) {
						break
					}
					await this.verifyGroupLive(group, {
						signal: controller ? controller.signal : undefined,
					})
					this.batchProgressDone += 1
				}
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Zero-touch verification completed for {done} group(s).', {
					done: this.batchProgressDone,
				})
			} finally {
				this.batchVerifying = false
				this.activeAbortController = null
			}
		},
		cancelBatchVerify() {
			if (this.activeAbortController && typeof this.activeAbortController.abort === 'function') {
				this.activeAbortController.abort()
			}
			this.batchVerifying = false
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
		exportSha256Manifest() {
			const sums = buildForensicSha256SumsFile(this.report)
			this.triggerDownload(sums, 'text/plain;charset=utf-8', 'duplicatefinder-checksum-chain.sha256')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported SHA-256 checksum chain manifest.')
		},
		exportJsonCertificate() {
			const json = buildForensicChecksumManifest(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-forensic-certificate.json')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported forensic checksum chain JSON certificate.')
		},
		exportCsvLedger() {
			const csv = buildForensicAuditCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-forensic-ledger.csv')
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Exported forensic audit CSV ledger.')
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
		async confirmSafeDeletion() {
			const selection = this.pendingSelection
			if (selection.files.length === 0 || this.isDeleting) {
				this.closeConfirmDialog()
				return
			}
			this.isDeleting = true
			this.statusNotice = ''
			try {
				const response = await deleteFiles(selection.files)
				const deletedIds = Array.isArray(response && response.deleted) ? response.deleted : []
				const failedIds = Array.isArray(response && response.failed) ? response.failed : []
				const deletedCount = deletedIds.length > 0
					? deletedIds.length
					: Math.max(0, selection.files.length - failedIds.length)

				if (failedIds.length > 0 && deletedCount === 0) {
					this.statusNoticeType = 'error'
					this.statusNotice = this.t('duplicatefinder', 'Could not delete the selected cleared copies.')
				} else {
					this.statusNoticeType = 'success'
					this.statusNotice = this.t('duplicatefinder', 'Deleted {count} forensically cleared copies.', { count: deletedCount })
					this.$emit('forensic-delete-completed', {
						deletedFiles: selection.files,
						deletedCount,
						failedCount: failedIds.length,
						reclaimedBytes: selection.totalBytes,
						source: 'forensic-checksum-verifier',
					})
				}
			} catch (_error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Forensic safe deletion failed.')
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.forensic-verifier-workbench {
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

.forensic-verifier-workbench *,
.forensic-verifier-workbench *::before,
.forensic-verifier-workbench *::after {
	box-sizing: border-box;
}

.fvw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.fvw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.fvw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.fvw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
}

.fvw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.fvw__tool-btn,
.fvw__seg-btn,
.fvw__mini-btn,
.fvw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.fvw__tool-btn:hover:not(:disabled),
.fvw__seg-btn:hover:not(:disabled),
.fvw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
}

.fvw__tool-btn:focus-visible,
.fvw__seg-btn:focus-visible,
.fvw__mini-btn:focus-visible,
.fvw__primary-btn:focus-visible,
.fvw__text-input:focus-visible,
.fvw__select:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.fvw__tool-btn:disabled,
.fvw__seg-btn:disabled,
.fvw__mini-btn:disabled,
.fvw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.fvw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.fvw__seg-btn.is-active {
	background-color: var(--color-primary-element-light, var(--color-background-hover));
	border-color: var(--color-primary-element, #0082c9);
}

.fvw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #fff);
}

.fvw__primary-btn.is-danger {
	background-color: var(--color-error, #e9322d);
	border-color: var(--color-error, #e9322d);
	color: #fff;
}

.fvw__mini-btn.is-danger-outline {
	border-color: var(--color-error, #e9322d);
	color: var(--color-error, #e9322d);
}

.fvw__mini-btn.is-verify {
	border-color: var(--color-primary-element, #0082c9);
}

.fvw__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.fvw__empty-title {
	margin: 0;
	font-weight: 700;
}

.fvw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
}

.fvw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.fvw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.fvw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.fvw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.fvw__filters-bar {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
	gap: 10px;
}

.fvw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.fvw__field-label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.fvw__text-input,
.fvw__select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	inline-size: 100%;
}

.fvw__guards-row {
	display: flex;
	flex-wrap: wrap;
	gap: 14px;
}

.fvw__check-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-block-size: 44px;
	font-size: 0.86rem;
	cursor: pointer;
}

.fvw__summary-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
	gap: 10px;
}

.fvw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.fvw__kpi-card.is-cleared {
	border-color: var(--color-success, #46ba61);
}

.fvw__kpi-card.is-blocked {
	border-color: var(--color-error, #e9322d);
}

.fvw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.fvw__kpi-value {
	font-size: 1.25rem;
	font-weight: 700;
}

.fvw__kpi-sub {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.fvw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.88rem;
	font-weight: 600;
}

.fvw__notice.is-success {
	border-color: var(--color-success, #46ba61);
}

.fvw__notice.is-error {
	border-color: var(--color-error, #e9322d);
	color: var(--color-error, #e9322d);
}

.fvw__global-action-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 14px;
	border: 1px solid var(--color-success, #46ba61);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.fvw__global-action-text {
	font-size: 0.88rem;
	font-weight: 600;
}

.fvw__groups-list {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.fvw__group-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
}

.fvw__group-card.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	box-shadow: 0 0 0 1px var(--color-primary-element, #0082c9);
}

.fvw__group-card.is-verdict-blocked-drift {
	border-inline-start: 4px solid var(--color-error, #e9322d);
}

.fvw__group-card.is-verdict-blocked-anomaly {
	border-inline-start: 4px solid var(--color-warning, #e9a22d);
}

.fvw__group-card.is-verdict-cleared {
	border-inline-start: 4px solid var(--color-success, #46ba61);
}

.fvw__group-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.fvw__group-heading {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.fvw__group-title {
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.fvw__group-meta {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.fvw__hash-pill {
	font-family: monospace;
	font-size: 0.78rem;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.fvw__group-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.fvw__verdict-badge,
.fvw__role-pill,
.fvw__chain-step {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.fvw__verdict-badge.is-blocked-drift,
.fvw__role-pill.is-drift-mismatch,
.fvw__role-pill.is-probe-failed,
.fvw__chain-step.is-fail {
	border-color: var(--color-error, #e9322d);
	color: var(--color-error, #e9322d);
}

.fvw__verdict-badge.is-blocked-anomaly,
.fvw__role-pill.is-signature-anomaly,
.fvw__chain-step.is-warn {
	border-color: var(--color-warning, #e9a22d);
}

.fvw__verdict-badge.is-cleared,
.fvw__role-pill.is-verified-anchor,
.fvw__role-pill.is-verified-identical,
.fvw__chain-step.is-ok {
	border-color: var(--color-success, #46ba61);
}

.fvw__diff-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-error, #e9322d);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.fvw__diff-header {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
}

.fvw__diff-title {
	font-size: 0.84rem;
	color: var(--color-error, #e9322d);
}

.fvw__diff-stats {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.fvw__diff-window {
	display: flex;
	flex-direction: column;
	gap: 4px;
	overflow-x: auto;
}

.fvw__diff-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-family: monospace;
	font-size: 0.78rem;
}

.fvw__diff-tag {
	display: inline-block;
	min-inline-size: 62px;
	text-align: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.fvw__diff-tag.is-anchor {
	border-color: var(--color-success, #46ba61);
}

.fvw__diff-tag.is-drift {
	border-color: var(--color-error, #e9322d);
	color: var(--color-error, #e9322d);
}

.fvw__diff-hex,
.fvw__diff-ascii {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	overflow-wrap: anywhere;
}

.fvw__copies-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
	gap: 10px;
}

.fvw__copy-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	min-inline-size: 0;
}

.fvw__copy-card.is-anchor {
	background-color: var(--color-background-hover);
}

.fvw__copy-card.is-verified {
	border-color: var(--color-success, #46ba61);
}

.fvw__copy-card.is-drift {
	border-color: var(--color-error, #e9322d);
}

.fvw__copy-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.fvw__copy-size {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.fvw__copy-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.fvw__chain-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.fvw__sha-line {
	font-family: monospace;
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.fvw__match-detail {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.fvw__match-detail.is-error {
	color: var(--color-error, #e9322d);
	font-weight: 600;
}

.fvw__no-matches {
	padding-block: 16px;
	padding-inline: 16px;
	text-align: center;
	color: var(--color-text-maxcontrast);
}

.fvw__load-more-wrap {
	display: flex;
	justify-content: center;
}

.fvw__dialog {
	max-inline-size: min(92vw, 480px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.fvw__dialog-inner {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 18px;
	padding-inline: 18px;
}

.fvw__dialog-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.fvw__dialog-body {
	margin: 0;
	font-size: 0.9rem;
}

.fvw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
