<template>
	<section
		class="vfx-render-workbench"
		role="region"
		:aria-label="t('duplicatefinder', '3D VFX Scene, Texture Mip Pyramid, Bake Sim Cache and Autosave Auditor')">
		<header class="vrcw__toolbar">
			<div class="vrcw__title-group">
				<h3 class="vrcw__title">
					{{ t('duplicatefinder', '3D VFX Scene, Texture Mip Pyramid, Sim Bake & Autosave Auditor') }}
				</h3>
				<span
					class="vrcw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} master-vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalMasterVaultClusters,
					}) }}
				</span>
			</div>

			<div class="vrcw__toolbar-actions">
				<button
					type="button"
					class="vrcw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="vrcw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="vrcw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="vrcw__tool-btn is-close"
					aria-keyshortcuts="Shift+D"
					:title="t('duplicatefinder', 'Hide 3D VFX Scene, Texture Mip Pyramid, Bake Sim Cache and Autosave Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide 3D & VFX Cache') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="vrcw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="vrcw__empty-banner"
			role="note">
			<div class="vrcw__empty-text">
				<p class="vrcw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure Master-Shot, USD Stage and 4K/8K Texture guards before scanning') }}
				</p>
				<p class="vrcw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit 3D & VFX scene masters (.blend/.hip/.hiplc/.ma/.mb/.c4d/.usd), texture mip pyramids (_8K/_4K vs _2K/_1K/_512/.tx/.dds/.ktx2), sim/bake caches (.bphys/.vdb/.abc/.pc2/.mdd/DerivedDataCache/Bake/LightingData/_preview.exr), and autosave generations (.blend1/.blend2/.autosave/.c4d.bak/.ma.swatches).') }}
				</p>
			</div>
			<button
				type="button"
				class="vrcw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="vrcw__controls">
			<div class="vrcw__control-row">
				<span class="vrcw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="vrcw__segments"
					role="group"
					:aria-label="t('duplicatefinder', '3D and VFX audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="vrcw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="vrcw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="vrcw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="vrcw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="vrcw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="vrcw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="vrcw__seg-btn"
					:class="{ 'is-active': protectShotMasterVault }"
					:aria-pressed="protectShotMasterVault ? 'true' : 'false'"
					@click="protectShotMasterVault = !protectShotMasterVault">
					<span>{{ protectShotMasterVault ? t('duplicatefinder', 'Master-Shot / Final Guard: ON') : t('duplicatefinder', 'Master-Shot / Final Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vrcw__seg-btn"
					:class="{ 'is-active': protectPublishedUsdStage }"
					:aria-pressed="protectPublishedUsdStage ? 'true' : 'false'"
					@click="protectPublishedUsdStage = !protectPublishedUsdStage">
					<span>{{ protectPublishedUsdStage ? t('duplicatefinder', 'Published USD Stage Guard: ON') : t('duplicatefinder', 'Published USD Stage Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="vrcw__seg-btn"
					:class="{ 'is-active': protectHighresTextureSource }"
					:aria-pressed="protectHighresTextureSource ? 'true' : 'false'"
					@click="protectHighresTextureSource = !protectHighresTextureSource">
					<span>{{ protectHighresTextureSource ? t('duplicatefinder', '4K/8K Texture Source Guard: ON') : t('duplicatefinder', '4K/8K Texture Source Guard: OFF') }}</span>
				</button>
			</div>

			<div class="vrcw__control-row vrcw__inputs-row">
				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="vrcw__input">
						<option value="consolidate-shot-master-vault">{{ t('duplicatefinder', 'Consolidate to Master-Shot Vault') }}</option>
						<option value="prune-autosave-bake-caches">{{ t('duplicatefinder', 'Prune Stale Autosave & Sim Caches') }}</option>
						<option value="prune-downscaled-textures-when-source-verified">{{ t('duplicatefinder', 'Prune Downscaled Mips When 4K/8K Verified') }}</option>
					</select>
				</label>

				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="vrcw__input">
						<option value="master-vault-and-usd-first">{{ t('duplicatefinder', 'Master-Shot & USD Stage first') }}</option>
						<option value="highres-texture-first">{{ t('duplicatefinder', 'Verified 4K/8K texture first') }}</option>
						<option value="newest-scene-first">{{ t('duplicatefinder', 'Newest scene timestamp first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Keep Autosaves') }}</span>
					<input
						v-model="keepRecentAutosavesInput"
						type="number"
						min="1"
						step="1"
						class="vrcw__input vrcw__num-input">
				</label>

				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="vrcw__input vrcw__num-input">
				</label>

				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="vrcw__input vrcw__num-input">
				</label>

				<label class="vrcw__field vrcw__field-grow">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Filter Asset Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="vrcw__input"
						:placeholder="t('duplicatefinder', 'e.g. _8K, albedo, .blend, .vdb, DerivedDataCache')">
				</label>

				<label class="vrcw__field vrcw__field-grow">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="vrcw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="vrcw__field">
					<span class="vrcw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="vrcw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Master & texture risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="vrcw__kpis">
			<div class="vrcw__kpi">
				<span class="vrcw__kpi-label">{{ t('duplicatefinder', 'Safe Pipeline Reclaim') }}</span>
				<strong class="vrcw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="vrcw__kpi">
				<span class="vrcw__kpi-label">{{ t('duplicatefinder', 'Master-Shot & 4K/8K Sources') }}</span>
				<strong class="vrcw__kpi-val is-warn">
					{{ analysis.summary.totalMasterVaultClusters }} {{ t('duplicatefinder', 'master/USD') }} / {{ analysis.summary.totalHighresSourceClusters }} {{ t('duplicatefinder', '4K/8K sources') }}
				</strong>
			</div>
			<div class="vrcw__kpi">
				<span class="vrcw__kpi-label">{{ t('duplicatefinder', 'Mip Twins & Sim/Autosaves') }}</span>
				<strong class="vrcw__kpi-val">
					{{ analysis.summary.totalMipDownscaleClusters }} {{ t('duplicatefinder', 'mip twins') }} / {{ analysis.summary.totalAutosaveBakeClusters }} {{ t('duplicatefinder', 'bake/autosaves') }}
				</strong>
			</div>
			<div class="vrcw__kpi">
				<span class="vrcw__kpi-label">{{ t('duplicatefinder', 'Raw VFX Footprint') }}</span>
				<strong class="vrcw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="vrcw__filters-strip">
			<div
				class="vrcw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by 3D and VFX artifact family')">
				<button
					type="button"
					class="vrcw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All 3D & VFX ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="vrcw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="vrcw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by VFX audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="vrcw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="vrcw__empty-banner"
			role="note">
			<div class="vrcw__empty-text">
				<p class="vrcw__empty-title">
					{{ t('duplicatefinder', 'No 3D scene masters, texture mip pyramids, sim/bake caches, or autosave generations match the active filters') }}
				</p>
				<p class="vrcw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the VFX family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="vrcw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="vrcw__workstation">
			<div class="vrcw__list-pane">
				<div class="vrcw__pane-header">
					<span class="vrcw__pane-title">
						{{ t('duplicatefinder', '3D Scene, Mip & Cache Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="vrcw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="vrcw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="vrcw__cluster-top">
							<span class="vrcw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="vrcw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="vrcw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.assetLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="vrcw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="vrcw__load-more-wrap">
					<button
						type="button"
						class="vrcw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="vrcw__inspector-pane">
				<header class="vrcw__inspector-header">
					<div class="vrcw__inspector-title-wrap">
						<h4 class="vrcw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="vrcw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.assetLineageStem }}
						</span>
					</div>

					<div class="vrcw__inspector-actions">
						<button
							type="button"
							class="vrcw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="vrcw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-highres'"
					class="vrcw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'High-Res 4K/8K Texture Conservation Guard:') }}</strong>
					{{ t('duplicatefinder', 'Downscaled mip textures (_2K/_1K/_512 or .tx/.dds/.ktx2) are strictly blocked from deletion whenever no verified 4K/8K source sharing the same assetLineageStem is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasMasterVault || selectedCluster.hasUsdStage || selectedCluster.hasHighresSource"
					class="vrcw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Master-Shot, USD Stage & 4K/8K Source Guard:') }}</strong>
					{{ t('duplicatefinder', 'Master-Shot/Final scenes (.blend/.hip/.ma/.c4d), Published USD stages (.usd/.usda/.usdc/.usdz), and 4K/8K texture sources are strictly protected by default.') }}
				</div>

				<div class="vrcw__meta-grid">
					<div class="vrcw__meta-item">
						<span class="vrcw__meta-label">{{ t('duplicatefinder', 'Asset Lineage Stem') }}</span>
						<span>{{ selectedCluster.assetLineageStem }}</span>
					</div>
					<div class="vrcw__meta-item">
						<span class="vrcw__meta-label">{{ t('duplicatefinder', 'Pipeline & Format Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="vrcw__meta-item">
						<span class="vrcw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="vrcw__meta-item">
						<span class="vrcw__meta-label">{{ t('duplicatefinder', 'Canonical VFX Anchor') }}</span>
						<span class="vrcw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="vrcw__meta-item">
						<span class="vrcw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="vrcw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="vrcw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="vrcw__member-top">
							<span class="vrcw__member-name">{{ member.basename }}</span>
							<div class="vrcw__member-badges">
								<span
									class="vrcw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="vrcw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="vrcw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="vrcw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="vrcw__companion-chips">
							<span class="vrcw__companion-chip">{{ member.context.assetLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="vrcw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isShotMasterVault"
								class="vrcw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Master-Shot / Final') }}
							</span>
							<span
								v-if="member.context.isPublishedUsdStage"
								class="vrcw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Published USD Stage') }}
							</span>
							<span
								v-if="member.context.isHighresTextureSource"
								class="vrcw__companion-chip">
								{{ t('duplicatefinder', 'Verified 4K/8K Source') }}
							</span>
							<span
								v-if="member.context.isMipDownscaleTwin"
								class="vrcw__companion-chip">
								{{ member.context.hasVerifiedHighresSource ? t('duplicatefinder', '4K/8K Source Verified') : t('duplicatefinder', 'No 4K/8K Source Conserved') }}
							</span>
							<span
								v-if="member.context.isAutosaveOrBake"
								class="vrcw__companion-chip">
								{{ member.context.isAutosaveGeneration ? t('duplicatefinder', 'Autosave Generation') : t('duplicatefinder', 'Sim / Bake Cache') }}
							</span>
						</div>

						<p class="vrcw__member-note">
							{{ member.note }}
						</p>

						<div class="vrcw__override-bar">
							<span class="vrcw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="vrcw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="vrcw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="vrcw__seg-btn"
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
			class="vrcw__script-box">
			<summary class="vrcw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="vrcw__script-content">
				<div class="vrcw__script-actions">
					<button
						type="button"
						class="vrcw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="vrcw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="vrcw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="vrcw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	VFX_RENDER_FAMILY_META,
	VFX_RENDER_PRESETS,
	analyzeVfxRenderDuplicates,
	buildVfxRenderCsvReport,
	buildVfxRenderJsonReport,
	buildVfxRenderScript,
	buildVfxRenderSyncExcludeSnippet,
} from '../tools/vfxRenderCacheAuditor'

export default {
	name: 'VfxRenderCacheWorkbench',
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
			presetId: 'all-vfx-render-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-shot-master-vault',
			survivorRule: 'master-vault-and-usd-first',
			protectShotMasterVault: true,
			protectPublishedUsdStage: true,
			protectHighresTextureSource: true,
			keepRecentAutosavesInput: '2',
			staleCacheDaysInput: '30',
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
			return VFX_RENDER_PRESETS
		},
		familyOptions() {
			return Object.values(VFX_RENDER_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'master-vault', label: this.t('duplicatefinder', 'Master-Shot / Final') },
				{ id: 'usd-stage', label: this.t('duplicatefinder', 'Published USD Stages') },
				{ id: 'highres-source', label: this.t('duplicatefinder', '4K/8K Texture Sources') },
				{ id: 'mip-downscale', label: this.t('duplicatefinder', 'Downscaled Mips') },
				{ id: 'autosave-bake', label: this.t('duplicatefinder', 'Sim & Autosave Caches') },
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
		parsedKeepRecentAutosaves() {
			const trimmed = String(this.keepRecentAutosavesInput ?? '').trim()
			if (!trimmed) {
				return 2
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 1 ? parsed : 2
		},
		parsedStaleCacheDays() {
			const trimmed = String(this.staleCacheDaysInput ?? '').trim()
			if (!trimmed) {
				return 30
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 30
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
			return analyzeVfxRenderDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectShotMasterVault: this.protectShotMasterVault,
				protectPublishedUsdStage: this.protectPublishedUsdStage,
				protectHighresTextureSource: this.protectHighresTextureSource,
				keepRecentAutosaves: this.parsedKeepRecentAutosaves,
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
			return buildVfxRenderScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildVfxRenderSyncExcludeSnippet(this.analysis)
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
			const preset = VFX_RENDER_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectShotMasterVault = preset.protectShotMasterVault
			this.protectPublishedUsdStage = preset.protectPublishedUsdStage
			this.protectHighresTextureSource = preset.protectHighresTextureSource
			this.keepRecentAutosavesInput = String(preset.keepRecentAutosaves)
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
				'master-vault': this.t('duplicatefinder', 'Master-Shot Vaulted'),
				'usd-stage': this.t('duplicatefinder', 'USD Stage Guarded'),
				'highres-source': this.t('duplicatefinder', '4K/8K Source'),
				'unverified-highres': this.t('duplicatefinder', '4K/8K Unverified'),
				'mip-verified': this.t('duplicatefinder', 'Mip Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-shot-master-vault' || verdict === 'blocked-published-usd-stage') {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-highres-texture-source'
				|| verdict === 'blocked-unverified-highres-source'
				|| verdict === 'blocked-not-autosave-bake-cache'
				|| verdict === 'blocked-fresh-autosave-bake-cache'
				|| verdict === 'blocked-not-mip-downscale'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-shot-master-vault') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 3D & VFX remediation script to clipboard.'))
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
			const csv = buildVfxRenderCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-vfx-render-cache-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe 3D & VFX CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildVfxRenderJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-vfx-render-cache-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported 3D & VFX JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.vfx-render-workbench {
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
}

.vrcw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.vrcw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.vrcw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.vrcw__status-badge {
	display: inline-flex;
	align-items: center;
	padding-block: 4px;
	padding-inline: 10px;
	border-radius: 999px;
	background-color: var(--color-background-hover);
	border: 1px solid var(--color-border);
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
	max-inline-size: 100%;
	overflow-wrap: anywhere;
}

.vrcw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vrcw__tool-btn,
.vrcw__seg-btn,
.vrcw__chip,
.vrcw__primary-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-block-size: 44px;
	min-inline-size: 44px;
	padding-block: 8px;
	padding-inline: 14px;
	border-radius: var(--border-radius, 8px);
	border: 1px solid var(--color-border-dark, var(--color-border));
	background-color: var(--color-background-hover);
	color: var(--color-main-text);
	font-size: 0.85rem;
	font-weight: 600;
	cursor: pointer;
	box-sizing: border-box;
	transition: background-color 0.15s ease, border-color 0.15s ease;
}

.vrcw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.vrcw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.vrcw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.vrcw__seg-btn.is-active,
.vrcw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.vrcw__tool-btn:focus-visible,
.vrcw__seg-btn:focus-visible,
.vrcw__chip:focus-visible,
.vrcw__primary-btn:focus-visible,
.vrcw__cluster-item:focus-visible,
.vrcw__input:focus-visible,
.vrcw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.vrcw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.vrcw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.vrcw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.vrcw__empty-banner {
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

.vrcw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.vrcw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.vrcw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.vrcw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.vrcw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vrcw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vrcw__segments,
.vrcw__chip-group,
.vrcw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.vrcw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.vrcw__inputs-row {
	align-items: flex-end;
}

.vrcw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.vrcw__field-grow {
	flex: 1 1 200px;
}

.vrcw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.vrcw__input {
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

.vrcw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.vrcw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.vrcw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.vrcw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.vrcw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding-block: 10px;
	padding-inline: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vrcw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.vrcw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vrcw__kpi-val.is-accent {
	color: #0b4a8b;
}

.vrcw__kpi-val.is-warn {
	color: #7c4a03;
}

.vrcw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.vrcw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.vrcw__list-pane,
.vrcw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.vrcw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vrcw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.vrcw__cluster-list,
.vrcw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.vrcw__cluster-item {
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

.vrcw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.vrcw__cluster-top,
.vrcw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.vrcw__cluster-name,
.vrcw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.vrcw__cluster-path,
.vrcw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vrcw__cluster-meta,
.vrcw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.vrcw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.vrcw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.vrcw__pill.is-risk-master-vault,
.vrcw__pill.is-risk-unverified-highres,
.vrcw__pill.is-risk-shielded,
.vrcw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.vrcw__pill.is-risk-usd-stage,
.vrcw__pill.is-risk-highres-source,
.vrcw__pill.is-risk-mip-verified,
.vrcw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.vrcw__pill.is-risk-reclaimable,
.vrcw__pill.is-reclaim,
.vrcw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.vrcw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.vrcw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.vrcw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.vrcw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.vrcw__inspector-actions,
.vrcw__override-bar,
.vrcw__member-badges,
.vrcw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.vrcw__companion-chip {
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

.vrcw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.vrcw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vrcw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.vrcw__meta-grid {
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
	.vrcw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.vrcw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.vrcw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.vrcw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.vrcw__member-card {
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

.vrcw__member-card.is-verdict-keep-canonical-survivor,
.vrcw__member-card.is-verdict-reclaim-autosave-bake-cache,
.vrcw__member-card.is-verdict-reclaim-downscale-mip {
	border-inline-start: 4px solid #0f5132;
}

.vrcw__member-card.is-verdict-consolidate-to-shot-master-vault {
	border-inline-start: 4px solid #0b4a8b;
}

.vrcw__member-card.is-verdict-blocked-shot-master-vault,
.vrcw__member-card.is-verdict-blocked-published-usd-stage {
	border-inline-start: 4px solid #842029;
}

.vrcw__member-card.is-verdict-blocked-highres-texture-source,
.vrcw__member-card.is-verdict-blocked-unverified-highres-source,
.vrcw__member-card.is-verdict-blocked-not-autosave-bake-cache,
.vrcw__member-card.is-verdict-blocked-fresh-autosave-bake-cache,
.vrcw__member-card.is-verdict-blocked-not-mip-downscale,
.vrcw__member-card.is-verdict-blocked-manual-shield,
.vrcw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.vrcw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.vrcw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.vrcw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.vrcw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.vrcw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.vrcw__code-pre {
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

.vrcw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
