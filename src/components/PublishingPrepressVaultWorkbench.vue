<template>
	<section
		class="publishing-prepress-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Publishing, Prepress, Print-Ready PDF/X and Font Licensing Vault Auditor')">
		<header class="ppv__toolbar">
			<div class="ppv__title-group">
				<h3 class="ppv__title">
					{{ t('duplicatefinder', 'Publishing, Prepress, Print-Ready PDF/X & Font Licensing Vault Auditor') }}
				</h3>
				<span
					class="ppv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {layouts} layouts, {bats} PDF/X-4 BAT, {fonts} licensed fonts, {fontRisks} font-dup', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						layouts: analysis.summary.totalLayoutSourceClusters,
						bats: analysis.summary.totalSignedBatClusters,
						fonts: analysis.summary.totalLicensedFontMasterClusters,
						fontRisks: analysis.summary.totalFontLicenseDuplicateClusters,
					}) }}
				</span>
			</div>

			<div class="ppv__toolbar-actions">
				<button
					type="button"
					class="ppv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="ppv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="ppv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="ppv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="ppv__tool-btn is-close"
					aria-keyshortcuts="Shift+F10"
					:title="t('duplicatefinder', 'Hide Publishing, Prepress, PDF/X and Font Licensing Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Publishing & Prepress Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="ppv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="ppv__kpis">
			<div class="ppv__kpi">
				<span class="ppv__kpi-label">{{ t('duplicatefinder', 'Safe Proof & Clone Reclaim') }}</span>
				<strong class="ppv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="ppv__kpi">
				<span class="ppv__kpi-label">{{ t('duplicatefinder', 'Conserved Masters, BAT & Fonts') }}</span>
				<strong class="ppv__kpi-val is-warn">
					{{ analysis.summary.totalLayoutSourceClusters }} {{ t('duplicatefinder', 'layouts') }} / {{ analysis.summary.totalSignedBatClusters }} {{ t('duplicatefinder', 'PDF/X-4 BAT') }} / {{ analysis.summary.totalLicensedFontMasterClusters }} {{ t('duplicatefinder', 'fonts') }}
				</strong>
			</div>
			<div class="ppv__kpi">
				<span class="ppv__kpi-label">{{ t('duplicatefinder', 'Font License Clones & Proofs') }}</span>
				<strong class="ppv__kpi-val is-danger">
					{{ analysis.summary.totalFontLicenseDuplicateClusters }} {{ t('duplicatefinder', 'font dup') }} / {{ analysis.summary.totalSupersededProofClusters }} {{ t('duplicatefinder', 'proofs') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="ppv__kpi">
				<span class="ppv__kpi-label">{{ t('duplicatefinder', 'Raw Prepress & Font Footprint') }}</span>
				<strong class="ppv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="ppv__empty-banner"
			role="note">
			<div class="ppv__empty-text">
				<p class="ppv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure .indd/.afpub/.qxp, PDF/X-4 BAT, and licensed font shields before scanning') }}
				</p>
				<p class="ppv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit layout sources (.indd, .idml, .afpub, .qxp), prepress PDFs (_print, _bleed, _web, _proof, signed PDF/X-4 BAT), commercial fonts (.otf, .ttf, .woff2), and CMYK press links (.tif, .eps, .psd).') }}
				</p>
			</div>
			<button
				type="button"
				class="ppv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="ppv__controls">
			<div class="ppv__control-row">
				<span class="ppv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="ppv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Publishing and Prepress vault presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="ppv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="ppv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="ppv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="ppv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="ppv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="ppv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="ppv__seg-btn"
					:class="{ 'is-active': protectLayoutSources }"
					:aria-pressed="protectLayoutSources ? 'true' : 'false'"
					@click="protectLayoutSources = !protectLayoutSources">
					<span>{{ protectLayoutSources ? t('duplicatefinder', 'Shield .indd/.afpub/.qxp: ON') : t('duplicatefinder', 'Shield .indd/.afpub/.qxp: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ppv__seg-btn"
					:class="{ 'is-active': protectSignedPdfx4Bat }"
					:aria-pressed="protectSignedPdfx4Bat ? 'true' : 'false'"
					@click="protectSignedPdfx4Bat = !protectSignedPdfx4Bat">
					<span>{{ protectSignedPdfx4Bat ? t('duplicatefinder', 'Shield PDF/X-4 BAT: ON') : t('duplicatefinder', 'Shield PDF/X-4 BAT: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ppv__seg-btn"
					:class="{ 'is-active': protectLicensedFontMasters }"
					:aria-pressed="protectLicensedFontMasters ? 'true' : 'false'"
					@click="protectLicensedFontMasters = !protectLicensedFontMasters">
					<span>{{ protectLicensedFontMasters ? t('duplicatefinder', 'Shield Licensed Fonts: ON') : t('duplicatefinder', 'Shield Licensed Fonts: OFF') }}</span>
				</button>

				<button
					type="button"
					class="ppv__seg-btn"
					:class="{ 'is-active': requireLayoutSourceAnchor }"
					:aria-pressed="requireLayoutSourceAnchor ? 'true' : 'false'"
					@click="requireLayoutSourceAnchor = !requireLayoutSourceAnchor">
					<span>{{ requireLayoutSourceAnchor ? t('duplicatefinder', 'Require Layout Anchor: ON') : t('duplicatefinder', 'Require Layout Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="ppv__control-row ppv__inputs-row">
				<label class="ppv__field">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="ppv__input">
						<option value="prune-superseded-proofs-and-font-clones">{{ t('duplicatefinder', 'Prune Superseded Proofs & Font Clones') }}</option>
						<option value="hardlink-fonts-and-cmyk-links">{{ t('duplicatefinder', 'Hardlink Immutable Fonts & CMYK Links (Block Layouts/PSD)') }}</option>
						<option value="quarantine-unlicensed-fonts-and-drafts">{{ t('duplicatefinder', 'Quarantine Font License Duplicates & Draft Proofs') }}</option>
					</select>
				</label>

				<label class="ppv__field">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="ppv__input">
						<option value="layout-bat-font-vault-first">{{ t('duplicatefinder', 'Layout Sources, PDF/X-4 BAT & Font Vault first') }}</option>
						<option value="oldest-master-first">{{ t('duplicatefinder', 'Oldest master mtime first') }}</option>
						<option value="newest-prepress-first">{{ t('duplicatefinder', 'Newest prepress revision first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="ppv__field">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Proof Grace (d)') }}</span>
					<input
						v-model="keepRecentProofDaysInput"
						type="number"
						min="0"
						step="1"
						class="ppv__input ppv__num-input">
				</label>

				<label class="ppv__field">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="ppv__input ppv__num-input">
				</label>

				<label class="ppv__field ppv__field-grow">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Filter Publication, Font Family, PDF/X Stage or CMYK Link') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="ppv__input"
						:placeholder="t('duplicatefinder', 'e.g. indd, afpub, qxp, pdfx4, _print, _bleed, otf, woff2, Helvetica, cmyk, tif')">
				</label>

				<label class="ppv__field">
					<span class="ppv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="ppv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Font license & master priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="ppv__control-row">
				<span class="ppv__control-label">{{ t('duplicatefinder', 'Artifact Family') }}</span>
				<div
					class="ppv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Publishing and Prepress artifact family filter')">
					<button
						type="button"
						class="ppv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="ppv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="ppv__control-row">
				<span class="ppv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="ppv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Prepress governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="ppv__seg-btn"
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
			class="ppv__empty-filter"
			role="note">
			<p class="ppv__empty-title">
				{{ t('duplicatefinder', 'No layout sources, PDF/X proofs, commercial fonts, or CMYK links match the active filters.') }}
			</p>
			<button
				type="button"
				class="ppv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="ppv__workspace">
			<div
				class="ppv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Publishing, Prepress and Font Licensing clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="ppv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="ppv__cluster-top">
						<strong class="ppv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="ppv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="ppv__cluster-meta">
						<span
							v-if="cluster.publishingTool"
							class="ppv__tag">{{ cluster.publishingTool }}</span>
						<span
							v-if="cluster.prepressStage"
							class="ppv__tag">{{ cluster.prepressStage }}</span>
						<span
							v-if="cluster.primaryFontFamily"
							class="ppv__tag">{{ cluster.primaryFontFamily }}</span>
						<span class="ppv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="ppv__cluster-badges">
						<span
							v-if="cluster.hasFontLicenseDuplicateRisk"
							class="ppv__badge is-security">
							{{ cluster.maxFontRiskLevel === 'critical'
								? t('duplicatefinder', 'Font License Duplicate: CRITICAL')
								: t('duplicatefinder', 'Font Family / License Duplicate') }}
						</span>
						<span
							v-if="cluster.hasLayoutSource"
							class="ppv__badge is-keep">
							{{ t('duplicatefinder', 'Layout Source Conserved') }}
						</span>
						<span
							v-if="cluster.hasSignedPdfx4Bat"
							class="ppv__badge is-keep">
							{{ t('duplicatefinder', 'Signed PDF/X-4 BAT Conserved') }}
						</span>
						<span
							v-if="cluster.hasLicensedFontMaster"
							class="ppv__badge is-consolidate">
							{{ t('duplicatefinder', 'Licensed Font Master') }}
						</span>
						<span
							v-if="cluster.hasSupersededProofPdf"
							class="ppv__badge is-warn">
							{{ t('duplicatefinder', 'Prepress / Web Proof') }}
						</span>
						<span
							v-if="cluster.hasCmykHiresLinks"
							class="ppv__badge is-consolidate">
							{{ t('duplicatefinder', 'CMYK Press Link') }}
						</span>
					</div>
					<div class="ppv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="ppv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="ppv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="ppv__inspector">
				<header class="ppv__inspector-head">
					<div class="ppv__inspector-title-wrap">
						<h4 class="ppv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="ppv__inspector-sub">
							{{ selectedCluster.publishingTool || selectedCluster.lineageStem }} | {{ selectedCluster.prepressStage || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="ppv__inspector-actions">
						<button
							type="button"
							class="ppv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="ppv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="ppv__lineage-grid">
					<div class="ppv__lineage-item">
						<span class="ppv__lineage-label">{{ t('duplicatefinder', 'Publication Lineage & Stage') }}</span>
						<strong class="ppv__lineage-val">{{ selectedCluster.publishingTool ? `${selectedCluster.publishingTool} / ` : '' }}{{ selectedCluster.prepressStage ? `${selectedCluster.prepressStage} / ` : '' }}{{ selectedCluster.lineageStem }}</strong>
					</div>
					<div class="ppv__lineage-item">
						<span class="ppv__lineage-label">{{ t('duplicatefinder', 'Prepress & Master Conservation') }}</span>
						<strong class="ppv__lineage-val">
							{{ selectedCluster.hasLayoutSource ? t('duplicatefinder', 'Layout Master (.indd/.afpub/.qxp) Shielded') : (selectedCluster.hasSignedPdfx4Bat ? t('duplicatefinder', 'Signed PDF/X-4 BAT Shielded') : (selectedCluster.hasLicensedFontMaster ? t('duplicatefinder', 'Licensed Font Master Shielded') : t('duplicatefinder', 'Export Proof, Package Font or CMYK Link'))) }}
						</strong>
					</div>
					<div class="ppv__lineage-item">
						<span class="ppv__lineage-label">{{ t('duplicatefinder', 'Font Licensing & Layout Anchor') }}</span>
						<strong class="ppv__lineage-val">
							{{ selectedCluster.primaryFontFamily ? `${selectedCluster.primaryFontFamily} (${selectedCluster.fontFamilyClusterCount}x, ${selectedCluster.fontFamilyFormats.join('/') || 'font'})` : (selectedCluster.hasLayoutSourceAnchor ? t('duplicatefinder', 'Layout Source Anchor Verified') : t('duplicatefinder', 'No Layout Source Anchor')) }}
						</strong>
					</div>
					<div class="ppv__lineage-item">
						<span class="ppv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="ppv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="ppv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="ppv__member-card">
						<div class="ppv__member-top">
							<code class="ppv__member-path">{{ member.normalized }}</code>
							<div class="ppv__member-pills">
								<span
									v-if="member.hasFontLicenseRisk"
									class="ppv__pill is-security">
									{{ member.fontRiskLevel === 'critical'
										? t('duplicatefinder', 'FONT LICENSE RISK: CRITICAL')
										: t('duplicatefinder', 'FONT FAMILY DUPLICATE') }}
								</span>
								<span
									class="ppv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.prepressTag"
									class="ppv__pill is-consolidate">
									{{ member.prepressTag }}
								</span>
								<span
									class="ppv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="ppv__member-bottom">
							<div class="ppv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.fontFamily">{{ member.fontFamily }} / {{ member.fontWeightStyle }} ({{ member.fontFormat }})</span>
								<span v-if="member.fontLicenseReason">{{ member.fontLicenseReason }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="ppv__member-actions">
								<button
									type="button"
									class="ppv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isLayoutSource && protectLayoutSources) && !(member.isSignedPdfx4Bat && protectSignedPdfx4Bat) && !(member.isLicensedFontMaster && protectLicensedFontMasters)"
									class="ppv__override-field">
									<span class="ppv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="ppv__override-select"
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

				<div class="ppv__code-panels">
					<div class="ppv__code-box">
						<div class="ppv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="ppv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="ppv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="ppv__code-box">
						<div class="ppv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="ppv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="ppv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	PUBLISHING_PREPRESS_PRESETS,
	auditPublishingPrepressVault,
	buildPublishingPrepressCsvReport,
	buildPublishingPrepressJsonManifest,
	buildPublishingPrepressRemediationScript,
	buildPublishingPrepressSyncExcludeList,
} from '../tools/publishingPrepressVaultAuditor'

export default {
	name: 'PublishingPrepressVaultWorkbench',
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
			presetId: 'all-publishing-prepress-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-superseded-proofs-and-font-clones',
			survivorRule: 'layout-bat-font-vault-first',
			protectLayoutSources: true,
			protectSignedPdfx4Bat: true,
			protectLicensedFontMasters: true,
			requireLayoutSourceAnchor: true,
			keepRecentProofDaysInput: '0',
			minSizeKbInput: '0',
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
			return PUBLISHING_PREPRESS_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'font-license-duplicate-risk', label: this.t('duplicatefinder', 'Font Dup Risk') },
				{ id: 'layout-source-protected', label: this.t('duplicatefinder', 'Layout Master') },
				{ id: 'signed-pdfx4-bat-protected', label: this.t('duplicatefinder', 'PDF/X-4 BAT') },
				{ id: 'licensed-font-master-protected', label: this.t('duplicatefinder', 'Licensed Font') },
				{ id: 'superseded-prepress-proof', label: this.t('duplicatefinder', 'Prepress Proof') },
				{ id: 'cmyk-link-duplicate', label: this.t('duplicatefinder', 'CMYK Link') },
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
		parsedKeepRecentProofDays() {
			const trimmed = String(this.keepRecentProofDaysInput ?? '').trim()
			if (!trimmed) {
				return 0
			}
			const parsed = Number(trimmed)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
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
			return auditPublishingPrepressVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLayoutSources: this.protectLayoutSources,
				protectSignedPdfx4Bat: this.protectSignedPdfx4Bat,
				protectLicensedFontMasters: this.protectLicensedFontMasters,
				requireLayoutSourceAnchor: this.requireLayoutSourceAnchor,
				keepRecentProofDays: this.parsedKeepRecentProofDays,
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
			return buildPublishingPrepressRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildPublishingPrepressSyncExcludeList()
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
			const preset = PUBLISHING_PREPRESS_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLayoutSources = preset.protectLayoutSources
			this.protectSignedPdfx4Bat = preset.protectSignedPdfx4Bat
			this.protectLicensedFontMasters = preset.protectLicensedFontMasters
			this.requireLayoutSourceAnchor = preset.requireLayoutSourceAnchor
			this.keepRecentProofDaysInput = String(preset.keepRecentProofDays)
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
			if (this.selectedCluster && this.selectedClusterId === null) {
				this.selectedClusterId = this.selectedCluster.id
			}
			this.$set(this.memberOverrides, selectionKey, value)
		},
		formatVerdictLabel(verdict) {
			const map = {
				'layout-source-protected': this.t('duplicatefinder', 'Layout Master'),
				'signed-pdfx4-bat-protected': this.t('duplicatefinder', 'PDF/X-4 BAT'),
				'licensed-font-master-protected': this.t('duplicatefinder', 'Licensed Font'),
				'font-license-duplicate-risk': this.t('duplicatefinder', 'Font Dup Risk'),
				'superseded-prepress-proof': this.t('duplicatefinder', 'Prepress Proof'),
				'cmyk-link-duplicate': this.t('duplicatefinder', 'CMYK Link'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'font-license-duplicate-risk') {
				return 'is-security'
			}
			if (verdict === 'layout-source-protected' || verdict === 'signed-pdfx4-bat-protected' || verdict === 'licensed-font-master-protected') {
				return 'is-keep'
			}
			if (verdict === 'cmyk-link-duplicate') {
				return 'is-consolidate'
			}
			if (verdict === 'superseded-prepress-proof') {
				return 'is-reclaim'
			}
			return 'is-warn'
		},
		actionPillClass(member) {
			if (member.action === 'delete') {
				return member.hasFontLicenseRisk ? 'is-security' : 'is-reclaim'
			}
			if (member.action === 'hardlink') {
				return 'is-consolidate'
			}
			return member.shielded ? 'is-keep' : 'is-warn'
		},
		formatMemberActionLabel(member) {
			if (member.action === 'delete') {
				return (this.strategy === 'quarantine-unlicensed-fonts-and-drafts' || member.hasFontLicenseRisk)
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
				this.setNotice(this.t('duplicatefinder', 'Copied Publishing or Prepress vault file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Publishing & Prepress remediation script to clipboard.'))
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
			const csv = buildPublishingPrepressCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-publishing-prepress-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Publishing & Prepress Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildPublishingPrepressJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-publishing-prepress-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Publishing & Prepress Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.publishing-prepress-vault-workbench {
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

.ppv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.ppv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.ppv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.ppv__status-badge {
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

.ppv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ppv__tool-btn,
.ppv__seg-btn,
.ppv__primary-btn,
.ppv__load-more-btn,
.ppv__mini-btn {
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

.ppv__tool-btn:hover:not(:disabled),
.ppv__seg-btn:hover:not(:disabled),
.ppv__load-more-btn:hover:not(:disabled),
.ppv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.ppv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.ppv__tool-btn.is-primary-outline,
.ppv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.ppv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.ppv__tool-btn:focus-visible,
.ppv__seg-btn:focus-visible,
.ppv__primary-btn:focus-visible,
.ppv__load-more-btn:focus-visible,
.ppv__mini-btn:focus-visible,
.ppv__cluster-card:focus-visible,
.ppv__input:focus-visible,
.ppv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.ppv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.ppv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.ppv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.ppv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.ppv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ppv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.ppv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ppv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.ppv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.ppv__kpi-val.is-danger {
	color: var(--color-error, #b91c1c);
}

.ppv__empty-banner,
.ppv__empty-filter {
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

.ppv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.ppv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.ppv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.ppv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.ppv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.ppv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.ppv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.ppv__inputs-row {
	align-items: flex-end;
}

.ppv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.ppv__field-grow {
	flex: 1 1 180px;
}

.ppv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.ppv__input,
.ppv__override-select {
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

.ppv__num-input {
	inline-size: 96px;
}

.ppv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.ppv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.ppv__cluster-card {
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

.ppv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.ppv__cluster-top,
.ppv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.ppv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.ppv__cluster-meta,
.ppv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.ppv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.ppv__badge,
.ppv__pill {
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

.ppv__pill.is-keep,
.ppv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.ppv__pill.is-security,
.ppv__badge.is-security {
	border-color: var(--color-error, #b91c1c);
	color: var(--color-error, #b91c1c);
}

.ppv__pill.is-consolidate,
.ppv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.ppv__pill.is-warn,
.ppv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.ppv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.ppv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.ppv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.ppv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.ppv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.ppv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.ppv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.ppv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.ppv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.ppv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ppv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.ppv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.ppv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.ppv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.ppv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ppv__member-top,
.ppv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.ppv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.ppv__member-pills,
.ppv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.ppv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.ppv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.ppv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.ppv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.ppv__pre {
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

.ppv__sr-only {
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
	.ppv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.ppv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.ppv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.publishing-prepress-vault-workbench {
		padding: 10px;
	}

	.ppv__kpis,
	.ppv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.ppv__num-input {
		inline-size: 100%;
	}

	.ppv__field {
		flex: 1 1 100%;
	}
}
</style>
