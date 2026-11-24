<template>
	<section
		class="game3d-asset-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Game Engine, Blender Backup and 3D PBR Texture Vault Auditor')">
		<header class="g3dv__toolbar">
			<div class="g3dv__title-group">
				<h3 class="g3dv__title">
					{{ t('duplicatefinder', 'Game Engine, Blender Backup & 3D PBR Texture Vault Auditor') }}
				</h3>
				<span
					class="g3dv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {masters} master-guarded', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						masters: analysis.summary.totalSceneMasterClusters,
					}) }}
				</span>
			</div>

			<div class="g3dv__toolbar-actions">
				<button
					type="button"
					class="g3dv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="g3dv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="g3dv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="g3dv__tool-btn is-close"
					aria-keyshortcuts="Shift+T"
					:title="t('duplicatefinder', 'Hide Game Engine, Blender Backup and 3D PBR Texture Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide 3D & Game Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="g3dv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="g3dv__kpis">
			<div class="g3dv__kpi">
				<span class="g3dv__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="g3dv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="g3dv__kpi">
				<span class="g3dv__kpi-label">{{ t('duplicatefinder', 'Scene & 4K/8K PBR Masters') }}</span>
				<strong class="g3dv__kpi-val is-warn">
					{{ analysis.summary.totalSceneMasterClusters }} {{ t('duplicatefinder', 'mastered') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="g3dv__kpi">
				<span class="g3dv__kpi-label">{{ t('duplicatefinder', 'Backups & Engine Caches') }}</span>
				<strong class="g3dv__kpi-val">
					{{ analysis.summary.totalBlenderBackupClusters }} {{ t('duplicatefinder', 'backups') }} / {{ analysis.summary.totalEngineCacheClusters }} {{ t('duplicatefinder', 'caches') }}
				</strong>
			</div>
			<div class="g3dv__kpi">
				<span class="g3dv__kpi-label">{{ t('duplicatefinder', 'Raw 3D & Cache Footprint') }}</span>
				<strong class="g3dv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="g3dv__empty-banner"
			role="note">
			<div class="g3dv__empty-text">
				<p class="g3dv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure 3D Scene and 4K/8K PBR guards before scanning') }}
				</p>
				<p class="g3dv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit 3D scene masters (.blend/.uproject/.unity/.fbx/.glb/.gltf/.usdz/.3mf), Blender and slicer backups (.blend1-3/autosave_*.blend/.gcode/.bgcode), PBR texture pyramids (_8k/_4k/_2k/_1k _albedo/_normal/_roughness/_orm), and engine derived caches (Library/ArtifactDB, Library/ShaderCache, Temp/, DerivedDataCache/, Intermediate/, Saved/Autosaves/, *.meshcache, shader_cache_*.bin).') }}
				</p>
			</div>
			<button
				type="button"
				class="g3dv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="g3dv__controls">
			<div class="g3dv__control-row">
				<span class="g3dv__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="g3dv__segments"
					role="group"
					:aria-label="t('duplicatefinder', '3D and game engine vault audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="g3dv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="g3dv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="g3dv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="g3dv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="g3dv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="g3dv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="g3dv__seg-btn"
					:class="{ 'is-active': protectSceneMasters }"
					:aria-pressed="protectSceneMasters ? 'true' : 'false'"
					@click="protectSceneMasters = !protectSceneMasters">
					<span>{{ protectSceneMasters ? t('duplicatefinder', 'Scene Master Guard: ON') : t('duplicatefinder', 'Scene Master Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="g3dv__seg-btn"
					:class="{ 'is-active': protectPbrMasters }"
					:aria-pressed="protectPbrMasters ? 'true' : 'false'"
					@click="protectPbrMasters = !protectPbrMasters">
					<span>{{ protectPbrMasters ? t('duplicatefinder', 'PBR 4K/8K Guard: ON') : t('duplicatefinder', 'PBR 4K/8K Guard: OFF') }}</span>
				</button>
			</div>

			<div class="g3dv__control-row g3dv__inputs-row">
				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="g3dv__input">
						<option value="prune-engine-derived-caches">{{ t('duplicatefinder', 'Prune Engine & Shader Caches') }}</option>
						<option value="prune-blender-auto-backups">{{ t('duplicatefinder', 'Prune Blender & Slicer Backups') }}</option>
						<option value="consolidate-pbr-texture-downscales">{{ t('duplicatefinder', 'Consolidate PBR Texture Downscales') }}</option>
					</select>
				</label>

				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="g3dv__input">
						<option value="scene-master-and-vault-first">{{ t('duplicatefinder', 'Scene Vault & Masters first') }}</option>
						<option value="pbr-highres-4k-8k-first">{{ t('duplicatefinder', 'PBR 4K/8K Masters first') }}</option>
						<option value="newest-asset-first">{{ t('duplicatefinder', 'Newest asset timestamp first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Keep Backups') }}</span>
					<input
						v-model="keepRecentBackupsInput"
						type="number"
						min="1"
						step="1"
						class="g3dv__input g3dv__num-input">
				</label>

				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="g3dv__input g3dv__num-input">
				</label>

				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="g3dv__input g3dv__num-input">
				</label>

				<label class="g3dv__field g3dv__field-grow">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Filter Asset Stem, PBR Map or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="g3dv__input"
						:placeholder="t('duplicatefinder', 'e.g. blend, albedo, 4k, gcode, DerivedDataCache')">
				</label>

				<label class="g3dv__field g3dv__field-grow">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="g3dv__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="g3dv__field">
					<span class="g3dv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="g3dv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & lineage risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="g3dv__filters-strip">
			<div
				class="g3dv__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by 3D or game engine asset family')">
				<button
					type="button"
					class="g3dv__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All 3D & Engine Assets ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="g3dv__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="g3dv__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by 3D vault audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="g3dv__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="g3dv__empty-banner"
			role="note">
			<div class="g3dv__empty-text">
				<p class="g3dv__empty-title">
					{{ t('duplicatefinder', 'No 3D scene masters, Blender/slicer backups, PBR texture pyramids, or engine caches match the active filters') }}
				</p>
				<p class="g3dv__empty-hint">
					{{ t('duplicatefinder', 'Adjust the asset family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="g3dv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="g3dv__workstation">
			<div class="g3dv__list-pane">
				<div class="g3dv__pane-header">
					<span class="g3dv__pane-title">
						{{ t('duplicatefinder', '3D Asset & Texture Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="g3dv__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="g3dv__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="g3dv__cluster-top">
							<span class="g3dv__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="g3dv__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="g3dv__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.assetLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span class="g3dv__num-cell">{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="g3dv__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="g3dv__load-more-wrap">
					<button
						type="button"
						class="g3dv__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="g3dv__inspector-pane">
				<header class="g3dv__inspector-header">
					<div class="g3dv__inspector-title-wrap">
						<h4 class="g3dv__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="g3dv__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.assetLineageStem }}
						</span>
					</div>

					<div class="g3dv__inspector-actions">
						<button
							type="button"
							class="g3dv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="g3dv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-master'"
					class="g3dv__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unverified Master Guard:') }}</strong>
					{{ t('duplicatefinder', 'Deletion of PBR downscales (_2k/_1k/_512), sliced .gcode/.bgcode files, and Blender backups (.blend1-3/autosave_*.blend) is blocked whenever the verified 4K/8K PBR master or .blend/.3mf scene master is missing.') }}
				</div>

				<div
					v-if="selectedCluster.hasSceneMaster || selectedCluster.hasPbrMaster"
					class="g3dv__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Scene & PBR Master Integrity Guard:') }}</strong>
					{{ t('duplicatefinder', 'Canonical 3D scene masters (.blend/.uproject/.unity/.fbx/.glb/.gltf/.usdz/.3mf) and 4K/8K PBR texture masters are strictly protected by default.') }}
				</div>

				<div class="g3dv__meta-grid">
					<div class="g3dv__meta-item">
						<span class="g3dv__meta-label">{{ t('duplicatefinder', 'Asset Lineage Stem') }}</span>
						<span>{{ selectedCluster.assetLineageStem }}</span>
					</div>
					<div class="g3dv__meta-item">
						<span class="g3dv__meta-label">{{ t('duplicatefinder', 'Format & Channel Tags') }}</span>
						<span>{{ selectedCluster.assetSummary }}</span>
					</div>
					<div class="g3dv__meta-item">
						<span class="g3dv__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="g3dv__meta-item">
						<span class="g3dv__meta-label">{{ t('duplicatefinder', 'Canonical Vault Anchor') }}</span>
						<span class="g3dv__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="g3dv__meta-item">
						<span class="g3dv__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span class="g3dv__num-cell">{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="g3dv__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="g3dv__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="g3dv__member-top">
							<span class="g3dv__member-name">{{ member.basename }}</span>
							<div class="g3dv__member-badges">
								<span
									class="g3dv__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="g3dv__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="g3dv__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="g3dv__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span class="g3dv__num-cell">{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null" class="g3dv__num-cell">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="g3dv__companion-chips">
							<span class="g3dv__companion-chip">{{ member.context.assetLineageStem }}</span>
							<span
								v-if="member.context.resolutionTier"
								class="g3dv__companion-chip">
								{{ member.context.resolutionTier.toUpperCase() }}
							</span>
							<span
								v-if="member.context.pbrChannel"
								class="g3dv__companion-chip">
								{{ member.context.pbrChannel }}
							</span>
							<span
								v-if="member.context.backupGeneration !== null"
								class="g3dv__companion-chip">
								gen-{{ member.context.backupGeneration }}
							</span>
							<span
								v-if="member.context.assetTag !== 'none'"
								class="g3dv__companion-chip">
								{{ member.context.assetTag }}
							</span>
							<span
								v-if="member.context.isSceneMaster"
								class="g3dv__companion-chip is-warn">
								{{ t('duplicatefinder', '3D Scene Master') }}
							</span>
							<span
								v-if="member.context.isMasterPbr4kOr8k"
								class="g3dv__companion-chip is-warn">
								{{ t('duplicatefinder', 'PBR 4K/8K Master') }}
							</span>
							<span
								v-if="member.context.isPbrDownscale"
								class="g3dv__companion-chip">
								{{ member.context.hasVerifiedPbrMaster ? t('duplicatefinder', '4K/8K PBR Master Verified') : t('duplicatefinder', 'Missing 4K/8K PBR Master') }}
							</span>
							<span
								v-if="member.context.isBlenderOrSlicerBackup"
								class="g3dv__companion-chip">
								{{ member.context.hasVerifiedSceneMaster ? t('duplicatefinder', 'Scene Master Verified') : t('duplicatefinder', 'Missing .blend/.3mf Master') }}
							</span>
							<span
								v-if="member.context.isEngineDerivedCache"
								class="g3dv__companion-chip">
								{{ member.context.isStaleArtifact ? t('duplicatefinder', 'Stale Engine Cache') : t('duplicatefinder', 'Recent Engine Cache') }}
							</span>
						</div>

						<p class="g3dv__member-note">
							{{ member.note }}
						</p>

						<div class="g3dv__override-bar">
							<span class="g3dv__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="g3dv__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="g3dv__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="g3dv__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'exclude' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'exclude' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'exclude')">
								<span>{{ t('duplicatefinder', 'Exclude') }}</span>
							</button>
						</div>
					</article>
				</div>
			</div>
		</div>

		<details
			v-if="analysis.clusters.length > 0"
			class="g3dv__script-box">
			<summary class="g3dv__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="g3dv__script-content">
				<div class="g3dv__script-actions">
					<button
						type="button"
						class="g3dv__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="g3dv__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="g3dv__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="g3dv__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	GAME3D_ASSET_FAMILY_META,
	GAME3D_ASSET_PRESETS,
	analyzeGame3dAssetVaultDuplicates,
	buildGame3dAssetVaultCsvReport,
	buildGame3dAssetVaultJsonReport,
	buildGame3dAssetVaultScript,
	buildGame3dAssetVaultSyncExcludeSnippet,
} from '../tools/game3dAssetVaultAuditor'

export default {
	name: 'Game3dAssetVaultWorkbench',
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
			presetId: 'all-game3d-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-pbr-texture-downscales',
			survivorRule: 'scene-master-and-vault-first',
			protectSceneMasters: true,
			protectPbrMasters: true,
			keepRecentBackupsInput: '1',
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
			return GAME3D_ASSET_PRESETS
		},
		familyOptions() {
			return Object.values(GAME3D_ASSET_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'scene-master', label: this.t('duplicatefinder', '3D Scene Masters') },
				{ id: 'pbr-master', label: this.t('duplicatefinder', 'PBR 4K/8K Masters') },
				{ id: 'pbr-downscale', label: this.t('duplicatefinder', 'PBR Downscales') },
				{ id: 'blender-backup', label: this.t('duplicatefinder', 'Blender & Slicer Backups') },
				{ id: 'engine-cache', label: this.t('duplicatefinder', 'Engine Derived Caches') },
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
		parsedKeepRecentBackups() {
			const trimmed = String(this.keepRecentBackupsInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1
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
			return analyzeGame3dAssetVaultDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectSceneMasters: this.protectSceneMasters,
				protectPbrMasters: this.protectPbrMasters,
				keepRecentBackups: this.parsedKeepRecentBackups,
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
			return buildGame3dAssetVaultScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildGame3dAssetVaultSyncExcludeSnippet(this.analysis)
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
			const preset = GAME3D_ASSET_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectSceneMasters = preset.protectSceneMasters
			this.protectPbrMasters = preset.protectPbrMasters
			this.keepRecentBackupsInput = String(preset.keepRecentBackups)
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
				'scene-master': this.t('duplicatefinder', 'Scene Master Protected'),
				'pbr-master': this.t('duplicatefinder', 'PBR 4K/8K Protected'),
				'unverified-master': this.t('duplicatefinder', 'Missing Verified Master'),
				'master-verified': this.t('duplicatefinder', 'Master Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-scene-master'
				|| verdict === 'blocked-pbr-master-4k-8k'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-scene-master'
				|| verdict === 'blocked-recent-backup'
				|| verdict === 'blocked-fresh-engine-cache'
				|| verdict === 'blocked-not-engine-cache'
				|| verdict === 'blocked-not-blender-backup'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (
				verdict === 'consolidate-pbr-downscale'
				|| verdict === 'consolidate-to-vault-master'
			) {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 3D & Game Vault remediation script to clipboard.'))
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
			const csv = buildGame3dAssetVaultCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-game3d-asset-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe 3D & Game Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildGame3dAssetVaultJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-game3d-asset-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported 3D & Game Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.game3d-asset-vault-workbench {
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
}

.g3dv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.g3dv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.g3dv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.g3dv__status-badge {
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
	font-variant-numeric: tabular-nums;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.g3dv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.g3dv__tool-btn,
.g3dv__seg-btn,
.g3dv__chip,
.g3dv__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 11px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	line-height: 1.4;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.g3dv__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.g3dv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.g3dv__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.g3dv__seg-btn.is-active,
.g3dv__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.g3dv__tool-btn:focus-visible,
.g3dv__seg-btn:focus-visible,
.g3dv__chip:focus-visible,
.g3dv__primary-btn:focus-visible,
.g3dv__cluster-item:focus-visible,
.g3dv__input:focus-visible,
.g3dv__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.g3dv__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.g3dv__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.g3dv__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.g3dv__empty-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px dashed var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
}

.g3dv__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.g3dv__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.g3dv__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.g3dv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
}

.g3dv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.g3dv__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.g3dv__segments,
.g3dv__chip-group,
.g3dv__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.g3dv__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.g3dv__inputs-row {
	align-items: flex-end;
}

.g3dv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.g3dv__field-grow {
	flex: 1 1 200px;
}

.g3dv__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.g3dv__input {
	min-block-size: 44px;
	padding-block: 10px;
	padding-inline: 10px;
	border: 1px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	font-size: 0.86rem;
	line-height: 1.4;
	box-sizing: border-box;
	inline-size: 100%;
	min-inline-size: 0;
}

.g3dv__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
	font-variant-numeric: tabular-nums;
}

.g3dv__num-cell {
	font-variant-numeric: tabular-nums;
}

.g3dv__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
}

@media (min-width: 560px) {
	.g3dv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.g3dv__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.g3dv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 8px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-inline-start: 3px solid var(--color-border-dark, var(--color-border));
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.g3dv__kpi-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	color: var(--color-text-maxcontrast);
}

.g3dv__kpi-val {
	font-size: 0.98rem;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	overflow-wrap: anywhere;
}

.g3dv__kpi-val.is-accent {
	color: #0b4a8b;
}

.g3dv__kpi-val.is-warn {
	color: #7c4a03;
}

.g3dv__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 12px;
}

@media (min-width: 1080px) {
	.g3dv__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.g3dv__list-pane,
.g3dv__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.g3dv__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	padding-block-end: 6px;
	border-block-end: 1px solid var(--color-border);
}

.g3dv__pane-title {
	font-size: 0.86rem;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.02em;
}

.g3dv__cluster-list,
.g3dv__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.g3dv__cluster-item {
	display: flex;
	flex-direction: column;
	align-items: stretch;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	min-block-size: 44px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	color: var(--color-main-text);
	text-align: start;
	cursor: pointer;
	min-inline-size: 0;
}

.g3dv__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.g3dv__cluster-top,
.g3dv__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.g3dv__cluster-name,
.g3dv__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.g3dv__cluster-path,
.g3dv__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.g3dv__cluster-meta,
.g3dv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.g3dv__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.g3dv__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.g3dv__pill.is-risk-scene-master,
.g3dv__pill.is-risk-unverified-master,
.g3dv__pill.is-risk-shielded,
.g3dv__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.g3dv__pill.is-risk-pbr-master,
.g3dv__pill.is-risk-master-verified,
.g3dv__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.g3dv__pill.is-risk-reclaimable,
.g3dv__pill.is-reclaim,
.g3dv__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.g3dv__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.g3dv__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.g3dv__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.g3dv__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.g3dv__inspector-actions,
.g3dv__override-bar,
.g3dv__member-badges,
.g3dv__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.g3dv__companion-chip {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 6px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.74rem;
	color: var(--color-main-text);
	overflow-wrap: anywhere;
}

.g3dv__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.g3dv__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.g3dv__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.g3dv__meta-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 8px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
}

@media (min-width: 640px) {
	.g3dv__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.g3dv__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.g3dv__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.g3dv__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.g3dv__member-card {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.g3dv__member-card.is-verdict-keep-canonical-survivor,
.g3dv__member-card.is-verdict-reclaim-blender-slicer-backup,
.g3dv__member-card.is-verdict-reclaim-engine-derived-cache {
	border-inline-start: 4px solid #0f5132;
}

.g3dv__member-card.is-verdict-consolidate-pbr-downscale,
.g3dv__member-card.is-verdict-consolidate-to-vault-master {
	border-inline-start: 4px solid #0b4a8b;
}

.g3dv__member-card.is-verdict-blocked-scene-master,
.g3dv__member-card.is-verdict-blocked-pbr-master-4k-8k {
	border-inline-start: 4px solid #842029;
}

.g3dv__member-card.is-verdict-blocked-unverified-scene-master,
.g3dv__member-card.is-verdict-blocked-recent-backup,
.g3dv__member-card.is-verdict-blocked-fresh-engine-cache,
.g3dv__member-card.is-verdict-blocked-not-engine-cache,
.g3dv__member-card.is-verdict-blocked-not-blender-backup,
.g3dv__member-card.is-verdict-blocked-manual-shield,
.g3dv__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.g3dv__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.g3dv__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.g3dv__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	padding-block: 6px;
	font-weight: 700;
	font-size: 0.86rem;
	line-height: 1.4;
	cursor: pointer;
}

.g3dv__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.g3dv__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.g3dv__code-pre {
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

.g3dv__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
