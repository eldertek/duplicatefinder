<template>
	<section
		class="photo-burst-timeline"
		role="region"
		:aria-label="t('duplicatefinder', 'Photo and Media Timeline Bursts')">
		<header class="photo-burst-timeline__toolbar">
			<div class="photo-burst-timeline__title-group">
				<h3 class="photo-burst-timeline__title">
					{{ t('duplicatefinder', 'Photo & Media Timeline Bursts') }}
				</h3>
				<span
					class="photo-burst-timeline__badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} bursts, {size} reclaimable', {
						clusters: timeline.summary.clusterCount,
						size: timeline.summary.reclaimableFormatted,
					}) }}
				</span>
			</div>

			<div class="photo-burst-timeline__toolbar-actions">
				<button
					type="button"
					class="photo-burst-timeline__tool-btn"
					:disabled="timeline.clusters.length === 0 || isExecuting"
					@click="exportManifestCsv">
					<span>{{ t('duplicatefinder', 'Export CSV') }}</span>
				</button>
				<button
					type="button"
					class="photo-burst-timeline__tool-btn"
					:disabled="timeline.clusters.length === 0 || isExecuting"
					@click="exportManifestJson">
					<span>{{ t('duplicatefinder', 'Export JSON') }}</span>
				</button>
				<button
					type="button"
					class="photo-burst-timeline__tool-btn is-close"
					aria-keyshortcuts="p"
					:title="t('duplicatefinder', 'Hide photo burst timeline')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide bursts') }}</span>
				</button>
			</div>
		</header>

		<div v-if="sourcePoolEmpty" class="photo-burst-timeline__empty">
			<p class="photo-burst-timeline__empty-title">
				{{ t('duplicatefinder', 'No duplicate groups loaded yet') }}
			</p>
			<p class="photo-burst-timeline__empty-hint">
				{{ t('duplicatefinder', 'Run a storage scan to cluster duplicate photos, camera bursts, and video shoots chronologically.') }}
			</p>
			<button
				type="button"
				class="photo-burst-timeline__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<template v-else>
			<div class="photo-burst-timeline__controls">
				<div class="photo-burst-timeline__control-row">
					<span class="photo-burst-timeline__control-label">
						{{ t('duplicatefinder', 'Timeline scope') }}
					</span>
					<div
						class="photo-burst-timeline__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Photo burst scope')">
						<button
							type="button"
							class="photo-burst-timeline__pill-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredCount }) }}</span>
						</button>
						<button
							type="button"
							class="photo-burst-timeline__pill-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allCount }) }}</span>
						</button>
					</div>

					<label class="photo-burst-timeline__select-field">
						<span class="photo-burst-timeline__control-label">{{ t('duplicatefinder', 'Burst window') }}</span>
						<select
							v-model.number="burstWindowMinutes"
							class="photo-burst-timeline__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Burst window')">
							<option :value="5">
								{{ t('duplicatefinder', '5 min rapid burst') }}
							</option>
							<option :value="15">
								{{ t('duplicatefinder', '15 min shoot burst') }}
							</option>
							<option :value="60">
								{{ t('duplicatefinder', '1 hour session') }}
							</option>
							<option :value="1440">
								{{ t('duplicatefinder', 'Same shoot day') }}
							</option>
						</select>
					</label>

					<label class="photo-burst-timeline__select-field">
						<span class="photo-burst-timeline__control-label">{{ t('duplicatefinder', 'Sort bursts') }}</span>
						<select
							v-model="sortBy"
							class="photo-burst-timeline__select"
							:disabled="isExecuting"
							:aria-label="t('duplicatefinder', 'Sort bursts')">
							<option value="newest_first">
								{{ t('duplicatefinder', 'Newest shoot first') }}
							</option>
							<option value="oldest_first">
								{{ t('duplicatefinder', 'Oldest shoot first') }}
							</option>
							<option value="reclaimable_desc">
								{{ t('duplicatefinder', 'Most reclaimable space') }}
							</option>
							<option value="groups_desc">
								{{ t('duplicatefinder', 'Largest burst cluster') }}
							</option>
						</select>
					</label>
				</div>

				<div class="photo-burst-timeline__strategy-row">
					<span class="photo-burst-timeline__control-label">
						{{ t('duplicatefinder', 'Burst keep rule') }}
					</span>
					<div
						class="photo-burst-timeline__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Burst keep rule')">
						<button
							v-for="strategy in strategyChoices"
							:key="strategy.id"
							type="button"
							class="photo-burst-timeline__pill-btn"
							:class="{ 'is-active': keepStrategy === strategy.id }"
							:aria-pressed="keepStrategy === strategy.id ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="setKeepStrategy(strategy.id)">
							<span>{{ strategy.label }}</span>
						</button>
					</div>
				</div>

				<div class="photo-burst-timeline__filter-bar">
					<div
						class="photo-burst-timeline__pills"
						role="group"
						:aria-label="t('duplicatefinder', 'Media type filter')">
						<button
							v-for="mode in mediaFilterChoices"
							:key="mode.id"
							type="button"
							class="photo-burst-timeline__pill-btn"
							:class="{ 'is-active': mediaFilter === mode.id }"
							:aria-pressed="mediaFilter === mode.id ? 'true' : 'false'"
							:disabled="isExecuting"
							@click="mediaFilter = mode.id">
							<span>{{ mode.label }}</span>
						</button>
					</div>

					<div class="photo-burst-timeline__search-wrap">
						<input
							v-model="searchQuery"
							type="search"
							class="photo-burst-timeline__search-input"
							:disabled="isExecuting"
							:placeholder="t('duplicatefinder', 'Filter filename, folder, or YYYY-MM-DD')"
							:aria-label="t('duplicatefinder', 'Filter photo bursts by filename, folder, or date')">
					</div>

					<label class="photo-burst-timeline__checkbox-label">
						<input
							v-model="onlyMultiGroupBursts"
							type="checkbox"
							:disabled="isExecuting"
							class="photo-burst-timeline__checkbox">
						<span>{{ t('duplicatefinder', 'Multi-group bursts only') }}</span>
					</label>

					<label class="photo-burst-timeline__checkbox-label">
						<input
							v-model="includeAcknowledged"
							type="checkbox"
							:disabled="isExecuting"
							class="photo-burst-timeline__checkbox">
						<span>{{ t('duplicatefinder', 'Include acknowledged') }}</span>
					</label>
				</div>
			</div>

			<dl class="photo-burst-timeline__kpis">
				<div class="photo-burst-timeline__kpi-card">
					<dt class="photo-burst-timeline__kpi-label">
						{{ t('duplicatefinder', 'Shoot days') }}
					</dt>
					<dd class="photo-burst-timeline__kpi-value">
						{{ timeline.summary.shootDayCount }}
					</dd>
					<dd class="photo-burst-timeline__kpi-meta">
						{{ t('duplicatefinder', '{groups} media groups', {
							groups: timeline.summary.mediaGroupsCount,
						}) }}
					</dd>
				</div>

				<div class="photo-burst-timeline__kpi-card">
					<dt class="photo-burst-timeline__kpi-label">
						{{ t('duplicatefinder', 'Burst clusters') }}
					</dt>
					<dd class="photo-burst-timeline__kpi-value">
						{{ timeline.summary.clusterCount }}
					</dd>
					<dd class="photo-burst-timeline__kpi-meta">
						{{ t('duplicatefinder', '{rapid} rapid bursts', {
							rapid: timeline.summary.rapidBurstCount,
						}) }}
					</dd>
				</div>

				<div class="photo-burst-timeline__kpi-card is-highlight">
					<dt class="photo-burst-timeline__kpi-label">
						{{ t('duplicatefinder', 'Reclaimable media') }}
					</dt>
					<dd class="photo-burst-timeline__kpi-value">
						{{ timeline.summary.reclaimableFormatted }}
					</dd>
					<dd class="photo-burst-timeline__kpi-meta">
						{{ t('duplicatefinder', '{copies} redundant copies', {
							copies: timeline.summary.redundantFiles,
						}) }}
					</dd>
				</div>

				<div class="photo-burst-timeline__kpi-card">
					<dt class="photo-burst-timeline__kpi-label">
						{{ t('duplicatefinder', 'Media mix') }}
					</dt>
					<dd class="photo-burst-timeline__kpi-value">
						{{ timeline.summary.mediaBreakdown.images }} / {{ timeline.summary.mediaBreakdown.videos }}
					</dd>
					<dd class="photo-burst-timeline__kpi-meta">
						{{ t('duplicatefinder', '{raw} RAW, {variants} variants', {
							raw: timeline.summary.mediaBreakdown.raw,
							variants: timeline.summary.mediaBreakdown.variants,
						}) }}
					</dd>
				</div>
			</dl>

			<div
				v-if="statusMessage"
				class="photo-burst-timeline__status"
				:class="{ 'is-error': statusKind === 'error' }"
				role="status"
				aria-live="polite">
				{{ statusMessage }}
			</div>

			<div
				v-if="timeline.scopeSummary.eligibleMediaGroupCount === 0"
				class="photo-burst-timeline__empty is-compact">
				<p class="photo-burst-timeline__empty-title">
					{{ t('duplicatefinder', 'No photo or video duplicate groups in this scope') }}
				</p>
				<p class="photo-burst-timeline__empty-hint">
					{{ t('duplicatefinder', 'Switch to All loaded groups, reset the media filter, or include acknowledged groups.') }}
				</p>
				<div class="photo-burst-timeline__empty-actions">
					<button
						v-if="scope === 'filtered' && allCount > filteredCount"
						type="button"
						class="photo-burst-timeline__secondary-btn"
						@click="scope = 'all'">
						<span>{{ t('duplicatefinder', 'Switch to All loaded ({count})', { count: allCount }) }}</span>
					</button>
					<button
						v-if="hasActiveFilters"
						type="button"
						class="photo-burst-timeline__secondary-btn"
						@click="resetFilters">
						<span>{{ t('duplicatefinder', 'Reset timeline filters') }}</span>
					</button>
				</div>
			</div>

			<div
				v-else-if="timeline.days.length === 0"
				class="photo-burst-timeline__empty is-compact">
				<p class="photo-burst-timeline__empty-title">
					{{ t('duplicatefinder', 'No bursts match your current filters') }}
				</p>
				<p class="photo-burst-timeline__empty-hint">
					{{ t('duplicatefinder', 'Try widening the burst window, turning off multi-group filter, or clearing the search query.') }}
				</p>
				<button
					type="button"
					class="photo-burst-timeline__secondary-btn"
					@click="resetFilters">
					<span>{{ t('duplicatefinder', 'Reset timeline filters') }}</span>
				</button>
			</div>

			<div v-else class="photo-burst-timeline__days">
				<section
					v-for="day in timeline.days"
					:key="day.dateBucket"
					class="burst-day-section"
					:aria-label="day.label">
					<header class="burst-day-section__header">
						<div class="burst-day-section__heading">
							<h4 class="burst-day-section__title">
								{{ day.dateBucket === 'undated' ? t('duplicatefinder', 'Undated media') : day.dateBucket }}
							</h4>
							<span class="burst-day-section__meta">
								{{ t('duplicatefinder', '{clusters} bursts, {groups} groups', {
									clusters: day.clusterCount,
									groups: day.groupCount,
								}) }}
							</span>
						</div>
						<span class="burst-day-section__reclaimable">
							{{ t('duplicatefinder', '{size} reclaimable', { size: day.reclaimableFormatted }) }}
						</span>
					</header>

					<div class="burst-day-section__clusters">
						<article
							v-for="cluster in day.clusters"
							:key="cluster.clusterId"
							class="burst-cluster-card"
							:class="'is-' + cluster.clusterKind">
							<header class="burst-cluster-card__header">
								<div class="burst-cluster-card__meta-group">
									<div class="burst-cluster-card__badges">
										<span
											class="burst-cluster-card__kind-badge"
											:class="'is-' + cluster.clusterKind">
											{{ formatClusterKindLabel(cluster.clusterKind) }}
										</span>
										<span class="burst-cluster-card__folder" :title="cluster.primaryFolder">
											{{ cluster.primaryFolder }}
										</span>
										<span v-if="cluster.startTimeLabel" class="burst-cluster-card__time">
											{{ cluster.startTimeLabel }}
											<template v-if="cluster.endTimeLabel && cluster.endTimeLabel !== cluster.startTimeLabel">
												- {{ cluster.endTimeLabel }}
											</template>
											({{ cluster.spanLabel }})
										</span>
									</div>
									<h5 class="burst-cluster-card__title">
										{{ cluster.title }}
									</h5>
								</div>

								<div class="burst-cluster-card__actions">
									<span class="burst-cluster-card__size-pill">
										{{ t('duplicatefinder', '{size} planned', {
											size: getClusterPlan(cluster).reclaimableFormatted,
										}) }}
									</span>
									<button
										type="button"
										class="burst-cluster-card__btn"
										:disabled="isExecuting || cluster.deletableCount === 0"
										@click="selectAllRedundantInCluster(cluster)">
										<span>{{ t('duplicatefinder', 'Select redundant') }}</span>
									</button>
									<button
										type="button"
										class="burst-cluster-card__btn"
										:disabled="isExecuting || getClusterPlan(cluster).selectedCount === 0"
										@click="clearClusterSelection(cluster)">
										<span>{{ t('duplicatefinder', 'Clear') }}</span>
									</button>
									<template v-if="getClusterPlan(cluster).selectedCount > 0">
										<button
											v-if="confirmingClusterId !== cluster.clusterId"
											type="button"
											class="burst-cluster-card__delete-btn"
											:disabled="isExecuting"
											@click="requestClusterDelete(cluster.clusterId)">
											<span>{{ t('duplicatefinder', 'Delete {count} ({size})', {
												count: getClusterPlan(cluster).selectedCount,
												size: getClusterPlan(cluster).reclaimableFormatted,
											}) }}</span>
										</button>
										<div
											v-else
											class="burst-cluster-card__confirm-group"
											role="group"
											:aria-label="t('duplicatefinder', 'Confirm burst deletion')">
											<button
												type="button"
												class="burst-cluster-card__confirm-btn"
												:disabled="isExecuting"
												@click="confirmClusterDelete(cluster)">
												<span>{{ isExecuting
													? t('duplicatefinder', 'Deleting...')
													: t('duplicatefinder', 'Confirm delete {count}', { count: getClusterPlan(cluster).selectedCount }) }}</span>
											</button>
											<button
												type="button"
												class="burst-cluster-card__btn"
												:disabled="isExecuting"
												@click="confirmingClusterId = null">
												<span>{{ t('duplicatefinder', 'Cancel') }}</span>
											</button>
										</div>
									</template>
								</div>
							</header>

							<div class="burst-cluster-card__strip">
								<div
									v-for="group in cluster.groups"
									:key="group.groupKey"
									class="burst-group-tile"
									:class="{ 'is-active-group': currentDuplicateId && group.groupId === currentDuplicateId }">
									<div class="burst-group-tile__top">
										<div class="burst-group-tile__thumb-wrap">
											<img
												v-if="getSafeThumbnailUrl(group)"
												:src="getSafeThumbnailUrl(group)"
												:alt="group.displayName"
												class="burst-group-tile__thumb"
												loading="lazy"
												@error="markThumbError(group.groupKey)">
											<div
												v-else
												class="burst-group-tile__thumb-fallback"
												aria-hidden="true">
												<svg
													v-if="group.mediaKind === 'video'"
													xmlns="http://www.w3.org/2000/svg"
													width="22"
													height="22"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round">
													<polygon points="23 7 16 12 23 17 23 7" />
													<rect
														x="1"
														y="5"
														width="15"
														height="14"
														rx="2"
														ry="2" />
												</svg>
												<svg
													v-else
													xmlns="http://www.w3.org/2000/svg"
													width="22"
													height="22"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round">
													<rect
														x="3"
														y="3"
														width="18"
														height="18"
														rx="2"
														ry="2" />
													<circle cx="8.5" cy="8.5" r="1.5" />
													<polyline points="21 15 16 10 5 21" />
												</svg>
											</div>
										</div>

										<div class="burst-group-tile__info">
											<div class="burst-group-tile__name-row">
												<strong class="burst-group-tile__name" :title="group.displayName">
													{{ group.displayName }}
												</strong>
												<span class="burst-group-tile__size">
													{{ group.unitSizeFormatted }}
												</span>
											</div>
											<div class="burst-group-tile__tags">
												<span class="burst-group-tile__tag">
													{{ t('duplicatefinder', '{count} copies', { count: group.totalFiles }) }}
												</span>
												<span
													v-for="tag in group.variantTags"
													:key="tag"
													class="burst-group-tile__tag is-variant">
													{{ formatVariantTag(tag) }}
												</span>
												<span v-if="group.timeLabel" class="burst-group-tile__tag">
													{{ group.timeLabel }}
												</span>
											</div>
										</div>

										<div class="burst-group-tile__nav-actions">
											<button
												type="button"
												class="burst-group-tile__action-btn"
												@click="$emit('select-duplicate', group.rawGroup)">
												<span>{{ t('duplicatefinder', 'Inspect') }}</span>
											</button>
											<button
												type="button"
												class="burst-group-tile__action-btn is-compare"
												@click="$emit('compare-duplicate', group.rawGroup)">
												<span>{{ t('duplicatefinder', 'Compare') }}</span>
											</button>
										</div>
									</div>

									<ul class="burst-group-tile__files">
										<li
											v-for="file in group.files"
											:key="getFileKey(file) || file.path"
											class="burst-file-item"
											:class="{
												'is-kept': isKeptFile(cluster, group, file),
												'is-protected': Boolean(file.isInOriginFolder),
												'is-marked': isMarkedForDeletion(cluster, group, file),
											}">
											<div class="burst-file-item__lead">
												<input
													v-if="!file.isInOriginFolder && !isKeptFile(cluster, group, file)"
													type="checkbox"
													class="burst-file-item__checkbox"
													:checked="isMarkedForDeletion(cluster, group, file)"
													:disabled="isExecuting"
													:aria-label="t('duplicatefinder', 'Select {path} for burst deletion', { path: displayFilePath(file) })"
													@change="toggleFileChecked(file)">
												<span
													v-else
													class="burst-file-item__dot"
													aria-hidden="true">
													●
												</span>
											</div>

											<span class="burst-file-item__path" :title="displayFilePath(file)">
												{{ displayFilePath(file) }}
											</span>

											<div class="burst-file-item__tail">
												<span
													v-if="file.isInOriginFolder"
													class="burst-file-item__status is-protected">
													{{ t('duplicatefinder', 'Protected origin') }}
												</span>
												<span
													v-else-if="isKeptFile(cluster, group, file)"
													class="burst-file-item__status is-kept">
													{{ t('duplicatefinder', 'Keep ({reason})', {
														reason: formatWinnerReason(getGroupResolution(cluster, group).winnerReason),
													}) }}
												</span>
												<template v-else>
													<span
														v-if="isMarkedForDeletion(cluster, group, file)"
														class="burst-file-item__status is-delete">
														{{ t('duplicatefinder', 'Delete') }}
													</span>
													<button
														type="button"
														class="burst-file-item__keep-btn"
														:disabled="isExecuting"
														@click="promoteKeepFile(group, file)">
														<span>{{ t('duplicatefinder', 'Keep this') }}</span>
													</button>
												</template>
											</div>
										</li>
									</ul>
								</div>
							</div>
						</article>
					</div>
				</section>
			</div>
		</template>
	</section>
