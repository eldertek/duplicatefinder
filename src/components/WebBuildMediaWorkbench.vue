<template>
	<section
		class="web-build-media-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Web Build Output, Responsive Image Pyramid, HLS/DASH Chunks and Source-Map Bloat Auditor')">
		<header class="wbmw__toolbar">
			<div class="wbmw__title-group">
				<h3 class="wbmw__title">
					{{ t('duplicatefinder', 'Web Build Output, Responsive Image Pyramid, HLS/DASH & Source-Map Auditor') }}
				</h3>
				<span
					class="wbmw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {leaks} map leaks', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						leaks: analysis.summary.totalMapLeakCopiesCount,
					}) }}
				</span>
			</div>

			<div class="wbmw__toolbar-actions">
				<button
					type="button"
					class="wbmw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="wbmw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="wbmw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="wbmw__tool-btn is-close"
					aria-keyshortcuts="}"
					:title="t('duplicatefinder', 'Hide Web Build Output, Responsive Image Pyramid, HLS/DASH Chunks and Source-Map Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Web & Media Auditor') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="wbmw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="wbmw__empty-banner"
			role="note">
			<div class="wbmw__empty-text">
				<p class="wbmw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure DAM Source Master and Active CDN guards before scanning') }}
				</p>
				<p class="wbmw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit responsive image pyramids (@2x/@3x/-1280w/_thumb/_640x480/.webp/.avif), HLS/DASH streaming chunks (.ts/.m4s/.m3u8/.mpd/_480p.mp4), .next/.nuxt/dist build caches, and exposed .js.map/.css.map/.tsbuildinfo leaks.') }}
				</p>
			</div>
			<button
				type="button"
				class="wbmw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="wbmw__controls">
			<div class="wbmw__control-row">
				<span class="wbmw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="wbmw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Web build and media audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="wbmw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="wbmw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="wbmw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="wbmw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="wbmw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="wbmw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="wbmw__seg-btn"
					:class="{ 'is-active': protectDamMasters }"
					:aria-pressed="protectDamMasters ? 'true' : 'false'"
					@click="protectDamMasters = !protectDamMasters">
					<span>{{ protectDamMasters ? t('duplicatefinder', 'DAM Source Master Guard: ON') : t('duplicatefinder', 'DAM Source Master Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="wbmw__seg-btn"
					:class="{ 'is-active': protectActiveCdnRelease }"
					:aria-pressed="protectActiveCdnRelease ? 'true' : 'false'"
					@click="protectActiveCdnRelease = !protectActiveCdnRelease">
					<span>{{ protectActiveCdnRelease ? t('duplicatefinder', 'Active CDN Release Guard: ON') : t('duplicatefinder', 'Active CDN Release Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="wbmw__seg-btn"
					:class="{ 'is-active': protectMasterFormats }"
					:aria-pressed="protectMasterFormats ? 'true' : 'false'"
					@click="protectMasterFormats = !protectMasterFormats">
					<span>{{ protectMasterFormats ? t('duplicatefinder', 'Master Format Guard: ON') : t('duplicatefinder', 'Master Format Guard: OFF') }}</span>
				</button>
			</div>

			<div class="wbmw__control-row wbmw__inputs-row">
				<label class="wbmw__field">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="wbmw__input">
						<option value="consolidate-dam-originals">{{ t('duplicatefinder', 'Consolidate to DAM Originals') }}</option>
						<option value="strip-stale-sourcemaps-builds">{{ t('duplicatefinder', 'Strip Exposed Source-Maps & Stale Builds') }}</option>
						<option value="hardlink-shared-asset-chunks">{{ t('duplicatefinder', 'Hardlink Shared Asset & Stream Chunks (POSIX ln -f)') }}</option>
					</select>
				</label>

				<label class="wbmw__field">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="wbmw__input">
						<option value="dam-cdn-authority-first">{{ t('duplicatefinder', 'DAM Master / Active CDN first') }}</option>
						<option value="master-format-first">{{ t('duplicatefinder', 'Master raster / video format first') }}</option>
						<option value="newest-release">{{ t('duplicatefinder', 'Newest release artifact') }}</option>
						<option value="oldest-canonical">{{ t('duplicatefinder', 'Oldest canonical copy') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="wbmw__field">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Stale Build (d)') }}</span>
					<input
						v-model="staleBuildDaysInput"
						type="number"
						min="0"
						step="1"
						class="wbmw__input wbmw__num-input">
				</label>

				<label class="wbmw__field">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="wbmw__input wbmw__num-input">
				</label>

				<label class="wbmw__field wbmw__field-grow">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Filter Asset Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="wbmw__input"
						:placeholder="t('duplicatefinder', 'e.g. @2x, .webp, .avif, .m4s, .next, .js.map, -1280w')">
				</label>

				<label class="wbmw__field wbmw__field-grow">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="wbmw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="wbmw__field">
					<span class="wbmw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="wbmw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Map leak & DAM/CDN risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset / file name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="wbmw__kpis">
			<div class="wbmw__kpi">
				<span class="wbmw__kpi-label">{{ t('duplicatefinder', 'Safe Build & Cache Reclaim') }}</span>
				<strong class="wbmw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="wbmw__kpi">
				<span class="wbmw__kpi-label">{{ t('duplicatefinder', 'DAM Masters & Active CDN') }}</span>
				<strong class="wbmw__kpi-val is-warn">
					{{ analysis.summary.totalDamMasterClusters }} {{ t('duplicatefinder', 'DAM') }} / {{ analysis.summary.totalActiveCdnClusters }} {{ t('duplicatefinder', 'CDN release') }} ({{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }})
				</strong>
			</div>
			<div class="wbmw__kpi">
				<span class="wbmw__kpi-label">{{ t('duplicatefinder', 'Unstripped .map & Symbols') }}</span>
				<strong class="wbmw__kpi-val">
					{{ analysis.summary.totalMapLeakCopiesCount }} {{ t('duplicatefinder', 'map/symbol copies') }}
				</strong>
			</div>
			<div class="wbmw__kpi">
				<span class="wbmw__kpi-label">{{ t('duplicatefinder', 'Raw Web & Media Footprint') }}</span>
				<strong class="wbmw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="wbmw__filters-strip">
			<div
				class="wbmw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by web build and media artifact family')">
				<button
					type="button"
					class="wbmw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All Web & Media Artifacts ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="wbmw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="wbmw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by web build audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="wbmw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="wbmw__empty-banner"
			role="note">
			<div class="wbmw__empty-text">
				<p class="wbmw__empty-title">
					{{ t('duplicatefinder', 'No responsive pyramid, HLS/DASH, build cache, or source-map clusters match the active filters') }}
				</p>
				<p class="wbmw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the artifact family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="wbmw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="wbmw__workstation">
			<div class="wbmw__list-pane">
				<div class="wbmw__pane-header">
					<span class="wbmw__pane-title">
						{{ t('duplicatefinder', 'Web Build, Media Pyramid & Chunk Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="wbmw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="wbmw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="wbmw__cluster-top">
							<span class="wbmw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="wbmw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="wbmw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.assetLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="wbmw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="wbmw__load-more-wrap">
					<button
						type="button"
						class="wbmw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="wbmw__inspector-pane">
				<header class="wbmw__inspector-header">
					<div class="wbmw__inspector-title-wrap">
						<h4 class="wbmw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="wbmw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension }} / {{ selectedCluster.assetLineageStem }}
						</span>
					</div>

					<div class="wbmw__inspector-actions">
						<button
							type="button"
							class="wbmw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="wbmw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.hasUnstrippedMapLeak"
					class="wbmw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'Unstripped Source-Map / Symbol Bloat Detected:') }}</strong>
					{{ t('duplicatefinder', 'Exposed .js.map, .css.map, .d.ts.map, .wasm.map, .tsbuildinfo, or stats.json artifacts inflate sync trees and leak source paths. Add generated .sync-exclude.lst rules and strip stale build maps.') }}
				</div>

				<div
					v-if="selectedCluster.hasDamSourceMaster || selectedCluster.hasActiveCdnRelease"
					class="wbmw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'DAM Source Master & Active CDN Release Guard:') }}</strong>
					{{ t('duplicatefinder', 'Copies inside DAM master vaults or Active CDN release roots are strictly shielded by default unless explicitly overridden by an operator.') }}
				</div>

				<div class="wbmw__meta-grid">
					<div class="wbmw__meta-item">
						<span class="wbmw__meta-label">{{ t('duplicatefinder', 'Asset Lineage Stem') }}</span>
						<span>{{ selectedCluster.assetLineageStem }}</span>
					</div>
					<div class="wbmw__meta-item">
						<span class="wbmw__meta-label">{{ t('duplicatefinder', 'Pyramid, Chunk & Map Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="wbmw__meta-item">
						<span class="wbmw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="wbmw__meta-item">
						<span class="wbmw__meta-label">{{ t('duplicatefinder', 'Canonical Survivor') }}</span>
						<span class="wbmw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="wbmw__meta-item">
						<span class="wbmw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="wbmw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="wbmw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="wbmw__member-top">
							<span class="wbmw__member-name">{{ member.basename }}</span>
							<div class="wbmw__member-badges">
								<span
									class="wbmw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="wbmw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="wbmw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="wbmw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="wbmw__companion-chips">
							<span class="wbmw__companion-chip">{{ member.context.assetLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="wbmw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isDamSourceMaster"
								class="wbmw__companion-chip is-warn">
								{{ t('duplicatefinder', 'DAM Source Master') }}
							</span>
							<span
								v-if="member.context.isActiveCdnRelease"
								class="wbmw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Active CDN Release') }}
							</span>
							<span
								v-if="member.context.isUnstrippedMapLeak"
								class="wbmw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Unstripped Map / Symbol') }}
							</span>
							<span
								v-if="member.context.isResponsiveDerivative"
								class="wbmw__companion-chip">
								{{ t('duplicatefinder', 'Responsive Derivative') }}
							</span>
							<span
								v-if="member.context.isStreamingChunk"
								class="wbmw__companion-chip">
								{{ t('duplicatefinder', 'HLS / DASH Chunk') }}
							</span>
						</div>

						<p class="wbmw__member-note">
							{{ member.note }}
						</p>

						<div class="wbmw__override-bar">
							<span class="wbmw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="wbmw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="wbmw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="wbmw__seg-btn"
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
			class="wbmw__script-box">
			<summary class="wbmw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (SHA-256 Verified + Hardlinks + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="wbmw__script-content">
				<div class="wbmw__script-actions">
					<button
						type="button"
						class="wbmw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="wbmw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="wbmw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="wbmw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	WEB_BUILD_MEDIA_FAMILY_META,
	WEB_BUILD_PRESETS,
	analyzeWebBuildMediaDuplicates,
	buildWebBuildMediaCsvReport,
	buildWebBuildMediaJsonReport,
	buildWebBuildMediaScript,
	buildWebBuildSyncExcludeSnippet,
} from '../tools/webBuildMediaAuditor'

export default {
	name: 'WebBuildMediaWorkbench',
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
			presetId: 'all-web-media-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-dam-originals',
			survivorRule: 'dam-cdn-authority-first',
			protectDamMasters: true,
			protectActiveCdnRelease: true,
			protectMasterFormats: true,
			staleBuildDaysInput: '14',
			minSizeKbInput: '0',
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
			return WEB_BUILD_PRESETS
		},
		familyOptions() {
			return Object.values(WEB_BUILD_MEDIA_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Hardlinkable') },
				{ id: 'dam-masters', label: this.t('duplicatefinder', 'DAM Source Masters') },
				{ id: 'active-cdn', label: this.t('duplicatefinder', 'Active CDN Release') },
				{ id: 'map-leaks', label: this.t('duplicatefinder', 'Unstripped .map Leaks') },
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
		parsedStaleBuildDays() {
			const trimmed = String(this.staleBuildDaysInput ?? '').trim()
			if (!trimmed) {
				return 14
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14
		},
		parsedMinSizeKb() {
			const trimmed = String(this.minSizeKbInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
		},
		analysis() {
			return analyzeWebBuildMediaDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectDamMasters: this.protectDamMasters,
				protectActiveCdnRelease: this.protectActiveCdnRelease,
				protectMasterFormats: this.protectMasterFormats,
				staleBuildDays: this.parsedStaleBuildDays,
				minSizeKb: this.parsedMinSizeKb,
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
			return buildWebBuildMediaScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildWebBuildSyncExcludeSnippet(this.analysis)
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
			const preset = WEB_BUILD_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectDamMasters = preset.protectDamMasters
			this.protectActiveCdnRelease = preset.protectActiveCdnRelease
			this.protectMasterFormats = preset.protectMasterFormats
			this.staleBuildDaysInput = String(preset.staleBuildDays)
			this.minSizeKbInput = String(preset.minSizeKb)
			this.verdictFilter = 'all'
			this.visibleLimit = 25
		},
		resetFilters() {
			this.familyFilter = 'all'
			this.verdictFilter = 'all'
			this.minSizeKbInput = '0'
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
				'map-leak': this.t('duplicatefinder', 'Map Leak'),
				'dam-master': this.t('duplicatefinder', 'DAM Master Guarded'),
				'active-cdn': this.t('duplicatefinder', 'Active CDN Guarded'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-dam-master' || verdict === 'reclaim-map-leak') {
				return 'is-danger'
			}
			if (verdict === 'blocked-active-cdn' || verdict === 'blocked-master-format' || verdict === 'blocked-not-map-or-build' || verdict === 'blocked-manual-shield' || verdict === 'excluded') {
				return 'is-warn'
			}
			if (verdict === 'hardlink-asset-chunk') {
				return 'is-hardlink'
			}
			return 'is-reclaim'
		},
		authorityPillClass(score) {
			if (score >= 85) {
				return 'is-keep'
			}
			if (score >= 50) {
				return 'is-hardlink'
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Web Build, Media Pyramid & HLS/DASH consolidation script to clipboard.'))
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
			const csv = buildWebBuildMediaCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-web-build-media-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Web Build & Media CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildWebBuildMediaJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-web-build-media-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Web Build & Media JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.web-build-media-workbench {
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

.wbmw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.wbmw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.wbmw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.wbmw__status-badge {
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

.wbmw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.wbmw__tool-btn,
.wbmw__seg-btn,
.wbmw__chip,
.wbmw__primary-btn {
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

.wbmw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.wbmw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.wbmw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.wbmw__seg-btn.is-active,
.wbmw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.wbmw__tool-btn:focus-visible,
.wbmw__seg-btn:focus-visible,
.wbmw__chip:focus-visible,
.wbmw__primary-btn:focus-visible,
.wbmw__cluster-item:focus-visible,
.wbmw__input:focus-visible,
.wbmw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.wbmw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.wbmw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.wbmw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.wbmw__empty-banner {
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

.wbmw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.wbmw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.wbmw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.wbmw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.wbmw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.wbmw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.wbmw__segments,
.wbmw__chip-group,
.wbmw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.wbmw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.wbmw__inputs-row {
	align-items: flex-end;
}

.wbmw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.wbmw__field-grow {
	flex: 1 1 200px;
}

.wbmw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.wbmw__input {
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

.wbmw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.wbmw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.wbmw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.wbmw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.wbmw__kpi {
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

.wbmw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.wbmw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.wbmw__kpi-val.is-accent {
	color: #0b4a8b;
}

.wbmw__kpi-val.is-warn {
	color: #7c4a03;
}

.wbmw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.wbmw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.wbmw__list-pane,
.wbmw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.wbmw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wbmw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.wbmw__cluster-list,
.wbmw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wbmw__cluster-item {
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

.wbmw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.wbmw__cluster-top,
.wbmw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.wbmw__cluster-name,
.wbmw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.wbmw__cluster-path,
.wbmw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.wbmw__cluster-meta,
.wbmw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.wbmw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.wbmw__pill.is-risk-map-leak,
.wbmw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.wbmw__pill.is-risk-dam-master,
.wbmw__pill.is-risk-active-cdn,
.wbmw__pill.is-risk-shielded,
.wbmw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.wbmw__pill.is-hardlink {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.wbmw__pill.is-risk-reclaimable,
.wbmw__pill.is-reclaim,
.wbmw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.wbmw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.wbmw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.wbmw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.wbmw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.wbmw__inspector-actions,
.wbmw__override-bar,
.wbmw__member-badges,
.wbmw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.wbmw__companion-chip {
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

.wbmw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.wbmw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.wbmw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.wbmw__meta-grid {
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
	.wbmw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.wbmw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.wbmw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.wbmw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.wbmw__member-card {
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

.wbmw__member-card.is-verdict-keep-canonical-survivor,
.wbmw__member-card.is-verdict-reclaim-build-cache {
	border-inline-start: 4px solid #0f5132;
}

.wbmw__member-card.is-verdict-hardlink-asset-chunk {
	border-inline-start: 4px solid #0b4a8b;
}

.wbmw__member-card.is-verdict-blocked-dam-master,
.wbmw__member-card.is-verdict-reclaim-map-leak {
	border-inline-start: 4px solid #842029;
}

.wbmw__member-card.is-verdict-blocked-active-cdn,
.wbmw__member-card.is-verdict-blocked-master-format,
.wbmw__member-card.is-verdict-blocked-not-map-or-build,
.wbmw__member-card.is-verdict-blocked-manual-shield,
.wbmw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.wbmw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.wbmw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.wbmw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.wbmw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.wbmw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.wbmw__code-pre {
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

.wbmw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
