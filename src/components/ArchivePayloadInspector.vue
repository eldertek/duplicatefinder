<template>
	<section
		class="archive-payload-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Archive and Container Payload Duplicate Inspector')">
		<header class="archive-workbench__toolbar">
			<div class="archive-workbench__title-group">
				<h3 class="archive-workbench__title">
					{{ t('duplicatefinder', 'Archive & Container Payload Inspector') }}
				</h3>
				<span
					class="archive-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} archive groups ({reclaimable} reclaimable)', {
						count: catalog.summary.totalArchiveGroups,
						reclaimable: catalog.summary.totalArchiveReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="archive-workbench__toolbar-actions">
				<button
					type="button"
					class="archive-workbench__tool-btn"
					:disabled="filteredGroups.length === 0 || batchInspecting || isDeleting"
					@click="inspectAllVisible">
					<span>{{ batchInspecting
						? t('duplicatefinder', 'Inspecting...')
						: t('duplicatefinder', 'Inspect visible') }}</span>
				</button>
				<button
					type="button"
					class="archive-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="archive-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="archive-workbench__tool-btn is-close"
					aria-keyshortcuts="1"
					:title="t('duplicatefinder', 'Hide archive payload inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide inspector') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="archive-workbench__empty">
			<p class="archive-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="archive-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect ZIP, TAR, GZIP, and container archives for duplicate members, nested archives, and already-extracted files.') }}
			</p>
			<button
				type="button"
				class="archive-workbench__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="archive-workbench__controls">
				<div class="archive-workbench__control-row">
					<span class="archive-workbench__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="archive-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Archive inspection scope')">
						<button
							type="button"
							class="archive-workbench__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="archive-workbench__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="archive-workbench__select-field">
						<span class="archive-workbench__control-label">{{ t('duplicatefinder', 'Keep survivor') }}</span>
						<select
							v-model="keepRule"
							class="archive-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Keep survivor strategy')">
							<option value="oldest">
								{{ t('duplicatefinder', 'Oldest copy') }}
							</option>
							<option value="newest">
								{{ t('duplicatefinder', 'Newest copy') }}
							</option>
							<option value="shortest_path">
								{{ t('duplicatefinder', 'Shortest path') }}
							</option>
						</select>
					</label>

					<label class="archive-workbench__select-field">
						<span class="archive-workbench__control-label">{{ t('duplicatefinder', 'Sort archives') }}</span>
						<select
							v-model="sortBy"
							class="archive-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort archive groups')">
							<option value="reclaimable-desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="size-desc">
								{{ t('duplicatefinder', 'Largest archive size') }}
							</option>
							<option value="entries-desc">
								{{ t('duplicatefinder', 'Most inner files') }}
							</option>
							<option value="overlap-desc">
								{{ t('duplicatefinder', 'Highest payload overlap') }}
							</option>
							<option value="copies-desc">
								{{ t('duplicatefinder', 'Most copies') }}
							</option>
						</select>
					</label>
				</div>

				<div class="archive-workbench__filter-row">
					<div
						class="archive-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter archive containers')">
						<button
							v-for="option in categoryOptions"
							:key="option.id"
							type="button"
							class="archive-workbench__seg-btn"
							:class="{ 'is-active': categoryFilter === option.id }"
							:aria-pressed="categoryFilter === option.id ? 'true' : 'false'"
							@click="categoryFilter = option.id">
							<span>{{ option.label }}</span>
						</button>
					</div>

					<div class="archive-workbench__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="archive-workbench__search-input"
							:aria-label="t('duplicatefinder', 'Search archives or inner member paths')"
							:placeholder="t('duplicatefinder', 'Filter archives or inner paths...')">
					</div>
				</div>
			</div>

			<div class="archive-workbench__kpis">
				<div class="archive-kpi-card">
					<span class="archive-kpi-card__label">{{ t('duplicatefinder', 'Archive groups') }}</span>
					<strong class="archive-kpi-card__value">{{ catalog.summary.totalArchiveGroups }}</strong>
					<span class="archive-kpi-card__sub">
						{{ t('duplicatefinder', '{count} inspected containers', { count: catalog.summary.inspectedCount }) }}
					</span>
				</div>
				<div class="archive-kpi-card">
					<span class="archive-kpi-card__label">{{ t('duplicatefinder', 'Reclaimable archive space') }}</span>
					<strong class="archive-kpi-card__value">{{ catalog.summary.totalArchiveReclaimableFormatted }}</strong>
					<span class="archive-kpi-card__sub">
						{{ t('duplicatefinder', 'Outer archive duplicates') }}
					</span>
				</div>
				<div class="archive-kpi-card">
					<span class="archive-kpi-card__label">{{ t('duplicatefinder', 'Nested & intra-dup alerts') }}</span>
					<strong class="archive-kpi-card__value">
						{{ catalog.summary.nestedArchiveGroupsCount + catalog.summary.intraDupGroupsCount }}
					</strong>
					<span class="archive-kpi-card__sub">
						{{ t('duplicatefinder', '{nested} nested, {intra} internal dups', {
							nested: catalog.summary.nestedArchiveGroupsCount,
							intra: catalog.summary.intraDupGroupsCount,
						}) }}
					</span>
				</div>
				<div class="archive-kpi-card">
					<span class="archive-kpi-card__label">{{ t('duplicatefinder', 'Payload overlaps') }}</span>
					<strong class="archive-kpi-card__value">
						{{ catalog.summary.extractedOverlapGroupsCount + catalog.summary.crossOverlapPairsCount }}
					</strong>
					<span class="archive-kpi-card__sub">
						{{ t('duplicatefinder', '{loose} loose matches, {pairs} archive pairs', {
							loose: catalog.summary.extractedOverlapGroupsCount,
							pairs: catalog.summary.crossOverlapPairsCount,
						}) }}
					</span>
				</div>
			</div>

			<div v-if="catalog.groups.length === 0" class="archive-workbench__empty">
				<p class="archive-workbench__empty-title">
					{{ t('duplicatefinder', 'No archive or package container duplicates in current scope') }}
				</p>
				<p class="archive-workbench__empty-hint">
					{{ t('duplicatefinder', 'No .zip, .tar, .gz, .7z, .rar, or container archives (.docx, .apk, .jar, .epub) matched the selected duplicate scope.') }}
				</p>
				<button
					v-if="scope === 'filtered' && allCount > filteredCount"
					type="button"
					class="archive-workbench__primary-btn"
					@click="scope = 'all'">
					<span>{{ t('duplicatefinder', 'Switch to all loaded ({count})', { count: allCount }) }}</span>
				</button>
			</div>

			<div v-else-if="filteredGroups.length === 0" class="archive-workbench__empty">
				<p class="archive-workbench__empty-title">
					{{ t('duplicatefinder', 'No archive groups match your current filter') }}
				</p>
				<button
					type="button"
					class="archive-workbench__primary-btn"
					@click="resetWorkbenchFilters">
					<span>{{ t('duplicatefinder', 'Reset archive filters') }}</span>
				</button>
			</div>

			<div v-else class="archive-workbench__split">
				<div
					class="archive-workbench__list-pane"
					role="list"
					:aria-label="t('duplicatefinder', 'Duplicate archive groups')">
					<article
						v-for="item in filteredGroups"
						:key="item.groupKey"
						role="listitem"
						class="archive-group-card"
						:class="{
							'is-selected': activeGroup && activeGroup.groupKey === item.groupKey,
							'is-current': currentDuplicateId !== null && item.groupId === currentDuplicateId,
							['is-' + item.alertLevel]: true,
						}">
						<button
							type="button"
							class="archive-group-card__select-btn"
							:aria-pressed="activeGroup && activeGroup.groupKey === item.groupKey ? 'true' : 'false'"
							@click="selectArchiveGroup(item)">
							<div class="archive-group-card__top">
								<span class="archive-group-card__format">{{ item.formatLabel }}</span>
								<strong class="archive-group-card__name">{{ item.representativeName }}</strong>
								<span class="archive-group-card__size">{{ item.reclaimableFormatted }}</span>
							</div>
							<div class="archive-group-card__meta">
								<span>{{ t('duplicatefinder', '{count} copies ({size} each)', {
									count: item.copyCount,
									size: item.fileSizeFormatted,
								}) }}</span>
								<span v-if="item.inspection && item.inspection.status === 'ready'">
									{{ t('duplicatefinder', '{files} inner files', {
										files: item.inspection.summary.fileCount,
									}) }}
								</span>
								<span v-else-if="loadingByKey[item.groupKey]">
									{{ t('duplicatefinder', 'Reading headers...') }}
								</span>
								<span v-else>
									{{ t('duplicatefinder', 'Not inspected') }}
								</span>
							</div>
							<div
								v-if="hasCardBadges(item)"
								class="archive-group-card__badges">
								<span
									v-if="item.inspection && item.inspection.summary.nestedArchiveCount > 0"
									class="archive-badge is-attention">
									{{ t('duplicatefinder', '{count} nested archives', {
										count: item.inspection.summary.nestedArchiveCount,
									}) }}
								</span>
								<span
									v-if="item.inspection && item.inspection.summary.intraDuplicateCount > 0"
									class="archive-badge is-attention">
									{{ t('duplicatefinder', '{count} internal dups', {
										count: item.inspection.summary.intraDuplicateCount,
									}) }}
								</span>
								<span
									v-if="item.extractedMatchCount > 0"
									class="archive-badge is-overlap">
									{{ t('duplicatefinder', '{count} loose matches', { count: item.extractedMatchCount }) }}
								</span>
								<span
									v-if="item.maxOverlapPercent > 0"
									class="archive-badge is-overlap">
									{{ t('duplicatefinder', '{percent}% archive overlap', { percent: item.maxOverlapPercent }) }}
								</span>
								<span
									v-if="item.alertLevel === 'warning'"
									class="archive-badge is-warning">
									{{ t('duplicatefinder', 'Safety alert') }}
								</span>
							</div>
						</button>
						<div class="archive-group-card__quick-actions">
							<button
								type="button"
								class="archive-workbench__mini-btn"
								:disabled="Boolean(loadingByKey[item.groupKey])"
								@click="inspectArchiveGroup(item)">
								<span>{{ loadingByKey[item.groupKey]
									? t('duplicatefinder', 'Reading...')
									: (item.inspection ? t('duplicatefinder', 'Re-inspect') : t('duplicatefinder', 'Inspect payload')) }}</span>
							</button>
							<button
								type="button"
								class="archive-workbench__mini-btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Jump') }}</span>
							</button>
							<button
								type="button"
								class="archive-workbench__mini-btn"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</article>
				</div>

				<div v-if="activeGroup" class="archive-workbench__detail-pane">
					<div class="archive-detail__header">
						<div class="archive-detail__identity">
							<h4 class="archive-detail__title">
								{{ activeGroup.representativeName }}
							</h4>
							<p class="archive-detail__path">
								{{ activeGroup.representativePath }}
							</p>
						</div>
						<div class="archive-detail__actions">
							<button
								type="button"
								class="archive-workbench__primary-btn"
								:disabled="Boolean(loadingByKey[activeGroup.groupKey])"
								@click="inspectArchiveGroup(activeGroup)">
								<span>{{ loadingByKey[activeGroup.groupKey]
									? t('duplicatefinder', 'Inspecting...')
									: (activeGroup.inspection
										? t('duplicatefinder', 'Refresh payload')
										: t('duplicatefinder', 'Inspect payload')) }}</span>
							</button>
							<button
								type="button"
								class="archive-workbench__danger-btn"
								:disabled="activeGroup.allProtected || activeGroup.deletableCount === 0 || isDeleting"
								@click="openDeleteDialog(activeGroup)">
								<span>{{ activeGroup.allProtected
									? t('duplicatefinder', 'Origin protected')
									: t('duplicatefinder', 'Delete {count} redundant copies', { count: activeGroup.deletableCount }) }}</span>
							</button>
						</div>
					</div>

					<div class="archive-detail__copies-summary">
						<div class="archive-copies-box">
							<span class="archive-copies-box__title is-keep">
								{{ t('duplicatefinder', 'Kept survivor ({count})', { count: activeGroup.survivors.length }) }}
							</span>
							<div
								v-for="file in activeGroup.survivors"
								:key="'keep-' + (file.id || file.path)"
								class="archive-copies-box__path">
								{{ file.path }}
							</div>
						</div>
						<div class="archive-copies-box">
							<span class="archive-copies-box__title is-delete">
								{{ t('duplicatefinder', 'Redundant copies ({count})', { count: activeGroup.deletionCandidates.length }) }}
							</span>
							<div
								v-for="file in activeGroup.deletionCandidates"
								:key="'del-' + (file.id || file.path)"
								class="archive-copies-box__path">
								{{ file.path }}
							</div>
							<div
								v-if="activeGroup.deletionCandidates.length === 0"
								class="archive-copies-box__empty">
								{{ t('duplicatefinder', 'All copies are protected by origin folders.') }}
							</div>
						</div>
					</div>

					<div
						v-if="loadingByKey[activeGroup.groupKey]"
						class="archive-detail__state-box"
						role="status"
						aria-live="polite">
						<span>{{ t('duplicatefinder', 'Reading container directory and member headers...') }}</span>
					</div>

					<div
						v-else-if="!activeGroup.inspection"
						class="archive-detail__state-box">
						<p class="archive-detail__state-text">
							{{ activeGroup.inspectableByClient
								? t('duplicatefinder', 'Click "Inspect payload" to parse the archive directory, CRC-32 fingerprints, nested archives, and loose-file overlaps.')
								: t('duplicatefinder', 'Click "Inspect payload" to verify the container magic-byte signature.') }}
						</p>
					</div>

					<div
						v-else-if="activeGroup.inspection.status !== 'ready'"
						class="archive-detail__state-box is-muted">
						<p class="archive-detail__state-text">
							{{ activeGroup.inspection.detail || t('duplicatefinder', 'Container member listing is unavailable for this format.') }}
						</p>
						<p
							v-if="activeGroup.inspection.signatureHex"
							class="archive-detail__hex">
							{{ t('duplicatefinder', 'Magic header: {hex}', { hex: activeGroup.inspection.signatureHex }) }}
						</p>
					</div>

					<template v-else>
						<div class="archive-detail__telemetry">
							<span class="archive-telemetry-pill">
								{{ t('duplicatefinder', 'Mode: {mode}', { mode: activeGroup.inspection.parseMode }) }}
							</span>
							<span class="archive-telemetry-pill">
								{{ t('duplicatefinder', '{files} files, {dirs} dirs', {
									files: activeGroup.inspection.summary.fileCount,
									dirs: activeGroup.inspection.summary.directoryCount,
								}) }}
							</span>
							<span class="archive-telemetry-pill">
								{{ t('duplicatefinder', 'Extracted: {uncompressed} ({ratio}% saved)', {
									uncompressed: activeGroup.inspection.summary.totalUncompressedFormatted,
									ratio: activeGroup.inspection.summary.compressionRatioPercent,
								}) }}
							</span>
							<span
								v-if="activeGroup.inspection.summary.intraDuplicateCount > 0"
								class="archive-telemetry-pill is-attention">
								{{ t('duplicatefinder', 'Intra-archive dups: {count} ({size})', {
									count: activeGroup.inspection.summary.intraDuplicateCount,
									size: activeGroup.inspection.summary.intraDuplicateWastedFormatted,
								}) }}
							</span>
							<span
								v-if="activeGroup.inspection.summary.pathTraversalCount > 0 || activeGroup.inspection.summary.zipBombSuspectCount > 0 || activeGroup.inspection.signatureMismatch"
								class="archive-telemetry-pill is-warning">
								{{ t('duplicatefinder', 'Container safety alert detected') }}
							</span>
							<span
								v-if="activeGroup.inspection.truncated"
								class="archive-telemetry-pill is-muted">
								{{ t('duplicatefinder', 'Partial listing (capped or tail-windowed)') }}
							</span>
						</div>

						<div
							v-if="activeGroup.extractedMatches.length > 0"
							class="archive-detail__overlap-banner">
							<strong>
								{{ t('duplicatefinder', 'Already extracted in storage ({count} entries, {size}):', {
									count: activeGroup.extractedMatchCount,
									size: activeGroup.extractedMatchFormatted,
								}) }}
							</strong>
							<ul class="archive-overlap-list">
								<li
									v-for="match in activeGroup.extractedMatches.slice(0, 5)"
									:key="match.entryPath">
									<span class="archive-mono">{{ match.entryPath }}</span>
									<span> ({{ match.sizeFormatted }})</span>
									<span v-if="match.loosePaths.length > 0">
										{{ ' -> ' + match.loosePaths[0] }}
									</span>
								</li>
							</ul>
						</div>

						<div
							v-if="comparableInspectedGroups.length > 0"
							class="archive-detail__compare-box">
							<label class="archive-workbench__select-field">
								<span class="archive-workbench__control-label">
									{{ t('duplicatefinder', 'Compare payload with another inspected archive') }}
								</span>
								<select
									v-model="compareTargetKey"
									class="archive-workbench__select"
									:aria-label="t('duplicatefinder', 'Select second archive to compare inner payloads')">
									<option value="">
										{{ t('duplicatefinder', 'Select archive to diff...') }}
									</option>
									<option
										v-for="candidate in comparableInspectedGroups"
										:key="candidate.groupKey"
										:value="candidate.groupKey">
										{{ candidate.representativeName }} ({{ candidate.inspection.summary.fileCount }} files)
									</option>
								</select>
							</label>

							<div v-if="activeComparison" class="archive-compare-metrics">
								<div class="archive-compare-stat">
									<span>{{ t('duplicatefinder', 'Payload similarity') }}</span>
									<strong>{{ activeComparison.jaccardPercent }}%</strong>
								</div>
								<div class="archive-compare-stat">
									<span>{{ t('duplicatefinder', 'Shared members') }}</span>
									<strong>{{ activeComparison.sharedCount }} ({{ activeComparison.sharedBytesFormatted }})</strong>
								</div>
								<div class="archive-compare-stat">
									<span>{{ t('duplicatefinder', 'Unique in A / B') }}</span>
									<strong>{{ activeComparison.onlyACount }} / {{ activeComparison.onlyBCount }}</strong>
								</div>
							</div>
						</div>

						<div class="archive-detail__member-controls">
							<div
								class="archive-workbench__segments"
								role="group"
								:aria-label="t('duplicatefinder', 'Filter inner archive members')">
								<button
									v-for="opt in memberFilterOptions"
									:key="opt.id"
									type="button"
									class="archive-workbench__seg-btn"
									:class="{ 'is-active': memberFilter === opt.id }"
									:aria-pressed="memberFilter === opt.id ? 'true' : 'false'"
									@click="memberFilter = opt.id">
									<span>{{ opt.label }}</span>
								</button>
							</div>
							<input
								v-model="memberSearch"
								type="search"
								class="archive-workbench__search-input"
								:aria-label="t('duplicatefinder', 'Filter inner archive members by path')"
								:placeholder="t('duplicatefinder', 'Filter member paths or CRC...')">
						</div>

						<div
							v-if="filteredActiveEntries.length === 0"
							class="archive-detail__state-box">
							<span>{{ t('duplicatefinder', 'No inner entries match the current member filter.') }}</span>
						</div>

						<div
							v-else
							class="archive-entries-list"
							role="list"
							:aria-label="t('duplicatefinder', 'Archive member entries')">
							<div
								v-for="(entry, entryIndex) in filteredActiveEntries"
								:key="entry.path + '-' + entryIndex"
								role="listitem"
								class="archive-entry-row"
								:class="{
									'is-dir': entry.isDirectory,
									'is-risk': entry.hasPathTraversal || entry.isZipBombSuspect,
								}">
								<div class="archive-entry-row__main">
									<span class="archive-entry-row__path">{{ entry.path }}</span>
									<div class="archive-entry-row__flags">
										<span v-if="entry.isDirectory" class="archive-entry-tag">
											{{ t('duplicatefinder', 'DIR') }}
										</span>
										<span v-if="entry.isNestedArchive" class="archive-entry-tag is-attention">
											{{ t('duplicatefinder', 'Nested archive') }}
										</span>
										<span v-if="entry.isIntraDuplicate" class="archive-entry-tag is-attention">
											{{ t('duplicatefinder', 'Intra-dup x{count}', { count: entry.intraDuplicateCount }) }}
										</span>
										<span v-if="entry.matchedLooseGroupIds.length > 0" class="archive-entry-tag is-overlap">
											{{ t('duplicatefinder', 'Loose match') }}
										</span>
										<span v-if="entry.hasPathTraversal" class="archive-entry-tag is-warning">
											{{ t('duplicatefinder', 'Path traversal') }}
										</span>
										<span v-if="entry.isZipBombSuspect" class="archive-entry-tag is-warning">
											{{ t('duplicatefinder', 'High expansion ratio') }}
										</span>
									</div>
								</div>
								<div class="archive-entry-row__meta">
									<span>{{ entry.uncompressedFormatted }}</span>
									<span>{{ entry.compressionMethod }} ({{ entry.compressionRatioPercent }}%)</span>
									<span class="archive-mono">{{ entry.crc32 }}</span>
								</div>
							</div>
						</div>
					</template>
				</div>
			</div>
		</template>

		<dialog
			ref="archiveDeleteDialog"
			class="archive-delete-dialog"
			:aria-label="t('duplicatefinder', 'Confirm deletion of redundant archive copies')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="archive-delete-dialog__content">
				<h4 class="archive-delete-dialog__title">
					{{ t('duplicatefinder', 'Delete redundant archive copies?') }}
				</h4>
				<p v-if="pendingDeleteGroup" class="archive-delete-dialog__text">
					{{ t('duplicatefinder', 'This will move {count} redundant copies of "{name}" to trash and keep {survivors} survivor copy.', {
						count: pendingDeleteGroup.deletionCandidates.length,
						name: pendingDeleteGroup.representativeName,
						survivors: pendingDeleteGroup.survivors.length,
					}) }}
				</p>
				<ul v-if="pendingDeleteGroup" class="archive-delete-dialog__list">
					<li
						v-for="file in pendingDeleteGroup.deletionCandidates"
						:key="'confirm-' + (file.id || file.path)">
						{{ file.path }}
					</li>
				</ul>
				<div class="archive-delete-dialog__actions">
					<button
						type="button"
						class="archive-workbench__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="archive-workbench__danger-btn"
						:disabled="isDeleting"
						@click="confirmDeleteRedundantArchives">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Delete copies') }}</span>
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
	MAX_FULL_FETCH_BYTES,
	RANGE_WINDOW_BYTES,
	buildArchiveAuditCsv,
	buildArchiveAuditJson,
	buildArchiveGroupsCatalog,
	compareArchivePayloads,
	filterAndSortArchiveGroups,
	parseArchivePayload,
} from '../tools/archivePayloadInspector'

