<template>
	<section
		class="mobile-build-vault-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Mobile App Build, iOS/Android Artifacts and Crash Symbol Vault Auditor')">
		<header class="mbv__toolbar">
			<div class="mbv__title-group">
				<h3 class="mbv__title">
					{{ t('duplicatefinder', 'Mobile App Build, iOS/Android Artifacts & Crash Symbol Vault Auditor') }}
				</h3>
				<span
					class="mbv__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {store} store, {symbols} symbols, {keys} keystores, {caches} caches', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						store: analysis.summary.totalSignedStoreClusters,
						symbols: analysis.summary.totalProdSymbolClusters,
						keys: analysis.summary.totalKeystoreClusters,
						caches: analysis.summary.totalCacheClusters,
					}) }}
				</span>
			</div>

			<div class="mbv__toolbar-actions">
				<button
					type="button"
					class="mbv__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn"
					@click="copySyncExcludeSnippet">
					<span>{{ t('duplicatefinder', 'Copy .sync-exclude.lst') }}</span>
				</button>
				<button
					type="button"
					class="mbv__tool-btn is-close"
					aria-keyshortcuts="Shift+F3"
					:title="t('duplicatefinder', 'Hide Mobile App Build, iOS/Android Artifacts and Crash Symbol Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Mobile Build Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="mbv__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="mbv__kpis">
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Safe Cache & Beta Reclaim') }}</span>
				<strong class="mbv__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Conserved Releases, Symbols & Keys') }}</span>
				<strong class="mbv__kpi-val is-warn">
					{{ analysis.summary.totalSignedStoreClusters }} {{ t('duplicatefinder', 'store') }} / {{ analysis.summary.totalProdSymbolClusters }} {{ t('duplicatefinder', 'symbols') }} / {{ analysis.summary.totalKeystoreClusters }} {{ t('duplicatefinder', 'keystores') }}
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Beta/CI & Regenerable Caches') }}</span>
				<strong class="mbv__kpi-val">
					{{ analysis.summary.totalBetaCiClusters }} {{ t('duplicatefinder', 'beta/CI') }} / {{ analysis.summary.totalCacheClusters }} {{ t('duplicatefinder', 'caches') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="mbv__kpi">
				<span class="mbv__kpi-label">{{ t('duplicatefinder', 'Raw Mobile Build Footprint') }}</span>
				<strong class="mbv__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="mbv__empty-banner"
			role="note">
			<div class="mbv__empty-text">
				<p class="mbv__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure signed store release, prod symbol vault, and keystore shields before scanning') }}
				</p>
				<p class="mbv__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit mobile packages (.ipa, .apk, .aab, .xcarchive), crash symbols (.dSYM.zip, mapping.txt, proguard/), signing keystores (.jks, .p12, .mobileprovision, .p8), and regenerable caches (DerivedData/, .gradle/, build/, Pods/).') }}
				</p>
			</div>
			<button
				type="button"
				class="mbv__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="mbv__controls">
			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Vault Preset') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mobile build and crash symbol presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="mbv__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="mbv__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="mbv__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="mbv__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="mbv__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectSignedStoreReleases }"
					:aria-pressed="protectSignedStoreReleases ? 'true' : 'false'"
					@click="protectSignedStoreReleases = !protectSignedStoreReleases">
					<span>{{ protectSignedStoreReleases ? t('duplicatefinder', 'Shield Store Releases: ON') : t('duplicatefinder', 'Shield Store Releases: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectProdSymbols }"
					:aria-pressed="protectProdSymbols ? 'true' : 'false'"
					@click="protectProdSymbols = !protectProdSymbols">
					<span>{{ protectProdSymbols ? t('duplicatefinder', 'Shield Prod Symbols: ON') : t('duplicatefinder', 'Shield Prod Symbols: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': protectSigningKeystores }"
					:aria-pressed="protectSigningKeystores ? 'true' : 'false'"
					@click="protectSigningKeystores = !protectSigningKeystores">
					<span>{{ protectSigningKeystores ? t('duplicatefinder', 'Shield Keystores/.p12: ON') : t('duplicatefinder', 'Shield Keystores/.p12: OFF') }}</span>
				</button>

				<button
					type="button"
					class="mbv__seg-btn"
					:class="{ 'is-active': requireVerifiedReleaseAnchor }"
					:aria-pressed="requireVerifiedReleaseAnchor ? 'true' : 'false'"
					@click="requireVerifiedReleaseAnchor = !requireVerifiedReleaseAnchor">
					<span>{{ requireVerifiedReleaseAnchor ? t('duplicatefinder', 'Require Release Anchor: ON') : t('duplicatefinder', 'Require Release Anchor: OFF') }}</span>
				</button>
			</div>

			<div class="mbv__control-row mbv__inputs-row">
				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="mbv__input">
						<option value="prune-caches-and-beta">{{ t('duplicatefinder', 'Prune Caches & Beta (Keep Store, Symbols & Keys)') }}</option>
						<option value="hardlink-immutable-artifacts">{{ t('duplicatefinder', 'Hardlink Immutable Packages/dSYMs (Block Caches & Keys)') }}</option>
						<option value="quarantine-beta-and-caches">{{ t('duplicatefinder', 'Quarantine Beta Builds & Regenerable Caches Only') }}</option>
					</select>
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="mbv__input">
						<option value="prod-release-and-keystore-first">{{ t('duplicatefinder', 'Store Releases, Prod Symbols & Keystores first') }}</option>
						<option value="oldest-vault-first">{{ t('duplicatefinder', 'Oldest vault mtime first') }}</option>
						<option value="newest-signed-release">{{ t('duplicatefinder', 'Newest signed release mtime first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical vault path') }}</option>
					</select>
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Build Grace (d)') }}</span>
					<input
						v-model="keepRecentBuildDaysInput"
						type="number"
						min="0"
						step="1"
						class="mbv__input mbv__num-input">
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Min Size (KiB)') }}</span>
					<input
						v-model="minSizeKbInput"
						type="number"
						min="0"
						step="1"
						class="mbv__input mbv__num-input">
				</label>

				<label class="mbv__field mbv__field-grow">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Filter Platform, Version, Package, Symbol or Cache Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="mbv__input"
						:placeholder="t('duplicatefinder', 'e.g. iOS, Android, v2.4.0, ipa, aab, dSYM, mapping.txt, DerivedData, jks')">
				</label>

				<label class="mbv__field">
					<span class="mbv__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="mbv__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'Mobile vault priority') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact filename (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Artifact Family') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mobile build and crash symbol family filter')">
					<button
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="mbv__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="mbv__control-row">
				<span class="mbv__control-label">{{ t('duplicatefinder', 'Governance') }}</span>
				<div
					class="mbv__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Mobile build governance verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="mbv__seg-btn"
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
			class="mbv__empty-filter"
			role="note">
			<p class="mbv__empty-title">
				{{ t('duplicatefinder', 'No mobile packages, crash symbols, keystores, or build caches match the active filters.') }}
			</p>
			<button
				type="button"
				class="mbv__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="mbv__workspace">
			<div
				class="mbv__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited Mobile App Build and Crash Symbol clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="String(cluster.id)"
					type="button"
					class="mbv__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.id === cluster.id }"
					@click="selectedClusterId = cluster.id">
					<div class="mbv__cluster-top">
						<strong class="mbv__cluster-name">{{ cluster.name }}</strong>
						<span
							class="mbv__pill"
							:class="verdictPillClass(cluster.clusterVerdict)">
							{{ formatVerdictLabel(cluster.clusterVerdict) }}
						</span>
					</div>
					<div class="mbv__cluster-meta">
						<span
							v-if="cluster.mobilePlatform"
							class="mbv__tag">{{ cluster.mobilePlatform }}</span>
						<span
							v-if="cluster.buildVersion"
							class="mbv__tag">{{ cluster.buildVersion }}</span>
						<span class="mbv__tag">{{ cluster.mobileLineageStem || cluster.name }}</span>
						<span class="mbv__tag">{{ cluster.familyLabel }}</span>
					</div>
					<div class="mbv__cluster-badges">
						<span
							v-if="cluster.hasSigningKeystore"
							class="mbv__badge is-danger">
							{{ t('duplicatefinder', 'Signing Keystore / Profile') }}
						</span>
						<span
							v-if="cluster.hasSignedStoreRelease"
							class="mbv__badge is-danger">
							{{ t('duplicatefinder', 'Signed Store Release') }}
						</span>
						<span
							v-if="cluster.hasProdSymbolVault"
							class="mbv__badge is-keep">
							{{ t('duplicatefinder', 'Prod dSYM / ProGuard Vault') }}
						</span>
						<span
							v-if="cluster.hasBetaCiIntermediate"
							class="mbv__badge is-consolidate">
							{{ t('duplicatefinder', 'Beta / CI Intermediate') }}
						</span>
						<span
							v-if="cluster.hasRegenerableBuildCache"
							class="mbv__badge is-warn">
							{{ t('duplicatefinder', 'Regenerable Build Cache') }}
						</span>
					</div>
					<div class="mbv__cluster-bottom">
						<span>{{ cluster.copyCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="mbv__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="mbv__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="mbv__inspector">
				<header class="mbv__inspector-head">
					<div class="mbv__inspector-title-wrap">
						<h4 class="mbv__inspector-title">
							{{ selectedCluster.name }}
						</h4>
						<p class="mbv__inspector-sub">
							{{ selectedCluster.mobilePlatform || selectedCluster.mobileLineageStem }} | {{ selectedCluster.buildVersion || selectedCluster.familyLabel }} | {{ selectedCluster.formattedUnitBytes }}
						</p>
					</div>
					<div class="mbv__inspector-actions">
						<button
							type="button"
							class="mbv__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="mbv__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="mbv__lineage-grid">
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Platform & Build Lineage') }}</span>
						<strong class="mbv__lineage-val">{{ selectedCluster.mobilePlatform ? `${selectedCluster.mobilePlatform} / ` : '' }}{{ selectedCluster.buildVersion ? `${selectedCluster.buildVersion} / ` : '' }}{{ selectedCluster.mobileLineageStem }}</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Release & Keystore Conservation') }}</span>
						<strong class="mbv__lineage-val">
							{{ selectedCluster.hasSigningKeystore ? t('duplicatefinder', 'Signing Keystore / Provisioning Shielded') : (selectedCluster.hasSignedStoreRelease ? t('duplicatefinder', 'Signed Store Release Shielded') : (selectedCluster.hasProdSymbolVault ? t('duplicatefinder', 'Prod dSYM / ProGuard Symbol Vault Shielded') : t('duplicatefinder', 'Beta/CI Intermediate or Regenerable Cache'))) }}
						</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Release Anchor & Provenance Tags') }}</span>
						<strong class="mbv__lineage-val">
							{{ selectedCluster.hasVerifiedReleaseAnchor ? t('duplicatefinder', 'Verified Release/Symbol Anchor') : t('duplicatefinder', 'No Release Anchor') }} | {{ selectedCluster.buildTags.length > 0 ? selectedCluster.buildTags.join(', ') : t('duplicatefinder', 'Standard mobile build artifact') }}
						</strong>
					</div>
					<div class="mbv__lineage-item">
						<span class="mbv__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="mbv__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableTargetsCount }} {{ t('duplicatefinder', 'targets') }})
						</strong>
					</div>
				</div>

				<div class="mbv__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.key"
						class="mbv__member-card">
						<div class="mbv__member-top">
							<code class="mbv__member-path">{{ member.normalized }}</code>
							<div class="mbv__member-pills">
								<span
									class="mbv__pill"
									:class="verdictPillClass(member.governanceTier)">
									{{ member.artifactKind }}
								</span>
								<span
									v-if="member.buildTag"
									class="mbv__pill is-consolidate">
									{{ member.buildTag }}
								</span>
								<span
									class="mbv__pill"
									:class="actionPillClass(member)">
									{{ formatMemberActionLabel(member) }}
								</span>
							</div>
						</div>
						<div class="mbv__member-bottom">
							<div class="mbv__member-meta">
								<span>{{ formatMemberSize(member.size) }}</span>
								<span v-if="member.formattedMtime">{{ member.formattedMtime }}</span>
								<span>{{ member.vaultRole }}</span>
								<span v-if="member.protectedReason">{{ member.protectedReason }}</span>
							</div>
							<div class="mbv__member-actions">
								<button
									type="button"
									class="mbv__mini-btn"
									@click="copyMemberPath(member.normalized)">
									<span>{{ t('duplicatefinder', 'Copy Path') }}</span>
								</button>
								<label
									v-if="!member.isSurvivor && !(member.isSigningKeystore && protectSigningKeystores) && !(member.isSignedStoreRelease && protectSignedStoreReleases) && !(member.isProdSymbolVault && protectProdSymbols)"
									class="mbv__override-field">
									<span class="mbv__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
									<select
										class="mbv__override-select"
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

				<div class="mbv__code-panels">
					<div class="mbv__code-box">
						<div class="mbv__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="mbv__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="mbv__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="mbv__code-box">
						<div class="mbv__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="mbv__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="mbv__pre"><code>{{ generatedSyncExclude }}</code></pre>
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
	MOBILE_BUILD_PRESETS,
	auditMobileBuildVault,
	buildMobileBuildCsvReport,
	buildMobileBuildJsonManifest,
	buildMobileBuildRemediationScript,
	buildMobileBuildSyncExcludeList,
} from '../tools/mobileBuildVaultAuditor'

export default {
	name: 'MobileBuildVaultWorkbench',
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
			presetId: 'all-mobile-build-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-caches-and-beta',
			survivorRule: 'prod-release-and-keystore-first',
			protectSignedStoreReleases: true,
			protectProdSymbols: true,
			protectSigningKeystores: true,
			requireVerifiedReleaseAnchor: true,
			keepRecentBuildDaysInput: '0',
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
			return MOBILE_BUILD_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'signed-store-release-protected', label: this.t('duplicatefinder', 'Store Release') },
				{ id: 'prod-symbol-vault-protected', label: this.t('duplicatefinder', 'Prod Symbols') },
				{ id: 'signing-keystore-protected', label: this.t('duplicatefinder', 'Keystore / Profile') },
				{ id: 'beta-ci-intermediate-build', label: this.t('duplicatefinder', 'Beta / CI Build') },
				{ id: 'regenerable-build-cache', label: this.t('duplicatefinder', 'Build Cache') },
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
		parsedKeepRecentBuildDays() {
			const trimmed = String(this.keepRecentBuildDaysInput ?? '').trim()
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
			return auditMobileBuildVault(this.activePool, {
				presetId: this.presetId,
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectSignedStoreReleases: this.protectSignedStoreReleases,
				protectProdSymbols: this.protectProdSymbols,
				protectSigningKeystores: this.protectSigningKeystores,
				requireVerifiedReleaseAnchor: this.requireVerifiedReleaseAnchor,
				keepRecentBuildDays: this.parsedKeepRecentBuildDays,
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
			return buildMobileBuildRemediationScript(this.analysis)
		},
		generatedSyncExclude() {
			return buildMobileBuildSyncExcludeList()
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
			const preset = MOBILE_BUILD_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectSignedStoreReleases = preset.protectSignedStoreReleases
			this.protectProdSymbols = preset.protectProdSymbols
			this.protectSigningKeystores = preset.protectSigningKeystores
			this.requireVerifiedReleaseAnchor = preset.requireVerifiedReleaseAnchor
			this.keepRecentBuildDaysInput = String(preset.keepRecentBuildDays)
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
				'signing-keystore-protected': this.t('duplicatefinder', 'Keystore / Profile'),
				'signed-store-release-protected': this.t('duplicatefinder', 'Store Release'),
				'prod-symbol-vault-protected': this.t('duplicatefinder', 'Prod Symbols'),
				'beta-ci-intermediate-build': this.t('duplicatefinder', 'Beta / CI Build'),
				'regenerable-build-cache': this.t('duplicatefinder', 'Build Cache'),
			}
			return map[verdict] || verdict
		},
		verdictPillClass(verdict) {
			if (verdict === 'signing-keystore-protected' || verdict === 'signed-store-release-protected') {
				return 'is-danger'
			}
			if (verdict === 'prod-symbol-vault-protected') {
				return 'is-keep'
			}
			if (verdict === 'beta-ci-intermediate-build') {
				return 'is-consolidate'
			}
			if (verdict === 'regenerable-build-cache') {
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
				return this.strategy === 'quarantine-beta-and-caches'
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
				this.setNotice(this.t('duplicatefinder', 'Copied mobile build or symbol file path to clipboard.'))
			} else {
				this.setNotice(this.t('duplicatefinder', 'Unable to copy path to clipboard.'), 'error')
			}
		},
		async copyRemediationScript() {
			const ok = await copyTextSafely(this.generatedScript)
			if (ok) {
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Mobile Build & Crash Symbol remediation script to clipboard.'))
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
			const csv = buildMobileBuildCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-mobile-build-vault-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Mobile Build & Crash Symbol Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildMobileBuildJsonManifest(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-mobile-build-vault-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Mobile Build & Crash Symbol Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.mobile-build-vault-workbench {
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

.mbv__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.mbv__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.mbv__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.mbv__status-badge {
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

.mbv__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mbv__tool-btn,
.mbv__seg-btn,
.mbv__primary-btn,
.mbv__load-more-btn,
.mbv__mini-btn {
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

.mbv__tool-btn:hover:not(:disabled),
.mbv__seg-btn:hover:not(:disabled),
.mbv__load-more-btn:hover:not(:disabled),
.mbv__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.mbv__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.mbv__tool-btn.is-primary-outline,
.mbv__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.mbv__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.mbv__tool-btn:focus-visible,
.mbv__seg-btn:focus-visible,
.mbv__primary-btn:focus-visible,
.mbv__load-more-btn:focus-visible,
.mbv__mini-btn:focus-visible,
.mbv__cluster-card:focus-visible,
.mbv__input:focus-visible,
.mbv__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.mbv__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.mbv__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.mbv__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.mbv__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.mbv__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mbv__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.mbv__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mbv__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.mbv__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.mbv__empty-banner,
.mbv__empty-filter {
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

.mbv__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.mbv__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.mbv__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.mbv__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.mbv__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.mbv__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.mbv__inputs-row {
	align-items: flex-end;
}

.mbv__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.mbv__field-grow {
	flex: 1 1 180px;
}

.mbv__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.mbv__input,
.mbv__override-select {
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

.mbv__num-input {
	inline-size: 96px;
}

.mbv__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.mbv__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.mbv__cluster-card {
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

.mbv__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.mbv__cluster-top,
.mbv__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.mbv__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.mbv__cluster-meta,
.mbv__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.mbv__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.mbv__badge,
.mbv__pill {
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

.mbv__pill.is-keep,
.mbv__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.mbv__pill.is-danger,
.mbv__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.mbv__pill.is-consolidate,
.mbv__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.mbv__pill.is-warn,
.mbv__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.mbv__pill.is-reclaim {
	border-color: var(--color-primary-element);
}

.mbv__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.mbv__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.mbv__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.mbv__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.mbv__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.mbv__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.mbv__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.mbv__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.mbv__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.mbv__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.mbv__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.mbv__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.mbv__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__member-top,
.mbv__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.mbv__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.mbv__member-pills,
.mbv__member-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.mbv__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.mbv__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.mbv__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.mbv__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.mbv__pre {
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

.mbv__sr-only {
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
	.mbv__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.mbv__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.mobile-build-vault-workbench {
		padding: 10px;
	}

	.mbv__kpis,
	.mbv__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.mbv__num-input {
		inline-size: 100%;
	}

	.mbv__field {
		flex: 1 1 100%;
	}
}
</style>