</template>

<script>
// eslint-disable-next-line node/no-unpublished-import
import { generateUrl } from '@nextcloud/router'
import { deleteFiles } from '../tools/api'
import { normalizePathForDiff } from '../tools/duplicatePathDiff'
import {
	buildBurstManifestCsv,
	buildBurstManifestJson,
	buildPhotoBurstTimeline,
	resolveClusterDeletionPlan,
	resolveMediaFileKey,
} from '../tools/photoBurstClustering'

export default {
	name: 'PhotoBurstTimeline',
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
			burstWindowMinutes: 15,
			mediaFilter: 'all',
			keepStrategy: 'sharpest',
			sortBy: 'newest_first',
			includeAcknowledged: false,
			onlyMultiGroupBursts: false,
			searchQuery: '',
			manualKeepByGroup: {},
			uncheckedFileKeys: {},
			thumbErrors: {},
			confirmingClusterId: null,
			isExecuting: false,
			statusMessage: '',
			statusKind: 'info',
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
			if (this.scope === 'all' && this.allCount > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		hasActiveFilters() {
			return (
				this.mediaFilter !== 'all'
				|| this.onlyMultiGroupBursts
				|| this.includeAcknowledged
				|| this.searchQuery.trim() !== ''
			)
		},
		strategyChoices() {
			return [
				{ id: 'sharpest', label: t('duplicatefinder', 'Keep sharpest') },
				{ id: 'oldest', label: t('duplicatefinder', 'Keep oldest') },
				{ id: 'newest', label: t('duplicatefinder', 'Keep newest') },
				{ id: 'shortest_path', label: t('duplicatefinder', 'Keep shortest path') },
			]
		},
		mediaFilterChoices() {
			return [
				{ id: 'all', label: t('duplicatefinder', 'All media') },
				{ id: 'images', label: t('duplicatefinder', 'Photos') },
				{ id: 'videos', label: t('duplicatefinder', 'Videos') },
				{ id: 'variants', label: t('duplicatefinder', 'RAW / Edited') },
			]
		},
		timeline() {
			return buildPhotoBurstTimeline(this.activeSourceDuplicates, {
				burstWindowMinutes: this.burstWindowMinutes,
				mediaFilter: this.mediaFilter,
				keepStrategy: this.keepStrategy,
				sortBy: this.sortBy,
				includeAcknowledged: this.includeAcknowledged,
				onlyMultiGroupBursts: this.onlyMultiGroupBursts,
				searchQuery: this.searchQuery,
			})
		},
		clusterPlansById() {
			const map = {}
			for (const cluster of this.timeline.clusters) {
				map[cluster.clusterId] = resolveClusterDeletionPlan(
					cluster,
					this.keepStrategy,
					this.manualKeepByGroup,
					this.uncheckedFileKeys
				)
			}
			return map
		},
	},
	methods: {
		getFileKey(file) {
			return resolveMediaFileKey(file)
		},
		displayFilePath(file) {
			if (!file || typeof file.path !== 'string') {
				return ''
			}
			return normalizePathForDiff(file.path) || file.path
		},
		getClusterPlan(cluster) {
			if (!cluster) {
				return {
					selectedFiles: [],
					selectedCount: 0,
					reclaimableBytes: 0,
					reclaimableFormatted: '0 B',
					groupResolutions: {},
				}
			}
			return this.clusterPlansById[cluster.clusterId] || resolveClusterDeletionPlan(
				cluster,
				this.keepStrategy,
				this.manualKeepByGroup,
				this.uncheckedFileKeys
			)
		},
		getGroupResolution(cluster, group) {
			const plan = this.getClusterPlan(cluster)
			return (plan.groupResolutions && plan.groupResolutions[group.groupKey]) || {
				winnerFile: group.winnerFile,
				winnerKey: group.winnerKey,
				winnerReason: group.winnerReason,
				deleteCandidates: group.deleteCandidates,
				targetedFiles: group.deleteCandidates,
			}
		},
		isKeptFile(cluster, group, file) {
			const res = this.getGroupResolution(cluster, group)
			const key = this.getFileKey(file)
			if (res.winnerKey && key) {
				return res.winnerKey === key
			}
			return res.winnerFile === file
		},
		isMarkedForDeletion(cluster, group, file) {
			if (!file || file.isInOriginFolder || this.isKeptFile(cluster, group, file)) {
				return false
			}
			const key = this.getFileKey(file)
			return !(key && this.uncheckedFileKeys[key])
		},
		setKeepStrategy(strategyId) {
			this.keepStrategy = strategyId
			this.manualKeepByGroup = {}
			this.confirmingClusterId = null
		},
		promoteKeepFile(group, file) {
			const key = this.getFileKey(file)
			if (!group || !key) {
				return
			}
			this.$set(this.manualKeepByGroup, group.groupKey, key)
			if (this.uncheckedFileKeys[key]) {
				this.$delete(this.uncheckedFileKeys, key)
			}
			this.confirmingClusterId = null
		},
		toggleFileChecked(file) {
			const key = this.getFileKey(file)
			if (!key) {
				return
			}
			if (this.uncheckedFileKeys[key]) {
				this.$delete(this.uncheckedFileKeys, key)
			} else {
				this.$set(this.uncheckedFileKeys, key, true)
			}
			this.confirmingClusterId = null
		},
		selectAllRedundantInCluster(cluster) {
			if (!cluster || !Array.isArray(cluster.groups)) {
				return
			}
			for (const group of cluster.groups) {
				const res = this.getGroupResolution(cluster, group)
				for (const candidate of res.deleteCandidates || []) {
					const key = this.getFileKey(candidate)
					if (key && this.uncheckedFileKeys[key]) {
						this.$delete(this.uncheckedFileKeys, key)
					}
				}
			}
			this.confirmingClusterId = null
		},
		clearClusterSelection(cluster) {
			if (!cluster || !Array.isArray(cluster.groups)) {
				return
			}
			for (const group of cluster.groups) {
				const res = this.getGroupResolution(cluster, group)
				for (const candidate of res.deleteCandidates || []) {
					const key = this.getFileKey(candidate)
					if (key) {
						this.$set(this.uncheckedFileKeys, key, true)
					}
				}
			}
			this.confirmingClusterId = null
		},
		requestClusterDelete(clusterId) {
			this.confirmingClusterId = clusterId
		},
		async confirmClusterDelete(cluster) {
			if (this.isExecuting || !cluster) {
				return
			}
			const plan = this.getClusterPlan(cluster)
			if (!plan.selectedFiles || plan.selectedFiles.length === 0) {
				this.confirmingClusterId = null
				return
			}

			this.isExecuting = true
			this.statusMessage = ''
			this.statusKind = 'info'

			try {
				const deletedNodeIds = new Set()
				const response = await deleteFiles(plan.selectedFiles, {
					silentSuccess: true,
					deletedNodeIds,
				})
				const deletedFiles = Array.isArray(response && response.success) ? response.success : []
				const failedFiles = Array.isArray(response && response.errors) ? response.errors : []

				let deletedBytes = 0
				for (const item of deletedFiles) {
					const s = Number(item && item.size)
					if (Number.isFinite(s) && s > 0) {
						deletedBytes += Math.floor(s)
					}
				}

				if (deletedFiles.length > 0) {
					this.$emit('burst-delete-completed', {
						deletedFiles,
						deletedNodeIds: Array.from(deletedNodeIds),
						bytesReclaimed: deletedBytes,
						groupsResolved: cluster.groupCount,
						sampleLabel: cluster.title,
					})
				}

				if (failedFiles.length > 0) {
					this.statusKind = 'error'
					this.statusMessage = t('duplicatefinder', 'Deleted {deleted} files; {failed} failed.', {
						deleted: deletedFiles.length,
						failed: failedFiles.length,
					})
				} else {
					this.statusKind = 'info'
					this.statusMessage = t('duplicatefinder', 'Cleaned {count} redundant media files from burst.', {
						count: deletedFiles.length,
					})
				}
			} catch (error) {
				this.statusKind = 'error'
				this.statusMessage = t('duplicatefinder', 'Burst cleanup failed. Please try again.')
			} finally {
				this.isExecuting = false
				this.confirmingClusterId = null
			}
		},
		resetFilters() {
			this.mediaFilter = 'all'
			this.onlyMultiGroupBursts = false
			this.includeAcknowledged = false
			this.searchQuery = ''
			this.burstWindowMinutes = 15
		},
		markThumbError(groupKey) {
			if (groupKey) {
				this.$set(this.thumbErrors, groupKey, true)
			}
		},
		getSafeThumbnailUrl(group) {
			if (!group || this.thumbErrors[group.groupKey]) {
				return ''
			}
			const file = group.winnerFile || (group.files && group.files[0])
			if (!file || !file.path || !file.nodeId) {
				return ''
			}
			const match = String(file.path).match(/\/([^/]*)\/files(\/.*)/)
			const relativePath = match ? match[2] : ''
			if (!relativePath) {
				return ''
			}
			const query = new URLSearchParams({
				file: relativePath,
				fileId: String(file.nodeId),
				x: '240',
				y: '240',
				forceIcon: '0',
			})
			return `${generateUrl('/core/preview.png?')}${query.toString()}`
		},
		formatClusterKindLabel(kind) {
			const labels = {
				rapid_burst: t('duplicatefinder', 'Rapid burst'),
				shoot_session: t('duplicatefinder', 'Shoot session'),
				single_group: t('duplicatefinder', 'Media group'),
			}
			return labels[kind] || t('duplicatefinder', 'Media group')
		},
		formatVariantTag(tag) {
			const labels = {
				raw: t('duplicatefinder', 'RAW'),
				edited: t('duplicatefinder', 'Edited'),
				social: t('duplicatefinder', 'Compressed / Social'),
				burst: t('duplicatefinder', 'Burst'),
				live_pair: t('duplicatefinder', 'Live Photo'),
			}
			return labels[tag] || tag
		},
		formatWinnerReason(reason) {
			const labels = {
				protected_origin: t('duplicatefinder', 'Protected origin'),
				highest_resolution: t('duplicatefinder', 'Highest quality'),
				original_quality: t('duplicatefinder', 'Best quality'),
				oldest_capture: t('duplicatefinder', 'Oldest capture'),
				newest_edit: t('duplicatefinder', 'Newest edit'),
				shortest_path: t('duplicatefinder', 'Shortest path'),
				manual_keep: t('duplicatefinder', 'Manual pick'),
			}
			return labels[reason] || t('duplicatefinder', 'Best match')
		},
		triggerTextDownload(filename, content, mimeType) {
			if (
				typeof document === 'undefined'
				|| typeof Blob === 'undefined'
				|| typeof URL === 'undefined'
				|| typeof URL.createObjectURL !== 'function'
			) {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const url = URL.createObjectURL(blob)
			const link = document.createElement('a')
			link.href = url
			link.setAttribute('download', filename)
			link.style.display = 'none'
			document.body.appendChild(link)
			try {
				link.click()
			} finally {
				document.body.removeChild(link)
				if (typeof URL.revokeObjectURL === 'function') {
					URL.revokeObjectURL(url)
				}
			}
			return true
		},
		exportManifestCsv() {
			const csv = buildBurstManifestCsv(this.timeline, this.manualKeepByGroup, this.uncheckedFileKeys)
			const ok = this.triggerTextDownload('photo-burst-timeline.csv', csv, 'text/csv;charset=utf-8')
			this.statusKind = ok ? 'info' : 'error'
			this.statusMessage = ok
				? t('duplicatefinder', 'Photo burst CSV manifest exported.')
				: t('duplicatefinder', 'Export is unavailable in this browser context.')
		},
		exportManifestJson() {
			const json = buildBurstManifestJson(this.timeline, this.manualKeepByGroup, this.uncheckedFileKeys)
			const ok = this.triggerTextDownload('photo-burst-timeline.json', json, 'application/json')
			this.statusKind = ok ? 'info' : 'error'
			this.statusMessage = ok
				? t('duplicatefinder', 'Photo burst JSON manifest exported.')
				: t('duplicatefinder', 'Export is unavailable in this browser context.')
		},
	},
}
</script>

<style scoped>
.photo-burst-timeline {
	padding-block: 16px;
	padding-inline: 20px;
	border-block-end: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	display: flex;
	flex-direction: column;
	gap: 14px;
	min-width: 0;
}

.photo-burst-timeline__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.photo-burst-timeline__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.photo-burst-timeline__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.photo-burst-timeline__badge {
	display: inline-flex;
	align-items: center;
	padding-block: 3px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	color: var(--color-text-maxcontrast);
	font-size: 0.82rem;
	font-weight: 600;
	font-variant-numeric: tabular-nums;
}

.photo-burst-timeline__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.photo-burst-timeline__tool-btn,
.photo-burst-timeline__primary-btn,
.photo-burst-timeline__secondary-btn,
.photo-burst-timeline__pill-btn,
.burst-cluster-card__btn,
.burst-cluster-card__delete-btn,
.burst-cluster-card__confirm-btn,
.burst-group-tile__action-btn,
.burst-file-item__keep-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-height: 34px;
	padding-block: 6px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.photo-burst-timeline__primary-btn {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element, #0082c9);
	color: #ffffff;
}

.photo-burst-timeline__pill-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.burst-cluster-card__delete-btn,
.burst-cluster-card__confirm-btn {
	border-color: #d32f2f;
	background-color: #d32f2f;
	color: #ffffff;
}

.burst-cluster-card__delete-btn:hover:not(:disabled),
.burst-cluster-card__confirm-btn:hover:not(:disabled) {
	background-color: #b71c1c;
	border-color: #b71c1c;
}

.photo-burst-timeline__tool-btn:disabled,
.photo-burst-timeline__pill-btn:disabled,
.burst-cluster-card__btn:disabled,
.burst-cluster-card__delete-btn:disabled,
.burst-cluster-card__confirm-btn:disabled,
.burst-file-item__keep-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.photo-burst-timeline__tool-btn:focus-visible,
.photo-burst-timeline__primary-btn:focus-visible,
.photo-burst-timeline__secondary-btn:focus-visible,
.photo-burst-timeline__pill-btn:focus-visible,
.photo-burst-timeline__select:focus-visible,
.photo-burst-timeline__search-input:focus-visible,
.burst-cluster-card__btn:focus-visible,
.burst-cluster-card__delete-btn:focus-visible,
.burst-cluster-card__confirm-btn:focus-visible,
.burst-group-tile__action-btn:focus-visible,
.burst-file-item__keep-btn:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.photo-burst-timeline__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
}

