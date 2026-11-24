<template>
	<section
		class="cdc-chunking-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Content-Defined Chunking (CDC) and Sub-File Savings Estimator')">
		<header class="ccw__toolbar">
			<div class="ccw__title-group">
				<h3 class="ccw__title">
					{{ t('duplicatefinder', 'CDC / ZFS / Restic Sub-File Savings Estimator') }}
				</h3>
				<span
					class="ccw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{saved} FastCDC net / {ratio}x / {clusters} cluster(s)', {
						saved: report.summary.cdcNetSavedFormatted,
						ratio: report.summary.cdcRatio,
						clusters: report.summary.totalClusters,
					}) }}
				</span>
			</div>

			<div class="ccw__toolbar-actions">
				<button
					type="button"
					class="ccw__tool-btn is-primary-outline"
					:disabled="sourcePoolEmpty"
					@click="exportVerificationScript">
					<span>{{ t('duplicatefinder', 'Export Runbook (.sh)') }}</span>
				</button>
				<button
					type="button"
					class="ccw__tool-btn"
					:disabled="sourcePoolEmpty"
					@click="exportJsonReport">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="ccw__tool-btn"
					:disabled="report.items.length === 0"
					@click="exportCsvLedger">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="ccw__tool-btn is-close"
					aria-keyshortcuts="#"
					:title="t('duplicatefinder', 'Hide CDC sub-file estimator')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide CDC') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="sourcePoolEmpty"
			class="ccw__empty">
			<p class="ccw__empty-title">
				{{ t('duplicatefinder', 'No duplicate or large-asset scan data loaded yet') }}
			</p>
			<p class="ccw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to model FastCDC variable-block vs fixed-block vs whole-file deduplication across VM images, ISOs, SQLite dumps, and Maildir archives.') }}
			</p>
			<button
				type="button"
				class="ccw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="ccw__controls">
				<div class="ccw__control-row">
					<span class="ccw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ccw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Estimation scope')">
						<button
							type="button"
							class="ccw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ccw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>

					<span class="ccw__control-label">{{ t('duplicatefinder', 'Backend') }}</span>
					<div
						class="ccw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Storage deduplication backend')">
						<button
							v-for="backend in backendOptions"
							:key="backend.id"
							type="button"
							class="ccw__seg-btn"
							:class="{ 'is-active': backendId === backend.id }"
							:aria-pressed="backendId === backend.id ? 'true' : 'false'"
							@click="selectBackend(backend.id)">
							<span>{{ backend.shortLabel }}</span>
						</button>
					</div>
				</div>

				<div class="ccw__control-row">
					<span class="ccw__control-label">{{ t('duplicatefinder', 'Workload') }}</span>
					<div
						class="ccw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Workload class filter')">
						<button
							v-for="w in workloadOptions"
							:key="w.id"
							type="button"
							class="ccw__seg-btn"
							:class="{ 'is-active': workloadFilter === w.id }"
							:aria-pressed="workloadFilter === w.id ? 'true' : 'false'"
							@click="workloadFilter = w.id">
							<span>{{ w.label }}</span>
						</button>
					</div>
				</div>

				<div class="ccw__control-row ccw__inputs-row">
					<label class="ccw__field ccw__search-field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'Search') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="ccw__input"
							:placeholder="t('duplicatefinder', 'Filter by filename, extension, or path...')">
					</label>

					<label class="ccw__field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'Avg CDC Chunk') }}</span>
						<select
							v-model.number="avgChunkBytes"
							class="ccw__select">
							<option
								v-for="opt in avgChunkOptions"
								:key="opt.bytes"
								:value="opt.bytes">
								{{ opt.label }}
							</option>
						</select>
					</label>

					<label class="ccw__field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'Fixed Block') }}</span>
						<select
							v-model.number="fixedBlockBytes"
							class="ccw__select">
							<option
								v-for="opt in fixedBlockOptions"
								:key="opt.bytes"
								:value="opt.bytes">
								{{ opt.label }}
							</option>
						</select>
					</label>

					<label class="ccw__field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'DDT RAM (GiB)') }}</span>
						<input
							v-model="ddtRamBudgetInput"
							type="text"
							inputmode="numeric"
							class="ccw__input ccw__num-input"
							:placeholder="t('duplicatefinder', '16')"
							:aria-label="t('duplicatefinder', 'ZFS DDT RAM budget in GiB')">
					</label>

					<label class="ccw__field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
						<input
							v-model="minSizeMbInput"
							type="text"
							inputmode="numeric"
							class="ccw__input ccw__num-input"
							:placeholder="t('duplicatefinder', '0')"
							:aria-label="t('duplicatefinder', 'Minimum file size in megabytes')">
					</label>

					<label class="ccw__field">
						<span class="ccw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortMode"
							class="ccw__select">
							<option value="cdc_reclaim_desc">{{ t('duplicatefinder', 'Largest FastCDC savings') }}</option>
							<option value="cdc_gain_over_file_desc">{{ t('duplicatefinder', 'Highest gain over file dedup') }}</option>
							<option value="ratio_desc">{{ t('duplicatefinder', 'Highest dedup ratio') }}</option>
							<option value="ddt_ram_desc">{{ t('duplicatefinder', 'Highest ZFS DDT RAM') }}</option>
							<option value="name_asc">{{ t('duplicatefinder', 'Name A-Z') }}</option>
						</select>
					</label>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="ccw__notice"
				:class="`is-${statusNoticeType}`"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div class="ccw__summary-deck">
				<article class="ccw__kpi-card">
					<span class="ccw__kpi-label">{{ t('duplicatefinder', 'Logical Footprint') }}</span>
					<strong class="ccw__kpi-val">{{ report.summary.logicalFormatted }}</strong>
					<span class="ccw__kpi-sub">
						{{ t('duplicatefinder', '{files} file(s) across {clusters} cluster(s)', {
							files: report.summary.totalFiles,
							clusters: report.summary.totalClusters,
						}) }}
					</span>
				</article>
				<article class="ccw__kpi-card">
					<span class="ccw__kpi-label">{{ t('duplicatefinder', 'Whole-File Dedup') }}</span>
					<strong class="ccw__kpi-val">{{ report.summary.fileLevelSavedFormatted }}</strong>
					<span class="ccw__kpi-sub">
						{{ t('duplicatefinder', '{ratio}x ratio (exact hash)', { ratio: report.summary.fileLevelRatio }) }}
					</span>
				</article>
				<article class="ccw__kpi-card">
					<span class="ccw__kpi-label">{{ t('duplicatefinder', 'Fixed-Block Baseline') }}</span>
					<strong class="ccw__kpi-val">{{ report.summary.fixedBlockSavedFormatted }}</strong>
					<span class="ccw__kpi-sub">
						{{ t('duplicatefinder', '{ratio}x ratio (shift-sensitive)', { ratio: report.summary.fixedBlockRatio }) }}
					</span>
				</article>
				<article class="ccw__kpi-card is-highlight">
					<span class="ccw__kpi-label">{{ t('duplicatefinder', 'FastCDC Net Reclaim') }}</span>
					<strong class="ccw__kpi-val">{{ report.summary.cdcNetSavedFormatted }}</strong>
					<span class="ccw__kpi-sub">
						{{ t('duplicatefinder', '{ratio}x ratio / +{gain} vs file', {
							ratio: report.summary.cdcRatio,
							gain: report.summary.cdcGainOverFileFormatted,
						}) }}
					</span>
				</article>
			</div>

			<div
				class="ccw__telemetry-strip"
				:class="{ 'is-warn': report.summary.ddtBudgetExceeded || report.summary.compressedTrapCount > 0 }">
				<span>
					{{ t('duplicatefinder', 'Unique chunks: {unique} / {total} (Index: {idx})', {
						unique: report.summary.uniqueCdcChunks,
						total: report.summary.totalCdcChunks,
						idx: report.summary.indexOverheadFormatted,
					}) }}
				</span>
				<span>
					{{ t('duplicatefinder', 'ZFS DDT RAM: {ram} ({pct}% of {budget} GiB)', {
						ram: report.summary.ddtRamFormatted,
						pct: report.summary.ddtBudgetUtilizationPct,
						budget: report.ddtRamBudgetGb,
					}) }}
				</span>
				<span>
					{{ t('duplicatefinder', 'S3 PUT / Egress Cut: {pct}%', { pct: report.summary.s3PutReductionPct }) }}
				</span>
				<span
					v-if="report.summary.compressedTrapCount > 0"
					class="ccw__tag is-warn">
					{{ t('duplicatefinder', '{count} compressed trap(s)', { count: report.summary.compressedTrapCount }) }}
				</span>
				<span
					v-if="report.summary.ddtBudgetExceeded"
					class="ccw__tag is-danger">
					{{ t('duplicatefinder', 'DDT exceeds RAM budget') }}
				</span>
			</div>

			<details class="ccw__probe-box">
				<summary class="ccw__probe-summary">
					<span>{{ t('duplicatefinder', 'Live Gear-Hash FastCDC vs Fixed-Block Byte-Shift Lab') }}</span>
				</summary>
				<div class="ccw__probe-body">
					<div class="ccw__probe-controls">
						<label class="ccw__field">
							<span class="ccw__field-label">{{ t('duplicatefinder', 'Prepend Header Shift (bytes)') }}</span>
							<input
								v-model="shiftBytesInput"
								type="text"
								inputmode="numeric"
								class="ccw__input ccw__num-input"
								:placeholder="t('duplicatefinder', '64')"
								:aria-label="t('duplicatefinder', 'Header shift bytes for FastCDC probe')">
						</label>
						<p class="ccw__probe-note">
							{{ t('duplicatefinder', 'Simulates prepending {shift} byte(s) + 256B mid-file WAL patch to a 64 KiB binary image.', { shift: parsedShiftBytes }) }}
						</p>
					</div>
					<div class="ccw__probe-metrics">
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'Fixed-Block Reuse') }}</span>
							<span class="ccw__breakdown-val">{{ shiftProbe.fixed.reusePct }}% ({{ shiftProbe.fixed.dedupRatio }}x)</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'FastCDC Reuse') }}</span>
							<span class="ccw__breakdown-val">{{ shiftProbe.fastcdc.reusePct }}% ({{ shiftProbe.fastcdc.dedupRatio }}x)</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'CDC Advantage') }}</span>
							<span class="ccw__breakdown-val">+{{ shiftProbe.cdcAdvantagePct }}%</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'Zero Chunks') }}</span>
							<span class="ccw__breakdown-val">{{ shiftProbe.fastcdc.zeroChunks }}</span>
						</div>
					</div>
				</div>
			</details>

			<div
				v-if="report.items.length === 0"
				class="ccw__no-matches">
				<p>{{ t('duplicatefinder', 'No storage clusters match the active CDC filters.') }}</p>
				<button
					type="button"
					class="ccw__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
				</button>
			</div>

			<div
				v-else
				class="ccw__workspace">
				<div
					class="ccw__cluster-list"
					role="list"
					:aria-label="t('duplicatefinder', 'CDC workload clusters')">
					<button
						v-for="item in visibleItems"
						:key="item.clusterKey"
						type="button"
						class="ccw__cluster-card"
						:class="[
							`is-verdict-${item.verdict}`,
							{ 'is-selected': activeItem && activeItem.clusterKey === item.clusterKey },
						]"
						:aria-current="activeItem && activeItem.clusterKey === item.clusterKey ? 'true' : 'false'"
						@click="selectedClusterKey = item.clusterKey">
						<div class="ccw__cluster-card-top">
							<span
								class="ccw__verdict-pill"
								:class="`is-${item.verdict}`">
								{{ formatVerdict(item.verdict) }}
							</span>
							<span class="ccw__cluster-size">{{ item.cdcNetSavedFormatted }}</span>
						</div>
						<div class="ccw__cluster-name">
							{{ item.primaryName }}
						</div>
						<div class="ccw__cluster-path">
							{{ item.primaryPath }}
						</div>
						<div class="ccw__cluster-meta">
							<span>{{ item.workloadLabel }} / {{ item.cdcRatio }}x</span>
							<span>{{ t('duplicatefinder', '{count} file(s) / {chunks} unique chunks', {
								count: item.fileCount,
								chunks: item.cdcUniqueChunks,
							}) }}</span>
						</div>
					</button>

					<div
						v-if="report.items.length > visibleLimit"
						class="ccw__load-more-wrap">
						<button
							type="button"
							class="ccw__tool-btn"
							@click="visibleLimit += 20">
							<span>{{ t('duplicatefinder', 'Show more ({remaining} remaining)', { remaining: report.items.length - visibleLimit }) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="activeItem"
					class="ccw__detail-panel"
					role="region"
					:aria-label="t('duplicatefinder', 'Selected CDC cluster breakdown')">
					<div class="ccw__detail-header">
						<div class="ccw__detail-heading">
							<h4 class="ccw__detail-title">
								{{ activeItem.primaryName }}
							</h4>
							<p class="ccw__detail-sub">
								{{ t('duplicatefinder', '{workload} / {logical} logical / {files} file(s)', {
									workload: activeItem.workloadLabel,
									logical: activeItem.logicalFormatted,
									files: activeItem.fileCount,
								}) }}
							</p>
						</div>
						<div class="ccw__detail-actions">
							<button
								v-if="activeItem.rawGroup"
								type="button"
								class="ccw__tool-btn"
								@click="$emit('select-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Inspect') }}</span>
							</button>
							<button
								v-if="activeItem.rawGroup && activeItem.rawGroup.files && activeItem.rawGroup.files.length > 1"
								type="button"
								class="ccw__tool-btn"
								@click="$emit('compare-duplicate', activeItem.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</div>

					<div class="ccw__bars-panel">
						<div class="ccw__bar-row">
							<div class="ccw__bar-meta">
								<span>{{ t('duplicatefinder', 'Whole-File Dedup') }}</span>
								<strong>{{ activeItem.fileLevelSavedFormatted }} ({{ activeItem.fileLevelRatio }}x)</strong>
							</div>
							<div class="ccw__bar-track">
								<div
									class="ccw__bar-fill is-file"
									:style="{ width: `${percentOfLogical(activeItem.fileLevelSavedBytes, activeItem.logicalBytes)}%` }" />
							</div>
						</div>
						<div class="ccw__bar-row">
							<div class="ccw__bar-meta">
								<span>{{ t('duplicatefinder', 'Fixed-Block ({size})', { size: formatBytesHelper(activeItem.fixedBlockBytes) }) }}</span>
								<strong>{{ activeItem.fixedSavedFormatted }} ({{ activeItem.fixedRatio }}x)</strong>
							</div>
							<div class="ccw__bar-track">
								<div
									class="ccw__bar-fill is-fixed"
									:style="{ width: `${percentOfLogical(activeItem.fixedSavedBytes, activeItem.logicalBytes)}%` }" />
							</div>
						</div>
						<div class="ccw__bar-row">
							<div class="ccw__bar-meta">
								<span>{{ t('duplicatefinder', 'FastCDC Net ({size})', { size: formatBytesHelper(activeItem.avgChunkBytes) }) }}</span>
								<strong>{{ activeItem.cdcNetSavedFormatted }} ({{ activeItem.cdcRatio }}x)</strong>
							</div>
							<div class="ccw__bar-track">
								<div
									class="ccw__bar-fill is-cdc"
									:style="{ width: `${percentOfLogical(activeItem.cdcNetSavedBytes, activeItem.logicalBytes)}%` }" />
							</div>
						</div>
					</div>

					<div class="ccw__breakdown-grid">
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'Unique Chunks') }}</span>
							<span class="ccw__breakdown-val">{{ activeItem.cdcUniqueChunks }} / {{ activeItem.cdcTotalChunks }}</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'Index Overhead') }}</span>
							<span class="ccw__breakdown-val">{{ activeItem.indexOverheadFormatted }}</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'ZFS DDT RAM') }}</span>
							<span class="ccw__breakdown-val">{{ activeItem.ddtRamFormatted }}</span>
						</div>
						<div class="ccw__breakdown-cell">
							<span class="ccw__breakdown-key">{{ t('duplicatefinder', 'Zero / Sparse') }}</span>
							<span class="ccw__breakdown-val">{{ activeItem.zeroBlockFormatted }}</span>
						</div>
					</div>

					<div class="ccw__advisories">
						<p
							v-for="(adv, idx) in activeItem.advisories"
							:key="idx"
							class="ccw__advisory-line">
							{{ adv }}
						</p>
					</div>

					<div class="ccw__files-list">
						<article
							v-for="file in activeItem.files"
							:key="file.id"
							class="ccw__file-row">
							<div class="ccw__file-top">
								<span class="ccw__file-name">{{ file.name }}</span>
								<span class="ccw__file-size">{{ formatBytesHelper(file.size) }}</span>
							</div>
							<div class="ccw__file-path">
								{{ file.path }}
							</div>
						</article>
					</div>

					<details class="ccw__script-box">
						<summary class="ccw__script-summary">
							<span>{{ t('duplicatefinder', 'DRY_RUN=1 Verification Runbook (zdb -S / restic / duperemove)') }}</span>
						</summary>
						<div class="ccw__script-controls">
							<label class="ccw__field">
								<span class="ccw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
								<input
									v-model="dataRootInput"
									type="text"
									class="ccw__input"
									:placeholder="t('duplicatefinder', '/var/www/nextcloud/data')">
							</label>
							<label class="ccw__field">
								<span class="ccw__field-label">{{ t('duplicatefinder', 'ZFS Dataset') }}</span>
								<input
									v-model="zfsPoolInput"
									type="text"
									class="ccw__input"
									:placeholder="t('duplicatefinder', 'ncpool/data')">
							</label>
							<button
								type="button"
								class="ccw__tool-btn"
								:disabled="!runbookScript"
								@click="copyRunbookScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ccw__script-pre"><code>{{ runbookScript }}</code></pre>
					</details>
				</div>
			</div>
		</template>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	AVG_CHUNK_OPTIONS,
	CDC_BACKEND_PROFILES,
	FIXED_BLOCK_OPTIONS,
	buildCdcAuditCsv,
	buildCdcAuditJson,
	buildCdcSavingsReport,
	buildCdcVerificationScript,
	buildSyntheticShiftProbe,
} from '../tools/cdcChunkingEstimator'

