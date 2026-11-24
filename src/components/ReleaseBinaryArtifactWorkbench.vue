<template>
	<section
		class="release-binary-artifact-workbench"
		role="region"
		:aria-label="t('duplicatefinder', 'Release Binary, Signed Installer and SBOM Artifact Vault Auditor')">
		<header class="rba__toolbar">
			<div class="rba__title-group">
				<h3 class="rba__title">
					{{ t('duplicatefinder', 'Release Binary, Signed Installer & SBOM Artifact Vault Auditor') }}
				</h3>
				<span
					class="rba__status-badge"
					role="status"
					aria-live="polite">
					{{ t('duplicatefinder', '{clusters} clusters / {reclaim} ({gb}) reclaimable / {anchors} GA & LTS anchors', {
						clusters: analysis.summary.totalClustersCount,
						reclaim: analysis.summary.formattedReclaimableBytes,
						gb: analysis.summary.reclaimableGb,
						anchors: analysis.summary.totalProtectedGaLtsClusters,
					}) }}
				</span>
			</div>

			<div class="rba__toolbar-actions">
				<button
					type="button"
					class="rba__tool-btn is-primary-outline"
					@click="exportAuditJson">
					<span>{{ t('duplicatefinder', 'Export Audit JSON') }}</span>
				</button>
				<button
					type="button"
					class="rba__tool-btn"
					:disabled="analysis.clusters.length === 0"
					@click="exportAuditCsv">
					<span>{{ t('duplicatefinder', 'Export CWE-1236 CSV') }}</span>
				</button>
				<button
					type="button"
					class="rba__tool-btn"
					@click="copyRemediationScript">
					<span>{{ t('duplicatefinder', 'Copy DRY_RUN=1 Script') }}</span>
				</button>
				<button
					type="button"
					class="rba__tool-btn is-close"
					aria-keyshortcuts="Shift+K"
					:title="t('duplicatefinder', 'Hide Release Binary, Signed Installer and SBOM Artifact Vault Auditor')"
					@click="$emit('close')">
					<span>{{ t('duplicatefinder', 'Hide Release Vault') }}</span>
				</button>
			</div>
		</header>

		<div
			v-if="statusNotice"
			class="rba__notice"
			:class="statusNoticeType === 'error' ? 'is-error' : 'is-success'"
			role="status"
			aria-live="polite">
			{{ statusNotice }}
		</div>

		<div class="rba__kpis">
			<div class="rba__kpi">
				<span class="rba__kpi-label">{{ t('duplicatefinder', 'Safe Release Reclaim') }}</span>
				<strong class="rba__kpi-val is-accent">
					{{ analysis.summary.formattedReclaimableBytes }} ({{ analysis.summary.reclaimableGb }} / {{ analysis.summary.totalReclaimableCopiesCount }} {{ t('duplicatefinder', 'targets') }})
				</strong>
			</div>
			<div class="rba__kpi">
				<span class="rba__kpi-label">{{ t('duplicatefinder', 'Latest GA & Signed LTS Anchors') }}</span>
				<strong class="rba__kpi-val is-warn">
					{{ analysis.summary.totalProtectedGaLtsClusters }} {{ t('duplicatefinder', 'anchored') }} / {{ analysis.summary.totalShieldedCopiesCount }} {{ t('duplicatefinder', 'shielded') }}
				</strong>
			</div>
			<div class="rba__kpi">
				<span class="rba__kpi-label">{{ t('duplicatefinder', 'Signed / SBOM / Pre-releases') }}</span>
				<strong class="rba__kpi-val">
					{{ analysis.summary.totalSignedClusters }} {{ t('duplicatefinder', 'signed') }} / {{ analysis.summary.totalSbomLinkedClusters }} {{ t('duplicatefinder', 'SBOM') }} / {{ analysis.summary.totalPrereleaseClusters }} {{ t('duplicatefinder', 'CI/RC') }}
				</strong>
			</div>
			<div class="rba__kpi">
				<span class="rba__kpi-label">{{ t('duplicatefinder', 'Raw Artifact Footprint') }}</span>
				<strong class="rba__kpi-val">
					{{ analysis.summary.formattedRawDuplicateBytes }} ({{ analysis.summary.efficiencyPct }}%)
				</strong>
			</div>
		</div>

		<div
			v-if="sourcePoolEmpty"
			class="rba__empty-banner"
			role="note">
			<div class="rba__empty-text">
				<p class="rba__empty-title">
					{{ t('duplicatefinder', 'No duplicate scan dataset loaded yet; configure GA, LTS and SBOM guards before scanning') }}
				</p>
				<p class="rba__empty-hint">
					{{ t('duplicatefinder', 'Scan storage to audit duplicate release installers (.dmg/.pkg/.msi/.exe/.AppImage/.deb/.rpm/.whl/.nupkg), detached signatures and checksums (.sig/.asc/.sha256/SHA256SUMS), and CycloneDX/SPDX SBOM manifests grouped by product, semver, arch and channel.') }}
				</p>
			</div>
			<button
				type="button"
				class="rba__primary-btn"
				@click="$emit('start-scan')">
				<span>{{ t('duplicatefinder', 'Scan storage') }}</span>
			</button>
		</div>

		<div class="rba__controls">
			<div class="rba__control-row">
				<span class="rba__control-label">{{ t('duplicatefinder', 'Release Preset') }}</span>
				<div
					class="rba__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Release binary and SBOM audit presets')">
					<button
						v-for="preset in presets"
						:key="preset.id"
						type="button"
						class="rba__seg-btn"
						:class="{ 'is-active': presetId === preset.id }"
						:aria-pressed="presetId === preset.id ? 'true' : 'false'"
						:title="preset.description"
						@click="applyPreset(preset.id)">
						<span>{{ preset.name }}</span>
					</button>
				</div>
			</div>

			<div class="rba__control-row">
				<template v-if="!sourcePoolEmpty">
					<span class="rba__control-label">{{ t('duplicatefinder', 'Scope') }}</span>
					<div
						class="rba__segments"
						role="group"
						:aria-label="t('duplicatefinder', 'Duplicate dataset scope')">
						<button
							type="button"
							class="rba__seg-btn"
							:class="{ 'is-active': scope === 'filtered' }"
							:aria-pressed="scope === 'filtered' ? 'true' : 'false'"
							@click="scope = 'filtered'">
							<span>{{ t('duplicatefinder', 'Current view ({count})', { count: filteredSourceCount }) }}</span>
						</button>
						<button
							type="button"
							class="rba__seg-btn"
							:class="{ 'is-active': scope === 'all' }"
							:aria-pressed="scope === 'all' ? 'true' : 'false'"
							@click="scope = 'all'">
							<span>{{ t('duplicatefinder', 'All loaded ({count})', { count: allSourceCount }) }}</span>
						</button>
					</div>
				</template>

				<button
					type="button"
					class="rba__seg-btn"
					:class="{ 'is-active': protectLatestGa }"
					:aria-pressed="protectLatestGa ? 'true' : 'false'"
					@click="protectLatestGa = !protectLatestGa">
					<span>{{ protectLatestGa ? t('duplicatefinder', 'Protect Latest GA: ON') : t('duplicatefinder', 'Protect Latest GA: OFF') }}</span>
				</button>

				<button
					type="button"
					class="rba__seg-btn"
					:class="{ 'is-active': protectSignedLts }"
					:aria-pressed="protectSignedLts ? 'true' : 'false'"
					@click="protectSignedLts = !protectSignedLts">
					<span>{{ protectSignedLts ? t('duplicatefinder', 'Protect Signed LTS & SBOM: ON') : t('duplicatefinder', 'Protect Signed LTS & SBOM: OFF') }}</span>
				</button>
			</div>

			<div class="rba__control-row rba__inputs-row">
				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Remediation Strategy') }}</span>
					<select v-model="strategy" class="rba__input">
						<option value="prune-superseded-prerelease-and-mirrors">{{ t('duplicatefinder', 'Prune Stale Pre-releases & Mirrors') }}</option>
						<option value="consolidate-release-vault-hardlinks">{{ t('duplicatefinder', 'Hardlink-Consolidate Release Vault') }}</option>
						<option value="prune-orphan-signatures-and-stale-sboms">{{ t('duplicatefinder', 'Prune Duplicate Signatures & SBOMs') }}</option>
					</select>
				</label>

				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Survivor Anchor') }}</span>
					<select v-model="survivorRule" class="rba__input">
						<option value="signed-lts-and-ga-vault-first">{{ t('duplicatefinder', 'Signed LTS & GA Vault first') }}</option>
						<option value="highest-semver-first">{{ t('duplicatefinder', 'Highest Semver first') }}</option>
						<option value="sbom-attested-first">{{ t('duplicatefinder', 'SBOM & Signature attested first') }}</option>
						<option value="shortest-path">{{ t('duplicatefinder', 'Shortest canonical path') }}</option>
					</select>
				</label>

				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Keep GA Versions') }}</span>
					<input
						v-model="keepPreviousGaInput"
						type="number"
						min="0"
						step="1"
						class="rba__input rba__num-input">
				</label>

				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Stale Pre-release (d)') }}</span>
					<input
						v-model="stalePrereleaseDaysInput"
						type="number"
						min="0"
						step="1"
						class="rba__input rba__num-input">
				</label>

				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Min Size (MiB)') }}</span>
					<input
						v-model="minSizeMbInput"
						type="number"
						min="0"
						step="1"
						class="rba__input rba__num-input">
				</label>

				<label class="rba__field rba__field-grow">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Filter Product, Semver, Arch or Path') }}</span>
					<input
						v-model="searchQueryInput"
						type="search"
						class="rba__input"
						:placeholder="t('duplicatefinder', 'e.g. arm64, lts, .dmg, .cdx.json, .sig')">
				</label>

				<label class="rba__field rba__field-grow">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Nextcloud Data Root') }}</span>
					<input
						v-model="dataRootInput"
						type="text"
						class="rba__input"
						placeholder="/var/www/nextcloud/data">
				</label>

				<label class="rba__field">
					<span class="rba__field-label">{{ t('duplicatefinder', 'Sort') }}</span>
					<select v-model="sortMode" class="rba__input">
						<option value="reclaim_desc">{{ t('duplicatefinder', 'Reclaimable bytes') }}</option>
						<option value="risk_desc">{{ t('duplicatefinder', 'GA & LTS risk') }}</option>
						<option value="semver_desc">{{ t('duplicatefinder', 'Highest Semver') }}</option>
						<option value="copies_desc">{{ t('duplicatefinder', 'Most duplicate copies') }}</option>
						<option value="name_asc">{{ t('duplicatefinder', 'Artifact name (A-Z)') }}</option>
					</select>
				</label>
			</div>

			<div class="rba__control-row">
				<span class="rba__control-label">{{ t('duplicatefinder', 'Artifact Family') }}</span>
				<div
					class="rba__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Release artifact family filter')">
					<button
						type="button"
						class="rba__seg-btn"
						:class="{ 'is-active': familyFilter === 'all' }"
						:aria-pressed="familyFilter === 'all' ? 'true' : 'false'"
						@click="familyFilter = 'all'">
						<span>{{ t('duplicatefinder', 'All Families ({count})', { count: analysis.summary.totalUnfilteredClustersCount }) }}</span>
					</button>
					<button
						v-for="fam in analysis.familyBreakdown"
						:key="fam.id"
						type="button"
						class="rba__seg-btn"
						:class="{ 'is-active': familyFilter === fam.id }"
						:aria-pressed="familyFilter === fam.id ? 'true' : 'false'"
						:title="fam.shortLabel"
						@click="familyFilter = fam.id">
						<span>{{ fam.label }} ({{ fam.clustersCount }})</span>
					</button>
				</div>
			</div>

			<div class="rba__control-row">
				<span class="rba__control-label">{{ t('duplicatefinder', 'Verdict') }}</span>
				<div
					class="rba__segments"
					role="group"
					:aria-label="t('duplicatefinder', 'Release verdict filter')">
					<button
						v-for="opt in verdictFilterOptions"
						:key="opt.id"
						type="button"
						class="rba__seg-btn"
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
			class="rba__empty-filter"
			role="note">
			<p class="rba__empty-title">
				{{ t('duplicatefinder', 'No release binary, signature or SBOM duplicate clusters match the active filters.') }}
			</p>
			<button
				type="button"
				class="rba__tool-btn"
				@click="resetFilters">
				<span>{{ t('duplicatefinder', 'Reset filters') }}</span>
			</button>
		</div>

		<div
			v-if="analysis.clusters.length > 0"
			class="rba__workspace">
			<div
				class="rba__cluster-list"
				role="list"
				:aria-label="t('duplicatefinder', 'Audited release artifact clusters')">
				<button
					v-for="cluster in visibleClusters"
					:key="cluster.groupKey"
					type="button"
					class="rba__cluster-card"
					:class="{ 'is-selected': selectedCluster && selectedCluster.groupKey === cluster.groupKey }"
					@click="selectedClusterKey = cluster.groupKey">
					<div class="rba__cluster-top">
						<strong class="rba__cluster-name">{{ cluster.displayName }}</strong>
						<span
							class="rba__pill"
							:class="riskPillClass(cluster.riskState)">
							{{ formatRiskLabel(cluster.riskState) }}
						</span>
					</div>
					<div class="rba__cluster-meta">
						<span class="rba__tag">{{ cluster.product }}</span>
						<span class="rba__tag">v{{ cluster.semverRaw }}</span>
						<span class="rba__tag">{{ cluster.targetArch }}</span>
						<span class="rba__tag">{{ cluster.channel.toUpperCase() }}</span>
						<span class="rba__tag">{{ cluster.formatBadge }}</span>
					</div>
					<div class="rba__cluster-badges">
						<span
							v-if="cluster.isLatestGa"
							class="rba__badge is-keep">
							{{ t('duplicatefinder', 'Latest GA') }}
						</span>
						<span
							v-if="cluster.isSignedLts"
							class="rba__badge is-danger">
							{{ t('duplicatefinder', 'Signed LTS') }}
						</span>
						<span
							v-if="cluster.hasDetachedSignature"
							class="rba__badge is-consolidate">
							{{ t('duplicatefinder', 'Signed') }}
						</span>
						<span
							v-if="cluster.hasSbomCompanion"
							class="rba__badge is-consolidate">
							{{ t('duplicatefinder', 'SBOM') }}
						</span>
					</div>
					<div class="rba__cluster-bottom">
						<span>{{ cluster.copiesCount }} {{ t('duplicatefinder', 'copies') }}</span>
						<strong class="rba__cluster-reclaim">{{ cluster.formattedReclaimableBytes }}</strong>
					</div>
				</button>

				<button
					v-if="analysis.clusters.length > visibleLimit"
					type="button"
					class="rba__load-more-btn"
					@click="visibleLimit += 25">
					<span>{{ t('duplicatefinder', 'Show more clusters ({remaining} remaining)', { remaining: analysis.clusters.length - visibleLimit }) }}</span>
				</button>
			</div>

			<div
				v-if="selectedCluster"
				class="rba__inspector">
				<header class="rba__inspector-head">
					<div class="rba__inspector-title-wrap">
						<h4 class="rba__inspector-title">
							{{ selectedCluster.displayName }}
						</h4>
						<p class="rba__inspector-sub">
							{{ selectedCluster.releaseKey }} | {{ selectedCluster.platform }} | {{ selectedCluster.familyLabel }}
						</p>
					</div>
					<div class="rba__inspector-actions">
						<button
							type="button"
							class="rba__tool-btn"
							@click="jumpToDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Open in Triage') }}</span>
						</button>
						<button
							type="button"
							class="rba__tool-btn"
							@click="compareDuplicate(selectedCluster)">
							<span>{{ t('duplicatefinder', 'Side-by-Side') }}</span>
						</button>
					</div>
				</header>

				<div class="rba__lineage-grid">
					<div class="rba__lineage-item">
						<span class="rba__lineage-label">{{ t('duplicatefinder', 'Product & Semver') }}</span>
						<strong class="rba__lineage-val">{{ selectedCluster.product }} v{{ selectedCluster.semverRaw }}</strong>
					</div>
					<div class="rba__lineage-item">
						<span class="rba__lineage-label">{{ t('duplicatefinder', 'Arch / Platform / Channel') }}</span>
						<strong class="rba__lineage-val">{{ selectedCluster.targetArch }} / {{ selectedCluster.platform }} / {{ selectedCluster.channel.toUpperCase() }}</strong>
					</div>
					<div class="rba__lineage-item">
						<span class="rba__lineage-label">{{ t('duplicatefinder', 'Supply-Chain Attestation') }}</span>
						<strong class="rba__lineage-val">
							{{ selectedCluster.hasDetachedSignature ? t('duplicatefinder', 'Signature Verified') : t('duplicatefinder', 'Unsigned') }}
							|
							{{ selectedCluster.hasSbomCompanion ? t('duplicatefinder', 'SBOM Linked') : t('duplicatefinder', 'No SBOM') }}
						</strong>
					</div>
					<div class="rba__lineage-item">
						<span class="rba__lineage-label">{{ t('duplicatefinder', 'Safe Reclaimable') }}</span>
						<strong class="rba__lineage-val is-accent">
							{{ selectedCluster.formattedReclaimableBytes }} ({{ selectedCluster.reclaimableGb }})
						</strong>
					</div>
				</div>

				<div class="rba__members-list">
					<div
						v-for="member in selectedCluster.members"
						:key="member.selectionKey"
						class="rba__member-card">
						<div class="rba__member-top">
							<code class="rba__member-path">{{ member.path }}</code>
							<div class="rba__member-pills">
								<span
									class="rba__pill"
									:class="authorityPillClass(member.authorityScore)">
									{{ t('duplicatefinder', 'Authority {score}', { score: member.authorityScore }) }}
								</span>
								<span
									class="rba__pill"
									:class="verdictPillClass(member.verdict)">
									{{ member.verdict }}
								</span>
							</div>
						</div>
						<div class="rba__member-bottom">
							<div class="rba__member-meta">
								<span>{{ member.formattedSize }}</span>
								<span>{{ member.formattedMtime }}</span>
								<span>{{ member.verdictReason }}</span>
							</div>
							<label
								v-if="member.verdict !== 'keep-canonical-survivor'"
								class="rba__override-field">
								<span class="rba__sr-only">{{ t('duplicatefinder', 'Override verdict') }}</span>
								<select
									class="rba__override-select"
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

				<div class="rba__code-panels">
					<div class="rba__code-box">
						<div class="rba__code-head">
							<strong>{{ t('duplicatefinder', 'DRY_RUN=1 POSIX Cleanup Script') }}</strong>
							<button
								type="button"
								class="rba__mini-btn"
								@click="copyRemediationScript">
								<span>{{ t('duplicatefinder', 'Copy Script') }}</span>
							</button>
						</div>
						<pre class="rba__pre"><code>{{ generatedScript }}</code></pre>
					</div>

					<div class="rba__code-box">
						<div class="rba__code-head">
							<strong>{{ t('duplicatefinder', 'Nextcloud .sync-exclude.lst Rules') }}</strong>
							<button
								type="button"
								class="rba__mini-btn"
								@click="copySyncExcludeSnippet">
								<span>{{ t('duplicatefinder', 'Copy Rules') }}</span>
							</button>
						</div>
						<pre class="rba__pre"><code>{{ generatedSyncExclude }}</code></pre>
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script>
import { copyTextSafely } from '../tools/clipboardHelper'
import {
	RELEASE_BINARY_PRESETS,
	analyzeReleaseBinaryArtifacts,
	buildReleaseBinaryCsvReport,
	buildReleaseBinaryJsonReport,
	buildReleaseBinaryRemediationScript,
	buildReleaseBinarySyncExcludeSnippet,
} from '../tools/releaseBinaryArtifactAuditor'