.photo-burst-timeline__control-row,
.photo-burst-timeline__strategy-row,
.photo-burst-timeline__filter-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-width: 0;
}

.photo-burst-timeline__control-label {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.photo-burst-timeline__pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.photo-burst-timeline__select-field {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.photo-burst-timeline__select,
.photo-burst-timeline__search-input {
	min-height: 34px;
	padding-block: 5px;
	padding-inline: 10px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	max-width: 100%;
	box-sizing: border-box;
}

.photo-burst-timeline__search-wrap {
	flex: 1 1 220px;
	min-width: 0;
}

.photo-burst-timeline__search-input {
	width: 100%;
}

.photo-burst-timeline__checkbox-label {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 0.84rem;
	color: var(--color-main-text);
	cursor: pointer;
}

.photo-burst-timeline__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
	margin: 0;
}

.photo-burst-timeline__kpi-card {
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	min-width: 0;
}

.photo-burst-timeline__kpi-card.is-highlight {
	border-color: var(--color-primary-element, #0082c9);
}

.photo-burst-timeline__kpi-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	margin: 0;
}

.photo-burst-timeline__kpi-value {
	margin: 4px 0 2px;
	font-size: 1.15rem;
	font-weight: 700;
	color: var(--color-main-text);
	font-variant-numeric: tabular-nums;
}

.photo-burst-timeline__kpi-meta {
	margin: 0;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.photo-burst-timeline__status {
	padding: 8px 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
	color: var(--color-main-text);
	font-size: 0.86rem;
	font-weight: 600;
}

.photo-burst-timeline__status.is-error {
	border-color: #d32f2f;
	background-color: #fdecea;
	color: #8a1c1c;
}

.photo-burst-timeline__empty {
	padding: 20px;
	border: 1px dashed var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	text-align: center;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 8px;
}

.photo-burst-timeline__empty-title {
	margin: 0;
	font-weight: 700;
	color: var(--color-main-text);
}

.photo-burst-timeline__empty-hint {
	margin: 0;
	max-width: 60ch;
	font-size: 0.88rem;
	color: var(--color-text-maxcontrast);
}

.photo-burst-timeline__empty-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.photo-burst-timeline__days {
	display: flex;
	flex-direction: column;
	gap: 14px;
}

.burst-day-section {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
}

.burst-day-section__header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.burst-day-section__heading {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px;
}

.burst-day-section__title {
	margin: 0;
	font-size: 0.96rem;
	font-weight: 700;
	color: var(--color-main-text);
}

.burst-day-section__meta,
.burst-day-section__reclaimable {
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.burst-day-section__clusters {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.burst-cluster-card {
	border: 1px solid var(--color-border);
	border-inline-start: 4px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 10px;
	min-width: 0;
}

.burst-cluster-card.is-rapid_burst {
	border-inline-start-color: var(--color-primary-element, #0082c9);
}

.burst-cluster-card__header {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
}

.burst-cluster-card__meta-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-width: 0;
	flex: 1 1 260px;
}

.burst-cluster-card__badges {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	font-size: 0.78rem;
}

.burst-cluster-card__kind-badge {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-weight: 700;
	color: var(--color-main-text);
}

.burst-cluster-card__kind-badge.is-rapid_burst {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
}

.burst-cluster-card__folder {
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.burst-cluster-card__time {
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.burst-cluster-card__title {
	margin: 0;
	font-size: 0.94rem;
	font-weight: 700;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.burst-cluster-card__actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.burst-cluster-card__confirm-group {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.burst-cluster-card__size-pill {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	padding-inline: 6px;
	font-variant-numeric: tabular-nums;
}

.burst-cluster-card__strip {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 10px;
}

.burst-group-tile {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-background-hover);
	padding: 10px;
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-width: 0;
}

.burst-group-tile.is-active-group {
	border-color: var(--color-primary-element, #0082c9);
}

.burst-group-tile__top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}

.burst-group-tile__thumb-wrap {
	width: 52px;
	height: 52px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	overflow: hidden;
	flex-shrink: 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.burst-group-tile__thumb {
	width: 100%;
	height: 100%;
	object-fit: cover;
	display: block;
}

.burst-group-tile__thumb-fallback {
	color: var(--color-text-maxcontrast);
	display: flex;
	align-items: center;
	justify-content: center;
}

.burst-group-tile__info {
	flex: 1 1 140px;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.burst-group-tile__name-row {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	justify-content: space-between;
	gap: 6px;
}

.burst-group-tile__name {
	font-size: 0.88rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.burst-group-tile__size {
	font-size: 0.8rem;
	color: var(--color-text-maxcontrast);
	font-variant-numeric: tabular-nums;
}

.burst-group-tile__tags {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.burst-group-tile__tag {
	font-size: 0.74rem;
	padding-block: 1px;
	padding-inline: 6px;
	border-radius: 999px;
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	color: var(--color-text-maxcontrast);
}

.burst-group-tile__tag.is-variant {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-main-text);
	font-weight: 600;
}

.burst-group-tile__nav-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.burst-group-tile__files {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.burst-file-item {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	padding: 6px 8px;
	border-radius: var(--border-radius, 4px);
	border: 1px solid var(--color-border);
	background-color: var(--color-main-background);
	font-size: 0.82rem;
	min-width: 0;
}

.burst-file-item.is-kept {
	border-color: var(--color-success, #2e7d32);
}

.burst-file-item__lead {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 20px;
	flex-shrink: 0;
}

.burst-file-item__dot {
	color: var(--color-success, #2e7d32);
	font-size: 0.8rem;
}

.burst-file-item__path {
	flex: 1 1 160px;
	min-width: 0;
	overflow-wrap: anywhere;
	color: var(--color-main-text);
}

.burst-file-item__tail {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
	margin-inline-start: auto;
}

.burst-file-item__status {
	font-size: 0.75rem;
	font-weight: 700;
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 999px;
}

.burst-file-item__status.is-kept,
.burst-file-item__status.is-protected {
	background-color: #e8f5e9;
	color: #1b5e20;
}

.burst-file-item__status.is-delete {
	background-color: #fdecea;
	color: #8a1c1c;
}

.burst-file-item__keep-btn {
	min-height: 28px;
	padding-block: 3px;
	padding-inline: 8px;
	font-size: 0.76rem;
}

@media (max-width: 960px) {
	.photo-burst-timeline__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (max-width: 768px) {
	.photo-burst-timeline {
		padding-inline: 12px;
	}

	.photo-burst-timeline__kpis,
	.burst-cluster-card__strip {
		grid-template-columns: minmax(0, 1fr);
	}

	.photo-burst-timeline__tool-btn,
	.photo-burst-timeline__primary-btn,
	.photo-burst-timeline__secondary-btn,
	.photo-burst-timeline__pill-btn,
	.photo-burst-timeline__select,
	.photo-burst-timeline__search-input,
	.burst-cluster-card__btn,
	.burst-cluster-card__delete-btn,
	.burst-cluster-card__confirm-btn,
	.burst-group-tile__action-btn,
	.burst-file-item__keep-btn {
		min-block-size: 44px;
		min-height: 44px;
	}

	.burst-file-item__checkbox,
	.photo-burst-timeline__checkbox {
		width: 22px;
		height: 22px;
	}
}
</style>