export default {
	name: 'CdcChunkingWorkbench',
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
			backendId: 'restic_s3',
			avgChunkBytes: 1048576,
			fixedBlockBytes: 65536,
			ddtRamBudgetInput: '16',
			minSizeMbInput: '',
			shiftBytesInput: '64',
			workloadFilter: 'all',
			sortMode: 'cdc_reclaim_desc',
			searchQuery: '',
			selectedClusterKey: '',
			visibleLimit: 20,
			dataRootInput: '/var/www/nextcloud/data',
			zfsPoolInput: 'ncpool/data',
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
		backendOptions() {
			return [
				{ id: 'restic_s3', shortLabel: this.t('duplicatefinder', 'Restic / Borg') },
				{ id: 'zfs_dedup', shortLabel: this.t('duplicatefinder', 'ZFS Dedup') },
				{ id: 'btrfs_reflink', shortLabel: this.t('duplicatefinder', 'Btrfs / XFS') },
				{ id: 's3_cdc_gateway', shortLabel: this.t('duplicatefinder', 'S3 CDC') },
			]
		},
		workloadOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All') },
				{ id: 'vm_image', label: this.t('duplicatefinder', 'VM Images') },
				{ id: 'sqlite_db', label: this.t('duplicatefinder', 'SQLite / DB') },
				{ id: 'maildir_archive', label: this.t('duplicatefinder', 'Maildir / Tar / ISO') },
				{ id: 'compressed_trap', label: this.t('duplicatefinder', 'Compressed Traps') },
				{ id: 'exact_duplicate', label: this.t('duplicatefinder', 'Exact Dupes') },
			]
		},
		avgChunkOptions() {
			return AVG_CHUNK_OPTIONS.map(bytes => ({
				bytes,
				label: formatBytes(bytes),
			}))
		},
		fixedBlockOptions() {
			return FIXED_BLOCK_OPTIONS.map(bytes => ({
				bytes,
				label: formatBytes(bytes),
			}))
		},
		parsedDdtRamBudgetGb() {
			const trimmed = String(this.ddtRamBudgetInput || '').trim()
			if (!trimmed) {
				return 16
			}
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return 16
			}
			return Math.min(2048, numeric)
		},
		parsedMinFileSizeBytes() {
			const trimmed = String(this.minSizeMbInput || '').trim()
			if (!trimmed) {
				return 0
			}
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric <= 0) {
				return 0
			}
			return Math.floor(numeric * 1024 * 1024)
		},
		parsedShiftBytes() {
			const trimmed = String(this.shiftBytesInput || '').trim()
			if (!trimmed) {
				return 64
			}
			const numeric = Number(trimmed)
			if (!Number.isFinite(numeric) || numeric < 0) {
				return 64
			}
			return Math.min(8192, Math.floor(numeric))
		},
		report() {
			return buildCdcSavingsReport(this.sourceDuplicates, {
				backendId: this.backendId,
				avgChunkBytes: this.avgChunkBytes,
				fixedBlockBytes: this.fixedBlockBytes,
				ddtRamBudgetGb: this.parsedDdtRamBudgetGb,
				workloadFilter: this.workloadFilter,
				sortMode: this.sortMode,
				searchQuery: this.searchQuery,
				minFileSizeBytes: this.parsedMinFileSizeBytes,
			})
		},
		shiftProbe() {
			return buildSyntheticShiftProbe({
				shiftBytes: this.parsedShiftBytes,
				avgChunkBytes: Math.min(8192, Math.max(1024, Math.floor(this.avgChunkBytes / 8))),
				fixedBlockBytes: Math.min(8192, this.fixedBlockBytes),
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
				const byCurrent = items.find(item => item.rawGroup && item.rawGroup.id === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return items[0]
		},
		runbookScript() {
			return buildCdcVerificationScript(this.report, {
				dataRoot: this.dataRootInput,
				zfsPool: this.zfsPoolInput,
			})
		},
	},
	watch: {
		workloadFilter() {
			this.visibleLimit = 20
		},
		searchQuery() {
			this.visibleLimit = 20
		},
		sortMode() {
			this.visibleLimit = 20
		},
	},
	methods: {
		formatBytesHelper(bytes) {
			return formatBytes(bytes)
		},
		percentOfLogical(part, total) {
			if (!total || total <= 0) {
				return 0
			}
			return Math.max(0, Math.min(100, Math.round((part / total) * 100)))
		},
		selectBackend(id) {
			const profile = CDC_BACKEND_PROFILES[id]
			if (!profile) {
				return
			}
			this.backendId = id
			this.avgChunkBytes = profile.defaultAvgChunkBytes
			this.fixedBlockBytes = profile.fixedBaselineBytes
		},
		formatVerdict(verdict) {
			if (verdict === 'cdc-high-gain') {
				return this.t('duplicatefinder', 'High CDC Gain')
			}
			if (verdict === 'compressed-trap') {
				return this.t('duplicatefinder', 'Compressed Trap')
			}
			if (verdict === 'ddt-ram-risk') {
				return this.t('duplicatefinder', 'DDT RAM Risk')
			}
			if (verdict === 'file-sufficient') {
				return this.t('duplicatefinder', 'File Sufficient')
			}
			return this.t('duplicatefinder', 'Moderate Gain')
		},
		resetFilters() {
			this.workloadFilter = 'all'
			this.searchQuery = ''
			this.minSizeMbInput = ''
			this.sortMode = 'cdc_reclaim_desc'
		},
		triggerDownload(content, mimeType, filename) {
			const blob = new Blob([content], { type: mimeType })
			const url = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
				? URL.createObjectURL(blob)
				: ''
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
		exportVerificationScript() {
			const script = buildCdcVerificationScript(this.report, {
				dataRoot: this.dataRootInput,
				zfsPool: this.zfsPoolInput,
			})
			this.triggerDownload(script, 'text/x-shellscript;charset=utf-8', 'duplicatefinder-cdc-verification.sh')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported DRY_RUN=1 CDC verification runbook.')
		},
		exportJsonReport() {
			const payload = JSON.stringify(buildCdcAuditJson(this.report), null, 2)
			this.triggerDownload(payload, 'application/json;charset=utf-8', 'duplicatefinder-cdc-savings-audit.json')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported CDC savings JSON audit report.')
		},
		exportCsvLedger() {
			const csv = buildCdcAuditCsv(this.report)
			this.triggerDownload(`\uFEFF${csv}`, 'text/csv;charset=utf-8', 'duplicatefinder-cdc-savings-ledger.csv')
			this.statusNoticeType = 'success'
			this.statusNotice = this.t('duplicatefinder', 'Exported CWE-1236-safe CDC savings CSV ledger.')
		},
		async copyRunbookScript() {
			if (!this.runbookScript) {
				return
			}
			const ok = await copyTextSafely(this.runbookScript)
			this.statusNoticeType = ok ? 'success' : 'error'
			this.statusNotice = ok
				? this.t('duplicatefinder', 'Copied DRY_RUN=1 CDC verification runbook.')
				: this.t('duplicatefinder', 'Could not copy CDC runbook to clipboard.')
		},
	},
}
</script>

<style scoped>
.cdc-chunking-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.ccw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.ccw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ccw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
}

.ccw__status-badge {
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

.ccw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.ccw__tool-btn,
.ccw__seg-btn,
.ccw__primary-btn {
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

.ccw__tool-btn:hover:not(:disabled),
.ccw__seg-btn:hover:not(:disabled),
.ccw__primary-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.ccw__tool-btn:focus-visible,
.ccw__seg-btn:focus-visible,
.ccw__primary-btn:focus-visible,
.ccw__input:focus-visible,
.ccw__select:focus-visible,
.ccw__cluster-card:focus-visible,
.ccw__probe-summary:focus-visible,
.ccw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ccw__tool-btn:disabled,
.ccw__seg-btn:disabled,
.ccw__primary-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ccw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ccw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element);
}

.ccw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ccw__empty,
.ccw__no-matches {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding: 18px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.ccw__empty-title {
	margin: 0;
	font-weight: 700;
}

.ccw__empty-hint {
	margin: 0;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.ccw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.ccw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.ccw__inputs-row {
	align-items: flex-end;
}

.ccw__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	text-transform: uppercase;
	letter-spacing: 0.03em;
}

.ccw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.ccw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ccw__search-field {
	flex: 1 1 200px;
}

.ccw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ccw__input,
.ccw__select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.9rem;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.ccw__num-input {
	inline-size: 110px;
}

.ccw__notice {
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-weight: 600;
}

.ccw__notice.is-success {
	border-color: #1c7c45;
	background-color: #e9f7ef;
	color: #0f5132;
}

.ccw__notice.is-error {
	border-color: #b42318;
	background-color: #fdecea;
	color: #7a1c15;
}

.ccw__summary-deck {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 640px) {
	.ccw__summary-deck {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 1080px) {
	.ccw__summary-deck {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.ccw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ccw__kpi-card.is-highlight {
	border-color: #9dd6b4;
	background-color: #e7f6ec;
	color: #0f5132;
}

.ccw__kpi-label {
	font-size: 0.78rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.ccw__kpi-card.is-highlight .ccw__kpi-label,
.ccw__kpi-card.is-highlight .ccw__kpi-sub {
	color: #0f5132;
}

.ccw__kpi-val {
	font-size: 1.15rem;
	font-weight: 700;
}

.ccw__kpi-sub {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ccw__telemetry-strip {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px 18px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	font-size: 0.84rem;
	font-weight: 600;
}

.ccw__telemetry-strip.is-warn {
	border-color: #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
}

.ccw__probe-box,
.ccw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 10px 12px;
	background-color: var(--color-background-hover);
}

.ccw__probe-summary,
.ccw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	cursor: pointer;
}

.ccw__probe-body {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block-start: 8px;
}

.ccw__probe-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 12px;
}

.ccw__probe-note {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 62ch;
}

.ccw__probe-metrics,
.ccw__breakdown-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

@media (min-width: 640px) {
	.ccw__probe-metrics,
	.ccw__breakdown-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.ccw__breakdown-cell {
	display: flex;
	justify-content: space-between;
	align-items: center;
	gap: 6px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 4px;
	background-color: var(--color-main-background);
	font-size: 0.8rem;
	min-inline-size: 0;
}

.ccw__breakdown-key {
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ccw__breakdown-val {
	font-weight: 700;
}

.ccw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

@media (min-width: 960px) {
	.ccw__workspace {
		grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
	}
}

.ccw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ccw__cluster-card {
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

.ccw__cluster-card:hover {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.ccw__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	box-shadow: inset 3px 0 0 var(--color-primary-element);
	background-color: var(--color-primary-element-light);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ccw__cluster-card-top {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ccw__cluster-size {
	font-weight: 700;
	font-size: 0.86rem;
}

.ccw__cluster-name {
	font-weight: 700;
	font-size: 0.94rem;
	overflow-wrap: anywhere;
}

.ccw__cluster-path {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ccw__cluster-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.ccw__verdict-pill,
.ccw__tag {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.76rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.ccw__verdict-pill.is-cdc-high-gain {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.ccw__verdict-pill.is-compressed-trap,
.ccw__tag.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.ccw__verdict-pill.is-ddt-ram-risk,
.ccw__tag.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.ccw__verdict-pill.is-file-sufficient {
	background-color: #eef4ff;
	color: #1e3a8a;
	border-color: #93c5fd;
}

.ccw__detail-panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ccw__detail-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.ccw__detail-heading {
	min-inline-size: 0;
}

.ccw__detail-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ccw__detail-sub {
	margin: 4px 0 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
}

.ccw__detail-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ccw__bars-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.ccw__bar-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.ccw__bar-meta {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ccw__bar-track {
	block-size: 10px;
	border-radius: 999px;
	background-color: var(--color-border);
	overflow: hidden;
}

.ccw__bar-fill {
	block-size: 100%;
	border-radius: 999px;
}

.ccw__bar-fill.is-file {
	background-color: #6b7280;
}

.ccw__bar-fill.is-fixed {
	background-color: #d97706;
}

.ccw__bar-fill.is-cdc {
	background-color: #198754;
}

.ccw__advisories {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.ccw__advisory-line {
	margin: 0;
	padding: 8px 10px;
	border-inline-start: 3px solid var(--color-primary-element);
	background-color: var(--color-background-hover);
	border-radius: 4px;
	font-size: 0.84rem;
	max-inline-size: 74ch;
}

.ccw__files-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.ccw__file-row {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.ccw__file-top {
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	gap: 8px;
	font-weight: 700;
	font-size: 0.88rem;
}

.ccw__file-name {
	overflow-wrap: anywhere;
}

.ccw__file-path {
	font-family: monospace;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ccw__script-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	gap: 10px;
	margin-block: 10px;
}

.ccw__script-pre {
	margin: 0;
	padding: 10px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.78rem;
	overflow-x: auto;
	max-block-size: 260px;
}

.ccw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
