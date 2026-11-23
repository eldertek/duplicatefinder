<template>
	<div
		class="compare-workspace"
		role="region"
		:aria-label="t('duplicatefinder', 'Side-by-side comparison')">
		<div class="compare-toolbar">
			<div
				class="compare-diff-summary"
				role="status"
				aria-live="polite">
				<span
					v-if="diffResult.diffCount === 0"
					class="compare-diff-badge is-identical">
					{{ t('duplicatefinder', 'Identical metadata across both copies') }}
				</span>
				<span
					v-else
					class="compare-diff-badge is-different">
					{{ t('duplicatefinder', '{count} metadata difference(s) between copies', { count: diffResult.diffCount }) }}
				</span>
			</div>
			<div class="compare-toolbar__actions">
				<button
					type="button"
					class="compare-toolbar__button compare-diffs-only-button"
					:class="{ 'is-active': showOnlyDiffs }"
					:aria-pressed="showOnlyDiffs ? 'true' : 'false'"
					:disabled="files.length < 2"
					@click="showOnlyDiffs = !showOnlyDiffs">
					<span>{{ t('duplicatefinder', 'Diffs only') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-swap-button"
					:disabled="files.length < 2"
					@click="swapSides">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true">
						<polyline points="16 3 21 3 21 8" />
						<line
							x1="4"
							y1="20"
							x2="21"
							y2="3" />
						<polyline points="21 16 21 21 16 21" />
						<line
							x1="15"
							y1="15"
							x2="21"
							y2="21" />
						<line
							x1="4"
							y1="4"
							x2="9"
							y2="9" />
					</svg>
					<span>{{ t('duplicatefinder', 'Swap sides') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-close-button"
					aria-keyshortcuts="v"
					@click="$emit('close-compare')">
					<span>{{ t('duplicatefinder', 'List view') }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="hasInspectableImages"
			class="compare-visual-bar"
			role="toolbar"
			:aria-label="t('duplicatefinder', 'Visual inspection controls')">
			<div
				class="compare-visual-bar__modes"
				role="group"
				:aria-label="t('duplicatefinder', 'Visual comparison mode')">
				<button
					type="button"
					class="compare-toolbar__button compare-mode-button"
					:class="{ 'is-active': inspectionMode === 'side-by-side' }"
					:aria-pressed="inspectionMode === 'side-by-side' ? 'true' : 'false'"
					@click="setInspectionMode('side-by-side')">
					<span>{{ t('duplicatefinder', 'Side-by-side') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-mode-button compare-mode-wipe-button"
					:class="{ 'is-active': inspectionMode === 'wipe' }"
					:aria-pressed="inspectionMode === 'wipe' ? 'true' : 'false'"
					:disabled="!bothPanesHavePreview"
					@click="setInspectionMode('wipe')">
					<span>{{ t('duplicatefinder', 'Split wipe') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-mode-button compare-mode-diff-button"
					:class="{ 'is-active': inspectionMode === 'diff' }"
					:aria-pressed="inspectionMode === 'diff' ? 'true' : 'false'"
					:disabled="!bothPanesHavePreview"
					@click="setInspectionMode('diff')">
					<span>{{ t('duplicatefinder', 'Pixel diff') }}</span>
				</button>
			</div>

			<div
				class="compare-visual-bar__tools"
				role="group"
				:aria-label="t('duplicatefinder', 'Zoom and metadata tools')">
				<div class="compare-zoom-group">
					<span class="compare-zoom-group__label">{{ t('duplicatefinder', 'Zoom') }}</span>
					<button
						v-for="zoomOption in zoomLevels"
						:key="'zoom-' + zoomOption"
						type="button"
						class="compare-zoom-button"
						:class="{ 'is-active': zoomScale === zoomOption }"
						:aria-pressed="zoomScale === zoomOption ? 'true' : 'false'"
						@click="zoomScale = zoomOption">
						{{ zoomOption }}x
					</button>
				</div>
				<button
					v-if="resolutionEvaluation.hasDimensionSpread"
					type="button"
					class="compare-toolbar__button compare-select-lower-res-button"
					@click="selectLowerResolutionCopies">
					<span>{{ t('duplicatefinder', 'Select lower-res') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-exif-fetch-button"
					:disabled="exifFetchState === 'loading' || !bothPanesHaveUrls"
					@click="loadExifHeadersForCurrentPair">
					<span>
						{{ exifFetchState === 'loading'
							? t('duplicatefinder', 'Reading EXIF...')
							: (exifFetchState === 'ready'
								? t('duplicatefinder', 'EXIF inspected')
								: t('duplicatefinder', 'Read EXIF header')) }}
					</span>
				</button>
			</div>
		</div>

		<section
			v-if="hasInspectableImages && inspectionMode === 'wipe'"
			class="compare-wipe-stage"
			:aria-label="t('duplicatefinder', 'Split wipe visual comparison')">
			<div class="compare-wipe-stage__header">
				<span class="compare-wipe-stage__caption is-left">
					{{ t('duplicatefinder', 'Left: {name}', { name: leftPane ? (leftPane.meta.fileName || leftPane.meta.normalizedPath) : '' }) }}
				</span>
				<span class="compare-wipe-stage__ratio" role="status" aria-live="polite">
					{{ wipePercent }}%
				</span>
				<span class="compare-wipe-stage__caption is-right">
					{{ t('duplicatefinder', 'Right: {name}', { name: rightPane ? (rightPane.meta.fileName || rightPane.meta.normalizedPath) : '' }) }}
				</span>
			</div>
			<div class="compare-wipe-stage__viewport">
				<img
					v-if="leftPane && leftPane.previewUrl && !previewErrors[leftPane.key]"
					class="compare-wipe-stage__img compare-wipe-stage__img--left"
					:src="leftPane.previewUrl"
					:alt="leftPane.meta.fileName || leftPane.meta.normalizedPath"
					:style="zoomImageStyle">
				<img
					v-if="rightPane && rightPane.previewUrl && !previewErrors[rightPane.key]"
					class="compare-wipe-stage__img compare-wipe-stage__img--right"
					:src="rightPane.previewUrl"
					:alt="rightPane.meta.fileName || rightPane.meta.normalizedPath"
					:style="wipeRightImageStyle">
				<div
					class="compare-wipe-stage__divider"
					:style="{ left: wipePercent + '%' }"
					aria-hidden="true" />
			</div>
			<div class="compare-wipe-stage__controls">
				<label
					for="compare-wipe-slider"
					class="compare-wipe-stage__slider-label">
					{{ t('duplicatefinder', 'Split curtain position') }}
				</label>
				<input
					id="compare-wipe-slider"
					v-model.number="wipePercent"
					type="range"
					min="0"
					max="100"
					step="1"
					class="compare-wipe-stage__slider"
					:aria-label="t('duplicatefinder', 'Split comparison position')">
			</div>
		</section>

		<section
			v-if="hasInspectableImages && inspectionMode === 'diff'"
			class="compare-diff-stage"
			:aria-label="t('duplicatefinder', 'Perceptual similarity and pixel diff inspector')">
			<div class="compare-diff-stage__header">
				<div class="compare-diff-stage__verdict-group">
					<span
						class="compare-diff-stage__verdict-badge"
						:class="'is-' + visualVerdictKind">
						{{ visualVerdictLabel }}
					</span>
					<span
						v-if="pixelMetrics"
						class="compare-diff-stage__subnote">
						{{ t('duplicatefinder', '{changed} / {total} pixels differ', {
							changed: pixelMetrics.changedPixelCount,
							total: pixelMetrics.totalPixelCount,
						}) }}
					</span>
				</div>
				<div class="compare-diff-stage__tolerance">
					<label for="compare-diff-tolerance" class="compare-diff-stage__tolerance-label">
						{{ t('duplicatefinder', 'Sensitivity threshold: {value}', { value: diffTolerance }) }}
					</label>
					<input
						id="compare-diff-tolerance"
						v-model.number="diffTolerance"
						type="range"
						min="0"
						max="40"
						step="1"
						class="compare-diff-stage__tolerance-slider">
				</div>
			</div>

			<dl
				v-if="inspectionState === 'ready' && (pixelMetrics || dhashSimilarity)"
				class="compare-diff-stage__metrics">
				<div v-if="dhashSimilarity" class="compare-diff-metric">
					<dt>{{ t('duplicatefinder', 'Perceptual similarity (dHash)') }}</dt>
					<dd>{{ dhashSimilarity.similarityPercent }}%</dd>
				</div>
				<div v-if="pixelMetrics" class="compare-diff-metric">
					<dt>{{ t('duplicatefinder', 'Pixel match') }}</dt>
					<dd>{{ pixelMetrics.pixelMatchPercent }}%</dd>
				</div>
				<div v-if="dhashSimilarity" class="compare-diff-metric">
					<dt>{{ t('duplicatefinder', 'dHash distance') }}</dt>
					<dd>{{ dhashSimilarity.distance }} / 64</dd>
				</div>
				<div v-if="pixelMetrics" class="compare-diff-metric">
					<dt>{{ t('duplicatefinder', 'Mean channel delta') }}</dt>
					<dd>{{ pixelMetrics.meanAbsoluteError }}</dd>
				</div>
				<div v-if="pixelMetrics" class="compare-diff-metric">
					<dt>{{ t('duplicatefinder', 'Max channel delta') }}</dt>
					<dd>{{ pixelMetrics.maxChannelDelta }} / 255</dd>
				</div>
			</dl>

			<div
				v-if="inspectionState === 'ready' && diffHeatmapUrl"
				class="compare-diff-stage__heatmap-wrap">
				<img
					class="compare-diff-stage__heatmap"
					:src="diffHeatmapUrl"
					:alt="t('duplicatefinder', 'Visual pixel difference heatmap')"
					:style="zoomImageStyle">
			</div>
			<p
				v-else-if="inspectionState === 'inspecting'"
				class="compare-diff-stage__fallback"
				role="status"
				aria-live="polite">
				{{ t('duplicatefinder', 'Computing perceptual similarity and pixel difference map...') }}
			</p>
			<p
				v-else
				class="compare-diff-stage__fallback"
				role="status"
				aria-live="polite">
				{{ t('duplicatefinder', 'Pixel canvas inspection is unavailable for this preview source. Compare dimensions, aspect ratios, and EXIF metadata below.') }}
			</p>
		</section>

		<div
			v-if="hasInspectableContent"
			class="compare-content-bar"
			role="toolbar"
			:aria-label="t('duplicatefinder', 'Media and document inspection controls')">
			<div class="compare-content-bar__status">
				<span class="compare-content-bar__kind-badge">
					{{ contentKindLabel }}
				</span>
				<span
					v-if="contentQualityEvaluation.hasQualitySpread"
					class="compare-content-bar__quality-note"
					role="status"
					aria-live="polite">
					{{ contentQualityHintLabel }}
				</span>
				<span
					v-else-if="contentFetchState === 'unavailable'"
					class="compare-content-bar__fallback-note"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', 'Header inspection unavailable for this source') }}
				</span>
			</div>

			<div class="compare-content-bar__tools">
				<button
					v-if="hasPlayableMediaPair"
					type="button"
					class="compare-toolbar__button compare-sync-media-button"
					:class="{ 'is-active': syncMediaPlayback }"
					:aria-pressed="syncMediaPlayback ? 'true' : 'false'"
					@click="syncMediaPlayback = !syncMediaPlayback">
					<span>{{ syncMediaPlayback
						? t('duplicatefinder', 'Sync playback: On')
						: t('duplicatefinder', 'Sync playback: Off') }}</span>
				</button>
				<button
					v-if="textDiffResult && !textDiffResult.summary.identical"
					type="button"
					class="compare-toolbar__button compare-text-diffs-only-button"
					:class="{ 'is-active': showOnlyTextDiffs }"
					:aria-pressed="showOnlyTextDiffs ? 'true' : 'false'"
					@click="showOnlyTextDiffs = !showOnlyTextDiffs">
					<span>{{ t('duplicatefinder', 'Changed lines only') }}</span>
				</button>
				<button
					type="button"
					class="compare-toolbar__button compare-content-fetch-button"
					:disabled="contentFetchState === 'loading' || !bothPanesHaveUrls"
					@click="loadContentHeadersForCurrentPair">
					<span>
						{{ contentFetchState === 'loading'
							? t('duplicatefinder', 'Inspecting file...')
							: (contentFetchState === 'ready'
								? t('duplicatefinder', 'Content inspected')
								: t('duplicatefinder', 'Inspect media & content')) }}
					</span>
				</button>
			</div>
		</div>

		<section
			v-if="textDiffResult"
			class="compare-text-diff-stage"
			:aria-label="t('duplicatefinder', 'Side-by-side text content diff')">
			<header class="compare-text-diff-stage__header">
				<div class="compare-text-diff-stage__verdict-group">
					<span
						class="compare-text-diff-stage__badge"
						:class="textDiffResult.summary.identical ? 'is-identical' : 'is-different'"
						role="status"
						aria-live="polite">
						{{ textDiffSummaryLabel }}
					</span>
					<span
						v-if="leftContentParsed && leftContentParsed.structuredSummary"
						class="compare-text-diff-stage__meta-pill">
						{{ leftContentParsed.structuredSummary }}
					</span>
				</div>
				<div class="compare-text-diff-stage__counts">
					<span>{{ t('duplicatefinder', '{equal} equal', { equal: textDiffResult.summary.equalLines }) }}</span>
					<span>{{ t('duplicatefinder', '{changed} changed', { changed: textDiffResult.summary.changedLines }) }}</span>
					<span>{{ t('duplicatefinder', '+{added} / -{removed}', {
						added: textDiffResult.summary.addedLines,
						removed: textDiffResult.summary.removedLines,
					}) }}</span>
				</div>
			</header>

			<div
				v-if="visibleTextDiffRows.length > 0"
				class="compare-text-diff-table-wrap">
				<table class="compare-text-diff-table">
					<thead>
						<tr>
							<th scope="col" class="compare-text-diff-table__num">
								#
							</th>
							<th scope="col">
								{{ leftPane ? (leftPane.meta.fileName || t('duplicatefinder', 'Left')) : t('duplicatefinder', 'Left') }}
							</th>
							<th scope="col" class="compare-text-diff-table__num">
								#
							</th>
							<th scope="col">
								{{ rightPane ? (rightPane.meta.fileName || t('duplicatefinder', 'Right')) : t('duplicatefinder', 'Right') }}
							</th>
						</tr>
					</thead>
					<tbody>
						<tr
							v-for="row in visibleTextDiffRows"
							:key="'tdiff-' + row.rowNumber"
							:class="'is-' + row.status">
							<td class="compare-text-diff-table__num">
								{{ row.leftLineNum || '' }}
							</td>
							<!-- eslint-disable-next-line vue/singleline-html-element-content-newline -->
							<td class="compare-text-diff-table__code">{{ row.leftText }}</td>
							<td class="compare-text-diff-table__num">
								{{ row.rightLineNum || '' }}
							</td>
							<!-- eslint-disable-next-line vue/singleline-html-element-content-newline -->
							<td class="compare-text-diff-table__code">{{ row.rightText }}</td>
						</tr>
					</tbody>
				</table>
			</div>
			<p v-else class="compare-text-diff-stage__empty">
				{{ t('duplicatefinder', 'Both text copies are empty or contain no differing lines.') }}
			</p>
		</section>

		<div class="compare-panes-grid">
			<section
				v-for="pane in panes"
				:key="pane.side"
				class="compare-pane"
				:class="[
					'compare-pane--' + pane.side,
					{
						'is-selected': pane.isSelected,
						'is-keeping': hasActiveSelection && !pane.isSelected && !pane.isProtected,
						'is-protected': pane.isProtected,
					},
				]"
				:aria-label="pane.sideLabel">
				<header class="compare-pane__header">
					<div class="compare-pane__selector">
						<label
							:for="'compare-select-' + pane.side"
							class="compare-pane__role-label">
							{{ pane.sideLabel }}
						</label>
						<select
							:id="'compare-select-' + pane.side"
							class="compare-pane__select"
							:value="pane.index"
							@change="onSelectPaneIndex(pane.side, $event)">
							<option
								v-for="(optionFile, optionIdx) in files"
								:key="getFileKey(optionFile)"
								:value="optionIdx">
								{{ formatOptionLabel(optionFile, optionIdx) }}
							</option>
						</select>
					</div>
					<span
						class="compare-pane__status-badge"
						:class="'is-' + pane.statusKind">
						{{ pane.statusLabel }}
					</span>
				</header>

				<div class="compare-pane__preview">
					<video
						v-if="pane.contentKind === 'video' && pane.streamUrl && !mediaErrors[pane.key]"
						:ref="'mediaPlayer-' + pane.side"
						class="compare-pane__media-video"
						controls
						preload="metadata"
						:poster="(!previewErrors[pane.key] && pane.previewUrl) ? pane.previewUrl : null"
						:src="pane.streamUrl"
						:aria-label="t('duplicatefinder', 'Video preview for {name}', { name: pane.meta.fileName || pane.meta.normalizedPath })"
						@play="onMediaSyncEvent(pane.side, 'play')"
						@pause="onMediaSyncEvent(pane.side, 'pause')"
						@seeked="onMediaSyncEvent(pane.side, 'seeked')"
						@loadedmetadata="onMediaElementLoaded(pane.side, pane.file, $event)"
						@error="markMediaError(pane.key)" />
					<div
						v-else-if="pane.contentKind === 'video'"
						class="compare-pane__doc-card">
						<div class="compare-pane__doc-header">
							<span class="compare-pane__doc-badge">{{ pane.contentParsed?.format || t('duplicatefinder', 'Video') }}</span>
							<span v-if="pane.contentParsed?.durationFormatted" class="compare-pane__doc-stat">
								{{ pane.contentParsed.durationFormatted }}
							</span>
						</div>
						<p class="compare-pane__doc-hint">
							{{ t('duplicatefinder', 'Inline video playback unavailable for this codec/source. Inspect video header metadata below.') }}
						</p>
					</div>
					<div
						v-else-if="pane.contentKind === 'audio'"
						class="compare-pane__audio-card">
						<div class="compare-pane__audio-header">
							<span class="compare-pane__doc-badge">{{ pane.contentParsed?.format || t('duplicatefinder', 'Audio') }}</span>
							<span v-if="pane.contentParsed?.durationFormatted" class="compare-pane__doc-stat">
								{{ pane.contentParsed.durationFormatted }}
							</span>
							<span v-if="pane.contentParsed?.bitrateKbps" class="compare-pane__doc-stat">
								{{ pane.contentParsed.bitrateKbps }} kbps
							</span>
						</div>
						<audio
							v-if="pane.streamUrl && !mediaErrors[pane.key]"
							:ref="'mediaPlayer-' + pane.side"
							class="compare-pane__media-audio"
							controls
							preload="metadata"
							:src="pane.streamUrl"
							:aria-label="t('duplicatefinder', 'Audio preview for {name}', { name: pane.meta.fileName || pane.meta.normalizedPath })"
							@play="onMediaSyncEvent(pane.side, 'play')"
							@pause="onMediaSyncEvent(pane.side, 'pause')"
							@seeked="onMediaSyncEvent(pane.side, 'seeked')"
							@loadedmetadata="onMediaElementLoaded(pane.side, pane.file, $event)"
							@error="markMediaError(pane.key)" />
						<p v-else class="compare-pane__doc-hint">
							{{ t('duplicatefinder', 'Inline audio playback unavailable for this codec/source. Inspect audio stream metadata below.') }}
						</p>
					</div>
					<div
						v-else-if="pane.contentKind === 'pdf'"
						class="compare-pane__doc-card">
						<div class="compare-pane__doc-header">
							<span class="compare-pane__doc-badge">
								{{ pane.contentParsed?.format || 'PDF' }}
							</span>
							<span v-if="pane.contentParsed?.pageCount" class="compare-pane__doc-stat">
								{{ t('duplicatefinder', '{count} pages', { count: pane.contentParsed.pageCount }) }}
							</span>
							<span
								v-if="pane.contentParsed && typeof pane.contentParsed.encrypted === 'boolean'"
								class="compare-pane__doc-stat">
								{{ pane.contentParsed.encrypted
									? t('duplicatefinder', 'Encrypted')
									: t('duplicatefinder', 'Unencrypted') }}
							</span>
						</div>
						<p v-if="pane.contentParsed?.title" class="compare-pane__doc-meta">
							{{ pane.contentParsed.title }}
						</p>
						<p v-else class="compare-pane__doc-hint">
							{{ pane.contentParsed
								? t('duplicatefinder', 'PDF header inspected. Compare document metadata below.')
								: t('duplicatefinder', 'Click Inspect media & content to parse PDF version, page count, and encryption.') }}
						</p>
					</div>
					<div
						v-else-if="pane.contentKind === 'text'"
						class="compare-pane__doc-card">
						<div class="compare-pane__doc-header">
							<span class="compare-pane__doc-badge">
								{{ pane.contentParsed?.format || t('duplicatefinder', 'Text / Code') }}
							</span>
							<span v-if="pane.contentParsed" class="compare-pane__doc-stat">
								{{ t('duplicatefinder', '{lines} lines', { lines: pane.contentParsed.lineCount }) }}
							</span>
							<span v-if="pane.contentParsed?.structuredSummary" class="compare-pane__doc-stat">
								{{ pane.contentParsed.structuredSummary }}
							</span>
						</div>
						<pre
							v-if="pane.contentParsed && pane.contentParsed.previewLines && pane.contentParsed.previewLines.length > 0"
							class="compare-pane__text-excerpt">{{ formatTextExcerpt(pane.contentParsed.previewLines) }}</pre>
						<p v-else class="compare-pane__doc-hint">
							{{ t('duplicatefinder', 'Click Inspect media & content to view encoding, line count, and side-by-side text diff.') }}
						</p>
					</div>
					<img
						v-else-if="!previewErrors[pane.key] && pane.previewUrl"
						:ref="'previewImg-' + pane.side"
						class="compare-pane__image"
						:src="pane.previewUrl"
						:alt="pane.meta.fileName || pane.meta.normalizedPath"
						:style="zoomImageStyle"
						loading="lazy"
						@load="onPaneImageLoad(pane.side, pane.file, $event)"
						@error="markPreviewError(pane.key)">
					<div
						v-else
						class="compare-pane__preview-fallback">
						<span class="compare-pane__preview-mime">{{ pane.meta.mimetype || t('duplicatefinder', 'File') }}</span>
					</div>
				</div>

				<div class="compare-pane__identity">
					<div class="compare-pane__filename-row">
						<strong class="compare-pane__filename">{{ pane.meta.fileName || pane.meta.normalizedPath }}</strong>
					</div>
					<div
						v-if="hasPaneBadges(pane)"
						class="compare-pane__badges">
						<span
							v-if="pane.contentQuality && pane.contentQuality.isQualityWinner"
							class="metadata-badge metadata-badge--winner">
							{{ t('duplicatefinder', 'Higher quality / metadata') }}
						</span>
						<span
							v-if="pane.contentParsed && pane.contentParsed.format"
							class="metadata-badge metadata-badge--dimensions">
							{{ pane.contentParsed.format }}
						</span>
						<span
							v-if="pane.contentParsed && pane.contentParsed.durationFormatted"
							class="metadata-badge metadata-badge--megapixels">
							{{ pane.contentParsed.durationFormatted }}
						</span>
						<span
							v-if="pane.visual && pane.visual.isResolutionWinner"
							class="metadata-badge metadata-badge--winner">
							{{ t('duplicatefinder', 'Resolution winner') }}
						</span>
						<span
							v-else-if="pane.visual && pane.visual.isLowerResolution"
							class="metadata-badge metadata-badge--lower-res">
							{{ t('duplicatefinder', 'Lower resolution ({delta}%)', { delta: pane.visual.deltaVsBestPercent }) }}
						</span>
						<span
							v-else-if="pane.visual && pane.visual.isExactDimensionMatch"
							class="metadata-badge metadata-badge--dim-match">
							{{ t('duplicatefinder', 'Exact resolution match') }}
						</span>
						<span
							v-if="pane.visual && pane.visual.dimensions"
							class="metadata-badge metadata-badge--dimensions">
							{{ pane.visual.dimensions.formattedDimensions }} ({{ pane.visual.dimensions.aspectRatio }})
						</span>
						<span
							v-if="pane.visual && pane.visual.dimensions && pane.visual.dimensions.megapixels"
							class="metadata-badge metadata-badge--megapixels">
							{{ pane.visual.dimensions.megapixels }}
						</span>
						<span
							v-if="pane.exif && pane.exif.camera"
							class="metadata-badge metadata-badge--camera">
							{{ pane.exif.camera }}
						</span>
						<span
							v-if="pane.exif && pane.exif.gpsPresent"
							class="metadata-badge metadata-badge--gps">
							{{ t('duplicatefinder', 'GPS EXIF') }}
						</span>
						<span
							v-if="pane.badges && pane.badges.isProtectedOrigin"
							class="metadata-badge metadata-badge--protected">
							{{ t('duplicatefinder', 'Protected origin') }}
						</span>
						<span
							v-if="pane.badges && pane.badges.isOldest"
							class="metadata-badge metadata-badge--oldest">
							{{ t('duplicatefinder', 'Oldest') }}
						</span>
						<span
							v-if="pane.badges && pane.badges.isNewest"
							class="metadata-badge metadata-badge--newest">
							{{ t('duplicatefinder', 'Newest') }}
						</span>
						<span
							v-if="pane.badges && pane.badges.isShortestPath"
							class="metadata-badge metadata-badge--shortest">
							{{ t('duplicatefinder', 'Shortest path') }}
						</span>
					</div>
				</div>

				<div class="compare-pane__path-box">
					<p
						class="compare-pane__path"
						:title="pane.meta.normalizedPath">
						<template v-if="pane.pathSegments.length > 0">
							<span
								v-for="(segment, segIdx) in pane.pathSegments"
								:key="segIdx"
								class="file-path-segment"
								:class="'file-path-segment--' + segment.kind">{{ segment.text }}</span>
						</template>
						<template v-else>
							{{ pane.meta.normalizedPath }}
						</template>
					</p>
					<div class="compare-pane__path-actions">
						<button
							type="button"
							class="compare-pane__mini-button compare-copy-path-button"
							:class="{
								'is-copied': copyStates[pane.side] === 'copied',
								'is-error': copyStates[pane.side] === 'error',
							}"
							:disabled="!pane.meta.normalizedPath"
							@click="copyPanePath(pane.side, pane.meta.normalizedPath)">
							{{ t('duplicatefinder', 'Copy path') }}
						</button>
						<button
							type="button"
							class="compare-pane__mini-button compare-open-file-button"
							@click="openFile(pane.file)">
							{{ t('duplicatefinder', 'Open File') }}
						</button>
						<button
							type="button"
							class="compare-pane__mini-button compare-open-folder-button"
							@click="openFolder(pane.file)">
							{{ t('duplicatefinder', 'Open Folder') }}
						</button>
						<span
							class="compare-pane__copy-status"
							:class="{ 'is-visible': Boolean(copyMessages[pane.side]) }"
							role="status"
							aria-live="polite">
							{{ copyMessages[pane.side] }}
						</span>
					</div>
				</div>

				<dl v-if="visibleDiffRows.length > 0" class="compare-pane__diff-list">
					<div
						v-for="row in visibleDiffRows"
						:key="row.key"
						class="compare-diff-row"
						:class="{ 'is-diff': row.isDiff }">
						<dt class="compare-diff-row__label">
							<span>{{ getDiffRowLabel(row.key) }}</span>
							<span
								v-if="row.isDiff"
								class="compare-diff-row__badge">
								{{ t('duplicatefinder', 'Diff') }}
							</span>
						</dt>
						<dd class="compare-diff-row__value">
							{{ pane.side === 'left' ? row.leftValue : row.rightValue }}
						</dd>
					</div>
				</dl>
				<p
					v-else
					class="compare-pane__no-diffs"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', 'No metadata differences between these two copies') }}
				</p>

				<footer class="compare-pane__footer">
					<button
						v-if="!pane.isProtected"
						type="button"
						class="compare-pane__triage-button"
						:class="{ 'is-marked-delete': pane.isSelected }"
						:aria-pressed="pane.isSelected ? 'true' : 'false'"
						@click="$emit('toggle-copy-selection', pane.file)">
						{{ pane.isSelected
							? t('duplicatefinder', 'Keep this copy')
							: t('duplicatefinder', 'Mark for deletion') }}
					</button>
					<span
						v-else
						class="compare-pane__protected-note">
						{{ t('duplicatefinder', 'Protected origin copy cannot be deleted') }}
					</span>
				</footer>
			</section>
		</div>
	</div>
</template>

<script>
// eslint-disable-next-line node/no-unpublished-import
import { generateUrl } from '@nextcloud/router'
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	clampComparisonPair,
	computeSideBySideDiffRows,
	extractFileDisplayMeta,
	filterComparisonDiffRows,
	pickDefaultComparisonPair,
} from '../tools/duplicateCompare'
import { formatBytes } from '../tools/duplicateStats'
import { fileKey, getParentFolderPath, getPreviewImage, isSameFile, normalizeItemPath } from '../tools/utils'
import {
	buildVisualDiffRows,
	computeDifferenceHash,
	computeHammingSimilarity,
	computePixelDiffMetrics,
	evaluateResolutionWinners,
	isRasterImageMimetype,
	normalizeExifMetadata,
	parseImageHeaderAndExif,
	resolveVisualFileKey,
	selectLowerResolutionKeys,
} from '../tools/visualMediaInspector'
import {
	buildContentInspectionDiffRows,
	classifyInspectableContent,
	computeTextLineDiff,
	evaluateMediaContentQuality,
	formatMediaDuration,
	inspectTextContent,
	isContentInspectableFile,
	isPlayableMediaKind,
	parseMediaOrDocumentHeader,
	resolveContentInspectionKind,
	sanitizeContentUrl,
} from '../tools/mediaContentInspector'

const INSPECTION_GRID_SIZE = 128

export default {
	name: 'DuplicateCompareView',
	props: {
		files: {
			type: Array,
			required: true,
		},
		selectedFiles: {
			type: Array,
			default: () => [],
		},
		pathSegmentsByIndex: {
			type: Array,
			default: () => [],
		},
		metadataBadgesByIndex: {
			type: Array,
			default: () => [],
		},
		initialInspectionMode: {
			type: String,
			default: 'side-by-side',
		},
		liveDimensionsByKey: {
			type: Object,
			default: () => ({}),
		},
	},
	data() {
		return {
			leftIndex: 0,
			rightIndex: 1,
			showOnlyDiffs: false,
			inspectionMode: 'side-by-side',
			zoomScale: 1,
			zoomLevels: [1, 1.5, 2, 4],
			wipePercent: 50,
			diffTolerance: 12,
			inspectionState: 'idle',
			exifFetchState: 'idle',
			contentFetchState: 'idle',
			syncMediaPlayback: true,
			showOnlyTextDiffs: false,
			isSyncingMediaEvent: false,
			localDimensionsByKey: {},
			parsedHeadersByKey: {},
			contentParsedByKey: {},
			dhashByKey: {},
			loadedImagesBySide: {
				left: null,
				right: null,
			},
			pixelMetrics: null,
			diffHeatmapUrl: '',
			previewErrors: {},
			mediaErrors: {},
			copyStates: {
				left: 'idle',
				right: 'idle',
			},
			copyMessages: {
				left: '',
				right: '',
			},
			copyTimers: {
				left: null,
				right: null,
			},
		}
	},
	computed: {
		hasActiveSelection() {
			return Array.isArray(this.selectedFiles) && this.selectedFiles.length > 0
		},
		boundedPair() {
			return clampComparisonPair(this.files, this.leftIndex, this.rightIndex)
		},
		leftFile() {
			return this.files[this.boundedPair.leftIndex] || null
		},
		rightFile() {
			return this.files[this.boundedPair.rightIndex] || null
		},
		mergedDimensionsByKey() {
			return {
				...(this.liveDimensionsByKey && typeof this.liveDimensionsByKey === 'object' ? this.liveDimensionsByKey : {}),
				...this.localDimensionsByKey,
			}
		},
		resolutionEvaluation() {
			return evaluateResolutionWinners(this.files, this.mergedDimensionsByKey)
		},
		hasInspectableImages() {
			return isRasterImageMimetype(this.leftFile?.mimetype) || isRasterImageMimetype(this.rightFile?.mimetype)
		},
		hasInspectableContent() {
			return isContentInspectableFile(this.leftFile) || isContentInspectableFile(this.rightFile)
		},
		activeContentKind() {
			return resolveContentInspectionKind(this.leftFile, this.rightFile)
		},
		hasPlayableMediaPair() {
			return isPlayableMediaKind(classifyInspectableContent(this.leftFile))
				&& isPlayableMediaKind(classifyInspectableContent(this.rightFile))
		},
		contentKindLabel() {
			const map = {
				video: this.t('duplicatefinder', 'Video stream'),
				audio: this.t('duplicatefinder', 'Audio stream'),
				pdf: this.t('duplicatefinder', 'PDF document'),
				text: this.t('duplicatefinder', 'Text & structured content'),
			}
			return map[this.activeContentKind] || this.t('duplicatefinder', 'Content inspector')
		},
		leftContentParsed() {
			const key = resolveVisualFileKey(this.leftFile)
			if (key !== null && this.contentParsedByKey[key]) {
				return this.contentParsedByKey[key]
			}
			if (typeof this.leftFile?.inlineContent === 'string') {
				return inspectTextContent(this.leftFile.inlineContent, this.leftFile)
			}
			return null
		},
		rightContentParsed() {
			const key = resolveVisualFileKey(this.rightFile)
			if (key !== null && this.contentParsedByKey[key]) {
				return this.contentParsedByKey[key]
			}
			if (typeof this.rightFile?.inlineContent === 'string') {
				return inspectTextContent(this.rightFile.inlineContent, this.rightFile)
			}
			return null
		},
		contentQualityEvaluation() {
			return evaluateMediaContentQuality(this.files, this.contentParsedByKey)
		},
		contentQualityHintLabel() {
			const reason = this.contentQualityEvaluation.reasonKey
			if (reason === 'higher_bitrate') {
				return this.t('duplicatefinder', 'Higher audio bitrate detected')
			}
			if (reason === 'higher_sample_rate') {
				return this.t('duplicatefinder', 'Higher audio sample rate detected')
			}
			if (reason === 'higher_resolution') {
				return this.t('duplicatefinder', 'Higher video resolution detected')
			}
			return this.t('duplicatefinder', 'Richer media metadata detected')
		},
		textDiffResult() {
			const left = this.leftContentParsed
			const right = this.rightContentParsed
			if (!left && !right) {
				return null
			}
			if ((left && left.kind !== 'text') || (right && right.kind !== 'text')) {
				return null
			}
			if (classifyInspectableContent(this.leftFile) !== 'text' && classifyInspectableContent(this.rightFile) !== 'text') {
				return null
			}
			return computeTextLineDiff(left?.rawText || '', right?.rawText || '')
		},
		visibleTextDiffRows() {
			if (!this.textDiffResult) {
				return []
			}
			if (!this.showOnlyTextDiffs) {
				return this.textDiffResult.rows
			}
			return this.textDiffResult.rows.filter(row => row.status !== 'equal')
		},
		textDiffSummaryLabel() {
			if (!this.textDiffResult) {
				return ''
			}
			if (this.textDiffResult.summary.identical) {
				return this.t('duplicatefinder', 'Identical text content')
			}
			return this.t('duplicatefinder', 'Text differences detected')
		},
		bothPanesHavePreview() {
			return Boolean(
				this.leftPane
				&& this.rightPane
				&& this.leftPane.previewUrl
				&& this.rightPane.previewUrl
				&& !this.previewErrors[this.leftPane.key]
				&& !this.previewErrors[this.rightPane.key],
			)
		},
		bothPanesHaveUrls() {
			return Boolean(
				(this.leftFile?.path || this.leftPane?.previewUrl)
				&& (this.rightFile?.path || this.rightPane?.previewUrl),
			)
		},
		zoomImageStyle() {
			return {
				transform: `scale(${this.zoomScale})`,
				transformOrigin: 'center center',
			}
		},
		wipeRightImageStyle() {
			const clamped = Math.max(0, Math.min(100, Number(this.wipePercent) || 0))
			return {
				transform: `scale(${this.zoomScale})`,
				transformOrigin: 'center center',
				clipPath: `inset(0 0 0 ${clamped}%)`,
			}
		},
		leftVisualInfo() {
			return this.resolutionEvaluation.perFile[this.boundedPair.leftIndex] || null
		},
		rightVisualInfo() {
			return this.resolutionEvaluation.perFile[this.boundedPair.rightIndex] || null
		},
		leftExifInfo() {
			const key = resolveVisualFileKey(this.leftFile)
			return normalizeExifMetadata(this.leftFile, key !== null ? this.parsedHeadersByKey[key] : null)
		},
		rightExifInfo() {
			const key = resolveVisualFileKey(this.rightFile)
			return normalizeExifMetadata(this.rightFile, key !== null ? this.parsedHeadersByKey[key] : null)
		},
		dhashSimilarity() {
			const leftKey = resolveVisualFileKey(this.leftFile)
			const rightKey = resolveVisualFileKey(this.rightFile)
			const hashA = (leftKey !== null && this.dhashByKey[leftKey]) || this.leftFile?.imageHash || null
			const hashB = (rightKey !== null && this.dhashByKey[rightKey]) || this.rightFile?.imageHash || null
			return computeHammingSimilarity(hashA, hashB)
		},
		visualVerdictKind() {
			if (this.inspectionState === 'inspecting') {
				return 'inspecting'
			}
			if (this.pixelMetrics?.similarityVerdict) {
				return this.pixelMetrics.similarityVerdict
			}
			if (this.dhashSimilarity) {
				if (this.dhashSimilarity.similarityPercent === 100) {
					return 'identical'
				}
				if (this.dhashSimilarity.similarityPercent >= 95) {
					return 'near-identical'
				}
				return 'similar'
			}
			return 'metadata-only'
		},
		visualVerdictLabel() {
			const kind = this.visualVerdictKind
			if (kind === 'identical') {
				return this.t('duplicatefinder', 'Identical pixels')
			}
			if (kind === 'near-identical') {
				return this.t('duplicatefinder', 'Near-identical ({percent}% match)', {
					percent: this.pixelMetrics?.pixelMatchPercent ?? this.dhashSimilarity?.similarityPercent ?? 99,
				})
			}
			if (kind === 'similar') {
				return this.t('duplicatefinder', 'Visually similar ({percent}% match)', {
					percent: this.pixelMetrics?.pixelMatchPercent ?? this.dhashSimilarity?.similarityPercent ?? 85,
				})
			}
			if (kind === 'different') {
				return this.t('duplicatefinder', 'Visual differences detected ({percent}% match)', {
					percent: this.pixelMetrics?.pixelMatchPercent ?? 0,
				})
			}
			if (kind === 'inspecting') {
				return this.t('duplicatefinder', 'Inspecting pixels...')
			}
			return this.t('duplicatefinder', 'Metadata inspection mode')
		},
		diffResult() {
			const leftStatus = this.resolveStatus(this.leftFile, this.boundedPair.leftIndex).label
			const rightStatus = this.resolveStatus(this.rightFile, this.boundedPair.rightIndex).label
			const unavailableLabel = this.t('duplicatefinder', 'Unavailable')
			const baseDiff = computeSideBySideDiffRows(this.leftFile, this.rightFile, {
				formatSize: bytes => this.formatSize(bytes),
				leftStatus,
				rightStatus,
				unavailableLabel,
			})

			const leftKey = resolveVisualFileKey(this.leftFile)
			const rightKey = resolveVisualFileKey(this.rightFile)
			const visualDiff = buildVisualDiffRows(this.leftFile, this.rightFile, {
				leftDimensions: this.leftVisualInfo?.dimensions || null,
				rightDimensions: this.rightVisualInfo?.dimensions || null,
				leftExif: this.leftExifInfo,
				rightExif: this.rightExifInfo,
				leftQualityLabel: this.resolveQualityBadgeLabel(this.leftVisualInfo),
				rightQualityLabel: this.resolveQualityBadgeLabel(this.rightVisualInfo),
				leftDhash: leftKey !== null && this.dhashByKey[leftKey] ? this.dhashByKey[leftKey].hex : '',
				rightDhash: rightKey !== null && this.dhashByKey[rightKey] ? this.dhashByKey[rightKey].hex : '',
				unavailableLabel,
			})

			const contentDiff = buildContentInspectionDiffRows(this.leftFile, this.rightFile, {
				leftParsed: this.leftContentParsed,
				rightParsed: this.rightContentParsed,
				unavailableLabel,
			})

			const mergedRows = [...baseDiff.rows, ...visualDiff.rows, ...contentDiff.rows]
			return {
				rows: mergedRows,
				diffCount: baseDiff.diffCount + visualDiff.diffCount + contentDiff.diffCount,
			}
		},
		visibleDiffRows() {
			return filterComparisonDiffRows(this.diffResult.rows, this.showOnlyDiffs)
		},
		panes() {
			return [
				this.buildPane('left', this.boundedPair.leftIndex, this.t('duplicatefinder', 'Left copy (Reference)')),
				this.buildPane('right', this.boundedPair.rightIndex, this.t('duplicatefinder', 'Right copy (Compare)')),
			].filter(Boolean)
		},
		leftPane() {
			return this.panes.find(pane => pane.side === 'left') || null
		},
		rightPane() {
			return this.panes.find(pane => pane.side === 'right') || null
		},
	},
	watch: {
		initialInspectionMode: {
			immediate: true,
			handler(nextMode) {
				if (['side-by-side', 'wipe', 'diff'].includes(nextMode)) {
					this.inspectionMode = nextMode
				}
			},
		},
		diffTolerance() {
			if (this.inspectionMode === 'diff' || (this.loadedImagesBySide.left && this.loadedImagesBySide.right)) {
				this.runCanvasVisualInspection()
			}
		},
		boundedPair() {
			this.loadedImagesBySide = { left: null, right: null }
			this.pixelMetrics = null
			this.diffHeatmapUrl = ''
			this.inspectionState = this.hasInspectableImages ? 'idle' : 'unavailable'
		},
		files: {
			immediate: true,
			handler(nextFiles, prevFiles) {
				if (!Array.isArray(nextFiles) || nextFiles.length === 0) {
					this.leftIndex = 0
					this.rightIndex = 0
					return
				}
				if (!prevFiles || nextFiles !== prevFiles) {
					this.previewErrors = {}
					this.mediaErrors = {}
					this.localDimensionsByKey = {}
					this.parsedHeadersByKey = {}
					this.contentParsedByKey = {}
					this.dhashByKey = {}
					this.exifFetchState = 'idle'
					this.contentFetchState = 'idle'
					this.showOnlyTextDiffs = false
					this.pixelMetrics = null
					this.diffHeatmapUrl = ''
					this.inspectionState = 'idle'
					const pair = pickDefaultComparisonPair(nextFiles, {
						isSelected: file => this.isFileSelected(file),
					})
					this.leftIndex = pair.leftIndex
					this.rightIndex = pair.rightIndex
				} else {
					const clamped = clampComparisonPair(nextFiles, this.leftIndex, this.rightIndex)
					this.leftIndex = clamped.leftIndex
					this.rightIndex = clamped.rightIndex
				}
				this.$nextTick(() => {
					this.syncSelectElements()
				})
			},
		},
	},
	beforeDestroy() {
		this.clearCopyTimer('left')
		this.clearCopyTimer('right')
	},
	methods: {
		setInspectionMode(mode) {
			if (!['side-by-side', 'wipe', 'diff'].includes(mode)) {
				return
			}
			this.inspectionMode = mode
			if (mode === 'diff') {
				this.runCanvasVisualInspection()
			}
		},
		hasPaneBadges(pane) {
			if (!pane) {
				return false
			}
			return Boolean(
				pane.badges
				|| pane.visual?.dimensions
				|| pane.visual?.isResolutionWinner
				|| pane.visual?.isLowerResolution
				|| pane.visual?.isExactDimensionMatch
				|| pane.exif?.camera
				|| pane.exif?.gpsPresent
				|| pane.contentParsed?.format
				|| pane.contentParsed?.durationFormatted
				|| pane.contentQuality?.isQualityWinner,
			)
		},
		resolveQualityBadgeLabel(visualInfo) {
			if (!visualInfo) {
				return ''
			}
			if (visualInfo.isResolutionWinner) {
				return this.t('duplicatefinder', 'Resolution winner')
			}
			if (visualInfo.isLowerResolution) {
				return this.t('duplicatefinder', 'Lower resolution ({delta}%)', { delta: visualInfo.deltaVsBestPercent })
			}
			if (visualInfo.isExactDimensionMatch) {
				return this.t('duplicatefinder', 'Exact resolution match')
			}
			return ''
		},
		onPaneImageLoad(side, file, event) {
			const img = event?.target
			if (!img || !file || !isRasterImageMimetype(file.mimetype)) {
				return
			}
			const width = Number(img.naturalWidth)
			const height = Number(img.naturalHeight)
			const key = resolveVisualFileKey(file)
			if (key !== null && width > 0 && height > 0) {
				this.$set(this.localDimensionsByKey, key, { width, height })
				this.$emit('visual-inspection-updated', {
					dimensionsByKey: this.mergedDimensionsByKey,
				})
			}
			this.loadedImagesBySide[side] = img
			if (this.loadedImagesBySide.left && this.loadedImagesBySide.right) {
				this.runCanvasVisualInspection()
			}
		},
		runCanvasVisualInspection() {
			const leftImg = this.loadedImagesBySide.left
			const rightImg = this.loadedImagesBySide.right
			if (!leftImg || !rightImg || typeof document === 'undefined' || typeof document.createElement !== 'function') {
				this.inspectionState = this.hasInspectableImages ? 'metadata-only' : 'unavailable'
				return
			}
			if (!isRasterImageMimetype(this.leftFile?.mimetype) || !isRasterImageMimetype(this.rightFile?.mimetype)) {
				this.inspectionState = 'unavailable'
				return
			}

			this.inspectionState = 'inspecting'
			try {
				const size = INSPECTION_GRID_SIZE
				const leftCanvas = document.createElement('canvas')
				const rightCanvas = document.createElement('canvas')
				leftCanvas.width = size
				leftCanvas.height = size
				rightCanvas.width = size
				rightCanvas.height = size
				const leftCtx = leftCanvas.getContext && leftCanvas.getContext('2d')
				const rightCtx = rightCanvas.getContext && rightCanvas.getContext('2d')
				if (!leftCtx || !rightCtx) {
					this.inspectionState = 'metadata-only'
					return
				}

				leftCtx.drawImage(leftImg, 0, 0, size, size)
				rightCtx.drawImage(rightImg, 0, 0, size, size)

				const leftRgba = leftCtx.getImageData(0, 0, size, size).data
				const rightRgba = rightCtx.getImageData(0, 0, size, size).data

				const leftHash = computeDifferenceHash(leftRgba, size, size)
				const rightHash = computeDifferenceHash(rightRgba, size, size)
				const leftKey = resolveVisualFileKey(this.leftFile)
				const rightKey = resolveVisualFileKey(this.rightFile)
				if (leftKey !== null && leftHash) {
					this.$set(this.dhashByKey, leftKey, leftHash)
				}
				if (rightKey !== null && rightHash) {
					this.$set(this.dhashByKey, rightKey, rightHash)
				}

				const metrics = computePixelDiffMetrics(leftRgba, rightRgba, size, size, this.diffTolerance)
				if (!metrics) {
					this.inspectionState = 'metadata-only'
					return
				}
				this.pixelMetrics = metrics

				const outCanvas = document.createElement('canvas')
				outCanvas.width = size
				outCanvas.height = size
				const outCtx = outCanvas.getContext && outCanvas.getContext('2d')
				if (outCtx && typeof outCtx.createImageData === 'function') {
					const outImageData = outCtx.createImageData(size, size)
					outImageData.data.set(metrics.diffRgba)
					outCtx.putImageData(outImageData, 0, 0)
					this.diffHeatmapUrl = outCanvas.toDataURL('image/png')
				}
				this.inspectionState = 'ready'
			} catch (error) {
				this.pixelMetrics = null
				this.diffHeatmapUrl = ''
				this.inspectionState = 'metadata-only'
			}
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
			return getPreviewImage(file) || ''
		},
		async loadExifHeadersForCurrentPair() {
			if (this.exifFetchState === 'loading' || typeof fetch !== 'function') {
				this.exifFetchState = 'unavailable'
				return
			}
			this.exifFetchState = 'loading'
			let loadedAny = false
			const targets = [this.leftFile, this.rightFile].filter(Boolean)
			for (const file of targets) {
				const key = resolveVisualFileKey(file)
				const url = this.resolveHeaderInspectionUrl(file)
				if (key === null || !url) {
					continue
				}
				try {
					const response = await fetch(url, {
						headers: { Range: 'bytes=0-65535' },
					})
					if (!response || !response.ok || typeof response.arrayBuffer !== 'function') {
						continue
					}
					const buffer = await response.arrayBuffer()
					const parsed = parseImageHeaderAndExif(buffer)
					if (parsed) {
						this.$set(this.parsedHeadersByKey, key, parsed)
						if (parsed.width > 0 && parsed.height > 0) {
							this.$set(this.localDimensionsByKey, key, {
								width: parsed.width,
								height: parsed.height,
							})
							this.$emit('visual-inspection-updated', {
								dimensionsByKey: this.mergedDimensionsByKey,
							})
						}
						loadedAny = true
					}
				} catch (error) {
					// Keep EXIF inspection resilient when remote source blocks range requests
				}
			}
			this.exifFetchState = loadedAny ? 'ready' : 'unavailable'
		},
		resolveWebDavContentUrl(file) {
			if (!file || typeof file !== 'object') {
				return ''
			}
			if (typeof file.downloadUrl === 'string') {
				const safeDownload = sanitizeContentUrl(file.downloadUrl)
				if (safeDownload) {
					return safeDownload
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
		async loadContentHeadersForCurrentPair() {
			if (this.contentFetchState === 'loading') {
				return
			}
			let loadedAny = false
			const targets = [this.leftFile, this.rightFile].filter(Boolean)

			for (const file of targets) {
				const key = resolveVisualFileKey(file)
				if (key === null) {
					continue
				}
				if (typeof file.inlineContent === 'string') {
					const parsedInline = inspectTextContent(file.inlineContent, file)
					if (parsedInline) {
						this.$set(this.contentParsedByKey, key, parsedInline)
						loadedAny = true
						continue
					}
				}
				if (typeof fetch !== 'function') {
					continue
				}
				const url = this.resolveWebDavContentUrl(file) || sanitizeContentUrl(this.resolveHeaderInspectionUrl(file))
				if (!url) {
					continue
				}
				this.contentFetchState = 'loading'
				try {
					const response = await fetch(url, {
						headers: { Range: 'bytes=0-65535' },
					})
					if (!response || !response.ok) {
						continue
					}
					let parsed = null
					if (typeof response.arrayBuffer === 'function') {
						const buffer = await response.arrayBuffer()
						parsed = parseMediaOrDocumentHeader(buffer, file)
					} else if (typeof response.text === 'function') {
						const text = await response.text()
						parsed = inspectTextContent(text, file)
					}
					if (parsed) {
						this.$set(this.contentParsedByKey, key, parsed)
						loadedAny = true
					}
				} catch (error) {
					// Keep content inspection resilient when remote source blocks range requests
				}
			}

			this.contentFetchState = loadedAny ? 'ready' : 'unavailable'
		},
		onMediaElementLoaded(side, file, event) {
			const el = event?.target
			const key = resolveVisualFileKey(file)
			if (!el || key === null) {
				return
			}
			const existing = this.contentParsedByKey[key] || {
				kind: classifyInspectableContent(file),
				format: (file.mimetype || '').split('/')[1]?.toUpperCase() || '',
			}
			const nextDuration = Number.isFinite(Number(el.duration)) && Number(el.duration) > 0
				? Math.round(Number(el.duration) * 10) / 10
				: (existing.durationSeconds || 0)
			const nextWidth = Number(el.videoWidth) > 0 ? Math.round(Number(el.videoWidth)) : (existing.width || 0)
			const nextHeight = Number(el.videoHeight) > 0 ? Math.round(Number(el.videoHeight)) : (existing.height || 0)
			this.$set(this.contentParsedByKey, key, {
				...existing,
				durationSeconds: nextDuration,
				durationFormatted: nextDuration > 0 ? formatMediaDuration(nextDuration) : (existing.durationFormatted || ''),
				width: nextWidth,
				height: nextHeight,
			})
		},
		onMediaSyncEvent(sourceSide, eventName) {
			if (!this.syncMediaPlayback || this.isSyncingMediaEvent) {
				return
			}
			const targetSide = sourceSide === 'left' ? 'right' : 'left'
			const sourceRef = this.$refs[`mediaPlayer-${sourceSide}`]
			const targetRef = this.$refs[`mediaPlayer-${targetSide}`]
			const sourceEl = Array.isArray(sourceRef) ? sourceRef[0] : sourceRef
			const targetEl = Array.isArray(targetRef) ? targetRef[0] : targetRef
			if (!sourceEl || !targetEl) {
				return
			}
			this.isSyncingMediaEvent = true
			try {
				if (eventName === 'seeked' && Number.isFinite(sourceEl.currentTime)) {
					targetEl.currentTime = sourceEl.currentTime
				} else if (eventName === 'play' && typeof targetEl.play === 'function') {
					if (Number.isFinite(sourceEl.currentTime)) {
						targetEl.currentTime = sourceEl.currentTime
					}
					const maybePromise = targetEl.play()
					if (maybePromise && typeof maybePromise.catch === 'function') {
						maybePromise.catch(() => {})
					}
				} else if (eventName === 'pause' && typeof targetEl.pause === 'function') {
					targetEl.pause()
				}
			} finally {
				Promise.resolve().then(() => {
					this.isSyncingMediaEvent = false
				})
			}
		},
		markMediaError(paneKey) {
			this.$set(this.mediaErrors, paneKey, true)
		},
		formatTextExcerpt(previewLines) {
			if (!Array.isArray(previewLines) || previewLines.length === 0) {
				return ''
			}
			return previewLines
				.slice(0, 8)
				.map(line => `${String(line.lineNumber).padStart(2, ' ')} | ${line.text}`)
				.join('\n')
		},
		selectLowerResolutionCopies() {
			const keys = selectLowerResolutionKeys(this.files, this.mergedDimensionsByKey)
			if (keys.length > 0) {
				this.$emit('select-lower-res', keys)
			}
		},
		syncSelectElements() {
			if (!this.$el || typeof this.$el.querySelector !== 'function') {
				return
			}
			const leftSelect = this.$el.querySelector('#compare-select-left')
			const rightSelect = this.$el.querySelector('#compare-select-right')
			if (leftSelect) {
				leftSelect.value = String(this.boundedPair.leftIndex)
			}
			if (rightSelect) {
				rightSelect.value = String(this.boundedPair.rightIndex)
			}
		},
		getFileKey(file) {
			return fileKey(file)
		},
		isFileSelected(file) {
			if (!file || !Array.isArray(this.selectedFiles)) {
				return false
			}
			return this.selectedFiles.some(selected => isSameFile(selected, file))
		},
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		resolveStatus(file, index) {
			if (!file) {
				return { kind: 'duplicate', label: '' }
			}
			if (file.isInOriginFolder) {
				return { kind: 'protected', label: this.t('duplicatefinder', 'Protected') }
			}
			if (this.hasActiveSelection) {
				return this.isFileSelected(file)
					? { kind: 'will-delete', label: this.t('duplicatefinder', 'Will delete') }
					: { kind: 'keeping', label: this.t('duplicatefinder', 'Keeping') }
			}
			return index === 0
				? { kind: 'original', label: this.t('duplicatefinder', 'Original') }
				: { kind: 'duplicate', label: this.t('duplicatefinder', 'Duplicate') }
		},
		buildPane(side, index, sideLabel) {
			const file = this.files[index]
			if (!file) {
				return null
			}
			const meta = extractFileDisplayMeta(file, { formatSize: bytes => this.formatSize(bytes) })
			const status = this.resolveStatus(file, index)
			const key = resolveVisualFileKey(file)
			const visual = this.resolutionEvaluation.perFile[index] || null
			const exif = normalizeExifMetadata(file, key !== null ? this.parsedHeadersByKey[key] : null)
			const contentKind = classifyInspectableContent(file)
			const contentParsed = (key !== null && this.contentParsedByKey[key])
				? this.contentParsedByKey[key]
				: (typeof file.inlineContent === 'string' ? inspectTextContent(file.inlineContent, file) : null)
			const contentQuality = this.contentQualityEvaluation.perFile[index] || null
			const streamUrl = this.resolveWebDavContentUrl(file)
			return {
				side,
				sideLabel,
				index,
				file,
				key: `${side}-${this.getFileKey(file)}`,
				meta,
				isProtected: Boolean(file.isInOriginFolder),
				isSelected: this.isFileSelected(file),
				statusKind: status.kind,
				statusLabel: status.label,
				previewUrl: getPreviewImage(file),
				streamUrl,
				contentKind,
				contentParsed,
				contentQuality,
				badges: this.metadataBadgesByIndex[index] || null,
				visual,
				exif,
				pathSegments: Array.isArray(this.pathSegmentsByIndex[index]) ? this.pathSegmentsByIndex[index] : [],
			}
		},
		formatOptionLabel(file, index) {
			const meta = extractFileDisplayMeta(file)
			const shortPath = meta.normalizedPath || meta.fileName || ''
			return `${this.t('duplicatefinder', 'File')} ${index + 1}: ${shortPath}`
		},
		getDiffRowLabel(key) {
			const labels = {
				fileName: this.t('duplicatefinder', 'Filename'),
				folder: this.t('duplicatefinder', 'Folder'),
				size: this.t('duplicatefinder', 'Size'),
				modifiedAt: this.t('duplicatefinder', 'Modified'),
				mimetype: this.t('duplicatefinder', 'Type'),
				status: this.t('duplicatefinder', 'Status'),
				dimensions: this.t('duplicatefinder', 'Dimensions'),
				aspectRatio: this.t('duplicatefinder', 'Aspect ratio'),
				megapixels: this.t('duplicatefinder', 'Resolution'),
				resolutionQuality: this.t('duplicatefinder', 'Quality verdict'),
				imageHash: this.t('duplicatefinder', 'Perceptual hash'),
				camera: this.t('duplicatefinder', 'Camera'),
				lens: this.t('duplicatefinder', 'Lens'),
				captureSettings: this.t('duplicatefinder', 'Capture settings'),
				dateTaken: this.t('duplicatefinder', 'Date taken'),
				colorSpace: this.t('duplicatefinder', 'Color space'),
				orientation: this.t('duplicatefinder', 'Orientation'),
				gpsMetadata: this.t('duplicatefinder', 'GPS EXIF'),
				contentFormat: this.t('duplicatefinder', 'Format / Encoding'),
				duration: this.t('duplicatefinder', 'Duration'),
				mediaDimensions: this.t('duplicatefinder', 'Video dimensions'),
				audioStream: this.t('duplicatefinder', 'Audio stream'),
				bitrate: this.t('duplicatefinder', 'Bitrate'),
				mediaTags: this.t('duplicatefinder', 'Media / Document tags'),
				documentStats: this.t('duplicatefinder', 'Document structure'),
			}
			return labels[key] || key
		},
		onSelectPaneIndex(side, event) {
			const nextIndex = Number(event && event.target ? event.target.value : -1)
			if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= this.files.length) {
				return
			}
			if (side === 'left') {
				if (nextIndex === this.boundedPair.rightIndex && this.files.length > 1) {
					this.rightIndex = this.boundedPair.leftIndex
				}
				this.leftIndex = nextIndex
				return
			}
			if (nextIndex === this.boundedPair.leftIndex && this.files.length > 1) {
				this.leftIndex = this.boundedPair.rightIndex
			}
			this.rightIndex = nextIndex
		},
		swapSides() {
			const prevLeft = this.boundedPair.leftIndex
			const prevRight = this.boundedPair.rightIndex
			this.leftIndex = prevRight
			this.rightIndex = prevLeft
		},
		markPreviewError(paneKey) {
			this.$set(this.previewErrors, paneKey, true)
		},
		clearCopyTimer(side) {
			if (this.copyTimers[side]) {
				clearTimeout(this.copyTimers[side])
				this.copyTimers[side] = null
			}
		},
		async copyPanePath(side, path) {
			if (!path) {
				return false
			}
			this.clearCopyTimer(side)
			this.$set(this.copyStates, side, 'idle')
			this.$set(this.copyMessages, side, '')
			const copied = await copyTextSafely(path)
			if (copied) {
				this.$set(this.copyStates, side, 'copied')
				this.$set(this.copyMessages, side, this.t('duplicatefinder', 'Copied'))
			} else {
				this.$set(this.copyStates, side, 'error')
				this.$set(this.copyMessages, side, this.t('duplicatefinder', 'Copy failed'))
			}
			this.copyTimers[side] = setTimeout(() => {
				this.$set(this.copyStates, side, 'idle')
				this.$set(this.copyMessages, side, '')
				this.copyTimers[side] = null
			}, 2000)
			return copied
		},
		openFile(file) {
			if (!file || !file.nodeId || !file.path) {
				return
			}
			const url = generateUrl(`/apps/files/files/${file.nodeId}?dir={dir}&openfile=true`, {
				dir: getParentFolderPath(file.path),
			})
			window.open(url, '_blank', 'noopener')
		},
		openFolder(file) {
			if (!file || !file.path) {
				return
			}
			const url = generateUrl('/apps/files/files?dir={dir}', {
				dir: getParentFolderPath(file.path),
			})
			window.open(url, '_blank', 'noopener')
		},
	},
}
</script>

<style scoped>
.compare-workspace {
	display: flex;
	flex-direction: column;
	gap: 14px;
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.compare-toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	box-sizing: border-box;
}

.compare-diff-summary {
	display: flex;
	align-items: center;
	min-inline-size: 0;
}

.compare-diff-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.82rem;
	font-weight: 600;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.compare-diff-badge.is-identical {
	background-color: rgba(46, 125, 50, 0.14);
	border: 1px solid rgba(46, 125, 50, 0.48);
	color: var(--color-main-text);
}

.compare-diff-badge.is-different {
	background-color: rgba(217, 119, 6, 0.14);
	border: 1px solid rgba(217, 119, 6, 0.48);
	color: var(--color-main-text);
}

.compare-toolbar__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-toolbar__button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.compare-toolbar__button svg {
	display: block;
	flex-shrink: 0;
	pointer-events: none;
}

.compare-toolbar__button:hover:not(:disabled),
.compare-toolbar__button:focus-visible:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-toolbar__button.is-active {
	background-color: rgba(0, 130, 201, 0.14);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-toolbar__button:focus-visible,
.compare-pane__select:focus-visible,
.compare-pane__mini-button:focus-visible,
.compare-pane__triage-button:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.compare-panes-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 14px;
	inline-size: 100%;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.compare-pane {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-inline-size: 0;
	padding: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-pane.is-selected {
	border-inline-start: 4px solid #d32f2f;
}

.compare-pane.is-keeping {
	border-inline-start: 4px solid var(--color-element-success, #2e7d32);
}

.compare-pane.is-protected {
	border-inline-start: 4px solid var(--color-primary-element, #0082c9);
}

.compare-pane__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-end;
	justify-content: space-between;
	gap: 10px;
}

.compare-pane__selector {
	display: flex;
	flex-direction: column;
	gap: 4px;
	flex: 1 1 180px;
	min-inline-size: 0;
}

.compare-pane__role-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.compare-pane__select {
	inline-size: 100%;
	max-inline-size: 100%;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.84rem;
	font-weight: 600;
	box-sizing: border-box;
}

.compare-pane__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.8rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.compare-pane__status-badge.is-will-delete {
	background-color: rgba(211, 47, 47, 0.14);
	border-color: rgba(211, 47, 47, 0.48);
}

.compare-pane__status-badge.is-keeping,
.compare-pane__status-badge.is-original {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.compare-pane__status-badge.is-protected {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-pane__preview {
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: 100%;
	min-block-size: 170px;
	max-block-size: 240px;
	padding: 8px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-dark);
	overflow: hidden;
	box-sizing: border-box;
}

.compare-pane__image {
	display: block;
	max-inline-size: 100%;
	max-block-size: 220px;
	object-fit: contain;
	border-radius: 4px;
}

.compare-pane__preview-fallback {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	color: var(--color-text-maxcontrast);
	font-size: 0.86rem;
	font-weight: 600;
	overflow-wrap: anywhere;
}

.compare-pane__identity {
	display: flex;
	flex-direction: column;
	gap: 6px;
	min-inline-size: 0;
}

.compare-pane__filename {
	display: block;
	font-size: 0.96rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.compare-pane__badges {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.metadata-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.76rem;
	font-weight: 600;
	line-height: 1.35;
}

.metadata-badge--protected {
	background-color: var(--color-primary-element-light, #e5eff5);
	border-color: var(--color-primary-element, #00679e);
}

.metadata-badge--oldest {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.metadata-badge--newest {
	background-color: rgba(2, 119, 189, 0.14);
	border-color: rgba(2, 119, 189, 0.45);
}

.metadata-badge--shortest {
	background-color: rgba(217, 119, 6, 0.14);
	border-color: rgba(217, 119, 6, 0.48);
}

.compare-pane__path-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.compare-pane__path {
	margin: 0;
	font-size: 0.84rem;
	line-height: 1.45;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.file-path-segment--common {
	color: var(--color-text-maxcontrast);
}

.file-path-segment--diff {
	color: var(--color-main-text);
	background-color: var(--color-primary-element-light, rgba(0, 130, 201, 0.14));
	font-weight: 600;
	border-radius: 3px;
	padding-inline: 2px;
}

.file-path-segment--filename {
	color: var(--color-main-text);
	font-weight: 500;
}

.compare-pane__path-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-pane__mini-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.compare-pane__mini-button:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-pane__copy-status {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.compare-pane__diff-list {
	display: flex;
	flex-direction: column;
	gap: 6px;
	margin: 0;
	padding: 0;
}

.compare-diff-row {
	display: grid;
	grid-template-columns: minmax(90px, 120px) minmax(0, 1fr);
	gap: 8px;
	padding-block: 6px;
	padding-inline: 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-diff-row.is-diff {
	border-color: rgba(217, 119, 6, 0.52);
	border-inline-start: 3px solid #d97706;
	background-color: rgba(217, 119, 6, 0.08);
}

.compare-diff-row__label {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 4px;
	margin: 0;
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.compare-diff-row__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 1px;
	padding-inline: 5px;
	border-radius: 999px;
	background-color: rgba(217, 119, 6, 0.18);
	color: var(--color-main-text);
	font-size: 0.7rem;
	font-weight: 700;
}

.compare-diff-row__value {
	margin: 0;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.compare-pane__no-diffs {
	margin: 0;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-weight: 500;
}

.compare-pane__footer {
	margin-block-start: auto;
	padding-block-start: 4px;
}

.compare-pane__triage-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	inline-size: 100%;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: 8px;
	border: 1px solid #d32f2f;
	background-color: rgba(211, 47, 47, 0.1);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.compare-pane__triage-button.is-marked-delete {
	border-color: var(--color-element-success, #2e7d32);
	background-color: rgba(46, 125, 50, 0.14);
}

.compare-pane__triage-button:hover {
	background-color: var(--color-background-dark);
}

.compare-pane__protected-note {
	display: inline-flex;
	align-items: center;
	min-block-size: 44px;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.compare-visual-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-visual-bar__modes,
.compare-visual-bar__tools {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-zoom-group {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
}

.compare-zoom-group__label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	padding-inline-end: 4px;
}

.compare-zoom-button {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 44px;
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border-maxcontrast, var(--color-border-dark));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	cursor: pointer;
	box-sizing: border-box;
}

.compare-zoom-button.is-active {
	background-color: rgba(0, 130, 201, 0.14);
	border-color: var(--color-primary-element, #0082c9);
}

.compare-zoom-button:focus-visible,
.compare-wipe-stage__slider:focus-visible,
.compare-diff-stage__tolerance-slider:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.compare-wipe-stage,
.compare-diff-stage {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-wipe-stage__header,
.compare-diff-stage__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.compare-wipe-stage__caption {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.compare-wipe-stage__ratio {
	font-size: 0.82rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
}

.compare-wipe-stage__viewport {
	position: relative;
	inline-size: 100%;
	min-block-size: 240px;
	block-size: 280px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.compare-wipe-stage__img {
	position: absolute;
	inset: 0;
	inline-size: 100%;
	block-size: 100%;
	object-fit: contain;
	transition: transform 0.15s ease;
}

.compare-wipe-stage__divider {
	position: absolute;
	inset-block: 0;
	inline-size: 2px;
	background-color: var(--color-primary-element, #0082c9);
	box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.75);
	pointer-events: none;
}

.compare-wipe-stage__controls {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}

.compare-wipe-stage__slider-label,
.compare-diff-stage__tolerance-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.compare-wipe-stage__slider,
.compare-diff-stage__tolerance-slider {
	flex: 1 1 200px;
	min-block-size: 44px;
	accent-color: var(--color-primary-element, #0082c9);
}

.compare-diff-stage__verdict-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-diff-stage__verdict-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.82rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
}

.compare-diff-stage__verdict-badge.is-identical,
.compare-diff-stage__verdict-badge.is-near-identical {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.compare-diff-stage__verdict-badge.is-similar,
.compare-diff-stage__verdict-badge.is-different {
	background-color: rgba(217, 119, 6, 0.14);
	border-color: rgba(217, 119, 6, 0.48);
}

.compare-diff-stage__subnote {
	font-size: 0.8rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
}

.compare-diff-stage__tolerance {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-diff-stage__metrics {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 8px;
	margin: 0;
	padding: 0;
}

.compare-diff-metric {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.compare-diff-metric dt {
	font-size: 0.76rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.compare-diff-metric dd {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: var(--color-main-text);
}

.compare-diff-stage__heatmap-wrap {
	display: flex;
	align-items: center;
	justify-content: center;
	min-block-size: 180px;
	max-block-size: 280px;
	padding: 8px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-dark);
	overflow: hidden;
}

.compare-diff-stage__heatmap {
	display: block;
	max-inline-size: 100%;
	max-block-size: 260px;
	object-fit: contain;
	border-radius: 4px;
}

.compare-diff-stage__fallback {
	margin: 0;
	padding: 12px;
	border-radius: 8px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-size: 0.84rem;
	font-weight: 500;
	color: var(--color-text-maxcontrast);
}

.metadata-badge--winner {
	background-color: rgba(46, 125, 50, 0.16);
	border-color: rgba(46, 125, 50, 0.56);
}

.metadata-badge--lower-res {
	background-color: rgba(217, 119, 6, 0.16);
	border-color: rgba(217, 119, 6, 0.56);
}

.metadata-badge--dim-match {
	background-color: rgba(0, 130, 201, 0.12);
	border-color: rgba(0, 130, 201, 0.45);
}

.metadata-badge--dimensions,
.metadata-badge--megapixels,
.metadata-badge--camera {
	background-color: var(--color-background-hover);
	border-color: var(--color-border-dark, var(--color-border));
	font-variant-numeric: tabular-nums;
}

.metadata-badge--gps {
	background-color: rgba(211, 47, 47, 0.14);
	border-color: rgba(211, 47, 47, 0.48);
}

@media (max-width: 800px) {
	.compare-panes-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.compare-diff-row {
		grid-template-columns: minmax(0, 1fr);
	}
}

.compare-content-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-content-bar__status,
.compare-content-bar__tools {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.compare-content-bar__kind-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: rgba(0, 130, 201, 0.14);
	border: 1px solid rgba(0, 130, 201, 0.44);
	color: var(--color-main-text);
	font-size: 0.8rem;
	font-weight: 700;
}

.compare-content-bar__quality-note {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-main-text);
}

.compare-content-bar__fallback-note {
	font-size: 0.8rem;
	font-weight: 500;
	color: var(--color-text-maxcontrast);
}

.compare-pane__media-video {
	display: block;
	inline-size: 100%;
	max-block-size: 200px;
	border-radius: 6px;
	background-color: #000000;
}

.compare-pane__audio-card,
.compare-pane__doc-card {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 10px;
	inline-size: 100%;
	block-size: 100%;
	padding: 12px;
	box-sizing: border-box;
}

.compare-pane__audio-header,
.compare-pane__doc-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.compare-pane__doc-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	background-color: rgba(0, 130, 201, 0.14);
	border: 1px solid rgba(0, 130, 201, 0.45);
	color: var(--color-main-text);
	font-size: 0.76rem;
	font-weight: 700;
}

.compare-pane__doc-stat {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
	font-size: 0.76rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.compare-pane__media-audio {
	inline-size: 100%;
	min-block-size: 44px;
}

.compare-pane__doc-meta,
.compare-pane__doc-hint {
	margin: 0;
	font-size: 0.82rem;
	line-height: 1.45;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.compare-pane__text-excerpt {
	margin: 0;
	padding: 8px 10px;
	max-block-size: 120px;
	overflow: auto;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.76rem;
	line-height: 1.4;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	text-align: start;
}

.compare-text-diff-stage {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border-radius: var(--border-radius-large, 10px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	box-sizing: border-box;
}

.compare-text-diff-stage__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.compare-text-diff-stage__verdict-group,
.compare-text-diff-stage__counts {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.8rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
}

.compare-text-diff-stage__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	font-size: 0.82rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
}

.compare-text-diff-stage__badge.is-identical {
	background-color: rgba(46, 125, 50, 0.14);
	border-color: rgba(46, 125, 50, 0.48);
}

.compare-text-diff-stage__badge.is-different {
	background-color: rgba(217, 119, 6, 0.14);
	border-color: rgba(217, 119, 6, 0.48);
}

.compare-text-diff-stage__meta-pill {
	padding-block: 3px;
	padding-inline: 8px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-main-text);
}

.compare-text-diff-table-wrap {
	inline-size: 100%;
	max-block-size: 320px;
	overflow: auto;
	border-radius: 8px;
	border: 1px solid var(--color-border);
}

.compare-text-diff-table {
	inline-size: 100%;
	border-collapse: collapse;
	table-layout: fixed;
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	font-size: 0.78rem;
	line-height: 1.45;
}

.compare-text-diff-table th {
	position: sticky;
	inset-block-start: 0;
	padding-block: 6px;
	padding-inline: 8px;
	background-color: var(--color-background-hover);
	border-bottom: 1px solid var(--color-border);
	color: var(--color-main-text);
	font-family: inherit;
	font-weight: 700;
	text-align: start;
}

.compare-text-diff-table td {
	padding-block: 4px;
	padding-inline: 8px;
	border-bottom: 1px solid var(--color-border);
	vertical-align: top;
	color: var(--color-main-text);
}

.compare-text-diff-table__num {
	inline-size: 42px;
	color: var(--color-text-maxcontrast);
	text-align: end;
	font-variant-numeric: tabular-nums;
	user-select: none;
}

.compare-text-diff-table__code {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.compare-text-diff-table tr.is-changed {
	background-color: rgba(217, 119, 6, 0.12);
}

.compare-text-diff-table tr.is-added {
	background-color: rgba(46, 125, 50, 0.12);
}

.compare-text-diff-table tr.is-removed {
	background-color: rgba(211, 47, 47, 0.12);
}

.compare-text-diff-stage__empty {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

@media (max-width: 768px) {
	.compare-content-bar .compare-toolbar__button {
		min-block-size: 44px;
	}
}
</style>