export default {
	name: 'ReleaseBinaryArtifactWorkbench',
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
			presetId: 'all-release-vault-audit',
			scope: 'filtered',
			familyFilter: 'all',
			verdictFilter: 'all',
			strategy: 'prune-superseded-prerelease-and-mirrors',
			survivorRule: 'signed-lts-and-ga-vault-first',
			protectLatestGa: true,
			protectSignedLts: true,
			keepPreviousGaInput: '1',
			stalePrereleaseDaysInput: '14',
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
			return RELEASE_BINARY_PRESETS
		},
		verdictFilterOptions() {
			return [
				{ id: 'all', label: this.t('duplicatefinder', 'All Verdicts') },
				{ id: 'reclaimable', label: this.t('duplicatefinder', 'Reclaimable') },
				{ id: 'latest-ga', label: this.t('duplicatefinder', 'Latest GA') },
				{ id: 'signed-lts', label: this.t('duplicatefinder', 'Signed LTS') },
				{ id: 'signature-anchor', label: this.t('duplicatefinder', 'Signed / Checksums') },
				{ id: 'sbom-manifest', label: this.t('duplicatefinder', 'SBOM Linked') },
				{ id: 'prerelease', label: this.t('duplicatefinder', 'Pre-release / CI') },
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
		parsedKeepPreviousGa() {
			const trimmed = String(this.keepPreviousGaInput ?? '').trim()
			if (!trimmed) {
				return 1
			}
			const parsed = Number.parseInt(trimmed, 10)
			return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
		},
		parsedStalePrereleaseDays() {
			const trimmed = String(this.stalePrereleaseDaysInput ?? '').trim()
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
			return analyzeReleaseBinaryArtifacts(this.activePool, {
				familyFilter: this.familyFilter,
				verdictFilter: this.verdictFilter,
				sortMode: this.sortMode,
				strategy: this.strategy,
				survivorRule: this.survivorRule,
				protectLatestGa: this.protectLatestGa,
				protectSignedLts: this.protectSignedLts,
				keepPreviousGaVersions: this.parsedKeepPreviousGa,
				stalePrereleaseDays: this.parsedStalePrereleaseDays,
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
			return buildReleaseBinaryRemediationScript(this.analysis, {
				dataRoot: this.dataRootInput,
			})
		},
		generatedSyncExclude() {
			return buildReleaseBinarySyncExcludeSnippet(this.analysis)
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
			const preset = RELEASE_BINARY_PRESETS.find(p => p.id === presetId)
			if (!preset) {
				return
			}
			this.presetId = preset.id
			this.familyFilter = preset.familyFilter
			this.strategy = preset.strategy
			this.survivorRule = preset.survivorRule
			this.protectLatestGa = preset.protectLatestGa
			this.protectSignedLts = preset.protectSignedLts
			this.keepPreviousGaInput = String(preset.keepPreviousGaVersions)
			this.stalePrereleaseDaysInput = String(preset.stalePrereleaseDays)
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
				'prerelease-reclaimable': this.t('duplicatefinder', 'Stale Pre-release'),
				'signed-lts-protected': this.t('duplicatefinder', 'Signed LTS Protected'),
				'latest-ga-protected': this.t('duplicatefinder', 'Latest GA Protected'),
				'sbom-compliance-anchored': this.t('duplicatefinder', 'SBOM Anchored'),
				'signature-anchored': this.t('duplicatefinder', 'Signature Anchored'),
				shielded: this.t('duplicatefinder', 'Shielded'),
			}
			return map[riskState] || riskState
		},
		riskPillClass(riskState) {
			if (riskState === 'signed-lts-protected' || riskState === 'latest-ga-protected') {
				return 'is-danger'
			}
			if (riskState === 'sbom-compliance-anchored' || riskState === 'signature-anchored' || riskState === 'shielded') {
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
			if (verdict === 'blocked-signed-lts-release' || verdict === 'blocked-latest-ga-release') {
				return 'is-danger'
			}
			if (verdict.startsWith('blocked-')) {
				return 'is-warn'
			}
			if (verdict === 'consolidate-hardlink-mirror') {
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
				this.setNotice(this.t('duplicatefinder', 'Copied DRY_RUN=1 Release & SBOM Vault remediation script to clipboard.'))
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
			const csv = buildReleaseBinaryCsvReport(this.analysis)
			if (this.triggerDownload(csv, 'duplicatefinder-release-binary-sbom-audit.csv', 'text/csv;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported CWE-1236-safe Release & SBOM Vault CSV audit.'))
			}
		},
		exportAuditJson() {
			const json = buildReleaseBinaryJsonReport(this.analysis)
			if (this.triggerDownload(json, 'duplicatefinder-release-binary-sbom-audit.json', 'application/json;charset=utf-8')) {
				this.setNotice(this.t('duplicatefinder', 'Exported Release & SBOM Vault JSON audit manifest.'))
			}
		},
	},
}
</script>

<style scoped>
.release-binary-artifact-workbench {
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

.rba__toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding-block-end: 10px;
	border-block-end: 1px solid var(--color-border);
}

.rba__title-group {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
	min-inline-size: 0;
}

.rba__title {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 700;
	line-height: 1.3;
	overflow-wrap: anywhere;
}

.rba__status-badge {
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

.rba__toolbar-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rba__tool-btn,
.rba__seg-btn,
.rba__primary-btn,
.rba__load-more-btn,
.rba__mini-btn {
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

.rba__tool-btn:hover:not(:disabled),
.rba__seg-btn:hover:not(:disabled),
.rba__load-more-btn:hover:not(:disabled),
.rba__mini-btn:hover:not(:disabled) {
	background-color: var(--color-background-dark);
	border-color: var(--color-primary-element);
}

.rba__tool-btn:disabled {
	opacity: 0.55;
	cursor: not-allowed;
}

.rba__tool-btn.is-primary-outline,
.rba__seg-btn.is-active {
	background-color: var(--color-primary-element-light);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-light-text, var(--color-main-text));
}

.rba__primary-btn {
	background-color: var(--color-primary-element);
	border-color: var(--color-primary-element);
	color: var(--color-primary-element-text, #fff);
}

.rba__tool-btn:focus-visible,
.rba__seg-btn:focus-visible,
.rba__primary-btn:focus-visible,
.rba__load-more-btn:focus-visible,
.rba__mini-btn:focus-visible,
.rba__cluster-card:focus-visible,
.rba__input:focus-visible,
.rba__override-select:focus-visible {
	outline: 2px solid var(--color-primary-element);
	outline-offset: 2px;
}

.rba__notice {
	padding-block: 8px;
	padding-inline: 12px;
	border-radius: 6px;
	font-size: 0.85rem;
	font-weight: 600;
	border: 1px solid var(--color-border);
}

.rba__notice.is-success {
	background-color: var(--color-background-hover);
	border-color: var(--color-success, #2d8a4e);
}

.rba__notice.is-error {
	background-color: var(--color-background-hover);
	border-color: var(--color-error, #b91c1c);
}

.rba__kpis {
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	gap: 10px;
}

.rba__kpi {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rba__kpi-label {
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
}

.rba__kpi-val {
	font-size: 0.92rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rba__kpi-val.is-accent {
	color: var(--color-primary-element);
}

.rba__kpi-val.is-warn {
	color: var(--color-warning-text, var(--color-main-text));
}

.rba__empty-banner,
.rba__empty-filter {
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

.rba__empty-text {
	flex: 1 1 240px;
	min-inline-size: 0;
}

.rba__empty-title {
	margin: 0 0 4px;
	font-weight: 700;
	font-size: 0.92rem;
}

.rba__empty-hint {
	margin: 0;
	font-size: 0.84rem;
	color: var(--color-text-maxcontrast);
}

.rba__controls {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
}

.rba__control-row {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	min-inline-size: 0;
}

.rba__control-label {
	font-size: 0.8rem;
	font-weight: 700;
	color: var(--color-text-maxcontrast);
	min-inline-size: 96px;
}

.rba__segments {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	min-inline-size: 0;
}

.rba__inputs-row {
	align-items: flex-end;
}

.rba__field {
	display: flex;
	flex-direction: column;
	gap: 4px;
	min-inline-size: 0;
}

.rba__field-grow {
	flex: 1 1 180px;
}

.rba__field-label {
	font-size: 0.78rem;
	font-weight: 600;
	color: var(--color-text-maxcontrast);
}

.rba__input,
.rba__override-select {
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

.rba__num-input {
	inline-size: 96px;
}

.rba__workspace {
	display: grid;
	grid-template-columns: minmax(0, 360px) minmax(0, 1fr);
	gap: 12px;
	min-inline-size: 0;
}

.rba__cluster-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-block-size: 640px;
	overflow-y: auto;
	min-inline-size: 0;
}

.rba__cluster-card {
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

.rba__cluster-card.is-selected {
	border-color: var(--color-primary-element);
	background-color: var(--color-primary-element-light);
}

.rba__cluster-top,
.rba__cluster-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 6px;
}

.rba__cluster-name {
	font-size: 0.88rem;
	overflow-wrap: anywhere;
}

.rba__cluster-meta,
.rba__cluster-badges {
	display: flex;
	flex-wrap: wrap;
	gap: 5px;
}

.rba__tag {
	padding-block: 2px;
	padding-inline: 6px;
	border-radius: 4px;
	border: 1px solid var(--color-border);
	background-color: var(--color-background-hover);
	font-family: monospace;
	font-size: 0.75rem;
}

.rba__badge,
.rba__pill {
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

.rba__pill.is-keep,
.rba__badge.is-keep {
	border-color: var(--color-success, #2d8a4e);
}

.rba__pill.is-danger,
.rba__badge.is-danger {
	border-color: var(--color-error, #b91c1c);
}

.rba__pill.is-consolidate,
.rba__badge.is-consolidate {
	border-color: var(--color-primary-element);
}

.rba__pill.is-warn,
.rba__badge.is-warn {
	border-color: var(--color-warning, #b45309);
}

.rba__cluster-reclaim {
	font-family: monospace;
	font-size: 0.84rem;
}

.rba__inspector {
	display: flex;
	flex-direction: column;
	gap: 12px;
	padding: 12px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-background-hover);
	min-inline-size: 0;
}

.rba__inspector-head {
	display: flex;
	flex-wrap: wrap;
	align-items: flex-start;
	justify-content: space-between;
	gap: 10px;
	padding-block-end: 8px;
	border-block-end: 1px solid var(--color-border);
}

.rba__inspector-title-wrap {
	min-inline-size: 0;
	flex: 1 1 220px;
}

.rba__inspector-title {
	margin: 0 0 4px;
	font-size: 0.96rem;
	font-weight: 700;
	overflow-wrap: anywhere;
}

.rba__inspector-sub {
	margin: 0;
	font-size: 0.8rem;
	font-family: monospace;
	color: var(--color-text-maxcontrast);
	overflow-wrap: anywhere;
}

.rba__inspector-actions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.rba__lineage-grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
}

.rba__lineage-item {
	display: flex;
	flex-direction: column;
	gap: 2px;
	padding: 8px 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rba__lineage-label {
	font-size: 0.74rem;
	color: var(--color-text-maxcontrast);
}

.rba__lineage-val {
	font-size: 0.84rem;
	overflow-wrap: anywhere;
}

.rba__lineage-val.is-accent {
	color: var(--color-primary-element);
}

.rba__members-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
	min-inline-size: 0;
}

.rba__member-card {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rba__member-top,
.rba__member-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.rba__member-path {
	font-size: 0.8rem;
	overflow-wrap: anywhere;
	min-inline-size: 0;
	flex: 1 1 200px;
}

.rba__member-pills {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.rba__member-meta {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	font-size: 0.78rem;
	color: var(--color-text-maxcontrast);
	min-inline-size: 0;
}

.rba__code-panels {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 10px;
	min-inline-size: 0;
}

.rba__code-box {
	display: flex;
	flex-direction: column;
	gap: 6px;
	padding: 10px;
	border: 1px solid var(--color-border);
	border-radius: 6px;
	background-color: var(--color-main-background);
	min-inline-size: 0;
}

.rba__code-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	font-size: 0.82rem;
}

.rba__pre {
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

.rba__sr-only {
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
	.rba__kpis {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.rba__workspace {
		grid-template-columns: minmax(0, 1fr);
	}

	.rba__code-panels {
		grid-template-columns: minmax(0, 1fr);
	}
}

@media (max-width: 640px) {
	.release-binary-artifact-workbench {
		padding: 10px;
	}

	.rba__kpis,
	.rba__lineage-grid {
		grid-template-columns: minmax(0, 1fr);
	}

	.rba__num-input {
		inline-size: 100%;
	}

	.rba__field {
		flex: 1 1 100%;
	}
}
</style>
