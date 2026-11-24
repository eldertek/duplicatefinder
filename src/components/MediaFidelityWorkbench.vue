<template>
	<section
		class="media-fidelity-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Near-Duplicate Media Fidelity and Transcode-Loss Ranker')">
		<header class="mfw__toolbar">
			<div class="mfw__title-group">
				<h3 class="mfw__title">
					{{ t('duplicatefinder', 'Media Fidelity & Transcode-Loss Ranker') }}
				</h3>
				<span
					class="mfw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{size} reclaimable / {clusters} cluster(s) / {bloat} bloat risk', {
						size: report.summary.safeReclaimFormatted,
						clusters: report.summary.totalClusters,
						bloat: report.summary.bloatAlertCount,
					}) }}
				</span>
			</div>

			<div class="mfw__toolbar-actions">
				<button
					type="button"
					class="mfw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportQuarantineScript">
					<span>{{ t('duplicatefinder', 'Export Quarantine Script') }}</span>
				</button>
				<button
					type="button"
					class="mfw__tool-btn"
					:disabled="sourcePoolEmpty || isDeleting"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="mfw__tool-btn"
					:disabled="report.items.length === 0 || isDeleting"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="mfw__tool-btn is-close"
					aria-keyshortcuts="%"
					:title="t('duplicatefinder', 'Hide media fidelity ranker')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Fidelity') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="mfw__empty">
			<p class="mfw__empty-title">
				{{ t('duplicatefinder', 'No duplicate media loaded yet') }}
			</p>
			<p class="mfw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to rank RAW/DNG/TIFF, FLAC/WAV, ProRes/MKV, and editable document masters against lossy transcodes and bloated upscales.') }}
			</p>
			<button
				type="button"
				class="mfw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="mfw__controls">
				<div class="mfw__control-row">
					<span class="mfw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mfw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Inspection scope')">
						<button
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>

					<span class="mfw__control-label">{{ t('duplicatefinder', 'Guardrails') }}</span>
					<div
						class="mfw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Master preservation guardrails')">
						<button
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': protectLastMaster }"
							:aria-pressed="protectLastMaster ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="protectLastMaster = !protectLastMaster">
							<span>{{ t('duplicatefinder', 'Protect higher-tier master') }}</span>
						</button>
						<button
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': holdLossyOnly }"
							:aria-pressed="holdLossyOnly ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="holdLossyOnly = !holdLossyOnly">
							<span>{{ t('duplicatefinder', 'Hold lossy-only clusters') }}</span>
						</button>
						<button
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': flagFakeLosslessBloat }"
							:aria-pressed="flagFakeLosslessBloat ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="flagFakeLosslessBloat = !flagFakeLosslessBloat">
							<span>{{ t('duplicatefinder', 'Flag fake-lossless bloat') }}</span>
						</button>
					</div>
				</div>

				<div class="mfw__control-row">
					<span class="mfw__control-label">{{ t('duplicatefinder', 'Family') }}</span>
					<div
						class="mfw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Media family filter')">
						<button
							v-for="fam in familyOptions"
							:key="fam.id"
							type="button"
							class="mfw__seg-btn"
							:class="{ 'is-active': familyFilter === fam.id }"
							:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="familyFilter = fam.id">
							<span>{{ fam.label }}</span>
						</button>
					</div>

					<label class="mfw__field">
						<span class="mfw__field-label">{{ t('duplicatefinder', 'Keep Rule') }}</span>
						<select
							v-model="keepRule"
							class="mfw__select"
							:disabled="isDeleting">
							<option value="true_master">{{ t('duplicatefinder', 'True Master (Codec + Res + Meta)') }}</option>
							<option value="highest_resolution">{{ t('duplicatefinder', 'Highest Resolution / Bitrate') }}</option>
							<option value="most_metadata">{{ t('duplicatefinder', 'Richest EXIF / ID3 / XMP') }}</option>
							<option value="editable_source">{{ t('duplicatefinder', 'Editable / RAW Source') }}</option>
							<option value="oldest">{{ t('duplicatefinder', 'Oldest Capture Timestamp') }}</option>
						</select>
					</label>
				</div>

				<div class="mfw__control-row mfw__search-row">
					<label class="mfw__field mfw__search-field">
						<span class="mfw__field-label">{{ t('duplicatefinder', 'Search') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="mfw__input"
							:placeholder="t('duplicatefinder', 'Filter by filename, codec, folder, or owner...')"
							:disabled="isDeleting">
					</label>

					<label class="mfw__field">
						<span class="mfw__field-label">{{ t('duplicatefinder', 'Min Loss (%)') }}</span>
						<input
							v-model="minLossInput"
							type="text"
							inputmode="numeric"
							class="mfw__input mfw__num-input"
							:placeholder="t('duplicatefinder', '0')"
							:aria-label="t('duplicatefinder', 'Minimum transcode loss percentage')"
							:disabled="isDeleting">
					</label>

					<label class="mfw__field">
						<span class="mfw__field-label">{{ t('duplicatefinder', 'Min Reclaim (KB)') }}</span>
						<input
							v-model="minSizeKbInput"
							type="text"
							inputmode="numeric"
							class="mfw__input mfw__num-input"
							:placeholder="t('duplicatefinder', '0')"
							:aria-label="t('duplicatefinder', 'Minimum reclaimable kilobytes')"
							:disabled="isDeleting">
					</label>

					<label class="mfw__field">
						<span class="mfw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortMode"
							class="mfw__select"
							:disabled="isDeleting">
							<option value="reclaim_desc">{{ t('duplicatefinder', 'Largest reclaim first') }}</option>
							<option value="loss_gap_desc">{{ t('duplicatefinder', 'Highest transcode loss') }}</option>
							<option value="bloat_first">{{ t('duplicatefinder', 'Bloated upscales first') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Name A-Z') }}</option>
						</select>
					</label>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="mfw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div
				v-if="globalSafeSelection.files.length > 0"
				class="mfw__global-bar">
				<span class="mfw__global-bar-text">
					{{ t('duplicatefinder', '{count} degraded transcode(s) ({size}) cleared for purge ({skipped} protected/master kept).', {
						count: globalSafeSelection.files.length,
						size: globalSafeSelection.totalFormatted,
						skipped: globalSafeSelection.skippedProtectedCount,
					}) }}
				</span>
				<button
					type="button"
					class="mfw__primary-btn is-danger"
					:disabled="isDeleting"
					@click="openBatchDeleteDialog(null)">
					<span>{{ t('duplicatefinder', 'Purge {count} Degraded Copies', { count: globalSafeSelection.files.length }) }}</span>
				</button>
			</div>

			<div
				v-if="report.items.length === 0"
				class="mfw__no-matches">
				<p>{{ t('duplicatefinder', 'No cross-format or transcode media clusters match the active filters.') }}</p>
				<button
					type="button"
					class="mfw__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
				</button>
			</div>

			<div
				v-else
				class="mfw__workspace">
				<div
					class="mfw__cluster-list"
					role="list"
					:aria-label="t('duplicatefinder', 'Media fidelity clusters')">
					<button
						v-for="item in visibleItems"
						:key="item.clusterKey"
						type="button"
						class="mfw__cluster-card"
						:class="[
							`is-verdict-${item.topVerdict}`,
							{ 'is-selected': activeItem && activeItem.clusterKey === item.clusterKey },
						]"
						:aria-current="activeItem && activeItem.clusterKey === item.clusterKey ? 'true' : 'false'"
						@click="selectedClusterKey = item.clusterKey">
						<div class="mfw__cluster-card-top">
							<span
								class="mfw__verdict-pill"
								:class="`is-${item.topVerdict}`">
								{{ formatTopVerdict(item.topVerdict) }}
							</span>
							<span class="mfw__cluster-size">{{ item.safeReclaimFormatted }}</span>
						</div>
						<div class="mfw__cluster-name">
							{{ item.primaryName }}
						</div>
						<div class="mfw__cluster-path">
							{{ item.primaryPath }}
						</div>
						<div class="mfw__cluster-meta">
							<span>{{ formatFamilyLabel(item.family) }} / {{ t('duplicatefinder', 'Master {score}/100', { score: item.masterEntry.scoring.fidelityScore }) }}</span>
							<span>{{ t('duplicatefinder', 'Max loss -{loss}% ({count} copies)', {
								loss: item.maxLossPct,
								count: item.entries.length,
							}) }}</span>
						</div>
					</button>

					<div
						v-if="report.items.length > visibleLimit"
						class="mfw__load-more-wrap">
						<button
							type="button"
							class="mfw__tool-btn"
							@click="visibleLimit += 20">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: report.items.length - visibleLimit }) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="activeItem"
					class="mfw__detail-panel"
					role="region"
					:aria-label="t('duplicatefinder', 'Selected media fidelity cluster detail')">
					<div class="mfw__detail-header">
						<div class="mfw__detail-heading">
							<h4 class="mfw__detail-title">
								{{ activeItem.primaryName }}
							</h4>
							<p class="mfw__detail-sub">
								{{ t('duplicatefinder', '{family} cluster: Master {masterScore}/100, max transcode loss -{loss}%, {safeCount} purgeable ({safeBytes})', {
									family: formatFamilyLabel(activeItem.family),
									masterScore: activeItem.masterEntry.scoring.fidelityScore,
									loss: activeItem.maxLossPct,
									safeCount: activeItem.quarantineEntries.length,
									safeBytes: activeItem.safeReclaimFormatted,
								}) }}
							</p>
						</div>
						<div class="mfw__detail-actions">
							<button
								type="button"
								class="mfw__tool-btn"
								:disabled="isDeleting"
								@click="$emit('select-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								type="button"
								class="mfw__tool-btn"
								:disabled="isDeleting"
								@click="$emit('compare-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
							<button
								v-if="activeItem.quarantineEntries.length > 0"
								type="button"
								class="mfw__primary-btn is-danger"
								:disabled="isDeleting"
								@click="openBatchDeleteDialog(activeItem.clusterKey)">
								<span>{{ t('duplicatefinder', 'Purge {count} Degraded', { count: activeItem.quarantineEntries.length }) }}</span>
							</button>
						</div>
					</div>

					<div
						class="mfw__master-banner"
						:class="activeItem.hasLosslessMaster ? 'is-lossless' : 'is-lossy-only'">
						<strong>
							{{ activeItem.hasLosslessMaster
								? t('duplicatefinder', 'Verified Master Survivor:')
								: t('duplicatefinder', 'Lossy-Only Cluster Warning (No RAW/Lossless Master):') }}
						</strong>
						<span>
							{{ activeItem.masterEntry.normalizedPath }} ({{ activeItem.masterEntry.codecProfile.codecLabel }}, {{ activeItem.masterEntry.scoring.fidelityScore }}/100)
						</span>
					</div>

					<div class="mfw__entries-list">
						<article
							v-for="entry in activeItem.entries"
							:key="`${entry.selectionKey}::${entry.normalizedPath}`"
							class="mfw__entry-card"
							:class="`is-verdict-${entry.decision.actionVerdict}`">
							<div class="mfw__entry-top">
								<div class="mfw__entry-badges">
									<span
										class="mfw__verdict-pill"
										:class="`is-${entry.decision.actionVerdict}`">
										{{ entry.decision.verdictLabel }}
									</span>
									<span class="mfw__kind-pill">
										{{ entry.codecProfile.codecLabel }}
									</span>
									<span
										class="mfw__grade-pill"
										:class="`is-grade-${entry.scoring.grade}`">
										{{ formatGrade(entry.scoring.grade) }}
									</span>
								</div>
								<span class="mfw__entry-size">{{ entry.sizeFormatted }}</span>
							</div>

							<div class="mfw__entry-path">
								{{ entry.normalizedPath }}
							</div>

							<div class="mfw__score-row">
								<div class="mfw__score-bar-wrap">
									<div
										class="mfw__score-bar-track"
										role="progressbar"
										:aria-valuenow="entry.scoring.fidelityScore"
										aria-valuemin="0"
										aria-valuemax="100"
										:aria-label="t('duplicatefinder', 'Fidelity score')">
										<div
											class="mfw__score-bar-fill"
											:class="entry.isMaster ? 'is-master' : (entry.scoring.isBloatedUpscale ? 'is-bloat' : 'is-lossy')"
											:style="{ width: `${entry.scoring.fidelityScore}%` }" />
									</div>
									<span class="mfw__score-label">
										{{ t('duplicatefinder', 'Score {score}/100 ({loss})', {
											score: entry.scoring.fidelityScore,
											loss: entry.isMaster ? 'Master' : `-${entry.transcodeLossPct}% loss`,
										}) }}
									</span>
								</div>
							</div>

							<div class="mfw__breakdown-grid">
								<div class="mfw__breakdown-cell">
									<span class="mfw__breakdown-key">{{ t('duplicatefinder', 'Codec') }}</span>
									<span class="mfw__breakdown-val">+{{ entry.scoring.breakdown.codecScore }}</span>
								</div>
								<div class="mfw__breakdown-cell">
									<span class="mfw__breakdown-key">{{ t('duplicatefinder', 'Res / Bitrate') }}</span>
									<span class="mfw__breakdown-val">+{{ entry.scoring.breakdown.resolutionBitrateScore }}</span>
								</div>
								<div class="mfw__breakdown-cell">
									<span class="mfw__breakdown-key">{{ t('duplicatefinder', 'Metadata') }}</span>
									<span class="mfw__breakdown-val">+{{ entry.scoring.breakdown.metadataCompletenessScore }}</span>
								</div>
								<div class="mfw__breakdown-cell">
									<span class="mfw__breakdown-key">{{ t('duplicatefinder', 'Lineage') }}</span>
									<span class="mfw__breakdown-val">{{ entry.scoring.breakdown.lineageAdjustment >= 0 ? `+${entry.scoring.breakdown.lineageAdjustment}` : entry.scoring.breakdown.lineageAdjustment }}</span>
								</div>
							</div>

							<div class="mfw__telemetry-tags">
								<span class="mfw__tag">{{ t('duplicatefinder', 'Owner: {owner}', { owner: entry.owner }) }}</span>
								<span
									v-if="entry.telemetry.width > 0 && entry.telemetry.height > 0"
									class="mfw__tag">
									{{ `${entry.telemetry.width}x${entry.telemetry.height}` }}
								</span>
								<span
									v-if="entry.telemetry.bitDepth > 0"
									class="mfw__tag">
									{{ `${entry.telemetry.bitDepth}-bit` }}
								</span>
								<span
									v-if="entry.telemetry.sampleRate > 0"
									class="mfw__tag">
									{{ `${Math.round(entry.telemetry.sampleRate / 100) / 10} kHz` }}
								</span>
								<span
									v-if="entry.telemetry.bitrateKbps > 0"
									class="mfw__tag">
									{{ `${entry.telemetry.bitrateKbps} kbps` }}
								</span>
								<span
									v-if="entry.telemetry.hasExif"
									class="mfw__tag is-good">
									{{ entry.telemetry.cameraModel ? `EXIF (${entry.telemetry.cameraModel})` : 'EXIF' }}
								</span>
								<span
									v-if="entry.telemetry.hasId3"
									class="mfw__tag is-good">
									{{ t('duplicatefinder', 'ID3 / Tags') }}
								</span>
								<span
									v-if="entry.telemetry.isPdfA"
									class="mfw__tag is-good">
									{{ t('duplicatefinder', 'PDF/A') }}
								</span>
								<span
									v-if="entry.telemetry.isScanned"
									class="mfw__tag is-warn">
									{{ t('duplicatefinder', 'Scanned Raster') }}
								</span>
								<span
									v-if="entry.telemetry.probedFromBytes"
									class="mfw__tag is-good">
									{{ t('duplicatefinder', 'Header Probed') }}
								</span>
								<span
									v-if="entry.scoring.isBloatedUpscale"
									class="mfw__tag is-danger">
									{{ t('duplicatefinder', 'Bloated Upscale') }}
								</span>
								<span
									v-if="entry.protection.protectedOrigin"
									class="mfw__tag is-danger">
									{{ t('duplicatefinder', 'Origin Protected') }}
								</span>
								<span
									v-if="entry.protection.locked"
									class="mfw__tag is-danger">
									{{ t('duplicatefinder', 'Locked') }}
								</span>
								<span
									v-if="entry.protection.readOnly"
									class="mfw__tag is-warn">
									{{ t('duplicatefinder', 'Read-Only') }}
								</span>
							</div>

							<p class="mfw__entry-reason">
								{{ entry.decision.reason }}
							</p>
						</article>
					</div>

					<details class="mfw__script-box">
						<summary class="mfw__script-summary">
							<span>{{ t('duplicatefinder', 'DRY_RUN=1 Quarantine & OCC Rescan Script Preview') }}</span>
						</summary>
						<div class="mfw__script-controls">
							<label class="mfw__field">
								<span class="mfw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
								<input
									v-model="dataRootInput"
									type="text"
									class="mfw__input"
									:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')">
							</label>
							<button
								type="button"
								class="mfw__tool-btn"
								:disabled="!activeQuarantineScript"
								@click="copyActiveScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mfw__script-pre"><code>{{ activeQuarantineScript }}</code></pre>
					</details>
				</div>
			</div>
		</template>

		<dialog
			ref="confirmDialog"
			class="mfw__dialog"
			:aria-labelledby="dialogTitleId"
			@click="onDialogBackdropClick"
			@cancel.prevent="closeConfirmDialog">
			<div class="mfw__dialog-card">
				<h4
					:id="dialogTitleId"
					class="mfw__dialog-title">
					{{ t('duplicatefinder', 'Confirm Degraded Transcode Purge') }}
				</h4>
				<p class="mfw__dialog-body">
					{{ t('duplicatefinder', 'Delete {count} degraded/lossy copy(ies) reclaiming {size}? The highest-fidelity master in every cluster and {skipped} protected file(s) remain untouched.', {
						count: pendingSelection.files.length,
						size: pendingSelection.totalFormatted,
						skipped: pendingSelection.skippedProtectedCount,
					}) }}
				</p>
				<div class="mfw__dialog-actions">
					<button
						type="button"
						class="mfw__tool-btn"
						:disabled="isDeleting"
						@click="closeConfirmDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="mfw__primary-btn is-danger"
						:disabled="isDeleting || pendingSelection.files.length === 0"
						@click="confirmSafePurge">
						<span>{{ isDeleting ? t('duplicatefinder', 'Purging...') : t('duplicatefinder', 'Confirm Purge') }}</span>
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
	analyzeMediaFidelity,
	buildFidelityAuditCsv,
	buildFidelityJsonReport,
	buildFidelityQuarantineScript,
	collectSafeFidelitySelection,
	formatFidelityGrade,
} from '../tools/mediaFidelityRanker'

