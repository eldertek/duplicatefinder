<template>
	<section
		class="video-scene-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Video Frame Fingerprint, Codec Quality and Duration Tolerance Inspector')">
		<header class="video-workbench__toolbar">
			<div class="video-workbench__title-group">
				<h3 class="video-workbench__title">
					{{ t('duplicatefinder', 'Video Scene & Codec Quality Inspector') }}
				</h3>
				<span
					class="video-workbench__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{count} video groups ({reclaimable} reclaimable)', {
						count: catalog.summary.totalVideoGroups,
						reclaimable: catalog.summary.totalReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="video-workbench__toolbar-actions">
				<button
					type="button"
					class="video-workbench__tool-btn"
					:disabled="filteredGroups.length === 0 || batchProbing || isDeleting"
					@click="probeAllVisible">
					<span>{{ batchProbing
						? t('duplicatefinder', 'Probing streams...')
						: t('duplicatefinder', 'Probe visible') }}</span>
				</button>
				<button
					type="button"
					class="video-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="video-workbench__tool-btn"
					:disabled="catalog.groups.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="video-workbench__tool-btn is-close"
					aria-keyshortcuts="3"
					:title="t('duplicatefinder', 'Hide video scene and codec inspector')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide video') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="video-workbench__empty">
			<p class="video-workbench__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="video-workbench__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect MP4, MOV, MKV, WebM, and AVI duplicates for codec efficiency, resolution tiers, duration drift, and keyframe dHash similarity.') }}
			</p>
			<button
				type="button"
				class="video-workbench__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="video-workbench__controls">
				<div class="video-workbench__control-row">
					<span class="video-workbench__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="video-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Video inspection scope')">
						<button
							type="button"
							class="video-workbench__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="video-workbench__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="video-workbench__select-field">
						<span class="video-workbench__control-label">{{ t('duplicatefinder', 'Keep survivor') }}</span>
						<select
							v-model="keepRule"
							class="video-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Video keep survivor strategy')">
							<option value="balanced_master">
								{{ t('duplicatefinder', 'Best resolution & codec quality') }}
							</option>
							<option value="highest_resolution">
								{{ t('duplicatefinder', 'Highest pixel resolution') }}
							</option>
							<option value="highest_bitrate">
								{{ t('duplicatefinder', 'Highest bitrate stream') }}
							</option>
							<option value="smallest_efficient">
								{{ t('duplicatefinder', 'Smallest efficient HD codec') }}
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

					<label class="video-workbench__select-field">
						<span class="video-workbench__control-label">{{ t('duplicatefinder', 'Sort videos') }}</span>
						<select
							v-model="sortBy"
							class="video-workbench__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort video groups')">
							<option value="reclaimable-desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="resolution-desc">
								{{ t('duplicatefinder', 'Highest resolution') }}
							</option>
							<option value="bitrate-desc">
								{{ t('duplicatefinder', 'Highest bitrate') }}
							</option>
							<option value="duration-desc">
								{{ t('duplicatefinder', 'Longest duration') }}
							</option>
							<option value="copies-desc">
								{{ t('duplicatefinder', 'Most copies') }}
							</option>
						</select>
					</label>
				</div>

				<div class="video-workbench__tolerance-row">
					<label class="video-workbench__threshold-field">
						<span class="video-workbench__control-label">
							{{ t('duplicatefinder', 'Duration tolerance (%)') }}
						</span>
						<div class="video-workbench__threshold-inputs">
							<input
								v-model.number="durationTolerancePct"
								type="range"
								min="0"
								max="25"
								step="1"
								class="video-workbench__range"
								:aria-label="t('duplicatefinder', 'Duration tolerance percentage slider')"
								@input="syncDurationDraft">
							<input
								:value="durationToleranceDraft"
								type="number"
								min="0"
								max="25"
								step="1"
								class="video-workbench__number-input"
								:aria-label="t('duplicatefinder', 'Duration tolerance percentage')"
								@input="onDurationDraftInput"
								@blur="commitDurationDraft">
						</div>
					</label>

					<label class="video-workbench__threshold-field">
						<span class="video-workbench__control-label">
							{{ t('duplicatefinder', 'Frame dHash threshold (%)') }}
						</span>
						<div class="video-workbench__threshold-inputs">
							<input
								v-model.number="similarityThreshold"
								type="range"
								min="60"
								max="100"
								step="1"
								class="video-workbench__range"
								:aria-label="t('duplicatefinder', 'Frame perceptual similarity threshold slider')"
								@input="syncSimilarityDraft">
							<input
								:value="similarityThresholdDraft"
								type="number"
								min="60"
								max="100"
								step="1"
								class="video-workbench__number-input"
								:aria-label="t('duplicatefinder', 'Frame perceptual similarity threshold')"
								@input="onSimilarityDraftInput"
								@blur="commitSimilarityDraft">
						</div>
					</label>
				</div>

				<div class="video-workbench__filter-row">
					<div
						class="video-workbench__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Filter video groups')">
						<button
							v-for="option in categoryOptions"
							:key="option.id"
							type="button"
							class="video-workbench__seg-btn"
							:class="{ 'is-active': categoryFilter === option.id }"
							:aria-pressed="categoryFilter === option.id ? 'true' : 'false'"
							@click="categoryFilter = option.id">
							<span>{{ option.label }}</span>
						</button>
					</div>

					<div class="video-workbench__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="video-workbench__search-input"
							:aria-label="t('duplicatefinder', 'Search video filename, codec, resolution, or path')"
							:placeholder="t('duplicatefinder', 'Filter filename, codec, 4K, 1080p...')">
					</div>
				</div>
			</div>

			<div class="video-workbench__kpis">
				<div class="video-kpi-card">
					<span class="video-kpi-card__label">{{ t('duplicatefinder', 'Video groups') }}</span>
					<strong class="video-kpi-card__value">{{ catalog.summary.totalVideoGroups }}</strong>
					<span class="video-kpi-card__sub">
						{{ t('duplicatefinder', '{hd} HD/4K, {probed} keyframe-probed', {
							hd: catalog.summary.uhdAndHdCount,
							probed: catalog.summary.probedFramesCount,
						}) }}
					</span>
				</div>
				<div class="video-kpi-card">
					<span class="video-kpi-card__label">{{ t('duplicatefinder', 'Reclaimable space') }}</span>
					<strong class="video-kpi-card__value">{{ catalog.summary.totalReclaimableFormatted }}</strong>
					<span class="video-kpi-card__sub">
						{{ t('duplicatefinder', '{files} total video files', {
							files: catalog.summary.totalVideoFiles,
						}) }}
					</span>
				</div>
				<div class="video-kpi-card">
					<span class="video-kpi-card__label">{{ t('duplicatefinder', 'Duration & scene matches') }}</span>
					<strong class="video-kpi-card__value">{{ catalog.summary.durationMatchAlertsCount }}</strong>
					<span class="video-kpi-card__sub">
						{{ t('duplicatefinder', 'Within +/-{tol}% duration window', {
							tol: catalog.summary.durationTolerancePct,
						}) }}
					</span>
				</div>
				<div class="video-kpi-card">
					<span class="video-kpi-card__label">{{ t('duplicatefinder', 'Re-encode & resolution gaps') }}</span>
					<strong class="video-kpi-card__value">{{ catalog.summary.lowResOrReencodeCount }}</strong>
					<span class="video-kpi-card__sub">
						{{ t('duplicatefinder', '{scanned} container-inspected', {
							scanned: catalog.summary.containerScannedCount,
						}) }}
					</span>
				</div>
			</div>

			<div
				v-if="statusNotice"
				class="video-workbench__notice"
				:class="{ 'is-error': statusNoticeType === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</div>

			<div v-if="catalog.groups.length === 0" class="video-workbench__empty">
				<p class="video-workbench__empty-title">
					{{ t('duplicatefinder', 'No video file duplicates in current scope') }}
				</p>
				<p class="video-workbench__empty-hint">
					{{ t('duplicatefinder', 'No .mp4, .mov, .mkv, .webm, .avi, or .m4v duplicate groups matched the selected scope.') }}
				</p>
				<button
					v-if="scope === 'filtered' && allCount > filteredCount"
					type="button"
					class="video-workbench__primary-btn"
					@click="scope = 'all'">
					<span>{{ t('duplicatefinder', 'Switch to all loaded ({count})', { count: allCount }) }}</span>
				</button>
			</div>

			<div v-else-if="filteredGroups.length === 0" class="video-workbench__empty">
				<p class="video-workbench__empty-title">
					{{ t('duplicatefinder', 'No videos match your current filter') }}
				</p>
				<button
					type="button"
					class="video-workbench__primary-btn"
					@click="resetWorkbenchFilters">
					<span>{{ t('duplicatefinder', 'Reset video filters') }}</span>
				</button>
			</div>

			<div v-else class="video-workbench__split">
				<div
					class="video-workbench__list-pane"
					role="list"
					:aria-label="t('duplicatefinder', 'Duplicate video groups')">
					<article
						v-for="item in filteredGroups"
						:key="item.groupKey"
						role="listitem"
						class="video-card"
						:class="{
							'is-selected': activeGroup && activeGroup.groupKey === item.groupKey,
							'is-current': currentDuplicateId !== null && item.groupId === currentDuplicateId,
						}">
						<button
							type="button"
							class="video-card__select-btn"
							:aria-pressed="activeGroup && activeGroup.groupKey === item.groupKey ? 'true' : 'false'"
							@click="selectVideoGroup(item)">
							<div class="video-card__top">
								<span
									class="video-card__res-pill"
									:class="'is-' + item.resolutionTier.id">
									{{ item.resolutionTier.label }}
								</span>
								<strong class="video-card__title">{{ item.displayTitle }}</strong>
								<span class="video-card__size">{{ item.reclaimableFormatted }}</span>
							</div>
							<div class="video-card__path">
								{{ item.representativePath }}
							</div>
							<div class="video-card__meta">
								<span>{{ item.container }} / {{ item.videoCodec }}</span>
								<span>{{ t('duplicatefinder', '{count} copies', { count: item.copyCount }) }}</span>
								<span v-if="item.durationFormatted">{{ item.durationFormatted }}</span>
								<span>{{ item.bitrateLabel }}</span>
								<span v-if="item.fps > 0">{{ item.fps }} fps</span>
							</div>
							<div
								v-if="hasCardBadges(item)"
								class="video-card__badges">
								<span
									v-if="item.crossGroupMatches.length > 0"
									class="video-badge is-match">
									{{ t('duplicatefinder', '{count} scene/duration match', { count: item.crossGroupMatches.length }) }}
								</span>
								<span
									v-if="item.hasResolutionMismatch"
									class="video-badge is-warning">
									{{ t('duplicatefinder', 'Resolution gap') }}
								</span>
								<span
									v-if="item.hasCodecMismatch"
									class="video-badge is-info">
									{{ t('duplicatefinder', 'Mixed codecs') }}
								</span>
								<span
									v-if="item.hasProbedFrames"
									class="video-badge is-probed">
									{{ t('duplicatefinder', '{count} keyframes', { count: item.keyframes.length }) }}
								</span>
							</div>
						</button>
						<div class="video-card__quick-actions">
							<button
								type="button"
								class="video-workbench__mini-btn"
								:disabled="Boolean(loadingByKey[item.groupKey])"
								@click="probeVideoGroup(item)">
								<span>{{ loadingByKey[item.groupKey]
									? t('duplicatefinder', 'Probing...')
									: (item.inspectedFilesCount > 0 ? t('duplicatefinder', 'Re-probe') : t('duplicatefinder', 'Probe frames')) }}</span>
							</button>
							<button
								type="button"
								class="video-workbench__mini-btn"
								@click="$emit('select-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Jump') }}</span>
							</button>
							<button
								type="button"
								class="video-workbench__mini-btn"
								@click="$emit('compare-duplicate', item.rawGroup)">
								<span>{{ t('duplicatefinder', 'Compare') }}</span>
							</button>
						</div>
					</article>
				</div>

				<div v-if="activeGroup" class="video-workbench__detail-pane">
					<div class="video-detail__header">
						<div class="video-detail__identity">
							<h4 class="video-detail__title">
								{{ activeGroup.displayTitle }}
							</h4>
							<p class="video-detail__subline">
								{{ activeGroup.container }} / {{ activeGroup.videoCodec }}
								<span v-if="activeGroup.audioCodec"> + {{ activeGroup.audioCodec }}</span>
								<span v-if="activeGroup.resolutionLabel !== 'Unknown'"> ({{ activeGroup.resolutionLabel }})</span>
							</p>
							<p class="video-detail__path">
								{{ activeGroup.representativePath }}
							</p>
						</div>

						<div class="video-detail__actions">
							<button
								type="button"
								class="video-workbench__primary-btn"
								:disabled="Boolean(loadingByKey[activeGroup.groupKey])"
								@click="probeVideoGroup(activeGroup)">
								<span>{{ loadingByKey[activeGroup.groupKey]
									? t('duplicatefinder', 'Probing streams...')
									: t('duplicatefinder', 'Probe headers & 5 keyframes') }}</span>
							</button>
							<button
								type="button"
								class="video-workbench__tool-btn"
								@click="copyVideoSheet">
								<span>{{ copiedKey === activeGroup.groupKey
									? t('duplicatefinder', 'Sheet copied')
									: t('duplicatefinder', 'Copy video sheet') }}</span>
							</button>
							<button
								type="button"
								class="video-workbench__tool-btn"
								@click="$emit('select-duplicate', activeGroup.rawGroup)">
								<span>{{ t('duplicatefinder', 'Jump to group') }}</span>
							</button>
							<button
								type="button"
								class="video-workbench__danger-btn"
								:disabled="activeGroup.allProtected || activeGroup.deletionCandidates.length === 0 || isDeleting"
								@click="openDeleteDialog(activeGroup)">
								<span>{{ activeGroup.allProtected
									? t('duplicatefinder', 'Protected origin')
									: t('duplicatefinder', 'Delete {count} redundant copies', { count: activeGroup.deletionCandidates.length }) }}</span>
							</button>
						</div>
					</div>

					<div class="video-detail__copies-summary">
						<div class="video-copies-box">
							<span class="video-copies-box__title is-keep">
								{{ t('duplicatefinder', 'Surviving master ({reason})', { reason: activeGroup.strategyReason }) }}
							</span>
							<div
								v-for="file in activeGroup.survivors"
								:key="'keep-' + (file.id || file.path)"
								class="video-copies-box__path">
								{{ file.path }}
							</div>
						</div>
						<div class="video-copies-box">
							<span class="video-copies-box__title is-delete">
								{{ t('duplicatefinder', 'Redundant copies ({count} / {size})', {
									count: activeGroup.deletionCandidates.length,
									size: activeGroup.reclaimableFormatted,
								}) }}
							</span>
							<div
								v-if="activeGroup.deletionCandidates.length === 0"
								class="video-copies-box__empty">
								{{ t('duplicatefinder', 'No non-protected redundant copies to remove.') }}
							</div>
							<div
								v-for="file in activeGroup.deletionCandidates"
								:key="'del-' + (file.id || file.path)"
								class="video-copies-box__path">
								{{ file.path }}
							</div>
						</div>
					</div>

					<div
						v-if="activeGroup.crossGroupMatches.length > 0"
						class="video-detail__cross-banner">
						<strong>{{ t('duplicatefinder', 'Cross-Group Duration & Scene Matches') }}</strong>
						<ul class="video-cross-list">
							<li
								v-for="match in activeGroup.crossGroupMatches"
								:key="match.targetGroupKey"
								class="video-cross-item">
								<div class="video-cross-item__info">
									<span class="video-badge is-match">{{ match.similarityPercent }}%</span>
									<span class="video-mono">{{ match.targetTitle }}</span>
									<span class="video-cross-item__meta">
										{{ match.targetResolution }} / {{ match.targetCodec }} / {{ match.targetDuration || 'Unknown' }}
									</span>
									<span class="video-cross-item__reason">{{ match.reason }}</span>
								</div>
								<div class="video-cross-item__actions">
									<button
										type="button"
										class="video-workbench__mini-btn"
										@click="$emit('select-duplicate', match.targetRawGroup)">
										<span>{{ t('duplicatefinder', 'Jump') }}</span>
									</button>
									<button
										type="button"
										class="video-workbench__mini-btn"
										@click="$emit('compare-duplicate', match.targetRawGroup)">
										<span>{{ t('duplicatefinder', 'Compare') }}</span>
									</button>
								</div>
							</li>
						</ul>
					</div>

					<div class="video-detail__spec-sheet">
						<div class="video-sheet__header">
							<h5 class="video-sheet__title">
								{{ t('duplicatefinder', 'Master Stream & Codec Profile') }}
							</h5>
							<span class="video-sheet__score">
								{{ t('duplicatefinder', 'Quality score: {score}/100', { score: activeGroup.qualityScore }) }}
							</span>
						</div>
						<dl class="video-spec-grid">
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Resolution') }}</dt>
								<dd>{{ activeGroup.resolutionLabel }} ({{ activeGroup.resolutionTier.label }})</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Aspect Ratio') }}</dt>
								<dd>{{ activeGroup.aspectRatio || t('duplicatefinder', 'Unknown') }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Video Codec') }}</dt>
								<dd>{{ activeGroup.videoCodec }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Audio Stream') }}</dt>
								<dd>{{ activeGroup.audioCodec || t('duplicatefinder', 'Unknown / None') }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Duration') }}</dt>
								<dd>{{ activeGroup.durationFormatted || t('duplicatefinder', 'Unknown') }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Frame Rate') }}</dt>
								<dd>{{ activeGroup.fps > 0 ? activeGroup.fps + ' fps' : t('duplicatefinder', 'Unknown') }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Bitrate') }}</dt>
								<dd>{{ activeGroup.bitrateLabel }}</dd>
							</div>
							<div class="video-spec-cell">
								<dt>{{ t('duplicatefinder', 'Container') }}</dt>
								<dd>{{ activeGroup.container }}</dd>
							</div>
						</dl>
					</div>

					<div class="video-detail__keyframes-section">
						<div class="video-sheet__header">
							<h5 class="video-sheet__title">
								{{ t('duplicatefinder', '5-Keyframe Perceptual Timeline (dHash)') }}
							</h5>
							<span class="video-sheet__score">
								{{ activeGroup.keyframes.length > 0
									? t('duplicatefinder', '{count} sampled checkpoints', { count: activeGroup.keyframes.length })
									: t('duplicatefinder', 'Not probed yet') }}
							</span>
						</div>

						<div
							v-if="activeGroup.keyframes.length === 0"
							class="video-keyframes-empty">
							{{ t('duplicatefinder', 'Click "Probe headers & 5 keyframes" to extract container atom metadata and 64-bit dHash scene fingerprints at 10%, 30%, 50%, 70%, and 90% timestamps.') }}
						</div>

						<div v-else class="video-keyframes-strip">
							<div
								v-for="(kf, kfIdx) in activeGroup.keyframes"
								:key="kfIdx"
								class="video-keyframe-card"
								:class="{ 'is-blank': kf.isBlank }">
								<img
									v-if="kf.thumbnailDataUrl"
									:src="kf.thumbnailDataUrl"
									:alt="t('duplicatefinder', 'Video keyframe at {ts}', { ts: kf.timestampLabel })"
									class="video-keyframe-card__thumb">
								<div v-else class="video-keyframe-card__placeholder">
									{{ kf.positionPercent }}%
								</div>
								<div class="video-keyframe-card__info">
									<strong class="video-keyframe-card__ts">{{ kf.timestampLabel }}</strong>
									<code class="video-keyframe-card__hash">{{ kf.dHash }}</code>
									<span v-if="kf.isBlank" class="video-badge is-warning">
										{{ t('duplicatefinder', 'Blank/fade') }}
									</span>
								</div>
							</div>
						</div>
					</div>

					<div class="video-detail__copies-cards">
						<h5 class="video-sheet__title">
							{{ t('duplicatefinder', 'Per-Copy Quality & Container Audit') }}
						</h5>
						<div class="video-copy-audit-list">
							<div
								v-for="wrapper in activeGroup.files"
								:key="wrapper.fileKey"
								class="video-copy-audit-card"
								:class="{ 'is-survivor': isSurvivorFile(wrapper.raw) }">
								<div class="video-copy-audit-card__top">
									<span
										class="video-badge"
										:class="isSurvivorFile(wrapper.raw) ? 'is-probed' : 'is-warning'">
										{{ isSurvivorFile(wrapper.raw)
											? t('duplicatefinder', 'Keep Master')
											: (wrapper.raw.isProtectedOrigin ? t('duplicatefinder', 'Protected') : t('duplicatefinder', 'Redundant')) }}
									</span>
									<span class="video-badge is-info">{{ wrapper.meta.container }}</span>
									<span v-if="wrapper.meta.videoCodec" class="video-badge is-info">{{ wrapper.meta.videoCodec }}</span>
									<span class="video-badge is-info">{{ wrapper.meta.resolutionLabel }}</span>
									<span class="video-badge is-info">{{ wrapper.meta.qualityScore }}/100</span>
								</div>
								<div class="video-copy-audit-card__path">
									{{ wrapper.raw.path }}
								</div>
								<div class="video-copy-audit-card__meta">
									<span>{{ t('duplicatefinder', 'Size: {size}', { size: formatSize(wrapper.raw.size) }) }}</span>
									<span>{{ wrapper.meta.bitrateLabel }}</span>
									<span v-if="wrapper.meta.durationFormatted">{{ wrapper.meta.durationFormatted }}</span>
									<span v-if="wrapper.meta.fps > 0">{{ wrapper.meta.fps }} fps</span>
									<span>{{ t('duplicatefinder', 'Source: {src}', { src: wrapper.meta.metadataSource }) }}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>

		<dialog
			ref="videoDeleteDialog"
			class="video-delete-dialog"
			:aria-label="t('duplicatefinder', 'Confirm redundant video deletion')"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div v-if="pendingDeleteGroup" class="video-delete-dialog__content">
				<h4 class="video-delete-dialog__title">
					{{ t('duplicatefinder', 'Delete {count} redundant video copies?', {
						count: pendingDeleteGroup.deletionCandidates.length,
					}) }}
				</h4>
				<p class="video-delete-dialog__text">
					{{ t('duplicatefinder', 'Strategy "{strategy}" keeps the highest-quality surviving master and moves {size} of redundant video copies to Nextcloud Trash.', {
						strategy: pendingDeleteGroup.strategyReason,
						size: pendingDeleteGroup.reclaimableFormatted,
					}) }}
				</p>
				<ul class="video-delete-dialog__list">
					<li
						v-for="file in pendingDeleteGroup.deletionCandidates"
						:key="file.id || file.path">
						{{ file.path }}
					</li>
				</ul>
				<div class="video-delete-dialog__actions">
					<button
						type="button"
						class="video-workbench__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="video-workbench__danger-btn"
						:disabled="isDeleting"
						@click="confirmDeleteRedundantVideos">
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
import { copyTextSafely } from '../tools/clipboardHelper'
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { formatBytes } from '../tools/duplicateStats'
import { sanitizeContentUrl } from '../tools/mediaContentInspector'
import { normalizeItemPath } from '../tools/utils'
import {
	DEFAULT_DURATION_TOLERANCE_PCT,
	DEFAULT_FRAME_SIMILARITY_PCT,
	KEYFRAME_POSITIONS,
	MAX_VIDEO_HEADER_BYTES,
	VIDEO_RANGE_HEAD_BYTES,
	VIDEO_RANGE_TAIL_BYTES,
	analyzeVideoCatalog,
	buildKeyframeSample,
	exportVideoAuditCsv,
	exportVideoAuditJson,
	filterAndSortVideoGroups,
	formatVideoSheetText,
	parseVideoContainerMetadata,
} from '../tools/videoSceneInspector'

export default {
	name: 'VideoSceneWorkbench',
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
			keepRule: 'balanced_master',
			sortBy: 'reclaimable-desc',
			categoryFilter: 'all',
			searchQuery: '',
			durationTolerancePct: DEFAULT_DURATION_TOLERANCE_PCT,
			durationToleranceDraft: String(DEFAULT_DURATION_TOLERANCE_PCT),
			similarityThreshold: DEFAULT_FRAME_SIMILARITY_PCT,
			similarityThresholdDraft: String(DEFAULT_FRAME_SIMILARITY_PCT),
			selectedGroupKey: '',
			inspectedByFileKey: {},
			loadingByKey: {},
			batchProbing: false,
			isDeleting: false,
			pendingDeleteGroup: null,
			lastFocusBeforeDialog: null,
			copiedKey: '',
			statusNotice: '',
			statusNoticeType: 'info',
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
			return analyzeVideoCatalog(this.activePool, {
				keepRule: this.keepRule,
				durationTolerancePct: this.durationTolerancePct,
				similarityThreshold: this.similarityThreshold,
				inspectedByFileKey: this.inspectedByFileKey,
			})
		},
		categoryOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All ({count})', { count: this.catalog.groups.length }) },
				{ id: 'uhd-hd', label: this.t('duplicatefinder', 'HD / 4K') },
				{ id: 'reencode-alert', label: this.t('duplicatefinder', 'Scene / Re-encode') },
				{ id: 'resolution-mismatch', label: this.t('duplicatefinder', 'Resolution Gap') },
				{ id: 'low-res', label: this.t('duplicatefinder', 'Low Res') },
				{ id: 'probed', label: this.t('duplicatefinder', 'Probed') },
			]
		},
		filteredGroups() {
			return filterAndSortVideoGroups(this.catalog.groups, {
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
		formatSize(bytes) {
			return formatBytes(Number(bytes) || 0)
		},
		syncDurationDraft() {
			this.durationToleranceDraft = String(this.durationTolerancePct)
		},
		onDurationDraftInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			this.durationToleranceDraft = raw
			if (raw.trim() === '') {
				return
			}
			const parsed = Number(raw)
			if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 25) {
				this.durationTolerancePct = Math.round(parsed)
			}
		},
		commitDurationDraft() {
			const parsed = Number(this.durationToleranceDraft)
			const clamped = Number.isFinite(parsed)
				? Math.max(0, Math.min(25, Math.round(parsed)))
				: DEFAULT_DURATION_TOLERANCE_PCT
			this.durationTolerancePct = clamped
			this.durationToleranceDraft = String(clamped)
		},
		syncSimilarityDraft() {
			this.similarityThresholdDraft = String(this.similarityThreshold)
		},
		onSimilarityDraftInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			this.similarityThresholdDraft = raw
			if (raw.trim() === '') {
				return
			}
			const parsed = Number(raw)
			if (Number.isFinite(parsed) && parsed >= 60 && parsed <= 100) {
				this.similarityThreshold = Math.round(parsed)
			}
		},
		commitSimilarityDraft() {
			const parsed = Number(this.similarityThresholdDraft)
			const clamped = Number.isFinite(parsed)
				? Math.max(60, Math.min(100, Math.round(parsed)))
				: DEFAULT_FRAME_SIMILARITY_PCT
			this.similarityThreshold = clamped
			this.similarityThresholdDraft = String(clamped)
		},
		hasCardBadges(item) {
			return Boolean(
				item && (
					item.crossGroupMatches.length > 0
					|| item.hasResolutionMismatch
					|| item.hasCodecMismatch
					|| item.hasProbedFrames
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
		selectVideoGroup(item) {
			if (!item) {
				return
			}
			this.selectedGroupKey = item.groupKey
		},
		resetWorkbenchFilters() {
			this.categoryFilter = 'all'
			this.searchQuery = ''
		},
		resolveVideoFetchUrl(file) {
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
		async probeBrowserVideoFrames(url, knownDuration) {
			if (typeof document === 'undefined' || !url) {
				return null
			}
			const video = document.createElement('video')
			if (!video || typeof video.play !== 'function') {
				return null
			}
			return new Promise(resolve => {
				let settled = false
				const timer = setTimeout(() => finish(null), 3500)
				const finish = result => {
					if (settled) {
						return
					}
					settled = true
					clearTimeout(timer)
					try {
						video.removeAttribute('src')
						video.load()
					} catch (e) {
						// Ignore detached cleanup errors
					}
					resolve(result)
				}

				video.preload = 'metadata'
				video.muted = true
				video.playsInline = true
				video.crossOrigin = 'anonymous'

				video.addEventListener('error', () => finish(null), { once: true })
				video.addEventListener('loadedmetadata', async () => {
					const width = Number(video.videoWidth) || 0
					const height = Number(video.videoHeight) || 0
					const durationSeconds = Number.isFinite(video.duration) && video.duration > 0
						? video.duration
						: (Number(knownDuration) || 0)
					const keyframes = []
					const canvas = document.createElement('canvas')
					canvas.width = 144
					canvas.height = 81
					const ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null

					if (ctx && width > 0 && height > 0 && durationSeconds > 0.2) {
						for (const pos of KEYFRAME_POSITIONS) {
							try {
								await new Promise(resolve => {
									const seekTimeout = setTimeout(resolve, 650)
									video.addEventListener('seeked', () => {
										clearTimeout(seekTimeout)
										resolve()
									}, { once: true })
									video.currentTime = Math.max(0.05, Math.min(durationSeconds - 0.05, durationSeconds * pos))
								})
								ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
								const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
								let thumb = ''
								try {
									thumb = canvas.toDataURL('image/jpeg', 0.65)
								} catch (e) {
									thumb = ''
								}
								const sample = buildKeyframeSample(
									imageData.data,
									canvas.width,
									canvas.height,
									pos,
									durationSeconds,
									thumb,
								)
								if (sample) {
									keyframes.push(sample)
								}
							} catch (e) {
								// Ignore tainted canvas / seek errors and keep container headers
								break
							}
						}
					}

					finish({
						source: 'browser-probe',
						width,
						height,
						durationSeconds,
						keyframes,
					})
				}, { once: true })

				video.src = url
			})
		},
		async inspectSingleVideoFile(file) {
			if (!file) {
				return null
			}
			if (file.videoBuffer) {
				return parseVideoContainerMetadata(file.videoBuffer, file, {
					tailBuffer: file.videoTailBuffer || null,
				})
			}

			const url = this.resolveVideoFetchUrl(file)
			let headBuf = null
			let tailBuf = null
			if (url && typeof fetch === 'function') {
				const size = Number(file.size) || 0
				try {
					if (size > 0 && size <= MAX_VIDEO_HEADER_BYTES) {
						const response = await fetch(url)
						if (response && response.ok && typeof response.arrayBuffer === 'function') {
							headBuf = await response.arrayBuffer()
						}
					} else {
						const headRes = await fetch(url, {
							headers: { Range: `bytes=0-${VIDEO_RANGE_HEAD_BYTES - 1}` },
						})
						if (headRes && headRes.ok && typeof headRes.arrayBuffer === 'function') {
							headBuf = await headRes.arrayBuffer()
						}
						if (size > VIDEO_RANGE_TAIL_BYTES) {
							const tailStart = Math.max(0, size - VIDEO_RANGE_TAIL_BYTES)
							const tailRes = await fetch(url, {
								headers: { Range: `bytes=${tailStart}-${size - 1}` },
							})
							if (tailRes && tailRes.ok && typeof tailRes.arrayBuffer === 'function') {
								tailBuf = await tailRes.arrayBuffer()
							}
						}
					}
				} catch (error) {
					// Graceful fallback to file metadata / browser probe
				}
			}

			const preliminary = parseVideoContainerMetadata(headBuf, file, { tailBuffer: tailBuf })
			let probeResult = null
			if (url) {
				probeResult = await this.probeBrowserVideoFrames(url, preliminary.durationSeconds)
			}
			return parseVideoContainerMetadata(headBuf, file, {
				tailBuffer: tailBuf,
				probeResult,
			})
		},
		async probeVideoGroup(item, options = {}) {
			if (!item || this.loadingByKey[item.groupKey]) {
				return
			}
			if (options.select !== false) {
				this.selectedGroupKey = item.groupKey
			}
			this.statusNotice = ''
			this.$set(this.loadingByKey, item.groupKey, true)
			try {
				for (const wrapper of item.files) {
					const parsed = await this.inspectSingleVideoFile(wrapper.raw)
					if (parsed) {
						this.$set(this.inspectedByFileKey, wrapper.fileKey, parsed)
					}
				}
			} finally {
				this.$delete(this.loadingByKey, item.groupKey)
			}
		},
		async probeAllVisible() {
			if (this.batchProbing || this.filteredGroups.length === 0) {
				return
			}
			this.batchProbing = true
			try {
				const targets = this.filteredGroups.slice(0, 10)
				for (const item of targets) {
					await this.probeVideoGroup(item, { select: false })
				}
			} finally {
				this.batchProbing = false
			}
		},
		async copyVideoSheet() {
			if (!this.activeGroup) {
				return
			}
			const text = formatVideoSheetText(this.activeGroup)
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
			const dialog = this.$refs.videoDeleteDialog
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
			const dialog = this.$refs.videoDeleteDialog
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
			if (event && event.target === this.$refs.videoDeleteDialog) {
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
		async confirmDeleteRedundantVideos() {
			const group = this.pendingDeleteGroup
			if (!group || group.deletionCandidates.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			this.statusNotice = ''
			try {
				const payload = group.deletionCandidates.map(file => ({
					...file,
					fileHash: group.hash || file.fileHash || '',
				}))
				const result = await deleteFiles(payload)
				const deletedFiles = Array.isArray(result && result.success) ? result.success : []
				const deletedNodeIds = Array.isArray(result && result.deletedNodeIds) ? result.deletedNodeIds : []
				if (deletedFiles.length > 0 || deletedNodeIds.length > 0) {
					this.$emit('video-delete-completed', {
						deletedFiles,
						deletedNodeIds,
						strategy: `video:${this.keepRule}`,
					})
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Deleted {count} redundant video copies.', {
						count: deletedFiles.length,
					})
				}
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not delete all selected video copies.')
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
			const json = exportVideoAuditJson(this.catalog)
			this.triggerDownload(json, 'duplicatefinder-video-audit.json', 'application/json')
		},
		exportAuditCsv() {
			const csv = exportVideoAuditCsv(this.catalog)
			this.triggerDownload(csv, 'duplicatefinder-video-audit.csv', 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style scoped>
.video-scene-workbench {
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

.video-workbench__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.video-workbench__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.video-workbench__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.video-workbench__status-badge {
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.78rem;
	font-variant-numeric: tabular-nums;
}

.video-workbench__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.video-workbench__tool-btn,
.video-workbench__seg-btn,
.video-workbench__mini-btn,
.video-workbench__primary-btn,
.video-workbench__danger-btn {
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

.video-workbench__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #ffffff);
}

.video-workbench__danger-btn {
	background-color: var(--color-error, #c62828);
	border-color: var(--color-error, #c62828);
	color: #ffffff;
}

.video-workbench__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.video-workbench__tool-btn:hover:not(:disabled),
.video-workbench__seg-btn:hover:not(:disabled),
.video-workbench__mini-btn:hover:not(:disabled),
.video-card__select-btn:hover:not(:disabled) {
	background-color: var(--color-background-hover);
	border-color: var(--color-primary-element);
}

.video-workbench__tool-btn:focus-visible,
.video-workbench__seg-btn:focus-visible,
.video-workbench__mini-btn:focus-visible,
.video-workbench__primary-btn:focus-visible,
.video-workbench__danger-btn:focus-visible,
.video-workbench__select:focus-visible,
.video-workbench__search-input:focus-visible,
.video-workbench__number-input:focus-visible,
.video-workbench__range:focus-visible,
.video-card__select-btn:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.video-workbench__tool-btn:disabled,
.video-workbench__seg-btn:disabled,
.video-workbench__mini-btn:disabled,
.video-workbench__primary-btn:disabled,
.video-workbench__danger-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.video-workbench__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.video-workbench__control-row,
.video-workbench__tolerance-row,
.video-workbench__filter-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.video-workbench__control-label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.video-workbench__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.video-workbench__select-field,
.video-workbench__threshold-field {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.video-workbench__threshold-inputs {
	display: flex;
	align-items: center;
	gap: 8px;
}

.video-workbench__range {
	inline-size: 110px;
}

.video-workbench__number-input {
	inline-size: 64px;
	min-block-size: 34px;
	padding-block: 4px;
	padding-inline: 6px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
}

.video-workbench__select,
.video-workbench__search-input {
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
}

.video-workbench__search-wrap {
	flex: 1 1 220px;
	min-inline-size: 0;
}

.video-workbench__search-input {
	inline-size: 100%;
	max-inline-size: 340px;
}

.video-workbench__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.video-kpi-card {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.video-kpi-card__label {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.video-kpi-card__value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.video-kpi-card__sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.video-workbench__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-primary-element);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-primary-element-light);
	font-size: 0.84rem;
}

.video-workbench__notice.is-error {
	border-color: var(--color-error, #c62828);
	background-color: rgba(198, 40, 40, 0.1);
}

.video-workbench__empty {
	padding-block: 24px;
	padding-inline: 16px;
	text-align: center;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius, 6px);
}

.video-workbench__empty-title {
	margin: 0 0 6px;
	font-weight: 700;
}

.video-workbench__empty-hint {
	margin: 0 0 12px;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
}

.video-workbench__split {
	display: grid;
	grid-template-columns: minmax(0, 380px) minmax(0, 1fr);
	gap: 14px;
	align-items: start;
}

.video-workbench__list-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	max-block-size: 620px;
	overflow-y: auto;
	padding-inline-end: 2px;
	min-inline-size: 0;
}

.video-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.video-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.video-card__select-btn {
	display: flex;
	flex-direction: column;
	gap: 4px;
	inline-size: 100%;
	padding-block: 4px;
	padding-inline: 4px;
	border: 0;
	border-radius: var(--border-radius, 4px);
	background: transparent;
	color: inherit;
	text-align: start;
	cursor: pointer;
}

.video-card__top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.video-card__res-pill {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	font-size: 0.72rem;
	font-weight: 700;
	background-color: var(--color-background-dark);
	color: var(--color-main-text);
}

.video-card__res-pill.is-4k,
.video-card__res-pill.is-1440p {
	background-color: rgba(46, 125, 50, 0.16);
	color: var(--color-main-text);
}

.video-card__res-pill.is-1080p {
	background-color: rgba(21, 101, 192, 0.14);
	color: var(--color-main-text);
}

.video-card__title {
	flex: 1 1 auto;
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.video-card__size {
	font-size: 0.78rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.video-card__path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.video-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.video-card__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.video-card__quick-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.video-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	font-size: 0.72rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.video-badge.is-match {
	border-color: rgba(21, 101, 192, 0.45);
	background-color: rgba(21, 101, 192, 0.12);
}

.video-badge.is-warning {
	border-color: rgba(230, 81, 0, 0.45);
	background-color: rgba(230, 81, 0, 0.12);
}

.video-badge.is-probed {
	border-color: rgba(46, 125, 50, 0.5);
	background-color: rgba(46, 125, 50, 0.12);
}

.video-workbench__detail-pane {
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

.video-detail__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.video-detail__identity {
	min-inline-size: 0;
	flex: 1 1 240px;
}

.video-detail__title {
	margin: 0 0 4px;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.video-detail__subline {
	margin: 0 0 2px;
	font-size: 0.84rem;
	font-weight: 600;
}

.video-detail__path {
	margin: 0;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.video-detail__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.video-detail__copies-summary {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.video-copies-box {
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.video-copies-box__title {
	display: block;
	font-size: 0.78rem;
	font-weight: 700;
	margin-block-end: 4px;
}

.video-copies-box__path,
.video-copies-box__empty {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
	margin-block-end: 3px;
}

.video-detail__cross-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid rgba(21, 101, 192, 0.35);
	border-radius: var(--border-radius, 6px);
	background-color: rgba(21, 101, 192, 0.06);
	font-size: 0.82rem;
}

.video-cross-list {
	list-style: none;
	margin: 8px 0 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.video-cross-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.video-cross-item__info {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.video-cross-item__meta,
.video-cross-item__reason {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.video-cross-item__actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.video-mono {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
}

.video-detail__spec-sheet,
.video-detail__keyframes-section {
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.video-sheet__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-block-end: 8px;
}

.video-sheet__title {
	margin: 0;
	font-size: 0.88rem;
	font-weight: 700;
}

.video-sheet__score {
	font-size: 0.78rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.video-spec-grid {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 8px;
	margin: 0;
}

.video-spec-cell {
	padding-block: 6px;
	padding-inline: 8px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.video-spec-cell dt {
	font-size: 0.7rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	margin-block-end: 2px;
}

.video-spec-cell dd {
	margin: 0;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.video-keyframes-empty {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
}

.video-keyframes-strip {
	display: grid;
	grid-template-columns: repeat(5, minmax(0, 1fr));
	gap: 8px;
}

.video-keyframe-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 6px;
	padding-inline: 6px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.video-keyframe-card.is-blank {
	border-color: rgba(230, 81, 0, 0.5);
}

.video-keyframe-card__thumb {
	display: block;
	inline-size: 100%;
	aspect-ratio: 16 / 9;
	object-fit: cover;
	border-radius: 3px;
}

.video-keyframe-card__placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: 100%;
	aspect-ratio: 16 / 9;
	border-radius: 3px;
	background-color: var(--color-background-dark);
	font-size: 0.8rem;
	font-weight: 700;
}

.video-keyframe-card__info {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.video-keyframe-card__ts {
	font-size: 0.76rem;
	font-variant-numeric: tabular-nums;
}

.video-keyframe-card__hash {
	font-size: 0.7rem;
	overflow-wrap: anywhere;
}

.video-detail__copies-cards {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.video-copy-audit-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.video-copy-audit-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.video-copy-audit-card.is-survivor {
	border-color: rgba(46, 125, 50, 0.55);
}

.video-copy-audit-card__top {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.video-copy-audit-card__path {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	overflow-wrap: anywhere;
}

.video-copy-audit-card__meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.video-delete-dialog {
	max-inline-size: 520px;
	inline-size: calc(100% - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.video-delete-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.55);
}

.video-delete-dialog__content {
	padding-block: 18px;
	padding-inline: 18px;
}

.video-delete-dialog__title {
	margin: 0 0 8px;
	font-size: 1rem;
}

.video-delete-dialog__text {
	margin: 0 0 10px;
	font-size: 0.88rem;
}

.video-delete-dialog__list {
	margin: 0 0 14px;
	padding-inline-start: 18px;
	max-block-size: 180px;
	overflow-y: auto;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.video-delete-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.video-workbench__kpis,
	.video-spec-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.video-keyframes-strip {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}

	.video-workbench__split,
	.video-detail__copies-summary {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.video-scene-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.video-workbench__kpis,
	.video-spec-grid,
	.video-keyframes-strip {
		grid-template-columns: minmax(0, 1fr);
	}

	.video-workbench__tool-btn,
	.video-workbench__seg-btn,
	.video-workbench__mini-btn,
	.video-workbench__primary-btn,
	.video-workbench__danger-btn,
	.video-workbench__select,
	.video-workbench__search-input,
	.video-workbench__number-input,
	.video-card__select-btn {
		min-block-size: 45px;
	}
}
</style>
