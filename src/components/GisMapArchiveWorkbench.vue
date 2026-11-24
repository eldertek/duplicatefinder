<template>
	<section
		class="gis-map-archive-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'GIS, GeoSpatial Tile and CAD/BIM Map Archive Vault Auditor')">
		<header class="gma__toolbar">
			<div class="gma__title-group">
				<h3 class="gma__title">
					{{ t('duplicatefinder', 'GIS, GeoSpatial Tile & CAD/BIM Map Archive Vault Auditor') }}
				</h3>
				<span
					class="gma__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {masters} canonical masters & {shp} SHP guards', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						masters: analysis.summary.totalCanonicalMasterClusters,
						shp: analysis.summary.totalShpSidecarClusters,
					}) }}
				</span>
			</div>

			<div class="gma__toolbar-actions">
				<button
					type="button"
					class="gma__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="gma__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="gma__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="gma__tool-btn is-close"
					aria-keyshortcuts="Shift+Z"
					:title="t('duplicatefinder', 'Hide GIS, GeoSpatial Tile and CAD/BIM Map Archive Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide GIS Map Archive') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="gma__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="gma__kpis">
			<div class="gma__kpi">
				<span class="gma__kpi-label">{{ t('duplicatefinder', 'Safe GIS Archive Reclaim') }}</span>
				<strong class="gma__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="gma__kpi">
				<span class="gma__kpi-label">{{ t('duplicatefinder', 'Canonical Masters & SHP Sidecar Guards') }}</span>
				<strong class="gma__kpi-val is-warn">
					{{ analysis.summary.totalCanonicalMasterClusters }} {{ t('duplicatefinder', 'masters') }} / {{ analysis.summary.totalShpSidecarClusters }} {{ t('duplicatefinder', 'SHP bundles') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="gma__kpi">
				<span class="gma__kpi-label">{{ t('duplicatefinder', 'Projects / Tile Caches / CAD-BIM') }}</span>
				<strong class="gma__kpi-val">
					{{ analysis.summary.distinctProjectsCount }} {{ t('duplicatefinder', 'projects') }} / {{ analysis.summary.totalTileCacheClusters }} {{ t('duplicatefinder', 'caches') }} / {{ analysis.summary.totalCadBimClusters }} {{ t('duplicatefinder', 'CAD/BIM') }}
				</strong>
			</div>
			<div class="gma__kpi">
				<span class="gma__kpi-label">{{ t('duplicatefinder', 'Raw GeoSpatial Footprint') }}</span>
				<strong class="gma__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="gma__empty-banner"
			role="note">
			<div class="gma__empty-text">
				<p class="gma__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure canonical GeoPackage/IFC/GeoTIFF and SHP sidecar guards before scanning') }}
				</p>
				<p class="gma__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate vector/GIS datasets (.geojson/.gpkg/.shp+.dbf+.shx+.prj/.kml/.kmz), raster/DEM imagery (.tif/.geotiff/.mbtiles/.jp2/.ecw), CAD/BIM site models (.dwg/.dxf/.ifc/.rvt/.las/.laz), and tile/pyramid caches (.ovr/.aux.xml/tiles/*.qgz~).') }}
				</p>
			</div>
			<button
				type="button"
				class="gma__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="gma__controls">
			<div class="gma__control-row">
				<span class="gma__control-label">{{ t('duplicatefinder', 'GIS Preset') }}</span>
				<div
					class="gma__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'GIS and CAD/BIM map archive audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="gma__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="gma__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="gma__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="gma__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="gma__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="gma__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="gma__seg-btn"
					:class="{ 'is-active': protectCanonicalMasters }"
					:aria-pressed="protectCanonicalMasters ? 'true' : 'false'"
					@click="protectCanonicalMasters = !protectCanonicalMasters">
					<span>{{ protectCanonicalMasters ? t('duplicatefinder', 'Shield Canonical GPKG/IFC/GeoTIFF: ON') : t('duplicatefinder', 'Shield Canonical GPKG/IFC/GeoTIFF: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gma__seg-btn"
					:class="{ 'is-active': preventOrphaningShpSidecars }"
					:aria-pressed="preventOrphaningShpSidecars ? 'true' : 'false'"
					@click="preventOrphaningShpSidecars = !preventOrphaningShpSidecars">
					<span>{{ preventOrphaningShpSidecars ? t('duplicatefinder', 'Prevent .shp Sidecar Orphaning: ON') : t('duplicatefinder', 'Prevent .shp Sidecar Orphaning: OFF') }}</span>
				</button>
			</div>

			<div class="gma__control-row gma__inputs-row">
				<label class="gma__field">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="gma__input">
						<option value="prune-caches-and-redundant-exports">{{ t('duplicatefinder', 'Prune Tile Caches & Redundant Exports') }}</option>
						<option value="consolidate-gis-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate GIS Vault') }}</option>
						<option value="prune-tile-pyramids-and-caches-only">{{ t('duplicatefinder', 'Prune Tile Pyramids & Caches Only') }}</option>
					</select>
				</label>

				<label class="gma__field">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="gma__input">
						<option value="canonical-gpkg-ifc-geotiff-first">{{ t('duplicatefinder', 'Canonical GPKG / IFC / GeoTIFF first') }}</option>
						<option value="latest-revision-first">{{ t('duplicatefinder', 'Latest Survey / Model Revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="gma__field">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="gma__input gma__num-input">
				</label>

				<label class="gma__field">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="gma__input gma__num-input">
				</label>

				<label class="gma__field gma__field-grow">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Filter Project, CRS, Tile-Set or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="gma__input"
						:placeholder="t('duplicatefinder', 'e.g. EPSG:2154, .gpkg, .shp, .tif, .ifc, .ovr, tiles')">
				</label>

				<label class="gma__field gma__field-grow">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="gma__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="gma__field">
					<span class="gma__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="gma__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'SHP & master guard risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="gma__control-row">
				<span class="gma__control-label">{{ t('duplicatefinder', 'GIS Family') }}</span>
				<div
					class="gma__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'GIS map archive family filter')">
					<button
						type="button"
						class="gma__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="gma__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="gma__control-row">
				<span class="gma__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="gma__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'GIS map archive verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="gma__seg-btn"
						:class="{ 'is-active': verdictFilter === opt.id }"
						:aria-pressed="verdictFilter === opt.id ? 'true' : 'false'"
						@click="verdictFilter = opt.id">
						<span>{{ opt.label }}</span>
					</button>
				</div>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="gma__empty-filter"
			role="note">
			<p class="gma__empty-title">
				{{ t('duplicatefinder', 'No vector GIS, raster DEM, CAD/BIM model or tile/pyramid cache duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="gma__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="gma__workspace">
			<div
				class="gma__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited GIS, geospatial tile and CAD/BIM clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="gma__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="gma__cluster-top">
						<strong class="gma__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="gma__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="gma__cluster-meta">
						<span class="gma__tag">{{ cluster.projectName }}</span>
						<span class="gma__tag">{{ cluster.crsCode }}</span>
						<span class="gma__tag">{{ cluster.gisTool }}</span>
						<span class="gma__tag">{{ cluster.formatBadge }}</span>
					</div>
					<div class="gma__cluster-badges">
						<span
							v-if="cluster.hasShpSidecarBundle"
							class="gma__badge is-danger">
							{{ t('duplicatefinder', 'SHP Sidecar Guard') }}
						</span>
						<span
							v-if="cluster.hasCanonicalMaster"
							class="gma__badge is-keep">
							{{ t('duplicatefinder', 'Canonical Master') }}
						</span>
						<span
							v-if="cluster.family === 'gis-tile-pyramid-caches'"
							class="gma__badge is-warn">
							{{ t('duplicatefinder', 'Tile / Pyramid Cache') }}
						</span>
						<span
							v-if="cluster.family === 'cad-bim-site-models'"
							class="gma__badge is-consolidate">
							{{ t('duplicatefinder', 'CAD / BIM Model') }}
						</span>
					</div>
					<div class="gma__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="gma__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="gma__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="gma__inspector">
				<header class="gma__inspector-head">
					<div class="gma__inspector-title-wrap">
						<h4 class="gma__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="gma__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.gisTool }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="gma__inspector-actions">
						<button
							type="button"
							class="gma__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="gma__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="gma__lineage-grid">
					<div class="gma__lineage-item">
						<span class="gma__lineage-label">{{ t('duplicatefinder', 'Project & CRS Signature') }}</span>
						<strong class="gma__lineage-val">{{ selectedCluster.projectName }} ({{ selectedCluster.crsCode }})</strong>
					</div>
					<div class="gma__lineage-item">
						<span class="gma__lineage-label">{{ t('duplicatefinder', 'Tile-Set / Layer Signature') }}</span>
						<strong class="gma__lineage-val">{{ selectedCluster.tileSignature }}</strong>
					</div>
					<div class="gma__lineage-item">
						<span class="gma__lineage-label">{{ t('duplicatefinder', 'Master & Sidecar Protection') }}</span>
						<strong class="gma__lineage-val">
							{{ selectedCluster.hasShpSidecarBundle ? t('duplicatefinder', 'SHP Sidecar Integrity Guard') : t('duplicatefinder', 'Standalone GeoSpatial Asset') }}
							|
							{{ selectedCluster.hasCanonicalMaster ? t('duplicatefinder', 'Canonical Master') : selectedCluster.formatBadge }}
						</strong>
					</div>
					<div class="gma__lineage-item">
						<span class="gma__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="gma__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="gma__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="gma__member-card">
						<div class="gma__member-top">
							<code class="gma__member-path">{{ member.path }}</code>
							<div class="gma__member-pills">
								<span
									class="gma__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="gma__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="gma__member-bottom">
							<div class="gma__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="gma__override-field">
								<span class="gma__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="gma__override-select"
									:value="getMemberOverride(member.selectionKey)"
									@change="setMemberOverride(member.selectionKey, $event.target.value)">
									<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
									<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
									<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
								</select>
							</label>
						</div>
					</div>
				</div>

				<div class="gma__code-panels">
					<div class="gma__code-box">
						<div class="gma__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="gma__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="gma__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="gma__code-box">
						<div class="gma__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="gma__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="gma__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	GIS_MAP_PRESETS,
	analyzeGisMapArchive,
	buildGisMapCsvReport,
	buildGisMapJsonReport,
	buildGisMapRemediationScript,
	buildGisMapSyncExcludeSnippet,
} from '../tools/gisMapArchiveAuditor'

export default {
	name: 'GisMapArchiveWorkbench',
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
			presetId: 'all-gis-map-archive-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-caches-and-redundant-exports',
			survivorRule: 'canonical-gpkg-ifc-geotiff-first',
			protectCanonicalMasters: true,
			preventOrphaningShpSidecars: true,
			staleCacheDaysInput: '14',
			minSizeMbInput: '0',
			searchQueryInput: '',
			dataRootInput: '/var/www/nextcloud/data',
			sortMode: 'reclaim_desc',
			selectedClusterKey: '',
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return GIS_MAP_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'canonical-master', label: this.t('duplicatefinder', 'Canonical Masters') },
				{ id: 'shp-sidecar', label: this.t('duplicatefinder', 'SHP Sidecars') },
				{ id: 'tile-cache', label: this.t('duplicatefinder', 'Tile / Pyramid Caches') },
				{ id: 'cad-bim', label: this.t('duplicatefinder', 'CAD / BIM Models') },
				{ id: 'shielded', label: this.t('duplicatefinder', 'Shielded') },
			]
		},
		filteredSourceCount() {
			return Array.isArray(this.duplicates) ? this.duplicates.length : 0
		},
		allSourceCount() {
			return Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0
				? this.allDuplicates.length
				: this.filteredSourceCount
		},
		activePool() {
			if (this.scope === 'all' && Array.isArray(this.allDuplicates) && this.allDuplicates.length > 0) {
				return this.allDuplicates
			}
			return Array.isArray(this.duplicates) ? this.duplicates : []
		},
		sourcePoolEmpty() {
			return this.filteredSourceCount === 0 && this.allSourceCount === 0
		},
		parsedStaleCacheDays() {
			const trimmed = String(this.staleCacheDaysInput ?? '').trim()
			if (!trimmed) {
				return 14
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14
		},
		parsedMinSizeMb() {
			const trimmed = String(this.minSizeMbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeGisMapArchive(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectCanonicalMasters: this.protectCanonicalMasters,
				preventOrphaningShpSidecars: this.preventOrphaningShpSidecars,
				staleCacheDays: this.parsedStaleCacheDays,
				minSizeMb: this.parsedMinSizeMb,
				searchQuery: this.searchQueryInput,
				memberOverrides: this.memberOverrides,
			})
		},
		visibleClusters() {
			return this.analysis.clusters.slice(0, this.visibleLimit)
		},
		selectedCluster() {
			const clusters = this.analysis.clusters
			if (!clusters.length) {
				return null
			}
			if (this.selectedClusterKey) {
				const found = clusters.find(c => c.groupKey === this.selectedClusterKey)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.primaryGroupId === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildGisMapRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildGisMapSyncExcludeSnippet(this.analysis)
		},
	},
	methods: {
		t(app, text, vars) {
			if (typeof globalThis.t === 'function') {
				return globalThis.t(app, text, vars)
			}
			if (!vars) {
				return text
			}
			return Object.keys(vars).reduce(
				(acc, key) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(vars[key])),
				text
			)
		},
		setNotice(message, type = 'success') {
			this.statusNotice = message
			this.statusNoticeType = type
		},
		applyPreset(presetId) {
			const preset = GIS_MAP_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectCanonicalMasters = preset.protectCanonicalMasters
			this.preventOrphaningShpSidecars = preset.preventOrphaningShpSidecars
			this.staleCacheDaysInput = String(preset.staleCacheDays)
			this.minSizeMbInput = String(preset.minSizeMb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeMbInput = '0'
			this.searchQueryInput = ''
			this.visibleLimit = 25
		},
		getMemberOverride(selectionKey) {
			return this.memberOverrides[selectionKey] || 'auto'
		},
		setMemberOverride(selectionKey, value) {
			if (this.selectedCluster && !this.selectedClusterKey) {
				this.selectedClusterKey = this.selectedCluster.groupKey
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'cache-reclaimable': this.t('duplicatefinder', 'Stale Cache'),
				'canonical-master-protected': this.t('duplicatefinder', 'Canonical Master Protected'),
				'shp-sidecar-protected': this.t('duplicatefinder', 'SHP Sidecar Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'shp-sidecar-protected' || riskState === 'canonical-master-protected') {
				return 'is-danger'
			}
			if (riskState === 'shielded') {
				return 'is-warn'
			}
			if (riskState === 'consolidatable') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-shp-sidecar-integrity' || verdict === 'blocked-canonical-master') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-gis-asset') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 80) {
				return 'is-keep'
			}
			if (score >= 50) {
				return 'is-consolidate'
			}
			return 'is-warn'
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return this.activePool.find(g => g && g.id === cluster.primaryGroupId)
				|| this.activePool.find(g => g && g.hash && g.hash === cluster.hash)
				|| null
		},
		jumpToDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('select-duplicate', target)
			}
		},
		compareDuplicate(cluster) {
			const target = this.findSourceDuplicate(cluster)
			if (target) {
				this.$emit('compare-duplicate', target)
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 GIS Map Archive remediation script to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy script to clipboard.'), 'error')
			}
		},
		async copySyncExcludeSnippet() {
			const ok = await copyTextSafely(this.generatedSyncExclude)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied .sync-exclude.lst rules to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy .sync-exclude.lst rules to clipboard.'), 'error')
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
			anchor.style.display = 'none'
			document.body.appendChild(anchor)
			anchor.click()
			document.body.removeChild(anchor)
			if (typeof URL.revokeObjectURL === 'function') {
				URL.revokeObjectURL(objectUrl)
			}
			return true
		},
		exportAuditCsv() {
			const csv = buildGisMapCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-gis-map-archive-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe GIS Map Archive CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildGisMapJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-gis-map-archive-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported GIS Map Archive JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.gis-map-archive-workbench {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 14px;
	margin-block-end: 16px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius-large, 8px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	box-sizing: border-box;
	min-inline-size: 0;
	max-inline-size: 100%;
	overflow-x: clip;
}

.gma__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.gma__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.gma__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.gma__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 6px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-family: monospace;
	font-size: 0.8rem;
	font-weight: 600;
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.gma__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gma__tool-btn,
.gma__seg-btn,
.gma__primary-btn,
.gma__load-more-btn,
.gma__mini-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 6px;
	padding-inline: 12px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	max-inline-size: 100%;
	text-align: center;
}

.gma__tool-btn:hover:not(:disabled),
.gma__seg-btn:hover:not(:disabled),
.gma__load-more-btn:hover:not(:disabled),
.gma__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.gma__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.gma__tool-btn.is-primary-outline,
.gma__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.gma__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.gma__tool-btn:focus-visible,
.gma__seg-btn:focus-visible,
.gma__primary-btn:focus-visible,
.gma__load-more-btn:focus-visible,
.gma__mini-btn:focus-visible,
.gma__cluster-card:focus-visible,
.gma__input:focus-visible,
.gma__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.gma__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.gma__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.gma__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.gma__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.gma__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gma__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.gma__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gma__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.gma__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.gma__empty-banner,
.gma__empty-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px 14px;
	border: 1px dashed var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.gma__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.gma__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.gma__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.gma__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.gma__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.gma__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.gma__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.gma__inputs-row {
	align-items: flex-end;
}

.gma__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.gma__field-grow {
	flex: 1 1 180px;
}

.gma__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.gma__input,
.gma__override-select {
	min-block-size: 44px;
	padding-block: 6px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.85rem;
	box-sizing: border-box;
	max-inline-size: 100%;
}

.gma__num-input {
	inline-size: 96px;
}

.gma__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.gma__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.gma__cluster-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
	max-inline-size: 100%;
	box-sizing: border-box;
}

.gma__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.gma__cluster-top,
.gma__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.gma__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.gma__cluster-meta,
.gma__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.gma__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.gma__badge,
.gma__pill {
	display: inline-flex;
	align-items: center;
	padding-block: 2px;
	padding-inline: 7px;
	border-radius: 999px;
	font-size: 0.74rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
}

.gma__pill.is-keep,
.gma__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.gma__pill.is-danger,
.gma__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.gma__pill.is-consolidate,
.gma__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.gma__pill.is-warn,
.gma__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.gma__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.gma__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gma__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.gma__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.gma__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gma__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.gma__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gma__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.gma__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gma__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.gma__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.gma__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.gma__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.gma__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gma__member-top,
.gma__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.gma__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.gma__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.gma__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.gma__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.gma__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gma__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.gma__pre {
	margin: 0;
	padding: 8px;
	border-radius: 4px;
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
	max-block-size: 200px;
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.gma__sr-only {
	position: absolute;
	inline-size: 1px;
	block-size: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip-path: inset(50%);
	white-space: nowrap;
	border: 0;
}

@media (max-width: 1120px) {
	.gma__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.gma__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.gma__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.gis-map-archive-workbench {
		padding: 10px;
	}

	.gma__kpis,
	.gma__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.gma__num-input {
		inline-size: 100%;
	}

	.gma__field {
		flex: 1 1 100%;
	}
}
</style>