let dialogCounter = 0

export default {
	name: 'MediaFidelityWorkbench',
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
		dialogCounter += 1
		return {
			dialogTitleId: `mfw-dialog-title-${dialogCounter}`,
			scope: 'filtered',
			familyFilter: 'all',
			keepRule: 'true_master',
			sortMode: 'reclaim_desc',
			searchQuery: '',
			minLossInput: '',
			minSizeKbInput: '',
			protectLastMaster: true,
			holdLossyOnly: false,
			flagFakeLosslessBloat: true,
			selectedClusterKey: '',
			visibleLimit: 20,
			dataRootInput: '/var/www/nextcloud/data',
			pendingClusterKey: null,
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
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		sourceDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedMinLossPct() {
			const trimmed = String(this.minLossInput || '').trim()
			if (!trimmed) {
				return 0
			}
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return 0
			}
			return Math.min(100, Math.round(numeric))
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
		familyOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'image', label: this.t('duplicatefinder', 'Images') },
				{ id: 'audio', label: this.t('duplicatefinder', 'Audio') },
				{ id: 'video', label: this.t('duplicatefinder', 'Video') },
				{ id: 'document', label: this.t('duplicatefinder', 'Documents') },
				{ id: 'bloat-risk', label: this.t('duplicatefinder', 'Bloat Risk') },
			]
		},
		report() {
			return analyzeMediaFidelity(this.sourceDuplicates, {
				familyFilter: this.familyFilter,
				keepRule: this.keepRule,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				minLossPct: this.parsedMinLossPct,
				minSizeBytes: this.parsedMinSizeBytes,
				protectLastMaster: this.protectLastMaster,
				holdLossyOnly: this.holdLossyOnly,
				flagFakeLosslessBloat: this.flagFakeLosslessBloat,
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
			if (this.selectedClusterKey) {
				const found = items.find(item => item.clusterKey === this.selectedClusterKey)
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
			return collectSafeFidelitySelection(this.report)
		},
		pendingSelection() {
			return collectSafeFidelitySelection(this.report, {
				targetClusterKey: this.pendingClusterKey,
			})
		},
		activeQuarantineScript() {
			if (!this.activeItem) {
				return ''
			}
			return buildFidelityQuarantineScript(this.report, {
				dataRoot: this.dataRootInput,
				targetClusterKey: this.activeItem.clusterKey,
			})
		},
	},
	methods: {
		formatGrade(grade) {
			return formatFidelityGrade(grade)
		},
		formatFamilyLabel(family) {
			const map = {
				image: this.t('duplicatefinder', 'Image'),
				audio: this.t('duplicatefinder', 'Audio'),
				video: this.t('duplicatefinder', 'Video'),
				document: this.t('duplicatefinder', 'Document'),
			}
			return map[family] || family
		},
		formatTopVerdict(verdict) {
			const map = {
				'master-ready': this.t('duplicatefinder', 'Master Ready'),
				'bloat-alert': this.t('duplicatefinder', 'Bloat Alert'),
				'lossy-only': this.t('duplicatefinder', 'Lossy Only'),
				'protected-hold': this.t('duplicatefinder', 'Protected'),
			}
			return map[verdict] || verdict
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.keepRule = 'true_master'
			this.searchQuery = ''
			this.minLossInput = ''
			this.minSizeKbInput = ''
			this.sortMode = 'reclaim_desc'
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
		exportQuarantineScript() {
			const script = buildFidelityQuarantineScript(this.report, {
				dataRoot: this.dataRootInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-media-fidelity-quarantine.sh')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported DRY_RUN=1 quarantine and OCC rescan script.')
		},
		exportJsonReport() {
			const json = buildFidelityJsonReport(this.report)
			this.triggerDownload(json, 'application/json;charset=utf-8', 'duplicatefinder-media-fidelity-audit.json')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported media fidelity JSON audit certificate.')
		},
		exportCsvLedger() {
			const csv = buildFidelityAuditCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-media-fidelity-ledger.csv')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe media fidelity CSV ledger.')
		},
		async copyActiveScript() {
			if (!this.activeQuarantineScript) {
				return
			}
			const ok = await copyTextSafely(this.activeQuarantineScript)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied DRY_RUN=1 quarantine script for active cluster.')
				: this.t('duplicatefinder', 'Could not copy quarantine script to clipboard.')
		},
		openBatchDeleteDialog(clusterKey) {
			this.pendingClusterKey = clusterKey || null
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
			this.pendingClusterKey = null
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
					this.statusNotice = this.t('duplicatefinder', 'Could not purge the selected degraded copies.')
				} else {
					this.statusNoticeType = 'success'
					this.statusNotice = this.t('duplicatefinder', 'Purged {count} degraded copy(ies); masters preserved.', { count: deletedCount })
					this.$emit('fidelity-delete-completed', {
						deletedFiles,
						deletedNodeIds: Array.isArray(response && response.deletedNodeIds) ? response.deletedNodeIds : [],
						deletedCount,
						failedCount: failedList.length,
						bytesReclaimed: selection.totalBytes,
						source: 'media-fidelity-ranker',
					})
				}
			} catch (_error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Degraded media purge failed.')
			} finally {
				this.isDeleting = false
				this.closeConfirmDialog()
			}
		},
	},
}
</script>

