<template>
	<section
		class="audio-tag-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Duplicate Music, ID3 Audio Tags and Bitrate Consolidator')">
		<header class="audio-workbench__toolbar">
			<div class="audio-workbench__title-group">
				<h3 class="audio-workbench__title">
					{{ t('duplicatefinder', 'Audio Tags & Bitrate Consolidator') }}
				</h3>
				<span
					class="audio-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} audio groups ({reclaimable} reclaimable)', {
						count: catalog.summary.totalAudioGroups,
						reclaimable: catalog.summary.totalReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="audio-workbench__toolbar-actions">
				<button
					type="button"
					class="audio-workbench__tool-btn"
					:disabled="filteredGroups.length === 0 || batchInspecting || isDeleting"
					@click="inspectAllVisible">
					<span>{{ batchInspecting
						? t('duplicatefinder', 'Scanning tags...')
						: t('duplicatefinder', 'Inspect visible') }}</span>
				</button>
				<button
					type="button"
					class="audio-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="audio-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="audio-workbench__tool-btn is-close"
					aria-keyshortcuts="2"
					:title="t('duplicatefinder', 'Hide audio tag and bitrate workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide audio') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="audio-workbench__empty">
			<p class="audio-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="audio-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect MP3, FLAC, OGG, M4A, and WAV duplicates for bitrate quality, ID3/Vorbis tag completeness, and album consolidation.') }}
			</p>
			<button
				type="button"
				class="audio-workbench__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="audio-workbench__controls">
				<div class="audio-workbench__control-row">
					<span class="audio-workbench__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="audio-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Audio inspection scope')">
						<button
							type="button"
							class="audio-workbench__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="audio-workbench__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="audio-workbench__select-field">
						<span class="audio-workbench__control-label">{{ t('duplicatefinder', 'Keep survivor') }}</span>
						<select
							v-model="keepRule"
							class="audio-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Audio keep survivor strategy')">
							<option value="balanced_master">
								{{ t('duplicatefinder', 'Best quality + complete tags') }}
							</option>
							<option value="highest_quality">
								{{ t('duplicatefinder', 'Highest bitrate / lossless') }}
							</option>
							<option value="most_complete_tags">
								{{ t('duplicatefinder', 'Most complete ID3 tags') }}
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

					<label class="audio-workbench__select-field">
						<span class="audio-workbench__control-label">{{ t('duplicatefinder', 'Sort tracks') }}</span>
						<select
							v-model="sortBy"
							class="audio-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort audio groups')">
							<option value="reclaimable-desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="bitrate-desc">
								{{ t('duplicatefinder', 'Highest bitrate / lossless') }}
							</option>
							<option value="tag-score-desc">
								{{ t('duplicatefinder', 'Highest tag completeness') }}
							</option>
							<option value="copies-desc">
								{{ t('duplicatefinder', 'Most copies') }}
							</option>
							<option value="duration-desc">
								{{ t('duplicatefinder', 'Longest duration') }}
							</option>
						</select>
					</label>
				</div>

				<div class="audio-workbench__filter-row">
					<div
						class="audio-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter audio tracks')">
						<button
							v-for="option in categoryOptions"
							:key="option.id"
							type="button"
							class="audio-workbench__seg-btn"
							:class="{ 'is-active': categoryFilter === option.id }"
							:aria-pressed="categoryFilter === option.id ? 'true' : 'false'"
							@click="categoryFilter = option.id">
							<span>{{ option.label }}</span>
						</button>
					</div>

					<div class="audio-workbench__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="audio-workbench__search-input"
							:aria-label="t('duplicatefinder', 'Search artist, title, album, codec, or path')"
							:placeholder="t('duplicatefinder', 'Filter artist, title, album, codec...')">
					</div>
				</div>
			</div>

			<div class="audio-workbench__kpis">
				<div class="audio-kpi-card">
					<span class="audio-kpi-card__label">{{ t('duplicatefinder', 'Audio groups') }}</span>
					<strong class="audio-kpi-card__value">{{ catalog.summary.totalAudioGroups }}</strong>
					<span class="audio-kpi-card__sub">
						{{ t('duplicatefinder', '{lossless} lossless, {inspected} tag-scanned', {
							lossless: catalog.summary.losslessGroupsCount,
							inspected: catalog.summary.inspectedCount,
						}) }}
					</span>
				</div>
				<div class="audio-kpi-card">
					<span class="audio-kpi-card__label">{{ t('duplicatefinder', 'Reclaimable space') }}</span>
					<strong class="audio-kpi-card__value">{{ catalog.summary.totalReclaimableFormatted }}</strong>
					<span class="audio-kpi-card__sub">
						{{ t('duplicatefinder', '{files} total audio files', {
							files: catalog.summary.totalAudioFiles,
						}) }}
					</span>
				</div>
				<div class="audio-kpi-card">
					<span class="audio-kpi-card__label">{{ t('duplicatefinder', 'Cross-format & tag alerts') }}</span>
					<strong class="audio-kpi-card__value">
						{{ catalog.summary.crossFormatGroupsCount + catalog.summary.tagConsolidationCount }}
					</strong>
					<span class="audio-kpi-card__sub">
						{{ t('duplicatefinder', '{cross} cross-format, {merge} tag merges', {
							cross: catalog.summary.crossFormatGroupsCount,
							merge: catalog.summary.tagConsolidationCount,
						}) }}
					</span>
				</div>
				<div class="audio-kpi-card">
					<span class="audio-kpi-card__label">{{ t('duplicatefinder', 'Average tag completeness') }}</span>
					<strong class="audio-kpi-card__value">{{ catalog.summary.averageTagCompleteness }}%</strong>
					<span class="audio-kpi-card__sub">
						{{ t('duplicatefinder', '{low} low-bitrate, {missing} sparse tags', {
							low: catalog.summary.lowBitrateGroupsCount,
							missing: catalog.summary.missingTagsGroupsCount,
						}) }}
					</span>
				</div>
			</div>

			<div v-if="catalog.groups.length === 0" class="audio-workbench__empty">
				<p class="audio-workbench__empty-title">
					{{ t('duplicatefinder', 'No audio file duplicates in current scope') }}
				</p>
				<p class="audio-workbench__empty-hint">
					{{ t('duplicatefinder', 'No .mp3, .flac, .ogg, .opus, .m4a, .aac, or .wav duplicate groups matched the selected scope.') }}
				</p>
				<button
					v-if="scope === 'filtered' && allCount > filteredCount"
					type="button"
					class="audio-workbench__primary-btn"
					@click="scope = 'all'">
					<span>{{ t('duplicatefinder', 'Switch to all loaded ({count})', { count: allCount }) }}</span>
				</button>
			</div>

			<div v-else-if="filteredGroups.length === 0" class="audio-workbench__empty">
				<p class="audio-workbench__empty-title">
					{{ t('duplicatefinder', 'No audio tracks match your current filter') }}
				</p>
				<button
					type="button"
					class="audio-workbench__primary-btn"
					@click="resetWorkbenchFilters">
					<span>{{ t('duplicatefinder', 'Reset audio filters') }}</span>
				</button>
			</div>

			<div v-else class="audio-workbench__split">
				<div
					class="audio-workbench__list-pane"
					role="list"
					:aria-label="t('duplicatefinder', 'Duplicate audio tracks')">
					<article
						v-for="item in filteredGroups"
						:key="item.groupKey"
						role="listitem"
						class="audio-track-card"
						:class="{
							'is-selected': activeGroup && activeGroup.groupKey === item.groupKey,
							'is-current': currentDuplicateId !== null && item.groupId === currentDuplicateId,
						}">
						<button
							type="button"
							class="audio-track-card__select-btn"
							:aria-pressed="activeGroup && activeGroup.groupKey === item.groupKey ? 'true' : 'false'"
							@click="selectAudioGroup(item)">
							<div class="audio-track-card__top">
								<span
									class="audio-track-card__codec"
									:class="{ 'is-lossless': item.lossless }">
									{{ item.codec }}
								</span>
								<strong class="audio-track-card__title">{{ item.displayTitle }}</strong>
								<span class="audio-track-card__size">{{ item.reclaimableFormatted }}</span>
							</div>
							<div class="audio-track-card__subtitle">
								<span v-if="item.displayArtist">{{ item.displayArtist }}</span>
								<span v-if="item.displayArtist && item.displayAlbum"> / </span>
								<span v-if="item.displayAlbum">{{ item.displayAlbum }}</span>
								<span v-if="!item.displayArtist && !item.displayAlbum">{{ item.representativePath }}</span>
							</div>
							<div class="audio-track-card__meta">
								<span>{{ t('duplicatefinder', '{count} copies', { count: item.copyCount }) }}</span>
								<span>{{ item.bitrateLabel }}</span>
								<span>{{ t('duplicatefinder', '{percent}% tags', { percent: item.tagCompletenessPercent }) }}</span>
								<span v-if="item.durationFormatted">{{ item.durationFormatted }}</span>
							</div>
							<div
								v-if="hasCardBadges(item)"
								class="audio-track-card__badges">
								<span
									v-if="item.lossless"
									class="audio-badge is-lossless">
									{{ t('duplicatefinder', 'Lossless') }}
								</span>
								<span
									v-if="item.hasLowBitrate"
									class="audio-badge is-warning">
									{{ t('duplicatefinder', 'Low bitrate') }}
								</span>
								<span
									v-if="item.crossFormatMatches.length > 0"
									class="audio-badge is-cross">
									{{ t('duplicatefinder', '{count} cross-format match', { count: item.crossFormatMatches.length }) }}
								</span>
								<span
									v-if="item.consolidation.tagConsolidationNeeded"
									class="audio-badge is-merge">
									{{ t('duplicatefinder', 'Tag merge advisor') }}
								</span>
							</div>
						</button>
						<div class="audio-track-card__quick-actions">
							<button
								type="button"
								class="audio-workbench__mini-btn"
								:disabled="Boolean(loadingByKey[item.groupKey])"
								@click="inspectAudioGroup(item)">
								<span>{{ loadingByKey[item.groupKey]
									? t('duplicatefinder', 'Reading tags...')
									: (item.inspectedFilesCount > 0 ? t('duplicatefinder', 'Re-scan tags') : t('duplicatefinder', 'Read ID3 tags')) }}</span>
							</button>
							<button
								type="button"
								class="audio-workbench__mini-btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Jump') }}</span>
							</button>
							<button
								type="button"
								class="audio-workbench__mini-btn"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</article>
				</div>

				<div v-if="activeGroup" class="audio-workbench__detail-pane">
					<div class="audio-detail__header">
						<div class="audio-detail__identity">
							<h4 class="audio-detail__title">
								{{ activeGroup.displayTitle }}
							</h4>
							<p class="audio-detail__subline">
								<span v-if="activeGroup.displayArtist">{{ activeGroup.displayArtist }}</span>
								<span v-if="activeGroup.displayArtist && activeGroup.displayAlbum"> / </span>
								<span v-if="activeGroup.displayAlbum">{{ activeGroup.displayAlbum }}</span>
							</p>
							<p class="audio-detail__path">
								{{ activeGroup.representativePath }}
							</p>
						</div>

						<div class="audio-detail__actions">
							<button
								type="button"
								class="audio-workbench__primary-btn"
								:disabled="Boolean(loadingByKey[activeGroup.groupKey])"
								@click="inspectAudioGroup(activeGroup)">
								<span>{{ loadingByKey[activeGroup.groupKey]
									? t('duplicatefinder', 'Scanning...')
									: t('duplicatefinder', 'Read ID3 & stream headers') }}</span>
							</button>
							<button
								type="button"
								class="audio-workbench__tool-btn"
								@click="copyConsolidatedTags">
								<span>{{ copiedKey === activeGroup.groupKey
									? t('duplicatefinder', 'Tags copied')
									: t('duplicatefinder', 'Copy tag sheet') }}</span>
							</button>
							<button
								type="button"
								class="audio-workbench__tool-btn"
								@click="$emit('select-duplicate', activeGroup.rawGroup)">
								<span>{{ t('duplicatefinder', 'Jump to group') }}</span>
							</button>
							<button
								type="button"
								class="audio-workbench__danger-btn"
								:disabled="activeGroup.allProtected || activeGroup.deletionCandidates.length === 0 || isDeleting"
								@click="openDeleteDialog(activeGroup)">
								<span>{{ activeGroup.allProtected
									? t('duplicatefinder', 'Protected origin')
									: t('duplicatefinder', 'Delete {count} lower/dup copies', { count: activeGroup.deletionCandidates.length }) }}</span>
							</button>
						</div>
					</div>

					<div class="audio-detail__copies-summary">
						<div class="audio-copies-box">
							<span class="audio-copies-box__title is-keep">
								{{ t('duplicatefinder', 'Surviving master ({reason})', { reason: activeGroup.strategyReason }) }}
							</span>
							<div
								v-for="file in activeGroup.survivors"
								:key="'keep-' + (file.id || file.path)"
								class="audio-copies-box__path">
								{{ file.path }}
							</div>
						</div>
						<div class="audio-copies-box">
							<span class="audio-copies-box__title is-delete">
								{{ t('duplicatefinder', 'Redundant copies ({count} / {size})', {
									count: activeGroup.deletionCandidates.length,
									size: activeGroup.reclaimableFormatted,
								}) }}
							</span>
							<div
								v-if="activeGroup.deletionCandidates.length === 0"
								class="audio-copies-box__empty">
								{{ t('duplicatefinder', 'All copies are protected inside Origin Folders.') }}
							</div>
							<div
								v-for="file in activeGroup.deletionCandidates"
								:key="'del-' + (file.id || file.path)"
								class="audio-copies-box__path">
								{{ file.path }}
							</div>
						</div>
					</div>

					<div
						v-if="activeGroup.consolidation.tagConsolidationNeeded"
						class="audio-detail__merge-banner"
						role="status"
						aria-live="polite">
						<strong>{{ t('duplicatefinder', 'Album Tag Consolidation Advisor') }}</strong>
						<p v-if="activeGroup.consolidation.mergeableFields.length > 0" class="audio-merge-banner__text">
							{{ t('duplicatefinder', 'The surviving master is missing metadata present on redundant copies:') }}
						</p>
						<ul v-if="activeGroup.consolidation.mergeableFields.length > 0" class="audio-merge-list">
							<li
								v-for="field in activeGroup.consolidation.mergeableFields"
								:key="'merge-' + field.field">
								<strong>{{ field.label }}:</strong> {{ field.value }}
								<span class="audio-merge-source">({{ field.sourcePath }})</span>
							</li>
						</ul>
						<p v-if="activeGroup.consolidation.tagConflictFields.length > 0" class="audio-merge-banner__conflict">
							{{ t('duplicatefinder', 'Conflicting tag values across copies: {fields}', {
								fields: activeGroup.consolidation.tagConflictFields.join(', '),
							}) }}
						</p>
					</div>

					<div
						v-if="activeGroup.crossFormatMatches.length > 0"
						class="audio-detail__cross-banner">
						<strong>{{ t('duplicatefinder', 'Cross-format / re-encoded matches ({count})', { count: activeGroup.crossFormatMatches.length }) }}</strong>
						<ul class="audio-cross-list">
							<li
								v-for="peer in activeGroup.crossFormatMatches"
								:key="'peer-' + peer.groupKey"
								class="audio-cross-item">
								<div class="audio-cross-item__info">
									<span class="audio-badge" :class="{ 'is-lossless': peer.lossless }">{{ peer.formatLabel }}</span>
									<strong>{{ peer.displayTitle }}</strong>
									<span>{{ peer.bitrateLabel }}</span>
									<span>{{ t('duplicatefinder', '{percent}% tags', { percent: peer.tagCompletenessPercent }) }}</span>
									<span class="audio-mono">{{ peer.representativePath }}</span>
								</div>
								<button
									type="button"
									class="audio-workbench__mini-btn"
									@click="$emit('select-duplicate', peer.rawGroup)">
									<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
								</button>
							</li>
						</ul>
					</div>

					<div class="audio-detail__consolidated-sheet">
						<div class="audio-sheet__header">
							<h5 class="audio-sheet__title">
								{{ t('duplicatefinder', 'Consolidated Master ID3 / Vorbis Tag Sheet') }}
							</h5>
							<span class="audio-sheet__completeness">
								{{ t('duplicatefinder', 'Completeness: {percent}%', { percent: activeGroup.tagCompletenessPercent }) }}
							</span>
						</div>
						<dl class="audio-tag-grid">
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Title') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.title || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Artist') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.artist || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Album') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.album || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Album Artist') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.albumArtist || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Track #') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.trackNumber || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Year') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.year || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Genre') }}</dt>
								<dd>{{ activeGroup.consolidation.consolidatedTags.genre || t('duplicatefinder', 'Missing') }}</dd>
							</div>
							<div class="audio-tag-cell">
								<dt>{{ t('duplicatefinder', 'Cover Art') }}</dt>
								<dd>
									{{ activeGroup.consolidation.consolidatedTags.hasCoverArt
										? t('duplicatefinder', 'Embedded artwork')
										: t('duplicatefinder', 'None') }}
								</dd>
							</div>
						</dl>
					</div>

					<div class="audio-detail__copies-cards">
						<h5 class="audio-sheet__title">
							{{ t('duplicatefinder', 'Per-copy Audio Stream & Tag Audit ({count})', { count: activeGroup.files.length }) }}
						</h5>
						<div class="audio-copy-audit-list">
							<article
								v-for="entry in activeGroup.files"
								:key="'audit-' + entry.fileKey"
								class="audio-copy-audit-card"
								:class="{ 'is-survivor': isSurvivorFile(entry.raw) }">
								<div class="audio-copy-audit-card__top">
									<span
										class="audio-badge"
										:class="isSurvivorFile(entry.raw) ? 'is-lossless' : 'is-neutral'">
										{{ isSurvivorFile(entry.raw)
											? t('duplicatefinder', 'Survivor')
											: t('duplicatefinder', 'Redundant') }}
									</span>
									<span class="audio-badge is-neutral">{{ entry.meta.formatLabel }}</span>
									<span class="audio-badge is-neutral">
										{{ entry.meta.bitrateKbps > 0
											? entry.meta.bitrateKbps + ' kbps'
											: (entry.meta.lossless ? t('duplicatefinder', 'Lossless') : t('duplicatefinder', 'Stream pending')) }}
									</span>
									<span v-if="entry.meta.sampleRate > 0" class="audio-badge is-neutral">
										{{ Math.round(entry.meta.sampleRate / 100) / 10 }} kHz
									</span>
									<span v-if="entry.meta.durationFormatted" class="audio-badge is-neutral">
										{{ entry.meta.durationFormatted }}
									</span>
									<span class="audio-badge is-neutral">
										{{ t('duplicatefinder', '{percent}% tags', { percent: entry.meta.tagCompletenessPercent }) }}
									</span>
								</div>
								<div class="audio-copy-audit-card__path">
									{{ entry.raw.path }}
								</div>
								<div class="audio-copy-audit-card__tags">
									<span><strong>{{ t('duplicatefinder', 'Title:') }}</strong> {{ entry.meta.title || t('duplicatefinder', 'None') }}</span>
									<span><strong>{{ t('duplicatefinder', 'Artist:') }}</strong> {{ entry.meta.artist || t('duplicatefinder', 'None') }}</span>
									<span><strong>{{ t('duplicatefinder', 'Album:') }}</strong> {{ entry.meta.album || t('duplicatefinder', 'None') }}</span>
									<span><strong>{{ t('duplicatefinder', 'Tag source:') }}</strong> {{ entry.meta.tagFormat }}</span>
								</div>
							</article>
						</div>
					</div>
				</div>
			</div>
		</template>

		<dialog
			ref="audioDeleteDialog"
			class="audio-delete-dialog"
			:aria-label="t('duplicatefinder', 'Confirm deletion of redundant audio copies')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="audio-delete-dialog__content">
				<h4 class="audio-delete-dialog__title">
					{{ t('duplicatefinder', 'Confirm audio duplicate deletion') }}
				</h4>
				<p v-if="pendingDeleteGroup" class="audio-delete-dialog__text">
					{{ t('duplicatefinder', 'Delete {count} redundant audio copies for "{title}" while preserving {survivors} surviving master copy?', {
						count: pendingDeleteGroup.deletionCandidates.length,
						title: pendingDeleteGroup.displayTitle,
						survivors: pendingDeleteGroup.survivors.length,
					}) }}
				</p>
				<p
					v-if="pendingDeleteGroup && pendingDeleteGroup.consolidation.mergeableFields.length > 0"
					class="audio-delete-dialog__warning">
					{{ t('duplicatefinder', 'Note: {count} tag fields on redundant copies are missing from the surviving master. Copy the tag sheet before deleting if you want to preserve them.', {
						count: pendingDeleteGroup.consolidation.mergeableFields.length,
					}) }}
				</p>
				<ul v-if="pendingDeleteGroup" class="audio-delete-dialog__list">
					<li
						v-for="file in pendingDeleteGroup.deletionCandidates"
						:key="'confirm-' + (file.id || file.path)">
						{{ file.path }}
					</li>
				</ul>
				<div class="audio-delete-dialog__actions">
					<button
						type="button"
						class="audio-workbench__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="audio-workbench__danger-btn"
						:disabled="isDeleting"
						@click="confirmDeleteRedundantAudio">
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
import { copyTextSafely } from '../tools/clipboardHelper'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { normalizeItemPath } from '../tools/utils'
import {
	AUDIO_RANGE_HEAD_BYTES,
	AUDIO_RANGE_TAIL_BYTES,
	MAX_AUDIO_FETCH_BYTES,
	buildAudioAuditCsv,
	buildAudioAuditJson,
	buildAudioConsolidationCatalog,
	filterAndSortAudioGroups,
	formatConsolidatedTagsText,
	parseAudioTrackMetadata,
} from '../tools/audioTagConsolidator'

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
	name: 'AudioTagWorkbench',
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
			keepRule: 'balanced_master',
			sortBy: 'reclaimable-desc',
			categoryFilter: 'all',
			searchQuery: '',
			selectedGroupKey: '',
			inspectedByFileKey: {},
			loadingByKey: {},
			batchInspecting: false,
			isDeleting: false,
			pendingDeleteGroup: null,
			lastFocusBeforeDialog: null,
			copiedKey: '',
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
		catalog() {
			return buildAudioConsolidationCatalog(this.scopedDuplicates, this.inspectedByFileKey, {
				keepRule: this.keepRule,
			})
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: this.catalog.groups.length }) },
				{ id: 'lossless', label: this.t('duplicatefinder', 'Lossless') },
				{ id: 'lossy-low', label: this.t('duplicatefinder', 'Low Bitrate') },
				{ id: 'missing-tags', label: this.t('duplicatefinder', 'Sparse Tags') },
				{ id: 'cross-format', label: this.t('duplicatefinder', 'Cross-Format') },
				{ id: 'tag-merge', label: this.t('duplicatefinder', 'Tag Merge') },
			]
		},
		filteredGroups() {
			return filterAndSortAudioGroups(this.catalog.groups, {
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
			return Boolean(
				item && (
					item.lossless
					|| item.hasLowBitrate
					|| item.crossFormatMatches.length > 0
					|| item.consolidation.tagConsolidationNeeded
				),
			)
		},
		isSurvivorFile(file) {
			if (!this.activeGroup || !file) {
				return false
			}
			const key = getFileSelectionKey(file)
			return this.activeGroup.survivors.some(s => getFileSelectionKey(s) === key)
		},
		selectAudioGroup(item) {
			if (!item) {
				return
			}
			this.selectedGroupKey = item.groupKey
		},
		resetWorkbenchFilters() {
			this.categoryFilter = 'all'
			this.searchQuery = ''
		},
		resolveAudioFetchUrl(file) {
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
		async inspectSingleFile(file) {
			if (!file) {
				return null
			}
			if (file.audioTags) {
				return parseAudioTrackMetadata(null, file)
			}
			if (file.audioBuffer) {
				return parseAudioTrackMetadata(file.audioBuffer, file, {
					tailBuffer: file.audioTailBuffer || null,
				})
			}

			const url = this.resolveAudioFetchUrl(file)
			if (!url || typeof fetch !== 'function') {
				return parseAudioTrackMetadata(null, file)
			}

			const size = Number(file.size) || 0
			try {
				if (size > 0 && size <= MAX_AUDIO_FETCH_BYTES) {
					const response = await fetch(url)
					if (response && response.ok && typeof response.arrayBuffer === 'function') {
						const buffer = await response.arrayBuffer()
						return parseAudioTrackMetadata(buffer, file)
					}
				} else {
					const headRes = await fetch(url, {
						headers: { Range: `bytes=0-${AUDIO_RANGE_HEAD_BYTES - 1}` },
					})
					const headBuf = headRes && headRes.ok && typeof headRes.arrayBuffer === 'function'
						? await headRes.arrayBuffer()
						: null
					let tailBuf = null
					if (size > AUDIO_RANGE_TAIL_BYTES) {
						const tailStart = Math.max(0, size - AUDIO_RANGE_TAIL_BYTES)
						const tailRes = await fetch(url, {
							headers: { Range: `bytes=${tailStart}-${size - 1}` },
						})
						if (tailRes && tailRes.ok && typeof tailRes.arrayBuffer === 'function') {
							tailBuf = await tailRes.arrayBuffer()
						}
					}
					if (headBuf) {
						return parseAudioTrackMetadata(headBuf, file, { tailBuffer: tailBuf })
					}
				}
			} catch (error) {
				return parseAudioTrackMetadata(null, file)
			}
			return parseAudioTrackMetadata(null, file)
		},
		async inspectAudioGroup(item, options = {}) {
			if (!item || this.loadingByKey[item.groupKey]) {
				return
			}
			if (options.select !== false) {
				this.selectedGroupKey = item.groupKey
			}
			this.$set(this.loadingByKey, item.groupKey, true)
			try {
				for (const wrapper of item.files) {
					const parsed = await this.inspectSingleFile(wrapper.raw)
					if (parsed) {
						this.$set(this.inspectedByFileKey, wrapper.fileKey, parsed)
					}
				}
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
					await this.inspectAudioGroup(item, { select: false })
				}
			} finally {
				this.batchInspecting = false
			}
		},
		async copyConsolidatedTags() {
			if (!this.activeGroup) {
				return
			}
			const text = formatConsolidatedTagsText(this.activeGroup)
			const ok = await copyTextSafely(text)
			if (ok) {
				this.copiedKey = this.activeGroup.groupKey
			}
		},
		openDeleteDialog(group) {
			if (!group || group.allProtected || group.deletionCandidates.length === 0 || this.isDeleting) {
				return
			}
			this.pendingDeleteGroup = group
			this.lastFocusBeforeDialog = typeof document !== 'undefined' ? document.activeElement : null
			const dialog = this.$refs.audioDeleteDialog
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
			const dialog = this.$refs.audioDeleteDialog
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
			if (event && event.target === this.$refs.audioDeleteDialog) {
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
		async confirmDeleteRedundantAudio() {
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
					this.$emit('audio-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						bytesReclaimed,
						groupsResolved: deletedFiles.length >= group.copyCount - 1 ? 1 : 0,
						sampleLabel: group.displayTitle,
					})
				}
				this.closeDeleteDialog()
			} finally {
				this.isDeleting = false
			}
		},
		exportAuditJson() {
			const jsonText = buildAudioAuditJson(this.catalog, this.activeGroup)
			downloadTextFile('duplicatefinder-audio-tag-consolidator.json', jsonText, 'application/json;charset=utf-8')
		},
		exportAuditCsv() {
			const csvText = buildAudioAuditCsv(this.catalog)
			downloadTextFile('duplicatefinder-audio-tag-consolidator.csv', csvText, 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.audio-tag-workbench {
	margin-block-end: 16px;
	padding-block: 16px;
	padding-inline: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
}

.audio-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	margin-block-end: 14px;
}

.audio-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.audio-workbench__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.audio-workbench__status-badge {
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.audio-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.audio-workbench__tool-btn,
.audio-workbench__seg-btn,
.audio-workbench__mini-btn,
.audio-workbench__primary-btn,
.audio-workbench__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 120ms ease, border-color 120ms ease;
}

.audio-workbench__mini-btn {
	min-block-size: 32px;
	padding-block: 4px;
	padding-inline: 9px;
	font-size: 0.78rem;
}

.audio-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.audio-workbench__danger-btn {
	background-color: var(--color-error, #c62828);
	border-color: var(--color-error, #c62828);
	color: #fff;
}

.audio-workbench__tool-btn:hover:not(:disabled),
.audio-workbench__seg-btn:hover:not(:disabled),
.audio-workbench__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.audio-workbench__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.audio-workbench__tool-btn:disabled,
.audio-workbench__seg-btn:disabled,
.audio-workbench__mini-btn:disabled,
.audio-workbench__primary-btn:disabled,
.audio-workbench__danger-btn:disabled {
	opacity: 0.52;
	cursor: not-allowed;
}

.audio-workbench__tool-btn:focus-visible,
.audio-workbench__seg-btn:focus-visible,
.audio-workbench__mini-btn:focus-visible,
.audio-workbench__primary-btn:focus-visible,
.audio-workbench__danger-btn:focus-visible,
.audio-workbench__select:focus-visible,
.audio-workbench__search-input:focus-visible,
.audio-track-card__select-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.audio-workbench__empty {
	padding-block: 24px;
	padding-inline: 16px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
	text-align: center;
}

.audio-workbench__empty-title {
	margin: 0 0 6px;
	font-weight: 700;
	font-size: 0.96rem;
}

.audio-workbench__empty-hint {
	margin: 0 auto 14px;
	max-inline-size: 62ch;
	color: var(--color-text-maxcontrast);
	font-size: 0.86rem;
}

.audio-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	margin-block-end: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.audio-workbench__control-row,
.audio-workbench__filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.audio-workbench__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.audio-workbench__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.audio-workbench__select-field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.audio-workbench__select,
.audio-workbench__search-input {
	min-block-size: 36px;
	padding-block: 4px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
}

.audio-workbench__search-wrap {
	flex: 1 1 220px;
	min-inline-size: 0;
}

.audio-workbench__search-input {
	inline-size: 100%;
	box-sizing: border-box;
}

.audio-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin-block-end: 14px;
}

.audio-kpi-card {
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

.audio-kpi-card__label {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.audio-kpi-card__value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.audio-kpi-card__sub {
	font-size: 0.75rem;
	color: var(--color-text-maxcontrast);
}

.audio-workbench__split {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
	gap: 14px;
	align-items: start;
}

.audio-workbench__list-pane {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 680px;
	overflow-y: auto;
	min-inline-size: 0;
}

.audio-track-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

.audio-track-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.audio-track-card__select-btn {
	display: flex;
	flex-direction: column;
	gap: 5px;
	inline-size: 100%;
	padding: 4px;
	border: none;
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.audio-track-card__top {
	display: flex;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.audio-track-card__codec {
	flex-shrink: 0;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.7rem;
	font-weight: 700;
}

.audio-track-card__codec.is-lossless {
	border-color: #2e7d32;
	color: #1b5e20;
	background-color: rgba(46, 125, 50, 0.12);
}

.audio-track-card__title {
	flex: 1 1 auto;
	min-inline-size: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.88rem;
}

.audio-track-card__size {
	flex-shrink: 0;
	font-size: 0.8rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.audio-track-card__subtitle {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.audio-track-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.audio-track-card__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.audio-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.7rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.audio-badge.is-lossless {
	border-color: rgba(46, 125, 50, 0.45);
	background-color: rgba(46, 125, 50, 0.12);
	color: #1b5e20;
}

.audio-badge.is-warning {
	border-color: rgba(198, 40, 40, 0.45);
	background-color: rgba(198, 40, 40, 0.1);
	color: #b71c1c;
}

.audio-badge.is-cross {
	border-color: rgba(21, 101, 192, 0.4);
	background-color: rgba(21, 101, 192, 0.1);
	color: #0d47a1;
}

.audio-badge.is-merge {
	border-color: rgba(230, 81, 0, 0.4);
	background-color: rgba(230, 81, 0, 0.1);
	color: #bf360c;
}

.audio-track-card__quick-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.audio-workbench__detail-pane {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 14px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.audio-detail__header {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.audio-detail__title {
	margin: 0 0 2px;
	font-size: 1rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.audio-detail__subline {
	margin: 0 0 4px;
	font-size: 0.86rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.audio-detail__path {
	margin: 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.audio-detail__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.audio-detail__copies-summary {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.audio-copies-box {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.audio-copies-box__title {
	display: block;
	font-size: 0.78rem;
	font-weight: 700;
	margin-block-end: 6px;
}

.audio-copies-box__title.is-keep {
	color: #1b5e20;
}

.audio-copies-box__title.is-delete {
	color: #b71c1c;
}

.audio-copies-box__path,
.audio-copies-box__empty {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
	margin-block-end: 3px;
}

.audio-detail__merge-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid rgba(230, 81, 0, 0.35);
	border-radius: var(--border-radius, 6px);
	background-color: rgba(230, 81, 0, 0.06);
	font-size: 0.82rem;
}

.audio-merge-banner__text,
.audio-merge-banner__conflict {
	margin: 4px 0;
}

.audio-merge-list {
	margin: 6px 0;
	padding-inline-start: 18px;
	overflow-wrap: anywhere;
}

.audio-merge-source {
	color: var(--color-text-maxcontrast);
	font-size: 0.76rem;
}

.audio-detail__cross-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid rgba(21, 101, 192, 0.35);
	border-radius: var(--border-radius, 6px);
	background-color: rgba(21, 101, 192, 0.06);
	font-size: 0.82rem;
}

.audio-cross-list {
	list-style: none;
	margin: 8px 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.audio-cross-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.audio-cross-item__info {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.audio-mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
}

.audio-detail__consolidated-sheet {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.audio-sheet__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-block-end: 8px;
}

.audio-sheet__title {
	margin: 0;
	font-size: 0.88rem;
	font-weight: 700;
}

.audio-sheet__completeness {
	font-size: 0.78rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.audio-tag-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	margin: 0;
}

.audio-tag-cell {
	padding-block: 6px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.audio-tag-cell dt {
	font-size: 0.7rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	margin-block-end: 2px;
}

.audio-tag-cell dd {
	margin: 0;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.audio-detail__copies-cards {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.audio-copy-audit-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.audio-copy-audit-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.audio-copy-audit-card.is-survivor {
	border-color: rgba(46, 125, 50, 0.55);
}

.audio-copy-audit-card__top {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.audio-copy-audit-card__path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
}

.audio-copy-audit-card__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.audio-delete-dialog {
	max-inline-size: 520px;
	inline-size: calc(100% - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.audio-delete-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.55);
}

.audio-delete-dialog__content {
	padding-block: 18px;
	padding-inline: 18px;
}

.audio-delete-dialog__title {
	margin: 0 0 8px;
	font-size: 1rem;
}

.audio-delete-dialog__text {
	margin: 0 0 10px;
	font-size: 0.88rem;
}

.audio-delete-dialog__warning {
	margin: 0 0 10px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	background-color: rgba(230, 81, 0, 0.1);
	font-size: 0.8rem;
}

.audio-delete-dialog__list {
	margin: 0 0 14px;
	padding-inline-start: 18px;
	max-block-size: 180px;
	overflow-y: auto;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.audio-delete-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.audio-workbench__kpis,
	.audio-tag-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.audio-workbench__split,
	.audio-detail__copies-summary {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.audio-tag-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.audio-workbench__kpis,
	.audio-tag-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.audio-workbench__tool-btn,
	.audio-workbench__seg-btn,
	.audio-workbench__mini-btn,
	.audio-workbench__primary-btn,
	.audio-workbench__danger-btn,
	.audio-workbench__select,
	.audio-workbench__search-input,
	.audio-track-card__select-btn {
		min-block-size: 45px;
	}
}
</style>
