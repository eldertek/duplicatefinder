<template>
	<section
		class="game-dev-pipeline-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Game Dev, Unity/Unreal and 3D Asset Pipeline Vault Auditor')">
		<header class="gdpv__toolbar">
			<div class="gdpv__title-group">
				<h3 class="gdpv__title">
					{{ t('duplicatefinder', 'Game Dev, Unity/Unreal & 3D Asset Pipeline Vault Auditor') }}
				</h3>
				<span
					class="gdpv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {meshes} meshes, {textures} textures vs {caches} caches', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						meshes: analysis.summary.totalMeshDuplicateClusters,
						textures: analysis.summary.totalTextureDuplicateClusters,
						caches: analysis.summary.totalRegenerableCacheClusters,
					}) }}
				</span>
			</div>

			<div class="gdpv__toolbar-actions">
				<button
					type="button"
					class="gdpv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="gdpv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="gdpv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="gdpv__tool-btn is-close"
					aria-keyshortcuts="F6"
					:title="t('duplicatefinder', 'Hide Game Dev, Unity/Unreal and 3D Asset Pipeline Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Game Dev Pipeline') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="gdpv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="gdpv__kpis">
			<div class="gdpv__kpi">
				<span class="gdpv__kpi-label">{{ t('duplicatefinder', 'Safe Pipeline Reclaim') }}</span>
				<strong class="gdpv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="gdpv__kpi">
				<span class="gdpv__kpi-label">{{ t('duplicatefinder', 'Meshes/Textures vs Engine Caches') }}</span>
				<strong class="gdpv__kpi-val is-warn">
					{{ analysis.summary.totalMeshDuplicateClusters }} {{ t('duplicatefinder', 'meshes') }} / {{ analysis.summary.totalTextureDuplicateClusters }} {{ t('duplicatefinder', 'textures') }} / {{ analysis.summary.totalRegenerableCacheClusters }} {{ t('duplicatefinder', 'caches') }}
				</strong>
			</div>
			<div class="gdpv__kpi">
				<span class="gdpv__kpi-label">{{ t('duplicatefinder', 'Unity / Unreal Scenes & Shields') }}</span>
				<strong class="gdpv__kpi-val">
					{{ analysis.summary.distinctAssetStemsCount }} {{ t('duplicatefinder', 'assets') }} / {{ analysis.summary.totalUnrealClusters }} {{ t('duplicatefinder', 'UE') }} / {{ analysis.summary.totalUnityClusters }} {{ t('duplicatefinder', 'Unity') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="gdpv__kpi">
				<span class="gdpv__kpi-label">{{ t('duplicatefinder', 'Raw Pipeline Footprint') }}</span>
				<strong class="gdpv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="gdpv__empty-banner"
			role="note">
			<div class="gdpv__empty-text">
				<p class="gdpv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure DCC mesh, scene/prefab, and cache guards before scanning') }}
				</p>
				<p class="gdpv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit Unreal (.uasset, .umap), Unity (.unity, .prefab, .mat), 3D DCC meshes (.fbx, .glb, .gltf, .blend), pipeline textures (.exr, .hdr, .dds, .tga, .ktx2), and regenerable Library/, Intermediate/, and DerivedDataCache/ caches.') }}
				</p>
			</div>
			<button
				type="button"
				class="gdpv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="gdpv__controls">
			<div class="gdpv__control-row">
				<span class="gdpv__control-label">{{ t('duplicatefinder', 'Pipeline Preset') }}</span>
				<div
					class="gdpv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Game Dev pipeline presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="gdpv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="gdpv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="gdpv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="gdpv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="gdpv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="gdpv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="gdpv__seg-btn"
					:class="{ 'is-active': protectDccSources }"
					:aria-pressed="protectDccSources ? 'true' : 'false'"
					@click="protectDccSources = !protectDccSources">
					<span>{{ protectDccSources ? t('duplicatefinder', 'Shield .blend/.fbx/.glb Sources: ON') : t('duplicatefinder', 'Shield .blend/.fbx/.glb Sources: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gdpv__seg-btn"
					:class="{ 'is-active': protectScenesAndPrefabs }"
					:aria-pressed="protectScenesAndPrefabs ? 'true' : 'false'"
					@click="protectScenesAndPrefabs = !protectScenesAndPrefabs">
					<span>{{ protectScenesAndPrefabs ? t('duplicatefinder', 'Shield Scenes & Prefabs: ON') : t('duplicatefinder', 'Shield Scenes & Prefabs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="gdpv__seg-btn"
					:class="{ 'is-active': protectProductionAssets }"
					:aria-pressed="protectProductionAssets ? 'true' : 'false'"
					@click="protectProductionAssets = !protectProductionAssets">
					<span>{{ protectProductionAssets ? t('duplicatefinder', 'Shield Golden Masters & EXR: ON') : t('duplicatefinder', 'Shield Golden Masters & EXR: OFF') }}</span>
				</button>
			</div>

			<div class="gdpv__control-row gdpv__inputs-row">
				<label class="gdpv__field">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="gdpv__input">
						<option value="prune-engine-caches-keep-sources">{{ t('duplicatefinder', 'Prune Engine Caches & Keep DCC/Scenes') }}</option>
						<option value="consolidate-mesh-texture-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Meshes & Textures') }}</option>
						<option value="prune-ephemeral-caches-only">{{ t('duplicatefinder', 'Prune Stale Library/Intermediate/DDC Only') }}</option>
					</select>
				</label>

				<label class="gdpv__field">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="gdpv__input">
						<option value="dcc-source-and-scene-first">{{ t('duplicatefinder', 'DCC Source & Scene/Prefab first') }}</option>
						<option value="engine-content-assets-first">{{ t('duplicatefinder', 'Unity Assets/ or Unreal Content/ first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="gdpv__field">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Cache Age (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="gdpv__input gdpv__num-input">
				</label>

				<label class="gdpv__field">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="gdpv__input gdpv__num-input">
				</label>

				<label class="gdpv__field gdpv__field-grow">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Filter Asset Stem, Engine or Format') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="gdpv__input"
						:placeholder="t('duplicatefinder', 'e.g. hero_mech, .uasset, .unity, .prefab, .exr, .ktx2, DerivedDataCache')">
				</label>

				<label class="gdpv__field gdpv__field-grow">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="gdpv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="gdpv__field">
					<span class="gdpv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="gdpv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="cache_priority_desc">{{ t('duplicatefinder', 'Ephemeral cache priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="gdpv__control-row">
				<span class="gdpv__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="gdpv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Game Dev pipeline vault family filter')">
					<button
						type="button"
						class="gdpv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="gdpv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="gdpv__control-row">
				<span class="gdpv__control-label">{{ t('duplicatefinder', 'Asset vs Cache') }}</span>
				<div
					class="gdpv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Game Dev asset vs cache verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="gdpv__seg-btn"
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
			class="gdpv__empty-filter"
			role="note">
			<p class="gdpv__empty-title">
				{{ t('duplicatefinder', 'No Unity/Unreal scenes, prefabs, DCC meshes, HDR/GPU textures, or engine cache clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="gdpv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="gdpv__workspace">
			<div
				class="gdpv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Game Dev, Unity/Unreal and 3D asset pipeline clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="gdpv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="gdpv__cluster-top">
						<strong class="gdpv__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="gdpv__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="gdpv__cluster-meta">
						<span class="gdpv__tag">{{ cluster.projectWorkspace }}</span>
						<span class="gdpv__tag">{{ cluster.assetStem }}</span>
						<span class="gdpv__tag">{{ cluster.engineName }}</span>
					</div>
					<div class="gdpv__cluster-badges">
						<span
							class="gdpv__badge"
							:class="duplicationBadgeClass(cluster.duplicationClass)">
							{{ cluster.duplicationBadge }}
						</span>
						<span
							class="gdpv__badge"
							:class="lineageBadgeClass(cluster)">
							{{ cluster.assetLineageBadge }}
						</span>
						<span
							v-if="cluster.hasProductionLock"
							class="gdpv__badge is-danger">
							{{ t('duplicatefinder', 'Golden Master') }}
						</span>
					</div>
					<div class="gdpv__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="gdpv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="gdpv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="gdpv__inspector">
				<header class="gdpv__inspector-head">
					<div class="gdpv__inspector-title-wrap">
						<h4 class="gdpv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="gdpv__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.engineName }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="gdpv__inspector-actions">
						<button
							type="button"
							class="gdpv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="gdpv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="gdpv__lineage-grid">
					<div class="gdpv__lineage-item">
						<span class="gdpv__lineage-label">{{ t('duplicatefinder', 'Asset Stem & Pipeline Spec') }}</span>
						<strong class="gdpv__lineage-val">{{ selectedCluster.assetStem }} ({{ selectedCluster.assetSpec }} / {{ selectedCluster.formatBadge }})</strong>
					</div>
					<div class="gdpv__lineage-item">
						<span class="gdpv__lineage-label">{{ t('duplicatefinder', 'Engine & Pipeline Stage') }}</span>
						<strong class="gdpv__lineage-val">{{ selectedCluster.engineName }} / {{ selectedCluster.pipelineStage }}</strong>
					</div>
					<div class="gdpv__lineage-item">
						<span class="gdpv__lineage-label">{{ t('duplicatefinder', 'Asset vs Cache Lineage') }}</span>
						<strong class="gdpv__lineage-val">
							{{ selectedCluster.duplicationBadge }} | {{ selectedCluster.assetLineageBadge }}
						</strong>
					</div>
					<div class="gdpv__lineage-item">
						<span class="gdpv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="gdpv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="gdpv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="gdpv__member-card">
						<div class="gdpv__member-top">
							<code class="gdpv__member-path">{{ member.path }}</code>
							<div class="gdpv__member-pills">
								<span
									class="gdpv__pill"
									:class="member.meta.isDccMesh || member.meta.isEngineScenePrefab ? 'is-keep' : (member.meta.isEphemeralCache ? 'is-warn' : 'is-consolidate')">
									{{ member.meta.artifactKindBadge }}
								</span>
								<span
									class="gdpv__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="gdpv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="gdpv__member-bottom">
							<div class="gdpv__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="gdpv__override-field">
								<span class="gdpv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="gdpv__override-select"
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

				<div class="gdpv__code-panels">
					<div class="gdpv__code-box">
						<div class="gdpv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="gdpv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="gdpv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="gdpv__code-box">
						<div class="gdpv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="gdpv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="gdpv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	GAME_DEV_PIPELINE_PRESETS,
	analyzeGameDevPipelineVault,
	buildGameDevPipelineCsvReport,
	buildGameDevPipelineJsonReport,
	buildGameDevPipelineRemediationScript,
	buildGameDevPipelineSyncExcludeSnippet,
} from '../tools/gameDevPipelineVaultAuditor'

export default {
	name: 'GameDevPipelineVaultWorkbench',
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
			presetId: 'all-gamedev-pipeline-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-engine-caches-keep-sources',
			survivorRule: 'dcc-source-and-scene-first',
			protectDccSources: true,
			protectScenesAndPrefabs: true,
			protectProductionAssets: true,
			staleCacheDaysInput: '7',
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
			return GAME_DEV_PIPELINE_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'mesh-duplicates', label: this.t('duplicatefinder', '3D Meshes') },
				{ id: 'texture-duplicates', label: this.t('duplicatefinder', 'Textures (.exr/.dds/.ktx2)') },
				{ id: 'regenerable-caches', label: this.t('duplicatefinder', 'Regenerable Caches') },
				{ id: 'dcc-sources', label: this.t('duplicatefinder', 'DCC Sources (.blend/.fbx)') },
				{ id: 'scenes-prefabs', label: this.t('duplicatefinder', 'Scenes & Prefabs') },
				{ id: 'unreal-assets', label: this.t('duplicatefinder', 'Unreal Engine') },
				{ id: 'unity-assets', label: this.t('duplicatefinder', 'Unity') },
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
				return 7
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 7
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
			return analyzeGameDevPipelineVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectDccSources: this.protectDccSources,
				protectScenesAndPrefabs: this.protectScenesAndPrefabs,
				protectProductionAssets: this.protectProductionAssets,
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
			return buildGameDevPipelineRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildGameDevPipelineSyncExcludeSnippet(this.analysis)
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
			const preset = GAME_DEV_PIPELINE_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectDccSources = preset.protectDccSources
			this.protectScenesAndPrefabs = preset.protectScenesAndPrefabs
			this.protectProductionAssets = preset.protectProductionAssets
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
		duplicationBadgeClass(duplicationClass) {
			if (duplicationClass === 'scene-prefab') {
				return 'is-keep'
			}
			if (duplicationClass === 'regenerable-cache') {
				return 'is-warn'
			}
			return 'is-consolidate'
		},
		lineageBadgeClass(cluster) {
			if (cluster.hasDccSourceInVault || cluster.hasScenePrefabInVault) {
				return 'is-keep'
			}
			return 'is-consolidate'
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'ephemeral-cache-reclaimable': this.t('duplicatefinder', 'Ephemeral Cache Reclaimable'),
				'production-asset-locked': this.t('duplicatefinder', 'Golden Master Locked'),
				'dcc-source-protected': this.t('duplicatefinder', 'DCC Source Protected'),
				'scene-prefab-protected': this.t('duplicatefinder', 'Scene/Prefab Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'production-asset-locked') {
				return 'is-danger'
			}
			if (riskState === 'dcc-source-protected' || riskState === 'scene-prefab-protected' || riskState === 'shielded') {
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
			if (verdict === 'blocked-production-asset' || verdict === 'blocked-dcc-source') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-pipeline-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Game Dev Pipeline remediation script to clipboard.'))
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
			const csv = buildGameDevPipelineCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-gamedev-pipeline-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Game Dev Pipeline CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildGameDevPipelineJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-gamedev-pipeline-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Game Dev Pipeline JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.game-dev-pipeline-vault-workbench {
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

.gdpv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.gdpv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.gdpv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.gdpv__status-badge {
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

.gdpv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gdpv__tool-btn,
.gdpv__seg-btn,
.gdpv__primary-btn,
.gdpv__load-more-btn,
.gdpv__mini-btn {
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

.gdpv__tool-btn:hover:not(:disabled),
.gdpv__seg-btn:hover:not(:disabled),
.gdpv__load-more-btn:hover:not(:disabled),
.gdpv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.gdpv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.gdpv__tool-btn.is-primary-outline,
.gdpv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.gdpv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.gdpv__tool-btn:focus-visible,
.gdpv__seg-btn:focus-visible,
.gdpv__primary-btn:focus-visible,
.gdpv__load-more-btn:focus-visible,
.gdpv__mini-btn:focus-visible,
.gdpv__cluster-card:focus-visible,
.gdpv__input:focus-visible,
.gdpv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.gdpv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.gdpv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.gdpv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.gdpv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.gdpv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gdpv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.gdpv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gdpv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.gdpv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.gdpv__empty-banner,
.gdpv__empty-filter {
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

.gdpv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.gdpv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.gdpv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.gdpv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.gdpv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.gdpv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.gdpv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.gdpv__inputs-row {
	align-items: flex-end;
}

.gdpv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.gdpv__field-grow {
	flex: 1 1 180px;
}

.gdpv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.gdpv__input,
.gdpv__override-select {
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

.gdpv__num-input {
	inline-size: 96px;
}

.gdpv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.gdpv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.gdpv__cluster-card {
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

.gdpv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.gdpv__cluster-top,
.gdpv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.gdpv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.gdpv__cluster-meta,
.gdpv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.gdpv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.gdpv__badge,
.gdpv__pill {
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

.gdpv__pill.is-keep,
.gdpv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.gdpv__pill.is-danger,
.gdpv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.gdpv__pill.is-consolidate,
.gdpv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.gdpv__pill.is-warn,
.gdpv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.gdpv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.gdpv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.gdpv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.gdpv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.gdpv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.gdpv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.gdpv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.gdpv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.gdpv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gdpv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.gdpv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.gdpv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.gdpv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.gdpv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gdpv__member-top,
.gdpv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.gdpv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.gdpv__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.gdpv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.gdpv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.gdpv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.gdpv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.gdpv__pre {
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

.gdpv__sr-only {
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
	.gdpv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.gdpv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.gdpv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.game-dev-pipeline-vault-workbench {
		padding: 10px;
	}

	.gdpv__kpis,
	.gdpv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.gdpv__num-input {
		inline-size: 100%;
	}

	.gdpv__field {
		flex: 1 1 100%;
	}
}
</style>
