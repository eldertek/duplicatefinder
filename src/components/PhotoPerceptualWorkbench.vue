<template>
	<section
		class="photo-perceptual-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Similar-Photo Perceptual pHash, EXIF Sharpness and Crop Comparator Workbench')">
		<header class="photo-pw__toolbar">
			<div class="photo-pw__title-group">
				<h3 class="photo-pw__title">
					{{ t('duplicatefinder', 'Similar Photos: pHash, EXIF, Sharpness & Crop') }}
				</h3>
				<span
					class="photo-pw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters ({photos} photos, {reclaimable} reclaimable)', {
						clusters: catalog.summary.totalClusters,
						photos: catalog.summary.totalPhotos,
						reclaimable: catalog.summary.totalReclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="photo-pw__toolbar-actions">
				<button
					type="button"
					class="photo-pw__tool-btn"
					:disabled="catalog.clusters.length === 0 || batchProbing || isDeleting"
					@click="probeVisibleClusters">
					<span>{{ batchProbing
						? t('duplicatefinder', 'Probing photos...')
						: t('duplicatefinder', 'Probe visible') }}</span>
				</button>
				<button
					type="button"
					class="photo-pw__tool-btn"
					:disabled="catalog.clusters.length === 0 || isDeleting"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="photo-pw__tool-btn"
					:disabled="catalog.clusters.length === 0 || isDeleting"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="photo-pw__tool-btn is-close"
					aria-keyshortcuts="7"
					:title="t('duplicatefinder', 'Hide similar-photo perceptual workbench')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide photos') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="photo-pw__empty">
			<p class="photo-pw__empty-title">
				{{ t('duplicatefinder', 'No duplicate photo groups loaded yet') }}
			</p>
			<p class="photo-pw__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to inspect JPEG, PNG, WebP, HEIC, and RAW photos for perceptual pHash/dHash similarity, EXIF sharpness, RGB histograms, and aspect-ratio crops.') }}
			</p>
			<button
				type="button"
				class="photo-pw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="photo-pw__controls">
				<div class="photo-pw__control-row">
					<span class="photo-pw__control-label">
						{{ t('duplicatefinder', 'Scope') }}
					</span>
					<div
						class="photo-pw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Photo inspection scope')">
						<button
							type="button"
							class="photo-pw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="photo-pw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<span class="photo-pw__control-label">
						{{ t('duplicatefinder', 'Clustering') }}
					</span>
					<div
						class="photo-pw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Photo clustering mode')">
						<button
							type="button"
							class="photo-pw__seg-btn"
							:class="{ 'is-active': clusteringMode === 'perceptual' }"
							:aria-pressed="clusteringMode === 'perceptual' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="clusteringMode = 'perceptual'">
							<span>{{ t('duplicatefinder', 'Perceptual pHash/dHash') }}</span>
						</button>
						<button
							type="button"
							class="photo-pw__seg-btn"
							:class="{ 'is-active': clusteringMode === 'groups' }"
							:aria-pressed="clusteringMode === 'groups' ? 'true' : 'false'"
							:disabled="isDeleting"
							@click="clusteringMode = 'groups'">
							<span>{{ t('duplicatefinder', 'Exact groups') }}</span>
						</button>
					</div>
				</div>

				<div class="photo-pw__control-row">
					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Hash mode') }}</span>
						<select
							v-model="matchMode"
							class="photo-pw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Perceptual hash algorithm')">
							<option value="combined">{{ t('duplicatefinder', 'Combined (pHash + dHash + Hist)') }}</option>
							<option value="phash">{{ t('duplicatefinder', 'DCT pHash (64-bit)') }}</option>
							<option value="dhash">{{ t('duplicatefinder', 'Gradient dHash (64-bit)') }}</option>
						</select>
					</label>

					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Variants') }}</span>
						<select
							v-model="variantFilter"
							class="photo-pw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Filter by photo variant type')">
							<option value="all">{{ t('duplicatefinder', 'All photo variants') }}</option>
							<option value="cropped">{{ t('duplicatefinder', 'Cropped & rotated') }}</option>
							<option value="lower-res">{{ t('duplicatefinder', 'Downscaled / lower-res') }}</option>
							<option value="social">{{ t('duplicatefinder', 'Social / re-encoded') }}</option>
							<option value="raw-pairs">{{ t('duplicatefinder', 'RAW + JPEG pairs') }}</option>
							<option value="unprobed">{{ t('duplicatefinder', 'Unprobed photos') }}</option>
						</select>
					</label>

					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Keep master') }}</span>
						<select
							v-model="keepRule"
							class="photo-pw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Master photo survivor strategy')">
							<option value="highest_quality">{{ t('duplicatefinder', 'Best overall quality') }}</option>
							<option value="sharpest">{{ t('duplicatefinder', 'Sharpest edge focus') }}</option>
							<option value="highest_resolution">{{ t('duplicatefinder', 'Highest pixel resolution') }}</option>
							<option value="raw_master">{{ t('duplicatefinder', 'RAW archival master') }}</option>
							<option value="oldest">{{ t('duplicatefinder', 'Oldest original capture') }}</option>
							<option value="newest">{{ t('duplicatefinder', 'Newest capture') }}</option>
							<option value="shortest_path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
						</select>
					</label>

					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Max Hamming (0..18)') }}</span>
						<input
							:value="hammingDraft"
							type="number"
							inputmode="numeric"
							min="0"
							max="18"
							class="photo-pw__number-input"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Maximum Hamming bit distance')"
							@input="onHammingInput"
							@blur="commitHammingDraft">
					</label>

					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Min match (%)') }}</span>
						<input
							:value="similarityDraft"
							type="number"
							inputmode="numeric"
							min="50"
							max="100"
							class="photo-pw__number-input"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Minimum perceptual similarity percentage')"
							@input="onSimilarityInput"
							@blur="commitSimilarityDraft">
					</label>
				</div>

				<div class="photo-pw__control-row">
					<label class="photo-pw__field photo-pw__field--grow">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Filter') }}</span>
						<input
							v-model="searchQuery"
							type="search"
							class="photo-pw__search-input"
							:disabled="isDeleting"
							:placeholder="t('duplicatefinder', 'Search filename, path, camera model, variant...')"
							:aria-label="t('duplicatefinder', 'Search similar photo clusters')">
					</label>

					<label class="photo-pw__field">
						<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Sort') }}</span>
						<select
							v-model="sortBy"
							class="photo-pw__select"
							:disabled="isDeleting"
							:aria-label="t('duplicatefinder', 'Sort photo clusters')">
							<option value="reclaimable_desc">{{ t('duplicatefinder', 'Most reclaimable space') }}</option>
							<option value="res_spread_desc">{{ t('duplicatefinder', 'Largest resolution gap') }}</option>
							<option value="similarity_asc">{{ t('duplicatefinder', 'Lowest similarity / crops first') }}</option>
							<option value="cluster_size_desc">{{ t('duplicatefinder', 'Largest cluster count') }}</option>
						</select>
					</label>
				</div>
			</div>

			<div class="photo-pw__kpis">
				<div class="photo-pw__kpi-card">
					<span class="photo-pw__kpi-label">{{ t('duplicatefinder', 'Photo clusters') }}</span>
					<strong class="photo-pw__kpi-value">{{ catalog.summary.totalClusters }}</strong>
					<span class="photo-pw__kpi-sub">{{ t('duplicatefinder', '{count} inspected photos', { count: catalog.summary.totalPhotos }) }}</span>
				</div>
				<div class="photo-pw__kpi-card">
					<span class="photo-pw__kpi-label">{{ t('duplicatefinder', 'Reclaimable space') }}</span>
					<strong class="photo-pw__kpi-value">{{ catalog.summary.totalReclaimableFormatted }}</strong>
					<span class="photo-pw__kpi-sub">{{ t('duplicatefinder', 'Preserving 1 master per cluster') }}</span>
				</div>
				<div class="photo-pw__kpi-card">
					<span class="photo-pw__kpi-label">{{ t('duplicatefinder', 'Crops & lower-res') }}</span>
					<strong class="photo-pw__kpi-value">{{ catalog.summary.croppedCount + catalog.summary.lowerResCount }}</strong>
					<span class="photo-pw__kpi-sub">{{ t('duplicatefinder', '{cropped} crops, {social} social copies', {
						cropped: catalog.summary.croppedCount,
						social: catalog.summary.socialCount,
					}) }}</span>
				</div>
				<div class="photo-pw__kpi-card">
					<span class="photo-pw__kpi-label">{{ t('duplicatefinder', 'Probed signatures') }}</span>
					<strong class="photo-pw__kpi-value">{{ catalog.summary.probedCount }}</strong>
					<span class="photo-pw__kpi-sub">{{ t('duplicatefinder', '{raw} RAW+JPEG pairs', { count: catalog.summary.rawPairCount, raw: catalog.summary.rawPairCount }) }}</span>
				</div>
			</div>

			<p
				v-if="statusNotice"
				class="photo-pw__notice"
				:class="'is-' + statusNoticeType"
				role="status"
				aria-live="polite">
				{{ statusNotice }}
			</p>

			<div v-if="catalog.clusters.length === 0" class="photo-pw__empty">
				<p class="photo-pw__empty-title">
					{{ t('duplicatefinder', 'No photo clusters match the current filters') }}
				</p>
				<p class="photo-pw__empty-hint">
					{{ t('duplicatefinder', 'Relax the Hamming distance, variant filter, or search query to inspect available photo duplicates.') }}
				</p>
				<button
					type="button"
					class="photo-pw__tool-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
				</button>
			</div>

			<div v-else class="photo-pw__split">
				<aside
					class="photo-pw__cluster-list"
					:aria-label="t('duplicatefinder', 'Similar photo cluster queue')">
					<button
						v-for="cluster in catalog.clusters"
						:key="cluster.clusterKey"
						type="button"
						class="photo-pw__cluster-item"
						:class="{ 'is-selected': activeCluster && activeCluster.clusterKey === cluster.clusterKey }"
						:aria-pressed="activeCluster && activeCluster.clusterKey === cluster.clusterKey ? 'true' : 'false'"
						@click="selectCluster(cluster)">
						<div class="photo-pw__cluster-head">
							<span class="photo-pw__cluster-title">{{ cluster.title }}</span>
							<span class="photo-pw__cluster-size">{{ cluster.reclaimableFormatted }}</span>
						</div>
						<div class="photo-pw__cluster-meta">
							<span class="photo-pw__badge">{{ t('duplicatefinder', '{count} copies', { count: cluster.fileCount }) }}</span>
							<span class="photo-pw__badge is-match">{{ cluster.minSimilarityPct }}%</span>
							<span v-if="cluster.hasCropped" class="photo-pw__badge is-warn">{{ t('duplicatefinder', 'Crop') }}</span>
							<span v-if="cluster.hasLowerRes" class="photo-pw__badge is-info">{{ t('duplicatefinder', 'Lower-res') }}</span>
							<span v-if="cluster.hasSocial" class="photo-pw__badge is-info">{{ t('duplicatefinder', 'Social') }}</span>
							<span v-if="cluster.hasRawPair" class="photo-pw__badge is-raw">{{ t('duplicatefinder', 'RAW+JPG') }}</span>
						</div>
					</button>
				</aside>

				<div v-if="activeCluster" class="photo-pw__inspector">
					<header class="photo-pw__inspector-header">
						<div class="photo-pw__inspector-title-wrap">
							<h4 class="photo-pw__inspector-title">
								{{ activeCluster.title }}
							</h4>
							<p class="photo-pw__inspector-sub">
								{{ t('duplicatefinder', 'Master: {path} ({dims}) - Reclaimable: {size}', {
									path: activeCluster.survivorFile.path || activeCluster.survivorFile.name,
									dims: activeCluster.survivorFile.dimensions
										? activeCluster.survivorFile.dimensions.formattedDimensions
										: activeCluster.survivorFile.format,
									size: activeCluster.reclaimableFormatted,
								}) }}
							</p>
						</div>

						<div class="photo-pw__inspector-actions">
							<button
								type="button"
								class="photo-pw__mini-btn"
								:disabled="batchProbing || isDeleting"
								@click="probeCluster(activeCluster)">
								<span>{{ t('duplicatefinder', 'Probe cluster') }}</span>
							</button>
							<button
								type="button"
								class="photo-pw__mini-btn"
								:disabled="isDeleting"
								@click="selectInferiorCopies(false)">
								<span>{{ t('duplicatefinder', 'Select inferior copies') }}</span>
							</button>
							<button
								type="button"
								class="photo-pw__mini-btn"
								:disabled="!activeCluster.primaryGroupId"
								@click="openSideBySideCompare">
								<span>{{ t('duplicatefinder', 'Open in Compare (v)') }}</span>
							</button>
							<button
								type="button"
								class="photo-pw__mini-btn"
								:disabled="!activeCluster.primaryGroupId"
								@click="focusInMainView(activeCluster.survivorFile)">
								<span>{{ t('duplicatefinder', 'Jump to group') }}</span>
							</button>
						</div>
					</header>

					<section
						v-if="compareLeftFile && compareRightFile"
						class="photo-pw__comparator"
						:aria-label="t('duplicatefinder', 'EXIF Sharpness, Histogram and Crop Comparator')">
						<div class="photo-pw__comparator-selectors">
							<label class="photo-pw__field photo-pw__field--grow">
								<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Reference (Left)') }}</span>
								<select
									v-model="compareLeftKey"
									class="photo-pw__select"
									:aria-label="t('duplicatefinder', 'Reference photo for comparison')">
									<option
										v-for="item in activeCluster.files"
										:key="'left-' + item.key"
										:value="item.key">
										{{ item.name }} ({{ item.dimensions ? item.dimensions.formattedDimensions : item.sizeFormatted }})
									</option>
								</select>
							</label>
							<label class="photo-pw__field photo-pw__field--grow">
								<span class="photo-pw__control-label">{{ t('duplicatefinder', 'Candidate (Right)') }}</span>
								<select
									v-model="compareRightKey"
									class="photo-pw__select"
									:aria-label="t('duplicatefinder', 'Candidate photo for comparison')">
									<option
										v-for="item in activeCluster.files"
										:key="'right-' + item.key"
										:value="item.key">
										{{ item.name }} ({{ item.dimensions ? item.dimensions.formattedDimensions : item.sizeFormatted }})
									</option>
								</select>
							</label>
						</div>

						<div class="photo-pw__metrics-deck">
							<div class="photo-pw__metric-box">
								<span class="photo-pw__metric-label">{{ t('duplicatefinder', 'Perceptual match') }}</span>
								<strong class="photo-pw__metric-value">
									{{ pairComparison.combinedSimilarityPct !== null
										? pairComparison.combinedSimilarityPct + '%'
										: t('duplicatefinder', 'Unprobed') }}
								</strong>
								<span class="photo-pw__metric-sub">
									{{ pairComparison.pHashSimilarity
										? t('duplicatefinder', 'pHash {p}/64', { p: pairComparison.pHashSimilarity.distance })
										: t('duplicatefinder', 'pHash pending') }}
									/
									{{ pairComparison.dHashSimilarity
										? t('duplicatefinder', 'dHash {d}/64', { d: pairComparison.dHashSimilarity.distance })
										: t('duplicatefinder', 'dHash pending') }}
								</span>
							</div>

							<div class="photo-pw__metric-box">
								<span class="photo-pw__metric-label">{{ t('duplicatefinder', 'Crop & framing verdict') }}</span>
								<strong class="photo-pw__metric-value">{{ pairComparison.cropAnalysis.badgeLabel }}</strong>
								<span class="photo-pw__metric-sub">{{ pairComparison.cropAnalysis.summary }}</span>
							</div>

							<div class="photo-pw__metric-box">
								<span class="photo-pw__metric-label">{{ t('duplicatefinder', 'Sharpness comparison') }}</span>
								<strong class="photo-pw__metric-value">
									{{ compareLeftFile.sharpnessScore !== null ? compareLeftFile.sharpnessScore : '?' }}
									vs
									{{ compareRightFile.sharpnessScore !== null ? compareRightFile.sharpnessScore : '?' }}
								</strong>
								<span class="photo-pw__metric-sub">
									{{ pairComparison.histogramComparison
										? t('duplicatefinder', 'Histogram match {pct}%', { pct: pairComparison.histogramComparison.combinedSimilarityPct })
										: t('duplicatefinder', 'Probe pixels for histogram & sharpness') }}
								</span>
							</div>
						</div>

						<div class="photo-pw__visual-scopes">
							<div class="photo-pw__scope-card">
								<h5 class="photo-pw__scope-title">
									{{ t('duplicatefinder', 'Aspect & Crop Framing Box') }}
								</h5>
								<svg
									class="photo-pw__crop-svg"
									viewBox="0 0 160 110"
									role="img"
									:aria-label="t('duplicatefinder', 'Master vs candidate aspect framing comparison')">
									<rect
										x="10"
										y="10"
										width="140"
										height="90"
										rx="4"
										class="photo-pw__crop-master" />
									<rect
										:x="10 + (140 * pairComparison.cropAnalysis.cropOverlayBox.xPct / 100)"
										:y="10 + (90 * pairComparison.cropAnalysis.cropOverlayBox.yPct / 100)"
										:width="140 * pairComparison.cropAnalysis.cropOverlayBox.widthPct / 100"
										:height="90 * pairComparison.cropAnalysis.cropOverlayBox.heightPct / 100"
										rx="3"
										class="photo-pw__crop-candidate" />
								</svg>
								<p class="photo-pw__scope-caption">
									{{ t('duplicatefinder', '{pct}% frame retained ({arLeft} vs {arRight})', {
										pct: pairComparison.cropAnalysis.cropRetentionPct,
										arLeft: compareLeftFile.aspectRatio || '?',
										arRight: compareRightFile.aspectRatio || '?',
									}) }}
								</p>
							</div>

							<div class="photo-pw__scope-card">
								<h5 class="photo-pw__scope-title">
									{{ t('duplicatefinder', '16-Bin Luma Histogram (Ref vs Cand)') }}
								</h5>
								<svg
									v-if="compareLeftFile.histogram || compareRightFile.histogram"
									class="photo-pw__hist-svg"
									viewBox="0 0 192 64"
									role="img"
									:aria-label="t('duplicatefinder', '16-bin luminance histogram comparison')">
									<g
										v-for="(bar, idx) in histogramBars"
										:key="'bin-' + idx">
										<rect
											:x="idx * 12 + 1"
											:y="60 - bar.leftHeight"
											width="5"
											:height="bar.leftHeight"
											class="photo-pw__hist-left" />
										<rect
											:x="idx * 12 + 6"
											:y="60 - bar.rightHeight"
											width="5"
											:height="bar.rightHeight"
											class="photo-pw__hist-right" />
									</g>
								</svg>
								<p v-else class="photo-pw__scope-empty">
									{{ t('duplicatefinder', 'Click "Probe cluster" on loaded images to extract 16-bin RGB/Luma histogram curves.') }}
								</p>
							</div>
						</div>

						<div class="photo-pw__exif-grid">
							<div
								v-for="row in pairComparison.exifDiffRows"
								:key="row.label"
								class="photo-pw__exif-row"
								:class="{ 'is-diff': row.differs }">
								<span class="photo-pw__exif-label">{{ row.label }}</span>
								<span class="photo-pw__exif-val">{{ row.leftValue }}</span>
								<span class="photo-pw__exif-val">{{ row.rightValue }}</span>
							</div>
						</div>
					</section>

					<div class="photo-pw__roster">
						<div
							v-for="item in activeCluster.files"
							:key="item.key"
							class="photo-pw__copy-card"
							:class="{
								'is-survivor': item.isSurvivor,
								'is-selected': selectedDeleteKeys.includes(item.key),
							}">
							<label class="photo-pw__check-label">
								<input
									type="checkbox"
									class="photo-pw__checkbox"
									:checked="selectedDeleteKeys.includes(item.key)"
									:disabled="!item.deletable || isDeleting"
									:aria-label="t('duplicatefinder', 'Select {name} for deletion', { name: item.name })"
									@change="toggleFileSelection(item.key)">
							</label>

							<div class="photo-pw__copy-main">
								<div class="photo-pw__copy-title-row">
									<strong class="photo-pw__copy-name">{{ item.name }}</strong>
									<span
										class="photo-pw__badge"
										:class="{
											'is-survivor': item.isSurvivor,
											'is-warn': item.variantTag === 'cropped',
											'is-info': item.variantTag === 'lower-res' || item.variantTag === 'social',
											'is-raw': item.variantTag === 'raw-pair',
										}">
										{{ item.variantLabel }}
									</span>
									<span v-if="item.isProtected" class="photo-pw__badge is-protected">
										{{ t('duplicatefinder', 'Protected origin') }}
									</span>
								</div>

								<p class="photo-pw__copy-path">
									{{ item.path || item.folder }}
								</p>

								<div class="photo-pw__copy-meta">
									<span>{{ item.sizeFormatted }}</span>
									<span v-if="item.dimensions">{{ item.dimensions.formattedDimensions }} ({{ item.megapixels }})</span>
									<span v-if="item.aspectRatio">{{ item.aspectRatio }}</span>
									<span v-if="item.sharpnessScore !== null">{{ t('duplicatefinder', 'Sharpness {score}/100', { score: item.sharpnessScore }) }}</span>
									<span v-if="item.pHash">{{ t('duplicatefinder', 'pHash {hex}', { hex: item.pHash.hex }) }}</span>
									<span v-if="item.exif && item.exif.summaryCompact">{{ item.exif.summaryCompact }}</span>
								</div>
							</div>

							<div class="photo-pw__copy-actions">
								<button
									v-if="!item.isSurvivor"
									type="button"
									class="photo-pw__mini-btn"
									:disabled="isDeleting"
									@click="promoteMaster(activeCluster.clusterKey, item.key)">
									<span>{{ t('duplicatefinder', 'Pin master') }}</span>
								</button>
								<button
									type="button"
									class="photo-pw__mini-btn"
									:disabled="probingKey === item.key || isDeleting"
									@click="probeSinglePhoto(item)">
									<span>{{ probingKey === item.key ? t('duplicatefinder', 'Probing...') : t('duplicatefinder', 'Probe') }}</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

			<footer class="photo-pw__bulk-bar">
				<div class="photo-pw__bulk-summary">
					<strong>{{ t('duplicatefinder', '{count} copies selected ({size})', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}</strong>
					<span v-if="selectedCroppedCount > 0" class="photo-pw__bulk-note">
						{{ t('duplicatefinder', 'Includes {count} cropped/rotated variants', { count: selectedCroppedCount }) }}
					</span>
				</div>
				<div class="photo-pw__bulk-actions">
					<button
						type="button"
						class="photo-pw__tool-btn"
						:disabled="isDeleting"
						@click="selectInferiorCopies(true)">
						<span>{{ t('duplicatefinder', 'Select all inferior + crops') }}</span>
					</button>
					<button
						type="button"
						class="photo-pw__tool-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="clearSelection">
						<span>{{ t('duplicatefinder', 'Clear selection') }}</span>
					</button>
					<button
						type="button"
						class="photo-pw__danger-btn"
						:disabled="selectedDeleteItems.length === 0 || isDeleting"
						@click="openDeleteDialog">
						<span>{{ isDeleting
							? t('duplicatefinder', 'Deleting...')
							: t('duplicatefinder', 'Delete selected ({count})', { count: selectedDeleteItems.length }) }}</span>
					</button>
				</div>
			</footer>
		</template>

		<dialog
			ref="photoDeleteDialog"
			class="photo-confirm-dialog"
			aria-labelledby="photo-delete-dialog-title"
			@cancel.prevent="closeDeleteDialog"
			@close="onDeleteDialogClose"
			@click="onDeleteDialogBackdropClick">
			<div class="photo-confirm-dialog__content">
				<h4 id="photo-delete-dialog-title" class="photo-confirm-dialog__title">
					{{ t('duplicatefinder', 'Delete selected duplicate photos?') }}
				</h4>
				<p class="photo-confirm-dialog__body">
					{{ t('duplicatefinder', 'You are about to remove {count} inferior photo copies freeing {size}. Every cluster keeps its designated master survivor.', {
						count: selectedDeleteItems.length,
						size: selectedDeleteSizeFormatted,
					}) }}
				</p>
				<p v-if="selectedCroppedCount > 0" class="photo-confirm-dialog__warning">
					{{ t('duplicatefinder', '{count} selected files have different aspect crops or rotations compared to their master.', {
						count: selectedCroppedCount,
					}) }}
				</p>
				<div class="photo-confirm-dialog__actions">
					<button
						type="button"
						class="photo-pw__tool-btn"
						:disabled="isDeleting"
						@click="closeDeleteDialog">
						<span>{{ t('duplicatefinder', 'Cancel') }}</span>
					</button>
					<button
						type="button"
						class="photo-pw__danger-btn"
						:disabled="isDeleting"
						@click="confirmBatchDelete">
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
import { getFileSelectionKey } from '../tools/duplicateSelectionAndExport'
import { formatBytes } from '../tools/duplicateStats'
import { sanitizeContentUrl } from '../tools/mediaContentInspector'
import {
	buildPhotoPerceptualCatalog,
	comparePhotoPair,
	DEFAULT_HAMMING_DISTANCE,
	DEFAULT_SIMILARITY_PCT,
	exportPhotoPerceptualCsv,
	exportPhotoPerceptualJson,
	MAX_HAMMING_DISTANCE,
	MAX_PHOTO_PROBE_BYTES,
	MAX_SIMILARITY_PCT,
	MIN_HAMMING_DISTANCE,
	MIN_SIMILARITY_PCT,
	probePhotoBufferAndPixels,
	selectInferiorPhotoKeys,
} from '../tools/photoPerceptualInspector'
import { normalizeItemPath } from '../tools/utils'

export default {
	name: 'PhotoPerceptualWorkbench',
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
			clusteringMode: 'perceptual',
			matchMode: 'combined',
			variantFilter: 'all',
			keepRule: 'highest_quality',
			sortBy: 'reclaimable_desc',
			maxHammingDistance: DEFAULT_HAMMING_DISTANCE,
			hammingDraft: String(DEFAULT_HAMMING_DISTANCE),
			minSimilarityPct: DEFAULT_SIMILARITY_PCT,
			similarityDraft: String(DEFAULT_SIMILARITY_PCT),
			searchQuery: '',
			selectedClusterKey: '',
			compareLeftKey: '',
			compareRightKey: '',
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
			return buildPhotoPerceptualCatalog(this.activeDuplicates, {
				keepRule: this.keepRule,
				variantFilter: this.variantFilter,
				matchMode: this.matchMode,
				sortBy: this.sortBy,
				clusteringMode: this.clusteringMode,
				maxHammingDistance: this.maxHammingDistance,
				minSimilarityPct: this.minSimilarityPct,
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
		compareLeftFile() {
			if (!this.activeCluster) {
				return null
			}
			return this.activeCluster.files.find(f => f.key === this.compareLeftKey)
				|| this.activeCluster.files[0]
				|| null
		},
		compareRightFile() {
			if (!this.activeCluster) {
				return null
			}
			return this.activeCluster.files.find(f => f.key === this.compareRightKey)
				|| this.activeCluster.files[1]
				|| this.activeCluster.files[0]
				|| null
		},
		pairComparison() {
			if (!this.compareLeftFile || !this.compareRightFile) {
				return {
					pHashSimilarity: null,
					dHashSimilarity: null,
					histogramComparison: null,
					combinedSimilarityPct: null,
					cropAnalysis: {
						badgeLabel: 'Exact duplicate',
						summary: '',
						cropRetentionPct: 100,
						cropOverlayBox: { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 },
					},
					exifDiffRows: [],
				}
			}
			return comparePhotoPair(this.compareLeftFile, this.compareRightFile, this.matchMode)
		},
		histogramBars() {
			const bins = 16
			const leftBins = this.compareLeftFile?.histogram?.lumaPct || new Array(bins).fill(0)
			const rightBins = this.compareRightFile?.histogram?.lumaPct || new Array(bins).fill(0)
			const bars = []
			for (let i = 0; i < bins; i++) {
				const lh = Math.max(2, Math.round((Number(leftBins[i] || 0) / 100) * 56))
				const rh = Math.max(2, Math.round((Number(rightBins[i] || 0) / 100) * 56))
				bars.push({ leftHeight: lh, rightHeight: rh })
			}
			return bars
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
		selectedCroppedCount() {
			return this.selectedDeleteItems.filter(item => item.variantTag === 'cropped').length
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
					this.compareLeftKey = ''
					this.compareRightKey = ''
					return
				}
				const target = list.find(c => c.clusterKey === this.selectedClusterKey) || list[0]
				this.selectedClusterKey = target.clusterKey
				this.syncComparePair(target)
			},
		},
	},
	methods: {
		onHammingInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			this.hammingDraft = raw
			if (raw.trim() === '') {
				return
			}
			const numeric = Number(raw)
			if (Number.isFinite(numeric) && numeric >= MIN_HAMMING_DISTANCE && numeric <= MAX_HAMMING_DISTANCE) {
				this.maxHammingDistance = Math.round(numeric)
			}
		},
		commitHammingDraft() {
			const trimmed = String(this.hammingDraft ?? '').trim()
			const numeric = trimmed !== '' ? Number(trimmed) : Number.NaN
			const clamped = Number.isFinite(numeric)
				? Math.max(MIN_HAMMING_DISTANCE, Math.min(MAX_HAMMING_DISTANCE, Math.round(numeric)))
				: DEFAULT_HAMMING_DISTANCE
			this.maxHammingDistance = clamped
			this.hammingDraft = String(clamped)
		},
		onSimilarityInput(event) {
			const raw = event && event.target ? String(event.target.value) : ''
			this.similarityDraft = raw
			if (raw.trim() === '') {
				return
			}
			const numeric = Number(raw)
			if (Number.isFinite(numeric) && numeric >= MIN_SIMILARITY_PCT && numeric <= MAX_SIMILARITY_PCT) {
				this.minSimilarityPct = Math.round(numeric)
			}
		},
		commitSimilarityDraft() {
			const trimmed = String(this.similarityDraft ?? '').trim()
			const numeric = trimmed !== '' ? Number(trimmed) : Number.NaN
			const clamped = Number.isFinite(numeric)
				? Math.max(MIN_SIMILARITY_PCT, Math.min(MAX_SIMILARITY_PCT, Math.round(numeric)))
				: DEFAULT_SIMILARITY_PCT
			this.minSimilarityPct = clamped
			this.similarityDraft = String(clamped)
		},
		resetFilters() {
			this.variantFilter = 'all'
			this.searchQuery = ''
			this.maxHammingDistance = DEFAULT_HAMMING_DISTANCE
			this.hammingDraft = String(DEFAULT_HAMMING_DISTANCE)
			this.minSimilarityPct = DEFAULT_SIMILARITY_PCT
			this.similarityDraft = String(DEFAULT_SIMILARITY_PCT)
		},
		selectCluster(cluster) {
			if (!cluster) {
				return
			}
			this.selectedClusterKey = cluster.clusterKey
			this.syncComparePair(cluster)
		},
		syncComparePair(cluster) {
			if (!cluster || !Array.isArray(cluster.files) || cluster.files.length === 0) {
				this.compareLeftKey = ''
				this.compareRightKey = ''
				return
			}
			const keys = new Set(cluster.files.map(f => f.key))
			if (!keys.has(this.compareLeftKey)) {
				this.compareLeftKey = cluster.survivorKey || cluster.files[0].key
			}
			if (!keys.has(this.compareRightKey) || this.compareRightKey === this.compareLeftKey) {
				const alt = cluster.files.find(f => f.key !== this.compareLeftKey) || cluster.files[0]
				this.compareRightKey = alt.key
			}
		},
		promoteMaster(clusterKey, fileKey) {
			if (!clusterKey || !fileKey) {
				return
			}
			this.$set(this.manualKeepByCluster, clusterKey, fileKey)
			this.selectedDeleteKeys = this.selectedDeleteKeys.filter(k => k !== fileKey)
			this.compareLeftKey = fileKey
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
		selectInferiorCopies(includeCropped) {
			const keys = selectInferiorPhotoKeys(this.catalog, {
				includeCropped: Boolean(includeCropped),
			})
			this.selectedDeleteKeys = keys
			this.statusNoticeType = 'info'
			this.statusNotice = this.t('duplicatefinder', 'Selected {count} inferior photo copies.', {
				count: keys.length,
			})
		},
		clearSelection() {
			this.selectedDeleteKeys = []
		},
		resolvePhotoFetchUrl(file) {
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
		async decodePixelsFromBlob(blob) {
			if (
				!blob
				|| typeof document === 'undefined'
				|| typeof createImageBitmap !== 'function'
			) {
				return null
			}
			let bitmap = null
			try {
				bitmap = await createImageBitmap(blob)
				const maxDim = 128
				const scale = Math.min(1, maxDim / Math.max(bitmap.width || 1, bitmap.height || 1))
				const w = Math.max(8, Math.round((bitmap.width || 1) * scale))
				const h = Math.max(8, Math.round((bitmap.height || 1) * scale))
				const canvas = document.createElement('canvas')
				canvas.width = w
				canvas.height = h
				const ctx = canvas.getContext && canvas.getContext('2d')
				if (!ctx) {
					return null
				}
				ctx.drawImage(bitmap, 0, 0, w, h)
				const imgData = ctx.getImageData(0, 0, w, h)
				return {
					rgba: imgData.data,
					width: w,
					height: h,
				}
			} catch (err) {
				return null
			} finally {
				if (bitmap && typeof bitmap.close === 'function') {
					bitmap.close()
				}
			}
		},
		async probeSinglePhoto(item) {
			if (!item || !item.file) {
				return null
			}
			const key = String(getFileSelectionKey(item.file) ?? item.key)
			const url = this.resolvePhotoFetchUrl(item.file)
			if (!url || typeof fetch !== 'function') {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Photo preview URL unavailable for {name}.', {
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
						Range: `bytes=0-${MAX_PHOTO_PROBE_BYTES - 1}`,
					},
				})
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`)
				}
				const buffer = await response.arrayBuffer()
				const bytes = new Uint8Array(buffer)
				let rgbaFrame = null
				if (typeof Blob === 'function' && bytes.byteLength > 0) {
					const mime = item.mimetype || 'image/jpeg'
					const blob = new Blob([bytes], { type: mime })
					rgbaFrame = await this.decodePixelsFromBlob(blob)
				}
				const parsed = probePhotoBufferAndPixels(bytes, item.file, rgbaFrame)
				this.$set(this.probeByKey, key, parsed)
				return parsed
			} catch (error) {
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not probe perceptual signature for {name}.', {
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
					const res = await this.probeSinglePhoto(item)
					if (res) {
						probed += 1
					}
				}
				if (probed > 0) {
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Probed {count} photos in cluster.', {
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
						const res = await this.probeSinglePhoto(item)
						if (res) {
							probed += 1
						}
					}
				}
				if (probed > 0) {
					this.statusNoticeType = 'info'
					this.statusNotice = this.t('duplicatefinder', 'Probed {count} visible photos.', {
						count: probed,
					})
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
		openSideBySideCompare() {
			if (!this.activeCluster) {
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
			const dialog = this.$refs.photoDeleteDialog
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
			const dialog = this.$refs.photoDeleteDialog
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
			if (event && event.target === this.$refs.photoDeleteDialog && !this.isDeleting) {
				this.closeDeleteDialog()
			}
		},
		restoreFocusAfterDialog() {
			const prev = this.lastFocusBeforeDialog
			this.lastFocusBeforeDialog = null
			if (prev && typeof prev.focus === 'function') {
				prev.focus()
			}
		},
		async confirmBatchDelete() {
			if (this.selectedDeleteItems.length === 0 || this.isDeleting) {
				return
			}
			this.isDeleting = true
			try {
				const filesPayload = this.selectedDeleteItems.map(item => ({
					id: item.file.id,
					nodeId: item.file.nodeId || item.file.id,
					path: item.path,
					name: item.name,
					size: item.size,
					fileHash: item.groupHash || item.file.fileHash || '',
				}))
				const result = await deleteFiles(filesPayload)
				const deletedSuccess = Array.isArray(result?.success) ? result.success : filesPayload
				const deletedNodeIds = Array.isArray(result?.deletedNodeIds)
					? result.deletedNodeIds
					: deletedSuccess.map(f => f.nodeId || f.id).filter(Boolean)
				const bytesReclaimed = deletedSuccess.reduce((sum, f) => sum + (Number(f.size) || 0), 0)

				this.selectedDeleteKeys = []
				this.closeDeleteDialog()
				this.statusNoticeType = 'info'
				this.statusNotice = this.t('duplicatefinder', 'Deleted {count} photo copies ({size} reclaimed).', {
					count: deletedSuccess.length,
					size: formatBytes(bytesReclaimed),
				})
				this.$emit('photo-delete-completed', {
					deletedFiles: deletedSuccess,
					deletedNodeIds,
					bytesReclaimed,
					groupsResolved: 1,
					sampleLabel: deletedSuccess[0]?.name || '',
				})
			} catch (error) {
				this.closeDeleteDialog()
				this.statusNoticeType = 'error'
				this.statusNotice = this.t('duplicatefinder', 'Could not delete selected photo copies.')
			} finally {
				this.isDeleting = false
			}
		},
		triggerDownload(filename, content, mimeType) {
			if (typeof document === 'undefined' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return
			}
			const blob = new Blob([content], { type: mimeType })
			const href = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = href
			anchor.download = filename
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			setTimeout(() => {
				URL.revokeObjectURL(href)
			}, 1000)
		},
		exportAuditJson() {
			const json = exportPhotoPerceptualJson(this.catalog)
			this.triggerDownload('duplicatefinder-similar-photos.json', json, 'application/json;charset=utf-8')
		},
		exportAuditCsv() {
			const csv = exportPhotoPerceptualCsv(this.catalog)
			this.triggerDownload('duplicatefinder-similar-photos.csv', csv, 'text/csv;charset=utf-8')
		},
	},
}
</script>

<style lang="scss" scoped>
.photo-perceptual-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	margin-block: 12px 18px;
	margin-inline: 0;
	padding-block: 16px;
	padding-inline: 18px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
}

.photo-pw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.photo-pw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.photo-pw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
}

.photo-pw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.photo-pw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.photo-pw__tool-btn,
.photo-pw__seg-btn,
.photo-pw__mini-btn,
.photo-pw__primary-btn,
.photo-pw__danger-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 36px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
}

.photo-pw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-text, #ffffff);
}

.photo-pw__danger-btn {
	background-color: #c62828;
	border-color: #c62828;
	color: #ffffff;
}

.photo-pw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.photo-pw__tool-btn:focus-visible,
.photo-pw__seg-btn:focus-visible,
.photo-pw__mini-btn:focus-visible,
.photo-pw__primary-btn:focus-visible,
.photo-pw__danger-btn:focus-visible,
.photo-pw__select:focus-visible,
.photo-pw__number-input:focus-visible,
.photo-pw__search-input:focus-visible,
.photo-pw__cluster-item:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.photo-pw__tool-btn:disabled,
.photo-pw__seg-btn:disabled,
.photo-pw__mini-btn:disabled,
.photo-pw__danger-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.photo-pw__empty {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: 8px;
	padding-block: 20px;
	padding-inline: 18px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	border: 1px dashed var(--color-border);
}

.photo-pw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.96rem;
}

.photo-pw__empty-hint {
	margin: 0;
	max-inline-size: 68ch;
	color: var(--color-text-maxcontrast);
	font-size: 0.88rem;
	line-height: 1.45;
}

.photo-pw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
}

.photo-pw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.photo-pw__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	white-space: nowrap;
}

.photo-pw__segments {
	display: inline-flex;
	flex-wrap: wrap;
	gap: 6px;
}

.photo-pw__field {
	display: inline-flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	min-inline-size: 0;
}

.photo-pw__field--grow {
	flex: 1 1 220px;
}

.photo-pw__select,
.photo-pw__number-input,
.photo-pw__search-input {
	min-block-size: 36px;
	padding-block: 5px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	min-inline-size: 0;
}

.photo-pw__number-input {
	inline-size: 76px;
	font-variant-numeric: tabular-nums;
}

.photo-pw__search-input {
	flex: 1 1 180px;
	inline-size: 100%;
}

.photo-pw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.photo-pw__kpi-card {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.photo-pw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	font-weight: 600;
}

.photo-pw__kpi-value {
	font-size: 1.15rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.photo-pw__kpi-sub {
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.photo-pw__notice {
	margin: 0;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	font-size: 0.85rem;
	font-weight: 600;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
}

.photo-pw__notice.is-error {
	border-color: #c62828;
	color: #b71c1c;
}

.photo-pw__split {
	display: grid;
	grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
	gap: 14px;
	min-inline-size: 0;
}

.photo-pw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 680px;
	overflow-y: auto;
	padding-inline-end: 4px;
	min-inline-size: 0;
}

.photo-pw__cluster-item {
	display: flex;
	flex-direction: column;
	gap: 6px;
	text-align: start;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	cursor: pointer;
	min-inline-size: 0;
}

.photo-pw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.photo-pw__cluster-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-inline-size: 0;
}

.photo-pw__cluster-title {
	font-weight: 700;
	font-size: 0.88rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.photo-pw__cluster-size {
	font-size: 0.8rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
	flex-shrink: 0;
}

.photo-pw__cluster-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.photo-pw__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 600;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
}

.photo-pw__badge.is-survivor {
	border-color: #15803d;
	color: #15803d;
}

.photo-pw__badge.is-warn {
	border-color: #b45309;
	color: #92400e;
}

.photo-pw__badge.is-info {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element, #0082c9);
}

.photo-pw__badge.is-raw {
	border-color: #6d28d9;
	color: #5b21b6;
}

.photo-pw__badge.is-protected {
	border-color: #1d4ed8;
	color: #1e40af;
}

.photo-pw__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 12px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.photo-pw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.photo-pw__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 240px;
}

.photo-pw__inspector-title {
	margin: 0 0 4px;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.photo-pw__inspector-sub {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.photo-pw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.photo-pw__comparator {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding-block: 12px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	min-inline-size: 0;
}

.photo-pw__comparator-selectors {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
}

.photo-pw__metrics-deck {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 8px;
}

.photo-pw__metric-box {
	display: flex;
	flex-direction: column;
	gap: 3px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.photo-pw__metric-label {
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.photo-pw__metric-value {
	font-size: 0.94rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
}

.photo-pw__metric-sub {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.photo-pw__visual-scopes {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
}

.photo-pw__scope-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 8px;
	padding-inline: 10px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.photo-pw__scope-title {
	margin: 0;
	font-size: 0.8rem;
	font-weight: 700;
}

.photo-pw__crop-svg,
.photo-pw__hist-svg {
	inline-size: 100%;
	max-block-size: 110px;
	background-color: var(--color-main-background);
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
}

.photo-pw__crop-master {
	fill: none;
	stroke: var(--color-text-maxcontrast);
	stroke-width: 1.5;
	stroke-dasharray: 4 3;
}

.photo-pw__crop-candidate {
	fill: rgba(0, 130, 201, 0.16);
	stroke: var(--color-primary-element, #0082c9);
	stroke-width: 2;
}

.photo-pw__hist-left {
	fill: var(--color-primary-element, #0082c9);
	opacity: 0.85;
}

.photo-pw__hist-right {
	fill: #d97706;
	opacity: 0.78;
}

.photo-pw__scope-caption,
.photo-pw__scope-empty {
	margin: 0;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
}

.photo-pw__exif-grid {
	display: flex;
	flex-direction: column;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 4px);
	overflow: hidden;
}

.photo-pw__exif-row {
	display: grid;
	grid-template-columns: minmax(110px, 150px) minmax(0, 1fr) minmax(0, 1fr);
	gap: 8px;
	padding-block: 5px;
	padding-inline: 8px;
	font-size: 0.78rem;
	border-block-end: 1px solid var(--color-border);
}

.photo-pw__exif-row:last-child {
	border-block-end: none;
}

.photo-pw__exif-row.is-diff {
	background-color: rgba(180, 83, 9, 0.08);
}

.photo-pw__exif-label {
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.photo-pw__exif-val {
	overflow-wrap: anywhere;
	font-variant-numeric: tabular-nums;
}

.photo-pw__roster {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.photo-pw__copy-card {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
}

.photo-pw__copy-card.is-survivor {
	border-inline-start: 4px solid #15803d;
}

.photo-pw__copy-card.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.photo-pw__check-label {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-inline-size: 28px;
	min-block-size: 28px;
	cursor: pointer;
}

.photo-pw__checkbox {
	inline-size: 18px;
	block-size: 18px;
	margin: 0;
}

.photo-pw__copy-main {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.photo-pw__copy-title-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.photo-pw__copy-name {
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.photo-pw__copy-path {
	margin: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.photo-pw__copy-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.76rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.photo-pw__copy-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.photo-pw__bulk-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding-block-start: 10px;
	border-block-start: 1px solid var(--color-border);
}

.photo-pw__bulk-summary {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	font-size: 0.88rem;
}

.photo-pw__bulk-note {
	font-size: 0.8rem;
	color: #92400e;
	font-weight: 600;
}

.photo-pw__bulk-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.photo-confirm-dialog {
	max-inline-size: 460px;
	inline-size: calc(100vw - 32px);
	padding: 0;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
}

.photo-confirm-dialog::backdrop {
	background-color: rgba(0, 0, 0, 0.45);
}

.photo-confirm-dialog__content {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding-block: 16px;
	padding-inline: 16px;
}

.photo-confirm-dialog__title {
	margin: 0;
	font-size: 1rem;
	font-weight: 700;
}

.photo-confirm-dialog__body,
.photo-confirm-dialog__warning {
	margin: 0;
	font-size: 0.88rem;
	line-height: 1.45;
}

.photo-confirm-dialog__warning {
	color: var(--color-warning, #b45309);
	font-weight: 600;
}

.photo-confirm-dialog__actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 8px;
}

@media (max-width: 960px) {
	.photo-pw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.photo-pw__split {
		grid-template-columns: minmax(0, 1fr);
	}

	.photo-pw__metrics-deck,
	.photo-pw__visual-scopes {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 768px) {
	.photo-perceptual-workbench {
		padding-block: 12px;
		padding-inline: 12px;
	}

	.photo-pw__tool-btn,
	.photo-pw__seg-btn,
	.photo-pw__mini-btn,
	.photo-pw__primary-btn,
	.photo-pw__danger-btn,
	.photo-pw__select,
	.photo-pw__number-input,
	.photo-pw__search-input,
	.photo-pw__check-label {
		min-block-size: 44px;
		min-inline-size: 44px;
	}

	.photo-pw__field {
		flex: 1 1 100%;
	}

	.photo-pw__select {
		flex: 1 1 auto;
		min-inline-size: 0;
	}

	.photo-pw__copy-card {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.photo-pw__copy-actions {
		grid-column: 1 / -1;
	}

	.photo-pw__exif-row {
		grid-template-columns: minmax(0, 1fr);
		gap: 2px;
	}
}

@media (max-width: 520px) {
	.photo-pw__kpis {
		grid-template-columns: minmax(0, 1fr);
	}
}
</style>
