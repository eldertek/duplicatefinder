<template>
	<section
		class="photo-grading-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Photography RAW, Lightroom/Capture One and Color Grading Vault Auditor')">
		<header class="pgvw__toolbar">
			<div class="pgvw__title-group">
				<h3 class="pgvw__title">
					{{ t('duplicatefinder', 'Photography RAW, Lightroom/Capture One & Color Grading Vault Auditor') }}
				</h3>
				<span
					class="pgvw__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {raws} RAW, {pairs} RAW+JPG pairs vs {caches} caches', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						raws: analysis.summary.totalRawClusters,
						pairs: analysis.summary.totalRawJpgPairClusters,
						caches: analysis.summary.totalRegenerableCacheClusters,
					}) }}
				</span>
			</div>

			<div class="pgvw__toolbar-actions">
				<button
					type="button"
					class="pgvw__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="pgvw__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="pgvw__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="pgvw__tool-btn is-close"
					aria-keyshortcuts="F4"
					:title="t('duplicatefinder', 'Hide Photography RAW, Lightroom/Capture One and Color Grading Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide RAW & Grading Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="pgvw__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="pgvw__kpis">
			<div class="pgvw__kpi">
				<span class="pgvw__kpi-label">{{ t('duplicatefinder', 'Safe Vault Reclaim') }}</span>
				<strong class="pgvw__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="pgvw__kpi">
				<span class="pgvw__kpi-label">{{ t('duplicatefinder', 'RAW vs Exports & Previews') }}</span>
				<strong class="pgvw__kpi-val is-warn">
					{{ analysis.summary.totalRawClusters }} {{ t('duplicatefinder', 'RAW') }} / {{ analysis.summary.totalDerivedExportClusters }} {{ t('duplicatefinder', 'exports') }} / {{ analysis.summary.totalRegenerableCacheClusters }} {{ t('duplicatefinder', 'caches') }}
				</strong>
			</div>
			<div class="pgvw__kpi">
				<span class="pgvw__kpi-label">{{ t('duplicatefinder', 'RAW+JPG Pairs & Suites') }}</span>
				<strong class="pgvw__kpi-val">
					{{ analysis.summary.totalRawJpgPairClusters }} {{ t('duplicatefinder', 'pairs') }} / {{ analysis.summary.totalLightroomClusters }} {{ t('duplicatefinder', 'LR') }} / {{ analysis.summary.totalCaptureOneClusters }} {{ t('duplicatefinder', 'C1') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="pgvw__kpi">
				<span class="pgvw__kpi-label">{{ t('duplicatefinder', 'Raw Vault Footprint') }}</span>
				<strong class="pgvw__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="pgvw__empty-banner"
			role="note">
			<div class="pgvw__empty-text">
				<p class="pgvw__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure RAW, .xmp, and .lrcat conservation shields before scanning') }}
				</p>
				<p class="pgvw__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit camera RAW originals (.cr3, .cr2, .nef, .arw, .raf, .dng, .orf, .rw2), Lightroom/Capture One catalogs and grading sidecars (.lrcat, .xmp, .cos, .eip, .cube), regenerable Previews.lrdata/Smart Previews.lrdata/Proxies/Cache folders, and derived .jpg/.tif/.psd exports or RAW+JPG pairs.') }}
				</p>
			</div>
			<button
				type="button"
				class="pgvw__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="pgvw__controls">
			<div class="pgvw__control-row">
				<span class="pgvw__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="pgvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Photography RAW and color grading vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="pgvw__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="pgvw__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="pgvw__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="pgvw__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="pgvw__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="pgvw__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="pgvw__seg-btn"
					:class="{ 'is-active': protectRawOriginals }"
					:aria-pressed="protectRawOriginals ? 'true' : 'false'"
					@click="protectRawOriginals = !protectRawOriginals">
					<span>{{ protectRawOriginals ? t('duplicatefinder', 'Shield RAW Originals: ON') : t('duplicatefinder', 'Shield RAW Originals: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pgvw__seg-btn"
					:class="{ 'is-active': protectSidecarsXmp }"
					:aria-pressed="protectSidecarsXmp ? 'true' : 'false'"
					@click="protectSidecarsXmp = !protectSidecarsXmp">
					<span>{{ protectSidecarsXmp ? t('duplicatefinder', 'Shield .xmp/.cos/.eip & LUTs: ON') : t('duplicatefinder', 'Shield .xmp/.cos/.eip & LUTs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pgvw__seg-btn"
					:class="{ 'is-active': protectActiveCatalogs }"
					:aria-pressed="protectActiveCatalogs ? 'true' : 'false'"
					@click="protectActiveCatalogs = !protectActiveCatalogs">
					<span>{{ protectActiveCatalogs ? t('duplicatefinder', 'Shield Active .lrcat Catalogs: ON') : t('duplicatefinder', 'Shield Active .lrcat Catalogs: OFF') }}</span>
				</button>

				<button
					type="button"
					class="pgvw__seg-btn"
					:class="{ 'is-active': requireRawXmpForExportPrune }"
					:aria-pressed="requireRawXmpForExportPrune ? 'true' : 'false'"
					@click="requireRawXmpForExportPrune = !requireRawXmpForExportPrune">
					<span>{{ requireRawXmpForExportPrune ? t('duplicatefinder', 'Require RAW+XMP for Exports: ON') : t('duplicatefinder', 'Require RAW+XMP for Exports: OFF') }}</span>
				</button>
			</div>

			<div class="pgvw__control-row pgvw__inputs-row">
				<label class="pgvw__field">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="pgvw__input">
						<option value="prune-previews-proxies-keep-raw">{{ t('duplicatefinder', 'Prune Previews/Proxies & Exports (Keep RAW/XMP/LRCAT)') }}</option>
						<option value="consolidate-raw-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Onto Photo Vault') }}</option>
						<option value="prune-regenerable-caches-only">{{ t('duplicatefinder', 'Prune Stale Previews.lrdata/Proxies/Cache Only') }}</option>
					</select>
				</label>

				<label class="pgvw__field">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="pgvw__input">
						<option value="raw-xmp-lrcat-vault-first">{{ t('duplicatefinder', 'RAW Vault, .xmp & .lrcat first') }}</option>
						<option value="capture-date-shoot-first">{{ t('duplicatefinder', 'Oldest shoot / capture date first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="pgvw__field">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Cache Age (d)') }}</span>
					<input
						v-model="staleCacheDaysInput"
						type="number"
						min="0"
						step="1"
						class="pgvw__input pgvw__num-input">
				</label>

				<label class="pgvw__field">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="pgvw__input pgvw__num-input">
				</label>

				<label class="pgvw__field pgvw__field-grow">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Filter Shoot Stem, Camera or Format') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="pgvw__input"
						:placeholder="t('duplicatefinder', 'e.g. IMG_4021, .cr3, .lrcat, .xmp, .eip, Previews.lrdata, Proxies')">
				</label>

				<label class="pgvw__field pgvw__field-grow">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="pgvw__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="pgvw__field">
					<span class="pgvw__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="pgvw__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="cache_priority_desc">{{ t('duplicatefinder', 'Preview cache & pair priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Shoot filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="pgvw__control-row">
				<span class="pgvw__control-label">{{ t('duplicatefinder', 'Vault Family') }}</span>
				<div
					class="pgvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Photography RAW and grading vault family filter')">
					<button
						type="button"
						class="pgvw__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="pgvw__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="pgvw__control-row">
				<span class="pgvw__control-label">{{ t('duplicatefinder', 'Workflow & Pairs') }}</span>
				<div
					class="pgvw__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Photography workflow and RAW+JPG pair filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="pgvw__seg-btn"
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
			class="pgvw__empty-filter"
			role="note">
			<p class="pgvw__empty-title">
				{{ t('duplicatefinder', 'No RAW originals, Lightroom/Capture One catalogs, grading sidecars, preview caches, or RAW+JPG pairs match the active filters.') }}
			</p>
			<button
				type="button"
				class="pgvw__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="pgvw__workspace">
			<div
				class="pgvw__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Photography RAW, Lightroom/Capture One and Color Grading clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="pgvw__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="pgvw__cluster-top">
						<strong class="pgvw__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="pgvw__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="pgvw__cluster-meta">
						<span class="pgvw__tag">{{ cluster.shootWorkspace }}</span>
						<span class="pgvw__tag">{{ cluster.shootStem }}</span>
						<span class="pgvw__tag">{{ cluster.workflowSuite }}</span>
					</div>
					<div class="pgvw__cluster-badges">
						<span
							class="pgvw__badge"
							:class="duplicationBadgeClass(cluster.duplicationClass)">
							{{ cluster.duplicationBadge }}
						</span>
						<span
							class="pgvw__badge"
							:class="lineageBadgeClass(cluster)">
							{{ cluster.lineageBadge }}
						</span>
						<span
							v-if="cluster.isRawJpgPair"
							class="pgvw__badge is-consolidate">
							{{ t('duplicatefinder', 'RAW+JPG Pair') }}
						</span>
					</div>
					<div class="pgvw__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="pgvw__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="pgvw__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="pgvw__inspector">
				<header class="pgvw__inspector-head">
					<div class="pgvw__inspector-title-wrap">
						<h4 class="pgvw__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="pgvw__inspector-sub">
							{{ selectedCluster.vaultKey }} | {{ selectedCluster.workflowSuite }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="pgvw__inspector-actions">
						<button
							type="button"
							class="pgvw__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="pgvw__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="pgvw__lineage-grid">
					<div class="pgvw__lineage-item">
						<span class="pgvw__lineage-label">{{ t('duplicatefinder', 'Shoot Stem & Camera Spec') }}</span>
						<strong class="pgvw__lineage-val">{{ selectedCluster.shootStem }} ({{ selectedCluster.shootSpec }} / {{ selectedCluster.formatBadge }})</strong>
					</div>
					<div class="pgvw__lineage-item">
						<span class="pgvw__lineage-label">{{ t('duplicatefinder', 'Suite & Grading Stage') }}</span>
						<strong class="pgvw__lineage-val">{{ selectedCluster.workflowSuite }} / {{ selectedCluster.workflowStage }}</strong>
					</div>
					<div class="pgvw__lineage-item">
						<span class="pgvw__lineage-label">{{ t('duplicatefinder', 'RAW+XMP & Pair Lineage') }}</span>
						<strong class="pgvw__lineage-val">
							{{ selectedCluster.duplicationBadge }} | {{ selectedCluster.lineageBadge }}
						</strong>
					</div>
					<div class="pgvw__lineage-item">
						<span class="pgvw__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="pgvw__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="pgvw__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="pgvw__member-card">
						<div class="pgvw__member-top">
							<code class="pgvw__member-path">{{ member.path }}</code>
							<div class="pgvw__member-pills">
								<span
									class="pgvw__pill"
									:class="member.meta.isRawOriginal || member.meta.isActiveCatalog || member.meta.isSidecarGrading ? 'is-keep' : (member.meta.isRegenerableCache ? 'is-warn' : 'is-consolidate')">
									{{ member.meta.artifactKindBadge }}
								</span>
								<span
									class="pgvw__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="pgvw__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="pgvw__member-bottom">
							<div class="pgvw__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="pgvw__override-field">
								<span class="pgvw__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="pgvw__override-select"
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

				<div class="pgvw__code-panels">
					<div class="pgvw__code-box">
						<div class="pgvw__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="pgvw__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="pgvw__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="pgvw__code-box">
						<div class="pgvw__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="pgvw__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="pgvw__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	PHOTO_GRADING_PRESETS,
	analyzePhotoGradingVault,
	buildPhotoGradingVaultCsvReport,
	buildPhotoGradingVaultJsonReport,
	buildPhotoGradingVaultRemediationScript,
	buildPhotoGradingVaultSyncExcludeSnippet,
} from '../tools/photoGradingVaultAuditor'

export default {
	name: 'PhotoGradingVaultWorkbench',
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
			presetId: 'all-photo-grading-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-previews-proxies-keep-raw',
			survivorRule: 'raw-xmp-lrcat-vault-first',
			protectRawOriginals: true,
			protectSidecarsXmp: true,
			protectActiveCatalogs: true,
			requireRawXmpForExportPrune: false,
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
			return PHOTO_GRADING_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'raw-originals', label: this.t('duplicatefinder', 'RAW Originals') },
				{ id: 'catalogs-sidecars', label: this.t('duplicatefinder', 'Catalogs & Sidecars') },
				{ id: 'regenerable-caches', label: this.t('duplicatefinder', 'Previews & Proxies') },
				{ id: 'derived-exports', label: this.t('duplicatefinder', 'Derived .jpg/.tif/.psd') },
				{ id: 'raw-jpg-pairs', label: this.t('duplicatefinder', 'RAW+JPG Pairs') },
				{ id: 'lightroom', label: this.t('duplicatefinder', 'Lightroom') },
				{ id: 'capture-one', label: this.t('duplicatefinder', 'Capture One') },
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
			return analyzePhotoGradingVault(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectRawOriginals: this.protectRawOriginals,
				protectSidecarsXmp: this.protectSidecarsXmp,
				protectActiveCatalogs: this.protectActiveCatalogs,
				requireRawXmpForExportPrune: this.requireRawXmpForExportPrune,
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
			return buildPhotoGradingVaultRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildPhotoGradingVaultSyncExcludeSnippet(this.analysis)
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
			const preset = PHOTO_GRADING_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectRawOriginals = preset.protectRawOriginals
			this.protectSidecarsXmp = preset.protectSidecarsXmp
			this.protectActiveCatalogs = preset.protectActiveCatalogs
			this.requireRawXmpForExportPrune = preset.requireRawXmpForExportPrune
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
			if (duplicationClass === 'raw-original' || duplicationClass === 'catalog-sidecar') {
				return 'is-keep'
			}
			if (duplicationClass === 'regenerable-cache') {
				return 'is-warn'
			}
			return 'is-consolidate'
		},
		lineageBadgeClass(cluster) {
			if (cluster.hasRawOriginalInVault && cluster.hasXmpSidecarInVault) {
				return 'is-keep'
			}
			if (cluster.hasRawOriginalInVault || cluster.hasActiveCatalogInCluster) {
				return 'is-consolidate'
			}
			return 'is-warn'
		},
		formatRiskLabel(riskState) {
			const map = {
				reclaimable: this.t('duplicatefinder', 'Reclaimable'),
				consolidatable: this.t('duplicatefinder', 'Hardlink Ready'),
				'preview-cache-reclaimable': this.t('duplicatefinder', 'Preview/Proxy Reclaimable'),
				'raw-jpg-pair-reclaimable': this.t('duplicatefinder', 'RAW+JPG Pair Reclaimable'),
				'active-catalog-protected': this.t('duplicatefinder', 'Active .lrcat Protected'),
				'raw-original-protected': this.t('duplicatefinder', 'RAW Original Protected'),
				'sidecar-xmp-protected': this.t('duplicatefinder', '.XMP/Grading Protected'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'active-catalog-protected' || riskState === 'raw-original-protected') {
				return 'is-danger'
			}
			if (riskState === 'sidecar-xmp-protected' || riskState === 'shielded') {
				return 'is-warn'
			}
			if (riskState === 'consolidatable' || riskState === 'raw-jpg-pair-reclaimable') {
				return 'is-consolidate'
			}
			return 'is-reclaim'
		},
		verdictPillClass(verdict) {
			if (verdict === 'keep-canonical-survivor') {
				return 'is-keep'
			}
			if (verdict === 'blocked-active-lrcat' || verdict === 'blocked-raw-original') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-photo-asset') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Photography RAW & Grading remediation script to clipboard.'))
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
			const csv = buildPhotoGradingVaultCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-photo-grading-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Photography RAW & Grading CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildPhotoGradingVaultJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-photo-grading-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Photography RAW & Grading JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.photo-grading-vault-workbench {
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

.pgvw__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.pgvw__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.pgvw__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.pgvw__status-badge {
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

.pgvw__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.pgvw__tool-btn,
.pgvw__seg-btn,
.pgvw__primary-btn,
.pgvw__load-more-btn,
.pgvw__mini-btn {
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

.pgvw__tool-btn:hover:not(:disabled),
.pgvw__seg-btn:hover:not(:disabled),
.pgvw__load-more-btn:hover:not(:disabled),
.pgvw__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.pgvw__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.pgvw__tool-btn.is-primary-outline,
.pgvw__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.pgvw__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.pgvw__tool-btn:focus-visible,
.pgvw__seg-btn:focus-visible,
.pgvw__primary-btn:focus-visible,
.pgvw__load-more-btn:focus-visible,
.pgvw__mini-btn:focus-visible,
.pgvw__cluster-card:focus-visible,
.pgvw__input:focus-visible,
.pgvw__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.pgvw__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.pgvw__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.pgvw__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.pgvw__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.pgvw__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pgvw__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.pgvw__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.pgvw__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.pgvw__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.pgvw__empty-banner,
.pgvw__empty-filter {
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

.pgvw__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.pgvw__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.pgvw__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.pgvw__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.pgvw__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.pgvw__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.pgvw__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.pgvw__inputs-row {
	align-items: flex-end;
}

.pgvw__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.pgvw__field-grow {
	flex: 1 1 180px;
}

.pgvw__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.pgvw__input,
.pgvw__override-select {
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

.pgvw__num-input {
	inline-size: 96px;
}

.pgvw__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.pgvw__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.pgvw__cluster-card {
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

.pgvw__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.pgvw__cluster-top,
.pgvw__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.pgvw__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.pgvw__cluster-meta,
.pgvw__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.pgvw__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.pgvw__badge,
.pgvw__pill {
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

.pgvw__pill.is-keep,
.pgvw__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.pgvw__pill.is-danger,
.pgvw__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.pgvw__pill.is-consolidate,
.pgvw__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.pgvw__pill.is-warn,
.pgvw__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.pgvw__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.pgvw__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.pgvw__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.pgvw__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.pgvw__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.pgvw__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.pgvw__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.pgvw__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.pgvw__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pgvw__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.pgvw__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.pgvw__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.pgvw__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.pgvw__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pgvw__member-top,
.pgvw__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.pgvw__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.pgvw__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.pgvw__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.pgvw__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.pgvw__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.pgvw__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.pgvw__pre {
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

.pgvw__sr-only {
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
	.pgvw__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.pgvw__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.pgvw__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.photo-grading-vault-workbench {
		padding: 10px;
	}

	.pgvw__kpis,
	.pgvw__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.pgvw__num-input {
		inline-size: 100%;
	}

	.pgvw__field {
		flex: 1 1 100%;
	}
}
</style>
