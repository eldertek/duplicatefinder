<template>
	<section
		class="sidecar-sweep-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Orphaned Sidecar and Post-Cleanup Empty-Folder Sweep Inspector')">
		<header class="sidecar-workbench__toolbar">
			<div class="sidecar-workbench__title-group">
				<h3 class="sidecar-workbench__title">
					{{ t('duplicatefinder', 'Sidecar & Empty-Folder Sweep') }}
				</h3>
				<span
					class="sidecar-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{sweep} sidecars, {empty} empty folders ({size})', {
						sweep: catalog.summary.sweepCandidateCount,
						empty: catalog.summary.activeEmptyFolderCount,
						size: catalog.summary.sweepReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="sidecar-workbench__toolbar-actions">
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="catalog.uniqueFolders.length === 0 || batchProbing || isDeleting"
					@click="probeAllFolders">
					<span>{{ batchProbing
						? t('duplicatefinder', 'Probing ({done}/{total})...', {
							done: probeProgressDone,
							total: probeProgressTotal,
						})
						: t('duplicatefinder', 'Probe folders (WebDAV)') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="emptyFoldersLoading || emptyFoldersDeleting"
					@click="scanEmptyFolders(false)">
					<span>{{ emptyFoldersLoading
						? t('duplicatefinder', 'Scanning folders...')
						: t('duplicatefinder', 'Scan empty folders') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="(catalog.items.length === 0 && catalog.emptyFoldersReport.totalCount === 0) || isDeleting"
					@click="exportRollbackScript">
					<span>{{ t('duplicatefinder', 'Restore script') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="(catalog.items.length === 0 && catalog.emptyFoldersReport.totalCount === 0) || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="(catalog.items.length === 0 && catalog.emptyFoldersReport.totalCount === 0) || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn is-close"
					aria-keyshortcuts="4"
					:title="t('duplicatefinder', 'Hide sidecar and empty-folder sweep inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide sweep') }}</span>
				</button>
			</div>
		</header>

		<div class="sidecar-workbench__kpis">
			<div class="sidecar-kpi-card">
				<span class="sidecar-kpi-card__label">{{ t('duplicatefinder', 'Confirmed & inferred orphans') }}</span>
				<strong class="sidecar-kpi-card__value">{{ catalog.summary.confirmedOrphanCount + catalog.summary.inferredOrphanCount }}</strong>
				<span class="sidecar-kpi-card__sub">
					{{ t('duplicatefinder', '{confirmed} probed, {inferred} unprobed', {
						confirmed: catalog.summary.confirmedOrphanCount,
						inferred: catalog.summary.inferredOrphanCount,
					}) }}
				</span>
			</div>
			<div class="sidecar-kpi-card">
				<span class="sidecar-kpi-card__label">{{ t('duplicatefinder', 'Cascade & duplicate sidecars') }}</span>
				<strong class="sidecar-kpi-card__value">{{ catalog.summary.cascadeRiskCount + catalog.summary.redundantDuplicateCount }}</strong>
				<span class="sidecar-kpi-card__sub">
					{{ t('duplicatefinder', '{cascade} cascade risks, {redundant} redundant', {
						cascade: catalog.summary.cascadeRiskCount,
						redundant: catalog.summary.redundantDuplicateCount,
					}) }}
				</span>
			</div>
			<div class="sidecar-kpi-card">
				<span class="sidecar-kpi-card__label">{{ t('duplicatefinder', 'Safe sweep reclaimable') }}</span>
				<strong class="sidecar-kpi-card__value">{{ catalog.summary.sweepReclaimableFormatted }}</strong>
				<span class="sidecar-kpi-card__sub">
					{{ t('duplicatefinder', '{paired} healthy paired, {protected} protected', {
						paired: catalog.summary.healthyPairedCount,
						protected: catalog.summary.protectedOriginCount,
					}) }}
				</span>
			</div>
			<div class="sidecar-kpi-card">
				<span class="sidecar-kpi-card__label">{{ t('duplicatefinder', 'Empty folders ready') }}</span>
				<strong class="sidecar-kpi-card__value">{{ catalog.summary.activeEmptyFolderCount }}</strong>
				<span class="sidecar-kpi-card__sub">
					{{ t('duplicatefinder', '{probed}/{total} folders probed, {ignored} ignored', {
						probed: catalog.summary.probedFolderCount,
						total: catalog.summary.totalUniqueFolderCount,
						ignored: catalog.summary.ignoredEmptyFolderCount,
					}) }}
				</span>
			</div>
		</div>

		<div
			v-if="statusNotice"
			class="sidecar-workbench__notice"
			:class="{ 'is-error': statusNoticeType === 'error' }"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty && catalog.items.length === 0"
			class="sidecar-workbench__empty">
			<p class="sidecar-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="sidecar-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a duplicate scan to inspect .xmp, .aae, .thm, .srt, .vtt, .lrc, and .nfo companion sidecars, or scan storage directly for leftover empty folders below.') }}
			</p>
			<div class="sidecar-workbench__empty-actions">
				<button
					type="button"
					class="sidecar-workbench__primary-btn"
					@click="$emit('start-scan')">
					<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
				</button>
				<button
					type="button"
					class="sidecar-workbench__tool-btn"
					:disabled="emptyFoldersLoading || emptyFoldersDeleting"
					@click="scanEmptyFolders(false)">
					<span>{{ t('duplicatefinder', 'Scan empty folders') }}</span>
				</button>
			</div>
		</div>

		<div v-else class="sidecar-workbench__controls">
			<div class="sidecar-workbench__control-row">
				<span class="sidecar-workbench__control-label">
					{{ t('duplicatefinder', 'Scope') }}
				</span>
				<div
					class="sidecar-workbench__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Sidecar inspection scope')">
					<button
						type="button"
						class="sidecar-workbench__seg-btn"
						:class="{ 'is-active': scope === 'filtered' }"
						:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="scope = 'filtered'">
						<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
					</button>
					<button
						type="button"
						class="sidecar-workbench__seg-btn"
						:class="{ 'is-active': scope === 'all' }"
						:aria-pressed="scope === 'all' ? 'true' : 'false'"
						:disabled="isDeleting"
						@click="scope = 'all'">
						<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
					</button>
				</div>

				<label class="sidecar-workbench__select-field">
					<span class="sidecar-workbench__control-label">{{ t('duplicatefinder', 'Master rule') }}</span>
					<select
						v-model="keepStrategy"
						class="sidecar-workbench__select"
						:disabled="isDeleting"
						:aria-label="t('duplicatefinder', 'Sidecar keep strategy')">
						<option value="paired_survivor">
							{{ t('duplicatefinder', 'Keep copy paired with master') }}
						</option>
						<option value="protected_first">
							{{ t('duplicatefinder', 'Protected origin first') }}
						</option>
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

				<label class="sidecar-workbench__select-field">
					<span class="sidecar-workbench__control-label">{{ t('duplicatefinder', 'Family') }}</span>
					<select
						v-model="familyFilter"
						class="sidecar-workbench__select"
						:disabled="isDeleting"
						:aria-label="t('duplicatefinder', 'Filter sidecar family')">
						<option value="all">
							{{ t('duplicatefinder', 'All families') }}
						</option>
						<option value="photo-raw">
							{{ t('duplicatefinder', 'Photo & RAW (.xmp, .aae, .thm)') }}
						</option>
						<option value="video-subtitle">
							{{ t('duplicatefinder', 'Video & Subtitles (.srt, .vtt, .nfo)') }}
						</option>
						<option value="audio-companion">
							{{ t('duplicatefinder', 'Audio (.lrc, .cue)') }}
						</option>
						<option value="checksum-manifest">
							{{ t('duplicatefinder', 'Checksums (.md5, .sfv, .sha256)') }}
						</option>
					</select>
				</label>

				<label class="sidecar-workbench__select-field">
					<span class="sidecar-workbench__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select
						v-model="sortBy"
						class="sidecar-workbench__select"
						:disabled="isDeleting"
						:aria-label="t('duplicatefinder', 'Sort sidecar items')">
						<option value="priority-desc">
							{{ t('duplicatefinder', 'Sweep priority') }}
						</option>
						<option value="size-desc">
							{{ t('duplicatefinder', 'Largest sidecar size') }}
						</option>
						<option value="path-asc">
							{{ t('duplicatefinder', 'Path (A to Z)') }}
						</option>
						<option value="mtime-desc">
							{{ t('duplicatefinder', 'Newest modified') }}
						</option>
					</select>
				</label>
			</div>

			<div class="sidecar-workbench__filter-row">
				<div
					class="sidecar-workbench__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Filter sidecars by status')">
					<button
						v-for="option in statusFilterOptions"
						:key="option.id"
						type="button"
						class="sidecar-workbench__seg-btn"
						:class="{ 'is-active': statusFilter === option.id }"
						:aria-pressed="statusFilter === option.id ? 'true' : 'false'"
						@click="statusFilter = option.id">
						<span>{{ option.label }}</span>
					</button>
				</div>

				<div class="sidecar-workbench__toggle-group">
					<label class="sidecar-workbench__checkbox-label">
						<input
							v-model="includeCascadeInAutoSelect"
							type="checkbox"
							class="sidecar-workbench__checkbox">
						<span>{{ t('duplicatefinder', 'Include cascade risks') }}</span>
					</label>
					<label class="sidecar-workbench__checkbox-label">
						<input
							v-model="includeInferredInAutoSelect"
							type="checkbox"
							class="sidecar-workbench__checkbox">
						<span>{{ t('duplicatefinder', 'Include unprobed orphans') }}</span>
					</label>
				</div>

				<div class="sidecar-workbench__search-wrap">
					<input
						v-model="searchQuery"
						type="search"
						class="sidecar-workbench__search-input"
						:aria-label="t('duplicatefinder', 'Search sidecar filename, extension, or folder path')"
						:placeholder="t('duplicatefinder', 'Filter .xmp, .srt, .aae, folder...')">
				</div>
			</div>
		</div>

		<div class="sidecar-workbench__split">
			<div class="sidecar-workbench__list-pane">
				<div class="sidecar-workbench__pane-header">
					<h4 class="sidecar-workbench__pane-title">
						{{ t('duplicatefinder', 'Sidecar & Companion Queue ({count})', { count: filteredItems.length }) }}
					</h4>
					<div class="sidecar-workbench__pane-actions">
						<button
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="catalog.items.length === 0 || isDeleting"
							@click="selectSafeSweepTargets">
							<span>{{ t('duplicatefinder', 'Select safe sweep') }}</span>
						</button>
						<button
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="selectedItemKeys.length === 0 || isDeleting"
							@click="clearSidecarSelection">
							<span>{{ t('duplicatefinder', 'Clear ({count})', { count: selectedItemKeys.length }) }}</span>
						</button>
						<button
							type="button"
							class="sidecar-workbench__danger-btn"
							:disabled="selectedDeletableItems.length === 0 || isDeleting"
							@click="openSidecarDeleteDialog">
							<span>{{ t('duplicatefinder', 'Sweep {count} sidecars', { count: selectedDeletableItems.length }) }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="catalog.items.length === 0 && !sourcePoolEmpty"
					class="sidecar-workbench__pane-empty">
					<p class="sidecar-workbench__empty-title">
						{{ t('duplicatefinder', 'No sidecar files in current duplicate scope') }}
					</p>
					<p class="sidecar-workbench__empty-hint">
						{{ t('duplicatefinder', 'Click "Probe folders (WebDAV)" to scan parent folders for standalone orphaned .xmp, .aae, .thm, .srt, or .lrc companions.') }}
					</p>
				</div>

				<div
					v-else-if="filteredItems.length === 0 && catalog.items.length > 0"
					class="sidecar-workbench__pane-empty">
					<p class="sidecar-workbench__empty-title">
						{{ t('duplicatefinder', 'No sidecars match current filters') }}
					</p>
					<button
						type="button"
						class="sidecar-workbench__tool-btn"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
					</button>
				</div>

				<ul
					v-else-if="filteredItems.length > 0"
					class="sidecar-workbench__list"
					role="list">
					<li
						v-for="item in filteredItems"
						:key="item.itemKey"
						class="sidecar-item-card"
						:class="{
							'is-active': activeItem && activeItem.itemKey === item.itemKey,
							'is-protected': item.isProtected || item.status === 'healthy-paired',
						}">
						<div class="sidecar-item-card__row">
							<label class="sidecar-item-card__check-wrap">
								<input
									type="checkbox"
									class="sidecar-item-card__checkbox"
									:checked="selectedItemKeys.includes(item.itemKey)"
									:disabled="item.isProtected || item.status === 'healthy-paired' || isDeleting"
									:aria-label="t('duplicatefinder', 'Select sidecar {path}', { path: item.displayPath })"
									@change="toggleSidecarItem(item)">
							</label>
							<button
								type="button"
								class="sidecar-item-card__body-btn"
								@click="selectedItemKey = item.itemKey">
								<span class="sidecar-item-card__top">
									<strong class="sidecar-item-card__name">{{ item.fileName }}</strong>
									<span class="sidecar-item-card__ext">.{{ item.sidecarExt }}</span>
									<span
										class="sidecar-item-card__status"
										:class="'is-' + item.status">
										{{ item.statusLabel }}
									</span>
									<span
										v-if="item.isProtected"
										class="sidecar-item-card__protected">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
								</span>
								<span class="sidecar-item-card__path">{{ item.displayPath }}</span>
								<span class="sidecar-item-card__meta">
									<span>{{ item.sizeFormatted }}</span>
									<span>{{ item.reason }}</span>
								</span>
							</button>
						</div>
						<div class="sidecar-item-card__actions">
							<button
								type="button"
								class="sidecar-workbench__mini-btn"
								:disabled="Boolean(loadingFolders[item.folderPath]) || isDeleting"
								@click="probeSingleFolder(item.folderPath)">
								<span>{{ loadingFolders[item.folderPath]
									? t('duplicatefinder', 'Probing...')
									: (item.isFolderProbed ? t('duplicatefinder', 'Re-probe folder') : t('duplicatefinder', 'Probe folder')) }}</span>
							</button>
							<button
								v-if="item.group"
								type="button"
								class="sidecar-workbench__mini-btn"
								@click="$emit('select-duplicate', item.group)">
								<span>{{ t('duplicatefinder', 'Open group') }}</span>
							</button>
							<button
								v-if="item.group && Array.isArray(item.group.files) && item.group.files.length >= 2"
								type="button"
								class="sidecar-workbench__mini-btn"
								@click="$emit('compare-duplicate', item.group)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</li>
				</ul>
			</div>

			<div class="sidecar-workbench__detail-pane">
				<div v-if="activeItem" class="sidecar-detail-card">
					<div class="sidecar-detail-card__header">
						<div>
							<h4 class="sidecar-detail-card__title">
								{{ activeItem.fileName }}
							</h4>
							<p class="sidecar-detail-card__path">
								{{ activeItem.displayPath }}
							</p>
						</div>
						<button
							type="button"
							class="sidecar-workbench__mini-btn"
							@click="copySweepManifest">
							<span>{{ copiedKey === 'manifest'
								? t('duplicatefinder', 'Copied')
								: t('duplicatefinder', 'Copy details') }}</span>
						</button>
					</div>

					<dl class="sidecar-detail-card__grid">
						<div>
							<dt>{{ t('duplicatefinder', 'Companion family') }}</dt>
							<dd>{{ activeItem.familyLabel }}</dd>
						</div>
						<div>
							<dt>{{ t('duplicatefinder', 'Audit status') }}</dt>
							<dd>{{ activeItem.statusLabel }}</dd>
						</div>
						<div>
							<dt>{{ t('duplicatefinder', 'Master stem') }}</dt>
							<dd>{{ activeItem.hintedMasterName || activeItem.baseStem }}</dd>
						</div>
						<div>
							<dt>{{ t('duplicatefinder', 'Folder probe') }}</dt>
							<dd>
								{{ activeItem.isFolderProbed
									? t('duplicatefinder', 'Verified ({count} sibling files)', { count: activeItem.siblingCount })
									: t('duplicatefinder', 'Not yet probed via WebDAV') }}
							</dd>
						</div>
					</dl>

					<p class="sidecar-detail-card__reason">
						{{ activeItem.reason }}
					</p>

					<div
						v-if="activeItemSiblings.length > 0"
						class="sidecar-detail-card__siblings">
						<h5 class="sidecar-detail-card__subhead">
							{{ t('duplicatefinder', 'Folder siblings in {folder}', { folder: activeItem.folderPath }) }}
						</h5>
						<ul class="sidecar-detail-card__sibling-list" role="list">
							<li
								v-for="sib in activeItemSiblings"
								:key="sib.path"
								class="sidecar-detail-card__sibling">
								<span class="sidecar-detail-card__sibling-name">{{ sib.name }}</span>
								<span class="sidecar-detail-card__sibling-size">{{ formatSize(sib.size) }}</span>
							</li>
						</ul>
					</div>
				</div>

				<section
					class="empty-sweep-panel"
					role="region"
					:aria-label="t('duplicatefinder', 'Empty Folders Post-Cleanup Sweep')">
					<div class="empty-sweep-panel__header">
						<div>
							<h4 class="empty-sweep-panel__title">
								{{ t('duplicatefinder', 'Empty Folders Sweep ({count})', { count: catalog.emptyFoldersReport.activeCount }) }}
							</h4>
							<p class="empty-sweep-panel__hint">
								{{ t('duplicatefinder', 'Deepest-first order ensures nested empty trees are removed safely without touching non-empty or origin folders.') }}
							</p>
						</div>
						<div class="empty-sweep-panel__actions">
							<button
								v-if="recentCleanedPaths.length > 0"
								type="button"
								class="sidecar-workbench__mini-btn"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="scanEmptyFolders(true)">
								<span>{{ t('duplicatefinder', 'Check cleaned paths ({count})', { count: recentCleanedPaths.length }) }}</span>
							</button>
							<button
								type="button"
								class="sidecar-workbench__mini-btn"
								:disabled="emptyFoldersLoading || emptyFoldersDeleting"
								@click="scanEmptyFolders(false)">
								<span>{{ t('duplicatefinder', 'Scan all storage') }}</span>
							</button>
						</div>
					</div>

					<div
						v-if="catalog.emptyFoldersReport.totalCount > 0"
						class="empty-sweep-panel__toolbar">
						<button
							v-if="catalog.emptyFoldersReport.activeCount > 0"
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="emptyFoldersDeleting"
							@click="toggleSelectAllEmptyFolders">
							<span>{{ isAllEmptyFoldersSelected
								? t('duplicatefinder', 'Unselect all')
								: t('duplicatefinder', 'Select all') }}</span>
						</button>
						<button
							v-if="selectedEmptyFolderPaths.length > 0"
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="emptyFoldersDeleting"
							@click="ignoreSelectedEmptyFolders">
							<span>{{ t('duplicatefinder', 'Ignore ({count})', { count: selectedEmptyFolderPaths.length }) }}</span>
						</button>
						<button
							v-if="catalog.emptyFoldersReport.ignoredCount > 0"
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="emptyFoldersDeleting"
							@click="showIgnoredEmptyFolders = !showIgnoredEmptyFolders">
							<span>{{ showIgnoredEmptyFolders
								? t('duplicatefinder', 'Hide ignored ({count})', { count: catalog.emptyFoldersReport.ignoredCount })
								: t('duplicatefinder', 'Show ignored ({count})', { count: catalog.emptyFoldersReport.ignoredCount }) }}</span>
						</button>
						<button
							v-if="catalog.emptyFoldersReport.ignoredCount > 0"
							type="button"
							class="sidecar-workbench__mini-btn"
							:disabled="emptyFoldersDeleting"
							@click="resetIgnoredEmptyFolders">
							<span>{{ t('duplicatefinder', 'Restore ignored') }}</span>
						</button>
						<button
							type="button"
							class="sidecar-workbench__danger-btn"
							:disabled="selectedEmptyFolderPaths.length === 0 || emptyFoldersDeleting"
							@click="openEmptyFoldersDeleteDialog">
							<span>{{ t('duplicatefinder', 'Sweep {count} empty folders', { count: selectedEmptyFolderPaths.length }) }}</span>
						</button>
					</div>

					<p
						v-if="emptyFoldersLoading"
						class="empty-sweep-panel__status"
						role="status">
						{{ t('duplicatefinder', 'Scanning storage for empty directories...') }}
					</p>
					<p
						v-else-if="emptyFoldersScanned && visibleEmptyFolders.length === 0"
						class="empty-sweep-panel__status">
						{{ catalog.emptyFoldersReport.ignoredCount > 0
							? t('duplicatefinder', 'All detected empty folders are currently ignored ({count}).', { count: catalog.emptyFoldersReport.ignoredCount })
							: t('duplicatefinder', 'No empty folders detected in scanned scope.') }}
					</p>
					<p
						v-else-if="!emptyFoldersScanned"
						class="empty-sweep-panel__status">
						{{ t('duplicatefinder', 'Run "Scan empty folders" to inspect leftover empty directories after duplicate cleanup.') }}
					</p>

					<ul
						v-if="visibleEmptyFolders.length > 0"
						class="empty-sweep-panel__list"
						role="list">
						<li
							v-for="folder in visibleEmptyFolders"
							:key="folder.displayPath"
							class="empty-sweep-item"
							:class="{ 'is-ignored': folder.ignored }">
							<label class="empty-sweep-item__label">
								<input
									type="checkbox"
									class="empty-sweep-item__checkbox"
									:checked="selectedEmptyFolderPaths.includes(folder.path)"
									:disabled="folder.ignored || emptyFoldersDeleting"
									:aria-label="t('duplicatefinder', 'Select empty folder {path}', { path: folder.displayPath })"
									@change="toggleEmptyFolder(folder.path)">
								<span class="empty-sweep-item__path">{{ folder.displayPath }}</span>
							</label>
							<span class="empty-sweep-item__meta">
								<span class="empty-sweep-item__depth">
									{{ t('duplicatefinder', 'Depth {depth}', { depth: folder.depth }) }}
								</span>
								<button
									type="button"
									class="sidecar-workbench__mini-btn"
									:disabled="emptyFoldersDeleting"
									@click="toggleIgnoreEmptyFolder(folder.path)">
									<span>{{ folder.ignored
										? t('duplicatefinder', 'Unignore')
										: t('duplicatefinder', 'Ignore') }}</span>
								</button>
							</span>
						</li>
					</ul>
				</section>
			</div>
		</div>

		<dialog
			ref="sidecarDeleteDialog"
			class="sidecar-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm sidecar sweep deletion')"
			@close="onSidecarDialogClose"
			@click="onSidecarDialogBackdropClick">
			<div class="sidecar-confirm-dialog__content">
				<h4 class="sidecar-confirm-dialog__title">
					{{ t('duplicatefinder', 'Confirm sidecar sweep deletion') }}
				</h4>
				<p class="sidecar-confirm-dialog__body">
					{{ t('duplicatefinder', 'Delete {count} selected sidecar files ({size})? Protected origin files and healthy paired sidecars remain untouched. Files move to Nextcloud Trashbin when enabled.', {
						count: selectedDeletableItems.length,
						size: selectedDeletableSizeFormatted,
					}) }}
				</p>
				<div class="sidecar-confirm-dialog__actions">
					<button
						type="button"
						class="sidecar-workbench__tool-btn"
						:disabled="isDeleting"
						@click="closeSidecarDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="sidecar-workbench__danger-btn"
						:disabled="isDeleting"
						@click="confirmSidecarDeletion">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Sweeping...')
							: t('duplicatefinder', 'Confirm sweep') }}</span>
					</button>
				</div>
			</div>
		</dialog>

		<dialog
			ref="emptyFoldersDeleteDialog"
			class="sidecar-confirm-dialog"
			:aria-label="t('duplicatefinder', 'Confirm empty folder sweep deletion')"
			@close="onEmptyDialogClose"
			@click="onEmptyDialogBackdropClick">
			<div class="sidecar-confirm-dialog__content">
				<h4 class="sidecar-confirm-dialog__title">
					{{ t('duplicatefinder', 'Delete {count} empty folders?', { count: selectedEmptyFolderPaths.length }) }}
				</h4>
				<p class="sidecar-confirm-dialog__body">
					{{ t('duplicatefinder', 'Selected empty folders will be removed deepest-first only if still strictly empty at deletion time.') }}
				</p>
				<div class="sidecar-confirm-dialog__actions">
					<button
						type="button"
						class="sidecar-workbench__tool-btn"
						:disabled="emptyFoldersDeleting"
						@click="closeEmptyFoldersDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="sidecar-workbench__danger-btn"
						:disabled="emptyFoldersDeleting"
						@click="confirmEmptyFoldersDeletion">
						<span>{{ emptyFoldersDeleting
							? t('duplicatefinder', 'Removing...')
							: t('duplicatefinder', 'Delete empty folders') }}</span>
					</button>
				</div>
			</div>
		</dialog>
	</section>
</template>

<script>
import {
	deleteEmptyFolders as apiDeleteEmptyFolders,
	deleteFiles as apiDeleteFiles,
	scanEmptyFolders as apiScanEmptyFolders,
} from '../tools/api'
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import { sanitizeContentUrl } from '../tools/mediaContentInspector'
import {
	analyzeSidecarSweepCatalog,
	buildWebdavFolderPropfindUrl,
	exportSidecarSweepCsv,
	exportSidecarSweepJson,
	filterAndSortSidecarItems,
	generateSidecarRollbackScript,
	parseWebdavDirectoryEntries,
	selectSafeSweepItemKeys,
} from '../tools/sidecarSweepInspector'
import { normalizeItemPath } from '../tools/utils'

export default {
	name: 'SidecarSweepWorkbench',
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
		recentCleanedPaths: {
			type: Array,
			default: () => [],
		},
		ignoredEmptyFolders: {
			type: Array,
			default: () => [],
		},
	},
	data() {
		return {
			scope: 'filtered',
			keepStrategy: 'paired_survivor',
			statusFilter: 'all',
			familyFilter: 'all',
			sortBy: 'priority-desc',
			searchQuery: '',
			includeCascadeInAutoSelect: true,
			includeInferredInAutoSelect: false,
			selectedItemKey: '',
			selectedItemKeys: [],
			probedFoldersByPath: {},
			loadingFolders: {},
			batchProbing: false,
			probeProgressDone: 0,
			probeProgressTotal: 0,
			isDeleting: false,
			emptyFolders: [],
			emptyFoldersScanned: false,
			emptyFoldersLoading: false,
			emptyFoldersDeleting: false,
			selectedEmptyFolderPaths: [],
			showIgnoredEmptyFolders: false,
			copiedKey: '',
			statusNotice: '',
			statusNoticeType: 'info',
			lastFocusBeforeDialog: null,
		}
	},
	computed: {
		filteredCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredCount
		},
		sourcePoolEmpty() {
			return this.filteredCount === 0 && this.allCount === 0
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		catalog() {
			return analyzeSidecarSweepCatalog(this.activePool, {
				keepStrategy: this.keepStrategy,
				probedFoldersByPath: this.probedFoldersByPath,
				emptyFolders: this.emptyFolders,
				ignoredEmptyFolders: this.ignoredEmptyFolders,
			})
		},
		statusFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: this.catalog.items.length }) },
				{ id: 'sweepable', label: this.t('duplicatefinder', 'Sweepable ({count})', { count: this.catalog.summary.sweepCandidateCount }) },
				{ id: 'orphaned', label: this.t('duplicatefinder', 'Orphans') },
				{ id: 'cascade-risk', label: this.t('duplicatefinder', 'Cascade Risk') },
				{ id: 'redundant', label: this.t('duplicatefinder', 'Redundant') },
				{ id: 'healthy-paired', label: this.t('duplicatefinder', 'Healthy Paired') },
			]
		},
		filteredItems() {
			return filterAndSortSidecarItems(this.catalog.items, {
				statusFilter: this.statusFilter,
				familyFilter: this.familyFilter,
				sortBy: this.sortBy,
				searchQuery: this.searchQuery,
			})
		},
		activeItem() {
			if (this.filteredItems.length === 0) {
				return null
			}
			const matched = this.filteredItems.find(item => item.itemKey === this.selectedItemKey)
			if (matched) {
				return matched
			}
			if (this.currentDuplicateId !== null) {
				const current = this.filteredItems.find(item => item.groupId === this.currentDuplicateId)
				if (current) {
					return current
				}
			}
			return this.filteredItems[0]
		},
		activeItemSiblings() {
			if (!this.activeItem) {
				return []
			}
			const raw = this.catalog.folderEntriesMap[this.activeItem.folderPath]
			if (!Array.isArray(raw)) {
				return []
			}
			return raw
				.filter(entry => entry && !entry.isDirectory)
				.map(entry => ({
					path: entry.path || entry.name || '',
					name: entry.name || String(entry.path || '').split('/').pop() || '',
					size: Number(entry.size) || 0,
				}))
				.slice(0, 24)
		},
		selectedDeletableItems() {
			const selectedSet = new Set(this.selectedItemKeys)
			return this.catalog.items.filter(
				item => selectedSet.has(item.itemKey) && !item.isProtected && item.status !== 'healthy-paired',
			)
		},
		selectedDeletableSizeFormatted() {
			const total = this.selectedDeletableItems.reduce((sum, item) => sum + (item.sizeBytes || 0), 0)
			return formatBytes(total)
		},
		visibleEmptyFolders() {
			if (this.showIgnoredEmptyFolders) {
				return this.catalog.emptyFoldersReport.all
			}
			return this.catalog.emptyFoldersReport.active
		},
		isAllEmptyFoldersSelected() {
			const active = this.catalog.emptyFoldersReport.active
			if (active.length === 0) {
				return false
			}
			const selectedSet = new Set(this.selectedEmptyFolderPaths)
			return active.every(folder => selectedSet.has(folder.path))
		},
	},
	watch: {
		filteredItems: {
			immediate: true,
			handler(list) {
				if (!Array.isArray(list) || list.length === 0) {
					this.selectedItemKey = ''
					return
				}
				if (!list.some(item => item.itemKey === this.selectedItemKey)) {
					this.selectedItemKey = list[0].itemKey
				}
			},
		},
	},
	methods: {
		formatSize(bytes) {
			return formatBytes(Number(bytes) || 0)
		},
		resetFilters() {
			this.statusFilter = 'all'
			this.familyFilter = 'all'
			this.searchQuery = ''
		},
		toggleSidecarItem(item) {
			if (!item || item.isProtected || item.status === 'healthy-paired') {
				return
			}
			const idx = this.selectedItemKeys.indexOf(item.itemKey)
			if (idx === -1) {
				this.selectedItemKeys = [...this.selectedItemKeys, item.itemKey]
			} else {
				this.selectedItemKeys = this.selectedItemKeys.filter(key => key !== item.itemKey)
			}
		},
		selectSafeSweepTargets() {
			const keys = selectSafeSweepItemKeys(this.catalog, {
				includeCascade: this.includeCascadeInAutoSelect,
				includeInferred: this.includeInferredInAutoSelect,
			})
			this.selectedItemKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} safe sidecar sweep targets.', { count: keys.length })
		},
		clearSidecarSelection() {
			this.selectedItemKeys = []
		},
		resolveWebdavFileUrl(filePath) {
			const relPath = typeof filePath === 'string'
				? (normalizeItemPath(filePath) || (filePath.startsWith('/') ? filePath : `/${filePath}`))
				: ''
			const oc = typeof window !== 'undefined' ? window.OC : null
			const uid = oc && typeof oc.getCurrentUser === 'function' ? oc.getCurrentUser()?.uid : ''
			if (relPath && uid && oc && typeof oc.linkToRemoteBase === 'function') {
				const encoded = relPath.split('/').filter(Boolean).map(seg => encodeURIComponent(seg)).join('/')
				return sanitizeContentUrl(oc.linkToRemoteBase(`dav/files/${encodeURIComponent(uid)}/${encoded}`))
			}
			return ''
		},
		async probeSingleFolder(folderPath) {
			if (!folderPath || typeof fetch !== 'function') {
				return false
			}
			const url = buildWebdavFolderPropfindUrl(folderPath)
			if (!url) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'WebDAV user context unavailable for folder probing.')
				return false
			}
			this.$set(this.loadingFolders, folderPath, true)
			try {
				const propfindBody = [
					'<?xml version="1.0" encoding="utf-8"?>',
					'<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">',
					'<d:prop><d:getcontentlength/><d:getlastmodified/><d:getcontenttype/><d:resourcetype/><oc:fileid/></d:prop>',
					'</d:propfind>',
				].join('')
				const headers = {
					Depth: '1',
					'Content-Type': 'application/xml; charset=utf-8',
				}
				const oc = typeof window !== 'undefined' ? window.OC : null
				if (oc && typeof oc.requestToken === 'string' && oc.requestToken) {
					headers.requesttoken = oc.requestToken
				}
				const response = await fetch(url, {
					method: 'PROPFIND',
					credentials: 'same-origin',
					headers,
					body: propfindBody,
				})
				if (!response.ok) {
					this.$set(this.probedFoldersByPath, folderPath, {
						status: 'error',
						entries: [],
						error: `HTTP ${response.status}`,
					})
					return false
				}
				const xmlText = await response.text()
				const entries = parseWebdavDirectoryEntries(xmlText, folderPath)
				this.$set(this.probedFoldersByPath, folderPath, {
					status: 'probed',
					entries,
					error: '',
				})
				return true
			} catch (error) {
				this.$set(this.probedFoldersByPath, folderPath, {
					status: 'error',
					entries: [],
					error: error && error.message ? String(error.message) : 'Probe error',
				})
				return false
			} finally {
				this.$set(this.loadingFolders, folderPath, false)
			}
		},
		async probeAllFolders() {
			const folders = this.catalog.uniqueFolders.slice(0, 40)
			if (folders.length === 0 || this.batchProbing) {
				return
			}
			this.batchProbing = true
			this.probeProgressDone = 0
			this.probeProgressTotal = folders.length
			let succeeded = 0
			try {
				for (const folder of folders) {
					const ok = await this.probeSingleFolder(folder)
					if (ok) {
						succeeded += 1
					}
					this.probeProgressDone += 1
				}
				this.statusNoticeType = succeeded > 0 ? 'info' : 'error'
				this.statusNotice = succeeded > 0
					? this.t('duplicatefinder', 'Probed {ok}/{total} folders via WebDAV.', {
						ok: succeeded,
						total: folders.length,
					})
					: this.t('duplicatefinder', 'Could not probe folders via WebDAV in this session.')
			} finally {
				this.batchProbing = false
			}
		},
		async copySweepManifest() {
			if (!this.activeItem) {
				return
			}
			const summary = [
				`File: ${this.activeItem.fileName}`,
				`Path: ${this.activeItem.displayPath}`,
				`Family: ${this.activeItem.familyLabel}`,
				`Status: ${this.activeItem.statusLabel}`,
				`Size: ${this.activeItem.sizeFormatted}`,
				`Reason: ${this.activeItem.reason}`,
			].join('\n')
			const copied = await copyTextSafely(summary)
			if (copied) {
				this.copiedKey = 'manifest'
				setTimeout(() => {
					if (this.copiedKey === 'manifest') {
						this.copiedKey = ''
					}
				}, 1800)
			}
		},
		openSidecarDeleteDialog() {
			if (this.selectedDeletableItems.length === 0) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.sidecarDeleteDialog
			if (dialog) {
				if (typeof dialog.showModal === 'function') {
					dialog.showModal()
				} else {
					dialog.setAttribute('open', 'open')
				}
			}
		},
		closeSidecarDeleteDialog() {
			const dialog = this.$refs.sidecarDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function' && dialog.open) {
					dialog.close()
				} else {
					dialog.removeAttribute('open')
				}
			}
			this.restoreFocusAfterDialog()
		},
		onSidecarDialogClose() {
			this.restoreFocusAfterDialog()
		},
		onSidecarDialogBackdropClick(event) {
			if (event && event.target === this.$refs.sidecarDeleteDialog && !this.isDeleting) {
				this.closeSidecarDeleteDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function' && prev.isConnected) {
				prev.focus()
			}
		},
		async confirmSidecarDeletion() {
			const targets = this.selectedDeletableItems
			if (targets.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const apiTargets = targets.filter(item => item.canApiDelete).map(item => item.file)
				const davTargets = targets.filter(item => !item.canApiDelete)
				const deletedFiles = []
				const deletedNodeIds = []
				const deletedPaths = new Set()

				if (apiTargets.length > 0) {
					const result = await apiDeleteFiles(apiTargets, { skipLivePhotoPairCheck: false })
					const okFiles = Array.isArray(result && result.success) ? result.success : []
					for (const file of okFiles) {
						deletedFiles.push(file)
						if (file.path) {
							deletedPaths.add(file.path)
						}
					}
					if (Array.isArray(result && result.deletedNodeIds)) {
						deletedNodeIds.push(...result.deletedNodeIds)
					}
				}

				if (davTargets.length > 0 && typeof fetch === 'function') {
					for (const item of davTargets) {
						const url = this.resolveWebdavFileUrl(item.path)
						if (!url) {
							continue
						}
						const headers = {}
						const oc = typeof window !== 'undefined' ? window.OC : null
						if (oc && typeof oc.requestToken === 'string' && oc.requestToken) {
							headers.requesttoken = oc.requestToken
						}
						try {
							const resp = await fetch(url, {
								method: 'DELETE',
								credentials: 'same-origin',
								headers,
							})
							if (resp.ok || resp.status === 204 || resp.status === 404) {
								deletedFiles.push(item.file)
								deletedPaths.add(item.displayPath)
								const probeState = this.probedFoldersByPath[item.folderPath]
								if (probeState && Array.isArray(probeState.entries)) {
									this.$set(this.probedFoldersByPath, item.folderPath, {
										...probeState,
										entries: probeState.entries.filter(e => e.path !== item.displayPath),
									})
								}
							}
						} catch {
							// Keep failed item unselected/retained for retry
						}
					}
				}

				const bytesReclaimed = deletedFiles.reduce((sum, f) => sum + (Number(f && f.size) || 0), 0)
				if (deletedFiles.length > 0) {
					this.$emit('sidecar-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved: 0,
						sampleLabel: targets[0].fileName,
					})
					this.selectedItemKeys = this.selectedItemKeys.filter(key => {
						const matched = targets.find(t => t.itemKey === key)
						return matched ? !deletedPaths.has(matched.displayPath) && !deletedPaths.has(matched.path) : true
					})
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Swept {count} orphaned or redundant sidecars ({size}).', {
						count: deletedFiles.length,
						size: formatBytes(bytesReclaimed),
					})
				} else {
					this.statusNoticeType = 'error'
					this.statusNotice = this.t('duplicatefinder', 'No selected sidecar files could be deleted.')
				}
			} catch (error) {
				console.error('Error sweeping sidecars:', error)
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not delete all selected sidecar files.')
			} finally {
				this.isDeleting = false
				this.closeSidecarDeleteDialog()
			}
		},
		async scanEmptyFolders(useCleanedScope = false) {
			if (this.emptyFoldersLoading || this.emptyFoldersDeleting) {
				return
			}
			this.emptyFoldersLoading = true
			try {
				const scopePaths = useCleanedScope && Array.isArray(this.recentCleanedPaths) && this.recentCleanedPaths.length > 0
					? [...this.recentCleanedPaths]
					: []
				const response = await apiScanEmptyFolders(scopePaths)
				const folders = Array.isArray(response && response.folders) ? response.folders : []
				this.emptyFolders = folders
				this.emptyFoldersScanned = true
				const ignoredSet = new Set(this.ignoredEmptyFolders || [])
				this.selectedEmptyFolderPaths = folders
					.filter(folder => folder && folder.path && !ignoredSet.has(folder.path))
					.map(folder => folder.path)
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Found {count} empty folders in scanned scope.', {
					count: this.catalog.emptyFoldersReport.activeCount,
				})
			} catch (error) {
				console.error('Error scanning empty folders in workbench:', error)
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Failed to scan for empty folders.')
			} finally {
				this.emptyFoldersLoading = false
			}
		},
		toggleEmptyFolder(path) {
			const idx = this.selectedEmptyFolderPaths.indexOf(path)
			if (idx === -1) {
				this.selectedEmptyFolderPaths = [...this.selectedEmptyFolderPaths, path]
			} else {
				this.selectedEmptyFolderPaths = this.selectedEmptyFolderPaths.filter(p => p !== path)
			}
		},
		toggleSelectAllEmptyFolders() {
			if (this.isAllEmptyFoldersSelected) {
				this.selectedEmptyFolderPaths = []
			} else {
				this.selectedEmptyFolderPaths = this.catalog.emptyFoldersReport.active.map(folder => folder.path)
			}
		},
		toggleIgnoreEmptyFolder(path) {
			const nextSet = new Set(this.ignoredEmptyFolders || [])
			if (nextSet.has(path)) {
				nextSet.delete(path)
			} else {
				nextSet.add(path)
				this.selectedEmptyFolderPaths = this.selectedEmptyFolderPaths.filter(p => p !== path)
			}
			this.$emit('update-ignored-empty-folders', Array.from(nextSet))
		},
		ignoreSelectedEmptyFolders() {
			if (this.selectedEmptyFolderPaths.length === 0) {
				return
			}
			const nextSet = new Set(this.ignoredEmptyFolders || [])
			for (const path of this.selectedEmptyFolderPaths) {
				nextSet.add(path)
			}
			this.selectedEmptyFolderPaths = []
			this.$emit('update-ignored-empty-folders', Array.from(nextSet))
		},
		resetIgnoredEmptyFolders() {
			this.showIgnoredEmptyFolders = false
			this.selectedEmptyFolderPaths = this.emptyFolders.map(folder => folder.path)
			this.$emit('update-ignored-empty-folders', [])
		},
		openEmptyFoldersDeleteDialog() {
			if (this.selectedEmptyFolderPaths.length === 0) {
				return
			}
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.emptyFoldersDeleteDialog
			if (dialog) {
				if (typeof dialog.showModal === 'function') {
					dialog.showModal()
				} else {
					dialog.setAttribute('open', 'open')
				}
			}
		},
		closeEmptyFoldersDeleteDialog() {
			const dialog = this.$refs.emptyFoldersDeleteDialog
			if (dialog) {
				if (typeof dialog.close === 'function' && dialog.open) {
					dialog.close()
				} else {
					dialog.removeAttribute('open')
				}
			}
			this.restoreFocusAfterDialog()
		},
		onEmptyDialogClose() {
			this.restoreFocusAfterDialog()
		},
		onEmptyDialogBackdropClick(event) {
			if (event && event.target === this.$refs.emptyFoldersDeleteDialog && !this.emptyFoldersDeleting) {
				this.closeEmptyFoldersDeleteDialog()
			}
		},
		async confirmEmptyFoldersDeletion() {
			if (this.selectedEmptyFolderPaths.length === 0 || this.emptyFoldersDeleting) {
				return
			}
			this.emptyFoldersDeleting = true
			try {
				const ignoredSet = new Set(this.ignoredEmptyFolders || [])
				const pathsToDeleteSet = new Set(this.selectedEmptyFolderPaths)
				for (const folder of this.emptyFolders) {
					if (folder && folder.path && !ignoredSet.has(folder.path)) {
						for (const selected of this.selectedEmptyFolderPaths) {
							if (folder.path.startsWith(`${selected}/`)) {
								pathsToDeleteSet.add(folder.path)
								break
							}
						}
					}
				}
				const result = await apiDeleteEmptyFolders(Array.from(pathsToDeleteSet))
				const deleted = Array.isArray(result && result.deleted) ? result.deleted : []
				if (deleted.length > 0) {
					const deletedSet = new Set(deleted)
					this.emptyFolders = this.emptyFolders.filter(folder => !deletedSet.has(folder.path))
					this.selectedEmptyFolderPaths = this.selectedEmptyFolderPaths.filter(path => !deletedSet.has(path))
					this.$emit('empty-folders-deleted', { deleted })
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Removed {count} empty folders.', { count: deleted.length })
				}
			} catch (error) {
				console.error('Error deleting empty folders in workbench:', error)
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Failed to delete empty folders.')
			} finally {
				this.emptyFoldersDeleting = false
				this.closeEmptyFoldersDeleteDialog()
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
		exportRollbackScript() {
			const script = generateSidecarRollbackScript(this.catalog, {
				selectedItemKeys: this.selectedItemKeys,
			})
			this.triggerDownload(script, 'restore-sidecars-from-trash.sh', 'text/x-shellscript')
		},
		exportAuditJson() {
			const json = exportSidecarSweepJson(this.catalog)
			this.triggerDownload(json, 'duplicatefinder-sidecar-sweep.json', 'application/json')
		},
		exportAuditCsv() {
			const csv = exportSidecarSweepCsv(this.catalog)
			this.triggerDownload(csv, 'duplicatefinder-sidecar-sweep.csv', 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.sidecar-sweep-workbench {
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

.sidecar-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.sidecar-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.sidecar-workbench__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.sidecar-workbench__status-badge {
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

.sidecar-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.sidecar-workbench__tool-btn,
.sidecar-workbench__seg-btn,
.sidecar-workbench__mini-btn,
.sidecar-workbench__primary-btn,
.sidecar-workbench__danger-btn {
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

.sidecar-workbench__mini-btn {
	min-block-size: 32px;
	padding-block: 4px;
	padding-inline: 10px;
	font-size: 0.78rem;
}

.sidecar-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.sidecar-workbench__danger-btn {
	background-color: var(--color-error, #c62828);
	border-color: var(--color-error, #c62828);
	color: #ffffff;
}

.sidecar-workbench__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.sidecar-workbench__tool-btn:hover:not(:disabled),
.sidecar-workbench__seg-btn:hover:not(:disabled),
.sidecar-workbench__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.sidecar-workbench__tool-btn:focus-visible,
.sidecar-workbench__seg-btn:focus-visible,
.sidecar-workbench__mini-btn:focus-visible,
.sidecar-workbench__primary-btn:focus-visible,
.sidecar-workbench__danger-btn:focus-visible,
.sidecar-workbench__select:focus-visible,
.sidecar-workbench__search-input:focus-visible,
.sidecar-workbench__checkbox:focus-visible,
.sidecar-item-card__checkbox:focus-visible,
.sidecar-item-card__body-btn:focus-visible,
.empty-sweep-item__checkbox:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.sidecar-workbench__tool-btn:disabled,
.sidecar-workbench__seg-btn:disabled,
.sidecar-workbench__mini-btn:disabled,
.sidecar-workbench__primary-btn:disabled,
.sidecar-workbench__danger-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.sidecar-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.sidecar-kpi-card {
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

.sidecar-kpi-card__label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.sidecar-kpi-card__value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.sidecar-kpi-card__sub {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.sidecar-workbench__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.85rem;
}

.sidecar-workbench__notice.is-error {
	border-color: var(--color-error, #c62828);
	color: var(--color-error, #c62828);
}

.sidecar-workbench__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.sidecar-workbench__empty-title {
	margin: 0;
	font-weight: 700;
}

.sidecar-workbench__empty-hint {
	margin: 0;
	font-size: 0.86rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 72ch;
}

.sidecar-workbench__empty-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.sidecar-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.sidecar-workbench__control-row,
.sidecar-workbench__filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.sidecar-workbench__control-label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.sidecar-workbench__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sidecar-workbench__select-field {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.sidecar-workbench__select,
.sidecar-workbench__search-input {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
}

.sidecar-workbench__toggle-group {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.sidecar-workbench__checkbox-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.82rem;
	cursor: pointer;
}

.sidecar-workbench__search-wrap {
	flex: 1 1 200px;
	min-inline-size: 0;
}

.sidecar-workbench__search-input {
	inline-size: 100%;
	max-inline-size: 320px;
}

.sidecar-workbench__split {
	display: grid;
	grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
	gap: 14px;
	min-inline-size: 0;
}

.sidecar-workbench__list-pane,
.sidecar-workbench__detail-pane {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
}

.sidecar-workbench__pane-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.sidecar-workbench__pane-title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
}

.sidecar-workbench__pane-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sidecar-workbench__pane-empty {
	padding-block: 16px;
	padding-inline: 14px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.sidecar-workbench__list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
	max-block-size: 460px;
	overflow-y: auto;
}

.sidecar-item-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.sidecar-item-card.is-active {
	border-color: var(--color-primary-element);
	background-color: var(--color-background-hover);
}

.sidecar-item-card__row {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	min-inline-size: 0;
}

.sidecar-item-card__check-wrap {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 28px;
	min-block-size: 28px;
	flex-shrink: 0;
}

.sidecar-item-card__body-btn {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 4px;
	padding: 0;
	border: none;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.sidecar-item-card__top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.sidecar-item-card__name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.sidecar-item-card__ext,
.sidecar-item-card__status,
.sidecar-item-card__protected {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	font-size: 0.72rem;
	font-weight: 600;
}

.sidecar-item-card__status.is-orphaned-confirmed,
.sidecar-item-card__status.is-cascade-orphan-risk {
	border-color: var(--color-error, #c62828);
	color: var(--color-error, #c62828);
}

.sidecar-item-card__status.is-healthy-paired,
.sidecar-item-card__protected {
	border-color: var(--color-success, #2e7d32);
	color: var(--color-success, #2e7d32);
}

.sidecar-item-card__path {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sidecar-item-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sidecar-item-card__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.sidecar-detail-card,
.empty-sweep-panel {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.sidecar-detail-card__header,
.empty-sweep-panel__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 8px;
}

.sidecar-detail-card__title,
.empty-sweep-panel__title {
	margin: 0;
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sidecar-detail-card__path,
.empty-sweep-panel__hint {
	margin: 2px 0 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.sidecar-detail-card__grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	margin: 0;
}

.sidecar-detail-card__grid dt {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.sidecar-detail-card__grid dd {
	margin: 2px 0 0;
	font-size: 0.82rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.sidecar-detail-card__reason {
	margin: 0;
	font-size: 0.82rem;
}

.sidecar-detail-card__subhead {
	margin: 0 0 6px;
	font-size: 0.8rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.sidecar-detail-card__sibling-list,
.empty-sweep-panel__list {
	display: flex;
	flex-direction: column;
	gap: 4px;
	margin: 0;
	padding: 0;
	list-style: none;
	max-block-size: 200px;
	overflow-y: auto;
}

.sidecar-detail-card__sibling,
.empty-sweep-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block: 5px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	font-size: 0.78rem;
	min-inline-size: 0;
}

.sidecar-detail-card__sibling-name,
.empty-sweep-item__path {
	overflow-wrap: anywhere;
	min-inline-size: 0;
}

.empty-sweep-panel__actions,
.empty-sweep-panel__toolbar {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.empty-sweep-panel__status {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
}

.empty-sweep-item.is-ignored {
	opacity: 0.65;
}

.empty-sweep-item__label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
	flex: 1 1 160px;
}

.empty-sweep-item__meta {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.empty-sweep-item__depth {
	font-size: 0.72rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.sidecar-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.sidecar-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.sidecar-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.sidecar-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.sidecar-confirm-dialog__body {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.sidecar-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.sidecar-workbench__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.sidecar-workbench__split {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.sidecar-sweep-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.sidecar-workbench__tool-btn,
	.sidecar-workbench__seg-btn,
	.sidecar-workbench__mini-btn,
	.sidecar-workbench__primary-btn,
	.sidecar-workbench__danger-btn,
	.sidecar-workbench__select,
	.sidecar-workbench__search-input,
	.sidecar-workbench__checkbox-label,
	.sidecar-item-card__check-wrap {
		min-block-size: 44px;
	}

	.sidecar-workbench__search-input {
		max-inline-size: none;
	}

	.sidecar-detail-card__grid {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 520px) {
	.sidecar-workbench__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