/**
 * Validate a download or WebDAV URL to allow http(s) or relative root paths only.
 *
 * @param {*} rawUrl - Candidate URL.
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

/**
 * Trigger a client-side file download from an in-memory text payload.
 *
 * @param {string} filename - Suggested download filename.
 * @param {string} content - Text payload.
 * @param {string} mimeType - MIME type.
 */
function downloadTextFile(filename, content, mimeType) {
	if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
		return
	}
	const blob = new Blob([content], { type: mimeType })
	const objectUrl = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.setAttribute('href', objectUrl)
	link.setAttribute('download', filename)
	link.style.display = 'none'
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	setTimeout(() => {
		URL.revokeObjectURL(objectUrl)
	}, 250)
}

export default {
	name: 'ArchivePayloadInspector',
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
			keepRule: 'oldest',
			sortBy: 'reclaimable-desc',
			categoryFilter: 'all',
			searchQuery: '',
			memberFilter: 'all',
			memberSearch: '',
			selectedGroupKey: '',
			compareTargetKey: '',
			inspectedByGroupKey: {},
			loadingByKey: {},
			batchInspecting: false,
			isDeleting: false,
			pendingDeleteGroup: null,
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			const allList = Array.isArray(this.allDuplicates) ? this.allDuplicates : []
			return allList.length > 0 ? allList.length : this.filteredCount
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		scopedDuplicates() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		looseIndexSource() {
			const allList = Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates
				: this.scopedDuplicates
			return allList
		},
		catalog() {
			return buildArchiveGroupsCatalog(this.scopedDuplicates, this.inspectedByGroupKey, {
				keepRule: this.keepRule,
				looseIndexSource: this.looseIndexSource,
			})
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: this.catalog.groups.length }) },
				{ id: 'zip', label: this.t('duplicatefinder', 'ZIP & Packages') },
				{ id: 'tar-gz', label: this.t('duplicatefinder', 'TAR / GZIP') },
				{ id: 'nested', label: this.t('duplicatefinder', 'Nested') },
				{ id: 'extracted-overlap', label: this.t('duplicatefinder', 'Overlaps') },
				{ id: 'intra-dup', label: this.t('duplicatefinder', 'Intra-Dups') },
				{ id: 'security-risk', label: this.t('duplicatefinder', 'Safety Alerts') },
			]
		},
		memberFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All members') },
				{ id: 'nested', label: this.t('duplicatefinder', 'Nested') },
				{ id: 'intra-dup', label: this.t('duplicatefinder', 'Intra-dup') },
				{ id: 'loose-match', label: this.t('duplicatefinder', 'Loose matches') },
				{ id: 'risk', label: this.t('duplicatefinder', 'Safety alerts') },
			]
		},
		filteredGroups() {
			return filterAndSortArchiveGroups(this.catalog.groups, {
				category: this.categoryFilter,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		activeGroup() {
			if (this.filteredGroups.length === 0) {
				return null
			}
			const matched = this.filteredGroups.find(item => item.groupKey === this.selectedGroupKey)
			if (matched) {
				return matched
			}
			if (this.currentDuplicateId !== null) {
				const current = this.filteredGroups.find(item => item.groupId === this.currentDuplicateId)
				if (current) {
					return current
				}
			}
			return this.filteredGroups[0]
		},
		comparableInspectedGroups() {
			if (!this.activeGroup) {
				return []
			}
			return this.catalog.groups.filter(item => (
				item.groupKey !== this.activeGroup.groupKey
				&& item.inspection
				&& item.inspection.status === 'ready'
			))
		},
		activeComparison() {
			if (!this.activeGroup || !this.activeGroup.inspection || !this.compareTargetKey) {
				return null
			}
			const target = this.catalog.groups.find(item => item.groupKey === this.compareTargetKey)
			if (!target || !target.inspection) {
				return null
			}
			return compareArchivePayloads(this.activeGroup.inspection, target.inspection)
		},
		filteredActiveEntries() {
			if (!this.activeGroup || !this.activeGroup.inspection || !Array.isArray(this.activeGroup.inspection.entries)) {
				return []
			}
			const query = this.memberSearch.trim().toLowerCase()
			return this.activeGroup.inspection.entries.filter(entry => {
				if (this.memberFilter === 'nested' && !entry.isNestedArchive) {
					return false
				}
				if (this.memberFilter === 'intra-dup' && !entry.isIntraDuplicate) {
					return false
				}
				if (this.memberFilter === 'loose-match' && entry.matchedLooseGroupIds.length === 0) {
					return false
				}
				if (this.memberFilter === 'risk' && !entry.hasPathTraversal && !entry.isZipBombSuspect) {
					return false
				}
				if (query) {
					const pathMatch = entry.path.toLowerCase().includes(query)
					const crcMatch = entry.crc32.toLowerCase().includes(query)
					if (!pathMatch && !crcMatch) {
						return false
					}
				}
				return true
			})
		},
	},
	watch: {
		filteredGroups: {
			immediate: true,
			handler(list) {
				if (!Array.isArray(list) || list.length === 0) {
					this.selectedGroupKey = ''
					return
				}
				if (!list.some(item => item.groupKey === this.selectedGroupKey)) {
					this.selectedGroupKey = list[0].groupKey
				}
			},
		},
	},
	methods: {
		hasCardBadges(item) {
			if (!item) {
				return false
			}
			if (item.extractedMatchCount > 0 || item.maxOverlapPercent > 0 || item.alertLevel === 'warning') {
				return true
			}
			return Boolean(
				item.inspection
				&& (item.inspection.summary.nestedArchiveCount > 0 || item.inspection.summary.intraDuplicateCount > 0)
			)
		},
		selectArchiveGroup(item) {
			if (!item) {
				return
			}
			this.selectedGroupKey = item.groupKey
			this.compareTargetKey = ''
		},
		resetWorkbenchFilters() {
			this.categoryFilter = 'all'
			this.searchQuery = ''
		},
		resolveContainerFetchUrl(file) {
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
		async inspectArchiveGroup(item, options = {}) {
			if (!item || this.loadingByKey[item.groupKey]) {
				return
			}
			if (options.select !== false) {
				this.selectedGroupKey = item.groupKey
			}
			const primaryWrapper = item.files[0]
			const file = primaryWrapper ? primaryWrapper.raw : null
			if (!file) {
				return
			}

			if (file.archiveBuffer) {
				const parsedInline = parseArchivePayload(file.archiveBuffer, file)
				this.$set(this.inspectedByGroupKey, item.groupKey, parsedInline)
				return
			}
			if (file.archiveManifest) {
				const parsedManifest = parseArchivePayload(null, file)
				this.$set(this.inspectedByGroupKey, item.groupKey, parsedManifest)
				return
			}

			const url = this.resolveContainerFetchUrl(file)
			if (!url || typeof fetch !== 'function') {
				this.$set(this.inspectedByGroupKey, item.groupKey, parseArchivePayload(null, file))
				return
			}

			this.$set(this.loadingByKey, item.groupKey, true)
			try {
				const size = Number(file.size) || 0
				if (size > 0 && size <= MAX_FULL_FETCH_BYTES) {
					const response = await fetch(url)
					if (!response || !response.ok || typeof response.arrayBuffer !== 'function') {
						this.$set(this.inspectedByGroupKey, item.groupKey, parseArchivePayload(null, file))
						return
					}
					const buffer = await response.arrayBuffer()
					this.$set(this.inspectedByGroupKey, item.groupKey, parseArchivePayload(buffer, file))
					return
				}

				// Large container: fetch head window + tail EOCD window when size is known
				const headRes = await fetch(url, {
					headers: { Range: `bytes=0-${RANGE_WINDOW_BYTES - 1}` },
				})
				const headBuf = headRes && headRes.ok && typeof headRes.arrayBuffer === 'function'
					? await headRes.arrayBuffer()
					: null

				if (size > RANGE_WINDOW_BYTES && item.containerFamily === 'zip') {
					const tailStart = Math.max(0, size - RANGE_WINDOW_BYTES)
					const tailRes = await fetch(url, {
						headers: { Range: `bytes=${tailStart}-${size - 1}` },
					})
					if (tailRes && tailRes.ok && typeof tailRes.arrayBuffer === 'function') {
						const tailBuf = await tailRes.arrayBuffer()
						const parsedTail = parseArchivePayload(tailBuf, file, {
							tailOffset: tailRes.status === 206 ? tailStart : 0,
							headBuffer: headBuf,
						})
						this.$set(this.inspectedByGroupKey, item.groupKey, parsedTail)
						return
					}
				}

				this.$set(this.inspectedByGroupKey, item.groupKey, parseArchivePayload(headBuf, file))
			} catch (error) {
				this.$set(this.inspectedByGroupKey, item.groupKey, {
					status: 'unavailable',
					format: item.containerFamily,
					parseMode: 'fetch-error',
					signatureHex: '',
					signatureMismatch: false,
					detail: this.t('duplicatefinder', 'Could not read remote archive container headers.'),
					truncated: false,
					entries: [],
					summary: {
						totalEntries: 0,
						fileCount: 0,
						directoryCount: 0,
						totalCompressedBytes: 0,
						totalCompressedFormatted: formatBytes(0),
						totalUncompressedBytes: 0,
						totalUncompressedFormatted: formatBytes(0),
						compressionRatioPercent: 0,
						nestedArchiveCount: 0,
						intraDuplicateCount: 0,
						intraDuplicateWastedBytes: 0,
						intraDuplicateWastedFormatted: formatBytes(0),
						pathTraversalCount: 0,
						zipBombSuspectCount: 0,
						encryptedCount: 0,
					},
				})
			} finally {
				this.$delete(this.loadingByKey, item.groupKey)
			}
		},
		async inspectAllVisible() {
			if (this.batchInspecting || this.filteredGroups.length === 0) {
				return
			}
			this.batchInspecting = true
			try {
				const targets = this.filteredGroups.slice(0, 12)
				for (const item of targets) {
					await this.inspectArchiveGroup(item, { select: false })
				}
			} finally {
				this.batchInspecting = false
			}
		},
		openDeleteDialog(group) {
			if (!group || group.allProtected || group.deletionCandidates.length === 0 || this.isDeleting) {
				return
			}
			this.pendingDeleteGroup = group
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.archiveDeleteDialog
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
			const dialog = this.$refs.archiveDeleteDialog
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
			this.pendingDeleteGroup = null
			this.restoreFocusAfterDialog()
		},
		onDeleteDialogBackdropClick(event) {
			if (event && event.target === this.$refs.archiveDeleteDialog) {
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
		async confirmDeleteRedundantArchives() {
			const group = this.pendingDeleteGroup
			if (!group || group.deletionCandidates.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const payload = group.deletionCandidates.map(file => ({
					...file,
					fileHash: group.hash || file.fileHash || '',
				}))
				const result = await deleteFiles(payload, { allowLastCopy: false })
				const deletedFiles = Array.isArray(result?.success) ? result.success : []
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds) ? result.deletedNodeIds : []
				if (deletedFiles.length > 0) {
					const bytesReclaimed = deletedFiles.reduce((acc, f) => acc + (Number(f.size) || 0), 0)
					this.$emit('archive-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved: deletedFiles.length >= group.copyCount - 1 ? 1 : 0,
						sampleLabel: group.representativeName,
					})
				}
				this.closeDeleteDialog()
			} finally {
				this.isDeleting = false
			}
		},
		exportAuditJson() {
			const jsonText = buildArchiveAuditJson(this.catalog, this.activeComparison)
			downloadTextFile('duplicatefinder-archive-payload-audit.json', jsonText, 'application/json;charset=utf-8')
		},
		exportAuditCsv() {
			const csvText = buildArchiveAuditCsv(this.catalog)
			downloadTextFile('duplicatefinder-archive-payload-audit.csv', csvText, 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.archive-payload-workbench {
	margin-block-end: 16px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
}

.archive-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-block-end: 14px;
}

.archive-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.archive-workbench__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.archive-workbench__status-badge {
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.archive-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.archive-workbench__tool-btn,
.archive-workbench__seg-btn,
.archive-workbench__mini-btn,
.archive-workbench__primary-btn,
.archive-workbench__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
}

.archive-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.archive-workbench__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
}

.archive-workbench__tool-btn:hover:not(:disabled),
.archive-workbench__seg-btn:hover:not(:disabled),
.archive-workbench__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.archive-workbench__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.archive-workbench__tool-btn:focus-visible,
.archive-workbench__seg-btn:focus-visible,
.archive-workbench__mini-btn:focus-visible,
.archive-workbench__primary-btn:focus-visible,
.archive-workbench__danger-btn:focus-visible,
.archive-workbench__select:focus-visible,
.archive-workbench__search-input:focus-visible,
.archive-group-card__select-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.archive-workbench__tool-btn:disabled,
.archive-workbench__seg-btn:disabled,
.archive-workbench__mini-btn:disabled,
.archive-workbench__primary-btn:disabled,
.archive-workbench__danger-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.archive-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	margin-block-end: 14px;
}

.archive-workbench__control-row,
.archive-workbench__filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.archive-workbench__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.archive-workbench__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.archive-workbench__select-field {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.archive-workbench__select,
.archive-workbench__search-input {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
}

.archive-workbench__search-wrap {
	flex: 1 1 220px;
	min-inline-size: 0;
}

.archive-workbench__search-wrap .archive-workbench__search-input {
	inline-size: 100%;
	box-sizing: border-box;
}

.archive-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-block-end: 14px;
}

.archive-kpi-card {
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

.archive-kpi-card__label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.archive-kpi-card__value {
	font-size: 1.1rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.archive-kpi-card__sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.archive-workbench__empty {
	padding-block: 24px;
	padding-inline: 16px;
	text-align: center;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.archive-workbench__empty-title {
	margin: 0 0 6px;
	font-weight: 700;
}

.archive-workbench__empty-hint {
	margin: 0 auto 14px;
	max-inline-size: 62ch;
	color: var(--color-text-maxcontrast);
}

.archive-workbench__split {
	display: grid;
	grid-template-columns: minmax(280px, 0.95fr) minmax(0, 1.35fr);
	gap: 14px;
	align-items: start;
}

.archive-workbench__list-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-block-size: 560px;
	overflow-y: auto;
	min-inline-size: 0;
}

.archive-group-card {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	padding-block: 8px;
	padding-inline: 10px;
}

.archive-group-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.archive-group-card.is-warning {
	border-inline-start: 4px solid #d32f2f;
}

.archive-group-card.is-attention {
	border-inline-start: 4px solid #ef6c00;
}

.archive-group-card__select-btn {
	display: flex;
	flex-direction: column;
	gap: 6px;
	inline-size: 100%;
	padding: 4px;
	border: 0;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.archive-group-card__top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.archive-group-card__format {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.72rem;
	font-weight: 700;
}

.archive-group-card__name {
	flex: 1 1 120px;
	min-inline-size: 0;
	overflow-wrap: anywhere;
	font-size: 0.9rem;
}

.archive-group-card__size {
	font-size: 0.84rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.archive-group-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.archive-group-card__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.archive-badge,
.archive-entry-tag,
.archive-telemetry-pill {
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 4px;
	font-size: 0.74rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.archive-badge.is-warning,
.archive-entry-tag.is-warning,
.archive-telemetry-pill.is-warning {
	border-color: rgba(211, 47, 47, 0.45);
	color: #b71c1c;
}

.archive-badge.is-attention,
.archive-entry-tag.is-attention,
.archive-telemetry-pill.is-attention {
	border-color: rgba(230, 81, 0, 0.45);
	color: #bf360c;
}

.archive-badge.is-overlap,
.archive-entry-tag.is-overlap {
	border-color: rgba(21, 101, 192, 0.45);
	color: #0d47a1;
}

.archive-group-card__quick-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-block-start: 8px;
}

.archive-workbench__detail-pane {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 12px;
	padding-inline: 14px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.archive-detail__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.archive-detail__identity {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.archive-detail__title {
	margin: 0 0 4px;
	font-size: 1rem;
	overflow-wrap: anywhere;
}

.archive-detail__path {
	margin: 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.archive-detail__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.archive-detail__copies-summary {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.archive-copies-box {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.archive-copies-box__title {
	display: block;
	font-size: 0.78rem;
	font-weight: 700;
	margin-block-end: 6px;
}

.archive-copies-box__title.is-keep {
	color: #1b5e20;
}

.archive-copies-box__title.is-delete {
	color: #b71c1c;
}

.archive-copies-box__path,
.archive-copies-box__empty {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
	margin-block-end: 3px;
}

.archive-detail__state-box {
	padding-block: 14px;
	padding-inline: 12px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	color: var(--color-text-maxcontrast);
}

.archive-detail__state-text,
.archive-detail__hex {
	margin: 0 0 4px;
}

.archive-detail__hex,
.archive-mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.archive-detail__telemetry {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.archive-detail__overlap-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid rgba(21, 101, 192, 0.35);
	border-radius: var(--border-radius, 6px);
	background-color: rgba(21, 101, 192, 0.06);
	font-size: 0.82rem;
}

.archive-overlap-list {
	margin: 6px 0 0;
	padding-inline-start: 18px;
	overflow-wrap: anywhere;
}

.archive-detail__compare-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.archive-compare-metrics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.archive-compare-stat {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.8rem;
}

.archive-detail__member-controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.archive-detail__member-controls .archive-workbench__search-input {
	flex: 1 1 180px;
	min-inline-size: 0;
}

.archive-entries-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-block-size: 320px;
	overflow-y: auto;
}

.archive-entry-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.archive-entry-row.is-risk {
	border-color: rgba(211, 47, 47, 0.45);
}

.archive-entry-row__main {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	flex: 1 1 220px;
}

.archive-entry-row__path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.archive-entry-row__flags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.archive-entry-row__meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.archive-delete-dialog {
	max-inline-size: 520px;
	inline-size: calc(100% - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.archive-delete-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.55);
}

.archive-delete-dialog__content {
	padding-block: 18px;
	padding-inline: 18px;
}

.archive-delete-dialog__title {
	margin: 0 0 8px;
	font-size: 1rem;
}

.archive-delete-dialog__text {
	margin: 0 0 10px;
	font-size: 0.88rem;
}

.archive-delete-dialog__list {
	margin: 0 0 14px;
	padding-inline-start: 18px;
	max-block-size: 180px;
	overflow-y: auto;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.archive-delete-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.archive-workbench__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.archive-workbench__split {
		grid-template-columns: minmax(0, 1fr);
	}

	.archive-detail__copies-summary,
	.archive-compare-metrics {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.archive-payload-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.archive-workbench__kpis {
		grid-template-columns: minmax(0, 1fr);
	}

	.archive-workbench__tool-btn,
	.archive-workbench__seg-btn,
	.archive-workbench__mini-btn,
	.archive-workbench__primary-btn,
	.archive-workbench__danger-btn,
	.archive-workbench__select,
	.archive-workbench__search-input,
	.archive-group-card__select-btn {
		min-block-size: 45px;
	}
}
</style>
