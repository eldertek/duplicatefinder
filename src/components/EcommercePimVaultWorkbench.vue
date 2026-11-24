<template>
	<section
		class="ecommerce-pim-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'E-Commerce, PIM Product Media and Brand Asset Vault Auditor')">
		<header class="epv__toolbar">
			<div class="epv__title-group">
				<h3 class="epv__title">
					{{ t('duplicatefinder', 'E-Commerce, PIM Product Media & Brand Asset Vault Auditor') }}
				</h3>
				<span
					class="epv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {masters} masters, {logos} logos, {heroes} hero packshots, {variants} variants', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						masters: analysis.summary.totalSkuMasterClusters,
						logos: analysis.summary.totalBrandLogoClusters,
						heroes: analysis.summary.totalHeroPackshotClusters,
						variants: analysis.summary.totalDerivedVariantClusters,
					}) }}
				</span>
			</div>

			<div class="epv__toolbar-actions">
				<button
					type="button"
					class="epv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="epv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="epv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="epv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="epv__tool-btn is-close"
					aria-keyshortcuts="Shift+F7"
					:title="t('duplicatefinder', 'Hide E-Commerce, PIM Product Media and Brand Asset Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide E-Commerce & PIM Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="epv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="epv__kpis">
			<div class="epv__kpi">
				<span class="epv__kpi-label">{{ t('duplicatefinder', 'Safe Packshot & Feed Reclaim') }}</span>
				<strong class="epv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="epv__kpi">
				<span class="epv__kpi-label">{{ t('duplicatefinder', 'Conserved Masters & Brand Assets') }}</span>
				<strong class="epv__kpi-val is-warn">
					{{ analysis.summary.totalSkuMasterClusters }} {{ t('duplicatefinder', 'SKU masters') }} / {{ analysis.summary.totalBrandLogoClusters }} {{ t('duplicatefinder', 'logos') }} / {{ analysis.summary.totalHeroPackshotClusters }} {{ t('duplicatefinder', 'heroes') }}
				</strong>
			</div>
			<div class="epv__kpi">
				<span class="epv__kpi-label">{{ t('duplicatefinder', 'Derived Renders & PIM Feeds') }}</span>
				<strong class="epv__kpi-val">
					{{ analysis.summary.totalDerivedVariantClusters }} {{ t('duplicatefinder', 'variants') }} / {{ analysis.summary.totalStaleFeedClusters }} {{ t('duplicatefinder', 'feeds') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="epv__kpi">
				<span class="epv__kpi-label">{{ t('duplicatefinder', 'Raw Media Footprint') }}</span>
				<strong class="epv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="epv__empty-banner"
			role="note">
			<div class="epv__empty-text">
				<p class="epv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure SKU master, brand logo, and hero packshot shields before scanning') }}
				</p>
				<p class="epv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit SKU visual masters (.psd, .psb, .ai, .eps, .svg, .indd), derived multi-size packshots (.png, .webp, .avif, .jpg @2x/thumb/1200w), catalog spec-sheet PDFs, and PIM channel feeds (.csv, .xlsx, .xml).') }}
				</p>
			</div>
			<button
				type="button"
				class="epv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="epv__controls">
			<div class="epv__control-row">
				<span class="epv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="epv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'E-Commerce and PIM vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="epv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="epv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="epv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="epv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="epv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="epv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="epv__seg-btn"
					:class="{ 'is-active': protectSkuMasters }"
					:aria-pressed="protectSkuMasters ? 'true' : 'false'"
					@click="protectSkuMasters = !protectSkuMasters">
					<span>{{ protectSkuMasters ? t('duplicatefinder', 'Shield SKU Masters: ON') : t('duplicatefinder', 'Shield SKU Masters: OFF') }}</span>
				</button>

				<button
					type="button"
					class="epv__seg-btn"
					:class="{ 'is-active': protectBrandLogos }"
					:aria-pressed="protectBrandLogos ? 'true' : 'false'"
					@click="protectBrandLogos = !protectBrandLogos">
					<span>{{ protectBrandLogos ? t('duplicatefinder', 'Shield Brand Logos: ON') : t('duplicatefinder', 'Shield Brand Logos: OFF') }}</span>
				</button>

				<button
					type="button"
					class="epv__seg-btn"
					:class="{ 'is-active': protectHeroPackshots }"
					:aria-pressed="protectHeroPackshots ? 'true' : 'false'"
					@click="protectHeroPackshots = !protectHeroPackshots">
					<span>{{ protectHeroPackshots ? t('duplicatefinder', 'Shield Hero Packshots: ON') : t('duplicatefinder', 'Shield Hero Packshots: OFF') }}</span>
				</button>

				<button
					type="button"
					class="epv__seg-btn"
					:class="{ 'is-active': requireVerifiedMasterForDerivativePrune }"
					:aria-pressed="requireVerifiedMasterForDerivativePrune ? 'true' : 'false'"
					@click="requireVerifiedMasterForDerivativePrune = !requireVerifiedMasterForDerivativePrune">
					<span>{{ requireVerifiedMasterForDerivativePrune ? t('duplicatefinder', 'Require Master Anchor: ON') : t('duplicatefinder', 'Require Master Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="epv__control-row epv__inputs-row">
				<label class="epv__field">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="epv__input">
						<option value="prune-derived-packshots-and-stale-feeds">{{ t('duplicatefinder', 'Prune Derived Packshots & Stale Feeds (Keep Masters & Heroes)') }}</option>
						<option value="hardlink-published-packshots-vault">{{ t('duplicatefinder', 'Hardlink Published Packshots & PDFs (Block PSD/AI/Feeds)') }}</option>
						<option value="quarantine-variants-and-exports">{{ t('duplicatefinder', 'Quarantine Derived Variants & Stale Feeds Only') }}</option>
					</select>
				</label>

				<label class="epv__field">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="epv__input">
						<option value="master-brand-hero-first">{{ t('duplicatefinder', 'SKU Masters, Brand Logos & Hero Packshots first') }}</option>
						<option value="highest-resolution-and-master-first">{{ t('duplicatefinder', 'Highest resolution & source master first') }}</option>
						<option value="newest-pim-publish-first">{{ t('duplicatefinder', 'Newest PIM publish mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="epv__field">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Recent Feed Grace (d)') }}</span>
					<input
						v-model="keepRecentFeedDaysInput"
						type="number"
						min="0"
						step="1"
						class="epv__input epv__num-input">
				</label>

				<label class="epv__field">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="epv__input epv__num-input">
				</label>

				<label class="epv__field epv__field-grow">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Filter SKU, Brand, Variant Tag or PIM Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="epv__input"
						:placeholder="t('duplicatefinder', 'e.g. SKU-4021, @2x, 1200w, .psd, .webp, Akeneo, hero')">
				</label>

				<label class="epv__field">
					<span class="epv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="epv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Protection priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Asset filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="epv__control-row">
				<span class="epv__control-label">{{ t('duplicatefinder', 'Media Family') }}</span>
				<div
					class="epv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'E-Commerce and PIM media family filter')">
					<button
						type="button"
						class="epv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="epv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="epv__control-row">
				<span class="epv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="epv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'E-Commerce and PIM governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="epv__seg-btn"
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
			class="epv__empty-filter"
			role="note">
			<p class="epv__empty-title">
				{{ t('duplicatefinder', 'No SKU visual masters, packshot renders, spec PDFs, or PIM feeds match the active filters.') }}
			</p>
			<button
				type="button"
				class="epv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="epv__workspace">
			<div
				class="epv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited E-Commerce, PIM Product Media and Brand Asset clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="epv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="epv__cluster-top">
						<strong class="epv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="epv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="epv__cluster-meta">
						<span
							v-if="cluster.skuCode"
							class="epv__tag">{{ cluster.skuCode }}</span>
						<span class="epv__tag">{{ cluster.skuStem || cluster.name }}</span>
						<span class="epv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="epv__cluster-badges">
						<span
							v-if="cluster.hasSkuMaster"
							class="epv__badge is-danger">
							{{ t('duplicatefinder', 'SKU Master (.psd/.ai/.svg/.indd)') }}
						</span>
						<span
							v-if="cluster.hasBrandLogo"
							class="epv__badge is-keep">
							{{ t('duplicatefinder', 'Approved Brand Logo') }}
						</span>
						<span
							v-if="cluster.hasHeroPackshot"
							class="epv__badge is-keep">
							{{ t('duplicatefinder', 'Published Hero Packshot') }}
						</span>
						<span
							v-if="cluster.hasDerivedVariant"
							class="epv__badge is-consolidate">
							{{ t('duplicatefinder', 'Derived Variant (@2x/thumb/1200w)') }}
						</span>
						<span
							v-if="cluster.hasStaleFeed"
							class="epv__badge is-warn">
							{{ t('duplicatefinder', 'PIM Feed / Export') }}
						</span>
					</div>
					<div class="epv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="epv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="epv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="epv__inspector">
				<header class="epv__inspector-head">
					<div class="epv__inspector-title-wrap">
						<h4 class="epv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="epv__inspector-sub">
							{{ selectedCluster.skuCode || selectedCluster.skuStem }} | {{ selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="epv__inspector-actions">
						<button
							type="button"
							class="epv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="epv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="epv__lineage-grid">
					<div class="epv__lineage-item">
						<span class="epv__lineage-label">{{ t('duplicatefinder', 'SKU Code & Asset Stem') }}</span>
						<strong class="epv__lineage-val">{{ selectedCluster.skuCode ? `${selectedCluster.skuCode} / ` : '' }}{{ selectedCluster.skuStem }}</strong>
					</div>
					<div class="epv__lineage-item">
						<span class="epv__lineage-label">{{ t('duplicatefinder', 'Vault Conservation Status') }}</span>
						<strong class="epv__lineage-val">
							{{ selectedCluster.hasBrandLogo ? t('duplicatefinder', 'Brand Logo / Charte Shielded') : (selectedCluster.hasSkuMaster ? t('duplicatefinder', 'SKU Source Master Shielded') : (selectedCluster.hasHeroPackshot ? t('duplicatefinder', 'Published Hero Packshot Shielded') : t('duplicatefinder', 'Derived Variant / PIM Export'))) }}
						</strong>
					</div>
					<div class="epv__lineage-item">
						<span class="epv__lineage-label">{{ t('duplicatefinder', 'Master Anchor & Variant Tags') }}</span>
						<strong class="epv__lineage-val">
							{{ selectedCluster.hasVerifiedMasterAnchor ? t('duplicatefinder', 'Master/Hero Verified') : t('duplicatefinder', 'No Master Anchor') }} | {{ selectedCluster.variantTags.length > 0 ? selectedCluster.variantTags.join(', ') : t('duplicatefinder', 'Canonical asset') }}
						</strong>
					</div>
					<div class="epv__lineage-item">
						<span class="epv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="epv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="epv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="epv__member-card">
						<div class="epv__member-top">
							<code class="epv__member-path">{{ member.normalized }}</code>
							<div class="epv__member-pills">
								<span
									class="epv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.variantTag"
									class="epv__pill is-consolidate">
									{{ member.variantTag }}
								</span>
								<span
									class="epv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="epv__member-bottom">
							<div class="epv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.assetRole }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="epv__member-actions">
								<button
									type="button"
									class="epv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isBrandLogoAsset && protectBrandLogos) && !(member.isSkuMaster && protectSkuMasters) && !(member.isHeroPackshot && protectHeroPackshots)"
									class="epv__override-field">
									<span class="epv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="epv__override-select"
										:value="getMemberOverride(member.key)"
										@change="setMemberOverride(member.key, $event.target.value)">
										<option value="auto">{{ t('duplicatefinder', 'Auto') }}</option>
										<option value="keep">{{ t('duplicatefinder', 'Force Keep / Shield') }}</option>
										<option value="prune">{{ t('duplicatefinder', 'Force Remediate') }}</option>
									</select>
								</label>
							</div>
						</div>
					</div>
				</div>

				<div class="epv__code-panels">
					<div class="epv__code-box">
						<div class="epv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="epv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="epv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="epv__code-box">
						<div class="epv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="epv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="epv__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import { formatBytes } from '../tools/duplicateStats'
import {
	ECOMMERCE_PIM_PRESETS,
	auditEcommercePimVault,
	buildEcommercePimCsvReport,
	buildEcommercePimJsonManifest,
	buildEcommercePimRemediationScript,
	buildEcommercePimSyncExcludeList,
} from '../tools/ecommercePimVaultAuditor'

export default {
	name: 'EcommercePimVaultWorkbench',
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
			presetId: 'all-ecommerce-pim-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-derived-packshots-and-stale-feeds',
			survivorRule: 'master-brand-hero-first',
			protectSkuMasters: true,
			protectBrandLogos: true,
			protectHeroPackshots: true,
			requireVerifiedMasterForDerivativePrune: true,
			keepRecentFeedDaysInput: '0',
			minSizeMbInput: '0',
			searchQueryInput: '',
			sortMode: 'reclaim_desc',
			selectedClusterId: null,
			visibleLimit: 25,
			memberOverrides: {},
			statusNotice: '',
			statusNoticeType: 'success',
		}
	},
	computed: {
		presets() {
			return ECOMMERCE_PIM_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'sku-master-protected', label: this.t('duplicatefinder', 'SKU Master') },
				{ id: 'brand-logo-protected', label: this.t('duplicatefinder', 'Brand Logo') },
				{ id: 'hero-packshot-protected', label: this.t('duplicatefinder', 'Hero Packshot') },
				{ id: 'derived-packshot-variant', label: this.t('duplicatefinder', 'Derived Variant') },
				{ id: 'stale-pim-feed-export', label: this.t('duplicatefinder', 'PIM Feed') },
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
		parsedKeepRecentFeedDays() {
			const trimmed = String(this.keepRecentFeedDaysInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
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
			return auditEcommercePimVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectSkuMasters: this.protectSkuMasters,
				protectBrandLogos: this.protectBrandLogos,
				protectHeroPackshots: this.protectHeroPackshots,
				requireVerifiedMasterForDerivativePrune: this.requireVerifiedMasterForDerivativePrune,
				keepRecentFeedDays: this.parsedKeepRecentFeedDays,
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
			if (this.selectedClusterId !== null && this.selectedClusterId !== undefined) {
				const found = clusters.find(c => c.id === this.selectedClusterId)
				if (found) {
					return found
				}
			}
			if (this.currentDuplicateId !== null && this.currentDuplicateId !== undefined) {
				const byCurrent = clusters.find(c => c.id === this.currentDuplicateId)
				if (byCurrent) {
					return byCurrent
				}
			}
			return clusters[0]
		},
		generatedScript() {
			return buildEcommercePimRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildEcommercePimSyncExcludeList()
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
		formatMemberSize(size) {
			return formatBytes(size)
		},
		applyPreset(presetId) {
			const preset = ECOMMERCE_PIM_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectSkuMasters = preset.protectSkuMasters
			this.protectBrandLogos = preset.protectBrandLogos
			this.protectHeroPackshots = preset.protectHeroPackshots
			this.requireVerifiedMasterForDerivativePrune = preset.requireVerifiedMasterForDerivativePrune
			this.keepRecentFeedDaysInput = String(preset.keepRecentFeedDays)
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
			if (this.selectedCluster && this.selectedClusterId === null) {
				this.selectedClusterId = this.selectedCluster.id
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatVerdictLabel(verdict) {
			const map = {
				'sku-master-protected': this.t('duplicatefinder', 'SKU Master'),
				'brand-logo-protected': this.t('duplicatefinder', 'Brand Logo'),
				'hero-packshot-protected': this.t('duplicatefinder', 'Hero Packshot'),
				'derived-packshot-variant': this.t('duplicatefinder', 'Derived Variant'),
				'stale-pim-feed-export': this.t('duplicatefinder', 'PIM Feed'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'sku-master-protected') {
				return 'is-danger'
			}
			if (verdict === 'brand-logo-protected' || verdict === 'hero-packshot-protected') {
				return 'is-keep'
			}
			if (verdict === 'derived-packshot-variant') {
				return 'is-consolidate'
			}
			if (verdict === 'stale-pim-feed-export') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return this.strategy === 'quarantine-variants-and-exports'
					? this.t('duplicatefinder', 'QUARANTINE')
					: this.t('duplicatefinder', 'RECLAIM')
			}
			if (member.action === 'hardlink') {
				return this.t('duplicatefinder', 'HARDLINK')
			}
			if (member.isSurvivor) {
				return this.t('duplicatefinder', 'KEEP (SURVIVOR)')
			}
			return member.shielded
				? this.t('duplicatefinder', 'KEEP (SHIELDED)')
				: this.t('duplicatefinder', 'KEEP')
		},
		findSourceDuplicate(cluster) {
			if (!cluster) {
				return null
			}
			return cluster.group
				|| this.activePool.find(g => g && g.id === cluster.id)
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
		async copyMemberPath(path) {
			const ok = await copyTextSafely(path)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied SKU or asset path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 E-Commerce & PIM remediation script to clipboard.'))
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
			const csv = buildEcommercePimCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-ecommerce-pim-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe E-Commerce & PIM Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildEcommercePimJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-ecommerce-pim-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported E-Commerce & PIM Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.ecommerce-pim-vault-workbench {
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

.epv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.epv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.epv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.epv__status-badge {
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

.epv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.epv__tool-btn,
.epv__seg-btn,
.epv__primary-btn,
.epv__load-more-btn,
.epv__mini-btn {
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

.epv__tool-btn:hover:not(:disabled),
.epv__seg-btn:hover:not(:disabled),
.epv__load-more-btn:hover:not(:disabled),
.epv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.epv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.epv__tool-btn.is-primary-outline,
.epv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.epv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.epv__tool-btn:focus-visible,
.epv__seg-btn:focus-visible,
.epv__primary-btn:focus-visible,
.epv__load-more-btn:focus-visible,
.epv__mini-btn:focus-visible,
.epv__cluster-card:focus-visible,
.epv__input:focus-visible,
.epv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.epv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.epv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.epv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.epv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.epv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.epv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.epv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.epv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.epv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.epv__empty-banner,
.epv__empty-filter {
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

.epv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.epv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.epv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.epv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.epv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.epv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.epv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.epv__inputs-row {
	align-items: flex-end;
}

.epv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.epv__field-grow {
	flex: 1 1 180px;
}

.epv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.epv__input,
.epv__override-select {
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

.epv__num-input {
	inline-size: 96px;
}

.epv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.epv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.epv__cluster-card {
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

.epv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.epv__cluster-top,
.epv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.epv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.epv__cluster-meta,
.epv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.epv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.epv__badge,
.epv__pill {
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

.epv__pill.is-keep,
.epv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.epv__pill.is-danger,
.epv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.epv__pill.is-consolidate,
.epv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.epv__pill.is-warn,
.epv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.epv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.epv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.epv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.epv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.epv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.epv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.epv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.epv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.epv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.epv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.epv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.epv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.epv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.epv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.epv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.epv__member-top,
.epv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.epv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.epv__member-pills,
.epv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.epv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.epv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.epv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.epv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.epv__pre {
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

.epv__sr-only {
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
	.epv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.epv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.epv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.ecommerce-pim-vault-workbench {
		padding: 10px;
	}

	.epv__kpis,
	.epv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.epv__num-input {
		inline-size: 100%;
	}

	.epv__field {
		flex: 1 1 100%;
	}
}
</style>