<style scoped>
.media-fidelity-workbench {
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

.media-fidelity-workbench *,
.media-fidelity-workbench *::before,
.media-fidelity-workbench *::after {
	box-sizing: border-box;
}

.mfw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.mfw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mfw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.mfw__status-badge {
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

.mfw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.mfw__tool-btn,
.mfw__seg-btn,
.mfw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.88rem;
	font-weight: 600;
	cursor: pointer;
}

.mfw__tool-btn:hover:not(:disabled),
.mfw__seg-btn:hover:not(:disabled),
.mfw__primary-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.mfw__tool-btn:focus-visible,
.mfw__seg-btn:focus-visible,
.mfw__primary-btn:focus-visible,
.mfw__input:focus-visible,
.mfw__select:focus-visible,
.mfw__cluster-card:focus-visible,
.mfw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mfw__tool-btn:disabled,
.mfw__seg-btn:disabled,
.mfw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mfw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mfw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element);
}

.mfw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.mfw__primary-btn.is-danger {
	background-color: #b42318;
	border-color: #b42318;
	color: #fff;
}

.mfw__primary-btn.is-danger:hover:not(:disabled) {
	background-color: #911b12;
	border-color: #911b12;
}

.mfw__empty,
.mfw__no-matches {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding: 18px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.mfw__empty-title {
	margin: 0;
	font-weight: 700;
}

.mfw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.mfw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.mfw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.mfw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.mfw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mfw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.mfw__search-field {
	flex: 1 1 220px;
}

.mfw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mfw__input,
.mfw__select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.9rem;
	max-inline-size: 100%;
}

