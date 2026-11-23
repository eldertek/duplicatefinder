<template>
	<section
		class="document-lineage-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Near-Duplicate Document Fuzzy Diff and Version Lineage Workbench')">
		<header class="doc-workbench__toolbar">
			<div class="doc-workbench__title-group">
				<h3 class="doc-workbench__title">
					{{ t('duplicatefinder', 'Document Fuzzy Diff & Version Lineage') }}
				</h3>
				<span
					class="doc-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} lineages ({docs} docs, {reclaimable} reclaimable)', {
						clusters: catalog.summary.totalClusters,
						docs: catalog.summary.totalDocuments,
						reclaimable: catalog.summary.totalReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="doc-workbench__toolbar-actions">
				<button
					type="button"
					class="doc-workbench__tool-btn"
					:disabled="catalog.clusters.length === 0 || batchProbing || isDeleting"
					@click="probeVisibleClusters">
					<span>{{ batchProbing
						? t('duplicatefinder', 'Probing docs...')
						: t('duplicatefinder', 'Probe visible') }}</span>
				</button>
				<button
					type="button"
					class="doc-workbench__tool-btn"
					:disabled="catalog.clusters.length === 0 || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="doc-workbench__tool-btn"
					:disabled="catalog.clusters.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="doc-workbench__tool-btn is-close"
					aria-keyshortcuts="6"
					:title="t('duplicatefinder', 'Hide document fuzzy diff and version lineage workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide docs') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="doc-workbench__empty">
			<p class="doc-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="doc-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect PDF, Office (DOCX, ODT, XLSX, PPTX), Markdown, CSV, JSON, and text duplicates for version lineage, text similarity, and inline line diffs.') }}
			</p>
			<button
				type="button"
				class="doc-workbench__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="doc-workbench__controls">
				<div class="doc-workbench__control-row">
					<span class="doc-workbench__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="doc-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Document inspection scope')">
						<button
							type="button"
							class="doc-workbench__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="doc-workbench__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="doc-workbench__control-label">
						{{ t('duplicatefinder', 'Clustering') }}
					</span>
					<div
						class="doc-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Document clustering mode')">
						<button
							type="button"
							class="doc-workbench__seg-btn"
							:class="{ 'is-active': clusteringMode === 'lineages' }"
							:aria-pressed="clusteringMode === 'lineages' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="clusteringMode = 'lineages'">
							<span>{{ t('duplicatefinder', 'Version lineages') }}</span>
						</button>
						<button
							type="button"
							class="doc-workbench__seg-btn"
							:class="{ 'is-active': clusteringMode === 'groups' }"
							:aria-pressed="clusteringMode === 'groups' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="clusteringMode = 'groups'">
							<span>{{ t('duplicatefinder', 'Exact groups') }}</span>
						</button>
					</div>
				</div>

				<div class="doc-workbench__control-row">
					<label class="doc-workbench__field">
						<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Doc type') }}</span>
						<select
							v-model="kindFilter"
							class="doc-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter by document category')">
							<option value="all">{{ t('duplicatefinder', 'All documents') }}</option>
							<option value="pdf">{{ t('duplicatefinder', 'PDF') }}</option>
							<option value="office">{{ t('duplicatefinder', 'Office (DOCX/ODT/XLSX/PPTX)') }}</option>
							<option value="text">{{ t('duplicatefinder', 'Text & Markdown') }}</option>
							<option value="data">{{ t('duplicatefinder', 'Data & Markup (CSV/JSON/XML)') }}</option>
						</select>
					</label>

					<label class="doc-workbench__field">
						<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Keep survivor') }}</span>
						<select
							v-model="keepRule"
							class="doc-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Document survivor strategy')">
							<option value="latest_complete">{{ t('duplicatefinder', 'Latest complete & signed') }}</option>
							<option value="highest_content">{{ t('duplicatefinder', 'Highest word/page richness') }}</option>
							<option value="newest">{{ t('duplicatefinder', 'Newest version & date') }}</option>
							<option value="oldest">{{ t('duplicatefinder', 'Oldest archival master') }}</option>
							<option value="editable_source">{{ t('duplicatefinder', 'Editable source (.docx/.md)') }}</option>
							<option value="shortest_path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
						</select>
					</label>

					<label class="doc-workbench__field">
						<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Min match (%)') }}</span>
						<input
							:value="similarityDraft"
							type="number"
							min="50"
							max="100"
							step="1"
							inputmode="numeric"
							class="doc-workbench__number-input"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Minimum document similarity threshold percentage')"
							@input="onSimilarityInput"
							@blur="commitSimilarityDraft"
							@keydown.enter.prevent="commitSimilarityDraft">
					</label>

					<label class="doc-workbench__field is-search">
						<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="doc-workbench__search-input"
							:placeholder="t('duplicatefinder', 'Title, version, author or path...')"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter document lineages')">
					</label>
				</div>
			</div>

			<div class="doc-workbench__kpis">
				<div class="doc-kpi-card">
					<span class="doc-kpi-card__label">{{ t('duplicatefinder', 'Version lineages') }}</span>
					<strong class="doc-kpi-card__value">{{ catalog.summary.totalClusters }}</strong>
					<span class="doc-kpi-card__meta">
						{{ t('duplicatefinder', '{cross} cross-format, {lineage} multi-rev', {
							cross: catalog.summary.crossFormatCount,
							lineage: catalog.summary.versionLineageCount,
						}) }}
					</span>
				</div>
				<div class="doc-kpi-card">
					<span class="doc-kpi-card__label">{{ t('duplicatefinder', 'Superseded docs') }}</span>
					<strong class="doc-kpi-card__value">{{ catalog.summary.totalSupersededCount }}</strong>
					<span class="doc-kpi-card__meta">
						{{ t('duplicatefinder', '{exact} exact copies, {revs} older drafts', {
							exact: catalog.summary.exactDuplicateFiles,
							revs: catalog.summary.nearDuplicateRevisions,
						}) }}
					</span>
				</div>
				<div class="doc-kpi-card">
					<span class="doc-kpi-card__label">{{ t('duplicatefinder', 'Reclaimable space') }}</span>
					<strong class="doc-kpi-card__value">{{ catalog.summary.totalReclaimableFormatted }}</strong>
					<span class="doc-kpi-card__meta">
						{{ t('duplicatefinder', '{docs} total docs analyzed', {
							docs: catalog.summary.totalDocuments,
						}) }}
					</span>
				</div>
				<div class="doc-kpi-card">
					<span class="doc-kpi-card__label">{{ t('duplicatefinder', 'Content probed') }}</span>
					<strong class="doc-kpi-card__value">{{ catalog.summary.probedCount }}</strong>
					<span class="doc-kpi-card__meta">
						{{ t('duplicatefinder', 'PDF: {pdf} | Office: {office} | Text: {text}', {
							pdf: catalog.summary.kindCounts.pdf,
							office: catalog.summary.kindCounts.office,
							text: catalog.summary.kindCounts.text + catalog.summary.kindCounts.data,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="doc-workbench__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				<span>{{ statusNotice }}</span>
				<button
					type="button"
					class="doc-workbench__mini-btn"
					@click="statusNotice = ''">
					<span>{{ t('duplicatefinder', 'Dismiss') }}</span>
				</button>
			</div>

			<div v-if="catalog.clusters.length === 0" class="doc-workbench__empty">
				<p class="doc-workbench__empty-title">
					{{ t('duplicatefinder', 'No document lineages match the active filters') }}
				</p>
				<p class="doc-workbench__empty-hint">
					{{ t('duplicatefinder', 'Try lowering the similarity threshold, switching scope to All loaded, or clearing the document type filter.') }}
				</p>
				<button
					type="button"
					class="doc-workbench__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div v-else class="doc-workbench__split">
				<aside
					class="doc-workbench__list-pane"
					:aria-label="t('duplicatefinder', 'Document version lineages')">
					<ul class="doc-cluster-list" role="list">
						<li
							v-for="cluster in catalog.clusters"
							:key="cluster.clusterKey"
							class="doc-cluster-list__item">
							<button
								type="button"
								class="doc-cluster-card"
								:class="{ 'is-active': activeCluster && activeCluster.clusterKey === cluster.clusterKey }"
								:aria-pressed="activeCluster && activeCluster.clusterKey === cluster.clusterKey ? 'true' : 'false'"
								@click="selectCluster(cluster)">
								<div class="doc-cluster-card__head">
									<span class="doc-cluster-card__title">{{ cluster.canonicalTitle }}</span>
									<span class="doc-cluster-card__match">{{ cluster.similarityPct }}%</span>
								</div>
								<div class="doc-cluster-card__meta">
									<span>{{ t('duplicatefinder', '{count} files', { count: cluster.fileCount }) }}</span>
									<span>{{ cluster.reclaimableFormatted }}</span>
								</div>
								<div class="doc-cluster-card__badges">
									<span
										v-for="fmt in cluster.formatBadges"
										:key="fmt"
										class="doc-chip">
										{{ fmt }}
									</span>
									<span v-if="cluster.versionSpan" class="doc-chip is-accent">
										{{ cluster.versionSpan }}
									</span>
									<span v-if="cluster.hasSignedCopy" class="doc-chip is-safe">
										{{ t('duplicatefinder', 'Signed/Final') }}
									</span>
									<span v-if="cluster.hasScannedOnlyPdf" class="doc-chip is-warn">
										{{ t('duplicatefinder', 'Scanned PDF') }}
									</span>
								</div>
							</button>
						</li>
					</ul>
				</aside>

				<div
					v-if="activeCluster"
					class="doc-workbench__detail-pane">
					<div class="doc-detail-header">
						<div class="doc-detail-header__info">
							<h4 class="doc-detail-header__title">
								{{ activeCluster.canonicalTitle }}
							</h4>
							<p class="doc-detail-header__sub">
								{{ t('duplicatefinder', 'Master survivor: {name} ({size})', {
									name: activeCluster.survivorFile.name,
									size: activeCluster.survivorFile.sizeFormatted,
								}) }}
							</p>
						</div>
						<div class="doc-detail-header__actions">
							<button
								type="button"
								class="doc-workbench__mini-btn"
								:disabled="batchProbing || isDeleting"
								@click="probeCluster(activeCluster)">
								<span>{{ t('duplicatefinder', 'Probe cluster') }}</span>
							</button>
							<button
								type="button"
								class="doc-workbench__mini-btn"
								:disabled="isDeleting"
								@click="focusInMainView(activeCluster.survivorFile)">
								<span>{{ t('duplicatefinder', 'Focus group') }}</span>
							</button>
						</div>
					</div>

					<ul class="doc-revision-list" role="list">
						<li
							v-for="item in activeCluster.files"
							:key="item.key"
							class="doc-revision-card"
							:class="{
								'is-survivor': item.isSurvivor,
								'is-selected': selectedDeleteKeys.includes(item.key),
							}">
							<div class="doc-revision-card__top">
								<label class="doc-revision-card__check-label">
									<input
										type="checkbox"
										class="doc-revision-card__checkbox"
										:checked="selectedDeleteKeys.includes(item.key)"
										:disabled="!item.deletable || isDeleting"
										:aria-label="t('duplicatefinder', 'Select {name} for deletion', { name: item.name })"
										@change="toggleFileSelection(item.key)">
									<span class="doc-revision-card__name">{{ item.name }}</span>
								</label>
								<div class="doc-revision-card__badges">
									<span v-if="item.isSurvivor" class="doc-chip is-safe">
										{{ t('duplicatefinder', 'Master survivor') }}
									</span>
									<span v-else-if="item.isExactCopyOfSurvivor" class="doc-chip is-muted">
										{{ t('duplicatefinder', 'Exact copy') }}
									</span>
									<span v-else class="doc-chip is-warn">
										{{ t('duplicatefinder', 'Revision ({pct}%)', { pct: item.similarityPct }) }}
									</span>
									<span v-if="item.isProtected" class="doc-chip is-safe">
										{{ t('duplicatefinder', 'Protected') }}
									</span>
									<span v-if="item.versionMeta.versionLabel" class="doc-chip is-accent">
										{{ item.versionMeta.versionLabel }}
									</span>
									<span class="doc-chip">{{ item.extension }}</span>
								</div>
							</div>

							<p class="doc-revision-card__path">
								{{ item.path }}
							</p>

							<div class="doc-revision-card__stats">
								<span>{{ item.sizeFormatted }}</span>
								<span v-if="item.mtimeMs > 0">{{ formatTimestamp(item.mtimeMs) }}</span>
								<span v-if="item.probe && item.probe.probed && item.probe.pageCount !== null">
									{{ t('duplicatefinder', '{count} pages', { count: item.probe.pageCount }) }}
								</span>
								<span v-if="item.probe && item.probe.probed && item.probe.wordCount !== null">
									{{ t('duplicatefinder', '{count} words', { count: item.probe.wordCount }) }}
								</span>
								<span v-if="item.probe && item.probe.author">
									{{ t('duplicatefinder', 'Author: {author}', { author: item.probe.author }) }}
								</span>
								<span v-if="item.probe && item.probe.qualityNotes && item.probe.qualityNotes.length > 0">
									{{ item.probe.qualityNotes.join(' | ') }}
								</span>
							</div>

							<div class="doc-revision-card__actions">
								<button
									v-if="!item.isSurvivor"
									type="button"
									class="doc-workbench__mini-btn"
									:disabled="isDeleting"
									@click="promoteMaster(activeCluster.clusterKey, item.key)">
									<span>{{ t('duplicatefinder', 'Set as master') }}</span>
								</button>
								<button
									type="button"
									class="doc-workbench__mini-btn"
									:disabled="probingKey === item.key || isDeleting"
									@click="probeSingleDocument(item)">
									<span>{{ probingKey === item.key
										? t('duplicatefinder', 'Probing...')
										: (item.probe && item.probe.probed
											? t('duplicatefinder', 'Re-probe')
											: t('duplicatefinder', 'Probe content')) }}</span>
								</button>
								<button
									v-if="!item.isSurvivor && item.groupId === activeCluster.survivorFile.groupId"
									type="button"
									class="doc-workbench__mini-btn"
									:disabled="isDeleting"
									@click="openSideBySideCompare(item.file)">
									<span>{{ t('duplicatefinder', 'Compare view') }}</span>
								</button>
							</div>
						</li>
					</ul>

					<section
						class="doc-diff-viewport"
						:aria-label="t('duplicatefinder', 'Inline fuzzy text and line diff inspector')">
						<div class="doc-diff-viewport__header">
							<h5 class="doc-diff-viewport__title">
								{{ t('duplicatefinder', 'Fuzzy Text & Line Diff Viewport') }}
							</h5>
							<div class="doc-diff-viewport__selectors">
								<label class="doc-workbench__field">
									<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Baseline') }}</span>
									<select
										v-model="diffLeftKey"
										class="doc-workbench__select"
										:aria-label="t('duplicatefinder', 'Select baseline document')">
										<option
											v-for="item in activeCluster.files"
											:key="`left-${item.key}`"
											:value="item.key">
											{{ item.name }}
										</option>
									</select>
								</label>
								<label class="doc-workbench__field">
									<span class="doc-workbench__control-label">{{ t('duplicatefinder', 'Candidate') }}</span>
									<select
										v-model="diffRightKey"
										class="doc-workbench__select"
										:aria-label="t('duplicatefinder', 'Select candidate document')">
										<option
											v-for="item in activeCluster.files"
											:key="`right-${item.key}`"
											:value="item.key">
											{{ item.name }}
										</option>
									</select>
								</label>
								<button
									type="button"
									class="doc-workbench__mini-btn"
									:disabled="batchProbing || !diffLeftFile || !diffRightFile"
									@click="probeActivePair">
									<span>{{ t('duplicatefinder', 'Probe pair') }}</span>
								</button>
							</div>
						</div>

						<div v-if="pairComparison.comparable" class="doc-diff-viewport__metrics">
							<span class="doc-chip is-accent">
								{{ t('duplicatefinder', 'Overall match: {pct}%', { pct: pairComparison.overallSimilarityPct }) }}
							</span>
							<span v-if="pairComparison.shingleSimilarityPct !== null" class="doc-chip">
								{{ t('duplicatefinder', 'Shingle Jaccard: {pct}%', { pct: pairComparison.shingleSimilarityPct }) }}
							</span>
							<span v-if="pairComparison.cosineSimilarityPct !== null" class="doc-chip">
								{{ t('duplicatefinder', 'Token Cosine: {pct}%', { pct: pairComparison.cosineSimilarityPct }) }}
							</span>
							<span v-if="pairComparison.hasProbedContent" class="doc-chip is-safe">
								{{ t('duplicatefinder', '+{add} / -{rem} / ={eq} lines', {
									add: pairComparison.diff.addedCount,
									rem: pairComparison.diff.removedCount,
									eq: pairComparison.diff.unchangedCount,
								}) }}
							</span>
							<span v-else class="doc-chip is-muted">
								{{ t('duplicatefinder', 'Metadata preview (click Probe pair for line diff)') }}
							</span>
						</div>

						<div
							v-if="pairComparison.hasProbedContent && pairComparison.diff.rows.length > 0"
							class="doc-diff-lines-wrap">
							<ol class="doc-diff-lines" role="list">
								<li
									v-for="(row, rowIndex) in pairComparison.diff.rows"
									:key="`diff-row-${rowIndex}`"
									class="doc-diff-line"
									:class="`is-${row.type}`">
									<span class="doc-diff-line__num">{{ row.leftLineNumber !== null ? row.leftLineNumber : '' }}</span>
									<span class="doc-diff-line__num">{{ row.rightLineNumber !== null ? row.rightLineNumber : '' }}</span>
									<span class="doc-diff-line__marker">{{ row.type === 'add' ? '+' : (row.type === 'remove' ? '-' : ' ') }}</span>
									<span class="doc-diff-line__text">{{ row.text }}</span>
								</li>
							</ol>
							<p v-if="pairComparison.diff.truncated" class="doc-diff-viewport__note">
								{{ t('duplicatefinder', 'Diff bounded to first 140 lines per file for responsive performance.') }}
							</p>
						</div>
						<p v-else class="doc-diff-viewport__note">
							{{ pairComparison.hasProbedContent
								? t('duplicatefinder', 'No extractable text lines differed in the probed slice.')
								: t('duplicatefinder', 'Probe the pair to extract PDF text/metadata, Office XML structure, or plain-text line diffs.') }}
						</p>
					</section>

					<footer class="doc-workbench__bulk-bar">
						<div class="doc-workbench__bulk-actions">
							<button
								type="button"
								class="doc-workbench__tool-btn"
								:disabled="isDeleting || catalog.summary.exactDuplicateFiles === 0"
								@click="selectSupersededCopies(false)">
								<span>{{ t('duplicatefinder', 'Select exact copies') }}</span>
							</button>
							<button
								type="button"
								class="doc-workbench__tool-btn"
								:disabled="isDeleting || catalog.summary.totalSupersededCount === 0"
								@click="selectSupersededCopies(true)">
								<span>{{ t('duplicatefinder', 'Select all superseded') }}</span>
							</button>
							<button
								type="button"
								class="doc-workbench__tool-btn"
								:disabled="selectedDeleteKeys.length === 0 || isDeleting"
								@click="clearSelection">
								<span>{{ t('duplicatefinder', 'Clear ({count})', { count: selectedDeleteKeys.length }) }}</span>
							</button>
						</div>
						<button
							type="button"
							class="doc-workbench__danger-btn"
							:disabled="selectedDeleteItems.length === 0 || isDeleting"
							@click="openDeleteDialog">
							<span>{{ t('duplicatefinder', 'Delete selected ({count} | {size})', {
								count: selectedDeleteItems.length,
								size: selectedDeleteSizeFormatted,
							}) }}</span>
						</button>
					</footer>
				</div>
			</div>
		</template>

		<dialog
			ref="docDeleteDialog"
			class="doc-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm document cleanup deletion')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="doc-confirm-dialog__content">
				<h4 class="doc-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm document cleanup') }}
				</h4>
				<p class="doc-confirm-dialog__body">
					{{ t('duplicatefinder', 'Delete {count} selected document copies ({size})? Master survivors and protected origin files remain untouched. Files move to Nextcloud Trashbin when enabled.', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}
				</p>
				<p
					v-if="selectedRevisionCount > 0"
					class="doc-confirm-dialog__warning">
					{{ t('duplicatefinder', 'Includes {count} older draft or near-duplicate revisions with a different file hash from the master survivor.', {
						count: selectedRevisionCount,
					}) }}
				</p>
				<div class="doc-confirm-dialog__actions">
					<button
						type="button"
						class="doc-workbench__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="doc-workbench__danger-btn"
						:disabled="isDeleting"
						@click="confirmDocumentDeletion">
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
	buildDocumentLineageCatalog,
	compareDocumentPair,
	DEFAULT_DOC_SIMILARITY_PCT,
	exportDocumentLineageCsv,
	exportDocumentLineageJson,
	MAX_DOC_PROBE_BYTES,
	MAX_DOC_SIMILARITY_PCT,
	MIN_DOC_SIMILARITY_PCT,
	probeDocumentBuffer,
	selectSupersededDocumentKeys,
} from '../tools/documentLineageInspector'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { formatBytes } from '../tools/duplicateStats'
import { sanitizeContentUrl } from '../tools/mediaContentInspector'
import { normalizeItemPath } from '../tools/utils'

export default {
	name: 'DocumentLineageWorkbench',
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
			clusteringMode: 'lineages',
			kindFilter: 'all',
			keepRule: 'latest_complete',
			similarityThreshold: DEFAULT_DOC_SIMILARITY_PCT,
			similarityDraft: String(DEFAULT_DOC_SIMILARITY_PCT),
			searchQuery: '',
			selectedClusterKey: '',
			diffLeftKey: '',
			diffRightKey: '',
			probeByKey: {},
			manualKeepByCluster: {},
			selectedDeleteKeys: [],
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
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		catalog() {
			return buildDocumentLineageCatalog(this.activeDuplicates, {
				keepRule: this.keepRule,
				kindFilter: this.kindFilter,
				clusteringMode: this.clusteringMode,
				similarityThreshold: this.similarityThreshold,
				searchQuery: this.searchQuery,
				probeByKey: this.probeByKey,
				manualKeepByCluster: this.manualKeepByCluster,
			})
		},
		activeCluster() {
			const clusters = this.catalog.clusters
			if (!clusters.length) {
				return null
			}
			return clusters.find(c => c.clusterKey === this.selectedClusterKey) || clusters[0]
		},
		diffLeftFile() {
			if (!this.activeCluster) {
				return null
			}
			return this.activeCluster.files.find(f => f.key === this.diffLeftKey)
				|| this.activeCluster.files[0]
				|| null
		},
		diffRightFile() {
			if (!this.activeCluster) {
				return null
			}
			return this.activeCluster.files.find(f => f.key === this.diffRightKey)
				|| this.activeCluster.files[1]
				|| this.activeCluster.files[0]
				|| null
		},
		pairComparison() {
			if (!this.diffLeftFile || !this.diffRightFile) {
				return { comparable: false, hasProbedContent: false, diff: { rows: [] } }
			}
			return compareDocumentPair(this.diffLeftFile.file, this.diffRightFile.file, this.probeByKey)
		},
		itemByKeyMap() {
			const map = new Map()
			for (const cluster of this.catalog.clusters) {
				for (const item of cluster.files) {
					if (item.deletable) {
						map.set(item.key, item)
					}
				}
			}
			return map
		},
		selectedDeleteItems() {
			const items = []
			for (const key of this.selectedDeleteKeys) {
				const item = this.itemByKeyMap.get(key)
				if (item) {
					items.push(item)
				}
			}
			return items
		},
		selectedRevisionCount() {
			return this.selectedDeleteItems.filter(item => item.isRevisionVariant).length
		},
		selectedDeleteSizeFormatted() {
			const total = this.selectedDeleteItems.reduce((sum, item) => sum + item.size, 0)
			return formatBytes(total)
		},
	},
	watch: {
		'catalog.clusters': {
			immediate: true,
			handler(list) {
				if (!Array.isArray(list) || list.length === 0) {
					this.selectedClusterKey = ''
					this.diffLeftKey = ''
					this.diffRightKey = ''
					return
				}
				const target = list.find(c => c.clusterKey === this.selectedClusterKey) || list[0]
				this.selectedClusterKey = target.clusterKey
				this.syncDiffPairForCluster(target)
			},
		},
	},
	methods: {
		formatTimestamp(ms) {
			if (!ms || !Number.isFinite(ms)) {
				return ''
			}
			try {
				return new Date(ms).toISOString().slice(0, 10)
			} catch (e) {
				return ''
			}
		},
		onSimilarityInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			this.similarityDraft = raw
			if (raw.trim() === '') {
				return
			}
			const numeric = Number(raw)
			if (Number.isFinite(numeric) && numeric >= MIN_DOC_SIMILARITY_PCT && numeric <= MAX_DOC_SIMILARITY_PCT) {
				this.similarityThreshold = Math.round(numeric)
			}
		},
		commitSimilarityDraft() {
			const numeric = Number(this.similarityDraft)
			const clamped = Number.isFinite(numeric)
				? Math.max(MIN_DOC_SIMILARITY_PCT, Math.min(MAX_DOC_SIMILARITY_PCT, Math.round(numeric)))
				: DEFAULT_DOC_SIMILARITY_PCT
			this.similarityThreshold = clamped
			this.similarityDraft = String(clamped)
		},
		resetFilters() {
			this.kindFilter = 'all'
			this.searchQuery = ''
			this.similarityThreshold = DEFAULT_DOC_SIMILARITY_PCT
			this.similarityDraft = String(DEFAULT_DOC_SIMILARITY_PCT)
		},
		selectCluster(cluster) {
			if (!cluster) {
				return
			}
			this.selectedClusterKey = cluster.clusterKey
			this.syncDiffPairForCluster(cluster)
		},
		syncDiffPairForCluster(cluster) {
			if (!cluster || !Array.isArray(cluster.files) || cluster.files.length === 0) {
				this.diffLeftKey = ''
				this.diffRightKey = ''
				return
			}
			const keys = new Set(cluster.files.map(f => f.key))
			if (!keys.has(this.diffLeftKey)) {
				this.diffLeftKey = cluster.survivorKey || cluster.files[0].key
			}
			if (!keys.has(this.diffRightKey) || this.diffRightKey === this.diffLeftKey) {
				const alt = cluster.files.find(f => f.key !== this.diffLeftKey) || cluster.files[0]
				this.diffRightKey = alt.key
			}
		},
		promoteMaster(clusterKey, fileKey) {
			if (!clusterKey || !fileKey) {
				return
			}
			this.$set(this.manualKeepByCluster, clusterKey, fileKey)
			this.selectedDeleteKeys = this.selectedDeleteKeys.filter(k => k !== fileKey)
			this.diffLeftKey = fileKey
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
		selectSupersededCopies(includeOlderRevisions) {
			const keys = selectSupersededDocumentKeys(this.catalog, {
				includeExactCopies: true,
				includeOlderRevisions: Boolean(includeOlderRevisions),
			})
			this.selectedDeleteKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} superseded document copies.', {
				count: keys.length,
			})
		},
		clearSelection() {
			this.selectedDeleteKeys = []
		},
		resolveDocumentFetchUrl(file) {
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
		async probeSingleDocument(item) {
			if (!item || !item.file) {
				return null
			}
			const key = String(getFileSelectionKey(item.file) ?? item.key)
			const url = this.resolveDocumentFetchUrl(item.file)
			if (!url || typeof fetch !== 'function') {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Document preview URL unavailable for {name}.', {
					name: item.name,
				})
				return null
			}
			this.probingKey = key
			try {
				const response = await fetch(url, {
					method: 'GET',
					credentials: 'same-origin',
					headers: {
						Range: `bytes=0-${MAX_DOC_PROBE_BYTES - 1}`,
					},
				})
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}
				const buffer = await response.arrayBuffer()
				const parsed = probeDocumentBuffer(new Uint8Array(buffer), item.file)
				this.$set(this.probeByKey, key, parsed)
				return parsed
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not probe content for {name}.', {
					name: item.name,
				})
				return null
			} finally {
				if (this.probingKey === key) {
					this.probingKey = ''
				}
			}
		},
		async probeCluster(cluster) {
			if (!cluster || !Array.isArray(cluster.files) || this.batchProbing) {
				return
			}
			this.batchProbing = true
			let probed = 0
			try {
				for (const item of cluster.files.slice(0, 8)) {
					const res = await this.probeSingleDocument(item)
					if (res) {
						probed += 1
					}
				}
				if (probed > 0) {
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Probed {count} documents in lineage.', {
						count: probed,
					})
				}
			} finally {
				this.batchProbing = false
			}
		},
		async probeVisibleClusters() {
			if (this.batchProbing || this.catalog.clusters.length === 0) {
				return
			}
			this.batchProbing = true
			let probed = 0
			try {
				for (const cluster of this.catalog.clusters.slice(0, 6)) {
					for (const item of cluster.files.slice(0, 4)) {
						const res = await this.probeSingleDocument(item)
						if (res) {
							probed += 1
						}
					}
				}
				if (probed > 0) {
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Probed {count} visible documents.', {
						count: probed,
					})
				}
			} finally {
				this.batchProbing = false
			}
		},
		async probeActivePair() {
			if (this.batchProbing) {
				return
			}
			this.batchProbing = true
			try {
				if (this.diffLeftFile) {
					await this.probeSingleDocument(this.diffLeftFile)
				}
				if (this.diffRightFile && (!this.diffLeftFile || this.diffRightFile.key !== this.diffLeftFile.key)) {
					await this.probeSingleDocument(this.diffRightFile)
				}
			} finally {
				this.batchProbing = false
			}
		},
		focusInMainView(item) {
			if (!item) {
				return
			}
			const targetId = item.groupId ?? this.activeCluster?.primaryGroupId
			const match = this.activeDuplicates.find(group => group && (group.id === targetId || group.hash === item.groupHash))
			if (match) {
				this.$emit('select-duplicate', match)
			}
		},
		openSideBySideCompare(file) {
			if (!file || !this.activeCluster) {
				return
			}
			const match = this.activeDuplicates.find(group => group && (group.id === this.activeCluster.primaryGroupId || group.hash === this.activeCluster.survivorFile.groupHash))
			if (match) {
				this.$emit('compare-duplicate', match)
			}
		},
		openDeleteDialog() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.docDeleteDialog
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
			const dialog = this.$refs.docDeleteDialog
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
			if (event && event.target === this.$refs.docDeleteDialog && !this.isDeleting) {
				this.closeDeleteDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function' && prev.isConnected) {
				prev.focus()
			}
		},
		async confirmDocumentDeletion() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			this.statusNotice = ''
			try {
				const payload = this.selectedDeleteItems.map(item => ({
					...item.file,
					fileHash: item.groupHash || item.file.fileHash || '',
				}))
				const result = await deleteFiles(payload)
				const deletedFiles = Array.isArray(result && result.success) ? result.success : []
				const deletedNodeIds = Array.isArray(result && result.deletedNodeIds) ? result.deletedNodeIds : []
				if (deletedFiles.length > 0 || deletedNodeIds.length > 0) {
					this.selectedDeleteKeys = []
					this.$emit('doc-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						strategy: `document:${this.keepRule}`,
					})
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Deleted {count} superseded document copies.', {
						count: deletedFiles.length,
					})
				}
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not delete all selected document copies.')
			} finally {
				this.isDeleting = false
				this.closeDeleteDialog()
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return
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
			setTimeout(() => {
				if (typeof URL.revokeObjectURL === 'function') {
					URL.revokeObjectURL(url)
				}
			}, 250)
		},
		exportAuditJson() {
			const json = exportDocumentLineageJson(this.catalog)
			this.triggerDownload(json, 'duplicatefinder-document-lineage.json', 'application/json')
		},
		exportAuditCsv() {
			const csv = exportDocumentLineageCsv(this.catalog)
			this.triggerDownload(csv, 'duplicatefinder-document-lineage.csv', 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.document-lineage-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-block-end: 16px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	min-inline-size: 0;
}

.doc-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.doc-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.doc-workbench__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.doc-workbench__status-badge {
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

.doc-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.doc-workbench__tool-btn,
.doc-workbench__seg-btn,
.doc-workbench__mini-btn,
.doc-workbench__primary-btn,
.doc-workbench__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
}

.doc-workbench__mini-btn {
	min-block-size: 32px;
	padding-block: 4px;
	padding-inline: 10px;
	font-size: 0.78rem;
}

.doc-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.doc-workbench__danger-btn {
	background-color: var(--color-error, #b91c1c);
	border-color: var(--color-error, #b91c1c);
	color: #ffffff;
}

.doc-workbench__tool-btn:hover:not(:disabled),
.doc-workbench__seg-btn:hover:not(:disabled),
.doc-workbench__mini-btn:hover:not(:disabled),
.doc-cluster-card:hover {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.doc-workbench__tool-btn:focus-visible,
.doc-workbench__seg-btn:focus-visible,
.doc-workbench__mini-btn:focus-visible,
.doc-workbench__primary-btn:focus-visible,
.doc-workbench__danger-btn:focus-visible,
.doc-workbench__select:focus-visible,
.doc-workbench__number-input:focus-visible,
.doc-workbench__search-input:focus-visible,
.doc-cluster-card:focus-visible,
.doc-revision-card__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.doc-workbench__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.doc-workbench__tool-btn:disabled,
.doc-workbench__seg-btn:disabled,
.doc-workbench__mini-btn:disabled,
.doc-workbench__danger-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.doc-workbench__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 4px);
}

.doc-workbench__empty-title {
	margin: 0;
	font-weight: 700;
}

.doc-workbench__empty-hint {
	margin: 0;
	max-inline-size: 68ch;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.doc-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.doc-workbench__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.doc-workbench__control-label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.doc-workbench__segments {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.doc-workbench__field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.doc-workbench__field.is-search {
	flex: 1 1 200px;
}

.doc-workbench__select,
.doc-workbench__number-input,
.doc-workbench__search-input {
	min-block-size: 36px;
	padding-block: 4px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
}

.doc-workbench__number-input {
	inline-size: 76px;
	font-variant-numeric: tabular-nums;
}

.doc-workbench__search-input {
	inline-size: 100%;
	min-inline-size: 0;
}

.doc-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.doc-kpi-card {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.doc-kpi-card__label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.doc-kpi-card__value {
	font-size: 1.12rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.doc-kpi-card__meta {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.doc-workbench__notice {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	font-size: 0.84rem;
}

.doc-workbench__notice.is-error {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.doc-workbench__split {
	display: grid;
	grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

.doc-workbench__list-pane {
	min-inline-size: 0;
	max-block-size: 640px;
	overflow-y: auto;
}

.doc-cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.doc-cluster-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	inline-size: 100%;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
}

.doc-cluster-card.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.doc-cluster-card__head {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.doc-cluster-card__title {
	font-weight: 700;
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.doc-cluster-card__match {
	flex-shrink: 0;
	font-size: 0.78rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.doc-cluster-card__meta {
	display: flex;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.doc-cluster-card__badges,
.doc-revision-card__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.doc-chip {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border: 1px solid var(--color-border);
	border-radius: 999px;
	background-color: var(--color-background-hover);
	font-size: 0.72rem;
	font-weight: 600;
}

.doc-chip.is-safe {
	border-color: var(--color-success, #15803d);
	color: var(--color-success, #15803d);
}

.doc-chip.is-warn {
	border-color: var(--color-warning, #b45309);
	color: var(--color-warning, #b45309);
}

.doc-chip.is-accent {
	border-color: var(--color-primary-element);
	color: var(--color-primary-element);
}

.doc-workbench__detail-pane {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
}

.doc-detail-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.doc-detail-header__title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.doc-detail-header__sub {
	margin: 2px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.doc-detail-header__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.doc-revision-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.doc-revision-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	min-inline-size: 0;
}

.doc-revision-card.is-survivor {
	border-color: var(--color-success, #15803d);
	background-color: var(--color-background-hover);
}

.doc-revision-card.is-selected {
	border-color: var(--color-error, #b91c1c);
}

.doc-revision-card__top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.doc-revision-card__check-label {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
	cursor: pointer;
}

.doc-revision-card__name {
	font-weight: 700;
	font-size: 0.86rem;
	overflow-wrap: anywhere;
}

.doc-revision-card__path {
	margin: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.doc-revision-card__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.doc-revision-card__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.doc-diff-viewport {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.doc-diff-viewport__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.doc-diff-viewport__title {
	margin: 0;
	font-size: 0.88rem;
	font-weight: 700;
}

.doc-diff-viewport__selectors {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.doc-diff-viewport__metrics {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.doc-diff-lines-wrap {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	max-block-size: 300px;
	overflow: auto;
}

.doc-diff-lines {
	margin: 0;
	padding: 0;
	list-style: none;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	line-height: 1.45;
}

.doc-diff-line {
	display: grid;
	grid-template-columns: 36px 36px 18px minmax(0, 1fr);
	gap: 4px;
	padding-block: 2px;
	padding-inline: 6px;
	border-block-end: 1px solid var(--color-border);
}

.doc-diff-line.is-add {
	background-color: rgba(21, 128, 61, 0.12);
}

.doc-diff-line.is-remove {
	background-color: rgba(185, 28, 28, 0.12);
}

.doc-diff-line__num {
	color: var(--color-text-maxcontrast);
	text-align: end;
	user-select: none;
	font-variant-numeric: tabular-nums;
}

.doc-diff-line__marker {
	font-weight: 700;
	text-align: center;
	user-select: none;
}

.doc-diff-line__text {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.doc-diff-viewport__note {
	margin: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.doc-workbench__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.doc-workbench__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.doc-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.doc-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.doc-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.doc-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.doc-confirm-dialog__body,
.doc-confirm-dialog__warning {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.doc-confirm-dialog__warning {
	color: var(--color-warning, #b45309);
	font-weight: 600;
}

.doc-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.doc-workbench__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.doc-workbench__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.document-lineage-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.doc-workbench__tool-btn,
	.doc-workbench__seg-btn,
	.doc-workbench__mini-btn,
	.doc-workbench__primary-btn,
	.doc-workbench__danger-btn,
	.doc-workbench__select,
	.doc-workbench__number-input,
	.doc-workbench__search-input,
	.doc-revision-card__check-label {
		min-block-size: 44px;
	}

	.doc-workbench__field {
		flex: 1 1 100%;
	}

	.doc-workbench__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}
}

@media (max-width: 520px) {
	.doc-workbench__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
