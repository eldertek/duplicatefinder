<template>
	<section
		class="conflict-storm-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Sync-Conflict Storm and Cloud Import Fork Resolver')">
		<header class="csw__toolbar">
			<div class="csw__title-group">
				<h3 class="csw__title">
					{{ t('duplicatefinder', 'Sync-Conflict Storm & Cloud Import Fork Resolver') }}
				</h3>
				<span
					class="csw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clones} exact clones ({size}) / {divergent} divergent merges blocked / {hotspots} folder hotspots', {
						clones: analysis.summary.exactCloneForksCount,
						size: analysis.summary.formattedReclaimableBytes,
						divergent: analysis.summary.divergentForksCount,
						hotspots: analysis.summary.hotspotsCount,
					}) }}
				</span>
			</div>

			<div class="csw__toolbar-actions">
				<button
					type="button"
					class="csw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="csw__tool-btn"
					:disabled="analysis.lineages.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="csw__tool-btn"
					@click="copyStormScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="csw__tool-btn is-close"
					aria-keyshortcuts="&amp;"
					:title="t('duplicatefinder', 'Hide sync-conflict storm and cloud import fork resolver')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Conflict Resolver') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="csw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="csw__empty-banner"
			role="note">
			<div class="csw__empty-text">
				<p class="csw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure conflict triage presets before scanning') }}
				</p>
				<p class="csw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to cluster Nextcloud conflicted copies, Syncthing forks, OneDrive host suffixes, and Google Drive (1)/(2) imports while protecting divergent edits.') }}
				</p>
			</div>
			<button
				type="button"
				class="csw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="csw__controls">
			<div class="csw__control-row">
				<span class="csw__control-label">{{ t('duplicatefinder', 'Triage Preset') }}</span>
				<div
					class="csw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Conflict resolution presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="csw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="csw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="csw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="csw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="csw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<div
					class="csw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Lineage clustering scope')">
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': clusterScope === 'same-folder' }"
						:aria-pressed="clusterScope === 'same-folder' ? 'true' : 'false'"
						@click="clusterScope = 'same-folder'">
						<span>{{ t('duplicatefinder', 'Same-Folder Lineages') }}</span>
					</button>
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': clusterScope === 'cross-folder' }"
						:aria-pressed="clusterScope === 'cross-folder' ? 'true' : 'false'"
						@click="clusterScope = 'cross-folder'">
						<span>{{ t('duplicatefinder', 'Cross-Folder Imports') }}</span>
					</button>
				</div>

				<button
					type="button"
					class="csw__seg-btn"
					:class="{ 'is-active': includeStaleForks }"
					:aria-pressed="includeStaleForks ? 'true' : 'false'"
					@click="includeStaleForks = !includeStaleForks">
					<span>{{ includeStaleForks ? t('duplicatefinder', 'Stale Forks: ARCHIVE') : t('duplicatefinder', 'Stale Forks: RETAIN') }}</span>
				</button>
			</div>

			<div class="csw__control-row csw__inputs-row">
				<label class="csw__field">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Min Forks') }}</span>
					<input
						v-model="minForkCountInput"
						type="number"
						min="1"
						max="100"
						step="1"
						class="csw__input csw__num-input">
				</label>

				<label class="csw__field">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Survivor Rule') }}</span>
					<select v-model="survivorRule" class="csw__input">
						<option value="canonical-clean-name">{{ t('duplicatefinder', 'Clean canonical name') }}</option>
						<option value="newest-mtime">{{ t('duplicatefinder', 'Newest modified time') }}</option>
						<option value="largest-payload">{{ t('duplicatefinder', 'Largest payload') }}</option>
						<option value="origin-first">{{ t('duplicatefinder', 'Origin / locked first') }}</option>
					</select>
				</label>

				<label class="csw__field">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Action Mode') }}</span>
					<select v-model="reclaimMode" class="csw__input">
						<option value="quarantine">{{ t('duplicatefinder', 'Quarantine archive') }}</option>
						<option value="delete-clones">{{ t('duplicatefinder', 'Delete exact clones only') }}</option>
					</select>
				</label>

				<label class="csw__field csw__field-grow">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Filter Filename or Folder') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="csw__input"
						:placeholder="t('duplicatefinder', 'e.g. Budget, conflicted copy, /Finance')">
				</label>

				<label class="csw__field csw__field-grow">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="csw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="csw__field">
					<span class="csw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="csw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable size') }}</option>
						<option value="forks_desc">{{ t('duplicatefinder', 'Most forks') }}</option>
						<option value="severity_desc">{{ t('duplicatefinder', 'Storm severity') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Filename (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="csw__kpis">
			<div class="csw__kpi">
				<span class="csw__kpi-label">{{ t('duplicatefinder', 'Conflict Lineages') }}</span>
				<strong class="csw__kpi-val">
					{{ analysis.summary.totalLineagesCount }} ({{ analysis.summary.totalForksCount }} {{ t('duplicatefinder', 'forks') }})
				</strong>
			</div>
			<div class="csw__kpi">
				<span class="csw__kpi-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
				<strong class="csw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.exactCloneForksCount }} {{ t('duplicatefinder', 'clones') }})
				</strong>
			</div>
			<div class="csw__kpi">
				<span class="csw__kpi-label">{{ t('duplicatefinder', 'Divergent Blocked') }}</span>
				<strong class="csw__kpi-val is-warn">
					{{ analysis.summary.divergentForksCount }} ({{ analysis.summary.formattedDivergentBytes }})
				</strong>
			</div>
			<div class="csw__kpi">
				<span class="csw__kpi-label">{{ t('duplicatefinder', 'Orphan / Hotspots') }}</span>
				<strong class="csw__kpi-val">
					{{ analysis.summary.orphanStormsCount }} / {{ analysis.summary.hotspotsCount }}
				</strong>
			</div>
		</div>

		<div
			v-if="analysis.summary.totalLineagesCount > 0"
			class="csw__filters-strip">
			<div
				class="csw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by conflict vendor')">
				<button
					type="button"
					class="csw__chip"
					:class="{ 'is-active': vendorFilter === 'all' }"
					:aria-pressed="vendorFilter === 'all' ? 'true' : 'false'"
					@click="vendorFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Vendors ({count})', { count: analysis.summary.totalForksCount }) }}</span>
				</button>
				<button
					v-for="vendor in vendorOptions"
					:key="vendor.id"
					type="button"
					class="csw__chip"
					:class="{ 'is-active': vendorFilter === vendor.id }"
					:aria-pressed="vendorFilter === vendor.id ? 'true' : 'false'"
					@click="vendorFilter = vendor.id">
					<span>{{ vendor.shortLabel }} ({{ analysis.summary.vendorCounts[vendor.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="csw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by fork classification')">
				<button
					v-for="item in classificationOptions"
					:key="item.id"
					type="button"
					class="csw__chip"
					:class="{ 'is-active': classificationFilter === item.id }"
					:aria-pressed="classificationFilter === item.id ? 'true' : 'false'"
					@click="classificationFilter = item.id">
					<span>{{ item.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="analysis.hotspots.length > 0"
			class="csw__hotspots-box">
			<div class="csw__panel-heading">
				{{ t('duplicatefinder', 'Storm Hotspot Folders (Click to filter)') }}
			</div>
			<div class="csw__chip-group">
				<button
					v-for="hotspot in visibleHotspots"
					:key="hotspot.dirPath"
					type="button"
					class="csw__hotspot-btn"
					:class="['is-' + hotspot.severity, { 'is-active': searchQueryInput === hotspot.dirPath }]"
					@click="toggleHotspotFilter(hotspot.dirPath)">
					<span class="csw__hotspot-path">{{ hotspot.dirPath }}</span>
					<span class="csw__hotspot-meta">
						{{ hotspot.forkCount }} {{ t('duplicatefinder', 'forks') }} / {{ hotspot.formattedReclaimableBytes }}
					</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.summary.totalLineagesCount === 0"
			class="csw__empty-banner"
			role="note">
			<div class="csw__empty-text">
				<p class="csw__empty-title">
					{{ t('duplicatefinder', 'No sync-conflict or cloud import forks detected in the loaded dataset') }}
				</p>
				<p class="csw__empty-hint">
					{{ t('duplicatefinder', 'All loaded duplicate groups have clean filenames without Nextcloud, Syncthing, Dropbox, OneDrive, or numbered import conflict suffixes.') }}
				</p>
			</div>
		</div>

		<div
			v-else-if="analysis.summary.totalLineagesCount > 0 && analysis.lineages.length === 0"
			class="csw__empty-banner"
			role="note">
			<div class="csw__empty-text">
				<p class="csw__empty-title">
					{{ t('duplicatefinder', 'No conflict lineages match your active filters') }}
				</p>
			</div>
			<button
				type="button"
				class="csw__primary-btn"
				@click="resetViewFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-else-if="analysis.lineages.length > 0"
			class="csw__workstation">
			<div class="csw__list-pane">
				<div class="csw__pane-header">
					<span class="csw__pane-title">
						{{ t('duplicatefinder', 'Conflict Lineages ({shown} of {total})', {
							shown: visibleLineages.length,
							total: analysis.lineages.length,
						}) }}
					</span>
				</div>

				<div class="csw__lineage-list">
					<button
						v-for="lineage in visibleLineages"
						:key="lineage.lineageId"
						type="button"
						class="csw__lineage-item"
						:class="{ 'is-selected': selectedLineage && selectedLineage.lineageId === lineage.lineageId }"
						@click="selectedLineageId = lineage.lineageId">
						<div class="csw__lineage-top">
							<span class="csw__lineage-name">{{ lineage.canonicalFilename }}</span>
							<span
								class="csw__pill"
								:class="'is-sev-' + lineage.severity">
								{{ severityLabel(lineage.severity) }}
							</span>
						</div>
						<div class="csw__lineage-path">
							{{ lineage.canonicalDir }}
						</div>
						<div class="csw__lineage-meta">
							<span>{{ lineage.forkCount }} {{ t('duplicatefinder', 'forks') }}</span>
							<span>{{ lineage.exactCloneCount }} {{ t('duplicatefinder', 'clones') }} ({{ lineage.formattedReclaimableBytes }})</span>
							<span v-if="lineage.divergentCount > 0" class="csw__warn-text">
								{{ lineage.divergentCount }} {{ t('duplicatefinder', 'divergent') }}
							</span>
							<span v-if="lineage.isOrphanStorm" class="csw__orphan-text">
								{{ t('duplicatefinder', 'orphan base') }}
							</span>
							<span>{{ lineage.vendorLabels.join(', ') }}</span>
						</div>
					</button>
				</div>

				<div
					v-if="hasMoreLineages"
					class="csw__load-more-wrap">
					<button
						type="button"
						class="csw__tool-btn"
						@click="visibleLimit += 40">
						<span>{{ t('duplicatefinder', 'Show more lineages') }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedLineage"
				class="csw__inspector-pane">
				<div class="csw__inspector-header">
					<div class="csw__inspector-title-wrap">
						<h4 class="csw__inspector-title">
							{{ selectedLineage.canonicalFilename }}
						</h4>
						<span class="csw__inspector-sub">
							{{ selectedLineage.canonicalDir }}
						</span>
					</div>
					<div class="csw__inspector-actions">
						<button
							type="button"
							class="csw__tool-btn"
							@click="emitSelectGroup(selectedLineage)">
							<span>{{ t('duplicatefinder', 'Inspect group') }}</span>
						</button>
						<button
							type="button"
							class="csw__tool-btn"
							@click="emitCompareGroup(selectedLineage)">
							<span>{{ t('duplicatefinder', 'Compare copies') }}</span>
						</button>
					</div>
				</div>

				<div
					v-if="selectedLineage.divergentCount > 0"
					class="csw__guard-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'DIVERGENT MERGE GUARD:') }}</strong>
					{{ t('duplicatefinder', '{count} fork(s) differ in hash or modification time from the canonical survivor and are strictly blocked from automated deletion.', { count: selectedLineage.divergentCount }) }}
				</div>

				<div
					v-if="selectedLineage.isOrphanStorm"
					class="csw__orphan-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'ORPHAN CONFLICT STORM:') }}</strong>
					{{ t('duplicatefinder', 'No clean canonical filename exists in this lineage. A provisional survivor was elected; rename it back to "{name}" after verification.', { name: selectedLineage.canonicalFilename }) }}
				</div>

				<div class="csw__meta-grid">
					<div class="csw__meta-item">
						<span class="csw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="csw__mono-text">{{ selectedLineage.survivor.normalizedPath }}</span>
					</div>
					<div class="csw__meta-item">
						<span class="csw__meta-label">{{ t('duplicatefinder', 'Reclaimable / Divergent') }}</span>
						<span>
							{{ selectedLineage.formattedReclaimableBytes }} {{ t('duplicatefinder', 'reclaimable') }} / {{ selectedLineage.formattedDivergentBytes }} {{ t('duplicatefinder', 'divergent') }}
						</span>
					</div>
				</div>

				<div class="csw__override-bar">
					<span class="csw__control-label">{{ t('duplicatefinder', 'Lineage Override') }}</span>
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': !selectedLineage.lineageOverride }"
						:aria-pressed="!selectedLineage.lineageOverride ? 'true' : 'false'"
						@click="setLineageOverride(selectedLineage.lineageId, '')">
						<span>{{ t('duplicatefinder', 'Policy Default') }}</span>
					</button>
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': selectedLineage.lineageOverride === 'quarantine' }"
						:aria-pressed="selectedLineage.lineageOverride === 'quarantine' ? 'true' : 'false'"
						@click="setLineageOverride(selectedLineage.lineageId, 'quarantine')">
						<span>{{ t('duplicatefinder', 'Quarantine Clones') }}</span>
					</button>
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': selectedLineage.lineageOverride === 'delete-clones' }"
						:aria-pressed="selectedLineage.lineageOverride === 'delete-clones' ? 'true' : 'false'"
						@click="setLineageOverride(selectedLineage.lineageId, 'delete-clones')">
						<span>{{ t('duplicatefinder', 'Delete Clones') }}</span>
					</button>
					<button
						type="button"
						class="csw__seg-btn"
						:class="{ 'is-active': selectedLineage.lineageOverride === 'keep-all' }"
						:aria-pressed="selectedLineage.lineageOverride === 'keep-all' ? 'true' : 'false'"
						@click="setLineageOverride(selectedLineage.lineageId, 'keep-all')">
						<span>{{ t('duplicatefinder', 'Keep All') }}</span>
					</button>
				</div>

				<div class="csw__member-list">
					<div
						v-for="member in selectedLineage.members"
						:key="member.fileKey + '::' + member.normalizedPath"
						class="csw__member-card"
						:class="'is-cls-' + member.classification">
						<div class="csw__member-top">
							<span class="csw__member-name">{{ member.filename }}</span>
							<div class="csw__member-badges">
								<span class="csw__pill is-vendor">{{ member.forkMeta.vendorShortLabel }}</span>
								<span
									class="csw__pill"
									:class="classificationPillClass(member.classification)">
									{{ classificationLabel(member.classification) }}
								</span>
							</div>
						</div>
						<div class="csw__member-path">
							{{ member.normalizedPath }}
						</div>
						<div class="csw__member-meta">
							<span>{{ member.formattedSize }}</span>
							<span>{{ t('duplicatefinder', 'Modified:') }} {{ member.formattedMtime }}</span>
							<span v-if="member.groupHash">{{ t('duplicatefinder', 'Hash:') }} {{ member.groupHash.slice(0, 12) }}</span>
							<span v-if="member.forkMeta.conflictDeviceOrActor">{{ t('duplicatefinder', 'Host/Actor:') }} {{ member.forkMeta.conflictDeviceOrActor }}</span>
						</div>
						<p class="csw__member-note">
							{{ member.safetyNote }}
						</p>
						<div
							v-if="member.classification !== 'canonical-survivor'"
							class="csw__member-actions">
							<button
								type="button"
								class="csw__seg-btn"
								@click="setSurvivorOverride(selectedLineage.lineageId, member.fileKey)">
								<span>{{ t('duplicatefinder', 'Promote as Canonical Survivor') }}</span>
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<details class="csw__script-box">
			<summary class="csw__script-summary">
				{{ t('duplicatefinder', 'Preview POSIX DRY_RUN=1 Quarantine & Clone Cleanup Script (+ occ files:scan)') }}
			</summary>
			<div class="csw__script-content">
				<div class="csw__script-actions">
					<button
						type="button"
						class="csw__tool-btn"
						@click="copyStormScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
				</div>
				<pre class="csw__code-pre"><code>{{ generatedStormScript }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	CONFLICT_STORM_PRESETS,
	CONFLICT_VENDORS,
	analyzeConflictStorms,
	buildConflictStormCsvReport,
	buildConflictStormJsonReport,
	buildConflictStormScript,
	getConflictStormPreset,
} from '../tools/conflictStormResolver'

export default {
	name: 'ConflictStormWorkbench',
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
		const initialPreset = getConflictStormPreset('safe-exact-clones')
		return {
			presets: CONFLICT_STORM_PRESETS,
			presetId: initialPreset.id,
			scope: 'all',
			reclaimMode: initialPreset.reclaimMode,
			survivorRule: initialPreset.survivorRule,
			includeStaleForks: initialPreset.includeStaleForks,
			clusterScope: initialPreset.clusterScope,
			minForkCountInput: String(initialPreset.minForkCount),
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			vendorFilter: 'all',
			classificationFilter: 'all',
			sortMode: 'reclaim_desc',
			survivorOverrides: {},
			lineageOverrides: {},
			selectedLineageId: '',
			visibleLimit: 40,
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) ? this.allDuplicates.length : 0
		},
		activeSourceDuplicates() {
			if (this.scope === 'filtered' && this.filteredSourceCount > 0) {
				return this.duplicates
			}
			if (this.allSourceCount > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedMinForkCount() {
			const trimmed = String(this.minForkCountInput === undefined || this.minForkCountInput === null ? '' : this.minForkCountInput).trim()
			if (!trimmed) {
				return getConflictStormPreset(this.presetId).minForkCount
			}
			const parsed = Number(trimmed)
			if (!Number.isFinite(parsed)) {
				return getConflictStormPreset(this.presetId).minForkCount
			}
			return Math.min(100, Math.max(1, Math.floor(parsed)))
		},
		analysis() {
			return analyzeConflictStorms(this.activeSourceDuplicates, {
				presetId: this.presetId,
				reclaimMode: this.reclaimMode,
				survivorRule: this.survivorRule,
				includeStaleForks: this.includeStaleForks,
				clusterScope: this.clusterScope,
				minForkCount: this.parsedMinForkCount,
				vendorFilter: this.vendorFilter,
				classificationFilter: this.classificationFilter,
				searchQuery: this.searchQueryInput,
				sortMode: this.sortMode,
				survivorOverrides: this.survivorOverrides,
				lineageOverrides: this.lineageOverrides,
			})
		},
		vendorOptions() {
			return Object.values(CONFLICT_VENDORS).sort((a, b) => a.order - b.order)
		},
		classificationOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Classifications') },
				{ id: 'exact-clone', label: this.t('duplicatefinder', 'Exact Byte-Clones') },
				{ id: 'divergent-active', label: this.t('duplicatefinder', 'Divergent Merges') },
				{ id: 'stale-fork', label: this.t('duplicatefinder', 'Stale Forks') },
				{ id: 'orphan-storm', label: this.t('duplicatefinder', 'Orphan Storms') },
			]
		},
		visibleHotspots() {
			return this.analysis.hotspots.slice(0, 8)
		},
		visibleLineages() {
			return this.analysis.lineages.slice(0, this.visibleLimit)
		},
		hasMoreLineages() {
			return this.analysis.lineages.length > this.visibleLineages.length
		},
		selectedLineage() {
			const list = this.analysis.lineages
			if (!Array.isArray(list) || list.length === 0) {
				return null
			}
			if (this.selectedLineageId) {
				const found = list.find(item => item.lineageId === this.selectedLineageId)
				if (found) {
					return found
				}
			}
			return list[0]
		},
		generatedStormScript() {
			return buildConflictStormScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
	},
	watch: {
		'analysis.lineages'(lineages) {
			if (!Array.isArray(lineages) || lineages.length === 0) {
				return
			}
			if (!this.selectedLineageId || !lineages.some(item => item.lineageId === this.selectedLineageId)) {
				this.selectedLineageId = lineages[0].lineageId
			}
		},
	},
	methods: {
		formatSize(bytes) {
			return formatBytes(bytes)
		},
		applyPreset(id) {
			const preset = getConflictStormPreset(id)
			this.presetId = preset.id
			this.reclaimMode = preset.reclaimMode
			this.survivorRule = preset.survivorRule
			this.includeStaleForks = preset.includeStaleForks
			this.clusterScope = preset.clusterScope
			this.minForkCountInput = String(preset.minForkCount)
			this.setNotice(this.t('duplicatefinder', 'Applied preset: {name}', { name: preset.name }), 'success')
		},
		setSurvivorOverride(lineageId, fileKey) {
			this.survivorOverrides = {
				...this.survivorOverrides,
				[lineageId]: fileKey,
			}
			this.setNotice(this.t('duplicatefinder', 'Updated canonical survivor override for lineage.'), 'success')
		},
		setLineageOverride(lineageId, mode) {
			const next = { ...this.lineageOverrides }
			if (!mode) {
				delete next[lineageId]
			} else {
				next[lineageId] = mode
			}
			this.lineageOverrides = next
		},
		toggleHotspotFilter(dirPath) {
			this.searchQueryInput = this.searchQueryInput === dirPath ? '' : dirPath
		},
		resetViewFilters() {
			this.searchQueryInput = ''
			this.vendorFilter = 'all'
			this.classificationFilter = 'all'
		},
		severityLabel(severity) {
			if (severity === 'critical') {
				return this.t('duplicatefinder', 'CRITICAL')
			}
			if (severity === 'high') {
				return this.t('duplicatefinder', 'HIGH')
			}
			if (severity === 'low') {
				return this.t('duplicatefinder', 'SAFE CLONE')
			}
			return this.t('duplicatefinder', 'MODERATE')
		},
		classificationLabel(classification) {
			if (classification === 'canonical-survivor') {
				return this.t('duplicatefinder', 'CANONICAL SURVIVOR')
			}
			if (classification === 'exact-clone') {
				return this.t('duplicatefinder', 'EXACT BYTE-CLONE')
			}
			if (classification === 'divergent-active') {
				return this.t('duplicatefinder', 'DIVERGENT MERGE')
			}
			if (classification === 'stale-fork') {
				return this.t('duplicatefinder', 'STALE FORK')
			}
			return this.t('duplicatefinder', 'PROTECTED')
		},
		classificationPillClass(classification) {
			if (classification === 'canonical-survivor') {
				return 'is-keep'
			}
			if (classification === 'exact-clone') {
				return 'is-clone'
			}
			if (classification === 'divergent-active') {
				return 'is-divergent'
			}
			if (classification === 'stale-fork') {
				return 'is-stale'
			}
			return 'is-shield'
		},
		resolveLineageDuplicate(lineage) {
			if (!lineage) {
				return null
			}
			const pool = Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates
				: this.duplicates
			if (!Array.isArray(pool)) {
				return null
			}
			if (lineage.primaryGroupId !== null && lineage.primaryGroupId !== undefined) {
				const found = pool.find(item => item && item.id === lineage.primaryGroupId)
				if (found) {
					return found
				}
			}
			const targetPath = lineage.survivor ? lineage.survivor.normalizedPath : ''
			return pool.find(item => item && Array.isArray(item.files) && item.files.some(f => f && f.path && f.path.includes(targetPath))) || null
		},
		emitSelectGroup(lineage) {
			const group = this.resolveLineageDuplicate(lineage)
			if (group) {
				this.$emit('select-duplicate', group)
			}
		},
		emitCompareGroup(lineage) {
			const group = this.resolveLineageDuplicate(lineage)
			if (group) {
				this.$emit('compare-duplicate', group)
			}
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		async copyStormScript() {
			const ok = await copyTextSafely(this.generatedStormScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 conflict quarantine & clone cleanup script to clipboard.'), 'success')
			} else {
				this.setNotice(this.t('duplicatefinder', 'Clipboard unavailable; expand the script preview below to copy manually.'), 'error')
			}
		},
		triggerDownload(content, filename, mimeType) {
			if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
				return false
			}
			const blob = new Blob([content], { type: mimeType })
			const objectUrl = URL.createObjectURL(blob)
			const anchor = document.createElement('a')
			anchor.href = objectUrl
			anchor.download = filename
			document.body.appendChild(anchor)
			anchor.click()
			anchor.remove()
			URL.revokeObjectURL(objectUrl)
			return true
		},
		exportAuditCsv() {
			const csv = buildConflictStormCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-conflict-storms.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe CSV audit of conflict storm lineages.'), 'success')
			}
		},
		exportAuditJson() {
			const json = buildConflictStormJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-conflict-storms.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported JSON audit of conflict storm lineages.'), 'success')
			}
		},
	},
}
</script>

<style scoped>
.conflict-storm-workbench {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 16px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius-large, 10px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
	max-inline-size: 100%;
}

.csw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 12px;
	border-block-end: 1px solid var(--color-border);
}

.csw__title-group {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.csw__title {
	margin: 0;
	font-size: 1.08rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.csw__status-badge {
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.csw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.csw__tool-btn,
.csw__primary-btn,
.csw__seg-btn,
.csw__chip,
.csw__hotspot-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: var(--border-radius-large, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.csw__tool-btn:hover:not(:disabled),
.csw__seg-btn:hover:not(:disabled),
.csw__chip:hover:not(:disabled),
.csw__hotspot-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element, #0082c9);
}

.csw__tool-btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.csw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: #ffffff;
}

.csw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, var(--color-main-text));
}

.csw__seg-btn.is-active,
.csw__chip.is-active,
.csw__hotspot-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.csw__tool-btn:focus-visible,
.csw__primary-btn:focus-visible,
.csw__seg-btn:focus-visible,
.csw__chip:focus-visible,
.csw__hotspot-btn:focus-visible,
.csw__lineage-item:focus-visible,
.csw__input:focus-visible,
.csw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.csw__notice {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.85rem;
	font-weight: 600;
}

.csw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border: 1px solid #9dd6b4;
}

.csw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border: 1px solid #f1aeb5;
}

.csw__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.csw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	max-inline-size: 68ch;
}

.csw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.csw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.csw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.csw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.csw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.csw__segments,
.csw__chip-group,
.csw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.csw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.csw__inputs-row {
	align-items: flex-end;
}

.csw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.csw__field-grow {
	flex: 1 1 200px;
}

.csw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.csw__input {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.csw__num-input {
	inline-size: 100px;
}

.csw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.csw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.csw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.csw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.csw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.csw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.csw__kpi-val.is-accent {
	color: var(--color-primary-element-text, #006aa3);
}

.csw__kpi-val.is-warn {
	color: #7c4a03;
}

.csw__hotspots-box {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.csw__panel-heading {
	font-size: 0.84rem;
	font-weight: 700;
}

.csw__hotspot-btn {
	flex-direction: column;
	align-items: flex-start;
	text-align: start;
	gap: 2px;
	padding-block: 6px;
}

.csw__hotspot-path {
	font-family: monospace;
	font-size: 0.78rem;
	overflow-wrap: anywhere;
}

.csw__hotspot-meta {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.csw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.csw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.csw__list-pane,
.csw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.csw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.csw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.csw__lineage-list,
.csw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.csw__lineage-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.csw__lineage-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.csw__lineage-top,
.csw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.csw__lineage-name,
.csw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.csw__lineage-path,
.csw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.csw__lineage-meta,
.csw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.csw__warn-text {
	color: #842029;
	font-weight: 700;
}

.csw__orphan-text {
	color: #0b4a8b;
	font-weight: 700;
}

.csw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.csw__pill.is-sev-critical,
.csw__pill.is-divergent {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.csw__pill.is-sev-high,
.csw__pill.is-stale {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.csw__pill.is-sev-moderate,
.csw__pill.is-vendor {
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	border-color: var(--color-border-dark, var(--color-border));
}

.csw__pill.is-sev-low,
.csw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.csw__pill.is-clone,
.csw__pill.is-shield {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.csw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.csw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.csw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.csw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.csw__inspector-actions,
.csw__override-bar,
.csw__member-badges,
.csw__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.csw__guard-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f1aeb5;
	background-color: #fdecea;
	color: #842029;
	font-size: 0.83rem;
	line-height: 1.45;
}

.csw__orphan-banner {
	padding: 10px 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.csw__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.csw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.csw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.csw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.csw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.csw__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.csw__member-card.is-cls-canonical-survivor {
	border-inline-start: 4px solid #0f5132;
}

.csw__member-card.is-cls-exact-clone {
	border-inline-start: 4px solid #0b4a8b;
}

.csw__member-card.is-cls-divergent-active {
	border-inline-start: 4px solid #842029;
}

.csw__member-card.is-cls-stale-fork {
	border-inline-start: 4px solid #7c4a03;
}

.csw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.csw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding: 8px 12px;
	background-color: var(--color-main-background);
}

.csw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.csw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.csw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.csw__code-pre {
	margin: 0;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.78rem;
	line-height: 1.45;
	overflow-x: auto;
	max-block-size: 280px;
}

.csw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