.mfw__num-input {
	inline-size: 120px;
}

.mfw__notice {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-weight: 600;
}

.mfw__notice.is-success {
	border-color: #1c7c45;
	background-color: #e9f7ef;
	color: #0f5132;
}

.mfw__notice.is-error {
	border-color: #b42318;
	background-color: #fdecea;
	color: #7a1c15;
}

.mfw__global-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.mfw__global-bar-text {
	font-weight: 600;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.mfw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.mfw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.mfw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mfw__cluster-card {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 6px;
	text-align: start;
	min-block-size: 44px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	max-inline-size: 100%;
}

.mfw__cluster-card:hover {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.mfw__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	box-shadow: inset 3px 0 0 var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mfw__cluster-card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mfw__cluster-size {
	font-weight: 700;
	font-size: 0.85rem;
}

.mfw__cluster-name {
	font-weight: 700;
	font-size: 0.94rem;
	overflow-wrap: anywhere;
}

.mfw__cluster-path {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mfw__cluster-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.mfw__verdict-pill,
.mfw__kind-pill,
.mfw__grade-pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	border: 1px solid transparent;
}

.mfw__verdict-pill.is-master-ready,
.mfw__verdict-pill.is-keep-master {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.mfw__verdict-pill.is-bloat-alert,
.mfw__verdict-pill.is-review-bloat,
.mfw__verdict-pill.is-quarantine-lossy {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.mfw__verdict-pill.is-lossy-only,
.mfw__verdict-pill.is-protected-hold {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.mfw__kind-pill {
	background-color: var(--color-background-hover);
	border-color: var(--color-border);
	color: var(--color-main-text);
}

.mfw__grade-pill {
	background-color: var(--color-background-hover);
	border-color: var(--color-border);
	color: var(--color-text-maxcontrast);
}

.mfw__grade-pill.is-grade-master-lossless {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.mfw__grade-pill.is-grade-bloated-upscale {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.mfw__detail-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mfw__detail-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.mfw__detail-heading {
	min-inline-size: 0;
}

.mfw__detail-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mfw__detail-sub {
	margin: 4px 0 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
}

.mfw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mfw__master-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	font-size: 0.86rem;
	overflow-wrap: anywhere;
}

.mfw__master-banner.is-lossless {
	background-color: #e7f6ec;
	border-color: #9dd6b4;
	color: #0f5132;
}

.mfw__master-banner.is-lossy-only {
	background-color: #fff4e5;
	border-color: #f5c97b;
	color: #7c4a03;
}

.mfw__entries-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.mfw__entry-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.mfw__entry-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mfw__entry-badges {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.mfw__entry-size {
	font-weight: 700;
	font-size: 0.88rem;
}

.mfw__entry-path {
	font-family: monospace;
	font-size: 0.82rem;
	overflow-wrap: anywhere;
}

.mfw__score-row {
	display: flex;
	align-items: center;
	gap: 8px;
}

.mfw__score-bar-wrap {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	inline-size: 100%;
}

.mfw__score-bar-track {
	flex: 1 1 140px;
	block-size: 10px;
	border-radius: 999px;
	background-color: var(--color-border);
	overflow: hidden;
}

.mfw__score-bar-fill {
	block-size: 100%;
	border-radius: 999px;
}

.mfw__score-bar-fill.is-master {
	background-color: #198754;
}

.mfw__score-bar-fill.is-lossy {
	background-color: #d97706;
}

.mfw__score-bar-fill.is-bloat {
	background-color: #b42318;
}

.mfw__score-label {
	font-size: 0.8rem;
	font-weight: 700;
}

.mfw__breakdown-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 6px;
}

@media (min-width: 640px) {
	.mfw__breakdown-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.mfw__breakdown-cell {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 4px;
	padding: 6px 8px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background-color: var(--color-main-background);
	font-size: 0.78rem;
}

.mfw__breakdown-key {
	color: var(--color-text-maxcontrast);
}

.mfw__breakdown-val {
	font-weight: 700;
}

.mfw__telemetry-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.mfw__tag {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.76rem;
}

.mfw__tag.is-good {
	border-color: #9dd6b4;
	background-color: #e7f6ec;
	color: #0f5132;
}

.mfw__tag.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.mfw__tag.is-danger {
	border-color: #f1aeb5;
	background-color: #fdecea;
	color: #842029;
}

.mfw__entry-reason {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 72ch;
}

.mfw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 10px 12px;
	background-color: var(--color-background-hover);
}

.mfw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	cursor: pointer;
}

.mfw__script-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
	margin-block: 10px;
}

.mfw__script-pre {
	margin: 0;
	padding: 10px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.78rem;
	overflow-x: auto;
	max-block-size: 260px;
}

.mfw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}

.mfw__dialog {
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	max-inline-size: min(480px, calc(100vw - 32px));
}

.mfw__dialog::backdrop {
	background-color: rgb(0 0 0 / 55%);
}

.mfw__dialog-card {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 18px;
}

.mfw__dialog-title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.mfw__dialog-body {
	margin: 0;
	font-size: 0.92rem;
	line-height: 1.45;
}

.mfw__dialog-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}
</style>
