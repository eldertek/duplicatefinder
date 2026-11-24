<template>
	<section
		class="photo-raw-catalog-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'RAW Photography Catalog, Preview Pyramid, Sidecar and Export Derivative Auditor')">
		<header class="prw__toolbar">
			<div class="prw__title-group">
				<h3 class="prw__title">
					{{ t('duplicatefinder', 'RAW Photography Catalog, Preview Pyramid & Sidecar Auditor') }}
				</h3>
				<span
					class="prw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} reclaimable / {vault} RAW-vaulted', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						vault: analysis.summary.totalRawVaultClusters,
					}) }}
				</span>
			</div>

			<div class="prw__toolbar-actions">
				<button
					type="button"
					class="prw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="prw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="prw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="prw__tool-btn is-close"
					aria-keyshortcuts="Shift+P"
					:title="t('duplicatefinder', 'Hide RAW Photography Catalog, Preview Pyramid, Sidecar and Export Derivative Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide RAW & Previews') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="prw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="prw__empty-banner"
			role="note">
			<div class="prw__empty-text">
				<p class="prw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure RAW Selects Vault, Camera RAW Original and Sidecar Edit guards before scanning') }}
				</p>
				<p class="prw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit camera RAW masters (.cr3/.cr2/.nef/.arw/.raf/.orf/.rw2/.dng/.pef/.srw), Lightroom/Capture One preview pyramids (Previews.lrdata/Smart Previews.lrdata/.lrcat-wal/.cos/.cot/*.thumbnail.jpg), developed exports (_export/_web_2048px/_instagram/_print/.jpg/.heic/.tif), and edit sidecars (.xmp/.dop/.pp3/.acr).') }}
				</p>
			</div>
			<button
				type="button"
				class="prw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="prw__controls">
			<div class="prw__control-row">
				<span class="prw__control-label">{{ t('duplicatefinder', 'Audit Preset') }}</span>
				<div
					class="prw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Photo RAW catalog audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="prw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="prw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="prw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="prw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="prw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="prw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="prw__seg-btn"
					:class="{ 'is-active': protectRawSelectsVault }"
					:aria-pressed="protectRawSelectsVault ? 'true' : 'false'"
					@click="protectRawSelectsVault = !protectRawSelectsVault">
					<span>{{ protectRawSelectsVault ? t('duplicatefinder', 'RAW Selects Vault Guard: ON') : t('duplicatefinder', 'RAW Selects Vault Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="prw__seg-btn"
					:class="{ 'is-active': protectCameraRawOriginal }"
					:aria-pressed="protectCameraRawOriginal ? 'true' : 'false'"
					@click="protectCameraRawOriginal = !protectCameraRawOriginal">
					<span>{{ protectCameraRawOriginal ? t('duplicatefinder', 'Camera RAW Guard: ON') : t('duplicatefinder', 'Camera RAW Guard: OFF') }}</span>
				</button>

				<button
					type="button"
					class="prw__seg-btn"
					:class="{ 'is-active': protectSidecarEditOrigin }"
					:aria-pressed="protectSidecarEditOrigin ? 'true' : 'false'"
					@click="protectSidecarEditOrigin = !protectSidecarEditOrigin">
					<span>{{ protectSidecarEditOrigin ? t('duplicatefinder', 'Sidecar Edit Guard: ON') : t('duplicatefinder', 'Sidecar Edit Guard: OFF') }}</span>
				</button>
			</div>

			<div class="prw__control-row prw__inputs-row">
				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="prw__input">
						<option value="consolidate-raw-selects">{{ t('duplicatefinder', 'Consolidate RAW Selects & Catalogs') }}</option>
						<option value="prune-catalog-preview-pyramids">{{ t('duplicatefinder', 'Prune Catalog Preview Pyramids') }}</option>
						<option value="prune-web-exports-when-raw-verified">{{ t('duplicatefinder', 'Prune Web Exports When RAW Verified') }}</option>
					</select>
				</label>

				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="prw__input">
						<option value="raw-vault-and-sidecar-first">{{ t('duplicatefinder', 'RAW Selects & Sidecars first') }}</option>
						<option value="camera-raw-original-first">{{ t('duplicatefinder', 'Camera RAW Original first') }}</option>
						<option value="sidecar-edit-first">{{ t('duplicatefinder', 'Sidecar Edit Origin first') }}</option>
						<option value="newest-shoot-first">{{ t('duplicatefinder', 'Newest shoot timestamp first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Keep Previews') }}</span>
					<input
						v-model="keepRecentPreviewsInput"
						type="number"
						min="1"
						step="1"
						class="prw__input prw__num-input">
				</label>

				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Stale Cache (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="prw__input prw__num-input">
				</label>

				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="prw__input prw__num-input">
				</label>

				<label class="prw__field prw__field-grow">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Filter Shot Stem, Tag or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="prw__input"
						:placeholder="t('duplicatefinder', 'e.g. cr3, Previews.lrdata, _web_2048px, .xmp, RAW-Masters')">
				</label>

				<label class="prw__field prw__field-grow">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="prw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="prw__field">
					<span class="prw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="prw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'RAW & sidecar risk') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Photo asset name (A-Z)') }}</option>
					</select>
				</label>
			</div>
		</div>

		<div class="prw__kpis">
			<div class="prw__kpi">
				<span class="prw__kpi-label">{{ t('duplicatefinder', 'Safe Photo Reclaim') }}</span>
				<strong class="prw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="prw__kpi">
				<span class="prw__kpi-label">{{ t('duplicatefinder', 'RAW Vaults & Sidecar Origins') }}</span>
				<strong class="prw__kpi-val is-warn">
					{{ analysis.summary.totalRawVaultClusters }} {{ t('duplicatefinder', 'RAW vaults') }} / {{ analysis.summary.totalProtectedRawAndSidecarClusters }} {{ t('duplicatefinder', 'RAW & sidecars') }}
				</strong>
			</div>
			<div class="prw__kpi">
				<span class="prw__kpi-label">{{ t('duplicatefinder', 'Developed Exports & Previews') }}</span>
				<strong class="prw__kpi-val">
					{{ analysis.summary.totalExportTwinClusters }} {{ t('duplicatefinder', 'exports') }} / {{ analysis.summary.totalPreviewCacheClusters }} {{ t('duplicatefinder', 'previews') }}
				</strong>
			</div>
			<div class="prw__kpi">
				<span class="prw__kpi-label">{{ t('duplicatefinder', 'Raw Catalog Footprint') }}</span>
				<strong class="prw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty"
			class="prw__filters-strip">
			<div
				class="prw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by photo catalog artifact family')">
				<button
					type="button"
					class="prw__chip"
					:class="{ 'is-active': familyFilter === 'all' }"
					:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
					@click="familyFilter = 'all'">
					<span>{{ t('duplicatefinder', 'All RAW & Previews ({count})', { count: analysis.summary.familyCounts.all || 0 }) }}</span>
				</button>
				<button
					v-for="familyItem in familyOptions"
					:key="familyItem.id"
					type="button"
					class="prw__chip"
					:class="{ 'is-active': familyFilter === familyItem.id }"
					:aria-pressed="familyFilter === familyItem.id ? 'true' : 'false'"
					@click="familyFilter = familyItem.id">
					<span>{{ familyItem.label }} ({{ analysis.summary.familyCounts[familyItem.id] || 0 }})</span>
				</button>
			</div>

			<div
				class="prw__chip-group"
				role="group"
				:aria-label="t('duplicatefinder', 'Filter by photo catalog audit verdict')">
				<button
					v-for="verdictOpt in verdictFilterOptions"
					:key="verdictOpt.id"
					type="button"
					class="prw__chip"
					:class="{ 'is-active': verdictFilter === verdictOpt.id }"
					:aria-pressed="verdictFilter === verdictOpt.id ? 'true' : 'false'"
					@click="verdictFilter = verdictOpt.id">
					<span>{{ verdictOpt.label }}</span>
				</button>
			</div>
		</div>

		<div
			v-if="!sourcePoolEmpty && analysis.clusters.length === 0"
			class="prw__empty-banner"
			role="note">
			<div class="prw__empty-text">
				<p class="prw__empty-title">
					{{ t('duplicatefinder', 'No camera RAW masters, preview pyramids, developed exports, or sidecar files match the active filters') }}
				</p>
				<p class="prw__empty-hint">
					{{ t('duplicatefinder', 'Adjust the photo catalog family filter, lower minimum size, or clear the search query to inspect other duplicate groups.') }}
				</p>
			</div>
			<button
				type="button"
				class="prw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset Filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="prw__workstation">
			<div class="prw__list-pane">
				<div class="prw__pane-header">
					<span class="prw__pane-title">
						{{ t('duplicatefinder', 'RAW, Preview & Export Clusters ({count})', { count: analysis.clusters.length }) }}
					</span>
				</div>

				<div class="prw__cluster-list">
					<button
						v-for="cluster in visibleClusters"
						:key="cluster.groupKey"
						type="button"
						class="prw__cluster-item"
						:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
						@click="selectedClusterKey = cluster.groupKey">
						<div class="prw__cluster-top">
							<span class="prw__cluster-name">{{ cluster.displayName }}</span>
							<span
								class="prw__pill"
								:class="`is-risk-${cluster.clusterRiskState}`">
								{{ formatRiskLabel(cluster.clusterRiskState) }}
							</span>
						</div>
						<div class="prw__cluster-meta">
							<span>{{ cluster.familyLabel }}</span>
							<span>{{ cluster.shotLineageStem }}</span>
							<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
							<span>{{ cluster.formattedReclaimableBytes }}</span>
						</div>
						<div
							v-if="cluster.survivor"
							class="prw__cluster-path">
							{{ cluster.survivor.normalizedPath }}
						</div>
					</button>
				</div>

				<div
					v-if="analysis.clusters.length > visibleLimit"
					class="prw__load-more-wrap">
					<button
						type="button"
						class="prw__tool-btn"
						@click="visibleLimit += 25">
						<span>{{ t('duplicatefinder', 'Load more ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="selectedCluster"
				class="prw__inspector-pane">
				<header class="prw__inspector-header">
					<div class="prw__inspector-title-wrap">
						<h4 class="prw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<span class="prw__inspector-sub">
							{{ selectedCluster.familyLabel }} / .{{ selectedCluster.extension || 'dir' }} / {{ selectedCluster.shotLineageStem }}
						</span>
					</div>

					<div class="prw__inspector-actions">
						<button
							type="button"
							class="prw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Focus Group') }}</span>
						</button>
						<button
							type="button"
							class="prw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Compare Copies') }}</span>
						</button>
					</div>
				</header>

				<div
					v-if="selectedCluster.clusterRiskState === 'unverified-raw'"
					class="prw__warn-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'RAW Master Conservation Guard:') }}</strong>
					{{ t('duplicatefinder', 'Developed JPEG, HEIC, and TIFF exports (_export/_web_2048px/_instagram/_print) are strictly blocked from deletion whenever no verified camera RAW master sharing the same shotLineageStem is conserved.') }}
				</div>

				<div
					v-if="selectedCluster.hasRawSelectsVault || selectedCluster.hasCameraRawOriginal || selectedCluster.hasSidecarEditOrigin"
					class="prw__info-banner"
					role="note">
					<strong>{{ t('duplicatefinder', 'RAW Selects Vault, Camera RAW & Sidecar Edit Guard:') }}</strong>
					{{ t('duplicatefinder', 'RAW-Masters/Selects-Picked originals (.cr3/.cr2/.nef/.arw/.raf/.orf/.rw2/.dng/.pef/.srw) and edit sidecar files (.xmp/.dop/.pp3/.acr) are strictly protected by default.') }}
				</div>

				<div class="prw__meta-grid">
					<div class="prw__meta-item">
						<span class="prw__meta-label">{{ t('duplicatefinder', 'Shot Lineage Stem') }}</span>
						<span>{{ selectedCluster.shotLineageStem }}</span>
					</div>
					<div class="prw__meta-item">
						<span class="prw__meta-label">{{ t('duplicatefinder', 'Catalog & Format Tags') }}</span>
						<span>{{ selectedCluster.artifactSummary }}</span>
					</div>
					<div class="prw__meta-item">
						<span class="prw__meta-label">{{ t('duplicatefinder', 'Governance Tiers Present') }}</span>
						<span>{{ selectedCluster.governanceSummary }}</span>
					</div>
					<div class="prw__meta-item">
						<span class="prw__meta-label">{{ t('duplicatefinder', 'Canonical Photo Anchor') }}</span>
						<span class="prw__mono-text">{{ selectedCluster.survivor ? selectedCluster.survivor.normalizedPath : '-' }}</span>
					</div>
					<div class="prw__meta-item">
						<span class="prw__meta-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<span>{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableCopiesCount }} / {{ selectedCluster.copyCount }})</span>
					</div>
				</div>

				<div class="prw__member-list">
					<article
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="prw__member-card"
						:class="`is-verdict-${member.verdict}`">
						<div class="prw__member-top">
							<span class="prw__member-name">{{ member.basename }}</span>
							<div class="prw__member-badges">
								<span
									class="prw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdictLabel }}
								</span>
								<span
									class="prw__pill"
									:class="authorityPillClass(member.context.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.context.authorityScore }) }}
								</span>
							</div>
						</div>

						<div class="prw__member-path">
							{{ member.normalizedPath }}
						</div>

						<div class="prw__member-meta">
							<span>{{ member.tierLabel }}</span>
							<span>{{ member.formattedSize }}</span>
							<span v-if="member.context.ageDays !== null">{{ member.context.ageDays }}d {{ t('duplicatefinder', 'old') }}</span>
							<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
						</div>

						<div class="prw__companion-chips">
							<span class="prw__companion-chip">{{ member.context.shotLineageStem }}</span>
							<span
								v-if="member.context.artifactTag !== 'none'"
								class="prw__companion-chip">
								{{ member.context.artifactTag }}
							</span>
							<span
								v-if="member.context.isRawSelectsVault"
								class="prw__companion-chip is-warn">
								{{ t('duplicatefinder', 'RAW Selects Vault') }}
							</span>
							<span
								v-if="member.context.isCameraRawOriginal"
								class="prw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Camera RAW Original') }}
							</span>
							<span
								v-if="member.context.isSidecarEditOrigin"
								class="prw__companion-chip is-warn">
								{{ t('duplicatefinder', 'Sidecar Edit Origin') }}
							</span>
							<span
								v-if="member.context.isDevelopedExportTwin"
								class="prw__companion-chip">
								{{ member.context.hasVerifiedRawMaster ? t('duplicatefinder', 'RAW Master Verified') : t('duplicatefinder', 'No RAW Master Conserved') }}
							</span>
							<span
								v-if="member.context.isPreviewThumbnailCache"
								class="prw__companion-chip">
								{{ member.context.isStalePreviewCache ? t('duplicatefinder', 'Stale Preview Cache') : t('duplicatefinder', 'Fresh Preview Cache') }}
							</span>
						</div>

						<p class="prw__member-note">
							{{ member.note }}
						</p>

						<div class="prw__override-bar">
							<span class="prw__control-label">{{ t('duplicatefinder', 'Operator Override:') }}</span>
							<button
								type="button"
								class="prw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'auto' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'auto' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'auto')">
								<span>{{ t('duplicatefinder', 'Auto') }}</span>
							</button>
							<button
								type="button"
								class="prw__seg-btn"
								:class="{ 'is-active': getMemberOverride(member.selectionKey) === 'force-keep' }"
								:aria-pressed="getMemberOverride(member.selectionKey) === 'force-keep' ? 'true' : 'false'"
								@click="setMemberOverride(member.selectionKey, 'force-keep')">
								<span>{{ t('duplicatefinder', 'Shield Copy') }}</span>
							</button>
							<button
								type="button"
								class="prw__seg-btn"
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
			class="prw__script-box">
			<summary class="prw__script-summary">
				{{ t('duplicatefinder', 'POSIX DRY_RUN=1 Script (sha256sum -- + stat cross-device + occ files:scan) & .sync-exclude.lst') }}
			</summary>
			<div class="prw__script-content">
				<div class="prw__script-actions">
					<button
						type="button"
						class="prw__tool-btn"
						@click="copyRemediationScript">
						<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
					</button>
					<button
						type="button"
						class="prw__tool-btn"
						@click="copySyncExcludeSnippet">
						<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
					</button>
				</div>
				<pre class="prw__code-pre"><code>{{ generatedScript }}</code></pre>
				<pre class="prw__code-pre"><code>{{ generatedSyncExclude }}</code></pre>
			</div>
		</details>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	PHOTO_RAW_CATALOG_FAMILY_META,
	PHOTO_RAW_CATALOG_PRESETS,
	analyzePhotoRawCatalogDuplicates,
	buildPhotoRawCatalogCsvReport,
	buildPhotoRawCatalogJsonReport,
	buildPhotoRawCatalogScript,
	buildPhotoRawCatalogSyncExcludeSnippet,
} from '../tools/photoRawCatalogAuditor'

export default {
	name: 'PhotoRawCatalogWorkbench',
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
			presetId: 'all-photo-raw-catalog-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'consolidate-raw-selects',
			survivorRule: 'raw-vault-and-sidecar-first',
			protectRawSelectsVault: true,
			protectCameraRawOriginal: true,
			protectSidecarEditOrigin: true,
			keepRecentPreviewsInput: '2',
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
			return PHOTO_RAW_CATALOG_PRESETS
		},
		familyOptions() {
			return Object.values(PHOTO_RAW_CATALOG_FAMILY_META)
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable / Consolidatable') },
				{ id: 'raw-vault', label: this.t('duplicatefinder', 'RAW Selects Vaults') },
				{ id: 'camera-raw', label: this.t('duplicatefinder', 'Camera RAW Originals') },
				{ id: 'sidecar-origin', label: this.t('duplicatefinder', 'Sidecar Edit Origins') },
				{ id: 'export-twin', label: this.t('duplicatefinder', 'Developed Export Twins') },
				{ id: 'preview-cache', label: this.t('duplicatefinder', 'Preview Pyramids & Caches') },
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
		parsedKeepRecentPreviews() {
			const trimmed = String(this.keepRecentPreviewsInput ?? '').trim()
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
			return analyzePhotoRawCatalogDuplicates(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectRawSelectsVault: this.protectRawSelectsVault,
				protectCameraRawOriginal: this.protectCameraRawOriginal,
				protectSidecarEditOrigin: this.protectSidecarEditOrigin,
				keepRecentPreviews: this.parsedKeepRecentPreviews,
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
			return buildPhotoRawCatalogScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildPhotoRawCatalogSyncExcludeSnippet(this.analysis)
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
			const preset = PHOTO_RAW_CATALOG_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectRawSelectsVault = preset.protectRawSelectsVault
			this.protectCameraRawOriginal = preset.protectCameraRawOriginal
			this.protectSidecarEditOrigin = preset.protectSidecarEditOrigin
			this.keepRecentPreviewsInput = String(preset.keepRecentPreviews)
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
				'raw-vault': this.t('duplicatefinder', 'RAW Vaulted'),
				'camera-raw': this.t('duplicatefinder', 'Camera RAW'),
				'sidecar-origin': this.t('duplicatefinder', 'Sidecar Edit'),
				'unverified-raw': this.t('duplicatefinder', 'RAW Unverified'),
				'raw-verified': this.t('duplicatefinder', 'RAW Verified'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (
				verdict === 'blocked-raw-selects-vault'
				|| verdict === 'blocked-camera-raw-original'
				|| verdict === 'blocked-sidecar-edit-origin'
			) {
				return 'is-danger'
			}
			if (
				verdict === 'blocked-unverified-raw-master'
				|| verdict === 'blocked-not-preview-pyramid'
				|| verdict === 'blocked-not-developed-export'
				|| verdict === 'blocked-fresh-preview-cache'
				|| verdict === 'blocked-manual-shield'
				|| verdict === 'excluded'
			) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-to-raw-vault') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 RAW Photography & Preview remediation script to clipboard.'))
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
			const csv = buildPhotoRawCatalogCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-photo-raw-catalog-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe RAW Photography & Preview CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildPhotoRawCatalogJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-photo-raw-catalog-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported RAW Photography & Preview JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.photo-raw-catalog-workbench {
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

.prw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.prw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.prw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.prw__status-badge {
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

.prw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.prw__tool-btn,
.prw__seg-btn,
.prw__chip,
.prw__primary-btn {
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

.prw__primary-btn {
	background-color: var(--color-primary-element, #0082c9);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-text, #ffffff);
}

.prw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.prw__tool-btn.is-primary-outline {
	border-color: var(--color-primary-element, #0082c9);
}

.prw__seg-btn.is-active,
.prw__chip.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element, #0082c9);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.prw__tool-btn:focus-visible,
.prw__seg-btn:focus-visible,
.prw__chip:focus-visible,
.prw__primary-btn:focus-visible,
.prw__cluster-item:focus-visible,
.prw__input:focus-visible,
.prw__script-summary:focus-visible {
	outline: 2px solid var(--color-primary-element, #0082c9);
	outline-offset: 2px;
}

.prw__notice {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	font-size: 0.86rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.prw__notice.is-success {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.prw__notice.is-error {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.prw__empty-banner {
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

.prw__empty-text {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
	max-inline-size: 68ch;
}

.prw__empty-title {
	margin: 0;
	font-weight: 700;
	font-size: 0.94rem;
}

.prw__empty-hint {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-maxcontrast);
	line-height: 1.45;
}

.prw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
}

.prw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.prw__control-label {
	font-size: 0.82rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.prw__segments,
.prw__chip-group,
.prw__filters-strip {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.prw__filters-strip {
	flex-direction: column;
	gap: 8px;
}

.prw__inputs-row {
	align-items: flex-end;
}

.prw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.prw__field-grow {
	flex: 1 1 200px;
}

.prw__field-label {
	font-size: 0.78rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
}

.prw__input {
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

.prw__num-input {
	inline-size: 108px;
	max-inline-size: 100%;
}

.prw__kpis {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 10px;
}

@media (min-width: 560px) {
	.prw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

@media (min-width: 980px) {
	.prw__kpis {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}
}

.prw__kpi {
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

.prw__kpi-label {
	font-size: 0.76rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.prw__kpi-val {
	font-size: 1.02rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.prw__kpi-val.is-accent {
	color: #0b4a8b;
}

.prw__kpi-val.is-warn {
	color: #7c4a03;
}

.prw__workstation {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	gap: 14px;
}

@media (min-width: 1080px) {
	.prw__workstation {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
		align-items: start;
	}
}

.prw__list-pane,
.prw__inspector-pane {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 8px);
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.prw__pane-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.prw__pane-title {
	font-size: 0.88rem;
	font-weight: 700;
}

.prw__cluster-list,
.prw__member-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.prw__cluster-item {
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

.prw__cluster-item.is-selected {
	border-color: var(--color-primary-element, #0082c9);
	background-color: var(--color-primary-element-light);
}

.prw__cluster-top,
.prw__member-top {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.prw__cluster-name,
.prw__member-name {
	font-weight: 700;
	font-size: 0.9rem;
	overflow-wrap: anywhere;
}

.prw__cluster-path,
.prw__member-path {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.prw__cluster-meta,
.prw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.prw__pill {
	padding-block: 2px;
	padding-inline: 8px;
	border-radius: 999px;
	font-size: 0.72rem;
	font-weight: 700;
	border: 1px solid var(--color-border);
}

.prw__pill.is-danger {
	background-color: #fdecea;
	color: #842029;
	border-color: #f1aeb5;
}

.prw__pill.is-risk-raw-vault,
.prw__pill.is-risk-unverified-raw,
.prw__pill.is-risk-shielded,
.prw__pill.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.prw__pill.is-risk-camera-raw,
.prw__pill.is-risk-sidecar-origin,
.prw__pill.is-risk-raw-verified,
.prw__pill.is-consolidate {
	background-color: #e8f1fb;
	color: #0b4a8b;
	border-color: #9ec5fe;
}

.prw__pill.is-risk-reclaimable,
.prw__pill.is-reclaim,
.prw__pill.is-keep {
	background-color: #e7f6ec;
	color: #0f5132;
	border-color: #9dd6b4;
}

.prw__inspector-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.prw__inspector-title-wrap {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-inline-size: 0;
}

.prw__inspector-title {
	margin: 0;
	font-size: 0.98rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.prw__inspector-sub {
	font-family: monospace;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.prw__inspector-actions,
.prw__override-bar,
.prw__member-badges,
.prw__companion-chips {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}

.prw__companion-chip {
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

.prw__companion-chip.is-warn {
	background-color: #fff4e5;
	color: #7c4a03;
	border-color: #f5c97b;
}

.prw__warn-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #f5c97b;
	background-color: #fff4e5;
	color: #7c4a03;
	font-size: 0.83rem;
	line-height: 1.45;
}

.prw__info-banner {
	padding-block: 10px;
	padding-inline: 12px;
	border-radius: var(--border-radius, 6px);
	border: 1px solid #9ec5fe;
	background-color: #e8f1fb;
	color: #0b4a8b;
	font-size: 0.83rem;
	line-height: 1.45;
}

.prw__meta-grid {
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
	.prw__meta-grid {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
}

.prw__meta-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	font-size: 0.84rem;
	min-inline-size: 0;
	overflow-wrap: anywhere;
}

.prw__meta-label {
	font-size: 0.74rem;
	font-weight: 700;
	text-transform: uppercase;
	color: var(--color-text-maxcontrast);
}

.prw__mono-text {
	font-family: monospace;
	font-size: 0.8rem;
	overflow-wrap: anywhere;
}

.prw__member-card {
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

.prw__member-card.is-verdict-keep-canonical-survivor,
.prw__member-card.is-verdict-reclaim-catalog-preview-pyramid,
.prw__member-card.is-verdict-reclaim-verified-web-export {
	border-inline-start: 4px solid #0f5132;
}

.prw__member-card.is-verdict-consolidate-to-raw-vault {
	border-inline-start: 4px solid #0b4a8b;
}

.prw__member-card.is-verdict-blocked-raw-selects-vault,
.prw__member-card.is-verdict-blocked-camera-raw-original,
.prw__member-card.is-verdict-blocked-sidecar-edit-origin {
	border-inline-start: 4px solid #842029;
}

.prw__member-card.is-verdict-blocked-unverified-raw-master,
.prw__member-card.is-verdict-blocked-not-preview-pyramid,
.prw__member-card.is-verdict-blocked-not-developed-export,
.prw__member-card.is-verdict-blocked-fresh-preview-cache,
.prw__member-card.is-verdict-blocked-manual-shield,
.prw__member-card.is-verdict-excluded {
	border-inline-start: 4px solid #7c4a03;
}

.prw__member-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-maxcontrast);
	max-inline-size: 68ch;
}

.prw__script-box {
	border: 1px solid var(--color-border);
	border-radius: var(--border-radius, 6px);
	padding-block: 8px;
	padding-inline: 12px;
	background-color: var(--color-main-background);
}

.prw__script-summary {
	display: flex;
	align-items: center;
	min-block-size: 44px;
	font-weight: 700;
	font-size: 0.86rem;
	cursor: pointer;
}

.prw__script-content {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding-block-start: 8px;
}

.prw__script-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.prw__code-pre {
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

.prw__load-more-wrap {
	display: flex;
	justify-content: center;
	padding-block: 6px;
}
</style>
